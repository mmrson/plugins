/*:
 * @plugindesc AI Hero Framework - Emotional State v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - EMOTIONAL STATE
 * ============================================================================
 *
 * STEP 11
 *
 * Stores the heroine's rapidly changing emotional and physical state.
 *
 * Emotional state is different from:
 *
 * PERSONALITY
 *     Slow-changing tendencies.
 *
 * VALUES
 *     Medium-term preferences and priorities.
 *
 * BELIEFS
 *     Learned assumptions about the world.
 *
 * EMOTIONAL STATE
 *     Rapidly changing current condition.
 *
 * ============================================================================
 *
 * CURRENT EMOTIONAL VARIABLES
 *
 * confidence
 * frustration
 * fear
 * embarrassment
 * excitement
 * anger
 * stress
 * fatigue
 * comfort
 *
 * ============================================================================
 *
 * IMPORTANT: COMFORT
 *
 * Current comfort means:
 *
 *     How physically and psychologically accustomed the heroine currently
 *     feels to her clothing, equipment, environment and condition.
 *
 * It does NOT mean:
 *
 *     luxury
 *     wealth
 *     expensive surroundings
 *     desire for a luxurious lifestyle
 *
 * High current comfort means she feels natural and coordinated in her
 * current state.
 *
 * Low current comfort means she feels awkward or unaccustomed.
 *
 * Later systems may allow low comfort to produce consequences such as:
 *
 *     missed attacks
 *     missed dodges
 *     stumbling
 *     awkward movement
 *     poorer physical coordination
 *
 * This module does NOT apply those consequences.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This module does NOT:
 *
 * - make decisions
 * - determine causality
 * - create beliefs
 * - create hypotheses
 * - call the LLM
 * - execute actions
 * - directly modify RPG Maker combat
 *
 * It only stores and modifies the heroine's current emotional state.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Emotions = AIH.Emotions || {};

    AIH.Emotions.VERSION = "0.1.0";

    AIH.Emotions.SCHEMA_VERSION = 1;

    AIH.Emotions._initialized = false;

    // =========================================================================
    // DEFAULT EMOTIONAL STATE
    // =========================================================================
    //
    // These values represent the heroine at the beginning of the game.
    //
    // She is highly successful, famous, exceptionally capable and accustomed
    // to winning.
    //
    // Therefore:
    //
    // confidence is very high
    // frustration is low
    // fear is low
    // stress is low
    // fatigue is low
    // comfort is high
    //
    // Embarrassment begins moderate rather than extreme. Her enormous pride
    // and dignity values handle her deeper identity considerations.
    //
    // =========================================================================

    AIH.Emotions.createDefault = function() {

        return {

            schemaVersion:
                AIH.Emotions.SCHEMA_VERSION,

            confidence:
                0.95,

            frustration:
                0.10,

            fear:
                0.05,

            embarrassment:
                0.30,

            excitement:
                0.45,

            anger:
                0.05,

            stress:
                0.10,

            fatigue:
                0.05,

            /*
             * CURRENT COMFORT.
             *
             * This is not the same as Values.comfort.
             *
             * Values.comfort =
             *     how much she values being comfortable.
             *
             * Emotions.comfort =
             *     how comfortable she currently feels in her condition.
             */
            comfort:
                0.90,

            lastUpdated:
                Date.now()
        };
    };

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Emotions._copy = function(value) {

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

    AIH.Emotions._clamp01 = function(value) {

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
    // GET PERSISTENT STATE
    // =========================================================================

    AIH.Emotions._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    // =========================================================================
    // ENSURE EMOTIONAL STATE
    // =========================================================================

    AIH.Emotions._ensure = function() {

        var state;
        var defaults;
        var key;

        state =
            AIH.Emotions._state();

        if (!state) {
            return null;
        }

        defaults =
            AIH.Emotions.createDefault();

        if (!state.emotions) {
            state.emotions = {};
        }

        if (
            state.emotions.schemaVersion ===
            undefined
        ) {

            state.emotions.schemaVersion =
                AIH.Emotions.SCHEMA_VERSION;
        }

        for (key in defaults) {

            if (
                Object.prototype.hasOwnProperty.call(
                    defaults,
                    key
                )
            ) {

                if (
                    state.emotions[key] ===
                    undefined
                ) {

                    state.emotions[key] =
                        AIH.Emotions._copy(
                            defaults[key]
                        );
                }
            }
        }

        return state.emotions;
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Emotions.initialize = function() {

        var emotions;

        emotions =
            AIH.Emotions._ensure();

        if (!emotions) {
            return;
        }

        AIH.Emotions._initialized = true;

        AIH.Debug.log(
            "Emotional state module initialized."
        );
    };

    // =========================================================================
    // GET ALL EMOTIONS
    // =========================================================================

    AIH.Emotions.get = function() {

        var emotions;

        emotions =
            AIH.Emotions._ensure();

        if (!emotions) {
            return null;
        }

        return AIH.Emotions._copy(
            emotions
        );
    };

    // =========================================================================
    // GET EMOTION
    // =========================================================================

    AIH.Emotions.getValue = function(
        key
    ) {

        var emotions;

        emotions =
            AIH.Emotions._ensure();

        if (!emotions) {
            return 0;
        }

        if (
            emotions[key] ===
            undefined
        ) {

            return 0;
        }

        return Number(
            emotions[key]
        );
    };

    // =========================================================================
    // SET EMOTION
    // =========================================================================

    AIH.Emotions.setValue = function(
        key,
        value
    ) {

        var emotions;
        var oldValue;
        var newValue;

        emotions =
            AIH.Emotions._ensure();

        if (!emotions) {
            return false;
        }

        if (
            emotions[key] ===
            undefined
        ) {

            return false;
        }

        oldValue =
            Number(
                emotions[key]
            );

        newValue =
            AIH.Emotions._clamp01(
                value
            );

        emotions[key] =
            newValue;

        emotions.lastUpdated =
            Date.now();

        AIH.Events.emit(
            "EMOTIONAL_STATE_CHANGED",
            {
                key: key,
                oldValue: oldValue,
                newValue: newValue
            }
        );

        return true;
    };

    // =========================================================================
    // MODIFY EMOTION
    // =========================================================================
    //
    // This allows later systems to change emotions incrementally.
    //
    // =========================================================================

    AIH.Emotions.modifyValue = function(
        key,
        amount
    ) {

        var current;
        var delta;
        var next;

        current =
            AIH.Emotions.getValue(
                key
            );

        delta =
            Number(amount);

        if (isNaN(delta)) {
            return current;
        }

        next =
            AIH.Emotions._clamp01(
                current + delta
            );

        AIH.Emotions.setValue(
            key,
            next
        );

        return next;
    };

    // =========================================================================
    // VALUE NAMES
    // =========================================================================

    AIH.Emotions.keys = function() {

        return [
            "confidence",
            "frustration",
            "fear",
            "embarrassment",
            "excitement",
            "anger",
            "stress",
            "fatigue",
            "comfort"
        ];
    };

    // =========================================================================
    // DESCRIBE
    // =========================================================================

    AIH.Emotions.describe = function() {

        var emotions;

        emotions =
            AIH.Emotions.get();

        if (!emotions) {
            return null;
        }

        return {

            confidence:
                emotions.confidence,

            frustration:
                emotions.frustration,

            fear:
                emotions.fear,

            embarrassment:
                emotions.embarrassment,

            excitement:
                emotions.excitement,

            anger:
                emotions.anger,

            stress:
                emotions.stress,

            fatigue:
                emotions.fatigue,

            /*
             * CURRENT physical/psychological comfort.
             *
             * This is intentionally named differently from the Values
             * module's comfort preference.
             */
            currentComfort:
                emotions.comfort
        };
    };

    // =========================================================================
    // RESET
    // =========================================================================

    AIH.Emotions.reset = function() {

        var state;

        state =
            AIH.Emotions._state();

        if (!state) {
            return false;
        }

        state.emotions =
            AIH.Emotions.createDefault();

        AIH.Emotions._initialized =
            true;

        AIH.Debug.log(
            "Emotional state reset."
        );

        return true;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Emotions",
        {
            version:
                AIH.Emotions.VERSION,

            initialize: function() {
                AIH.Emotions.initialize();
            },

            get: function() {
                return AIH.Emotions.get();
            },

            getValue: function(key) {
                return AIH.Emotions.getValue(
                    key
                );
            },

            setValue: function(key, value) {
                return AIH.Emotions.setValue(
                    key,
                    value
                );
            },

            modifyValue: function(key, amount) {
                return AIH.Emotions.modifyValue(
                    key,
                    amount
                );
            }
        }
    );

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    var _AIH_Emotions_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_Emotions_createGameObjects.call(
            this
        );

        AIH.Emotions.initialize();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Emotions_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_Emotions_setupNewGame.call(
            this
        );

        AIH.Emotions.initialize();
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Emotions_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_Emotions_extractSaveContents.call(
                this,
                contents
            );

            AIH.Emotions.initialize();
        };

})();