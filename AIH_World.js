/*:
 * @plugindesc AI Hero Framework - World State v0.2.1
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - WORLD STATE
 * ============================================================================
 *
 * STEP 2
 *
 * Provides a controlled representation of RPG Maker's current game state
 * for the AI Hero framework.
 *
 * This module does NOT:
 *
 * - make decisions
 * - control the hero
 * - interpret causes
 * - create beliefs
 * - create memories
 * - call an LLM
 * - execute AI actions
 *
 * It only describes current game reality.
 *
 * ============================================================================
 *
 * DESIGN PRINCIPLE
 *
 * RPG Maker owns reality.
 *
 * AIH.World creates snapshots of relevant game state.
 *
 * Later modules will transform those snapshots into observations.
 *
 * ============================================================================
 *
 * @param Default Map Label
 * @text Default Map Label
 * @type string
 * @default Unknown Location
 *
 * @command Refresh World
 * @text Refresh World
 * @desc Refreshes the current AIH world snapshot.
 *
 * @command Show World
 * @text Show World
 * @desc Prints the current AIH world snapshot to the developer console.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // WORLD NAMESPACE
    // =========================================================================

    AIH.World = AIH.World || {};

    AIH.World.VERSION = "0.2.1";

    AIH.World._snapshot = null;
    AIH.World._lastSignature = null;
    AIH.World._initialized = false;

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    AIH.World.Config = AIH.World.Config || {};

    AIH.World.Config.defaultMapLabel = "Unknown Location";

    AIH.World.Config.setup = function() {

        var parameters;
        var value;

        parameters = PluginManager.parameters("AIH_World");

        if (!parameters) {
            return;
        }

        value = parameters["Default Map Label"];

        if (value !== undefined &&
            String(value).length > 0) {

            AIH.World.Config.defaultMapLabel = String(value);
        }
    };

    // =========================================================================
    // SAFE VALUE HELPERS
    // =========================================================================

    AIH.World._number = function(value, fallback) {

        var number;

        number = Number(value);

        if (isNaN(number)) {
            return fallback !== undefined ? fallback : 0;
        }

        return number;
    };

    AIH.World._string = function(value, fallback) {

        if (value === undefined || value === null) {
            return fallback !== undefined ? fallback : "";
        }

        return String(value);
    };

    // =========================================================================
    // HERO SNAPSHOT
    // =========================================================================

    AIH.World._buildHeroSnapshot = function() {

        var actor;
        var snapshot;

        snapshot = {
            exists: false,
            actorId: 0,
            name: "",
            level: 0,
            hp: 0,
            mhp: 0,
            mp: 0,
            mmp: 0,
            tp: 0,
            maxTp: 100,
            atk: 0,
            def: 0,
            mat: 0,
            mdf: 0,
            agi: 0,
            luk: 0,
            states: [],
            equips: []
        };

        if (!$gameParty ||
            typeof $gameParty.leader !== "function") {

            return snapshot;
        }

        actor = $gameParty.leader();

        if (!actor) {
            return snapshot;
        }

        snapshot.exists = true;

        snapshot.actorId =
            AIH.World._number(
                actor.actorId(),
                0
            );

        snapshot.name =
            AIH.World._string(
                actor.name(),
                ""
            );

        snapshot.level =
            AIH.World._number(
                actor.level,
                0
            );

        snapshot.hp =
            AIH.World._number(
                actor.hp,
                0
            );

        snapshot.mhp =
            AIH.World._number(
                actor.mhp,
                0
            );

        snapshot.mp =
            AIH.World._number(
                actor.mp,
                0
            );

        snapshot.mmp =
            AIH.World._number(
                actor.mmp,
                0
            );

        snapshot.tp =
            AIH.World._number(
                actor.tp,
                0
            );

        snapshot.maxTp =
            AIH.World._number(
                actor.maxTp(),
                100
            );

        snapshot.atk =
            AIH.World._number(
                actor.atk,
                0
            );

        snapshot.def =
            AIH.World._number(
                actor.def,
                0
            );

        snapshot.mat =
            AIH.World._number(
                actor.mat,
                0
            );

        snapshot.mdf =
            AIH.World._number(
                actor.mdf,
                0
            );

        snapshot.agi =
            AIH.World._number(
                actor.agi,
                0
            );

        snapshot.luk =
            AIH.World._number(
                actor.luk,
                0
            );

        snapshot.states =
            AIH.World._buildStateList(actor);

        snapshot.equips =
            AIH.World._buildEquipmentList(actor);

        return snapshot;
    };

    // =========================================================================
    // STATES
    // =========================================================================

    AIH.World._buildStateList = function(actor) {

        var result;
        var states;
        var i;
        var state;

        result = [];

        if (!actor ||
            typeof actor.states !== "function") {

            return result;
        }

        states = actor.states();

        for (i = 0; i < states.length; i++) {

            state = states[i];

            if (!state) {
                continue;
            }

            result.push({
                id: AIH.World._number(state.id, 0),
                name: AIH.World._string(state.name, "")
            });
        }

        return result;
    };

    // =========================================================================
    // EQUIPMENT
    // =========================================================================

    AIH.World._buildEquipmentList = function(actor) {

        var result;
        var equips;
        var i;
        var item;

        result = [];

        if (!actor ||
            typeof actor.equips !== "function") {

            return result;
        }

        equips = actor.equips();

        for (i = 0; i < equips.length; i++) {

            item = equips[i];

            if (!item) {

                result.push({
                    slotIndex: i,
                    exists: false,
                    id: 0,
                    name: "",
                    type: "",
                    weight: 0
                });

                continue;
            }

            result.push({
                slotIndex: i,
                exists: true,
                id: AIH.World._number(item.id, 0),
                name: AIH.World._string(item.name, ""),
                type: AIH.World._equipmentType(item),
                weight: AIH.World._equipmentWeight(item)
            });
        }

        return result;
    };

    // =========================================================================
    // EQUIPMENT TYPE
    // =========================================================================

    AIH.World._equipmentType = function(item) {

        if (!item) {
            return "";
        }

        if (DataManager.isWeapon(item)) {
            return "weapon";
        }

        if (DataManager.isArmor(item)) {
            return "armor";
        }

        return "unknown";
    };

    // =========================================================================
    // EQUIPMENT WEIGHT
    // =========================================================================

    /*
     * RPG Maker MZ does not provide a universal built-in equipment weight
     * property.
     *
     * Therefore this module reads the optional:
     *
     * <AIH_Weight:12>
     *
     * notetag.
     *
     * This is only exposing data at this stage.
     * It does NOT yet apply any mechanical effect to the actor.
     */

    AIH.World._equipmentWeight = function(item) {

        var match;
        var value;

        if (!item ||
            !item.note) {

            return 0;
        }

        match = /<AIH_Weight\s*:\s*(-?\d+(?:\.\d+)?)\s*>/i.exec(
            String(item.note)
        );

        if (!match) {
            return 0;
        }

        value = Number(match[1]);

        if (isNaN(value)) {
            return 0;
        }

        return value;
    };

    // =========================================================================
    // LOCATION SNAPSHOT
    // =========================================================================

    AIH.World._buildLocationSnapshot = function() {

        var mapId;
        var mapName;
        var x;
        var y;

        mapId = 0;
        mapName = AIH.World.Config.defaultMapLabel;
        x = 0;
        y = 0;

        if ($gameMap) {

            mapId =
                AIH.World._number(
                    $gameMap.mapId(),
                    0
                );

            if ($gamePlayer) {

                x =
                    AIH.World._number(
                        $gamePlayer.x,
                        0
                    );

                y =
                    AIH.World._number(
                        $gamePlayer.y,
                        0
                    );
            }

            if ($dataMapInfos &&
                $dataMapInfos[mapId]) {

                mapName =
                    AIH.World._string(
                        $dataMapInfos[mapId].name,
                        AIH.World.Config.defaultMapLabel
                    );
            }
        }

        return {
            mapId: mapId,
            mapName: mapName,
            x: x,
            y: y
        };
    };

    // =========================================================================
    // RESOURCE SNAPSHOT
    // =========================================================================

    AIH.World._buildResourceSnapshot = function() {

        var gold;

        gold = 0;

        if ($gameParty &&
            typeof $gameParty.gold === "function") {

            gold =
                AIH.World._number(
                    $gameParty.gold(),
                    0
                );
        }

        return {
            gold: gold,
            itemCount: AIH.World._partyItemCount()
        };
    };

    // =========================================================================
    // PARTY ITEM COUNT
    // =========================================================================

    AIH.World._partyItemCount = function() {

        var items;
        var count;
        var i;

        count = 0;

        if (!$gameParty ||
            typeof $gameParty.items !== "function") {

            return count;
        }

        items = $gameParty.items();

        for (i = 0; i < items.length; i++) {

            if (items[i] &&
                typeof $gameParty.numItems === "function") {

                count +=
                    AIH.World._number(
                        $gameParty.numItems(items[i]),
                        0
                    );
            }
        }

        return count;
    };

    // =========================================================================
    // TIME SNAPSHOT
    // =========================================================================

    /*
     * This is NOT yet the game's strategic dungeon time.
     *
     * The real expedition/time system will be implemented later.
     */

    AIH.World._buildTimeSnapshot = function() {

        return {
            frameworkTimestamp: Date.now()
        };
    };

    // =========================================================================
    // ENVIRONMENT SNAPSHOT
    // =========================================================================

    AIH.World._buildEnvironmentSnapshot = function() {

        var mapId;
        var mapName;

        mapId = 0;
        mapName = AIH.World.Config.defaultMapLabel;

        if ($gameMap) {

            mapId =
                AIH.World._number(
                    $gameMap.mapId(),
                    0
                );

            if ($dataMapInfos &&
                $dataMapInfos[mapId]) {

                mapName =
                    AIH.World._string(
                        $dataMapInfos[mapId].name,
                        AIH.World.Config.defaultMapLabel
                    );
            }
        }

        return {
            mapId: mapId,
            mapName: mapName
        };
    };

    // =========================================================================
    // CREATE SNAPSHOT
    // =========================================================================

    AIH.World.createSnapshot = function() {

        return {
            version: AIH.World.VERSION,

            capturedAt: Date.now(),

            hero:
                AIH.World._buildHeroSnapshot(),

            location:
                AIH.World._buildLocationSnapshot(),

            resources:
                AIH.World._buildResourceSnapshot(),

            time:
                AIH.World._buildTimeSnapshot(),

            environment:
                AIH.World._buildEnvironmentSnapshot()
        };
    };

    // =========================================================================
    // SNAPSHOT SIGNATURE
    // =========================================================================

    AIH.World._signature = function(snapshot) {

        if (!snapshot) {
            return "";
        }

        return JSON.stringify(snapshot);
    };

    // =========================================================================
    // REFRESH
    // =========================================================================

    AIH.World.refresh = function(emitEvent) {

        var previous;
        var current;
        var previousSignature;
        var currentSignature;

        previous = AIH.World._snapshot;

        current = AIH.World.createSnapshot();

        previousSignature =
            AIH.World._signature(previous);

        currentSignature =
            AIH.World._signature(current);

        AIH.World._snapshot = current;

        AIH.World._lastSignature =
            currentSignature;

        if (emitEvent !== false &&
            previousSignature !== currentSignature) {

            AIH.Events.emit(
                "WORLD_STATE_CHANGED",
                {
                    previous: previous,
                    current: current
                }
            );
        }

        return current;
    };

    // =========================================================================
    // CURRENT SNAPSHOT
    // =========================================================================

    AIH.World.current = function() {

        if (!AIH.World._snapshot) {
            AIH.World.refresh(false);
        }

        return AIH.World._snapshot;
    };

    // =========================================================================
    // COPY SNAPSHOT
    // =========================================================================

    AIH.World.copy = function() {

        var snapshot;

        snapshot = AIH.World.current();

        if (!snapshot) {
            return null;
        }

        return JSON.parse(
            JSON.stringify(snapshot)
        );
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    AIH.World.initialize = function() {

        if (AIH.World._initialized) {
            return;
        }

        AIH.World.Config.setup();

        AIH.World._snapshot = null;
        AIH.World._lastSignature = null;

        AIH.World._initialized = true;

        AIH.Debug.log(
            "World module initialized."
        );
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "World",
        {
            version: AIH.World.VERSION,

            initialize: function() {
                AIH.World.initialize();
            },

            refresh: function() {
                return AIH.World.refresh();
            },

            current: function() {
                return AIH.World.copy();
            }
        }
    );

    // =========================================================================
    // PLUGIN COMMAND: REFRESH WORLD
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_World",
        "Refresh World",
        function() {

            AIH.World.refresh();

            AIH.Debug.log(
                "World snapshot refreshed."
            );
        }
    );

    // =========================================================================
    // PLUGIN COMMAND: SHOW WORLD
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_World",
        "Show World",
        function() {

            AIH.Debug.inspect(
                "Current world snapshot:",
                AIH.World.copy()
            );
        }
    );

    // =========================================================================
    // RPG MAKER INITIALIZATION HOOK
    // =========================================================================

    /*
     * IMPORTANT:
     *
     * DataManager.createGameObjects() creates the RPG Maker game objects,
     * but the starting party may not exist yet.
     *
     * Therefore we initialize the module here, but DO NOT capture the
     * hero snapshot here.
     */

    var _AIH_World_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_World_createGameObjects.call(this);

        AIH.World.initialize();
    };

    // =========================================================================
    // RPG MAKER NEW GAME HOOK
    // =========================================================================

    /*
     * setupNewGame() runs after RPG Maker has performed the normal new-game
     * initialization, including creation of the starting party.
     */

    var _AIH_World_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_World_setupNewGame.call(this);

        AIH.World.initialize();

        AIH.World.refresh(false);
    };

    // =========================================================================
    // RPG MAKER SAVE LOAD HOOK
    // =========================================================================

    /*
     * extractSaveContents() runs after RPG Maker restores the saved game
     * objects.
     *
     * Capture the world only after the saved state has been restored.
     */

    var _AIH_World_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(contents) {

        _AIH_World_extractSaveContents.call(this, contents);

        AIH.World.initialize();

        AIH.World.refresh(false);
    };

})();