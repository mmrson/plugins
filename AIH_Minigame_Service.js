/*:
 * @plugindesc AI Hero Framework - Service Minigame (Waitressing) v0.1.0
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
 *   boundary-relevant moment goes through AIH.PressureEvaluator.evaluate();
 *   this module supplies the situation, not the verdict.
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
 * response tier and score. This reuses the shared evaluator N times
 * instead of inventing new machinery, and is the recommended pattern for
 * any other minigame framework that needs multi-option decisions - see
 * MINIGAME_HANDOFF.md.
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

    AIH.MinigameService.VERSION = "0.1.0";

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

                nextIncidentId: 1
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

        return state.minigameService;
    };

    // =========================================================================
    // CUSTOMER ARCHETYPES
    // =========================================================================
    //
    // A small, representative set rather than one entry per adjective in
    // the original brainstorm - "impatient" and "difficult" behave
    // similarly enough mechanically to share an archetype with different
    // flavor text, for example. Add more here as data; do not add new code
    // paths per archetype.
    //
    // pressureProfile values are BASE pressure contributions this
    // archetype's requests tend to carry. Actual situations built from
    // these are further adjusted per-incident (see _buildRequestSituation
    // below).
    //
    // =========================================================================

    AIH.MinigameService.CUSTOMER_TYPES = {

        friendly: {
            names: ["Rowan", "Della", "Tomas"],
            rewardRange: [20, 60],
            pressureProfile: { embarrassment: 0.05, prideCost: 0.0, freedomCost: 0.05 },
            incidentWeights: { request_outside_normal_service: 0.5, large_tip: 0.3 }
        },

        impatient: {
            names: ["Garrick", "Ossa", "Fenn"],
            rewardRange: [10, 30],
            pressureProfile: { embarrassment: 0.10, prideCost: 0.15, freedomCost: 0.10 },
            incidentWeights: { customer_demands_priority: 1.0 }
        },

        rude: {
            names: ["Brack", "Ilva"],
            rewardRange: [5, 20],
            pressureProfile: { embarrassment: 0.25, prideCost: 0.40, dignityCost: 0.30 },
            incidentWeights: { customer_demands_priority: 0.6, someone_bothering_patron: 0.4 }
        },

        drunk: {
            names: ["Old Merrin", "Cask", "Wobbles"],
            rewardRange: [0, 15],
            pressureProfile: { embarrassment: 0.30, danger: 0.10, freedomCost: 0.15 },
            incidentWeights: { customer_refuses_to_leave: 0.5, fight_starts: 0.25, someone_bothering_patron: 0.25 }
        },

        flirtatious: {
            names: ["Sable", "Corin", "Vesh"],
            rewardRange: [15, 50],
            pressureProfile: { embarrassment: 0.45, modestyCost: 0.35, freedomCost: 0.10 },
            incidentWeights: { request_outside_normal_service: 0.7, pressure_after_refusal: 0.3 }
        },

        wealthy: {
            names: ["Lady Ashworth", "Count Vellan", "Dame Ori"],
            rewardRange: [80, 300],
            pressureProfile: { embarrassment: 0.15, prideCost: 0.20, dignityCost: 0.15 },
            incidentWeights: { customer_demands_priority: 0.4, large_tip: 0.4, request_outside_normal_service: 0.2 }
        },

        suspicious: {
            names: ["The Hooded One", "Quell", "Mira the Quiet"],
            rewardRange: [10, 40],
            pressureProfile: { danger: 0.15, embarrassment: 0.05 },
            incidentWeights: { suspected_theft: 0.6, customer_refuses_to_leave: 0.4 }
        },

        lonely: {
            names: ["Widow Talle", "Barnabus", "Young Perrin"],
            rewardRange: [10, 35],
            pressureProfile: { embarrassment: 0.15, freedomCost: 0.05 },
            incidentWeights: { request_outside_normal_service: 0.4, someone_bothering_patron: 0.2 }
        }

    };

    // =========================================================================
    // INCIDENT TEMPLATES
    // =========================================================================
    //
    // "kind" determines which resolution path handles the incident:
    //
    //     request        a single accept/reject/negotiate situation, built
    //                    from the triggering customer's pressure profile
    //                    plus this template's own overrides
    //
    //     bouncer         a multi-candidate situation resolved through
    //                    _chooseBest() across BOUNCER_RESPONSES
    //
    //     complaint       routed to the dish-alteration system
    //
    // =========================================================================

    AIH.MinigameService.INCIDENT_TYPES = {

        customer_demands_priority: {
            kind: "request",
            severity: "normal",
            baseDanger: 0,
            trait: "assertiveness",
            direction: "increase"
        },

        request_outside_normal_service: {
            kind: "request",
            severity: "medium",
            baseDanger: 0,
            trait: "inhibition",
            direction: "decrease"
        },

        pressure_after_refusal: {
            kind: "request",
            severity: "rare",
            baseDanger: 0,
            trait: "approvalSeeking",
            direction: "increase",
            /*
             * This is the explicit "refusal is not necessarily the end"
             * mechanic - see resolveOrder/resolveRequest below. It is
             * generated as a FOLLOW-UP after a "reject" or "partial"
             * response, not spawned independently.
             */
            isFollowUp: true
        },

        large_tip: {
            kind: "request",
            severity: "medium",
            baseDanger: 0,
            trait: "approvalSeeking",
            direction: "increase"
        },

        suspected_theft: {
            kind: "request",
            severity: "normal",
            baseDanger: 0.1,
            trait: "trust",
            direction: "decrease"
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
    // =========================================================================

    AIH.MinigameService.BOUNCER_RESPONSES = [

        {
            action: "ignore",
            danger: 0.0, prideCost: 0.05, dignityCost: 0.0,
            embarrassment: 0.10, reward: 0,
            trait: "mercy", direction: "decrease"
        },

        {
            action: "warn",
            danger: 0.05, prideCost: 0.0, dignityCost: 0.0,
            embarrassment: 0.05, reward: 0,
            trait: "assertiveness", direction: "increase",
            fitFor: ["customer_refuses_to_leave"]
        },

        {
            action: "separate",
            danger: 0.15, prideCost: 0.0, dignityCost: 0.0,
            embarrassment: 0.10, reward: 0,
            trait: "assertiveness", direction: "increase",
            fitFor: ["someone_bothering_patron"]
        },

        {
            action: "ask_to_leave",
            danger: 0.10, prideCost: 0.05, dignityCost: 0.0,
            embarrassment: 0.15, reward: 0,
            trait: "defiance", direction: "increase",
            fitFor: ["customer_refuses_to_leave"]
        },

        {
            action: "call_authority",
            danger: 0.05, prideCost: 0.10, dignityCost: 0.05,
            embarrassment: 0.05, reward: 0,
            trait: "defiance", direction: "decrease",
            fitFor: ["fight_starts"]
        },

        {
            action: "intervene_physically",
            danger: 0.55, prideCost: 0.0, dignityCost: 0.0,
            embarrassment: 0.20, reward: 0,
            trait: "mercy", direction: "decrease",
            fitFor: ["fight_starts"]
        },

        {
            action: "take_bribe",
            danger: 0.05, prideCost: 0.25, dignityCost: 0.30,
            embarrassment: 0.10, reward: 60,
            trait: "trust", direction: "decrease"
        },

        {
            action: "protect_someone",
            danger: 0.30, prideCost: 0.0, dignityCost: 0.0,
            embarrassment: 0.10, reward: 0,
            trait: "mercy", direction: "increase",
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

            id:
                AIH.MinigameService._nextCustomerId(),

            archetype:
                archetypeKey,

            name:
                names[
                    Math.floor(Math.random() * names.length)
                ],

            arrivedAt:
                Date.now(),

            served:
                false
        };

        container.activeCustomers.push(customer);

        AIH.MinigameService._trackRegular(customer);

        return AIH.MinigameService._copy(customer);
    };

    /*
     * Recurring customers should be able to build genuine familiarity over
     * time. This uses AIH.Relationships exactly as already built - no new
     * relationship-tracking system needed.
     */
    AIH.MinigameService._trackRegular = function(customer) {

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.add
        ) {

            return;
        }

        AIH.Relationships.add(
            "customer_" + customer.name.replace(/\s+/g, "_").toLowerCase(),
            customer.name,
            "Tavern"
        );

        AIH.Relationships.modifyAxis(
            "customer_" + customer.name.replace(/\s+/g, "_").toLowerCase(),
            "familiarity",
            2,
            "visited during a shift"
        );
    };

    // =========================================================================
    // BUILD A REQUEST SITUATION FROM A CUSTOMER + INCIDENT
    // =========================================================================

    AIH.MinigameService._buildRequestSituation = function(
        customer,
        incidentType
    ) {

        var archetype;
        var template;
        var profile;
        var reward;

        archetype =
            AIH.MinigameService.CUSTOMER_TYPES[customer.archetype] ||
            {};

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType] ||
            {};

        profile =
            archetype.pressureProfile ||
            {};

        reward =
            archetype.rewardRange ?
                archetype.rewardRange[0] +
                Math.random() *
                (archetype.rewardRange[1] - archetype.rewardRange[0]) :
                20;

        return AIH.PressureEvaluator.normalizeSituation({

            id: "svc_" + customer.id + "_" + incidentType + "_" + Date.now(),
            type: "waitressing_request",
            category: incidentType,
            description:
                customer.name + " (" + customer.archetype + "): " +
                incidentType,

            severity:
                template.severity ||
                "normal",

            reward: Math.round(reward),

            danger:
                AIH.MinigameService._number(profile.danger, template.baseDanger || 0),

            embarrassment:
                AIH.MinigameService._number(profile.embarrassment, 0.1),

            dignityCost:
                AIH.MinigameService._number(profile.dignityCost, 0),

            freedomCost:
                AIH.MinigameService._number(profile.freedomCost, 0.05),

            modestyCost:
                AIH.MinigameService._number(profile.modestyCost, 0),

            prideCost:
                AIH.MinigameService._number(profile.prideCost, 0),

            source: customer

        });
    };

    // =========================================================================
    // GENERIC "CHOOSE BEST OF SEVERAL CANDIDATES" HELPER
    // =========================================================================
    //
    // See the file header for why this exists. Any minigame framework
    // needing a multi-option decision can reuse this exact pattern.
    //
    // candidates: array of { action, situation, meta }
    //
    // Returns { action, evaluation, meta } for the winner, ranked first by
    // response tier (accept > reluctant_accept > partial > reject), then
    // by score within a tier.
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
        var bestRank;
        var i;
        var candidate;
        var evaluation;
        var rank;

        best = null;
        bestRank = -1;

        for (
            i = 0;
            i < candidates.length;
            i++
        ) {

            candidate = candidates[i];

            evaluation =
                AIH.PressureEvaluator.evaluate(
                    candidate.situation
                );

            rank =
                (AIH.MinigameService.RESPONSE_RANK[evaluation.response] || 0) *
                10 +
                evaluation.score;

            if (rank > bestRank) {

                bestRank = rank;

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
    // BUILD A BOUNCER SITUATION FOR ONE CANDIDATE RESPONSE
    // =========================================================================

    AIH.MinigameService._buildBouncerSituation = function(
        incidentType,
        responseOption
    ) {

        var template;
        var severityScale;
        var fits;
        var isTargeted;
        var mismatchPenalty;
        var fitBonus;

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType] ||
            {};

        severityScale =
            template.severity === "rare" ?
                1.3 :
                1.0;

        /*
         * fitFor makes different bouncer responses actually differentiate
         * per incident type, rather than the same 8 profiles always
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
                    severityScale *
                    fitBonus *
                    mismatchPenalty
                ),

            embarrassment:
                AIH.MinigameService._clamp01(
                    (responseOption.embarrassment || 0) *
                    fitBonus *
                    mismatchPenalty
                ),

            dignityCost:
                AIH.MinigameService._clamp01(
                    (responseOption.dignityCost || 0) *
                    fitBonus *
                    mismatchPenalty
                ),

            freedomCost: 0,

            modestyCost: 0,

            prideCost:
                AIH.MinigameService._clamp01(
                    (responseOption.prideCost || 0) *
                    fitBonus *
                    mismatchPenalty
                )

        });
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
        var archetype;
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

        archetype =
            AIH.MinigameService.CUSTOMER_TYPES[customer.archetype] ||
            {};

        tip =
            archetype.rewardRange ?
                Math.round(
                    archetype.rewardRange[0] +
                    Math.random() *
                    (archetype.rewardRange[1] - archetype.rewardRange[0])
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
    // RESOLVE A REQUEST-KIND INCIDENT
    // =========================================================================
    //
    // Handles the "refusal is not necessarily the end" mechanic: a reject
    // or partial response on a non-follow-up incident has a chance of
    // generating a pressure_after_refusal follow-up situation instead of
    // simply ending the interaction, exactly as MINIGAME_HANDOFF.md
    // Section 8 requires.
    //
    // =========================================================================

    AIH.MinigameService.resolveRequestIncident = function(
        customer,
        incidentType
    ) {

        var template;
        var situation;
        var evaluation;
        var result;
        var followUp;

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

        evaluation =
            AIH.PressureEvaluator.evaluate(situation);

        result = {

            incidentType: incidentType,
            customer: customer,
            evaluation: evaluation,
            followUp: null

        };

        AIH.MinigameService._reportOutcome(
            template.trait,
            template.direction,
            evaluation,
            "waitressing: " + incidentType + " with " + customer.name
        );

        if (
            !template.isFollowUp &&
            (
                evaluation.response === "reject" ||
                evaluation.response === "partial"
            ) &&
            Math.random() < 0.4
        ) {

            followUp =
                AIH.MinigameService.resolveRequestIncident(
                    customer,
                    "pressure_after_refusal"
                );

            result.followUp =
                followUp;
        }

        AIH.MinigameService._logIncident(result);

        return result;
    };

    // =========================================================================
    // RESOLVE A BOUNCER-KIND INCIDENT
    // =========================================================================

    AIH.MinigameService.resolveBouncerIncident = function(incidentType) {

        var template;
        var candidates;
        var i;
        var option;
        var winner;
        var result;

        template =
            AIH.MinigameService.INCIDENT_TYPES[incidentType];

        if (
            !template ||
            template.kind !== "bouncer"
        ) {

            return null;
        }

        candidates = [];

        for (
            i = 0;
            i < AIH.MinigameService.BOUNCER_RESPONSES.length;
            i++
        ) {

            option =
                AIH.MinigameService.BOUNCER_RESPONSES[i];

            candidates.push({

                action: option.action,

                situation:
                    AIH.MinigameService._buildBouncerSituation(
                        incidentType,
                        option
                    ),

                meta: option

            });
        }

        winner =
            AIH.MinigameService._chooseBest(candidates);

        if (!winner) {
            return null;
        }

        result = {

            incidentType: incidentType,
            chosenAction: winner.action,
            evaluation: winner.evaluation

        };

        AIH.MinigameService._reportOutcome(
            winner.meta.trait,
            winner.meta.direction,
            winner.evaluation,
            "waitressing bouncer incident: " + incidentType + " -> " + winner.action
        );

        AIH.MinigameService._logIncident(result);

        return result;
    };

    // =========================================================================
    // REPORT AN OUTCOME TO THE DRIFT ENGINE
    // =========================================================================

    AIH.MinigameService._reportOutcome = function(
        trait,
        direction,
        evaluation,
        reason
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

        /*
         * "partial" is still some degree of yielding to pressure - it
         * should not count as a full zero the way an outright reject
         * does. It counts as rewarded but at reduced magnitude, rather
         * than being excluded from reinforcement entirely.
         */
        rewarded =
            evaluation.response === "accept" ||
            evaluation.response === "reluctant_accept" ||
            evaluation.response === "partial";

        magnitude =
            AIH.MinigameService._clamp01(
                0.35 +
                Math.abs(evaluation.score) * 0.5
            );

        if (evaluation.response === "partial") {

            magnitude =
                magnitude * 0.5;
        }

        return AIH.PersonalityDrift.reinforce(
            trait,
            direction,
            {
                rewarded: rewarded,
                magnitude: magnitude,
                reason: reason
            }
        );
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

        if (template.kind === "bouncer") {

            return AIH.MinigameService.resolveBouncerIncident(
                incidentType
            );
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