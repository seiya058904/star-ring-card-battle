# Changelog

## v1.2.3 — 2026-08-29

- 修复 ≤768px 战斗手牌交互：手牌改为原生横向滑动条、结束回合独立成行（命中测试 self）、战役意图可读；桌面 1280px+ 扇形布局不变。
- 修复卡面「无视护盾」数值（pierceAmountRatio）在最终伤害结算中不生效的问题，与描述同源同比例一次性应用。
- Stage 5 Boss 战斗平衡：按敌方 profile 缩放生命/伤害/防御/治疗，首领二阶段可经真实游玩触发；矩阵实测覆盖 su/heka × normal/hard。
- 修复存储不可用导致 fixed-game-rules 注册中断的问题；启动与运行时 localStorage 调用全部纳入安全边界。
- 修复回合开始 DOT/召唤分摊遗留 HP 显示覆写、导致玩家出牌与结束回合被锁死的问题。
- 战役结算评级文本化（不再显示 NaN）；重置进度取消返回战役弹窗；重置失败给出错误提示。
- 修复恶魔血契吸血与固定减伤叠加造成的 Stage 5 僵局问题（随伤害因子联动收敛）。
- Android 网页镜像同步；css-ownership 媒体查询计数 20→21。
## v1.2.2 — 2026-08-28

- 完成 Runtime / Visual / CSS / Responsive 架构稳定化，核心玩法与角色/卡组数值不变。
- 稳定战役运行时边界：`applyCard`、`playCard`、回合生命周期、AI 行动、状态/抽牌与战斗锁。
- 稳定视觉运行时：`renderCard`、`renderFighter`、`renderCardPreview`、`renderDuelUnit`、顶层渲染管线与特效锁。
- 完成 CSS 组件所有权收敛：battle-layout、card、Fighter HUD、Preview、Campaign HUD。
- 完成响应式/媒体查询所有权审计，并保留非阻塞的后续 CSS 清理债。
- 新增大量只读验证脚本，`verify-all` 现覆盖 31 项回归保护。
- 未引入有意的玩法、数值或视觉重设计。

## v1.1.0 — 未发布

- 新增战役模式、六名固定角色与五个首章关卡。
- 新增难度、开局换牌、星环共鸣、敌方意图、本地进度与战斗评分。
- 修复敌方行动等待逻辑，按战斗结算完成后继续行动。
- 新增本地 CC0 音效与音效设置；详细来源见 `assets/audio/AUDIO_SOURCES.md`。
- 继续保留自由沙盒模式；本版本仍为持续开发中的可玩原型。
