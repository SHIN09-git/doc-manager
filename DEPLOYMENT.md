# 灰度部署指南

本文档用于小团队灰度试用“摹文拟笔工作台”云端模式。

如果目标是把项目部署成可绑定域名的真实网站，先看 [WEBSITE_DEPLOYMENT.md](WEBSITE_DEPLOYMENT.md)。该文档包含域名、前端托管、后端 API、PostgreSQL、邮件、人工确认充值和 DNS 的完整准备清单。

## 运行模式

### 本地静态前端

```bash
npm install
npm run build
node e2e/serve-static.mjs
```

访问：

```text
http://127.0.0.1:4173/index.html
```

### 云端 API

```bash
npm run server:dev
```

默认地址：

```text
http://127.0.0.1:8787/api
```

## 必要环境变量

生产或灰度环境至少配置：

```bash
NODE_ENV=production
STORE_DRIVER=postgres
DATABASE_URL=postgres://user:password@host:5432/db
APP_ENCRYPTION_SECRET=replace-with-a-long-random-secret-at-least-32-chars
SESSION_SECRET=replace-with-another-long-random-secret-at-least-32-chars
CORS_ORIGIN=https://your-frontend-domain.example
SESSION_SECURE=true
AI_PROXY_MODE=live
AI_BASE_URL=https://api.openai.com/v1
PLATFORM_OPENAI_API_KEY=
ALLOW_ORGANIZATION_AI_KEYS=true
REQUEST_LOGGING=true
EMAIL_MODE=webhook
EMAIL_PROVIDER=generic-webhook
EMAIL_FROM=noreply@example.com
EMAIL_WEBHOOK_URL=https://your-mail-service.example/send
EMAIL_WEBHOOK_TOKEN=replace-with-mail-webhook-token
EMAIL_CALLBACK_TOKEN=replace-with-mail-callback-token
EMAIL_RESEND_API_KEY=
EMAIL_RESEND_ENDPOINT=https://api.resend.com/emails
APP_URL=https://your-frontend-domain.example/index.html
PAYMENT_WEBHOOK_SECRET=replace-with-payment-webhook-secret
PAYMENT_PLAN_PRICE_MAP='{"price_pro":"pro","price_team":"team"}'
PAYMENT_CHECKOUT_MODE=disabled
PAYMENT_CHECKOUT_URL=https://your-payment-provider.example/checkout
PAYMENT_SUCCESS_URL=https://your-frontend-domain.example/index.html#billing-success
PAYMENT_CANCEL_URL=https://your-frontend-domain.example/index.html#billing-cancel
BACKUP_DIR=/var/backups/mowen
BACKUP_RETENTION_DAYS=14
BACKUP_ENCRYPTION_KEY=replace-with-a-long-backup-encryption-key
BACKUP_FAILURE_WEBHOOK_URL=https://your-ops-webhook.example/backup-failed
BACKUP_FAILURE_WEBHOOK_TOKEN=replace-with-ops-webhook-token
BACKUP_OBJECT_STORAGE_MODE=disabled
BACKUP_OBJECT_STORAGE_ENDPOINT=https://s3-compatible.example
BACKUP_OBJECT_STORAGE_BUCKET=mowen-backups
BACKUP_OBJECT_STORAGE_REGION=us-east-1
BACKUP_OBJECT_STORAGE_PREFIX=production
BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID=replace-with-object-storage-access-key
BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY=replace-with-object-storage-secret-key
BACKUP_OBJECT_STORAGE_SESSION_TOKEN=
```

本地开发可以继续使用：

```bash
STORE_DRIVER=json
AI_PROXY_MODE=mock
EMAIL_MODE=log
```

生产环境必须使用 `EMAIL_MODE=webhook`。开发模式的 `EMAIL_MODE=log` 只会记录邮件投递摘要，不会输出验证码或重置码。

`AI_COST_RATES`、`PAYMENT_PLAN_PRICE_MAP` 和 `MANUAL_PAYMENT_PACKAGES` 是 JSON 环境变量。未配置时会使用默认空对象或空数组；一旦填写，启动时必须解析为正确的 JSON 对象或数组，否则服务会拒绝启动，避免支付价格映射、人工充值套餐或成本估算配置静默失效。

`AI_PROXY_MODE=live` 时必须明确 AI Key 来源并配置默认模型：如果使用平台统一 Key，填写 `PLATFORM_OPENAI_API_KEY`；如果由管理员在后台为组织保存 Key，则设置 `ALLOW_ORGANIZATION_AI_KEYS=true`；同时填写 `AI_MODEL` 作为云端代理默认模型。缺少 Key 来源或默认模型时，生产环境和上线自检都会拒绝通过，避免真实用户调用 AI 时才发现配置不完整。

如果启用 `PAYMENT_CHECKOUT_MODE=webhook`，生产环境还必须同时配置：

- `PAYMENT_CHECKOUT_URL`：支付服务商创建 checkout 的 HTTPS 地址。
- `PAYMENT_WEBHOOK_SECRET`：至少 32 位的 webhook 签名密钥。
- `PAYMENT_PLAN_PRICE_MAP`：把渠道价格 ID 映射到内部 `pro` 或 `team` 套餐。

缺少以上任一项时，生产环境会拒绝启动；运行时也不会创建没有价格 ID 映射的支付链接。

`AI_COST_RATES` 推荐按 provider、model 或 `default` 配置每千 token 单价，例如 `{"gpt-4.1-mini":{"prompt_per_1k":0.001,"completion_per_1k":0.004}}`。后端也兼容旧示例中的 `prompt` / `completion` 和 `*_per_token` 字段，并按每 token 单价换算。

`EMAIL_PROVIDER` 支持：

- `generic-webhook`：沿用项目通用 HTTP webhook，请求体由你自己的邮件服务转发。
- `resend`：直接调用 Resend Email API。需要设置 `EMAIL_RESEND_API_KEY`，`EMAIL_RESEND_ENDPOINT` 默认是 `https://api.resend.com/emails`。

邮件 webhook 会收到如下字段，可直接映射到 Resend、SendGrid、阿里云邮件推送等服务商的模板发送接口：

```json
{
  "to": "user@example.com",
  "from": "noreply@example.com",
  "template": "email_verification",
  "subject": "验证邮箱",
  "text": "纯文本正文",
  "html": "<p>HTML 正文</p>",
  "metadata": {
    "token": "一次性令牌",
    "expires_at": "2026-05-24T12:00:00.000Z",
    "app_url": "https://your-frontend-domain.example/index.html"
  }
}
```

建议在邮件服务商后台配置 `email_verification` 和 `password_reset` 两个模板。退信、限流和投递失败先由服务商后台监控；本项目会记录投递请求的 `status`、`attempts` 与错误摘要，生产环境不会把内部错误直接暴露给用户。

## Resend 邮件适配

如选择 Resend，建议配置：

```bash
EMAIL_MODE=webhook
EMAIL_PROVIDER=resend
EMAIL_FROM='摹文拟笔工作台 <noreply@your-domain.example>'
EMAIL_RESEND_API_KEY=re_xxx
EMAIL_RESEND_ENDPOINT=https://api.resend.com/emails
EMAIL_CALLBACK_TOKEN=replace-with-mail-callback-token
```

发送时本项目会向 Resend 提交：

- `from`：`EMAIL_FROM`
- `to`：用户邮箱
- `subject`：根据模板生成
- `text` / `html`：纯文本和 HTML 正文
- `tags.template`：`email_verification` 或 `password_reset`
- `tags.delivery_id`：本项目的 `email_deliveries.id`
- `Idempotency-Key`：同 `delivery_id`，用于减少重复提交影响

当前两个模板变量：

| 模板 | 变量 | 说明 |
| --- | --- | --- |
| `email_verification` | `token` | 邮箱验证一次性验证码 |
| `email_verification` | `app_url` | 前端工作台地址 |
| `email_verification` | `expires_at` | 令牌过期时间，保存在投递 metadata 中 |
| `password_reset` | `token` | 密码重置一次性验证码 |
| `password_reset` | `app_url` | 前端工作台地址 |
| `password_reset` | `expires_at` | 令牌过期时间，保存在投递 metadata 中 |

Resend 返回的 `id` 会写入投递记录 `metadata.message_id`，后续回调可按 `message_id` 或 `tags.delivery_id` 匹配。

## 邮件投递回调

邮件服务商状态回调地址：

```text
POST /api/webhooks/email
```

回调鉴权：

```text
x-email-callback-token: EMAIL_CALLBACK_TOKEN
```

也支持 `Authorization: Bearer <token>` 或 query `?token=`，但生产环境建议使用请求头。

建议回调体：

```json
{
  "delivery_id": "mail_xxx",
  "status": "delivered",
  "message_id": "provider-message-id",
  "event_id": "provider-event-id",
  "email": "user@example.com",
  "template": "email_verification"
}
```

Resend 风格回调可映射为：

```json
{
  "type": "email.bounced",
  "data": {
    "email_id": "resend-email-id",
    "to": ["user@example.com"],
    "tags": {
      "delivery_id": "mail_xxx",
      "template": "email_verification"
    },
    "bounce": {
      "message": "Mailbox unavailable"
    }
  }
}
```

支持状态：

- `sent`
- `delivered`
- `bounced`
- `failed`
- `opened`

Resend 事件映射：

- `email.sent` → `sent`
- `email.delivered` → `delivered`
- `email.bounced` / `email.complained` → `bounced`
- `email.delivery_delayed` / `email.failed` → `failed`
- `email.opened` / `email.clicked` → `opened`

匹配规则：

1. 优先使用 `delivery_id` 或 `metadata.delivery_id` 匹配。
2. 其次使用 `message_id` 匹配。
3. 最后使用 `email + template` 匹配最近一条投递。
4. 匹配失败时只写系统事件，不创建新的投递记录，避免污染运营数据。

状态更新采用单向推进：`sent`、`delivered`、`opened` 可以依次推进，`failed` 和 `bounced` 会保留为更高优先级的失败态。邮件服务商如果乱序发送后续 `opened` 或 `delivered` 回调，系统会记录 `email.delivery.callback.ignored` 事件和 `ignored_callback_status`，但不会把已失败或已退信的投递改回成功态。

管理员可以在管理后台“邮件投递”区域按邮箱、模板、状态筛选，并复制失败详情。

运营处理建议：

- `bounced`：检查邮箱是否拼写错误，必要时要求用户更换邮箱。
- `failed`：优先看服务商限流、域名认证、余额或发送策略；短时间内不要反复重试同一邮箱。
- `opened`：仅作为参考，不应作为安全验证条件。
- 未匹配回调：只记录系统事件，不创建投递记录，避免污染运营数据。

## PostgreSQL 初始化

服务启动时会执行 `server/migrations/001_initial.sql`。

当前 PostgreSQL Store 已将部分高频读写路径拆为表级 repository：

- `GET /api/usage/history`：`ai_usage`
- `GET /api/audit`：`audit_logs`
- `GET /api/documents`：`documents`
- 后台偏好：`admin_preferences`
- AI 失败跟进：`ops_triage`
- 反馈创建与处理：`system_events` 中的 `user.feedback`
- 系统错误事件跟进：`system_events.metadata`
- 独立系统事件插入：`http.request.failed`、`ai.proxy.failed`、支付 checkout 配置告警等 `system_events`
- 执笔人云端写入：`writer_profiles` / `writer_versions`
- AI 用量写入：`ai_usage`
- 额度扣减：`credit_accounts` / `credit_ledger`
- 人工确认充值：`manual_payment_orders` / `credit_accounts` / `credit_ledger` / `organizations`

JSON Store 行为保持不变。正式高并发部署前仍建议补充真实 PostgreSQL 集成测试，并继续评估邮件/支付回调事件等需要和业务状态保持同事务的 `system_events` 写入是否需要进一步拆分。

如需把本地 JSON 数据导入 PostgreSQL：

```bash
STORE_DRIVER=postgres DATABASE_URL=postgres://user:password@host:5432/db node server/scripts/import-json-to-postgres.mjs
```

## 健康检查

基础健康检查：

```text
GET /api/health
```

就绪检查：

```text
GET /api/ready
```

`/api/ready` 会检查存储驱动和关键运行状态。生产环境缺少强密钥或 CORS 配置时，服务会拒绝启动。

## 备份建议

- JSON Store：定期备份 `server/.data/db.json`，也可以运行 `npm run server:backup` 生成逻辑备份。
- PostgreSQL：使用云数据库快照或 `pg_dump` 定时备份。
- 导出文件和备份文件应加密存放，不要提交到仓库。

逻辑备份命令：

```bash
npm run server:backup
```

备份脚本会读取当前 Store，先写入同目录临时文件，再原子重命名到 `BACKUP_DIR` 的最终备份路径，并立即回读校验表结构和表计数。校验通过后才会继续上传对象存储，并按 `BACKUP_RETENTION_DAYS` 清理旧备份。脚本失败时会输出 `{ "ok": false }` 并返回非 0 退出码；如配置 `BACKUP_FAILURE_WEBHOOK_URL`，会向运维 webhook 发送最小告警信息。

默认未配置 `BACKUP_ENCRYPTION_KEY` 时，脚本继续输出明文 `.json`，便于本地开发兼容。生产环境建议配置 `BACKUP_ENCRYPTION_KEY`，脚本会输出 AES-256-GCM 加密的 `.json.gcm` 文件。生成后可以先做只读结构校验：

```bash
npm run server:backup:verify -- /path/to/mowen-backup.json
```

加密备份校验需要提供同一密钥：

```bash
BACKUP_ENCRYPTION_KEY=replace-with-a-long-backup-encryption-key npm run server:backup:verify -- /path/to/mowen-backup.json.gcm
```

如需把本地备份副本上传到 S3-compatible 对象存储，设置：

```bash
BACKUP_OBJECT_STORAGE_MODE=s3-compatible
BACKUP_OBJECT_STORAGE_ENDPOINT=https://your-s3-compatible-endpoint
BACKUP_OBJECT_STORAGE_BUCKET=mowen-backups
BACKUP_OBJECT_STORAGE_REGION=us-east-1
BACKUP_OBJECT_STORAGE_PREFIX=production
BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID=...
BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY=...
```

上传使用 path-style PUT 和 AWS Signature V4 签名。建议先在灰度桶验证权限，确认对象生命周期、加密策略和只读恢复权限后再用于生产。

恢复演练建议先在只读临时环境执行：

1. 下载最近一份备份并运行 `npm run server:backup:verify -- <backup-file>`。
2. 在临时库或临时目录恢复，不直接覆盖线上数据。
3. 检查用户、组织、文档、执笔人、用量、审计等表计数。
4. 人工确认后再制定正式恢复窗口。

正式生产环境仍建议配合数据库快照、对象存储、加密存放、失败告警和定期恢复演练。

## 支付 webhook

支付 webhook 地址：

```text
POST /api/webhooks/payments
```

请求头：

```text
x-webhook-timestamp: Unix 秒级时间戳
x-webhook-signature: HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, timestamp + "." + rawBody)
```

当前支持通用事件映射：`checkout.completed`、`subscription.created`、`subscription.updated` 会更新组织套餐，`subscription.deleted` 和 `subscription.cancelled` 会降级为 `free`。`invoice.payment_failed` 和 `refund.created` 只记录运营事件，不会自动降级。

正式接入支付渠道时，不要直接信任 webhook 里的 `plan` 字段。请使用 `PAYMENT_PLAN_PRICE_MAP` 绑定渠道价格 ID 与内部套餐：

```bash
PAYMENT_PLAN_PRICE_MAP='{"price_123_pro":"pro","price_456_team":"team"}'
```

当映射存在时，只有命中价格 ID 的事件才会升级套餐；未命中映射的事件只记录为账单事件，避免被伪造字段误改套餐。

## 支付 checkout

云端面板的“账单与套餐”区域会调用后端接口创建升级入口：

```text
POST /api/billing/checkout
```

要求：

- 用户必须已登录。
- 当前用户必须是组织 owner/admin。
- 前端只传目标 `plan`，实际价格 ID 由后端根据 `PAYMENT_PLAN_PRICE_MAP` 解析。
- `PAYMENT_CHECKOUT_MODE=disabled` 时，接口返回 `billing_checkout_not_configured`，前端显示友好提示。
- `PAYMENT_CHECKOUT_MODE=mock` 时，接口返回本地 mock checkout URL，便于灰度演示。
- `PAYMENT_CHECKOUT_MODE=webhook` 时，必须配置 `PAYMENT_CHECKOUT_URL`、`PAYMENT_WEBHOOK_SECRET` 和至少一个 `PAYMENT_PLAN_PRICE_MAP` 价格映射；缺少价格映射时，账单摘要不会展示可购买套餐，checkout 接口返回 `billing_checkout_price_not_configured`。

正式接入支付服务商时，前端仍只调用本接口，不直接拼接第三方支付链接。

## 人工确认充值

如果暂时不接真实支付渠道，可以先使用人工确认版充值：

```text
GET /api/billing/manual-orders
POST /api/billing/manual-orders
POST /api/billing/manual-orders/:id/review
```

流程：

- 用户在云端面板选择套餐，扫描微信或支付宝收款码付款，填写付款备注/凭证说明后提交订单。
- 订单进入 `pending` 状态，写入 `manual_payment_orders`。
- owner/admin 在 `admin.html` 的“账单”栏目确认或拒绝订单。
- 确认后，系统会按套餐写入 `credit_accounts` / `credit_ledger`，或更新组织 `plan` 与 `plan_expires_at`。
- AI 日限用完后，如果用户还有已购买额度，成功调用会扣减 1 点额度。
- 如果额度扣减阶段发现余额已不足，接口会返回 `credit_spend_failed`，不会把本次响应静默当作免费调用；系统会保留 `billing.credit.spend_skipped` 事件用于后台排查。

可选环境变量：

```text
MANUAL_PAYMENT_RECEIVER_NAME=你的收款主体
MANUAL_PAYMENT_WECHAT_QR_URL=https://example.com/wechat-qr.png
MANUAL_PAYMENT_ALIPAY_QR_URL=https://example.com/alipay-qr.png
MANUAL_PAYMENT_PACKAGES=[{"id":"credits_1000","title":"1000 点 AI 额度","type":"credits","amount_cny":50,"credits":1000},{"id":"pro_month","title":"Pro 月度会员","type":"plan","amount_cny":29,"plan":"pro","duration_days":30}]
```

`npm run deploy:check -- server/.env.production` 会检查人工充值套餐能否被后端识别，并要求至少存在一个金额大于 0 的有效套餐。

后端运行时也会使用同一套套餐归一化规则：零金额、非数字金额、非数字额度或无法识别的套餐不会展示给用户，也不能用于提交人工充值订单。
人工充值套餐只要显式填写 `plan`，就只能使用 `pro` 或 `team`；`free` 是系统默认免费档，不能作为付费套餐出售。

人工确认版适合微信/支付宝扫码收款、灰度售卖和小规模运营。正式商业化支付仍建议后续接入渠道签名、自动回调、退款与对账。

## 管理后台

owner/admin 登录后可以在云端面板打开“管理汇总”，进入二级管理后台。当前后台支持：

- 组织、成员、邀请概览。
- 用量和审计筛选。
- 用量和审计 CSV 导出。
- 反馈状态流转。
- 最近错误和账单事件查看、复制详情。
- 组织数据导出。
- 组织删除/停用草案创建。

组织删除/停用草案不会立即删除数据，只会写入系统事件和审计日志。

## 故障回退

云端 API 不可用时，前端仍可使用本地模式：

1. 不启用云端 AI 代理，改用本机接口配置。
2. 文档和执笔人继续保存在浏览器 IndexedDB。
3. 等云端恢复后，手动同步当前文档和当前执笔人。

## 灰度建议

- 先邀请 3 到 5 个真实用户。
- 每个组织只配置一个测试 API Key。
- 每天查看“用量”和“最近错误”。
- 引导用户通过云端面板提交内测反馈。
