// 平衡模拟矩阵 CLI（本地大矩阵审计）。
//
// 用法：
//   node scripts/simulate-balance.mjs                 # 默认 12 个确定性种子
//   node scripts/simulate-balance.mjs --seeds=32      # 更细致的审计
//   node scripts/simulate-balance.mjs --quick         # 4 个种子，快速自查
//
// 产出（docs/balance/）：
//   balance-baseline.json  机读全量结果（供护栏脚本与后续对比使用）
//   balance-baseline.md    人读基线报告（胜率/回合/卡牌使用/能量曲线/Outlier）
//
// 注意：CI 只跑 scripts/verify-balance-guardrails.mjs 的小矩阵；
// 本脚本是本地审计工具，默认矩阵规模较大，不要在普通 CI 中执行。

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createSimulator, makeGreedyPolicy } from "./balance-sim.mjs";
import { HARNESS_ROOT } from "./balance-harness.mjs";

const args = Object.fromEntries(process.argv.slice(2).map(item => {
  const [key, value] = item.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const SEED_COUNT = args.quick ? 4 : Number(args.seeds) || 12;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => 1000 + index * 37);
const OUT_DIR = path.join(HARNESS_ROOT, "docs", "balance");

function mean(values) {
  const list = values.filter(value => Number.isFinite(value));
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function median(values) {
  const list = values.filter(value => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function stdev(values) {
  const list = values.filter(value => Number.isFinite(value));
  if (list.length < 2) return 0;
  const avg = mean(list);
  return Math.sqrt(list.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (list.length - 1));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function summarize(battles) {
  if (!battles.length) return null;
  const wins = battles.filter(battle => battle.victory).length;
  return {
    battles: battles.length,
    winRate: round(wins / battles.length),
    timeoutRate: round(battles.filter(battle => battle.timedOut).length / battles.length),
    roundsAvg: round(mean(battles.map(battle => battle.rounds)), 2),
    roundsMedian: round(median(battles.map(battle => battle.rounds)), 2),
    roundsMax: Math.max(...battles.map(battle => battle.rounds)),
    hpRatioAvg: round(mean(battles.map(battle => battle.playerHpRatio))),
    damageAvg: Math.round(mean(battles.map(battle => battle.stats.damage))),
    takenAvg: Math.round(mean(battles.map(battle => battle.stats.damageTaken))),
    healingAvg: Math.round(mean(battles.map(battle => battle.stats.healing))),
    overhealAvg: Math.round(mean(battles.map(battle => battle.stats.overheal))),
    shieldAvg: Math.round(mean(battles.map(battle => battle.stats.shield))),
    shieldAbsorbedAvg: Math.round(mean(battles.map(battle => battle.stats.shieldAbsorbed))),
    summonAvg: Math.round(mean(battles.map(battle => battle.stats.summonDamage))),
    cardsAvg: round(mean(battles.map(battle => battle.stats.cards)), 2),
    advancedAvg: round(mean(battles.map(battle => battle.stats.advanced)), 2),
    specialAvg: round(mean(battles.map(battle => battle.stats.special)), 2),
    resonanceAvg: round(mean(battles.map(battle => battle.stats.resonance)), 2),
    enemyResonanceAvg: round(mean(battles.map(battle => battle.stats.enemyResonance)), 2),
    passiveAvg: round(mean(battles.map(battle => battle.stats.passiveTriggers)), 2),
    elementalAdvantageAvg: round(mean(battles.map(battle => battle.stats.elementalAdvantage)), 2),
    reviveRate: round(battles.filter(battle => battle.stats.revived).length / battles.length),
    energyGeneratedAvg: round(mean(battles.map(battle => battle.metrics.energyGenerated)), 2),
    energySpentAvg: round(mean(battles.map(battle => battle.metrics.energySpent)), 2),
    energyWastedAvg: round(mean(battles.map(battle => battle.metrics.energyWasted)), 2),
    energyWasteRate: round(
      mean(battles.map(battle => (battle.metrics.energyGenerated > 0
        ? battle.metrics.energyWasted / Math.max(1, battle.metrics.energyGenerated)
        : 0))),
    ),
    noPlayableTurnRate: round(mean(battles.map(battle => battle.metrics.turnsNoPlayable / Math.max(1, battle.rounds)))),
    deadInHandPerBattle: round(mean(battles.map(battle => battle.metrics.deadInHandTurns)), 2),
    statusAppliedAvg: round(mean(battles.map(battle => battle.metrics.statusApplied)), 2),
    statusOverwrittenAvg: round(mean(battles.map(battle => battle.metrics.statusOverwritten)), 2),
    statusUptimeAvg: round(mean(battles.map(battle => battle.metrics.statusTurnsGranted)), 2),
    handOverflowAvg: round(mean(battles.map(battle => battle.metrics.handOverflow)), 2),
    drawAttemptsAvg: round(mean(battles.map(battle => battle.metrics.drawAttempts)), 2),
    grade: {
      S: battles.filter(battle => battle.grade === "S").length,
      A: battles.filter(battle => battle.grade === "A").length,
      B: battles.filter(battle => battle.grade === "B").length,
      C: battles.filter(battle => battle.grade === "C").length,
    },
  };
}

function mergeCardStats(target, battles) {
  battles.forEach(battle => {
    battle.metrics.perCard.forEach((stat, name) => {
      const row = target.get(name) || {
        name, tier: stat.tier, element: stat.element, cost: stat.cost,
        drawn: 0, played: 0, deadTurns: 0, amount: 0, energyPaid: 0, firstPlaySum: 0, firstPlayCount: 0, wins: 0, battles: 0,
      };
      row.drawn += stat.drawn;
      row.played += stat.played;
      row.deadTurns += stat.deadTurns;
      row.amount += stat.amount;
      row.energyPaid += stat.energyPaid;
      if (stat.firstPlayRound) { row.firstPlaySum += stat.firstPlayRound; row.firstPlayCount += 1; }
      row.wins += stat.wins;
      row.battles += stat.battles;
      target.set(name, row);
    });
  });
  return target;
}

function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach(item => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

async function main() {
  const startedAt = Date.now();
  const sim = await createSimulator();
  const policy = makeGreedyPolicy(sim.rt);
  const characters = sim.campaignData.characters;
  const stages = sim.campaignData.stages;
  const difficulties = Object.keys(sim.campaignData.difficulties);

  process.stdout.write(`balance sim: ${characters.length} 角色 × ${stages.length} 关卡 × ${difficulties.length} 难度 × ${SEEDS.length} 种子\n`);

  const campaign = [];
  for (const character of characters) {
    for (const stage of stages) {
      for (const difficulty of difficulties) {
        for (const seed of SEEDS) {
          campaign.push(await sim.runCampaignBattle({
            characterId: character.id, stage: stage.order, difficulty, seed, policy,
          }));
        }
      }
    }
  }
  process.stdout.write(`  战役：${campaign.length} 场（${Math.round((Date.now() - startedAt) / 1000)}s）\n`);

  // 沙盒矩阵：代表角色覆盖 低/中/高 三级（49→100 级）、五种种族、克制与被克制关系，
  // 两两全组合 + 多个种子，用于检查 30 名固定角色之间的真实强度分布。
  const sandboxPlayers = [
    "elf-enbolu",     // lv49 精灵族（最低等级锚点）
    "human-luolinfo", // lv61 人族 雷
    "orc-moluo",      // lv62 兽人族 风
    "human-lisaya",   // lv67 人族 光/暗
    "elf-eluxia",     // lv86 精灵族 冰/风/土
    "demon-heka",     // lv93 恶魔 火/暗
    "godkin-su",      // lv93 神人 暗/光/雷
    "ice-archon",     // lv95 精灵族 冰/风
    "dragon-yemosu",  // lv100 龙族 全系
  ].filter(id => sim.fixedCardLibrary.charactersById[id]);
  const sandbox = [];
  for (const playerId of sandboxPlayers) {
    for (const opponentId of sandboxPlayers) {
      if (opponentId === playerId) continue;
      for (const seed of SEEDS.slice(0, 4)) {
        sandbox.push(await sim.runSandboxBattle({ playerCharacterId: playerId, enemyCharacterId: opponentId, seed, policy }));
      }
    }
  }
  process.stdout.write(`  沙盒：${sandbox.length} 场（${Math.round((Date.now() - startedAt) / 1000)}s）\n`);

  // ---- 汇总 ----
  const report = {
    generatedAt: new Date().toISOString(),
    seeds: SEEDS,
    seedCount: SEEDS.length,
    campaignSummary: summarize(campaign),
    sandboxSummary: summarize(sandbox),
    roster: characters.map(character => ({ id: character.id, name: character.name, level: character.loreLevel })),
    stageOrder: stages.map(stage => stage.order),
    byCharacter: {},
    byCharacterDifficulty: {},
    byStage: {},
    byStageDifficulty: {},
    byCharacterStage: {},
    byDifficulty: {},
    energyCurve: {},
    costCurve: {},
    campaignCards: {},
    sandboxCards: {},
    outliers: [],
  };

  characters.forEach(character => {
    const rows = campaign.filter(battle => battle.characterId === character.id);
    report.byCharacter[character.id] = { name: character.name, ...summarize(rows) };
    difficulties.forEach(difficulty => {
      report.byCharacterDifficulty[`${character.id}/${difficulty}`] = summarize(rows.filter(battle => battle.difficulty === difficulty));
    });
  });
  stages.forEach(stage => {
    const rows = campaign.filter(battle => battle.stage === stage.order);
    report.byStage[stage.enemyName] = { stage: stage.order, ...summarize(rows) };
    difficulties.forEach(difficulty => {
      report.byStageDifficulty[`${stage.order}/${difficulty}`] = summarize(rows.filter(battle => battle.difficulty === difficulty));
    });
  });
  difficulties.forEach(difficulty => {
    report.byDifficulty[difficulty] = summarize(campaign.filter(battle => battle.difficulty === difficulty));
  });
  // 角色 × 关卡（普通难度）：定位"由角色等级与敌方等级差距造成的推进墙/碾压"，而不是只看整体胜率。
  characters.forEach(character => {
    stages.forEach(stage => {
      const rows = campaign.filter(battle => battle.characterId === character.id && battle.stage === stage.order && battle.difficulty === "normal");
      report.byCharacterStage[`${character.id}/${stage.order}`] = { character: character.name, level: character.loreLevel, stage: stage.order, ...summarize(rows) };
    });
  });

  // 能量曲线：按“卡牌费用 → 首次可打的回合、卡手回合、每费收益”
  const energyBuckets = new Map();
  const cardRows = mergeCardStats(new Map(), campaign);
  const sandboxCardRows = mergeCardStats(new Map(), sandbox);
  cardRows.forEach((row, name) => {
    const bucket = energyBuckets.get(row.cost) || { cost: row.cost, drawn: 0, played: 0, deadTurns: 0, amount: 0, energyPaid: 0, firstPlaySum: 0, firstPlayCount: 0, cards: 0, wins: 0, battles: 0 };
    bucket.drawn += row.drawn;
    bucket.played += row.played;
    bucket.deadTurns += row.deadTurns;
    bucket.amount += row.amount;
    bucket.energyPaid += row.energyPaid;
    bucket.firstPlaySum += row.firstPlaySum;
    bucket.firstPlayCount += row.firstPlayCount;
    bucket.cards += 1;
    bucket.wins += row.wins;
    bucket.battles += row.battles;
    energyBuckets.set(row.cost, bucket);
  });
  [...energyBuckets.values()].sort((a, b) => a.cost - b.cost).forEach(bucket => {
    report.energyCurve[bucket.cost] = {
      cost: bucket.cost,
      cardVariants: bucket.cards,
      drawn: bucket.drawn,
      played: bucket.played,
      playWhenDrawn: round(bucket.drawn ? bucket.played / bucket.drawn : 0),
      avgFirstPlayRound: round(bucket.firstPlayCount ? bucket.firstPlaySum / bucket.firstPlayCount : 0, 2),
      deadTurns: bucket.deadTurns,
      avgAmountPerPlay: bucket.played ? Math.round(bucket.amount / bucket.played) : 0,
      amountPerEnergy: bucket.energyPaid ? Math.round(bucket.amount / bucket.energyPaid) : 0,
      theoreticalFirstRound: bucket.cost <= 3 ? 1 : Math.ceil((bucket.cost - 3) / 2) + 1,
    };
  });

  // 费用倍率曲线（静态审计：同一效果模板在不同费用下的理论边际收益）
  const baseScale = 0.06;
  const multipliers = { 2: .50, 3: .66, 4: .84, 5: 1.05, 6: 1.30, 7: 1.60, 8: 2.00, 9: 2.70, 10: 3.70 };
  Object.entries(multipliers).forEach(([cost, multiplier]) => {
    const numeric = Number(cost);
    const previous = multipliers[numeric - 1];
    report.costCurve[cost] = {
      cost: numeric,
      multiplier,
      ratioPerEnergy: round(multiplier / numeric, 4),
      marginalVsPrevious: previous ? round(multiplier / previous, 4) : null,
      damageTemplateRatio: round(baseScale * multiplier, 4),
    };
  });

  const serializeCards = map => Object.fromEntries([...map.entries()].map(([name, row]) => [name, {
    tier: row.tier, element: row.element, cost: row.cost,
    drawn: row.drawn, played: row.played,
    playWhenDrawn: round(row.drawn ? row.played / row.drawn : 0),
    deadTurns: row.deadTurns,
    avgFirstPlayRound: round(row.firstPlayCount ? row.firstPlaySum / row.firstPlayCount : 0, 2),
    amount: Math.round(row.amount),
    energyPaid: row.energyPaid,
    amountPerEnergy: row.energyPaid ? Math.round(row.amount / row.energyPaid) : 0,
    battles: row.battles,
  }]));
  report.campaignCards = serializeCards(cardRows);
  report.sandboxCards = serializeCards(sandboxCardRows);

  // ---- Outlier 判定 ----
  const outlier = (kind, subject, detail, value) => report.outliers.push({ kind, subject, detail, value });
  Object.entries(report.byCharacterDifficulty).forEach(([key, summary]) => {
    if (!summary) return;
    if (summary.winRate <= 0.15) outlier("低胜率", key, `胜率 ${(summary.winRate * 100).toFixed(1)}%`, summary.winRate);
    if (summary.winRate >= 0.98 && summary.roundsAvg <= 4) outlier("碾压", key, `胜率 ${(summary.winRate * 100).toFixed(1)}% 且平均 ${summary.roundsAvg} 回合`, summary.winRate);
    if (summary.roundsAvg >= 25) outlier("超长局", key, `平均 ${summary.roundsAvg} 回合`, summary.roundsAvg);
    if (summary.timeoutRate > 0) outlier("超时", key, `超时率 ${(summary.timeoutRate * 100).toFixed(1)}%`, summary.timeoutRate);
    if (summary.takenAvg === 0) outlier("零承伤", key, "全程未受到任何伤害", 0);
  });
  Object.entries(report.energyCurve).forEach(([cost, bucket]) => {
    if (bucket.drawn >= 20 && bucket.playWhenDrawn <= 0.05 && Number(cost) >= 8) {
      outlier("高费卡低使用", `cost=${cost}`, `抽到后打出率 ${(bucket.playWhenDrawn * 100).toFixed(1)}%`, bucket.playWhenDrawn);
    }
  });
  // 难度倒挂：同一角色同一关卡，低难度比高难度更难
  characters.forEach(character => {
    for (let stage = 1; stage <= stages.length; stage += 1) {
      const easy = report.byCharacterDifficulty[`${character.id}/easy`] && campaign.filter(battle => battle.characterId === character.id && battle.stage === stage && battle.difficulty === "easy");
      const hard = campaign.filter(battle => battle.characterId === character.id && battle.stage === stage && battle.difficulty === "hard");
      if (!easy.length || !hard.length) continue;
      const easyRate = easy.filter(battle => battle.victory).length / easy.length;
      const hardRate = hard.filter(battle => battle.victory).length / hard.length;
      if (hardRate - easyRate > 0.25) outlier("难度倒挂", `${character.id}/stage${stage}`, `困难 ${(hardRate * 100).toFixed(0)}% > 简单 ${(easyRate * 100).toFixed(0)}%`, hardRate - easyRate);
    }
  });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "balance-baseline.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(path.join(OUT_DIR, "balance-baseline.md"), renderMarkdown(report), "utf8");

  process.stdout.write(`\n完成：${Math.round((Date.now() - startedAt) / 1000)}s\n`);
  process.stdout.write(`outliers: ${report.outliers.length}\n`);
  report.outliers.slice(0, 40).forEach(item => process.stdout.write(`  [${item.kind}] ${item.subject} — ${item.detail}\n`));
  process.stdout.write(`\n报告：docs/balance/balance-baseline.md\n`);
}

function pct(value) { return `${(Number(value) * 100).toFixed(1)}%`; }

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# 平衡基线报告（Balance Baseline Report）");
  lines.push("");
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(`- 种子：${report.seeds.join(", ")}（共 ${report.seedCount} 个确定性种子）`);
  lines.push("- 玩家策略：与战役 AI 同源的估值函数（`campaignMode.aiCardScore`），因此这是“同等水平的双方”对局，")
  lines.push("  用于暴露**系统性问题**而非模拟真人操作上限。");
  lines.push("- 全部战斗由 index.html + js/fixed-*.js 的真实结算路径执行；模拟器只提供确定性种子、")
  lines.push("  虚拟时钟与无 DOM 适配，不复制任何战斗数学。");
  lines.push("");
  lines.push("## 1. 总体");
  lines.push("");
  const overall = report.campaignSummary;
  lines.push(table(["指标", "战役模式", "沙盒模式"], [
    ["场次", overall.battles, report.sandboxSummary.battles],
    ["胜率", pct(overall.winRate), pct(report.sandboxSummary.winRate)],
    ["平均回合", overall.roundsAvg, report.sandboxSummary.roundsAvg],
    ["平均剩余生命", pct(overall.hpRatioAvg), pct(report.sandboxSummary.hpRatioAvg)],
    ["平均承伤", overall.takenAvg, report.sandboxSummary.takenAvg],
    ["平均伤害", overall.damageAvg, report.sandboxSummary.damageAvg],
    ["平均治疗 / 过量", `${overall.healingAvg} / ${overall.overhealAvg}`, `${report.sandboxSummary.healingAvg} / ${report.sandboxSummary.overhealAvg}`],
    ["平均护盾 / 吸收", `${overall.shieldAvg} / ${overall.shieldAbsorbedAvg}`, `${report.sandboxSummary.shieldAvg} / ${report.sandboxSummary.shieldAbsorbedAvg}`],
    ["平均召唤伤害", overall.summonAvg, report.sandboxSummary.summonAvg],
    ["平均出牌 / 高级 / 特殊", `${overall.cardsAvg} / ${overall.advancedAvg} / ${overall.specialAvg}`, `${report.sandboxSummary.cardsAvg} / ${report.sandboxSummary.advancedAvg} / ${report.sandboxSummary.specialAvg}`],
    ["平均共鸣（我方/敌方）", `${overall.resonanceAvg} / ${overall.enemyResonanceAvg}`, `${report.sandboxSummary.resonanceAvg} / ${report.sandboxSummary.enemyResonanceAvg}`],
    ["元素克制触发均值", overall.elementalAdvantageAvg, report.sandboxSummary.elementalAdvantageAvg],
    ["能量产生 / 消耗 / 浪费", `${overall.energyGeneratedAvg} / ${overall.energySpentAvg} / ${overall.energyWastedAvg}`, `${report.sandboxSummary.energyGeneratedAvg} / ${report.sandboxSummary.energySpentAvg} / ${report.sandboxSummary.energyWastedAvg}`],
    ["能量浪费率", pct(overall.energyWasteRate), pct(report.sandboxSummary.energyWasteRate)],
    ["无牌可出回合占比", pct(overall.noPlayableTurnRate), pct(report.sandboxSummary.noPlayableTurnRate)],
    ["每场卡手回合", overall.deadInHandPerBattle, report.sandboxSummary.deadInHandPerBattle],
    ["状态施加 / 覆盖 / 回合数", `${overall.statusAppliedAvg} / ${overall.statusOverwrittenAvg} / ${overall.statusUptimeAvg}`, `${report.sandboxSummary.statusAppliedAvg} / ${report.sandboxSummary.statusOverwrittenAvg} / ${report.sandboxSummary.statusUptimeAvg}`],
    ["手牌溢出", overall.handOverflowAvg, report.sandboxSummary.handOverflowAvg],
  ]));
  lines.push("");
  lines.push("## 2. 角色 × 难度");
  lines.push("");
  const grade = summary => `S${summary.grade.S} A${summary.grade.A} B${summary.grade.B} C${summary.grade.C}`;
  lines.push(table(
    ["角色", "难度", "胜率", "平均回合", "中位回合", "剩余生命", "平均承伤", "平均出牌", "高级/特殊", "共鸣", "评价分布"],
    Object.entries(report.byCharacterDifficulty).map(([key, summary]) => {
      const [characterId, difficulty] = key.split("/");
      const name = report.byCharacter[characterId]?.name || characterId;
      return [name, difficulty, pct(summary.winRate), summary.roundsAvg, summary.roundsMedian, pct(summary.hpRatioAvg), summary.takenAvg, summary.cardsAvg, `${summary.advancedAvg}/${summary.specialAvg}`, summary.resonanceAvg, grade(summary)];
    }),
  ));
  lines.push("");
  lines.push("## 3. 关卡 × 难度");
  lines.push("");
  lines.push(table(
    ["关卡", "难度", "胜率", "平均回合", "平均承伤", "敌方共鸣", "无牌可出占比", "卡手回合"],
    Object.entries(report.byStageDifficulty).map(([key, summary]) => {
      const [stage, difficulty] = key.split("/");
      return [`第${stage}关`, difficulty, pct(summary.winRate), summary.roundsAvg, summary.takenAvg, summary.enemyResonanceAvg, pct(summary.noPlayableTurnRate), summary.deadInHandPerBattle];
    }),
  ));
  lines.push("");
  lines.push("## 3.1 角色 × 关卡 矩阵（普通难度）");
  lines.push("");
  lines.push("敌方等级固定（第1–5关依次对应敌方角色等级），而六名可玩角色等级跨度很大。");
  lines.push("本表用于把「整体胜率」拆成「某个等级的角色在某一关是否可推进」，是定位推进墙/碾压的直接证据。");
  lines.push("");
  lines.push(table(
    ["角色", "角色等级", ...report.stageOrder.map(order => `第${order}关`)],
    report.roster.map(character => {
      const cells = report.stageOrder.map(order => {
        const row = report.byCharacterStage[`${character.id}/${order}`];
        if (!row) return "-";
        const win = pct(row.winRate);
        return row.timeoutRate > 0 ? `${win}(僵${pct(row.timeoutRate)})` : win;
      });
      return [character.name, character.level, ...cells];
    }),
  ));
  lines.push("");
  lines.push("## 4. 能量曲线（实测）");
  lines.push("");
  lines.push(table(
    ["费用", "抽到率（卡面种类）", "抽到后打出率", "平均首次打出回合", "理论首次可用回合", "卡手回合数", "每次打出均值", "每费收益"],
    Object.entries(report.energyCurve).map(([cost, bucket]) => [
      cost, bucket.cardVariants, pct(bucket.playWhenDrawn), bucket.avgFirstPlayRound, bucket.theoreticalFirstRound, bucket.deadTurns, bucket.avgAmountPerPlay, bucket.amountPerEnergy,
    ]),
  ));
  lines.push("");
  lines.push("## 5. 费用倍率曲线（静态）");
  lines.push("");
  lines.push(table(
    ["费用", "COST_MULTIPLIER", "边际倍率（相对上一费）", "每费倍率", "伤害模板 ratio"],
    Object.entries(report.costCurve).map(([cost, row]) => [cost, row.multiplier, row.marginalVsPrevious ?? "—", row.ratioPerEnergy, row.damageTemplateRatio]),
  ));
  lines.push("");
  lines.push("## 6. 卡牌使用统计（战役模式，按打出次数降序）");
  lines.push("");
  const cardEntries = Object.entries(report.campaignCards).sort((a, b) => b[1].played - a[1].played);
  lines.push(table(
    ["卡牌", "档位", "属性", "费用", "抽到", "打出", "抽到后台出率", "平均首次回合", "卡手回合", "每费收益"],
    cardEntries.slice(0, 60).map(([name, row]) => [name, row.tier, row.element, row.cost, row.drawn, row.played, pct(row.playWhenDrawn), row.avgFirstPlayRound, row.deadTurns, row.amountPerEnergy]),
  ));
  lines.push("");
  lines.push("### 6.1 低使用率卡牌（抽到 ≥ 20 次且打出率 < 15%）");
  lines.push("");
  const unused = cardEntries.filter(([, row]) => row.drawn >= 20 && row.playWhenDrawn < 0.15);
  lines.push(unused.length
    ? table(["卡牌", "档位", "费用", "抽到", "打出", "抽到后台出率", "卡手回合"], unused.map(([name, row]) => [name, row.tier, row.cost, row.drawn, row.played, pct(row.playWhenDrawn), row.deadTurns]))
    : "（无）");
  lines.push("");
  lines.push("## 7. Outlier");
  lines.push("");
  lines.push(report.outliers.length
    ? table(["类型", "对象", "说明", "数值"], report.outliers.map(item => [item.kind, item.subject, item.detail, String(round(item.value, 4))]))
    : "（无显著 Outlier）");
  lines.push("");
  lines.push("## 8. 三档难度对比");
  lines.push("");
  lines.push(table(
    ["难度", "胜率", "平均回合", "平均承伤", "剩余生命", "平均出牌", "能量浪费率", "评价分布"],
    Object.entries(report.byDifficulty).map(([difficulty, summary]) => [difficulty, pct(summary.winRate), summary.roundsAvg, summary.takenAvg, pct(summary.hpRatioAvg), summary.cardsAvg, pct(summary.energyWasteRate), grade(summary)]),
  ));
  lines.push("");
  // 折叠末尾空行：避免写出 "new blank line at EOF"（git diff --check 视为空白错误）。
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
