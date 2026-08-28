# Star Ring Card Battle — Runtime Architecture Map

本文档是当前可执行架构的事实地图，服务于“未来修改战斗系统时，可以证明没有静默丢失机制”的目标。

> 规则：不把行号当作永久标识；本文档记录函数/模块级归属。仓库代码与 Git 状态是唯一事实来源，本文档落后于代码时应以代码为准并更新本文档。

## 1. 权威入口与加载顺序

根目录 `index.html` 是 Web 与 Android 共用权威入口。页面末尾按以下顺序加载 `js/` 外部脚本：

1. `js/battle-rules.js` — 通用常量、能量公式。
2. `js/fixed-card-library.js` — 固定角色/固定卡组定义与运行时卡牌构造。
3. `js/campaign-data.js` — 战役角色、关卡、难度数据。
4. `js/campaign-mode.js` — 战役进度、评分、意图、共鸣、AI 估值等纯逻辑。
5. `js/campaign-rules.js` — 战役领域规则：被动计数、回合被动重置、敌方意图刷新、元素克制记录、回合结束前共鸣到期等。
6. `js/audio-manager.js` — Web Audio 音效引擎与回退。
7. `js/fixed-game-rules.js` — **最终战斗规则覆写层**，核心战斗方法的主实现。
8. `js/campaign-runtime.js` — 战役战斗运行时集成与 AI 编排；安装 `gameEngine.*` / `aiController.*` 战役边界，通过 presentation adapter 请求 UI。
9. `js/campaign-ui.js` — 战役 UI、战役导航/控制器流程；配置 presentation adapter 并调用 `campaignRuntime.install()`。

`android/app/src/main/assets/www/` 是由 `scripts/sync-android-web-assets.mjs` 生成的镜像，不是独立事实来源，禁止手改。

### 1.1 战役模块职责边界

| 模块 | 拥有 | 不应拥有 |
| --- | --- | --- |
| `campaign-data.js` | 战役角色、关卡、难度等静态数据 | 运行时状态、UI |
| `campaign-mode.js` | 战役进度、评分、意图、共鸣、AI 估值等纯逻辑 | DOM、音频、运行时绑定 |
| `campaign-rules.js` | 战役领域规则：被动计数、回合被动重置、敌方意图刷新、元素克制记录、回合结束前共鸣到期 | DOM、事件、渲染、运行时方法赋值 |
| `campaign-runtime.js` | 战役战斗运行时集成：`gameEngine.*` / `aiController.*` 边界、AI 编排、战斗生命周期适配 | DOM、事件监听、modal、HTML |
| `campaign-ui.js` | 战役 UI、战役导航/控制器流程、presentation adapter 配置 | 不应再定义核心引擎集成赋值 |

依赖方向：

```text
campaign-data / campaign-mode
          ↓
campaign-rules
          ↓
campaign-runtime
          ↓
campaign-ui
```

## 2. 应用启动流程

1. 浏览器解析 `index.html` 内联 CSS 与 HTML。
2. 内联主脚本定义数据常量、工具函数、`cardGenerator`、`deckBuilder`、`storageManager`、初始 `gameEngine`、初始 `aiController`、`effectsRenderer`、`uiRenderer`。
3. 内联主脚本后半段通过多个“保存旧实现并重新赋值”的补丁完成战斗 UI/规则演进；最终在 `globalThis` 暴露核心对象。
4. `effectsRenderer.init()`、`uiRenderer.init()` 被调用，完成初始渲染。
5. 外部脚本按上述顺序加载并继续覆写/包装。
6. 用户从首页进入战斗准备或战役模式；`uiRenderer.startBattle()` 或 `campaign-ui.js` 的 `startCampaign()` 最终调用 `gameEngine.start()`。

## 3. 屏幕导航

- `uiRenderer.nav(name)` 是导航总入口。
- 最终实现链：`campaign-ui.js` 的 `uiRenderer.nav` → `index.html` 内联最终 `uiRenderer.nav` → 早期 `uiRenderer.nav`。
- `index.html` 内联最终 `nav` 会把 `setup` 重定向到战斗准备、把 `custom` 重定向到 `deck`，然后显示对应 `screen-*` 节点。
- 战斗模式通过 `body.battle-mode` 切换视觉；退出战斗时 `effectsRenderer.stop()`。
- 战役首页通过 `campaign-ui.js` 的 `renderCampaignHome()` 打开模态框，不新增 screen。

## 4. 战斗生命周期与状态所有权

### 4.1 战斗状态所有权

- `gameEngine.state` 是战斗状态的唯一运行时容器。
- 战斗状态字段由 `gameEngine.start()` 创建，包含 `player`、`enemy`、`round`、`turn`、`log`、`actions`、`combatStats`、`gameOver`、`winner`、`resultPending` 等。
- 战役状态由 `campaign-ui.js` 在 `startCampaign()` 中挂到 `state.campaign`；战役统计挂在 `state.campaignStats`。
- `gameEngine.sessionId` 用于区分“同一 state 对象是否仍属于当前战斗”。

### 4.2 战斗启动

- `gameEngine.start(playerDeck, enemyDeck)` 最终实现位于 `index.html` 内联主脚本（后期覆写版）。
- `start()` 创建双方 fighter、调用 `beginTurn("player")`、给敌方抽 5 张、保证敌方开局可出牌、记录战斗日志、播放音效。
- `fixed-game-rules.js` 与 `campaign-ui.js` 不替换 `start()`；它们通过替换 `makeFighter`/`beginTurn`/`draw` 等改变启动行为。

### 4.3 Fighter 创建

- 最终实现链：`fixed-game-rules.js` 的 `gameEngine.makeFighter` → `index.html` 内联最终 `gameEngine.makeFighter` → `index.html` 内联原始 `gameEngine.makeFighter`。
- `fixed-game-rules.js` 负责规范化种族/职业、应用 `maxHpMultiplier`、初始化 `exhaustPile` 与 `controlImmuneTurns`。
- `index.html` 内联最终版负责角色名/称号、元素、种族天赋、`turnFlags`、`summons` 等运行时字段。

### 4.4 回合开始

- 最终实现链：`campaign-ui.js` 的单个 `gameEngine.beginTurn` 战役边界 → `fixed-game-rules.js` 的 `gameEngine.beginTurn`。
- `fixed-game-rules.js` 负责冻结减能量、抽牌压制、`tickStatuses`、手牌补到 5、日志。
- `campaign-ui.js` 通过显式函数扩展：
  - `resetCampaignTurnPassives`
  - `applyCampaignPlayerExtraEnergy`
  - `refreshCampaignEnemyIntent`

### 4.5 抽牌

- 最终实现链：`campaign-ui.js` 的单个 `gameEngine.draw` 战役边界 → `fixed-game-rules.js` 的 `gameEngine.draw`。
- `fixed-game-rules.js` 负责牌库/弃牌堆洗回、手牌上限、`exhaustPile` 不回流。
- `campaign-ui.js` 通过 `playCampaignDrawSound` 在“实际抽到牌”后播放抽牌音效。

### 4.6 出牌验证与打出

- 最终执行路径：
  1. `campaign-ui.js` 的单个 `gameEngine.playCard` 战役集成边界。
  2. 战役边界先查找手牌实例，再调用 `fixed-game-rules.js` 的 `gameEngine.playCard` 权威出牌事务。
  3. 底层成功返回后：
     - `recordCampaignCardPlay`：增加星环格、消费星耀减费、刷新战役 HUD。
     - `recordElementMatchup`：记录玩家元素克制统计。
- `fixed-game-rules.js` 是最终权威实现：验证当前回合、`skipAction`、`actionLocked`、手牌存在、费用足够；扣能量、移出手牌、放入弃牌/消耗堆、调用 `applyCard`、触发渲染与延迟解锁。
- 有效费用仍由 `fixed-game-rules.js` 内部调用 `effectiveCardCost()` 读取；战役减费不修改 `card.cost`。
- `resolveAction()` 仍是 `index.html` 原始实现，仅作为动作分发入口；它调用最终 `playCard`/`endTurn`。

### 4.7 卡牌效果结算

- 最终执行路径：
  1. `campaign-ui.js` 的单个 `gameEngine.applyCard` 战役集成边界。
  2. 战役边界先执行 `campaignPlayerPassiveBefore`（仅玩家卡）。
  3. 调用 `fixed-game-rules.js` 的 `gameEngine.applyCard` 权威解析器。
  4. 解析完成后按固定顺序执行：
     - `campaignPlayerPassiveAfter`（仅玩家卡）
     - `campaignBossAndEnemyPassiveAfter`
     - `campaignHealthThresholdAfter`
     - `campaignPassiveNoticeAfter`
- 非战役（沙盒）状态直接调用 `fixed-game-rules.js` 的 `baseApplyCard`，不进入任何战役处理器。
- `fixed-game-rules.js` 是效果结算的权威实现：遍历 `card.effects`，处理伤害、治疗、护盾、抽牌、能量、状态、增益/减益、净化、复活、召唤等。
- `fixed-game-rules.js` 不依赖 DOM 决定战斗结果；但它会调用 `effectsRenderer?.play()` 与 `uiRenderer.showAiDialogue()` 作为表现层副作用。

### 4.8 伤害结算

- `fixed-game-rules.js` 的 `gameEngine.resolveDamage` 是唯一权威伤害结算器。
- 它处理减伤/灵巧防御、元素倍率、护盾、真实/穿透、处决、召唤物分摊、复活、战斗统计。
- `shareOwnerDamageWithSummon` 来自 `index.html`，负责把伤害按比例分摊给召唤物。

### 4.9 状态应用与状态跳动

- `gameEngine.applyStatus` 最终实现位于 `fixed-game-rules.js`。
- `gameEngine.tickStatuses` 最终实现链：`campaign-ui.js` 的单个 `gameEngine.tickStatuses` 战役边界 → `fixed-game-rules.js` 的 `gameEngine.tickStatuses`。
- `fixed-game-rules.js` 负责 DoT 伤害、禁锢跳过行动、状态回合递减、控制抗性。
- `campaign-ui.js` 通过显式函数扩展：
  - `processCampaignStatusTickPassive`：赫卡莫斯被动吸血。
  - `processCampaignPostStatusTick`：战役生命阈值/Boss 阶段。

### 4.10 召唤物生命周期

- 召唤物创建：`fixed-game-rules.js` 的 `applyCard` 中 `effect.type === "summon"` 分支调用 `upsertSummonEntity`（来自 `index.html`）。
- 召唤物分摊：`index.html` 的 `shareOwnerDamageWithSummon` + `fixed-game-rules.js` 的 `resolveDamage`。
- 召唤物协击：
  - 沙盒/通用最终路径：`fixed-game-rules.js` 的 `endTurn` 调用 `resolveSummonAssist`。
  - `index.html` 内联还有 `processSummonsAtTurnEnd`，在历史/包装路径中可能参与；当前最终 `endTurn` 是 `fixed-game-rules.js` 版本，但该版本调用 `resolveSummonAssist` 而不是 `processSummonsAtTurnEnd`。
- 召唤物显示：`uiRenderer.renderSummons` 最终位于 `index.html` 内联。

### 4.11 结束回合

- 最终实现链：`campaign-ui.js` 的单个 `gameEngine.endTurn` 战役边界 → `fixed-game-rules.js` 的 `gameEngine.endTurn`。
- `fixed-game-rules.js` 负责召唤协击、回合切换、下一回合 `beginTurn`、AI 触发。
- `campaign-ui.js` 通过显式函数扩展：
  - `beforeCampaignTurnEnd`：base 前执行共鸣到期、敌方意图清空。
  - `afterCampaignTurnEnd`：base 后执行共鸣冷却重置、HUD 刷新。

### 4.12 AI 回合

- `aiController.takeTurn` 最终是 `campaign-ui.js` 的单个 AI 编排边界。
- 单一边界内部显式分为：
  - `runSandboxAiTurn`：非战役通用异步 AI 循环。
  - `runCampaignAiTurn`：战役 AI 循环（意图、敌方共鸣、行动上限）。
  - `chooseCampaignAiCard`：战役卡牌选择与意图刷新。
- `aiController.chooseCard` 最终实现链：`campaign-ui.js` 的 `aiController.chooseCard` → `fixed-game-rules.js` 的 `aiController.chooseCard`。
- 战役 AI 使用 `campaignMode.aiCardScore` 与敌方意图；非战役 AI 使用 `fixed-game-rules.js` 的估值。
- AI 执行卡牌仍然通过 `gameEngine.playCard`，不创建独立的 AI 出牌路径。

### 4.13 游戏结束

- `gameEngine.checkGameOver` 最终实现位于 `index.html` 内联原始/后期版本，未被外部替换。
- 它保证只结算一次：通过 `state.resultPending`/`state.gameOver` 短路，并在视觉挂起时推迟结算。
- 沙盒结算：`uiRenderer.showResult` 最终由 `fixed-game-rules.js` 覆写，非战役时转调 `index.html` 内联 `legacyShowResult`。
- 战役结算：`fixed-game-rules.js` 的 `uiRenderer.showResult` 负责评分、进度保存、结果页渲染；`campaign-ui.js` 的 `campaignResultActions` 负责结果页按钮。

## 5. 持久化所有权

- `storageManager` 定义在 `index.html`，负责自定义卡牌、当前卡组、设置。
- `fixed-game-rules.js` 会禁用自定义卡牌路径（固定卡组模式）。
- 战役进度由 `js/campaign-mode.js` 提供纯函数，`campaign-ui.js` 持有 `localStorage` 读写封装。
- 存储键：`star-ring-custom-cards-v1`、`star-ring-current-deck-v1`、`star-ring-settings-v1`、`star-ring-campaign-progress-v1`。
- 当前战役进度有 `version: 1` 与 `normalizeProgress` 容错，但没有正式迁移/导入导出层。

## 6. 渲染所有权

- `uiRenderer` 与全局 `renderCard`/`renderCardPreview`/`renderFighter` 是渲染层。
- 最终渲染入口：`campaign-ui.js` 的 `uiRenderer.render` → `index.html` 内联 `renderBattleSurface`。
- 手牌卡 DOM 由 `index.html` 内联最终 `renderCard` 生成。
- 卡牌预览由 `index.html` 内联 `renderBaseCardPreview` 生成，`campaign-ui.js` 公共 `renderCardPreview` 传入战役有效费用。
- 战斗粒子/特效由 `effectsRenderer` 承担；`fixed-game-rules.js` 通过 `effectsRenderer?.play()` 触发。
- 动画与音效是表现层，不决定战斗真相。

## 7. 资产与 Android 同步

- `assets/` 是 Web 运行时资产根目录。
- `ASSETS` 路径注册表在 `index.html`。
- Android 镜像同步脚本：`scripts/sync-android-web-assets.mjs`，它复制根 `index.html`、`assets/`、`js/`、根图标到 `android/app/src/main/assets/www/`，并把 viewport 替换为 Android 专用 1920 桌面横屏。
- 校验脚本：`scripts/verify-android-web-assets.mjs`。

## 8. 重要 gameEngine 方法最终归属表

| 操作 | 最终权威实现 | 包装/覆写链（外→内） |
| --- | --- | --- |
| `createBattle/start` | `index.html` 内联最终 `gameEngine.start` | `start()` 本身无外部包装；受 `makeFighter`/`beginTurn`/`draw` 影响 |
| `makeFighter` | `fixed-game-rules.js` | campaign 无包装；`fixed-game-rules.js` → `index.html` 内联最终 → 原始 |
| `beginTurn` | `fixed-game-rules.js` | `campaign-ui.js` 单个战役边界 → 显式 handlers → `fixed-game-rules.js` |
| `drawCards/draw` | `fixed-game-rules.js` | `campaign-ui.js` 单个战役边界 → `playCampaignDrawSound` → `fixed-game-rules.js` |
| `canPlayCard`（验证） | `fixed-game-rules.js` `playCard` 内联 | 无独立方法；最终 `playCard` 链见下 |
| `playCard` | `fixed-game-rules.js` | `campaign-ui.js` 单个战役集成边界 → 显式 handlers → `fixed-game-rules.js` |
| `resolveCard/applyCard` | `fixed-game-rules.js` | `campaign-ui.js` 单个战役集成边界 → 显式 handlers → `fixed-game-rules.js` |
| `resolveEffect` | `fixed-game-rules.js` `applyCard` 内效果循环 | 同上 |
| `resolveDamage` | `fixed-game-rules.js` | 无外部包装 |
| `applyStatus` | `fixed-game-rules.js` | 无外部包装 |
| `tickStatuses` | `fixed-game-rules.js` | `campaign-ui.js` 单个战役边界 → 显式 handlers → `fixed-game-rules.js` |
| `resolveSummons` | `fixed-game-rules.js` `endTurn`/`resolveSummonAssist`；`index.html` 的 `upsertSummonEntity`/`shareOwnerDamageWithSummon` | `endTurn` 链见下 |
| `endTurn` | `fixed-game-rules.js` | `campaign-ui.js` 单个战役边界 → 显式 handlers → `fixed-game-rules.js` |
| `runAiTurn/takeTurn` | `campaign-ui.js` 单个 AI 编排边界 | `runSandboxAiTurn` / `runCampaignAiTurn` / `chooseCampaignAiCard` → `gameEngine.playCard` |
| `chooseCard` | `campaign-ui.js`/`fixed-game-rules.js` | `campaign-ui.js` → `fixed-game-rules.js` |
| `checkGameOver` | `index.html` 内联 `gameEngine.checkGameOver` | 无外部包装 |
| `settleBattle/showResult` | `fixed-game-rules.js` `uiRenderer.showResult` | `fixed-game-rules.js` → `index.html` 内联 `legacyShowResult`；`campaign-ui.js` 只挂结果按钮 |

## 9. 覆写/包装链库存

### 9.1 `gameEngine` 方法

| 方法 | `index.html` 原始 | `index.html` 内联覆写 | `fixed-game-rules.js` | `campaign-ui.js` |
| --- | --- | --- | --- | --- |
| `makeFighter` | ✅ 原始 | ✅ 覆写 | ✅ 包装原始 | — |
| `start` | ✅ 原始 | ✅ 覆写 | — | — |
| `beginTurn` | ✅ 原始 | ✅ 覆写 | ✅ 替换 | ✅ 单一边界 + 显式 handlers |
| `draw` | ✅ 原始 | — | ✅ 替换 | ✅ 单一边界 + 显式 handler |
| `playCard` | ✅ 原始 | — | ✅ 替换 | ✅ 单一边界 + 显式 handlers |
| `applyCard` | ✅ 原始 | ✅ 覆写 | ✅ 替换 | ✅ 单一边界 + 显式 handlers |
| `statusMultiplier` | ✅ 原始 | ✅ 覆写 | ✅ 替换 | — |
| `tickStatuses` | ✅ 原始 | ✅ 覆写 | ✅ 替换 | ✅ 单一边界 + 显式 handlers |
| `endTurn` | ✅ 原始 | ✅ 包装原始 | ✅ 替换 | ✅ 单一边界 + 显式 handlers |
| `resolveDamage` | — | — | ✅ 新增/替换 | — |
| `applyStatus` | — | — | ✅ 新增 | — |
| `resolveAction` | ✅ 原始 | — | — | — |
| `checkGameOver` | ✅ 原始 | ✅ 增强 | — | — |
| `isActiveBattle` | ✅ 原始 | — | — | — |
| `invalidateBattle` | ✅ 原始 | — | — | — |

### 9.2 `uiRenderer` / 渲染全局

- `uiRenderer.render`：`campaign-ui.js` 公共入口，调用 `index.html` 内联 `renderBattleSurface`。
- `uiRenderer.nav`：`campaign-ui.js` 包装 `index.html` 内联最终。
- `uiRenderer.startBattle`：`campaign-ui.js` 包装 `fixed-game-rules.js` 替换版。
- `uiRenderer.openBattlePrep`：`fixed-game-rules.js` 替换 `index.html` 内联版。
- `uiRenderer.showResult`：`fixed-game-rules.js` 替换 `index.html` 内联版。
- `renderCard`：最终是 `index.html` 内联最终版，外部不替换。
- `renderCardPreview`：`campaign-ui.js` 公共入口，调用 `index.html` 内联 `renderBaseCardPreview`。
- `renderFighter`：最终是 `index.html` 内联最终版，外部不替换。
- `effectsRenderer.play`：最终是 `index.html` 内联最终版，外部不替换。

### 9.3 `aiController`

- `takeTurn`：`campaign-ui.js` 单个 AI 编排边界，包含 `runSandboxAiTurn` / `runCampaignAiTurn` / `chooseCampaignAiCard`。
- `chooseCard`：`campaign-ui.js` 包装 `fixed-game-rules.js` 替换版。

### 9.4 Milestone 2 前 `campaign-ui.js` 的 `applyCard` 四层包装特征

当前（Milestone 2 重构前）`campaign-ui.js` 从内到外为：

1. `originalApplyCard` — 玩家战役被动（外层记作 A，内层第 1 个）
2. `passiveStatusApply` — Boss 阶段 + 苏免疫敌方负面（第 2 个）
3. `thresholdApply` — 生命阈值 + Boss 阶段（第 3 个）
4. `passiveNoticeApply` — 被动提示（第 4 个，最外层）

实际执行顺序（外 → 内 → 外）：

```text
passiveNoticeApply
  → thresholdApply
    → passiveStatusApply
      → originalApplyCard
        → fixed-game-rules.applyCard
      ← originalApplyCard 后置
    ← passiveStatusApply 后置
  ← thresholdApply 后置
← passiveNoticeApply 后置
```

| 维度 | A: originalApplyCard | B: passiveStatusApply | C: thresholdApply | D: passiveNoticeApply |
| --- | --- | --- | --- | --- |
| 安装位置 | `campaign-ui.js` 第 1 个 `gameEngine.applyCard` | 第 2 个 | 第 3 个 | 第 4 个 |
| 捕获前实现 | `fixed-game-rules.applyCard` | A 包装后 | B 包装后 | C 包装后 |
| 输入 | `actor, target, card` | 同左 | 同左 | 同左 |
| base 前变更 | 玩家被动倍率/能量、`passives` 初始化 | `beforeStatuses` 快照 | `targetHp` 快照 | 无 |
| base 后变更 | 玩家被动：罗林福盾击、艾露希娅抽牌、丽莎娅阈值、苏自我净化 | Boss 阶段、苏免疫敌方负面 | 丽莎娅阈值、Boss 阶段 | 被动提示 |
| 读取 campaign | `characterId`, `passives`, `campaignStats` | `stage`, `characterId`, `passives`, `campaignStats`, `bossPhaseTriggered` | 同左 | `characterId`, `passives`, `passiveNoticeRound` |
| 写入 campaign | `passives`, `extraEnergyNext`, `passiveTriggers` | `bossPhaseTriggered`, `enemyRing`, `intent`, `passives`, `passiveTriggers` | `bossPhaseTriggered`, `enemyRing`, `intent`, `passives`, `passiveTriggers` | `passiveNoticeRound` |
| 战斗统计 | `passiveTriggers`, heal/shield | `passiveTriggers` | `passiveTriggers`, heal/shield | 无 |
| 被动影响 | 全部玩家角色被动 | 苏敌方被动、Boss 阶段 | 丽莎娅阈值、Boss 阶段 | 罗林福/苏提示 |
| 共鸣影响 | 无 | Boss 阶段加 2 格敌方星环 | Boss 阶段加 2 格敌方星环 | 无 |
| Boss/关卡 | 无 | 第 5 关耶莫稣 | 第 5 关耶莫稣 | 无 |
| UI/audio/log | `campaignNotice`, `log` | `campaignNotice`, `audio`, `log`, `renderCampaignHud` | `campaignNotice`, `audio`, `log`, `renderCampaignHud` | `campaignNotice` |
| 可否短路 base | 否 | 否 | 否 | 否 |
| 必须保持的顺序 | base 前先于 B/C/D 快照；base 后先于 B/C/D | base 后先于 C/D | base 后先于 D | 最后 |

该表是 Milestone 2 行为契约；重构后需保持相同的执行顺序与副作用。

### 9.5 Milestone 2 后：`applyCard` 显式战役集成边界

重构后 `campaign-ui.js` 只安装一个 `gameEngine.applyCard`：

```text
gameEngine.applyCard
  ↓ 非 campaign：直接 baseApplyCard（fixed-game-rules）
  ↓ campaign：
  campaignPlayerPassiveBefore（玩家卡 before）
    ↓
  baseApplyCard（fixed-game-rules 权威解析器）
    ↓
  campaignPlayerPassiveAfter（玩家卡 after）
  campaignBossAndEnemyPassiveAfter
  campaignHealthThresholdAfter
  campaignPassiveNoticeAfter
```

对应的显式函数：

- `ensureCampaignPassives`
- `campaignPlayerPassiveBefore`
- `campaignPlayerPassiveAfter`
- `campaignBossAndEnemyPassiveAfter`
- `campaignHealthThresholdAfter`
- `campaignPassiveNoticeAfter`
- `campaignStatsPassive`

`verify-runtime-ownership.mjs` 会检查：

- `fixed-game-rules.js` 仍拥有权威 `gameEngine.applyCard`。
- `campaign-ui.js` 只有 1 个 `gameEngine.applyCard` 赋值。
- 旧的四层包装命名/模式不得回归。
- 显式 handler 函数存在并在单一边界内被调用。

### 9.6 Milestone 3 前 `campaign-ui.js` 的 `playCard` 两层包装特征

当前（Milestone 3 重构前）执行顺序：

```text
statsPlayCard（外层：元素克制统计）
  → originalPlayCard（内层：星环共鸣/减耗消费）
    → fixed-game-rules.playCard（权威出牌事务）
```

| 维度 | originalPlayCard | statsPlayCard |
| --- | --- | --- |
| 捕获前实现 | `fixed-game-rules.playCard` | `originalPlayCard` 包装后 |
| 输入 | `side, instanceId` | 同左 |
| 执行顺序 | 先于 stats 后置统计 | 最外层，最后做统计 |
| 是否修改有效费用 | 否；费用由 `fixed-game-rules.playCard` 内部 `effectiveCardCost()` 读取 | 否 |
| 是否修改 `card.cost` | 否 | 否 |
| 成功判定 | 依赖底层 `playCard` 返回 truthy | 依赖底层返回 truthy |
| 成功后的 campaign 写入 | 星环格增加、`costReduction`/`enemyCostReduction` 清零、`renderCampaignHud()` | 无 campaign 写入 |
| 战斗统计 | 无直接统计；底层已写 `cards`/`advanced`/`special` | 若玩家且 `cardHasAdvantageAgainst()` 为真，`combatStats.elementalAdvantage += 1` |
| 失败/拒绝时副作用 | 无 | 无 |
| 沙盒行为 | 无 campaign 分支，直接透传 | 仍会记录元素克制统计（当前生产行为） |
| 可否短路 | 找不到 card 时提前 `false` | 无 |
| 与 actionLock 交互 | 不直接处理；由底层拒绝 | 不直接处理 |
| 与手牌移除/能量扣减交互 | 不直接处理；由底层事务完成 | 不直接处理 |

成功/失败语义：

- `gameEngine.playCard` 当前返回 `true` 或 `false`。
- 底层 `fixed-game-rules.playCard` 在以下情况返回 `false`：
  - 无 state、game over、回合不对、`skipAction`、`actionLocked`、`effectsRenderer._playLock`、找不到手牌实例、能量不足。
- 只有底层返回 truthy 后，campaign 才增加星环、消费减费状态、记录元素克制统计。
- 拒绝的出牌不会消耗 `costReduction`，不会增加星环，不会写元素统计，也不会移动卡牌。

### 9.7 Milestone 3 后：`playCard` 显式战役集成边界

重构后 `campaign-ui.js` 只安装一个 `gameEngine.playCard`：

```text
gameEngine.playCard
  ↓ 查找手牌实例（无则 false）
  ↓ basePlayCard（fixed-game-rules 权威出牌事务）
  ↓ 成功后才执行：
  recordCampaignCardPlay（星环格、减费消费、HUD）
  recordElementMatchup（玩家元素克制统计）
```

显式函数：

- `recordCampaignCardPlay`
- `recordElementMatchup`

有效费用仍由权威层通过 `effectiveCardCost()` 计算；campaign 不复制出牌事务。

`verify-runtime-ownership.mjs` 会检查：

- `fixed-game-rules.js` 仍拥有权威 `gameEngine.playCard`。
- `campaign-ui.js` 只有 1 个 `gameEngine.playCard` 赋值。
- 旧的两层包装命名/模式不得回归。
- `recordCampaignCardPlay` / `recordElementMatchup` 存在并被调用。
- `applyCard` 单一边界仍然保持。

### 9.8 Milestone 4 前 `endTurn` / `beginTurn` 生命周期特征

当前执行顺序：

```text
玩家请求结束回合
  ↓
campaign endTurn 外层（originalCampaignEndTurn）
  ↓
campaign endTurn 内层（originalEndTurn）
  ↓
fixed-game-rules.endTurn
  ↓
fixed-game-rules.beginTurn（下一个 side）
  ↓
campaign beginTurn 包装
  ↓
AI/定时回调（如切换到 enemy）
```

#### 9.8.1 `endTurn` 两层包装职责

| 职责 | originalEndTurn（内层） | originalCampaignEndTurn（外层） |
| --- | --- | --- |
| 捕获前实现 | `fixed-game-rules.endTurn` | 内层包装后 |
| base 前 | `mode.expireResonance(state, side)`；若 `side === "enemy"` 清空 `campaign.intent` | 无 |
| base 后 | 若 `side === "enemy"` 且 campaign 存在，重置 `campaign.resonanceUsed`；调用 `renderCampaignHud()` | 若 `side === "enemy"` 且 campaign 存在，重置 `campaign.enemyResonanceUsed` |
| 是否随 base 成功与否 | 是；即使 base 返回 `false`，前置/后置 campaign 副作用仍会执行 | 是；即使 base 返回 `false`，后置重置仍会执行 |
| 可否短路 | 否 | 否 |

#### 9.8.2 `beginTurn` 单层包装职责

- 先调用 `fixed-game-rules.beginTurn`（权威：能量重置、状态 tick、抽牌、日志）。
- 若 campaign 存在：
  1. 初始化/重置 `campaign.passives` 的回合桶。
  2. 若 `side === "player"` 且有 `extraEnergyNext`：额外 +1 能量、消费标记、日志/提示。
  3. 若 `side === "player"`：基于当前敌方手牌/能量/风格重新生成 `campaign.intent`。

#### 9.8.3 异步边界

- `fixed-game-rules.endTurn` 在切换后通过 `setTimeout` 调度：
  - 若下一侧为 enemy：调度 `aiController.takeTurn()`。
  - 同时调度 `uiRenderer.showAiDialogue("turnEnd")`。
- 当前验证环境可用 stub `setTimeout` 捕获/禁用回调，从而手动推进 enemy → player 回合。
- 真实浏览器中 AI 回合由该 `setTimeout` 驱动；turn 切换本身在 `endTurn` 同步完成。

### 9.9 Milestone 4 后：完整的回合过渡集成设计

重构后 `campaign-ui.js` 只安装一个 `gameEngine.endTurn` 和一个 `gameEngine.beginTurn`：

```text
玩家请求 End Turn
  ↓
resolveAction（actionLocked/gameOver 拦截）
  ↓
campaign endTurn 单一边界
  ↓ beforeCampaignTurnEnd（expire resonance；enemy 结束时清空 intent）
  ↓ baseEndTurn（fixed-game-rules 权威）
  ↓ 召唤协击、side switch、baseBeginTurn(next)
  ↓ afterCampaignTurnEnd（resonance 冷却重置、HUD）
  ↓
enemy AI 定时回调（如切到 enemy）
  ↓
campaign beginTurn 单一边界
  ↓ baseBeginTurn（fixed-game-rules 权威：能量/状态/抽牌）
  ↓ resetCampaignTurnPassives
  ↓ applyCampaignPlayerExtraEnergy（player 时）
  ↓ refreshCampaignEnemyIntent（player 时，为下一轮 enemy 准备意图）
```

显式函数：

- `beforeCampaignTurnEnd`
- `afterCampaignTurnEnd`
- `resetCampaignTurnPassives`
- `applyCampaignPlayerExtraEnergy`
- `refreshCampaignEnemyIntent`

`verify-runtime-ownership.mjs` 会检查：

- `fixed-game-rules.js` 仍拥有权威 `gameEngine.endTurn` 与 `gameEngine.beginTurn`。
- `campaign-ui.js` 对 `endTurn`/`beginTurn` 各只有 1 个赋值。
- 旧 `originalEndTurn` / `originalCampaignEndTurn` / `originalBeginTurn` 匿名包装模式不得回归。
- 上述显式 turn handler 存在并在单一边界内被调用。
- 既有 `playCard` / `applyCard` 单一边界仍然保持。

### 9.10 Milestone 5 前 `aiController.takeTurn` 两层包装特征

重构前 `campaign-ui.js` 存在两个 `aiController.takeTurn` 赋值：

1. 基础异步 AI 循环（line 108）：非战役通用循环。
2. 战役 AI 包装（line 308）：先做控制/共鸣/意图，再决定委托给基础循环或运行战役循环。

执行顺序：

```text
enemy turn scheduled
  ↓
campaign AI wrapper（line 308）
  ↓ 控制跳过检查
  ↓ 若非 campaign：委托基础 AI 循环（line 108）
  ↓ 若 campaign：运行战役 AI 循环
```

| 职责 | 基础循环 | 战役包装 |
| --- | --- | --- |
| 异步循环 | ✅ | 战役内自己循环 |
| 非战役委托 | 最终执行 | 负责转发 |
| 控制跳过 | 无 | 进入前检查 |
| 意图选择/刷新 | 无 | 有 |
| 敌方共鸣 | 无 | 有 |
| 行动上限 | 无 | 15 |
| 出牌入口 | `gameEngine.playCard` | `gameEngine.playCard` |
| 结束回合 | `resolveAction endTurn` | `resolveAction endTurn` |

### 9.11 Milestone 5 后：完整的 AI 编排边界

重构后 `campaign-ui.js` 只安装一个 `aiController.takeTurn`：

```text
enemy turn scheduled
  ↓
aiController.takeTurn（单个编排边界）
  ↓ 守卫 state/gameOver/turn
  ↓ skipEnemyControlledTurn（控制跳过）
  ↓ waitForCombatIdle
  ├─ 非 campaign：runSandboxAiTurn
  │    → chooseCard
  │    → gameEngine.playCard
  │    → waitForCombatIdle
  │    → 无牌则 resolveAction endTurn
  └─ campaign：runCampaignAiTurn
       → 激活敌方共鸣（如满环）
       → chooseCampaignAiCard（意图/重选/估值）
       → gameEngine.playCard
       → 清空 intent
       → waitForCombatIdle
       → 再次检查敌方共鸣
       → 行动上限 15
       → resolveAction endTurn
```

显式函数：

- `runSandboxAiTurn`
- `runCampaignAiTurn`
- `chooseCampaignAiCard`

异步契约：

- 所有 AI 动作通过 `gameEngine.playCard` 执行，沿用既有单边界的锁、能量、手牌、弃牌/消耗逻辑。
- 每个动作后 `waitForCombatIdle` 等待 `actionLocked` / 特效锁 / 挂起 HP 显示清除。
- `runSandboxAiTurn` 与 `runCampaignAiTurn` 的循环条件都检查 `gameOver`、`state` 有效性和当前回合。
- 战役循环额外使用 `gameEngine.isActiveBattle(state, sessionId)` 防止陈旧会话继续行动。
- 控制跳过通过 `skipEnemyControlledTurn` 在进入 AI 循环前处理，并调度延迟 `endTurn`。
- game-over 后循环条件立即失效，AI 不会继续执行第二个动作。
- 没有新增通用事件总线或插件框架。

### 9.12 Milestone 6 前 `tickStatuses` / `draw` 匿名包装特征

#### `tickStatuses` 匿名包装

- 先调用权威 `fixed-game-rules.tickStatuses`。
- base 后执行：
  - 赫卡莫斯被动吸血（敌方 DoT 且来源为玩家时）。
  - 战役生命阈值/Boss 阶段处理。
- 不修改 base 的 DoT/状态递减/控制抗性逻辑。
- 即使 base 结算后 fighter 死亡，当前包装仍会执行 campaign post-processing（真实行为）。

#### `draw` 匿名包装

- 先调用权威 `fixed-game-rules.draw`。
- 仅在“实际抽到牌的数量 > 0”时播放 `card-draw` 音效。
- 不修改抽牌数量、手牌上限、弃牌洗回或 `exhaustPile` 行为。

### 9.13 Milestone 6 后：显式 `tickStatuses` / `draw` 边界

```text
gameEngine.tickStatuses
  ↓
baseTickStatuses（fixed-game-rules 权威）
  ↓
processCampaignStatusTickPassive（赫卡莫斯）
  ↓
processCampaignPostStatusTick（阈值/Boss）

gameEngine.draw
  ↓
baseDraw（fixed-game-rules 权威）
  ↓
playCampaignDrawSound（实际抽到牌时播放音效）
```

显式函数：

- `processCampaignStatusTickPassive`
- `processCampaignPostStatusTick`
- `playCampaignDrawSound`

`verify-runtime-ownership.mjs` 会检查：

- `tickStatuses` / `draw` 在 `campaign-ui.js` 中各只有 1 个赋值。
- 旧 `originalTickStatuses` / `originalDraw` 匿名包装模式不得回归。
- 显式 handler 存在并从单一边界调用。
- 既有 `applyCard` / `playCard` / `endTurn` / `beginTurn` / `aiController.takeTurn` 单一边界仍然保持。

### 9.14 Runtime Ownership Stabilization 最终普查

| 方法 | 权威 owner | campaign 扩展 | 运行时赋值数（campaign-ui） | 状态 |
| --- | --- | --- | --- | --- |
| `gameEngine.applyCard` | `fixed-game-rules.js` | 单一边界 + 显式 handlers | 1 | 稳定 |
| `gameEngine.playCard` | `fixed-game-rules.js` | 单一边界 + 显式 handlers | 1 | 稳定 |
| `gameEngine.endTurn` | `fixed-game-rules.js` | 单一边界 + 显式 handlers | 1 | 稳定 |
| `gameEngine.beginTurn` | `fixed-game-rules.js` | 单一边界 + 显式 handlers | 1 | 稳定 |
| `gameEngine.tickStatuses` | `fixed-game-rules.js` | 单一边界 + 显式 handlers | 1 | 稳定 |
| `gameEngine.draw` | `fixed-game-rules.js` | 单一边界 + 显式 handler | 1 | 稳定 |
| `gameEngine.resolveDamage` | `fixed-game-rules.js` | 无 campaign 包装 | 0 | 稳定 |
| `gameEngine.applyStatus` | `fixed-game-rules.js` | 无 campaign 包装 | 0 | 稳定 |
| `gameEngine.checkGameOver` | `index.html` 内联 | 无 campaign 包装 | 0 | 稳定 |
| `aiController.takeTurn` | `campaign-ui.js` 单个 AI 编排边界 | 单一边界 + 显式 helpers | 1 | 稳定 |
| `aiController.chooseCard` | `fixed-game-rules.js` 决策 + `campaign-ui.js` 战役包装 | 单层显式包装 | 1 | 稳定 |

结论：核心战斗生命周期不存在已知多层 campaign monkey-patch 链。

## 9A. Visual Runtime Ownership

### 9A.1 Renderer ownership census

| Renderer | Definitions | Final owner | Wrappers | Captured old refs | Stable? |
| --- | --- | --- | --- | --- | --- |
| `renderCard` | 1 个权威函数定义 | `index.html` 权威实现 | 无（历史 4 个赋值已删除） | 无 | 稳定 |
| `renderCardPreview` | 1 个公共赋值（campaign-ui） | `campaign-ui.js` 公共入口 | `renderBaseCardPreview` 基础方法 + campaign 有效费用传入 | campaign-ui 捕获 `renderBaseCardPreview` | 稳定 |
| `cardColors` | 1 个函数定义 + 1 个赋值 | `index.html` 最终赋值 | 无包装 | 无 | 稳定 |
| `uiRenderer.render` | 1 个公共赋值（campaign-ui） | `campaign-ui.js` 公共入口 | `renderBattleSurface` 基础方法 + campaign presentation | campaign-ui 捕获 `renderBattleSurface` | 稳定 |
| `uiRenderer.renderFighter` | 1 个权威赋值 | `index.html` 权威实现 | 无（历史 3 个版本已删除） | 无 | 稳定 |
| `uiRenderer.renderDuelUnit` | 1 个对象方法 | `index.html` 权威方法 | 无（历史包装已合并） | 无 | 稳定 |
| `uiRenderer.renderSummons` | 初始方法 | `index.html` 初始实现 | 无 | 无 | 稳定 |
| `uiRenderer.renderOpponentHand` | 初始方法 + index 清空版 | `index.html` 最终清空实现 | 无包装 | 无 | 已普查 |
| `uiRenderer.renderLog` | 初始方法 | `index.html` 初始实现 | 无 | 无 | 稳定 |
| `uiRenderer.renderDeckManager` | 初始方法 + index 最终版 | `index.html` 最终版 | 无包装 | 无 | 已普查 |
| `effectsRenderer.play` | 初始方法 + index 最终覆盖 | `index.html` 单一公共入口 | `playStandardBattleEffect` 显式 helper | 有（helper 持有基础特效） | 稳定 |

### 9A.2 Renderer override chronology

- `renderCard`：base 版本 → 卡片图标版 → atlas 框架版 → 当前 art/effective-cost 版；Milestone 10 已收敛为单一权威实现。
- `renderFighter`：基础 HUD → 参考 HUD → atlas 状态图标版；Milestone 13 已收敛为单一权威实现。
- `renderDuelUnit`：基础方法 + ai-dialogue 包装；Milestone 16 已合并为单一对象方法。
- `renderCardPreview`：基础预览 → art 预览 → 当前 effective-cost/advantage 预览 → campaign-ui 减费包装；Milestone 15 已收敛为 `renderBaseCardPreview` + 单一 campaign-ui 公共入口。
- `uiRenderer.render`：基础渲染 → battle layout v3 包装 → campaign-ui HUD 包装；Milestone 14 已合并为 `renderBattleSurface` + 单一 campaign-ui 公共入口。
- `effectsRenderer.play`：标准特效 → 当前带 `_playLock` 和 speed factor 的特效版本；Milestone 11 已把历史 `originalEffectsPlayStandard` 重命名为 `playStandardBattleEffect` 显式 helper。

### 9A.3 Effects ownership

- `effectsRenderer` 拥有粒子、浮动数字、命中反馈、召唤动画、屏幕震动。
- `effectsRenderer.play` 是唯一公共入口，位于 `index.html`。
- `playStandardBattleEffect` 是显式基础特效 helper，持有标准战斗特效实现。
- `effectsRenderer.play` 负责 `_playLock` 设置/清除、输入锁定、速度因子与基础特效调用。
- `gameEngine.playCard` 通过 `actionLocked` 与 `effectsRenderer._playLock` 共同防止重复输入。

### 9A.4 Action-lock / animation coupling

| Operation | Who locks | Who unlocks | Timer/callback | Failure risk |
| --- | --- | --- | --- | --- |
| 卡牌打出 | `fixed-game-rules.playCard` | `setTimeout` 解锁 | `dramaTimingForCard(card).totalMin` | 若 timer 丢失可能卡锁 |
| 特效播放 | `effectsRenderer.play` | `setTimeout` 清零 `_playLock` | `timing.totalMin + 200` | 若 battle invalid 提前 return，可能不清锁（有 session guard） |
| 回合结束 | `resolveAction` 检查 lock | `setTimeout` 后 UI 解锁 | 同上 | 有 session guard |
| AI 等待 | `waitForCombatIdle` | 轮询 `actionLocked` / `_playLock` / pending overrides | `setTimeout` | 超时后强制继续 |

跨战斗生命周期：

- `effectsRenderer._playLock` 是 renderer 级时间戳锁，不是 battle 状态字段。
- `gameEngine.start` 在创建新战斗时执行 `effectsRenderer._playLock = 0` 与 `setCombatInputLocked(false)`，避免 Battle A 的锁抑制 Battle B 第一次特效。
- Battle A 的旧 unlock timer 通过 `isActiveBattle` 拒绝旧 session 回调，因此不会清除 Battle B 的 `_playLock`。
- 不变式：异步回调只能释放它自己所属 battle/session 的视觉锁。

### 9A.5 Renderer/gameplay coupling

- `uiRenderer.render` 只读取 `gameEngine.state`，不直接修改玩法状态。
- `refreshEffectiveCardCosts` 修改 DOM class/dataset，不修改 game state。
- `renderCard` 内读取 `effectiveCardCost`，不修改卡牌。
- 历史 `applyCard` 内部曾直接调用 `effectsRenderer.play`，但已由 `fixed-game-rules` / `campaign-runtime` 统一。
- 未发现 renderer 直接修改 HP/能量/手牌等核心玩法字段。

### 9A.6 Event-handler risks

- `uiRenderer.render` 每次通过 `innerHTML` 重建手牌 DOM，并重新绑定 `#playerHand .card` 点击监听。
- `uiRenderer.bindBattleCardPreview` 使用 `dataset.previewBound` 防止重复绑定预览，但点击监听由 render 每次重建。
- 主要风险是重复渲染导致旧 DOM 监听被 GC，新监听重新绑定；当前未发现累积泄漏，但全量重建成本高。

### 9A.7 Dynamic markup audit

- 大部分插值来自固定角色/卡牌数据或内部生成数据，属于 trusted/static。
- 卡牌名称、元素、描述等多数经过 `escapeHtml` 或为固定库数据。
- 自定义卡牌输入路径存在 `storageManager` 数据进入 `innerHTML`，部分已 escape，部分仍需后续深查。
- 当前不认定存在已证实 XSS；列为 `requires deeper review` 的主要是自定义卡牌/存档导入路径。

### 9A.8 Performance hotspots

按预期影响排序：

1. `uiRenderer.render` 每次战斗渲染重建手牌、fighter、duel unit、summons、log。
2. `renderCard` 在每次手牌渲染时对每张卡执行 art/frame/effective-cost 计算。
3. `effectsRenderer.frame` 每帧遍历粒子并在 Canvas 绘制。
4. `renderFighter` 每次渲染重建 HUD 状态图标与 enemy hand。
5. `renderLog` 每次渲染重建最多 38 条日志 DOM。

### 9A.9 CSS layering

- `index.html` 有 3 个 `<style>` 块。
- 第 1 块是历史基础样式；第 2 块是 `battle-visual-polish-final` 活动战斗覆盖；第 3 块是 `battleSpeedOverride` 速度覆盖。
- `!important` 数量约 3657，`@media` 数量约 20。
- 主要风险是历史基础样式与 final override 大量并存，未来 CSS 清理需要浏览器验证。

## 9B. CSS Architecture Audit

### 9B.1 CSS source map

| Source | Order | Scope | Approx lines | !important | Media |
| --- | --- | --- | --- | --- | --- |
| `<style>` block 0（无 id） | 1 | 历史基础样式、通用 UI | 5000 | 1625 | 8 |
| `<style id="battle-visual-polish-final">` | 2 | 活动战斗最终覆盖、卡片/单位/HUD/响应式 | 4060 | 2032 | 12 |
| `<style id="battleSpeedOverride">` | 3 | 战斗速度覆盖 | 11 | 0 | 0 |

另有：

- 41 处内联 `style=""`。
- 约 38 处 JS `.style.*` 写入。
- 由稳定渲染器生成的类与 dataset 是 CSS 的 DOM 契约。

### 9B.2 Layer map

- `base / legacy layout`
- `battle base`
- `battle visual polish final`
- `campaign`
- `responsive`
- `speed override`
- `hotfix/compatibility`

实际层主要由三个 style 块承载；block 1 是最大 final override 层。

### 9B.3 Exact metrics

```text
style blocks: 3
CSS lines: ~9071
selectors/rules: ~1166
!important declarations: 3657
media-query regions: 20
keyframes: 54
inline style attributes: 41
JS .style writes: ~38
```

### 9B.4 `!important` distribution

- block 0：1625
- block 1：2032
- block 2：0
- 最常见属性：`background`、`color`、`display`、`width/height`、`padding`、`min-height`、`font-size`、`z-index`、`overflow`、`gap`。

### 9B.5 Critical ownership matrix

| Component | Property | Desktop winner | Small winner | Source layer |
| --- | --- | --- | --- | --- |
| `.card` | display/size/background | final override block 1 | responsive final | block 1 |
| `.fighter-card` | width/background | final override block 1 | responsive final | block 1 |
| `.preview-card` | position/width | final override block 1 | responsive final | block 1 |
| `.battle-layout-v3` | grid/overflow | final override block 1 | responsive final | block 1 |
| `.campaign-hud` | position/z-index | final override block 1 | responsive final | block 1 |
| `.unit-overhead-hp` | display/position | final override block 1 | responsive final | block 1 |

具体 winning rule 需用浏览器 computed style 验证；静态矩阵仅记录当前审计方向。

### 9B.6 Responsive map

- 20 个 `@media` 区域。
- block 0 有 8 个，block 1 有 12 个。
- 多个区域可能竞争同一组件，需要后续 computed-style 矩阵收敛。
- Android WebView 使用 forced 1920 viewport，因此当前 Android 主要按桌面 CSS 路径执行。

### 9B.7 Inline/dynamic styling

- 内联 style 主要用于卡牌 `--c1/--c2`、成本 sprite、art background、orbit、动态定位。
- JS `.style.*` 写入主要用于 Canvas、战役 HUD、粒子、动态背景。
- 分类：`dynamic necessary` 为主；后续可考虑将静态内联样式移到 class。

### 9B.8 Dynamic state classes

关键状态类：

- `.unplayable`
- `.selected`
- `.active`
- `.enemy`
- `.campaign-*`
- `.hidden`
- `.hand-hover-suppressed`
- `.battle-mode`
- `.home-mode`

这些类由 JS 动态切换，是 CSS 审计中“看似未使用但实际活跃”的高风险来源。

### 9B.9 Z-index map

主要层级由 block 1 final override 控制，常见高 z-index 区域包括：Preview、modal、effects canvas、campaign HUD、notices。精确值需按 selector 提取。

### 9B.10 Animation ownership

- 54 个 `@keyframes`。
- block 1 拥有 36 个 keyframes，是动画/特效主要 owner。
- 速度 override 块通过 `battleSpeedOverride` 调整动画时长。

### 9B.11 Highest-risk CSS families

1. `.battle-layout-v3` / 战斗布局 — 多代覆盖、grid/overflow、响应式冲突。
2. `.card` — 高频、多 tier class、成本/art 覆盖。
3. `.fighter-card` / 单位 HUD — 高频、状态/护盾/手牌信息。
4. `.preview-card` — 高频 hover/tap 路径。
5. `.campaign-hud` — 战役专属覆盖与响应式。

### 9B.12 Dead CSS candidates

- `exact duplicates`：存在，但未删除。
- `likely superseded`：block 0 中大量被 block 1 覆盖的声明。
- `uncertain`：pseudo/state/动画相关规则需要浏览器交互验证。

### 9B.13 Machine verification

`scripts/verify-css-ownership.mjs` 保护：

- 3 个 style 块及其顺序/ID；
- `!important` 总数在 3000–5000 区间；
- `@media` 数量 20；
- `@keyframes` ≥50；
- 关键视觉家族存在；
- final override 块包含媒体查询。

`scripts/audit-css-ownership.mjs` 提供详细诊断，不进入 CI 门槛。

### 9B.14 Battle Layout CSS Ownership

#### Before

- block 0 存在非媒体 `.battle-layout-v3`（64px 行高）。
- block 1 存在非媒体 `body.battle-mode .battle-layout-v3`（58px 行高）后被更晚的 56px 基础声明覆盖。
- 历史层互相竞争，增加 `!important` 密度。

#### After

- 移除两个被证明 superseded 的非媒体基础声明。
- 保留 block 1 的 56px 权威基础与 1600/1366/980 等响应式覆盖。
- 不再残留 64px / 58px 旧非媒体 battle-layout 声明。

#### Metrics

```text
battle-layout !important before: 4（本次清理范围）
battle-layout !important after:  0（旧非媒体基础移除）
global !important before: 3657
global !important after:  3653
```

#### Computed-style contract

清理后桌面 1440×900 关键值保持不变：

```text
.battle-layout-v3 width/height: 1440px / 900px
#playerHand .card: 172px × 298px
#playerArea .fighter-card: 288px
#endTurnBtn: 160px × 154px
#cardPreviewPanel: 300px × 312px, z-index 910
#battleLog: height 446px
```

### 9B.15 Card CSS Ownership

#### Family boundary

- In-scope：`.card`、`.card-top`、`.card-name`、`.card-cost`、`.card-meta`、`.card-art`、`.card-desc`、`.card-tier-*`、`.card-advantage-badge`、`.card-orbit-system`、`.unplayable`，以及 `#playerHand` / `.hand-dock-v3 .card` 上下文选择器。
- Out-of-scope：`.preview-card-*`、deck manager cards、campaign selection cards、fighter cards。

#### Before

- block 0 存在 `.hand-dock-v3 .card` 旧基础声明（min-height/padding/gap/border-radius）。
- block 0 还存在 `.hand-dock-v3 .card:hover` 与 child 旧声明。
- 这些声明被 block 1 `battle-visual-polish-final` 中更高 specificity、更晚的 `!important` 规则完全覆盖。

#### After

- 移除 block 0 中 5 个被证明 superseded 的 `.hand-dock-v3 .card*` 规则。
- 保留 block 1 权威 `.hand-dock-v3 .card` 基础与响应式覆盖。
- 基础 `.card`、tier/state 选择器、unplayable、art、cost、orbit、advantage 选择器保持不变。

#### Metrics

```text
card-family rules before: 5（本次清理范围）
card-family rules after:  0（旧 block0 规则移除）

card-family declarations before: 15
card-family declarations after:  0

card-family !important before: 0
card-family !important after:  0
```

#### Computed-style contract

清理后关键值不变：

```text
desktop card: 172px × 298px
small card:   158px × 274px
unplayable:   opacity 0.82 / filter saturate(0.82) brightness(0.85)
```

### 9B.16 Fighter HUD CSS Ownership

#### Family boundary

- In-scope：`.fighter-card`、`.battle-hud .fighter-card`、`.battle-hud-enemy .fighter-card`、`.fighter-name`、`.bar`、`.bar-fill`、`.bar-text`、`.status-line`、`.mechanic-note`、`.enemy-hand-in-hud`、`.energy-row`、`.energy-dot`。
- Out-of-scope：`.unit-sprite`、duel-unit containers、`.card`、`.preview-card`、`.campaign-hud`。

#### Before

- block 0 存在 `.battle-hud .fighter-card` 旧基础声明（padding/min-height/background/border-color）。
- block 0 还包含旧 `.battle-hud .fighter-card::before`、`.fighter-name`、`.mechanic-note`、`.bar`、`.energy-row`、`.energy-dot`、`.status-line` 规则。
- 这些规则被 block 1 `battle-visual-polish-final` 中更高 specificity、更晚的 `!important` 规则完全覆盖。

#### After

- 移除 block 0 中 12 个被证明 superseded 的 `.battle-hud` Fighter 规则。
- 保留 block 1 权威 `.battle-hud .fighter-card`、`.battle-hud-enemy .fighter-card` 与全部子选择器、响应式覆盖。

#### Metrics

```text
fighter-family rules before: 12（本次清理范围）
fighter-family rules after:  0（旧 block0 规则移除）

fighter-family declarations before: 21
fighter-family declarations after:  0

fighter-family !important before: 1
fighter-family !important after:  0
```

#### Computed-style contract

清理后关键值不变：

```text
desktop player width: 288px
desktop enemy width:  300px
small player width:   252px
small enemy width:    268px
HP fill:              264px × 12px（desktop）、228px × 12px（small）
```

### 9B.17 Preview CSS Ownership

#### Family boundary

- In-scope：`.card-preview-panel`、`.preview-card-title`、`.preview-card-meta`、`.preview-art-box`、`.preview-card-desc`、`.preview-card-keywords`、`.preview-card-power`、`.preview-detail-grid`、`.preview-empty`，以及直接控制 Preview root 的 `position/z-index/overflow/pointer-events` 规则。
- Out-of-scope：`.card`、modal system、campaign HUD、deck-manager preview、generic tooltip。

#### Before

- block 0 存在 `.card-preview-panel::before` 旧标题规则（`content: "卡牌说明"`）。
- block 1 后期通过 `content: none !important; display: none !important;` 完全禁用该伪元素。

#### After

- 移除 block 0 的 `.card-preview-panel::before` 旧规则。
- 保留 block 1 权威 `.card-preview-panel`、child Preview 选择器与全部响应式覆盖。

#### Metrics

```text
preview-family rules before: 1（本次清理范围）
preview-family rules after:  0（旧 block0 ::before 移除）

preview-family declarations before: 5
preview-family declarations after:  0

preview-family !important before: 0
preview-family !important after:  0
```

#### Computed-style contract

清理后关键值不变：

```text
desktop Preview: 300px × 312px, z-index 910, overflow hidden
small Preview:   292px × 312px, z-index 910, overflow hidden
pointer-events:  auto
display:         grid
```

### 9B.18 Campaign HUD CSS Ownership

#### Family boundary

- In-scope：`.campaign-hud`、`.campaign-ring`、`.campaign-ring i`、`.campaign-ring i.on`、`.campaign-intent`，以及 `@media (max-width:700px)` 中的 Campaign HUD 覆盖。
- Out-of-scope：`.card`、`.fighter-card`、`.card-preview-panel`、generic modal、battle-layout root。

#### Runtime ownership

- `campaign-ui.js` 的 `renderCampaignHud()` 创建/更新 Campaign HUD DOM。
- CSS 只消费现有 DOM 类，不参与 gameplay 状态计算。

#### Ownership structure

```text
.campaign-hud（root，absolute / z-index 30）
  ↓
.campaign-ring / .campaign-ring i / .campaign-ring i.on
  ↓
.campaign-intent
  ↓
@media (max-width:700px) 响应式覆盖
```

#### Computed-style contract

```text
Desktop 1440×900:
  #campaignHud width 560px, height 52px
  z-index 30, position absolute, pointer-events auto

Small 390×844:
  #campaignHud width 196px, height 66px
  z-index 30, position absolute, pointer-events auto
```

Campaign HUD CSS 在 final block 中已经是单一权威层，本次未发现需要移除的历史 superseded 规则。

### 9B.19 Responsive / Media-Query Ownership

#### Inventory

```text
total media regions: 20
block 0: 8
final block: 12
other: 0
```

Distinct width conditions:

```text
max-width: 520, 560, 600, 700, 980, 1180, 1280, 1360, 1366, 1400, 1600
```

Also:

```text
(max-width: 700px), (orientation: portrait)
```

#### Duplicate conditions

```text
(max-width: 980px)  ×4
(max-width: 1600px) ×3
(max-width: 1366px) ×2
(max-width: 1400px) ×2
(max-width: 1360px) ×2
```

These are intentional fragmentation debt, not yet consolidated.

#### Responsive `!important` metrics

```text
!important inside media queries: 254
!important outside media queries: 3398
highest-density breakpoints: 1366px, 1400px, 1600px
```

#### Component × breakpoint participation

- `battle-layout-v3`：1600 / 1366 / 980
- `hand-dock-v3`：1600 / 1366 / 980 / 1400
- `.card`：1600 / 1366 / 980 / 1400
- `.card-preview-panel`：1600 / 1366 / 980 / 1400
- `.campaign-hud`：700
- `.duel-unit`：1360 / 560 / 1180 / 1366
- `#endTurnBtn`：1600 / 1366 / 1400 / 560

#### Boundary evidence

At 1600/1366/980 boundaries, observed transitions:

```text
1601 → 1600: card 188→172, Preview 320→300
1367 → 1366: fighter 288→252
980 → 979: no high-level layout discontinuity in sampled components
```

#### Architecture verdict

The stylesheet is **desktop-first with max-width corrections**, fragmented across block 0 and final block. Android forced 1920 viewport uses the `>1600px` desktop path and bypasses most small-screen media rules.

## 10. 已知架构风险

1. **加载顺序即语义所有权**：`fixed-game-rules.js` 和 `campaign-ui.js` 通过直接赋值覆写方法，而不是显式组合；后加载者获胜。
2. **多层同名包装**：核心战斗生命周期方法均已完成单边界显式化；`tickStatuses` 与 `draw` 也已从匿名包装转为显式命名边界。当前核心运行时不再存在已知多层 campaign monkey-patch 链。
3. **旧路径并存**：`index.html` 内联仍保留多代 `applyCard`/`tickStatuses`/召唤处理；`renderCard`、`renderFighter`、`renderCardPreview`、`renderDuelUnit` 与 `uiRenderer.render` 已收敛为单一权威实现。
4. **表现层与规则层耦合**：`fixed-game-rules.js` 的 `applyCard`/`endTurn` 仍直接调用 `effectsRenderer`、`uiRenderer`、`audioManager`、`setTimeout`；纯规则测试需要大量桩。
5. **无统一事件模型**：战斗日志、浮动伤害、音效、统计分别从 `result` 对象/状态直接推断，缺少单一事件流。
6. **存储缺少迁移框架**：只有 `campaignMode.normalizeProgress` 容错，没有正式 schema/import/export/quota 处理。
7. **Android viewport 仍是固定 1920 桌面模拟**：响应式重构前需要专门里程碑。

## 11. 建议的迁移边界（Monkey Patch → Explicit Composition）

不要立刻重写引擎。建议按以下边界渐进替换：

1. **先建立稳定的公开战斗 API 面**：明确 `start`、`beginTurn`、`draw`、`playCard`、`applyCard`、`resolveDamage`、`applyStatus`、`tickStatuses`、`endTurn`、`takeTurn`、`checkGameOver`、`settleBattle` 为 battle-engine contract。
2. **把 `fixed-game-rules.js` 的当前实现视为“base engine”**，而不是“override layer”。后续新增文件应显式声明为规则插件，不再直接赋值替换。
3. **为战役行为引入显式扩展点**，例如：
   - `gameEngine.hooks.beforeApplyCard`
   - `gameEngine.hooks.afterApplyCard`
   - `gameEngine.hooks.beforeBeginTurn`
   - `gameEngine.hooks.afterBeginTurn`
   - `gameEngine.hooks.beforeEndTurn`
   - `gameEngine.hooks.afterEndTurn`
   - `gameEngine.hooks.afterDamage`
   - `gameEngine.hooks.afterDraw`
   这些 hooks 只用于战役被动/统计/意图，不改变基础规则。
4. **把表现副作用移出规则核心**：`applyCard`/`playCard` 应先返回/记录事件列表，再由 `uiRenderer`/`effectsRenderer`/`audioManager` 消费。
5. **迁移顺序建议**：
   - 第一步：新增事件列表到 `resolveDamage`/`applyCard` 返回结果（不改变现有行为）。
   - 第二步：把 `campaign-ui.js` 的 4 层 `applyCard` 包装合并为显式 `applyCardPipeline` 或 hooks。
   - 第三步：把 `playCard` 的 2 层包装合并为显式 `playCardPipeline`。
   - 第四步：把 `endTurn`/`beginTurn`/`tickStatuses` 包装收敛到 hooks。
   - 第五步：把 `effectsRenderer`/`audioManager`/`setTimeout` 从 `fixed-game-rules.js` 规则函数中剥离。
6. **每个迁移步骤必须有行为等价验证**：运行 `scripts/verify-all.mjs`，并新增针对该步骤的事件/状态不变式测试。
