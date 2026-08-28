(function (global) {
  "use strict";

  const mode = global.campaignMode;
  const battleRules = global.battleRules;
  const campaignRules = global.campaignRules;
  const gameEngine = global.gameEngine;
  const aiController = global.aiController;

  let presentation = {
    renderHud() {},
    notice() {},
    playSound() {},
    playDrawSound() {},
  };

  function configurePresentation(adapter) {
    presentation = { ...presentation, ...adapter };
  }

  function recordCampaignCardPlay(state, side, card) {
    if (!state?.campaign) return;
    const ring = card.category === "base" ? 1 : card.skillTier === "special" ? 3 : card.skillTier === "advanced" ? 2 : 1;
    state.campaign[side === "player" ? "playerRing" : "enemyRing"] = mode.addRingEnergy(state.campaign[side === "player" ? "playerRing" : "enemyRing"], ring);
    if (side === "player") state.campaign.costReduction = 0;
    if (side === "enemy") state.campaign.enemyCostReduction = 0;
    presentation.renderHud();
  }

  function afterCampaignTurnEnd(state, side) {
    if (!state?.campaign) return;
    if (side === "enemy") state.campaign.resonanceUsed = false;
    presentation.renderHud();
    if (side === "enemy") state.campaign.enemyResonanceUsed = false;
  }

  function applyCampaignPlayerExtraEnergy(state) {
    if (!state.campaign.extraEnergyNext) return;
    state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + 1);
    state.campaign.extraEnergyNext = false;
    this.log("[战役被动] 兽王战意：本回合额外获得1点能量。");
    presentation.notice("摩罗哥：兽王战意");
  }

  function checkCampaignHealthThresholds(fighter, previousHp, context = {}) {
    const state = gameEngine.state;
    if (!state?.campaign || state.campaign.characterId !== "lisaya" || fighter.id !== "player" || previousHp / fighter.maxHp < .35 || fighter.hp / fighter.maxHp >= .35 || !mode.passiveAllowed(state.campaign.passives, "lisaya", "match")) return false;
    const negative = fighter.statuses.findIndex(status => ["燃烧", "冻结", "诅咒", "虚弱", "禁锢", "中毒"].includes(status.type));
    if (negative >= 0) fighter.statuses.splice(negative, 1);
    const requestedHeal = Math.round(fighter.maxHp * .1);
    const hpBefore = fighter.hp;
    fighter.hp = Math.min(fighter.maxHp, fighter.hp + requestedHeal);
    const actualHeal = fighter.hp - hpBefore;
    const shield = Math.round(fighter.maxHp * .08);
    fighter.shield += shield;
    state.campaign.passives = mode.consumePassive(state.campaign.passives, "lisaya", "match");
    state.campaignStats.passiveTriggers += 1;
    mode.recordCombatEvent(state.campaignStats, { type: "heal", amount: actualHeal });
    mode.recordCombatEvent(state.campaignStats, { type: "shield", amount: shield });
    gameEngine.log(`[战役被动] 胜利圣仪：净化、恢复${global.formatNumber(actualHeal)}生命并获得${global.formatNumber(shield)}护盾（${context.type || "生命阈值"}）。`);
    presentation.notice("丽莎娅：胜利圣仪");
    return true;
  }

  function checkCampaignBossPhase(enemy, previousHp) {
    const state = gameEngine.state;
    if (!state?.campaign || state.campaign.stage !== 5 || enemy?.id !== "enemy" || enemy.name !== "耶莫稣" || !mode.shouldEnterBossPhase({ hpRatio: enemy.hp / enemy.maxHp, phaseTriggered: Boolean(state.campaign.bossPhaseTriggered) }) || previousHp <= enemy.hp) return false;
    state.campaign.bossPhaseTriggered = true;
    const control = enemy.statuses.findIndex(status => ["冻结", "禁锢", "迟缓", "抽牌压制"].includes(status.type));
    if (control >= 0) enemy.statuses.splice(control, 1);
    state.campaign.enemyRing = mode.addRingEnergy(state.campaign.enemyRing, 2);
    state.campaign.intent = null;
    gameEngine.log("[首领阶段] 龙神第二阶段：耶莫稣净化控制状态并获得2格星环。");
    presentation.notice("龙神第二阶段");
    presentation.playSound("advanced-skill");
    presentation.renderHud();
    return true;
  }

  function campaignPlayerPassiveBefore(actor, target, card) {
    const state = this.state;
    const campaign = state.campaign;
    if (actor.id !== "player") return null;
    campaignRules.ensureCampaignPassives(state);
    const id = campaign.characterId;
    const oldEffectMultiplier = card.effectMultiplier;
    const targetShieldBefore = target.shield;
    let triggered = false;
    const mark = scope => {
      campaign.passives = mode.consumePassive(campaign.passives, id, scope);
      campaignRules.campaignStatsPassive(state);
      triggered = true;
    };
    const hasDamage = card.effects?.some(effect => effect.type === "damage");
    const hasBurn = card.effects?.some(effect => effect.type === "status" && effect.status === "燃烧");
    if (id === "luolinfo" && card.element === "雷" && hasDamage && mode.passiveAllowed(campaign.passives, id, "turn")) {
      card.effectMultiplier = 1.15;
      mark("turn");
    } else if (id === "su" && ["光", "暗", "雷"].includes(card.element) && global.getCardActionIntent(card) === "hostile-damage" && mode.passiveAllowed(campaign.passives, id, "turn")) {
      card.effectMultiplier = 1.10;
      mark("turn");
    } else if (id === "moluo" && actor.hp / actor.maxHp < .5 && (hasDamage || hasBurn)) {
      card.effectMultiplier = 1.12;
      if (actor.hp / actor.maxHp < .3 && mode.passiveAllowed(campaign.passives, id, "match")) {
        campaign.extraEnergyNext = true;
        campaign.passives = mode.consumePassive(campaign.passives, id, "match");
        campaignRules.campaignStatsPassive(state);
        this.log("[战役被动] 兽王战意：下一回合额外获得1点能量。");
        presentation.notice("摩罗哥：兽王战意");
      }
    }
    const beforeHp = actor.hp;
    return { id, oldEffectMultiplier, targetShieldBefore, triggered, beforeHp, mark };
  }

  function campaignPlayerPassiveAfter(actor, target, card, pre) {
    if (!pre) return;
    const state = this.state;
    const campaign = state.campaign;
    const { id, oldEffectMultiplier, targetShieldBefore, triggered, beforeHp, mark } = pre;
    card.effectMultiplier = oldEffectMultiplier;
    if (id === "luolinfo" && triggered && target.shield < targetShieldBefore) target.shield = Math.max(0, target.shield - Math.round(target.shield * .1));
    if (id === "eluxia" && ["冰", "风"].includes(card.element) && mode.passiveAllowed(campaign.passives, id, "turn")) {
      this.draw(actor, 1);
      mark("turn");
      this.log("[战役被动] 寒风猎场：额外抽1张牌。");
    }
    if (id === "lisaya" && beforeHp / actor.maxHp >= .35 && actor.hp / actor.maxHp < .35 && mode.passiveAllowed(campaign.passives, id, "match")) {
      const negative = actor.statuses.findIndex(status => ["燃烧", "冻结", "诅咒", "虚弱", "禁锢", "中毒"].includes(status.type));
      if (negative >= 0) actor.statuses.splice(negative, 1);
      const requestedHeal = Math.round(actor.maxHp * .1);
      const hpBefore = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + requestedHeal);
      const actualHeal = actor.hp - hpBefore;
      const shield = Math.round(actor.maxHp * .08);
      actor.shield += shield;
      mark("match");
      mode.recordCombatEvent(state.campaignStats, { type: "heal", amount: actualHeal });
      mode.recordCombatEvent(state.campaignStats, { type: "shield", amount: shield });
      this.log(`[战役被动] 胜利圣仪：净化、恢复${global.formatNumber(actualHeal)}生命并获得${global.formatNumber(shield)}护盾。`);
      presentation.notice("丽莎娅：胜利圣仪");
    }
    if (id === "su" && target === actor) {
      const negative = actor.statuses.find(status => ["燃烧", "冻结", "诅咒", "虚弱", "禁锢", "中毒"].includes(status.type));
      if (negative && mode.passiveAllowed(campaign.passives, id, "match")) {
        actor.statuses = actor.statuses.filter(status => status !== negative);
        mark("match");
        this.log("[战役被动] 三相神血：免疫一次负面状态。");
        presentation.notice("苏：神血免疫");
      }
    }
  }

  function campaignBossAndEnemyPassiveAfter(actor, target, card, beforeStatuses) {
    const state = this.state;
    const campaign = state.campaign;
    if (campaign.stage === 5 && target.id === "enemy" && target.name === "耶莫稣" && mode.shouldEnterBossPhase({ hpRatio: target.hp / target.maxHp, phaseTriggered: Boolean(campaign.bossPhaseTriggered) })) {
      campaign.bossPhaseTriggered = true;
      const control = target.statuses.findIndex(status => ["冻结", "禁锢", "迟缓", "抽牌压制"].includes(status.type));
      if (control >= 0) target.statuses.splice(control, 1);
      campaign.enemyRing = mode.addRingEnergy(campaign.enemyRing, 2);
      campaign.intent = null;
      this.log("[首领阶段] 龙神第二阶段：耶莫稣净化控制状态并获得2格星环。");
      presentation.notice("龙神第二阶段");
      presentation.playSound("advanced-skill");
      presentation.renderHud();
    }
    if (campaign.characterId === "su" && actor.id === "enemy" && target.id === "player" && mode.passiveAllowed(campaign.passives, "su", "match")) {
      const added = target.statuses.find(status => !beforeStatuses.includes(status) && ["燃烧", "冻结", "诅咒", "虚弱", "禁锢", "中毒"].includes(status.type));
      if (added) {
        target.statuses = target.statuses.filter(status => status !== added);
        campaign.passives = mode.consumePassive(campaign.passives, "su", "match");
        state.campaignStats.passiveTriggers += 1;
        this.log("[战役被动] 三相神血：免疫一次负面状态。");
        presentation.notice("苏：神血免疫");
      }
    }
  }

  function campaignHealthThresholdAfter(actor, target, card, targetHp) {
    if (target.id === "player") checkCampaignHealthThresholds(target, targetHp, { type: "card" });
    if (target.id === "enemy") checkCampaignBossPhase(target, targetHp);
  }

  function campaignPassiveNoticeAfter(actor, target, card) {
    const state = this.state;
    if (state?.campaign && actor.id === "player" && ["luolinfo", "su"].includes(state.campaign.characterId) && state.campaign.passives.turn[state.campaign.characterId] && state.campaign.passiveNoticeRound?.[state.campaign.characterId] !== state.round) {
      state.campaign.passiveNoticeRound ||= {};
      state.campaign.passiveNoticeRound[state.campaign.characterId] = state.round;
      presentation.notice(state.campaign.characterId === "luolinfo" ? "罗林福：雷金剑势" : "苏：三相神血");
    }
  }

  function processCampaignStatusTickPassive(state, fighter, result) {
    if (!state?.campaign || state.campaign.characterId !== "heka" || fighter.id !== "enemy" || !(result.playerDotDamage > 0)) return;
    const requestedHeal = Math.min(Math.round(result.playerDotDamage * .2), Math.round(state.player.maxHp * .05));
    const hpBefore = state.player.hp;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + requestedHeal);
    const actualHeal = state.player.hp - hpBefore;
    mode.recordCombatEvent(state.combatStats, { type: "heal", amount: actualHeal });
    state.combatStats.passiveTriggers += 1;
    this.log(`[战役被动] 灰烬血契：持续伤害吸血恢复${global.formatNumber(actualHeal)}生命。`);
    presentation.notice("赫卡莫斯：灰烬血契");
  }

  function processCampaignPostStatusTick(state, fighter, beforeHp) {
    if (!state?.campaign) return;
    checkCampaignHealthThresholds(fighter, beforeHp, { type: "status" });
    checkCampaignBossPhase(fighter, beforeHp);
  }

  function activateEnemyResonance(state) {
    if (state.campaign.enemyRing < 6 || state.campaign.enemyResonanceUsed) return false;
    const enemy = state.enemy;
    const choice = mode.enemyResonanceChoice({ hpRatio: enemy.hp / enemy.maxHp, playerThreat: state.campaignStats.highestDamage > enemy.maxHp * .12, hand: enemy.hand, energy: enemy.energy });
    state.campaign.enemyRing = 0;
    state.campaign.enemyResonanceUsed = true;
    mode.recordCombatEvent(state.campaignStats, { type: "resonance", side: "enemy" });
    if (choice === "guard") {
      const shield = mode.resonanceShield(enemy.maxHp);
      enemy.shield += shield;
    }
    if (choice === "echo") {
      gameEngine.draw(enemy, 2);
      enemy.energy = Math.min(enemy.maxEnergy, enemy.energy + 1);
    }
    if (choice === "star") state.campaign.enemyCostReduction = 2;
    gameEngine.log(`[星环共鸣] ${enemy.name}激活${choice === "guard" ? "守环" : choice === "echo" ? "回响" : "星耀"}。`);
    presentation.notice(`${enemy.name}：星环共鸣`);
    presentation.playSound("resonance-activate");
    presentation.renderHud();
    return true;
  }

  function skipEnemyControlledTurn(state) {
    if (!state.enemy.skipAction) return false;
    const sessionId = gameEngine.sessionId;
    const controlStatus = state.enemy.statuses.find(s => s.type === "禁锢");
    gameEngine.log(`[控制] ${state.enemy.name} 被${controlStatus?.type || "控制"}束缚，无法行动。`);
    setTimeout(() => {
      if (gameEngine.isActiveBattle(state, sessionId)) gameEngine.resolveAction({ type: "endTurn", side: "enemy" });
    }, 650);
    return true;
  }

  function playCampaignDrawSound(fighter, beforeHandSize) {
    if (mode.drawCount(beforeHandSize, fighter.hand.length) > 0) presentation.playDrawSound();
  }

  const waitForCombatIdle = (sessionId = gameEngine.sessionId, timeoutMs = 8000) => new Promise(resolve => {
    const startedAt = Date.now();
    const poll = Math.max(8, global.battleSpeedDelay ? global.battleSpeedDelay(40) : 40);
    const check = () => {
      if (sessionId != null && gameEngine.sessionId !== sessionId) return resolve();
      if (!gameEngine.state || gameEngine.state.gameOver) return resolve();
      if (Date.now() - startedAt >= timeoutMs) return resolve();
      if (!gameEngine.state.actionLocked && !global.effectsRenderer?._playLock && !global.hasPendingOverrides()) return resolve();
      setTimeout(check, poll);
    };
    check();
  });

  async function runSandboxAiTurn(state) {
    while (gameEngine.state === state && !state.gameOver && state.turn === "enemy") {
      const card = this.chooseCard(state.enemy, state.player);
      if (!card) { gameEngine.resolveAction({ type: "endTurn", side: "enemy" }); return; }
      const played = gameEngine.resolveAction({ type: "playCard", side: "enemy", cardInstanceId: card.instanceId });
      if (!played) { await waitForCombatIdle(); continue; }
      await waitForCombatIdle();
    }
  }

  function chooseCampaignAiCard(state) {
    let card = state.campaign.intent?.cardInstanceId ? state.enemy.hand.find(item => item.instanceId === state.campaign.intent.cardInstanceId && mode.effectiveCardCost(state, "enemy", item) <= state.enemy.energy) : null;
    if (!card && state.campaign.intent?.cardInstanceId) {
      gameEngine.log("[意图] 敌方重新调整战术。");
      presentation.playSound("resonance-ready");
      const plan = mode.intentFor(state.enemy.hand.map(card => ({ ...card, effectiveCost: mode.effectiveCardCost(state, "enemy", card) })), state.enemy.energy, state.enemy.campaignStyle, { actor: state.enemy, target: state.player, playerLowHp: state.player.hp / state.player.maxHp < .3, enemyLowHp: state.enemy.hp / state.enemy.maxHp < .35, handSize: state.enemy.hand.length, playerHasCurse: state.player.statuses.some(status => status.type === "诅咒") });
      state.campaign.intent = { type: plan.type, cardInstanceId: plan.card?.instanceId || "", description: `${state.enemy.name}重新调整战术，准备${plan.type}。`, generatedRound: state.round };
      presentation.renderHud();
      card = plan.card;
    }
    card ||= this.chooseCard(state.enemy, state.player);
    if (card && !state.campaign.intent) {
      const intentType = card.skillTier === "special" ? "特殊技能" : card.skillTier === "advanced" ? "高级技能" : ["shield", "defense"].includes(card.effectType) ? "防御" : ["heal", "revive"].includes(card.effectType) ? "治疗" : ["control", "freeze"].includes(card.effectType) ? "控制" : "普通攻击";
      state.campaign.intent = { type: intentType, cardInstanceId: card.instanceId, description: `${state.enemy.name}借助星耀准备${intentType}。`, generatedRound: state.round };
      presentation.renderHud();
    }
    return card;
  }

  async function runCampaignAiTurn(state, sessionId) {
    const resonanceActivated = activateEnemyResonance(state);
    if (resonanceActivated && state.campaign.enemyCostReduction > 0) {
      state.campaign.intent = null;
      gameEngine.log("[意图] 敌方借助星耀调整了战术。");
      presentation.playSound("resonance-ready");
    }
    let _aiSteps = 0;
    while (gameEngine.isActiveBattle(state, sessionId) && !state.gameOver && state.turn === "enemy" && _aiSteps < 15) {
      _aiSteps += 1;
      const card = chooseCampaignAiCard.call(this, state);
      if (!card) { gameEngine.resolveAction({ type: "endTurn", side: "enemy" }); return; }
      const played = gameEngine.resolveAction({ type: "playCard", side: "enemy", cardInstanceId: card.instanceId });
      if (!played) { await waitForCombatIdle(); continue; }
      state.campaign.intent = null;
      await waitForCombatIdle();
      activateEnemyResonance(state);
    }
    if (_aiSteps >= 15) {
      gameEngine.log("[AI] 敌方达到行动上限，强制结束回合。");
      gameEngine.resolveAction({ type: "endTurn", side: "enemy" });
    }
  }

  function install() {
    if (install.installed) return;
    install.installed = true;

    const basePlayCard = gameEngine.playCard.bind(gameEngine);
    gameEngine.playCard = function (side, instanceId) {
      const state = this.state;
      const actor = state?.[side];
      const card = actor?.hand.find(item => item.instanceId === instanceId);
      if (!card) return false;
      const result = basePlayCard.call(this, side, instanceId);
      if (!result) return result;
      recordCampaignCardPlay(state, side, card);
      campaignRules.recordElementMatchup(state, side, card);
      return result;
    };

    const baseEndTurn = gameEngine.endTurn.bind(gameEngine);
    gameEngine.endTurn = function (side) {
      const stateBefore = this.state;
      campaignRules.beforeCampaignTurnEnd(stateBefore, side);
      const result = baseEndTurn.call(this, side);
      afterCampaignTurnEnd(this.state, side);
      return result;
    };

    const baseBeginTurn = gameEngine.beginTurn.bind(gameEngine);
    gameEngine.beginTurn = function (side) {
      const result = baseBeginTurn.call(this, side);
      const state = this.state;
      if (!state?.campaign) return result;
      campaignRules.resetCampaignTurnPassives(state);
      if (side === "player") {
        applyCampaignPlayerExtraEnergy.call(this, state);
        campaignRules.refreshCampaignEnemyIntent(state);
      }
      return result;
    };

    const baseApplyCard = gameEngine.applyCard.bind(gameEngine);
    gameEngine.applyCard = function (actor, target, card) {
      const state = this.state;
      if (!state?.campaign) return baseApplyCard.call(this, actor, target, card);
      const targetHp = target.hp;
      const beforeStatuses = target.statuses.slice();
      const pre = campaignPlayerPassiveBefore.call(this, actor, target, card);
      const result = baseApplyCard.call(this, actor, target, card);
      campaignPlayerPassiveAfter.call(this, actor, target, card, pre);
      campaignBossAndEnemyPassiveAfter.call(this, actor, target, card, beforeStatuses);
      campaignHealthThresholdAfter.call(this, actor, target, card, targetHp);
      campaignPassiveNoticeAfter.call(this, actor, target, card);
      return result;
    };

    const baseTickStatuses = gameEngine.tickStatuses.bind(gameEngine);
    gameEngine.tickStatuses = function (fighter) {
      const state = this.state;
      const beforeHp = fighter.hp;
      const result = baseTickStatuses.call(this, fighter);
      processCampaignStatusTickPassive.call(this, state, fighter, result);
      processCampaignPostStatusTick(state, fighter, beforeHp);
      return result;
    };

    const originalChooseCard = aiController.chooseCard.bind(aiController);
    aiController.chooseCard = function (enemy, player) {
      const state = gameEngine.state;
      if (!state?.campaign) return originalChooseCard(enemy, player);
      const playable = enemy.hand.filter(card => mode.effectiveCardCost(state, "enemy", card) <= enemy.energy);
      if (!playable.length) return null;
      const context = { actor: enemy, target: player, style: enemy.campaignStyle, playerLowHp: player.hp / player.maxHp < .3, enemyLowHp: enemy.hp / enemy.maxHp < .35, handSize: enemy.hand.length, playerHasCurse: player.statuses.some(status => status.type === "诅咒") };
      return playable.slice().sort((a, b) => mode.aiCardScore(b, context) - mode.aiCardScore(a, context))[0];
    };

    aiController.takeTurn = async function () {
      const state = gameEngine.state;
      const sessionId = gameEngine.sessionId;
      if (!state || state.gameOver || state.turn !== "enemy") return;
      if (skipEnemyControlledTurn(state)) return;
      await waitForCombatIdle();
      if (!state.campaign) {
        await runSandboxAiTurn.call(this, state);
        return;
      }
      await runCampaignAiTurn.call(this, state, sessionId);
    };

    const baseDraw = gameEngine.draw.bind(gameEngine);
    gameEngine.draw = function (fighter, amount = 1) {
      const before = fighter.hand.length;
      const result = baseDraw.call(this, fighter, amount);
      playCampaignDrawSound(fighter, before);
      return result;
    };
  }

  global.checkCampaignHealthThresholds = checkCampaignHealthThresholds;
  global.checkCampaignBossPhase = checkCampaignBossPhase;
  global.campaignRuntime = {
    configurePresentation,
    install,
  };
})(globalThis);
