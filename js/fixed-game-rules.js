(function (global) {
  "use strict";

  const { battleRules: rules, fixedCardLibrary: library, gameEngine, uiRenderer, aiController } = global;
  if (!rules || !library || !gameEngine) throw new Error("固定战斗规则加载顺序错误");

  const STATUS_LABELS = { "燃烧":"每回合开始造成持续伤害（最多3层）", "诅咒":"每回合开始造成持续伤害（取最高值）", "冻结":"下回合能量 -1", "禁锢":"本回合不能行动，结束后获得控制抗性", "增幅":"伤害提高", "虚弱":"受到伤害提高", "减伤":"受到伤害降低", "灵巧防御":"固定点数减伤（一次）", "连锁":"下一次伤害提高", "复生":"下一次受到致命伤害时复苏", "真实":"造成伤害时无视护盾", "抽牌压制":"回合开始时少抽牌" };
  const rounded = value => Math.max(0, Math.round(Number(value) || 0));
  // 战斗时按等级 × ratio × 职业档案算出实际数值
  const effectAmount = (fighter, effect, card = null) => {
    const fn = typeof globalThis.resolveCardEffectAmount === "function" ? globalThis.resolveCardEffectAmount : typeof globalThis.resolveEffectAmount === "function" ? (e, a, c) => globalThis.resolveEffectAmount(e, a, c) * (Number(c?.effectMultiplier) || 1) : (e, a, c) => Math.max(0, Math.round(Number(e?.amount || 0))) * (Number(c?.effectMultiplier) || 1);
    return fn(effect, fighter, card);
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
        const pierce = effect.pierceAmountRatio ? descValue({ type: "damage", ratio: effect.pierceAmountRatio }) : 0;
        const slay = effect.slayRace ? `（对${effect.slayRace}造成${effect.slayMultiplier || 2}倍伤害）` : "";
        return `造成 ${typeof v === "number" ? formatNumber(v) : v} 伤害${effect.pierce ? "（穿透护盾）" : pierce ? `（其中 ${formatNumber(pierce)} 无视护盾）` : ""}${slay}`;
      }
      if (effect.type === "heal") {
        if (effect.percentageOfMax) {
          const pct = Math.round((effect.ratio || 0) * 100);
          return `恢复最大生命值的 ${pct}%`;
        }
        const v = descValue(effect);
        return `恢复 ${typeof v === "number" ? formatNumber(v) : v} 生命`;
      }
      if (effect.type === "shield") {
        if (effect.percentageOfMax) {
          const pct = Math.round((effect.ratio || 0) * 100);
          return `获得最大生命值 ${pct}% 的护盾（不自动衰减）`;
        }
        const v = descValue(effect);
        return `获得 ${typeof v === "number" ? formatNumber(v) : v} 护盾（不自动衰减）`;
      }
      if (effect.type === "draw") return `抽 ${effect.amount} 张牌`;
      if (effect.type === "energy") return `获得 ${effect.amount} 点能量`;
      if (effect.type === "status") {
        if (["燃烧", "诅咒"].includes(effect.status)) {
          const v = descValue(effect);
          return `施加${effect.status}${effect.turns}回合：每回合 ${typeof v === "number" ? formatNumber(v) : 0} 伤害`;
        }
        if (effect.status === "真实") return `获得真实伤害${effect.turns || 2}回合：造成伤害时无视护盾`;
        if (effect.status === "抽牌压制") return `使目标${effect.turns || 3}回合内每回合少抽 ${effect.amount || 1} 张牌`;
        const pointStatus = ["增幅", "虚弱", "减伤", "灵巧防御", "连锁", "复生"].includes(effect.status);
        const value = pointStatus ? descValue(effect) : 0;
        const detail = pointStatus ? effect.status === "复生" ? `${STATUS_LABELS[effect.status]}，恢复${formatNumber(value)}生命` : `${STATUS_LABELS[effect.status]} ${formatNumber(value)}点` : STATUS_LABELS[effect.status];
        return effect.persistent ? `本场下一次受到致命伤害时，恢复${formatNumber(value)}生命` : `施加${effect.status}${effect.turns ? `${effect.turns}回合` : ""}${detail ? `：${detail}` : ""}`;
      }
      if (effect.type === "revive") return `起死回生：恢复 ${formatNumber(descValue(effect))} 生命`;
      if (effect.type === "cleanse") return "清除负面状态";
      if (effect.type === "summon") return "召唤协击单位";
      return effect.type;
    });
    return `${parts.join("；")}。${card.afterPlay === "exhaust" ? " 使用后消耗，本场不会洗回牌库。" : ""}`;
  };

  const originalMakeFighter = gameEngine.makeFighter.bind(gameEngine);
  gameEngine.makeFighter = function(name, deck, isPlayer) {
    const normalizedDeck = { ...deck, originalRace: deck.originalRace || deck.race, originalProfession: deck.originalProfession || deck.profession, race: normalizeRace(deck.race), profession: normalizeProfession(deck.profession) };
    const fighter = originalMakeFighter(name, normalizedDeck, isPlayer);
    fighter.profile = combinedProfile(normalizedDeck.race, normalizedDeck.profession);
    if (Number.isFinite(normalizedDeck.maxHpMultiplier)) {
      fighter.maxHp = Math.max(1, Math.round(fighter.maxHp * normalizedDeck.maxHpMultiplier));
      fighter.hp = fighter.maxHp;
    }
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
    const next = { type, turns: incoming.persistent ? null : Math.max(1, Number(incoming.turns) || 1), persistent: Boolean(incoming.persistent), power: Number(incoming.power || 0), amount: Number(incoming.amount || 0), charges: incoming.charges, sourceOwnerId: incoming.sourceOwnerId, source: incoming.source || "固定卡牌" };
    if (type === "燃烧") {
      if (existing.length >= 3) { existing.sort((a, b) => a.power - b.power)[0].power = Math.max(existing[0].power, next.power); existing.forEach(status => status.turns = Math.max(status.turns, next.turns)); return existing[0]; }
      target.statuses.push(next); return next;
    }
    if (["诅咒", "冻结", "禁锢", "增幅", "虚弱", "减伤", "灵巧防御", "连锁", "复生", "真实", "抽牌压制"].includes(type)) {
      const current = existing[0];
      if (current) { current.power = Math.max(current.power || 0, next.power || 0); current.amount = Math.max(current.amount || 0, next.amount || 0); current.persistent ||= next.persistent; current.turns = current.persistent ? null : Math.max(current.turns || 0, next.turns); current.charges = Math.max(current.charges || 1, next.charges || 1); current.sourceOwnerId = next.sourceOwnerId || current.sourceOwnerId; return current; }
    }
    target.statuses.push(next);
    return next;
  };

  gameEngine.resolveDamage = function({ source, target, amount, element = "无", pierce = 0, pierceAmount = 0, pierceAmountRatio = 0, execute = false, sourceKind = "card" }) {
    const state = this.state;
    if (!state || !target || target.hp <= 0) return { total: 0, ownerDamage: 0, summonDamage: 0, blocked: 0, dodged: false };
    let damage = rounded(amount);
    // 实数值减伤（等级缩放后的绝对值），来自 减伤/灵巧防御 状态
    const reductions = target.statuses.filter(s => (s.type === "减伤" || s.type === "灵巧防御") && (s.charges === undefined || s.charges > 0));
    const flatReduction = sourceKind === "dot" ? 0 : reductions.reduce((sum, s) => sum + (s.power || 0), 0);
    damage = Math.max(0, damage - flatReduction);
    // 消耗减伤/灵巧防御的层数（仅非 DOT 伤害）
    if (sourceKind !== "dot") reductions.forEach(s => { if (s.charges !== undefined) s.charges -= 1; });
    target.statuses = target.statuses.filter(s => s.charges === undefined || s.charges > 0);
    if (element !== "无" && typeof elementMultiplier === "function") damage = rounded(damage * (elementMultiplier(element, target).multiplier || 1));
    const instantKill = execute && target.hp / target.maxHp < .3;
    const pierceRatio = instantKill ? 1 : Math.max(0, Math.min(1, pierce));
    if (instantKill) damage = target.hp;
    const bypassDamage = Math.min(damage, rounded(damage * pierceRatio) + rounded(damage * Math.max(0, Math.min(1, pierceAmountRatio))));
    const blockableDamage = Math.max(0, damage - bypassDamage);
    const blocked = Math.min(target.shield, blockableDamage);
    target.shield = Math.max(0, target.shield - blocked);
    const afterShield = bypassDamage + Math.max(0, blockableDamage - blocked);
    const ownerBefore = target.hp;
    const guard = target.summons?.find(summon => summon.hp > 0);
    const guardBefore = guard?.hp || 0;
    if (guard) setHpDisplayOverride(guard);
    const shared = instantKill ? { ownerDamage: afterShield, summonDamage: 0, guard: null } : typeof shareOwnerDamageWithSummon === "function" ? shareOwnerDamageWithSummon(target, afterShield) : { ownerDamage: afterShield, summonDamage: 0, guard: null };
    target.hp = Math.max(0, target.hp - shared.ownerDamage);
    const ownerDamage = ownerBefore - target.hp;
    const revival = target.hp <= 0 ? target.statuses.find(status => status.type === "复生" && (status.charges === undefined || status.charges > 0)) : null;
    const revived = Boolean(revival);
    if (revived) {
      target.hp = Math.max(1, Math.min(target.maxHp, rounded(revival.power)));
      target.statuses = target.statuses.filter(status => status !== revival);
    }
    const summonDamage = guardBefore - (guard?.hp || 0);
    const total = ownerDamage + summonDamage;
    const stats = state.combatStats;
    if (stats) {
      if (source?.id === "player") { stats.damage += total; stats.highestDamage = Math.max(stats.highestDamage, total); if (sourceKind === "summon") stats.summonDamage += total; }
      if (target.id === "player") { stats.damageTaken = (stats.damageTaken || 0) + total; if (revived) stats.revived = true; }
      if (target.id === "player") stats.shieldAbsorbed = (stats.shieldAbsorbed || 0) + blocked;
    }
    return { total, ownerDamage, summonDamage, blocked, dodged: false, revived };
  };

  gameEngine.applyCard = function(actor, target, card) {
    const expectedTarget = this.state?.[actor.id === "player" ? "enemy" : "player"];
    if (expectedTarget && target !== expectedTarget) target = expectedTarget;
    setHpDisplayOverride(actor); setHpDisplayOverride(target);
    const rawCardName = typeof stripCardTaxonomyPrefix === "function" ? stripCardTaxonomyPrefix(card.baseName || card.name || "") : (card.baseName || card.name || "");
    if (!Array.isArray(card.mechanics)) card.mechanics = typeof mechanicsForCard === "function" ? mechanicsForCard(card.name || "", card.effectType || "attack", card.element || "无", card.skillTier) : [];
    const NEGATIVE_STATUS_TYPES = new Set(["燃烧","冻结","诅咒","破甲","虚弱","禁锢","中毒","抽牌压制"]);
    const skillHasLifesteal = card.effectType === "lifesteal" || card.mechanics?.includes("lifesteal");
    let lifestealFromTalent = false;
    const defaultIntent = typeof getCardActionIntent === "function" ? getCardActionIntent(card) : "hostile-damage";
    const statusMult = this.statusMultiplier(actor, target, card);
    let power = Math.round(safeNumber(getCardPrimaryPower(card, actor), 0) * statusMult);
    const result = { text: `${actor.name}使用「${card.name}」。`, amount: 0, kind: card.effectType, element: card.element, tier: card.skillTier, intent: defaultIntent, actorId: actor.id, targetId: actor.id, popups: [], visualAmounts: [], visualTargets: { number: actor.id, impact: actor.id, shake: false } };
    // ═══ 种族天赋 ═══
    const textNotes = [];
    if (actor.race === "兽人族" && this.state?.campaign?.characterId !== "moluo" && actor.hp / actor.maxHp < .5 && ["attack","burn","pierce","execute"].includes(card.effectType)) { power = Math.round(power * 1.12); result.popups.push({ type:"talent", text:"[狂战血性] 伤害 +12%", side: actor.id }); textNotes.push("[狂战血性] 兽人族天赋：生命低于50%，伤害提高12%。"); }
    if (actor.race === "恶魔" && ["attack","burn","curse","lifesteal"].includes(card.effectType) && !skillHasLifesteal) { card.mechanics = Array.from(new Set([...(card.mechanics || []), "lifesteal"])); lifestealFromTalent = true; textNotes.push("[血契] 恶魔天赋：攻击附加吸血。"); }
    if (actor.race === "神人" && this.state?.campaign?.characterId !== "su" && defaultIntent === "hostile-damage") { power = Math.round(power * 1.10); textNotes.push("[神血] 神人天赋：攻击+10%。"); }
    if (actor.race === "黑暗精灵" && defaultIntent === "hostile-damage" && (card.element === "暗" || card.effectType === "curse" || card.mechanics?.includes("curse"))) { power = Math.round(power * 1.12); textNotes.push("[诅咒遗脉] 暗属性/诅咒伤害+12%。"); }
    if (target.race === "龙族" && card.element !== "无") power = Math.round(power * .92);
    if (target.race === "精灵族" && target.turnFlags?.firstHit && ["attack","burn","freeze","curse","execute","control","lifesteal","pierce"].includes(card.effectType)) { power = Math.round(power * .88); target.turnFlags.firstHit = false; }
    if (target.race === "黑暗精灵") power = Math.round(power * 1.05);
    if (target.race === "神人" && card.element !== "无") power = Math.round(power * .90);
    for (const effect of card.effects || []) {
      if (effect.type === "damage") {
        result.targetId = target.id;
        let damage = power;
        if (/星界放逐/.test(rawCardName)) damage = Math.round(damage * 1.35);
        if (card.mechanics?.includes("dragonSlayer") && target.race === "龙族") damage = Math.round(damage * 2);
        if (card.mechanics?.includes("demonSlayer") && target.race === "恶魔") damage = Math.round(damage * 2);
        if (card.mechanics?.includes("chain") && target.shield <= 0) damage += Math.round(power * .3);
        const slayBonus = effect.slayRace && target.race === effect.slayRace ? (effect.slayMultiplier || 2) : 1;
        if (slayBonus > 1) damage = Math.round(damage * slayBonus);
        const trueDamage = actor.statuses.some(s => s.type === "真实" || s.type === "真实伤害");
        // 卡面“其中 X 无视护盾”：按 pierceAmountRatio / 主 ratio 的比例，随本次伤害在 resolveDamage 内一次性换算为固定穿透量
        const bypassFraction = effect.pierceAmountRatio && effect.ratio ? Math.max(0, Math.min(1, effect.pierceAmountRatio / effect.ratio)) : 0;
        const settlement = this.resolveDamage({ source: actor, target, amount: damage, element: card.element, pierce: trueDamage ? 1 : (card.effectType === "pierce" || card.mechanics?.includes("pierce") ? .45 : 0), pierceAmountRatio: bypassFraction, execute: effect.execute || card.mechanics?.includes("execute"), sourceKind: "card" });
        result.amount += settlement.total;
        result.visualAmounts.push({ amount: settlement.ownerDamage, side: target.id, type: "damage" });
        result.visualTargets = { number: target.id, impact: target.id, shake: settlement.total > 0 };
        if (slayBonus > 1) result.text += ` 【对${effect.slayRace}特攻】`;
        if (settlement.summonDamage) result.text += ` 守卫替${target.name}承受${formatNumber(settlement.summonDamage)}伤害。`;
        result.text += ` 造成${formatNumber(settlement.total)}伤害。`;
        if (textNotes.length) result.text += "\n" + textNotes.join("\n");
        // 吸血
        if (card.mechanics?.includes("lifesteal") && settlement.total > 0) {
          const heal = Math.round(settlement.total * .28);
          if (heal > 0) { setHpDisplayOverride(actor); actor.hp = Math.min(actor.maxHp, actor.hp + heal); result.popups.push({ type:"status heal", text:`吸血 +${formatNumber(heal)}`, side: actor.id }); result.text += lifestealFromTalent ? `\n[血契] 吸血恢复${formatNumber(heal)}生命。` : `\n吸血恢复${formatNumber(heal)}生命。`; }
        }
        // 附加状态
        if (card.mechanics?.includes("burn")) { const st = typeof createStatusFromMechanic === "function" ? createStatusFromMechanic("burn", card, power, actor.id) : { type:"燃烧", turns:2, power: Math.round(power * .24), sourceOwnerId: actor.id }; if (st) { target.statuses.push(st); result.popups.push({ type:"status debuff", text:"燃烧 2 回合", side: target.id }); } }
        if (card.mechanics?.includes("freeze")) { target.statuses.push({ type:"冻结", turns:1, power:0 }); result.popups.push({ type:"status control", text:"冻结 1 回合", side: target.id }); }
        if (card.mechanics?.includes("curse")) { const st = typeof createStatusFromMechanic === "function" ? createStatusFromMechanic("curse", card, power, actor.id) : { type:"诅咒", turns:3, power: Math.round(power * .18), sourceOwnerId: actor.id }; if (st) { target.statuses.push(st); result.popups.push({ type:"status debuff", text:"诅咒 3 回合", side: target.id }); } }
        if (card.mechanics?.includes("control")) {
          const st = typeof createStatusFromMechanic === "function" ? createStatusFromMechanic("control", card, power, actor.id) : { type:"禁锢", turns:1, power:0, sourceOwnerId: actor.id };
          if (st) { if (/星界放逐/.test(rawCardName)) st.turns = 2; target.statuses.push(st); result.popups.push({ type:"status control", text:`禁锢 ${st.turns} 回合`, side: target.id }); }
        }
        if (card.mechanics?.includes("summon")) {
          const summonResult = typeof globalThis.upsertSummonEntity === "function" ? globalThis.upsertSummonEntity(actor, card, power) : { summon: { id: deterministicId("summon"), name:`${card.name}召唤物`, ownerId:actor.id, power:Math.max(1,Math.round(power*.3)), maxHp:Math.round(actor.maxHp*.35), hp:Math.round(actor.maxHp*.35) }, refreshed: false };
          result.popups.push({ type:"status", text:summonResult.refreshed ? "召唤强化" : "召唤单位", side: actor.id });
        }
        actor.statuses.forEach(s => { if (s.type === "增幅" || s.type === "连锁") s.charges = (s.charges || 1) - 1; });
        target.statuses.forEach(s => { if (s.type === "虚弱") s.charges = (s.charges || 1) - 1; });
        actor.statuses = actor.statuses.filter(s => (s.charges === undefined || s.charges > 0) && (s.persistent || s.turns > 0));
        target.statuses = target.statuses.filter(s => (s.charges === undefined || s.charges > 0) && (s.persistent || s.turns > 0));
      } else if (effect.type === "heal") {
        let requested = effect.percentageOfMax ? Math.round(actor.maxHp * effect.ratio) : effectAmount(actor, effect, card);
        if (/起死回生/.test(rawCardName)) requested = Math.round(actor.maxHp * 0.5);
        const before = actor.hp;
        actor.hp = Math.min(actor.maxHp, actor.hp + requested);
        const actual = actor.hp - before;
        result.amount += actual;
        result.visualAmounts.push({ amount: actual, side: actor.id, type: "heal" });
        result.targetId = actor.id;
        result.visualTargets = { number: actor.id, impact: actor.id, shake: false };
        result.popups.push({ type: "status heal", text: `恢复 +${formatNumber(actual)}`, side: actor.id });
        if (actor.id === "player" && this.state.combatStats) { this.state.combatStats.healing += actual; this.state.combatStats.overheal = (this.state.combatStats.overheal || 0) + requested - actual; }
        let cleansed = false;
        if (card.mechanics?.includes("cleanse")) { const idx = actor.statuses.findIndex(s => NEGATIVE_STATUS_TYPES.has(s.type)); if (idx >= 0) { actor.statuses.splice(idx, 1); cleansed = true; } }
        result.text += ` 恢复${formatNumber(actual)}生命${cleansed ? "，并净化负面状态" : ""}。`;
        if (/太阳神的祝福/.test(rawCardName)) { actor.statuses.push({ type:"增幅", turns:3, power:.25, source: card.name }); result.popups.push({ type:"status", text:"增幅 3 回合", side: actor.id }); result.text += "\n[增幅] 自身获得「增幅」3回合，伤害提高25%。"; }
      } else if (effect.type === "shield") {
        let amount = effect.percentageOfMax ? Math.round(actor.maxHp * effect.ratio) : effectAmount(actor, effect, card);
        if (/防御极致化/.test(rawCardName)) amount = Math.round(actor.maxHp * .5);
        actor.shield += amount;
        result.amount += amount;
        result.visualAmounts.push({ amount, side: actor.id, type: "shield" });
        result.targetId = actor.id;
        result.visualTargets = { number: actor.id, impact: actor.id, shake: false };
        result.popups.push({ type: "status shield", text: `护盾 +${formatNumber(amount)}`, side: actor.id });
        if (actor.id === "player" && this.state.combatStats) this.state.combatStats.shield += amount;
        if (/防御极致化/.test(rawCardName)) { actor.statuses.push({ type:"减伤", turns:3, power:.10, source: card.name }); result.text += ` 获得最大生命值50%护盾（${formatNumber(amount)}），并获得10%减伤3回合。`; }
        else if (card.mechanics?.includes("damageReduction")) { actor.statuses.push({ type:"减伤", turns:2, power:.18, source: card.name }); result.text += ` 获得${formatNumber(amount)}护盾及减伤。`; }
        else if (card.mechanics?.includes("fortify") && actor.shield > amount) { actor.statuses.push({ type:"减伤", turns:1, power:.12 }); result.text += ` 获得${formatNumber(amount)}护盾及加固减伤。`; }
        else result.text += ` 获得${formatNumber(amount)}护盾。`;
      } else if (effect.type === "draw") {
        const drawAmount = actor.race === "精灵族" ? 3 : (effect.amount || 2);
        const drawn = this.draw(actor, drawAmount);
        actor.energy = clamp(actor.energy + 1, 0, actor.maxEnergy);
        if (card.mechanics?.includes("drawOrEvade")) actor.statuses.push({ type:"闪避", turns:1, power:.35 });
        result.targetId = actor.id;
        result.text += ` 抽取${drawn}张牌并获得1点能量。`;
      } else if (effect.type === "energy") {
        const gained = Math.min(actor.maxEnergy - actor.energy, effect.amount || 0); actor.energy += gained; result.text += ` 获得${gained}点能量。`;
      } else if (effect.type === "charge") {
        actor.energy = clamp(actor.energy + 2, 0, actor.maxEnergy);
        actor.statuses.push({ type:"蓄力", turns:1, power:.25 });
        result.targetId = actor.id;
        result.text += ` 获得2点能量并蓄力。`;
      } else if (effect.type === "status") {
        const recipient = ["增幅", "减伤", "灵巧防御", "连锁", "复生", "真实"].includes(effect.status) ? actor : target;
        result.targetId = recipient.id;
        const statusPower = effectAmount(actor, effect, card);
        const status = this.applyStatus(recipient, { ...effect, power: statusPower, amount: effect.amount || 0, sourceOwnerId: actor.id, source: card.name });
        if (status) {
          result.text += status.persistent ? ` ${recipient.name}获得复生。` : ` ${recipient.name}获得${status.type}${status.turns}回合。`;
          if (["燃烧", "诅咒"].includes(status.type) && statusPower > 0) result.popups.push({ type: "status dot", text: `${status.type} ${formatNumber(statusPower)}/回合`, side: recipient.id });
          if (effect.ratio && statusPower > 0) result.popups.push({ type: "status flat", text: `+${formatNumber(statusPower)} ${status.type}`, side: recipient.id });
        }
      } else if (effect.type === "buff") {
        if (/伤害真实化/.test(rawCardName)) { actor.statuses.push({ type:"真实伤害", turns:2, power:1, source: card.name }); result.targetId = actor.id; result.popups.push({ type:"status", text:"真实伤害 2 回合", side: actor.id }); result.text += "\n[真实伤害] 自身获得「真实伤害」2回合，无视护盾。"; }
        else if (/魔法极致化/.test(rawCardName)) { actor.statuses.push({ type:"增幅", turns:4, power:.35, source: card.name }); result.targetId = actor.id; result.popups.push({ type:"status", text:"增幅 4 回合", side: actor.id }); result.text += "\n[增幅] 自身获得「增幅」4回合，伤害提高35%。"; }
        else { actor.statuses.push({ type:"增幅", turns:2, power:.25, source: card.name }); result.targetId = actor.id; result.popups.push({ type:"status", text:"增幅 2 回合", side: actor.id }); result.text += "\n[增幅] 自身获得「增幅」2回合，伤害提高25%。"; }
      } else if (effect.type === "debuff") {
        if (/递种/.test(rawCardName)) {
          target.statuses.push({ type:"抽牌压制", turns:3, power:1, source: card.name });
          actor.statuses.push({ type:"增幅", turns:3, power:.25, source: card.name });
          const shieldGain = Math.round(actor.maxHp * .08);
          actor.shield += shieldGain;
          result.targetId = target.id;
          result.popups.push({ type:"status control", text:"抽牌压制 3 回合", side: target.id });
          result.popups.push({ type:"status", text:"增幅 3 回合", side: actor.id });
          result.popups.push({ type:"status shield", text:`护盾 +${formatNumber(shieldGain)}`, side: actor.id });
          result.text += `\n[抽牌压制] ${target.name} 3回合内每回合少抽1张牌。\n[增幅] 自身获得「增幅」3回合，伤害提高25%。\n[护盾] 获得${formatNumber(shieldGain)}护盾。`;
        } else if (/统治/.test(rawCardName)) {
          target.statuses.push({ type:"禁锢", turns:2, power:0, source: card.name });
          actor.statuses.push({ type:"增幅", turns:2, power:.10, source: card.name });
          actor.statuses.push({ type:"减伤", turns:2, power:.10, source: card.name });
          result.targetId = target.id;
          result.popups.push({ type:"status control", text:"禁锢 2 回合", side: target.id });
          result.text += `\n[禁锢] ${target.name}无法行动2回合。\n[增幅+减伤] 自身获得10%增伤和10%减伤，持续2回合。`;
        } else {
          target.statuses.push({ type:"虚弱", turns:2, power:.2 });
          result.targetId = target.id;
          result.popups.push({ type:"status debuff", text:"虚弱 2 回合", side: target.id });
          result.text += ` 目标获得「虚弱」2回合，受到伤害提高20%。`;
        }
      } else if (effect.type === "cleanse") {
        const negative = effect.statuses || ["燃烧", "诅咒", "冻结", "禁锢", "虚弱"];
        actor.statuses = actor.statuses.filter(status => !negative.includes(status.type));
        result.text += " 清除负面状态。";
      } else if (effect.type === "revive") {
        const amount = effectAmount(actor, effect, card);
        actor.hp = Math.max(actor.hp, Math.min(actor.maxHp, amount));
        result.amount += amount;
        result.text += ` 复苏并恢复${formatNumber(amount)}生命。`;
      } else if (effect.type === "summon") {
        const summonPower = effectAmount(actor, effect, card);
        const summonResult = typeof globalThis.upsertSummonEntity === "function"
          ? globalThis.upsertSummonEntity(actor, card, summonPower)
          : (() => { const s = { id: deterministicId("summon"), name: `${card.name}召唤物`, ownerId: actor.id, power: Math.max(1, rounded(summonPower * .3)), maxHp: rounded(actor.maxHp * .35), hp: rounded(actor.maxHp * .35), sprite: (() => { const e = card?.element || "无"; const u = globalThis.ASSETS?.summons; if (e === "火") return u?.fireLord || ""; if (e === "暗") return u?.darkLord || ""; if (e === "风" || e === "雷") return u?.windHunter || ""; return u?.holyGuard || ""; })() }; actor.summons = [s]; return { summon: s, refreshed: false }; })();
        const summon = summonResult.summon;
        result.popups.push({ type:"status", text:summonResult.refreshed ? "召唤强化" : "召唤单位", side: actor.id });
        result.text += summonResult.refreshed
          ? ` [召唤强化] ${summon.name}恢复生命；下一次协击伤害提高。`
          : ` 召唤${summon.name}。`;
      }
    }
    const hasDamage = result.visualAmounts.some(item => item.type === "damage" && item.amount > 0);
    result.targetId = hasDamage ? target.id : actor.id;
    result.visualTargets = { number: hasDamage ? target.id : actor.id, impact: hasDamage ? target.id : actor.id, shake: hasDamage };
    // ═══ 均衡意志天赋（人族/神人低HP恢复）═══
    if (target.hp / target.maxHp < .35 && !target.talentUsed && ["人族","神人"].includes(target.race) && !(this.state?.campaign?.characterId === "lisaya" && target.id === "player")) {
      const gain = Math.round(target.maxHp * .08);
      setHpDisplayOverride(target); target.hp = Math.min(target.maxHp, target.hp + gain); target.shield += gain; target.talentUsed = true;
      result.popups.push({ type:"talent", text:`[均衡意志] 恢复 +${formatNumber(gain)}`, side: target.id });
      this.log(`${target.name}触发天赋【均衡意志】：恢复${formatNumber(gain)}生命并获得${formatNumber(gain)}护盾。`);
    }
    // ═══ AI对话触发 ═══
    const battleState = this.state; const battleSessionId = this.sessionId;
    if (actor.id === "enemy" && ["advanced","special"].includes(card.skillTier)) setTimeout(() => { if (this.isActiveBattle(battleState, battleSessionId)) uiRenderer.showAiDialogue?.(card.skillTier === "special" ? "playSpecial" : "playAdvanced"); }, 120);
    if (target.id === "enemy" && result.amount > 0) setTimeout(() => { if (this.isActiveBattle(battleState, battleSessionId)) uiRenderer.showAiDialogue?.(target.hp / target.maxHp < .3 ? "lowHp" : "takeDamage"); }, 420);
    this.log(result.text);
    effectsRenderer?.play?.(card, result);
    return result;
  };

  gameEngine.statusMultiplier = function(actor, target, card) {
    let multiplier = 1;
    actor.statuses.forEach(status => {
      if (status.type === "增幅") multiplier += status.power;
      if (status.type === "蓄力" && ["attack","burn","pierce","execute"].includes(card?.effectType)) multiplier += status.power;
    });
    target.statuses.forEach(status => {
      if (status.type === "虚弱" || status.type === "削弱" || status.type === "破甲") multiplier += status.power;
      if (status.type === "诅咒" && card?.element === "暗") multiplier += .12;
      if (status.type === "减伤") multiplier -= status.power;
      if (status.type === "闪避") multiplier -= status.power;
    });
    return Math.max(.25, Math.min(2.6, multiplier));
  };

  gameEngine.tickStatuses = function(fighter) {
    const events = [];
    fighter.skipAction = false;
    for (const status of fighter.statuses.slice()) {
      if (["燃烧", "诅咒", "中毒"].includes(status.type)) {
        const source = status.sourceOwnerId === "player" ? this.state.player : this.state.enemy;
        const settlement = this.resolveDamage({ source, target: fighter, amount: status.power, element: status.type === "燃烧" ? "火" : "暗", sourceKind: "dot" });
        events.push({ type: status.type, actualDamage: settlement.total, sourceOwnerId: status.sourceOwnerId });
        if (settlement.total) this.log(`${fighter.name}受到${status.type}影响，损失${formatNumber(settlement.total)}生命。`);
      }
      if (status.type === "禁锢") fighter.skipAction = true;
    }
    const hadBind = fighter.statuses.some(status => status.type === "禁锢");
    fighter.statuses = fighter.statuses.map(status => status.persistent ? status : { ...status, turns: status.turns - 1 }).filter(status => (status.persistent || status.turns > 0) && (status.charges === undefined || status.charges > 0));
    if (hadBind && !fighter.statuses.some(status => status.type === "禁锢")) fighter.controlImmuneTurns = 1;
    if (fighter.controlImmuneTurns > 0 && !hadBind) fighter.controlImmuneTurns -= 1;
    return { totalDamage: events.reduce((sum, event) => sum + event.actualDamage, 0), playerDotDamage: events.filter(event => event.sourceOwnerId === "player").reduce((sum, event) => sum + event.actualDamage, 0), dotEvents: events };
  };

  gameEngine.beginTurn = function(side) {
    const state = this.state; if (!state || state.gameOver) return false;
    const fighter = state[side]; fighter.turnFlags = { firstHit: true };
    const freeze = fighter.statuses.some(status => status.type === "冻结");
    fighter.energy = rules.roundEnergy(state.round, fighter.maxEnergy, freeze ? 1 : 0);
    // 抽牌压制（递种）：回合开始时少抽牌，读取需在 tickStatuses 递减前，保证覆盖完整回合数
    const drawPenalty = fighter.statuses.filter(s => s.type === "抽牌压制").reduce((max, s) => Math.max(max, s.amount || 1), 0);
    this.tickStatuses(fighter);
    // 回合开始是显示覆写的天然同步点：DOT/召唤分摊等在 tickStatuses 中设置的
    // 临时 HP 覆写必须在此清零，否则 hasPendingOverrides 会卡住本回合的全部玩家输入。
    if (typeof clearHpDisplayOverrides === "function") clearHpDisplayOverrides();
    this.checkGameOver(); if (state.gameOver) return false;
    if (!fighter.skipAction) this.draw(fighter, Math.max(0, 5 - fighter.hand.length - drawPenalty));
    if (drawPenalty && !fighter.skipAction) this.log(`[抽牌压制] ${fighter.name} 本回合少抽 ${drawPenalty} 张牌。`);
    this.log(`${fighter.name}进入第${state.round}回合，能量恢复到${fighter.energy}。`);
    const battleState = state; const battleSessionId = this.sessionId;
    if (side === "enemy") setTimeout(() => { if (this.isActiveBattle(battleState, battleSessionId)) uiRenderer.showAiDialogue?.("turnStart"); }, 180);
    return true;
  };

  gameEngine.playCard = function(side, instanceId) {
    const state = this.state; if (!state || state.gameOver || state.turn !== side || state[side].skipAction) return false;
    if (state.actionLocked || (typeof effectsRenderer !== "undefined" && effectsRenderer?._playLock)) return false;
    const actor = state[side]; const target = state[side === "player" ? "enemy" : "player"];
    const index = actor.hand.findIndex(card => card.instanceId === instanceId); if (index < 0) return false;
    const card = actor.hand[index]; const cost = typeof effectiveCardCost === "function" ? effectiveCardCost(state, side, card) : card.cost;
    if (cost > actor.energy) { this.log(`${actor.name}能量不足，无法使用「${card.name}」。`); return false; }
    state.actionLocked = true;
    actor.energy -= cost; actor.hand.splice(index, 1);
    (card.afterPlay === "exhaust" ? actor.exhaustPile : actor.discardPile).push(card);
    if (typeof preloadCardVisualAssets === "function") preloadCardVisualAssets(card, `play-card-${side}`);
    this.applyCard(actor, target, card);
    audioManager?.playCard(card);
    if (actor.id === "player" && state.combatStats) { state.combatStats.cards += 1; if (card.tier === "advanced") state.combatStats.advanced += 1; if (card.tier === "special") state.combatStats.special += 1; }
    uiRenderer.render();
    const self = this; const capturedState = state; const sessionId = this.sessionId;
    const unlockDelay = typeof dramaTimingForCard === "function" ? dramaTimingForCard(card).totalMin : 700;
    setTimeout(() => { if (self.isActiveBattle(capturedState, sessionId)) { capturedState.actionLocked = false; uiRenderer.render(); } }, unlockDelay);
    this.checkGameOver(); return true;
  };

  function resolveSummonAssist(fighter) {
    const target = fighter.id === "player" ? gameEngine.state.enemy : gameEngine.state.player;
    for (const summon of fighter.summons || []) {
      if (summon.hp <= 0 || target.hp <= 0) continue;
      const settlement = gameEngine.resolveDamage({ source: fighter, target, amount: summon.power, element: fighter.element, sourceKind: "summon" });
      if (settlement.total) {
        gameEngine.log(`[召唤协击] ${summon.name}造成${formatNumber(settlement.total)}伤害。`);
        effectsRenderer?.showSummonAssistAttack?.({ side: fighter.id, targetSide: target.id, summon, amount: settlement.total });
      }
    }
  }
  gameEngine.endTurn = function(side) {
    const state = this.state; if (!state || state.gameOver || state.turn !== side) return false;
    audioManager?.play(side === "player" ? "turn-end" : "turn-start");
    resolveSummonAssist(state[side]); this.checkGameOver(); if (state.gameOver) return false;
    const next = side === "player" ? "enemy" : "player"; if (side === "enemy") state.round += 1; state.turn = next;
    this.beginTurn(next); uiRenderer.render();
    const captured = state; const session = this.sessionId;
    setTimeout(() => { if (this.isActiveBattle(captured, session) && !captured.gameOver) uiRenderer.showAiDialogue?.("turnEnd"); }, 80);
    if (next === "enemy") setTimeout(() => { if (this.isActiveBattle(captured, session) && !captured.gameOver) aiController.takeTurn(); }, globalThis.battleSpeedDelay ? globalThis.battleSpeedDelay(520) : 520);
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
    // 存储不可用时安全跳过清理，绝不中断本模块的其余覆写注册。
    try { localStorage.removeItem(global.storageManager.customKey); } catch { /* localStorage 不可用：跳过 */ }
    global.storageManager.getCustomCards = () => [];
    global.storageManager.saveCustomCard = () => false;
  }
  if (global.deckBuilder) {
    // 统一启动流程：deckBuilder 的全部入口都只服务于固定 30 张卡系统，
    // 旧 24 张运行时卡组路径（内联 legacy defaultDecks/createCharacterDeck）不再作为有效来源。
    global.deckBuilder.createDeck = () => library.createRuntimeDeck(library.characterDefinitions[0].id);
    global.deckBuilder.createCharacterDeck = character => library.createRuntimeDeck(character?.id || library.characterDefinitions[0].id);
    global.deckBuilder.defaultDecks = () => library.characterDefinitions.map(character => library.createRuntimeDeck(character.id));
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
    const options = library.characterDefinitions.map(character => `<button class="campaign-card" type="button" data-fixed-character="${character.id}"><h3>${escapeHtml(character.name)}</h3><small>${escapeHtml(character.race)} · ${escapeHtml(character.profession)} · 等级 ${character.level} · 属性 ${escapeHtml(character.elements.join("、"))} · ${character.deck.length} 张固定卡</small></button>`).join("");
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
    let saved;
    try { saved = global.campaignMode.loadProgress(localStorage.getItem(global.campaignMode.STORAGE_KEY), global.campaignData.characters); }
    catch { saved = global.campaignMode.defaultProgress(global.campaignData.characters); }
    const next = won ? global.campaignMode.recordStageWin(saved, state.campaign.characterId, state.campaign.stage) : global.campaignMode.recordStageLoss(saved, state.campaign.characterId);
    next.recentBattles = global.campaignMode.recentBattles(next.recentBattles, [{ characterId: state.campaign.characterId, stage: state.campaign.stage, difficulty: state.campaign.difficulty, victory: won, score, rounds: state.round, time: new Date().toISOString() }]);
    try { localStorage.setItem(global.campaignMode.STORAGE_KEY, JSON.stringify(next)); } catch { /* 存储不可用时仍展示本局结果。 */ }
    this.nav("result");
    audioManager?.play?.(won ? "victory" : "defeat");
    document.getElementById("resultTitle").textContent = won ? `战役胜利 · ${score}级评价` : `战役失败 · ${score}级评价`;
    document.getElementById("resultText").textContent = `${state.campaign.stage} · ${global.campaignData.stages[state.campaign.stage - 1].name}`;
    document.getElementById("resultStats").innerHTML = [["总伤害", stats.damage], ["最高单次伤害", stats.highestDamage], ["实际治疗", stats.healing], ["过量治疗", stats.overheal], ["真实承伤", stats.damageTaken], ["回合数", state.round], ["评价", score]].map(([label, value]) => `<div class="stat-tile"><b>${typeof value === "number" ? formatNumber(value) : escapeHtml(String(value))}</b><span>${label}</span></div>`).join("");
    global.campaignResultActions?.(state, this);
  };
})(globalThis);
