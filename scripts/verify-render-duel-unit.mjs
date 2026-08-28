import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const html = await read("index.html");

function extractMethod(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`找不到 ${signature}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  let inString = null;
  let inTemplate = false;
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === inString) inString = null;
      continue;
    }
    if (inTemplate) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "`") inTemplate = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      if (ch === "`") inTemplate = true;
      else inString = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return source.slice(start, end);
}

const source = extractMethod(html, "renderDuelUnit(id, fighter, isPlayer) {");
let capturedHtml = "";
const context = {
  console,
  Math,
  JSON,
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  displayHp: fighter => fighter.hp,
  displayShield: fighter => fighter.shield || 0,
  formatNumber: v => String(Math.round(v)),
  unitSpriteFor: fighter => `sprite-${fighter.race}`,
  normalizeRace: r => r,
  document: {
    getElementById() {
      return context.__unit || (context.__unit = {
        dataset: {},
        innerHTML: "",
        querySelector() { return null; },
        insertAdjacentHTML(position, html) {
          capturedHtml = html;
        },
      });
    },
  },
};
vm.createContext(context);
const renderDuelUnit = vm.runInContext(`(${source.replace("renderDuelUnit(id, fighter, isPlayer) {", "function(id, fighter, isPlayer) {")})`, context);

function makeFighter(overrides = {}) {
  return {
    name: "测试单位",
    maxHp: 1000,
    hp: 800,
    shield: 100,
    race: "人族",
    ...overrides,
  };
}

// 1) 玩家单位：无 ai-dialogue，包含 HP/shield/sprite，并设置 dataset.race。
capturedHtml = "";
context.__unit = null;
renderDuelUnit("playerUnit", makeFighter(), true);
assert.equal(capturedHtml, "", "玩家单位不应插入 ai-dialogue");
assert.equal(context.document.getElementById("playerUnit").dataset.race, "人族", "应设置 dataset.race");

// 2) 敌方单位：应插入 ai-dialogue。
capturedHtml = "";
context.__unit = null;
renderDuelUnit("enemyUnit", makeFighter({ race: "恶魔" }), false);
assert.match(capturedHtml, /ai-dialogue/, "敌方单位应插入 ai-dialogue");

// 4) 无 DOM 节点时应安全返回。
context.document.getElementById = () => null;
renderDuelUnit("missing", makeFighter(), true);

// 5) 所有权：不应存在历史包装。
assert.doesNotMatch(html, /originalRenderDuelUnitStandard/, "不应保留 originalRenderDuelUnitStandard");
assert.doesNotMatch(html, /uiRenderer\.renderDuelUnit = function/, "不应存在 renderDuelUnit 赋值覆写");

console.log("renderDuelUnit 特征测试通过：玩家/敌方结构、HP/shield/sprite、ai-dialogue、缺失节点与所有权均符合当前实现。");
