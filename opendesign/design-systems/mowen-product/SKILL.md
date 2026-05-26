---
name: mowen-product-design-system
description: Product design system for 摹文拟笔工作台, a local-first Chinese document, 执笔人, and PPT generation workbench. Use when changing layout, colors, spacing, controls, cards, document editor surfaces, or workflow panels in this project.
---

# 摹文拟笔产品设计系统

界面应像一套可靠的中文事务写作工作台：安静、专业、信息密度足够高，但不要像后台表格系统那样生硬。核心路径是“选择执笔人 → 输入事实 → 生成/编辑文档”。

## 视觉原则

- 背景使用冷中性纸面色，正文编辑器保持白纸感。
- 强调色使用沉稳墨绿，辅助色使用暖琥珀，只用于状态、品牌标记和少量高亮。
- 卡片圆角保持 8px，避免过度圆润和营销感。
- 用分区、阴影和间距建立层级，不用装饰性大渐变和漂浮图形。
- 组件必须保持紧凑，适合长时间整理文档和反复操作。

## 布局原则

- 桌面端保持三栏：文档库、正文编辑、执笔人/生成/PPT 工具。
- 中间编辑区是主舞台，标题和正文需要最宽、最安静。
- 右侧默认突出“执笔人”，卡片未选中时收缩，选中后展开详情。
- 小屏下优先保证编辑区可用，右侧工具进入抽屉或底部切换。

## 文案原则

- 文案克制、命令式、中文优先。
- 项目 UI 中使用“执笔人”，避免出现 skill / agent / subagent。
- 状态提示要告诉用户结果和路径，例如“已保存到：……”。

