/*:
 * @plugindesc AI Hero Framework - Minigame: Intimate Service (Bathhouse) v0.1.0
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
 * from AIH.PressureEvaluator.evaluate() reading her real, current
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
 *                       outcome is boundary-relevant (mercy is intentionally
 *                       exempt - see bouncer-style incident handling below)
 * followUpId            optional, id of a request template to try if this
 *                       one is rejected or partial
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide her response (PressureEvaluator does)
 * - adjust personality directly (PersonalityDrift.reinforce() does, always)
 * - hardcode "if wealthy then always compliant" or similar dev conclusions
 * - implement Gentlemen's Club Entertainment (separate future activity)
 * - build a second pressure evaluator
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

    AIH.MinigameIntimateService.VERSION = "0.1.0";

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
                    0
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

            driftTrait: "approvalSeeking",
            driftDirection: "increase",

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
             * familiarity is stored -100..100 on AIH.Relationships (see
             * _clampFamiliarity) - scaled down here into a raw pressure
             * term comparable to the livestream integration's own
             * domainPressure usage. Deliberately gentle: a regular's
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
    // RESOLVE A SINGLE REQUEST (evaluate + report outcome)
    // =========================================================================
    //
    // Returns an outcome record. Does NOT decide whether a follow-up
    // happens - that's resolveVisit()'s job, since only a visit (not a
    // single request) knows about the one-followup-per-visit cap.
    //
    // =========================================================================

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

        finalMagnitude =
            magnitude;

        if (evaluation.response === "partial") {

            finalMagnitude =
                finalMagnitude * 0.5;
        }

        return AIH.PersonalityDrift.reinforce(
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
            AIH.PressureEvaluator.evaluate(
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
    // best (response tier, score). No second scoring engine.
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
    //                          would have.
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
    //                          Safe, but costs a little pride/dignity
    //                          (an admission she couldn't handle it
    //                          herself) and doesn't touch a boundary
    //                          trait.
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

            candidate =
                candidates[i];

            evaluation =
                AIH.PressureEvaluator.evaluate(
                    candidate.situation,
                    candidate.options || {}
                );

            rank =
                (
                    AIH.MinigameIntimateService.RESPONSE_RANK[
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

        intensity =
            AIH.MinigameIntimateService._confrontationIntensity(patron);

        baseSituation =
            AIH.MinigameIntimateService.buildSituation(
                patron,
                requestId
            );

        candidates = [];

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
                                Math.round(baseSituation.reward * 1.15),
                            embarrassment:
                                AIH.MinigameIntimateService._clamp01(
                                    baseSituation.embarrassment + 0.10
                                ),
                            freedomCost:
                                AIH.MinigameIntimateService._clamp01(
                                    baseSituation.freedomCost + 0.15
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
                    modestyCost: 0,
                    prideCost: 0.10
                }),

            meta: {
                driftTrait: "assertiveness",
                driftDirection: "increase"
            }
        });

        // --- call_for_help ------------------------------------------------
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

                    reward: 0,

                    danger: 0.05,

                    embarrassment:
                        AIH.MinigameIntimateService._clamp01(
                            0.15 * intensity
                        ),

                    dignityCost: 0.15,
                    freedomCost: 0.05,
                    modestyCost: 0,
                    prideCost: 0.20
                }),

            meta: {
                driftTrait: "trust",
                driftDirection: "increase"
            }
        });

        // --- intervene_physically (bathhouse-specific mishap risk) -------
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
                            0.35 * intensity
                        ),

                    embarrassment:
                        AIH.MinigameIntimateService._clamp01(
                            0.30 * intensity
                        ),

                    /*
                     * The bathhouse-specific risk the design calls for:
                     * wet stone, robes, towels - a real chance of a
                     * wardrobe slip or losing her footing mid-struggle.
                     * This is baked into the situation itself (so the
                     * evaluator actually weighs it when deciding whether
                     * this is a good idea for HER), not just narrated
                     * after the fact.
                     */
                    modestyCost: 0.35,

                    dignityCost: 0.05,
                    freedomCost: 0,
                    prideCost: 0.05
                }),

            meta: {
                driftTrait: "assertiveness",
                driftDirection: "increase"
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
            AIH.PressureEvaluator.evaluate(
                situation,
                options
            );

        /*
         * This is a definite, notable thing that just happened to her -
         * marked rewarded: true unconditionally so it reliably counts
         * (per Section 6, "rewarded" here just means "impactful enough
         * to register," not "good for her").
         */
        driftResult =
            AIH.MinigameIntimateService._reportBoundaryOutcome(
                "trust",
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

    AIH.MinigameIntimateService.CONFRONTATION_BACKFIRE_BASE_CHANCE = 0.30;
    AIH.MinigameIntimateService.CONFRONTATION_MISHAP_CHANCE = 0.35;

    AIH.MinigameIntimateService.resolveConfrontation = function(patron, requestId) {

        var options;
        var intensity;
        var candidates;
        var winner;
        var driftResult;
        var backfire;
        var mishapOccurred;
        var wentWell;
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
        mishapOccurred = false;

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
                    "assertiveness",
                    "increase",
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
                    "trust",
                    "increase",
                    winner.evaluation,
                    0.25,
                    "bathhouse confrontation: called on the house's own staff against " +
                        patron.name,
                    true
                );

        } else if (winner.action === "intervene_physically") {

            driftResult =
                AIH.MinigameIntimateService._reportBoundaryOutcome(
                    "assertiveness",
                    "increase",
                    winner.evaluation,
                    0.4,
                    "bathhouse confrontation: physically intervened against " +
                        patron.name
                );

            mishapOccurred =
                Math.random() <
                AIH.MinigameIntimateService.CONFRONTATION_MISHAP_CHANCE;
        }

        /*
         * "Handled it herself, and it held" - the basis for both faction
         * reputation and the reputation/fame emergent goal below. Giving
         * in (entertain) doesn't count as mishandling, but it's not what
         * builds a reputation for competence either - it's neutral here.
         * A backfire that overwhelms her (heldGround === false) is the
         * one clearly bad outcome.
         */
        wentWell =
            winner.action !== "entertain" &&
            !(backfire && !backfire.heldGround);

        result = {

            requestId: requestId,
            chosenAction: winner.action,
            evaluation: winner.evaluation,
            driftResult: driftResult,
            backfire: backfire,
            mishapOccurred: mishapOccurred,
            wentWell: wentWell
        };

        AIH.MinigameIntimateService.modifyPatronFactionReputationForConfrontation(
            patron,
            result
        );

        AIH.MinigameIntimateService.checkReputationAmbitionGoal(
            wentWell
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
         * handle - see the CONFRONTATION SYSTEM section above. This
         * applies regardless of patron kind - a generated rowdy party is
         * just as capable of pushing this far as a named regular.
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

        badOutcome =
            !!(
                confrontationResult.backfire &&
                !confrontationResult.backfire.heldGround
            );

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