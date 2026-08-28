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
