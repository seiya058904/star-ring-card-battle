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
// index.html 的完整动作时间缩放入口：标准档位下等价于原值。
context.scaledDramaMs = ms => Math.round(Number(ms) || 0);
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

// Issue #6–#9: real fixed cards, independent numerical expectations.
for (const name of ["DEFAULT_CHARACTER_TEMPLATES", "DEFAULT_SKILL_NAMES"]) {
  const declaration = indexSource.match(new RegExp(`const ${name} = [\\s\\S]*?\\n    [\\]\\}];`))[0];
  vm.runInContext(`${declaration}; globalThis.${name} = ${name};`, context);
}
vm.runInContext(await read("js/fixed-card-library.js"), context);
const runtimeCards = context.fixedCardLibrary.characterDefinitions.flatMap(c => context.fixedCardLibrary.createRuntimeDeck(c.id).cards);
const fixedCard = name => structuredClone(runtimeCards.find(c => c.baseName === name || c.name === name));
const failures = [];
function regression(name, run) {
  try { run(); } catch (error) { failures.push(`${name}: ${error.message}`); }
}
function neutral(characterId) {
  const state = startCampaignState(characterId || "none");
  if (!characterId) delete state.campaign;
  for (const fighter of [state.player, state.enemy]) {
    Object.assign(fighter, { level: 50, hp: 500000, maxHp: 500000, race: "中立", energy: 10, talentUsed: true, profile: { damage: 1, heal: 1, defense: 1 } });
  }
  context.elementMultiplier = () => ({ multiplier: 1 });
  return state;
}
function hit(state, card = fixedCard("普通攻击")) {
  return gameEngine.applyCard(state.player, state.enemy, card).visualAmounts.filter(item => item.type === "damage").reduce((sum, item) => sum + item.amount, 0);
}
for (const [type, side, expected] of [["增幅", "player", 13200], ["连锁", "player", 13200], ["虚弱", "enemy", 13200], ["减伤", "enemy", 9600]]) {
  regression(`#6 ${type}`, () => {
    const state = neutral();
    state[side].statuses = [{ type, unit: "fixed", power: 1800, turns: 2, charges: 1 }];
    assert.equal(hit(state), expected);
    assert.equal(state[side].statuses.length, 0);
    assert.equal(hit(state), 11400);
  });
}
regression("#6 units and fixed-card compatibility", () => {
  const state = neutral();
  gameEngine.applyStatus(state.enemy, { status: "减伤", unit: "fixed", power: 1800, turns: 2, charges: 2 });
  gameEngine.applyStatus(state.enemy, { status: "减伤", unit: "fixed", power: 900, turns: 3, charges: 3 });
  gameEngine.applyStatus(state.enemy, { status: "减伤", unit: "ratio", power: .1, turns: 2 });
  assert.equal(state.enemy.statuses.length, 2);
  assert.equal(hit(state), 8460);
});
regression("#6 level scaling and elemental order", () => {
  for (const level of [1, 50, 100]) for (const points of [2, 1800, 9000]) {
    const state = neutral(); state.player.level = level;
    state.enemy.hp = state.enemy.maxHp = 1e15;
    state.player.statuses = [{ type: "增幅", unit: "fixed", power: points, turns: 2 }];
    assert.equal(hit(state), Math.round(context.levelHp(level) * .0228) + points);
  }
  for (const [element, multiplier, expected] of [["火", 1.2, 11520], ["冰", .8, 7680]]) {
    const state = neutral();
    context.elementMultiplier = () => ({ multiplier });
    state.enemy.statuses = [{ type: "减伤", unit: "fixed", power: 1800, turns: 2 }];
    assert.equal(hit(state, { ...fixedCard("普通攻击"), element }), expected);
  }
});
for (const [multiplier, expected] of [[.9, 10260], [1, 11400], [1.06, 12084], [1.15, 13110]]) regression(`#7 multiplier ${multiplier}`, () => {
  assert.equal(hit(neutral(), { ...fixedCard("普通攻击"), effectMultiplier: multiplier }), expected);
});
regression("#7 each damage effect", () => {
  const card = fixedCard("普通攻击");
  card.effects = [{ type: "shield", amount: 700 }, { type: "damage", amount: 1000 }, { type: "damage", amount: 2000 }];
  assert.equal(hit(neutral(), card), 3000);
});
for (const [id, factor, element] of [["luolinfo", 1.15, "雷"], ["su", 1.1, "光"], ["moluo", 1.12, "火"]]) regression(`#7 ${id} damage-only`, () => {
  const candidates = runtimeCards.filter(c => c.effects.some(e => e.type === "damage") && c.effects.some(e => ["shield", "heal", "status"].includes(e.type)));
  for (const kind of ["shield", "heal", "status"]) {
    // Current runtime decks have damage+shield/status, but no damage+heal card.
    // Compose the latter from actual fixed attack/heal effects to cover that interface.
    const source = kind === "heal" ? { ...fixedCard("普通攻击"), effects: [...fixedCard("普通攻击").effects, ...fixedCard("急救").effects] } : candidates.find(c => c.effects.some(e => e.type === kind));
    assert.ok(source, `复合牌 ${kind}`);
    const run = enabled => {
      const state = neutral(id); state.player.hp = 200000;
      if (!enabled) { state.campaign.characterId = "none"; }
      const card = { ...structuredClone(source), element, effectMultiplier: 1.06 };
      const result = hit(state, card);
      assert.equal(card.effectMultiplier, 1.06);
      assert.equal(card.damageMultiplier, undefined);
      return { result, hp: state.player.hp, shield: state.player.shield, statuses: JSON.stringify([state.player.statuses, state.enemy.statuses]) };
    };
    const base = run(false), boosted = run(true);
    assert.equal(boosted.result, Math.round(base.result * factor));
    assert.equal(boosted.hp, base.hp); assert.equal(boosted.shield, base.shield); assert.equal(boosted.statuses, base.statuses);
  }
});
regression("#8 talents and mechanics isolation", () => {
  let state = neutral(); state.player.race = "兽人族"; state.player.hp = 200000;
  assert.equal(hit(state), 12768);
  state = neutral(); state.player.race = "恶魔"; state.player.hp = 200000;
  const card = fixedCard("普通攻击"), mechanics = JSON.stringify(card.mechanics);
  assert.equal(hit(state, card), 11400); assert.equal(state.player.hp, 203192); assert.equal(JSON.stringify(card.mechanics), mechanics);
  state.player.hp = 499999; hit(state, card); assert.equal(state.player.hp, 500000);
  state.player.hp = 200000; state.enemy.shield = 100000; hit(state, card); assert.equal(state.player.hp, 200000);
  state = neutral(); state.enemy.race = "精灵族"; state.enemy.turnFlags.firstHit = true;
  assert.equal(hit(state), 10032); assert.equal(state.enemy.turnFlags.firstHit, false); assert.equal(hit(state), 11400);
  gameEngine.beginTurn("enemy"); assert.equal(state.enemy.turnFlags.firstHit, true);
  state = neutral(); state.enemy.race = "精灵族"; state.enemy.turnFlags.firstHit = true;
  hit(state, fixedCard("格挡")); hit(state, fixedCard("急救")); hit(state, fixedCard("战术调整"));
  assert.equal(state.enemy.turnFlags.firstHit, true);
});
regression("#8 unchanged race modifiers", () => {
  for (const [race, expected] of [["龙族", 10488], ["黑暗精灵", 11970], ["神人", 10260]]) {
    const state = neutral(); state.enemy.race = race;
    assert.equal(hit(state, { ...fixedCard("普通攻击"), element: "火" }), expected);
  }
  const state = neutral(); state.player.race = "神人"; assert.equal(hit(state), 12540);
});
regression("#9 real playCard resource accounting", () => {
  for (const name of ["战术调整", "魔力恢复"]) for (const race of ["中立", "精灵族"]) {
    const state = neutral(), card = fixedCard(name); state.player.race = race;
    state.player.energy = 4 + card.cost; state.player.hand = [card];
    state.player.drawPile = Array.from({ length: 8 }, (_, i) => ({ ...fixedCard("普通攻击"), instanceId: `draw-${i}` }));
    assert.equal(gameEngine.playCard("player", card.instanceId), true);
    assert.equal(state.player.energy, name === "魔力恢复" ? 5 : 4);
    assert.equal(state.player.hand.length, (name === "魔力恢复" ? 1 : 2) + (race === "精灵族" ? 1 : 0));
  }
});
regression("#6 combined flat effects, shield, pierce and summon sharing", () => {
  const state = neutral();
  state.player.statuses = ["增幅", "连锁"].map(type => ({ type, unit: "fixed", power: 1800, turns: 2, charges: 1 }));
  state.enemy.statuses = ["虚弱", "减伤"].map(type => ({ type, unit: "fixed", power: 1800, turns: 2, charges: 1 }));
  state.enemy.shield = 20000;
  state.enemy.summons = [{ name: "护卫", hp: 10000, maxHp: 10000 }];
  const card = fixedCard("普通攻击");
  card.effects[0].pierceAmountRatio = .0114; // half of this damage effect's .0228 ratio
  const result = gameEngine.applyCard(state.player, state.enemy, card);
  // 11400 + 3*1800 - 1800 = 15000; half bypasses, then half of 7500 goes to the guard.
  assert.equal(result.amount, 7500);
  assert.equal(state.enemy.hp, 496250); assert.equal(state.enemy.summons[0].hp, 6250); assert.equal(state.enemy.shield, 12500);
  assert.equal(state.player.statuses.length + state.enemy.statuses.length, 0);
});
regression("#8 DOT/summon do not gain attack talents", () => {
  const state = neutral(); state.player.race = "恶魔"; state.player.hp = 200000;
  state.enemy.race = "精灵族"; state.enemy.turnFlags.firstHit = true;
  for (const sourceKind of ["dot", "summon"]) {
    assert.equal(gameEngine.resolveDamage({ source: state.player, target: state.enemy, amount: 1000, sourceKind }).total, 1000);
    assert.equal(state.player.hp, 200000); assert.equal(state.enemy.turnFlags.firstHit, true);
  }
  state.enemy.statuses = [{ type: "减伤", unit: "fixed", power: 500, turns: 1, charges: 1 }];
  gameEngine.tickStatuses(state.enemy);
  assert.equal(state.enemy.statuses.length, 0, "过期状态不参与结算");
});
regression("#9 draw/energy boundaries", () => {
  for (const race of ["中立", "精灵族"]) for (const amount of [0, 1, 2]) for (const energy of [false, true]) {
    const state = neutral(); state.player.race = race; state.player.energy = 9;
    const card = fixedCard("战术调整");
    card.effects = [{ type: "draw", amount }, ...(energy ? [{ type: "energy", amount: 1 }] : [])];
    state.player.hand = Array.from({ length: 8 }, (_, i) => ({ ...fixedCard("普通攻击"), instanceId: `full-${i}` }));
    state.player.drawPile = [fixedCard("普通攻击")];
    hit(state, card);
    assert.equal(state.player.hand.length, 8); assert.equal(state.player.energy, energy ? 10 : 9);
    assert.equal(state.player.hand.length + state.player.drawPile.length + state.player.discardPile.length, 9);
    state.player.hand = []; state.player.drawPile = []; state.player.discardPile = [];
    hit(state, card); assert.equal(state.player.hand.length, 0); assert.equal(state.player.energy, energy ? 10 : 9);
  }
});
assert.deepEqual(failures, [], failures.join("\n"));
console.log("Issue #6–#9 数值及资源合同回归通过。");
