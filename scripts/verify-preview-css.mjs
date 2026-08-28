import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map(m => m[2]);
const finalBlock = styleBlocks[1] || "";

// 1) Preview root 与关键子选择器存在。
for (const selector of [
  ".card-preview-panel",
  ".preview-card-title",
  ".preview-card-meta",
  ".preview-art-box",
  ".preview-card-desc",
  ".preview-card-keywords",
  ".preview-card-power",
  ".preview-detail-grid",
  ".preview-empty",
]) {
  assert.ok(html.includes(selector), `CSS 缺少 Preview 选择器：${selector}`);
}

// 2) 权威 Preview root 规则存在。
assert.match(finalBlock, /body\.battle-mode \.card-preview-panel/, "battle-visual-polish-final 应包含 card-preview-panel 规则");
assert.match(finalBlock, /z-index:\s*910 !important/, "Preview 应保留 z-index 910");

// 3) 旧 block0 ::before 已移除。
assert.doesNotMatch(html, /\.card-preview-panel::before \{[\s\S]*?content: "卡牌说明";/, "旧 block0 Preview ::before 不应残留");
assert.doesNotMatch(html, /content: "卡牌说明";/, "旧 block0 Preview content 不应残留");

// 4) 响应式 Preview 规则存在。
assert.match(finalBlock, /@media \(max-width: 1366px\)[\s\S]*body\.battle-mode \.card-preview-panel/, "1366px 媒体查询应包含 Preview 覆盖");
assert.match(finalBlock, /@media \(max-width: 1400px\)[\s\S]*body\.battle-mode \.card-preview-panel/, "1400px 媒体查询应包含 Preview 覆盖");

console.log("Preview CSS 所有权验证通过：root/子选择器存在、权威规则存在、旧 block0 ::before 已清理、响应式覆盖保留。");
