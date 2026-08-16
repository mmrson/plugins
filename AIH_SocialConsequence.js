/*:
 * @plugindesc AI Hero Framework - Social Action Consequence System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL ACTION CONSEQUENCES
 * ============================================================================
 *
 * STEP 21
 *
 * Determines the immediate SYSTEM CONSEQUENCES of an executed social action.
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
 * SOCIAL ACTION
 *        |
 *        v
 * ACTION EXECUTION
 *        |
 *        v
 * ACTION CONSEQUENCES
 *
 * This module occupies the CONSEQUENCE stage.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This module does NOT:
 *
 * - decide the response
 * - execute the action
 * - generate dialogue
 * - call the LLM
 * - directly alter personality
 * - directly alter values
 * - directly alter reputation
 *
 * It produces a structured CONSEQUENCE REQUEST.
 *
 * Other systems may consume that request and perform the actual mutations.
 *
 * ============================================================================
 *
 * POSSIBLE CONSEQUENCES
 *
 *     emotional pressure
 *     reputation pressure
 *     social relationship pressure
 *     interaction continuation
 *     interaction termination
 *     escalation pressure
 *     combat pressure
 *
 * ============================================================================
 *
 * DESIGN PRINCIPLE
 *
 * SocialDecision answers:
 *
 *     "What does she want to do?"
 *
 * SocialAction answers:
 *
 *     "What action should be attempted?"
 *
 * SocialConsequence answers:
 *
 *     "What should happen because that action occurred?"
 *
 * The consequence system therefore does not mutate game state itself.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";


    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.SocialConsequence =
        AIH.SocialConsequence || {};

    AIH.SocialConsequence.VERSION =
        "0.1.0";

    AIH.SocialConsequence.SCHEMA_VERSION =
        1;

    AIH.SocialConsequence._initialized =
        false;


    // =========================================================================
    // COPY
    // =========================================================================

    AIH.SocialConsequence._copy =
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

    AIH.SocialConsequence._clamp01 =
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
    // CLAMP -1 TO +1
    // =========================================================================

    AIH.SocialConsequence._clampSigned =
        function(value) {

            value =
                Number(value);

            if (isNaN(value)) {
                return 0;
            }

            if (value < -1) {
                return -1;
            }

            if (value > 1) {
                return 1;
            }

            return value;
        };


    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialConsequence.initialize =
        function() {

            AIH.SocialConsequence._initialized =
                true;

            if (
                AIH.Debug &&
                AIH.Debug.log
            ) {

                AIH.Debug.log(
                    "Social consequence system initialized."
                );
            }
        };


    // =========================================================================
    // CONSEQUENCE TYPES
    // =========================================================================

    AIH.SocialConsequence.TYPES = [

        "none",

        "emotional_pressure",

        "reputation_pressure",

        "relationship_pressure",

        "continue_interaction",

        "end_interaction",

        "escalation_pressure",

        "combat_pressure"

    ];


    // =========================================================================
    // GET ACTION
    // =========================================================================

    AIH.SocialConsequence._getAction =
        function(action) {

            if (!action) {
                return null;
            }

            return action;
        };


    // =========================================================================
    // GET STATE
    // =========================================================================

    AIH.SocialConsequence._getState =
        function(action) {

            if (
                action &&
                action.state
            ) {

                return action.state;
            }

            return {};
        };


    // =========================================================================
    // GET EMOTION
    // =========================================================================

    AIH.SocialConsequence._emotion =
        function(
            state,
            key
        ) {

            if (
                !state ||
                !state.emotions
            ) {

                return 0.5;
            }

            return AIH.SocialConsequence._clamp01(
                state.emotions[key]
            );
        };


    // =========================================================================
    // GET VALUE
    // =========================================================================

    AIH.SocialConsequence._value =
        function(
            state,
            key
        ) {

            if (
                !state ||
                !state.values
            ) {

                return 0.5;
            }

            return AIH.SocialConsequence._clamp01(
                state.values[key]
            );
        };


    // =========================================================================
    // GET PERSONALITY
    // =========================================================================

    AIH.SocialConsequence._personality =
        function(
            state,
            key
        ) {

            if (
                !state ||
                !state.personality
            ) {

                return 0.5;
            }

            return AIH.SocialConsequence._clamp01(
                state.personality[key]
            );
        };


    // =========================================================================
    // GET INTERPRETATION
    // =========================================================================

    AIH.SocialConsequence._interpretation =
        function(
            action,
            key
        ) {

            if (
                !action ||
                !action.interpretation
            ) {

                return false;
            }

            return (
                action.interpretation[key] ===
                true
            );
        };


    // =========================================================================
    // BUILD EMOTIONAL PRESSURE
    // =========================================================================
    //
    // This describes emotional pressure generated by the social event.
    //
    // It does not directly change AIH.Emotions.
    //
    // =========================================================================

    AIH.SocialConsequence._buildEmotionalPressure =
        function(action) {

            var state;
            var pressure;
            var intensity;

            state =
                AIH.SocialConsequence._getState(
                    action
                );

            intensity =
                AIH.SocialConsequence._clamp01(
                    action.subjectiveSeverity
                );

            pressure = {

                confidence:
                    0,

                frustration:
                    0,

                fear:
                    0,

                embarrassment:
                    0,

                excitement:
                    0,

                anger:
                    0,

                stress:
                    0,

                fatigue:
                    0,

                comfort:
                    0

            };


            // -----------------------------------------------------------------
            // IGNORE
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "ignore"
            ) {

                pressure.comfort +=
                    0.05 *
                    this._value(
                        state,
                        "comfort"
                    );

            }


            // -----------------------------------------------------------------
            // DISENGAGE
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "disengage"
            ) {

                pressure.stress +=
                    0.08 *
                    intensity;

                pressure.fear +=
                    0.04 *
                    intensity;

                pressure.comfort +=
                    0.12 *
                    intensity;

            }


            // -----------------------------------------------------------------
            // COMPLY
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "comply"
            ) {

                pressure.stress +=
                    0.06 *
                    intensity;

                pressure.fear +=
                    0.05 *
                    intensity;

                pressure.comfort +=
                    0.04;

            }


            // -----------------------------------------------------------------
            // APPEASE
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "appease"
            ) {

                pressure.stress +=
                    0.05 *
                    intensity;

                pressure.comfort +=
                    0.10;

                pressure.frustration +=
                    0.04 *
                    intensity;

            }


            // -----------------------------------------------------------------
            // ASSERT
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "assert"
            ) {

                pressure.confidence +=
                    0.10 *
                    intensity;

                pressure.anger +=
                    0.05 *
                    intensity;

                pressure.stress +=
                    0.04 *
                    intensity;

            }


            // -----------------------------------------------------------------
            // CONFRONT
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "confront"
            ) {

                pressure.confidence +=
                    0.08 *
                    intensity;

                pressure.anger +=
                    0.12 *
                    intensity;

                pressure.frustration +=
                    0.08 *
                    intensity;

                pressure.stress +=
                    0.10 *
                    intensity;

                pressure.excitement +=
                    0.05 *
                    intensity;

            }


            // -----------------------------------------------------------------
            // RESIST
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "resist"
            ) {

                pressure.confidence +=
                    0.08 *
                    intensity;

                pressure.anger +=
                    0.07 *
                    intensity;

                pressure.frustration +=
                    0.08 *
                    intensity;

                pressure.stress +=
                    0.06 *
                    intensity;

            }


            // -----------------------------------------------------------------
            // RETALIATE
            // -----------------------------------------------------------------

            if (
                action.decision ===
                "retaliate"
            ) {

                pressure.confidence +=
                    0.06 *
                    intensity;

                pressure.anger +=
                    0.18 *
                    intensity;

                pressure.frustration +=
                    0.12 *
                    intensity;

                pressure.stress +=
                    0.12 *
                    intensity;

                pressure.excitement +=
                    0.08 *
                    intensity;

            }


            // -----------------------------------------------------------------
            // INTERPRETATION MODIFIERS
            // -----------------------------------------------------------------

            if (
                AIH.SocialConsequence._interpretation(
                    action,
                    "humiliating"
                )
            ) {

                pressure.embarrassment +=
                    0.12 *
                    intensity;

                pressure.anger +=
                    0.08 *
                    intensity;

            }


            if (
                AIH.SocialConsequence._interpretation(
                    action,
                    "threatening"
                )
            ) {

                pressure.fear +=
                    0.12 *
                    intensity;

                pressure.stress +=
                    0.12 *
                    intensity;

            }


            if (
                AIH.SocialConsequence._interpretation(
                    action,
                    "demeaning"
                )
            ) {

                pressure.frustration +=
                    0.08 *
                    intensity;

            }


            if (
                AIH.SocialConsequence._interpretation(
                    action,
                    "respectful"
                )
            ) {

                pressure.comfort +=
                    0.08 *
                    intensity;

            }


            return {

                confidence:
                    AIH.SocialConsequence._clampSigned(
                        pressure.confidence
                    ),

                frustration:
                    AIH.SocialConsequence._clampSigned(
                        pressure.frustration
                    ),

                fear:
                    AIH.SocialConsequence._clampSigned(
                        pressure.fear
                    ),

                embarrassment:
                    AIH.SocialConsequence._clampSigned(
                        pressure.embarrassment
                    ),

                excitement:
                    AIH.SocialConsequence._clampSigned(
                        pressure.excitement
                    ),

                anger:
                    AIH.SocialConsequence._clampSigned(
                        pressure.anger
                    ),

                stress:
                    AIH.SocialConsequence._clampSigned(
                        pressure.stress
                    ),

                fatigue:
                    AIH.SocialConsequence._clampSigned(
                        pressure.fatigue
                    ),

                comfort:
                    AIH.SocialConsequence._clampSigned(
                        pressure.comfort
                    )

            };
        };


    // =========================================================================
    // BUILD REPUTATION PRESSURE
    // =========================================================================
    //
    // This is pressure, not an immediate reputation mutation.
    //
    // =========================================================================

    AIH.SocialConsequence._buildReputationPressure =
        function(action) {

            var state;
            var intensity;
            var pressure;

            state =
                AIH.SocialConsequence._getState(
                    action
                );

            intensity =
                AIH.SocialConsequence._clamp01(
                    action.subjectiveSeverity
                );

            pressure = {

                dominance:
                    0,

                reputation:
                    0

            };


            if (
                action.decision ===
                "comply"
            ) {

                pressure.dominance -=
                    0.04 *
                    intensity;

            }


            if (
                action.decision ===
                "appease"
            ) {

                pressure.dominance -=
                    0.02 *
                    intensity;

            }


            if (
                action.decision ===
                "assert"
            ) {

                pressure.dominance +=
                    0.05 *
                    intensity;

                pressure.reputation +=
                    0.02 *
                    intensity;

            }


            if (
                action.decision ===
                "confront"
            ) {

                pressure.dominance +=
                    0.08 *
                    intensity;

                pressure.reputation +=
                    0.04 *
                    intensity;

            }


            if (
                action.decision ===
                "resist"
            ) {

                pressure.dominance +=
                    0.07 *
                    intensity;

                pressure.reputation +=
                    0.03 *
                    intensity;

            }


            if (
                action.decision ===
                "retaliate"
            ) {

                pressure.dominance +=
                    0.12 *
                    intensity;

                pressure.reputation +=
                    0.08 *
                    intensity;

            }


            // High status sensitivity makes social consequences matter more.

            if (
                state.values &&
                state.values.status !==
                undefined
            ) {

                pressure.reputation *=
                    0.75 +
                    (
                        AIH.SocialConsequence._value(
                            state,
                            "status"
                        ) *
                        0.50
                    );

            }


            return {

                dominance:
                    AIH.SocialConsequence._clampSigned(
                        pressure.dominance
                    ),

                reputation:
                    AIH.SocialConsequence._clampSigned(
                        pressure.reputation
                    )

            };
        };


    // =========================================================================
    // BUILD RELATIONSHIP PRESSURE
    // =========================================================================

    AIH.SocialConsequence._buildRelationshipPressure =
        function(action) {

            var intensity;
            var pressure;

            intensity =
                AIH.SocialConsequence._clamp01(
                    action.subjectiveSeverity
                );

            pressure = {

                trust:
                    0,

                hostility:
                    0,

                warmth:
                    0,

                cooperation:
                    0

            };


            if (
                action.decision ===
                "ignore"
            ) {

                pressure.warmth -=
                    0.02 *
                    intensity;

            }


            if (
                action.decision ===
                "disengage"
            ) {

                pressure.cooperation -=
                    0.06 *
                    intensity;

                pressure.warmth -=
                    0.04 *
                    intensity;

            }


            if (
                action.decision ===
                "comply"
            ) {

                pressure.cooperation +=
                    0.08 *
                    intensity;

                pressure.trust +=
                    0.03 *
                    intensity;

            }


            if (
                action.decision ===
                "appease"
            ) {

                pressure.warmth +=
                    0.10 *
                    intensity;

                pressure.cooperation +=
                    0.06 *
                    intensity;

            }


            if (
                action.decision ===
                "assert"
            ) {

                pressure.trust +=
                    0.03 *
                    intensity;

                pressure.cooperation -=
                    0.03 *
                    intensity;

            }


            if (
                action.decision ===
                "confront"
            ) {

                pressure.hostility +=
                    0.10 *
                    intensity;

                pressure.cooperation -=
                    0.08 *
                    intensity;

            }


            if (
                action.decision ===
                "resist"
            ) {

                pressure.hostility +=
                    0.06 *
                    intensity;

                pressure.cooperation -=
                    0.05 *
                    intensity;

            }


            if (
                action.decision ===
                "retaliate"
            ) {

                pressure.hostility +=
                    0.18 *
                    intensity;

                pressure.cooperation -=
                    0.15 *
                    intensity;

                pressure.trust -=
                    0.10 *
                    intensity;

            }


            return {

                trust:
                    AIH.SocialConsequence._clampSigned(
                        pressure.trust
                    ),

                hostility:
                    AIH.SocialConsequence._clampSigned(
                        pressure.hostility
                    ),

                warmth:
                    AIH.SocialConsequence._clampSigned(
                        pressure.warmth
                    ),

                cooperation:
                    AIH.SocialConsequence._clampSigned(
                        pressure.cooperation
                    )

            };
        };


    // =========================================================================
    // BUILD INTERACTION CONSEQUENCE
    // =========================================================================

    AIH.SocialConsequence._buildInteraction =
        function(action) {

            var result;

            result = {

                continueInteraction:
                    true,

                endInteraction:
                    false,

                escalationPressure:
                    0,

                combatPressure:
                    0

            };


            if (
                action.decision ===
                "ignore"
            ) {

                result.continueInteraction =
                    false;

                result.endInteraction =
                    true;

            }


            if (
                action.decision ===
                "disengage"
            ) {

                result.continueInteraction =
                    false;

                result.endInteraction =
                    true;

            }


            if (
                action.decision ===
                "comply"
            ) {

                result.continueInteraction =
                    true;

            }


            if (
                action.decision ===
                "appease"
            ) {

                result.continueInteraction =
                    true;

            }


            if (
                action.decision ===
                "assert"
            ) {

                result.continueInteraction =
                    true;

                result.escalationPressure =
                    0.20;

            }


            if (
                action.decision ===
                "confront"
            ) {

                result.continueInteraction =
                    true;

                result.escalationPressure =
                    0.55;

            }


            if (
                action.decision ===
                "resist"
            ) {

                result.continueInteraction =
                    true;

                result.escalationPressure =
                    0.45;

            }


            if (
                action.decision ===
                "retaliate"
            ) {

                result.continueInteraction =
                    true;

                result.escalationPressure =
                    0.85;

                result.combatPressure =
                    0.60;

            }


            // Threatening interactions increase escalation pressure.

            if (
                AIH.SocialConsequence._interpretation(
                    action,
                    "threatening"
                )
            ) {

                result.escalationPressure +=
                    0.10 *
                    AIH.SocialConsequence._clamp01(
                        action.subjectiveSeverity
                    );

            }


            result.escalationPressure =
                AIH.SocialConsequence._clamp01(
                    result.escalationPressure
                );

            result.combatPressure =
                AIH.SocialConsequence._clamp01(
                    result.combatPressure
                );


            return result;
        };


    // =========================================================================
    // BUILD
    // =========================================================================

    AIH.SocialConsequence.build =
        function(action) {

            var emotionalPressure;
            var reputationPressure;
            var relationshipPressure;
            var interaction;
            var result;

            if (
                !action
            ) {

                return null;
            }

            if (
                !action.decision
            ) {

                return null;
            }

            emotionalPressure =
                AIH.SocialConsequence._buildEmotionalPressure(
                    action
                );

            reputationPressure =
                AIH.SocialConsequence._buildReputationPressure(
                    action
                );

            relationshipPressure =
                AIH.SocialConsequence._buildRelationshipPressure(
                    action
                );

            interaction =
                AIH.SocialConsequence._buildInteraction(
                    action
                );

            result = {

                schemaVersion:
                    AIH.SocialConsequence.SCHEMA_VERSION,

                faction:
                    action.faction,

                sourceId:
                    action.sourceId,

                sourceName:
                    action.sourceName,

                decision:
                    action.decision,

                actionType:
                    action.actionType,

                decisionScore:
                    AIH.SocialConsequence._clamp01(
                        action.decisionScore
                    ),

                decisionConfidence:
                    AIH.SocialConsequence._clamp01(
                        action.decisionConfidence
                    ),

                subjectiveSeverity:
                    AIH.SocialConsequence._clamp01(
                        action.subjectiveSeverity
                    ),

                emotionalPressure:
                    emotionalPressure,

                reputationPressure:
                    reputationPressure,

                relationshipPressure:
                    relationshipPressure,

                interaction:
                    interaction,

                timestamp:
                    Date.now()

            };

            return result;
        };


    // =========================================================================
    // BUILD FROM DATA
    // =========================================================================

    AIH.SocialConsequence.buildFromData =
        function(data) {

            var action;

            if (
                !AIH.SocialAction ||
                !AIH.SocialAction.buildFromData
            ) {

                return null;
            }

            action =
                AIH.SocialAction.buildFromData(
                    data
                );

            if (
                !action
            ) {

                return null;
            }

            return AIH.SocialConsequence.build(
                action
            );
        };


    // =========================================================================
    // APPLY EMOTIONAL CONSEQUENCE
    // =========================================================================
    //
    // Delegates actual mutation to AIH.Emotions if the appropriate API exists.
    //
    // =========================================================================

    AIH.SocialConsequence._applyEmotion =
        function(
            key,
            amount
        ) {

            if (
                amount ===
                0
            ) {

                return false;
            }

            if (
                !AIH.Emotions
            ) {

                return false;
            }

            if (
                AIH.Emotions.modify
            ) {

                AIH.Emotions.modify(
                    key,
                    amount
                );

                return true;
            }

            if (
                AIH.Emotions.add
            ) {

                AIH.Emotions.add(
                    key,
                    amount
                );

                return true;
            }

            return false;
        };


    // =========================================================================
    // APPLY
    // =========================================================================
    //
    // Applies only systems whose public mutation APIs actually exist.
    //
    // =========================================================================

    AIH.SocialConsequence.apply =
        function(
            consequence
        ) {

            var emotional;
            var keys;
            var i;
            var applied;
            var key;

            if (
                !consequence
            ) {

                return null;
            }

            emotional =
                consequence.emotionalPressure ||
                {};

            applied = {

                emotions:
                    false,

                reputation:
                    false,

                relationship:
                    false

            };


            // -----------------------------------------------------------------
            // EMOTIONS
            // -----------------------------------------------------------------

            keys =
                Object.keys(
                    emotional
                );

            for (
                i = 0;
                i < keys.length;
                i++
            ) {

                key =
                    keys[i];

                if (
                    emotional[key] ===
                    0
                ) {

                    continue;
                }

                if (
                    AIH.SocialConsequence._applyEmotion(
                        key,
                        emotional[key]
                    )
                ) {

                    applied.emotions =
                        true;
                }
            }


            // -----------------------------------------------------------------
            // REPUTATION
            // -----------------------------------------------------------------
            //
            // Deliberately does not guess the Reputation API.
            //
            // A dedicated reputation consequence bridge can consume this
            // object later.
            //
            // -----------------------------------------------------------------

            if (
                AIH.Reputation &&
                AIH.Reputation.applySocialPressure
            ) {

                AIH.Reputation.applySocialPressure(
                    consequence.faction,
                    AIH.SocialConsequence._copy(
                        consequence.reputationPressure
                    )
                );

                applied.reputation =
                    true;
            }


            // -----------------------------------------------------------------
            // RELATIONSHIP
            // -----------------------------------------------------------------

            if (
                AIH.Social &&
                AIH.Social.applyRelationshipPressure
            ) {

                AIH.Social.applyRelationshipPressure(
                    consequence.faction,
                    AIH.SocialConsequence._copy(
                        consequence.relationshipPressure
                    )
                );

                applied.relationship =
                    true;
            }


            return {

                consequence:
                    AIH.SocialConsequence._copy(
                        consequence
                    ),

                applied:
                    applied,

                timestamp:
                    Date.now()

            };
        };


    // =========================================================================
    // CREATE AND APPLY
    // =========================================================================

    AIH.SocialConsequence.createAndApply =
        function(data) {

            var consequence;

            consequence =
                AIH.SocialConsequence.buildFromData(
                    data
                );

            if (
                !consequence
            ) {

                return null;
            }

            return AIH.SocialConsequence.apply(
                consequence
            );
        };


    // =========================================================================
    // SHOULD ESCALATE
    // =========================================================================

    AIH.SocialConsequence.shouldEscalate =
        function(
            consequence
        ) {

            if (
                !consequence
            ) {

                return false;
            }

            if (
                !consequence.interaction
            ) {

                return false;
            }

            return (
                AIH.SocialConsequence._clamp01(
                    consequence.interaction.escalationPressure
                ) >=
                0.60
            );
        };


    // =========================================================================
    // SHOULD TRIGGER COMBAT
    // =========================================================================
    //
    // This does NOT start combat.
    //
    // It only reports whether the social consequence has crossed the combat
    // pressure threshold.
    //
    // =========================================================================

    AIH.SocialConsequence.shouldTriggerCombat =
        function(
            consequence
        ) {

            if (
                !consequence
            ) {

                return false;
            }

            if (
                !consequence.interaction
            ) {

                return false;
            }

            return (
                AIH.SocialConsequence._clamp01(
                    consequence.interaction.combatPressure
                ) >=
                0.75
            );
        };


    // =========================================================================
    // SHOULD END INTERACTION
    // =========================================================================

    AIH.SocialConsequence.shouldEndInteraction =
        function(
            consequence
        ) {

            if (
                !consequence ||
                !consequence.interaction
            ) {

                return false;
            }

            return (
                consequence.interaction.endInteraction ===
                true
            );
        };


    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "SocialConsequence",
        {

            version:
                AIH.SocialConsequence.VERSION,

            initialize:
                function() {

                    AIH.SocialConsequence.initialize();

                },

            build:
                function(
                    action
                ) {

                    return AIH.SocialConsequence.build(
                        action
                    );

                },

            buildFromData:
                function(
                    data
                ) {

                    return AIH.SocialConsequence.buildFromData(
                        data
                    );

                },

            apply:
                function(
                    consequence
                ) {

                    return AIH.SocialConsequence.apply(
                        consequence
                    );

                },

            createAndApply:
                function(
                    data
                ) {

                    return AIH.SocialConsequence.createAndApply(
                        data
                    );

                },

            shouldEscalate:
                function(
                    consequence
                ) {

                    return AIH.SocialConsequence.shouldEscalate(
                        consequence
                    );

                },

            shouldTriggerCombat:
                function(
                    consequence
                ) {

                    return AIH.SocialConsequence.shouldTriggerCombat(
                        consequence
                    );

                },

            shouldEndInteraction:
                function(
                    consequence
                ) {

                    return AIH.SocialConsequence.shouldEndInteraction(
                        consequence
                    );

                }

        }
    );


    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_SocialConsequence_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_SocialConsequence_createGameObjects.call(
                this
            );

            AIH.SocialConsequence.initialize();

        };


    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_SocialConsequence_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_SocialConsequence_setupNewGame.call(
                this
            );

            AIH.SocialConsequence._initialized =
                false;

            AIH.SocialConsequence.initialize();

        };


    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_SocialConsequence_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(
            contents
        ) {

            _AIH_SocialConsequence_extractSaveContents.call(
                this,
                contents
            );

            AIH.SocialConsequence._initialized =
                false;

            AIH.SocialConsequence.initialize();

        };


})();