import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "js", "fixed-game-rules.js"), "utf8");

// 提取最终覆写层的 uiRenderer.showResult 战役结算分支，测试对象即实际生效实现。
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
let fnSource = source.slice(start, index + 1);
// 源码内是赋值表达式（以 `;` 结尾），转成可在 vm 中求值的形式。
fnSource = `(${fnSource.replace(/^uiRenderer\.showResult = /, "").replace(/;$/, "")})`;

function makeContext(setItemImpl) {
  const elementStub = () => ({ textContent: "", innerHTML: "" });
  const context = {
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    isFinite,
    parseInt,
    parseFloat,
    Boolean,
    formatNumber: value => String(value),
    escapeHtml: value => String(value),
    localStorage: {
      getItem: () => null,
      setItem: setItemImpl,
    },
    document: { getElementById: elementStub },
    audioManager: { play: () => {} },
    gameEngine: {
      state: {
        campaign: { resultRendered: false, characterId: "lisaya", stage: 1, difficulty: "normal" },
        winner: "player",
        player: { hp: 80, maxHp: 100 },
        combatStats: { damage: 10, damageTaken: 5, healing: 0, overheal: 0, highestDamage: 10, revived: 0 },
      },
    },
    uiRenderer: {
      nav: () => {},
      toasts: [],
      showToast(message, type) { this.toasts.push({ message, type }); },
    },
    global: {},
  };
  context.globalThis = context;
  // 源码内经 global.campaignMode / global.campaignData 访问。
  context.global.campaignMode = {
    STORAGE_KEY: "star-ring-campaign-progress-v1",
    scoreBattle: () => 3,
    loadProgress: () => ({ characters: { lisaya: { unlockedStage: 1 } }, recentBattles: [] }),
    defaultProgress: () => ({ characters: {}, recentBattles: [] }),
    recordStageWin: (progress, characterId) => progress,
    recordStageLoss: progress => progress,
    recentBattles: (existing, incoming) => incoming,
    commitProgress: write => write(),
  };
  context.global.campaignData = { characters: [], stages: [{ name: "第一章" }] };
  vm.createContext(context);
  const showResult = vm.runInContext(fnSource, context, { filename: "showResult.vm.js" });
  return { context, showResult };
}

// 场景 1：storage 正常时行为完全不变，无错误提示。
{
  const { context, showResult } = makeContext(() => {});
  showResult.call(context.uiRenderer);
  assert.equal(context.uiRenderer.toasts.length, 0, "正常保存不应出现错误提示");
  assert.equal(context.gameEngine.state.campaign.resultRendered, true);
}

// 场景 2：setItem 抛异常（配额/隐私模式）时不抛出、结果页正常渲染、给出错误提示。
{
  const { context, showResult } = makeContext(() => { throw new Error("quota"); });
  assert.doesNotThrow(() => showResult.call(context.uiRenderer), "保存失败不得阻断结算页");
  assert.equal(context.gameEngine.state.campaign.resultRendered, true, "结果页仍需正常标记渲染");
  assert.equal(context.uiRenderer.toasts.length, 1, "保存失败必须给出提示");
  assert.equal(context.uiRenderer.toasts[0].type, "error");
  assert.match(context.uiRenderer.toasts[0].message, /保存失败/);
  assert.doesNotMatch(context.uiRenderer.toasts[0].message, /成功/);
}

// 场景 3：失败提示不得重复出现（resultRendered 防重入仍然生效）。
{
  const { context, showResult } = makeContext(() => { throw new Error("quota"); });
  showResult.call(context.uiRenderer);
  showResult.call(context.uiRenderer);
  assert.equal(context.uiRenderer.toasts.length, 1);
}

console.log("verify-campaign-save-failure: 3/3 PASS");
