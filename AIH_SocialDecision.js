```javascript
/*:
 * @plugindesc AI Hero Framework - Social Decision System v1.0.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL DECISION
 * ============================================================================
 *
 * STEP 19
 *
 * Determines the heroine's preferred SOCIAL RESPONSE INTENT after a social
 * interaction has been objectively evaluated and subjectively interpreted.
 *
 * ============================================================================
 *
 * PIPELINE
 *
 * OBJECTIVE EVENT
 *        |
 *        v
 * SOCIAL INTERACTION
 *        |
 *        v
 * SUBJECTIVE INTERPRETATION
 *        |
 *        v
 * SOCIAL RESPONSE PRESSURE
 *        |
 *        v
 * SOCIAL DECISION
 *        |
 *        v
 * ACTION EXECUTION
 *
 * This module occupies the DECISION stage.
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - execute actions
 * - attack NPCs
 * - generate dialogue
 * - modify reputation
 * - modify personality
 * - modify values
 * - modify emotions
 * - create beliefs
 * - call the LLM
 *
 * It determines the heroine's preferred RESPONSE INTENT.
 *
 * ============================================================================
 *
 * POSSIBLE SOCIAL DECISIONS
 *
 *     ignore
 *     disengage
 *     comply
 *     appease
 *     assert
 *     confront
 *     resist
 *     retaliate
 *
 * These are INTENTS, not executable actions.
 *
 * ============================================================================
 *
 * PERSONALITY PARAMETERS USED
 *
 *     courage
 *     caution
 *     curiosity
 *     greed
 *     pride
 *     independence
 *     riskTolerance
 *     sociability
 *     confidence
 *
 * VALUE PARAMETERS USED
 *
 *     survival
 *     wealth
 *     power
 *     freedom
 *     comfort
 *     status
 *     pleasure
 *     modesty
 *     dignity
 *
 * EMOTIONAL PARAMETERS USED
 *
 *     confidence
 *     frustration
 *     fear
 *     embarrassment
 *     excitement
 *     anger
 *     stress
 *     fatigue
 *     comfort
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";


    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.SocialDecision =
        AIH.SocialDecision || {};

    AIH.SocialDecision.VERSION =
        "1.0.0";

    AIH.SocialDecision.SCHEMA_VERSION =
        1;

    AIH.SocialDecision._initialized =
        false;


    // =========================================================================
    // COPY
    // =========================================================================

    AIH.SocialDecision._copy =
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

    AIH.SocialDecision._clamp01 =
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

    AIH.SocialDecision._clamp100 =
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
    // PERSONALITY
    // =========================================================================

    AIH.SocialDecision._personality =
        function(key) {

            var personality;
            var value;

            if (
                typeof AIH.Personality ===
                "undefined"
            ) {
                return 0.5;
            }

            if (
                !AIH.Personality.get
            ) {
                return 0.5;
            }

            personality =
                AIH.Personality.get();

            if (
                !personality
            ) {
                return 0.5;
            }

            value =
                personality[key];

            if (
                value === undefined
            ) {
                return 0.5;
            }

            value =
                Number(value);

            if (isNaN(value)) {
                return 0.5;
            }

            return AIH.SocialDecision._clamp01(
                value
            );
        };


    // =========================================================================
    // VALUES
    // =========================================================================

    AIH.SocialDecision._value =
        function(key) {

            var values;
            var value;

            if (
                typeof AIH.Values ===
                "undefined"
            ) {
                return 0.5;
            }

            if (
                AIH.Values.getValue
            ) {

                value =
                    Number(
                        AIH.Values.getValue(
                            key
                        )
                    );

                if (!isNaN(value)) {

                    return AIH.SocialDecision._clamp01(
                        value
                    );
                }
            }

            if (
                AIH.Values.get
            ) {

                values =
                    AIH.Values.get();

                if (
                    values &&
                    values[key] !== undefined
                ) {

                    value =
                        Number(
                            values[key]
                        );

                    if (!isNaN(value)) {

                        return AIH.SocialDecision._clamp01(
                            value
                        );
                    }
                }
            }

            return 0.5;
        };


    // =========================================================================
    // EMOTIONS
    // =========================================================================

    AIH.SocialDecision._emotion =
        function(key) {

            var emotions;
            var value;

            if (
                typeof AIH.Emotions ===
                "undefined"
            ) {
                return 0.5;
            }

            if (
                AIH.Emotions.getValue
            ) {

                value =
                    Number(
                        AIH.Emotions.getValue(
                            key
                        )
                    );

                if (!isNaN(value)) {

                    return AIH.SocialDecision._clamp01(
                        value
                    );
                }
            }

            if (
                AIH.Emotions.get
            ) {

                emotions =
                    AIH.Emotions.get();

                if (
                    emotions &&
                    emotions[key] !== undefined
                ) {

                    value =
                        Number(
                            emotions[key]
                        );

                    if (!isNaN(value)) {

                        return AIH.SocialDecision._clamp01(
                            value
                        );
                    }
                }
            }

            return 0.5;
        };


    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialDecision.initialize =
        function() {

            AIH.SocialDecision._initialized =
                true;

            if (
                AIH.Debug &&
                AIH.Debug.log
            ) {

                AIH.Debug.log(
                    "Social decision system initialized."
                );
            }
        };


    // =========================================================================
    // GET INTERPRETATION
    // =========================================================================

    AIH.SocialDecision._getInterpretation =
        function(data) {

            var result;

            if (!data) {
                return null;
            }

            // -----------------------------------------------------------------
            // Already interpreted.
            // -----------------------------------------------------------------

            if (
                data.interpretation &&
                data.subjectiveSeverity !==
                    undefined
            ) {
                return data;
            }

            // -----------------------------------------------------------------
            // Ask SocialInterpretation to interpret the supplied data.
            // -----------------------------------------------------------------

            if (
                AIH.SocialInterpretation &&
                AIH.SocialInterpretation.interpret
            ) {

                result =
                    AIH.SocialInterpretation.interpret(
                        data
                    );

                if (result) {
                    return result;
                }
            }

            return null;
        };


    // =========================================================================
    // GET RESPONSE CONTEXT
    // =========================================================================

    AIH.SocialDecision._getResponseContext =
        function(
            interpretation
        ) {

            var faction;
            var severity;

            if (!interpretation) {
                return null;
            }

            faction =
                interpretation.faction;

            severity =
                AIH.SocialDecision._clamp01(
                    interpretation.subjectiveSeverity
                );

            if (
                AIH.SocialResponse &&
                AIH.SocialResponse.getContext
            ) {

                return AIH.SocialResponse.getContext(
                    faction,
                    severity
                );
            }

            return null;
        };


    // =========================================================================
    // BUILD STATE
    // =========================================================================

    AIH.SocialDecision._buildState =
        function(
            interpretation,
            responseContext
        ) {

            var faction;
            var interpretationData;
            var response;
            var state;

            faction =
                interpretation.faction;

            interpretationData =
                interpretation.interpretation ||
                {};

            response =
                responseContext &&
                responseContext.responsePressure
                    ? responseContext.responsePressure
                    : {};

            state = {

                faction:
                    faction,

                severity:
                    AIH.SocialDecision._clamp01(
                        interpretation.subjectiveSeverity
                    ),

                confidence:
                    AIH.SocialDecision._clamp01(
                        interpretation.interpretationConfidence
                    ),

                interpretation: {

                    demeaning:
                        interpretationData.demeaning ===
                        true,

                    threatening:
                        interpretationData.threatening ===
                        true,

                    flattering:
                        interpretationData.flattering ===
                        true,

                    respectful:
                        interpretationData.respectful ===
                        true,

                    humiliating:
                        interpretationData.humiliating ===
                        true,

                    sexualized:
                        interpretationData.sexualized ===
                        true,

                    patronizing:
                        interpretationData.patronizing ===
                        true,

                    controlling:
                        interpretationData.controlling ===
                        true,

                    disrespectful:
                        interpretationData.disrespectful ===
                        true
                },

                responsePressure: {

                    perceivedDisrespect:
                        AIH.SocialDecision._clamp01(
                            response.perceivedDisrespect
                        ),

                    aggressiveResponse:
                        AIH.SocialDecision._clamp01(
                            response.aggressiveResponse
                        )
                },

                personality: {

                    courage:
                        AIH.SocialDecision._personality(
                            "courage"
                        ),

                    caution:
                        AIH.SocialDecision._personality(
                            "caution"
                        ),

                    curiosity:
                        AIH.SocialDecision._personality(
                            "curiosity"
                        ),

                    greed:
                        AIH.SocialDecision._personality(
                            "greed"
                        ),

                    pride:
                        AIH.SocialDecision._personality(
                            "pride"
                        ),

                    independence:
                        AIH.SocialDecision._personality(
                            "independence"
                        ),

                    riskTolerance:
                        AIH.SocialDecision._personality(
                            "riskTolerance"
                        ),

                    sociability:
                        AIH.SocialDecision._personality(
                            "sociability"
                        ),

                    confidence:
                        AIH.SocialDecision._personality(
                            "confidence"
                        )
                },

                values: {

                    survival:
                        AIH.SocialDecision._value(
                            "survival"
                        ),

                    wealth:
                        AIH.SocialDecision._value(
                            "wealth"
                        ),

                    power:
                        AIH.SocialDecision._value(
                            "power"
                        ),

                    freedom:
                        AIH.SocialDecision._value(
                            "freedom"
                        ),

                    comfort:
                        AIH.SocialDecision._value(
                            "comfort"
                        ),

                    status:
                        AIH.SocialDecision._value(
                            "status"
                        ),

                    pleasure:
                        AIH.SocialDecision._value(
                            "pleasure"
                        ),

                    modesty:
                        AIH.SocialDecision._value(
                            "modesty"
                        ),

                    dignity:
                        AIH.SocialDecision._value(
                            "dignity"
                        )
                },

                emotions: {

                    confidence:
                        AIH.SocialDecision._emotion(
                            "confidence"
                        ),

                    frustration:
                        AIH.SocialDecision._emotion(
                            "frustration"
                        ),

                    fear:
                        AIH.SocialDecision._emotion(
                            "fear"
                        ),

                    embarrassment:
                        AIH.SocialDecision._emotion(
                            "embarrassment"
                        ),

                    excitement:
                        AIH.SocialDecision._emotion(
                            "excitement"
                        ),

                    anger:
                        AIH.SocialDecision._emotion(
                            "anger"
                        ),

                    stress:
                        AIH.SocialDecision._emotion(
                            "stress"
                        ),

                    fatigue:
                        AIH.SocialDecision._emotion(
                            "fatigue"
                        ),

                    comfort:
                        AIH.SocialDecision._emotion(
                            "comfort"
                        )
                }
            };

            return state;
        };


    // =========================================================================
    // SCORE: IGNORE
    // =========================================================================

    AIH.SocialDecision._scoreIgnore =
        function(state) {

            var score;

            score =
                0.20;

            score +=
                (
                    (1 - state.severity) *
                    0.25
                );

            score +=
                (
                    (1 -
                        state.responsePressure.perceivedDisrespect
                    ) *
                    0.20
                );

            score +=
                (
                    (1 - state.confidence) *
                    0.10
                );

            score +=
                (
                    (1 - state.personality.sociability) *
                    0.05
                );

            score +=
                (
                    state.emotions.fatigue *
                    0.05
                );

            score +=
                (
                    state.emotions.stress *
                    0.05
                );

            score +=
                (
                    state.emotions.comfort *
                    0.05
                );

            score -=
                (
                    state.interpretation.humiliating *
                    0.25
                );

            score -=
                (
                    state.interpretation.threatening *
                    0.20
                );

            score -=
                (
                    state.interpretation.controlling *
                    0.10
                );

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE: DISENGAGE
    // =========================================================================

    AIH.SocialDecision._scoreDisengage =
        function(state) {

            var score;

            score =
                0.15;

            score +=
                state.severity *
                0.15;

            score +=
                state.interpretation.controlling *
                0.20;

            score +=
                state.interpretation.patronizing *
                0.10;

            score +=
                state.interpretation.threatening *
                0.10;

            score +=
                state.personality.independence *
                0.15;

            score +=
                state.values.freedom *
                0.10;

            score +=
                state.emotions.stress *
                0.10;

            score +=
                state.emotions.fatigue *
                0.05;

            score +=
                state.emotions.fear *
                0.05;

            score -=
                state.personality.sociability *
                0.05;

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE: COMPLY
    // =========================================================================

    AIH.SocialDecision._scoreComply =
        function(state) {

            var score;

            score =
                0.10;

            score +=
                state.emotions.fear *
                0.20;

            score +=
                state.personality.caution *
                0.15;

            score +=
                state.values.survival *
                0.15;

            score +=
                state.personality.sociability *
                0.10;

            score +=
                state.emotions.stress *
                0.05;

            score +=
                (
                    1 -
                    state.responsePressure.aggressiveResponse
                ) *
                0.10;

            score +=
                (
                    1 -
                    state.responsePressure.perceivedDisrespect
                ) *
                0.05;

            score +=
                (
                    1 -
                    state.values.dignity
                ) *
                0.05;

            score -=
                state.values.freedom *
                0.15;

            score -=
                state.personality.independence *
                0.10;

            score -=
                state.personality.pride *
                0.10;

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE: APPEASE
    // =========================================================================

    AIH.SocialDecision._scoreAppease =
        function(state) {

            var score;

            score =
                0.10;

            score +=
                state.personality.sociability *
                0.20;

            score +=
                state.values.status *
                0.15;

            score +=
                state.values.pleasure *
                0.10;

            score +=
                state.values.comfort *
                0.10;

            score +=
                (
                    1 -
                    state.emotions.anger
                ) *
                0.10;

            score +=
                (
                    1 -
                    state.emotions.frustration
                ) *
                0.05;

            score +=
                (
                    1 -
                    state.responsePressure.aggressiveResponse
                ) *
                0.10;

            score +=
                state.emotions.stress *
                0.05;

            score -=
                state.values.dignity *
                0.10;

            score -=
                state.personality.pride *
                0.10;

            score -=
                state.values.freedom *
                0.05;

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE: ASSERT
    // =========================================================================

    AIH.SocialDecision._scoreAssert =
        function(state) {

            var score;

            score =
                0.15;

            score +=
                state.responsePressure.perceivedDisrespect *
                0.20;

            score +=
                state.personality.confidence *
                0.15;

            score +=
                state.personality.pride *
                0.10;

            score +=
                state.personality.independence *
                0.10;

            score +=
                state.values.dignity *
                0.15;

            score +=
                state.values.freedom *
                0.10;

            score +=
                state.values.status *
                0.05;

            score +=
                state.emotions.anger *
                0.05;

            score +=
                state.emotions.confidence *
                0.05;

            score -=
                state.emotions.fear *
                0.10;

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE: CONFRONT
    // =========================================================================

    AIH.SocialDecision._scoreConfront =
        function(state) {

            var score;

            score =
                0.05;

            score +=
                state.responsePressure.aggressiveResponse *
                0.20;

            score +=
                state.responsePressure.perceivedDisrespect *
                0.10;

            score +=
                state.personality.courage *
                0.15;

            score +=
                state.personality.confidence *
                0.15;

            score +=
                state.personality.pride *
                0.10;

            score +=
                state.personality.independence *
                0.05;

            score +=
                state.personality.riskTolerance *
                0.10;

            score +=
                state.values.dignity *
                0.05;

            score +=
                state.values.power *
                0.05;

            score +=
                state.emotions.anger *
                0.10;

            score -=
                state.emotions.fear *
                0.20;

            score -=
                state.personality.caution *
                0.10;

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE: RESIST
    // =========================================================================

    AIH.SocialDecision._scoreResist =
        function(state) {

            var score;

            score =
                0.15;

            score +=
                state.interpretation.controlling *
                0.20;

            score +=
                state.responsePressure.perceivedDisrespect *
                0.10;

            score +=
                state.personality.independence *
                0.15;

            score +=
                state.values.freedom *
                0.20;

            score +=
                state.values.dignity *
                0.10;

            score +=
                state.personality.pride *
                0.05;

            score +=
                state.personality.confidence *
                0.05;

            score +=
                state.personality.courage *
                0.05;

            score -=
                state.emotions.fear *
                0.10;

            score -=
                state.personality.caution *
                0.05;

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE: RETALIATE
    // =========================================================================

    AIH.SocialDecision._scoreRetaliate =
        function(state) {

            var score;

            score =
                0.03;

            score +=
                state.interpretation.humiliating *
                0.20;

            score +=
                state.interpretation.threatening *
                0.10;

            score +=
                state.interpretation.disrespectful *
                0.05;

            score +=
                state.responsePressure.aggressiveResponse *
                0.20;

            score +=
                state.emotions.anger *
                0.20;

            score +=
                state.emotions.frustration *
                0.05;

            score +=
                state.emotions.embarrassment *
                0.05;

            score +=
                state.personality.courage *
                0.10;

            score +=
                state.personality.confidence *
                0.05;

            score +=
                state.personality.pride *
                0.10;

            score +=
                state.personality.riskTolerance *
                0.05;

            score -=
                state.emotions.fear *
                0.15;

            score -=
                state.personality.caution *
                0.10;

            score -=
                state.values.survival *
                0.05;

            score -=
                state.emotions.stress *
                0.05;

            return AIH.SocialDecision._clamp01(
                score
            );
        };


    // =========================================================================
    // SCORE ALL DECISIONS
    // =========================================================================

    AIH.SocialDecision._scoreCandidates =
        function(state) {

            return {

                ignore:
                    AIH.SocialDecision._scoreIgnore(
                        state
                    ),

                disengage:
                    AIH.SocialDecision._scoreDisengage(
                        state
                    ),

                comply:
                    AIH.SocialDecision._scoreComply(
                        state
                    ),

                appease:
                    AIH.SocialDecision._scoreAppease(
                        state
                    ),

                assert:
                    AIH.SocialDecision._scoreAssert(
                        state
                    ),

                confront:
                    AIH.SocialDecision._scoreConfront(
                        state
                    ),

                resist:
                    AIH.SocialDecision._scoreResist(
                        state
                    ),

                retaliate:
                    AIH.SocialDecision._scoreRetaliate(
                        state
                    )
            };
        };


    // =========================================================================
    // GET BEST DECISION
    // =========================================================================

    AIH.SocialDecision._getBestDecision =
        function(scores) {

            var keys;
            var best;
            var bestScore;
            var i;
            var key;

            keys =
                Object.keys(
                    scores
                );

            best =
                "ignore";

            bestScore =
                -1;

            for (
                i = 0;
                i < keys.length;
                i++
            ) {

                key =
                    keys[i];

                if (
                    scores[key] >
                    bestScore
                ) {

                    bestScore =
                        scores[key];

                    best =
                        key;
                }
            }

            return {

                decision:
                    best,

                score:
                    AIH.SocialDecision._clamp01(
                        bestScore
                    )
            };
        };


    // =========================================================================
    // DECISION CONFIDENCE
    // =========================================================================

    AIH.SocialDecision._getDecisionConfidence =
        function(scores) {

            var keys;
            var highest;
            var second;
            var i;
            var value;

            keys =
                Object.keys(
                    scores
                );

            highest =
                -1;

            second =
                -1;

            for (
                i = 0;
                i < keys.length;
                i++
            ) {

                value =
                    AIH.SocialDecision._clamp01(
                        scores[keys[i]]
                    );

                if (
                    value > highest
                ) {

                    second =
                        highest;

                    highest =
                        value;

                } else if (
                    value > second
                ) {

                    second =
                        value;
                }
            }

            if (second < 0) {
                second = 0;
            }

            return AIH.SocialDecision._clamp01(
                0.50 +
                (
                    (highest - second) *
                    0.50
                )
            );
        };


    // =========================================================================
    // GET DECISION REASONS
    // =========================================================================

    AIH.SocialDecision._getReasons =
        function(
            state,
            decision
        ) {

            var reasons;

            reasons = [];


            if (
                state.interpretation.demeaning
            ) {

                reasons.push(
                    "interaction_perceived_as_demeaning"
                );
            }


            if (
                state.interpretation.disrespectful
            ) {

                reasons.push(
                    "interaction_perceived_as_disrespectful"
                );
            }


            if (
                state.interpretation.humiliating
            ) {

                reasons.push(
                    "interaction_perceived_as_humiliating"
                );
            }


            if (
                state.interpretation.threatening
            ) {

                reasons.push(
                    "interaction_perceived_as_threatening"
                );
            }


            if (
                state.interpretation.controlling
            ) {

                reasons.push(
                    "interaction_perceived_as_controlling"
                );
            }


            if (
                state.interpretation.patronizing
            ) {

                reasons.push(
                    "interaction_perceived_as_patronizing"
                );
            }


            if (
                state.interpretation.sexualized
            ) {

                reasons.push(
                    "interaction_perceived_as_sexualized"
                );
            }


            if (
                state.responsePressure.perceivedDisrespect >=
                0.70
            ) {

                reasons.push(
                    "high_perceived_disrespect"
                );
            }


            if (
                state.responsePressure.aggressiveResponse >=
                0.70
            ) {

                reasons.push(
                    "high_aggressive_response_pressure"
                );
            }


            if (
                state.personality.pride >=
                0.75
            ) {

                reasons.push(
                    "high_pride"
                );
            }


            if (
                state.personality.independence >=
                0.75
            ) {

                reasons.push(
                    "high_independence"
                );
            }


            if (
                state.personality.courage >=
                0.75
            ) {

                reasons.push(
                    "high_courage"
                );
            }


            if (
                state.personality.riskTolerance >=
                0.75
            ) {

                reasons.push(
                    "high_risk_tolerance"
                );
            }


            if (
                state.personality.caution >=
                0.75
            ) {

                reasons.push(
                    "high_caution"
                );
            }


            if (
                state.personality.sociability >=
                0.75
            ) {

                reasons.push(
                    "high_sociability"
                );
            }


            if (
                state.personality.confidence >=
                0.75
            ) {

                reasons.push(
                    "high_personality_confidence"
                );
            }


            if (
                state.emotions.anger >=
                0.70
            ) {

                reasons.push(
                    "high_anger"
                );
            }


            if (
                state.emotions.fear >=
                0.70
            ) {

                reasons.push(
                    "high_fear"
                );
            }


            if (
                state.emotions.embarrassment >=
                0.70
            ) {

                reasons.push(
                    "high_embarrassment"
                );
            }


            if (
                state.emotions.stress >=
                0.70
            ) {

                reasons.push(
                    "high_stress"
                );
            }


            if (
                state.values.freedom >=
                0.75
            ) {

                reasons.push(
                    "high_freedom_value"
                );
            }


            if (
                state.values.dignity >=
                0.75
            ) {

                reasons.push(
                    "high_dignity_value"
                );
            }


            if (
                state.values.survival >=
                0.75
            ) {

                reasons.push(
                    "high_survival_value"
                );
            }


            if (
                state.values.status >=
                0.75
            ) {

                reasons.push(
                    "high_status_value"
                );
            }


            if (
                decision ===
                "ignore"
            ) {

                reasons.push(
                    "non_response_is_preferred"
                );
            }


            if (
                decision ===
                "disengage"
            ) {

                reasons.push(
                    "withdrawal_is_preferred_to_escalation"
                );
            }


            if (
                decision ===
                "comply"
            ) {

                reasons.push(
                    "cooperation_is_preferred"
                );
            }


            if (
                decision ===
                "appease"
            ) {

                reasons.push(
                    "social_harmony_is_preferred"
                );
            }


            if (
                decision ===
                "assert"
            ) {

                reasons.push(
                    "boundary_setting_is_preferred"
                );
            }


            if (
                decision ===
                "confront"
            ) {

                reasons.push(
                    "direct_confrontation_is_preferred"
                );
            }


            if (
                decision ===
                "resist"
            ) {

                reasons.push(
                    "freedom_preservation_is_preferred"
                );
            }


            if (
                decision ===
                "retaliate"
            ) {

                reasons.push(
                    "retaliation_pressure_is_high"
                );
            }


            return reasons;
        };


    // =========================================================================
    // DECIDE
    // =========================================================================

    AIH.SocialDecision.decide =
        function(data) {

            var interpretation;
            var responseContext;
            var state;
            var scores;
            var winner;
            var reasons;
            var decisionConfidence;

            if (!data) {
                return null;
            }

            // -----------------------------------------------------------------
            // INTERPRETATION
            // -----------------------------------------------------------------

            interpretation =
                AIH.SocialDecision._getInterpretation(
                    data
                );

            if (!interpretation) {
                return null;
            }

            if (
                !interpretation.faction
            ) {
                return null;
            }

            // -----------------------------------------------------------------
            // RESPONSE PRESSURE
            // -----------------------------------------------------------------

            responseContext =
                AIH.SocialDecision._getResponseContext(
                    interpretation
                );

            // -----------------------------------------------------------------
            // STATE
            // -----------------------------------------------------------------

            state =
                AIH.SocialDecision._buildState(
                    interpretation,
                    responseContext
                );

            // -----------------------------------------------------------------
            // CANDIDATES
            // -----------------------------------------------------------------

            scores =
                AIH.SocialDecision._scoreCandidates(
                    state
                );

            // -----------------------------------------------------------------
            // WINNER
            // -----------------------------------------------------------------

            winner =
                AIH.SocialDecision._getBestDecision(
                    scores
                );

            // -----------------------------------------------------------------
            // DECISION CONFIDENCE
            // -----------------------------------------------------------------

            decisionConfidence =
                AIH.SocialDecision._getDecisionConfidence(
                    scores
                );

            // -----------------------------------------------------------------
            // REASONS
            // -----------------------------------------------------------------

            reasons =
                AIH.SocialDecision._getReasons(
                    state,
                    winner.decision
                );

            // -----------------------------------------------------------------
            // RESULT
            // -----------------------------------------------------------------

            return {

                schemaVersion:
                    AIH.SocialDecision.SCHEMA_VERSION,

                faction:
                    interpretation.faction,

                sourceId:
                    interpretation.sourceId,

                sourceName:
                    interpretation.sourceName,

                decision:
                    winner.decision,

                decisionScore:
                    winner.score,

                decisionConfidence:
                    decisionConfidence,

                candidates:
                    AIH.SocialDecision._copy(
                        scores
                    ),

                interpretation:
                    AIH.SocialDecision._copy(
                        interpretation.interpretation
                    ),

                subjectiveSeverity:
                    AIH.SocialDecision._clamp01(
                        interpretation.subjectiveSeverity
                    ),

                interpretationConfidence:
                    AIH.SocialDecision._clamp01(
                        interpretation.interpretationConfidence
                    ),

                responseContext:
                    AIH.SocialDecision._copy(
                        responseContext
                    ),

                state:
                    AIH.SocialDecision._copy(
                        state
                    ),

                reasons:
                    reasons,

                timestamp:
                    Date.now()
            };
        };


    // =========================================================================
    // CONVENIENCE: GET DECISION ONLY
    // =========================================================================

    AIH.SocialDecision.getDecision =
        function(data) {

            var result;

            result =
                AIH.SocialDecision.decide(
                    data
                );

            if (!result) {
                return null;
            }

            return result.decision;
        };


    // =========================================================================
    // CONVENIENCE: GET CANDIDATE SCORES
    // =========================================================================

    AIH.SocialDecision.getScores =
        function(data) {

            var result;

            result =
                AIH.SocialDecision.decide(
                    data
                );

            if (!result) {
                return null;
            }

            return AIH.SocialDecision._copy(
                result.candidates
            );
        };


    // =========================================================================
    // CONVENIENCE: GET DECISION CONTEXT
    // =========================================================================

    AIH.SocialDecision.getContext =
        function(data) {

            var result;

            result =
                AIH.SocialDecision.decide(
                    data
                );

            if (!result) {
                return null;
            }

            return AIH.SocialDecision._copy(
                result
            );
        };


    // =========================================================================
    // CONVENIENCE: SHOULD RESPOND
    // =========================================================================

    AIH.SocialDecision.shouldRespond =
        function(data) {

            var result;
            var ignoreScore;
            var bestActive;
            var keys;
            var i;
            var key;

            result =
                AIH.SocialDecision.decide(
                    data
                );

            if (!result) {
                return false;
            }

            ignoreScore =
                result.candidates.ignore;

            bestActive =
                0;

            keys =
                Object.keys(
                    result.candidates
                );

            for (
                i = 0;
                i < keys.length;
                i++
            ) {

                key =
                    keys[i];

                if (
                    key ===
                    "ignore"
                ) {
                    continue;
                }

                if (
                    result.candidates[key] >
                    bestActive
                ) {

                    bestActive =
                        result.candidates[key];
                }
            }

            return (
                bestActive >
                ignoreScore
            );
        };


    // =========================================================================
    // CONVENIENCE: IS ESCALATION LIKELY
    // =========================================================================
    //
    // Escalation here means that confrontation or retaliation has substantial
    // pressure. It does NOT execute combat.
    //
    // =========================================================================

    AIH.SocialDecision.isEscalationLikely =
        function(data) {

            var result;
            var confrontation;
            var retaliation;

            result =
                AIH.SocialDecision.decide(
                    data
                );

            if (!result) {
                return false;
            }

            confrontation =
                result.candidates.confront;

            retaliation =
                result.candidates.retaliate;

            return (
                confrontation >= 0.60 ||
                retaliation >= 0.60
            );
        };


    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        AIH.Modules &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "SocialDecision",
            {
                version:
                    AIH.SocialDecision.VERSION,

                initialize:
                    function() {

                        AIH.SocialDecision.initialize();
                    },

                decide:
                    function(data) {

                        return AIH.SocialDecision.decide(
                            data
                        );
                    },

                getDecision:
                    function(data) {

                        return AIH.SocialDecision.getDecision(
                            data
                        );
                    },

                getScores:
                    function(data) {

                        return AIH.SocialDecision.getScores(
                            data
                        );
                    },

                getContext:
                    function(data) {

                        return AIH.SocialDecision.getContext(
                            data
                        );
                    },

                shouldRespond:
                    function(data) {

                        return AIH.SocialDecision.shouldRespond(
                            data
                        );
                    },

                isEscalationLikely:
                    function(data) {

                        return AIH.SocialDecision.isEscalationLikely(
                            data
                        );
                    }
            }
        );
    }


    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    if (
        typeof DataManager !==
        "undefined"
    ) {

        var _AIH_SocialDecision_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects =
            function() {

                _AIH_SocialDecision_createGameObjects.call(
                    this
                );

                AIH.SocialDecision.initialize();
            };


        // =====================================================================
        // NEW GAME
        // =====================================================================

        var _AIH_SocialDecision_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame =
            function() {

                _AIH_SocialDecision_setupNewGame.call(
                    this
                );

                AIH.SocialDecision._initialized =
                    false;

                AIH.SocialDecision.initialize();
            };


        // =====================================================================
        // SAVE LOAD
        // =====================================================================

        var _AIH_SocialDecision_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_SocialDecision_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.SocialDecision._initialized =
                    false;

                AIH.SocialDecision.initialize();
            };
    }

})();
```
