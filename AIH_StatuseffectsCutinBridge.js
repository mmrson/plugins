/*:
 * @plugindesc AI Hero Framework - Status Effect / Cut-In Bridge v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - STATUS EFFECT / CUT-IN BRIDGE
 * ============================================================================
 *
 * Connects three modules that otherwise don't know about each other:
 * AIH_BattleCutins.js (battle visuals), AIH_StatusEffectCatalog.js
 * (what a status stage means), and AIH_CharacterDisplay.js (her standing
 * portrait). Requires all three loaded first, plus AIH_Emotions.js
 * (loaded transitively by AIH_StatusEffectCatalog.js's own needs).
 *
 * TWO SEPARATE THINGS THIS FILE DOES
 *
 * 1. STATE -> CATALOG SYNC
 *
 *    <StatusEffectStage:key:stage> on a $dataStates entry (e.g.
 *    <StatusEffectStage:slimed:2> on a "Slimed II" state) - when that
 *    state is newly applied to the heroine, calls
 *    AIH.StatusEffectCatalog.applyStage(key, stage) automatically. This
 *    piggybacks on AIH.BattleCutins.onStateNewlyApplied by WRAPPING it
 *    rather than adding a second Game_Battler.addState hook of its own -
 *    that function already gets "is this genuinely new, not a refresh"
 *    exactly right, so there's no reason to re-derive it here.
 *
 *    Optional <StatusEffectDuration:frames> on the same state overrides
 *    how long the effect lasts before auto-clearing (falls back to the
 *    effect's own defaultDurationFrames from the catalog if omitted -
 *    for slimed/milk_stained/blushing that's null, i.e. persistent until
 *    something removes the state).
 *
 * 2. RESTRAINED / STRUGGLE
 *
 *    <Restrains> on a state (e.g. a "Bind" state) marks it as physically
 *    restraining - while any such state is active on the heroine, her
 *    actor command window shows a single "Struggle" command instead of
 *    the normal attack/skill/guard/item list. Selecting it resolves an
 *    escape check immediately (no target needed - same turn-cost shape
 *    as Guard) and enqueues a cut-in for the outcome via
 *    <StruggleSuccessCutIn:key> / <StruggleFailCutIn:key> on the SAME
 *    restraining state, if present.
 *
 *    The escape chance is AIH.RestrainedStruggle.BASE_ESCAPE_CHANCE,
 *    modified by summing `restraintModifier` (see
 *    AIH_StatusEffectCatalog.js) across every one of her currently
 *    active battle states that carries a <StatusEffectStage:...> tag -
 *    e.g. a stacked Slimed III state makes struggling free of a Bind
 *    noticeably harder, automatically, from data already defined for a
 *    completely different purpose (the emotion/visual effects), not a
 *    second copy of the same numbers.
 *
 *    This reads real battle state data (battler.states()) rather than
 *    anything tracked on a CharacterDisplay sprite, on purpose - the
 *    escape roll needs to work correctly even if no standing portrait
 *    happens to be instantiated during battle.
 *
 * ============================================================================
 *
 * A NOTE ON WHY escape resolution NEVER TOUCHES PersonalityDrift
 *
 * Same rule as the rest of the project: struggling against a restraint
 * is a mechanical battle roll, not an evaluated boundary decision. It
 * doesn't call AIH.PressureEvaluator or AIH.PersonalityDrift. If a
 * design later wants HOW she reacts to being restrained (not just
 * whether the roll succeeds) to be a real psychology-driven choice,
 * that's a PressureEvaluator situation for whoever builds that feature
 * to construct properly - this bridge deliberately stays out of that
 * decision and only resolves the mechanical outcome.
 *
 * ============================================================================
 *
 * PERFORMANCE NOTE
 *
 * Everything in section 2 above runs on discrete events (a state
 * getting applied, a command being selected) - never per-frame. The
 * only per-frame cost anywhere in this bridge is nonexistent; the
 * party-status-window refresh-rate concern this was built alongside
 * lives in AIH_BattleCutins.js itself (see its
 * PARTY_STATUS_REFRESH_INTERVAL), not here.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.StatusEffectCutinBridge = AIH.StatusEffectCutinBridge || {};
    AIH.StatusEffectCutinBridge.VERSION = "0.1.0";

    AIH.RestrainedStruggle = AIH.RestrainedStruggle || {};
    AIH.RestrainedStruggle.VERSION = "0.1.0";

    // =========================================================================
    // NOTETAG PARSING (same once-at-boot, cache-on-the-data-entry pattern
    // AIH_BattleCutins.js already uses)
    // =========================================================================

    AIH.StatusEffectCutinBridge._extractNotetag = function(note, tagName) {

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

    AIH.StatusEffectCutinBridge._extractStageTag = function(note) {

        var match;

        if (!note) {
            return null;
        }

        match =
            note.match(
                /<StatusEffectStage:\s*([a-zA-Z_]+)\s*:\s*(\d+)\s*>/i
            );

        if (!match) {
            return null;
        }

        return {
            key: match[1],
            stage: Number(match[2])
        };
    };

    AIH.StatusEffectCutinBridge.parseAllNotetags = function() {

        var i;
        var state;
        var durationRaw;

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

            state._aihStatusEffectStageTag =
                AIH.StatusEffectCutinBridge._extractStageTag(
                    state.note
                );

            durationRaw =
                AIH.StatusEffectCutinBridge._extractNotetag(
                    state.note,
                    "StatusEffectDuration"
                );

            state._aihStatusEffectDurationTag =
                durationRaw !== null ?
                    Number(durationRaw) :
                    null;

            state._aihRestrains =
                /<Restrains>/i.test(state.note || "");

            state._aihStruggleSuccessCutIn =
                AIH.StatusEffectCutinBridge._extractNotetag(
                    state.note,
                    "StruggleSuccessCutIn"
                );

            state._aihStruggleFailCutIn =
                AIH.StatusEffectCutinBridge._extractNotetag(
                    state.note,
                    "StruggleFailCutIn"
                );
        }
    };

    if (typeof Scene_Boot !== "undefined") {

        var _AIH_Bridge_SceneBoot_start =
            Scene_Boot.prototype.start;

        Scene_Boot.prototype.start = function() {

            _AIH_Bridge_SceneBoot_start.call(this);

            AIH.StatusEffectCutinBridge.parseAllNotetags();
        };
    }

    // =========================================================================
    // 1. STATE -> CATALOG SYNC
    // =========================================================================

    AIH.StatusEffectCutinBridge._onStateNewlyApplied = function(battler, stateId) {

        var state;
        var tag;

        if (
            typeof AIH.BattleCutins === "undefined" ||
            !AIH.BattleCutins._isHeroine(battler)
        ) {

            return;
        }

        state =
            $dataStates[stateId];

        if (!state) {
            return;
        }

        tag =
            state._aihStatusEffectStageTag;

        if (!tag) {
            return;
        }

        if (
            typeof AIH.StatusEffectCatalog === "undefined" ||
            !AIH.StatusEffectCatalog.applyStage
        ) {

            return;
        }

        AIH.StatusEffectCatalog.applyStage(
            tag.key,
            tag.stage,
            {
                durationFrames:
                    state._aihStatusEffectDurationTag !== null ?
                        state._aihStatusEffectDurationTag :
                        undefined
            }
        );
    };

    /*
     * Manual entry point for non-battle callers (an event applying a
     * state outside combat, etc.) that still want the sync to run.
     */
    AIH.StatusEffectCutinBridge.applyFromStateId = function(battler, stateId) {

        AIH.StatusEffectCutinBridge._onStateNewlyApplied(
            battler,
            stateId
        );
    };

    /*
     * Wraps AIH.BattleCutins.onStateNewlyApplied rather than adding a
     * second Game_Battler.addState hook - reuses its already-correct
     * "genuinely new" gating instead of re-deriving it, and guarantees
     * this always fires strictly after BattleCutins' own cut-in check
     * for the same state, in case a future definition wants the visual/
     * emotion sync to be able to see that a cut-in was just queued.
     */
    if (
        typeof AIH.BattleCutins !== "undefined" &&
        AIH.BattleCutins.onStateNewlyApplied
    ) {

        var _AIH_Bridge_BattleCutins_onStateNewlyApplied =
            AIH.BattleCutins.onStateNewlyApplied;

        AIH.BattleCutins.onStateNewlyApplied = function(battler, stateId) {

            _AIH_Bridge_BattleCutins_onStateNewlyApplied.call(
                AIH.BattleCutins,
                battler,
                stateId
            );

            AIH.StatusEffectCutinBridge._onStateNewlyApplied(
                battler,
                stateId
            );
        };
    }

    // =========================================================================
    // 2. RESTRAINED / STRUGGLE
    // =========================================================================

    AIH.RestrainedStruggle.BASE_ESCAPE_CHANCE = 0.5;
    AIH.RestrainedStruggle.MIN_ESCAPE_CHANCE = 0.05;
    AIH.RestrainedStruggle.MAX_ESCAPE_CHANCE = 0.95;

    AIH.RestrainedStruggle.restrainingStates = function(battler) {

        if (
            !battler ||
            typeof battler.states !== "function"
        ) {

            return [];
        }

        return battler.states().filter(function(state) {
            return state && state._aihRestrains;
        });
    };

    AIH.RestrainedStruggle.isRestrained = function(battler) {

        return AIH.RestrainedStruggle.restrainingStates(battler).length > 0;
    };

    /*
     * Sums restraintModifier across every currently-active state that
     * carries a <StatusEffectStage:...> tag - reads the SAME catalog
     * data already defined for emotion/visual purposes in
     * AIH_StatusEffectCatalog.js, not a second copy of the numbers.
     * States with no matching catalog entry, or no restraintModifier on
     * that stage, simply contribute 0.
     */
    AIH.RestrainedStruggle.modifierSum = function(battler) {

        var sum;

        if (
            !battler ||
            typeof battler.states !== "function" ||
            typeof AIH.StatusEffectCatalog === "undefined"
        ) {

            return 0;
        }

        sum = 0;

        battler.states().forEach(function(state) {

            var tag;
            var info;

            if (!state) {
                return;
            }

            tag =
                state._aihStatusEffectStageTag;

            if (!tag) {
                return;
            }

            info =
                AIH.StatusEffectCatalog.getStageInfo(
                    tag.key,
                    tag.stage
                );

            if (
                info &&
                typeof info.restraintModifier === "number"
            ) {

                sum += info.restraintModifier;
            }
        });

        return sum;
    };

    AIH.RestrainedStruggle.escapeChance = function(battler) {

        var chance;

        chance =
            AIH.RestrainedStruggle.BASE_ESCAPE_CHANCE +
            AIH.RestrainedStruggle.modifierSum(battler);

        return Math.max(
            AIH.RestrainedStruggle.MIN_ESCAPE_CHANCE,
            Math.min(
                AIH.RestrainedStruggle.MAX_ESCAPE_CHANCE,
                chance
            )
        );
    };

    /*
     * The primary restraining state is the FIRST one found (states()
     * order is the engine's own, generally application order) - that's
     * the one whose StruggleSuccessCutIn/StruggleFailCutIn tags decide
     * what plays. If a design wants several simultaneous restraints
     * with genuinely different success/fail art, that's a reason to
     * pick a specific one deliberately rather than this always picking
     * "first" - flagged here rather than silently guessed at.
     */
    AIH.RestrainedStruggle.resolve = function(battler) {

        var restrainingStates;
        var primaryState;
        var chance;
        var success;
        var cutinKey;

        restrainingStates =
            AIH.RestrainedStruggle.restrainingStates(battler);

        chance =
            AIH.RestrainedStruggle.escapeChance(battler);

        success =
            Math.random() < chance;

        primaryState =
            restrainingStates[0] ||
            null;

        cutinKey =
            primaryState ?
                (
                    success ?
                        primaryState._aihStruggleSuccessCutIn :
                        primaryState._aihStruggleFailCutIn
                ) :
                null;

        if (
            cutinKey &&
            typeof AIH.BattleCutins !== "undefined" &&
            AIH.BattleCutins.enqueue
        ) {

            AIH.BattleCutins.enqueue(cutinKey);
        }

        if (success) {

            restrainingStates.forEach(function(state) {

                if (
                    battler &&
                    typeof battler.removeState === "function"
                ) {

                    battler.removeState(state.id);
                }
            });
        }

        if (
            typeof AIH.BattleCutins !== "undefined" &&
            AIH.BattleCutins.requestPartyStatusRefresh
        ) {

            AIH.BattleCutins.requestPartyStatusRefresh();
        }

        return {
            success: success,
            chance: chance,
            cutinKey: cutinKey
        };
    };

    // --- command-window override -----------------------------------------

    if (typeof Window_ActorCommand !== "undefined") {

        var _AIH_RS_WindowActorCommand_makeCommandList =
            Window_ActorCommand.prototype.makeCommandList;

        Window_ActorCommand.prototype.makeCommandList = function() {

            if (
                this._actor &&
                AIH.RestrainedStruggle.isRestrained(this._actor)
            ) {

                this.addCommand("Struggle", "struggle", true);
                return;
            }

            _AIH_RS_WindowActorCommand_makeCommandList.call(this);
        };
    }

    /*
     * Selecting Struggle resolves synchronously (no target selection
     * needed) and ends her turn - Guard is used as the underlying
     * Game_Action so the normal turn-processing pipeline has a valid,
     * always-legal action to advance through; the escape roll and any
     * cut-in have already happened by the time that action executes,
     * so Guard's own (harmless, no-op-for-her-turn) effect is the only
     * thing the action sequence itself does.
     */
    if (typeof Scene_Battle !== "undefined") {

        var _AIH_RS_SceneBattle_createActorCommandWindow =
            Scene_Battle.prototype.createActorCommandWindow;

        Scene_Battle.prototype.createActorCommandWindow = function() {

            _AIH_RS_SceneBattle_createActorCommandWindow.call(this);

            this._actorCommandWindow.setHandler(
                "struggle",
                this.aihCommandStruggle.bind(this)
            );
        };

        Scene_Battle.prototype.aihCommandStruggle = function() {

            var actor;

            actor =
                BattleManager.actor();

            if (actor) {

                AIH.RestrainedStruggle.resolve(actor);

                BattleManager.inputtingAction().setGuard();
            }

            this.onSelectAction();
        };
    }

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register("StatusEffectCutinBridge", {
            version: AIH.StatusEffectCutinBridge.VERSION,
            initialize: function() {}
        });
    }

})();