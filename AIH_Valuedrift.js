/*:
 * @plugindesc AI Hero Framework - Value Drift v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - VALUE DRIFT
 * ============================================================================
 *
 * The gap this closes: AIH.PersonalityDrift.reinforce() can only ever
 * touch AIH.Personality traits (it explicitly rejects anything that
 * isn't a member of AIH.Personality.TRAITS) - AIH.Values never moves
 * through any mechanism at all. That's deliberate for the ordinary case:
 * MINIGAME_HANDOFF.md Section 3 explicitly calls the resulting gap
 * between Values.modesty (what she still believes in, in the abstract)
 * and Personality.inhibition (what she actually does) "the interesting,
 * intended case," not a bug to fix.
 *
 * But a gap that NEVER closes, no matter how long or how deeply it's
 * sustained, isn't right either - a person whose actual behavior has
 * been genuinely, deeply reshaped for long enough usually does start to
 * actually believe differently too, not just act differently while
 * still consciously disagreeing forever. This module is that slower,
 * rarer, much harder-won layer underneath ordinary personality drift.
 *
 * ============================================================================
 *
 * WHY THIS ISN'T JUST "MORE reinforce() CALLS"
 *
 * AIH.PersonalityDrift already has its own two-phase mechanic (Section 6
 * of the handoff): a reward-gated streak builds a self_narrative belief,
 * and once that belief's confidence crosses its own internalization
 * threshold (0.65), the trait+direction is "internalized" - reinforce()
 * starts nudging it even when unrewarded. That's the behavioral layer,
 * already built, already correct, not touched by this module.
 *
 * IMPORTANT MECHANICAL DETAIL, found by actually reading
 * AIH_PersonalityDrift.js's reinforce() rather than assuming: the belief-
 * confidence-raising step only runs inside its own "not yet internalized"
 * branch. Once internalized, that whole branch - streak bookkeeping AND
 * the belief update - stops running for that trait+direction, forever.
 * Combined with beliefConfidenceStep (0.12) and internalizationConfidence
 * (0.65), the linked belief ALWAYS freezes at exactly 0.72 the moment
 * internalization first triggers, and can never move again through
 * ordinary reinforce() calls. An earlier draft of this module gated on
 * that belief's confidence continuing to climb past 0.85 - which is
 * mathematically unreachable given the above, so it would never have
 * fired. This module tracks its OWN counter instead: how many further
 * REWARDED reinforce() calls have happened for that trait+direction
 * SINCE it internalized (see checkForShift's wasRewarded parameter -
 * the caller already knows this, since they're the one who set
 * options.rewarded on the original reinforce() call). The frozen belief
 * confidence is still surfaced in results/logging as useful context, it
 * just isn't what gates anything.
 *
 * ============================================================================
 *
 * MAPPED PAIRS (deliberately small, deliberately not a mapping for every
 * trait - only pairs with a genuinely clean semantic relationship;
 * forcing a weak analogy for the sake of completeness isn't worth it)
 *
 *     inhibition    <-> modesty     (the exact pair the handoff itself
 *                                    names as the intended divergence)
 *     independence  <-> freedom     (both about self-direction/autonomy)
 *     pride         <-> dignity     (both about self-worth/standing)
 *
 * Same-direction, not inverted, for all three: a trait drifting toward
 * its high pole and staying there deeply enough pulls the paired value
 * toward ITS high pole too, and likewise for the low pole. Repeatedly
 * swallowing her pride and having it work out doesn't just make her
 * behave less proudly (Personality.pride drift, already handled) - if
 * it goes deep enough, she can eventually stop believing her own dignity
 * matters as much as she once did (Values.dignity), which is a real,
 * heavier thing than the behavioral drift alone.
 *
 * ============================================================================
 *
 * INTEGRATION
 *
 * AIH.ValueDrift.checkForShift(trait, direction, wasRewarded) is meant to
 * be called right after any AIH.PersonalityDrift.reinforce(trait,
 * direction, options) call whose trait is one of the three mapped above -
 * the same place a minigame already calls its own outcome-reporting
 * helper - passing the SAME rewarded value the caller already passed
 * into options.rewarded on that reinforce() call. It is a no-op (cheap,
 * safe to call unconditionally) for any unmapped trait or any trait that
 * hasn't internalized yet, so callers don't need to check either
 * condition themselves first.
 *
 * sweepAll() is NOT provided as a periodic-tick alternative the way an
 * earlier draft intended - it can't be, now that the gating is a
 * REWARDED-call counter rather than a belief-confidence read: this
 * module has no way to know whether any given moment in time "was
 * rewarded" without the caller telling it, so per-call integration at
 * each reinforce() site is the only correct way to drive it.
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - modify AIH_PersonalityDrift.js or AIH_Personality.js
 * - create its own belief - it reads the belief AIH.PersonalityDrift
 *   already created and linked, via linkedBeliefId (for context/logging
 *   only - the frozen 0.72 confidence is not the gating mechanism)
 * - ever move a Values field for a trait that isn't in TRAIT_VALUE_MAP
 * - call an LLM
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.ValueDrift = AIH.ValueDrift || {};

    AIH.ValueDrift.VERSION = "0.1.0";

    AIH.ValueDrift.SCHEMA_VERSION = 1;

    AIH.ValueDrift._initialized = false;

    // =========================================================================
    // CONFIG
    // =========================================================================

    /*
     * How many further REWARDED reinforce() calls, past the point a
     * trait+direction internalizes, before its paired Value can shift at
     * all. Internalization itself takes 10 calls given the actual
     * mechanics (streakThreshold=5 means belief updates start on the 5th
     * call; beliefConfidenceStep=0.12 needs 6 such updates, i.e. calls
     * 5-10, to cross internalizationConfidence=0.65) - doubling that is
     * meant to feel like sustained, continued reinforcement well beyond
     * what merely locked the behavior in, not a quick follow-on.
     */
    AIH.ValueDrift.DEEP_REWARDED_COUNT_THRESHOLD = 20;

    /*
     * Deliberately small relative to a typical PersonalityDrift nudge
     * (AIH_PersonalityDrift.reinforce()'s magnitude is usually in the
     * 0.25-0.5 range before its own internal dampening; this is a flat,
     * tiny absolute shift applied directly to the Values field).
     */
    AIH.ValueDrift.SHIFT_MAGNITUDE = 0.03;

    /*
     * A value shift only fires again for the same trait+direction once
     * this many FURTHER rewarded calls have accumulated since the last
     * time it fired - without this, every single rewarded call past the
     * threshold would nudge the Value field again, which is not the
     * "rare, hard-won" feel this is meant to have.
     */
    AIH.ValueDrift.MIN_REWARDED_COUNT_DELTA_FOR_REPEAT = 10;

    AIH.ValueDrift.TRAIT_VALUE_MAP = {

        inhibition: "modesty",
        independence: "freedom",
        pride: "dignity"

    };

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.ValueDrift._clamp01 = function(value) {

        value =
            Number(value);

        if (isNaN(value)) {
            return 0;
        }

        if (value < 0) {
            return 0;
        }

        if (value > 1) {
            return 1;
        }

        return value;
    };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================
    //
    // Tracks, per trait+direction, the belief confidence value at which a
    // shift last fired - this is ValueDrift's own bookkeeping, entirely
    // separate from AIH_PersonalityDrift.js's own internal state (which
    // this module only ever READS from, via getStatus()).
    //
    // =========================================================================

    AIH.ValueDrift._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.ValueDrift._ensure = function() {

        var state;

        state =
            AIH.ValueDrift._state();

        if (!state) {
            return null;
        }

        if (!state.valueDrift) {

            state.valueDrift = {

                schemaVersion:
                    AIH.ValueDrift.SCHEMA_VERSION,

                /*
                 * Keyed "trait_direction" (e.g. "inhibition_decrease") ->
                 * how many REWARDED reinforce() calls have accumulated
                 * for that pair since it internalized. This is the
                 * actual gating counter - see the file header for why a
                 * belief-confidence-based gate doesn't work given how
                 * AIH_PersonalityDrift.js's reinforce() actually behaves
                 * post-internalization.
                 */
                rewardedCountSinceInternalized: {},

                /*
                 * The counter value at which a shift last fired for that
                 * pair - MIN_REWARDED_COUNT_DELTA_FOR_REPEAT is checked
                 * against the gap between this and the current count.
                 */
                lastShiftCount: {},

                shiftCounts: {},

                /*
                 * Every individual shift, most recent last - small,
                 * human-readable history for debugging/narrative tools,
                 * not consulted by the gating logic itself.
                 */
                history: []
            };
        }

        if (
            !state.valueDrift.rewardedCountSinceInternalized ||
            typeof state.valueDrift.rewardedCountSinceInternalized !== "object"
        ) {

            state.valueDrift.rewardedCountSinceInternalized = {};
        }

        if (
            !state.valueDrift.lastShiftCount ||
            typeof state.valueDrift.lastShiftCount !== "object"
        ) {

            state.valueDrift.lastShiftCount = {};
        }

        if (
            !state.valueDrift.shiftCounts ||
            typeof state.valueDrift.shiftCounts !== "object"
        ) {

            state.valueDrift.shiftCounts = {};
        }

        if (!Array.isArray(state.valueDrift.history)) {
            state.valueDrift.history = [];
        }

        return state.valueDrift;
    };

    AIH.ValueDrift._key = function(trait, direction) {

        return trait + "_" + direction;
    };

    // =========================================================================
    // CORE CHECK
    // =========================================================================

    AIH.ValueDrift.checkForShift = function(trait, direction, wasRewarded) {

        var valueName;
        var traitStatus;
        var beliefId;
        var belief;
        var beliefConfidence;
        var key;
        var state;
        var currentCount;
        var lastShiftCount;
        var newValue;

        valueName =
            AIH.ValueDrift.TRAIT_VALUE_MAP[trait];

        if (!valueName) {

            /*
             * Not a mapped trait - a deliberate, silent no-op so callers
             * can call this unconditionally after every reinforce() call
             * without checking membership themselves first.
             */
            return null;
        }

        if (
            typeof AIH.PersonalityDrift === "undefined" ||
            !AIH.PersonalityDrift.getStatus ||
            !AIH.PersonalityDrift.isInternalized
        ) {

            return null;
        }

        if (!AIH.PersonalityDrift.isInternalized(trait, direction)) {

            /*
             * Must have crossed ordinary internalization first - a
             * trait that hasn't even gotten its own behavior to stick
             * yet has no business pulling a Value field.
             */
            return null;
        }

        if (wasRewarded !== true) {

            /*
             * Only genuinely rewarded post-internalization moments count
             * toward deepening - an unrewarded call still nudges the
             * trait itself (per AIH_PersonalityDrift.js's own post-
             * internalization behavior), but doesn't advance THIS
             * module's counter.
             */
            return null;
        }

        state =
            AIH.ValueDrift._ensure();

        if (!state) {
            return null;
        }

        key =
            AIH.ValueDrift._key(trait, direction);

        currentCount =
            (state.rewardedCountSinceInternalized[key] || 0) + 1;

        state.rewardedCountSinceInternalized[key] =
            currentCount;

        if (
            currentCount <
            AIH.ValueDrift.DEEP_REWARDED_COUNT_THRESHOLD
        ) {

            return null;
        }

        lastShiftCount =
            state.lastShiftCount[key];

        if (
            lastShiftCount !== undefined &&
            (currentCount - lastShiftCount) <
            AIH.ValueDrift.MIN_REWARDED_COUNT_DELTA_FOR_REPEAT
        ) {

            /*
             * Already fired recently for this pair - needs more further
             * rewarded calls to accumulate before it can fire again.
             */
            return null;
        }

        /*
         * The linked belief's (frozen, per the file header) confidence -
         * context/logging only, not part of the gate.
         */
        beliefConfidence = null;

        traitStatus =
            AIH.PersonalityDrift.getStatus(trait);

        beliefId =
            traitStatus &&
            traitStatus.linkedBeliefId &&
            traitStatus.linkedBeliefId[direction];

        if (
            beliefId &&
            typeof AIH.Beliefs !== "undefined" &&
            AIH.Beliefs.get
        ) {

            belief =
                AIH.Beliefs.get(beliefId);

            beliefConfidence =
                belief ?
                    belief.confidence :
                    null;
        }

        newValue =
            AIH.Values.modifyValue(
                valueName,
                direction === "increase" ?
                    AIH.ValueDrift.SHIFT_MAGNITUDE :
                    -AIH.ValueDrift.SHIFT_MAGNITUDE
            );

        state.lastShiftCount[key] =
            currentCount;

        state.shiftCounts[key] =
            (state.shiftCounts[key] || 0) + 1;

        state.history.push({

            trait: trait,
            direction: direction,
            valueName: valueName,
            rewardedCount: currentCount,
            beliefConfidence: beliefConfidence,
            newValue: newValue,
            timestamp: Date.now()

        });

        if (state.history.length > 50) {
            state.history = state.history.slice(-50);
        }

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Value drift: " +
                valueName +
                " shifted " +
                direction +
                " (from " +
                trait +
                "/" +
                direction +
                " sustained across " +
                currentCount +
                " rewarded reinforcements since internalizing) -> " +
                newValue.toFixed(3)
            );
        }

        return {

            trait: trait,
            direction: direction,
            valueName: valueName,
            rewardedCount: currentCount,
            beliefConfidence: beliefConfidence,
            newValue: newValue

        };
    };

    // =========================================================================
    // QUERY
    // =========================================================================

    AIH.ValueDrift.getHistory = function(limit) {

        var state;

        state =
            AIH.ValueDrift._ensure();

        if (!state) {
            return [];
        }

        if (!limit) {
            return state.history.slice();
        }

        return state.history.slice(-limit);
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.ValueDrift.initialize = function() {

        AIH.ValueDrift._ensure();

        AIH.ValueDrift._initialized =
            true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Value drift system initialized."
            );
        }
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "ValueDrift",
            {
                version:
                    AIH.ValueDrift.VERSION,

                initialize: function() {
                    AIH.ValueDrift.initialize();
                },

                checkForShift: function(trait, direction, wasRewarded) {
                    return AIH.ValueDrift.checkForShift(trait, direction, wasRewarded);
                },

                getHistory: function(limit) {
                    return AIH.ValueDrift.getHistory(limit);
                }
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_ValueDrift_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_ValueDrift_createGameObjects.call(
                this
            );

            AIH.ValueDrift.initialize();
        };

        var _AIH_ValueDrift_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_ValueDrift_setupNewGame.call(
                this
            );

            AIH.ValueDrift._initialized =
                false;

            AIH.ValueDrift.initialize();
        };

        var _AIH_ValueDrift_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_ValueDrift_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.ValueDrift._initialized =
                    false;

                AIH.ValueDrift.initialize();
            };
    }

})();