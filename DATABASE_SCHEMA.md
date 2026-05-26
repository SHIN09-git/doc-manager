# 商业化数据模型

开发模式可以使用文件型 JSON Store，云端部署可以使用 PostgreSQL。字段命名尽量保持两种存储兼容。

## users

- `id`
- `email`
- `name`
- `avatar_url`
- `password_hash`
- `email_verified_at`
- `created_at`
- `updated_at`
- `last_login_at`
- `disabled_at`

## migration_versions

PostgreSQL 专用迁移版本表，不进入 JSON Store，也不参与兼容快照写回。

- `id`
- `name`
- `applied_at`

## organizations

- `id`
- `name`
- `slug`
- `plan`
- `plan_expires_at`
- `created_by`
- `created_at`
- `updated_at`

## memberships

- `id`
- `organization_id`
- `user_id`
- `role`
- `created_at`

角色：

- `owner`
- `admin`
- `member`

## documents

- `id`
- `organization_id`
- `owner_id`
- `version`
- `title`
- `type`
- `folder_id`
- `content`
- `source`
- `local_id`
- `metadata`
- `created_at`
- `updated_at`
- `deleted_at`

## writer_profiles

- `id`
- `organization_id`
- `owner_id`
- `version`
- `name`
- `handle`
- `category`
- `description`
- `enabled`
- `summary_md`
- `skill_json`
- `quality_report`
- `created_at`
- `updated_at`
- `deleted_at`

## organization_invitations

- `id`
- `organization_id`
- `email`
- `role`
- `token_hash`
- `invited_by`
- `accepted_at`
- `revoked_at`
- `expires_at`
- `created_at`

## email_verifications

- `id`
- `user_id`
- `token_hash`
- `created_at`
- `expires_at`
- `used_at`

## password_resets

- `id`
- `user_id`
- `token_hash`
- `created_at`
- `expires_at`
- `used_at`

## email_deliveries

- `id`
- `user_id`
- `email`
- `template`
- `provider`
- `status`
- `attempts`
- `error`
- `metadata`
- `created_at`
- `updated_at`

状态说明：

- `pending`：已创建投递记录，尚未发送成功。
- `sent`：本系统已把邮件交给服务商。
- `delivered`：服务商回调确认已送达。
- `opened`：服务商回调确认已打开。
- `bounced`：服务商回调确认退信。
- `failed`：本系统发送失败或服务商回调失败。

`metadata` 可保存 `delivery_id`、`message_id`、`provider_event_id`、`callback_status` 和 `callback_at`。邮件服务商回调通过 `POST /api/webhooks/email` 更新状态，未匹配到投递记录时只写入 `system_events`。

## login_attempts

- `id`
- `email`
- `ip_hash`
- `success`
- `created_at`

## writer_versions

- `id`
- `writer_profile_id`
- `version`
- `summary_md`
- `skill_json`
- `quality_report`
- `created_by`
- `created_at`

## ai_usage

- `id`
- `organization_id`
- `user_id`
- `provider`
- `model`
- `task_type`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `estimated_cost`
- `status`
- `error`
- `created_at`

## manual_payment_orders

- `id`
- `organization_id`
- `user_id`
- `package_id`
- `package_type`
- `title`
- `amount_cny`
- `credits`
- `plan`
- `duration_days`
- `payment_channel`
- `payer_note`
- `proof_text`
- `status`
- `reviewed_by`
- `reviewed_at`
- `review_note`
- `created_at`
- `updated_at`

状态说明：

- `pending`：用户已提交，等待管理员核对收款。
- `approved`：管理员已确认，系统已发放额度或开通会员。
- `rejected`：管理员拒绝，通常需要在 `review_note` 说明原因。

## credit_accounts

- `id`
- `organization_id`
- `user_id`
- `balance`
- `updated_at`

## credit_ledger

- `id`
- `organization_id`
- `user_id`
- `order_id`
- `usage_id`
- `direction`
- `amount`
- `balance_after`
- `reason`
- `created_at`

## api_keys

- `id`
- `organization_id`
- `user_id`
- `provider`
- `scope`
- `encrypted_key`
- `key_hint`
- `created_at`
- `updated_at`
- `disabled_at`

## audit_logs

- `id`
- `organization_id`
- `user_id`
- `action`
- `target_type`
- `target_id`
- `metadata`
- `created_at`

## system_events

- `id`
- `organization_id`
- `user_id`
- `level`
- `type`
- `message`
- `metadata`
- `created_at`

## ops_triage

轻量运营跟进映射表，用于给 `ai_usage` 失败记录等非系统事件数据补充状态、负责人、备注、优先级和 SLA，不修改原始事实记录。

- `id`
- `organization_id`
- `source_type`
- `source_id`
- `metadata`
- `updated_by`
- `created_at`
- `updated_at`

约束：`organization_id + source_type + source_id` 唯一。

## admin_preferences

后台个人偏好表，用于保存审计筛选、错误筛选和反馈筛选。数据按组织和用户隔离。

- `id`
- `organization_id`
- `user_id`
- `preferences`
- `created_at`
- `updated_at`

约束：`organization_id + user_id` 唯一。

## sessions

- `id`
- `user_id`
- `token_hash`
- `expires_at`
- `created_at`

## rate_limits

- `id`
- `organization_id`
- `user_id`
- `scope`
- `date`
- `count`
- `updated_at`

## payment_webhooks

- `id`
- `provider`
- `event_id`
- `organization_id`
- `event_type`
- `payload`
- `processed_at`
- `created_at`

## 生产数据库预留

P1 第二轮已接入 `PostgresStore`。当前运行时仍默认使用 JSON Store；设置 `STORE_DRIVER=postgres` 和 `DATABASE_URL` 时会执行 `server/migrations/001_initial.sql` 并使用 PostgreSQL。`server/scripts/import-json-to-postgres.mjs` 可用于把本地 JSON Store 数据导入 PostgreSQL。

P2 第一轮新增 `email_deliveries` 记录邮件投递状态，并新增 `server/scripts/backup.mjs` 作为逻辑备份脚本。当前 PostgreSQL Store 为兼容本地 Store 仍采用快照式读写加 advisory lock，正式高并发上线前应继续拆为表级 repository。

P2 第四轮阶段 D 起，PostgreSQL Store 使用迁移执行器记录 `migration_versions`，并先把 `ai_usage` 历史查询切到只读 repository 试点。JSON Store 路径保持不变。
