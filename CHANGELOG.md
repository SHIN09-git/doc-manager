# 更新记录

项目遵循轻量版本记录方式。正式发布前的更新会按日期归档，稳定后再切换为语义化版本。

## 2026-06-09

### 工程

- 修复 JSON Store 与 PostgreSQL Store 兼容 `write()` 的失败事务内存污染：mutator 现在只在草稿副本上执行，成功提交后才替换内存快照。
- 修复 PostgreSQL Store 表级 `repositoryWrite()` 的提交失败内存污染：repository 回调和事务内快照加载成功后，仍需等 commit 成功才刷新 `this.data`。
- 登录失败、登录限流、邮箱验证/密码重置限流改为先提交失败记录或系统事件，再由调用层抛出错误，避免依赖失败 mutator 的副作用。
- 支付 webhook 原始 payload 继续内部留存，但账单摘要、管理员后台、组织导出和 webhook 响应只返回脱敏摘要，避免暴露渠道回调原文。
- 邮件投递记录的公开 metadata 改为白名单字段，管理员后台和组织导出不再透出误写入的 token、reset_token 或任意 secret。
- 系统事件和最近错误的公开 metadata 增加递归敏感键脱敏，组织导出、管理员后台和错误接口不再透出 token、secret、api_key 等字段原文。
- 审计日志、AI 失败跟进记录、后台偏好、个人导出和组织导出统一接入公开转换器，公开响应会递归隐藏 metadata/preferences 中的敏感键。
- 反馈状态更新和批量处理响应改为返回公开系统事件对象，和后台反馈列表保持相同脱敏规则。
- 文档、文件夹和执笔人列表渲染时会转义本地/导入数据中的 ID，并清洗文件夹颜色值，避免旧存档或导入数据把异常属性片段拼入 DOM。
- 云端人工充值收款码图片地址和独立后台支付升级跳转新增 URL 白名单过滤，危险协议会回退为占位或拒绝打开。
- 导出与真实文件夹写入使用的文件名清洗逻辑会处理控制字符、纯空白、尾随点号/空格和 Windows 保留设备名。
- 邮箱验证和密码重置提交阶段统一未知邮箱与错误令牌的反馈，减少公开认证入口的账号枚举风险。
- 生产环境下 Cookie 认证的写请求必须带可信 `Origin` 或 `Referer`，缺失来源会返回 `missing_origin`；Bearer 调用保持可用于脚本和服务端集成。
- 生产 JSON 环境变量解析改为失败即报错：`AI_COST_RATES`、`PAYMENT_PLAN_PRICE_MAP` 和 `MANUAL_PAYMENT_PACKAGES` 填写后必须是合法 JSON 对象或数组，避免支付价格映射、人工充值套餐和成本估算静默失效。
- AI 成本估算兼容 `prompt` / `completion` 和 `*_per_token` 每 token 单价别名，同时生产示例改用明确的 `prompt_per_1k` / `completion_per_1k` 字段。
- 部署自检会复用后端人工充值套餐归一化逻辑，`MANUAL_PAYMENT_PACKAGES` 里无法识别或金额无效的套餐不会通过真实网站上线检查。
- 人工充值运行时套餐归一化同步收紧，零金额、非数字金额或非数字额度的套餐不会进入用户可提交订单列表。
- 人工充值套餐只要显式填写 `plan` 就必须是 Pro/Team 付费档，`free` 免费档不会作为可购买套餐通过运行时或部署自检。
- 正式支付 checkout 增加价格映射门禁：`PAYMENT_CHECKOUT_MODE=webhook` 必须配置强 `PAYMENT_WEBHOOK_SECRET` 和 pro/team `PAYMENT_PLAN_PRICE_MAP`，缺少映射时账单摘要不展示可购买套餐，checkout 接口返回明确配置错误。
- 备份脚本改为临时文件原子写入，重命名后立即用统一备份解析器回读校验，确认表结构和表计数后再上传对象存储。
- 管理后台用量和审计 CSV 导出新增公式注入防护，疑似公式的单元格会作为文本导出；发布清单同步包含新 CSV 模块，并补充独立单元测试。
- 静态发布脚本会从后台入口递归收集相对 ESM 依赖，避免后台继续拆模块后部署目录缺少间接依赖。
- 新增 Store 事务回归测试，覆盖 JSON Store 和 PostgreSQL Store 在 mutator 抛错、rollback 和 commit 失败后的回滚语义。

### 文档

- 重写 `WEBSITE_LAUNCH_TODO.md` 为网站上线总控 TODO，集中列出未完成工作、P0/P1/P2 优先级、项目负责人需准备的资源和推荐灰度上线路径。
- 将 `WEBSITE_LAUNCH_TODO.md` 顶部整理为上线看板，明确当前未完成工作、项目负责人 TODO、资源到位后可继续施工事项和最短上线顺序。
- 再次收口 `WEBSITE_LAUNCH_TODO.md`，改为“当前结论、未完成工作总览、你需要做的事情、我可以继续完成的事情、上线 TODO 总表、最短上线顺序”的上线作战清单。

## 2026-06-03

### 工程

- `systemEventRepository` 新增 `createSystemEvent`，独立系统事件可在 PostgreSQL Store 下直接插入 `system_events`，不用回退整库快照写回。
- `http.request.failed`、`ai.proxy.failed`、`billing.checkout.not_configured` 和 `billing.checkout.invalid_config` 已优先走 `createSystemEvent` hook；JSON Store 兼容路径保持不变。
- 补充系统事件插入 repository 与 API hook 回归测试，覆盖 HTTP 500 归档、AI/支付独立运营事件和不触发额外快照写回。
- PostgreSQL Store 新增 `systemEventRepository`，系统错误事件的后台跟进可直接更新 `system_events.metadata`，并与 `ops.error.triage` 审计保持同事务写入。
- `/api/ops/events/:id/triage` 在 Store 提供 `saveSystemEventTriage` hook 时不再回退整库 `write()`；JSON Store 兼容路径保持不变。
- 补充系统错误事件 repository 与 API hook 回归测试，覆盖 warn/error 范围限定、组织隔离、not found 错误码和不触发快照写回。

## 2026-06-02

### 工程

- PostgreSQL Store 新增 `feedbackRepository`，用户反馈创建、单条处理和批量状态流转在 PostgreSQL 下可走 `system_events` 表级事务。
- 反馈处理 repository 会保留原有反馈 metadata，并补写状态、负责人、SLA、备注、处理人和处理时间；处理审计与状态更新保持同事务写入。
- `/api/feedback`、`/api/feedback/:id/status` 和 `/api/feedback/batch-status` 在 Store 提供反馈 hook 时不再调用整库 `write()`，JSON Store 兼容路径不变。
- 补充反馈 repository 与 API hook 回归测试，确认反馈创建、单条处理和批量处理不会回退快照写入。
- PostgreSQL Store 新增 `manualPaymentRepository`，人工充值订单创建、审核状态更新、额度入账和会员开通在 PostgreSQL 下可走表级事务。
- `manual_payment_orders`、`credit_accounts`、`credit_ledger`、`organizations` 的人工确认充值变更会与对应审计和系统事件保持同事务写入，JSON Store 兼容路径不变。
- `manualPaymentService` 在 Store 提供人工充值 repository hook 时不再调用整库 `write()`，并保持原有错误码、凭证公开字段和额度流水响应契约。
- 补充人工充值 repository 与 API hook 回归测试，确认用户提交充值、管理员确认、额度到账和费用明细返回不会回退快照写入。
- PostgreSQL Store 新增 `adminPreferenceRepository`，后台审计筛选、错误筛选和反馈筛选的读写/清空在 PostgreSQL 下可走表级事务，不再依赖整库快照写回。
- `admin_preferences` 表级写入仍与旧快照写队列共享 advisory lock，并在同一事务内写入审计日志，降低灰度运营时个人偏好保存覆盖其他数据的风险。
- 补充 PostgreSQL repository 测试，覆盖后台偏好读取、插入、更新、删除和审计日志插入。
- PostgreSQL Store 新增 `opsTriageRepository`，AI 失败记录的后台跟进状态、负责人、备注和 SLA 在 PostgreSQL 下可走表级 upsert，并保持同事务审计。
- 补充 AI 失败跟进回归测试，确认 Store 提供 repository hook 时不会落回整库 `write()`。
- PostgreSQL Store 新增 `writerRepository`，执笔人档案创建、更新、软删除、版本列表和版本恢复在 PostgreSQL 下可走 `writer_profiles`/`writer_versions` 表级事务。
- 执笔人写入 repository 会把数据库唯一约束冲突统一映射为 `handle_exists`，避免软删除同名或并发同名写入变成 500。
- 补充执笔人 repository 与 API hook 回归测试，确认 Store 提供表级方法时 `/api/writers` 不再回退整库 `write()`。
- `ai_usage` 新增表级插入 repository，AI 调用用量与 `ai.chat` 审计日志在 PostgreSQL 下同事务写入，不再通过整库快照保存用量记录。
- 补充 AI 用量写入 API hook 回归测试，确认正常 AI 调用只保留额度检查写入，实际用量记录走 repository hook。
- `credit_accounts`/`credit_ledger` 新增超额 AI 调用扣减 repository，额度账户更新、扣减流水和扣减审计在 PostgreSQL 下同事务写入。
- 补充额度扣减 repository 与 API hook 回归测试，确认超额调用消耗已购额度时不再通过整库 `write()` 扣减余额。

## 2026-06-01

### 工程

- 拆出 `cloudSessionController`，让云端地址保存、状态刷新、登录、注册、退出、邮箱验证和密码重置从 `app.js` 迁移到独立模块。
- 补充云端会话控制器单元测试，覆盖事件绑定防重复、会话写入、刷新失败清理、登录/注册摘要刷新、退出重置、邮箱验证和密码重置输入校验。
- 拆出 `cloudSyncController`，让云端文档保存/拉取、执笔人保存/拉取、版本冲突处理和本地副本保留从 `app.js` 迁移到独立模块。
- 补充云端同步控制器单元测试，覆盖按钮绑定防重复、文档上传、文档拉取合并、冲突覆盖/保留副本、执笔人同步、版本映射和当前执笔人选择优先级。
- 拆出 `cloudActionsController`，让云端用量/账单刷新、人工充值订单、我的数据导出、账号删除、云端反馈和后台 hash 路由从 `app.js` 迁移到独立模块。
- 账号删除后同步清理旧账单摘要，避免退出云端后残留上一次的套餐/额度信息。
- 拆出 `featureActionController`，让云端功能地图中的文档、编辑、执笔人、PPT、账单和后台入口跳转从 `app.js` 迁移到产品模块。
- 拆出 `viewController`，让顶部接口/云端按钮、右侧标签切换、PPT/云端主视图和移动端工具落点从 `app.js` 迁移到 UI 模块。
- 拆出 `skillMentionController`，让 `@执笔人` 提及面板、筛选、插入和键盘选择从 `app.js` 迁移到执笔人模块。
- 拆出 `workspaceInitializer`，让默认文档/执笔人/文件夹、云端状态归一化和旧品牌迁移从 `app.js` 迁移到核心初始化模块。
- 拆出 `globalShortcutController`，让 `Escape` 全局关闭、`Ctrl/Cmd+S` 保存当前文档和 `Ctrl/Cmd+Z` 正文撤销从 `app.js` 迁移到 UI 模块。
- 拆出 `skillPackageController`，让执笔人说明 Markdown、规则 JSON、整包导出、导入预览确认和隐私风险确认从 `app.js` 迁移到执笔人模块。
- 拆出 `skillDetailController`，让执笔人详情抽屉事件、说明.md 脏状态、测试生成和反馈重训入口从 `app.js` 迁移到执笔人模块。
- 拆出 `importDropController`，让文件拖拽高亮、全局文件拖入路由、文档卡片拖入生成提示词和阻止浏览器误打开文件从 `app.js` 迁移到导入模块。
- 拆出 `skillTrainingController`，让执笔人训练样本读取、示范文件/执笔人包混合拖入、隐私预检和 AI 构建链路启动从 `app.js` 迁移到执笔人模块。
- 拆出 `pptSkillController`，让自定义 PPT 风格保存为执笔人的表单读取、规则 JSON 组装、提交保存和错误提示从 `app.js` 迁移到 PPT 模块。
- 拆出 `workspacePersistenceController`，让 IndexedDB 保存、localStorage 迁移兜底、存储位置文案和下载位置文案从 `app.js` 迁移到核心模块。
- 拆出 `manualPaymentService`，让人工充值订单列表、提交、审核、套餐解析和凭证公开字段从 `server/src/app.js` 迁移到后端账单模块。
- 新增 `operator` 运营只读角色，可进入独立后台查看组织运营数据、用量、审计、错误、账单和接口摘要，但不能修改组织、密钥、账单、反馈或错误跟进。
- 拆出 `cloudApiClient`，让云端 API 默认地址推导、地址归一化、组织请求头、JSON 解析和错误负载从 `app.js` 迁移到独立模块。
- 修复部署站点上旧的本地云端地址带多个尾随斜杠时不会自动替换为当前站点 `/api` 的问题。
- 补充云端 API 客户端单元测试，覆盖本地/部署地址推导、请求头、服务端错误和网络失败提示。
- 拆出 `cloudPanelRenderer`，让云端账号卡、功能地图、用量摘要、账单套餐、人工充值和收款方式展示从 `app.js` 迁移到独立模块。
- 补充云端面板渲染器单元测试，覆盖本地模式禁用态、登录态用量/账单展示、默认充值套餐、二维码/占位展示和角色/费用格式化。
- 拆出 `skillWorkbenchController`，让执笔人卡片调用、复制、启停、测试入口、说明.md 编辑保存、构建状态回写和卡片级导出/删除/取消从 `app.js` 迁移到独立模块。
- 补充执笔人工作台控制器单元测试，覆盖卡片动作、构建进度、说明.md 保存和二级入口转发。
- 拆出 `documentPanelController`，让文档侧栏新建、导入、拖拽、导出、备份、选择、复制、排序、删除和垃圾箱入口从 `app.js` 迁移到独立模块。
- 补充文档侧栏控制器单元测试，覆盖顶部按钮、拖拽导入、文档选择、卡片动作和导出错误提示。
- 拆出 `findReplaceController`，让编辑器查找、跳转、替换和匹配状态提示从 `app.js` 迁移到独立模块。
- 查找替换栏新增匹配数量和当前位置提示，例如“共 3 处”“第 2 / 共 3 处”。
- 拆出 `documentTypeController`，让文档类型下拉、自定义类型添加/编辑/删除、旧数据归一化和类型查询从 `app.js` 迁移到独立模块。
- 补充文档类型控制器单元测试，覆盖内置类型保护、旧数据 ID 去重、操作按钮状态、重复名称拦截、重命名和删除回退。

## 2026-05-31

### 工程

- 拆出 `editorContextMenuController`，让编辑器右键菜单、键盘导航、复制、删除、整理格式和插入执笔人调用名从 `app.js` 迁移到独立模块。
- 补充编辑器右键菜单控制器单元测试，覆盖主要菜单动作和键盘可访问性行为。
- 拆出 `skillBuilderModalController`，让执笔人生成弹窗、训练样本文档选择、分类自定义和基础表单同步从 `app.js` 迁移到独立模块。
- 补充执笔人生成弹窗控制器单元测试，覆盖开窗、样本添加、分类展开、事件绑定和焦点闭环。
- 同步架构文档与 TODO，更新当前 `app.js` 模块化进度。

## 2026-05-22

### 新增

- 新增“执笔人工作台”作为右侧默认入口。
- 新增执笔人卡片收缩和选中展开交互。
- 新增“生成执笔人”二级窗口。
- 新增从文档库或本地文件添加训练样本。
- 新增执笔人构建进度在卡片内展示。
- 新增垃圾箱窗口，支持恢复和彻底清除文档。
- 新增 AI 生成取消能力。
- 新增 GitHub Actions 基础 CI。

### 优化

- 点击文档后只高亮，不再改变文档顺序。
- 执笔人调用后自动切换到生成窗口并插入 `@调用名`。
- 训练样本 UI 调整为更紧凑的添加与列表布局。
- 自定义分类在选择后自动展开编辑。
- 文档导出默认使用 Word，并避免重复标题。
- PPT 生成支持更多默认风格和自动页数。
- 重写开源文档，统一项目名称和“执笔人”术语。

### 修复

- 修复构建中执笔人卡片收缩后无法看到进度的问题。
- 修复 Playwright runner 不稳定退出的问题。
- 修复搜索输入频繁触发完整重渲染的问题。
- 修复大量数据依赖 localStorage 可能超限的问题。

## 2026-05-21

### 新增

- 增加多文档执笔人构建链路：单篇分析、多篇聚合、草案生成、测试和反馈优化。
- 增加执笔人导入导出。
- 增加原生 `.pptx` 生成。
- 增加文档拖拽导入。
- 增加右键段落改写和格式整理。

### 优化

- 将项目定位从单一学校场景扩展为通用正式文档工作台。
- 将英文能力概念替换为“执笔人”。
- 增强 AI 错误提示、重试和进度展示。
