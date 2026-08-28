(function (global) {
  "use strict";

  const mode = global.campaignMode;
  const battleRules = global.battleRules;

  function campaignStatsPassive(state) {
    state.campaignStats.passiveTriggers += 1;
  }

  function ensureCampaignPassives(state) {
    state.campaign.passives ||= { turn: {}, match: {}, round: state.round };
  }

  function resetCampaignTurnPassives(state) {
    state.campaign.passives ||= { turn: {}, match: {}, round: 0 };
    if (state.campaign.passives.round !== state.round) {
      state.campaign.passives.round = state.round;
      state.campaign.passives.turn = {};
    }
  }

  function refreshCampaignEnemyIntent(state) {
    const currentRound = state.round;
    const energyPenalty = state.enemy.statuses.some(status => status.type === "冻结") ? 1 : 0;
    const enemyEnergy = battleRules.roundEnergy(currentRound, state.enemy.maxEnergy, energyPenalty);
    const plan = mode.intentFor(state.enemy.hand.map(card => ({ ...card, effectiveCost: mode.effectiveCardCost(state, "enemy", card) })), enemyEnergy, state.enemy.campaignStyle, { actor: state.enemy, target: state.player, playerLowHp: state.player.hp / state.player.maxHp < .3, enemyLowHp: state.enemy.hp / state.enemy.maxHp < .35, handSize: state.enemy.hand.length, playerHasCurse: state.player.statuses.some(status => status.type === "诅咒") });
    state.campaign.intent = { type: plan.type, cardInstanceId: plan.card?.instanceId || "", description: `${state.enemy.name}正在准备${plan.type}。`, generatedRound: state.round };
  }

  function recordElementMatchup(state, side, card) {
    if (side !== "player" || !card || typeof global.cardHasAdvantageAgainst !== "function") return;
    if (global.cardHasAdvantageAgainst(card, state.enemy)) state.combatStats.elementalAdvantage += 1;
  }

  function beforeCampaignTurnEnd(state, side) {
    if (!state?.campaign) return;
    mode.expireResonance(state, side);
    if (side === "enemy") state.campaign.intent = null;
  }

  global.campaignRules = {
    campaignStatsPassive,
    ensureCampaignPassives,
    resetCampaignTurnPassives,
    refreshCampaignEnemyIntent,
    recordElementMatchup,
    beforeCampaignTurnEnd,
  };
})(globalThis);
