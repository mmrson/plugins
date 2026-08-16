/*:
 * @plugindesc AI Hero Framework - Hero Actor Binding v0.9.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - HERO ACTOR BINDING
 * ============================================================================
 *
 * STEP 9
 *
 * Connects the persistent AI hero identity to a real RPG Maker actor.
 *
 * This module does NOT:
 *
 * - make decisions
 * - move the actor
 * - execute actions
 * - call the LLM
 * - modify personality
 * - modify values
 * - create beliefs
 *
 * It only establishes and validates the identity of the AI-controlled actor.
 *
 * ============================================================================
 *
 * Actor ID 0 means:
 *
 *     No AI hero has been assigned.
 *
 * The framework does NOT automatically assume Actor 1.
 *
 * ============================================================================
 *
 * @command BindActor
 * @text Bind AI Hero Actor
 * @desc Binds the AI hero to the specified RPG Maker actor.
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @default 1
 *
 * @command Validate
 * @text Validate AI Hero
 * @desc Validates the current AI hero actor binding.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Hero = AIH.Hero || {};

    AIH.Hero.VERSION = "0.9.0";

    // =========================================================================
    // ACTOR ID
    // =========================================================================

    AIH.Hero.actorId = function() {

        if (
            !AIH.State ||
            !AIH.State.actorId
        ) {

            return 0;
        }

        return Number(
            AIH.State.actorId() || 0
        );
    };

    // =========================================================================
    // ACTOR
    // =========================================================================

    AIH.Hero.actor = function() {

        var actorId;
        var actor;

        actorId =
            AIH.Hero.actorId();

        if (
            actorId <= 0
        ) {

            return null;
        }

        if (
            typeof $gameActors === "undefined" ||
            !$gameActors
        ) {

            return null;
        }

        actor =
            $gameActors.actor(
                actorId
            );

        return actor || null;
    };

    // =========================================================================
    // EXISTS
    // =========================================================================

    AIH.Hero.exists = function() {

        return AIH.Hero.actor() !== null;
    };

    // =========================================================================
    // NAME
    // =========================================================================

    AIH.Hero.name = function() {

        var actor;

        actor =
            AIH.Hero.actor();

        if (!actor) {
            return "";
        }

        return String(
            actor.name() || ""
        );
    };

    // =========================================================================
    // BIND ACTOR
    // =========================================================================

    AIH.Hero.bindActor = function(
        actorId
    ) {

        var actor;

        actorId =
            Number(actorId);

        if (
            isNaN(actorId) ||
            actorId <= 0
        ) {

            AIH.Debug.error(
                "Cannot bind AI Hero: invalid actor ID " +
                actorId
            );

            return false;
        }

        if (
            typeof $gameActors === "undefined" ||
            !$gameActors
        ) {

            AIH.Debug.error(
                "Cannot bind AI Hero: Game Actors unavailable."
            );

            return false;
        }

        actor =
            $gameActors.actor(
                actorId
            );

        if (!actor) {

            AIH.Debug.error(
                "Cannot bind AI Hero: Actor " +
                actorId +
                " does not exist."
            );

            return false;
        }

        if (
            !AIH.State ||
            !AIH.State.setActorId
        ) {

            AIH.Debug.error(
                "Cannot bind AI Hero: AIH.State unavailable."
            );

            return false;
        }

        AIH.State.setActorId(
            actorId
        );

        AIH.Debug.log(
            "AI Hero bound to Actor " +
            actorId +
            " (" +
            actor.name() +
            ")."
        );

        return true;
    };

    // =========================================================================
    // VALIDATE
    // =========================================================================

    AIH.Hero.validate = function() {

        var actorId;
        var actor;

        actorId =
            AIH.Hero.actorId();

        if (actorId <= 0) {

            AIH.Debug.warn(
                "AI Hero is not bound to an actor."
            );

            return {

                valid: false,

                actorId: 0,

                reason:
                    "no_actor_bound"
            };
        }

        actor =
            AIH.Hero.actor();

        if (!actor) {

            AIH.Debug.error(
                "AI Hero Actor " +
                actorId +
                " could not be found."
            );

            return {

                valid: false,

                actorId: actorId,

                reason:
                    "actor_not_found"
            };
        }

        return {

            valid: true,

            actorId: actorId,

            name:
                String(
                    actor.name() || ""
                ),

            reason:
                "ok"
        };
    };

    // =========================================================================
    // DEBUG INFORMATION
    // =========================================================================

    AIH.Hero.debug = function() {

        var result;

        result =
            AIH.Hero.validate();

        AIH.Debug.inspect(
            "AI Hero Binding:",
            result
        );

        return result;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Hero",
        {
            version:
                AIH.Hero.VERSION,

            initialize: function() {

                AIH.Hero.validate();
            },

            actorId: function() {

                return AIH.Hero.actorId();
            },

            exists: function() {

                return AIH.Hero.exists();
            }
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - BIND ACTOR
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Hero",
        "BindActor",
        function(args) {

            var actorId;

            actorId =
                Number(
                    args.actorId || 0
                );

            AIH.Hero.bindActor(
                actorId
            );
        }
    );

    // =========================================================================
    // PLUGIN COMMAND - VALIDATE
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Hero",
        "Validate",
        function() {

            AIH.Hero.debug();
        }
    );

})();