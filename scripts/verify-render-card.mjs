import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");
const html = await read("index.html");

function extractLastRenderCard() {
  const markers = [];
  for (const pattern of [/function renderCard\(/, /renderCard = function\(/g]) {
    let match;
    const re = new RegExp(pattern.source, "g");
    while ((match = re.exec(html)) !== null) markers.push({ index: match.index, source: match[0] });
  }
  if (!markers.length) throw new Error("找不到 renderCard");
  markers.sort((a, b) => a.index - b.index);
  const start = markers[markers.length - 1].index;
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
  return html.slice(start, end);
}

const source = extractLastRenderCard();
const context = {
  console,
  Math,
  JSON,
  escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
  formatCardTitle: card => card.name,
  tierNameFor: card => card.category === "base" ? "base" : card.skillTier || "normal",
  dramaTierNameFor: card => String(card.cost || 1),
  inferVisualTier: card => card.skillTier === "special" ? "crown" : card.skillTier === "advanced" ? "star-2" : "normal-low",
  atlasBackgroundStyle: () => "background:frame",
  cardFrameSprite: () => "frame",
  cardArtBackgroundStyle: card => `background:art-${card.element || "none"}`,
  cardHasAdvantageAgainst: () => false,
  cardColors: () => ["#111", "#222"],
  effectiveCardCost: (state, side, card) => card.effectiveCost ?? card.cost,
  gameEngine: { state: { campaign: null, player: { energy: 5 }, enemy: {} } },
};
vm.createContext(context);

const renderCard = vm.runInContext(`(${source})`, context);

function makeCard(overrides = {}) {
  return {
    instanceId: "c1",
    name: "测试卡",
    category: "skill",
    skillTier: "normal",
    skillRank: "",
    rankMode: "",
    cost: 2,
    element: "火",
    effectType: "damage",
    mark: "✦",
    description: "测试描述",
    ...overrides,
  };
}

// 1) 普通可打出卡
{
  const out = renderCard(makeCard(), false);
  assert.match(out, /data-instance-id="c1"/);
  assert.match(out, /data-cost="2"/);
  assert.match(out, /data-element="火"/);
  assert.match(out, /data-effect="damage"/);
  assert.match(out, /data-symbol="✦"/);
  assert.match(out, /class="card[^"]*card-tier-/);
  assert.match(out, /card-art card-art-v2/);
  assert.match(out, /card-cost/);
  assert.match(out, /测试描述/);
  assert.doesNotMatch(out, /unplayable/, "普通卡不应标记 unplayable");
}

// 2) 不可打出卡
{
  const out = renderCard(makeCard(), true);
  assert.match(out, /unplayable/);
}

// 3) 零有效费用
{
  const out = renderCard(makeCard({ effectiveCost: 0 }), false);
  assert.match(out, /data-cost="0"/);
  assert.match(out, /<div class="card-cost">0<\/div>/, "0 费卡应显示纯文本费用");
}

// 4) 战役减费：有效费用与费用精灵
{
  const out = renderCard(makeCard({ cost: 5, effectiveCost: 3 }), false);
  assert.match(out, /data-cost="3"/);
  assert.match(out, /cost3\.png/);
}

// 5) 特殊卡视觉标记
{
  const out = renderCard(makeCard({ skillTier: "special" }), false);
  assert.match(out, /card-tier-crown/);
}

// 6) 卡牌艺术/回退 art style
{
  const out = renderCard(makeCard({ element: "冰" }), false);
  assert.match(out, /background:art-冰/);
}

// 7) 转义：名称/描述中的危险字符不应原样输出
{
  const out = renderCard(makeCard({ name: "<img>", description: "\"onmouseover=\"x" }), false);
  assert.doesNotMatch(out, /<img>/, "名称应被转义");
  assert.match(out, /&lt;img&gt;/);
  assert.doesNotMatch(out, /"onmouseover="x/, "描述引号应被转义");
}

console.log("renderCard 特征测试通过：结构、状态、费用、艺术、转义与实例标识均符合当前最终实现。");
