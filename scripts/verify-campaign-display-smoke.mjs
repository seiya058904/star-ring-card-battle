import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile("index.html", "utf8");
const formatNumber = html.match(/function formatNumber\(value\) \{[\s\S]*?\n    \}/)[0];
const describeStatus = html.match(/function describeStatus\(type, turns, power, source, maxHp\) \{[\s\S]*?\n    \}/)[0];
const amountSource = html.match(/function resolveEffectAmount\(effect, actor, card\) \{[\s\S]*?\n    \}\n    function resolveCardEffectAmount\(effect, actor, card\) \{[\s\S]*?\n    \}/)[0];
const context = { levelHp: () => 2_000_000 };
vm.createContext(context);
vm.runInContext(`${formatNumber}\n${describeStatus}\n${amountSource}`, context);

assert.match(context.describeStatus("增幅", null, 40_000), /额外造成 40K 点伤害/);
assert.match(context.describeStatus("复生", null, 420_000), /致命伤害时恢复 420K 生命/);
assert.equal(context.resolveCardEffectAmount({ type: "shield", ratio: .1 }, { level: 60, profile: { defense: 1, damage: 1, heal: 1 } }, { effectMultiplier: .9 }), 180_000);
assert.equal(context.resolveCardEffectAmount({ type: "heal", ratio: .1 }, { level: 60, profile: { defense: 1, damage: 1, heal: 1 } }, { effectMultiplier: 1.06 }) % 1, 0);
console.log("战役显示与效果数值 smoke test 通过：状态点数、复生说明和难度倍率结果均正确。");
