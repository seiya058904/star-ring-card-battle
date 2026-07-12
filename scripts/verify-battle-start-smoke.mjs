import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile("index.html", "utf8");
const source = html.match(/start\(playerDeck, enemyDeck\) \{[\s\S]*?\n      \},\n      beginTurn/)[0].replace(/\n      \},\n      beginTurn$/, "\n}");
const context = { DEFAULT_ENEMY_NAME_POOL: { 人族: ["测试敌人"] }, pick: values => values[0] };
vm.createContext(context);
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
const state = engine.start(playerDeck, enemyDeck);

assert.equal(state.turn, "player");
assert.equal(state.round, 1);
assert.equal(state.player.id, "player");
assert.equal(state.enemy.id, "enemy");
assert.equal(calls.beginTurn, 1);
assert.equal(calls.draws, 5);
assert.equal(calls.logs.at(-1), "战斗开始。玩家先手，电脑已准备完毕。");
console.log("战斗启动 smoke test 通过：start() 已创建双方状态、开始玩家回合并准备敌方手牌。");
