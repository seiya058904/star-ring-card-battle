(function (global) {
  "use strict";

  const { battleRules: rules, fixedCardLibrary: library, gameEngine, uiRenderer, aiController } = global;
  if (!rules || !library || !gameEngine) throw new Error("固定战斗规则加载顺序错误");

  const STATUS_LABELS = { "燃烧":"每回合开始造成持续伤害（最多3层）", "诅咒":"每回合开始造成持续伤害（取最高值）", "冻结":"下回合能量 -1", "禁锢":"本回合不能行动，结束后获得控制抗性", "增幅":"伤害提高", "虚弱":"受到伤害提高", "减伤":"受到伤害降低", "闪避":"有概率闪避攻击", "连锁":"下一次伤害提高" };
  const rounded = value => Math.max(0, Math.round(Number(value) || 0));
  // 战斗时按等级 × ratio × 职业档案算出实际数值
  const effectAmount = (fighter, effect) => {
    const fn = typeof globalThis.resolveEffectAmount === "function" ? globalThis.resolveEffectAmount : (e, a, c) => Math.max(0, Math.round(Number(e?.amount || 0)));
    return fn(effect, fighter, null);
  };

  global.fixedCardDescription = function fixedCardDescription(card, ctx) {
    const descValue = effect => {
      if (!ctx || !ctx.level) return "?";
      const normRace = typeof normalizeRace === "function" ? normalizeRace(ctx.race || "人族") : "人族";
      const normProf = typeof normalizeProfession === "function" ? normalizeProfession(ctx.profession || "战士") : "战士";
      const prof = typeof combinedProfile === "function" ? combinedProfile(normRace, normProf) : { damage: 1, heal: 1, defense: 1 };
      return effectAmount({ level: ctx.level, profile: prof }, effect);
    };
    const parts = card.effects.map(effect => {
      if (effect.type === "damage") {
        const v = descValue(effect);
        return `造成 ${typeof v === "number" ? formatNumber(v) : v} 伤害${effect.pierce ? `（穿透 ${Math.round(effect.pierce * 100)}% 护盾）` : ""}`;
      }
      if (effect.type === "heal") {
        const v = descValue(effect);
        return `恢复 ${typeof v === "number" ? formatNumber(v) : v} 生命`;
      }
      if (effect.type === "shield") {
        const v = descValue(effect);
        return `获得 ${typeof v === "number" ? formatNumber(v) : v} 护盾（不自动衰减）`;
      }
      if (effect.type === "draw") return `抽 ${effect.amount} 张牌`;
      if (effect.type === "energy") return `获得 ${effect.amount} 点能量`;
      if (effect.type === "status") {
        if (["燃烧", "诅咒"].includes(effect.status)) {
          const v = effect.burnRatio !== undefined ? descValue(effect) : effect.amount;
          return `施加${effect.status}${effect.turns}回合：每回合 ${typeof v === "number" ? formatNumber(v) : 0} 伤害`;
        }
        return `施加${effect.status}${effect.turns ? `${effect.turns}回合` : ""}${STATUS_LABELS[effect.status] ? `：${STATUS_LABELS[effect.status]}` : ""}`;
      }
      if (effect.type === "summon") return "召唤协击单位";
      return effect.type;
    });
    return `${parts.join("；")}。${card.afterPlay === "exhaust" ? " 使用后消耗，本场不会洗回牌库。" : ""}`;
  };

  const originalMakeFighter = gameEngine.makeFighter.bind(gameEngine);
  gameEngine.makeFighter = function(name, deck, isPlayer) {
    const normalizedDeck = { ...deck, race: normalizeRace(deck.race), profession: normalizeProfession(deck.profession) };
    const fighter = originalMakeFighter(name, normalizedDeck, isPlayer);
    fighter.race = normalizedDeck.race;
    fighter.profession = normalizedDeck.profession;
    fighter.profile = combinedProfile(fighter.race, fighter.profession);
    fighter.exhaustPile = [];
    fighter.controlImmuneTurns = 0;
    return fighter;
  };

  gameEngine.draw = function(fighter, amount = 1) {
    let drawn = 0;
    for (let i = 0; i < amount; i += 1) {
      if (!fighter.drawPile.length) {
        fighter.drawPile = shuffle(fighter.discardPile);
        fighter.discardPile = [];
      }
      const card = fighter.drawPile.shift();
      if (!card) break;
      if (fighter.hand.length >= rules.HAND_LIMIT) {
        fighter.discardPile.push(card);
        this.log?.(`[手牌上限] ${fighter.name} 的手牌已满，「${card.name}」进入弃牌堆。`);
        continue;
      }
      fighter.hand.push(card);
      drawn += 1;
      if (typeof preloadCardVisualAssets === "function") preloadCardVisualAssets(card, `draw-${fighter.id}`);
    }
    return drawn;
  };

  gameEngine.applyStatus = function(target, incoming) {
    if (!incoming?.status) return null;
    const type = incoming.status;
    if (type === "禁锢" && target.controlImmuneTurns > 0) {
      this.log(`${target.name} 的控制抗性抵抗了禁锢。`);
      return null;
    }
    const existing = target.statuses.filter(status => status.type === type);
    const next = { type, turns: Math.max(1, Number(incoming.turns) || 1), power: Number(incoming.power || 0), charges: incoming.charges, sourceOwnerId: incoming.sourceOwnerId, source: incoming.source || "固定卡牌" };
    if (type === "燃烧") {
      if (existing.length >= 3) { existing.sort((a, b) => a.power - b.power)[0].power = Math.max(existing[0].power, next.power); existing.forEach(status => status.turns = Math.max(status.turns, next.turns)); return existing[0]; }
      target.statuses.push(next); return next;
    }
    if (["诅咒", "冻结", "禁锢", "增幅", "虚弱", "减伤", "闪避", "连锁"].includes(type)) {
      const current = existing[0];
      if (current) { current.power = Math.max(current.power || 0, next.power || 0); current.turns = Math.max(current.turns || 0, next.turns); current.charges = Math.max(current.charges || 1, next.charges || 1); current.sourceOwnerId = next.sourceOwnerId || current.sourceOwnerId; return current; }
    }
    target.statuses.push(next);
    return next;
  };

  gameEngine.resolveDamage = function({ source, target, amount, element = "无", pierce = 0, sourceKind = "card" }) {
    const state = this.state;
    if (!state || !target || target.hp <= 0) return { total: 0, ownerDamage: 0, summonDamage: 0, blocked: 0, dodged: false };
    let damage = rounded(amount);
    // 实数值减伤（等级缩放后的绝对值），来自 减伤/闪避 状态
    const flatReduction = target.statuses.filter(s => s.type === "减伤" || s.type === "闪避").reduce((sum, s) => sum + (s.power || 0), 0);
    damage = Math.max(0, damage - flatReduction);
    // 消耗减伤/闪避的层数（仅非 DOT 伤害）
    if (sourceKind !== "dot") target.statuses.forEach(s => { if (s.type === "减伤" || s.type === "闪避") s.charges = (s.charges || 1) - 1; });
    if (element !== "无" && typeof elementMultiplier === "function") damage = rounded(damage * (elementMultiplier(element, target).multiplier || 1));
    const shieldBefore = target.shield;
    const pierceBlocked = rounded(Math.min(target.shield, damage) * Math.max(0, Math.min(1, pierce)));
    target.shield = Math.max(0, target.shield - pierceBlocked);
    const blocked = Math.min(target.shield, damage);
    target.shield = Math.max(0, target.shield - blocked);
    const afterShield = Math.max(0, damage - blocked);
    const ownerBefore = target.hp;
    const guard = target.summons?.find(summon => summon.hp > 0);
    const guardBefore = guard?.hp || 0;
    const shared = typeof shareOwnerDamageWithSummon === "function" ? shareOwnerDamageWithSummon(target, afterShield) : { ownerDamage: afterShield, summonDamage: 0, guard: null };
    target.hp = Math.max(0, target.hp - shared.ownerDamage);
    const ownerDamage = ownerBefore - target.hp;
    const summonDamage = guardBefore - (guard?.hp || 0);
    const total = ownerDamage + summonDamage;
    const stats = state.combatStats;
    if (stats) {
      if (source?.id === "player") { stats.damage += total; stats.highestDamage = Math.max(stats.highestDamage, total); if (sourceKind === "summon") stats.summonDamage += total; }
      if (target.id === "player") stats.damageTaken = (stats.damageTaken || 0) + total;
      if (target.id === "player") stats.shieldAbsorbed = (stats.shieldAbsorbed || 0) + blocked + pierceBlocked;
    }
    return { total, ownerDamage, summonDamage, blocked: blocked + pierceBlocked, dodged: false };
  };

  gameEngine.applyCard = function(actor, target, card) {
    const effectType = card.effectType || "";
    const defaultIntent = typeof getCardActionIntent === "function" ? getCardActionIntent(card) : "hostile-damage";
    const result = { text: `${actor.name}使用「${card.name}」。`, amount: 0, kind: card.effectType, element: card.element, tier: card.skillTier, intent: defaultIntent, actorId: actor.id, targetId: actor.id, popups: [] };
    for (const effect of card.effects || []) {
      if (effect.type === "damage") {
        result.targetId = target.id; // 伤害动画打向敌方
        const baseAmount = effectAmount(actor, effect);
        // 等级缩放实数值增幅：来自 actor 的 增幅/连锁，target 的 虚弱
        const boostFromActor = actor.statuses.filter(s => s.type === "增幅" || s.type === "连锁").reduce((sum, s) => sum + (s.power || 0), 0);
        const boostFromWeaken = target.statuses.filter(s => s.type === "虚弱").reduce((sum, s) => sum + (s.power || 0), 0);
        const multiplier = this.statusMultiplier(actor, target, card);
        const totalAmount = Math.max(0, (baseAmount + boostFromActor + boostFromWeaken) * multiplier);
        const settlement = this.resolveDamage({ source: actor, target, amount: totalAmount, element: card.element, pierce: effect.pierce || 0 });
        result.amount += settlement.total;
        result.text += settlement.dodged ? ` ${target.name}闪避了攻击。` : ` 造成${formatNumber(settlement.total)}伤害。`;
        // 消耗层数：增幅/连锁（攻击方），虚弱（受击方）
        actor.statuses.forEach(s => { if (s.type === "增幅" || s.type === "连锁") s.charges = (s.charges || 1) - 1; });
        target.statuses.forEach(s => { if (s.type === "虚弱") s.charges = (s.charges || 1) - 1; });
        actor.statuses = actor.statuses.filter(s => (s.charges === undefined || s.charges > 0) && s.turns > 0);
        target.statuses = target.statuses.filter(s => (s.charges === undefined || s.charges > 0) && s.turns > 0);
      } else if (effect.type === "heal") {
        const requested = effectAmount(actor, effect); const before = actor.hp;
        actor.hp = Math.min(actor.maxHp, actor.hp + requested);
        const actual = actor.hp - before;
        result.amount += actual;
        if (actor.id === "player" && this.state.combatStats) { this.state.combatStats.healing += actual; this.state.combatStats.overheal = (this.state.combatStats.overheal || 0) + requested - actual; }
        result.text += ` 恢复${formatNumber(actual)}生命。`;
      } else if (effect.type === "shield") {
        const amount = effectAmount(actor, effect); actor.shield += amount;
        result.amount += amount;
        if (actor.id === "player" && this.state.combatStats) this.state.combatStats.shield += amount;
        result.text += ` 获得${formatNumber(amount)}护盾。`;
      } else if (effect.type === "draw") {
        const drawn = this.draw(actor, effect.amount || 1); result.text += ` 抽取${drawn}张牌。`;
      } else if (effect.type === "energy") {
        const gained = Math.min(actor.maxEnergy - actor.energy, effect.amount || 0); actor.energy += gained; result.text += ` 获得${gained}点能量。`;
      } else if (effect.type === "status") {
        const recipient = ["增幅", "减伤", "闪避", "连锁"].includes(effect.status) ? actor : target;
        result.targetId = recipient.id; // 状态动画作用于实际接收方
        const statusPower = effect.burnRatio !== undefined ? effectAmount(actor, effect) : (effect.ratio ?? effect.amount ?? effect.power ?? 0);
        const status = this.applyStatus(recipient, { ...effect, power: statusPower, sourceOwnerId: actor.id, source: card.name });
        if (status) {
          result.text += ` ${recipient.name}获得${status.type}${status.turns}回合。`;
          if (["燃烧", "诅咒"].includes(status.type) && statusPower > 0) result.popups.push({ type: "status dot", text: `${status.type} ${formatNumber(statusPower)}/回合`, side: recipient.id });
          if (effect.ratio && statusPower > 0) result.popups.push({ type: "status flat", text: `+${formatNumber(statusPower)} ${status.type}`, side: recipient.id });
        }
      } else if (effect.type === "summon") {
        const power = effectAmount(actor, effect);
        const summon = { id: deterministicId("summon"), name: `${card.name}召唤物`, ownerId: actor.id, power: Math.max(1, rounded(power * .3)), maxHp: rounded(actor.maxHp * .35), hp: rounded(actor.maxHp * .35) };
        actor.summons = [summon]; result.text += ` 召唤${summon.name}。`;
      }
    }
    this.log(result.text);
    effectsRenderer?.play?.(card, result);
    return result;
  };

  gameEngine.statusMultiplier = function(actor, target) {
    let multiplier = 1;
    // 增幅/连锁/虚弱 已改为等级缩放实数值，在 applyCard 中直接加减，不再乘算此处
    return Math.max(.25, Math.min(2.6, multiplier));
  };

  gameEngine.tickStatuses = function(fighter) {
    const events = [];
    fighter.skipAction = false;
    for (const status of fighter.statuses.slice()) {
      if (["燃烧", "诅咒"].includes(status.type)) {
        const source = status.sourceOwnerId === "player" ? this.state.player : this.state.enemy;
        const settlement = this.resolveDamage({ source, target: fighter, amount: status.power, element: status.type === "燃烧" ? "火" : "暗", sourceKind: "dot" });
        events.push({ type: status.type, actualDamage: settlement.total, sourceOwnerId: status.sourceOwnerId });
        if (settlement.total) this.log(`${fighter.name}受到${status.type}影响，损失${formatNumber(settlement.total)}生命。`);
      }
      if (status.type === "禁锢") fighter.skipAction = true;
    }
    const hadBind = fighter.statuses.some(status => status.type === "禁锢");
    fighter.statuses = fighter.statuses.map(status => ({ ...status, turns: status.turns - 1 })).filter(status => status.turns > 0 && (status.charges === undefined || status.charges > 0));
    if (hadBind && !fighter.statuses.some(status => status.type === "禁锢")) fighter.controlImmuneTurns = 1;
    if (fighter.controlImmuneTurns > 0 && !hadBind) fighter.controlImmuneTurns -= 1;
    return { totalDamage: events.reduce((sum, event) => sum + event.actualDamage, 0), playerDotDamage: events.filter(event => event.sourceOwnerId === "player").reduce((sum, event) => sum + event.actualDamage, 0), dotEvents: events };
  };

  gameEngine.beginTurn = function(side) {
    const state = this.state; if (!state || state.gameOver) return false;
    const fighter = state[side]; fighter.turnFlags = { firstHit: true };
    const freeze = fighter.statuses.some(status => status.type === "冻结");
    fighter.energy = rules.roundEnergy(state.round, fighter.maxEnergy, freeze ? 1 : 0);
    this.tickStatuses(fighter);
    this.checkGameOver(); if (state.gameOver) return false;
    if (!fighter.skipAction) this.draw(fighter, Math.max(0, 5 - fighter.hand.length));
    this.log(`${fighter.name}进入第${state.round}回合，能量恢复到${fighter.energy}。`);
    return true;
  };

  gameEngine.playCard = function(side, instanceId) {
    const state = this.state; if (!state || state.gameOver || state.turn !== side || state[side].skipAction) return false;
    const actor = state[side]; const target = state[side === "player" ? "enemy" : "player"];
    const index = actor.hand.findIndex(card => card.instanceId === instanceId); if (index < 0) return false;
    const card = actor.hand[index]; const cost = typeof effectiveCardCost === "function" ? effectiveCardCost(state, side, card) : card.cost;
    if (cost > actor.energy) return false;
    actor.energy -= cost; actor.hand.splice(index, 1);
    (card.afterPlay === "exhaust" ? actor.exhaustPile : actor.discardPile).push(card);
    this.applyCard(actor, target, card);
    if (actor.id === "player") audioManager?.playCard(card);
    if (actor.id === "player" && state.combatStats) { state.combatStats.cards += 1; if (card.tier === "advanced") state.combatStats.advanced += 1; if (card.tier === "special") state.combatStats.special += 1; }
    this.checkGameOver(); uiRenderer.render(); return true;
  };

  function resolveSummonAssist(fighter) {
    const target = fighter.id === "player" ? gameEngine.state.enemy : gameEngine.state.player;
    for (const summon of fighter.summons || []) {
      if (summon.hp <= 0 || target.hp <= 0) continue;
      const settlement = gameEngine.resolveDamage({ source: fighter, target, amount: summon.power, element: fighter.element, sourceKind: "summon" });
      if (settlement.total) gameEngine.log(`[召唤协击] ${summon.name}造成${formatNumber(settlement.total)}伤害。`);
    }
  }
  gameEngine.endTurn = function(side) {
    const state = this.state; if (!state || state.gameOver || state.turn !== side) return false;
    if (state.turn === side) audioManager?.play(side === "player" ? "turn-end" : "turn-start");
    resolveSummonAssist(state[side]); this.checkGameOver(); if (state.gameOver) return false;
    const next = side === "player" ? "enemy" : "player"; if (side === "enemy") state.round += 1; state.turn = next;
    this.beginTurn(next); uiRenderer.render();
    const captured = state; const session = this.sessionId;
    if (next === "enemy") setTimeout(() => { if (this.isActiveBattle(captured, session) && !captured.gameOver) aiController.takeTurn(); }, 520);
    return true;
  };

  const originalChooseCard = aiController.chooseCard.bind(aiController);
  aiController.chooseCard = function(enemy, player) {
    const playable = enemy.hand.filter(card => card.cost <= enemy.energy); if (!playable.length) return null;
    const score = card => (card.effects || []).reduce((total, effect) => {
      if (effect.type === "damage") return total + effectAmount(enemy, effect) * (player.hp <= effectAmount(enemy, effect) ? 2 : 1);
      if (effect.type === "heal") return total + Math.min(effectAmount(enemy, effect), enemy.maxHp - enemy.hp) * .8;
      if (effect.type === "shield") return total + effectAmount(enemy, effect) * (enemy.shield ? .3 : .7);
      if (effect.type === "draw") return total + (enemy.hand.length < rules.HAND_LIMIT ? 800 : 0);
      if (effect.type === "status") return total + (player.statuses.some(status => status.type === effect.status) ? 0 : 1200);
      return total + 100;
    }, 0) / Math.max(1, card.cost);
    return playable.slice().sort((a, b) => score(b) - score(a))[0] || originalChooseCard(enemy, player);
  };

  uiRenderer.defaultDecks = library.characterDefinitions.map(character => library.createRuntimeDeck(character.id));
  uiRenderer.selectedDeck = uiRenderer.defaultDecks[0];
  // 固定角色模式不读取、保存或构筑本机自定义卡牌。
  if (global.storageManager) {
    localStorage.removeItem(global.storageManager.customKey);
    global.storageManager.getCustomCards = () => [];
    global.storageManager.saveCustomCard = () => false;
  }
  if (global.deckBuilder) {
    global.deckBuilder.createDeck = () => library.createRuntimeDeck(library.characterDefinitions[0].id);
    global.deckBuilder.createCharacterDeck = character => library.createRuntimeDeck(character?.id || library.characterDefinitions[0].id);
    global.deckBuilder.pickEnemyFor = playerDeck => {
      const playerLevel = playerDeck.level || 50;
      const candidates = library.characterDefinitions.filter(c => c.id !== playerDeck.characterId);
      candidates.sort((a, b) => Math.abs(a.level - playerLevel) - Math.abs(b.level - playerLevel));
      const chosen = candidates[0];
      const deck = library.createRuntimeDeck(chosen.id);
      // 如果敌方等级与玩家差距 >10 级，提升到玩家等级附近
      if (Math.abs(chosen.level - playerLevel) > 10) deck.level = Math.min(playerLevel, 100);
      return deck;
    };
  }
  uiRenderer.openBattlePrep = function() {
    const options = library.characterDefinitions.map(character => `<button class="campaign-card" type="button" data-fixed-character="${character.id}"><h3>${escapeHtml(character.name)}</h3><small>${escapeHtml(character.race)} · ${escapeHtml(character.profession)} · ${character.deck.length} 张固定卡</small></button>`).join("");
    this.openModal("选择固定角色", `<p class="small-note">沙盒与战役共用同一套角色卡组；卡组不可生成或修改。</p><div class="campaign-grid">${options}</div>`, { modalClass: "campaign-modal", afterRender: () => document.querySelectorAll("[data-fixed-character]").forEach(button => button.addEventListener("click", () => { this.selectedDeck = library.createRuntimeDeck(button.dataset.fixedCharacter); this.closeModal(); this.startBattle(); })) });
  };
  uiRenderer.startBattle = async function() {
    const playerDeck = library.createRuntimeDeck(this.selectedDeck?.characterId || library.characterDefinitions[0].id);
    const enemyDeck = global.deckBuilder.pickEnemyFor(playerDeck);
    gameEngine.start(playerDeck, enemyDeck);
    document.getElementById("battlefield").style.setProperty("--battle-bg", `url("${battleBackgroundFor(playerDeck, enemyDeck)}")`);
    this.nav("battle"); effectsRenderer.resize(); this.render();
  };

  const legacyShowResult = uiRenderer.showResult.bind(uiRenderer);
  uiRenderer.showResult = function() {
    const state = gameEngine.state;
    if (!state?.campaign) return legacyShowResult();
    if (state.campaign.resultRendered) return;
    state.campaign.resultRendered = true;
    const won = state.winner === "player";
    const stats = state.combatStats || {};
    const score = global.campaignMode.scoreBattle({ victory: won, hpRatio: state.player.hp / state.player.maxHp, damageTaken: stats.damageTaken, maxHp: state.player.maxHp, healing: stats.healing, overheal: stats.overheal, rounds: state.round, difficulty: state.campaign.difficulty, revived: stats.revived });
    const saved = global.campaignMode.loadProgress(localStorage.getItem(global.campaignMode.STORAGE_KEY), global.campaignData.characters);
    const next = won ? global.campaignMode.recordStageWin(saved, state.campaign.characterId, state.campaign.stage) : global.campaignMode.recordStageLoss(saved, state.campaign.characterId);
    next.recentBattles = global.campaignMode.recentBattles(next.recentBattles, [{ characterId: state.campaign.characterId, stage: state.campaign.stage, difficulty: state.campaign.difficulty, victory: won, score, rounds: state.round, time: new Date().toISOString() }]);
    localStorage.setItem(global.campaignMode.STORAGE_KEY, JSON.stringify(next));
    this.nav("result");
    document.getElementById("resultTitle").textContent = won ? `战役胜利 · ${score}级评价` : `战役失败 · ${score}级评价`;
    document.getElementById("resultText").textContent = `${state.campaign.stage} · ${global.campaignData.stages[state.campaign.stage - 1].name}`;
    document.getElementById("resultStats").innerHTML = [["总伤害", stats.damage], ["最高单次伤害", stats.highestDamage], ["实际治疗", stats.healing], ["过量治疗", stats.overheal], ["真实承伤", stats.damageTaken], ["回合数", state.round], ["评价", score]].map(([label, value]) => `<div class="stat-tile"><b>${formatNumber(value)}</b><span>${label}</span></div>`).join("");
  };
})(globalThis);
