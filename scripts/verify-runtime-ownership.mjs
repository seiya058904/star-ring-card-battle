import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

const [html, fixedRules, campaignUi, campaignRulesSource, campaignRuntimeSource] = await Promise.all([
  read("index.html"),
  read("js/fixed-game-rules.js"),
  read("js/campaign-ui.js"),
  read("js/campaign-rules.js"),
  read("js/campaign-runtime.js"),
]);

const expectedScriptOrder = [
  "js/battle-rules.js",
  "js/fixed-card-library.js",
  "js/campaign-data.js",
  "js/campaign-mode.js",
  "js/campaign-rules.js",
  "js/audio-manager.js",
  "js/fixed-game-rules.js",
  "js/campaign-runtime.js",
  "js/campaign-ui.js",
];

let lastIndex = -1;
for (const src of expectedScriptOrder) {
  const index = html.indexOf(`src="${src}"`);
  assert.ok(index >= 0, `index.html 缺少脚本：${src}`);
  assert.ok(index > lastIndex, `脚本加载顺序错误：${src} 应晚于前一个脚本`);
  lastIndex = index;
}

// fixed-game-rules.js 是核心战斗规则最终实现层。
for (const method of [
  "gameEngine.makeFighter",
  "gameEngine.draw",
  "gameEngine.applyStatus",
  "gameEngine.resolveDamage",
  "gameEngine.applyCard",
  "gameEngine.statusMultiplier",
  "gameEngine.tickStatuses",
  "gameEngine.beginTurn",
  "gameEngine.playCard",
  "gameEngine.endTurn",
  "aiController.chooseCard",
]) {
  assert.match(fixedRules, new RegExp(`${method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`), `${method} 必须由 fixed-game-rules.js 提供最终实现`);
}

// campaign-runtime.js 是战役战斗运行时集成层；campaign-ui.js 不应再拥有核心引擎方法赋值。
const runtime = campaignRuntimeSource;

// 确保 campaign-ui.js 不再定义核心引擎集成赋值。
for (const pattern of [
  /gameEngine\.(playCard|endTurn|beginTurn|applyCard|tickStatuses|draw)\s*=\s*function/,
  /aiController\.(takeTurn|chooseCard)\s*=\s*(async\s*)?function/,
]) {
  assert.doesNotMatch(campaignUi, pattern, "campaign-ui.js 不应再定义核心引擎集成赋值");
}

// playCard
const playCardAssignments = runtime.match(/gameEngine\.playCard = function/g) || [];
assert.equal(playCardAssignments.length, 1, `campaign-runtime 应只有 1 个 gameEngine.playCard 赋值，当前 ${playCardAssignments.length}`);
assert.match(runtime, /const basePlayCard = gameEngine\.playCard\.bind\(gameEngine\);/, "campaign-runtime 必须捕获 fixed-game-rules 的权威 playCard 作为 base");
assert.ok(runtime.includes("function recordCampaignCardPlay("), "campaign-runtime 缺少星环/减耗记录处理器");
assert.ok(campaignRulesSource.includes("function recordElementMatchup("), "campaign-rules.js 缺少元素克制统计处理器");
assert.match(runtime, /recordCampaignCardPlay\(state, side, card\)/, "单一边界必须调用星环/减耗处理器");
assert.match(runtime, /campaignRules\.recordElementMatchup\(state, side, card\)/, "单一边界必须调用 campaignRules.recordElementMatchup");

// endTurn
const endTurnAssignments = runtime.match(/gameEngine\.endTurn = function/g) || [];
assert.equal(endTurnAssignments.length, 1, `campaign-runtime 应只有 1 个 gameEngine.endTurn 赋值，当前 ${endTurnAssignments.length}`);
assert.match(runtime, /const baseEndTurn = gameEngine\.endTurn\.bind\(gameEngine\);/, "campaign-runtime 必须捕获 fixed-game-rules 的权威 endTurn 作为 base");
assert.ok(campaignRulesSource.includes("function beforeCampaignTurnEnd("), "campaign-rules.js 缺少 beforeCampaignTurnEnd");
assert.ok(runtime.includes("function afterCampaignTurnEnd("), "campaign-runtime 缺少 afterCampaignTurnEnd");
assert.match(runtime, /campaignRules\.beforeCampaignTurnEnd\(stateBefore, side\)/, "单一边界必须调用 campaignRules.beforeCampaignTurnEnd");
assert.match(runtime, /afterCampaignTurnEnd\(this\.state, side\)/, "单一边界必须调用 afterCampaignTurnEnd");

// beginTurn
const beginTurnAssignments = runtime.match(/gameEngine\.beginTurn = function/g) || [];
assert.equal(beginTurnAssignments.length, 1, `campaign-runtime 应只有 1 个 gameEngine.beginTurn 赋值，当前 ${beginTurnAssignments.length}`);
assert.match(runtime, /const baseBeginTurn = gameEngine\.beginTurn\.bind\(gameEngine\);/, "campaign-runtime 必须捕获 fixed-game-rules 的权威 beginTurn 作为 base");
assert.ok(campaignRulesSource.includes("function resetCampaignTurnPassives("), "campaign-rules.js 缺少 resetCampaignTurnPassives");
assert.ok(runtime.includes("function applyCampaignPlayerExtraEnergy("), "campaign-runtime 缺少 applyCampaignPlayerExtraEnergy");
assert.ok(campaignRulesSource.includes("function refreshCampaignEnemyIntent("), "campaign-rules.js 缺少 refreshCampaignEnemyIntent");
assert.match(runtime, /campaignRules\.resetCampaignTurnPassives\(state\)/, "beginTurn 边界必须调用 campaignRules.resetCampaignTurnPassives");
assert.match(runtime, /applyCampaignPlayerExtraEnergy\.call\(this, state\)/, "beginTurn 边界必须调用 applyCampaignPlayerExtraEnergy");
assert.match(runtime, /campaignRules\.refreshCampaignEnemyIntent\(state\)/, "beginTurn 边界必须调用 campaignRules.refreshCampaignEnemyIntent");

// tickStatuses
const tickStatusesAssignments = runtime.match(/gameEngine\.tickStatuses = function/g) || [];
assert.equal(tickStatusesAssignments.length, 1, `campaign-runtime 应只有 1 个 gameEngine.tickStatuses 赋值，当前 ${tickStatusesAssignments.length}`);
assert.match(runtime, /const baseTickStatuses = gameEngine\.tickStatuses\.bind\(gameEngine\);/, "campaign-runtime 必须捕获 fixed-game-rules 的权威 tickStatuses");
assert.ok(runtime.includes("function processCampaignStatusTickPassive("), "campaign-runtime 缺少 processCampaignStatusTickPassive");
assert.ok(runtime.includes("function processCampaignPostStatusTick("), "campaign-runtime 缺少 processCampaignPostStatusTick");
assert.match(runtime, /processCampaignStatusTickPassive\.call\(this, state, fighter, result\)/, "tickStatuses 边界必须调用 processCampaignStatusTickPassive");
assert.match(runtime, /processCampaignPostStatusTick\(state, fighter, beforeHp\)/, "tickStatuses 边界必须调用 processCampaignPostStatusTick");

// draw
const drawAssignments = runtime.match(/gameEngine\.draw = function/g) || [];
assert.equal(drawAssignments.length, 1, `campaign-runtime 应只有 1 个 gameEngine.draw 赋值，当前 ${drawAssignments.length}`);
assert.match(runtime, /const baseDraw = gameEngine\.draw\.bind\(gameEngine\);/, "campaign-runtime 必须捕获 fixed-game-rules 的权威 draw");
assert.ok(runtime.includes("function playCampaignDrawSound("), "campaign-runtime 缺少 playCampaignDrawSound");
assert.match(runtime, /playCampaignDrawSound\(fighter, before\)/, "draw 边界必须调用 playCampaignDrawSound");

// chooseCard
assert.match(runtime, /const originalChooseCard = aiController\.chooseCard\.bind\(aiController\);\s*aiController\.chooseCard = function/, "campaign-runtime 必须包装 chooseCard");

// aiController.takeTurn
const takeTurnAssignments = runtime.match(/aiController\.takeTurn = async function/g) || [];
assert.equal(takeTurnAssignments.length, 1, `campaign-runtime 应只有 1 个 aiController.takeTurn 赋值，当前 ${takeTurnAssignments.length}`);
assert.ok(runtime.includes("function runSandboxAiTurn("), "campaign-runtime 缺少 runSandboxAiTurn");
assert.ok(runtime.includes("function chooseCampaignAiCard("), "campaign-runtime 缺少 chooseCampaignAiCard");
assert.ok(runtime.includes("function runCampaignAiTurn("), "campaign-runtime 缺少 runCampaignAiTurn");
assert.match(runtime, /runSandboxAiTurn\.call\(this, state\)/, "AI 编排边界必须调用 runSandboxAiTurn");
assert.match(runtime, /runCampaignAiTurn\.call\(this, state, sessionId\)/, "AI 编排边界必须调用 runCampaignAiTurn");
assert.match(runtime, /chooseCampaignAiCard\.call\(this, state\)/, "战役 AI 循环必须调用 chooseCampaignAiCard");

// applyCard
const applyCardAssignments = runtime.match(/gameEngine\.applyCard = function/g) || [];
assert.equal(applyCardAssignments.length, 1, `campaign-runtime 应只有 1 个 gameEngine.applyCard 赋值，当前 ${applyCardAssignments.length}`);
assert.match(runtime, /const baseApplyCard = gameEngine\.applyCard\.bind\(gameEngine\);/, "campaign-runtime 必须捕获 fixed-game-rules 的权威 applyCard 作为 base");
assert.match(runtime, /campaignPlayerPassiveBefore\.call\(this, actor, target, card\)/, "campaign-runtime 必须调用 before-resolution 玩家被动处理器");
assert.match(runtime, /campaignPlayerPassiveAfter\.call\(this, actor, target, card, pre\)/, "campaign-runtime 必须调用 after-resolution 玩家被动处理器");
assert.match(runtime, /campaignBossAndEnemyPassiveAfter\.call\(this, actor, target, card, beforeStatuses\)/, "campaign-runtime 必须调用 Boss/敌方被动处理器");
assert.match(runtime, /campaignHealthThresholdAfter\.call\(this, actor, target, card, targetHp\)/, "campaign-runtime 必须调用生命阈值处理器");
assert.match(runtime, /campaignPassiveNoticeAfter\.call\(this, actor, target, card\)/, "campaign-runtime 必须调用被动提示处理器");
for (const name of [
  "campaignPlayerPassiveBefore",
  "campaignPlayerPassiveAfter",
  "campaignBossAndEnemyPassiveAfter",
  "campaignHealthThresholdAfter",
  "campaignPassiveNoticeAfter",
]) {
  assert.ok(runtime.includes(`function ${name}(`), `campaign-runtime 缺少显式处理器：${name}`);
}
assert.ok(campaignRulesSource.includes("function campaignStatsPassive("), "campaign-rules.js 缺少 campaignStatsPassive");
assert.ok(campaignRulesSource.includes("function ensureCampaignPassives("), "campaign-rules.js 缺少 ensureCampaignPassives");
assert.match(runtime, /campaignRules\.ensureCampaignPassives\(state\)/, "applyCard 边界必须调用 campaignRules.ensureCampaignPassives");
assert.match(runtime, /campaignRules\.campaignStatsPassive\(state\)/, "applyCard 边界必须调用 campaignRules.campaignStatsPassive");

// 旧模式不得回归
for (const oldPattern of [
  /const originalPlayCard = gameEngine\.playCard\.bind\(gameEngine\);\s*gameEngine\.playCard = function/,
  /const statsPlayCard = gameEngine\.playCard\.bind\(gameEngine\);\s*gameEngine\.playCard = function/,
  /const originalEndTurn = gameEngine\.endTurn\.bind\(gameEngine\);\s*gameEngine\.endTurn = function/,
  /const originalCampaignEndTurn = gameEngine\.endTurn\.bind\(gameEngine\);\s*gameEngine\.endTurn = function/,
  /const originalBeginTurn = gameEngine\.beginTurn\.bind\(gameEngine\);\s*gameEngine\.beginTurn = function/,
  /const originalTickStatuses = gameEngine\.tickStatuses\.bind\(gameEngine\);\s*gameEngine\.tickStatuses = function/,
  /const originalDraw = gameEngine\.draw\.bind\(gameEngine\);\s*gameEngine\.draw = function/,
  /const originalCampaignAi = aiController\.takeTurn\.bind\(aiController\);\s*aiController\.takeTurn = async function/,
  /const originalApplyCard = gameEngine\.applyCard\.bind\(gameEngine\);\s*gameEngine\.applyCard = function/,
  /const passiveStatusApply = gameEngine\.applyCard\.bind\(gameEngine\);\s*gameEngine\.applyCard = function/,
  /const thresholdApply = gameEngine\.applyCard\.bind\(gameEngine\);\s*gameEngine\.applyCard = function/,
  /const passiveNoticeApply = gameEngine\.applyCard\.bind\(gameEngine\);\s*gameEngine\.applyCard = function/,
]) {
  assert.doesNotMatch(runtime, oldPattern, "旧的包装模式不得回归");
}

// 关键保护机制必须仍出现在最终规则层中。
for (const keyword of [
  "fighter.exhaustPile = []",
  "controlImmuneTurns",
  "shareOwnerDamageWithSummon",
  "resolveDamage",
  "status.type === \"复生\"",
  "sourceKind === \"dot\"",
  "effect.type === \"summon\"",
  "effect.type === \"revive\"",
  "effect.type === \"cleanse\"",
]) {
  assert.ok(fixedRules.includes(keyword), `fixed-game-rules.js 缺少关键机制：${keyword}`);
}

// 渲染/音效不得反噬规则：fixed-game-rules 中不应出现决定战斗结果后才补写状态逻辑的“旧 applyCard”特征。
assert.doesNotMatch(fixedRules, /target\.statuses\.push\(\{ type: "迟缓"/, "fixed-game-rules 不应使用旧控制状态“迟缓”作为禁锢实现");

console.log("运行时所有权校验通过：脚本顺序、最终规则层、战役包装层与关键机制保护均符合预期。");
