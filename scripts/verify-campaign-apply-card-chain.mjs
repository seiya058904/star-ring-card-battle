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
context.effectiveCardCost = (state, side, card) => Math.max(0, Number(card?.cost || 0));
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

const { gameEngine, campaignMode, campaignData } = context;

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
  if (overrides.shield != null) fighter.shield = overrides.shield;
  if (overrides.race) fighter.race = overrides.race;
  if (overrides.statuses) fighter.statuses = overrides.statuses;
  if (overrides.summons) fighter.summons = overrides.summons;
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
    element: "无",
    effectType: "damage",
    afterPlay: "discard",
    mechanics: [],
    effects: [{ type: "damage", ratio: 0.01 }],
    power: 100,
    ...overrides,
  };
}

function startCampaignState(characterId, options = {}) {
  const player = makeFighter({ hp: options.playerHp ?? 5000, race: options.playerRace || "人族" }, true);
  const enemy = makeFighter({ hp: options.enemyHp ?? 5000, race: options.enemyRace || "人族" }, false);
  const campaign = {
    characterId,
    stage: options.stage ?? 1,
    difficulty: "normal",
    playerRing: options.playerRing ?? 0,
    enemyRing: options.enemyRing ?? 0,
    resonanceUsed: false,
    enemyResonanceUsed: false,
    costReduction: 0,
    enemyCostReduction: 0,
    intent: null,
    passiveTriggers: 0,
    passives: { turn: {}, match: {}, round: 1 },
  };
  gameEngine.state = {
    sessionId: gameEngine.sessionId,
    turn: "player",
    round: options.round ?? 1,
    gameOver: false,
    winner: null,
    log: [],
    actions: [],
    player,
    enemy,
    campaign,
    campaignStats: campaignMode.createCombatStats(),
    combatStats: campaignMode.createCombatStats(),
    actionLocked: false,
  };
  return gameEngine.state;
}

function freshTurn(state, characterId) {
  state.campaign.passives = { turn: {}, match: {}, round: state.round };
  state.campaign.passiveNoticeRound = {};
  state.campaign.characterId = characterId;
}

// ---- 1. Sandbox isolation: no campaign state, no campaign passive side effects ----
{
  const player = makeFighter({ hp: 5000 }, true);
  const enemy = makeFighter({ hp: 5000 }, false);
  gameEngine.state = {
    sessionId: gameEngine.sessionId,
    turn: "player",
    round: 1,
    gameOver: false,
    player,
    enemy,
    combatStats: campaignMode.createCombatStats(),
    actionLocked: false,
  };
  const card = makeCard({ element: "雷", effects: [{ type: "damage", ratio: 0.01 }] });
  const beforeHp = enemy.hp;
  const result = gameEngine.applyCard(player, enemy, card);
  assert.ok(result && result.amount > 0, "沙盒卡牌应正常结算");
  assert.ok(enemy.hp < beforeHp, "沙盒应造成伤害");
  assert.equal(gameEngine.state.campaign, undefined, "沙盒 state 不应有 campaign");
  assert.equal(card.effectMultiplier, undefined, "沙盒卡牌不应被战役倍率修改");
}

// ---- 2. Luolinfo player passive: before-base multiplier + after-base passive notice ----
{
  const state = startCampaignState("luolinfo");
  freshTurn(state, "luolinfo");
  const player = state.player;
  const enemy = state.enemy;
  const card = makeCard({ element: "雷", effects: [{ type: "damage", ratio: 0.01 }] });
  const beforeHp = enemy.hp;
  const result = gameEngine.applyCard(player, enemy, card);
  assert.ok(result.amount > 0, "罗林福雷卡应造成伤害");
  assert.ok(beforeHp - enemy.hp >= result.amount, "伤害数值与 HP 扣减一致");
  assert.equal(state.campaign.passives.turn.luolinfo, true, "罗林福回合被动应消耗");
  assert.equal(state.campaignStats.passiveTriggers, 1, "被动触发计数应 +1");
  assert.equal(state.campaign.passiveNoticeRound?.luolinfo, state.round, "罗林福被动提示轮次应记录");
  assert.equal(card.effectMultiplier, undefined, "倍率应恢复为原值");
}

// ---- 3. Eluxia player passive: extra draw after base ----
{
  const state = startCampaignState("eluxia");
  freshTurn(state, "eluxia");
  const player = state.player;
  const enemy = state.enemy;
  player.drawPile = [makeCard({ instanceId: "eluxia-draw-1", name: "抽牌1" })];
  player.hand = [];
  const card = makeCard({ element: "冰", effects: [{ type: "damage", ratio: 0.01 }] });
  gameEngine.applyCard(player, enemy, card);
  assert.equal(state.campaign.passives.turn.eluxia, true, "艾露希娅回合被动应消耗");
  assert.equal(player.hand.length, 1, "艾露希娅冰/风卡应额外抽 1 张牌");
  assert.equal(state.campaignStats.passiveTriggers, 1, "被动触发计数应 +1");
}

// ---- 4. Su player passive: light/dark/thunder damage + notice ----
{
  const state = startCampaignState("su");
  freshTurn(state, "su");
  const player = state.player;
  const enemy = state.enemy;
  const card = makeCard({ element: "暗", effects: [{ type: "damage", ratio: 0.01 }] });
  gameEngine.applyCard(player, enemy, card);
  assert.equal(state.campaign.passives.turn.su, true, "苏回合被动应消耗");
  assert.equal(state.campaignStats.passiveTriggers, 1, "苏被动触发计数应 +1");
  assert.equal(state.campaign.passiveNoticeRound?.su, state.round, "苏被动提示轮次应记录");
}

// ---- 5. Su enemy passive: enemy-created negative status is removed once ----
{
  const state = startCampaignState("su");
  freshTurn(state, "su");
  const player = state.player;
  const enemy = state.enemy;
  const negativeCard = makeCard({
    effectType: "status",
    effects: [{ type: "status", status: "虚弱", ratio: 0.01, turns: 2 }],
  });
  gameEngine.applyCard(enemy, player, negativeCard);
  assert.equal(player.statuses.some(s => s.type === "虚弱"), false, "苏应免疫敌方新施加的负面状态");
  assert.equal(state.campaign.passives.match.su, true, "苏 match 被动应消耗");
  assert.equal(state.campaignStats.passiveTriggers, 1, "苏敌方被动应计数");
}

// ---- 6. Lisaya threshold: crossing below 35% triggers heal+shield exactly once ----
{
  const state = startCampaignState("lisaya", { playerHp: 2000 });
  freshTurn(state, "lisaya");
  const player = state.player;
  player.maxHp = 2000;
  player.hp = 800; // 40%
  const enemy = state.enemy;
  const card = makeCard({ effects: [{ type: "damage", ratio: 2.5 }] });
  gameEngine.applyCard(enemy, player, card);
  assert.ok(player.hp > 0, "丽莎娅阈值被动应防止直接死亡");
  assert.equal(state.campaign.passives.match.lisaya, true, "丽莎娅 match 被动应消耗");
  assert.ok(state.campaignStats.passiveTriggers >= 1, "丽莎娅被动应计数");
  const shield = player.shield;
  assert.ok(shield > 0, "丽莎娅阈值被动应提供护盾");
}

// ---- 7. Boss phase: stage 5 Yemosu crossing below 50% triggers once and grants enemy ring ----
{
  const state = startCampaignState("su", { stage: 5, enemyHp: 520 });
  freshTurn(state, "su");
  const player = state.player;
  const enemy = state.enemy;
  enemy.name = "耶莫稣";
  enemy.hp = 520; // 52%
  enemy.maxHp = 1000;
  enemy.statuses = [{ type: "禁锢", turns: 1, power: 0 }];
  const card = makeCard({ effects: [{ type: "damage", ratio: 0.3 }] });
  gameEngine.applyCard(player, enemy, card);
  assert.equal(state.campaign.bossPhaseTriggered, true, "Boss 阶段应触发");
  assert.equal(state.campaign.enemyRing, 2, "Boss 阶段应给敌方 2 格星环");
  assert.equal(enemy.statuses.some(s => s.type === "禁锢"), false, "Boss 阶段应净化控制状态");
  assert.equal(state.campaign.intent, null, "Boss 阶段应清空意图");
}

// ---- 8. Single execution: one applyCard call must not duplicate base effects ----
{
  const state = startCampaignState("luolinfo");
  freshTurn(state, "luolinfo");
  const player = state.player;
  const enemy = state.enemy;
  enemy.hp = 5000;
  const card = makeCard({ element: "雷", effects: [{ type: "damage", ratio: 0.1 }] });
  const beforeHp = enemy.hp;
  const result = gameEngine.applyCard(player, enemy, card);
  const lostHp = beforeHp - enemy.hp;
  assert.ok(lostHp > 0, "卡牌应造成伤害");
  assert.equal(lostHp, result.amount, "单次 applyCard 不应重复结算伤害");
}

console.log("战役 applyCard 集成边界特征测试通过：沙盒隔离、玩家/敌方被动、Boss 阶段、单次结算均符合当前行为。");
