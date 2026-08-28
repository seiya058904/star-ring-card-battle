import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const html = await read("index.html");

function extractFinalPlay() {
  const marker = "effectsRenderer.play = function(card, result) {";
  const start = html.lastIndexOf(marker);
  if (start < 0) throw new Error("找不到 effectsRenderer.play 最终赋值");
  const open = html.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return html.slice(html.indexOf("function(card, result) {", start), end);
}

const source = extractFinalPlay();
let originalCalls = 0;
const timers = [];
let combatInputLocked = null;
let renderCalls = 0;
let battleActive = true;
const context = {
  console,
  Math,
  Date,
  JSON,
  document: {
    getElementById() { return null; },
    body: { classList: { add() {}, remove() {}, toggle() {} } },
  },
  setTimeout: fn => timers.push(fn),
  clearTimeout: () => {},
  getBattleSpeedFactor: () => 1,
  setCombatInputLocked: value => { combatInputLocked = value; },
  battlePerfMonitor: { markFirstCard() {} },
  preloadCardVisualAssets: () => {},
  preloadCardVisualAssetsReady: () => ({ then() {} }),
  dramaTimingForCard: () => ({ totalMin: 100 }),
  uiRenderer: { render() { renderCalls += 1; } },
  gameEngine: {
    isActiveBattle() { return battleActive; },
    state: { gameOver: false },
    sessionId: 1,
  },
  playStandardBattleEffect(card, result) {
    originalCalls += 1;
  },
};
vm.createContext(context);
const play = vm.runInContext(`(${source})`, context);
const renderer = { _playLock: 0 };
const card = { name: "测试", skillTier: "normal", cost: 2, element: "火", effectType: "damage", instanceId: "c1" };
const result = { amount: 10, targetId: "enemy", intent: "hostile-damage", visualTargets: { number: "enemy", impact: "enemy", shake: true } };

// 1) 首次播放：获得锁并执行一次原始特效。
timers.length = 0;
originalCalls = 0;
renderCalls = 0;
play.call(renderer, card, result);
assert.equal(originalCalls, 1, "首次播放应调用一次基础特效");
assert.ok(renderer._playLock > 0, "首次播放应设置 _playLock");
assert.equal(combatInputLocked, true, "首次播放应锁定战斗输入");

// 2) 锁内重复请求：应被忽略，不再次调用基础特效。
play.call(renderer, card, result);
assert.equal(originalCalls, 1, "锁内重复请求不应再次调用基础特效");

// 3) 解锁 timer：清除锁并恢复输入。
const unlockTimer = timers[timers.length - 1];
battleActive = true;
renderCalls = 0;
unlockTimer();
assert.equal(renderer._playLock, 0, "解锁 timer 应清除 _playLock");
assert.equal(combatInputLocked, false, "解锁 timer 应恢复战斗输入");
assert.ok(renderCalls >= 1, "解锁 timer 应触发 uiRenderer.render");

// 4) 陈旧 timer：战斗失效时不得渲染或恢复输入。
renderer._playLock = 123;
combatInputLocked = true;
renderCalls = 0;
timers.length = 0;
play.call(renderer, card, result);
const staleTimer = timers[timers.length - 1];
battleActive = false;
staleTimer();
assert.equal(renderCalls, 0, "陈旧 timer 不应触发渲染");
assert.ok(renderer._playLock > 0, "陈旧 timer 当前语义下不清除 _playLock（保留现状）");
assert.equal(combatInputLocked, true, "陈旧 timer 当前语义下不恢复输入（保留现状）");

// 5) 跨战斗：Battle A 效果未结束时启动 Battle B，生产环境 start() 会重置 _playLock。
timers.length = 0;
originalCalls = 0;
renderer._playLock = 0;
battleActive = true;
play.call(renderer, card, result);
const battleALock = renderer._playLock;
const battleATimer = timers[timers.length - 1];
assert.ok(battleALock > 0, "Battle A 应持有 visual lock");

// 模拟 Battle B start：新战斗重置 renderer visual lock。
renderer._playLock = 0;
battleActive = true;
originalCalls = 0;
play.call(renderer, card, result);
assert.equal(originalCalls, 1, "Battle B 第一次特效不应被 Battle A 的锁抑制");
const battleBLock = renderer._playLock;
assert.ok(battleBLock > 0, "Battle B 应持有自己的 visual lock");

// Battle A 旧 timer 在 Battle B 存在时触发；旧 battle 已失效，因此不得清除 Battle B 的锁。
battleActive = false;
battleATimer();
assert.equal(renderer._playLock, battleBLock, "Battle A 旧 timer 不得清除 Battle B 的 visual lock");

console.log("effectsRenderer.play lock 特征测试通过：首次锁、重复忽略、解锁 timer、陈旧 timer 与跨战斗锁生命周期均符合当前实现。");
