import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const html = await read("index.html");

function extractLastRenderFighter() {
  const markers = [];
  for (const pattern of [/uiRenderer\.renderFighter = function\(/g]) {
    let match;
    const re = new RegExp(pattern.source, "g");
    while ((match = re.exec(html)) !== null) markers.push(match.index);
  }
  if (!markers.length) throw new Error("找不到 uiRenderer.renderFighter");
  const start = markers[markers.length - 1];
  const open = html.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return html.slice(html.indexOf("function(id, fighter, isPlayer) {", start), end);
}

const source = extractLastRenderFighter();
let capturedHtml = "";
const context = {
  console,
  Math,
  JSON,
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  displayHp: fighter => fighter.hp,
  displayShield: fighter => fighter.shield || 0,
  normalizeRace: r => r,
  normalizeProfession: p => p,
  iconImg: src => `<img src="${src}">`,
  elementDescriptionFor: () => "元素说明",
  formatNumber: v => String(Math.round(v)),
  atlasStatusIcon: () => "[icon]",
  describeStatus: () => "状态说明",
  ASSETS: {
    races: { 人族: "race-human", 恶魔: "race-demon" },
    classes: { 战士: "class-warrior", 法师: "class-mage" },
    status: { 护盾: "shield", 燃烧: "burn" },
  },
  RACE_PROFILES: { 人族: { symbols: "✦" }, 恶魔: { symbols: "♠" } },
  TALENT_DETAILS: {},
  gameEngine: {
    state: {
      enemy: {
        hand: [
          { instanceId: "e1" },
          { instanceId: "e2" },
          { instanceId: "e3" },
        ],
      },
    },
  },
  document: {
    getElementById() {
      return {
        set innerHTML(value) { capturedHtml = value; },
        get innerHTML() { return capturedHtml; },
      };
    },
  },
};
vm.createContext(context);
const renderFighter = vm.runInContext(`(${source})`, context);

function makeFighter(overrides = {}) {
  return {
    id: "player",
    name: "测试角色",
    title: "",
    level: 50,
    maxHp: 1000,
    hp: 800,
    shield: 100,
    energy: 5,
    maxEnergy: 10,
    race: "人族",
    profession: "战士",
    element: "光",
    normalizedRace: "人族",
    normalizedProfession: "战士",
    statuses: [
      { type: "燃烧", turns: 2, power: 50 },
      { type: "增幅", turns: 3, power: 0.2 },
    ],
    talent: { name: "测试天赋", desc: "测试说明" },
    deckName: "测试卡组",
    ...overrides,
  };
}

// 1) 玩家 fighter 基础结构
{
  capturedHtml = "";
  renderFighter("playerArea", makeFighter(), true);
  assert.match(capturedHtml, /fighter-card/);
  assert.match(capturedHtml, /fighter-name/);
  assert.match(capturedHtml, /测试角色/);
  assert.match(capturedHtml, /bar-fill/);
  assert.match(capturedHtml, /800 \/ 1000/);
  assert.match(capturedHtml, /护盾 100/);
  assert.match(capturedHtml, /5\/10/);
  assert.match(capturedHtml, /燃烧 2/);
  assert.match(capturedHtml, /增幅 3/);
  assert.doesNotMatch(capturedHtml, /enemy-hand-in-hud/, "玩家 fighter 不应渲染敌方手牌");
}

// 2) 敌方 fighter 含手牌信息
{
  capturedHtml = "";
  renderFighter("enemyArea", makeFighter({ id: "enemy", name: "敌方", race: "恶魔" }), false);
  assert.match(capturedHtml, /fighter-card/);
  assert.match(capturedHtml, /敌方/);
  assert.match(capturedHtml, /enemy-hand-in-hud/);
  assert.match(capturedHtml, /对手手牌 3/);
}

// 3) HP 边界：0 HP 与超大 HP
{
  capturedHtml = "";
  renderFighter("playerArea", makeFighter({ hp: 0 }), true);
  assert.match(capturedHtml, /0 \/ 1000/);
  capturedHtml = "";
  renderFighter("playerArea", makeFighter({ hp: 123456789, maxHp: 987654321 }), true);
  assert.match(capturedHtml, /123456789 \/ 987654321/);
}

// 4) 状态渲染不修改状态数组
{
  const fighter = makeFighter();
  const statusesBefore = fighter.statuses.slice();
  renderFighter("playerArea", fighter, true);
  assert.equal(fighter.statuses.length, statusesBefore.length, "renderFighter 不应修改状态数组");
}

console.log("renderFighter 特征测试通过：玩家/敌方结构、HP、护盾、能量、状态、手牌与超大数值均符合当前最终实现。");
