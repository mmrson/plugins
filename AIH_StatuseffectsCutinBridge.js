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
 *    Restraint is not a separate tag - it's read directly from
 *    AIH_StatusEffectCatalog.js's "bound" effect (see that file), whose
 *    three stages each define `restrainedParts`: which of
 *    "hands_front" / "hands_back" / "legs" are bound at that severity.
 *    Any active state carrying a matching <StatusEffectStage:bound:N>
 *    tag contributes its stage's parts and restraintModifier - the same
 *    mechanism already used for slimed/milk_stained/blushing, not a
 *    parallel system.
 *
 *    Her command list is NOT replaced. "Struggle" is ADDED alongside
 *    her normal commands; the normal commands are individually
 *    penalized or disabled based on which parts are currently bound:
 *
 *      hands_front bound  - magic: no penalty. weapon: some penalty.
 *      hands_back bound   - magic AND weapon: heavy penalty (~15%
 *                            effectiveness) when targeting an opponent.
 *      hands_back + legs  - magic can only target herself; trying to
 *                            target an opponent is blocked with an
 *                            explanation, redirected to ally/self
 *                            selection instead.
 *      legs bound (any)   - Attack (weapon) disabled outright (can't
 *                            close distance) - magic still reaches.
 *                            Evasion forced to 0. Fleeing disabled for
 *                            the whole party while she's bound this way.
 *
 *    Struggle costs her turn (same shape as Guard) and rolls against
 *    BASE_ESCAPE_CHANCE + the summed restraintModifier of every active
 *    restraint-relevant state - bound's own plus, e.g., a stacked
 *    slimed state's, compounding from data, not a hardcoded rule.
 *    Success removes only the states that actually define
 *    restrainedParts (the binds themselves) - a stacked slimed stays
 *    exactly as it was, since struggling isn't what clears that.
 *
 *    If she's bound hands_back+legs AND slimed at the same time,
 *    Struggle is blocked outright (not just penalized) - per explicit
 *    direction, this is the concrete incentive to deal with the slime
 *    first rather than just grinding struggle attempts against it.
 *
 * ============================================================================
 *
 * ENGINE-HOOK CONFIDENCE NOTE
 *
 * The command-availability/penalty logic (who can act, how effective it
 * is, whether a state should be removed) is pure data/decision logic,
 * fully covered by this project's usual stub-harness testing. Two of
 * the engine hooks below touch deeper, harder-to-simulate MZ internals
 * without a running engine to verify against - the Game_Action.
 * isForOpponent() redirect (forces the actor/self target window to
 * open instead of the enemy one) and the battle-log message it pushes
 * alongside that redirect. Both follow standard, well-established MZ
 * patterns, but are flagged here as the parts most worth a real
 * in-engine smoke-test before shipping.
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

    AIH.RestrainedStruggle.PART_HANDS_FRONT = "hands_front";
    AIH.RestrainedStruggle.PART_HANDS_BACK = "hands_back";
    AIH.RestrainedStruggle.PART_LEGS = "legs";

    AIH.RestrainedStruggle.BASE_ESCAPE_CHANCE = 0.5;
    AIH.RestrainedStruggle.MIN_ESCAPE_CHANCE = 0.05;
    AIH.RestrainedStruggle.MAX_ESCAPE_CHANCE = 0.95;

    /*
     * "Heavy penalty, most likely ineffective" (hands bound behind her
     * back) vs. "some penalty" (hands bound in front) - applied as a
     * multiplier on hit chance AND damage together (see the
     * Game_Action hooks below), so the two compound rather than either
     * alone doing all the work.
     */
    AIH.RestrainedStruggle.WEAPON_MULTIPLIER_HANDS_BACK = 0.15;
    AIH.RestrainedStruggle.WEAPON_MULTIPLIER_HANDS_FRONT = 0.65;
    AIH.RestrainedStruggle.MAGIC_MULTIPLIER_HANDS_BACK = 0.15;
    // hands_front: explicitly no penalty to magic, per direction.

    /*
     * Every currently active state whose tagged catalog stage defines
     * restrainedParts contributes those parts - this is the ONLY source
     * of truth for "is she restrained, and how," reusing the existing
     * <StatusEffectStage:...> mechanism rather than a parallel tag.
     */
    AIH.RestrainedStruggle._activeRestraintStates = function(battler) {

        if (
            !battler ||
            typeof battler.states !== "function" ||
            typeof AIH.StatusEffectCatalog === "undefined"
        ) {

            return [];
        }

        return battler.states().filter(function(state) {

            var tag;
            var info;

            if (!state) {
                return false;
            }

            tag =
                state._aihStatusEffectStageTag;

            if (!tag) {
                return false;
            }

            info =
                AIH.StatusEffectCatalog.getStageInfo(
                    tag.key,
                    tag.stage
                );

            return !!(
                info &&
                info.restrainedParts &&
                info.restrainedParts.length
            );
        });
    };

    AIH.RestrainedStruggle.activeRestrainedParts = function(battler) {

        var parts;

        parts = {};

        AIH.RestrainedStruggle._activeRestraintStates(battler).forEach(function(state) {

            var tag;
            var info;

            tag =
                state._aihStatusEffectStageTag;

            info =
                AIH.StatusEffectCatalog.getStageInfo(
                    tag.key,
                    tag.stage
                );

            info.restrainedParts.forEach(function(part) {
                parts[part] = true;
            });
        });

        return Object.keys(parts);
    };

    AIH.RestrainedStruggle.hasPart = function(battler, part) {

        return AIH.RestrainedStruggle.activeRestrainedParts(battler).indexOf(part) !== -1;
    };

    AIH.RestrainedStruggle.isRestrained = function(battler) {

        return AIH.RestrainedStruggle.activeRestrainedParts(battler).length > 0;
    };

    /*
     * Whether she currently has an active slimed state, regardless of
     * stage - used only for the hands_back+legs "magic won't free her
     * either" incentive below, per explicit direction.
     */
    AIH.RestrainedStruggle._isSlimed = function(battler) {

        if (
            !battler ||
            typeof battler.states !== "function"
        ) {

            return false;
        }

        return battler.states().some(function(state) {

            return !!(
                state &&
                state._aihStatusEffectStageTag &&
                state._aihStatusEffectStageTag.key === "slimed"
            );
        });
    };

    // --- command/targeting availability, read by the engine hooks below ----

    AIH.RestrainedStruggle.canUseWeaponAttack = function(battler) {

        return !AIH.RestrainedStruggle.hasPart(
            battler,
            AIH.RestrainedStruggle.PART_LEGS
        );
    };

    AIH.RestrainedStruggle.canFlee = function(battler) {

        return !AIH.RestrainedStruggle.hasPart(
            battler,
            AIH.RestrainedStruggle.PART_LEGS
        );
    };

    AIH.RestrainedStruggle.evasionForcedZero = function(battler) {

        return AIH.RestrainedStruggle.hasPart(
            battler,
            AIH.RestrainedStruggle.PART_LEGS
        );
    };

    /*
     * Only false when BOTH hands_back and legs are active together -
     * hands_front or hands_back alone still lets her aim at an
     * opponent (with a penalty, see below), just not this combination.
     */
    AIH.RestrainedStruggle.canTargetEnemyWithMagic = function(battler) {

        return !(
            AIH.RestrainedStruggle.hasPart(battler, AIH.RestrainedStruggle.PART_HANDS_BACK) &&
            AIH.RestrainedStruggle.hasPart(battler, AIH.RestrainedStruggle.PART_LEGS)
        );
    };

    AIH.RestrainedStruggle.weaponEffectivenessMultiplier = function(battler) {

        if (AIH.RestrainedStruggle.hasPart(battler, AIH.RestrainedStruggle.PART_HANDS_BACK)) {
            return AIH.RestrainedStruggle.WEAPON_MULTIPLIER_HANDS_BACK;
        }

        if (AIH.RestrainedStruggle.hasPart(battler, AIH.RestrainedStruggle.PART_HANDS_FRONT)) {
            return AIH.RestrainedStruggle.WEAPON_MULTIPLIER_HANDS_FRONT;
        }

        return 1;
    };

    AIH.RestrainedStruggle.magicEffectivenessMultiplier = function(battler) {

        if (AIH.RestrainedStruggle.hasPart(battler, AIH.RestrainedStruggle.PART_HANDS_BACK)) {
            return AIH.RestrainedStruggle.MAGIC_MULTIPLIER_HANDS_BACK;
        }

        // hands_front (or no hand restriction): no magic penalty, per direction.
        return 1;
    };

    // --- the struggle roll itself --------------------------------------

    /*
     * Sums restraintModifier across every currently-active
     * restraint-relevant state (bound's own stage, plus e.g. a stacked
     * slimed state's) - same shared-data mechanism as everywhere else
     * in this project, not a second copy of the numbers.
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
     * Per explicit direction: hands_back + legs + slimed all active at
     * once blocks Struggle outright, rather than just penalizing it -
     * the concrete incentive to deal with the slime first instead of
     * grinding the roll against it.
     */
    AIH.RestrainedStruggle.isStruggleBlocked = function(battler) {

        return (
            AIH.RestrainedStruggle.hasPart(battler, AIH.RestrainedStruggle.PART_HANDS_BACK) &&
            AIH.RestrainedStruggle.hasPart(battler, AIH.RestrainedStruggle.PART_LEGS) &&
            AIH.RestrainedStruggle._isSlimed(battler)
        );
    };

    /*
     * The state whose StruggleSuccessCutIn/StruggleFailCutIn tags
     * decide what plays is the FIRST restraint-defining state found
     * (battler.states() order is the engine's own, generally
     * application order). If a design wants several simultaneous
     * restraints with genuinely different success/fail art, that's a
     * reason to pick a specific one deliberately rather than this
     * always picking "first" - flagged here rather than silently
     * guessed at.
     */
    AIH.RestrainedStruggle.resolve = function(battler) {

        var restrainingStates;
        var primaryState;
        var blocked;
        var chance;
        var success;
        var cutinKey;

        restrainingStates =
            AIH.RestrainedStruggle._activeRestraintStates(battler);

        blocked =
            AIH.RestrainedStruggle.isStruggleBlocked(battler);

        chance =
            blocked ?
                0 :
                AIH.RestrainedStruggle.escapeChance(battler);

        success =
            !blocked &&
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

            /*
             * Only the states that actually define restrainedParts are
             * removed - a stacked slimed state is untouched by a
             * successful struggle; that's a separate effect with its
             * own way of clearing.
             */
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
            blocked: blocked,
            chance: chance,
            cutinKey: cutinKey
        };
    };

    // =========================================================================
    // ENGINE HOOKS
    // =========================================================================

    /*
     * ADDS Struggle alongside the normal command list (never replaces
     * it) and disables Attack outright when legs are bound (she can't
     * close distance) - per direction, this is a hard disable, not a
     * penalty, distinct from the hand-restriction penalties applied to
     * damage/hit below.
     */
    if (typeof Window_ActorCommand !== "undefined") {

        var _AIH_RS_WindowActorCommand_makeCommandList =
            Window_ActorCommand.prototype.makeCommandList;

        Window_ActorCommand.prototype.makeCommandList = function() {

            _AIH_RS_WindowActorCommand_makeCommandList.call(this);

            if (
                !this._actor ||
                !AIH.RestrainedStruggle.isRestrained(this._actor)
            ) {

                return;
            }

            if (!AIH.RestrainedStruggle.canUseWeaponAttack(this._actor)) {

                this._list.forEach(function(command) {

                    if (command.symbol === "attack") {
                        command.enabled = false;
                    }
                });
            }

            this.addCommand("Struggle", "struggle", true);
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

    /*
     * Fleeing is a whole-party decision in MZ (Window_PartyCommand),
     * gated by BattleManager.canEscape() - wrapped so the whole party
     * can't flee while she's leg-bound, per direction ("can't run").
     * This is a deliberate reading of a solo-actor restriction as a
     * party-wide gate (you can't escape battle leaving your bound
     * protagonist behind) - flagged as an interpretation, not something
     * explicitly scoped to party-vs-solo in the original direction.
     */
    if (typeof BattleManager !== "undefined") {

        var _AIH_RS_BattleManager_canEscape =
            BattleManager.canEscape;

        BattleManager.canEscape = function() {

            var actor;

            actor =
                typeof AIH.Hero !== "undefined" && AIH.Hero.actorId && typeof $gameActors !== "undefined" ?
                    $gameActors.actor(AIH.Hero.actorId()) :
                    null;

            if (
                actor &&
                AIH.RestrainedStruggle.hasPart(actor, AIH.RestrainedStruggle.PART_LEGS)
            ) {

                return false;
            }

            return _AIH_RS_BattleManager_canEscape ?
                _AIH_RS_BattleManager_canEscape.call(this) :
                true;
        };
    }

    /*
     * Evasion forced to 0 while leg-bound - xparam(1) is eva in MZ's
     * core parameter table, a documented stable index.
     */
    if (typeof Game_BattlerBase !== "undefined") {

        var _AIH_RS_GameBattlerBase_xparam =
            Game_BattlerBase.prototype.xparam;

        Game_BattlerBase.prototype.xparam = function(xparamId) {

            if (
                xparamId === 1 &&
                AIH.BattleCutins &&
                AIH.BattleCutins._isHeroine(this) &&
                AIH.RestrainedStruggle.evasionForcedZero(this)
            ) {

                return 0;
            }

            return _AIH_RS_GameBattlerBase_xparam.call(this, xparamId);
        };
    }

    /*
     * Hit-rate AND damage penalties for an opponent-targeted attack
     * while hand-bound, compounding for "most likely ineffective" per
     * direction. Only applies when the subject is the heroine and the
     * action targets an opponent - a self/ally-targeted heal or buff
     * while restrained is untouched, since the direction specifically
     * discussed penalties in the context of attacking.
     */
    if (typeof Game_Action !== "undefined") {

        var _AIH_RS_GameAction_itemHit =
            Game_Action.prototype.itemHit;

        Game_Action.prototype.itemHit = function(target) {

            var base;
            var subject;

            base =
                _AIH_RS_GameAction_itemHit.call(this, target);

            subject =
                this.subject();

            if (
                !AIH.BattleCutins ||
                !AIH.BattleCutins._isHeroine(subject) ||
                !this.isForOpponent()
            ) {

                return base;
            }

            if (this.isPhysical()) {

                return base *
                    AIH.RestrainedStruggle.weaponEffectivenessMultiplier(subject);
            }

            if (this.isMagical()) {

                return base *
                    AIH.RestrainedStruggle.magicEffectivenessMultiplier(subject);
            }

            return base;
        };

        var _AIH_RS_GameAction_makeDamageValue =
            Game_Action.prototype.makeDamageValue;

        Game_Action.prototype.makeDamageValue = function(target, critical) {

            var base;
            var subject;
            var multiplier;

            base =
                _AIH_RS_GameAction_makeDamageValue.call(this, target, critical);

            subject =
                this.subject();

            if (
                !AIH.BattleCutins ||
                !AIH.BattleCutins._isHeroine(subject) ||
                !this.isForOpponent()
            ) {

                return base;
            }

            multiplier = 1;

            if (this.isPhysical()) {

                multiplier =
                    AIH.RestrainedStruggle.weaponEffectivenessMultiplier(subject);

            } else if (this.isMagical()) {

                multiplier =
                    AIH.RestrainedStruggle.magicEffectivenessMultiplier(subject);
            }

            return Math.round(base * multiplier);
        };

        /*
         * hands_back + legs together: magic can't reach an opponent at
         * all - redirect the engine's own target-selection branch
         * (Scene_Battle checks isForOpponent() to decide whether to
         * open the enemy-select or actor-select window) to ally/self
         * selection instead of the enemy one, and push an explanatory
         * line into the battle log so it's not a silent redirect. This
         * is the specific hook flagged in this file's header as most
         * worth an in-engine smoke-test.
         */
        var _AIH_RS_GameAction_isForOpponent =
            Game_Action.prototype.isForOpponent;

        Game_Action.prototype.isForOpponent = function() {

            var result;
            var subject;

            result =
                _AIH_RS_GameAction_isForOpponent.call(this);

            if (!result) {
                return result;
            }

            subject =
                this.subject();

            if (
                !this.isMagical() ||
                !AIH.BattleCutins ||
                !AIH.BattleCutins._isHeroine(subject) ||
                AIH.RestrainedStruggle.canTargetEnemyWithMagic(subject)
            ) {

                return result;
            }

            if (
                typeof BattleManager !== "undefined" &&
                BattleManager._logWindow &&
                BattleManager._logWindow.push
            ) {

                BattleManager._logWindow.push(
                    "addText",
                    "She can't target the enemy from this position - " +
                    "hands bound behind her back, feet bound, there's no " +
                    "reach for it."
                );
            }

            return false;
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