# Star Ring Card Battle / 星环卡牌战场

A single-file HTML card battle prototype featuring a pixel-style fantasy interface, local assets, character selection, turn-based gameplay, skill effects, and element-themed visual particles.

一个单文件 HTML 卡牌战斗原型，包含像素风幻想界面、本地素材、角色选择、回合制战斗、技能效果以及元素主题粒子特效。

---

## Project Status / 项目状态

Current stable versions:

* `65a9d57` — playable UI baseline
* `6d590c1` — removed unused JavaScript code
* `b0cff98` — improved skill icon display and added element-themed particles

当前稳定版本：

* `65a9d57` — 可运行的 UI 基线版本
* `6d590c1` — 清理未使用的 JavaScript 代码
* `b0cff98` — 优化技能图标显示并加入元素主题粒子效果

This repository serves as a stable foundation for future development. It is recommended to make changes in small, manageable steps.

该仓库作为后续开发的稳定基础，建议采用小步迭代的方式进行更新和维护。

---

## Features / 功能特性

English:

* Single-file front-end project based on `index.html`
* Pixel-style fantasy user interface
* Character selection and battle preparation interface
* Turn-based card battle system
* Hand cards, resource costs, card details, battle log, and enemy status display
* Element-themed card backgrounds
* Skill icons displayed above card artwork
* Element-themed particle effects:

  * Fire: orange-red
  * Ice: light blue
  * Wind: teal green
  * Earth: amber
  * Thunder: purple-blue
  * Light: gold
  * Dark: violet
* Version control support for project maintenance

中文：

* 基于 `index.html` 的单文件前端项目
* 像素风幻想主题界面
* 角色选择与战斗准备界面
* 回合制卡牌战斗系统
* 手牌、资源消耗、卡牌详情、战斗日志和敌方状态显示
* 元素主题卡牌背景
* 技能图标覆盖于卡牌图像之上
* 元素主题粒子效果：

  * 火：橙红色
  * 冰：浅蓝色
  * 风：青绿色
  * 土：琥珀色
  * 雷：紫蓝色
  * 光：金色
  * 暗：紫罗兰色
* 支持版本管理与维护

---

## Tech Stack / 技术栈

English:

* HTML
* CSS
* Vanilla JavaScript
* Local PNG/JPG assets
* No build process required
* No external runtime dependencies for basic usage

中文：

* HTML
* CSS
* 原生 JavaScript
* 本地 PNG/JPG 素材
* 无需构建流程
* 基础运行无需额外运行时依赖

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
└── README.md
```

`index.html` currently contains the main HTML, CSS, and JavaScript code. The project remains in a prototype stage and has not yet been modularized.

`index.html` 当前包含主要的 HTML、CSS 和 JavaScript 代码。项目仍处于原型阶段，尚未进行模块化拆分。

---

## How to Run / 如何运行

English:

Open `index.html` directly in a web browser, or use a local static server.

Recommended local server:

```bash
python -m http.server 8000
```

Then visit:

```text
http://127.0.0.1:8000/
```

中文：

可以直接使用浏览器打开 `index.html`，也可以通过本地静态服务器运行项目。

推荐使用：

```bash
python -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/
```

---

## Online Preview / 在线预览

If a static hosting service is configured, the project can be accessed through the corresponding deployment URL.

如果配置了静态网站托管服务，可通过对应的部署地址访问项目。

Ensure that asset paths remain relative, such as `assets/...`, to maintain compatibility across environments.

请确保素材路径使用相对路径（如 `assets/...`），以保证不同环境下的兼容性。

---

## Development Guidelines / 开发规范

English:

To maintain project stability:

1. Check project status before making changes.
2. Keep modifications focused and incremental.
3. Save progress regularly through version control.
4. Avoid unnecessary large-scale rewrites.
5. Use UTF-8 encoding consistently.
6. Separate interface updates from gameplay logic changes when possible.
7. Test visual results after significant modifications.
8. Create backup branches before major cleanup tasks.
9. Verify functionality before removing code.
10. Maintain clear version history.

中文：

为了保持项目稳定性：

1. 修改前检查项目状态。
2. 保持修改范围清晰且渐进。
3. 定期保存开发进度。
4. 避免不必要的大规模重构。
5. 统一使用 UTF-8 编码。
6. 尽量将界面修改与逻辑修改分开处理。
7. 重要修改后进行视觉检查。
8. 大规模整理前创建备份分支。
9. 删除代码前确认功能正常。
10. 保持清晰的版本记录。

---

## Version Management / 版本管理

Example commands:

示例命令：

```bash
git checkout main
git pull
```

Use version control tools to switch between versions and synchronize updates as needed.

可根据需要使用版本管理工具切换版本并同步更新。

---

## Notes / 备注

English:

This project is an experimental game prototype focused on interface presentation and gameplay exploration. Future improvements may include optimization, modularization, and additional content.

中文：

本项目是一个实验性质的游戏原型，主要用于界面展示与玩法探索。未来可进一步进行性能优化、模块化改造以及内容扩展。

---

## License / 许可

No license has been specified at this time.

当前暂未指定许可证。
