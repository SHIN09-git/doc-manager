# P2 第七轮商业化施工计划

更新时间：2026-05-26

第六轮已经把独立后台的运营闭环补到可灰度使用：组织级权限边界、AI 失败跟进、反馈批量处理、后端成本估算、后台偏好云端化和 SLA 摘要均已落地。第七轮建议把重心转向“生产稳定性与权限细分”，避免后台能力继续堆在 owner/admin 和快照式数据库写回之上。

## 目标

- 将 PostgreSQL Store 从快照兼容层继续拆到高频写入 repository。
- 为独立后台增加只读运营角色，降低 owner/admin 权限泛化风险。
- 补真实邮件与支付渠道的联调清单，准备进入可收费灰度。
- 把后台运营数据导出和留档能力做得更清晰。

## 阶段 A：PostgreSQL 写入路径拆分

任务：

- 为 `ops_triage`、`admin_preferences` 增加 repository。
- 为 `writer_profiles`、`writer_versions` 设计读写 repository 草案。
- 将 `recordUsage` 的写入路径评估为 insert-only，避免未来多实例下快照覆盖。
- 补 JSON Store 与 PostgreSQL Store 的行为一致性测试。

验收：

- PostgreSQL Store 下 `ops_triage` 和 `admin_preferences` 可独立读写。
- JSON Store 行为不变。
- 不引入跨表快照覆盖风险。

## 阶段 B：后台角色细分

任务：

- 增加 `ops_viewer` 或 `operator` 角色草案。
- 明确可读范围：用量、审计、反馈、错误、邮件、账单只读。
- 明确禁止范围：成员角色调整、API Key 保存/删除、组织删除草案、支付升级入口。
- 更新后端 `requireOrganizationRole` 调用点和前端禁用状态。

验收：

- 只读运营角色可以进入后台，但不能执行危险写操作。
- owner/admin 现有能力不回退。

## 阶段 C：真实服务商联调准备

任务：

- Resend：补真实域名验证、webhook 事件订阅和投递失败处理清单。
- 支付：确定候选渠道和签名策略，产出接入决策文档。
- 备份：补一次从备份文件恢复到临时环境的演练脚本设计。

验收：

- 不要求本轮真正接入支付 SDK，但要能清晰进入联调。
- 邮件和备份都有明确的生产演练步骤。

## 阶段 D：后台运营导出增强

任务：

- 错误与反馈支持当前筛选结果导出 JSON/CSV。
- 运营日报复制内容加入成本、预算、SLA 和账单事件摘要。
- 审计筛选导出格式补版本字段，便于后续导入。

验收：

- 后台常用运营数据可以脱离页面留档。
- 导出格式稳定，不泄露 API Key 原文。

## 验证命令

```bash
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
```

## 暂不处理

- 大规模重做后台 UI。
- 完整客服工单系统。
- 平台级超级管理员后台。
- 真实支付渠道上线，除非先完成渠道选择。
