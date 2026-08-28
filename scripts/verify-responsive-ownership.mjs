import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map(m => m[2]);

const mediaCounts = styleBlocks.map(css => (css.match(/@media/g) || []).length);
const totalMedia = mediaCounts.reduce((a, b) => a + b, 0);

// 当前响应式架构以碎片化为特征，但 verifier 不冻结精确数量。
assert.ok(totalMedia >= 15 && totalMedia <= 25, `媒体查询总数应在 15-25 区间（当前 ${totalMedia}）`);
assert.equal(mediaCounts[2], 0, "speed override 块不应包含 @media");

const allCss = styleBlocks.join("\n");
for (const condition of ["@media (max-width: 1600px)", "@media (max-width: 1366px)", "@media (max-width: 980px)"]) {
  const count = (allCss.match(new RegExp(condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  assert.ok(count >= 2, `${condition} 应存在至少 2 个区域（当前 ${count}）`);
}

// 关键组件在媒体查询中必须存在。
for (const family of ["battle-layout-v3", "hand-dock-v3", ".card-preview-panel", ".campaign-hud"]) {
  assert.ok(allCss.includes(family), `CSS 缺少关键响应式家族：${family}`);
}

assert.match(allCss, /@media \(max-width: 1600px\)[\s\S]*body\.battle-mode \.hand-dock-v3/, "1600px 媒体查询应包含 hand-dock 覆盖");
assert.match(allCss, /@media \(max-width: ?700px\)[\s\S]*\.campaign-hud/, "700px 媒体查询应包含 campaign-hud 覆盖");

console.log(`responsive 所有权校验通过：媒体查询 ${totalMedia} 个；已知重复断点 1600/1366/980 保留；关键组件响应式覆盖存在。`);
