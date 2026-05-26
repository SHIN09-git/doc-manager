# P2 第五轮商业化施工计划

更新时间：2026-05-24

本计划承接 `P2_ROUND4_EXECUTION_PLAN.md`。第四轮已经补齐支付升级入口、邮件投递回调、独立管理后台、PostgreSQL repository 试点和备份加固。第五轮目标是把这些“通用能力”接到更接近真实生产的运行环境中。

## 一、施工原则

- 不破坏本地优先模式，未登录和离线工作台继续完整可用。
- 真实服务商接入必须保留 mock/disabled 回退路径。
- PostgreSQL repository 扩面要逐表推进，避免快照写和增量写相互覆盖。
- 备份和恢复先在临时环境演练，不直接触碰生产数据。
- 每完成一个阶段都更新 `REVIEW.md`、`TODO.md` 和部署文档。

## 二、阶段 A：真实邮件服务商适配

目标：把当前通用邮件 webhook 请求体落到一个真实邮件服务商适配方案。

任务：

- 选择一个邮件服务商作为首个适配对象。
- 明确 `email_verification` 和 `password_reset` 模板变量。
- 补充服务商回调字段到 `POST /api/webhooks/email` 的映射示例。
- 增加退信、失败、限流的运营处理说明。

验收：

- 生产部署文档能按步骤配置邮件发送与回调。
- 回调状态能进入管理后台邮件投递列表。

阶段 A 完成记录：

- 已选择 Resend 作为首个真实邮件服务商适配对象，同时保留 `generic-webhook` 回退路径。
- 新增 `EMAIL_PROVIDER=resend`、`EMAIL_RESEND_API_KEY`、`EMAIL_RESEND_ENDPOINT` 配置，生产环境缺少必要密钥时会拒绝启动。
- Resend 发送请求已携带 `from`、`to`、`subject`、`text/html`、`tags.template`、`tags.delivery_id` 和 `Idempotency-Key`。
- Resend 返回的邮件 `id` 会写入 `email_deliveries.metadata.message_id`，便于后续回调匹配。
- `POST /api/webhooks/email` 已支持 Resend 风格的 `email.sent`、`email.delivered`、`email.bounced`、`email.complained`、`email.delivery_delayed`、`email.failed`、`email.opened`、`email.clicked`。
- `DEPLOYMENT.md` 已补充模板变量、回调映射和退信/失败/限流运营处理说明。
- 后端商业化 API 测试新增 Resend 发送适配和 Resend 风格退信回调覆盖。

## 三、阶段 B：真实支付渠道接入

目标：把 checkout 和 payment webhook 从通用适配推进到可对接真实支付渠道。

暂缓记录：按当前施工安排，阶段 B 先跳过，保留既有通用 checkout 与 HMAC payment webhook 能力，后续再选择真实支付渠道。

任务：

- 选择支付渠道。
- 后端 checkout 接入渠道创建会话接口。
- payment webhook 按渠道签名算法校验。
- `PAYMENT_PLAN_PRICE_MAP` 继续作为内部套餐的唯一映射来源。
- 增加支付成功、取消、失败、退款的灰度测试清单。

验收：

- 前端仍只调用 `POST /api/billing/checkout`。
- 未映射 price ID 不会改变组织套餐。
- webhook 重放和错误签名仍被拒绝或幂等处理。

## 四、阶段 C：PostgreSQL Repository 扩面

目标：在 `ai_usage` 只读试点基础上继续拆表级 repository。

任务：

- 新增 `audit_logs` 只读 repository，并接入 `GET /api/audit`。
- 新增 `documents` 分页只读 repository，用于后续文档列表扩展。
- 评估 `ai_usage` 写入是否可切为 insert-only repository。
- 增加 PostgreSQL 集成测试方案，至少覆盖组织隔离、limit、筛选和迁移版本。

验收：

- JSON Store 行为不变。
- PostgreSQL 查询路径和旧响应结构一致。
- 扩面的 repository 有组织隔离测试。

阶段 C 完成记录：

- 新增 `auditRepository`，提供 `listAuditByOrganization` 和 `buildAuditHistoryQuery`，支持组织隔离、日期、action、target_type 与 limit 筛选。
- `GET /api/audit` 在 PostgreSQL Store 下优先走 `audit_logs` 只读 repository，JSON Store 仍沿用原内存筛选路径。
- 新增 `documentRepository`，提供 `listDocumentsByOrganization` 和 `buildDocumentListQuery`，支持组织隔离、软删除过滤、类型、文件夹和游标分页。
- `GET /api/documents` 在 PostgreSQL Store 下优先走 `documents` 只读 repository，并返回兼容的 `documents` 字段与可选 `page_info`；JSON Store 响应保持不变。
- `ai_usage` 写入已评估：当前仍会与审计写入同处 `ctx.store.write` 快照事务中，本阶段暂不切为 insert-only，避免增量写被后续快照写覆盖。
- `server/tests/postgres-repository.test.js` 已补充 audit/documents repository 的组织隔离、筛选、分页、JSON/日期归一测试；迁移版本测试继续覆盖跳过重复迁移。
- 下一步若要切 `ai_usage` insert-only，需要先拆出 `audit_logs` insert-only 或统一事务边界，再收缩 `PostgresStore.write` 快照写回范围。

## 五、阶段 D：备份恢复演练

目标：从“能备份、能校验”推进到“能在临时环境恢复验证”。

任务：

- 编写恢复演练 runbook。
- 准备临时数据目录或临时 PostgreSQL 库的恢复步骤。
- 校验明文备份和加密备份的恢复前置条件。
- 明确对象存储只读下载、密钥保管、权限边界和保留周期。

验收：

- 文档能指导一次不覆盖生产数据的恢复演练。
- 加密备份缺少密钥时会明确失败。
- 恢复演练包含表计数和抽样检查步骤。

## 六、阶段 E：运营后台权限和可观测增强

目标：让独立管理后台更接近日常运营使用。

任务：

- 评估 owner/admin 之外的只读运营角色。
- 给管理后台补充更清晰的错误空态和加载失败提示。
- 增加后台关键操作的审计详情展示。
- 明确哪些导出动作需要二次确认。

验收：

- 普通成员仍无法访问管理数据。
- owner/admin 的导出和高风险操作有清晰提示。

阶段 E 深水区完成记录：

- 独立后台“用量”页已新增趋势条形图、估算成本和任务类型分布。
- 独立后台“审计”页已支持保存、套用和删除本地筛选。
- 反馈事件已支持状态、负责人、备注和 SLA 跟进字段，并继续写入后端事件元数据。
- 错误事件已支持状态、优先级、负责人、备注和 SLA，新增 `POST /api/ops/events/:eventId/triage` 轻量跟进接口。
- 最近错误接口补充 `id` 和 `level`，便于后台筛选、复制和工单化处理。
- 当前仍未新增 owner/admin 之外的只读运营角色；这部分留到下一轮权限模型施工。

## 七、必跑命令

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
```

涉及备份时额外运行：

```bash
npm run server:backup
npm run server:backup:verify -- <backup-file>
BACKUP_ENCRYPTION_KEY=... npm run server:backup
BACKUP_ENCRYPTION_KEY=... npm run server:backup:verify -- <encrypted-backup>
```

## 八、完成定义

- 至少一个真实邮件服务商具备可执行配置说明。
- 支付 checkout 和 webhook 具备真实渠道接入路径。
- PostgreSQL repository 从单表试点扩展到至少两个读路径。
- 备份恢复演练 runbook 完成。
- 管理后台权限和运营提示更清晰。
- 所有测试通过，文档同步更新。
