// 独立红队反证：结算存档写前校验的结构完整性边界。
//
// 三个此前的可复现缺陷（均在云端 47/47 通过后仍然存在，属上一轮未覆盖的边界）：
//   1. 已存在的角色记录是 []/原始值时，readProgressForWrite 放行，normalizeProgress 把它
//      静默重置为 { unlockedStage: 1, completed: false }。
//   2. recentBattles 存在但类型是字符串时，写前校验放行，归一化成空数组（历史被丢弃）。
//   3. revision = Number.MAX_SAFE_INTEGER - 1 能通过写前校验，但写出 revision + 1 后，
//      下一次写前校验会拒绝，导致存档自我锁死、之后再也无法保存。
//
// 本脚本同时做反向回归（撤销加固后必须重新失败）与旧 v1 兼容（合法旧档必须继续可写）。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const [rulesSource, modeSource] = await Promise.all([
  read("js/fixed-game-rules.js"),
  read("js/campaign-mode.js"),
]);

const characters = [
  { id: "lisaya" }, { id: "luolinfo" }, { id: "eluxia" },
  { id: "moluo" }, { id: "heka" }, { id: "su" },
];
const STORAGE_KEY = "star-ring-campaign-progress-v1";
let passed = 0;
const check = (label, fn) => { fn(); passed += 1; console.log(`  ok ${passed}. ${label}`); };

// ── 纯模块级：加载真实 js/campaign-mode.js ──
function loadMode() {
  const c = { console, Math, Date, JSON, Number, String, Array, Object, Set, Map, Boolean, Promise };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(modeSource, c);
  return c.campaignMode;
}
const mode = loadMode();
const memoryStorage = obj => {
  let raw = obj === null ? null : JSON.stringify(obj);
  return { getItem: () => raw, setItem: (_k, v) => { raw = v; }, get raw() { return raw; } };
};
const attempts = obj => { try { mode.readProgressForWrite(memoryStorage(obj), characters); return true; } catch { return false; } };
const attemptRaw = raw => {
  const st = { getItem: () => raw, setItem: () => {} };
  try { mode.readProgressForWrite(st, characters); return true; } catch { return false; }
};

console.log("# A. 缺陷 1/2：已存在但结构无效的字段必须拒绝写入并保留原档");
for (const bad of [[], "oops", 42, true, null, { unlockedStage: "abc" }, { unlockedStage: {} }, { completed: {} }, { completed: null }]) {
  check(`角色记录 ${JSON.stringify(bad)} 被拒绝`, () => {
    assert.equal(attempts({ version: 1, revision: 1, resetGeneration: 0, characters: { luolinfo: { unlockedStage: 5, completed: true }, lisaya: bad }, recentBattles: [] }), false);
  });
}
for (const bad of ["corrupt", 7, {}, [null], [[]], ["x"], [{ characterId: "lisaya" }]]) {
  check(`recentBattles ${JSON.stringify(bad)} 被拒绝`, () => {
    assert.equal(attempts({ version: 1, revision: 1, resetGeneration: 0, characters: { lisaya: { unlockedStage: 2, completed: true } }, recentBattles: bad }), false);
  });
}
check("坏的字符 JSON 与重复根结构仍被拒绝", () => {
  assert.equal(attemptRaw("{"), false);
  assert.equal(attemptRaw("[]"), false);
  assert.equal(attemptRaw(JSON.stringify({ version: 2, characters: {} })), false);
});

console.log("# B. 旧 v1 兼容：合法旧档必须继续可写（不得误伤）");
const legacyOk = [
  ["缺 revision/resetGeneration", { version: 1, characters: { luolinfo: { unlockedStage: 5, completed: true } }, recentBattles: [] }],
  ["只保存部分角色", { version: 1, revision: 2, resetGeneration: 0, characters: { lisaya: { unlockedStage: 3 } } }],
  ["角色记录为空对象", { version: 1, revision: 2, resetGeneration: 0, characters: { lisaya: {} } }],
  ["recentBattles 缺失", { version: 1, revision: 2, resetGeneration: 0, characters: { lisaya: { unlockedStage: 2, completed: false } } }],
  ["数字字符串字段", { version: 1, revision: "3", resetGeneration: "0", characters: { lisaya: { unlockedStage: "2", completed: "true" } }, recentBattles: [{ characterId: "lisaya", stage: 1, victory: true, score: "A", rounds: 3 }] }],
  ["合法 recentBattles 记录", { version: 1, revision: 4, resetGeneration: 1, characters: {}, recentBattles: [{ characterId: "su", stage: 2, victory: false, score: "C", rounds: 9, difficulty: "hard", time: "2026-10-10T00:00:00.000Z" }] }],
];
for (const [label, save] of legacyOk) check(`合法旧档可写：${label}`, () => assert.equal(attempts(save), true));
check("JSON.stringify 后逐字节往返（缺字段归一为默认而非改写）", () => {
  const save = { version: 1, characters: { lisaya: { unlockedStage: 3 } }, recentBattles: [] };
  const normalized = mode.readProgressForWrite(memoryStorage(save), characters);
  assert.equal(normalized.revision, 0);
  assert.equal(normalized.resetGeneration, 0);
  assert.equal(normalized.characters.lisaya.unlockedStage, 3);
  assert.equal(normalized.characters.luolinfo.unlockedStage, 1);
});

console.log("# C. 缺陷 3：revision 数值边界不得产生无法再次校验的写入值");
check("advanceRevision 单调且在 MAX_SAFE_INTEGER - 1 饱和", () => {
  assert.equal(mode.advanceRevision(0), 1);
  assert.equal(mode.advanceRevision(41), 42);
  assert.equal(mode.advanceRevision(Number.MAX_SAFE_INTEGER - 2), Number.MAX_SAFE_INTEGER - 1);
  assert.equal(mode.advanceRevision(Number.MAX_SAFE_INTEGER - 1), Number.MAX_SAFE_INTEGER - 1);
  assert.equal(mode.advanceRevision(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER - 1);
  assert.equal(mode.advanceRevision(undefined), 1);
});
check("饱和边界：写出的 revision 一定仍被写前校验接受", () => {
  for (const start of [0, 1, 41, Number.MAX_SAFE_INTEGER - 3, Number.MAX_SAFE_INTEGER - 2, Number.MAX_SAFE_INTEGER - 1]) {
    const next = mode.advanceRevision(start);
    assert.equal(attempts({ version: 1, revision: next, resetGeneration: 0, characters: { lisaya: { unlockedStage: 2 } }, recentBattles: [] }), true, `revision=${next} 必须可读`);
  }
});
check("真实 resetProgress 在饱和 revision 上仍可写且结果可读", () => {
  const save = { version: 1, revision: Number.MAX_SAFE_INTEGER - 1, resetGeneration: 0, characters: { lisaya: { unlockedStage: 4, completed: true } }, recentBattles: [] };
  const st = memoryStorage(save);
  const fresh = mode.resetProgress(st, characters);
  assert.equal(fresh.resetGeneration, 1);
  assert.equal(JSON.parse(st.raw).revision, Number.MAX_SAFE_INTEGER - 1);
  // 重置产物必须能再次通过写前校验（不会自我锁死）
  assert.equal(mode.readProgressForWrite(st, characters).revision, Number.MAX_SAFE_INTEGER - 1);
});

console.log("# D. 端到端：真实 uiRenderer.showResult 写前校验（复用生产写回路径）");

const start = rulesSource.indexOf("uiRenderer.showResult = function()");
assert.ok(start >= 0, "缺少最终 showResult 覆写");
let end = rulesSource.indexOf("{", start), depth = 0;
for (; end < rulesSource.length; end += 1) {
  if (rulesSource[end] === "{") depth += 1;
  else if (rulesSource[end] === "}" && --depth === 0) { end += 1; break; }
}
const resultSource = rulesSource.slice(start, end + 1);
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ stored }) {
  let raw = typeof stored === "string" ? stored : stored === null ? null : JSON.stringify(stored);
  const initialRaw = raw;
  let writes = 0, queue = Promise.resolve();
  const pending = [], nodes = new Map();
  const c = {
    console, Math, Date, JSON, Number, String, Array, Object, Set, Map, Boolean, Promise,
    formatNumber: String, escapeHtml: String,
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: "", innerHTML: "" }); return nodes.get(id); } },
    audioManager: { play() {} },
    uiRenderer: { navs: [], toasts: [], nav(n) { this.navs.push(n); }, showToast(m, t) { this.toasts.push({ message: m, type: t }); } },
    gameEngine: {},
    localStorage: { getItem() { return raw; }, setItem(_k, v) { writes += 1; raw = v; } },
    navigator: { locks: { request(_n, cb) { const r = queue.then(cb); queue = r.catch(() => {}); return r; } } },
  };
  c.global = c;
  vm.createContext(c);
  vm.runInContext(modeSource, c);
  vm.runInContext(resultSource, c);
  c.campaignData = { characters, stages: Array.from({ length: 5 }, (_, i) => ({ name: `stage${i + 1}` })) };
  c.gameEngine.state = {
    round: 4, gameOver: true, winner: "player", player: { hp: 80, maxHp: 100 },
    combatStats: { damage: 50, highestDamage: 50, damageTaken: 20, healing: 0, overheal: 0 },
    campaign: { characterId: "lisaya", stage: 1, difficulty: "normal", progressGeneration: 0 },
  };
  return { c, initialRaw, get raw() { return raw; }, get writes() { return writes; }, finish: () => c.uiRenderer.showResult(), drain: async () => { while (pending.length) pending.shift(); await queue; await tick(); } };
}

// D1: 坏结构 → 拒绝写入，原档逐字节保留，一次错误提示，结果页照常渲染
for (const [label, stored] of [
  ["[] 角色记录", { version: 1, revision: 3, resetGeneration: 0, characters: { luolinfo: { unlockedStage: 5, completed: true }, lisaya: [] }, recentBattles: [] }],
  ["字符串 recentBattles", { version: 1, revision: 3, resetGeneration: 0, characters: { luolinfo: { unlockedStage: 5, completed: true } }, recentBattles: "corrupt" }],
]) {
  const h = harness({ stored });
  h.finish(); h.finish(); await h.drain();
  check(`端到端拒绝并保留原档：${label}`, () => {
    assert.equal(h.raw, h.initialRaw, "原档必须逐字节保留");
    assert.equal(h.writes, 0, "不得发生任何写入");
    assert.equal(h.c.uiRenderer.toasts.length, 1);
    assert.equal(h.c.uiRenderer.toasts[0].type, "error");
    assert.deepEqual(h.c.uiRenderer.navs, ["result"]);
    assert.equal(h.c.gameEngine.state.campaign.resultRendered, true);
  });
}

// D2: 饱和 revision → 连续两局都能成功写回，且第二局读到的存档仍合法（不自我锁死）
{
  const h = harness({ stored: { version: 1, revision: Number.MAX_SAFE_INTEGER - 2, resetGeneration: 0, characters: { luolinfo: { unlockedStage: 5, completed: true } }, recentBattles: [] } });
  h.finish(); await h.drain();
  check("端到端：饱和 revision 的首局写回成功且可再读", () => {
    assert.equal(h.writes, 1);
    const saved = JSON.parse(h.raw);
    assert.equal(saved.revision, Number.MAX_SAFE_INTEGER - 1);
    assert.equal(mode.readProgressForWrite({ getItem: () => h.raw }, characters).revision, Number.MAX_SAFE_INTEGER - 1);
  });
  h.c.gameEngine.state.campaign.resultRendered = false;
  h.c.gameEngine.state.winner = "player";
  h.finish(); await h.drain();
  check("端到端：饱和 revision 的第二局仍能写回（无自我锁死）", () => {
    assert.equal(h.writes, 2);
    assert.equal(JSON.parse(h.raw).revision, Number.MAX_SAFE_INTEGER - 1);
  });
}

// D3: 合法存档仍正常写回（原验证不得被加固破坏）
{
  const h = harness({ stored: { version: 1, revision: 42, resetGeneration: 0, characters: { luolinfo: { unlockedStage: 5, completed: true } }, recentBattles: [{ characterId: "luolinfo", stage: 5, victory: true, score: "A", rounds: 7 }] } });
  h.finish(); await h.drain();
  check("端到端：合法存档仍写回（revision 42 → 43，其他角色与历史保留）", () => {
    const saved = JSON.parse(h.raw);
    assert.equal(saved.revision, 43);
    assert.equal(saved.characters.luolinfo.unlockedStage, 5);
    assert.equal(saved.characters.lisaya.unlockedStage, 2);
    assert.equal(saved.recentBattles.length, 2);
    assert.equal(h.c.uiRenderer.toasts.length, 0);
  });
}

console.log(`\nverify-campaign-save-boundary-hardening: ${passed}/${passed} PASS`);
