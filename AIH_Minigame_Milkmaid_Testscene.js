/*:
 * @plugindesc AI Hero Framework - Milkmaid Debug/Test Scene v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - MILKMAID DEBUG/TEST SCENE
 * ============================================================================
 *
 * An in-game scene for exercising AIH.MinigameMilkmaid directly during
 * playtesting - no code editing required. This is a real Scene_/Window_
 * pair built on RPG Maker MZ's own engine classes, not a browser mockup.
 *
 * OPENING THE SCENE
 *
 *     - Plugin Command "Open Test Scene" (call from any event), or
 *     - Press F6 on the map, but ONLY while $gameTemp.isPlaytest() is
 *       true - this shortcut does not exist at all in a deployed/
 *       exported game, playtest-only like RPG Maker's own debug tools.
 *
 * VISUAL STYLE
 *
 * Flat dark panels, light gray text, no thematic color palette. Windows
 * keep the engine's normal frame/cursor/scroll-arrow behavior (that code
 * is well-tested and reliable) but are recolored dark via
 * Sprite.setColorTone() on the window's back/frame sprites - the
 * standard, asset-free way to retheme a window's skin. Semantic color
 * is limited to exactly two cases: green for a good outcome, red for a
 * bad one, in the log only.
 *
 * CONTROLS
 *
 * Command list (left):
 *   Start Shift / Serve Next Horse / End Shift - the shift lifecycle.
 *   Horse Set - Left/Right cycles which horses will be assigned on the
 *     next Start Shift.
 *   Mana / Fatigue / Privacy / Bonus Offered - Left/Right adjusts.
 *   Supervisor Present / Witness Present - OK toggles on/off.
 *   Event - Left/Right selects a supervisor event type; the row below
 *     ("Trigger Event") fires whichever one is currently selected.
 *   Force +1 Caught / Force Favor Demand - debug shortcuts so the
 *     favor/lie mechanics don't require grinding detection RNG.
 *   Reset Save - wipes all drift/relationship/shift history.
 *
 * Right panel shows her live boundary traits, emotions, and her
 * relationship with the supervisor as gauges. Bottom panel is a
 * scrolling log of what just happened, newest at top.
 *
 * ============================================================================
 *
 * @command OpenTestScene
 * @text Open Test Scene
 * @desc Opens the Milkmaid debug/test scene.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // PLAIN DARK PALETTE - flat, no theme. Two semantic colors only.
    // =========================================================================

    var COLORS = {
        text:       "#d8d8d8",
        textMuted:  "#8a8a8a",
        textFaint:  "#5c5c5c",
        good:       "#5fae6f",
        bad:        "#c0605f",
        gaugeBack:  "#333333",
        gaugeFill:  "#9a9a9a",
        gaugeFillNeg: "#6d6d6d"
    };

    AIH.MilkmaidTestUI = AIH.MilkmaidTestUI || {};
    AIH.MilkmaidTestUI.COLORS = COLORS;

    var WINDOW_DARKEN_TONE = [-150, -150, -150, 0];

    /*
     * Standard, asset-free window re-theme: darken the engine's own
     * back/frame sprites via color tone rather than replacing the
     * windowskin image. Safe against any windowskin the project uses.
     */
    AIH.MilkmaidTestUI.darkenWindow = function(win) {

        if (win._windowBackSprite && win._windowBackSprite.setColorTone) {
            win._windowBackSprite.setColorTone(WINDOW_DARKEN_TONE);
        }

        if (win._windowFrameSprite && win._windowFrameSprite.setColorTone) {
            win._windowFrameSprite.setColorTone(WINDOW_DARKEN_TONE);
        }

        win.backOpacity = 255;
    };

    // =========================================================================
    // LIVE STATE HELPERS
    // =========================================================================

    function mmStatus() {
        return (AIH.MinigameMilkmaid && AIH.MinigameMilkmaid.getStatus()) || {};
    }

    function mmState() {
        return AIH.MinigameMilkmaid ? AIH.MinigameMilkmaid._ensure() : null;
    }

    function mmContext() {
        var s = mmState();
        return (s && s.context) || {};
    }

    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    var BOUNDARY_TRAITS = [
        "inhibition", "defiance", "assertiveness", "approvalSeeking",
        "trust", "mercy", "attentionSeeking"
    ];

    var EMOTIONS_SHOWN = ["confidence", "embarrassment", "fear", "stress", "comfort"];

    var EVENT_TYPES = [
        "increased_workload", "extra_pay_offer", "unpleasant_task",
        "rule_reminder", "suspicion", "moral_pressure"
    ];

    var HORSE_SETS = [
        { label: "All Horses", ids: null },
        { label: "Ash Only", ids: ["ash"] },
        { label: "Willow Only", ids: ["willow"] },
        { label: "Storm Only", ids: ["storm"] },
        { label: "Clover Only", ids: ["clover"] },
        { label: "Brindle Only", ids: ["brindle"] }
    ];

    function fmtPct(v) { return Math.round(clamp01(v) * 100) + "%"; }
    function titleCase(s) { return String(s).replace(/_/g, " "); }

    // =========================================================================
    // WINDOW: STATUS STRIP (top)
    // =========================================================================

    function Window_MilkmaidStatus() { this.initialize.apply(this, arguments); }
    Window_MilkmaidStatus.prototype = Object.create(Window_Base.prototype);
    Window_MilkmaidStatus.prototype.constructor = Window_MilkmaidStatus;

    Window_MilkmaidStatus.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        AIH.MilkmaidTestUI.darkenWindow(this);
        this.refresh();
    };

    Window_MilkmaidStatus.prototype.refresh = function() {

        this.contents.clear();

        var st = mmStatus();
        var s = mmState();
        var remaining = s ? Math.max(0, s.assignedHorseIds.length - s.nextHorseIndex) : 0;
        var lh = this.lineHeight();
        var colWidth = Math.floor(this.contentsWidth() / 4);

        this._drawStat(0 * colWidth, 0, colWidth, "SHIFT", st.shiftActive ? "ACTIVE" : "IDLE");
        this._drawStat(1 * colWidth, 0, colWidth, "VOLUME / TARGET", st.totalVolumeThisShift + " / " + st.currentTarget);
        this._drawStat(2 * colWidth, 0, colWidth, "PAY", String(st.totalPayThisShift));
        this._drawStat(3 * colWidth, 0, colWidth, "HORSES LEFT", String(remaining));

        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 16;
        this.drawText(
            (s && s.totalShiftsCompleted ? s.totalShiftsCompleted + " shift(s) completed" : "no shifts worked yet"),
            0, lh * 1.6, this.contentsWidth(), "left"
        );
    };

    Window_MilkmaidStatus.prototype._drawStat = function(x, y, width, label, value) {

        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 14;
        this.drawText(label, x, y, width, "left");

        this.changeTextColor(COLORS.text);
        this.contents.fontSize = 20;
        this.drawText(value, x, y + 20, width, "left");
    };

    // =========================================================================
    // WINDOW: COMMAND LIST (left)
    // =========================================================================

    function Window_MilkmaidCommand() { this.initialize.apply(this, arguments); }
    Window_MilkmaidCommand.prototype = Object.create(Window_Command.prototype);
    Window_MilkmaidCommand.prototype.constructor = Window_MilkmaidCommand;

    Window_MilkmaidCommand.prototype.initialize = function(rect) {
        this._horseSetIndex = 0;
        this._eventIndex = 0;
        Window_Command.prototype.initialize.call(this, rect);
        AIH.MilkmaidTestUI.darkenWindow(this);
    };

    var ADJUST_ONLY_SYMBOLS = ["mana", "fatigue", "privacy", "bonus", "horse_set", "event_select"];

    Window_MilkmaidCommand.prototype.makeCommandList = function() {

        var st = mmStatus();
        var ctx = mmContext();

        this.addCommand("Start Shift", "start_shift", !st.shiftActive);
        this.addCommand("Serve Next Horse", "serve_horse", !!st.shiftActive);
        this.addCommand("End Shift", "end_shift", !!st.shiftActive);
        this.addCommand("Horse Set: " + HORSE_SETS[this._horseSetIndex].label, "horse_set", !st.shiftActive);

        this.addCommand("Mana: " + fmtPct(ctx.manaFraction), "mana", true);
        this.addCommand("Fatigue: " + fmtPct(ctx.fatigueFraction), "fatigue", true);
        this.addCommand("Privacy: " + fmtPct(ctx.privacyLevel), "privacy", true);
        this.addCommand("Bonus Offered: " + (ctx.bonusOffered || 0), "bonus", true);

        this.addCommand("Supervisor Present: " + (ctx.supervisorPresent ? "ON" : "OFF"), "supervisor_present", true);
        this.addCommand("Witness Present: " + (ctx.witnessPresent ? "ON" : "OFF"), "witness_present", true);

        this.addCommand("Event: " + titleCase(EVENT_TYPES[this._eventIndex]), "event_select", true);
        this.addCommand("Trigger Event", "trigger_event", true);

        this.addCommand("Force +1 Caught", "force_caught", true);
        this.addCommand(
            "Force Favor Demand",
            "force_favor",
            !!(AIH.MinigameMilkmaid && AIH.MinigameMilkmaid.isFavorSystemUnlocked())
        );

        this.addCommand("Reset Save", "reset", true);
    };

    Window_MilkmaidCommand.prototype.currentHorseIds = function() {
        return HORSE_SETS[this._horseSetIndex].ids;
    };

    Window_MilkmaidCommand.prototype.currentEventType = function() {
        return EVENT_TYPES[this._eventIndex];
    };

    Window_MilkmaidCommand.prototype.cursorRight = function() { this._adjust(1); };
    Window_MilkmaidCommand.prototype.cursorLeft = function() { this._adjust(-1); };

    Window_MilkmaidCommand.prototype._adjust = function(sign) {

        var symbol = this.commandSymbol(this.index());
        var ctx = mmContext();
        var mm = AIH.MinigameMilkmaid;
        var handled = true;

        if (symbol === "mana") {
            mm.setManaFraction(clamp01((ctx.manaFraction || 0) + sign * 0.1));
        } else if (symbol === "fatigue") {
            mm.setFatigueFraction(clamp01((ctx.fatigueFraction || 0) + sign * 0.1));
        } else if (symbol === "privacy") {
            mm.setPrivacyLevel(clamp01((ctx.privacyLevel || 0) + sign * 0.1));
        } else if (symbol === "bonus") {
            mm.setBonusOffered(Math.max(0, (ctx.bonusOffered || 0) + sign * 5));
        } else if (symbol === "horse_set") {
            this._horseSetIndex =
                (this._horseSetIndex + sign + HORSE_SETS.length) % HORSE_SETS.length;
        } else if (symbol === "event_select") {
            this._eventIndex =
                (this._eventIndex + sign + EVENT_TYPES.length) % EVENT_TYPES.length;
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

    Window_MilkmaidCommand.prototype.processOk = function() {

        var symbol = this.commandSymbol(this.index());

        if (ADJUST_ONLY_SYMBOLS.indexOf(symbol) !== -1) {
            // Left/Right already handles these; OK does nothing but must
            // not deactivate the window or drop input focus.
            if (typeof SoundManager !== "undefined" && SoundManager.playCursor) {
                SoundManager.playCursor();
            }
            return;
        }

        Window_Command.prototype.processOk.call(this);
    };

    Window_MilkmaidCommand.prototype.itemTextAlign = function() { return "left"; };

    Window_MilkmaidCommand.prototype.drawItem = function(index) {

        var rect = this.itemLineRect(index);
        var enabled = this.isCommandEnabled(index);

        this.resetTextColor();
        this.changePaintOpacity(enabled ? 1 : 0.4);
        this.contents.fontSize = 15;
        this.changeTextColor(COLORS.text);
        this.drawText(this.commandName(index), rect.x, rect.y, rect.width, "left");
        this.changePaintOpacity(true);
    };

    // =========================================================================
    // WINDOW: PSYCHOLOGY (right)
    // =========================================================================

    function Window_MilkmaidPsychology() { this.initialize.apply(this, arguments); }
    Window_MilkmaidPsychology.prototype = Object.create(Window_Base.prototype);
    Window_MilkmaidPsychology.prototype.constructor = Window_MilkmaidPsychology;

    Window_MilkmaidPsychology.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        AIH.MilkmaidTestUI.darkenWindow(this);
        this.refresh();
    };

    Window_MilkmaidPsychology.prototype.refresh = function() {

        this.contents.clear();

        var y = 0;
        var lh = 22;
        var barWidth = this.contentsWidth() - 8;

        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 14;
        this.drawText("BOUNDARY TRAITS", 0, y, this.contentsWidth(), "left");
        y += lh;

        var self = this;
        BOUNDARY_TRAITS.forEach(function(t) {
            var v = (typeof AIH.Personality !== "undefined") ? AIH.Personality.getTrait(t) : 0;
            y = self._drawGaugeRow(t, v, y, barWidth);
        });

        y += 6;
        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 14;
        this.drawText("CURRENT FEELING", 0, y, this.contentsWidth(), "left");
        y += lh;

        EMOTIONS_SHOWN.forEach(function(e) {
            var v = (typeof AIH.Emotions !== "undefined") ? AIH.Emotions.getValue(e) : 0;
            y = self._drawGaugeRow(e, v, y, barWidth);
        });

        y += 6;
        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 14;
        this.drawText("SUPERVISOR", 0, y, this.contentsWidth(), "left");
        y += lh;

        var rel = (typeof AIH.Relationships !== "undefined" && AIH.MinigameMilkmaid) ?
            AIH.Relationships.get(AIH.MinigameMilkmaid.SUPERVISOR.id) : null;

        if (rel) {
            y = self._drawCenteredGaugeRow("respect", rel.respect || 0, y, barWidth);
            y = self._drawCenteredGaugeRow("dominance", rel.dominance || 0, y, barWidth);
            y = self._drawCenteredGaugeRow("submissiveness", rel.submissiveness || 0, y, barWidth);
        } else {
            this.changeTextColor(COLORS.textFaint);
            this.contents.fontSize = 13;
            this.drawText("no relationship yet - start a shift", 0, y, this.contentsWidth(), "left");
            y += lh;
        }

        y += 6;
        var st = mmStatus();
        this.changeTextColor(COLORS.textFaint);
        this.contents.fontSize = 14;
        this.drawText("THE MILK", 0, y, this.contentsWidth(), "left");
        y += lh;
        this.changeTextColor(COLORS.textMuted);
        this.contents.fontSize = 13;
        this.drawTextEx('"' + (st.tasteDescriptor || "") + '"', 0, y, this.contentsWidth());
        y += lh + 4;

        this._drawFlag("Times caught", String(st.caughtCount || 0), y, barWidth); y += 20;
        this._drawFlag("Ever attempted a lie", st.lieEverAttempted ? "yes" : "no", y, barWidth); y += 20;
        this._drawFlag("Favor unlocked", st.favorSystemUnlocked ? "yes" : "no", y, barWidth); y += 20;
    };

    Window_MilkmaidPsychology.prototype._drawGaugeRow = function(name, value, y, barWidth) {

        this.changeTextColor(COLORS.textMuted);
        this.contents.fontSize = 13;
        this.drawText(name, 0, y, barWidth * 0.6, "left");
        this.drawText(value.toFixed(2), 0, y, barWidth, "right");

        this.drawGauge(0, y + 18, barWidth, clamp01(value), COLORS.gaugeFill, COLORS.gaugeFill);

        return y + 30;
    };

    Window_MilkmaidPsychology.prototype._drawCenteredGaugeRow = function(name, value, y, barWidth) {

        // Relationship axes run -100..100; render as a rate 0..1 centered
        // on the middle of the bar.
        var rate = clamp01((value + 100) / 200);

        this.changeTextColor(COLORS.textMuted);
        this.contents.fontSize = 13;
        this.drawText(name, 0, y, barWidth * 0.6, "left");
        this.drawText(String(Math.round(value)), 0, y, barWidth, "right");

        this.drawGauge(0, y + 18, barWidth, rate, COLORS.gaugeFillNeg, COLORS.gaugeFill);

        return y + 30;
    };

    Window_MilkmaidPsychology.prototype._drawFlag = function(label, value, y, barWidth) {

        this.changeTextColor(COLORS.textMuted);
        this.contents.fontSize = 13;
        this.drawText(label, 0, y, barWidth * 0.65, "left");
        this.changeTextColor(COLORS.text);
        this.drawText(value, 0, y, barWidth, "right");
    };

    // =========================================================================
    // WINDOW: LOG (bottom)
    // =========================================================================

    function Window_MilkmaidLog() { this.initialize.apply(this, arguments); }
    Window_MilkmaidLog.prototype = Object.create(Window_Base.prototype);
    Window_MilkmaidLog.prototype.constructor = Window_MilkmaidLog;

    Window_MilkmaidLog.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        AIH.MilkmaidTestUI.darkenWindow(this);
        this._lines = [];
        this.refresh();
    };

    /*
     * tag: null | "good" | "bad" - the only two semantic colors used
     * anywhere in this UI, and only here.
     */
    Window_MilkmaidLog.prototype.addLine = function(text, tag) {

        this._lines.unshift({ text: text, tag: tag || null });

        if (this._lines.length > 200) {
            this._lines.length = 200;
        }

        this.refresh();
    };

    Window_MilkmaidLog.prototype.refresh = function() {

        this.contents.clear();

        var lh = 20;
        var maxLines = Math.floor(this.contentsHeight() / lh);
        var shown = this._lines.slice(0, maxLines);

        for (var i = 0; i < shown.length; i++) {

            var line = shown[i];
            var color =
                line.tag === "good" ? COLORS.good :
                line.tag === "bad" ? COLORS.bad :
                COLORS.text;

            this.changeTextColor(color);
            this.contents.fontSize = 14;
            this.drawText(line.text, 4, i * lh, this.contentsWidth() - 8, "left");
        }

        if (shown.length === 0) {
            this.changeTextColor(COLORS.textFaint);
            this.contents.fontSize = 14;
            this.drawText("The night is quiet. Nothing has happened yet.", 4, 0, this.contentsWidth() - 8, "left");
        }
    };

    Window_MilkmaidLog.prototype.clearLines = function() {
        this._lines = [];
        this.refresh();
    };

    // =========================================================================
    // SCENE
    // =========================================================================

    function Scene_MilkmaidTest() { this.initialize.apply(this, arguments); }
    Scene_MilkmaidTest.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_MilkmaidTest.prototype.constructor = Scene_MilkmaidTest;

    Scene_MilkmaidTest.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    /*
     * Plain flat background rather than Scene_MenuBase's blurred map
     * snapshot - a solid dark fill, nothing else.
     */
    Scene_MilkmaidTest.prototype.createBackground = function() {

        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
        this._backgroundSprite.bitmap.fillRect(0, 0, Graphics.width, Graphics.height, "#111111");
        this.addChild(this._backgroundSprite);
    };

    Scene_MilkmaidTest.prototype.create = function() {

        Scene_MenuBase.prototype.create.call(this);

        this.createStatusWindow();
        this.createCommandWindow();
        this.createPsychologyWindow();
        this.createLogWindow();
    };

    Scene_MilkmaidTest.prototype.statusWindowRect = function() {
        return new Rectangle(0, 0, Graphics.boxWidth, 96);
    };

    Scene_MilkmaidTest.prototype.commandWindowRect = function() {
        var y = this.statusWindowRect().height;
        var width = Math.floor(Graphics.boxWidth * 0.42);
        var height = Math.floor(Graphics.boxHeight * 0.62) - y;
        return new Rectangle(0, y, width, height);
    };

    Scene_MilkmaidTest.prototype.psychologyWindowRect = function() {
        var cmd = this.commandWindowRect();
        var y = cmd.y;
        var x = cmd.width;
        var width = Graphics.boxWidth - x;
        var height = cmd.height;
        return new Rectangle(x, y, width, height);
    };

    Scene_MilkmaidTest.prototype.logWindowRect = function() {
        var cmd = this.commandWindowRect();
        var y = cmd.y + cmd.height;
        var width = Graphics.boxWidth;
        var height = Graphics.boxHeight - y;
        return new Rectangle(0, y, width, height);
    };

    Scene_MilkmaidTest.prototype.createStatusWindow = function() {
        this._statusWindow = new Window_MilkmaidStatus(this.statusWindowRect());
        this.addWindow(this._statusWindow);
    };

    Scene_MilkmaidTest.prototype.createCommandWindow = function() {

        this._commandWindow = new Window_MilkmaidCommand(this.commandWindowRect());

        this._commandWindow.setHandler("start_shift", this.onStartShift.bind(this));
        this._commandWindow.setHandler("serve_horse", this.onServeHorse.bind(this));
        this._commandWindow.setHandler("end_shift", this.onEndShift.bind(this));
        this._commandWindow.setHandler("supervisor_present", this.onToggleSupervisorPresent.bind(this));
        this._commandWindow.setHandler("witness_present", this.onToggleWitnessPresent.bind(this));
        this._commandWindow.setHandler("trigger_event", this.onTriggerEvent.bind(this));
        this._commandWindow.setHandler("force_caught", this.onForceCaught.bind(this));
        this._commandWindow.setHandler("force_favor", this.onForceFavor.bind(this));
        this._commandWindow.setHandler("reset", this.onReset.bind(this));
        this._commandWindow.setHandler("cancel", this.popScene.bind(this));

        this._commandWindow.activate();
        this.addWindow(this._commandWindow);
    };

    Scene_MilkmaidTest.prototype.createPsychologyWindow = function() {
        this._psychologyWindow = new Window_MilkmaidPsychology(this.psychologyWindowRect());
        this.addWindow(this._psychologyWindow);
    };

    Scene_MilkmaidTest.prototype.createLogWindow = function() {
        this._logWindow = new Window_MilkmaidLog(this.logWindowRect());
        this.addWindow(this._logWindow);
    };

    Scene_MilkmaidTest.prototype.refreshAll = function() {
        this._statusWindow.refresh();
        this._commandWindow.refresh();
        this._psychologyWindow.refresh();
    };

    Scene_MilkmaidTest.prototype._reactivateCommand = function() {
        this._commandWindow.activate();
    };

    // --- handlers -------------------------------------------------------

    Scene_MilkmaidTest.prototype.onStartShift = function() {

        var horseIds = this._commandWindow.currentHorseIds();
        AIH.MinigameMilkmaid.startShift(horseIds);

        var st = mmStatus();
        this._logWindow.addLine("Shift begins. Target set at " + st.currentTarget + ".", null);

        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onServeHorse = function() {

        var result = AIH.MinigameMilkmaid.serveNextHorse();

        if (result) {

            var mr = result.methodResult;
            var qr = result.qualityResult;
            var tr = result.temptationResult;
            var cr = result.caughtResult;

            if (mr) {
                var tag = mr.evaluation.response === "reject" ? "bad" :
                    (mr.evaluation.response === "accept" ? "good" : null);
                this._logWindow.addLine(
                    result.horseName + " - chose " + titleCase(mr.method) +
                    " (" + mr.evaluation.response + "), yield " + mr.yield + ".",
                    tag
                );
            }

            if (qr && qr.action !== "no_sample") {
                this._logWindow.addLine("  Quality: " + titleCase(qr.action) + ".", null);
            }

            if (tr) {
                this._logWindow.addLine(
                    "  Temptation: " + titleCase(tr.action) +
                    (tr.manaRestored ? " (+" + tr.manaRestored + " mana)" : "") + ".",
                    null
                );
            }

            if (cr) {
                var badTag = "bad";
                var payNote = "";
                if (cr.forcedConfession) {
                    payNote = "she tried to lie and was forced to confess";
                } else {
                    payNote = "consequence: " + titleCase(cr.consequenceTier);
                    if (cr.payPenalty) {
                        payNote += cr.payDockedAsFraction ?
                            " (pay docked " + (cr.consequenceTier === "temporary_restriction" || cr.consequenceTier === "serious_reprimand" ? "majorly" : "partially") + ", -" + cr.payPenalty + " gold)" :
                            " (-" + cr.payPenalty + " gold)";
                    }
                    if (cr.consequenceTier === "no_punishment") { badTag = "good"; }
                }
                this._logWindow.addLine(
                    "  Caught for " + titleCase(cr.actionType) + " - " + titleCase(cr.chosenResponse) + ". " + payNote,
                    badTag
                );
            }
        }

        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onEndShift = function() {

        var summary = AIH.MinigameMilkmaid.endShift();

        if (summary) {

            this._logWindow.addLine(
                "Shift ends. " + summary.totalVolume + " volume, " + summary.totalPay + " gold.",
                summary.production.metTarget ? "good" : null
            );

            if (summary.favorResult) {

                var fr = summary.favorResult;
                var note = fr.accepted ?
                    "Supervisor demanded a favor - she complied." :
                    "Supervisor demanded a favor - she refused.";

                if (fr.accepted && fr.payPenalty) {
                    note += " Docked " + fr.payPenalty + " gold for the time it took.";
                }

                this._logWindow.addLine(note, fr.accepted ? "bad" : "good");

                if (fr.delivery && fr.delivery.sighting) {
                    this._logWindow.addLine(
                        "  " + fr.delivery.sighting.faction + " members saw her on the road.",
                        null
                    );
                }

                if (fr.delivery && fr.delivery.interferenceOccurred) {
                    this._logWindow.addLine(
                        "  Someone tried to make her spill it - " +
                        (fr.delivery.winner ? titleCase(fr.delivery.winner.action) : "?") +
                        (fr.delivery.spilled ? ". It spilled anyway." : ". She held onto it."),
                        null
                    );
                }
            }
        }

        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onToggleSupervisorPresent = function() {
        var ctx = mmContext();
        AIH.MinigameMilkmaid.setSupervisorPresent(!ctx.supervisorPresent);
        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onToggleWitnessPresent = function() {
        var ctx = mmContext();
        AIH.MinigameMilkmaid.setWitnessPresent(!ctx.witnessPresent);
        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onTriggerEvent = function() {

        var eventType = this._commandWindow.currentEventType();
        var result = AIH.MinigameMilkmaid.resolveSupervisorEvent(eventType);

        if (result) {
            this._logWindow.addLine(
                "Supervisor: " + titleCase(eventType) + " - " +
                (result.accepted ? "she went along with it" + (result.reward ? " (+" + result.reward + " gold)" : "") : "she refused") + ".",
                result.accepted ? null : null
            );
        }

        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onForceCaught = function() {

        var s = mmState();
        if (s) { s.caughtCount = (s.caughtCount || 0) + 1; }

        this._logWindow.addLine("[debug] Caught count forced up by 1.", null);

        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onForceFavor = function() {

        if (!AIH.MinigameMilkmaid.isFavorSystemUnlocked()) {
            this._logWindow.addLine("[debug] Favor system isn't unlocked yet.", null);
            this.refreshAll();
            this._reactivateCommand();
            return;
        }

        var fr = AIH.MinigameMilkmaid.resolveFavorDemand();

        if (fr) {
            this._logWindow.addLine(
                "[debug] Forced favor demand - " + (fr.accepted ? "she complied" : "she refused") +
                (fr.accepted && fr.payPenalty ? " (-" + fr.payPenalty + " gold)" : "") + ".",
                fr.accepted ? "bad" : "good"
            );
        }

        this.refreshAll();
        this._reactivateCommand();
    };

    Scene_MilkmaidTest.prototype.onReset = function() {

        DataManager.setupNewGame();
        this._logWindow.clearLines();
        this._logWindow.addLine("[debug] Save reset.", null);

        this.refreshAll();
        this._reactivateCommand();
    };

    // =========================================================================
    // OPENING THE SCENE
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand("AIH_Minigame_Milkmaid_TestScene", "OpenTestScene", function() {
            SceneManager.push(Scene_MilkmaidTest);
        });
    }

    /*
     * Playtest-only shortcut, mirroring how RPG Maker's own debug tools
     * gate themselves. F6 does not exist as a key mapping by default;
     * this plugin adds it only for this purpose.
     */
    if (typeof Input !== "undefined" && Input.keyMapper && Input.keyMapper[117] === undefined) {
        Input.keyMapper[117] = "aih_milkmaid_debug"; // F6
    }

    if (typeof Scene_Map !== "undefined") {

        var _AIH_MilkmaidTestScene_SceneMap_update = Scene_Map.prototype.update;

        Scene_Map.prototype.update = function() {

            _AIH_MilkmaidTestScene_SceneMap_update.call(this);

            if (
                typeof $gameTemp !== "undefined" &&
                $gameTemp.isPlaytest() &&
                typeof Input !== "undefined" &&
                Input.isTriggered("aih_milkmaid_debug")
            ) {

                SceneManager.push(Scene_MilkmaidTest);
            }
        };
    }

    AIH.MilkmaidTestUI.Scene_MilkmaidTest = Scene_MilkmaidTest;
    AIH.MilkmaidTestUI.Window_MilkmaidCommand = Window_MilkmaidCommand;
    AIH.MilkmaidTestUI.Window_MilkmaidStatus = Window_MilkmaidStatus;
    AIH.MilkmaidTestUI.Window_MilkmaidPsychology = Window_MilkmaidPsychology;
    AIH.MilkmaidTestUI.Window_MilkmaidLog = Window_MilkmaidLog;

})();