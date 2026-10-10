import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const [rulesSource, ...moduleSources] = await Promise.all([
  read("js/fixed-game-rules.js"),
  read("js/battle-rules.js"),
  read("js/campaign-data.js"),
  read("js/campaign-mode.js"),
]);

// Exercise the final production result writer together with the real storage
// module; substitute only browser surfaces and controllable I/O/lock failures.
const start = rulesSource.indexOf("uiRenderer.showResult = function()");
assert.ok(start >= 0, "Missing final showResult override");
let end = rulesSource.indexOf("{", start), depth = 0;
for (; end < rulesSource.length; end += 1) {
  if (rulesSource[end] === "{") depth += 1;
  else if (rulesSource[end] === "}" && --depth === 0) { end += 1; break; }
}
const resultSource = rulesSource.slice(start, end + 1);
const tick = () => new Promise(resolve => setImmediate(resolve));
const unhandled = [];
const onUnhandled = error => unhandled.push(error);
process.on("unhandledRejection", onUnhandled);
let passed = 0;

function harness({ stored, failure, locks = "none", generation = 0 } = {}) {
  let raw, writes = 0, writeAttempts = 0, reads = 0, lockRequests = 0;
  let queue = Promise.resolve();
  const pending = [], nodes = new Map();
  const c = {
    console, Math, Date, JSON, Number, String, Array, Object, Set, Map, Boolean, Promise,
    formatNumber: String,
    escapeHtml: String,
    document: { getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: "", innerHTML: "" });
      return nodes.get(id);
    } },
    audioManager: { play() {} },
    uiRenderer: {
      navs: [], toasts: [],
      nav(name) { this.navs.push(name); },
      showToast(message, type) { this.toasts.push({ message, type }); },
    },
    gameEngine: {},
    localStorage: {
      getItem() { reads += 1; if (failure === "read") throw Error("read failed"); return raw; },
      setItem(key, value) { writeAttempts += 1; if (failure === "write") throw Error("write failed"); writes += 1; raw = value; },
    },
  };
  if (locks !== "none") c.navigator = { locks: { request(name, callback) {
    lockRequests += 1;
    assert.equal(name, `${c.campaignMode.STORAGE_KEY}-commit`);
    if (locks === "throw") throw Error("lock unavailable");
    if (locks === "reject") return Promise.reject(Error("lock denied"));
    if (locks === "queued") return new Promise((resolve, reject) => pending.push({ callback, resolve, reject }));
    const result = queue.then(callback);
    queue = result.catch(() => {});
    return result;
  } } };
  c.global = c;
  vm.createContext(c);
  moduleSources.forEach(source => vm.runInContext(source, c));
  vm.runInContext(resultSource, c);
  const initial = c.campaignMode.defaultProgress(c.campaignData.characters);
  initial.characters.luolinfo = { unlockedStage: 5, completed: true };
  initial.revision = 42;
  initial.resetGeneration = generation;
  initial.recentBattles = [{ characterId: "luolinfo", stage: 5, victory: true, score: "A", rounds: 7 }];
  raw = stored === undefined ? JSON.stringify(initial) : stored;
  const initialRaw = raw;
  c.gameEngine.state = {
    round: 4, gameOver: true, winner: "player", player: { hp: 80, maxHp: 100 },
    combatStats: { damage: 50, highestDamage: 50, damageTaken: 20, healing: 0, overheal: 0 },
    campaign: { characterId: "lisaya", stage: 1, difficulty: "normal", progressGeneration: generation },
  };
  return {
    c, initialRaw, nodes,
    get raw() { return raw; },
    get reads() { return reads; },
    get writes() { return writes; },
    get writeAttempts() { return writeAttempts; },
    get lockRequests() { return lockRequests; },
    finish() { c.uiRenderer.showResult(); },
    async drain() {
      while (pending.length) {
        const task = pending.shift();
        try { task.resolve(task.callback()); } catch (error) { task.reject(error); }
      }
      await queue;
      await tick();
    },
  };
}

function rendered(h) {
  assert.deepEqual(h.c.uiRenderer.navs, ["result"], "Result rendering must stay idempotent");
  assert.match(h.nodes.get("resultTitle").textContent, /战役胜利/);
  assert.equal(h.c.gameEngine.state.campaign.resultRendered, true);
}
function unsaved(h) {
  assert.equal(h.raw, h.initialRaw, "Failed result commit must preserve the original bytes");
  assert.equal(h.writes, 0);
  assert.equal(h.c.uiRenderer.toasts.length, 1, "Report an unsaved result exactly once");
  assert.equal(h.c.uiRenderer.toasts[0].type, "error");
  assert.match(h.c.uiRenderer.toasts[0].message, /保存失败.*未写入/);
  rendered(h);
}

try {
  // Valid reads preserve unrelated character progress/history with or without
  // Web Locks. Rendering twice must never enqueue or write a second result.
  for (const locks of ["none", "serial"]) {
    const h = harness({ locks });
    h.finish(); h.finish(); await h.drain();
    const saved = JSON.parse(h.raw);
    assert.equal(saved.characters.luolinfo.unlockedStage, 5);
    assert.equal(saved.characters.luolinfo.completed, true);
    assert.equal(saved.characters.lisaya.unlockedStage, 2);
    assert.equal(saved.recentBattles.length, 2);
    assert.equal(saved.revision, 43);
    assert.equal(h.writes, 1);
    assert.equal(h.c.uiRenderer.toasts.length, 0);
    rendered(h); passed += 1;
  }

  // A genuinely absent save and legacy v1 saves without concurrency counters
  // remain writable. Display loading continues to tolerate unreadable content.
  for (const stored of [null, JSON.stringify({ version: 1, characters: { luolinfo: { unlockedStage: 5, completed: true } }, recentBattles: [] })]) {
    const h = harness({ stored });
    h.finish(); await h.drain();
    const saved = JSON.parse(h.raw);
    assert.equal(saved.version, 1);
    assert.equal(saved.revision, 1);
    assert.equal(saved.resetGeneration, 0);
    assert.equal(saved.characters.lisaya.unlockedStage, 2);
    if (stored !== null) assert.equal(saved.characters.luolinfo.completed, true);
    assert.equal(h.c.uiRenderer.toasts.length, 0);
    passed += 1;
  }

  for (const locks of ["none", "serial"]) for (const failure of ["read", "write"]) {
    const h = harness({ locks, failure });
    h.finish(); h.finish(); await h.drain();
    unsaved(h);
    assert.equal(h.writeAttempts, failure === "read" ? 0 : 1);
    passed += 1;
  }

  const invalidSaves = ["", "{", "null", "[]", "false", "{}",
    JSON.stringify({ version: 2, characters: {} }),
    JSON.stringify({ version: 1, characters: [] }),
    JSON.stringify({ version: 1, characters: null }),
  ];
  for (const key of ["revision", "resetGeneration"]) {
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, "bad", null, false, [], {}, ""]) {
      invalidSaves.push(JSON.stringify({ version: 1, characters: {}, [key]: value }));
    }
  }
  for (const stored of invalidSaves) {
    const h = harness({ stored });
    const mode = h.c.campaignMode, characters = h.c.campaignData.characters;
    assert.doesNotThrow(() => mode.loadProgress(stored, characters), "Display loading remains tolerant");
    assert.throws(() => mode.readProgressForWrite(h.c.localStorage, characters));
    assert.throws(() => mode.resetProgress(h.c.localStorage, characters), "Reset shares the strict write reader");
    h.finish(); await h.drain();
    unsaved(h);
    assert.equal(h.writeAttempts, 0);
    passed += 1;
  }

  for (const locks of ["reject", "throw"]) {
    const h = harness({ locks });
    assert.doesNotThrow(() => h.finish());
    h.finish(); await h.drain();
    unsaved(h);
    assert.equal(h.reads, 0);
    assert.equal(h.writeAttempts, 0);
    assert.equal(h.lockRequests, 1);
    passed += 1;
  }

  // Delayed lock acquisition must still commit once and read inside the lock.
  {
    const h = harness({ locks: "queued" });
    h.finish(); h.finish();
    assert.equal(h.writes, 0);
    assert.equal(h.reads, 0);
    assert.equal(h.lockRequests, 1);
    await h.drain();
    assert.equal(h.writes, 1);
    assert.equal(JSON.parse(h.raw).revision, 43);
    rendered(h); passed += 1;
  }

  // The real reset transaction wins when queued first. A result captured in
  // the older generation may render, but cannot resurrect cleared progress.
  {
    const h = harness({ locks: "queued" });
    const resetting = h.c.campaignMode.resetProgress(h.c.localStorage, h.c.campaignData.characters);
    h.finish(); await h.drain(); await resetting;
    const saved = JSON.parse(h.raw);
    assert.equal(saved.resetGeneration, 1);
    assert.equal(saved.revision, 43);
    assert.equal(saved.characters.lisaya.unlockedStage, 1);
    assert.equal(saved.characters.luolinfo.unlockedStage, 1);
    assert.equal(saved.recentBattles.length, 0);
    assert.equal(h.writes, 1, "Only reset may write");
    assert.equal(h.c.uiRenderer.toasts.length, 1);
    assert.match(h.c.uiRenderer.toasts[0].message, /其他标签页/);
    rendered(h); passed += 1;
  }

  await tick();
  assert.deepEqual(unhandled, [], "Result storage/lock failures must never escape as unhandled rejections");
  console.log(`verify-campaign-result-storage-errors: ${passed}/${passed} PASS`);
} finally {
  process.removeListener("unhandledRejection", onUnhandled);
}
