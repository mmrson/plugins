/*:
 * @plugindesc AI Hero Framework - Persistent AI State v0.7.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - PERSISTENT AI STATE
 * ============================================================================
 *
 * STEP 7
 *
 * Provides the persistent state container for the autonomous AI hero.
 *
 * The state is stored inside Game_System so RPG Maker MZ automatically
 * includes it in save files.
 *
 * ============================================================================
 *
 * CURRENT STATE
 *
 * identity
 *     Stable identity information for the AI hero.
 *
 * personality
 *     Reserved for the future personality module.
 *
 * values
 *     Reserved for the future values/morality module.
 *
 * emotions
 *     Reserved for the future emotional-state module.
 *
 * beliefs
 *     Reserved for the future belief system.
 *
 * hypotheses
 *     Reserved for the future causal-hypothesis system.
 *
 * reputation
 *     Reserved for the future reputation system.
 *
 * learning
 *     Reserved for future learning/decision systems.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This module stores state.
 *
 * It does NOT:
 *
 * - make decisions
 * - interpret experiences
 * - create beliefs
 * - modify personality
 * - call the LLM
 * - execute actions
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.State = AIH.State || {};

    AIH.State.VERSION = "0.7.0";

    AIH.State.SCHEMA_VERSION = 1;

    AIH.State._initialized = false;

    // =========================================================================
    // DEFAULT STATE
    // =========================================================================

    AIH.State.createDefault = function() {

        return {

            schemaVersion:
                AIH.State.SCHEMA_VERSION,

            identity: {

                actorId: 0,

                name: "",

                createdAt: Date.now(),

                age: null,

                background: "",

                notes: []
            },

            personality: {},

            values: {},

            emotions: {},

            beliefs: {},

            hypotheses: {},

            reputation: {},

            learning: {

                experiments: [],

                decisions: [],

                outcomes: []
            },

            metadata: {

                totalDecisions: 0,

                totalExperiences: 0,

                lastUpdated: Date.now()
            }
        };
    };

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.State._copy = function(value) {

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

    // =========================================================================
    // GET GAME STATE
    // =========================================================================

    AIH.State._getGameState = function() {

        if (
            typeof $gameSystem === "undefined" ||
            !$gameSystem
        ) {

            return null;
        }

        return $gameSystem._aihState || null;
    };

    // =========================================================================
    // CREATE STATE IF NECESSARY
    // =========================================================================

    AIH.State._ensure = function() {

        var state;

        if (
            typeof $gameSystem === "undefined" ||
            !$gameSystem
        ) {

            return null;
        }

        state =
            $gameSystem._aihState;

        if (!state) {

            state =
                AIH.State.createDefault();

            $gameSystem._aihState =
                state;
        }

        AIH.State._migrate(state);

        return state;
    };

    // =========================================================================
    // MIGRATION
    // =========================================================================

    AIH.State._migrate = function(state) {

        var defaults;

        if (!state) {
            return;
        }

        defaults =
            AIH.State.createDefault();

        if (
            state.schemaVersion === undefined ||
            state.schemaVersion < 1
        ) {

            state.schemaVersion = 1;
        }

        if (!state.identity) {
            state.identity = defaults.identity;
        }

        if (!state.personality) {
            state.personality = {};
        }

        if (!state.values) {
            state.values = {};
        }

        if (!state.emotions) {
            state.emotions = {};
        }

        if (!state.beliefs) {
            state.beliefs = {};
        }

        if (!state.hypotheses) {
            state.hypotheses = {};
        }

        if (!state.reputation) {
            state.reputation = {};
        }

        if (!state.learning) {
            state.learning =
                defaults.learning;
        }

        if (!state.learning.experiments) {
            state.learning.experiments = [];
        }

        if (!state.learning.decisions) {
            state.learning.decisions = [];
        }

        if (!state.learning.outcomes) {
            state.learning.outcomes = [];
        }

        if (!state.metadata) {
            state.metadata =
                defaults.metadata;
        }

        if (
            state.metadata.totalDecisions ===
            undefined
        ) {

            state.metadata.totalDecisions = 0;
        }

        if (
            state.metadata.totalExperiences ===
            undefined
        ) {

            state.metadata.totalExperiences = 0;
        }

        if (
            state.metadata.lastUpdated ===
            undefined
        ) {

            state.metadata.lastUpdated =
                Date.now();
        }

        state.metadata.lastUpdated =
            Date.now();
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.State.initialize = function() {

        if (
            typeof $gameSystem === "undefined" ||
            !$gameSystem
        ) {

            return;
        }

        AIH.State._ensure();

        AIH.State._initialized = true;

        AIH.Debug.log(
            "Persistent AI state initialized."
        );
    };

    // =========================================================================
    // GET COMPLETE STATE
    // =========================================================================

    AIH.State.get = function() {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return null;
        }

        return AIH.State._copy(
            state
        );
    };

    // =========================================================================
    // GET DIRECT INTERNAL STATE
    // =========================================================================

    /*
     * Internal systems can use this when they need to modify persistent state.
     *
     * This function is intentionally not used by the LLM.
     */

    AIH.State._internal = function() {

        return AIH.State._ensure();
    };

    // =========================================================================
    // GET PROPERTY
    // =========================================================================

    AIH.State.getProperty = function(
        section,
        key
    ) {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return undefined;
        }

        if (!state[section]) {
            return undefined;
        }

        return AIH.State._copy(
            state[section][key]
        );
    };

    // =========================================================================
    // SET PROPERTY
    // =========================================================================

    AIH.State.setProperty = function(
        section,
        key,
        value
    ) {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return false;
        }

        if (!state[section]) {
            state[section] = {};
        }

        state[section][key] =
            AIH.State._copy(value);

        state.metadata.lastUpdated =
            Date.now();

        return true;
    };

    // =========================================================================
    // SET IDENTITY
    // =========================================================================

    AIH.State.setIdentity = function(
        data
    ) {

        var state;
        var key;

        state =
            AIH.State._ensure();

        if (!state) {
            return false;
        }

        data =
            data || {};

        for (key in data) {

            if (
                Object.prototype.hasOwnProperty.call(
                    data,
                    key
                )
            ) {

                state.identity[key] =
                    AIH.State._copy(
                        data[key]
                    );
            }
        }

        state.metadata.lastUpdated =
            Date.now();

        return true;
    };

    // =========================================================================
    // ACTOR ID
    // =========================================================================

    AIH.State.setActorId = function(
        actorId
    ) {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return false;
        }

        actorId =
            Number(actorId);

        if (isNaN(actorId)) {
            return false;
        }

        state.identity.actorId =
            actorId;

        state.metadata.lastUpdated =
            Date.now();

        return true;
    };

    AIH.State.actorId = function() {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return 0;
        }

        return Number(
            state.identity.actorId || 0
        );
    };

    // =========================================================================
    // IDENTITY NAME
    // =========================================================================

    AIH.State.setName = function(
        name
    ) {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return false;
        }

        state.identity.name =
            String(name || "");

        state.metadata.lastUpdated =
            Date.now();

        return true;
    };

    AIH.State.name = function() {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return "";
        }

        return String(
            state.identity.name || ""
        );
    };

    // =========================================================================
    // INCREMENT EXPERIENCE COUNT
    // =========================================================================

    AIH.State.incrementExperiences = function(
        amount
    ) {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return 0;
        }

        amount =
            Number(amount);

        if (
            isNaN(amount) ||
            amount === 0
        ) {

            amount = 1;
        }

        state.metadata.totalExperiences +=
            amount;

        state.metadata.lastUpdated =
            Date.now();

        return state.metadata.totalExperiences;
    };

    // =========================================================================
    // INCREMENT DECISION COUNT
    // =========================================================================

    AIH.State.incrementDecisions = function(
        amount
    ) {

        var state;

        state =
            AIH.State._ensure();

        if (!state) {
            return 0;
        }

        amount =
            Number(amount);

        if (
            isNaN(amount) ||
            amount === 0
        ) {

            amount = 1;
        }

        state.metadata.totalDecisions +=
            amount;

        state.metadata.lastUpdated =
            Date.now();

        return state.metadata.totalDecisions;
    };

    // =========================================================================
    // ADD LEARNING RECORD
    // =========================================================================

    AIH.State.addLearningRecord = function(
        category,
        record
    ) {

        var state;
        var list;

        state =
            AIH.State._ensure();

        if (!state) {
            return false;
        }

        if (
            !state.learning[category] ||
            !Array.isArray(
                state.learning[category]
            )
        ) {

            state.learning[category] = [];
        }

        list =
            state.learning[category];

        list.push(
            AIH.State._copy(record)
        );

        state.metadata.lastUpdated =
            Date.now();

        return true;
    };

    // =========================================================================
    // RESET
    // =========================================================================

    AIH.State.reset = function() {

        if (
            typeof $gameSystem === "undefined" ||
            !$gameSystem
        ) {

            return false;
        }

        $gameSystem._aihState =
            AIH.State.createDefault();

        AIH.State._initialized = true;

        AIH.Debug.log(
            "Persistent AI state reset."
        );

        return true;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "State",
        {
            version:
                AIH.State.VERSION,

            initialize: function() {
                AIH.State.initialize();
            },

            get: function() {
                return AIH.State.get();
            }
        }
    );

    // =========================================================================
    // GAME SYSTEM INITIALIZATION
    // =========================================================================

    var _AIH_State_Game_System_initialize =
        Game_System.prototype.initialize;

    Game_System.prototype.initialize = function() {

        _AIH_State_Game_System_initialize.call(this);

        this._aihState =
            AIH.State.createDefault();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_State_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_State_setupNewGame.call(this);

        AIH.State.initialize();
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_State_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(contents) {

        _AIH_State_extractSaveContents.call(
            this,
            contents
        );

        AIH.State.initialize();
    };

})();