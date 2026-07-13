// 真实逐卡行为测试（批次一-2）
//
// 目的：对审计报告最高优先级的"特殊技能语义恢复"做真实行为验证，而非脆弱的源码正则。
// 做法：在 vm 沙箱中加载真实代码（js/battle-rules.js + js/fixed-card-library.js + js/fixed-game-rules.js），
//      仅桩接它们加载期接触的 DOM/UI 全局；数值解析函数（levelHp / resolveEffectAmount 等）从 index.html
//      原样抽取以保证数值可信。随后用一个明确标注的 30 角色夹具保证 14 张特殊卡都被生成，
//      再逐一通过真实的 gameEngine.applyCard 执行，断言实际战斗结果。
//
// 注意：夹具为测试专用（保证特殊卡覆盖），真实 30 角色卡组的"结构合法性"由 verify-fixed-card-library.mjs 负责。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFile(path.join(root, f), "utf8");

const context = {
  console, Math, Date, JSON, Number, String, Array, Object, Set, Map,
  isFinite, parseInt, parseFloat, Boolean, setTimeout
};
vm.createContext(context);

// 确定性 rng（仅 draw/shuffle 用，便于复现）
context.rng = (() => { let s = 0x9e3779b9; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();

// 数值解析函数必须取自 index.html 的"线上真实实现"，而非测试内的副本。
// 这样一旦线上解析器改动而测试未同步，测试会被真实行为暴露（而不是被复制到测试里的旧实现悄悄通过）。
const indexSource = await read("index.html");

// 按函数名从 index.html 抽出真实定义（括号配平，不依赖行号）。
// 与 verify-fixed-card-library.mjs 一致：读源码 + 抽取，不内联副本。
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error("无法从 index.html 定位函数：" + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
const helperNames = ["deterministicId", "shuffle", "levelHp", "formatNumber", "safeNumber", "resolveEffectAmount", "resolveCardEffectAmount", "getCardPrimaryPower", "shareOwnerDamageWithSummon"];
const helpers = helperNames.map(n => extractFunction(indexSource, n)).join("\n\n");
vm.runInContext(helpers, context, { filename: "helpers-from-index" });

// 加载真实战斗规则
vm.runInContext(await read("js/battle-rules.js"), context, { filename: "js/battle-rules.js" });

// 14 张特殊卡的语义（单一事实来源）必须全部被生成：用明确标注的夹具卡组覆盖
const SPECIAL_NAMES = [
  "时间回溯", "时间禁锢", "起死回生", "恶魔契约", "不灭魔躯", "绝对死亡",
  "魔法极致化", "元素圣体", "伤害真实化", "统治", "防御极致化", "锁龙", "斩魔剑", "递种"
];
context.DEFAULT_SKILL_NAMES = {
  normal: [],
  // 含一张召唤卡（领主/之主/君王 尾缀）以覆盖"召唤机制未丢失"的回归护栏
  advanced: ["光明之主Ⅲ", "沙王领主Ⅲ", "火焰领主Ⅲ", "大地君王Ⅲ", "暗黑领主Ⅲ"],
  special: SPECIAL_NAMES.slice()
};

const templates = [];
const specialPlan = [
  ["时间回溯", "时间禁锢", "起死回生"],
  ["恶魔契约", "不灭魔躯", "绝对死亡"],
  ["魔法极致化", "元素圣体", "伤害真实化"],
  ["统治", "防御极致化", "锁龙"],
  ["斩魔剑", "递种"]
];
specialPlan.forEach((skills, i) => templates.push({
  id: "sp" + i, name: "特化" + i, title: "", race: "人族", profession: "战士",
  level: 90, elements: ["全系"], skills: i === 0 ? [...skills, "光明之主Ⅲ"] : skills
}));
for (let i = 0; i < 25; i += 1) templates.push({
  id: "fl" + i, name: "填充" + i, title: "", race: "人族", profession: "战士",
  level: 1, elements: ["火"], skills: []
});
context.DEFAULT_CHARACTER_TEMPLATES = templates;

// 桩接夹具依赖（仅在加载期或执行期被引用）
context.combinedProfile = () => ({ damage: 1, heal: 1, defense: 1, draw: 1, skillRate: 0, elements: [], symbol: "", tags: [] });
context.normalizeRace = r => r;
context.normalizeProfession = p => p;
context.elementMultiplier = () => ({ multiplier: 1 });
context.removeDefeatedSummons = () => [];
context.setHpDisplayOverride = () => {};
context.getCardActionIntent = () => "hostile-damage";
context.uiRenderer = { showResult() {}, render() {}, nav() {}, openModal() {}, startBattle() {}, openBattlePrep() {} };
context.aiController = { chooseCard() {}, takeTurn() {} };
context.effectsRenderer = undefined; // applyCard 用 effectsRenderer?.play?.() ，保持未定义即可
context.audioManager = undefined;
context.gameEngine = {
  state: null,
  sessionId: "behavior-test",
  log() {},
  checkGameOver() {},
  isActiveBattle() { return true; },
  makeFighter(name, deck, isPlayer) {
    const level = deck.level || 50;
    const maxHp = context.levelHp(level);
    return {
      id: isPlayer ? "player" : "enemy", name, level,
      race: deck.race || "人族", profession: deck.profession || "战士", element: deck.element || "无",
      maxHp, hp: maxHp, shield: 0, energy: 0, maxEnergy: 10,
      hand: [], drawPile: (deck.cards || []).map(c => ({ ...c })), discardPile: [], exhaustPile: [],
      statuses: [], summons: [], skipAction: false, controlImmuneTurns: 0, turnFlags: {}, deck
    };
  }
};

// 加载真实固定卡牌库与固定战斗规则（后者会覆写 gameEngine 并生成夹具卡组描述）
vm.runInContext(await read("js/fixed-card-library.js"), context, { filename: "js/fixed-card-library.js" });
vm.runInContext(await read("js/fixed-game-rules.js"), context, { filename: "js/fixed-game-rules.js" });

const { gameEngine, fixedCardLibrary: lib } = context;

// ---- 收集夹具中生成的所有特殊卡（按名字） ----
const cardsByName = Object.create(null);
const runtimeCards = lib.characterDefinitions.flatMap(character => lib.createRuntimeDeck(character.id).cards);
for (const card of runtimeCards) {
  if (card.tier === "special") (cardsByName[card.name] ||= []).push(card);
}
function findSpecial(name) {
  const list = cardsByName[name];
  assert.ok(list && list.length > 0, `夹具未生成特殊卡：${name}`);
  return list[0];
}

// 构造一对 fighter 并把 state 接好（applyCard 需要 this.state）
function makeFighters(pOpt = {}, eOpt = {}) {
  const mk = (opt, isPlayer) => {
    const deck = {
      id: isPlayer ? "p" : "e", characterId: isPlayer ? "p" : "e", name: isPlayer ? "玩家" : "敌人",
      race: opt.race || "人族", profession: opt.profession || "战士", level: opt.level || 50,
      element: opt.element || "无", cards: []
    };
    const f = gameEngine.makeFighter(isPlayer ? "玩家" : "敌人", deck, isPlayer);
    if (opt.maxHp != null) { f.maxHp = opt.maxHp; f.hp = opt.maxHp; }
    if (opt.race) f.race = opt.race;
    if (opt.hp != null) f.hp = opt.hp;
    f.statuses = [];
    return f;
  };
  const player = mk(pOpt, true);
  const enemy = mk(eOpt, false);
  gameEngine.state = { player, enemy, round: 1, gameOver: false, combatStats: null };
  return { player, enemy };
}

// =================== 一、结构断言：每张特殊卡效果必须与语义表一致 ===================
function assertEffects(name, pred, detail) {
  const c = findSpecial(name);
  assert.ok(pred(c.effects), `特殊卡[${name}]效果结构不符合预期${detail ? "：" + detail : ""} —— ${JSON.stringify(c.effects)}`);
}

assertEffects("锁龙", e => e.length === 1 && e[0].type === "damage" && e[0].slayRace === "龙族" && e[0].slayMultiplier === 2);
assertEffects("斩魔剑", e => e.length === 1 && e[0].type === "damage" && e[0].slayRace === "恶魔" && e[0].slayMultiplier === 2);
assertEffects("起死回生", e => e.length === 1 && e[0].type === "heal" && e[0].percentageOfMax === true && e[0].ratio === 0.5, "应为最大生命50%治疗");
assertEffects("伤害真实化", e => e.some(x => x.type === "status" && x.status === "真实" && x.turns === 2) && e.some(x => x.type === "status" && x.status === "增幅"), "应赋予真实+增幅");
assertEffects("递种", e => e.length === 1 && e[0].type === "status" && e[0].status === "抽牌压制" && e[0].turns === 3 && e[0].amount === 1, "应施加抽牌压制3回合");
assertEffects("防御极致化", e => e.some(x => x.type === "shield" && x.percentageOfMax === true && x.ratio === 0.5) && e.some(x => x.type === "status" && x.status === "减伤" && x.turns === 3), "应获50%护盾+减伤3回合");
assertEffects("统治", e => e.some(x => x.type === "status" && x.status === "禁锢" && x.turns === 2) && e.some(x => x.status === "增幅") && e.some(x => x.status === "减伤"), "应禁锢+增幅+减伤");
assertEffects("时间回溯", e => e.some(x => x.type === "heal") && e.some(x => x.type === "cleanse"), "应治疗+净化");
assertEffects("时间禁锢", e => e.some(x => x.type === "damage") && e.some(x => x.type === "status" && x.status === "禁锢" && x.turns === 1), "应伤害+禁锢1回合");
assertEffects("恶魔契约", e => e.some(x => x.type === "damage") && e.some(x => x.status === "增幅"), "应伤害+增幅");
assertEffects("不灭魔躯", e => e.some(x => x.type === "shield") && e.some(x => x.status === "减伤"), "应护盾+减伤");
assertEffects("绝对死亡", e => e.length === 1 && e[0].type === "damage" && e[0].execute === true, "应为处决伤害");
assertEffects("魔法极致化", e => e.some(x => x.type === "damage") && e.some(x => x.status === "增幅"), "应伤害+增幅");
assertEffects("元素圣体", e => e.some(x => x.type === "shield") && e.some(x => x.status === "增幅"), "应护盾+增幅");

// 全部 14 张都存在且效果非空（审计核心 bug：特殊卡丢失机制）
for (const name of SPECIAL_NAMES) {
  const c = findSpecial(name);
  assert.ok(c.effects && c.effects.length > 0, `特殊卡[${name}]效果为空（审计 bug 复现）`);
}

// =================== 二、行为断言：通过真实 applyCard 执行验证 ===================

// 处决必须在低血量时无视护盾并直接击杀。
{
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, race: "恶魔", maxHp: 1000, hp: 200 });
  enemy.shield = 1000;
  const card = findSpecial("绝对死亡");
  const result = gameEngine.applyCard(player, enemy, card);
  assert.equal(enemy.hp, 0, "低于30%生命的处决目标应被击杀");
  assert.equal(enemy.shield, 1000, "处决应绕过护盾");
  assert.equal(result.amount, 200, "处决结果应报告实际结算伤害");
}

// 守卫分摊的伤害必须更新守卫显示，并在结果中报告总伤害。
{
  const displayOverrides = [];
  context.setHpDisplayOverride = entity => displayOverrides.push(entity.id);
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  const guard = { id: "guard", name: "测试守卫", hp: 100, maxHp: 100, shield: 0 };
  enemy.summons = [guard];
  const enemyHp = enemy.hp;
  const guardHp = guard.hp;
  const result = gameEngine.applyCard(player, enemy, findSpecial("锁龙"));
  const settled = enemyHp - enemy.hp + guardHp - guard.hp;
  assert.ok(guard.hp < guardHp, "守卫应承受分摊伤害");
  assert.ok(displayOverrides.includes("guard"), "守卫结算前应记录生命显示覆盖");
  assert.equal(result.amount, settled, "卡牌结果应报告所有权主和守卫的实际伤害");
  assert.match(result.text, /守卫替/, "卡牌结果应说明守卫承伤");
}

// 直接伤害必须经共享结算器更新双方战斗统计。
{
  const stats = { damage: 0, highestDamage: 0, damageTaken: 0, shieldAbsorbed: 0 };
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  enemy.shield = 1;
  gameEngine.state.combatStats = stats;
  gameEngine.applyCard(player, enemy, findSpecial("锁龙"));
  assert.ok(stats.damage > 0 && stats.highestDamage > 0, "玩家直接伤害应更新 damage 和 highestDamage");
  player.shield = 1;
  gameEngine.applyCard(enemy, player, findSpecial("锁龙"));
  assert.ok(stats.damageTaken > 0 && stats.shieldAbsorbed > 0, "敌方直接伤害应更新 damageTaken 和 shieldAbsorbed");
}

// 锁龙：对龙族 ≈2 倍伤害
{
  const card = findSpecial("锁龙");
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, race: "龙族", maxHp: 5000, hp: 5000 });
  const dDragon = gameEngine.applyCard(player, enemy, card).amount;
  const { player: p2, enemy: e2 } = makeFighters({ level: 1 }, { level: 1, race: "人族", maxHp: 5000, hp: 5000 });
  const dHuman = gameEngine.applyCard(p2, e2, card).amount;
  assert.ok(dDragon >= dHuman * 1.8, `锁龙对龙族(${dDragon})应保留特攻加成（人族${dHuman}；龙族元素减伤后约1.84倍）`);
}

// 斩魔剑：对恶魔 ≈2 倍伤害
{
  const card = findSpecial("斩魔剑");
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, race: "恶魔", maxHp: 5000, hp: 5000 });
  const dDemon = gameEngine.applyCard(player, enemy, card).amount;
  const { player: p2, enemy: e2 } = makeFighters({ level: 1 }, { level: 1, race: "人族", maxHp: 5000, hp: 5000 });
  const dHuman = gameEngine.applyCard(p2, e2, card).amount;
  assert.ok(dDemon > dHuman * 1.9, `斩魔剑对恶魔(${dDemon})应≈2倍于人族(${dHuman})`);
}

// 防御极致化：护盾 = 最大生命 50%，自身减伤 3 回合
{
  const { player, enemy } = makeFighters({ maxHp: 2000 });
  player.hp = 2000;
  gameEngine.applyCard(player, enemy, findSpecial("防御极致化"));
  assert.equal(player.shield, 1000, `防御极致化护盾应为最大生命50%（实得 ${player.shield}）`);
  assert.ok(player.statuses.some(s => s.type === "减伤" && s.turns === 3), "防御极致化应给自身减伤3回合");
}

// 起死回生：恢复最大生命 50%（低血量与溢出钳制）
{
  const { player, enemy } = makeFighters({ maxHp: 2000 });
  player.hp = 200;
  gameEngine.applyCard(player, enemy, findSpecial("起死回生"));
  assert.equal(player.hp, 1200, `起死回生应恢复1000(50%)（实得 ${player.hp}）`);
  player.hp = 1800;
  gameEngine.applyCard(player, enemy, findSpecial("起死回生"));
  assert.equal(player.hp, 2000, `起死回生不应溢出最大生命（实得 ${player.hp}）`);
}

// 伤害真实化：赋予真实状态后，后续伤害无视护盾
{
  const dmgCard = findSpecial("恶魔契约");
  // 带真实
  let { player, enemy } = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  enemy.shield = 1000;
  gameEngine.applyCard(player, enemy, findSpecial("伤害真实化"));
  assert.ok(player.statuses.some(s => s.type === "真实"), "伤害真实化应赋予真实状态");
  const before = enemy.hp;
  gameEngine.applyCard(player, enemy, dmgCard);
  const lostTrue = before - enemy.hp;
  assert.equal(enemy.shield, 1000, `真实伤害应无视护盾（护盾仍 ${enemy.shield}）`);
  assert.ok(lostTrue > 0, "真实伤害应造成伤害");
  // 不带真实
  let r2 = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  r2.enemy.shield = 1000;
  const b2 = r2.enemy.hp;
  gameEngine.applyCard(r2.player, r2.enemy, dmgCard);
  const lostNo = b2 - r2.enemy.hp;
  assert.ok(lostNo >= 0, "普通伤害扣血量不应为负数");
  assert.ok(lostNo < lostTrue, `护盾应降低普通伤害：普通 ${lostNo}，真实 ${lostTrue}`);
  assert.ok(r2.enemy.shield < 1000, "普通伤害应消耗护盾");
}

// 递种：施加抽牌压制，且 beginTurn 抽牌数 -1
{
  const { player, enemy } = makeFighters({});
  enemy.hp = enemy.maxHp;
  gameEngine.applyCard(player, enemy, findSpecial("递种"));
  assert.ok(enemy.statuses.some(s => s.type === "抽牌压制" && s.turns === 3 && s.amount === 1), "递种应施加抽牌压制3回合");
  enemy.hand = [];
  enemy.drawPile = Array.from({ length: 10 }, (_, i) => ({ id: "d" + i, name: "牌" + i }));
  enemy.statuses = enemy.statuses.filter(s => s.type === "抽牌压制");
  gameEngine.state = { round: 1, player, enemy, gameOver: false, combatStats: null };
  gameEngine.beginTurn("enemy");
  assert.equal(enemy.hand.length, 4, `抽牌压制应使抽牌数-1（期望4，实得 ${enemy.hand.length}）`);
}

// 统治：禁锢敌方2回合 + 自身增幅 + 自身减伤
{
  const { player, enemy } = makeFighters({}, { maxHp: 5000, hp: 5000 });
  gameEngine.applyCard(player, enemy, findSpecial("统治"));
  assert.ok(enemy.statuses.some(s => s.type === "禁锢" && s.turns === 2), "统治应禁锢敌方2回合");
  assert.ok(player.statuses.some(s => s.type === "增幅"), "统治应增幅自身");
  assert.ok(player.statuses.some(s => s.type === "减伤"), "统治应减伤自身");
}

// 时间回溯：治疗 + 净化负面
{
  const { player, enemy } = makeFighters({ maxHp: 2000 });
  player.hp = 500;
  player.statuses = [{ type: "虚弱", turns: 2, power: 50, charges: 2 }];
  gameEngine.applyCard(player, enemy, findSpecial("时间回溯"));
  assert.ok(player.hp > 500, "时间回溯应治疗");
  assert.ok(!player.statuses.some(s => s.type === "虚弱"), "时间回溯应清除负面状态");
}

// 时间禁锢：造成伤害 + 禁锢1回合
{
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  const before = enemy.hp;
  gameEngine.applyCard(player, enemy, findSpecial("时间禁锢"));
  assert.ok(enemy.hp < before, "时间禁锢应造成伤害");
  assert.ok(enemy.statuses.some(s => s.type === "禁锢" && s.turns === 1), "时间禁锢应禁锢1回合");
}

// 恶魔契约 / 不灭魔躯 / 绝对死亡 / 魔法极致化 / 元素圣体 基础行为
{
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  gameEngine.applyCard(player, enemy, findSpecial("恶魔契约"));
  assert.ok(player.statuses.some(s => s.type === "增幅"), "恶魔契约应增幅自身");
  assert.ok(enemy.hp < 5000, "恶魔契约应造成伤害");
}
{
  const { player, enemy } = makeFighters({ maxHp: 2000 });
  player.hp = 2000;
  gameEngine.applyCard(player, enemy, findSpecial("不灭魔躯"));
  assert.ok(player.shield > 0, "不灭魔躯应给护盾");
  assert.ok(player.statuses.some(s => s.type === "减伤"), "不灭魔躯应减伤");
}
{
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  const before = enemy.hp;
  gameEngine.applyCard(player, enemy, findSpecial("绝对死亡"));
  assert.ok(enemy.hp < before, "绝对死亡应造成伤害");
}
{
  const { player, enemy } = makeFighters({ level: 1 }, { level: 1, maxHp: 5000, hp: 5000 });
  gameEngine.applyCard(player, enemy, findSpecial("魔法极致化"));
  assert.ok(player.statuses.some(s => s.type === "增幅"), "魔法极致化应增幅");
  assert.ok(enemy.hp < 5000, "魔法极致化应造成伤害");
}
{
  const { player, enemy } = makeFighters({ maxHp: 2000 });
  player.hp = 2000;
  gameEngine.applyCard(player, enemy, findSpecial("元素圣体"));
  assert.ok(player.shield > 0, "元素圣体应给护盾");
  assert.ok(player.statuses.some(s => s.type === "增幅"), "元素圣体应增幅");
}

// 召唤卡（尾缀 领主/之主/君王）：真实 applyCard 必须生成召唤单位
{
  const lordCard = runtimeCards.find(c => /领主|之主|君王/.test(c.name) && c.effects.some(e => e.type === "summon"));
  assert.ok(lordCard, "应存在带 summon 效果的领主系卡（旧固定生成器遗漏召唤判定的回归护栏）");
  const { player, enemy } = makeFighters({ level: 1, maxHp: 5000 }, { level: 1, maxHp: 5000, hp: 5000 });
  gameEngine.applyCard(player, enemy, lordCard);
  assert.ok(player.summons && player.summons.length > 0, `领主卡[${lordCard.name}]应召唤单位`);
  const summon = player.summons[0];
  assert.ok(summon.hp > 0 && /召唤物$/.test(summon.name), `召唤物应存活且命名规范（实得 ${summon?.name}）`);
  assert.ok(summon.maxHp > 0 && summon.power > 0, "召唤物应有生命与战力");
}

console.log("特殊卡真实行为测试通过：14 张特殊卡均生成、语义一致且经 applyCard 实际验证。");
