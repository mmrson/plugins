/*:
 * @plugindesc AI Hero Framework - Social Interpretation v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL INTERPRETATION
 * ============================================================================
 *
 * STEP 18
 *
 * Determines how the heroine SUBJECTIVELY interprets a social interaction.
 *
 * This is deliberately separate from:
 *
 *     what the NPC objectively did
 *
 * and:
 *
 *     what the heroine eventually decides to do about it.
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
 * EMOTIONAL / COGNITIVE RESPONSE
 *        |
 *        v
 * DECISION SYSTEM
 *        |
 *        v
 * ACTION
 *
 * This module handles the SUBJECTIVE INTERPRETATION stage.
 *
 * ============================================================================
 *
 * EXAMPLE
 *
 * NPC:
 *
 *     "You're surprisingly competent for an adventurer."
 *
 * Objective:
 *
 *     flattering = true
 *
 * But the heroine may interpret it as:
 *
 *     demeaning = true
 *     disrespectful = true
 *
 * because she is extremely proud and has extremely high confidence in her
 * abilities.
 *
 * Another heroine might simply interpret it as:
 *
 *     flattering = true
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This module does NOT:
 *
 * - decide actions
 * - attack NPCs
 * - modify reputation
 * - modify personality
 * - modify values
 * - modify emotions
 * - create beliefs
 * - generate dialogue
 * - call the LLM
 *
 * It produces an interpretation.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.SocialInterpretation =
        AIH.SocialInterpretation || {};

    AIH.SocialInterpretation.VERSION =
        "0.1.0";

    AIH.SocialInterpretation.SCHEMA_VERSION =
        1;

    AIH.SocialInterpretation._initialized =
        false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.SocialInterpretation._copy =
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
    // CLAMP
    // =========================================================================

    AIH.SocialInterpretation._clamp01 =
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
    // GET PERSONALITY
    // =========================================================================

    AIH.SocialInterpretation._personality =
        function() {

            var result;

            if (
                typeof AIH.Personality === "undefined"
            ) {

                return {};
            }

            if (
                typeof AIH.Personality.get ===
                "function"
            ) {

                result =
                    AIH.Personality.get();

                if (result) {
                    return result;
                }
            }

            return {};
        };

    // =========================================================================
    // GET PERSONALITY VALUE
    // =========================================================================
    //
    // This intentionally supports several possible Personality APIs so this
    // interpretation module does not become tightly coupled to one internal
    // implementation.
    //
    // =========================================================================

    AIH.SocialInterpretation._personalityValue =
        function(
            personality,
            key,
            fallback
        ) {

            var value;

            if (!personality) {
                return fallback;
            }

            if (
                personality[key] !== undefined
            ) {

                value =
                    Number(
                        personality[key]
                    );

                if (!isNaN(value)) {
                    return value;
                }
            }

            if (
                personality.traits &&
                personality.traits[key] !==
                    undefined
            ) {

                value =
                    Number(
                        personality.traits[key]
                    );

                if (!isNaN(value)) {
                    return value;
                }
            }

            return fallback;
        };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialInterpretation.initialize =
        function() {

            AIH.SocialInterpretation._initialized =
                true;

            AIH.Debug.log(
                "Social interpretation system initialized."
            );
        };

    // =========================================================================
    // INTERPRETATION STRENGTH
    // =========================================================================
    //
    // Calculates how strongly the heroine is predisposed to interpret an
    // ambiguous interaction negatively.
    //
    // Pride is especially important here.
    //
    // High pride does NOT mean:
    //
    //     "she attacks people"
    //
    // It means:
    //
    //     "she is less willing to interpret status-lowering treatment
    //      generously."
    //
    // =========================================================================

    AIH.SocialInterpretation._negativeInterpretationBias =
        function(personality) {

            var pride;
            var confidence;
            var courage;
            var independence;
            var bias;

            pride =
                AIH.SocialInterpretation._personalityValue(
                    personality,
                    "pride",
                    0.5
                );

            confidence =
                AIH.SocialInterpretation._personalityValue(
                    personality,
                    "confidence",
                    0.5
                );

            courage =
                AIH.SocialInterpretation._personalityValue(
                    personality,
                    "courage",
                    0.5
                );

            independence =
                AIH.SocialInterpretation._personalityValue(
                    personality,
                    "independence",
                    0.5
                );

            /*
             * Pride is deliberately the strongest component.
             *
             * Confidence reinforces the expectation that others should
             * recognize her competence.
             *
             * Courage and independence have smaller effects.
             */

            bias =
                (
                    pride * 0.55
                ) +
                (
                    confidence * 0.25
                ) +
                (
                    courage * 0.10
                ) +
                (
                    independence * 0.10
                );

            return AIH.SocialInterpretation._clamp01(
                bias
            );
        };

    // =========================================================================
    // INTERPRET
    // =========================================================================
    //
    // Converts an objective interaction into a subjective interpretation.
    //
    // =========================================================================

    AIH.SocialInterpretation.interpret =
        function(data) {

            var interaction;
            var personality;
            var bias;
            var interpretation;
            var confidence;
            var severity;
            var socialContext;
            var reputationDominance;
            var reputationValue;
            var sourceInfluence;

            if (!data) {
                return null;
            }

            // -------------------------------------------------------------
            // If this is already a SocialInteraction object, use it.
            // Otherwise create one.
            // -------------------------------------------------------------

            if (
                data.objective &&
                data.interpretation
            ) {

                interaction =
                    AIH.SocialInteraction._copy(
                        data
                    );

            } else {

                interaction =
                    AIH.SocialInteraction.create(
                        data
                    );
            }

            if (!interaction) {
                return null;
            }

            if (!interaction.faction) {
                return null;
            }

            personality =
                AIH.SocialInterpretation._personality();

            bias =
                AIH.SocialInterpretation
                    ._negativeInterpretationBias(
                        personality
                    );

            severity =
                AIH.SocialInterpretation._clamp01(
                    interaction.severity
                );

            // -------------------------------------------------------------
            // SOCIAL CONTEXT
            // -------------------------------------------------------------

            socialContext =
                null;

            if (
                AIH.Social &&
                AIH.Social.getContext
            ) {

                socialContext =
                    AIH.Social.getContext(
                        interaction.faction
                    );
            }

            reputationDominance =
                0;

            reputationValue =
                0;

            if (socialContext) {

                reputationDominance =
                    Number(
                        socialContext.coordinates.dominance
                    );

                reputationValue =
                    Number(
                        socialContext.coordinates.reputation
                    );
            }

            // -------------------------------------------------------------
            // SOURCE INFLUENCE
            // -------------------------------------------------------------
            //
            // A comment from somebody she respects should not necessarily be
            // interpreted identically to the same comment from somebody she
            // considers beneath her.
            //
            // For now this is represented as contextual information rather
            // than a hard-coded relationship system.
            //
            // -------------------------------------------------------------

            sourceInfluence =
                0;

            if (
                interaction.sourceId !== null
            ) {

                sourceInfluence =
                    0.05;
            }

            // -------------------------------------------------------------
            // START WITH EXPLICIT INTERPRETATION
            //
            // If another system already supplied an interpretation, respect
            // it. This module is primarily responsible for filling in missing
            // interpretation rather than blindly overwriting it.
            //
            // -------------------------------------------------------------

            interpretation = {

                demeaning:
                    interaction.interpretation.demeaning,

                threatening:
                    interaction.interpretation.threatening,

                flattering:
                    interaction.interpretation.flattering,

                respectful:
                    interaction.interpretation.respectful,

                humiliating:
                    interaction.interpretation.humiliating,

                sexualized:
                    interaction.interpretation.sexualized,

                patronizing:
                    interaction.interpretation.patronizing,

                controlling:
                    interaction.interpretation.controlling,

                disrespectful:
                    interaction.interpretation.disrespectful
            };

            // =============================================================
            // OBJECTIVE INSULT
            // =============================================================

            if (
                interaction.objective.insulting
            ) {

                /*
                 * An explicit insult is normally interpreted as demeaning.
                 *
                 * Personality can make the heroine more or less willing to
                 * dismiss ambiguous behavior, but an unmistakable insult is
                 * not treated as ambiguous.
                 */

                interpretation.demeaning =
                    true;

                interpretation.disrespectful =
                    true;
            }

            // =============================================================
            // OBJECTIVE HUMILIATION
            // =============================================================

            if (
                interaction.objective.humiliating
            ) {

                interpretation.humiliating =
                    true;

                interpretation.demeaning =
                    true;

                interpretation.disrespectful =
                    true;
            }

            // =============================================================
            // OBJECTIVE THREAT
            // =============================================================

            if (
                interaction.objective.threatening
            ) {

                interpretation.threatening =
                    true;
            }

            // =============================================================
            // OBJECTIVE SEXUALIZATION
            // =============================================================

            if (
                interaction.objective.sexualized
            ) {

                interpretation.sexualized =
                    true;
            }

            // =============================================================
            // PATRONIZING / DISMISSIVE BEHAVIOR
            // =============================================================

            if (
                interaction.objective.patronizing ||
                interaction.objective.dismissive
            ) {

                /*
                 * This is where personality becomes important.
                 *
                 * A heroine with enormous pride is much less likely to
                 * generously interpret patronizing treatment.
                 */

                if (
                    bias >= 0.60 ||
                    severity >= 0.70
                ) {

                    interpretation.patronizing =
                        true;

                    interpretation.demeaning =
                        true;

                    interpretation.disrespectful =
                        true;
                }
            }

            // =============================================================
            // FLATTERY
            // =============================================================

            if (
                interaction.objective.flattering
            ) {

                /*
                 * Genuine straightforward praise remains praise.
                 *
                 * However, high pride creates a possibility that ambiguous
                 * praise is interpreted as condescending.
                 */

                if (
                    !interaction.objective.respectful &&
                    bias >= 0.82 &&
                    severity >= 0.40
                ) {

                    interpretation.demeaning =
                        true;

                    interpretation.disrespectful =
                        true;

                    interpretation.flattering =
                        false;

                } else {

                    interpretation.flattering =
                        true;
                }
            }

            // =============================================================
            // RESPECT
            // =============================================================

            if (
                interaction.objective.respectful
            ) {

                /*
                 * Clear respect should normally be accepted as respect even
                 * by a proud heroine.
                 */

                interpretation.respectful =
                    true;
            }

            // =============================================================
            // SOCIAL STATUS CONTEXT
            // =============================================================
            //
            // If the faction already regards her as highly dominant, a
            // status-lowering interaction can matter more because it conflicts
            // with her established social position.
            //
            // Conversely, if a faction already regards her as submissive,
            // assertive treatment may not necessarily be interpreted as an
            // insult.
            //
            // This is contextual pressure, not an automatic action.
            //
            // =============================================================

            if (
                reputationDominance >= 60 &&
                (
                    interaction.objective.dismissive ||
                    interaction.objective.patronizing
                )
            ) {

                interpretation.demeaning =
                    true;

                interpretation.disrespectful =
                    true;
            }

            // =============================================================
            // HIGH GENERAL REPUTATION
            // =============================================================
            //
            // If she is highly regarded by the faction, an unexpectedly
            // dismissive treatment can be particularly salient.
            //
            // =============================================================

            if (
                reputationValue >= 70 &&
                interaction.objective.dismissive &&
                bias >= 0.65
            ) {

                interpretation.demeaning =
                    true;

                interpretation.disrespectful =
                    true;
            }

            // =============================================================
            // SUBJECTIVE SEVERITY
            // =============================================================

            if (
                interpretation.humiliating
            ) {

                severity =
                    Math.max(
                        severity,
                        0.80
                    );
            }

            if (
                interpretation.demeaning
            ) {

                severity =
                    Math.max(
                        severity,
                        0.55
                    );
            }

            if (
                interpretation.disrespectful
            ) {

                severity =
                    Math.max(
                        severity,
                        0.60
                    );
            }

            if (
                interpretation.threatening
            ) {

                severity =
                    Math.max(
                        severity,
                        0.65
                    );
            }

            // =============================================================
            // INTERPRETATION CONFIDENCE
            // =============================================================
            //
            // Explicit interactions are easier to interpret than ambiguous
            // ones.
            //
            // =============================================================

            confidence =
                interaction.interpretationConfidence;

            if (
                interaction.objective.insulting ||
                interaction.objective.threatening ||
                interaction.objective.humiliating
            ) {

                confidence =
                    Math.max(
                        confidence,
                        0.90
                    );
            }

            if (
                interaction.objective.flattering &&
                !interaction.objective.insulting &&
                !interaction.objective.threatening
            ) {

                /*
                 * Ambiguous praise is somewhat less certain when the heroine
                 * has extremely high pride.
                 */

                confidence =
                    Math.min(
                        confidence,
                        0.95
                    );
            }

            // =============================================================
            // RESULT
            // =============================================================

            return {

                schemaVersion:
                    AIH.SocialInterpretation.SCHEMA_VERSION,

                faction:
                    interaction.faction,

                sourceId:
                    interaction.sourceId,

                sourceName:
                    interaction.sourceName,

                objective:
                    AIH.SocialInterpretation._copy(
                        interaction.objective
                    ),

                interpretation:
                    interpretation,

                subjectiveSeverity:
                    AIH.SocialInterpretation._clamp01(
                        severity
                    ),

                interpretationConfidence:
                    AIH.SocialInterpretation._clamp01(
                        confidence
                    ),

                personalityInfluence: {

                    negativeInterpretationBias:
                        bias,

                    pride:
                        AIH.SocialInterpretation
                            ._personalityValue(
                                personality,
                                "pride",
                                0.5
                            ),

                    confidence:
                        AIH.SocialInterpretation
                            ._personalityValue(
                                personality,
                                "confidence",
                                0.5
                            ),

                    courage:
                        AIH.SocialInterpretation
                            ._personalityValue(
                                personality,
                                "courage",
                                0.5
                            ),

                    independence:
                        AIH.SocialInterpretation
                            ._personalityValue(
                                personality,
                                "independence",
                                0.5
                            )
                },

                socialContext:
                    AIH.SocialInterpretation._copy(
                        socialContext
                    ),

                timestamp:
                    Date.now()
            };
        };

    // =========================================================================
    // APPLY INTERPRETATION TO INTERACTION
    // =========================================================================
    //
    // Returns a new interaction object containing the calculated subjective
    // interpretation.
    //
    // The original interaction is not modified.
    //
    // =========================================================================

    AIH.SocialInterpretation.interpretInteraction =
        function(data) {

            var interaction;
            var result;

            interaction =
                AIH.SocialInteraction.create(
                    data
                );

            result =
                AIH.SocialInterpretation.interpret(
                    interaction
                );

            if (!result) {
                return null;
            }

            interaction.interpretation =
                AIH.SocialInterpretation._copy(
                    result.interpretation
                );

            interaction.severity =
                result.subjectiveSeverity;

            interaction.interpretationConfidence =
                result.interpretationConfidence;

            return interaction;
        };

    // =========================================================================
    // CHECK WHETHER HEROINE IS LIKELY TO READ SOMETHING AS DEMAANING
    // =========================================================================

    AIH.SocialInterpretation.wouldPerceiveAsDemeaning =
        function(data) {

            var result;

            result =
                AIH.SocialInterpretation.interpret(
                    data
                );

            if (!result) {
                return false;
            }

            return result.interpretation.demeaning ===
                true;
        };

    // =========================================================================
    // GET INTERPRETATION CONTEXT
    // =========================================================================

    AIH.SocialInterpretation.getContext =
        function(data) {

            var result;

            result =
                AIH.SocialInterpretation.interpret(
                    data
                );

            if (!result) {
                return null;
            }

            return AIH.SocialInterpretation._copy(
                result
            );
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "SocialInterpretation",
        {
            version:
                AIH.SocialInterpretation.VERSION,

            initialize:
                function() {

                    AIH.SocialInterpretation.initialize();
                },

            interpret:
                function(data) {

                    return AIH.SocialInterpretation.interpret(
                        data
                    );
                },

            interpretInteraction:
                function(data) {

                    return AIH.SocialInterpretation
                        .interpretInteraction(
                            data
                        );
                },

            wouldPerceiveAsDemeaning:
                function(data) {

                    return AIH.SocialInterpretation
                        .wouldPerceiveAsDemeaning(
                            data
                        );
                },

            getContext:
                function(data) {

                    return AIH.SocialInterpretation.getContext(
                        data
                    );
                }
        }
    );

    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_SocialInterpretation_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_SocialInterpretation_createGameObjects.call(
                this
            );

            AIH.SocialInterpretation.initialize();
        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_SocialInterpretation_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_SocialInterpretation_setupNewGame.call(
                this
            );

            AIH.SocialInterpretation._initialized =
                false;

            AIH.SocialInterpretation.initialize();
        };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_SocialInterpretation_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_SocialInterpretation_extractSaveContents.call(
                this,
                contents
            );

            AIH.SocialInterpretation._initialized =
                false;

            AIH.SocialInterpretation.initialize();
        };

})();