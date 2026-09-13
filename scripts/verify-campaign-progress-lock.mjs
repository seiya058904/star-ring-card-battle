import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

// 构造可记录/排队回调的假 Web Locks，覆盖真实 navigator.locks 路径（区别于并发测试里的 fallback 路径）。
function makeLocksStub() {
  const calls = [];
  const locks = {
    calls,
    request(name, callback) {
      calls.push({ name, callback });
      // 模拟真实语义：回调立即执行一次并返回其结果（Promise 化由浏览器负责）。
      return Promise.resolve(callback());
    },
  };
  return locks;
}

async function makeModeContext({ withLocks = true } = {}) {
  const context = { console, Math, Date, JSON, Number, String, Array, Object, Set, Map, isFinite, parseInt, parseFloat, Boolean };
  if (withLocks) context.navigator = { locks: makeLocksStub() };
  vm.createContext(context);
  vm.runInContext(await read("js/campaign-mode.js"), context, { filename: "js/campaign-mode.js" });
  return context;
}

const coreSource = await read("js/fixed-game-rules.js");
const uiSource = await read("js/campaign-ui.js");

// 1. 契约：两条写路径都必须经 campaignMode.commitProgress，且锁实现只存在于 campaign-mode。
assert.match(coreSource, /global\.campaignMode\.commitProgress\(commitCampaignResult\)/);
assert.match(uiSource, /mode\.commitProgress\(/);
assert.doesNotMatch(coreSource, /navigator\.locks/, "结算层不得自建锁路径");
assert.doesNotMatch(uiSource, /navigator\.locks/, "重置层不得自建锁路径");

// 2. Web Locks 存在：写入在锁回调内执行，锁名由 STORAGE_KEY 派生且两处一致。
{
  const context = await makeModeContext({ withLocks: true });
  const order = [];
  const result = await context.campaignMode.commitProgress(() => { order.push("write-in-lock"); return "ok"; });
  assert.equal(result, "ok");
  assert.deepEqual(order, ["write-in-lock"], "写入必须在锁回调内执行");
}

// 3. 锁名固定且唯一：reset 与结算共用同一把锁（字符串契约，防止两处各自命名）。
{
  const context = await makeModeContext({ withLocks: true });
  const names = [];
  context.campaignMode.commitProgress(() => {});
  names.push(context.navigator.locks.calls[0].name);
  assert.equal(names[0], `${context.campaignMode.STORAGE_KEY}-commit`);
  assert.equal(context.navigator.locks.calls.length, 1);
}

// 4. 两个写入排队时按提交顺序串行执行（模拟锁的序列化语义）。
{
  const context = await makeModeContext({ withLocks: true });
  const order = [];
  const p1 = context.campaignMode.commitProgress(() => order.push("first"));
  const p2 = context.campaignMode.commitProgress(() => order.push("second"));
  await Promise.all([p1, p2]);
  assert.deepEqual(order, ["first", "second"], "同锁写入必须按到达顺序串行执行");
}

// 5. 无 navigator.locks：同步执行（best-effort fallback），不影响返回值。
{
  const context = await makeModeContext({ withLocks: false });
  let ran = false;
  const result = context.campaignMode.commitProgress(() => { ran = true; return 42; });
  assert.equal(ran, true);
  assert.equal(result, 42);
}

// 6. startCampaign 单快照契约：包装层把同一次 progress 快照传给开战函数，
//    authorizeStage 与 progressGeneration 基于同一状态，且开战函数不再二次读取 progress。
assert.match(uiSource, /return originalStartCampaign\(saved\)/);
assert.match(uiSource, /progressGeneration: Number\(saved\.resetGeneration\) \|\| 0/);
{
  const startBody = uiSource.match(/function startCampaign\(snapshot\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.ok(startBody, "无法定位 startCampaign 函数体");
  assert.match(startBody, /const saved = snapshot \|\| progress\(\)/);
  assert.doesNotMatch(startBody, /Number\(progress\(\)/, "开战函数体内不得出现第二次 progress 读取");
}

console.log("verify-campaign-progress-lock: 6/6 PASS");
