import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const [html, campaignUi] = await Promise.all([read("index.html"), read("js/campaign-ui.js")]);

function extractBlock(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`找不到 ${signature}`);
  let open = source.indexOf(") {", start);
  open = open >= 0 ? open + 2 : source.indexOf("{", start);
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

const baseSource = extractBlock(html, "function renderBaseCardPreview(card, opts = {}) {");
const baseContext = {
  console,
  Math,
  JSON,
  escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
  formatCardTitle: card => card.name,
  getCardActionIntent: () => "hostile-damage",
  cardArtBackgroundStyle: card => `background:art-${card.element || "none"}`,
  inferVisualTier: () => "normal-low",
  currentAdvantageText: () => "",
  getCardPowerLabel: card => `威力 ${card.power || 0}`,
  EFFECT_TYPE_LABELS_CN: { damage: "伤害", shield: "护盾", heal: "治疗" },
  ASSETS: { elements: { 火: "fire" } },
  iconImg: src => `<img src="${src}">`,
  gameEngine: { state: { enemy: {} } },
};
vm.createContext(baseContext);
const renderBaseCardPreview = vm.runInContext(`(${baseSource.replace("function renderBaseCardPreview", "function")})`, baseContext);

function makeCard(overrides = {}) {
  return {
    name: "测试卡",
    cost: 2,
    element: "火",
    effectType: "damage",
    description: "造成伤害",
    fullDescription: "造成伤害",
    mechanics: [],
    keywords: [],
    power: 10,
    category: "skill",
    skillTier: "normal",
    skillRank: "",
    rankMode: "",
    ...overrides,
  };
}

// 1) 基础 Preview 结构
{
  const out = renderBaseCardPreview(makeCard());
  assert.match(out, /preview-card-title/);
  assert.match(out, /preview-card-meta/);
  assert.match(out, /preview-art-box card-art-v2/);
  assert.match(out, /preview-card-desc/);
  assert.match(out, /测试卡/);
  assert.match(out, /2 能量/);
}

// 2) 有效费用展示
{
  const out = renderBaseCardPreview(makeCard({ cost: 5 }), { effectiveCost: 3 });
  assert.match(out, /3 能量/);
  assert.doesNotMatch(out, /5 能量/);
}

// 3) 转义
{
  const out = renderBaseCardPreview(makeCard({ name: "<img>", description: "\"x" }));
  assert.doesNotMatch(out, /<img>/, "名称应被转义");
  assert.match(out, /&lt;img&gt;/);
}

// 4) campaign wrapper：非战役不传 effectiveCost，战役传有效费用。
const wrapperSource = extractBlock(campaignUi, "renderCardPreview = function (card) {");
let lastOpts = null;
const wrapperContext = {
  console,
  gameEngine: { state: { campaign: null, player: { energy: 5 }, enemy: {} } },
  mode: { effectiveCardCost: (state, side, card) => Math.max(0, card.cost - (state.campaign?.costReduction || 0)) },
  renderBaseCardPreview(card, opts) { lastOpts = opts; return "preview"; },
};
vm.createContext(wrapperContext);
const renderCardPreview = vm.runInContext(`(${wrapperSource})`, wrapperContext);

lastOpts = null;
renderCardPreview(makeCard());
assert.equal(lastOpts && Object.prototype.hasOwnProperty.call(lastOpts, "effectiveCost"), true, "非战役 Preview 当前会传 effectiveCost 字段");
assert.equal(lastOpts.effectiveCost, undefined, "非战役 Preview 的 effectiveCost 应为 undefined");

wrapperContext.gameEngine.state.campaign = { costReduction: 2 };
lastOpts = null;
renderCardPreview(makeCard({ cost: 5 }));
assert.equal(lastOpts.effectiveCost, 3, "战役 Preview 应传有效费用");

console.log("renderCardPreview 特征测试通过：基础结构、有效费用、转义与 campaign 包装均符合当前实现。");
