/*:
 * @plugindesc AI Hero Framework - Social Decision / Response Evaluator v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL DECISION / RESPONSE EVALUATOR
 * ============================================================================
 *
 * STEP 19
 *
 * Evaluates available responses to a social interaction.
 *
 * This system sits ABOVE:
 *
 *     SocialInteraction
 *     SocialInterpretation
 *     SocialResponse
 *
 * and BELOW future:
 *
 *     Goal / Motivation
 *     Action Selection
 *     Action Execution
 *
 * ============================================================================
 *
 * IMPORTANT ARCHITECTURAL RULE
 *
 * This module does NOT:
 *
 * - execute actions
 * - attack NPCs
 * - change RPG Maker combat
 * - modify reputation
 * - modify personality
 * - modify values
 * - modify emotions
 * - create memories
 * - update beliefs
 * - update hypotheses
 * - generate dialogue
 * - call an LLM
 *
 * It only evaluates candidate responses.
 *
 * ============================================================================
 *
 * CORE DISTINCTION
 *
 * The evaluator separates:
 *
 *     PERSONAL PREFERENCE
 *
 * from:
 *
 *     STRATEGIC ACCEPTABILITY
 *
 * Therefore:
 *
 *     acceptReluctantly
 *
 * is not equivalent to:
 *
 *     acceptPositively
 *
 * A heroine may strongly dislike an interaction while nevertheless judging
 * acceptance to be strategically preferable.
 *
 * ============================================================================
 *
 * RESPONSE OPTIONS
 *
 *     walkAway
 *     confront
 *     accept
 *     acceptReluctantly
 *     acceptPositively
 *
 * These are candidate response types.
 *
 * They are NOT executed by this module.
 *
 * ============================================================================
 *
 * OUTPUT
 *
 * evaluate() returns:
 *
 *     {
 *         candidates: [...],
 *         topCandidate: {...},
 *         context: {...}
 *     }
 *
 * Every candidate contains:
 *
 *     action
 *     score
 *     rawScore
 *     reasons
 *     factors
 *
 * The score is deterministic and normalized to 0..1.
 *
 * ============================================================================
 *
 * DESIGN PHILOSOPHY
 *
 * The evaluator does NOT use simplistic rules such as:
 *
 *     insult -> attack
 *
 * or:
 *
 *     dominance > 50 -> attack
 *
 * Instead it combines:
 *
 *     personality
 *     values
 *     emotions
 *     subjective interpretation
 *     faction context
 *     reputation
 *     expected consequences
 *     beliefs / learned knowledge
 *     current goals
 *     interaction severity
 *
 * The same heroine can therefore make different decisions in different
 * situations.
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
        "0.1.0";

    AIH.SocialDecision.SCHEMA_VERSION =
        1;

    AIH.SocialDecision._initialized =
        false;

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    AIH.SocialDecision.OPTIONS = [
        "walkAway",
        "confront",
        "accept",
        "acceptReluctantly",
        "acceptPositively"
    ];

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
    // CLAMP -1 TO +1
    // =========================================================================

    AIH.SocialDecision._clampSigned =
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
    // SAFE NUMBER
    // =========================================================================

    AIH.SocialDecision._number =
        function(value, fallback) {

            var result;

            result =
                Number(value);

            if (isNaN(result)) {
                return fallback;
            }

            return result;
        };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialDecision.initialize =
        function() {

            AIH.SocialDecision._initialized =
                true;

            AIH.Debug.log(
                "Social decision system initialized."
            );
        };

    // =========================================================================
    // GET PERSONALITY
    // =========================================================================

    AIH.SocialDecision._getPersonality =
        function() {

            var result;

            if (
                typeof AIH.Personality ===
                "undefined"
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

    AIH.SocialDecision._personality =
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
                personality[key] !==
                undefined
            ) {

                value =
                    AIH.SocialDecision._number(
                        personality[key],
                        fallback
                    );

                return AIH.SocialDecision._clamp01(
                    value
                );
            }

            if (
                personality.traits &&
                personality.traits[key] !==
                    undefined
            ) {

                value =
                    AIH.SocialDecision._number(
                        personality.traits[key],
                        fallback
                    );

                return AIH.SocialDecision._clamp01(
                    value
                );
            }

            if (
                AIH.Personality &&
                typeof AIH.Personality.getValue ===
                    "function"
            ) {

                value =
                    AIH.Personality.getValue(
                        key
                    );

                return AIH.SocialDecision._clamp01(
                    value
                );
            }

            return fallback;
        };

    // =========================================================================
    // GET EMOTION
    // =========================================================================

    AIH.SocialDecision._emotion =
        function(key) {

            var value;

            if (
                typeof AIH.Emotions ===
                "undefined"
            ) {

                return 0.5;
            }

            if (
                typeof AIH.Emotions.getValue ===
                "function"
            ) {

                value =
                    AIH.Emotions.getValue(
                        key
                    );

                return AIH.SocialDecision._clamp01(
                    value
                );
            }

            if (
                typeof AIH.Emotions.get ===
                "function"
            ) {

                var emotions =
                    AIH.Emotions.get();

                if (
                    emotions &&
                    emotions[key] !==
                        undefined
                ) {

                    return AIH.SocialDecision._clamp01(
                        emotions[key]
                    );
                }
            }

            return 0.5;
        };

    // =========================================================================
    // GET VALUE
    // =========================================================================

    AIH.SocialDecision._value =
        function(key) {

            var value;

            if (
                typeof AIH.Values ===
                "undefined"
            ) {

                return 0.5;
            }

            if (
                typeof AIH.Values.getValue ===
                "function"
            ) {

                value =
                    AIH.Values.getValue(
                        key
                    );

                return AIH.SocialDecision._clamp01(
                    value
                );
            }

            if (
                typeof AIH.Values.get ===
                "function"
            ) {

                var values =
                    AIH.Values.get();

                if (
                    values &&
                    values[key] !==
                        undefined
                ) {

                    return AIH.SocialDecision._clamp01(
                        values[key]
                    );
                }
            }

            return 0.5;
        };

    // =========================================================================
    // GET REPUTATION AXIS
    // =========================================================================

    AIH.SocialDecision._reputation =
        function(
            faction,
            axis
        ) {

            var value;

            if (
                !AIH.Reputation ||
                typeof AIH.Reputation.getAxis !==
                    "function"
            ) {

                return 0;
            }

            value =
                AIH.Reputation.getAxis(
                    faction,
                    axis
                );

            return AIH.SocialDecision._number(
                value,
                0
            );
        };

    // =========================================================================
    // NORMALIZE REPUTATION
    // =========================================================================

    AIH.SocialDecision._normalizeReputation =
        function(value) {

            value =
                AIH.SocialDecision._number(
                    value,
                    0
                );

            if (value < -100) {
                value = -100;
            }

            if (value > 100) {
                value = 100;
            }

            return (
                value + 100
            ) / 200;
        };

    // =========================================================================
    // GET SOCIAL CONTEXT
    // =========================================================================

    AIH.SocialDecision._getSocialContext =
        function(faction) {

            if (
                !AIH.Social ||
                typeof AIH.Social.getContext !==
                    "function"
            ) {

                return null;
            }

            return AIH.Social.getContext(
                faction
            );
        };

    // =========================================================================
    // GET BELIEF EVIDENCE
    // =========================================================================
    //
    // Beliefs are deliberately treated as evidence rather than truth.
    //
    // The evaluator supports several possible future/current APIs without
    // requiring the belief system to expose one exact implementation.
    //
    // =========================================================================

    AIH.SocialDecision._getBeliefEvidence =
        function(
            data,
            faction
        ) {

            var evidence;
            var beliefs;
            var i;
            var belief;
            var proposition;
            var confidence;
            var category;

            evidence = {

                consequenceKnowledge:
                    0,

                dangerKnowledge:
                    0,

                socialKnowledge:
                    0,

                matchingBeliefs:
                    [],

                count:
                    0
            };

            if (
                data &&
                data.beliefEvidence
            ) {

                if (
                    data.beliefEvidence.consequenceKnowledge !==
                        undefined
                ) {

                    evidence.consequenceKnowledge =
                        AIH.SocialDecision._clamp01(
                            data.beliefEvidence.consequenceKnowledge
                        );
                }

                if (
                    data.beliefEvidence.dangerKnowledge !==
                        undefined
                ) {

                    evidence.dangerKnowledge =
                        AIH.SocialDecision._clamp01(
                            data.beliefEvidence.dangerKnowledge
                        );
                }

                if (
                    data.beliefEvidence.socialKnowledge !==
                        undefined
                ) {

                    evidence.socialKnowledge =
                        AIH.SocialDecision._clamp01(
                            data.beliefEvidence.socialKnowledge
                        );
                }

                if (
                    data.beliefEvidence.matchingBeliefs
                ) {

                    evidence.matchingBeliefs =
                        AIH.SocialDecision._copy(
                            data.beliefEvidence.matchingBeliefs
                        );
                }

                return evidence;
            }

            if (
                typeof AIH.Beliefs ===
                "undefined"
            ) {

                return evidence;
            }

            if (
                typeof AIH.Beliefs.all !==
                    "function"
            ) {

                return evidence;
            }

            beliefs =
                AIH.Beliefs.all();

            if (
                !Array.isArray(beliefs)
            ) {

                return evidence;
            }

            for (
                i = 0;
                i < beliefs.length;
                i++
            ) {

                belief =
                    beliefs[i];

                if (!belief) {
                    continue;
                }

                proposition =
                    String(
                        belief.proposition ||
                        ""
                    ).toLowerCase();

                category =
                    String(
                        belief.category ||
                        ""
                    ).toLowerCase();

                confidence =
                    AIH.SocialDecision._clamp01(
                        belief.confidence
                    );

                if (
                    proposition.indexOf(
                        String(faction).toLowerCase()
                    ) >= 0
                ) {

                    evidence.matchingBeliefs.push({

                        id:
                            belief.id !== undefined
                                ? belief.id
                                : null,

                        proposition:
                            belief.proposition || "",

                        confidence:
                            confidence
                    });

                    evidence.count++;

                    evidence.socialKnowledge =
                        Math.max(
                            evidence.socialKnowledge,
                            confidence
                        );
                }

                if (
                    category.indexOf("danger") >= 0 ||
                    category.indexOf("consequence") >= 0
                ) {

                    evidence.consequenceKnowledge =
                        Math.max(
                            evidence.consequenceKnowledge,
                            confidence
                        );
                }
            }

            /*
             * Beliefs are not facts.
             *
             * Their confidence therefore increases the evaluator's estimate
             * of how strongly the heroine expects a consequence, but never
             * guarantees that the consequence will occur.
             */

            return evidence;
        };

    // =========================================================================
    // GET GOAL CONTEXT
    // =========================================================================
    //
    // Goals are not yet required for this evaluator to function.
    //
    // If a future Goals system exists, this method can consume a generic
    // context without coupling this plugin to a specific implementation.
    //
    // =========================================================================

    AIH.SocialDecision._getGoalContext =
        function(data) {

            var result;

            result = {

                relevance:
                    0.5,

                priorities:
                    {},

                activeGoal:
                    null,

                reasons:
                    []
            };

            if (
                data &&
                data.goalContext
            ) {

                if (
                    data.goalContext.relevance !==
                        undefined
                ) {

                    result.relevance =
                        AIH.SocialDecision._clamp01(
                            data.goalContext.relevance
                        );
                }

                if (
                    data.goalContext.priorities
                ) {

                    result.priorities =
                        AIH.SocialDecision._copy(
                            data.goalContext.priorities
                        );
                }

                if (
                    data.goalContext.activeGoal !==
                        undefined
                ) {

                    result.activeGoal =
                        AIH.SocialDecision._copy(
                            data.goalContext.activeGoal
                        );
                }

                if (
                    Array.isArray(
                        data.goalContext.reasons
                    )
                ) {

                    result.reasons =
                        data.goalContext.reasons.slice();
                }

                return result;
            }

            /*
             * Future Goals implementation.
             *
             * This is intentionally defensive. No assumption is made about
             * the eventual Goals API.
             */

            if (
                typeof AIH.Goals !==
                    "undefined"
            ) {

                if (
                    typeof AIH.Goals.getDecisionContext ===
                        "function"
                ) {

                    result =
                        AIH.Goals.getDecisionContext();

                    if (result) {
                        return result;
                    }
                }

                if (
                    typeof AIH.Goals.getActive ===
                        "function"
                ) {

                    result.activeGoal =
                        AIH.Goals.getActive();

                    if (result.activeGoal) {
                        result.relevance =
                            0.75;
                    }
                }
            }

            return result;
        };

    // =========================================================================
    // GET CONSEQUENCE CONTEXT
    // =========================================================================
    //
    // Consequences are expected to become a dedicated world/consequence
    // system later.
    //
    // For now this method accepts explicit consequence estimates and provides
    // conservative faction-level baseline knowledge for major social groups.
    //
    // This is BASELINE WORLD KNOWLEDGE, not a rule saying that an option is
    // forbidden.
    //
    // =========================================================================

    AIH.SocialDecision._getConsequenceContext =
        function(
            data,
            faction
        ) {

            var result;
            var profile;
            var explicit;

            result = {

                severity:
                    0,

                socialImpact:
                    0,

                authorityRisk:
                    0,

                economicRisk:
                    0,

                accessRisk:
                    0,

                violenceRisk:
                    0,

                knowledgeConfidence:
                    0.5,

                source:
                    "baseline",

                reasons:
                    []
            };

            /*
             * Explicit context supplied by a future consequence system takes
             * precedence over the baseline.
             */

            explicit =
                data &&
                data.consequenceContext
                    ? data.consequenceContext
                    : null;

            if (explicit) {

                if (
                    explicit.severity !==
                        undefined
                ) {

                    result.severity =
                        AIH.SocialDecision._clamp01(
                            explicit.severity
                        );
                }

                if (
                    explicit.socialImpact !==
                        undefined
                ) {

                    result.socialImpact =
                        AIH.SocialDecision._clamp01(
                            explicit.socialImpact
                        );
                }

                if (
                    explicit.authorityRisk !==
                        undefined
                ) {

                    result.authorityRisk =
                        AIH.SocialDecision._clamp01(
                            explicit.authorityRisk
                        );
                }

                if (
                    explicit.economicRisk !==
                        undefined
                ) {

                    result.economicRisk =
                        AIH.SocialDecision._clamp01(
                            explicit.economicRisk
                        );
                }

                if (
                    explicit.accessRisk !==
                        undefined
                ) {

                    result.accessRisk =
                        AIH.SocialDecision._clamp01(
                            explicit.accessRisk
                        );
                }

                if (
                    explicit.violenceRisk !==
                        undefined
                ) {

                    result.violenceRisk =
                        AIH.SocialDecision._clamp01(
                            explicit.violenceRisk
                        );
                }

                if (
                    explicit.knowledgeConfidence !==
                        undefined
                ) {

                    result.knowledgeConfidence =
                        AIH.SocialDecision._clamp01(
                            explicit.knowledgeConfidence
                        );
                }

                result.source =
                    "provided";

                if (
                    Array.isArray(
                        explicit.reasons
                    )
                ) {

                    result.reasons =
                        explicit.reasons.slice();
                }

                return result;
            }

            profile =
                AIH.SocialDecision._getBaselineConsequenceProfile(
                    faction
                );

            if (profile) {

                result =
                    AIH.SocialDecision._copy(
                        profile
                    );

                result.source =
                    "baseline";

                return result;
            }

            return result;
        };

    // =========================================================================
    // BASELINE CONSEQUENCE PROFILES
    // =========================================================================
    //
    // These describe expected SOCIAL CONSEQUENCE PRESSURE.
    //
    // They do not prohibit any response.
    //
    // Values can be replaced later by a dedicated world consequence system.
    //
    // =========================================================================

    AIH.SocialDecision._getBaselineConsequenceProfile =
        function(faction) {

            var key;

            key =
                String(
                    faction || ""
                ).toLowerCase();

            /*
             * The baseline is deliberately broad.
             *
             * It represents common world knowledge:
             *
             *     attacking a noble is usually more consequential than
             *     confronting an ordinary street criminal.
             */

            var profiles = {

                "nobles": {

                    severity:
                        0.95,

                    socialImpact:
                        0.90,

                    authorityRisk:
                        0.95,

                    economicRisk:
                        0.75,

                    accessRisk:
                        0.80,

                    violenceRisk:
                        0.55,

                    knowledgeConfidence:
                        0.90,

                    reasons: [
                        "Noble conflicts can attract institutional and social consequences."
                    ]
                },

                "church": {

                    severity:
                        0.90,

                    socialImpact:
                        0.80,

                    authorityRisk:
                        0.80,

                    economicRisk:
                        0.35,

                    accessRisk:
                        0.70,

                    violenceRisk:
                        0.50,

                    knowledgeConfidence:
                        0.85,

                    reasons: [
                        "Conflict with church personnel can carry significant institutional consequences."
                    ]
                },

                "adventurer guild": {

                    severity:
                        0.65,

                    socialImpact:
                        0.70,

                    authorityRisk:
                        0.55,

                    economicRisk:
                        0.50,

                    accessRisk:
                        0.75,

                    violenceRisk:
                        0.40,

                    knowledgeConfidence:
                        0.85,

                    reasons: [
                        "Guild conflict can damage professional standing and access."
                    ]
                },

                "adventurers": {

                    severity:
                        0.30,

                    socialImpact:
                        0.45,

                    authorityRisk:
                        0.20,

                    economicRisk:
                        0.15,

                    accessRisk:
                        0.20,

                    violenceRisk:
                        0.35,

                    knowledgeConfidence:
                        0.75,

                    reasons: [
                        "Conflict with fellow adventurers primarily affects peer relationships and reputation."
                    ]
                },

                "merchants": {

                    severity:
                        0.55,

                    socialImpact:
                        0.65,

                    authorityRisk:
                        0.25,

                    economicRisk:
                        0.85,

                    accessRisk:
                        0.80,

                    violenceRisk:
                        0.25,

                    knowledgeConfidence:
                        0.85,

                    reasons: [
                        "Conflict with merchants can damage commercial access and prices."
                    ]
                },

                "street": {

                    severity:
                        0.20,

                    socialImpact:
                        0.30,

                    authorityRisk:
                        0.15,

                    economicRisk:
                        0.10,

                    accessRisk:
                        0.10,

                    violenceRisk:
                        0.45,

                    knowledgeConfidence:
                        0.70,

                    reasons: [
                        "Street conflicts usually have fewer broad institutional consequences."
                    ]
                },

                "tavern": {

                    severity:
                        0.25,

                    socialImpact:
                        0.35,

                    authorityRisk:
                        0.15,

                    economicRisk:
                        0.20,

                    accessRisk:
                        0.25,

                    violenceRisk:
                        0.40,

                    knowledgeConfidence:
                        0.65,

                    reasons: [
                        "Tavern conflicts can affect local social relationships and access."
                    ]
                },

                "gentlemens club": {

                    severity:
                        0.55,

                    socialImpact:
                        0.65,

                    authorityRisk:
                        0.25,

                    economicRisk:
                        0.35,

                    accessRisk:
                        0.60,

                    violenceRisk:
                        0.25,

                    knowledgeConfidence:
                        0.70,

                    reasons: [
                        "Conflict can affect access and reputation within the social group."
                    ]
                },

                "warriors": {

                    severity:
                        0.30,

                    socialImpact:
                        0.45,

                    authorityRisk:
                        0.15,

                    economicRisk:
                        0.10,

                    accessRisk:
                        0.20,

                    violenceRisk:
                        0.65,

                    knowledgeConfidence:
                        0.70,

                    reasons: [
                        "Warrior groups may respond strongly to direct confrontation."
                    ]
                },

                "mages": {

                    severity:
                        0.45,

                    socialImpact:
                        0.50,

                    authorityRisk:
                        0.25,

                    economicRisk:
                        0.20,

                    accessRisk:
                        0.40,

                    violenceRisk:
                        0.55,

                    knowledgeConfidence:
                        0.65,

                    reasons: [
                        "Conflict with powerful specialists can carry uncertain consequences."
                    ]
                },

                "farm": {

                    severity:
                        0.20,

                    socialImpact:
                        0.35,

                    authorityRisk:
                        0.10,

                    economicRisk:
                        0.20,

                    accessRisk:
                        0.15,

                    violenceRisk:
                        0.25,

                    knowledgeConfidence:
                        0.65,

                    reasons: [
                        "Conflict with ordinary rural communities generally has limited institutional reach."
                    ]
                },

                "orc": {

                    severity:
                        0.30,

                    socialImpact:
                        0.40,

                    authorityRisk:
                        0.10,

                    economicRisk:
                        0.10,

                    accessRisk:
                        0.20,

                    violenceRisk:
                        0.70,

                    knowledgeConfidence:
                        0.55,

                    reasons: [
                        "Conflict may escalate physically even when institutional consequences are limited."
                    ]
                },

                "goblins": {

                    severity:
                        0.20,

                    socialImpact:
                        0.30,

                    authorityRisk:
                        0.05,

                    economicRisk:
                        0.05,

                    accessRisk:
                        0.15,

                    violenceRisk:
                        0.65,

                    knowledgeConfidence:
                        0.55,

                    reasons: [
                        "Conflict may produce immediate physical escalation."
                    ]
                },

                "elfs": {

                    severity:
                        0.35,

                    socialImpact:
                        0.55,

                    authorityRisk:
                        0.15,

                    economicRisk:
                        0.15,

                    accessRisk:
                        0.35,

                    violenceRisk:
                        0.45,

                    knowledgeConfidence:
                        0.55,

                    reasons: [
                        "Social consequences may persist within the community."
                    ]
                },

                "dwarfs": {

                    severity:
                        0.35,

                    socialImpact:
                        0.45,

                    authorityRisk:
                        0.15,

                    economicRisk:
                        0.35,

                    accessRisk:
                        0.35,

                    violenceRisk:
                        0.50,

                    knowledgeConfidence:
                        0.55,

                    reasons: [
                        "Conflict can affect social and commercial relationships."
                    ]
                },

                "slimes": {

                    severity:
                        0.10,

                    socialImpact:
                        0.10,

                    authorityRisk:
                        0.05,

                    economicRisk:
                        0.05,

                    accessRisk:
                        0.05,

                    violenceRisk:
                        0.30,

                    knowledgeConfidence:
                        0.45,

                    reasons: [
                        "Baseline social consequences are currently assumed to be limited."
                    ]
                },

                "minotaurs": {

                    severity:
                        0.30,

                    socialImpact:
                        0.40,

                    authorityRisk:
                        0.10,

                    economicRisk:
                        0.10,

                    accessRisk:
                        0.20,

                    violenceRisk:
                        0.65,

                    knowledgeConfidence:
                        0.50,

                    reasons: [
                        "Physical escalation may be significant."
                    ]
                }
            };

            if (
                profiles[key]
            ) {

                return profiles[key];
            }

            return null;
        };

    // =========================================================================
    // GET HEROINE STATE
    // =========================================================================

    AIH.SocialDecision._getHeroineState =
        function() {

            var personality;

            personality =
                AIH.SocialDecision._getPersonality();

            return {

                personality: {

                    courage:
                        AIH.SocialDecision._personality(
                            personality,
                            "courage",
                            0.5
                        ),

                    caution:
                        AIH.SocialDecision._personality(
                            personality,
                            "caution",
                            0.5
                        ),

                    curiosity:
                        AIH.SocialDecision._personality(
                            personality,
                            "curiosity",
                            0.5
                        ),

                    greed:
                        AIH.SocialDecision._personality(
                            personality,
                            "greed",
                            0.5
                        ),

                    pride:
                        AIH.SocialDecision._personality(
                            personality,
                            "pride",
                            0.5
                        ),

                    riskTolerance:
                        AIH.SocialDecision._personality(
                            personality,
                            "riskTolerance",
                            0.5
                        ),

                    sociability:
                        AIH.SocialDecision._personality(
                            personality,
                            "sociability",
                            0.5
                        ),

                    confidence:
                        AIH.SocialDecision._personality(
                            personality,
                            "confidence",
                            0.5
                        ),

                    independence:
                        AIH.SocialDecision._personality(
                            personality,
                            "independence",
                            0.5
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
                },

                values: {

                    pride:
                        AIH.SocialDecision._value(
                            "pride"
                        ),

                    independence:
                        AIH.SocialDecision._value(
                            "independence"
                        ),

                    safety:
                        AIH.SocialDecision._value(
                            "safety"
                        ),

                    sociability:
                        AIH.SocialDecision._value(
                            "sociability"
                        )
                }
            };
        };

    // =========================================================================
    // GET INTERPRETED INTERACTION
    // =========================================================================

    AIH.SocialDecision._interpret =
        function(data) {

            var result;

            if (
                !AIH.SocialInterpretation ||
                typeof AIH.SocialInterpretation.interpret !==
                    "function"
            ) {

                return null;
            }

            result =
                AIH.SocialInterpretation.interpret(
                    data
                );

            return result;
        };

    // =========================================================================
    // BUILD ASSESSMENT INPUT
    // =========================================================================
    //
    // SocialInteraction.create() accepts flattened perceived fields while
    // SocialInterpretation returns a nested interpretation object.
    //
    // This method bridges the two APIs without modifying either existing
    // plugin.
    //
    // =========================================================================

    AIH.SocialDecision._buildAssessmentInput =
        function(
            data,
            interpretationResult
        ) {

            var result;
            var interpretation;

            result =
                AIH.SocialDecision._copy(
                    data || {}
                );

            if (!interpretationResult) {
                return result;
            }

            interpretation =
                interpretationResult.interpretation ||
                {};

            result.perceivedDemeaning =
                interpretation.demeaning === true;

            result.perceivedThreat =
                interpretation.threatening === true;

            result.perceivedFlattering =
                interpretation.flattering === true;

            result.perceivedRespectful =
                interpretation.respectful === true;

            result.perceivedHumiliating =
                interpretation.humiliating === true;

            result.perceivedSexualized =
                interpretation.sexualized === true;

            result.perceivedPatronizing =
                interpretation.patronizing === true;

            result.perceivedControlling =
                interpretation.controlling === true;

            result.perceivedDisrespectful =
                interpretation.disrespectful === true;

            result.interpretationConfidence =
                interpretationResult.interpretationConfidence;

            result.severity =
                interpretationResult.subjectiveSeverity;

            return result;
        };

    // =========================================================================
    // CALCULATE PERSONAL PREFERENCE
    // =========================================================================
    //
    // Returns a 0..1 value describing how personally acceptable an interaction
    // is to the heroine.
    //
    // This is NOT strategic utility.
    //
    // =========================================================================

    AIH.SocialDecision._personalAcceptance =
        function(
            interaction,
            state
        ) {

            var dislike;
            var comfort;
            var embarrassment;
            var pride;
            var independence;
            var respect;
            var result;

            dislike = 0;

            if (
                interaction.interpretation.demeaning
            ) {

                dislike += 0.30;
            }

            if (
                interaction.interpretation.disrespectful
            ) {

                dislike += 0.25;
            }

            if (
                interaction.interpretation.humiliating
            ) {

                dislike += 0.35;
            }

            if (
                interaction.interpretation.controlling
            ) {

                dislike += 0.20;
            }

            if (
                interaction.interpretation.threatening
            ) {

                dislike += 0.15;
            }

            embarrassment =
                state.emotions.embarrassment;

            pride =
                state.personality.pride;

            independence =
                state.personality.independence;

            comfort =
                state.emotions.comfort;

            respect =
                interaction.interpretation.respectful
                    ? 0.25
                    : 0;

            /*
             * High pride and independence make demeaning/control-oriented
             * treatment less personally acceptable.
             */

            dislike +=
                pride *
                0.20;

            dislike +=
                independence *
                0.15;

            dislike +=
                embarrassment *
                0.10;

            /*
             * Comfort matters only as an emotional state here. It does not
             * represent wealth or luxury.
             */

            result =
                0.50 -
                dislike +
                respect +
                (
                    comfort *
                    0.05
                );

            return AIH.SocialDecision._clamp01(
                result
            );
        };

    // =========================================================================
    // CALCULATE CONFRONTATION PREFERENCE
    // =========================================================================
    //
    // This measures psychological suitability for confrontation.
    //
    // It does NOT consider whether confrontation is strategically wise.
    //
    // =========================================================================

    AIH.SocialDecision._confrontationPreference =
        function(
            assessment,
            state
        ) {

            var severity;
            var pride;
            var courage;
            var confidence;
            var riskTolerance;
            var independence;
            var anger;
            var frustration;
            var fear;
            var stress;
            var result;

            severity =
                assessment.reactionContext.subjectiveSeverity;

            pride =
                state.personality.pride;

            courage =
                state.personality.courage;

            confidence =
                state.emotions.confidence;

            riskTolerance =
                state.personality.riskTolerance;

            independence =
                state.personality.independence;

            anger =
                state.emotions.anger;

            frustration =
                state.emotions.frustration;

            fear =
                state.emotions.fear;

            stress =
                state.emotions.stress;

            result =
                (
                    severity *
                    0.25
                ) +
                (
                    pride *
                    0.20
                ) +
                (
                    courage *
                    0.15
                ) +
                (
                    confidence *
                    0.15
                ) +
                (
                    riskTolerance *
                    0.10
                ) +
                (
                    independence *
                    0.10
                ) +
                (
                    anger *
                    0.05
                ) +
                (
                    frustration *
                    0.05
                ) -
                (
                    fear *
                    0.15
                ) -
                (
                    stress *
                    0.05
                );

            return AIH.SocialDecision._clamp01(
                result
            );
        };

    // =========================================================================
    // CALCULATE WALK-AWAY PREFERENCE
    // =========================================================================

    AIH.SocialDecision._walkAwayPreference =
        function(
            assessment,
            state,
            consequences
        ) {

            var severity;
            var caution;
            var fear;
            var stress;
            var sociability;
            var confidence;
            var result;

            severity =
                assessment.reactionContext.subjectiveSeverity;

            caution =
                state.personality.caution;

            fear =
                state.emotions.fear;

            stress =
                state.emotions.stress;

            sociability =
                state.personality.sociability;

            confidence =
                state.emotions.confidence;

            result =
                0.25 +
                (
                    caution *
                    0.20
                ) +
                (
                    fear *
                    0.20
                ) +
                (
                    stress *
                    0.10
                ) +
                (
                    consequences.severity *
                    0.25
                ) +
                (
                    consequences.authorityRisk *
                    0.10
                ) +
                (
                    consequences.accessRisk *
                    0.10
                ) -
                (
                    severity *
                    0.10
                ) -
                (
                    confidence *
                    0.05
                );

            /*
             * Sociability slightly reduces the attractiveness of simply
             * leaving a social interaction unresolved.
             */

            result -=
                sociability *
                0.05;

            return AIH.SocialDecision._clamp01(
                result
            );
        };

    // =========================================================================
    // CALCULATE ACCEPTANCE PREFERENCE
    // =========================================================================
    //
    // This is acceptance as a response to the situation.
    //
    // It does not automatically mean she likes the treatment.
    //
    // =========================================================================

    AIH.SocialDecision._acceptancePreference =
        function(
            assessment,
            state,
            consequences
        ) {

            var personalAcceptance;
            var strategicPressure;
            var caution;
            var fear;
            var confidence;
            var pride;
            var independence;
            var result;

            personalAcceptance =
                AIH.SocialDecision._personalAcceptance(
                    assessment.interaction,
                    state
                );

            strategicPressure =
                (
                    consequences.severity *
                    0.30
                ) +
                (
                    consequences.authorityRisk *
                    0.25
                ) +
                (
                    consequences.economicRisk *
                    0.10
                ) +
                (
                    consequences.accessRisk *
                    0.15
                ) +
                (
                    consequences.socialImpact *
                    0.10
                );

            caution =
                state.personality.caution;

            fear =
                state.emotions.fear;

            confidence =
                state.emotions.confidence;

            pride =
                state.personality.pride;

            independence =
                state.personality.independence;

            result =
                (
                    personalAcceptance *
                    0.35
                ) +
                (
                    strategicPressure *
                    0.35
                ) +
                (
                    caution *
                    0.10
                ) +
                (
                    fear *
                    0.10
                ) -
                (
                    confidence *
                    0.05
                ) -
                (
                    pride *
                    0.05
                ) -
                (
                    independence *
                    0.05
                );

            return AIH.SocialDecision._clamp01(
                result
            );
        };

    // =========================================================================
    // STRATEGIC CONSEQUENCE COST
    // =========================================================================

    AIH.SocialDecision._consequenceCost =
        function(
            action,
            consequences
        ) {

            var cost;

            cost =
                0;

            if (
                action ===
                "confront"
            ) {

                cost =
                    (
                        consequences.severity *
                        0.30
                    ) +
                    (
                        consequences.socialImpact *
                        0.15
                    ) +
                    (
                        consequences.authorityRisk *
                        0.25
                    ) +
                    (
                        consequences.economicRisk *
                        0.10
                    ) +
                    (
                        consequences.accessRisk *
                        0.15
                    ) +
                    (
                        consequences.violenceRisk *
                        0.05
                    );
            }

            if (
                action ===
                "walkAway"
            ) {

                /*
                 * Walking away generally has lower direct consequence cost,
                 * but may have a small social cost if the situation strongly
                 * calls for engagement.
                 */

                cost =
                    (
                        consequences.socialImpact *
                        0.05
                    );
            }

            if (
                action ===
                "accept" ||
                action ===
                "acceptReluctantly" ||
                action ===
                "acceptPositively"
            ) {

                cost =
                    (
                        consequences.authorityRisk *
                        0.02
                    );
            }

            return AIH.SocialDecision._clamp01(
                cost
            );
        };

    // =========================================================================
    // VALUE ALIGNMENT
    // =========================================================================
    //
    // Values influence decisions without executing them.
    //
    // =========================================================================

    AIH.SocialDecision._valueAlignment =
        function(
            action,
            assessment,
            state
        ) {

            var independence;
            var safety;
            var sociability;
            var pride;
            var result;

            independence =
                state.values.independence;

            safety =
                state.values.safety;

            sociability =
                state.values.sociability;

            pride =
                state.values.pride;

            result =
                0.50;

            if (
                action ===
                "confront"
            ) {

                result =
                    (
                        independence *
                        0.35
                    ) +
                    (
                        pride *
                        0.35
                    ) +
                    (
                        (
                            1 -
                            safety
                        ) *
                        0.10
                    ) +
                    (
                        (
                            1 -
                            sociability
                        ) *
                        0.05
                    ) +
                    0.15;
            }

            if (
                action ===
                "walkAway"
            ) {

                result =
                    (
                        safety *
                        0.40
                    ) +
                    (
                        cautionFallback(state) *
                        0.20
                    ) +
                    (
                        (
                            1 -
                            pride
                        ) *
                        0.10
                    ) +
                    0.30;
            }

            if (
                action ===
                "accept" ||
                action ===
                "acceptReluctantly"
            ) {

                result =
                    (
                        safety *
                        0.35
                    ) +
                    (
                        sociability *
                        0.20
                    ) +
                    (
                        (
                            1 -
                            independence
                        ) *
                        0.10
                    ) +
                    0.35;
            }

            if (
                action ===
                "acceptPositively"
            ) {

                result =
                    (
                        sociability *
                        0.25
                    ) +
                    (
                        (
                            1 -
                            pride
                        ) *
                        0.15
                    ) +
                    0.60;
            }

            return AIH.SocialDecision._clamp01(
                result
            );
        };

    // =========================================================================
    // CAUTION FALLBACK
    // =========================================================================
    //
    // Kept as a local helper so the value-alignment calculation remains
    // defensive even if a future state object changes.
    //
    // =========================================================================

    function cautionFallback(state) {

        if (
            state &&
            state.personality &&
            state.personality.caution !==
                undefined
        ) {

            return AIH.SocialDecision._clamp01(
                state.personality.caution
            );
        }

        return 0.5;
    }

    // =========================================================================
    // GOAL ALIGNMENT
    // =========================================================================

    AIH.SocialDecision._goalAlignment =
        function(
            action,
            goalContext
        ) {

            var priorities;
            var value;

            if (!goalContext) {
                return 0.50;
            }

            priorities =
                goalContext.priorities ||
                {};

            if (
                priorities[action] !==
                    undefined
            ) {

                value =
                    AIH.SocialDecision._number(
                        priorities[action],
                        0.5
                    );

                /*
                 * Allow either 0..1 or -1..1 style inputs.
                 */

                if (
                    value < 0
                ) {

                    value =
                        (
                            value +
                            1
                        ) / 2;
                }

                return AIH.SocialDecision._clamp01(
                    value
                );
            }

            return AIH.SocialDecision._clamp01(
                goalContext.relevance
            );
        };

    // =========================================================================
    // LEARNED CONSEQUENCE ADJUSTMENT
    // =========================================================================
    //
    // Learned beliefs can strengthen expected consequences.
    //
    // They never become objective truth.
    //
    // =========================================================================

    AIH.SocialDecision._learnedConsequenceAdjustment =
        function(
            action,
            beliefEvidence,
            consequences
        ) {

            var knowledge;
            var adjustment;

            if (
                action !==
                "confront"
            ) {

                return 0;
            }

            knowledge =
                Math.max(
                    beliefEvidence.consequenceKnowledge,
                    beliefEvidence.socialKnowledge
                );

            adjustment =
                consequences.severity *
                knowledge *
                0.20;

            return AIH.SocialDecision._clamp01(
                adjustment
            );
        };

    // =========================================================================
    // BUILD CANDIDATE
    // =========================================================================

    AIH.SocialDecision._buildCandidate =
        function(
            action,
            assessment,
            state,
            consequences,
            beliefEvidence,
            goalContext
        ) {

            var severity;
            var personalAcceptance;
            var confrontation;
            var walkAway;
            var acceptance;
            var valueAlignment;
            var goalAlignment;
            var consequenceCost;
            var learnedAdjustment;
            var raw;
            var score;
            var reasons;
            var factors;

            severity =
                assessment.reactionContext.subjectiveSeverity;

            personalAcceptance =
                AIH.SocialDecision._personalAcceptance(
                    assessment.interaction,
                    state
                );

            confrontation =
                AIH.SocialDecision._confrontationPreference(
                    assessment,
                    state
                );

            walkAway =
                AIH.SocialDecision._walkAwayPreference(
                    assessment,
                    state,
                    consequences
                );

            acceptance =
                AIH.SocialDecision._acceptancePreference(
                    assessment,
                    state,
                    consequences
                );

            valueAlignment =
                AIH.SocialDecision._valueAlignment(
                    action,
                    assessment,
                    state
                );

            goalAlignment =
                AIH.SocialDecision._goalAlignment(
                    action,
                    goalContext
                );

            consequenceCost =
                AIH.SocialDecision._consequenceCost(
                    action,
                    consequences
                );

            learnedAdjustment =
                AIH.SocialDecision._learnedConsequenceAdjustment(
                    action,
                    beliefEvidence,
                    consequences
                );

            reasons = [];
            factors = {};

            // =================================================================
            // WALK AWAY
            // =================================================================

            if (
                action ===
                "walkAway"
            ) {

                raw =
                    (
                        walkAway *
                        0.35
                    ) +
                    (
                        (
                            1 -
                            severity
                        ) *
                        0.10
                    ) +
                    (
                        valueAlignment *
                        0.15
                    ) +
                    (
                        goalAlignment *
                        0.15
                    ) +
                    (
                        consequences.severity *
                        0.20
                    ) -
                    (
                        consequenceCost *
                        0.05
                    );

                if (
                    consequences.severity >=
                    0.70
                ) {

                    reasons.push(
                        "Walking away avoids a situation with substantial expected external consequences."
                    );
                }

                if (
                    state.personality.caution >=
                    0.60
                ) {

                    reasons.push(
                        "Caution increases the attractiveness of disengagement."
                    );
                }

                if (
                    state.emotions.fear >=
                    0.60
                ) {

                    reasons.push(
                        "Current fear increases the pressure to disengage."
                    );
                }

                if (
                    severity >=
                    0.60
                ) {

                    reasons.push(
                        "The interaction is sufficiently serious that leaving avoids escalation."
                    );
                }

                factors.personalPreference =
                    walkAway;
            }

            // =================================================================
            // CONFRONT
            // =================================================================

            if (
                action ===
                "confront"
            ) {

                raw =
                    (
                        confrontation *
                        0.35
                    ) +
                    (
                        severity *
                        0.15
                    ) +
                    (
                        valueAlignment *
                        0.15
                    ) +
                    (
                        goalAlignment *
                        0.10
                    ) -
                    (
                        consequenceCost *
                        0.20
                    ) -
                    (
                        learnedAdjustment *
                        0.10
                    );

                if (
                    assessment.reactionContext
                        .perceivedDemeaning ||
                    assessment.reactionContext
                        .perceivedDisrespect
                ) {

                    reasons.push(
                        "The heroine perceives the interaction as disrespectful or demeaning."
                    );
                }

                if (
                    state.personality.pride >=
                    0.75
                ) {

                    reasons.push(
                        "Very high pride increases resistance to status-lowering treatment."
                    );
                }

                if (
                    state.personality.courage >=
                    0.70
                ) {

                    reasons.push(
                        "High courage supports direct confrontation."
                    );
                }

                if (
                    state.emotions.confidence >=
                    0.70
                ) {

                    reasons.push(
                        "High current confidence supports assertive responses."
                    );
                }

                if (
                    consequences.severity >=
                    0.70
                ) {

                    reasons.push(
                        "Expected external consequences substantially reduce the attractiveness of confrontation."
                    );
                }

                if (
                    beliefEvidence.consequenceKnowledge >=
                    0.60
                ) {

                    reasons.push(
                        "Learned consequence knowledge increases caution about escalation."
                    );
                }

                factors.personalPreference =
                    confrontation;
            }

            // =================================================================
            // ACCEPT
            // =================================================================

            if (
                action ===
                "accept"
            ) {

                raw =
                    (
                        acceptance *
                        0.40
                    ) +
                    (
                        personalAcceptance *
                        0.20
                    ) +
                    (
                        valueAlignment *
                        0.15
                    ) +
                    (
                        goalAlignment *
                        0.10
                    ) +
                    (
                        consequences.severity *
                        0.15
                    );

                if (
                    personalAcceptance >=
                    0.65
                ) {

                    reasons.push(
                        "The heroine has relatively little internal resistance to accepting the treatment."
                    );
                }

                if (
                    consequences.severity >=
                    0.60
                ) {

                    reasons.push(
                        "Strategic pressure favors avoiding escalation."
                    );
                }

                factors.personalAcceptance =
                    personalAcceptance;
            }

            // =================================================================
            // ACCEPT RELUCTANTLY
            // =================================================================

            if (
                action ===
                "acceptReluctantly"
            ) {

                /*
                 * This is deliberately different from positive acceptance.
                 *
                 * It becomes attractive when:
                 *
                 *     personal acceptance is low
                 *
                 * but:
                 *
                 *     strategic pressure is high.
                 */

                raw =
                    (
                        (
                            1 -
                            personalAcceptance
                        ) *
                        0.20
                    ) +
                    (
                        acceptance *
                        0.25
                    ) +
                    (
                        consequences.severity *
                        0.30
                    ) +
                    (
                        consequences.authorityRisk *
                        0.10
                    ) +
                    (
                        consequences.accessRisk *
                        0.05
                    ) +
                    (
                        goalAlignment *
                        0.10
                    ) +
                    (
                        valueAlignment *
                        0.05
                    );

                if (
                    personalAcceptance <=
                    0.35
                ) {

                    reasons.push(
                        "The heroine personally dislikes the treatment, which makes this a reluctant rather than positive acceptance."
                    );
                }

                if (
                    consequences.severity >=
                    0.60
                ) {

                    reasons.push(
                        "High expected consequences make strategic restraint more attractive."
                    );
                }

                if (
                    consequences.authorityRisk >=
                    0.60
                ) {

                    reasons.push(
                        "Authority-related consequences increase the value of temporary compliance."
                    );
                }

                factors.personalAcceptance =
                    personalAcceptance;

                factors.strategicPressure =
                    acceptance;
            }

            // =================================================================
            // ACCEPT POSITIVELY
            // =================================================================

            if (
                action ===
                "acceptPositively"
            ) {

                /*
                 * Positive acceptance requires actual personal compatibility.
                 *
                 * Strategic pressure alone cannot manufacture genuine
                 * positive preference.
                 */

                raw =
                    (
                        personalAcceptance *
                        0.50
                    ) +
                    (
                        acceptance *
                        0.15
                    ) +
                    (
                        valueAlignment *
                        0.15
                    ) +
                    (
                        goalAlignment *
                        0.10
                    ) +
                    (
                        state.personality.sociability *
                        0.10
                    );

                if (
                    personalAcceptance >=
                    0.65
                ) {

                    reasons.push(
                        "The heroine's internal preference is compatible with accepting the treatment."
                    );
                }

                if (
                    state.personality.sociability >=
                    0.65
                ) {

                    reasons.push(
                        "Higher sociability makes positive social acceptance more natural."
                    );
                }

                if (
                    personalAcceptance <
                    0.35
                ) {

                    reasons.push(
                        "Low personal acceptance strongly limits genuine positive acceptance."
                    );
                }

                factors.personalAcceptance =
                    personalAcceptance;
            }

            // =================================================================
            // COMMON FACTORS
            // =================================================================

            factors.interactionSeverity =
                severity;

            factors.valueAlignment =
                valueAlignment;

            factors.goalAlignment =
                goalAlignment;

            factors.consequenceCost =
                consequenceCost;

            factors.learnedConsequenceAdjustment =
                learnedAdjustment;

            factors.expectedConsequence =
                consequences.severity;

            factors.authorityRisk =
                consequences.authorityRisk;

            factors.socialImpact =
                consequences.socialImpact;

            factors.interpretationConfidence =
                assessment.reactionContext
                    .interpretationConfidence;

            /*
             * Keep a small baseline so every candidate remains rankable.
             */

            raw =
                raw +
                0.05;

            score =
                AIH.SocialDecision._clamp01(
                    raw
                );

            return {

                action:
                    action,

                score:
                    score,

                rawScore:
                    raw,

                reasons:
                    reasons,

                factors:
                    factors
            };
        };

    // =========================================================================
    // SORT CANDIDATES
    // =========================================================================

    AIH.SocialDecision._sortCandidates =
        function(candidates) {

            candidates.sort(
                function(a, b) {

                    if (
                        b.score !==
                        a.score
                    ) {

                        return (
                            b.score -
                            a.score
                        );
                    }

                    return (
                        String(a.action)
                            .localeCompare(
                                String(b.action)
                            )
                    );
                }
            );

            return candidates;
        };

    // =========================================================================
    // EVALUATE
    // =========================================================================
    //
    // Main public API.
    //
    // =========================================================================

    AIH.SocialDecision.evaluate =
        function(data) {

            var interpretation;
            var assessmentInput;
            var assessment;
            var state;
            var faction;
            var social;
            var consequences;
            var beliefs;
            var goals;
            var candidates;
            var i;
            var candidate;

            data =
                data || {};

            /*
             * ---------------------------------------------------------------
             * INTERPRETATION
             * ---------------------------------------------------------------
             */

            interpretation =
                AIH.SocialDecision._interpret(
                    data
                );

            if (!interpretation) {
                return null;
            }

            /*
             * ---------------------------------------------------------------
             * BRIDGE INTERPRETATION -> INTERACTION
             * ---------------------------------------------------------------
             */

            assessmentInput =
                AIH.SocialDecision._buildAssessmentInput(
                    data,
                    interpretation
                );

            /*
             * ---------------------------------------------------------------
             * SOCIAL INTERACTION ASSESSMENT
             * ---------------------------------------------------------------
             */

            if (
                !AIH.SocialInteraction ||
                typeof AIH.SocialInteraction.assess !==
                    "function"
            ) {

                return null;
            }

            assessment =
                AIH.SocialInteraction.assess(
                    assessmentInput
                );

            if (!assessment) {
                return null;
            }

            faction =
                assessment.interaction.faction;

            /*
             * ---------------------------------------------------------------
             * HEROINE STATE
             * ---------------------------------------------------------------
             */

            state =
                AIH.SocialDecision._getHeroineState();

            /*
             * ---------------------------------------------------------------
             * CONTEXT
             * ---------------------------------------------------------------
             */

            social =
                AIH.SocialDecision._getSocialContext(
                    faction
                );

            consequences =
                AIH.SocialDecision._getConsequenceContext(
                    data,
                    faction
                );

            beliefs =
                AIH.SocialDecision._getBeliefEvidence(
                    data,
                    faction
                );

            goals =
                AIH.SocialDecision._getGoalContext(
                    data
                );

            /*
             * ---------------------------------------------------------------
             * CANDIDATES
             * ---------------------------------------------------------------
             */

            candidates = [];

            for (
                i = 0;
                i <
                AIH.SocialDecision.OPTIONS.length;
                i++
            ) {

                candidate =
                    AIH.SocialDecision._buildCandidate(
                        AIH.SocialDecision.OPTIONS[i],
                        assessment,
                        state,
                        consequences,
                        beliefs,
                        goals
                    );

                candidates.push(
                    candidate
                );
            }

            /*
             * ---------------------------------------------------------------
             * SORT
             * ---------------------------------------------------------------
             */

            AIH.SocialDecision._sortCandidates(
                candidates
            );

            return {

                schemaVersion:
                    AIH.SocialDecision.SCHEMA_VERSION,

                faction:
                    faction,

                interaction:
                    AIH.SocialDecision._copy(
                        assessment.interaction
                    ),

                interpretation:
                    AIH.SocialDecision._copy(
                        interpretation
                    ),

                socialContext:
                    AIH.SocialDecision._copy(
                        social
                    ),

                heroineState:
                    AIH.SocialDecision._copy(
                        state
                    ),

                consequenceContext:
                    AIH.SocialDecision._copy(
                        consequences
                    ),

                beliefEvidence:
                    AIH.SocialDecision._copy(
                        beliefs
                    ),

                goalContext:
                    AIH.SocialDecision._copy(
                        goals
                    ),

                candidates:
                    candidates,

                /*
                 * This is intentionally descriptive.
                 *
                 * It is the highest-ranked candidate, NOT an executed or
                 * committed decision.
                 */

                topCandidate:
                    candidates.length > 0
                        ? AIH.SocialDecision._copy(
                            candidates[0]
                        )
                        : null,

                decisionMade:
                    false,

                timestamp:
                    Date.now()
            };
        };

    // =========================================================================
    // CONVENIENCE: GET CANDIDATES
    // =========================================================================

    AIH.SocialDecision.getCandidates =
        function(data) {

            var result;

            result =
                AIH.SocialDecision.evaluate(
                    data
                );

            if (!result) {
                return [];
            }

            return AIH.SocialDecision._copy(
                result.candidates
            );
        };

    // =========================================================================
    // CONVENIENCE: GET TOP CANDIDATE
    // =========================================================================
    //
    // This does NOT mean the action has been selected by a later action
    // system. It simply identifies the currently highest-ranked evaluation.
    //
    // =========================================================================

    AIH.SocialDecision.getTopCandidate =
        function(data) {

            var result;

            result =
                AIH.SocialDecision.evaluate(
                    data
                );

            if (
                !result ||
                !result.topCandidate
            ) {

                return null;
            }

            return AIH.SocialDecision._copy(
                result.topCandidate
            );
        };

    // =========================================================================
    // CONVENIENCE: GET SINGLE SCORE
    // =========================================================================

    AIH.SocialDecision.getScore =
        function(
            data,
            action
        ) {

            var result;
            var i;

            result =
                AIH.SocialDecision.evaluate(
                    data
                );

            if (!result) {
                return null;
            }

            for (
                i = 0;
                i < result.candidates.length;
                i++
            ) {

                if (
                    result.candidates[i].action ===
                    action
                ) {

                    return result.candidates[i].score;
                }
            }

            return null;
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "SocialDecision",
        {
            version:
                AIH.SocialDecision.VERSION,

            initialize:
                function() {

                    AIH.SocialDecision.initialize();
                },

            evaluate:
                function(data) {

                    return AIH.SocialDecision.evaluate(
                        data
                    );
                },

            getCandidates:
                function(data) {

                    return AIH.SocialDecision.getCandidates(
                        data
                    );
                },

            getTopCandidate:
                function(data) {

                    return AIH.SocialDecision.getTopCandidate(
                        data
                    );
                },

            getScore:
                function(
                    data,
                    action
                ) {

                    return AIH.SocialDecision.getScore(
                        data,
                        action
                    );
                }
        }
    );

    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_SocialDecision_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_SocialDecision_createGameObjects.call(
                this
            );

            AIH.SocialDecision.initialize();
        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

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

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

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

})();
