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
assert.match(gameSource, /this\.state\?\.campaign && actor\.id === "player"\).*recordCombatEvent/);
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
