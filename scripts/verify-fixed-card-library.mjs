import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = file => readFile(path.join(repositoryRoot, file), "utf8");

const source = await readRepoFile("index.html");
const templates = source.match(/const DEFAULT_CHARACTER_TEMPLATES = \[[\s\S]*?\n    \];/);
assert.ok(templates, "无法读取角色模板");
const context = { console, Date, Math };
vm.createContext(context);
vm.runInContext(`${templates[0]}; globalThis.DEFAULT_CHARACTER_TEMPLATES = DEFAULT_CHARACTER_TEMPLATES;`, context);
for (const file of ["js/battle-rules.js", "js/fixed-card-library.js"]) vm.runInContext(await readRepoFile(file), context, { filename: file });

const { fixedCardLibrary, battleRules } = context;
const resolverSource = await readRepoFile("js/fixed-game-rules.js");
const librarySource = await readRepoFile("js/fixed-card-library.js");
assert.equal(fixedCardLibrary.characterDefinitions.length, 30);
assert.equal(new Set(Object.keys(fixedCardLibrary.cards)).size, Object.keys(fixedCardLibrary.cards).length);
for (const character of fixedCardLibrary.characterDefinitions) {
  assert.equal(character.deck.length, 30, `${character.id} 卡数`);
  const names = [];
  for (const cardId of character.deck) {
    const card = fixedCardLibrary.cards[cardId];
    assert.ok(card, `${character.id} 卡牌存在`);
    assert.ok(card.cost >= 0 && card.cost <= 10, `${cardId} 费用`);
    assert.ok(card.effects.length, `${cardId} 效果`);
    names.push(card.name);
    assert.ok(battleRules.canUseElement(character, card.element), `${character.id} 元素`);
    assert.doesNotMatch(card.name, /^[火冰风土雷光暗]系/u, `${cardId} 不得使用元素占位名`);
    for (const effect of card.effects) {
      if (["damage", "heal", "shield"].includes(effect.type)) assert.ok(Number.isFinite(effect.ratio) && effect.ratio > 0, `${cardId} 的 ${effect.type} 需要 ratio`);
      if (effect.type === "summon") assert.ok(Number.isFinite(effect.ratio) || Number.isFinite(effect.amount), `${cardId} 召唤需要 ratio 或 amount`);
      // DOT 状态（燃烧/诅咒）带 burnRatio 的是等级缩放值；带 amount 的是变体3乘数
      if (effect.burnRatio !== undefined) assert.ok(Number.isFinite(effect.burnRatio) && effect.burnRatio > 0, `${cardId} burnRatio 需正数`);
      if (effect.type === "draw" || effect.type === "energy") assert.ok(Number.isFinite(effect.amount) && effect.amount > 0, `${cardId} ${effect.type} 需要 amount`);
      // 非 DOT 状态（增幅/减伤/闪避/连锁/虚弱，以及变体3的燃烧/诅咒乘数版本）
      if (effect.type === "status" && effect.burnRatio === undefined) assert.ok(Number.isFinite(effect.ratio) || Number.isFinite(effect.amount), `${cardId} 非dot状态需要 ratio 或 amount`);
    }
    const effectTypes = new Set(card.effects.map(effect => effect.type));
    if (/治愈|治疗|回复|急救/u.test(card.name)) assert.ok(effectTypes.has("heal") || effectTypes.has("revive"), `${cardId} 治疗名称必须有治疗效果`);
    if (/护盾|防御|屏障|壁垒|铠甲|庇护|守护|磐石/u.test(card.name)) assert.ok(effectTypes.has("shield"), `${cardId} 防御名称必须有护盾效果`);
    if (/斩|击|箭|刺|爆|裁决|穿刺|突袭|重击|刀|剑|锤|落雷|雷霆|风暴|反击/u.test(card.name)) assert.ok(effectTypes.has("damage"), `${cardId} 攻击名称必须有伤害效果`);
    for (const effect of card.effects) {
      if (effect.type === "status" && effect.burnRatio !== undefined) {
        assert.ok(["燃烧", "诅咒"].includes(effect.status), `${cardId} DOT 状态类型必须正确`);
        assert.ok(effect.burnRatio > 0, `${cardId} DOT 数值必须大于0`);
      }
    }
    if (/冰|霜|寒|冻/u.test(card.name)) assert.ok(!card.effects.some(effect => effect.type === "status" && effect.status === "燃烧"), `${cardId} 冰系名称不能生成燃烧`);
  }
  assert.equal(new Set(names).size, names.length, `${character.id} 卡牌名称必须唯一`);
}
assert.deepEqual(Array.from([1, 2, 3, 4], round => battleRules.roundEnergy(round, 10)), [3, 5, 7, 9]);
assert.equal(battleRules.HAND_LIMIT, 8);
assert.ok(Object.values(fixedCardLibrary.cards).some(card => card.tier === "special" && card.afterPlay === "exhaust"));
assert.match(resolverSource, /fighter\.hand\.length >= rules\.HAND_LIMIT/);
assert.match(resolverSource, /card\.afterPlay === "exhaust" \? actor\.exhaustPile : actor\.discardPile/);
assert.match(resolverSource, /if \(existing\.length >= 3\)/);
assert.match(resolverSource, /controlImmuneTurns/);
assert.match(resolverSource, /resolveDamage\(\{ source: fighter, target, amount: summon\.power/);
assert.match(resolverSource, /const total = ownerDamage \+ summonDamage/);
assert.match(resolverSource, /const effectAmount = \(fighter, effect(?:, card = null)?\) => \{/);
assert.doesNotMatch(resolverSource, /maxHp \* Number\(effect\.ratio/);
assert.match(resolverSource, /等级 \$\{character\.level\}/);
assert.match(resolverSource, /character\.elements\.join\("、"\)/);
assert.match(librarySource, /semanticEffectType/);
assert.match(librarySource, /const semanticElement = inferElement\(name\)/);
assert.match(librarySource, /name\.startsWith\("时间回溯"\)/);
assert.match(librarySource, /name\.startsWith\("时间禁锢"\)/);
assert.match(librarySource, /name\.startsWith\("起死回生"\)/);
assert.match(librarySource, /name\.startsWith\("恶魔契约"\)/);
assert.match(librarySource, /name\.startsWith\("不灭魔躯"\)/);
assert.match(librarySource, /name\.startsWith\("绝对死亡"\)/);
assert.match(librarySource, /name\.startsWith\("伤害真实化"\)/);
assert.match(librarySource, /name\.startsWith\("魔法极致化"\)/);
assert.match(librarySource, /name\.startsWith\("元素圣体"\)/);
assert.match(resolverSource, /const statusPower = effectAmount\(actor, effect, card\)/);
assert.match(resolverSource, /sourceKind === "dot" \? 0/);
assert.match(resolverSource, /s\.charges === undefined \|\| s\.charges > 0/);
assert.match(librarySource, /status: "复生"/);
assert.match(librarySource, /execute: true/);
assert.match(resolverSource, /effect\.type === "revive"/);
assert.match(source, /effect\.status === "复生"/);
assert.match(source, /\["减伤", "闪避"\]\.includes\(effect\.status\)/);
assert.match(librarySource, /persistent: true/);
assert.match(librarySource, /pierceAmountRatio/);
assert.doesNotMatch(librarySource, /pierce: \.35|pierce: \.6/);
assert.match(resolverSource, /persistent \? null/);
assert.match(resolverSource, /status\.persistent \? status/);
assert.match(resolverSource, /pierceAmount/);
console.log("固定角色、卡牌与通用规则验证通过。");
