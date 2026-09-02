/*:
 * @plugindesc AI Hero Framework - Standing Character Display v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - STANDING CHARACTER DISPLAY
 * ============================================================================
 *
 * Shared, framework-level infrastructure - NOT tied to one minigame. Every
 * minigame that shows the heroine (Bathhouse's outfit/expression needs,
 * tastetest's OUTFITS/EXPRESSIONS/resolveMediaAsset placeholder system,
 * Milkmaid's uniform/reactions) can hand this module an outfit key, an
 * expression key, and a set of status effects, and get a composited
 * standing sprite back - rather than each minigame building its own art
 * pipeline.
 *
 * This module owns NO psychology and makes NO decisions - same rule as
 * every other file in this project. It only renders whatever it's told
 * to render. A minigame's own logic (already going through
 * PressureEvaluator/PersonalityDrift as normal) decides which outfit/
 * expression/status effect applies; this module just displays it.
 *
 * ============================================================================
 *
 * NO ART ASSETS EXIST YET
 *
 * Every visual here is a procedurally-generated PLACEHOLDER bitmap
 * (colored silhouette + label text), not real art - same honest
 * placeholder approach tastetest's resolveMediaAsset already used for
 * its own path-naming convention, except this module actually renders
 * something so it's visually testable in-engine right now, not just a
 * path string.
 *
 * Swapping in real art later needs no changes to any calling minigame's
 * code: set AIH.CharacterDisplay.USE_PLACEHOLDERS = false and populate
 * IMAGE_FOLDER with files matching each definition's `imageName`. Until
 * then, everything renders as a labeled placeholder shape.
 *
 * ============================================================================
 *
 * LAYERS (back to front)
 *
 *     1. body/outfit   - full standing silhouette, swapped by setOutfit()
 *     2. expression     - a small face overlay near the top, swapped by
 *                        setExpression()
 *     3. status effects - zero or more STACKED overlays (she can be both
 *                        wet AND blushing at once), added/removed
 *                        independently via addStatusEffect()/
 *                        removeStatusEffect()
 *
 * Status effects can be PERSISTENT (stay until explicitly removed - e.g.
 * "dirty" from a farm shift) or TRANSIENT (auto-clear after N frames -
 * e.g. a slime hit that fades after a few seconds), via the optional
 * `durationFrames` option or a definition's own `defaultDurationFrames`.
 *
 * triggerImpact() is a separate, composable reaction (a brief shake) -
 * callers combine it with a status effect for a "hit" moment (see the
 * preview scene's "Slime Hit" command for the canonical example), but
 * neither requires the other.
 *
 * ============================================================================
 *
 * USAGE FROM A MINIGAME
 *
 *     var sprite = AIH.CharacterDisplay.createSprite();
 *     sprite.setOutfit("milkmaid_uniform");
 *     sprite.setExpression("embarrassed");
 *     sprite.setBasePosition(400, 200);
 *     someScene.addChild(sprite);
 *
 *     // later, in response to something that happened in play:
 *     sprite.addStatusEffect("slimed", { durationFrames: 180 });
 *     sprite.triggerImpact();
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.CharacterDisplay = AIH.CharacterDisplay || {};
    AIH.CharacterDisplay.VERSION = "0.1.0";

    /*
     * Flip to false once real art exists at IMAGE_FOLDER and every
     * definition below has a matching imageName - no calling code needs
     * to change either way.
     */
    AIH.CharacterDisplay.USE_PLACEHOLDERS = true;
    AIH.CharacterDisplay.IMAGE_FOLDER = "img/pictures/aih_character/";

    // =========================================================================
    // DATA - OUTFITS / EXPRESSIONS / STATUS EFFECTS
    // =========================================================================
    //
    // All data-driven, per the project's own core rule - adding a new
    // outfit/expression/status effect means adding a table row, not
    // writing new rendering code. `label` is shown on the placeholder
    // until real art exists; `imageName` is the file this layer will
    // load once USE_PLACEHOLDERS is false.
    //
    // =========================================================================

    AIH.CharacterDisplay.OUTFITS = {

        adventurer_default: {
            label: "Adventurer's Gear",
            imageName: "outfit_adventurer_default",
            placeholderColor: "#4a4a4a"
        },
        regular_clothes: {
            label: "Regular Clothes",
            imageName: "outfit_regular_clothes",
            placeholderColor: "#454f57"
        },
        milkmaid_uniform: {
            label: "Farm Uniform",
            imageName: "outfit_milkmaid_uniform",
            placeholderColor: "#55603f"
        },
        bathhouse_towel: {
            label: "Bathhouse Towel",
            imageName: "outfit_bathhouse_towel",
            placeholderColor: "#5f574a"
        },
        tribal_garb: {
            label: "Tribal Garb",
            imageName: "outfit_tribal_garb",
            placeholderColor: "#5a4535"
        }
    };

    AIH.CharacterDisplay.EXPRESSIONS = {

        neutral:     { label: "Neutral",     placeholderColor: "#6a6a6a" },
        pleased:     { label: "Pleased",     placeholderColor: "#5f8a6a" },
        reluctant:   { label: "Reluctant",   placeholderColor: "#8a7f5f" },
        rejecting:   { label: "Rejecting",   placeholderColor: "#8a5f5f" },
        embarrassed: { label: "Embarrassed", placeholderColor: "#8a6a7a" },
        proud:       { label: "Proud",       placeholderColor: "#7a7a5f" },
        angry:       { label: "Angry",       placeholderColor: "#8a4f4f" },
        ashamed:     { label: "Ashamed",     placeholderColor: "#6a5a6a" },
        determined:  { label: "Determined",  placeholderColor: "#5f6a8a" },
        startled:    { label: "Startled",    placeholderColor: "#8a8a5f" },
        dazed:       { label: "Dazed",       placeholderColor: "#7a6a8a" }
    };

    /*
     * overlayOpacity: how opaque the placeholder blobs render (real art
     * would just be a translucent PNG at whatever the artist intends).
     * defaultDurationFrames: null = persistent until removeStatusEffect()
     * is called; a number = auto-clears after that many frames unless
     * overridden per-call via addStatusEffect(key, {durationFrames}).
     */
    AIH.CharacterDisplay.STATUS_EFFECTS = {

        /*
         * `stages` is optional - an effect with no stages behaves exactly
         * as before (a single visual, `stage` argument ignored). An
         * effect WITH stages uses its base fields as fallback defaults
         * and each stage entry overrides only what escalates (usually
         * color/opacity/blobCount/label) - see
         * AIH.CharacterDisplay._resolveStageDef.
         */

        slimed: {
            label: "Slimed",
            color: "#5fae6f",
            overlayOpacity: 0.55,
            blobCount: 6,
            defaultDurationFrames: null,
            stages: [
                { label: "Slimed (light)",    color: "#6fbf7a", overlayOpacity: 0.28, blobCount: 3 },
                { label: "Slimed (moderate)", color: "#5fae6f", overlayOpacity: 0.50, blobCount: 6 },
                { label: "Slimed (soaked)",   color: "#4a9a5a", overlayOpacity: 0.72, blobCount: 10 }
            ]
        },
        wet: {
            label: "Soaked",
            color: "#5f8fae",
            overlayOpacity: 0.40,
            blobCount: 5,
            defaultDurationFrames: null
        },
        dirty: {
            label: "Dirty",
            color: "#6e5a3f",
            overlayOpacity: 0.45,
            blobCount: 5,
            defaultDurationFrames: null
        },
        milk_stained: {
            label: "Milk-Stained",
            color: "#d8d8c0",
            overlayOpacity: 0.50,
            blobCount: 4,
            defaultDurationFrames: null,
            stages: [
                { label: "Milk-Stained (spots)", color: "#e0e0cc", overlayOpacity: 0.26, blobCount: 2 },
                { label: "Milk-Stained (damp)",  color: "#d8d8c0", overlayOpacity: 0.48, blobCount: 4 },
                { label: "Milk-Stained (soaked)",color: "#cfcfb0", overlayOpacity: 0.68, blobCount: 8 }
            ]
        },
        blushing: {
            label: "Blushing",
            color: "#c97a94",
            overlayOpacity: 0.35,
            blobCount: 2,
            defaultDurationFrames: null,
            stages: [
                { label: "Slight Blush",  color: "#c97a94", overlayOpacity: 0.20, blobCount: 1 },
                { label: "Heavy Blush",   color: "#c15f80", overlayOpacity: 0.42, blobCount: 2 },
                { label: "Overwhelmed",   color: "#b8496e", overlayOpacity: 0.58, blobCount: 3 }
            ]
        },
        bruised: {
            label: "Bruised",
            color: "#7a5f8a",
            overlayOpacity: 0.40,
            blobCount: 3,
            defaultDurationFrames: null
        },
        dazed_stars: {
            label: "Dazed",
            color: "#d8c85f",
            overlayOpacity: 0.30,
            blobCount: 3,
            defaultDurationFrames: 90
        },
        bound: {
            label: "Bound",
            color: "#8a7355",
            overlayOpacity: 0.45,
            blobCount: 3,
            defaultDurationFrames: null,
            stages: [
                { label: "Bound (wrists, front)",           color: "#9c8468", overlayOpacity: 0.30, blobCount: 2 },
                { label: "Bound (wrists behind back)",      color: "#8a7355", overlayOpacity: 0.48, blobCount: 3 },
                { label: "Bound (wrists + ankles)",         color: "#6f5a42", overlayOpacity: 0.62, blobCount: 5 }
            ]
        }
    };

    AIH.CharacterDisplay.MAX_STAGE = 3;

    /*
     * Merges a status effect's base definition with a stage override
     * (1-indexed). No stages on the base def, or no stage argument -> the
     * base def is returned unchanged (fully backward compatible with
     * effects that never escalate). Out-of-range stages clamp into
     * range rather than erroring.
     */
    AIH.CharacterDisplay._resolveStageDef = function(baseDef, stage) {

        if (!baseDef) {
            return null;
        }

        if (
            !baseDef.stages ||
            !baseDef.stages.length ||
            !stage
        ) {

            return baseDef;
        }

        var idx =
            Math.max(
                1,
                Math.min(baseDef.stages.length, stage)
            ) - 1;

        var override = baseDef.stages[idx] || {};

        return {

            label: override.label || baseDef.label,
            imageName: override.imageName || baseDef.imageName,
            color: override.color || baseDef.color,

            overlayOpacity:
                override.overlayOpacity !== undefined ?
                    override.overlayOpacity :
                    baseDef.overlayOpacity,

            blobCount:
                override.blobCount !== undefined ?
                    override.blobCount :
                    baseDef.blobCount,

            defaultDurationFrames: baseDef.defaultDurationFrames
        };
    };

    // =========================================================================
    // PLACEHOLDER GEOMETRY
    // =========================================================================

    AIH.CharacterDisplay.BODY_WIDTH = 220;
    AIH.CharacterDisplay.BODY_HEIGHT = 400;
    AIH.CharacterDisplay.EXPRESSION_SIZE = 96;
    AIH.CharacterDisplay.EXPRESSION_OFFSET_X =
        Math.round((AIH.CharacterDisplay.BODY_WIDTH - AIH.CharacterDisplay.EXPRESSION_SIZE) / 2);
    AIH.CharacterDisplay.EXPRESSION_OFFSET_Y = 14;

    // =========================================================================
    // PLACEHOLDER BITMAP BUILDERS
    // =========================================================================
    //
    // Uses Bitmap.drawCircle (RPG Maker MZ core - not present in MV) and
    // Bitmap.fillRect/drawText, all documented core Bitmap methods.
    // Border is faked via two nested fillRects rather than assuming a
    // strokeRect method exists.
    //
    // =========================================================================

    AIH.CharacterDisplay._buildBodyPlaceholder = function(def) {

        var w = AIH.CharacterDisplay.BODY_WIDTH;
        var h = AIH.CharacterDisplay.BODY_HEIGHT;
        var bmp = new Bitmap(w, h);

        bmp.fillRect(0, 0, w, h, "#242424");
        bmp.fillRect(3, 3, w - 6, h - 6, (def && def.placeholderColor) || "#4a4a4a");

        // a simple head/shoulders silhouette hint, nothing more
        bmp.drawCircle(w / 2, 66, 46, "#2f2f2f");
        bmp.fillRect(w / 2 - 58, 108, 116, h - 148, "#2f2f2f");

        bmp.textColor = "#e6e6e6";
        bmp.fontSize = 15;
        bmp.drawText((def && def.label) || "", 4, h - 30, w - 8, 24, "center");

        return bmp;
    };

    AIH.CharacterDisplay._buildExpressionPlaceholder = function(def) {

        var size = AIH.CharacterDisplay.EXPRESSION_SIZE;
        var bmp = new Bitmap(size, size);

        bmp.drawCircle(size / 2, size / 2 - 6, size / 2 - 6, (def && def.placeholderColor) || "#5a5a5a");

        bmp.textColor = "#141414";
        bmp.fontSize = 12;
        bmp.drawText((def && def.label) || "", 0, size - 18, size, 16, "center");

        return bmp;
    };

    AIH.CharacterDisplay._buildStatusPlaceholder = function(def) {

        var w = AIH.CharacterDisplay.BODY_WIDTH;
        var h = AIH.CharacterDisplay.BODY_HEIGHT;
        var bmp = new Bitmap(w, h);
        var blobs = (def && def.blobCount) || 4;
        var color = (def && def.color) || "#5fae6f";
        var i, bx, by, r;

        bmp.paintOpacity = Math.round(((def && def.overlayOpacity) || 0.4) * 255);

        for (i = 0; i < blobs; i++) {

            bx = 24 + Math.random() * (w - 48);
            by = 90 + Math.random() * (h - 170);
            r = 18 + Math.random() * 26;

            bmp.drawCircle(bx, by, r, color);
        }

        bmp.paintOpacity = 255;
        bmp.textColor = "#141414";
        bmp.fontSize = 12;
        bmp.drawText((def && def.label) || "", 4, 4, w - 8, 18, "left");

        return bmp;
    };

    // =========================================================================
    // REAL-ART LOADING (used only once USE_PLACEHOLDERS is false)
    // =========================================================================

    AIH.CharacterDisplay._loadRealImage = function(imageName) {

        if (
            typeof ImageManager === "undefined" ||
            !ImageManager.loadBitmap
        ) {

            return null;
        }

        return ImageManager.loadBitmap(
            AIH.CharacterDisplay.IMAGE_FOLDER,
            imageName
        );
    };

    AIH.CharacterDisplay._resolveLayerBitmap = function(def, placeholderBuilder) {

        if (!AIH.CharacterDisplay.USE_PLACEHOLDERS && def && def.imageName) {

            var real = AIH.CharacterDisplay._loadRealImage(def.imageName);

            if (real) {
                return real;
            }
        }

        return placeholderBuilder(def);
    };

    // =========================================================================
    // Sprite_AIHCharacter - the composited standing sprite
    // =========================================================================

    function Sprite_AIHCharacter() {
        this.initialize.apply(this, arguments);
    }

    Sprite_AIHCharacter.prototype = Object.create(Sprite.prototype);
    Sprite_AIHCharacter.prototype.constructor = Sprite_AIHCharacter;

    Sprite_AIHCharacter.prototype.initialize = function() {

        Sprite.prototype.initialize.call(this);

        this._outfitKey = null;
        this._expressionKey = null;
        this._statusSprites = {};
        this._statusTimers = {};
        this._statusStages = {};

        this._baseX = 0;
        this._baseY = 0;
        this._impactFrames = 0;
        this._impactMagnitude = 0;

        this._createLayers();
    };

    Sprite_AIHCharacter.prototype._createLayers = function() {

        this._bodySprite = new Sprite();
        this.addChild(this._bodySprite);

        this._expressionSprite = new Sprite();
        this._expressionSprite.x = AIH.CharacterDisplay.EXPRESSION_OFFSET_X;
        this._expressionSprite.y = AIH.CharacterDisplay.EXPRESSION_OFFSET_Y;
        this.addChild(this._expressionSprite);
    };

    Sprite_AIHCharacter.prototype.setBasePosition = function(x, y) {
        this._baseX = x;
        this._baseY = y;
        this.x = x;
        this.y = y;
    };

    // --- outfit -----------------------------------------------------------

    Sprite_AIHCharacter.prototype.setOutfit = function(key) {

        var def = AIH.CharacterDisplay.OUTFITS[key];

        if (!def) {
            return false;
        }

        this._outfitKey = key;

        this._bodySprite.bitmap =
            AIH.CharacterDisplay._resolveLayerBitmap(
                def,
                AIH.CharacterDisplay._buildBodyPlaceholder
            );

        return true;
    };

    Sprite_AIHCharacter.prototype.currentOutfit = function() {
        return this._outfitKey;
    };

    // --- expression ---------------------------------------------------------

    Sprite_AIHCharacter.prototype.setExpression = function(key) {

        var def = AIH.CharacterDisplay.EXPRESSIONS[key];

        if (!def) {
            return false;
        }

        this._expressionKey = key;

        this._expressionSprite.bitmap =
            AIH.CharacterDisplay._resolveLayerBitmap(
                def,
                AIH.CharacterDisplay._buildExpressionPlaceholder
            );

        return true;
    };

    Sprite_AIHCharacter.prototype.currentExpression = function() {
        return this._expressionKey;
    };

    // --- status effects (stackable) -----------------------------------------

    Sprite_AIHCharacter.prototype.addStatusEffect = function(key, options) {

        var def = AIH.CharacterDisplay.STATUS_EFFECTS[key];

        if (!def) {
            return false;
        }

        options = options || {};

        /*
         * A stage is only meaningful for effects with a `stages` table -
         * for anything else, `stage` is always stored as null regardless
         * of what was requested, so getStatusEffectStage() stays honest
         * about which effects actually have severity levels at all.
         *
         * If no stage was passed explicitly, keep whatever stage was
         * already active (so e.g. re-adding a duration to an
         * already-staged effect doesn't silently reset its severity back
         * to 1), and only default to stage 1 for a fresh, stage-capable
         * effect. Whatever stage is requested, it's clamped into range
         * here (not just when resolving the bitmap) so the STORED value
         * always matches what actually rendered - out-of-range requests
         * clamp rather than silently disagreeing with the visual.
         */
        var requestedStage =
            options.stage !== undefined ?
                options.stage :
                (
                    this._statusStages[key] !== undefined ?
                        this._statusStages[key] :
                        (def.stages ? 1 : null)
                );

        var stage = null;

        if (
            def.stages &&
            def.stages.length &&
            requestedStage
        ) {

            stage =
                Math.max(
                    1,
                    Math.min(def.stages.length, requestedStage)
                );
        }

        var resolvedDef =
            AIH.CharacterDisplay._resolveStageDef(def, stage);

        var sprite = this._statusSprites[key];

        if (!sprite) {
            sprite = new Sprite();
            this._statusSprites[key] = sprite;
            this.addChild(sprite);
        }

        sprite.bitmap =
            AIH.CharacterDisplay._resolveLayerBitmap(
                resolvedDef,
                AIH.CharacterDisplay._buildStatusPlaceholder
            );

        this._statusStages[key] = stage;

        var duration =
            options.durationFrames !== undefined ?
                options.durationFrames :
                def.defaultDurationFrames;

        if (duration) {
            this._statusTimers[key] = duration;
        } else {
            delete this._statusTimers[key];
        }

        return true;
    };

    /*
     * Escalate/de-escalate an already-tracked (or fresh) status effect to
     * a specific stage. Thin wrapper over addStatusEffect so both paths
     * share one rebuild routine - stays independent of any active
     * duration timer unless durationFrames is explicitly passed too.
     */
    Sprite_AIHCharacter.prototype.setStatusEffectStage = function(key, stage, options) {

        options = options || {};
        options.stage = stage;

        return this.addStatusEffect(key, options);
    };

    Sprite_AIHCharacter.prototype.getStatusEffectStage = function(key) {

        return this._statusStages[key] !== undefined ?
            this._statusStages[key] :
            null;
    };

    Sprite_AIHCharacter.prototype.removeStatusEffect = function(key) {

        var sprite = this._statusSprites[key];

        if (sprite) {
            this.removeChild(sprite);
            delete this._statusSprites[key];
        }

        delete this._statusTimers[key];
        delete this._statusStages[key];
    };

    Sprite_AIHCharacter.prototype.hasStatusEffect = function(key) {
        return !!this._statusSprites[key];
    };

    Sprite_AIHCharacter.prototype.activeStatusEffects = function() {
        return Object.keys(this._statusSprites);
    };

    Sprite_AIHCharacter.prototype.clearStatusEffects = function() {

        var self = this;

        Object.keys(this._statusSprites).forEach(function(key) {
            self.removeStatusEffect(key);
        });
    };

    // --- impact reaction (composable with, but independent of, status effects) --

    Sprite_AIHCharacter.prototype.triggerImpact = function(options) {

        options = options || {};

        this._impactFrames = options.frames || 18;
        this._impactMagnitude = options.magnitude || 6;
    };

    Sprite_AIHCharacter.prototype.isImpactPlaying = function() {
        return this._impactFrames > 0;
    };

    // --- per-frame update -----------------------------------------------

    Sprite_AIHCharacter.prototype.update = function() {

        Sprite.prototype.update.call(this);

        this._updateStatusTimers();
        this._updateImpact();
    };

    Sprite_AIHCharacter.prototype._updateStatusTimers = function() {

        var self = this;
        var keys = Object.keys(this._statusTimers);

        keys.forEach(function(key) {

            self._statusTimers[key] -= 1;

            if (self._statusTimers[key] <= 0) {
                self.removeStatusEffect(key);
            }
        });
    };

    Sprite_AIHCharacter.prototype._updateImpact = function() {

        if (this._impactFrames <= 0) {
            return;
        }

        this._impactFrames -= 1;

        if (this._impactFrames <= 0) {

            this.x = this._baseX;
            this.y = this._baseY;
            return;
        }

        var m =
            this._impactMagnitude *
            (this._impactFrames / 18);

        this.x = this._baseX + ((Math.random() * 2 - 1) * m);
        this.y = this._baseY + ((Math.random() * 2 - 1) * m);
    };

    Sprite_AIHCharacter.prototype.destroySprite = function() {

        this.clearStatusEffects();
        this.removeChild(this._bodySprite);
        this.removeChild(this._expressionSprite);
    };

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    AIH.CharacterDisplay.Sprite_AIHCharacter = Sprite_AIHCharacter;

    AIH.CharacterDisplay.createSprite = function() {
        return new Sprite_AIHCharacter();
    };

    /*
     * Convenience singleton - most callers just want "the" standing
     * heroine sprite and don't need to manage multiple instances.
     * Nothing prevents createSprite() for a second independent one if a
     * minigame genuinely needs it (e.g. showing two states side by side
     * in a comparison).
     */
    AIH.CharacterDisplay._activeSprite = null;

    AIH.CharacterDisplay.getActiveSprite = function() {

        if (!AIH.CharacterDisplay._activeSprite) {
            AIH.CharacterDisplay._activeSprite = new Sprite_AIHCharacter();
        }

        return AIH.CharacterDisplay._activeSprite;
    };

    AIH.CharacterDisplay.releaseActiveSprite = function() {

        if (AIH.CharacterDisplay._activeSprite) {
            AIH.CharacterDisplay._activeSprite.destroySprite();
        }

        AIH.CharacterDisplay._activeSprite = null;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register("CharacterDisplay", {
            version: AIH.CharacterDisplay.VERSION,
            initialize: function() {}
        });
    }

})();