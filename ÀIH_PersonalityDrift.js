/*:
 * @plugindesc AI Hero Framework - Personality Drift System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - PERSONALITY DRIFT
 * ============================================================================
 *
 * STEP 23
 *
 * Implements gradual, reward-driven personality change, and its eventual
 * internalization into genuine preference - the mechanic described in the
 * "Personality Drift RPG" minigame design handoff.
 *
 * ============================================================================
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * AIH_Personality.js already exposes AIH.Personality.adjustTrait(name,
 * delta, reason) - the raw ability to nudge a trait exists and is not
 * touched here. What did not exist anywhere is something that DECIDES how
 * much to nudge, and when, in a way that:
 *
 *     - stays small per event, so personality remains slow-changing
 *       (per the project's own repeated design rule) rather than swinging
 *       from a single incident
 *
 *     - is gated by reward at first, matching how real habituation works:
 *       a boundary-loosening choice only reinforces the trait if it was
 *       actually rewarding
 *
 *     - eventually becomes self-sustaining. After enough consistent
 *       reward-driven reinforcement in the same direction, the drift stops
 *       being purely instrumental and becomes a genuine preference: it
 *       continues to nudge even when the behavior stops being rewarded,
 *       or is actively costly.
 *
 * ============================================================================
 *
 * TWO PHASES
 *
 * PHASE 1 - REWARD-GATED REINFORCEMENT
 *
 *     Something elsewhere (a minigame event resolution, the livestream
 *     integration, a social consequence, anything) calls:
 *
 *         AIH.PersonalityDrift.reinforce(trait, direction, options)
 *
 *     If options.rewarded is true, the trait gets a small nudge in the
 *     given direction and a consistency streak for that trait+direction
 *     increases. If rewarded is false or omitted, no nudge happens (before
 *     internalization, un-rewarded instances do not move the needle) but
 *     the streak in the OPPOSITE direction is gently reduced rather than
 *     the current streak being wiped, so a single inconsistent instance
 *     does not erase a run of consistent ones.
 *
 * PHASE 2 - INTERNALIZATION
 *
 *     Once the streak for a trait+direction crosses a threshold, this
 *     module creates a self-referential belief through AIH.Beliefs (e.g.
 *     "There's nothing wrong with being less reserved about this.") and
 *     strengthens its confidence on each further reinforcement. This
 *     reuses AIH.Beliefs exactly as already built - a rationalization is
 *     just a belief about herself whose confidence rises with evidence,
 *     which the belief system already supports with no changes needed.
 *
 *     Once that belief's confidence passes a threshold, the trait+
 *     direction is marked internalized. From that point on,
 *     reinforce() nudges the trait EVEN WHEN options.rewarded is false,
 *     because the drift is no longer chasing the reward - it has become
 *     what she actually prefers. This is the literal mechanic requested:
 *     "even if it is less rewarding to be less inhibited she still
 *     continues with it due to preference."
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide WHEN a trait should be reinforced. Something else (minigame
 *   event resolution, social consequence, livestream outcome) decides
 *   that a given choice+outcome is relevant to a given trait and calls
 *   reinforce(). This module does not invent reinforcement on its own
 *   initiative.
 * - modify anything other than the one named trait per call.
 * - decide what counts as "rewarded" - that judgment belongs to whatever
 *   is calling reinforce().
 * - call an LLM.
 *
 * ============================================================================
 *
 * @command Show
 * @text Show Drift Status
 * @desc Displays streaks and internalization status for every tracked trait.
 *
 * @command Reset
 * @text Reset Drift Tracking
 * @desc Clears all streaks and internalization status (does not touch trait values themselves).
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.PersonalityDrift = AIH.PersonalityDrift || {};

    AIH.PersonalityDrift.VERSION = "0.1.0";

    AIH.PersonalityDrift.SCHEMA_VERSION = 1;

    AIH.PersonalityDrift._initialized = false;

    // =========================================================================
    // TUNING
    // =========================================================================

    AIH.PersonalityDrift.Config = {

        /*
         * Base amount a trait moves per reinforced event, before the
         * per-call magnitude multiplier. Deliberately small - personality
         * is meant to be slow-changing. At magnitude 1.0 this is roughly
         * a 2.5% shift; it takes many consistent instances to move a
         * trait meaningfully, by design.
         */
        baseDelta: 0.025,

        /*
         * How many consistent reward-gated reinforcements in the same
         * direction before an internalization belief is created/checked.
         */
        streakThreshold: 5,

        /*
         * Belief confidence required before a trait+direction is marked
         * internalized.
         */
        internalizationConfidence: 0.65,

        /*
         * How much a single reinforcement strengthens the internalization
         * belief's confidence.
         */
        beliefConfidenceStep: 0.12

    };

    // =========================================================================
    // COPY / CLAMP
    // =========================================================================

    AIH.PersonalityDrift._copy = function(value) {

        if (
            value === undefined ||
            value === null
        ) {

            return value;
        }

        return JSON.parse(
            JSON.stringify(value)
        );
    };

    AIH.PersonalityDrift._clamp01 = function(value) {

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
    // DIRECTIONS
    // =========================================================================

    AIH.PersonalityDrift.DIRECTIONS = [
        "increase",
        "decrease"
    ];

    AIH.PersonalityDrift._opposite = function(direction) {

        return direction === "increase" ?
            "decrease" :
            "increase";
    };

    AIH.PersonalityDrift._isValidDirection = function(direction) {

        return AIH.PersonalityDrift.DIRECTIONS.indexOf(direction) >= 0;
    };

    // =========================================================================
    // INTERNALIZATION NARRATIVES
    // =========================================================================
    //
    // The self-belief proposition created/strengthened once a trait+
    // direction is trending toward internalization. Its rising confidence
    // over repeated reinforcement IS the "I only tolerated it because it
    // was necessary" -> "why was I ever bothered by this?" progression
    // described in the design handoff - the belief system already
    // supports exactly this shape, so this table only needs to supply the
    // wording.
    //
    // Traits not listed here (e.g. if this is reused for one of the
    // original 9 traits later) fall back to a generic auto-generated
    // proposition rather than failing.
    //
    // =========================================================================

    AIH.PersonalityDrift.NARRATIVES = {

        inhibition: {
            decrease: "There's nothing wrong with being less reserved about this.",
            increase: "I'd rather keep some things private."
        },

        approvalSeeking: {
            increase: "Making people happy is worth adjusting what I'd normally want.",
            decrease: "What I want matters more than whether they approve."
        },

        mercy: {
            decrease: "Being harsh gets results, and that's fine.",
            increase: "Showing mercy here is the right call, even if it costs me."
        },

        trust: {
            decrease: "People like this usually have an angle.",
            increase: "Most people are decent when given the chance."
        },

        defiance: {
            increase: "I don't owe every authority figure my compliance.",
            decrease: "It's easier to just go along with those in charge."
        },

        attentionSeeking: {
            increase: "I don't mind being watched anymore - it's kind of nice.",
            decrease: "I'd rather not be the center of attention."
        },

        assertiveness: {
            increase: "Speaking up for myself gets better outcomes than staying quiet.",
            decrease: "It's usually not worth pushing back."
        }

    };

    AIH.PersonalityDrift._narrativeFor = function(
        trait,
        direction
    ) {

        var entry;

        entry =
            AIH.PersonalityDrift.NARRATIVES[trait];

        if (
            entry &&
            entry[direction]
        ) {

            return entry[direction];
        }

        return "I've grown more comfortable being more " +
            (
                direction === "increase" ?
                    trait :
                    "the opposite of " + trait
            ) +
            " than I used to be.";
    };

    // =========================================================================
    // STORAGE
    // =========================================================================

    AIH.PersonalityDrift._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.PersonalityDrift._ensure = function() {

        var state;

        state =
            AIH.PersonalityDrift._state();

        if (!state) {
            return null;
        }

        if (!state.personalityDrift) {

            state.personalityDrift = {

                schemaVersion:
                    AIH.PersonalityDrift.SCHEMA_VERSION,

                traits: {}
            };
        }

        if (!state.personalityDrift.traits) {
            state.personalityDrift.traits = {};
        }

        return state.personalityDrift;
    };

    AIH.PersonalityDrift._ensureTrait = function(trait) {

        var container;

        container =
            AIH.PersonalityDrift._ensure();

        if (!container) {
            return null;
        }

        if (!container.traits[trait]) {

            container.traits[trait] = {

                streaks: {
                    increase: 0,
                    decrease: 0
                },

                internalized: {
                    increase: false,
                    decrease: false
                },

                internalizedAt: {
                    increase: null,
                    decrease: null
                },

                linkedBeliefId: {
                    increase: null,
                    decrease: null
                },

                eventCount: 0
            };
        }

        return container.traits[trait];
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.PersonalityDrift.initialize = function() {

        AIH.PersonalityDrift._ensure();

        AIH.PersonalityDrift._initialized = true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Personality drift system initialized."
            );
        }
    };

    // =========================================================================
    // QUERY
    // =========================================================================

    AIH.PersonalityDrift.getStatus = function(trait) {

        var traitState;

        traitState =
            AIH.PersonalityDrift._ensureTrait(trait);

        if (!traitState) {
            return null;
        }

        return AIH.PersonalityDrift._copy(traitState);
    };

    AIH.PersonalityDrift.getAllStatus = function() {

        var container;

        container =
            AIH.PersonalityDrift._ensure();

        if (!container) {
            return {};
        }

        return AIH.PersonalityDrift._copy(
            container.traits
        );
    };

    AIH.PersonalityDrift.isInternalized = function(
        trait,
        direction
    ) {

        var traitState;

        traitState =
            AIH.PersonalityDrift._ensureTrait(trait);

        if (
            !traitState ||
            !AIH.PersonalityDrift._isValidDirection(direction)
        ) {

            return false;
        }

        return !!traitState.internalized[direction];
    };

    // =========================================================================
    // INTERNALIZE (INTERNAL)
    // =========================================================================
    //
    // Creates or strengthens the self-narrative belief for a trait+
    // direction. Returns the belief's current confidence, or null if
    // AIH.Beliefs is not available (in which case internalization simply
    // cannot happen and reinforcement stays reward-gated indefinitely -
    // a safe degradation, not a crash).
    //
    // =========================================================================

    AIH.PersonalityDrift._reinforceBelief = function(
        trait,
        direction,
        traitState
    ) {

        var proposition;
        var existing;
        var belief;

        if (
            typeof AIH.Beliefs === "undefined" ||
            !AIH.Beliefs.create ||
            !AIH.Beliefs.getByProposition
        ) {

            return null;
        }

        proposition =
            AIH.PersonalityDrift._narrativeFor(
                trait,
                direction
            );

        existing =
            traitState.linkedBeliefId[direction] ?
                AIH.Beliefs.get(
                    traitState.linkedBeliefId[direction]
                ) :
                null;

        if (!existing) {

            existing =
                AIH.Beliefs.getByProposition(proposition);
        }

        if (existing) {

            belief =
                AIH.Beliefs.updateConfidence(
                    existing.id,
                    AIH.PersonalityDrift._clamp01(
                        existing.confidence +
                        AIH.PersonalityDrift.Config.beliefConfidenceStep
                    ),
                    "repeated personality-drift reinforcement"
                );

        } else {

            belief =
                AIH.Beliefs.add(
                    proposition,
                    AIH.PersonalityDrift.Config.beliefConfidenceStep,
                    {
                        category: "self_narrative",
                        sourceReliability: 1.0
                    }
                );
        }

        if (belief) {
            traitState.linkedBeliefId[direction] = belief.id;
        }

        return belief ?
            belief.confidence :
            null;
    };

    // =========================================================================
    // REINFORCE
    // =========================================================================
    //
    // The main entry point. Called by minigame event resolution, social
    // consequence handling, the livestream integration, or anything else
    // that has just observed a boundary-relevant choice and its outcome.
    //
    // trait        one of AIH.Personality.TRAITS
    // direction    "increase" | "decrease"
    // options:
    //     rewarded    true | false | undefined - was this instance
    //                 actually rewarding for her (money, approval,
    //                 pleasure, relief, praise, whatever is contextually
    //                 appropriate)? Required for pre-internalization
    //                 reinforcement to happen at all.
    //     magnitude   0..1, default 0.5 - relative strength of this
    //                 instance. A minor moment and a major one should not
    //                 move the needle by the same amount.
    //     reason      free-text, passed through to adjustTrait's history
    //                 log.
    //
    // =========================================================================

    AIH.PersonalityDrift.reinforce = function(
        trait,
        direction,
        options
    ) {

        var traitState;
        var container;
        var internalizedHere;
        var shouldNudge;
        var magnitude;
        var delta;
        var opposite;
        var beliefConfidence;
        var result;

        if (
            typeof AIH.Personality === "undefined" ||
            !AIH.Personality.hasTrait ||
            !AIH.Personality.hasTrait(trait)
        ) {

            return null;
        }

        if (!AIH.PersonalityDrift._isValidDirection(direction)) {
            return null;
        }

        options =
            options || {};

        container =
            AIH.PersonalityDrift._ensure();

        traitState =
            AIH.PersonalityDrift._ensureTrait(trait);

        if (
            !container ||
            !traitState
        ) {

            return null;
        }

        traitState.eventCount =
            (traitState.eventCount || 0) + 1;

        internalizedHere =
            !!traitState.internalized[direction];

        shouldNudge =
            internalizedHere ?
                true :
                (options.rewarded === true);

        magnitude =
            AIH.PersonalityDrift._clamp01(
                options.magnitude !== undefined ?
                    options.magnitude :
                    0.5
            );

        result = {

            trait: trait,
            direction: direction,
            nudged: false,
            internalized: internalizedHere,
            streak: traitState.streaks[direction],
            beliefConfidence: null

        };

        if (shouldNudge) {

            delta =
                AIH.PersonalityDrift.Config.baseDelta *
                magnitude;

            if (direction === "decrease") {
                delta = -delta;
            }

            AIH.Personality.adjustTrait(
                trait,
                delta,
                options.reason ||
                    (
                        internalizedHere ?
                            "internalized preference" :
                            "reward-reinforced experience"
                    )
            );

            result.nudged = true;
        }

        /*
         * Streak/internalization bookkeeping only applies to the
         * reward-gated phase. Once internalized, there is nothing further
         * to threshold-check - it stays internalized (this module never
         * un-internalizes a trait; if that is ever wanted, it would be a
         * deliberate, separate mechanic, not an accidental side effect of
         * this one).
         */
        if (!internalizedHere) {

            if (options.rewarded === true) {

                traitState.streaks[direction] =
                    (traitState.streaks[direction] || 0) + 1;

                opposite =
                    AIH.PersonalityDrift._opposite(direction);

                traitState.streaks[opposite] =
                    Math.max(
                        0,
                        (traitState.streaks[opposite] || 0) - 1
                    );

                result.streak =
                    traitState.streaks[direction];

                if (
                    traitState.streaks[direction] >=
                    AIH.PersonalityDrift.Config.streakThreshold
                ) {

                    beliefConfidence =
                        AIH.PersonalityDrift._reinforceBelief(
                            trait,
                            direction,
                            traitState
                        );

                    result.beliefConfidence =
                        beliefConfidence;

                    if (
                        beliefConfidence !== null &&
                        beliefConfidence >=
                        AIH.PersonalityDrift.Config.internalizationConfidence
                    ) {

                        traitState.internalized[direction] =
                            true;

                        traitState.internalizedAt[direction] =
                            Date.now();

                        result.internalized = true;

                        if (
                            typeof AIH.Events !== "undefined" &&
                            AIH.Events.emit
                        ) {

                            AIH.Events.emit(
                                "PERSONALITY_DRIFT_INTERNALIZED",
                                {
                                    trait: trait,
                                    direction: direction
                                }
                            );
                        }
                    }
                }
            }
        }

        return result;
    };

    // =========================================================================
    // RESET
    // =========================================================================

    AIH.PersonalityDrift.reset = function() {

        var state;

        state =
            AIH.PersonalityDrift._state();

        if (!state) {
            return;
        }

        state.personalityDrift = {

            schemaVersion:
                AIH.PersonalityDrift.SCHEMA_VERSION,

            traits: {}
        };
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "PersonalityDrift",
            {
                version:
                    AIH.PersonalityDrift.VERSION,

                initialize: function() {
                    AIH.PersonalityDrift.initialize();
                },

                reinforce: function(trait, direction, options) {
                    return AIH.PersonalityDrift.reinforce(trait, direction, options);
                },

                getStatus: function(trait) {
                    return AIH.PersonalityDrift.getStatus(trait);
                },

                isInternalized: function(trait, direction) {
                    return AIH.PersonalityDrift.isInternalized(trait, direction);
                }
            }
        );
    }

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_PersonalityDrift",
            "Show",
            function() {

                AIH.Debug.inspect(
                    "Personality drift status:",
                    AIH.PersonalityDrift.getAllStatus()
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_PersonalityDrift",
            "Reset",
            function() {

                AIH.PersonalityDrift.reset();
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_PersonalityDrift_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_PersonalityDrift_createGameObjects.call(
                this
            );

            AIH.PersonalityDrift.initialize();
        };

        var _AIH_PersonalityDrift_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_PersonalityDrift_setupNewGame.call(
                this
            );

            AIH.PersonalityDrift._initialized =
                false;

            AIH.PersonalityDrift.initialize();
        };

        var _AIH_PersonalityDrift_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_PersonalityDrift_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.PersonalityDrift._initialized =
                    false;

                AIH.PersonalityDrift.initialize();
            };
    }

})();