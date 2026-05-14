# TODO

## 已完成

- [x] 按重构计划创建 `src/` 模块目录和 `build/` 入口目录。
- [x] 清理过期入口备份文件。
- [x] 将常量提取到 `src/config/constants.js`。
- [x] 将通用工具函数提取到 `src/utils/helpers.js`。
- [x] 将 JSON/Markdown 格式化工具提取到 `src/utils/formatters.js`。
- [x] 将验证和推断函数提取到 `src/utils/validation.js`。
- [x] 将 IndexedDB 和真实文件夹句柄存储提取到 `src/core/storage.js`。
- [x] 添加 `src/core/eventBus.js` 和 `src/core/state.js` 作为业务模块解耦基础。
- [x] 将 AI 请求、重试、友好错误和 JSON 修复链路提取到 `src/modules/ai/aiClient.js`。
- [x] 将 Toast 与 Progress UI 组件提取到 `src/ui/components/`。
- [x] 增加 `src/main.js`，并将 `index.html` 改为加载打包后的 `build/bundle.js`。
- [x] 将文档 CRUD、导入导出和当前文档选择迁移到 `src/modules/documents/documentManager.js`。
- [x] 将文档列表渲染、编辑器渲染和编辑器保存逻辑迁移到 `src/modules/documents/documentRenderer.js` 与 `documentEditor.js`。
- [x] 将文件夹/标签管理、真实文件夹导入同步和文件夹渲染迁移到 `src/modules/folders/`。
- [x] 将执笔人 CRUD、规则规范化、`@` 调用提示词和执笔人工作台渲染迁移到 `src/modules/skills/skillManager.js` 与 `skillRenderer.js`。
- [x] 将执笔人 AI 构建链路拆入 `src/modules/skills/skillBuilder.js`。
- [x] 将单篇分析、多篇聚合、强规则提升、候选规则、个案排除和质量报告归一化拆入 `src/modules/skills/skillAnalyzer.js`。
- [x] 用 `eventBus` 替代文档、文件夹、执笔人业务模块对全局重渲染函数的直接调用。
- [x] 引入 esbuild，`npm run build` 会从 `src/main.js` 生成真实的 `build/bundle.js`。
- [x] 为 `aiClient`、`storage`、`formatters`、`validation` 增加 Node 单元测试；同时补充 `skillAnalyzer` 与 `eventBus` 测试。

## 当前状态

- [x] 可以从文件夹直接打开 `index.html` 使用。
- [x] 图标组件已内置到 `build/bundle.js`，不再依赖外部 CDN。
- [x] `npm install` 可安装本地开发依赖。
- [x] `npm run build` 可生成浏览器加载的 bundle。
- [x] `npm run check` 可做入口语法检查。
- [x] `npm test` 已通过 17 项单元测试。
- [x] 浏览器烟测通过：页面加载、主题切换、生成/执笔人/接口 Tab 切换、文档与执笔人列表渲染、无横向溢出、无有意义运行时错误。
- [x] 开源前品牌文案已调整为“摹文拟笔工作台”，用户可见的英文能力命名已统一为“执笔人”。

## 后续可选增强

- 为浏览器端 CRUD、拖拽导入、查找替换和执笔人工作台补充 Playwright/E2E 测试。
- 为 File System Access API 增加可注入适配器，便于真实文件夹流程自动化测试。
- 为真实 AI 接口增加后端代理模式，避免 API Key 直接保存在浏览器。
