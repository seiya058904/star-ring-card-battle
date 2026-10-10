import assert from "node:assert/strict";
import { createSimRuntime } from "./balance-harness.mjs";

// Load the complete production override chain through the existing harness.
// Only animation/DOM are adapted; damage, talents, status ticks and campaign hooks stay real.
let cases = 0;
const passed = () => { cases += 1; };

async function sandbox(playerId = "orc-moluo", enemyId = "human-luolinfo") {
  const rt = await createSimRuntime();
  rt.setSeed(123);
  const playerDeck = rt.fixedCardLibrary.createRuntimeDeck(playerId);
  const enemyDeck = rt.fixedCardLibrary.createRuntimeDeck(enemyId);
  const state = rt.gameEngine.start(playerDeck, enemyDeck);
  await rt.drain();
  return { rt, state, playerDeck, enemyDeck };
}
async function campaign(character = "lisaya", stage = 5) {
  const rt = await createSimRuntime();
  rt.setSeed(123);
  rt.seedProgress();
  rt.campaignUiHarness.select(character, stage, "normal");
  const state = rt.campaignUiHarness.start();
  await rt.drain();
  return { rt, state };
}
const round = value => Math.max(0, Math.round(value));
const rawAfterElement = (rt, target, amount, element) => round(amount * rt.context.elementMultiplier(element, target).multiplier);
function aboveThreshold(target, damage) {
  target.hp = Math.ceil(target.maxHp * .35) + Math.floor(damage / 2);
  target.shield = 0;
  return target.hp;
}
function summonFor(owner, power) {
  return { id: `health-regression-${owner.id}`, name: "测试协击", ownerId: owner.id, hp: owner.maxHp, maxHp: owner.maxHp, power };
}

// C1: Split damage must carry the actual guard event through the final applyCard result.
for (const guardHp of [1000000, 1]) {
  const { rt, state, playerDeck } = await sandbox("human-luolinfo", "orc-moluo");
  const guard = summonFor(state.enemy, 1);
  guard.hp = guardHp;
  state.enemy.summons = [guard];
  const card = playerDeck.cards.find(item => item.name === "普通攻击");
  const result = rt.gameEngine.applyCard(state.player, state.enemy, card);
  assert.ok(guard.hp < guardHp, "the actual guard must take damage");
  assert.equal(result.summonGuard?.id, guard.id, "the visual event must retain the guard even when it dies");
  assert.equal(result.summonGuard?.amount, guardHp - guard.hp);
  assert.equal(result.summonGuard?.ownerId, "enemy");
  assert.equal(result.amount, result.visualAmounts[0].amount + result.summonGuard.amount);
  passed();
}
{
  const { rt, state, playerDeck } = await sandbox("human-luolinfo", "orc-moluo");
  const guard = summonFor(state.enemy, 1);
  state.enemy.summons = [guard];
  state.enemy.shield = state.enemy.maxHp;
  const result = rt.gameEngine.applyCard(state.player, state.enemy, playerDeck.cards.find(item => item.name === "普通攻击"));
  assert.equal(result.summonGuard, null, "fully blocked damage must not invent a guard hit");
  assert.equal(guard.hp, guard.maxHp);
  state.enemy.hp = 0;
  assert.equal(rt.gameEngine.resolveDamage({ source: state.player, target: state.enemy, amount: 100 }).guard, null);
  passed();
}

// C2: Human and godkin share the existing 8% talent on card, DOT and summon damage.
for (const enemyId of ["human-luolinfo", "godkin-su"]) {
  for (const sourceKind of ["card", "dot", "summon"]) {
    const { rt, state, playerDeck } = await sandbox("orc-moluo", enemyId);
    const target = state.enemy;
    let damage;
    let before;
    if (sourceKind === "card") {
      const card = playerDeck.cards.find(item => item.name === "普通攻击");
      damage = rt.context.resolveCardEffectAmount(card.effects[0], state.player, card);
      before = aboveThreshold(target, damage);
      rt.gameEngine.applyCard(state.player, target, card);
    } else if (sourceKind === "dot") {
      const power = Math.round(target.maxHp * .03);
      damage = rawAfterElement(rt, target, power, "火");
      before = aboveThreshold(target, damage);
      rt.gameEngine.applyStatus(target, { status: "燃烧", turns: 2, power, sourceOwnerId: "player" });
      rt.gameEngine.beginTurn("enemy");
    } else {
      const power = Math.round(target.maxHp * .03);
      damage = rawAfterElement(rt, target, power, state.player.element);
      before = aboveThreshold(target, damage);
      state.player.summons = [summonFor(state.player, power)];
      rt.gameEngine.endTurn("player");
    }
    const gain = Math.round(target.maxHp * .08);
    assert.equal(target.hp, before - damage + gain, `${enemyId}/${sourceKind}: heal must retain the original 8% value`);
    assert.equal(target.shield, gain, `${enemyId}/${sourceKind}: shield must trigger exactly once`);
    assert.equal(target.talentUsed, true);
    assert.equal(state.log.filter(entry => entry.text.includes("触发天赋【均衡意志】")).length, 1);
    // Recheck below the threshold: the per-match flag must still prevent a second benefit.
    target.hp = Math.round(target.maxHp * .3);
    const onceHp = target.hp;
    assert.equal(rt.gameEngine.triggerBalancedWill(target), false);
    assert.equal(target.hp, onceHp);
    assert.equal(target.shield, gain);
    passed();
  }
}

// No HP change (shield / flat reduction) must not trigger a pending low-HP talent.
for (const sourceKind of ["dot", "summon"]) {
  const { rt, state } = await sandbox();
  const target = state.enemy;
  target.hp = Math.round(target.maxHp * .3);
  target.shield = target.maxHp;
  const before = target.hp;
  if (sourceKind === "dot") {
    rt.gameEngine.applyStatus(target, { status: "燃烧", turns: 1, power: 1000, sourceOwnerId: "player" });
    rt.gameEngine.beginTurn("enemy");
  } else {
    state.player.summons = [summonFor(state.player, 1000)];
    rt.gameEngine.endTurn("player");
  }
  assert.equal(target.hp, before);
  assert.equal(target.talentUsed, false);
  passed();
}
{
  const { rt, state } = await sandbox();
  state.enemy.hp = Math.round(state.enemy.maxHp * .3);
  rt.gameEngine.applyStatus(state.enemy, { status: "减伤", turns: 2, power: 1000, charges: 1 });
  state.player.summons = [summonFor(state.player, 100)];
  const before = state.enemy.hp;
  rt.gameEngine.endTurn("player");
  assert.equal(state.enemy.hp, before);
  assert.equal(state.enemy.talentUsed, false, "flat reduction that prevents HP damage must not trigger the talent");
  passed();
}

// Keep the old atomic-card timing: the talent belongs after all effects, never per damage hit.
{
  const { rt, state, playerDeck } = await sandbox();
  state.enemy.maxHp = 1000;
  state.enemy.hp = 400;
  const card = { ...playerDeck.cards.find(item => item.name === "普通攻击"), effects: [{ type: "damage", amount: 100 }, { type: "damage", amount: 100 }] };
  const result = rt.gameEngine.applyCard(state.player, state.enemy, card);
  assert.equal(result.amount, 200);
  assert.equal(state.enemy.hp, 280);
  assert.equal(state.enemy.shield, 80);
  assert.equal(result.popups.filter(item => item.type === "talent").length, 1);
  passed();
}

// Lisaya's campaign override remains exclusive: 10% healing, 8% shield, no ordinary talent.
for (const sourceKind of ["dot", "summon"]) {
  const { rt, state } = await campaign();
  const target = state.player;
  const power = Math.round(target.maxHp * .03);
  const element = sourceKind === "dot" ? "暗" : state.enemy.element;
  const damage = rawAfterElement(rt, target, power, element);
  const before = aboveThreshold(target, damage);
  if (sourceKind === "dot") {
    rt.gameEngine.applyStatus(target, { status: "诅咒", turns: 2, power, sourceOwnerId: "enemy" });
    rt.gameEngine.beginTurn("player");
  } else {
    state.turn = "enemy";
    state.enemy.summons = [summonFor(state.enemy, power)];
    rt.gameEngine.endTurn("enemy");
  }
  assert.equal(target.hp, before - damage + Math.round(target.maxHp * .1));
  assert.equal(target.shield, Math.round(target.maxHp * .08));
  assert.equal(target.talentUsed, false);
  assert.equal(state.campaign.passives.match.lisaya, true);
  assert.equal(state.campaignStats.passiveTriggers, 1);
  target.hp = Math.round(target.maxHp * .3);
  assert.equal(rt.gameEngine.triggerBalancedWill(target), false, "the ordinary talent must remain excluded after the campaign passive is consumed");
  passed();
}

// C4: Lisaya cleanses only the first negative status; both insertion orders matter.
for (const bindFirst of [true, false]) {
  const { rt, state } = await campaign();
  const fighter = state.player;
  const power = Math.round(fighter.maxHp * .04);
  aboveThreshold(fighter, rawAfterElement(rt, fighter, power, "暗"));
  const effects = [{ status: "禁锢", turns: 2 }, { status: "诅咒", turns: 2, power, sourceOwnerId: "enemy" }];
  for (const effect of bindFirst ? effects : effects.slice().reverse()) rt.gameEngine.applyStatus(fighter, effect);
  rt.gameEngine.beginTurn("player");
  assert.equal(state.campaign.passives.match.lisaya, true);
  assert.equal(state.campaignStats.passiveTriggers, 1);
  assert.equal(fighter.statuses.some(status => status.type === "禁锢"), !bindFirst);
  assert.equal(fighter.skipAction, !bindFirst, "only a surviving bind may suppress actions after the health hook");
  assert.equal(fighter.controlImmuneTurns, 0, "a cleansed bind must not masquerade as a naturally expired bind");
  passed();
}

// A hook may remove an as-yet-unvisited snapshot member. It must not still deal damage or bind.
{
  const { rt, state } = await sandbox("orc-moluo", "orc-xindi");
  rt.gameEngine.applyStatus(state.enemy, { status: "燃烧", turns: 2, power: 100, sourceOwnerId: "player" });
  rt.gameEngine.applyStatus(state.enemy, { status: "诅咒", turns: 2, power: 1000, sourceOwnerId: "player" });
  rt.gameEngine.applyStatus(state.enemy, { status: "禁锢", turns: 2 });
  rt.context.registerCampaignHealthChangeHook(fighter => {
    fighter.statuses = fighter.statuses.filter(status => status.type === "燃烧");
  });
  const result = rt.gameEngine.tickStatuses(state.enemy);
  assert.equal(result.dotEvents.length, 1, "a removed pending DOT must not execute from the old snapshot");
  assert.equal(state.enemy.skipAction, false, "a removed pending bind must not lock the turn");
  passed();
}

// Natural expiry still suppresses the current turn and grants the original one-turn immunity.
{
  const { rt, state } = await sandbox();
  const fighter = state.enemy;
  rt.gameEngine.applyStatus(fighter, { status: "禁锢", turns: 1 });
  rt.gameEngine.tickStatuses(fighter);
  assert.equal(fighter.skipAction, true);
  assert.equal(fighter.statuses.some(status => status.type === "禁锢"), false);
  assert.equal(fighter.controlImmuneTurns, 1);
  assert.equal(rt.gameEngine.applyStatus(fighter, { status: "禁锢", turns: 2 }), null);
  rt.gameEngine.tickStatuses(fighter);
  assert.equal(fighter.skipAction, false);
  assert.equal(fighter.controlImmuneTurns, 0);
  assert.ok(rt.gameEngine.applyStatus(fighter, { status: "禁锢", turns: 2 }));
  passed();
}
// Non-card low-HP recovery is not revival: lethal DOT/assist must retain the existing death boundary.
for (const playerId of ["human-luolinfo", "godkin-su"]) {
  for (const sourceKind of ["dot", "summon"]) {
    const { rt, state } = await sandbox(playerId, "orc-moluo");
    const target = state.player;
    target.hp = 20;
    target.shield = 0;
    if (sourceKind === "dot") {
      rt.gameEngine.applyStatus(target, { status: "燃烧", turns: 1, power: 100, sourceOwnerId: "enemy" });
      rt.gameEngine.beginTurn("player");
    } else {
      state.turn = "enemy";
      state.enemy.summons = [summonFor(state.enemy, 100)];
      rt.gameEngine.endTurn("enemy");
    }
    assert.equal(target.hp, 0, `${playerId}/${sourceKind}: lethal damage must not gain implicit revival`);
    assert.equal(target.talentUsed, false, "death must not consume an ordinary low-HP talent");
    assert.equal(target.shield, 0);
    assert.equal(state.combatStats.revived, false);
    assert.equal(state.gameOver, true);
    assert.equal(state.winner, "enemy");
    assert.equal(rt.gameEngine.playCard("player", target.hand[0]?.instanceId), false);
    passed();
  }
}

// Explicit revival remains inside resolveDamage, before post-damage talents and game-over checks.
for (const playerId of ["human-luolinfo", "godkin-su"]) {
  for (const sourceKind of ["dot", "summon"]) {
    const { rt, state } = await sandbox(playerId, "orc-moluo");
    const target = state.player;
    target.hp = 20;
    const revivalHp = Math.round(target.maxHp * .5);
    rt.gameEngine.applyStatus(target, { status: "复生", persistent: true, power: revivalHp, charges: 1 });
    if (sourceKind === "dot") {
      rt.gameEngine.applyStatus(target, { status: "燃烧", turns: 1, power: 100, sourceOwnerId: "enemy" });
      rt.gameEngine.beginTurn("player");
    } else {
      state.turn = "enemy";
      state.enemy.summons = [summonFor(state.enemy, 100)];
      rt.gameEngine.endTurn("enemy");
    }
    assert.equal(target.hp, revivalHp, `${playerId}/${sourceKind}: explicit revival must keep its own recovery amount`);
    assert.equal(target.statuses.some(status => status.type === "复生"), false, "explicit revival must be consumed");
    assert.equal(state.combatStats.revived, true);
    assert.equal(target.talentUsed, false, "the half-health revival must be resolved before checking the low-HP talent");
    assert.equal(target.shield, 0);
    assert.equal(state.gameOver, false);
    passed();
  }
}

// The pre-existing card-end lethal talent behavior is deliberately preserved separately.
{
  const { rt, state, playerDeck } = await sandbox();
  state.enemy.maxHp = 1000;
  state.enemy.hp = 20;
  const card = { ...playerDeck.cards.find(item => item.name === "普通攻击"), effects: [{ type: "damage", amount: 100 }] };
  rt.gameEngine.applyCard(state.player, state.enemy, card);
  assert.equal(state.enemy.hp, 80, "the existing whole-card-end recovery must remain unchanged");
  assert.equal(state.enemy.shield, 80);
  assert.equal(state.enemy.talentUsed, true);
  passed();
}
console.log(`combat health regressions: ${cases}/${cases} PASS (guard events, source-complete talents, atomic card order, cleanse/control lifecycle)`);
