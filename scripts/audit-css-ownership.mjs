#!/usr/bin/env node
// CSS ownership audit — diagnostic only, not a CI gate.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");

const styleTags = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map((m, i) => ({
  index: i,
  attrs: m[1].trim(),
  css: m[2],
}));

function extractRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    // skip comments
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end >= 0 ? end + 2 : css.length;
      continue;
    }
    const brace = css.indexOf("{", i);
    if (brace < 0) break;
    const selector = css.slice(i, brace).replace(/\s+/g, " ").trim();
    let depth = 0;
    let end = brace;
    for (let j = brace; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    const body = css.slice(brace + 1, end);
    if (selector && !selector.startsWith("@media") && !selector.startsWith("@keyframes")) {
      rules.push({ selector, body });
    }
    i = end + 1;
  }
  return rules;
}

const blocks = styleTags.map((block, i) => {
  const rules = extractRules(block.css);
  const importantByProperty = {};
  for (const rule of rules) {
    for (const decl of rule.body.split(";")) {
      const m = decl.match(/^\s*([^:]+)\s*:\s*(.+?)\s*!important\s*$/);
      if (m) {
        const prop = m[1].trim();
        importantByProperty[prop] = (importantByProperty[prop] || 0) + 1;
      }
    }
  }
  return {
    index: i,
    attrs: block.attrs,
    lines: block.css.split(/\r?\n/).length,
    chars: block.css.length,
    rules: rules.length,
    important: block.css.split("!important").length - 1,
    mediaQueries: (block.css.match(/@media/g) || []).length,
    keyframes: (block.css.match(/@keyframes/g) || []).length,
    topImportantProperties: Object.entries(importantByProperty).sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
});

const allCss = styleTags.map(b => b.css).join("\n");
const allRules = styleTags.flatMap(b => extractRules(b.css));
const selectorCounts = {};
for (const rule of allRules) {
  for (const sel of rule.selector.split(",")) {
    const s = sel.trim();
    if (!s) continue;
    selectorCounts[s] = (selectorCounts[s] || 0) + 1;
  }
}
const repeatedSelectors = Object.entries(selectorCounts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
const importantByProperty = {};
for (const rule of allRules) {
  for (const decl of rule.body.split(";")) {
    const m = decl.match(/^\s*([^:]+)\s*:\s*(.+?)\s*!important\s*$/);
    if (m) {
      const prop = m[1].trim();
      importantByProperty[prop] = (importantByProperty[prop] || 0) + 1;
    }
  }
}
const mediaRanges = [...allCss.matchAll(/@media\s*([^{]+)\{/g)].map(m => m[1].trim());

const report = {
  styleBlocks: blocks,
  totals: {
    styleBlocks: styleTags.length,
    cssLines: blocks.reduce((sum, b) => sum + b.lines, 0),
    selectorsRules: allRules.length,
    repeatedSelectorGroups: repeatedSelectors.length,
    importantDeclarations: allCss.split("!important").length - 1,
    mediaQueryRegions: (allCss.match(/@media/g) || []).length,
    keyframes: (allCss.match(/@keyframes/g) || []).length,
    inlineStyleAttrs: (html.match(/style="/g) || []).length,
    jsStyleWrites: (html.match(/\.style\./g) || []).length,
  },
  topImportantProperties: Object.entries(importantByProperty).sort((a, b) => b[1] - a[1]).slice(0, 20),
  mediaRanges,
  repeatedSelectors: repeatedSelectors.slice(0, 30),
};

console.log(JSON.stringify(report, null, 2));
