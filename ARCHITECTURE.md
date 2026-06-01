# 架构说明

摹文拟笔工作台是一个本地优先的静态前端应用。核心目标是让文档管理、AI 起草、执笔人构建和 PPT 生成在浏览器中形成闭环，同时保持代码结构可以继续拆分和扩展。

## 总览

P0 商业化补齐后，项目包含两个运行面：

```text
Browser App
  - index.html / build/bundle.js
  - 本地文档、执笔人、PPT、编辑器和 AI 调用入口

Commercial API
  - server/src/app.js
  - 账号安全、组织、团队邀请、云端文档、云端执笔人、AI 代理、用量、审计、邮件、支付、备份和灰度反馈
  - 开发模式使用 server/.data/db.json，云端部署可切换到 PostgreSQL
```

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
| `admin.html` | 独立管理后台页面，用于 owner/admin/operator 查看运营数据 |
| `styles.css` | 设计 token、响应式布局、组件样式 |
| `app.js` | 旧逻辑兼容层、页面装配和部分控制器入口 |
| `src/main.js` | 打包入口，注册模块能力 |
| `src/core/` | 存储、事件总线、工作台状态初始化、持久化兜底、位置文案和旧数据迁移 |
| `src/admin/` | 独立后台页面脚本，不依赖主工作台 DOM |
| `src/modules/ai/` | AI 调用、重试、取消、JSON 容错和接口配置 |
| `src/modules/cloud/` | 云端 API 客户端、云端会话控制、云端文档/执笔人同步控制、云端用户操作控制、云端面板渲染、云端账单、人工充值和费用明细的前端展示格式化工具 |
| `src/modules/documents/` | 文档导入、阅读、导出、侧栏控制、垃圾箱、真实文件夹关联和自定义文档类型 |
| `src/modules/editor/` | 正文编辑器周边控制器，例如查找替换、右键菜单、键盘导航和局部编辑动作 |
| `src/modules/imports/` | 文件拖拽高亮、全局 drop 路由、文档卡片拖入生成提示词和浏览器误打开文件防护 |
| `src/modules/product/` | 产品级功能目录和功能地图入口动作控制，用于功能地图和后续内容结构统一 |
| `src/modules/skills/` | 执笔人解析、聚合、训练构建入口、工作台动作、生成弹窗、详情抽屉、`@` 提及面板、渲染、包导入导出、版本和测试 |
| `src/modules/ppt/` | PPT 素材整理、HTML 预览、原生 `.pptx` 生成和 PPT 风格执笔人保存 |
| `src/modules/storage/` | IndexedDB 与 localStorage 兼容存储 |
| `src/ui/` | 设计图标、主题、响应式布局、全局快捷键、主视图/标签切换和通用 UI 组件 |
| `src/utils/` | EventBus、DOM 工具、拖拽路由、通用函数 |
| `server/` | 商业化后端，包含账号安全、组织、团队邀请、云端同步、AI 代理、用量、审计、邮件投递、支付 webhook、人工充值服务、备份脚本和管理汇总 |
| `test/` | Node 单元测试 |
| `e2e/` | Playwright 端到端测试与静态服务 |

## 状态模型

应用状态目前主要集中在全局 `state` 对象中，并通过模块函数读写。

主要数据：

- `state.docs`：导入和生成的文档
- `state.folders`：真实文件夹与自定义标签信息
- `state.styles`：执笔人列表，内部仍沿用部分历史 `skill/style` 命名
- `state.aiConfig`：AI 接口配置
- `state.cloud`：云端登录态、组织、团队成员/邀请、同步入口和云端 AI 代理状态
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

后续重构建议继续把 `app.js` 中的页面控制逻辑迁移到更小的控制器模块。当前已完成接口设置、云端 API 客户端、云端会话控制、云端文档/执笔人同步控制、云端用户操作控制、云端面板渲染、功能地图入口动作、主视图/标签切换、全局快捷动作、导入拖拽路由、编辑器查找替换、编辑器右键菜单、文档侧栏、自定义文档类型、执笔人工作台、执笔人生成弹窗、执笔人包导入导出、执笔人详情入口、执笔人训练构建入口、PPT 执笔人保存入口、持久化/位置文案、`@` 提及面板和工作台状态初始化/旧数据迁移拆分，下一批优先继续压缩剩余页面装配函数。

## 功能内容结构

工作台的功能目录集中在 `src/modules/product/featureCatalog.js`。该目录不保存业务数据，只描述：

- 功能所属分组
- 用户看到的名称和说明
- 入口位置
- 主要产出
- 跳转动作

云端页的“功能地图”从这份目录渲染。后续新增功能时，应先补充功能目录，再接入具体 UI 和文档，避免 README、入门指南、工作台入口和后台说明各写一套。

## 云端账单边界

人工确认充值已经形成一条独立链路：

```text
用户提交充值申请
  → manual_payment_orders
  → 管理员确认 / 拒绝
  → credit_accounts / credit_ledger
  → audit_logs / system_events
  → 用户云端页和独立后台账单页
```

结构约定：

- 前端展示文案和状态格式化集中在 `src/modules/cloud/billingFormatters.js`，主工作台和独立后台共用，避免状态名、支付方式、额度流水文案分叉。
- 后端额度流水公开字段集中在 `server/src/billing/creditLedger.js`，接口只返回按组织和权限过滤后的公开字段。
- 后端人工充值订单列表、提交、审核、套餐解析和凭证公开字段集中在 `server/src/billing/manualPaymentService.js`，`server/src/app.js` 只负责路由装配和复用通用账号/审计依赖。
- `server/src/app.js` 仍负责通用路由和事务依赖装配，但新增账单子能力时应优先放入 `server/src/billing/`，再由路由调用。

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

P0 已新增可选后端代理层：`POST /api/ai/chat`。本地模式仍可直连 OpenAI 兼容接口；云端模式下，组织 API Key 在后端加密存储，AI 请求经后端代理并记录用量和审计。

P1 第一轮已补充：

- 生产环境强密钥和 CORS 校验。
- JSON Store / PostgreSQL Store 抽象，PostgreSQL 迁移草案位于 `server/migrations/001_initial.sql`。
- 组织成员邀请接口和前端团队协作入口。
- 文档与执笔人云端 `version`，用于冲突检测。
- AI 请求超时和任务类型统计。
- `free/pro/team` 套餐配额读取。

P1 第二轮和第三轮已补充：

- 邮箱验证、密码重置、登录失败节流和退出所有设备。
- PostgreSQL Store、迁移执行和 JSON 导入脚本。
- 邀请撤销、邀请重发、成员角色调整和成员移除。
- `/api/ready`、结构化请求日志、最近错误接口和 Dockerfile。
- 云端数据导出、账号删除、隐私政策草案、用户协议草案和灰度试用清单。
- 用量/审计过滤、套餐摘要、支付 webhook 占位和内测反馈入口。

P2 第一轮已补充：

- 邮件投递适配层，生产环境必须通过 HTTP webhook 邮件服务发送验证和重置邮件。
- `email_deliveries` 投递记录，保存邮件状态、重试次数和错误。
- 支付 webhook HMAC 签名、timestamp 校验、幂等处理和套餐变更。
- `GET /api/admin/dashboard` 管理汇总接口，以及前端“管理汇总”入口。
- `npm run server:backup` 逻辑备份脚本。

P2 第二轮已补充：

- 云端管理后台二级页面，用于查看组织、成员、邀请、用量、审计、反馈、错误和账单事件。
- 邮件模板集中生成和验证码/重置码申请限流。
- 支付事件适配层，区分套餐变更、取消订阅、支付失败和退款。
- 反馈状态流转。
- 组织级数据导出和组织删除/停用草案。
- `npm run server:backup:verify -- <backup-file>` 备份结构校验脚本。

P2 第三轮已补充：

- 邮件 webhook 请求体、模板字段和投递失败处理建议文档化。
- 支付事件增加渠道价格 ID 到内部套餐的 `PAYMENT_PLAN_PRICE_MAP` 映射，配置映射后不再信任 webhook 里的原始 `plan` 字段。
- 备份脚本失败时返回非 0 退出码，并支持 `BACKUP_FAILURE_WEBHOOK_URL` 告警。
- 管理后台增加反馈状态筛选、用量/审计 CSV 导出、最近错误和账单事件详情复制。
- 新增 PostgreSQL 表级 repository 拆分方案，为 P3 生产级存储改造做准备。

P2 第四轮阶段 A/B 已补充：

- `POST /api/billing/checkout`，由后端创建套餐升级入口，前端不直接拼接支付链接。
- 云端面板“账单与套餐”区域，展示当前套餐、额度、今日用量、账单事件和升级入口。
- `POST /api/webhooks/email`，通过 `EMAIL_CALLBACK_TOKEN` 接收邮件服务商投递状态回调。
- 管理后台“邮件投递”区域，支持邮箱、模板、状态筛选和复制详情。

P2 第四轮阶段 C 已补充：

- `#admin` 独立管理后台视图，保留旧管理弹窗作为兼容基础。
- 管理后台拆分为概览、成员、用量、审计、反馈、邮件、账单和错误栏目。
- 管理后台 hash 路由具备登录态和 owner/admin/operator 权限守卫。

后续增强已补充：

- 新增 `admin.html` 独立后台页，主工作台“管理后台”入口会跳转到该页面。
- `src/admin/adminPage.js` 直接调用云端 API，支持登录、刷新、分栏查看、组织名称更新、成员邀请/重发/撤销、成员角色调整、组织接口密钥保存/删除、套餐升级入口、用量摘要、审计摘要、反馈批处理、错误级别筛选、统一二次确认、导出组织数据、导出用量/审计 CSV 和创建组织删除草案；`operator` 角色只能查看运营数据和保存个人后台偏好，写操作仍限定 owner/admin。
- 旧 `#admin` hash 视图保留，作为兼容入口。

P2 第四轮阶段 D 已补充：

- PostgreSQL 迁移执行器，按 `server/migrations/*.sql` 顺序执行并记录 `migration_versions`。
- `migration_versions` 独立于兼容快照表，不参与 `PostgresStore.saveAllWithClient` 的整库写回。
- `ai_usage` 只读 repository，作为表级 repository 改造试点。
- `GET /api/usage/history` 在 PostgreSQL Store 下可走 repository，JSON Store 行为保持不变。

P2 第四轮阶段 E 已补充：

- `server:backup` 支持 `BACKUP_ENCRYPTION_KEY`，配置后输出 AES-256-GCM 加密的 `.json.gcm` 备份。
- `server:backup:verify` 可识别明文 JSON 和加密备份；加密备份必须提供同一备份密钥才能做只读结构校验。
- 新增 S3-compatible 对象存储上传适配器，默认关闭，配置后使用 AWS Signature V4 上传本地备份副本。
- 未配置加密和对象存储时，原本地明文备份路径保持不变。

P2 第五轮阶段 A 已补充：

- `EMAIL_PROVIDER` 支持 `generic-webhook` 和 `resend` 两种邮件发送路径。
- Resend 适配器会直接调用 Email API，并把服务商返回的 `id` 写入投递记录 `metadata.message_id`。
- 邮件回调可识别 Resend 风格的事件名、`data.tags`、`data.email_id` 和退信错误字段。
- 部署文档补充了 `email_verification`、`password_reset` 模板变量、回调映射和运营处理建议。

P2 第五轮阶段 C 已补充：

- `audit_logs` 只读 repository，`GET /api/audit` 在 PostgreSQL Store 下优先走表级查询。
- `documents` 分页只读 repository，`GET /api/documents` 在 PostgreSQL Store 下优先走表级查询，并返回可选 `page_info`。
- `admin_preferences` 表级 repository，后台偏好读取、保存和清空在 PostgreSQL Store 下走独立事务，并与旧快照写队列共享 advisory lock。
- `ops_triage` 表级 repository，AI 失败记录的后台跟进映射在 PostgreSQL Store 下走独立 upsert，并在同一事务写审计日志。
- `ai_usage` 写入暂不切为 insert-only；在审计写入和快照事务边界拆清前，继续避免增量写被快照写覆盖。
- Repository 测试覆盖组织隔离、limit、筛选、游标分页、JSON/日期归一和迁移版本跳过重复执行。

仍需继续完成真实支付服务商 SDK、备份恢复演练、执笔人相关表的增量写 repository 和企业部署增强。

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

- 前端与核心单元测试：238 项
- 后端商业化 API 测试：60 项
- 端到端测试：30 项

重点测试对象：

- 文档拖拽路由
- 执笔人解析和构建
- 执笔人导入导出
- AI 重试与取消
- PPT 原生导出
- 垃圾箱恢复
- 响应式和关键交互
- 文档编辑快捷键保存与撤销

## 后台运营闭环

独立后台 `admin.html` 直接调用商业化 API，不依赖主工作台 DOM。当前后台运营链路包括：

- 用量：`ai_usage` 记录任务类型、token、状态和后端统一估算成本；`AI_COST_RATES` 可按 provider/model 配置价格。
- 错误：`system_events` 保存组织归属的系统事件；`ai_usage` 失败记录通过 `ops_triage` 保存跟进状态，避免污染原始用量事实；PostgreSQL Store 下 AI 失败跟进已走表级 repository 写入。
- 反馈：`user.feedback` 仍保存在 `system_events`，单条和批量状态流转都会写审计。
- 偏好：`admin_preferences` 保存后台审计筛选、错误筛选和反馈筛选，按 `organization_id + user_id` 隔离；PostgreSQL Store 下已走表级 repository 写入。
- 权限：owner/admin 可管理后台数据，operator 为运营只读角色；组织后台只返回当前组织事件，平台级 `organization_id === null` 事件预留给未来平台管理后台。

## 当前技术债

仍建议优先处理：

- 继续缩小 `app.js`，下一步优先拆出剩余页面装配函数；接口设置、云端 API 客户端、云端会话控制、云端文档/执笔人同步控制、云端用户操作控制、云端面板渲染、功能地图入口动作、主视图/标签切换、全局快捷动作、导入拖拽路由、文档侧栏、自定义文档类型、编辑器查找替换、编辑器右键菜单、执笔人工作台、执笔人生成弹窗、执笔人包导入导出、执笔人详情入口、执笔人训练构建入口、PPT 执笔人保存入口、持久化/位置文案、`@` 提及面板和工作台状态初始化/旧数据迁移已拆为独立模块，后端人工充值服务也已从总入口拆出。
- 给执笔人版本差异增加更清晰的可视化对比。
- 为导入执笔人包增加更完整的预览确认界面。
- 增加可选后端代理方案文档，便于团队部署。
- 增加更严格的本地隐私预检，减少敏感样本误发送到 AI 服务的风险。
