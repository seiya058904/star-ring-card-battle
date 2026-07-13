import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const extractBraceBalanced = (source, signature) => {
  const start = source.indexOf(signature);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`无法提取 ${signature}`);
};

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
inlineScripts.forEach((match, index) => new vm.Script(match[1], { filename: `index-inline-${index + 1}.js` }));
const source = extractBraceBalanced(html, "start(playerDeck, enemyDeck)");
const costSource = extractBraceBalanced(html, "function effectiveCardCost(");
const context = { DEFAULT_ENEMY_NAME_POOL: { 人族: ["测试敌人"] }, pick: values => values[0], campaignMode: { effectiveCardCost: (state, side, card) => Math.max(0, card.cost - (side === "player" ? state.campaign?.costReduction || 0 : 0)) } };
vm.createContext(context);
vm.runInContext(costSource, context);
const start = vm.runInContext(`({${source}}).start`, context);
const calls = { beginTurn: 0, draws: 0, logs: [] };
const engine = {
  state: null,
  start,
  makeFighter(name, deck, isPlayer) { return { id: isPlayer ? "player" : "enemy", name, hand: [], deck }; },
  beginTurn() { calls.beginTurn += 1; },
  draw(fighter, amount) { calls.draws += amount; fighter.hand.push(...fighter.deck.cards.slice(0, amount)); },
  log(message) { calls.logs.push(message); }
};

const playerDeck = { race: "人族", cards: [{ name: "玩家卡" }] };
const enemyDeck = { race: "人族", cards: [{ name: "敌人卡" }] };
assert.equal(context.effectiveCardCost({ campaign: { costReduction: 2 } }, "player", { cost: 5 }), 3);
assert.equal(context.effectiveCardCost({}, "player", { cost: 5 }), 5);
const state = engine.start(playerDeck, enemyDeck);

assert.equal(state.turn, "player");
assert.equal(state.round, 1);
assert.equal(state.player.id, "player");
assert.equal(state.enemy.id, "enemy");
assert.equal(calls.beginTurn, 1);
assert.equal(calls.draws, 5);
assert.equal(calls.logs.at(-1), "战斗开始。玩家先手，电脑已准备完毕。");
console.log("战斗启动 smoke test 通过：start() 已创建双方状态、开始玩家回合并准备敌方手牌。");
