# 商业化施工总结报告

更新时间：2026-05-24

## 2026-05-26 新增完成：人工确认版充值系统

本轮先跳过真实支付渠道 SDK，补齐可上线灰度使用的人工确认版充值闭环：

- 用户侧云端面板新增人工确认充值：选择会员/额度套餐、查看微信/支付宝收款码、填写付款备注和凭证说明并提交订单。
- 后端新增 `manual_payment_orders`、`credit_accounts`、`credit_ledger`，同时支持 JSON Store 与 PostgreSQL 迁移。
- 管理员可在独立后台“账单”栏目确认或拒绝订单；确认后自动发放 AI 额度，或开通 `pro/team` 会员并记录 `plan_expires_at`。
- AI 请求日限用完后，会优先检查已购买额度；有余额时允许继续调用，调用成功后扣减 1 点额度。
- 补充后端接口测试和独立后台端到端冒烟测试。

这条链路适合当前“用户扫码微信/支付宝付款，运营手动确认”的商业化试水方式。真实支付渠道自动回调、退款、对账和发票能力仍保留为后续支付实接任务。

## 2026-05-26 新增完成：P2 第六轮后台运营闭环

本轮完成 `P2_ROUND6_COMMERCIALIZATION_BUILD_PLAN.md` 中的后台深水区收口任务：

- 权限边界：组织后台最近错误接口不再返回平台级全局事件，跟进接口也只能处理当前组织归属数据。
- 统一跟进：系统错误与 AI 失败记录共享后台跟进体验，AI 失败记录通过 `ops_triage` 轻量映射保存状态、优先级、负责人、备注和 SLA。
- 批量处理：新增反馈批量状态接口，后台批处理不再逐条请求。
- 成本与预算：AI 用量记录由后端按 `AI_COST_RATES` 写入 `estimated_cost`，后台展示今日/本月成本和预算摘要。
- 后台偏好：审计筛选、错误筛选、反馈筛选保存到 `admin_preferences`，按组织与用户隔离，前端仍保留本地兜底。
- SLA 运营：后台概览新增 SLA 风险摘要，反馈和错误列表支持 SLA 筛选，并可复制运营日报。
- 权限细分：新增 `operator` 运营只读角色，可查看独立后台运营数据并保存个人筛选偏好，但不能修改组织、成员、接口、账单、反馈或错误跟进。
- 存储拆分：`admin_preferences` 已在 PostgreSQL Store 下改为表级 repository 读写，保存/清空后台偏好不再依赖整库快照写回。
- 存储拆分：`ops_triage` 已在 PostgreSQL Store 下改为表级 repository upsert，AI 失败记录跟进不再依赖整库快照写回。

这意味着独立后台已经从“可看数据”进入“可跟进、可批量处理、可成本观察、可只读授权、部分高频运营写入表级化”的灰度运营状态。下一阶段建议继续处理执笔人相关 PostgreSQL 写入 repository 化、真实支付渠道和真实邮件投递联调。

本报告总结“摹文拟笔工作台”近期商业化补齐工作，并列出仍未完成的事项。当前已完成 P0 最小商业化底座、P1 三轮灰度试用能力补齐，以及 P2 前四轮邮件、支付、管理后台、备份、组织治理、外部服务实接准备、PostgreSQL repository 试点、备份加固和整轮收口施工；第五轮已完成阶段 A Resend 邮件服务商适配、阶段 C PostgreSQL 只读 repository 扩面，以及阶段 E 的独立后台深水区增强。阶段 B 真实支付渠道接入暂缓。

## 一、总体进展

当前项目已经从“本地优先开源工具”推进到“具备小团队灰度试用条件”的阶段。

已具备：

- 本地模式完整可用，不登录云端也能管理文档、生成文档、构建执笔人和导出文件。
- 云端模式具备账号、组织、团队成员、文档同步、执笔人同步、AI 代理、用量统计和审计能力。
- 商业化后端具备基础安全机制、额度限制、错误观测、灰度反馈和部署说明。
- 独立后台已支持用量趋势、成本估算、审计保存筛选，以及反馈/错误的负责人、备注和 SLA 跟进。
- 下一阶段已安排 `P2_ROUND6_COMMERCIALIZATION_BUILD_PLAN.md`，重点收口运营事件权限、统一错误跟进契约、后端化成本口径和云端化后台偏好。
- 代码已通过构建、语法检查、单元测试、后端 API 测试、端到端测试和依赖审计。

最近验证结果：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：28 项通过
- 端到端测试：29 项通过
- 依赖审计：0 个漏洞

## 二、第一轮：商业化基础生产化

目标：把 P0 的“可验证后端原型”推进到更接近灰度上线的基础形态。

已完成：

- 生产环境配置校验：生产模式要求强 `APP_ENCRYPTION_SECRET`、`SESSION_SECRET` 和明确 `CORS_ORIGIN`。
- 存储抽象：新增 Store Factory，保留 JSON Store 本地开发模式。
- PostgreSQL 预留：新增 `STORE_DRIVER=postgres`、`DATABASE_URL` 和迁移草案。
- 组织成员邀请：新增成员列表、邀请列表、创建邀请和接受邀请接口。
- 邀请安全：接受邀请必须提供且匹配邀请码，邀请列表不返回 token。
- 云端同步冲突：文档和执笔人新增 `version`，前端保存时携带同步版本。
- 冲突处理：前端提供覆盖云端、另存本地副本、拉取云端三种处理方式。
- AI 任务类型：文档生成、段落改写、执笔人构建、PPT 生成等调用会携带或推断 `task_type`。
- 用量统计增强：后端支持按任务类型汇总 AI 消耗。
- 套餐配额预埋：`free/pro/team` 会影响每日用户和组织请求限制。
- 云端团队入口：前端云端面板新增成员和邀请展示。
- JSON Store 稳定性：修复写入失败后污染后续写入队列的问题。

对应文档：

- `P1_COMMERCIALIZATION_BUILD_PLAN.md`
- `REVIEW.md`
- `TODO.md`

## 三、第二轮：灰度试用能力补齐

目标：让云端模式可以支持 3 到 5 个真实用户组成小团队试用。

已完成：

- 邮箱验证：注册后生成验证令牌，敏感云端管理操作要求邮箱已验证。
- 生产安全：生产环境不在 API 响应中返回邮箱验证令牌。
- 忘记密码与重置密码：支持重置令牌、过期时间和密码更新。
- Session 安全：密码重置会清理旧 Session，用户可退出所有设备。
- 登录失败节流：连续失败会触发短时间限流。
- 团队管理增强：支持邀请撤销、邀请重发、成员角色调整和成员移除。
- 成员移除安全：成员被移除后，其云端 Session 会被清理。
- PostgreSQL 真实存储：接入 `pg`，服务启动时执行迁移。
- 数据迁移脚本：新增 JSON Store 到 PostgreSQL 的导入脚本。
- 可观测能力：新增 `/api/ready`、结构化请求日志开关和最近错误接口。
- 数据导出：支持导出当前用户自己的云端数据。
- 账号删除：支持删除云端账号并清理当前会话。
- 合规文档：新增隐私政策草案和用户协议草案。
- 部署文档：新增灰度部署指南和灰度试用清单。
- 内测反馈：云端面板新增反馈入口，后端保存到系统事件。

Review 后修复：

- PostgreSQL Store 初版快照式写回存在多实例覆盖风险，已用 PostgreSQL advisory lock 串行化写事务。
- 云端数据导出已限制为当前用户拥有的数据，避免导出同组织其他成员资料。

对应文档：

- `P1_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md`
- `DEPLOYMENT.md`
- `PRIVACY_POLICY.md`
- `TERMS_OF_SERVICE.md`
- `GRAY_RELEASE_CHECKLIST.md`

## 四、第三轮：运营与计费预埋

目标：补齐灰度期间观察、运营、套餐和付费预埋能力。

已完成：

- 组织基础设置：支持 owner/admin 修改组织名称。
- 审计记录：组织更新、成员管理、邀请操作、反馈、AI 错误等都会进入审计或系统事件。
- 用量过滤：`GET /api/usage/history` 支持 `from`、`to`、`task_type`、`status`、`limit`。
- 审计过滤：`GET /api/audit` 支持 `from`、`to`、`action`、`limit`。
- 套餐摘要：新增 `GET /api/billing/summary`，返回组织套餐、每日额度、当日用量和最近支付事件。
- 前端额度展示：云端面板展示当前套餐、个人日限和组织日限。
- 支付 webhook 占位：新增 `POST /api/webhooks/payments`。
- webhook 安全：需要共享密钥；事件按 `provider + event_id` 幂等保存。
- webhook 记录：支付事件写入 `payment_webhooks` 和系统事件。
- 运营反馈：新增 `POST /api/feedback`，前端可提交内测反馈。

Review 后修复：

- 支付 webhook 密钥比较改为哈希比较，避免直接字符串比较。
- PostgreSQL 迁移脚本补充 `alter table ... add column if not exists`，增强旧库升级兼容性。

对应文档：

- `P1_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md`
- `REVIEW.md`
- `DATABASE_SCHEMA.md`

## 五、当前已经具备的商业化能力

### 产品能力

- 文档管理、编辑、导入导出、垃圾箱和拖拽排序。
- AI 起草、插入、覆盖当前文档。
- 执笔人构建、调用、重训、版本、测试和导入导出。
- 原生 `.pptx` 生成和预览。
- 本地优先存储和备份。

### 云端能力

- 注册、登录、邮箱验证、密码重置、退出所有设备。
- 组织和成员管理。
- 云端文档和执笔人同步。
- 同步版本冲突处理。
- 组织 API Key 加密保存。
- 云端 AI 代理。
- AI 用量统计和任务类型汇总。
- 审计日志和最近错误。
- 数据导出和账号删除。
- 内测反馈收集。
- 邮件投递记录、生产邮件 webhook、签名支付 webhook、管理汇总和逻辑备份。

### 工程能力

- 前端构建和端到端测试。
- 后端 API 测试。
- JSON Store 和 PostgreSQL Store。
- 数据库迁移草案。
- JSON 到 PostgreSQL 导入脚本。
- Dockerfile 和部署说明。
- 安全与隐私文档。

## 六、P2 第一轮新增完成项

本轮在前三轮商业化底座之上，继续补齐正式上线前的基础设施：

- 邮件服务：新增邮件投递适配层，开发模式记录邮件，生产模式必须通过 HTTP webhook 邮件服务发送。
- 邮件记录：新增 `email_deliveries` 数据集，记录邮箱验证和密码重置邮件的状态、重试次数与错误。
- 支付 webhook：从共享密钥占位升级为 HMAC 签名 + timestamp 校验，拒绝过期或签名错误请求。
- 套餐变更：支付成功、订阅创建、订阅更新可更新组织 plan，订阅取消会降级为 `free`。
- 管理汇总：新增 `GET /api/admin/dashboard`，汇总组织、成员、邀请、用量、反馈、错误和支付事件。
- 备份脚本：新增 `npm run server:backup`，支持备份目录和保留天数。
- Review 修复：支付签名比较改为定时安全比较，补充普通成员禁止访问管理汇总和过期 webhook 被拒绝测试。

对应文档：

- `P2_ROUND1_COMMERCIALIZATION_BUILD_PLAN.md`
- `P2_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md`
- `DEPLOYMENT.md`
- `SECURITY.md`
- `DATABASE_SCHEMA.md`

## 七、P2 第二轮新增完成项

本轮继续补齐灰度运营能力：

- 管理后台二级页面：分区展示组织、成员、邀请、用量、审计、反馈、错误和账单事件。
- 用量和审计筛选：前端筛选对接已有后端过滤参数。
- 反馈状态流转：支持待处理、处理中、已解决和关闭。
- 邮件模板与限流：邮箱验证和密码重置邮件模板集中生成，同一邮箱短时间重复申请会被限制。
- 支付事件适配：支付成功、订阅更新、取消订阅、支付失败和退款事件归一处理。
- 备份恢复演练：新增备份结构校验脚本。
- 组织级数据治理：新增组织数据导出和删除/停用草案接口。

对应文档：

- `P2_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md`
- `P2_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md`
- `REVIEW.md`
- `TODO.md`

## 八、P2 第三轮新增完成项

本轮继续补齐外部服务实接与运维闭环：

- 邮件服务商实接说明：补充邮件 webhook 请求体、模板字段、退信/限流/失败处理建议。
- 支付价格映射：新增 `PAYMENT_PLAN_PRICE_MAP`，配置后只允许渠道价格 ID 变更内部套餐，避免伪造 `plan` 字段。
- 备份失败告警：`server:backup` 失败时返回非 0 退出码，并可发送 `BACKUP_FAILURE_WEBHOOK_URL` 告警。
- 管理后台增强：新增反馈状态筛选、用量 CSV 导出、审计 CSV 导出、错误/账单事件复制详情、高风险成员移除确认文案。
- PostgreSQL 生产级拆分方案：新增表级 repository、迁移版本、增量 SQL、兼容策略和测试策略文档。

对应文档：

- `P2_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md`
- `P2_ROUND4_COMMERCIALIZATION_BUILD_PLAN.md`
- `POSTGRES_REPOSITORY_REFACTOR_PLAN.md`
- `REVIEW.md`
- `TODO.md`

## 九、P2 第四轮阶段 A-E 新增完成项

本轮从“可灰度试用”继续推进到“可收费灰度”的关键入口：

- 支付 checkout：新增 `POST /api/billing/checkout`，由后端创建升级入口，前端不直接拼接第三方支付链接。
- 账单与套餐：云端面板展示当前套餐、额度、今日用量、账单事件和升级按钮。
- 邮件投递回调：新增 `POST /api/webhooks/email` 和 `EMAIL_CALLBACK_TOKEN`，支持 `delivered`、`bounced`、`failed`、`opened` 状态更新。
- 邮件运营筛选：管理后台支持按邮箱、模板和状态查看投递记录，并复制详情。
- 独立管理后台：新增 `#admin` 全屏管理视图，拆分概览、成员、用量、审计、反馈、邮件、账单和错误栏目。
- PostgreSQL repository 试点：新增 `migration_versions`、迁移执行器和 `ai_usage` 只读 repository，`GET /api/usage/history` 在 PostgreSQL Store 下优先走 repository。
- 备份加固：`server:backup` 支持 AES-256-GCM 加密 `.json.gcm`，`server:backup:verify` 支持明文和加密备份结构校验。
- 对象存储：新增 S3-compatible 上传配置和原生 AWS Signature V4 PUT 适配器，默认关闭，不影响本地备份。
- 收口验证：完整通过构建、检查、单元测试、端到端测试、依赖审计、备份校验和 diff 空白检查。

对应文档：

- `P2_ROUND4_COMMERCIALIZATION_BUILD_PLAN.md`
- `P2_ROUND4_EXECUTION_PLAN.md`
- `POSTGRES_REPOSITORY_REFACTOR_PLAN.md`
- `P2_ROUND5_COMMERCIALIZATION_BUILD_PLAN.md`
- `REVIEW.md`
- `TODO.md`

## 十、P2 第五轮阶段 A 新增完成项

本阶段把通用邮件投递能力推进到首个真实服务商适配：

- Resend 适配：新增 `EMAIL_PROVIDER=resend`、`EMAIL_RESEND_API_KEY`、`EMAIL_RESEND_ENDPOINT`，后端可直接调用 Resend Email API。
- 兼容回退：`EMAIL_PROVIDER=generic-webhook` 继续保留，已有自建邮件 webhook 部署不受影响。
- 模板变量：`email_verification` 与 `password_reset` 的 `token`、`app_url`、`expires_at` 已写入部署说明。
- 投递追踪：Resend 返回的 `id` 会写入 `email_deliveries.metadata.message_id`。
- 回调映射：`email.sent`、`email.delivered`、`email.bounced`、`email.complained`、`email.delivery_delayed`、`email.failed`、`email.opened`、`email.clicked` 已归一到内部投递状态。
- 运营说明：退信、失败、限流、打开事件和未匹配回调的处理建议已补充到 `DEPLOYMENT.md`。

对应文档：

- `P2_ROUND5_COMMERCIALIZATION_BUILD_PLAN.md`
- `DEPLOYMENT.md`
- `REVIEW.md`
- `TODO.md`

## 十一、P2 第五轮阶段 C 新增完成项

本阶段按计划跳过真实支付渠道，先推进 PostgreSQL repository 扩面：

- 审计只读 repository：新增 `auditRepository`，支持组织隔离、日期、action、target_type 和 limit 筛选。
- 审计接口接入：`GET /api/audit` 在 PostgreSQL Store 下优先走 `audit_logs` 表级查询，JSON Store 保持原路径。
- 文档只读 repository：新增 `documentRepository`，支持组织隔离、软删除过滤、类型、文件夹和游标分页。
- 文档接口接入：`GET /api/documents` 在 PostgreSQL Store 下优先走 `documents` 表级查询，响应保留 `documents` 并增加可选 `page_info`。
- 写入边界评估：`ai_usage` 暂不切为 insert-only，避免和现有快照式 `ctx.store.write` 混用时覆盖增量写。
- 测试补充：PostgreSQL repository 测试覆盖组织隔离、limit、筛选、分页、JSON/日期归一和迁移版本重复执行跳过。

对应文档：

- `P2_ROUND5_COMMERCIALIZATION_BUILD_PLAN.md`
- `POSTGRES_REPOSITORY_REFACTOR_PLAN.md`
- `ARCHITECTURE.md`
- `REVIEW.md`
- `TODO.md`

## 十二、独立管理后台页面新增完成项

本次把管理后台从主工作台内嵌视图进一步拆成单独网页：

- 新增 `admin.html`，可直接作为后台管理入口部署或打开。
- 新增 `src/admin/adminPage.js`，独立处理 API 地址、登录、权限检查、刷新、栏目切换和导出，不依赖主工作台 DOM。
- 后台页包含概览、成员、用量、审计、反馈、邮件、账单和错误栏目。
- 支持反馈状态流转、组织数据导出、用量/审计 CSV 导出、邮件/账单/错误详情复制和组织删除/停用草案。
- 主工作台“管理后台”入口改为跳转 `admin.html`；旧 `#admin` 视图保留兼容。
- 端到端测试新增独立后台页未登录门禁覆盖。

本轮继续把独立后台从只读观察推进到基础运营动作：

- 概览页支持修改组织名称。
- 成员页支持创建邀请、复制邀请口令、重发/撤销邀请、调整成员角色和移除成员。
- 新增“接口”栏目，支持保存和删除组织级 API Key，保持只显示 `key_hint`。
- 账单页支持读取后端可用套餐并发起 checkout 升级入口。
- 端到端测试新增正向会话冒烟覆盖，验证组织、成员、接口和账单核心动作。

随后继续补齐运营面板：

- 用量栏目提供匹配记录、成功/失败请求、总 tokens 和任务类型分布。
- 审计栏目提供动作类型、对象类型、最近记录和动作分布。
- 反馈栏目支持批量标记处理中、已解决或关闭。
- 错误栏目支持按级别筛选并复制当前错误列表。
- 成员移除、邀请撤销、接口删除和组织删除/停用草稿统一使用二次确认弹窗。

## 十三、仍未完成的工作

下面按优先级列出未完成事项。

## P0：正式商业化前必须补齐

### 1. 邮件服务商生产验证与模板完善

当前已有 HTTP webhook 邮件投递适配层、集中邮件模板、基础请求限流和 Resend 适配，生产模式不会在 API 响应中返回令牌。下一步需要用真实 Resend 账号、域名认证和服务商后台事件订阅完成联调。

需要完成：

- 在真实 Resend 账号中完成发信域名认证和 webhook 事件订阅。
- 将邮箱验证和密码重置模板在服务商后台做视觉与送达率调优。
- 增加邮件失败告警和投递后台运营流程。

### 2. 支付渠道事件适配

当前 webhook 已具备 HMAC 签名、timestamp、防重放、幂等处理和轻量支付事件适配，但还没有对接具体支付渠道 SDK 或渠道专属签名算法。

需要完成：

- 选择支付渠道。
- 按渠道签名算法或官方 SDK 验证 webhook。
- 建立渠道价格 ID 与内部 plan 的映射。
- 增加账单状态和支付失败的运营提示。

### 3. PostgreSQL Store 生产级改造

当前 PostgreSQL Store 已完成迁移版本表、`ai_usage` 历史查询、`audit_logs` 审计查询、`documents` 文档列表只读 repository，以及 `admin_preferences`、`ops_triage`、`writer_profiles`、`writer_versions` 表级读写 repository；执笔人写入、版本恢复和后台轻量运营字段已不再依赖整库快照写回。

需要完成：

- 继续评估 `recordUsage`、系统事件跟进等剩余高频写入的增量 SQL 替代方案。
- 给文档、执笔人、用量、审计等高频表增加分页查询。
- 增加 PostgreSQL 集成测试。
- 扩展多版本迁移脚本和回滚演练。

### 4. 正式管理后台增强

当前已有 `admin.html` 独立后台页，已支持组织、成员、接口和基础账单操作，适合灰度运营观察。正式商业化仍需继续补齐更细颗粒度的运营能力。

需要完成：

- 更完整的用量趋势图和成本估算。
- 审计日志高级查询和保存筛选视图。
- 错误/反馈的分派、备注、批量导出和处理 SLA。
- 套餐和账单状态深度展示。
- 管理后台权限细分和操作审计归因。

### 5. 备份恢复与告警

当前已有 `npm run server:backup` 逻辑备份脚本、保留天数配置、失败告警、结构校验脚本、加密备份和 S3-compatible 上传适配器，但还没有真实恢复演练。

需要完成：

- PostgreSQL 定时快照或 `pg_dump` 流程。
- 备份恢复演练。
- 对象存储桶生命周期、跨区复制和只读恢复权限策略。

## P1：灰度试用期间应尽快完成

### 1. 云端面板交互优化

当前云端面板功能增多，已经偏重。

建议：

- 将账号安全、团队协作、云端同步、AI 代理、数据运维拆成二级页面或分组抽屉。
- 增加更清晰的邮箱验证状态。
- 增加邀请链接复制按钮。
- 增加成员操作确认和结果提示。

### 2. 用量和审计前端筛选

后端已经支持过滤，前端还没有完整筛选 UI。

建议：

- 日期筛选。
- 任务类型筛选。
- 状态筛选。
- 审计动作筛选。
- CSV 导出。

### 3. 反馈流转

当前反馈保存为系统事件，没有状态管理。

建议：

- 反馈列表。
- 状态：待处理、处理中、已解决、关闭。
- 指派负责人。
- 导出或同步到 GitHub Issue。

### 4. 组织级数据治理

当前支持个人数据导出和账号删除，组织级治理还不完整。

建议：

- 组织数据导出。
- 组织删除申请。
- 成员离开后的数据归属规则。
- 审计日志留存策略。
- 训练样本与执笔人包的组织级删除策略。

### 5. 企业部署增强

建议：

- Docker Compose 示例。
- 反向代理示例。
- 环境变量完整校验文档。
- 日志接入平台说明。
- 对象存储或备份存储说明。

## P2：中长期商业化增强

### 1. 付费墙与套餐页

- 免费额度提示。
- 升级入口。
- 套餐对比。
- 超额提示。
- 账单页。

### 2. 团队执笔人仓库

- 团队共享执笔人。
- 执笔人权限。
- 执笔人发布、停用、回滚。
- 执笔人市场或示例库。

### 3. 文档协同

- 文档评论。
- 审稿批注。
- 段落版本历史。
- 多人编辑冲突可视化。

### 4. 更完整的合规体系

- 正式隐私政策。
- 正式用户协议。
- 数据处理协议。
- AI 生成内容免责声明。
- 数据删除 SLA。
- 安全响应流程。

### 5. 安全加固

- CSRF 防护策略。
- 更严格的 CSP。
- 邮件验证码频率限制。
- webhook 重放窗口。
- 管理后台权限细分。
- 更完整的安全测试。

## 十一、建议下一阶段路线

建议下一阶段从“正式可收费”角度切入，优先顺序如下：

1. 拆出云端管理后台二级页面。
2. 完善邮件模板、验证码限流和投递后台筛选。
3. 建立支付事件适配层，覆盖支付失败、退款、续费和取消订阅。
4. 增加备份恢复演练与备份失败告警。
5. 做组织级数据治理和组织导出。
6. 将 PostgreSQL Store 改为表级 repository。

如果目标是先灰度而不是马上收费，则建议先做：

1. 云端管理后台二级页面。
2. 用量和审计筛选 UI。
3. 反馈列表和状态流转。
4. 邮件验证码频率限制。
5. 备份校验和恢复演练。

## 十二、结论

当前项目已经具备小团队灰度试用的基础条件，但还不建议直接面向公众收费上线。

可以开始做：

- 邀请少量真实用户试用。
- 验证云端同步、执笔人构建和 AI 代理的真实使用频率。
- 收集用户反馈。
- 观察用量和错误日志。

不建议现在就做：

- 大规模开放注册。
- 正式收费。
- 承诺企业级 SLA。
- 承诺完整数据合规能力。

下一步应把“灰度试用”跑起来，同时继续补齐管理后台、邮件模板限流、支付适配、数据库生产化、组织级数据治理和备份恢复这些正式商业化必备能力。
