import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// R08 回归：战斗速度"极快/快速"必须同时缩短完整动作时间轴——
// 特效锁、命中揭示、输入恢复使用同一套缩放后的时间。
// 旧行为：_playLock 按速度缩放，但 playCard 的 actionLocked 仍用未缩放的 totalMin，
// 于是"极快"档位下主要出牌等待几乎没有变快。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const html = await read("index.html");
const fixedRules = await read("js/fixed-game-rules.js");

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `缺少 ${signature}`);
  let index = source.indexOf("{", start);
  let depth = 0;
  for (; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`无法提取 ${signature}`);
}

// ---- 1. 时间换算入口：唯一且按档位线性缩放 ----
const speedContext = {
  console, Math, Number,
  uiRenderer: { settings: { battleSpeed: "normal" } },
  storageManager: { getSettings: () => ({ battleSpeed: "normal" }) },
};
vm.createContext(speedContext);
vm.runInContext([
  extractFunction(html, "function getBattleSpeedFactor()"),
  "globalThis.battleSpeedDelay = ms => Math.round((Number(ms) || 0) * getBattleSpeedFactor());",
  extractFunction(html, "function scaledDramaMs(ms)"),
].join("\n\n"), speedContext, { filename: "speed-helpers-from-index.js" });

const expectFactor = { normal: 1, fast: 0.55, ultra: 0.3 };
for (const [speed, factor] of Object.entries(expectFactor)) {
  speedContext.uiRenderer.settings.battleSpeed = speed;
  speedContext.storageManager.getSettings = () => ({ battleSpeed: speed });
  assert.equal(speedContext.getBattleSpeedFactor(), factor, `${speed} 档位因子应为 ${factor}`);
  assert.equal(speedContext.scaledDramaMs(1000), Math.round(1000 * factor), `${speed} 档位应缩放完整动作时间`);
}

// ---- 2. 特效锁解锁时间必须使用缩放后的时间轴，且只缩放一次 ----
const playSource = (() => {
  const marker = "effectsRenderer.play = function(card, result) {";
  const start = html.lastIndexOf(marker);
  assert.ok(start >= 0, "找不到 effectsRenderer.play 最终赋值");
  let index = html.indexOf("{", start);
  let depth = 0;
  for (; index < html.length; index += 1) {
    if (html[index] === "{") depth += 1;
    else if (html[index] === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(html.indexOf("function(card, result) {", start), index + 1);
    }
  }
  throw new Error("无法提取 effectsRenderer.play");
})();
assert.match(playSource, /scaledDramaMs\(timing\.totalMin \+ 200\)/, "特效锁解锁必须走 scaledDramaMs");
assert.doesNotMatch(playSource, /timing\.totalMin \+ 200\) \* factor/, "不得在 scaledDramaMs 之外再乘一次速度因子（重复缩放）");

const delays = [];
const ultraContext = {
  console, Math, Date, JSON, Number, String, Array, Object,
  document: { getElementById: () => null, body: { classList: { add() {}, remove() {}, toggle() {} } } },
  setTimeout: (fn, delay) => { delays.push(delay); return delays.length; },
  clearTimeout: () => {},
  scaledDramaMs: ms => Math.round(Number(ms) * 0.3),
  getBattleSpeedFactor: () => 0.3,
  setCombatInputLocked: () => {},
  battlePerfMonitor: { markFirstCard() {} },
  preloadCardVisualAssets: () => {},
  preloadCardVisualAssetsReady: () => ({ then() {} }),
  dramaTimingForCard: () => ({ totalMin: 4600 }),
  uiRenderer: { render() {} },
  gameEngine: { isActiveBattle: () => true, state: { gameOver: false }, sessionId: 1 },
  playStandardBattleEffect() {},
};
vm.createContext(ultraContext);
const play = vm.runInContext(`(${playSource})`, ultraContext);
play.call({ _playLock: 0 }, { name: "星界放逐Ⅲ", skillTier: "special", cost: 10, element: "暗", effectType: "attack" }, { amount: 1, targetId: "enemy", visualTargets: { number: "enemy", impact: "enemy" } });
assert.equal(delays.length, 1, "play 只应调度一个解锁定时器");
assert.equal(delays[0], Math.round(4800 * 0.3), `极快档位特效锁应在缩放后的时间释放（实得 ${delays[0]}）`);

// ---- 3. 出牌输入恢复（actionLocked）必须与特效锁使用同一缩放后的时间轴 ----
const playCardSource = extractFunction(fixedRules, "gameEngine.playCard = function(side, instanceId)");
assert.match(playCardSource, /scaledDramaMs\(/, "actionLocked 解锁必须走 scaledDramaMs");
assert.doesNotMatch(playCardSource, /dramaTimingForCard\(card\)\.totalMin\s*\*\s*/, "不得绕过 scaledDramaMs 自己乘因子");

// 用真实的 playCard 实现观察解锁定时器：把 scaledDramaMs 固定为 0.3 倍，验证解锁延迟同步缩短。
const unlockDelays = [];
const chainContext = {
  console, Math, Date, JSON, Number, String, Array, Object, Set, Promise, RegExp, Error,
  isFinite, parseInt, parseFloat, Boolean,
  formatNumber: value => String(value),
  shuffle: list => list,
  effectiveCardCost: (state, side, card) => Math.max(0, Number(card?.cost || 0)),
  preloadCardVisualAssets: () => {},
  audioManager: { play() {}, playCard() {} },
  effectsRenderer: undefined,
  uiRenderer: { render() {} },
  scaledDramaMs: ms => Math.round(Number(ms) * 0.3),
  dramaTimingForCard: () => ({ totalMin: 4600 }),
  setTimeout: (fn, delay) => { unlockDelays.push(delay); return unlockDelays.length; },
};
chainContext.globalThis = chainContext;
chainContext.gameEngine = { state: null, sessionId: 3 };
vm.createContext(chainContext);
vm.runInContext(playCardSource, chainContext, { filename: "playCard-from-fixed-game-rules.js" });

const actor = { id: "player", name: "玩家", energy: 10, hand: [], discardPile: [], exhaustPile: [], skipAction: false, maxEnergy: 10 };
const target = { id: "enemy", name: "敌人", hp: 1000, maxHp: 1000, shield: 0, statuses: [] };
const card = { name: "星界放逐Ⅲ", instanceId: "c1", cost: 10, element: "暗", effectType: "attack", afterPlay: "discard", effects: [], mechanics: [] };
actor.hand = [card];
const state = { turn: "player", gameOver: false, actionLocked: false, player: actor, enemy: target, round: 1, combatStats: null };
chainContext.gameEngine.state = state;
chainContext.gameEngine.sessionId = 3;
chainContext.gameEngine.applyCard = () => ({ text: "", amount: 0, visualAmounts: [], popups: [] });
chainContext.gameEngine.checkGameOver = () => {};
chainContext.gameEngine.log = () => {};
chainContext.gameEngine.isActiveBattle = (candidate, sessionId) => candidate === state && sessionId === 3;

const played = chainContext.gameEngine.playCard("player", "c1");
assert.equal(played, true, "出牌应成功");
assert.equal(unlockDelays.length, 1, "出牌只应调度一个输入解锁定时器");
assert.equal(unlockDelays[0], Math.round(4600 * 0.3), `极快档位下出牌输入恢复必须同步缩短（实得 ${unlockDelays[0]}）`);

// 对照：标准档位（因子 1）时两处延迟都应回到原始时间，行为不变。
const normalDelays = [];
const chainTimers = [];
chainContext.scaledDramaMs = ms => Math.round(Number(ms));
chainContext.setTimeout = (fn, delay) => { chainTimers.push(delay); if (delay >= 4000) normalDelays.push(delay); return chainTimers.length; };
actor.hand = [{ ...card, instanceId: "c2" }];
actor.energy = 10;
state.actionLocked = false;
chainContext.gameEngine.playCard("player", "c2");
assert.equal(normalDelays[0], 4600, "标准档位下出牌等待应保持原始时长");

console.log("verify-battle-speed-timeline: 特效锁、命中揭示与出牌输入恢复共用同一套缩放时间轴。");
