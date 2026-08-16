/*:
 * @plugindesc AI Hero Framework - Structured Game Events v0.6.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - STRUCTURED GAME EVENTS
 * ============================================================================
 *
 * STEP 6
 *
 * Provides standardized game-event producers for the AI Hero framework.
 *
 * This module converts raw gameplay occurrences into structured AI events.
 *
 * It does NOT:
 *
 * - interpret causes
 * - create beliefs
 * - create hypotheses
 * - modify personality
 * - make decisions
 * - call the LLM
 * - execute AI actions
 *
 * ============================================================================
 *
 * EVENT TYPES
 *
 * COMBAT_STARTED
 * COMBAT_RESULT
 * DAMAGE_RECEIVED
 * ACTOR_DEFEATED
 * ENEMY_DEFEATED
 * EQUIPMENT_CHANGED
 * ITEM_GAINED
 * ITEM_LOST
 * GOLD_CHANGED
 * PURCHASE_COMPLETED
 * PURCHASE_FAILED
 * ACTOR_LEVEL_CHANGED
 * MAP_CHANGED
 * NPC_INTERACTION
 * JOB_OFFERED
 * JOB_COMPLETED
 * REWARD_RECEIVED
 * TRAP_TRIGGERED
 * DISCOVERY
 * REST_COMPLETED
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.GameEvents = AIH.GameEvents || {};

    AIH.GameEvents.VERSION = "0.6.0";

    AIH.GameEvents._initialized = false;

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    AIH.GameEvents.initialize = function() {

        if (AIH.GameEvents._initialized) {
            return;
        }

        AIH.GameEvents._initialized = true;

        AIH.Debug.log(
            "Structured Game Events initialized."
        );
    };

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.GameEvents._copy = function(value) {

        if (
            value === undefined ||
            value === null
        ) {
            return value;
        }

        return JSON.parse(
            JSON.stringify(value)
        );
    };

    // =========================================================================
    // EMIT HELPER
    // =========================================================================

    AIH.GameEvents._emit = function(
        eventName,
        data
    ) {

        if (!AIH.Events) {

            AIH.Debug.error(
                "AIH.GameEvents requires AIH.Events."
            );

            return null;
        }

        return AIH.Events.emit(
            eventName,
            data || {}
        );
    };

    // =========================================================================
    // ACTOR SNAPSHOT
    // =========================================================================

    AIH.GameEvents.actorSnapshot = function(
        actor
    ) {

        var snapshot;

        if (!actor) {
            return null;
        }

        snapshot = {

            actorId:
                actor.actorId
                    ? actor.actorId()
                    : 0,

            name:
                actor.name
                    ? actor.name()
                    : "",

            level:
                actor.level,

            hp:
                actor.hp,

            mhp:
                actor.mhp,

            mp:
                actor.mp,

            mmp:
                actor.mmp,

            atk:
                actor.atk,

            def:
                actor.def,

            mat:
                actor.mat,

            mdf:
                actor.mdf,

            agi:
                actor.agi,

            luk:
                actor.luk
        };

        return AIH.GameEvents._copy(
            snapshot
        );
    };

    // =========================================================================
    // EQUIPMENT SNAPSHOT
    // =========================================================================

    AIH.GameEvents.equipmentSnapshot = function(
        actor
    ) {

        var result;
        var equips;
        var i;
        var item;

        result = [];

        if (!actor ||
            !actor.equips) {

            return result;
        }

        equips =
            actor.equips();

        for (
            i = 0;
            i < equips.length;
            i++
        ) {

            item =
                equips[i];

            if (!item) {

                result.push(null);

                continue;
            }

            result.push({

                itemId:
                    item.id || 0,

                name:
                    item.name || "",

                etypeId:
                    item.etypeId || 0,

                note:
                    item.note || ""
            });
        }

        return AIH.GameEvents._copy(
            result
        );
    };

    // =========================================================================
    // COMBAT STARTED
    // =========================================================================

    AIH.GameEvents.combatStarted = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "COMBAT_STARTED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // COMBAT RESULT
    // =========================================================================

    AIH.GameEvents.combatResult = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "COMBAT_RESULT",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // DAMAGE RECEIVED
    // =========================================================================

    AIH.GameEvents.damageReceived = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "DAMAGE_RECEIVED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // ACTOR DEFEATED
    // =========================================================================

    AIH.GameEvents.actorDefeated = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "ACTOR_DEFEATED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // ENEMY DEFEATED
    // =========================================================================

    AIH.GameEvents.enemyDefeated = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "ENEMY_DEFEATED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // EQUIPMENT CHANGED
    // =========================================================================

    AIH.GameEvents.equipmentChanged = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "EQUIPMENT_CHANGED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // ITEM GAINED
    // =========================================================================

    AIH.GameEvents.itemGained = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "ITEM_GAINED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // ITEM LOST
    // =========================================================================

    AIH.GameEvents.itemLost = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "ITEM_LOST",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // GOLD CHANGED
    // =========================================================================

    AIH.GameEvents.goldChanged = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "GOLD_CHANGED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // PURCHASE COMPLETED
    // =========================================================================

    AIH.GameEvents.purchaseCompleted = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "PURCHASE_COMPLETED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // PURCHASE FAILED
    // =========================================================================

    AIH.GameEvents.purchaseFailed = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "PURCHASE_FAILED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // LEVEL CHANGED
    // =========================================================================

    AIH.GameEvents.actorLevelChanged = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "ACTOR_LEVEL_CHANGED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // MAP CHANGED
    // =========================================================================

    AIH.GameEvents.mapChanged = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "MAP_CHANGED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // NPC INTERACTION
    // =========================================================================

    AIH.GameEvents.npcInteraction = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "NPC_INTERACTION",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // JOB OFFERED
    // =========================================================================

    AIH.GameEvents.jobOffered = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "JOB_OFFERED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // JOB COMPLETED
    // =========================================================================

    AIH.GameEvents.jobCompleted = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "JOB_COMPLETED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // REWARD RECEIVED
    // =========================================================================

    AIH.GameEvents.rewardReceived = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "REWARD_RECEIVED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // TRAP TRIGGERED
    // =========================================================================

    AIH.GameEvents.trapTriggered = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "TRAP_TRIGGERED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // DISCOVERY
    // =========================================================================

    AIH.GameEvents.discovery = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "DISCOVERY",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // REST COMPLETED
    // =========================================================================

    AIH.GameEvents.restCompleted = function(
        data
    ) {

        return AIH.GameEvents._emit(
            "REST_COMPLETED",
            AIH.GameEvents._copy(
                data || {}
            )
        );
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "GameEvents",
        {
            version:
                AIH.GameEvents.VERSION,

            initialize: function() {
                AIH.GameEvents.initialize();
            }
        }
    );

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    var _AIH_GameEvents_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_GameEvents_createGameObjects.call(this);

        AIH.GameEvents.initialize();
    };

    // =========================================================================
    // NEW GAME HOOK
    // =========================================================================

    var _AIH_GameEvents_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_GameEvents_setupNewGame.call(this);

        AIH.GameEvents.initialize();
    };

    // =========================================================================
    // SAVE LOAD HOOK
    // =========================================================================

    var _AIH_GameEvents_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(contents) {

        _AIH_GameEvents_extractSaveContents.call(
            this,
            contents
        );

        AIH.GameEvents.initialize();
    };

})();