import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { console };
vm.createContext(context);
for (const file of ["js/campaign-data.js", "js/campaign-mode.js"]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}

const { campaignData, campaignMode } = context;
const campaignUiSource = await readFile("js/campaign-ui.js", "utf8");
const gameSource = await readFile("index.html", "utf8");
const audioSource = await readFile("js/audio-manager.js", "utf8");
assert.match(campaignUiSource, /mode\.projectedEnergy\(state\.round, state\.enemy\.maxEnergy/);
/* Static structure assertions (NOT runtime combat tests). These verify source
   code patterns, not runtime behavior. They must not be called "integration tests".

   1. Target routing: playCard sets target=opponent; no silent auto-correct.
   2. skipAction (禁锢) unified check before mode branch and resonance.
   3. combatStats initialized in gameEngine.start for all modes.
   4. Sandbox showResult reads combatStats.
   5. Campaign uses combatStats (same object as campaignStats), no separate creation.
   6. Campaign playCard wrappers record to combatStats, not a duplicate campaignStats.
   7. createStatusFromMechanic writes sourceOwnerId; call sites pass actor.id.
   8. No full target.statuses scan to claim old statuses in applyCard.
   9. Core tickStatuses records per-status actual DoT damage to combatStats.
   10. campaign-ui.js has no second source-owner patch or duplicate DoT recording. */
assert.match(gameSource, /const target = this\.state\[side === "player" \? "enemy" : "player"\]/);
assert.doesNotMatch(gameSource, /expectedTarget = actor\.id === "player"/);
assert.match(campaignUiSource, /function skipEnemyControlledTurn\(state\)/);
assert.match(campaignUiSource, /if \(skipEnemyControlledTurn\(state\)\) return; if \(!state\.campaign\) return originalCampaignAi/);
assert.match(gameSource, /combatStats: globalThis\.campaignMode\?\.createCombatStats/);
assert.match(gameSource, /const s = state\.combatStats/);
assert.match(gameSource, /if \(actor\.id === "player"\) globalThis\.campaignMode\?\.recordCombatEvent\?\.\(this\.state\.combatStats/);
assert.match(campaignUiSource, /state\.campaignStats = state\.combatStats/);
assert.doesNotMatch(campaignUiSource, /state\.campaignStats = mode\.createCombatStats/);
assert.doesNotMatch(campaignUiSource, /mode\.recordCombatEvent\(state\.combatStats, \{ type: "damage", amount: Math\.min\(beforeHp - fighter\.hp/);
assert.doesNotMatch(campaignUiSource, /target\.statuses\.filter\(status => status\.source === card\.name && !status\.sourceOwnerId\)/);
assert.match(gameSource, /function createStatusFromMechanic\(mechanic, card, power, sourceOwnerId\)/);
assert.match(gameSource, /if \(type === "燃烧"\) return \{ type, name: "燃烧"[^}]*sourceOwnerId/);
assert.match(gameSource, /createStatusFromMechanic\("burn", card, power, actor\.id\)/);
assert.match(gameSource, /createStatusFromMechanic\("curse", card, power, actor\.id\)/);
assert.match(gameSource, /createStatusFromMechanic\("control", card, power, actor\.id\)/);
assert.match(gameSource, /createStatusFromMechanic\("summon", card, power, actor\.id\)/);
assert.doesNotMatch(campaignUiSource, /state\?\.campaign && fighter\.id === "enemy" && ownDots\.length && fighter\.hp < beforeHp\) mode\.recordCombatEvent\(state\.campaignStats/);
assert.doesNotMatch(gameSource, /target\.statuses\.forEach\(status => \{[\s\S]*status\.sourceOwnerId = actor\.id/);
assert.match(gameSource, /const actualDamage = hpBefore - fighter\.hp;[\s\S]*if \(actualDamage > 0 && fighter\.id === "enemy" && status\.sourceOwnerId === "player"\)/);
assert.match(gameSource, /globalThis\.campaignMode\.recordCombatEvent\(stats, \{ type: "damage", amount: actualDamage \}\)/);
assert.match(gameSource, /if \(type === "中毒"\) return \{ type, name: "中毒"/);
/* 11. Core tickStatuses returns a per-status settlement summary (dotEvents +
   playerDotDamage) so the Heka lifesteal passive only counts player-sourced DoT. */
assert.match(gameSource, /const dotEvents = \[\];[\s\S]*return \{ totalDamage, playerDotDamage, dotEvents \};/);
assert.match(gameSource, /const playerDotDamage = dotEvents[\s\S]*\.filter\(e => e\.sourceOwnerId === "player" && \["燃烧","诅咒","中毒"\]\.includes\(e\.type\)\)[\s\S]*\.reduce\(\(sum, e\) => sum \+ e\.actualDamage, 0\)/);
assert.match(campaignUiSource, /const result = originalTickStatuses\(fighter\); if \(state\?\.campaign\?\.characterId === "heka" && fighter\.id === "enemy" && result\.playerDotDamage > 0\)/);
assert.doesNotMatch(campaignUiSource, /ownDots\.length/);
assert.match(campaignUiSource, /const stats = state\.combatStats; if \(side === "player"\)/);
assert.match(campaignUiSource, /const originalCampaignAi = aiController\.takeTurn\.bind\(aiController\)/);
assert.match(gameSource, /audioManager\?\.playCard\(card\)/);
assert.match(gameSource, /audioManager\?\.play\(side === "player" \? "turn-end" : "turn-start"\)/);
assert.match(audioSource, /addEventListener\("click".*true/);
assert.equal(campaignData.characters.length, 6);
assert.equal(new Set(campaignData.characters.map(({ id }) => id)).size, 6);
assert.equal(campaignData.stages.length, 5);
for (const character of campaignData.characters) {
  assert.equal(campaignMode.flattenDeck(character.deck).length, 30);
}
assert.deepEqual(Array.from(campaignData.characters.map(({ loreLevel }) => loreLevel)), [67, 61, 86, 62, 93, 93]);

const fresh = campaignMode.defaultProgress(campaignData.characters);
const firstId = campaignData.characters[0].id;
assert.equal(fresh.characters[firstId].unlockedStage, 1);
assert.equal(fresh.characters[campaignData.characters[1].id].unlockedStage, 1);
assert.equal(campaignMode.recordStageWin(fresh, firstId, 1).characters[firstId].unlockedStage, 2);
assert.equal(campaignMode.recordStageLoss(fresh, firstId).characters[firstId].unlockedStage, 1);

const mulligan = campaignMode.mulligan(["a", "b", "c", "d", "e"], [0, 2], ["f", "g"]);
assert.deepEqual(mulligan.hand, ["f", "b", "g", "d", "e"]);
assert.equal(mulligan.hand.length, 5);
assert.throws(() => campaignMode.mulligan(["a"], [0, 1], ["b"]));

assert.equal(campaignMode.addRingEnergy(5, 3), 6);
assert.equal(campaignMode.resonanceCost(1, 2), 0);
assert.equal(campaignMode.resonanceShield(1000), 120);
assert.equal(campaignMode.scoreBattle({ victory: true, hpRatio: 0.9, damageTakenRatio: 0.1, rounds: 6, difficulty: "hard" }), "S");
assert.equal(campaignMode.authorizeStage({ unlockedStage: 1 }, 2), false);
assert.equal(campaignMode.clampStage({ unlockedStage: 1 }, 4), 1);
const normalized = campaignMode.normalizeProgress({ version: 1, characters: { lisaya: { unlockedStage: 999, completed: "yes" } }, recentBattles: null }, campaignData.characters);
assert.equal(normalized.characters.lisaya.unlockedStage, 5);
assert.equal(normalized.characters.lisaya.completed, true);
assert.equal(normalized.characters.su.unlockedStage, 1);
assert.equal(normalized.recentBattles.length, 0);
const passiveFlags = { turn: {}, match: {} };
assert.equal(campaignMode.passiveAllowed(passiveFlags, "lisaya", "turn"), true);
const consumedTurn = campaignMode.consumePassive(passiveFlags, "lisaya", "turn");
assert.equal(campaignMode.passiveAllowed(consumedTurn, "lisaya", "turn"), false);
assert.equal(campaignMode.consumePassive({ turn: {}, match: {} }, "lisaya", "match").match.lisaya, true);
assert.equal(campaignMode.enemyResonanceChoice({ hpRatio: .2, playerThreat: true, hand: [], energy: 2 }), "guard");
assert.equal(campaignMode.enemyResonanceChoice({ hpRatio: .8, playerThreat: false, hand: [{ skillTier: "special", cost: 5 }, { skillTier: "normal" }, { skillTier: "normal" }], energy: 8 }), "star");
assert.equal(campaignMode.shouldEnterBossPhase({ hpRatio: .49, phaseTriggered: false }), true);
assert.equal(campaignMode.shouldEnterBossPhase({ hpRatio: .4, phaseTriggered: true }), false);
assert.equal(campaignMode.recentBattles([{ id: 1 }], Array.from({ length: 25 }, (_, id) => ({ id: id + 2 }))).length, 20);
assert.deepEqual(Array.from(campaignMode.resultActions({ victory: true, stage: 4 })), ["next", "retry", "route", "home"]);
assert.deepEqual(Array.from(campaignMode.resultActions({ victory: true, stage: 5 })), ["retry", "route", "home"]);
const resonanceState = { campaign: { costReduction: 2, enemyCostReduction: 2 } };
assert.equal(campaignMode.effectiveCardCost(resonanceState, "player", { cost: 7 }), 5);
assert.equal(campaignMode.effectiveCardCost(resonanceState, "enemy", { cost: 7 }), 5);
assert.equal(campaignMode.effectiveCardCost({ campaign: {} }, "player", { cost: 1 }), 1);
assert.equal(campaignMode.effectiveCardCost(resonanceState, "player", { cost: 1 }), 0);
campaignMode.expireResonance(resonanceState, "player");
assert.equal(resonanceState.campaign.costReduction, 0);
assert.equal(resonanceState.campaign.enemyCostReduction, 2);
campaignMode.expireResonance(resonanceState, "enemy");
assert.equal(resonanceState.campaign.enemyCostReduction, 0);
const intentCard = { instanceId: "enemy-card-1", name: "高阶技能", skillTier: "advanced", effectType: "attack", power: 70, cost: 7, effectiveCost: 5 };
const formalIntent = campaignMode.intentFor([intentCard], 5, "aggressive");
assert.equal(formalIntent.card.instanceId, "enemy-card-1");
assert.equal(campaignMode.isFormalIntent({ type: "高级技能", cardInstanceId: formalIntent.card.instanceId, description: "准备高级技能", generatedRound: 2 }), true);
assert.equal(campaignMode.isFormalIntent({ type: "高级技能", cardInstanceId: null, description: "准备高级技能", generatedRound: 2 }), false);
assert.equal(campaignMode.projectedEnergy(4, 10), 5);
assert.equal(campaignMode.projectedEnergy(4, 10, 1), 4);
assert.equal(campaignMode.passiveTriggerState("moluo", { turn: {}, match: {} }, "extraEnergy").match.moluo, true);
assert.equal(campaignMode.passiveTriggerState("moluo", { turn: {}, match: { moluo: true } }, "extraEnergy"), null);
let moluoFlags = { turn: {}, match: {} };
for (let round = 1; round <= 3; round += 1) {
  const next = campaignMode.passiveTriggerState("moluo", moluoFlags, "extraEnergy");
  if (round === 1) assert.equal(next.match.moluo, true);
  else assert.equal(next, null);
  moluoFlags = next || moluoFlags;
}
assert.equal(campaignMode.aiCardScore({ name: "诅咒", effectType: "curse", power: 10, cost: 3 }, { style: "curse", playerHasCurse: false }), 40);
assert.ok(campaignMode.aiCardScore({ name: "冻结", effectType: "freeze", power: 10, cost: 3 }, { style: "control", handSize: 1 }) > campaignMode.aiCardScore({ name: "普通攻击", effectType: "attack", power: 10, cost: 3 }, { style: "control", handSize: 1 }));
const stat = campaignMode.createCombatStats();
campaignMode.recordCombatEvent(stat, { type: "damage", amount: 100 });
campaignMode.recordCombatEvent(stat, { type: "damage", amount: 40, summon: true });
campaignMode.recordCombatEvent(stat, { type: "heal", amount: 80 });
campaignMode.recordCombatEvent(stat, { type: "shield", amount: 50 });
campaignMode.recordCombatEvent(stat, { type: "shieldAbsorbed", amount: 20 });
assert.deepEqual({ damage: stat.damage, highestDamage: stat.highestDamage, summonDamage: stat.summonDamage, healing: stat.healing, shield: stat.shield, shieldAbsorbed: stat.shieldAbsorbed }, { damage: 140, highestDamage: 100, summonDamage: 40, healing: 80, shield: 50, shieldAbsorbed: 20 });
assert.equal(campaignMode.drawCount(5, 7), 2);
console.log("战役纯逻辑与数据验证通过。");
