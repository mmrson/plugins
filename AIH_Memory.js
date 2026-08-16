/*:
 * @plugindesc AI Hero Framework - Persistent Episodic Memory v0.8.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - PERSISTENT EPISODIC MEMORY
 * ============================================================================
 *
 * STEP 8
 *
 * Stores experiences observed by the AI Hero.
 *
 * Memory stores events and observations.
 *
 * Memory does NOT:
 *
 * - determine causality
 * - create beliefs
 * - create hypotheses
 * - change personality
 * - change values
 * - change emotions
 * - make decisions
 * - call an LLM
 * - execute actions
 *
 * ============================================================================
 *
 * DESIGN PRINCIPLE
 *
 * Memory records WHAT happened.
 *
 * It does not decide WHY it happened.
 *
 * ============================================================================
 *
 * PERSISTENCE
 *
 * Memory is stored inside AIH.State, which itself is stored inside
 * Game_System and therefore included in RPG Maker MZ save files.
 *
 * ============================================================================
 *
 * @param Maximum Episodic Memories
 * @text Maximum Episodic Memories
 * @type number
 * @min 10
 * @default 500
 *
 * @param Working Memory Size
 * @text Working Memory Size
 * @type number
 * @min 1
 * @default 20
 *
 * @param Default Importance
 * @text Default Importance
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.50
 *
 * @command Capture
 * @text Capture Memory
 * @desc Captures the current perception as a memory episode.
 *
 * @command Show Recent
 * @text Show Recent Memories
 * @desc Displays recent memories in the console.
 *
 * @command Show All
 * @text Show All Memories
 * @desc Displays all stored memories in the console.
 *
 * @command Clear
 * @text Clear Memories
 * @desc Clears all AI episodic memories.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Memory = AIH.Memory || {};

    AIH.Memory.VERSION = "0.8.0";

    AIH.Memory._initialized = false;

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    AIH.Memory.Config = AIH.Memory.Config || {};

    AIH.Memory.Config.maxEpisodes = 500;

    AIH.Memory.Config.workingMemorySize = 20;

    AIH.Memory.Config.defaultImportance = 0.50;

    // =========================================================================
    // CONFIGURATION SETUP
    // =========================================================================

    AIH.Memory.Config.setup = function() {

        var parameters;
        var value;

        parameters =
            PluginManager.parameters("AIH_Memory");

        if (!parameters) {
            return;
        }

        value =
            parameters["Maximum Episodic Memories"];

        if (value !== undefined) {

            value = Number(value);

            if (!isNaN(value) && value >= 10) {

                AIH.Memory.Config.maxEpisodes =
                    Math.floor(value);
            }
        }

        value =
            parameters["Working Memory Size"];

        if (value !== undefined) {

            value = Number(value);

            if (!isNaN(value) && value >= 1) {

                AIH.Memory.Config.workingMemorySize =
                    Math.floor(value);
            }
        }

        value =
            parameters["Default Importance"];

        if (value !== undefined) {

            value = Number(value);

            if (!isNaN(value)) {

                if (value < 0) {
                    value = 0;
                }

                if (value > 1) {
                    value = 1;
                }

                AIH.Memory.Config.defaultImportance =
                    value;
            }
        }
    };

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Memory._copy = function(value) {

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
    // CLAMP
    // =========================================================================

    AIH.Memory._clamp01 = function(value) {

        value = Number(value);

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

    // =========================================================================
    // GET PERSISTENT STATE
    // =========================================================================

    AIH.Memory._state = function() {

        if (
            !AIH.State ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    // =========================================================================
    // ENSURE MEMORY CONTAINER
    // =========================================================================

    AIH.Memory._ensure = function() {

        var state;
        var memory;

        state =
            AIH.Memory._state();

        if (!state) {

            AIH.Debug.error(
                "AIH.Memory requires AIH.State."
            );

            return null;
        }

        if (!state.memory) {

            state.memory = {

                sequence: 0,

                episodes: [],

                workingMemory: []
            };
        }

        memory =
            state.memory;

        if (
            typeof memory.sequence !== "number" ||
            isNaN(memory.sequence) ||
            memory.sequence < 0
        ) {

            memory.sequence = 0;
        }

        if (
            !Array.isArray(
                memory.episodes
            )
        ) {

            memory.episodes = [];
        }

        if (
            !Array.isArray(
                memory.workingMemory
            )
        ) {

            memory.workingMemory = [];
        }

        return memory;
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    AIH.Memory.initialize = function() {

        var memory;

        AIH.Memory.Config.setup();

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return false;
        }

        AIH.Memory._trimWorkingMemory();

        AIH.Memory._trimEpisodes();

        AIH.Memory._initialized = true;

        AIH.Debug.log(
            "Persistent episodic memory initialized."
        );

        return true;
    };

    // =========================================================================
    // NEXT ID
    // =========================================================================

    AIH.Memory._nextId = function() {

        var memory;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return 0;
        }

        memory.sequence += 1;

        return memory.sequence;
    };

    // =========================================================================
    // CREATE EPISODE
    // =========================================================================

    AIH.Memory.createEpisode = function(
        episodeType,
        observations,
        options
    ) {

        var episode;
        var importance;

        options = options || {};

        importance =
            options.importance !== undefined
                ? options.importance
                : AIH.Memory.Config.defaultImportance;

        episode = {

            memoryId:
                AIH.Memory._nextId(),

            timestamp:
                Date.now(),

            episodeType:
                String(
                    episodeType || "observation"
                ),

            importance:
                AIH.Memory._clamp01(
                    importance
                ),

            observations:
                AIH.Memory._copy(
                    observations || []
                ),

            context:
                AIH.Memory._copy(
                    options.context || {}
                ),

            outcome:
                AIH.Memory._copy(
                    options.outcome || null
                )
        };

        return episode;
    };

    // =========================================================================
    // STORE EPISODE
    // =========================================================================

    AIH.Memory.store = function(episode) {

        var memory;
        var stored;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return null;
        }

        if (!episode) {
            return null;
        }

        stored =
            AIH.Memory._copy(
                episode
            );

        memory.episodes.push(
            stored
        );

        memory.workingMemory.push(
            stored
        );

        AIH.Memory._trimWorkingMemory();

        AIH.Memory._trimEpisodes();

        if (
            AIH.State &&
            AIH.State.incrementExperiences
        ) {

            AIH.State.incrementExperiences();
        }

        if (
            AIH.Events &&
            AIH.Events.emit
        ) {

            AIH.Events.emit(
                "MEMORY_STORED",
                {
                    memory:
                        AIH.Memory._copy(
                            stored
                        )
                }
            );
        }

        return AIH.Memory._copy(
            stored
        );
    };

    // =========================================================================
    // TRIM WORKING MEMORY
    // =========================================================================

    AIH.Memory._trimWorkingMemory = function() {

        var memory;
        var excess;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return;
        }

        excess =
            memory.workingMemory.length -
            AIH.Memory.Config.workingMemorySize;

        if (excess <= 0) {
            return;
        }

        memory.workingMemory.splice(
            0,
            excess
        );
    };

    // =========================================================================
    // TRIM EPISODIC MEMORY
    // =========================================================================

    AIH.Memory._trimEpisodes = function() {

        var memory;
        var excess;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return;
        }

        excess =
            memory.episodes.length -
            AIH.Memory.Config.maxEpisodes;

        if (excess <= 0) {
            return;
        }

        memory.episodes.splice(
            0,
            excess
        );
    };

    // =========================================================================
    // CAPTURE CURRENT PERCEPTION
    // =========================================================================

    AIH.Memory.capture = function(
        episodeType,
        options
    ) {

        var observations;
        var episode;

        if (
            !AIH.Perception ||
            !AIH.Perception.current
        ) {

            AIH.Debug.error(
                "AIH.Memory.capture requires AIH.Perception."
            );

            return null;
        }

        observations =
            AIH.Perception.current();

        episode =
            AIH.Memory.createEpisode(
                episodeType || "observation",
                observations,
                options || {}
            );

        return AIH.Memory.store(
            episode
        );
    };

    // =========================================================================
    // RECENT MEMORIES
    // =========================================================================

    AIH.Memory.recent = function(limit) {

        var memory;
        var result;
        var start;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return [];
        }

        limit =
            Number(limit);

        if (
            isNaN(limit) ||
            limit < 1
        ) {

            limit =
                AIH.Memory.Config.workingMemorySize;
        }

        limit =
            Math.floor(limit);

        result =
            memory.workingMemory;

        start =
            Math.max(
                0,
                result.length - limit
            );

        return AIH.Memory._copy(
            result.slice(start)
        );
    };

    // =========================================================================
    // ALL MEMORIES
    // =========================================================================

    AIH.Memory.all = function() {

        var memory;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return [];
        }

        return AIH.Memory._copy(
            memory.episodes
        );
    };

    // =========================================================================
    // MEMORY COUNT
    // =========================================================================

    AIH.Memory.count = function() {

        var memory;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return 0;
        }

        return memory.episodes.length;
    };

    // =========================================================================
    // WORKING MEMORY COUNT
    // =========================================================================

    AIH.Memory.workingCount = function() {

        var memory;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return 0;
        }

        return memory.workingMemory.length;
    };

    // =========================================================================
    // FIND BY EPISODE TYPE
    // =========================================================================

    AIH.Memory.findByType = function(
        episodeType
    ) {

        var memory;
        var result;
        var i;
        var episode;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return [];
        }

        result = [];

        for (
            i = 0;
            i < memory.episodes.length;
            i++
        ) {

            episode =
                memory.episodes[i];

            if (
                episode.episodeType ===
                episodeType
            ) {

                result.push(
                    episode
                );
            }
        }

        return AIH.Memory._copy(
            result
        );
    };

    // =========================================================================
    // FIND BY IMPORTANCE
    // =========================================================================

    AIH.Memory.findImportant = function(
        minimumImportance
    ) {

        var memory;
        var result;
        var i;
        var episode;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return [];
        }

        minimumImportance =
            AIH.Memory._clamp01(
                minimumImportance
            );

        result = [];

        for (
            i = 0;
            i < memory.episodes.length;
            i++
        ) {

            episode =
                memory.episodes[i];

            if (
                episode.importance >=
                minimumImportance
            ) {

                result.push(
                    episode
                );
            }
        }

        return AIH.Memory._copy(
            result
        );
    };

    // =========================================================================
    // FIND BY MEMORY ID
    // =========================================================================

    AIH.Memory.get = function(memoryId) {

        var memory;
        var i;
        var episode;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return null;
        }

        memoryId =
            Number(memoryId);

        if (isNaN(memoryId)) {
            return null;
        }

        for (
            i = 0;
            i < memory.episodes.length;
            i++
        ) {

            episode =
                memory.episodes[i];

            if (
                episode.memoryId ===
                memoryId
            ) {

                return AIH.Memory._copy(
                    episode
                );
            }
        }

        return null;
    };

    // =========================================================================
    // FIND BY EVENT TYPE
    // =========================================================================

    AIH.Memory.findByEvent = function(
        eventType
    ) {

        var memory;
        var result;
        var i;
        var episode;
        var observation;
        var j;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return [];
        }

        result = [];

        for (
            i = 0;
            i < memory.episodes.length;
            i++
        ) {

            episode =
                memory.episodes[i];

            if (
                !Array.isArray(
                    episode.observations
                )
            ) {
                continue;
            }

            for (
                j = 0;
                j < episode.observations.length;
                j++
            ) {

                observation =
                    episode.observations[j];

                if (
                    observation &&
                    observation.type ===
                    eventType
                ) {

                    result.push(
                        episode
                    );

                    break;
                }
            }
        }

        return AIH.Memory._copy(
            result
        );
    };

    // =========================================================================
    // CLEAR
    // =========================================================================

    AIH.Memory.clear = function() {

        var memory;

        memory =
            AIH.Memory._ensure();

        if (!memory) {
            return false;
        }

        memory.episodes = [];

        memory.workingMemory = [];

        memory.sequence = 0;

        if (
            AIH.Events &&
            AIH.Events.emit
        ) {

            AIH.Events.emit(
                "MEMORY_CLEARED",
                {}
            );
        }

        AIH.Debug.log(
            "AI episodic memory cleared."
        );

        return true;
    };

    // =========================================================================
    // CAPTURE EVENT HELPER
    // =========================================================================

    /*
     * Records a supplied game event as RAW observation data.
     *
     * It does not explain the event.
     *
     * It does not determine causality.
     *
     * It does not create a hypothesis.
     */

    AIH.Memory.recordEvent = function(
        eventType,
        eventData,
        options
    ) {

        var observations;
        var episode;

        observations = [

            {
                observationId:
                    AIH.Memory._nextId(),

                timestamp:
                    Date.now(),

                source:
                    "game_event",

                category:
                    "event",

                type:
                    String(
                        eventType || "unknown"
                    ),

                data:
                    AIH.Memory._copy(
                        eventData || {}
                    )
            }

        ];

        episode =
            AIH.Memory.createEpisode(
                "event",
                observations,
                options || {}
            );

        return AIH.Memory.store(
            episode
        );
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Memory",
        {
            version:
                AIH.Memory.VERSION,

            initialize: function() {
                AIH.Memory.initialize();
            },

            capture: function(
                episodeType,
                options
            ) {

                return AIH.Memory.capture(
                    episodeType,
                    options
                );
            },

            recent: function(limit) {
                return AIH.Memory.recent(limit);
            },

            all: function() {
                return AIH.Memory.all();
            }
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - CAPTURE
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Memory",
        "Capture",
        function() {

            AIH.Memory.capture(
                "manual_capture"
            );
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - SHOW RECENT
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Memory",
        "Show Recent",
        function() {

            AIH.Debug.inspect(
                "Recent AI memories:",
                AIH.Memory.recent()
            );
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - SHOW ALL
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Memory",
        "Show All",
        function() {

            AIH.Debug.inspect(
                "All AI memories:",
                AIH.Memory.all()
            );
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - CLEAR
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Memory",
        "Clear",
        function() {

            AIH.Memory.clear();
        }
    );

    // =========================================================================
    // CREATE GAME OBJECTS
    // =========================================================================

    var _AIH_Memory_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_Memory_createGameObjects.call(this);

        AIH.Memory._initialized = false;
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Memory_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_Memory_setupNewGame.call(this);

        AIH.Memory._initialized = false;

        AIH.Memory.initialize();

        /*
         * The first memory is an initial observation.
         *
         * It records the starting state.
         *
         * It does NOT explain anything about that state.
         */

        AIH.Memory.capture(
            "new_game_start",
            {
                importance: 0.60,

                context: {
                    reason: "new_game"
                }
            }
        );
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Memory_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(
        contents
    ) {

        _AIH_Memory_extractSaveContents.call(
            this,
            contents
        );

        AIH.Memory._initialized = false;

        AIH.Memory.initialize();
    };

})();