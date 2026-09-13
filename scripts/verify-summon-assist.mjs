import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "js", "fixed-game-rules.js"), "utf8");

// 从最终覆写层提取 resolveSummonAssist 源码，保证测试对象就是实际生效的实现。
const name = "resolveSummonAssist";
const start = source.indexOf(`function ${name}(`);
assert.ok(start >= 0, "fixed-game-rules.js 缺少 resolveSummonAssist");
let index = source.indexOf("{", start);
let depth = 0;
for (; index < source.length; index += 1) {
  const ch = source[index];
  if (ch === "{") depth += 1;
  else if (ch === "}") {
    depth -= 1;
    if (depth === 0) {
      index += 1;
      break;
    }
  }
}
const fnSource = source.slice(start, index);

function runAssist(fighter, enemy, resolveDamage) {
  const context = {
    gameEngine: {
      state: { player: fighter.id === "player" ? fighter : enemy, enemy: fighter.id === "enemy" ? fighter : enemy },
      resolveDamage,
      log: message => logs.push(message),
    },
    effectsRenderer: undefined,
    formatNumber: value => String(value),
    __fighter: fighter,
  };
  vm.createContext(context);
  vm.runInContext(`${fnSource}\nresolveSummonAssist(__fighter);`, context, { filename: "resolveSummonAssist.vm.js" });
}

const logs = [];

function makeFighter(id, summons) {
  return { id, name: id, element: "fire", summons };
}

function makeEnemy() {
  return { id: "enemy", name: "敌方", hp: 1000, shield: 0 };
}

function lastCall(calls) {
  return calls[calls.length - 1];
}

// 1. 普通召唤物：协击伤害等于基础 summon.power。
{
  logs.length = 0;
  const enemy = makeEnemy();
  const calls = [];
  const fighter = makeFighter("player", [{ name: "灵仆", power: 10, hp: 5 }]);
  runAssist(fighter, enemy, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(lastCall(calls).amount, 10);
  assert.ok(logs[0].includes("[召唤协击]"));
  assert.ok(!logs[0].includes("强化协击"));
}

// 2. nextAssistMultiplier=1.5：下一次协击使用 1.5 倍（向上取整到固定整数伤害）。
{
  logs.length = 0;
  const enemy = makeEnemy();
  const calls = [];
  const summon = { name: "灵仆", power: 11, hp: 5, nextAssistMultiplier: 1.5, reinforcedBy: "灵仆" };
  runAssist(makeFighter("player", [summon]), enemy, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(lastCall(calls).amount, Math.max(1, Math.round(11 * 1.5)));
  assert.ok(logs[0].includes("强化协击"), "强化协击应有明确日志");
}

// 3+4. 强化协击后字段被消费，第二次协击回到 1.0 倍。
{
  logs.length = 0;
  const enemy = makeEnemy();
  const calls = [];
  const summon = { name: "灵仆", power: 10, hp: 5, nextAssistMultiplier: 1.5, reinforcedBy: "灵仆" };
  const fighter = makeFighter("player", [summon]);
  runAssist(fighter, enemy, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(summon.nextAssistMultiplier, undefined, "强化后应删除 nextAssistMultiplier");
  assert.equal(summon.reinforcedBy, undefined, "强化后应删除 reinforcedBy");
  runAssist(fighter, enemy, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(lastCall(calls).amount, 10, "第二次协击应回到基础伤害");
}

// 5. 召唤物已死亡时不消费强化。
{
  const enemy = makeEnemy();
  const summon = { name: "灵仆", power: 10, hp: 0, nextAssistMultiplier: 1.5, reinforcedBy: "灵仆" };
  runAssist(makeFighter("player", [summon]), enemy, () => assert.fail("死亡召唤物不应协击"));
  assert.equal(summon.nextAssistMultiplier, 1.5, "死亡召唤物不应消费强化");
}

// 6. 目标已死亡时不消费强化。
{
  const enemy = makeEnemy();
  enemy.hp = 0;
  const summon = { name: "灵仆", power: 10, hp: 5, nextAssistMultiplier: 1.5, reinforcedBy: "灵仆" };
  runAssist(makeFighter("player", [summon]), enemy, () => assert.fail("目标死亡不应协击"));
  assert.equal(summon.nextAssistMultiplier, 1.5, "目标死亡不应消费强化");
}

// 7. 玩家与敌方召唤物共用相同行为。
{
  logs.length = 0;
  const enemyFighter = makeFighter("enemy", [{ name: "魔仆", power: 8, hp: 5, nextAssistMultiplier: 1.5 }]);
  const player = makeEnemy();
  player.id = "player";
  const calls = [];
  runAssist(enemyFighter, player, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(lastCall(calls).amount, Math.max(1, Math.round(8 * 1.5)));
  assert.equal(enemyFighter.summons[0].nextAssistMultiplier, undefined);
}

// 8. 强化伤害仍通过 gameEngine.resolveDamage，不允许直接扣 HP。
{
  logs.length = 0;
  const enemy = makeEnemy();
  const calls = [];
  const summon = { name: "灵仆", power: 10, hp: 5, nextAssistMultiplier: 1.5 };
  runAssist(makeFighter("player", [summon]), enemy, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(calls.length, 1, "必须且只能通过 resolveDamage 结算一次");
  assert.equal(lastCall(calls).sourceKind, "summon");
  assert.equal(lastCall(calls).target, enemy);
  assert.equal(enemy.hp, 1000, "协击不得绕过 resolveDamage 直接扣目标 HP");
}

// 9. 零结算（settlement.total=0）也必须消费强化：语义是"下一次协击伤害提高"，
//     不是"下一次成功造成 HP 伤害时提高"；消费时点在 resolveDamage 成功返回之后。
{
  logs.length = 0;
  const enemy = makeEnemy();
  const summon = { name: "灵仆", power: 10, hp: 5, nextAssistMultiplier: 1.5, reinforcedBy: "灵仆" };
  runAssist(makeFighter("player", [summon]), enemy, () => ({ total: 0 }));
  assert.equal(summon.nextAssistMultiplier, undefined, "零结算也必须消费强化（护盾全挡/固定减伤归零）");
  assert.equal(summon.reinforcedBy, undefined);
  assert.ok(logs[0].includes("强化协击"), "强化标识基于本次使用的 multiplier，与结算结果无关");
}

// 10. 强化协击被护盾完全吸收后，第二次协击回到 1.0 倍（消费已发生）。
{
  logs.length = 0;
  const enemy = makeEnemy();
  const calls = [];
  const summon = { name: "灵仆", power: 10, hp: 5, nextAssistMultiplier: 1.5, reinforcedBy: "灵仆" };
  const fighter = makeFighter("player", [summon]);
  runAssist(fighter, enemy, args => { calls.push(args); return { total: 0 }; }); // 护盾完全吸收
  runAssist(fighter, enemy, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(lastCall(calls).amount, 10, "护盾全挡后下一次协击必须回到基础伤害");
}

// 11. 强化伤害传入 resolveDamage 的 amount 已应用 1.5 倍（删除乘法必使本测试失败）。
{
  logs.length = 0;
  const enemy = makeEnemy();
  const calls = [];
  const summon = { name: "灵仆", power: 10, hp: 5, nextAssistMultiplier: 1.5 };
  runAssist(makeFighter("player", [summon]), enemy, args => { calls.push(args); return { total: args.amount }; });
  assert.equal(lastCall(calls).amount, 15);
}

console.log("verify-summon-assist: 11/11 PASS");
