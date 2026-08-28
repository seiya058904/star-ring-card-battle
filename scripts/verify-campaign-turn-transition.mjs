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
context.preloadCardVisualAssets = () => {};
context.stripCardTaxonomyPrefix = value => value;
context.mechanicsForCard = () => [];
context.createStatusFromMechanic = () => null;
context.VICTORY_TIMING = { victoryDelay: 100, enemyDefeatLine: 50 };

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

context.setTimeout = () => 0;
context.clearTimeout = () => {};
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

// 使用真实 checkGameOver 实现，以便验证“过渡中死亡”会正确终止后续回合推进。
const checkGameOverSource = extractObjectMethod(indexSource, "checkGameOver() {");
vm.runInContext(`gameEngine.checkGameOver = function ${checkGameOverSource}`, context, { filename: "checkGameOver-from-index" });

// 使用真实 resolveAction 作为玩家请求入口，以验证 actionLocked 会拦截 End Turn 请求。
const resolveActionSource = extractObjectMethod(indexSource, "resolveAction(action) {");
vm.runInContext(`gameEngine.resolveAction = function ${resolveActionSource}`, context, { filename: "resolveAction-from-index" });

const { gameEngine, campaignMode } = context;

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
  const player = makeFighter({ hp: options.playerHp ?? 5000, energy: 0 }, true);
  const enemy = makeFighter({ hp: options.enemyHp ?? 5000, energy: 0 }, false);
  const state = {
    sessionId: gameEngine.sessionId,
    turn: options.turn || "player",
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
      playerRing: options.playerRing ?? 0,
      enemyRing: options.enemyRing ?? 0,
      resonanceUsed: options.resonanceUsed ?? true,
      enemyResonanceUsed: options.enemyResonanceUsed ?? true,
      costReduction: options.costReduction ?? 2,
      enemyCostReduction: options.enemyCostReduction ?? 1,
      intent: options.intent ?? { type: "普通攻击", cardInstanceId: "", description: "敌方正在准备普通攻击。", generatedRound: 1 },
      passiveTriggers: 0,
      passives: { turn: { luolinfo: true }, match: {}, round: 1 },
      extraEnergyNext: options.extraEnergyNext ?? false,
    };
    state.campaignStats = campaignMode.createCombatStats();
  }
  gameEngine.state = state;
  return state;
}

// ---- 1. Sandbox normal transition ----
{
  const state = startState({ campaign: false, round: 1 });
  state.player.hand = [makeCard({ instanceId: "p1" })];
  state.player.drawPile = [makeCard({ instanceId: "p2" }), makeCard({ instanceId: "p3" })];
  state.enemy.hand = [makeCard({ instanceId: "e1" })];
  state.enemy.drawPile = [makeCard({ instanceId: "e2" }), makeCard({ instanceId: "e3" }), makeCard({ instanceId: "e4" }), makeCard({ instanceId: "e5" }), makeCard({ instanceId: "e6" })];
  const result = gameEngine.endTurn("player");
  assert.equal(result, true, "沙盒玩家结束回合应成功");
  assert.equal(state.turn, "enemy", "玩家结束后应切换到 enemy");
  assert.equal(state.round, 1, "玩家结束回合不增加 round");
  assert.ok(state.enemy.energy > 0, "enemy 回合应初始化能量");
  assert.ok(state.enemy.hand.length >= 5, "enemy 回合应抽牌到 5");
  const enemyEnd = gameEngine.endTurn("enemy");
  assert.equal(enemyEnd, true, "沙盒 enemy 结束回合应成功");
  assert.equal(state.turn, "player", "enemy 结束后应切回 player");
  assert.equal(state.round, 2, "enemy 结束回合应增加 round");
  assert.ok(state.player.energy > 0, "player 新回合应初始化能量");
  assert.equal(state.campaign, undefined, "沙盒不应出现 campaign 状态");
}

// ---- 2. Campaign transition: cost/intent/resonance lifecycle ----
{
  const state = startState({ campaign: true, round: 1 });
  const playerEnd = gameEngine.endTurn("player");
  assert.equal(playerEnd, true, "战役玩家结束回合应成功");
  assert.equal(state.turn, "enemy", "战役玩家结束后应切换到 enemy");
  assert.equal(state.campaign.costReduction, 0, "玩家结束时星耀减费应被 expire");
  assert.ok(state.campaign.intent, "玩家结束时不应清空敌方意图");
  assert.equal(state.campaign.resonanceUsed, true, "玩家结束时不应重置玩家共鸣冷却");
  const enemyEnd = gameEngine.endTurn("enemy");
  assert.equal(enemyEnd, true, "战役 enemy 结束回合应成功");
  assert.equal(state.turn, "player", "战役 enemy 结束后应切回 player");
  assert.equal(state.round, 2, "战役 enemy 结束应增加 round");
  assert.equal(state.campaign.enemyCostReduction, 0, "敌方结束时应 expire 敌方减费");
  assert.ok(state.campaign.intent && state.campaign.intent.generatedRound === 2, "敌方结束并进入玩家回合后应重新生成下一轮意图");
  assert.equal(state.campaign.resonanceUsed, false, "敌方结束后应重置玩家共鸣冷却");
  assert.equal(state.campaign.enemyResonanceUsed, false, "敌方结束后应重置敌方共鸣冷却");
  assert.equal(state.campaign.passives.round, 2, "新回合应重置 passive 回合桶");
  assert.equal(Object.keys(state.campaign.passives.turn).length, 0, "新回合应清空 turn passive");
}

// ---- 3. Status timing: DoT ticks exactly once on the correct begin-turn ----
{
  const state = startState({ campaign: false, enemyHp: 1000 });
  state.enemy.hp = 1000;
  state.enemy.statuses = [{ type: "燃烧", turns: 2, power: 50, sourceOwnerId: "player", source: "测试" }];
  state.enemy.drawPile = [makeCard({ instanceId: "e1" }), makeCard({ instanceId: "e2" }), makeCard({ instanceId: "e3" }), makeCard({ instanceId: "e4" }), makeCard({ instanceId: "e5" })];
  const beforeHp = state.enemy.hp;
  gameEngine.endTurn("player");
  assert.ok(state.enemy.hp < beforeHp, "enemy 回合开始时应受到一次 DoT");
  const afterFirst = state.enemy.hp;
  gameEngine.endTurn("enemy");
  assert.equal(state.enemy.hp, afterFirst, "同一回合切换不应再次对 enemy 造成 DoT");
}

// ---- 4. Summon lifecycle: player summon assists at end of player turn ----
{
  const state = startState({ campaign: false, enemyHp: 5000 });
  const summon = { id: "summon-p", name: "玩家召唤", ownerId: "player", maxHp: 200, hp: 200, power: 100 };
  state.player.summons = [summon];
  state.enemy.hand = [makeCard({ instanceId: "e1" })];
  state.enemy.drawPile = [makeCard({ instanceId: "e2" }), makeCard({ instanceId: "e3" }), makeCard({ instanceId: "e4" }), makeCard({ instanceId: "e5" })];
  const beforeEnemyHp = state.enemy.hp;
  gameEngine.endTurn("player");
  assert.ok(state.enemy.hp < beforeEnemyHp, "玩家召唤物应在玩家回合结束时协击");
  assert.ok(state.player.summons.some(s => s.id === summon.id && s.hp > 0), "存活召唤物应保留到下一阶段");
}

// ---- 5. Game-over during transition stops further advancement ----
{
  const state = startState({ campaign: false, enemyHp: 40, round: 1 });
  state.enemy.hp = 40;
  state.enemy.statuses = [{ type: "燃烧", turns: 2, power: 50, sourceOwnerId: "player", source: "测试" }];
  state.enemy.drawPile = [];
  const result = gameEngine.endTurn("player");
  assert.equal(result, true, "endTurn 返回 true 表示请求已处理");
  assert.equal(state.gameOver, true, "DoT 应在 enemy 回合开始时击杀并触发 gameOver");
  assert.equal(state.winner, "player", "玩家 DoT 击杀 enemy 应判定玩家胜利");
  const afterGameOver = gameEngine.endTurn("enemy");
  assert.equal(afterGameOver, false, "gameOver 后不能再推进 enemy 回合");
  assert.equal(state.round, 1, "gameOver 后 round 不应增加");
}

// ---- 6. Repeated End Turn / action lock ----
{
  const state = startState({ campaign: true, round: 1 });
  state.actionLocked = true;
  const result = gameEngine.resolveAction({ type: "endTurn", side: "player" });
  assert.equal(result, false, "actionLocked 时 resolveAction 应拒绝 endTurn");
  assert.equal(state.turn, "player", "actionLocked 拒绝后不应切换回合");
  assert.equal(state.campaign.costReduction, 2, "actionLocked 在进入 endTurn 前被拦截，不应消费星耀减费");
  assert.equal(state.round, 1, "拒绝后 round 不应变化");
  state.actionLocked = false;
  state.gameOver = true;
  const afterGameOver = gameEngine.resolveAction({ type: "endTurn", side: "player" });
  assert.equal(afterGameOver, undefined, "gameOver 时 resolveAction 不应继续推进");
  assert.equal(state.turn, "player", "gameOver 后 turn 不应变化");
}

// ---- 7. Campaign extraEnergyNext is consumed exactly once at next player begin-turn ----
{
  const state = startState({ campaign: true, round: 1, extraEnergyNext: true });
  state.campaign.extraEnergyNext = true;
  gameEngine.endTurn("player");
  const enemyEnergyBeforeEnd = state.enemy.energy;
  gameEngine.endTurn("enemy");
  assert.equal(state.campaign.extraEnergyNext, false, "兽王战意额外能量应消费一次");
  assert.ok(state.player.energy > 0, "player 新回合应有基础能量");
  assert.ok(enemyEnergyBeforeEnd > 0, "enemy 回合已有能量");
  assert.equal(state.campaign.passives.round, 2, "extraEnergyNext 不应影响 passive round 重置");
}

console.log("战役 turn transition 特征测试通过：沙盒/战役过渡、状态时序、召唤、game-over、重复结束与额外能量均符合当前行为。");
