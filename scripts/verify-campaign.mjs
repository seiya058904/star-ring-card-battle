import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = file => readFile(path.join(repositoryRoot, file), "utf8");

const context = { console };
vm.createContext(context);
for (const file of ["js/battle-rules.js", "js/campaign-data.js", "js/campaign-mode.js"]) {
  vm.runInContext(await readRepoFile(file), context, { filename: file });
}

const { campaignData, campaignMode, battleRules } = context;
// A valid JSON document can contain invalid optional history entries.
{
  const saved = campaignMode.defaultProgress(campaignData.characters);
  const id = campaignData.characters[0].id;
  saved.characters[id].unlockedStage = 5;
  const valid = { characterId: id, stage: 3, victory: true, score: "A", rounds: 8 };
  saved.recentBattles = [null, valid, [], "bad", {}, { ...valid, score: "<img>" }, { ...valid, rounds: -1 }, { ...valid, victory: "yes" }];
  const loaded = campaignMode.loadProgress(JSON.stringify(saved), campaignData.characters);
  assert.equal(loaded.characters[id].unlockedStage, 5);
  assert.equal(loaded.recentBattles.length, 1, "坏战绩必须逐项过滤，保留合法记录");
  assert.equal(loaded.recentBattles[0].score, "A");
  saved.recentBattles = [null, ...Array.from({ length: 25 }, (_, rounds) => ({ ...valid, rounds, difficulty: "hard", time: "2026-09-11T00:00:00Z", extra: "discard" }))];
  const bounded = campaignMode.loadProgress(JSON.stringify(saved), campaignData.characters).recentBattles;
  assert.equal(bounded.length, 20); assert.equal(bounded[0].rounds, 0); assert.equal(bounded[19].rounds, 19);
  assert.equal(bounded[0].difficulty, "hard"); assert.equal(bounded[0].extra, undefined);
  assert.equal(bounded[0].time, "2026-09-11T00:00:00.000Z");
  for (const patch of [{ characterId: "unknown" }, { stage: 0 }, { stage: 6 }, { stage: "1" }, { rounds: 1.5 }, { rounds: Number.MAX_SAFE_INTEGER + 1 }]) {
    saved.recentBattles = [{ ...valid, ...patch }];
    assert.equal(campaignMode.loadProgress(JSON.stringify(saved), campaignData.characters).recentBattles.length, 0);
  }
}
const campaignDataSource = await readRepoFile("js/campaign-data.js");
const campaignUiSource = await readRepoFile("js/campaign-ui.js");
const campaignRuntimeSource = await readRepoFile("js/campaign-runtime.js");
const campaignModeSource = await readRepoFile("js/campaign-mode.js");
const coreSource = await readRepoFile("js/fixed-game-rules.js");
const htmlSource = await readRepoFile("index.html");

assert.equal(campaignData.characters.length, 6);
assert.equal(new Set(campaignData.characters.map(({ id }) => id)).size, 6);
assert.equal(campaignData.stages.length, 5);
assert.deepEqual(Array.from([1, 2, 3, 4], round => battleRules.roundEnergy(round, 10)), [3, 5, 7, 9]);
assert.match(campaignUiSource, /fixedCardLibrary\.createRuntimeDeck/);
assert.doesNotMatch(campaignUiSource, /cardGenerator\.cardFromName/);
assert.match(campaignUiSource, /CAMPAIGN_CHARACTER_MAP/);
assert.match(campaignRuntimeSource, /const sessionId = gameEngine\.sessionId/);
assert.doesNotMatch(campaignUiSource, /gameEngine\.isActiveBattle\(state, state\.sessionId\)/);
assert.match(campaignRuntimeSource, /card\.effects\?\.some\(effect => effect\.type === "damage"\)/);
assert.doesNotMatch(campaignUiSource, /damageTakenRatio/);
assert.doesNotMatch(campaignUiSource, /baseCampaignResult|originalCampaignResult|originalShowResult/);
assert.doesNotMatch(campaignUiSource, /uiRenderer\.showResult\s*=\s*function/);
assert.doesNotMatch(campaignDataSource, /combatLevel/);
assert.doesNotMatch(campaignUiSource, /战役计算等级/);
assert.match(campaignUiSource, /maxHpMultiplier/);
assert.match(campaignUiSource, /effectMultiplier: tuning\.power/);
assert.match(campaignRuntimeSource, /actor: state\.enemy, target: state\.player/);
assert.match(campaignModeSource, /\["诅咒", "燃烧"\]/);
assert.match(campaignModeSource, /resolveCardEffectAmount/);
assert.match(campaignModeSource, /card\.effects/);
assert.doesNotMatch(campaignModeSource, /Number\(card\.power \|\| 0\) \/ Math\.max/);
assert.doesNotMatch(campaignUiSource, /(?<![\w.])effectiveCardCost\(/);
assert.match(campaignUiSource, /mode\.effectiveCardCost\(state, "enemy", card\)/);
assert.match(campaignUiSource, /mode\.effectiveCardCost\(state, "player", card\)/);
assert.match(campaignUiSource, /const progress = \(\) => \{ try \{/);
assert.match(campaignUiSource, /const saveProgress = value => \{ try \{/);
assert.match(coreSource, /try \{ latest = global\.campaignMode\.loadProgress\(localStorage\.getItem/);
assert.match(coreSource, /try \{ localStorage\.setItem\(global\.campaignMode\.STORAGE_KEY/);
// 跨标签页并发合同：结算必须重读最新进度、校验重置代际并递增 revision。
assert.match(coreSource, /latest\.resetGeneration/);
assert.match(coreSource, /next\.revision = \(Number\(latest\.revision\) \|\| 0\) \+ 1/);
assert.match(htmlSource, /chooseCard\(enemy, player\)\s*\{\s*const state = gameEngine\.state/);
assert.match(htmlSource, /function effectiveCardCost\(state, side, card\)/);
assert.match(htmlSource, /renderCard\(card, effectiveCardCost\(gameEngine\.state, "player", card\)/);
assert.match(htmlSource, /player\.hand\.some\(card => effectiveCardCost\(gameEngine\.state, "player", card\)/);
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
