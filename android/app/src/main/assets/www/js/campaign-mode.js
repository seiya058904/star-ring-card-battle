(function (global) {
  const MAX_RING = 6;
  const STORAGE_KEY = "star-ring-campaign-progress-v1";
  function flattenDeck(deck) { return ["base", "normal", "advanced", "special"].flatMap(tier => deck[tier] || []); }
  function defaultProgress(characters) { return { version: 1, revision: 0, resetGeneration: 0, characters: Object.fromEntries(characters.map(c => [c.id, { unlockedStage: 1, completed: false }])), recentBattles: [] } }
  function loadProgress(raw, characters) { try { return normalizeProgress(JSON.parse(raw || ""), characters); } catch { return defaultProgress(characters); } }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function recordStageWin(progress, characterId, stage) { const next = clone(progress); const entry = next.characters[characterId]; if (!entry) return next; entry.unlockedStage = Math.max(entry.unlockedStage, Math.min(5, stage + 1)); if (stage >= 5) entry.completed = true; return next; }
  function recordStageLoss(progress) { return clone(progress); }
  function mulligan(hand, indexes, replacement) { if (indexes.length > 2 || new Set(indexes).size !== indexes.length || indexes.some(i => i < 0 || i >= hand.length) || replacement.length !== indexes.length) throw new Error("换牌数量或位置无效"); const next = hand.slice(); indexes.forEach((index, i) => { next[index] = replacement[i]; }); return { hand: next, returned: indexes.map(index => hand[index]) }; }
  function addRingEnergy(value, amount) { return Math.min(MAX_RING, Math.max(0, value + amount)); }
  function resonanceCost(cost, reduction) { return Math.max(0, cost - reduction); }
  function resonanceShield(maxHp) { return Math.round(maxHp * .12); }
  // 卡牌 → 意图文案类别的唯一映射（原先在 intentFor / campaign-runtime / campaign-ui 各写了一份）。
  function intentTypeForCard(card) {
    if (!card) return "蓄力";
    return card.skillTier === "special" ? "特殊技能" : card.skillTier === "advanced" ? "高级技能" : ["shield", "defense"].includes(card.effectType) ? "防御" : ["heal", "revive"].includes(card.effectType) ? "治疗" : ["control", "freeze"].includes(card.effectType) ? "控制" : "普通攻击";
  }
  // 敌方意图与实际行动必须同源：意图直接取 planAiPlay 的首选，运行时再按同一函数复核，
  // 避免"显示准备防御，下一秒直接放大招"。
  function intentFor(cards, energy, style, context = {}) {
    const card = planAiPlay({ hand: cards, energy, actor: context.actor, target: context.target, style, costOf: item => Number(item.effectiveCost ?? item.cost), context }).card;
    return { type: intentTypeForCard(card), card };
  }
  // healing 字段口径是"实际恢复的生命"，overheal 是"超出上限未生效的请求量"，
  // 因此效率必须用 实际治疗 /（实际治疗 + 过量治疗）；拿 overheal 去除以 healing 会在
  // overheal ≥ healing 时把效率算成 0、在 overheal 很小时又低估，两者都不是有效治疗占比。
  function healingEfficiency(healing, overheal) {
    const actual = Math.max(0, Number(healing) || 0);
    const wasted = Math.max(0, Number(overheal) || 0);
    const total = actual + wasted;
    return total <= 0 ? 0 : Math.min(1, actual / total);
  }
  function scoreBattle({ victory, hpRatio = 0, damageTaken = 0, maxHp = 1, healing = 0, overheal = 0, rounds = 99, difficulty = "normal", revived = false }) { if (!victory) return "C"; const damageRatio = Math.min(1, Math.max(0, damageTaken / Math.max(1, maxHp))); const bonus = difficulty === "hard" ? .08 : difficulty === "easy" ? -.03 : 0; const score = hpRatio * .35 + (1 - damageRatio) * .25 + healingEfficiency(healing, overheal) * .1 + Math.max(0, 1 - rounds / 30) * .2 + bonus - (revived ? .1 : 0); return score >= .78 ? "S" : score >= .58 ? "A" : score >= .36 ? "B" : "C"; }
  // 单条战绩记录的有效性判定：归一化与本轮写前校验共用，避免两处规则漂移。
  // 不满足判定的记录在归一化时会被整条丢弃，因此写入前必须拒绝而不是静默抹掉。
  function recentBattleRecordValid(item, characterIds) {
    return Boolean(item) && typeof item === "object" && !Array.isArray(item)
      && characterIds.has(item.characterId) && Number.isInteger(item.stage) && item.stage >= 1 && item.stage <= 5
      && typeof item.victory === "boolean" && ["S", "A", "B", "C"].includes(item.score)
      && Number.isSafeInteger(item.rounds) && item.rounds >= 0;
  }
  function normalizeRecentBattles(records, characters) {
    if (!Array.isArray(records)) return [];
    const characterIds = new Set(characters.map(character => character.id));
    return records.filter(item => recentBattleRecordValid(item, characterIds)).slice(0, 20).map(item => {
      const next = { characterId: item.characterId, stage: item.stage, victory: item.victory, score: item.score, rounds: item.rounds };
      if (["easy", "normal", "hard"].includes(item.difficulty)) next.difficulty = item.difficulty;
      if (typeof item.time === "string" && Number.isFinite(Date.parse(item.time))) next.time = new Date(item.time).toISOString();
      return next;
    });
  }
  // revision/resetGeneration 为跨标签页并发控制字段：旧 version=1 存档缺失时归零，兼容读取。
  function normalizeProgress(rawProgress, characters) { const fallback = defaultProgress(characters); const source = rawProgress && rawProgress.version === 1 && rawProgress.characters && typeof rawProgress.characters === "object" ? rawProgress : fallback; const normalized = defaultProgress(characters); const revision = Number(source.revision); normalized.revision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0; const resetGeneration = Number(source.resetGeneration); normalized.resetGeneration = Number.isSafeInteger(resetGeneration) && resetGeneration >= 0 ? resetGeneration : 0; characters.forEach(character => { const entry = source.characters[character.id]; if (!entry || typeof entry !== "object") return; const stage = Number(entry.unlockedStage); const completed = entry.completed === true || entry.completed === 1 || entry.completed === "true" || entry.completed === "yes"; normalized.characters[character.id] = { unlockedStage: Number.isFinite(stage) ? Math.min(5, Math.max(1, Math.round(stage))) : 1, completed }; }); normalized.recentBattles = normalizeRecentBattles(source.recentBattles, characters); return normalized; }
  function authorizeStage(progressEntry, stage) { return Number.isInteger(stage) && stage >= 1 && stage <= 5 && stage <= Number(progressEntry?.unlockedStage || 1); }
  function clampStage(progressEntry, stage) { return Math.min(5, Math.max(1, Math.min(Number(progressEntry?.unlockedStage || 1), Number(stage) || 1))); }
  function passiveAllowed(flags, characterId, scope) { const bucket = flags?.[scope] || {}; return !bucket[characterId]; }
  function consumePassive(flags, characterId, scope) { const next = clone(flags || {}); next[scope] = { ...(next[scope] || {}), [characterId]: true }; return next; }
  function enemyResonanceChoice({ hpRatio, playerThreat, hand, energy }) { if (hpRatio < .35 || playerThreat) return "guard"; if (hand.length < 3 || energy < 3) return "echo"; if (hand.some(card => ["advanced", "special"].includes(card.skillTier))) return "star"; return "guard"; }
  function shouldEnterBossPhase({ hpRatio, phaseTriggered }) { return !phaseTriggered && hpRatio < .5; }
  function recentBattles(existing, additions) { return additions.concat(existing).slice(0, 20); }
  function resultActions({ victory, stage }) { return victory && stage < 5 ? ["next", "retry", "route", "home"] : ["retry", "route", "home"]; }
  function effectiveCardCost(state, side, card) { const reduction = side === "player" ? state?.campaign?.costReduction || 0 : state?.campaign?.enemyCostReduction || 0; return Math.max(0, Number(card?.cost || 0) - reduction); }
  function expireResonance(state, side) { if (!state?.campaign) return; if (side === "player") state.campaign.costReduction = 0; if (side === "enemy") state.campaign.enemyCostReduction = 0; }
  function isFormalIntent(intent) { return Boolean(intent && typeof intent.type === "string" && typeof intent.cardInstanceId === "string" && typeof intent.description === "string" && Number.isFinite(Number(intent.generatedRound))); }
  function passiveTriggerState(characterId, flags, scope = "match") { if (!passiveAllowed(flags, characterId, scope)) return null; return consumePassive(flags, characterId, scope); }
  // ═══ AI 估值：共享效果语义 + 尺度一致的价值 ═══
  // 旧实现的两个结构性问题（由 scripts/simulate-balance.mjs 基线数据暴露，见 docs/balance/balance-baseline.md）：
  //  1. 非伤害类效果使用固定点数（状态 1200 / 抽牌 800 / 能量 400 / 净化 300 / 召唤 100），
  //     这套常数来自旧的 card.power 数值体系。等级缩放落地后伤害量级已是 10^5–10^9，
  //     固定点数实际等于 0 —— 招募卡抽到后打出率 0%–33%，净化/充能/抽牌类同样被无视。
  //  2. 没有"本回合还能不能再打一张"的意识，永远不会为高价值连击保留能量。
  // 修复：非伤害价值一律以 actor.maxHp 为锚点（与伤害/治疗/护盾同一量纲，随等级自动缩放），
  // 并新增 planAiPlay() 做 1–2 张牌的浅层组合前瞻。这里只改"估值"，不改任何战斗结算。
  const AI_REF = { draw: .04, energy: .015, status: .05, statusRepeat: .012, cleanse: .04, summon: .6 };
  function aiScaleRef(actor) { const hp = Number(actor?.maxHp) || 0; return hp > 0 ? hp : 1e6; }
  function aiEffectValue(effect, actor, card) {
    if (typeof global.resolveCardEffectAmount !== "function") return 0;
    return Number(global.resolveCardEffectAmount(effect, actor || {}, card)) || 0;
  }
  // 显式化的局面对比键。历史上调用方传的是"以玩家视角命名"的 playerLowHp/enemyLowHp/
  // playerHasCurse，而 AI 可能是敌方也可能是玩家，含义随 side 反转——这正是两套 AI
  // 对同一 Effect 产生不同价值理解的原因之一。这里统一为 self/target 语义，旧键仅作兼容读取。
  function normalizeAiContext(context = {}, actor, target, handLength) {
    const ratioOf = fighter => (Number(fighter?.maxHp) > 0 ? fighter.hp / fighter.maxHp : 1);
    const pick = (explicit, legacy, fallback) => (explicit !== undefined ? explicit : legacy !== undefined ? legacy : fallback);
    return {
      ...context,
      actor,
      target,
      handSize: pick(context.handSize, undefined, handLength),
      selfLowHp: pick(context.selfLowHp, context.enemyLowHp, ratioOf(actor) < .35),
      targetLowHp: pick(context.targetLowHp, context.playerLowHp, ratioOf(target) < .35),
      targetHasCurse: pick(context.targetHasCurse, context.playerHasCurse, Boolean(target?.statuses?.some(status => status.type === "诅咒"))),
      targetControlled: Boolean(context.targetControlled) || Boolean(target?.statuses?.some(status => ["冻结", "禁锢"].includes(status.type))),
    };
  }
  // 单张牌的原始价值（未按费用归一）：伤害/治疗/护盾用真实解析值，其余按 maxHp 比例估。
  function aiCardValue(card, context = {}) {
    const actor = context.actor || {};
    const target = context.target || {};
    const ref = aiScaleRef(actor);
    const missingHp = Math.max(0, (Number(actor.maxHp) || 0) - (Number(actor.hp) || 0));
    const selfLowHp = context.selfLowHp ?? (Number(actor.maxHp) > 0 ? actor.hp / actor.maxHp < .45 : false);
    const targetLowHp = context.targetLowHp ?? (Number(target.maxHp) > 0 ? target.hp / target.maxHp < .35 : false);
    const selfStatuses = actor.statuses || [];
    const foeStatuses = target.statuses || [];
    let total = 0;
    let lethal = false;
    let damage = 0;
    for (const effect of card.effects || []) {
      if (effect.type === "damage") {
        const slay = effect.slayRace && target.race === effect.slayRace ? (effect.slayMultiplier || 2) : 1;
        let value = aiEffectValue(effect, actor, card) * slay;
        if (effect.execute && targetLowHp) value *= 2.2;
        // 斩杀线：能一击结束战斗的价值远高于任何常规收益。
        if (Number(target.hp) > 0 && value >= Number(target.hp)) { lethal = true; value += ref * .4; }
        damage += value;
        total += value;
      } else if (effect.type === "heal") {
        const raw = aiEffectValue(effect, actor, card);
        total += missingHp > 0 ? Math.min(raw, missingHp) : raw * .05;
      } else if (effect.type === "shield") {
        const raw = aiEffectValue(effect, actor, card);
        // 已有护盾时边际价值下降（护盾不衰减但会浪费），低血时提升。
        total += raw * (Number(actor.shield) > 0 ? .55 : 1) * (selfLowHp ? 1.15 : 1);
      } else if (effect.type === "status") {
        const selfSide = ["增幅", "减伤", "灵巧防御", "连锁", "复生", "真实"].includes(effect.status);
        const already = (selfSide ? selfStatuses : foeStatuses).some(status => status.type === effect.status);
        const control = ["燃烧", "诅咒", "禁锢", "冻结", "抽牌压制", "破甲"].includes(effect.status);
        if (selfSide) total += ref * AI_REF.status;
        else total += already ? ref * AI_REF.statusRepeat : ref * (control ? AI_REF.status : AI_REF.status * .8);
      } else if (effect.type === "draw") {
        const cards = Number(effect.amount) || 1;
        // 手牌越满，抽牌价值越低（手牌上限会直接弃掉刚抽的牌）。
        const fullness = Math.min(1, (Number(context.handSize) || 0) / 8);
        total += ref * AI_REF.draw * cards * (1 - fullness * .7);
      } else if (effect.type === "energy") {
        total += ref * AI_REF.energy * (Number(effect.amount) || 1);
      } else if (effect.type === "cleanse") {
        const negatives = selfStatuses.filter(status => ["燃烧", "冻结", "诅咒", "虚弱", "禁锢", "中毒", "抽牌压制"].includes(status.type)).length;
        total += negatives > 0 ? ref * AI_REF.cleanse * Math.min(2, negatives) : 0;
      } else if (effect.type === "summon") {
        total += aiEffectValue(effect, actor, card) * AI_REF.summon;
      } else if (effect.type === "revive") {
        total += aiEffectValue(effect, actor, card);
      } else {
        total += ref * .01;
      }
    }
    return { total, lethal, damage };
  }
  // Persona 只产生"倾向"而不是"绝对命令"：倍率从旧的 ×5–×12 收敛到 ×1.5–×3.2，
  // 避免"手里每有诅咒就永远只打诅咒"。
  function applyAiStyle(shape, card, context = {}) {
    const effects = card.effects || [];
    const hasType = type => effects.some(effect => effect.type === type);
    const hasStatus = list => effects.some(effect => effect.type === "status" && list.includes(effect.status));
    let value = shape.total;
    const style = context.style;
    if (style === "curse") { if (hasStatus(["诅咒", "燃烧"])) value *= 3.2; else if (hasType("damage") && context.targetHasCurse) value *= 2.0; }
    else if (style === "control") { if (hasStatus(["冻结", "禁锢"])) value *= 3.0; else if (hasType("damage") && context.targetControlled) value *= 1.6; }
    else if (style === "aggressive") { if (hasType("damage")) value *= context.targetLowHp ? 3.0 : 2.2; }
    else if (style === "guardian") { if (hasType("shield") || hasType("heal")) value *= 2.6; else if (card.skillTier === "advanced") value *= 1.5; }
    else if (style === "adaptive") {
      if (context.selfLowHp && (hasType("shield") || hasType("heal"))) value *= 2.4;
      else if (context.targetLowHp) value *= 2.2;
      else if (hasType("damage")) value *= 1.6;
    }
    return { total: value, lethal: shape.lethal, damage: shape.damage };
  }
  // 1–2 张牌的浅层组合前瞻：不搜索、不做 minimax，只在"每费收益最高的几张"里检查
  // 「打这一张之后，剩下的能量还能不能打出更有价值的一张」，避免 9 能量时一张 9 费牌
  // 无条件压过"5 费 + 4 费"。候选上限固定（AI_LOOKAHEAD_WIDTH），成本受控、可在 Android 上跑。
  const AI_LOOKAHEAD_WIDTH = 5;
  function planAiPlay({ hand = [], energy = 0, actor = {}, target = {}, style = null, costOf = card => Number(card.effectiveCost ?? card.cost ?? 1), context = {} }) {
    const playable = hand.filter(card => costOf(card) <= energy);
    if (!playable.length) return { card: null, plan: [], value: 0, cost: 0, lethal: false };
    const extra = normalizeAiContext(context, actor, target, hand.length);
    const evaluated = playable.map(card => {
      const cost = Math.max(0, costOf(card));
      const plain = aiCardValue(card, extra);
      const shaped = applyAiStyle(plain, card, { ...extra, style });
      return { card, cost, shaped, damage: plain.damage, score: shaped.total / Math.max(1, cost) };
    }).sort((a, b) => b.score - a.score);
    let best = { cards: [evaluated[0]], value: evaluated[0].shaped.total, cost: evaluated[0].cost, lethal: evaluated[0].shaped.lethal };
    if (!best.lethal) {
      const width = Math.min(AI_LOOKAHEAD_WIDTH, evaluated.length);
      for (let i = 0; i < width; i += 1) {
        const first = evaluated[i];
        let pair = null;
        for (const second of evaluated) {
          if (second.card === first.card) continue;
          const totalCost = first.cost + second.cost;
          if (totalCost > energy) continue;
          const totalValue = first.shaped.total + second.shaped.total;
          const leftover = energy - totalCost;
          if (!pair || totalValue > pair.value + 1e-9 || (Math.abs(totalValue - pair.value) < 1e-9 && leftover < pair.leftover)) {
            pair = { cards: [first, second], value: totalValue, cost: totalCost, leftover };
          }
        }
        if (pair && pair.value > best.value + 1e-9) best = { cards: pair.cards, value: pair.value, cost: pair.cost, lethal: false };
      }
    }
    return { card: best.cards[0].card, plan: best.cards.map(item => item.card), value: best.value, cost: best.cost, lethal: Boolean(best.lethal) };
  }
  // 单卡价值密度（价值/费用）：用于需要"每费收益"视角的场合。
  function aiCardScore(card, context = {}) {
    const cost = Math.max(1, Number(card.effectiveCost ?? card.cost ?? 1));
    const extra = normalizeAiContext(context, context.actor, context.target, context.handSize);
    return applyAiStyle(aiCardValue(card, extra), card, extra).total / cost;
  }
  // 局面对比上下文：战役层与沙盒层共用的唯一构造点（阈值沿用旧实现的 35% / 30%）。
  function aiContextFor(state, side) {
    const actor = state?.[side];
    const target = state?.[side === "player" ? "enemy" : "player"];
    const ratioOf = fighter => (Number(fighter?.maxHp) > 0 ? fighter.hp / fighter.maxHp : 1);
    return {
      actor,
      target,
      style: actor?.campaignStyle,
      handSize: actor?.hand?.length || 0,
      selfLowHp: ratioOf(actor) < .35,
      targetLowHp: ratioOf(target) < .3,
      targetHasCurse: Boolean(target?.statuses?.some(status => status.type === "诅咒")),
      targetControlled: Boolean(target?.statuses?.some(status => ["冻结", "禁锢"].includes(status.type))),
    };
  }
  // 战役与沙盒共用的"这一步该打什么"：单一入口，避免两套 AI 对同一个 Effect 有两套价值理解。
  function aiChoosePlay(state, side, context = {}) {
    const actor = state?.[side];
    if (!actor) return null;
    const target = state[side === "player" ? "enemy" : "player"];
    const style = context.style === undefined ? actor.campaignStyle : context.style;
    const plan = planAiPlay({
      hand: actor.hand, energy: Number(actor.energy) || 0, actor, target, style,
      costOf: card => effectiveCardCost(state, side, card),
      context: { ...context, actor, target },
    });
    return plan.card || null;
  }
  function createCombatStats() { return { damage: 0, highestDamage: 0, damageTaken: 0, healing: 0, overheal: 0, shield: 0, shieldAbsorbed: 0, elementalAdvantage: 0, passiveTriggers: 0, resonance: 0, enemyResonance: 0, summonDamage: 0, cards: 0, advanced: 0, special: 0, rounds: 0, revived: false }; }
  function recordCombatEvent(stats, event) { const amount = Math.max(0, Number(event.amount || 0)); if (event.type === "damage") { stats.damage += amount; stats.highestDamage = Math.max(stats.highestDamage, amount); if (event.summon) stats.summonDamage += amount; } if (event.type === "heal") stats.healing += amount; if (event.type === "shield") stats.shield += amount; if (event.type === "shieldAbsorbed") stats.shieldAbsorbed += amount; if (event.type === "elementalAdvantage") stats.elementalAdvantage += 1; if (event.type === "passive") stats.passiveTriggers += 1; if (event.type === "resonance") stats[event.side === "enemy" ? "enemyResonance" : "resonance"] += 1; }
  function drawCount(before, after) { return Math.max(0, Number(after) - Number(before)); }
  // 战役进度唯一写入口：结算写回与"重置进度"都必须经此函数。
  // Web Locks 可用时在同一把固定锁内严格串行化 read → merge → write；
  // 不可用时同步执行，属于 best-effort fallback：仍保证写入前基于最新数据并校验代际，
  // 但不宣称能阻止两个标签页完全同时写入造成的 lost update（P3 不引入更强并发机制）。
  function commitProgress(write) {
    if (typeof navigator !== "undefined" && typeof navigator.locks?.request === "function") {
      return navigator.locks.request(`${STORAGE_KEY}-commit`, () => write());
    }
    return write();
  }
  // 显示读取可以容错；写入前必须确认原档可识别，不能把读取失败当成空档覆盖。
  // 已存在但结构无效的字段（如 [] 角色记录、字符串 recentBattles）一律拒绝写入并原样保留存档，
  // 不能交给 normalizeProgress 静默重置为第一关或丢弃历史；仅保留"字段缺失按默认"的旧 v1 兼容。
  function readProgressForWrite(storage, characters) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return defaultProgress(characters);
    const source = JSON.parse(raw);
    if (!source || typeof source !== "object" || Array.isArray(source) || source.version !== 1
      || !source.characters || typeof source.characters !== "object" || Array.isArray(source.characters)) throw new Error("战役存档无效，请先保留原数据");
    for (const key of ["revision", "resetGeneration"]) {
      const value = source[key];
      if (value === undefined) continue; // 旧 v1 存档没有并发计数字段，兼容归零。
      const numeric = typeof value === "number" || (typeof value === "string" && value.trim() !== "");
      if (!numeric || !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) >= Number.MAX_SAFE_INTEGER) throw new Error("战役版本无效");
    }
    // 已存在的角色记录必须是对象：数组或原始值会被归一化悄悄重置为第一关，属于坏档而非缺字段。
    for (const id of Object.keys(source.characters)) {
      const entry = source.characters[id];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("战役存档无效，请先保留原数据");
      if (entry.unlockedStage !== undefined && !Number.isFinite(Number(entry.unlockedStage))) throw new Error("战役存档无效，请先保留原数据");
      if (entry.completed !== undefined && typeof entry.completed !== "boolean" && ![0, 1, "true", "false", "yes", "no"].includes(entry.completed)) throw new Error("战役存档无效，请先保留原数据");
    }
    // recentBattles 存在即必须是记录数组：字符串会被归一化成空数组，
    // 不满足记录契约的项会被整条丢弃——两者都是坏档，写入前必须拒绝并原样保留。
    if (source.recentBattles !== undefined) {
      const characterIds = new Set(characters.map(character => character.id));
      if (!Array.isArray(source.recentBattles) || source.recentBattles.some(item => !recentBattleRecordValid(item, characterIds))) throw new Error("战役存档无效，请先保留原数据");
    }
    return normalizeProgress(source, characters);
  }
  // revision 是写入计数器（跨标签页并发由 resetGeneration 负责）：饱和在 MAX_SAFE_INTEGER - 1。
  // 写前校验拒绝 >= MAX_SAFE_INTEGER，因此再加 1 必须在写完即可被下一次校验接受，否则会自我锁死。
  function advanceRevision(value) {
    const current = Number(value);
    const base = Number.isSafeInteger(current) && current >= 0 ? current : 0;
    return Math.min(base + 1, Number.MAX_SAFE_INTEGER - 1);
  }
  // Reset shares the result transaction and the same strict write-time reader.
  function resetProgress(storage, characters) {
    return commitProgress(() => {
      const latest = readProgressForWrite(storage, characters);
      const fresh = defaultProgress(characters);
      fresh.revision = advanceRevision(latest.revision);
      fresh.resetGeneration = latest.resetGeneration + 1;
      storage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    });
  }
  global.campaignMode = { MAX_RING, STORAGE_KEY, flattenDeck, defaultProgress, loadProgress, recordStageWin, recordStageLoss, mulligan, addRingEnergy, resonanceCost, resonanceShield, intentFor, scoreBattle, healingEfficiency, normalizeProgress, authorizeStage, clampStage, passiveAllowed, consumePassive, enemyResonanceChoice, shouldEnterBossPhase, recentBattles, resultActions, effectiveCardCost, expireResonance, isFormalIntent, passiveTriggerState, aiCardValue, aiCardScore, planAiPlay, aiChoosePlay, aiContextFor, intentTypeForCard, createCombatStats, recordCombatEvent, drawCount, commitProgress, readProgressForWrite, advanceRevision, resetProgress };
})(globalThis);
