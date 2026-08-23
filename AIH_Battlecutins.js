/*:
 * @plugindesc AI Hero Framework - Battle Cut-Ins v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - BATTLE CUT-INS
 * ============================================================================
 *
 * A standalone battle-visuals layer, independent of the psychology
 * minigames (AIH_Minigame_*.js) - this module does not call
 * AIH.PressureEvaluator or AIH.PersonalityDrift at all. It only answers
 * "should something special be shown right now," never "what should she
 * do."
 *
 * SCOPE (per explicit direction): only the heroine (AIH.Hero.actorId())
 * can trigger a cut-in - as the one executing a skill, as the target of
 * one, or as the recipient of a newly-applied state. Ordinary attacks and
 * untagged skills/states play out with zero change - normal battle
 * animation, nothing overlaid. A cut-in only ever appears for a skill or
 * state someone has explicitly tagged.
 *
 * ============================================================================
 *
 * HOW TO ADD A CUT-IN (data, not code)
 *
 * 1. Add an entry to AIH.BattleCutins.DEFINITIONS (below) - a key, a
 *    type ("image" or "video"), a path, whether it's skippable, and (for
 *    images only) how long it stays up.
 *
 * 2. Reference that key from a skill or state's note box:
 *
 *      <CutInAttacker:keyName>   shown once when the heroine is the one
 *                                executing this skill
 *      <CutInTarget:keyName>     shown once when the heroine is a target
 *                                of this skill (someone else used it on
 *                                her)
 *      <CutInApplied:keyName>    (states only) shown once when this
 *                                state is newly applied to the heroine -
 *                                does not re-trigger on refresh/reapply
 *                                while it's already active
 *
 * A skill can carry both CutInAttacker and CutInTarget tags at once (two
 * different keys) if it should look different from her side than from
 * the receiving end. Nothing needs tagging for ordinary attacks - the
 * absence of a tag IS "just show a normal attack."
 *
 * ============================================================================
 *
 * SKIPPABLE (per cut-in) VS. THE MASTER SWITCH (global) - two separate
 * axes, per explicit direction
 *
 * Whether a given cut-in can be dismissed early is a property of that
 * cut-in's own DEFINITIONS entry (skippable: true/false) - while a
 * cut-in is up, pressing OK or tapping dismisses it early if skippable
 * is true; otherwise it plays to the end (image duration elapses, or the
 * video's 'ended' event fires) before battle continues.
 *
 * Separately, the whole system can be turned off entirely - a real
 * Options-menu entry ("Battle Cut-Ins"), persisted via ConfigManager the
 * same way BGM volume or Always Dash are, so the player's choice
 * survives a save/reload. AIH.BattleCutins.setEnabled()/isEnabled() and
 * the SetEnabled plugin command read/write this same flag, so an event
 * or the options menu can't disagree with each other. Defaults to
 * enabled.
 *
 * ============================================================================
 *
 * PARTY MEMBERS (once recruiting is unlocked elsewhere)
 *
 * Per explicit direction, a cut-in's own ASSET can depict a party member
 * (someone stepping in, reacting, etc.) but the TRIGGER stays
 * heroine-only - see onActionUsed's own comment. A skill that only ever
 * touches recruited party members and never the heroine never reaches a
 * cut-in check at all, regardless of what tags it carries.
 *
 * Party members don't get their own cut-in art for now - while any
 * cut-in is up, a compact Window_AIHCutinPartyStatus shows every OTHER
 * battle member (not the heroine) using stock MZ drawing methods
 * (drawActorFace/drawActorHp/drawActorMp/drawActorIcons) - face, HP/MP,
 * state icons, nothing custom-built. Empty/hidden if nobody's been
 * recruited yet.
 *
 * ============================================================================
 *
 * HOW IT PAUSES BATTLE
 *
 * Scene_Battle.isBusy() is patched to also report busy while a cut-in is
 * showing, which is the standard MZ technique for holding the battle log/
 * action sequence at exactly the current frame until something external
 * finishes - no interpreter/common-event machinery needed.
 *
 * ============================================================================
 *
 * DISPLAY MECHANICS
 *
 * "image" cut-ins are a Sprite added directly to Spriteset_Battle - slides
 * in, holds for `duration` ms (or until skipped), slides out.
 *
 * "video" cut-ins are a real HTML5 <video> element overlaid on top of the
 * game canvas (positioned/sized to match it every frame) - MZ's Pixi/
 * Graphics layer has no first-class in-canvas video texture support
 * reliable enough for this, so the video plays as a DOM overlay instead
 * and is removed the moment it ends or is skipped.
 *
 * ============================================================================
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * - decide anything about her psychology (no PressureEvaluator/
 *   PersonalityDrift calls anywhere in this file)
 * - trigger for any battler other than the heroine
 * - trigger for an untagged skill/state (normal attack visuals are
 *   untouched)
 * - invent cut-ins outside AIH.BattleCutins.DEFINITIONS at runtime - add
 *   a new one as data, not a new code path
 *
 * ============================================================================
 *
 * @command SetEnabled
 * @text Set System Enabled
 * @desc Globally enables/disables the cut-in system (default: enabled).
 *
 * @arg enabled
 * @text Enabled
 * @type boolean
 * @default true
 *
 * @command TestCutIn
 * @text Test A Cut-In
 * @desc Manually triggers a cut-in by key, for QA - only works in battle.
 *
 * @arg key
 * @text Cut-In Key
 * @type string
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.BattleCutins = AIH.BattleCutins || {};

    AIH.BattleCutins.VERSION = "0.1.0";

    AIH.BattleCutins._initialized = false;

    AIH.BattleCutins._systemEnabled = true;

    // =========================================================================
    // CUT-IN DEFINITIONS (DATA - add new cut-ins here, not new code)
    // =========================================================================
    //
    // type: "image" | "video"
    // path: placeholder paths below - real assets go in img/cutins/ or
    //       movies/cutins/ respectively.
    // skippable: whether OK/tap dismisses it early.
    // duration: ms the image stays up (ignored for video - a video's own
    //       length, or a skip, is what ends it).
    //
    // =========================================================================

    AIH.BattleCutins.DEFINITIONS = {

        example_power_strike_attacker: {
            type: "image",
            path: "img/cutins/example_power_strike_attacker.png",
            skippable: true,
            duration: 1600
        },

        example_power_strike_target: {
            type: "image",
            path: "img/cutins/example_power_strike_target.png",
            skippable: true,
            duration: 1600
        },

        example_bind_applied: {
            type: "video",
            path: "movies/cutins/example_bind_applied.webm",
            skippable: true,
            duration: 0
        }

    };

    // =========================================================================
    // UTILITY
    // =========================================================================

    AIH.BattleCutins._isHeroine = function(battler) {

        if (
            !battler ||
            typeof battler.isActor !== "function" ||
            !battler.isActor() ||
            typeof AIH.Hero === "undefined" ||
            !AIH.Hero.actorId
        ) {

            return false;
        }

        return battler.actorId() === AIH.Hero.actorId();
    };

    AIH.BattleCutins._extractNotetag = function(note, tagName) {

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
    //
    // Runs once, after the database is loaded (see the Scene_Boot hook at
    // the bottom of this file). Parsed keys are stashed directly onto each
    // $dataSkills/$dataStates entry as plain fields (prefixed _aihCutIn*)
    // so lookups at battle time are a simple property read, not a
    // regex re-parse per hit.
    //
    // =========================================================================

    AIH.BattleCutins._parseSkillNotetags = function() {

        var i;
        var skill;

        if (!$dataSkills) {
            return;
        }

        for (
            i = 1;
            i < $dataSkills.length;
            i++
        ) {

            skill =
                $dataSkills[i];

            if (!skill) {
                continue;
            }

            skill._aihCutInAttacker =
                AIH.BattleCutins._extractNotetag(
                    skill.note,
                    "CutInAttacker"
                );

            skill._aihCutInTarget =
                AIH.BattleCutins._extractNotetag(
                    skill.note,
                    "CutInTarget"
                );
        }
    };

    AIH.BattleCutins._parseStateNotetags = function() {

        var i;
        var state;

        if (!$dataStates) {
            return;
        }

        for (
            i = 1;
            i < $dataStates.length;
            i++
        ) {

            state =
                $dataStates[i];

            if (!state) {
                continue;
            }

            state._aihCutInApplied =
                AIH.BattleCutins._extractNotetag(
                    state.note,
                    "CutInApplied"
                );
        }
    };

    AIH.BattleCutins.parseAllNotetags = function() {

        AIH.BattleCutins._parseSkillNotetags();
        AIH.BattleCutins._parseStateNotetags();
    };

    // =========================================================================
    // CUT-IN QUEUE / ACTIVE STATE
    // =========================================================================
    //
    // One at a time, first-in-first-out - if several tagged things happen
    // in the same frame (rare, but a multi-hit skill could apply a tagged
    // state while also having its own CutInAttacker tag), they play back
    // to back rather than overlapping.
    //
    // =========================================================================

    AIH.BattleCutins._queue = [];

    AIH.BattleCutins._active = null;

    AIH.BattleCutins.isEnabled = function() {

        return !!AIH.BattleCutins._systemEnabled;
    };

    AIH.BattleCutins.setEnabled = function(enabled) {

        AIH.BattleCutins._systemEnabled = !!enabled;
    };

    AIH.BattleCutins.isBusy = function() {

        return (
            AIH.BattleCutins._active !== null ||
            AIH.BattleCutins._queue.length > 0
        );
    };

    AIH.BattleCutins.enqueue = function(key) {

        var definition;

        if (!AIH.BattleCutins.isEnabled()) {
            return;
        }

        definition =
            AIH.BattleCutins.DEFINITIONS[key];

        if (!definition) {

            if (
                typeof AIH.Debug !== "undefined" &&
                AIH.Debug.log
            ) {

                AIH.Debug.log(
                    "AIH.BattleCutins: no definition for key '" +
                    key +
                    "' - skipping."
                );
            }

            return;
        }

        AIH.BattleCutins._queue.push({
            key: key,
            definition: definition
        });
    };

    // =========================================================================
    // TRIGGER POINTS
    // =========================================================================

    /*
     * Called once per action use (not once per target - see the
     * BattleManager hook below), so a multi-target skill doesn't queue
     * the same attacker cut-in several times.
     *
     * IMPORTANT (per explicit direction, now that party recruitment is a
     * real mechanic): this reads action._aihCachedTargets rather than
     * calling action.makeTargets() itself. Game_Action.prototype.
     * makeTargets is wrapped further down in this file to memoize its
     * result the first time it's called for a given action use - so this
     * check and the engine's own real targeting call are GUARANTEED to
     * agree, even for a randomized-target skill. With only the heroine
     * in the party this couldn't matter; with recruited party members it
     * definitely can (a "random party member" enemy skill could
     * otherwise disagree with itself between this check and the actual
     * hit).
     *
     * Party-member scoping: a cut-in's ASSET can depict a party member
     * (e.g. someone stepping in to protect her), but the TRIGGER stays
     * heroine-only, per explicit direction - this function still only
     * ever checks whether the HEROINE is the subject or among the
     * targets, never a party member's own involvement independent of
     * her. A skill that hits only party members and never touches the
     * heroine at all never reaches this far worth noting.
     */
    AIH.BattleCutins.onActionUsed = function(action) {

        var subject;
        var item;
        var targets;
        var i;

        if (
            !action ||
            typeof action.subject !== "function"
        ) {

            return;
        }

        subject =
            action.subject();

        item =
            action.item();

        if (!item) {
            return;
        }

        if (
            AIH.BattleCutins._isHeroine(subject) &&
            item._aihCutInAttacker
        ) {

            AIH.BattleCutins.enqueue(
                item._aihCutInAttacker
            );
        }

        if (
            item._aihCutInTarget &&
            typeof action.makeTargets === "function"
        ) {

            targets =
                action.makeTargets();

            for (
                i = 0;
                i < targets.length;
                i++
            ) {

                if (AIH.BattleCutins._isHeroine(targets[i])) {

                    AIH.BattleCutins.enqueue(
                        item._aihCutInTarget
                    );

                    break;
                }
            }
        }
    };

    /*
     * Called whenever a battler gains a state that was not already
     * active on them - see the Game_Battler hook below, which only calls
     * this on a genuinely NEW state, not a refresh/reapply.
     */
    AIH.BattleCutins.onStateNewlyApplied = function(battler, stateId) {

        var state;

        if (!AIH.BattleCutins._isHeroine(battler)) {
            return;
        }

        state =
            $dataStates[stateId];

        if (
            !state ||
            !state._aihCutInApplied
        ) {

            return;
        }

        AIH.BattleCutins.enqueue(
            state._aihCutInApplied
        );
    };

    // =========================================================================
    // DISPLAY - IMAGE
    // =========================================================================

    function Sprite_AIHCutin() {
        this.initialize.apply(this, arguments);
    }

    Sprite_AIHCutin.prototype = Object.create(Sprite.prototype);
    Sprite_AIHCutin.prototype.constructor = Sprite_AIHCutin;

    Sprite_AIHCutin.prototype.initialize = function(definition, onComplete) {

        Sprite.prototype.initialize.call(this);

        this._definition = definition;
        this._onComplete = onComplete;
        this._holdTimer = 0;
        this._phase = "in";

        this.bitmap =
            ImageManager.loadBitmap(
                "",
                this._definition.path,
                0,
                true
            );

        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this.x = Graphics.width / 2;
        this.y = Graphics.height / 2;
        this.opacity = 0;
        this.scale.x = 0.9;
        this.scale.y = 0.9;
    };

    Sprite_AIHCutin.prototype.skip = function() {

        if (!this._definition.skippable) {
            return;
        }

        this._phase = "out";
        this._holdTimer = 0;
    };

    Sprite_AIHCutin.prototype.update = function() {

        Sprite.prototype.update.call(this);

        if (this._phase === "in") {

            this.opacity =
                Math.min(255, this.opacity + 20);

            this.scale.x =
                Math.min(1, this.scale.x + 0.01);

            this.scale.y =
                this.scale.x;

            if (this.opacity >= 255) {
                this._phase = "hold";
            }

        } else if (this._phase === "hold") {

            this._holdTimer +=
                1000 / 60;

            if (
                this._holdTimer >=
                AIH.BattleCutins._number(
                    this._definition.duration,
                    1500
                )
            ) {

                this._phase = "out";
            }

        } else if (this._phase === "out") {

            this.opacity =
                Math.max(0, this.opacity - 20);

            if (this.opacity <= 0) {

                this._phase = "done";

                if (this._onComplete) {
                    this._onComplete();
                }
            }
        }
    };

    // =========================================================================
    // PARTY-MEMBER STATUS (compact, default-RPG-Maker-style, shown
    // alongside any cut-in)
    // =========================================================================
    //
    // Per explicit direction: now that recruiting party members is a real
    // mechanic, other party members don't need their own full standing
    // art for cut-ins - just a compact, stock-MZ-style readout (face,
    // HP/MP, state icons) so the player can still see their status while
    // a cut-in focused on the heroine is up. Reuses Window_StatusBase's
    // own drawing methods directly rather than building custom gauge/icon
    // rendering - this IS "just displayed like rpg default."
    //
    // Excludes the heroine herself (she's the one the cut-in is already
    // about) and only lists actual battle members, so a party of one
    // (nobody recruited yet) simply shows nothing here.
    //
    // =========================================================================

    function Window_AIHCutinPartyStatus() {
        this.initialize.apply(this, arguments);
    }

    Window_AIHCutinPartyStatus.prototype =
        Object.create(Window_StatusBase.prototype);

    Window_AIHCutinPartyStatus.prototype.constructor =
        Window_AIHCutinPartyStatus;

    Window_AIHCutinPartyStatus.ENTRY_HEIGHT = 96;

    Window_AIHCutinPartyStatus.FACE_SIZE = 72;

    Window_AIHCutinPartyStatus.prototype.initialize = function(rect) {

        Window_StatusBase.prototype.initialize.call(this, rect);

        this.opacity = 200;

        this.refresh();
    };

    Window_AIHCutinPartyStatus.prototype.otherPartyMembers = function() {

        if (
            typeof $gameParty === "undefined" ||
            typeof AIH.Hero === "undefined" ||
            !AIH.Hero.actorId
        ) {

            return [];
        }

        return $gameParty.battleMembers().filter(function(actor) {

            return actor.actorId() !== AIH.Hero.actorId();
        });
    };

    Window_AIHCutinPartyStatus.prototype.refresh = function() {

        var members;
        var i;

        if (!this.contents) {
            return;
        }

        this.contents.clear();

        members =
            this.otherPartyMembers();

        for (
            i = 0;
            i < members.length;
            i++
        ) {

            this.drawMemberEntry(
                members[i],
                i
            );
        }
    };

    Window_AIHCutinPartyStatus.prototype.drawMemberEntry = function(actor, index) {

        var y;
        var faceSize;
        var textX;
        var textWidth;

        y =
            index *
            Window_AIHCutinPartyStatus.ENTRY_HEIGHT;

        faceSize =
            Window_AIHCutinPartyStatus.FACE_SIZE;

        textX =
            faceSize + 12;

        textWidth =
            this.contentsWidth() - textX;

        this.drawActorFace(
            actor,
            0,
            y,
            faceSize,
            faceSize
        );

        this.drawActorHp(
            actor,
            textX,
            y,
            textWidth
        );

        this.drawActorMp(
            actor,
            textX,
            y + this.lineHeight(),
            textWidth
        );

        this.drawActorIcons(
            actor,
            textX,
            y + this.lineHeight() * 2,
            textWidth
        );
    };

    // =========================================================================
    // DISPLAY - VIDEO (DOM overlay)
    // =========================================================================

    AIH.BattleCutins._videoElement = null;

    AIH.BattleCutins._createVideoOverlay = function(definition, onComplete) {

        var video;

        video =
            document.createElement("video");

        video.src =
            definition.path;

        video.autoplay = true;
        video.muted = false;
        video.playsInline = true;

        video.style.position = "absolute";
        video.style.zIndex = "500";
        video.style.backgroundColor = "black";
        video.style.pointerEvents = "none";

        video.addEventListener("ended", function() {

            AIH.BattleCutins._removeVideoOverlay();

            if (onComplete) {
                onComplete();
            }
        });

        video.addEventListener("error", function() {

            /*
             * A missing/broken placeholder asset should not hard-lock
             * battle - fail forward the same as a normal completion.
             */
            AIH.BattleCutins._removeVideoOverlay();

            if (onComplete) {
                onComplete();
            }
        });

        document.body.appendChild(video);

        AIH.BattleCutins._videoElement = video;

        AIH.BattleCutins._resizeVideoOverlay();
    };

    AIH.BattleCutins._resizeVideoOverlay = function() {

        var canvas;
        var rect;

        if (!AIH.BattleCutins._videoElement) {
            return;
        }

        canvas =
            document.getElementById("gameCanvas") ||
            (Graphics._canvas || Graphics._app.view);

        if (!canvas) {
            return;
        }

        rect =
            canvas.getBoundingClientRect();

        AIH.BattleCutins._videoElement.style.left = rect.left + "px";
        AIH.BattleCutins._videoElement.style.top = rect.top + "px";
        AIH.BattleCutins._videoElement.style.width = rect.width + "px";
        AIH.BattleCutins._videoElement.style.height = rect.height + "px";
    };

    AIH.BattleCutins._removeVideoOverlay = function() {

        if (!AIH.BattleCutins._videoElement) {
            return;
        }

        if (AIH.BattleCutins._videoElement.parentNode) {

            AIH.BattleCutins._videoElement.parentNode.removeChild(
                AIH.BattleCutins._videoElement
            );
        }

        AIH.BattleCutins._videoElement = null;
    };

    AIH.BattleCutins.skipActiveVideo = function() {

        if (!AIH.BattleCutins._videoElement) {
            return;
        }

        if (!AIH.BattleCutins._active) {
            return;
        }

        if (!AIH.BattleCutins._active.definition.skippable) {
            return;
        }

        AIH.BattleCutins._videoElement.currentTime =
            AIH.BattleCutins._videoElement.duration || 0;

        AIH.BattleCutins._videoElement.pause();

        AIH.BattleCutins._removeVideoOverlay();

        if (AIH.BattleCutins._activeOnComplete) {
            AIH.BattleCutins._activeOnComplete();
        }
    };

    // =========================================================================
    // QUEUE PUMP (called every frame from Spriteset_Battle.update below)
    // =========================================================================

    AIH.BattleCutins._number = function(value, fallback) {

        var result;

        result =
            Number(value);

        if (isNaN(result)) {
            return fallback;
        }

        return result;
    };

    AIH.BattleCutins._activeSprite = null;

    AIH.BattleCutins._activeOnComplete = null;

    AIH.BattleCutins.pump = function(spriteset) {

        var next;

        if (
            AIH.BattleCutins._active ||
            AIH.BattleCutins._queue.length === 0
        ) {

            return;
        }

        next =
            AIH.BattleCutins._queue.shift();

        AIH.BattleCutins._active = next;

        if (next.definition.type === "video") {

            AIH.BattleCutins._activeOnComplete =
                function() {

                    AIH.BattleCutins._active = null;
                    AIH.BattleCutins._activeOnComplete = null;
                };

            AIH.BattleCutins._createVideoOverlay(
                next.definition,
                AIH.BattleCutins._activeOnComplete
            );

        } else {

            AIH.BattleCutins._activeSprite =
                new Sprite_AIHCutin(
                    next.definition,
                    function() {

                        if (
                            spriteset &&
                            AIH.BattleCutins._activeSprite
                        ) {

                            spriteset.removeChild(
                                AIH.BattleCutins._activeSprite
                            );
                        }

                        AIH.BattleCutins._activeSprite = null;
                        AIH.BattleCutins._active = null;
                    }
                );

            if (spriteset) {

                spriteset.addChild(
                    AIH.BattleCutins._activeSprite
                );
            }
        }
    };

    AIH.BattleCutins.handleSkipInput = function() {

        if (!AIH.BattleCutins._active) {
            return;
        }

        if (
            typeof Input !== "undefined" &&
            Input.isTriggered("ok")
        ) {

            AIH.BattleCutins._trySkip();
        }

        if (
            typeof TouchInput !== "undefined" &&
            TouchInput.isTriggered()
        ) {

            AIH.BattleCutins._trySkip();
        }
    };

    AIH.BattleCutins._trySkip = function() {

        if (!AIH.BattleCutins._active) {
            return;
        }

        if (!AIH.BattleCutins._active.definition.skippable) {
            return;
        }

        if (AIH.BattleCutins._activeSprite) {

            AIH.BattleCutins._activeSprite.skip();

        } else if (AIH.BattleCutins._videoElement) {

            AIH.BattleCutins.skipActiveVideo();
        }
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.BattleCutins.initialize = function() {

        AIH.BattleCutins._initialized = true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Battle cut-in system initialized."
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
            "BattleCutins",
            {
                version:
                    AIH.BattleCutins.VERSION,

                initialize: function() {
                    AIH.BattleCutins.initialize();
                },

                isEnabled: function() {
                    return AIH.BattleCutins.isEnabled();
                },

                setEnabled: function(enabled) {
                    AIH.BattleCutins.setEnabled(enabled);
                }
            }
        );
    }

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_BattleCutins",
            "SetEnabled",
            function(args) {

                AIH.BattleCutins.setEnabled(
                    args.enabled === "true" || args.enabled === true
                );
            }
        );

        PluginManager.registerCommand(
            "AIH_BattleCutins",
            "TestCutIn",
            function(args) {

                AIH.BattleCutins.enqueue(args.key);
            }
        );
    }

    // =========================================================================
    // ENGINE HOOKS
    // =========================================================================

    /*
     * Notetags need $dataSkills/$dataStates loaded - Scene_Boot.start()
     * runs once, right after the database finishes loading, before any
     * scene that could reference them.
     */
    if (typeof Scene_Boot !== "undefined") {

        var _AIH_BattleCutins_SceneBoot_start =
            Scene_Boot.prototype.start;

        Scene_Boot.prototype.start = function() {

            _AIH_BattleCutins_SceneBoot_start.call(this);

            AIH.BattleCutins.parseAllNotetags();
        };
    }

    /*
     * One call per action use, not per target - see onActionUsed's own
     * comment for why this specific hook point (BattleManager.startAction,
     * called once per action before target resolution/animation) is the
     * right place rather than Game_Action.prototype.apply (called once
     * per target).
     */
    if (typeof BattleManager !== "undefined") {

        var _AIH_BattleCutins_BattleManager_startAction =
            BattleManager.startAction;

        BattleManager.startAction = function() {

            var action;

            action =
                this._subject ?
                    this._subject.currentAction() :
                    null;

            if (action) {

                AIH.BattleCutins.onActionUsed(action);
            }

            _AIH_BattleCutins_BattleManager_startAction.call(this);
        };

        var _AIH_BattleCutins_BattleManager_isBusy =
            BattleManager.isBusy;

        BattleManager.isBusy = function() {

            return (
                _AIH_BattleCutins_BattleManager_isBusy.call(this) ||
                AIH.BattleCutins.isBusy()
            );
        };
    }

    /*
     * Memoizes Game_Action.prototype.makeTargets per action use, so
     * onActionUsed's own call to it above and the engine's real targeting
     * call inside startAction return the IDENTICAL resolved array,
     * instead of two independent random rolls that could disagree. Reset
     * on Game_Action.prototype.clear (called whenever an action is set up
     * fresh for reuse), so a later use of the same action object
     * re-resolves normally rather than replaying a stale cached result.
     */
    if (typeof Game_Action !== "undefined") {

        var _AIH_BattleCutins_GameAction_makeTargets =
            Game_Action.prototype.makeTargets;

        Game_Action.prototype.makeTargets = function() {

            if (this._aihCachedTargets) {
                return this._aihCachedTargets;
            }

            this._aihCachedTargets =
                _AIH_BattleCutins_GameAction_makeTargets.call(this);

            return this._aihCachedTargets;
        };

        var _AIH_BattleCutins_GameAction_clear =
            Game_Action.prototype.clear;

        Game_Action.prototype.clear = function() {

            _AIH_BattleCutins_GameAction_clear.call(this);

            this._aihCachedTargets = null;
        };
    }

    /*
     * Game_Battler.addState (not addNewState directly) is where MZ
     * decides whether a state is genuinely new - wrapping it here lets
     * us piggyback on that same decision instead of re-deriving it.
     */
    if (typeof Game_Battler !== "undefined") {

        var _AIH_BattleCutins_GameBattler_addState =
            Game_Battler.prototype.addState;

        Game_Battler.prototype.addState = function(stateId) {

            var wasAffected;

            wasAffected =
                this.isStateAffected(stateId);

            _AIH_BattleCutins_GameBattler_addState.call(
                this,
                stateId
            );

            if (
                !wasAffected &&
                this.isStateAffected(stateId)
            ) {

                AIH.BattleCutins.onStateNewlyApplied(
                    this,
                    stateId
                );
            }
        };
    }

    /*
     * Spriteset_Battle is where an image cut-in sprite gets parented, and
     * its per-frame update is what pumps the queue and resizes the video
     * overlay (if any) to track the canvas.
     */
    if (typeof Spriteset_Battle !== "undefined") {

        var _AIH_BattleCutins_SpritesetBattle_update =
            Spriteset_Battle.prototype.update;

        Spriteset_Battle.prototype.update = function() {

            _AIH_BattleCutins_SpritesetBattle_update.call(this);

            AIH.BattleCutins.pump(this);
            AIH.BattleCutins.handleSkipInput();
            AIH.BattleCutins._resizeVideoOverlay();
        };
    }

    /*
     * Battle can end (victory/defeat/escape) while a video overlay is
     * still parented to the DOM - clean it up so it doesn't linger over
     * the map/menu afterward.
     */
    if (typeof Scene_Battle !== "undefined") {

        var _AIH_BattleCutins_SceneBattle_terminate =
            Scene_Battle.prototype.terminate;

        Scene_Battle.prototype.terminate = function() {

            AIH.BattleCutins._removeVideoOverlay();

            AIH.BattleCutins._queue = [];
            AIH.BattleCutins._active = null;
            AIH.BattleCutins._activeSprite = null;

            _AIH_BattleCutins_SceneBattle_terminate.call(this);
        };

        /*
         * The party-status window is created once per battle and simply
         * shown/hidden/refreshed alongside cut-in activity - it isn't
         * torn down and rebuilt each time, to avoid re-reading actor data
         * more than needed.
         */
        var _AIH_BattleCutins_SceneBattle_createAllWindows =
            Scene_Battle.prototype.createAllWindows;

        Scene_Battle.prototype.createAllWindows = function() {

            _AIH_BattleCutins_SceneBattle_createAllWindows.call(this);

            AIH.BattleCutins._createPartyStatusWindow(this);
        };

        var _AIH_BattleCutins_SceneBattle_update =
            Scene_Battle.prototype.update;

        Scene_Battle.prototype.update = function() {

            _AIH_BattleCutins_SceneBattle_update.call(this);

            AIH.BattleCutins._updatePartyStatusWindow();
        };
    }

    AIH.BattleCutins._partyStatusWindow = null;

    AIH.BattleCutins._createPartyStatusWindow = function(scene) {

        var rect;
        var memberCount;

        if (typeof Window_StatusBase === "undefined") {
            return;
        }

        memberCount =
            typeof $gameParty !== "undefined" ?
                Math.max(0, $gameParty.battleMembers().length - 1) :
                0;

        rect = new Rectangle(
            0,
            0,
            320,
            Math.max(
                1,
                memberCount
            ) *
            Window_AIHCutinPartyStatus.ENTRY_HEIGHT +
            16
        );

        AIH.BattleCutins._partyStatusWindow =
            new Window_AIHCutinPartyStatus(rect);

        AIH.BattleCutins._partyStatusWindow.visible = false;

        scene.addWindow(
            AIH.BattleCutins._partyStatusWindow
        );
    };

    AIH.BattleCutins._updatePartyStatusWindow = function() {

        var win;
        var shouldShow;

        win =
            AIH.BattleCutins._partyStatusWindow;

        if (!win) {
            return;
        }

        shouldShow =
            AIH.BattleCutins.isBusy() &&
            win.otherPartyMembers().length > 0;

        if (
            shouldShow &&
            !win.visible
        ) {

            win.refresh();
        }

        win.visible =
            shouldShow;
    };

    // =========================================================================
    // MASTER ON/OFF SWITCH (player-facing, persisted)
    // =========================================================================
    //
    // Per explicit direction: kept alongside (not instead of) the
    // per-cut-in skippable flag - this is a completely separate axis
    // (whether cut-ins happen at all vs. whether a given one can be
    // dismissed early). Exposed as a real Options-menu entry, saved via
    // ConfigManager the same way BGM volume or "Always Dash" are, so a
    // player's choice persists across sessions. The SetEnabled plugin
    // command (see PLUGIN COMMANDS above) still works too, for
    // event-driven/story-forced cases - both read and write the same
    // underlying _systemEnabled flag, so they can't drift out of sync
    // with each other.
    //
    // =========================================================================

    AIH.BattleCutins.OPTIONS_SYMBOL = "aihCutinsEnabled";

    if (typeof ConfigManager !== "undefined") {

        var _AIH_BattleCutins_ConfigManager_makeData =
            ConfigManager.makeData;

        ConfigManager.makeData = function() {

            var config;

            config =
                _AIH_BattleCutins_ConfigManager_makeData.call(this);

            config[AIH.BattleCutins.OPTIONS_SYMBOL] =
                AIH.BattleCutins.isEnabled();

            return config;
        };

        var _AIH_BattleCutins_ConfigManager_applyData =
            ConfigManager.applyData;

        ConfigManager.applyData = function(config) {

            _AIH_BattleCutins_ConfigManager_applyData.call(
                this,
                config
            );

            AIH.BattleCutins.setEnabled(
                config[AIH.BattleCutins.OPTIONS_SYMBOL] === undefined ?
                    true :
                    !!config[AIH.BattleCutins.OPTIONS_SYMBOL]
            );
        };
    }

    if (typeof Window_Options !== "undefined") {

        var _AIH_BattleCutins_WindowOptions_addGeneralOptions =
            Window_Options.prototype.addGeneralOptions;

        Window_Options.prototype.addGeneralOptions = function() {

            _AIH_BattleCutins_WindowOptions_addGeneralOptions.call(this);

            this.addCommand(
                "Battle Cut-Ins",
                AIH.BattleCutins.OPTIONS_SYMBOL
            );
        };

        var _AIH_BattleCutins_WindowOptions_getConfigValue =
            Window_Options.prototype.getConfigValue;

        Window_Options.prototype.getConfigValue = function(symbol) {

            if (symbol === AIH.BattleCutins.OPTIONS_SYMBOL) {

                return AIH.BattleCutins.isEnabled();
            }

            return _AIH_BattleCutins_WindowOptions_getConfigValue.call(
                this,
                symbol
            );
        };

        var _AIH_BattleCutins_WindowOptions_setConfigValue =
            Window_Options.prototype.setConfigValue;

        Window_Options.prototype.setConfigValue = function(symbol, volume) {

            if (symbol === AIH.BattleCutins.OPTIONS_SYMBOL) {

                AIH.BattleCutins.setEnabled(volume);
                return;
            }

            _AIH_BattleCutins_WindowOptions_setConfigValue.call(
                this,
                symbol,
                volume
            );
        };
    }

})();