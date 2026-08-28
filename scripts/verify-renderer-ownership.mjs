import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

const [html, campaignUi, campaignRuntime] = await Promise.all([
  read("index.html"),
  read("js/campaign-ui.js"),
  read("js/campaign-runtime.js"),
]);

// ---- Renderer ownership facts ----

// renderCard: 已收敛为单一权威实现，且不允许后续 renderCard 覆写。
const renderCardDefinitions = (html.match(/function renderCard\(/g) || []).length;
const renderCardAssignments = (html.match(/renderCard = function/g) || []).length;
assert.equal(renderCardDefinitions, 1, `index.html 应只有 1 个 renderCard 函数定义（当前 ${renderCardDefinitions}）`);
assert.equal(renderCardAssignments, 0, `renderCard 不应再存在赋值覆写（当前 ${renderCardAssignments}）`);
assert.doesNotMatch(campaignUi, /renderCard\s*=\s*function/, "campaign-ui 不应拥有 renderCard 赋值");
assert.doesNotMatch(campaignRuntime, /renderCard\s*=\s*function/, "campaign-runtime 不应拥有 renderCard 赋值");

// renderCardPreview: 单一公共入口在 campaign-ui，基础预览由 index renderBaseCardPreview 提供。
const previewAssignmentsInUi = (campaignUi.match(/renderCardPreview = function/g) || []).length;
assert.equal(previewAssignmentsInUi, 1, `campaign-ui 应只有 1 个 renderCardPreview 赋值（当前 ${previewAssignmentsInUi}）`);
assert.ok((html.match(/function renderBaseCardPreview\(/g) || []).length === 1, "index.html 应只有 1 个 renderBaseCardPreview");
assert.doesNotMatch(html, /renderCardPreview = function/, "index.html 不应再拥有 renderCardPreview 赋值");
assert.doesNotMatch(html, /function renderCardPreview\(/, "index.html 不应再保留 renderCardPreview 函数定义");
assert.match(campaignUi, /const renderBaseCardPreview = global\.renderBaseCardPreview;/, "campaign-ui 应捕获 renderBaseCardPreview");
assert.doesNotMatch(campaignUi, /originalCampaignPreview/, "不应保留 originalCampaignPreview");
assert.doesNotMatch(campaignRuntime, /renderCardPreview\s*=\s*function/, "campaign-runtime 不应拥有 renderCardPreview");

// uiRenderer.render: 单一权威公共入口位于 campaign-ui，内部调用显式 renderBattleSurface。
const renderAssignmentsInHtml = (html.match(/uiRenderer\.render = function/g) || []).length;
const renderAssignmentsInUi = (campaignUi.match(/uiRenderer\.render = function/g) || []).length;
assert.equal(renderAssignmentsInHtml, 0, `index.html 不应再拥有 uiRenderer.render 赋值（当前 ${renderAssignmentsInHtml}）`);
assert.equal(renderAssignmentsInUi, 1, `campaign-ui 应只有 1 个 uiRenderer.render 赋值（当前 ${renderAssignmentsInUi}）`);
assert.match(html, /renderBattleSurface\(\) \{/, "index.html 应定义 renderBattleSurface 基础渲染方法");
assert.match(campaignUi, /const renderBattleSurface = uiRenderer\.renderBattleSurface\.bind\(uiRenderer\);/, "campaign-ui 应捕获 renderBattleSurface");
assert.doesNotMatch(html, /originalRenderBattleLayoutV3/, "不应保留 originalRenderBattleLayoutV3");
assert.doesNotMatch(campaignUi, /const originalRender = uiRenderer\.render\.bind/, "不应保留 originalRender 历史命名");

// uiRenderer.renderFighter: 已收敛为单一权威实现。
const renderFighterAssignments = (html.match(/uiRenderer\.renderFighter = function/g) || []).length;
assert.equal(renderFighterAssignments, 1, `uiRenderer.renderFighter 应只有 1 个赋值（当前 ${renderFighterAssignments}）`);
assert.doesNotMatch(html, /originalRenderFighterStandard/, "不应保留 originalRenderFighterStandard 历史命名");
assert.doesNotMatch(campaignUi, /uiRenderer\.renderFighter\s*=\s*function/, "campaign-ui 不应拥有 renderFighter 赋值");
assert.doesNotMatch(campaignRuntime, /uiRenderer\.renderFighter\s*=\s*function/, "campaign-runtime 不应拥有 renderFighter 赋值");

// uiRenderer.renderDuelUnit: 已收敛为单一对象方法，无历史包装。
assert.match(html, /renderDuelUnit\(id, fighter, isPlayer\) \{/, "index.html 应包含 renderDuelUnit 方法");
assert.doesNotMatch(html, /originalRenderDuelUnitStandard/, "不应保留 originalRenderDuelUnitStandard");
assert.doesNotMatch(html, /uiRenderer\.renderDuelUnit = function/, "不应存在 renderDuelUnit 赋值覆写");
assert.doesNotMatch(campaignUi, /uiRenderer\.renderDuelUnit\s*=\s*function/, "campaign-ui 不应拥有 renderDuelUnit 赋值");
assert.doesNotMatch(campaignRuntime, /uiRenderer\.renderDuelUnit\s*=\s*function/, "campaign-runtime 不应拥有 renderDuelUnit 赋值");

// 其余小渲染器：final owner remains index.html。
for (const method of ["renderSummons", "renderLog", "renderOpponentHand"]) {
  assert.ok(html.includes(`${method}(`), `index.html 应包含 ${method}`);
  assert.doesNotMatch(campaignUi, new RegExp(`uiRenderer\\.${method}\\s*=\\s*function`), `campaign-ui 不应拥有 ${method}`);
  assert.doesNotMatch(campaignRuntime, new RegExp(`uiRenderer\\.${method}\\s*=\\s*function`), `campaign-runtime 不应拥有 ${method}`);
}

// effectsRenderer.play: 单一权威公共入口，基础特效通过显式 helper 调用。
const effectsPlayAssignments = (html.match(/effectsRenderer\.play = function/g) || []).length;
assert.equal(effectsPlayAssignments, 1, `effectsRenderer.play 应只有 1 个赋值（当前 ${effectsPlayAssignments}）`);
assert.match(html, /const playStandardBattleEffect = effectsRenderer\.play\.bind\(effectsRenderer\);/, "index.html 应定义 playStandardBattleEffect helper");
assert.match(html, /playStandardBattleEffect\(card, result\)/, "effectsRenderer.play 应调用 playStandardBattleEffect");
assert.doesNotMatch(html, /originalEffectsPlayStandard/, "不应保留 originalEffectsPlayStandard 历史命名");
assert.doesNotMatch(campaignUi, /effectsRenderer\.play\s*=\s*function/, "campaign-ui 不应拥有 effectsRenderer.play");
assert.doesNotMatch(campaignRuntime, /effectsRenderer\.play\s*=\s*function/, "campaign-runtime 不应拥有 effectsRenderer.play");

// cardColors: final owner remains index.html.
assert.ok((html.match(/cardColors = function/g) || []).length >= 1, "index.html 应拥有 cardColors 赋值");
assert.doesNotMatch(campaignUi, /cardColors\s*=\s*function/, "campaign-ui 不应拥有 cardColors");
assert.doesNotMatch(campaignRuntime, /cardColors\s*=\s*function/, "campaign-runtime 不应拥有 cardColors");

// ---- Action-lock / visual coupling ----
assert.match(html, /state\.actionLocked = true/, "index.html/fixed rules 应存在 actionLocked 设置");
assert.match(html, /state\.actionLocked = false/, "index.html/fixed rules 应存在 actionLocked 清除");
assert.match(html, /this\._playLock = 0/, "effectsRenderer 应存在 _playLock 清除");

// ---- CSS census ----
const styleTags = (html.match(/<style/g) || []).length;
const importantCount = (html.match(/!important/g) || []).length;
const mediaQueries = (html.match(/@media/g) || []).length;
assert.equal(styleTags, 3, `index.html 应有 3 个 style 块（当前 ${styleTags}）`);
assert.ok(importantCount > 1000, `!important 数量应较大（当前 ${importantCount}）`);
assert.ok(mediaQueries >= 10, `应有多个 media query（当前 ${mediaQueries}）`);

console.log(`渲染器所有权普查通过：renderCard 定义 ${renderCardDefinitions} 个/赋值 ${renderCardAssignments} 个；CSS style 块 ${styleTags} 个；!important ${importantCount} 个；media query ${mediaQueries} 个。`);
