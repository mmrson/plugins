/*:
 * @plugindesc AI Hero Framework - Social Decision System v1.0.0 (Compiled)
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
 * THIS FILE REPLACES ALL PREVIOUS VERSIONS
 *
 * This is a single compiled replacement for every earlier draft of this
 * plugin (previously seen as AIH_SocialDecision.js, AIH_SocialDecision2.js
 * and AIH_SocialDecision3.js). Only ONE AIH_SocialDecision.js file should be
 * enabled in the plugin manager. Delete or disable the old copies.
 *
 * It keeps the public contract that AIH_SocialAction.js (STEP 20) already
 * depends on:
 *
 *     AIH.SocialDecision.decide(data)
 *
 * returning an object containing at least:
 *
 *     decision, decisionScore, decisionConfidence, faction, sourceId,
 *     sourceName, interpretation, subjectiveSeverity,
 *     interpretationConfidence, responseContext, state, reasons
 *
 * while internally upgrading the scoring engine with the strongest ideas
 * from every earlier draft (see "WHAT WAS COMBINED" below).
 *
 * ============================================================================
 *
 * PIPELINE
 *
 * OBJECTIVE EVENT
 *        |
 *        v
 * SOCIAL INTERACTION            (AIH_SocialInteraction.js)
 *        |
 *        v
 * SUBJECTIVE INTERPRETATION     (AIH_SocialInterpretation.js)
 *        |
 *        v
 * SOCIAL RESPONSE PRESSURE      (AIH_SocialResponse.js)
 *        |
 *        v
 * SOCIAL DECISION               <-- THIS MODULE
 *        |
 *        v
 * SOCIAL ACTION                 (AIH_SocialAction.js)
 *        |
 *        v
 * ACTION CONSEQUENCES           (AIH_SocialConsequence.js)
 *
 * This module occupies the DECISION stage. It does not execute anything.
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
 * - create memories
 * - call the LLM
 *
 * It determines the heroine's preferred RESPONSE INTENT and explains why,
 * as a ranked set of candidates. Nothing here is "executed" until
 * AIH_SocialAction.js converts the winning intent into an action request,
 * and a registered handler actually performs it.
 *
 * ============================================================================
 *
 * SOCIAL DECISIONS (unchanged action-space, required by AIH_SocialAction.js)
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
 * These are INTENTS, not executable actions. AIH_SocialAction.js maps them
 * onto executable action types (none, withdraw, cooperate, deescalate,
 * assert_boundary, confront, resist, retaliate).
 *
 * ============================================================================
 *
 * WHAT WAS COMBINED
 *
 * Earlier drafts split into two different design philosophies:
 *
 *   - One draft scored the 8 intents above directly from personality /
 *     values / emotions, and later added raw reputation-axis input. It read
 *     interpretation data directly from AIH_SocialInterpretation and never
 *     asked AIH_SocialInteraction to assess the interaction, so it skipped
 *     the module that formally reconciles OBJECTIVE vs SUBJECTIVE treatment.
 *
 *   - Another draft used a smaller 5-option action space (walkAway, confront,
 *     accept, acceptReluctantly, acceptPositively) but had a substantially
 *     better internal architecture: it went through
 *     AIH.SocialInteraction.assess() (the correct integration point), scored
 *     PERSONAL ACCEPTANCE separately from STRATEGIC ACCEPTABILITY (the
 *     "strategic compliance vs submission" distinction the design doc calls
 *     for), consulted AIH.Beliefs as evidence rather than fact, priced in
 *     faction-specific expected consequences (nobles/church/street/etc, as
 *     described in the design doc), and left a defensive hook for a future
 *     AIH.Goals system. However, its output shape ("evaluate" returning
 *     ranked candidates with no single "decision" field) is NOT compatible
 *     with what AIH_SocialAction.js already expects, and it referenced a
 *     few Values keys ("safety", "independence", "sociability") that do not
 *     actually exist in AIH_Values.js.
 *
 * This file:
 *
 *     - keeps the ORIGINAL 8-intent action space and the decide() contract,
 *       so AIH_SocialAction.js keeps working unmodified.
 *
 *     - routes every interaction through AIH.SocialInteraction.assess(),
 *       so the objective/subjective distinction is honored the way the
 *       design doc requires.
 *
 *     - keeps the "personal preference vs strategic acceptability" split
 *       for the compliant-leaning intents (comply/appease vs assert/resist)
 *       so accepting treatment for strategic reasons never gets recorded
 *       the same way as genuinely liking it.
 *
 *     - adds faction-specific EXPECTED CONSEQUENCE profiles (baseline world
 *       knowledge, not a rule that forbids anything), matched against the
 *       actual faction list defined in AIH_Reputation.js.
 *
 *     - adds BELIEF EVIDENCE: if the heroine has learned beliefs relevant to
 *       this faction or to consequences in general, escalation options
 *       become more cautious in proportion to how confident those beliefs
 *       are. Beliefs are treated as evidence, never as fact.
 *
 *     - adds a defensive GOAL CONTEXT hook for a future AIH.Goals module,
 *       exactly like the more advanced draft, without requiring it to exist
 *       yet.
 *
 *     - reads current faction standing through AIH.Social.getContext() so
 *       reputation (including lewdness, which the previous drafts ignored)
 *       can influence a decision without this module reaching into
 *       AIH.Reputation directly.
 *
 *     - only references personality/value/emotion keys that are verified to
 *       exist in the actual AIH_Personality.js / AIH_Values.js /
 *       AIH_Emotions.js files.
 *
 * ============================================================================
 *
 * IMPORTANT DESIGN PRINCIPLE (per project rules)
 *
 * Nothing in this file hard-codes conclusions such as "pride > X = attack"
 * or "faction = noble -> always comply". Every score is a weighted blend of
 * many small, independently defensible factors. Two heroines - or the same
 * heroine at two different moments - can reach different decisions from the
 * same objective event because their personality, emotional state, beliefs
 * and faction standing differ.
 *
 * ============================================================================
 *
 * PARAMETERS ACTUALLY USED (verified against the live plugins)
 *
 * Personality (AIH_Personality.js):
 *     courage, caution, curiosity, greed, pride, independence,
 *     riskTolerance, sociability, confidence
 *
 * Values (AIH_Values.js):
 *     survival, wealth, power, freedom, comfort, status, pleasure,
 *     modesty, dignity
 *
 * Emotions (AIH_Emotions.js):
 *     confidence, frustration, fear, embarrassment, excitement, anger,
 *     stress, fatigue, comfort
 *
 * Reputation axes (AIH_Reputation.js):
 *     reputation, lewdness, dominance
 *
 * ============================================================================
 *
 * PUBLIC API
 *
 * AIH.SocialDecision.decide(data)
 *     Main entry point. Returns the full decision result described above,
 *     or null if the interaction could not be assessed (e.g. unknown
 *     faction). This is what AIH_SocialAction.js calls.
 *
 * AIH.SocialDecision.evaluate(data)
 *     Alias for decide(). Kept for compatibility with anything already
 *     written against the alternate naming used by an earlier draft.
 *
 * AIH.SocialDecision.getDecision(data)
 *     Returns only the winning intent string.
 *
 * AIH.SocialDecision.getScores(data)
 *     Returns the full candidate map (action -> {score, reasons, factors}).
 *
 * AIH.SocialDecision.getContext(data)
 *     Returns a full copy of the decide() result (debug convenience).
 *
 * AIH.SocialDecision.shouldRespond(data)
 *     True if any non-ignore candidate outscored "ignore".
 *
 * AIH.SocialDecision.isEscalationLikely(data)
 *     True if confront, resist or retaliate scored highly.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";


    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.SocialDecision = AIH.SocialDecision || {};

    AIH.SocialDecision.VERSION = "1.0.0";

    AIH.SocialDecision.SCHEMA_VERSION = 2;

    AIH.SocialDecision._initialized = false;


    // =========================================================================
    // ACTION SPACE
    // =========================================================================
    //
    // This list MUST stay in sync with AIH.SocialAction.DECISIONS in
    // AIH_SocialAction.js. Do not rename or reorder without updating that
    // file too.
    //
    // =========================================================================

    AIH.SocialDecision.OPTIONS = [

        "ignore",
        "disengage",
        "comply",
        "appease",
        "assert",
        "confront",
        "resist",
        "retaliate"

    ];


    // =========================================================================
    // GENERIC HELPERS
    // =========================================================================

    AIH.SocialDecision._copy = function(value) {

        if (value === undefined || value === null) {
            return value;
        }

        return JSON.parse(JSON.stringify(value));
    };

    AIH.SocialDecision._clamp01 = function(value) {

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

    AIH.SocialDecision._clamp100 = function(value) {

        value = Number(value);

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

    AIH.SocialDecision._number = function(value, fallback) {

        var result;

        result = Number(value);

        if (isNaN(result)) {
            return fallback;
        }

        return result;
    };

    // Converts a -100..100 reputation axis into a 0..1 scale.
    AIH.SocialDecision._normalizeAxis = function(value) {

        value = AIH.SocialDecision._clamp100(value);

        return (value + 100) / 200;
    };


    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialDecision.initialize = function() {

        AIH.SocialDecision._initialized = true;

        if (AIH.Debug && AIH.Debug.log) {

            AIH.Debug.log(
                "Social decision system initialized (compiled v1.0.0)."
            );
        }
    };


    // =========================================================================
    // PERSONALITY / VALUES / EMOTIONS ACCESSORS
    // =========================================================================
    //
    // Defensive readers. If a module is missing or a key does not exist,
    // fall back to a neutral 0.5 rather than throwing or silently biasing
    // every decision toward zero.
    //
    // =========================================================================

    AIH.SocialDecision._personality = function(key) {

        var personality;
        var value;

        if (typeof AIH.Personality === "undefined" || !AIH.Personality.get) {
            return 0.5;
        }

        personality = AIH.Personality.get();

        if (!personality || personality[key] === undefined) {
            return 0.5;
        }

        value = Number(personality[key]);

        return isNaN(value) ? 0.5 : AIH.SocialDecision._clamp01(value);
    };

    AIH.SocialDecision._value = function(key) {

        var values;
        var value;

        if (typeof AIH.Values === "undefined") {
            return 0.5;
        }

        if (AIH.Values.getValue) {

            value = Number(AIH.Values.getValue(key));

            if (!isNaN(value)) {
                return AIH.SocialDecision._clamp01(value);
            }
        }

        if (AIH.Values.get) {

            values = AIH.Values.get();

            if (values && values[key] !== undefined) {

                value = Number(values[key]);

                if (!isNaN(value)) {
                    return AIH.SocialDecision._clamp01(value);
                }
            }
        }

        return 0.5;
    };

    AIH.SocialDecision._emotion = function(key) {

        var emotions;
        var value;

        if (typeof AIH.Emotions === "undefined") {
            return 0.5;
        }

        if (AIH.Emotions.getValue) {

            value = Number(AIH.Emotions.getValue(key));

            if (!isNaN(value)) {
                return AIH.SocialDecision._clamp01(value);
            }
        }

        if (AIH.Emotions.get) {

            emotions = AIH.Emotions.get();

            if (emotions && emotions[key] !== undefined) {

                value = Number(emotions[key]);

                if (!isNaN(value)) {
                    return AIH.SocialDecision._clamp01(value);
                }
            }
        }

        return 0.5;
    };


    // =========================================================================
    // INTERPRETATION
    // =========================================================================
    //
    // Asks AIH.SocialInterpretation for the subjective read on the raw
    // event data. If the caller already supplied a finished interpretation
    // result (interpretation + subjectiveSeverity present), it is used
    // as-is instead of being recomputed.
    //
    // =========================================================================

    AIH.SocialDecision._getInterpretation = function(data) {

        var result;

        if (!data) {
            return null;
        }

        if (data.interpretation && data.subjectiveSeverity !== undefined) {
            return data;
        }

        if (!AIH.SocialInterpretation || !AIH.SocialInterpretation.interpret) {
            return null;
        }

        result = AIH.SocialInterpretation.interpret(data);

        return result || null;
    };


    // =========================================================================
    // BRIDGE INTERPRETATION -> SOCIAL INTERACTION ASSESSMENT
    // =========================================================================
    //
    // AIH.SocialInteraction.create()/assess() expects flattened
    // "perceivedX" boolean fields, while AIH.SocialInterpretation.interpret()
    // returns a nested "interpretation" object. This bridges the two so the
    // interaction can be formally assessed (objective vs subjective) rather
    // than skipping that module.
    //
    // =========================================================================

    AIH.SocialDecision._buildAssessmentInput = function(data, interpretation) {

        var result;
        var flags;

        result = AIH.SocialDecision._copy(data || {});

        if (!interpretation) {
            return result;
        }

        flags = interpretation.interpretation || {};

        result.faction = interpretation.faction;
        result.sourceId = interpretation.sourceId;
        result.sourceName = interpretation.sourceName;

        result.perceivedDemeaning = flags.demeaning === true;
        result.perceivedThreat = flags.threatening === true;
        result.perceivedFlattering = flags.flattering === true;
        result.perceivedRespectful = flags.respectful === true;
        result.perceivedHumiliating = flags.humiliating === true;
        result.perceivedSexualized = flags.sexualized === true;
        result.perceivedPatronizing = flags.patronizing === true;
        result.perceivedControlling = flags.controlling === true;
        result.perceivedDisrespectful = flags.disrespectful === true;

        result.interpretationConfidence = interpretation.interpretationConfidence;
        result.severity = interpretation.subjectiveSeverity;

        return result;
    };


    // =========================================================================
    // GET SOCIAL CONTEXT (current faction standing)
    // =========================================================================

    AIH.SocialDecision._getSocialContext = function(faction) {

        if (!AIH.Social || !AIH.Social.getContext) {
            return null;
        }

        return AIH.Social.getContext(faction);
    };


    // =========================================================================
    // GET BELIEF EVIDENCE
    // =========================================================================
    //
    // Beliefs are evidence, never fact. This scans existing beliefs for
    // anything mentioning the current faction, and for anything categorized
    // as danger/consequence related, and turns that into a 0..1 confidence
    // signal the scoring functions can lean on. It never invents a belief
    // and never treats a belief as objectively true.
    //
    // =========================================================================

    AIH.SocialDecision._getBeliefEvidence = function(faction) {

        var evidence;
        var beliefs;
        var i;
        var belief;
        var proposition;
        var category;
        var confidence;
        var factionKey;

        evidence = {

            consequenceKnowledge: 0,
            socialKnowledge: 0,
            matchingBeliefs: [],
            count: 0

        };

        if (typeof AIH.Beliefs === "undefined" || !AIH.Beliefs.all) {
            return evidence;
        }

        beliefs = AIH.Beliefs.all();

        if (!Array.isArray(beliefs)) {
            return evidence;
        }

        factionKey = String(faction || "").toLowerCase();

        for (i = 0; i < beliefs.length; i++) {

            belief = beliefs[i];

            if (!belief) {
                continue;
            }

            proposition = String(belief.proposition || "").toLowerCase();
            category = String(belief.category || "").toLowerCase();
            confidence = AIH.SocialDecision._clamp01(belief.confidence);

            if (factionKey && proposition.indexOf(factionKey) >= 0) {

                evidence.matchingBeliefs.push({

                    id: belief.id !== undefined ? belief.id : null,
                    proposition: belief.proposition || "",
                    confidence: confidence

                });

                evidence.count++;

                evidence.socialKnowledge = Math.max(
                    evidence.socialKnowledge,
                    confidence
                );
            }

            if (
                category.indexOf("danger") >= 0 ||
                category.indexOf("consequence") >= 0
            ) {

                evidence.consequenceKnowledge = Math.max(
                    evidence.consequenceKnowledge,
                    confidence
                );
            }
        }

        return evidence;
    };


    // =========================================================================
    // GET GOAL CONTEXT
    // =========================================================================
    //
    // Goals do not exist yet as a dedicated module. This is a defensive
    // placeholder, exactly like the equivalent hook in the more advanced
    // earlier draft, so a future AIH.Goals module can plug in later without
    // this file needing to change. Until then it returns a neutral context.
    //
    // =========================================================================

    AIH.SocialDecision._getGoalContext = function(data) {

        var result;

        result = {

            relevance: 0.5,
            priorities: {},
            activeGoal: null

        };

        if (data && data.goalContext) {

            if (data.goalContext.relevance !== undefined) {

                result.relevance = AIH.SocialDecision._clamp01(
                    data.goalContext.relevance
                );
            }

            if (data.goalContext.priorities) {

                result.priorities = AIH.SocialDecision._copy(
                    data.goalContext.priorities
                );
            }

            if (data.goalContext.activeGoal !== undefined) {

                result.activeGoal = AIH.SocialDecision._copy(
                    data.goalContext.activeGoal
                );
            }

            return result;
        }

        if (typeof AIH.Goals !== "undefined") {

            if (typeof AIH.Goals.getDecisionContext === "function") {

                result = AIH.Goals.getDecisionContext() || result;

                return result;
            }

            if (typeof AIH.Goals.getActive === "function") {

                result.activeGoal = AIH.Goals.getActive();

                if (result.activeGoal) {
                    result.relevance = 0.75;
                }
            }
        }

        return result;
    };


    // =========================================================================
    // BASELINE FACTION CONSEQUENCE PROFILES
    // =========================================================================
    //
    // This is baseline WORLD KNOWLEDGE about how costly escalation tends to
    // be with each faction (see the design doc's noble/church/street/
    // merchant examples). It does NOT forbid any response - it only feeds
    // an expected-cost signal into the scoring functions below. A future
    // dedicated consequence/world system can override this per-interaction
    // by supplying data.consequenceContext.
    //
    // Keys match AIH.Reputation.DEFAULT_FACTIONS exactly (case-insensitive
    // lookup). Anything not listed here (e.g. a custom/new faction) falls
    // back to a moderate neutral profile.
    //
    // =========================================================================

    AIH.SocialDecision.CONSEQUENCE_PROFILES = {

        "church": {
            severity: 0.90, authorityRisk: 0.80, economicRisk: 0.35,
            accessRisk: 0.70, violenceRisk: 0.50,
            note: "Conflict with church personnel can carry serious institutional consequences."
        },

        "adventurers": {
            severity: 0.30, authorityRisk: 0.20, economicRisk: 0.15,
            accessRisk: 0.20, violenceRisk: 0.35,
            note: "Conflict with fellow adventurers mainly affects peer relationships and reputation."
        },

        "adventurer guild": {
            severity: 0.65, authorityRisk: 0.55, economicRisk: 0.50,
            accessRisk: 0.75, violenceRisk: 0.40,
            note: "Guild conflict can damage professional standing and access to contracts."
        },

        "nobles": {
            severity: 0.95, authorityRisk: 0.95, economicRisk: 0.75,
            accessRisk: 0.80, violenceRisk: 0.55,
            note: "Noble conflicts can attract institutional and social consequences that reach well beyond the individual involved."
        },

        "street": {
            severity: 0.20, authorityRisk: 0.15, economicRisk: 0.10,
            accessRisk: 0.10, violenceRisk: 0.45,
            note: "Street conflicts usually have few broad institutional consequences."
        },

        "merchants": {
            severity: 0.55, authorityRisk: 0.25, economicRisk: 0.85,
            accessRisk: 0.80, violenceRisk: 0.25,
            note: "Conflict with merchants can damage commercial access and pricing."
        },

        "orcs": {
            severity: 0.30, authorityRisk: 0.10, economicRisk: 0.10,
            accessRisk: 0.20, violenceRisk: 0.70,
            note: "Conflict may escalate physically even where institutional consequences are limited."
        },

        "goblins": {
            severity: 0.20, authorityRisk: 0.05, economicRisk: 0.05,
            accessRisk: 0.15, violenceRisk: 0.65,
            note: "Conflict may produce immediate physical escalation."
        },

        "elfs": {
            severity: 0.35, authorityRisk: 0.15, economicRisk: 0.15,
            accessRisk: 0.35, violenceRisk: 0.45,
            note: "Social consequences may persist within the community."
        },

        "dwarfs": {
            severity: 0.35, authorityRisk: 0.15, economicRisk: 0.35,
            accessRisk: 0.35, violenceRisk: 0.50,
            note: "Conflict can affect both social and commercial relationships."
        },

        "slimes": {
            severity: 0.10, authorityRisk: 0.05, economicRisk: 0.05,
            accessRisk: 0.05, violenceRisk: 0.30,
            note: "Baseline social consequences are assumed to be minimal."
        },

        "farm": {
            severity: 0.20, authorityRisk: 0.10, economicRisk: 0.20,
            accessRisk: 0.15, violenceRisk: 0.25,
            note: "Conflict with ordinary rural communities has limited institutional reach."
        },

        "minotaurs": {
            severity: 0.30, authorityRisk: 0.10, economicRisk: 0.10,
            accessRisk: 0.20, violenceRisk: 0.65,
            note: "Physical escalation may be significant."
        },

        "mages": {
            severity: 0.45, authorityRisk: 0.25, economicRisk: 0.20,
            accessRisk: 0.40, violenceRisk: 0.55,
            note: "Conflict with powerful specialists carries uncertain consequences."
        },

        "warriors": {
            severity: 0.30, authorityRisk: 0.15, economicRisk: 0.10,
            accessRisk: 0.20, violenceRisk: 0.65,
            note: "Warrior groups may respond strongly to direct confrontation."
        },

        "tavern": {
            severity: 0.25, authorityRisk: 0.15, economicRisk: 0.20,
            accessRisk: 0.25, violenceRisk: 0.40,
            note: "Tavern conflicts can affect local social relationships and access."
        },

        "gentlemens club": {
            severity: 0.55, authorityRisk: 0.25, economicRisk: 0.35,
            accessRisk: 0.60, violenceRisk: 0.25,
            note: "Conflict can affect access and reputation within this social circle."
        }

    };

    AIH.SocialDecision._defaultConsequenceProfile = function() {

        return {
            severity: 0.40, authorityRisk: 0.25, economicRisk: 0.25,
            accessRisk: 0.30, violenceRisk: 0.35,
            note: "No specific consequence knowledge exists for this faction; using a moderate default."
        };
    };

    AIH.SocialDecision._getConsequenceContext = function(data, faction) {

        var explicit;
        var profile;
        var key;

        explicit = data && data.consequenceContext ? data.consequenceContext : null;

        if (explicit) {

            return {

                severity: AIH.SocialDecision._clamp01(explicit.severity),
                authorityRisk: AIH.SocialDecision._clamp01(explicit.authorityRisk),
                economicRisk: AIH.SocialDecision._clamp01(explicit.economicRisk),
                accessRisk: AIH.SocialDecision._clamp01(explicit.accessRisk),
                violenceRisk: AIH.SocialDecision._clamp01(explicit.violenceRisk),
                source: "provided",
                note: explicit.note || ""
            };
        }

        key = String(faction || "").toLowerCase();

        profile = AIH.SocialDecision.CONSEQUENCE_PROFILES[key] ||
            AIH.SocialDecision._defaultConsequenceProfile();

        return {

            severity: profile.severity,
            authorityRisk: profile.authorityRisk,
            economicRisk: profile.economicRisk,
            accessRisk: profile.accessRisk,
            violenceRisk: profile.violenceRisk,
            source: AIH.SocialDecision.CONSEQUENCE_PROFILES[key] ? "baseline" : "default",
            note: profile.note
        };
    };


    // =========================================================================
    // BUILD DECISION STATE
    // =========================================================================
    //
    // Assembles every input the scoring functions need into a single object,
    // fetched once per decide() call.
    //
    // =========================================================================

    AIH.SocialDecision._buildState = function(assessment, data) {

        var interaction;
        var reaction;
        var response;
        var social;
        var state;

        interaction = assessment.interaction;
        reaction = assessment.reactionContext;
        response = assessment.responseContext;
        social = assessment.socialContext;

        state = {

            faction: interaction.faction,

            severity: AIH.SocialDecision._clamp01(reaction.subjectiveSeverity),
            confidence: AIH.SocialDecision._clamp01(reaction.interpretationConfidence),

            interpretation: {

                demeaning: interaction.interpretation.demeaning === true,
                threatening: interaction.interpretation.threatening === true,
                flattering: interaction.interpretation.flattering === true,
                respectful: interaction.interpretation.respectful === true,
                humiliating: interaction.interpretation.humiliating === true,
                sexualized: interaction.interpretation.sexualized === true,
                patronizing: interaction.interpretation.patronizing === true,
                controlling: interaction.interpretation.controlling === true,
                disrespectful: interaction.interpretation.disrespectful === true

            },

            responsePressure: {

                perceivedDisrespect: AIH.SocialDecision._clamp01(
                    response && response.responsePressure
                        ? response.responsePressure.perceivedDisrespect
                        : reaction.subjectiveSeverity
                ),

                aggressiveResponse: AIH.SocialDecision._clamp01(
                    response && response.responsePressure
                        ? response.responsePressure.aggressiveResponse
                        : 0
                ),

                resistanceToDisrespect: AIH.SocialDecision._clamp01(
                    response && response.heroineState
                        ? response.heroineState.resistanceToDisrespect
                        : 0.5
                )

            },

            personality: {

                courage: AIH.SocialDecision._personality("courage"),
                caution: AIH.SocialDecision._personality("caution"),
                curiosity: AIH.SocialDecision._personality("curiosity"),
                greed: AIH.SocialDecision._personality("greed"),
                pride: AIH.SocialDecision._personality("pride"),
                independence: AIH.SocialDecision._personality("independence"),
                riskTolerance: AIH.SocialDecision._personality("riskTolerance"),
                sociability: AIH.SocialDecision._personality("sociability"),
                confidence: AIH.SocialDecision._personality("confidence")

            },

            values: {

                survival: AIH.SocialDecision._value("survival"),
                wealth: AIH.SocialDecision._value("wealth"),
                power: AIH.SocialDecision._value("power"),
                freedom: AIH.SocialDecision._value("freedom"),
                comfort: AIH.SocialDecision._value("comfort"),
                status: AIH.SocialDecision._value("status"),
                pleasure: AIH.SocialDecision._value("pleasure"),
                modesty: AIH.SocialDecision._value("modesty"),
                dignity: AIH.SocialDecision._value("dignity")

            },

            emotions: {

                confidence: AIH.SocialDecision._emotion("confidence"),
                frustration: AIH.SocialDecision._emotion("frustration"),
                fear: AIH.SocialDecision._emotion("fear"),
                embarrassment: AIH.SocialDecision._emotion("embarrassment"),
                excitement: AIH.SocialDecision._emotion("excitement"),
                anger: AIH.SocialDecision._emotion("anger"),
                stress: AIH.SocialDecision._emotion("stress"),
                fatigue: AIH.SocialDecision._emotion("fatigue"),
                comfort: AIH.SocialDecision._emotion("comfort")

            },

            reputation: {

                reputation: social ? AIH.SocialDecision._normalizeAxis(
                    social.coordinates.reputation
                ) : 0.5,

                lewdness: social ? AIH.SocialDecision._normalizeAxis(
                    social.coordinates.lewdness
                ) : 0.5,

                dominance: social ? AIH.SocialDecision._normalizeAxis(
                    social.coordinates.dominance
                ) : 0.5

            },

            consequence: AIH.SocialDecision._getConsequenceContext(
                data,
                interaction.faction
            ),

            beliefs: AIH.SocialDecision._getBeliefEvidence(interaction.faction),

            goals: AIH.SocialDecision._getGoalContext(data),

            interpretationConflict: assessment.interpretationConflict || null

        };

        return state;
    };


    // =========================================================================
    // SHARED STRATEGIC MODIFIERS
    // =========================================================================
    //
    // These are reused across several candidate scoring functions so the
    // "expensive to escalate" logic is defined in exactly one place.
    //
    // =========================================================================

    // How costly the world is expected to make an escalatory response.
    AIH.SocialDecision._escalationCost = function(state) {

        var c;

        c = state.consequence;

        return AIH.SocialDecision._clamp01(
            (c.severity * 0.35) +
            (c.authorityRisk * 0.30) +
            (c.accessRisk * 0.15) +
            (c.economicRisk * 0.10) +
            (c.violenceRisk * 0.10)
        );
    };

    // How much learned experience (beliefs) should make her more cautious
    // about escalating with this faction specifically. Never used to
    // forbid anything - only to nudge the score.
    AIH.SocialDecision._learnedCaution = function(state) {

        var knowledge;

        knowledge = Math.max(
            state.beliefs.consequenceKnowledge,
            state.beliefs.socialKnowledge
        );

        return AIH.SocialDecision._clamp01(
            knowledge * state.consequence.severity
        );
    };

    // How much this specific interaction actually calls for ANY kind of
    // boundary-setting or confrontational response, independent of who she
    // is. This exists so that a proud, confident, high-dignity heroine does
    // not "assert a boundary" or "confront" during a perfectly respectful,
    // low-severity interaction merely because her personality traits are
    // high. Personality/value/confidence terms in the assert/confront/
    // resist candidates are scaled by this gate rather than added flatly,
    // so trait strength determines HOW STRONGLY she reacts to real
    // provocation, not WHETHER she invents provocation that is not there.
    AIH.SocialDecision._provocation = function(state) {

        var flagBoost;
        var ip;

        ip = state.interpretation;

        flagBoost = (
            ip.demeaning ||
            ip.disrespectful ||
            ip.humiliating ||
            ip.threatening ||
            ip.controlling ||
            ip.patronizing
        ) ? 1 : 0;

        return AIH.SocialDecision._clamp01(
            (Math.max(state.severity, state.responsePressure.perceivedDisrespect) * 0.65) +
            (flagBoost * 0.35)
        );
    };

    // Narrower gate specifically for "someone is trying to control/direct
    // her". Used by resist, which is about refusing control rather than
    // reacting to general severity.
    AIH.SocialDecision._controlPressure = function(state) {

        var ip;

        ip = state.interpretation;

        if (ip.controlling) {
            return 1;
        }

        if (ip.patronizing) {
            return 0.55;
        }

        return AIH.SocialDecision._clamp01(state.severity * 0.35);
    };


    // =========================================================================
    // SCORE: IGNORE
    // =========================================================================
    //
    // Favored when the interaction barely registered, when she is not
    // confident about what it even meant, or when engaging at all is not
    // worth the effort right now (fatigue/stress). Ignoring carries almost
    // no strategic cost, so a risky faction slightly increases its relative
    // appeal rather than decreasing it.
    //
    // =========================================================================

    AIH.SocialDecision._scoreIgnore = function(state) {

        var score;
        var reasons;

        reasons = [];

        score = 0.20;
        score += (1 - state.severity) * 0.25;
        score += (1 - state.responsePressure.perceivedDisrespect) * 0.20;
        score += (1 - state.confidence) * 0.15;
        score += state.emotions.fatigue * 0.10;
        score += state.emotions.stress * 0.05;
        score += AIH.SocialDecision._escalationCost(state) * 0.10;

        score -= state.interpretation.humiliating ? 0.25 : 0;
        score -= state.interpretation.threatening ? 0.20 : 0;
        score -= state.interpretation.controlling ? 0.10 : 0;

        if (state.confidence < 0.40) {
            reasons.push("uncertain_about_what_the_interaction_meant");
        }

        if (state.severity < 0.25) {
            reasons.push("interaction_too_minor_to_warrant_a_response");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE: DISENGAGE
    // =========================================================================
    //
    // Physically or socially removing herself from the situation. Distinct
    // from ignoring - this means leaving, not merely not reacting. Favored
    // by independence, controlling/threatening treatment, and by strategic
    // pressure when the faction is a costly one to fight.
    //
    // =========================================================================

    AIH.SocialDecision._scoreDisengage = function(state) {

        var score;
        var reasons;
        var escalationCost;

        reasons = [];
        escalationCost = AIH.SocialDecision._escalationCost(state);

        score = 0.15;
        score += state.severity * 0.10;
        score += state.interpretation.controlling ? 0.20 : 0;
        score += state.interpretation.threatening ? 0.15 : 0;
        score += state.interpretation.patronizing ? 0.05 : 0;
        score += state.personality.independence * 0.15;
        score += state.values.freedom * 0.10;
        score += state.emotions.fear * 0.10;
        score += state.emotions.stress * 0.05;
        score += escalationCost * 0.15;
        score -= state.personality.sociability * 0.05;

        if (state.interpretation.controlling) {
            reasons.push("leaving_avoids_being_controlled");
        }

        if (escalationCost >= 0.60) {
            reasons.push("staying_would_risk_substantial_external_consequences");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE: COMPLY
    // =========================================================================
    //
    // Cooperating with what is being asked/expected. This is NOT
    // automatically cowardice - it can be the strategically correct choice.
    // The score therefore combines a PERSONAL component (does she actually
    // mind complying here) with a STRATEGIC component (how costly would
    // refusing be). A heroine can comply while privately disliking it; the
    // "reasons" array records which of the two actually drove the score.
    //
    // =========================================================================

    AIH.SocialDecision._scoreComply = function(state) {

        var score;
        var reasons;
        var personalWillingness;
        var strategicPressure;
        var escalationCost;
        var learnedCaution;

        reasons = [];
        escalationCost = AIH.SocialDecision._escalationCost(state);
        learnedCaution = AIH.SocialDecision._learnedCaution(state);

        personalWillingness = 0.5;
        personalWillingness -= state.personality.pride * 0.20;
        personalWillingness -= state.personality.independence * 0.15;
        personalWillingness -= state.values.dignity * 0.15;
        personalWillingness += state.personality.sociability * 0.10;
        personalWillingness += state.values.survival * 0.10;
        personalWillingness -= state.interpretation.demeaning ? 0.20 : 0;
        personalWillingness -= state.interpretation.humiliating ? 0.25 : 0;
        personalWillingness = AIH.SocialDecision._clamp01(personalWillingness);

        strategicPressure = (escalationCost * 0.55) + (learnedCaution * 0.25) +
            (state.emotions.fear * 0.20);
        strategicPressure = AIH.SocialDecision._clamp01(strategicPressure);

        score = (personalWillingness * 0.45) + (strategicPressure * 0.45) +
            (state.personality.caution * 0.10);

        if (strategicPressure >= 0.55 && personalWillingness < 0.45) {
            reasons.push("strategic_compliance_despite_personal_reluctance");
        } else if (personalWillingness >= 0.55) {
            reasons.push("relatively_little_personal_resistance_to_complying");
        }

        if (learnedCaution >= 0.55) {
            reasons.push("past_experience_with_this_faction_favors_compliance");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE: APPEASE
    // =========================================================================
    //
    // Actively smoothing the interaction over, rather than just tolerating
    // it. Requires the treatment not be too severe - appeasement does not
    // fit humiliation or open threats. Favored by sociability and by
    // wanting to preserve standing with the faction.
    //
    // =========================================================================

    AIH.SocialDecision._scoreAppease = function(state) {

        var score;
        var reasons;

        reasons = [];

        score = 0.10;
        score += state.personality.sociability * 0.20;
        score += state.values.status * 0.10;
        score += state.values.pleasure * 0.05;
        score += (1 - state.emotions.anger) * 0.10;
        score += (1 - state.emotions.frustration) * 0.10;
        score += (1 - state.severity) * 0.15;
        score += state.reputation.reputation * 0.10;

        score -= state.interpretation.humiliating ? 0.35 : 0;
        score -= state.interpretation.threatening ? 0.25 : 0;
        score -= state.personality.pride * 0.10;

        if (state.personality.sociability >= 0.60 && state.severity < 0.50) {
            reasons.push("sociable_disposition_favors_smoothing_things_over");
        }

        if (state.interpretation.humiliating || state.interpretation.threatening) {
            reasons.push("treatment_is_too_severe_for_appeasement_to_fit");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE: ASSERT
    // =========================================================================
    //
    // Non-violent boundary-setting ("I don't tolerate disrespect, but I
    // choose when to respond"). This is the middle path the design doc asks
    // for: it stays viable even in higher-consequence factions because it
    // is far cheaper than confront/resist/retaliate, so escalation cost
    // only lightly discourages it.
    //
    // =========================================================================

    AIH.SocialDecision._scoreAssert = function(state) {

        var score;
        var reasons;
        var escalationCost;
        var provocation;
        var traitPull;

        reasons = [];
        escalationCost = AIH.SocialDecision._escalationCost(state);
        provocation = AIH.SocialDecision._provocation(state);

        // How strongly her personality/values/confidence WOULD push her to
        // assert a boundary, if there were something to assert one about.
        traitPull = 0;
        traitPull += state.personality.pride * 0.30;
        traitPull += state.values.dignity * 0.20;
        traitPull += state.personality.independence * 0.15;
        traitPull += state.emotions.confidence * 0.20;
        traitPull += state.personality.courage * 0.10;
        traitPull = AIH.SocialDecision._clamp01(traitPull);

        score = 0.05;
        score += provocation * traitPull * 0.75;
        score -= escalationCost * 0.10;
        score -= state.emotions.fear * 0.08;

        if (provocation >= 0.40 && state.personality.pride >= 0.70) {
            reasons.push("high_pride_favors_setting_a_clear_boundary");
        }

        if (provocation >= 0.30 && escalationCost >= 0.60) {
            reasons.push("chosen_over_confrontation_because_it_is_far_less_costly_here");
        }

        if (provocation < 0.25) {
            reasons.push("little_to_nothing_here_actually_calls_for_a_boundary");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE: CONFRONT
    // =========================================================================
    //
    // Direct, deliberate challenge. Strongly favored by pride, courage,
    // confidence and perceived severity; strongly discouraged by expected
    // external consequences and by learned caution about this faction.
    //
    // =========================================================================

    AIH.SocialDecision._scoreConfront = function(state) {

        var score;
        var reasons;
        var escalationCost;
        var learnedCaution;
        var provocation;
        var traitPull;
        var moodPull;

        reasons = [];
        escalationCost = AIH.SocialDecision._escalationCost(state);
        learnedCaution = AIH.SocialDecision._learnedCaution(state);
        provocation = AIH.SocialDecision._provocation(state);

        // How strongly her personality WOULD push her toward direct
        // confrontation, if the situation actually warranted it.
        traitPull = 0;
        traitPull += state.personality.pride * 0.25;
        traitPull += state.personality.courage * 0.25;
        traitPull += state.emotions.confidence * 0.20;
        traitPull += state.personality.riskTolerance * 0.20;
        traitPull += state.personality.independence * 0.10;
        traitPull = AIH.SocialDecision._clamp01(traitPull);

        // Frustration/anger can push toward confrontation somewhat
        // independent of the current event (per design doc: high
        // frustration erodes long-term/rational restraint), so this stays
        // as a smaller unscaled contribution rather than being fully
        // gated by provocation.
        moodPull = (state.emotions.anger * 0.10) + (state.emotions.frustration * 0.08);

        score = 0.00;
        score += provocation * traitPull * 0.70;
        score += moodPull;
        score -= state.emotions.fear * 0.15;
        score -= escalationCost * 0.35;
        score -= learnedCaution * 0.15;

        if (provocation >= 0.40 &&
            (state.interpretation.demeaning || state.interpretation.disrespectful)) {
            reasons.push("interaction_perceived_as_demeaning_or_disrespectful");
        }

        if (provocation >= 0.40 && state.personality.pride >= 0.75) {
            reasons.push("very_high_pride_resists_status_lowering_treatment");
        }

        if (escalationCost >= 0.65) {
            reasons.push("expected_external_consequences_substantially_reduce_appeal");
        }

        if (learnedCaution >= 0.55) {
            reasons.push("learned_consequence_knowledge_increases_caution_here");
        }

        if (provocation < 0.25) {
            reasons.push("nothing_in_this_interaction_actually_warrants_confrontation");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE: RESIST
    // =========================================================================
    //
    // Refusing to be controlled/dominated without necessarily attacking or
    // escalating socially. Distinct from confront - this is about refusing
    // compliance, not challenging the source. Less strategically sensitive
    // than confront, because it does not require initiating hostility.
    //
    // =========================================================================

    AIH.SocialDecision._scoreResist = function(state) {

        var score;
        var reasons;
        var escalationCost;
        var controlPressure;
        var traitPull;

        reasons = [];
        escalationCost = AIH.SocialDecision._escalationCost(state);
        controlPressure = AIH.SocialDecision._controlPressure(state);

        traitPull = 0;
        traitPull += state.personality.independence * 0.35;
        traitPull += state.values.freedom * 0.30;
        traitPull += state.personality.courage * 0.20;
        traitPull += (1 - state.reputation.dominance) * 0.15;
        traitPull = AIH.SocialDecision._clamp01(traitPull);

        score = 0.05;
        score += controlPressure * traitPull * 0.75;
        score -= escalationCost * 0.15;
        score -= state.emotions.fear * 0.10;

        if (state.interpretation.controlling) {
            reasons.push("refuses_an_attempt_to_control_her_without_attacking");
        }

        if (controlPressure >= 0.50 && state.values.freedom >= 0.70) {
            reasons.push("strong_value_placed_on_personal_freedom");
        }

        if (controlPressure < 0.25) {
            reasons.push("nothing_here_actually_attempts_to_control_or_direct_her");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE: RETALIATE
    // =========================================================================
    //
    // Deliberately the hardest candidate to reach. Requires strong
    // alignment across humiliation, anger, confidence and low fear/caution
    // simultaneously, and is heavily suppressed by expected external
    // consequences, violence risk and learned caution.
    //
    // =========================================================================

    AIH.SocialDecision._scoreRetaliate = function(state) {

        var score;
        var reasons;
        var escalationCost;
        var learnedCaution;

        reasons = [];
        escalationCost = AIH.SocialDecision._escalationCost(state);
        learnedCaution = AIH.SocialDecision._learnedCaution(state);

        score = -0.10;
        score += state.interpretation.humiliating ? 0.25 : 0;
        score += state.emotions.anger * 0.20;
        score += state.emotions.embarrassment * 0.10;
        score += state.responsePressure.aggressiveResponse * 0.15;
        score += state.emotions.confidence * 0.10;
        score += state.personality.courage * 0.05;
        score += state.personality.pride * 0.05;
        score += state.personality.riskTolerance * 0.10;
        score -= state.emotions.fear * 0.20;
        score -= state.personality.caution * 0.10;
        score -= state.values.survival * 0.10;
        score -= escalationCost * 0.35;
        score -= state.consequence.violenceRisk * 0.10;
        score -= learnedCaution * 0.20;

        if (state.interpretation.humiliating && state.emotions.anger >= 0.60) {
            reasons.push("humiliation_combined_with_high_anger");
        }

        if (escalationCost >= 0.55 || learnedCaution >= 0.55) {
            reasons.push("expected_consequences_or_learned_caution_strongly_suppress_this_option");
        }

        return { score: AIH.SocialDecision._clamp01(score), reasons: reasons };
    };


    // =========================================================================
    // SCORE ALL CANDIDATES
    // =========================================================================

    AIH.SocialDecision._scoreCandidates = function(state) {

        var result;

        result = {

            ignore: AIH.SocialDecision._scoreIgnore(state),
            disengage: AIH.SocialDecision._scoreDisengage(state),
            comply: AIH.SocialDecision._scoreComply(state),
            appease: AIH.SocialDecision._scoreAppease(state),
            assert: AIH.SocialDecision._scoreAssert(state),
            confront: AIH.SocialDecision._scoreConfront(state),
            resist: AIH.SocialDecision._scoreResist(state),
            retaliate: AIH.SocialDecision._scoreRetaliate(state)

        };

        return result;
    };


    // =========================================================================
    // PICK WINNER
    // =========================================================================

    AIH.SocialDecision._getBestDecision = function(candidates) {

        var keys;
        var best;
        var bestScore;
        var i;
        var key;

        keys = Object.keys(candidates);

        best = "ignore";
        bestScore = -1;

        for (i = 0; i < keys.length; i++) {

            key = keys[i];

            if (candidates[key].score > bestScore) {

                bestScore = candidates[key].score;
                best = key;
            }
        }

        return { decision: best, score: AIH.SocialDecision._clamp01(bestScore) };
    };


    // =========================================================================
    // DECISION CONFIDENCE
    // =========================================================================
    //
    // Based on how far the winning score is ahead of the runner-up. A close
    // race between two candidates means low confidence; a clear winner
    // means high confidence.
    //
    // =========================================================================

    AIH.SocialDecision._getDecisionConfidence = function(candidates) {

        var keys;
        var highest;
        var second;
        var i;
        var value;

        keys = Object.keys(candidates);

        highest = -1;
        second = -1;

        for (i = 0; i < keys.length; i++) {

            value = AIH.SocialDecision._clamp01(candidates[keys[i]].score);

            if (value > highest) {

                second = highest;
                highest = value;

            } else if (value > second) {

                second = value;
            }
        }

        if (second < 0) {
            second = 0;
        }

        return AIH.SocialDecision._clamp01(0.50 + ((highest - second) * 0.50));
    };


    // =========================================================================
    // GENERAL (CONTEXT-LEVEL) REASONS
    // =========================================================================
    //
    // These describe the interaction itself, independent of which option
    // won. Candidate-specific reasons (from the winning score function) are
    // appended after these in decide().
    //
    // =========================================================================

    AIH.SocialDecision._getGeneralReasons = function(state) {

        var reasons;

        reasons = [];

        if (state.interpretation.demeaning) {
            reasons.push("interaction_perceived_as_demeaning");
        }

        if (state.interpretation.disrespectful) {
            reasons.push("interaction_perceived_as_disrespectful");
        }

        if (state.interpretation.humiliating) {
            reasons.push("interaction_perceived_as_humiliating");
        }

        if (state.interpretation.threatening) {
            reasons.push("interaction_perceived_as_threatening");
        }

        if (state.interpretation.controlling) {
            reasons.push("interaction_perceived_as_controlling");
        }

        if (state.interpretation.patronizing) {
            reasons.push("interaction_perceived_as_patronizing");
        }

        if (state.interpretation.sexualized) {
            reasons.push("interaction_perceived_as_sexualized");
        }

        if (state.responsePressure.perceivedDisrespect >= 0.70) {
            reasons.push("high_perceived_disrespect");
        }

        if (state.confidence < 0.40) {
            reasons.push("low_confidence_in_interpretation");
        }

        if (state.beliefs.count > 0) {
            reasons.push("prior_learned_beliefs_about_this_faction_were_considered");
        }

        if (AIH.SocialDecision._escalationCost(state) >= 0.65) {
            reasons.push("this_faction_carries_high_expected_consequences_for_escalation");
        }

        return reasons;
    };


    // =========================================================================
    // MAIN DECISION FUNCTION
    // =========================================================================

    AIH.SocialDecision.decide = function(data) {

        var interpretation;
        var assessmentInput;
        var assessment;
        var state;
        var candidates;
        var winner;
        var decisionConfidence;
        var reasons;

        if (!data) {
            return null;
        }

        // ---------------------------------------------------------------
        // SUBJECTIVE INTERPRETATION
        // ---------------------------------------------------------------

        interpretation = AIH.SocialDecision._getInterpretation(data);

        if (!interpretation || !interpretation.faction) {
            return null;
        }

        // ---------------------------------------------------------------
        // FORMAL OBJECTIVE / SUBJECTIVE ASSESSMENT
        //
        // Routed through AIH.SocialInteraction.assess() so the interaction
        // is reconciled the way the design doc requires, rather than
        // reasoning from the raw interpretation alone.
        // ---------------------------------------------------------------

        if (!AIH.SocialInteraction || !AIH.SocialInteraction.assess) {
            return null;
        }

        assessmentInput = AIH.SocialDecision._buildAssessmentInput(
            data,
            interpretation
        );

        assessment = AIH.SocialInteraction.assess(assessmentInput);

        if (!assessment) {
            return null;
        }

        // ---------------------------------------------------------------
        // STATE
        // ---------------------------------------------------------------

        state = AIH.SocialDecision._buildState(assessment, data);

        // ---------------------------------------------------------------
        // CANDIDATES
        // ---------------------------------------------------------------

        candidates = AIH.SocialDecision._scoreCandidates(state);

        // ---------------------------------------------------------------
        // WINNER
        // ---------------------------------------------------------------

        winner = AIH.SocialDecision._getBestDecision(candidates);

        decisionConfidence = AIH.SocialDecision._getDecisionConfidence(candidates);

        // ---------------------------------------------------------------
        // REASONS (general context + winning candidate's own reasons)
        // ---------------------------------------------------------------

        reasons = AIH.SocialDecision._getGeneralReasons(state);

        if (candidates[winner.decision] && candidates[winner.decision].reasons) {
            reasons = reasons.concat(candidates[winner.decision].reasons);
        }

        // ---------------------------------------------------------------
        // RESULT
        // ---------------------------------------------------------------

        return {

            schemaVersion: AIH.SocialDecision.SCHEMA_VERSION,

            faction: interpretation.faction,
            sourceId: interpretation.sourceId,
            sourceName: interpretation.sourceName,

            decision: winner.decision,
            decisionScore: winner.score,
            decisionConfidence: decisionConfidence,

            candidates: AIH.SocialDecision._copy(candidates),

            interpretation: AIH.SocialDecision._copy(state.interpretation),

            subjectiveSeverity: AIH.SocialDecision._clamp01(state.severity),
            interpretationConfidence: AIH.SocialDecision._clamp01(state.confidence),

            responseContext: AIH.SocialDecision._copy(assessment.responseContext),

            consequenceContext: AIH.SocialDecision._copy(state.consequence),
            beliefEvidence: AIH.SocialDecision._copy(state.beliefs),
            goalContext: AIH.SocialDecision._copy(state.goals),
            reputationContext: AIH.SocialDecision._copy(state.reputation),

            state: AIH.SocialDecision._copy(state),

            reasons: reasons,

            timestamp: Date.now()

        };
    };


    // =========================================================================
    // CONVENIENCE API
    // =========================================================================

    // Alias kept for compatibility with anything already calling evaluate().
    AIH.SocialDecision.evaluate = function(data) {

        return AIH.SocialDecision.decide(data);
    };

    AIH.SocialDecision.getDecision = function(data) {

        var result;

        result = AIH.SocialDecision.decide(data);

        return result ? result.decision : null;
    };

    AIH.SocialDecision.getScores = function(data) {

        var result;

        result = AIH.SocialDecision.decide(data);

        return result ? AIH.SocialDecision._copy(result.candidates) : null;
    };

    // Alias kept for compatibility with anything already calling getCandidates().
    AIH.SocialDecision.getCandidates = function(data) {

        return AIH.SocialDecision.getScores(data);
    };

    AIH.SocialDecision.getContext = function(data) {

        var result;

        result = AIH.SocialDecision.decide(data);

        return result ? AIH.SocialDecision._copy(result) : null;
    };

    AIH.SocialDecision.shouldRespond = function(data) {

        var result;
        var ignoreScore;
        var bestActive;
        var keys;
        var i;
        var key;

        result = AIH.SocialDecision.decide(data);

        if (!result) {
            return false;
        }

        ignoreScore = result.candidates.ignore.score;
        bestActive = 0;

        keys = Object.keys(result.candidates);

        for (i = 0; i < keys.length; i++) {

            key = keys[i];

            if (key === "ignore") {
                continue;
            }

            if (result.candidates[key].score > bestActive) {
                bestActive = result.candidates[key].score;
            }
        }

        return bestActive > ignoreScore;
    };

    AIH.SocialDecision.isEscalationLikely = function(data) {

        var result;

        result = AIH.SocialDecision.decide(data);

        if (!result) {
            return false;
        }

        return (
            result.candidates.confront.score >= 0.60 ||
            result.candidates.resist.score >= 0.60 ||
            result.candidates.retaliate.score >= 0.60
        );
    };


    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (AIH.Modules && AIH.Modules.register) {

        AIH.Modules.register("SocialDecision", {

            version: AIH.SocialDecision.VERSION,

            initialize: function() {
                AIH.SocialDecision.initialize();
            },

            decide: function(data) {
                return AIH.SocialDecision.decide(data);
            },

            evaluate: function(data) {
                return AIH.SocialDecision.evaluate(data);
            },

            getDecision: function(data) {
                return AIH.SocialDecision.getDecision(data);
            },

            getScores: function(data) {
                return AIH.SocialDecision.getScores(data);
            },

            getCandidates: function(data) {
                return AIH.SocialDecision.getCandidates(data);
            },

            getContext: function(data) {
                return AIH.SocialDecision.getContext(data);
            },

            shouldRespond: function(data) {
                return AIH.SocialDecision.shouldRespond(data);
            },

            isEscalationLikely: function(data) {
                return AIH.SocialDecision.isEscalationLikely(data);
            }

        });
    }


    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_SocialDecision_createGameObjects = DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_SocialDecision_createGameObjects.call(this);

            AIH.SocialDecision.initialize();
        };

        var _AIH_SocialDecision_setupNewGame = DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_SocialDecision_setupNewGame.call(this);

            AIH.SocialDecision._initialized = false;
            AIH.SocialDecision.initialize();
        };

        var _AIH_SocialDecision_extractSaveContents = DataManager.extractSaveContents;

        DataManager.extractSaveContents = function(contents) {

            _AIH_SocialDecision_extractSaveContents.call(this, contents);

            AIH.SocialDecision._initialized = false;
            AIH.SocialDecision.initialize();
        };
    }

})();