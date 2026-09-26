// Balance Simulation —— 战斗驱动层与指标采集。
//
// 与 balance-harness.mjs 的分工：
//   - harness 负责“真实代码就位”（加载 + 桩接 + 虚拟时钟）
//   - 本文件负责“怎么打、记什么”，不实现任何战斗数学
//
// 所有伤害/治疗/护盾/状态/能量/召唤都由 index.html + js/fixed-*.js 的真实结算路径产生；
// 本文件只在最外层包一层计数器（与 campaign-runtime 包裹 playCard 的既有做法一致）。

import { createSimRuntime } from "./balance-harness.mjs";

export const STATUS_TYPES = ["燃烧", "诅咒", "冻结", "禁锢", "虚弱", "减伤", "增幅", "灵巧防御", "连锁", "复生", "真实", "抽牌压制", "中毒", "破甲"];

function emptyCardStat(card) {
  return {
    name: card.name,
    tier: card.skillTier || card.tier || "basic",
    element: card.element,
    cost: card.cost,
    drawn: 0,
    played: 0,
    deadTurns: 0,
    amount: 0,
    energyPaid: 0,
    firstPlayRound: 0,
    wins: 0,
    battles: 0,
    // "当回合可支付却没被打出"的次数：结构缺陷信号，正常应恒为 0。
    skippedAffordable: 0,
  };
}

function createMetrics() {
  return {
    perCard: new Map(),
    energyGenerated: 0,
    energySpent: 0,
    turnsNoPlayable: 0,
    handOverflow: 0,
    drawAttempts: 0,
    drawsLanded: 0,
    deadInHandTurns: 0,
    statusApplied: 0,
    statusOverwritten: 0,
    statusTurnsGranted: 0,
    resonanceChoices: { star: 0, echo: 0, guard: 0 },
    energyWasted: 0,
    playerPlays: 0,
    enemyPlays: 0,
    energySpentBySide: { player: 0, enemy: 0 },
    maxEnergyObserved: 0,
    // 结构完整性违规（NaN/负能量/HP 越界等）。只记录，不改变结算；护栏据此做硬断言。
    violations: [],
    // "有能量 + 有可支付牌却结束回合"的次数（应为 0）。
    affordableSkipped: 0,
    // 出牌循环的退出原因计数（诊断用；stepCap/turnChanged > 0 说明需要关注节奏）。
    loopExits: { noCard: 0, rejected: 0, stepCap: 0, turnChanged: 0, gameOver: 0 },
  };
}

// 结构完整性采样：这些是“无论平衡如何都绝不允许发生”的不变式。
function checkIntegrity(state, metrics, tag) {
  if (!state || !metrics) return;
  for (const side of ["player", "enemy"]) {
    const fighter = state[side];
    if (!fighter) continue;
    const hpOk = Number.isFinite(fighter.hp) && fighter.hp >= 0;
    const maxOk = Number.isFinite(fighter.maxHp) && fighter.maxHp > 0;
    const energyOk = Number.isFinite(fighter.energy) && fighter.energy >= 0;
    if (!hpOk || !maxOk || !energyOk || fighter.hp > fighter.maxHp + 1e-6) {
      if (metrics.violations.length < 20) {
        metrics.violations.push({ tag, side, hp: fighter.hp, maxHp: fighter.maxHp, energy: fighter.energy });
      }
    }
  }
}

function recordDraw(metrics, card) {
  const stat = metrics.perCard.get(card.name) || emptyCardStat(card);
  stat.drawn += 1;
  metrics.perCard.set(card.name, stat);
}

function recordPlay(metrics, side, card, energyPaid) {
  const stat = metrics.perCard.get(card.name) || emptyCardStat(card);
  stat.played += 1;
  stat.energyPaid += energyPaid;
  if (!stat.firstPlayRound) stat.firstPlayRound = metrics.round;
  metrics.perCard.set(card.name, stat);
  if (side === "player") { metrics.playerPlays += 1; metrics.energySpent += energyPaid; }
  else metrics.enemyPlays += 1;
  metrics.energySpentBySide[side] += energyPaid;
}

// 在最外层包裹真实引擎方法，采集指标。包裹只做“读 + 记”，不再改写任何结算结果。
// 每个运行时只包裹一次；切换对局时只替换 currentMetrics 引用，避免包裹层叠导致重复计数。
const instrumentedRuntimes = new WeakSet();
let currentMetrics = null;

function installInstrumentation(rt, metrics) {
  currentMetrics = metrics;
  if (instrumentedRuntimes.has(rt)) return metrics;
  instrumentedRuntimes.add(rt);
  const { gameEngine, campaignMode } = rt;
  const metricsRef = () => currentMetrics;

  const basePlayCard = gameEngine.playCard;
  const baseDraw = gameEngine.draw;
  const baseApplyStatus = gameEngine.applyStatus;
  const baseBeginTurn = gameEngine.beginTurn;
  const baseApplyCard = gameEngine.applyCard;
  const baseCheckGameOver = gameEngine.checkGameOver;

  gameEngine.playCard = function (side, instanceId) {
    const state = this.state;
    const actor = state?.[side];
    const card = actor?.hand.find(item => item.instanceId === instanceId);
    if (!card) return basePlayCard.call(this, side, instanceId);
    const cost = typeof campaignMode.effectiveCardCost === "function"
      ? campaignMode.effectiveCardCost(state, side, card)
      : card.cost;
    const result = basePlayCard.call(this, side, instanceId);
    if (result) recordPlay(metricsRef(), side, card, cost);
    return result;
  };

  gameEngine.draw = function (fighter, amount = 1) {
    const beforeHand = fighter.hand.length;
    const result = baseDraw.call(this, fighter, amount);
    const live = metricsRef();
    live.drawAttempts += Math.max(0, Number(amount) || 0);
    live.drawsLanded += Math.max(0, fighter.hand.length - beforeHand);
    // 手牌上限：draw 尝试了但手牌没增长、且手牌已满 → 记为溢出手牌
    if (fighter.hand.length >= 8 && fighter.hand.length - beforeHand < (Number(amount) || 0)) live.handOverflow += 1;
    for (let index = beforeHand; index < fighter.hand.length; index += 1) recordDraw(live, fighter.hand[index]);
    return result;
  };

  gameEngine.applyStatus = function (target, incoming) {
    if (incoming?.status) {
      const unit = incoming.unit || "fixed";
      const existing = target.statuses?.find(status => status.type === incoming.status && (status.unit || "fixed") === unit);
      const live = metricsRef();
      live.statusApplied += 1;
      live.statusTurnsGranted += Math.max(0, Number(incoming.turns) || 0);
      if (existing) live.statusOverwritten += 1;
    }
    return baseApplyStatus.call(this, target, incoming);
  };

  gameEngine.beginTurn = function (side) {
    const state = this.state;
    const result = baseBeginTurn.call(this, side);
    if (state && !state.gameOver && side === "player") {
      const fighter = state[side];
      metricsRef().energyGenerated += fighter.energy;
      metricsRef().maxEnergyObserved = Math.max(metricsRef().maxEnergyObserved, fighter.energy);
    }
    return result;
  };

  gameEngine.applyCard = function (actor, target, card) {
    const result = baseApplyCard.call(this, actor, target, card);
    const live = metricsRef();
    const stat = live.perCard.get(card.name) || emptyCardStat(card);
    stat.amount += Math.max(0, Number(result?.amount) || 0);
    live.perCard.set(card.name, stat);
    return result;
  };

  gameEngine.checkGameOver = function () {
    const state = this.state;
    const result = baseCheckGameOver.call(this);
    if (state?.gameOver) {
      const live = metricsRef();
      live.perCard.forEach(stat => { stat.battles += 1; if (state.winner === "player") stat.wins += 1; });
    }
    return result;
  };
  return metrics;
}

function newBattleResult(descriptor) {
  return {
    ...descriptor,
    victory: false,
    rounds: 0,
    timedOut: false,
    finished: false,
    guardExhausted: false,
    roundsReachedCap: false,
    playerHp: 0,
    playerMaxHp: 0,
    playerHpRatio: 0,
    grade: "C",
    stats: null,
    metrics: null,
    turnLog: [],
  };
}

// 玩家策略：复用生产 AI 的估值（campaignMode.aiChoosePlay / aiCardScore）。
// 这是“策略适配器”，不是第二套规则——卡片价值判断与战役 AI 完全同源。
export function makeGreedyPolicy(rt) {
  const { campaignMode } = rt;
  return function decide(state, metrics) {
    const player = state.player;
    const enemy = state.enemy;
    const ring = state.campaign?.playerRing || 0;
    let resonance = null;
    if (state.campaign && ring >= 6 && !state.campaign.resonanceUsed && !player.skipAction) {
      const playable = player.hand.map(card => ({ ...card, effectiveCost: campaignMode.effectiveCardCost(state, "player", card) }))
        .filter(card => card.effectiveCost <= player.energy);
      const hasUnlockable = player.hand.some(card => {
        const cost = campaignMode.effectiveCardCost(state, "player", card);
        return cost > player.energy && Math.max(0, cost - 2) <= player.energy;
      });
      if (hasUnlockable) resonance = "star";
      else if (player.hp / player.maxHp < .55) resonance = "guard";
      else if (player.hand.length <= 4) resonance = "echo";
      else if (playable.length >= 2) resonance = "star";
      else resonance = "guard";
    }
    const pick = typeof campaignMode.aiChoosePlay === "function"
      ? campaignMode.aiChoosePlay(state, "player", { style: null, ...campaignMode.aiContextFor?.(state, "player") })
      : null;
    if (pick) return { resonance, card: pick };
    // 回退：与战役 AI 同源的贪心估值（生产 aiCardScore），使用显式 self/target 语义。
    const playable = player.hand
      .map(card => ({ ...card, effectiveCost: campaignMode.effectiveCardCost(state, "player", card) }))
      .filter(card => card.effectiveCost <= player.energy);
    if (!playable.length) return { resonance, card: null };
    const context = { actor: player, target: enemy, style: null, handSize: player.hand.length, selfLowHp: player.hp / player.maxHp < .35, targetLowHp: enemy.hp / enemy.maxHp < .3, targetHasCurse: enemy.statuses.some(status => status.type === "诅咒") };
    playable.sort((a, b) => campaignMode.aiCardScore(b, context) - campaignMode.aiCardScore(a, context));
    return { resonance, card: player.hand.find(card => card.instanceId === playable[0].instanceId) || null };
  };
}

// 沙盒策略（无战役层）：同一共享决策入口，style 为空。
export function makeSandboxPolicy(rt) {
  const { campaignMode } = rt;
  return function decide(state) {
    const actor = state.player;
    if (!actor.hand.length) return { resonance: null, card: null };
    const pick = campaignMode.aiChoosePlay(state, "player", { style: null });
    if (pick) return { resonance: null, card: pick };
    const playable = actor.hand.filter(card => card.cost <= actor.energy);
    if (!playable.length) return { resonance: null, card: null };
    const context = { actor, target: state.enemy, style: null, handSize: actor.hand.length, selfLowHp: actor.hp / actor.maxHp < .35, targetLowHp: state.enemy.hp / state.enemy.maxHp < .3 };
    playable.sort((a, b) => campaignMode.aiCardScore(b, context) - campaignMode.aiCardScore(a, context));
    return { resonance: null, card: playable[0] };
  };
}

export async function createSimulator() {
  const rt = await createSimRuntime();
  const { gameEngine, campaignMode, campaignData, campaignUiHarness, fixedCardLibrary } = rt;
  rt.seedProgress();

  const engineBaseTurn = {};

  async function playPlayerTurn(state, policy, metrics) {
    const player = state.player;
    // 本回合是否存在可出的牌（用于统计"无牌可出"）
    const affordable = player.hand.some(card => campaignMode.effectiveCardCost(state, "player", card) <= player.energy);
    if (!affordable) metrics.turnsNoPlayable += 1;

    // 单回合出牌上限：真实规则只受能量与手牌约束（低费牌 + 抽牌可以在一回合内打出十几张），
    // 因此这里必须给足步数，否则会人为截断伤害、把"能打却没打"误判成 AI 缺陷。
    const STEP_CAP = 32;
    const affordableNow = () => player.hand.filter(card => campaignMode.effectiveCardCost(state, "player", card) <= player.energy);
    // "仍有能量 + 有可支付的牌"却结束回合 = AI 放弃了本可打出的牌。
    // 只在"AI 自己认为没牌可打"（!card）这一条退出路径上判定，
    // 其它退出原因（回合已交还 / 触发结算 / 步数触顶）不是 AI 决策问题。
    const recordSkippedAffordable = () => {
      if (state.gameOver || state.turn !== "player" || player.energy <= 0) return;
      const affordable = affordableNow();
      if (!affordable.length) return;
      metrics.affordableSkipped += affordable.length;
      affordable.forEach(card => {
        const stat = metrics.perCard.get(card.name) || emptyCardStat(card);
        stat.skippedAffordable += 1;
        metrics.perCard.set(card.name, stat);
      });
    };
    let steps = 0;
    while (!state.gameOver && state.turn === "player" && steps < STEP_CAP) {
      steps += 1;
      if (player.skipAction) break; // 被禁锢/控制：真实 UI 会禁用出牌，玩家只能结束回合
      let decision = policy(state, metrics);
      if (decision.resonance) {
        metrics.resonanceChoices[decision.resonance] += 1;
        campaignUiHarness.activateResonance(decision.resonance);
        await rt.drain();
        // 共鸣会改变资源（回响 +1 能量 / 星耀 −2 费）与手牌，必须重新决策一次；
        // 否则会出现"刚补了资源却不打牌"的假缺陷（真人会紧接着出牌）。
        decision = policy(state, metrics);
      }
      const card = decision.card;
      if (!card) { metrics.loopExits.noCard += 1; recordSkippedAffordable(); break; }
      const ok = gameEngine.resolveAction({ type: "playCard", side: "player", cardInstanceId: card.instanceId });
      if (ok === false) { metrics.loopExits.rejected += 1; break; }
      await rt.drain();
    }
    if (steps >= STEP_CAP) metrics.loopExits.stepCap += 1;
    if (state.turn !== "player" && !state.gameOver) metrics.loopExits.turnChanged += 1;
    if (state.gameOver) metrics.loopExits.gameOver += 1;
    // 回合结束：记录手牌中"因费用卡手"的牌与剩余能量
    const leftover = player.energy;
    if (Number.isFinite(leftover) && leftover > 0) metrics.energyWasted = (metrics.energyWasted || 0) + leftover;
    player.hand.forEach(card => {
      const cost = campaignMode.effectiveCardCost(state, "player", card);
      if (cost > player.energy) {
        metrics.deadInHandTurns += 1;
        const stat = metrics.perCard.get(card.name) || emptyCardStat(card);
        stat.deadTurns += 1;
        metrics.perCard.set(card.name, stat);
      }
    });
  }

  async function runOnce(descriptor, { policy, start, maxRounds = 45, afterStart }) {
    const metrics = createMetrics();
    installInstrumentation(rt, metrics);
    if (descriptor.seed != null) rt.setSeed(descriptor.seed);
    const state = await start();
    if (typeof afterStart === "function") afterStart(state);
    const result = newBattleResult(descriptor);
    result.playerMaxHp = state.player.maxHp;
    metrics.round = 1;

    let guard = 0;
    const GUARD_CAP = 2000;
    while (!state.gameOver && state.round <= maxRounds && guard < GUARD_CAP) {
      guard += 1;
      metrics.round = state.round;
      if (state.turn === "player") {
        await playPlayerTurn(state, policy, metrics);
        if (state.gameOver) break;
        gameEngine.resolveAction({ type: "endTurn", side: "player" });
        await rt.drain();
      }
      checkIntegrity(state, metrics, `round${state.round}-player`);
      if (state.gameOver) break;
      if (state.turn === "enemy") {
        await rt.waitForPlayerTurn(state);
        if (!state.gameOver && state.turn === "enemy") {
          // 敌方回合未能交还控制权：强制结束，避免模拟挂死
          gameEngine.resolveAction({ type: "endTurn", side: "enemy" });
          await rt.drain();
        }
      }
      checkIntegrity(state, metrics, `round${state.round}-enemy`);
    }
    // 结构性停滞标记：驱动循环自身是否耗尽预算（与“正常打到 maxRounds 上限”区分开）
    result.guardExhausted = !state.gameOver && guard >= GUARD_CAP;
    result.roundsReachedCap = !state.gameOver && state.round > maxRounds;

    result.finished = Boolean(state.gameOver);
    result.timedOut = !state.gameOver;
    result.victory = state.winner === "player";
    result.rounds = state.round;
    result.playerHp = state.player.hp;
    result.playerHpRatio = state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 0;
    result.stats = { ...state.combatStats };
    result.metrics = metrics;
    if (state.campaign) {
      result.grade = campaignMode.scoreBattle({
        victory: result.victory,
        hpRatio: result.playerHpRatio,
        damageTaken: state.combatStats.damageTaken,
        maxHp: state.player.maxHp,
        healing: state.combatStats.healing,
        overheal: state.combatStats.overheal,
        rounds: state.round,
        difficulty: state.campaign.difficulty,
        revived: Boolean(state.combatStats.revived),
      });
    }
    return result;
  }

  return {
    rt,
    gameEngine,
    campaignMode,
    campaignData,
    fixedCardLibrary,
    runCampaignBattle({ characterId, stage, difficulty, seed, policy, maxRounds, afterStart }) {
      campaignUiHarness.select(characterId, stage, difficulty);
      return runOnce(
        { mode: "campaign", characterId, stage, difficulty, seed: seed ?? null },
        { policy, maxRounds, afterStart, start: () => campaignUiHarness.start() },
      );
    },
    async runSandboxBattle({ playerCharacterId, enemyCharacterId, seed, policy, maxRounds }) {
      const resolveId = id => (fixedCardLibrary.charactersById[id]
        ? id
        : campaignUiHarness.characterMap?.[id] || campaignData.characters.find(item => item.id === id)?.id || id);
      const playerId = resolveId(playerCharacterId);
      const playerDeck = fixedCardLibrary.createRuntimeDeck(playerId);
      const enemyDeck = enemyCharacterId
        ? fixedCardLibrary.createRuntimeDeck(enemyCharacterId)
        : rt.context.deckBuilder.pickEnemyFor(playerDeck);
      const start = async () => {
        const state = gameEngine.start(playerDeck, enemyDeck);
        state.combatStats = state.combatStats || campaignMode.createCombatStats();
        return state;
      };
      return runOnce(
        { mode: "sandbox", characterId: playerCharacterId, enemyId: enemyDeck.characterId || enemyDeck.id, stage: null, difficulty: null, seed: seed ?? null },
        { policy, maxRounds, start },
      );
    },
    drain: rt.drain,
  };
}
