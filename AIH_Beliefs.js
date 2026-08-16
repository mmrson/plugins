/*:
 * @plugindesc AI Hero Framework - Belief System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - BELIEF SYSTEM
 * ============================================================================
 *
 * STEP 12
 *
 * Stores beliefs learned by the AI Hero from experience.
 *
 * A belief is an interpretation or expectation about the world.
 *
 * Examples:
 *
 *     "The southern route is dangerous."
 *     "This merchant is usually reliable."
 *     "Traps are common in this dungeon."
 *     "Heavy equipment may interfere with mobility."
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * Beliefs are NOT facts.
 *
 * A belief contains a confidence level and may be wrong.
 *
 * The belief system does NOT determine whether a belief is actually true.
 *
 * ============================================================================
 *
 * BELIEF STRUCTURE
 *
 * id
 * proposition
 * confidence
 * category
 * sourceReliability
 * supportingEvidence
 * contradictingEvidence
 * createdAt
 * updatedAt
 * updateCount
 *
 * ============================================================================
 *
 * SOURCE RELIABILITY
 *
 * The heroine can also learn beliefs about sources of information.
 *
 * Example:
 *
 *     "Adventurer Marcus is reliable."
 *
 * This allows the AI to learn that some rumors and NPC reports should be
 * trusted more than others.
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - determine causality
 * - create hypotheses
 * - make decisions
 * - modify personality
 * - modify values
 * - modify emotions
 * - call the LLM
 * - execute actions
 *
 * It stores and updates learned beliefs.
 *
 * ============================================================================
 *
 * @command Show
 * @text Show Beliefs
 * @desc Displays all current beliefs.
 *
 * @command Clear
 * @text Clear Beliefs
 * @desc Clears all beliefs.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Beliefs = AIH.Beliefs || {};

    AIH.Beliefs.VERSION = "0.1.0";

    AIH.Beliefs.SCHEMA_VERSION = 1;

    AIH.Beliefs._initialized = false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Beliefs._copy = function(value) {

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

    AIH.Beliefs._clamp01 = function(value) {

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

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================

    AIH.Beliefs._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    // =========================================================================
    // ENSURE BELIEF CONTAINER
    // =========================================================================

    AIH.Beliefs._ensure = function() {

        var state;

        state =
            AIH.Beliefs._state();

        if (!state) {
            return null;
        }

        if (!state.beliefs) {

            state.beliefs = {

                schemaVersion:
                    AIH.Beliefs.SCHEMA_VERSION,

                nextId: 1,

                items: []
            };
        }

        /*
         * Migrate the placeholder object created by the State module.
         */

        if (
            Array.isArray(
                state.beliefs
            )
        ) {

            state.beliefs = {

                schemaVersion:
                    AIH.Beliefs.SCHEMA_VERSION,

                nextId: 1,

                items:
                    state.beliefs
            };
        }

        if (
            state.beliefs.schemaVersion ===
            undefined
        ) {

            state.beliefs.schemaVersion =
                AIH.Beliefs.SCHEMA_VERSION;
        }

        if (
            !Array.isArray(
                state.beliefs.items
            )
        ) {

            state.beliefs.items = [];
        }

        if (
            state.beliefs.nextId ===
            undefined
        ) {

            state.beliefs.nextId =
                1;
        }

        return state.beliefs;
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Beliefs.initialize = function() {

        var beliefs;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return;
        }

        AIH.Beliefs._initialized =
            true;

        AIH.Debug.log(
            "Belief system initialized."
        );
    };

    // =========================================================================
    // NEXT ID
    // =========================================================================

    AIH.Beliefs._nextId = function() {

        var beliefs;
        var id;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return 0;
        }

        id =
            Number(
                beliefs.nextId
            );

        if (
            isNaN(id) ||
            id < 1
        ) {

            id = 1;
        }

        beliefs.nextId =
            id + 1;

        return id;
    };

    // =========================================================================
    // FIND EXISTING BELIEF
    // =========================================================================

    AIH.Beliefs._find = function(
        proposition
    ) {

        var beliefs;
        var i;
        var belief;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return null;
        }

        for (
            i = 0;
            i < beliefs.items.length;
            i++
        ) {

            belief =
                beliefs.items[i];

            if (
                belief.proposition ===
                proposition
            ) {

                return belief;
            }
        }

        return null;
    };

    // =========================================================================
    // CREATE BELIEF
    // =========================================================================

    AIH.Beliefs.create = function(
        proposition,
        confidence,
        options
    ) {

        var belief;

        options =
            options || {};

        proposition =
            String(
                proposition || ""
            );

        if (!proposition) {
            return null;
        }

        belief = {

            id:
                AIH.Beliefs._nextId(),

            proposition:
                proposition,

            confidence:
                AIH.Beliefs._clamp01(
                    confidence
                ),

            category:
                String(
                    options.category ||
                    "world"
                ),

            sourceReliability:
                options.sourceReliability !==
                undefined
                    ? AIH.Beliefs._clamp01(
                        options.sourceReliability
                    )
                    : null,

            supportingEvidence: [],

            contradictingEvidence: [],

            createdAt:
                Date.now(),

            updatedAt:
                Date.now(),

            updateCount: 0
        };

        return belief;
    };

    // =========================================================================
    // ADD BELIEF
    // =========================================================================

    AIH.Beliefs.add = function(
        proposition,
        confidence,
        options
    ) {

        var beliefs;
        var existing;
        var belief;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return null;
        }

        proposition =
            String(
                proposition || ""
            );

        if (!proposition) {
            return null;
        }

        existing =
            AIH.Beliefs._find(
                proposition
            );

        if (existing) {

            return AIH.Beliefs._copy(
                existing
            );
        }

        belief =
            AIH.Beliefs.create(
                proposition,
                confidence,
                options
            );

        if (!belief) {
            return null;
        }

        beliefs.items.push(
            belief
        );

        AIH.Events.emit(
            "BELIEF_CREATED",
            {
                belief:
                    AIH.Beliefs._copy(
                        belief
                    )
            }
        );

        return AIH.Beliefs._copy(
            belief
        );
    };

    // =========================================================================
    // GET BELIEF
    // =========================================================================

    AIH.Beliefs.get = function(
        id
    ) {

        var beliefs;
        var numericId;
        var i;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return null;
        }

        numericId =
            Number(id);

        for (
            i = 0;
            i < beliefs.items.length;
            i++
        ) {

            if (
                beliefs.items[i].id ===
                numericId
            ) {

                return AIH.Beliefs._copy(
                    beliefs.items[i]
                );
            }
        }

        return null;
    };

    // =========================================================================
    // GET BY PROPOSITION
    // =========================================================================

    AIH.Beliefs.getByProposition = function(
        proposition
    ) {

        var belief;

        proposition =
            String(
                proposition || ""
            );

        belief =
            AIH.Beliefs._find(
                proposition
            );

        if (!belief) {
            return null;
        }

        return AIH.Beliefs._copy(
            belief
        );
    };

    // =========================================================================
    // ALL BELIEFS
    // =========================================================================

    AIH.Beliefs.all = function() {

        var beliefs;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return [];
        }

        return AIH.Beliefs._copy(
            beliefs.items
        );
    };

    // =========================================================================
    // COUNT
    // =========================================================================

    AIH.Beliefs.count = function() {

        var beliefs;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return 0;
        }

        return beliefs.items.length;
    };

    // =========================================================================
    // UPDATE CONFIDENCE
    // =========================================================================

    AIH.Beliefs.updateConfidence = function(
        id,
        newConfidence,
        evidence
    ) {

        var beliefs;
        var numericId;
        var i;
        var belief;
        var oldConfidence;
        var record;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return null;
        }

        numericId =
            Number(id);

        for (
            i = 0;
            i < beliefs.items.length;
            i++
        ) {

            belief =
                beliefs.items[i];

            if (
                belief.id !==
                numericId
            ) {

                continue;
            }

            oldConfidence =
                AIH.Beliefs._clamp01(
                    belief.confidence
                );

            belief.confidence =
                AIH.Beliefs._clamp01(
                    newConfidence
                );

            belief.updatedAt =
                Date.now();

            belief.updateCount += 1;

            if (evidence) {

                record =
                    AIH.Beliefs._copy(
                        evidence
                    );

                if (
                    record.supports ===
                    true
                ) {

                    belief.supportingEvidence.push(
                        record
                    );
                }

                if (
                    record.contradicts ===
                    true
                ) {

                    belief.contradictingEvidence.push(
                        record
                    );
                }
            }

            AIH.Events.emit(
                "BELIEF_UPDATED",
                {
                    belief:
                        AIH.Beliefs._copy(
                            belief
                        ),

                    previousConfidence:
                        oldConfidence,

                    confidence:
                        belief.confidence
                }
            );

            return AIH.Beliefs._copy(
                belief
            );
        }

        return null;
    };

    // =========================================================================
    // ADD EVIDENCE
    // =========================================================================

    AIH.Beliefs.addEvidence = function(
        id,
        evidence
    ) {

        var beliefs;
        var numericId;
        var i;
        var belief;
        var record;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return false;
        }

        numericId =
            Number(id);

        record =
            AIH.Beliefs._copy(
                evidence || {}
            );

        for (
            i = 0;
            i < beliefs.items.length;
            i++
        ) {

            belief =
                beliefs.items[i];

            if (
                belief.id !==
                numericId
            ) {

                continue;
            }

            if (
                record.supports ===
                true
            ) {

                belief.supportingEvidence.push(
                    record
                );
            }

            if (
                record.contradicts ===
                true
            ) {

                belief.contradictingEvidence.push(
                    record
                );
            }

            belief.updatedAt =
                Date.now();

            return true;
        }

        return false;
    };

    // =========================================================================
    // FIND BY CATEGORY
    // =========================================================================

    AIH.Beliefs.findByCategory = function(
        category
    ) {

        var beliefs;
        var result;
        var i;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return [];
        }

        category =
            String(
                category || ""
            );

        result = [];

        for (
            i = 0;
            i < beliefs.items.length;
            i++
        ) {

            if (
                beliefs.items[i].category ===
                category
            ) {

                result.push(
                    beliefs.items[i]
                );
            }
        }

        return AIH.Beliefs._copy(
            result
        );
    };

    // =========================================================================
    // FIND BY CONFIDENCE
    // =========================================================================

    AIH.Beliefs.findByMinimumConfidence =
        function(
            minimumConfidence
        ) {

            var beliefs;
            var result;
            var minimum;
            var i;

            beliefs =
                AIH.Beliefs._ensure();

            if (!beliefs) {
                return [];
            }

            minimum =
                AIH.Beliefs._clamp01(
                    minimumConfidence
                );

            result = [];

            for (
                i = 0;
                i < beliefs.items.length;
                i++
            ) {

                if (
                    beliefs.items[i].confidence >=
                    minimum
                ) {

                    result.push(
                        beliefs.items[i]
                    );
                }
            }

            return AIH.Beliefs._copy(
                result
            );
        };

    // =========================================================================
    // CLEAR
    // =========================================================================

    AIH.Beliefs.clear = function() {

        var beliefs;

        beliefs =
            AIH.Beliefs._ensure();

        if (!beliefs) {
            return false;
        }

        beliefs.items = [];

        beliefs.nextId = 1;

        AIH.Events.emit(
            "BELIEFS_CLEARED",
            {}
        );

        AIH.Debug.log(
            "AI beliefs cleared."
        );

        return true;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Beliefs",
        {
            version:
                AIH.Beliefs.VERSION,

            initialize: function() {
                AIH.Beliefs.initialize();
            },

            get: function(id) {
                return AIH.Beliefs.get(id);
            },

            all: function() {
                return AIH.Beliefs.all();
            },

            add: function(
                proposition,
                confidence,
                options
            ) {

                return AIH.Beliefs.add(
                    proposition,
                    confidence,
                    options
                );
            },

            updateConfidence:
                function(
                    id,
                    confidence,
                    evidence
                ) {

                    return AIH.Beliefs.updateConfidence(
                        id,
                        confidence,
                        evidence
                    );
                }
        }
    );

    // =========================================================================
    // SHOW
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Beliefs",
        "Show",
        function() {

            AIH.Debug.inspect(
                "Current AI beliefs:",
                AIH.Beliefs.all()
            );
        }
    );

    // =========================================================================
    // CLEAR
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Beliefs",
        "Clear",
        function() {

            AIH.Beliefs.clear();
        }
    );

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    var _AIH_Beliefs_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_Beliefs_createGameObjects.call(
            this
        );

        AIH.Beliefs.initialize();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Beliefs_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_Beliefs_setupNewGame.call(
            this
        );

        AIH.Beliefs._initialized =
            false;

        AIH.Beliefs.initialize();
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Beliefs_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_Beliefs_extractSaveContents.call(
                this,
                contents
            );

            AIH.Beliefs._initialized =
                false;

            AIH.Beliefs.initialize();
        };

})();