/*:
 * @plugindesc AI Hero Framework - NPC Relationships v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - NPC RELATIONSHIPS
 * ============================================================================
 *
 * STEP 15
 *
 * Stores the heroine's relationship with individual NPCs.
 *
 * ============================================================================
 *
 * FACTION REPUTATION VS NPC RELATIONSHIP
 *
 * Faction Reputation:
 *
 *     How a larger group generally perceives the heroine.
 *
 * NPC Relationship:
 *
 *     How one particular NPC relates to the heroine.
 *
 * These are deliberately separate systems.
 *
 * Example:
 *
 *     Adventurer Guild reputation: +70
 *
 *     Guildmaster Helena:
 *         trust: +80
 *         respect: +90
 *         affection: +30
 *
 *     Rival adventurer:
 *         trust: -40
 *         respect: +20
 *         hostility: +60
 *
 * ============================================================================
 *
 * RELATIONSHIP VARIABLES
 *
 * familiarity
 *     How well the NPC knows the heroine.
 *
 * trust
 *     How much the NPC trusts the heroine.
 *
 * respect
 *     How highly the NPC regards the heroine.
 *
 * affection
 *     Personal positive attachment toward the heroine.
 *
 * fear
 *     How intimidated or frightened the NPC is by the heroine.
 *
 * hostility
 *     Personal antagonism toward the heroine.
 *
 * dominance
 *     How dominant the NPC is in the relationship.
 *
 * submissiveness
 *     How submissive the NPC is toward the heroine.
 *
 * All relationship axes range from -100 to +100 except familiarity,
 * which ranges from 0 to 100.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This module does NOT:
 *
 * - determine NPC behavior
 * - generate dialogue
 * - determine whether dialogue is insulting
 * - make the heroine attack anybody
 * - modify faction reputation automatically
 * - modify personality
 * - modify values
 * - modify emotions
 * - create beliefs
 * - create memories
 * - call an LLM
 * - execute actions
 *
 * It only stores individual NPC relationships and their history.
 *
 * ============================================================================
 *
 * NPC IDENTIFICATION
 *
 * NPC IDs are strings rather than numeric IDs.
 *
 * This allows future systems to identify NPCs using:
 *
 *     "guildmaster_helena"
 *     "merchant_aldric"
 *     "orc_chief_01"
 *
 * or any other identifier appropriate to the game.
 *
 * ============================================================================
 *
 * @command Show All
 * @text Show All Relationships
 * @desc Displays all NPC relationships.
 *
 * @command Clear
 * @text Clear Relationships
 * @desc Clears all NPC relationships.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Relationships =
        AIH.Relationships || {};

    AIH.Relationships.VERSION =
        "0.1.0";

    AIH.Relationships.SCHEMA_VERSION =
        1;

    AIH.Relationships._initialized =
        false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Relationships._copy =
        function(value) {

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
    // CLAMP -100 TO +100
    // =========================================================================

    AIH.Relationships._clamp =
        function(value) {

            value =
                Number(value);

            if (isNaN(value)) {
                return 0;
            }

            if (value < -100) {
                return -100;
            }

            if (value > 100) {
                return 100;
            }

            return value;
        };

    // =========================================================================
    // CLAMP 0 TO 100
    // =========================================================================

    AIH.Relationships._clampFamiliarity =
        function(value) {

            value =
                Number(value);

            if (isNaN(value)) {
                return 0;
            }

            if (value < 0) {
                return 0;
            }

            if (value > 100) {
                return 100;
            }

            return value;
        };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================

    AIH.Relationships._state =
        function() {

            if (
                typeof AIH.State ===
                "undefined" ||
                !AIH.State._internal
            ) {

                return null;
            }

            return AIH.State._internal();
        };

    // =========================================================================
    // CREATE RELATIONSHIP
    // =========================================================================

    AIH.Relationships._create =
        function(
            npcId,
            name,
            faction
        ) {

            return {

                npcId:
                    String(npcId),

                name:
                    String(name || npcId),

                faction:
                    String(faction || ""),

                familiarity:
                    0,

                trust:
                    0,

                respect:
                    0,

                affection:
                    0,

                fear:
                    0,

                hostility:
                    0,

                dominance:
                    0,

                submissiveness:
                    0,

                createdAt:
                    Date.now(),

                updatedAt:
                    Date.now(),

                history: []
            };
        };

    // =========================================================================
    // ENSURE CONTAINER
    // =========================================================================

    AIH.Relationships._ensure =
        function() {

            var state;

            state =
                AIH.Relationships._state();

            if (!state) {
                return null;
            }

            if (!state.relationships) {

                state.relationships = {

                    schemaVersion:
                        AIH.Relationships.SCHEMA_VERSION,

                    npcs: {}
                };
            }

            /*
             * Migration for an older array-based placeholder.
             */

            if (
                Array.isArray(
                    state.relationships
                )
            ) {

                state.relationships = {

                    schemaVersion:
                        AIH.Relationships.SCHEMA_VERSION,

                    npcs: {}
                };
            }

            if (
                state.relationships.schemaVersion ===
                undefined
            ) {

                state.relationships.schemaVersion =
                    AIH.Relationships.SCHEMA_VERSION;
            }

            if (
                !state.relationships.npcs ||
                typeof state.relationships.npcs !==
                    "object"
            ) {

                state.relationships.npcs = {};
            }

            return state.relationships;
        };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Relationships.initialize =
        function() {

            var relationships;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return;
            }

            AIH.Relationships._initialized =
                true;

            AIH.Debug.log(
                "NPC relationship system initialized."
            );
        };

    // =========================================================================
    // CREATE / REGISTER NPC
    // =========================================================================
    //
    // Creating an NPC relationship does not mean the heroine likes or dislikes
    // the NPC.
    //
    // All relationship axes begin neutral.
    //
    // =========================================================================

    AIH.Relationships.add =
        function(
            npcId,
            name,
            faction
        ) {

            var relationships;
            var id;
            var relationship;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return null;
            }

            id =
                String(
                    npcId || ""
                ).trim();

            if (!id) {
                return null;
            }

            if (
                relationships.npcs[id]
            ) {

                return AIH.Relationships._copy(
                    relationships.npcs[id]
                );
            }

            relationship =
                AIH.Relationships._create(
                    id,
                    name,
                    faction
                );

            relationships.npcs[id] =
                relationship;

            AIH.Events.emit(
                "NPC_RELATIONSHIP_CREATED",
                {
                    relationship:
                        AIH.Relationships._copy(
                            relationship
                        )
                }
            );

            return AIH.Relationships._copy(
                relationship
            );
        };

    // =========================================================================
    // REMOVE NPC
    // =========================================================================

    AIH.Relationships.remove =
        function(npcId) {

            var relationships;
            var id;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return false;
            }

            id =
                String(
                    npcId || ""
                ).trim();

            if (
                !relationships.npcs[id]
            ) {

                return false;
            }

            delete relationships.npcs[id];

            return true;
        };

    // =========================================================================
    // GET NPC
    // =========================================================================

    AIH.Relationships.get =
        function(npcId) {

            var relationships;
            var id;
            var relationship;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return null;
            }

            id =
                String(
                    npcId || ""
                );

            relationship =
                relationships.npcs[id];

            if (!relationship) {
                return null;
            }

            return AIH.Relationships._copy(
                relationship
            );
        };

    // =========================================================================
    // GET ALL
    // =========================================================================

    AIH.Relationships.all =
        function() {

            var relationships;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return {};
            }

            return AIH.Relationships._copy(
                relationships.npcs
            );
        };

    // =========================================================================
    // COUNT
    // =========================================================================

    AIH.Relationships.count =
        function() {

            var relationships;
            var count;
            var key;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return 0;
            }

            count = 0;

            for (
                key in relationships.npcs
            ) {

                if (
                    Object.prototype.hasOwnProperty.call(
                        relationships.npcs,
                        key
                    )
                ) {

                    count += 1;
                }
            }

            return count;
        };

    // =========================================================================
    // GET AXIS
    // =========================================================================

    AIH.Relationships.getAxis =
        function(
            npcId,
            axis
        ) {

            var relationship;

            relationship =
                AIH.Relationships.get(
                    npcId
                );

            if (!relationship) {
                return 0;
            }

            if (
                axis !== "familiarity" &&
                axis !== "trust" &&
                axis !== "respect" &&
                axis !== "affection" &&
                axis !== "fear" &&
                axis !== "hostility" &&
                axis !== "dominance" &&
                axis !== "submissiveness"
            ) {

                return 0;
            }

            return Number(
                relationship[axis]
            );
        };

    // =========================================================================
    // SET AXIS
    // =========================================================================

    AIH.Relationships.setAxis =
        function(
            npcId,
            axis,
            value,
            reason
        ) {

            var relationships;
            var relationship;
            var oldValue;
            var newValue;
            var historyRecord;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return false;
            }

            npcId =
                String(
                    npcId || ""
                );

            relationship =
                relationships.npcs[
                    npcId
                ];

            if (!relationship) {
                return false;
            }

            if (
                axis !== "familiarity" &&
                axis !== "trust" &&
                axis !== "respect" &&
                axis !== "affection" &&
                axis !== "fear" &&
                axis !== "hostility" &&
                axis !== "dominance" &&
                axis !== "submissiveness"
            ) {

                return false;
            }

            oldValue =
                Number(
                    relationship[axis]
                );

            if (
                axis === "familiarity"
            ) {

                newValue =
                    AIH.Relationships._clampFamiliarity(
                        value
                    );

            } else {

                newValue =
                    AIH.Relationships._clamp(
                        value
                    );
            }

            relationship[axis] =
                newValue;

            relationship.updatedAt =
                Date.now();

            historyRecord = {

                timestamp:
                    Date.now(),

                axis:
                    axis,

                previous:
                    oldValue,

                value:
                    newValue,

                reason:
                    String(
                        reason || ""
                    )
            };

            relationship.history.push(
                historyRecord
            );

            AIH.Events.emit(
                "NPC_RELATIONSHIP_CHANGED",
                {
                    npcId:
                        npcId,

                    axis:
                        axis,

                    previous:
                        oldValue,

                    value:
                        newValue,

                    reason:
                        String(
                            reason || ""
                        )
                }
            );

            return true;
        };

    // =========================================================================
    // MODIFY AXIS
    // =========================================================================

    AIH.Relationships.modifyAxis =
        function(
            npcId,
            axis,
            amount,
            reason
        ) {

            var current;
            var delta;
            var next;

            current =
                AIH.Relationships.getAxis(
                    npcId,
                    axis
                );

            delta =
                Number(amount);

            if (isNaN(delta)) {
                return current;
            }

            if (
                axis === "familiarity"
            ) {

                next =
                    AIH.Relationships._clampFamiliarity(
                        current + delta
                    );

            } else {

                next =
                    AIH.Relationships._clamp(
                        current + delta
                    );
            }

            AIH.Relationships.setAxis(
                npcId,
                axis,
                next,
                reason
            );

            return next;
        };

    // =========================================================================
    // SET COMPLETE RELATIONSHIP
    // =========================================================================

    AIH.Relationships.set =
        function(
            npcId,
            familiarity,
            trust,
            respect,
            affection,
            fear,
            hostility,
            dominance,
            submissiveness,
            reason
        ) {

            var success;

            success = true;

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "familiarity",
                    familiarity,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "trust",
                    trust,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "respect",
                    respect,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "affection",
                    affection,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "fear",
                    fear,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "hostility",
                    hostility,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "dominance",
                    dominance,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Relationships.setAxis(
                    npcId,
                    "submissiveness",
                    submissiveness,
                    reason
                )
            ) {

                success = false;
            }

            return success;
        };

    // =========================================================================
    // MODIFY COMPLETE RELATIONSHIP
    // =========================================================================

    AIH.Relationships.modify =
        function(
            npcId,
            familiarityDelta,
            trustDelta,
            respectDelta,
            affectionDelta,
            fearDelta,
            hostilityDelta,
            dominanceDelta,
            submissivenessDelta,
            reason
        ) {

            return {

                familiarity:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "familiarity",
                        familiarityDelta,
                        reason
                    ),

                trust:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "trust",
                        trustDelta,
                        reason
                    ),

                respect:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "respect",
                        respectDelta,
                        reason
                    ),

                affection:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "affection",
                        affectionDelta,
                        reason
                    ),

                fear:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "fear",
                        fearDelta,
                        reason
                    ),

                hostility:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "hostility",
                        hostilityDelta,
                        reason
                    ),

                dominance:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "dominance",
                        dominanceDelta,
                        reason
                    ),

                submissiveness:
                    AIH.Relationships.modifyAxis(
                        npcId,
                        "submissiveness",
                        submissivenessDelta,
                        reason
                    )
            };
        };

    // =========================================================================
    // FIND BY FACTION
    // =========================================================================

    AIH.Relationships.findByFaction =
        function(faction) {

            var relationships;
            var result;
            var key;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return [];
            }

            faction =
                String(
                    faction || ""
                );

            result = [];

            for (
                key in relationships.npcs
            ) {

                if (
                    !Object.prototype.hasOwnProperty.call(
                        relationships.npcs,
                        key
                    )
                ) {

                    continue;
                }

                if (
                    relationships.npcs[key].faction ===
                    faction
                ) {

                    result.push(
                        relationships.npcs[key]
                    );
                }
            }

            return AIH.Relationships._copy(
                result
            );
        };

    // =========================================================================
    // RECORD HISTORY EVENT
    // =========================================================================

    AIH.Relationships.recordEvent =
        function(
            npcId,
            eventData
        ) {

            var relationships;
            var relationship;

            relationships =
                AIH.Relationships._ensure();

            if (!relationships) {
                return false;
            }

            npcId =
                String(
                    npcId || ""
                );

            relationship =
                relationships.npcs[
                    npcId
                ];

            if (!relationship) {
                return false;
            }

            relationship.history.push(
                AIH.Relationships._copy(
                    eventData || {}
                )
            );

            relationship.updatedAt =
                Date.now();

            return true;
        };

    // =========================================================================
    // HISTORY
    // =========================================================================

    AIH.Relationships.history =
        function(npcId) {

            var relationship;

            relationship =
                AIH.Relationships.get(
                    npcId
                );

            if (!relationship) {
                return [];
            }

            return AIH.Relationships._copy(
                relationship.history
            );
        };

    // =========================================================================
    // CLEAR ALL
    // =========================================================================

    AIH.Relationships.clear =
        function() {

            var state;

            state =
                AIH.Relationships._state();

            if (!state) {
                return false;
            }

            state.relationships = {

                schemaVersion:
                    AIH.Relationships.SCHEMA_VERSION,

                npcs: {}
            };

            AIH.Events.emit(
                "NPC_RELATIONSHIPS_CLEARED",
                {}
            );

            AIH.Debug.log(
                "NPC relationships cleared."
            );

            return true;
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Relationships",
        {
            version:
                AIH.Relationships.VERSION,

            initialize:
                function() {

                    AIH.Relationships.initialize();
                },

            get:
                function(npcId) {

                    return AIH.Relationships.get(
                        npcId
                    );
                },

            all:
                function() {

                    return AIH.Relationships.all();
                },

            add:
                function(
                    npcId,
                    name,
                    faction
                ) {

                    return AIH.Relationships.add(
                        npcId,
                        name,
                        faction
                    );
                },

            setAxis:
                function(
                    npcId,
                    axis,
                    value,
                    reason
                ) {

                    return AIH.Relationships.setAxis(
                        npcId,
                        axis,
                        value,
                        reason
                    );
                },

            modifyAxis:
                function(
                    npcId,
                    axis,
                    amount,
                    reason
                ) {

                    return AIH.Relationships.modifyAxis(
                        npcId,
                        axis,
                        amount,
                        reason
                    );
                }
        }
    );

    // =========================================================================
    // SHOW ALL
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Relationships",
        "Show All",
        function() {

            AIH.Debug.inspect(
                "Current NPC relationships:",
                AIH.Relationships.all()
            );
        }
    );

    // =========================================================================
    // CLEAR
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Relationships",
        "Clear",
        function() {

            AIH.Relationships.clear();
        }
    );

    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_Relationships_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_Relationships_createGameObjects.call(
                this
            );

            AIH.Relationships.initialize();
        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Relationships_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_Relationships_setupNewGame.call(
                this
            );

            AIH.Relationships._initialized =
                false;

            AIH.Relationships.initialize();
        };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Relationships_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_Relationships_extractSaveContents.call(
                this,
                contents
            );

            AIH.Relationships._initialized =
                false;

            AIH.Relationships.initialize();
        };

})();