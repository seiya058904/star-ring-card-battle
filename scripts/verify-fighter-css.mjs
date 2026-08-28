import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map(m => m[2]);
const finalBlock = styleBlocks[1] || "";

// 1) 基础 .fighter-card 规则存在。
assert.match(html, /\.fighter-card \{/, "基础 .fighter-card 规则应存在");

// 2) 权威 battle-hud fighter 规则存在。
assert.match(finalBlock, /body\.battle-mode \.battle-hud \.fighter-card/, "battle-visual-polish-final 应包含 battle-hud fighter 规则");
assert.match(finalBlock, /body\.battle-mode \.battle-hud-enemy \.fighter-card/, "敌方 fighter 规则应存在");

// 3) 旧 block0 battle-hud fighter 模式已移除。
assert.doesNotMatch(html, /padding: 10px 12px 12px !important;/, "旧 block0 battle-hud fighter padding 不应残留");
assert.doesNotMatch(html, /\.battle-hud \.fighter-card \{\s*padding: 10px 12px 12px !important;/, "旧 block0 battle-hud fighter 规则不应残留");

// 4) 关键 Fighter HUD 子选择器存在。
for (const selector of [
  ".fighter-name",
  ".bar",
  ".bar-fill",
  ".bar-text",
  ".status-line",
  ".mechanic-note",
  ".enemy-hand-in-hud",
  ".energy-row",
  ".energy-dot",
]) {
  assert.ok(html.includes(selector), `CSS 缺少 Fighter HUD 选择器：${selector}`);
}

// 5) 响应式 Fighter 规则存在。
assert.match(finalBlock, /@media \(max-width: 1366px\)[\s\S]*body\.battle-mode \.battle-hud/, "1366px 媒体查询应包含 battle-hud 规则");
assert.match(finalBlock, /@media \(max-width: 1600px\)[\s\S]*body\.battle-mode \.battle-hud/, "1600px 媒体查询应包含 battle-hud 规则");

console.log("fighter CSS 所有权验证通过：基础规则存在、权威 battle-hud 规则存在、旧 block0 模式已清理、关键子选择器与响应式规则齐全。");
