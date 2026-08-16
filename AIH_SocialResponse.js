/*:
 * @plugindesc AI Hero Framework - Social Response System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL RESPONSE SYSTEM
 * ============================================================================
 *
 * STEP 16
 *
 * Evaluates how strongly the heroine is inclined to respond to social
 * treatment.
 *
 * This module is NOT the final decision-maker.
 *
 * It produces an interpretation/context that future decision systems can use.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * The heroine does not automatically react to every negative interaction.
 *
 * A social response depends on multiple factors:
 *
 * - faction reputation
 * - perceived dominance/submissiveness
 * - heroine confidence
 * - heroine personality
 * - heroine values
 * - current emotions
 * - severity of treatment
 * - whether the treatment conflicts with her self-image
 *
 * ============================================================================
 *
 * EXAMPLE
 *
 * An NPC makes a mildly dismissive comment.
 *
 * The system may determine:
 *
 *     offense:
 *         moderate
 *
 *     perceivedDisrespect:
 *         high
 *
 *     resistance:
 *         very high
 *
 *     aggressiveResponsePressure:
 *         moderate
 *
 * This does NOT mean:
 *
 *     "attack NPC"
 *
 * A future decision system determines what she actually does.
 *
 * ============================================================================
 *
 * This module does NOT:
 *
 * - execute actions
 * - modify RPG Maker combat
 * - directly attack NPCs
 * - generate dialogue
 * - modify personality
 * - modify values
 * - directly modify reputation
 * - call the LLM
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.SocialResponse =
        AIH.SocialResponse || {};

    AIH.SocialResponse.VERSION =
        "0.1.0";

    AIH.SocialResponse.SCHEMA_VERSION =
        1;

    AIH.SocialResponse._initialized =
        false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.SocialResponse._copy =
        function(value) {

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
    // CLAMP 0-1
    // =========================================================================

    AIH.SocialResponse._clamp01 =
        function(value) {

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
    // CLAMP -100 TO +100
    // =========================================================================

    AIH.SocialResponse._clamp100 =
        function(value) {

            value =
                Number(value);

            if (isNaN(value)) {
                return 0;
            }

            if (value < -100) {
                return -100;
            }

            if (value > 100) {
                return 100;
            }

            return value;
        };

    // =========================================================================
    // GET EMOTION SAFELY
    // =========================================================================

    AIH.SocialResponse._emotion =
        function(key) {

            if (
                typeof AIH.Emotions ===
                "undefined" ||
                !AIH.Emotions.getValue
            ) {

                return 0;
            }

            return AIH.SocialResponse._clamp01(
                AIH.Emotions.getValue(
                    key
                )
            );
        };

    // =========================================================================
    // GET PERSONALITY SAFELY
    // =========================================================================

    AIH.SocialResponse._personality =
        function(key) {

            if (
                typeof AIH.Personality ===
                "undefined"
            ) {

                return 0.5;
            }

            if (
                AIH.Personality.getValue
            ) {

                return AIH.SocialResponse._clamp01(
                    AIH.Personality.getValue(
                        key
                    )
                );
            }

            if (
                AIH.Personality.get
            ) {

                var personality =
                    AIH.Personality.get();

                if (
                    personality &&
                    personality[key] !==
                    undefined
                ) {

                    return AIH.SocialResponse._clamp01(
                        personality[key]
                    );
                }
            }

            return 0.5;
        };

    // =========================================================================
    // GET VALUE SAFELY
    // =========================================================================

    AIH.SocialResponse._value =
        function(key) {

            if (
                typeof AIH.Values ===
                "undefined"
            ) {

                return 0.5;
            }

            if (
                AIH.Values.getValue
            ) {

                return AIH.SocialResponse._clamp01(
                    AIH.Values.getValue(
                        key
                    )
                );
            }

            if (
                AIH.Values.get
            ) {

                var values =
                    AIH.Values.get();

                if (
                    values &&
                    values[key] !==
                    undefined
                ) {

                    return AIH.SocialResponse._clamp01(
                        values[key]
                    );
                }
            }

            return 0.5;
        };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialResponse.initialize =
        function() {

            AIH.SocialResponse._initialized =
                true;

            AIH.Debug.log(
                "Social response system initialized."
            );
        };

    // =========================================================================
    // GET BASIC SOCIAL PRESSURE
    // =========================================================================
    //
    // This is the heroine's resistance to being socially pushed around.
    //
    // High confidence + high pride + high dominance perception
    // produce stronger resistance.
    //
    // =========================================================================

    AIH.SocialResponse.getResistance =
        function(faction) {

            var confidence;
            var pride;
            var dominance;
            var result;

            confidence =
                AIH.SocialResponse._emotion(
                    "confidence"
                );

            pride =
                AIH.SocialResponse._personality(
                    "pride"
                );

            dominance =
                AIH.Reputation.getAxis(
                    faction,
                    "dominance"
                );

            dominance =
                (
                    AIH.SocialResponse._clamp100(
                        dominance
                    ) + 100
                ) / 200;

            result =
                (
                    confidence * 0.40
                ) +
                (
                    pride * 0.40
                ) +
                (
                    dominance * 0.20
                );

            return AIH.SocialResponse._clamp01(
                result
            );
        };

    // =========================================================================
    // CALCULATE PERCEIVED DISRESPECT
    // =========================================================================
    //
    // severity is supplied by the interaction system.
    //
    // 0 =
    //     harmless
    //
    // 1 =
    //     extremely demeaning
    //
    // =========================================================================

    AIH.SocialResponse.getPerceivedDisrespect =
        function(
            severity,
            faction
        ) {

            var resistance;
            var result;

            severity =
                AIH.SocialResponse._clamp01(
                    severity
                );

            resistance =
                AIH.SocialResponse.getResistance(
                    faction
                );

            /*
             * Strong confidence and pride make some forms of treatment
             * more personally significant because they conflict strongly
             * with her self-image.
             */

            result =
                severity *
                (
                    0.65 +
                    (
                        resistance *
                        0.35
                    )
                );

            return AIH.SocialResponse._clamp01(
                result
            );
        };

    // =========================================================================
    // AGGRESSIVE RESPONSE PRESSURE
    // =========================================================================
    //
    // This is NOT "attack".
    //
    // It represents pressure toward an assertive/aggressive response.
    //
    // =========================================================================

    AIH.SocialResponse.getAggressivePressure =
        function(
            severity,
            faction
        ) {

            var disrespect;
            var confidence;
            var anger;
            var frustration;
            var stress;
            var dominance;
            var result;

            disrespect =
                AIH.SocialResponse.getPerceivedDisrespect(
                    severity,
                    faction
                );

            confidence =
                AIH.SocialResponse._emotion(
                    "confidence"
                );

            anger =
                AIH.SocialResponse._emotion(
                    "anger"
                );

            frustration =
                AIH.SocialResponse._emotion(
                    "frustration"
                );

            stress =
                AIH.SocialResponse._emotion(
                    "stress"
                );

            dominance =
                AIH.Reputation.getAxis(
                    faction,
                    "dominance"
                );

            dominance =
                (
                    AIH.SocialResponse._clamp100(
                        dominance
                    ) + 100
                ) / 200;

            /*
             * Confidence increases willingness to confront.
             *
             * Anger and frustration increase pressure.
             *
             * Stress also increases instability, but less strongly.
             *
             * Dominance perception affects how naturally confrontation
             * fits the social identity currently attributed to her.
             */

            result =
                (
                    disrespect *
                    0.40
                ) +
                (
                    confidence *
                    0.20
                ) +
                (
                    anger *
                    0.20
                ) +
                (
                    frustration *
                    0.10
                ) +
                (
                    dominance *
                    0.10
                );

            result =
                result +
                (
                    stress *
                    0.05
                );

            return AIH.SocialResponse._clamp01(
                result
            );
        };

    // =========================================================================
    // GET COMPLETE RESPONSE CONTEXT
    // =========================================================================

    AIH.SocialResponse.getContext =
        function(
            faction,
            severity
        ) {

            var social;
            var confidence;
            var pride;
            var resistance;
            var disrespect;
            var aggression;

            social =
                AIH.Social.getContext(
                    faction
                );

            if (!social) {
                return null;
            }

            confidence =
                AIH.SocialResponse._emotion(
                    "confidence"
                );

            pride =
                AIH.SocialResponse._personality(
                    "pride"
                );

            resistance =
                AIH.SocialResponse.getResistance(
                    faction
                );

            disrespect =
                AIH.SocialResponse.getPerceivedDisrespect(
                    severity,
                    faction
                );

            aggression =
                AIH.SocialResponse.getAggressivePressure(
                    severity,
                    faction
                );

            return {

                schemaVersion:
                    AIH.SocialResponse.SCHEMA_VERSION,

                faction:
                    faction,

                interactionSeverity:
                    AIH.SocialResponse._clamp01(
                        severity
                    ),

                reputation:
                    social.coordinates,

                perceptions: {

                    standing:
                        social.standing,

                    lewdness:
                        social.lewdnessPerception,

                    dominance:
                        social.dominancePerception
                },

                heroineState: {

                    confidence:
                        confidence,

                    pride:
                        pride,

                    resistanceToDisrespect:
                        resistance
                },

                responsePressure: {

                    perceivedDisrespect:
                        disrespect,

                    aggressiveResponse:
                        aggression
                }
            };
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "SocialResponse",
        {
            version:
                AIH.SocialResponse.VERSION,

            initialize:
                function() {

                    AIH.SocialResponse.initialize();
                },

            getResistance:
                function(faction) {

                    return AIH.SocialResponse.getResistance(
                        faction
                    );
                },

            getContext:
                function(
                    faction,
                    severity
                ) {

                    return AIH.SocialResponse.getContext(
                        faction,
                        severity
                    );
                }
        }
    );

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    var _AIH_SocialResponse_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_SocialResponse_createGameObjects.call(
                this
            );

            AIH.SocialResponse.initialize();
        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_SocialResponse_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_SocialResponse_setupNewGame.call(
                this
            );

            AIH.SocialResponse._initialized =
                false;

            AIH.SocialResponse.initialize();
        };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_SocialResponse_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_SocialResponse_extractSaveContents.call(
                this,
                contents
            );

            AIH.SocialResponse._initialized =
                false;

            AIH.SocialResponse.initialize();
        };

})();