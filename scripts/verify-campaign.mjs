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
console.log("Campaign verification passed: 6 characters, 5 stages, 30-card decks, progression, mulligan, resonance, scoring.");
