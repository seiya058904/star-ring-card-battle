#!/usr/bin/env node
// 聚合所有安全只读验证脚本。
// 每个独立脚本保持可单独运行；本编排只负责顺序执行、透传输出并汇总失败。

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

const suites = [
  { name: "固定角色与卡牌库", file: "scripts/verify-fixed-card-library.mjs" },
  { name: "战役规则与进度", file: "scripts/verify-campaign.mjs" },
  { name: "特殊卡真实行为", file: "scripts/verify-special-card-behavior.mjs" },
  { name: "音频库", file: "scripts/verify-audio-library.mjs" },
  { name: "战斗效果与覆写链", file: "scripts/verify-battle-effects.mjs" },
  { name: "战斗启动 smoke", file: "scripts/verify-battle-start-smoke.mjs" },
  { name: "战役显示 smoke", file: "scripts/verify-campaign-display-smoke.mjs" },
  { name: "战役 applyCard 集成边界", file: "scripts/verify-campaign-apply-card-chain.mjs" },
  { name: "战役 playCard 集成边界", file: "scripts/verify-campaign-play-card-chain.mjs" },
  { name: "战役 turn transition", file: "scripts/verify-campaign-turn-transition.mjs" },
  { name: "战役 AI turn", file: "scripts/verify-campaign-ai-turn.mjs" },
  { name: "战役 runtime boundaries", file: "scripts/verify-campaign-runtime-boundaries.mjs" },
  { name: "campaign-rules 模块契约", file: "scripts/verify-campaign-rules-module.mjs" },
  { name: "campaign-runtime 模块契约", file: "scripts/verify-campaign-runtime-module.mjs" },
  { name: "渲染器所有权普查", file: "scripts/verify-renderer-ownership.mjs" },
  { name: "renderCard 特征", file: "scripts/verify-render-card.mjs" },
  { name: "renderFighter 特征", file: "scripts/verify-render-fighter.mjs" },
  { name: "renderCardPreview 特征", file: "scripts/verify-render-card-preview.mjs" },
  { name: "renderDuelUnit 特征", file: "scripts/verify-render-duel-unit.mjs" },
  { name: "uiRenderer.render 管线", file: "scripts/verify-ui-render-pipeline.mjs" },
  { name: "effectsRenderer.play lock", file: "scripts/verify-effects-play-lock.mjs" },
  { name: "CSS 所有权", file: "scripts/verify-css-ownership.mjs" },
  { name: "battle-layout CSS", file: "scripts/verify-battle-layout-css.mjs" },
  { name: "card CSS", file: "scripts/verify-card-css.mjs" },
  { name: "fighter CSS", file: "scripts/verify-fighter-css.mjs" },
  { name: "Preview CSS", file: "scripts/verify-preview-css.mjs" },
  { name: "Campaign HUD CSS", file: "scripts/verify-campaign-hud-css.mjs" },
  { name: "responsive 所有权", file: "scripts/verify-responsive-ownership.mjs" },
  { name: "战斗不变式", file: "scripts/verify-battle-invariants.mjs" },
  { name: "运行时所有权", file: "scripts/verify-runtime-ownership.mjs" },
  { name: "Android 网页素材 parity", file: "scripts/verify-android-web-assets.mjs" },
];

let failed = 0;
const results = [];

for (const suite of suites) {
  const target = path.join(repositoryRoot, suite.file);
  process.stdout.write(`\n===== ${suite.name} (${suite.file}) =====\n`);
  const child = spawnSync(process.execPath, [target], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  const ok = child.status === 0;
  results.push({ name: suite.name, ok, status: child.status });
  if (!ok) failed += 1;
}

console.log("\n==================== 验证汇总 ====================");
let allOk = true;
for (const result of results) {
  const mark = result.ok ? "PASS" : "FAIL";
  if (!result.ok) allOk = false;
  console.log(`[${mark}] ${result.name}`);
}
console.log(`\n${results.length - failed}/${results.length} 项通过。`);
if (!allOk) {
  console.error("verify-all.mjs 失败：存在未通过的验证脚本。");
  process.exit(1);
}
console.log("verify-all.mjs 全部通过。");
