import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { console };
vm.createContext(context);
for (const file of ["js/campaign-data.js", "js/campaign-mode.js"]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}

const { campaignData, campaignMode } = context;
assert.equal(campaignData.characters.length, 6);
assert.equal(new Set(campaignData.characters.map(({ id }) => id)).size, 6);
assert.equal(campaignData.stages.length, 5);
for (const character of campaignData.characters) {
  assert.equal(campaignMode.flattenDeck(character.deck).length, 30);
}
assert.deepEqual(Array.from(campaignData.characters.map(({ loreLevel }) => loreLevel)), [67, 61, 86, 62, 93, 93]);

const fresh = campaignMode.defaultProgress(campaignData.characters);
const firstId = campaignData.characters[0].id;
assert.equal(fresh.characters[firstId].unlockedStage, 1);
assert.equal(fresh.characters[campaignData.characters[1].id].unlockedStage, 1);
assert.equal(campaignMode.recordStageWin(fresh, firstId, 1).characters[firstId].unlockedStage, 2);
assert.equal(campaignMode.recordStageLoss(fresh, firstId).characters[firstId].unlockedStage, 1);

const mulligan = campaignMode.mulligan(["a", "b", "c", "d", "e"], [0, 2], ["f", "g"]);
assert.deepEqual(mulligan.hand, ["f", "b", "g", "d", "e"]);
assert.equal(mulligan.hand.length, 5);
assert.throws(() => campaignMode.mulligan(["a"], [0, 1], ["b"]));

assert.equal(campaignMode.addRingEnergy(5, 3), 6);
assert.equal(campaignMode.resonanceCost(1, 2), 0);
assert.equal(campaignMode.resonanceShield(1000), 120);
assert.equal(campaignMode.scoreBattle({ victory: true, hpRatio: 0.9, damageTakenRatio: 0.1, rounds: 6, difficulty: "hard" }), "S");
assert.equal(campaignMode.authorizeStage({ unlockedStage: 1 }, 2), false);
assert.equal(campaignMode.clampStage({ unlockedStage: 1 }, 4), 1);
const normalized = campaignMode.normalizeProgress({ version: 1, characters: { lisaya: { unlockedStage: 999, completed: "yes" } }, recentBattles: null }, campaignData.characters);
assert.equal(normalized.characters.lisaya.unlockedStage, 5);
assert.equal(normalized.characters.lisaya.completed, true);
assert.equal(normalized.characters.su.unlockedStage, 1);
assert.equal(normalized.recentBattles.length, 0);
const passiveFlags = { turn: {}, match: {} };
assert.equal(campaignMode.passiveAllowed(passiveFlags, "lisaya", "turn"), true);
const consumedTurn = campaignMode.consumePassive(passiveFlags, "lisaya", "turn");
assert.equal(campaignMode.passiveAllowed(consumedTurn, "lisaya", "turn"), false);
assert.equal(campaignMode.consumePassive({ turn: {}, match: {} }, "lisaya", "match").match.lisaya, true);
assert.equal(campaignMode.enemyResonanceChoice({ hpRatio: .2, playerThreat: true, hand: [], energy: 2 }), "guard");
assert.equal(campaignMode.enemyResonanceChoice({ hpRatio: .8, playerThreat: false, hand: [{ skillTier: "special", cost: 5 }, { skillTier: "normal" }, { skillTier: "normal" }], energy: 8 }), "star");
assert.equal(campaignMode.shouldEnterBossPhase({ hpRatio: .49, phaseTriggered: false }), true);
assert.equal(campaignMode.shouldEnterBossPhase({ hpRatio: .4, phaseTriggered: true }), false);
assert.equal(campaignMode.recentBattles([{ id: 1 }], Array.from({ length: 25 }, (_, id) => ({ id: id + 2 }))).length, 20);
assert.deepEqual(Array.from(campaignMode.resultActions({ victory: true, stage: 4 })), ["next", "retry", "route", "home"]);
assert.deepEqual(Array.from(campaignMode.resultActions({ victory: true, stage: 5 })), ["retry", "route", "home"]);
console.log("Campaign verification passed: 6 characters, 5 stages, 30-card decks, progression, mulligan, resonance, scoring.");
