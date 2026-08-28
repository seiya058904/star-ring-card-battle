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

const { gameEngine, campaignMode } = context;

// 计数 applyCard 到达次数：这是测试观察点，不改生产逻辑。
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
  return fighter;
}

function makeCard(overrides = {}) {
  return {
    id: "test-card",
    instanceId: "test-card-instance",
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
  const player = makeFighter({ hp: 5000, energy: options.energy ?? 5 }, true);
  const enemy = makeFighter({ hp: 5000, energy: 5 }, false);
  const state = {
    sessionId: gameEngine.sessionId,
    turn: "player",
    round: 1,
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
      resonanceUsed: false,
      enemyResonanceUsed: false,
      costReduction: options.costReduction ?? 0,
      enemyCostReduction: options.enemyCostReduction ?? 0,
      intent: null,
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

// ---- 1. Sandbox isolation: normal play does not create campaign state ----
{
  resetApplyCounter();
  const state = startState({ campaign: false, energy: 5 });
  const card = makeCard({ cost: 2 });
  state.player.hand = [card];
  const result = gameEngine.playCard("player", card.instanceId);
  assert.equal(result, true, "沙盒可支付卡应成功");
  assert.equal(state.player.energy, 3, "沙盒应按原费用扣能量");
  assert.equal(state.player.hand.some(c => c.instanceId === card.instanceId), false, "沙盒成功出牌应移出手牌");
  assert.equal(state.player.discardPile.some(c => c.instanceId === card.instanceId), true, "普通卡应进入弃牌堆");
  assert.equal(state.campaign, undefined, "沙盒不应创建 campaign");
  assert.equal(applyCalls, 1, "沙盒 applyCard 应恰好执行一次");
  assert.equal(state.combatStats.cards, 1, "沙盒应记录使用卡牌一次");
}

// ---- 2. Sandbox rejected play: no energy/card/stat mutation ----
{
  resetApplyCounter();
  const state = startState({ campaign: false, energy: 0 });
  const card = makeCard({ cost: 2 });
  state.player.hand = [card];
  const before = state.combatStats.cards;
  const result = gameEngine.playCard("player", card.instanceId);
  assert.equal(result, false, "能量不足应拒绝");
  assert.equal(state.player.energy, 0, "拒绝出牌不应扣能量");
  assert.equal(state.player.hand.some(c => c.instanceId === card.instanceId), true, "拒绝出牌应保留手牌");
  assert.equal(state.combatStats.cards, before, "拒绝出牌不应增加统计");
  assert.equal(applyCalls, 0, "拒绝出牌不应到达 applyCard");
}

// ---- 3. Normal campaign play: ring increment, stats, single apply ----
{
  resetApplyCounter();
  const state = startState({ characterId: "luolinfo", energy: 5 });
  const card = makeCard({ cost: 2, category: "skill", skillTier: "advanced", tier: "advanced" });
  state.player.hand = [card];
  const result = gameEngine.playCard("player", card.instanceId);
  assert.equal(result, true, "战役可支付卡应成功");
  assert.equal(state.player.energy, 3, "战役应按费用扣能量");
  assert.equal(state.player.hand.some(c => c.instanceId === card.instanceId), false, "战役成功出牌应移出手牌");
  assert.equal(state.player.discardPile.some(c => c.instanceId === card.instanceId), true, "战役普通卡应进入弃牌堆");
  assert.equal(state.campaign.playerRing, 2, "高级卡应增加 2 格星环");
  assert.equal(state.combatStats.cards, 1, "战役应记录使用卡牌一次");
  assert.equal(state.combatStats.advanced, 1, "战役应记录高级卡一次");
  assert.equal(applyCalls, 1, "战役 applyCard 应恰好执行一次");
}

// ---- 4. Resonance discount: discounted playable card consumes discount once ----
{
  resetApplyCounter();
  const state = startState({ characterId: "luolinfo", energy: 3, costReduction: 2 });
  const card = makeCard({ cost: 5, category: "skill", skillTier: "special", tier: "special" });
  state.player.hand = [card];
  const result = gameEngine.playCard("player", card.instanceId);
  assert.equal(result, true, "减费后应可支付");
  assert.equal(state.player.energy, 0, "应按有效费用 3 扣能量");
  assert.equal(state.campaign.costReduction, 0, "成功后应消费星耀减费");
  assert.equal(state.campaign.playerRing, 3, "特殊卡应增加 3 格星环");
  assert.equal(state.combatStats.special, 1, "特殊卡统计应增加一次");
  assert.equal(applyCalls, 1, "减费成功仍应只到达一次 applyCard");
}

// ---- 5. Resonance discount: zero-cost outcome ----
{
  resetApplyCounter();
  const state = startState({ characterId: "luolinfo", energy: 0, costReduction: 2 });
  const card = makeCard({ cost: 1, category: "base" });
  state.player.hand = [card];
  const result = gameEngine.playCard("player", card.instanceId);
  assert.equal(result, true, "减费到 0 应可支付");
  assert.equal(state.player.energy, 0, "0 费卡不应扣能量");
  assert.equal(state.campaign.costReduction, 0, "0 费成功后也应消费减费");
  assert.equal(applyCalls, 1, "0 费卡仍应执行一次 applyCard");
}

// ---- 6. Resonance discount: still insufficient after discount ----
{
  resetApplyCounter();
  const state = startState({ characterId: "luolinfo", energy: 2, costReduction: 2 });
  const card = makeCard({ cost: 5 });
  state.player.hand = [card];
  const result = gameEngine.playCard("player", card.instanceId);
  assert.equal(result, false, "减费后仍能量不足应拒绝");
  assert.equal(state.campaign.costReduction, 2, "拒绝出牌不应消费减费");
  assert.equal(state.campaign.playerRing, 0, "拒绝出牌不应增加星环");
  assert.equal(state.player.hand.some(c => c.instanceId === card.instanceId), true, "拒绝出牌应保留手牌");
  assert.equal(applyCalls, 0, "拒绝出牌不应到达 applyCard");
}

// ---- 7. Elemental advantage: campaign and sandbox both record once ----
{
  context.cardHasAdvantageAgainst = () => true;
  try {
    resetApplyCounter();
    const state = startState({ characterId: "luolinfo", energy: 5 });
    const card = makeCard({ cost: 1 });
    state.player.hand = [card];
    gameEngine.playCard("player", card.instanceId);
    assert.equal(state.combatStats.elementalAdvantage, 1, "战役元素克制应记录一次");

    resetApplyCounter();
    const sandbox = startState({ campaign: false, energy: 5 });
    const card2 = makeCard({ cost: 1 });
    sandbox.player.hand = [card2];
    gameEngine.playCard("player", card2.instanceId);
    assert.equal(sandbox.combatStats.elementalAdvantage, 1, "沙盒元素克制统计当前也应记录一次");
  } finally {
    context.cardHasAdvantageAgainst = () => false;
  }
}

// ---- 8. Elemental advantage: neutral card does not record ----
{
  const state = startState({ characterId: "luolinfo", energy: 5 });
  const card = makeCard({ cost: 1 });
  state.player.hand = [card];
  gameEngine.playCard("player", card.instanceId);
  assert.equal(state.combatStats.elementalAdvantage, 0, "无克制不应记录元素统计");
}

// ---- 9. Rejected plays: action locked / invalid / game over ----
{
  resetApplyCounter();
  const state = startState({ characterId: "luolinfo", energy: 5 });
  const card = makeCard({ cost: 1 });
  state.player.hand = [card];
  state.actionLocked = true;
  assert.equal(gameEngine.playCard("player", card.instanceId), false, "actionLocked 应拒绝");
  assert.equal(state.player.hand.some(c => c.instanceId === card.instanceId), true, "actionLocked 拒绝应保留手牌");
  assert.equal(state.combatStats.cards, 0, "actionLocked 拒绝不应增加统计");
  state.actionLocked = false;
  assert.equal(gameEngine.playCard("player", "missing-instance"), false, "无效实例应拒绝");
  state.gameOver = true;
  assert.equal(gameEngine.playCard("player", card.instanceId), false, "gameOver 应拒绝");
  assert.equal(applyCalls, 0, "所有拒绝路径都不应到达 applyCard");
}

// ---- 10. Enemy play: enemy ring and enemy discount consumed, no player stat ----
{
  resetApplyCounter();
  const state = startState({ characterId: "luolinfo", enemyRing: 4, enemyCostReduction: 2, energy: 5 });
  state.turn = "enemy";
  const card = makeCard({ cost: 2 });
  state.enemy.hand = [card];
  state.enemy.energy = 5;
  const result = gameEngine.playCard("enemy", card.instanceId);
  assert.equal(result, true, "敌方可支付卡应成功");
  assert.equal(state.campaign.enemyRing, 5, "敌方普通卡应增加 1 格星环");
  assert.equal(state.campaign.enemyCostReduction, 0, "敌方成功后应消费敌方减费");
  assert.equal(state.combatStats.elementalAdvantage, 0, "敌方出牌不应增加玩家元素统计");
  assert.equal(applyCalls, 1, "敌方出牌也应只到达一次 applyCard");
}

console.log("战役 playCard 集成边界特征测试通过：沙盒隔离、正常出牌、减费、元素统计、拒绝路径与实例守恒均符合当前行为。");
