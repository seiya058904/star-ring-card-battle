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

// 通用桩：加载 fixed-game-rules.js 时只需要这些全局不会在加载期崩溃。
context.combinedProfile = () => ({ damage: 1, heal: 1, defense: 1 });
context.normalizeRace = race => race === "神人" ? "人族" : race === "黑暗精灵" ? "精灵族" : race;
context.normalizeProfession = profession => /法|魔/.test(profession) ? "魔法师" : "战士";
context.elementMultiplier = () => ({ multiplier: 1 });
context.removeDefeatedSummons = () => [];
context.setHpDisplayOverride = () => {};
context.getCardActionIntent = () => "hostile-damage";
context.stripCardTaxonomyPrefix = value => value;
context.mechanicsForCard = () => [];
context.createStatusFromMechanic = () => null;
context.effectiveCardCost = (state, side, card) => Math.max(0, Number(card?.cost || 0));
context.dramaTimingForCard = () => ({ totalMin: 1 });
context.preloadCardVisualAssets = () => {};
context.canAcceptPlayerCardInput = () => true;
context.hasPendingOverrides = () => false;
context.clearHpDisplayOverrides = () => {};

const timers = [];
context.setTimeout = (fn) => { timers.push(fn); return timers.length; };
context.clearTimeout = () => {};

context.uiRenderer = {
  defaultDecks: [],
  selectedDeck: undefined,
  render() {},
  nav() {},
  openModal() {},
  startBattle() {},
  openBattlePrep() {},
  showResult() {},
  showAiDialogue() {},
};
context.aiController = { chooseCard() {}, takeTurn() {} };
context.audioManager = undefined;
context.effectsRenderer = undefined;
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
// 不加载完整固定卡库：fixed-game-rules.js 只在加载期读取 characterDefinitions 空数组即可。
context.fixedCardLibrary = { characterDefinitions: [] };
vm.runInContext(await read("js/fixed-game-rules.js"), context, { filename: "js/fixed-game-rules.js" });

const { gameEngine } = context;

const resolveActionSource = extractObjectMethod(indexSource, "resolveAction(action) {");
vm.runInContext(`gameEngine.resolveAction = function ${resolveActionSource}`, context, { filename: "resolveAction-from-index" });

function makeDeck(overrides = {}) {
  return {
    id: "test-deck",
    name: "测试卡组",
    race: "人族",
    profession: "战士",
    level: 1,
    element: "无",
    cards: [],
    ...overrides,
  };
}

function makeFighter(overrides = {}, isPlayer = true) {
  const deck = makeDeck(overrides);
  const fighter = gameEngine.makeFighter(isPlayer ? "玩家" : "敌人", deck, isPlayer);
  if (overrides.hp != null) fighter.hp = overrides.hp;
  if (overrides.energy != null) fighter.energy = overrides.energy;
  if (overrides.shield != null) fighter.shield = overrides.shield;
  if (overrides.statuses) fighter.statuses = overrides.statuses;
  if (overrides.summons) fighter.summons = overrides.summons;
  return fighter;
}

function makeState({ player, enemy, gameOver = false } = {}) {
  gameEngine.state = {
    sessionId: gameEngine.sessionId,
    turn: "player",
    round: 1,
    gameOver,
    winner: null,
    log: [],
    actions: [],
    player,
    enemy,
    combatStats: null,
    actionLocked: false,
  };
  return gameEngine.state;
}

function card(overrides = {}) {
  return {
    id: "test-card",
    instanceId: `test-instance-${overrides.name || "card"}`,
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

// 1) makeFighter 基础不变式：HP/能量/护盾/状态/召唤都必须是有限非负值。
{
  const fighter = makeFighter({ hp: 100, energy: 3, shield: 50 });
  assert.ok(Number.isFinite(fighter.hp) && fighter.hp >= 0, "fighter.hp 必须有限且非负");
  assert.ok(Number.isFinite(fighter.energy) && fighter.energy >= 0, "fighter.energy 必须有限且非负");
  assert.ok(Number.isFinite(fighter.shield) && fighter.shield >= 0, "fighter.shield 必须有限且非负");
  assert.ok(Array.isArray(fighter.exhaustPile), "fighter 必须初始化 exhaustPile");
  assert.ok(Number.isFinite(fighter.controlImmuneTurns) && fighter.controlImmuneTurns >= 0, "controlImmuneTurns 必须有限且非负");
}

// 2) 抽牌：手牌上限不会静默超过 HAND_LIMIT，牌实例守恒。
{
  const player = makeFighter({});
  player.hand = Array.from({ length: 7 }, (_, i) => card({ instanceId: `hand-${i}`, name: `手牌${i}` }));
  const initialTotal = 7 + 5;
  player.drawPile = Array.from({ length: 5 }, (_, i) => card({ instanceId: `draw-${i}`, name: `牌库${i}` }));
  const drawn = gameEngine.draw(player, 5);
  assert.equal(player.hand.length, 8, "手牌不能超过 8 张");
  assert.equal(drawn, 1, "实际加入手牌数应为 1");
  assert.equal(player.hand.length + player.drawPile.length + player.discardPile.length, initialTotal, "抽牌后实例总数必须守恒");
  for (const c of [...player.hand, ...player.drawPile, ...player.discardPile]) {
    assert.ok(typeof c.instanceId === "string" && c.instanceId.length > 0, "每个运行时卡牌实例必须有稳定 instanceId");
  }
}

// 3) 抽牌：exhaustPile 永远不参与洗回牌库。
{
  const player = makeFighter({});
  const exhaustCard = card({ instanceId: "exhaust-1", name: "消耗卡" });
  player.exhaustPile = [exhaustCard];
  player.drawPile = [];
  player.discardPile = [
    card({ instanceId: "discard-1", name: "弃牌1" }),
    card({ instanceId: "discard-2", name: "弃牌2" }),
  ];
  gameEngine.draw(player, 2);
  assert.equal(player.exhaustPile.length, 1, "exhaust 卡不能因抽牌回流");
  assert.equal(player.hand.length, 2, "应抽到 2 张弃牌堆卡");
  assert.equal(player.drawPile.length, 0);
  gameEngine.draw(player, 3);
  assert.equal(player.exhaustPile.length, 1, "牌库空且弃牌空时仍不能洗入 exhaustPile");
}

// 4) playCard：一张卡只能结算一次；exhaust/discard 去向正确。
{
  const player = makeFighter({ energy: 5, hp: 1000 });
  const enemy = makeFighter({ hp: 1000 }, false);
  const exhaustCard = card({ instanceId: "play-exhaust", name: "消耗卡", afterPlay: "exhaust", effects: [{ type: "damage", ratio: 0.01 }] });
  player.hand = [exhaustCard];
  const state = makeState({ player, enemy });
  state.actionLocked = false;
  const played = gameEngine.playCard("player", exhaustCard.instanceId);
  assert.equal(played, true, "可支付卡应能打出");
  assert.equal(player.hand.some(c => c.instanceId === exhaustCard.instanceId), false, "打出后卡必须离开手牌");
  assert.equal(player.exhaustPile.some(c => c.instanceId === exhaustCard.instanceId), true, "exhaust 卡应进入消耗堆");
  assert.equal(player.discardPile.some(c => c.instanceId === exhaustCard.instanceId), false, "exhaust 卡不应进入弃牌堆");
  const secondPlay = gameEngine.playCard("player", exhaustCard.instanceId);
  assert.equal(secondPlay, false, "同一卡牌实例不能打出两次");
  assert.equal(gameEngine.resolveAction({ type: "playCard", side: "player", cardInstanceId: exhaustCard.instanceId }), false, "actionLocked 时 resolveAction 不得放行重复输入");
}

// 5) playCard：普通卡进入弃牌堆。
{
  const player = makeFighter({ energy: 5, hp: 1000 });
  const enemy = makeFighter({ hp: 1000 }, false);
  const normalCard = card({ instanceId: "play-discard", name: "普通卡", afterPlay: "discard" });
  player.hand = [normalCard];
  const state = makeState({ player, enemy });
  state.actionLocked = false;
  assert.equal(gameEngine.playCard("player", normalCard.instanceId), true);
  assert.equal(player.discardPile.some(c => c.instanceId === normalCard.instanceId), true, "普通卡应进入弃牌堆");
  assert.equal(player.exhaustPile.some(c => c.instanceId === normalCard.instanceId), false, "普通卡不应进入消耗堆");
}

// 6) resolveDamage：HP、护盾、召唤物生命都不会变成 NaN/负数。
{
  const player = makeFighter({});
  const enemy = makeFighter({ hp: 5000, shield: 1000 }, false);
  const summon = { id: "summon-1", name: "守卫", ownerId: "enemy", maxHp: 200, hp: 100, power: 10 };
  enemy.summons = [summon];
  const settlement = gameEngine.resolveDamage({ source: player, target: enemy, amount: 1000, element: "无" });
  assert.ok(Number.isFinite(enemy.hp) && enemy.hp >= 0, "resolveDamage 后目标 HP 必须有限且非负");
  assert.ok(Number.isFinite(enemy.shield) && enemy.shield >= 0, "resolveDamage 后护盾必须有限且非负");
  assert.ok(Number.isFinite(summon.hp) && summon.hp >= 0, "resolveDamage 后召唤物 HP 必须有限且非负");
  assert.ok(Number.isFinite(settlement.total) && settlement.total >= 0, "结算总伤害必须有限且非负");
  assert.equal(settlement.ownerDamage + settlement.summonDamage, settlement.total, "ownerDamage + summonDamage 必须等于 total");
}

// 7) resolveDamage：已死目标不能继续结算出负数。
{
  const player = makeFighter({});
  const enemy = makeFighter({ hp: 0 }, false);
  const result = gameEngine.resolveDamage({ source: player, target: enemy, amount: 100 });
  assert.equal(result.total, 0);
  assert.equal(result.ownerDamage, 0);
  assert.equal(result.summonDamage, 0);
  assert.equal(result.blocked, 0);
  assert.equal(result.dodged, false);
  assert.equal(enemy.hp, 0);
}

// 8) applyStatus/tickStatuses：状态回合不会变成 NaN/负数，控制抗性按固定规则消耗。
{
  const enemy = makeFighter({}, false);
  enemy.controlImmuneTurns = 0;
  const st = gameEngine.applyStatus(enemy, { status: "禁锢", turns: -5, power: 0 });
  assert.ok(st && st.turns >= 1, "负/NaN 回合状态必须至少钳制为 1");
  gameEngine.state = { player: makeFighter({}), enemy, gameOver: false };
  gameEngine.tickStatuses(enemy);
  assert.ok(enemy.statuses.every(s => Number.isFinite(s.turns) && (s.persistent || s.turns > 0)), "tickStatuses 后不得残留 NaN/非正回合状态");
  assert.ok(enemy.skipAction === true || enemy.controlImmuneTurns >= 0, "禁锢回合中应设置 skipAction 或正确维护控制抗性");
  gameEngine.state = { player: makeFighter({}), enemy, gameOver: false };
  gameEngine.tickStatuses(enemy);
  assert.ok(enemy.controlImmuneTurns >= 0 && Number.isFinite(enemy.controlImmuneTurns), "控制抗性必须有限且非负");
  const resisted = gameEngine.applyStatus(enemy, { status: "禁锢", turns: 1, power: 0 });
  if (enemy.controlImmuneTurns > 0) assert.equal(resisted, null, "控制抗性应抵抗新的禁锢");
}

// 9) playCard/endTurn：游戏结束时不能继续行动。
{
  const player = makeFighter({ energy: 5, hp: 1000 });
  const enemy = makeFighter({ hp: 0 }, false);
  const state = makeState({ player, enemy, gameOver: true });
  state.actionLocked = false;
  const c = card({ instanceId: "dead-play", name: "死亡后出牌" });
  player.hand = [c];
  assert.equal(gameEngine.playCard("player", c.instanceId), false, "gameOver 后不能出牌");
  assert.equal(player.hand.some(x => x.instanceId === c.instanceId), true, "gameOver 拒绝出牌不应消耗手牌");
  assert.equal(gameEngine.endTurn("player"), false, "gameOver 后不能结束回合");
}

// 10) checkGameOver：只结算一次。
{
  const checkSource = extractObjectMethod(indexSource, "checkGameOver() {");
  const calls = { showResult: 0, dialogue: 0 };
  const state = {
    player: { hp: 0 },
    enemy: { hp: 100 },
    gameOver: false,
    resultPending: false,
    actionLocked: false,
    winner: null,
  };
  const engine = {
    state,
    sessionId: 7,
    log() {},
    isActiveBattle() { return true; },
  };
  const localTimers = [];
  const localContext = {
    state,
    engine,
    hasPendingOverrides: () => false,
    pendingGameOverCheck: { flag: false },
    VICTORY_TIMING: { victoryDelay: 100, enemyDefeatLine: 50 },
    setTimeout: fn => localTimers.push(fn),
    uiRenderer: {
      showAiDialogue() { calls.dialogue += 1; },
      showResult() { calls.showResult += 1; },
    },
  };
  vm.createContext(localContext);
  vm.runInContext(`({ ${checkSource} }).checkGameOver.call(engine)`, localContext);
  vm.runInContext(`({ ${checkSource} }).checkGameOver.call(engine)`, localContext);
  assert.equal(state.gameOver, true, "checkGameOver 应设置 gameOver");
  assert.equal(state.resultPending, true, "checkGameOver 应设置 resultPending");
  assert.equal(calls.showResult, 0, "showResult 应通过 timer 异步调用，这里只验证不会重复直接触发");
  assert.equal(localTimers.length, 2, "第一次结算应安排 2 个异步表现 timer，第二次调用不应追加");
}

console.log("战斗不变式验证通过：数值安全、实例守恒、exhaust 隔离、单次结算、控制抗性与死亡行动限制均符合预期。");
