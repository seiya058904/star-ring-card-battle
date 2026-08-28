import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map(m => m[2]);
const finalBlock = styleBlocks[1] || "";

// 1) Campaign HUD root 权威规则存在。
assert.match(finalBlock, /\.campaign-hud \{/, "final block 应包含 .campaign-hud");
assert.match(finalBlock, /\.campaign-hud \{[\s\S]*?position:\s*absolute/, ".campaign-hud 应使用 absolute 定位");
assert.match(finalBlock, /\.campaign-hud \{[\s\S]*?z-index:\s*30/, ".campaign-hud 应保持 z-index 30");

// 2) 子组件选择器存在。
for (const selector of [
  ".campaign-ring",
  ".campaign-ring i",
  ".campaign-ring i.on",
  ".campaign-intent",
]) {
  assert.ok(finalBlock.includes(selector), `CSS 缺少 Campaign HUD 选择器：${selector}`);
}

// 3) 响应式 Campaign HUD 规则存在。
assert.match(finalBlock, /@media \(max-width:\s*700px\)[\s\S]*\.campaign-hud/, "700px 媒体查询应包含 campaign-hud 覆盖");
assert.match(finalBlock, /@media \(max-width:\s*700px\)[\s\S]*\.campaign-ring i/, "700px 媒体查询应包含 campaign-ring 覆盖");

console.log("Campaign HUD CSS 所有权验证通过：root/子组件/响应式规则存在，z-index 30 保持。");
