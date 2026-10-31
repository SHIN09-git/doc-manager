# 架构说明

更新日期：2026-10-31。本文说明当前实现；历轮施工过程见更新记录及原施工文档，不作为新增抽象层的要求。

## 运行入口

工作台使用原生 JavaScript、HTML 和 CSS，不依赖前端框架。

```text
src/main.js → app.js → src/modules/*
        esbuild 打包 ↓
index.html → build/bundle.js + workbench.css
```

`app.js` 负责状态、DOM 和控制器装配。`src/main.js` 注册图标并加载应用。修改源码后运行 `npm run build`；`index.html` 可以直接打开，也可通过本地静态服务访问。

`admin.html` 是可选云端服务的独立后台，使用 `src/admin/adminPage.js`、`styles.css` 和 `ui-refresh.css`。这些样式仍有实际调用，不能当作工作台旧样式直接删除。

项目目前按非商业用途维护。已有云端、组织和计费功能保留，但不是本地文档编辑的前置条件。

## 模块归属

| 目录 | 职责 |
| --- | --- |
| `src/core/` | 数据初始化、IndexedDB、旧存档迁移、保存队列、事件总线 |
| `src/modules/documents/` | 导入、列表、编辑保存、Word 导出、类型和垃圾箱 |
| `src/modules/editor/` | 查找替换、正文菜单、占位符清单 |
| `src/modules/folders/` | 标签、真实文件夹授权与同步 |
| `src/modules/imports/` | 文件和文档卡片的拖拽路由 |
| `src/modules/generation/` | AI 起草、原位修改、参考资料、执笔人输入表单 |
| `src/modules/skills/` | 执笔人构建、规则、版本、测试、卡片、弹窗和内置公文写作 |
| `src/modules/ppt/` | 演示稿结构、预览、逐页编辑和原生 PPTX 导出 |
| `src/modules/ai/`、`settings/` | 接口请求、取消、重试、JSON 修复及接口设置 |
| `src/modules/cloud/`、`product/` | 可选云端功能、账单展示和功能地图 |
| `src/ui/` | 图标、局部列表更新、布局、主题、视图切换、提示与进度 |
| `src/utils/` | 编码、文件解析、格式化、隐私预检和导入限制 |
| `server/src/` | 可选后端 API、账号、组织、存储、AI 代理、账单、审计和邮件 |

## 状态与保存

`state` 保存业务数据；`ui` 保存当前选择、编辑副本、撤销记录、任务控制器和预览等页面状态。

| 字段 | 内容 |
| --- | --- |
| `state.docs` | 文档；`deletedAt` 标记垃圾箱，不另建 `state.trash` |
| `state.folders` | 标签和真实文件夹的元信息；目录授权句柄单独存入 IndexedDB |
| `state.styles` | 执笔人规则、样本、测试和版本 |
| `state.customTypes` | 用户自定义文档类型 |
| `state.settings` | AI 接口与本地设置 |
| `state.cloud` | 云端会话、组织及同步状态 |
| `ui.pptDeckSpec` | 当前演示稿结构，不是持久化的项目列表 |

`workspaceInitializer.js` 在读取存档后补默认字段。内部保留 `style/skill` 名称以兼容存档和导入包，界面称“执笔人”。

`workspacePersistenceController.persist()` 返回写入结果。正常使用 IndexedDB；写入失败时尝试 localStorage，失败不能显示“已保存”。旧数据迁移、空间不足提示和备份保护保留。

保存队列只有一个正在写入的快照和一个待执行批次。待执行批次合并连续请求，开始写入时才复制最新状态；写入途中发生的修改进入下一批。`ui.persistPromise` 指向最近批次。不要把“排队成功”当作“保存成功”。

未修改的自动保存不改时间、不重存数据；手动保存仍执行写入以支持重试和真实文件夹同步。备份 v2 排除 API Key 和云端会话，恢复不覆盖云端数据。

## 渲染与事件

事件定义集中在 `src/core/eventBus.js`，由 `app.js` 绑定控制器。数据修改后调用保存，再发出需要的刷新事件；不要依赖不存在的 `PERSIST`、`RENDER_PPT` 或 `RENDER_STYLE_GRID` 事件。

文档、垃圾箱和执笔人列表共用 `src/ui/keyedList.js`：以记录 ID 复用节点，只替换展示内容变化的条目，顺序变化时移动已有节点。新增列表记录应有唯一且稳定的 ID。按钮和拖拽事件委托给列表容器，不随刷新重复绑定。

垃圾箱在打开时渲染，打开期间随数据刷新。图标只补绘新节点；日期格式化器复用实例。执笔人构建的起点、结果和失败状态保存，步骤进度只更新内存和卡片，不触发全库保存或下拉菜单刷新。

## 业务链路

文档：文件选择或拖拽 → `fileReaders.js` 解析 → 文档管理器写入 `state.docs` → 列表和编辑区。Office 文件先检查压缩包大小与条目数，Word 表格和 PPTX 文本转换为可编辑文本。Word 导出提供通用及公文版式。

起草：本次输入与参考资料 → 执笔人执行卡 → AI 请求 → 新建、覆盖或插入。覆盖和改写在返回时检查目标文档与编辑内容，防止覆盖等待期间的新修改。缺失事实使用占位符。

执笔人：单篇分析 → 多篇聚合 → 草案 → 可选反馈优化 → 三类生成测试 → 保存版本。单篇规则不能升级为强规则；混样本结构、隐私、个案事实、用户输入优先级和 JSON 校验由现有构建器与分析器负责，不为精简代码而取消这些检查。

PPT：材料与样式 → 结构化演示稿 → HTML 预览和逐页编辑 → `pptxgenjs` 导出。当前仍与主工作台一起打包，以保留直接打开文件的能力。

## 可选后端

`server/src/app.js` 装配 API。开发使用 JSON Store；生产默认要求 PostgreSQL，迁移在 `server/migrations/`。部分请求仍使用整库快照，不能据现有单元测试声称已具备生产级多实例性能。

- 认证、组织权限、跨域来源和公开响应脱敏仍在后端校验。
- 文档和执笔人同步通过版本号检查冲突。
- 账单展示由 `billingFormatters.js` 统一；人工充值服务与表级写入分别在 `server/src/billing/` 和 `server/src/db/repositories/`。
- 购买额度采用调用前预留、成功结算、失败退款；审计和额度更新保留事务边界。
- 邮件、支付回调和运营记录的公开响应不包含原始密钥或令牌。
- 备份脚本支持校验、恢复演练、可选加密与对象存储。真实服务验证见部署文档。

## 构建与验证

- `npm run build`：构建内置参考资料及浏览器脚本。
- `npm run check`、`npm test`：语法及前后端单元测试。
- `npm run test:e2e`：浏览器交互回归，结束后关闭测试服务。
- `npm run perf:workbench`：独立 Chromium 性能样本，不读取真实用户数据，结束后关闭服务。
- `npm run build:static`：生成 `dist/`，收集后台模块依赖和许可文件。
- `npm run package:windows`：生成自包含 Windows 安装包。

运行约束见 [SECURITY.md](SECURITY.md)，当前待办见 [TODO.md](TODO.md)，性能数据见 [PERFORMANCE.md](PERFORMANCE.md)。
