# P2 第一轮商业化施工文档

本文件承接 `COMMERCIALIZATION_PROGRESS_REPORT.md` 的“仍未完成工作”。当前项目已经具备小团队灰度试用条件，但距离正式收费上线还缺少邮件、支付、后台、备份和数据治理能力。

本轮目标：补齐正式商业化前最挡路的基础设施骨架，避免继续只停留在“灰度手工运营”阶段。

## 施工顺序

```text
1. 邮件服务接入
2. 支付 webhook 签名与套餐变更
3. 管理后台 API 汇总
4. 备份自动化脚本
5. 文档与测试更新
6. 施工后 review
```

## P2R1-1：邮件服务接入

要做：
- 增加邮件发送适配层。
- 支持开发模式记录邮件，生产模式通过 HTTP webhook 邮件服务发送。
- 邮箱验证和密码重置触发邮件发送。
- 记录邮件发送成功、失败和重试次数。
- 生产环境不允许只使用本地 log 邮件模式。

验收：
- 注册或申请验证时会创建邮件投递记录。
- 密码重置会创建邮件投递记录。
- 邮件发送失败会进入最近错误或系统事件。

## P2R1-2：支付 webhook 正式化

要做：
- 用 HMAC 签名替代简单共享密钥。
- 校验 timestamp，防止旧请求重放。
- webhook 按 `provider + event_id` 幂等。
- 支持根据支付事件更新组织套餐。
- 写入审计和系统事件。

验收：
- 签名错误或过期请求被拒绝。
- 重复事件不会重复写入。
- 支付成功或订阅更新可以更新组织 plan。

## P2R1-3：管理后台 API 汇总

要做：
- 新增管理员汇总接口。
- 返回组织、成员、邀请、用量、最近错误、反馈和账单摘要。
- 管理接口仅 owner/admin 可访问。

验收：
- owner/admin 能获取运营汇总。
- member 无法访问管理汇总。

## P2R1-4：备份自动化脚本

要做：
- 新增备份脚本。
- JSON Store 直接导出当前数据。
- PostgreSQL Store 通过 Store 接口导出逻辑备份。
- 支持备份目录和保留天数。

验收：
- `npm run server:backup` 可生成备份文件。
- 备份文件命名包含时间戳。
- 可配置保留天数并清理旧备份。

## P2R1-5：文档与测试

要做：
- 更新 `.env.example`、部署文档、安全文档和进度报告。
- 增加后端 API 测试。
- 跑完整验证。

验收命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

## 非目标

本轮不做：
- 完整可视化管理后台页面。
- 具体支付渠道 SDK 深度接入。
- 表级 repository 大重构。
- 企业级备份恢复平台。

这些进入下一阶段施工文档。

## 完成记录

完成时间：2026-05-23

已完成：

- 邮件发送适配层：开发模式记录投递，生产模式必须通过 HTTP webhook 投递。
- 邮箱验证和密码重置邮件：注册、申请验证、忘记密码都会创建 `email_deliveries` 记录。
- 邮件重试与失败记录：最多重试 3 次，失败写入系统事件。
- 支付 webhook HMAC 签名：使用 `x-webhook-timestamp` + `x-webhook-signature` 校验请求，过期和错误签名会被拒绝。
- 套餐变更：`checkout.completed`、`subscription.created`、`subscription.updated` 可更新组织套餐，取消订阅会降级为 `free`。
- 管理汇总 API：新增 `GET /api/admin/dashboard`，仅 owner/admin 可访问。
- 云端面板入口：新增“管理汇总”按钮，用于查看组织、成员、邀请、用量、反馈、错误和账单摘要。
- 备份脚本：新增 `npm run server:backup`，支持备份目录与保留天数。
- 测试补齐：增加生产邮件 webhook、管理汇总权限、支付签名、过期 webhook 和备份脚本验证。

施工后 review 修复：

- 支付 webhook 签名比较改为 `timingSafeEqual`，避免普通字符串比较。
- 补充普通成员无法访问管理汇总的测试。
- 补充过期支付 webhook 请求被拒绝的测试。

验证结果：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：15 项通过
- 端到端测试：26 项通过
- 依赖审计：0 个漏洞
