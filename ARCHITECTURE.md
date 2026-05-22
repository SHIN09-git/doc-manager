# 架构说明

摹文拟笔工作台是一个本地优先的静态前端应用。核心目标是让文档管理、AI 起草、执笔人构建和 PPT 生成在浏览器中形成闭环，同时保持代码结构可以继续拆分和扩展。

## 总览

```text
index.html
  ↓
build/bundle.js
  ↓
src/main.js
  ↓
app.js
  ↓
src/modules/*
```

`index.html` 直接加载 `build/bundle.js`。开发时修改 `src/` 和 `app.js` 后，需要执行 `npm run build` 重新生成打包文件。

## 关键目录

| 路径 | 作用 |
| --- | --- |
| `index.html` | 页面结构、主要面板和弹窗容器 |
| `styles.css` | 设计 token、响应式布局、组件样式 |
| `app.js` | 旧逻辑兼容层、页面装配和部分控制器入口 |
| `src/main.js` | 打包入口，注册模块能力 |
| `src/modules/ai/` | AI 调用、重试、取消、JSON 容错和接口配置 |
| `src/modules/documents/` | 文档导入、阅读、导出、垃圾箱、真实文件夹关联 |
| `src/modules/skills/` | 执笔人解析、聚合、生成、渲染、导入导出、版本和测试 |
| `src/modules/ppt/` | PPT 素材整理、HTML 预览和原生 `.pptx` 生成 |
| `src/modules/storage/` | IndexedDB 与 localStorage 兼容存储 |
| `src/utils/` | EventBus、DOM 工具、拖拽路由、通用函数 |
| `test/` | Node 单元测试 |
| `e2e/` | Playwright 端到端测试与静态服务 |

## 状态模型

应用状态目前主要集中在全局 `state` 对象中，并通过模块函数读写。

主要数据：

- `state.docs`：导入和生成的文档
- `state.folders`：真实文件夹与自定义标签信息
- `state.styles`：执笔人列表，内部仍沿用部分历史 `skill/style` 命名
- `state.aiConfig`：AI 接口配置
- `state.trash`：删除后的文档缓存
- `state.pptProjects`：PPT 生成项目与预览信息

持久化优先使用 IndexedDB，localStorage 作为轻量兜底和旧数据迁移入口。

## 事件总线

跨模块刷新使用 `eventBus`。常用事件包括：

- `RENDER_DOC_LIST`
- `RENDER_EDITOR`
- `RENDER_STYLE_SELECT`
- `RENDER_STYLE_LIST`
- `RENDER_STYLE_GRID`
- `RENDER_PPT`
- `PERSIST`

约定：

1. 数据变更后先更新 `state`。
2. 调用 `persist()` 保存。
3. 通过事件通知局部视图刷新。

后续重构建议继续把 `app.js` 中的页面控制逻辑迁移到更小的控制器模块。

## 文档链路

文档导入流程：

```text
本地文件 / 拖拽
  → dropRouting 判断目标
  → importService 读取内容
  → 文本、Word、PPTX、CSV 解析
  → 编码与表格转换
  → state.docs
  → 文档列表与编辑器刷新
```

文档删除不会立即彻底清除，而是进入垃圾箱。垃圾箱支持单个恢复、单个清除、全部恢复和全部清除。

导出当前文档时默认生成 `.docx`，并会避免重复导出正文中的大标题。

## 执笔人链路

执笔人是当前项目的核心模块。

### 使用页

右侧默认打开执笔人工作台。主视图是卡片列表：

- 未选中卡片只显示名称和“调用”
- 点击后展开详情和操作
- 构建中或失败状态会自动展开
- 点击“调用”会把 `@调用名` 插入生成提示词，并切换到生成窗口

### 生成页

“生成执笔人”是二级弹窗。它负责收集基础信息和训练样本，提交后立即关闭，进度回到对应卡片。

训练样本来源：

- 左侧文档库
- 本地上传文件

### AI 构建链路

核心函数：

- `analyzeSingleDocument`
- `aggregateDocumentAnalyses`
- `generateSkillDraft`
- `optimizeSkillWithFeedback`
- `testSkillOnGeneration`
- `buildSkillPromptForDocumentGeneration`

构建原则：

1. 单篇样本只产生候选规则。
2. 多篇样本共同验证后才进入强规则。
3. 隐私信息、个案事实和一次性安排需要排除。
4. 构建结果写入版本。
5. 生成测试会输出规则命中和质量报告。

内部文件和函数中仍可能出现 `skill` 命名，这是历史兼容和导入包格式需要。UI 和文档统一称为“执笔人”。

## AI 调用

AI 客户端面向 OpenAI 兼容 Chat Completions 接口。

能力包括：

- 自定义 Base URL、Endpoint Path、Model、API Key
- AbortController 取消
- 超时和限流重试
- 友好错误提示
- JSON 解析失败后的修复尝试
- 长耗时操作进度反馈

项目没有后端代理。生产或团队部署时，如果需要统一密钥、审计和限流，建议增加独立后端代理层。

## PPT 链路

PPT 生成分为两层：

1. HTML 预览：用于快速查看内容结构和视觉方向。
2. 原生 `.pptx`：使用 `pptxgenjs` 生成可编辑文件。

素材可以来自提示词、左侧文档、Word、PPTX 或拖拽文件。页数可以手动指定，也可以根据内容自动估算。

## 响应式与可访问性

当前布局策略：

- 桌面：左文档栏 + 中编辑区 + 右工具区
- 中等屏幕：右侧工具区可折叠
- 小屏幕：文档、编辑、工具切换为单屏视图

已补充的键盘能力：

- 文档列表上下选择和回车打开
- 编辑器右键菜单方向键导航和 Esc 关闭
- PPT 放大预览焦点陷阱

## 测试

命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
```

当前覆盖：

- 单元测试：78 项
- 端到端测试：25 项

重点测试对象：

- 文档拖拽路由
- 执笔人解析和构建
- 执笔人导入导出
- AI 重试与取消
- PPT 原生导出
- 垃圾箱恢复
- 响应式和关键交互

## 当前技术债

仍建议优先处理：

- 继续缩小 `app.js`，把执笔人弹窗、接口设置和文档管理控制器拆出。
- 给执笔人版本差异增加更清晰的可视化对比。
- 为导入执笔人包增加更完整的预览确认界面。
- 增加可选后端代理方案文档，便于团队部署。
- 增加更严格的本地隐私预检，减少敏感样本误发送到 AI 服务的风险。
