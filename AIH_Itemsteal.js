/*:
 * @plugindesc AI Hero Framework - Item Steal (Monster Loot Pipeline) v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - ITEM STEAL (MONSTER LOOT PIPELINE)
 * ============================================================================
 *
 * Answers "how does the player get potions to give her": every enemy
 * attack that connects with the heroine has a chance to knock a
 * consumable out of her inventory - not lost, but diverted into
 * AIH.ItemSteal's own stash, a pool the player can later draw on to
 * gift items back to her (see AIH_DMEconomy.js's gift ledger) or just
 * hang onto.
 *
 * Requires AIH_BattleCutins.js (for the heroine-identity check) loaded
 * first. AIH_RestrainedStruggle/AIH.StatusEffectCatalog are read if
 * present (for the restrained/slimed bonuses) but not required.
 *
 * ============================================================================
 *
 * CHANCE FORMULA (all additive, then clamped 0-100)
 *
 *     BASE_CHANCE (5%)
 *   + per-enemy override, <StealChance:35> notetag on that $dataEnemies
 *     entry (goblins etc. - replaces the base, doesn't add to it)
 *   + RESTRAINED_BONUS (25%) if she's currently restrained at all
 *     (AIH.RestrainedStruggle.isRestrained) - harder to protect her own
 *     things with her hands bound
 *   + SLIMED_BONUS (15%) if she's currently slimed - harder to keep a
 *     grip on anything
 *   + AIH.Edicts.getStealChanceBonus() - the player's own skill-tree
 *     investment in this happening more often, since it's his income
 *     source
 *
 * ============================================================================
 *
 * WHAT GETS STOLEN
 *
 * A random REGULAR item (itypeId 1 - MZ's own "potions/consumables"
 * category, not key items or weapons/armor) she's actually carrying at
 * least one of. Nothing steals if she's carrying no such items - an
 * empty-handed heroine can't be pickpocketed of what she doesn't have.
 *
 * ============================================================================
 *
 * BUYING DIRECTLY
 *
 * AIH.ItemSteal.buyForStash(itemId, quantity) lets the player spend his
 * OWN wallet (LA.playerWallet) to add items to the same stash directly,
 * at that item's own database price - a second, non-random acquisition
 * path alongside the steal chance, per explicit direction.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    AIH.ItemSteal = AIH.ItemSteal || {};
    AIH.ItemSteal.VERSION = "0.1.0";

    AIH.ItemSteal.BASE_CHANCE = 5;
    AIH.ItemSteal.RESTRAINED_BONUS = 25;
    AIH.ItemSteal.SLIMED_BONUS = 15;

    AIH.ItemSteal.REGULAR_ITEM_ITYPE_ID = 1;

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.ItemSteal._copy = function(value) {

        if (
            value === undefined ||
            value === null
        ) {

            return value;
        }

        return JSON.parse(JSON.stringify(value));
    };

    AIH.ItemSteal._extractNotetag = function(note, tagName) {

        var pattern;
        var match;

        if (!note) {
            return null;
        }

        pattern =
            new RegExp(
                "<" + tagName + ":\\s*([^>]+)>",
                "i"
            );

        match =
            note.match(pattern);

        if (!match) {
            return null;
        }

        return match[1].trim();
    };

    // =========================================================================
    // NOTETAG PARSING
    // =========================================================================

    AIH.ItemSteal.parseAllNotetags = function() {

        var i;
        var enemy;
        var raw;

        if (!$dataEnemies) {
            return;
        }

        for (
            i = 1;
            i < $dataEnemies.length;
            i++
        ) {

            enemy =
                $dataEnemies[i];

            if (!enemy) {
                continue;
            }

            raw =
                AIH.ItemSteal._extractNotetag(
                    enemy.note,
                    "StealChance"
                );

            enemy._aihStealChance =
                raw !== null ?
                    Number(raw) :
                    null;
        }
    };

    if (typeof Scene_Boot !== "undefined") {

        var _AIH_ItemSteal_SceneBoot_start =
            Scene_Boot.prototype.start;

        Scene_Boot.prototype.start = function() {

            _AIH_ItemSteal_SceneBoot_start.call(this);

            AIH.ItemSteal.parseAllNotetags();
        };
    }

    // =========================================================================
    // PERSISTENT STATE (the stash)
    // =========================================================================

    AIH.ItemSteal._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.ItemSteal._ensure = function() {

        var state;

        state =
            AIH.ItemSteal._state();

        if (!state) {
            return null;
        }

        if (!state.itemSteal) {

            state.itemSteal = {
                stash: {}
            };
        }

        return state.itemSteal;
    };

    AIH.ItemSteal.getStash = function() {

        var state;

        state =
            AIH.ItemSteal._ensure();

        return state ?
            AIH.ItemSteal._copy(state.stash) :
            {};
    };

    AIH.ItemSteal._addToStash = function(itemId, quantity) {

        var state;

        state =
            AIH.ItemSteal._ensure();

        if (!state) {
            return;
        }

        state.stash[itemId] =
            (state.stash[itemId] || 0) +
            quantity;
    };

    /*
     * Used by AIH_DMEconomy.js's gift ledger to hand an item from the
     * stash to her inventory - decrements the stash, does NOT touch
     * $gameParty itself (that's the caller's job, since the gift ledger
     * also needs to run the acceptance evaluation first).
     */
    AIH.ItemSteal.takeFromStash = function(itemId, quantity) {

        var state;
        var have;

        state =
            AIH.ItemSteal._ensure();

        if (!state) {
            return false;
        }

        have =
            state.stash[itemId] || 0;

        if (have < quantity) {
            return false;
        }

        state.stash[itemId] =
            have - quantity;

        if (state.stash[itemId] <= 0) {
            delete state.stash[itemId];
        }

        return true;
    };

    // =========================================================================
    // CHANCE FORMULA
    // =========================================================================

    AIH.ItemSteal.chanceForEnemy = function(enemyData, heroineBattler) {

        var chance;

        chance =
            (
                enemyData &&
                enemyData._aihStealChance !== null &&
                enemyData._aihStealChance !== undefined
            ) ?
                enemyData._aihStealChance :
                AIH.ItemSteal.BASE_CHANCE;

        if (
            typeof AIH.RestrainedStruggle !== "undefined" &&
            AIH.RestrainedStruggle.isRestrained &&
            AIH.RestrainedStruggle.isRestrained(heroineBattler)
        ) {

            chance += AIH.ItemSteal.RESTRAINED_BONUS;
        }

        if (
            typeof AIH.RestrainedStruggle !== "undefined" &&
            AIH.RestrainedStruggle._isSlimed &&
            AIH.RestrainedStruggle._isSlimed(heroineBattler)
        ) {

            chance += AIH.ItemSteal.SLIMED_BONUS;
        }

        if (
            typeof AIH.Edicts !== "undefined" &&
            AIH.Edicts.getStealChanceBonus
        ) {

            chance += AIH.Edicts.getStealChanceBonus();
        }

        return Math.max(0, Math.min(100, chance));
    };

    // =========================================================================
    // THE ROLL ITSELF
    // =========================================================================

    AIH.ItemSteal._pickStealableItemId = function() {

        var candidates;

        if (
            typeof $gameParty === "undefined" ||
            !$gameParty.items
        ) {

            return null;
        }

        candidates =
            $gameParty.items().filter(function(item) {

                return (
                    item &&
                    item.itypeId === AIH.ItemSteal.REGULAR_ITEM_ITYPE_ID &&
                    $gameParty.numItems(item) > 0
                );
            });

        if (!candidates.length) {
            return null;
        }

        return candidates[
            Math.floor(Math.random() * candidates.length)
        ].id;
    };

    /*
     * Called once per successful hit on the heroine by an enemy action
     * (see the Game_Action.apply hook below) - rolls the chance, and on
     * success removes one unit of a random potion/consumable from her
     * party inventory into the stash. Returns null on no steal (either
     * the roll failed, or she was carrying nothing stealable).
     */
    AIH.ItemSteal.rollAndSteal = function(enemyData, heroineBattler) {

        var chance;
        var itemId;

        chance =
            AIH.ItemSteal.chanceForEnemy(enemyData, heroineBattler);

        if (Math.random() * 100 >= chance) {
            return null;
        }

        itemId =
            AIH.ItemSteal._pickStealableItemId();

        if (!itemId) {
            return null;
        }

        $gameParty.loseItem($dataItems[itemId], 1);

        AIH.ItemSteal._addToStash(itemId, 1);

        return {
            itemId: itemId,
            chance: chance
        };
    };

    // =========================================================================
    // BUYING DIRECTLY
    // =========================================================================

    AIH.ItemSteal.BUY_RESULT = {
        OK: "ok",
        UNKNOWN_ITEM: "unknown_item",
        INSUFFICIENT_FUNDS: "insufficient_funds",
        NO_WALLET: "no_wallet"
    };

    AIH.ItemSteal.buyForStash = function(itemId, quantity) {

        var item;
        var cost;

        quantity =
            Math.max(1, Number(quantity) || 1);

        item =
            typeof $dataItems !== "undefined" ?
                $dataItems[itemId] :
                null;

        if (!item) {

            return {
                success: false,
                reason: AIH.ItemSteal.BUY_RESULT.UNKNOWN_ITEM
            };
        }

        if (
            typeof LA === "undefined" ||
            !LA.getPlayerWallet ||
            !LA.modifyPlayerWallet
        ) {

            return {
                success: false,
                reason: AIH.ItemSteal.BUY_RESULT.NO_WALLET
            };
        }

        cost =
            (item.price || 0) * quantity;

        if (LA.getPlayerWallet() < cost) {

            return {
                success: false,
                reason: AIH.ItemSteal.BUY_RESULT.INSUFFICIENT_FUNDS
            };
        }

        LA.modifyPlayerWallet(-cost);

        AIH.ItemSteal._addToStash(itemId, quantity);

        return {
            success: true,
            reason: AIH.ItemSteal.BUY_RESULT.OK,
            cost: cost,
            itemId: itemId,
            quantity: quantity
        };
    };

    // =========================================================================
    // ENGINE HOOK
    // =========================================================================

    /*
     * Game_Action.prototype.apply is called once per target a skill/
     * attack actually connects with - the standard MZ hook point for
     * "this hit landed." Only rolls when the subject is an enemy and
     * the target is the heroine - party members and heroine-on-enemy
     * hits never reach this.
     */
    if (typeof Game_Action !== "undefined") {

        var _AIH_ItemSteal_GameAction_apply =
            Game_Action.prototype.apply;

        Game_Action.prototype.apply = function(target) {

            var subject;

            _AIH_ItemSteal_GameAction_apply.call(this, target);

            subject =
                this.subject();

            if (
                !subject ||
                typeof subject.isEnemy !== "function" ||
                !subject.isEnemy() ||
                typeof AIH.BattleCutins === "undefined" ||
                !AIH.BattleCutins._isHeroine(target)
            ) {

                return;
            }

            AIH.ItemSteal.rollAndSteal(
                subject.enemy(),
                target
            );
        };
    }

    // =========================================================================
    // INITIALIZE / MODULE REGISTRATION
    // =========================================================================

    AIH.ItemSteal.initialize = function() {

        AIH.ItemSteal._ensure();
    };

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register("ItemSteal", {
            version: AIH.ItemSteal.VERSION,
            initialize: function() {
                AIH.ItemSteal.initialize();
            }
        });
    }

    if (typeof DataManager !== "undefined") {

        var _AIH_ItemSteal_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_ItemSteal_createGameObjects.call(this);

            AIH.ItemSteal.initialize();
        };

        var _AIH_ItemSteal_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_ItemSteal_setupNewGame.call(this);

            AIH.ItemSteal.initialize();
        };

        var _AIH_ItemSteal_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents = function(contents) {

            _AIH_ItemSteal_extractSaveContents.call(this, contents);

            AIH.ItemSteal.initialize();
        };
    }

})();