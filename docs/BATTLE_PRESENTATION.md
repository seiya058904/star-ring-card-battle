# 战斗表现层

本轮基于 main `72fd9f0f4e6ba06b6b5ef3b9070dfc39a8a59a95`。目标是提高角色辨识、舞台构图、动作重量与信息可读性，保留六角色、固定 30 卡组、数值、规则、存储键和 Web/Android 同源结构。

## 归属

| 入口 | 职责 |
| --- | --- |
| `index.html` | 原引擎、规则接入、命中揭示、输入锁、权威渲染器；调用视图导演 |
| `js/battle-presentation.js` | 六角色素材、舞台动作、元素 Canvas 轨迹、局部冲击、回合提示、结算装饰；只拥有视图状态 |
| `assets/ui/battle-presentation.css` | 从原 final style 原位迁出；末段拥有新构图与动作；速度覆盖仍在其后 |
| `js/audio-manager.js` | 继承音效入口，增加低音量元素音色，保留静音、音量和回退 |
| `js/campaign-ui.js` | 真实意图/星环 HUD、战役节点；共鸣与进度流程沿用原实现 |
| `scripts/read-ui-source.mjs` | 将真实外部样式原位展开给既有静态验证读取 |

引擎规则没有迁移或重新实现。`fixed-game-rules.js` 仅将舞台背景 URL 改为文档基准解析，避免外部 CSS 使路径变成 `assets/ui/assets/...`。导演的计时器与 Web Animations 在离开舞台时取消，并用原有 state/session 判定拒绝陈旧回调。

## 素材与动作

`assets/units/heroes-v2/characters.png` 为一次生成的透明 3×2 六角色图集；`PROMPT.txt` 与 `manifest.json` 保留来源。运行时使用各格 alpha 边界裁切后的无损 WebP。原单位、背景、卡图和图集未删除。

不再克隆大卡遮住战场或生成大量随机粒子。蓄势与出手发生在角色，轨迹沿双方实际 DOM 坐标，命中在目标局部。治疗、护盾、异常状态与召唤分别有动作；数值与完整状态文案仍由原结果对象/渲染器产生。

低动画修正了高级卡/特殊卡“命中晚于演出结束”的时序问题：按既有低档总时长等比缩放阶段，命中在输入恢复前发生。未改变伤害结算、AI、费用或既有总时长。

## 确定性兼容边界

原粒子生成器每粒调用共享战斗 RNG 七次，粒子数取决于动画档位。为保留同种子、同档位的 main 重放，`effectsRenderer.play` 仍推进完全相同次数；新导演本身不调用随机数。不同动画档位的历史随机序列差异仍存在，本轮未擅自迁移它。

## 验证

先建立仓库外证据目录并启动根目录 HTTP 服务：

```powershell
node scripts/verify-all.mjs
node --check js/battle-presentation.js
python scripts/verify-battle-input-layout-browser.py --url http://127.0.0.1:8000/ --out "$evidence\input"
python scripts/verify-battle-presentation-browser.py --url http://127.0.0.1:8000/ --baseline-ref 72fd9f0f4e6ba06b6b5ef3b9070dfc39a8a59a95 --out "$evidence\presentation"
node scripts/sync-android-web-assets.mjs
node scripts/verify-android-web-assets.mjs
```

新增 Node 检查覆盖六角色真实素材、Pages/Android URL、视图所有权与 15 种时序。新增浏览器检查用真实控件跑两轮战斗并对照 main 的种子、双方生命/护盾/能量、牌序、状态和统计；还检查六角色各 30 张卡组/真实出牌、键盘出牌、静音、减少动态效果、视图退出。沙盒其余固定 NPC 角色保留原样。

元素图库为明确标识的表现测试，直接调用导演；它核对引擎与随机种子完全不变，不作为真实施放该元素技能的证明。真实战役、七张手牌与模态回归使用合法卡牌和控件；不得注入战斗数值充当试玩。

### 2026-10-04 本地验收记录

| 检查 | 结果 |
| --- | --- |
| `verify-all.mjs` | 44/44 通过，含原有规则、平衡护栏、所有权与 Android parity |
| JS 语法 | 内联脚本 smoke 编译、修改的 4 个 JS 与新增 Node 辅助脚本通过 |
| 浏览器输入与布局 | 模态/陈旧回调/共鸣/七张手牌通过；9 种宽高覆盖 320×568 至 1440×1000，最后补验预览不越界且可滚动 |
| 真实种子重放 | high / standard / low 三档分别与基线 main 的两轮状态和 RNG 一致 |
| 六角色 | 独立图片加载、各 30 张卡组、合法控件出牌均通过；每次开战同时检查双方立绘已加载，交付截图使用最终服务重新抓取 |
| 普通难度战役 | 苏从第 1 至第 5 关连续胜利；回合数 2 / 1 / 1 / 15 / 62，共 182 张真实出牌，已写入测试上下文的通关进度；无控制台错误 |
| 失败与重试 | 用上述真实通关进度重新进入困难第 5 关，只结束回合，第 15 回合失败；失败印记、桌面/手机结果页与重试进入换牌均通过 |
| Android 镜像 | 58 个静态引用、190 个素材文件、10 个 JS 文件一致 |
| APK | JDK 17 / 现有 Wrapper / 离线 `assembleDebug` 成功；未更新依赖或版本号 |
| 实际 WebView | emulator-5554 同签名覆盖安装；Wi-Fi 和移动网络关闭时从 appassets 加载，真实触控出牌/敌方回合/系统返回通过；56 个请求均为本地 appassets，无 JS/资源错误；原 localStorage 与网络设置已恢复 |

本地 APK 为 `android/app/build/outputs/apk/debug/app-debug.apk`，SHA-256：

```text
F7641014E40F786B48EE80AC80AA815F1FE53C6BEB5C3B0ACD53F7EEB40D1B4D
```

签名证书 SHA-256 与模拟器原安装包一致：`a3e2fd954bfed2b6ac7a6a8d4112f4d719f80203809f9e29ff563ca6a4ac08b4`。APK 是本地验收产物；没有推送、部署或发布 Release。

静态设计检测报告 54 处提示：53 处来自继承样式（旧辉光、渐变字、低对比与历史动画定义），1 处是新增生命条宽度过渡，已移除以避免不必要的布局动画。历史定义继续服务既有首页/图鉴，未以检测器清零为由扩大重写范围。

## 保留的维护边界

历史基础 CSS 与部分未激活的动画定义仍存在。本轮只迁出活动表现样式并建立导演，不做全文件重写。图鉴与首页仍使用原有表现；Android 壳继续使用原有 1920 viewport。真机触控、扬声器听感和个人审美接受仍需人工验收。
