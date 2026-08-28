import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

const [runtimeSource, uiSource, htmlSource, rulesSource] = await Promise.all([
  read("js/campaign-runtime.js"),
  read("js/campaign-ui.js"),
  read("index.html"),
  read("js/campaign-rules.js"),
]);

// 1) campaign-runtime.js 不应直接依赖 DOM。
for (const forbidden of ["document.", "window.", "querySelector", "innerHTML", "addEventListener"]) {
  assert.doesNotMatch(runtimeSource, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `campaign-runtime.js 不应包含 DOM 依赖：${forbidden}`);
}

// 2) 加载顺序：campaign-runtime.js 必须在 campaign-ui.js 之前，并在 fixed-game-rules.js 之后。
const rulesIndex = htmlSource.indexOf('src="js/campaign-rules.js"');
const fixedIndex = htmlSource.indexOf('src="js/fixed-game-rules.js"');
const runtimeIndex = htmlSource.indexOf('src="js/campaign-runtime.js"');
const uiIndex = htmlSource.indexOf('src="js/campaign-ui.js"');
assert.ok(runtimeIndex >= 0, "index.html 缺少 campaign-runtime.js");
assert.ok(fixedIndex >= 0 && runtimeIndex > fixedIndex, "campaign-runtime.js 必须晚于 fixed-game-rules.js");
assert.ok(uiIndex > runtimeIndex, "campaign-runtime.js 必须早于 campaign-ui.js");

// 3) campaign-ui.js 不再拥有核心引擎集成赋值。
for (const pattern of [
  /gameEngine\.(playCard|endTurn|beginTurn|applyCard|tickStatuses|draw)\s*=\s*function/,
  /aiController\.(takeTurn|chooseCard)\s*=\s*(async\s*)?function/,
]) {
  assert.doesNotMatch(uiSource, pattern, "campaign-ui.js 不应再定义核心引擎集成赋值");
}

// 4) 模块应可加载并暴露预期 API。
const context = {
  console,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  setTimeout,
  clearTimeout,
  campaignMode: {
    STORAGE_KEY: "test",
    addRingEnergy: (v, a) => Math.min(6, Math.max(0, v + a)),
    expireResonance() {},
    recordCombatEvent() {},
    drawCount: (before, after) => Math.max(0, after - before),
    effectiveCardCost: (state, side, card) => card.cost,
    intentFor: () => ({ type: "普通攻击", card: null }),
    aiCardScore: () => 1,
    enemyResonanceChoice: () => "guard",
    resonanceShield: () => 0,
    consumePassive: (flags, id, scope) => flags,
    passiveAllowed: () => true,
    shouldEnterBossPhase: () => false,
  },
  battleRules: { roundEnergy: () => 3 },
  campaignRules: {
    ensureCampaignPassives() {},
    resetCampaignTurnPassives() {},
    refreshCampaignEnemyIntent() {},
    recordElementMatchup() {},
    beforeCampaignTurnEnd() {},
    campaignStatsPassive() {},
  },
  gameEngine: {
    state: null,
    sessionId: 1,
    log() {},
    draw() {},
    playCard() { return false; },
    endTurn() { return false; },
    beginTurn() { return false; },
    applyCard() {},
    tickStatuses() {},
    isActiveBattle() { return true; },
    resolveAction() {},
  },
  aiController: { chooseCard() {}, takeTurn() {} },
  getCardActionIntent: () => "hostile-damage",
  formatNumber: v => String(v),
  effectsRenderer: undefined,
  hasPendingOverrides: () => false,
  battleSpeedDelay: ms => ms,
};
vm.createContext(context);
vm.runInContext(runtimeSource, context, { filename: "js/campaign-runtime.js" });

const runtime = context.campaignRuntime;
assert.ok(runtime, "campaign-runtime.js 应暴露 campaignRuntime");
assert.equal(typeof runtime.configurePresentation, "function", "campaignRuntime.configurePresentation 应为函数");
assert.equal(typeof runtime.install, "function", "campaignRuntime.install 应为函数");

// 5) 重复 install 不应产生二次包装。
runtime.configurePresentation({ renderHud() {}, notice() {}, playSound() {}, playDrawSound() {} });
runtime.install();
const playCardAssignmentsAfterFirst = (runtimeSource.match(/gameEngine\.playCard = function/g) || []).length;
runtime.install();
const playCardAssignmentsAfterSecond = (runtimeSource.match(/gameEngine\.playCard = function/g) || []).length;
assert.equal(playCardAssignmentsAfterSecond, playCardAssignmentsAfterFirst, "重复 install 不应产生新的赋值");
assert.equal(playCardAssignmentsAfterFirst, 1, "campaign-runtime 应只有 1 个 playCard 赋值");

// 6) campaign-rules.js 仍应保持无 DOM 依赖。
for (const forbidden of ["document.", "window.", "querySelector", "innerHTML", "addEventListener"]) {
  assert.doesNotMatch(rulesSource, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `campaign-rules.js 不应包含 DOM 依赖：${forbidden}`);
}

console.log("campaign-runtime 模块契约验证通过：API 存在、无 DOM 依赖、无重复 install、加载顺序正确。");
