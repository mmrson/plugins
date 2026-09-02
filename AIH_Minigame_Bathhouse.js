/*:
 * @plugindesc AI Hero Framework - Minigame: Intimate Service (Bathhouse) v0.2.2
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - MINIGAME: INTIMATE SERVICE (BATHHOUSE ATTENDANT)
 * ============================================================================
 *
 * Implements the Bathhouse Attendant activity from the "Intimate Service
 * Framework" (handoff doc Section 10.B). Covers Bathhouse Attendant work;
 * Gentlemen's Club Entertainment is a separate future activity under the
 * same framework and is out of scope here.
 *
 * This module owns NO psychology. Every decision the heroine makes comes
 * from AIH.PressureEvaluator.evaluate() (via this module's own _evaluate()
 * wrapper - see CURSED ITEM INTEGRATION below) reading her real, current
 * Personality/Values/Emotions. This file's only jobs are:
 *
 *     1. Model patrons and requests as DATA (templates), not code.
 *     2. Turn a request into a PressureEvaluator situation object.
 *     3. Turn the evaluator's response into an in-fiction outcome.
 *     4. Report that outcome back via PersonalityDrift.reinforce() and,
 *        where warranted, Goals.create() / Relationships / Reputation.
 *
 * Per Section 8's core rule, there is no "if lewdness > 50 then X" anywhere
 * in this file. Patron persistence, reward, and social cost are all just
 * inputs to the shared evaluator; the evaluator + her real state decide
 * what happens.
 *
 * ============================================================================
 *
 * v0.1.1 CHANGELOG (merge)
 *
 * - Base is the branch that (a) fixed _chooseBest to rank candidates by
 *   raw score rather than (RESPONSE_RANK*10 + score) - the old tier
 *   multiplier manufactured artificial ~10-point margins out of tier-
 *   boundary crossings that were often only ~0.02-0.05 in real score
 *   terms, swamping the legitimate psychology-driven variation this
 *   system exists to produce - and (b) integrated AIH_ValueDrift.js via
 *   _reportBoundaryOutcomeReinforce(), so sustained, deeply-rewarded
 *   drift on inhibition/independence/pride can eventually pull the
 *   paired Values field (modesty/freedom/dignity) too, per that
 *   module's own design.
 *
 * - Re-merged back in from an earlier branch: the full helper-favor-
 *   demand escalation chain on call_for_help
 *   (_resolveHelperFavorDemand/_resolveGroupHostileEscalation/
 *   CONFRONTATION_HELPER_FAVOR_CHANCE).
 *
 * - Trait choices (independence for deflect_calmly, pride for
 *   call_for_help, inhibition for intervene_physically, riskTolerance
 *   for the deflect backfire) verified directly against
 *   AIH_PressureEvaluator.js v1.0.1's actual _personalityPressure/
 *   resistance math: each is the trait weighed against that candidate's
 *   OWN dominant situational cost, at the largest coefficient touching
 *   it. assertiveness/trust are genuinely read by v1.0.1 too, but only
 *   via secondary, smaller-coefficient terms (embarrassment, and danger
 *   at a much lower weight respectively) - real, but not the dominant
 *   lever for these specific candidates.
 *
 * ============================================================================
 *
 * v0.2.0 CHANGELOG
 *
 * - CURSED ITEM INTEGRATION: every evaluation this module makes now goes
 *   through AIH.CursedItems.evaluateWithPossibleFlip() (via the new
 *   _evaluate() wrapper below) when that module is loaded, exactly like
 *   AIH_Minigame_Service.js/AIH_Minigame_TasteTest.js already do. Four
 *   new bathhouse-specific cursed items were added to
 *   AIH_CursedItems.js's DEFINITIONS to go with it - see CURSED ITEM
 *   INTEGRATION below and that file's own v0.3.0 changelog.
 *
 * - _chooseBest's raw-score fix and the ValueDrift/helper-favor-demand
 *   integration from v0.1.1 are unchanged.
 *
 * ============================================================================
 *
 * v0.2.1 CHANGELOG
 *
 * - intervene_physically's drift reporting corrected: per design
 *   decision, physically stepping in expresses assertiveness/
 *   decisiveness FIRST - a confident heroine intervenes regardless of
 *   the modesty risk, a less assertive one who still does it reads as
 *   more hesitant about it. assertiveness is now the PRIMARY reported
 *   trait (increase); inhibition is now a lighter SECONDARY report
 *   (decrease), not the primary one v0.1.1's changelog described. This
 *   does not touch AIH_PressureEvaluator.js at all - inhibition's real
 *   mechanical weight against modestyCost in willingness/resistance is
 *   untouched and is exactly what makes a less-assertive heroine read as
 *   more hesitant in the first place; only which trait gets REINFORCED
 *   afterward changes.
 *
 * ============================================================================
 *
 * v0.2.2 CHANGELOG
 *
 * - intervene_physically now has its own failure/mishap consequences,
 *   bringing it to parity with AIH_Minigame_Service.js's bouncer system's
 *   interveneFailed pattern. "Fails" = a rolled mishap OR the response
 *   itself coming back reject. On failure, an unconditional pride
 *   penalty always applies (separate from and additional to the normal
 *   assertiveness/inhibition reports), plus one of two bathhouse-
 *   specific mishap flavors when the mishap roll actually triggers:
 *   wardrobe_slip (an exposure event that happens TO her - reported on
 *   inhibition/decrease) or overpowered (a more serious failure -
 *   reported on confidence/decrease, mirroring
 *   _resolveGroupHostileEscalation's pattern). Which flavor is rolled
 *   scales with the confrontation's own intensity. wentWell now also
 *   excludes a failed intervene_physically, which it did not before -
 *   this was a real gap (a mishapped intervention was incorrectly still
 *   creditable toward faction reputation/the reputation-ambition goal).
 *
 * ============================================================================
 *
 * PATRONS: GENERATED + AUTHORED
 *
 * Two patron sources, feeding the same request pipeline:
 *
 * GENERATED (filler)
 *     AIH.MinigameIntimateService.ARCHETYPES defines a small set of patron
 *     archetypes (a distribution of pressure-relevant traits: persistence,
 *     wealth/reward tendency, publicity, authority). A generated patron is
 *     built by picking an archetype and randomizing within its ranges. No
 *     identity persists across visits beyond a session-scoped id.
 *
 * AUTHORED (regulars)
 *     AIH.MinigameIntimateService.REGULARS defines a handful of named,
 *     hand-written patrons with a fixed personality and pressure profile.
 *     Regulars get an AIH.Relationships entry (via ensureRegularRelationship
 *     below) so familiarity/trust/etc. persist and can be read back in as
 *     domainPressure/attachmentDiscount on their next visit - this is the
 *     "regular customer's familiarity" example the handoff doc's Section 7
 *     already anticipates as a minigame's own relationship tracking.
 *
 * Both sources produce the same normalized "patron" shape (see
 * _normalizePatron below) so the rest of the pipeline does not need to
 * know or care which source a given visit came from.
 *
 * ============================================================================
 *
 * REQUEST FLOW (kept intentionally simple per this handoff's scope)
 *
 * generatePatronVisit()
 *     -> pick or generate a patron
 *     -> pick a request template appropriate to that patron's archetype
 *     -> build situation, call evaluate()
 *     -> resolveVisit() turns the response into an outcome
 *
 * If the response is "reject" or "partial", the request template may
 * declare a single followUp template (escalation or negotiation - Section
 * 8's "refusal is not necessarily the end of an interaction"). At most one
 * follow-up per visit. This is a deliberate scope limit for v1, not a
 * ceiling on the data model - a request template's followUp can itself
 * point to a chain if a later pass wants deeper escalation.
 *
 * ============================================================================
 *
 * REQUEST TEMPLATE SHAPE
 *
 * id                   unique key
 * archetypes           array of archetype keys this request can appear for
 *                       (or REGULAR-only via patron.allowedRequests)
 * description           flavor text, may reference {patronName}
 * baseSituation         partial situation object (severity, danger,
 *                       embarrassment, dignityCost, freedomCost,
 *                       modestyCost, prideCost, survivalBenefit,
 *                       combatAdvantage) - reward is computed from the
 *                       patron, not stored here
 * driftTrait / driftDirection
 *                       which trait reinforce() targets if this request's
 *                       outcome is boundary-relevant
 * followUpId            optional, id of a request template to try if this
 *                       one is rejected or partial
 *
 * ============================================================================
 *
 * CURSED ITEM INTEGRATION (v0.2.0)
 *
 * Every decision this module resolves through the shared evaluator now
 * goes through AIH.CursedItems.evaluateWithPossibleFlip() when that
 * module is loaded (see _evaluate below) rather than calling
 * AIH.PressureEvaluator.evaluate() directly - so an equipped cursed item
 * can genuinely flip a request/confrontation decision, exactly like
 * AIH_Minigame_Service.js/AIH_Minigame_TasteTest.js. Four cursed items
 * are written to interact with THIS minigame specifically (see
 * AIH_CursedItems.js's DEFINITIONS, v0.3.0):
 *
 *     anklet_of_the_easy_yes           generic bathhouse compliance
 *                                      curse - no special mechanical
 *                                      hook beyond the ordinary flip.
 *                                      Removal tracked here: reject a
 *                                      boundary-relevant request three
 *                                      times.
 *
 *     perfume_of_the_practiced_smile   this module reads its presence
 *                                      directly (see
 *                                      _buildConfrontationCandidates) to
 *                                      sweeten the "entertain" candidate
 *                                      specifically during a
 *                                      confrontation. Removal tracked
 *                                      here: choose deflect_calmly or
 *                                      call_for_help over entertain
 *                                      three times despite the pull.
 *
 *     choker_of_the_blushing_temptress   no special mechanical hook -
 *                                      its distinguishing feature lives
 *                                      entirely in AIH_CursedItems.js's
 *                                      own invertedEmotions (high
 *                                      embarrassment held alongside low
 *                                      inhibition). Removal tracked
 *                                      here: resolve call_for_help
 *                                      cleanly (no helper favor demand)
 *                                      three times.
 *
 *     sash_of_the_regulars_devotion    ties into this module's own
 *                                      regular/familiarity system. No
 *                                      special mechanical hook here
 *                                      beyond what AIH_CursedItems.js's
 *                                      floorTraits already does (floors
 *                                      trust once triggered). Removal
 *                                      tracked here: a regular's request
 *                                      ends in a plain, non-escalating
 *                                      refusal twice.
 *
 * See CURSED ITEM RELEASE CONDITION TRACKING near the bottom of this
 * file for all four counters. This module still never decides whether
 * an item's condition is warranted in the abstract - it only calls
 * markConditionMet() once its own tracked count for that item's specific
 * bathhouse-side condition crosses the threshold, the same boundary
 * AIH_Minigame_Service.js/AIH_Minigame_TasteTest.js already establish.
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide her response (PressureEvaluator, via _evaluate(), does)
 * - adjust personality directly (PersonalityDrift.reinforce() does, always)
 * - hardcode "if wealthy then always compliant" or similar dev conclusions
 * - implement Gentlemen's Club Entertainment (separate future activity)
 * - build a second pressure evaluator
 * - modify AIH_ValueDrift.js - it is only ever called into, via
 *   _reportBoundaryOutcomeReinforce below
 * - modify AIH_CursedItems.js - it only ever calls into it (isEquipped/
 *   isConditionMet/markConditionMet/evaluateWithPossibleFlip/
 *   recordAction/recordConflictBelief)
 *
 * ============================================================================
 *
 * @command StartShift
 * @text Start Bathhouse Shift
 * @desc Begins a bathhouse shift (resets shift-scoped incident counters).
 *
 * @command GeneratePatron
 * @text Generate Random Patron Visit
 * @desc Generates a filler patron and resolves one visit against her.
 *
 * @command VisitRegular
 * @text Visit From Named Regular
 * @arg regularId
 * @text Regular Id
 * @desc The id of the regular patron (see AIH.MinigameIntimateService.REGULARS).
 * @type string
 *
 * @command ShowShiftLog
 * @text Show Shift Log
 * @desc Displays the current shift's visit log.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.MinigameIntimateService = AIH.MinigameIntimateService || {};

    AIH.MinigameIntimateService.VERSION = "0.2.2";

    AIH.MinigameIntimateService.SCHEMA_VERSION = 1;

    AIH.MinigameIntimateService._initialized = false;

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.MinigameIntimateService._copy = function(value) {

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

    AIH.MinigameIntimateService._clamp01 = function(value) {

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

    AIH.MinigameIntimateService._randomBetween = function(min, max) {

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

    AIH.MinigameIntimateService._pickRandom = function(array) {

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
    // and AIH_Beliefs.js - this module's key was not reserved in advance by
    // AIH_State.js, so it builds its own container the first time it's
    // needed rather than asking State to know its shape.
    //
    // =========================================================================

    AIH.MinigameIntimateService._defaultCurseTracking = function() {

        return {
            easyYesCleanRejections: 0,
            practicedSmileAlternativeChoices: 0,
            blushingTemptressCleanHelps: 0,
            regularsDevotionHeldRefusals: 0
        };
    };

    AIH.MinigameIntimateService._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.MinigameIntimateService._ensure = function() {

        var state;

        state =
            AIH.MinigameIntimateService._state();

        if (!state) {
            return null;
        }

        if (!state.minigameIntimateService) {

            state.minigameIntimateService = {

                schemaVersion:
                    AIH.MinigameIntimateService.SCHEMA_VERSION,

                shiftActive:
                    false,

                shiftVisitLog:
                    [],

                totalVisits:
                    0,

                nextVisitId:
                    1,

                harassmentIncidents:
                    {},

                confrontationsHandledWell:
                    0,

                curseTracking:
                    AIH.MinigameIntimateService._defaultCurseTracking()
            };
        }

        if (
            !Array.isArray(
                state.minigameIntimateService.shiftVisitLog
            )
        ) {

            state.minigameIntimateService.shiftVisitLog = [];
        }

        if (
            !state.minigameIntimateService.harassmentIncidents ||
            typeof state.minigameIntimateService.harassmentIncidents !== "object"
        ) {

            state.minigameIntimateService.harassmentIncidents = {};
        }

        if (
            state.minigameIntimateService.confrontationsHandledWell ===
            undefined
        ) {

            state.minigameIntimateService.confrontationsHandledWell = 0;
        }

        if (
            state.minigameIntimateService.schemaVersion ===
            undefined
        ) {

            state.minigameIntimateService.schemaVersion =
                AIH.MinigameIntimateService.SCHEMA_VERSION;
        }

        if (
            state.minigameIntimateService.totalVisits ===
            undefined
        ) {

            state.minigameIntimateService.totalVisits = 0;
        }

        if (
            state.minigameIntimateService.nextVisitId ===
            undefined
        ) {

            state.minigameIntimateService.nextVisitId = 1;
        }

        /*
         * Additive default for saves made before v0.2.0's cursed-item
         * tracking counters existed - same pattern
         * AIH_Minigame_Service.js's own curseTracking migration uses.
         */
        if (
            !state.minigameIntimateService.curseTracking ||
            typeof state.minigameIntimateService.curseTracking !== "object"
        ) {

            state.minigameIntimateService.curseTracking =
                AIH.MinigameIntimateService._defaultCurseTracking();
        }

        if (
            state.minigameIntimateService.curseTracking
                .easyYesCleanRejections === undefined
        ) {

            state.minigameIntimateService.curseTracking
                .easyYesCleanRejections = 0;
        }

        if (
            state.minigameIntimateService.curseTracking
                .practicedSmileAlternativeChoices === undefined
        ) {

            state.minigameIntimateService.curseTracking
                .practicedSmileAlternativeChoices = 0;
        }

        if (
            state.minigameIntimateService.curseTracking
                .blushingTemptressCleanHelps === undefined
        ) {

            state.minigameIntimateService.curseTracking
                .blushingTemptressCleanHelps = 0;
        }

        if (
            state.minigameIntimateService.curseTracking
                .regularsDevotionHeldRefusals === undefined
        ) {

            state.minigameIntimateService.curseTracking
                .regularsDevotionHeldRefusals = 0;
        }

        return state.minigameIntimateService;
    };

    // =========================================================================
    // ARCHETYPES (for generated/filler patrons)
    // =========================================================================
    //
    // Each archetype is a set of RANGES, not fixed values - a generated
    // patron randomizes within these. persistence/publicity/authority are
    // the original design doc's own pressure vocabulary (see handoff
    // Section 7's mapping note) and get folded into embarrassment/
    // severity/dignityCost/prideCost when a situation is built, per that
    // same mapping. rewardRange is a raw currency-ish number, log-scaled
    // by the evaluator - do not pre-normalize it.
    //
    // =========================================================================

    AIH.MinigameIntimateService.ARCHETYPES = {

        modest_traveler: {

            label: "Modest Traveler",
            faction: "Townsfolk",

            persistenceRange: [0.1, 0.3],
            publicityRange: [0.0, 0.2],
            authorityRange: [0.0, 0.2],
            rewardRange: [40, 90],

            requestPoolIds: [
                "extra_towels",
                "quiet_service"
            ]
        },

        demanding_merchant: {

            label: "Demanding Merchant",
            faction: "Merchants",

            persistenceRange: [0.4, 0.7],
            publicityRange: [0.2, 0.5],
            authorityRange: [0.3, 0.6],
            rewardRange: [80, 180],

            requestPoolIds: [
                "quiet_service",
                "linger_and_chat",
                "extended_massage"
            ]
        },

        rowdy_adventurer_party: {

            label: "Rowdy Adventurer Party",
            faction: "Adventurers",

            persistenceRange: [0.5, 0.85],
            publicityRange: [0.5, 0.9],
            authorityRange: [0.1, 0.3],
            rewardRange: [60, 150],

            requestPoolIds: [
                "linger_and_chat",
                "loud_toast",
                "immodest_dare"
            ]
        },

        minor_noble: {

            label: "Minor Noble",
            faction: "Nobles",

            persistenceRange: [0.5, 0.8],
            publicityRange: [0.3, 0.6],
            authorityRange: [0.7, 0.95],
            rewardRange: [120, 260],

            requestPoolIds: [
                "extended_massage",
                "private_attendance",
                "immodest_dare"
            ]
        }

    };

    // =========================================================================
    // NAMED REGULARS (authored)
    // =========================================================================
    //
    // Fixed patrons with a stable pressure profile and an
    // AIH.Relationships entry, so familiarity built up over repeat visits
    // actually persists and feeds back in (see ensureRegularRelationship).
    // Values here are deliberately still just DATA fed into the same
    // evaluator - nothing here decides an outcome directly.
    //
    // =========================================================================

    AIH.MinigameIntimateService.REGULARS = {

        countess_verain: {

            npcId: "bathhouse_countess_verain",
            name: "Countess Verain",
            faction: "Nobles",

            persistence: 0.65,
            publicity: 0.35,
            authority: 0.9,
            rewardRange: [150, 300],

            requestPoolIds: [
                "extended_massage",
                "private_attendance",
                "immodest_dare"
            ]
        },

        old_man_torvin: {

            npcId: "bathhouse_old_man_torvin",
            name: "Old Man Torvin",
            faction: "Townsfolk",

            persistence: 0.15,
            publicity: 0.1,
            authority: 0.1,
            rewardRange: [30, 70],

            requestPoolIds: [
                "extra_towels",
                "quiet_service"
            ]
        },

        captain_dessa: {

            npcId: "bathhouse_captain_dessa",
            name: "Captain Dessa",
            faction: "CityGuard",

            persistence: 0.55,
            publicity: 0.4,
            authority: 0.6,
            rewardRange: [70, 140],

            requestPoolIds: [
                "linger_and_chat",
                "loud_toast",
                "extended_massage"
            ]
        }

    };

    // =========================================================================
    // REQUEST TEMPLATES
    // =========================================================================
    //
    // baseSituation values here are calibrated relative to each other, not
    // to any absolute "this is the lewd one" table - the same request can
    // resolve as accept, reluctant_accept, partial, or reject depending
    // entirely on her actual current psychology and the specific patron's
    // persistence/reward/authority for this visit. driftTrait/direction is
    // only consulted by resolveVisit() when the outcome is genuinely
    // boundary-relevant (see Section 6 of the handoff) - mundane requests
    // (extra_towels, quiet_service) intentionally have no driftTrait at
    // all, because complying with an ordinary service request is not a
    // boundary event and should not touch personality.
    //
    // =========================================================================

    AIH.MinigameIntimateService.REQUEST_TEMPLATES = {

        extra_towels: {

            description:
                "{patronName} asks for a few extra towels.",

            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0.05,
                dignityCost: 0,
                freedomCost: 0.05,
                modestyCost: 0,
                prideCost: 0
            },

            driftTrait: null,
            driftDirection: null,

            followUpId: null
        },

        quiet_service: {

            description:
                "{patronName} just wants to be left in peace, quietly and efficiently attended to.",

            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0.05,
                dignityCost: 0,
                freedomCost: 0.1,
                modestyCost: 0,
                prideCost: 0
            },

            driftTrait: null,
            driftDirection: null,

            followUpId: null
        },

        linger_and_chat: {

            description:
                "{patronName} keeps trying to draw out the conversation well past what the job requires.",

            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0.15,
                dignityCost: 0.05,
                freedomCost: 0.25,
                modestyCost: 0,
                prideCost: 0.05
            },

            /*
             * freedomCost (0.25) is this template's dominant cost, and
             * independence is what the shared evaluator actually weighs
             * against freedomCost (-independence*freedomCost*0.35 in
             * AIH_PressureEvaluator._personalityPressure) - confirmed
             * directly against v1.0.1.
             */
            driftTrait: "independence",
            driftDirection: "decrease",

            followUpId: null
        },

        loud_toast: {

            description:
                "{patronName} loudly toasts her in front of the whole bathhouse, clearly hoping she'll play along.",

            baseSituation: {
                severity: "medium",
                danger: 0,
                embarrassment: 0.4,
                dignityCost: 0.15,
                freedomCost: 0.1,
                modestyCost: 0.05,
                prideCost: 0.1
            },

            driftTrait: "attentionSeeking",
            driftDirection: "increase",

            followUpId: null
        },

        extended_massage: {

            description:
                "{patronName} requests a considerably longer, more involved massage than is standard.",

            baseSituation: {
                severity: "medium",
                danger: 0,
                embarrassment: 0.35,
                dignityCost: 0.1,
                freedomCost: 0.3,
                modestyCost: 0.4,
                prideCost: 0.1
            },

            driftTrait: "inhibition",
            driftDirection: "decrease",

            followUpId: "private_attendance"
        },

        private_attendance: {

            description:
                "{patronName} asks her to attend privately, away from the main floor, for the rest of the visit.",

            baseSituation: {
                severity: "rare",
                danger: 0.05,
                embarrassment: 0.5,
                dignityCost: 0.25,
                freedomCost: 0.4,
                modestyCost: 0.6,
                prideCost: 0.2
            },

            driftTrait: "inhibition",
            driftDirection: "decrease",

            followUpId: null
        },

        immodest_dare: {

            description:
                "{patronName} dares her, in front of others, to drop the last of her reserve.",

            baseSituation: {
                severity: "rare",
                danger: 0,
                embarrassment: 0.7,
                dignityCost: 0.3,
                freedomCost: 0.15,
                modestyCost: 0.75,
                prideCost: 0.35
            },

            driftTrait: "inhibition",
            driftDirection: "decrease",

            followUpId: null
        }

    };

    // =========================================================================
    // PATRON NORMALIZATION
    // =========================================================================
    //
    // Generated and authored (regular) patrons converge on this shape so
    // the rest of the pipeline is source-agnostic.
    //
    // shape:
    //   {
    //     kind: "generated" | "regular",
    //     id, name, faction (used for confrontation-driven reputation
    //     feedback on any patron kind; also drives per-visit reputation
    //     for regulars specifically - see modifyRegularFactionReputation
    //     and modifyPatronFactionReputationForConfrontation below),
    //     persistence, publicity, authority (0..1),
    //     rewardRange: [min, max],
    //     requestPoolIds: [...]
    //   }
    //
    // =========================================================================

    AIH.MinigameIntimateService.generatePatron = function(archetypeKey) {

        var archetype;
        var key;
        var id;

        if (
            archetypeKey &&
            AIH.MinigameIntimateService.ARCHETYPES[archetypeKey]
        ) {

            key = archetypeKey;

        } else {

            key =
                AIH.MinigameIntimateService._pickRandom(
                    Object.keys(
                        AIH.MinigameIntimateService.ARCHETYPES
                    )
                );
        }

        archetype =
            AIH.MinigameIntimateService.ARCHETYPES[key];

        if (!archetype) {
            return null;
        }

        id =
            "generated_" +
            key +
            "_" +
            Date.now() +
            "_" +
            Math.floor(Math.random() * 100000);

        return {

            kind: "generated",
            id: id,
            name: archetype.label,
            faction: archetype.faction || null,

            persistence:
                AIH.MinigameIntimateService._randomBetween(
                    archetype.persistenceRange[0],
                    archetype.persistenceRange[1]
                ),

            publicity:
                AIH.MinigameIntimateService._randomBetween(
                    archetype.publicityRange[0],
                    archetype.publicityRange[1]
                ),

            authority:
                AIH.MinigameIntimateService._randomBetween(
                    archetype.authorityRange[0],
                    archetype.authorityRange[1]
                ),

            rewardRange:
                archetype.rewardRange.slice(),

            requestPoolIds:
                archetype.requestPoolIds.slice()
        };
    };

    AIH.MinigameIntimateService.getRegularPatron = function(regularId) {

        var regular;

        regular =
            AIH.MinigameIntimateService.REGULARS[regularId];

        if (!regular) {
            return null;
        }

        return {

            kind: "regular",
            id: regular.npcId,
            name: regular.name,
            faction: regular.faction,

            persistence: regular.persistence,
            publicity: regular.publicity,
            authority: regular.authority,

            rewardRange:
                regular.rewardRange.slice(),

            requestPoolIds:
                regular.requestPoolIds.slice()
        };
    };

    // =========================================================================
    // REGULAR RELATIONSHIP TRACKING
    // =========================================================================
    //
    // This is this minigame's own relationship tracking, per handoff
    // Section 7 - "Livestream uses viewer favor/trust/familiarity here;
    // your minigame's equivalent, if it has one, goes here." A regular's
    // familiarity is read back in below as domainPressure (a regular she
    // knows well applies more comfortable, less alarming pressure) and her
    // trust as an attachmentDiscount (someone she trusts gets a little
    // slack on resistance). This module does not invent a second
    // relationship system - it calls straight into AIH.Relationships,
    // exactly as the handoff instructs.
    //
    // =========================================================================

    AIH.MinigameIntimateService.ensureRegularRelationship = function(patron) {

        if (
            !patron ||
            patron.kind !== "regular"
        ) {

            return null;
        }

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.add
        ) {

            return null;
        }

        return AIH.Relationships.add(
            patron.id,
            patron.name,
            patron.faction
        );
    };

    AIH.MinigameIntimateService._regularPressureOptions = function(patron) {

        var relationship;
        var familiarity;
        var trust;

        if (
            !patron ||
            patron.kind !== "regular" ||
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.get
        ) {

            return {};
        }

        relationship =
            AIH.Relationships.get(patron.id);

        if (!relationship) {
            return {};
        }

        familiarity =
            Number(relationship.familiarity) || 0;

        trust =
            Number(relationship.trust) || 0;

        return {

            /*
             * familiarity is stored -100..100 (see
             * AIH.Relationships._clampFamiliarity) - scaled down here into
             * a raw pressure term comparable to the livestream integration's
             * own domainPressure usage. Deliberately gentle: a regular's
             * familiarity should nudge things, not dominate the
             * evaluation.
             */
            domainPressure:
                familiarity * 0.15,

            attachmentDiscount:
                AIH.MinigameIntimateService._clamp01(
                    trust / 100
                ) * 0.12
        };
    };

    // =========================================================================
    // SITUATION BUILDING
    // =========================================================================

    AIH.MinigameIntimateService._fillDescription = function(template, patron) {

        return String(template.description || "").replace(
            /\{patronName\}/g,
            patron.name
        );
    };

    AIH.MinigameIntimateService.buildSituation = function(patron, requestId) {

        var template;
        var raw;
        var reward;
        var authorityFactor;

        template =
            AIH.MinigameIntimateService.REQUEST_TEMPLATES[requestId];

        if (
            !patron ||
            !template
        ) {

            return null;
        }

        reward =
            AIH.MinigameIntimateService._randomBetween(
                patron.rewardRange[0],
                patron.rewardRange[1]
            );

        /*
         * authority (from the original design doc's pressure vocabulary)
         * folds into prideCost/dignityCost per handoff Section 7's mapping
         * note - a request from a high-authority source stings pride and
         * dignity a bit more for an equivalent base cost.
         */
        authorityFactor =
            1 + (patron.authority * 0.35);

        raw = {

            id:
                "bathhouse_" +
                requestId +
                "_" +
                patron.id +
                "_" +
                Date.now(),

            type: "bathhouse_request",
            category: "intimate_service",

            description:
                AIH.MinigameIntimateService._fillDescription(
                    template,
                    patron
                ),

            severity:
                template.baseSituation.severity,

            reward:
                reward,

            danger:
                template.baseSituation.danger || 0,

            /*
             * publicity (design doc vocabulary) folds into embarrassment,
             * per Section 7's mapping note.
             */
            embarrassment:
                AIH.MinigameIntimateService._clamp01(
                    (template.baseSituation.embarrassment || 0) +
                    (patron.publicity * 0.2)
                ),

            dignityCost:
                AIH.MinigameIntimateService._clamp01(
                    (template.baseSituation.dignityCost || 0) *
                    authorityFactor
                ),

            freedomCost:
                template.baseSituation.freedomCost || 0,

            modestyCost:
                template.baseSituation.modestyCost || 0,

            prideCost:
                AIH.MinigameIntimateService._clamp01(
                    (template.baseSituation.prideCost || 0) *
                    authorityFactor
                ),

            survivalBenefit: 0,
            combatAdvantage: 0
        };

        return AIH.PressureEvaluator.normalizeSituation(raw);
    };

    // =========================================================================
    // CURSED ITEM INTEGRATION
    // =========================================================================
    //
    // Every decision in this file that would otherwise call
    // AIH.PressureEvaluator.evaluate() directly now goes through this
    // wrapper instead - a drop-in swap for
    // AIH.CursedItems.evaluateWithPossibleFlip() when that module is
    // present (byte-for-byte identical to a plain evaluate() call when no
    // flip-capable cursed item is equipped, or the roll doesn't trigger -
    // see that module's own header), falling back to the plain evaluator
    // if AIH.CursedItems isn't loaded at all. recordAction() is called
    // once per decision point resolved through this wrapper, advancing
    // the flip clock for any equipped cursed item, exactly the way
    // AIH_Minigame_Service.js/AIH_Minigame_TasteTest.js's own identical
    // wrapper does.
    //
    // =========================================================================

    AIH.MinigameIntimateService._evaluate = function(situation, options) {

        var evaluation;

        if (
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.evaluateWithPossibleFlip
        ) {

            evaluation =
                AIH.CursedItems.evaluateWithPossibleFlip(situation, options);

        } else {

            evaluation =
                AIH.PressureEvaluator.evaluate(situation, options);
        }

        if (
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.recordAction
        ) {

            AIH.CursedItems.recordAction();
        }

        if (
            evaluation &&
            evaluation.internalConflict &&
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.recordConflictBelief
        ) {

            AIH.CursedItems.recordConflictBelief(
                evaluation.flipItemId || "unknown",
                "bathhouse: her real self would have answered differently"
            );
        }

        return evaluation;
    };

    // =========================================================================
    // SHARED BOUNDARY-OUTCOME REPORTER
    // =========================================================================
    //
    // Centralizes the rewarded/magnitude judgment call so every call site
    // (plain requests, and now confrontation resolution below) agrees on
    // what "rewarding" means. Mirrors the reusable AIH_Minigame_Service.js
    // pattern (_reportOutcome) rather than inlining this per call site.
    //
    // "Rewarded" is judged by whether the interaction actually went well
    // for her, not merely whether she complied:
    //   - "accept" is rewarding on its own.
    //   - "reluctant_accept" counts too, but only if the score cleared a
    //     real margin (a patron she barely, grudgingly went along with is
    //     not "it went well" even though she technically complied).
    //   - "partial" now counts as rewarding as well, at HALF magnitude -
    //     some degree of yielding under pressure is still yielding, it
    //     just shouldn't hit as hard as a clean accept. Matches
    //     AIH_Minigame_Service.js's own reward semantics for consistency
    //     across minigame frameworks.
    //   - "reject" is never rewarding.
    //
    // rewardedOverride, if a boolean, bypasses the above for events that
    // aren't a request-compliance moment at all (e.g. "she chose to
    // physically intervene and it worked" isn't judged by response tier
    // the same way a compliance request is).
    //
    // =========================================================================

    AIH.MinigameIntimateService._reportBoundaryOutcome = function(
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

        if (typeof rewardedOverride === "boolean") {

            rewarded = rewardedOverride;

        } else {

            rewarded =
                evaluation.response === "accept" ||
                (
                    evaluation.response === "reluctant_accept" &&
                    evaluation.score > 0.20
                ) ||
                evaluation.response === "partial";
        }

        /*
         * Magnitude tiering ported from AIH_Minigame_Service.js's
         * _reportOutcome, which refines this into three tiers instead of
         * bathhouse's original flat "0.5x for partial, full otherwise":
         *
         *     accept                                          full
         *     reluctant_accept, score > 0.20 (a real margin)    full
         *     reluctant_accept, score <= 0.20 (barely cleared)  0.25x -
         *         still counts (a bare-margin grudging accept isn't
         *         nothing), just weighted much lighter than a clean one
         *     partial                                          0.5x
         *     reject                                           n/a (not rewarded)
         */
        finalMagnitude =
            magnitude;

        if (
            evaluation.response === "reluctant_accept" &&
            evaluation.score <= 0.20
        ) {

            finalMagnitude =
                finalMagnitude * 0.25;

        } else if (evaluation.response === "partial") {

            finalMagnitude =
                finalMagnitude * 0.5;
        }

        return AIH.MinigameIntimateService._reportBoundaryOutcomeReinforce(
            trait,
            direction,
            rewarded,
            finalMagnitude,
            reason
        );
    };

    /*
     * Split out from _reportBoundaryOutcome so the reinforce() call and
     * its ValueDrift follow-up sit in one place - AIH.ValueDrift.
     * checkForShift() is a safe, cheap no-op for any trait it doesn't
     * map (see AIH_ValueDrift.js) or that hasn't internalized yet, so
     * calling it unconditionally after every reinforce() here is
     * correct, not wasteful.
     */
    AIH.MinigameIntimateService._reportBoundaryOutcomeReinforce = function(
        trait,
        direction,
        rewarded,
        finalMagnitude,
        reason
    ) {

        var result;

        result =
            AIH.PersonalityDrift.reinforce(
                trait,
                direction,
                {
                    rewarded: rewarded,
                    magnitude:
                        AIH.MinigameIntimateService._clamp01(
                            finalMagnitude
                        ),
                    reason: reason
                }
            );

        if (
            typeof AIH.ValueDrift !== "undefined" &&
            AIH.ValueDrift.checkForShift
        ) {

            AIH.ValueDrift.checkForShift(
                trait,
                direction,
                rewarded
            );
        }

        return result;
    };

    AIH.MinigameIntimateService._resolveRequest = function(patron, requestId) {

        var template;
        var situation;
        var options;
        var evaluation;
        var driftResult;

        template =
            AIH.MinigameIntimateService.REQUEST_TEMPLATES[requestId];

        if (!template) {
            return null;
        }

        situation =
            AIH.MinigameIntimateService.buildSituation(
                patron,
                requestId
            );

        options =
            AIH.MinigameIntimateService._regularPressureOptions(
                patron
            );

        evaluation =
            AIH.MinigameIntimateService._evaluate(
                situation,
                options
            );

        driftResult = null;

        if (
            template.driftTrait &&
            (
                evaluation.response === "accept" ||
                evaluation.response === "reluctant_accept" ||
                evaluation.response === "partial"
            )
        ) {

            driftResult =
                AIH.MinigameIntimateService._reportBoundaryOutcome(
                    template.driftTrait,
                    template.driftDirection,
                    evaluation,
                    AIH.MinigameIntimateService._clamp01(
                        situation.modestyCost ||
                        situation.embarrassment ||
                        0.3
                    ),
                    "bathhouse request '" +
                        requestId +
                        "' from " +
                        patron.name +
                        " (" +
                        evaluation.response +
                        ")"
                );
        }

        return {

            requestId: requestId,
            description:
                situation.description,

            response:
                evaluation.response,

            score:
                evaluation.score,

            evaluation: evaluation,

            driftResult: driftResult
        };
    };

    // =========================================================================
    // CONFRONTATION SYSTEM (chooseBest across candidate responses)
    // =========================================================================
    //
    // Reuses the exact pattern AIH_Minigame_Service.js documents and
    // recommends for any minigame needing a multi-option decision: build
    // ONE PressureEvaluator situation per candidate response (each
    // reflecting what THAT specific response would actually cost/reward
    // her), evaluate all of them, and pick whichever comes back with the
    // best raw score. No second scoring engine.
    //
    // This triggers when a patron pushes past TWO refusals in the same
    // visit (the primary request AND its follow-up both rejected) -
    // per Section 8, "refusal is not necessarily the end of an
    // interaction," and at that point it stops being a request she can
    // simply decline again and becomes a genuine confrontation she has
    // to actively handle.
    //
    // Candidate actions, and the specific risk balance requested for
    // this framework (deliberately NOT a flat "riskier action = always
    // worse" ladder - each option's risk is qualitatively different):
    //
    //   entertain            - she gives in, framed as the compounded
    //                          pressure of being pushed twice getting to
    //                          her. Safest option physically. Costs the
    //                          same boundary trait the original request
    //                          would have. See CURSED ITEM INTEGRATION
    //                          above - perfume_of_the_practiced_smile
    //                          sweetens this specific candidate directly.
    //
    //   deflect_calmly        - she tries to defuse/separate herself
    //                          without complying or using force. This is
    //                          the RISKY option: if it fails (see
    //                          backfire roll below), both patrons turn
    //                          their attention to pressuring/cornering
    //                          her instead of backing off, and it can
    //                          escalate toward an actual attack if she
    //                          then refuses that too. Its immediate
    //                          situation cost is moderate, but its
    //                          EXPECTED cost (immediate + backfire risk)
    //                          is the highest of the four.
    //
    //   call_for_help          - she flags the house's own staff/security.
    //                          Safe from immediate danger, and costs
    //                          only a modest amount of pride/dignity (an
    //                          admission she couldn't handle it herself)
    //                          - low enough that a genuinely frightened
    //                          heroine can actually reach for it instead
    //                          of pride drowning out the safety benefit.
    //                          It is not risk-free, though: whoever
    //                          "helped" may expect something back for
    //                          it, mirroring entertain's boundary cost;
    //                          refusing THAT can escalate into a bigger
    //                          group turning hostile than the original
    //                          confrontation had - see
    //                          _resolveHelperFavorDemand /
    //                          _resolveGroupHostileEscalation below.
    //
    //   intervene_physically   - she handles it herself, physically.
    //                          Genuinely risky (danger), but specifically
    //                          NOT the "both patrons turn on her" failure
    //                          mode deflect_calmly risks - she's setting
    //                          the terms, not hoping they listen. Its
    //                          bathhouse-specific risk is different in
    //                          KIND, not just degree: a real chance of a
    //                          wardrobe mishap / losing her footing on
    //                          wet stone mid-struggle, baked in as
    //                          modestyCost/embarrassment on the situation
    //                          itself rather than bolted on afterward.
    //
    // =========================================================================

    AIH.MinigameIntimateService.RESPONSE_RANK = {
        accept: 3,
        reluctant_accept: 2,
        partial: 1,
        reject: 0
    };

    AIH.MinigameIntimateService._chooseBest = function(candidates) {

        var best;
        var bestScore;
        var i;
        var candidate;
        var evaluation;

        /*
         * Ranks candidates by raw score alone, NOT by response tier.
         *
         * An earlier version ranked by (RESPONSE_RANK[response] * 10 +
         * score). Response tier is itself just score run through fixed
         * thresholds (accept >= 0.35, reluctant_accept >= 0.05,
         * partial >= -0.15, else reject) - it carries no information
         * beyond what score already has. Multiplying by tier didn't fix
         * mis-orderings; it manufactured artificial ~10-point margins
         * out of tier-boundary crossings that were often only
         * ~0.02-0.05 in real score terms, which then swamped all the
         * legitimate variation (different patrons, different drifted
         * personality) this system exists to produce - whichever
         * candidate happened to cross a boundary would win almost every
         * trial regardless of which patron was involved. Found in
         * AIH_Minigame_Service.js by comparing real per-candidate scores
         * against the inflated ranks in an actual collapsed scenario;
         * ported here since this file uses the identical pattern.
         *
         * Ranking by raw score means the actual best-scoring candidate
         * always wins, by a margin proportional to how much better it
         * really is - including cases where every candidate is "reject"
         * tier and she is picking the least-bad of a bad set, which is
         * itself the correct behavior for a chooseBest helper.
         */
        best = null;
        bestScore = -Infinity;

        for (
            i = 0;
            i < candidates.length;
            i++
        ) {

            candidate =
                candidates[i];

            evaluation =
                AIH.MinigameIntimateService._evaluate(
                    candidate.situation,
                    candidate.options || {}
                );

            if (evaluation.score > bestScore) {

                bestScore = evaluation.score;

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

    /*
     * intensity scales how bad THIS particular confrontation runs,
     * driven by data already on the patron (persistence/authority) -
     * not a hardcoded conclusion, just letting an already-persistent or
     * high-authority patron make the whole confrontation read as more
     * charged, across every candidate response.
     */
    AIH.MinigameIntimateService._confrontationIntensity = function(patron) {

        return (
            1 +
            (patron.persistence * 0.3) +
            (patron.authority * 0.2)
        );
    };

    AIH.MinigameIntimateService._buildConfrontationCandidates = function(
        patron,
        requestId,
        options
    ) {

        var intensity;
        var baseSituation;
        var candidates;
        var practicedSmileEquipped;
        var entertainReward;
        var entertainEmbarrassment;
        var entertainFreedomCost;

        intensity =
            AIH.MinigameIntimateService._confrontationIntensity(patron);

        baseSituation =
            AIH.MinigameIntimateService.buildSituation(
                patron,
                requestId
            );

        candidates = [];

        /*
         * perfume_of_the_practiced_smile (see AIH_CursedItems.js, v0.3.0)
         * reads directly here - while it's equipped, giving in is
         * sweetened on top of whatever the ordinary personality flip
         * already does: a bigger reward bump, and less of a felt cost,
         * specifically for THIS candidate.
         */
        practicedSmileEquipped =
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.isEquipped &&
            AIH.CursedItems.isEquipped("perfume_of_the_practiced_smile");

        entertainReward =
            practicedSmileEquipped ? 1.35 : 1.15;

        entertainEmbarrassment =
            practicedSmileEquipped ? 0.04 : 0.10;

        entertainFreedomCost =
            practicedSmileEquipped ? 0.05 : 0.15;

        // --- entertain --------------------------------------------------
        candidates.push({

            action: "entertain",
            options: options,

            situation:
                AIH.PressureEvaluator.normalizeSituation(
                    Object.assign(
                        {},
                        baseSituation,
                        {
                            id:
                                baseSituation.id + "_entertain",
                            reward:
                                Math.round(baseSituation.reward * entertainReward),
                            embarrassment:
                                AIH.MinigameIntimateService._clamp01(
                                    baseSituation.embarrassment + entertainEmbarrassment
                                ),
                            freedomCost:
                                AIH.MinigameIntimateService._clamp01(
                                    baseSituation.freedomCost + entertainFreedomCost
                                )
                        }
                    )
                ),

            meta: {
                driftTrait:
                    AIH.MinigameIntimateService.REQUEST_TEMPLATES[requestId].driftTrait,
                driftDirection:
                    AIH.MinigameIntimateService.REQUEST_TEMPLATES[requestId].driftDirection
            }
        });

        // --- deflect_calmly (the risky one) ------------------------------
        //
        // Given a modestyCost of 0 (like call_for_help's), its resistance
        // was tied to almost nothing except severity - and once her
        // willingness for both options clamps to the 1.0 ceiling (which
        // happens readily given this heroine's high baseline courage/
        // confidence), severity becomes the ONLY differentiator, handing
        // call_for_help a small but FIXED structural edge regardless of
        // psychology. A genuine (smaller than intervene's) modesty risk
        // is thematically honest anyway - getting physically between two
        // increasingly handsy patrons risks some incidental contact,
        // just less than a full physical struggle would - and it gives
        // resistance a real values-driven differentiator instead of a
        // fixed severity constant.
        candidates.push({

            action: "deflect_calmly",
            options: options,

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: baseSituation.id + "_deflect",
                    type: "bathhouse_confrontation",
                    category: "deflect_calmly",
                    description:
                        "She tries to calmly separate herself from " +
                        patron.name +
                        " without giving in or using force.",

                    severity: "medium",

                    reward: 0,

                    danger:
                        AIH.MinigameIntimateService._clamp01(
                            0.30 * intensity
                        ),

                    embarrassment:
                        AIH.MinigameIntimateService._clamp01(
                            0.35 * intensity
                        ),

                    dignityCost: 0.10,
                    freedomCost: 0.40,
                    modestyCost: 0.12,
                    prideCost: 0.10
                }),

            meta: {
                /*
                 * freedomCost (0.40) is this candidate's dominant cost -
                 * independence is what the evaluator actually weighs
                 * against it (-independence*freedomCost*0.35). Confirmed
                 * directly against v1.0.1 - see the v0.1.1 changelog at
                 * the top of this file.
                 */
                driftTrait: "independence",
                driftDirection: "decrease"
            }
        });

        // --- call_for_help ------------------------------------------------
        //
        // Two rounds of tuning against the actual evaluator, not just
        // magic numbers: dignityCost/prideCost were lowered first (pride
        // alone was dominating resistance regardless of fear). That
        // wasn't enough - reward:0 left this option with no
        // willingness boost at all, while deflect_calmly/
        // intervene_physically both get a real willingness boost from
        // courage/riskTolerance reacting to their danger values (see
        // AIH_PressureEvaluator._personalityPressure - danger REWARDS
        // willingness for a brave heroine, it doesn't just cost her). A
        // modest reward here (the house's own token for handling it
        // properly) gives call_for_help a comparable willingness pull
        // without relying on danger to generate it.
        candidates.push({

            action: "call_for_help",
            options: options,

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: baseSituation.id + "_call_for_help",
                    type: "bathhouse_confrontation",
                    category: "call_for_help",
                    description:
                        "She signals the house's own staff to step in with " +
                        patron.name +
                        ".",

                    severity: "normal",

                    reward:
                        Math.round(patron.rewardRange[0] * 0.5),

                    danger: 0.05,

                    embarrassment:
                        AIH.MinigameIntimateService._clamp01(
                            0.15 * intensity
                        ),

                    dignityCost: 0.08,
                    freedomCost: 0.05,
                    modestyCost: 0,
                    prideCost: 0.12
                }),

            meta: {
                /*
                 * prideCost+dignityCost (0.20 combined) is this
                 * candidate's dominant cost, weighted at 0.45 in
                 * _personalityPressure - the single largest coefficient
                 * of any cost term in that function. pride is what the
                 * evaluator actually weighs; trust only touches this
                 * situation via danger (0.05, negligible here) at a
                 * much smaller 0.10 coefficient. Confirmed directly
                 * against v1.0.1.
                 */
                driftTrait: "pride",
                driftDirection: "decrease"
            }
        });

        // --- intervene_physically (bathhouse-specific mishap risk) -------
        //
        // Original modestyCost (0.35) combined with this heroine's
        // baseline pride/dignity/freedom (already ~0.88 of resistance's
        // 0-1 range before any situation cost) pushed resistance past
        // the clamp ceiling regardless of psychology - meaning this
        // option's score barely moved no matter how her fear/courage
        // changed, the same "doesn't respond to circumstance" problem
        // originally flagged for deflect_calmly, just relocated here.
        // Pulled back so it has real headroom to vary.
        candidates.push({

            action: "intervene_physically",
            options: options,

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: baseSituation.id + "_intervene",
                    type: "bathhouse_confrontation",
                    category: "intervene_physically",
                    description:
                        "She physically breaks it up herself with " +
                        patron.name +
                        ".",

                    severity: "medium",

                    reward: 0,

                    danger:
                        AIH.MinigameIntimateService._clamp01(
                            0.28 * intensity
                        ),

                    embarrassment:
                        AIH.MinigameIntimateService._clamp01(
                            0.24 * intensity
                        ),

                    /*
                     * The bathhouse-specific risk the design calls for:
                     * wet stone, robes, towels - a real chance of a
                     * wardrobe slip or losing her footing mid-struggle.
                     * Baked into the situation itself (so the evaluator
                     * actually weighs it when deciding whether this is a
                     * good idea for HER), not just narrated after the
                     * fact. Reduced from 0.35 for the headroom reason
                     * above - still the largest modestyCost of the four
                     * candidates, still the option's defining risk.
                     */
                    modestyCost: 0.26,

                    dignityCost: 0.05,
                    freedomCost: 0,
                    prideCost: 0.05
                }),

            meta: {
                /*
                 * Per design correction: physically stepping in is
                 * fundamentally a decisive, assertive act, not a modesty
                 * event that happens to have an assertive flavor.
                 * assertiveness is read against embarrassment
                 * (assertiveness*embarrassment*0.15 in willingness) as a
                 * positive, cost-indifferent push toward acting anyway -
                 * a confident heroine intervenes regardless of the
                 * wardrobe risk. modestyCost (0.26) still does real work
                 * mechanically via inhibition (both the willingness
                 * penalty and the resistance term,
                 * (inhibition-0.5)*modestyCost*0.25, are untouched here) -
                 * that's what makes a LESS assertive heroine who still
                 * goes through with it read as visibly more hesitant.
                 * But that hesitancy dimension is secondary to what the
                 * action itself expresses, so it's reported as a lighter
                 * secondary drift (see resolveConfrontation below), not
                 * the primary one.
                 */
                driftTrait: "assertiveness",
                driftDirection: "increase",
                secondaryDriftTrait: "inhibition",
                secondaryDriftDirection: "decrease"
            }
        });

        return candidates;
    };

    /*
     * The deflect_calmly backfire: both patrons turn their attention to
     * pressuring/cornering her instead of backing off. Resolved as a
     * single plain evaluate() (not a nested chooseBest) to keep this
     * subsystem's depth bounded, matching the one-follow-up-per-visit
     * scope limit already established for plain requests. "reject" here
     * means she holds her ground despite the escalation (the good
     * outcome); "accept"/"reluctant_accept" means it genuinely
     * overwhelms her.
     */
    AIH.MinigameIntimateService._resolveDeflectBackfire = function(
        patron,
        requestId,
        options,
        intensity
    ) {

        var situation;
        var evaluation;
        var driftResult;

        situation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "bathhouse_backfire_" + patron.id + "_" + Date.now(),
                type: "bathhouse_confrontation",
                category: "patrons_turn_hostile",
                description:
                    "Rather than backing off, " +
                    patron.name +
                    " and their companion turn their attention onto her.",

                severity: "rare",

                reward: 0,

                danger:
                    AIH.MinigameIntimateService._clamp01(0.55 * intensity),

                embarrassment:
                    AIH.MinigameIntimateService._clamp01(0.50 * intensity),

                modestyCost: 0.25,
                dignityCost: 0.20,
                freedomCost: 0.45,
                prideCost: 0.15
            });

        evaluation =
            AIH.MinigameIntimateService._evaluate(
                situation,
                options
            );

        /*
         * This is a definite, notable thing that just happened to her -
         * marked rewarded: true unconditionally so it reliably counts
         * (per Section 6, "rewarded" here just means "impactful enough
         * to register," not "good for her"). Targets riskTolerance
         * (which the evaluator actually reads, via riskTolerance*
         * danger*0.35) - getting ambushed after trying to calmly defuse
         * should make her genuinely warier of leaning into danger-
         * embracing options again, which is exactly what lowering
         * riskTolerance does: it shrinks the courage/riskTolerance*
         * danger willingness boost that deflect_calmly and
         * intervene_physically both draw on.
         */
        driftResult =
            AIH.MinigameIntimateService._reportBoundaryOutcome(
                "riskTolerance",
                "decrease",
                evaluation,
                0.35,
                "patrons turned hostile on " +
                    patron.name +
                    "'s visit after a calm deflection attempt failed",
                true
            );

        return {

            evaluation: evaluation,
            heldGround:
                evaluation.response === "reject" ||
                evaluation.response === "partial",
            driftResult: driftResult
        };
    };

    /*
     * The bigger, second-tier version of "patrons turn hostile" - used
     * when a call_for_help's helpers demand a favor and she refuses it.
     * Deliberately worse than _resolveDeflectBackfire's version: more
     * patrons are now involved (the original patron(s) AND whoever
     * "helped"), so the danger/embarrassment/freedomCost are higher
     * across the board. Same "reject = holds her ground" mapping.
     */
    AIH.MinigameIntimateService._resolveGroupHostileEscalation = function(
        patron,
        options,
        intensity
    ) {

        var situation;
        var evaluation;
        var driftResult;

        situation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "bathhouse_group_escalation_" + patron.id + "_" + Date.now(),
                type: "bathhouse_confrontation",
                category: "group_turns_hostile",
                description:
                    "Refused, the ones who 'helped' turn on her too - now it's more than just " +
                    patron.name +
                    ".",

                severity: "extreme",

                reward: 0,

                danger:
                    AIH.MinigameIntimateService._clamp01(0.65 * intensity),

                embarrassment:
                    AIH.MinigameIntimateService._clamp01(0.55 * intensity),

                modestyCost: 0.30,
                dignityCost: 0.25,
                freedomCost: 0.50,
                prideCost: 0.20
            });

        evaluation =
            AIH.MinigameIntimateService._evaluate(
                situation,
                options
            );

        /*
         * Needing to call for help at all reflects a situation she
         * couldn't handle herself; having it then go badly on top of
         * that compounds it. This specifically (unlike a clean success)
         * also shakes her confidence, since this is the outcome where
         * the whole gambit visibly failed in front of her. Not every
         * option needs a symmetric "success raises it, failure lowers
         * it" pair.
         */
        driftResult =
            AIH.MinigameIntimateService._reportBoundaryOutcome(
                "pride",
                "decrease",
                evaluation,
                0.45,
                "a call for help backfired into a larger group turning hostile around " +
                    patron.name,
                true
            );

        AIH.MinigameIntimateService._reportBoundaryOutcome(
            "confidence",
            "decrease",
            evaluation,
            0.35,
            "a call for help backfiring shook her confidence around " +
                patron.name,
            true
        );

        return {

            evaluation: evaluation,
            heldGround:
                evaluation.response === "reject" ||
                evaluation.response === "partial",
            driftResult: driftResult
        };
    };

    /*
     * Mirrors "entertain" for the original patron, but sourced from
     * whoever stepped in to help - they expect something back. If she
     * goes along with it, that's a boundary-relevant compliance exactly
     * like entertaining the original patron would have been. If she
     * refuses, it escalates into _resolveGroupHostileEscalation above -
     * a worse version of deflect_calmly's backfire, since the group is
     * now bigger than the original confrontation.
     */
    AIH.MinigameIntimateService._resolveHelperFavorDemand = function(
        patron,
        requestId,
        options,
        intensity
    ) {

        var situation;
        var evaluation;
        var driftResult;
        var escalation;
        var template;

        template =
            AIH.MinigameIntimateService.REQUEST_TEMPLATES[requestId];

        situation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "bathhouse_helper_favor_" + patron.id + "_" + Date.now(),
                type: "bathhouse_confrontation",
                category: "helper_favor_demand",
                description:
                    "The ones who stepped in to help with " +
                    patron.name +
                    " now expect something back for it.",

                severity: "medium",

                reward: 0,

                danger: 0.05,

                embarrassment:
                    AIH.MinigameIntimateService._clamp01(
                        0.35 * intensity
                    ),

                modestyCost: 0.45,
                freedomCost: 0.25,
                dignityCost: 0.20,
                prideCost: 0.15
            });

        evaluation =
            AIH.MinigameIntimateService._evaluate(
                situation,
                options
            );

        driftResult = null;
        escalation = null;

        if (
            evaluation.response === "accept" ||
            evaluation.response === "reluctant_accept" ||
            evaluation.response === "partial"
        ) {

            driftResult =
                AIH.MinigameIntimateService._reportBoundaryOutcome(
                    (template && template.driftTrait) ||
                        "inhibition",
                    (template && template.driftDirection) ||
                        "decrease",
                    evaluation,
                    0.45,
                    "bathhouse confrontation: the helpers who stepped in against " +
                        patron.name +
                        " expected something back, and got it"
                );

        } else {

            escalation =
                AIH.MinigameIntimateService._resolveGroupHostileEscalation(
                    patron,
                    options,
                    intensity
                );
        }

        return {

            evaluation: evaluation,
            driftResult: driftResult,
            escalation: escalation
        };
    };

    AIH.MinigameIntimateService.CONFRONTATION_BACKFIRE_BASE_CHANCE = 0.30;
    AIH.MinigameIntimateService.CONFRONTATION_MISHAP_CHANCE = 0.35;
    AIH.MinigameIntimateService.CONFRONTATION_HELPER_FAVOR_CHANCE = 0.35;

    AIH.MinigameIntimateService.resolveConfrontation = function(patron, requestId) {

        var options;
        var intensity;
        var candidates;
        var winner;
        var driftResult;
        var backfire;
        var helperFavor;
        var mishapOccurred;
        var interveneFailed;
        var mishapType;
        var wentWell;
        var badOutcome;
        var result;

        options =
            AIH.MinigameIntimateService._regularPressureOptions(
                patron
            );

        intensity =
            AIH.MinigameIntimateService._confrontationIntensity(
                patron
            );

        candidates =
            AIH.MinigameIntimateService._buildConfrontationCandidates(
                patron,
                requestId,
                options
            );

        winner =
            AIH.MinigameIntimateService._chooseBest(
                candidates
            );

        if (!winner) {
            return null;
        }

        driftResult = null;
        backfire = null;
        helperFavor = null;
        mishapOccurred = false;
        interveneFailed = false;
        mishapType = null;

        if (winner.action === "entertain") {

            if (winner.meta.driftTrait) {

                driftResult =
                    AIH.MinigameIntimateService._reportBoundaryOutcome(
                        winner.meta.driftTrait,
                        winner.meta.driftDirection,
                        winner.evaluation,
                        AIH.MinigameIntimateService._clamp01(
                            winner.situation.modestyCost ||
                            winner.situation.embarrassment ||
                            0.4
                        ),
                        "bathhouse confrontation: gave in to " +
                            patron.name +
                            " after two refusals"
                    );
            }

        } else if (winner.action === "deflect_calmly") {

            driftResult =
                AIH.MinigameIntimateService._reportBoundaryOutcome(
                    "independence",
                    "decrease",
                    winner.evaluation,
                    0.3,
                    "bathhouse confrontation: tried to calmly defuse " +
                        patron.name,
                    true
                );

            /*
             * The backfire chance scales with the patron's persistence -
             * a mildly pushy patron is unlikely to escalate further after
             * she tries to calm things down; a highly persistent one is
             * much more likely to keep pushing instead of backing off.
             */
            if (
                Math.random() <
                AIH.MinigameIntimateService.CONFRONTATION_BACKFIRE_BASE_CHANCE +
                (patron.persistence * 0.35)
            ) {

                backfire =
                    AIH.MinigameIntimateService._resolveDeflectBackfire(
                        patron,
                        requestId,
                        options,
                        intensity
                    );
            }

        } else if (winner.action === "call_for_help") {

            driftResult =
                AIH.MinigameIntimateService._reportBoundaryOutcome(
                    "pride",
                    "decrease",
                    winner.evaluation,
                    0.25,
                    "bathhouse confrontation: called on the house's own staff against " +
                        patron.name,
                    true
                );

            /*
             * The people who stepped in to help aren't necessarily
             * acting for free. Chance scales with the patron's publicity
             * (a bigger scene draws more "helpers" with their own
             * ideas) rather than persistence, since this isn't about the
             * original patron pushing further - it's a new complication
             * from a new source.
             */
            if (
                Math.random() <
                AIH.MinigameIntimateService.CONFRONTATION_HELPER_FAVOR_CHANCE +
                (patron.publicity * 0.25)
            ) {

                helperFavor =
                    AIH.MinigameIntimateService._resolveHelperFavorDemand(
                        patron,
                        requestId,
                        options,
                        intensity
                    );
            }

        } else if (winner.action === "intervene_physically") {

            /*
             * assertiveness is the PRIMARY report here, not inhibition -
             * see the candidate meta's comment above for the full
             * reasoning. Choosing to physically step in expresses
             * decisiveness/assertiveness regardless of the modesty
             * risk; inhibition still gets a real but lighter secondary
             * report, since pushing through that risk anyway plausibly
             * erodes some of it too, just not as the main story of this
             * action.
             */
            driftResult =
                AIH.MinigameIntimateService._reportBoundaryOutcome(
                    "assertiveness",
                    "increase",
                    winner.evaluation,
                    AIH.MinigameIntimateService._clamp01(
                        winner.situation.embarrassment || 0.3
                    ),
                    "bathhouse confrontation: physically intervened against " +
                        patron.name
                );

            AIH.MinigameIntimateService._reportBoundaryOutcome(
                "inhibition",
                "decrease",
                winner.evaluation,
                AIH.MinigameIntimateService._clamp01(
                    (winner.situation.modestyCost || 0.2) * 0.5
                ),
                "bathhouse confrontation (secondary factor): pushed " +
                    "through the modesty risk of physically intervening " +
                    "against " +
                    patron.name
            );

            mishapOccurred =
                Math.random() <
                AIH.MinigameIntimateService.CONFRONTATION_MISHAP_CHANCE;

            /*
             * "Fails" covers both the baked-in mishap roll above and the
             * situation itself simply not going acceptably (reject
             * tier) even without a mishap - mirrors
             * AIH_Minigame_Service.js's own interveneFailed pattern for
             * its bouncer system. This is separate from and additional
             * to the normal assertiveness/inhibition reports above - a
             * failed physical intervention is a real, unconditional
             * blow to her sense of her own competence, not something
             * that should only register if the broader reward-tier
             * logic happens to line up.
             */
            interveneFailed =
                mishapOccurred ||
                winner.evaluation.response === "reject";

            if (mishapOccurred) {

                /*
                 * Which specific way it goes wrong - a purely
                 * embarrassing wardrobe mishap, or something more
                 * serious (she's physically overpowered) - scales with
                 * how charged this particular confrontation already is.
                 * A calm, low-intensity scuffle is more likely to end in
                 * a towel slipping than in her actually losing control
                 * of it; a genuinely charged one is the reverse.
                 */
                mishapType =
                    Math.random() <
                    AIH.MinigameIntimateService._clamp01(
                        0.35 + (intensity - 1) * 0.5
                    ) ?
                        "overpowered" :
                        "wardrobe_slip";
            }

            if (interveneFailed) {

                AIH.MinigameIntimateService._reportBoundaryOutcome(
                    "pride",
                    "decrease",
                    winner.evaluation,
                    0.5,
                    "bathhouse confrontation: physically intervening " +
                        "against " +
                        patron.name +
                        " went badly" +
                        (
                            mishapType === "wardrobe_slip" ?
                                " (her towel slipped in front of everyone)" :
                                (
                                    mishapType === "overpowered" ?
                                        " (she was physically overpowered)" :
                                        ""
                                )
                        ),
                    true
                );

                if (mishapType === "wardrobe_slip") {

                    /*
                     * A wardrobe mishap is an exposure event that
                     * happens TO her, not a choice - reported
                     * unconditionally on inhibition/decrease, since
                     * she's now been seen regardless of what she
                     * intended, and that has the same practical effect
                     * on her future comfort with exposure as if she'd
                     * chosen it.
                     */
                    AIH.MinigameIntimateService._reportBoundaryOutcome(
                        "inhibition",
                        "decrease",
                        winner.evaluation,
                        0.3,
                        "bathhouse confrontation: a wardrobe slip during " +
                            "the struggle against " +
                            patron.name +
                            " left her exposed in front of the room",
                        true
                    );

                } else if (mishapType === "overpowered") {

                    /*
                     * Being physically overpowered is a more serious
                     * failure than an embarrassing slip - it shakes her
                     * confidence specifically, the same "the whole
                     * gambit visibly failed in front of her" pattern
                     * _resolveGroupHostileEscalation above already uses
                     * for a badly-failed call_for_help.
                     */
                    AIH.MinigameIntimateService._reportBoundaryOutcome(
                        "confidence",
                        "decrease",
                        winner.evaluation,
                        0.4,
                        "bathhouse confrontation: being physically " +
                            "overpowered by " +
                            patron.name +
                            " shook her confidence",
                        true
                    );
                }
            }
        }

        /*
         * "Handled it herself, and it held" - the basis for both faction
         * reputation and the reputation/fame emergent goal below. Giving
         * in (entertain) doesn't count as mishandling, but it's not what
         * builds a reputation for competence either - it's neutral here.
         * Three ways this can still go bad even after picking a good
         * action: deflect_calmly's backfire overwhelming her,
         * call_for_help's helpers demanding a favor she refuses and
         * escalating into a bigger group turning hostile, or
         * intervene_physically going badly (a mishap, or simply not
         * going acceptably even without one).
         */
        badOutcome =
            !!(backfire && !backfire.heldGround) ||
            !!(
                helperFavor &&
                helperFavor.escalation &&
                !helperFavor.escalation.heldGround
            );

        wentWell =
            winner.action !== "entertain" &&
            !interveneFailed &&
            !badOutcome;

        result = {

            requestId: requestId,
            chosenAction: winner.action,
            evaluation: winner.evaluation,
            driftResult: driftResult,
            backfire: backfire,
            helperFavor: helperFavor,
            mishapOccurred: mishapOccurred,
            interveneFailed: interveneFailed,
            mishapType: mishapType,
            wentWell: wentWell
        };

        AIH.MinigameIntimateService.modifyPatronFactionReputationForConfrontation(
            patron,
            result
        );

        AIH.MinigameIntimateService.checkReputationAmbitionGoal(
            wentWell
        );

        AIH.MinigameIntimateService._trackConfrontationCurseConditions(
            result
        );

        return result;
    };

    // =========================================================================
    // RESOLVE A FULL VISIT (request + at most one follow-up)
    // =========================================================================

    AIH.MinigameIntimateService.resolveVisit = function(patron, requestId) {

        var state;
        var template;
        var outcomes;
        var primary;
        var followUp;
        var confrontation;
        var visitRecord;

        state =
            AIH.MinigameIntimateService._ensure();

        if (
            !patron ||
            !state
        ) {

            return null;
        }

        if (!requestId) {

            requestId =
                AIH.MinigameIntimateService._pickRandom(
                    patron.requestPoolIds
                );
        }

        if (!requestId) {
            return null;
        }

        if (patron.kind === "regular") {

            AIH.MinigameIntimateService.ensureRegularRelationship(
                patron
            );
        }

        outcomes = [];

        primary =
            AIH.MinigameIntimateService._resolveRequest(
                patron,
                requestId
            );

        if (!primary) {
            return null;
        }

        outcomes.push(primary);

        template =
            AIH.MinigameIntimateService.REQUEST_TEMPLATES[
                requestId
            ];

        followUp = null;
        confrontation = null;

        if (
            (
                primary.response === "reject" ||
                primary.response === "partial"
            ) &&
            template.followUpId
        ) {

            followUp =
                AIH.MinigameIntimateService._resolveRequest(
                    patron,
                    template.followUpId
                );

            if (followUp) {
                outcomes.push(followUp);
            }
        }

        /*
         * Two refusals in the same visit stops being "a request she
         * declined" and becomes an actual confrontation she has to
         * handle - see the CONFRONTATION SYSTEM above. This applies
         * regardless of patron kind - a generated rowdy party is just as
         * capable of pushing this far as a named regular.
         */
        if (
            primary.response === "reject" &&
            followUp &&
            followUp.response === "reject"
        ) {

            confrontation =
                AIH.MinigameIntimateService.resolveConfrontation(
                    patron,
                    template.followUpId
                );
        }

        if (patron.kind === "regular") {

            AIH.MinigameIntimateService.modifyRegularFamiliarity(
                patron,
                outcomes
            );

            AIH.MinigameIntimateService.modifyRegularFactionReputation(
                patron,
                outcomes
            );

            AIH.MinigameIntimateService.checkHarassmentPattern(
                patron,
                requestId,
                outcomes
            );
        }

        AIH.MinigameIntimateService._trackRequestCurseConditions(
            patron,
            requestId,
            primary,
            followUp,
            confrontation
        );

        visitRecord = {

            visitId:
                state.nextVisitId++,

            timestamp:
                Date.now(),

            patronKind:
                patron.kind,

            patronId:
                patron.id,

            patronName:
                patron.name,

            outcomes:
                outcomes,

            confrontation:
                confrontation
        };

        state.shiftVisitLog.push(
            visitRecord
        );

        state.totalVisits++;

        return visitRecord;
    };

    // =========================================================================
    // CURSED ITEM RELEASE CONDITION TRACKING (v0.2.0)
    // =========================================================================
    //
    // Four items are written to interact with this minigame (see
    // AIH_CursedItems.js's DEFINITIONS, v0.3.0, and the CURSED ITEM
    // INTEGRATION section at the top of this file). This module tracks
    // its own progress toward each item's removalConditionId and calls
    // AIH.CursedItems.markConditionMet() once the relevant count crosses
    // threshold - it never decides whether the item comes off beyond
    // that; AIH.CursedItems.isConditionMet()/removeCursedItem() remain
    // the sole authority on that, exactly as AIH_Minigame_Service.js/
    // AIH_Minigame_TasteTest.js already establish.
    //
    // =========================================================================

    AIH.MinigameIntimateService.EASY_YES_CLEAN_REJECTIONS_NEEDED = 3;
    AIH.MinigameIntimateService.PRACTICED_SMILE_ALTERNATIVES_NEEDED = 3;
    AIH.MinigameIntimateService.BLUSHING_TEMPTRESS_CLEAN_HELPS_NEEDED = 3;
    AIH.MinigameIntimateService.REGULARS_DEVOTION_HELD_REFUSALS_NEEDED = 2;

    /*
     * Called once per resolved visit (from resolveVisit above). Covers
     * anklet_of_the_easy_yes (any boundary-relevant request rejected
     * outright - identified by driftTrait === "inhibition" rather than a
     * hardcoded request id list, matching this file's own "data, not
     * code" convention) and sash_of_the_regulars_devotion (a regular's
     * request ends in a plain refusal that never escalates into a
     * confrontation).
     */
    AIH.MinigameIntimateService._trackRequestCurseConditions = function(
        patron,
        requestId,
        primary,
        followUp,
        confrontation
    ) {

        var state;
        var template;

        if (
            typeof AIH.CursedItems === "undefined" ||
            !AIH.CursedItems.isEquipped
        ) {

            return;
        }

        state =
            AIH.MinigameIntimateService._ensure();

        if (!state) {
            return;
        }

        template =
            AIH.MinigameIntimateService.REQUEST_TEMPLATES[requestId];

        if (
            AIH.CursedItems.isEquipped("anklet_of_the_easy_yes") &&
            !AIH.CursedItems.isConditionMet("anklet_of_the_easy_yes") &&
            primary.response === "reject" &&
            template &&
            template.driftTrait === "inhibition"
        ) {

            state.curseTracking.easyYesCleanRejections += 1;

            if (
                state.curseTracking.easyYesCleanRejections >=
                AIH.MinigameIntimateService.EASY_YES_CLEAN_REJECTIONS_NEEDED
            ) {

                AIH.CursedItems.markConditionMet(
                    "anklet_of_the_easy_yes"
                );
            }
        }

        if (
            patron.kind === "regular" &&
            AIH.CursedItems.isEquipped("sash_of_the_regulars_devotion") &&
            !AIH.CursedItems.isConditionMet("sash_of_the_regulars_devotion") &&
            primary.response === "reject" &&
            !confrontation
        ) {

            state.curseTracking.regularsDevotionHeldRefusals += 1;

            if (
                state.curseTracking.regularsDevotionHeldRefusals >=
                AIH.MinigameIntimateService.REGULARS_DEVOTION_HELD_REFUSALS_NEEDED
            ) {

                AIH.CursedItems.markConditionMet(
                    "sash_of_the_regulars_devotion"
                );
            }
        }
    };

    /*
     * Called once per resolved confrontation (from resolveConfrontation
     * above). Covers perfume_of_the_practiced_smile (chose
     * deflect_calmly or call_for_help despite the compulsion toward
     * entertain) and choker_of_the_blushing_temptress (call_for_help
     * resolved with no helper favor demand following it).
     */
    AIH.MinigameIntimateService._trackConfrontationCurseConditions = function(result) {

        var state;

        if (
            !result ||
            typeof AIH.CursedItems === "undefined" ||
            !AIH.CursedItems.isEquipped
        ) {

            return;
        }

        state =
            AIH.MinigameIntimateService._ensure();

        if (!state) {
            return;
        }

        if (
            AIH.CursedItems.isEquipped("perfume_of_the_practiced_smile") &&
            !AIH.CursedItems.isConditionMet("perfume_of_the_practiced_smile") &&
            (
                result.chosenAction === "deflect_calmly" ||
                result.chosenAction === "call_for_help"
            )
        ) {

            state.curseTracking.practicedSmileAlternativeChoices += 1;

            if (
                state.curseTracking.practicedSmileAlternativeChoices >=
                AIH.MinigameIntimateService.PRACTICED_SMILE_ALTERNATIVES_NEEDED
            ) {

                AIH.CursedItems.markConditionMet(
                    "perfume_of_the_practiced_smile"
                );
            }
        }

        if (
            AIH.CursedItems.isEquipped("choker_of_the_blushing_temptress") &&
            !AIH.CursedItems.isConditionMet("choker_of_the_blushing_temptress") &&
            result.chosenAction === "call_for_help" &&
            !result.helperFavor
        ) {

            state.curseTracking.blushingTemptressCleanHelps += 1;

            if (
                state.curseTracking.blushingTemptressCleanHelps >=
                AIH.MinigameIntimateService.BLUSHING_TEMPTRESS_CLEAN_HELPS_NEEDED
            ) {

                AIH.CursedItems.markConditionMet(
                    "choker_of_the_blushing_temptress"
                );
            }
        }
    };

    // =========================================================================
    // FAMILIARITY FEEDBACK
    // =========================================================================
    //
    // A regular's familiarity nudges up modestly after any visit (she
    // remembers this person), and a bit more if the visit resolved well
    // for both sides. This module does not decide anything about
    // personality here - only the domain-specific relationship state that
    // AIH.PressureEvaluator's options already knows how to consume next
    // time (_regularPressureOptions above).
    //
    // =========================================================================

    AIH.MinigameIntimateService.modifyRegularFamiliarity = function(patron, outcomes) {

        var wentWell;
        var i;

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.modifyAxis
        ) {

            return;
        }

        wentWell = false;

        for (
            i = 0;
            i < outcomes.length;
            i++
        ) {

            if (
                outcomes[i].response === "accept" ||
                outcomes[i].response === "reluctant_accept"
            ) {

                wentWell = true;
            }
        }

        AIH.Relationships.modifyAxis(
            patron.id,
            "familiarity",
            wentWell ? 4 : 1,
            "bathhouse visit"
        );

        if (wentWell) {

            AIH.Relationships.modifyAxis(
                patron.id,
                "trust",
                2,
                "bathhouse visit went well"
            );
        }
    };

    // =========================================================================
    // FACTION REPUTATION FEEDBACK
    // =========================================================================
    //
    // Per Quick-Start Recipe step 7: "if the outcome is socially
    // significant (an NPC involved, a faction implicated): consider
    // whether AIH.Relationships / AIH.Reputation updates are warranted -
    // those modules' existing APIs, not new ones." Only regulars carry a
    // faction in this module, so only regulars trigger this. Magnitudes
    // are deliberately small and symmetric - a pleased regular talks her
    // up a little with her own people; a regular who pushed hard and was
    // still refused twice (primary AND the follow-up escalation) costs a
    // little standing, representing friction/gossip, not a moral verdict.
    // If the faction is not one of AIH.Reputation's defaults, it is
    // registered on first use via the module's own public addFaction()
    // API - not by editing AIH_Reputation.js.
    //
    // =========================================================================

    AIH.MinigameIntimateService.modifyRegularFactionReputation = function(patron, outcomes) {

        var lastOutcome;
        var wentWell;

        if (
            !patron.faction ||
            typeof AIH.Reputation === "undefined" ||
            !AIH.Reputation.modifyAxes
        ) {

            return;
        }

        if (
            AIH.Reputation.hasFaction &&
            !AIH.Reputation.hasFaction(patron.faction) &&
            AIH.Reputation.addFaction
        ) {

            AIH.Reputation.addFaction(
                patron.faction
            );
        }

        lastOutcome =
            outcomes[outcomes.length - 1];

        wentWell =
            lastOutcome.response === "accept" ||
            lastOutcome.response === "reluctant_accept";

        /*
         * A double-refusal used to dock reputation directly here, but
         * that's now superseded: a double-refusal escalates into an
         * actual confrontation (see resolveVisit), and
         * modifyPatronFactionReputationForConfrontation is the
         * authoritative source of reputation consequences for that case
         * - it knows HOW the confrontation actually went, not just that
         * a refusal happened twice. Applying a flat penalty here too
         * would double-count (and fight against) that more informed
         * judgment.
         */
        if (wentWell) {

            AIH.Reputation.modifyAxes(
                patron.faction,
                { reputation: 1 },
                "regular patron " +
                    patron.name +
                    " left the bathhouse pleased"
            );
        }
    };

    // =========================================================================
    // FACTION REPUTATION FEEDBACK - CONFRONTATIONS
    // =========================================================================
    //
    // Unlike modifyRegularFactionReputation above (regulars only, driven
    // by whether a plain visit went well), this applies to ANY patron
    // with a faction - including generated archetypes, since archetypes
    // now carry a faction (see ARCHETYPES) and a confrontation is a
    // dramatic enough event to be faction-worthy even for a one-off
    // visitor. A backfire that overwhelms her costs standing; handling
    // it herself (call_for_help or a clean intervene_physically, or a
    // deflect_calmly that held) earns a little.
    //
    // =========================================================================

    AIH.MinigameIntimateService.modifyPatronFactionReputationForConfrontation = function(
        patron,
        confrontationResult
    ) {

        var badOutcome;

        if (
            !patron.faction ||
            typeof AIH.Reputation === "undefined" ||
            !AIH.Reputation.modifyAxes
        ) {

            return;
        }

        if (
            AIH.Reputation.hasFaction &&
            !AIH.Reputation.hasFaction(patron.faction) &&
            AIH.Reputation.addFaction
        ) {

            AIH.Reputation.addFaction(
                patron.faction
            );
        }

        /*
         * wentWell/badOutcome are computed once in resolveConfrontation
         * (backfire AND helper-favor escalation both factor in there) -
         * reuse that instead of re-deriving it here so the two stay in
         * sync. "entertain" is neutral (not penalized) but also isn't
         * wentWell, so it's excluded from the bad-outcome case too.
         */
        badOutcome =
            !confrontationResult.wentWell &&
            confrontationResult.chosenAction !== "entertain";

        if (confrontationResult.wentWell) {

            AIH.Reputation.modifyAxes(
                patron.faction,
                { reputation: 1, dominance: 1 },
                "she handled a confrontation with " +
                    patron.name +
                    " (" +
                    confrontationResult.chosenAction +
                    ") without it getting away from her"
            );

        } else if (badOutcome) {

            AIH.Reputation.modifyAxes(
                patron.faction,
                { reputation: -2 },
                "a confrontation with " +
                    patron.name +
                    " got away from her at the bathhouse"
            );
        }
    };

    // =========================================================================
    // EMERGENT "REPUTATION AMBITION" GOAL
    // =========================================================================
    //
    // Per the same Section 5 pattern as the avoid-patron goal below, but
    // for the positive direction: repeatedly handling confrontations
    // herself (not just giving in) can plausibly grow into an ambition
    // about how she wants to be known. Tracked globally (not per-patron,
    // since a reputation for composure isn't about any one person) and
    // only fires once the pattern has actually happened enough times in
    // play - never pre-populated.
    //
    // =========================================================================

    AIH.MinigameIntimateService.REPUTATION_GOAL_THRESHOLD = 3;

    AIH.MinigameIntimateService.REPUTATION_GOAL_DESCRIPTIONS = [
        "Become known as the most composed attendant the bathhouse has ever had.",
        "Build a reputation none of the rowdier patrons dare test twice.",
        "Prove, patron by patron, that she can handle anything the bathhouse throws at her."
    ];

    AIH.MinigameIntimateService._hasActiveReputationGoal = function() {

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

    AIH.MinigameIntimateService.checkReputationAmbitionGoal = function(wentWell) {

        var state;

        if (
            !wentWell ||
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.create
        ) {

            return;
        }

        state =
            AIH.MinigameIntimateService._ensure();

        if (!state) {
            return;
        }

        if (state.confrontationsHandledWell === undefined) {
            state.confrontationsHandledWell = 0;
        }

        state.confrontationsHandledWell += 1;

        if (
            state.confrontationsHandledWell <
            AIH.MinigameIntimateService.REPUTATION_GOAL_THRESHOLD
        ) {

            return;
        }

        if (
            AIH.MinigameIntimateService._hasActiveReputationGoal()
        ) {

            return;
        }

        AIH.Goals.create({

            description:
                AIH.MinigameIntimateService._pickRandom(
                    AIH.MinigameIntimateService.REPUTATION_GOAL_DESCRIPTIONS
                ),

            category: "reputation_ambition",
            origin: "emergent",
            baseWeight: 0.5,

            linkedValues: [
                "status",
                "pride"
            ],

            reason:
                "she has handled " +
                state.confrontationsHandledWell +
                " bathhouse confrontations herself without losing control of them"
        });
    };

    // =========================================================================
    // HARASSMENT PATTERN -> EMERGENT GOAL
    // =========================================================================
    //
    // Per handoff Section 5's own worked example: "a bathhouse patron's
    // repeated harassment could spawn 'avoid working when that patron is
    // in'." This module tracks, per regular, how many visits ended in a
    // "hostile escalation" (she refused, the patron pushed a follow-up
    // request anyway, and she refused that too). Once that count crosses
    // a threshold, an emergent goal is created via AIH.Goals.create() -
    // called here because the triggering situation actually happened in
    // play, per Section 5's rule against pre-populating a fixed "if X
    // then always goal Y" table. Deduplicates against an existing
    // active/proposed goal for the same patron so repeat visits don't
    // spawn the goal over and over.
    //
    // =========================================================================

    AIH.MinigameIntimateService.HARASSMENT_GOAL_THRESHOLD = 3;

    AIH.MinigameIntimateService._incidentCounters = function() {

        var state;

        state =
            AIH.MinigameIntimateService._ensure();

        if (!state) {
            return null;
        }

        if (!state.harassmentIncidents) {
            state.harassmentIncidents = {};
        }

        return state.harassmentIncidents;
    };

    AIH.MinigameIntimateService._hasActiveAvoidGoal = function(npcId) {

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
                goals[i].relatedNpcId === npcId &&
                goals[i].category === "avoid_patron" &&
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

    AIH.MinigameIntimateService.checkHarassmentPattern = function(patron, requestId, outcomes) {

        var counters;
        var wasHostileEscalation;

        if (
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.create
        ) {

            return;
        }

        counters =
            AIH.MinigameIntimateService._incidentCounters();

        if (!counters) {
            return;
        }

        wasHostileEscalation =
            outcomes.length > 1 &&
            outcomes[0].response === "reject" &&
            outcomes[1].response === "reject";

        if (!wasHostileEscalation) {
            return;
        }

        counters[patron.id] =
            (counters[patron.id] || 0) + 1;

        if (
            counters[patron.id] <
            AIH.MinigameIntimateService.HARASSMENT_GOAL_THRESHOLD
        ) {

            return;
        }

        if (
            AIH.MinigameIntimateService._hasActiveAvoidGoal(
                patron.id
            )
        ) {

            return;
        }

        AIH.Goals.create({

            description:
                "Avoid working when " +
                patron.name +
                " is in.",

            category: "avoid_patron",
            origin: "emergent",
            baseWeight: 0.55,

            linkedValues: [
                "freedom",
                "dignity"
            ],

            relatedNpcId:
                patron.id,

            relatedFaction:
                patron.faction || null,

            reason:
                patron.name +
                " has repeatedly pushed past a refusal (" +
                requestId +
                ") without taking no for an answer."
        });
    };

    // =========================================================================
    // PUBLIC ENTRY POINTS
    // =========================================================================

    AIH.MinigameIntimateService.startShift = function() {

        var state;

        state =
            AIH.MinigameIntimateService._ensure();

        if (!state) {
            return;
        }

        state.shiftActive = true;
        state.shiftVisitLog = [];

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Bathhouse shift started."
            );
        }
    };

    AIH.MinigameIntimateService.generateVisit = function(archetypeKey) {

        var patron;

        patron =
            AIH.MinigameIntimateService.generatePatron(
                archetypeKey
            );

        if (!patron) {
            return null;
        }

        return AIH.MinigameIntimateService.resolveVisit(
            patron,
            null
        );
    };

    AIH.MinigameIntimateService.visitFromRegular = function(regularId, requestId) {

        var patron;

        patron =
            AIH.MinigameIntimateService.getRegularPatron(
                regularId
            );

        if (!patron) {
            return null;
        }

        return AIH.MinigameIntimateService.resolveVisit(
            patron,
            requestId || null
        );
    };

    AIH.MinigameIntimateService.getShiftLog = function() {

        var state;

        state =
            AIH.MinigameIntimateService._ensure();

        if (!state) {
            return [];
        }

        return AIH.MinigameIntimateService._copy(
            state.shiftVisitLog
        );
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.MinigameIntimateService.initialize = function() {

        AIH.MinigameIntimateService._ensure();

        AIH.MinigameIntimateService._initialized =
            true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Bathhouse (Intimate Service) minigame initialized."
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
            "MinigameIntimateService",
            {
                version:
                    AIH.MinigameIntimateService.VERSION,

                initialize: function() {
                    AIH.MinigameIntimateService.initialize();
                },

                generateVisit: function(archetypeKey) {
                    return AIH.MinigameIntimateService.generateVisit(archetypeKey);
                },

                visitFromRegular: function(regularId, requestId) {
                    return AIH.MinigameIntimateService.visitFromRegular(regularId, requestId);
                },

                getShiftLog: function() {
                    return AIH.MinigameIntimateService.getShiftLog();
                }
            }
        );
    }

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_Minigame_IntimateService",
            "StartShift",
            function() {

                AIH.MinigameIntimateService.startShift();
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_IntimateService",
            "GeneratePatron",
            function() {

                var visit;

                visit =
                    AIH.MinigameIntimateService.generateVisit();

                AIH.Debug.inspect(
                    "Bathhouse visit resolved:",
                    visit
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_IntimateService",
            "VisitRegular",
            function(args) {

                var visit;

                visit =
                    AIH.MinigameIntimateService.visitFromRegular(
                        args.regularId
                    );

                AIH.Debug.inspect(
                    "Bathhouse visit resolved:",
                    visit
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_IntimateService",
            "ShowShiftLog",
            function() {

                AIH.Debug.inspect(
                    "Current shift log:",
                    AIH.MinigameIntimateService.getShiftLog()
                );
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_MinigameIntimateService_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_MinigameIntimateService_createGameObjects.call(
                this
            );

            AIH.MinigameIntimateService.initialize();
        };

        var _AIH_MinigameIntimateService_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_MinigameIntimateService_setupNewGame.call(
                this
            );

            AIH.MinigameIntimateService._initialized =
                false;

            AIH.MinigameIntimateService.initialize();
        };

        var _AIH_MinigameIntimateService_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_MinigameIntimateService_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.MinigameIntimateService._initialized =
                    false;

                AIH.MinigameIntimateService.initialize();
            };
    }

})();