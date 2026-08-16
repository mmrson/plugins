/*:
 * @plugindesc AI Hero Framework - Social Interaction Context v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL INTERACTION CONTEXT
 * ============================================================================
 *
 * STEP 15
 *
 * Converts faction reputation coordinates into a standardized social context
 * for other AI Hero systems.
 *
 * This module is an interpretation layer between raw reputation data and
 * future NPC/social interaction systems.
 *
 * ============================================================================
 *
 * INPUT
 *
 * Each faction provides three reputation coordinates:
 *
 * reputation
 *     General standing.
 *
 * lewdness
 *     How lewdly the faction perceives the heroine.
 *
 * dominance
 *     How dominant/assertive versus submissive/meek the faction perceives
 *     the heroine.
 *
 * ============================================================================
 *
 * OUTPUT
 *
 * This module provides descriptive social classifications.
 *
 * It does NOT:
 *
 * - make decisions
 * - control NPCs
 * - generate dialogue
 * - determine quests
 * - determine jobs
 * - determine rewards
 * - determine punishments
 * - determine whether somebody is insulting the heroine
 * - determine whether the heroine attacks somebody
 * - modify personality
 * - modify values
 * - modify emotions
 * - call the LLM
 * - execute actions
 *
 * ============================================================================
 *
 * The future NPC system will use this context together with:
 *
 * - NPC identity
 * - NPC personality
 * - faction membership
 * - current situation
 * - heroine personality
 * - heroine values
 * - heroine emotions
 * - heroine beliefs
 * - current goals
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Social =
        AIH.Social || {};

    AIH.Social.VERSION =
        "0.1.0";

    AIH.Social._initialized =
        false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Social._copy =
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

    AIH.Social._clamp =
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
    // CLASSIFY GENERAL REPUTATION
    // =========================================================================

    AIH.Social._classifyStanding =
        function(value) {

            value =
                AIH.Social._clamp(
                    value
                );

            if (value <= -75) {
                return "hostile";
            }

            if (value <= -40) {
                return "unfavorable";
            }

            if (value < 40) {
                return "neutral";
            }

            if (value < 75) {
                return "favorable";
            }

            return "highly_favorable";
        };

    // =========================================================================
    // CLASSIFY LEWDNESS
    // =========================================================================

    AIH.Social._classifyLewdness =
        function(value) {

            value =
                AIH.Social._clamp(
                    value
                );

            if (value <= -75) {
                return "strongly_chaste";
            }

            if (value <= -40) {
                return "chaste";
            }

            if (value < 40) {
                return "neutral";
            }

            if (value < 75) {
                return "lewd";
            }

            return "highly_lewd";
        };

    // =========================================================================
    // CLASSIFY DOMINANCE
    // =========================================================================

    AIH.Social._classifyDominance =
        function(value) {

            value =
                AIH.Social._clamp(
                    value
                );

            if (value <= -75) {
                return "strongly_submissive";
            }

            if (value <= -40) {
                return "submissive";
            }

            if (value < 40) {
                return "neutral";
            }

            if (value < 75) {
                return "dominant";
            }

            return "highly_dominant";
        };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Social.initialize =
        function() {

            if (
                AIH.Social._initialized
            ) {

                return;
            }

            AIH.Social._initialized =
                true;

            AIH.Debug.log(
                "Social interaction context initialized."
            );
        };

    // =========================================================================
    // GET FACTION CONTEXT
    // =========================================================================

    AIH.Social.getContext =
        function(faction) {

            var reputation;
            var reputationValue;
            var lewdness;
            var dominance;

            reputation =
                AIH.Reputation.get(
                    faction
                );

            if (!reputation) {
                return null;
            }

            reputationValue =
                AIH.Social._clamp(
                    reputation.reputation
                );

            lewdness =
                AIH.Social._clamp(
                    reputation.lewdness
                );

            dominance =
                AIH.Social._clamp(
                    reputation.dominance
                );

            return {

                faction:
                    reputation.name,

                coordinates: {

                    reputation:
                        reputationValue,

                    lewdness:
                        lewdness,

                    dominance:
                        dominance
                },

                standing:
                    AIH.Social._classifyStanding(
                        reputationValue
                    ),

                lewdnessPerception:
                    AIH.Social._classifyLewdness(
                        lewdness
                    ),

                dominancePerception:
                    AIH.Social._classifyDominance(
                        dominance
                    )
            };
        };

    // =========================================================================
    // GET ALL CONTEXTS
    // =========================================================================

    AIH.Social.allContexts =
        function() {

            var factions;
            var result;
            var i;
            var context;

            factions =
                AIH.Reputation.factions();

            result = {};

            for (
                i = 0;
                i < factions.length;
                i++
            ) {

                context =
                    AIH.Social.getContext(
                        factions[i]
                    );

                if (context) {

                    result[
                        factions[i]
                    ] =
                        context;
                }
            }

            return result;
        };

    // =========================================================================
    // CHECK GENERAL STANDING
    // =========================================================================

    AIH.Social.isFavorable =
        function(faction) {

            var value;

            value =
                AIH.Reputation.getAxis(
                    faction,
                    "reputation"
                );

            return value >= 40;
        };

    // =========================================================================
    // CHECK HOSTILITY
    // =========================================================================

    AIH.Social.isHostile =
        function(faction) {

            var value;

            value =
                AIH.Reputation.getAxis(
                    faction,
                    "reputation"
                );

            return value <= -40;
        };

    // =========================================================================
    // CHECK DOMINANCE
    // =========================================================================

    AIH.Social.isDominant =
        function(faction) {

            var value;

            value =
                AIH.Reputation.getAxis(
                    faction,
                    "dominance"
                );

            return value >= 40;
        };

    // =========================================================================
    // CHECK SUBMISSIVENESS
    // =========================================================================

    AIH.Social.isSubmissive =
        function(faction) {

            var value;

            value =
                AIH.Reputation.getAxis(
                    faction,
                    "dominance"
                );

            return value <= -40;
        };

    // =========================================================================
    // CHECK HIGH LEWDNESS
    // =========================================================================

    AIH.Social.isHighlyLewd =
        function(faction) {

            var value;

            value =
                AIH.Reputation.getAxis(
                    faction,
                    "lewdness"
                );

            return value >= 75;
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Social",
        {
            version:
                AIH.Social.VERSION,

            initialize:
                function() {

                    AIH.Social.initialize();
                },

            getContext:
                function(faction) {

                    return AIH.Social.getContext(
                        faction
                    );
                },

            allContexts:
                function() {

                    return AIH.Social.allContexts();
                }
        }
    );

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    var _AIH_Social_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_Social_createGameObjects.call(
                this
            );

            AIH.Social.initialize();
        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Social_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_Social_setupNewGame.call(
                this
            );

            AIH.Social._initialized =
                false;

            AIH.Social.initialize();
        };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Social_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_Social_extractSaveContents.call(
                this,
                contents
            );

            AIH.Social._initialized =
                false;

            AIH.Social.initialize();
        };

})();   