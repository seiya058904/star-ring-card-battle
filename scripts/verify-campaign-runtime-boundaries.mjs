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
context.setTimeout = () => 0;
context.clearTimeout = () => {};

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

let drawSoundCount = 0;
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
    const level = Number(deck?.level) || 1;
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
  if (overrides.statuses) fighter.statuses = overrides.statuses;
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
  const player = makeFighter({ hp: options.playerHp ?? 5000, race: options.playerRace || "人族" }, true);
  const enemy = makeFighter({ hp: options.enemyHp ?? 5000 }, false);
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
      characterId: options.characterId || "heka",
      stage: options.stage ?? 1,
      difficulty: "normal",
      playerRing: 0,
      enemyRing: options.enemyRing ?? 0,
      resonanceUsed: false,
      enemyResonanceUsed: false,
      costReduction: 0,
      enemyCostReduction: 0,
      intent: null,
      passiveTriggers: 0,
      passives: { turn: {}, match: {}, round: 1 },
    };
    state.campaignStats = campaignMode.createCombatStats();
  }
  gameEngine.state = state;
  return state;
}

// ---- 1. Sandbox tick isolation ----
{
  const state = startState({ campaign: false, enemyHp: 1000 });
  state.enemy.hp = 1000;
  state.enemy.statuses = [{ type: "燃烧", turns: 2, power: 50, sourceOwnerId: "player", source: "测试" }];
  const result = gameEngine.tickStatuses(state.enemy);
  assert.equal(result.totalDamage, 50, "沙盒状态 tick 应按基础规则造成 DoT");
  assert.equal(state.enemy.hp, 950, "沙盒状态 tick 应扣血");
  assert.equal(state.campaign, undefined, "沙盒状态 tick 不应创建 campaign 状态");
}

// ---- 2. Campaign tick: Heka passive heals from player-origin DoT on enemy ----
{
  const state = startState({ campaign: true, characterId: "heka", enemyHp: 1000 });
  state.enemy.hp = 1000;
  state.enemy.statuses = [{ type: "燃烧", turns: 2, power: 100, sourceOwnerId: "player", source: "测试" }];
  state.player.hp = 500;
  state.player.maxHp = 5000;
  const beforePlayerHp = state.player.hp;
  const result = gameEngine.tickStatuses(state.enemy);
  assert.equal(result.playerDotDamage, 100, "Heka 被动应读取玩家来源 DoT 伤害");
  assert.ok(state.player.hp > beforePlayerHp, "Heka 被动应从敌方 DoT 中吸血治疗玩家");
  assert.ok(state.combatStats.passiveTriggers >= 1, "Heka 被动应增加 passiveTriggers");
  assert.equal(state.enemy.hp, 900, "DoT 仍应正常扣减敌方生命");
}

// ---- 3. Campaign tick: boss phase can trigger from status damage ----
{
  const state = startState({ campaign: true, characterId: "su", stage: 5, enemyHp: 520 });
  state.enemy.name = "耶莫稣";
  state.enemy.maxHp = 1000;
  state.enemy.hp = 520;
  state.enemy.statuses = [{ type: "燃烧", turns: 2, power: 100, sourceOwnerId: "player", source: "测试" }];
  const result = gameEngine.tickStatuses(state.enemy);
  assert.equal(result.totalDamage, 100, "Boss 阶段前 DoT 应正常结算");
  assert.equal(state.campaign.bossPhaseTriggered, true, "状态 tick 导致 Boss 血量低于阈值应触发阶段");
  assert.equal(state.campaign.enemyRing, 2, "Boss 阶段应增加 2 格敌方星环");
}

// ---- 4. Campaign tick after lethal status: post-processing still runs per current contract ----
{
  const state = startState({ campaign: true, characterId: "heka", enemyHp: 50 });
  state.enemy.hp = 50;
  state.enemy.statuses = [{ type: "燃烧", turns: 2, power: 100, sourceOwnerId: "player", source: "测试" }];
  const result = gameEngine.tickStatuses(state.enemy);
  assert.equal(result.totalDamage, 50, "致命 DoT 应只结算到剩余生命");
  assert.equal(state.enemy.hp, 0, "DoT 应击杀 enemy");
  // 当前 tickStatuses 包装不自行调用 checkGameOver；gameOver 由 beginTurn 在 tick 后处理。
  assert.equal(state.gameOver, false, "tickStatuses 本身不应直接设置 gameOver");
}

// ---- 5. Sandbox draw: hand cap / recycle / exhaust isolation ----
{
  const state = startState({ campaign: false });
  const player = state.player;
  player.hand = Array.from({ length: 7 }, (_, i) => makeCard({ instanceId: `h${i}` }));
  player.drawPile = Array.from({ length: 5 }, (_, i) => makeCard({ instanceId: `d${i}` }));
  const drawn = gameEngine.draw(player, 5);
  assert.equal(drawn, 1, "沙盒抽牌应受手牌上限约束");
  assert.equal(player.hand.length, 8, "手牌不能超过 8");
  assert.equal(player.hand.length + player.drawPile.length + player.discardPile.length, 12, "抽牌后实例应守恒");
}

// ---- 6. Draw audio: actual draw only ----
{
  drawSoundCount = 0;
  context.audioManager.play = event => { if (event === "card-draw") drawSoundCount += 1; };
  const state = startState({ campaign: true, characterId: "luolinfo" });
  const player = state.player;
  player.hand = [];
  player.drawPile = [makeCard({ instanceId: "a1" })];
  gameEngine.draw(player, 1);
  assert.equal(drawSoundCount, 1, "实际抽到牌时应播放抽牌音效");
  player.hand = Array.from({ length: 8 }, (_, i) => makeCard({ instanceId: `full${i}` }));
  player.drawPile = [makeCard({ instanceId: "a2" })];
  gameEngine.draw(player, 1);
  assert.equal(drawSoundCount, 1, "手牌已满导致零实际抽牌时不应播放抽牌音效");
}

// ---- 7. Draw recycle: discard reshuffles, exhaust never returns ----
{
  const state = startState({ campaign: true, characterId: "luolinfo" });
  const player = state.player;
  player.hand = [];
  player.drawPile = [];
  player.discardPile = [makeCard({ instanceId: "r1" }), makeCard({ instanceId: "r2" })];
  player.exhaustPile = [makeCard({ instanceId: "ex1" })];
  gameEngine.draw(player, 2);
  assert.equal(player.hand.length, 2, "弃牌堆应洗回并抽到 2 张");
  assert.equal(player.exhaustPile.length, 1, "exhaustPile 不应参与洗回");
}

console.log("战役 runtime boundaries 特征测试通过：tickStatuses 与 draw 的沙盒隔离、战役被动、Boss、音效与实例守恒均符合当前行为。");
