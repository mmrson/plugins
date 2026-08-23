/*:
 * @plugindesc AI Hero Framework - Character Display Preview Scene v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - CHARACTER DISPLAY PREVIEW SCENE
 * ============================================================================
 *
 * An in-game scene for exercising AIH_CharacterDisplay.js directly during
 * playtesting - cycle outfits/expressions, toggle status effects on and
 * off (including stacking several at once), and trigger the impact
 * reaction, all live, no code editing required.
 *
 * Requires AIH_CharacterDisplay.js to be loaded first.
 *
 * OPENING THE SCENE
 *
 *     - Plugin Command "Open Preview Scene" (call from any event), or
 *     - Press F7 on the map, but ONLY while $gameTemp.isPlaytest() is
 *       true - same playtest-only gating as the Milkmaid debug scene's
 *       F6 (a different key so the two don't collide).
 *
 * VISUAL STYLE
 *
 * Same plain dark theme as the Milkmaid debug scene - flat near-black
 * panels, light gray text, windows recolored via Sprite.setColorTone()
 * rather than a themed skin. No color palette beyond the character
 * sprite's own placeholder shapes.
 *
 * ============================================================================
 *
 * @command OpenPreviewScene
 * @text Open Preview Scene
 * @desc Opens the character display preview/debug scene.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    var COLORS = {
        text:      "#d8d8d8",
        textMuted: "#8a8a8a",
        textFaint: "#5c5c5c"
    };

    var WINDOW_DARKEN_TONE = [-150, -150, -150, 0];

    function darkenWindow(win) {

        if (win._windowBackSprite && win._windowBackSprite.setColorTone) {
            win._windowBackSprite.setColorTone(WINDOW_DARKEN_TONE);
        }

        if (win._windowFrameSprite && win._windowFrameSprite.setColorTone) {
            win._windowFrameSprite.setColorTone(WINDOW_DARKEN_TONE);
        }

        win.backOpacity = 255;
    }

    function titleCase(s) {
        return String(s).replace(/_/g, " ");
    }

    var OUTFIT_KEYS = Object.keys(AIH.CharacterDisplay.OUTFITS);
    var EXPRESSION_KEYS = Object.keys(AIH.CharacterDisplay.EXPRESSIONS);
    var BINARY_STATUS_KEYS = ["wet", "dirty", "bruised"];
    var STAGE_CAPABLE_KEYS = ["slimed", "milk_stained", "blushing"];

    // =========================================================================
    // WINDOW: COMMAND LIST
    // =========================================================================

    function Window_AIHPreviewCommand() { this.initialize.apply(this, arguments); }
    Window_AIHPreviewCommand.prototype = Object.create(Window_Command.prototype);
    Window_AIHPreviewCommand.prototype.constructor = Window_AIHPreviewCommand;

    Window_AIHPreviewCommand.prototype.initialize = function(rect, sprite) {
        this._sprite = sprite;
        this._outfitIndex = 0;
        this._expressionIndex = 0;
        Window_Command.prototype.initialize.call(this, rect);
        darkenWindow(this);
    };

    var ADJUST_ONLY_SYMBOLS = ["outfit_select", "expression_select"];

    Window_AIHPreviewCommand.prototype.makeCommandList = function() {

        var self = this;

        this.addCommand("Outfit: " + titleCase(OUTFIT_KEYS[this._outfitIndex]), "outfit_select", true);
        this.addCommand("Expression: " + titleCase(EXPRESSION_KEYS[this._expressionIndex]), "expression_select", true);

        STAGE_CAPABLE_KEYS.forEach(function(key) {

            var stage = self._sprite.getStatusEffectStage(key);
            var label = stage ? "Stage " + stage : "OFF";

            self.addCommand(
                titleCase(key) + ": " + label + "  (\u2190/\u2192 to cycle)",
                "stage_" + key,
                true
            );
        });

        BINARY_STATUS_KEYS.forEach(function(key) {

            var active = self._sprite.hasStatusEffect(key);
            self.addCommand(
                titleCase(key) + ": " + (active ? "ON" : "OFF"),
                "toggle_" + key,
                true
            );
        });

        this.addCommand("Trigger Impact (shake only)", "trigger_impact", true);
        this.addCommand("Trigger Slime Hit (impact + slimed stage 3, 3s)", "trigger_slime_hit", true);
        this.addCommand("Clear All Status Effects", "clear_status", true);
    };

    Window_AIHPreviewCommand.prototype.currentOutfitKey = function() {
        return OUTFIT_KEYS[this._outfitIndex];
    };

    Window_AIHPreviewCommand.prototype.currentExpressionKey = function() {
        return EXPRESSION_KEYS[this._expressionIndex];
    };

    Window_AIHPreviewCommand.prototype.cursorRight = function() { this._adjust(1); };
    Window_AIHPreviewCommand.prototype.cursorLeft = function() { this._adjust(-1); };

    Window_AIHPreviewCommand.prototype._stageKeyFromSymbol = function(symbol) {

        if (symbol.indexOf("stage_") !== 0) {
            return null;
        }

        var key = symbol.slice("stage_".length);

        return STAGE_CAPABLE_KEYS.indexOf(key) !== -1 ? key : null;
    };

    Window_AIHPreviewCommand.prototype._cycleStage = function(key, sign) {

        var current = this._sprite.getStatusEffectStage(key) || 0;
        var max = AIH.CharacterDisplay.MAX_STAGE || 3;
        var next = (current + sign + (max + 1)) % (max + 1);

        if (next === 0) {

            this._sprite.removeStatusEffect(key);

            if (this._onStageChanged) {
                this._onStageChanged(key, null);
            }

            return;
        }

        if (
            typeof AIH.StatusEffectCatalog !== "undefined" &&
            AIH.StatusEffectCatalog.applyStage
        ) {

            AIH.StatusEffectCatalog.applyStage(key, next, { sprite: this._sprite });

        } else {

            // catalog not loaded - fall back to a purely visual stage change
            this._sprite.setStatusEffectStage(key, next);
        }

        if (this._onStageChanged) {
            this._onStageChanged(key, next);
        }
    };

    Window_AIHPreviewCommand.prototype._adjust = function(sign) {

        var symbol = this.commandSymbol(this.index());
        var handled = true;
        var stageKey = this._stageKeyFromSymbol(symbol);

        if (symbol === "outfit_select") {

            this._outfitIndex =
                (this._outfitIndex + sign + OUTFIT_KEYS.length) % OUTFIT_KEYS.length;
            this._sprite.setOutfit(this.currentOutfitKey());

        } else if (symbol === "expression_select") {

            this._expressionIndex =
                (this._expressionIndex + sign + EXPRESSION_KEYS.length) % EXPRESSION_KEYS.length;
            this._sprite.setExpression(this.currentExpressionKey());

        } else if (stageKey) {

            this._cycleStage(stageKey, sign);

        } else {

            handled = false;
        }

        if (handled) {

            if (typeof SoundManager !== "undefined" && SoundManager.playCursor) {
                SoundManager.playCursor();
            }

            this.refresh();
        }
    };

    Window_AIHPreviewCommand.prototype.processOk = function() {

        var symbol = this.commandSymbol(this.index());

        if (
            ADJUST_ONLY_SYMBOLS.indexOf(symbol) !== -1 ||
            this._stageKeyFromSymbol(symbol)
        ) {

            if (typeof SoundManager !== "undefined" && SoundManager.playCursor) {
                SoundManager.playCursor();
            }

            return;
        }

        Window_Command.prototype.processOk.call(this);
    };

    Window_AIHPreviewCommand.prototype.itemTextAlign = function() { return "left"; };

    Window_AIHPreviewCommand.prototype.drawItem = function(index) {

        var rect = this.itemLineRect(index);

        this.resetTextColor();
        this.changeTextColor(COLORS.text);
        this.contents.fontSize = 15;
        this.drawText(this.commandName(index), rect.x, rect.y, rect.width, "left");
    };

    // =========================================================================
    // WINDOW: STAGE INFO (bottom strip - description + reaction/behavior tags
    // for whichever stage-capable status effect last changed)
    // =========================================================================

    function Window_AIHStageInfo() { this.initialize.apply(this, arguments); }
    Window_AIHStageInfo.prototype = Object.create(Window_Base.prototype);
    Window_AIHStageInfo.prototype.constructor = Window_AIHStageInfo;

    Window_AIHStageInfo.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        darkenWindow(this);
        this._key = null;
        this._stage = null;
        this.refresh();
    };

    Window_AIHStageInfo.prototype.showStage = function(key, stage) {
        this._key = key;
        this._stage = stage;
        this.refresh();
    };

    Window_AIHStageInfo.prototype.refresh = function() {

        this.contents.clear();

        var lh = 20;
        var y = 0;

        if (
            !this._key ||
            !this._stage ||
            typeof AIH.StatusEffectCatalog === "undefined"
        ) {

            this.changeTextColor(COLORS.textFaint);
            this.contents.fontSize = 13;
            this.drawText(
                this._key && !this._stage ?
                    titleCase(this._key) + " is currently off." :
                    "Cycle a stage-capable status effect to see its description here.",
                0, y, this.contentsWidth(), "left"
            );
            return;
        }

        var info = AIH.StatusEffectCatalog.getStageInfo(this._key, this._stage);

        if (!info) {
            return;
        }

        this.changeTextColor(COLORS.text);
        this.contents.fontSize = 13;
        this.drawTextEx(
            titleCase(this._key) + " - Stage " + this._stage + ": " + info.description,
            0, y, this.contentsWidth()
        );
        y += lh * 2;

        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 12;
        this.drawText("DUNGEON:", 0, y, 80, "left");
        this.changeTextColor(COLORS.textMuted);
        this.drawText(info.dungeonBehaviorTags.map(titleCase).join(", ") || "(none)", 80, y, this.contentsWidth() - 80, "left");
        y += lh;

        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 12;
        this.drawText("TOWN:", 0, y, 80, "left");
        this.changeTextColor(COLORS.textMuted);
        this.drawText(info.townBehaviorTags.map(titleCase).join(", ") || "(none)", 80, y, this.contentsWidth() - 80, "left");
        y += lh;

        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 12;
        this.drawText("NPCs MIGHT:", 0, y, 80, "left");
        this.changeTextColor(COLORS.textMuted);
        this.drawText(info.npcReactionTags.map(titleCase).join(", "), 80, y, this.contentsWidth() - 80, "left");
    };

    // =========================================================================
    // SCENE
    // =========================================================================

    function Scene_AIHCharacterPreview() { this.initialize.apply(this, arguments); }
    Scene_AIHCharacterPreview.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_AIHCharacterPreview.prototype.constructor = Scene_AIHCharacterPreview;

    Scene_AIHCharacterPreview.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_AIHCharacterPreview.prototype.createBackground = function() {

        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
        this._backgroundSprite.bitmap.fillRect(0, 0, Graphics.width, Graphics.height, "#111111");
        this.addChild(this._backgroundSprite);
    };

    Scene_AIHCharacterPreview.prototype.create = function() {

        Scene_MenuBase.prototype.create.call(this);

        this.createCharacterSprite();
        this.createCommandWindow();
        this.createInfoWindow();
    };

    Scene_AIHCharacterPreview.prototype.createCharacterSprite = function() {

        this._characterSprite = AIH.CharacterDisplay.createSprite();
        this._characterSprite.setOutfit(OUTFIT_KEYS[0]);
        this._characterSprite.setExpression(EXPRESSION_KEYS[0]);
        this._characterSprite.setBasePosition(
            Math.floor(Graphics.boxWidth * 0.72),
            Math.floor(Graphics.boxHeight * 0.15)
        );

        this.addChild(this._characterSprite);
    };

    Scene_AIHCharacterPreview.prototype.commandWindowRect = function() {
        var width = Math.floor(Graphics.boxWidth * 0.42);
        var height = Graphics.boxHeight - this.infoWindowRect().height;
        return new Rectangle(0, 0, width, height);
    };

    Scene_AIHCharacterPreview.prototype.infoWindowRect = function() {
        var height = 130;
        var y = Graphics.boxHeight - height;
        return new Rectangle(0, y, Graphics.boxWidth, height);
    };

    Scene_AIHCharacterPreview.prototype.createInfoWindow = function() {
        this._infoWindow = new Window_AIHStageInfo(this.infoWindowRect());
        this.addWindow(this._infoWindow);
    };

    Scene_AIHCharacterPreview.prototype.createCommandWindow = function() {

        this._commandWindow =
            new Window_AIHPreviewCommand(this.commandWindowRect(), this._characterSprite);

        this._commandWindow.setHandler("toggle_wet", this._makeToggleHandler("wet"));
        this._commandWindow.setHandler("toggle_dirty", this._makeToggleHandler("dirty"));
        this._commandWindow.setHandler("toggle_bruised", this._makeToggleHandler("bruised"));

        this._commandWindow.setHandler("trigger_impact", this.onTriggerImpact.bind(this));
        this._commandWindow.setHandler("trigger_slime_hit", this.onTriggerSlimeHit.bind(this));
        this._commandWindow.setHandler("clear_status", this.onClearStatus.bind(this));
        this._commandWindow.setHandler("cancel", this.popScene.bind(this));

        this._commandWindow._onStageChanged = this.onStageChanged.bind(this);

        this._commandWindow.activate();
        this.addWindow(this._commandWindow);
    };

    Scene_AIHCharacterPreview.prototype._makeToggleHandler = function(key) {

        var self = this;

        return function() {

            if (self._characterSprite.hasStatusEffect(key)) {
                self._characterSprite.removeStatusEffect(key);
            } else {
                self._characterSprite.addStatusEffect(key);
            }

            self._commandWindow.refresh();
            self._commandWindow.activate();
        };
    };

    Scene_AIHCharacterPreview.prototype.onTriggerImpact = function() {

        this._characterSprite.triggerImpact();
        this._commandWindow.activate();
    };

    Scene_AIHCharacterPreview.prototype.onTriggerSlimeHit = function() {

        if (
            typeof AIH.StatusEffectCatalog !== "undefined" &&
            AIH.StatusEffectCatalog.applyStage
        ) {

            AIH.StatusEffectCatalog.applyStage(
                "slimed",
                3,
                { sprite: this._characterSprite, durationFrames: 180 }
            );

            this.onStageChanged("slimed", 3);

        } else {

            this._characterSprite.setStatusEffectStage("slimed", 3, { durationFrames: 180 });
        }

        this._characterSprite.triggerImpact();

        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    Scene_AIHCharacterPreview.prototype.onClearStatus = function() {

        this._characterSprite.clearStatusEffects();

        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    /*
     * Called whenever a stage-capable status effect changes via the
     * command window's left/right cycling, or the slime-hit shortcut -
     * refreshes the description/reaction-tag readout.
     */
    Scene_AIHCharacterPreview.prototype.onStageChanged = function(key, stage) {

        if (this._infoWindow) {
            this._infoWindow.showStage(key, stage);
        }
    };

    Scene_AIHCharacterPreview.prototype.update = function() {

        Scene_MenuBase.prototype.update.call(this);

        if (this._characterSprite) {
            this._characterSprite.update();
        }
    };

    Scene_AIHCharacterPreview.prototype.popScene = function() {

        AIH.CharacterDisplay.releaseActiveSprite();
        Scene_MenuBase.prototype.popScene.call(this);
    };

    // =========================================================================
    // OPENING THE SCENE
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand("AIH_CharacterDisplay_PreviewScene", "OpenPreviewScene", function() {
            SceneManager.push(Scene_AIHCharacterPreview);
        });
    }

    if (typeof Input !== "undefined" && Input.keyMapper && Input.keyMapper[118] === undefined) {
        Input.keyMapper[118] = "aih_character_preview_debug"; // F7
    }

    if (typeof Scene_Map !== "undefined") {

        var _AIH_CharacterPreview_SceneMap_update = Scene_Map.prototype.update;

        Scene_Map.prototype.update = function() {

            _AIH_CharacterPreview_SceneMap_update.call(this);

            if (
                typeof $gameTemp !== "undefined" &&
                $gameTemp.isPlaytest() &&
                typeof Input !== "undefined" &&
                Input.isTriggered("aih_character_preview_debug")
            ) {

                SceneManager.push(Scene_AIHCharacterPreview);
            }
        };
    }

    AIH.CharacterDisplay.Scene_AIHCharacterPreview = Scene_AIHCharacterPreview;
    AIH.CharacterDisplay.Window_AIHPreviewCommand = Window_AIHPreviewCommand;
    AIH.CharacterDisplay.Window_AIHStageInfo = Window_AIHStageInfo;

})();