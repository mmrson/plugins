/*:
 * @plugindesc AI Hero - Livestream / Personality Integration v1.2.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO - LIVESTREAM / PSYCHOLOGY INTEGRATION
 * ============================================================================
 *
 * Connects:
 *
 *     GM.LiveAudience
 *     AIH.Personality
 *     AIH.Values
 *     AIH.Emotions
 *
 * v1.1.0: corrected every reference in this file from the old "GM.Audience"
 * name to the actual namespace the livestream plugin uses,
 * "GM.LiveAudience". Previously this meant every guarded
 * "GM.Audience && ..." check silently evaluated false and this bridge never
 * actually connected to anything. As of GM_Liveaudience.js v1.1.0,
 * LA.evaluateRequest() / LA.resolveRequest() / LA.triggerIncident() also
 * call back into AIH.Livestream.evaluateRequest() /
 * recordChallengeResult() / recordEffect() automatically when this file is
 * loaded, so the connection now works in both directions.
 *
 * v1.2.0: the general-purpose pressure evaluation logic (psychological
 * cost, survival/reward/emotional/personality/value pressure, and the
 * resistance/willingness/response formula) has been extracted into
 * AIH_PressureEvaluator.js so the minigame framework can reuse the same
 * tested evaluator instead of a second bespoke implementation.
 * evaluateRequest() now normalizes the request, computes the two pieces
 * that genuinely are livestream-specific (viewer relationship pressure and
 * the challenge-penalty/attachment terms), and delegates to
 * AIH.PressureEvaluator.evaluate(). This was a pure extraction - the
 * public API and return shape of evaluateRequest() are unchanged.
 * AIH_PressureEvaluator.js must be loaded for this file to work; if it is
 * missing, evaluateRequest() returns a safe reject rather than throwing.
 *
 * This plugin does NOT replace the underlying psychology modules.
 *
 * PERSONALITY
 *     Slow-changing tendencies.
 *
 * VALUES
 *     Medium-term priorities.
 *
 * EMOTIONS
 *     Rapidly changing current state.
 *
 * LIVESTREAM
 *     External audience pressure, rewards, requests and consequences.
 *
 * ============================================================================
 *
 * IMPORTANT DESIGN RULE
 *
 * The livestream system does NOT directly decide what the heroine does.
 *
 * It evaluates:
 *
 *     personality
 *     values
 *     current emotions
 *     immediate situation
 *     reward
 *     audience relationship
 *
 * and produces a willingness profile.
 *
 * Another decision system may then use that result to choose:
 *
 *     accept
 *     reluctantly accept
 *     reject
 *     partially comply
 *
 * ============================================================================
 *
 * REQUEST TYPES
 *
 * CHALLENGE
 *
 *     Something the audience asks the heroine to deliberately do or refrain
 *     from doing.
 *
 * Examples:
 *
 *     no weapon this floor
 *     take the left passage
 *     use the oversized weapon
 *     do not heal this floor
 *     remove armor
 *
 * EFFECT
 *
 *     Something that happens to the heroine independently of her accepting
 *     a challenge.
 *
 * Examples:
 *
 *     wardrobe malfunction
 *     equipment breaks
 *     temporary blindness
 *     forced equipment removal
 *
 * The heroine reacts to EFFECTS rather than accepting them.
 *
 * ============================================================================
 *
 * REQUEST RESPONSE
 *
 *     ACCEPT
 *     RELUCTANT_ACCEPT
 *     PARTIAL
 *     REJECT
 *
 * The AI decision system may use the evaluation generated here.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This plugin deliberately does NOT:
 *
 *     - make combat decisions
 *     - control the heroine
 *     - call an LLM
 *     - modify Personality automatically
 *     - modify Values automatically
 *     - decide whether a skill is used
 *
 * It provides psychological inputs and records experiences.
 *
 * ============================================================================
 */

var AIH = AIH || {};
var GM = GM || {};

(function() {

    "use strict";

    AIH.Livestream = AIH.Livestream || {};

    AIH.Livestream.VERSION = "1.2.0";
    AIH.Livestream.SCHEMA_VERSION = 1;

    AIH.Livestream._initialized = false;

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    AIH.Livestream.Config = {

        /*
         * How strongly immediate survival overrides pride/dignity.
         */
        survivalWeight: 1.40,

        /*
         * How strongly current emotional state affects willingness.
         */
        emotionWeight: 1.00,

        /*
         * How strongly personality affects willingness.
         */
        personalityWeight: 0.90,

        /*
         * How strongly values affect willingness.
         */
        valueWeight: 1.00,

        /*
         * Reward importance.
         */
        rewardWeight: 1.15,

        /*
         * Existing relationship with the requesting viewer.
         */
        relationshipWeight: 0.65,

        /*
         * Stronger audience attachment lowers the effective threshold.
         */
        attachmentWeight: 0.75,

        /*
         * Extreme requests require substantially more justification.
         */
        severityPenalty: {
            normal: 0.00,
            medium: 0.08,
            rare: 0.16,
            extreme: 0.28
        },

        /*
         * Immediate danger scale.
         *
         * 0 = safe
         * 1 = dangerous
         */
        dangerScale: 1.0
    };

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.Livestream._clamp01 = function(value) {

        value = Number(value);

        if (isNaN(value)) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(1, value)
        );
    };

    AIH.Livestream._number = function(value, fallback) {

        value = Number(value);

        if (isNaN(value)) {
            return fallback || 0;
        }

        return value;
    };

    AIH.Livestream._hasAIH = function() {

        return (
            typeof AIH !== "undefined" &&
            AIH.Personality &&
            AIH.Values &&
            AIH.Emotions
        );
    };

    AIH.Livestream._audience = function() {

        if (
            typeof GM === "undefined" ||
            !GM.LiveAudience
        ) {
            return null;
        }

        return GM.LiveAudience;
    };

    // =========================================================================
    // STATE
    // =========================================================================

    AIH.Livestream._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {
            return null;
        }

        return AIH.State._internal();
    };

    AIH.Livestream._ensure = function() {

        var state =
            AIH.Livestream._state();

        if (!state) {
            return null;
        }

        if (!state.livestreamIntegration) {

            state.livestreamIntegration = {

                schemaVersion:
                    AIH.Livestream.SCHEMA_VERSION,

                activeChallenges: [],

                completedChallenges: 0,

                brokenChallenges: 0,

                rejectedChallenges: 0,

                partialChallenges: 0,

                challengePenalty: 0,

                totalChallengeRewards: 0,

                totalAudienceFavor: 0,

                viewerRelationships: {},

                behaviorHistory: []

            };
        }

        return state.livestreamIntegration;
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Livestream.initialize = function() {

        AIH.Livestream._ensure();

        AIH.Livestream._initialized = true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Livestream / AI psychology integration initialized."
            );
        }
    };

    // =========================================================================
    // GET PERSONALITY
    // =========================================================================

    AIH.Livestream.getPsychology = function() {

        if (!AIH.Livestream._hasAIH()) {
            return null;
        }

        return {

            personality:
                AIH.Personality.get(),

            values:
                AIH.Values.get(),

            emotions:
                AIH.Emotions.get()

        };
    };

    // =========================================================================
    // VIEWER RELATIONSHIP
    // =========================================================================
    //
    // A viewer who has repeatedly rewarded the heroine becomes more persuasive.
    //
    // This is intentionally separate from personality.
    //
    // =========================================================================

    AIH.Livestream.getViewerRelationship = function(
        viewer
    ) {

        var state;
        var id;

        if (!viewer) {
            return {
                trust: 0,
                favor: 0,
                familiarity: 0,
                rewardHistory: 0,
                successfulRequests: 0
            };
        }

        state =
            AIH.Livestream._ensure();

        if (!state) {
            return {
                trust: 0,
                favor: 0,
                familiarity: 0,
                rewardHistory: 0,
                successfulRequests: 0
            };
        }

        id =
            String(
                viewer.id ||
                viewer.name ||
                "unknown"
            );

        if (!state.viewerRelationships[id]) {

            state.viewerRelationships[id] = {

                trust: 0,

                favor: 0,

                familiarity: 0,

                rewardHistory: 0,

                successfulRequests: 0,

                rejectedRequests: 0

            };
        }

        return state.viewerRelationships[id];
    };

    AIH.Livestream.recordViewerInteraction =
        function(
            viewer,
            result,
            reward
        ) {

            var relationship =
                AIH.Livestream.getViewerRelationship(
                    viewer
                );

            reward =
                Math.max(
                    0,
                    AIH.Livestream._number(
                        reward,
                        0
                    )
                );

            relationship.familiarity =
                AIH.Livestream._clamp01(
                    relationship.familiarity +
                    0.025
                );

            if (reward > 0) {

                relationship.rewardHistory +=
                    reward;

                relationship.favor =
                    AIH.Livestream._clamp01(
                        relationship.favor +
                        Math.min(
                            0.10,
                            reward / 10000
                        )
                    );

                relationship.trust =
                    AIH.Livestream._clamp01(
                        relationship.trust +
                        0.025
                    );
            }

            if (
                result === "accept" ||
                result === "reluctant_accept"
            ) {

                relationship.successfulRequests++;

                relationship.trust =
                    AIH.Livestream._clamp01(
                        relationship.trust +
                        0.02
                    );
            }

            if (result === "reject") {

                relationship.rejectedRequests++;

                relationship.trust =
                    AIH.Livestream._clamp01(
                        relationship.trust -
                        0.005
                    );
            }

            return relationship;
        };

    // =========================================================================
    // REQUEST CONTEXT
    // =========================================================================
    //
    // Standardizes the information supplied by other systems.
    //
    // =========================================================================

    AIH.Livestream.normalizeRequest = function(
        request
    ) {

        request =
            request || {};

        return {

            id:
                request.id ||
                (
                    "challenge_" +
                    Date.now() +
                    "_" +
                    Math.floor(
                        Math.random() * 100000
                    )
                ),

            type:
                request.type ||
                "challenge",

            category:
                request.category ||
                "general",

            request:
                request.request ||
                request.description ||
                "",

            severity:
                request.severity ||
                "normal",

            reward:
                Math.max(
                    0,
                    AIH.Livestream._number(
                        request.reward ||
                        request.amount,
                        0
                    )
                ),

            popularityReward:
                Math.max(
                    0,
                    AIH.Livestream._number(
                        request.popularityReward,
                        0
                    )
                ),

            favorReward:
                Math.max(
                    0,
                    AIH.Livestream._number(
                        request.favorReward,
                        0
                    )
                ),

            danger:
                AIH.Livestream._clamp01(
                    request.danger
                ),

            embarrassment:
                AIH.Livestream._clamp01(
                    request.embarrassment
                ),

            dignityCost:
                AIH.Livestream._clamp01(
                    request.dignityCost
                ),

            freedomCost:
                AIH.Livestream._clamp01(
                    request.freedomCost
                ),

            modestyCost:
                AIH.Livestream._clamp01(
                    request.modestyCost
                ),

            prideCost:
                AIH.Livestream._clamp01(
                    request.prideCost
                ),

            survivalBenefit:
                AIH.Livestream._clamp01(
                    request.survivalBenefit
                ),

            combatAdvantage:
                AIH.Livestream._clamp01(
                    request.combatAdvantage
                ),

            viewer:
                request.viewer ||
                request.sourceViewer ||
                null,

            situation:
                request.situation ||
                {},

            metadata:
                request.metadata ||
                {}

        };
    };

    // =========================================================================
    // PSYCHOLOGICAL COST
    // =========================================================================

    // =========================================================================
    // VIEWER PRESSURE
    // =========================================================================
    //
    // This stays here rather than in the shared AIH_PressureEvaluator.js
    // because it depends on AIH.Livestream.getViewerRelationship(), which
    // is specific to how this integration tracks individual livestream
    // viewers. It is passed into the shared evaluator as
    // options.domainPressure.
    //
    // =========================================================================

    AIH.Livestream._viewerPressure =
        function(request) {

            var viewer;
            var relationship;
            var pressure;

            viewer =
                request.viewer;

            if (!viewer) {
                return 0;
            }

            relationship =
                AIH.Livestream.getViewerRelationship(
                    viewer
                );

            pressure = 0;

            /*
             * A viewer who has successfully rewarded the heroine before gets
             * more influence.
             */
            pressure +=
                relationship.favor *
                0.25;

            pressure +=
                relationship.trust *
                0.20;

            pressure +=
                relationship.familiarity *
                0.10;

            /*
             * Existing viewer loyalty/importance can matter.
             */
            pressure +=
                AIH.Livestream._number(
                    viewer.loyalty,
                    0
                ) /
                100 *
                0.10;

            /*
             * High-value donor.
             */
            pressure +=
                AIH.Livestream._number(
                    viewer.vipLevel,
                    0
                ) *
                0.04;

            return pressure;
        };

    // =========================================================================
    // ACCEPTANCE EVALUATION
    // =========================================================================
    //
    // This is the central integration function.
    //
    // It does NOT choose the action.
    //
    // It returns the psychological pressure surrounding the action.
    //
    // v1.1.0: the actual pressure math (psychological cost, survival,
    // reward, emotional, personality and value pressure, and the
    // resistance/willingness/response formula) now lives in the shared
    // AIH_PressureEvaluator.js, so the same evaluation logic can be reused
    // by minigames instead of being duplicated per system. This function
    // is now a thin wrapper: it normalizes the request, computes the
    // livestream-specific pressure terms (viewer relationship pressure,
    // the challenge-penalty resistance, and viewer-attachment discount),
    // and delegates to AIH.PressureEvaluator.evaluate(). The return shape
    // is unchanged from before this refactor - every field that used to
    // be here is still here.
    //
    // =========================================================================

    AIH.Livestream.evaluateRequest =
        function(rawRequest) {

            var request;
            var viewerPressure;
            var integrationState;
            var domainResistance;
            var attachmentDiscount;
            var relationship;
            var result;

            if (!AIH.Livestream._hasAIH()) {

                return {
                    response: "reject",
                    willingness: 0,
                    resistance: 1,
                    reason: "AIH psychology modules unavailable."
                };
            }

            if (
                typeof AIH.PressureEvaluator === "undefined" ||
                !AIH.PressureEvaluator.evaluate
            ) {

                return {
                    response: "reject",
                    willingness: 0,
                    resistance: 1,
                    reason: "Shared pressure evaluator (AIH_PressureEvaluator.js) unavailable."
                };
            }

            request =
                AIH.Livestream.normalizeRequest(
                    rawRequest
                );

            viewerPressure =
                AIH.Livestream._viewerPressure(
                    request
                );

            integrationState =
                AIH.Livestream._ensure();

            domainResistance =
                AIH.Livestream._clamp01(
                    integrationState.challengePenalty
                );

            attachmentDiscount = 0;

            if (request.viewer) {

                relationship =
                    AIH.Livestream.getViewerRelationship(
                        request.viewer
                    );

                attachmentDiscount =
                    relationship.favor *
                    AIH.Livestream.Config.attachmentWeight;
            }

            result =
                AIH.PressureEvaluator.evaluate(
                    request,
                    {
                        domainPressure: viewerPressure,
                        domainResistance: domainResistance,
                        attachmentDiscount: attachmentDiscount
                    }
                );

            result.request =
                request;

            result.viewerPressure =
                viewerPressure;

            return result;
        };


    // =========================================================================
    // CURRENT AUDIENCE RESISTANCE
    // =========================================================================
    //
    // Legacy compatibility for GM.LiveAudience.
    //
    // The old audience plugin has playerResistance as a persistent scalar.
    //
    // We do not allow that value to become the authoritative psychological
    // source anymore.
    //
    // =========================================================================

    AIH.Livestream.getPlayerResistance =
        function() {

            if (!AIH.Livestream._hasAIH()) {

                if (
                    GM.LiveAudience &&
                    typeof GM.LiveAudience.playerResistance ===
                    "number"
                ) {

                    return GM.LiveAudience.playerResistance;
                }

                return 50;
            }

            var personality =
                AIH.Personality.get();

            var values =
                AIH.Values.get();

            var emotions =
                AIH.Emotions.get();

            var resistance = 50;

            /*
             * Higher pride/dignity/freedom =
             * harder to pressure.
             */
            resistance +=
                personality.pride *
                15;

            resistance +=
                values.dignity *
                15;

            resistance +=
                values.freedom *
                10;

            resistance +=
                values.modesty *
                8;

            /*
             * Current fear/stress can either increase resistance to a demand
             * or reduce ability to comply rationally. We use a moderate effect.
             */
            resistance +=
                emotions.fear *
                8;

            resistance +=
                emotions.stress *
                5;

            /*
             * Current confidence makes difficult challenges feel more doable.
             */
            resistance -=
                emotions.confidence *
                8;

            resistance =
                Math.max(
                    0,
                    Math.min(
                        100,
                        resistance
                    )
                );

            return resistance;
        };

    // =========================================================================
    // RECORD CHALLENGE RESULT
    // =========================================================================
    //
    // This records what actually happened.
    //
    // It does NOT automatically rewrite personality or values.
    //
    // =========================================================================

    AIH.Livestream.recordChallengeResult =
        function(
            rawRequest,
            result,
            context
        ) {

            var request;
            var state;
            var entry;

            request =
                AIH.Livestream.normalizeRequest(
                    rawRequest
                );

            state =
                AIH.Livestream._ensure();

            if (!state) {
                return null;
            }

            result =
                String(
                    result ||
                    "reject"
                );

            entry = {

                id:
                    request.id,

                request:
                    request.request,

                category:
                    request.category,

                result:
                    result,

                reward:
                    request.reward,

                severity:
                    request.severity,

                context:
                    context || {},

                time:
                    Date.now()

            };

            state.behaviorHistory.push(
                entry
            );

            if (
                state.behaviorHistory.length >
                200
            ) {

                state.behaviorHistory.splice(
                    0,
                    state.behaviorHistory.length - 200
                );
            }

            if (result === "accept") {

                state.completedChallenges++;

                state.totalChallengeRewards +=
                    request.reward;

                state.totalAudienceFavor +=
                    request.favorReward;

                /*
                 * Successful challenge slightly reduces future resistance.
                 *
                 * This represents accumulated familiarity, not personality
                 * change.
                 */
                state.challengePenalty =
                    Math.max(
                        0,
                        state.challengePenalty -
                        0.015
                    );
            }

            else if (
                result === "reluctant_accept"
            ) {

                state.completedChallenges++;

                state.totalChallengeRewards +=
                    request.reward;

                state.totalAudienceFavor +=
                    request.favorReward;

                state.challengePenalty =
                    Math.max(
                        0,
                        state.challengePenalty -
                        0.005
                    );
            }

            else if (result === "partial") {

                state.partialChallenges++;

                state.challengePenalty +=
                    0.025;
            }

            else if (result === "reject") {

                state.rejectedChallenges++;

                state.challengePenalty +=
                    0.05;
            }

            state.challengePenalty =
                AIH.Livestream._clamp01(
                    state.challengePenalty
                );

            /*
             * Audience interaction changes current emotional state where
             * appropriate.
             *
             * These are immediate experiences.
             */
            AIH.Livestream._applyImmediateEmotion(
                request,
                result,
                context || {}
            );

            /*
             * Record viewer relationship.
             */
            AIH.Livestream.recordViewerInteraction(
                request.viewer,
                result,
                request.reward
            );

            /*
             * Also expose the event to the existing Audience plugin.
             */
            if (
                GM.LiveAudience &&
                typeof GM.LiveAudience.recordBehavior ===
                "function"
            ) {

                GM.LiveAudience.recordBehavior(
                    "LIVESTREAM_CHALLENGE_" +
                    result.toUpperCase(),
                    {
                        request:
                            request.request,

                        category:
                            request.category,

                        severity:
                            request.severity,

                        reward:
                            request.reward
                    }
                );
            }

            return entry;
        };

    // =========================================================================
    // IMMEDIATE EMOTIONAL CONSEQUENCES
    // =========================================================================

    AIH.Livestream._applyImmediateEmotion =
        function(
            request,
            result,
            context
        ) {

            if (!AIH.Livestream._hasAIH()) {
                return;
            }

            /*
             * Acceptance of a difficult request can produce excitement and
             * confidence if it succeeds.
             */
            if (
                result === "accept" ||
                result === "reluctant_accept"
            ) {

                if (
                    request.danger > 0.4
                ) {

                    AIH.Emotions.modifyValue(
                        "excitement",
                        0.03
                    );

                    AIH.Emotions.modifyValue(
                        "confidence",
                        0.015
                    );
                }

                /*
                 * Socially embarrassing requests can still create immediate
                 * embarrassment even when accepted.
                 */
                if (
                    request.embarrassment > 0
                ) {

                    AIH.Emotions.modifyValue(
                        "embarrassment",
                        request.embarrassment *
                        0.10
                    );
                }
            }

            /*
             * Rejection can produce frustration/stress.
             */
            if (
                result === "reject"
            ) {

                AIH.Emotions.modifyValue(
                    "stress",
                    0.02
                );

                AIH.Emotions.modifyValue(
                    "frustration",
                    0.015
                );
            }

            /*
             * Partial compliance is psychologically ambiguous.
             */
            if (
                result === "partial"
            ) {

                AIH.Emotions.modifyValue(
                    "stress",
                    0.015
                );
            }

            /*
             * Context can describe whether the challenge was actually
             * successful.
             */
            if (
                context &&
                context.success === true
            ) {

                AIH.Emotions.modifyValue(
                    "confidence",
                    0.025
                );

                AIH.Emotions.modifyValue(
                    "frustration",
                    -0.025
                );
            }

            if (
                context &&
                context.failed === true
            ) {

                AIH.Emotions.modifyValue(
                    "confidence",
                    -0.04
                );

                AIH.Emotions.modifyValue(
                    "frustration",
                    0.04
                );
            }
        };

    // =========================================================================
    // RECORD SPONTANEOUS EFFECT
    // =========================================================================
    //
    // Effects are not challenges.
    //
    // The heroine does not "accept" a wardrobe malfunction.
    //
    // The effect occurs, then her psychology reacts to the situation.
    //
    // =========================================================================

    AIH.Livestream.recordEffect =
        function(
            rawEffect,
            context
        ) {

            var effect;
            var emotions;

            effect =
                AIH.Livestream.normalizeRequest(
                    rawEffect
                );

            emotions =
                AIH.Emotions.get();

            if (!emotions) {
                return null;
            }

            /*
             * Severity of embarrassment depends on context.
             *
             * A wardrobe malfunction in an empty corridor is not equivalent
             * to one in the middle of combat.
             */
            var situationalMultiplier =
                context &&
                context.public === true
                    ? 1.0
                    : 0.35;

            if (
                context &&
                context.inCombat === true
            ) {

                situationalMultiplier +=
                    0.35;
            }

            if (
                context &&
                context.immediateDanger === true
            ) {

                situationalMultiplier +=
                    0.20;
            }

            situationalMultiplier =
                Math.min(
                    1.50,
                    situationalMultiplier
                );

            AIH.Emotions.modifyValue(
                "embarrassment",
                effect.embarrassment *
                0.12 *
                situationalMultiplier
            );

            AIH.Emotions.modifyValue(
                "stress",
                effect.danger *
                0.08
            );

            /*
             * If the heroine discovers that continuing without the equipment
             * is actually effective, confidence can improve.
             *
             * The actual combat system supplies successfulUse.
             */
            if (
                context &&
                context.successfulUse === true
            ) {

                AIH.Emotions.modifyValue(
                    "confidence",
                    0.03
                );

                AIH.Emotions.modifyValue(
                    "embarrassment",
                    -0.02
                );
            }

            /*
             * Record the experience for later psychology systems.
             */
            var state =
                AIH.Livestream._ensure();

            if (state) {

                state.behaviorHistory.push({

                    type:
                        "SPONTANEOUS_EFFECT",

                    effect:
                        effect.request,

                    context:
                        context || {},

                    time:
                        Date.now()

                });

                if (
                    state.behaviorHistory.length >
                    200
                ) {

                    state.behaviorHistory.splice(
                        0,
                        state.behaviorHistory.length - 200
                    );
                }
            }

            /*
             * Existing audience event hook.
             */
            if (
                GM.LiveAudience &&
                typeof GM.LiveAudience.reactTo ===
                "function"
            ) {

                GM.LiveAudience.reactTo(
                    "audience_effect",
                    {
                        effect:
                            effect.request,

                        category:
                            effect.category,

                        context:
                            context || {}
                    }
                );
            }

            return {

                effect:
                    effect,

                embarrassment:
                    AIH.Emotions.getValue(
                        "embarrassment"
                    ),

                stress:
                    AIH.Emotions.getValue(
                        "stress"
                    ),

                context:
                    context || {}

            };
        };

    // =========================================================================
    // CONVENIENCE: WARDROBE MALFUNCTION
    // =========================================================================

    AIH.Livestream.wardrobeMalfunction =
        function(
            equipmentName,
            context
        ) {

            return AIH.Livestream.recordEffect(
                {
                    type:
                        "effect",

                    category:
                        "wardrobe",

                    request:
                        "wardrobe malfunction",

                    severity:
                        "normal",

                    embarrassment:
                        0.70,

                    dignityCost:
                        0.55,

                    modestyCost:
                        0.50

                },
                {

                    equipment:
                        equipmentName ||
                        null,

                    public:
                        context &&
                        context.public === true,

                    inCombat:
                        context &&
                        context.inCombat === true,

                    immediateDanger:
                        context &&
                        context.immediateDanger === true,

                    successfulUse:
                        context &&
                        context.successfulUse === true

                }
            );
        };

    // =========================================================================
    // CHALLENGE PENALTY
    // =========================================================================

    AIH.Livestream.getChallengePenalty =
        function() {

            var state =
                AIH.Livestream._ensure();

            if (!state) {
                return 0;
            }

            return state.challengePenalty;
        };

    // =========================================================================
    // AUDIENCE LEWDNESS
    // =========================================================================
    //
    // Global audience lewdness remains an audience property.
    //
    // It is NOT a heroine personality trait.
    //
    // =========================================================================

    AIH.Livestream.getAudienceLewdness =
        function() {

            if (
                GM.LiveAudience &&
                typeof GM.LiveAudience.lewdness ===
                "number"
            ) {

                return Math.max(
                    0,
                    Math.min(
                        100,
                        GM.LiveAudience.lewdness
                    )
                );
            }

            return 0;
        };

    // =========================================================================
    // REQUEST THRESHOLD
    // =========================================================================
    //
    // Useful for the future Social Decisions / Heroine AI system.
    //
    // =========================================================================

    AIH.Livestream.getAcceptanceProfile =
        function(request) {

            var evaluation =
                AIH.Livestream.evaluateRequest(
                    request
                );

            return {

                response:
                    evaluation.response,

                willingness:
                    evaluation.willingness,

                resistance:
                    evaluation.resistance,

                score:
                    evaluation.score,

                immediateSurvivalPressure:
                    evaluation.survivalPressure,

                rewardPressure:
                    evaluation.rewardPressure,

                viewerPressure:
                    evaluation.viewerPressure,

                emotionalPressure:
                    evaluation.emotionalPressure

            };
        };

    // =========================================================================
    // ACTIVE CHALLENGES
    // =========================================================================

    AIH.Livestream.addChallenge =
        function(request) {

            var state =
                AIH.Livestream._ensure();

            if (!state) {
                return null;
            }

            request =
                AIH.Livestream.normalizeRequest(
                    request
                );

            request.type =
                "challenge";

            state.activeChallenges.push(
                request
            );

            return request;
        };

    AIH.Livestream.getActiveChallenges =
        function() {

            var state =
                AIH.Livestream._ensure();

            if (!state) {
                return [];
            }

            return JSON.parse(
                JSON.stringify(
                    state.activeChallenges
                )
            );
        };

    AIH.Livestream.removeChallenge =
        function(id) {

            var state =
                AIH.Livestream._ensure();

            if (!state) {
                return false;
            }

            for (
                var i = 0;
                i < state.activeChallenges.length;
                i++
            ) {

                if (
                    state.activeChallenges[i].id ===
                    id
                ) {

                    state.activeChallenges.splice(
                        i,
                        1
                    );

                    return true;
                }
            }

            return false;
        };

    // =========================================================================
    // DEBUG
    // =========================================================================

    AIH.Livestream.debugEvaluate =
        function() {

            return AIH.Livestream.evaluateRequest({

                type:
                    "challenge",

                category:
                    "debug",

                request:
                    "fight without a weapon",

                severity:
                    "medium",

                reward:
                    2500,

                danger:
                    0.45,

                embarrassment:
                    0.05,

                dignityCost:
                    0.05,

                freedomCost:
                    0.25,

                modestyCost:
                    0,

                prideCost:
                    0.15,

                survivalBenefit:
                    0.15,

                combatAdvantage:
                    0.05

            });
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        AIH.Modules &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "LivestreamIntegration",
            {

                version:
                    AIH.Livestream.VERSION,

                initialize:
                    function() {
                        AIH.Livestream.initialize();
                    },

                evaluateRequest:
                    function(request) {
                        return AIH.Livestream.evaluateRequest(
                            request
                        );
                    },

                recordChallengeResult:
                    function(
                        request,
                        result,
                        context
                    ) {

                        return AIH.Livestream.recordChallengeResult(
                            request,
                            result,
                            context
                        );
                    },

                recordEffect:
                    function(
                        effect,
                        context
                    ) {

                        return AIH.Livestream.recordEffect(
                            effect,
                            context
                        );
                    }

            }
        );
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    var _AIH_LivestreamIntegration_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_LivestreamIntegration_createGameObjects.call(
            this
        );

        AIH.Livestream.initialize();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_LivestreamIntegration_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_LivestreamIntegration_setupNewGame.call(
            this
        );

        AIH.Livestream._initialized =
            false;

        AIH.Livestream.initialize();
    };

    // =========================================================================
    // SAVE / LOAD
    // =========================================================================

    var _AIH_LivestreamIntegration_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_LivestreamIntegration_extractSaveContents.call(
                this,
                contents
            );

            AIH.Livestream._initialized =
                false;

            AIH.Livestream.initialize();
        };

})();