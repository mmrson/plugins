/*:
 * @plugindesc AI Hero Framework - Status Effect Catalog v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - STATUS EFFECT CATALOG
 * ============================================================================
 *
 * Where AIH_CharacterDisplay.js owns the VISUAL side of a status effect
 * stage (which placeholder/art to show), this module owns what a stage
 * MEANS: a short description, how it plausibly affects her in a dungeon
 * vs. out in town, what kinds of reactions NPCs who see her in this
 * state could plausibly have, and its effect on her current felt state.
 *
 * Requires AIH_CharacterDisplay.js to be loaded first.
 *
 * ============================================================================
 *
 * A CRITICAL BOUNDARY, HELD DELIBERATELY
 *
 * This module may adjust AIH.Emotions directly (embarrassment, stress,
 * confidence, excitement, comfort - the "changes moment to moment,
 * currently felt state" layer the project already treats as safe to
 * write to directly). It NEVER calls AIH.PersonalityDrift.reinforce().
 *
 * Personality only moves through a real evaluated decision - never
 * passively from simply being in a state, no matter how strong that
 * state is. Being slimed doesn't itself make her more or less
 * inhibited; how she CHOOSES to handle being slimed in front of someone
 * might, and that choice belongs to whichever minigame/event actually
 * puts her in front of that someone, evaluated the normal way through
 * AIH.PressureEvaluator. This module's buildExposureSituation() below
 * exists specifically to make that easy to set up correctly - it
 * returns a ready situation template, it does not call evaluate()
 * itself and does not decide anything.
 *
 * ============================================================================
 *
 * REACTION/BEHAVIOR TAGS ARE DELIBERATELY A LIST, NOT ONE ANSWER
 *
 * npcReactionTags for a given stage lists several plausible reaction
 * archetypes (e.g. "amused", "concerned", "mocking", "protective") -
 * which one an actual NPC shows is for that NPC's own disposition/
 * relationship to pick from, not hardcoded here. Same principle as
 * the rest of the project: this module describes the situation, it
 * doesn't pre-decide the outcome.
 *
 * ============================================================================
 *
 * COVERAGE
 *
 * Full stage detail exists for: slimed, milk_stained, blushing (the
 * three requested). Other status effects defined in
 * AIH_CharacterDisplay.js (wet, dirty, bruised, dazed_stars) don't have
 * stages yet - CATALOG simply has no entry for them, and every lookup
 * function below returns null gracefully rather than throwing, so
 * nothing breaks when a minigame asks about an effect that hasn't been
 * detailed yet. Add more by extending CATALOG and, if it should escalate
 * visually too, adding a matching `stages` array to that effect's entry
 * in AIH_CharacterDisplay.STATUS_EFFECTS.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    AIH.StatusEffectCatalog = AIH.StatusEffectCatalog || {};
    AIH.StatusEffectCatalog.VERSION = "0.1.0";

    // =========================================================================
    // CATALOG
    // =========================================================================
    //
    // stages[0] = stage 1, stages[1] = stage 2, stages[2] = stage 3.
    //
    // emotionEffects: applied via AIH.Emotions.modifyValue(key, amount) -
    // a relative nudge to her CURRENT felt state, not a personality
    // change. Values are illustrative, tune during play.
    //
    // exposureSituationHint: cost-field fragment for
    // buildExposureSituation() below - NOT applied automatically to
    // anything. A calling minigame decides if/when an NPC actually
    // witnessing her in this state deserves a real evaluated moment,
    // and uses this as a starting template for that situation object.
    //
    // =========================================================================

    AIH.StatusEffectCatalog.CATALOG = {

        slimed: {

            stages: [

                // --- stage 1: light -------------------------------------------
                {
                    description:
                        "A light coating of slime clings to one arm or sleeve - " +
                        "sticky, a little gross, easy enough to shrug off in " +
                        "conversation.",

                    dungeonBehaviorTags: ["minor_annoyance"],
                    townBehaviorTags: ["easily_hidden"],
                    npcReactionTags: ["indifferent", "amused", "brief_comment"],

                    emotionEffects: {
                        embarrassment: 0.08,
                        comfort: -0.05
                    },

                    /*
                     * restraintModifier: added to the base escape chance
                     * in AIH_StatusEffectCutinBridge.js's struggle roll
                     * (see that file) whenever this stage is active on a
                     * state also tagged <Restrains> - negative makes
                     * escaping HARDER (more coating = more stuck), never
                     * applied on its own. Only slimed has one right now;
                     * it's the one effect with an actual physical
                     * restraint rationale among the three detailed here.
                     */
                    restraintModifier: -0.05,

                    exposureSituationHint: {
                        severity: "normal",
                        embarrassment: 0.10,
                        modestyCost: 0.05,
                        dignityCost: 0.05
                    }
                },

                // --- stage 2: moderate -----------------------------------------
                {
                    description:
                        "Slime has soaked through a good part of her clothing - " +
                        "visibly coated, faintly foul-smelling, every movement a " +
                        "little stickier than it should be.",

                    dungeonBehaviorTags: ["reduced_mobility", "distracting_discomfort"],
                    townBehaviorTags: ["draws_stares", "hard_to_hide"],
                    npcReactionTags: ["disgusted", "teasing", "concerned", "opportunistic"],

                    emotionEffects: {
                        embarrassment: 0.22,
                        comfort: -0.18,
                        stress: 0.10
                    },

                    restraintModifier: -0.15,

                    exposureSituationHint: {
                        severity: "medium",
                        embarrassment: 0.30,
                        modestyCost: 0.15,
                        dignityCost: 0.20
                    }
                },

                // --- stage 3: soaked -------------------------------------------
                {
                    description:
                        "Thoroughly coated head to toe - slime drips steadily, " +
                        "stings faintly where it touches her eyes, and every " +
                        "movement is visibly hampered.",

                    dungeonBehaviorTags: [
                        "impaired_vision",
                        "significant_mobility_penalty",
                        "needs_cleanup_before_continuing"
                    ],
                    townBehaviorTags: ["cannot_hide_it", "attracts_a_crowd"],
                    npcReactionTags: [
                        "alarmed", "mocking", "protective", "opportunistic", "scandalized"
                    ],

                    emotionEffects: {
                        embarrassment: 0.40,
                        comfort: -0.35,
                        stress: 0.25,
                        confidence: -0.15
                    },

                    restraintModifier: -0.30,

                    exposureSituationHint: {
                        severity: "rare",
                        embarrassment: 0.50,
                        modestyCost: 0.30,
                        dignityCost: 0.35,
                        prideCost: 0.20
                    }
                }
            ]
        },

        milk_stained: {

            stages: [

                // --- stage 1: spots --------------------------------------------
                {
                    description:
                        "A few small milk stains on her sleeve or hem - nothing " +
                        "that draws a second look.",

                    dungeonBehaviorTags: ["minor_annoyance"],
                    townBehaviorTags: ["easily_explained"],
                    npcReactionTags: ["indifferent", "brief_comment"],

                    emotionEffects: {
                        embarrassment: 0.05
                    },

                    exposureSituationHint: {
                        severity: "normal",
                        embarrassment: 0.08,
                        modestyCost: 0.05,
                        dignityCost: 0.05
                    }
                },

                // --- stage 2: damp -----------------------------------------------
                {
                    description:
                        "Milk has soaked into the front of her clothes - " +
                        "noticeably damp, faintly sour-sweet, hard to explain " +
                        "away to anyone who actually knows the rules.",

                    dungeonBehaviorTags: ["distracting_discomfort"],
                    townBehaviorTags: ["draws_questions", "invites_speculation"],
                    npcReactionTags: ["suspicious", "teasing", "disapproving", "amused"],

                    emotionEffects: {
                        embarrassment: 0.20,
                        stress: 0.15,
                        comfort: -0.12
                    },

                    exposureSituationHint: {
                        severity: "medium",
                        embarrassment: 0.25,
                        modestyCost: 0.10,
                        dignityCost: 0.20
                    }
                },

                // --- stage 3: soaked -------------------------------------------
                {
                    description:
                        "Soaked through - the evidence is impossible to miss or " +
                        "explain, and anyone who knows the farm's rules will " +
                        "draw the obvious conclusion.",

                    dungeonBehaviorTags: ["distracting_discomfort"],
                    townBehaviorTags: ["cannot_hide_it", "invites_rumor"],
                    npcReactionTags: [
                        "scandalized", "disapproving", "mocking", "sympathetic", "opportunistic"
                    ],

                    emotionEffects: {
                        embarrassment: 0.38,
                        stress: 0.28,
                        comfort: -0.25,
                        confidence: -0.10
                    },

                    exposureSituationHint: {
                        severity: "rare",
                        embarrassment: 0.40,
                        modestyCost: 0.20,
                        dignityCost: 0.35,
                        prideCost: 0.15
                    }
                }
            ]
        },

        blushing: {

            stages: [

                // --- stage 1: slight blush ------------------------------------
                {
                    description:
                        "A slight blush colors her cheeks - easy to miss unless " +
                        "someone happens to be looking closely.",

                    dungeonBehaviorTags: [],
                    townBehaviorTags: ["barely_noticeable"],
                    npcReactionTags: ["indifferent", "amused"],

                    emotionEffects: {
                        embarrassment: 0.10
                    },

                    exposureSituationHint: {
                        severity: "normal",
                        embarrassment: 0.10
                    }
                },

                // --- stage 2: heavy blush + heavy breathing --------------------
                {
                    description:
                        "A heavy blush and visibly quickened breathing - not " +
                        "something she can easily hide from anyone paying " +
                        "attention.",

                    dungeonBehaviorTags: ["mild_distraction"],
                    townBehaviorTags: ["noticeable", "draws_questions"],
                    npcReactionTags: ["concerned", "teasing", "amused", "curious"],

                    emotionEffects: {
                        embarrassment: 0.28,
                        stress: 0.15,
                        confidence: -0.08
                    },

                    exposureSituationHint: {
                        severity: "medium",
                        embarrassment: 0.30,
                        dignityCost: 0.10
                    }
                },

                /*
                 * --- stage 3: overwhelmed ---------------------------------------
                 * Per explicit direction: heavy blush, heavy breathing, biting
                 * her lip intermittently, squinting, losing focus and rolling
                 * her eyes every so often as it gets harder to concentrate.
                 * Kept at the level of a status-ailment description (what's
                 * observably happening, what it does to her focus) rather
                 * than sensory prose - this is game-mechanical content, not
                 * a scene.
                 */
                {
                    description:
                        "Heavy blush, heavy breathing, and visibly losing her " +
                        "composure - biting her lip intermittently, squinting, " +
                        "and losing focus every so often as it becomes harder " +
                        "to concentrate.",

                    dungeonBehaviorTags: [
                        "significant_distraction", "reduced_focus", "delayed_reactions"
                    ],
                    townBehaviorTags: ["impossible_to_hide", "draws_concerned_attention"],
                    npcReactionTags: [
                        "concerned", "opportunistic", "protective", "curious", "scandalized"
                    ],

                    emotionEffects: {
                        embarrassment: 0.45,
                        stress: 0.30,
                        confidence: -0.20,
                        excitement: 0.25
                    },

                    exposureSituationHint: {
                        severity: "medium",
                        embarrassment: 0.45,
                        dignityCost: 0.15,
                        prideCost: 0.15
                    }
                }
            ]
        },

        /*
         * bound: physical restraint, distinct from the coating/emotional
         * effects above but built the same way - stage data drives both
         * the narrative side (description/reactions/emotions, same as
         * every other effect here) AND the actual battle mechanic in
         * AIH_StatusEffectCutinBridge.js's AIH.RestrainedStruggle, via
         * the two fields unique to this entry:
         *
         *   restrainedParts - which body parts this stage binds:
         *     "hands_front" | "hands_back" | "legs" (a stage can list
         *     more than one - stage 3 lists both hands_back and legs).
         *     RestrainedStruggle reads this to decide which commands
         *     are available/penalized, never hardcoded per-stage rules
         *     of its own.
         *
         *   restraintModifier - same field slimed already uses, summed
         *     the same way across every active restraint-relevant state
         *     (a stacked slimed state's own restraintModifier compounds
         *     with bound's, from one shared mechanism).
         */
        bound: {

            stages: [

                // --- stage 1: light - wrists loosely tied in front ------------
                {
                    description:
                        "Her wrists are loosely bound in front of her - " +
                        "restrictive, but not much of an obstacle if she takes " +
                        "a moment to work at it.",

                    restrainedParts: ["hands_front"],

                    dungeonBehaviorTags: ["minor_hindrance"],
                    townBehaviorTags: ["easily_explained"],
                    npcReactionTags: ["indifferent", "amused", "brief_comment"],

                    emotionEffects: {
                        stress: 0.10,
                        confidence: -0.05
                    },

                    restraintModifier: 0.25,

                    exposureSituationHint: {
                        severity: "normal",
                        embarrassment: 0.10,
                        dignityCost: 0.10,
                        freedomCost: 0.15
                    }
                },

                // --- stage 2: harder - wrists bound behind her back -----------
                {
                    description:
                        "Her wrists are bound tightly behind her back - she " +
                        "can still move, still fight, but every motion is " +
                        "visibly harder without the use of her hands in front " +
                        "of her.",

                    restrainedParts: ["hands_back"],

                    dungeonBehaviorTags: ["reduced_effectiveness", "significant_hindrance"],
                    townBehaviorTags: ["cannot_hide_it", "draws_concerned_attention"],
                    npcReactionTags: ["concerned", "protective", "opportunistic", "scandalized"],

                    emotionEffects: {
                        stress: 0.25,
                        confidence: -0.15,
                        embarrassment: 0.15
                    },

                    restraintModifier: -0.10,

                    exposureSituationHint: {
                        severity: "medium",
                        embarrassment: 0.25,
                        dignityCost: 0.25,
                        freedomCost: 0.30,
                        prideCost: 0.15
                    }
                },

                // --- stage 3: near impossible - wrists behind back + ankles ---
                {
                    description:
                        "Wrists bound tightly behind her back, ankles bound " +
                        "together - barely able to move, let alone fight back " +
                        "effectively.",

                    restrainedParts: ["hands_back", "legs"],

                    dungeonBehaviorTags: [
                        "severely_reduced_effectiveness", "cannot_flee", "cannot_dodge"
                    ],
                    townBehaviorTags: ["cannot_hide_it", "attracts_a_crowd"],
                    npcReactionTags: ["alarmed", "protective", "opportunistic", "scandalized"],

                    emotionEffects: {
                        stress: 0.40,
                        confidence: -0.30,
                        embarrassment: 0.25,
                        fear: 0.15
                    },

                    restraintModifier: -0.35,

                    exposureSituationHint: {
                        severity: "rare",
                        embarrassment: 0.40,
                        dignityCost: 0.35,
                        freedomCost: 0.45,
                        prideCost: 0.25
                    }
                }
            ]
        }
    };

    // =========================================================================
    // LOOKUP / QUERY (read-only, applies nothing)
    // =========================================================================

    AIH.StatusEffectCatalog.getStageInfo = function(key, stage) {

        var entry = AIH.StatusEffectCatalog.CATALOG[key];

        if (
            !entry ||
            !entry.stages ||
            !entry.stages.length
        ) {

            return null;
        }

        var idx =
            Math.max(
                1,
                Math.min(entry.stages.length, stage || 1)
            ) - 1;

        return entry.stages[idx] || null;
    };

    AIH.StatusEffectCatalog.npcReactionTagsFor = function(key, stage) {

        var info = AIH.StatusEffectCatalog.getStageInfo(key, stage);

        return info ?
            info.npcReactionTags.slice() :
            [];
    };

    AIH.StatusEffectCatalog.behaviorTagsFor = function(key, stage, context) {

        var info = AIH.StatusEffectCatalog.getStageInfo(key, stage);

        if (!info) {
            return [];
        }

        if (context === "town") {
            return info.townBehaviorTags.slice();
        }

        if (context === "dungeon") {
            return info.dungeonBehaviorTags.slice();
        }

        return info.dungeonBehaviorTags.concat(info.townBehaviorTags);
    };

    // =========================================================================
    // APPLY (writes the visual + her current felt state - never Personality)
    // =========================================================================

    AIH.StatusEffectCatalog.applyStage = function(key, stage, options) {

        var info =
            AIH.StatusEffectCatalog.getStageInfo(key, stage);

        if (!info) {
            return null;
        }

        options = options || {};

        var sprite =
            options.sprite ||
            (
                typeof AIH.CharacterDisplay !== "undefined" ?
                    AIH.CharacterDisplay.getActiveSprite() :
                    null
            );

        if (
            sprite &&
            sprite.setStatusEffectStage
        ) {

            sprite.setStatusEffectStage(
                key,
                stage,
                { durationFrames: options.durationFrames }
            );
        }

        if (
            typeof AIH.Emotions !== "undefined" &&
            AIH.Emotions.modifyValue &&
            info.emotionEffects
        ) {

            Object.keys(info.emotionEffects).forEach(function(emotionKey) {

                AIH.Emotions.modifyValue(
                    emotionKey,
                    info.emotionEffects[emotionKey]
                );
            });
        }

        return info;
    };

    // =========================================================================
    // EXPOSURE SITUATION TEMPLATE (never evaluated here - see the boundary
    // note at the top of this file)
    // =========================================================================

    AIH.StatusEffectCatalog.buildExposureSituation = function(key, stage, overrides) {

        var info =
            AIH.StatusEffectCatalog.getStageInfo(key, stage);

        if (
            !info ||
            !info.exposureSituationHint
        ) {

            return null;
        }

        var raw =
            Object.assign(
                {
                    id:
                        "statuseffect_exposure_" +
                        key +
                        "_" +
                        stage +
                        "_" +
                        Date.now(),

                    type: "status_effect_exposure",
                    category: key,
                    description:
                        "Someone sees her while she is " +
                        info.description.charAt(0).toLowerCase() +
                        info.description.slice(1),

                    reward: 0,
                    danger: 0,
                    dignityCost: 0,
                    freedomCost: 0,
                    modestyCost: 0,
                    prideCost: 0,
                    survivalBenefit: 0,
                    combatAdvantage: 0
                },
                info.exposureSituationHint,
                overrides || {}
            );

        if (
            typeof AIH.PressureEvaluator !== "undefined" &&
            AIH.PressureEvaluator.normalizeSituation
        ) {

            return AIH.PressureEvaluator.normalizeSituation(raw);
        }

        return raw;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register("StatusEffectCatalog", {
            version: AIH.StatusEffectCatalog.VERSION,
            initialize: function() {}
        });
    }

})();