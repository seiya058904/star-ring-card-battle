import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// R02 回归：结果页按钮区必须按"当前结算属于哪种模式"整体重建。
// 旧行为：战役结算写入"下一关/重试本关"后，沙盒结算只更新标题/正文/统计，
// 按钮区保留战役按钮及其闭包状态，点击"下一关"会直接进入旧战役进度。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

const html = await read("index.html");
const fixedRules = await read("js/fixed-game-rules.js");

const extractBraced = (source, signature) => {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `缺少 ${signature}`);
  let index = source.indexOf("{", start);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`无法提取 ${signature}`);
};

// ---- 1. 沙盒分支必须在同一个 showResult 内恢复按钮区，而不是依赖模式切换顺序 ----
const showResultSource = extractBraced(fixedRules, "uiRenderer.showResult = function()");
assert.match(showResultSource, /if \(!state\?\.campaign\) \{[\s\S]*?legacyShowResult\(\);[\s\S]*?restoreSandboxResultActions\(\);[\s\S]*?return;/, "沙盒结算分支必须重建沙盒按钮");
assert.match(fixedRules, /function restoreSandboxResultActions\(\)/, "缺少 restoreSandboxResultActions 定义");

// 恢复出的按钮必须与根页面结果页的初始按钮契约一致。
const initialRow = html.match(/<div class="button-row" style="margin-top:18px;">([\s\S]*?)<\/div>/);
assert.ok(initialRow, "未找到结果页初始按钮区");
const initialLabels = [...initialRow[1].matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1].trim());
assert.deepEqual(initialLabels, ["再来一局", "返回首页"], "结果页初始按钮契约发生变化");

// ---- 2. 真实实现串联：战役结算 → 沙盒结算，按钮区不得残留战役动作 ----
const actionAttributeOf = selector => {
  const attribute = selector.match(/data-([a-z-]+)/);
  if (!attribute) throw new Error(`不支持的选择器：${selector}`);
  const value = selector.match(/="([^"]+)"/);
  return { attribute: `data-${attribute[1]}`, value: value ? value[1] : null };
};

function createButton(attribute, value, row) {
  const button = {
    dataset: { [attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())]: value },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    addEventListener(type, handler) { if (type === "click") row.listeners[value] = handler; },
    querySelector: () => null,
    set onclick(handler) { row.listeners[value] = handler; },
    get onclick() { return row.listeners[value]; },
  };
  return button;
}

function createRowStub() {
  const row = {
    listeners: {},
    innerHTML: `<button type="button" data-open-battle-prep="true">再来一局</button><button class="secondary" data-nav="home">返回首页</button>`,
    querySelectorAll(selector) {
      const { attribute, value } = actionAttributeOf(selector);
      const values = [...this.innerHTML.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map(match => match[1]);
      return values.filter(item => value === null || item === value).map(item => createButton(attribute, item, row));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  };
  return row;
}

const row = createRowStub();
const labels = () => [...row.innerHTML.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1].trim());

const state = {
  winner: "player",
  campaign: { stage: 2, characterId: "lisaya", difficulty: "normal" },
};
const tracker = { started: [], preps: 0, navs: [] };
const elementStub = () => ({ textContent: "", innerHTML: "", addEventListener() {}, appendChild() {}, remove() {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });

const context = {
  console, Math, Date, JSON, Number, String, Array, Object, Set, Map,
  isFinite, parseInt, parseFloat, Boolean, Promise, RegExp, Error,
  formatNumber: value => String(value),
  escapeHtml: value => String(value),
  shuffle: list => list,
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  gameEngine: { state, sessionId: 1, start: () => state, log() {}, draw() {}, invalidateBattle() {} },
  battleRules: { HAND_LIMIT: 10, roundEnergy: () => 5 },
  fixedCardLibrary: {
    charactersById: {},
    characterDefinitions: [{ id: "human-lisaya", name: "丽莎娅", race: "人族", profession: "战士", level: 50, elements: ["光"], deck: [], cards: [] }],
    createRuntimeDeck: id => ({ id, characterId: id, name: "测试卡组", race: "人族", profession: "战士", level: 50, element: "光", cards: [] }),
  },
  campaignRuntime: { configurePresentation() {}, install() {} },
  audioManager: { play() {}, stop() {}, playCard() {} },
  document: {
    querySelector: selector => (selector === "#screen-result .button-row" ? row : null),
    querySelectorAll: () => [],
    getElementById: id => (id === "modalBody" ? elementStub() : elementStub()),
    createElement: () => elementStub(),
    addEventListener() {},
    body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
    hidden: false,
  },
  window: { addEventListener() {} },
};
context.globalThis = context;
context.renderBaseCardPreview = () => "";
context.renderCardPreview = () => "";
context.aiController = { chooseCard() {}, takeTurn() {} };
context.startCampaign = function startCampaignStub() { tracker.started.push(context.campaignUiSelectedStage?.()); return true; };
context.uiRenderer = {
  settings: { battleSpeed: "normal" },
  nav(name) { tracker.navs.push(name); },
  openBattlePrep() { tracker.preps += 1; },
  openModal() {},
  closeModal() {},
  showToast() {},
  render() {},
  renderBattleSurface() {},
  startBattle() {},
};
vm.createContext(context);

for (const file of ["js/campaign-data.js", "js/campaign-mode.js", "js/campaign-ui.js"]) {
  vm.runInContext(await read(file), context, { filename: file });
}
const mode = context.campaignMode;
assert.equal(typeof context.campaignResultActions, "function", "campaign-ui.js 未注册 campaignResultActions");

// 战役结算：按钮区被替换为战役动作。
context.campaignResultActions(state, context.uiRenderer);
assert.deepEqual(labels(), ["下一关", "重试本关", "返回战役路线", "返回首页"], "战役结算应写入战役按钮");
assert.equal(typeof row.listeners.next, "function", "战役按钮必须绑定处理器");

// 沙盒结算：用生产实现恢复沙盒按钮。
vm.runInContext(`${extractBraced(fixedRules, "function restoreSandboxResultActions()")}\nrestoreSandboxResultActions();`, context, { filename: "restoreSandboxResultActions.vm.js" });
assert.deepEqual(labels(), ["再来一局", "返回首页"], "沙盒结算后按钮区必须恢复为沙盒按钮");
assert.equal(row.innerHTML.includes("下一关"), false, "不得残留战役的下一关按钮");
assert.equal(row.innerHTML.includes("重试本关"), false, "不得残留战役的重试本关按钮");

// 恢复出的按钮必须重新绑定，且点击不得进入旧战役。
assert.equal(typeof row.listeners.retry, "function", "沙盒按钮必须重新绑定（不能依赖初始化时的一次性监听）");
row.listeners.retry();
assert.equal(tracker.preps, 1, "沙盒'再来一局'必须重新绑定到沙盒准备流程");
assert.deepEqual(tracker.started, [], "沙盒结果页按钮不得触发战役开局");
row.listeners.home();
assert.deepEqual(tracker.navs, ["home"], "沙盒'返回首页'必须绑定导航");

// 反复交替：两种模式的结果页按钮都必须各自正确。
for (let round = 0; round < 3; round += 1) {
  context.campaignResultActions(state, context.uiRenderer);
  assert.deepEqual(labels()[0], "下一关", `第${round + 1}轮战役结算按钮错误`);
  vm.runInContext(`${extractBraced(fixedRules, "function restoreSandboxResultActions()")}\nrestoreSandboxResultActions();`, context, { filename: "restoreSandboxResultActions.vm.js" });
  assert.deepEqual(labels(), ["再来一局", "返回首页"], `第${round + 1}轮沙盒结算按钮错误`);
}
assert.equal(mode.resultActions({ victory: true, stage: 5 })[0], "retry", "第五关通关不应出现下一关按钮");

console.log("verify-campaign-result-actions: 战役/沙盒结算交替后按钮区重建与绑定均正确。");
