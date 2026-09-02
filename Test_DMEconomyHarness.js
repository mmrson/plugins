"use strict";

/* ============================================================================
 * STUBS
 * ============================================================================
 * LA is stubbed here to mirror the EXACT public API confirmed by reading
 * GM_Liveaudience.js directly (setPlayerCutPercent/getPlayerCutPercent/
 * getPlayerWallet/modifyPlayerWallet/grantReward/evaluateRequest/
 * triggerIncident/Config.incidentDefinitions) - not a guess. In the real
 * deployed game, AIH_Edicts.js / AIH_ItemSteal.js / AIH_DMEconomy.js load
 * after the REAL GM_Liveaudience.js and call into its actual
 * implementation; this stub exists so this harness can test THIS turn's
 * new code in isolation without re-testing LA's own ~4000 lines of
 * already-existing viewer-generation logic.
 * ========================================================================= */

global.PluginManager = { parameters: function() { return {}; }, registerCommand: function() {} };
global.DataManager = {
    createGameObjects: function() { global.$gameSystem = new global.Game_System(); },
    setupNewGame: function() { global.$gameSystem = new global.Game_System(); },
    extractSaveContents: function() {}
};
global.$gameSystem = {};
global.Game_System = function() {};
global.Game_System.prototype.initialize = function() {};
global.$gameActors = { actor: function() { return { mp: 70, mmp: 100 }; } };

global.Scene_Boot = function() {};
global.Scene_Boot.prototype.start = function() {};

global.$dataEnemies = [null];
global.$dataItems = [null];

global.$gameParty = {
    _gold: 1000,
    _items: {},
    gold: function() { return this._gold; },
    gainGold: function(amt) { this._gold += amt; },
    loseGold: function(amt) { this._gold = Math.max(0, this._gold - amt); },
    numItems: function(item) { return this._items[item.id] || 0; },
    gainItem: function(item, qty) { this._items[item.id] = (this._items[item.id] || 0) + qty; },
    loseItem: function(item, qty) { this._items[item.id] = Math.max(0, (this._items[item.id] || 0) - qty); },
    items: function() {
        var self = this;
        return Object.keys(this._items)
            .filter(function(id) { return self._items[id] > 0; })
            .map(function(id) { return $dataItems[Number(id)]; })
            .filter(Boolean);
    }
};

global.Game_Action = function(subject) { this._subject = subject; };
global.Game_Action.prototype.subject = function() { return this._subject; };
global.Game_Action.prototype.apply = function() {};

global.Game_Battler = function() {};
global.Game_Battler.prototype.isActor = function() { return true; };
global.Game_Battler.prototype.isEnemy = function() { return false; };
global.Game_Battler.prototype.actorId = function() { return this._actorId; };
global.Game_Battler.prototype.states = function() { return this._states || []; };

global.Game_Enemy = function(enemyId) { this._enemyId = enemyId; };
global.Game_Enemy.prototype.isActor = function() { return false; };
global.Game_Enemy.prototype.isEnemy = function() { return true; };
global.Game_Enemy.prototype.enemy = function() { return $dataEnemies[this._enemyId]; };

/* ---- LA stub, mirroring the confirmed real public API ---- */

global.LA = {

    Config: {
        playerCutPercent: 0,
        incidentDefinitions: {
            wardrobe_malfunction: { label: "Wardrobe Malfunction" }
        }
    },

    playerWallet: 0,

    getPlayerCutPercent: function() { return this.Config.playerCutPercent; },
    setPlayerCutPercent: function(v) { this.Config.playerCutPercent = Math.max(0, Math.min(100, Number(v) || 0)); },
    getPlayerWallet: function() { return this.playerWallet; },
    modifyPlayerWallet: function(amount) { this.playerWallet = Math.max(0, this.playerWallet + (Number(amount) || 0)); },

    grantReward: function(amount, source) {
        var playerCut = Math.round(amount * this.Config.playerCutPercent / 100);
        var heroineGold = amount - playerCut;
        this.modifyPlayerWallet(playerCut);
        $gameParty.gainGold(heroineGold);
        return { playerCut: playerCut, heroineGold: heroineGold };
    },

    _nextEvalResponse: "accept", // test harness lever to control evaluateRequest's outcome deterministically
    evaluateRequest: function(request) {
        return { response: this._nextEvalResponse, score: this._nextEvalResponse === "accept" ? 0.8 : this._nextEvalResponse === "reject" ? -0.5 : 0.1 };
    },

    _triggeredIncidents: [],
    triggerIncident: function(type, data) {
        this._triggeredIncidents.push({ type: type, data: data });
    }
};

/* ============================================================================
 * LOAD REAL MODULES
 * ========================================================================= */

var fs = require("fs");
var vm = require("vm");

var LOAD_ORDER = [
    "AIH_Core.js",
    "AIH_State.js",
    "AIH_Personality.js",
    "AIH_Values.js",
    "AIH_Emotions.js",
    "AIH_PressureEvaluator.js",
    "AIH_Edicts.js",
    "AIH_ItemSteal.js",
    "AIH_DMEconomy.js"
];

LOAD_ORDER.forEach(function(f) {
    try {
        vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });
        console.log("[loaded] " + f);
    } catch (e) {
        console.error("[FAILED TO LOAD] " + f);
        console.error(e);
        process.exit(1);
    }
});

DataManager.createGameObjects();

/* ============================================================================
 * 1. EDICTS
 * ============================================================================ */

console.log("\n=== Edicts ===");

console.log("baseline cut percent applied on first init (expect 10):", LA.getPlayerCutPercent());

console.log("\n--- purchase fails with insufficient funds ---");
LA.playerWallet = 100;
var r1 = AIH.Edicts.purchaseNode("cut_rank_1");
console.log("result:", JSON.stringify(r1));
console.log("wallet unchanged:", LA.getPlayerWallet() === 100);

console.log("\n--- purchase succeeds, deducts cost, raises cut percent ---");
LA.playerWallet = 1000;
var r2 = AIH.Edicts.purchaseNode("cut_rank_1");
console.log("result:", JSON.stringify(r2));
console.log("wallet after purchase (1000-500=500):", LA.getPlayerWallet());
console.log("cut percent now (10+5=15):", LA.getPlayerCutPercent());
console.log("isOwned:", AIH.Edicts.isOwned("cut_rank_1"));

console.log("\n--- can't buy the same node twice ---");
var r3 = AIH.Edicts.purchaseNode("cut_rank_1");
console.log("result:", JSON.stringify(r3));

console.log("\n--- prerequisite gating ---");
console.log("cut_rank_3 available before cut_rank_2 (expect false):", AIH.Edicts.isAvailable("cut_rank_3"));
var r4 = AIH.Edicts.purchaseNode("cut_rank_3");
console.log("purchasing cut_rank_3 early:", JSON.stringify(r4));
console.log("cut_rank_2 available now (expect true, prereq cut_rank_1 owned):", AIH.Edicts.isAvailable("cut_rank_2"));

console.log("\n--- steal-chance nodes accumulate on their own counter, don't touch LA.Config ---");
LA.playerWallet = 5000;
console.log("steal chance bonus before (expect 0):", AIH.Edicts.getStealChanceBonus());
AIH.Edicts.purchaseNode("steal_rank_1");
console.log("steal chance bonus after steal_rank_1 (expect 5):", AIH.Edicts.getStealChanceBonus());
AIH.Edicts.purchaseNode("steal_rank_2");
console.log("steal chance bonus after steal_rank_2 (expect 15):", AIH.Edicts.getStealChanceBonus());

console.log("\n--- unknown node ---");
console.log("purchase of a made-up node:", JSON.stringify(AIH.Edicts.purchaseNode("not_a_real_node")));

/* ============================================================================
 * 2. ITEM STEAL
 * ============================================================================ */

console.log("\n=== Item Steal ===");

$dataItems[1] = { id: 1, name: "Potion", itypeId: 1, price: 50 };
$dataItems[2] = { id: 2, name: "Key Item", itypeId: 2, price: 0 }; // NOT itypeId 1 - should never be stolen
$dataEnemies[1] = { id: 1, name: "Slime", note: "" };
$dataEnemies[2] = { id: 2, name: "Goblin", note: "<StealChance:35>" };
AIH.ItemSteal.parseAllNotetags();

console.log("goblin parsed steal chance (expect 35):", $dataEnemies[2]._aihStealChance);
console.log("slime parsed steal chance (expect null, uses base):", $dataEnemies[1]._aihStealChance);

console.log("\n--- chance formula: base/override (note: Edicts steal_rank_1+2 = +15 were already purchased earlier this run, so this includes that) ---");
var heroine = new Game_Battler();
heroine._actorId = 1;
heroine._states = [];
console.log("chance vs slime (expect 5 base + 15 edict = 20):", AIH.ItemSteal.chanceForEnemy($dataEnemies[1], heroine));
console.log("chance vs goblin (expect 35 override + 15 edict = 50):", AIH.ItemSteal.chanceForEnemy($dataEnemies[2], heroine));

console.log("\n--- chance formula: restrained/slimed bonuses, via a lightweight fake AIH.RestrainedStruggle ---");
AIH.RestrainedStruggle = {
    isRestrained: function() { return false; },
    _isSlimed: function() { return false; }
};
console.log("chance vs slime, RestrainedStruggle present but both false (expect unchanged, still 20):", AIH.ItemSteal.chanceForEnemy($dataEnemies[1], heroine));
AIH.RestrainedStruggle.isRestrained = function() { return true; };
console.log("chance vs slime while restrained (expect 20+25=45):", AIH.ItemSteal.chanceForEnemy($dataEnemies[1], heroine));
AIH.RestrainedStruggle._isSlimed = function() { return true; };
console.log("chance vs slime while restrained AND slimed (expect 45+15=60):", AIH.ItemSteal.chanceForEnemy($dataEnemies[1], heroine));
delete AIH.RestrainedStruggle;

console.log("\n--- rollAndSteal: forced success takes a real item from party inventory into the stash ---");
$gameParty.gainItem($dataItems[1], 3);
console.log("party has 3 potions before:", $gameParty.numItems($dataItems[1]));
var realRandom = Math.random;
Math.random = function() { return 0.01; }; // guarantees roll succeeds against any nonzero chance
var stealResult = AIH.ItemSteal.rollAndSteal($dataEnemies[2], heroine); // goblin, 35%+15%=50%
Math.random = realRandom;
console.log("steal result:", JSON.stringify(stealResult));
console.log("party now has 2 potions:", $gameParty.numItems($dataItems[1]));
console.log("stash now has 1 potion:", AIH.ItemSteal.getStash()[1]);

console.log("\n--- rollAndSteal never touches non-regular items (key items) ---");
$gameParty.gainItem($dataItems[2], 1);
$gameParty._items[1] = 0; // empty out potions so ONLY the key item remains
Math.random = function() { return 0.01; };
var noStealResult = AIH.ItemSteal.rollAndSteal($dataEnemies[2], heroine);
Math.random = realRandom;
console.log("steal result with only a key item available (expect null):", noStealResult);

console.log("\n--- buyForStash spends the player's own wallet at the item's database price ---");
LA.playerWallet = 500;
var buyResult = AIH.ItemSteal.buyForStash(1, 4);
console.log("buy result (expect cost 200, 4*50):", JSON.stringify(buyResult));
console.log("wallet after (500-200=300):", LA.getPlayerWallet());
console.log("stash potion count now (1 from steal + 4 bought = 5):", AIH.ItemSteal.getStash()[1]);

console.log("\n--- buyForStash refuses on insufficient funds ---");
LA.playerWallet = 10;
console.log(JSON.stringify(AIH.ItemSteal.buyForStash(1, 4)));

/* ============================================================================
 * 3. DM CONTRACTS
 * ============================================================================ */

console.log("\n=== DM Contracts ===");

console.log("--- channel contract completes on matching reportAction, pays the wallet ---");
LA.playerWallet = 0;
var channel = AIH.DMContracts.createChannelContract("Make her dance", "danced_in_tavern", 3, 800);
console.log("created:", JSON.stringify(channel));
var completedNone = AIH.DMContracts.reportAction("something_unrelated");
console.log("unrelated action completes nothing:", completedNone.length === 0);
var completed = AIH.DMContracts.reportAction("danced_in_tavern");
console.log("matching action completes it:", completed.length === 1 && completed[0].status === "completed");
console.log("wallet paid out (expect 800):", LA.getPlayerWallet());

console.log("\n--- channel contract expires after its deadline if never matched ---");
var channel2 = AIH.DMContracts.createChannelContract("Make her flee", "fled_combat", 2, 500);
console.log("day at creation:", AIH.DMContracts.getCurrentDay());
AIH.DMContracts.advanceDay(1);
console.log("status after 1 day (expect active, deadline is +2):", AIH.DMContracts.getContracts("active").some(function(c){return c.id===channel2.id;}));
AIH.DMContracts.advanceDay(2);
console.log("status after day 3 (expect expired, deadline was day 2):", AIH.DMContracts.getContracts("expired").some(function(c){return c.id===channel2.id;}));
console.log("wallet unaffected by expiry (still 800, no payout, no penalty):", LA.getPlayerWallet());

console.log("\n--- sponsor deal completes when a real trait crosses the threshold, never before ---");
LA.playerWallet = 0;
console.log("current inhibition:", AIH.Personality.getTrait("inhibition").toFixed(2));
var sponsor = AIH.DMContracts.createSponsorDeal("Lower her guard", "personality.inhibition", "below", 0.3, null, 1200);
var checkBefore = AIH.DMContracts.checkSponsorDeals();
console.log("check before threshold crossed (expect not completed):", checkBefore.length === 0);
AIH.Personality.setTrait("inhibition", 0.2, "test harness");
var checkAfter = AIH.DMContracts.checkSponsorDeals();
console.log("check after crossing below 0.3 (expect completed):", checkAfter.length === 1);
console.log("wallet paid out (expect 1200):", LA.getPlayerWallet());

console.log("\n--- sponsor deal with 'above' comparison ---");
LA.playerWallet = 0;
AIH.Emotions.setValue("confidence", 0.2, "test");
var sponsor2 = AIH.DMContracts.createSponsorDeal("Build her confidence", "emotions.confidence", "above", 0.8, null, 600);
console.log("check while confidence is low (expect not completed):", AIH.DMContracts.checkSponsorDeals().length === 0);
AIH.Emotions.setValue("confidence", 0.9, "test");
console.log("check after raising confidence above 0.8 (expect completed):", AIH.DMContracts.checkSponsorDeals().length === 1);
console.log("wallet paid (expect 600):", LA.getPlayerWallet());

console.log("\n--- a completed contract never re-fires reportAction/checkSponsorDeals ---");
LA.playerWallet = 0;
AIH.DMContracts.reportAction("danced_in_tavern"); // channel from earlier, already completed
console.log("wallet still 0, no double payout:", LA.getPlayerWallet() === 0);

/* ============================================================================
 * 4. GIFT LEDGER
 * ============================================================================ */

console.log("\n=== Gift Ledger ===");

console.log("--- offerGift accepted: item transfers, no LA.grantReward split happens (0 gold to either side) ---");
$dataItems[5] = { id: 5, name: "Fine Cloak", itypeId: 1, price: 300 };
LA._nextEvalResponse = "accept";
var goldBefore = $gameParty.gold();
var walletBefore = LA.getPlayerWallet();
var giftResult = AIH.GiftLedger.offerGift(5, 300, "viewer_1");
console.log("gift result:", JSON.stringify(giftResult));
console.log("item now in her inventory:", $gameParty.numItems($dataItems[5]) === 1);
console.log("her gold unchanged (no split):", $gameParty.gold() === goldBefore);
console.log("player wallet unchanged by the gift itself (no split):", LA.getPlayerWallet() === walletBefore);

console.log("\n--- toll was recorded at the configured percent ---");
console.log("toll percent (expect default 20):", AIH.GiftLedger.getTollPercent());
var owed = AIH.GiftLedger.getOwedTolls();
console.log("owed tolls:", JSON.stringify(owed));
console.log("toll amount correct (300*0.20=60):", owed[0].tollAmount === 60);

console.log("\n--- offerGift REJECTED: no item transfer, no toll ---");
LA._nextEvalResponse = "reject";
var goldBefore2 = $gameParty.gold();
var giftResult2 = AIH.GiftLedger.offerGift(5, 300, "viewer_2");
console.log("gift result:", JSON.stringify(giftResult2));
console.log("no second copy of the item:", $gameParty.numItems($dataItems[5]) === 1);
console.log("no new toll created (still just the one):", AIH.GiftLedger.getOwedTolls().length === 1);

console.log("\n--- payToll: gold moves from her to the player directly (not via grantReward split) ---");
LA._nextEvalResponse = "accept";
var tollId = owed[0].id;
$gameParty._gold = 1000;
LA.playerWallet = 0;
var payResult = AIH.GiftLedger.payToll(tollId);
console.log("pay result:", payResult);
console.log("her gold dropped by exactly 60:", $gameParty.gold() === 940);
console.log("player wallet gained exactly 60 (full amount, no cut taken from it):", LA.getPlayerWallet() === 60);
console.log("toll no longer owed:", AIH.GiftLedger.getOwedTolls().length === 0);

console.log("\n--- payToll fails gracefully on insufficient gold ---");
LA._nextEvalResponse = "accept";
var giftResult3 = AIH.GiftLedger.offerGift(5, 300, "viewer_3");
var tollId3 = giftResult3.tollId;
$gameParty._gold = 5;
console.log("pay attempt with insufficient gold (expect false):", AIH.GiftLedger.payToll(tollId3));
console.log("toll still owed:", AIH.GiftLedger.getOwedTolls().some(function(t) { return t.id === tollId3; }));

console.log("\n--- proposeWaiver: a real evaluated decision, using PressureEvaluator directly ---");
var waiverResult = AIH.GiftLedger.proposeWaiver(tollId3, { freedomCost: 0.05, dignityCost: 0.05 });
console.log("waiver result:", JSON.stringify({ accepted: waiverResult.accepted, response: waiverResult.evaluation.response }));
console.log("toll status after waiver decision:", AIH.GiftLedger.getOwedTolls().some(function(t) { return t.id === tollId3; }) ? "still owed (waiver declined)" : "no longer owed (waiver accepted)");

/* ============================================================================
 * 5. HINDER MARKET
 * ============================================================================ */

console.log("\n=== Hinder Market ===");

console.log("--- default split percent ---");
console.log("default split (expect 5):", AIH.HinderMarket.getSplitPercent());

console.log("\n--- price scales up with the slider ---");
console.log("price at default split (5%) for base 500:", AIH.HinderMarket.computePrice(500));
AIH.HinderMarket.setSplitPercent(50);
console.log("price at split=50 for base 500 (should be noticeably higher):", AIH.HinderMarket.computePrice(500));
AIH.HinderMarket.setSplitPercent(90);
console.log("price at split=90 (max allowed) for base 500 (higher still):", AIH.HinderMarket.computePrice(500));

console.log("\n--- slider is capped so the heroine floor is never violated ---");
AIH.HinderMarket.setSplitPercent(150); // way over
console.log("split after requesting 150 (expect capped at 90, since floor=10):", AIH.HinderMarket.getSplitPercent());

console.log("\n--- split math: heroine always keeps at least the floor ---");
AIH.HinderMarket.setSplitPercent(90);
var split1 = AIH.HinderMarket.computeSplit(1000);
console.log("split at slider=90 on a 1000 total:", JSON.stringify(split1));
console.log("heroine share is exactly the floor (10% of 1000=100):", split1.heroineShare === 100);

AIH.HinderMarket.setSplitPercent(0);
var split2 = AIH.HinderMarket.computeSplit(1000);
console.log("split at slider=0 on a 1000 total (expect heroine gets it all, player 0):", JSON.stringify(split2));

console.log("\n--- purchase() pays both sides correctly and triggers the EXISTING LA incident, not a new one ---");
AIH.HinderMarket.setSplitPercent(20);
$gameParty._gold = 0;
LA.playerWallet = 0;
LA._triggeredIncidents = [];
var purchaseResult = AIH.HinderMarket.purchase("wardrobe_malfunction", 500, { note: "test purchase" });
console.log("purchase result:", JSON.stringify(purchaseResult));
console.log("her gold increased by heroineShare:", $gameParty.gold() === purchaseResult.split.heroineShare);
console.log("player wallet increased by playerShare:", LA.getPlayerWallet() === purchaseResult.split.playerShare);
console.log("LA.triggerIncident was actually called with the right type:", LA._triggeredIncidents.length === 1 && LA._triggeredIncidents[0].type === "wardrobe_malfunction");

console.log("\n--- purchase() refuses an incident type LA doesn't actually define ---");
console.log("purchase of a made-up incident type:", AIH.HinderMarket.purchase("not_a_real_incident", 500));

console.log("\n=== ALL DM ECONOMY TESTS COMPLETED WITHOUT ERROR ===");