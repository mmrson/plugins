/*:
 * @plugindesc AI Hero Framework - Causal Hypothesis System v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - CAUSAL HYPOTHESIS SYSTEM
 * ============================================================================
 *
 * STEP 13
 *
 * Stores tentative explanations that the AI Hero may develop from experience.
 *
 * IMPORTANT:
 *
 * A hypothesis is NOT a fact.
 *
 * A hypothesis is a proposed explanation that may later be supported,
 * contradicted, revised or abandoned.
 *
 * Example:
 *
 *     Observation:
 *         Dodge failures occurred while heavy equipment was equipped.
 *
 *     Hypothesis:
 *         "Heavy equipment may interfere with mobility."
 *
 * The module stores the hypothesis.
 *
 * It does NOT declare that the hypothesis is true.
 *
 * ============================================================================
 *
 * RESPONSIBILITIES
 *
 * This module:
 *
 * - creates hypotheses
 * - stores hypotheses
 * - tracks confidence
 * - tracks supporting evidence
 * - tracks contradicting evidence
 * - records tests
 * - records test outcomes
 * - tracks hypothesis status
 * - allows hypotheses to be linked to beliefs
 *
 * This module does NOT:
 *
 * - decide what hypothesis should exist
 * - invent causal explanations by itself
 * - determine causality
 * - make decisions
 * - modify personality
 * - modify values
 * - modify emotions
 * - execute actions
 * - call the LLM
 *
 * Later, the AI Core / LLM layer may propose hypotheses.
 *
 * The game validates the resulting data before storing it.
 *
 * ============================================================================
 *
 * HYPOTHESIS STRUCTURE
 *
 * id
 * proposition
 * confidence
 * category
 * status
 * createdAt
 * updatedAt
 * updateCount
 * supportingEvidence
 * contradictingEvidence
 * tests
 * linkedBeliefId
 * metadata
 *
 * ============================================================================
 *
 * STATUS
 *
 * proposed
 * testing
 * supported
 * weakened
 * rejected
 * abandoned
 *
 * ============================================================================
 *
 * @command Show
 * @text Show Hypotheses
 * @desc Displays all current hypotheses.
 *
 * @command Clear
 * @text Clear Hypotheses
 * @desc Clears all hypotheses.
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    AIH.Hypotheses =
        AIH.Hypotheses || {};

    AIH.Hypotheses.VERSION =
        "0.1.0";

    AIH.Hypotheses.SCHEMA_VERSION =
        1;

    AIH.Hypotheses._initialized =
        false;

    // =========================================================================
    // COPY
    // =========================================================================

    AIH.Hypotheses._copy = function(value) {

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

    AIH.Hypotheses._clamp01 = function(value) {

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
    // VALID STATUS
    // =========================================================================

    AIH.Hypotheses._validStatus = function(
        status
    ) {

        status =
            String(
                status || "proposed"
            );

        return (
            status === "proposed" ||
            status === "testing" ||
            status === "supported" ||
            status === "weakened" ||
            status === "rejected" ||
            status === "abandoned"
        );
    };

    // =========================================================================
    // PERSISTENT STATE
    // =========================================================================

    AIH.Hypotheses._state = function() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    };

    // =========================================================================
    // ENSURE CONTAINER
    // =========================================================================

    AIH.Hypotheses._ensure = function() {

        var state;

        state =
            AIH.Hypotheses._state();

        if (!state) {
            return null;
        }

        if (!state.hypotheses) {

            state.hypotheses = {

                schemaVersion:
                    AIH.Hypotheses.SCHEMA_VERSION,

                nextId: 1,

                items: []
            };
        }

        /*
         * Migration protection in case the State module previously created
         * hypotheses as a plain object.
         */

        if (
            Array.isArray(
                state.hypotheses
            )
        ) {

            state.hypotheses = {

                schemaVersion:
                    AIH.Hypotheses.SCHEMA_VERSION,

                nextId: 1,

                items:
                    state.hypotheses
            };
        }

        if (
            state.hypotheses.schemaVersion ===
            undefined
        ) {

            state.hypotheses.schemaVersion =
                AIH.Hypotheses.SCHEMA_VERSION;
        }

        if (
            !Array.isArray(
                state.hypotheses.items
            )
        ) {

            state.hypotheses.items = [];
        }

        if (
            state.hypotheses.nextId ===
            undefined
        ) {

            state.hypotheses.nextId =
                1;
        }

        return state.hypotheses;
    };

    // =========================================================================
    // INITIALIZE
    // =========================================================================

    AIH.Hypotheses.initialize = function() {

        var hypotheses;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return;
        }

        AIH.Hypotheses._initialized =
            true;

        AIH.Debug.log(
            "Causal hypothesis system initialized."
        );
    };

    // =========================================================================
    // NEXT ID
    // =========================================================================

    AIH.Hypotheses._nextId = function() {

        var hypotheses;
        var id;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return 0;
        }

        id =
            Number(
                hypotheses.nextId
            );

        if (
            isNaN(id) ||
            id < 1
        ) {

            id = 1;
        }

        hypotheses.nextId =
            id + 1;

        return id;
    };

    // =========================================================================
    // FIND
    // =========================================================================

    AIH.Hypotheses._find = function(
        proposition
    ) {

        var hypotheses;
        var i;
        var hypothesis;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return null;
        }

        for (
            i = 0;
            i < hypotheses.items.length;
            i++
        ) {

            hypothesis =
                hypotheses.items[i];

            if (
                hypothesis.proposition ===
                proposition
            ) {

                return hypothesis;
            }
        }

        return null;
    };

    // =========================================================================
    // CREATE
    // =========================================================================

    AIH.Hypotheses.create = function(
        proposition,
        confidence,
        options
    ) {

        var now;
        var hypothesis;

        options =
            options || {};

        proposition =
            String(
                proposition || ""
            );

        if (!proposition) {
            return null;
        }

        now =
            Date.now();

        hypothesis = {

            id:
                AIH.Hypotheses._nextId(),

            proposition:
                proposition,

            confidence:
                AIH.Hypotheses._clamp01(
                    confidence
                ),

            category:
                String(
                    options.category ||
                    "causal"
                ),

            status:
                AIH.Hypotheses._validStatus(
                    options.status
                )
                    ? String(
                        options.status ||
                        "proposed"
                    )
                    : "proposed",

            createdAt:
                now,

            updatedAt:
                now,

            updateCount:
                0,

            supportingEvidence: [],

            contradictingEvidence: [],

            tests: [],

            linkedBeliefId:
                options.linkedBeliefId !==
                undefined
                    ? Number(
                        options.linkedBeliefId
                    )
                    : null,

            metadata:
                AIH.Hypotheses._copy(
                    options.metadata || {}
                )
        };

        return hypothesis;
    };

    // =========================================================================
    // ADD
    // =========================================================================

    AIH.Hypotheses.add = function(
        proposition,
        confidence,
        options
    ) {

        var hypotheses;
        var existing;
        var hypothesis;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return null;
        }

        proposition =
            String(
                proposition || ""
            );

        if (!proposition) {
            return null;
        }

        existing =
            AIH.Hypotheses._find(
                proposition
            );

        if (existing) {

            return AIH.Hypotheses._copy(
                existing
            );
        }

        hypothesis =
            AIH.Hypotheses.create(
                proposition,
                confidence,
                options
            );

        if (!hypothesis) {
            return null;
        }

        hypotheses.items.push(
            hypothesis
        );

        AIH.Events.emit(
            "HYPOTHESIS_CREATED",
            {
                hypothesis:
                    AIH.Hypotheses._copy(
                        hypothesis
                    )
            }
        );

        return AIH.Hypotheses._copy(
            hypothesis
        );
    };

    // =========================================================================
    // GET
    // =========================================================================

    AIH.Hypotheses.get = function(
        id
    ) {

        var hypotheses;
        var numericId;
        var i;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return null;
        }

        numericId =
            Number(id);

        for (
            i = 0;
            i < hypotheses.items.length;
            i++
        ) {

            if (
                hypotheses.items[i].id ===
                numericId
            ) {

                return AIH.Hypotheses._copy(
                    hypotheses.items[i]
                );
            }
        }

        return null;
    };

    // =========================================================================
    // GET BY PROPOSITION
    // =========================================================================

    AIH.Hypotheses.getByProposition =
        function(
            proposition
        ) {

            var hypothesis;

            proposition =
                String(
                    proposition || ""
                );

            hypothesis =
                AIH.Hypotheses._find(
                    proposition
                );

            if (!hypothesis) {
                return null;
            }

            return AIH.Hypotheses._copy(
                hypothesis
            );
        };

    // =========================================================================
    // ALL
    // =========================================================================

    AIH.Hypotheses.all = function() {

        var hypotheses;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return [];
        }

        return AIH.Hypotheses._copy(
            hypotheses.items
        );
    };

    // =========================================================================
    // COUNT
    // =========================================================================

    AIH.Hypotheses.count = function() {

        var hypotheses;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return 0;
        }

        return hypotheses.items.length;
    };

    // =========================================================================
    // UPDATE CONFIDENCE
    // =========================================================================

    AIH.Hypotheses.updateConfidence =
        function(
            id,
            newConfidence,
            evidence
        ) {

            var hypotheses;
            var numericId;
            var i;
            var hypothesis;
            var oldConfidence;
            var record;

            hypotheses =
                AIH.Hypotheses._ensure();

            if (!hypotheses) {
                return null;
            }

            numericId =
                Number(id);

            for (
                i = 0;
                i < hypotheses.items.length;
                i++
            ) {

                hypothesis =
                    hypotheses.items[i];

                if (
                    hypothesis.id !==
                    numericId
                ) {

                    continue;
                }

                oldConfidence =
                    AIH.Hypotheses._clamp01(
                        hypothesis.confidence
                    );

                hypothesis.confidence =
                    AIH.Hypotheses._clamp01(
                        newConfidence
                    );

                hypothesis.updatedAt =
                    Date.now();

                hypothesis.updateCount +=
                    1;

                if (evidence) {

                    record =
                        AIH.Hypotheses._copy(
                            evidence
                        );

                    if (
                        record.supports ===
                        true
                    ) {

                        hypothesis.supportingEvidence.push(
                            record
                        );
                    }

                    if (
                        record.contradicts ===
                        true
                    ) {

                        hypothesis.contradictingEvidence.push(
                            record
                        );
                    }
                }

                AIH.Events.emit(
                    "HYPOTHESIS_UPDATED",
                    {
                        hypothesis:
                            AIH.Hypotheses._copy(
                                hypothesis
                            ),

                        previousConfidence:
                            oldConfidence,

                        confidence:
                            hypothesis.confidence
                    }
                );

                return AIH.Hypotheses._copy(
                    hypothesis
                );
            }

            return null;
        };

    // =========================================================================
    // SET STATUS
    // =========================================================================

    AIH.Hypotheses.setStatus = function(
        id,
        status
    ) {

        var hypotheses;
        var numericId;
        var i;
        var hypothesis;
        var oldStatus;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return null;
        }

        status =
            String(
                status || ""
            );

        if (
            !AIH.Hypotheses._validStatus(
                status
            )
        ) {

            return null;
        }

        numericId =
            Number(id);

        for (
            i = 0;
            i < hypotheses.items.length;
            i++
        ) {

            hypothesis =
                hypotheses.items[i];

            if (
                hypothesis.id !==
                numericId
            ) {

                continue;
            }

            oldStatus =
                hypothesis.status;

            hypothesis.status =
                status;

            hypothesis.updatedAt =
                Date.now();

            hypothesis.updateCount +=
                1;

            AIH.Events.emit(
                "HYPOTHESIS_STATUS_CHANGED",
                {
                    hypothesis:
                        AIH.Hypotheses._copy(
                            hypothesis
                        ),

                    previousStatus:
                        oldStatus,

                    status:
                        status
                }
            );

            return AIH.Hypotheses._copy(
                hypothesis
            );
        }

        return null;
    };

    // =========================================================================
    // ADD EVIDENCE
    // =========================================================================

    AIH.Hypotheses.addEvidence =
        function(
            id,
            evidence
        ) {

            var hypotheses;
            var numericId;
            var i;
            var hypothesis;
            var record;

            hypotheses =
                AIH.Hypotheses._ensure();

            if (!hypotheses) {
                return false;
            }

            numericId =
                Number(id);

            record =
                AIH.Hypotheses._copy(
                    evidence || {}
                );

            for (
                i = 0;
                i < hypotheses.items.length;
                i++
            ) {

                hypothesis =
                    hypotheses.items[i];

                if (
                    hypothesis.id !==
                    numericId
                ) {

                    continue;
                }

                if (
                    record.supports ===
                    true
                ) {

                    hypothesis.supportingEvidence.push(
                        record
                    );
                }

                if (
                    record.contradicts ===
                    true
                ) {

                    hypothesis.contradictingEvidence.push(
                        record
                    );
                }

                hypothesis.updatedAt =
                    Date.now();

                return true;
            }

            return false;
        };

    // =========================================================================
    // BEGIN TEST
    // =========================================================================
    //
    // This does not perform the test.
    //
    // It records the intention that a hypothesis is currently being tested.
    //
    // The eventual Decision / Action system will actually perform the test.
    //
    // =========================================================================

    AIH.Hypotheses.beginTest = function(
        id,
        testData
    ) {

        var hypotheses;
        var numericId;
        var i;
        var hypothesis;
        var test;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return null;
        }

        numericId =
            Number(id);

        for (
            i = 0;
            i < hypotheses.items.length;
            i++
        ) {

            hypothesis =
                hypotheses.items[i];

            if (
                hypothesis.id !==
                numericId
            ) {

                continue;
            }

            test = {

                testId:
                    hypothesis.tests.length + 1,

                startedAt:
                    Date.now(),

                completedAt:
                    null,

                status:
                    "active",

                description:
                    String(
                        testData &&
                        testData.description
                            ? testData.description
                            : ""
                    ),

                expectedOutcome:
                    AIH.Hypotheses._copy(
                        testData &&
                        testData.expectedOutcome
                            ? testData.expectedOutcome
                            : null
                    ),

                actualOutcome:
                    null,

                observations:
                    AIH.Hypotheses._copy(
                        testData &&
                        testData.observations
                            ? testData.observations
                            : []
                    ),

                metadata:
                    AIH.Hypotheses._copy(
                        testData &&
                        testData.metadata
                            ? testData.metadata
                            : {}
                    )
            };

            hypothesis.tests.push(
                test
            );

            hypothesis.status =
                "testing";

            hypothesis.updatedAt =
                Date.now();

            AIH.Events.emit(
                "HYPOTHESIS_TEST_STARTED",
                {
                    hypothesis:
                        AIH.Hypotheses._copy(
                            hypothesis
                        ),

                    test:
                        AIH.Hypotheses._copy(
                            test
                        )
                }
            );

            return AIH.Hypotheses._copy(
                test
            );
        }

        return null;
    };

    // =========================================================================
    // COMPLETE TEST
    // =========================================================================
    //
    // This records what actually happened.
    //
    // It does NOT automatically decide whether the hypothesis was correct.
    //
    // The caller supplies the resulting evidence and updated confidence.
    //
    // =========================================================================

    AIH.Hypotheses.completeTest =
        function(
            id,
            testId,
            result
        ) {

            var hypotheses;
            var numericId;
            var numericTestId;
            var i;
            var j;
            var hypothesis;
            var test;

            hypotheses =
                AIH.Hypotheses._ensure();

            if (!hypotheses) {
                return null;
            }

            numericId =
                Number(id);

            numericTestId =
                Number(testId);

            result =
                result || {};

            for (
                i = 0;
                i < hypotheses.items.length;
                i++
            ) {

                hypothesis =
                    hypotheses.items[i];

                if (
                    hypothesis.id !==
                    numericId
                ) {

                    continue;
                }

                for (
                    j = 0;
                    j < hypothesis.tests.length;
                    j++
                ) {

                    test =
                        hypothesis.tests[j];

                    if (
                        test.testId !==
                        numericTestId
                    ) {

                        continue;
                    }

                    test.status =
                        String(
                            result.status ||
                            "completed"
                        );

                    test.completedAt =
                        Date.now();

                    test.actualOutcome =
                        AIH.Hypotheses._copy(
                            result.actualOutcome ||
                            null
                        );

                    if (
                        result.observations
                    ) {

                        test.observations =
                            AIH.Hypotheses._copy(
                                result.observations
                            );
                    }

                    if (
                        result.metadata
                    ) {

                        test.metadata =
                            AIH.Hypotheses._copy(
                                result.metadata
                            );
                    }

                    hypothesis.updatedAt =
                        Date.now();

                    AIH.Events.emit(
                        "HYPOTHESIS_TEST_COMPLETED",
                        {
                            hypothesis:
                                AIH.Hypotheses._copy(
                                    hypothesis
                                ),

                            test:
                                AIH.Hypotheses._copy(
                                    test
                                )
                        }
                    );

                    return AIH.Hypotheses._copy(
                        test
                    );
                }
            }

            return null;
        };

    // =========================================================================
    // LINK BELIEF
    // =========================================================================
    //
    // A hypothesis may eventually support a belief.
    //
    // This method only creates the relationship.
    //
    // It does NOT automatically create or update the belief.
    //
    // =========================================================================

    AIH.Hypotheses.linkBelief = function(
        id,
        beliefId
    ) {

        var hypotheses;
        var numericId;
        var numericBeliefId;
        var i;
        var hypothesis;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return null;
        }

        numericId =
            Number(id);

        numericBeliefId =
            Number(beliefId);

        if (
            isNaN(numericBeliefId) ||
            numericBeliefId < 1
        ) {

            return null;
        }

        for (
            i = 0;
            i < hypotheses.items.length;
            i++
        ) {

            hypothesis =
                hypotheses.items[i];

            if (
                hypothesis.id !==
                numericId
            ) {

                continue;
            }

            hypothesis.linkedBeliefId =
                numericBeliefId;

            hypothesis.updatedAt =
                Date.now();

            return AIH.Hypotheses._copy(
                hypothesis
            );
        }

        return null;
    };

    // =========================================================================
    // FIND BY STATUS
    // =========================================================================

    AIH.Hypotheses.findByStatus =
        function(
            status
        ) {

            var hypotheses;
            var result;
            var i;

            hypotheses =
                AIH.Hypotheses._ensure();

            if (!hypotheses) {
                return [];
            }

            status =
                String(
                    status || ""
                );

            result = [];

            for (
                i = 0;
                i < hypotheses.items.length;
                i++
            ) {

                if (
                    hypotheses.items[i].status ===
                    status
                ) {

                    result.push(
                        hypotheses.items[i]
                    );
                }
            }

            return AIH.Hypotheses._copy(
                result
            );
        };

    // =========================================================================
    // FIND BY CATEGORY
    // =========================================================================

    AIH.Hypotheses.findByCategory =
        function(
            category
        ) {

            var hypotheses;
            var result;
            var i;

            hypotheses =
                AIH.Hypotheses._ensure();

            if (!hypotheses) {
                return [];
            }

            category =
                String(
                    category || ""
                );

            result = [];

            for (
                i = 0;
                i < hypotheses.items.length;
                i++
            ) {

                if (
                    hypotheses.items[i].category ===
                    category
                ) {

                    result.push(
                        hypotheses.items[i]
                    );
                }
            }

            return AIH.Hypotheses._copy(
                result
            );
        };

    // =========================================================================
    // FIND BY MINIMUM CONFIDENCE
    // =========================================================================

    AIH.Hypotheses.findByMinimumConfidence =
        function(
            minimumConfidence
        ) {

            var hypotheses;
            var result;
            var minimum;
            var i;

            hypotheses =
                AIH.Hypotheses._ensure();

            if (!hypotheses) {
                return [];
            }

            minimum =
                AIH.Hypotheses._clamp01(
                    minimumConfidence
                );

            result = [];

            for (
                i = 0;
                i < hypotheses.items.length;
                i++
            ) {

                if (
                    hypotheses.items[i].confidence >=
                    minimum
                ) {

                    result.push(
                        hypotheses.items[i]
                    );
                }
            }

            return AIH.Hypotheses._copy(
                result
            );
        };

    // =========================================================================
    // CLEAR
    // =========================================================================

    AIH.Hypotheses.clear = function() {

        var hypotheses;

        hypotheses =
            AIH.Hypotheses._ensure();

        if (!hypotheses) {
            return false;
        }

        hypotheses.items = [];

        hypotheses.nextId = 1;

        AIH.Events.emit(
            "HYPOTHESES_CLEARED",
            {}
        );

        AIH.Debug.log(
            "AI causal hypotheses cleared."
        );

        return true;
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    AIH.Modules.register(
        "Hypotheses",
        {
            version:
                AIH.Hypotheses.VERSION,

            initialize: function() {

                AIH.Hypotheses.initialize();

            },

            get: function(id) {

                return AIH.Hypotheses.get(
                    id
                );

            },

            all: function() {

                return AIH.Hypotheses.all();

            },

            add: function(
                proposition,
                confidence,
                options
            ) {

                return AIH.Hypotheses.add(
                    proposition,
                    confidence,
                    options
                );

            },

            updateConfidence:
                function(
                    id,
                    confidence,
                    evidence
                ) {

                    return AIH.Hypotheses.updateConfidence(
                        id,
                        confidence,
                        evidence
                    );

                },

            beginTest:
                function(
                    id,
                    testData
                ) {

                    return AIH.Hypotheses.beginTest(
                        id,
                        testData
                    );

                },

            completeTest:
                function(
                    id,
                    testId,
                    result
                ) {

                    return AIH.Hypotheses.completeTest(
                        id,
                        testId,
                        result
                    );

                }
        }
    );

    // =========================================================================
    // SHOW
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Hypotheses",
        "Show",
        function() {

            AIH.Debug.inspect(
                "Current AI causal hypotheses:",
                AIH.Hypotheses.all()
            );

        }
    );

    // =========================================================================
    // CLEAR
    // =========================================================================

    PluginManager.registerCommand(
        "AIH_Hypotheses",
        "Clear",
        function() {

            AIH.Hypotheses.clear();

        }
    );

    // =========================================================================
    // INITIALIZATION HOOK
    // =========================================================================

    var _AIH_Hypotheses_createGameObjects =
        DataManager.createGameObjects;

    DataManager.createGameObjects =
        function() {

            _AIH_Hypotheses_createGameObjects.call(
                this
            );

            AIH.Hypotheses.initialize();

        };

    // =========================================================================
    // NEW GAME
    // =========================================================================

    var _AIH_Hypotheses_setupNewGame =
        DataManager.setupNewGame;

    DataManager.setupNewGame =
        function() {

            _AIH_Hypotheses_setupNewGame.call(
                this
            );

            AIH.Hypotheses._initialized =
                false;

            AIH.Hypotheses.initialize();

        };

    // =========================================================================
    // SAVE LOAD
    // =========================================================================

    var _AIH_Hypotheses_extractSaveContents =
        DataManager.extractSaveContents;

    DataManager.extractSaveContents =
        function(contents) {

            _AIH_Hypotheses_extractSaveContents.call(
                this,
                contents
            );

            AIH.Hypotheses._initialized =
                false;

            AIH.Hypotheses.initialize();

        };

})();