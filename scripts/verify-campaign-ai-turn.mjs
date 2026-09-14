import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

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
};
vm.createContext(context);

context.rng = (() => {
  let seed = 0x9e3779b9;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
})();

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

function extractObjectMethod(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`无法从 index.html 定位方法：${signature}`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < src.length; index += 1) {
    const ch = src[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        index += 1;
        return src.slice(start, index);
      }
    }
  }
  throw new Error(`无法提取方法：${signature}`);
}

const indexSource = await read("index.html");
const helperNames = [
  "deterministicId",
  "shuffle",
  "clamp",
  "safeNumber",
  "levelHp",
  "formatNumber",
  "resolveEffectAmount",
  "resolveCardEffectAmount",
  "getCardPrimaryPower",
  "shareOwnerDamageWithSummon",
];
const helpers = helperNames.map(name => extractFunction(indexSource, name)).join("\n\n");
vm.runInContext(helpers, context, { filename: "helpers-from-index" });

context.escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
context.combinedProfile = () => ({ damage: 1, heal: 1, defense: 1 });
context.normalizeRace = race => race === "神人" ? "人族" : race === "黑暗精灵" ? "精灵族" : race;
context.normalizeProfession = profession => /法|魔/.test(profession) ? "魔法师" : "战士";
context.elementMultiplier = () => ({ multiplier: 1 });
context.removeDefeatedSummons = () => [];
context.setHpDisplayOverride = () => {};
context.clearHpDisplayOverrides = () => {};
context.hasPendingOverrides = () => false;
context.setCombatInputLocked = () => {};
context.pendingGameOverCheck = { flag: false };
context.resetBattleViewTransform = () => {};
context.getCardActionIntent = card => {
  if (card?.effects?.some(e => e.type === "damage")) return "hostile-damage";
  if (card?.effects?.some(e => e.type === "heal")) return "friendly-heal";
  if (card?.effects?.some(e => e.type === "shield")) return "friendly-shield";
  return "friendly-buff";
};
context.cardHasAdvantageAgainst = () => false;
context.renderCardPreview = card => `<preview>${card?.name || ""}</preview>`;
context.renderBaseCardPreview = card => `<preview>${card?.name || ""}</preview>`;
context.effectiveCardCost = (state, side, card) => {
  if (context.campaignMode?.effectiveCardCost) return context.campaignMode.effectiveCardCost(state, side, card);
  return Math.max(0, Number(card?.cost || 0));
};
context.dramaTimingForCard = () => ({ totalMin: 1 });
// index.html 的完整动作时间缩放入口：标准档位下等价于原值。
context.scaledDramaMs = ms => Math.round(Number(ms) || 0);
context.preloadCardVisualAssets = () => {};
context.stripCardTaxonomyPrefix = value => value;
context.mechanicsForCard = () => [];
context.createStatusFromMechanic = () => null;
context.VICTORY_TIMING = { victoryDelay: 100, enemyDefeatLine: 50 };
context.setTimeout = setTimeout;
context.clearTimeout = clearTimeout;

const documentStub = {
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return {
      id: "",
      className: "",
      innerHTML: "",
      style: {},
      dataset: {},
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false; },
      },
      appendChild() {},
      addEventListener() {},
      setAttribute() {},
      remove() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  },
  hidden: false,
};
context.document = documentStub;
context.window = { addEventListener() {} };

context.audioManager = {
  play() {},
  stop() {},
  playCard() {},
  preload() {},
};
context.effectsRenderer = undefined;
context.uiRenderer = {
  defaultDecks: [],
  selectedDeck: undefined,
  render() {},
  renderBattleSurface() {},
  nav() {},
  openModal() {},
  closeModal() {},
  startBattle() {},
  openBattlePrep() {},
  showResult() {},
  showAiDialogue() {},
  showToast() {},
};
context.aiController = { chooseCard() {}, takeTurn() {} };
context.fixedCardLibrary = { characterDefinitions: [] };
context.gameEngine = {
  state: null,
  sessionId: 1,
  log() {},
  checkGameOver() {},
  isActiveBattle(state, sessionId) {
    return this.state === state && this.sessionId === sessionId;
  },
  makeFighter(name, deck, isPlayer) {
    const level = Number(deck?.level) || 50;
    const maxHp = context.levelHp(level);
    return {
      id: isPlayer ? "player" : "enemy",
      name,
      level,
      race: deck?.race || "人族",
      profession: deck?.profession || "战士",
      element: deck?.element || "无",
      maxHp,
      hp: maxHp,
      shield: 0,
      energy: 0,
      maxEnergy: 10,
      hand: [],
      drawPile: (deck?.cards || []).map(card => ({ ...card })),
      discardPile: [],
      exhaustPile: [],
      statuses: [],
      summons: [],
      skipAction: false,
      controlImmuneTurns: 0,
      turnFlags: {},
      profile: { damage: 1, heal: 1, defense: 1 },
      deckName: deck?.name || "",
    };
  },
};

vm.runInContext(await read("js/battle-rules.js"), context, { filename: "js/battle-rules.js" });
vm.runInContext(await read("js/campaign-data.js"), context, { filename: "js/campaign-data.js" });
vm.runInContext(await read("js/campaign-mode.js"), context, { filename: "js/campaign-mode.js" });
vm.runInContext(await read("js/campaign-rules.js"), context, { filename: "js/campaign-rules.js" });
vm.runInContext(await read("js/fixed-game-rules.js"), context, { filename: "js/fixed-game-rules.js" });
vm.runInContext(await read("js/campaign-runtime.js"), context, { filename: "js/campaign-runtime.js" });
vm.runInContext(await read("js/campaign-ui.js"), context, { filename: "js/campaign-ui.js" });

const checkGameOverSource = extractObjectMethod(indexSource, "checkGameOver() {");
vm.runInContext(`gameEngine.checkGameOver = function ${checkGameOverSource}`, context, { filename: "checkGameOver-from-index" });
const resolveActionSource = extractObjectMethod(indexSource, "resolveAction(action) {");
vm.runInContext(`gameEngine.resolveAction = function ${resolveActionSource}`, context, { filename: "resolveAction-from-index" });

const { gameEngine, campaignMode, aiController } = context;

const baseApplyCard = gameEngine.applyCard.bind(gameEngine);
let applyCalls = 0;
gameEngine.applyCard = function (...args) {
  applyCalls += 1;
  return baseApplyCard(...args);
};

function makeFighter(overrides = {}, isPlayer = true) {
  const deck = {
    id: "test-deck",
    name: "测试卡组",
    race: "人族",
    profession: "战士",
    level: 1,
    element: "无",
    cards: [],
  };
  const fighter = gameEngine.makeFighter(isPlayer ? "玩家" : "敌人", deck, isPlayer);
  if (overrides.hp != null) fighter.hp = overrides.hp;
  if (overrides.energy != null) fighter.energy = overrides.energy;
  if (overrides.shield != null) fighter.shield = overrides.shield;
  if (overrides.statuses) fighter.statuses = overrides.statuses;
  if (overrides.summons) fighter.summons = overrides.summons;
  fighter.hand = overrides.hand || [];
  fighter.drawPile = overrides.drawPile || [];
  fighter.discardPile = overrides.discardPile || [];
  fighter.exhaustPile = overrides.exhaustPile || [];
  return fighter;
}

function makeCard(overrides = {}) {
  return {
    id: "test-card",
    instanceId: overrides.instanceId || "test-card-instance",
    name: "测试卡",
    baseName: "测试卡",
    category: "skill",
    skillTier: "normal",
    tier: "normal",
    cost: 1,
    element: "火",
    effectType: "damage",
    afterPlay: "discard",
    mechanics: [],
    effects: [{ type: "damage", ratio: 0.01 }],
    power: 100,
    ...overrides,
  };
}

function startState(options = {}) {
  const player = makeFighter({ hp: options.playerHp ?? 5000 }, true);
  const enemy = makeFighter({ hp: options.enemyHp ?? 5000, energy: options.enemyEnergy ?? 10 }, false);
  const state = {
    sessionId: gameEngine.sessionId,
    turn: "enemy",
    round: options.round ?? 1,
    gameOver: false,
    winner: null,
    log: [],
    actions: [],
    player,
    enemy,
    combatStats: campaignMode.createCombatStats(),
    actionLocked: false,
  };
  if (options.campaign !== false) {
    state.gameMode = "campaign";
    state.campaign = {
      characterId: options.characterId || "luolinfo",
      stage: 1,
      difficulty: "normal",
      playerRing: 0,
      enemyRing: options.enemyRing ?? 0,
      resonanceUsed: false,
      enemyResonanceUsed: options.enemyResonanceUsed ?? false,
      costReduction: 0,
      enemyCostReduction: options.enemyCostReduction ?? 0,
      intent: options.intent ?? { type: "普通攻击", cardInstanceId: "", description: "敌方正在准备普通攻击。", generatedRound: 1 },
      passiveTriggers: 0,
      passives: { turn: {}, match: {}, round: 1 },
    };
    state.campaignStats = campaignMode.createCombatStats();
  }
  gameEngine.state = state;
  return state;
}

function resetApplyCounter() {
  applyCalls = 0;
}

// ---- 1. Sandbox normal AI turn ----
{
  resetApplyCounter();
  const state = startState({ campaign: false, enemyEnergy: 5 });
  state.enemy.hand = [
    makeCard({ instanceId: "e1", cost: 1 }),
    makeCard({ instanceId: "e2", cost: 2 }),
  ];
  await aiController.takeTurn();
  assert.equal(state.turn, "player", "沙盒 AI 结束后应回到玩家回合");
  assert.ok(applyCalls >= 1, "沙盒 AI 应至少执行一次卡牌结算");
  assert.equal(state.campaign, undefined, "沙盒 AI 不应创建 campaign 状态");
  assert.ok(state.enemy.energy >= 0, "沙盒 AI 后能量不能为负");
  assert.equal(state.enemy.hand.length + state.enemy.discardPile.length + state.enemy.exhaustPile.length + state.enemy.drawPile.length, 2 + (state.enemy.drawPile?.length || 0), "沙盒 AI 后卡牌实例应守恒");
}

// ---- 2. Campaign normal AI turn ----
{
  resetApplyCounter();
  const state = startState({ campaign: true, enemyEnergy: 5, enemyRing: 0 });
  state.enemy.hand = [makeCard({ instanceId: "c1", cost: 1, category: "skill", skillTier: "advanced", tier: "advanced" })];
  await aiController.takeTurn();
  assert.equal(state.turn, "player", "战役 AI 结束后应回到玩家回合");
  assert.ok(applyCalls >= 1, "战役 AI 应至少执行一次卡牌结算");
  assert.ok(state.campaign.enemyRing > 0, "战役 AI 成功出牌应增加敌方星环");
  assert.equal(state.campaign.enemyResonanceUsed, false, "普通 AI 回合不应错误消耗敌方共鸣冷却");
}

// ---- 3. Zero-action AI turn ----
{
  resetApplyCounter();
  const state = startState({ campaign: false, enemyEnergy: 0 });
  state.enemy.hand = [makeCard({ instanceId: "z1", cost: 5 })];
  await aiController.takeTurn();
  assert.equal(state.turn, "player", "无可打牌时 AI 应结束回合");
  assert.equal(applyCalls, 0, "无可打牌时不应执行卡牌结算");
  assert.equal(state.enemy.hand.length, 1, "无可打牌时手牌应保留");
}

// ---- 4. Controlled/skipped AI turn ----
{
  resetApplyCounter();
  const state = startState({ campaign: true, enemyEnergy: 5 });
  state.enemy.skipAction = true;
  state.enemy.statuses = [{ type: "禁锢", turns: 1, power: 0 }];
  state.enemy.hand = [makeCard({ instanceId: "ctrl1", cost: 1 })];
  await aiController.takeTurn();
  await new Promise(resolve => setTimeout(resolve, 750));
  assert.equal(state.turn, "player", "被控制的敌方应结束回合");
  assert.equal(applyCalls, 0, "被控制的敌方不应出牌");
  assert.equal(state.campaign.enemyRing, 0, "被控制的敌方不应获得星环");
}

// ---- 5. Multi-action AI respects energy and no duplicate instance ----
{
  resetApplyCounter();
  const state = startState({ campaign: true, enemyEnergy: 10 });
  state.enemy.hand = [
    makeCard({ instanceId: "m1", cost: 1 }),
    makeCard({ instanceId: "m2", cost: 1 }),
    makeCard({ instanceId: "m3", cost: 1 }),
  ];
  await aiController.takeTurn();
  assert.equal(state.turn, "player", "多行动 AI 最终应结束回合");
  assert.ok(applyCalls >= 2, "多行动 AI 应执行多个动作");
  const playedIds = state.enemy.discardPile.map(c => c.instanceId);
  assert.equal(new Set(playedIds).size, playedIds.length, "同一卡牌实例不应重复进入弃牌堆");
  assert.ok(state.enemy.energy >= 0, "多行动 AI 后能量不能为负");
}

// ---- 6. Game-over between AI actions ----
{
  resetApplyCounter();
  const state = startState({ campaign: false, enemyEnergy: 10, playerHp: 1 });
  state.player.race = "恶魔"; // 避免人族/神人低血天赋干扰击杀测试
  state.enemy.hand = [
    makeCard({ instanceId: "kill1", cost: 1, effects: [{ type: "damage", ratio: 1 }] }),
    makeCard({ instanceId: "kill2", cost: 1, effects: [{ type: "damage", ratio: 1 }] }),
  ];
  await aiController.takeTurn();
  assert.equal(state.gameOver, true, "AI 第一张牌击杀玩家应触发 gameOver");
  assert.equal(applyCalls, 1, "gameOver 后不应继续第二个 AI 动作");
  assert.equal(state.turn, "enemy", "gameOver 后不应再推进到玩家回合");
}

// ---- 7. Stale/invalid entry guards ----
{
  resetApplyCounter();
  const state = startState({ campaign: true, enemyEnergy: 5 });
  state.turn = "player";
  state.enemy.hand = [makeCard({ instanceId: "g1", cost: 1 })];
  await aiController.takeTurn();
  assert.equal(applyCalls, 0, "非 enemy 回合调用 AI 不应执行动作");
  state.turn = "enemy";
  state.gameOver = true;
  await aiController.takeTurn();
  assert.equal(applyCalls, 0, "gameOver 后调用 AI 不应执行动作");
}

// ---- 8. Campaign enemy resonance activation when ring is full ----
{
  resetApplyCounter();
  const state = startState({ campaign: true, enemyEnergy: 5, enemyRing: 6, enemyResonanceUsed: false });
  state.enemy.hand = [makeCard({ instanceId: "r1", cost: 1 })];
  await aiController.takeTurn();
  assert.equal(state.turn, "player", "敌方共鸣后 AI 仍应结束回合");
  // enemyResonanceUsed 会在敌方回合结束时被 afterCampaignTurnEnd 重置为 false；
  // 若共鸣确实触发，星环会被清零后再因出牌增加，因此应小于满环 6。
  assert.ok(state.campaign.enemyRing < 6, "敌方满环时 AI 应激活共鸣并消耗星环");
  assert.ok(state.campaign.enemyRing >= 0 && state.campaign.enemyRing <= 6, "敌方共鸣后星环应在合法范围");
}

console.log("战役 AI turn 特征测试通过：沙盒/战役 AI、零行动、控制、多行动、game-over、陈旧入口与共鸣均符合当前行为。");

// Controlled timer queue around the real playCard -> ring -> await chain.
// 注：等待超时不再属于"取消"分支（旧实现超时即放弃敌方回合，见下方 R01 回归），此处只覆盖真实的取消/终局/空闲分支。
const asyncFailures = [];
for (const scenario of ["exit", "replace", "identity", "gameOver", "turn", "idle", "entry", "limit"]) {
  const timers = []; let now = 0; let events = 0; let rejection;
  context.Date = class extends Date { static now() { return now; } };
  context.setTimeout = (callback, delay = 0) => { timers.push({ callback, at: now + delay }); return timers.length; };
  context.effectsRenderer = { _playLock: 0 };
  context.gameEngine.log = function (message) { this.state.log.unshift(message); events += 1; };
  context.campaignRuntime.configurePresentation({ renderHud() { events += 1; }, notice() { events += 1; }, playSound() { events += 1; }, playDrawSound() { events += 1; } });
  vm.runInContext(`gameEngine.invalidateBattle = function ${extractObjectMethod(indexSource, "invalidateBattle() {")}`, context);
  const state = startState({ enemyRing: scenario === "entry" ? 6 : 5 });
  state.campaignStats.highestDamage = state.enemy.maxHp;
  state.enemy.hand = [makeCard({ category: "base", skillTier: "base", instanceId: "last-ring" })];
  context.dramaTimingForCard = () => ({ totalMin: 10000 });
  if (scenario === "entry") state.actionLocked = true;
  const originalResolve = gameEngine.resolveAction;
  let calls = 0;
  if (scenario === "limit") gameEngine.resolveAction = function(action) {
    if (action.type === "playCard") {
      calls += 1;
      if (calls === 15) this.invalidateBattle();
      return false;
    }
    return originalResolve.call(this, action);
  };
  const pending = aiController.takeTurn().catch(error => { rejection = error; });
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  try {
    if (!["entry", "limit"].includes(scenario)) assert.equal(state.campaign.enemyRing, 6, "真实出牌先增加星环");
    if (scenario === "exit" || scenario === "entry" || scenario === "replace") gameEngine.invalidateBattle();
    if (scenario === "replace" || scenario === "identity") startState();
    if (scenario === "gameOver") state.gameOver = true;
    if (scenario === "turn") state.turn = "player";
    if (scenario === "idle") state.actionLocked = false;
    const frozen = JSON.stringify(state), current = JSON.stringify(gameEngine.state), beforeEvents = events;
    now = 50;
    const ready = timers.filter(t => t.at <= now); timers.splice(0, timers.length, ...timers.filter(t => t.at > now));
    for (const timer of ready) timer.callback();
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
    // No real-time wait: all continuation work must settle after the controlled poll.
    let settled = false; pending.then(() => { settled = true; });
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    assert.equal(settled, true, `${scenario} promise should finish`);
    assert.equal(rejection, undefined);
    if (scenario === "idle") {
      assert.equal(state.campaignStats.enemyResonance, 1);
      assert.equal(state.log.filter(line => line.includes("[星环共鸣]")).length, 1);
    } else {
      assert.equal(JSON.stringify(state), frozen, "取消后旧局冻结");
      assert.equal(JSON.stringify(gameEngine.state), current, "不能污染新局");
      assert.equal(events, beforeEvents, "不能追加日志/HUD/音效");
      if (["exit", "replace", "identity", "entry", "limit"].includes(scenario)) {
        for (const timer of timers.splice(0)) timer.callback();
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        assert.equal(JSON.stringify(gameEngine.state), current, "全部迟到任务不得影响新局");
        assert.equal(events, beforeEvents);
      }
    }
  } catch (error) { asyncFailures.push(`${scenario}: ${error.message}`); }
  gameEngine.resolveAction = originalResolve;
}
assert.deepEqual(asyncFailures, [], asyncFailures.join("\n"));

// ---- 9. R01 回归：AI 等待超时后必须恢复回合，而不是永久停在敌方回合 ----
// 旧行为：waitForCombatIdle 超时即让整个敌方回合直接 return，动作锁随后释放也没有任何恢复路径。
// 新行为：超时只代表"这一轮还没空闲"，只要战斗仍有效就继续等待，空闲后继续本回合。
{
  const timers = []; let now = 0;
  const savedSetTimeout = context.setTimeout;
  const savedDate = context.Date;
  context.Date = class extends Date { static now() { return now; } };
  context.setTimeout = (callback, delay = 0) => { timers.push({ callback, at: now + delay }); return timers.length; };
  context.effectsRenderer = { _playLock: 0 };
  const state = startState({ enemyRing: 0 });
  state.enemy.hand = [makeCard({ category: "base", skillTier: "base", instanceId: "timeout-resume", cost: 1 })];
  context.dramaTimingForCard = () => ({ totalMin: 10000 });
  let rejection;
  const turn = aiController.takeTurn().catch(error => { rejection = error; });
  const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
  const runQueued = async () => { const ready = timers.splice(0, timers.length); ready.forEach(timer => timer.callback()); await settle(); };
  await settle();
  // 出牌已发生且动作锁处于锁定状态（等待特效/结算结束）
  assert.equal(state.campaign.enemyRing, 1, "等待前应先完成真实出牌");
  assert.equal(state.actionLocked, true, "出牌后动作锁应处于锁定状态");
  // 跨过 8 秒等待期限：第一次等待超时（只推进模拟时钟并执行已排队的轮询）
  now = 8001;
  await runQueued();
  // 动作锁在下一次轮询前释放：恢复路径必须在同一轮"超时 → 空闲"周期里继续本回合，
  // 因此后续只重新执行已排队的轮询回调（模拟时钟停在超时之后），不再提前推进时间。
  state.actionLocked = false;
  for (let round = 0; round < 40 && state.turn === "enemy"; round += 1) {
    await runQueued();
  }
  assert.equal(rejection, undefined, "超时恢复路径不应抛错");
  // 旧实现：超时即 return，动作锁释放后没有任何恢复路径，回合永久停在敌方。
  assert.equal(state.turn, "player", "等待超时后 AI 应继续行动并结束敌方回合");
  assert.equal(state.campaign.enemyRing, 1, "恢复后本回合的出牌仍应正常累积星环");
  assert.equal(state.campaign.enemyResonanceUsed, false, "敌方回合结束后应重置共鸣冷却");
  let settled = false; turn.then(() => { settled = true; });
  await settle();
  assert.equal(settled, true, "恢复后的 AI 回合应正常结束");
  context.setTimeout = savedSetTimeout;
  context.Date = savedDate;
}

// ---- 10. R01 回归：AI 总入口进入时就已经有动作锁，超时后释放仍必须完成回合 ----
// 对应四处等待入口中的第 1 处（aiController.takeTurn 总入口）。
// 旧行为：总入口等待超时即 return，动作锁释放后没有任何恢复路径。
{
  const timers = []; let now = 0;
  const savedSetTimeout = context.setTimeout;
  const savedDate = context.Date;
  context.Date = class extends Date { static now() { return now; } };
  context.setTimeout = (callback, delay = 0) => { timers.push({ callback, at: now + delay }); return timers.length; };
  context.effectsRenderer = { _playLock: 0 };
  const state = startState({ enemyRing: 0 });
  state.enemy.hand = [makeCard({ category: "base", skillTier: "base", instanceId: "entry-lock", cost: 1 })];
  // 总入口进入时动作锁已存在（例如上一张牌的收尾还没结束）
  state.actionLocked = true;
  context.dramaTimingForCard = () => ({ totalMin: 10000 });
  let rejection;
  const turn = aiController.takeTurn().catch(error => { rejection = error; });
  const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
  const runQueued = async () => { const ready = timers.splice(0, timers.length); ready.forEach(timer => timer.callback()); await settle(); };
  await settle();
  assert.equal(state.turn, "enemy", "锁未释放时应停留在敌方回合入口");
  assert.equal(state.actionLocked, true, "入口等待期间动作锁应保持");
  // 跨过 8 秒等待期限
  now = 8001;
  await runQueued();
  // 锁在超时之后才释放：恢复路径必须检测到并继续完成本回合
  state.actionLocked = false;
  for (let round = 0; round < 40 && state.turn === "enemy"; round += 1) {
    await runQueued();
  }
  assert.equal(rejection, undefined, "入口超时恢复不应抛错");
  assert.equal(state.turn, "player", "总入口等待超时后仍应完成敌方回合");
  let settled = false; turn.then(() => { settled = true; });
  await settle();
  assert.equal(settled, true, "入口恢复路径应正常结束");
  context.setTimeout = savedSetTimeout;
  context.Date = savedDate;
}

// ---- 11. R01 回归：旧等待在战斗被重开/退出后必须取消，且不得重复执行 AI 回合 ----
// 覆盖四处入口共同的取消语义：等待期间 battle 被 invalidate（返回首页/重开），
// 迟到回调只能取消，不得触碰新局、不得再次推进回合。
{
  const timers = []; let now = 0; let events = 0;
  const savedSetTimeout = context.setTimeout;
  const savedDate = context.Date;
  context.Date = class extends Date { static now() { return now; } };
  context.setTimeout = (callback, delay = 0) => { timers.push({ callback, at: now + delay }); return timers.length; };
  context.effectsRenderer = { _playLock: 0 };
  context.gameEngine.log = function (message) { this.state.log.unshift(message); events += 1; };
  context.campaignRuntime.configurePresentation({ renderHud() { events += 1; }, notice() { events += 1; }, playSound() { events += 1; }, playDrawSound() { events += 1; } });
  const state = startState({ enemyRing: 0 });
  state.enemy.hand = [makeCard({ category: "base", skillTier: "base", instanceId: "stale-wait", cost: 1 })];
  state.actionLocked = true;
  context.dramaTimingForCard = () => ({ totalMin: 10000 });
  let rejection;
  const turn = aiController.takeTurn().catch(error => { rejection = error; });
  const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
  await settle();
  // 退出/重开战斗：旧局失效，同一时刻新局已经就位
  vm.runInContext(`gameEngine.invalidateBattle = function ${extractObjectMethod(indexSource, "invalidateBattle() {")}`, context);
  gameEngine.invalidateBattle();
  const fresh = startState({ enemyRing: 0 });
  fresh.turn = "player";
  fresh.enemy.hand = [makeCard({ category: "base", skillTier: "base", instanceId: "fresh-battle", cost: 1 })];
  const freshSnapshot = JSON.stringify(fresh);
  const freshSessionId = gameEngine.sessionId;
  events = 0;
  // 让所有迟到回调（含超时轮询）全部执行
  now = 9000;
  for (let round = 0; round < 40; round += 1) {
    const ready = timers.splice(0, timers.length);
    if (!ready.length) break;
    ready.forEach(timer => timer.callback());
    await settle();
  }
  let settled = false; turn.then(() => { settled = true; });
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await settle();
  assert.equal(settled, true, "旧战斗失效后等待必须取消（不得悬挂）");
  assert.equal(rejection, undefined, "取消路径不应抛错");
  assert.equal(gameEngine.state === fresh && gameEngine.sessionId === freshSessionId, true, "不得替换/污染新局引用");
  assert.equal(JSON.stringify(fresh), freshSnapshot, "新局状态不得被旧等待改动");
  assert.equal(fresh.turn, "player", "旧 AI 回合不得在新局里重复执行");
  assert.equal(events, 0, "取消后不得追加日志/HUD/音效");
  context.setTimeout = savedSetTimeout;
  context.Date = savedDate;
}

console.log("异步取消、终局、超时恢复（出牌后/总入口）、旧战斗取消与第15步隔离回归通过。");
