#!/usr/bin/env node
// 平衡护栏（Balance Guardrails）—— CI 用的小规模确定性矩阵。
//
// 定位：这是**回归闸门**，不是"游戏必须平衡"的判据。
//   - 硬断言只覆盖"无论平衡如何都绝不允许发生"的结构不变式（NaN、负能量、HP 越界、
//     驱动死循环、AI 无视可打出的牌、费用曲线/能量曲线倒挂、难度倒挂、确定性）。
//   - 明确**不**断言"所有角色胜率都接近 50%"——那是把差异抹平，不是平衡。
//   - 已知平衡债（近等级僵局、低使用率高费卡）属于数值/设计问题，
//     由 docs/balance/balance-baseline.md 记录并以预算形式纳入回归闸门：
//     预算一旦被突破（变差）才失败，修好不会失败。
//   - "必败墙"（敌我生命量级脱钩）曾是第 4 关的硬阻塞，现已通过等级归一化修复，
//     并以结构断言（8.5 节）防止回归。
//
// 用法：
//   node scripts/verify-balance-guardrails.mjs            # CI 小矩阵（默认 3 种子）
//   node scripts/verify-balance-guardrails.mjs --seeds=8  # 更细的自查
//   node scripts/verify-balance-guardrails.mjs --quick    # 2 种子，最快
//
// 大矩阵审计请用 scripts/simulate-balance.mjs。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createSimulator, makeGreedyPolicy, makeSandboxPolicy } from "./balance-sim.mjs";
import { HARNESS_ROOT } from "./balance-harness.mjs";

const args = Object.fromEntries(process.argv.slice(2).map(item => {
  const [key, value] = item.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const SEED_COUNT = args.quick ? 2 : Number(args.seeds) || 3;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => 1000 + index * 37);

// ── 回归预算（相对当前实测基线留出余量；只用来说明"变差才失败"）──
const ROUND_CAP = 45;              // 与模拟器默认一致
const STALEMATE_BUDGET = 0.25;     // 实测整体约 8%，25% 留足余量
const CHARACTER_SPREAD_BUDGET = 0.85; // 实测普通难度 20%→67%，跨度约 0.47
const DIFFICULTY_TOLERANCE = 0.05;    // 种子噪声容忍
const MIN_DRAWS_FOR_DEAD_CARD = 20;   // 低于该抽到次数不判"废卡"

const mean = values => {
  const list = values.filter(value => Number.isFinite(value));
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
};
const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

// ═══ 静态规则：从源码提取，禁止在测试里复制数值 ═══
const librarySource = await readFile(path.join(HARNESS_ROOT, "js", "fixed-card-library.js"), "utf8");
const costMultiplierMatch = librarySource.match(/const\s+COST_MULTIPLIER\s*=\s*(\{[^}]*\})/);
assert.ok(costMultiplierMatch, "必须能从 js/fixed-card-library.js 提取 COST_MULTIPLIER");
const COST_MULTIPLIER = vm.runInNewContext(`(${costMultiplierMatch[1]})`);

const simulator = await createSimulator();
const { rt } = simulator;
const campaignData = rt.campaignData;
const battleRules = rt.context.battleRules;
const campaignMode = simulator.campaignMode;
const campaignPolicy = makeGreedyPolicy(rt);
const sandboxPolicy = makeSandboxPolicy(rt);

// ── 1. 费用曲线：倍率必须随费用严格递增（同费收益不得倒挂）──
{
  const costs = Object.keys(COST_MULTIPLIER).map(Number).sort((a, b) => a - b);
  assert.deepEqual(costs, [2, 3, 4, 5, 6, 7, 8, 9, 10], "COST_MULTIPLIER 必须覆盖 2–10 全部费用");
  assert.equal(battleRules.MAX_CARD_COST, costs[costs.length - 1], "MAX_CARD_COST 必须等于最高费用档");
  for (let index = 1; index < costs.length; index += 1) {
    const previous = COST_MULTIPLIER[costs[index - 1]];
    const current = COST_MULTIPLIER[costs[index]];
    assert.ok(current > previous,
      `费用 ${costs[index]} 的倍率 ${current} 必须高于费用 ${costs[index - 1]} 的 ${previous}（同费收益倒挂）`);
  }
  // 高级卡门槛必须与高费用档一致：等级越高才能拿到越高费的卡。
  assert.match(librarySource, /const\s+maxHighCost\s*=/, "必须存在 maxHighCost 的等级门槛定义");
}

// ── 2. 能量曲线：单调不减、可被 maxEnergy 截断、扣减不为负 ──
{
  const curve = [1, 2, 3, 4, 5, 6, 7, 8].map(round => battleRules.roundEnergy(round, 10));
  assert.deepEqual(curve.slice(0, 4), [3, 5, 7, 9], "第 1–4 回合能量必须为 3/5/7/9");
  for (let index = 1; index < curve.length; index += 1) {
    assert.ok(curve[index] >= curve[index - 1], "能量曲线必须随回合单调不减");
    assert.ok(curve[index] <= 10, "能量不得超过 maxEnergy");
  }
  assert.equal(battleRules.roundEnergy(5, 10), 10, "第 5 回合必须达到 10 能量上限（8/9/10 费卡从此可用）");
  assert.ok(battleRules.roundEnergy(3, 10, 1) === 6, "冻结罚必须只扣 1 点能量");
  assert.ok(battleRules.roundEnergy(1, 10, 5) >= 1, "能量扣减后必须有下限，不得为 0 或负数");
}

// ═══ 运行小矩阵 ═══
const campaignBattles = [];
for (const character of campaignData.characters) {
  for (let stage = 1; stage <= campaignData.stages.length; stage += 1) {
    for (const difficulty of Object.keys(campaignData.difficulties)) {
      for (const seed of SEEDS) {
        let enemyMaxHp = null;
        const battle = await simulator.runCampaignBattle({
          characterId: character.id, stage, difficulty, seed, policy: campaignPolicy, maxRounds: ROUND_CAP,
          afterStart: state => { enemyMaxHp = state.enemy?.maxHp ?? null; },
        });
        battle.enemyMaxHp = enemyMaxHp;
        campaignBattles.push(battle);
      }
    }
  }
}

// 沙盒矩阵：同一批次也走结构断言（覆盖战役层之外的真实路径）。
const sandboxPairs = [
  ["human-lisaya", "elf-enbolu"],
  ["orc-moluo", "human-quick"],
  ["godkin-su", "ice-archon"],
];
const sandboxBattles = [];
for (const [player, enemy] of sandboxPairs) {
  for (const seed of SEEDS) {
    sandboxBattles.push(await simulator.runSandboxBattle({
      playerCharacterId: player, enemyCharacterId: enemy, seed, policy: sandboxPolicy, maxRounds: ROUND_CAP,
    }));
  }
}

// ── 3. 结构完整性：所有结果字段有限、无越界、无驱动死循环 ──
const allBattles = [...campaignBattles, ...sandboxBattles];
for (const battle of allBattles) {
  const label = `${battle.characterId}/${battle.stage ?? "-"}/${battle.difficulty ?? "-"}/seed${battle.seed}`;
  for (const field of ["rounds", "playerHp", "playerMaxHp", "playerHpRatio"]) {
    assert.ok(Number.isFinite(battle[field]), `${label}: ${field} 必须为有限数，实际 ${battle[field]}`);
  }
  assert.ok(battle.playerMaxHp > 0, `${label}: 玩家最大生命必须为正`);
  assert.ok(battle.playerHp >= 0 && battle.playerHp <= battle.playerMaxHp + 1e-6, `${label}: 玩家生命越界`);
  assert.ok(battle.rounds >= 1 && battle.rounds <= ROUND_CAP + 1, `${label}: 回合数异常 ${battle.rounds}`);
  assert.equal(battle.metrics.violations.length, 0,
    `${label}: 战斗结构违规 ${JSON.stringify(battle.metrics.violations.slice(0, 3))}`);
  assert.equal(battle.guardExhausted, false, `${label}: 驱动循环耗尽预算（疑似死循环）`);
  // 未分胜负的对局必须是因为"打到回合上限"，而不能是别的停滞原因。
  if (battle.timedOut) {
    assert.ok(battle.roundsReachedCap, `${label}: 未分胜负但并非因回合上限退出，存在非预期的停滞路径`);
  }
  for (const [name, value] of Object.entries(battle.stats || {})) {
    if (typeof value !== "number") continue;
    assert.ok(Number.isFinite(value), `${label}: 统计项 ${name} 非有限值 ${value}`);
  }
}

// ── 4. AI 不得无视"当回合本可打出的牌" ──
{
  const skipped = allBattles.reduce((sum, battle) => sum + (battle.metrics.affordableSkipped || 0), 0);
  const offenders = allBattles.filter(battle => (battle.metrics.affordableSkipped || 0) > 0).length;
  assert.equal(skipped, 0,
    `AI 在有能量且有可支付牌时放弃了出牌（${offenders} 场 / 共 ${skipped} 次）——估值或决策存在缺陷`);
}

// ── 5. 确定性：相同种子必须复现完全一致的结果 ──
{
  const probe = [
    { characterId: "lisaya", stage: 1, difficulty: "normal", seed: 1000 },
    { characterId: "su", stage: 3, difficulty: "hard", seed: 1074 },
    { characterId: "heka", stage: 2, difficulty: "easy", seed: 1037 },
  ];
  for (const item of probe) {
    const first = await simulator.runCampaignBattle({ ...item, policy: campaignPolicy, maxRounds: ROUND_CAP });
    const second = await simulator.runCampaignBattle({ ...item, policy: campaignPolicy, maxRounds: ROUND_CAP });
    const snapshot = battle => JSON.stringify({
      victory: battle.victory, rounds: battle.rounds, hp: battle.playerHp,
      grade: battle.grade, damage: battle.stats.damage, taken: battle.stats.damageTaken,
    });
    assert.equal(snapshot(first), snapshot(second),
      `${item.characterId}/第${item.stage}关/${item.difficulty}/seed${item.seed}: 同种子复现结果不一致`);
  }
}

// ── 6. 难度顺序：整体胜率必须易 ≥ 普通 ≥ 难（更难不得更容易）──
const byDifficulty = {};
for (const difficulty of Object.keys(campaignData.difficulties)) {
  const subset = campaignBattles.filter(battle => battle.difficulty === difficulty);
  byDifficulty[difficulty] = {
    battles: subset.length,
    winRate: mean(subset.map(battle => battle.victory ? 1 : 0)),
    roundsAvg: mean(subset.map(battle => battle.rounds)),
  };
}
assert.ok(byDifficulty.easy.winRate + DIFFICULTY_TOLERANCE >= byDifficulty.normal.winRate,
  `难度倒挂：简单 ${round(byDifficulty.easy.winRate)} 低于普通 ${round(byDifficulty.normal.winRate)}`);
assert.ok(byDifficulty.normal.winRate + DIFFICULTY_TOLERANCE >= byDifficulty.hard.winRate,
  `难度倒挂：普通 ${round(byDifficulty.normal.winRate)} 低于困难 ${round(byDifficulty.hard.winRate)}`);

// ── 7. 角色差异必须存在，但不能极端到"必赢/必输" ──
const byCharacterNormal = campaignData.characters.map(character => {
  const subset = campaignBattles.filter(battle => battle.characterId === character.id && battle.difficulty === "normal");
  return { id: character.id, name: character.name, winRate: mean(subset.map(battle => battle.victory ? 1 : 0)) };
});
{
  const rates = byCharacterNormal.map(item => item.winRate);
  const spread = Math.max(...rates) - Math.min(...rates);
  assert.ok(spread <= CHARACTER_SPREAD_BUDGET,
    `普通难度角色胜率跨度过大（${round(spread)}）：${byCharacterNormal.map(item => `${item.name}${round(item.winRate, 2)}`).join(" ")}`);
  assert.ok(rates.some(rate => rate > 0), "普通难度下必须有角色能获胜");
}

// ── 8. 僵局预算：无回合上限的真实对局里，"打不完"的比例必须受控 ──
const campaignTimeoutRate = mean(campaignBattles.map(battle => battle.timedOut ? 1 : 0));
assert.ok(campaignTimeoutRate <= STALEMATE_BUDGET,
  `僵局率 ${round(campaignTimeoutRate)} 超出预算 ${STALEMATE_BUDGET}——伤害无法在合理回合内终结对局`);

// ── 8.5 必败墙结构断言：敌我生命量级必须在同一数量级带内（第 1–4 关） ──
// 这是结构不变式而非平衡判据：修复前第 4 关敌/我生命比高达 718–2103×
// （levelHp 指数曲线 × 敌方绝对等级 94），62 级角色第 1 回合被秒——
// 属于"必经关完全无法过关"的硬阻塞。归一化后第 1–4 关比值 ≤ 1.1，
// 4× 的带宽足以容纳未来关卡设计，又能拦住量级级别的回归。
// 第 5 关明确豁免：STAGE5_BOSS_TUNING 围绕固定 Lv100 元祖龙神专项定标，
// Boss 恒为原始 Lv100，其可玩性由定版四因子保证，不适用本量级带宽。
{
  const WALL_RATIO_CAP = 4;
  const worst = campaignBattles.reduce((worst, battle) => {
    if (battle.stage >= 5) return worst; // 第 5 关定版豁免（固定 Lv100 首领）
    if (!Number.isFinite(battle.enemyMaxHp) || !(battle.enemyMaxHp > 0)) return worst;
    const ratio = battle.enemyMaxHp / battle.playerMaxHp;
    return ratio > worst.ratio ? { ratio, label: `${battle.characterId}/第${battle.stage}关/${battle.difficulty}` } : worst;
  }, { ratio: 0, label: "-" });
  assert.ok(worst.ratio > 0, "未采集到敌方最大生命，必败墙断言失效");
  assert.ok(worst.ratio <= WALL_RATIO_CAP,
    `必败墙回归：${worst.label} 敌/我生命比 ${worst.ratio.toFixed(2)}× 超过结构上限 ${WALL_RATIO_CAP}×（等级归一化被绕过？）`);
  globalThis.__worstWallRatio = worst;
}

// ── 9. 从未被使用的技能：区分"从未负担得起"（能量曲线问题）与"负担得起却不用"（估值缺陷）──
{
  const aggregate = new Map();
  for (const battle of campaignBattles) {
    battle.metrics.perCard.forEach((stat, name) => {
      const row = aggregate.get(name) || { name, drawn: 0, played: 0, skippedAffordable: 0, cost: stat.cost };
      row.drawn += stat.drawn;
      row.played += stat.played;
      row.skippedAffordable += stat.skippedAffordable;
      aggregate.set(name, row);
    });
  }
  const dead = [...aggregate.values()].filter(row => row.drawn >= MIN_DRAWS_FOR_DEAD_CARD && row.played === 0);
  // 结构性判据：抽到过且"当回合可支付"过却从未被打出 = 估值缺陷，必须为 0。
  const unplayableByValuation = dead.filter(row => row.skippedAffordable > 0);
  assert.equal(unplayableByValuation.length, 0,
    `以下卡可支付却从未被打出（估值缺陷）：${unplayableByValuation.map(row => `${row.name}(${row.played}/${row.drawn})`).join(" ")}`);
  // 其余"从未被使用"的卡属于能量曲线/对局长度问题，作为已知债报告，不做硬断言。
  globalThis.__deadCards = dead.map(row => `${row.name} 抽${row.drawn} 打${row.played} (${row.cost}费)`);
}

// ═══ 报告 ═══
console.log(`平衡护栏：${SEEDS.length} 种子 · 战役 ${campaignBattles.length} 场 · 沙盒 ${sandboxBattles.length} 场`);
console.log("\n难度顺序：");
for (const [difficulty, value] of Object.entries(byDifficulty)) {
  console.log(`  ${difficulty.padEnd(7)} 胜率 ${String(round(value.winRate, 3)).padEnd(6)} 平均回合 ${round(value.roundsAvg, 2)} (${value.battles} 场)`);
}
console.log("\n角色（普通难度）胜率：");
for (const item of byCharacterNormal) console.log(`  ${item.name.padEnd(14)} ${round(item.winRate, 3)}`);
console.log(`\n僵局率 ${round(campaignTimeoutRate, 3)}（预算 ${STALEMATE_BUDGET}）· 最长回合 ${Math.max(...campaignBattles.map(battle => battle.rounds))}`);
if (globalThis.__worstWallRatio) {
  console.log(`必败墙结构检查：最差敌/我生命比 ${globalThis.__worstWallRatio.ratio.toFixed(3)}×（${globalThis.__worstWallRatio.label}，上限 4×）`);
}
console.log(`\n胜负评价分布：${["S", "A", "B", "C"].map(grade => `${grade}${campaignBattles.filter(battle => battle.grade === grade).length}`).join(" ")}`);
if (globalThis.__deadCards?.length) {
  console.log(`\n已知债·从未被使用（抽到 ≥ ${MIN_DRAWS_FOR_DEAD_CARD} 且 0 打出，属能量曲线/对局长度问题）：`);
  globalThis.__deadCards.slice(0, 12).forEach(item => console.log(`  ${item}`));
}
console.log("\n平衡护栏通过：结构不变式、费用/能量曲线、确定性、难度顺序、AI 可出牌性均成立。");
