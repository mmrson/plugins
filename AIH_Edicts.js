/*:
 * @plugindesc AI Hero Framework - DM Edicts (Player Skill Tree) v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - DM EDICTS (PLAYER SKILL TREE)
 * ============================================================================
 *
 * The progression system GM_Liveaudience.js's own comments explicitly defer
 * to: "intended to be set later by the Edict / skill-tree system through
 * LA.setPlayerCutPercent(), not edited here directly." This is that system.
 * Requires GM_Liveaudience.js loaded first. Never edits that file - every
 * effect here goes through its existing public API
 * (setPlayerCutPercent/getPlayerCutPercent/getPlayerWallet/
 * modifyPlayerWallet), the same boundary this project already holds with
 * AIH_StatusEffectCutinBridge.js wrapping AIH_BattleCutins.js.
 *
 * TWO THINGS NODES CAN DO RIGHT NOW (data-driven - add more as data, not code)
 *
 *   cutPercentBonus  - added to LA.Config.playerCutPercent (via
 *                      LA.setPlayerCutPercent), growing the player's share
 *                      of every future audience payout.
 *   stealChanceBonus - added to the player's steal-chance bonus (read by
 *                      AIH_ItemSteal.js's chance formula) - the player
 *                      investing in HIS OWN ability to end up with items
 *                      to later gift back to her.
 *
 * Nodes are bought with AIH.Edicts' own resource: LA.playerWallet - the
 * player spends what he's already earned to grow how much he earns next,
 * a real sink, not a free multiplier.
 *
 * DEFAULT_CUT_PERCENT (10) is applied once, the first time this module
 * ever initializes on a save - after that, LA.Config.playerCutPercent
 * only ever changes through purchases (or however else the project
 * chooses to call LA.setPlayerCutPercent - this module doesn't fight
 * that, it only sets the starting baseline once).
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    AIH.Edicts = AIH.Edicts || {};
    AIH.Edicts.VERSION = "0.1.0";

    AIH.Edicts.DEFAULT_CUT_PERCENT = 10;

    // =========================================================================
    // NODE DATA (add new nodes here, not new code)
    // =========================================================================

    AIH.Edicts.NODES = {

        cut_rank_1: {
            label: "Better Rates I",
            cost: 500,
            cutPercentBonus: 5,
            prerequisite: null
        },
        cut_rank_2: {
            label: "Better Rates II",
            cost: 1500,
            cutPercentBonus: 5,
            prerequisite: "cut_rank_1"
        },
        cut_rank_3: {
            label: "Better Rates III",
            cost: 4000,
            cutPercentBonus: 10,
            prerequisite: "cut_rank_2"
        },

        steal_rank_1: {
            label: "Sticky Fingers I",
            cost: 400,
            stealChanceBonus: 5,
            prerequisite: null
        },
        steal_rank_2: {
            label: "Sticky Fingers II",
            cost: 1200,
            stealChanceBonus: 10,
            prerequisite: "steal_rank_1"
        },
        steal_rank_3: {
            label: "Sticky Fingers III",
            cost: 3000,
            stealChanceBonus: 15,
            prerequisite: "steal_rank_2"
        }
    };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================

    AIH.Edicts._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    AIH.Edicts._ensure = function() {

        var state;

        state =
            AIH.Edicts._state();

        if (!state) {
            return null;
        }

        if (!state.edicts) {

            state.edicts = {

                owned: {},
                stealChanceBonus: 0,
                baselineApplied: false
            };
        }

        return state.edicts;
    };

    // =========================================================================
    // BASELINE
    // =========================================================================

    AIH.Edicts._applyBaselineOnce = function() {

        var state;

        state =
            AIH.Edicts._ensure();

        if (
            !state ||
            state.baselineApplied
        ) {

            return;
        }

        if (
            typeof LA !== "undefined" &&
            LA.setPlayerCutPercent
        ) {

            LA.setPlayerCutPercent(
                AIH.Edicts.DEFAULT_CUT_PERCENT
            );
        }

        state.baselineApplied = true;
    };

    // =========================================================================
    // QUERIES
    // =========================================================================

    AIH.Edicts.isOwned = function(nodeId) {

        var state;

        state =
            AIH.Edicts._ensure();

        return !!(state && state.owned[nodeId]);
    };

    AIH.Edicts.getStealChanceBonus = function() {

        var state;

        state =
            AIH.Edicts._ensure();

        return state ?
            (state.stealChanceBonus || 0) :
            0;
    };

    AIH.Edicts.isAvailable = function(nodeId) {

        var node;

        node =
            AIH.Edicts.NODES[nodeId];

        if (
            !node ||
            AIH.Edicts.isOwned(nodeId)
        ) {

            return false;
        }

        return !node.prerequisite ||
            AIH.Edicts.isOwned(node.prerequisite);
    };

    AIH.Edicts.availableNodeIds = function() {

        return Object.keys(AIH.Edicts.NODES).filter(function(id) {
            return AIH.Edicts.isAvailable(id);
        });
    };

    // =========================================================================
    // PURCHASE
    // =========================================================================

    AIH.Edicts.PURCHASE_RESULT = {
        OK: "ok",
        UNKNOWN_NODE: "unknown_node",
        ALREADY_OWNED: "already_owned",
        PREREQUISITE_NOT_MET: "prerequisite_not_met",
        INSUFFICIENT_FUNDS: "insufficient_funds",
        NO_WALLET: "no_wallet"
    };

    AIH.Edicts.purchaseNode = function(nodeId) {

        var node;
        var state;
        var wallet;

        node =
            AIH.Edicts.NODES[nodeId];

        if (!node) {

            return {
                success: false,
                reason: AIH.Edicts.PURCHASE_RESULT.UNKNOWN_NODE
            };
        }

        if (AIH.Edicts.isOwned(nodeId)) {

            return {
                success: false,
                reason: AIH.Edicts.PURCHASE_RESULT.ALREADY_OWNED
            };
        }

        if (
            node.prerequisite &&
            !AIH.Edicts.isOwned(node.prerequisite)
        ) {

            return {
                success: false,
                reason: AIH.Edicts.PURCHASE_RESULT.PREREQUISITE_NOT_MET
            };
        }

        if (
            typeof LA === "undefined" ||
            !LA.getPlayerWallet ||
            !LA.modifyPlayerWallet
        ) {

            return {
                success: false,
                reason: AIH.Edicts.PURCHASE_RESULT.NO_WALLET
            };
        }

        wallet =
            LA.getPlayerWallet();

        if (wallet < node.cost) {

            return {
                success: false,
                reason: AIH.Edicts.PURCHASE_RESULT.INSUFFICIENT_FUNDS
            };
        }

        state =
            AIH.Edicts._ensure();

        if (!state) {

            return {
                success: false,
                reason: AIH.Edicts.PURCHASE_RESULT.NO_WALLET
            };
        }

        LA.modifyPlayerWallet(-node.cost);

        state.owned[nodeId] = true;

        if (node.cutPercentBonus) {

            LA.setPlayerCutPercent(
                LA.getPlayerCutPercent() +
                node.cutPercentBonus
            );
        }

        if (node.stealChanceBonus) {

            state.stealChanceBonus =
                (state.stealChanceBonus || 0) +
                node.stealChanceBonus;
        }

        return {
            success: true,
            reason: AIH.Edicts.PURCHASE_RESULT.OK,
            node: node,
            nodeId: nodeId
        };
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Edicts.initialize = function() {

        AIH.Edicts._ensure();
        AIH.Edicts._applyBaselineOnce();
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register("Edicts", {
            version: AIH.Edicts.VERSION,
            initialize: function() {
                AIH.Edicts.initialize();
            }
        });
    }

    if (typeof DataManager !== "undefined") {

        var _AIH_Edicts_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_Edicts_createGameObjects.call(this);

            AIH.Edicts.initialize();
        };

        var _AIH_Edicts_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_Edicts_setupNewGame.call(this);

            AIH.Edicts.initialize();
        };

        var _AIH_Edicts_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents = function(contents) {

            _AIH_Edicts_extractSaveContents.call(this, contents);

            AIH.Edicts.initialize();
        };
    }

})();