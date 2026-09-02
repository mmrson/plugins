/*:
 * @plugindesc AI Hero Framework - Dungeon Room System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - DUNGEON ROOM SYSTEM
 * ============================================================================
 *
 * Per the dungeon handoff: the heroine is not player-controlled. She sees
 * TWO rooms ahead and picks between them; the human player is a Dungeon
 * Master who manipulates circumstances (rewards, challenges, curses,
 * monster behavior) rather than ever choosing FOR her. This module is the
 * room-selection and in-room-decision layer that sits on top of the
 * EXISTING psychology stack - it creates situations, it does not replace
 * or duplicate AIH.PressureEvaluator / AIH.PersonalityDrift / AIH.Goals /
 * AIH.CursedItems, all of which already exist and are read-only from this
 * module's point of view.
 *
 * ============================================================================
 *
 * SCOPE - WHAT'S ACTUALLY IMPLEMENTED IN THIS PASS
 *
 * The handoff describes 21 distinct room types. Rather than shallowly
 * stub all 21 with placeholder logic, this pass builds:
 *
 *     - the CORE framework in full: two-room lookahead, the shared
 *       situation-building pipeline, day/night scaling, cursed-item
 *       integration (both temptation pressure AND the possible-flip
 *       wrapper), monster culture data, viewer-incentive/interference
 *       plumbing
 *
 *     - one FULLY WORKING implementation for each distinct MECHANICAL
 *       SHAPE the handoff actually describes, since most of the 21 room
 *       types are reskins of a small number of underlying decision
 *       shapes, exactly as the handoff's own "Room Design Philosophy"
 *       section asks for ("many rooms should reuse underlying systems").
 *       Implemented shapes, with the room type(s) each demonstrates:
 *
 *         SINGLE-CHOICE MENU        -> Campfire
 *         BINARY ACCEPT/DECLINE      -> Handicap/Challenge Room
 *         CHOOSE-BEST ACROSS PATHS   -> the two-room lookahead itself,
 *                                      also Treasure vs. Mimic identify/
 *                                      open/leave
 *         PRE-ENCOUNTER WILLINGNESS  -> Regular/Elite/Lewd Monsters
 *          (+ optional viewer challenge, real combat handed off to
 *           RPG Maker's own battle system - see COMBAT HANDOFF below)
 *         BENEFIT + CHOSEN DOWNSIDE  -> Corrupted Shrine
 *         AUDIENCE-VOTED OUTCOME,
 *          THEN AI DECIDES           -> Cursed Fountain
 *         CULTURE-GATED CHALLENGE    -> Monster Audience Room
 *         CHOOSE-BEST ACROSS DEAL
 *          RESPONSES                 -> Monster Negotiation
 *
 *     - every OTHER room type from the handoff is listed in
 *       ROOM_TYPE_STATUS below with implemented: false and a one-line
 *       note on which existing shape it should reuse when authored -
 *       Merchant/Monster Merchant and Cursed/regular Chest are natural
 *       extensions of the cursed-item acquisition sources already built
 *       in AIH_CursedItems.js; Ambush/Endless Monster/Pursuit are all
 *       variations on the pre-encounter willingness shape; Audience Vote
 *       is a thin wrapper that skips the AI's OWN room-choice step
 *       entirely (the audience picks, she just responds to what was
 *       picked) - none of these need new mechanical shapes invented,
 *       they need DATA authored against shapes this pass already proves
 *       out.
 *
 * ============================================================================
 *
 * COMBAT HANDOFF
 *
 * AIH.PressureEvaluator has no concept of literal HP/MP - it is a
 * psychological pressure model. Turn-by-turn combat itself is assumed to
 * be a SEPARATE, standard RPG Maker battle system this module hands off
 * to (resolveMonsterRoom below returns a decision - engage, and on what
 * terms - not a battle outcome). What DOES route through
 * PressureEvaluator is: is she willing to engage on the terms offered at
 * all, and does she accept any optional viewer-donated challenge/
 * handicap before the fight starts. This boundary was confirmed rather
 * than assumed.
 *
 * ============================================================================
 *
 * CURSED ITEM INTEGRATION
 *
 * Every situation this module builds is evaluated through
 * AIH.CursedItems.evaluateWithPossibleFlip() rather than calling
 * AIH.PressureEvaluator.evaluate() directly - this means an equipped
 * cursed item's temptation pressure (Type B) and possible forced flip
 * (Type A) apply to ROOM CHOICE and in-room decisions exactly the same
 * way they already apply to bathhouse/waitressing decisions, with zero
 * extra plumbing needed here. Situations that plausibly interact with a
 * cursed item's pull (the Lewd Monsters room chief among them) are
 * tagged with situation.temptationTags accordingly.
 *
 * ============================================================================
 *
 * VIEWER INCENTIVE / INTERFERENCE
 *
 * The human player/livestream audience's influence is modeled the same
 * way a regular customer's familiarity already is in the two existing
 * minigames: as options.domainPressure fed into evaluate(). A donation-
 * backed challenge or reward is domainPressure with a positive sign;
 * player interference that makes something harder (strengthening a
 * monster, adding a hazard) raises the situation's own danger/severity
 * fields instead, since that's a property of the SITUATION itself, not
 * a pressure toward accepting it.
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - implement actual turn-by-turn combat resolution
 * - decide what she does with a situation - every decision goes through
 *   AIH.CursedItems.evaluateWithPossibleFlip() / AIH.PressureEvaluator
 * - modify AIH_PressureEvaluator.js, AIH_PersonalityDrift.js,
 *   AIH_CursedItems.js, or any other authoritative module
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

    AIH.Dungeon = AIH.Dungeon || {};

    AIH.Dungeon.VERSION = "0.1.0";

    AIH.Dungeon.SCHEMA_VERSION = 1;

    AIH.Dungeon._initialized = false;

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.Dungeon._clamp01 = function(value) {

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

    AIH.Dungeon._number = function(value, fallback) {

        var result;

        result =
            Number(value);

        return isNaN(result) ?
            fallback :
            result;
    };

    AIH.Dungeon._pickRandom = function(array) {

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

    /*
     * Every evaluation in this module routes through here rather than
     * AIH.PressureEvaluator.evaluate() directly, so cursed items' Type B
     * temptation pressure and Type A possible-flip both apply uniformly
     * to every dungeon decision without any extra plumbing per room.
     */
    AIH.Dungeon._evaluate = function(situation, options) {

        if (
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.evaluateWithPossibleFlip
        ) {

            return AIH.CursedItems.evaluateWithPossibleFlip(
                situation,
                options
            );
        }

        return AIH.PressureEvaluator.evaluate(
            situation,
            options
        );
    };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================

    AIH.Dungeon._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.Dungeon._ensure = function() {

        var state;

        state =
            AIH.Dungeon._state();

        if (!state) {
            return null;
        }

        if (!state.dungeon) {

            state.dungeon = {

                schemaVersion:
                    AIH.Dungeon.SCHEMA_VERSION,

                roomsVisited: 0,

                recentDecisions: [],

                /*
                 * The Dungeon Master's own separate resource, per the
                 * handoff's "Dungeon Master / Livestream Economy"
                 * section - spent to offer rewards, create challenges,
                 * strengthen monsters, choose shrine/fountain downsides,
                 * etc. This module tracks the BALANCE only; what any
                 * given spend actually does is each room resolver's own
                 * job (raising a situation's danger, adding domainPressure,
                 * and so on).
                 */
                dungeonMasterCurrency: 0

            };
        }

        if (!Array.isArray(state.dungeon.recentDecisions)) {
            state.dungeon.recentDecisions = [];
        }

        return state.dungeon;
    };

    AIH.Dungeon._logDecision = function(record) {

        var state;

        state =
            AIH.Dungeon._ensure();

        if (!state) {
            return;
        }

        record.timestamp =
            Date.now();

        state.recentDecisions.push(record);

        if (state.recentDecisions.length > 100) {
            state.recentDecisions =
                state.recentDecisions.slice(-100);
        }

        state.roomsVisited += 1;
    };

    // =========================================================================
    // DUNGEON MASTER CURRENCY
    // =========================================================================

    AIH.Dungeon.getDungeonMasterCurrency = function() {

        var state;

        state =
            AIH.Dungeon._ensure();

        return state ?
            state.dungeonMasterCurrency :
            0;
    };

    AIH.Dungeon.addDungeonMasterCurrency = function(amount) {

        var state;

        state =
            AIH.Dungeon._ensure();

        if (!state) {
            return 0;
        }

        state.dungeonMasterCurrency =
            Math.max(
                0,
                state.dungeonMasterCurrency +
                AIH.Dungeon._number(amount, 0)
            );

        return state.dungeonMasterCurrency;
    };

    AIH.Dungeon.spendDungeonMasterCurrency = function(amount) {

        var state;

        state =
            AIH.Dungeon._ensure();

        amount =
            AIH.Dungeon._number(amount, 0);

        if (
            !state ||
            state.dungeonMasterCurrency < amount
        ) {

            return false;
        }

        state.dungeonMasterCurrency -=
            amount;

        return true;
    };

    // =========================================================================
    // MONSTER CULTURES
    // =========================================================================
    //
    // Data only - what a given monster culture finds normal/impressive to
    // ask of the heroine, for the Monster Audience room. What's
    // "embarrassing" is culturally relative per the handoff's own
    // explicit point - the SAME literal request (drink from a communal
    // bowl) can be tagged with a low embarrassment cost for one culture's
    // room and a high one for a human-facing room, simply by authoring
    // two different situation templates, not by this module knowing
    // anything special about culture.
    //
    // =========================================================================

    AIH.Dungeon.MONSTER_CULTURES = {

        goblin: {

            label: "Goblins",
            valuesDescription:
                "silly/chaotic dares, ridiculous challenges, strange " +
                "food/drink customs",

            challengePool: [

                {
                    id: "goblin_communal_bowl",
                    description:
                        "Drink from the communal bowl, goblin-style - " +
                        "completely normal to them, undignified to a human.",
                    baseSituation: {
                        severity: "medium",
                        danger: 0,
                        embarrassment: 0.35,
                        dignityCost: 0.25,
                        modestyCost: 0,
                        prideCost: 0.15
                    },
                    temptationTags: ["public_display"]
                },

                {
                    id: "goblin_silly_dance",
                    description:
                        "Perform a ridiculous goblin dance for the crowd.",
                    baseSituation: {
                        severity: "medium",
                        danger: 0,
                        embarrassment: 0.45,
                        dignityCost: 0.15,
                        modestyCost: 0,
                        prideCost: 0.25
                    },
                    temptationTags: ["public_display", "playful_teasing"]
                }

            ]
        },

        orc: {

            label: "Orcs",
            valuesDescription:
                "courage, confidence, toughness, displays of strength",

            challengePool: [

                {
                    id: "orc_strength_display",
                    description:
                        "Prove her strength in front of the whole gathering.",
                    baseSituation: {
                        severity: "medium",
                        danger: 0.15,
                        embarrassment: 0.10,
                        dignityCost: 0,
                        modestyCost: 0,
                        prideCost: 0
                    },
                    temptationTags: []
                },

                {
                    id: "orc_pain_tolerance",
                    description:
                        "Take a real hit without flinching, to earn their respect.",
                    baseSituation: {
                        severity: "rare",
                        danger: 0.25,
                        embarrassment: 0.05,
                        dignityCost: 0,
                        modestyCost: 0,
                        prideCost: 0
                    },
                    temptationTags: []
                }

            ]
        },

        kobold: {

            label: "Kobolds",
            valuesDescription:
                "scavenging, cleverness, unusual little challenges",

            challengePool: [

                {
                    id: "kobold_scavenge_trial",
                    description:
                        "Find the hidden trinket faster than their own best scavenger.",
                    baseSituation: {
                        severity: "normal",
                        danger: 0.05,
                        embarrassment: 0.05,
                        dignityCost: 0,
                        modestyCost: 0,
                        prideCost: 0.05
                    },
                    temptationTags: []
                }

            ]
        },

        minotaur: {

            label: "Minotaurs",
            valuesDescription:
                "courage, strength, composure",

            challengePool: [

                {
                    id: "minotaur_composure_trial",
                    description:
                        "Hold her ground, unflinching, as it charges past close enough to feel the wind.",
                    baseSituation: {
                        severity: "rare",
                        danger: 0.30,
                        embarrassment: 0.05,
                        dignityCost: 0,
                        modestyCost: 0,
                        prideCost: 0
                    },
                    temptationTags: []
                }

            ]
        },

        slime: {

            label: "Slimes",
            valuesDescription:
                "bizarre but harmless demonstrations involving their environment",

            challengePool: [

                {
                    id: "slime_bizarre_demonstration",
                    description:
                        "Let it demonstrate something bizarre but genuinely harmless.",
                    baseSituation: {
                        severity: "normal",
                        danger: 0,
                        embarrassment: 0.20,
                        dignityCost: 0.05,
                        modestyCost: 0.10,
                        prideCost: 0
                    },
                    temptationTags: ["public_display"]
                }

            ]
        }

    };

    // =========================================================================
    // DAY/NIGHT SCALING
    // =========================================================================
    //
    // Per design discussion: dungeon risk AND reward both amplify at
    // night, on top of - and independent from - cursed items' own
    // separate night boost. A single shared multiplier so every room
    // resolver scales consistently rather than each inventing its own
    // curve.
    //
    // =========================================================================

    AIH.Dungeon.NIGHT_DANGER_BOOST = 0.5;

    AIH.Dungeon.NIGHT_REWARD_BOOST = 0.5;

    AIH.Dungeon._nightMagnitude = function() {

        if (
            typeof AIH.TimeOfDay !== "undefined" &&
            AIH.TimeOfDay.nightMagnitude
        ) {

            return AIH.TimeOfDay.nightMagnitude();
        }

        return 0;
    };

    AIH.Dungeon._nightDangerMultiplier = function() {

        return 1 +
            (
                AIH.Dungeon._nightMagnitude() *
                AIH.Dungeon.NIGHT_DANGER_BOOST
            );
    };

    AIH.Dungeon._nightRewardMultiplier = function() {

        return 1 +
            (
                AIH.Dungeon._nightMagnitude() *
                AIH.Dungeon.NIGHT_REWARD_BOOST
            );
    };

    // =========================================================================
    // ROOM TYPE STATUS
    // =========================================================================
    //
    // Every room type from the handoff, honestly marked. See the file
    // header for which underlying mechanical shape each unimplemented
    // type should reuse when authored - none of them need a new shape
    // invented, they need data written against a shape this pass already
    // proves out.
    //
    // =========================================================================

    AIH.Dungeon.ROOM_TYPE_STATUS = {

        campfire: { implemented: true, shape: "single_choice_menu" },
        regular_monsters: { implemented: true, shape: "pre_encounter_willingness" },
        elite_monsters: { implemented: true, shape: "pre_encounter_willingness" },
        lewd_monsters: { implemented: true, shape: "pre_encounter_willingness" },
        treasure: { implemented: true, shape: "choose_best_across_paths" },
        mimic_trap_treasure: { implemented: true, shape: "choose_best_across_paths" },
        trap_room: { implemented: false, shape: "reuses pre_encounter_willingness with reward=0" },
        merchant: { implemented: false, shape: "reuses AIH_CursedItems.forceEquip's voluntary source + a plain shop UI, no new evaluation shape needed" },
        corrupted_shrine: { implemented: true, shape: "benefit_plus_chosen_downside" },
        cursed_fountain: { implemented: true, shape: "audience_voted_outcome_then_ai_decides" },
        monster_audience: { implemented: true, shape: "culture_gated_challenge" },
        monster_negotiation: { implemented: true, shape: "choose_best_across_deal_responses" },
        monster_merchant: { implemented: false, shape: "reuses merchant's shape - a data-only extension of AIH_CursedItems' voluntary acquisition source" },
        cursed_chest: { implemented: false, shape: "reuses choose_best_across_paths (open/leave/identify), reward scaled to curse severity" },
        handicap_challenge: { implemented: true, shape: "binary_accept_decline" },
        herb_resource: { implemented: false, shape: "reuses binary_accept_decline (safe vs. risky method)" },
        ambush: { implemented: false, shape: "reuses pre_encounter_willingness, triggered without a prior room-choice step" },
        endless_monster: { implemented: false, shape: "reuses pre_encounter_willingness in a loop, reward log-scaling exactly like AIH_Minigame_Service.js's large_tip" },
        pursuit: { implemented: false, shape: "reuses binary_accept_decline per obstacle (help vs. hinder framing), chained" },
        cursed_challenge: { implemented: false, shape: "reuses benefit_plus_chosen_downside, downside drawn from AIH_CursedItems.DEFINITIONS directly" },
        audience_vote: { implemented: false, shape: "skips the AI room-choice step entirely - the audience picks via the same voting mechanism as cursed_fountain, she only responds to the result" }

    };

    // =========================================================================
    // SITUATION BUILDING - SHARED HELPERS
    // =========================================================================

    AIH.Dungeon._applyNightScaling = function(situation) {

        var dangerMult;
        var rewardMult;

        dangerMult =
            AIH.Dungeon._nightDangerMultiplier();

        rewardMult =
            AIH.Dungeon._nightRewardMultiplier();

        situation.danger =
            AIH.Dungeon._clamp01(
                AIH.Dungeon._number(situation.danger, 0) *
                dangerMult
            );

        situation.reward =
            Math.round(
                AIH.Dungeon._number(situation.reward, 0) *
                rewardMult
            );

        return situation;
    };

    // =========================================================================
    // SHAPE 1: TWO-ROOM LOOKAHEAD (choose_best_across_paths, room-choice form)
    // =========================================================================
    //
    // roomA/roomB: { situation: <a normalized situation describing what
    // taking this path costs/offers>, options: <optional evaluate()
    // options - e.g. viewer domainPressure specific to this path> }
    //
    // Returns { chosen: "A"|"B", evaluationA, evaluationB }. Both
    // candidates are evaluated (through the cursed-item-aware wrapper),
    // and whichever scores higher wins - same ranking convention as
    // AIH_Minigame_Service.js's _chooseBest, adapted for exactly two
    // named candidates rather than an array, since room lookahead is
    // always binary per the handoff.
    //
    // =========================================================================

    AIH.Dungeon.RESPONSE_RANK = {
        accept: 3,
        reluctant_accept: 2,
        partial: 1,
        reject: 0
    };

    AIH.Dungeon._rank = function(evaluation) {

        return (
            AIH.Dungeon.RESPONSE_RANK[evaluation.response] ||
            0
        ) *
        10 +
        evaluation.score;
    };

    AIH.Dungeon.chooseNextRoom = function(roomA, roomB) {

        var evaluationA;
        var evaluationB;
        var chosen;

        AIH.Dungeon._applyNightScaling(
            roomA.situation
        );

        AIH.Dungeon._applyNightScaling(
            roomB.situation
        );

        evaluationA =
            AIH.Dungeon._evaluate(
                roomA.situation,
                roomA.options || {}
            );

        evaluationB =
            AIH.Dungeon._evaluate(
                roomB.situation,
                roomB.options || {}
            );

        chosen =
            AIH.Dungeon._rank(evaluationA) >=
            AIH.Dungeon._rank(evaluationB) ?
                "A" :
                "B";

        AIH.Dungeon._logDecision({

            type: "room_lookahead",
            roomAId: roomA.situation.id,
            roomBId: roomB.situation.id,
            chosen: chosen

        });

        return {

            chosen: chosen,
            evaluationA: evaluationA,
            evaluationB: evaluationB

        };
    };

    // =========================================================================
    // SHAPE 2: SINGLE-CHOICE MENU (Campfire)
    // =========================================================================

    AIH.Dungeon.CAMPFIRE_OPTIONS = [

        {
            id: "recover_hp",
            description: "Rest and recover HP.",
            baseSituation: { severity: "normal", danger: 0, reward: 10 }
        },

        {
            id: "recover_mana",
            description: "Meditate and recover mana.",
            baseSituation: { severity: "normal", danger: 0, reward: 10 }
        },

        {
            id: "meditate_buff",
            description: "Meditate for a temporary stat benefit instead of resting fully.",
            baseSituation: { severity: "normal", danger: 0, reward: 15, freedomCost: 0.05 }
        },

        {
            id: "remove_status",
            description: "Work through a lingering status effect.",
            baseSituation: { severity: "normal", danger: 0, reward: 10 }
        },

        {
            id: "remove_curse",
            description: "Spend the whole rest trying to work at a curse's removal condition.",
            baseSituation: { severity: "medium", danger: 0, reward: 20, freedomCost: 0.10 }
        },

        {
            id: "just_relax",
            description: "Just rest. No agenda.",
            baseSituation: { severity: "normal", danger: 0, reward: 5 }
        }

    ];

    /*
     * viewerIncentives: optional { optionId: domainPressureBonus } - a
     * donation backing one specific campfire choice, per the handoff's
     * "Livestream viewers can offer rewards for choosing particular
     * options."
     */
    AIH.Dungeon.resolveCampfire = function(viewerIncentives) {

        var candidates;
        var i;
        var option;
        var situation;
        var options;
        var best;
        var bestRank;
        var evaluation;
        var rank;

        candidates =
            AIH.Dungeon.CAMPFIRE_OPTIONS;

        best = null;
        bestRank = -Infinity;

        for (
            i = 0;
            i < candidates.length;
            i++
        ) {

            option =
                candidates[i];

            situation =
                AIH.PressureEvaluator.normalizeSituation(
                    Object.assign(
                        {
                            id: "campfire_" + option.id + "_" + Date.now(),
                            type: "dungeon_campfire",
                            category: option.id,
                            description: option.description
                        },
                        option.baseSituation
                    )
                );

            options = {};

            if (
                viewerIncentives &&
                viewerIncentives[option.id]
            ) {

                options.domainPressure =
                    AIH.Dungeon._number(
                        viewerIncentives[option.id],
                        0
                    );
            }

            evaluation =
                AIH.Dungeon._evaluate(
                    situation,
                    options
                );

            rank =
                AIH.Dungeon._rank(evaluation);

            if (rank > bestRank) {

                bestRank = rank;

                best = {
                    optionId: option.id,
                    evaluation: evaluation
                };
            }
        }

        AIH.Dungeon._logDecision({

            type: "campfire",
            chosenOption:
                best && best.optionId

        });

        return best;
    };

    // =========================================================================
    // SHAPE 3: PRE-ENCOUNTER WILLINGNESS (Regular/Elite/Lewd Monsters)
    // =========================================================================
    //
    // tier: "regular" | "elite" | "lewd" - lewd carries the handoff's own
    // explicit cost profile (lower danger-equivalent, higher psychological
    // cost) rather than being "elite but reskinned."
    //
    // viewerChallenge (optional): { description, rewardBonus,
    // extraCost: { embarrassment, prideCost, ... } } - e.g. "50 gold if
    // you let the goblin hit you three times." Evaluated as its OWN
    // candidate against "engage normally," via chooseBest - she may
    // accept the challenge, or fight on her own terms instead.
    //
    // =========================================================================

    AIH.Dungeon.MONSTER_TIER_PROFILES = {

        regular: {
            severity: "normal",
            danger: 0.20,
            reward: 40,
            embarrassment: 0,
            modestyCost: 0,
            temptationTags: []
        },

        elite: {
            severity: "medium",
            danger: 0.45,
            reward: 120,
            embarrassment: 0,
            modestyCost: 0,
            temptationTags: []
        },

        /*
         * Per the handoff: "high combat threat, but generally lower HP
         * loss than fighting equally powerful conventional elites -
         * psychological/social pressure is the major additional cost."
         * Danger deliberately lower than "elite" despite being
         * comparably threatening in fiction; embarrassment/modestyCost
         * carry the actual weight instead.
         */
        lewd: {
            severity: "medium",
            danger: 0.25,
            reward: 110,
            embarrassment: 0.45,
            modestyCost: 0.40,
            temptationTags: ["sensual_self_focus", "singular_devotion"]
        }

    };

    AIH.Dungeon.resolveMonsterRoom = function(tier, viewerChallenge) {

        var profile;
        var candidates;
        var normalSituation;
        var challengeSituation;
        var winner;

        profile =
            AIH.Dungeon.MONSTER_TIER_PROFILES[tier] ||
            AIH.Dungeon.MONSTER_TIER_PROFILES.regular;

        normalSituation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "monster_" + tier + "_normal_" + Date.now(),
                type: "dungeon_monster_encounter",
                category: tier,
                description:
                    "Engage the " + tier + " encounter on her own terms.",

                severity: profile.severity,
                danger: profile.danger,
                reward: profile.reward,
                embarrassment: profile.embarrassment,
                modestyCost: profile.modestyCost

            });

        normalSituation.temptationTags =
            profile.temptationTags;

        AIH.Dungeon._applyNightScaling(
            normalSituation
        );

        candidates = [

            {
                action: "engage_normally",
                situation: normalSituation,
                options: {}
            }

        ];

        if (viewerChallenge) {

            challengeSituation =
                AIH.PressureEvaluator.normalizeSituation({

                    id: "monster_" + tier + "_challenge_" + Date.now(),
                    type: "dungeon_monster_encounter",
                    category: tier + "_challenge",
                    description:
                        viewerChallenge.description ||
                        "Accept the viewer-backed challenge.",

                    severity: profile.severity,

                    reward:
                        profile.reward +
                        AIH.Dungeon._number(
                            viewerChallenge.rewardBonus,
                            0
                        ),

                    danger:
                        profile.danger +
                        AIH.Dungeon._number(
                            viewerChallenge.extraCost &&
                            viewerChallenge.extraCost.danger,
                            0
                        ),

                    embarrassment:
                        profile.embarrassment +
                        AIH.Dungeon._number(
                            viewerChallenge.extraCost &&
                            viewerChallenge.extraCost.embarrassment,
                            0
                        ),

                    prideCost:
                        AIH.Dungeon._number(
                            viewerChallenge.extraCost &&
                            viewerChallenge.extraCost.prideCost,
                            0
                        ),

                    modestyCost:
                        profile.modestyCost +
                        AIH.Dungeon._number(
                            viewerChallenge.extraCost &&
                            viewerChallenge.extraCost.modestyCost,
                            0
                        )

                });

            challengeSituation.temptationTags =
                profile.temptationTags;

            AIH.Dungeon._applyNightScaling(
                challengeSituation
            );

            candidates.push({

                action: "accept_viewer_challenge",
                situation: challengeSituation,
                options: {}

            });
        }

        winner =
            AIH.Dungeon._chooseBestCandidate(
                candidates
            );

        AIH.Dungeon._logDecision({

            type: "monster_room",
            tier: tier,
            chosenAction:
                winner && winner.action

        });

        return winner;
    };

    /*
     * Shared N-candidate chooser - same pattern as
     * AIH_Minigame_Service.js's _chooseBest, reused here rather than
     * reinvented, since dungeon rooms have exactly the same "several
     * qualitatively different options, evaluate each, take the best"
     * shape multiple minigames already proved out.
     */
    AIH.Dungeon._chooseBestCandidate = function(candidates) {

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

            candidate =
                candidates[i];

            evaluation =
                AIH.Dungeon._evaluate(
                    candidate.situation,
                    candidate.options || {}
                );

            rank =
                AIH.Dungeon._rank(evaluation);

            if (rank > bestRank) {

                bestRank = rank;

                best = {
                    action: candidate.action,
                    evaluation: evaluation
                };
            }
        }

        return best;
    };

    // =========================================================================
    // SHAPE 4: CHOOSE-BEST ACROSS PATHS (Treasure / Mimic Treasure)
    // =========================================================================

    AIH.Dungeon.resolveTreasureRoom = function(isMimic, viewerIncentives) {

        var baseReward;
        var openSituation;
        var identifySituation;
        var leaveSituation;
        var candidates;
        var winner;

        baseReward =
            isMimic ?
                0 :
                80;

        openSituation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "treasure_open_" + Date.now(),
                type: "dungeon_treasure",
                category: "open",
                description: "Open the chest without identifying it first.",

                severity:
                    isMimic ?
                        "rare" :
                        "normal",

                reward: baseReward,

                danger:
                    isMimic ?
                        0.35 :
                        0

            });

        identifySituation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "treasure_identify_" + Date.now(),
                type: "dungeon_treasure",
                category: "identify",
                description: "Identify the chest before deciding.",

                severity: "normal",

                reward:
                    Math.round(baseReward * 0.7),

                danger: 0,
                freedomCost: 0.10

            });

        leaveSituation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "treasure_leave_" + Date.now(),
                type: "dungeon_treasure",
                category: "leave",
                description: "Leave it alone entirely.",

                severity: "normal",

                reward: 0,
                danger: 0

            });

        candidates = [

            {
                action: "open",
                situation: openSituation,
                options: {
                    domainPressure:
                        AIH.Dungeon._number(
                            viewerIncentives &&
                            viewerIncentives.open,
                            0
                        )
                }
            },

            {
                action: "identify",
                situation: identifySituation,
                options: {
                    domainPressure:
                        AIH.Dungeon._number(
                            viewerIncentives &&
                            viewerIncentives.identify,
                            0
                        )
                }
            },

            {
                action: "leave",
                situation: leaveSituation,
                options: {}
            }

        ];

        candidates.forEach(function(c) {
            AIH.Dungeon._applyNightScaling(c.situation);
        });

        winner =
            AIH.Dungeon._chooseBestCandidate(
                candidates
            );

        AIH.Dungeon._logDecision({

            type: "treasure_room",
            isMimic: !!isMimic,
            chosenAction:
                winner && winner.action

        });

        return winner;
    };

    // =========================================================================
    // SHAPE 5: BENEFIT + CHOSEN DOWNSIDE (Corrupted Shrine)
    // =========================================================================
    //
    // The Dungeon Master (not the AI) picks the downside - passed in as
    // downside: { description, cost: { modestyCost, dignityCost, ... },
    // cursedItemId } (optionally force-equipping a specific cursed item
    // as part of the downside). The AI only ever decides whether USING
    // the shrine, on those already-fixed terms, is worth it.
    //
    // =========================================================================

    AIH.Dungeon.resolveCorruptedShrine = function(benefit, downside) {

        var situation;
        var evaluation;

        situation =
            AIH.PressureEvaluator.normalizeSituation(
                Object.assign(
                    {
                        id: "shrine_" + Date.now(),
                        type: "dungeon_shrine",
                        category: "corrupted_shrine",
                        description:
                            (benefit && benefit.description || "a benefit") +
                            ", but " +
                            (downside && downside.description || "at a cost"),

                        severity: "medium",

                        reward:
                            AIH.Dungeon._number(
                                benefit && benefit.rewardEquivalent,
                                0
                            )
                    },
                    (downside && downside.cost) || {}
                )
            );

        AIH.Dungeon._applyNightScaling(
            situation
        );

        evaluation =
            AIH.Dungeon._evaluate(
                situation,
                {}
            );

        if (
            evaluation.response !== "reject" &&
            downside &&
            downside.cursedItemId &&
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.forceEquip
        ) {

            AIH.CursedItems.forceEquip(
                downside.cursedItemId,
                "voluntary"
            );
        }

        AIH.Dungeon._logDecision({

            type: "corrupted_shrine",
            usedShrine:
                evaluation.response !== "reject",
            downsideDescription:
                downside && downside.description

        });

        return {

            usedShrine:
                evaluation.response !== "reject",

            evaluation: evaluation

        };
    };

    // =========================================================================
    // SHAPE 6: AUDIENCE-VOTED OUTCOME, THEN AI DECIDES (Cursed Fountain)
    // =========================================================================
    //
    // The audience votes among up to 3 possible outcomes (donation =
    // voting power, more money = more weight, per the handoff) - this
    // module does not implement the actual vote tally UI, it accepts the
    // ALREADY-DETERMINED winning outcome as an argument (chosenOutcome)
    // and only handles what comes after: does the AI actually want to
    // use the fountain, now that she can see (or partially see) what
    // she's risking.
    //
    // =========================================================================

    AIH.Dungeon.resolveCursedFountain = function(chosenOutcome) {

        var situation;
        var evaluation;

        situation =
            AIH.PressureEvaluator.normalizeSituation(
                Object.assign(
                    {
                        id: "fountain_" + Date.now(),
                        type: "dungeon_fountain",
                        category: "cursed_fountain",
                        description:
                            (chosenOutcome && chosenOutcome.description) ||
                            "an uncertain, possibly cursed, recovery"
                    },
                    (chosenOutcome && chosenOutcome.situation) || {}
                )
            );

        AIH.Dungeon._applyNightScaling(
            situation
        );

        evaluation =
            AIH.Dungeon._evaluate(
                situation,
                {}
            );

        if (
            evaluation.response !== "reject" &&
            chosenOutcome &&
            chosenOutcome.cursedItemId &&
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.forceEquip
        ) {

            AIH.CursedItems.forceEquip(
                chosenOutcome.cursedItemId,
                "voluntary"
            );
        }

        AIH.Dungeon._logDecision({

            type: "cursed_fountain",
            usedFountain:
                evaluation.response !== "reject",
            outcomeDescription:
                chosenOutcome && chosenOutcome.description

        });

        return {

            usedFountain:
                evaluation.response !== "reject",

            evaluation: evaluation

        };
    };

    // =========================================================================
    // SHAPE 7: CULTURE-GATED CHALLENGE (Monster Audience Room)
    // =========================================================================

    AIH.Dungeon.resolveMonsterAudience = function(cultureKey, challengeId, viewerIncentive) {

        var culture;
        var challenge;
        var i;
        var situation;
        var options;
        var evaluation;

        culture =
            AIH.Dungeon.MONSTER_CULTURES[cultureKey];

        if (!culture) {
            return null;
        }

        challenge = null;

        for (
            i = 0;
            i < culture.challengePool.length;
            i++
        ) {

            if (culture.challengePool[i].id === challengeId) {

                challenge =
                    culture.challengePool[i];

                break;
            }
        }

        if (!challenge) {

            challenge =
                AIH.Dungeon._pickRandom(
                    culture.challengePool
                );
        }

        if (!challenge) {
            return null;
        }

        situation =
            AIH.PressureEvaluator.normalizeSituation(
                Object.assign(
                    {
                        id: "audience_" + cultureKey + "_" + challenge.id + "_" + Date.now(),
                        type: "dungeon_monster_audience",
                        category: challenge.id,
                        description: challenge.description
                    },
                    challenge.baseSituation
                )
            );

        situation.temptationTags =
            challenge.temptationTags ||
            [];

        AIH.Dungeon._applyNightScaling(
            situation
        );

        options = {};

        if (viewerIncentive) {

            options.domainPressure =
                AIH.Dungeon._number(
                    viewerIncentive,
                    0
                );
        }

        evaluation =
            AIH.Dungeon._evaluate(
                situation,
                options
            );

        AIH.Dungeon._logDecision({

            type: "monster_audience",
            culture: cultureKey,
            challengeId: challenge.id,
            accepted:
                evaluation.response !== "reject"

        });

        return {

            culture: cultureKey,
            challengeId: challenge.id,
            accepted:
                evaluation.response !== "reject",

            evaluation: evaluation

        };
    };

    // =========================================================================
    // SHAPE 8: CHOOSE-BEST ACROSS DEAL RESPONSES (Monster Negotiation)
    // =========================================================================
    //
    // deal: { description, offerCost: { ... }, keepsReward } - the terms
    // as currently offered, AFTER any viewer donation has already
    // sweetened them (per the handoff's own example: a donation makes the
    // monster let her keep the potion - that renegotiation happens
    // BEFORE this is called, this function only evaluates whatever the
    // current terms are).
    //
    // =========================================================================

    AIH.Dungeon.resolveMonsterNegotiation = function(deal) {

        var acceptSituation;
        var fightSituation;
        var candidates;
        var winner;

        acceptSituation =
            AIH.PressureEvaluator.normalizeSituation(
                Object.assign(
                    {
                        id: "negotiation_accept_" + Date.now(),
                        type: "dungeon_negotiation",
                        category: "accept_deal",
                        description:
                            deal && deal.description ||
                            "Accept the deal as offered.",

                        reward:
                            AIH.Dungeon._number(
                                deal && deal.keepsReward,
                                0
                            )
                    },
                    (deal && deal.offerCost) || {}
                )
            );

        fightSituation =
            AIH.PressureEvaluator.normalizeSituation({

                id: "negotiation_fight_" + Date.now(),
                type: "dungeon_negotiation",
                category: "refuse_and_fight",
                description: "Refuse the deal and fight instead.",

                severity: "medium",
                danger: 0.35,
                reward: 60

            });

        candidates = [

            { action: "accept_deal", situation: acceptSituation, options: {} },
            { action: "refuse_and_fight", situation: fightSituation, options: {} }

        ];

        candidates.forEach(function(c) {
            AIH.Dungeon._applyNightScaling(c.situation);
        });

        winner =
            AIH.Dungeon._chooseBestCandidate(
                candidates
            );

        AIH.Dungeon._logDecision({

            type: "monster_negotiation",
            chosenAction:
                winner && winner.action

        });

        return winner;
    };

    // =========================================================================
    // SHAPE 9: BINARY ACCEPT/DECLINE (Handicap/Challenge Room)
    // =========================================================================

    AIH.Dungeon.HANDICAP_OPTIONS = {

        weaponless_trial: {
            description: "No weapons until the next rest point.",
            rewardDescription: "Next treasure chest doubled.",
            cost: { freedomCost: 0.30, danger: 0.15 },
            rewardEquivalent: 100
        },

        no_armor: {
            description: "No armor until the next rest point.",
            rewardDescription: "Major stat boost.",
            cost: { freedomCost: 0.25, danger: 0.20 },
            rewardEquivalent: 90
        },

        no_magic: {
            description: "No magic until the next branch/rest.",
            rewardDescription: "Rare equipment.",
            cost: { freedomCost: 0.25, danger: 0.15 },
            rewardEquivalent: 110
        },

        no_healing: {
            description: "Cannot restore HP until the rest point.",
            rewardDescription: "Double XP.",
            cost: { freedomCost: 0.20, danger: 0.30 },
            rewardEquivalent: 80
        },

        heavy_burden: {
            description: "Carry a cursed item until the rest point.",
            rewardDescription: "Guaranteed rare loot.",
            cost: { freedomCost: 0.35, dignityCost: 0.10 },
            rewardEquivalent: 120,
            cursedItemId: null // set by the caller to whichever item is on offer
        }

    };

    AIH.Dungeon.resolveHandicapRoom = function(handicapId, cursedItemId) {

        var handicap;
        var situation;
        var evaluation;

        handicap =
            AIH.Dungeon.HANDICAP_OPTIONS[handicapId];

        if (!handicap) {
            return null;
        }

        situation =
            AIH.PressureEvaluator.normalizeSituation(
                Object.assign(
                    {
                        id: "handicap_" + handicapId + "_" + Date.now(),
                        type: "dungeon_handicap",
                        category: handicapId,
                        description:
                            handicap.description +
                            " Reward: " +
                            handicap.rewardDescription,

                        severity: "medium",

                        reward: handicap.rewardEquivalent
                    },
                    handicap.cost
                )
            );

        AIH.Dungeon._applyNightScaling(
            situation
        );

        evaluation =
            AIH.Dungeon._evaluate(
                situation,
                {}
            );

        if (
            evaluation.response !== "reject" &&
            handicapId === "heavy_burden" &&
            cursedItemId &&
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.forceEquip
        ) {

            AIH.CursedItems.forceEquip(
                cursedItemId,
                "voluntary"
            );
        }

        AIH.Dungeon._logDecision({

            type: "handicap_room",
            handicapId: handicapId,
            accepted:
                evaluation.response !== "reject"

        });

        return {

            handicapId: handicapId,
            accepted:
                evaluation.response !== "reject",

            evaluation: evaluation

        };
    };

    // =========================================================================
    // QUERY
    // =========================================================================

    AIH.Dungeon.getStatus = function() {

        var state;

        state =
            AIH.Dungeon._ensure();

        if (!state) {
            return null;
        }

        return JSON.parse(
            JSON.stringify(state)
        );
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Dungeon.initialize = function() {

        AIH.Dungeon._ensure();

        AIH.Dungeon._initialized =
            true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Dungeon room system initialized."
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
            "Dungeon",
            {
                version:
                    AIH.Dungeon.VERSION,

                initialize: function() {
                    AIH.Dungeon.initialize();
                },

                chooseNextRoom: function(roomA, roomB) {
                    return AIH.Dungeon.chooseNextRoom(roomA, roomB);
                },

                resolveCampfire: function(viewerIncentives) {
                    return AIH.Dungeon.resolveCampfire(viewerIncentives);
                },

                resolveMonsterRoom: function(tier, viewerChallenge) {
                    return AIH.Dungeon.resolveMonsterRoom(tier, viewerChallenge);
                },

                resolveTreasureRoom: function(isMimic, viewerIncentives) {
                    return AIH.Dungeon.resolveTreasureRoom(isMimic, viewerIncentives);
                },

                resolveCorruptedShrine: function(benefit, downside) {
                    return AIH.Dungeon.resolveCorruptedShrine(benefit, downside);
                },

                resolveCursedFountain: function(chosenOutcome) {
                    return AIH.Dungeon.resolveCursedFountain(chosenOutcome);
                },

                resolveMonsterAudience: function(cultureKey, challengeId, viewerIncentive) {
                    return AIH.Dungeon.resolveMonsterAudience(cultureKey, challengeId, viewerIncentive);
                },

                resolveMonsterNegotiation: function(deal) {
                    return AIH.Dungeon.resolveMonsterNegotiation(deal);
                },

                resolveHandicapRoom: function(handicapId, cursedItemId) {
                    return AIH.Dungeon.resolveHandicapRoom(handicapId, cursedItemId);
                },

                getStatus: function() {
                    return AIH.Dungeon.getStatus();
                }
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_Dungeon_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_Dungeon_createGameObjects.call(
                this
            );

            AIH.Dungeon.initialize();
        };

        var _AIH_Dungeon_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_Dungeon_setupNewGame.call(
                this
            );

            AIH.Dungeon._initialized =
                false;

            AIH.Dungeon.initialize();
        };

        var _AIH_Dungeon_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_Dungeon_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.Dungeon._initialized =
                    false;

                AIH.Dungeon.initialize();
            };
    }

})();