# 架构说明

这份文档说明“摹文拟笔工作台”的代码组织、数据流和维护边界。项目当前是本地优先的静态前端应用：没有默认后端，不内置 API Key，浏览器加载打包后的 `build/bundle.js`。

## 设计目标

- 本地优先：文档、执笔人、版本和测试记录默认保存在浏览器 IndexedDB。
- 可直接打开：构建后可以通过 `file://` 打开 `index.html`，也可以由静态服务器托管。
- AI 接口可替换：通过 OpenAI 兼容 Chat Completions 接口接入模型。
- 执笔人可迭代：多篇样本文档经过分析、聚合、草案、测试、反馈和版本管理后，成为可复用写作规则。
- Office 可编辑：文档默认导出 `.docx`，PPT 生成原生 `.pptx`，避免把网页截图当成最终文件。

## 运行入口

```text
index.html
  -> build/bundle.js
      -> src/main.js
          -> app.js
```

`src/main.js` 只负责加载图标和主应用。`app.js` 仍然是应用编排层，负责绑定 DOM、初始化状态、注入模块依赖、连接 EventBus 和执行跨模块流程。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `app.js` | 页面编排、跨模块流程、事件绑定、AI 起草和 PPT/执笔人入口胶水层 |
| `src/config/` | 常量、默认提示词、文种和配置项 |
| `src/core/` | IndexedDB 存储、启动摘要、全局状态和 EventBus |
| `src/modules/ai/` | AI 请求、失败重试、友好错误、JSON 容错修复 |
| `src/modules/documents/` | 文档 CRUD、导入、编辑器、列表渲染、Word 导出 |
| `src/modules/folders/` | 标签、真实文件夹关联、File System Access API 适配 |
| `src/modules/skills/` | 执笔人管理、构建链路、规则归一化、工作台渲染 |
| `src/modules/ppt/` | PPT 生成提示词、结构归一化、自检、预览、PPTX 打包和风格注册表 |
| `src/ui/` | 图标、主题、Toast、进度条 |
| `src/utils/` | 文件读取、编码识别、拖拽路由、格式化、校验和通用工具 |
| `test/` | Node 单元测试 |
| `e2e/` | Playwright 浏览器测试 |

## 状态与渲染

应用主状态保存在 `state` 对象，界面瞬时状态保存在 `ui` 对象。业务模块通过依赖注入拿到所需能力，例如 `persist`、`eventBus`、`toast`、`getDocumentLocation` 等。

渲染更新通过 `src/core/eventBus.js` 解耦：

```text
业务模块更新 state
  -> persist()
  -> eventBus.emit(EVENTS.RENDER_*)
  -> app.js 中的渲染函数刷新对应区域
```

约定：

- 模块可以修改自己负责的数据，但不要直接操作其他模块的 DOM。
- 新增跨模块 UI 更新时，优先新增或复用 `EVENTS`，不要让模块互相直接调用渲染函数。
- EventBus 监听器必须是函数；取消订阅后会自动清理空事件槽。

## 存储模型

主存储链路：

```text
IndexedDB
  -> 写入失败时 fallback 到 localStorage
  -> storageBootstrap 保存启动摘要和 fallback 状态
```

`src/core/storage.js` 负责读写完整工作台数据，`src/core/storageBootstrap.js` 负责轻量启动摘要和旧版 localStorage 兼容恢复。

当前保存的数据包括：

- 文档列表、正文、标签和真实文件夹关联信息
- 执笔人样本、单篇分析、多篇聚合、规则 JSON、版本、测试和反馈
- AI 接口配置
- PPT 生成草稿相关界面状态只在当前会话中维护

## 文档流

导入：

```text
文件选择/拖拽
  -> importGuards 校验大小和类型
  -> fileReaders 读取 txt/md/csv/docx/pptx
  -> documentManager 创建文档
  -> persist + render
```

导出：

```text
当前文档
  -> docxExporter 去掉与标题重复的正文首行 Markdown 大标题
  -> 生成 .docx Blob
  -> 浏览器下载
```

真实文件夹关联通过 `fileSystemAdapter` 封装。该能力依赖浏览器 File System Access API，不支持时应降级为标签和普通导入导出。

## 执笔人流

执笔人构建链路位于 `src/modules/skills/skillBuilder.js`：

```text
样本文档
  -> analyzeSingleDocument
  -> aggregateDocumentAnalyses
  -> generateSkillDraft
  -> optimizeSkillWithFeedback
  -> testSkillOnGeneration
  -> createSkillVersion
```

质量原则：

- 单篇文档只能产生候选规则。
- 至少多篇样本共同验证后，规则才能进入强规则。
- 人名、时间、地点、活动名称、临时安排、一次性政策和隐私信息必须进入排除或禁止复用区域。
- 生成结果要保留规则命中检查、冲突提示和隐私过滤说明。

文档生成时，`@执笔人` 会被解析为对应规则，并拼入 AI 生成提示词。用户可见名称使用“执笔人”，内部文件和变量仍保留部分 `skill` 命名，以减少无意义破坏性重命名。

## PPT 流

PPT 生成不再输出网页 PPT，而是：

```text
用户材料 / 导入 PPTX、DOCX、文本
  -> buildGuizangPptPrompt
  -> AI 生成幻灯片 JSON
  -> parseGuizangPptSpec + normalizePptSpec
  -> inspectPptSpec 结构自检
  -> renderPptSpecPreview HTML 预览
  -> pptxBuilder 生成原生 .pptx
```

PPT 风格统一注册在 `src/modules/ppt/pptStyles.js`。新增风格时应同步提供：

- 选项元数据
- AI 风格提示词
- HTML 预览主题
- PPTX 主题色和字体
- 必要的单元测试或 E2E 覆盖

## AI 调用约定

`src/modules/ai/aiClient.js` 负责：

- OpenAI 兼容请求
- 超时控制
- 429、5xx、网络错误等重试
- 友好错误提示
- JSON 输出失败后的修复请求

新增 AI 链路时优先复用 `callAiWithRetry` 或 `callAiJsonWithRepair`。需要结构化输出时，不要直接 `JSON.parse` 模型返回值，应走 `parseLooseJson` 或修复链路。

## 测试策略

推荐提交前运行：

```bash
npm run build
npm run check
npm test
npm run test:e2e
```

测试覆盖重点：

- 文件编码识别和 Office 读取
- IndexedDB 与 localStorage fallback
- AI 错误与 JSON 容错
- 文档导出标题清理
- 执笔人分析归一化
- PPTX 结构归一化和打包
- 拖拽导入和浏览器关键交互

## 当前架构风险

- `app.js` 仍然偏大，承担了较多跨模块编排。后续可以继续拆出 `generationController`、`pptController`、`layoutController` 和 `apiSettingsController`。
- API Key 保存在用户浏览器环境中。开源版本适合本地使用，生产多人场景建议增加可选后端代理。
- `file://` 直开能力提高了易用性，但不同浏览器对下载、文件夹授权和模块能力的限制不同。
- Office 解析侧重文本提取和可编辑输出，不等价于完整保真排版转换。
- 执笔人质量依赖样本数量、样本一致性和模型输出质量，需要通过测试和人工校准闭环持续改进。

## 后续演进建议

1. 继续把 `app.js` 中的跨模块流程拆为更小的 controller。
2. 为执笔人导入/导出包、版本 diff 和隐私预检补齐独立模块。
3. 增加 GitHub Actions，自动运行 `npm run check` 和 `npm test`。
4. 补一份可选后端代理方案，说明如何避免 API Key 暴露在浏览器中。
5. 对大型 Office 文件增加更细的进度反馈和取消机制。
