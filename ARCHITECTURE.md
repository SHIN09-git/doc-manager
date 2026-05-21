# 架构说明

这份文档说明“摹文拟笔工作台”的代码组织、数据流和维护边界。项目当前是本地优先的静态前端应用：没有默认后端，不内置 API Key，浏览器加载打包后的 `build/bundle.js`。

## 设计目标

- 本地优先：文档、执笔人、版本和测试记录默认保存在浏览器 IndexedDB。
- 可直接打开：构建后可以通过 `file://` 打开 `index.html`，也可以由静态服务器托管。
- AI 接口可替换：通过 OpenAI 兼容 Chat Completions 接口接入模型。
- 执笔人可迭代：多篇样本文档经过分析、聚合、草案、测试、反馈和版本管理后，成为可复用写作规则。
- Office 可编辑：文档默认导出 `.docx`，PPT 生成原生 `.pptx`，避免把网页截图当成最终文件。
- 响应式可用：宽屏保留三栏工作台，窄屏把右侧功能区变为抽屉，手机使用“文档 / 编辑 / 功能”单栏切换。
- 基础键盘可达：文档列表、编辑菜单和 PPT 预览弹窗具备核心键盘导航与焦点回位。

## 运行入口

```text
index.html
  -> build/bundle.js
      -> src/main.js
          -> app.js
```

`src/main.js` 只负责加载图标和主应用。`app.js` 仍然是应用编排层，负责绑定 DOM、初始化状态、注入模块依赖和连接 EventBus；具体的垃圾箱、文档生成、PPT 面板和响应式布局交互已下沉到对应 controller。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `app.js` | 页面编排、跨模块流程、依赖注入和执笔人入口胶水层 |
| `src/config/` | 常量、默认提示词、文种和配置项 |
| `src/core/` | IndexedDB 存储、启动摘要、全局状态和 EventBus |
| `src/modules/ai/` | AI 请求、失败重试、友好错误、JSON 容错修复 |
| `src/modules/documents/` | 文档 CRUD、导入、编辑器、垃圾箱控制器、列表渲染、Word 导出 |
| `src/modules/folders/` | 标签、真实文件夹关联、File System Access API 适配 |
| `src/modules/skills/` | 执笔人管理、构建链路、规则归一化、工作台渲染 |
| `src/modules/generation/` | AI 起草、覆盖 / 插入、段落改写和 @执笔人运行时提示词 |
| `src/modules/ppt/` | PPT 面板控制器、生成提示词、结构归一化、自检、预览、PPTX 打包和风格注册表 |
| `src/ui/` | 响应式布局控制器、图标、主题、Toast、进度条 |
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

- 文档列表、正文、标签、垃圾箱状态和真实文件夹关联信息
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

删除与恢复：

```text
删除当前文档
  -> documentManager 标记 deletedAt 和 deletedFromFolderId
  -> 文档从普通列表进入右上角垃圾箱窗口
  -> 用户可单个或批量恢复到普通列表，或清除 / 清空垃圾箱
```

排序：

```text
点击文档
  -> 只更新 selectedDocId 和高亮状态
拖拽文档 / 二级菜单置顶置底
  -> documentManager 调整 state.docs 中的真实顺序
  -> persist + render doc list
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

执笔人的 AI 草案会被归一化为“执行卡”：触发说明、输入契约、结构模板、文风规则、格式规则、常用表达、执行流程、禁忌、自检清单和质量控制分区明确。文档生成阶段会通过 `buildSkillRuntimePayload` 只拼入运行时必要字段，不携带完整样本文档和冗长示例，减少上下文膨胀与隐私外泄风险。

编辑器右键菜单提供轻量调用路径：选中或定位到段落后，`editorSkillSelect` 选择执笔人，四个预设会把“保留原意 / 改文风 / 扩写 / 缩写”写入段落改写提示词，并复用同一套 `buildSkillPromptForDocumentGeneration` 运行时规则。段落改写走 `withCancelableTask`，可以取消，并复用 AI 客户端的重试和友好错误提示。

执笔人共享使用 `.skill.json` 独立包。包结构由 `skillManager.createSkillPackage` 和 `parseImportedSkillPackage` 管理，包含：

- `ruleJson`：程序调用的执笔人规则。
- `summaryMd`：给人看的说明 Markdown。
- `qualityReport` 和 `versions`：质量与版本摘要。
- `sourceDocuments`：示范文件名称、长度和导入时间摘要。

包不会导出示范文件原文。导入时会生成新的本地执笔人，并通过 `createUniqueSkillHandle` 处理 `@调用名` 冲突。

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
- 外部 `AbortController.signal` 取消
- 429、5xx、网络错误等重试
- 友好错误提示
- JSON 输出失败后的修复请求

新增 AI 链路时优先复用 `callAiWithRetry` 或 `callAiJsonWithRepair`。长耗时入口应通过 `withCancelableTask` 传入 `signal`，需要结构化输出时不要直接 `JSON.parse` 模型返回值，应走 `parseLooseJson` 或修复链路。

## 测试策略

推荐提交前运行：

```bash
npm run build
npm run check
npm test
npm run test:e2e
```

`npm run test:e2e` 通过 `e2e/run-e2e.mjs` 启动静态服务、运行 Playwright、再显式关闭服务。`playwright.config.js` 仍保留可选 webServer 配置，但在该 runner 下会通过 `PLAYWRIGHT_NO_WEBSERVER=1` 禁用，避免 Windows 或 CI 环境中 webServer 子进程托管不退出。

测试覆盖重点：

- 文件编码识别和 Office 读取
- IndexedDB 与 localStorage fallback
- AI 错误与 JSON 容错
- 文档导出标题清理
- 执笔人分析归一化
- PPTX 结构归一化和打包
- 拖拽导入和浏览器关键交互

## 当前架构风险

- `app.js` 已拆出垃圾箱、文档生成、PPT 和响应式布局 controller，但仍承担执笔人构建、导入导出、API 设置和跨模块编排。后续可继续拆出 `apiSettingsController`、`skillWorkbenchController` 和导入导出控制器。
- API Key 保存在用户浏览器环境中。开源版本适合本地使用，生产多人场景建议增加可选后端代理。
- `file://` 直开能力提高了易用性，但不同浏览器对下载、文件夹授权和模块能力的限制不同。
- Office 解析侧重文本提取和可编辑输出，不等价于完整保真排版转换。
- 执笔人质量依赖样本数量、样本一致性和模型输出质量，需要通过测试和人工校准闭环持续改进。

## 后续演进建议

1. 继续把 `app.js` 中剩余的 API 设置、执笔人工作台和导入导出流程拆为更小的 controller。
2. 为执笔人版本 diff、包格式校验和隐私预检补齐独立模块。
3. 补一份可选后端代理方案，说明如何避免 API Key 暴露在浏览器中。
4. 对大型 Office 文件增加更细的进度反馈和取消机制。
