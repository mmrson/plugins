/*:
 * @plugindesc AI Hero Framework - Social Interaction System v0.2.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL INTERACTION
 * ============================================================================
 *
 * STEP 17
 *
 * Represents an individual social interaction involving the heroine.
 *
 * This system deliberately separates:
 *
 *     OBJECTIVE TREATMENT
 *
 * from:
 *
 *     SUBJECTIVE INTERPRETATION
 *
 * This distinction is fundamental to the AI Hero system.
 *
 * ============================================================================
 *
 * OBJECTIVE TREATMENT
 *
 * What actually happened.
 *
 * Examples:
 *
 *     NPC insulted her.
 *     NPC praised her.
 *     NPC ignored her.
 *     NPC threatened her.
 *     NPC made a sexual comment.
 *     NPC offered her a job.
 *
 * ============================================================================
 *
 * SUBJECTIVE INTERPRETATION
 *
 * What the heroine believes the interaction meant.
 *
 * Examples:
 *
 *     "That was demeaning."
 *     "He was merely joking."
 *     "He is trying to intimidate me."
 *     "That was genuine respect."
 *     "He thinks I am weak."
 *     "He is treating me like an object."
 *
 * The two can disagree.
 *
 * ============================================================================
 *
 * EXAMPLE
 *
 * NPC says:
 *
 *     "You're surprisingly competent for an adventurer."
 *
 * OBJECTIVELY:
 *
 *     flattering = true
 *
 * But the heroine may interpret it as:
 *
 *     demeaning = true
 *
 * because she is extremely proud and regards the statement as implying that
 * her competence was unexpected.
 *
 * Another heroine might interpret exactly the same statement as sincere praise.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This module does NOT:
 *
 * - decide what the heroine does
 * - attack NPCs
 * - generate dialogue
 * - automatically modify reputation
 * - automatically modify personality
 * - automatically modify values
 * - automatically modify emotions
 * - create beliefs
 * - call the LLM
 * - execute actions
 *
 * It creates and evaluates the SOCIAL CONTEXT of an interaction.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.SocialInteraction =
        AIH.SocialInteraction || {};

    AIH.SocialInteraction.VERSION =
        "0.2.0";

    AIH.SocialInteraction.SCHEMA_VERSION =
        2;

    AIH.SocialInteraction._initialized =
        false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.SocialInteraction._copy =
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

    AIH.SocialInteraction._clamp01 =
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
    // BOOLEAN
    // =========================================================================

    AIH.SocialInteraction._bool =
        function(value) {

            return value === true;
        };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialInteraction.initialize =
        function() {

            AIH.SocialInteraction._initialized =
                true;

            AIH.Debug.log(
                "Social interaction system initialized."
            );
        };

    // =========================================================================
    // CREATE INTERACTION
    // =========================================================================
    //
    // Creates the raw interaction.
    //
    // Objective and subjective information remain separate.
    //
    // =========================================================================

    AIH.SocialInteraction.create =
        function(data) {

            data =
                data || {};

            return {

                schemaVersion:
                    AIH.SocialInteraction.SCHEMA_VERSION,

                // -------------------------------------------------------------
                // WHO / WHERE
                // -------------------------------------------------------------

                faction:
                    String(
                        data.faction || ""
                    ),

                sourceId:
                    data.sourceId !== undefined
                        ? String(data.sourceId)
                        : null,

                sourceName:
                    data.sourceName !== undefined
                        ? String(data.sourceName)
                        : null,

                // -------------------------------------------------------------
                // INTERACTION TYPE
                // -------------------------------------------------------------

                type:
                    String(
                        data.type ||
                        "unknown"
                    ),

                content:
                    data.content !== undefined
                        ? String(data.content)
                        : "",

                severity:
                    AIH.SocialInteraction._clamp01(
                        data.severity
                    ),

                // =============================================================
                // OBJECTIVE TREATMENT
                // =============================================================
                //
                // These describe the event itself.
                //
                // They do NOT describe what the heroine thinks about it.
                //
                // =============================================================

                objective: {

                    insulting:
                        AIH.SocialInteraction._bool(
                            data.insulting
                        ),

                    threatening:
                        AIH.SocialInteraction._bool(
                            data.threatening
                        ),

                    flattering:
                        AIH.SocialInteraction._bool(
                            data.flattering
                        ),

                    dismissive:
                        AIH.SocialInteraction._bool(
                            data.dismissive
                        ),

                    respectful:
                        AIH.SocialInteraction._bool(
                            data.respectful
                        ),

                    sexualized:
                        AIH.SocialInteraction._bool(
                            data.sexualized
                        ),

                    humiliating:
                        AIH.SocialInteraction._bool(
                            data.humiliating
                        ),

                    patronizing:
                        AIH.SocialInteraction._bool(
                            data.patronizing
                        ),

                    coercive:
                        AIH.SocialInteraction._bool(
                            data.coercive
                        ),

                    friendly:
                        AIH.SocialInteraction._bool(
                            data.friendly
                        )
                },

                // =============================================================
                // SUBJECTIVE INTERPRETATION
                // =============================================================
                //
                // These describe how the heroine interprets the event.
                //
                // This is intentionally independent from objective treatment.
                //
                // =============================================================

                interpretation: {

                    // The heroine thinks the treatment demeans her.
                    demeaning:
                        AIH.SocialInteraction._bool(
                            data.perceivedDemeaning
                        ),

                    // The heroine thinks the source is threatening her.
                    threatening:
                        AIH.SocialInteraction._bool(
                            data.perceivedThreat
                        ),

                    // The heroine thinks the treatment is genuinely positive.
                    flattering:
                        AIH.SocialInteraction._bool(
                            data.perceivedFlattering
                        ),

                    // The heroine thinks she is being treated respectfully.
                    respectful:
                        AIH.SocialInteraction._bool(
                            data.perceivedRespectful
                        ),

                    // The heroine feels socially humiliated.
                    humiliating:
                        AIH.SocialInteraction._bool(
                            data.perceivedHumiliating
                        ),

                    // The heroine interprets the interaction as sexualized.
                    sexualized:
                        AIH.SocialInteraction._bool(
                            data.perceivedSexualized
                        ),

                    // The heroine thinks the source is patronizing her.
                    patronizing:
                        AIH.SocialInteraction._bool(
                            data.perceivedPatronizing
                        ),

                    // The heroine believes the source is trying to control her.
                    controlling:
                        AIH.SocialInteraction._bool(
                            data.perceivedControlling
                        ),

                    // The heroine believes the source does not respect her.
                    disrespectful:
                        AIH.SocialInteraction._bool(
                            data.perceivedDisrespectful
                        )
                },

                // =============================================================
                // INTERPRETATION CONFIDENCE
                // =============================================================
                //
                // The heroine does not necessarily know exactly what someone
                // meant.
                //
                // This becomes important for ambiguous statements.
                //
                // =============================================================

                interpretationConfidence:
                    AIH.SocialInteraction._clamp01(
                        data.interpretationConfidence !==
                        undefined
                            ? data.interpretationConfidence
                            : 1.0
                    ),

                timestamp:
                    Date.now()
            };
        };

    // =========================================================================
    // OBJECTIVE / SUBJECTIVE CONFLICT
    // =========================================================================
    //
    // Determines whether objective treatment and subjective interpretation
    // point in different directions.
    //
    // This is extremely important for personality-driven behavior.
    //
    // Example:
    //
    // objective:
    //     flattering
    //
    // subjective:
    //     demeaning
    //
    // Result:
    //     conflict = true
    //
    // =========================================================================

    AIH.SocialInteraction.getInterpretationConflict =
        function(interaction) {

            var objective;
            var interpretation;
            var conflict;
            var reasons;

            if (!interaction) {
                return null;
            }

            objective =
                interaction.objective ||
                {};

            interpretation =
                interaction.interpretation ||
                {};

            conflict =
                false;

            reasons = [];

            // -------------------------------------------------------------
            // Praise interpreted negatively
            // -------------------------------------------------------------

            if (
                objective.flattering &&
                interpretation.demeaning
            ) {

                conflict = true;

                reasons.push(
                    "flattery_interpreted_as_demeaning"
                );
            }

            // -------------------------------------------------------------
            // Respect interpreted negatively
            // -------------------------------------------------------------

            if (
                objective.respectful &&
                interpretation.disrespectful
            ) {

                conflict = true;

                reasons.push(
                    "respect_interpreted_as_disrespect"
                );
            }

            // -------------------------------------------------------------
            // Friendly interaction interpreted negatively
            // -------------------------------------------------------------

            if (
                objective.friendly &&
                interpretation.demeaning
            ) {

                conflict = true;

                reasons.push(
                    "friendly_behavior_interpreted_as_demeaning"
                );
            }

            // -------------------------------------------------------------
            // Insult interpreted positively / harmlessly
            // -------------------------------------------------------------

            if (
                objective.insulting &&
                interpretation.flattering
            ) {

                conflict = true;

                reasons.push(
                    "insult_interpreted_as_flattery"
                );
            }

            // -------------------------------------------------------------
            // Threat not perceived as threat
            // -------------------------------------------------------------

            if (
                objective.threatening &&
                !interpretation.threatening
            ) {

                conflict = true;

                reasons.push(
                    "objective_threat_not_perceived_as_threat"
                );
            }

            return {

                conflict:
                    conflict,

                reasons:
                    reasons
            };
        };

    // =========================================================================
    // ASSESS INTERACTION
    // =========================================================================
    //
    // Produces a complete context for downstream systems.
    //
    // IMPORTANT:
    //
    // The subjective interpretation remains the primary input for heroine
    // reaction systems.
    //
    // =========================================================================

    AIH.SocialInteraction.assess =
        function(data) {

            var interaction;
            var response;
            var social;
            var interpretationSeverity;
            var conflict;
            var reactionContext;

            interaction =
                AIH.SocialInteraction.create(
                    data
                );

            if (!interaction.faction) {
                return null;
            }

            social =
                AIH.Social.getContext(
                    interaction.faction
                );

            if (!social) {
                return null;
            }

            // -------------------------------------------------------------
            // Base severity
            // -------------------------------------------------------------

            interpretationSeverity =
                interaction.severity;

            // -------------------------------------------------------------
            // SUBJECTIVE DEMAANING
            //
            // This matters more than merely objective insulting behavior.
            //
            // -------------------------------------------------------------

            if (
                interaction.interpretation.demeaning
            ) {

                interpretationSeverity =
                    Math.max(
                        interpretationSeverity,
                        0.50
                    );
            }

            // -------------------------------------------------------------
            // SUBJECTIVE HUMILIATION
            // -------------------------------------------------------------

            if (
                interaction.interpretation.humiliating
            ) {

                interpretationSeverity =
                    Math.max(
                        interpretationSeverity,
                        0.75
                    );
            }

            // -------------------------------------------------------------
            // SUBJECTIVE DISRESPECT
            // -------------------------------------------------------------

            if (
                interaction.interpretation.disrespectful
            ) {

                interpretationSeverity =
                    Math.max(
                        interpretationSeverity,
                        0.60
                    );
            }

            // -------------------------------------------------------------
            // SUBJECTIVE CONTROL
            // -------------------------------------------------------------

            if (
                interaction.interpretation.controlling
            ) {

                interpretationSeverity =
                    Math.max(
                        interpretationSeverity,
                        0.60
                    );
            }

            // -------------------------------------------------------------
            // OBJECTIVE / SUBJECTIVE CONFLICT
            // -------------------------------------------------------------

            conflict =
                AIH.SocialInteraction.getInterpretationConflict(
                    interaction
                );

            // -------------------------------------------------------------
            // RESPONSE SYSTEM
            //
            // SocialResponse remains responsible for translating the event
            // into response pressure/context.
            //
            // It does not mean an action has been selected.
            // -------------------------------------------------------------

            response =
                null;

            if (
                AIH.SocialResponse &&
                AIH.SocialResponse.getContext
            ) {

                response =
                    AIH.SocialResponse.getContext(
                        interaction.faction,
                        interpretationSeverity
                    );
            }

            // -------------------------------------------------------------
            // REACTION CONTEXT
            //
            // This is descriptive only.
            //
            // It tells later decision systems why the interaction may matter.
            // -------------------------------------------------------------

            reactionContext = {

                perceivedDemeaning:
                    interaction.interpretation.demeaning,

                perceivedDisrespect:
                    interaction.interpretation.disrespectful,

                perceivedHumiliation:
                    interaction.interpretation.humiliating,

                perceivedThreat:
                    interaction.interpretation.threatening,

                perceivedControl:
                    interaction.interpretation.controlling,

                objectiveInsult:
                    interaction.objective.insulting,

                objectiveThreat:
                    interaction.objective.threatening,

                objectiveRespect:
                    interaction.objective.respectful,

                objectiveFlattery:
                    interaction.objective.flattering,

                interpretationConfidence:
                    interaction.interpretationConfidence,

                interpretationConflict:
                    conflict.conflict,

                interpretationConflictReasons:
                    conflict.reasons,

                subjectiveSeverity:
                    interpretationSeverity
            };

            return {

                interaction:
                    interaction,

                socialContext:
                    social,

                interpretationConflict:
                    conflict,

                reactionContext:
                    reactionContext,

                responseContext:
                    response
            };
        };

    // =========================================================================
    // CONVENIENCE: PERCEIVED DEMAANING
    // =========================================================================

    AIH.SocialInteraction.isPerceivedDemeaning =
        function(data) {

            var interaction;

            interaction =
                AIH.SocialInteraction.create(
                    data
                );

            return interaction
                .interpretation
                .demeaning;
        };

    // =========================================================================
    // CONVENIENCE: OBJECTIVELY INSULTING
    // =========================================================================

    AIH.SocialInteraction.isObjectivelyInsulting =
        function(data) {

            var interaction;

            interaction =
                AIH.SocialInteraction.create(
                    data
                );

            return interaction
                .objective
                .insulting;
        };

    // =========================================================================
    // CONVENIENCE: SUBJECTIVE DISRESPECT
    // =========================================================================

    AIH.SocialInteraction.isPerceivedDisrespectful =
        function(data) {

            var interaction;

            interaction =
                AIH.SocialInteraction.create(
                    data
                );

            return interaction
                .interpretation
                .disrespectful;
        };

    // =========================================================================
    // CONVENIENCE: INTERPRETATION CONFLICT
    // =========================================================================

    AIH.SocialInteraction.hasInterpretationConflict =
        function(data) {

            var interaction;
            var result;

            interaction =
                AIH.SocialInteraction.create(
                    data
                );

            result =
                AIH.SocialInteraction.getInterpretationConflict(
                    interaction
                );

            return result.conflict;
        };

    // =========================================================================
    // CONVENIENCE: RESPONSE PRESSURE
    // =========================================================================

    AIH.SocialInteraction.getResponsePressure =
        function(data) {

            var assessment;

            assessment =
                AIH.SocialInteraction.assess(
                    data
                );

            if (
                !assessment ||
                !assessment.responseContext
            ) {

                return null;
            }

            return assessment
                .responseContext
                .responsePressure;
        };

    // =========================================================================
    // CONVENIENCE: REACTION CONTEXT
    // =========================================================================

    AIH.SocialInteraction.getReactionContext =
        function(data) {

            var assessment;

            assessment =
                AIH.SocialInteraction.assess(
                    data
                );

            if (!assessment) {
                return null;
            }

            return AIH.SocialInteraction._copy(
                assessment.reactionContext
            );
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "SocialInteraction",
        {
            version:
                AIH.SocialInteraction.VERSION,

            initialize:
                function() {

                    AIH.SocialInteraction.initialize();
                },

            create:
                function(data) {

                    return AIH.SocialInteraction.create(
                        data
                    );
                },

            assess:
                function(data) {

                    return AIH.SocialInteraction.assess(
                        data
                    );
                },

            isPerceivedDemeaning:
                function(data) {

                    return AIH.SocialInteraction.isPerceivedDemeaning(
                        data
                    );
                },

            isObjectivelyInsulting:
                function(data) {

                    return AIH.SocialInteraction.isObjectivelyInsulting(
                        data
                    );
                },

            isPerceivedDisrespectful:
                function(data) {

                    return AIH.SocialInteraction.isPerceivedDisrespectful(
                        data
                    );
                },

            hasInterpretationConflict:
                function(data) {

                    return AIH.SocialInteraction.hasInterpretationConflict(
                        data
                    );
                },

            getResponsePressure:
                function(data) {

                    return AIH.SocialInteraction.getResponsePressure(
                        data
                    );
                },

            getReactionContext:
                function(data) {

                    return AIH.SocialInteraction.getReactionContext(
                        data
                    );
                }
        }
    );

    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_SocialInteraction_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_SocialInteraction_createGameObjects.call(
                this
            );

            AIH.SocialInteraction.initialize();
        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_SocialInteraction_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_SocialInteraction_setupNewGame.call(
                this
            );

            AIH.SocialInteraction._initialized =
                false;

            AIH.SocialInteraction.initialize();
        };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_SocialInteraction_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_SocialInteraction_extractSaveContents.call(
                this,
                contents
            );

            AIH.SocialInteraction._initialized =
                false;

            AIH.SocialInteraction.initialize();
        };

})();