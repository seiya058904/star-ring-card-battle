import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map(m => m[2]);
const finalBlock = styleBlocks[1] || "";

// 1) 基础 .card 规则存在。
assert.match(html, /\.card \{[\s\S]*?flex: 0 0 var\(--card-w\)/, "基础 .card 规则应存在");

// 2) 权威 hand-dock card 规则存在。
assert.match(finalBlock, /body\.battle-mode \.hand-dock-v3 \.card/, "battle-visual-polish-final 应包含 hand-dock card 规则");
assert.match(finalBlock, /body\.battle-mode \.hand-dock-v3 \.card:hover/, "hand-dock card hover 规则应存在");

// 3) 旧 block0 hand-dock card 模式已移除。
assert.doesNotMatch(html, /min-height: 226px;/, "旧 block0 hand-dock card min-height 不应残留");
assert.doesNotMatch(html, /\.hand-dock-v3 \.card \{[\s\S]*?min-height: 226px;/, "旧 block0 hand-dock card 规则不应残留");

// 4) 关键状态/层级选择器存在。
for (const selector of [
  ".card.unplayable",
  ".card[data-tier=\"base\"]",
  ".card[data-tier=\"advanced\"]",
  ".card[data-tier=\"special\"]",
  ".card-tier-crown",
  ".card-advantage-badge",
  ".card-orbit-system",
  ".card-art",
]) {
  assert.ok(html.includes(selector), `CSS 缺少关键卡牌选择器：${selector}`);
}

// 5) 响应式 card 覆盖存在。
assert.match(finalBlock, /@media \(max-width: 1366px\)[\s\S]*body\.battle-mode \.hand-dock-v3 \.card/, "1366px 媒体查询应包含 hand-dock card 覆盖");
assert.match(finalBlock, /@media \(max-width: 1400px\)[\s\S]*body\.battle-mode \.hand-dock-v3 \.card/, "1400px 媒体查询应包含 hand-dock card 覆盖");

console.log("card CSS 所有权验证通过：基础规则存在、权威 hand-dock 规则存在、旧 block0 模式已清理、状态/层级/响应式选择器齐全。");
