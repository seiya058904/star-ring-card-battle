# Star Ring Card Battle / 星环卡牌战场

<img width="1493" height="1054" alt="ChatGPT Image 2026年6月23日 21_22_01" src="https://github.com/user-attachments/assets/d2a8f767-5a2a-47d5-93b5-5a5f123db184" />



A dark-gold pixel fantasy card battle prototype built around a single-file web core.
It features local assets, fixed character decks, character selection, turn-based combat, card previews, skill effects, status mechanics, summon mechanics, element-themed particles, and an Android WebView wrapper for offline APK testing.

一个暗金像素奇幻风格的卡牌战斗原型，核心玩法基于单文件 Web 版本构建。
项目包含本地素材、固定角色卡组、角色选择、回合制战斗、卡牌预览、技能效果、状态机制、召唤机制、元素主题粒子特效，以及用于离线 APK 测试的 Android WebView 封装版本。

---

## Online Demo / 在线试玩

You can play the latest web version here:
👉 https://seiya058904.github.io/star-ring-card-battle/

你可以通过以下地址直接体验当前版本：
👉 https://seiya058904.github.io/star-ring-card-battle/

---

## Project Status / 项目状态

This project is currently a playable prototype.

Current focus:

* Maintain a stable single-file web version.
* Keep gameplay and UI changes small and reversible.
* Preserve the fixed-character / fixed-deck design.
* Improve visual clarity, battle feedback, card layout, and Android offline packaging.
* Avoid large rewrites until the core experience is stable.

当前项目处于可运行原型阶段。

当前重点：

* 维护稳定的单文件 Web 版本。
* 采用小步、可回滚的方式修改玩法和界面。
* 保留固定角色与固定卡组的核心设计。
* 持续优化视觉表现、战斗反馈、卡牌布局和 Android 离线封装。
* 在核心体验稳定前，避免大规模重构。

---

## Features / 功能特性

### English

* Single-file web game core based on `index.html`
* Dark-gold pixel fantasy interface
* Local image assets with no external runtime dependency
* Character selection and battle preparation flow
* Fixed character decks and predefined card pools
* Turn-based card battle system
* Player and enemy turns
* Hand cards, energy costs, HP, shield, status effects, battle log, and card details
* Element-themed cards and visual effects
* Skill icons and card artwork display
* Card encyclopedia and character encyclopedia
* Status mechanics such as freeze, curse, shield, healing, and buffs
* Summon-related combat support
* Damage, healing, shield, and combat feedback animations
* Element-themed particle effects
* Android WebView wrapper for offline APK testing

### 中文

* 基于 `index.html` 的单文件 Web 游戏核心
* 暗金像素奇幻风格界面
* 使用本地图片素材，无外部运行时依赖
* 角色选择与战斗准备流程
* 固定角色卡组与预设卡池
* 回合制卡牌战斗系统
* 玩家回合与敌方回合
* 手牌、能量消耗、生命值、护盾、状态效果、战斗日志和卡牌详情
* 元素主题卡牌与视觉效果
* 技能图标与卡牌插图显示
* 卡牌图鉴与角色图鉴
* 冻结、诅咒、护盾、治疗、增益等状态机制
* 召唤物相关战斗辅助
* 伤害、治疗、护盾与战斗反馈动画
* 元素主题粒子特效
* Android WebView 离线 APK 测试封装

---

## Element Visuals / 元素视觉

The game uses different visual styles and particles for different elements:

| Element     | Visual Theme                 |
| ----------- | ---------------------------- |
| Fire / 火    | Orange-red flame effects     |
| Ice / 冰     | Light-blue frost effects     |
| Wind / 风    | Teal-green airflow effects   |
| Earth / 土   | Amber and stone-like effects |
| Thunder / 雷 | Purple-blue electric effects |
| Light / 光   | Golden holy effects          |
| Dark / 暗    | Violet shadow effects        |
| Arcane / 奥术 | Mystic energy effects        |

游戏为不同元素设计了对应的视觉风格与粒子表现：

| 元素 | 视觉主题      |
| -- | --------- |
| 火  | 橙红色火焰效果   |
| 冰  | 浅蓝色寒冰效果   |
| 风  | 青绿色气流效果   |
| 土  | 琥珀色与岩石感效果 |
| 雷  | 紫蓝色电光效果   |
| 光  | 金色圣光效果    |
| 暗  | 紫罗兰暗影效果   |
| 奥术 | 神秘能量效果    |

---

## Tech Stack / 技术栈

### Web Version / Web 版本

* HTML
* CSS
* Vanilla JavaScript
* Local PNG / JPG assets
* No web build process required
* No external runtime dependency for basic usage

### Android Wrapper / Android 封装

* Android WebView
* WebViewAssetLoader
* Kotlin
* Gradle / Android Gradle Plugin
* Local `index.html + assets/` packaged inside the APK
* No network dependency for normal offline gameplay

---

## Repository Structure / 仓库结构

```text
star-ring-card-battle/
├── index.html
├── assets/
│   ├── backgrounds/
│   ├── cards/
│   ├── skills/
│   ├── ui/
│   └── ...
├── android/
│   └── app/
│       └── src/
│           └── main/
│               └── assets/
│                   └── www/
│                       ├── index.html
│                       └── assets/
├── scripts/
│   ├── sync-android-web-assets.mjs
│   └── verify-android-web-assets.mjs
└── README.md
```

`index.html` is still the main web game file and contains the primary HTML, CSS, and JavaScript logic.
The Android project packages a copied web build under `android/app/src/main/assets/www/`.

`index.html` 仍然是 Web 游戏主体文件，包含主要的 HTML、CSS 和 JavaScript 逻辑。
Android 工程会将复制后的 Web 文件打包到 `android/app/src/main/assets/www/` 中。

---

## How to Run the Web Version / 如何运行 Web 版本

You can open `index.html` directly in a browser, but using a local static server is recommended.

可以直接用浏览器打开 `index.html`，但更推荐使用本地静态服务器。

```bash
python -m http.server 8000
```

Then visit:

```text
http://127.0.0.1:8000/
```

---

## Android Debug Build / Android 调试构建

The Android version is a WebView wrapper around the local web game.

Android 版本是对本地 Web 游戏的 WebView 封装。

Recommended steps:

```bash
node scripts/sync-android-web-assets.mjs
node scripts/verify-android-web-assets.mjs
gradle -p android assembleDebug
```

Debug APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Notes:

* The APK file should not be committed.
* Build outputs should not be committed.
* `local.properties`, signing keys, `.apk`, `.aab`, `build/`, and `.gradle/` should remain ignored.
* The debug APK is for local testing only, not formal release.

注意：

* 不要提交 APK 文件。
* 不要提交构建产物。
* `local.properties`、签名文件、`.apk`、`.aab`、`build/`、`.gradle/` 等应保持忽略。
* debug APK 仅用于本地测试，不是正式发布包。

---

## Online Preview / 在线预览

The project is deployed via GitHub Pages and can be accessed directly through the following link:

```text
https://seiya058904.github.io/star-ring-card-battle/
```

项目已通过 GitHub Pages 部署，可通过以下地址直接访问：

```text
https://seiya058904.github.io/star-ring-card-battle/
```

Make sure asset paths remain relative, such as:

```text
assets/...
```

请确保素材路径保持相对路径，例如：

```text
assets/...
```

This keeps the project compatible with local servers, GitHub Pages, and the Android WebView package.

这样可以保证项目同时兼容本地服务器、GitHub Pages 和 Android WebView 封装。

---

## Development Guidelines / 开发规范

To keep the project stable:

1. Check `git status` before making changes.
2. Keep each change small and focused.
3. Separate UI changes from gameplay logic changes when possible.
4. Avoid large rewrites unless absolutely necessary.
5. Do not change card rules, deck rules, talents, summons, or elemental counters unless the task explicitly requires it.
6. Do not mix Android wrapper changes with gameplay changes.
7. Test visual changes in the browser whenever possible.
8. Test Android changes with the packaged WebView whenever possible.
9. Verify assets after syncing the Android web copy.
10. Keep commits clear and reversible.

为了保持项目稳定：

1. 修改前先检查 `git status`。
2. 每次修改保持小范围、目标明确。
3. 尽量将 UI 修改和玩法逻辑修改分开。
4. 除非必要，不进行大规模重写。
5. 除非任务明确要求，不要修改卡牌规则、卡组规则、天赋、召唤或元素克制。
6. 不要把 Android 封装改动和玩法改动混在一起。
7. 视觉修改后尽量在浏览器中检查。
8. Android 修改后尽量在 WebView APK 中验证。
9. 同步 Android Web 资源后运行素材校验。
10. 保持提交清晰、可回滚。

---

## Useful Commands / 常用命令

Check repository status:

```bash
git status --short
```

Run local web server:

```bash
python -m http.server 8000
```

Sync Android web assets:

```bash
node scripts/sync-android-web-assets.mjs
```

Verify Android web assets:

```bash
node scripts/verify-android-web-assets.mjs
```

Build Android debug APK:

```bash
gradle -p android assembleDebug
```

---

## Current Notes / 当前备注

This project is still an experimental prototype.
The current priority is stability, visual clarity, and maintainable incremental development.

本项目仍然是实验性质的原型。
当前优先目标是稳定性、视觉清晰度，以及可维护的小步迭代。

Future improvements may include:

* Better mobile-specific layout
* More characters and cards
* More complete battle balance
* Modularized JavaScript structure
* Improved Android release packaging
* Formal app icon and signed release build

未来可以继续改进：

* 更完整的移动端专用布局
* 更多角色与卡牌
* 更完整的战斗平衡
* JavaScript 模块化
* Android 正式发布封装
* 正式应用图标与签名 release 包

---

## License / 许可

No license has been specified yet.

当前暂未指定许可证。
