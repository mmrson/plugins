/*:
 * @plugindesc AI Hero Framework - Service Minigame (Waitressing) v0.1.2
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - MINIGAME: SERVICE (WAITRESSING)
 * ============================================================================
 *
 * STEP 25
 *
 * The Service framework, per MINIGAME_HANDOFF.md Section 10-A. Covers
 * Waitressing, Bartending, Table clearing, Banquet serving, Bouncer work
 * and Customer entertainment as one system, not six.
 *
 * Basic loop: seat/queue customers -> take orders -> serve -> handle
 * complaints/incidents -> clear tables -> repeat, punctuated by incidents
 * that generate AIH.PressureEvaluator situations.
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide what she does with a situation on its own initiative. Every
 *   boundary-relevant moment goes through the shared evaluator (via
 *   AIH.CursedItems.evaluateWithPossibleFlip() when that module is
 *   present - see CURSED ITEM INTEGRATION below); this module supplies
 *   the situation, not the verdict.
 * - modify personality/values/emotions directly. Boundary-relevant
 *   outcomes are reported through AIH.PersonalityDrift.reinforce(); this
 *   module never calls AIH.Personality.adjustTrait() itself.
 * - invent customers/incidents outside its own data tables at runtime.
 *   New customer types or incidents are added by extending
 *   AIH.MinigameService.CUSTOMER_TYPES / INCIDENT_TYPES, not by writing
 *   new bespoke code paths.
 * - call an LLM.
 *
 * ============================================================================
 *
 * THE "CHOOSE BEST OF SEVERAL CANDIDATE RESPONSES" PATTERN
 *
 * Some incidents (bouncer situations especially) do not reduce to a
 * single accept/reject choice - she is choosing among several
 * qualitatively different responses (ignore, warn, separate, intervene,
 * take a bribe...). Rather than building a second scoring engine for
 * this, AIH.MinigameService._chooseBest() builds ONE PressureEvaluator
 * situation per candidate response (each with pressure values that
 * reflect what THAT specific response would actually cost/reward her),
 * evaluates all of them, and picks whichever comes back with the best
 * raw score (see _chooseBest's own comment for why this is raw score,
 * not a tier-weighted rank). This reuses the shared evaluator N times
 * instead of inventing new machinery, and is the recommended pattern for
 * any other minigame framework that needs multi-option decisions - see
 * MINIGAME_HANDOFF.md.
 *
 * ============================================================================
 *
 * CURSED ITEM INTEGRATION (v0.1.2)
 *
 * Every decision this module resolves through the shared evaluator now
 * goes through AIH.CursedItems.evaluateWithPossibleFlip() when that
 * module is loaded (see _evaluate below) rather than calling
 * AIH.PressureEvaluator.evaluate() directly - so an equipped cursed item
 * can genuinely flip a request/confrontation decision, exactly like
 * AIH_Minigame_TasteTest.js. One cursed item is written to interact with
 * THIS minigame specifically:
 *
 *     bit_of_obedient_silence   a mouth restraint that keeps her from
 *                               speaking clearly - while it's equipped,
 *                               any bouncer response that requires clear
 *                               speech ("warn", "ask_to_leave") is
 *                               excluded from her available candidates
 *                               (see _buildBouncerCandidates). Its own
 *                               removal condition (three confrontations
 *                               resolved wentWell despite the gag) is
 *                               tracked by this module directly - see
 *                               CURSED ITEM RELEASE CONDITION TRACKING.
 *
 * ============================================================================
 *
 * @command StartShift
 * @text Start Shift
 * @desc Begins a new service shift.
 *
 * @command EndShift
 * @text End Shift
 * @desc Ends the current shift and reports a summary.
 *
 * @command SpawnCustomer
 * @text Spawn Customer
 * @desc Spawns a customer of the given archetype.
 *
 * @arg archetype
 * @text Archetype
 * @type string
 * @default friendly
 *
 * @command SpawnRegular
 * @text Spawn Regular
 * @desc Spawns a named regular customer.
 *
 * @arg regularId
 * @text Regular ID
 * @type string
 * @default old_grum
 *
 * @command TriggerIncident
 * @text Trigger Incident
 * @desc Triggers a named incident, optionally involving a specific customer.
 *
 * @arg incidentType
 * @text Incident Type
 * @type string
 * @default customer_refuses_to_leave
 *
 * @command Show
 * @text Show Shift Status
 * @desc Displays the current shift, active customers and recent incidents.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.MinigameService = AIH.MinigameService || {};

    AIH.MinigameService.VERSION = "0.1.2";

    AIH.MinigameService.SCHEMA_VERSION = 1;

    AIH.MinigameService._initialized = false;

    // =========================================================================
    // COPY / CLAMP
    // =========================================================================

    AIH.MinigameService._copy = function(value) {

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

    AIH.MinigameService._clamp01 = function(value) {

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

    AIH.MinigameService._number = function(value, fallback) {

        var result;

        result =
            Number(value);

        return isNaN(result) ?
            fallback :
            result;
    };

    // =========================================================================
    // STORAGE
    // =========================================================================

    AIH.MinigameService._defaultCurseTracking = function() {

        return {
            obedientSilenceConfrontationsWentWell: 0
        };
    };

    AIH.MinigameService._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.MinigameService._ensure = function() {

        var state;

        state =
            AIH.MinigameService._state();

        if (!state) {
            return null;
        }

        if (!state.minigameService) {

            state.minigameService = {

                schemaVersion:
                    AIH.MinigameService.SCHEMA_VERSION,

                currentShift: null,

                shiftHistory: [],

                activeCustomers: [],

                recentIncidents: [],

                nextCustomerId: 1,

                nextIncidentId: 1,

                curseTracking:
                    AIH.MinigameService._defaultCurseTracking()
            };
        }

        if (!Array.isArray(state.minigameService.activeCustomers)) {
            state.minigameService.activeCustomers = [];
        }

        if (!Array.isArray(state.minigameService.recentIncidents)) {
            state.minigameService.recentIncidents = [];
        }

        if (!Array.isArray(state.minigameService.shiftHistory)) {
            state.minigameService.shiftHistory = [];
        }

        if (
            !state.minigameService.curseTracking ||
            typeof state.minigameService.curseTracking !== "object"
        ) {

            state.minigameService.curseTracking =
                AIH.MinigameService._defaultCurseTracking();
        }

        /*
         * Additive default for saves made before v0.1.2's new counter
         * existed.
         */
        if (
            state.minigameService.curseTracking
                .obedientSilenceConfrontationsWentWell === undefined
        ) {

            state.minigameService.curseTracking
                .obedientSilenceConfrontationsWentWell = 0;
        }

        return state.minigameService;
    };

    // =========================================================================
    // CUSTOMER ARCHETYPES (for generated/filler customers)
    // =========================================================================
    //
    // A small, representative set rather than one entry per adjective in
    // the original brainstorm - "impatient" and "difficult" behave
    // similarly enough mechanically to share an archetype with different
    // flavor text, for example. Add more here as data; do not add new code
    // paths per archetype.
    //
    // Each archetype is a set of RANGES, not fixed values - a spawned
    // customer randomizes within these, so two "impatient" customers don't
    // pressure her identically. persistence/publicity/authority are the
    // original design doc's own pressure vocabulary (see
    // MINIGAME_HANDOFF.md Section 7's mapping note) and get folded into
    // embarrassment/dignityCost/prideCost when a situation is built (see
    // _buildRequestSituation) - do not read them as pre-normalized
    // situation fields directly.
    //
    // =========================================================================

    AIH.MinigameService.CUSTOMER_TYPES = {

        friendly: {
            names: ["Rowan", "Della", "Tomas"],
            faction: "Tavern",
            rewardRange: [20, 60],
            persistenceRange: [0.05, 0.25],
            publicityRange: [0.05, 0.20],
            authorityRange: [0.0, 0.15],
            incidentWeights: { request_outside_normal_service: 0.5, large_tip: 0.3 }
        },

        impatient: {
            names: ["Garrick", "Ossa", "Fenn"],
            faction: "Tavern",
            rewardRange: [10, 30],
            persistenceRange: [0.35, 0.60],
            publicityRange: [0.15, 0.35],
            authorityRange: [0.1, 0.3],
            incidentWeights: { customer_demands_priority: 1.0 }
        },

        rude: {
            names: ["Brack", "Ilva"],
            faction: "Tavern",
            rewardRange: [5, 20],
            persistenceRange: [0.45, 0.75],
            publicityRange: [0.30, 0.55],
            authorityRange: [0.1, 0.35],
            incidentWeights: { customer_demands_priority: 0.6, someone_bothering_patron: 0.4 }
        },

        drunk: {
            names: ["Old Merrin", "Cask", "Wobbles"],
            faction: "Tavern",
            rewardRange: [0, 15],
            persistenceRange: [0.40, 0.70],
            publicityRange: [0.35, 0.65],
            authorityRange: [0.0, 0.15],
            incidentWeights: { customer_refuses_to_leave: 0.5, fight_starts: 0.25, someone_bothering_patron: 0.25 }
        },

        flirtatious: {
            names: ["Sable", "Corin", "Vesh"],
            faction: "Tavern",
            rewardRange: [15, 50],
            persistenceRange: [0.45, 0.80],
            publicityRange: [0.30, 0.60],
            authorityRange: [0.05, 0.25],
            incidentWeights: { request_outside_normal_service: 0.7, pressure_after_refusal: 0.3 }
        },

        wealthy: {
            names: ["Lady Ashworth", "Count Vellan", "Dame Ori"],
            faction: "Nobles",
            rewardRange: [80, 300],
            persistenceRange: [0.35, 0.65],
            publicityRange: [0.20, 0.45],
            authorityRange: [0.55, 0.90],
            incidentWeights: { customer_demands_priority: 0.4, large_tip: 0.4, request_outside_normal_service: 0.2 }
        },

        suspicious: {
            names: ["The Hooded One", "Quell", "Mira the Quiet"],
            faction: "Street",
            rewardRange: [10, 40],
            persistenceRange: [0.20, 0.45],
            publicityRange: [0.0, 0.20],
            authorityRange: [0.0, 0.15],
            incidentWeights: { suspected_theft: 0.6, customer_refuses_to_leave: 0.4 }
        },

        lonely: {
            names: ["Widow Talle", "Barnabus", "Young Perrin"],
            faction: "Tavern",
            rewardRange: [10, 35],
            persistenceRange: [0.15, 0.40],
            publicityRange: [0.05, 0.25],
            authorityRange: [0.0, 0.15],
            incidentWeights: { request_outside_normal_service: 0.4, someone_bothering_patron: 0.2 }
        }

    };

    // =========================================================================
    // NAMED REGULARS (authored)
    // =========================================================================
    //
    // Fixed customers with a stable pressure profile and an
    // AIH.Relationships entry, so familiarity built up over repeat visits
    // actually persists and feeds back in (see _regularPressureOptions
    // below). Values here are still just DATA fed into the same evaluator
    // - nothing here decides an outcome directly.
    //
    // "CityGuard" is not one of AIH.Reputation's default factions - it is
    // registered dynamically on first use via AIH.Reputation.addFaction(),
    // the module's own sanctioned way of adding a faction, not by editing
    // AIH_Reputation.js.
    //
    // =========================================================================

    AIH.MinigameService.REGULARS = {

        old_grum: {
            npcId: "tavern_old_grum",
            name: "Old Grum",
            faction: "Tavern",
            persistence: 0.15,
            publicity: 0.10,
            authority: 0.05,
            rewardRange: [10, 30]
        },

        baroness_fenwick: {
            npcId: "tavern_baroness_fenwick",
            name: "Baroness Fenwick",
            faction: "Nobles",
            persistence: 0.55,
            publicity: 0.40,
            authority: 0.85,
            rewardRange: [120, 260]
        },

        sergeant_kell: {
            npcId: "tavern_sergeant_kell",
            name: "Sergeant Kell",
            faction: "CityGuard",
            persistence: 0.40,
            publicity: 0.25,
            authority: 0.60,
            rewardRange: [30, 80]
        }

    };

    // =========================================================================
    // INCIDENT TEMPLATES
    // =========================================================================
    //
    // "kind" determines which resolution path handles the incident:
    //
    //     request        a single accept/reject/negotiate situation, built
    //                    from baseSituation plus the triggering
    //                    customer's publicity/authority (see
    //                    _buildRequestSituation)
    //
    //     bouncer         a standalone multi-candidate confrontation
    //                    resolved through resolveConfrontation()
    //
    //     complaint       routed to the dish-alteration system
    //
    // baseSituation mirrors AIH_Minigame_Bathhouse.js's REQUEST_TEMPLATES
    // shape - danger/embarrassment/dignityCost/freedomCost/modestyCost/
    // prideCost are the BASE values before _buildRequestSituation folds
    // in the customer's publicity (-> embarrassment) and authority
    // (-> dignityCost/prideCost multiplier).
    //
    // Trait assignments below are checked against the CURRENT
    // AIH_PressureEvaluator.js (post mercy-retirement, with the trust/
    // defiance/approvalSeeking-resistance terms merged in) - not an
    // earlier snapshot. assertiveness, trust, inhibition, and
    // approvalSeeking are all genuinely read.
    //
    // =========================================================================

    AIH.MinigameService.INCIDENT_TYPES = {

        customer_demands_priority: {
            kind: "request",
            trait: "assertiveness",
            direction: "increase",
            baseSituation: {
                severity: "normal",
                danger: 0,
                embarrassment: 0.10,
                dignityCost: 0.05,
                freedomCost: 0.10,
                modestyCost: 0,
                prideCost: 0.15
            }
        },

        request_outside_normal_service: {
            kind: "request",
            trait: "inhibition",
            direction: "decrease",
            baseSituation: {
                severity: "medium",
                danger: 0,
                embarrassment: 0.20,
                dignityCost: 0.05,
                freedomCost: 0.10,
                modestyCost: 0.25,
                prideCost: 0.05
            }
        },

        pressure_after_refusal: {
            kind: "request",
            /*
             * inhibition is the primary, dominant trait here (embarrassment
             * 0.30 and modestyCost 0.30 are this template's tied largest
             * costs, and inhibition is weighted directly against both
             * jointly). approvalSeeking is ALSO reported as a genuine
             * secondary factor - see resolveRequestIncident, which reports
             * it at reduced magnitude alongside inhibition on the same
             * event. Per design decision: her people-pleasing tendency
             * should have a real, measurable effect here, especially when
             * a trusted/familiar party is the one doing the pressuring -
             * AIH_PressureEvaluator.js's resistance formula now includes
             * an approvalSeeking x attachmentDiscount term specifically
             * for this (a regular's trust amplifies how much her
             * approval-seeking pulls against resistance). Verified this
             * works and shows a real, correctly-signed effect in
             * unsaturated conditions - but this specific template's own
             * "rare" severity + high combined costs mean it sits in a
             * genuine double-saturation zone (both willingness AND
             * resistance clamp to their ceiling simultaneously) for
             * several trait combinations, which is a property of this
             * heroine's baseline stats meeting this template's cost
             * profile, not a defect in the new term - confirmed by
             * direct testing, not assumed.
             */
            trait: "inhibition",
            direction: "decrease",
            secondaryTrait: "approvalSeeking",
            secondaryDirection: "increase",
            /*
             * This is the explicit "refusal is not necessarily the end"
             * mechanic - see resolveRequestIncident below. It is
             * generated as a FOLLOW-UP after a "reject" response, not
             * spawned independently.
             */
            isFollowUp: true,
            baseSituation: {
                severity: "rare",
                danger: 0,
                embarrassment: 0.30,
                dignityCost: 0.10,
                freedomCost: 0.15,
                modestyCost: 0.30,
                prideCost: 0.10
            }
        },

        large_tip: {
            kind: "request",
            /*
             * pride, not approvalSeeking - tested directly against the
             * real evaluator with this template's own field values at a
             * realistic reward (e.g. 200, within the wealthy archetype's
             * range): the reward alone saturates willingness to its
             * ceiling regardless of any willingness-side trait, so
             * approvalSeeking (which only ever acts on willingness)
             * contributes exactly zero here despite being mechanically
             * "read" by the evaluator. pride is resistance-side and
             * shows a real, substantial effect (confirmed delta -0.16)
             * even with willingness saturated.
             */
            trait: "pride",
            direction: "decrease",
            baseSituation: {
                severity: "medium",
                danger: 0,
                embarrassment: 0.15,
                dignityCost: 0.05,
                freedomCost: 0.05,
                modestyCost: 0.10,
                prideCost: 0.05
            }
        },

        suspected_theft: {
            kind: "request",
            /*
             * trust/decrease - trust IS read by the current evaluator
             * (the trust x danger term in _personalityPressure), and this
             * template's whole premise is a trust judgment about the
             * customer, so it's the correct fit narratively as well as
             * mechanically.
             */
            trait: "trust",
            direction: "decrease",
            baseSituation: {
                severity: "normal",
                danger: 0.1,
                embarrassment: 0.05,
                dignityCost: 0,
                freedomCost: 0,
                modestyCost: 0,
                prideCost: 0
            }
        },

        customer_refuses_to_leave: {
            kind: "bouncer",
            severity: "medium"
        },

        someone_bothering_patron: {
            kind: "bouncer",
            severity: "medium"
        },

        fight_starts: {
            kind: "bouncer",
            severity: "rare"
        }

    };

    // =========================================================================
    // BOUNCER RESPONSE OPTIONS
    // =========================================================================
    //
    // Each option is turned into its own situation by _buildBouncerSituation
    // below. pride/dignity/danger/reward deltas here are relative
    // descriptions of what THAT option costs or offers, not absolute
    // values - _buildBouncerSituation scales them against the incident's
    // own severity.
    //
    // requiresSpeech: true marks a response as needing her to speak
    // clearly - read by _buildBouncerCandidates below to exclude it
    // while bit_of_obedient_silence (see AIH_CursedItems.js) is
    // equipped. Every other response is unaffected either way.
    //
    // IMPORTANT - "separate" is not actually the safe default it looks
    // like. Pulling two riled-up patrons apart without otherwise engaging
    // them tends to redirect their attention onto HER instead of each
    // other. If she then declines that attention, it can escalate into
    // exactly the danger she was trying to avoid. This is modeled as a
    // genuine backfire chain (see _resolveSeparateBackfire), not as
    // a static pressure value - so "separate" only reads as low-risk in
    // the moment, and its real expected risk depends on what she does
    // next, which in turn depends on her actual current personality
    // (inhibition/approvalSeeking). A heroine who has drifted toward
    // higher approvalSeeking will defuse the follow-up safely more often;
    // a heroine who has not will refuse more often and escalate more
    // often. "entertain" is the direct, immediately-safe alternative -
    // choosing to defuse by engaging the patrons rather than separating
    // them - which costs her personally (boundary-wise) rather than
    // physically. "intervene_physically" remains the single highest
    // immediate-danger option, but unlike a failed "separate" it resolves
    // the incident decisively rather than risking a worse escalation
    // afterward.
    //
    // =========================================================================

    AIH.MinigameService.BOUNCER_RESPONSES = [

        {
            action: "ignore",
            danger: 0.0, prideCost: 0.05, dignityCost: 0.0,
            embarrassment: 0.10, reward: 0,
            /*
             * "mercy" was the original target here but has been retired
             * as a stored trait entirely (see AIH_PressureEvaluator.js's
             * getDecisiveness() migration). pride is the replacement:
             * ignore's own costs are both tiny (prideCost 0.05,
             * embarrassment 0.10), so nothing about the situation itself
             * distinguishes it strongly, but pride is heavily weighted in
             * resistance's flat baseResistance term regardless of this
             * option's small situational costs, making it the one real
             * lever available.
             */
            trait: "pride", direction: "decrease"
        },

        {
            action: "warn",
            danger: 0.05, prideCost: 0.0, dignityCost: 0.0,
            embarrassment: 0.05, reward: 0,
            trait: "assertiveness", direction: "increase",
            fitFor: ["customer_refuses_to_leave"],
            requiresSpeech: true
        },

        {
            action: "entertain",
            danger: 0.05, prideCost: 0.15, dignityCost: 0.10,
            embarrassment: 0.35, modestyCost: 0.20, reward: 25,
            trait: "inhibition", direction: "decrease",
            fitFor: ["customer_refuses_to_leave", "someone_bothering_patron"]
        },

        {
            action: "separate",
            /*
             * Base profile only - the real risk lives in the follow-up
             * chain (_resolveSeparateBackfire), not here. Kept
             * deliberately non-trivial (not free) even before that chain
             * runs, since getting between two upset patrons is not
             * actually costless.
             */
            danger: 0.15, prideCost: 0.05, dignityCost: 0.0,
            embarrassment: 0.15, reward: 0,
            trait: "assertiveness", direction: "increase",
            fitFor: ["someone_bothering_patron"]
        },

        {
            action: "ask_to_leave",
            danger: 0.10, prideCost: 0.05, dignityCost: 0.0,
            embarrassment: 0.15, reward: 0,
            /*
             * assertiveness, not defiance - defiance isn't read by the
             * evaluator, and telling a customer to leave is a direct,
             * boundary-enforcing assertive act, the same category as
             * "warn"/"separate" above.
             */
            trait: "assertiveness", direction: "increase",
            fitFor: ["customer_refuses_to_leave"],
            requiresSpeech: true
        },

        {
            action: "call_authority",
            danger: 0.05, prideCost: 0.10, dignityCost: 0.05,
            embarrassment: 0.05, reward: 0,
            /*
             * pride, not defiance, per design decision: calling for
             * outside authority reflects an inability to handle the
             * situation herself, and that costs her pride REGARDLESS of
             * how the call itself resolves - not something that should
             * only register when it goes badly. Reported with
             * unconditionalDriftReport: true in resolveConfrontation/
             * _resolveSeparateBackfire below, matching
             * AIH_Minigame_Bathhouse.js's call_for_help precedent
             * ("needing help at all reflects a situation she couldn't
             * handle herself, so this erodes pride even on the success
             * path").
             */
            trait: "pride", direction: "decrease",
            unconditionalDriftReport: true,
            fitFor: ["fight_starts"]
        },

        {
            action: "intervene_physically",
            danger: 0.55, prideCost: 0.0, dignityCost: 0.0,
            embarrassment: 0.20, reward: 0,
            /*
             * "mercy" was the original target here but has been retired
             * (see the "ignore" comment above for the same migration).
             * pride is the replacement - this option has zero prideCost/
             * dignityCost of its own, so pride only helps via
             * resistance's flat baseline term, not a direct situational
             * cost, meaning it can take real cumulative drift before it
             * moves. That's a fitting property for the single
             * highest-danger option to be the hardest to unlock.
             */
            trait: "pride", direction: "decrease",
            fitFor: ["fight_starts"]
        },

        {
            action: "take_bribe",
            danger: 0.05, prideCost: 0.25, dignityCost: 0.30,
            embarrassment: 0.10, reward: 60,
            /*
             * pride, not trust - taking a bribe is a hit to her own
             * integrity/self-respect, not to how much she trusts other
             * people. Reassigned during the trait-validity audit.
             */
            trait: "pride", direction: "decrease"
        },

        {
            action: "protect_someone",
            danger: 0.30, prideCost: 0.0, dignityCost: 0.0,
            embarrassment: 0.10, reward: 0,
            /*
             * "mercy" was the original target here but has been retired
             * (see the "ignore" comment above for the same migration).
             * pride is the replacement here too - it ending up shared
             * with several other options in this list isn't a
             * distinctness failure; several different actions eroding
             * the same underlying trait is already an established
             * pattern in this framework (e.g. both "entertain" and
             * "intervene_physically" targeting inhibition in
             * AIH_Minigame_Bathhouse.js).
             */
            trait: "pride", direction: "decrease",
            fitFor: ["someone_bothering_patron", "fight_starts"]
        }

    ];

    // =========================================================================
    // DISH ALTERATION SYSTEM
    // =========================================================================
    //
    // A complaint ("this tastes wrong") is generated with an underlying
    // ground truth the heroine does not automatically know. She can
    // taste/smell/ask the kitchen/believe/distrust the customer - what she
    // actually learns depends on which investigation she chooses, not on
    // the ground truth being handed to her.
    //
    // =========================================================================

    AIH.MinigameService.ALTERATION_TYPES = [
        "chili", "salt", "sweetener", "spoiled_ingredient", "none"
    ];

    AIH.MinigameService._generateDishTruth = function() {

        var altered;
        var alteration;
        var amount;
        var addedBy;
        var complaintValid;

        altered =
            Math.random() < 0.55;

        if (!altered) {

            return {
                altered: false,
                alteration: "none",
                amount: "none",
                addedBy: null,
                complaintValid: Math.random() < 0.15
            };
        }

        alteration =
            AIH.MinigameService.ALTERATION_TYPES[
                Math.floor(
                    Math.random() *
                    (AIH.MinigameService.ALTERATION_TYPES.length - 1)
                )
            ];

        amount =
            ["mild", "high", "extreme"][
                Math.floor(Math.random() * 3)
            ];

        addedBy =
            Math.random() < 0.35 ?
                "customer" :
                "kitchen";

        complaintValid =
            alteration === "spoiled_ingredient" ||
            (addedBy === "kitchen" && amount !== "mild");

        return {
            altered: true,
            alteration: alteration,
            amount: amount,
            addedBy: addedBy,
            complaintValid: complaintValid
        };
    };

    /*
     * Resolves a food complaint. "investigation" is what she chooses to do
     * about it - this shapes what she LEARNS (a belief), separately from
     * what actually happened (dishTruth).
     *
     * investigation: "taste" | "smell" | "ask_kitchen" | "believe_customer"
     *                | "distrust_customer"
     */
    AIH.MinigameService.resolveComplaint = function(
        customerId,
        investigation
    ) {

        var dishTruth;
        var correct;
        var proposition;
        var container;

        dishTruth =
            AIH.MinigameService._generateDishTruth();

        correct = false;

        if (
            investigation === "taste" ||
            investigation === "smell"
        ) {

            /*
             * Direct investigation is reliable but not perfect - severe
             * alterations are always caught, mild ones sometimes slip by.
             */
            correct =
                dishTruth.amount === "extreme" ||
                dishTruth.amount === "high" ||
                Math.random() < 0.5;

        } else if (investigation === "ask_kitchen") {

            /*
             * The kitchen is reliable about its own mistakes and dishonest
             * about customer-caused ones.
             */
            correct =
                dishTruth.addedBy !== "customer";

        } else if (investigation === "believe_customer") {

            correct =
                dishTruth.complaintValid;

        } else if (investigation === "distrust_customer") {

            correct =
                !dishTruth.complaintValid;
        }

        /*
         * What she concludes becomes a belief about THIS customer type of
         * situation, not a certainty about this one dish - matching how
         * AIH.Beliefs already works. Repeated correct/incorrect
         * investigations shift her trust in a given investigation method
         * and in customer complaints generally.
         */
        if (
            typeof AIH.Beliefs !== "undefined" &&
            AIH.Beliefs.add
        ) {

            proposition =
                investigation === "ask_kitchen" ?
                    "The kitchen staff are honest about their mistakes." :
                    "Customer complaints about the food are usually genuine.";

            if (
                typeof AIH.Beliefs.getByProposition === "function"
            ) {

                var existing =
                    AIH.Beliefs.getByProposition(proposition);

                if (existing) {

                    AIH.Beliefs.updateConfidence(
                        existing.id,
                        AIH.MinigameService._clamp01(
                            existing.confidence +
                            (correct ? 0.08 : -0.08)
                        ),
                        "waitressing complaint resolution"
                    );

                } else {

                    AIH.Beliefs.add(
                        proposition,
                        correct ? 0.58 : 0.42,
                        { category: "service_experience" }
                    );
                }
            }
        }

        /*
         * She can discover she likes an alteration she wasn't expecting
         * to. This is intrinsic-preference reinforcement, not
         * reward/pressure-driven, per MINIGAME_HANDOFF.md Section 8.
         */
        if (
            dishTruth.altered &&
            dishTruth.amount === "mild" &&
            Math.random() < 0.25
        ) {

            dishTruth.discoveredEnjoyment = true;
        }

        container =
            AIH.MinigameService._ensure();

        if (container) {

            container.recentIncidents.push({
                id: AIH.MinigameService._nextIncidentId(),
                type: "food_complaint",
                customerId: customerId,
                investigation: investigation,
                dishTruth: dishTruth,
                investigationCorrect: correct,
                timestamp: Date.now()
            });

            if (container.currentShift) {

                container.currentShift.complaintsResolved += 1;
            }
        }

        return {
            dishTruth: dishTruth,
            investigationCorrect: correct
        };
    };

    // =========================================================================
    // ID HELPERS
    // =========================================================================

    AIH.MinigameService._nextCustomerId = function() {

        var container;
        var id;

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        id =
            "customer_" +
            container.nextCustomerId;

        container.nextCustomerId += 1;

        return id;
    };

    AIH.MinigameService._nextIncidentId = function() {

        var container;
        var id;

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        id =
            container.nextIncidentId;

        container.nextIncidentId += 1;

        return id;
    };

    // =========================================================================
    // SHIFT MANAGEMENT
    // =========================================================================

    AIH.MinigameService.startShift = function() {

        var container;

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        if (container.currentShift) {

            return AIH.MinigameService._copy(
                container.currentShift
            );
        }

        container.currentShift = {

            id: "shift_" + Date.now(),
            startedAt: Date.now(),
            customersServed: 0,
            complaintsResolved: 0,
            incidentsResolved: 0,
            totalTips: 0
        };

        return AIH.MinigameService._copy(
            container.currentShift
        );
    };

    AIH.MinigameService.endShift = function() {

        var container;
        var shift;

        container =
            AIH.MinigameService._ensure();

        if (
            !container ||
            !container.currentShift
        ) {

            return null;
        }

        shift =
            container.currentShift;

        shift.endedAt =
            Date.now();

        container.shiftHistory.push(shift);

        container.currentShift =
            null;

        container.activeCustomers = [];

        return AIH.MinigameService._copy(
            shift
        );
    };

    // =========================================================================
    // CUSTOMER SPAWNING
    // =========================================================================
    //
    // Two-tier sourcing, mirroring AIH_Minigame_Bathhouse.js: spawnCustomer
    // generates a one-off customer from an archetype's ranges (so two
    // "impatient" customers don't pressure her identically); spawnRegular
    // pulls in a named, fixed-profile customer from REGULARS and gives
    // them a persistent AIH.Relationships entry, which is what lets
    // familiarity actually accumulate and feed back in (see
    // _regularPressureOptions below).
    //
    // Both converge on the same customer shape:
    //   { kind: "generated"|"regular", id, name, faction, persistence,
    //     publicity, authority, rewardRange, served }
    //
    // =========================================================================

    AIH.MinigameService._randomBetween = function(min, max) {

        min = AIH.MinigameService._number(min, 0);
        max = AIH.MinigameService._number(max, min);

        return min + Math.random() * (max - min);
    };

    AIH.MinigameService.spawnCustomer = function(archetypeKey) {

        var archetype;
        var container;
        var customer;
        var names;

        archetype =
            AIH.MinigameService.CUSTOMER_TYPES[archetypeKey];

        if (!archetype) {
            return null;
        }

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        names =
            archetype.names ||
            ["Customer"];

        customer = {

            kind: "generated",

            id:
                AIH.MinigameService._nextCustomerId(),

            archetype:
                archetypeKey,

            name:
                names[
                    Math.floor(Math.random() * names.length)
                ],

            faction:
                archetype.faction || null,

            persistence:
                AIH.MinigameService._randomBetween(
                    archetype.persistenceRange[0],
                    archetype.persistenceRange[1]
                ),

            publicity:
                AIH.MinigameService._randomBetween(
                    archetype.publicityRange[0],
                    archetype.publicityRange[1]
                ),

            authority:
                AIH.MinigameService._randomBetween(
                    archetype.authorityRange[0],
                    archetype.authorityRange[1]
                ),

            rewardRange:
                archetype.rewardRange.slice(),

            arrivedAt:
                Date.now(),

            served:
                false
        };

        container.activeCustomers.push(customer);

        return AIH.MinigameService._copy(customer);
    };

    AIH.MinigameService.spawnRegular = function(regularId) {

        var regular;
        var container;
        var customer;

        regular =
            AIH.MinigameService.REGULARS[regularId];

        if (!regular) {
            return null;
        }

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        customer = {

            kind: "regular",

            id:
                regular.npcId,

            regularId:
                regularId,

            name:
                regular.name,

            faction:
                regular.faction || null,

            persistence:
                regular.persistence,

            publicity:
                regular.publicity,

            authority:
                regular.authority,

            rewardRange:
                regular.rewardRange.slice(),

            arrivedAt:
                Date.now(),

            served:
                false
        };

        container.activeCustomers.push(customer);

        AIH.MinigameService.ensureRegularRelationship(
            customer
        );

        return AIH.MinigameService._copy(customer);
    };

    // =========================================================================
    // REGULAR RELATIONSHIP TRACKING
    // =========================================================================
    //
    // Per MINIGAME_HANDOFF.md Section 7 - "your minigame's equivalent [of
    // livestream viewer favor/trust/familiarity], if it has one, goes
    // here." A regular's familiarity is read back in as domainPressure (a
    // regular she knows well applies more comfortable, less alarming
    // pressure) and trust as an attachmentDiscount (someone she trusts
    // gets a little slack on resistance). This calls straight into
    // AIH.Relationships - it does not invent a second relationship
    // system.
    //
    // =========================================================================

    AIH.MinigameService.ensureRegularRelationship = function(customer) {

        if (
            !customer ||
            customer.kind !== "regular"
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
            customer.id,
            customer.name,
            customer.faction
        );
    };

    AIH.MinigameService._regularPressureOptions = function(customer) {

        var relationship;
        var familiarity;
        var trust;

        if (
            !customer ||
            customer.kind !== "regular" ||
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.get
        ) {

            return {};
        }

        relationship =
            AIH.Relationships.get(customer.id);

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
             * a raw pressure term the same way the livestream integration
             * uses domainPressure. Deliberately gentle: a regular's
             * familiarity should nudge things, not dominate the
             * evaluation.
             */
            domainPressure:
                familiarity * 0.15,

            attachmentDiscount:
                AIH.MinigameService._clamp01(
                    trust / 100
                ) * 0.12
        };
    };

    // =========================================================================
    // AUTHORITY FACTOR
    // =========================================================================
    //
    // Mirrors AIH_Minigame_Bathhouse.js's authorityFactor exactly: a
    // customer with real authority makes dignity/pride costs weigh more,
    // not less - being condescended to by someone who genuinely can make
    // her life difficult stings more than the identical words from a
    // nobody.
    //
    // =========================================================================

    AIH.MinigameService._authorityFactor = function(authority) {

        return 1 +
            AIH.MinigameService._number(authority, 0) * 0.35;
    };

    // =========================================================================
    // BUILD A REQUEST SITUATION FROM A CUSTOMER + INCIDENT
    // =========================================================================
    //
    // publicity folds into embarrassment directly; authority scales
    // dignityCost/prideCost via _authorityFactor. persistence is
    // deliberately NOT folded in here - it drives escalation probability
    // and confrontation intensity instead (see resolveRequestIncident and
    // _confrontationIntensity), not the base situation's pressure fields,
    // matching AIH_Minigame_Bathhouse.js's own division of responsibility.
    //
    // =========================================================================

    AIH.MinigameService._buildRequestSituation = function(
        customer,
        incidentType
    ) {

        var template;
        var base;
        var authorityFactor;
        var reward;

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType] ||
            {};

        base =
            template.baseSituation ||
            {};

        authorityFactor =
            AIH.MinigameService._authorityFactor(customer.authority);

        reward =
            customer.rewardRange ?
                AIH.MinigameService._randomBetween(
                    customer.rewardRange[0],
                    customer.rewardRange[1]
                ) :
                20;

        return AIH.PressureEvaluator.normalizeSituation({

            id: "svc_" + customer.id + "_" + incidentType + "_" + Date.now(),
            type: "waitressing_request",
            category: incidentType,
            description:
                customer.name + ": " + incidentType,

            severity:
                base.severity ||
                "normal",

            reward: Math.round(reward),

            danger:
                AIH.MinigameService._number(base.danger, 0),

            embarrassment:
                AIH.MinigameService._clamp01(
                    AIH.MinigameService._number(base.embarrassment, 0.1) +
                    AIH.MinigameService._number(customer.publicity, 0) * 0.20
                ),

            dignityCost:
                AIH.MinigameService._clamp01(
                    AIH.MinigameService._number(base.dignityCost, 0) *
                    authorityFactor
                ),

            freedomCost:
                AIH.MinigameService._number(base.freedomCost, 0.05),

            modestyCost:
                AIH.MinigameService._number(base.modestyCost, 0),

            prideCost:
                AIH.MinigameService._clamp01(
                    AIH.MinigameService._number(base.prideCost, 0) *
                    authorityFactor
                ),

            source: customer

        });
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
    // AIH_Minigame_TasteTest.js's own identical wrapper does.
    //
    // =========================================================================

    AIH.MinigameService._evaluate = function(situation, options) {

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
                "waitressing: her real self would have answered differently"
            );
        }

        return evaluation;
    };

    // =========================================================================
    // GENERIC "CHOOSE BEST OF SEVERAL CANDIDATES" HELPER
    // =========================================================================
    //
    // See the file header for why this exists. Any minigame framework
    // needing a multi-option decision can reuse this exact pattern.
    //
    // candidates: array of { action, situation, meta, options }
    //             "options" is the same PressureEvaluator options object
    //             (domainPressure/domainResistance/attachmentDiscount) any
    //             other evaluate() call would take - typically the same
    //             _regularPressureOptions(customer) result passed to every
    //             candidate so a regular's familiarity/trust applies
    //             consistently across all of them, not just one.
    //
    // Returns { action, evaluation, meta } for the winner, ranked by raw
    // score alone (see _chooseBest's own comment below for why).
    //
    // =========================================================================

    AIH.MinigameService.RESPONSE_RANK = {
        accept: 3,
        reluctant_accept: 2,
        partial: 1,
        reject: 0
    };

    AIH.MinigameService._chooseBest = function(candidates) {

        var best;
        var bestScore;
        var i;
        var candidate;
        var evaluation;

        /*
         * Ranks candidates by raw score alone, NOT by response tier.
         *
         * An earlier version ranked by (RESPONSE_RANK[response] * 10 +
         * score), on the reasoning that an "accept" should generally beat
         * a "reject" even with a lower score. But response tier is
         * itself just score run through the same fixed thresholds
         * (accept >= 0.35, reluctant_accept >= 0.05, partial >= -0.15,
         * else reject) - it carries no information beyond what score
         * already has. Multiplying by tier didn't fix mis-orderings; it
         * manufactured artificial ~10-point margins out of tier-boundary
         * crossings that were often only ~0.02-0.05 in real score terms.
         * That artificial margin was then large enough to swamp all the
         * legitimate variation (different customers, different drifted
         * personality) the rest of this system exists to produce -
         * whichever candidate happened to cross a boundary would then
         * win almost every trial regardless of which customer spawned,
         * which is exactly the "100% of trials pick the same action"
         * collapse this was rewritten to fix. Found by comparing the raw
         * per-candidate scores directly against the inflated ranks in a
         * real collapsed scenario, not assumed from theory.
         *
         * Ranking by raw score means the actual best-scoring candidate
         * always wins, by a margin proportional to how much better it
         * actually is - including cases where every candidate is
         * "reject" tier and she is picking the least-bad of a bad set,
         * which is itself the correct behavior for a chooseBest helper.
         */
        best = null;
        bestScore = -Infinity;

        for (
            i = 0;
            i < candidates.length;
            i++
        ) {

            candidate = candidates[i];

            evaluation =
                AIH.MinigameService._evaluate(
                    candidate.situation,
                    candidate.options || {}
                );

            if (evaluation.score > bestScore) {

                bestScore = evaluation.score;

                best = {
                    action: candidate.action,
                    evaluation: evaluation,
                    meta: candidate.meta || {}
                };
            }
        }

        return best;
    };

    // =========================================================================
    // CONFRONTATION INTENSITY
    // =========================================================================
    //
    // Mirrors AIH_Minigame_Bathhouse.js's _confrontationIntensity exactly:
    // how charged this specific confrontation is, driven by the specific
    // customer's persistence and authority rather than a flat per-
    // incident-type severity tier. Reused across every candidate
    // response's situation AND the backfire/mishap rolls below, so a
    // pushy, high-authority customer makes the whole confrontation more
    // volatile in every direction at once, not just one.
    //
    // =========================================================================

    AIH.MinigameService._confrontationIntensity = function(customer) {

        return 1 +
            AIH.MinigameService._number(customer && customer.persistence, 0.3) * 0.3 +
            AIH.MinigameService._number(customer && customer.authority, 0.1) * 0.2;
    };

    // =========================================================================
    // BUILD A CONFRONTATION SITUATION FOR ONE CANDIDATE RESPONSE
    // =========================================================================
    //
    // Combines Service's own fitFor bonus/penalty (does this response
    // actually suit THIS incident type) with the customer-driven intensity
    // multiplier (how charged is THIS specific confrontation) - the two
    // are independent axes: fitFor differentiates WHICH response makes
    // sense for a given incident, intensity differentiates HOW MUCH any of
    // them cost for a given customer.
    //
    // =========================================================================

    AIH.MinigameService._buildBouncerSituation = function(
        incidentType,
        responseOption,
        customer,
        intensity
    ) {

        var template;
        var fits;
        var isTargeted;
        var mismatchPenalty;
        var fitBonus;
        var authorityFactor;

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType] ||
            {};

        intensity =
            AIH.MinigameService._number(intensity, 1.0);

        authorityFactor =
            AIH.MinigameService._authorityFactor(
                customer && customer.authority
            );

        /*
         * fitFor makes different bouncer responses actually differentiate
         * per incident type, rather than the same profiles always
         * ranking the same way regardless of what is happening. A response
         * with no fitFor list is general-purpose and unaffected either
         * way. A response WITH a fitFor list is a targeted response: it
         * gets a bonus when used for an incident it's suited to, and a
         * penalty (it reads as overreacting or underreacting) when used
         * for one it is not.
         */
        isTargeted =
            Array.isArray(responseOption.fitFor);

        fits =
            isTargeted &&
            responseOption.fitFor.indexOf(incidentType) >= 0;

        fitBonus =
            fits ?
                0.7 :
                1.0;

        mismatchPenalty =
            (isTargeted && !fits) ?
                1.4 :
                1.0;

        return AIH.PressureEvaluator.normalizeSituation({

            id: "bouncer_" + incidentType + "_" + responseOption.action + "_" + Date.now(),
            type: "bouncer_response",
            category: incidentType,
            description: incidentType + " -> " + responseOption.action,

            severity:
                template.severity ||
                "normal",

            reward:
                (responseOption.reward || 0) *
                (fits ? 1.25 : 1.0),

            danger:
                AIH.MinigameService._clamp01(
                    (responseOption.danger || 0) *
                    intensity *
                    fitBonus *
                    mismatchPenalty
                ),

            embarrassment:
                AIH.MinigameService._clamp01(
                    (responseOption.embarrassment || 0) *
                    intensity *
                    fitBonus *
                    mismatchPenalty
                ),

            dignityCost:
                AIH.MinigameService._clamp01(
                    (responseOption.dignityCost || 0) *
                    authorityFactor *
                    fitBonus *
                    mismatchPenalty
                ),

            freedomCost: 0,

            modestyCost:
                AIH.MinigameService._clamp01(
                    (responseOption.modestyCost || 0) *
                    fitBonus *
                    mismatchPenalty
                ),

            prideCost:
                AIH.MinigameService._clamp01(
                    (responseOption.prideCost || 0) *
                    authorityFactor *
                    fitBonus *
                    mismatchPenalty
                )

        });
    };

    // =========================================================================
    // BUILD BOUNCER CANDIDATES (with speech-requirement filtering)
    // =========================================================================
    //
    // Wraps BOUNCER_RESPONSES into the { action, situation, options, meta }
    // shape _chooseBest expects, the same as resolveConfrontation always
    // built inline - pulled out into its own function purely so the
    // bit_of_obedient_silence filter below has one place to live rather
    // than being duplicated at every _chooseBest call site that iterates
    // BOUNCER_RESPONSES.
    //
    // =========================================================================

    AIH.MinigameService._buildBouncerCandidates = function(
        contextIncidentType,
        customer,
        intensity,
        options
    ) {

        var candidates;
        var i;
        var option;
        var silenced;

        candidates = [];

        silenced =
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.isEquipped &&
            AIH.CursedItems.isEquipped("bit_of_obedient_silence");

        for (
            i = 0;
            i < AIH.MinigameService.BOUNCER_RESPONSES.length;
            i++
        ) {

            option =
                AIH.MinigameService.BOUNCER_RESPONSES[i];

            /*
             * bit_of_obedient_silence: a response that requires clear
             * speech is simply not available while the gag is in - she
             * physically cannot say it.
             */
            if (
                silenced &&
                option.requiresSpeech
            ) {

                continue;
            }

            candidates.push({

                action: option.action,

                situation:
                    AIH.MinigameService._buildBouncerSituation(
                        contextIncidentType,
                        option,
                        customer,
                        intensity
                    ),

                options: options,

                meta: option

            });
        }

        return candidates;
    };

    // =========================================================================
    // SERVE CUSTOMER (MUNDANE BASELINE PATH)
    // =========================================================================
    //
    // The surface activity, per MINIGAME_HANDOFF.md Section 8's two-layer
    // design: most visits are not incidents. A customer orders, is
    // served, tips something roughly in line with their archetype, and
    // leaves. Incidents (triggerIncident) are the periodic exception, not
    // the default path - call this for the ordinary case.
    //
    // =========================================================================

    AIH.MinigameService.serveCustomer = function(customerId) {

        var container;
        var customer;
        var tip;
        var index;

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        customer =
            AIH.MinigameService._findCustomer(customerId);

        if (!customer) {
            return null;
        }

        tip =
            customer.rewardRange ?
                Math.round(
                    AIH.MinigameService._randomBetween(
                        customer.rewardRange[0],
                        customer.rewardRange[1]
                    )
                ) :
                15;

        customer.served =
            true;

        customer.tip =
            tip;

        if (container.currentShift) {

            container.currentShift.customersServed += 1;
            container.currentShift.totalTips += tip;
        }

        if (customer.kind === "regular") {

            AIH.MinigameService.modifyRegularFamiliarity(
                customer,
                [{ response: "accept" }]
            );
        }

        index =
            container.activeCustomers.indexOf(customer);

        if (index >= 0) {
            container.activeCustomers.splice(index, 1);
        }

        return {

            customer: customer,
            tip: tip

        };
    };

    // =========================================================================
    // RESOLVE A SINGLE REQUEST (evaluate + report outcome)
    // =========================================================================
    //
    // A single situation, evaluated once. resolveRequestIncident (below)
    // is the public entry point that chains a primary request, its
    // follow-up, and an eventual confrontation together the way
    // AIH_Minigame_Bathhouse.js's resolveVisit does; this is the single-
    // situation building block that does not know about that chain.
    //
    // =========================================================================

    AIH.MinigameService._resolveRequest = function(
        customer,
        incidentType
    ) {

        var template;
        var situation;
        var options;
        var evaluation;

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType];

        if (
            !template ||
            template.kind !== "request"
        ) {

            return null;
        }

        situation =
            AIH.MinigameService._buildRequestSituation(
                customer,
                incidentType
            );

        options =
            AIH.MinigameService._regularPressureOptions(
                customer
            );

        evaluation =
            AIH.MinigameService._evaluate(
                situation,
                options
            );

        AIH.MinigameService._reportOutcome(
            template.trait,
            template.direction,
            evaluation,
            "waitressing: " + incidentType + " with " + customer.name
        );

        if (template.secondaryTrait) {

            /*
             * Reported at a smaller flat magnitude cut, on top of
             * whatever _reportOutcome's own score-based scaling already
             * applies - a secondary factor shouldn't drift as hard as
             * the primary one on the same event.
             */
            AIH.MinigameService._reportOutcome(
                template.secondaryTrait,
                template.secondaryDirection,
                evaluation,
                "waitressing (secondary factor): " + incidentType + " with " + customer.name,
                { magnitudeScale: 0.5 }
            );
        }

        return {

            incidentType: incidentType,
            customer: customer,
            evaluation: evaluation

        };
    };

    // =========================================================================
    // RESOLVE A REQUEST-KIND INCIDENT (public entry point)
    // =========================================================================
    //
    // Mirrors AIH_Minigame_Bathhouse.js's resolveVisit: a primary request,
    // a follow-up if it's refused, and - if the follow-up is ALSO refused -
    // an escalation into a genuine confrontation (resolveConfrontation),
    // rather than the interaction just quietly ending. This is the
    // explicit "refusal is not necessarily the end" mechanic from
    // MINIGAME_HANDOFF.md Section 8.
    //
    // =========================================================================

    AIH.MinigameService.resolveRequestIncident = function(
        customer,
        incidentType
    ) {

        var template;
        var outcomes;
        var primary;
        var followUp;
        var confrontation;
        var result;

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType];

        if (
            !template ||
            template.kind !== "request"
        ) {

            return null;
        }

        if (customer.kind === "regular") {

            AIH.MinigameService.ensureRegularRelationship(
                customer
            );
        }

        outcomes = [];

        primary =
            AIH.MinigameService._resolveRequest(
                customer,
                incidentType
            );

        if (!primary) {
            return null;
        }

        outcomes.push(primary);

        followUp = null;
        confrontation = null;

        if (
            !template.isFollowUp &&
            primary.evaluation.response === "reject"
        ) {

            followUp =
                AIH.MinigameService._resolveRequest(
                    customer,
                    "pressure_after_refusal"
                );

            if (followUp) {
                outcomes.push(followUp);
            }
        }

        /*
         * Two refusals in a row stops being "a request she declined" and
         * becomes an actual confrontation she has to handle - see the
         * CONFRONTATION SYSTEM below.
         */
        if (
            followUp &&
            followUp.evaluation.response === "reject"
        ) {

            confrontation =
                AIH.MinigameService.resolveConfrontation(
                    customer,
                    incidentType
                );
        }

        if (customer.kind === "regular") {

            var evaluationOutcomes =
                outcomes.map(function(o) { return o.evaluation; });

            AIH.MinigameService.modifyRegularFamiliarity(
                customer,
                evaluationOutcomes
            );

            AIH.MinigameService.modifyRegularFactionReputation(
                customer,
                evaluationOutcomes
            );

            AIH.MinigameService.checkHarassmentPattern(
                customer,
                incidentType,
                evaluationOutcomes
            );
        }

        result = {

            incidentType: incidentType,
            customer: customer,
            evaluation: primary.evaluation,
            followUp: followUp,
            confrontation: confrontation

        };

        AIH.MinigameService._logIncident(result);

        return result;
    };

    // =========================================================================
    // CONFRONTATION SYSTEM (chooseBest across candidate responses)
    // =========================================================================
    //
    // BOUNCER_RESPONSES's comment explains the design intent behind each
    // option. Two responses carry their own extra downside beyond their
    // base situation cost, mirroring AIH_Minigame_Bathhouse.js's proven
    // confrontation system exactly:
    //
    //     separate     can backfire - the separated patrons redirect their
    //                  attention onto her, and if she declines THAT, it
    //                  escalates into a forced, more dangerous
    //                  confrontation. Chance scales with the customer's
    //                  persistence, same as Bathhouse's deflect_calmly.
    //
    //     intervene_physically   carries its own baked-in mishap chance -
    //                  even when it is the chosen response, it can still
    //                  go wrong. This does not change the response tier;
    //                  it is recorded as an extra fact about how it went.
    //
    // =========================================================================

    AIH.MinigameService.CONFRONTATION_BACKFIRE_BASE_CHANCE = 0.30;

    AIH.MinigameService.CONFRONTATION_MISHAP_CHANCE = 0.35;

    AIH.MinigameService._findBouncerOption = function(action) {

        var i;

        for (
            i = 0;
            i < AIH.MinigameService.BOUNCER_RESPONSES.length;
            i++
        ) {

            if (AIH.MinigameService.BOUNCER_RESPONSES[i].action === action) {
                return AIH.MinigameService.BOUNCER_RESPONSES[i];
            }
        }

        return null;
    };

    AIH.MinigameService.resolveConfrontation = function(
        customer,
        contextIncidentType
    ) {

        var intensity;
        var options;
        var candidates;
        var winner;
        var backfire;
        var mishapOccurred;
        var interveneFailed;
        var ignoreConsequence;
        var wentWell;
        var result;

        if (!customer) {
            return null;
        }

        intensity =
            AIH.MinigameService._confrontationIntensity(customer);

        options =
            AIH.MinigameService._regularPressureOptions(customer);

        candidates =
            AIH.MinigameService._buildBouncerCandidates(
                contextIncidentType,
                customer,
                intensity,
                options
            );

        winner =
            AIH.MinigameService._chooseBest(candidates);

        if (!winner) {
            return null;
        }

        AIH.MinigameService._reportOutcome(
            winner.meta.trait,
            winner.meta.direction,
            winner.evaluation,
            "waitressing confrontation: " + contextIncidentType + " -> " + winner.action,
            winner.meta.unconditionalDriftReport ?
                { rewardedOverride: true } :
                undefined
        );

        backfire = null;
        mishapOccurred = false;
        ignoreConsequence = null;

        if (winner.action === "ignore") {

            ignoreConsequence =
                AIH.MinigameService._resolveIgnoreConsequence(
                    customer,
                    contextIncidentType,
                    options,
                    intensity
                );
        }

        if (winner.action === "separate") {

            backfire =
                AIH.MinigameService._resolveSeparateBackfire(
                    customer,
                    contextIncidentType,
                    options,
                    intensity
                );
        }

        interveneFailed = false;

        if (winner.action === "intervene_physically") {

            mishapOccurred =
                Math.random() <
                AIH.MinigameService.CONFRONTATION_MISHAP_CHANCE;

            /*
             * "Fails" covers both the baked-in mishap (wet stone, lost
             * footing, wardrobe trouble - the same mechanic
             * AIH_Minigame_Bathhouse.js uses for this option) and the
             * situation itself simply not going acceptably (reject tier)
             * even without a mishap. This is separate from and
             * additional to the normal pride/decrease report above - a
             * failed physical intervention is a real, unconditional blow
             * to her sense of her own competence, not something that
             * should only register if the broader reward-tier logic
             * happens to line up.
             */
            interveneFailed =
                mishapOccurred ||
                winner.evaluation.response === "reject";

            if (interveneFailed) {

                AIH.MinigameService._reportOutcome(
                    "pride",
                    "decrease",
                    winner.evaluation,
                    "waitressing confrontation: physically intervening against " +
                    contextIncidentType +
                    " went badly" +
                    (mishapOccurred ? " (a mishap occurred)" : ""),
                    {
                        rewardedOverride: true,
                        magnitudeScale: 1.6
                    }
                );
            }
        }

        wentWell =
            winner.action !== "entertain" &&
            !(backfire && !backfire.heldGround) &&
            !interveneFailed &&
            !(
                ignoreConsequence &&
                ignoreConsequence.outcome !== "disappointed" &&
                !(
                    ignoreConsequence.escalated &&
                    ignoreConsequence.escalationHeldGround
                )
            );

        result = {

            contextIncidentType: contextIncidentType,
            customer: customer,
            chosenAction: winner.action,
            evaluation: winner.evaluation,
            intensity: intensity,
            backfire: backfire,
            mishapOccurred: mishapOccurred,
            interveneFailed: interveneFailed,
            ignoreConsequence: ignoreConsequence,
            wentWell: wentWell

        };

        AIH.MinigameService.modifyPatronFactionReputationForConfrontation(
            customer,
            result
        );

        AIH.MinigameService.checkReputationAmbitionGoal(
            wentWell
        );

        AIH.MinigameService._trackCurseReleaseConditions(
            result
        );

        AIH.MinigameService._logIncident(result);

        return result;
    };

    // =========================================================================
    // IGNORE CONSEQUENCE
    // =========================================================================
    //
    // Per design decision: ignoring an incident isn't actually a safe
    // do-nothing default either - the issue with "ignore" was never
    // about which trait it targets, it was that it had no possible
    // consequence at all, unlike every other option. Three branches,
    // rolled in sequence:
    //
    //     1. Does anything happen at all? (scales with the customer's
    //        persistence, same pattern as the separate backfire - a
    //        low-persistence customer likely just lets it go)
    //     2. If something happens, does it stay verbal (the customer
    //        leaves upset, a real but non-violent cost) or genuinely
    //        escalate to physical? Scales with the underlying incident's
    //        own danger-proneness (fight_starts/someone_bothering_patron
    //        are more escalation-prone than customer_refuses_to_leave).
    //     3. A small residual chance, when nothing else triggers, of a
    //        mild "customer is just disappointed" outcome - genuinely
    //        minimal, no mechanical cost, included so "ignore" isn't
    //        ALWAYS punished, just no longer risk-free.
    //
    // The escalation choice below always routes through
    // _buildBouncerCandidates too, so bit_of_obedient_silence's filter
    // stays consistent even here - though neither escalation option
    // (intervene_physically/call_authority) requires speech, so in
    // practice this never actually removes anything from THIS
    // particular choice.
    //
    // =========================================================================

    AIH.MinigameService.IGNORE_CONSEQUENCE_BASE_CHANCE = 0.35;

    AIH.MinigameService._resolveIgnoreConsequence = function(
        customer,
        contextIncidentType,
        options,
        intensity
    ) {

        var somethingChance;
        var somethingHappens;
        var escalationShare;
        var escalates;
        var escalationCandidates;
        var escalation;

        somethingChance =
            AIH.MinigameService._clamp01(
                AIH.MinigameService.IGNORE_CONSEQUENCE_BASE_CHANCE +
                AIH.MinigameService._number(customer.persistence, 0.3) * 0.35
            );

        somethingHappens =
            Math.random() < somethingChance;

        if (!somethingHappens) {

            return {
                outcome: "disappointed",
                escalated: false
            };
        }

        /*
         * Incidents that are already about a physical/dangerous
         * situation (fight_starts, someone_bothering_patron) are more
         * likely to tip into real escalation when ignored than a purely
         * social one (customer_refuses_to_leave) is.
         */
        escalationShare =
            contextIncidentType === "fight_starts" ?
                0.55 :
                (
                    contextIncidentType === "someone_bothering_patron" ?
                        0.40 :
                        0.20
                );

        escalationShare =
            AIH.MinigameService._clamp01(
                escalationShare *
                (intensity / 1.3)
            );

        escalates =
            Math.random() < escalationShare;

        if (!escalates) {

            /*
             * Customer leaves angry - a real, non-violent cost. If she
             * has a relationship with them, it takes a real hit; if they
             * have a faction, a small reputation cost applies the same
             * way an unresolved confrontation elsewhere would.
             */
            if (
                customer.kind === "regular" &&
                typeof AIH.Relationships !== "undefined" &&
                AIH.Relationships.modifyAxis
            ) {

                AIH.Relationships.modifyAxis(
                    customer.id,
                    "familiarity",
                    -3,
                    "ignored during " + contextIncidentType + " and left upset"
                );
            }

            if (
                customer.faction &&
                typeof AIH.Reputation !== "undefined" &&
                AIH.Reputation.modifyAxes
            ) {

                AIH.Reputation.modifyAxes(
                    customer.faction,
                    { reputation: -1 },
                    customer.name +
                    " left the tavern angry after being ignored"
                );
            }

            return {
                outcome: "left_angry",
                escalated: false
            };
        }

        /*
         * Genuinely escalated - same forced-choice pattern as the
         * separate backfire's escalation (only intervene_physically/
         * call_authority make sense once it's gone physical).
         */
        escalationCandidates =
            AIH.MinigameService._buildBouncerCandidates(
                "fight_starts",
                customer,
                intensity,
                options
            ).filter(function(c) {

                return (
                    c.action === "intervene_physically" ||
                    c.action === "call_authority"
                );
            });

        escalation =
            AIH.MinigameService._chooseBest(escalationCandidates);

        if (!escalation) {

            return {
                outcome: "escalated",
                escalated: true
            };
        }

        AIH.MinigameService._reportOutcome(
            escalation.meta.trait,
            escalation.meta.direction,
            escalation.evaluation,
            "waitressing: ignoring " + contextIncidentType + " escalated into a forced confrontation",
            escalation.meta.unconditionalDriftReport ?
                { rewardedOverride: true } :
                undefined
        );

        return {

            outcome: "escalated",
            escalated: true,
            escalationAction: escalation.action,
            escalationEvaluation: escalation.evaluation,
            escalationHeldGround:
                escalation.evaluation.response === "reject" ||
                escalation.evaluation.response === "partial"

        };
    };

    // =========================================================================
    // SEPARATE BACKFIRE
    // =========================================================================
    //
    // Mirrors AIH_Minigame_Bathhouse.js's _resolveDeflectBackfire exactly.
    // The redirected patrons pushing for her attention is a single-
    // situation follow-up (not another multi-candidate chooser): she
    // either defuses it or refuses it, which forces a real, higher-danger
    // confrontation - only intervene_physically/call_authority make sense
    // once it has gone that far.
    //
    // SEMANTICS: this followUpSituation is a COMPLIANCE-style situation
    // (real modestyCost/prideCost, same shape as every other request/
    // entertain situation in this file) - NOT a passive danger threat.
    // "accept"/"reluctant_accept"/"partial" means she DEFUSES it by
    // engaging (same as "entertain" elsewhere); "reject" means she
    // REFUSES that engagement. Defusing is the SAFE path here, refusing
    // is what provokes the escalation, not the other way around.
    //
    // =========================================================================

    AIH.MinigameService._resolveSeparateBackfire = function(
        customer,
        contextIncidentType,
        options,
        intensity
    ) {

        var chance;
        var triggered;
        var followUpSituation;
        var followUpEvaluation;
        var refused;
        var escalationCandidates;
        var escalation;
        var escalationHeldGround;

        chance =
            AIH.MinigameService._clamp01(
                AIH.MinigameService.CONFRONTATION_BACKFIRE_BASE_CHANCE +
                AIH.MinigameService._number(customer.persistence, 0.3) * 0.35
            );

        triggered =
            Math.random() < chance;

        if (!triggered) {

            return {
                triggered: false,
                heldGround: true
            };
        }

        followUpSituation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "bouncer_followup_" + contextIncidentType + "_" + Date.now(),
                type: "bouncer_followup",
                category: contextIncidentType,
                description:
                    "separated patrons redirect their attention onto her",

                severity: "medium",

                reward: 0,

                danger:
                    AIH.MinigameService._clamp01(0.15 * intensity),

                embarrassment:
                    AIH.MinigameService._clamp01(0.40 * intensity),

                dignityCost: 0.15,
                modestyCost: 0.30,
                prideCost: 0.20,
                freedomCost: 0.15

            });

        followUpEvaluation =
            AIH.MinigameService._evaluate(
                followUpSituation,
                options
            );

        AIH.MinigameService._reportOutcome(
            "inhibition",
            "decrease",
            followUpEvaluation,
            "waitressing confrontation backfire: defusing redirected attention after separating " +
            contextIncidentType,
            { rewardedOverride: true }
        );

        /*
         * "refused" only decides whether this escalates further - it is
         * NOT the same question as "did this overall go okay", which is
         * what the returned heldGround needs to answer (that field is
         * what resolveConfrontation's wentWell reads). Complying with the
         * redirected attention defuses things without violence, so it
         * counts as heldGround:true for wentWell purposes even though she
         * did not literally refuse - refusing is what risks it going
         * badly here, not the other way around.
         */
        refused =
            followUpEvaluation.response === "reject";

        if (!refused) {

            return {
                triggered: true,
                heldGround: true,
                refused: false,
                evaluation: followUpEvaluation,
                escalated: false
            };
        }

        /*
         * She refused the redirected attention. This is no longer a
         * social situation - only the two options that make sense once
         * things have gone physical are on the table. Whether this
         * "went well" now depends entirely on how THAT forced
         * confrontation resolves, not on the fact that she refused in
         * the first place. This is a _chooseBest across ACTIONS
         * (intervene_physically / call_authority), so "accept"/
         * "reluctant_accept" here means she successfully commits to and
         * executes the winning action, matching how those two options
         * are read everywhere else in this file.
         */
        escalationCandidates =
            AIH.MinigameService._buildBouncerCandidates(
                "fight_starts",
                customer,
                intensity,
                options
            ).filter(function(c) {

                return (
                    c.action === "intervene_physically" ||
                    c.action === "call_authority"
                );
            });

        escalation =
            AIH.MinigameService._chooseBest(escalationCandidates);

        if (!escalation) {

            return {
                triggered: true,
                heldGround: false,
                refused: true,
                evaluation: followUpEvaluation,
                escalated: true
            };
        }

        AIH.MinigameService._reportOutcome(
            escalation.meta.trait,
            escalation.meta.direction,
            escalation.evaluation,
            "waitressing confrontation backfire escalated to a forced confrontation after " +
            contextIncidentType,
            escalation.meta.unconditionalDriftReport ?
                { rewardedOverride: true } :
                undefined
        );

        escalationHeldGround =
            escalation.evaluation.response === "accept" ||
            escalation.evaluation.response === "reluctant_accept";

        return {

            triggered: true,
            heldGround: escalationHeldGround,
            refused: true,
            evaluation: followUpEvaluation,
            escalated: true,
            escalationAction: escalation.action,
            escalationEvaluation: escalation.evaluation

        };
    };

    // =========================================================================
    // REPORT AN OUTCOME TO THE DRIFT ENGINE
    // =========================================================================
    //
    // rewardedOverride (optional 5th arg, boolean): bypasses the response-
    // based rewarded computation entirely. Used by the separate-backfire
    // follow-up, where "did she defuse it" is a different judgment than
    // the request accept/reject vocabulary quite fits.
    //
    // Reward-tier magnitude scaling:
    //     accept                                        full magnitude
    //     reluctant_accept, score > 0.20 (a real margin)  full magnitude
    //     reluctant_accept, score <= 0.20 (barely cleared) 0.25x magnitude -
    //         still counts, per design decision: a bare-margin grudging
    //         accept shouldn't be written off entirely, just weighted
    //         much lighter than a clean one.
    //     partial                                        0.5x magnitude
    //     reject                                          not rewarded
    //
    // =========================================================================

    AIH.MinigameService._reportOutcome = function(
        trait,
        direction,
        evaluation,
        reason,
        options
    ) {

        var rewarded;
        var magnitude;

        if (
            !trait ||
            !direction ||
            typeof AIH.PersonalityDrift === "undefined" ||
            !AIH.PersonalityDrift.reinforce
        ) {

            return null;
        }

        options =
            options || {};

        if (typeof options.rewardedOverride === "boolean") {

            rewarded =
                options.rewardedOverride;

        } else {

            rewarded =
                evaluation.response === "accept" ||
                evaluation.response === "reluctant_accept" ||
                evaluation.response === "partial";
        }

        magnitude =
            AIH.MinigameService._clamp01(
                0.35 +
                Math.abs(evaluation.score) * 0.5
            );

        if (
            evaluation.response === "reluctant_accept" &&
            evaluation.score <= 0.20
        ) {

            magnitude =
                magnitude * 0.25;

        } else if (evaluation.response === "partial") {

            magnitude =
                magnitude * 0.5;
        }

        if (typeof options.magnitudeScale === "number") {

            magnitude =
                magnitude * options.magnitudeScale;
        }

        return AIH.MinigameService._reportOutcomeReinforce(
            trait,
            direction,
            rewarded,
            AIH.MinigameService._clamp01(magnitude),
            reason
        );
    };

    /*
     * Split out so the reinforce() call and its ValueDrift follow-up sit
     * together - AIH.ValueDrift.checkForShift() is a safe, cheap no-op
     * for any trait it doesn't map or that hasn't internalized yet, so
     * calling it unconditionally after every reinforce() here is
     * correct, not wasteful. Mirrors AIH_Minigame_IntimateService.js's
     * own split for the same reason.
     */
    AIH.MinigameService._reportOutcomeReinforce = function(
        trait,
        direction,
        rewarded,
        magnitude,
        reason
    ) {

        var result;

        result =
            AIH.PersonalityDrift.reinforce(
                trait,
                direction,
                {
                    rewarded: rewarded,
                    magnitude: magnitude,
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

    // =========================================================================
    // CURSED ITEM RELEASE CONDITION TRACKING
    // =========================================================================
    //
    // Per design direction: bit_of_obedient_silence's own removal
    // condition (see AIH_CursedItems.js) - three confrontations resolved
    // wentWell despite being unable to speak clearly - is tracked by this
    // module directly, the same way AIH_Minigame_TasteTest.js tracks its
    // own set of items. This module still never decides whether the item
    // comes off - AIH.CursedItems.isConditionMet()/removeCursedItem()
    // remain the sole authority on that - it only calls
    // markConditionMet() once its own tracked count crosses the
    // threshold.
    //
    // =========================================================================

    AIH.MinigameService.OBEDIENT_SILENCE_CONFRONTATIONS_NEEDED = 3;

    AIH.MinigameService._trackCurseReleaseConditions = function(confrontationResult) {

        var state;

        if (
            !confrontationResult ||
            !confrontationResult.wentWell ||
            typeof AIH.CursedItems === "undefined" ||
            !AIH.CursedItems.isEquipped ||
            !AIH.CursedItems.isEquipped("bit_of_obedient_silence")
        ) {

            return;
        }

        state =
            AIH.MinigameService._ensure();

        if (!state) {
            return;
        }

        state.curseTracking.obedientSilenceConfrontationsWentWell += 1;

        if (
            state.curseTracking.obedientSilenceConfrontationsWentWell <
            AIH.MinigameService.OBEDIENT_SILENCE_CONFRONTATIONS_NEEDED
        ) {

            return;
        }

        if (AIH.CursedItems.markConditionMet) {

            AIH.CursedItems.markConditionMet("bit_of_obedient_silence");
        }
    };

    // =========================================================================
    // REGULAR FAMILIARITY FEEDBACK
    // =========================================================================

    AIH.MinigameService.modifyRegularFamiliarity = function(customer, outcomes) {

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
            customer.id,
            "familiarity",
            wentWell ? 4 : 1,
            "tavern visit"
        );

        if (wentWell) {

            AIH.Relationships.modifyAxis(
                customer.id,
                "trust",
                2,
                "tavern visit went well"
            );
        }
    };

    // =========================================================================
    // FACTION REPUTATION FEEDBACK
    // =========================================================================
    //
    // Per MINIGAME_HANDOFF.md Quick-Start step 7. Only regulars carry a
    // stable enough identity for this in the plain-visit case; generated
    // customers only affect faction reputation through a confrontation
    // (see modifyPatronFactionReputationForConfrontation below), which is
    // dramatic enough to be faction-worthy even for a one-off visitor.
    // A double-refusal escalates into resolveConfrontation instead of
    // being penalized here directly, to avoid double-counting the same
    // event through two different reputation paths.
    //
    // =========================================================================

    AIH.MinigameService.modifyRegularFactionReputation = function(customer, outcomes) {

        var lastOutcome;
        var wentWell;

        if (
            !customer.faction ||
            typeof AIH.Reputation === "undefined" ||
            !AIH.Reputation.modifyAxes
        ) {

            return;
        }

        if (
            AIH.Reputation.hasFaction &&
            !AIH.Reputation.hasFaction(customer.faction) &&
            AIH.Reputation.addFaction
        ) {

            AIH.Reputation.addFaction(
                customer.faction
            );
        }

        lastOutcome =
            outcomes[outcomes.length - 1];

        wentWell =
            lastOutcome.response === "accept" ||
            lastOutcome.response === "reluctant_accept";

        if (wentWell) {

            AIH.Reputation.modifyAxes(
                customer.faction,
                { reputation: 1 },
                "regular customer " +
                    customer.name +
                    " left the tavern pleased"
            );
        }
    };

    // =========================================================================
    // FACTION REPUTATION FEEDBACK - CONFRONTATIONS
    // =========================================================================
    //
    // Unlike modifyRegularFactionReputation above, this applies to ANY
    // customer with a faction - including generated archetypes, since
    // every archetype now carries one (see CUSTOMER_TYPES).
    //
    // =========================================================================

    AIH.MinigameService.modifyPatronFactionReputationForConfrontation = function(
        customer,
        confrontationResult
    ) {

        var badOutcome;

        if (
            !customer.faction ||
            typeof AIH.Reputation === "undefined" ||
            !AIH.Reputation.modifyAxes
        ) {

            return;
        }

        if (
            AIH.Reputation.hasFaction &&
            !AIH.Reputation.hasFaction(customer.faction) &&
            AIH.Reputation.addFaction
        ) {

            AIH.Reputation.addFaction(
                customer.faction
            );
        }

        badOutcome =
            !!(
                confrontationResult.backfire &&
                !confrontationResult.backfire.heldGround
            );

        if (confrontationResult.wentWell) {

            AIH.Reputation.modifyAxes(
                customer.faction,
                { reputation: 1, dominance: 1 },
                "she handled a confrontation with " +
                    customer.name +
                    " (" +
                    confrontationResult.chosenAction +
                    ") without it getting away from her"
            );

        } else if (badOutcome) {

            AIH.Reputation.modifyAxes(
                customer.faction,
                { reputation: -2 },
                "a confrontation with " +
                    customer.name +
                    " got away from her at the tavern"
            );
        }
    };

    // =========================================================================
    // EMERGENT "REPUTATION AMBITION" GOAL
    // =========================================================================

    AIH.MinigameService.REPUTATION_GOAL_THRESHOLD = 3;

    AIH.MinigameService.REPUTATION_GOAL_DESCRIPTIONS = [
        "Become known as the most composed hand the tavern has ever had.",
        "Build a reputation none of the rowdier patrons dare test twice.",
        "Prove, incident by incident, that she can handle anything the tavern throws at her."
    ];

    AIH.MinigameService._hasActiveReputationGoal = function() {

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

    AIH.MinigameService.checkReputationAmbitionGoal = function(wentWell) {

        var state;

        if (
            !wentWell ||
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.create
        ) {

            return;
        }

        state =
            AIH.MinigameService._ensure();

        if (!state) {
            return;
        }

        if (state.confrontationsHandledWell === undefined) {
            state.confrontationsHandledWell = 0;
        }

        state.confrontationsHandledWell += 1;

        if (
            state.confrontationsHandledWell <
            AIH.MinigameService.REPUTATION_GOAL_THRESHOLD
        ) {

            return;
        }

        if (AIH.MinigameService._hasActiveReputationGoal()) {
            return;
        }

        AIH.Goals.create({

            description:
                AIH.MinigameService.REPUTATION_GOAL_DESCRIPTIONS[
                    Math.floor(
                        Math.random() *
                        AIH.MinigameService.REPUTATION_GOAL_DESCRIPTIONS.length
                    )
                ],

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
                " tavern confrontations herself without losing control of them"
        });
    };

    // =========================================================================
    // HARASSMENT PATTERN -> EMERGENT "AVOID PATRON" GOAL
    // =========================================================================
    //
    // Per MINIGAME_HANDOFF.md Section 5's own worked example. Tracks, per
    // regular, how many visits ended in a hostile escalation (she
    // refused, the customer pushed a follow-up anyway, and she refused
    // that too). Only fires for regulars - a stable identity to attach
    // "avoid this patron" to does not exist for a one-off generated
    // customer. Deduplicates against an existing active/proposed goal for
    // the same customer.
    //
    // =========================================================================

    AIH.MinigameService.HARASSMENT_GOAL_THRESHOLD = 3;

    AIH.MinigameService._incidentCounters = function() {

        var state;

        state =
            AIH.MinigameService._ensure();

        if (!state) {
            return null;
        }

        if (!state.harassmentIncidents) {
            state.harassmentIncidents = {};
        }

        return state.harassmentIncidents;
    };

    AIH.MinigameService._hasActiveAvoidGoal = function(npcId) {

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

    AIH.MinigameService.checkHarassmentPattern = function(customer, incidentType, outcomes) {

        var counters;
        var wasHostileEscalation;

        if (
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.create
        ) {

            return;
        }

        counters =
            AIH.MinigameService._incidentCounters();

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

        counters[customer.id] =
            (counters[customer.id] || 0) + 1;

        if (
            counters[customer.id] <
            AIH.MinigameService.HARASSMENT_GOAL_THRESHOLD
        ) {

            return;
        }

        if (AIH.MinigameService._hasActiveAvoidGoal(customer.id)) {
            return;
        }

        AIH.Goals.create({

            description:
                "Avoid working when " +
                customer.name +
                " is in.",

            category: "avoid_patron",
            origin: "emergent",
            baseWeight: 0.55,

            linkedValues: [
                "freedom",
                "dignity"
            ],

            relatedNpcId:
                customer.id,

            relatedFaction:
                customer.faction || null,

            reason:
                customer.name +
                " has repeatedly pushed past a refusal (" +
                incidentType +
                ") without taking no for an answer."
        });
    };

    // =========================================================================
    // LOG AN INCIDENT
    // =========================================================================

    AIH.MinigameService._logIncident = function(result) {

        var container;

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return;
        }

        result.id =
            AIH.MinigameService._nextIncidentId();

        result.timestamp =
            Date.now();

        container.recentIncidents.push(result);

        if (container.recentIncidents.length > 100) {

            container.recentIncidents =
                container.recentIncidents.slice(-100);
        }

        if (
            container.currentShift &&
            result.evaluation
        ) {

            container.currentShift.incidentsResolved += 1;
        }
    };

    // =========================================================================
    // TRIGGER INCIDENT (MAIN ENTRY POINT)
    // =========================================================================

    AIH.MinigameService.triggerIncident = function(
        incidentType,
        customerId
    ) {

        var template;
        var customer;
        var container;

        if (
            typeof AIH.PressureEvaluator === "undefined" ||
            !AIH.PressureEvaluator.evaluate
        ) {

            return null;
        }

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType];

        if (!template) {
            return null;
        }

        container =
            AIH.MinigameService._ensure();

        customer =
            customerId && container ?
                AIH.MinigameService._findCustomer(customerId) :
                null;

        if (
            !customer &&
            container &&
            container.activeCustomers.length > 0
        ) {

            customer =
                container.activeCustomers[
                    Math.floor(
                        Math.random() *
                        container.activeCustomers.length
                    )
                ];
        }

        if (!customer) {
            return null;
        }

        if (template.kind === "bouncer") {

            return AIH.MinigameService.resolveConfrontation(
                customer,
                incidentType
            );
        }

        return AIH.MinigameService.resolveRequestIncident(
            customer,
            incidentType
        );
    };

    AIH.MinigameService._findCustomer = function(customerId) {

        var container;
        var i;

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        for (
            i = 0;
            i < container.activeCustomers.length;
            i++
        ) {

            if (container.activeCustomers[i].id === customerId) {
                return container.activeCustomers[i];
            }
        }

        return null;
    };

    // =========================================================================
    // QUERY
    // =========================================================================

    AIH.MinigameService.getStatus = function() {

        var container;

        container =
            AIH.MinigameService._ensure();

        if (!container) {
            return null;
        }

        return {

            currentShift:
                AIH.MinigameService._copy(container.currentShift),

            activeCustomers:
                AIH.MinigameService._copy(container.activeCustomers),

            recentIncidents:
                AIH.MinigameService._copy(
                    container.recentIncidents.slice(-10)
                )
        };
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.MinigameService.initialize = function() {

        AIH.MinigameService._ensure();

        AIH.MinigameService._initialized = true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Service minigame (waitressing) initialized."
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
            "MinigameService",
            {
                version:
                    AIH.MinigameService.VERSION,

                initialize: function() {
                    AIH.MinigameService.initialize();
                },

                startShift: function() {
                    return AIH.MinigameService.startShift();
                },

                endShift: function() {
                    return AIH.MinigameService.endShift();
                },

                spawnCustomer: function(archetype) {
                    return AIH.MinigameService.spawnCustomer(archetype);
                },

                spawnRegular: function(regularId) {
                    return AIH.MinigameService.spawnRegular(regularId);
                },

                serveCustomer: function(customerId) {
                    return AIH.MinigameService.serveCustomer(customerId);
                },

                triggerIncident: function(incidentType, customerId) {
                    return AIH.MinigameService.triggerIncident(incidentType, customerId);
                },

                resolveComplaint: function(customerId, investigation) {
                    return AIH.MinigameService.resolveComplaint(customerId, investigation);
                },

                getStatus: function() {
                    return AIH.MinigameService.getStatus();
                }
            }
        );
    }

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_Minigame_Service",
            "StartShift",
            function() {
                AIH.MinigameService.startShift();
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Service",
            "EndShift",
            function() {

                var shift;

                shift =
                    AIH.MinigameService.endShift();

                AIH.Debug.inspect(
                    "Shift ended:",
                    shift
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Service",
            "SpawnCustomer",
            function(args) {

                AIH.MinigameService.spawnCustomer(
                    (args && args.archetype) || "friendly"
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Service",
            "SpawnRegular",
            function(args) {

                AIH.MinigameService.spawnRegular(
                    (args && args.regularId) || "old_grum"
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Service",
            "TriggerIncident",
            function(args) {

                var result;

                result =
                    AIH.MinigameService.triggerIncident(
                        (args && args.incidentType) ||
                        "customer_refuses_to_leave"
                    );

                AIH.Debug.inspect(
                    "Incident result:",
                    result
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_Service",
            "Show",
            function() {

                AIH.Debug.inspect(
                    "Service minigame status:",
                    AIH.MinigameService.getStatus()
                );
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_MinigameService_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_MinigameService_createGameObjects.call(
                this
            );

            AIH.MinigameService.initialize();
        };

        var _AIH_MinigameService_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_MinigameService_setupNewGame.call(
                this
            );

            AIH.MinigameService._initialized =
                false;

            AIH.MinigameService.initialize();
        };

        var _AIH_MinigameService_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_MinigameService_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.MinigameService._initialized =
                    false;

                AIH.MinigameService.initialize();
            };
    }

})();