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
    var TOGGLE_STATUS_KEYS = [
        "slimed", "wet", "dirty", "milk_stained", "blushing", "bruised"
    ];

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

        TOGGLE_STATUS_KEYS.forEach(function(key) {

            var active = self._sprite.hasStatusEffect(key);
            self.addCommand(
                titleCase(key) + ": " + (active ? "ON" : "OFF"),
                "toggle_" + key,
                true
            );
        });

        this.addCommand("Trigger Impact (shake only)", "trigger_impact", true);
        this.addCommand("Trigger Slime Hit (impact + slimed, 3s)", "trigger_slime_hit", true);
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

    Window_AIHPreviewCommand.prototype._adjust = function(sign) {

        var symbol = this.commandSymbol(this.index());
        var handled = true;

        if (symbol === "outfit_select") {

            this._outfitIndex =
                (this._outfitIndex + sign + OUTFIT_KEYS.length) % OUTFIT_KEYS.length;
            this._sprite.setOutfit(this.currentOutfitKey());

        } else if (symbol === "expression_select") {

            this._expressionIndex =
                (this._expressionIndex + sign + EXPRESSION_KEYS.length) % EXPRESSION_KEYS.length;
            this._sprite.setExpression(this.currentExpressionKey());

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

        if (ADJUST_ONLY_SYMBOLS.indexOf(symbol) !== -1) {

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
        var height = Graphics.boxHeight;
        return new Rectangle(0, 0, width, height);
    };

    Scene_AIHCharacterPreview.prototype.createCommandWindow = function() {

        this._commandWindow =
            new Window_AIHPreviewCommand(this.commandWindowRect(), this._characterSprite);

        this._commandWindow.setHandler("toggle_slimed", this._makeToggleHandler("slimed"));
        this._commandWindow.setHandler("toggle_wet", this._makeToggleHandler("wet"));
        this._commandWindow.setHandler("toggle_dirty", this._makeToggleHandler("dirty"));
        this._commandWindow.setHandler("toggle_milk_stained", this._makeToggleHandler("milk_stained"));
        this._commandWindow.setHandler("toggle_blushing", this._makeToggleHandler("blushing"));
        this._commandWindow.setHandler("toggle_bruised", this._makeToggleHandler("bruised"));

        this._commandWindow.setHandler("trigger_impact", this.onTriggerImpact.bind(this));
        this._commandWindow.setHandler("trigger_slime_hit", this.onTriggerSlimeHit.bind(this));
        this._commandWindow.setHandler("clear_status", this.onClearStatus.bind(this));
        this._commandWindow.setHandler("cancel", this.popScene.bind(this));

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

        this._characterSprite.addStatusEffect("slimed", { durationFrames: 180 });
        this._characterSprite.triggerImpact();

        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    Scene_AIHCharacterPreview.prototype.onClearStatus = function() {

        this._characterSprite.clearStatusEffects();

        this._commandWindow.refresh();
        this._commandWindow.activate();
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

})();