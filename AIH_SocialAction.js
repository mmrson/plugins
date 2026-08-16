/*:
 * @plugindesc AI Hero Framework - Social Action Execution System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - SOCIAL ACTION EXECUTION
 * ============================================================================
 *
 * STEP 20
 *
 * Converts the SOCIAL DECISION produced by AIH_SocialDecision.js into an
 * executable SOCIAL ACTION REQUEST.
 *
 * ============================================================================
 *
 * PIPELINE
 *
 * OBJECTIVE EVENT
 *        |
 *        v
 * SOCIAL INTERACTION
 *        |
 *        v
 * SUBJECTIVE INTERPRETATION
 *        |
 *        v
 * SOCIAL RESPONSE PRESSURE
 *        |
 *        v
 * SOCIAL DECISION
 *        |
 *        v
 * SOCIAL ACTION
 *        |
 *        v
 * ACTION EXECUTION
 *
 * This module occupies the SOCIAL ACTION stage.
 *
 * ============================================================================
 *
 * IMPORTANT
 *
 * This module does NOT:
 *
 * - decide the heroine's response
 * - reinterpret the interaction
 * - modify personality
 * - modify values
 * - directly modify emotions
 * - directly modify reputation
 * - generate dialogue
 * - call the LLM
 * - automatically start combat
 *
 * It converts an existing SOCIAL DECISION into a structured ACTION REQUEST.
 *
 * Actual game-specific execution is delegated through registered handlers.
 *
 * ============================================================================
 *
 * SOCIAL DECISIONS
 *
 *     ignore
 *     disengage
 *     comply
 *     appease
 *     assert
 *     confront
 *     resist
 *     retaliate
 *
 * ============================================================================
 *
 * ACTION TYPES
 *
 *     none
 *     withdraw
 *     cooperate
 *     deescalate
 *     assert_boundary
 *     confront
 *     resist
 *     retaliate
 *
 * These are executable INTENT TYPES.
 *
 * They are still abstract enough that dialogue, movement, combat, animation,
 * reputation and emotional consequences can be handled by their own systems.
 *
 * ============================================================================
 *
 * DESIGN PRINCIPLE
 *
 * SocialDecision decides:
 *
 *     "What does she want to do?"
 *
 * SocialAction converts that into:
 *
 *     "What action should the game attempt to execute?"
 *
 * The actual implementation of that action belongs to registered handlers.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";


    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.SocialAction =
        AIH.SocialAction || {};

    AIH.SocialAction.VERSION =
        "0.1.0";

    AIH.SocialAction.SCHEMA_VERSION =
        1;

    AIH.SocialAction._initialized =
        false;


    // =========================================================================
    // COPY
    // =========================================================================

    AIH.SocialAction._copy =
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
    // CLAMP 0-1
    // =========================================================================

    AIH.SocialAction._clamp01 =
        function(value) {

            value =
                Number(value);

            if (isNaN(value)) {
                return 0;
            }

            if (value < 0) {
                return 0;
            }

            if (value > 1) {
                return 1;
            }

            return value;
        };


    // =========================================================================
    // VALID DECISIONS
    // =========================================================================

    AIH.SocialAction.DECISIONS = [

        "ignore",
        "disengage",
        "comply",
        "appease",
        "assert",
        "confront",
        "resist",
        "retaliate"

    ];


    // =========================================================================
    // ACTION MAP
    // =========================================================================
    //
    // Converts SocialDecision intents into executable action categories.
    //
    // =========================================================================

    AIH.SocialAction.ACTION_MAP = {

        ignore:
            "none",

        disengage:
            "withdraw",

        comply:
            "cooperate",

        appease:
            "deescalate",

        assert:
            "assert_boundary",

        confront:
            "confront",

        resist:
            "resist",

        retaliate:
            "retaliate"

    };


    // =========================================================================
    // HANDLERS
    // =========================================================================
    //
    // Handlers are intentionally empty.
    //
    // Other plugins can register the actual implementation.
    //
    // Example:
    //
    // AIH.SocialAction.registerHandler(
    //     "assert_boundary",
    //     function(action) {
    //         ...
    //     }
    // );
    //
    // =========================================================================

    AIH.SocialAction._handlers =
        AIH.SocialAction._handlers || {};


    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.SocialAction.initialize =
        function() {

            AIH.SocialAction._initialized =
                true;

            if (
                AIH.Debug &&
                AIH.Debug.log
            ) {

                AIH.Debug.log(
                    "Social action system initialized."
                );
            }
        };


    // =========================================================================
    // IS VALID DECISION
    // =========================================================================

    AIH.SocialAction.isValidDecision =
        function(decision) {

            var i;

            for (
                i = 0;
                i < AIH.SocialAction.DECISIONS.length;
                i++
            ) {

                if (
                    AIH.SocialAction.DECISIONS[i] ===
                    decision
                ) {

                    return true;
                }
            }

            return false;
        };


    // =========================================================================
    // GET ACTION TYPE
    // =========================================================================

    AIH.SocialAction.getActionType =
        function(decision) {

            if (
                !AIH.SocialAction.isValidDecision(
                    decision
                )
            ) {

                return null;
            }

            return AIH.SocialAction.ACTION_MAP[
                decision
            ] || null;
        };


    // =========================================================================
    // REGISTER HANDLER
    // =========================================================================

    AIH.SocialAction.registerHandler =
        function(
            actionType,
            handler
        ) {

            if (
                !actionType
            ) {

                return false;
            }

            if (
                typeof handler !==
                "function"
            ) {

                return false;
            }

            AIH.SocialAction._handlers[
                actionType
            ] =
                handler;

            return true;
        };


    // =========================================================================
    // REMOVE HANDLER
    // =========================================================================

    AIH.SocialAction.removeHandler =
        function(
            actionType
        ) {

            if (
                !actionType
            ) {

                return false;
            }

            if (
                AIH.SocialAction._handlers[
                    actionType
                ] === undefined
            ) {

                return false;
            }

            delete AIH.SocialAction._handlers[
                actionType
            ];

            return true;
        };


    // =========================================================================
    // HAS HANDLER
    // =========================================================================

    AIH.SocialAction.hasHandler =
        function(
            actionType
        ) {

            return (
                typeof AIH.SocialAction._handlers[
                    actionType
                ] ===
                "function"
            );
        };


    // =========================================================================
    // GET HANDLER
    // =========================================================================

    AIH.SocialAction.getHandler =
        function(
            actionType
        ) {

            if (
                !AIH.SocialAction.hasHandler(
                    actionType
                )
            ) {

                return null;
            }

            return AIH.SocialAction._handlers[
                actionType
            ];
        };


    // =========================================================================
    // BUILD ACTION
    // =========================================================================
    //
    // Converts a SocialDecision result into a stable action object.
    //
    // =========================================================================

    AIH.SocialAction.build =
        function(
            decisionResult
        ) {

            var decision;
            var actionType;
            var action;

            if (
                !decisionResult
            ) {

                return null;
            }

            decision =
                decisionResult.decision;

            if (
                !AIH.SocialAction.isValidDecision(
                    decision
                )
            ) {

                return null;
            }

            actionType =
                AIH.SocialAction.getActionType(
                    decision
                );

            if (
                !actionType
            ) {

                return null;
            }

            action = {

                schemaVersion:
                    AIH.SocialAction.SCHEMA_VERSION,

                decision:
                    decision,

                actionType:
                    actionType,

                faction:
                    decisionResult.faction,

                sourceId:
                    decisionResult.sourceId,

                sourceName:
                    decisionResult.sourceName,

                decisionScore:
                    AIH.SocialAction._clamp01(
                        decisionResult.decisionScore
                    ),

                decisionConfidence:
                    AIH.SocialAction._clamp01(
                        decisionResult.decisionConfidence
                    ),

                subjectiveSeverity:
                    AIH.SocialAction._clamp01(
                        decisionResult.subjectiveSeverity
                    ),

                interpretationConfidence:
                    AIH.SocialAction._clamp01(
                        decisionResult.interpretationConfidence
                    ),

                interpretation:
                    AIH.SocialAction._copy(
                        decisionResult.interpretation
                    ),

                responseContext:
                    AIH.SocialAction._copy(
                        decisionResult.responseContext
                    ),

                state:
                    AIH.SocialAction._copy(
                        decisionResult.state
                    ),

                reasons:
                    AIH.SocialAction._copy(
                        decisionResult.reasons
                    ),

                executable:
                    AIH.SocialAction.hasHandler(
                        actionType
                    ),

                executed:
                    false,

                success:
                    false,

                timestamp:
                    Date.now()
            };

            return action;
        };


    // =========================================================================
    // BUILD FROM RAW DATA
    // =========================================================================
    //
    // Convenience function.
    //
    // =========================================================================

    AIH.SocialAction.buildFromData =
        function(
            data
        ) {

            var decisionResult;

            if (
                !AIH.SocialDecision ||
                !AIH.SocialDecision.decide
            ) {

                return null;
            }

            decisionResult =
                AIH.SocialDecision.decide(
                    data
                );

            if (
                !decisionResult
            ) {

                return null;
            }

            return AIH.SocialAction.build(
                decisionResult
            );
        };


    // =========================================================================
    // EXECUTE
    // =========================================================================
    //
    // Executes the registered handler for the action type.
    //
    // IMPORTANT:
    //
    // No handler means NO GAME ACTION occurs.
    //
    // This prevents the framework from inventing behavior that has not been
    // explicitly implemented by the game.
    //
    // =========================================================================

    AIH.SocialAction.execute =
        function(
            action
        ) {

            var handler;
            var result;

            if (
                !action
            ) {

                return null;
            }

            if (
                !AIH.SocialAction.isValidDecision(
                    action.decision
                )
            ) {

                return null;
            }

            if (
                !action.actionType
            ) {

                return null;
            }

            handler =
                AIH.SocialAction.getHandler(
                    action.actionType
                );

            action =
                AIH.SocialAction._copy(
                    action
                );

            action.timestamp =
                Date.now();

            action.executed =
                false;

            action.success =
                false;

            action.executable =
                !!handler;


            // -----------------------------------------------------------------
            // NO HANDLER
            // -----------------------------------------------------------------

            if (
                !handler
            ) {

                return action;
            }


            // -----------------------------------------------------------------
            // EXECUTE HANDLER
            // -----------------------------------------------------------------

            try {

                result =
                    handler(
                        action
                    );

                action.executed =
                    true;

                if (
                    result === undefined
                ) {

                    action.success =
                        true;

                } else if (
                    result === true
                ) {

                    action.success =
                        true;

                } else if (
                    result === false
                ) {

                    action.success =
                        false;

                } else {

                    action.success =
                        !!result;

                    action.handlerResult =
                        AIH.SocialAction._copy(
                            result
                        );
                }

            } catch (error) {

                action.executed =
                    true;

                action.success =
                    false;

                action.error =
                    String(
                        error &&
                        error.message
                            ? error.message
                            : error
                    );

                if (
                    AIH.Debug &&
                    AIH.Debug.error
                ) {

                    AIH.Debug.error(
                        "Social action execution failed: " +
                        action.actionType
                    );
                }
            }

            action.timestamp =
                Date.now();

            return action;
        };


    // =========================================================================
    // DECIDE AND EXECUTE
    // =========================================================================
    //
    // Runs:
    //
    //     SocialDecision
    //          |
    //          v
    //     SocialAction.build
    //          |
    //          v
    //     SocialAction.execute
    //
    // =========================================================================

    AIH.SocialAction.decideAndExecute =
        function(
            data
        ) {

            var action;

            action =
                AIH.SocialAction.buildFromData(
                    data
                );

            if (
                !action
            ) {

                return null;
            }

            return AIH.SocialAction.execute(
                action
            );
        };


    // =========================================================================
    // GET ACTION ONLY
    // =========================================================================

    AIH.SocialAction.getAction =
        function(
            data
        ) {

            var action;

            action =
                AIH.SocialAction.buildFromData(
                    data
                );

            if (
                !action
            ) {

                return null;
            }

            return action.actionType;
        };


    // =========================================================================
    // SHOULD EXECUTE
    // =========================================================================
    //
    // Ignore produces "none" and therefore does not require an execution
    // handler.
    //
    // =========================================================================

    AIH.SocialAction.shouldExecute =
        function(
            action
        ) {

            if (
                !action
            ) {

                return false;
            }

            if (
                action.actionType ===
                "none"
            ) {

                return false;
            }

            return true;
        };


    // =========================================================================
    // IS EXECUTABLE
    // =========================================================================

    AIH.SocialAction.isExecutable =
        function(
            action
        ) {

            if (
                !action
            ) {

                return false;
            }

            if (
                !AIH.SocialAction.shouldExecute(
                    action
                )
            ) {

                return true;
            }

            return AIH.SocialAction.hasHandler(
                action.actionType
            );
        };


    // =========================================================================
    // GET REGISTERED HANDLERS
    // =========================================================================

    AIH.SocialAction.getHandlers =
        function() {

            var result;
            var keys;
            var i;

            result = {};

            keys =
                Object.keys(
                    AIH.SocialAction._handlers
                );

            for (
                i = 0;
                i < keys.length;
                i++
            ) {

                result[
                    keys[i]
                ] =
                    true;
            }

            return result;
        };


    // =========================================================================
    // CLEAR HANDLERS
    // =========================================================================

    AIH.SocialAction.clearHandlers =
        function() {

            AIH.SocialAction._handlers = {};

        };


    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "SocialAction",
        {

            version:
                AIH.SocialAction.VERSION,

            initialize:
                function() {

                    AIH.SocialAction.initialize();

                },

            build:
                function(
                    decisionResult
                ) {

                    return AIH.SocialAction.build(
                        decisionResult
                    );

                },

            buildFromData:
                function(
                    data
                ) {

                    return AIH.SocialAction.buildFromData(
                        data
                    );

                },

            execute:
                function(
                    action
                ) {

                    return AIH.SocialAction.execute(
                        action
                    );

                },

            decideAndExecute:
                function(
                    data
                ) {

                    return AIH.SocialAction.decideAndExecute(
                        data
                    );

                },

            getAction:
                function(
                    data
                ) {

                    return AIH.SocialAction.getAction(
                        data
                    );

                },

            getActionType:
                function(
                    decision
                ) {

                    return AIH.SocialAction.getActionType(
                        decision
                    );

                },

            registerHandler:
                function(
                    actionType,
                    handler
                ) {

                    return AIH.SocialAction.registerHandler(
                        actionType,
                        handler
                    );

                },

            removeHandler:
                function(
                    actionType
                ) {

                    return AIH.SocialAction.removeHandler(
                        actionType
                    );

                },

            hasHandler:
                function(
                    actionType
                ) {

                    return AIH.SocialAction.hasHandler(
                        actionType
                    );

                },

            isExecutable:
                function(
                    action
                ) {

                    return AIH.SocialAction.isExecutable(
                        action
                    );

                }

        }
    );


    // =========================================================================
    // GAME OBJECT INITIALIZATION
    // =========================================================================

    var _AIH_SocialAction_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_SocialAction_createGameObjects.call(
                this
            );

            AIH.SocialAction.initialize();

        };


    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_SocialAction_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_SocialAction_setupNewGame.call(
                this
            );

            AIH.SocialAction._initialized =
                false;

            AIH.SocialAction.initialize();

        };


    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_SocialAction_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(
            contents
        ) {

            _AIH_SocialAction_extractSaveContents.call(
                this,
                contents
            );

            AIH.SocialAction._initialized =
                false;

            AIH.SocialAction.initialize();

        };


})();