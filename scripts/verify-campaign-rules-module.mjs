import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

const [rulesSource, uiSource, runtimeSource, htmlSource, modeSource, battleRulesSource] = await Promise.all([
  read("js/campaign-rules.js"),
  read("js/campaign-ui.js"),
  read("js/campaign-runtime.js"),
  read("index.html"),
  read("js/campaign-mode.js"),
  read("js/battle-rules.js"),
]);

// 1) campaign-rules.js 不应是 UI 模块。
for (const forbidden of [
  "document.",
  "window.",
  "querySelector",
  "innerHTML",
  "addEventListener",
]) {
  assert.doesNotMatch(rulesSource, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `campaign-rules.js 不应包含 DOM/UI 依赖：${forbidden}`);
}

// 2) campaign-rules.js 应能独立加载并暴露预期 API。
const context = { console, Math, Date, JSON, Object, Array, String, Number, Boolean };
vm.createContext(context);
vm.runInContext(battleRulesSource, context, { filename: "js/battle-rules.js" });
vm.runInContext(modeSource, context, { filename: "js/campaign-mode.js" });
vm.runInContext(rulesSource, context, { filename: "js/campaign-rules.js" });

const rules = context.campaignRules;
assert.ok(rules, "campaign-rules.js 应暴露 campaignRules");
for (const key of [
  "campaignStatsPassive",
  "ensureCampaignPassives",
  "resetCampaignTurnPassives",
  "refreshCampaignEnemyIntent",
  "recordElementMatchup",
  "beforeCampaignTurnEnd",
]) {
  assert.equal(typeof rules[key], "function", `campaignRules 缺少 ${key}`);
}

// 3) 已移动的规则函数不应在 campaign-ui.js 中保留重复定义。
for (const signature of [
  "function recordElementMatchup(state, side, card) {",
  "function beforeCampaignTurnEnd(state, side) {",
  "function resetCampaignTurnPassives(state) {",
  "function refreshCampaignEnemyIntent(state) {",
  "function campaignStatsPassive(state) {",
  "function ensureCampaignPassives(state) {",
]) {
  assert.ok(!uiSource.includes(signature), `campaign-ui.js 不应保留重复定义：${signature}`);
}

// 4) 加载顺序：campaign-rules.js 必须在 campaign-ui.js 之前。
const rulesIndex = htmlSource.indexOf('src="js/campaign-rules.js"');
const uiIndex = htmlSource.indexOf('src="js/campaign-ui.js"');
assert.ok(rulesIndex >= 0, "index.html 缺少 campaign-rules.js");
assert.ok(uiIndex > rulesIndex, "campaign-rules.js 必须早于 campaign-ui.js 加载");

// 5) campaign-runtime.js 应通过 campaignRules.* 调用已移动规则。
for (const call of [
  "campaignRules.recordElementMatchup(state, side, card);",
  "campaignRules.beforeCampaignTurnEnd(stateBefore, side);",
  "campaignRules.resetCampaignTurnPassives(state);",
  "campaignRules.refreshCampaignEnemyIntent(state);",
  "campaignRules.campaignStatsPassive(state);",
  "campaignRules.ensureCampaignPassives(state);",
]) {
  assert.ok(runtimeSource.includes(call), `campaign-runtime.js 应调用 ${call}`);
}

console.log("campaign-rules 模块契约验证通过：API 存在、无 DOM 依赖、无重复定义、加载顺序正确。");
