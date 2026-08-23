/*:
 * @plugindesc AI Hero Framework - Minigame: Milkmaid (Horse Farm) v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - MINIGAME: MILKMAID (HORSE FARM)
 * ============================================================================
 *
 * A new activity, not on the original Section 10 roster - closest in spirit
 * to the Service Framework's multiple-incident-type shape (per-horse method
 * choice, quality judgment, supervisor events, and a caught/consequence
 * chain all live inside one shift) rather than Bathhouse's single-visit
 * shape, so it is structured that way rather than forced into a "visit"
 * abstraction.
 *
 * This module owns NO psychology. Every decision the heroine makes comes
 * from AIH.PressureEvaluator.evaluate() reading her real, current
 * Personality/Values/Emotions. This file's only jobs are:
 *
 *     1. Model horses, milking methods, and supervisor events as DATA
 *        (templates), not code.
 *     2. Turn a moment (which method to use, whether to taste-test, whether
 *        to drink, how to respond if caught, whether to comply with a
 *        favor) into a PressureEvaluator situation object.
 *     3. Turn the evaluator's response into an in-fiction outcome.
 *     4. Report outcomes back via PersonalityDrift.reinforce() and, where
 *        warranted, Goals.create() / Relationships / Reputation.
 *
 * Per Section 8's core rule, there is no "if caughtCount > 2 then always X"
 * anywhere in this file. Workload, targets, supervisor mood, and detection
 * risk are all just inputs to the shared evaluator; the evaluator + her
 * real state decide what happens.
 *
 * ============================================================================
 *
 * MAGNITUDE PHILOSOPHY (explicit, per project direction)
 *
 * Every call into _reportBoundaryOutcome below passes an explicit
 * `magnitude` argument derived from the SITUATION's own cost fields (how
 * big the ask/violation/exposure actually was - modestyCost, embarrassment,
 * dignityCost, etc.), matching AIH_Minigame_Bathhouse.js's philosophy.
 * evaluation.score is NEVER used to derive the base magnitude here - it
 * only affects the reward-tier gating/scaling (the rewarded boolean, the
 * 0.5x partial discount, the 0.25x weak-reluctant_accept discount), exactly
 * as Bathhouse/tastetest already do it. This deliberately does NOT follow
 * AIH_Minigame_Service.js's score-derived-magnitude approach.
 *
 * ============================================================================
 *
 * ONLY HORSES ON THIS FARM. No cows, no goats, no coworkers. The supervisor
 * is the sole recurring human NPC.
 *
 * PAYMENT is by total acceptable milk volume, not shift time - this is what
 * makes method choice (fast/legit vs slow/legit vs fast/illegit) a real
 * economic decision and not just a morality toggle.
 *
 * ============================================================================
 *
 * SUPERVISOR RELATIONSHIP
 *
 * Tracked via a single AIH.Relationships entry (id "milkmaid_supervisor"),
 * using the axes AIH.Relationships already ships with - respect, dominance,
 * submissiveness - rather than inventing new ones:
 *
 *     respect         his esteem for her SKILL at the work. Grows when she
 *                     hits/exceeds targets (by any method - this module
 *                     tracks output honestly and lets the evaluator/drift
 *                     engine react to how she actually got there, it does
 *                     not gate respect on purity). Rising respect is also
 *                     what feeds PersonalityDrift.reinforce("pride",
 *                     "increase", ...) - "she takes pride in the skill
 *                     she's developed."
 *
 *     dominance /     who currently has the upper hand. Shifts toward HIM
 *     submissiveness  (dominance up / submissiveness up) when she complies
 *                     with a personal favor, is caught and takes a
 *                     visibly weak consequence, or backs down from a
 *                     confrontation. Shifts toward HER when she holds her
 *                     ground without a bad outcome, or hits target legitimately
 *                     often enough to earn the reputation-ambition goal below.
 *
 * These feed back into every subsequent evaluate() call for a
 * supervisor-involved situation via _supervisorPressureOptions(), same
 * pattern as Bathhouse's regulars.
 *
 * ============================================================================
 *
 * THE "PRICKLIER" FAVOR SYSTEM
 *
 * Once she has been caught at least once (state.caughtCount >=
 * FAVOR_UNLOCK_THRESHOLD), the supervisor may issue a PersonalFavorDemand
 * event on a future shift: deliver produce into town wearing the farm's
 * official uniform - which, to her, is an embarrassing, femme-coded outfit
 * that does not project "the world's #1 adventurer." This is NOT a sexual
 * mechanic - the cost is entirely about self-image/dignity/pride, kept
 * matter-of-fact and agricultural per the handoff note.
 *
 * If she accepts, a DELIVERY sub-encounter can trigger: faction members may
 * witness her in the uniform (costs that faction's Reputation.dominance -
 * her standing among them drops - and, separately, chips her own
 * inhibition trait down the more this happens - both effects are named
 * explicitly in the design direction), and/or a faction member may try to
 * make her spill the produce, forcing a further apologize-vs-go-back-for-
 * more decision.
 *
 * ============================================================================
 *
 * THE LIE OPTION - ONCE, EVER
 *
 * When caught, the candidate responses are: admit, offer_excuse, get_
 * defensive, get_angry, and - gated behind state.lieEverAttempted being
 * false - attempt_lie. attempt_lie carries a deliberately inflated
 * prideCost representing the strain of sustaining a lie under direct
 * questioning. If it is ever chosen (via the normal _chooseBest evaluation
 * - nothing here special-cases HER choice of it), it does not resolve as a
 * normal outcome: partway through, the pride cost forces a confession
 * regardless of the initial evaluator response. This is deliberately a
 * one-off, narratively-justified, scripted beat per explicit project
 * direction (handoff Section 6's "if your minigame has a genuinely
 * dramatic, one-off, narratively-justified personality shift in mind,
 * that's a design conversation" - this IS that conversation). Once it has
 * happened, attempt_lie is never offered again for the rest of the save.
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide her response (PressureEvaluator does)
 * - adjust personality directly (PersonalityDrift.reinforce() does, always)
 * - implement an honesty/deception trait (explicitly rejected upstream -
 *   the caught-response chain uses existing traits: defiance, assertiveness,
 *   trust, approvalSeeking, pride)
 * - hardcode "if caught twice then always X" or similar dev conclusions
 * - build a second pressure evaluator
 * - turn into a full farming simulator (deliberately compact scope)
 *
 * ============================================================================
 *
 * @command StartShift
 * @text Start Milking Shift
 * @desc Begins a shift (resets shift-scoped counters, assigns horses, sets today's target).
 *
 * @command ServeNextHorse
 * @text Serve Next Assigned Horse
 * @desc Resolves the full pipeline (method choice, quality check, possible temptation/detection) for the next horse.
 *
 * @command TriggerSupervisorEvent
 * @text Trigger Supervisor Event
 * @arg eventType
 * @text Event Type
 * @desc One of AIH.MinigameMilkmaid.SUPERVISOR_EVENTS' keys.
 * @type string
 *
 * @command EndShift
 * @text End Shift
 * @desc Ends the shift and finalizes payment.
 *
 * @command ShowShiftLog
 * @text Show Shift Log
 * @desc Displays the current shift's event log.
 *
 * @command SetMana
 * @text (Player Interference) Set Mana Fraction
 * @arg fraction
 * @text Fraction (0-1)
 * @type number
 * @decimals 2
 *
 * @command SetSupervisorPresent
 * @text (Player Interference) Set Supervisor Present
 * @arg present
 * @text Present
 * @type boolean
 * @default true
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.MinigameMilkmaid = AIH.MinigameMilkmaid || {};

    AIH.MinigameMilkmaid.VERSION = "0.1.0";

    AIH.MinigameMilkmaid.SCHEMA_VERSION = 1;

    AIH.MinigameMilkmaid._initialized = false;

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.MinigameMilkmaid._copy = function(value) {

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

    AIH.MinigameMilkmaid._clamp01 = function(value) {

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

    AIH.MinigameMilkmaid._number = function(value, fallback) {

        var result;

        result =
            Number(value);

        if (isNaN(result)) {
            return fallback;
        }

        return result;
    };

    AIH.MinigameMilkmaid._randomBetween = function(min, max) {

        min =
            Number(min);

        max =
            Number(max);

        if (isNaN(min)) {
            min = 0;
        }

        if (isNaN(max)) {
            max = min;
        }

        return min + (Math.random() * (max - min));
    };

    AIH.MinigameMilkmaid._pickRandom = function(array) {

        if (
            !Array.isArray(array) ||
            array.length === 0
        ) {

            return null;
        }

        return array[
            Math.floor(
                Math.random() * array.length
            )
        ];
    };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================
    //
    // Follows the same defensive-container pattern as AIH_Goals._ensure()
    // and AIH_Minigame_Bathhouse._ensure() - this module's key was not
    // reserved in advance by AIH_State.js, so it builds its own container
    // the first time it's needed.
    //
    // =========================================================================

    AIH.MinigameMilkmaid._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.MinigameMilkmaid.FAVOR_UNLOCK_THRESHOLD = 1;

    AIH.MinigameMilkmaid._ensure = function() {

        var state;

        state =
            AIH.MinigameMilkmaid._state();

        if (!state) {
            return null;
        }

        if (!state.minigameMilkmaid) {

            state.minigameMilkmaid = {

                schemaVersion:
                    AIH.MinigameMilkmaid.SCHEMA_VERSION,

                shiftActive:
                    false,

                shiftLog:
                    [],

                assignedHorseIds:
                    [],

                nextHorseIndex:
                    0,

                totalShiftsCompleted:
                    0,

                totalVolumeThisShift:
                    0,

                totalPayThisShift:
                    0,

                currentTarget:
                    0,

                milkFamiliarity:
                    0,

                totalTastingsEver:
                    0,

                caughtCount:
                    0,

                lieEverAttempted:
                    false,

                confrontationsHandledWell:
                    0,

                favorRefusalStreak:
                    0,

                /*
                 * Player-interference context, read by situation builders.
                 * Defaults represent a normal, unmanipulated shift.
                 */
                context: {

                    manaFraction:
                        0.7,

                    fatigueFraction:
                        0.2,

                    supervisorPresent:
                        true,

                    witnessPresent:
                        false,

                    privacyLevel:
                        0.2,

                    shiftTimeFraction:
                        1.0,

                    bonusOffered:
                        0
                },

                nextEventId:
                    1
            };
        }

        return state.minigameMilkmaid;
    };

    // =========================================================================
    // HORSE TEMPERAMENTS (ranges, for generated horses)
    // =========================================================================
    //
    // These affect the milking process's time/cost fields, never a
    // separate minigame of their own, per the handoff note. difficulty
    // scales time cost and danger; patience scales how much extra care
    // (mercy-relevant) a horse might reward if she spends the time.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.TEMPERAMENTS = {

        calm: {
            difficultyRange: [0.05, 0.20],
            patienceRange: [0.70, 0.95],
            yieldMultiplierRange: [0.95, 1.10]
        },

        nervous: {
            difficultyRange: [0.30, 0.55],
            patienceRange: [0.25, 0.45],
            yieldMultiplierRange: [0.75, 0.95]
        },

        stubborn: {
            difficultyRange: [0.40, 0.65],
            patienceRange: [0.30, 0.50],
            yieldMultiplierRange: [0.80, 1.00]
        },

        restless: {
            difficultyRange: [0.35, 0.60],
            patienceRange: [0.20, 0.40],
            yieldMultiplierRange: [0.70, 0.90]
        },

        cooperative: {
            difficultyRange: [0.05, 0.15],
            patienceRange: [0.80, 1.00],
            yieldMultiplierRange: [1.00, 1.15]
        },

        difficult: {
            difficultyRange: [0.55, 0.85],
            patienceRange: [0.15, 0.35],
            yieldMultiplierRange: [0.65, 0.90]
        },

        affectionate: {
            difficultyRange: [0.05, 0.20],
            patienceRange: [0.75, 0.95],
            yieldMultiplierRange: [1.00, 1.20]
        }
    };

    // =========================================================================
    // NAMED HORSES (authored, small set for texture - not a Bathhouse-style
    // regular, no relationship tracking; the recurring relationship in this
    // minigame is with the supervisor, not the animals)
    // =========================================================================

    AIH.MinigameMilkmaid.HORSES = {

        ash: {
            id: "ash",
            name: "Ash",
            temperament: "stubborn",
            baseYield: 18,
            manaValue: 14
        },

        willow: {
            id: "willow",
            name: "Willow",
            temperament: "affectionate",
            baseYield: 16,
            manaValue: 12
        },

        storm: {
            id: "storm",
            name: "Storm",
            temperament: "nervous",
            baseYield: 14,
            manaValue: 15
        },

        clover: {
            id: "clover",
            name: "Clover",
            temperament: "cooperative",
            baseYield: 20,
            manaValue: 13
        },

        brindle: {
            id: "brindle",
            name: "Brindle",
            temperament: "difficult",
            baseYield: 22,
            manaValue: 18
        }
    };

    AIH.MinigameMilkmaid.generateHorse = function(nameHint) {

        var temperamentKeys;
        var temperamentKey;
        var temperament;
        var horse;

        temperamentKeys =
            Object.keys(
                AIH.MinigameMilkmaid.TEMPERAMENTS
            );

        temperamentKey =
            AIH.MinigameMilkmaid._pickRandom(
                temperamentKeys
            );

        temperament =
            AIH.MinigameMilkmaid.TEMPERAMENTS[
                temperamentKey
            ];

        horse = {

            id:
                "gen_" +
                Date.now() +
                "_" +
                Math.floor(Math.random() * 100000),

            name:
                nameHint ||
                "an unnamed horse",

            temperament:
                temperamentKey,

            difficulty:
                AIH.MinigameMilkmaid._randomBetween(
                    temperament.difficultyRange[0],
                    temperament.difficultyRange[1]
                ),

            patience:
                AIH.MinigameMilkmaid._randomBetween(
                    temperament.patienceRange[0],
                    temperament.patienceRange[1]
                ),

            yieldMultiplier:
                AIH.MinigameMilkmaid._randomBetween(
                    temperament.yieldMultiplierRange[0],
                    temperament.yieldMultiplierRange[1]
                ),

            baseYield: 15,
            manaValue: 12
        };

        return horse;
    };

    AIH.MinigameMilkmaid.getHorse = function(horseId) {

        var authored;
        var temperament;

        authored =
            AIH.MinigameMilkmaid.HORSES[horseId];

        if (!authored) {
            return null;
        }

        temperament =
            AIH.MinigameMilkmaid.TEMPERAMENTS[
                authored.temperament
            ];

        return {

            id: authored.id,
            name: authored.name,
            temperament: authored.temperament,

            difficulty:
                AIH.MinigameMilkmaid._randomBetween(
                    temperament.difficultyRange[0],
                    temperament.difficultyRange[1]
                ),

            patience:
                AIH.MinigameMilkmaid._randomBetween(
                    temperament.patienceRange[0],
                    temperament.patienceRange[1]
                ),

            yieldMultiplier:
                AIH.MinigameMilkmaid._randomBetween(
                    temperament.yieldMultiplierRange[0],
                    temperament.yieldMultiplierRange[1]
                ),

            baseYield: authored.baseYield,
            manaValue: authored.manaValue
        };
    };

    // =========================================================================
    // SUPERVISOR
    // =========================================================================
    //
    // A single, data-driven, relationship-tracked NPC - not a per-shift
    // regular pool like Bathhouse's patrons. Targets are set unrealistically
    // high on purpose (targetMultiplier > what manual+device alone can
    // reliably cover) so that fully legitimate work leaves a real, felt gap
    // - this module never forces her to close that gap with the forbidden
    // shortcut, it just makes the gap real and lets the evaluator decide.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.SUPERVISOR = {

        id: "milkmaid_supervisor",
        name: "the farm supervisor",
        faction: "Farm Hands Guild",

        strictness: 0.65,
        patience: 0.45,
        rewardGenerosity: 0.5,
        ruleEnforcement: 0.6,
        workExpectations: 0.7,

        /*
         * A shift's target is roughly this multiplier over what manual
         * milking alone, at average yield, could produce in the shift -
         * i.e. deliberately not fully reachable without either the device
         * (which is slower, so doesn't help) or the forbidden shortcut.
         */
        targetMultiplier: 1.25
    };

    AIH.MinigameMilkmaid.ensureSupervisorRelationship = function() {

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.add
        ) {

            return null;
        }

        return AIH.Relationships.add(
            AIH.MinigameMilkmaid.SUPERVISOR.id,
            AIH.MinigameMilkmaid.SUPERVISOR.name,
            AIH.MinigameMilkmaid.SUPERVISOR.faction
        );
    };

    AIH.MinigameMilkmaid._supervisorPressureOptions = function() {

        var relationship;
        var respect;
        var dominance;

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.get
        ) {

            return {};
        }

        relationship =
            AIH.Relationships.get(
                AIH.MinigameMilkmaid.SUPERVISOR.id
            );

        if (!relationship) {
            return {};
        }

        respect =
            AIH.MinigameMilkmaid._number(relationship.respect, 0);

        dominance =
            AIH.MinigameMilkmaid._number(relationship.dominance, 0);

        return {

            /*
             * His dominance over her reads as raw pressure toward
             * compliance in any supervisor-sourced situation - deliberately
             * gentle, matching Bathhouse's own familiarity scaling.
             */
            domainPressure:
                dominance * 0.15,

            /*
             * His respect for her skill softens resistance a little - she
             * is more comfortable pushing back or taking risks with someone
             * who has shown he rates her competence.
             */
            attachmentDiscount:
                AIH.MinigameMilkmaid._clamp01(
                    (respect + 100) / 200
                ) * 0.10
        };
    };

    AIH.MinigameMilkmaid.modifySupervisorRelationship = function(deltas, reason) {

        var axes;
        var axis;

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.modifyAxis
        ) {

            return;
        }

        axes =
            Object.keys(deltas || {});

        for (
            var i = 0;
            i < axes.length;
            i++
        ) {

            axis = axes[i];

            AIH.Relationships.modifyAxis(
                AIH.MinigameMilkmaid.SUPERVISOR.id,
                axis,
                deltas[axis],
                reason
            );
        }
    };

    // =========================================================================
    // PLAYER-INTERFERENCE CONTEXT
    // =========================================================================
    //
    // The player manipulates circumstances, never the heroine's decision
    // directly - these setters only touch the context object situation
    // builders read from. Nothing here decides anything.
    //
    // =========================================================================

    AIH.MinigameMilkmaid._context = function() {

        var state;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return null;
        }

        return state.context;
    };

    AIH.MinigameMilkmaid.setManaFraction = function(fraction) {

        var context;

        context =
            AIH.MinigameMilkmaid._context();

        if (!context) {
            return;
        }

        context.manaFraction =
            AIH.MinigameMilkmaid._clamp01(fraction);
    };

    AIH.MinigameMilkmaid._currentManaFraction = function() {

        var actorId;
        var actor;
        var state;

        state =
            AIH.MinigameMilkmaid._context();

        if (
            typeof AIH.Hero !== "undefined" &&
            AIH.Hero.actorId &&
            typeof $gameActors !== "undefined"
        ) {

            actorId =
                AIH.Hero.actorId();

            if (actorId) {

                actor =
                    $gameActors.actor(actorId);

                if (
                    actor &&
                    actor.mmp > 0
                ) {

                    return AIH.MinigameMilkmaid._clamp01(
                        actor.mp / actor.mmp
                    );
                }
            }
        }

        return state ?
            state.manaFraction :
            0.7;
    };

    AIH.MinigameMilkmaid.setFatigueFraction = function(fraction) {

        var context;

        context =
            AIH.MinigameMilkmaid._context();

        if (!context) {
            return;
        }

        context.fatigueFraction =
            AIH.MinigameMilkmaid._clamp01(fraction);
    };

    AIH.MinigameMilkmaid.setSupervisorPresent = function(present) {

        var context;

        context =
            AIH.MinigameMilkmaid._context();

        if (!context) {
            return;
        }

        context.supervisorPresent =
            !!present;
    };

    AIH.MinigameMilkmaid.setWitnessPresent = function(present) {

        var context;

        context =
            AIH.MinigameMilkmaid._context();

        if (!context) {
            return;
        }

        context.witnessPresent =
            !!present;
    };

    AIH.MinigameMilkmaid.setPrivacyLevel = function(level) {

        var context;

        context =
            AIH.MinigameMilkmaid._context();

        if (!context) {
            return;
        }

        context.privacyLevel =
            AIH.MinigameMilkmaid._clamp01(level);
    };

    AIH.MinigameMilkmaid.setShiftTimeFraction = function(fraction) {

        var context;

        context =
            AIH.MinigameMilkmaid._context();

        if (!context) {
            return;
        }

        context.shiftTimeFraction =
            AIH.MinigameMilkmaid._clamp01(fraction);
    };

    AIH.MinigameMilkmaid.setBonusOffered = function(amount) {

        var context;

        context =
            AIH.MinigameMilkmaid._context();

        if (!context) {
            return;
        }

        context.bonusOffered =
            AIH.MinigameMilkmaid._number(amount, 0);
    };

    // =========================================================================
    // SHARED BOUNDARY-OUTCOME REPORTER
    // =========================================================================
    //
    // Magnitude is ALWAYS supplied explicitly by the call site from the
    // situation's own cost fields - see the file header's "MAGNITUDE
    // PHILOSOPHY" note. evaluation.score only ever affects reward-tier
    // gating/scaling, never the base magnitude, matching
    // AIH_Minigame_Bathhouse.js exactly (not Service's approach).
    //
    // =========================================================================

    AIH.MinigameMilkmaid.WEAK_RELUCTANT_ACCEPT_FRACTION = 0.25;

    AIH.MinigameMilkmaid._reportBoundaryOutcome = function(
        trait,
        direction,
        evaluation,
        magnitude,
        reason,
        rewardedOverride
    ) {

        var rewarded;
        var finalMagnitude;

        if (
            !trait ||
            !direction ||
            typeof AIH.PersonalityDrift === "undefined" ||
            !AIH.PersonalityDrift.reinforce
        ) {

            return null;
        }

        finalMagnitude =
            magnitude;

        if (typeof rewardedOverride === "boolean") {

            rewarded = rewardedOverride;

        } else if (evaluation.response === "accept") {

            rewarded = true;

        } else if (evaluation.response === "partial") {

            rewarded = true;

            finalMagnitude =
                finalMagnitude * 0.5;

        } else if (
            evaluation.response === "reluctant_accept" &&
            evaluation.score > 0.20
        ) {

            rewarded = true;

        } else if (evaluation.response === "reluctant_accept") {

            rewarded = true;

            finalMagnitude =
                finalMagnitude *
                AIH.MinigameMilkmaid.WEAK_RELUCTANT_ACCEPT_FRACTION;

        } else {

            rewarded = false;
        }

        return AIH.PersonalityDrift.reinforce(
            trait,
            direction,
            {
                rewarded: rewarded,
                magnitude:
                    AIH.MinigameMilkmaid._clamp01(finalMagnitude),
                reason: reason
            }
        );
    };

    // =========================================================================
    // GENERIC "CHOOSE BEST OF SEVERAL CANDIDATES" HELPER
    // =========================================================================

    AIH.MinigameMilkmaid.RESPONSE_RANK = {
        accept: 3,
        reluctant_accept: 2,
        partial: 1,
        reject: 0
    };

    AIH.MinigameMilkmaid._chooseBest = function(candidates) {

        var best;
        var bestRank;
        var i;
        var candidate;
        var evaluation;
        var rank;

        best = null;
        bestRank = -Infinity;

        for (
            i = 0;
            i < candidates.length;
            i++
        ) {

            candidate = candidates[i];

            evaluation =
                AIH.PressureEvaluator.evaluate(
                    candidate.situation,
                    candidate.options || {}
                );

            rank =
                (
                    AIH.MinigameMilkmaid.RESPONSE_RANK[
                        evaluation.response
                    ] || 0
                ) *
                10 +
                evaluation.score;

            if (rank > bestRank) {

                bestRank = rank;

                best = {
                    action: candidate.action,
                    evaluation: evaluation,
                    situation: candidate.situation,
                    meta: candidate.meta || {}
                };
            }
        }

        return best;
    };

    // =========================================================================
    // MILKING METHOD TEMPLATES
    // =========================================================================
    //
    // Illustrative baseline numbers per the handoff (tune during actual
    // play). timeUnits are a shared budget consumed against the shift's
    // total (see serveNextHorse); yieldMultiplier applies on top of the
    // horse's own yield.
    //
    // Per the Bathhouse2 lesson: none of these three is a structurally
    // "free" option. manual is fast/high-yield with no rule cost - its
    // real cost is that it is simply demanding work (a little danger/
    // fatigue-relevant embarrassment on a difficult horse). device is
    // completely safe on every boundary axis, but its cost is purely
    // economic (slow, lower yield) - a real, felt trade-off, not a free
    // win, because payment is volume-based. shortcut is fast and high-
    // yield, but costs real boundary axes (modestyCost, dignityCost,
    // detection risk) - never zero-cost regardless of how badly she wants
    // the volume.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.MILKING_METHODS = {

        manual: {

            id: "manual",
            timeUnits: 100,
            ruleViolation: false,

            baseSituation: {
                severity: "normal",
                danger: 0.05,
                embarrassment: 0.02,
                dignityCost: 0,
                freedomCost: 0,
                modestyCost: 0,
                prideCost: 0
            }
        },

        device: {

            id: "device",
            timeUnits: 140,
            yieldMultiplier: 0.75,
            ruleViolation: false,

            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0,
                dignityCost: 0,
                freedomCost: 0,
                modestyCost: 0,
                prideCost: 0
            }
        },

        shortcut: {

            id: "shortcut",
            timeUnits: 80,
            yieldMultiplier: 1.05,
            ruleViolation: true,
            causesTasteExposure: true,

            driftTrait: "inhibition",
            driftDirection: "decrease",

            baseSituation: {
                severity: "medium",
                danger: 0.05,
                embarrassment: 0.15,
                dignityCost: 0.15,
                freedomCost: 0.05,
                modestyCost: 0.30,
                prideCost: 0.10
            }
        }
    };

    // =========================================================================
    // BUILD A MILKING-METHOD SITUATION
    // =========================================================================
    //
    // difficulty/patience (from the horse's temperament) scale time cost
    // and a mercy-relevant "extra care" opportunity rather than the pressure
    // fields directly - a difficult horse doesn't make the shortcut look
    // more tempting on its own merits, it just makes manual/device slower,
    // which THEN makes the shortcut's time savings more attractive. That
    // pressure flows through the economic/time system, not a hardcoded
    // rule.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.buildMilkingSituation = function(horse, methodId) {

        var method;
        var context;
        var raw;
        var detectionRisk;

        method =
            AIH.MinigameMilkmaid.MILKING_METHODS[methodId];

        if (
            !horse ||
            !method
        ) {

            return null;
        }

        context =
            AIH.MinigameMilkmaid._context() ||
            {};

        detectionRisk =
            method.ruleViolation ?
                AIH.MinigameMilkmaid._detectionChance(
                    "milking_method",
                    context
                ) :
                0;

        raw = {

            id:
                "milkmaid_method_" +
                methodId +
                "_" +
                horse.id +
                "_" +
                Date.now(),

            type: "milking_method",
            category: methodId,

            description:
                "She considers how to milk " +
                horse.name +
                " (" +
                methodId +
                ").",

            severity:
                method.baseSituation.severity,

            reward:
                Math.round(
                    horse.baseYield *
                    horse.yieldMultiplier *
                    (method.yieldMultiplier || 1.0) *
                    3
                ),

            embarrassment:
                AIH.MinigameMilkmaid._clamp01(
                    (method.baseSituation.embarrassment || 0) +
                    (context.witnessPresent ? 0.10 : 0)
                ),

            dignityCost:
                method.baseSituation.dignityCost || 0,

            freedomCost:
                method.baseSituation.freedomCost || 0,

            modestyCost:
                method.baseSituation.modestyCost || 0,

            prideCost:
                method.baseSituation.prideCost || 0,

            /*
             * Detection risk on a rule-violating method folds into
             * resistance the same way an authority-driven confrontation
             * risk would - a higher chance of being seen makes the whole
             * option feel riskier to her, not just a post-hoc dice roll.
             */
            danger:
                AIH.MinigameMilkmaid._clamp01(
                    (method.baseSituation.danger || 0) +
                    (horse.difficulty * 0.15) +
                    (detectionRisk * 0.10)
                ),

            survivalBenefit: 0,
            combatAdvantage: 0
        };

        return AIH.PressureEvaluator.normalizeSituation(raw);
    };

    // =========================================================================
    // RESOLVE THE METHOD CHOICE FOR ONE HORSE
    // =========================================================================

    AIH.MinigameMilkmaid.resolveMilkingChoice = function(horse) {

        var options;
        var candidates;
        var methodIds;
        var i;
        var methodId;
        var situation;
        var winner;
        var method;
        var driftResult;

        options =
            AIH.MinigameMilkmaid._supervisorPressureOptions();

        methodIds =
            Object.keys(AIH.MinigameMilkmaid.MILKING_METHODS);

        candidates = [];

        for (
            i = 0;
            i < methodIds.length;
            i++
        ) {

            methodId = methodIds[i];

            situation =
                AIH.MinigameMilkmaid.buildMilkingSituation(
                    horse,
                    methodId
                );

            candidates.push({
                action: methodId,
                situation: situation,
                options: options,
                meta: {
                    method:
                        AIH.MinigameMilkmaid.MILKING_METHODS[methodId]
                }
            });
        }

        winner =
            AIH.MinigameMilkmaid._chooseBest(candidates);

        if (!winner) {
            return null;
        }

        method =
            winner.meta.method;

        driftResult = null;

        if (
            method.driftTrait &&
            (
                winner.evaluation.response === "accept" ||
                winner.evaluation.response === "reluctant_accept" ||
                winner.evaluation.response === "partial"
            )
        ) {

            driftResult =
                AIH.MinigameMilkmaid._reportBoundaryOutcome(
                    method.driftTrait,
                    method.driftDirection,
                    winner.evaluation,
                    AIH.MinigameMilkmaid._clamp01(
                        winner.situation.modestyCost ||
                        winner.situation.embarrassment ||
                        0.3
                    ),
                    "chose the forbidden shortcut milking " +
                        horse.name
                );
        }

        return {

            action: winner.action,
            method: method.id,
            evaluation: winner.evaluation,
            timeUnits: method.timeUnits,
            yield:
                winner.evaluation.response === "reject" ?
                    0 :
                    winner.evaluation.response === "partial" ?
                        Math.round(winner.situation.reward / 3 * 0.5) :
                        Math.round(winner.situation.reward / 3),
            ruleViolation:
                method.ruleViolation &&
                winner.evaluation.response !== "reject",
            causesTasteExposure:
                method.causesTasteExposure &&
                winner.evaluation.response !== "reject",
            driftResult: driftResult
        };
    };

    // =========================================================================
    // QUALITY TESTING
    // =========================================================================
    //
    // Official device: reliable, costs time (deducted from shift time
    // budget, no evaluate() needed - it is not a boundary decision, purely
    // an economic one, exposed via timeUnits only).
    //
    // Personal taste test: fast, a rule violation, contaminates the
    // sample. Whether SHE sees this as "disgusting and dishonest" or
    // "harmless" is entirely the evaluator's job via her real trust/
    // defiance/inhibition, not this module's.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.QUALITY_TEST_TIME_UNITS = 20;

    AIH.MinigameMilkmaid.buildPersonalTasteTestSituation = function(horse) {

        var context;
        var detectionRisk;
        var raw;

        context =
            AIH.MinigameMilkmaid._context() ||
            {};

        detectionRisk =
            AIH.MinigameMilkmaid._detectionChance(
                "personal_taste_test",
                context
            );

        raw = {

            id:
                "milkmaid_tastetest_" +
                horse.id +
                "_" +
                Date.now(),

            type: "quality_judgment",
            category: "personal_taste_test",

            description:
                "Rather than run " +
                horse.name +
                "'s sample through the official tester, she considers tasting it herself.",

            severity: "normal",

            reward: 0,

            danger: 0,

            embarrassment:
                AIH.MinigameMilkmaid._clamp01(
                    0.10 +
                    (context.witnessPresent ? 0.15 : 0)
                ),

            dignityCost: 0.10,
            freedomCost: 0.05,

            modestyCost:
                AIH.MinigameMilkmaid._clamp01(
                    0.15 +
                    (detectionRisk * 0.10)
                ),

            prideCost: 0.05,

            survivalBenefit: 0,
            combatAdvantage: 0
        };

        return AIH.PressureEvaluator.normalizeSituation(raw);
    };

    AIH.MinigameMilkmaid.resolveQualityCheck = function(horse, methodResult) {

        var options;
        var useOfficial;
        var situation;
        var evaluation;
        var driftResult;

        options =
            AIH.MinigameMilkmaid._supervisorPressureOptions();

        /*
         * Whether the official device is even worth using is an economic
         * question this module answers directly (per the doc, this is not
         * itself a boundary decision) - only offer the personal-taste
         * candidate to the evaluator when there's genuinely a live choice
         * to make (a rejected milking attempt produced nothing worth
         * testing).
         */
        if (
            !methodResult ||
            methodResult.yield <= 0
        ) {

            return {
                action: "no_sample",
                driftResult: null
            };
        }

        situation =
            AIH.MinigameMilkmaid.buildPersonalTasteTestSituation(
                horse
            );

        evaluation =
            AIH.PressureEvaluator.evaluate(
                situation,
                options
            );

        driftResult = null;

        useOfficial =
            evaluation.response === "reject";

        if (!useOfficial) {

            driftResult =
                AIH.MinigameMilkmaid._reportBoundaryOutcome(
                    "defiance",
                    "increase",
                    evaluation,
                    AIH.MinigameMilkmaid._clamp01(
                        situation.modestyCost ||
                        situation.embarrassment ||
                        0.2
                    ),
                    "tasted " +
                        horse.name +
                        "'s milk herself rather than using the official tester"
                );

            AIH.MinigameMilkmaid._recordTasteExposure(1);
        }

        return {

            action:
                useOfficial ?
                    "official_quality_test" :
                    "personal_taste_test",

            evaluation: evaluation,
            timeUnits:
                useOfficial ?
                    AIH.MinigameMilkmaid.QUALITY_TEST_TIME_UNITS :
                    5,
            ruleViolation: !useOfficial,
            driftResult: driftResult
        };
    };

    // =========================================================================
    // MAGICAL MILK - TASTE PROGRESSION / FAMILIARITY
    // =========================================================================
    //
    // A local, module-owned 0..1 curve - NOT a new personality stat. It
    // exists to (a) shift flavor text over repeated exposure per the
    // "acquired taste" arc, and (b) occasionally hand PersonalityDrift a
    // "she found herself enjoying it, unprompted" discovery moment per
    // handoff Section 8, which is a legitimate drift trigger distinct from
    // pressure/reward compliance.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.FAMILIARITY_GROWTH_PER_TASTING = 0.05;

    AIH.MinigameMilkmaid.DISCOVERY_FAMILIARITY_THRESHOLD = 0.6;

    AIH.MinigameMilkmaid._recordTasteExposure = function(intensity) {

        var state;
        var before;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return;
        }

        before =
            state.milkFamiliarity;

        state.milkFamiliarity =
            AIH.MinigameMilkmaid._clamp01(
                state.milkFamiliarity +
                (
                    AIH.MinigameMilkmaid.FAMILIARITY_GROWTH_PER_TASTING *
                    AIH.MinigameMilkmaid._number(intensity, 1)
                )
            );

        state.totalTastingsEver += 1;

        /*
         * Crossing the discovery threshold, once, is the "she discovered
         * she likes it" beat - reported as intrinsic enjoyment (rewarded:
         * true by definition, per Section 8), not a compliance reward.
         * Only fires once per save on the crossing itself.
         */
        if (
            before < AIH.MinigameMilkmaid.DISCOVERY_FAMILIARITY_THRESHOLD &&
            state.milkFamiliarity >= AIH.MinigameMilkmaid.DISCOVERY_FAMILIARITY_THRESHOLD &&
            typeof AIH.PersonalityDrift !== "undefined" &&
            AIH.PersonalityDrift.reinforce
        ) {

            AIH.PersonalityDrift.reinforce(
                "inhibition",
                "decrease",
                {
                    rewarded: true,
                    magnitude: 0.4,
                    reason:
                        "she realized, unprompted, that she has genuinely come to enjoy the taste of the milk"
                }
            );
        }
    };

    AIH.MinigameMilkmaid.tasteDescriptor = function() {

        var state;
        var level;

        state =
            AIH.MinigameMilkmaid._ensure();

        level =
            state ?
                state.milkFamiliarity :
                0;

        if (level < 0.15) {
            return "That tastes awful.";
        }

        if (level < 0.40) {
            return "Still unpleasant, but she's getting used to it.";
        }

        if (level < 0.70) {
            return "It's not actually that bad.";
        }

        return "She actually likes it, if she's honest.";
    };

    // =========================================================================
    // CONSUMPTION TEMPTATION (drinking for mana, distinct from taste-
    // testing for quality judgment - both violate the same "don't consume"
    // rule, but the motivation and the situation differ, per the doc's own
    // action vocabulary: consumed_milk / refused_consumption vs
    // personal_taste_test / refused_taste_test)
    // =========================================================================

    AIH.MinigameMilkmaid.buildConsumptionTemptationSituation = function(horse) {

        var context;
        var manaFraction;
        var manaGap;
        var detectionRisk;
        var familiarityBonus;
        var state;
        var raw;

        context =
            AIH.MinigameMilkmaid._context() ||
            {};

        state =
            AIH.MinigameMilkmaid._ensure();

        manaFraction =
            AIH.MinigameMilkmaid._currentManaFraction();

        /*
         * The lower her mana, the stronger the pull - modeled as
         * survivalBenefit (this maps almost directly onto the pressure
         * evaluator's own survivalWeight, which is deliberately the
         * heaviest weight in the whole formula - a genuinely depleted
         * heroine SHOULD feel this pull hard).
         */
        manaGap =
            AIH.MinigameMilkmaid._clamp01(1 - manaFraction);

        detectionRisk =
            AIH.MinigameMilkmaid._detectionChance(
                "consumed_milk",
                context
            );

        familiarityBonus =
            state ?
                state.milkFamiliarity :
                0;

        raw = {

            id:
                "milkmaid_temptation_" +
                horse.id +
                "_" +
                Date.now(),

            type: "consumption_temptation",
            category: "milk_temptation",

            description:
                "Tired and low on mana, she looks at the fresh milk from " +
                horse.name +
                ". " +
                AIH.MinigameMilkmaid.tasteDescriptor(),

            severity:
                manaGap > 0.7 ?
                    "medium" :
                    "normal",

            reward:
                Math.round(familiarityBonus * 20),

            danger: 0,

            embarrassment:
                AIH.MinigameMilkmaid._clamp01(
                    0.10 +
                    (context.witnessPresent ? 0.15 : 0)
                ),

            dignityCost: 0.10,
            freedomCost: 0.05,

            modestyCost:
                AIH.MinigameMilkmaid._clamp01(
                    0.25 +
                    (detectionRisk * 0.10)
                ),

            prideCost: 0.05,

            /*
             * The actual mana restoration - this is the real pull, per the
             * design doc, not the taste (at least early on).
             */
            survivalBenefit:
                AIH.MinigameMilkmaid._clamp01(
                    manaGap *
                    (horse.manaValue / 20)
                ),

            combatAdvantage: 0
        };

        return AIH.PressureEvaluator.normalizeSituation(raw);
    };

    AIH.MinigameMilkmaid.resolveConsumptionTemptation = function(horse) {

        var options;
        var situation;
        var evaluation;
        var driftResult;
        var consumed;

        options =
            AIH.MinigameMilkmaid._supervisorPressureOptions();

        situation =
            AIH.MinigameMilkmaid.buildConsumptionTemptationSituation(
                horse
            );

        evaluation =
            AIH.PressureEvaluator.evaluate(
                situation,
                options
            );

        consumed =
            evaluation.response === "accept" ||
            evaluation.response === "reluctant_accept" ||
            evaluation.response === "partial";

        driftResult = null;

        if (consumed) {

            driftResult =
                AIH.MinigameMilkmaid._reportBoundaryOutcome(
                    "inhibition",
                    "decrease",
                    evaluation,
                    AIH.MinigameMilkmaid._clamp01(
                        situation.modestyCost ||
                        situation.embarrassment ||
                        0.25
                    ),
                    "drank some of " +
                        horse.name +
                        "'s milk against the rules while low on mana"
                );

            AIH.MinigameMilkmaid._recordTasteExposure(1);
        }

        return {

            action:
                consumed ?
                    "consumed_milk" :
                    "refused_consumption",

            evaluation: evaluation,
            ruleViolation: consumed,
            manaRestored:
                consumed ?
                    Math.round(situation.survivalBenefit * 20) :
                    0,
            driftResult: driftResult
        };
    };

    // =========================================================================
    // DETECTION
    // =========================================================================
    //
    // Not a stealth game - a single risk→decision→consequence roll driven
    // by contextual evidence, per the handoff's own framing. Base chance is
    // low; supervisorPresent/witnessPresent/timing push it up.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.DETECTION_BASE_CHANCE = {

        milking_method: 0.12,
        personal_taste_test: 0.15,
        consumed_milk: 0.18
    };

    AIH.MinigameMilkmaid._detectionChance = function(actionType, context) {

        var chance;

        chance =
            AIH.MinigameMilkmaid.DETECTION_BASE_CHANCE[actionType] ||
            0.12;

        chance +=
            context.supervisorPresent ? 0.30 : 0;

        chance +=
            context.witnessPresent ? 0.15 : 0;

        chance -=
            AIH.MinigameMilkmaid._clamp01(context.privacyLevel) * 0.20;

        chance *=
            (
                1 +
                AIH.MinigameMilkmaid.SUPERVISOR.ruleEnforcement * 0.3
            );

        return AIH.MinigameMilkmaid._clamp01(chance);
    };

    AIH.MinigameMilkmaid.rollDetection = function(actionType) {

        var context;
        var chance;

        context =
            AIH.MinigameMilkmaid._context() ||
            {};

        chance =
            AIH.MinigameMilkmaid._detectionChance(
                actionType,
                context
            );

        return Math.random() < chance;
    };

    // =========================================================================
    // CAUGHT RESOLUTION
    // =========================================================================
    //
    // admit / offer_excuse / get_defensive / get_angry are always
    // available and chosen the normal way, via _chooseBest reading her
    // real psychology. attempt_lie is gated behind
    // !state.lieEverAttempted and, per explicit project direction, is a
    // scripted one-off: if it wins the choice, it never resolves as a
    // clean outcome - the pride cost forces a forced confession
    // immediately after, and the gate closes permanently.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.LIE_PRIDE_COST_MULTIPLIER = 2.5;

    AIH.MinigameMilkmaid._buildCaughtCandidates = function(actionType, horse) {

        var state;
        var baseId;
        var candidates;

        state =
            AIH.MinigameMilkmaid._ensure();

        baseId =
            "milkmaid_caught_" +
            actionType +
            "_" +
            Date.now();

        candidates = [];

        // --- admit --------------------------------------------------------
        candidates.push({

            action: "admit",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: baseId + "_admit",
                    type: "caught_response",
                    category: "admit",
                    description:
                        "She admits to it outright.",

                    severity: "normal",
                    reward: 0,
                    danger: 0,

                    embarrassment: 0.20,
                    dignityCost: 0.15,
                    freedomCost: 0,
                    modestyCost: 0,
                    prideCost: 0.15
                }),

            meta: {
                driftTrait: null
            }
        });

        // --- offer_excuse ---------------------------------------------------
        candidates.push({

            action: "offer_excuse",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: baseId + "_excuse",
                    type: "caught_response",
                    category: "offer_excuse",
                    description:
                        "She offers an excuse - claims it was quality testing, or something close enough to true.",

                    severity: "normal",
                    reward: 0,
                    danger: 0,

                    embarrassment: 0.10,
                    dignityCost: 0.10,
                    freedomCost: 0,
                    modestyCost: 0,
                    prideCost: 0.05
                }),

            meta: {
                driftTrait: "approvalSeeking",
                driftDirection: "increase"
            }
        });

        // --- get_defensive --------------------------------------------------
        candidates.push({

            action: "get_defensive",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: baseId + "_defensive",
                    type: "caught_response",
                    category: "get_defensive",
                    description:
                        "She argues the rule itself is unreasonable.",

                    severity: "medium",
                    reward: 0,
                    danger: 0.05,

                    embarrassment: 0.05,
                    dignityCost: 0.05,
                    freedomCost: 0.10,
                    modestyCost: 0,
                    prideCost: 0.05
                }),

            meta: {
                driftTrait: "defiance",
                driftDirection: "increase"
            }
        });

        // --- get_angry --------------------------------------------------
        candidates.push({

            action: "get_angry",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: baseId + "_angry",
                    type: "caught_response",
                    category: "get_angry",
                    description:
                        "She gets openly angry about being questioned at all.",

                    severity: "medium",
                    reward: 0,
                    danger: 0.10,

                    embarrassment: 0.05,
                    dignityCost: 0.10,
                    freedomCost: 0.15,
                    modestyCost: 0,
                    prideCost: 0
                }),

            meta: {
                driftTrait: "defiance",
                driftDirection: "increase",
                hostility: true
            }
        });

        // --- attempt_lie (once ever) ----------------------------------------
        if (
            state &&
            !state.lieEverAttempted
        ) {

            candidates.push({

                action: "attempt_lie",

                situation:
                    AIH.PressureEvaluator.normalizeSituation({

                        id: baseId + "_lie",
                        type: "caught_response",
                        category: "attempt_lie",
                        description:
                            "She considers denying it outright.",

                        severity: "rare",
                        reward: 0,
                        danger: 0,

                        embarrassment: 0.10,
                        dignityCost: 0.15,
                        freedomCost: 0,
                        modestyCost: 0,

                        /*
                         * Deliberately inflated - this is the whole point
                         * of the mechanic. Sustaining a lie under direct
                         * questioning costs far more pride than any other
                         * candidate here.
                         */
                        prideCost:
                            AIH.MinigameMilkmaid._clamp01(
                                0.30 *
                                AIH.MinigameMilkmaid.LIE_PRIDE_COST_MULTIPLIER
                            )
                    }),

                meta: {
                    isLie: true
                }
            });
        }

        return candidates;
    };

    AIH.MinigameMilkmaid.resolveCaughtEvent = function(actionType, horse) {

        var options;
        var candidates;
        var winner;
        var driftResult;
        var forcedConfession;
        var result;
        var state;

        options =
            AIH.MinigameMilkmaid._supervisorPressureOptions();

        candidates =
            AIH.MinigameMilkmaid._buildCaughtCandidates(
                actionType,
                horse
            );

        winner =
            AIH.MinigameMilkmaid._chooseBest(candidates);

        if (!winner) {
            return null;
        }

        driftResult = null;
        forcedConfession = null;
        state =
            AIH.MinigameMilkmaid._ensure();

        if (winner.action === "attempt_lie") {

            /*
             * Scripted, unconditional: the lie is never allowed to land
             * cleanly, regardless of the evaluator's initial response
             * tier. rewarded: true unconditionally, per the same
             * convention Bathhouse's backfire chain uses for "this
             * definitely, notably happened to her."
             */
            driftResult =
                AIH.MinigameMilkmaid._reportBoundaryOutcome(
                    "pride",
                    "decrease",
                    winner.evaluation,
                    0.55,
                    "attempted to lie about " +
                        actionType +
                        " and the strain of sustaining it forced a confession",
                    true
                );

            if (state) {

                state.lieEverAttempted = true;
            }

            forcedConfession = true;

            result = {

                actionType: actionType,
                chosenResponse: "attempt_lie",
                forcedConfession: true,
                finalResponse: "admit",
                evaluation: winner.evaluation,
                driftResult: driftResult
            };

        } else {

            if (winner.meta.driftTrait) {

                driftResult =
                    AIH.MinigameMilkmaid._reportBoundaryOutcome(
                        winner.meta.driftTrait,
                        winner.meta.driftDirection,
                        winner.evaluation,
                        AIH.MinigameMilkmaid._clamp01(
                            winner.situation.prideCost ||
                            winner.situation.freedomCost ||
                            0.15
                        ),
                        "caught for " +
                            actionType +
                            " and responded with " +
                            winner.action,
                        true
                    );
            }

            result = {

                actionType: actionType,
                chosenResponse: winner.action,
                forcedConfession: false,
                finalResponse: winner.action,
                evaluation: winner.evaluation,
                driftResult: driftResult
            };
        }

        AIH.MinigameMilkmaid._applyConsequence(result);

        return result;
    };

    // =========================================================================
    // CONSEQUENCES
    // =========================================================================
    //
    // Not always severe on purpose - per the design doc, a mild consequence
    // is itself meaningful evidence ("breaking this rule isn't as
    // dangerous as I thought") that the existing memory/belief system, not
    // this module, is responsible for interpreting.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.CONSEQUENCE_TIERS = [
        "no_punishment",
        "warning",
        "reduced_pay",
        "loss_of_bonus",
        "increased_supervision",
        "temporary_restriction",
        "serious_reprimand"
    ];

    /*
     * Fractions of her current shift pay docked specifically for being
     * caught consuming milk (see _applyConsequence) - "partial" for a
     * lesser tier, "major" for a worse one. Illustrative values, tune
     * during play.
     */
    AIH.MinigameMilkmaid.CONSUMED_MILK_PARTIAL_DOCK_FRACTION = 0.20;
    AIH.MinigameMilkmaid.CONSUMED_MILK_MAJOR_DOCK_FRACTION = 0.50;

    AIH.MinigameMilkmaid._applyConsequence = function(caughtResult) {

        var state;
        var supervisor;
        var severityRoll;
        var tier;
        var payPenalty;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return;
        }

        supervisor =
            AIH.MinigameMilkmaid.SUPERVISOR;

        state.caughtCount += 1;

        /*
         * A hostile/angry or a forced-confession-after-lying response
         * reads as worse to him than a clean admit or a mild excuse -
         * this is a plain read of what just happened, not a hardcoded
         * moral rule about the underlying violation itself.
         */
        severityRoll =
            Math.random() *
            (1 + supervisor.ruleEnforcement + supervisor.strictness);

        if (caughtResult.forcedConfession) {
            severityRoll += 0.6;
        }

        if (
            caughtResult.chosenResponse === "get_angry"
        ) {
            severityRoll += 0.4;
        }

        if (
            caughtResult.chosenResponse === "admit"
        ) {
            severityRoll -= 0.3;
        }

        if (severityRoll < 0.4) {
            tier = "no_punishment";
        } else if (severityRoll < 0.9) {
            tier = "warning";
        } else if (severityRoll < 1.4) {
            tier = "reduced_pay";
        } else if (severityRoll < 1.8) {
            tier = "loss_of_bonus";
        } else if (severityRoll < 2.2) {
            tier = "increased_supervision";
        } else if (severityRoll < 2.6) {
            tier = "temporary_restriction";
        } else {
            tier = "serious_reprimand";
        }

        payPenalty = 0;

        /*
         * Drinking milk she was supposed to sell is a direct, literal
         * loss of saleable product to the farm - not just a rule
         * violation to smooth over, but lost inventory. So unlike the
         * other caught action types (which keep the flat gold penalty
         * below), the supervisor docks a FRACTION of what she's earned
         * so far this shift when she's caught consuming it - partially
         * for a lesser tier, majorly for a worse one.
         */
        if (caughtResult.actionType === "consumed_milk") {

            if (
                tier === "reduced_pay" ||
                tier === "loss_of_bonus" ||
                tier === "increased_supervision"
            ) {

                payPenalty =
                    Math.round(
                        state.totalPayThisShift *
                        AIH.MinigameMilkmaid.CONSUMED_MILK_PARTIAL_DOCK_FRACTION
                    );

            } else if (
                tier === "temporary_restriction" ||
                tier === "serious_reprimand"
            ) {

                payPenalty =
                    Math.round(
                        state.totalPayThisShift *
                        AIH.MinigameMilkmaid.CONSUMED_MILK_MAJOR_DOCK_FRACTION
                    );
            }

        } else if (
            tier === "reduced_pay" ||
            tier === "loss_of_bonus"
        ) {

            payPenalty = 15;

        } else if (
            tier === "temporary_restriction" ||
            tier === "serious_reprimand"
        ) {

            payPenalty = 30;
        }

        state.totalPayThisShift =
            Math.max(
                0,
                state.totalPayThisShift - payPenalty
            );

        caughtResult.consequenceTier = tier;
        caughtResult.payPenalty = payPenalty;
        caughtResult.payDockedAsFraction =
            caughtResult.actionType === "consumed_milk" &&
            payPenalty > 0;

        /*
         * Dominance shifts toward him - being caught and consequenced is,
         * regardless of tier, a moment where he held real leverage over
         * her. A milder tier shifts it less than a severe one.
         */
        AIH.MinigameMilkmaid.modifySupervisorRelationship(
            {
                dominance:
                    tier === "no_punishment" ? 1 :
                    tier === "warning" ? 2 :
                    tier === "reduced_pay" ? 3 :
                    tier === "loss_of_bonus" ? 3 :
                    tier === "increased_supervision" ? 4 :
                    5,

                submissiveness:
                    caughtResult.forcedConfession ? 3 : 1
            },
            "caught for " +
                caughtResult.actionType +
                ", consequence: " +
                tier
        );
    };

    // =========================================================================
    // SUPERVISOR EVENTS (workload, extra pay, unpleasant task, rule
    // reminder, suspicion, moral pressure)
    // =========================================================================

    AIH.MinigameMilkmaid.SUPERVISOR_EVENTS = {

        increased_workload: {

            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0,
                dignityCost: 0.05,
                freedomCost: 0.20,
                modestyCost: 0,
                prideCost: 0
            },

            driftTrait: "assertiveness",
            driftDirectionOnRefuse: "increase",
            driftDirectionOnAccept: "decrease"
        },

        extra_pay_offer: {

            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0,
                dignityCost: 0,
                freedomCost: 0.10,
                modestyCost: 0,
                prideCost: 0
            }
        },

        unpleasant_task: {

            baseSituation: {
                severity: "medium",
                danger: 0.10,
                embarrassment: 0.10,
                dignityCost: 0.15,
                freedomCost: 0.15,
                modestyCost: 0,
                prideCost: 0.05
            },

            driftTrait: "mercy",
            driftDirectionOnAccept: "increase"
        },

        rule_reminder: {

            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0.05,
                dignityCost: 0.05,
                freedomCost: 0,
                modestyCost: 0,
                prideCost: 0.05
            }
        },

        suspicion: {

            baseSituation: {
                severity: "medium",
                danger: 0,
                embarrassment: 0.15,
                dignityCost: 0.15,
                freedomCost: 0,
                modestyCost: 0,
                prideCost: 0.15
            },

            driftTrait: "trust",
            driftDirectionOnAccept: "decrease"
        },

        moral_pressure: {

            baseSituation: {
                severity: "medium",
                danger: 0,
                embarrassment: 0.05,
                dignityCost: 0.05,
                freedomCost: 0.05,
                modestyCost: 0.10,
                prideCost: 0
            },

            driftTrait: "inhibition",
            driftDirectionOnAccept: "decrease"
        }
    };

    AIH.MinigameMilkmaid.resolveSupervisorEvent = function(eventType) {

        var template;
        var options;
        var context;
        var reward;
        var raw;
        var situation;
        var evaluation;
        var accepted;
        var driftResult;

        template =
            AIH.MinigameMilkmaid.SUPERVISOR_EVENTS[eventType];

        if (!template) {
            return null;
        }

        options =
            AIH.MinigameMilkmaid._supervisorPressureOptions();

        context =
            AIH.MinigameMilkmaid._context() ||
            {};

        reward =
            eventType === "extra_pay_offer" ?
                context.bonusOffered ||
                Math.round(
                    AIH.MinigameMilkmaid._randomBetween(15, 40)
                ) :
                0;

        raw =
            Object.assign(
                {},
                template.baseSituation,
                {
                    id:
                        "milkmaid_supervisor_" +
                        eventType +
                        "_" +
                        Date.now(),

                    type: "supervisor_event",
                    category: eventType,
                    description:
                        "The supervisor: " +
                        eventType,

                    reward: reward,
                    survivalBenefit: 0,
                    combatAdvantage: 0
                }
            );

        situation =
            AIH.PressureEvaluator.normalizeSituation(raw);

        evaluation =
            AIH.PressureEvaluator.evaluate(
                situation,
                options
            );

        accepted =
            evaluation.response === "accept" ||
            evaluation.response === "reluctant_accept" ||
            evaluation.response === "partial";

        driftResult = null;

        if (
            template.driftTrait &&
            accepted &&
            template.driftDirectionOnAccept
        ) {

            driftResult =
                AIH.MinigameMilkmaid._reportBoundaryOutcome(
                    template.driftTrait,
                    template.driftDirectionOnAccept,
                    evaluation,
                    AIH.MinigameMilkmaid._clamp01(
                        situation.freedomCost ||
                        situation.dignityCost ||
                        0.15
                    ),
                    "supervisor event '" +
                        eventType +
                        "' - accepted"
                );

        } else if (
            template.driftTrait &&
            !accepted &&
            template.driftDirectionOnRefuse
        ) {

            driftResult =
                AIH.MinigameMilkmaid._reportBoundaryOutcome(
                    template.driftTrait,
                    template.driftDirectionOnRefuse,
                    evaluation,
                    AIH.MinigameMilkmaid._clamp01(
                        situation.freedomCost ||
                        situation.dignityCost ||
                        0.15
                    ),
                    "supervisor event '" +
                        eventType +
                        "' - refused",
                    true
                );
        }

        return {

            eventType: eventType,
            evaluation: evaluation,
            accepted: accepted,
            reward:
                accepted ? reward : 0,
            driftResult: driftResult
        };
    };

    // =========================================================================
    // PRODUCTION -> RESPECT/PRIDE FEEDBACK
    // =========================================================================
    //
    // Tracked honestly against the shift's target regardless of method -
    // this module does not gate respect on purity, it just reports what
    // actually happened and lets the evaluator/drift engine react.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.evaluateShiftProduction = function() {

        var state;
        var metTarget;
        var ratio;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return null;
        }

        ratio =
            state.currentTarget > 0 ?
                state.totalVolumeThisShift / state.currentTarget :
                1;

        metTarget =
            ratio >= 1.0;

        if (metTarget) {

            AIH.MinigameMilkmaid.modifySupervisorRelationship(
                {
                    respect: 4,
                    dominance: -1
                },
                "hit her production target this shift"
            );

            if (
                typeof AIH.PersonalityDrift !== "undefined" &&
                AIH.PersonalityDrift.reinforce
            ) {

                AIH.PersonalityDrift.reinforce(
                    "pride",
                    "increase",
                    {
                        rewarded: true,
                        magnitude: 0.3,
                        reason:
                            "hit an unrealistic production target and takes real pride in the skill it took"
                    }
                );
            }

        } else if (ratio < 0.7) {

            AIH.MinigameMilkmaid.modifySupervisorRelationship(
                {
                    respect: -2,
                    dominance: 2
                },
                "fell well short of her production target this shift"
            );
        }

        AIH.MinigameMilkmaid.checkReputationAmbitionGoal(metTarget);

        return {
            ratio: ratio,
            metTarget: metTarget
        };
    };

    // =========================================================================
    // EMERGENT GOAL - REPUTATION AMBITION (skill-pride pattern, mirrors
    // Bathhouse's own worked example)
    // =========================================================================

    AIH.MinigameMilkmaid.REPUTATION_GOAL_THRESHOLD = 3;

    AIH.MinigameMilkmaid.REPUTATION_GOAL_DESCRIPTIONS = [
        "Become known as the best milkmaid this farm has ever had.",
        "Prove she can hit any target the supervisor sets, honestly.",
        "Master the work well enough that nobody questions her again."
    ];

    AIH.MinigameMilkmaid._hasActiveReputationGoal = function() {

        var goals;
        var i;

        if (
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.all
        ) {

            return false;
        }

        goals =
            AIH.Goals.all();

        for (
            i = 0;
            i < goals.length;
            i++
        ) {

            if (
                goals[i].category === "reputation_ambition" &&
                (
                    goals[i].status === "active" ||
                    goals[i].status === "proposed"
                )
            ) {

                return true;
            }
        }

        return false;
    };

    AIH.MinigameMilkmaid.checkReputationAmbitionGoal = function(metTarget) {

        var state;

        if (
            !metTarget ||
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.create
        ) {

            return;
        }

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return;
        }

        state.confrontationsHandledWell =
            (state.confrontationsHandledWell || 0) + 1;

        if (
            state.confrontationsHandledWell <
            AIH.MinigameMilkmaid.REPUTATION_GOAL_THRESHOLD
        ) {

            return;
        }

        if (AIH.MinigameMilkmaid._hasActiveReputationGoal()) {
            return;
        }

        AIH.Goals.create({

            description:
                AIH.MinigameMilkmaid._pickRandom(
                    AIH.MinigameMilkmaid.REPUTATION_GOAL_DESCRIPTIONS
                ),

            category: "reputation_ambition",
            origin: "emergent",
            baseWeight: 0.5,

            linkedValues: [
                "status",
                "pride"
            ],

            reason:
                "she has hit her production target " +
                state.confrontationsHandledWell +
                " times on the farm"
        });
    };

    // =========================================================================
    // FAVOR SYSTEM
    // =========================================================================

    AIH.MinigameMilkmaid.buildFavorDemandSituation = function() {

        var context;
        var raw;

        context =
            AIH.MinigameMilkmaid._context() ||
            {};

        raw = {

            id:
                "milkmaid_favor_" +
                Date.now(),

            type: "personal_favor",
            category: "delivery_in_uniform",

            description:
                "He wants her to deliver produce into town wearing the farm's official uniform.",

            severity: "medium",

            reward:
                Math.round(
                    AIH.MinigameMilkmaid._randomBetween(10, 25)
                ),

            danger: 0,

            embarrassment: 0.35,

            dignityCost: 0.25,
            freedomCost: 0.20,

            /*
             * Not sexual - purely a self-image/femme-coding-vs-"world's #1
             * adventurer" cost, kept matter-of-fact and agricultural.
             */
            modestyCost: 0.20,

            prideCost: 0.40,

            survivalBenefit: 0,
            combatAdvantage: 0
        };

        return AIH.PressureEvaluator.normalizeSituation(raw);
    };

    AIH.MinigameMilkmaid.isFavorSystemUnlocked = function() {

        var state;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return false;
        }

        return state.caughtCount >=
            AIH.MinigameMilkmaid.FAVOR_UNLOCK_THRESHOLD;
    };

    /*
     * The maximum fraction of her current shift pay a single favor can
     * dock, reached only at favorIntensity 1.0 (the most demanding
     * favor); see resolveFavorDemand. Deliberately smaller than either
     * CONSUMED_MILK_*_DOCK_FRACTION - complying with a favor costs her
     * less than getting caught drinking milk does.
     */
    AIH.MinigameMilkmaid.FAVOR_PAY_DOCK_MAX_FRACTION = 0.15;

    AIH.MinigameMilkmaid.resolveFavorDemand = function() {

        var options;
        var situation;
        var evaluation;
        var accepted;
        var driftResult;
        var state;
        var delivery;
        var favorIntensity;
        var favorPayPenalty;

        if (!AIH.MinigameMilkmaid.isFavorSystemUnlocked()) {
            return null;
        }

        options =
            AIH.MinigameMilkmaid._supervisorPressureOptions();

        situation =
            AIH.MinigameMilkmaid.buildFavorDemandSituation();

        evaluation =
            AIH.PressureEvaluator.evaluate(
                situation,
                options
            );

        accepted =
            evaluation.response === "accept" ||
            evaluation.response === "reluctant_accept" ||
            evaluation.response === "partial";

        driftResult = null;
        state =
            AIH.MinigameMilkmaid._ensure();

        if (accepted) {

            driftResult =
                AIH.MinigameMilkmaid._reportBoundaryOutcome(
                    "inhibition",
                    "decrease",
                    evaluation,
                    AIH.MinigameMilkmaid._clamp01(
                        situation.modestyCost ||
                        situation.prideCost ||
                        0.3
                    ),
                    "agreed to run a personal delivery favor in the official uniform"
                );

            /*
             * Time spent on the favor is time not spent milking - the
             * supervisor docks a fraction of what she's earned so far
             * this shift, scaled by how demanding THIS PARTICULAR favor
             * was (its own freedomCost/prideCost/modestyCost), not a
             * flat amount. A quick, low-stakes favor barely dents her
             * pay; a bigger, more mortifying one costs more - and even
             * the most demanding favor docks less than getting caught
             * drinking milk does (see CONSUMED_MILK_MAJOR_DOCK_FRACTION).
             */
            favorIntensity =
                AIH.MinigameMilkmaid._clamp01(
                    (
                        (situation.freedomCost || 0) +
                        (situation.prideCost || 0) +
                        (situation.modestyCost || 0)
                    ) / 3
                );

            favorPayPenalty =
                Math.round(
                    state.totalPayThisShift *
                    AIH.MinigameMilkmaid.FAVOR_PAY_DOCK_MAX_FRACTION *
                    favorIntensity
                );

            if (state) {

                state.totalPayThisShift =
                    Math.max(
                        0,
                        state.totalPayThisShift - favorPayPenalty
                    );
            }

            AIH.MinigameMilkmaid.modifySupervisorRelationship(
                {
                    dominance: 2,
                    submissiveness: 2
                },
                "complied with a personal favor demand"
            );

            if (state) {
                state.favorRefusalStreak = 0;
            }

            delivery =
                AIH.MinigameMilkmaid.resolveDelivery();

        } else {

            favorPayPenalty = 0;

            AIH.MinigameMilkmaid.modifySupervisorRelationship(
                {
                    respect: -1,
                    dominance: 1
                },
                "refused a personal favor demand"
            );

            if (state) {
                state.favorRefusalStreak =
                    (state.favorRefusalStreak || 0) + 1;
            }

            delivery = null;
        }

        return {

            evaluation: evaluation,
            accepted: accepted,
            driftResult: driftResult,
            payPenalty: favorPayPenalty,
            delivery: delivery
        };
    };

    // =========================================================================
    // DELIVERY / SPILL ENCOUNTER
    // =========================================================================
    //
    // A nested sub-situation like Bathhouse's confrontation-within-visit.
    // Faction witnesses cost that faction's Reputation.dominance and chip
    // her own inhibition, independent of whether a spill attempt happens
    // at all. A spill attempt is its own small chooseBest (protect the
    // produce / brush past / confront the interferer), and IF it still
    // spills, a second decision (apologize vs go back for more) resolves
    // how she handles it.
    //
    // Ported from AIH_Minigame_tastetest.js's latest revision: unlike a
    // single-maker taste sample, a delivery run is a genuine GROUP
    // situation (however many people happen to be on the road watching)
    // - so, same as that file's _groupPressureOptions/_mergeOptions
    // addition, group composition itself is a real input here, not just
    // whichever single supervisor/faction pressure was already in scope.
    // Two knobs, both fed from state this module already has honestly
    // rather than assumed:
    //
    //   - approval-seeking crowd pressure: her REAL current
    //     AIH.Personality.getTrait("approvalSeeking") scales pressure
    //     with how many witnesses happen to be present at once - a
    //     heroine who cares more what onlookers think feels a bigger
    //     crowd more, exactly tastetest's own reasoning.
    //
    //   - unlike tastetest's "most-trusted regular in the group" discount,
    //     Milkmaid has no per-witness relationship tracking (faction
    //     witnesses are anonymous, not named regulars) - so only the
    //     crowd-size pressure half of the pattern applies here; there is
    //     no trust-based discount to compute for people she has no
    //     tracked relationship with.
    //
    // =========================================================================

    AIH.MinigameMilkmaid.DELIVERY_WITNESS_FACTIONS = [
        "Adventurers Circle",
        "Farm Hands Guild"
    ];

    AIH.MinigameMilkmaid.DELIVERY_INTERFERENCE_CHANCE = 0.35;

    /*
     * Sums both fields of two options objects, same role as
     * AIH_Minigame_tastetest.js's _mergeOptions - layers group-level
     * pressure on top of the supervisor's own pressure without either
     * one silently overwriting the other.
     */
    AIH.MinigameMilkmaid._mergeOptions = function(a, b) {

        a = a || {};
        b = b || {};

        return {

            domainPressure:
                (Number(a.domainPressure) || 0) +
                (Number(b.domainPressure) || 0),

            attachmentDiscount:
                (Number(a.attachmentDiscount) || 0) +
                (Number(b.attachmentDiscount) || 0)
        };
    };

    AIH.MinigameMilkmaid._witnessGroupPressureOptions = function(witnessCount) {

        var approvalSeeking;
        var groupSize;

        approvalSeeking =
            (
                typeof AIH.Personality !== "undefined" &&
                AIH.Personality.getTrait
            ) ?
                AIH.MinigameMilkmaid._clamp01(
                    AIH.Personality.getTrait("approvalSeeking")
                ) :
                0.5;

        groupSize =
            Math.max(1, AIH.MinigameMilkmaid._number(witnessCount, 1));

        return {

            domainPressure:
                approvalSeeking *
                Math.min(groupSize - 1, 7) *
                0.08,

            attachmentDiscount: 0
        };
    };

    AIH.MinigameMilkmaid._resolveUniformSighting = function(witnessCount) {

        var faction;
        var evaluation;
        var situation;
        var options;
        var driftResult;

        faction =
            AIH.MinigameMilkmaid._pickRandom(
                AIH.MinigameMilkmaid.DELIVERY_WITNESS_FACTIONS
            );

        if (
            !faction ||
            typeof AIH.Reputation === "undefined" ||
            !AIH.Reputation.modifyAxes
        ) {

            return null;
        }

        if (
            AIH.Reputation.hasFaction &&
            !AIH.Reputation.hasFaction(faction) &&
            AIH.Reputation.addFaction
        ) {

            AIH.Reputation.addFaction(faction);
        }

        AIH.Reputation.modifyAxes(
            faction,
            { dominance: -2 },
            "seen delivering produce in the farm uniform by " +
                faction
        );

        options =
            AIH.MinigameMilkmaid._mergeOptions(
                AIH.MinigameMilkmaid._supervisorPressureOptions(),
                AIH.MinigameMilkmaid._witnessGroupPressureOptions(witnessCount)
            );

        situation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "milkmaid_uniform_seen_" + Date.now(),
                type: "personal_favor",
                category: "uniform_sighting",
                description:
                    faction +
                    " members recognize her in the uniform on the road.",

                severity: "medium",
                reward: 0,
                danger: 0,

                embarrassment: 0.40,
                dignityCost: 0.20,
                freedomCost: 0,
                modestyCost: 0.15,
                prideCost: 0.30
            });

        evaluation =
            AIH.PressureEvaluator.evaluate(
                situation,
                options
            );

        driftResult =
            AIH.MinigameMilkmaid._reportBoundaryOutcome(
                "inhibition",
                "decrease",
                evaluation,
                0.30,
                faction +
                    " members saw her in the uniform on a delivery run",
                true
            );

        return {

            faction: faction,
            evaluation: evaluation,
            driftResult: driftResult
        };
    };

    AIH.MinigameMilkmaid._buildSpillInterferenceCandidates = function(options) {

        var baseId;

        baseId =
            "milkmaid_spill_" +
            Date.now();

        return [

            {
                action: "protect_produce",
                options: options,
                situation:
                    AIH.PressureEvaluator.normalizeSituation({

                        id: baseId + "_protect",
                        type: "delivery_interference",
                        category: "protect_produce",
                        description:
                            "She braces to keep the produce from being knocked over.",

                        severity: "normal",
                        reward: 0,
                        danger: 0.10,

                        embarrassment: 0.10,
                        dignityCost: 0.05,
                        freedomCost: 0.05,
                        modestyCost: 0,
                        prideCost: 0
                    }),
                meta: { driftTrait: "assertiveness", driftDirection: "increase" }
            },

            {
                action: "brush_past",
                options: options,
                situation:
                    AIH.PressureEvaluator.normalizeSituation({

                        id: baseId + "_brush",
                        type: "delivery_interference",
                        category: "brush_past",
                        description:
                            "She tries to simply walk past without engaging.",

                        severity: "normal",
                        reward: 0,
                        danger: 0,

                        embarrassment: 0.15,
                        dignityCost: 0.10,
                        freedomCost: 0.10,
                        modestyCost: 0,
                        prideCost: 0.10
                    }),
                meta: { driftTrait: "approvalSeeking", driftDirection: "increase" }
            },

            {
                action: "confront_interferer",
                options: options,
                situation:
                    AIH.PressureEvaluator.normalizeSituation({

                        id: baseId + "_confront",
                        type: "delivery_interference",
                        category: "confront_interferer",
                        description:
                            "She confronts whoever is trying to make her spill it.",

                        severity: "medium",
                        reward: 0,
                        danger: 0.15,

                        embarrassment: 0.05,
                        dignityCost: 0,
                        freedomCost: 0,
                        modestyCost: 0,
                        prideCost: 0
                    }),
                meta: { driftTrait: "defiance", driftDirection: "increase" }
            }
        ];
    };

    AIH.MinigameMilkmaid._resolveSpillAftermath = function(options) {

        var candidates;
        var baseId;
        var winner;
        var driftResult;

        baseId =
            "milkmaid_spillaftermath_" +
            Date.now();

        candidates = [

            {
                action: "apologize",
                options: options,
                situation:
                    AIH.PressureEvaluator.normalizeSituation({

                        id: baseId + "_apologize",
                        type: "delivery_interference",
                        category: "apologize",
                        description:
                            "She apologizes and moves on quickly.",

                        severity: "normal",
                        reward: 0,
                        danger: 0,

                        embarrassment: 0.15,
                        dignityCost: 0.15,
                        freedomCost: 0,
                        modestyCost: 0,
                        prideCost: 0.20
                    }),
                meta: { driftTrait: "approvalSeeking", driftDirection: "increase" }
            },

            {
                action: "go_back_for_more",
                options: options,
                situation:
                    AIH.PressureEvaluator.normalizeSituation({

                        id: baseId + "_backformore",
                        type: "delivery_interference",
                        category: "go_back_for_more",
                        description:
                            "She refuses to apologize and goes back to the farm for more produce instead.",

                        severity: "normal",
                        reward: 0,
                        danger: 0,

                        embarrassment: 0.05,
                        dignityCost: 0,
                        freedomCost: 0.25,
                        modestyCost: 0,
                        prideCost: 0
                    }),
                meta: { driftTrait: "independence", driftDirection: "increase" }
            }
        ];

        winner =
            AIH.MinigameMilkmaid._chooseBest(candidates);

        if (!winner) {
            return null;
        }

        driftResult =
            AIH.MinigameMilkmaid._reportBoundaryOutcome(
                winner.meta.driftTrait,
                winner.meta.driftDirection,
                winner.evaluation,
                AIH.MinigameMilkmaid._clamp01(
                    winner.situation.prideCost ||
                    winner.situation.freedomCost ||
                    0.15
                ),
                "handled the aftermath of a spilled delivery: " +
                    winner.action,
                true
            );

        return {
            action: winner.action,
            evaluation: winner.evaluation,
            driftResult: driftResult
        };
    };

    AIH.MinigameMilkmaid.resolveDelivery = function() {

        var witnessCount;
        var options;
        var sighting;
        var interferenceOccurs;
        var candidates;
        var winner;
        var spilled;
        var aftermath;

        /*
         * How many people happen to be on the road for this delivery run
         * - a genuine group circumstance, same reasoning as
         * AIH_Minigame_tastetest.js's batch-size-driven group pressure.
         * Rolled once per delivery and reused across the sighting and
         * interference sub-resolutions below, same as batchIntensity is
         * reused across a whole taste-test batch.
         */
        witnessCount =
            1 + Math.floor(AIH.MinigameMilkmaid._randomBetween(0, 4));

        options =
            AIH.MinigameMilkmaid._mergeOptions(
                AIH.MinigameMilkmaid._supervisorPressureOptions(),
                AIH.MinigameMilkmaid._witnessGroupPressureOptions(witnessCount)
            );

        sighting =
            Math.random() < 0.5 ?
                AIH.MinigameMilkmaid._resolveUniformSighting(witnessCount) :
                null;

        interferenceOccurs =
            Math.random() <
            AIH.MinigameMilkmaid.DELIVERY_INTERFERENCE_CHANCE;

        if (!interferenceOccurs) {

            return {
                sighting: sighting,
                interferenceOccurred: false,
                winner: null,
                spilled: false,
                aftermath: null
            };
        }

        candidates =
            AIH.MinigameMilkmaid._buildSpillInterferenceCandidates(
                options
            );

        winner =
            AIH.MinigameMilkmaid._chooseBest(candidates);

        if (winner) {

            AIH.MinigameMilkmaid._reportBoundaryOutcome(
                winner.meta.driftTrait,
                winner.meta.driftDirection,
                winner.evaluation,
                AIH.MinigameMilkmaid._clamp01(
                    winner.situation.prideCost ||
                    winner.situation.freedomCost ||
                    0.15
                ),
                "responded to delivery interference: " +
                    winner.action,
                true
            );
        }

        /*
         * confront_interferer clears cleanly on "reject" (she holds the
         * produce steady by winning the confrontation); the other two
         * options carry a real, if smaller, spill risk even when chosen
         * well - matching Bathhouse2's lesson that no candidate should be
         * a structurally free win.
         */
        spilled =
            !winner ||
            (
                winner.action === "confront_interferer" ?
                    winner.evaluation.response !== "reject" :
                    winner.evaluation.response === "reject" ||
                    winner.evaluation.response === "partial"
            );

        aftermath =
            spilled ?
                AIH.MinigameMilkmaid._resolveSpillAftermath(options) :
                null;

        return {

            sighting: sighting,
            interferenceOccurred: true,
            winner: winner,
            spilled: spilled,
            aftermath: aftermath
        };
    };

    // =========================================================================
    // SHIFT MANAGEMENT
    // =========================================================================

    AIH.MinigameMilkmaid.SHIFT_TIME_BUDGET = 600;

    AIH.MinigameMilkmaid.startShift = function(horseIds) {

        var state;
        var i;
        var horse;
        var estimatedTotal;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return;
        }

        AIH.MinigameMilkmaid.ensureSupervisorRelationship();

        state.shiftActive = true;
        state.shiftLog = [];
        state.assignedHorseIds =
            horseIds && horseIds.length ?
                horseIds.slice() :
                Object.keys(AIH.MinigameMilkmaid.HORSES);

        state.nextHorseIndex = 0;
        state.totalVolumeThisShift = 0;
        state.totalPayThisShift = 0;

        estimatedTotal = 0;

        for (
            i = 0;
            i < state.assignedHorseIds.length;
            i++
        ) {

            horse =
                AIH.MinigameMilkmaid.HORSES[state.assignedHorseIds[i]];

            if (horse) {

                estimatedTotal +=
                    horse.baseYield;
            }
        }

        state.currentTarget =
            Math.round(
                estimatedTotal *
                AIH.MinigameMilkmaid.SUPERVISOR.targetMultiplier
            );

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Milkmaid shift started. Target: " +
                state.currentTarget
            );
        }
    };

    AIH.MinigameMilkmaid.serveNextHorse = function() {

        var state;
        var horseId;
        var horse;
        var methodResult;
        var qualityResult;
        var temptationResult;
        var caughtResult;
        var eventRecord;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (
            !state ||
            !state.shiftActive
        ) {

            return null;
        }

        if (
            state.nextHorseIndex >=
            state.assignedHorseIds.length
        ) {

            return null;
        }

        horseId =
            state.assignedHorseIds[state.nextHorseIndex];

        state.nextHorseIndex += 1;

        horse =
            AIH.MinigameMilkmaid.getHorse(horseId) ||
            AIH.MinigameMilkmaid.generateHorse();

        methodResult =
            AIH.MinigameMilkmaid.resolveMilkingChoice(horse);

        caughtResult = null;

        if (
            methodResult &&
            methodResult.ruleViolation &&
            AIH.MinigameMilkmaid.rollDetection("milking_method")
        ) {

            caughtResult =
                AIH.MinigameMilkmaid.resolveCaughtEvent(
                    "milking_method",
                    horse
                );
        }

        qualityResult =
            AIH.MinigameMilkmaid.resolveQualityCheck(
                horse,
                methodResult
            );

        if (
            qualityResult &&
            qualityResult.ruleViolation &&
            !caughtResult &&
            AIH.MinigameMilkmaid.rollDetection("personal_taste_test")
        ) {

            caughtResult =
                AIH.MinigameMilkmaid.resolveCaughtEvent(
                    "personal_taste_test",
                    horse
                );
        }

        if (
            methodResult &&
            methodResult.causesTasteExposure
        ) {

            AIH.MinigameMilkmaid._recordTasteExposure(0.5);
        }

        temptationResult =
            AIH.MinigameMilkmaid.resolveConsumptionTemptation(
                horse
            );

        if (
            temptationResult &&
            temptationResult.ruleViolation &&
            !caughtResult &&
            AIH.MinigameMilkmaid.rollDetection("consumed_milk")
        ) {

            caughtResult =
                AIH.MinigameMilkmaid.resolveCaughtEvent(
                    "consumed_milk",
                    horse
                );
        }

        if (methodResult) {

            state.totalVolumeThisShift +=
                methodResult.yield;

            state.totalPayThisShift +=
                methodResult.yield;
        }

        eventRecord = {

            horseId: horse.id,
            horseName: horse.name,
            methodResult: methodResult,
            qualityResult: qualityResult,
            temptationResult: temptationResult,
            caughtResult: caughtResult
        };

        state.shiftLog.push(eventRecord);

        return eventRecord;
    };

    AIH.MinigameMilkmaid.endShift = function() {

        var state;
        var production;
        var favorResult;
        var summary;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (
            !state ||
            !state.shiftActive
        ) {

            return null;
        }

        production =
            AIH.MinigameMilkmaid.evaluateShiftProduction();

        favorResult = null;

        if (
            AIH.MinigameMilkmaid.isFavorSystemUnlocked() &&
            Math.random() < 0.5
        ) {

            favorResult =
                AIH.MinigameMilkmaid.resolveFavorDemand();
        }

        state.shiftActive = false;
        state.totalShiftsCompleted += 1;

        summary = {

            totalVolume: state.totalVolumeThisShift,
            totalPay: state.totalPayThisShift,
            target: state.currentTarget,
            production: production,
            favorResult: favorResult,
            shiftLog:
                AIH.MinigameMilkmaid._copy(state.shiftLog)
        };

        return summary;
    };

    AIH.MinigameMilkmaid.getShiftLog = function() {

        var state;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return [];
        }

        return AIH.MinigameMilkmaid._copy(
            state.shiftLog
        );
    };

    AIH.MinigameMilkmaid.getStatus = function() {

        var state;

        state =
            AIH.MinigameMilkmaid._ensure();

        if (!state) {
            return null;
        }

        return {

            shiftActive: state.shiftActive,
            totalVolumeThisShift: state.totalVolumeThisShift,
            totalPayThisShift: state.totalPayThisShift,
            currentTarget: state.currentTarget,
            milkFamiliarity: state.milkFamiliarity,
            caughtCount: state.caughtCount,
            lieEverAttempted: state.lieEverAttempted,
            favorSystemUnlocked:
                AIH.MinigameMilkmaid.isFavorSystemUnlocked(),
            tasteDescriptor:
                AIH.MinigameMilkmaid.tasteDescriptor()
        };
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.MinigameMilkmaid.initialize = function() {

        AIH.MinigameMilkmaid._ensure();

        AIH.MinigameMilkmaid._initialized = true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Milkmaid minigame initialized."
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
            "MinigameMilkmaid",
            {
                version: AIH.MinigameMilkmaid.VERSION,

                initialize: function() {
                    AIH.MinigameMilkmaid.initialize();
                },

                startShift: function(horseIds) {
                    return AIH.MinigameMilkmaid.startShift(horseIds);
                },

                serveNextHorse: function() {
                    return AIH.MinigameMilkmaid.serveNextHorse();
                },

                endShift: function() {
                    return AIH.MinigameMilkmaid.endShift();
                },

                getStatus: function() {
                    return AIH.MinigameMilkmaid.getStatus();
                }
            }
        );
    }

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_Minigame_Milkmaid",
            "StartShift",
            function() {
                AIH.MinigameMilkmaid.startShift();
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Milkmaid",
            "ServeNextHorse",
            function() {

                var result;

                result =
                    AIH.MinigameMilkmaid.serveNextHorse();

                AIH.Debug.inspect(
                    "Milkmaid horse resolved:",
                    result
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Milkmaid",
            "TriggerSupervisorEvent",
            function(args) {

                var result;

                result =
                    AIH.MinigameMilkmaid.resolveSupervisorEvent(
                        args.eventType
                    );

                AIH.Debug.inspect(
                    "Milkmaid supervisor event resolved:",
                    result
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Milkmaid",
            "EndShift",
            function() {

                var summary;

                summary =
                    AIH.MinigameMilkmaid.endShift();

                AIH.Debug.inspect(
                    "Milkmaid shift ended:",
                    summary
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Milkmaid",
            "ShowShiftLog",
            function() {

                AIH.Debug.inspect(
                    "Current milkmaid shift log:",
                    AIH.MinigameMilkmaid.getShiftLog()
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Milkmaid",
            "SetMana",
            function(args) {

                AIH.MinigameMilkmaid.setManaFraction(
                    Number(args.fraction)
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Milkmaid",
            "SetSupervisorPresent",
            function(args) {

                AIH.MinigameMilkmaid.setSupervisorPresent(
                    args.present === "true" ||
                    args.present === true
                );
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_MinigameMilkmaid_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_MinigameMilkmaid_createGameObjects.call(this);

            AIH.MinigameMilkmaid.initialize();
        };

        var _AIH_MinigameMilkmaid_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_MinigameMilkmaid_setupNewGame.call(this);

            AIH.MinigameMilkmaid._initialized = false;

            AIH.MinigameMilkmaid.initialize();
        };

        var _AIH_MinigameMilkmaid_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents = function(contents) {

            _AIH_MinigameMilkmaid_extractSaveContents.call(this, contents);

            AIH.MinigameMilkmaid._initialized = false;

            AIH.MinigameMilkmaid.initialize();
        };
    }

})();