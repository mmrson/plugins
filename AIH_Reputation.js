/*:
 * @plugindesc AI Hero Framework - Faction Reputation v0.2.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - FACTION REPUTATION
 * ============================================================================
 *
 * STEP 14
 *
 * Stores the heroine's reputation with individual factions.
 *
 * Reputation is NOT one global number.
 *
 * Every faction has its own independent three-dimensional reputation state.
 *
 * ============================================================================
 *
 * REPUTATION MODEL
 *
 * Each faction has three independent coordinates:
 *
 * reputation
 *     General positive/negative standing with the faction.
 *
 * lewdness
 *     How sexually/lewdly the faction generally perceives the heroine.
 *
 * dominance
 *     How dominant/assertive versus submissive/meek the faction perceives
 *     the heroine to be.
 *
 * All three axes range from -100 to +100.
 *
 * Therefore every faction effectively has a three-dimensional reputation
 * position:
 *
 *     X = reputation
 *     Y = lewdness
 *     Z = dominance
 *
 * ============================================================================
 *
 * AXIS INTERPRETATION
 *
 * reputation:
 *
 *     -100 = extremely hostile reputation
 *        0 = neutral
 *     +100 = extremely favorable reputation
 *
 * lewdness:
 *
 *     -100 = perceived as extremely conservative/chaste
 *        0 = no particular reputation
 *     +100 = perceived as extremely lewd
 *
 * dominance:
 *
 *     -100 = strongly perceived as submissive/meek
 *        0 = no strong reputation
 *     +100 = strongly perceived as dominant/assertive
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * Reputation describes what a faction has learned about the heroine.
 *
 * Reputation is NOT the same thing as:
 *
 * Personality
 *     What she tends to be like.
 *
 * Values
 *     What she considers important.
 *
 * Emotions
 *     How she currently feels.
 *
 * Beliefs
 *     What she believes about the world.
 *
 * Reputation is the social consequence/history of her behavior.
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - make decisions
 * - create beliefs
 * - modify personality
 * - modify values
 * - modify emotions
 * - interpret NPC dialogue
 * - determine whether an NPC is insulting her
 * - determine whether she attacks somebody
 * - call the LLM
 * - execute actions
 *
 * Other systems may use reputation when determining:
 *
 * - NPC dialogue
 * - NPC treatment
 * - available jobs
 * - available quests
 * - prices
 * - opportunities
 * - social respect
 * - intimidation
 * - willingness to exploit her
 * - willingness to challenge her
 * - faction reactions
 *
 * ============================================================================
 *
 * FACTIONS
 *
 * The default faction list is intentionally centralized and easy to modify.
 *
 * ============================================================================
 *
 * @command Show All
 * @text Show All Reputation
 * @desc Displays all faction reputation.
 *
 * @command Show Faction
 * @text Show Faction
 * @desc Displays Adventurer faction reputation.
 *
 * @command Reset
 * @text Reset Reputation
 * @desc Resets all faction reputation.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Reputation =
        AIH.Reputation || {};

    AIH.Reputation.VERSION =
        "0.2.0";

    AIH.Reputation.SCHEMA_VERSION =
        2;

    AIH.Reputation._initialized =
        false;

    // =========================================================================
    // DEFAULT FACTIONS
    // =========================================================================
    //
    // Add or remove factions here.
    //
    // Existing saved factions are preserved.
    //
    // =========================================================================

    AIH.Reputation.DEFAULT_FACTIONS = [

        "Church",
        "Adventurers",
        "Adventurer Guild",
        "Nobles",
        "Street",
        "Merchants",
        "Orcs",
        "Goblins",
        "Elfs",
        "Dwarfs",
        "Slimes",
        "Farm",
        "Minotaurs",
        "Mages",
        "Warriors",
        "Tavern",
        "Gentlemens Club"
    ];

    // =========================================================================
    // AXES
    // =========================================================================

    AIH.Reputation.AXES = [

        "reputation",
        "lewdness",
        "dominance"
    ];

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Reputation._copy = function(value) {

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
    // CLAMP
    // =========================================================================

    AIH.Reputation._clamp =
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
    // VALID AXIS
    // =========================================================================

    AIH.Reputation._validAxis =
        function(axis) {

            return (
                axis === "reputation" ||
                axis === "lewdness" ||
                axis === "dominance"
            );
        };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================

    AIH.Reputation._state =
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
    // DEFAULT FACTION RECORD
    // =========================================================================

    AIH.Reputation._createFaction =
        function(name) {

            return {

                name:
                    String(name),

                reputation:
                    0,

                lewdness:
                    0,

                dominance:
                    0,

                createdAt:
                    Date.now(),

                updatedAt:
                    Date.now(),

                history: []
            };
        };

    // =========================================================================
    // NORMALIZE FACTION
    // =========================================================================
    //
    // Protects against malformed or older save data.
    //
    // Also migrates the earlier "standing" axis terminology.
    //
    // =========================================================================

    AIH.Reputation._normalizeFaction =
        function(
            faction,
            name
        ) {

            var axis;

            if (
                !faction ||
                typeof faction !== "object"
            ) {

                return AIH.Reputation._createFaction(
                    name
                );
            }

            faction.name =
                String(
                    faction.name ||
                    name
                );

            /*
             * Earlier framework versions used "standing".
             *
             * Preserve it if it exists but the canonical "reputation"
             * coordinate has not yet been populated.
             */

            if (
                faction.reputation ===
                undefined &&
                faction.standing !==
                undefined
            ) {

                faction.reputation =
                    faction.standing;
            }

            if (
                faction.reputation ===
                undefined
            ) {

                faction.reputation = 0;
            }

            if (
                faction.lewdness ===
                undefined
            ) {

                faction.lewdness = 0;
            }

            if (
                faction.dominance ===
                undefined
            ) {

                faction.dominance = 0;
            }

            for (
                axis = 0;
                axis < AIH.Reputation.AXES.length;
                axis++
            ) {

                faction[
                    AIH.Reputation.AXES[axis]
                ] =
                    AIH.Reputation._clamp(
                        faction[
                            AIH.Reputation.AXES[axis]
                        ]
                    );
            }

            if (
                !faction.createdAt
            ) {

                faction.createdAt =
                    Date.now();
            }

            if (
                !faction.updatedAt
            ) {

                faction.updatedAt =
                    Date.now();
            }

            if (
                !Array.isArray(
                    faction.history
                )
            ) {

                faction.history = [];
            }

            return faction;
        };

    // =========================================================================
    // ENSURE CONTAINER
    // =========================================================================

    AIH.Reputation._ensure =
        function() {

            var state;
            var defaults;
            var i;
            var factionName;
            var factions;
            var key;

            state =
                AIH.Reputation._state();

            if (!state) {
                return null;
            }

            if (!state.reputation) {

                state.reputation = {

                    schemaVersion:
                        AIH.Reputation.SCHEMA_VERSION,

                    factions: {}
                };
            }

            /*
             * Legacy malformed/array structure.
             */

            if (
                Array.isArray(
                    state.reputation
                )
            ) {

                state.reputation = {

                    schemaVersion:
                        AIH.Reputation.SCHEMA_VERSION,

                    factions: {}
                };
            }

            if (
                typeof state.reputation !==
                "object"
            ) {

                state.reputation = {

                    schemaVersion:
                        AIH.Reputation.SCHEMA_VERSION,

                    factions: {}
                };
            }

            if (
                state.reputation.schemaVersion ===
                undefined
            ) {

                state.reputation.schemaVersion =
                    1;
            }

            if (
                !state.reputation.factions ||
                typeof state.reputation.factions !==
                "object"
            ) {

                state.reputation.factions = {};
            }

            /*
             * Normalize existing saved factions.
             */

            factions =
                state.reputation.factions;

            for (key in factions) {

                if (
                    Object.prototype.hasOwnProperty.call(
                        factions,
                        key
                    )
                ) {

                    factions[key] =
                        AIH.Reputation._normalizeFaction(
                            factions[key],
                            key
                        );
                }
            }

            /*
             * Ensure configured factions exist.
             */

            defaults =
                AIH.Reputation.DEFAULT_FACTIONS;

            for (
                i = 0;
                i < defaults.length;
                i++
            ) {

                factionName =
                    defaults[i];

                if (
                    !factions[
                        factionName
                    ]
                ) {

                    factions[
                        factionName
                    ] =
                        AIH.Reputation._createFaction(
                            factionName
                        );
                }
            }

            /*
             * Current schema.
             */

            state.reputation.schemaVersion =
                AIH.Reputation.SCHEMA_VERSION;

            return state.reputation;
        };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Reputation.initialize =
        function() {

            var reputation;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return;
            }

            AIH.Reputation._initialized =
                true;

            AIH.Debug.log(
                "Faction reputation system initialized."
            );
        };

    // =========================================================================
    // FACTION LIST
    // =========================================================================

    AIH.Reputation.factions =
        function() {

            var reputation;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return [];
            }

            return Object.keys(
                reputation.factions
            );
        };

    // =========================================================================
    // HAS FACTION
    // =========================================================================

    AIH.Reputation.hasFaction =
        function(name) {

            var reputation;
            var factionName;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return false;
            }

            factionName =
                String(name || "").trim();

            return !!reputation.factions[
                factionName
            ];
        };

    // =========================================================================
    // ADD FACTION
    // =========================================================================

    AIH.Reputation.addFaction =
        function(name) {

            var reputation;
            var factionName;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return false;
            }

            factionName =
                String(name || "").trim();

            if (!factionName) {
                return false;
            }

            if (
                reputation.factions[
                    factionName
                ]
            ) {

                return false;
            }

            reputation.factions[
                factionName
            ] =
                AIH.Reputation._createFaction(
                    factionName
                );

            return true;
        };

    // =========================================================================
    // REMOVE FACTION
    // =========================================================================

    AIH.Reputation.removeFaction =
        function(name) {

            var reputation;
            var factionName;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return false;
            }

            factionName =
                String(name || "").trim();

            if (
                !reputation.factions[
                    factionName
                ]
            ) {

                return false;
            }

            delete reputation.factions[
                factionName
            ];

            return true;
        };

    // =========================================================================
    // GET FACTION
    // =========================================================================

    AIH.Reputation.get =
        function(faction) {

            var reputation;
            var record;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return null;
            }

            faction =
                String(faction || "");

            record =
                reputation.factions[
                    faction
                ];

            if (!record) {
                return null;
            }

            return AIH.Reputation._copy(
                record
            );
        };

    // =========================================================================
    // GET ALL
    // =========================================================================

    AIH.Reputation.all =
        function() {

            var reputation;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return {};
            }

            return AIH.Reputation._copy(
                reputation.factions
            );
        };

    // =========================================================================
    // GET AXIS
    // =========================================================================

    AIH.Reputation.getAxis =
        function(
            faction,
            axis
        ) {

            var record;

            if (
                !AIH.Reputation._validAxis(
                    axis
                )
            ) {

                return 0;
            }

            record =
                AIH.Reputation.get(
                    faction
                );

            if (!record) {
                return 0;
            }

            return Number(
                record[axis]
            );
        };

    // =========================================================================
    // SET AXIS
    // =========================================================================

    AIH.Reputation.setAxis =
        function(
            faction,
            axis,
            value,
            reason
        ) {

            var reputation;
            var record;
            var oldValue;
            var newValue;
            var historyRecord;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return false;
            }

            faction =
                String(faction || "");

            record =
                reputation.factions[
                    faction
                ];

            if (!record) {
                return false;
            }

            if (
                !AIH.Reputation._validAxis(
                    axis
                )
            ) {

                return false;
            }

            oldValue =
                AIH.Reputation._clamp(
                    record[axis]
                );

            newValue =
                AIH.Reputation._clamp(
                    value
                );

            record[axis] =
                newValue;

            record.updatedAt =
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

                delta:
                    newValue -
                    oldValue,

                reason:
                    String(
                        reason || ""
                    )
            };

            record.history.push(
                historyRecord
            );

            AIH.Events.emit(
                "REPUTATION_CHANGED",
                {

                    faction:
                        faction,

                    axis:
                        axis,

                    previous:
                        oldValue,

                    value:
                        newValue,

                    delta:
                        newValue -
                        oldValue,

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

    AIH.Reputation.modifyAxis =
        function(
            faction,
            axis,
            amount,
            reason
        ) {

            var current;
            var delta;
            var next;

            current =
                AIH.Reputation.getAxis(
                    faction,
                    axis
                );

            delta =
                Number(amount);

            if (isNaN(delta)) {
                return current;
            }

            next =
                AIH.Reputation._clamp(
                    current + delta
                );

            AIH.Reputation.setAxis(
                faction,
                axis,
                next,
                reason
            );

            return next;
        };

    // =========================================================================
    // SET COMPLETE COORDINATE
    // =========================================================================

    AIH.Reputation.set =
        function(
            faction,
            reputation,
            lewdness,
            dominance,
            reason
        ) {

            var success;

            success = true;

            if (
                !AIH.Reputation.setAxis(
                    faction,
                    "reputation",
                    reputation,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Reputation.setAxis(
                    faction,
                    "lewdness",
                    lewdness,
                    reason
                )
            ) {

                success = false;
            }

            if (
                !AIH.Reputation.setAxis(
                    faction,
                    "dominance",
                    dominance,
                    reason
                )
            ) {

                success = false;
            }

            return success;
        };

    // =========================================================================
    // MODIFY COMPLETE COORDINATE
    // =========================================================================

    AIH.Reputation.modify =
        function(
            faction,
            reputationDelta,
            lewdnessDelta,
            dominanceDelta,
            reason
        ) {

            return {

                reputation:
                    AIH.Reputation.modifyAxis(
                        faction,
                        "reputation",
                        reputationDelta,
                        reason
                    ),

                lewdness:
                    AIH.Reputation.modifyAxis(
                        faction,
                        "lewdness",
                        lewdnessDelta,
                        reason
                    ),

                dominance:
                    AIH.Reputation.modifyAxis(
                        faction,
                        "dominance",
                        dominanceDelta,
                        reason
                    )
            };
        };

    // =========================================================================
    // MODIFY AXES BY OBJECT
    // =========================================================================
    //
    // More convenient for future event systems.
    //
    // Example:
    //
    // AIH.Reputation.modifyAxes(
    //     "Nobles",
    //     {
    //         reputation: -5,
    //         dominance: 8
    //     },
    //     "Refused a noble's demand."
    // );
    //
    // =========================================================================

    AIH.Reputation.modifyAxes =
        function(
            faction,
            changes,
            reason
        ) {

            var result;
            var axis;

            changes =
                changes || {};

            result = {};

            for (axis in changes) {

                if (
                    Object.prototype.hasOwnProperty.call(
                        changes,
                        axis
                    )
                ) {

                    if (
                        !AIH.Reputation._validAxis(
                            axis
                        )
                    ) {

                        continue;
                    }

                    result[axis] =
                        AIH.Reputation.modifyAxis(
                            faction,
                            axis,
                            changes[axis],
                            reason
                        );
                }
            }

            return result;
        };

    // =========================================================================
    // RECORD EVENT
    // =========================================================================
    //
    // Records a social event without necessarily changing coordinates.
    //
    // This is useful when the event itself matters for later analysis.
    //
    // =========================================================================

    AIH.Reputation.recordEvent =
        function(
            faction,
            eventData
        ) {

            var reputation;
            var record;
            var eventRecord;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return false;
            }

            faction =
                String(faction || "");

            record =
                reputation.factions[
                    faction
                ];

            if (!record) {
                return false;
            }

            eventRecord =
                AIH.Reputation._copy(
                    eventData || {}
                );

            eventRecord.timestamp =
                eventRecord.timestamp ||
                Date.now();

            record.history.push(
                eventRecord
            );

            record.updatedAt =
                Date.now();

            return true;
        };

    // =========================================================================
    // HISTORY
    // =========================================================================

    AIH.Reputation.history =
        function(faction) {

            var record;

            record =
                AIH.Reputation.get(
                    faction
                );

            if (!record) {
                return [];
            }

            return AIH.Reputation._copy(
                record.history
            );
        };

    // =========================================================================
    // CLEAR HISTORY
    // =========================================================================

    AIH.Reputation.clearHistory =
        function(faction) {

            var reputation;
            var record;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return false;
            }

            faction =
                String(faction || "");

            record =
                reputation.factions[
                    faction
                ];

            if (!record) {
                return false;
            }

            record.history = [];

            record.updatedAt =
                Date.now();

            return true;
        };

    // =========================================================================
    // RESET FACTION
    // =========================================================================

    AIH.Reputation.resetFaction =
        function(faction) {

            var reputation;
            var factionName;

            reputation =
                AIH.Reputation._ensure();

            if (!reputation) {
                return false;
            }

            factionName =
                String(faction || "");

            if (
                !reputation.factions[
                    factionName
                ]
            ) {

                return false;
            }

            reputation.factions[
                factionName
            ] =
                AIH.Reputation._createFaction(
                    factionName
                );

            return true;
        };

    // =========================================================================
    // RESET ALL
    // =========================================================================

    AIH.Reputation.reset =
        function() {

            var state;

            state =
                AIH.Reputation._state();

            if (!state) {
                return false;
            }

            state.reputation = {

                schemaVersion:
                    AIH.Reputation.SCHEMA_VERSION,

                factions: {}
            };

            AIH.Reputation._ensure();

            AIH.Events.emit(
                "REPUTATION_RESET",
                {}
            );

            AIH.Debug.log(
                "Faction reputation reset."
            );

            return true;
        };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Reputation",
        {

            version:
                AIH.Reputation.VERSION,

            initialize:
                function() {

                    AIH.Reputation.initialize();
                },

            get:
                function(faction) {

                    return AIH.Reputation.get(
                        faction
                    );
                },

            all:
                function() {

                    return AIH.Reputation.all();
                },

            factions:
                function() {

                    return AIH.Reputation.factions();
                },

            hasFaction:
                function(faction) {

                    return AIH.Reputation.hasFaction(
                        faction
                    );
                },

            setAxis:
                function(
                    faction,
                    axis,
                    value,
                    reason
                ) {

                    return AIH.Reputation.setAxis(
                        faction,
                        axis,
                        value,
                        reason
                    );
                },

            modifyAxis:
                function(
                    faction,
                    axis,
                    amount,
                    reason
                ) {

                    return AIH.Reputation.modifyAxis(
                        faction,
                        axis,
                        amount,
                        reason
                    );
                },

            modifyAxes:
                function(
                    faction,
                    changes,
                    reason
                ) {

                    return AIH.Reputation.modifyAxes(
                        faction,
                        changes,
                        reason
                    );
                }
        }
    );

    // =========================================================================
    // SHOW ALL
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Reputation",
        "Show All",
        function() {

            AIH.Debug.inspect(
                "Current faction reputation:",
                AIH.Reputation.all()
            );
        }
    );

    // =========================================================================
    // SHOW FACTION
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Reputation",
        "Show Faction",
        function() {

            AIH.Debug.inspect(
                "Faction reputation:",
                AIH.Reputation.get(
                    "Adventurers"
                )
            );
        }
    );

    // =========================================================================
    // RESET
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Reputation",
        "Reset",
        function() {

            AIH.Reputation.reset();
        }
    );

    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_Reputation_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_Reputation_createGameObjects.call(
                this
            );

            AIH.Reputation.initialize();
        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Reputation_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_Reputation_setupNewGame.call(
                this
            );

            AIH.Reputation._initialized =
                false;

            AIH.Reputation.initialize();
        };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Reputation_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_Reputation_extractSaveContents.call(
                this,
                contents
            );

            AIH.Reputation._initialized =
                false;

            AIH.Reputation.initialize();
        };

})();