# 星环卡牌战场仓库指南

## 权威入口与边界
- 原生 HTML/CSS/JS 无后端游戏（根 `index.html` + `localStorage`，无 `package.json`/构建/formatter）；`js/` 按 `index.html` 末尾 `<script src>` 顺序经 `globalThis` 覆写，改战斗/费用/回合/伤害/异步结算须查完整覆写链（`fixed-game-rules.js`、`campaign-runtime.js`、`campaign-ui.js`）。
- 保留 `assets/` 原始素材/参考图与 `docs/` 审计、固定角色/30 张卡组（`js/fixed-card-library.js`）、相对 `assets/...` 路径、存储键与种子随机；不重启用退休随机生成器或清除旧自定义存储。`STAGE5_BOSS_TUNING` 无新证据不调；穿透在 `resolveDamage` 内单次换算。
- **`android/app/src/main/assets/www/` 为生成镜像，严禁手改或当作垃圾删除**：先改根网页/`js/`/`assets/`，再运行同步脚本（镜像 `index.html` 含 Android 专用 viewport，由 parity 脚本校验）。

## 运行、验证与 Android 发布
```powershell
python -m http.server 8000
node scripts/verify-all.mjs && node scripts/verify-android-web-assets.mjs
python scripts/verify-battle-input-layout-browser.py --url http://127.0.0.1:8000/ --out "$evidence"
# 同步并构建 Debug APK（JDK 17，SDK 34，依赖变更需授权）：
node scripts/sync-android-web-assets.mjs && node scripts/verify-android-web-assets.mjs
.\android\gradlew.bat -p android assembleDebug --no-daemon
```
- 改 JS 另跑 `node --check <文件>`；UI/战斗/异步须做真实浏览器检查（战役重置见 `.github/workflows/reset-browser.yml`）；证据放仓库外或忽略的 `output/`。
- 官方分发固定采用 Debug APK 签名（`android/app/build/outputs/apk/debug/app-debug.apk`），**严禁更换签名、另建 Release 签名或提交 APK/密钥/`local.properties`**；重建既有 Release 必 checkout 对应 tag。
- Android 设备调试见 `docs/ANDROID_WORKFLOW.md`（或加载全局 `android-device-workflow` skill）。

## 维护边界
- 禁 PowerShell `Set-Content` 整写 HTML；改 CSS 核对 `body.battle-mode` 层叠；游戏改动与 Android wrapper/Gradle 改动分开提交；不修改测试预期掩盖问题；推送/部署/Release/签名须获明确授权。
