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
const fixedRules = await readFile(new URL("../js/fixed-game-rules.js", import.meta.url), "utf8");
const formatNumber = extractBraceBalanced(html, "function formatNumber(");
const describeStatus = extractBraceBalanced(html, "function describeStatus(");
const amountSource = [
  extractBraceBalanced(html, "function resolveEffectAmount("),
  extractBraceBalanced(html, "function resolveCardEffectAmount("),
].join("\n");
const effectAmountSource = fixedRules.match(/const effectAmount = \(fighter, effect, card = null\) => \{[\s\S]*?\n  \};/)[0];
const fixedDescriptionSource = fixedRules.match(/global\.fixedCardDescription = function fixedCardDescription\(card, ctx\) \{[\s\S]*?\n  \};/)[0]
  .replace("global.fixedCardDescription = function fixedCardDescription", "function fixedCardDescription")
  .replace(/;$/, "");
const context = { levelHp: () => 2_000_000 };
vm.createContext(context);
vm.runInContext(`${formatNumber}\n${describeStatus}\n${amountSource}\n${effectAmountSource}\n${fixedDescriptionSource}`, context);

assert.match(context.describeStatus("增幅", null, 40_000), /额外造成 40K 点伤害/);
assert.match(context.describeStatus("复生", null, 420_000), /致命伤害时恢复 420K 生命/);
assert.equal(context.resolveCardEffectAmount({ type: "shield", ratio: .1 }, { level: 60, profile: { defense: 1, damage: 1, heal: 1 } }, { effectMultiplier: .9 }), 180_000);
assert.equal(context.resolveCardEffectAmount({ type: "heal", ratio: .1 }, { level: 60, profile: { defense: 1, damage: 1, heal: 1 } }, { effectMultiplier: 1.06 }) % 1, 0);
assert.match(context.fixedCardDescription({ effects: [{ type: "status", status: "诅咒", ratio: .03, turns: 2 }] }, { level: 60, race: "人族", profession: "法师" }), /每回合 60K 伤害/);
console.log("战役显示与效果数值 smoke test 通过：状态点数、复生说明和难度倍率结果均正确。");
