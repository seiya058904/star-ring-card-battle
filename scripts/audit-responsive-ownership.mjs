#!/usr/bin/env node
// Responsive / media-query ownership audit — diagnostic only, not a CI gate.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const styleBlocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map((m, i) => ({
  index: i,
  attrs: m[1].trim(),
  css: m[2],
}));

function extractMediaRegions(css) {
  const regions = [];
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end >= 0 ? end + 2 : css.length;
      continue;
    }
    const idx = css.indexOf("@media", i);
    if (idx < 0) break;
    const open = css.indexOf("{", idx);
    if (open < 0) break;
    const condition = css.slice(idx + "@media".length, open).replace(/\s+/g, " ").trim();
    let depth = 0;
    let end = open;
    let inString = null;
    let inTemplate = false;
    let escaped = false;
    for (let j = open; j < css.length; j += 1) {
      const ch = css[j];
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
          end = j;
          break;
        }
      }
    }
    const body = css.slice(open + 1, end);
    regions.push({ condition, body });
    i = end + 1;
  }
  return regions;
}

const families = [
  "battle-layout-v3",
  "hand-dock-v3",
  ".card",
  ".fighter-card",
  ".card-preview-panel",
  ".campaign-hud",
  ".duel-unit",
  ".log-panel-v3",
  "#endTurnBtn",
];

function familiesIn(body) {
  return families.filter(f => body.includes(f));
}

const allRegions = [];
const conditionCounts = {};
for (const block of styleBlocks) {
  for (const region of extractMediaRegions(block.css)) {
    const important = (region.body.match(/!important/g) || []).length;
    const rules = (region.body.match(/[^{}]+\{[^{}]*\}/g) || []).length;
    const record = {
      blockIndex: block.index,
      blockAttrs: block.attrs,
      condition: region.condition,
      important,
      rules,
      families: familiesIn(region.body),
      chars: region.body.length,
    };
    allRegions.push(record);
    conditionCounts[region.condition] = (conditionCounts[region.condition] || 0) + 1;
  }
}

const thresholds = {};
for (const region of allRegions) {
  const m = region.condition.match(/(max|min)-(width|height):\s*([0-9]+)px/);
  if (m) {
    const key = `${m[1]}-${m[2]}`;
    thresholds[key] = thresholds[key] || {};
    thresholds[key][m[3]] = (thresholds[key][m[3]] || 0) + 1;
  }
}

const report = {
  totalRegions: allRegions.length,
  byBlock: {
    block0: allRegions.filter(r => r.blockIndex === 0).length,
    finalBlock: allRegions.filter(r => r.blockIndex === 1).length,
    other: allRegions.filter(r => r.blockIndex === 2).length,
  },
  regions: allRegions,
  duplicateConditions: Object.entries(conditionCounts).filter(([, n]) => n > 1).map(([condition, count]) => ({ condition, count })),
  thresholds,
  totalImportantInMedia: allRegions.reduce((sum, r) => sum + r.important, 0),
};

console.log(JSON.stringify(report, null, 2));
