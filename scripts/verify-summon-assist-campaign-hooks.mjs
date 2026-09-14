import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// R03 回归：召唤协击必须与卡牌伤害一样经过战役生命阈值检查
//（丽莎娅低血被动、第五关首领阶段），并避免统一后重复触发一次。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const source = await read("js/fixed-game-rules.js");

// 取出最终覆写层里实际生效的 resolveSummonAssist 与生命变化通知器。
function extractFunction(signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `缺少 ${signature}`);
  let index = source.indexOf("{", start);
  let depth = 0;
  for (; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`无法提取 ${signature}`);
}

const hookRegistration = source.match(/globalThis\.registerCampaignHealthChangeHook[\s\S]*?\n  \};/)[0];
const notifierSource = source.match(/const notifyCampaignHealthChange = [\s\S]*?\n  \};/)[0];
const assistSource = extractFunction("function resolveSummonAssist(");

const logs = [];

function makeContext({ withCampaign = true } = {}) {
  const player = { id: "player", name: "丽莎娅", element: "光", hp: 5000, maxHp: 10000, maxHpRaw: 10000, summons: [] };
  const enemy = { id: "enemy", name: "耶莫稣", element: "无", hp: 10000, maxHp: 10000, summons: [] };
  const state = {
    player,
    enemy,
    turn: "player",
    round: 1,
    gameOver: false,
    campaign: withCampaign
      ? { characterId: "lisaya", stage: 5, passives: { turn: {}, match: {}, round: 0 }, bossPhaseTriggered: false, enemyRing: 0, intent: { type: "普通攻击" }, passiveTriggers: 0 }
      : undefined,
    campaignStats: { healing: 0, overheal: 0, shield: 0, passiveTriggers: 0, damage: 0, highestDamage: 0, damageTaken: 0, shieldAbsorbed: 0, elementalAdvantage: 0, resonance: 0, enemyResonance: 0, summonDamage: 0, cards: 0, advanced: 0, special: 0, rounds: 0, revived: false },
  };
  const context = {
    console,
    Math,
    JSON,
    Number,
    String,
    Array,
    Object,
    Set,
    Date,
    formatNumber: value => String(value),
    effectsRenderer: undefined,
    gameEngine: {
      state,
      resolveDamage: ({ amount, target }) => {
        const dealt = Math.min(target.hp, amount);
        target.hp -= dealt;
        return { total: dealt, ownerDamage: dealt, summonDamage: 0, blocked: 0, guard: null };
      },
      log: message => logs.push(message),
    },
    global: {},
  };
  context.globalThis = context;
  vm.createContext(context);
  // 战役层通过 registerCampaignHealthChangeHook 注册的唯一钩子：这里用同契约的替身记录事件。
  context.healthEvents = [];
  vm.runInContext(boot, context, { filename: "health-hook-contract.js" });
  context.registerCampaignHealthChangeHook((fighter, previousHp, eventContext) => {
    context.healthEvents.push({ id: fighter.id, previousHp, hp: fighter.hp, type: eventContext?.type });
  });
  return { context, state, player, enemy };
}

const boot = `${hookRegistration}\n${notifierSource}\n${assistSource}`;

// 1. 召唤协击造成生命变化时必须通知战役层，并携带协击前的生命值。
{
  logs.length = 0;
  const { context, player, enemy } = makeContext();
  player.summons = [{ name: "召唤物", hp: 10, power: 4000 }];
  enemy.hp = 10000;
  vm.runInContext("resolveSummonAssist(gameEngine.state.player);", context, { filename: "summon-assist.vm.js" });
  assert.equal(enemy.hp, 6000, "协击应造成伤害");
  assert.deepEqual(context.healthEvents, [{ id: "enemy", previousHp: 10000, hp: 6000, type: "summon" }], "协击必须把生命变化通知战役层");
}

// 2. 生命未变化时不应产生多余的生命变化事件（护盾/固定减伤完全吸收的情形）。
{
  logs.length = 0;
  const { context, player, enemy } = makeContext();
  // 结算替身返回 0 伤害，等价于真实引擎里"护盾完全吸收"的结果。
  context.gameEngine.resolveDamage = ({ target }) => ({ total: 0, ownerDamage: 0, summonDamage: 0, blocked: 1, guard: null });
  player.summons = [{ name: "召唤物", hp: 10, power: 1 }];
  const before = enemy.hp;
  vm.runInContext("resolveSummonAssist(gameEngine.state.player);", context, { filename: "summon-assist.vm.js" });
  assert.equal(enemy.hp, before, "零伤害结算不得改变生命");
  assert.deepEqual(context.healthEvents, [], "生命未变化时不应通知战役层");
  assert.equal(logs.filter(line => line.includes("召唤协击")).length, 1, "零伤害协击仍应记录日志");
}

// 3. 敌方召唤物协击同样通知（首领阶段可能因此触发）。
{
  logs.length = 0;
  const { context, enemy } = makeContext();
  enemy.summons = [{ name: "龙仆", hp: 10, power: 3000 }];
  vm.runInContext("resolveSummonAssist(gameEngine.state.enemy);", context, { filename: "summon-assist.vm.js" });
  assert.deepEqual(context.healthEvents.map(event => event.id), ["player"], "敌方协击必须通知玩家侧生命变化");
  assert.equal(context.healthEvents[0].previousHp, 5000);
}

console.log("verify-summon-assist-campaign-hooks: 召唤协击的生命变化通知契约正确。");
