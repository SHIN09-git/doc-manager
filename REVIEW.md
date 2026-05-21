# 代码与架构 Review

日期：2026-05-21

## 结论

P1 架构拆分已完成：垃圾箱、AI 起草 / 段落改写、响应式布局和 PPT 面板已从 `app.js` 下沉到独立 controller；右上角垃圾箱入口也补齐 `aria-expanded` 状态同步。当前项目的主要风险已从“基础控制器缺失”转为“执笔人工作台、API 设置和导入导出仍集中在 `app.js`”。

## 本轮已处理

- 新增 `src/modules/documents/trashController.js`，集中管理垃圾箱弹窗、批量恢复 / 清空、焦点回位和 `aria-expanded`。
- 新增 `src/modules/generation/generationController.js`，集中管理 AI 新建、覆盖、插入和右键段落改写的 @执笔人运行时提示词。
- 新增 `src/ui/layoutController.js`，集中管理响应式抽屉、移动端“文档 / 编辑 / 功能”切换和左右分栏拖拽。
- 新增 `src/modules/ppt/pptController.js`，集中管理 PPT 素材导入、生成、JSON 编辑预览、质量报告、放大预览和 PPTX 下载。
- `app.js` 保留依赖注入、EventBus 连接和跨模块编排，主交互逻辑进一步收敛。

## 当前发现

### 1. `app.js` 仍保留部分跨模块复杂度

严重度：中

`app.js` 已不再直接承载垃圾箱、生成、PPT 和布局细节，但执笔人构建 / 测试 / 反馈、API 设置、文件导入导出和若干编辑器菜单逻辑仍在入口文件内。继续扩展时，建议按业务边界继续迁移。

建议优先拆出：
- `skillWorkbenchController`：执笔人构建、测试、反馈、版本操作和包导入导出入口。
- `apiSettingsController`：接口设置、测试连接、清空配置和状态提示。
- `importExportController`：全局文件导入路由、工作台备份和文档导出。

### 2. 控制器之间仍依赖较多 app 注入函数

严重度：低

新 controller 通过依赖注入保持了低破坏迁移，但 `generationController` 和 `pptController` 仍需要较多 app 侧函数。后续可以把任务取消、进度、下载和运行时提示词构造进一步沉到独立 service，减少 controller 参数数量。

参考：
- [src/modules/generation/generationController.js](G:/cc/school-doc-manager/src/modules/generation/generationController.js:8)
- [src/modules/ppt/pptController.js](G:/cc/school-doc-manager/src/modules/ppt/pptController.js:1)

### 3. 执笔人包导入仍可增加预览确认

严重度：低

执笔人包导入已修复对象型 `ruleJson` 保真和超长重复 `@调用名` 去重问题，但导入前仍缺少“将要导入什么”的预览确认。后续可以在导入前展示名称、调用名、规则数量、版本数量和示范摘要数量。

## 当前验证

```bash
npm.cmd run check
npm.cmd test
npm.cmd run test:e2e
```

结果：语法检查通过，Node 单元测试 69 项通过，Playwright E2E 22 项通过且 runner 正常退出。

## 后续建议

下一轮：
- 为执笔人包导入增加格式校验、导入前预览和更友好的失败提示。
- 拆出 `skillWorkbenchController` 和 `apiSettingsController`，继续降低 `app.js` 体积。

P2：
- 增加 Issue 模板、PR 模板和 CHANGELOG。
- 补一份可选后端代理方案文档，说明多人部署时如何避免 API Key 保存在浏览器。
