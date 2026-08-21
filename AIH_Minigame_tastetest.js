/*:
 * @plugindesc AI Hero Framework - Minigame: Taste Testing (Ferment Tasting) v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - MINIGAME: TASTE TESTING (FERMENT TASTING)
 * ============================================================================
 *
 * A new activity, not on the original Section 10 roster - closest in spirit
 * to the Investigation Framework (F: identify a source from evidence) but
 * with its own consumption-method boundary layer, so it is filed here as
 * its own framework rather than bolted onto Monster Identification.
 *
 * LORE (for context only - nothing below hardcodes any of this as a rule):
 * nomadic families each keep their own recipe for a thick, tangy fermented
 * milk preserve, kept liquid and shelf-stable inside an expensive,
 * reusable, magically-treated bamboo tube (visually similar to Korean
 * bamboo-salt containers). Air ruins the contents fast and the tube itself
 * cannot safely be broken open, so the only way to draw the ferment back
 * out without destroying it is the single mouth-hole at the tube's end -
 * consumed by sipping/drawing it out directly, traditionally seated on the
 * ground per nomadic custom. She is blindfolded for the tasting itself,
 * and tubes are handed to her through a small hole so she cannot see who
 * handed her which one. Whether a given batch is just nutritious or also
 * mana/health-restorative for HER specifically depends on an external
 * unlock (see SCBS below), not on who made it.
 *
 * Bamboo is expensive to grow/buy, so some more nomadic societies who
 * can't afford it came up with an alternative container: hardened smoked
 * sausage casing holding the exact same ferment. Everything else about
 * it is identical - only the container differs. She prefers this variety
 * unquestionably from the start.
 *
 * This module owns NO psychology. Every decision the heroine makes comes
 * from AIH.PressureEvaluator.evaluate() reading her real, current
 * Personality/Values/Emotions. This file's only jobs are:
 *
 *     1. Model makers and their ferments as DATA (templates), not code.
 *     2. Turn one sample (or a same-time batch of samples) into
 *        PressureEvaluator situation objects.
 *     3. Turn the evaluator's response into an in-fiction outcome,
 *        including whether she can correctly identify who made it.
 *     4. Report outcomes back via PersonalityDrift.reinforce() and,
 *        where warranted, Relationships / Reputation / Goals.
 *
 * Per Section 8's core rule, there is no "if flavor=X then always Y"
 * anywhere in this file. Batch size, publicity, and a maker's own
 * persistence/authority are all just inputs to the shared evaluator; the
 * evaluator + her real state decide what happens.
 *
 * ============================================================================
 *
 * MAKERS: GENERATED + AUTHORED (same split as AIH_Minigame_Bathhouse.js)
 *
 * GENERATED (filler)
 *     AIH.MinigameTasteTest.MAKER_ARCHETYPES - a small set of archetypes
 *     (ranges for tanginess/thickness/saltiness/quality/publicity/
 *     authority/reward). A generated maker is anonymous and one-off: no
 *     identity persists across batches, so identification confidence
 *     never builds for one (there is nothing to learn from a stranger's
 *     cooking you will never taste again).
 *
 * AUTHORED (regulars)
 *     AIH.MinigameTasteTest.REGULARS - named makers with a FIXED flavor
 *     signature and an AIH.Relationships entry, so familiarity/trust
 *     persist across sessions and feed back in as domainPressure /
 *     attachmentDiscount (handoff Section 7's "minigame's own relationship
 *     tracking" example) - and, specific to this minigame, so
 *     identification confidence for that one maker can genuinely build up
 *     the more of their batches she tastes.
 *
 * ============================================================================
 *
 * IDENTIFICATION
 *
 * First taste of any given regular is, by design, unwinnable - confidence
 * starts at 0 and only rises with repeated exposure to THAT maker (see
 * _identificationConfidence). Generated/anonymous makers never build
 * confidence at all. Getting the food itself (nutrition, and - if SCBS is
 * enabled - mana/health restoration) is always profitable regardless of
 * whether she identifies the maker correctly.
 *
 * ============================================================================
 *
 * SCBS GATE
 *
 * "SCBS" is an external event/skillset unlock this module does not own or
 * decide - it only reads a flag (default OFF) via isSCBSEnabled() /
 * setSCBSEnabled(). When off, tasting is still worthwhile (free
 * nutrition/reward), it just never grants survivalBenefit (mana/health
 * restoration). Some other system is expected to call setSCBSEnabled(true)
 * once that event fires; this module makes no assumption about when or why.
 *
 * ============================================================================
 *
 * PLAYER INTERFERENCE
 *
 * The player can send multiple tubes to her at once (a "batch"). Batch
 * size is one of the inputs (alongside publicity/authority) folded into a
 * single continuous _batchIntensity() multiplier, reused across every
 * situation in the batch, the misidentification backfire roll, and the
 * mishap roll - same pattern as Bathhouse's _confrontationIntensity.
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide her response (PressureEvaluator does)
 * - adjust personality directly (PersonalityDrift.reinforce() does, always)
 * - hardcode "if maker is a noble then always X" or similar dev conclusions
 * - decide whether SCBS is enabled (only reads the flag)
 * - build a second pressure evaluator
 *
 * ============================================================================
 *
 * @command StartSession
 * @text Start Tasting Session
 * @desc Begins a tasting session (resets session-scoped log/counters).
 *
 * @command GenerateBatch
 * @text Generate Random Batch
 * @arg batchSize
 * @text Batch Size
 * @desc How many tubes arrive at once (1 = single sample).
 * @type number
 * @min 1
 * @max 8
 * @default 1
 *
 * @command TasteFromRegular
 * @text Taste Batch Including A Regular
 * @arg regularId
 * @text Regular Id
 * @desc The id of the regular maker (see AIH.MinigameTasteTest.REGULARS).
 * @type string
 * @arg batchSize
 * @text Batch Size
 * @desc How many tubes arrive at once, including this regular's.
 * @type number
 * @min 1
 * @max 8
 * @default 1
 *
 * @command SetSCBSEnabled
 * @text Set SCBS Enabled
 * @arg enabled
 * @text Enabled
 * @desc Whether she currently gets restorative (mana/health) effects from tasting.
 * @type boolean
 * @default false
 *
 * @command SetCurrentOutfit
 * @text Set Current Outfit
 * @arg outfit
 * @text Outfit
 * @desc Which outfit variant is shown ("regular" or "tribal_garb").
 * @type string
 * @default regular
 *
 * @command ForceOverwhelmEscalation
 * @text Force Overwhelm Escalation
 * @desc Groups every maker she's currently avoiding via shape recognition and confronts her with all of them at once.
 *
 * @command ShowSessionLog
 * @text Show Session Log
 * @desc Displays the current tasting session's log.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.MinigameTasteTest = AIH.MinigameTasteTest || {};

    AIH.MinigameTasteTest.VERSION = "0.1.0";

    AIH.MinigameTasteTest.SCHEMA_VERSION = 1;

    AIH.MinigameTasteTest._initialized = false;

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.MinigameTasteTest._copy = function(value) {

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

    AIH.MinigameTasteTest._clamp01 = function(value) {

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

    AIH.MinigameTasteTest._randomBetween = function(min, max) {

        min =
            Number(min);

        max =
            Number(max);

        if (isNaN(min)) {
            min = 0;
        }

        if (isNaN(max)) {
            max = min;
        }

        return min + (Math.random() * (max - min));
    };

    AIH.MinigameTasteTest._pickRandom = function(array) {

        if (
            !Array.isArray(array) ||
            array.length === 0
        ) {

            return null;
        }

        return array[
            Math.floor(
                Math.random() * array.length
            )
        ];
    };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================
    //
    // Follows the same defensive-container pattern as AIH_Goals._ensure()
    // and AIH_Minigame_Bathhouse._ensure() - this module's key was not
    // reserved in advance by AIH_State.js, so it builds its own container
    // the first time it's needed.
    //
    // =========================================================================

    AIH.MinigameTasteTest._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.MinigameTasteTest._ensure = function() {

        var state;

        state =
            AIH.MinigameTasteTest._state();

        if (!state) {
            return null;
        }

        if (!state.minigameTasteTest) {

            state.minigameTasteTest = {

                schemaVersion:
                    AIH.MinigameTasteTest.SCHEMA_VERSION,

                sessionActive:
                    false,

                sessionLog:
                    [],

                totalBatches:
                    0,

                nextBatchId:
                    1,

                scbsEnabled:
                    false,

                makerSignatureMemory:
                    {},

                misattributionIncidents:
                    {},

                judgmentsHandledWell:
                    0,

                totalTastings:
                    0,

                currentOutfit:
                    "regular",

                avoidedMakerKeys:
                    {},

                avoidMakerGoalIds:
                    {}
            };
        }

        if (
            !Array.isArray(
                state.minigameTasteTest.sessionLog
            )
        ) {

            state.minigameTasteTest.sessionLog = [];
        }

        if (
            !state.minigameTasteTest.makerSignatureMemory ||
            typeof state.minigameTasteTest.makerSignatureMemory !== "object"
        ) {

            state.minigameTasteTest.makerSignatureMemory = {};
        }

        if (
            !state.minigameTasteTest.misattributionIncidents ||
            typeof state.minigameTasteTest.misattributionIncidents !== "object"
        ) {

            state.minigameTasteTest.misattributionIncidents = {};
        }

        if (
            state.minigameTasteTest.judgmentsHandledWell ===
            undefined
        ) {

            state.minigameTasteTest.judgmentsHandledWell = 0;
        }

        if (
            state.minigameTasteTest.scbsEnabled ===
            undefined
        ) {

            state.minigameTasteTest.scbsEnabled = false;
        }

        if (
            state.minigameTasteTest.totalTastings ===
            undefined
        ) {

            state.minigameTasteTest.totalTastings = 0;
        }

        if (
            state.minigameTasteTest.currentOutfit ===
            undefined
        ) {

            state.minigameTasteTest.currentOutfit = "regular";
        }

        if (
            !state.minigameTasteTest.avoidedMakerKeys ||
            typeof state.minigameTasteTest.avoidedMakerKeys !== "object"
        ) {

            state.minigameTasteTest.avoidedMakerKeys = {};
        }

        if (
            !state.minigameTasteTest.avoidMakerGoalIds ||
            typeof state.minigameTasteTest.avoidMakerGoalIds !== "object"
        ) {

            state.minigameTasteTest.avoidMakerGoalIds = {};
        }

        if (
            state.minigameTasteTest.schemaVersion ===
            undefined
        ) {

            state.minigameTasteTest.schemaVersion =
                AIH.MinigameTasteTest.SCHEMA_VERSION;
        }

        if (
            state.minigameTasteTest.totalBatches ===
            undefined
        ) {

            state.minigameTasteTest.totalBatches = 0;
        }

        if (
            state.minigameTasteTest.nextBatchId ===
            undefined
        ) {

            state.minigameTasteTest.nextBatchId = 1;
        }

        return state.minigameTasteTest;
    };

    // =========================================================================
    // SCBS GATE
    // =========================================================================
    //
    // SCBS is an external event this module does not own - it only reads/
    // stores the flag. Default OFF. Whoever owns the SCBS event calls
    // setSCBSEnabled(true) when it fires; nothing here assumes when or why.
    //
    // =========================================================================

    AIH.MinigameTasteTest.isSCBSEnabled = function() {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return false;
        }

        return !!state.scbsEnabled;
    };

    AIH.MinigameTasteTest.setSCBSEnabled = function(enabled) {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return;
        }

        state.scbsEnabled = !!enabled;
    };

    // =========================================================================
    // VISUAL PRESENTATION (images / short videos) - PLACEHOLDERS
    // =========================================================================
    //
    // Wiring only - every path below is a placeholder naming convention,
    // not real art/video. This module does not decide WHICH outfit is
    // showing (same external-gate pattern as SCBS) - some other system
    // calls setCurrentOutfit() when that should change. Container variant
    // and expression are resolved per-call from context this module
    // already has (maker.containerType, evaluator response, palate
    // level), not hardcoded per source.
    //
    // OUTFITS (2): "regular", "tribal_garb" - a session-level costume
    // swap, not stage-specific.
    //
    // CONTAINER VARIANTS SHOWN (2): "bamboo", "sausage_casing" - only
    // matters for the presentation stage (the tube/casing being handed
    // through the hole); she's blindfolded for every stage after that,
    // so the container isn't shown again once tasting begins.
    //
    // EXPRESSIONS (9):
    //   neutral_composed      - baseline; also hedge_diplomatically /
    //                           decline_to_judge (measured, safe responses)
    //   grimacing_unaccustomed - low palate level (first tastes read as
    //                           strange/unpleasant)
    //   savoring_craving       - high palate level (developed taste, craves it)
    //   pleased_accept         - sample response: accept
    //   reluctant_uncertain     - sample response: reluctant_accept / partial
    //   displeased_reject       - sample response: reject
    //   proud_confident         - guess_confidently, correct identification
    //   embarrassed_flustered   - guess_confidently, misidentification backfire
    //   startled_drenched       - sample_hastily mishap (ferment spills over
    //                           her, blindfolded, per the earlier lore edit)
    //
    // STAGES that draw on the above: "presentation" (outfit + container),
    // "sampling" (outfit + palate-tied expression), "reaction" (outfit +
    // response-tied expression), "judgment" (outfit + judgment-tied
    // expression).
    //
    // Total unique placeholder assets needed: 2 outfits x (2 container
    // presentation images + 9 expression images) = 22. Each of the 22 can
    // be produced as either a still image or a short video - same 22-slot
    // manifest either way, this module doesn't need a separate count per
    // media type.
    //
    // =========================================================================

    AIH.MinigameTasteTest.OUTFITS = [
        "regular",
        "tribal_garb"
    ];

    AIH.MinigameTasteTest.EXPRESSIONS = [
        "neutral_composed",
        "grimacing_unaccustomed",
        "savoring_craving",
        "pleased_accept",
        "reluctant_uncertain",
        "displeased_reject",
        "proud_confident",
        "embarrassed_flustered",
        "startled_drenched"
    ];

    AIH.MinigameTasteTest.getCurrentOutfit = function() {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return "regular";
        }

        return state.currentOutfit || "regular";
    };

    AIH.MinigameTasteTest.setCurrentOutfit = function(outfit) {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return;
        }

        if (
            AIH.MinigameTasteTest.OUTFITS.indexOf(outfit) === -1
        ) {

            return;
        }

        state.currentOutfit = outfit;
    };

    /*
     * Placeholder asset resolver - builds a naming-convention path, not a
     * real file lookup. imagePath/videoPath are both provided so a scene
     * can pick either for the same slot.
     */
    AIH.MinigameTasteTest.resolveMediaAsset = function(stage, options) {

        var outfit;
        var expression;
        var containerType;
        var key;

        options = options || {};

        outfit =
            options.outfit ||
            AIH.MinigameTasteTest.getCurrentOutfit();

        expression =
            options.expression ||
            "neutral_composed";

        containerType =
            options.containerType ||
            "bamboo";

        key =
            stage === "presentation" ?
                "tastetest_presentation_" + outfit + "_" + containerType :
                "tastetest_" + stage + "_" + outfit + "_" + expression;

        return {

            key: key,

            imagePath:
                "img/pictures/tastetest/" + key + ".png",

            videoPath:
                "movies/tastetest/" + key + ".webm"
        };
    };

    /*
     * Palate level -> expression for the sampling stage. Three bands so
     * the "starts strange, becomes craved" arc has a visible middle
     * ground, without adding a third dedicated expression asset beyond
     * the shared neutral_composed.
     */
    AIH.MinigameTasteTest._palateExpression = function(palateLevel) {

        if (palateLevel < 0.25) {
            return "grimacing_unaccustomed";
        }

        if (palateLevel > 0.7) {
            return "savoring_craving";
        }

        return "neutral_composed";
    };

    /*
     * Evaluator response -> expression for the reaction stage.
     */
    AIH.MinigameTasteTest._responseExpression = function(response) {

        if (response === "accept") {
            return "pleased_accept";
        }

        if (
            response === "reluctant_accept" ||
            response === "partial"
        ) {

            return "reluctant_uncertain";
        }

        return "displeased_reject";
    };

    /*
     * Judgment action + outcome -> expression for the judgment stage.
     */
    AIH.MinigameTasteTest._judgmentExpression = function(action, backfire, mishapOccurred) {

        if (action === "guess_confidently") {

            return (backfire && backfire.triggered) ?
                "embarrassed_flustered" :
                "proud_confident";
        }

        if (action === "sample_hastily") {

            return mishapOccurred ?
                "startled_drenched" :
                "neutral_composed";
        }

        return "neutral_composed";
    };

    // =========================================================================
    // MAKER ARCHETYPES (for generated/anonymous batches)
    // =========================================================================
    //
    // Each archetype is a set of RANGES, not fixed values - a generated
    // maker randomizes within these every time. tanginess/thickness/
    // saltiness are flavor-profile flavor text only (they do not feed the
    // evaluator directly); quality is the "which one tastes better" axis
    // and also scales reward/survivalBenefit; publicity/authority are the
    // original design doc's pressure vocabulary and fold into embarrassment/
    // dignityCost/prideCost exactly per the mapping note Bathhouse already
    // established. Generated makers never get an AIH.Relationships entry -
    // there is no "the same anonymous stranger's cooking" to learn.
    //
    // =========================================================================

    AIH.MinigameTasteTest.MAKER_ARCHETYPES = {

        humble_farmstead: {

            label: "Humble Farmstead Batch",
            faction: "Townsfolk",
            containerType: "bamboo",

            tanginessRange: [0.3, 0.6],
            thicknessRange: [0.3, 0.6],
            saltinessRange: [0.2, 0.5],
            qualityRange: [0.2, 0.5],

            publicityRange: [0.0, 0.2],
            authorityRange: [0.0, 0.2],

            rewardRange: [15, 40]
        },

        nomad_caravan: {

            label: "Passing Caravan Batch",
            faction: "Nomads",
            containerType: "bamboo",

            tanginessRange: [0.6, 0.9],
            thicknessRange: [0.4, 0.8],
            saltinessRange: [0.3, 0.6],
            qualityRange: [0.4, 0.75],

            publicityRange: [0.1, 0.4],
            authorityRange: [0.1, 0.3],

            rewardRange: [25, 60]
        },

        guild_dairy: {

            label: "Guild-Standardized Batch",
            faction: "Merchants",
            containerType: "bamboo",

            tanginessRange: [0.4, 0.55],
            thicknessRange: [0.45, 0.6],
            saltinessRange: [0.35, 0.5],
            qualityRange: [0.5, 0.65],

            publicityRange: [0.3, 0.6],
            authorityRange: [0.3, 0.5],

            rewardRange: [30, 70]
        },

        noble_estate: {

            label: "Noble Estate Batch",
            faction: "Nobles",
            containerType: "bamboo",

            tanginessRange: [0.5, 0.7],
            thicknessRange: [0.5, 0.8],
            saltinessRange: [0.4, 0.7],
            qualityRange: [0.6, 0.9],

            publicityRange: [0.4, 0.8],
            authorityRange: [0.6, 0.9],

            rewardRange: [50, 120]
        },

        nomad_sausage_casing: {

            label: "Nomad Batch (Sausage Casing)",
            faction: "Nomads",
            containerType: "sausage_casing",

            /*
             * Too poor/nomadic to grow or buy bamboo tubes - same ferment,
             * hardened smoked sausage casing instead. Everything else
             * about it is the same as any other nomad batch.
             */
            tanginessRange: [0.6, 0.9],
            thicknessRange: [0.4, 0.8],
            saltinessRange: [0.3, 0.6],
            qualityRange: [0.4, 0.75],

            publicityRange: [0.1, 0.4],
            authorityRange: [0.1, 0.3],

            rewardRange: [25, 60]
        }

    };

    // =========================================================================
    // NAMED REGULARS (authored)
    // =========================================================================
    //
    // Fixed flavor signature (so identification is actually learnable) and
    // a stable pressure profile, plus an AIH.Relationships entry so
    // familiarity built up over repeat tastings persists and feeds back in
    // (see ensureRegularRelationship / _regularPressureOptions below).
    //
    // =========================================================================

    AIH.MinigameTasteTest.REGULARS = {

        ama_torgai: {

            npcId: "tastetest_ama_torgai",
            name: "Ama Torgai",
            faction: "Nomads",

            tanginess: 0.85,
            thickness: 0.55,
            saltiness: 0.4,
            quality: 0.8,

            publicity: 0.15,
            authority: 0.15,

            rewardRange: [30, 55]
        },

        master_ovett: {

            npcId: "tastetest_master_ovett",
            name: "Master Ovett",
            faction: "Merchants",

            tanginess: 0.45,
            thickness: 0.5,
            saltiness: 0.45,
            quality: 0.6,

            publicity: 0.45,
            authority: 0.4,

            rewardRange: [35, 65]
        },

        lady_cyrenne: {

            npcId: "tastetest_lady_cyrenne",
            name: "Lady Cyrenne",
            faction: "Nobles",

            tanginess: 0.6,
            thickness: 0.75,
            saltiness: 0.55,
            quality: 0.9,

            publicity: 0.6,
            authority: 0.85,

            rewardRange: [60, 110]
        }

    };

    // =========================================================================
    // NORMALIZE MAKER (generated vs regular -> common shape)
    // =========================================================================

    AIH.MinigameTasteTest._generateFromArchetype = function(archetypeKey) {

        var archetype;
        var key;

        key =
            archetypeKey ||
            AIH.MinigameTasteTest._pickRandom(
                Object.keys(
                    AIH.MinigameTasteTest.MAKER_ARCHETYPES
                )
            );

        archetype =
            AIH.MinigameTasteTest.MAKER_ARCHETYPES[key];

        if (!archetype) {
            return null;
        }

        return {

            kind: "generated",
            id:
                "anon_" +
                key +
                "_" +
                Date.now() +
                "_" +
                Math.floor(Math.random() * 10000),

            name: archetype.label,
            faction: archetype.faction,
            containerType:
                archetype.containerType || "bamboo",

            tanginess:
                AIH.MinigameTasteTest._randomBetween(
                    archetype.tanginessRange[0],
                    archetype.tanginessRange[1]
                ),

            thickness:
                AIH.MinigameTasteTest._randomBetween(
                    archetype.thicknessRange[0],
                    archetype.thicknessRange[1]
                ),

            saltiness:
                AIH.MinigameTasteTest._randomBetween(
                    archetype.saltinessRange[0],
                    archetype.saltinessRange[1]
                ),

            quality:
                AIH.MinigameTasteTest._randomBetween(
                    archetype.qualityRange[0],
                    archetype.qualityRange[1]
                ),

            publicity:
                AIH.MinigameTasteTest._randomBetween(
                    archetype.publicityRange[0],
                    archetype.publicityRange[1]
                ),

            authority:
                AIH.MinigameTasteTest._randomBetween(
                    archetype.authorityRange[0],
                    archetype.authorityRange[1]
                ),

            rewardRange:
                archetype.rewardRange.slice(),

            identifiable:
                false
        };
    };

    AIH.MinigameTasteTest._normalizeRegular = function(regularKey) {

        var regular;

        regular =
            AIH.MinigameTasteTest.REGULARS[regularKey];

        if (!regular) {
            return null;
        }

        return {

            kind: "regular",
            id: regular.npcId,
            regularKey: regularKey,
            name: regular.name,
            faction: regular.faction,
            containerType:
                regular.containerType || "bamboo",

            tanginess: regular.tanginess,
            thickness: regular.thickness,
            saltiness: regular.saltiness,
            quality: regular.quality,

            publicity: regular.publicity,
            authority: regular.authority,

            rewardRange:
                regular.rewardRange.slice(),

            identifiable:
                true
        };
    };

    // =========================================================================
    // REGULAR RELATIONSHIP TRACKING (pattern A)
    // =========================================================================
    //
    // This minigame's own relationship tracking, per handoff Section 7.
    // A regular's familiarity is read back in as domainPressure (a maker
    // she knows well feels less like an unpredictable stranger) and trust
    // as an attachmentDiscount (someone she trusts a little gets a little
    // slack on resistance). Calls straight into AIH.Relationships - no
    // second relationship system.
    //
    // =========================================================================

    AIH.MinigameTasteTest.ensureRegularRelationship = function(maker) {

        if (
            !maker ||
            maker.kind !== "regular"
        ) {

            return null;
        }

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.add
        ) {

            return null;
        }

        return AIH.Relationships.add(
            maker.id,
            maker.name,
            maker.faction
        );
    };

    AIH.MinigameTasteTest._regularPressureOptions = function(maker) {

        var relationship;
        var familiarity;
        var trust;

        if (
            !maker ||
            maker.kind !== "regular" ||
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.get
        ) {

            return {};
        }

        relationship =
            AIH.Relationships.get(maker.id);

        if (!relationship) {
            return {};
        }

        familiarity =
            Number(relationship.familiarity) || 0;

        trust =
            Number(relationship.trust) || 0;

        return {

            /*
             * familiarity is stored -100..100 on AIH.Relationships -
             * scaled down here, same gentle weighting Bathhouse uses: a
             * familiar maker's ferment should nudge things, not dominate
             * the evaluation.
             */
            domainPressure:
                familiarity * 0.12,

            attachmentDiscount:
                AIH.MinigameTasteTest._clamp01(
                    trust / 100
                ) * 0.10
        };
    };

    // =========================================================================
    // BATCH INTENSITY (pattern C)
    // =========================================================================
    //
    // A single continuous multiplier reused across every sample situation
    // in the batch, the misidentification backfire roll, and the mishap
    // roll - same role as Bathhouse's _confrontationIntensity. Driven by
    // three knobs that are all genuinely player/world-controlled
    // circumstances, never a direct trait edit:
    //   - batchSize: the player sending several tubes at once (harder to
    //     keep composure/track which is which, in rapid public succession)
    //   - publicity: how exposed the setting is
    //   - authority: how much a watching maker/observer's status raises
    //     the stakes of her reaction/verdict
    //
    // =========================================================================

    AIH.MinigameTasteTest._batchIntensity = function(batchSize, publicity, authority) {

        var sizeFactor;
        var publicityFactor;
        var authorityFactor;
        var effectiveSize;

        effectiveSize =
            Math.max(1, Number(batchSize) || 1);

        sizeFactor =
            1 +
            (
                Math.min(effectiveSize - 1, 7) *
                0.12
            );

        publicityFactor =
            1 +
            (AIH.MinigameTasteTest._clamp01(publicity) * 0.25);

        authorityFactor =
            1 +
            (AIH.MinigameTasteTest._clamp01(authority) * 0.2);

        return sizeFactor * publicityFactor * authorityFactor;
    };

    // =========================================================================
    // SITUATION BUILDING - THE SAMPLE ITSELF
    // =========================================================================
    //
    // Every tube she draws from generates exactly one of these, regardless
    // of maker source. The consumption method (per lore, drawn out through
    // the tube's single mouth-hole, traditionally seated on the ground) is
    // what grounds embarrassment/modestyCost/dignityCost here - not
    // anything about who the maker is. reward and survivalBenefit are
    // gated by SCBS + this specific batch's quality (pattern from the
    // handoff's own "reward, raw number, log-scaled internally" note).
    //
    // =========================================================================

    /*
     * She unquestionably prefers the sausage-casing variety from the
     * start - this is a flat, always-on preference, not something that
     * grows with palate/technique like Sections 6 above.
     */
    AIH.MinigameTasteTest.SAUSAGE_CASING_PREFERENCE_MULTIPLIER = 1.3;

    AIH.MinigameTasteTest.buildSampleSituation = function(maker, batchContext) {

        var reward;
        var survivalBenefit;
        var intensity;
        var raw;

        if (!maker) {
            return null;
        }

        batchContext =
            batchContext ||
            {
                size: 1,
                publicity: maker.publicity,
                authority: maker.authority
            };

        intensity =
            AIH.MinigameTasteTest._batchIntensity(
                batchContext.size,
                batchContext.publicity !== undefined ?
                    batchContext.publicity : maker.publicity,
                batchContext.authority !== undefined ?
                    batchContext.authority : maker.authority
            );

        reward =
            AIH.MinigameTasteTest._randomBetween(
                maker.rewardRange[0],
                maker.rewardRange[1]
            ) *
            (0.6 + (maker.quality * 0.8)) *
            (
                0.5 +
                (AIH.MinigameTasteTest._palateLevel() * 0.9)
            ) *
            (
                1 +
                (
                    AIH.MinigameTasteTest._extractionTechniqueLevel() *
                    AIH.MinigameTasteTest.EXTRACTION_TECHNIQUE_YIELD_BONUS
                )
            ) *
            (
                maker.containerType === "sausage_casing" ?
                    AIH.MinigameTasteTest.SAUSAGE_CASING_PREFERENCE_MULTIPLIER :
                    1
            );

        survivalBenefit =
            AIH.MinigameTasteTest.isSCBSEnabled() ?
                AIH.MinigameTasteTest._clamp01(maker.quality) * 0.8 :
                0;

        raw = {

            id:
                "tastetest_sample_" +
                maker.id +
                "_" +
                Date.now() +
                "_" +
                Math.floor(Math.random() * 10000),

            type: "taste_test_sample",
            category: "taste_testing",

            description:
                "She draws a sample from " +
                maker.name +
                "'s bamboo tube, the way custom demands.",

            severity:
                intensity > 1.5 ?
                    "medium" :
                    "normal",

            reward:
                reward,

            danger: 0,

            /*
             * publicity folds into embarrassment; batch size/authority
             * (via intensity) scale the whole thing up together, same
             * mapping note Bathhouse's buildSituation already documents.
             */
            embarrassment:
                AIH.MinigameTasteTest._clamp01(
                    0.15 * intensity
                ),

            dignityCost:
                AIH.MinigameTasteTest._clamp01(
                    0.12 * intensity
                ),

            freedomCost:
                0.08,

            modestyCost:
                AIH.MinigameTasteTest._clamp01(
                    0.2 * intensity
                ),

            prideCost:
                AIH.MinigameTasteTest._clamp01(
                    0.1 * intensity
                ),

            survivalBenefit:
                survivalBenefit,

            combatAdvantage: 0
        };

        return AIH.PressureEvaluator.normalizeSituation(raw);
    };

    // =========================================================================
    // SHARED BOUNDARY-OUTCOME REPORTER
    // =========================================================================
    //
    // Mirrors AIH_Minigame_Bathhouse._reportBoundaryOutcome exactly, with
    // one deliberate change (pattern F, per direction given): a barely-
    // grudging reluctant_accept (score <= 0.20) is NOT written off to
    // zero - it still nudges the drift engine, just at a reduced fraction
    // of the intended magnitude, rather than counting fully OR not at all.
    //
    // =========================================================================

    AIH.MinigameTasteTest.WEAK_RELUCTANT_ACCEPT_FRACTION = 0.25;

    AIH.MinigameTasteTest._reportBoundaryOutcome = function(
        trait,
        direction,
        evaluation,
        magnitude,
        reason,
        rewardedOverride
    ) {

        var rewarded;
        var finalMagnitude;

        if (
            !trait ||
            !direction ||
            typeof AIH.PersonalityDrift === "undefined" ||
            !AIH.PersonalityDrift.reinforce
        ) {

            return null;
        }

        finalMagnitude =
            magnitude;

        if (typeof rewardedOverride === "boolean") {

            rewarded = rewardedOverride;

        } else if (
            evaluation.response === "accept" ||
            evaluation.response === "partial"
        ) {

            rewarded = true;

            if (evaluation.response === "partial") {

                finalMagnitude =
                    finalMagnitude * 0.5;
            }

        } else if (
            evaluation.response === "reluctant_accept" &&
            evaluation.score > 0.20
        ) {

            rewarded = true;

        } else if (
            evaluation.response === "reluctant_accept"
        ) {

            /*
             * Barely cleared the "went well" bar or didn't clear it at
             * all - still counts, at reduced weight, rather than either
             * full credit or none. This is the F change from Bathhouse's
             * behavior, applied deliberately here rather than in Service.
             */
            rewarded = true;

            finalMagnitude =
                finalMagnitude *
                AIH.MinigameTasteTest.WEAK_RELUCTANT_ACCEPT_FRACTION;

        } else {

            rewarded = false;
        }

        return AIH.PersonalityDrift.reinforce(
            trait,
            direction,
            {
                rewarded: rewarded,
                magnitude:
                    AIH.MinigameTasteTest._clamp01(
                        finalMagnitude
                    ),
                reason: reason
            }
        );
    };

    // =========================================================================
    // RESOLVE A SINGLE SAMPLE
    // =========================================================================

    AIH.MinigameTasteTest._resolveSample = function(maker, batchContext) {

        var situation;
        var options;
        var evaluation;
        var driftResult;
        var media;

        situation =
            AIH.MinigameTasteTest.buildSampleSituation(
                maker,
                batchContext
            );

        if (!situation) {
            return null;
        }

        options =
            AIH.MinigameTasteTest._regularPressureOptions(maker);

        evaluation =
            AIH.PressureEvaluator.evaluate(
                situation,
                options
            );

        driftResult =
            AIH.MinigameTasteTest._reportBoundaryOutcome(
                "inhibition",
                "decrease",
                evaluation,
                AIH.MinigameTasteTest._clamp01(
                    situation.modestyCost ||
                    situation.embarrassment ||
                    0.2
                ),
                "tasted a sample from " +
                    maker.name +
                    " (" +
                    evaluation.response +
                    ")"
            );

        media = {

            presentation:
                AIH.MinigameTasteTest.resolveMediaAsset(
                    "presentation",
                    { containerType: maker.containerType }
                ),

            sampling:
                AIH.MinigameTasteTest.resolveMediaAsset(
                    "sampling",
                    {
                        expression:
                            AIH.MinigameTasteTest._palateExpression(
                                AIH.MinigameTasteTest._palateLevel()
                            )
                    }
                ),

            reaction:
                AIH.MinigameTasteTest.resolveMediaAsset(
                    "reaction",
                    {
                        expression:
                            AIH.MinigameTasteTest._responseExpression(
                                evaluation.response
                            )
                    }
                )
        };

        return {

            makerId: maker.id,
            makerName: maker.name,
            description:
                situation.description,

            response:
                evaluation.response,

            score:
                evaluation.score,

            reward:
                situation.reward,

            survivalBenefit:
                situation.survivalBenefit,

            quality:
                maker.quality,

            evaluation: evaluation,

            driftResult: driftResult,

            media: media
        };
    };

    // =========================================================================
    // IDENTIFICATION
    // =========================================================================
    //
    // Only regulars (fixed signatures) ever build identification
    // confidence - a generated/anonymous batch has nothing consistent to
    // learn. First taste of any given regular is unwinnable by design
    // (confidence starts at 0). This is this module's own memory, kept in
    // its own state container - it does not reach into AIH.Memory.
    //
    // =========================================================================

    AIH.MinigameTasteTest.IDENTIFICATION_CONFIDENCE_PER_TASTING = 0.15;

    AIH.MinigameTasteTest.IDENTIFICATION_CONFIDENCE_CAP = 0.85;

    AIH.MinigameTasteTest._signatureRecord = function(maker) {

        var state;

        if (
            !maker ||
            maker.kind !== "regular"
        ) {

            return null;
        }

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return null;
        }

        if (!state.makerSignatureMemory[maker.regularKey]) {

            state.makerSignatureMemory[maker.regularKey] = {

                timesTasted: 0,
                correctGuesses: 0
            };
        }

        return state.makerSignatureMemory[maker.regularKey];
    };

    AIH.MinigameTasteTest._identificationConfidence = function(maker) {

        var record;

        record =
            AIH.MinigameTasteTest._signatureRecord(maker);

        if (!record) {
            return 0;
        }

        return Math.min(
            AIH.MinigameTasteTest.IDENTIFICATION_CONFIDENCE_CAP,
            record.timesTasted *
                AIH.MinigameTasteTest.IDENTIFICATION_CONFIDENCE_PER_TASTING
        );
    };

    AIH.MinigameTasteTest._recordTasting = function(maker) {

        var record;

        record =
            AIH.MinigameTasteTest._signatureRecord(maker);

        if (!record) {
            return;
        }

        record.timesTasted += 1;
    };

    // =========================================================================
    // SHAPE RECOGNITION (by touch, blindfolded)
    // =========================================================================
    //
    // Distinct from _identificationConfidence above (which is a taste
    // signature, used during judgment). This is the container itself -
    // after enough tastings of a given regular, she can recognize the
    // shape/feel of their specific tube or casing by touch alone, even
    // blindfolded. Only regulars ever build this (same reasoning as
    // taste identification - nothing persists for an anonymous batch).
    //
    // Having the shape memorized isn't enough on its own to act on it -
    // if her current confidence is low, she second-guesses her own
    // recognition and won't trust it enough to actually welcome or avoid
    // a maker based on shape alone. _canActOnShapeRecognition is the
    // gate that combines both.
    //
    // =========================================================================

    AIH.MinigameTasteTest.SHAPE_RECOGNITION_TASTING_THRESHOLD = 3;

    AIH.MinigameTasteTest.SHAPE_RECOGNITION_CONFIDENCE_THRESHOLD = 0.4;

    AIH.MinigameTasteTest._hasShapeMemory = function(maker) {

        var record;

        if (
            !maker ||
            maker.kind !== "regular"
        ) {

            return false;
        }

        record =
            AIH.MinigameTasteTest._signatureRecord(maker);

        if (!record) {
            return false;
        }

        return (
            record.timesTasted >=
            AIH.MinigameTasteTest.SHAPE_RECOGNITION_TASTING_THRESHOLD
        );
    };

    AIH.MinigameTasteTest._currentConfidenceLevel = function() {

        if (
            typeof AIH.Emotions !== "undefined" &&
            AIH.Emotions.getValue
        ) {

            return AIH.MinigameTasteTest._clamp01(
                AIH.Emotions.getValue("confidence")
            );
        }

        return 0.5;
    };

    AIH.MinigameTasteTest._canActOnShapeRecognition = function(maker) {

        return (
            AIH.MinigameTasteTest._hasShapeMemory(maker) &&
            AIH.MinigameTasteTest._currentConfidenceLevel() >=
                AIH.MinigameTasteTest.SHAPE_RECOGNITION_CONFIDENCE_THRESHOLD
        );
    };

    // =========================================================================
    // PALATE / EXTRACTION SKILL DEVELOPMENT
    // =========================================================================
    //
    // Global (not per-maker) - like the real fermented dairy this is based
    // on, it's meant to taste strange or unpleasant at first and become
    // something she comes to enjoy and even crave as her palate adjusts,
    // and she gets more practiced at drawing it out of the tube cleanly.
    // Grows with total tastings, regardless of source (generated or
    // regular).
    //
    // =========================================================================

    AIH.MinigameTasteTest.PALATE_GROWTH_PER_TASTING = 0.04;

    AIH.MinigameTasteTest._palateLevel = function() {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return 0;
        }

        return Math.min(
            1,
            (state.totalTastings || 0) *
                AIH.MinigameTasteTest.PALATE_GROWTH_PER_TASTING
        );
    };

    // -------------------------------------------------------------------
    // Extraction technique (licking before drawing): licking first builds
    // up saliva, and saliva is what breaks down the bonds holding the
    // ferment in the tube - so licking before drinking extracts more of
    // it, up to a point (capped, same as palate). She learns this
    // technique over time by inference, not instruction - same growth
    // driver as palate (total tastings), tracked as its own skill level
    // since it's a distinct thing to learn from taste tolerance.
    // -------------------------------------------------------------------

    AIH.MinigameTasteTest.EXTRACTION_TECHNIQUE_GROWTH_PER_TASTING = 0.05;

    AIH.MinigameTasteTest.EXTRACTION_TECHNIQUE_YIELD_BONUS = 0.4;

    AIH.MinigameTasteTest._extractionTechniqueLevel = function() {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return 0;
        }

        return Math.min(
            1,
            (state.totalTastings || 0) *
                AIH.MinigameTasteTest.EXTRACTION_TECHNIQUE_GROWTH_PER_TASTING
        );
    };

    AIH.MinigameTasteTest._recordGlobalTasting = function() {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return;
        }

        state.totalTastings =
            (state.totalTastings || 0) + 1;
    };

    /*
     * A single attempt to name who made a given sample. confidenceBefore
     * is captured BEFORE this tasting's own _recordTasting() call, so the
     * very first taste of a maker genuinely rolls against 0 confidence -
     * per the "no way to win the first time" requirement.
     */
    AIH.MinigameTasteTest._attemptIdentification = function(maker) {

        var confidence;
        var record;
        var correct;

        confidence =
            AIH.MinigameTasteTest._identificationConfidence(maker);

        correct =
            Math.random() < confidence;

        if (correct) {

            record =
                AIH.MinigameTasteTest._signatureRecord(maker);

            if (record) {
                record.correctGuesses += 1;
            }
        }

        return {

            confidence: confidence,
            correct: correct,

            identifiable:
                !!(maker && maker.kind === "regular")
        };
    };

    // =========================================================================
    // JUDGMENT RESOLUTION (chooseBest across candidate responses) - pattern D
    // =========================================================================
    //
    // Only triggers when identification is genuinely uncertain - i.e. an
    // identifiable maker (a regular) whose confidence is neither 0 (no
    // basis to say anything at all) nor high enough to be an easy call.
    // This mirrors Bathhouse's confrontation trigger ("after two
    // refusals, it's no longer a request she can simply decline again"):
    // here, it's "the call is genuinely hard, so how she HANDLES making
    // it becomes its own decision," not a fixed per-request script.
    //
    // Four candidates, same one-evaluator-per-candidate pattern as
    // Bathhouse's _chooseBest, with two genuinely different KINDS of risk
    // (not just a flat risk ladder):
    //
    //   guess_confidently     - names a maker outright. Safe to execute,
    //                          but risks a SOCIAL backfire if wrong: a
    //                          public misidentification follow-up
    //                          situation (maker/onlookers embarrassed or
    //                          insulted on her behalf).
    //
    //   hedge_diplomatically   - describes the flavor without committing
    //                          to a name. Safe, no roll, but lower reward/
    //                          credibility and costs a little
    //                          approval-seeking pressure to word kindly.
    //
    //   decline_to_judge       - tastes it but declines to rate or guess
    //                          at all. Safest for pride/dignity, small
    //                          flat cost, no boundary trait touched at
    //                          all - mirrors Bathhouse's call_for_help.
    //
    //   sample_hastily         - rushes through the whole batch quickly to
    //                          be done with it. Genuinely risky in a
    //                          DIFFERENT kind of way: since she's
    //                          blindfolded for tasting, a fumble doesn't
    //                          lose or mix up a tube - it means the
    //                          ferment ends up spilled over her instead
    //                          of in her mouth. Not a social escalation,
    //                          a procedural one.
    //
    // =========================================================================

    AIH.MinigameTasteTest.RESPONSE_RANK = {
        accept: 3,
        reluctant_accept: 2,
        partial: 1,
        reject: 0
    };

    AIH.MinigameTasteTest.MISIDENTIFICATION_BACKFIRE_BASE_CHANCE = 0.30;

    AIH.MinigameTasteTest.MISHAP_BASE_CHANCE = 0.30;

    AIH.MinigameTasteTest._chooseBest = function(candidates) {

        var best;
        var bestRank;
        var i;
        var candidate;
        var evaluation;
        var rank;

        best = null;
        bestRank = -1;

        for (
            i = 0;
            i < candidates.length;
            i++
        ) {

            candidate =
                candidates[i];

            evaluation =
                AIH.PressureEvaluator.evaluate(
                    candidate.situation,
                    candidate.options || {}
                );

            rank =
                (
                    AIH.MinigameTasteTest.RESPONSE_RANK[
                        evaluation.response
                    ] || 0
                ) *
                10 +
                evaluation.score;

            if (rank > bestRank) {

                bestRank = rank;

                best = {
                    action: candidate.action,
                    evaluation: evaluation,
                    situation: candidate.situation,
                    meta: candidate.meta || {}
                };
            }
        }

        return best;
    };

    AIH.MinigameTasteTest._buildJudgmentCandidates = function(
        maker,
        batchContext,
        identification
    ) {

        var intensity;
        var options;
        var candidates;

        intensity =
            AIH.MinigameTasteTest._batchIntensity(
                batchContext.size,
                maker.publicity,
                maker.authority
            );

        options =
            AIH.MinigameTasteTest._regularPressureOptions(maker);

        candidates = [];

        // --- guess_confidently (the socially risky one) -----------------

        candidates.push({

            action: "guess_confidently",

            options: options,

            meta: {
                driftTrait: "attentionSeeking",
                driftDirection: "increase"
            },

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id:
                        "tastetest_judgment_confident_" +
                        maker.id +
                        "_" +
                        Date.now(),

                    type: "taste_test_judgment",
                    category: "taste_testing",

                    description:
                        "She names " +
                        maker.name +
                        " as the maker, in front of everyone.",

                    severity:
                        intensity > 1.6 ?
                            "medium" :
                            "normal",

                    reward:
                        30 * (1 + (identification.confidence * 0.5)),

                    danger: 0,

                    embarrassment:
                        AIH.MinigameTasteTest._clamp01(0.1 * intensity),

                    dignityCost:
                        AIH.MinigameTasteTest._clamp01(0.15 * intensity),

                    freedomCost: 0,

                    modestyCost: 0,

                    prideCost:
                        AIH.MinigameTasteTest._clamp01(0.12 * intensity),

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        // --- hedge_diplomatically (safe, no roll) ------------------------

        candidates.push({

            action: "hedge_diplomatically",

            options: options,

            meta: {
                driftTrait: "approvalSeeking",
                driftDirection: "increase"
            },

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id:
                        "tastetest_judgment_hedge_" +
                        maker.id +
                        "_" +
                        Date.now(),

                    type: "taste_test_judgment",
                    category: "taste_testing",

                    description:
                        "She describes the flavor carefully without " +
                        "committing to whose it is.",

                    severity: "normal",

                    reward: 15,

                    danger: 0,

                    embarrassment:
                        AIH.MinigameTasteTest._clamp01(0.04 * intensity),

                    dignityCost: 0,

                    freedomCost: 0,

                    modestyCost: 0,

                    prideCost:
                        AIH.MinigameTasteTest._clamp01(0.05 * intensity),

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        // --- decline_to_judge (safe, no boundary trait touched) ----------

        candidates.push({

            action: "decline_to_judge",

            options: options,

            meta: {
                driftTrait: null,
                driftDirection: null
            },

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id:
                        "tastetest_judgment_decline_" +
                        maker.id +
                        "_" +
                        Date.now(),

                    type: "taste_test_judgment",
                    category: "taste_testing",

                    description:
                        "She tastes it, but declines to rate or guess.",

                    severity: "normal",

                    reward: 8,

                    danger: 0,

                    embarrassment: 0,

                    dignityCost:
                        AIH.MinigameTasteTest._clamp01(0.06 * intensity),

                    freedomCost: 0,

                    modestyCost: 0,

                    prideCost:
                        AIH.MinigameTasteTest._clamp01(0.08 * intensity),

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        // --- sample_hastily (the procedurally/physically risky one) ------

        candidates.push({

            action: "sample_hastily",

            options: options,

            meta: {
                driftTrait: null,
                driftDirection: null
            },

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id:
                        "tastetest_judgment_hasty_" +
                        maker.id +
                        "_" +
                        Date.now(),

                    type: "taste_test_judgment",
                    category: "taste_testing",

                    description:
                        "She rushes through the batch quickly to be " +
                        "done with it.",

                    severity:
                        intensity > 1.6 ?
                            "medium" :
                            "normal",

                    reward: 20,

                    danger:
                        AIH.MinigameTasteTest._clamp01(0.15 * intensity),

                    embarrassment:
                        AIH.MinigameTasteTest._clamp01(0.08 * intensity),

                    dignityCost:
                        AIH.MinigameTasteTest._clamp01(0.1 * intensity),

                    freedomCost: 0,

                    modestyCost:
                        AIH.MinigameTasteTest._clamp01(0.05 * intensity),

                    prideCost:
                        AIH.MinigameTasteTest._clamp01(0.1 * intensity),

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        return candidates;
    };

    /*
     * The guess_confidently backfire: chosen, seemed fine, but if the
     * guess was actually WRONG (identification.correct === false), a
     * percentage chance (scaled by intensity, same shape as Bathhouse's
     * CONFRONTATION_BACKFIRE_BASE_CHANCE) turns it into a follow-up
     * misidentification situation instead of a clean resolution.
     */
    AIH.MinigameTasteTest._rollMisidentificationBackfire = function(
        maker,
        batchContext,
        identification
    ) {

        var intensity;
        var chance;
        var heldGround;

        if (identification.correct) {

            return {
                triggered: false,
                heldGround: true
            };
        }

        intensity =
            AIH.MinigameTasteTest._batchIntensity(
                batchContext.size,
                maker.publicity,
                maker.authority
            );

        chance =
            AIH.MinigameTasteTest._clamp01(
                AIH.MinigameTasteTest.MISIDENTIFICATION_BACKFIRE_BASE_CHANCE *
                intensity
            );

        heldGround =
            Math.random() >= chance;

        return {
            triggered: !heldGround,
            heldGround: heldGround
        };
    };

    /*
     * The sample_hastily mishap: a chance (same shape) of fumbling a tube
     * while blindfolded - the ferment ends up spilled over her instead of
     * lost or mixed up - a distinct KIND of downside (procedural/physical)
     * from the backfire above (social).
     */
    AIH.MinigameTasteTest._rollMishap = function(maker, batchContext) {

        var intensity;
        var chance;

        intensity =
            AIH.MinigameTasteTest._batchIntensity(
                batchContext.size,
                maker.publicity,
                maker.authority
            );

        chance =
            AIH.MinigameTasteTest._clamp01(
                AIH.MinigameTasteTest.MISHAP_BASE_CHANCE *
                intensity *
                (
                    1 -
                    (AIH.MinigameTasteTest._palateLevel() * 0.6)
                )
            );

        return Math.random() < chance;
    };

    AIH.MinigameTasteTest._resolveJudgment = function(maker, batchContext, identification) {

        var candidates;
        var winner;
        var driftResult;
        var backfire;
        var mishapOccurred;
        var result;

        candidates =
            AIH.MinigameTasteTest._buildJudgmentCandidates(
                maker,
                batchContext,
                identification
            );

        winner =
            AIH.MinigameTasteTest._chooseBest(candidates);

        if (!winner) {
            return null;
        }

        driftResult = null;
        backfire = null;
        mishapOccurred = false;

        if (winner.meta.driftTrait) {

            driftResult =
                AIH.MinigameTasteTest._reportBoundaryOutcome(
                    winner.meta.driftTrait,
                    winner.meta.driftDirection,
                    winner.evaluation,
                    AIH.MinigameTasteTest._clamp01(
                        winner.situation.embarrassment ||
                        winner.situation.prideCost ||
                        0.15
                    ),
                    "taste test judgment '" +
                        winner.action +
                        "' regarding " +
                        maker.name +
                        " (" +
                        winner.evaluation.response +
                        ")"
                );
        }

        if (winner.action === "guess_confidently") {

            backfire =
                AIH.MinigameTasteTest._rollMisidentificationBackfire(
                    maker,
                    batchContext,
                    identification
                );

        } else if (winner.action === "sample_hastily") {

            mishapOccurred =
                AIH.MinigameTasteTest._rollMishap(maker, batchContext);
        }

        result = {

            chosenAction: winner.action,
            response: winner.evaluation.response,
            score: winner.evaluation.score,

            identification: identification,

            backfire: backfire,
            mishapOccurred: mishapOccurred,

            driftResult: driftResult,

            media:
                AIH.MinigameTasteTest.resolveMediaAsset(
                    "judgment",
                    {
                        expression:
                            AIH.MinigameTasteTest._judgmentExpression(
                                winner.action,
                                backfire,
                                mishapOccurred
                            )
                    }
                ),

            wentWell:
                (
                    winner.evaluation.response === "accept" ||
                    winner.evaluation.response === "reluctant_accept"
                ) &&
                !(backfire && backfire.triggered) &&
                !mishapOccurred
        };

        return result;
    };

    // =========================================================================
    // OVERWHELM ESCALATION (grouping avoided makers together) - learned
    // from AIH_Minigame_Bathhouse.js's confrontation system
    // =========================================================================
    //
    // The player can already make a single batch harder via batchSize
    // (more tubes at once - see _batchIntensity). This is the companion
    // mechanic on the AVOIDANCE side: whenever shape recognition lets her
    // skip a regular's tube (see the avoidedViaShapeRecognition branch in
    // resolveBatch), that maker's key is tracked in
    // state.avoidedMakerKeys. The player can then deliberately group some
    // or all of her currently-avoided makers and force them on her at
    // once via forceOverwhelmEscalation() - the same "player manipulates
    // circumstance, evaluator + her real state decide the outcome"
    // rule as everything else, just applied to a GROUP instead of one
    // candidate maker.
    //
    // Same chooseBest-across-candidates pattern Bathhouse's confrontation
    // system uses, reused here with genuinely different outcomes rather
    // than a flat risk ladder:
    //
    //   hold_firm                 - she manages to keep avoiding all of
    //                              them despite the volume. Safest, no
    //                              tasting happens, no drift.
    //
    //   overwhelmed_partial        - sheer volume overwhelms her enough
    //                              that she gives in on SOME (not all) of
    //                              the grouped makers despite meaning to
    //                              avoid them. Their avoid_maker goals are
    //                              completed for the ones she gave in on.
    //
    //   overwhelmed_full           - she gives in on ALL of them. Same
    //                              goal-completion, for every maker in
    //                              the group.
    //
    //   genuine_multiple_preference - NOT a case of being overwhelmed -
    //                              she discovers, in this moment, that
    //                              being sought out by several at once
    //                              feels appreciated/wanted rather than
    //                              exposing, and comes to prefer it. Per
    //                              Section 8 ("she can discover she likes
    //                              something"), this is intrinsic
    //                              enjoyment, reported with
    //                              rewarded:true unconditionally
    //                              (rewardedOverride), same as Bathhouse
    //                              does for its own definite, not-tier-
    //                              dependent events. All grouped makers'
    //                              avoid_maker goals are completed here
    //                              too - she isn't avoiding any of them
    //                              anymore, she's actively drawn to this.
    //
    // =========================================================================

    AIH.MinigameTasteTest._overwhelmIntensity = function(groupSize) {

        var effectiveSize;

        effectiveSize =
            Math.max(1, Number(groupSize) || 1);

        return (
            1 +
            (Math.min(effectiveSize - 1, 7) * 0.15)
        );
    };

    AIH.MinigameTasteTest._buildOverwhelmCandidates = function(makers) {

        var intensity;
        var avgReward;
        var avgQuality;
        var candidates;

        intensity =
            AIH.MinigameTasteTest._overwhelmIntensity(makers.length);

        avgReward =
            makers.reduce(
                function(sum, m) {
                    return sum + ((m.rewardRange[0] + m.rewardRange[1]) / 2);
                },
                0
            ) / makers.length;

        avgQuality =
            makers.reduce(
                function(sum, m) {
                    return sum + (m.quality || 0);
                },
                0
            ) / makers.length;

        candidates = [];

        // --- hold_firm ----------------------------------------------------
        candidates.push({

            action: "hold_firm",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: "tastetest_overwhelm_hold_" + Date.now(),
                    type: "taste_test_overwhelm",
                    category: "taste_testing",

                    description:
                        "All " +
                        makers.length +
                        " of the makers she's been avoiding are " +
                        "presented to her at once.",

                    severity:
                        intensity > 1.6 ? "medium" : "normal",

                    reward: 0,
                    danger: 0,

                    embarrassment:
                        AIH.MinigameTasteTest._clamp01(0.15 * intensity),

                    dignityCost:
                        AIH.MinigameTasteTest._clamp01(0.10 * intensity),

                    freedomCost:
                        AIH.MinigameTasteTest._clamp01(0.10 * intensity),

                    modestyCost: 0,

                    prideCost:
                        AIH.MinigameTasteTest._clamp01(0.05 * intensity),

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        // --- overwhelmed_partial ------------------------------------------
        candidates.push({

            action: "overwhelmed_partial",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: "tastetest_overwhelm_partial_" + Date.now(),
                    type: "taste_test_overwhelm",
                    category: "taste_testing",

                    description:
                        "The sheer volume wears down her resolve enough " +
                        "to give in on some of them.",

                    severity: "medium",

                    reward:
                        avgReward * (0.5 + (avgQuality * 0.5)),

                    danger: 0,

                    embarrassment:
                        AIH.MinigameTasteTest._clamp01(0.30 * intensity),

                    dignityCost:
                        AIH.MinigameTasteTest._clamp01(0.20 * intensity),

                    freedomCost:
                        AIH.MinigameTasteTest._clamp01(0.15 * intensity),

                    modestyCost:
                        AIH.MinigameTasteTest._clamp01(0.25 * intensity),

                    prideCost:
                        AIH.MinigameTasteTest._clamp01(0.15 * intensity),

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        // --- overwhelmed_full ----------------------------------------------
        candidates.push({

            action: "overwhelmed_full",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: "tastetest_overwhelm_full_" + Date.now(),
                    type: "taste_test_overwhelm",
                    category: "taste_testing",

                    description:
                        "She gives in and lets all of them have their " +
                        "turn.",

                    severity:
                        intensity > 1.6 ? "rare" : "medium",

                    reward:
                        avgReward * (0.7 + (avgQuality * 0.6)) *
                        Math.min(makers.length, 4),

                    danger: 0,

                    embarrassment:
                        AIH.MinigameTasteTest._clamp01(0.45 * intensity),

                    dignityCost:
                        AIH.MinigameTasteTest._clamp01(0.30 * intensity),

                    freedomCost:
                        AIH.MinigameTasteTest._clamp01(0.20 * intensity),

                    modestyCost:
                        AIH.MinigameTasteTest._clamp01(0.40 * intensity),

                    prideCost:
                        AIH.MinigameTasteTest._clamp01(0.20 * intensity),

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        // --- genuine_multiple_preference (discovery, not concession) -----
        candidates.push({

            action: "genuine_multiple_preference",

            situation:
                AIH.PressureEvaluator.normalizeSituation({

                    id: "tastetest_overwhelm_preference_" + Date.now(),
                    type: "taste_test_overwhelm",
                    category: "taste_testing",

                    description:
                        "Being sought out by several of them at once " +
                        "feels less exposing than she expected - more " +
                        "like being wanted.",

                    severity: "medium",

                    reward:
                        avgReward * (0.9 + (avgQuality * 0.6)) *
                        Math.min(makers.length, 4),

                    danger: 0,

                    /*
                     * Deliberately lower embarrassment/dignityCost/
                     * prideCost than the overwhelmed variants - this
                     * isn't her defenses failing, it's a different read
                     * on the same situation, so the situation itself
                     * should cost her less.
                     */
                    embarrassment:
                        AIH.MinigameTasteTest._clamp01(0.15 * intensity),

                    dignityCost:
                        AIH.MinigameTasteTest._clamp01(0.05 * intensity),

                    freedomCost: 0,

                    modestyCost:
                        AIH.MinigameTasteTest._clamp01(0.15 * intensity),

                    prideCost: 0,

                    survivalBenefit: 0,
                    combatAdvantage: 0
                })
        });

        return candidates;
    };

    AIH.MinigameTasteTest._completeAvoidMakerGoal = function(maker, note) {

        var state;
        var goalId;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return;
        }

        goalId =
            state.avoidMakerGoalIds[maker.regularKey];

        if (
            goalId &&
            typeof AIH.Goals !== "undefined" &&
            AIH.Goals.updateProgress
        ) {

            AIH.Goals.updateProgress(goalId, 1, note);
        }

        delete state.avoidMakerGoalIds[maker.regularKey];
        delete state.avoidedMakerKeys[maker.regularKey];
    };

    AIH.MinigameTasteTest._resolveOverwhelmEscalation = function(makers) {

        var candidates;
        var winner;
        var driftResult;
        var tastedSamples;
        var i;
        var subset;

        if (
            !Array.isArray(makers) ||
            makers.length === 0
        ) {

            return null;
        }

        candidates =
            AIH.MinigameTasteTest._buildOverwhelmCandidates(makers);

        winner =
            AIH.MinigameTasteTest._chooseBest(candidates);

        if (!winner) {
            return null;
        }

        driftResult = null;
        tastedSamples = [];

        if (winner.action === "hold_firm") {

            // no tasting, no drift, no goal changes - she held her ground

        } else if (
            winner.action === "overwhelmed_partial" ||
            winner.action === "overwhelmed_full"
        ) {

            subset =
                winner.action === "overwhelmed_full" ?
                    makers :
                    makers.slice(
                        0,
                        Math.max(1, Math.ceil(makers.length / 2))
                    );

            driftResult =
                AIH.MinigameTasteTest._reportBoundaryOutcome(
                    "inhibition",
                    "decrease",
                    winner.evaluation,
                    AIH.MinigameTasteTest._clamp01(
                        winner.situation.modestyCost || 0.3
                    ),
                    "overwhelmed by " +
                        makers.length +
                        " avoided makers grouped together (" +
                        winner.action +
                        ")",
                    true
                );

            for (
                i = 0;
                i < subset.length;
                i++
            ) {

                tastedSamples.push(
                    AIH.MinigameTasteTest._resolveSample(
                        subset[i],
                        {
                            size: makers.length,
                            publicity: subset[i].publicity,
                            authority: subset[i].authority
                        }
                    )
                );

                AIH.MinigameTasteTest._completeAvoidMakerGoal(
                    subset[i],
                    "gave in after being overwhelmed by a grouped batch"
                );
            }

        } else if (winner.action === "genuine_multiple_preference") {

            driftResult =
                AIH.MinigameTasteTest._reportBoundaryOutcome(
                    "attentionSeeking",
                    "increase",
                    winner.evaluation,
                    0.4,
                    "discovered she genuinely likes being sought out by " +
                        makers.length +
                        " makers at once",
                    true
                );

            for (
                i = 0;
                i < makers.length;
                i++
            ) {

                tastedSamples.push(
                    AIH.MinigameTasteTest._resolveSample(
                        makers[i],
                        {
                            size: makers.length,
                            publicity: makers[i].publicity,
                            authority: makers[i].authority
                        }
                    )
                );

                AIH.MinigameTasteTest._completeAvoidMakerGoal(
                    makers[i],
                    "discovered she likes multiple makers' attention at once"
                );
            }
        }

        return {

            chosenAction: winner.action,
            response: winner.evaluation.response,
            score: winner.evaluation.score,

            groupSize: makers.length,

            driftResult: driftResult,

            tastedSamples: tastedSamples
        };
    };


    //
    // Judgment only triggers when the call is genuinely hard: an
    // identifiable (regular) maker whose confidence is neither 0 (nothing
    // to go on yet) nor comfortably high. Anonymous/generated makers never
    // trigger judgment - there's no meaningful "who made this" question
    // to wrestle with for a one-off stranger.
    //
    // =========================================================================

    AIH.MinigameTasteTest.JUDGMENT_CONFIDENCE_MIN = 0.15;
    AIH.MinigameTasteTest.JUDGMENT_CONFIDENCE_MAX = 0.7;

    AIH.MinigameTasteTest._isGenuinelyHardCall = function(maker, identification) {

        if (
            !identification ||
            !identification.identifiable
        ) {

            return false;
        }

        return (
            identification.confidence >
                AIH.MinigameTasteTest.JUDGMENT_CONFIDENCE_MIN &&
            identification.confidence <
                AIH.MinigameTasteTest.JUDGMENT_CONFIDENCE_MAX
        );
    };

    AIH.MinigameTasteTest.resolveBatch = function(makers) {

        var batchContext;
        var results;
        var i;
        var maker;
        var identification;
        var sampleOutcome;
        var judgmentOutcome;
        var state;
        var batchId;

        if (
            !Array.isArray(makers) ||
            makers.length === 0
        ) {

            return null;
        }

        state =
            AIH.MinigameTasteTest._ensure();

        batchId =
            state ?
                state.nextBatchId :
                Date.now();

        batchContext = {

            size: makers.length,

            publicity:
                makers.reduce(
                    function(sum, m) {
                        return sum + (m.publicity || 0);
                    },
                    0
                ) / makers.length,

            authority:
                makers.reduce(
                    function(sum, m) {
                        return sum + (m.authority || 0);
                    },
                    0
                ) / makers.length
        };

        results = [];

        for (
            i = 0;
            i < makers.length;
            i++
        ) {

            maker = makers[i];

            if (
                maker.kind === "regular" &&
                AIH.MinigameTasteTest._hasActiveAvoidGuessingGoal(maker) &&
                AIH.MinigameTasteTest._canActOnShapeRecognition(maker)
            ) {

                /*
                 * She recognizes this maker's tube/casing by shape/feel
                 * alone, is confident enough in that recognition to act
                 * on it, and has reason to avoid this maker (an active
                 * avoid_maker goal) - so she skips it entirely, before
                 * any tasting/identification/judgment happens.
                 */
                if (state) {

                    state.avoidedMakerKeys[maker.regularKey] = true;
                }

                results.push({

                    maker: maker,
                    avoidedViaShapeRecognition: true,
                    identification: null,
                    sample: null,
                    judgment: null
                });

                continue;
            }

            identification =
                AIH.MinigameTasteTest._attemptIdentification(maker);

            sampleOutcome =
                AIH.MinigameTasteTest._resolveSample(
                    maker,
                    batchContext
                );

            judgmentOutcome = null;

            if (
                AIH.MinigameTasteTest._isGenuinelyHardCall(
                    maker,
                    identification
                )
            ) {

                judgmentOutcome =
                    AIH.MinigameTasteTest._resolveJudgment(
                        maker,
                        batchContext,
                        identification
                    );
            }

            AIH.MinigameTasteTest._recordTasting(maker);

            AIH.MinigameTasteTest._recordGlobalTasting();

            results.push({

                maker: maker,
                identification: identification,
                sample: sampleOutcome,
                judgment: judgmentOutcome
            });

            if (maker.kind === "regular") {

                AIH.MinigameTasteTest._finalizeRegularRelationship(
                    maker,
                    sampleOutcome,
                    judgmentOutcome
                );

                AIH.MinigameTasteTest._modifyRegularFactionReputation(
                    maker,
                    sampleOutcome,
                    judgmentOutcome
                );

                AIH.MinigameTasteTest._trackMisidentificationPattern(
                    maker,
                    judgmentOutcome
                );

                AIH.MinigameTasteTest._trackJudgmentReputationAmbition(
                    judgmentOutcome
                );
            }
        }

        if (state) {

            state.sessionLog.push({

                batchId: batchId,
                timestamp: Date.now(),
                batchSize: makers.length,
                results: results
            });

            state.nextBatchId += 1;
            state.totalBatches += 1;
        }

        return {

            batchId: batchId,
            perceivedRanking:
                AIH.MinigameTasteTest._rankByPerceivedQuality(results),

            results: results
        };
    };

    /*
     * "Which one tastes better" - a light comparative ranking, not a
     * psychology-tied judgment. Adds a small amount of noise around the
     * true quality value so a batch isn't perfectly, mechanically sorted
     * every time.
     */
    AIH.MinigameTasteTest._rankByPerceivedQuality = function(results) {

        var ranked;

        ranked =
            results.map(function(r) {

                return {

                    makerName:
                        r.maker.name,

                    perceivedQuality:
                        AIH.MinigameTasteTest._clamp01(
                            r.maker.quality +
                            AIH.MinigameTasteTest._randomBetween(
                                -0.08,
                                0.08
                            )
                        )
                };
            });

        ranked.sort(function(a, b) {
            return b.perceivedQuality - a.perceivedQuality;
        });

        return ranked;
    };

    // =========================================================================
    // REGULAR RELATIONSHIP FEEDBACK
    // =========================================================================

    AIH.MinigameTasteTest._finalizeRegularRelationship = function(
        maker,
        sampleOutcome,
        judgmentOutcome
    ) {

        var wentWell;

        if (
            typeof AIH.Relationships === "undefined" ||
            !AIH.Relationships.modifyAxis
        ) {

            return;
        }

        wentWell =
            !!sampleOutcome &&
            (
                sampleOutcome.response === "accept" ||
                sampleOutcome.response === "reluctant_accept" ||
                sampleOutcome.response === "partial"
            ) &&
            (
                !judgmentOutcome ||
                judgmentOutcome.wentWell
            );

        AIH.Relationships.modifyAxis(
            maker.id,
            "familiarity",
            wentWell ? 4 : 1,
            "taste test batch"
        );

        if (wentWell) {

            AIH.Relationships.modifyAxis(
                maker.id,
                "trust",
                2,
                "taste test batch went well"
            );
        }
    };

    // =========================================================================
    // FACTION REPUTATION FEEDBACK (pattern E)
    // =========================================================================
    //
    // Per Quick-Start step 7 - regulars only, since only regulars carry a
    // stable faction identity worth talking about. Judgment outcome (when
    // there was one) is authoritative over the plain sample outcome so a
    // hard call that backfired/mishapped doesn't ALSO get counted as a
    // clean success from the sample alone - guarded exactly like
    // Bathhouse's own comment on this.
    //
    // =========================================================================

    AIH.MinigameTasteTest._modifyRegularFactionReputation = function(
        maker,
        sampleOutcome,
        judgmentOutcome
    ) {

        var wentWell;
        var badOutcome;

        if (
            !maker.faction ||
            typeof AIH.Reputation === "undefined" ||
            !AIH.Reputation.modifyAxes
        ) {

            return;
        }

        if (
            AIH.Reputation.hasFaction &&
            !AIH.Reputation.hasFaction(maker.faction) &&
            AIH.Reputation.addFaction
        ) {

            AIH.Reputation.addFaction(maker.faction);
        }

        if (judgmentOutcome) {

            badOutcome =
                !judgmentOutcome.wentWell;

            if (judgmentOutcome.wentWell) {

                AIH.Reputation.modifyAxes(
                    maker.faction,
                    { reputation: 1 },
                    "she handled a hard call about " +
                        maker.name +
                        "'s ferment (" +
                        judgmentOutcome.chosenAction +
                        ") without it going badly"
                );

            } else if (badOutcome) {

                AIH.Reputation.modifyAxes(
                    maker.faction,
                    { reputation: -2 },
                    "a taste-test judgment about " +
                        maker.name +
                        " got away from her"
                );
            }

            return;
        }

        wentWell =
            !!sampleOutcome &&
            (
                sampleOutcome.response === "accept" ||
                sampleOutcome.response === "reluctant_accept"
            );

        if (wentWell) {

            AIH.Reputation.modifyAxes(
                maker.faction,
                { reputation: 1 },
                "she tasted " +
                    maker.name +
                    "'s ferment and it went well"
            );
        }
    };

    // =========================================================================
    // EMERGENT GOAL - REPEATED MISIDENTIFICATION -> "AVOID GUESSING ON X"
    // =========================================================================
    //
    // Mirrors the handoff's own Section 5 worked example ("a bathhouse
    // patron's repeated harassment could spawn 'avoid working when that
    // patron is in'") and Bathhouse's harassment-pattern tracker, but for
    // this framework's own failure mode: repeatedly backfiring/mishapping
    // on a specific regular's ferment plausibly grows into "stop trying
    // to call this one, just enjoy it."
    //
    // =========================================================================

    AIH.MinigameTasteTest.MISATTRIBUTION_GOAL_THRESHOLD = 3;

    AIH.MinigameTasteTest._trackMisidentificationPattern = function(maker, judgmentOutcome) {

        var state;
        var count;
        var createdGoal;

        if (
            !judgmentOutcome ||
            judgmentOutcome.wentWell ||
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.create
        ) {

            return;
        }

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return;
        }

        if (
            state.misattributionIncidents[maker.regularKey] ===
            undefined
        ) {

            state.misattributionIncidents[maker.regularKey] = 0;
        }

        state.misattributionIncidents[maker.regularKey] += 1;

        count =
            state.misattributionIncidents[maker.regularKey];

        if (count < AIH.MinigameTasteTest.MISATTRIBUTION_GOAL_THRESHOLD) {
            return;
        }

        if (
            AIH.MinigameTasteTest._hasActiveAvoidGuessingGoal(maker)
        ) {

            return;
        }

        createdGoal =
            AIH.Goals.create({

                description:
                    "Stop trying to call " +
                    maker.name +
                    "'s batches out loud - just taste and enjoy them.",

                category: "avoid_maker",
                origin: "emergent",
                baseWeight: 0.4,

                linkedValues: [
                    "dignity",
                    "pleasure"
                ],

                relatedNpcId:
                    maker.id,

                relatedFaction:
                    maker.faction,

                reason:
                    "she has misjudged " +
                    maker.name +
                    "'s ferment publicly " +
                    count +
                    " times"
            });

        if (createdGoal && createdGoal.id) {

            state.avoidMakerGoalIds[maker.regularKey] =
                createdGoal.id;
        }
    };

    AIH.MinigameTasteTest._hasActiveAvoidGuessingGoal = function(maker) {

        var goals;
        var i;

        if (
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.all
        ) {

            return false;
        }

        goals =
            AIH.Goals.all();

        for (
            i = 0;
            i < goals.length;
            i++
        ) {

            if (
                goals[i].relatedNpcId === maker.id &&
                goals[i].category === "avoid_maker" &&
                (
                    goals[i].status === "active" ||
                    goals[i].status === "proposed"
                )
            ) {

                return true;
            }
        }

        return false;
    };

    // =========================================================================
    // EMERGENT "REPUTATION AMBITION" GOAL
    // =========================================================================
    //
    // Positive-direction counterpart, same shape as Bathhouse's own
    // reputation-ambition goal: repeatedly handling hard identification
    // calls well can plausibly grow into an ambition about how she wants
    // to be known - tracked globally, only fires once the pattern has
    // actually happened enough times in play.
    //
    // =========================================================================

    AIH.MinigameTasteTest.REPUTATION_GOAL_THRESHOLD = 3;

    AIH.MinigameTasteTest.REPUTATION_GOAL_DESCRIPTIONS = [
        "Become known as someone who can always tell whose batch is whose.",
        "Build a reputation as the most discerning taster anyone's brought a tube to.",
        "Prove, tube by tube, that her palate can be trusted."
    ];

    AIH.MinigameTasteTest._hasActiveReputationGoal = function() {

        var goals;
        var i;

        if (
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.all
        ) {

            return false;
        }

        goals =
            AIH.Goals.all();

        for (
            i = 0;
            i < goals.length;
            i++
        ) {

            if (
                goals[i].category === "reputation_ambition" &&
                (
                    goals[i].status === "active" ||
                    goals[i].status === "proposed"
                )
            ) {

                return true;
            }
        }

        return false;
    };

    AIH.MinigameTasteTest._trackJudgmentReputationAmbition = function(judgmentOutcome) {

        var state;

        if (
            !judgmentOutcome ||
            !judgmentOutcome.wentWell ||
            typeof AIH.Goals === "undefined" ||
            !AIH.Goals.create
        ) {

            return;
        }

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return;
        }

        if (state.judgmentsHandledWell === undefined) {
            state.judgmentsHandledWell = 0;
        }

        state.judgmentsHandledWell += 1;

        if (
            state.judgmentsHandledWell <
            AIH.MinigameTasteTest.REPUTATION_GOAL_THRESHOLD
        ) {

            return;
        }

        if (AIH.MinigameTasteTest._hasActiveReputationGoal()) {
            return;
        }

        AIH.Goals.create({

            description:
                AIH.MinigameTasteTest._pickRandom(
                    AIH.MinigameTasteTest.REPUTATION_GOAL_DESCRIPTIONS
                ),

            category: "reputation_ambition",
            origin: "emergent",
            baseWeight: 0.4,

            linkedValues: [
                "status",
                "pride"
            ],

            reason:
                "she has handled " +
                state.judgmentsHandledWell +
                " hard taste-test identification calls well"
        });
    };

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    AIH.MinigameTasteTest.startSession = function() {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return;
        }

        state.sessionActive = true;
        state.sessionLog = [];
    };

    AIH.MinigameTasteTest.generateBatch = function(batchSize, archetypeKeys) {

        var size;
        var makers;
        var i;
        var key;

        size =
            Math.max(1, Number(batchSize) || 1);

        makers = [];

        for (
            i = 0;
            i < size;
            i++
        ) {

            key =
                Array.isArray(archetypeKeys) && archetypeKeys.length > 0 ?
                    AIH.MinigameTasteTest._pickRandom(archetypeKeys) :
                    null;

            makers.push(
                AIH.MinigameTasteTest._generateFromArchetype(key)
            );
        }

        return AIH.MinigameTasteTest.resolveBatch(makers);
    };

    AIH.MinigameTasteTest.tasteFromRegular = function(regularId, batchSize) {

        var regular;
        var makers;
        var fillerCount;
        var i;

        regular =
            AIH.MinigameTasteTest._normalizeRegular(regularId);

        if (!regular) {
            return null;
        }

        AIH.MinigameTasteTest.ensureRegularRelationship(regular);

        makers = [regular];

        fillerCount =
            Math.max(0, (Number(batchSize) || 1) - 1);

        for (
            i = 0;
            i < fillerCount;
            i++
        ) {

            makers.push(
                AIH.MinigameTasteTest._generateFromArchetype()
            );
        }

        return AIH.MinigameTasteTest.resolveBatch(makers);
    };

    AIH.MinigameTasteTest.getSessionLog = function() {

        var state;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return [];
        }

        return state.sessionLog;
    };

    AIH.MinigameTasteTest.getAvoidedMakers = function() {

        var state;
        var keys;
        var i;
        var makers;
        var maker;

        state =
            AIH.MinigameTasteTest._ensure();

        if (!state) {
            return [];
        }

        keys =
            Object.keys(state.avoidedMakerKeys);

        makers = [];

        for (
            i = 0;
            i < keys.length;
            i++
        ) {

            maker =
                AIH.MinigameTasteTest._normalizeRegular(keys[i]);

            if (maker) {
                makers.push(maker);
            }
        }

        return makers;
    };

    /*
     * Player-facing "group and force" mechanic: stagger her currently
     * avoided makers together and confront her with all of them at once.
     * regularKeys, if omitted, defaults to every maker currently tracked
     * in state.avoidedMakerKeys (i.e. "group everyone she's avoiding
     * right now").
     */
    AIH.MinigameTasteTest.forceOverwhelmEscalation = function(regularKeys) {

        var keys;
        var i;
        var makers;
        var maker;
        var result;

        keys =
            Array.isArray(regularKeys) && regularKeys.length > 0 ?
                regularKeys :
                Object.keys(
                    AIH.MinigameTasteTest._ensure().avoidedMakerKeys || {}
                );

        makers = [];

        for (
            i = 0;
            i < keys.length;
            i++
        ) {

            maker =
                AIH.MinigameTasteTest._normalizeRegular(keys[i]);

            if (maker) {
                makers.push(maker);
            }
        }

        if (makers.length === 0) {
            return null;
        }

        result =
            AIH.MinigameTasteTest._resolveOverwhelmEscalation(makers);

        return result;
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    AIH.MinigameTasteTest.initialize = function() {

        AIH.MinigameTasteTest._ensure();

        AIH.MinigameTasteTest._initialized = true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Taste Test minigame initialized."
            );
        }
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "MinigameTasteTest",
            {
                version:
                    AIH.MinigameTasteTest.VERSION,

                initialize: function() {
                    AIH.MinigameTasteTest.initialize();
                },

                generateBatch: function(batchSize, archetypeKeys) {
                    return AIH.MinigameTasteTest.generateBatch(batchSize, archetypeKeys);
                },

                tasteFromRegular: function(regularId, batchSize) {
                    return AIH.MinigameTasteTest.tasteFromRegular(regularId, batchSize);
                },

                getSessionLog: function() {
                    return AIH.MinigameTasteTest.getSessionLog();
                },

                isSCBSEnabled: function() {
                    return AIH.MinigameTasteTest.isSCBSEnabled();
                },

                setSCBSEnabled: function(enabled) {
                    AIH.MinigameTasteTest.setSCBSEnabled(enabled);
                },

                getCurrentOutfit: function() {
                    return AIH.MinigameTasteTest.getCurrentOutfit();
                },

                setCurrentOutfit: function(outfit) {
                    AIH.MinigameTasteTest.setCurrentOutfit(outfit);
                },

                getAvoidedMakers: function() {
                    return AIH.MinigameTasteTest.getAvoidedMakers();
                },

                forceOverwhelmEscalation: function(regularKeys) {
                    return AIH.MinigameTasteTest.forceOverwhelmEscalation(regularKeys);
                }
            }
        );
    }

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_Minigame_TasteTest",
            "StartSession",
            function() {

                AIH.MinigameTasteTest.startSession();
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_TasteTest",
            "GenerateBatch",
            function(args) {

                var result;

                result =
                    AIH.MinigameTasteTest.generateBatch(
                        Number(args.batchSize) || 1
                    );

                AIH.Debug.inspect(
                    "Taste test batch resolved:",
                    result
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_TasteTest",
            "TasteFromRegular",
            function(args) {

                var result;

                result =
                    AIH.MinigameTasteTest.tasteFromRegular(
                        args.regularId,
                        Number(args.batchSize) || 1
                    );

                AIH.Debug.inspect(
                    "Taste test batch resolved:",
                    result
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_TasteTest",
            "SetSCBSEnabled",
            function(args) {

                AIH.MinigameTasteTest.setSCBSEnabled(
                    args.enabled === "true" || args.enabled === true
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_TasteTest",
            "SetCurrentOutfit",
            function(args) {

                AIH.MinigameTasteTest.setCurrentOutfit(args.outfit);
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_TasteTest",
            "ForceOverwhelmEscalation",
            function() {

                var result;

                result =
                    AIH.MinigameTasteTest.forceOverwhelmEscalation();

                AIH.Debug.inspect(
                    "Overwhelm escalation resolved:",
                    result
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_Minigame_TasteTest",
            "ShowSessionLog",
            function() {

                AIH.Debug.inspect(
                    "Current taste test session log:",
                    AIH.MinigameTasteTest.getSessionLog()
                );
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_MinigameTasteTest_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_MinigameTasteTest_createGameObjects.call(this);

            AIH.MinigameTasteTest.initialize();
        };

        var _AIH_MinigameTasteTest_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_MinigameTasteTest_setupNewGame.call(this);

            AIH.MinigameTasteTest._initialized = false;
            AIH.MinigameTasteTest.initialize();
        };

        var _AIH_MinigameTasteTest_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents = function(contents) {

            _AIH_MinigameTasteTest_extractSaveContents.call(this, contents);

            AIH.MinigameTasteTest._initialized = false;
            AIH.MinigameTasteTest.initialize();
        };
    }

})();