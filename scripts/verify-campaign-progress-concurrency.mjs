import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

// 载入真实 campaign-mode 与 campaign-data，用真实模块验证新字段与并发语义。
const modeContext = { console };
vm.createContext(modeContext);
for (const file of ["js/battle-rules.js", "js/campaign-data.js", "js/campaign-mode.js"]) {
  vm.runInContext(await read(file), modeContext, { filename: file });
}
const { campaignData, campaignMode } = modeContext;
const firstId = campaignData.characters[0].id;
const secondId = campaignData.characters[1].id;

// 1. 旧 version=1 存档（无新增字段）仍可加载，revision/resetGeneration 归零。
{
  const legacy = JSON.stringify({ version: 1, characters: { [firstId]: { unlockedStage: 3, completed: false } }, recentBattles: [] });
  const loaded = campaignMode.loadProgress(legacy, campaignData.characters);
  assert.equal(loaded.revision, 0);
  assert.equal(loaded.resetGeneration, 0);
  assert.equal(loaded.characters[firstId].unlockedStage, 3);
}

// 2. 新字段被保留且非法值归零。
{
  const saved = campaignMode.defaultProgress(campaignData.characters);
  saved.revision = 7;
  saved.resetGeneration = 2;
  const loaded = campaignMode.loadProgress(JSON.stringify(saved), campaignData.characters);
  assert.equal(loaded.revision, 7);
  assert.equal(loaded.resetGeneration, 2);
  saved.revision = -3;
  saved.resetGeneration = "bogus";
  const bad = campaignMode.loadProgress(JSON.stringify(saved), campaignData.characters);
  assert.equal(bad.revision, 0);
  assert.equal(bad.resetGeneration, 0);
}

// 提取 fixed-game-rules.js 的 showResult，在受控 localStorage 上模拟双标签页时序。
// 注意：vm 环境没有 navigator.locks，这里覆盖的是 best-effort fallback 路径
// （保存前重读 latest + resetGeneration 校验），不模拟 Web Locks 的严格序列化保证。
const source = await read("js/fixed-game-rules.js");
const signature = "uiRenderer.showResult = function()";
const start = source.indexOf(signature);
assert.ok(start >= 0, "fixed-game-rules.js 缺少 showResult 覆写");
let index = source.indexOf("{", start);
let depth = 0;
for (; index < source.length; index += 1) {
  const ch = source[index];
  if (ch === "{") depth += 1;
  else if (ch === "}") {
    depth -= 1;
    if (depth === 0) {
      index += 1;
      break;
    }
  }
}
const fnSource = `(${source.slice(start, index + 1).replace(/^uiRenderer\.showResult = /, "").replace(/;$/, "")})`;

function makeHarness({ store = {}, breakSetItem = false } = {}) {
  const context = {
    console, Math, Date, JSON, Number, String, Array, Object, Set, Map, isFinite, parseInt, parseFloat, Boolean,
    formatNumber: value => String(value),
    escapeHtml: value => String(value),
    localStorage: {
      getItem: key => (key in store ? store[key] : null),
      setItem: (key, value) => { if (breakSetItem) throw new Error("quota"); store[key] = String(value); },
    },
    document: { getElementById: () => ({ textContent: "", innerHTML: "" }) },
    audioManager: { play: () => {} },
    gameEngine: { state: null },
    uiRenderer: {
      nav: () => {},
      toasts: [],
      showToast(message, type) { this.toasts.push({ message, type }); },
    },
    global: {},
  };
  context.globalThis = context;
  context.global.campaignMode = campaignMode;
  context.global.campaignData = campaignData;
  vm.createContext(context);
  const showResult = vm.runInContext(fnSource, context, { filename: "showResult.vm.js" });
  const makeState = (characterId, stage, progressGeneration) => ({
    campaign: { resultRendered: false, characterId, stage, difficulty: "normal", progressGeneration },
    winner: "player",
    round: 8,
    player: { hp: 80, maxHp: 100 },
    combatStats: { damage: 10, damageTaken: 5, healing: 0, overheal: 0, highestDamage: 10, revived: 0 },
  });
  return {
    store,
    raw: () => campaignMode.loadProgress(store[campaignMode.STORAGE_KEY] ?? null, campaignData.characters),
    run: (characterId, stage, progressGeneration) => {
      context.gameEngine.state = makeState(characterId, stage, progressGeneration);
      showResult.call(context.uiRenderer);
      return context.uiRenderer.toasts;
    },
  };
}

const KEY = campaignMode.STORAGE_KEY;

// 3. Tab A 胜利、Tab B 随后胜利（不同角色）：两份进度都保留。
{
  const h = makeHarness();
  h.run(firstId, 1, 0);
  h.run(secondId, 1, 0);
  const final = h.raw();
  assert.equal(final.characters[firstId].unlockedStage, 2, "Tab A 的解锁必须保留");
  assert.equal(final.characters[secondId].unlockedStage, 2, "Tab B 的解锁必须保留");
  assert.equal(final.recentBattles.length, 2, "recentBattles 必须基于 latest 追加");
}

// 4. Tab A 战斗中 Tab B 执行重置：A 结算不得复活旧状态。
{
  const h = makeHarness();
  h.run(firstId, 1, 0); // 先产生历史进度
  // Tab A 开始新战斗（记录 progressGeneration=0）
  // Tab B 重置：清空进度并递增 resetGeneration
  const fresh = campaignMode.defaultProgress(campaignData.characters);
  fresh.revision = 1;
  fresh.resetGeneration = 1;
  h.store[KEY] = JSON.stringify(fresh);
  const toasts = h.run(secondId, 2, 0); // Tab A 用旧代际结算
  const final = h.raw();
  assert.equal(final.characters[secondId].unlockedStage, 1, "旧代际结果不得写回");
  assert.equal(final.resetGeneration, 1, "重置代际不得被回退");
  assert.equal(final.recentBattles.length, 0, "不得复活旧战斗记录");
  assert.ok(toasts.some(toast => /其他标签页/.test(toast.message)), "必须提示玩家结果未写入");
}

// 5. reset 之后的新战斗仍可正常保存。
{
  const h = makeHarness();
  const fresh = campaignMode.defaultProgress(campaignData.characters);
  fresh.resetGeneration = 1;
  h.store[KEY] = JSON.stringify(fresh);
  h.run(firstId, 1, 1);
  const final = h.raw();
  assert.equal(final.characters[firstId].unlockedStage, 2, "新代际战斗结果必须正常写入");
  assert.equal(final.revision, 1, "写回必须递增 revision");
}

// 6. storage 不可用时仍走保存失败提示（Batch B 合同不回归）。
{
  const h = makeHarness({ breakSetItem: true });
  const toasts = h.run(firstId, 1, 0);
  assert.ok(toasts.some(toast => toast.type === "error" && /保存失败/.test(toast.message)));
}

console.log("verify-campaign-progress-concurrency: 6/6 PASS");
