import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

const [html, campaignUi] = await Promise.all([
  read("index.html"),
  read("js/campaign-ui.js"),
]);

// 1) 公共 render 只有 campaign-ui 一个赋值。
const htmlRenderAssignments = (html.match(/uiRenderer\.render = function/g) || []).length;
const uiRenderAssignments = (campaignUi.match(/uiRenderer\.render = function/g) || []).length;
assert.equal(htmlRenderAssignments, 0, "index.html 不应拥有 uiRenderer.render 赋值");
assert.equal(uiRenderAssignments, 1, "campaign-ui 应拥有唯一 uiRenderer.render 赋值");

// 2) renderBattleSurface 是基础渲染方法，且包含关键子渲染调用与交互绑定。
const battleSurfaceStart = html.indexOf("renderBattleSurface() {");
assert.ok(battleSurfaceStart >= 0, "index.html 应包含 renderBattleSurface");
const battleSurfaceBlock = html.slice(battleSurfaceStart, html.indexOf("renderDuelUnit(id, fighter, isPlayer) {", battleSurfaceStart));
for (const keyword of [
  "setHandHoverSuppressed(true, 350)",
  'this.renderFighter("enemyArea"',
  'this.renderFighter("playerArea"',
  'this.renderDuelUnit("enemyUnit"',
  'this.renderDuelUnit("playerUnit"',
  "this.renderSummons()",
  "this.renderOpponentHand()",
  "this.renderLog()",
  "this.bindBattleCardPreview()",
]) {
  assert.ok(battleSurfaceBlock.includes(keyword), `renderBattleSurface 缺少 ${keyword}`);
}

// 3) campaign-ui 最终 render 顺序：renderBattleSurface → refreshEffectiveCardCosts → renderCampaignHud。
const renderIndex = campaignUi.indexOf("uiRenderer.render = function");
assert.ok(renderIndex >= 0);
const renderBlock = campaignUi.slice(renderIndex, renderIndex + 300);
const order = ["renderBattleSurface()", "refreshEffectiveCardCosts()", "renderCampaignHud()"];
let last = -1;
for (const item of order) {
  const pos = renderBlock.indexOf(item);
  assert.ok(pos >= 0, `最终 render 缺少 ${item}`);
  assert.ok(pos > last, `${item} 顺序错误`);
  last = pos;
}

// 4) renderBattleSurface 不应直接修改核心玩法字段。
for (const pattern of [
  /fighter\.hp\s*=(?!=)/,
  /fighter\.energy\s*=(?!=)/,
  /fighter\.statuses\s*=(?!=)/,
  /gameEngine\.state\.turn\s*=(?!=)/,
  /gameEngine\.state\.round\s*=(?!=)/,
]) {
  assert.doesNotMatch(battleSurfaceBlock, pattern, `renderBattleSurface 不应修改玩法状态：${pattern}`);
}

// 5) 历史 wrapper 命名不得回归。
assert.doesNotMatch(html, /originalRenderBattleLayoutV3/, "不应保留 originalRenderBattleLayoutV3");
assert.doesNotMatch(campaignUi, /const originalRender = uiRenderer\.render\.bind/, "不应保留 originalRender");

console.log("uiRenderer.render 管线验证通过：单一公共入口、renderBattleSurface 顺序、子渲染调用、无玩法状态写入与历史命名清理均符合预期。");
