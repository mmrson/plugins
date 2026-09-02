/*:
 * @plugindesc AI Hero Framework - Cursed Items System v0.3.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - CURSED ITEMS
 * ============================================================================
 *
 * A core system (not a minigame) that any minigame, battle event, or map
 * event can plug into. Three sources of a cursed item ending up equipped:
 *
 *     chest_trap        opening a trapped chest force-equips it
 *     enemy_inflicted    an enemy/boss action force-equips it
 *     voluntary          the player equips it themselves, drawn by a real
 *                        stat benefit, not realizing (or accepting) that it
 *                        locks itself on
 *
 * Once equipped, a cursed item CANNOT be removed through the normal equip
 * menu - see the isEquipChangeOk hook below - until its own
 * removalConditionId has been externally marked met (via
 * AIH.CursedItems.markConditionMet(), called by whatever quest/battle/event
 * script actually resolves that condition - this module has no opinion on
 * what the condition IS, only on enforcing the lock until it's satisfied).
 *
 * ============================================================================
 *
 * THE PERSONALITY FLIP MECHANIC
 *
 * Per design discussion: NOT a periodic "every X actions, toggle" timer.
 * Every tracked action while a flip-capable cursed item is equipped rolls
 * against a chance that RAMPS UP the longer it's been worn. When it
 * triggers, her psychology for THAT ONE DECISION is temporarily forced
 * toward the item's inverted targets (e.g. inhibition/pride/confidence
 * toward 0) - she does not choose to act against herself, the cursed item
 * is choosing FOR her, and the real AIH.PressureEvaluator/chooseBest
 * machinery is what actually produces the (now very different) outcome,
 * because the story it's given is different, not because anything hard-
 * codes the result. This is what
 * AIH.CursedItems.evaluateWithPossibleFlip() does - it is a drop-in
 * replacement for AIH.PressureEvaluator.evaluate() that any minigame can
 * call once a cursed item is in play, everywhere else in a minigame
 * (situation-building, _reportOutcome, chooseBest) stays completely
 * unchanged.
 *
 * INTERNAL CONFLICT: alongside the real (flipped) evaluation, a shadow
 * evaluation runs with her genuine, un-flipped psychology - never used to
 * decide anything, purely to detect whether her real self would have
 * chosen differently. When it would have, that's the moment she is
 * consciously fighting the cursed item(s) and visibly losing - see
 * getConflictLine() for the (static, non-LLM, per project convention)
 * narration this produces, and recordConflictBelief() for surfacing it as
 * a lasting self_narrative belief.
 *
 * ============================================================================
 *
 * WHY DRIFT FROM A FLIPPED MOMENT IS REAL AND PERMANENT
 *
 * Per design decision: personality drift earned during a flipped moment
 * is NOT reverted when the cursed item is eventually removed. The calling
 * minigame reports the outcome through its own _reportOutcome/
 * _reportBoundaryOutcome exactly as it always does - this module does not
 * intercept or special-case that call. AIH.PersonalityDrift.reinforce()
 * only ever touches AIH.Personality traits, never AIH.Values - so a
 * flipped, rewarded compliance lowers Personality.inhibition (what she
 * actually does) while leaving Values.modesty (what she still consciously
 * believes in) completely untouched, exactly the divergence
 * MINIGAME_HANDOFF.md Section 3 already calls out as the framework's
 * intended, interesting case. recordConflictBelief() is what turns that
 * gap into an explicit, lingering self_narrative belief rather than an
 * invisible side effect - the "conflict" is real and persists even after
 * the item is gone, without needing any special partial-reset logic.
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - decide what removalConditionId actually requires or check it itself -
 *   that is always the calling quest/battle/event script's job, via
 *   markConditionMet(). Some items' own calling minigame (see
 *   AIH_Minigame_TasteTest.js and AIH_Minigame_Service.js) tracks its own
 *   progress toward that condition and calls markConditionMet() itself
 *   once satisfied - this module still never decides whether that call is
 *   warranted.
 * - modify AIH_PressureEvaluator.js, AIH_PersonalityDrift.js, or any
 *   other authoritative module
 * - call an LLM for the internal-conflict narration - it is a small,
 *   static line pool, per MINIGAME_HANDOFF.md Section 12
 *
 * ============================================================================
 *
 * v0.2.0 CHANGELOG - MULTIPLE SIMULTANEOUSLY-EQUIPPED FLIP ITEMS
 *
 * Previously (v0.1.x), only a single "primary" flip-capable item - the
 * first one found while iterating the equipped set, an essentially
 * arbitrary object-iteration-order artifact - could ever flip, even if
 * two or three flip-capable cursed items happened to be equipped in
 * different slots at once (nothing stops this; only a handful of items
 * set equipSlotLock). That was flagged as explicitly out of scope back in
 * v0.1.0. It has come up, so this fixes it properly rather than leaving
 * it arbitrary:
 *
 * - INDEPENDENT ROLLS: every equipped, condition-unmet, flip-capable item
 *   now rolls its OWN currentFlipChance() on every tracked action. One
 *   item triggering does not block or consume another's roll - two or
 *   more items can trigger on the exact same decision.
 *
 * - TRAIT CONFLICT RESOLUTION: when two or more triggered items target
 *   the SAME trait (or emotion) with different invert values, the value
 *   furthest from the neutral midpoint (0.5) wins as the base, then gets
 *   pushed a little further in that same direction for every additional
 *   triggered item that ALSO targets that trait - compounding curses read
 *   as compounding, not as one curse silently overriding the others. See
 *   _mergeInvertedMap() and AIH.CursedItems.STACKING.
 *   TRAIT_CONFLICT_EXTRA_PER_ITEM (tunable).
 *
 * - FLOOR/CEILING STACKING: floorTraits/ceilingTraits now merge across
 *   EVERY equipped item with an active floor/ceiling on a given trait,
 *   not just the old single "primary" item. Highest floor / lowest
 *   ceiling is the base; each additional overlapping item nudges it a
 *   little further (NOT full additive stacking - two floors of 0.50 and
 *   0.30 do not become 0.80). See _mergedFloorValues()/
 *   _mergedCeilingValues() and AIH.CursedItems.STACKING.
 *   FLOOR_CEILING_OVERLAP_BONUS (tunable).
 *
 * - _primaryFlipItem() is REMOVED, replaced by
 *   _equippedFlipCapableItems() (returns ALL eligible items, not one).
 *
 * - evaluateWithPossibleFlip()'s return shape gains flipItemIds (array of
 *   every item that triggered on this decision). flipItemId is KEPT for
 *   backward compatibility with AIH_Minigame_Service.js/
 *   AIH_Minigame_TasteTest.js's existing recordConflictBelief() calls -
 *   it is now defined as "the first item in flipItemIds", not "the only
 *   item that could have flipped".
 *
 * ============================================================================
 *
 * v0.3.0 CHANGELOG - BATHHOUSE ITEM SET
 *
 * - NEW items for AIH_Minigame_IntimateService.js: anklet_of_the_easy_yes,
 *   perfume_of_the_practiced_smile, choker_of_the_blushing_temptress,
 *   sash_of_the_regulars_devotion. All four push in the SAME direction -
 *   less inhibited, more compliant, less resistant - never the reverse
 *   (no freezing/increased-embarrassment-as-behavior curses here; that
 *   flavor already exists elsewhere, e.g. bell_of_the_wallflower). Two
 *   read as a confident, seductive succubus-type shift; one
 *   (choker_of_the_blushing_temptress) deliberately keeps the EMOTIONAL
 *   surface shy/mortified/low-confidence while the underlying mechanical
 *   push is exactly as compliant - a good candidate for surfacing via
 *   the internal-conflict/shadow-evaluation system. Each item's removal
 *   condition is tracked directly by AIH_Minigame_IntimateService.js.
 *
 * ============================================================================
 *
 * @command ForceEquip
 * @text Force-Equip Cursed Item
 * @desc Forces a cursed item onto the party leader (or given actor).
 *
 * @arg itemId
 * @text Item Definition Id
 * @type string
 *
 * @arg source
 * @text Source
 * @type select
 * @option chest_trap
 * @option enemy_inflicted
 * @option voluntary
 * @default chest_trap
 *
 * @arg actorId
 * @text Actor Id (optional)
 * @type actor
 * @default 0
 *
 * @command MarkConditionMet
 * @text Mark Removal Condition Met
 * @desc Unlocks a cursed item for removal once its condition is resolved.
 *
 * @arg itemId
 * @text Item Definition Id
 * @type string
 *
 * @command RemoveCursedItem
 * @text Remove Cursed Item
 * @desc Removes a cursed item, if its condition has been met.
 *
 * @arg itemId
 * @text Item Definition Id
 * @type string
 *
 * @arg actorId
 * @text Actor Id (optional)
 * @type actor
 * @default 0
 *
 * @command Show
 * @text Show Cursed Item Status
 * @desc Displays currently equipped cursed items and their state.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.CursedItems = AIH.CursedItems || {};

    AIH.CursedItems.VERSION = "0.2.0";

    AIH.CursedItems.SCHEMA_VERSION = 1;

    AIH.CursedItems._initialized = false;

    // =========================================================================
    // STACKING CONFIGURATION (v0.2.0)
    // =========================================================================
    //
    // The two knobs that control how multiple simultaneously-equipped
    // flip-capable cursed items interact. Both are deliberately exposed
    // here (not buried as inline magic numbers) so they can be tuned from
    // actual playtesting without touching any of the merge logic itself.
    //
    // =========================================================================

    AIH.CursedItems.STACKING = {

        /*
         * When two or more items that TRIGGERED on the same decision both
         * define an invertedTraits/invertedEmotions entry for the SAME
         * key, the value furthest from 0.5 (the neutral midpoint) is
         * taken as the base, and this amount is added on top of it -
         * pushed further in the same direction - for every ADDITIONAL
         * item beyond the first that also targets that key. See
         * _mergeInvertedMap(). Recommended range while tuning: 0.02-0.08.
         */
        TRAIT_CONFLICT_EXTRA_PER_ITEM: 0.03,

        /*
         * When two or more equipped items have an ACTIVE floor or
         * ceiling on the same trait, the most restrictive one (highest
         * floor / lowest ceiling) is taken as the base, and this amount
         * is added (floors) or subtracted (ceilings) for every
         * ADDITIONAL overlapping item beyond the first. Deliberately NOT
         * full additive stacking - a 0.50 floor and a 0.30 floor should
         * not become 0.80. See _mergedFloorValues()/
         * _mergedCeilingValues(). Recommended range while tuning:
         * 0.03-0.10.
         */
        FLOOR_CEILING_OVERLAP_BONUS: 0.05

    };

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.CursedItems._clamp01 = function(value) {

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

    AIH.CursedItems._number = function(value, fallback) {

        var result;

        result =
            Number(value);

        return isNaN(result) ?
            fallback :
            result;
    };

    AIH.CursedItems._pickRandom = function(array) {

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

    AIH.CursedItems._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.CursedItems._ensure = function() {

        var state;

        state =
            AIH.CursedItems._state();

        if (!state) {
            return null;
        }

        if (!state.cursedItems) {

            state.cursedItems = {

                schemaVersion:
                    AIH.CursedItems.SCHEMA_VERSION,

                /*
                 * Keyed by itemId. Only one equipped INSTANCE per itemId
                 * is tracked - this module does not support two copies of
                 * the same cursed item equipped at once (matches how
                 * equipment slots work anyway). Nothing stops several
                 * DIFFERENT flip-capable items from being equipped
                 * simultaneously though - see the v0.2.0 changelog above.
                 */
                equipped: {},

                /*
                 * At most one in-flight temporary override at a time -
                 * evaluateWithPossibleFlip() is not reentrant across
                 * overlapping calls. As of v0.2.0 this snapshot may cover
                 * the MERGED result of several items that triggered
                 * together on the same decision, not just one - but it
                 * is still a single combined snapshot of her real values,
                 * restored exactly afterward either way.
                 */
                activeOverride: null
            };
        }

        if (
            !state.cursedItems.equipped ||
            typeof state.cursedItems.equipped !== "object"
        ) {

            state.cursedItems.equipped = {};
        }

        return state.cursedItems;
    };

    // =========================================================================
    // ITEM DEFINITIONS
    // =========================================================================
    //
    // Data, not code - a new cursed item is a new entry here, never a new
    // code path.
    //
    // =========================================================================

    AIH.CursedItems.DEFINITIONS = {

        manacles_of_meekness: {

            name: "Manacles of Meekness",
            defaultSource: "chest_trap",

            /*
             * A chest-trap curse doesn't need the flip mechanic to be a
             * real curse - the lock itself, plus a plain stat cost, is
             * enough of a trap. No personalityFlip block at all here.
             */
            equipSlotLock: false,

            removalConditionId: "manacles_of_meekness_forgiveness",
            removalConditionDescription:
                "Earn the genuine forgiveness of someone she's wronged " +
                "while wearing them."
        },

        collar_of_submission: {

            name: "Collar of Submission",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.05,
                    defiance: 0.05
                },

                invertedEmotions: {
                    embarrassment: 0.05
                },

                baseFlipChance: 0.08,
                flipChancePerAction: 0.012,
                maxFlipChance: 0.75
            },

            removalConditionId: "collar_of_submission_defeat_source",
            removalConditionDescription:
                "Defeat whoever placed it on her."
        },

        ring_of_reckless_confidence: {

            name: "Ring of Reckless Confidence",
            defaultSource: "voluntary",

            equipSlotLock: false,

            /*
             * The exact example from the design discussion: a real stat-
             * boost draw, with a flip toward zero inhibition/pride/
             * confidence (personality) and zero embarrassment (emotion -
             * a different module, deliberately included since the
             * design called it out by name).
             */
            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0,
                    pride: 0,
                    confidence: 0
                },

                invertedEmotions: {
                    embarrassment: 0
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.80
            },

            removalConditionId: "ring_of_reckless_confidence_resolve",
            removalConditionDescription:
                "Find, and accept, a genuine reason to take the ring off."
        },

        sunbleached_swimwear: {

            name: "Sunbleached Swimwear",
            defaultSource: "voluntary",

            equipSlotLock: true,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.15,
                    attentionSeeking: 0.85
                },

                invertedEmotions: {
                    embarrassment: 0.10
                },

                baseFlipChance: 0.04,
                flipChancePerAction: 0.008,
                maxFlipChance: 0.60
            },

            removalConditionId: "sunbleached_swimwear_return_it",
            removalConditionDescription:
                "Return it to whoever it actually belongs to."
        },

        bell_of_the_wallflower: {

            name: "Bell of the Wallflower",
            defaultSource: "chest_trap",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 1.0,
                    assertiveness: 0.05
                },

                invertedEmotions: {
                    embarrassment: 0.95,
                    fear: 0.6
                },

                baseFlipChance: 0.06,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "bell_of_the_wallflower_speak_up",
            removalConditionDescription:
                "Speak up in front of a crowd, without freezing, three " +
                "separate times."
        },

        collar_of_sweet_obedience: {

            name: "Collar of Sweet Obedience",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    assertiveness: 0.05,
                    defiance: 0.05,
                    independence: 0.15
                },

                invertedEmotions: {
                    embarrassment: 0.2
                },

                baseFlipChance: 0.07,
                flipChancePerAction: 0.011,
                maxFlipChance: 0.75
            },

            removalConditionId: "collar_of_sweet_obedience_refuse_an_order",
            removalConditionDescription:
                "Refuse a direct order from someone stronger than her, and " +
                "survive the consequences of doing so."
        },

        locket_of_the_adored: {

            name: "Locket of the Adored",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    attentionSeeking: 0.95,
                    approvalSeeking: 0.95,
                    pride: 0.15
                },

                invertedEmotions: {
                    embarrassment: 0.15
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.009,
                maxFlipChance: 0.70
            },

            removalConditionId: "locket_of_the_adored_hollow_praise",
            removalConditionDescription:
                "Earn praise from someone whose opinion means nothing to " +
                "her, and recognize that it doesn't satisfy anything at all."
        },

        tethered_charm: {

            name: "Tethered Charm",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    independence: 0.05,
                    courage: 0.2
                },

                invertedEmotions: {
                    fear: 0.5
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "tethered_charm_decide_alone",
            removalConditionDescription:
                "Make, and live with, one important decision entirely " +
                "on her own - no party member consulted, before or after."
        },

        brand_of_the_bared_truth: {

            name: "Brand of the Bared Truth",
            defaultSource: "chest_trap",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0,
                    pride: 0.1
                },

                invertedEmotions: {
                    embarrassment: 0
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.75
            },

            removalConditionId: "brand_of_the_bared_truth_expose_it",
            removalConditionDescription:
                "Have the real reason she was branded exposed in front of " +
                "someone whose opinion she cares about - and accept it, " +
                "publicly, instead of denying it."
        },

        sash_of_the_star_performer: {

            name: "Sash of the Star Performer",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    attentionSeeking: 0.9,
                    inhibition: 0.1,
                    assertiveness: 0.85
                },

                invertedEmotions: {
                    embarrassment: 0.1,
                    excitement: 0.9
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "sash_of_the_star_performer_win_them_over",
            removalConditionDescription:
                "Win over a hostile crowd on her own merit, with the sash " +
                "removed beforehand, not because of it."
        },

        uniform_of_the_devoted_servant: {

            name: "Uniform of the Devoted Servant",
            defaultSource: "enemy_inflicted",

            equipSlotLock: true,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    assertiveness: 0.05,
                    independence: 0.1,
                    approvalSeeking: 0.9
                },

                invertedEmotions: {
                    embarrassment: 0.2
                },

                baseFlipChance: 0.06,
                flipChancePerAction: 0.012,
                maxFlipChance: 0.75
            },

            removalConditionId: "uniform_of_the_devoted_servant_defy_them",
            removalConditionDescription:
                "Defy, decisively and to their face, whoever she's bound " +
                "to serve."
        },

        contrary_charm: {

            name: "Contrary Charm",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    assertiveness: 0.95,
                    defiance: 0.9,
                    sociability: 0.1
                },

                invertedEmotions: {
                    anger: 0.4
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "contrary_charm_make_amends",
            removalConditionDescription:
                "Make real amends with someone she wronged with her own " +
                "forced words."
        },

        anklet_of_wandering_trust: {

            name: "Anklet of Wandering Trust",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    independence: 0.1,
                    trust: 0.95
                },

                invertedEmotions: {},

                baseFlipChance: 0.05,
                flipChancePerAction: 0.009,
                maxFlipChance: 0.70
            },

            removalConditionId: "anklet_of_wandering_trust_betrayed",
            removalConditionDescription:
                "Be betrayed by someone she trusted only because of the " +
                "anklet, and recognize the anklet - not her own judgment " +
                "- as the reason why."
        },

        hooded_ones_favor: {

            name: "The Hooded One's Favor",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    trust: 0.95,
                    independence: 0.15
                },

                invertedEmotions: {},

                baseFlipChance: 0.06,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.75
            },

            floorTraits: {
                trust: 0.75
            },

            removalConditionId: "hooded_ones_favor_see_through_them",
            removalConditionDescription:
                "Discover, on her own, real evidence that this trust was " +
                "misplaced - AIH_Minigame_TasteTest.js tracks this as two " +
                "misidentification backfires while the item is equipped."
        },

        casing_of_the_wandering_palate: {

            name: "Casing of the Wandering Palate",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.85,
                    defiance: 0.75
                },

                invertedEmotions: {
                    frustration: 0.7
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "casing_of_the_wandering_palate_prove_versatility",
            removalConditionDescription:
                "Accept a bamboo-tube sample despite the compulsion, " +
                "three separate times - AIH_Minigame_TasteTest.js tracks " +
                "this directly."
        },

        veil_of_heightened_senses: {

            name: "Veil of Heightened Senses",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.1,
                    attentionSeeking: 0.8
                },

                invertedEmotions: {
                    embarrassment: 0.1
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "veil_of_heightened_senses_prove_unneeded",
            removalConditionDescription:
                "Correctly identify a maker while dressed fully covered, " +
                "three separate times - AIH_Minigame_TasteTest.js tracks " +
                "this directly."
        },

        shroud_of_the_hidden_palate: {

            name: "Shroud of the Hidden Palate",
            defaultSource: "chest_trap",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.9,
                    attentionSeeking: 0.15
                },

                invertedEmotions: {
                    embarrassment: 0.6
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "shroud_of_the_hidden_palate_prove_unneeded",
            removalConditionDescription:
                "Correctly identify a maker while dressed with more skin " +
                "showing, three separate times - " +
                "AIH_Minigame_TasteTest.js tracks this directly."
        },

        ring_of_the_blushing_truth: {

            name: "Ring of the Blushing Truth",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.1,
                    defiance: 0.1
                },

                invertedEmotions: {
                    embarrassment: 0.55
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "ring_of_the_blushing_truth_admit_it_unforced",
            removalConditionDescription:
                "Volunteer an honest, embarrassing admission entirely " +
                "unprompted - with the ring not currently flipped - " +
                "proving she doesn't need it to be honest."
        },

        heels_of_silken_surrender: {

            name: "Heels of Silken Surrender",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    independence: 0.1,
                    assertiveness: 0.15
                },

                invertedEmotions: {},

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "heels_of_silken_surrender_stand_alone",
            removalConditionDescription:
                "Cross a genuinely difficult stretch of terrain, or hold " +
                "her ground through a real confrontation, entirely " +
                "unassisted."
        },

        succubus_claiming_mark: {

            name: "Succubus's Claiming Mark",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.1,
                    attentionSeeking: 0.85,
                    pride: 0.15
                },

                invertedEmotions: {
                    embarrassment: 0.1,
                    excitement: 0.7
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.009,
                maxFlipChance: 0.75
            },

            removalConditionId: "succubus_claiming_mark_reclaim_herself",
            removalConditionDescription:
                "Name, out loud to someone she trusts, exactly what the " +
                "mark has been doing to her - and mean it."
        },

        mark_of_the_honeyed_tongue: {

            name: "Mark of the Honeyed Tongue",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.15,
                    curiosity: 0.9
                },

                invertedEmotions: {
                    excitement: 0.6
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "mark_of_the_honeyed_tongue_refuse_it",
            removalConditionDescription:
                "Refuse an offered taste she genuinely wants, in front " +
                "of someone whose opinion of her matters, and hold that " +
                "refusal."
        },

        gag_of_compliance: {

            name: "Gag of Compliance",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    independence: 0.1,
                    defiance: 0.1,
                    approvalSeeking: 0.85
                },

                invertedEmotions: {},

                baseFlipChance: 0.06,
                flipChancePerAction: 0.011,
                maxFlipChance: 0.75
            },

            removalConditionId: "gag_of_compliance_refuse_an_order",
            removalConditionDescription:
                "Refuse a direct order while wearing it, and make the " +
                "refusal stick."
        },

        charm_of_the_eager_mouth: {

            name: "Charm of the Eager Mouth",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.1,
                    assertiveness: 0.1
                },

                invertedEmotions: {
                    embarrassment: 0.7
                },

                baseFlipChance: 0.06,
                flipChancePerAction: 0.012,
                maxFlipChance: 0.75
            },

            removalConditionId: "charm_of_the_eager_mouth_steady_herself",
            removalConditionDescription:
                "Get through three sample_hastily judgments without a " +
                "mishap occurring, despite the compulsion - " +
                "AIH_Minigame_TasteTest.js tracks this directly."
        },

        blindfold_of_the_watched_eyes: {

            name: "Blindfold of the Watched Eyes",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.1,
                    attentionSeeking: 0.75
                },

                invertedEmotions: {
                    embarrassment: 0.75
                },

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "blindfold_of_the_watched_eyes_prove_unshaken",
            removalConditionDescription:
                "Correctly identify a maker despite the amplified " +
                "exposure, three separate times - " +
                "AIH_Minigame_TasteTest.js tracks this directly."
        },

        cuffs_of_no_choosing: {

            name: "Cuffs of No Choosing",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    independence: 0.1,
                    defiance: 0.15
                },

                invertedEmotions: {},

                baseFlipChance: 0.05,
                flipChancePerAction: 0.01,
                maxFlipChance: 0.70
            },

            removalConditionId: "cuffs_of_no_choosing_prove_her_judgment",
            removalConditionDescription:
                "Guess confidently and be right, three separate times, " +
                "proving her judgment doesn't depend on having a choice " +
                "in the matter - AIH_Minigame_TasteTest.js tracks this " +
                "directly."
        },

        bit_of_obedient_silence: {

            name: "Bit of Obedient Silence",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    assertiveness: 0.1,
                    approvalSeeking: 0.85
                },

                invertedEmotions: {},

                baseFlipChance: 0.06,
                flipChancePerAction: 0.011,
                maxFlipChance: 0.75
            },

            removalConditionId: "bit_of_obedient_silence_prove_wordless_composure",
            removalConditionDescription:
                "Resolve three confrontations that go well despite being " +
                "unable to speak clearly - AIH_Minigame_Service.js " +
                "tracks this directly."
        },

        leash_of_the_devoted_mouth: {

            name: "Leash of the Devoted Mouth",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    defiance: 0.05,
                    inhibition: 0.1
                },

                invertedEmotions: {},

                baseFlipChance: 0.06,
                flipChancePerAction: 0.012,
                maxFlipChance: 0.75
            },

            ceilingTraits: {
                defiance: 0.15
            },

            removalConditionId: "leash_of_the_devoted_mouth_refuse_once",
            removalConditionDescription:
                "Refuse an offered taste outright despite the leash, and " +
                "make it stick, even once - AIH_Minigame_TasteTest.js " +
                "tracks this directly."
        },

        // ---------------------------------------------------------------
        // NEW (v0.3.0) - AIH_Minigame_IntimateService.js (bathhouse)
        // integration. All four push the same general direction:
        // LESS inhibited, LESS resistant, MORE easygoing/compliant -
        // never the opposite (no "freezes up," "more embarrassed
        // instead," etc. - that flavor already exists elsewhere, e.g.
        // bell_of_the_wallflower). Two read as a confident, seductive
        // succubus-type shift (anklet, perfume); one reads as the
        // opposite EMOTIONAL surface - genuinely shy, low-confidence,
        // visibly mortified - while still mechanically just as
        // compliant underneath (choker), which is exactly what makes it
        // a strong candidate for evaluateWithPossibleFlip's internal-
        // conflict/shadow-evaluation detection to surface. Each item's
        // removalConditionId is tracked directly by
        // AIH_Minigame_IntimateService.js - see that file's own CURSED
        // ITEM RELEASE CONDITION TRACKING section.
        // ---------------------------------------------------------------

        anklet_of_the_easy_yes: {

            name: "Anklet of the Easy Yes",
            defaultSource: "voluntary",

            equipSlotLock: false,

            /*
             * The generic, confident-succubus baseline curse for the
             * bathhouse: nothing about it feels effortful to say yes to
             * anymore, and it barely registers as embarrassing when she
             * does.
             */
            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.05,
                    defiance: 0.05,
                    approvalSeeking: 0.9
                },

                invertedEmotions: {
                    embarrassment: 0.1
                },

                baseFlipChance: 0.06,
                flipChancePerAction: 0.011,
                maxFlipChance: 0.75
            },

            removalConditionId: "anklet_of_the_easy_yes_hold_a_clean_no",
            removalConditionDescription:
                "Reject one of the bathhouse's more intimate requests " +
                "outright, three separate times - " +
                "AIH_Minigame_IntimateService.js tracks this directly."
        },

        perfume_of_the_practiced_smile: {

            name: "Perfume of the Practiced Smile",
            defaultSource: "voluntary",

            equipSlotLock: false,

            /*
             * AIH_Minigame_IntimateService.js reads this item's presence
             * directly (see its own _buildConfrontationCandidates) to
             * sweeten the "entertain" candidate specifically during a
             * confrontation - giving in reads as more natural, more
             * rewarding, and less costly than it should, on top of the
             * ordinary personality flip below.
             */
            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.1,
                    attentionSeeking: 0.85,
                    pride: 0.15
                },

                invertedEmotions: {
                    embarrassment: 0.1,
                    excitement: 0.6
                },

                baseFlipChance: 0.06,
                flipChancePerAction: 0.011,
                maxFlipChance: 0.75
            },

            removalConditionId: "perfume_of_the_practiced_smile_choose_otherwise",
            removalConditionDescription:
                "Win a bathhouse confrontation by choosing to calmly " +
                "defuse it or call for help instead of giving in, " +
                "despite the compulsion, three separate times - " +
                "AIH_Minigame_IntimateService.js tracks this directly."
        },

        choker_of_the_blushing_temptress: {

            name: "Choker of the Blushing Temptress",
            defaultSource: "enemy_inflicted",

            equipSlotLock: false,

            /*
             * The shy-but-still-succubus flavor: the EMOTIONAL surface
             * this pushes toward is genuine mortification and low
             * confidence, not seductive ease - but the underlying
             * mechanical push (inhibition down, approvalSeeking up) is
             * exactly as compliant as the confident-flavored items
             * above. That mismatch between how she visibly feels and
             * what she actually does is deliberate - it's precisely the
             * shape evaluateWithPossibleFlip's shadow-evaluation/
             * internal-conflict detection exists to surface (see
             * getConflictLine()'s "embarrassment"/"inhibition" pools).
             */
            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    inhibition: 0.1,
                    confidence: 0.15,
                    approvalSeeking: 0.85
                },

                invertedEmotions: {
                    embarrassment: 0.65
                },

                baseFlipChance: 0.06,
                flipChancePerAction: 0.011,
                maxFlipChance: 0.75
            },

            removalConditionId: "choker_of_the_blushing_temptress_clean_help",
            removalConditionDescription:
                "Successfully call for help during a bathhouse " +
                "confrontation with no favor expected in return, three " +
                "separate times - proving she doesn't have to trade on " +
                "herself to get through it - " +
                "AIH_Minigame_IntimateService.js tracks this directly."
        },

        sash_of_the_regulars_devotion: {

            name: "Sash of the Regular's Devotion",
            defaultSource: "voluntary",

            equipSlotLock: false,

            /*
             * Ties specifically into the bathhouse's own regular/
             * familiarity system rather than being a generic patron
             * curse - trust floored high (see floorTraits below) once
             * triggered, mirroring hooded_ones_favor's pattern but aimed
             * at a bathhouse regular instead of a TasteTest maker.
             */
            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    independence: 0.1,
                    trust: 0.92
                },

                invertedEmotions: {},

                baseFlipChance: 0.05,
                flipChancePerAction: 0.009,
                maxFlipChance: 0.70
            },

            floorTraits: {
                trust: 0.7
            },

            removalConditionId: "sash_of_the_regulars_devotion_hold_a_refusal",
            removalConditionDescription:
                "Have a regular patron's request end in a plain refusal " +
                "that never escalates into a confrontation, twice - " +
                "proving the bond isn't built on automatic compliance - " +
                "AIH_Minigame_IntimateService.js tracks this directly."
        }

    };

    // =========================================================================
    // EQUIP / LOCK STATE
    // =========================================================================

    AIH.CursedItems._defaultActor = function() {

        if (
            typeof $gameParty !== "undefined" &&
            $gameParty &&
            $gameParty.leader
        ) {

            return $gameParty.leader();
        }

        if (
            typeof $gameActors !== "undefined" &&
            $gameActors &&
            $gameActors.actor
        ) {

            return $gameActors.actor(1);
        }

        return null;
    };

    AIH.CursedItems._resolveActor = function(actorId) {

        if (
            actorId &&
            typeof $gameActors !== "undefined" &&
            $gameActors &&
            $gameActors.actor
        ) {

            return $gameActors.actor(actorId);
        }

        return AIH.CursedItems._defaultActor();
    };

    AIH.CursedItems.isEquipped = function(itemId) {

        var state;

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return false;
        }

        return !!state.equipped[itemId];
    };

    AIH.CursedItems.isConditionMet = function(itemId) {

        var state;

        state =
            AIH.CursedItems._ensure();

        if (
            !state ||
            !state.equipped[itemId]
        ) {

            return false;
        }

        return !!state.equipped[itemId].conditionMet;
    };

    /*
     * Whether ANY currently-equipped cursed item wants ALL other equip
     * slots locked too (the bikini case) - checked by the
     * isEquipChangeOk hook for slots that don't themselves hold a cursed
     * item.
     */
    AIH.CursedItems._anyEquipSlotLockActive = function() {

        var state;
        var itemId;
        var def;

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return false;
        }

        for (itemId in state.equipped) {

            if (!state.equipped.hasOwnProperty(itemId)) {
                continue;
            }

            if (state.equipped[itemId].conditionMet) {
                continue;
            }

            def =
                AIH.CursedItems.DEFINITIONS[itemId];

            if (def && def.equipSlotLock) {
                return true;
            }
        }

        return false;
    };

    AIH.CursedItems.forceEquip = function(itemId, source, actorId) {

        var state;
        var def;
        var actor;

        def =
            AIH.CursedItems.DEFINITIONS[itemId];

        if (!def) {

            if (
                typeof AIH.Debug !== "undefined" &&
                AIH.Debug.warn
            ) {

                AIH.Debug.warn(
                    "AIH.CursedItems.forceEquip: unknown itemId " + itemId
                );
            }

            return false;
        }

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return false;
        }

        actor =
            AIH.CursedItems._resolveActor(actorId);

        state.equipped[itemId] = {

            itemId: itemId,

            source:
                source ||
                def.defaultSource ||
                "chest_trap",

            actorId:
                actor && actor.actorId ?
                    actor.actorId() :
                    (actorId || null),

            equippedAt:
                Date.now(),

            actionsSinceEquip: 0,

            conditionMet: false,

            totalFlipsTriggered: 0,

            floorActive: false,
            ceilingActive: false
        };

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Cursed item force-equipped: " +
                def.name +
                " (" +
                state.equipped[itemId].source +
                ")"
            );
        }

        return true;
    };

    AIH.CursedItems.markConditionMet = function(itemId) {

        var state;

        state =
            AIH.CursedItems._ensure();

        if (
            !state ||
            !state.equipped[itemId]
        ) {

            return false;
        }

        state.equipped[itemId].conditionMet =
            true;

        return true;
    };

    AIH.CursedItems.removeCursedItem = function(itemId, actorId) {

        var state;
        var entry;

        state =
            AIH.CursedItems._ensure();

        if (
            !state ||
            !state.equipped[itemId]
        ) {

            return false;
        }

        entry =
            state.equipped[itemId];

        if (!entry.conditionMet) {
            return false;
        }

        delete state.equipped[itemId];

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Cursed item removed: " +
                itemId
            );
        }

        return true;
    };

    // =========================================================================
    // RPG MAKER MZ EQUIP-LOCK HOOK
    // =========================================================================

    if (typeof Game_Actor !== "undefined") {

        var _AIH_CursedItems_isEquipChangeOk =
            Game_Actor.prototype.isEquipChangeOk;

        Game_Actor.prototype.isEquipChangeOk = function(slotId) {

            var equips;
            var currentItem;
            var itemId;
            var def;

            if (
                !_AIH_CursedItems_isEquipChangeOk.call(this, slotId)
            ) {

                return false;
            }

            equips =
                this.equips();

            currentItem =
                equips[slotId];

            if (currentItem) {

                for (itemId in AIH.CursedItems.DEFINITIONS) {

                    if (
                        !AIH.CursedItems.DEFINITIONS.hasOwnProperty(itemId)
                    ) {

                        continue;
                    }

                    if (
                        AIH.CursedItems.isEquipped(itemId) &&
                        currentItem._aihCursedItemId === itemId
                    ) {

                        def =
                            AIH.CursedItems.DEFINITIONS[itemId];

                        if (!AIH.CursedItems.isConditionMet(itemId)) {
                            return false;
                        }
                    }
                }
            }

            if (
                AIH.CursedItems._anyEquipSlotLockActive() &&
                currentItem
            ) {

                for (itemId in AIH.CursedItems.DEFINITIONS) {

                    if (
                        !AIH.CursedItems.DEFINITIONS.hasOwnProperty(itemId)
                    ) {

                        continue;
                    }

                    def =
                        AIH.CursedItems.DEFINITIONS[itemId];

                    if (
                        def.equipSlotLock &&
                        AIH.CursedItems.isEquipped(itemId) &&
                        !AIH.CursedItems.isConditionMet(itemId)
                    ) {

                        return false;
                    }
                }
            }

            return true;
        };
    }

    // =========================================================================
    // ACTION TRACKING + FLIP CHANCE
    // =========================================================================

    AIH.CursedItems.recordAction = function() {

        var state;
        var itemId;

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return;
        }

        for (itemId in state.equipped) {

            if (!state.equipped.hasOwnProperty(itemId)) {
                continue;
            }

            if (state.equipped[itemId].conditionMet) {
                continue;
            }

            state.equipped[itemId].actionsSinceEquip += 1;
        }

        AIH.CursedItems._enforceFloors();
        AIH.CursedItems._enforceCeilings();
    };

    /*
     * Returns EVERY equipped, condition-unmet item with an enabled
     * personalityFlip - not just one. (v0.2.0 - replaces the old
     * _primaryFlipItem(), which only ever returned the first item found
     * while iterating state.equipped, an arbitrary object-iteration-order
     * artifact rather than a deliberate priority.)
     */
    AIH.CursedItems._equippedFlipCapableItems = function() {

        var state;
        var itemId;
        var def;
        var results;

        state =
            AIH.CursedItems._ensure();

        results = [];

        if (!state) {
            return results;
        }

        for (itemId in state.equipped) {

            if (!state.equipped.hasOwnProperty(itemId)) {
                continue;
            }

            if (state.equipped[itemId].conditionMet) {
                continue;
            }

            def =
                AIH.CursedItems.DEFINITIONS[itemId];

            if (
                def &&
                def.personalityFlip &&
                def.personalityFlip.enabled
            ) {

                results.push({
                    itemId: itemId,
                    def: def,
                    entry: state.equipped[itemId]
                });
            }
        }

        return results;
    };

    AIH.CursedItems.currentFlipChance = function(itemId) {

        var state;
        var def;
        var entry;
        var flip;
        var chance;

        state =
            AIH.CursedItems._ensure();

        def =
            AIH.CursedItems.DEFINITIONS[itemId];

        if (
            !state ||
            !state.equipped[itemId] ||
            !def ||
            !def.personalityFlip ||
            !def.personalityFlip.enabled
        ) {

            return 0;
        }

        entry =
            state.equipped[itemId];

        flip =
            def.personalityFlip;

        chance =
            AIH.CursedItems._number(flip.baseFlipChance, 0.05) +
            entry.actionsSinceEquip *
            AIH.CursedItems._number(flip.flipChancePerAction, 0.01);

        return AIH.CursedItems._clamp01(
            Math.min(
                chance,
                AIH.CursedItems._number(flip.maxFlipChance, 0.80)
            )
        );
    };

    // =========================================================================
    // TRAIT FLOORS (v0.2.0 - merged across every active floor-bearing item)
    // =========================================================================
    //
    // Ordinary personalityFlip targets only apply DURING a flipped moment,
    // restored immediately after (see TEMPORARY PSYCHOLOGY OVERRIDE below)
    // - any lasting change has to come from whatever
    // PersonalityDrift.reinforce() the calling minigame does afterward.
    // floorTraits is a different, stronger kind of lasting effect: once a
    // floor-bearing item's flip has triggered at least once
    // (entry.floorActive), its named trait(s) are continuously clamped to
    // never read BELOW the floor value while the item remains equipped.
    //
    // As of v0.2.0, if MULTIPLE equipped items have an active floor on
    // the same trait, they no longer just silently pick whichever one
    // iterates first - see _mergedFloorValues() below for how they
    // combine.
    //
    // =========================================================================

    AIH.CursedItems._mergedFloorValues = function() {

        var state;
        var itemId;
        var entry;
        var def;
        var key;
        var floor;
        var perTrait;
        var merged;
        var values;
        var base;
        var bonus;

        state =
            AIH.CursedItems._ensure();

        perTrait = {};

        if (!state) {
            return {};
        }

        for (itemId in state.equipped) {

            if (!state.equipped.hasOwnProperty(itemId)) {
                continue;
            }

            entry =
                state.equipped[itemId];

            if (
                entry.conditionMet ||
                !entry.floorActive
            ) {

                continue;
            }

            def =
                AIH.CursedItems.DEFINITIONS[itemId];

            if (
                !def ||
                !def.floorTraits
            ) {

                continue;
            }

            for (key in def.floorTraits) {

                if (!def.floorTraits.hasOwnProperty(key)) {
                    continue;
                }

                floor =
                    AIH.CursedItems._number(
                        def.floorTraits[key],
                        null
                    );

                if (floor === null) {
                    continue;
                }

                if (!perTrait[key]) {
                    perTrait[key] = [];
                }

                perTrait[key].push(floor);
            }
        }

        merged = {};

        for (key in perTrait) {

            if (!perTrait.hasOwnProperty(key)) {
                continue;
            }

            values =
                perTrait[key].slice().sort(function(a, b) {
                    return b - a;
                });

            base =
                values[0];

            /*
             * Every ADDITIONAL overlapping floor beyond the highest one
             * nudges the merged floor up a bit further - not full
             * addition (see AIH.CursedItems.STACKING's own comment).
             */
            bonus =
                (values.length - 1) *
                AIH.CursedItems.STACKING.FLOOR_CEILING_OVERLAP_BONUS;

            merged[key] =
                AIH.CursedItems._clamp01(base + bonus);
        }

        return merged;
    };

    AIH.CursedItems._enforceFloors = function() {

        var floors;
        var key;
        var current;

        if (
            typeof AIH.Personality === "undefined" ||
            !AIH.Personality.hasTrait ||
            !AIH.Personality.getTrait ||
            !AIH.Personality.setTrait
        ) {

            return;
        }

        floors =
            AIH.CursedItems._mergedFloorValues();

        for (key in floors) {

            if (!floors.hasOwnProperty(key)) {
                continue;
            }

            if (!AIH.Personality.hasTrait(key)) {
                continue;
            }

            current =
                AIH.Personality.getTrait(key);

            if (current < floors[key]) {

                AIH.Personality.setTrait(key, floors[key]);

                if (
                    typeof AIH.Debug !== "undefined" &&
                    AIH.Debug.log
                ) {

                    AIH.Debug.log(
                        "Cursed item trait floor enforced: kept " +
                        key +
                        " at or above " +
                        floors[key].toFixed(2) +
                        " (merged across active floor-bearing items)"
                    );
                }
            }
        }
    };

    // =========================================================================
    // TRAIT CEILINGS (v0.1.2, merged across every active ceiling-bearing
    // item as of v0.2.0)
    // =========================================================================
    //
    // The mirror image of TRAIT FLOORS above: ceilingTraits pins a named
    // trait to never read ABOVE a given value, under the same
    // activation/enforcement rules. As of v0.2.0, multiple equipped items
    // with an active ceiling on the same trait merge the same way floors
    // do, mirrored: lowest ceiling as base, each additional overlapping
    // item pushes it a little LOWER still.
    //
    // =========================================================================

    AIH.CursedItems._mergedCeilingValues = function() {

        var state;
        var itemId;
        var entry;
        var def;
        var key;
        var ceiling;
        var perTrait;
        var merged;
        var values;
        var base;
        var bonus;

        state =
            AIH.CursedItems._ensure();

        perTrait = {};

        if (!state) {
            return {};
        }

        for (itemId in state.equipped) {

            if (!state.equipped.hasOwnProperty(itemId)) {
                continue;
            }

            entry =
                state.equipped[itemId];

            if (
                entry.conditionMet ||
                !entry.ceilingActive
            ) {

                continue;
            }

            def =
                AIH.CursedItems.DEFINITIONS[itemId];

            if (
                !def ||
                !def.ceilingTraits
            ) {

                continue;
            }

            for (key in def.ceilingTraits) {

                if (!def.ceilingTraits.hasOwnProperty(key)) {
                    continue;
                }

                ceiling =
                    AIH.CursedItems._number(
                        def.ceilingTraits[key],
                        null
                    );

                if (ceiling === null) {
                    continue;
                }

                if (!perTrait[key]) {
                    perTrait[key] = [];
                }

                perTrait[key].push(ceiling);
            }
        }

        merged = {};

        for (key in perTrait) {

            if (!perTrait.hasOwnProperty(key)) {
                continue;
            }

            values =
                perTrait[key].slice().sort(function(a, b) {
                    return a - b;
                });

            base =
                values[0];

            bonus =
                (values.length - 1) *
                AIH.CursedItems.STACKING.FLOOR_CEILING_OVERLAP_BONUS;

            merged[key] =
                AIH.CursedItems._clamp01(base - bonus);
        }

        return merged;
    };

    AIH.CursedItems._enforceCeilings = function() {

        var ceilings;
        var key;
        var current;

        if (
            typeof AIH.Personality === "undefined" ||
            !AIH.Personality.hasTrait ||
            !AIH.Personality.getTrait ||
            !AIH.Personality.setTrait
        ) {

            return;
        }

        ceilings =
            AIH.CursedItems._mergedCeilingValues();

        for (key in ceilings) {

            if (!ceilings.hasOwnProperty(key)) {
                continue;
            }

            if (!AIH.Personality.hasTrait(key)) {
                continue;
            }

            current =
                AIH.Personality.getTrait(key);

            if (current > ceilings[key]) {

                AIH.Personality.setTrait(key, ceilings[key]);

                if (
                    typeof AIH.Debug !== "undefined" &&
                    AIH.Debug.log
                ) {

                    AIH.Debug.log(
                        "Cursed item trait ceiling enforced: kept " +
                        key +
                        " at or below " +
                        ceilings[key].toFixed(2) +
                        " (merged across active ceiling-bearing items)"
                    );
                }
            }
        }
    };

    // =========================================================================
    // TEMPORARY PSYCHOLOGY OVERRIDE (snapshot / apply / restore)
    // =========================================================================
    //
    // Uses AIH.Personality.setTrait/AIH.Emotions.setValue directly rather
    // than PersonalityDrift.reinforce() - this is a forced, external,
    // temporary override (the cursed item(s) choosing for her, for one
    // decision), not organic drift. It is restored immediately after the
    // one evaluation it was invoked for. As of v0.2.0 the applied
    // trait/emotion maps may already be the MERGED result of several
    // triggered items (see _mergeInvertedMap() below) - this function
    // itself doesn't need to know or care how many items contributed,
    // it just snapshots-and-applies whatever single combined map it's
    // given, then restores it exactly.
    //
    // =========================================================================

    AIH.CursedItems._applyOverride = function(itemIds, invertedTraits, invertedEmotions) {

        var state;
        var snapshot;
        var key;

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return false;
        }

        snapshot = {
            itemIds: itemIds,
            traits: {},
            emotions: {}
        };

        for (key in invertedTraits) {

            if (!invertedTraits.hasOwnProperty(key)) {
                continue;
            }

            if (!AIH.Personality.hasTrait(key)) {
                continue;
            }

            snapshot.traits[key] =
                AIH.Personality.getTrait(key);

            AIH.Personality.setTrait(
                key,
                invertedTraits[key]
            );
        }

        for (key in invertedEmotions) {

            if (!invertedEmotions.hasOwnProperty(key)) {
                continue;
            }

            snapshot.emotions[key] =
                AIH.Emotions.getValue(key);

            AIH.Emotions.setValue(
                key,
                invertedEmotions[key]
            );
        }

        state.activeOverride =
            snapshot;

        return true;
    };

    AIH.CursedItems._restoreOverride = function() {

        var state;
        var snapshot;
        var key;

        state =
            AIH.CursedItems._ensure();

        if (
            !state ||
            !state.activeOverride
        ) {

            return false;
        }

        snapshot =
            state.activeOverride;

        for (key in snapshot.traits) {

            if (!snapshot.traits.hasOwnProperty(key)) {
                continue;
            }

            AIH.Personality.setTrait(
                key,
                snapshot.traits[key]
            );
        }

        for (key in snapshot.emotions) {

            if (!snapshot.emotions.hasOwnProperty(key)) {
                continue;
            }

            AIH.Emotions.setValue(
                key,
                snapshot.emotions[key]
            );
        }

        state.activeOverride =
            null;

        return true;
    };

    // =========================================================================
    // MULTI-ITEM CONFLICT MERGE (v0.2.0)
    // =========================================================================
    //
    // When 2+ items TRIGGER on the same decision (see
    // evaluateWithPossibleFlip below) and both define an
    // invertedTraits/invertedEmotions entry for the same key, this decides
    // what value actually gets applied. See AIH.CursedItems.STACKING and
    // the v0.2.0 changelog at the top of this file for the reasoning.
    //
    // =========================================================================

    AIH.CursedItems._mergeInvertedMap = function(triggeredItems, mapName) {

        var perTrait;
        var i;
        var item;
        var map;
        var key;
        var merged;
        var values;
        var winner;
        var j;
        var direction;
        var extra;

        perTrait = {};

        for (i = 0; i < triggeredItems.length; i++) {

            item =
                triggeredItems[i];

            map =
                (item.def.personalityFlip && item.def.personalityFlip[mapName]) ||
                {};

            for (key in map) {

                if (!map.hasOwnProperty(key)) {
                    continue;
                }

                if (!perTrait[key]) {
                    perTrait[key] = [];
                }

                perTrait[key].push(
                    AIH.CursedItems._number(map[key], 0.5)
                );
            }
        }

        merged = {};

        for (key in perTrait) {

            if (!perTrait.hasOwnProperty(key)) {
                continue;
            }

            values =
                perTrait[key];

            /*
             * "Most extreme" = furthest from the neutral midpoint (0.5) -
             * the proposed value that pushes hardest away from center
             * wins as the base.
             */
            winner =
                values[0];

            for (j = 1; j < values.length; j++) {

                if (
                    Math.abs(values[j] - 0.5) >
                    Math.abs(winner - 0.5)
                ) {

                    winner =
                        values[j];
                }
            }

            direction =
                winner < 0.5 ? -1 :
                    (winner > 0.5 ? 1 : 0);

            /*
             * Every OTHER triggered item that also targets this same
             * trait/emotion pushes the winning value a little further in
             * the direction it was already headed - compounding curses
             * should read as compounding.
             */
            extra =
                (values.length - 1) *
                AIH.CursedItems.STACKING.TRAIT_CONFLICT_EXTRA_PER_ITEM;

            merged[key] =
                AIH.CursedItems._clamp01(
                    winner + direction * extra
                );
        }

        return merged;
    };

    // =========================================================================
    // FLIP-AWARE EVALUATION (v0.2.0 - independent multi-item rolls)
    // =========================================================================
    //
    // Drop-in replacement for AIH.PressureEvaluator.evaluate(situation,
    // options) - returns the SAME shape (an evaluation object), plus a
    // few extra fields (flipped, internalConflict, shadowEvaluation,
    // flipItemId, flipItemIds). A minigame that has no idea a cursed item
    // might be active can call this everywhere it would normally call
    // evaluate() directly - when nothing flip-capable is equipped, or no
    // roll triggers, this is byte-for-byte the same as a plain evaluate()
    // call.
    //
    // As of v0.2.0: every equipped, condition-unmet, flip-capable item
    // rolls its OWN chance independently. Zero, one, or several can
    // trigger on the same decision. If several trigger, their
    // invertedTraits/invertedEmotions are merged (see
    // _mergeInvertedMap() above) into ONE combined override, applied
    // once, exactly like a single-item flip always was.
    //
    // =========================================================================

    AIH.CursedItems.evaluateWithPossibleFlip = function(situation, options) {

        var flipCapableItems;
        var triggeredItems;
        var i;
        var item;
        var chance;
        var realEvaluation;
        var flippedEvaluation;
        var mergedTraits;
        var mergedEmotions;
        var internalConflict;
        var triggeredIds;

        flipCapableItems =
            AIH.CursedItems._equippedFlipCapableItems();

        if (flipCapableItems.length === 0) {

            realEvaluation =
                AIH.PressureEvaluator.evaluate(situation, options);

            return Object.assign(
                {},
                realEvaluation,
                {
                    flipped: false,
                    internalConflict: false,
                    shadowEvaluation: null,
                    flipItemId: null,
                    flipItemIds: []
                }
            );
        }

        triggeredItems = [];

        for (i = 0; i < flipCapableItems.length; i++) {

            item =
                flipCapableItems[i];

            chance =
                AIH.CursedItems.currentFlipChance(item.itemId);

            if (Math.random() < chance) {
                triggeredItems.push(item);
            }
        }

        if (triggeredItems.length === 0) {

            realEvaluation =
                AIH.PressureEvaluator.evaluate(situation, options);

            return Object.assign(
                {},
                realEvaluation,
                {
                    flipped: false,
                    internalConflict: false,
                    shadowEvaluation: null,
                    flipItemId: null,
                    flipItemIds: []
                }
            );
        }

        /*
         * Shadow evaluation FIRST, with her genuine (not yet overridden)
         * psychology - purely diagnostic, never used to decide anything,
         * discarded from any drift/outcome reporting the caller does
         * afterward.
         */
        realEvaluation =
            AIH.PressureEvaluator.evaluate(situation, options);

        mergedTraits =
            AIH.CursedItems._mergeInvertedMap(
                triggeredItems,
                "invertedTraits"
            );

        mergedEmotions =
            AIH.CursedItems._mergeInvertedMap(
                triggeredItems,
                "invertedEmotions"
            );

        triggeredIds =
            triggeredItems.map(function(t) {
                return t.itemId;
            });

        AIH.CursedItems._applyOverride(
            triggeredIds,
            mergedTraits,
            mergedEmotions
        );

        flippedEvaluation =
            AIH.PressureEvaluator.evaluate(situation, options);

        AIH.CursedItems._restoreOverride();

        for (i = 0; i < triggeredItems.length; i++) {

            item =
                triggeredItems[i];

            item.entry.totalFlipsTriggered += 1;

            if (
                item.def.floorTraits &&
                !item.entry.floorActive
            ) {

                item.entry.floorActive = true;
            }

            if (
                item.def.ceilingTraits &&
                !item.entry.ceilingActive
            ) {

                item.entry.ceilingActive = true;
            }
        }

        internalConflict =
            flippedEvaluation.response !==
            realEvaluation.response;

        return Object.assign(
            {},
            flippedEvaluation,
            {
                flipped: true,
                internalConflict: internalConflict,
                shadowEvaluation: realEvaluation,
                flipItemId: triggeredIds[0],
                flipItemIds: triggeredIds
            }
        );
    };

    // =========================================================================
    // INTERNAL CONFLICT NARRATION
    // =========================================================================

    AIH.CursedItems.CONFLICT_LINES = {

        inhibition: [
            "No - this isn't - I don't want this. Why won't my body listen?",
            "She hears herself agree before she's decided anything at all.",
            "Some small, furious part of her is still refusing. It isn't the part in control."
        ],

        pride: [
            "She should care more than this. She knows she should. She doesn't.",
            "The old her would never have let this happen. The old her isn't the one answering right now.",
            "Somewhere underneath, she's still shouting. It doesn't reach her mouth."
        ],

        confidence: [
            "Her hands are steady. That isn't reassuring - it should be shaking.",
            "She watches herself go along with it, calm as anything, and hates how calm it is.",
            "This certainty isn't hers. She recognizes that much, at least."
        ],

        attentionSeeking: [
            "She shouldn't want them to look. She catches herself hoping they will anyway.",
            "A part of her recoils from the attention. A louder part leans into it.",
            "She tells herself it's just the ring. She isn't sure she believes that anymore."
        ],

        defiance: [
            "The refusal is right there. It just won't come out.",
            "She means to push back. What comes out instead is compliance."
        ],

        trust: [
            "Something about this doesn't add up. She trusts it anyway.",
            "She knows better than this. She's not sure why that doesn't matter right now."
        ],

        _default: [
            "Something in her is fighting this. Something else is winning.",
            "This isn't her choice. It doesn't stop it from being her hands, her voice, her yes."
        ]

    };

    AIH.CursedItems.getConflictLine = function(trait) {

        var pool;

        pool =
            AIH.CursedItems.CONFLICT_LINES[trait] ||
            AIH.CursedItems.CONFLICT_LINES._default;

        return AIH.CursedItems._pickRandom(pool);
    };

    AIH.CursedItems.recordConflictBelief = function(trait, reason) {

        var proposition;
        var existing;

        if (
            typeof AIH.Beliefs === "undefined" ||
            !AIH.Beliefs.add
        ) {

            return null;
        }

        proposition =
            "I don't understand why this doesn't bother me the way I know it should.";

        existing =
            AIH.Beliefs.getByProposition ?
                AIH.Beliefs.getByProposition(proposition) :
                null;

        if (existing) {

            return AIH.Beliefs.updateConfidence(
                existing.id,
                AIH.CursedItems._clamp01(
                    existing.confidence + 0.06
                ),
                reason ||
                    ("cursed item conflict: " + trait)
            );
        }

        return AIH.Beliefs.add(
            proposition,
            0.5,
            { category: "self_narrative" }
        );
    };

    // =========================================================================
    // QUERY
    // =========================================================================

    AIH.CursedItems.getStatus = function() {

        var state;

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return null;
        }

        return JSON.parse(
            JSON.stringify(state)
        );
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.CursedItems.initialize = function() {

        AIH.CursedItems._ensure();

        AIH.CursedItems._initialized =
            true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Cursed items system initialized."
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
            "CursedItems",
            {
                version:
                    AIH.CursedItems.VERSION,

                initialize: function() {
                    AIH.CursedItems.initialize();
                },

                forceEquip: function(itemId, source, actorId) {
                    return AIH.CursedItems.forceEquip(itemId, source, actorId);
                },

                markConditionMet: function(itemId) {
                    return AIH.CursedItems.markConditionMet(itemId);
                },

                removeCursedItem: function(itemId, actorId) {
                    return AIH.CursedItems.removeCursedItem(itemId, actorId);
                },

                recordAction: function() {
                    AIH.CursedItems.recordAction();
                },

                evaluateWithPossibleFlip: function(situation, options) {
                    return AIH.CursedItems.evaluateWithPossibleFlip(situation, options);
                },

                getStatus: function() {
                    return AIH.CursedItems.getStatus();
                }
            }
        );
    }

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_CursedItems",
            "ForceEquip",
            function(args) {

                AIH.CursedItems.forceEquip(
                    args && args.itemId,
                    args && args.source,
                    args && Number(args.actorId)
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_CursedItems",
            "MarkConditionMet",
            function(args) {

                AIH.CursedItems.markConditionMet(
                    args && args.itemId
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_CursedItems",
            "RemoveCursedItem",
            function(args) {

                AIH.CursedItems.removeCursedItem(
                    args && args.itemId,
                    args && Number(args.actorId)
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_CursedItems",
            "Show",
            function() {

                AIH.Debug.inspect(
                    "Cursed items status:",
                    AIH.CursedItems.getStatus()
                );
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_CursedItems_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_CursedItems_createGameObjects.call(
                this
            );

            AIH.CursedItems.initialize();
        };

        var _AIH_CursedItems_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_CursedItems_setupNewGame.call(
                this
            );

            AIH.CursedItems._initialized =
                false;

            AIH.CursedItems.initialize();
        };

        var _AIH_CursedItems_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_CursedItems_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.CursedItems._initialized =
                    false;

                AIH.CursedItems.initialize();
            };
    }

})();