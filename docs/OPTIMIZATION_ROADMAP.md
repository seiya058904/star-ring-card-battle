# Star Ring Card Battle — 长期工程优化路线图

本文档跟踪多阶段工程计划。状态说明：

- TODO：尚未开始
- IN PROGRESS：正在进行
- BLOCKED：被外部条件阻塞
- COMPLETE：已完成并有验证记录

## Phase 0 — Engineering Baseline

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 架构地图 | COMPLETE | 见 `docs/ARCHITECTURE.md` |
| 基线验证编排 | COMPLETE | `scripts/verify-all.mjs` 聚合全部安全只读验证 |
| 修复既有验证脚本 | COMPLETE | `scripts/verify-fixed-card-library.mjs` 已适配 CRLF 行尾 |
| 高风险管理回归测试 | COMPLETE | `scripts/verify-battle-invariants.mjs` 已加入 |
| 运行时所有权自动校验 | COMPLETE | `scripts/verify-runtime-ownership.mjs` 已加入 |
| 初始 CI | COMPLETE | `.github/workflows/verify.yml` 已加入（不执行发布/签名） |
| 浏览器场景基线 | TODO | 需真实浏览器/WebView 手动或 E2E 记录 |

## Phase 1 — Regression Firewall

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 测试分类 | PARTIAL | 现有脚本按主题分类，`verify-all.mjs` 输出分类摘要 |
| 行为级覆盖 | COMPLETE | 现有特殊卡行为测试 + 新增战斗不变式测试均执行真实生产代码 |
| 战斗不变式 | COMPLETE | `verify-battle-invariants.mjs` 覆盖 HP/能量/护盾、实例 ID、牌堆守恒、手牌上限、游戏结束一次等 |
| 确定性战斗 replay fixtures | TODO | 当前有 seeded random 与夹具，但尚未建立正式 replay 文件格式 |

## Phase 2 — CI

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| GitHub Actions 验证 | COMPLETE | `.github/workflows/verify.yml` 运行语法检查、`verify-all.mjs`、`git diff --check` |
| Android 构建 job | TODO | 环境具备时再增加，避免阻塞普通 Web 变更 |

## Phase 3 — Combat Monkey-Patch Ambiguity

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 显式 battle-engine contract | PARTIAL | `docs/ARCHITECTURE.md` 已定义操作面；代码层尚未形成显式 API 对象 |
| 消除 applyCard 多层包装 | COMPLETE | Milestone 2 已把 `campaign-ui.js` 的 4 层 `applyCard` 包装收敛为单一边界 + 显式 handlers |
| 消除 playCard 多层包装 | COMPLETE | Milestone 3 已把 2 层 `playCard` 包装收敛为单一边界 + 显式 handlers |
| 消除 endTurn/beginTurn 多层包装 | COMPLETE | Milestone 4 已把 `endTurn` 2 层包装收敛为单一边界，并把 `beginTurn` 单层包装显式化 |
| 消除 AI takeTurn 多层包装 | COMPLETE | Milestone 5 已把 `aiController.takeTurn` 2 层包装收敛为单个 AI 编排边界 |
| 消除 tickStatuses/draw 匿名包装 | COMPLETE | Milestone 6 已将剩余两个单层匿名包装显式化 |
| 消除 load-order 替换（其余方法） | COMPLETE | 核心战斗生命周期方法均已有显式单一边界 |
| Runtime Ownership Stabilization | COMPLETE | 满足 exit gate，见当前里程碑 |
| 规则与表现分离 | TODO | 需事件模型支持 |

## Phase 3A — Campaign Responsibility Separation

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 提取 campaign-rules 模块 | COMPLETE | Milestone 7 已把纯领域规则移入 `js/campaign-rules.js` |
| 提取 runtime integration 模块 | COMPLETE | Milestone 8 已把引擎绑定移入 `js/campaign-runtime.js` |
| 提取 AI orchestration 模块 | COMPLETE | Milestone 8 已把 AI 编排随 runtime 一起移入 `js/campaign-runtime.js` |
| UI/控制器/运行时完全分离 | PARTIAL | `campaign-ui.js` 仍含战役导航/控制器流程与 UI；已不再拥有核心引擎赋值 |

## Phase 3B — Visual Runtime Stabilization

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| Renderer Ownership Audit | COMPLETE | Milestone 9 已完成渲染器覆写普查、效果/action-lock/CSS/热点文档与机器校验 |
| renderCard ownership | STABLE | Milestone 10 已收敛为单一权威实现，无后续覆写 |
| effectsRenderer.play ownership | STABLE | Milestone 11 已收敛为单一公共入口 + `playStandardBattleEffect` helper |
| visual action-lock ownership | STABLE | Milestone 11 已文档化 `_playLock` / `actionLocked` / AI wait 关系；Milestone 12 已关闭跨战斗锁生命周期 |
| renderFighter ownership | STABLE | Milestone 13 已收敛为单一权威实现，无后续覆写 |
| uiRenderer.render ownership | STABLE | Milestone 14 已收敛为单一公共入口 + `renderBattleSurface` 基础方法 |
| renderCardPreview ownership | STABLE | Milestone 15 已收敛为单一公共入口 + `renderBaseCardPreview` 基础方法 |
| renderDuelUnit ownership | STABLE | Milestone 16 已合并历史 ai-dialogue 包装为单一对象方法 |
| renderOpponentHand ownership | STABLE | 当前为有意兼容 no-op，敌方手牌由 renderFighter 展示 |
| renderDeckManager ownership | STABLE | 单一有效最终实现，无 wrapper 歧义 |
| Visual Runtime Stabilization | COMPLETE | 满足 exit gate，见当前里程碑 |
| Visual runtime extraction | TODO | 后续可将视觉运行时从 `index.html` 物理抽取 |
| CSS layering cleanup | TODO | 尚未开始 |

## Phase 3C — CSS Architecture Stabilization

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| CSS Ownership Audit | COMPLETE | Milestone 17 已建立 CSS source map、layer map、metrics、critical ownership matrix、responsive map、z-index/animations 文档与机器校验 |
| battle-layout CSS ownership | STABLE | Milestone 18 已移除旧非媒体 battle-layout 覆写，保留权威基础与响应式覆盖 |
| card CSS ownership | STABLE | Milestone 19 已移除 block0 中 5 个被证明 superseded 的 hand-dock card 旧规则 |
| fighter HUD CSS ownership | STABLE | Milestone 20 已移除 block0 中 12 个被证明 superseded 的 battle-hud fighter 旧规则 |
| Preview CSS ownership | STABLE | Milestone 21 已移除 block0 中被禁用 的 card-preview-panel::before 旧规则 |
| Campaign HUD CSS ownership | STABLE | Milestone 22 已确认 Campaign HUD 为 final block 单一权威层，无历史 superseded 规则需移除 |
| Component CSS Ownership Stabilization | COMPLETE | Milestone 22 通过 component exit gate |
| CSS override consolidation（其余） | TODO | 组件级已收敛；剩余为响应式/媒体查询架构 |
| CSS cleanup / deletion | TODO | 尚未开始 |
| Responsive/Media-Query Ownership Audit | COMPLETE | Milestone 23 已建立媒体查询清单、断点频率、重复条件、组件×断点矩阵、边界证据与 Android 路径 |
| Responsive/Android viewport stabilization | TODO | 尚未开始 |

## Phase 3D — Responsive CSS Architecture Stabilization

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| Responsive / Media-Query Ownership Audit | COMPLETE | Milestone 23 已完成 |
| Consolidate duplicate max-width regions | TODO | 尚未开始 |
| Consolidate responsive component ownership | TODO | 尚未开始 |
| Android viewport strategy | TODO | 尚未开始 |

## Phase 4 — Formal Battle Event Model

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 轻量事件列表 | TODO | 尚未开始 |
| 日志/浮动伤害/音效/统计从事件派生 | TODO | 尚未开始 |

## Phase 5 — Modularize `index.html`

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 纯常量/工具抽取 | TODO | 尚未开始 |
| 游戏数据抽取 | TODO | 尚未开始 |
| Battle engine 抽取 | TODO | 需先完成 Phase 3/4 |
| AI/渲染/特效抽取 | TODO | 尚未开始 |

## Phase 6 — CSS Sediment

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| CSS 考古与分文件 | TODO | 尚未开始 |

## Phase 7 — State/Data Contracts

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| JSDoc typedefs | TODO | 尚未开始 |
| helper constructors/normalizers | TODO | 尚未开始 |

## Phase 8 — ID-Driven Card Semantics

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 特殊卡语义表 | PARTIAL | `fixed-card-library.js` 已有 `SPECIAL_CARD_RULES`，但战斗执行仍部分按名字正则 |
| 消除名称正则依赖 | TODO | 尚未开始 |

## Phase 9 — Persistence Versioning/Migration

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 正式存储层 | TODO | 尚未开始 |
| 导入/导出/重置 | TODO | 尚未开始 |

## Phase 10 — Campaign Architecture Expansion

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 数据驱动 stage 字段 | PARTIAL | `campaign-data.js` 已有基础字段，但 UI 仍有 encounter-specific 假设 |
| 多阶段 Boss/路线扩展 | TODO | 尚未开始 |

## Phase 11 — Enemy AI

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| AI 决策分步 | PARTIAL | `campaign-mode.js` 有 `intentFor`/`aiCardScore`，但非战役 AI 仍是旧估值 |
| 确定性 AI 测试 | PARTIAL | 现有测试覆盖部分战役 AI；正式 AI 场景表尚未建立 |

## Phase 12 — Balance Simulation Harness

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 无头模拟器 | TODO | 尚未开始 |
| 平衡护栏 | TODO | 尚未开始 |

## Phase 13 — Responsive UI

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 布局模式与断点 | TODO | 尚未开始 |
| 移除 Android 1920 模拟 viewport | BLOCKED | 需要先完成响应式 UI 验证 |

## Phase 14 — Accessibility

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 键盘/焦点/ARIA/触控/reduced-motion | TODO | 尚未开始 |

## Phase 15 — DOM Churn

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 性能基线/profile | TODO | 尚未开始 |
| 定向更新函数 | TODO | 尚未开始 |

## Phase 16 — Asset Pipeline

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 资产分类与 manifest | TODO | 尚未开始 |
| 打包排除/优化 | TODO | 尚未开始 |

## Phase 17 — Android WebView Cleanup

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 生命周期/全屏/返回/设置审查 | TODO | 尚未开始 |

## Phase 18 — Generated Android Mirror Strategy

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 当前策略（提交镜像 + parity 校验） | COMPLETE | `sync-android-web-assets.mjs` + `verify-android-web-assets.mjs` |
| Option B 评估 | TODO | 暂不切换 |

## Phase 19 — Security/Untrusted Data Audit

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| DOM sink 审计 | TODO | 尚未开始 |
| CSP 评估 | TODO | 尚未开始 |

## Phase 20 — Startup/Performance

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| profile/分类预载 | TODO | 尚未开始 |

## Phase 21 — Documentation Cleanup

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 架构文档 | COMPLETE | `docs/ARCHITECTURE.md` |
| 优化路线图 | COMPLETE | 本文档 |
| README/CHANGELOG/Android 版本一致性 | TODO | 尚未开始 |

## Phase 22 — License/Asset Provenance

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| License 决策 note | TODO | 尚未开始 |

## Phase 23 — Release Engineering

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| Release checklist/版本一致性 | TODO | 尚未开始 |

## Phase 24 — Product Polish

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 内容扩展 | TODO | 需在架构稳定后开始 |

## 当前执行里程碑：Milestone 23 — Responsive / Media-Query Ownership Audit

目标：建立响应式 cascade 的精确所有权模型，包括媒体查询清单、断点频率、重复条件、组件参与、边界行为与 Android 适用性；不进行任何媒体查询合并。

完成项：

1. 新增 `scripts/audit-responsive-ownership.mjs` 诊断工具，输出 20 个媒体查询区域、断点频率、重复条件、`!important` 密度与组件参与。
2. 新增 `scripts/verify-responsive-ownership.mjs` 稳定校验，保护媒体查询总数区间、已知重复断点、关键组件响应式覆盖。
3. `verify-all.mjs` 已加入 responsive 所有权验证。
4. 在 `docs/ARCHITECTURE.md` 新增 Responsive / Media-Query Ownership 章节。
5. 完成桌面/小视口与 1600/1366/980 边界浏览器采样。

验证记录：

- `node scripts/verify-all.mjs` 全部通过（31/31）。
- `node scripts/audit-css-ownership.mjs` 运行通过。
- `node scripts/audit-responsive-ownership.mjs` 运行通过。
- `git diff --check` 通过。
- 浏览器边界采样：1600/1366 处存在预期断点变化；980 处无高价值组件异常跳变。
- 未修改任何响应式 CSS 或视觉行为。

### Responsive architecture verdict

```text
Responsive Architecture Understandable Enough To Begin Evidence-Based Consolidation: YES
```

已知主要风险：

- 重复 `max-width:1600 / 1366 / 980` 区域。
- 组件响应式所有权跨 block 0 与 final block。
- Android forced 1920 viewport 主要走 `>1600px` 桌面路径。

---

## Final Closeout — Optimization Campaign Complete

### Completed phases

```text
Runtime Ownership Stabilization: COMPLETE
Visual Runtime Stabilization: COMPLETE
CSS Ownership Audit: COMPLETE
Component CSS Ownership Stabilization: COMPLETE
Responsive / Media-Query Ownership Audit: COMPLETE
Responsive architecture: AUDITED / STABLE ENOUGH
Residual cleanup: DEFERRED
```

### Why cleanup stops here

> Remaining CSS duplication is now understood and machine-audited. No current regression or ownership ambiguity justifies continued cleanup in this optimization campaign. Further consolidation should be demand-driven by real maintenance needs, feature work, or observed bugs.

### Deferred technical debt

- Responsive CSS:
  - duplicate `max-width:1600` regions
  - duplicate `max-width:1366` regions
  - fragmented hand-dock responsive ownership
  - fragmented Preview responsive ownership
  - block 0 / final-block responsive layering
- Component residual CSS:
  - card tier/art/orbit details
  - Fighter status/mechanic details
  - Preview tier/art/long-content details
- Global CSS baseline (debt, not correctness blocker):
  - CSS lines: ~9022
  - `!important` declarations: 3652
  - media-query regions: 20

### Optional future backlog

```text
DEFERRED / NOT REQUIRED FOR CURRENT CLOSEOUT
1. duplicate max-width:1600 regions
2. duplicate max-width:1366 regions
3. hand-dock responsive chain
4. Preview responsive chain
5. remaining component sub-family debt
```

These are intentionally not implemented in this campaign.
