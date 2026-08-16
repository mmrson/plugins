/*:
 * @plugindesc AI Hero Framework - Event System v0.5.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - EVENT SYSTEM
 * ============================================================================
 *
 * STEP 5
 *
 * Provides the central event bus for the AI Hero framework.
 *
 * The event system allows independent modules to communicate without
 * becoming tightly coupled to each other.
 *
 * ============================================================================
 *
 * EXAMPLES
 *
 * AIH.Events.emit(
 *     "COMBAT_RESULT",
 *     {
 *         result: "victory"
 *     }
 * );
 *
 * Another module can listen:
 *
 * AIH.Events.on(
 *     "COMBAT_RESULT",
 *     function(event) {
 *         // Handle event.
 *     }
 * );
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This system transports events.
 *
 * It does NOT decide:
 *
 * - whether an event is important
 * - what caused an event
 * - what the hero believes
 * - what the hero should do
 *
 * ============================================================================
 *
 * @param Maximum Event History
 * @text Maximum Event History
 * @type number
 * @min 10
 * @default 200
 *
 * @command Show History
 * @text Show Event History
 * @desc Displays recent event history.
 *
 * @command Clear History
 * @text Clear Event History
 * @desc Clears the event history.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Events = AIH.Events || {};

    AIH.Events.VERSION = "0.5.0";

    AIH.Events._initialized = false;

    AIH.Events._listeners = {};

    AIH.Events._history = [];

    AIH.Events._sequence = 0;

    AIH.Events.Config = AIH.Events.Config || {};

    AIH.Events.Config.maxHistory = 200;

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    AIH.Events.Config.setup = function() {

        var parameters;
        var value;

        parameters =
            PluginManager.parameters("AIH_Event");

        if (!parameters) {
            return;
        }

        value =
            parameters["Maximum Event History"];

        if (value !== undefined) {

            value = Number(value);

            if (!isNaN(value) && value >= 10) {

                AIH.Events.Config.maxHistory =
                    value;
            }
        }
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    AIH.Events.initialize = function() {

        if (AIH.Events._initialized) {
            return;
        }

        AIH.Events.Config.setup();

        AIH.Events._listeners = {};

        AIH.Events._history = [];

        AIH.Events._sequence = 0;

        AIH.Events._initialized = true;

        AIH.Debug.log(
            "Event system initialized."
        );
    };

    // =========================================================================
    // NORMALIZE EVENT NAME
    // =========================================================================

    AIH.Events._normalizeName = function(name) {

        if (name === undefined ||
            name === null) {

            return "";
        }

        return String(name).trim();
    };

    // =========================================================================
    // CREATE EVENT RECORD
    // =========================================================================

    AIH.Events._createRecord = function(
        name,
        data
    ) {

        AIH.Events._sequence += 1;

        return {
            eventId:
                AIH.Events._sequence,

            timestamp:
                Date.now(),

            name:
                AIH.Events._normalizeName(name),

            data:
                AIH.Events._copy(data || {})
        };
    };

    // =========================================================================
    // DEEP COPY
    // =========================================================================

    AIH.Events._copy = function(value) {

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
    // REGISTER LISTENER
    // =========================================================================

    AIH.Events.on = function(
        name,
        callback
    ) {

        var normalizedName;

        normalizedName =
            AIH.Events._normalizeName(name);

        if (!normalizedName) {
            return null;
        }

        if (typeof callback !== "function") {
            return null;
        }

        if (!AIH.Events._listeners[normalizedName]) {

            AIH.Events._listeners[normalizedName] = [];
        }

        AIH.Events._listeners[normalizedName].push(
            callback
        );

        return callback;
    };

    // =========================================================================
    // REGISTER ONCE LISTENER
    // =========================================================================

    AIH.Events.once = function(
        name,
        callback
    ) {

        var wrapper;

        if (typeof callback !== "function") {
            return null;
        }

        wrapper = function(event) {

            AIH.Events.off(
                name,
                wrapper
            );

            callback(event);
        };

        AIH.Events.on(
            name,
            wrapper
        );

        return wrapper;
    };

    // =========================================================================
    // REMOVE LISTENER
    // =========================================================================

    AIH.Events.off = function(
        name,
        callback
    ) {

        var normalizedName;
        var listeners;
        var index;

        normalizedName =
            AIH.Events._normalizeName(name);

        listeners =
            AIH.Events._listeners[normalizedName];

        if (!listeners) {
            return false;
        }

        index =
            listeners.indexOf(callback);

        if (index < 0) {
            return false;
        }

        listeners.splice(
            index,
            1
        );

        if (listeners.length === 0) {

            delete AIH.Events._listeners[
                normalizedName
            ];
        }

        return true;
    };

    // =========================================================================
    // EMIT EVENT
    // =========================================================================

    AIH.Events.emit = function(
        name,
        data
    ) {

        var event;
        var listeners;
        var copy;
        var i;

        event =
            AIH.Events._createRecord(
                name,
                data
            );

        AIH.Events._history.push(
            event
        );

        AIH.Events._trimHistory();

        listeners =
            AIH.Events._listeners[
                event.name
            ];

        if (!listeners) {

            return AIH.Events._copy(
                event
            );
        }

        copy =
            listeners.slice();

        for (i = 0; i < copy.length; i++) {

            try {

                copy[i](
                    AIH.Events._copy(event)
                );

            } catch (error) {

                AIH.Debug.error(
                    "Error in event listener for " +
                    event.name +
                    ": " +
                    String(error)
                );
            }
        }

        return AIH.Events._copy(
            event
        );
    };

    // =========================================================================
    // TRIM HISTORY
    // =========================================================================

    AIH.Events._trimHistory = function() {

        var excess;

        excess =
            AIH.Events._history.length -
            AIH.Events.Config.maxHistory;

        if (excess <= 0) {
            return;
        }

        AIH.Events._history.splice(
            0,
            excess
        );
    };

    // =========================================================================
    // HISTORY
    // =========================================================================

    AIH.Events.history = function(limit) {

        var history;
        var start;

        history =
            AIH.Events._history;

        if (
            limit === undefined ||
            limit === null
        ) {

            return AIH.Events._copy(
                history
            );
        }

        limit =
            Number(limit);

        if (isNaN(limit) ||
            limit < 1) {

            return [];
        }

        start =
            Math.max(
                0,
                history.length - limit
            );

        return AIH.Events._copy(
            history.slice(start)
        );
    };

    // =========================================================================
    // HISTORY COUNT
    // =========================================================================

    AIH.Events.historyCount = function() {

        return AIH.Events._history.length;
    };

    // =========================================================================
    // CLEAR HISTORY
    // =========================================================================

    AIH.Events.clearHistory = function() {

        AIH.Events._history = [];

        AIH.Debug.log(
            "Event history cleared."
        );
    };

    // =========================================================================
    // CLEAR LISTENERS
    // =========================================================================

    AIH.Events.clearListeners = function(
        name
    ) {

        var normalizedName;

        if (
            name === undefined ||
            name === null
        ) {

            AIH.Events._listeners = {};

            return;
        }

        normalizedName =
            AIH.Events._normalizeName(name);

        delete AIH.Events._listeners[
            normalizedName
        ];
    };

    // =========================================================================
    // LISTENER COUNT
    // =========================================================================

    AIH.Events.listenerCount = function(
        name
    ) {

        var normalizedName;
        var listeners;

        normalizedName =
            AIH.Events._normalizeName(name);

        listeners =
            AIH.Events._listeners[
                normalizedName
            ];

        if (!listeners) {
            return 0;
        }

        return listeners.length;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Events",
        {
            version:
                AIH.Events.VERSION,

            initialize: function() {
                AIH.Events.initialize();
            },

            emit: function(
                name,
                data
            ) {

                return AIH.Events.emit(
                    name,
                    data
                );
            },

            on: function(
                name,
                callback
            ) {

                return AIH.Events.on(
                    name,
                    callback
                );
            },

            off: function(
                name,
                callback
            ) {

                return AIH.Events.off(
                    name,
                    callback
                );
            },

            history: function(limit) {
                return AIH.Events.history(limit);
            }
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - SHOW HISTORY
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Event",
        "Show History",
        function() {

            AIH.Debug.inspect(
                "AIH Event History:",
                AIH.Events.history()
            );
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - CLEAR HISTORY
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Event",
        "Clear History",
        function() {

            AIH.Events.clearHistory();
        }
    );

    // =========================================================================
    // RPG MAKER INITIALIZATION
    // =========================================================================

    var _AIH_Event_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_Event_createGameObjects.call(this);

        AIH.Events.initialize();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Event_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_Event_setupNewGame.call(this);

        AIH.Events.initialize();
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Event_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(contents) {

        _AIH_Event_extractSaveContents.call(
            this,
            contents
        );

        AIH.Events.initialize();
    };

})();