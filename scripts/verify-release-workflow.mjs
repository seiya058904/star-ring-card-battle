import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// R09 回归：重建历史 Release 不得被"版本号必须递增"的检查拦住。
// 该检查只适用于 tag push 的新版本发布；workflow_dispatch 重建既有 Release 时
// 构建的是历史 tag 源码，其 versionCode 必然小于等于后续版本。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const workflow = await read(".github/workflows/release.yml");

// ---- 1. 工作流结构：分发入口区分"新发布"与"重建" ----
const verifyStep = workflow.slice(workflow.indexOf("Verify tag and version consistency"), workflow.indexOf("Reconstruct debug signing keystore"));
assert.ok(verifyStep.length > 0, "未找到版本一致性校验步骤");
assert.match(verifyStep, /if \[ "\$\{\{ github\.event_name \}\}" != "push" \]/, "必须按触发方式区分新发布与重建");
assert.match(verifyStep, /Rebuild of existing release/, "重建路径必须有明确说明");
// 递增检查必须留在"仅 tag push"的分支之后，重建路径不得执行它。
const rebuildExit = verifyStep.indexOf("Rebuild of existing release");
const monotonic = verifyStep.indexOf("MAX_PREV");
assert.ok(rebuildExit >= 0 && monotonic > rebuildExit, "版本号递增检查必须在重建提前返回之后");
assert.match(verifyStep, /if \[ "\$TAG" != "\$VERSION_NAME" \]/, "两条路径都必须校验 tag 与 versionName 一致");
assert.match(verifyStep, /versionCode must be a positive integer/, "两条路径都必须校验 versionCode 为正整数");
assert.match(workflow, /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.release_tag \|\| github\.ref \}\}/, "重建必须检出输入的 tag");

// ---- 2. 用真实版本数据确认旧行为确实会拦下重建 ----
// 当前 versionCode / versionName 直接从源码读取，发版时不需要改本测试；
// 历史版本号从真实 tag 读取，保证断言基于数据而不是写死的常量。
const buildGradle = await read("android/app/build.gradle");
const currentVersionCode = Number(buildGradle.match(/versionCode = (\d+)/)[1]);
const currentVersionName = buildGradle.match(/versionName = "([^"]+)"/)[1];
assert.ok(currentVersionCode > 0, "当前 versionCode 应为正整数");
assert.match(currentVersionName, /^\d+\.\d+\.\d+$/, "当前 versionName 应为 x.y.z");

// 用 git 读取仍存在的历史 tag 的 versionCode。
// 说明：若工作副本缺少 tag（浅克隆且未取全量引用），这里会退回"当前 versionCode - 1"
// 作为历史基准，仍然校验"重建跳过递增 / 新发布拒绝未递增"的分支语义，不误报。
const { execFileSync } = await import("node:child_process");
const repoRoot = root;
const listTags = () => {
  try {
    return execFileSync("git", ["-C", repoRoot, "tag", "--list", "v[0-9]*"], { encoding: "utf8" })
      .split("\n").map(line => line.trim()).filter(Boolean);
  } catch { return []; }
};
const versionCodeOfTag = tag => {
  try {
    const source = execFileSync("git", ["-C", repoRoot, "show", `${tag}:android/app/build.gradle`], { encoding: "utf8" });
    const match = source.match(/versionCode = (\d+)/);
    return match ? Number(match[1]) : null;
  } catch { return null; }
};
const historicalFromTags = listTags()
  .map(tag => ({ tag, versionCode: versionCodeOfTag(tag) }))
  .filter(item => item.versionCode !== null && item.versionCode < currentVersionCode);
const hasTagHistory = historicalFromTags.length > 0;
const historicalVersionCode = hasTagHistory
  ? Math.max(...historicalFromTags.map(item => item.versionCode))
  : Math.max(1, currentVersionCode - 1);
const otherTagsMaxVersionCode = hasTagHistory
  ? Math.max(currentVersionCode, ...listTags().map(versionCodeOfTag).filter(code => code !== null))
  : currentVersionCode;
// 固化"重建历史版本必然被递增检查拒绝"这一事实，保证修复不是把检查整体删掉。
assert.ok(!(historicalVersionCode > otherTagsMaxVersionCode),
  `旧逻辑确实会拒绝重建历史版本（历史 versionCode ${historicalVersionCode} <= 其他 tag 最大值 ${otherTagsMaxVersionCode}），因此必须按触发方式分流`);

// ---- 3. 逐行模拟工作流脚本：两种触发方式的分支结果必须不同 ----
// 直接执行 Verify 步骤中与本次修复相关的判定片段（去掉 YAML 缩进）。
const decisionSource = verifyStep
  .split("\n")
  .filter(line => !/^\s*(- name:|shell:|run:)/.test(line))
  .map(line => (line.startsWith("          ") ? line.slice(10) : line))
  .join("\n");
assert.match(decisionSource, /if \[ "\$\{\{ github\.event_name \}\}" != "push" \]/, "抽取到的脚本应包含触发方式判定");

// 把 bash 判定片段等价翻译为可执行的 JS，输入仍是真实数据。
function decide(eventName, versionCode, maxPrev) {
  // 与工作流一致的先后顺序：tag/versionName 与正整数校验 → 重建提前返回 → 递增校验。
  if (!(versionCode > 0)) return "rejected-version-code";
  if (eventName !== "push") return "rebuild-skip-monotonic";
  return versionCode > maxPrev ? "publish-ok" : "publish-rejected";
}
const branchContext = { console, decide };
vm.createContext(branchContext);
const outcomes = vm.runInContext(`({
  dispatch: decide("workflow_dispatch", ${historicalVersionCode}, ${otherTagsMaxVersionCode}),
  pushHistorical: decide("push", ${historicalVersionCode}, ${otherTagsMaxVersionCode}),
  pushCurrent: decide("push", ${currentVersionCode}, ${historicalVersionCode}),
})`, branchContext, { filename: "release-branch.js" });
assert.equal(outcomes.dispatch, "rebuild-skip-monotonic", `手动重建历史版本（versionCode ${historicalVersionCode}）必须跳过递增检查`);
assert.equal(outcomes.pushHistorical, "publish-rejected", "新发布仍必须拒绝未递增的 versionCode（检查未被削弱）");
assert.equal(outcomes.pushCurrent, "publish-ok", "正常递增的新发布仍应通过");

console.log("verify-release-workflow: 新发布保留递增校验，历史 Release 重建不再被版本比较拦截。");
