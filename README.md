# ✦ Star Ring Card Battle · 星环卡牌战场

**A dark-gold fantasy card battle, built around authored characters and tactical turns.**

固定角色、元素表现、战役推进与回合制对战——一个以单页 Web 核心为基础、可在浏览器试玩的实验性卡牌游戏。

**[▶ Play in browser](https://seiya058904.github.io/star-ring-card-battle/)** · [Android release](https://github.com/seiya058904/star-ring-card-battle/releases/tag/v1.2.8) · [Battle systems](#the-battle) · [Visual design](DESIGN.md)

<img width="720" alt="Star Ring Card Battle fantasy project artwork" src="https://github.com/user-attachments/assets/01b1a661-f70b-4c07-9a1d-a1e921ba88ab" />


## The battle

The deck is authored, not procedurally invented. Choose a character, manage a hand of cards and follow the outcome across turns. A separate six-character campaign gives the matches longer context.

- **Fixed-character battles / 固定角色对战**：选择已有角色及其卡牌，不依赖玩家编辑卡库。
- **Campaign / 战役**：六名角色的战役路线，配合场景、回合规则与阶段性结算。
- **Combat systems / 战斗机制**：状态效果、召唤、元素交互与战斗日志，规则围绕固定卡组展开。
- **Visual presentation / 视觉表现**：透明角色立绘、暗金属卡框、技能轨迹、命中反馈、元素视觉及结算演出。
- **Readable controls / 操作布局**：七张手牌保留独立命中区域；支持移动适配与减少动态效果。

<details>
<summary><strong>Second original project image / 第二张原始配图</strong></summary>

<img width="720" alt="Star Ring Card Battle alternate concept artwork" src="https://github.com/user-attachments/assets/9ed0b2ab-7be1-44c2-aaa6-3f510d418fb8" />

</details>

## Play / run

**浏览器：** 直接使用 [GitHub Pages 试玩入口](https://seiya058904.github.io/star-ring-card-battle/)。本地从项目根目录运行静态服务器：

```powershell
python -m http.server 8000
```

在浏览器打开 `http://127.0.0.1:8000/`。Web 版由原生 HTML/CSS/JavaScript 和本地素材构成，不需要 npm 打包。

**Android：** 仓库提供离线 WebView 封装，正式下载及版本信息见 [v1.2.8 Release](https://github.com/seiya058904/star-ring-card-battle/releases/tag/v1.2.8)。Web 和 Android 使用相同的核心游戏资产，但各自拥有运行环境。

## Architecture

| Path | Responsibility |
| --- | --- |
| [`index.html`](index.html) | Web 游戏入口与主逻辑装配 |
| [`js/`](js/) | 规则覆写、战役运行、界面及状态逻辑 |
| [`assets/`](assets/) | 角色、卡牌、音效及视觉素材 |
| [`android/`](android/) | Android Kotlin/Gradle WebView 外壳 |
| [`docs/BATTLE_PRESENTATION.md`](docs/BATTLE_PRESENTATION.md) | 视觉表现与验收依据 |
| [`AUDIO-LICENSES.md`](AUDIO-LICENSES.md) | 音频素材来源与许可记录 |

Android 的 `app/src/main/assets/www/` 是从 Web 源同步的离线镜像，不应直接手改。

## Checks and Android parity

```powershell
# Web 侧回归
node scripts/verify-all.mjs

# 更新 Android 离线副本后验证资源一致性
node scripts/sync-android-web-assets.mjs
node scripts/verify-android-web-assets.mjs

# Android Debug 构建（需要本地 Android SDK）
.\android\gradlew.bat -p android assembleDebug
```

影响键盘焦点、选卡命中区域或移动端排版的修改，还应在实际浏览器中按 [AGENTS.md](AGENTS.md) 的指引验证。测试与产品范围以当前源代码为准，不能从项目海报推断额外玩法。

## Status and rights

本项目仍属实验性原型；对外试玩不等于完整商业发行。仓库当前**未声明项目整体开源许可证**。第三方图片、音频及其他素材应分别遵守来源与许可要求，不能从 GitHub 可见性推断可任意再利用。
