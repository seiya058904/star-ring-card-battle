# Changelog

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
