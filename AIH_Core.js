/*:
 * @plugindesc AI Hero Framework - Core Foundation v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - CORE
 * ============================================================================
 *
 * RPG Maker MZ
 *
 * This plugin is the foundation of the autonomous AI Hero system.
 *
 * STEP 1 FEATURES:
 *
 * - Global AIH namespace
 * - Framework configuration
 * - Central AI state
 * - Module registration
 * - Event bus
 * - Event history
 * - Debug logging
 * - Basic framework initialization
 * - Plugin command for testing
 *
 * This module intentionally does NOT implement:
 *
 * - Personality
 * - Values
 * - Emotions
 * - Memory
 * - Beliefs
 * - Hypotheses
 * - Decision making
 * - Ollama
 * - Dungeon graph
 * - Autonomous movement
 * - Combat AI
 *
 * Those systems will be added in later steps.
 *
 * ============================================================================
 *
 * PLUGIN COMMANDS
 *
 * Test Event
 *     Emits a test event through the AIH event system.
 *
 * Clear Event History
 *     Clears the current AIH event history.
 *
 * ============================================================================
 *
 * IMPORTANT DESIGN RULE
 *
 * RPG Maker owns game reality.
 *
 * AIH will eventually interpret game state and produce intentions, but
 * AIH must never directly bypass RPG Maker's game rules.
 *
 * ============================================================================
 *
 * @param Debug Enabled
 * @text Debug Enabled
 * @type boolean
 * @on Enabled
 * @off Disabled
 * @default true
 *
 * @param Event History Limit
 * @text Event History Limit
 * @type number
 * @min 0
 * @default 100
 *
 * @param Log Prefix
 * @text Log Prefix
 * @type string
 * @default [AIH]
 *
 * @command Test Event
 * @text Test Event
 * @desc Emits a test event through the AIH event system.
 *
 * @arg Event Name
 * @text Event Name
 * @type string
 * @default AIH_TEST_EVENT
 *
 * @command Clear Event History
 * @text Clear Event History
 * @desc Clears the AIH event history.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // BASIC INFORMATION
    // =========================================================================

    AIH.VERSION = "0.1.0";
    AIH.NAME = "AI Hero Framework";

    // =========================================================================
    // INTERNAL INITIALIZATION FLAG
    // =========================================================================

    AIH._initialized = false;

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    AIH.Config = AIH.Config || {};

    AIH.Config.debugEnabled = true;
    AIH.Config.eventHistoryLimit = 100;
    AIH.Config.logPrefix = "[AIH]";

    AIH.Config.setup = function() {
        var parameters;
        var value;

        parameters = PluginManager.parameters("AIH_Core");

        if (parameters) {

            value = parameters["Debug Enabled"];

            if (value !== undefined) {
                AIH.Config.debugEnabled = String(value) === "true";
            }

            value = parameters["Event History Limit"];

            if (value !== undefined) {
                AIH.Config.eventHistoryLimit = Number(value);

                if (isNaN(AIH.Config.eventHistoryLimit)) {
                    AIH.Config.eventHistoryLimit = 100;
                }

                if (AIH.Config.eventHistoryLimit < 0) {
                    AIH.Config.eventHistoryLimit = 0;
                }
            }

            value = parameters["Log Prefix"];

            if (value !== undefined && String(value).length > 0) {
                AIH.Config.logPrefix = String(value);
            }
        }
    };

    // =========================================================================
    // DEBUG / LOGGING
    // =========================================================================

    AIH.Debug = AIH.Debug || {};

    AIH.Debug.log = function(message) {
        if (!AIH.Config.debugEnabled) {
            return;
        }

        console.log(
            AIH.Config.logPrefix +
            " " +
            String(message)
        );
    };

    AIH.Debug.warn = function(message) {
        if (!AIH.Config.debugEnabled) {
            return;
        }

        console.warn(
            AIH.Config.logPrefix +
            " " +
            String(message)
        );
    };

    AIH.Debug.error = function(message) {
        console.error(
            AIH.Config.logPrefix +
            " " +
            String(message)
        );
    };

    AIH.Debug.inspect = function(label, value) {
        if (!AIH.Config.debugEnabled) {
            return;
        }

        console.log(
            AIH.Config.logPrefix +
            " " +
            String(label),
            value
        );
    };

    // =========================================================================
    // CENTRAL STATE
    // =========================================================================

    /*
     * AIH.State contains framework-level state.
     *
     * It deliberately does NOT attempt to duplicate the entire RPG Maker
     * game state.
     *
     * Later modules will add their own state structures.
     */

    AIH.State = AIH.State || {};

    AIH.State.reset = function() {

        AIH.State.initialized = false;

        AIH.State.processing = false;

        AIH.State.currentIntent = null;

        AIH.State.currentReasoningTrigger = null;

        AIH.State.lastEventId = 0;

        AIH.State.sessionId = 0;

        AIH.State.initializedAt = 0;
    };

    AIH.State.reset();

    // =========================================================================
    // MODULE REGISTRY
    // =========================================================================

    AIH.Modules = AIH.Modules || {};

    AIH.Modules._registry = {};

    /*
     * Register a framework module.
     *
     * Example for future modules:
     *
     * AIH.Modules.register(
     *     "Memory",
     *     {
     *         initialize: function() {},
     *         update: function() {}
     *     }
     * );
     */

    AIH.Modules.register = function(name, moduleObject) {

        if (!name) {
            AIH.Debug.error(
                "Cannot register module without a name."
            );

            return false;
        }

        if (!moduleObject) {
            AIH.Debug.error(
                "Cannot register module '" +
                String(name) +
                "' without a module object."
            );

            return false;
        }

        if (AIH.Modules._registry[name]) {
            AIH.Debug.warn(
                "Module '" +
                String(name) +
                "' is already registered. Registration rejected."
            );

            return false;
        }

        AIH.Modules._registry[name] = moduleObject;

        AIH.Debug.log(
            "Module registered: " +
            String(name)
        );

        return true;
    };

    AIH.Modules.get = function(name) {

        if (!AIH.Modules._registry[name]) {
            return null;
        }

        return AIH.Modules._registry[name];
    };

    AIH.Modules.has = function(name) {

        return !!AIH.Modules._registry[name];
    };

    AIH.Modules.list = function() {

        var result = [];
        var name;

        for (name in AIH.Modules._registry) {

            if (AIH.Modules._registry.hasOwnProperty(name)) {
                result.push(name);
            }
        }

        return result;
    };

    // =========================================================================
    // EVENT SYSTEM
    // =========================================================================

    AIH.Events = AIH.Events || {};

    AIH.Events._listeners = {};
    AIH.Events._history = [];

    /*
     * Event object format:
     *
     * {
     *     id: Number,
     *     name: String,
     *     timestamp: Number,
     *     data: Object
     * }
     *
     * Events intentionally contain observations/data.
     *
     * They should not contain developer-authored causal conclusions.
     */

    AIH.Events.on = function(eventName, callback) {

        if (!eventName) {
            AIH.Debug.error(
                "Cannot subscribe to an event without a name."
            );

            return false;
        }

        if (typeof callback !== "function") {
            AIH.Debug.error(
                "Event listener for '" +
                String(eventName) +
                "' must be a function."
            );

            return false;
        }

        if (!AIH.Events._listeners[eventName]) {
            AIH.Events._listeners[eventName] = [];
        }

        AIH.Events._listeners[eventName].push(callback);

        return true;
    };

    AIH.Events.off = function(eventName, callback) {

        var listeners;
        var i;

        listeners = AIH.Events._listeners[eventName];

        if (!listeners) {
            return false;
        }

        for (i = listeners.length - 1; i >= 0; i--) {

            if (listeners[i] === callback) {
                listeners.splice(i, 1);
                return true;
            }
        }

        return false;
    };

    AIH.Events.emit = function(eventName, data) {

        var eventObject;
        var listeners;
        var listenersCopy;
        var i;

        if (!eventName) {
            AIH.Debug.error(
                "Cannot emit an event without a name."
            );

            return null;
        }

        AIH.State.lastEventId += 1;

        eventObject = {
            id: AIH.State.lastEventId,
            name: String(eventName),
            timestamp: Date.now(),
            data: data || {}
        };

        AIH.Events._storeEvent(eventObject);

        AIH.Debug.inspect(
            "Event emitted:",
            eventObject
        );

        listeners = AIH.Events._listeners[eventName];

        if (listeners && listeners.length > 0) {

            /*
             * Copy the array before executing listeners.
             *
             * This prevents a listener that subscribes/unsubscribes during
             * execution from corrupting the current dispatch cycle.
             */

            listenersCopy = listeners.slice();

            for (i = 0; i < listenersCopy.length; i++) {

                try {

                    listenersCopy[i](eventObject);

                } catch (error) {

                    AIH.Debug.error(
                        "Error while processing event '" +
                        String(eventName) +
                        "': " +
                        String(error)
                    );
                }
            }
        }

        return eventObject;
    };

    AIH.Events._storeEvent = function(eventObject) {

        var limit;

        limit = AIH.Config.eventHistoryLimit;

        if (limit <= 0) {
            return;
        }

        AIH.Events._history.push(eventObject);

        while (AIH.Events._history.length > limit) {
            AIH.Events._history.shift();
        }
    };

    AIH.Events.history = function() {

        return AIH.Events._history.slice();
    };

    AIH.Events.clearHistory = function() {

        AIH.Events._history.length = 0;

        AIH.Debug.log(
            "Event history cleared."
        );
    };

    AIH.Events.listenerCount = function(eventName) {

        if (!AIH.Events._listeners[eventName]) {
            return 0;
        }

        return AIH.Events._listeners[eventName].length;
    };

    // =========================================================================
    // FRAMEWORK INITIALIZATION
    // =========================================================================

    AIH.initialize = function() {

        if (AIH._initialized) {
            AIH.Debug.warn(
                "AIH.initialize() was called more than once. Ignoring."
            );

            return;
        }

        AIH.Config.setup();

        AIH.State.reset();

        AIH.State.sessionId = Date.now();

        AIH.State.initializedAt = Date.now();

        AIH.State.initialized = true;

        AIH._initialized = true;

        AIH.Debug.log(
            "=========================================="
        );

        AIH.Debug.log(
            AIH.NAME +
            " v" +
            AIH.VERSION
        );

        AIH.Debug.log(
            "Core initialized."
        );

        AIH.Debug.log(
            "Event history limit: " +
            String(AIH.Config.eventHistoryLimit)
        );

        AIH.Debug.log(
            "Debug enabled: " +
            String(AIH.Config.debugEnabled)
        );

        AIH.Debug.log(
            "=========================================="
        );
    };

    // =========================================================================
    // FRAMEWORK RESET
    // =========================================================================

    AIH.reset = function() {

        AIH.Debug.log(
            "Resetting AIH framework state."
        );

        AIH.Events.clearHistory();

        AIH.State.reset();

        AIH.State.sessionId = Date.now();

        AIH.State.initializedAt = Date.now();

        AIH.State.initialized = true;

        AIH.Debug.log(
            "AIH framework state reset."
        );
    };

    // =========================================================================
    // TEST SUPPORT
    // =========================================================================

    AIH.Test = AIH.Test || {};

    AIH.Test.emitTestEvent = function(eventName) {

        var eventData;

        eventData = {
            source: "AIH_Core",
            test: true,
            message: "This is a Step 1 test event."
        };

        return AIH.Events.emit(
            eventName || "AIH_TEST_EVENT",
            eventData
        );
    };

    AIH.Test.getStatus = function() {

        return {
            name: AIH.NAME,
            version: AIH.VERSION,
            initialized: AIH._initialized,
            sessionId: AIH.State.sessionId,
            eventCount: AIH.Events.history().length,
            modules: AIH.Modules.list()
        };
    };

    // =========================================================================
    // RPG MAKER MZ PLUGIN COMMANDS
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Core",
        "Test Event",
        function(args) {

            var eventName;

            eventName = args["Event Name"];

            if (!eventName) {
                eventName = "AIH_TEST_EVENT";
            }

            AIH.Test.emitTestEvent(eventName);
        }
    );

    PluginManager.registerCommand(
        "AIH_Core",
        "Clear Event History",
        function() {

            AIH.Events.clearHistory();
        }
    );

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    /*
     * DataManager.createGameObjects() occurs when a new game is created or
     * a save is loaded.
     *
     * We initialize the framework when the RPG Maker game objects exist.
     */

    var _DataManager_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _DataManager_createGameObjects.call(this);

        AIH.initialize();
    };

    // =========================================================================
    // SAVE / LOAD PREPARATION
    // =========================================================================

    /*
     * Step 1 deliberately does not yet serialize AI state into save files.
     *
     * The save system will be implemented as its own module later.
     *
     * These functions simply provide a clearly defined interface for that
     * future module.
     */

    AIH.Save = AIH.Save || {};

    AIH.Save.makeData = function() {

        return {
            version: AIH.VERSION
        };
    };

    AIH.Save.extractData = function(data) {

        if (!data) {
            return;
        }

        AIH.Debug.log(
            "AIH save data received."
        );
    };

    // =========================================================================
    // INITIAL MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Core",
        {
            version: AIH.VERSION,

            initialize: function() {
                AIH.Debug.log(
                    "Core module initialize hook."
                );
            },

            status: function() {
                return AIH.Test.getStatus();
            }
        }
    );

})();