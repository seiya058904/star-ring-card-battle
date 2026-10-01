// Balance Simulation Harness —— 无头平衡模拟器的共享引导层。
//
// 设计约束（不可违反）：
//   1. 不复制第二套战斗数学。本文件只做“加载 + 桩接 + 驱动”：
//      - helpers / gameEngine / 固定卡库 / 战役规则全部从 index.html 与 js/*.js 原样抽取执行；
//      - 唯一的替换项是纯表现层适配（DOM、Canvas、音频、动画时长），它们不参与任何数值结算。
//   2. 确定性。每次 runBattle 前用 seed 重置 index.html 的 rng()，因此
//      同一 (character, enemy, stage, difficulty, seed, policy) 必然产生同一结果。
//   3. 加载顺序与 index.html 末尾的 <script src> 完全一致。
//
// 表现层适配清单（全部不改变战斗状态）：
//   - dramaTimingForCard / scaledDramaMs → 0（出牌输入锁立即释放，与“等动画”无关）
//   - battleSpeedDelay → 标准档位（factor 1）
//   - effectsRenderer → no-op（同时让 _playLock 恒为 0）
//   - audioManager / uiRenderer / document / localStorage → 内存桩
//   - setTimeout → 虚拟时钟队列，由驱动层按序排空（真实代码里的“延迟结算”时序被保留）

import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPT_ORDER = [
  "js/battle-rules.js",
  "js/fixed-card-library.js",
  "js/campaign-data.js",
  "js/campaign-mode.js",
  "js/campaign-rules.js",
  "js/audio-manager.js",
  "js/fixed-game-rules.js",
  "js/campaign-runtime.js",
  "js/campaign-ui.js",
];

// ---- index.html 源码抽取（按名字，不按行号） ----

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`无法从 index.html 定位函数：${name}`);
  let index = src.indexOf("{", start);
  let depth = 0;
  for (; index < src.length; index += 1) {
    const ch = src[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        index += 1;
        break;
      }
    }
  }
  return src.slice(start, index);
}

function extractConst(src, name) {
  const start = src.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`无法从 index.html 定位常量：${name}`);
  const openIndex = src.indexOf("=", start) + 1;
  const openers = { "{": "}", "[": "]", "(": ")" };
  let index = openIndex;
  while (index < src.length && !Object.prototype.hasOwnProperty.call(openers, src[index]?.trim() || "")) index += 1;
  const open = src[index];
  const close = openers[open];
  let depth = 0;
  for (; index < src.length; index += 1) {
    const ch = src[index];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        index += 1;
        break;
      }
    }
  }
  while (src[index] === ";" || src[index] === "\n" || src[index] === "\r" || src[index] === " ") index += 1;
  return src.slice(start, index);
}

function extractAssignedFunction(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`无法从 index.html 定位赋值函数：${signature}`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < src.length; index += 1) {
    const ch = src[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        index += 1;
        return src.slice(start, index) + ";";
      }
    }
  }
  throw new Error(`无法提取赋值函数：${signature}`);
}

const HELPER_FUNCTIONS = [
  "deterministicId",
  "pick",
  "clamp",
  "safeNumber",
  "shuffle",
  "levelHp",
  "formatNumber",
  "resolveEffectAmount",
  "resolveCardEffectAmount",
  "getCardPrimaryPower",
  "combinedProfile",
  "getCardActionIntent",
  "getVisualTargets",
  "createSummonEntity",
  "upsertSummonEntity",
  "removeDefeatedSummons",
  "shareOwnerDamageWithSummon",
  "primaryElement",
  "isDirectDamageCard",
  "cardRequiresElement",
  "primaryTargetElement",
  "cardAdvantageTarget",
  "cardHasAdvantageAgainst",
  "_overrideKey",
  "setHpDisplayOverride",
  "clearHpDisplayOverrides",
  "hasPendingOverrides",
  "canAcceptPlayerCardInput",
  "setCombatInputLocked",
  "normalizeRace",
  "normalizeProfession",
  "normalizeStatusType",
  "createStatusFromMechanic",
  "elementMultiplier",
  "stripCardTaxonomyPrefix",
  "mechanicsForCard",
  "ensureEnemyOpeningPlayableCard",
];

const HELPER_CONSTS = [
  "DEFAULT_CHARACTER_TEMPLATES",
  "DEFAULT_SKILL_NAMES",
  "RACE_PROFILES",
  "RACE_TALENTS",
  "ELEMENT_COUNTER",
  "DIRECT_DAMAGE_EFFECT_TYPES",
  "ELEMENT_REQUIRED_EFFECT_TYPES",
  "STATUS_TYPE_MAP",
  "VICTORY_TIMING",
  "hpDisplayOverrides",
  // storageManager / deckBuilder 是 index.html 顶部声明的单例；fixed-game-rules.js 会覆写它们的关键入口
  // （pickEnemyFor / createDeck / getCustomCards）。这里抽取原对象以保留其真实默认行为与键名。
  "storageManager",
  "deckBuilder",
];

// ---- DOM / 平台桩 ----

function createElementStub(id = "") {
  const element = {
    id,
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    hidden: false,
    dataset: {},
    style: { setProperty() {}, removeProperty() {}, backgroundImage: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
    closest() { return null; },
    insertBefore() {},
    animate() { return { finished: Promise.resolve(), cancel() {} }; },
  };
  return element;
}

function createDocumentStub() {
  const listeners = new Map();
  const registry = new Map();
  const body = createElementStub("body");
  body.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  return {
    hidden: false,
    body,
    documentElement: createElementStub("html"),
    getElementById(id) {
      if (!registry.has(id)) registry.set(id, createElementStub(id));
      return registry.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return createElementStub(); },
    createDocumentFragment() { return createElementStub(); },
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
    removeEventListener() {},
    listeners,
    readyState: "complete",
  };
}

export function createSimRuntime() {
  return (async () => {
    const read = file => readFile(path.join(HARNESS_ROOT, file), "utf8");
    const indexSource = await read("index.html");

    const timers = [];
    let timerSeq = 0;
    let virtualNow = 0;
    const hostSetImmediate = setImmediate;
    const FROZEN_EPOCH = Date.parse("2026-01-01T00:00:00.000Z");
    class VirtualDate extends Date {
      constructor(...args) { super(...(args.length ? args : [FROZEN_EPOCH])); }
      static now() { return FROZEN_EPOCH; }
    }

    const documentStub = createDocumentStub();
    const storage = new Map();
    let localStorageWrites = 0;
    const localStorageStub = {
      getItem: key => (storage.has(String(key)) ? storage.get(String(key)) : null),
      setItem: (key, value) => { storage.set(String(key), String(value)); localStorageWrites += 1; },
      removeItem: key => { storage.delete(String(key)); },
      clear: () => storage.clear(),
      key: index => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size; },
    };

    const silentConsole = {
      log() {}, warn() {}, error() {}, debug() {}, info() {}, trace() {}, table() {}, group() {}, groupEnd() {},
    };

    const context = {
      console: silentConsole,
      Math, Date: VirtualDate, JSON, Number, String, Array, Object, Set, Map, WeakMap, WeakSet, Symbol,
      isFinite, isNaN, parseInt, parseFloat, Boolean, Error, TypeError, RangeError, Promise, Proxy, Reflect,
      RegExp, Function, encodeURIComponent, decodeURIComponent,
      queueMicrotask,
      document: documentStub,
      localStorage: localStorageStub,
      navigator: { userAgent: "balance-harness", locks: undefined },
      performance: { now: () => virtualNow },
      window: (() => {
        const w = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), innerWidth: 390, innerHeight: 844 };
        return w;
      })(),
      setTimeout: (handler, delay = 0) => {
        timerSeq += 1;
        timers.push({ id: timerSeq, time: virtualNow + Math.max(0, Number(delay) || 0), seq: timerSeq, handler });
        return timerSeq;
      },
      clearTimeout: id => {
        const index = timers.findIndex(timer => timer.id === id);
        if (index >= 0) timers.splice(index, 1);
      },
      setInterval: () => 0,
      clearInterval: () => {},
      requestAnimationFrame: handler => {
        timerSeq += 1;
        timers.push({ id: timerSeq, time: virtualNow, seq: timerSeq, handler: () => handler(virtualNow) });
        return timerSeq;
      },
      cancelAnimationFrame: () => {},
    };
    vm.createContext(context);

    // 确定性 RNG：index.html 的 rng() 依赖闭包内的 seed，这里在其同作用域内注入 setter。
    const helperSource = [
      "let seed = 1;",
      "function rng() { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }",
      "function __setHarnessSeed(value) { const v = Number(value); seed = (Math.abs(Math.floor(v)) % 2147483646) + 1; }",
      ...HELPER_FUNCTIONS.map(name => extractFunction(indexSource, name)),
      ...HELPER_CONSTS.map(name => extractConst(indexSource, name)),
      // index.html 在自身作用域末尾显式把这些常量挂到 globalThis（见 index.html 的
      // `globalThis.DEFAULT_CHARACTER_TEMPLATES = ...`）；fixed-card-library.js 只从 globalThis 读，
      // 所以抽取后必须复现同一挂载动作，否则 30 名角色会变成 0。
      "globalThis.DEFAULT_CHARACTER_TEMPLATES = DEFAULT_CHARACTER_TEMPLATES;",
      "globalThis.DEFAULT_SKILL_NAMES = DEFAULT_SKILL_NAMES;",
      "function dramaTimingForCard() { return { totalMin: 0 }; }",
      "function scaledDramaMs() { return 0; }",
      "function battleSpeedDelay(ms) { return Math.max(8, Math.round(Number(ms) || 0)); }",
      "function preloadCardVisualAssets() {}",
      // summonSpriteFor 只决定召唤物的贴图 URL（表现层资源），不进入任何数值/行为判定，
      // 因此以空字符串适配，不改变召唤物战力、生命与分摊比例。
      "function summonSpriteFor() { return ''; }",
      "function resetBattleViewTransform() {}",
      "function battleBackgroundFor() { return ''; }",
      "const pendingGameOverCheck = { flag: false };",
      "globalThis.resolveCardEffectAmount = resolveCardEffectAmount;",
      "globalThis.escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' })[char]);",
      "globalThis.formatNumber = formatNumber;",
      "globalThis.getCardActionIntent = getCardActionIntent;",
      "globalThis.scaledDramaMs = scaledDramaMs;",
      "globalThis.battleSpeedDelay = battleSpeedDelay;",
      "globalThis.cardHasAdvantageAgainst = cardHasAdvantageAgainst;",
    ].join("\n\n");
    vm.runInContext(helperSource, context, { filename: "helpers-from-index" });

    // effectsRenderer 的 no-op 桩必须保留真实实现中"命中揭示时刻的状态握手"：
    // index.html 的 effectsRenderer.play 会在 impactDelay 回调里调用 clearHpDisplayOverrides()
    // 并补跑被推迟的 checkGameOver()。这两步不是表现，而是战斗状态机的一部分——
    // 少了它们 hasPendingOverrides() 会永久为真，endTurn 会被永久拒绝。
    // 因此这里在宿主的 no-op 之外，于 vm 内重放同一状态握手（视觉部分保持 no-op）。
    vm.runInContext(`
      globalThis.effectsRenderer = {
        _playLock: 0,
        resize() {},
        showSummonAssistAttack() {},
        playStandardBattleEffect() {},
        play(card, result) {
          const battleState = gameEngine.state;
          const sessionId = gameEngine.sessionId;
          setTimeout(() => {
            if (!gameEngine.isActiveBattle(battleState, sessionId)) return;
            clearHpDisplayOverrides();
            if (pendingGameOverCheck.flag) {
              pendingGameOverCheck.flag = false;
              gameEngine.checkGameOver();
            }
          }, 0);
        }
      };
    `, context, { filename: "effectsRenderer-state-handshake" });
    const rendererStub = {
      settings: { battleSpeed: "standard", animation: "standard" },
      defaultDecks: [],
      selectedDeck: undefined,
      showAiDialogue() {},
      render() {},
      renderBattleSurface() {},
      renderBaseCardPreview() { return ""; },
      openModal() {},
      closeModal() {},
      openConfirm() {},
      showToast() {},
      nav() {},
      bind() {},
      init() {},
      populateControls() {},
      updateCardPreview() {},
      renderDeckManager() {},
      renderDefaultDecks() {},
      renderOpponentHand() {},
      startBattle() {},
      showResult() {},
      openBattlePrep() {},
    };
    context.uiRenderer = rendererStub;
    context.aiController = { chooseCard() { return null; }, takeTurn() {} };
    context.audioManager = { play() {}, stop() {}, playCard() {}, preload() {}, setVolume() {} };
    context.renderCardPreview = () => "";
    context.renderBaseCardPreview = () => "";
    context.showModeChooser = () => {};

    // 真实 gameEngine 对象字面量 + index.html 中的最终赋值（start / makeFighter）。
    const engineObject = (() => {
      const start = indexSource.indexOf("const gameEngine = {");
      let index = indexSource.indexOf("{", start);
      let depth = 0;
      for (; index < indexSource.length; index += 1) {
        const ch = indexSource[index];
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            index += 1;
            break;
          }
        }
      }
      return indexSource.slice(start, index) + ";";
    })();
    vm.runInContext(engineObject, context, { filename: "gameEngine-from-index" });
    // index.html 在覆写 makeFighter 前先绑定原始实现（`const originalMakeFighter = gameEngine.makeFighter.bind(gameEngine)`），
    // 抽取赋值函数时必须复现这一步，否则覆写体会引用到未定义标识符。
    vm.runInContext("const originalMakeFighter = gameEngine.makeFighter.bind(gameEngine);", context, { filename: "originalMakeFighter-from-index" });
    vm.runInContext(extractAssignedFunction(indexSource, "gameEngine.makeFighter = function(name, deck, isPlayer) {"), context, { filename: "makeFighter-from-index" });
    vm.runInContext(extractAssignedFunction(indexSource, "gameEngine.start = function(playerDeck, enemyDeck) {"), context, { filename: "start-from-index" });
    // index.html 末尾的 `Object.assign(globalThis, { ... })` 等价物：后加载的 js/*.js 只从 globalThis
    // 取 gameEngine / deckBuilder 等对象。uiRenderer / aiController / effectsRenderer 保留 no-op 桩
    // （纯表现层，不参与数值），其余运行时对象使用抽取出的真实实现。
    vm.runInContext("Object.assign(globalThis, { gameEngine, storageManager, deckBuilder, shareOwnerDamageWithSummon, upsertSummonEntity });", context, { filename: "globalThis-exports-from-index" });

    for (const file of SCRIPT_ORDER) {
      vm.runInContext(await read(file), context, { filename: file });
    }

    const { gameEngine, fixedCardLibrary, campaignMode, campaignData, campaignUiHarness } = context;
    if (!campaignUiHarness) throw new Error("campaign-ui.js 未暴露驱动接口 campaignUiHarness");
    // 只读引用若干 index.html 作用域内的常量/函数，供模拟器与报告做“同源”换算（不复制公式）。
    const internals = vm.runInContext(
      "({ levelHp, RACE_PROFILES, ELEMENT_COUNTER, rng })",
      context,
    );

    // ---- 驱动原语 ----

    function runNextTimer() {
      if (!timers.length) return false;
      timers.sort((a, b) => a.time - b.time || a.seq - b.seq);
      const timer = timers.shift();
      virtualNow = Math.max(virtualNow, timer.time);
      timer.handler();
      return true;
    }

    const yieldHost = () => new Promise(resolve => hostSetImmediate(resolve));

    async function drain(limit = 400000) {
      let spins = 0;
      while (timers.length) {
        if (spins++ > limit) throw new Error("harness: 定时器队列未收敛");
        runNextTimer();
        if (spins % 32 === 0) await yieldHost();
      }
      await yieldHost();
    }

    async function settle(promise, limit = 400000) {
      let done = false;
      let rejected;
      let error;
      Promise.resolve(promise).then(value => { done = true; rejected = value; }, reason => { done = true; error = reason; });
      let spins = 0;
      while (!done || timers.length) {
        if (spins++ > limit) throw new Error("harness: 回合推进未收敛");
        if (timers.length) runNextTimer();
        else await yieldHost();
      }
      if (error) throw error;
      return rejected;
    }

    async function waitForPlayerTurn(state, limit = 400000) {
      let spins = 0;
      while (!state.gameOver && (state.turn !== "player" || state.actionLocked)) {
        if (spins++ > limit) throw new Error("harness: 等待玩家回合超时");
        if (timers.length) runNextTimer();
        else await yieldHost();
      }
    }

    function setSeed(seed) {
      vm.runInContext(`__setHarnessSeed(${Number(seed) || 1});`, context);
    }

    function seedProgress() {
      const progress = campaignMode.defaultProgress(campaignData.characters);
      campaignData.characters.forEach(item => { progress.characters[item.id] = { unlockedStage: 5, completed: false }; });
      storage.set(campaignMode.STORAGE_KEY, JSON.stringify(progress));
      return progress;
    }

    return {
      context,
      internals,
      gameEngine,
      fixedCardLibrary,
      campaignMode,
      campaignData,
      campaignUiHarness,
      rendererStub,
      localStorage: localStorageStub,
      storage,
      setSeed,
      seedProgress,
      drain,
      settle,
      waitForPlayerTurn,
      runNextTimer,
      hasPendingTimers: () => timers.length > 0,
      pendingTimerCount: () => timers.length,
      // 虚拟时钟读数：用于节奏（pacing）测量——真实 setSpeed 下的累计等待毫秒。
      virtualNow: () => virtualNow,
      setBattleSpeed: speed => {
        const settings = context.uiRenderer?.settings;
        if (settings) settings.battleSpeed = speed;
        if (typeof context.storageManager?.setSettings === "function") {
          context.storageManager.setSettings({ ...(context.storageManager.getSettings?.() || {}), battleSpeed: speed });
        }
        return speed;
      },
      localStorageWrites: () => localStorageWrites,
      SCRIPT_ORDER,
    };
  })();
}
