/*:
 * @plugindesc AI Hero Framework - Values / Morality v0.3.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - VALUES / MORALITY
 * ============================================================================
 *
 * STEP 10
 *
 * Stores the heroine's medium-term values and preferences.
 *
 * Values are NOT immediate emotions.
 *
 * Values represent things the heroine tends to consider important when making
 * decisions.
 *
 * Values are considerations, not absolute rules.
 *
 * ============================================================================
 *
 * IMPORTANT DISTINCTION: COMFORT
 *
 * "comfort" in this module means:
 *
 *     How much the heroine VALUES personal comfort.
 *
 * It does NOT mean:
 *
 *     How comfortable she currently is.
 *
 * Current comfort belongs to the Emotional State module.
 *
 * Current comfort can affect physical coordination and combat performance.
 *
 * For example:
 *
 *     High current comfort:
 *         normal movement and combat performance.
 *
 *     Low current comfort:
 *         more awkwardness, missed attacks, poor dodges, stumbling, etc.
 *
 * ============================================================================
 *
 * STARTING HEROINE
 *
 * The heroine is already highly successful, famous, powerful and confident.
 *
 * Her initial values therefore reflect an established identity rather than
 * a neutral character.
 *
 * She is:
 *
 *     strongly survival-oriented
 *     somewhat interested in wealth
 *     strongly interested in power
 *     strongly protective of freedom
 *     moderately interested in comfort
 *     strongly interested in status
 *     moderately interested in pleasure
 *     strongly modest/prideful about herself
 *     extremely concerned with personal dignity
 *
 * These values are NOT hard-coded action rules.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Values = AIH.Values || {};

    AIH.Values.VERSION = "0.3.0";

    AIH.Values.SCHEMA_VERSION = 1;

    AIH.Values._initialized = false;

    // =========================================================================
    // DEFAULT VALUES
    // =========================================================================
    //
    // These values represent the heroine's starting psychological identity.
    //
    // They are deliberately NOT neutral.
    //
    // =========================================================================

    AIH.Values.createDefault = function() {

        return {

            schemaVersion:
                AIH.Values.SCHEMA_VERSION,

            /*
             * Staying alive matters strongly to her, but she is not timid.
             *
             * Survival is therefore high without implying caution.
             */
            survival: 0.80,

            /*
             * She likes money and recognizes its usefulness, but wealth is
             * not the center of her identity.
             */
            wealth: 0.60,

            /*
             * She is exceptionally capable and takes pride in strength.
             */
            power: 0.85,

            /*
             * She is headstrong and strongly dislikes being controlled.
             */
            freedom: 0.90,

            /*
             * Comfort is a meaningful preference, but not an overwhelming
             * life priority.
             *
             * This is VALUE FOR COMFORT, not current physical comfort.
             */
            comfort: 0.55,

            /*
             * She is famous and takes substantial pride in her status.
             */
            status: 0.85,

            /*
             * Pleasure matters, but it does not dominate her identity.
             */
            pleasure: 0.50,

            /*
             * She begins with strong modesty because her identity and pride
             * make deliberately humiliating/revealing behavior unattractive.
             *
             * This is NOT an absolute prohibition.
             */
            modesty: 0.85,

            /*
             * Personal dignity is extremely important to her.
             *
             * This is one of the strongest initial values because of her
             * exceptionally proud and successful identity.
             */
            dignity: 0.95,

            lastUpdated:
                Date.now()
        };
    };

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Values._copy = function(value) {

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

    AIH.Values._clamp01 = function(value) {

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
    // GET STATE
    // =========================================================================

    AIH.Values._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    // =========================================================================
    // ENSURE VALUES
    // =========================================================================

    AIH.Values._ensure = function() {

        var state;
        var defaults;
        var key;

        state =
            AIH.Values._state();

        if (!state) {
            return null;
        }

        defaults =
            AIH.Values.createDefault();

        if (!state.values) {
            state.values = {};
        }

        if (
            state.values.schemaVersion ===
            undefined
        ) {

            state.values.schemaVersion =
                AIH.Values.SCHEMA_VERSION;
        }

        for (key in defaults) {

            if (
                Object.prototype.hasOwnProperty.call(
                    defaults,
                    key
                )
            ) {

                if (
                    state.values[key] ===
                    undefined
                ) {

                    state.values[key] =
                        AIH.Values._copy(
                            defaults[key]
                        );
                }
            }
        }

        return state.values;
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Values.initialize = function() {

        var values;

        values =
            AIH.Values._ensure();

        if (!values) {
            return;
        }

        AIH.Values._initialized = true;

        AIH.Debug.log(
            "Values module initialized."
        );
    };

    // =========================================================================
    // GET ALL VALUES
    // =========================================================================

    AIH.Values.get = function() {

        var values;

        values =
            AIH.Values._ensure();

        if (!values) {
            return null;
        }

        return AIH.Values._copy(
            values
        );
    };

    // =========================================================================
    // GET VALUE
    // =========================================================================

    AIH.Values.getValue = function(
        key
    ) {

        var values;

        values =
            AIH.Values._ensure();

        if (!values) {
            return 0;
        }

        if (
            values[key] ===
            undefined
        ) {

            return 0;
        }

        return Number(
            values[key]
        );
    };

    // =========================================================================
    // SET VALUE
    // =========================================================================

    AIH.Values.setValue = function(
        key,
        value
    ) {

        var values;

        values =
            AIH.Values._ensure();

        if (!values) {
            return false;
        }

        if (
            values[key] ===
            undefined
        ) {

            return false;
        }

        values[key] =
            AIH.Values._clamp01(
                value
            );

        values.lastUpdated =
            Date.now();

        return true;
    };

    // =========================================================================
    // MODIFY VALUE
    // =========================================================================

    AIH.Values.modifyValue = function(
        key,
        amount
    ) {

        var current;
        var next;

        current =
            AIH.Values.getValue(
                key
            );

        amount =
            Number(amount);

        if (isNaN(amount)) {
            return current;
        }

        next =
            AIH.Values._clamp01(
                current + amount
            );

        AIH.Values.setValue(
            key,
            next
        );

        return next;
    };

    // =========================================================================
    // AVAILABLE VALUE NAMES
    // =========================================================================

    AIH.Values.keys = function() {

        return [
            "survival",
            "wealth",
            "power",
            "freedom",
            "comfort",
            "status",
            "pleasure",
            "modesty",
            "dignity"
        ];
    };

    // =========================================================================
    // DESCRIBE
    // =========================================================================

    AIH.Values.describe = function() {

        var values;

        values =
            AIH.Values.get();

        if (!values) {
            return null;
        }

        return {

            survival:
                values.survival,

            wealth:
                values.wealth,

            power:
                values.power,

            freedom:
                values.freedom,

            /*
             * VALUE FOR COMFORT.
             *
             * NOT current physical comfort.
             */
            comfortPreference:
                values.comfort,

            status:
                values.status,

            pleasure:
                values.pleasure,

            modesty:
                values.modesty,

            dignity:
                values.dignity
        };
    };

    // =========================================================================
    // RESET
    // =========================================================================

    AIH.Values.reset = function() {

        var state;

        state =
            AIH.Values._state();

        if (!state) {
            return false;
        }

        state.values =
            AIH.Values.createDefault();

        AIH.Values._initialized =
            true;

        AIH.Debug.log(
            "AI values reset."
        );

        return true;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Values",
        {
            version:
                AIH.Values.VERSION,

            initialize: function() {
                AIH.Values.initialize();
            },

            get: function() {
                return AIH.Values.get();
            },

            getValue: function(key) {
                return AIH.Values.getValue(key);
            },

            setValue: function(key, value) {
                return AIH.Values.setValue(
                    key,
                    value
                );
            },

            modifyValue: function(key, amount) {
                return AIH.Values.modifyValue(
                    key,
                    amount
                );
            }
        }
    );

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    var _AIH_Values_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_Values_createGameObjects.call(
            this
        );

        AIH.Values.initialize();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Values_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_Values_setupNewGame.call(
            this
        );

        AIH.Values.initialize();
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Values_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_Values_extractSaveContents.call(
                this,
                contents
            );

            AIH.Values.initialize();
        };

})();