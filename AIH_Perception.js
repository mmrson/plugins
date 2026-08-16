/*:
 * @plugindesc AI Hero Framework - Perception v0.4.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - PERCEPTION
 * ============================================================================
 *
 * STEP 3
 *
 * Converts current AIH.World state into structured observations.
 *
 * Perception describes what is currently observable.
 *
 * It does NOT:
 *
 * - infer causality
 * - create beliefs
 * - create memories
 * - modify personality
 * - modify emotions
 * - make decisions
 * - call an LLM
 * - execute actions
 *
 * ============================================================================
 *
 * DESIGN PRINCIPLE
 *
 * World State:
 *
 *     What is currently true in the game.
 *
 * Perception:
 *
 *     What the AI is currently presented with as observations.
 *
 * Belief:
 *
 *     What the AI thinks may be true based on experience.
 *
 * These systems remain deliberately separate.
 *
 * ============================================================================
 *
 * v0.4.0 CHANGES
 *
 * - Safer initialization.
 * - More defensive handling of missing world data.
 * - Uses persistent AI State actor ID when available.
 * - Adds basic inventory observation.
 * - Adds party-level observation.
 * - Adds map/dungeon context when available from World.
 * - Adds a unified snapshot ID.
 * - Preserves the original observation API.
 * - Does not add causal interpretation.
 *
 * ============================================================================
 *
 * @command Observe
 * @text Observe
 * @desc Creates a new perception snapshot.
 *
 * @command Show Observations
 * @text Show Observations
 * @desc Prints the current observations to the developer console.
 *
 * @command Clear Observations
 * @text Clear Observations
 * @desc Clears the current perception snapshot.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Perception = AIH.Perception || {};

    AIH.Perception.VERSION = "0.4.0";

    AIH.Perception._observations = [];

    AIH.Perception._observationSequence = 0;

    AIH.Perception._snapshotSequence = 0;

    AIH.Perception._lastWorldSignature = null;

    AIH.Perception._initialized = false;

    AIH.Perception._currentSnapshotId = 0;

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    AIH.Perception.initialize = function() {

        if (AIH.Perception._initialized) {
            return;
        }

        AIH.Perception._observations = [];

        AIH.Perception._observationSequence = 0;

        AIH.Perception._snapshotSequence = 0;

        AIH.Perception._lastWorldSignature = null;

        AIH.Perception._currentSnapshotId = 0;

        AIH.Perception._initialized = true;

        AIH.Debug.log(
            "Perception module initialized."
        );
    };

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Perception._copy = function(value) {

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
    // OBSERVATION ID
    // =========================================================================

    AIH.Perception._nextObservationId = function() {

        AIH.Perception._observationSequence += 1;

        return AIH.Perception._observationSequence;
    };

    // =========================================================================
    // SNAPSHOT ID
    // =========================================================================

    AIH.Perception._nextSnapshotId = function() {

        AIH.Perception._snapshotSequence += 1;

        return AIH.Perception._snapshotSequence;
    };

    // =========================================================================
    // CREATE OBSERVATION
    // =========================================================================

    AIH.Perception._createObservation = function(
        category,
        type,
        data
    ) {

        return {
            observationId:
                AIH.Perception._nextObservationId(),

            snapshotId:
                AIH.Perception._currentSnapshotId,

            timestamp:
                Date.now(),

            source:
                "world_state",

            category:
                String(category || "unknown"),

            type:
                String(type || "unknown"),

            data:
                AIH.Perception._copy(
                    data || {}
                )
        };
    };

    // =========================================================================
    // HERO OBSERVATIONS
    // =========================================================================

    AIH.Perception._observeHero = function(world) {

        var hero;

        if (!world) {
            return;
        }

        hero = world.hero;

        if (!hero || !hero.exists) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "hero",
                "hero_identity",
                {
                    actorId: hero.actorId,
                    name: hero.name,
                    level: hero.level
                }
            )
        );

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "hero",
                "hero_condition",
                {
                    hp: hero.hp,
                    mhp: hero.mhp,
                    mp: hero.mp,
                    mmp: hero.mmp,
                    tp: hero.tp,
                    maxTp: hero.maxTp
                }
            )
        );

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "hero",
                "hero_attributes",
                {
                    atk: hero.atk,
                    def: hero.def,
                    mat: hero.mat,
                    mdf: hero.mdf,
                    agi: hero.agi,
                    luk: hero.luk
                }
            )
        );

        AIH.Perception._observeStates(hero);

        AIH.Perception._observeEquipment(hero);
    };

    // =========================================================================
    // HERO STATES
    // =========================================================================

    AIH.Perception._observeStates = function(hero) {

        var states;
        var i;
        var state;

        if (!hero) {
            return;
        }

        states = hero.states || [];

        for (i = 0; i < states.length; i++) {

            state = states[i];

            if (!state) {
                continue;
            }

            AIH.Perception._observations.push(
                AIH.Perception._createObservation(
                    "hero",
                    "state_present",
                    {
                        stateId: state.id,
                        stateName: state.name
                    }
                )
            );
        }
    };

    // =========================================================================
    // EQUIPMENT
    // =========================================================================

    AIH.Perception._observeEquipment = function(hero) {

        var equips;
        var i;
        var equipment;

        if (!hero) {
            return;
        }

        equips = hero.equips || [];

        for (i = 0; i < equips.length; i++) {

            equipment = equips[i];

            if (!equipment) {
                continue;
            }

            if (equipment.exists === false) {
                continue;
            }

            AIH.Perception._observations.push(
                AIH.Perception._createObservation(
                    "equipment",
                    "equipment_present",
                    {
                        slotIndex:
                            equipment.slotIndex,

                        itemId:
                            equipment.id,

                        name:
                            equipment.name,

                        type:
                            equipment.type,

                        weight:
                            equipment.weight
                    }
                )
            );
        }
    };

    // =========================================================================
    // LOCATION OBSERVATIONS
    // =========================================================================

    AIH.Perception._observeLocation = function(world) {

        var location;

        if (!world) {
            return;
        }

        location = world.location;

        if (!location) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "location",
                "location_current",
                {
                    mapId:
                        location.mapId,

                    mapName:
                        location.mapName,

                    x:
                        location.x,

                    y:
                        location.y
                }
            )
        );
    };

    // =========================================================================
    // RESOURCE OBSERVATIONS
    // =========================================================================

    AIH.Perception._observeResources = function(world) {

        var resources;

        if (!world) {
            return;
        }

        resources = world.resources;

        if (!resources) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "resources",
                "resources_current",
                {
                    gold:
                        resources.gold,

                    itemCount:
                        resources.itemCount
                }
            )
        );
    };

    // =========================================================================
    // INVENTORY OBSERVATION
    // =========================================================================

    AIH.Perception._observeInventory = function(world) {

        var inventory;
        var items;
        var i;
        var item;

        if (!world) {
            return;
        }

        inventory = world.inventory;

        if (!inventory) {
            return;
        }

        items = inventory.items || [];

        for (i = 0; i < items.length; i++) {

            item = items[i];

            if (!item) {
                continue;
            }

            AIH.Perception._observations.push(
                AIH.Perception._createObservation(
                    "inventory",
                    "item_present",
                    {
                        itemId:
                            item.id,

                        name:
                            item.name,

                        quantity:
                            item.quantity
                    }
                )
            );
        }
    };

    // =========================================================================
    // TIME OBSERVATION
    // =========================================================================

    AIH.Perception._observeTime = function(world) {

        var time;

        if (!world) {
            return;
        }

        time = world.time;

        if (!time) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "time",
                "framework_time",
                {
                    frameworkTimestamp:
                        time.frameworkTimestamp
                }
            )
        );
    };

    // =========================================================================
    // ENVIRONMENT OBSERVATION
    // =========================================================================

    AIH.Perception._observeEnvironment = function(world) {

        var environment;

        if (!world) {
            return;
        }

        environment = world.environment;

        if (!environment) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "environment",
                "environment_current",
                {
                    mapId:
                        environment.mapId,

                    mapName:
                        environment.mapName
                }
            )
        );
    };

    // =========================================================================
    // DUNGEON OBSERVATION
    // =========================================================================

    AIH.Perception._observeDungeon = function(world) {

        var dungeon;

        if (!world) {
            return;
        }

        dungeon = world.dungeon;

        if (!dungeon) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "dungeon",
                "dungeon_current",
                AIH.Perception._copy(
                    dungeon
                )
            )
        );
    };

    // =========================================================================
    // PARTY OBSERVATION
    // =========================================================================

    AIH.Perception._observeParty = function(world) {

        var party;

        if (!world) {
            return;
        }

        party = world.party;

        if (!party) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "party",
                "party_current",
                AIH.Perception._copy(
                    party
                )
            )
        );
    };

    // =========================================================================
    // PERSISTENT AI STATE OBSERVATION
    // =========================================================================
    //
    // Only identity-level information is exposed here.
    //
    // Personality, values, beliefs and emotions remain owned by their
    // respective future modules.
    //
    // This prevents Perception from becoming a hidden psychology system.
    // =========================================================================

    AIH.Perception._observeIdentityState = function() {

        var actorId;
        var name;

        if (
            !AIH.State ||
            typeof AIH.State.actorId !== "function"
        ) {
            return;
        }

        actorId =
            AIH.State.actorId();

        name = "";

        if (
            typeof AIH.State.name === "function"
        ) {
            name =
                AIH.State.name();
        }

        if (
            actorId === 0 &&
            name === ""
        ) {
            return;
        }

        AIH.Perception._observations.push(
            AIH.Perception._createObservation(
                "identity",
                "persistent_identity",
                {
                    actorId:
                        actorId,

                    name:
                        name
                }
            )
        );
    };

    // =========================================================================
    // BUILD OBSERVATIONS
    // =========================================================================

    AIH.Perception.observe = function() {

        var world;
        var observations;

        if (!AIH.Perception._initialized) {
            AIH.Perception.initialize();
        }

        world =
            AIH.World.current();

        if (!world) {

            AIH.Perception._observations = [];

            return [];
        }

        AIH.Perception._currentSnapshotId =
            AIH.Perception._nextSnapshotId();

        AIH.Perception._observations = [];

        AIH.Perception._observeHero(world);

        AIH.Perception._observeLocation(world);

        AIH.Perception._observeResources(world);

        AIH.Perception._observeInventory(world);

        AIH.Perception._observeTime(world);

        AIH.Perception._observeEnvironment(world);

        AIH.Perception._observeDungeon(world);

        AIH.Perception._observeParty(world);

        AIH.Perception._observeIdentityState();

        AIH.Perception._lastWorldSignature =
            JSON.stringify(world);

        observations =
            AIH.Perception._copyObservations();

        if (
            AIH.Events &&
            typeof AIH.Events.emit === "function"
        ) {

            AIH.Events.emit(
                "PERCEPTION_UPDATED",
                {
                    snapshotId:
                        AIH.Perception._currentSnapshotId,

                    observations:
                        observations
                }
            );
        }

        AIH.Debug.log(
            "Perception updated. Observation count: " +
            String(observations.length)
        );

        return observations;
    };

    // =========================================================================
    // COPY OBSERVATIONS
    // =========================================================================

    AIH.Perception._copyObservations = function() {

        return AIH.Perception._copy(
            AIH.Perception._observations
        );
    };

    // =========================================================================
    // CURRENT OBSERVATIONS
    // =========================================================================

    AIH.Perception.current = function() {

        return AIH.Perception._copyObservations();
    };

    // =========================================================================
    // CURRENT SNAPSHOT ID
    // =========================================================================

    AIH.Perception.snapshotId = function() {

        return AIH.Perception._currentSnapshotId;
    };

    // =========================================================================
    // LAST WORLD SIGNATURE
    // =========================================================================

    AIH.Perception.lastWorldSignature = function() {

        return AIH.Perception._lastWorldSignature;
    };

    // =========================================================================
    // CLEAR
    // =========================================================================

    AIH.Perception.clear = function() {

        AIH.Perception._observations = [];

        AIH.Debug.log(
            "Perception observations cleared."
        );
    };

    // =========================================================================
    // OBSERVATION COUNT
    // =========================================================================

    AIH.Perception.count = function() {

        return AIH.Perception._observations.length;
    };

    // =========================================================================
    // FIND BY TYPE
    // =========================================================================

    AIH.Perception.findByType = function(type) {

        var result;
        var i;
        var observation;

        result = [];

        for (
            i = 0;
            i < AIH.Perception._observations.length;
            i++
        ) {

            observation =
                AIH.Perception._observations[i];

            if (
                observation.type ===
                type
            ) {

                result.push(
                    observation
                );
            }
        }

        return AIH.Perception._copy(
            result
        );
    };

    // =========================================================================
    // FIND BY CATEGORY
    // =========================================================================

    AIH.Perception.findByCategory = function(category) {

        var result;
        var i;
        var observation;

        result = [];

        for (
            i = 0;
            i < AIH.Perception._observations.length;
            i++
        ) {

            observation =
                AIH.Perception._observations[i];

            if (
                observation.category ===
                category
            ) {

                result.push(
                    observation
                );
            }
        }

        return AIH.Perception._copy(
            result
        );
    };

    // =========================================================================
    // FIND BY SNAPSHOT
    // =========================================================================

    AIH.Perception.findBySnapshot = function(
        snapshotId
    ) {

        var result;
        var i;
        var observation;

        snapshotId =
            Number(snapshotId);

        result = [];

        for (
            i = 0;
            i < AIH.Perception._observations.length;
            i++
        ) {

            observation =
                AIH.Perception._observations[i];

            if (
                observation.snapshotId ===
                snapshotId
            ) {

                result.push(
                    observation
                );
            }
        }

        return AIH.Perception._copy(
            result
        );
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Perception",
        {
            version:
                AIH.Perception.VERSION,

            initialize: function() {
                AIH.Perception.initialize();
            },

            observe: function() {
                return AIH.Perception.observe();
            },

            current: function() {
                return AIH.Perception.current();
            },

            snapshotId: function() {
                return AIH.Perception.snapshotId();
            }
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - OBSERVE
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Perception",
        "Observe",
        function() {

            AIH.Perception.observe();
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - SHOW
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Perception",
        "Show Observations",
        function() {

            AIH.Debug.inspect(
                "Current AIH observations:",
                AIH.Perception.current()
            );
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - CLEAR
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Perception",
        "Clear Observations",
        function() {

            AIH.Perception.clear();
        }
    );

    // =========================================================================
    // WORLD EVENT CONNECTION
    // =========================================================================

    AIH.Events.on(
        "WORLD_STATE_CHANGED",
        function() {

            if (!AIH.Perception._initialized) {
                AIH.Perception.initialize();
            }

            AIH.Perception.observe();
        }
    );

    // =========================================================================
    // RPG MAKER GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_Perception_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects = function() {

        _AIH_Perception_createGameObjects.call(this);

        AIH.Perception.initialize();
    };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Perception_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame = function() {

        _AIH_Perception_setupNewGame.call(this);

        AIH.Perception.initialize();

        AIH.Perception.observe();
    };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Perception_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents = function(contents) {

        _AIH_Perception_extractSaveContents.call(
            this,
            contents
        );

        AIH.Perception.initialize();

        AIH.Perception.observe();
    };

})();