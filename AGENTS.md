# Repository Guidelines

## Project Overview

`星环卡牌战场`是无后端的离线卡牌战斗原型。根目录`index.html`是 Web 权威入口，使用原生 HTML、CSS 和 JavaScript；`js/`在页面主脚本之后加载，提供固定卡组、战役、战斗规则和音频覆写。`android/`是 Kotlin/Gradle 的 WebView 壳，将同步后的网页资源打入 APK。运行时本地数据保存在浏览器 `localStorage`。

## Project Structure & Module Organization

- `index.html`：主 UI、渲染、基础战斗对象和 `globalThis` 暴露；不要全文件格式化或大规模拆分。
- `js/fixed-game-rules.js`：最终战斗规则覆写层；`campaign-ui.js`继续包装战役行为。修改战斗逻辑必须追踪这条加载链。
- `js/fixed-card-library.js`、`campaign-*.js`、`battle-rules.js`、`audio-manager.js`：固定卡组、战役、通用规则和音频模块。
- `assets/`：本地图片、音频元数据和素材 manifest；`docs/`：审计和素材说明。
- `scripts/`：零依赖 Node 验证及 Android 资源同步脚本。
- `android/app/src/main/kotlin/.../MainActivity.kt`：WebView 宿主、资源加载、沉浸式模式和返回行为；`android/app/src/main/assets/www/`：生成的网页镜像，禁止手改。

## Architecture Notes

`index.html`公开`cardGenerator`、`deckBuilder`、`gameEngine`、`aiController`、`uiRenderer`、`effectsRenderer`、`storageManager`等对象。外部脚本经`globalThis`访问它们，加载顺序以页面末尾的`<script src>`为准；后加载的`fixed-game-rules.js`和`campaign-ui.js`会覆写核心方法。涉及费用、回合、伤害、状态、召唤物或异步结算时，检查所有包装层和同类调用路径。

网页资源必须保持相对`assets/...`路径，以同时兼容本地静态服务器、GitHub Pages 和`WebViewAssetLoader`。根网页、`assets/`、`js/`及根图标发生 Android 相关变更时，先改权威根文件，再使用同步脚本生成镜像。

## Build, Test & Development Commands

只记录已有命令；运行前按任务授权：

```powershell
python -m http.server 8000                         # 本地 Web 静态服务器
node scripts/verify-fixed-card-library.mjs          # 固定角色和卡牌库
node scripts/verify-campaign.mjs                    # 战役规则与进度
node scripts/verify-special-card-behavior.mjs       # 特殊卡真实行为
node scripts/verify-audio-library.mjs               # 音频元数据与回退
node scripts/verify-battle-effects.mjs              # 战斗效果与覆写链
node scripts/verify-battle-start-smoke.mjs          # 战斗启动 smoke
node scripts/verify-campaign-display-smoke.mjs      # 战役显示 smoke
node scripts/verify-campaign-apply-card-chain.mjs    # 战役 applyCard 集成边界特征
node scripts/verify-campaign-play-card-chain.mjs     # 战役 playCard 集成边界特征
node scripts/verify-campaign-turn-transition.mjs    # 战役回合过渡特征
node scripts/verify-campaign-ai-turn.mjs            # 战役 AI 回合特征
node scripts/verify-campaign-runtime-boundaries.mjs # 战役 tickStatuses/draw 边界特征
node scripts/verify-campaign-rules-module.mjs      # campaign-rules 模块契约
node scripts/verify-campaign-runtime-module.mjs     # campaign-runtime 模块契约
node scripts/verify-renderer-ownership.mjs         # 渲染器所有权普查
node scripts/verify-render-card.mjs                # renderCard 特征
node scripts/verify-render-fighter.mjs            # renderFighter 特征
node scripts/verify-render-card-preview.mjs      # renderCardPreview 特征
node scripts/verify-render-duel-unit.mjs         # renderDuelUnit 特征
node scripts/verify-ui-render-pipeline.mjs         # uiRenderer.render 管线
node scripts/verify-effects-play-lock.mjs           # effectsRenderer.play lock 特征
node scripts/audit-css-ownership.mjs             # CSS 所有权审计（诊断）
node scripts/verify-css-ownership.mjs            # CSS 所有权校验
node scripts/verify-battle-layout-css.mjs       # battle-layout CSS 所有权
node scripts/verify-card-css.mjs               # card CSS 所有权
node scripts/verify-fighter-css.mjs           # fighter CSS 所有权
node scripts/verify-preview-css.mjs          # Preview CSS 所有权
node scripts/verify-campaign-hud-css.mjs       # Campaign HUD CSS 所有权
node scripts/audit-responsive-ownership.mjs         # 响应式所有权审计（诊断）
node scripts/verify-responsive-ownership.mjs        # 响应式所有权校验
node scripts/verify-battle-invariants.mjs           # 战斗不变式回归
node scripts/verify-runtime-ownership.mjs           # 战斗规则所有权/覆写链检查
node scripts/verify-all.mjs                         # 聚合全部安全只读验证
node scripts/sync-android-web-assets.mjs            # 同步 Android 网页镜像并校验
node scripts/verify-android-web-assets.mjs          # 只读检查镜像、素材和 WebView 设置
.\android\gradlew.bat -p android assembleDebug      # 构建 Debug APK（需要 JDK 17 与 Android SDK）
```

仓库没有`package.json`、通用测试框架、formatter 或 type-check 命令；不要臆造 npm 命令。同步会写入 Android 镜像，只在 Android 交付需要时运行。commit、push、合并、部署、Release、数据库写入和签名操作均需明确授权。

## Coding Style & Naming Conventions

遵循相邻代码：JavaScript 用`const`、camelCase、两空格缩进；Kotlin 用四空格。UI 文案以中文为主。保持 seeded randomness、存储键、固定 30 张卡组规则、卡牌数值与 Android/Web 兼容性；未明确要求不得改变平衡、角色设定或职业/种族规则。不要自动格式化`index.html`。

## Testing & Verification

按改动运行最小相关`verify-*.mjs`，并检查`git status --short`、`git diff --stat`和`git diff --check`。战斗、状态、动画和 UI 改动还需要在浏览器检查实际状态、日志与控制台；Android 相关根网页改动必须在同步后运行`verify-android-web-assets.mjs`。不要用改无关行为的方式掩盖失败，未运行或无法运行的检查必须说明。

## Commit & Pull Request Guidelines

近期提交使用简短、单目的、带前缀的祈使式主题，如`fix:`、`chore:`、`docs:`或`balance:`。不要混合 Android 包装与无关玩法修改。修复说明应包含复现与验证；可见 UI 改动在被要求时附截图。不要提交`local.properties`、签名文件、APK/AAB、构建输出、缓存、日志或临时文件。

## Security & Configuration

不得读取、暴露或提交真实环境变量、token、密码、私钥、keystore、数据库连接串或 CI secrets；也不要把它们写入文档、回复或提交信息。`local.properties`、APK/AAB、构建输出、缓存、日志和临时文件也不得提交。认证、权限、存储完整性、签名、生产配置、计费或发布操作前，说明风险并取得明确授权。

## Agent-Specific Instructions

修改前阅读相关文件并给出简短计划。保持改动小、可审查、可回退，不覆盖用户未提交修改，不顺手重构或安装依赖。不要手改`android/app/src/main/assets/www/`；通过`sync-android-web-assets.mjs`更新它。不要自动修复、全仓格式化、编造目录/接口/命令，或未经授权执行 commit、push、deploy、publish、Release、数据库操作。

## Pre-Commit Checklist

- 检查`git status --short`。
- 检查`git diff --stat`。
- 确认只包含当前任务相关文件。
- 确认没有 secrets、APK、构建输出、缓存、日志或临时文件。
- 运行必要的验证脚本，并明确列出未运行项。
- 确认 commit、push、部署或 Release 已获得明确授权。

## Personal Knowledge Context

The user's shared long-term AI context lives at `D:\xia zai\AI project\Knowledge`.

For substantial work, read `Knowledge\AGENTS.md`, locate this project in `Knowledge\01-Projects\Repository-Index.md`, then read this project's Project Page and `AI-HANDOFF.md`. Read `CONTEXT-HISTORY.md` only when historical decisions, rejected directions, architecture rationale, prior user instructions, or redesign context matters. This repository's current files and Git state are the source of truth when they conflict with Knowledge. Follow Minimum Necessary Context; do not load the entire Vault by default.

When the user explicitly says the project/task is ready to “收工” or gives an equivalent finalization instruction, read and follow `D:\xia zai\AI project\Knowledge\02-AI\Prompts\项目收工提示词.md`. This trigger does not expand current task permissions; do not merge, deploy, force-push, resolve remote conflicts, or modify unrelated files unless separately authorized.

- 检查`git status --short`和限定范围的`git diff`。
- 确认变更只含当前任务，且不含 secrets、APK、日志、缓存或构建产物。
- 运行必要验证，并明确列出未运行项。
- 确认 commit、push 或 Release 已获明确授权。
