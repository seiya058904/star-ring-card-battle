import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");

const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map(m => m[2]);
const finalBlock = styleBlocks[1] || "";

// 1) 权威 battle-layout 基础声明存在。
assert.match(finalBlock, /body\.battle-mode \.battle-layout-v3 \{/, "battle-visual-polish-final 应包含权威 battle-layout 基础声明");
assert.match(finalBlock, /grid-template-rows:\s*56px minmax\(0, 1fr\) 326px !important/, "最终权威基础应使用 56px/326px 布局");
assert.match(finalBlock, /display:\s*grid !important/, "最终权威基础应声明 display:grid");
assert.match(finalBlock, /overflow:\s*hidden !important/, "最终权威基础应声明 overflow:hidden");

// 2) 已知旧的非媒体 battle-layout 覆写已被移除。
assert.doesNotMatch(html, /grid-template-rows:\s*64px minmax\(0, 1fr\) 270px !important/, "旧 64px battle-layout 声明不应残留");
assert.doesNotMatch(html, /grid-template-rows:\s*58px minmax\(0, 1fr\) 366px !important/, "旧 58px battle-layout 声明不应残留");

// 3) 响应式覆盖仍存在。
for (const query of ["@media (max-width: 1600px)", "@media (max-width: 1366px)", "@media (max-width: 980px)"]) {
  assert.ok(finalBlock.includes(query), `battle-layout 响应式缺少 ${query}`);
}
assert.match(finalBlock, /@media \(max-width: 1366px\)[\s\S]*body\.battle-mode \.battle-layout-v3/, "1366px 媒体查询应包含 battle-layout 覆盖");
assert.ok(finalBlock.includes("@media (max-width: 980px)"), "980px 媒体查询应存在");

console.log("battle-layout CSS 所有权验证通过：权威基础存在、旧非媒体覆写已清理、响应式覆盖保留。");
