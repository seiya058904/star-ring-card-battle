# 星环卡牌战场仓库指南

## 权威入口与边界

- 根目录 `index.html` 是无后端 Web 游戏入口，原生 HTML/CSS/JavaScript，存档在 `localStorage`。没有 `package.json`、npm 构建、formatter 或 type-check 命令；不要臆造命令或全文件格式化。
- `js/` 在主内联脚本后加载，通过 `globalThis` 访问战斗/渲染/存储对象；实际顺序以 `index.html` 末尾 `<script src>` 为准。`fixed-game-rules.js` 覆写规则，`campaign-runtime.js`、`campaign-ui.js` 接入战役；改费用、回合、伤害、状态、异步结算时须检查完整覆写链。
- `assets/` 是图片、音频及素材 manifest 的权威来源，`docs/` 保留架构与美术审计。原始素材、参考图和预览图可能是唯一创作历史，不能仅因不在运行时显示而删除。
- `android/` 是 Kotlin/Gradle WebView 壳；`android/app/src/main/assets/www/` 是生成的离线镜像，禁止手改或当作重复垃圾删除。先改根网页、`js/`、`assets/`、根图标，再按需运行同步脚本。
- 保留相对 `assets/...` 路径、固定角色/30 张卡组、数值与职业/种族设定、存储键、种子随机和 Web/Android 一致性。不要顺手重构、调参或修复未授权 Bug。
- Stage 5 的 `STAGE5_BOSS_TUNING = { hp:.07, damage:.09, defense:.004, heal:.01 }` 按敌方 profile 缩放；无新证据不调整。卡面穿透比例随本次伤害在 `resolveDamage` 内换算，不能重复结算。

## 运行与验证

命令从仓库根目录执行；Node 验证零依赖，真实浏览器检查需要已安装 Chromium 的 Python Playwright。先将 `$evidence` 设置为已创建的仓库外证据目录的绝对路径。

```powershell
python -m http.server 8000
# 另一个终端运行：
node scripts/verify-all.mjs
node scripts/verify-android-web-assets.mjs
python scripts/verify-battle-input-layout-browser.py --url http://127.0.0.1:8000/ --out "$evidence"
```

- `verify-all.mjs` 聚合战斗、战役、渲染/CSS 所有权、存档、平衡护栏与 Android parity；针对小改动可选择其中相关 `scripts/verify-*.mjs`。对修改的 JS 另运行 `node --check <文件>`。
- UI/战斗/异步改动须做真实浏览器交互与控制台检查；上述浏览器回归覆盖模态输入、陈旧共鸣回调、七张手牌命中与窄/短屏布局。战役重置浏览器命令与证据约定见 `.github/workflows/reset-browser.yml`。
- Web 无编译过程；Android 资源改动在同步后验证 parity，涉及壳层或 APK 交付再构建/安装并验证真实 WebView。文档整理无需重复昂贵 APK/模拟器测试。
- 完成前运行 `git diff --check`，检查 diff/status 和关键入口/资源引用；准确报告未运行或失败的验证，不修改测试预期来掩盖问题。

## Android 与发布

```powershell
node scripts/sync-android-web-assets.mjs
node scripts/verify-android-web-assets.mjs
.\android\gradlew.bat -p android assembleDebug --no-daemon
```

- 同步脚本会写镜像；只在权威资源变更需要同步时运行。镜像 `index.html` 含 Android 专用 viewport，不要求其与根 HTML 逐字相同；由 parity 脚本判断。
- 使用 JDK 17、仓库 Gradle Wrapper；SDK/插件版本以 `android/app/build.gradle`、`android/build.gradle`、`android/settings.gradle`、`android/gradle/wrapper/gradle-wrapper.properties` 为准。现有构建使用 SDK 34，依赖变更需明确授权。
- APK 输出为 `android/app/build/outputs/apk/debug/app-debug.apk`。官方 Android 分发采用固定签名的 Debug APK；不能擅自更换签名、另建 Release 签名体系或提交 APK/密钥。安装测试时从配置读取 application id，验证启动、离线资源和返回行为；真实环境凭据不得读取或暴露。
- `.github/workflows/verify.yml` 运行语法与聚合验证；`reset-browser.yml` 对相关 PR 执行浏览器重置回归；`release.yml` 仅在版本 tag 或明确手动请求时构建 APK、校验版本及签名并发布。重建既有 Release 必须 checkout 对应 tag，不能用当前 main 覆盖历史交付。
- GitHub Pages 从 `main` 根目录发布。版本名/代码与 Release 关系以 `android/app/build.gradle` 和 README 为准；不在这里记录一次性发布状态。

## 维护与工作区卫生

- 先检查工作区与相关文件，不覆盖、stash/reset 用户已有修改。遵循相邻 JS/Kotlin 风格，不自动格式化、不引入未授权依赖或无关重构。
- 日志、截图、Python/browser 缓存和验证输出放仓库外或忽略的 `output/`；保留不明来源的个人笔记、配置和唯一历史材料。不得提交 `local.properties`、签名文件、APK/AAB、构建目录或秘密。
- 删除只针对确认可再生成且无独立价值的精确路径；不做广泛删除、历史改写或强制覆盖。提交保持单一维护目的，检查最终范围；push/部署/Release/签名等外部操作须有明确授权。
