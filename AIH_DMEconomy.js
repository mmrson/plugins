/*:
 * @plugindesc AI Hero Framework - DM Economy (Contracts, Gifts, Hinder Market) v0.1.0
 * @author AI Hero Project
 *
 * @help
 * ============================================================================
 * AI HERO FRAMEWORK - DM ECONOMY
 * ============================================================================
 *
 * Three player-facing economic mechanics, all extending GM_Liveaudience.js
 * through its public API only (never editing that file, same boundary as
 * AIH_Edicts.js and AIH_ItemSteal.js). Requires GM_Liveaudience.js,
 * AIH_PressureEvaluator.js, and (for sponsor deals) whichever of
 * AIH_Personality/AIH_Emotions/AIH_Values are relevant to the deals you
 * define, loaded first.
 *
 * ============================================================================
 *
 * 1. AIH.DMContracts - "SECRET CHANNEL" DEALS
 *
 * Two kinds of outcome contract, both OUTCOME bets, never a lever that
 * forces the outcome itself - same rule as everywhere else in this
 * project: the player steers circumstance, he never buys the result
 * directly.
 *
 *   CHANNEL contracts  - "make her do X within N days." Watches for a
 *                        specific action tag (AIH.DMContracts.reportAction
 *                        (tag) - any minigame/event can call this when a
 *                        matching moment actually happens) inside a
 *                        day-count deadline. AIH.DMContracts.advanceDay()
 *                        is meant to be wired to whatever day/rest system
 *                        this project already has; this module doesn't
 *                        invent its own calendar.
 *
 *   SPONSOR deals      - "get her confidence below X%," "get her
 *                        inhibition to X%." Watches a personality/value/
 *                        emotion field crossing a threshold
 *                        (checkSponsorDeals(), meant to be polled
 *                        occasionally - see the performance note below -
 *                        not every frame).
 *
 * Both pay AIH.DMContracts' reward straight into LA.playerWallet on
 * completion (via LA.modifyPlayerWallet - this is the player's own
 * side-income, not audience-donation money, so it does NOT go through
 * LA.grantReward's cut-split logic). An expired contract simply expires -
 * no penalty beyond the time already spent, consistent with time being
 * the real anti-spam resource in this whole system.
 *
 * ============================================================================
 *
 * 2. AIH.GiftLedger - GIVING HER AN ITEM, WITH A TOLL
 *
 * offerGift(itemId, itemValue, viewerId) builds a request-shaped object
 * and evaluates it through LA.evaluateRequest - THE SAME evaluation as
 * any normal audience request, per explicit direction. If she accepts,
 * the item goes straight to her inventory - no LA.grantReward split at
 * all (a gift diluted by a cut isn't really a gift), but a toll is now
 * owed: itemValue * tollPercent (default 20%, adjustable).
 *
 * The toll itself is a second, separate decision - not something the
 * player can just take. She can pay it normally (gold moves from
 * $gameParty straight into LA.playerWallet - this is her paying him
 * directly, not audience money, so LA.grantReward's split doesn't apply
 * here either), OR the player can propose a waiver: forego the toll in
 * exchange for a specific demand instead. Whether she takes the waiver
 * is evaluated for real via AIH.PressureEvaluator (comparing the gold
 * saved against whatever the demand actually costs her) - this module
 * never decides that for her, and never invents what the demand means
 * in-fiction; that's the calling project's job once she's agreed to it.
 *
 * ============================================================================
 *
 * 3. AIH.HinderMarket - PAID INCIDENTS
 *
 * Wraps GM_Liveaudience.js's EXISTING LA.triggerIncident() (wardrobe
 * malfunction, weapon malfunction, etc. - already defined there, not
 * duplicated here) with a purchase gate. A slider
 * (setPlayerSplitPercent, 0 to 100-HEROINE_FLOOR_PERCENT) controls how
 * much of the purchase price goes to the player - higher slider, higher
 * price (fewer buyers) AND a bigger player cut; lower slider, cheaper
 * (more buyers) and a smaller cut. She always keeps at least
 * HEROINE_FLOOR_PERCENT (10% by default) of whatever was actually spent,
 * regardless of the slider - per explicit direction, this is deliberate:
 * a real challenge should still pay her better than someone just paying
 * to make her day worse, so she has a standing reason to prefer being
 * challenged over being griefed.
 *
 * ============================================================================
 *
 * PERFORMANCE NOTE
 *
 * Nothing in this file runs per-frame. Contract-expiry/sponsor-deal
 * checks are meant to be polled on a natural cadence (a day advancing,
 * a scene transition, a periodic timer well under 60/sec) - see
 * AIH.DMContracts.update()'s own doc comment.
 *
 * ============================================================================
 */

var AIH = AIH || {};

(function() {

    "use strict";

    // =========================================================================
    // SHARED UTILITY
    // =========================================================================

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function stateContainer() {

        if (
            typeof AIH.State === "undefined" ||
            !AIH.State._internal
        ) {

            return null;
        }

        return AIH.State._internal();
    }

    // =========================================================================
    // 1. AIH.DMContracts
    // =========================================================================

    AIH.DMContracts = AIH.DMContracts || {};
    AIH.DMContracts.VERSION = "0.1.0";

    AIH.DMContracts.KIND_CHANNEL = "channel";
    AIH.DMContracts.KIND_SPONSOR = "sponsor";

    AIH.DMContracts._ensure = function() {

        var state;

        state =
            stateContainer();

        if (!state) {
            return null;
        }

        if (!state.dmContracts) {

            state.dmContracts = {

                currentDay: 0,
                nextId: 1,
                contracts: []
            };
        }

        return state.dmContracts;
    };

    AIH.DMContracts.getCurrentDay = function() {

        var state;

        state =
            AIH.DMContracts._ensure();

        return state ?
            state.currentDay :
            0;
    };

    /*
     * Meant to be called by whatever day/rest system this project
     * already has (or will have) - this module owns no calendar of its
     * own, it only counts whatever "a day" means to the caller.
     */
    AIH.DMContracts.advanceDay = function(days) {

        var state;

        state =
            AIH.DMContracts._ensure();

        if (!state) {
            return;
        }

        state.currentDay +=
            Math.max(1, Number(days) || 1);

        AIH.DMContracts._checkExpirations();
    };

    AIH.DMContracts.createChannelContract = function(label, actionTag, deadlineDays, reward) {

        var state;
        var contract;

        state =
            AIH.DMContracts._ensure();

        if (!state) {
            return null;
        }

        contract = {

            id: "dmcontract_" + (state.nextId++),
            kind: AIH.DMContracts.KIND_CHANNEL,
            label: label,
            actionTag: actionTag,
            reward: Math.max(0, Number(reward) || 0),

            deadlineDay:
                deadlineDays ?
                    state.currentDay + Math.max(1, Number(deadlineDays)) :
                    null,

            status: "active",
            createdOnDay: state.currentDay
        };

        state.contracts.push(contract);

        return contract;
    };

    /*
     * comparison: "below" | "above". targetPath: "personality.<trait>" |
     * "emotions.<key>" | "values.<key>" - read via _readStatValue below.
     */
    AIH.DMContracts.createSponsorDeal = function(label, targetPath, comparison, targetValue, deadlineDays, reward) {

        var state;
        var contract;

        state =
            AIH.DMContracts._ensure();

        if (!state) {
            return null;
        }

        contract = {

            id: "dmcontract_" + (state.nextId++),
            kind: AIH.DMContracts.KIND_SPONSOR,
            label: label,
            targetPath: targetPath,
            comparison: comparison,
            targetValue: Number(targetValue),
            reward: Math.max(0, Number(reward) || 0),

            deadlineDay:
                deadlineDays ?
                    state.currentDay + Math.max(1, Number(deadlineDays)) :
                    null,

            status: "active",
            createdOnDay: state.currentDay
        };

        state.contracts.push(contract);

        return contract;
    };

    AIH.DMContracts.getContracts = function(status) {

        var state;

        state =
            AIH.DMContracts._ensure();

        if (!state) {
            return [];
        }

        if (!status) {
            return state.contracts.slice();
        }

        return state.contracts.filter(function(c) {
            return c.status === status;
        });
    };

    AIH.DMContracts._completeContract = function(contract) {

        contract.status = "completed";

        if (
            contract.reward > 0 &&
            typeof LA !== "undefined" &&
            LA.modifyPlayerWallet
        ) {

            LA.modifyPlayerWallet(contract.reward);
        }
    };

    /*
     * Any minigame/event can call this when something that might match
     * an active channel contract's actionTag actually happens - this
     * module doesn't go looking for the action itself, it only reacts
     * when told.
     */
    AIH.DMContracts.reportAction = function(actionTag) {

        var state;
        var completed;

        state =
            AIH.DMContracts._ensure();

        if (!state) {
            return [];
        }

        completed = [];

        state.contracts.forEach(function(contract) {

            if (
                contract.status !== "active" ||
                contract.kind !== AIH.DMContracts.KIND_CHANNEL ||
                contract.actionTag !== actionTag
            ) {

                return;
            }

            AIH.DMContracts._completeContract(contract);
            completed.push(contract);
        });

        return completed;
    };

    AIH.DMContracts._readStatValue = function(path) {

        var parts;

        if (!path) {
            return null;
        }

        parts =
            path.split(".");

        if (
            parts[0] === "personality" &&
            typeof AIH.Personality !== "undefined" &&
            AIH.Personality.getTrait
        ) {

            return AIH.Personality.getTrait(parts[1]);
        }

        if (
            parts[0] === "emotions" &&
            typeof AIH.Emotions !== "undefined" &&
            AIH.Emotions.getValue
        ) {

            return AIH.Emotions.getValue(parts[1]);
        }

        if (
            parts[0] === "values" &&
            typeof AIH.Values !== "undefined" &&
            AIH.Values.getValue
        ) {

            return AIH.Values.getValue(parts[1]);
        }

        return null;
    };

    /*
     * Meant to be polled - a scene transition, a day tick, a slow
     * periodic timer - not every frame. Reading a handful of
     * trait/emotion/value getters is cheap, but there's no reason to
     * pay even that cost 60 times a second for something that only
     * meaningfully changes on the order of minutes.
     */
    AIH.DMContracts.checkSponsorDeals = function() {

        var state;
        var completed;

        state =
            AIH.DMContracts._ensure();

        if (!state) {
            return [];
        }

        completed = [];

        state.contracts.forEach(function(contract) {

            var value;
            var met;

            if (
                contract.status !== "active" ||
                contract.kind !== AIH.DMContracts.KIND_SPONSOR
            ) {

                return;
            }

            value =
                AIH.DMContracts._readStatValue(contract.targetPath);

            if (value === null) {
                return;
            }

            met =
                contract.comparison === "below" ?
                    value < contract.targetValue :
                    contract.comparison === "above" ?
                        value > contract.targetValue :
                        false;

            if (met) {

                AIH.DMContracts._completeContract(contract);
                completed.push(contract);
            }
        });

        return completed;
    };

    AIH.DMContracts._checkExpirations = function() {

        var state;

        state =
            AIH.DMContracts._ensure();

        if (!state) {
            return;
        }

        state.contracts.forEach(function(contract) {

            if (
                contract.status === "active" &&
                contract.deadlineDay !== null &&
                state.currentDay > contract.deadlineDay
            ) {

                contract.status = "expired";
            }
        });
    };

    AIH.DMContracts.update = function() {

        AIH.DMContracts.checkSponsorDeals();
        AIH.DMContracts._checkExpirations();
    };

    // =========================================================================
    // 2. AIH.GiftLedger
    // =========================================================================

    AIH.GiftLedger = AIH.GiftLedger || {};
    AIH.GiftLedger.VERSION = "0.1.0";

    AIH.GiftLedger.DEFAULT_TOLL_PERCENT = 20;

    AIH.GiftLedger._ensure = function() {

        var state;

        state =
            stateContainer();

        if (!state) {
            return null;
        }

        if (!state.giftLedger) {

            state.giftLedger = {

                tollPercent: AIH.GiftLedger.DEFAULT_TOLL_PERCENT,
                nextId: 1,
                owedTolls: []
            };
        }

        return state.giftLedger;
    };

    AIH.GiftLedger.getTollPercent = function() {

        var state;

        state =
            AIH.GiftLedger._ensure();

        return state ?
            state.tollPercent :
            AIH.GiftLedger.DEFAULT_TOLL_PERCENT;
    };

    AIH.GiftLedger.setTollPercent = function(percent) {

        var state;

        state =
            AIH.GiftLedger._ensure();

        if (!state) {
            return;
        }

        state.tollPercent =
            clamp(Number(percent) || 0, 0, 100);
    };

    /*
     * Builds a request-shaped object and runs it through
     * LA.evaluateRequest - the exact same evaluation path as any normal
     * audience request. On accept/partial, the item transfers straight
     * to her inventory (no LA.grantReward split - see this file's
     * header), and a toll obligation is recorded for later resolution
     * via payToll()/proposeWaiver().
     */
    AIH.GiftLedger.offerGift = function(itemId, itemValue, viewerId) {

        var request;
        var evaluation;
        var accepted;
        var state;
        var owedId;
        var owed;

        if (
            typeof LA === "undefined" ||
            !LA.evaluateRequest
        ) {

            return null;
        }

        request = {

            id: "gift_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
            viewerId: viewerId || null,
            category: "gift",
            label: "A gift",
            reward: 0,
            lewdness: 0,
            danger: 0,
            partialAllowed: false,
            challenge: false,
            data: {
                itemId: itemId,
                itemValue: itemValue
            }
        };

        evaluation =
            LA.evaluateRequest(request);

        accepted =
            !!evaluation &&
            (
                evaluation.response === "accept" ||
                evaluation.response === "partial"
            );

        if (accepted) {

            if (
                typeof $gameParty !== "undefined" &&
                $gameParty.gainItem &&
                typeof $dataItems !== "undefined" &&
                $dataItems[itemId]
            ) {

                $gameParty.gainItem($dataItems[itemId], 1);
            }

            state =
                AIH.GiftLedger._ensure();

            owedId = null;

            if (state) {

                owed = {

                    id: "toll_" + (state.nextId++),
                    itemId: itemId,
                    itemValue: itemValue,
                    tollAmount:
                        Math.round(
                            itemValue *
                            state.tollPercent / 100
                        ),
                    status: "owed"
                };

                state.owedTolls.push(owed);
                owedId = owed.id;
            }

            return {
                accepted: true,
                evaluation: evaluation,
                tollId: owedId
            };
        }

        return {
            accepted: false,
            evaluation: evaluation,
            tollId: null
        };
    };

    AIH.GiftLedger.getOwedTolls = function() {

        var state;

        state =
            AIH.GiftLedger._ensure();

        if (!state) {
            return [];
        }

        return state.owedTolls.filter(function(t) {
            return t.status === "owed";
        });
    };

    /*
     * She pays the toll normally - gold moves from $gameParty straight
     * to LA.playerWallet. Not audience money, so LA.grantReward's cut
     * split does not apply here; this is her paying HIM, in full,
     * directly.
     */
    AIH.GiftLedger.payToll = function(tollId) {

        var state;
        var toll;

        state =
            AIH.GiftLedger._ensure();

        if (!state) {
            return false;
        }

        toll =
            state.owedTolls.filter(function(t) {
                return t.id === tollId && t.status === "owed";
            })[0];

        if (!toll) {
            return false;
        }

        if (
            typeof $gameParty === "undefined" ||
            $gameParty.gold() < toll.tollAmount
        ) {

            return false;
        }

        $gameParty.loseGold(toll.tollAmount);

        if (
            typeof LA !== "undefined" &&
            LA.modifyPlayerWallet
        ) {

            LA.modifyPlayerWallet(toll.tollAmount);
        }

        toll.status = "paid";

        return true;
    };

    /*
     * The player proposes forgoing a toll for a specific demand
     * instead - whether she takes it is a real evaluated decision
     * (reward = gold saved, cost = whatever the demand's own severity
     * fields say), via AIH.PressureEvaluator directly rather than
     * LA.evaluateRequest, since this is a personal DM<->heroine
     * negotiation, not an audience-funded request. This module does
     * NOT decide what the demand means in-fiction if she accepts - it
     * only returns the evaluation and marks the toll waived; enacting
     * the demand itself is the calling project's job.
     */
    AIH.GiftLedger.proposeWaiver = function(tollId, demandCostFields) {

        var state;
        var toll;
        var situation;
        var evaluation;
        var accepted;

        state =
            AIH.GiftLedger._ensure();

        if (!state) {
            return null;
        }

        toll =
            state.owedTolls.filter(function(t) {
                return t.id === tollId && t.status === "owed";
            })[0];

        if (!toll) {
            return null;
        }

        if (
            typeof AIH.PressureEvaluator === "undefined" ||
            !AIH.PressureEvaluator.evaluate
        ) {

            return null;
        }

        situation =
            AIH.PressureEvaluator.normalizeSituation ?
                AIH.PressureEvaluator.normalizeSituation(
                    Object.assign(
                        {
                            id: "toll_waiver_" + tollId,
                            type: "toll_waiver",
                            category: "gift",
                            description: "Forgo a gold toll in exchange for a demand.",
                            severity: "normal",
                            reward: toll.tollAmount,
                            danger: 0,
                            embarrassment: 0,
                            dignityCost: 0,
                            freedomCost: 0,
                            modestyCost: 0,
                            prideCost: 0,
                            survivalBenefit: 0,
                            combatAdvantage: 0
                        },
                        demandCostFields || {}
                    )
                ) :
                Object.assign({ reward: toll.tollAmount }, demandCostFields || {});

        evaluation =
            AIH.PressureEvaluator.evaluate(situation, {});

        accepted =
            evaluation.response === "accept" ||
            evaluation.response === "reluctant_accept" ||
            evaluation.response === "partial";

        if (accepted) {
            toll.status = "waived";
        }

        return {
            accepted: accepted,
            evaluation: evaluation
        };
    };

    // =========================================================================
    // 3. AIH.HinderMarket
    // =========================================================================

    AIH.HinderMarket = AIH.HinderMarket || {};
    AIH.HinderMarket.VERSION = "0.1.0";

    AIH.HinderMarket.HEROINE_FLOOR_PERCENT = 10;
    AIH.HinderMarket.DEFAULT_SPLIT_PERCENT = 5;

    /*
     * How much the price scales up per point of player-cut slider,
     * beyond the base cost - illustrative, tune during play. At
     * slider=0 the price is exactly baseCost; at the maximum slider
     * (100 - HEROINE_FLOOR_PERCENT) the price is meaningfully higher,
     * which is the intended "fewer buyers at a bigger cut" pressure.
     */
    AIH.HinderMarket.PRICE_SCALE_PER_PERCENT = 0.015;

    AIH.HinderMarket._ensure = function() {

        var state;

        state =
            stateContainer();

        if (!state) {
            return null;
        }

        if (!state.hinderMarket) {

            state.hinderMarket = {
                splitPercent: AIH.HinderMarket.DEFAULT_SPLIT_PERCENT
            };
        }

        return state.hinderMarket;
    };

    AIH.HinderMarket.getSplitPercent = function() {

        var state;

        state =
            AIH.HinderMarket._ensure();

        return state ?
            state.splitPercent :
            AIH.HinderMarket.DEFAULT_SPLIT_PERCENT;
    };

    AIH.HinderMarket.setSplitPercent = function(percent) {

        var state;
        var maxPercent;

        state =
            AIH.HinderMarket._ensure();

        if (!state) {
            return;
        }

        maxPercent =
            100 - AIH.HinderMarket.HEROINE_FLOOR_PERCENT;

        state.splitPercent =
            clamp(Number(percent) || 0, 0, maxPercent);
    };

    AIH.HinderMarket.computePrice = function(baseCost) {

        var splitPercent;

        splitPercent =
            AIH.HinderMarket.getSplitPercent();

        return Math.round(
            baseCost *
            (1 + splitPercent * AIH.HinderMarket.PRICE_SCALE_PER_PERCENT)
        );
    };

    AIH.HinderMarket.computeSplit = function(totalPrice) {

        var splitPercent;
        var playerShare;
        var heroineShare;

        splitPercent =
            AIH.HinderMarket.getSplitPercent();

        playerShare =
            Math.round(totalPrice * splitPercent / 100);

        heroineShare =
            totalPrice - playerShare;

        /*
         * The floor is enforced by capping the slider itself
         * (setSplitPercent never allows more than 100 - FLOOR), so this
         * is a defensive re-check rather than the primary mechanism -
         * guards against the slider being set some other way.
         */
        if (heroineShare < totalPrice * AIH.HinderMarket.HEROINE_FLOOR_PERCENT / 100) {

            heroineShare =
                Math.round(totalPrice * AIH.HinderMarket.HEROINE_FLOOR_PERCENT / 100);

            playerShare =
                totalPrice - heroineShare;
        }

        return {
            total: totalPrice,
            playerShare: playerShare,
            heroineShare: heroineShare
        };
    };

    /*
     * Purchases and immediately triggers an EXISTING incident (see
     * LA.Config.incidentDefinitions - wardrobe_malfunction etc. are
     * already defined there, not duplicated here). Pays the split
     * computed above: heroine's share to $gameParty gold, player's
     * share to LA.playerWallet directly (not via LA.grantReward - this
     * is a distinct, DM-configured split, not the audience-cut
     * percentage).
     */
    AIH.HinderMarket.purchase = function(incidentType, baseCost, data) {

        var price;
        var split;

        if (
            typeof LA === "undefined" ||
            !LA.Config ||
            !LA.Config.incidentDefinitions ||
            !LA.Config.incidentDefinitions[incidentType]
        ) {

            return null;
        }

        price =
            AIH.HinderMarket.computePrice(baseCost);

        split =
            AIH.HinderMarket.computeSplit(price);

        if (
            typeof $gameParty !== "undefined" &&
            $gameParty.gainGold
        ) {

            $gameParty.gainGold(split.heroineShare);
        }

        if (
            split.playerShare > 0 &&
            typeof LA !== "undefined" &&
            LA.modifyPlayerWallet
        ) {

            LA.modifyPlayerWallet(split.playerShare);
        }

        LA.triggerIncident(incidentType, data || {});

        return {
            incidentType: incidentType,
            price: price,
            split: split
        };
    };

    // =========================================================================
    // MODULE REGISTRATION
    // =========================================================================

    if (
        typeof AIH.Modules !== "undefined" &&
        AIH.Modules.register
    ) {

        AIH.Modules.register("DMEconomy", {
            version: "0.1.0",
            initialize: function() {
                AIH.DMContracts._ensure();
                AIH.GiftLedger._ensure();
                AIH.HinderMarket._ensure();
            }
        });
    }

    if (typeof DataManager !== "undefined") {

        var _AIH_DMEconomy_createGameObjects =
            DataManager.createGameObjects;

        DataManager.createGameObjects = function() {

            _AIH_DMEconomy_createGameObjects.call(this);

            AIH.DMContracts._ensure();
            AIH.GiftLedger._ensure();
            AIH.HinderMarket._ensure();
        };

        var _AIH_DMEconomy_setupNewGame =
            DataManager.setupNewGame;

        DataManager.setupNewGame = function() {

            _AIH_DMEconomy_setupNewGame.call(this);

            AIH.DMContracts._ensure();
            AIH.GiftLedger._ensure();
            AIH.HinderMarket._ensure();
        };

        var _AIH_DMEconomy_extractSaveContents =
            DataManager.extractSaveContents;

        DataManager.extractSaveContents = function(contents) {

            _AIH_DMEconomy_extractSaveContents.call(this, contents);

            AIH.DMContracts._ensure();
            AIH.GiftLedger._ensure();
            AIH.HinderMarket._ensure();
        };
    }

})();