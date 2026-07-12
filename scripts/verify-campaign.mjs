import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { console };
vm.createContext(context);
for (const file of ["js/battle-rules.js", "js/campaign-data.js", "js/campaign-mode.js"]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}

const { campaignData, campaignMode, battleRules } = context;
const campaignUiSource = await readFile("js/campaign-ui.js", "utf8");
const coreSource = await readFile("js/fixed-game-rules.js", "utf8");

assert.equal(campaignData.characters.length, 6);
assert.equal(new Set(campaignData.characters.map(({ id }) => id)).size, 6);
assert.equal(campaignData.stages.length, 5);
assert.deepEqual(Array.from([1, 2, 3, 4], round => battleRules.roundEnergy(round, 10)), [3, 5, 7, 9]);
assert.match(campaignUiSource, /fixedCardLibrary\.createRuntimeDeck/);
assert.doesNotMatch(campaignUiSource, /cardGenerator\.cardFromName/);
assert.match(coreSource, /rules\.roundEnergy/);
assert.match(coreSource, /HAND_LIMIT/);
assert.match(coreSource, /afterPlay === "exhaust"/);
assert.match(coreSource, /resolveDamage/);
assert.match(coreSource, /damageTaken/);
assert.match(coreSource, /overheal/);
assert.match(coreSource, /controlImmuneTurns/);

const fresh = campaignMode.defaultProgress(campaignData.characters);
assert.equal(fresh.characters.lisaya.unlockedStage, 1);
assert.equal(campaignMode.recordStageWin(fresh, "lisaya", 1).characters.lisaya.unlockedStage, 2);
assert.equal(campaignMode.scoreBattle({ victory: true, hpRatio: .9, damageTaken: 100, maxHp: 1000, healing: 100, overheal: 0, rounds: 6, difficulty: "hard" }), "S");
assert.equal(campaignMode.authorizeStage({ unlockedStage: 1 }, 2), false);
assert.equal(campaignMode.resonanceShield(1000), 120);
console.log("战役规则、固定卡组接入与通用能量验证通过。");
