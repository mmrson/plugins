/*:
 * @plugindesc AI Hero Framework - Cursed Items System v0.1.0
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
 * consciously fighting the cursed item and visibly losing - see
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
 *   markConditionMet()
 * - modify AIH_PressureEvaluator.js, AIH_PersonalityDrift.js, or any
 *   other authoritative module
 * - call an LLM for the internal-conflict narration - it is a small,
 *   static line pool, per MINIGAME_HANDOFF.md Section 12
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

    AIH.CursedItems.VERSION = "0.1.0";

    AIH.CursedItems.SCHEMA_VERSION = 1;

    AIH.CursedItems._initialized = false;

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
                 * equipment slots work anyway).
                 */
                equipped: {},

                /*
                 * At most one in-flight temporary override at a time -
                 * evaluateWithPossibleFlip() is not reentrant across
                 * overlapping calls. Holds a snapshot of her real values
                 * so they can be restored exactly.
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
    // code path. Four examples spanning the design space discussed:
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

            /*
             * The bikini example: locks EVERY other equipment slot, not
             * just its own - equipSlotLock is what
             * isEquipChangeOk (below) checks for that. The curse here is
             * as much situational (what she's wearing, and where) as
             * psychological - a mild flip toward more comfort with being
             * looked at, on top of the equip lock doing most of the
             * narrative work on its own.
             */
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

        // ---------------------------------------------------------------
        // Shame / shyness axis - NOT always "loosens her up." This one
        // pushes the opposite way: extreme inhibition and embarrassment,
        // a freezing/paralyzing curse rather than a disinhibiting one.
        // Deliberately the inverse flavor of ring_of_reckless_confidence.
        // ---------------------------------------------------------------

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

        // ---------------------------------------------------------------
        // Submission / meekness axis - the classic collar. Made harder to
        // remove BY DESIGN: the removal condition itself requires
        // overcoming the exact trait the curse suppresses, so escaping it
        // means beating it at least once regardless.
        // ---------------------------------------------------------------

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

        // ---------------------------------------------------------------
        // Attention-seeking / validation-seeking axis.
        // ---------------------------------------------------------------

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

        // ---------------------------------------------------------------
        // Independence axis - "firmly believes she needs party members."
        // The psychological half lives here; an actual gameplay penalty
        // for being separated from the party (if wanted) belongs in the
        // item's own RPG Maker database entry, same boundary already
        // established for stat bonuses elsewhere in this file.
        // ---------------------------------------------------------------

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

        // ---------------------------------------------------------------
        // Shame axis, punishment framing rather than clothing - a visible
        // mark rather than a garment, so it doesn't lock other slots, but
        // its whole premise is that it can't be hidden by anything she
        // does wear.
        // ---------------------------------------------------------------

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

        // ---------------------------------------------------------------
        // Attention-seeking + inhibition together - a performer's curse,
        // confidence built entirely on being watched.
        // ---------------------------------------------------------------

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

        // ---------------------------------------------------------------
        // Submission + independence together, directed at ONE specific
        // figure rather than people in general - a full outfit, so it
        // locks other slots (matches sunbleached_swimwear's precedent for
        // "the garment IS the curse, not an accessory alongside it").
        // ---------------------------------------------------------------

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

        // ---------------------------------------------------------------
        // Assertiveness axis, OPPOSITE direction - forces her to be
        // MORE blunt/argumentative/defiant than she wants, not less. A
        // curse doesn't have to mean submission; this one damages her
        // relationships through forced rudeness instead.
        // ---------------------------------------------------------------

        contrary_charm: {

            name: "Contrary Charm",
            defaultSource: "voluntary",

            equipSlotLock: false,

            personalityFlip: {

                enabled: true,

                invertedTraits: {
                    assertiveness: 0.95,
                    defiance: 0.9,
                    mercy: 0.2
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

        // ---------------------------------------------------------------
        // Independence + trust together - not meekness, a different
        // failure mode: relying on and trusting whoever's nearest rather
        // than her own judgment, regardless of whether they've earned it.
        // ---------------------------------------------------------------

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

        /*
         * Actually equipping the item on the RPG Maker actor is left to
         * whatever event/battle script calls this - $gameActors.actor(n)
         * .changeEquip(slotId, item) needs the actual RMMZ item object,
         * which this generic module deliberately does not look up itself
         * (it doesn't know the itemId <-> database item mapping - that's
         * the caller's job, since it already has the $dataArmors/
         * $dataWeapons reference at the point it's opening the chest or
         * resolving the enemy action). This function's job is purely the
         * AIH-side bookkeeping: marking it locked and starting the flip
         * clock. If no actor can be resolved, the bookkeeping still
         * happens (useful for testing / headless use), it just can't log
         * an actor-specific note.
         */
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

            totalFlipsTriggered: 0
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

        /*
         * Actually unequipping on the RPG Maker actor (changeEquip with a
         * null item, or removeEquip) is again the caller's job for the
         * same reason as forceEquip - this clears the AIH-side lock.
         */
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
    //
    // Game_Actor.prototype.isEquipChangeOk(slotId) is the canonical MZ
    // hook for "can this equipment slot be changed right now" - the
    // default equip menu, and any well-behaved plugin, already calls it
    // before allowing a slot change. A cursed item's own slot returns
    // false until its condition is met; if any equipped cursed item has
    // equipSlotLock, EVERY other slot is also locked while it's on.
    //
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

                    /*
                     * Matching a database item back to an itemId is the
                     * same "caller already knows the mapping" boundary as
                     * forceEquip/removeCursedItem - this checks against
                     * whatever the equipped entry recorded, not by name
                     * matching, so it stays correct even if two cursed
                     * items happen to share a display name.
                     */
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

                /*
                 * A slot-locking cursed item is equipped somewhere and
                 * this slot holds something else - locked too, unless
                 * THIS slot is the cursed item's own slot (already
                 * handled above) or the condition for the locking item
                 * has been met.
                 */
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
    //
    // recordAction() is the generic entry point ANY system can call on
    // whatever it considers "an action" - a minigame resolving a request,
    // a combat turn, a dialogue choice. It does not itself decide what
    // counts; per the design discussion, "any action where personality
    // would normally determine an outcome" is broad by intent, so callers
    // are expected to call this liberally rather than this module trying
    // to guess.
    //
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
    };

    AIH.CursedItems._primaryFlipItem = function() {

        var state;
        var itemId;
        var def;

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return null;
        }

        /*
         * "Primary" = first equipped item found with an enabled flip.
         * Multiple simultaneously-equipped flip-capable cursed items
         * stacking their chances is deliberately out of scope for v0.1 -
         * flag it if that combination ever actually comes up in play,
         * rather than guessing at a stacking rule nobody asked for.
         */
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

                return {
                    itemId: itemId,
                    def: def,
                    entry: state.equipped[itemId]
                };
            }
        }

        return null;
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
    // TEMPORARY PSYCHOLOGY OVERRIDE (snapshot / apply / restore)
    // =========================================================================
    //
    // Uses AIH.Personality.setTrait/AIH.Emotions.setValue directly rather
    // than PersonalityDrift.reinforce() - this is a forced, external,
    // temporary override (the cursed item choosing for her, for one
    // decision), not organic drift, so the "deltas are small, reward-
    // gated, slow-changing" rule that governs reinforce() deliberately
    // does not apply here. It is restored immediately after the one
    // evaluation it was invoked for - the ONLY thing that can outlive the
    // override is whatever PersonalityDrift.reinforce() call the CALLING
    // minigame code makes afterward, based on how that evaluation came
    // out, exactly as it would for any other evaluation.
    //
    // =========================================================================

    AIH.CursedItems._applyOverride = function(itemId, invertedTraits, invertedEmotions) {

        var state;
        var snapshot;
        var key;

        state =
            AIH.CursedItems._ensure();

        if (!state) {
            return false;
        }

        snapshot = {
            itemId: itemId,
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
    // FLIP-AWARE EVALUATION
    // =========================================================================
    //
    // Drop-in replacement for AIH.PressureEvaluator.evaluate(situation,
    // options) - returns the SAME shape (an evaluation object), plus a
    // few extra fields (flipped, internalConflict, shadowEvaluation,
    // flipItemId). A minigame that has no idea a cursed item might be
    // active can call this everywhere it would normally call
    // evaluate() directly - when nothing flip-capable is equipped, or the
    // roll doesn't trigger, this is byte-for-byte the same as a plain
    // evaluate() call.
    //
    // =========================================================================

    AIH.CursedItems.evaluateWithPossibleFlip = function(situation, options) {

        var primary;
        var chance;
        var triggered;
        var realEvaluation;
        var flippedEvaluation;
        var internalConflict;

        primary =
            AIH.CursedItems._primaryFlipItem();

        if (!primary) {

            realEvaluation =
                AIH.PressureEvaluator.evaluate(situation, options);

            return Object.assign(
                {},
                realEvaluation,
                {
                    flipped: false,
                    internalConflict: false,
                    shadowEvaluation: null,
                    flipItemId: null
                }
            );
        }

        chance =
            AIH.CursedItems.currentFlipChance(primary.itemId);

        triggered =
            Math.random() < chance;

        if (!triggered) {

            realEvaluation =
                AIH.PressureEvaluator.evaluate(situation, options);

            return Object.assign(
                {},
                realEvaluation,
                {
                    flipped: false,
                    internalConflict: false,
                    shadowEvaluation: null,
                    flipItemId: primary.itemId
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

        AIH.CursedItems._applyOverride(
            primary.itemId,
            primary.def.personalityFlip.invertedTraits || {},
            primary.def.personalityFlip.invertedEmotions || {}
        );

        flippedEvaluation =
            AIH.PressureEvaluator.evaluate(situation, options);

        AIH.CursedItems._restoreOverride();

        primary.entry.totalFlipsTriggered += 1;

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
                flipItemId: primary.itemId
            }
        );
    };

    // =========================================================================
    // INTERNAL CONFLICT NARRATION
    // =========================================================================
    //
    // Small, static line pools - no LLM, per MINIGAME_HANDOFF.md Section
    // 12. Deliberately at the pattern level (a few lines per trait), not
    // an exhaustive script - callers pick one and can freely wrap it with
    // their own scene-specific framing text.
    //
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

    /*
     * Turns a detected internal-conflict moment into a lasting
     * self_narrative belief, per AIH_Beliefs.js's existing category
     * convention (see MINIGAME_HANDOFF.md Section 4). Deduplicates
     * against an existing belief for the same trait, strengthening it
     * with each further conflict rather than spawning duplicates -
     * exactly the pattern AIH_Beliefs.add()/updateConfidence() already
     * establish elsewhere in this project.
     */
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