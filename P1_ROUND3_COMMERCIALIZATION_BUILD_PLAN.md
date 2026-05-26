# P1 第三轮商业化施工文档

本文件承接 `P1_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md`。第二轮已经补齐账号安全、邮箱验证、密码重置、登录节流、团队管理、可观测、数据导出删除、部署说明和灰度反馈入口。

第三轮目标：把灰度试用期间最需要的运营、套餐、审计和计费预埋能力补成可持续观察的闭环。

## 施工顺序

```text
1. 组织基础设置
2. 用量与审计过滤
3. 套餐摘要与额度展示
4. 支付 webhook 占位
5. 运营反馈沉淀
6. 第三轮验收与文档更新
```

## P1R3-1：组织基础设置

已实施：
- `PUT /api/orgs/:orgId` 支持 owner/admin 修改组织名称。
- 修改组织名称会写入审计日志。
- 前端用量区域展示当前套餐和每日额度。

后续可增强：
- 独立组织设置页。
- owner 转移和组织删除流程。

## P1R3-2：用量与审计过滤

已实施：
- `GET /api/usage/history` 支持 `from`、`to`、`task_type`、`status`、`limit`。
- `GET /api/audit` 支持 `from`、`to`、`action`、`limit`。
- `GET /api/ops/recent-errors` 汇总最近 AI 失败和系统事件。

后续可增强：
- 前端筛选器。
- CSV 导出。
- 管理后台图表。

## P1R3-3：套餐摘要与额度展示

已实施：
- `GET /api/billing/summary` 返回组织套餐、每日额度、当日用量和最近支付 webhook。
- 云端面板用量报告展示套餐、个人日限和组织日限。

后续可增强：
- 套餐升级页。
- Stripe、Paddle 或国内支付渠道的正式结算。

## P1R3-4：支付 webhook 占位

已实施：
- `POST /api/webhooks/payments` 支持共享密钥校验。
- webhook 事件按 `provider + event_id` 幂等保存。
- 事件写入 `payment_webhooks`，并记录系统事件。

后续可增强：
- 支付签名算法适配。
- 套餐自动变更。
- 失败重放和死信队列。

## P1R3-5：运营反馈沉淀

已实施：
- `POST /api/feedback` 接收内测用户反馈。
- 云端面板新增内测反馈入口。
- 反馈以 `system_events` 保存，便于后续汇总到 TODO 或 issue。

后续可增强：
- 反馈状态流转。
- 与 GitHub Issue 或客服系统集成。

## 验收

第三轮完成后应运行：

```bash
npm run build
npm run check
npm test
npm run test:e2e
```

预期：
- 后端商业化 API 测试覆盖账号安全、团队管理、同步冲突、数据导出、错误查询、支付 webhook 和反馈。
- 前端云端面板能显示账号安全、团队协作、云端同步、AI 代理、用量、数据与运维入口。
