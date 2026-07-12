import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("index.html", "utf8");
const templates = source.match(/const DEFAULT_CHARACTER_TEMPLATES = \[[\s\S]*?\n    \];/);
assert.ok(templates, "无法读取角色模板");
const context = { console, Date, Math };
vm.createContext(context);
vm.runInContext(`${templates[0]}; globalThis.DEFAULT_CHARACTER_TEMPLATES = DEFAULT_CHARACTER_TEMPLATES;`, context);
for (const file of ["js/battle-rules.js", "js/fixed-card-library.js"]) vm.runInContext(await readFile(file, "utf8"), context, { filename: file });

const { fixedCardLibrary, battleRules } = context;
const resolverSource = await readFile("js/fixed-game-rules.js", "utf8");
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
assert.match(resolverSource, /const effectAmount = \(fighter, effect\) => \{/);
assert.doesNotMatch(resolverSource, /maxHp \* Number\(effect\.ratio/);
console.log("固定角色、卡牌与通用规则验证通过。");
