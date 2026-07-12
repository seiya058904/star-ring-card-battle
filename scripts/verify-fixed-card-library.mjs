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
  for (const cardId of character.deck) {
    const card = fixedCardLibrary.cards[cardId];
    assert.ok(card, `${character.id} 卡牌存在`);
    assert.ok(card.cost >= 0 && card.cost <= 7, `${cardId} 费用`);
    assert.ok(card.effects.length, `${cardId} 效果`);
    assert.ok(battleRules.canUseElement(character, card.element), `${character.id} 元素`);
  }
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
console.log("固定角色、卡牌与通用规则验证通过。");
