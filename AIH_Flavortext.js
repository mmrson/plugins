/*:
 * @plugindesc AI Hero Framework - Reactive Flavor Text v0.1.2
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - REACTIVE FLAVOR TEXT
 * ============================================================================
 *
 * A standalone content system, independent of the minigames and of
 * AIH_BattleCutins.js - it never calls AIH.PressureEvaluator and never
 * decides anything. It only answers one question: "given her REAL current
 * personality/values (or, for one entry, a specific NPC relationship),
 * which tier of flavor text for this item/object should show right now."
 *
 * ============================================================================
 *
 * ENTRY SHAPE (see ENTRIES below)
 *
 *     driverType    "trait" | "value" | "relationship" | "cursedItem" |
 *                   "hardCapped"
 *     driverName    a key on AIH.Personality (if "trait") or AIH.Values
 *                   (if "value") - ignored otherwise
 *     npcId         only for "relationship" - the AIH.Relationships id to
 *                   read trust from
 *     itemId        only for "cursedItem" - an AIH.CursedItems.DEFINITIONS
 *                   key (see AIH_CursedItems.js)
 *     metric        only for "cursedItem" - "flips" (totalFlipsTriggered)
 *                   or "duration" (actionsSinceEquip)
 *     normalize     only for "cursedItem", optional - how many
 *                   flips/actions count as "fully progressed" (default 8
 *                   for flips, 40 for duration)
 *     direction     "increase" | "decrease" - which direction of drift
 *                   advances through the tiers. Ignored for "hardCapped"
 *                   and "cursedItem" (both are inherently one-directional).
 *     tiers         ordered array of { threshold: 0..1, text: "..." } -
 *                   the highest threshold at or below her current
 *                   progress level wins. tiers[0].threshold should be 0.
 *
 * "hardCapped" entries (see noble_wine below) have exactly one tier and
 * NEVER change, regardless of any drift - this is a deliberate, permanent
 * feature of the character, not a placeholder waiting to be filled in
 * later. Per explicit project direction: some things are not up for
 * drift at all.
 *
 * ============================================================================
 *
 * HOW A "PROGRESS LEVEL" IS COMPUTED
 *
 * For "trait"/"value" drivers: direction "increase" reads the trait/value
 * directly as the 0..1 progress level; direction "decrease" reads
 * (1 - value), so a trait that's MEANT to fall (inhibition, assertiveness,
 * pride) still maps onto a rising 0..1 progress scale the tiers can
 * threshold against normally.
 *
 * For "relationship" drivers: progress level is
 * clamp01(relationship.trust / 100).
 *
 * For "cursedItem" drivers (AIH_CursedItems.js integration): progress
 * level is clamp01(peak / normalize), where "peak" is a high-water mark
 * this module keeps ON ITS OWN - see _observeCursedItemPeak below.
 * AIH.CursedItems deletes an item's own tracking (totalFlipsTriggered/
 * actionsSinceEquip) the instant it's removed, since that module has no
 * reason to remember a curse once it's gone - but AIH_CursedItems.js's
 * own header is explicit that personality drift EARNED during a curse is
 * permanent, not reverted. The same has to be true of how she TALKS
 * about a curse she's broken free of, so this module observes and raises
 * its own peak every time a "cursedItem" entry is resolved while the
 * item is still equipped, and simply keeps reading that peak forever
 * after - a removed cursed item's flavor text stays at whatever level it
 * last reached, exactly as intended.
 *
 * ============================================================================
 *
 * TWO WAYS TO USE AN ENTRY
 *
 * 1. Directly, from anywhere (dialogue, a common event script call, another
 *    plugin) via AIH.FlavorText.getText(key) - most of the entries below
 *    (clothing/exposure, assertiveness, attentionSeeking, shame-to-express)
 *    are "moments," not literal inventory items, and are meant to be
 *    called this way.
 *
 * 2. Automatically, for a real database item/weapon/armor: tag its note
 *    box with <AIHFlavorKey:key> and Window_Help will show the resolved
 *    tier's text instead of the item's own fixed description whenever
 *    that item is highlighted. See the ENGINE HOOKS section at the bottom.
 *    A handful of entries below (ale_beer, monster_meat, hardtack,
 *    trophy_claw, bath_oil_soap, dubious_coin_purse, poisoned_blade,
 *    trinket_gift_regular, noble_wine) are written with this in mind;
 *    the rest are not tied to any particular database item and are meant
 *    for direct use per (1).
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide anything about her psychology (read-only against AIH.Personality
 *   /AIH.Values/AIH.Relationships, never writes to any of them)
 * - invent new tiers/entries at runtime - add one as data, in ENTRIES,
 *   not a new code path
 * - override a database item's description unless that item is explicitly
 *   tagged with <AIHFlavorKey:...>
 *
 * ============================================================================
 *
 * v0.1.2 CHANGELOG
 *
 * - NEW entries: charm_of_the_eager_mouth, blindfold_of_the_watched_eyes,
 *   cuffs_of_no_choosing, bit_of_obedient_silence,
 *   leash_of_the_devoted_mouth - the mouth/tasting-focused cursed item
 *   set added to AIH_CursedItems.js in the same version.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.FlavorText = AIH.FlavorText || {};

    AIH.FlavorText.VERSION = "0.1.2";

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.FlavorText._clamp01 = function(value) {

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

    AIH.FlavorText._number = function(value, fallback) {

        var result;

        result = Number(value);

        if (isNaN(result)) {
            return fallback;
        }

        return result;
    };

    // =========================================================================
    // PERSISTENT STATE - cursed-item high-water marks only
    // =========================================================================
    //
    // AIH.CursedItems deletes an item's own tracking (actionsSinceEquip,
    // totalFlipsTriggered) the moment it's removed via removeCursedItem()
    // - by design, that module has no reason to remember a curse once
    // it's gone. But AIH_CursedItems.js's own header is explicit that
    // drift EARNED during a curse is permanent, not reverted once the
    // item comes off - the exact same philosophy has to apply to how she
    // TALKS about a curse she's broken free of, or the flavor text would
    // snap back to "brand new curse" the instant it's removed, which
    // would contradict the very module it's reading from. So this module
    // keeps its own small, independent high-water mark per cursed item -
    // observed from AIH.CursedItems while equipped, and simply retained
    // (never decremented) after removal. Follows the same defensive
    // _ensure() container pattern as every other AIH_*.js module.
    //
    // =========================================================================

    AIH.FlavorText._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.FlavorText._ensure = function() {

        var state;

        state =
            AIH.FlavorText._state();

        if (!state) {
            return null;
        }

        if (!state.flavorText) {

            state.flavorText = {
                cursedPeaks: {}
            };
        }

        if (
            !state.flavorText.cursedPeaks ||
            typeof state.flavorText.cursedPeaks !== "object"
        ) {

            state.flavorText.cursedPeaks = {};
        }

        return state.flavorText;
    };

    /*
     * Reads the CURRENT live value from AIH.CursedItems (if the item is
     * still equipped), raises this module's own stored peak to match if
     * it's higher, and returns the peak either way - so a removed item's
     * flavor text keeps reading whatever level it last reached.
     */
    AIH.FlavorText._observeCursedItemPeak = function(itemId, metric) {

        var state;
        var liveStatus;
        var liveEntry;
        var liveValue;

        state =
            AIH.FlavorText._ensure();

        if (!state) {
            return 0;
        }

        if (!state.cursedPeaks[itemId]) {

            state.cursedPeaks[itemId] = {
                flips: 0,
                duration: 0
            };
        }

        if (
            typeof AIH.CursedItems !== "undefined" &&
            AIH.CursedItems.getStatus &&
            AIH.CursedItems.isEquipped &&
            AIH.CursedItems.isEquipped(itemId)
        ) {

            liveStatus =
                AIH.CursedItems.getStatus();

            liveEntry =
                liveStatus &&
                liveStatus.equipped ?
                    liveStatus.equipped[itemId] :
                    null;

            if (liveEntry) {

                liveValue =
                    metric === "flips" ?
                        liveEntry.totalFlipsTriggered :
                        liveEntry.actionsSinceEquip;

                if (
                    (Number(liveValue) || 0) >
                    state.cursedPeaks[itemId][metric]
                ) {

                    state.cursedPeaks[itemId][metric] =
                        Number(liveValue) || 0;
                }
            }
        }

        return state.cursedPeaks[itemId][metric];
    };

    // =========================================================================
    // ENTRIES (DATA)
    // =========================================================================
    //
    // Every tier list below reads T0 -> T1 -> T2 top to bottom (T0 is
    // always threshold 0, i.e. "before any drift"). Thresholds are evenly
    // spaced (0 / 0.35 / 0.7) except where noted - none of these are
    // meant to be hit hair-trigger-fast, but none should feel
    // impossibly distant either.
    //
    // =========================================================================

    AIH.FlavorText.ENTRIES = {

        // --- misc items (several tied to real database items via
        // <AIHFlavorKey:...> - see header) -------------------------------

        ale_beer: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Strange liquid, yellowish, slightly bitter. Not very tasty." },
                { threshold: 0.35, text: "It's growing on her. Still bitter, but the warmth after is nice." },
                { threshold: 0.70, text: "This is beer. She likes beer. It makes her feel warm inside, among friends." }
            ]
        },

        noble_wine: {
            driverType: "hardCapped",
            tiers: [
                { threshold: 0.00, text: "Sour and overpriced. She doesn't see the appeal nobles claim to find in it." }
            ]
        },

        monster_meat: {
            driverType: "trait",
            driverName: "courage",
            direction: "increase",
            tiers: [
                { threshold: 0.00, text: "It still looks like it used to have too many legs. She eats it because rations are rations." },
                { threshold: 0.35, text: "Actually not bad, if seasoned right. She's stopped thinking about the legs." },
                { threshold: 0.70, text: "One of her favorite trail meals now - she has strong opinions about which monsters taste best." }
            ]
        },

        hardtack: {
            driverType: "value",
            driverName: "survival",
            direction: "increase",
            tiers: [
                { threshold: 0.00, text: "Dense, dry, faintly stale. Fuel, not food." },
                { threshold: 0.35, text: "She's learned to soak it first. Still not good, tolerable now." },
                { threshold: 0.70, text: "Oddly comforting - the taste of getting through." }
            ]
        },

        trophy_claw: {
            driverType: "trait",
            driverName: "pride",
            direction: "increase",
            tiers: [
                { threshold: 0.00, text: "A grim little souvenir. Not sure why people collect these." },
                { threshold: 0.35, text: "She's started keeping the interesting ones. Proof of what she's beaten." },
                { threshold: 0.70, text: "A whole shelf of them now - proud of every one, and she can tell you exactly how each fight went." }
            ]
        },

        bath_oil_soap: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Overly sweet, faintly ridiculous. Not something a serious adventurer needs." },
                { threshold: 0.35, text: "It's - fine. Practical, even. Looking presentable can matter, out there. That's all this is." },
                { threshold: 0.70, text: "She won't say it outright, but she's noticed: being looked at kindly opens doors a blade doesn't. She keeps the bottle full." }
            ]
        },

        dubious_coin_purse: {
            driverType: "trait",
            driverName: "pride",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Ill-gotten. She doesn't like carrying it." },
                { threshold: 0.35, text: "Money's money. She's stopped asking where it came from, mostly." },
                { threshold: 0.70, text: "Doesn't think twice about it anymore - everyone cuts corners, and she's not above it." }
            ]
        },

        poisoned_blade: {
            driverType: "trait",
            /*
             * "mercy" was the original driver here but has been retired
             * as a stored trait entirely (see AIH_Personality.js's
             * getDecisiveness()) - pride is the replacement, matching the
             * mercy-retirement convention used across
             * AIH_PressureEvaluator.js, AIH_CursedItems.js, and
             * AIH_Minigame_TasteTest.js.
             */
            driverName: "pride",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She doesn't carry poison. It's not how she fights." },
                { threshold: 0.35, text: "She's started keeping a vial on her, just in case. Hasn't used it yet." },
                { threshold: 0.70, text: "Whatever gets the job done. She's used worse." }
            ]
        },

        trinket_gift_regular: {
            driverType: "relationship",
            npcId: "tavern_old_grum",
            tiers: [
                { threshold: 0.00, text: "A small thing. Kind of him, she supposes, though she barely knows him." },
                { threshold: 0.35, text: "She's kept it. Nice, having someone who thinks of her." },
                { threshold: 0.70, text: "One of her most treasured possessions now - from someone she trusts completely." }
            ]
        },

        // --- assertiveness (decrease) - finding ease in being led ---------

        training_collar: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She refuses to wear anything with a place for someone else to hold onto her - it's not a leash, but it looks like one." },
                { threshold: 0.35, text: "It's just a design detail. She tells herself that." },
                { threshold: 0.70, text: "She likes knowing someone could hold onto it, if they wanted to. She'd never say that to their face." }
            ]
        },

        direct_order: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She pushes back. Always." },
                { threshold: 0.35, text: "She still has opinions. She's stopped voicing all of them." },
                { threshold: 0.70, text: "There's a strange relief in just being told what to do, sometimes. She'd die before admitting that out loud." }
            ]
        },

        practice_restraints: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Undignified. She fights the fit every time." },
                { threshold: 0.35, text: "She's stopped fighting it. It's just part of the drill." },
                { threshold: 0.70, text: "She doesn't mind them anymore. Might even ask for them, if the trainer forgets." }
            ]
        },

        blindfold: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Being made to not see what's happening to her - unacceptable." },
                { threshold: 0.35, text: "She's stopped tensing the moment it goes on." },
                { threshold: 0.70, text: "There's something almost restful about not having to be in control of anything, for once." }
            ]
        },

        collar_handle_loop: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She won't wear anything with a place for someone else to hold onto her." },
                { threshold: 0.35, text: "It's just a design detail. She tells herself that." },
                { threshold: 0.70, text: "She likes knowing someone could hold onto it, if they wanted to. She'd never say that to their face." }
            ]
        },

        itinerary_written_for_her: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She rewrites it. She decides her own schedule." },
                { threshold: 0.35, text: "She follows it without complaint, mostly." },
                { threshold: 0.70, text: "There's less to think about when someone else already decided. She could get used to this - she has." }
            ]
        },

        outfit_chosen_by_other: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She changes into something else the moment they leave." },
                { threshold: 0.35, text: "She wears what's picked out. It's easier than arguing." },
                { threshold: 0.70, text: "She waits to be told what to wear now, some mornings, instead of deciding herself." }
            ]
        },

        good_girl_reward: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Patronizing. She glares every time someone says it." },
                { threshold: 0.35, text: "She doesn't glare anymore. She just goes quiet for a second." },
                { threshold: 0.70, text: "She finds herself doing things specifically to hear it again. She will deny this under any amount of questioning." }
            ]
        },

        being_carried: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She pushes off and walks it herself, every time, no matter the state she's in." },
                { threshold: 0.35, text: "She's stopped insisting, when she's too tired to argue." },
                { threshold: 0.70, text: "She's stopped waiting until she's too tired." }
            ]
        },

        kneeling_cushion: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She stands. She always stands." },
                { threshold: 0.35, text: "She kneels when told to. It doesn't mean anything." },
                { threshold: 0.70, text: "She reaches for the cushion before being told to, now." }
            ]
        },

        fed_by_hand: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Humiliating. She takes the food and feeds herself." },
                { threshold: 0.35, text: "She lets it happen once, doesn't make a scene of it." },
                { threshold: 0.70, text: "She'll wait, some days, rather than reach for it herself." }
            ]
        },

        curfew_rule_imposed: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She breaks it on principle." },
                { threshold: 0.35, text: "She keeps it. Convenient, she tells herself, not obedient." },
                { threshold: 0.70, text: "She doesn't test the edges of it anymore. She's not sure when that changed." }
            ]
        },

        correction_token: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She'd rather take a real wound than accept this kind of correction." },
                { threshold: 0.35, text: "She accepts it, jaw tight, and it's over quickly." },
                { threshold: 0.70, text: "She's stopped bracing for it. Some part of her almost expects it, when she's earned it." }
            ]
        },

        negotiated_on_behalf: {
            driverType: "trait",
            driverName: "assertiveness",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She handles her own business. Always has." },
                { threshold: 0.35, text: "She lets them talk, this once. Watches instead." },
                { threshold: 0.70, text: "She's stopped stepping in. It's a relief, letting someone else carry that." }
            ]
        },

        // --- attentionSeeking (increase) - wanting eyes on her -------------

        wanted_notice_board: {
            driverType: "trait",
            driverName: "attentionSeeking",
            direction: "increase",
            tiers: [
                { threshold: 0.00, text: "She'd rather not be talked about at all." },
                { threshold: 0.35, text: "She lingers near it a little longer than she needs to." },
                { threshold: 0.70, text: "She checks it every time she passes, hoping there's a new one." }
            ]
        },

        applause_performance: {
            driverType: "trait",
            driverName: "attentionSeeking",
            direction: "increase",
            tiers: [
                { threshold: 0.00, text: "Uncomfortable. She wants to get off the stage." },
                { threshold: 0.35, text: "She's stopped rushing the exit." },
                { threshold: 0.70, text: "She'll draw it out now, just a little, for the sound of it." }
            ]
        },

        jewelry_noticed: {
            driverType: "trait",
            driverName: "attentionSeeking",
            direction: "increase",
            tiers: [
                { threshold: 0.00, text: "Gaudy. Meant to be seen. Not her style." },
                { threshold: 0.35, text: "She's started wearing it in public, not just for occasions." },
                { threshold: 0.70, text: "She wears it specifically because people notice. She'll deny that's why." }
            ]
        },

        // --- shame to express (not just be seen) ---------------------------

        love_note_confession: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She doesn't know what to do with it. Doesn't respond." },
                { threshold: 0.35, text: "She's kept it. Hasn't answered. Reads it sometimes." },
                { threshold: 0.70, text: "She's written one back, finally - after crossing out three drafts that admitted too much." }
            ]
        },

        asked_if_enjoyed: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "\"Fine,\" she says, and changes the subject." },
                { threshold: 0.35, text: "\"...it was good,\" she admits, not looking at anyone." },
                { threshold: 0.70, text: "She'll actually say she liked it, unprompted, before immediately looking like she regrets saying it." }
            ]
        },

        // --- clothing / exposure (inhibition, decrease - several also
        // list attentionSeeking as a secondary driver in comments; tier
        // selection still reads off inhibition alone, to keep one clear
        // rule per entry rather than blending two drivers into one score) -

        performance_outfit: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Impractical, immodest, not something she'll wear outside a job." },
                { threshold: 0.35, text: "Still not her first choice, but she's stopped dreading putting it on." },
                { threshold: 0.70, text: "She's chosen to wear this one on her own, once or twice - just because she felt like it." }
            ]
        },

        sheer_robe: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "It hides nothing. She keeps it closed with both hands." },
                { threshold: 0.35, text: "She's stopped clutching it shut every time someone walks past." },
                { threshold: 0.70, text: "She lets it hang open more than it needs to. Not that she's doing it on purpose. Probably." }
            ]
        },

        changing_room_no_curtain: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Unacceptable. She waits until it's empty." },
                { threshold: 0.35, text: "She still checks first. Just - takes a little longer to care, now." },
                { threshold: 0.70, text: "She's stopped checking." }
            ]
        },

        fulllength_mirror: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            /*
             * attentionSeeking secondary (per design notes) - "she likes
             * what she sees" reads as a natural pairing, but tier
             * selection stays on inhibition alone.
             */
            tiers: [
                { threshold: 0.00, text: "She avoids it. No reason to dwell." },
                { threshold: 0.35, text: "She catches herself looking longer than she means to." },
                { threshold: 0.70, text: "She actually likes what she sees now - she'd just never say so to anyone's face." }
            ]
        },

        sleepwear_given: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Far too little fabric for her taste. She sleeps in her old clothes instead." },
                { threshold: 0.35, text: "She's worn it. Once or twice. It's comfortable, is all." },
                { threshold: 0.70, text: "It's what she reaches for now, without thinking about it." }
            ]
        },

        uniform_cut_shorter: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She adds a layer underneath before anyone sees her in it." },
                { threshold: 0.35, text: "She's stopped adding the extra layer." },
                { threshold: 0.70, text: "She's had it taken in since - shorter, not longer." }
            ]
        },

        sheer_stockings: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            // attentionSeeking secondary
            tiers: [
                { threshold: 0.00, text: "Pointless - they don't even keep her warm. Practical hose, always." },
                { threshold: 0.35, text: "She's noticed how they're looked at. She hasn't stopped wearing them." },
                { threshold: 0.70, text: "She wears them on purpose now, and she's aware of exactly what that means." }
            ]
        },

        dress_high_slit: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Impractical for anything but standing still and being looked at. Not her." },
                { threshold: 0.35, text: "She's stopped adjusting it every time she sits down." },
                { threshold: 0.70, text: "She picked this one herself, slit and all. Nobody made her." }
            ]
        },

        backless_outfit: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            // attentionSeeking secondary
            tiers: [
                { threshold: 0.00, text: "She keeps her back to the wall all night in this." },
                { threshold: 0.35, text: "She's stopped checking who's behind her." },
                { threshold: 0.70, text: "She likes the reaction when she walks past. That's new." }
            ]
        },

        bathing_garment: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            // attentionSeeking secondary
            tiers: [
                { threshold: 0.00, text: "She swims in her underclothes rather than wear this in front of anyone." },
                { threshold: 0.35, text: "She wears it. Doesn't linger at the water's edge deciding, anymore." },
                { threshold: 0.70, text: "She takes her time getting out of the water now, instead of straight for a towel." }
            ]
        },

        crop_top: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Half a shirt. She adds something underneath every time." },
                { threshold: 0.35, text: "She's stopped layering under it." },
                { threshold: 0.70, text: "She'll wear it with nothing else covering, and catch herself standing a little straighter in it." }
            ]
        },

        fishnet_stockings_gloves: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Decorative, not functional. She doesn't see the point." },
                { threshold: 0.35, text: "She's started wearing them even when nobody's specifically asked." },
                { threshold: 0.70, text: "They're part of how she dresses now, plainly, and she'll tell you it's practical if you ask - it isn't." }
            ]
        },

        shorter_skirt: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She hikes up leggings underneath before leaving the room." },
                { threshold: 0.35, text: "She's stopped hiking up anything underneath." },
                { threshold: 0.70, text: "She had the hem taken up again, unprompted." }
            ]
        },

        cutout_outfit: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Why cut holes in perfectly good fabric. She patches every one she's given." },
                { threshold: 0.35, text: "She's stopped patching them." },
                { threshold: 0.70, text: "She's asked for a second one, same design." }
            ]
        },

        rain_soaked_clothing: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            // attentionSeeking secondary
            tiers: [
                { threshold: 0.00, text: "She wraps herself in a cloak the second it happens, mortified." },
                { threshold: 0.35, text: "She's stopped grabbing for the cloak immediately." },
                { threshold: 0.70, text: "She'll walk the last stretch slowly, in weather like this, and not think too hard about why." }
            ]
        },

        pelvic_tattoo: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Covered by cut and cloth choice alone, always - she picks her bottoms specifically to keep it hidden." },
                { threshold: 0.35, text: "She's stopped being quite so deliberate about the cut of things." },
                { threshold: 0.70, text: "She'll wear something low enough to show it now, and meets the look instead of avoiding it." }
            ]
        },

        barefoot_public: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "Undignified for an adventurer of her standing. Boots, always." },
                { threshold: 0.35, text: "She's stopped putting boots back on the second she's indoors." },
                { threshold: 0.70, text: "She'll walk through town like this now, and doesn't especially care who notices." }
            ]
        },

        festival_costume: {
            driverType: "trait",
            driverName: "inhibition",
            direction: "decrease",
            tiers: [
                { threshold: 0.00, text: "She wears her actual armor instead and ignores the dress code." },
                { threshold: 0.35, text: "She wears the costume. Stiffly, but she wears it." },
                { threshold: 0.70, text: "She's the one suggesting they all dress up next year." }
            ]
        },

        // --- AIH_CursedItems.js integration ---------------------------------
        //
        // Keys match AIH.CursedItems.DEFINITIONS' own itemIds exactly, so
        // a cursed item's actual database entry can use the same
        // <AIHFlavorKey:itemId> notetag wiring any other item does -
        // examining a cursed item while it's equipped (or after it's
        // finally removed) shows how her relationship with it has
        // actually developed.
        //
        // driverType "cursedItem" reads a persistent, never-decremented
        // high-water mark this module keeps on its own (see
        // _observeCursedItemPeak above) - metric "flips" counts how many
        // times the curse has actually taken over a decision
        // (totalFlipsTriggered); "duration" counts how long it's simply
        // been worn (actionsSinceEquip). Both survive the item's removal,
        // matching AIH_CursedItems.js's own "drift is permanent" design.
        //
        // manacles_of_meekness has no personalityFlip block at all in
        // AIH_CursedItems.js (the lock+stat-cost IS the whole curse) - so
        // its entry uses "duration" rather than "flips", since there's
        // never a flip count to read.
        //
        // ---------------------------------------------------------------

        manacles_of_meekness: {
            driverType: "cursedItem",
            itemId: "manacles_of_meekness",
            metric: "duration",
            tiers: [
                { threshold: 0.00, text: "Cold iron, deliberately uncomfortable. She counts the days until she can take them off." },
                { threshold: 0.35, text: "She's stopped counting. They're just there now, a weight she's used to." },
                { threshold: 0.70, text: "She barely notices they're on anymore - which frightens her, some nights, more than the manacles themselves ever did." }
            ]
        },

        collar_of_submission: {
            driverType: "cursedItem",
            itemId: "collar_of_submission",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "It's tight, cold, obviously not hers to remove. She hates every second of it." },
                { threshold: 0.35, text: "There have been moments - more than she'd like - where she simply... didn't fight it." },
                { threshold: 0.70, text: "She's lost count of how many times it's decided for her. She's not sure anymore how much of the not-fighting is still the collar's doing." }
            ]
        },

        ring_of_reckless_confidence: {
            driverType: "cursedItem",
            itemId: "ring_of_reckless_confidence",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "A small stat boost, she told herself. Just a ring." },
                { threshold: 0.35, text: "Every so often she does something she wouldn't have, and only realizes after." },
                { threshold: 0.70, text: "She can't always tell anymore where the ring's nerve ends and hers begins. She's stopped trying to tell the difference." }
            ]
        },

        sunbleached_swimwear: {
            driverType: "cursedItem",
            itemId: "sunbleached_swimwear",
            metric: "duration",
            tiers: [
                { threshold: 0.00, text: "Barely enough fabric to call clothing. She wears a cloak over it the second she's not in the water." },
                { threshold: 0.35, text: "She's stopped reaching for the cloak so quickly." },
                { threshold: 0.70, text: "She doesn't reach for it at all anymore. She's not sure when that stopped feeling strange." }
            ]
        },

        bell_of_the_wallflower: {
            driverType: "cursedItem",
            itemId: "bell_of_the_wallflower",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "A small bell, sewn in at the collar. She doesn't understand yet why it matters." },
                { threshold: 0.35, text: "Twice now, in a crowd, her voice simply refused to come. She still doesn't fully understand it." },
                { threshold: 0.70, text: "She's learned to just not try, in front of people, rather than face the freeze again." }
            ]
        },

        collar_of_sweet_obedience: {
            driverType: "cursedItem",
            itemId: "collar_of_sweet_obedience",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "Snug, faintly warm, entirely not something she agreed to." },
                { threshold: 0.35, text: "She's caught herself already halfway through complying before she'd decided to." },
                { threshold: 0.70, text: "Refusing anything, lately, takes more effort than it used to. She isn't sure how much of that is still the collar." }
            ]
        },

        locket_of_the_adored: {
            driverType: "cursedItem",
            itemId: "locket_of_the_adored",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "A gift, or so it was framed. She wears it without thinking much of it." },
                { threshold: 0.35, text: "She's noticed she cares, a little too much, what people think when they see her wearing it." },
                { threshold: 0.70, text: "She's started doing things specifically to be noticed while wearing it. She tells herself that's not why." }
            ]
        },

        tethered_charm: {
            driverType: "cursedItem",
            itemId: "tethered_charm",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "A charm meant to keep her close to the party, in theory. Sentimental nonsense, she assumes." },
                { threshold: 0.35, text: "The thought of being separated from the others has started to genuinely unsettle her." },
                { threshold: 0.70, text: "She won't go anywhere alone anymore, not without real effort to push past how wrong it feels." }
            ]
        },

        brand_of_the_bared_truth: {
            driverType: "cursedItem",
            itemId: "brand_of_the_bared_truth",
            metric: "duration",
            tiers: [
                { threshold: 0.00, text: "It can't be covered, no matter what she wears over it. She hates that." },
                { threshold: 0.35, text: "She's stopped trying to angle herself away from it in conversation." },
                { threshold: 0.70, text: "She doesn't flinch when someone notices it anymore. Whatever it marked her for, she's made a kind of peace with being seen." }
            ]
        },

        sash_of_the_star_performer: {
            driverType: "cursedItem",
            itemId: "sash_of_the_star_performer",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "A performer's sash. She feels ridiculous in it, offstage especially." },
                { threshold: 0.35, text: "She's caught herself performing a little, even when there's no stage." },
                { threshold: 0.70, text: "She doesn't know how to read a room quietly anymore - some part of her is always looking for an audience." }
            ]
        },

        uniform_of_the_devoted_servant: {
            driverType: "cursedItem",
            itemId: "uniform_of_the_devoted_servant",
            metric: "duration",
            tiers: [
                { threshold: 0.00, text: "A servant's uniform, forced onto her. Every stitch of it insults her." },
                { threshold: 0.35, text: "She's stopped correcting people who address her the way the uniform implies she should be addressed." },
                { threshold: 0.70, text: "She answers to it now, without the flinch that used to come first." }
            ]
        },

        contrary_charm: {
            driverType: "cursedItem",
            itemId: "contrary_charm",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "An odd little charm. She doesn't notice anything different, at first." },
                { threshold: 0.35, text: "She's said things, sharper than she meant, and only caught herself afterward." },
                { threshold: 0.70, text: "She picks fights she didn't mean to start more than she'd like to admit, and isn't always sure which words were hers." }
            ]
        },

        anklet_of_wandering_trust: {
            driverType: "cursedItem",
            itemId: "anklet_of_wandering_trust",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "A cheap little anklet. She barely thinks about it." },
                { threshold: 0.35, text: "She's trusted people faster than she normally would, lately, without quite noticing she was doing it." },
                { threshold: 0.70, text: "She hands her judgment over to whoever's nearest, easier every time. She's stopped questioning why." }
            ]
        },

        hooded_ones_favor: {
            driverType: "cursedItem",
            itemId: "hooded_ones_favor",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "A gift from a stranger she never saw the face of. She doesn't know why she took it." },
                { threshold: 0.35, text: "She's found herself trusting the next tube handed to her before she's thought twice about who's handing it." },
                { threshold: 0.70, text: "She can't remember the last time she actually questioned who was behind the hole in the wall. She's not sure that bothers her the way it should." }
            ]
        },

        casing_of_the_wandering_palate: {
            driverType: "cursedItem",
            itemId: "casing_of_the_wandering_palate",
            metric: "duration",
            tiers: [
                { threshold: 0.00, text: "She's always preferred the sausage casing. Nothing strange about that." },
                { threshold: 0.35, text: "She's started turning bamboo tubes away before she's even tasted them." },
                { threshold: 0.70, text: "The thought of drinking from bamboo again makes her genuinely uneasy now. She couldn't say when that started." }
            ]
        },

        veil_of_heightened_senses: {
            driverType: "cursedItem",
            itemId: "veil_of_heightened_senses",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "Barely anything to it. She feels every draft, and somehow that sharpens everything else too." },
                { threshold: 0.35, text: "She's noticed she reads a batch better dressed like this - and worse, bundled up." },
                { threshold: 0.70, text: "She won't taste seriously anymore without wearing as little as the occasion allows. She tells herself it's just practical." }
            ]
        },

        shroud_of_the_hidden_palate: {
            driverType: "cursedItem",
            itemId: "shroud_of_the_hidden_palate",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "Heavy, concealing, not what she'd normally choose for this. But it does feel steadying." },
                { threshold: 0.35, text: "She reads a batch better wrapped up like this - worse, when there's too much skin showing." },
                { threshold: 0.70, text: "She won't taste seriously anymore without covering up first. She tells herself it's just focus." }
            ]
        },

        // --- NEW (v0.1.2) - the mouth/tasting-focused set. -----------------

        charm_of_the_eager_mouth: {
            driverType: "cursedItem",
            itemId: "charm_of_the_eager_mouth",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "Her mouth waters more than she'd like, more often than she'd like. She swallows and says nothing." },
                { threshold: 0.35, text: "She's stopped being embarrassed by it - mostly. It still catches her off guard sometimes." },
                { threshold: 0.70, text: "She doesn't fight it anymore. If anything, she's stopped noticing it's even happening until someone else does." }
            ]
        },

        blindfold_of_the_watched_eyes: {
            driverType: "cursedItem",
            itemId: "blindfold_of_the_watched_eyes",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "She hates not knowing what her own face is doing while everyone else can see it plainly." },
                { threshold: 0.35, text: "She's stopped trying to guess what her expression must look like. There's no point." },
                { threshold: 0.70, text: "She's given up trying to compose herself for people she can't see. Whatever her face does, it does." }
            ]
        },

        cuffs_of_no_choosing: {
            driverType: "cursedItem",
            itemId: "cuffs_of_no_choosing",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "She strains against them out of habit, every single time, even knowing it won't do anything." },
                { threshold: 0.35, text: "She's stopped straining. There's nothing to gain from it." },
                { threshold: 0.70, text: "She's stopped noticing they're there at all until someone points out she never tries to move her hands anymore." }
            ]
        },

        bit_of_obedient_silence: {
            driverType: "cursedItem",
            itemId: "bit_of_obedient_silence",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "She hates not being able to get a clear word out. Every attempt comes out garbled, and it shows on her face." },
                { threshold: 0.35, text: "She's stopped trying to talk her way through things. A look does almost as well." },
                { threshold: 0.70, text: "She's gotten unnervingly good at handling a room without saying a word. She's not sure that's a skill she wanted." }
            ]
        },

        leash_of_the_devoted_mouth: {
            driverType: "cursedItem",
            itemId: "leash_of_the_devoted_mouth",
            metric: "flips",
            tiers: [
                { threshold: 0.00, text: "She means to refuse. The refusal simply never makes it out." },
                { threshold: 0.35, text: "She's stopped meaning to, most of the time. It's easier not to set herself up to fail at it." },
                { threshold: 0.70, text: "She can't remember the last time she seriously tried to say no to anything offered to her mouth. She's not sure she remembers how." }
            ]
        }

    };

    // =========================================================================
    // MULTI-TRAIT REACTIVE ENTRIES
    // =========================================================================
    //
    // Everything above (driverType "trait"/"value"/"relationship"/
    // "cursedItem") is a single linear 0..1 axis - one number in, one
    // tier out. Per explicit direction, cursed items need something
    // richer: several traits/values/emotions considered TOGETHER, so her
    // reaction to wearing the same cursed item can read completely
    // differently depending on her overall psychology - not just "more
    // or less of one thing," but genuinely different STANCES (disgust vs.
    // wry self-recognition vs. secret eagerness).
    //
    // driverType "multiTrait" entries have a `profiles` array instead of
    // `tiers`. Each profile lists `conditions` - {space, key, min, max} -
    // where space is "trait" (AIH.Personality), "value" (AIH.Values), or
    // "emotion" (AIH.Emotions), and key is that space's field name. ALL
    // conditions in a profile must hold for it to match. Profiles are
    // checked in order; the FIRST fully-matching one wins - so put the
    // most specific/extreme profiles first and a broad, low-condition-
    // count profile last. `fallbackText` covers the case where nothing
    // matches (a genuinely in-between psychology).
    //
    // =========================================================================

    AIH.FlavorText._readSpaceValue = function(space, key) {

        if (
            space === "trait" &&
            typeof AIH.Personality !== "undefined" &&
            AIH.Personality.getTrait
        ) {

            return AIH.FlavorText._clamp01(
                AIH.Personality.getTrait(key)
            );
        }

        if (
            space === "value" &&
            typeof AIH.Values !== "undefined" &&
            AIH.Values.getValue
        ) {

            return AIH.FlavorText._clamp01(
                AIH.Values.getValue(key)
            );
        }

        if (
            space === "emotion" &&
            typeof AIH.Emotions !== "undefined" &&
            AIH.Emotions.getValue
        ) {

            return AIH.FlavorText._clamp01(
                AIH.Emotions.getValue(key)
            );
        }

        return 0.5;
    };

    AIH.FlavorText._profileMatches = function(profile) {

        var conditions;
        var i;
        var condition;
        var value;
        var min;
        var max;

        conditions =
            profile.conditions ||
            [];

        for (
            i = 0;
            i < conditions.length;
            i++
        ) {

            condition =
                conditions[i];

            value =
                AIH.FlavorText._readSpaceValue(
                    condition.space,
                    condition.key
                );

            min =
                condition.min !== undefined ?
                    condition.min :
                    0;

            max =
                condition.max !== undefined ?
                    condition.max :
                    1;

            if (
                value < min ||
                value > max
            ) {

                return false;
            }
        }

        return true;
    };

    AIH.FlavorText._resolveMultiTrait = function(entry) {

        var profiles;
        var i;

        profiles =
            entry.profiles ||
            [];

        for (
            i = 0;
            i < profiles.length;
            i++
        ) {

            if (AIH.FlavorText._profileMatches(profiles[i])) {

                return {
                    text: profiles[i].text,
                    matchedIndex: i
                };
            }
        }

        return {
            text: entry.fallbackText || "",
            matchedIndex: -1
        };
    };

    // =========================================================================
    // MULTI-TRAIT ENTRIES (cursed items - see AIH_CursedItems.js)
    // =========================================================================
    //
    // Five items, all backed by real AIH.CursedItems.DEFINITIONS entries
    // (succubus_claiming_mark, mark_of_the_honeyed_tongue,
    // gag_of_compliance, ring_of_the_blushing_truth,
    // heels_of_silken_surrender).
    //
    // =========================================================================

    AIH.FlavorText.MULTI_ENTRIES = {

        succubus_claiming_mark: {

            driverType: "multiTrait",

            profiles: [

                {
                    // Abhorrent - high modesty/dignity, still inhibited,
                    // not remotely drawn to attention.
                    conditions: [
                        { space: "trait", key: "inhibition", min: 0.6 },
                        { space: "value", key: "modesty", min: 0.55 },
                        { space: "trait", key: "attentionSeeking", max: 0.4 }
                    ],
                    text:
                        "She still can't look at it without her stomach " +
                        "turning. Every part of her wants it gone."
                },

                {
                    // "Does it even do anything?" - already disinhibited
                    // and attention-drawn on her own, independent of the
                    // curse.
                    conditions: [
                        { space: "trait", key: "inhibition", max: 0.3 },
                        { space: "trait", key: "attentionSeeking", min: 0.6 }
                    ],
                    text:
                        "Does it even do anything anymore? She was " +
                        "already like this before the mark ever showed " +
                        "up - she just can't prove it."
                },

                {
                    // Secretly eager - high approvalSeeking, low pride,
                    // genuine excitement rather than dread.
                    conditions: [
                        { space: "trait", key: "approvalSeeking", min: 0.6 },
                        { space: "trait", key: "pride", max: 0.4 },
                        { space: "emotion", key: "excitement", min: 0.45 }
                    ],
                    text:
                        "She won't say it out loud, but some nights she " +
                        "checks the mirror hoping it's spread a little " +
                        "more."
                }

            ],

            fallbackText:
                "It's just there, most days. She's stopped thinking " +
                "about it as much as she used to."
        },

        mark_of_the_honeyed_tongue: {

            driverType: "multiTrait",

            profiles: [

                {
                    conditions: [
                        { space: "trait", key: "inhibition", min: 0.6 },
                        { space: "value", key: "dignity", min: 0.55 },
                        { space: "trait", key: "attentionSeeking", max: 0.4 }
                    ],
                    text:
                        "The urge to just - show it, open her mouth for " +
                        "anyone who looks - it disgusts her, every time " +
                        "it rises."
                },

                {
                    conditions: [
                        { space: "trait", key: "inhibition", max: 0.35 },
                        { space: "trait", key: "curiosity", min: 0.6 }
                    ],
                    text:
                        "She's always been curious to a fault. Maybe " +
                        "that's all this really is, and the mark just " +
                        "gave it somewhere to go."
                },

                {
                    conditions: [
                        { space: "trait", key: "approvalSeeking", min: 0.6 },
                        { space: "trait", key: "attentionSeeking", min: 0.55 },
                        { space: "emotion", key: "excitement", min: 0.4 }
                    ],
                    text:
                        "She catches herself doing it before anyone even " +
                        "asks - and it doesn't feel like the mark " +
                        "anymore, just her."
                }

            ],

            fallbackText:
                "Her mouth waters more than it used to. She doesn't " +
                "think about it unless someone points it out."
        },

        gag_of_compliance: {

            driverType: "multiTrait",

            profiles: [

                {
                    conditions: [
                        { space: "trait", key: "independence", min: 0.6 },
                        { space: "trait", key: "pride", min: 0.55 },
                        { space: "trait", key: "approvalSeeking", max: 0.4 }
                    ],
                    text:
                        "She hates it more than almost anything she's " +
                        "worn - having no way to refuse, even when she " +
                        "means to."
                },

                {
                    conditions: [
                        { space: "trait", key: "approvalSeeking", min: 0.6 },
                        { space: "trait", key: "sociability", min: 0.55 },
                        { space: "trait", key: "independence", max: 0.4 }
                    ],
                    text:
                        "Some part of her almost prefers not having to " +
                        "decide what to say. Fewer wrong answers that way."
                },

                {
                    conditions: [
                        { space: "emotion", key: "comfort", min: 0.6 },
                        { space: "trait", key: "confidence", min: 0.55 }
                    ],
                    text:
                        "She's stopped bracing against it. If anything, " +
                        "not having to find the words herself is oddly " +
                        "restful."
                }

            ],

            fallbackText:
                "It's uncomfortable, but she's stopped fighting the fit " +
                "of it."
        },

        ring_of_the_blushing_truth: {

            driverType: "multiTrait",

            profiles: [

                {
                    // Abhorrent - proud, reserved, dreads being made to
                    // admit anything.
                    conditions: [
                        { space: "trait", key: "inhibition", min: 0.55 },
                        { space: "trait", key: "pride", min: 0.55 },
                        { space: "emotion", key: "embarrassment", min: 0.5 }
                    ],
                    text:
                        "She'd rather lose an argument than have the " +
                        "truth dragged out of her like this. Every " +
                        "admission feels like losing something."
                },

                {
                    // Already an open book - low inhibition, doesn't
                    // hide much anyway, so the ring barely registers.
                    conditions: [
                        { space: "trait", key: "inhibition", max: 0.3 },
                        { space: "trait", key: "sociability", min: 0.55 }
                    ],
                    text:
                        "She'd probably have said it anyway. The ring " +
                        "just skips the part where she pretends to think " +
                        "about lying first."
                },

                {
                    // Secretly relieved - high approvalSeeking, low
                    // pride, some comfort in not having to perform
                    // reluctance anymore.
                    conditions: [
                        { space: "trait", key: "approvalSeeking", min: 0.6 },
                        { space: "trait", key: "pride", max: 0.4 },
                        { space: "emotion", key: "comfort", min: 0.5 }
                    ],
                    text:
                        "It's almost a relief, not having to guard every " +
                        "answer. She's stopped resenting how easily it " +
                        "reads her now."
                }

            ],

            fallbackText:
                "She answers before she means to, more often than not. " +
                "She's given up minding it as much as she used to."
        },

        heels_of_silken_surrender: {

            driverType: "multiTrait",

            profiles: [

                {
                    // Abhorrent - proud, independent, hates the physical
                    // vulnerability of needing help to stay upright.
                    conditions: [
                        { space: "trait", key: "independence", min: 0.6 },
                        { space: "trait", key: "pride", min: 0.55 },
                        { space: "trait", key: "assertiveness", min: 0.5 }
                    ],
                    text:
                        "Every step is a small, humiliating negotiation " +
                        "with her own balance. She hates needing a hand " +
                        "to stay upright more than the heels themselves."
                },

                {
                    // Already graceful/confident in them regardless -
                    // high confidence, low inhibition, barely notices
                    // the curse doing anything.
                    conditions: [
                        { space: "emotion", key: "confidence", min: 0.6 },
                        { space: "trait", key: "inhibition", max: 0.35 }
                    ],
                    text:
                        "She's worn worse for less reason. If the curse " +
                        "is meant to unsteady her, it picked the wrong " +
                        "pair of legs."
                },

                {
                    // Secretly likes being steadied/attended to - high
                    // approvalSeeking/attentionSeeking, low independence.
                    conditions: [
                        { space: "trait", key: "approvalSeeking", min: 0.55 },
                        { space: "trait", key: "attentionSeeking", min: 0.5 },
                        { space: "trait", key: "independence", max: 0.4 }
                    ],
                    text:
                        "She's started reaching for an offered arm before " +
                        "she needs it, not after. She tells herself it's " +
                        "just practical."
                }

            ],

            fallbackText:
                "She's gotten steadier in them than she'd like to admit. " +
                "Some days she forgets she's supposed to be fighting it."
        }

    };

    // =========================================================================
    // RESOLUTION
    // =========================================================================

    AIH.FlavorText._progressLevel = function(entry) {

        var raw;
        var relationship;

        if (entry.driverType === "hardCapped") {
            return 0;
        }

        if (entry.driverType === "trait") {

            if (
                typeof AIH.Personality === "undefined" ||
                !AIH.Personality.getTrait
            ) {

                return 0;
            }

            raw =
                AIH.Personality.getTrait(entry.driverName);

        } else if (entry.driverType === "value") {

            if (
                typeof AIH.Values === "undefined" ||
                !AIH.Values.getValue
            ) {

                return 0;
            }

            raw =
                AIH.Values.getValue(entry.driverName);

        } else if (entry.driverType === "relationship") {

            if (
                typeof AIH.Relationships === "undefined" ||
                !AIH.Relationships.get
            ) {

                return 0;
            }

            relationship =
                AIH.Relationships.get(entry.npcId);

            if (!relationship) {
                return 0;
            }

            return AIH.FlavorText._clamp01(
                (Number(relationship.trust) || 0) / 100
            );

        } else if (entry.driverType === "cursedItem") {

            return AIH.FlavorText._clamp01(
                AIH.FlavorText._observeCursedItemPeak(
                    entry.itemId,
                    entry.metric
                ) /
                AIH.FlavorText._number(
                    entry.normalize,
                    entry.metric === "flips" ? 8 : 40
                )
            );

        } else {

            return 0;
        }

        raw =
            AIH.FlavorText._clamp01(raw);

        return entry.direction === "decrease" ?
            (1 - raw) :
            raw;
    };

    /*
     * Highest threshold at or below the current progress level wins -
     * tiers are expected in ascending threshold order, tiers[0] at 0.
     */
    AIH.FlavorText._resolveTier = function(entry, level) {

        var winner;
        var i;

        winner =
            entry.tiers[0] ||
            null;

        for (
            i = 0;
            i < entry.tiers.length;
            i++
        ) {

            if (entry.tiers[i].threshold <= level) {

                winner =
                    entry.tiers[i];

            } else {

                break;
            }
        }

        return winner;
    };

    /*
     * Looks in ENTRIES first, then MULTI_ENTRIES - two separate tables
     * since multiTrait entries have a completely different shape
     * (profiles, not tiers) and keeping them apart avoids a single
     * table where half the entries have fields the other half ignores.
     */
    AIH.FlavorText._findEntry = function(key) {

        return (
            AIH.FlavorText.ENTRIES[key] ||
            AIH.FlavorText.MULTI_ENTRIES[key] ||
            null
        );
    };

    AIH.FlavorText.getText = function(key) {

        var entry;
        var level;
        var tier;
        var resolved;

        entry =
            AIH.FlavorText._findEntry(key);

        if (!entry) {
            return "";
        }

        if (entry.driverType === "multiTrait") {

            resolved =
                AIH.FlavorText._resolveMultiTrait(entry);

            return resolved.text;
        }

        level =
            AIH.FlavorText._progressLevel(entry);

        tier =
            AIH.FlavorText._resolveTier(entry, level);

        return tier ?
            tier.text :
            "";
    };

    /*
     * Exposed mainly for debugging/QA tools - the raw 0..1 progress
     * level an entry is currently reading, before tier lookup. For a
     * multiTrait entry there is no single scalar level - returns the
     * matched profile's index instead (-1 if only the fallback matched),
     * which is the closest debugging-useful equivalent.
     */
    AIH.FlavorText.getLevel = function(key) {

        var entry;

        entry =
            AIH.FlavorText._findEntry(key);

        if (!entry) {
            return 0;
        }

        if (entry.driverType === "multiTrait") {

            return AIH.FlavorText._resolveMultiTrait(entry).matchedIndex;
        }

        return AIH.FlavorText._progressLevel(entry);
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "FlavorText",
            {
                version:
                    AIH.FlavorText.VERSION,

                getText: function(key) {
                    return AIH.FlavorText.getText(key);
                },

                getLevel: function(key) {
                    return AIH.FlavorText.getLevel(key);
                }
            }
        );
    }

    // =========================================================================
    // ENGINE HOOKS - OPTIONAL DATABASE ITEM WIRING
    // =========================================================================
    //
    // Purely opt-in: only an item/weapon/armor whose note box carries
    // <AIHFlavorKey:someKey> has its Window_Help description replaced.
    // Everything else displays its ordinary fixed database description,
    // completely untouched.
    //
    // =========================================================================

    AIH.FlavorText._extractKeyNotetag = function(note) {

        var match;

        if (!note) {
            return null;
        }

        match =
            note.match(/<AIHFlavorKey:\s*([^>]+)>/i);

        if (!match) {
            return null;
        }

        return match[1].trim();
    };

    if (typeof Window_Help !== "undefined") {

        var _AIH_FlavorText_WindowHelp_setItem =
            Window_Help.prototype.setItem;

        Window_Help.prototype.setItem = function(item) {

            var key;
            var text;

            key =
                item ?
                    AIH.FlavorText._extractKeyNotetag(item.note) :
                    null;

            if (!key) {

                _AIH_FlavorText_WindowHelp_setItem.call(this, item);
                return;
            }

            text =
                AIH.FlavorText.getText(key);

            this.setText(
                text ||
                item.description ||
                ""
            );
        };
    }

})();