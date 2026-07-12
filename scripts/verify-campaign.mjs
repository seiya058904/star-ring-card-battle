import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { console };
vm.createContext(context);
for (const file of ["js/battle-rules.js", "js/campaign-data.js", "js/campaign-mode.js"]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}

const { campaignData, campaignMode, battleRules } = context;
const campaignDataSource = await readFile("js/campaign-data.js", "utf8");
const campaignUiSource = await readFile("js/campaign-ui.js", "utf8");
const campaignModeSource = await readFile("js/campaign-mode.js", "utf8");
const coreSource = await readFile("js/fixed-game-rules.js", "utf8");

assert.equal(campaignData.characters.length, 6);
assert.equal(new Set(campaignData.characters.map(({ id }) => id)).size, 6);
assert.equal(campaignData.stages.length, 5);
assert.deepEqual(Array.from([1, 2, 3, 4], round => battleRules.roundEnergy(round, 10)), [3, 5, 7, 9]);
assert.match(campaignUiSource, /fixedCardLibrary\.createRuntimeDeck/);
assert.doesNotMatch(campaignUiSource, /cardGenerator\.cardFromName/);
assert.match(campaignUiSource, /CAMPAIGN_CHARACTER_MAP/);
assert.match(campaignUiSource, /const sessionId = gameEngine\.sessionId/);
assert.doesNotMatch(campaignUiSource, /gameEngine\.isActiveBattle\(state, state\.sessionId\)/);
assert.match(campaignUiSource, /card\.effects\?\.some\(effect => effect\.type === "damage"\)/);
assert.doesNotMatch(campaignUiSource, /damageTakenRatio/);
assert.doesNotMatch(campaignUiSource, /baseCampaignResult|originalCampaignResult|originalShowResult/);
assert.doesNotMatch(campaignUiSource, /uiRenderer\.showResult\s*=\s*function/);
assert.doesNotMatch(campaignDataSource, /combatLevel/);
assert.doesNotMatch(campaignUiSource, /战役计算等级/);
assert.match(campaignUiSource, /maxHpMultiplier/);
assert.match(campaignUiSource, /effectMultiplier: tuning\.power/);
assert.match(campaignUiSource, /actor: state\.enemy, target: state\.player/);
assert.match(campaignModeSource, /\["诅咒", "燃烧"\]/);
assert.match(campaignModeSource, /resolveCardEffectAmount/);
assert.match(campaignModeSource, /card\.effects/);
assert.doesNotMatch(campaignModeSource, /Number\(card\.power \|\| 0\) \/ Math\.max/);
assert.match(coreSource, /rules\.roundEnergy/);
assert.match(coreSource, /HAND_LIMIT/);
assert.match(coreSource, /afterPlay === "exhaust"/);
assert.match(coreSource, /resolveDamage/);
assert.match(coreSource, /damageTaken/);
assert.match(coreSource, /overheal/);
assert.match(coreSource, /controlImmuneTurns/);
assert.match(coreSource, /bypassDamage/);
assert.match(coreSource, /blockableDamage/);
assert.match(coreSource, /status\.type === "复生"/);
assert.match(coreSource, /execute/);

const fresh = campaignMode.defaultProgress(campaignData.characters);
assert.equal(fresh.characters.lisaya.unlockedStage, 1);
assert.equal(campaignMode.recordStageWin(fresh, "lisaya", 1).characters.lisaya.unlockedStage, 2);
assert.equal(campaignMode.scoreBattle({ victory: true, hpRatio: .9, damageTaken: 100, maxHp: 1000, healing: 100, overheal: 0, rounds: 6, difficulty: "hard" }), "S");
assert.equal(campaignMode.authorizeStage({ unlockedStage: 1 }, 2), false);
assert.equal(campaignMode.resonanceShield(1000), 120);
console.log("战役规则、固定卡组接入与通用能量验证通过。");
