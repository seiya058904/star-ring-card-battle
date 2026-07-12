import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, fixedRules, campaignUi, audioManager] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("js/fixed-game-rules.js", "utf8"),
  readFile("js/campaign-ui.js", "utf8"),
  readFile("js/audio-manager.js", "utf8"),
]);

const fixedScript = html.indexOf('src="js/fixed-game-rules.js"');
const campaignScript = html.indexOf('src="js/campaign-ui.js"');
assert.ok(fixedScript >= 0 && campaignScript >= 0 && fixedScript < campaignScript, "固定规则必须先加载，战役层才能包装最终实现");

assert.match(fixedRules, /result\.popups\.push\(\{ type: "status heal"/);
assert.match(fixedRules, /result\.popups\.push\(\{ type: "status shield"/);
assert.match(fixedRules, /visualTargets/);
assert.match(fixedRules, /result\.targetId = recipient\.id/);
assert.match(fixedRules, /const expectedTarget = this\.state\?\.\[actor\.id === "player" \? "enemy" : "player"\]/);
assert.match(fixedRules, /const hasDamage = result\.visualAmounts\.some/);
assert.match(fixedRules, /setHpDisplayOverride\(actor\);\s*setHpDisplayOverride\(target\);/);
assert.match(html, /effect\?\.type === "status" && Number\.isFinite\(effect\?\.burnRatio\)/);
assert.match(fixedRules, /const recipient = \["增幅", "减伤", "闪避", "连锁", "复生"\]\.includes\(effect\.status\) \? actor : target/);
assert.match(fixedRules, /const shared = instantKill/);
assert.match(html, /resolveCardEffectAmount/);
assert.match(html, /\["复生", "增幅", "减伤", "闪避", "连锁"\]/);
assert.match(html, /s\.persistent \? "本场" : s\.turns/);

assert.match(audioManager, /function cardSoundEvent\(card\)/);
assert.match(audioManager, /card\.effects/);
assert.ok(audioManager.indexOf('if (types.has("damage")) return "attack-hit"') < audioManager.indexOf('if (types.has("shield")) return "shield"'), "混合攻击卡必须优先使用攻击音效");
assert.match(audioManager, /function cardImpactSoundEvent\(card, result\)/);
assert.match(audioManager, /"hit-received"/);
assert.match(fixedRules, /audioManager\?\.playCard\(card\);/);
assert.doesNotMatch(fixedRules, /if \(actor\.id === "player"\) audioManager\?\.playCard\(card\)/);
assert.match(html, /const impactSound = audioManager\?\.cardImpactSoundEvent/);
assert.match(html, /if \(impactSound\) audioManager\.play\(impactSound\)/);
assert.doesNotMatch(campaignUi, /audioManager\.play\(card\.effectType/);

const attackPriority = html.indexOf('cardArtHasMechanic(card, ["attack", "damage", "pierce", "execute", "lifesteal"])');
const shieldPriority = html.indexOf('cardArtHasMechanic(card, ["shield", "defense", "guard", "damageReduction"])');
assert.ok(attackPriority >= 0 && shieldPriority >= 0 && attackPriority < shieldPriority, "攻击语义必须优先于混合卡的护盾语义");

console.log("战斗效果、目标归属、音效入口与混合卡贴图回归验证通过。");
