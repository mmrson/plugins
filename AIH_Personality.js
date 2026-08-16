/*:
 * @plugindesc AI Hero Framework - Personality v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - PERSONALITY
 * ============================================================================
 *
 * STEP 8
 *
 * Stores the AI Hero's slow-changing personality traits.
 *
 * Personality is persistent and is stored inside AIH.State.
 *
 * Personality does NOT:
 *
 * - make decisions
 * - evaluate actions
 * - interpret memories
 * - create beliefs
 * - create hypotheses
 * - modify emotions
 * - call the LLM
 * - execute actions
 *
 * Later psychology systems may modify personality as a consequence of
 * accumulated experience.
 *
 * ============================================================================
 *
 * STARTING PERSONALITY
 *
 * The heroine begins as an already highly accomplished person.
 *
 * She is:
 *
 * - highly courageous
 * - relatively incautious
 * - very curious
 * - somewhat greedy
 * - extremely proud
 * - strongly independent
 * - highly tolerant of risk
 * - moderately sociable
 * - extremely confident
 *
 * These values describe psychological tendencies.
 *
 * They are NOT behavioral thresholds.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Personality = AIH.Personality || {};

    AIH.Personality.VERSION = "0.1.0";

    AIH.Personality._initialized = false;

    // =========================================================================
    // TRAIT DEFINITIONS
    // =========================================================================

    AIH.Personality.TRAITS = [

        "courage",
        "caution",
        "curiosity",
        "greed",
        "pride",
        "independence",
        "riskTolerance",
        "sociability",
        "confidence"

    ];

    // =========================================================================
    // DEFAULT PERSONALITY
    // =========================================================================

    AIH.Personality.createDefault = function() {

        return {

            courage: 0.90,

            caution: 0.20,

            curiosity: 0.85,

            greed: 0.60,

            pride: 0.97,

            independence: 0.85,

            riskTolerance: 0.88,

            sociability: 0.55,

            confidence: 0.95

        };
    };

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Personality._copy = function(value) {

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

    AIH.Personality._clamp01 = function(value) {

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
    // VALID TRAIT
    // =========================================================================

    AIH.Personality.hasTrait = function(name) {

        var i;

        name =
            String(name || "");

        for (
            i = 0;
            i < AIH.Personality.TRAITS.length;
            i++
        ) {

            if (
                AIH.Personality.TRAITS[i] ===
                name
            ) {

                return true;
            }
        }

        return false;
    };

    // =========================================================================
    // INITIALIZE DEFAULT PERSONALITY
    // =========================================================================

    AIH.Personality.initialize = function() {

        var state;

        if (AIH.Personality._initialized) {
            return;
        }

        state =
            AIH.State._internal();

        if (!state) {
            return;
        }

        /*
         * Only initialize personality if it does not already exist.
         *
         * This prevents an existing save from being overwritten.
         */

        if (
            !state.personality ||
            Object.keys(state.personality).length === 0
        ) {

            state.personality =
                AIH.Personality.createDefault();
        }

        AIH.Personality._ensureTraits();

        AIH.Personality._initialized = true;

        AIH.Debug.log(
            "Personality module initialized."
        );
    };

    // =========================================================================
    // ENSURE TRAITS
    // =========================================================================

    AIH.Personality._ensureTraits = function() {

        var state;
        var defaults;
        var i;
        var trait;

        state =
            AIH.State._internal();

        if (!state) {
            return;
        }

        if (!state.personality) {
            state.personality = {};
        }

        defaults =
            AIH.Personality.createDefault();

        for (
            i = 0;
            i < AIH.Personality.TRAITS.length;
            i++
        ) {

            trait =
                AIH.Personality.TRAITS[i];

            if (
                state.personality[trait] ===
                undefined
            ) {

                state.personality[trait] =
                    defaults[trait];
            }
            else {

                state.personality[trait] =
                    AIH.Personality._clamp01(
                        state.personality[trait]
                    );
            }
        }
    };

    // =========================================================================
    // GET ALL PERSONALITY
    // =========================================================================

    AIH.Personality.get = function() {

        var state;

        state =
            AIH.State._internal();

        if (!state) {
            return {};
        }

        AIH.Personality._ensureTraits();

        return AIH.Personality._copy(
            state.personality
        );
    };

    // =========================================================================
    // GET TRAIT
    // =========================================================================

    AIH.Personality.getTrait = function(
        name
    ) {

        var state;

        name =
            String(name || "");

        if (!AIH.Personality.hasTrait(name)) {
            return null;
        }

        state =
            AIH.State._internal();

        if (!state) {
            return null;
        }

        AIH.Personality._ensureTraits();

        return Number(
            state.personality[name]
        );
    };

    // =========================================================================
    // SET TRAIT
    // =========================================================================

    AIH.Personality.setTrait = function(
        name,
        value
    ) {

        var state;

        name =
            String(name || "");

        if (!AIH.Personality.hasTrait(name)) {

            AIH.Debug.warn(
                "Unknown personality trait: " +
                name
            );

            return false;
        }

        state =
            AIH.State._internal();

        if (!state) {
            return false;
        }

        value =
            AIH.Personality._clamp01(
                value
            );

        state.personality[name] =
            value;

        state.metadata.lastUpdated =
            Date.now();

        return true;
    };

    // =========================================================================
    // ADJUST TRAIT
    // =========================================================================

    AIH.Personality.adjustTrait = function(
        name,
        delta,
        reason
    ) {

        var current;
        var value;
        var changed;

        current =
            AIH.Personality.getTrait(
                name
            );

        if (current === null) {
            return false;
        }

        delta =
            Number(delta);

        if (isNaN(delta)) {
            return false;
        }

        value =
            AIH.Personality._clamp01(
                current + delta
            );

        changed =
            AIH.Personality.setTrait(
                name,
                value
            );

        if (changed) {

            AIH.Debug.log(
                "Personality changed: " +
                name +
                " " +
                current.toFixed(3) +
                " -> " +
                value.toFixed(3) +
                (
                    reason
                        ? " | " + String(reason)
                        : ""
                )
            );
        }

        return changed;
    };

    // =========================================================================
    // RESET TO DEFAULT
    // =========================================================================

    AIH.Personality.reset = function() {

        var state;

        state =
            AIH.State._internal();

        if (!state) {
            return false;
        }

        state.personality =
            AIH.Personality.createDefault();

        state.metadata.lastUpdated =
            Date.now();

        return true;
    };

    // =========================================================================
    // DEBUG
    // =========================================================================

    AIH.Personality.debug = function() {

        AIH.Debug.inspect(
            "AI Hero Personality:",
            AIH.Personality.get()
        );
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Personality",
        {
            version:
                AIH.Personality.VERSION,

            initialize: function() {
                AIH.Personality.initialize();
            },

            get: function() {
                return AIH.Personality.get();
            },

            getTrait: function(name) {
                return AIH.Personality.getTrait(name);
            }
        }
    );

    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_Personality_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_Personality_createGameObjects.call(this);

        AIH.Personality.initialize();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Personality_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_Personality_setupNewGame.call(this);

        AIH.Personality._initialized = false;

        AIH.Personality.initialize();
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Personality_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(contents) {

        _AIH_Personality_extractSaveContents.call(
            this,
            contents
        );

        AIH.Personality._initialized = false;

        AIH.Personality.initialize();
    };

})();