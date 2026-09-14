import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// R03 回归（集成）：召唤协击造成的生命变化必须真正驱动战役阈值检查——
// 丽莎娅低血被动（胜利圣仪）与第五关首领阶段（耶莫稣第二阶段）都要在协击跨阈值时触发，
// 且同一次生命变化不得被重复计一次。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const indexSource = await read("index.html");

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`无法从 index.html 定位函数：${name}`);
  let index = src.indexOf("{", start);
  let depth = 0;
  for (; index < src.length; index += 1) {
    if (src[index] === "{") depth += 1;
    else if (src[index] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, index + 1);
    }
  }
  throw new Error(`无法提取 ${name}`);
}

function extractObjectMethod(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`无法定位方法：${signature}`);
  let index = src.indexOf("{", start);
  let depth = 0;
  for (; index < src.length; index += 1) {
    if (src[index] === "{") depth += 1;
    else if (src[index] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, index + 1);
    }
  }
  throw new Error(`无法提取方法：${signature}`);
}

const context = {
  console, Math, Date, JSON, Number, String, Array, Object, Set, Map, Promise, RegExp, Error,
  isFinite, parseInt, parseFloat, Boolean, setTimeout, clearTimeout,
};
vm.createContext(context);

const helpers = ["deterministicId", "shuffle", "clamp", "safeNumber", "levelHp", "formatNumber", "resolveEffectAmount", "resolveCardEffectAmount", "getCardPrimaryPower", "shareOwnerDamageWithSummon"]
  .map(name => extractFunction(indexSource, name)).join("\n\n");
vm.runInContext(helpers, context, { filename: "helpers-from-index" });

context.combinedProfile = () => ({ damage: 1, heal: 1, defense: 1 });
context.normalizeRace = race => race;
context.normalizeProfession = profession => profession;
context.elementMultiplier = () => ({ multiplier: 1 });
context.removeDefeatedSummons = () => [];
context.setHpDisplayOverride = () => {};
context.clearHpDisplayOverrides = () => {};
context.hasPendingOverrides = () => false;
context.setCombatInputLocked = () => {};
context.resetBattleViewTransform = () => {};
context.pendingGameOverCheck = { flag: false };
context.getCardActionIntent = () => "hostile-damage";
context.stripCardTaxonomyPrefix = value => value;
context.mechanicsForCard = () => [];
context.createStatusFromMechanic = () => null;
context.preloadCardVisualAssets = () => {};
context.effectsRenderer = { _playLock: 0, play() {}, showSummonAssistAttack() {} };
context.audioManager = { play() {}, playCard() {}, stop() {} };
context.uiRenderer = { render() {}, nav() {}, showResult() {}, showAiDialogue() {}, openModal() {}, closeModal() {}, openBattlePrep() {}, startBattle() {}, renderBattleSurface() {}, settings: { battleSpeed: "normal" } };
context.renderBaseCardPreview = () => "";
context.renderCardPreview = () => "";
context.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {} }),
  body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
  hidden: false,
};
context.window = { addEventListener() {} };
context.localStorage = { getItem: () => null, setItem: () => {} };
context.navigator = {};

context.gameEngine = {
  state: null,
  sessionId: 7,
  log() {},
  checkGameOver() {},
  isActiveBattle(state, sessionId) { return this.state === state && this.sessionId === sessionId; },
  invalidateBattle() { this.sessionId += 1; this.state = null; },
  makeFighter(name, deck, isPlayer) {
    const level = deck.level || 50;
    const maxHp = context.levelHp(level);
    return {
      id: isPlayer ? "player" : "enemy", name, level,
      race: deck.race || "人族", profession: deck.profession || "战士", element: deck.element || "无",
      maxHp, hp: maxHp, shield: 0, energy: 0, maxEnergy: 10,
      hand: [], drawPile: [], discardPile: [], exhaustPile: [], summons: [],
      statuses: [], skipAction: false, controlImmuneTurns: 0, turnFlags: {}, profile: { damage: 1, heal: 1, defense: 1 },
    };
  },
};
context.aiController = { chooseCard() {}, takeTurn() {} };
context.fixedCardLibrary = { characterDefinitions: [], charactersById: {}, createRuntimeDeck: () => ({ cards: [] }) };
context.campaignData = { characters: [], stages: [], difficulties: { normal: { label: "普通", hp: 1, power: 1 } } };

for (const file of ["js/battle-rules.js", "js/campaign-data.js", "js/campaign-mode.js", "js/campaign-rules.js", "js/fixed-game-rules.js", "js/campaign-runtime.js"]) {
  vm.runInContext(await read(file), context, { filename: file });
}
vm.runInContext(`gameEngine.checkGameOver = function ${extractObjectMethod(indexSource, "checkGameOver() {")}`, context, { filename: "checkGameOver-from-index" });
context.campaignRuntime.install();

const { gameEngine, campaignMode, campaignRuntime } = context;
const notices = [];
const spoken = [];
// 测试上下文的 log 为桩，这里单独记录战斗日志内容用于断言。
gameEngine.log = message => { spoken.push(String(message)); };
campaignRuntime.configurePresentation({
  renderHud() {},
  notice(text) { notices.push(text); },
  playSound() {},
  playDrawSound() {},
});

function makeState({ characterId, stage, playerHp, enemyHp, enemyName }) {
  const player = gameEngine.makeFighter("丽莎娅", { level: 1, race: "人族", profession: "战士", cards: [] }, true);
  const enemy = gameEngine.makeFighter(enemyName || "耶莫稣", { level: 1, race: "龙族", profession: "战士", cards: [] }, false);
  player.maxHp = 10000; player.hp = playerHp;
  enemy.maxHp = 10000; enemy.hp = enemyHp;
  const state = {
    sessionId: gameEngine.sessionId,
    turn: "player",
    round: 1,
    gameOver: false,
    winner: null,
    actionLocked: false,
    log: [],
    player,
    enemy,
    combatStats: campaignMode.createCombatStats(),
    campaign: {
      characterId,
      stage,
      difficulty: "normal",
      playerRing: 0,
      enemyRing: 0,
      resonanceUsed: false,
      enemyResonanceUsed: false,
      costReduction: 0,
      enemyCostReduction: 0,
      intent: null,
      passiveTriggers: 0,
      passives: { turn: {}, match: {}, round: 0 },
      bossPhaseTriggered: false,
    },
  };
  state.campaignStats = state.combatStats;
  gameEngine.state = state;
  return state;
}

// ---- 1. 丽莎娅低血被动：敌方召唤协击把玩家从 40% 打到 30% 时必须触发，且只触发一次 ----
{
  notices.length = 0;
  spoken.length = 0;
  const state = makeState({ characterId: "lisaya", stage: 1, playerHp: 4000, enemyHp: 10000 });
  // 协击方向由回合方决定：敌方回合结束时敌方召唤物攻击玩家。
  state.enemy.summons = [{ name: "龙仆", hp: 100, power: 1000 }];
  state.turn = "enemy";
  const stats = state.campaignStats;
  gameEngine.endTurn("enemy");
  // 协击把玩家打到 30%（3000），胜利圣仪随后恢复 10%（1000）并给 8% 护盾，最终生命回到 4000。
  assert.equal(state.player.hp, 4000, "协击伤害与被动治疗都应在同一回合结算完成");
  assert.equal(stats.passiveTriggers, 1, "胜利圣仪应因协击跨阈值触发一次");
  assert.equal(stats.healing, 1000, "被动治疗应计入实际治疗");
  assert.equal(state.player.shield, 800, "被动应获得最大生命 8% 的护盾");
  assert.ok(notices.includes("丽莎娅：胜利圣仪"), "应给出被动触发提示");
  assert.ok(spoken.some(line => line.includes("召唤协击")), "应先结算召唤协击伤害");
  assert.ok(spoken.some(line => line.includes("[战役被动] 胜利圣仪")), "被动触发应写入战斗日志");
  assert.equal(campaignMode.passiveAllowed(state.campaign.passives, "lisaya", "match"), false, "被动应被消费，不得重复触发");
}

// ---- 2. 第五关首领阶段：玩家召唤协击把耶莫稣打到 50% 以下时必须立即进入第二阶段 ----
{
  notices.length = 0;
  spoken.length = 0;
  const state = makeState({ characterId: "luolinfo", stage: 5, playerHp: 10000, enemyHp: 6000 });
  state.enemy.summons = [];
  state.player.summons = [{ name: "火焰领主Ⅲ召唤物", hp: 100, power: 1500 }];
  state.enemy.statuses = [{ type: "冻结", turns: 1, power: 0 }];
  gameEngine.endTurn("player");
  assert.equal(state.enemy.hp, 4500, "协击应把耶莫稣打到 45% 生命");
  assert.equal(state.campaign.bossPhaseTriggered, true, "协击跨过 50% 阈值必须触发首领阶段");
  assert.equal(state.campaign.enemyRing, 2, "首领阶段应获得 2 格星环");
  assert.equal(state.campaign.intent, null, "首领阶段应清空敌方意图");
  assert.equal(state.enemy.statuses.some(status => status.type === "冻结"), false, "首领阶段应净化控制状态");
  assert.ok(spoken.some(line => line.includes("[首领阶段]")), "应记录首领阶段日志");
}

// ---- 3. 未跨阈值时不得触发（负向护栏） ----
{
  notices.length = 0;
  spoken.length = 0;
  const state = makeState({ characterId: "lisaya", stage: 1, playerHp: 8000, enemyHp: 10000 });
  state.enemy.summons = [{ name: "龙仆", hp: 100, power: 1000 }];
  state.turn = "enemy";
  gameEngine.endTurn("enemy");
  assert.equal(state.campaignStats.passiveTriggers, 0, "未跨阈值不应触发胜利圣仪");
  assert.equal(state.campaign.bossPhaseTriggered, false, "非第五关不应触发首领阶段");
}

// ---- 4. 卡牌路径与协击路径不得把同一次生命变化计两次 ----
{
  notices.length = 0;
  spoken.length = 0;
  const state = makeState({ characterId: "lisaya", stage: 1, playerHp: 4000, enemyHp: 10000 });
  state.enemy.summons = [];
  const card = { name: "测试攻击", baseName: "测试攻击", category: "skill", skillTier: "normal", cost: 1, element: "无", effectType: "attack", mechanics: [], effects: [{ type: "damage", ratio: 10 }] };
  gameEngine.applyCard(state.enemy, state.player, card);
  // 卡牌把玩家打到 30%（3000），被动治疗 10%（1000）使其回到 40%。
  assert.equal(state.player.hp, 4000, "卡牌伤害与被动治疗都应结算完成");
  assert.equal(state.campaignStats.passiveTriggers, 1, "同一张卡的伤害变化只应触发一次被动");
  assert.equal(notices.filter(text => text === "丽莎娅：胜利圣仪").length, 1, "被动提示不应重复出现");
  assert.equal(state.campaignStats.healing, 1000, "被动治疗只应计一次");
  // 回合结束时的召唤协击路径不得再次触发同一个被动。
  state.turn = "enemy";
  state.enemy.summons = [{ name: "龙仆", hp: 100, power: 1000 }];
  gameEngine.endTurn("enemy");
  assert.equal(state.campaignStats.passiveTriggers, 1, "结算后不得再次重复触发");
}

// ---- 5. 持续伤害跨阈值：被动只触发一次，统计不重复 ----
// 回合开始的 DOT 结算同时经过 tickStatuses 的伤口通知与 processCampaignPostStatusTick 兜底，
// 两条入口必须被同一份判定合并成一次。
{
  notices.length = 0;
  spoken.length = 0;
  const state = makeState({ characterId: "lisaya", stage: 1, playerHp: 4000, enemyHp: 10000 });
  state.enemy.summons = [];
  state.player.summons = [];
  state.player.statuses = [{ type: "燃烧", turns: 1, power: 2600, sourceOwnerId: "enemy", unit: "fixed" }];
  const stats = state.campaignStats;
  // 玩家回合开始结算 DOT（伤害来自敌方，因此 sourceOwnerId 为 enemy）
  gameEngine.tickStatuses(state.player);
  // DOT 2600：4000 → 1400（14%），被动治疗 10%（1000）→ 2400。
  // 治疗后仍在 35% 以下，"只触发一次"必须靠被动被消费来保证，
  // 不能靠治疗后生命恰好回到阈值以上来掩盖重复触发。
  assert.equal(state.player.hp, 2400, "DOT 伤害后应由被动治疗补回 1000");
  assert.ok(state.player.hp / state.player.maxHp < .35, "本用例必须让治疗后仍在阈值以下");
  assert.equal(stats.passiveTriggers, 1, "DOT 跨阈值只应触发一次胜利圣仪");
  assert.equal(stats.healing, 1000, "DOT 触发的被动治疗只应计一次");
  assert.equal(notices.filter(text => text === "丽莎娅：胜利圣仪").length, 1, "DOT 路径的被动提示不应重复");
  assert.equal(campaignMode.passiveAllowed(state.campaign.passives, "lisaya", "match"), false, "被动应被消费");
}

// ---- 6. 首领阶段：持续伤害跨阈值同样只触发一次 ----
{
  notices.length = 0;
  spoken.length = 0;
  const state = makeState({ characterId: "luolinfo", stage: 5, playerHp: 10000, enemyHp: 6000 });
  state.enemy.summons = [];
  state.enemy.statuses = [{ type: "燃烧", turns: 1, power: 1500, sourceOwnerId: "player", unit: "fixed" }];
  spoken.length = 0;
  gameEngine.tickStatuses(state.enemy);
  assert.equal(state.enemy.hp, 4500, "DOT 应把耶莫稣打到 45% 生命");
  assert.equal(state.campaign.bossPhaseTriggered, true, "DOT 跨过 50% 阈值必须触发首领阶段");
  assert.equal(state.campaign.enemyRing, 2, "首领阶段星环只应增加一次");
  assert.equal(spoken.filter(line => line.includes("[首领阶段]")).length, 1, "首领阶段日志不应重复");
}

console.log("verify-campaign-threshold-hooks: 卡牌/持续伤害/召唤协击三条路径均一次结算、无重复触发。");
