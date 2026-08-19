/*:
 * @plugindesc AI Hero Framework - Goals System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - GOALS
 * ============================================================================
 *
 * STEP 22
 *
 * Stores what the heroine is currently trying to bring about.
 *
 * This is deliberately separate from every other layer already built:
 *
 * VALUES
 *     What she cares about, in general and over the long run. A standing
 *     weight, not a thing to do.
 *
 * GOALS (this module)
 *     A concrete thing she is currently trying to accomplish, derived from
 *     (but not identical to) her values. A goal has a lifecycle: it can be
 *     proposed, become active, make progress, be suspended, and eventually
 *     be completed, fail, or be abandoned.
 *
 * BELIEFS / HYPOTHESES
 *     What she thinks is true. Goals are about what SHOULD happen, not
 *     what IS true, although beliefs can inform whether a goal looks
 *     achievable, and pursuing a goal can generate hypotheses to test.
 *
 * EMOTIONS
 *     Moment-to-moment felt state. Goals persist across many emotional
 *     swings, but emotions can spawn or suppress goals (humiliation can
 *     spawn a grudge goal; sudden fear can suspend a confrontational one).
 *
 * SOCIALDECISION
 *     Resolves a single interaction at a time. Goals are the standing
 *     context that should bias those moment-to-moment calls without
 *     dictating them. AIH_SocialDecision.js already contains a defensive
 *     hook for exactly this (_getGoalContext), written before this module
 *     existed. This module implements AIH.Goals.getDecisionContext() to
 *     satisfy that hook exactly, so SocialDecision does not need to change.
 *
 * ============================================================================
 *
 * SINGLE HEROINE PER SAVE
 *
 * Like every other AIH module, this stores exactly one heroine's goals per
 * save file. Different playthroughs with different heroines already work
 * for free, because separate saves never share state. A future preset/
 * profile module can overwrite Personality/Values/etc. (and, by the same
 * pattern, this module's seed goals) at campaign start to realize a
 * different heroine - that module does not need anything from this file
 * beyond AIH.Goals.reset() and AIH.Goals.seed(), both already exposed
 * below. This module intentionally does NOT support multiple
 * simultaneously-active heroines within a single save.
 *
 * ============================================================================
 *
 * WHERE GOALS COME FROM
 *
 * SEED
 *     A small, hardcoded set of foundational goals describing what she is
 *     fundamentally trying to do, established the same way Personality and
 *     Values already start non-neutral rather than blank. See
 *     AIH.Goals.SEED_GOALS below. Seed goals are recreated by
 *     AIH.Goals.seed() and are not meant to be edited at runtime by other
 *     systems - only their progress/status changes.
 *
 * EMERGENT
 *     Goals spawned by gameplay - a bad reputation hit spawning a "repair
 *     standing" goal, a humiliation spawning a grudge. These come from
 *     AIH.Goals.create() called by other modules with a triggering reason,
 *     not from a fixed table of "if X then always goal Y" rules baked into
 *     this file. This module provides the container and the lifecycle;
 *     other modules (and, eventually, an LLM layer) decide when an
 *     emergent goal is warranted.
 *
 * EXTERNAL
 *     Something offered to her by the world - a DM-placed opportunity, an
 *     NPC's request, a livestream request/challenge. She does not
 *     automatically adopt these; whatever offers one calls
 *     AIH.Goals.create() with origin "external" and the goal starts in
 *     status "proposed" until something (eventually a decision system)
 *     promotes it to "active".
 *
 * This module does NOT invent goals from nothing and does NOT call an LLM.
 *
 * ============================================================================
 *
 * GOAL STRUCTURE
 *
 * id
 * description
 * category
 * origin              seed | emergent | external
 * status               proposed | active | suspended | completed |
 *                       failed | abandoned
 * progress             0..1
 * baseWeight           0..1, foundational importance independent of
 *                       momentary state
 * urgency               0..1 or null
 * deadline              free-form (floor number, game time, etc.) or null
 * parentGoalId          nullable
 * childGoalIds          array
 * linkedValues          array of AIH.Values category keys this goal serves
 * linkedBeliefIds        array
 * linkedHypothesisIds     array
 * relatedFaction         nullable, an AIH.Reputation faction name
 * relatedNpcId           nullable, an AIH.Relationships NPC id
 * conflictsWith          array of goal ids or category keys this goal is
 *                        known to sit in tension with
 * createdAt / updatedAt / updateCount
 * history                array of {timestamp, event, note}
 * resolutionReason       set when completed/failed/abandoned
 *
 * ============================================================================
 *
 * PRIORITY IS COMPUTED, NOT FIXED
 *
 * A goal's current importance is not a stored number that other systems
 * read directly. AIH.Goals.getPriority(id) computes it on request from:
 *
 * - baseWeight
 * - alignment with her current AIH.Values
 * - urgency
 * - relevant current AIH.Emotions pressure
 * - recent progress/setbacks
 * - status (suspended goals are heavily discounted; anything not active
 *   scores zero)
 *
 * This module does not resolve conflicts between competing goals - it
 * surfaces them (AIH.Goals.getConflicts()) for a decision system to weigh,
 * the same separation of concerns used everywhere else in this framework.
 *
 * ============================================================================
 *
 * THIS MODULE DOES NOT:
 *
 * - decide actions
 * - execute anything
 * - directly modify personality, values, emotions, reputation or
 *   relationships
 * - resolve conflicts between goals
 * - invent goals on its own initiative
 * - call an LLM
 *
 * ============================================================================
 *
 * @command Show
 * @text Show Goals
 * @desc Displays all current goals.
 *
 * @command ShowActive
 * @text Show Active Goals
 * @desc Displays only active goals, sorted by current priority.
 *
 * @command Reseed
 * @text Reseed Goals
 * @desc Clears all goals and recreates the seed goals from scratch.
 *
 * @command Clear
 * @text Clear Goals
 * @desc Clears all goals without recreating seed goals.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Goals = AIH.Goals || {};

    AIH.Goals.VERSION = "0.1.0";

    AIH.Goals.SCHEMA_VERSION = 1;

    AIH.Goals._initialized = false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Goals._copy = function(value) {

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

    AIH.Goals._clamp01 = function(value) {

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
    // VALID ENUMS
    // =========================================================================

    AIH.Goals.ORIGINS = [
        "seed",
        "emergent",
        "external"
    ];

    AIH.Goals.STATUSES = [
        "proposed",
        "active",
        "suspended",
        "completed",
        "failed",
        "abandoned"
    ];

    AIH.Goals._isValidOrigin = function(origin) {

        return AIH.Goals.ORIGINS.indexOf(origin) >= 0;
    };

    AIH.Goals._isValidStatus = function(status) {

        return AIH.Goals.STATUSES.indexOf(status) >= 0;
    };

    // =========================================================================
    // VALUE TENSIONS
    // =========================================================================
    //
    // Pairs of AIH.Values categories that commonly pull in opposite
    // directions. Used only to help AIH.Goals.getConflicts() flag tension
    // between two active goals whose linkedValues fall on opposite sides
    // of a known pair - not to resolve anything, only to surface it.
    //
    // =========================================================================

    AIH.Goals.VALUE_TENSIONS = [
        ["modesty", "wealth"],
        ["modesty", "status"],
        ["dignity", "wealth"],
        ["dignity", "pleasure"],
        ["survival", "power"],
        ["freedom", "wealth"],
        ["comfort", "power"]
    ];

    // =========================================================================
    // SEED GOALS
    // =========================================================================
    //
    // The small, hardcoded set of foundational goals that exist from the
    // start, the same way Personality and Values already start non-neutral.
    // Edit the wording/weights here; the logic elsewhere never needs to
    // change to support new seed goals.
    //
    // "key" is a stable identifier used only during seeding so seed goals
    // can reference each other as parent/child without knowing generated
    // ids in advance. It is not stored on the resulting goal.
    //
    // =========================================================================

    AIH.Goals.SEED_GOALS = [

        {
            key: "conquer_dungeon",
            description: "Conquer the dungeon.",
            category: "campaign",
            baseWeight: 0.95,
            linkedValues: ["power", "status"],
            parentKey: null
        },

        {
            key: "maintain_reputation",
            description: "Maintain my reputation as a top-tier adventurer.",
            category: "status",
            baseWeight: 0.75,
            linkedValues: ["status", "dignity"],
            parentKey: "conquer_dungeon"
        },

        {
            key: "return_alive",
            description: "Return to town alive.",
            category: "survival",
            baseWeight: 0.85,
            linkedValues: ["survival"],
            parentKey: "conquer_dungeon"
        },

        {
            key: "preserve_dignity",
            description: "Preserve my dignity.",
            category: "dignity",
            baseWeight: 0.70,
            linkedValues: ["dignity", "modesty"],
            parentKey: "conquer_dungeon"
        },

        {
            key: "grow_stronger",
            description: "Grow stronger.",
            category: "power",
            baseWeight: 0.65,
            linkedValues: ["power"],
            parentKey: "conquer_dungeon"
        }

    ];

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================

    AIH.Goals._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    // =========================================================================
    // ENSURE GOAL CONTAINER
    // =========================================================================
    //
    // AIH.State.createDefault() does not reserve a "goals" key, because
    // this module did not exist when State was written. This mirrors how
    // AIH_Beliefs.js and AIH_Hypotheses.js build their own container
    // defensively rather than requiring State to know their shape in
    // advance, so State does not need to change.
    //
    // =========================================================================

    AIH.Goals._ensure = function() {

        var state;

        state =
            AIH.Goals._state();

        if (!state) {
            return null;
        }

        if (!state.goals) {

            state.goals = {

                schemaVersion:
                    AIH.Goals.SCHEMA_VERSION,

                nextId: 1,

                items: []
            };
        }

        if (
            !Array.isArray(
                state.goals.items
            )
        ) {

            state.goals.items = [];
        }

        if (
            state.goals.nextId ===
            undefined
        ) {

            state.goals.nextId =
                1;
        }

        if (
            state.goals.schemaVersion ===
            undefined
        ) {

            state.goals.schemaVersion =
                AIH.Goals.SCHEMA_VERSION;
        }

        return state.goals;
    };

    // =========================================================================
    // NEXT ID
    // =========================================================================

    AIH.Goals._nextId = function() {

        var container;
        var id;

        container =
            AIH.Goals._ensure();

        if (!container) {
            return 0;
        }

        id =
            Number(
                container.nextId
            );

        if (
            isNaN(id) ||
            id < 1
        ) {

            id = 1;
        }

        container.nextId =
            id + 1;

        return id;
    };

    // =========================================================================
    // ACCESSORS INTO OTHER MODULES (defensive, never throw)
    // =========================================================================

    AIH.Goals._value = function(key) {

        var value;

        if (
            typeof AIH.Values === "undefined" ||
            !AIH.Values.getValue
        ) {

            return 0.5;
        }

        value =
            Number(
                AIH.Values.getValue(key)
            );

        return isNaN(value) ?
            0.5 :
            AIH.Goals._clamp01(value);
    };

    AIH.Goals._emotion = function(key) {

        var emotions;
        var value;

        if (typeof AIH.Emotions === "undefined") {
            return 0.5;
        }

        if (AIH.Emotions.getValue) {

            value =
                Number(
                    AIH.Emotions.getValue(key)
                );

            if (!isNaN(value)) {
                return AIH.Goals._clamp01(value);
            }
        }

        if (AIH.Emotions.get) {

            emotions =
                AIH.Emotions.get();

            if (
                emotions &&
                emotions[key] !== undefined
            ) {

                value =
                    Number(emotions[key]);

                if (!isNaN(value)) {
                    return AIH.Goals._clamp01(value);
                }
            }
        }

        return 0.5;
    };

    /*
     * Emotional pressure relevant to a goal's category. Kept as a single
     * small lookup rather than scattered special cases, and easy to extend
     * if new goal categories are added later.
     */
    AIH.Goals.CATEGORY_EMOTION_PRESSURE = {

        survival: ["fear", "stress"],
        power: ["confidence", "anger"],
        status: ["embarrassment", "pride"],
        dignity: ["embarrassment", "anger"],
        wealth: ["greed"],
        freedom: ["frustration"],
        comfort: ["fatigue", "stress"],
        modesty: ["embarrassment"],
        pleasure: ["excitement"],
        campaign: ["confidence"]

    };

    AIH.Goals._emotionalPressure = function(goal) {

        var keys;
        var total;
        var i;

        keys =
            AIH.Goals.CATEGORY_EMOTION_PRESSURE[goal.category];

        if (!keys) {
            return 0.5;
        }

        total = 0;

        for (
            i = 0;
            i < keys.length;
            i++
        ) {

            total +=
                AIH.Goals._emotion(keys[i]);
        }

        return AIH.Goals._clamp01(
            total / keys.length
        );
    };

    // =========================================================================
    // LOGGING A HISTORY EVENT ONTO A GOAL
    // =========================================================================

    AIH.Goals._logHistory = function(
        goal,
        event,
        note
    ) {

        if (!Array.isArray(goal.history)) {
            goal.history = [];
        }

        goal.history.push({

            timestamp: Date.now(),
            event: String(event || ""),
            note: note !== undefined ? note : null
        });

        goal.updatedAt =
            Date.now();

        goal.updateCount =
            (goal.updateCount || 0) + 1;
    };

    // =========================================================================
    // CREATE A GOAL
    // =========================================================================
    //
    // The general-purpose creation function. Seed goals use this
    // internally through AIH.Goals.seed(); emergent/external goals are
    // expected to be created by other modules calling this directly.
    //
    // =========================================================================

    AIH.Goals.create = function(data) {

        var container;
        var goal;

        container =
            AIH.Goals._ensure();

        if (!container) {
            return null;
        }

        data =
            data || {};

        if (!data.description) {
            return null;
        }

        goal = {

            id:
                AIH.Goals._nextId(),

            description:
                String(data.description),

            category:
                String(data.category || "general"),

            origin:
                AIH.Goals._isValidOrigin(data.origin) ?
                    data.origin :
                    "emergent",

            status:
                AIH.Goals._isValidStatus(data.status) ?
                    data.status :
                    (data.origin === "external" ? "proposed" : "active"),

            progress:
                AIH.Goals._clamp01(data.progress || 0),

            baseWeight:
                data.baseWeight !== undefined ?
                    AIH.Goals._clamp01(data.baseWeight) :
                    0.5,

            urgency:
                data.urgency !== undefined ?
                    AIH.Goals._clamp01(data.urgency) :
                    null,

            deadline:
                data.deadline !== undefined ?
                    data.deadline :
                    null,

            parentGoalId:
                data.parentGoalId !== undefined ?
                    data.parentGoalId :
                    null,

            childGoalIds: [],

            linkedValues:
                Array.isArray(data.linkedValues) ?
                    data.linkedValues.slice() :
                    [],

            linkedBeliefIds:
                Array.isArray(data.linkedBeliefIds) ?
                    data.linkedBeliefIds.slice() :
                    [],

            linkedHypothesisIds:
                Array.isArray(data.linkedHypothesisIds) ?
                    data.linkedHypothesisIds.slice() :
                    [],

            relatedFaction:
                data.relatedFaction || null,

            relatedNpcId:
                data.relatedNpcId || null,

            conflictsWith:
                Array.isArray(data.conflictsWith) ?
                    data.conflictsWith.slice() :
                    [],

            createdAt:
                Date.now(),

            updatedAt:
                Date.now(),

            updateCount: 0,

            history: [],

            resolutionReason: null

        };

        AIH.Goals._logHistory(
            goal,
            "created",
            data.reason || null
        );

        container.items.push(goal);

        if (goal.parentGoalId) {

            AIH.Goals._addChild(
                goal.parentGoalId,
                goal.id
            );
        }

        return AIH.Goals._copy(goal);
    };

    // =========================================================================
    // ADD A CHILD REFERENCE TO A PARENT GOAL
    // =========================================================================

    AIH.Goals._addChild = function(
        parentId,
        childId
    ) {

        var parent;

        parent =
            AIH.Goals._findRaw(parentId);

        if (!parent) {
            return;
        }

        if (!Array.isArray(parent.childGoalIds)) {
            parent.childGoalIds = [];
        }

        if (parent.childGoalIds.indexOf(childId) < 0) {
            parent.childGoalIds.push(childId);
        }
    };

    // =========================================================================
    // ADD A SUBGOAL TO AN EXISTING GOAL
    // =========================================================================

    AIH.Goals.addSubgoal = function(
        parentId,
        data
    ) {

        var parent;

        parent =
            AIH.Goals._findRaw(parentId);

        if (!parent) {
            return null;
        }

        data =
            data || {};

        data.parentGoalId =
            parentId;

        if (
            !Array.isArray(data.linkedValues) ||
            data.linkedValues.length === 0
        ) {

            data.linkedValues =
                parent.linkedValues.slice();
        }

        return AIH.Goals.create(data);
    };

    // =========================================================================
    // FIND (INTERNAL, RETURNS LIVE REFERENCE)
    // =========================================================================

    AIH.Goals._findRaw = function(id) {

        var container;
        var i;

        container =
            AIH.Goals._ensure();

        if (!container) {
            return null;
        }

        id = Number(id);

        for (
            i = 0;
            i < container.items.length;
            i++
        ) {

            if (container.items[i].id === id) {
                return container.items[i];
            }
        }

        return null;
    };

    // =========================================================================
    // GET (RETURNS A COPY)
    // =========================================================================

    AIH.Goals.get = function(id) {

        var goal;

        goal =
            AIH.Goals._findRaw(id);

        return goal ?
            AIH.Goals._copy(goal) :
            null;
    };

    // =========================================================================
    // ALL
    // =========================================================================

    AIH.Goals.all = function() {

        var container;

        container =
            AIH.Goals._ensure();

        if (!container) {
            return [];
        }

        return AIH.Goals._copy(
            container.items
        );
    };

    // =========================================================================
    // QUERY HELPERS
    // =========================================================================

    AIH.Goals.getByStatus = function(status) {

        return AIH.Goals.all().filter(
            function(goal) {
                return goal.status === status;
            }
        );
    };

    AIH.Goals.getByCategory = function(category) {

        return AIH.Goals.all().filter(
            function(goal) {
                return goal.category === category;
            }
        );
    };

    AIH.Goals.getByOrigin = function(origin) {

        return AIH.Goals.all().filter(
            function(goal) {
                return goal.origin === origin;
            }
        );
    };

    AIH.Goals.getChildren = function(parentId) {

        parentId = Number(parentId);

        return AIH.Goals.all().filter(
            function(goal) {
                return goal.parentGoalId === parentId;
            }
        );
    };

    AIH.Goals.getRoots = function() {

        return AIH.Goals.all().filter(
            function(goal) {
                return !goal.parentGoalId;
            }
        );
    };

    /*
     * Kept for interface parity with the fallback branch already written
     * into AIH_SocialDecision._getGoalContext(), which checks for this
     * function if getDecisionContext() is not present. getDecisionContext()
     * below is the primary path and is always present in this file, so
     * that fallback branch is not actually exercised - this exists purely
     * so nothing breaks if only part of this file is ever copied elsewhere.
     */
    AIH.Goals.getActive = function() {

        return AIH.Goals.getByStatus("active");
    };

    // =========================================================================
    // PRIORITY
    // =========================================================================
    //
    // Computed on request, not stored. Blends the goal's foundational
    // weight with her current values, urgency, relevant emotional
    // pressure, and recent progress/setbacks. Anything not "active" scores
    // zero so callers do not have to filter status themselves before
    // sorting.
    //
    // =========================================================================

    AIH.Goals.getPriority = function(id) {

        var goal;
        var valuesAlignment;
        var i;
        var emotionalPressure;
        var urgency;
        var momentum;
        var score;

        goal =
            AIH.Goals._findRaw(id);

        if (!goal) {
            return 0;
        }

        if (goal.status === "suspended") {
            return AIH.Goals._clamp01(goal.baseWeight * 0.15);
        }

        if (goal.status !== "active") {
            return 0;
        }

        valuesAlignment = 0.5;

        if (
            Array.isArray(goal.linkedValues) &&
            goal.linkedValues.length > 0
        ) {

            valuesAlignment = 0;

            for (
                i = 0;
                i < goal.linkedValues.length;
                i++
            ) {

                valuesAlignment +=
                    AIH.Goals._value(goal.linkedValues[i]);
            }

            valuesAlignment =
                valuesAlignment / goal.linkedValues.length;
        }

        emotionalPressure =
            AIH.Goals._emotionalPressure(goal);

        urgency =
            goal.urgency !== null ?
                goal.urgency :
                0.4;

        /*
         * A goal that has made no progress in its last few history entries
         * gets a small bump, modelling how a stalled goal starts to press
         * on her attention more, without the runaway "frustration ->
         * always escalate" shortcut the project rules warn against - this
         * is a small, bounded nudge, not a threshold-triggered mode
         * switch.
         */
        momentum =
            AIH.Goals._stalledBump(goal);

        score =
            (goal.baseWeight * 0.35) +
            (valuesAlignment * 0.30) +
            (emotionalPressure * 0.15) +
            (urgency * 0.15) +
            (momentum * 0.05);

        return AIH.Goals._clamp01(score);
    };

    AIH.Goals._stalledBump = function(goal) {

        var recent;
        var i;
        var progressEvents;

        if (
            !Array.isArray(goal.history) ||
            goal.history.length < 3
        ) {

            return 0;
        }

        recent =
            goal.history.slice(-3);

        progressEvents = 0;

        for (
            i = 0;
            i < recent.length;
            i++
        ) {

            if (recent[i].event === "progress") {
                progressEvents++;
            }
        }

        return progressEvents === 0 ? 1 : 0;
    };

    AIH.Goals.getPrioritized = function() {

        var active;

        active =
            AIH.Goals.getByStatus("active");

        active.forEach(
            function(goal) {

                goal.priority =
                    AIH.Goals.getPriority(goal.id);
            }
        );

        active.sort(
            function(a, b) {
                return b.priority - a.priority;
            }
        );

        return active;
    };

    // =========================================================================
    // CONFLICTS
    // =========================================================================
    //
    // Surfaces tension between active goals. Does not resolve anything -
    // a decision system is expected to consume this.
    //
    // =========================================================================

    AIH.Goals.getConflicts = function() {

        var active;
        var conflicts;
        var i;
        var j;
        var a;
        var b;
        var tension;

        active =
            AIH.Goals.getByStatus("active");

        conflicts = [];

        for (
            i = 0;
            i < active.length;
            i++
        ) {

            for (
                j = i + 1;
                j < active.length;
                j++
            ) {

                a = active[i];
                b = active[j];

                if (
                    a.conflictsWith.indexOf(b.id) >= 0 ||
                    b.conflictsWith.indexOf(a.id) >= 0
                ) {

                    conflicts.push({
                        goalA: a.id,
                        goalB: b.id,
                        reason: "explicit"
                    });

                    continue;
                }

                tension =
                    AIH.Goals._valueTension(
                        a.linkedValues,
                        b.linkedValues
                    );

                if (tension) {

                    conflicts.push({
                        goalA: a.id,
                        goalB: b.id,
                        reason: "value_tension",
                        values: tension
                    });
                }
            }
        }

        return conflicts;
    };

    AIH.Goals._valueTension = function(
        valuesA,
        valuesB
    ) {

        var i;
        var pair;

        for (
            i = 0;
            i < AIH.Goals.VALUE_TENSIONS.length;
            i++
        ) {

            pair =
                AIH.Goals.VALUE_TENSIONS[i];

            if (
                (
                    valuesA.indexOf(pair[0]) >= 0 &&
                    valuesB.indexOf(pair[1]) >= 0
                ) ||
                (
                    valuesA.indexOf(pair[1]) >= 0 &&
                    valuesB.indexOf(pair[0]) >= 0
                )
            ) {

                return pair;
            }
        }

        return null;
    };

    // =========================================================================
    // DECISION CONTEXT
    // =========================================================================
    //
    // Satisfies the contract already expected by
    // AIH.SocialDecision._getGoalContext(): { relevance, priorities,
    // activeGoal }. This module adds extra fields on top (activeGoals,
    // conflicts) which that caller ignores safely, since it only reads the
    // three fields it already knows about.
    //
    // =========================================================================

    AIH.Goals.getDecisionContext = function(situationData) {

        var prioritized;
        var priorities;
        var i;
        var goal;
        var relevance;

        prioritized =
            AIH.Goals.getPrioritized();

        priorities = {};

        for (
            i = 0;
            i < prioritized.length;
            i++
        ) {

            goal = prioritized[i];

            priorities[goal.category] =
                Math.max(
                    priorities[goal.category] || 0,
                    goal.priority
                );
        }

        relevance =
            prioritized.length > 0 ?
                prioritized[0].priority :
                0.3;

        return {

            relevance:
                AIH.Goals._clamp01(relevance),

            priorities:
                priorities,

            activeGoal:
                prioritized.length > 0 ?
                    prioritized[0] :
                    null,

            activeGoals:
                prioritized,

            conflicts:
                AIH.Goals.getConflicts()
        };
    };

    // =========================================================================
    // STATUS TRANSITIONS
    // =========================================================================

    AIH.Goals.setStatus = function(
        id,
        status,
        reason
    ) {

        var goal;

        if (!AIH.Goals._isValidStatus(status)) {
            return null;
        }

        goal =
            AIH.Goals._findRaw(id);

        if (!goal) {
            return null;
        }

        goal.status =
            status;

        if (
            status === "completed" ||
            status === "failed" ||
            status === "abandoned"
        ) {

            goal.resolutionReason =
                reason || null;
        }

        AIH.Goals._logHistory(
            goal,
            "status_changed_to_" + status,
            reason || null
        );

        return AIH.Goals._copy(goal);
    };

    AIH.Goals.activate = function(id, reason) {
        return AIH.Goals.setStatus(id, "active", reason);
    };

    AIH.Goals.suspend = function(id, reason) {
        return AIH.Goals.setStatus(id, "suspended", reason);
    };

    AIH.Goals.resume = function(id, reason) {
        return AIH.Goals.setStatus(id, "active", reason);
    };

    AIH.Goals.complete = function(id, reason) {
        return AIH.Goals.setStatus(id, "completed", reason);
    };

    AIH.Goals.fail = function(id, reason) {
        return AIH.Goals.setStatus(id, "failed", reason);
    };

    AIH.Goals.abandon = function(id, reason) {
        return AIH.Goals.setStatus(id, "abandoned", reason);
    };

    // =========================================================================
    // PROGRESS
    // =========================================================================

    AIH.Goals.updateProgress = function(
        id,
        progress,
        note
    ) {

        var goal;

        goal =
            AIH.Goals._findRaw(id);

        if (!goal) {
            return null;
        }

        goal.progress =
            AIH.Goals._clamp01(progress);

        AIH.Goals._logHistory(
            goal,
            "progress",
            note !== undefined ?
                note :
                goal.progress
        );

        if (goal.progress >= 1) {

            AIH.Goals.complete(
                id,
                note || "progress reached completion"
            );
        }

        return AIH.Goals.get(id);
    };

    // =========================================================================
    // SEED / RESET
    // =========================================================================

    AIH.Goals.seed = function() {

        var keyToId;
        var i;
        var template;
        var parentId;
        var created;

        keyToId = {};

        for (
            i = 0;
            i < AIH.Goals.SEED_GOALS.length;
            i++
        ) {

            template =
                AIH.Goals.SEED_GOALS[i];

            parentId =
                template.parentKey ?
                    (keyToId[template.parentKey] || null) :
                    null;

            created =
                AIH.Goals.create({

                    description: template.description,
                    category: template.category,
                    origin: "seed",
                    status: "active",
                    baseWeight: template.baseWeight,
                    linkedValues: template.linkedValues,
                    parentGoalId: parentId,
                    reason: "seeded at initialization"

                });

            if (created) {
                keyToId[template.key] = created.id;
            }
        }

        return AIH.Goals.all();
    };

    AIH.Goals.clear = function() {

        var container;

        container =
            AIH.Goals._ensure();

        if (!container) {
            return;
        }

        container.items = [];
        container.nextId = 1;
    };

    AIH.Goals.reset = function() {

        AIH.Goals.clear();

        return AIH.Goals.seed();
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Goals.initialize = function() {

        var container;

        container =
            AIH.Goals._ensure();

        if (!container) {
            return;
        }

        if (container.items.length === 0) {
            AIH.Goals.seed();
        }

        AIH.Goals._initialized =
            true;

        if (
            typeof AIH.Debug !== "undefined" &&
            AIH.Debug.log
        ) {

            AIH.Debug.log(
                "Goal system initialized."
            );
        }
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register(
            "Goals",
            {
                version:
                    AIH.Goals.VERSION,

                initialize: function() {
                    AIH.Goals.initialize();
                },

                get: function(id) {
                    return AIH.Goals.get(id);
                },

                all: function() {
                    return AIH.Goals.all();
                },

                create: function(data) {
                    return AIH.Goals.create(data);
                },

                getPrioritized: function() {
                    return AIH.Goals.getPrioritized();
                },

                getConflicts: function() {
                    return AIH.Goals.getConflicts();
                },

                getDecisionContext: function(situationData) {
                    return AIH.Goals.getDecisionContext(situationData);
                }
            }
        );
    }

    // =========================================================================
    // SHOW
    // =========================================================================

    if (typeof PluginManager !== "undefined") {

        PluginManager.registerCommand(
            "AIH_Goals",
            "Show",
            function() {

                AIH.Debug.inspect(
                    "Current AI goals:",
                    AIH.Goals.all()
                );
            }
        );

        // =========================================================================
        // SHOW ACTIVE
        // =========================================================================

        PluginManager.registerCommand(
            "AIH_Goals",
            "ShowActive",
            function() {

                AIH.Debug.inspect(
                    "Active AI goals (by priority):",
                    AIH.Goals.getPrioritized()
                );
            }
        );

        // =========================================================================
        // RESEED
        // =========================================================================

        PluginManager.registerCommand(
            "AIH_Goals",
            "Reseed",
            function() {

                AIH.Goals.reset();
            }
        );

        // =========================================================================
        // CLEAR
        // =========================================================================

        PluginManager.registerCommand(
            "AIH_Goals",
            "Clear",
            function() {

                AIH.Goals.clear();
            }
        );
    }

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    if (typeof DataManager !== "undefined") {

        var _AIH_Goals_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_Goals_createGameObjects.call(
                this
            );

            AIH.Goals.initialize();
        };

        // =========================================================================
        // NEW GAME
        // =========================================================================

        var _AIH_Goals_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_Goals_setupNewGame.call(
                this
            );

            AIH.Goals._initialized =
                false;

            AIH.Goals.initialize();
        };

        // =========================================================================
        // SAVE LOAD
        // =========================================================================

        var _AIH_Goals_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents =
            function(contents) {

                _AIH_Goals_extractSaveContents.call(
                    this,
                    contents
                );

                AIH.Goals._initialized =
                    false;

                AIH.Goals.initialize();
            };
    }

})();