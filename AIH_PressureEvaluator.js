/*:
 * @plugindesc AI Hero Framework - Shared Pressure Evaluator v1.0.1
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SHARED PRESSURE EVALUATOR
 * ============================================================================
 *
 * STEP 24
 *
 * A domain-neutral core that answers one question: given a "situation"
 * (something being asked of, or happening to, the heroine, described in a
 * common tagged-pressure vocabulary) and her current real psychology, how
 * willing is she, and what does she do?
 *
 * ============================================================================
 *
 * WHY THIS MODULE EXISTS
 *
 * AIH_GM_Livestreamintegration.js already built and tested exactly this
 * evaluation - a situation described by severity/reward/danger/
 * embarrassment/dignityCost/freedomCost/modestyCost/prideCost/
 * survivalBenefit/combatAdvantage, weighed against AIH.Personality/
 * AIH.Values/AIH.Emotions, producing a willingness/resistance verdict.
 *
 * The Personality Drift minigame handoff wants the exact same thing for
 * waitressing/bathhouse/training/performance/etc: a situation with
 * configurable pressure tags, evaluated against her real psychology,
 * producing a response. Rather than writing that evaluation a second time
 * (or a sixth time, one per minigame framework), this module lifts the
 * general-purpose parts of the livestream evaluator out into a shared
 * core that both call into.
 *
 * AIH_GM_Livestreamintegration.js has been refactored to delegate to this
 * module (see its evaluateRequest()) rather than duplicating the logic.
 * Its own tested public API and return shape are unchanged - this was a
 * pure extraction, not a behavior change. GM_Liveaudience.js required no
 * changes at all.
 *
 * ============================================================================
 *
 * DOMAIN-SPECIFIC VS SHARED
 *
 * What stays domain-specific, in whichever integration is calling this
 * (e.g. AIH_GM_Livestreamintegration.js, and eventually an
 * AIH_Minigame*.js):
 *
 *     - turning a domain's own raw event/request shape into the common
 *       "situation" vocabulary (a normalizeX() function of its own)
 *     - anything about a specific ongoing relationship with the source of
 *       the situation (a livestream viewer's loyalty; eventually a
 *       minigame regular customer's familiarity) - passed in as
 *       options.domainPressure / options.attachmentDiscount, below
 *     - any domain-specific persistent penalty/history (e.g. the
 *       livestream integration's challengePenalty) - passed in as
 *       options.domainResistance
 *
 * What is shared here:
 *
 *     - psychological cost calculation
 *     - survival / reward / emotional / personality / value pressure
 *     - the resistance/willingness/response scoring formula itself
 *
 * ============================================================================
 *
 * SITUATION SHAPE (produced by a domain's own normalizer)
 *
 * severity            "normal" | "medium" | "rare" | "extreme"
 * reward              raw number, log-scaled internally
 * danger              0..1
 * embarrassment       0..1
 * dignityCost         0..1
 * freedomCost         0..1
 * modestyCost         0..1
 * prideCost           0..1
 * survivalBenefit     0..1
 * combatAdvantage     0..1
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - decide the action taken
 * - execute anything
 * - modify personality, values, emotions, reputation or relationships
 * - track any per-source relationship state itself (that is the calling
 *   domain's job - see AIH_GM_Livestreamintegration.js for an example)
 * - call an LLM
 *
 * ============================================================================
 *
 * v1.0.1 CHANGELOG (merge of the two v1.0.0 forks)
 *
 * - _personalityPressure: the danger-facing "mercy" term is retired (the
 *   trait no longer exists on AIH.Personality) and replaced with
 *   AIH.Personality.getDecisiveness() - a derived read combining courage,
 *   confidence, sociability, and caution. Non-inverted (unlike mercy):
 *   HIGH decisiveness now pushes toward accepting a dangerous option.
 *   Read defensively (typeof/method-exists check, 0.5 fallback) so this
 *   still runs unchanged against an older AIH_Personality.js.
 *
 * - evaluate(): resistance now also gets an approvalSeeking amplifier,
 *   scaled by attachmentDiscount (not domainPressure - domainPressure at
 *   its existing Config.domainWeight saturates willingness from even mild
 *   familiarity, confirmed by testing) so her people-pleasing tendency has
 *   a real, measurable effect specifically when it's someone trusted/
 *   familiar doing the pressuring, not a flat situation-independent bonus.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.PressureEvaluator = AIH.PressureEvaluator || {};

    AIH.PressureEvaluator.VERSION = "1.0.1";

    AIH.PressureEvaluator._initialized = false;

    // =========================================================================
    // CONFIG
    // =========================================================================
    //
    // Values here are ported unchanged from
    // AIH_GM_Livestreamintegration.js's original Config, so evaluation
    // behavior for livestream requests is unaffected by this extraction.
    //
    // =========================================================================

    AIH.PressureEvaluator.Config = {

        survivalWeight: 1.40,
        emotionWeight: 1.00,
        personalityWeight: 0.90,
        valueWeight: 1.00,
        rewardWeight: 1.15,

        /*
         * Weight applied to options.domainPressure (the caller's own
         * relationship/source-specific pressure term).
         */
        domainWeight: 0.65,

        /*
         * Weight applied to options.domainResistance (the caller's own
         * persistent penalty/history term).
         */
        domainResistanceWeight: 0.25,

        baseResistance: 0.35,
        prideResistanceWeight: 0.20,
        dignityResistanceWeight: 0.20,
        freedomResistanceWeight: 0.15,
        modestyResistanceWeight: 0.20,
        fearResistanceWeight: 0.10,
        stressResistanceWeight: 0.10,

        severityPenalty: {
            normal: 0.00,
            medium: 0.08,
            rare: 0.16,
            extreme: 0.28
        },

        responseThresholds: {
            accept: 0.35,
            reluctantAccept: 0.05,
            partial: -0.15
        }

    };

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.PressureEvaluator._clamp01 = function(value) {

        value = Number(value);

        if (isNaN(value)) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(1, value)
        );
    };

    AIH.PressureEvaluator._number = function(value, fallback) {

        var result;

        result = Number(value);

        if (isNaN(result)) {
            return fallback;
        }

        return result;
    };

    AIH.PressureEvaluator._hasAIH = function() {

        return (
            typeof AIH.Personality !== "undefined" &&
            typeof AIH.Values !== "undefined" &&
            typeof AIH.Emotions !== "undefined" &&
            AIH.Personality.get &&
            AIH.Values.get &&
            AIH.Emotions.get
        );
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.PressureEvaluator.initialize = function() {

        AIH.PressureEvaluator._initialized = true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Shared pressure evaluator initialized."
            );
        }
    };

    // =========================================================================
    // NORMALIZE SITUATION
    // =========================================================================
    //
    // A generic normalizer any domain can use directly if its own event
    // shape already matches closely enough. Domains with meaningfully
    // different raw shapes (like the livestream integration's own
    // requests, which have viewer-specific fields and their own id
    // prefixing convention) are expected to keep their own normalizer and
    // simply produce a situation object compatible with what evaluate()
    // below expects - this generic one is a convenience, not a
    // requirement.
    //
    // =========================================================================

    AIH.PressureEvaluator.normalizeSituation = function(raw) {

        raw =
            raw || {};

        return {

            id:
                raw.id ||
                (
                    "situation_" +
                    Date.now() +
                    "_" +
                    Math.floor(
                        Math.random() * 100000
                    )
                ),

            type:
                raw.type ||
                "general",

            category:
                raw.category ||
                "general",

            description:
                raw.description ||
                raw.request ||
                "",

            severity:
                raw.severity ||
                "normal",

            reward:
                Math.max(
                    0,
                    AIH.PressureEvaluator._number(
                        raw.reward,
                        0
                    )
                ),

            danger:
                AIH.PressureEvaluator._clamp01(raw.danger),

            embarrassment:
                AIH.PressureEvaluator._clamp01(raw.embarrassment),

            dignityCost:
                AIH.PressureEvaluator._clamp01(raw.dignityCost),

            freedomCost:
                AIH.PressureEvaluator._clamp01(raw.freedomCost),

            modestyCost:
                AIH.PressureEvaluator._clamp01(raw.modestyCost),

            prideCost:
                AIH.PressureEvaluator._clamp01(raw.prideCost),

            survivalBenefit:
                AIH.PressureEvaluator._clamp01(raw.survivalBenefit),

            combatAdvantage:
                AIH.PressureEvaluator._clamp01(raw.combatAdvantage),

            source:
                raw.source ||
                raw.viewer ||
                null,

            context:
                raw.context ||
                raw.situation ||
                {},

            metadata:
                raw.metadata ||
                {}
        };
    };

    // =========================================================================
    // PSYCHOLOGICAL COST
    // =========================================================================
    //
    // A simple aggregate cost figure. Not currently consumed by
    // evaluate() below (it was unused in the original livestream
    // evaluator too), kept available for callers/debug tools that want a
    // single-number summary of how costly a situation looks to her.
    //
    // =========================================================================

    AIH.PressureEvaluator._psychologicalCost = function(situation) {

        var personality;
        var values;
        var cost;

        personality =
            AIH.Personality.get();

        values =
            AIH.Values.get();

        cost = 0;

        cost +=
            AIH.PressureEvaluator._number(personality.pride, 0) *
            AIH.PressureEvaluator._number(situation.prideCost, 0);

        cost +=
            AIH.PressureEvaluator._number(values.dignity, 0) *
            AIH.PressureEvaluator._number(situation.dignityCost, 0);

        cost +=
            AIH.PressureEvaluator._number(values.modesty, 0) *
            AIH.PressureEvaluator._number(situation.modestyCost, 0);

        cost +=
            AIH.PressureEvaluator._number(values.freedom, 0) *
            AIH.PressureEvaluator._number(situation.freedomCost, 0);

        return cost / 4;
    };

    // =========================================================================
    // SURVIVAL PRESSURE
    // =========================================================================

    AIH.PressureEvaluator._survivalPressure = function(situation) {

        var personality;
        var values;
        var emotions;
        var danger;
        var pressure;

        personality =
            AIH.Personality.get();

        values =
            AIH.Values.get();

        emotions =
            AIH.Emotions.get();

        danger =
            AIH.PressureEvaluator._clamp01(situation.danger);

        pressure = danger;

        pressure *=
            0.70 +
            AIH.PressureEvaluator._number(values.survival, 0.5) * 0.50;

        pressure *=
            0.70 +
            AIH.PressureEvaluator._number(emotions.fear, 0) * 0.50;

        pressure *=
            1.00 -
            (
                AIH.PressureEvaluator._number(personality.courage, 0.5) *
                0.25
            );

        pressure +=
            AIH.PressureEvaluator._number(situation.survivalBenefit, 0) *
            0.50;

        return AIH.PressureEvaluator._clamp01(pressure);
    };

    // =========================================================================
    // REWARD PRESSURE
    // =========================================================================

    AIH.PressureEvaluator._rewardPressure = function(situation) {

        var values;
        var reward;
        var normalized;

        values =
            AIH.Values.get();

        reward =
            Math.max(
                0,
                AIH.PressureEvaluator._number(situation.reward, 0)
            );

        normalized =
            Math.log(reward + 1) /
            Math.log(100001);

        normalized =
            AIH.PressureEvaluator._clamp01(normalized);

        normalized *=
            0.60 +
            AIH.PressureEvaluator._number(values.wealth, 0.5) * 0.40;

        normalized +=
            AIH.PressureEvaluator._number(situation.combatAdvantage, 0) *
            0.20;

        return AIH.PressureEvaluator._clamp01(normalized);
    };

    // =========================================================================
    // EMOTIONAL PRESSURE
    // =========================================================================

    AIH.PressureEvaluator._emotionalPressure = function(situation) {

        var emotions;
        var pressure;

        emotions =
            AIH.Emotions.get();

        pressure = 0;

        pressure +=
            AIH.PressureEvaluator._number(emotions.confidence, 0.5) *
            0.20;

        pressure -=
            AIH.PressureEvaluator._number(emotions.fear, 0) *
            0.30;

        pressure -=
            AIH.PressureEvaluator._number(emotions.stress, 0) *
            0.20;

        pressure -=
            AIH.PressureEvaluator._number(emotions.embarrassment, 0) *
            AIH.PressureEvaluator._number(situation.embarrassment, 0) *
            0.40;

        pressure +=
            AIH.PressureEvaluator._number(emotions.excitement, 0) *
            0.15;

        pressure -=
            AIH.PressureEvaluator._number(emotions.fatigue, 0) *
            0.15;

        return pressure;
    };

    // =========================================================================
    // PERSONALITY PRESSURE
    // =========================================================================

    AIH.PressureEvaluator._personalityPressure = function(situation) {

        var personality;
        var pressure;

        personality =
            AIH.Personality.get();

        pressure = 0;

        pressure +=
            AIH.PressureEvaluator._number(personality.courage, 0.5) *
            AIH.PressureEvaluator._number(situation.danger, 0) *
            0.35;

        pressure +=
            AIH.PressureEvaluator._number(personality.riskTolerance, 0.5) *
            AIH.PressureEvaluator._number(situation.danger, 0) *
            0.35;

        pressure +=
            AIH.PressureEvaluator._number(personality.curiosity, 0.5) *
            0.10;

        pressure -=
            AIH.PressureEvaluator._number(personality.independence, 0.5) *
            AIH.PressureEvaluator._number(situation.freedomCost, 0) *
            0.35;

        pressure -=
            AIH.PressureEvaluator._number(personality.pride, 0.5) *
            (
                AIH.PressureEvaluator._number(situation.prideCost, 0) +
                AIH.PressureEvaluator._number(situation.dignityCost, 0)
            ) *
            0.45;

        /*
         * The boundary/drift trait set (v0.2.0 of AIH_Personality.js).
         * Read defensively with a neutral fallback so this still works
         * unchanged against an older AIH_Personality.js that does not yet
         * have these traits.
         */

        pressure +=
            AIH.PressureEvaluator._number(personality.assertiveness, 0.5) *
            AIH.PressureEvaluator._number(situation.embarrassment, 0) *
            0.15;

        pressure -=
            AIH.PressureEvaluator._number(personality.inhibition, 0.5) *
            (
                AIH.PressureEvaluator._number(situation.modestyCost, 0) +
                AIH.PressureEvaluator._number(situation.embarrassment, 0)
            ) *
            0.30;

        pressure +=
            (
                AIH.PressureEvaluator._number(personality.attentionSeeking, 0.5) -
                0.5
            ) *
            AIH.PressureEvaluator._number(situation.embarrassment, 0) *
            0.20;

        /*
         * Replaces the retired "mercy" trait. Danger-facing willingness
         * used to be driven by raw mercy (cruelty made dangerous options
         * more appealing); that's now AIH.Personality.getDecisiveness() -
         * a derived read (see its own extensive comment in
         * AIH_Personality.js) combining courage, confidence, sociability,
         * and caution into "is she willing to take a forceful/decisive
         * action here." Non-inverted (unlike mercy): HIGH decisiveness
         * pushes toward accepting a dangerous option, not low.
         *
         * Reads AIH.Personality.getDecisiveness() directly rather than a
         * field off the `personality` snapshot object above, since it's
         * a computed function, not a stored trait.
         */
        pressure +=
            (
                (
                    typeof AIH.Personality !== "undefined" &&
                    AIH.Personality.getDecisiveness ?
                        AIH.Personality.getDecisiveness() :
                        0.5
                ) -
                0.5
            ) *
            AIH.PressureEvaluator._number(situation.danger, 0) *
            0.20;

        /*
         * approvalSeeking is a general disposition to please, not tied to
         * a specific situation field the way the others are - it nudges
         * willingness up across the board rather than in response to one
         * particular cost.
         */
        pressure +=
            (
                AIH.PressureEvaluator._number(personality.approvalSeeking, 0.5) -
                0.5
            ) *
            0.15;

        /*
         * trust/defiance, added when the trait-validity audit found these
         * were being reinforced by PersonalityDrift but never read
         * anywhere. High trust makes a dangerous-seeming situation read
         * as less alarming (less suspicious of the source); high
         * defiance makes dignity costs sting less (caring less what an
         * authority figure thinks of her).
         *
         * Deliberately placed here (willingness side, dampened by
         * Config.personalityWeight) rather than directly in the
         * resistance formula below. A first attempt put these terms
         * directly into resistance, undamped - even a very small
         * coefficient there was enough to push a candidate's score
         * across a response-tier boundary and collapse the ENTIRE
         * confrontation action space onto a single option regardless of
         * archetype or incident type, the same failure mode this whole
         * fix exists to solve. Found by testing the actual action
         * distribution after the change, not assumed from an isolated
         * direction/magnitude check alone - a coefficient can look
         * correctly-signed and modestly-sized in isolation while still
         * being catastrophic once it interacts with tier-based ranking.
         */
        pressure +=
            (
                AIH.PressureEvaluator._number(personality.trust, 0.5) -
                0.5
            ) *
            AIH.PressureEvaluator._number(situation.danger, 0) *
            0.10;

        pressure +=
            (
                AIH.PressureEvaluator._number(personality.defiance, 0.5) -
                0.5
            ) *
            AIH.PressureEvaluator._number(situation.dignityCost, 0) *
            0.10;

        return pressure;
    };

    // =========================================================================
    // VALUE PRESSURE
    // =========================================================================

    AIH.PressureEvaluator._valuePressure = function(situation) {

        var values;
        var pressure;

        values =
            AIH.Values.get();

        pressure = 0;

        pressure +=
            AIH.PressureEvaluator._number(values.survival, 0.5) *
            AIH.PressureEvaluator._number(situation.survivalBenefit, 0) *
            0.50;

        pressure +=
            AIH.PressureEvaluator._number(values.power, 0.5) *
            AIH.PressureEvaluator._number(situation.combatAdvantage, 0) *
            0.20;

        pressure +=
            AIH.PressureEvaluator._number(values.status, 0.5) *
            0.10;

        pressure -=
            AIH.PressureEvaluator._number(values.freedom, 0.5) *
            AIH.PressureEvaluator._number(situation.freedomCost, 0) *
            0.35;

        pressure -=
            AIH.PressureEvaluator._number(values.dignity, 0.5) *
            AIH.PressureEvaluator._number(situation.dignityCost, 0) *
            0.40;

        pressure -=
            AIH.PressureEvaluator._number(values.modesty, 0.5) *
            AIH.PressureEvaluator._number(situation.modestyCost, 0) *
            0.30;

        return pressure;
    };

    // =========================================================================
    // EVALUATE
    // =========================================================================
    //
    // The central shared function. Accepts an ALREADY-NORMALIZED situation
    // (see normalizeSituation() above, or a domain's own equivalent) plus
    // optional domain-specific pressure terms, and returns the same result
    // shape AIH_GM_Livestreamintegration.js's evaluateRequest() already
    // returned before this extraction, so existing callers do not need to
    // change.
    //
    // options:
    //     domainPressure       raw pressure contribution from the calling
    //                          domain's own relationship/source tracking
    //                          (e.g. livestream viewer favor/trust). Not
    //                          0..1 clamped - it is weighted by
    //                          Config.domainWeight the same way the
    //                          original viewerPressure was.
    //     domainResistance     0..1, a persistent penalty/history term
    //                          from the calling domain (e.g. the
    //                          livestream integration's challengePenalty).
    //     attachmentDiscount   raw amount subtracted directly from
    //                          resistance (e.g. viewer relationship favor
    //                          * attachmentWeight in the livestream case).
    //
    // =========================================================================

    AIH.PressureEvaluator.evaluate = function(
        situation,
        options
    ) {

        var personality;
        var values;
        var emotions;

        var survivalPressure;
        var rewardPressure;
        var emotionalPressure;
        var personalityPressure;
        var valuePressure;
        var domainPressure;
        var domainResistance;
        var attachmentDiscount;

        var resistance;
        var willingness;
        var severityPenalty;
        var score;
        var response;
        var thresholds;

        if (!AIH.PressureEvaluator._hasAIH()) {

            return {
                response: "reject",
                willingness: 0,
                resistance: 1,
                reason: "AIH psychology modules unavailable."
            };
        }

        if (!situation) {
            situation = AIH.PressureEvaluator.normalizeSituation({});
        }

        options =
            options || {};

        domainPressure =
            AIH.PressureEvaluator._number(options.domainPressure, 0);

        domainResistance =
            AIH.PressureEvaluator._clamp01(
                AIH.PressureEvaluator._number(options.domainResistance, 0)
            );

        attachmentDiscount =
            AIH.PressureEvaluator._number(options.attachmentDiscount, 0);

        personality =
            AIH.Personality.get();

        values =
            AIH.Values.get();

        emotions =
            AIH.Emotions.get();

        survivalPressure =
            AIH.PressureEvaluator._survivalPressure(situation);

        rewardPressure =
            AIH.PressureEvaluator._rewardPressure(situation);

        emotionalPressure =
            AIH.PressureEvaluator._emotionalPressure(situation);

        personalityPressure =
            AIH.PressureEvaluator._personalityPressure(situation);

        valuePressure =
            AIH.PressureEvaluator._valuePressure(situation);

        // -----------------------------------------------------------------
        // RESISTANCE
        // -----------------------------------------------------------------

        resistance =
            AIH.PressureEvaluator.Config.baseResistance;

        resistance +=
            AIH.PressureEvaluator._number(personality.pride, 0.5) *
            AIH.PressureEvaluator.Config.prideResistanceWeight;

        resistance +=
            AIH.PressureEvaluator._number(values.dignity, 0.5) *
            AIH.PressureEvaluator.Config.dignityResistanceWeight;

        resistance +=
            AIH.PressureEvaluator._number(values.freedom, 0.5) *
            AIH.PressureEvaluator.Config.freedomResistanceWeight;

        resistance +=
            AIH.PressureEvaluator._number(values.modesty, 0.5) *
            AIH.PressureEvaluator._number(situation.modestyCost, 0) *
            AIH.PressureEvaluator.Config.modestyResistanceWeight;

        resistance +=
            AIH.PressureEvaluator._number(emotions.fear, 0) *
            AIH.PressureEvaluator.Config.fearResistanceWeight;

        resistance +=
            AIH.PressureEvaluator._number(emotions.stress, 0) *
            AIH.PressureEvaluator.Config.stressResistanceWeight;

        /*
         * inhibition trait (v0.2.0 personality set) - read defensively.
         */
        resistance +=
            (
                AIH.PressureEvaluator._number(personality.inhibition, 0.5) -
                0.5
            ) *
            AIH.PressureEvaluator._number(situation.modestyCost, 0) *
            0.25;

        resistance +=
            domainResistance *
            AIH.PressureEvaluator.Config.domainResistanceWeight;

        severityPenalty =
            AIH.PressureEvaluator.Config.severityPenalty[
                situation.severity
            ];

        if (severityPenalty === undefined) {
            severityPenalty = 0;
        }

        resistance +=
            severityPenalty;

        resistance -=
            attachmentDiscount;

        /*
         * approvalSeeking amplified by a trusted/familiar source, per
         * design decision: her people-pleasing tendency should have a
         * real, measurable effect specifically when it's someone she
         * already trusts or knows well doing the pressuring, not a flat
         * situation-independent bonus alone. Deliberately built on
         * attachmentDiscount (bounded, 0..0.12 - trust/100 scaled) rather
         * than domainPressure, which is not bounded the same way and, at
         * its existing Config.domainWeight (0.65), saturates willingness
         * to its ceiling from even a mild acquaintance's familiarity
         * alone - confirmed by testing, not assumed. attachmentDiscount
         * has real headroom on the resistance side instead.
         */
        resistance -=
            (
                AIH.PressureEvaluator._number(personality.approvalSeeking, 0.5) -
                0.5
            ) *
            attachmentDiscount *
            1.2;

        // -----------------------------------------------------------------
        // WILLINGNESS
        // -----------------------------------------------------------------

        willingness = 0;

        willingness +=
            survivalPressure *
            AIH.PressureEvaluator.Config.survivalWeight;

        willingness +=
            rewardPressure *
            AIH.PressureEvaluator.Config.rewardWeight;

        willingness +=
            emotionalPressure *
            AIH.PressureEvaluator.Config.emotionWeight;

        willingness +=
            personalityPressure *
            AIH.PressureEvaluator.Config.personalityWeight;

        willingness +=
            valuePressure *
            AIH.PressureEvaluator.Config.valueWeight;

        willingness +=
            domainPressure *
            AIH.PressureEvaluator.Config.domainWeight;

        willingness =
            AIH.PressureEvaluator._clamp01(
                0.50 +
                willingness
            );

        resistance =
            AIH.PressureEvaluator._clamp01(
                resistance
            );

        // -----------------------------------------------------------------
        // RESPONSE
        // -----------------------------------------------------------------

        score =
            willingness -
            resistance;

        thresholds =
            AIH.PressureEvaluator.Config.responseThresholds;

        if (score >= thresholds.accept) {

            response = "accept";

        } else if (score >= thresholds.reluctantAccept) {

            response = "reluctant_accept";

        } else if (score >= thresholds.partial) {

            response = "partial";

        } else {

            response = "reject";
        }

        return {

            request: situation,
            situation: situation,

            response: response,

            willingness: willingness,
            resistance: resistance,
            score: score,

            survivalPressure: survivalPressure,
            rewardPressure: rewardPressure,
            emotionalPressure: emotionalPressure,
            personalityPressure: personalityPressure,
            valuePressure: valuePressure,

            domainPressure: domainPressure,
            viewerPressure: domainPressure,

            currentConfidence: emotions.confidence,
            currentFear: emotions.fear,
            currentEmbarrassment: emotions.embarrassment,

            personalityConfidence: personality.confidence,
            pride: personality.pride,
            dignity: values.dignity,
            modesty: values.modesty,
            freedom: values.freedom
        };
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "PressureEvaluator",
            {
                version:
                    AIH.PressureEvaluator.VERSION,

                initialize: function() {
                    AIH.PressureEvaluator.initialize();
                },

                evaluate: function(situation, options) {
                    return AIH.PressureEvaluator.evaluate(situation, options);
                },

                normalizeSituation: function(raw) {
                    return AIH.PressureEvaluator.normalizeSituation(raw);
                }
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_PressureEvaluator_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_PressureEvaluator_createGameObjects.call(
                this
            );

            AIH.PressureEvaluator.initialize();
        };
    }

})();