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

    AIH.Personality.VERSION = "0.2.0";

    AIH.Personality._initialized = false;

    // =========================================================================
    // TRAIT DEFINITIONS
    // =========================================================================
    //
    // v0.2.0 adds the "boundary/drift" trait set from the minigame design
    // pass (Personality Drift RPG handoff): assertiveness, inhibition,
    // approvalSeeking, trust, defiance, attentionSeeking. ("mercy" was
    // originally part of this set too but has since been retired as a
    // standalone stored trait - see getDecisiveness() below, which
    // replaces its formula role with a derived composite of courage/
    // confidence/sociability/caution instead.)
    //
    // These follow the same convention as the original 9: each trait name
    // names the HIGH pole (1.0 = a lot of that named quality), not a
    // bipolar pair.
    //
    //     assertiveness     0 = passive               1 = assertive
    //     inhibition        0 = uninhibited            1 = reserved/inhibited
    //     approvalSeeking   0 = self-directed           1 = people-pleasing
    //     trust             0 = suspicious               1 = trusting
    //     defiance          0 = submissive to authority    1 = defiant
    //     attentionSeeking  0 = avoids attention            1 = seeks attention
    //
    // IMPORTANT: assertiveness is not expressed independently of
    // confidence. A heroine can privately want to speak up (high
    // assertiveness) but not actually do so if her current confidence is
    // low - she gets talked out of it instead. This module still stores
    // assertiveness as its own trait (it is not the same thing as
    // confidence - a confident person is not automatically assertive,
    // e.g. someone confident but very conflict-avoidant), but any caller
    // that wants to know how assertively she will actually BEHAVE right
    // now should use AIH.Personality.getEffectiveAssertiveness() below
    // rather than reading the raw trait, since that blends the trait with
    // both her baseline personality confidence and her current momentary
    // confidence (AIH.Emotions.confidence).
    //
    // IMPORTANT: inhibition intentionally does NOT start neutral, the same
    // way pride/dignity/modesty do not. It starts high, matching her
    // established identity, and is expected to drift downward over time
    // through AIH_PersonalityDrift.js rather than through direct edits
    // here.
    //
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
        "confidence",

        "assertiveness",
        "inhibition",
        "approvalSeeking",
        "trust",
        "defiance",
        "attentionSeeking"

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

            confidence: 0.95,

            assertiveness: 0.85,

            inhibition: 0.80,

            approvalSeeking: 0.20,

            trust: 0.80,

            defiance: 0.75,

            attentionSeeking: 0.50

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
    // EFFECTIVE ASSERTIVENESS
    // =========================================================================
    //
    // Assertiveness is stored as its own trait (wanting to speak up is not
    // the same thing as being confident), but whether that intention
    // actually translates into assertive behavior right now depends on
    // confidence - both her baseline personality confidence and her
    // current momentary confidence (AIH.Emotions.confidence, if that
    // module is present). Low confidence means she gets talked out of it
    // even when the trait itself is high.
    //
    // This blends: 60% the raw assertiveness trait, 40% a confidence
    // factor (itself 60% baseline personality confidence / 40% current
    // emotional confidence when emotions are available). A caller that
    // wants to know how assertively she is likely to actually behave right
    // now should use this instead of the raw trait.
    //
    // =========================================================================

    AIH.Personality.getEffectiveAssertiveness = function() {

        var assertiveness;
        var baselineConfidence;
        var currentConfidence;
        var confidenceFactor;

        assertiveness =
            AIH.Personality.getTrait("assertiveness");

        if (assertiveness === null) {
            return 0;
        }

        baselineConfidence =
            AIH.Personality.getTrait("confidence");

        if (baselineConfidence === null) {
            baselineConfidence = 0.5;
        }

        currentConfidence =
            baselineConfidence;

        if (
            typeof AIH.Emotions !== "undefined" &&
            AIH.Emotions.getValue
        ) {

            currentConfidence =
                Number(
                    AIH.Emotions.getValue("confidence")
                );

            if (isNaN(currentConfidence)) {
                currentConfidence = baselineConfidence;
            }
        }

        confidenceFactor =
            (baselineConfidence * 0.60) +
            (currentConfidence * 0.40);

        return AIH.Personality._clamp01(
            (assertiveness * 0.60) +
            (confidenceFactor * 0.40)
        );
    };

    // =========================================================================
    // DECISIVENESS (replaces the retired "mercy" trait)
    // =========================================================================
    //
    // "mercy" was retired - it was a standalone stored trait with no
    // richer relationship to anything else, and its only formula role
    // (AIH_PressureEvaluator._personalityPressure's danger term) was
    // really asking a bigger question than "how cruel is she": whether
    // she's willing to take a forceful/aggressive/decisive action at all.
    // That's better modeled as a DERIVED read, exactly like
    // getEffectiveAssertiveness() above, not a fifth independent trait to
    // separately drift - it composes out of traits that already exist and
    // already drift on their own:
    //
    //     - is this socially acceptable, or does it damage how others see
    //       her? -> sociability (how much she cares about that cost at
    //       all - high sociability makes a forceful action cost more)
    //     - what's the risk to herself? -> caution (high caution makes
    //       personal risk weigh more heavily)
    //     - can she actually pull this off? -> confidence (self-efficacy;
    //       a courageous but genuinely unconfident person still hesitates
    //       somewhat, so this scales rather than gates)
    //     - if the above come back affirmative (acceptable cost, tolerable
    //       risk, believes she can do it) - does she have the courage to
    //       actually act on it? -> courage, applied as the final
    //       multiplier, since it's the trait that turns "this seems
    //       justified" into actually doing it.
    //
    // Because this reads live from Personality traits every time rather
    // than storing its own value, it drifts automatically as courage/
    // confidence/sociability/caution drift via ordinary
    // AIH.PersonalityDrift.reinforce() calls on THOSE traits - there is
    // no separate "decisiveness" reinforce target, and there should never
    // be one; a minigame reporting an outcome that this composite should
    // reflect picks whichever underlying trait the outcome actually was
    // about (courage if it was about facing danger head-on, confidence if
    // it was about self-belief, etc).
    //
    // Multiplicative, not additive - each factor can meaningfully
    // suppress the result toward 0 (a very cautious OR very sociable OR
    // very unconfident heroine should read as genuinely hesitant, not
    // just mildly discounted), while courage as the outermost multiplier
    // means a heroine with zero courage never reads as decisive
    // regardless of how favorable everything else looks.
    //
    // =========================================================================

    AIH.Personality.getDecisiveness = function() {

        var courage;
        var confidence;
        var sociability;
        var caution;
        var confidenceFactor;
        var socialFactor;
        var riskFactor;

        courage =
            AIH.Personality.getTrait("courage");

        if (courage === null) {
            return 0;
        }

        confidence =
            AIH.Personality.getTrait("confidence");

        if (confidence === null) {
            confidence = 0.5;
        }

        sociability =
            AIH.Personality.getTrait("sociability");

        if (sociability === null) {
            sociability = 0.5;
        }

        caution =
            AIH.Personality.getTrait("caution");

        if (caution === null) {
            caution = 0.5;
        }

        confidenceFactor =
            0.3 +
            (confidence * 0.7);

        socialFactor =
            1 -
            (sociability * 0.4);

        riskFactor =
            1 -
            (caution * 0.4);

        return AIH.Personality._clamp01(
            courage *
            confidenceFactor *
            socialFactor *
            riskFactor
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
            },

            getEffectiveAssertiveness: function() {
                return AIH.Personality.getEffectiveAssertiveness();
            },

            getDecisiveness: function() {
                return AIH.Personality.getDecisiveness();
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