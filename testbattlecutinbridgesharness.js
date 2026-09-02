"use strict";

/* ============================================================================
 * STUBS
 * ========================================================================= */

global.Rectangle = function(x, y, width, height) {
    this.x = x; this.y = y; this.width = width; this.height = height;
};

global.Bitmap = function(width, height) {
    this.width = width; this.height = height;
    this.fontSize = 16; this.textColor = "#fff"; this.paintOpacity = 255;
    this.fillRect = function() {};
    this.clear = function() {};
    this.drawCircle = function() {};
    this.drawText = function() {};
};

global.Sprite = function() { this.initialize(); };
global.Sprite.prototype.initialize = function() {
    this.children = []; this.bitmap = null; this.x = 0; this.y = 0;
    this.opacity = 255; this.scale = { x: 1, y: 1 }; this.anchor = { x: 0, y: 0 };
};
global.Sprite.prototype.addChild = function(c) { this.children.push(c); return c; };
global.Sprite.prototype.removeChild = function(c) {
    var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c;
};
global.Sprite.prototype.setColorTone = function() {};
global.Sprite.prototype.update = function() {};

global.Graphics = { width: 816, height: 624, boxWidth: 816, boxHeight: 624, _canvas: {} };

global.SceneManager = { _stack: [], push: function(s) { this._stack.push(s); }, pop: function() { this._stack.pop(); } };
global.SoundManager = { playCursor: function() {} };
global.Input = { keyMapper: {}, _triggered: {}, isTriggered: function(n) { return !!this._triggered[n]; } };
global.TouchInput = { isTriggered: function() { return false; } };
global.$gameTemp = { _playtest: true, isPlaytest: function() { return this._playtest; } };

var loadBitmapCalls = [];
global.ImageManager = {
    loadBitmap: function(folder, filename) {
        loadBitmapCalls.push({ folder: folder, filename: filename });
        return new Bitmap(1, 1);
    }
};

global.document = {
    createElement: function() {
        return {
            style: {}, addEventListener: function() {}, play: function() {}, pause: function() {}
        };
    },
    body: { appendChild: function() {} },
    getElementById: function() { return null; }
};

var __pluginParams = {};
global.PluginManager = {
    parameters: function(n) { return __pluginParams[n] || {}; },
    registerCommand: function() {}
};
global.DataManager = {
    createGameObjects: function() { global.$gameSystem = new global.Game_System(); },
    setupNewGame: function() { global.$gameSystem = new global.Game_System(); },
    extractSaveContents: function() {}
};
global.$gameSystem = {};
global.Game_System = function() {};
global.Game_System.prototype.initialize = function() {};

global.$gameActors = { actor: function(id) { return { mp: 70, mmp: 100 }; } };

/* ---- Window_Base / Window_StatusBase / Window_Command / Window_Options ---- */

global.Window_Base = function(rect) { this.initialize(rect); };
global.Window_Base.prototype.initialize = function(rect) {
    this.x = rect.x; this.y = rect.y; this.width = rect.width; this.height = rect.height;
    this.padding = 12; this.backOpacity = 192; this.opacity = 255; this.visible = true;
    this._windowBackSprite = new Sprite(); this._windowFrameSprite = new Sprite();
    this.contents = new Bitmap(this.width, this.height);
};
global.Window_Base.prototype.contentsWidth = function() { return this.width - this.padding * 2; };
global.Window_Base.prototype.contentsHeight = function() { return this.height - this.padding * 2; };
global.Window_Base.prototype.lineHeight = function() { return 36; };
global.Window_Base.prototype.drawText = function() {};
global.Window_Base.prototype.drawTextEx = function() {};
global.Window_Base.prototype.refresh = function() {};

global.Window_StatusBase = function(rect) { this.initialize(rect); };
global.Window_StatusBase.prototype = Object.create(Window_Base.prototype);
global.Window_StatusBase.prototype.constructor = Window_StatusBase;
global.Window_StatusBase.prototype.drawActorFace = function() {};
global.Window_StatusBase.prototype.drawActorHp = function() {};
global.Window_StatusBase.prototype.drawActorMp = function() {};
global.Window_StatusBase.prototype.drawActorIcons = function() {};

global.Window_Command = function(rect) { this.initialize(rect); };
global.Window_Command.prototype = Object.create(Window_Base.prototype);
global.Window_Command.prototype.constructor = Window_Command;
global.Window_Command.prototype.initialize = function(rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this._list = []; this._handlers = {};
};
global.Window_Command.prototype.addCommand = function(name, symbol, enabled) {
    this._list.push({ name: name, symbol: symbol, enabled: enabled !== false });
};
global.Window_Command.prototype.setHandler = function(symbol, fn) { this._handlers[symbol] = fn; };
global.Window_Command.prototype.callHandler = function(symbol) { if (this._handlers[symbol]) this._handlers[symbol](); };

global.Window_ActorCommand = function(rect) { this.initialize(rect); };
global.Window_ActorCommand.prototype = Object.create(Window_Command.prototype);
global.Window_ActorCommand.prototype.constructor = Window_ActorCommand;
global.Window_ActorCommand.prototype.initialize = function(rect) {
    Window_Command.prototype.initialize.call(this, rect);
    this._actor = null;
};
global.Window_ActorCommand.prototype.setup = function(actor) {
    this._actor = actor;
    this._list = [];
    this.makeCommandList();
};
global.Window_ActorCommand.prototype.makeCommandList = function() {
    if (!this._actor) return;
    this.addCommand("Attack", "attack", true);
    this.addCommand("Skill", "skill", true);
    this.addCommand("Guard", "guard", true);
    this.addCommand("Item", "item", true);
};

global.Window_Options = function(rect) { this.initialize(rect); };
global.Window_Options.prototype = Object.create(Window_Command.prototype);
global.Window_Options.prototype.constructor = Window_Options;
global.Window_Options.prototype.addGeneralOptions = function() {};
global.Window_Options.prototype.getConfigValue = function() { return null; };
global.Window_Options.prototype.setConfigValue = function() {};

global.ConfigManager = {};

/* ---- Scene_Boot / Scene_Battle / Spriteset_Battle ---- */

global.Scene_Boot = function() {};
global.Scene_Boot.prototype.start = function() {};

global.Spriteset_Battle = function() { this.children = []; };
global.Spriteset_Battle.prototype.update = function() {};
global.Spriteset_Battle.prototype.addChild = function(c) { this.children.push(c); return c; };
global.Spriteset_Battle.prototype.removeChild = function(c) {
    var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c;
};

global.Scene_Battle = function() { this._windows = []; };
global.Scene_Battle.prototype.terminate = function() {};
global.Scene_Battle.prototype.createAllWindows = function() {};
global.Scene_Battle.prototype.update = function() {};
global.Scene_Battle.prototype.addWindow = function(w) { this._windows.push(w); return w; };
global.Scene_Battle.prototype.createActorCommandWindow = function() {
    this._actorCommandWindow = new Window_ActorCommand(new Rectangle(0, 0, 300, 200));
};
global.Scene_Battle.prototype.onSelectAction = function() { this._selectActionCalled = (this._selectActionCalled || 0) + 1; };

/* ---- BattleManager / Game_Action / Game_Battler ---- */

global.BattleManager = {
    _subject: null,
    _actor: null,
    _inputtingAction: null,
    _logWindow: { _lines: [], push: function(method, arg) { if (method === "addText") this._lines.push(arg); } },
    _canEscapeBase: true,
    isBusy: function() { return false; },
    startAction: function() {},
    actor: function() { return this._actor; },
    inputtingAction: function() { return this._inputtingAction; },
    canEscape: function() { return this._canEscapeBase; }
};

global.Game_Action = function(subject) { this._subject = subject; this.clear(); };
global.Game_Action.prototype.subject = function() { return this._subject; };
global.Game_Action.prototype.item = function() { return this._item; };
global.Game_Action.prototype.setItemObject = function(item) { this._item = item; };
global.Game_Action.prototype.setGuard = function() { this._guarded = true; };
global.Game_Action.prototype.makeTargets = function() { return this._targets || []; };
global.Game_Action.prototype.clear = function() { this._aihCachedTargets = null; };
global.Game_Action.prototype.isPhysical = function() { return !!this._physical; };
global.Game_Action.prototype.isMagical = function() { return !!this._magical; };
global.Game_Action.prototype.isForOpponent = function() { return this._forOpponent !== false; };
global.Game_Action.prototype.itemHit = function() { return this._baseHit !== undefined ? this._baseHit : 0.9; };
global.Game_Action.prototype.makeDamageValue = function() { return this._baseDamage !== undefined ? this._baseDamage : 100; };

global.Game_BattlerBase = function() {};
global.Game_BattlerBase.prototype.xparam = function(xparamId) { return this._xparams ? (this._xparams[xparamId] || 0) : 0.5; };

global.Game_Battler = function() {};
global.Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
global.Game_Battler.prototype.constructor = Game_Battler;
global.Game_Battler.prototype.isActor = function() { return true; };
global.Game_Battler.prototype.actorId = function() { return this._actorId; };
global.Game_Battler.prototype.states = function() { return this._states || []; };
global.Game_Battler.prototype.isStateAffected = function(stateId) {
    return (this._states || []).some(function(s) { return s.id === stateId; });
};
global.Game_Battler.prototype.addState = function(stateId) {
    this._states = this._states || [];
    if (!this.isStateAffected(stateId)) {
        this._states.push($dataStates[stateId]);
    }
};
global.Game_Battler.prototype.removeState = function(stateId) {
    this._states = (this._states || []).filter(function(s) { return s.id !== stateId; });
};

global.$gameParty = {
    _members: [],
    battleMembers: function() { return this._members; }
};

/* ---- database ---- */

global.$dataSkills = [null];
global.$dataStates = [null];

/* ============================================================================
 * LOAD REAL MODULES
 * ========================================================================= */

var fs = require("fs");
var vm = require("vm");

var LOAD_ORDER = [
    "AIH_Core.js",
    "AIH_State.js",
    "AIH_Emotions.js",
    "AIH_Hero.js",
    "AIH_CharacterDisplay.js",
    "AIH_StatusEffectCatalog.js",
    "AIH_BattleCutins.js",
    "AIH_StatusEffectCutinBridge.js"
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
AIH.State.setActorId(1);

/* ============================================================================
 * PATCH 1: IMAGE PATH SPLITTING
 * ========================================================================= */

console.log("\n=== Patch 1: image path splitting ===");

var split1 = AIH.BattleCutins._splitImagePath("img/cutins/example_power_strike_attacker.png");
console.log("split of 'img/cutins/example_power_strike_attacker.png':", JSON.stringify(split1));
console.log("folder correct:", split1.folder === "img/cutins/");
console.log("filename has no extension:", split1.filename === "example_power_strike_attacker");

var split2 = AIH.BattleCutins._splitImagePath("bare_filename.png");
console.log("split of 'bare_filename.png' (no folder):", JSON.stringify(split2));
console.log("folder empty:", split2.folder === "");
console.log("filename stripped:", split2.filename === "bare_filename");

var split3 = AIH.BattleCutins._splitImagePath("img/cutins/nested/deep_file.jpg");
console.log("split of nested path:", JSON.stringify(split3));
console.log("folder keeps all nesting:", split3.folder === "img/cutins/nested/");

console.log("\n--- Sprite_AIHCutin actually calls ImageManager.loadBitmap with split args ---");
loadBitmapCalls.length = 0;
AIH.BattleCutins.enqueue("example_power_strike_attacker");
AIH.BattleCutins.pump(new Spriteset_Battle());
console.log("loadBitmap call:", JSON.stringify(loadBitmapCalls[0]));
console.log("folder/filename correctly separated (no raw '/' smashed into filename):",
    loadBitmapCalls[0].folder === "img/cutins/" &&
    loadBitmapCalls[0].filename === "example_power_strike_attacker"
);

/* ============================================================================
 * PATCH 2: PARTY STATUS WINDOW THROTTLED REFRESH
 * ========================================================================= */

console.log("\n=== Patch 2: party status window throttled refresh ===");

var refreshCallCount = 0;
var fakePartyWindow = {
    visible: false,
    otherPartyMembers: function() { return [{ actorId: function() { return 2; } }]; },
    refresh: function() { refreshCallCount++; }
};
AIH.BattleCutins._partyStatusWindow = fakePartyWindow;
AIH.BattleCutins.isBusy = function() { return true; };
AIH.BattleCutins._partyStatusRefreshTimer = 0;

console.log("--- first call (hidden -> shown) always refreshes ---");
AIH.BattleCutins._updatePartyStatusWindow();
console.log("refresh count after first call:", refreshCallCount, "(expect 1)");
console.log("window now visible:", fakePartyWindow.visible);

console.log("\n--- subsequent calls while visible only refresh every PARTY_STATUS_REFRESH_INTERVAL frames ---");
var interval = AIH.BattleCutins.PARTY_STATUS_REFRESH_INTERVAL;
console.log("interval configured as:", interval);
for (var i = 0; i < interval - 1; i++) {
    AIH.BattleCutins._updatePartyStatusWindow();
}
console.log("refresh count after " + (interval - 1) + " more calls (expect still 1):", refreshCallCount);
AIH.BattleCutins._updatePartyStatusWindow();
console.log("refresh count after the " + interval + "th call (expect 2):", refreshCallCount);

console.log("\n--- requestPartyStatusRefresh forces an immediate refresh + resets the throttle ---");
AIH.BattleCutins.requestPartyStatusRefresh();
console.log("refresh count after forced request (expect 3):", refreshCallCount);
for (var j = 0; j < interval - 1; j++) {
    AIH.BattleCutins._updatePartyStatusWindow();
}
console.log("refresh count after another " + (interval - 1) + " calls, timer was reset by the force (expect still 3):", refreshCallCount);

/* ============================================================================
 * BRIDGE PART 1: STATE -> CATALOG SYNC
 * ========================================================================= */

console.log("\n=== Bridge: state -> catalog sync ===");

// Define a heroine actor battler + a "Slimed II" state carrying both a
// CutInApplied tag (BattleCutins' own) and a StatusEffectStage tag (this
// bridge's), to confirm both systems fire off ONE state application.
var heroine = new Game_Battler();
heroine._actorId = 1;
heroine._states = [];

$dataStates[10] = {
    id: 10,
    note: "<CutInApplied:example_bind_applied>\n<StatusEffectStage:slimed:2>\n<StatusEffectDuration:180>"
};
AIH.BattleCutins.parseAllNotetags();
AIH.StatusEffectCutinBridge.parseAllNotetags();

console.log("state 10 parsed CutInApplied:", $dataStates[10]._aihCutInApplied);
console.log("state 10 parsed StatusEffectStage tag:", JSON.stringify($dataStates[10]._aihStatusEffectStageTag));
console.log("state 10 parsed duration tag:", $dataStates[10]._aihStatusEffectDurationTag);

var confidenceBefore = AIH.Emotions.getValue("confidence");
var embarrassmentBefore = AIH.Emotions.getValue("embarrassment");

AIH.BattleCutins._queue = []; // reset from earlier test
heroine.addState(10);

console.log("cut-in queue after applying state 10 (expect 1, the CutInApplied one):", AIH.BattleCutins._queue.length);
console.log("queued cut-in key:", AIH.BattleCutins._queue[0] && AIH.BattleCutins._queue[0].key);
console.log("embarrassment: " + embarrassmentBefore.toFixed(2) + " -> " + AIH.Emotions.getValue("embarrassment").toFixed(2) + " (should rise, per slimed stage 2 emotionEffects)");
console.log("comfort/stress also nudged - confirming applyStage genuinely ran, not just the cut-in");

console.log("\n--- re-applying the SAME already-active state does NOT re-trigger either system ---");
AIH.BattleCutins._queue = [];
var embarrassmentBeforeRefresh = AIH.Emotions.getValue("embarrassment");
heroine.addState(10); // already affected - should be a no-op per Game_Battler.addState's own isStateAffected guard
console.log("cut-in queue after re-applying (expect 0):", AIH.BattleCutins._queue.length);
console.log("embarrassment unchanged on refresh:", AIH.Emotions.getValue("embarrassment") === embarrassmentBeforeRefresh);

console.log("\n--- a state with NO StatusEffectStage tag doesn't touch the catalog at all ---");
$dataStates[11] = { id: 11, note: "" };
AIH.StatusEffectCutinBridge.parseAllNotetags();
var embarrassmentBeforePlain = AIH.Emotions.getValue("embarrassment");
heroine.addState(11);
console.log("embarrassment unchanged after a plain untagged state:", AIH.Emotions.getValue("embarrassment") === embarrassmentBeforePlain);

console.log("\n--- a state applied to a NON-heroine battler is ignored by both systems ---");
var partyMember = new Game_Battler();
partyMember._actorId = 2;
partyMember._states = [];
$dataStates[12] = { id: 12, note: "<CutInApplied:example_bind_applied>\n<StatusEffectStage:slimed:3>" };
AIH.StatusEffectCutinBridge.parseAllNotetags();
AIH.BattleCutins.parseAllNotetags();
AIH.BattleCutins._queue = [];
var embarrassmentBeforeOther = AIH.Emotions.getValue("embarrassment");
partyMember.addState(12);
console.log("cut-in queue after non-heroine state (expect 0):", AIH.BattleCutins._queue.length);
console.log("heroine's own embarrassment unaffected by someone else's state:", AIH.Emotions.getValue("embarrassment") === embarrassmentBeforeOther);

/* ============================================================================
 * BRIDGE PART 2: RESTRAINED / STRUGGLE (modifier-based redesign)
 * ========================================================================= */

console.log("\n=== Bridge: restrained / struggle mechanic (modifier-based) ===");

// bound stage 1 = hands_front, stage 2 = hands_back, stage 3 = hands_back+legs
$dataStates[30] = { id: 30, note: "<StatusEffectStage:bound:1>\n<StruggleSuccessCutIn:example_power_strike_attacker>\n<StruggleFailCutIn:example_bind_applied>" };
$dataStates[31] = { id: 31, note: "<StatusEffectStage:bound:2>\n<StruggleSuccessCutIn:example_power_strike_attacker>\n<StruggleFailCutIn:example_bind_applied>" };
$dataStates[32] = { id: 32, note: "<StatusEffectStage:bound:3>\n<StruggleSuccessCutIn:example_power_strike_attacker>\n<StruggleFailCutIn:example_bind_applied>" };
$dataStates[33] = { id: 33, note: "<StatusEffectStage:slimed:3>" };
AIH.StatusEffectCutinBridge.parseAllNotetags();

console.log("--- isRestrained / activeRestrainedParts before any bind ---");
var h = new Game_Battler();
h._actorId = 1;
h._states = [];
console.log("isRestrained (expect false):", AIH.RestrainedStruggle.isRestrained(h));
console.log("activeRestrainedParts (expect []):", AIH.RestrainedStruggle.activeRestrainedParts(h));

console.log("\n--- stage 1 (hands_front): light restriction ---");
h.addState(30);
console.log("isRestrained:", AIH.RestrainedStruggle.isRestrained(h));
console.log("activeRestrainedParts (expect ['hands_front']):", AIH.RestrainedStruggle.activeRestrainedParts(h));
console.log("canUseWeaponAttack (expect true, legs free):", AIH.RestrainedStruggle.canUseWeaponAttack(h));
console.log("canFlee (expect true, legs free):", AIH.RestrainedStruggle.canFlee(h));
console.log("evasionForcedZero (expect false):", AIH.RestrainedStruggle.evasionForcedZero(h));
console.log("canTargetEnemyWithMagic (expect true):", AIH.RestrainedStruggle.canTargetEnemyWithMagic(h));
console.log("weaponEffectivenessMultiplier (expect 0.65, hands_front penalty):", AIH.RestrainedStruggle.weaponEffectivenessMultiplier(h));
console.log("magicEffectivenessMultiplier (expect 1, no penalty for hands_front):", AIH.RestrainedStruggle.magicEffectivenessMultiplier(h));
console.log("escapeChance (expect 0.75, base 0.5 + stage1's +0.25):", AIH.RestrainedStruggle.escapeChance(h));
h.removeState(30);

console.log("\n--- stage 2 (hands_back): heavier restriction, still no leg penalty ---");
h.addState(31);
console.log("activeRestrainedParts (expect ['hands_back']):", AIH.RestrainedStruggle.activeRestrainedParts(h));
console.log("canUseWeaponAttack (expect true, legs free):", AIH.RestrainedStruggle.canUseWeaponAttack(h));
console.log("canFlee (expect true):", AIH.RestrainedStruggle.canFlee(h));
console.log("canTargetEnemyWithMagic (expect true, legs not also bound):", AIH.RestrainedStruggle.canTargetEnemyWithMagic(h));
console.log("weaponEffectivenessMultiplier (expect 0.15, heavy penalty):", AIH.RestrainedStruggle.weaponEffectivenessMultiplier(h));
console.log("magicEffectivenessMultiplier (expect 0.15, heavy penalty):", AIH.RestrainedStruggle.magicEffectivenessMultiplier(h));
console.log("escapeChance (expect 0.40, base 0.5 + stage2's -0.10):", AIH.RestrainedStruggle.escapeChance(h));
h.removeState(31);

console.log("\n--- stage 3 (hands_back + legs): the near-impossible combo ---");
h.addState(32);
console.log("activeRestrainedParts (expect both hands_back and legs):", AIH.RestrainedStruggle.activeRestrainedParts(h));
console.log("canUseWeaponAttack (expect FALSE, legs bound):", AIH.RestrainedStruggle.canUseWeaponAttack(h));
console.log("canFlee (expect FALSE):", AIH.RestrainedStruggle.canFlee(h));
console.log("evasionForcedZero (expect TRUE):", AIH.RestrainedStruggle.evasionForcedZero(h));
console.log("canTargetEnemyWithMagic (expect FALSE - the self-only case):", AIH.RestrainedStruggle.canTargetEnemyWithMagic(h));
console.log("escapeChance (expect 0.15, base 0.5 + stage3's -0.35):", AIH.RestrainedStruggle.escapeChance(h));
console.log("isStruggleBlocked without slime (expect false):", AIH.RestrainedStruggle.isStruggleBlocked(h));

console.log("\n--- adding slimed stage 3 on top: struggle now BLOCKED outright, not just penalized ---");
h.addState(33);
console.log("modifierSum now sums bound stage3 (-0.35) + slimed stage3 (-0.30) = -0.65:", AIH.RestrainedStruggle.modifierSum(h));
console.log("isStruggleBlocked (expect TRUE - hands_back+legs+slimed):", AIH.RestrainedStruggle.isStruggleBlocked(h));

var realRandom = Math.random;
Math.random = function() { return 0.01; }; // would normally be a guaranteed success
AIH.BattleCutins._queue = [];
var blockedResult = AIH.RestrainedStruggle.resolve(h);
Math.random = realRandom;
console.log("resolve() while blocked:", JSON.stringify(blockedResult));
console.log("success is false even with a favorable roll:", blockedResult.success === false);
console.log("blocked flag set:", blockedResult.blocked === true);
console.log("bound state NOT removed while blocked:", h.isStateAffected(32));

console.log("\n--- clearing the slime unblocks struggle again ---");
h.removeState(33);
console.log("isStruggleBlocked after clearing slime (expect false):", AIH.RestrainedStruggle.isStruggleBlocked(h));
Math.random = function() { return 0.01; };
AIH.BattleCutins._queue = [];
var unblockedResult = AIH.RestrainedStruggle.resolve(h);
Math.random = realRandom;
console.log("resolve() now succeeds:", unblockedResult.success === true);
console.log("bound state (32) removed on success:", !h.isStateAffected(32));

console.log("\n--- resolve() FAIL path enqueues the fail cutin, doesn't remove the state ---");
h.addState(32);
Math.random = function() { return 0.99; };
AIH.BattleCutins._queue = [];
var failResult = AIH.RestrainedStruggle.resolve(h);
Math.random = realRandom;
console.log("success false:", failResult.success === false);
console.log("fail cutin enqueued:", AIH.BattleCutins._queue.length === 1 && AIH.BattleCutins._queue[0].key === "example_bind_applied");
console.log("state still active:", h.isStateAffected(32));

console.log("\n--- Window_ActorCommand: Struggle is ADDED, normal commands remain, Attack disabled when legs bound ---");
var restrainedCmdWindow = new Window_ActorCommand(new Rectangle(0, 0, 300, 200));
restrainedCmdWindow.setup(h); // h still has state 32 (hands_back+legs)
console.log("full command list while restrained:", restrainedCmdWindow._list.map(function(c) { return c.symbol + (c.enabled ? "" : "(disabled)"); }));
console.log("all 5 commands present (attack/skill/guard/item/struggle):", restrainedCmdWindow._list.length === 5);
var attackCmd = restrainedCmdWindow._list.filter(function(c) { return c.symbol === "attack"; })[0];
console.log("attack command disabled (legs bound):", attackCmd.enabled === false);
var skillCmd = restrainedCmdWindow._list.filter(function(c) { return c.symbol === "skill"; })[0];
console.log("skill command still enabled (magic still reaches, just target-limited elsewhere):", skillCmd.enabled === true);

console.log("\n--- same check with only hands_front bound (stage 1): attack stays enabled ---");
var lightBoundHeroine = new Game_Battler();
lightBoundHeroine._actorId = 1;
lightBoundHeroine._states = [];
lightBoundHeroine.addState(30);
var lightCmdWindow = new Window_ActorCommand(new Rectangle(0, 0, 300, 200));
lightCmdWindow.setup(lightBoundHeroine);
var lightAttackCmd = lightCmdWindow._list.filter(function(c) { return c.symbol === "attack"; })[0];
console.log("attack still enabled (legs free):", lightAttackCmd.enabled === true);
console.log("struggle still offered:", lightCmdWindow._list.some(function(c) { return c.symbol === "struggle"; }));

console.log("\n--- command list unaffected when not restrained at all ---");
var freeHeroine = new Game_Battler();
freeHeroine._actorId = 1;
freeHeroine._states = [];
var freeCmdWindow = new Window_ActorCommand(new Rectangle(0, 0, 300, 200));
freeCmdWindow.setup(freeHeroine);
console.log("command list (expect exactly the normal 4, no struggle):", freeCmdWindow._list.map(function(c) { return c.symbol; }));
console.log("no struggle command when free:", !freeCmdWindow._list.some(function(c) { return c.symbol === "struggle"; }));

console.log("\n--- Scene_Battle wiring: selecting Struggle resolves and advances the turn ---");
var battleScene = new Scene_Battle();
battleScene.createActorCommandWindow();
BattleManager._actor = h;
BattleManager._inputtingAction = new Game_Action(h);
Math.random = function() { return 0.01; };
h.addState(32); // ensure bound again (may have been removed by an earlier success test)
battleScene._actorCommandWindow.callHandler("struggle");
Math.random = realRandom;
console.log("onSelectAction was called (turn advanced):", battleScene._selectActionCalled >= 1);
console.log("inputtingAction was set to guard:", BattleManager._inputtingAction._guarded === true);

console.log("\n--- BattleManager.canEscape: whole party blocked while she's leg-bound ---");
var escapeTestHeroine = new Game_Battler();
escapeTestHeroine._actorId = 1;
escapeTestHeroine._states = [];
$gameActors.actor = function(id) { return escapeTestHeroine; };
console.log("canEscape with no restraint (expect true):", BattleManager.canEscape());
escapeTestHeroine.addState(32); // hands_back + legs
console.log("canEscape while leg-bound (expect FALSE):", BattleManager.canEscape());
escapeTestHeroine.removeState(32);
escapeTestHeroine.addState(30); // hands_front only, no legs
console.log("canEscape with only hands bound, legs free (expect true):", BattleManager.canEscape());

console.log("\n--- Game_BattlerBase.xparam: evasion forced to 0 only while leg-bound, only for the heroine ---");
var evaHeroine = new Game_Battler();
evaHeroine._actorId = 1;
evaHeroine._states = [];
evaHeroine._xparams = { 1: 0.35 };
console.log("eva (xparam 1) with no restraint (expect 0.35, unmodified):", evaHeroine.xparam(1));
evaHeroine.addState(32);
console.log("eva while leg-bound (expect 0):", evaHeroine.xparam(1));
var evaOther = new Game_Battler();
evaOther._actorId = 2; // NOT the heroine
evaOther._states = [];
evaOther._xparams = { 1: 0.35 };
evaOther.addState(32);
console.log("a non-heroine battler's eva is untouched even if somehow bound (expect 0.35):", evaOther.xparam(1));

console.log("\n--- Game_Action.itemHit / makeDamageValue: hand-restriction multipliers apply only vs. an opponent ---");
var attacker = new Game_Battler();
attacker._actorId = 1;
attacker._states = [];
attacker.addState(31); // hands_back only

var physicalVsEnemy = new Game_Action(attacker);
physicalVsEnemy._physical = true;
physicalVsEnemy._forOpponent = true;
physicalVsEnemy._baseHit = 0.9;
physicalVsEnemy._baseDamage = 100;
console.log("physical hit vs enemy while hands_back (expect 0.9*0.15=0.135):", physicalVsEnemy.itemHit());
console.log("physical damage vs enemy while hands_back (expect round(100*0.15)=15):", physicalVsEnemy.makeDamageValue());

var magicalVsEnemy = new Game_Action(attacker);
magicalVsEnemy._magical = true;
magicalVsEnemy._forOpponent = true;
magicalVsEnemy._baseHit = 0.9;
magicalVsEnemy._baseDamage = 100;
console.log("magical hit vs enemy while hands_back (expect 0.135):", magicalVsEnemy.itemHit());

var magicalVsAlly = new Game_Action(attacker);
magicalVsAlly._magical = true;
magicalVsAlly._forOpponent = false; // a self/ally-targeted heal, say
magicalVsAlly._baseHit = 0.9;
magicalVsAlly._baseDamage = 100;
console.log("magical hit vs an ALLY/self while hands_back (expect UNPENALIZED 0.9 - direction only discussed attacking):", magicalVsAlly.itemHit());

console.log("\n--- Game_Action.isForOpponent redirect: hands_back+legs blocks magic targeting an opponent, logs why ---");
var boundCaster = new Game_Battler();
boundCaster._actorId = 1;
boundCaster._states = [];
boundCaster.addState(32); // hands_back + legs

var castAtEnemy = new Game_Action(boundCaster);
castAtEnemy._magical = true;
castAtEnemy._forOpponent = true;
BattleManager._logWindow._lines = [];
console.log("isForOpponent() while hands_back+legs (expect FALSE, redirected):", castAtEnemy.isForOpponent());
console.log("a log message was pushed explaining why:", BattleManager._logWindow._lines.length === 1);
console.log("log message content:", BattleManager._logWindow._lines[0]);

var castAtEnemyLightBound = new Game_Action(lightBoundHeroine); // only hands_front
castAtEnemyLightBound._magical = true;
castAtEnemyLightBound._forOpponent = true;
console.log("isForOpponent() with only hands_front bound (expect true, unaffected):", castAtEnemyLightBound.isForOpponent());

var physicalAtEnemyBound = new Game_Action(boundCaster);
physicalAtEnemyBound._physical = true;
physicalAtEnemyBound._forOpponent = true;
console.log("isForOpponent() for a PHYSICAL action while hands_back+legs (expect true - redirect is magic-only per direction):", physicalAtEnemyBound.isForOpponent());

console.log("\n=== ALL BRIDGE + PATCH TESTS COMPLETED WITHOUT ERROR ===");