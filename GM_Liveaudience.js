/*:
 * @plugindesc GM Livestream Audience System v1.1.0
 * @author GM
 * @target MZ
 *
 * @command AudienceInit
 * @text Initialize Audience
 * @desc (Re)initializes the livestream audience system.
 *
 * @command AudienceRequest
 * @text Generate Request
 * @desc Generates a new audience request.
 *
 * @arg eventName
 * @text Event Name
 * @type string
 * @default plugin_command
 *
 * @command AudienceIncident
 * @text Trigger Incident
 * @desc Triggers an audience-driven incident.
 *
 * @arg type
 * @text Incident Type
 * @type string
 * @default wardrobe_malfunction
 *
 * @command AudienceReact
 * @text Audience Reacts
 * @desc Makes the audience react to a named event.
 *
 * @arg eventName
 * @text Event Name
 * @type string
 * @default generic
 *
 * @command AudienceChallengeComplete
 * @text Complete Active Challenge
 * @desc Completes the currently active audience challenge and pays out its reward.
 *
 * @command AudienceChallengeBreak
 * @text Break Active Challenge
 * @desc Breaks the currently active audience challenge.
 *
 * @arg reason
 * @text Reason
 * @type string
 * @default plugin_command
 *
 * @command AudienceSetPlayerCut
 * @text Set Player Gold Cut
 * @desc Sets the percentage (0-100) of real gold payouts diverted to the human player's resource pool. Intended to be driven by the Edict / skill-tree system.
 *
 * @arg percent
 * @text Percent
 * @type number
 * @min 0
 * @max 100
 * @default 0
 *
 * @help
 * ============================================================================
 * GM LIVESTREAM AUDIENCE
 * ============================================================================
 *
 * A persistent in-world livestream audience system for RPG Maker MZ.
 *
 * Plugin commands are registered through PluginManager.registerCommand, so
 * they show up in the MZ event editor's Plugin Command picker.
 *
 * The audience:
 * - Has persistent named viewers with individual personalities.
 * - Has viewer motivations and long-term agendas.
 * - Remembers what the heroine does.
 * - Generates requests and floor challenges.
 * - Generates separate random audience-triggered incidents.
 * - Donates real money and pays real rewards that actually reach the
 *   heroine's gold, with a configurable share diverted to the human
 *   player's own resource pool (see GOLD / PLAYER CUT below).
 * - Reacts to dungeon events through chat.
 * - Develops loyalty and attachment to the heroine.
 * - Can gradually influence heroine behaviour through repeated experiences.
 *
 * IMPORTANT:
 * The audience does NOT know about the Edict system.
 *
 * Edicts are a separate player-facing progression system. This plugin only
 * provides hooks which other systems may use to influence this system - the
 * player-cut percentage (below) is one such hook.
 *
 * ============================================================================
 * GOLD / PLAYER CUT
 * ============================================================================
 *
 * Every real gold payout (an accepted or partially-accepted request, a
 * completed challenge, a donation) is paid out through LA.grantReward(),
 * which is the single place actual gold changes hands:
 *
 *     - The heroine's share is paid directly into $gameParty's gold.
 *     - The human player's (Dungeon Master's) share accumulates in a
 *       separate resource pool, LA.playerWallet, which is NOT the same
 *       thing as the heroine's gold.
 *
 * The split is controlled by LA.Config.playerCutPercent (0-100), which
 * starts at 0 - no cut is taken until something actually sets it. Nothing
 * in this file decides what that percentage should be; it is intended to
 * be set later by the Edict / skill-tree system through:
 *
 *     GM.LiveAudience.setPlayerCutPercent(percent)
 *
 * or through the AudienceSetPlayerCut plugin command. Related API:
 *
 *     GM.LiveAudience.getPlayerCutPercent()
 *     GM.LiveAudience.getPlayerWallet()
 *     GM.LiveAudience.modifyPlayerWallet(amount)
 *     GM.LiveAudience.grantReward(amount, source, meta)
 *
 * grantReward() returns { total, heroineGold, playerCut, cutPercent,
 * source, meta } so callers can report the breakdown rather than only a
 * single number.
 *
 * ============================================================================
 * AI HERO FRAMEWORK BRIDGE
 * ============================================================================
 *
 * If AIH_GM_Livestreamintegration.js (which defines AIH.Livestream) is
 * loaded, this plugin automatically uses it as the authoritative source of
 * the heroine's psychology instead of its own generic internal defaults:
 *
 *     - LA.evaluateRequest(request) delegates to
 *       AIH.Livestream.evaluateRequest(), which reads the heroine's real
 *       AIH.Personality / AIH.Values / AIH.Emotions state, and maps the
 *       result back onto this plugin's normal 0-100 result shape.
 *
 *     - LA.resolveRequest() reports the outcome back to
 *       AIH.Livestream.recordChallengeResult(), so her emotional state and
 *       her relationship with the requesting viewer stay in sync with what
 *       actually happened.
 *
 *     - LA.triggerIncident() reports the incident to
 *       AIH.Livestream.recordEffect().
 *
 * If AIH.Livestream is not present, every one of these falls back to this
 * plugin's own self-contained heroine-adapter model
 * (LA.setHeroineAdapter / LA._getHeroinePersonality), so the plugin still
 * works entirely on its own.
 *
 * Load order: AIH_GM_Livestreamintegration.js should be placed after this
 * file (and after the AIH_* framework files) in the plugin manager so that
 * AIH.Livestream already exists by the time it might be needed. Because
 * every check here is a defensive typeof/existence check performed at call
 * time rather than at load time, the exact order is not actually critical,
 * but this ordering is the recommended one.
 *
 * ============================================================================
 * REQUESTS
 * ============================================================================
 *
 * Requests are things the audience asks the heroine to do.
 *
 * Examples:
 * - Take the left passage.
 * - Fight without a sword.
 * - Use a particular weapon.
 * - Use a particular skill.
 * - Do not heal.
 * - Fight a particular enemy in a particular way.
 *
 * The heroine can:
 * - accept
 * - reject
 * - partially comply
 *
 * Her response is evaluated from:
 * - personality
 * - confidence
 * - pride
 * - modesty
 * - pragmatism
 * - competitiveness
 * - risk tolerance
 * - curiosity
 * - stubbornness
 * - current danger
 * - HP / resources
 * - equipment situation
 * - reward
 * - request type
 * - relationship with the requesting viewer
 * - previous experiences
 *
 * ============================================================================
 * CHALLENGES
 * ============================================================================
 *
 * Challenges are persistent behavioural requests, such as:
 *
 * "No healing this floor."
 * "No weapon this floor."
 * "No equipment this floor."
 *
 * Completing them grants:
 * - money
 * - special rewards
 * - popularity
 * - audience favour
 * - loyalty
 * - fame
 *
 * Refusing or breaking a challenge:
 * - refunds the offered money
 * - applies an escalating penalty
 * - can reduce popularity
 * - increases future audience pressure
 *
 * Challenge pressure persists and becomes more extreme after repeated refusal.
 *
 * ============================================================================
 * INCIDENTS
 * ============================================================================
 *
 * Incidents are NOT requests.
 *
 * The audience can simply cause:
 * - equipment malfunction
 * - wardrobe malfunction
 * - weapon malfunction
 * - temporary blindness
 * - enemy empowerment
 * - equipment disabling
 * - other special complications
 *
 * The heroine does not negotiate these.
 *
 * Her reaction and subsequent behaviour are handled by the heroine AI /
 * personality system through the experience hook.
 *
 * ============================================================================
 * HEROINE ADAPTER
 * ============================================================================
 *
 * Connect the heroine AI using:
 *
 * GM.LiveAudience.setHeroineAdapter({
 *     getPersonality: function() {
 *         return {
 *             confidence: 70,
 *             pride: 60,
 *             modesty: 50,
 *             pragmatism: 70,
 *             competitiveness: 60,
 *             riskTolerance: 55,
 *             curiosity: 60,
 *             stubbornness: 40,
 *             obedience: 30,
 *             greed: 50,
 *             compassion: 70,
 *             resilience: 65
 *         };
 *     },
 *
 *     getSituation: function() {
 *         return {
 *             inBattle: true,
 *             enemyThreat: 80,
 *             hpPercent: 45,
 *             nearbyEnemies: 2,
 *             floor: 3,
 *             danger: 75,
 *             equipmentDifficulty: 50
 *         };
 *     },
 *
 *     applyExperience: function(experience) {
 *         // Feed experience into your heroine personality system.
 *     },
 *
 *     onResponse: function(result) {
 *         // Optional.
 *     },
 *
 *     onIncident: function(incident) {
 *         // Optional.
 *         // Actually apply the gameplay effect here.
 *     }
 * });
 *
 * ============================================================================
 * BASIC EVENT HOOKS
 * ============================================================================
 *
 * GM.LiveAudience.reactTo("battle_start", data);
 * GM.LiveAudience.reactTo("player_win", data);
 * GM.LiveAudience.reactTo("player_loss", data);
 * GM.LiveAudience.reactTo("player_damage", data);
 * GM.LiveAudience.reactTo("boss_appears", data);
 * GM.LiveAudience.reactTo("rare_item", data);
 * GM.LiveAudience.reactTo("embarrassing_event", data);
 * GM.LiveAudience.reactTo("floor_start", data);
 * GM.LiveAudience.reactTo("floor_complete", data);
 *
 * ============================================================================
 * REQUEST API
 * ============================================================================
 *
 * var request = GM.LiveAudience.generateRequest("manual");
 *
 * Resolve:
 *
 * GM.LiveAudience.resolveRequest(request.id, "accept");
 * GM.LiveAudience.resolveRequest(request.id, "reject");
 * GM.LiveAudience.resolveRequest(request.id, "partial");
 *
 * ============================================================================
 * INCIDENT API
 * ============================================================================
 *
 * GM.LiveAudience.triggerIncident("wardrobe_malfunction", {
 *     slot: "armor"
 * });
 *
 * ============================================================================
 * CHAT
 * ============================================================================
 *
 * GM.LiveAudience.addChat("ViewerName", "message", "viewer");
 *
 * Chat types:
 * - viewer
 * - vip
 * - crowd
 * - system
 * - donation
 * - challenge
 *
 * ============================================================================
 * PERSISTENCE
 * ============================================================================
 *
 * All persistent data is stored in:
 *
 * $gameSystem._liveAudience
 *
 * ============================================================================
 */

var GM = GM || {};
GM.LiveAudience = GM.LiveAudience || {};

(function() {

"use strict";

var LA = GM.LiveAudience;

LA.version = "1.0.0";

/* ============================================================================
 * CONFIGURATION
 * ========================================================================== */

LA.Config = {

    maxChatLog: 300,
    maxBehaviorHistory: 150,
    maxActiveViewers: 40,
    crowdViewerCount: 120,

    startingPopularity: 2500,
    startingLewdness: 20,
    startingFame: 0,
    startingAudienceFavor: 0,

    requestCooldownFrames: 180,
    incidentCooldownFrames: 240,

    maxPendingRequests: 5,

    challengeEscalationBase: 1,

    rewardMultiplier: 1,

    /*
     * Percentage (0-100) of every real gold payout that is diverted to the
     * human player's (Dungeon Master's) resource pool instead of the
     * heroine's own gold. Starts at 0 so no cut is taken until a real
     * decision has been made about it. This is intended to be set later by
     * the Edict / skill-tree system through LA.setPlayerCutPercent(), not
     * edited here directly.
     */
    playerCutPercent: 0,

    viewerArchetypes: {

        Supporter: {
            confidence: 35,
            kindness: 90,
            greed: 20,
            competitiveness: 30,
            chaos: 15,
            cruelty: 5,
            humor: 50,
            persistence: 30,
            preferredAgendas: ["confidence", "survival"]
        },

        Challenger: {
            confidence: 80,
            kindness: 40,
            greed: 50,
            competitiveness: 95,
            chaos: 65,
            cruelty: 35,
            humor: 65,
            persistence: 80,
            preferredAgendas: ["combat", "challenge", "confidence"]
        },

        MischiefMaker: {
            confidence: 65,
            kindness: 35,
            greed: 40,
            competitiveness: 55,
            chaos: 95,
            cruelty: 65,
            humor: 95,
            persistence: 70,
            preferredAgendas: ["chaos", "embarrassment"]
        },

        Collector: {
            confidence: 45,
            kindness: 45,
            greed: 85,
            competitiveness: 60,
            chaos: 35,
            cruelty: 20,
            humor: 50,
            persistence: 65,
            preferredAgendas: ["loot", "equipment"]
        },

        Strategist: {
            confidence: 70,
            kindness: 50,
            greed: 55,
            competitiveness: 90,
            chaos: 35,
            cruelty: 15,
            humor: 35,
            persistence: 60,
            preferredAgendas: ["combat", "skill", "efficiency"]
        },

        Daredevil: {
            confidence: 90,
            kindness: 35,
            greed: 45,
            competitiveness: 85,
            chaos: 75,
            cruelty: 40,
            humor: 60,
            persistence: 85,
            preferredAgendas: ["risk", "confidence", "challenge"]
        },

        Tease: {
            confidence: 55,
            kindness: 30,
            greed: 35,
            competitiveness: 40,
            chaos: 75,
            cruelty: 55,
            humor: 90,
            persistence: 65,
            preferredAgendas: ["embarrassment", "lewdness", "chaos"]
        },

        WeaponFan: {
            confidence: 70,
            kindness: 45,
            greed: 45,
            competitiveness: 75,
            chaos: 45,
            cruelty: 25,
            humor: 55,
            persistence: 80,
            preferredAgendas: ["weapon", "combat"]
        },

        FreedomFan: {
            confidence: 65,
            kindness: 55,
            greed: 35,
            competitiveness: 55,
            chaos: 50,
            cruelty: 15,
            humor: 60,
            persistence: 70,
            preferredAgendas: ["freedom", "mobility", "equipment"]
        },

        LoyalFan: {
            confidence: 55,
            kindness: 85,
            greed: 25,
            competitiveness: 35,
            chaos: 25,
            cruelty: 5,
            humor: 65,
            persistence: 55,
            preferredAgendas: ["confidence", "support", "survival"]
        }
    },

    agendaTypes: {

        combat: {
            description: "Wants the heroine to become more capable in combat.",
            preferredRequests: [
                "fight_without_weapon",
                "fight_stronger_enemy",
                "use_offensive_skill",
                "take_dangerous_route"
            ]
        },

        weapon: {
            description: "Wants the heroine to experiment with weapons.",
            preferredRequests: [
                "use_heavy_weapon",
                "use_unfamiliar_weapon",
                "fight_without_weapon"
            ]
        },

        confidence: {
            description: "Wants the heroine to become more confident.",
            preferredRequests: [
                "take_dangerous_route",
                "fight_stronger_enemy",
                "continue_low_hp",
                "accept_handicap"
            ]
        },

        survival: {
            description: "Wants the heroine to survive and become more practical.",
            preferredRequests: [
                "use_healing",
                "discard_weapon_for_healing",
                "take_safe_route"
            ]
        },

        chaos: {
            description: "Wants unpredictable situations.",
            preferredRequests: [
                "take_dangerous_route",
                "fight_without_weapon",
                "use_unfamiliar_weapon"
            ]
        },

        embarrassment: {
            description: "Enjoys difficult or embarrassing situations.",
            preferredRequests: [
                "continue_without_equipment",
                "accept_handicap",
                "wardrobe_request"
            ]
        },

        lewdness: {
            description: "Pushes increasingly special or embarrassing requests.",
            preferredRequests: [
                "wardrobe_request",
                "continue_without_equipment",
                "accept_handicap"
            ]
        },

        challenge: {
            description: "Wants difficult challenges completed.",
            preferredRequests: [
                "no_healing_floor",
                "no_weapon_floor",
                "no_equipment_floor"
            ]
        },

        efficiency: {
            description: "Wants optimal or unconventional combat.",
            preferredRequests: [
                "use_skill",
                "use_unfamiliar_weapon",
                "take_dangerous_route"
            ]
        },

        skill: {
            description: "Wants the heroine to experiment with skills.",
            preferredRequests: [
                "use_skill",
                "use_underused_skill"
            ]
        },

        loot: {
            description: "Wants unusual equipment and rewards.",
            preferredRequests: [
                "use_heavy_weapon",
                "discard_current_weapon",
                "take_dangerous_route"
            ]
        },

        equipment: {
            description: "Wants to manipulate equipment choices.",
            preferredRequests: [
                "use_heavy_weapon",
                "continue_without_equipment",
                "fight_without_weapon"
            ]
        },

        freedom: {
            description: "Wants the heroine to discover that she does not need equipment.",
            preferredRequests: [
                "fight_without_weapon",
                "continue_without_equipment",
                "accept_handicap"
            ]
        },

        mobility: {
            description: "Wants the heroine to become faster and lighter.",
            preferredRequests: [
                "remove_heavy_equipment",
                "fight_without_weapon",
                "continue_without_equipment"
            ]
        },

        risk: {
            description: "Wants increasingly dangerous decisions.",
            preferredRequests: [
                "take_dangerous_route",
                "fight_stronger_enemy",
                "continue_low_hp"
            ]
        },

        support: {
            description: "Wants the heroine to survive.",
            preferredRequests: [
                "use_healing",
                "take_safe_route",
                "accept_help"
            ]
        }
    },

    requestDefinitions: {

        take_left_passage: {
            label: "Take the left passage",
            category: "choice",
            baseReward: 150,
            lewdness: 0,
            danger: 20,
            resistance: 10,
            partialAllowed: false
        },

        take_dangerous_route: {
            label: "Take the dangerous route",
            category: "risk",
            baseReward: 350,
            lewdness: 0,
            danger: 65,
            resistance: 35,
            partialAllowed: false
        },

        take_safe_route: {
            label: "Take the safer route",
            category: "support",
            baseReward: 250,
            lewdness: 0,
            danger: 10,
            resistance: 5,
            partialAllowed: false
        },

        fight_without_weapon: {
            label: "Fight without your weapon",
            category: "weapon",
            baseReward: 500,
            lewdness: 5,
            danger: 45,
            resistance: 35,
            partialAllowed: true
        },

        use_heavy_weapon: {
            label: "Use the oversized weapon",
            category: "weapon",
            baseReward: 450,
            lewdness: 0,
            danger: 35,
            resistance: 25,
            partialAllowed: true
        },

        use_unfamiliar_weapon: {
            label: "Use an unfamiliar weapon",
            category: "weapon",
            baseReward: 400,
            lewdness: 0,
            danger: 30,
            resistance: 20,
            partialAllowed: true
        },

        discard_current_weapon: {
            label: "Discard your current weapon",
            category: "weapon",
            baseReward: 650,
            lewdness: 0,
            danger: 50,
            resistance: 45,
            partialAllowed: false
        },

        continue_without_equipment: {
            label: "Continue without the equipment",
            category: "equipment",
            baseReward: 700,
            lewdness: 15,
            danger: 55,
            resistance: 40,
            partialAllowed: true
        },

        remove_heavy_equipment: {
            label: "Remove the heavy equipment",
            category: "equipment",
            baseReward: 450,
            lewdness: 5,
            danger: 25,
            resistance: 25,
            partialAllowed: true
        },

        accept_handicap: {
            label: "Accept the handicap",
            category: "challenge",
            baseReward: 700,
            lewdness: 10,
            danger: 55,
            resistance: 45,
            partialAllowed: true
        },

        use_healing: {
            label: "Use a healing item",
            category: "survival",
            baseReward: 250,
            lewdness: 0,
            danger: 5,
            resistance: -25,
            partialAllowed: false
        },

        discard_weapon_for_healing: {
            label: "Discard your weapon in exchange for healing",
            category: "survival",
            baseReward: 1000,
            lewdness: 0,
            danger: 10,
            resistance: 35,
            partialAllowed: false
        },

        continue_low_hp: {
            label: "Keep fighting without healing",
            category: "risk",
            baseReward: 750,
            lewdness: 0,
            danger: 80,
            resistance: 55,
            partialAllowed: false
        },

        use_offensive_skill: {
            label: "Use the offensive skill",
            category: "skill",
            baseReward: 300,
            lewdness: 0,
            danger: 10,
            resistance: 10,
            partialAllowed: false
        },

        use_underused_skill: {
            label: "Try the unusual skill",
            category: "skill",
            baseReward: 450,
            lewdness: 0,
            danger: 25,
            resistance: 20,
            partialAllowed: false
        },

        accept_help: {
            label: "Accept the audience's help",
            category: "support",
            baseReward: 200,
            lewdness: 0,
            danger: -20,
            resistance: -20,
            partialAllowed: false
        },

        no_healing_floor: {
            label: "No healing for the rest of this floor",
            category: "challenge",
            challenge: true,
            baseReward: 1500,
            lewdness: 0,
            danger: 55,
            resistance: 45,
            partialAllowed: false
        },

        no_weapon_floor: {
            label: "No weapon for the rest of this floor",
            category: "challenge",
            challenge: true,
            baseReward: 1800,
            lewdness: 5,
            danger: 65,
            resistance: 55,
            partialAllowed: false
        },

        no_equipment_floor: {
            label: "No equipment for the rest of this floor",
            category: "challenge",
            challenge: true,
            baseReward: 2500,
            lewdness: 20,
            danger: 75,
            resistance: 65,
            partialAllowed: false
        },

        wardrobe_request: {
            label: "Leave the wardrobe problem alone",
            category: "special",
            baseReward: 900,
            lewdness: 30,
            danger: 35,
            resistance: 50,
            partialAllowed: true
        }
    },

    incidentDefinitions: {

        wardrobe_malfunction: {
            label: "Wardrobe malfunction",
            category: "equipment",
            lewdness: 10,
            baseSeverity: 2
        },

        weapon_malfunction: {
            label: "Weapon malfunction",
            category: "equipment",
            lewdness: 0,
            baseSeverity: 2
        },

        armor_malfunction: {
            label: "Armor malfunction",
            category: "equipment",
            lewdness: 5,
            baseSeverity: 2
        },

        temporary_blindness: {
            label: "Temporary blindness",
            category: "combat",
            lewdness: 0,
            baseSeverity: 3
        },

        enemy_empowerment: {
            label: "Enemy empowerment",
            category: "combat",
            lewdness: 0,
            baseSeverity: 3
        },

        equipment_disable: {
            label: "Equipment disabled",
            category: "equipment",
            lewdness: 5,
            baseSeverity: 2
        },

        forced_handicap: {
            label: "Audience handicap",
            category: "special",
            lewdness: 10,
            baseSeverity: 3
        }
    },

    crowdMessages: [
        "LOL",
        "NO WAY",
        "🔥🔥🔥",
        "!!!",
        "W",
        "LMAO",
        "RIP",
        "SHE'S COOKING",
        "DO IT",
        "DON'T DO IT",
        "LET HER COOK",
        "THIS IS GOING TO BE GOOD",
        "OH NO",
        "HAHAHAHA",
        "CLUTCH",
        "WHAT",
        "NOOO",
        "BASED",
        "WILD",
        "CHAT"
    ],

    names: [
        "Ari", "Mina", "Rin", "Kio", "Jax", "Luca", "Tess", "Nori",
        "Zed", "Miko", "Vex", "Rae", "Sora", "Nix", "Kai", "Mara",
        "Pip", "Nova", "Echo", "Flux", "Wisp", "Moth", "Rune", "Ash",
        "Vale", "Iris", "Nyx", "Kara", "Vera", "Lio"
    ],

    nameSuffixes: [
        "Byte", "Spark", "Panic", "Nova", "Echo", "Rift", "Moth",
        "Watcher", "Fan", "Main", "Enjoyer", "King", "Girl", "Guy",
        "Prime", "One", "Max", "X", "Live"
    ]
};


/* ============================================================================
 * RUNTIME STATE
 * ========================================================================== */

LA._listeners = {};
LA._heroineAdapter = null;
LA._frame = 0;
LA._lastRequestFrame = -999999;
LA._lastIncidentFrame = -999999;

LA.activeViewers = [];
LA.crowdViewers = [];
LA.chatLog = [];
LA.pendingRequests = [];
LA.activeChallenge = null;
LA.behaviorHistory = [];

LA.popularity = LA.Config.startingPopularity;
LA.lewdness = LA.Config.startingLewdness;
LA.fame = LA.Config.startingFame;
LA.audienceFavor = LA.Config.startingAudienceFavor;

LA.challengeFailureCount = 0;
LA.challengeRefusalCount = 0;
LA.challengeSuccessCount = 0;

/*
 * The human player's (Dungeon Master's) out-of-fiction resource pool.
 * Funded by the playerCutPercent share of real gold payouts. This is
 * separate from $gameParty's gold, which belongs to the heroine.
 */
LA.playerWallet = 0;


/* ============================================================================
 * BASIC UTILITIES
 * ========================================================================== */

LA._clamp = function(value, min, max) {
    return Math.max(min, Math.min(max, value));
};

LA._randomInt = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

LA._pick = function(array) {
    if (!array || !array.length) {
        return null;
    }
    return array[Math.floor(Math.random() * array.length)];
};

LA._chance = function(percent) {
    return Math.random() * 100 < percent;
};

LA._getStorage = function() {
    if (typeof $gameSystem === "undefined") {
        return null;
    }

    if (!$gameSystem._liveAudience) {
        $gameSystem._liveAudience = {};
    }

    return $gameSystem._liveAudience;
};


/* ============================================================================
 * PERSISTENCE
 * ========================================================================== */

LA._save = function() {

    var storage = LA._getStorage();

    if (!storage) {
        return;
    }

    storage.activeViewers = LA.activeViewers;
    storage.crowdViewers = LA.crowdViewers;
    storage.chatLog = LA.chatLog;
    storage.pendingRequests = LA.pendingRequests;
    storage.activeChallenge = LA.activeChallenge;
    storage.behaviorHistory = LA.behaviorHistory;

    storage.popularity = LA.popularity;
    storage.lewdness = LA.lewdness;
    storage.fame = LA.fame;
    storage.audienceFavor = LA.audienceFavor;

    storage.challengeFailureCount = LA.challengeFailureCount;
    storage.challengeRefusalCount = LA.challengeRefusalCount;
    storage.challengeSuccessCount = LA.challengeSuccessCount;

    storage.playerWallet = LA.playerWallet;
    storage.playerCutPercent = LA.Config.playerCutPercent;
};


LA._load = function() {

    var storage = LA._getStorage();

    if (!storage) {
        return false;
    }

    if (!storage.activeViewers) {
        return false;
    }

    LA.activeViewers = storage.activeViewers || [];
    LA.crowdViewers = storage.crowdViewers || [];
    LA.chatLog = storage.chatLog || [];
    LA.pendingRequests = storage.pendingRequests || [];
    LA.activeChallenge = storage.activeChallenge || null;
    LA.behaviorHistory = storage.behaviorHistory || [];

    LA.popularity = typeof storage.popularity === "number" ?
        storage.popularity : LA.Config.startingPopularity;

    LA.lewdness = typeof storage.lewdness === "number" ?
        storage.lewdness : LA.Config.startingLewdness;

    LA.fame = typeof storage.fame === "number" ?
        storage.fame : LA.Config.startingFame;

    LA.audienceFavor = typeof storage.audienceFavor === "number" ?
        storage.audienceFavor : LA.Config.startingAudienceFavor;

    LA.challengeFailureCount = storage.challengeFailureCount || 0;
    LA.challengeRefusalCount = storage.challengeRefusalCount || 0;
    LA.challengeSuccessCount = storage.challengeSuccessCount || 0;

    LA.playerWallet = typeof storage.playerWallet === "number" ?
        storage.playerWallet : 0;

    /*
     * The player-cut percentage is a slow-changing configuration value
     * (driven by Edicts), so it is persisted and restored the same way as
     * any other piece of save data rather than always resetting to the
     * Config default.
     */
    LA.Config.playerCutPercent = typeof storage.playerCutPercent === "number" ?
        storage.playerCutPercent : LA.Config.playerCutPercent;

    return true;
};


LA.initialize = function(force) {

    if (!force && LA._load()) {
        return LA.getState();
    }

    LA.activeViewers = [];
    LA.crowdViewers = [];
    LA.chatLog = [];
    LA.pendingRequests = [];
    LA.activeChallenge = null;
    LA.behaviorHistory = [];

    LA.popularity = LA.Config.startingPopularity;
    LA.lewdness = LA.Config.startingLewdness;
    LA.fame = LA.Config.startingFame;
    LA.audienceFavor = LA.Config.startingAudienceFavor;

    LA.challengeFailureCount = 0;
    LA.challengeRefusalCount = 0;
    LA.challengeSuccessCount = 0;

    LA.playerWallet = 0;

    var i;

    for (i = 0; i < LA.Config.maxActiveViewers; i++) {
        LA.activeViewers.push(LA._createViewer(i));
    }

    for (i = 0; i < LA.Config.crowdViewerCount; i++) {
        LA.crowdViewers.push({
            id: "crowd_" + i,
            name: "Crowd" + (i + 1),
            reactionStyle: LA._pick(LA.Config.crowdMessages)
        });
    }

    LA.addChat("System", "The stream is live.", "system");
    LA.addChat("System", "The audience is watching.", "system");

    LA._save();

    return LA.getState();
};


LA.getState = function() {

    return {
        activeViewers: LA.activeViewers,
        crowdViewers: LA.crowdViewers,
        chatLog: LA.chatLog,
        pendingRequests: LA.pendingRequests,
        activeChallenge: LA.activeChallenge,

        popularity: LA.popularity,
        lewdness: LA.lewdness,
        fame: LA.fame,
        audienceFavor: LA.audienceFavor,

        challengeFailureCount: LA.challengeFailureCount,
        challengeRefusalCount: LA.challengeRefusalCount,
        challengeSuccessCount: LA.challengeSuccessCount,

        playerWallet: LA.playerWallet,
        playerCutPercent: LA.Config.playerCutPercent
    };
};


/* ============================================================================
 * VIEWERS
 * ========================================================================== */

LA._createViewer = function(index) {

    var archetypeNames = Object.keys(LA.Config.viewerArchetypes);
    var archetypeName = archetypeNames[index % archetypeNames.length];
    var profile = LA.Config.viewerArchetypes[archetypeName];

    var personality = {
        confidence: LA._clamp(profile.confidence + LA._randomInt(-15, 15), 0, 100),
        kindness: LA._clamp(profile.kindness + LA._randomInt(-15, 15), 0, 100),
        greed: LA._clamp(profile.greed + LA._randomInt(-15, 15), 0, 100),
        competitiveness: LA._clamp(profile.competitiveness + LA._randomInt(-15, 15), 0, 100),
        chaos: LA._clamp(profile.chaos + LA._randomInt(-15, 15), 0, 100),
        cruelty: LA._clamp(profile.cruelty + LA._randomInt(-15, 15), 0, 100),
        humor: LA._clamp(profile.humor + LA._randomInt(-15, 15), 0, 100),
        persistence: LA._clamp(profile.persistence + LA._randomInt(-15, 15), 0, 100)
    };

    var agendas = profile.preferredAgendas.slice();

    if (Math.random() < 0.45) {
        var agendaNames = Object.keys(LA.Config.agendaTypes);
        var extra = LA._pick(agendaNames);

        if (agendas.indexOf(extra) < 0) {
            agendas.push(extra);
        }
    }

    var viewer = {
        id: "viewer_" + (index + 1),

        name: LA._makeViewerName(index),

        archetype: archetypeName,
        personality: personality,

        agendas: agendas,

        mood: LA._randomInt(40, 85),
        loyalty: LA._randomInt(20, 70),
        attachment: LA._randomInt(5, 35),

        wallet: LA._randomInt(500, 5000),
        totalDonated: 0,
        donationCount: 0,

        vipLevel: 0,

        persistence: LA._clamp(profile.persistence + LA._randomInt(-10, 10), 0, 100),

        preferredIntensity: LA._randomInt(25, 80),

        acceptedRequests: 0,
        rejectedRequests: 0,
        completedChallenges: 0,
        brokenChallenges: 0,

        memory: {
            accepted: [],
            rejected: [],
            completed: [],
            broken: [],
            experiences: []
        },

        agendaProgress: {},

        lastSeen: 0
    };

    /*
     * Some viewers get a stronger primary motivation.
     */
    var primaryAgenda = LA._pick(agendas);

    viewer.primaryAgenda = primaryAgenda;

    return viewer;
};


LA._makeViewerName = function(index) {

    var prefix = LA.Config.names[index % LA.Config.names.length];
    var suffix = LA.Config.nameSuffixes[
        Math.floor(index / LA.Config.names.length) %
        LA.Config.nameSuffixes.length
    ];

    return prefix + suffix;
};


LA.getViewer = function(viewerId) {

    var i;

    for (i = 0; i < LA.activeViewers.length; i++) {
        if (LA.activeViewers[i] &&
            LA.activeViewers[i].id === viewerId) {

            return LA.activeViewers[i];
        }
    }

    return null;
};


/* ============================================================================
 * HEROINE ADAPTER
 * ========================================================================== */

LA.setHeroineAdapter = function(adapter) {

    LA._heroineAdapter = adapter || null;

    return LA._heroineAdapter;
};


LA._getHeroinePersonality = function() {

    if (LA._heroineAdapter &&
        typeof LA._heroineAdapter.getPersonality === "function") {

        return LA._heroineAdapter.getPersonality() || {};
    }

    /*
     * Fallback values make the plugin usable before the actual AI heroine
     * system is connected.
     */
    return {
        confidence: 50,
        pride: 50,
        modesty: 50,
        pragmatism: 50,
        competitiveness: 50,
        riskTolerance: 50,
        curiosity: 50,
        stubbornness: 50,
        obedience: 30,
        greed: 50,
        compassion: 50,
        resilience: 50
    };
};


LA._getHeroineSituation = function(extra) {

    var situation = {};

    if (LA._heroineAdapter &&
        typeof LA._heroineAdapter.getSituation === "function") {

        situation = LA._heroineAdapter.getSituation() || {};
    }

    extra = extra || {};

    var key;

    for (key in extra) {
        if (extra.hasOwnProperty(key)) {
            situation[key] = extra[key];
        }
    }

    if (typeof situation.hpPercent !== "number") {
        situation.hpPercent = 100;
    }

    if (typeof situation.enemyThreat !== "number") {
        situation.enemyThreat = 0;
    }

    if (typeof situation.danger !== "number") {
        situation.danger = situation.enemyThreat;
    }

    if (typeof situation.inBattle !== "boolean") {
        situation.inBattle = false;
    }

    return situation;
};


/* ============================================================================
 * CHAT
 * ========================================================================== */

LA.addChat = function(name, message, type, metadata) {

    var entry = {
        name: name || "Viewer",
        message: message || "",
        type: type || "viewer",
        time: Date.now(),
        metadata: metadata || {}
    };

    LA.chatLog.push(entry);

    if (LA.chatLog.length > LA.Config.maxChatLog) {
        LA.chatLog.splice(
            0,
            LA.chatLog.length - LA.Config.maxChatLog
        );
    }

    LA._save();

    return entry;
};


LA._chatCrowd = function(count) {

    count = count || 1;

    for (var i = 0; i < count; i++) {

        var viewer = LA._pick(LA.crowdViewers);

        if (!viewer) {
            continue;
        }

        LA.addChat(
            viewer.name,
            LA._pick(LA.Config.crowdMessages),
            "crowd"
        );
    }
};


LA._viewerReaction = function(viewer, eventName, data) {

    if (!viewer) {
        return null;
    }

    var p = viewer.personality;
    var message = "";

    if (eventName === "player_win" ||
        eventName === "player_critical") {

        if (p.competitiveness >= 70) {
            message = "THAT WAS CLEAN";
        } else if (p.supportiveness >= 70) {
            message = "YES! YOU GOT IT!";
        } else if (p.humor >= 70) {
            message = "LOL SHE ACTUALLY DID IT";
        } else {
            message = "Nice.";
        }

    } else if (eventName === "player_damage" ||
               eventName === "player_low_hp") {

        if (p.chaos >= 70) {
            message = "OH THIS IS GETTING GOOD";
        } else if (p.kindness >= 70) {
            message = "Careful!";
        } else if (p.cruelty >= 70) {
            message = "HAHAHAHA";
        } else {
            message = "That looked painful.";
        }

    } else if (eventName === "boss_appears") {

        if (p.competitiveness >= 70) {
            message = "NOW THIS IS A FIGHT";
        } else if (p.chaos >= 70) {
            message = "OH NO LOL";
        } else {
            message = "Here we go.";
        }

    } else if (eventName === "embarrassing_event") {

        if (p.humor >= 70) {
            message = "I CANNOT BREATHE";
        } else if (p.kindness >= 70) {
            message = "She'll be okay.";
        } else {
            message = "LOL";
        }

    } else if (eventName === "floor_start") {

        message = "NEW FLOOR";

    } else if (eventName === "floor_complete") {

        message = "SHE CLEARED IT";

    } else {

        message = LA._pick([
            "WHAT",
            "No way",
            "Interesting",
            "Keep going",
            "Let's see what happens",
            "Chat is watching"
        ]);
    }

    return message;
};


/* ============================================================================
 * EVENT SYSTEM
 * ========================================================================== */

LA.onEvent = function(eventName, callback) {

    if (!eventName ||
        typeof callback !== "function") {

        return null;
    }

    LA._listeners[eventName] =
        LA._listeners[eventName] || [];

    LA._listeners[eventName].push(callback);

    return callback;
};


LA._triggerEvent = function(eventName, data) {

    var handlers = LA._listeners[eventName] || [];

    for (var i = 0; i < handlers.length; i++) {

        if (typeof handlers[i] === "function") {
            handlers[i](data);
        }
    }
};


/* ============================================================================
 * GLOBAL AUDIENCE VALUES
 * ========================================================================== */

LA.getCrowdSize = function() {

    var p = LA.popularity;

    if (p < 1000) return 50;
    if (p < 10000) return 90;
    if (p < 40000) return 140;
    if (p < 80000) return 200;

    return 300;
};


LA.getChatIntensity = function() {

    var p = LA.popularity;

    if (p < 1000) return 0.5;
    if (p < 10000) return 1.0;
    if (p < 40000) return 1.8;
    if (p < 80000) return 2.7;

    return 4.0;
};


LA.getDonationChance = function() {

    var p = LA.popularity;

    if (p < 1000) return 0.04;
    if (p < 10000) return 0.10;
    if (p < 40000) return 0.18;
    if (p < 80000) return 0.30;

    return 0.45;
};


/* ============================================================================
 * VIEWER RELATIONSHIP
 * ========================================================================== */

LA._viewerRelationshipModifier = function(viewer) {

    if (!viewer) {
        return 0;
    }

    /*
     * Loyalty and attachment make a familiar viewer's requests easier
     * for the heroine to accept.
     */
    var value = 0;

    value += (viewer.loyalty || 0) * 0.15;
    value += (viewer.attachment || 0) * 0.25;

    /*
     * High donation history makes the heroine more receptive to that viewer.
     */
    value += Math.min(20, (viewer.totalDonated || 0) / 1000);

    /*
     * Repeated successful interactions build familiarity.
     */
    value += Math.min(15,
        ((viewer.acceptedRequests || 0) +
         (viewer.completedChallenges || 0)) * 1.5
    );

    return value;
};


LA._updateViewerRelationship = function(viewer, result) {

    if (!viewer) {
        return;
    }

    if (result === "accept") {

        viewer.acceptedRequests =
            (viewer.acceptedRequests || 0) + 1;

        viewer.loyalty =
            LA._clamp((viewer.loyalty || 0) + 1.5, 0, 100);

        viewer.attachment =
            LA._clamp((viewer.attachment || 0) + 1.0, 0, 100);

    } else if (result === "reject") {

        viewer.rejectedRequests =
            (viewer.rejectedRequests || 0) + 1;

        viewer.attachment =
            LA._clamp((viewer.attachment || 0) - 0.5, 0, 100);

        if (viewer.personality.kindness >= 70) {

            viewer.loyalty =
                LA._clamp((viewer.loyalty || 0) + 0.5, 0, 100);

        } else if (viewer.persistence >= 70) {

            viewer.loyalty =
                LA._clamp((viewer.loyalty || 0) - 0.2, 0, 100);
        }

    } else if (result === "partial") {

        viewer.acceptedRequests =
            (viewer.acceptedRequests || 0) + 1;

        viewer.attachment =
            LA._clamp((viewer.attachment || 0) + 0.5, 0, 100);
    }
};


/* ============================================================================
 * REQUEST SELECTION
 * ========================================================================== */

LA._getPossibleRequestsForViewer = function(viewer) {

    var result = [];
    var i;
    var agenda;
    var definition;

    if (!viewer) {
        return result;
    }

    for (i = 0; i < viewer.agendas.length; i++) {

        agenda = LA.Config.agendaTypes[viewer.agendas[i]];

        if (!agenda) {
            continue;
        }

        for (var j = 0; j < agenda.preferredRequests.length; j++) {

            definition =
                LA.Config.requestDefinitions[
                    agenda.preferredRequests[j]
                ];

            if (definition &&
                result.indexOf(agenda.preferredRequests[j]) < 0) {

                result.push(agenda.preferredRequests[j]);
            }
        }
    }

    return result;
};


LA._selectRequestDefinition = function(viewer, eventName, data) {

    var candidates =
        LA._getPossibleRequestsForViewer(viewer);

    /*
     * Event-specific filtering.
     */
    if (eventName === "battle_start") {

        candidates = candidates.filter(function(id) {
            return [
                "fight_without_weapon",
                "use_heavy_weapon",
                "use_unfamiliar_weapon",
                "continue_without_equipment",
                "accept_handicap",
                "use_offensive_skill",
                "use_underused_skill",
                "continue_low_hp"
            ].indexOf(id) >= 0;
        });

    } else if (eventName === "floor_start") {

        candidates = candidates.filter(function(id) {
            return [
                "no_healing_floor",
                "no_weapon_floor",
                "no_equipment_floor",
                "take_left_passage",
                "take_dangerous_route",
                "take_safe_route"
            ].indexOf(id) >= 0;
        });
    }

    if (!candidates.length) {

        var keys = Object.keys(LA.Config.requestDefinitions);

        candidates = keys.filter(function(id) {

            var d = LA.Config.requestDefinitions[id];

            return !d.challenge ||
                !LA.activeChallenge;
        });
    }

    /*
     * Bias toward the viewer's primary agenda.
     */
    var preferred = [];

    var primary =
        LA.Config.agendaTypes[viewer.primaryAgenda];

    if (primary) {

        for (var i = 0; i < primary.preferredRequests.length; i++) {

            if (candidates.indexOf(primary.preferredRequests[i]) >= 0) {
                preferred.push(primary.preferredRequests[i]);
            }
        }
    }

    if (preferred.length && Math.random() < 0.75) {
        return LA.Config.requestDefinitions[
            LA._pick(preferred)
        ];
    }

    return LA.Config.requestDefinitions[
        LA._pick(candidates)
    ];
};


/* ============================================================================
 * REQUEST CREATION
 * ========================================================================== */

LA._calculateReward = function(definition, viewer) {

    var reward = definition.baseReward || 100;

    reward *= LA.Config.rewardMultiplier;

    /*
     * Wealthier / greedier / more invested viewers offer more.
     */
    reward *= 1 + ((viewer.personality.greed || 0) / 250);

    reward *= 1 + ((viewer.preferredIntensity || 0) / 500);

    /*
     * Existing attachment can cause a viewer to pay more.
     */
    reward *= 1 + ((viewer.attachment || 0) / 500);

    /*
     * Challenge escalation.
     */
    if (definition.challenge) {

        reward *= 1 +
            LA.challengeFailureCount * 0.25;
    }

    reward = Math.round(reward / 10) * 10;

    reward = Math.max(50, reward);

    return reward;
};


LA.generateRequest = function(eventName, data, forcedViewerId) {

    if (!LA.activeViewers.length) {
        LA.initialize();
    }

    if (LA.pendingRequests.length >= LA.Config.maxPendingRequests) {
        return null;
    }

    var viewer = forcedViewerId ?
        LA.getViewer(forcedViewerId) :
        LA._selectRequestingViewer();

    if (!viewer) {
        return null;
    }

    var definition =
        LA._selectRequestDefinition(viewer, eventName, data);

    if (!definition) {
        return null;
    }

    var requestId =
        "request_" + Date.now() + "_" + LA._randomInt(1000, 9999);

    var reward =
        LA._calculateReward(definition, viewer);

    var request = {

        id: requestId,

        viewerId: viewer.id,
        viewerName: viewer.name,

        requestType: definition.challenge ?
            "challenge" : "request",

        definitionId:
            Object.keys(LA.Config.requestDefinitions).find ?
            Object.keys(LA.Config.requestDefinitions).find(function(k) {
                return LA.Config.requestDefinitions[k] === definition;
            }) :
            null,

        label: definition.label,

        category: definition.category,

        reward: reward,

        originalReward: reward,

        lewdness: definition.lewdness || 0,

        danger: definition.danger || 0,

        baseResistance: definition.resistance || 0,

        partialAllowed:
            definition.partialAllowed !== false,

        challenge:
            !!definition.challenge,

        event: eventName || "generic",

        data: data || {},

        createdAt: Date.now(),

        expires: definition.challenge ?
            false : true,

        status: "pending",

        evaluation: null
    };

    /*
     * Challenge is persistent and cannot be replaced by another active
     * challenge.
     */
    if (request.challenge && LA.activeChallenge) {
        return null;
    }

    LA.pendingRequests.push(request);

    LA.addChat(
        viewer.name,
        viewer.name + " donated " +
        reward +
        "G to request: " +
        definition.label,
        "donation",
        {
            requestId: request.id,
            viewerId: viewer.id
        }
    );

    if (request.challenge) {

        LA.addChat(
            "CHAT",
            "CHALLENGE: " +
            definition.label +
            " [" +
            reward +
            "G]",
            "challenge",
            {
                requestId: request.id
            }
        );
    }

    LA._save();

    return request;
};


/* ============================================================================
 * REQUESTING VIEWER SELECTION
 * ========================================================================== */

LA._selectRequestingViewer = function() {

    if (!LA.activeViewers.length) {
        return null;
    }

    /*
     * Weighted selection.
     * Persistent viewers with attachment, loyalty and persistence appear more.
     */
    var pool = [];
    var i;
    var viewer;
    var weight;
    var j;

    for (i = 0; i < LA.activeViewers.length; i++) {

        viewer = LA.activeViewers[i];

        weight =
            10 +
            (viewer.loyalty || 0) * 0.25 +
            (viewer.attachment || 0) * 0.40 +
            (viewer.persistence || 0) * 0.20 +
            (viewer.personality.greed || 0) * 0.10;

        /*
         * High audience lewdness increases chances for viewers whose agenda
         * is actually lewdness/embarrassment.
         */
        if (LA.lewdness > 50 &&
            viewer.agendas.indexOf("lewdness") >= 0) {

            weight += LA.lewdness * 0.5;
        }

        for (j = 0; j < Math.floor(weight); j++) {
            pool.push(viewer);
        }
    }

    return LA._pick(pool);
};


/* ============================================================================
 * HEROINE RESPONSE EVALUATION
 * ========================================================================== */

LA._getPersonalityValue = function(personality, key, fallback) {

    if (typeof personality[key] === "number") {
        return personality[key];
    }

    return fallback;
};


/*
 * Maps an LA request object onto the shape AIH.Livestream.evaluateRequest()
 * expects, calls it, then maps the result back onto LA's own 0-100 result
 * shape so every caller of LA.evaluateRequest() keeps working unchanged
 * regardless of whether AIH is present.
 */
LA._evaluateRequestViaAIH = function(request) {

    var viewer = LA.getViewer(request.viewerId);

    var isHandicap =
        request.category === "weapon" ||
        request.category === "equipment" ||
        request.category === "challenge";

    var lewdFraction =
        LA._clamp((request.lewdness || 0) / 100, 0, 1);

    var mapped = {

        id: request.id,
        type: request.challenge ? "challenge" : "request",
        category: request.category,
        request: request.label,
        severity: request.challenge ? "medium" : "normal",

        reward: request.reward,

        danger: LA._clamp((request.danger || 0) / 100, 0, 1),
        embarrassment: lewdFraction,
        modestyCost: lewdFraction,
        dignityCost: isHandicap ? 0.30 : 0,
        freedomCost:
            (request.category === "equipment" || request.category === "weapon") ?
                0.20 : 0,
        prideCost: isHandicap ? 0.25 : 0,
        survivalBenefit: 0,
        combatAdvantage: 0,

        viewer: viewer ?
            { id: viewer.id, name: viewer.name } :
            null,

        situation: request.data || {}
    };

    var aihResult = AIH.Livestream.evaluateRequest(mapped);

    if (!aihResult) {
        return null;
    }

    var score100 = Math.round(
        LA._clamp(50 + (aihResult.score || 0) * 100, 0, 100)
    );

    var response;
    var attitude;

    if (
        aihResult.response === "accept" ||
        aihResult.response === "reluctant_accept"
    ) {

        response = "accept";

        attitude = (aihResult.response === "accept" && score100 >= 70) ?
            "enthusiastic" :
            (aihResult.response === "accept" ? "willing" : "reluctant");

    } else if (aihResult.response === "partial") {

        response = "partial";
        attitude = "reluctant";

    } else {

        response = "reject";
        attitude = "refusing";
    }

    return {

        score: score100,

        resistance: Math.round(
            LA._clamp((aihResult.resistance || 0) * 100, 0, 100)
        ),

        response: response,

        attitude: attitude,

        immediateDanger: Math.round(request.danger || 0),

        relationshipModifier: Math.round(
            (aihResult.viewerPressure || 0) * 100
        ),

        personality: {

            confidence: Math.round((aihResult.personalityConfidence || 0.5) * 100),
            pride: Math.round((aihResult.pride || 0.5) * 100),
            modesty: Math.round((aihResult.modesty || 0.5) * 100),
            pragmatism: 50,
            competitiveness: 50,
            riskTolerance: 50,
            curiosity: 50,
            stubbornness: 50,
            obedience: 50,
            greed: 50,
            resilience: 50

        },

        source: "AIH.Livestream",

        aih: aihResult
    };
};


LA.evaluateRequest = function(request) {

    if (!request) {
        return null;
    }

    /*
     * When the AI Hero psychology framework is present, its evaluation is
     * authoritative - it reads the heroine's real personality, values and
     * current emotions rather than the generic 50/50 defaults used by the
     * standalone fallback below. The standalone path remains fully intact
     * so this plugin still works on its own if AIH is not loaded.
     */
    if (
        typeof AIH !== "undefined" &&
        AIH.Livestream &&
        typeof AIH.Livestream.evaluateRequest === "function"
    ) {

        var viaAIH = LA._evaluateRequestViaAIH(request);

        if (viaAIH) {
            return viaAIH;
        }
    }

    var personality = LA._getHeroinePersonality();
    var situation = LA._getHeroineSituation(request.data);

    var confidence =
        LA._getPersonalityValue(personality, "confidence", 50);

    var pride =
        LA._getPersonalityValue(personality, "pride", 50);

    var modesty =
        LA._getPersonalityValue(personality, "modesty", 50);

    var pragmatism =
        LA._getPersonalityValue(personality, "pragmatism", 50);

    var competitiveness =
        LA._getPersonalityValue(personality, "competitiveness", 50);

    var riskTolerance =
        LA._getPersonalityValue(personality, "riskTolerance", 50);

    var curiosity =
        LA._getPersonalityValue(personality, "curiosity", 50);

    var stubbornness =
        LA._getPersonalityValue(personality, "stubbornness", 50);

    var obedience =
        LA._getPersonalityValue(personality, "obedience", 30);

    var greed =
        LA._getPersonalityValue(personality, "greed", 50);

    var resilience =
        LA._getPersonalityValue(personality, "resilience", 50);

    var viewer =
        LA.getViewer(request.viewerId);

    var score = 50;

    /*
     * Confidence.
     */
    score += (confidence - 50) * 0.35;

    /*
     * Pride resists deliberate handicaps.
     */
    if (
        request.category === "weapon" ||
        request.category === "equipment" ||
        request.category === "challenge"
    ) {
        score -= (pride - 50) * 0.30;
    }

    /*
     * Modesty resists embarrassing / lewd situations.
     */
    if (
        request.category === "special" ||
        request.lewdness > 0
    ) {
        score -= (modesty - 50) * 0.45;
    }

    /*
     * Pragmatism is extremely important when survival is at stake.
     */
    var danger =
        LA._clamp(
            situation.danger +
            request.danger * 0.45,
            0,
            100
        );

    if (situation.hpPercent < 35) {

        score += pragmatism * 0.35;
        score += (100 - riskTolerance) * 0.15;

    } else {

        score += (pragmatism - 50) * 0.15;
        score += (riskTolerance - 50) * 0.15;
    }

    /*
     * Competitive personalities are more willing to accept challenges.
     */
    if (
        request.category === "challenge" ||
        request.category === "risk" ||
        request.category === "combat"
    ) {
        score += (competitiveness - 50) * 0.30;
    }

    /*
     * Curiosity makes unusual skills/weapons more attractive.
     */
    if (
        request.category === "skill" ||
        request.category === "weapon"
    ) {
        score += (curiosity - 50) * 0.25;
    }

    /*
     * Stubbornness resists the audience.
     */
    score -= stubbornness * 0.18;

    /*
     * Obedience makes requests easier.
     */
    score += obedience * 0.20;

    /*
     * Reward.
     */
    var rewardValue =
        Math.min(35, request.reward / 100);

    score += rewardValue;

    /*
     * Greed.
     */
    score += (greed - 50) * 0.20;

    /*
     * Immediate danger can completely override propriety.
     */
    if (
        situation.hpPercent < 25 &&
        danger > 60
    ) {

        score += pragmatism * 0.25;
        score += resilience * 0.15;

    }

    /*
     * Viewer relationship.
     */
    var relationship =
        LA._viewerRelationshipModifier(viewer);

    score += relationship * 0.50;

    /*
     * Lewdness makes lewd/special requests more normalized for the heroine
     * if she has already been exposed to the audience culture.
     */
    if (request.lewdness > 0) {
        score += LA.lewdness * 0.08;
    }

    /*
     * Existing challenge pressure.
     */
    if (request.challenge) {

        score -= LA.challengeFailureCount * 3;

        /*
         * Strong rewards eventually make the heroine reconsider.
         */
        score += Math.min(
            20,
            request.reward / 250
        );
    }

    score = LA._clamp(score, 0, 100);

    /*
     * Resistance is the inverse of acceptance pressure.
     */
    var resistance =
        LA._clamp(100 - score, 0, 100);

    /*
     * Determine attitude.
     */
    var attitude;

    if (score >= 75) {
        attitude = "enthusiastic";
    } else if (score >= 58) {
        attitude = "willing";
    } else if (score >= 42) {
        attitude = "reluctant";
    } else {
        attitude = "refusing";
    }

    var response;

    if (score >= 65) {
        response = "accept";

    } else if (
        request.partialAllowed &&
        score >= 42
    ) {
        response = "partial";

    } else {
        response = "reject";
    }

    return {

        score: Math.round(score),

        resistance: Math.round(resistance),

        response: response,

        attitude: attitude,

        immediateDanger: Math.round(danger),

        relationshipModifier:
            Math.round(relationship),

        personality: {
            confidence: confidence,
            pride: pride,
            modesty: modesty,
            pragmatism: pragmatism,
            competitiveness: competitiveness,
            riskTolerance: riskTolerance,
            curiosity: curiosity,
            stubbornness: stubbornness,
            obedience: obedience,
            greed: greed,
            resilience: resilience
        }
    };
};


/* ============================================================================
 * REQUEST RESOLUTION
 * ========================================================================== */

LA.resolveRequest = function(requestId, response, options) {

    options = options || {};

    var request = null;
    var requestIndex = -1;

    for (var i = 0; i < LA.pendingRequests.length; i++) {

        if (LA.pendingRequests[i].id === requestId) {

            request = LA.pendingRequests[i];
            requestIndex = i;
            break;
        }
    }

    if (!request) {
        return null;
    }

    if (
        response !== "accept" &&
        response !== "reject" &&
        response !== "partial"
    ) {
        return null;
    }

    if (
        response === "partial" &&
        !request.partialAllowed
    ) {
        response = "reject";
    }

    var evaluation =
        LA.evaluateRequest(request);

    request.evaluation = evaluation;
    request.status = response;
    request.resolvedAt = Date.now();

    var viewer =
        LA.getViewer(request.viewerId);

    var result = {
        request: request,
        response: response,
        evaluation: evaluation,
        reward: 0,
        payout: null,
        penalty: 0,
        experience: null
    };

    if (response === "accept") {

        result.reward = request.reward;
        result.payout = LA._completeRequest(request, viewer, "accept");

        LA._updateViewerRelationship(viewer, "accept");

        result.experience =
            LA._buildExperience(
                request,
                "accepted",
                evaluation
            );

        LA._applyExperience(result.experience);

        LA.addChat(
            request.viewerName,
            "SHE ACCEPTED IT!",
            "viewer",
            { requestId: request.id }
        );

    } else if (response === "partial") {

        result.reward =
            Math.round(request.reward * 0.50);

        result.payout = LA._completeRequest(request, viewer, "partial");

        LA._updateViewerRelationship(viewer, "partial");

        result.experience =
            LA._buildExperience(
                request,
                "partial",
                evaluation
            );

        LA._applyExperience(result.experience);

        LA.addChat(
            request.viewerName,
            "Partial credit. I'll take it.",
            "viewer",
            { requestId: request.id }
        );

    } else {

        if (request.challenge) {

            result.penalty =
                LA._breakChallenge(request, viewer);

        } else {

            LA._rejectRequest(request, viewer);
        }

        LA._updateViewerRelationship(viewer, "reject");

        result.experience =
            LA._buildExperience(
                request,
                "rejected",
                evaluation
            );

        LA._applyExperience(result.experience);

        LA.addChat(
            request.viewerName,
            "She rejected it.",
            "viewer",
            { requestId: request.id }
        );
    }

    /*
     * Feed the outcome back into AIH's psychology layer, if present, so
     * emotions and viewer relationships in AIH.Livestream stay in sync with
     * what actually happened here. This does not affect the response
     * already decided above - it only records the experience.
     */
    if (
        typeof AIH !== "undefined" &&
        AIH.Livestream &&
        typeof AIH.Livestream.recordChallengeResult === "function"
    ) {

        var aihResponse =
            response === "accept" ? "accept" :
            (response === "partial" ? "partial" : "reject");

        AIH.Livestream.recordChallengeResult(
            {
                id: request.id,
                type: request.challenge ? "challenge" : "request",
                category: request.category,
                request: request.label,
                severity: request.challenge ? "medium" : "normal",
                reward: result.reward || 0,
                danger: LA._clamp((request.danger || 0) / 100, 0, 1),
                embarrassment: LA._clamp((request.lewdness || 0) / 100, 0, 1),
                viewer: viewer ? { id: viewer.id, name: viewer.name } : null
            },
            aihResponse,
            { success: true }
        );
    }

    LA._triggerEvent(
        "request_resolved",
        result
    );

    /*
     * Remove ordinary requests after resolution.
     *
     * Challenges remain separately as activeChallenge.
     */
    LA.pendingRequests.splice(requestIndex, 1);

    LA._save();

    return result;
};


/* ============================================================================
 * REQUEST COMPLETION
 * ========================================================================== */

LA._completeRequest = function(request, viewer, mode) {

    var reward = request.reward;

    if (mode === "partial") {
        reward = Math.round(reward * 0.5);
    }

    /*
     * Pay real gold. The heroine's share goes to $gameParty; the player's
     * cut (if any) accumulates in LA.playerWallet.
     */
    var payout = LA.grantReward(
        reward,
        mode === "partial" ? "request_partial" : "request_accept",
        {
            requestId: request.id,
            category: request.category,
            viewerId: viewer ? viewer.id : null
        }
    );

    if (payout.playerCut > 0) {

        LA.addChat(
            "System",
            "Reward: " + payout.heroineGold + "G to the heroine, " +
            payout.playerCut + "G to the Dungeon Master.",
            "system"
        );
    }

    LA.fame += Math.max(
        1,
        Math.round(reward / 250)
    );

    LA.audienceFavor =
        LA._clamp(
            LA.audienceFavor +
            (mode === "partial" ? 1 : 2),
            -100,
            100
        );

    LA.popularity =
        LA._clamp(
            LA.popularity +
            reward / 25,
            0,
            100000
        );

    if (request.lewdness > 0) {

        LA.lewdness =
            LA._clamp(
                LA.lewdness +
                request.lewdness * 0.05,
                0,
                100
            );
    }

    if (viewer) {

        viewer.totalDonated =
            (viewer.totalDonated || 0) + reward;

        viewer.wallet =
            Math.max(
                0,
                (viewer.wallet || 0) - reward
            );

        if (mode === "partial") {

            viewer.agendaProgress[request.category] =
                (viewer.agendaProgress[request.category] || 0) + 0.5;

        } else {

            viewer.agendaProgress[request.category] =
                (viewer.agendaProgress[request.category] || 0) + 1;
        }

        viewer.memory.accepted.push({
            requestId: request.id,
            definitionId: request.definitionId,
            time: Date.now(),
            mode: mode
        });

        if (viewer.memory.accepted.length > 30) {
            viewer.memory.accepted.shift();
        }

        /*
         * Completing requests advances the viewer's agenda.
         */
        if (viewer.primaryAgenda) {

            viewer.agendaProgress[viewer.primaryAgenda] =
                (viewer.agendaProgress[viewer.primaryAgenda] || 0) + 1;
        }
    }

    return payout;
};


/* ============================================================================
 * REQUEST REJECTION
 * ========================================================================== */

LA._rejectRequest = function(request, viewer) {

    LA.popularity =
        LA._clamp(
            LA.popularity - 5,
            0,
            100000
        );

    LA.audienceFavor =
        LA._clamp(
            LA.audienceFavor - 1,
            -100,
            100
        );

    if (viewer) {

        viewer.memory.rejected.push({
            requestId: request.id,
            definitionId: request.definitionId,
            time: Date.now()
        });

        if (viewer.memory.rejected.length > 30) {
            viewer.memory.rejected.shift();
        }

        /*
         * Persistence increases when rejected.
         *
         * This means the same viewer can come back later with a larger reward
         * or a more roundabout request.
         */
        viewer.persistence =
            LA._clamp(
                viewer.persistence + 1,
                0,
                100
            );
    }
};


/* ============================================================================
 * CHALLENGE SYSTEM
 * ========================================================================== */

LA._breakChallenge = function(request, viewer) {

    LA.challengeFailureCount++;
    LA.challengeRefusalCount++;

    /*
     * The original offered money is returned to the viewer.
     * The heroine also pays an escalating penalty.
     */
    var refund =
        request.originalReward || request.reward;

    var penaltyPercent =
        10 +
        LA.challengeFailureCount * 5;

    penaltyPercent =
        Math.min(
            75,
            penaltyPercent
        );

    var penalty =
        Math.round(
            refund * penaltyPercent / 100
        );

    LA.popularity =
        LA._clamp(
            LA.popularity -
            (10 + LA.challengeFailureCount * 5),
            0,
            100000
        );

    LA.audienceFavor =
        LA._clamp(
            LA.audienceFavor -
            (2 + LA.challengeFailureCount * 0.5),
            -100,
            100
        );

    if (viewer) {

        /*
         * Refund goes back to the viewer.
         */
        viewer.wallet =
            (viewer.wallet || 0) +
            refund;

        viewer.brokenChallenges =
            (viewer.brokenChallenges || 0) + 1;

        viewer.memory.broken.push({
            requestId: request.id,
            time: Date.now(),
            penalty: penalty
        });

        if (viewer.memory.broken.length > 30) {
            viewer.memory.broken.shift();
        }

        viewer.persistence =
            LA._clamp(
                viewer.persistence + 3,
                0,
                100
            );
    }

    LA.addChat(
        "System",
        "Challenge broken. " +
        refund +
        "G refunded. Penalty: " +
        penalty +
        "G.",
        "system"
    );

    return penalty;
};


/*
 * Starts an accepted persistent challenge.
 *
 * The gameplay system should call:
 *
 * GM.LiveAudience.completeChallenge()
 *
 * when the floor is completed.
 *
 * If the heroine breaks the condition earlier:
 *
 * GM.LiveAudience.breakActiveChallenge()
 */
LA._startChallenge = function(request, viewer) {

    LA.activeChallenge = {
        requestId: request.id,

        viewerId: request.viewerId,

        viewerName: request.viewerName,

        definitionId: request.definitionId,

        label: request.label,

        reward: request.reward,

        originalReward: request.originalReward,

        startedAt: Date.now(),

        status: "active",

        floor: null,

        progress: 0
    };

    if (LA._getHeroineSituation) {

        var situation =
            LA._getHeroineSituation();

        if (typeof situation.floor !== "undefined") {
            LA.activeChallenge.floor =
                situation.floor;
        }
    }

    if (viewer) {

        viewer.memory.completed.push({
            requestId: request.id,
            event: "started",
            time: Date.now()
        });
    }

    LA.addChat(
        "System",
        "Challenge accepted: " +
        request.label,
        "challenge"
    );

    return LA.activeChallenge;
};


/*
 * Public completion call.
 */
LA.completeChallenge = function() {

    if (!LA.activeChallenge) {
        return null;
    }

    var challenge = LA.activeChallenge;

    var viewer =
        LA.getViewer(challenge.viewerId);

    var reward =
        challenge.reward;

    LA.challengeSuccessCount++;

    /*
     * Pay real gold. The heroine's share goes to $gameParty; the player's
     * cut (if any) accumulates in LA.playerWallet.
     */
    var payout = LA.grantReward(
        reward,
        "challenge_complete",
        {
            requestId: challenge.requestId,
            viewerId: viewer ? viewer.id : null
        }
    );

    if (payout.playerCut > 0) {

        LA.addChat(
            "System",
            "Reward: " + payout.heroineGold + "G to the heroine, " +
            payout.playerCut + "G to the Dungeon Master.",
            "system"
        );
    }

    LA.popularity =
        LA._clamp(
            LA.popularity +
            reward / 15,
            0,
            100000
        );

    LA.fame +=
        Math.max(
            1,
            Math.round(reward / 150)
        );

    LA.audienceFavor =
        LA._clamp(
            LA.audienceFavor + 5,
            -100,
            100
        );

    if (viewer) {

        viewer.completedChallenges =
            (viewer.completedChallenges || 0) + 1;

        viewer.loyalty =
            LA._clamp(
                viewer.loyalty + 4,
                0,
                100
            );

        viewer.attachment =
            LA._clamp(
                viewer.attachment + 3,
                0,
                100
            );

        viewer.totalDonated =
            (viewer.totalDonated || 0) + reward;

        viewer.wallet =
            Math.max(
                0,
                (viewer.wallet || 0) - reward
            );

        viewer.memory.completed.push({
            requestId: challenge.requestId,
            event: "completed",
            time: Date.now()
        });
    }

    LA.addChat(
        challenge.viewerName,
        "SHE COMPLETED THE CHALLENGE!",
        "viewer"
    );

    var experience =
        LA._buildExperience(
            challenge,
            "challenge_completed",
            null
        );

    LA._applyExperience(experience);

    LA._triggerEvent(
        "challenge_completed",
        {
            challenge: challenge,
            reward: reward,
            payout: payout,
            viewer: viewer
        }
    );

    LA.activeChallenge = null;

    LA._save();

    return {
        challenge: challenge,
        reward: reward,
        payout: payout,
        viewer: viewer
    };
};


/*
 * Public break call.
 */
LA.breakActiveChallenge = function(reason) {

    if (!LA.activeChallenge) {
        return null;
    }

    var challenge = LA.activeChallenge;

    var viewer =
        LA.getViewer(challenge.viewerId);

    var refund =
        challenge.originalReward;

    LA.challengeFailureCount++;
    LA.challengeRefusalCount++;

    var penaltyPercent =
        Math.min(
            75,
            10 + LA.challengeFailureCount * 5
        );

    var penalty =
        Math.round(
            refund * penaltyPercent / 100
        );

    LA.popularity =
        LA._clamp(
            LA.popularity -
            (15 + LA.challengeFailureCount * 5),
            0,
            100000
        );

    LA.audienceFavor =
        LA._clamp(
            LA.audienceFavor -
            (3 + LA.challengeFailureCount),
            -100,
            100
        );

    if (viewer) {

        viewer.wallet =
            (viewer.wallet || 0) + refund;

        viewer.brokenChallenges =
            (viewer.brokenChallenges || 0) + 1;

        viewer.persistence =
            LA._clamp(
                viewer.persistence + 5,
                0,
                100
            );

        viewer.memory.broken.push({
            requestId: challenge.requestId,
            event: "broken",
            reason: reason || "unknown",
            time: Date.now(),
            penalty: penalty
        });
    }

    var experience =
        LA._buildExperience(
            challenge,
            "challenge_broken",
            null
        );

    LA._applyExperience(experience);

    LA.addChat(
        "System",
        "Challenge broken. " +
        refund +
        "G refunded. Penalty: " +
        penalty +
        "G.",
        "system"
    );

    LA._triggerEvent(
        "challenge_broken",
        {
            challenge: challenge,
            reason: reason || "unknown",
            refund: refund,
            penalty: penalty
        }
    );

    LA.activeChallenge = null;

    LA._save();

    return {
        challenge: challenge,
        refund: refund,
        penalty: penalty
    };
};


/* ============================================================================
 * EXPERIENCE / BEHAVIOURAL FEEDBACK
 * ========================================================================== */

LA._buildExperience = function(source, outcome, evaluation) {

    var experience = {

        source: source.definitionId ||
                source.requestId ||
                source.id ||
                null,

        category: source.category || "unknown",

        outcome: outcome,

        time: Date.now(),

        intensity:
            source.danger ||
            source.baseSeverity ||
            20,

        positive: outcome === "accepted" ||
                  outcome === "partial" ||
                  outcome === "challenge_completed",

        behaviouralTags: []
    };

    /*
     * Tags are deliberately semantic rather than direct personality edits.
     *
     * The heroine AI can decide how much each experience changes her.
     */
    switch (source.category) {

        case "weapon":
            experience.behaviouralTags.push("weapon_experiment");
            break;

        case "equipment":
            experience.behaviouralTags.push("equipment_independence");
            break;

        case "risk":
            experience.behaviouralTags.push("risk_exposure");
            break;

        case "challenge":
            experience.behaviouralTags.push("challenge_exposure");
            break;

        case "skill":
            experience.behaviouralTags.push("skill_experiment");
            break;

        case "special":
            experience.behaviouralTags.push("embarrassment_exposure");
            break;

        case "survival":
            experience.behaviouralTags.push("pragmatic_choice");
            break;

        case "choice":
            experience.behaviouralTags.push("audience_influence");
            break;
    }

    if (source.lewdness > 0) {
        experience.behaviouralTags.push("audience_exposure");
    }

    if (
        evaluation &&
        evaluation.attitude === "enthusiastic"
    ) {
        experience.behaviouralTags.push("positive_identification");
    }

    if (
        evaluation &&
        evaluation.attitude === "reluctant"
    ) {
        experience.behaviouralTags.push("reluctant_success");
    }

    return experience;
};


LA._applyExperience = function(experience) {

    if (!experience) {
        return;
    }

    LA.behaviorHistory.push(experience);

    if (
        LA.behaviorHistory.length >
        LA.Config.maxBehaviorHistory
    ) {
        LA.behaviorHistory.splice(
            0,
            LA.behaviorHistory.length -
            LA.Config.maxBehaviorHistory
        );
    }

    /*
     * The actual heroine AI gets the experience.
     *
     * This is intentionally not hard-coded into this plugin.
     */
    if (
        LA._heroineAdapter &&
        typeof LA._heroineAdapter.applyExperience === "function"
    ) {

        LA._heroineAdapter.applyExperience(
            experience
        );
    }

    LA._triggerEvent(
        "heroine_experience",
        experience
    );
};


/* ============================================================================
 * INCIDENT SYSTEM
 * ========================================================================== */

LA.triggerIncident = function(type, data) {

    if (!LA.Config.incidentDefinitions[type]) {
        return null;
    }

    var definition =
        LA.Config.incidentDefinitions[type];

    data = data || {};

    var incident = {

        id:
            "incident_" +
            Date.now() +
            "_" +
            LA._randomInt(1000, 9999),

        type: type,

        label: definition.label,

        category: definition.category,

        severity: definition.baseSeverity,

        lewdness:
            definition.lewdness || 0,

        data: data,

        time: Date.now(),

        viewerId: null,

        viewerName: null
    };

    /*
     * A viewer may be responsible for the incident.
     */
    var viewer =
        LA._selectRequestingViewer();

    if (viewer) {

        incident.viewerId = viewer.id;
        incident.viewerName = viewer.name;
    }

    if (incident.lewdness > 0) {

        LA.lewdness =
            LA._clamp(
                LA.lewdness +
                incident.lewdness * 0.10,
                0,
                100
            );
    }

    LA.addChat(
        incident.viewerName || "CHAT",
        "INCIDENT: " + incident.label,
        "donation",
        {
            incidentId: incident.id,
            type: type
        }
    );

    /*
     * Actual gameplay effect is deliberately delegated.
     */
    if (
        LA._heroineAdapter &&
        typeof LA._heroineAdapter.onIncident === "function"
    ) {

        LA._heroineAdapter.onIncident(
            incident
        );
    }

    /*
     * Incident itself becomes a heroine experience.
     */
    var experience = {

        source: incident.id,

        category: incident.category,

        outcome: "incident",

        time: Date.now(),

        intensity: incident.severity * 20,

        positive: false,

        behaviouralTags: [
            "unexpected_event"
        ]
    };

    if (type === "wardrobe_malfunction") {
        experience.behaviouralTags.push(
            "wardrobe_exposure"
        );
    }

    if (type === "armor_malfunction") {
        experience.behaviouralTags.push(
            "equipment_failure"
        );
    }

    if (type === "weapon_malfunction") {
        experience.behaviouralTags.push(
            "weapon_failure"
        );
    }

    if (type === "enemy_empowerment") {
        experience.behaviouralTags.push(
            "pressure"
        );
    }

    LA._applyExperience(experience);

    /*
     * Feed the incident into AIH's psychology layer, if present. Effects
     * are not accepted/rejected - the heroine simply experiences them, so
     * this uses recordEffect() rather than recordChallengeResult().
     */
    if (
        typeof AIH !== "undefined" &&
        AIH.Livestream &&
        typeof AIH.Livestream.recordEffect === "function"
    ) {

        AIH.Livestream.recordEffect(
            {
                id: incident.id,
                type: incident.category,
                category: incident.category,
                request: incident.label,
                severity: "normal",
                embarrassment: LA._clamp((incident.severity || 0) / 5, 0, 1),
                danger: LA._clamp((incident.severity || 0) / 5, 0, 1),
                dignityCost: LA._clamp((incident.lewdness || 0) / 100, 0, 1),
                modestyCost: LA._clamp((incident.lewdness || 0) / 100, 0, 1),
                viewer: incident.viewerId ?
                    { id: incident.viewerId, name: incident.viewerName } :
                    null
            },
            {
                public: true,
                inCombat: !!(data && data.inCombat)
            }
        );
    }

    LA._triggerEvent(
        "incident",
        incident
    );

    LA._save();

    return incident;
};


/* ============================================================================
 * RANDOM INCIDENT GENERATION
 * ========================================================================== */

LA.maybeGenerateIncident = function(eventName, data) {

    if (
        LA._frame -
        LA._lastIncidentFrame <
        LA.Config.incidentCooldownFrames
    ) {
        return null;
    }

    var baseChance = 2;

    /*
     * Higher popularity means more audience interference.
     */
    baseChance +=
        Math.min(
            10,
            LA.popularity / 10000
        );

    /*
     * High lewdness increases special/wardrobe incidents.
     */
    if (LA.lewdness > 60) {
        baseChance += 3;
    }

    /*
     * Combat creates more opportunities for incidents.
     */
    if (eventName === "battle_start" ||
        eventName === "player_damage") {

        baseChance += 5;
    }

    if (!LA._chance(baseChance)) {
        return null;
    }

    var possible;

    if (eventName === "battle_start" ||
        eventName === "player_damage") {

        possible = [
            "weapon_malfunction",
            "armor_malfunction",
            "temporary_blindness",
            "enemy_empowerment",
            "equipment_disable"
        ];

        if (LA.lewdness > 40) {
            possible.push(
                "wardrobe_malfunction"
            );
        }

    } else {

        possible = [
            "equipment_disable",
            "weapon_malfunction"
        ];

        if (LA.lewdness > 50) {
            possible.push(
                "wardrobe_malfunction"
            );
        }
    }

    var type =
        LA._pick(possible);

    LA._lastIncidentFrame =
        LA._frame;

    return LA.triggerIncident(
        type,
        data || {}
    );
};


/* ============================================================================
 * AUTOMATIC REQUEST GENERATION
 * ========================================================================== */

LA._maybeGenerateRequest = function(eventName, data) {

    if (
        LA._frame -
        LA._lastRequestFrame <
        LA.Config.requestCooldownFrames
    ) {
        return null;
    }

    if (
        LA.pendingRequests.length >=
        LA.Config.maxPendingRequests
    ) {
        return null;
    }

    var chance = 12;

    chance +=
        LA.getChatIntensity() * 2;

    if (eventName === "battle_start") {
        chance += 10;
    }

    if (eventName === "boss_appears") {
        chance += 15;
    }

    if (eventName === "rare_item") {
        chance += 10;
    }

    if (eventName === "player_low_hp") {
        chance += 10;
    }

    /*
     * Challenge frequency rises after repeated refusal.
     */
    if (LA.challengeRefusalCount > 0) {
        chance +=
            Math.min(
                20,
                LA.challengeRefusalCount * 2
            );
    }

    if (!LA._chance(chance)) {
        return null;
    }

    LA._lastRequestFrame =
        LA._frame;

    return LA.generateRequest(
        eventName,
        data
    );
};


/* ============================================================================
 * MAIN EVENT ENTRY POINT
 * ========================================================================== */

LA.reactTo = function(eventName, data) {

    if (!LA.activeViewers.length) {
        LA.initialize();
    }

    data = data || {};

    LA._triggerEvent(
        eventName,
        data
    );

    /*
     * Named viewer reactions.
     */
    var viewerCount =
        Math.max(
            2,
            Math.min(
                8,
                Math.floor(
                    LA.getCrowdSize() / 30
                )
            )
        );

    var used = {};

    for (var i = 0; i < viewerCount; i++) {

        var viewer =
            LA._pick(LA.activeViewers);

        if (!viewer) {
            continue;
        }

        if (used[viewer.id]) {
            continue;
        }

        used[viewer.id] = true;

        var message =
            LA._viewerReaction(
                viewer,
                eventName,
                data
            );

        if (message) {

            LA.addChat(
                viewer.name,
                message,
                viewer.vipLevel > 0 ?
                    "vip" :
                    "viewer"
            );

            viewer.lastSeen =
                Date.now();
        }
    }

    /*
     * Crowd spam.
     */
    var spam =
        Math.floor(
            LA.getChatIntensity()
        );

    if (spam > 0) {
        LA._chatCrowd(spam);
    }

    /*
     * Requests and incidents are independent.
     */
    var request =
        LA._maybeGenerateRequest(
            eventName,
            data
        );

    var incident =
        LA.maybeGenerateIncident(
            eventName,
            data
        );

    LA._save();

    return {
        request: request,
        incident: incident
    };
};


/* ============================================================================
 * DONATION API
 * ========================================================================== */

LA.generateDonation = function(amount, viewerId) {

    var viewer =
        viewerId ?
        LA.getViewer(viewerId) :
        LA._selectRequestingViewer();

    if (!viewer) {
        return null;
    }

    var base =
        amount ||
        LA._randomInt(50, 500);

    base *=
        1 +
        viewer.personality.greed / 200;

    base *=
        1 +
        viewer.loyalty / 300;

    base =
        Math.round(base / 10) * 10;

    base =
        Math.max(
            10,
            base
        );

    viewer.wallet =
        Math.max(
            0,
            viewer.wallet - base
        );

    viewer.totalDonated =
        (viewer.totalDonated || 0) + base;

    viewer.donationCount =
        (viewer.donationCount || 0) + 1;

    if (viewer.totalDonated >= 1000) {
        viewer.vipLevel = 1;
    }

    if (viewer.totalDonated >= 10000) {
        viewer.vipLevel = 2;
    }

    if (viewer.totalDonated >= 50000) {
        viewer.vipLevel = 3;
    }

    /*
     * Pay real gold. A donation is money handed directly to the heroine
     * (that is what "donation" means), so it goes through the same
     * heroine/player split as any other reward.
     */
    var payout = LA.grantReward(
        base,
        "donation",
        { viewerId: viewer.id }
    );

    LA.popularity =
        LA._clamp(
            LA.popularity +
            base / 10,
            0,
            100000
        );

    LA.fame +=
        Math.max(
            1,
            Math.floor(base / 500)
        );

    LA.addChat(
        viewer.name,
        "Donated " + base + "G!" +
        (payout.playerCut > 0 ?
            " (" + payout.heroineGold + "G to her, " +
            payout.playerCut + "G to the DM)" :
            ""),
        viewer.vipLevel > 0 ?
            "vip" :
            "donation"
    );

    LA._save();

    return {
        viewer: viewer,
        amount: base,
        payout: payout
    };
};


/* ============================================================================
 * AUTOMATIC DONATION REQUEST
 * ========================================================================== */

LA.maybeGenerateDonationRequest = function() {

    if (
        Math.random() >
        LA.getDonationChance()
    ) {
        return null;
    }

    return LA.generateRequest(
        "audience_activity",
        {}
    );
};


/* ============================================================================
 * FRAME UPDATE
 * ========================================================================== */

LA.update = function() {

    LA._frame++;

    /*
     * Low-frequency spontaneous audience activity.
     */
    if (
        LA._frame % 180 === 0
    ) {

        LA.maybeGenerateDonationRequest();
    }

    /*
     * Slow viewer mood changes.
     */
    if (
        LA._frame % 600 === 0
    ) {

        for (var i = 0;
             i < LA.activeViewers.length;
             i++) {

            var viewer =
                LA.activeViewers[i];

            if (!viewer) {
                continue;
            }

            viewer.mood =
                LA._clamp(
                    viewer.mood +
                    LA._randomInt(-2, 2),
                    0,
                    100
                );

            /*
             * Successful experiences increase attachment.
             */
            if (
                viewer.acceptedRequests > 0 ||
                viewer.completedChallenges > 0
            ) {

                viewer.attachment =
                    LA._clamp(
                        viewer.attachment + 0.1,
                        0,
                        100
                    );
            }
        }

        LA._save();
    }
};


/* ============================================================================
 * POPULARITY / AUDIENCE CONTROL
 * ========================================================================== */

LA.modifyPopularity = function(amount) {

    LA.popularity =
        LA._clamp(
            LA.popularity + amount,
            0,
            100000
        );

    LA._save();

    return LA.popularity;
};


LA.modifyLewdness = function(amount) {

    LA.lewdness =
        LA._clamp(
            LA.lewdness + amount,
            0,
            100
        );

    LA._save();

    return LA.lewdness;
};


LA.modifyFame = function(amount) {

    LA.fame =
        Math.max(
            0,
            LA.fame + amount
        );

    LA._save();

    return LA.fame;
};


LA.modifyAudienceFavor = function(amount) {

    LA.audienceFavor =
        LA._clamp(
            LA.audienceFavor + amount,
            -100,
            100
        );

    LA._save();

    return LA.audienceFavor;
};


/* ============================================================================
 * GOLD / PLAYER CUT
 * ========================================================================== */
//
// This is the single place real gold payouts happen. Every path that pays
// the heroine for audience money (accepted/partial requests, completed
// challenges, donations) routes through LA.grantReward() so the split
// between the heroine and the human player (Dungeon Master) is computed
// and applied consistently exactly once.
//
// LA.Config.playerCutPercent starts at 0 (no cut). It is expected to be
// changed later by the Edict / skill-tree system through
// LA.setPlayerCutPercent(percent) - nothing in this file assumes a
// particular value or timeline for that.
//
// ============================================================================

LA.setPlayerCutPercent = function(percent) {

    LA.Config.playerCutPercent = LA._clamp(
        Number(percent) || 0,
        0,
        100
    );

    LA._save();

    return LA.Config.playerCutPercent;
};


LA.getPlayerCutPercent = function() {

    return LA.Config.playerCutPercent;
};


LA.getPlayerWallet = function() {

    return LA.playerWallet;
};


LA.modifyPlayerWallet = function(amount) {

    LA.playerWallet = Math.max(
        0,
        LA.playerWallet + (Number(amount) || 0)
    );

    LA._save();

    return LA.playerWallet;
};


/*
 * Pays out real gold for an amount of "audience money" the heroine has
 * earned (an accepted request, a completed challenge, a donation, etc).
 *
 * The heroine's share is paid directly into $gameParty's gold. The
 * player's share accumulates in LA.playerWallet, a separate out-of-fiction
 * resource pool for the human Dungeon Master, sized by
 * LA.Config.playerCutPercent.
 *
 * Returns a breakdown object rather than just a number, so callers can
 * report the split (e.g. in chat or in a result object) instead of only
 * knowing the total.
 */
LA.grantReward = function(amount, source, meta) {

    amount = Math.max(0, Math.round(Number(amount) || 0));

    var cutPercent = LA._clamp(LA.Config.playerCutPercent, 0, 100);

    if (amount <= 0) {

        return {
            total: 0,
            heroineGold: 0,
            playerCut: 0,
            cutPercent: cutPercent,
            source: source || "unknown",
            meta: meta || {}
        };
    }

    var playerCut = Math.round(amount * cutPercent / 100);
    var heroineGold = amount - playerCut;

    if (
        typeof $gameParty !== "undefined" &&
        $gameParty &&
        typeof $gameParty.gainGold === "function"
    ) {

        $gameParty.gainGold(heroineGold);
    }

    if (playerCut > 0) {
        LA.playerWallet = Math.max(0, LA.playerWallet + playerCut);
    }

    var payout = {

        total: amount,
        heroineGold: heroineGold,
        playerCut: playerCut,
        cutPercent: cutPercent,
        source: source || "unknown",
        meta: meta || {}

    };

    LA._save();

    LA._triggerEvent("reward_paid", payout);

    return payout;
};


/* ============================================================================
 * QUERY HELPERS
 * ========================================================================== */

LA.getPendingRequests = function() {

    return LA.pendingRequests.slice();
};


LA.getActiveChallenge = function() {

    return LA.activeChallenge;
};


LA.getViewerRelationship = function(viewerId) {

    var viewer =
        LA.getViewer(viewerId);

    if (!viewer) {
        return null;
    }

    return {
        viewerId: viewer.id,
        name: viewer.name,
        loyalty: viewer.loyalty,
        attachment: viewer.attachment,
        totalDonated: viewer.totalDonated,
        acceptedRequests: viewer.acceptedRequests,
        rejectedRequests: viewer.rejectedRequests,
        completedChallenges: viewer.completedChallenges,
        brokenChallenges: viewer.brokenChallenges,
        agendas: viewer.agendas,
        primaryAgenda: viewer.primaryAgenda
    };
};


/* ============================================================================
 * EDCT / OTHER SYSTEM HOOKS
 * ========================================================================== */

/*
 * This deliberately does NOT expose the Edict system to viewers.
 *
 * Other systems can use these methods to modify audience-related mechanics.
 */

LA.setRequestRewardMultiplier = function(value) {

    LA.Config.rewardMultiplier =
        Math.max(
            0,
            Number(value) || 1
        );

    return LA.Config.rewardMultiplier;
};


LA.setRequestCooldown = function(frames) {

    LA.Config.requestCooldownFrames =
        Math.max(
            1,
            Number(frames) || 180
        );

    return LA.Config.requestCooldownFrames;
};


LA.setIncidentCooldown = function(frames) {

    LA.Config.incidentCooldownFrames =
        Math.max(
            1,
            Number(frames) || 240
        );

    return LA.Config.incidentCooldownFrames;
};


/* ============================================================================
 * DEBUG FUNCTIONS
 * ========================================================================== */

LA.debugSpawn = function() {

    LA.initialize(true);

    return LA.getState();
};


LA.debugChat = function(count) {

    count = count || 15;

    for (var i = 0; i < count; i++) {

        LA.addChat(
            "Crowd",
            LA._pick(
                LA.Config.crowdMessages
            ),
            "crowd"
        );
    }

    return LA.chatLog;
};


LA.debugRequest = function() {

    return LA.generateRequest(
        "debug",
        {}
    );
};


LA.debugIncident = function(type) {

    return LA.triggerIncident(
        type ||
        "wardrobe_malfunction",
        {}
    );
};


LA.debugChallenge = function() {

    var possible = [
        "no_healing_floor",
        "no_weapon_floor",
        "no_equipment_floor"
    ];

    var viewer =
        LA._selectRequestingViewer();

    if (!viewer) {
        return null;
    }

    var id =
        LA._pick(possible);

    return LA.generateRequest(
        "debug_challenge",
        {},
        viewer.id
    );
};


/* ============================================================================
 * CHAT WINDOW
 * ========================================================================== */

LA.createChatWindow = function(
    x,
    y,
    width,
    height
) {

    if (
        typeof Window_Base === "undefined"
    ) {
        return null;
    }

    var window =
        new Window_LiveAudienceChat(
            x || 0,
            y || 0,
            width || Graphics.boxWidth,
            height || 240
        );

    return window;
};


function Window_LiveAudienceChat() {

    this.initialize.apply(
        this,
        arguments
    );
}


Window_LiveAudienceChat.prototype =
    Object.create(
        Window_Base.prototype
    );


Window_LiveAudienceChat.prototype.constructor =
    Window_LiveAudienceChat;


Window_LiveAudienceChat.prototype.initialize =
    function(
        x,
        y,
        width,
        height
    ) {

        Window_Base.prototype.initialize.call(
            this,
            new Rectangle(x, y, width, height)
        );

        this._lastLength = -1;

        this.refresh();
    };


Window_LiveAudienceChat.prototype._lineHeight =
    function() {

        return 20;
    };


Window_LiveAudienceChat.prototype._lineCount =
    function() {

        return Math.max(
            1,
            Math.floor(
                (this.height - 24) /
                this._lineHeight()
            )
        );
    };


Window_LiveAudienceChat.prototype._colorForType =
    function(type) {

        if (type === "vip") {
            return this.textColor(14);
        }

        if (type === "donation") {
            return this.textColor(17);
        }

        if (type === "challenge") {
            return this.textColor(6);
        }

        if (type === "system") {
            return this.textColor(16);
        }

        if (type === "crowd") {
            return this.textColor(8);
        }

        return this.normalColor();
    };


Window_LiveAudienceChat.prototype.refresh =
    function() {

        this.contents.clear();

        var lines =
            LA.chatLog || [];

        var count =
            this._lineCount();

        var start =
            Math.max(
                0,
                lines.length - count
            );

        for (
            var i = start;
            i < lines.length;
            i++
        ) {

            var entry =
                lines[i];

            if (!entry) {
                continue;
            }

            this.changeTextColor(
                this._colorForType(
                    entry.type
                )
            );

            var text =
                entry.name +
                ": " +
                entry.message;

            this.drawText(
                text,
                4,
                (i - start) *
                this._lineHeight(),
                this.contentsWidth() - 8,
                this._lineHeight()
            );
        }

        this.resetTextColor();
    };


Window_LiveAudienceChat.prototype.update =
    function() {

        Window_Base.prototype.update.call(
            this
        );

        if (
            LA.chatLog &&
            LA.chatLog.length !==
            this._lastLength
        ) {

            this._lastLength =
                LA.chatLog.length;

            this.refresh();
        }
    };


/* ============================================================================
 * RPG MAKER MZ INTEGRATION
 * ========================================================================== */

if (
    typeof Game_System !== "undefined"
) {

    var _GM_LA_GameSystem_initialize =
        Game_System.prototype.initialize;

    Game_System.prototype.initialize =
        function() {

            _GM_LA_GameSystem_initialize.call(
                this
            );

            this._liveAudience =
                this._liveAudience ||
                {};
        };
}


if (
    typeof Scene_Base !== "undefined"
) {

    var _GM_LA_SceneBase_update =
        Scene_Base.prototype.update;

    Scene_Base.prototype.update =
        function() {

            _GM_LA_SceneBase_update.call(
                this
            );

            LA.update();
        };
}


/* ============================================================================
 * PLUGIN COMMANDS
 * ========================================================================== */
//
// MZ commands are registered through PluginManager.registerCommand so they
// MZ commands are registered through PluginManager.registerCommand so they
// show up in the MZ event editor's Plugin Command picker.
//
// The MZ command names below assume this file is loaded as
// "GM_Liveaudience.js" (matching the @plugindesc name). If the file is
// renamed, update the string passed to PluginManager.registerCommand below
// to match.
//
// ============================================================================

if (
    typeof PluginManager !== "undefined" &&
    typeof PluginManager.registerCommand === "function"
) {

    PluginManager.registerCommand(
        "GM_Liveaudience",
        "AudienceInit",
        function() {
            LA.initialize();
        }
    );

    PluginManager.registerCommand(
        "GM_Liveaudience",
        "AudienceRequest",
        function(args) {

            LA.generateRequest(
                (args && args.eventName) || "plugin_command",
                {}
            );
        }
    );

    PluginManager.registerCommand(
        "GM_Liveaudience",
        "AudienceIncident",
        function(args) {

            LA.triggerIncident(
                (args && args.type) || "wardrobe_malfunction",
                {}
            );
        }
    );

    PluginManager.registerCommand(
        "GM_Liveaudience",
        "AudienceReact",
        function(args) {

            LA.reactTo(
                (args && args.eventName) || "generic",
                {}
            );
        }
    );

    PluginManager.registerCommand(
        "GM_Liveaudience",
        "AudienceChallengeComplete",
        function() {
            LA.completeChallenge();
        }
    );

    PluginManager.registerCommand(
        "GM_Liveaudience",
        "AudienceChallengeBreak",
        function(args) {

            LA.breakActiveChallenge(
                (args && args.reason) || "plugin_command"
            );
        }
    );

    PluginManager.registerCommand(
        "GM_Liveaudience",
        "AudienceSetPlayerCut",
        function(args) {

            LA.setPlayerCutPercent(
                args && args.percent !== undefined ?
                    Number(args.percent) :
                    0
            );
        }
    );
}


/* ============================================================================
 * INITIALIZATION
 * ========================================================================== */
//
// Hooked the same way the AIH_*.js plugins hook DataManager, so that:
//
//   - a brand new game gets a fresh LA state (setupNewGame)
//   - loading a save restores LA's live runtime state from that save's
//     data, instead of leaving whatever was in memory before the load
//     (extractSaveContents)
//   - boot always ends with a valid, initialized LA state
//     (createGameObjects)
//
// This replaces a previous top-level "if ($gameSystem exists) initialize()"
// check that never actually ran, because plugin scripts are evaluated
// before $gameSystem exists.
//
// ============================================================================

if (
    typeof DataManager !== "undefined"
) {

    var _GM_LA_DataManager_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _GM_LA_DataManager_createGameObjects.call(
            this
        );

        LA.initialize();
    };

    var _GM_LA_DataManager_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _GM_LA_DataManager_setupNewGame.call(
            this
        );

        LA.initialize(true);
    };

    var _GM_LA_DataManager_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(contents) {

        _GM_LA_DataManager_extractSaveContents.call(
            this,
            contents
        );

        LA.initialize();
    };
}


/* ============================================================================
 * CORE REGISTRATION
 * ========================================================================== */

GM.Core = GM.Core || {};

GM.Core.register =
    GM.Core.register ||
    function() {};

GM.Core.register(
    "GM_LivestreamAudience",
    LA.version
);

})();