import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHash } from "node:crypto";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const [html, director, css, manifest] = await Promise.all([
  read("index.html"), read("js/battle-presentation.js"),
  read("assets/ui/battle-presentation.css"), read("assets/units/heroes-v2/manifest.json"),
]);

// The view module loads before the inline engine, but never replaces its owners.
assert.ok(html.indexOf('src="js/battle-presentation.js"') < html.indexOf("const gameEngine ="));
assert.match(html, /<link id="battle-visual-polish-final"[^>]+battle-presentation\.css/);
assert.doesNotMatch(director, /(?:gameEngine|campaignMode|storageManager)\.[\w]+\s*=/);
assert.doesNotMatch(director, /\b(?:rng|Math\.random)\s*\(/);

const context = {
  URL, document: { baseURI: "https://example.test/star-ring-card-battle/index.html" },
  matchMedia: () => ({ matches: false }), uiRenderer: { settings: { animation: "high" } },
};
vm.createContext(context);
vm.runInContext(director, context);
const view = context.BattlePresentation;
assert.ok(Object.isFrozen(view));
assert.equal(view.heroFor({ name: "无名敌人" }), null);
const names = ["丽莎娅", "罗林福", "艾露希娅·卡佩恩", "摩罗哥·恩典", "赫卡莫斯·烬", "苏"];
const sources = names.map(name => view.heroFor({ name }).src);
assert.equal(new Set(sources).size, 6, "六个角色必须拥有不同素材");
assert.equal(view.heroFor({ name: "苏醒的敌人" }), null, "苏的名字不可误匹配敌人");
for (const source of sources) {
  const image = await readFile(new URL(`../${source}`, import.meta.url));
  assert.equal(image.toString("ascii", 0, 4), "RIFF");
  assert.equal(image.toString("ascii", 8, 12), "WEBP");
  assert.ok(image.length > 10_000, `${source} 不是完整的运行时素材`);
  assert.equal(view.assetUrl(source), `https://example.test/star-ring-card-battle/${source}`);
}
context.document.baseURI = "https://appassets.androidplatform.net/assets/www/index.html";
assert.equal(view.assetUrl(sources[0]), `https://appassets.androidplatform.net/assets/www/${sources[0]}`);
const provenance = JSON.parse(manifest);
assert.equal(provenance.source, "characters.png", "保留生成原图");
assert.deepEqual(provenance.runtime, sources.map(source => source.split("/").pop()), "来源清单必须对应六个运行时素材");
assert.equal(provenance.extraction.transparentPadding, 8, "角色轮廓不得紧贴裁切边界");
assert.equal(provenance.extraction.atlasSha256, createHash("sha256").update(await readFile(new URL("../assets/units/heroes-v2/characters.png", import.meta.url))).digest("hex"), "原始角色图集必须与裁切记录一致");
assert.equal(Object.keys(provenance.extraction.sprites).length, 6, "六张角色都必须有独立裁切记录");
assert.doesNotMatch(director, /turnAnnouncement|battleSceneLabel/, "回合和场景信息沿用原版入口");
assert.match(html, /wrap\.appendChild\(clone\)/, "真实打出的手牌必须在中央展示");
assert.match(html, /wrap\.innerHTML = renderCard\(\{ \.\.\.card, description, fullDescription: description \}, false, null, result\.actorId\)/, "敌方打出的卡牌必须使用同一中央舞台与当前施法者的展示数值和费用");
assert.match(html, /class="cast-vortex"[\s\S]*class="cast-ring"[\s\S]*class="played-card-wrap"[\s\S]*class="cast-burst"/, "保留原卡牌旋涡、光环与爆发演出");
assert.doesNotMatch(director, /cast-title-strip|cast-cameo/, "角色动作不可替换中央卡牌");

// A low-animation ultimate used to reveal HP after its own visual lock ended.
// Check every real tier's temporal invariant, rather than just matching CSS.
function extract(signature) {
  const start = html.indexOf(signature);
  assert.ok(start >= 0, signature);
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Unbalanced ${signature}`);
}
let tier = "normal";
let animation = "high";
const timingContext = { cardDramaTier: () => tier, storageManager: { getSettings: () => ({ animation }) }, DEFAULT_GAME_SETTINGS: {} };
vm.createContext(timingContext);
vm.runInContext(`${extract("const COMBAT_DRAMA_TIMING =")};\n${extract("function dramaTimingForCard(")}`, timingContext);
for (animation of ["high", "standard", "low"]) {
  for (tier of ["normal", "enhanced", "strong", "advanced", "ultimate"]) {
    const timing = vm.runInContext("dramaTimingForCard({})", timingContext);
    const hitAt = timing.enter + timing.focus + timing.charge + timing.cast;
    assert.ok(hitAt > 0 && hitAt < timing.totalMin, `${animation}/${tier}: 命中必须发生在解锁前`);
  }
}
context.uiRenderer.settings.animation = "low";
assert.equal(view.lowMotion(), true);
context.uiRenderer.settings.animation = "high";
context.matchMedia = () => ({ matches: true });
assert.equal(view.lowMotion(), true);
assert.match(css, /prefers-reduced-motion: reduce/);
console.log("战斗表现验证通过：六角色素材、Pages/Android URL、视图边界、15种动作时序及减少动态效果。");
