import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");

const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map((m, i) => ({
  index: i,
  attrs: m[1].trim(),
  css: m[2],
}));

assert.equal(styleBlocks.length, 3, `应保持 3 个 style 块（当前 ${styleBlocks.length}）`);
assert.equal(styleBlocks[0].attrs, "", "第一个 style 块应为历史基础样式");
assert.match(styleBlocks[1].attrs, /battle-visual-polish-final/, "第二个 style 块应为 battle-visual-polish-final");
assert.match(styleBlocks[2].attrs, /battleSpeedOverride/, "最后一个 style 块应为 battleSpeedOverride");

const allCss = styleBlocks.map(b => b.css).join("\n");
const importantCount = (allCss.match(/!important/g) || []).length;
const mediaCount = (allCss.match(/@media/g) || []).length;
const keyframesCount = (allCss.match(/@keyframes/g) || []).length;
const inlineStyleAttrs = (html.match(/style="/g) || []).length;
const jsStyleWrites = (html.match(/\.style\./g) || []).length;

assert.ok(importantCount < 5000, `!important 数量应低于 5000（当前 ${importantCount}）`);
assert.ok(importantCount > 0, `!important 数量应大于 0（当前 ${importantCount}）`);
assert.equal(mediaCount, 21, `@media 区域应为 21（当前 ${mediaCount}；含 ≤768px 战斗手牌专用断点）`);
assert.ok(keyframesCount >= 50, `@keyframes 数量应不少于 50（当前 ${keyframesCount}）`);
assert.ok(inlineStyleAttrs > 20, `内联 style 属性应存在（当前 ${inlineStyleAttrs}）`);
assert.ok(jsStyleWrites > 20, `JS .style 写入应存在（当前 ${jsStyleWrites}）`);

// 关键视觉家族必须存在于 CSS 中。
for (const family of [
  ".card",
  ".fighter-card",
  ".preview-card",
  ".battle-layout",
  ".campaign-hud",
  ".duel-unit",
  ".unit-overhead-hp",
]) {
  assert.ok(allCss.includes(family), `CSS 缺少关键视觉家族：${family}`);
}

// 媒体查询断点存在且最终覆盖块包含响应式区域。
assert.match(styleBlocks[1].css, /@media/, "battle-visual-polish-final 应包含媒体查询");

console.log(`CSS 所有权校验通过：style 块 ${styleBlocks.length} 个；!important ${importantCount}；@media ${mediaCount}；@keyframes ${keyframesCount}；关键视觉家族齐全。`);
