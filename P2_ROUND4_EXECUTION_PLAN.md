# P2 第四轮商业化执行计划

更新时间：2026-05-24

本计划承接 `PHASE_SUMMARY_AND_NEXT_TARGETS.md` 与 `P2_ROUND4_COMMERCIALIZATION_BUILD_PLAN.md`，目标是把当前“小团队灰度试用”继续推进到“可收费灰度”。本轮只做必要闭环，不追求完整企业级系统。

## 一、施工原则

- 保持本地模式完整可用，云端能力继续作为可选能力。
- 优先补齐真实用户路径：看套餐、升级、收邮件、管理员观察状态。
- 后端接口先做稳定边界和清晰错误，不在前端写死第三方支付或邮件服务商逻辑。
- 数据库生产化先做试点，不一次性替换所有 Store 读写。
- 每完成一个模块即补测试和文档，避免最后集中补漏。

## 二、阶段切分

```text
阶段 A：支付 checkout 与账单页入口
阶段 B：邮件投递回调与运营筛选
阶段 C：管理后台独立页面雏形
阶段 D：PostgreSQL repository 试点
阶段 E：备份加密与对象存储方案
阶段 F：统一 review、测试、文档收口
```

## 三、阶段 A：支付 checkout 与账单页入口

状态：已实施。

完成记录：

- 后端新增 `POST /api/billing/checkout`。
- 新增 `PAYMENT_CHECKOUT_MODE`、`PAYMENT_CHECKOUT_URL`、`PAYMENT_SUCCESS_URL`、`PAYMENT_CANCEL_URL`。
- checkout 创建要求 owner/admin 权限。
- 配置 `PAYMENT_PLAN_PRICE_MAP` 时，目标套餐通过后端价格映射解析。
- 前端云端面板新增“账单与套餐”区域。
- 升级按钮调用后端 checkout 接口，不直接拼接支付链接。
- 已补充后端测试和端到端本地模式断言。

### 目标

让用户能在云端模式下看到当前套餐、额度、账单事件，并通过安全的后端接口进入升级流程。

### 后端施工

涉及文件：

- `server/src/app.js`
- `server/src/config/env.js`
- `server/tests/commercial-api.test.js`
- `server/.env.example`

任务：

- 新增环境变量：
  - `PAYMENT_CHECKOUT_MODE=disabled|mock|webhook`
  - `PAYMENT_CHECKOUT_URL=`
  - `PAYMENT_SUCCESS_URL=`
  - `PAYMENT_CANCEL_URL=`
- 新增接口：
  - `POST /api/billing/checkout`
- 接口输入：
  - `plan`
  - `price_id`
  - `organization_id` 可从当前会话推导，前端不必传。
- 行为：
  - 未登录返回 401。
  - 非 owner/admin 返回 403。
  - 未配置支付渠道时返回明确业务错误 `billing_checkout_not_configured`。
  - mock 模式返回本地可展示的 checkout URL。
  - 生产模式只允许使用 `PAYMENT_PLAN_PRICE_MAP` 中存在的 price ID。
- 审计：
  - 创建 checkout 时写入 `billing.checkout.created`。
  - 配置缺失或失败写入系统事件，不暴露内部错误给用户。

### 前端施工

涉及文件：

- `index.html`
- `app.js`
- `styles.css`
- `e2e/workbench.spec.js`

任务：

- 云端面板增加“账单与套餐”区域。
- 展示：
  - 当前套餐
  - 今日个人/组织用量
  - 额度上限
  - 最近账单事件
  - 升级按钮
- 点击升级：
  - 调用 `/api/billing/checkout`
  - 成功时打开后端返回的 `checkout_url`
  - 未配置时显示友好提示

### 测试

- 后端测试：
  - 未登录不能创建 checkout。
  - member 不能创建 checkout。
  - owner/admin 可创建 mock checkout。
  - price ID 不在映射中时拒绝。
- E2E：
  - 未登录本地模式不显示危险错误。
  - 登录云端后可以看到套餐摘要。

### 验收

- 免费用户能看到升级入口。
- 支付配置缺失时提示清楚。
- 前端不直接拼接第三方支付链接。

## 四、阶段 B：邮件投递回调与运营筛选

状态：已实施。

完成记录：

- 后端新增 `POST /api/webhooks/email`。
- 新增 `EMAIL_CALLBACK_TOKEN` 最小鉴权。
- 邮件发送 webhook 会携带 `metadata.delivery_id`，便于服务商回调稳定匹配。
- 回调支持 `delivered`、`bounced`、`failed`、`opened`。
- 未匹配回调只写系统事件，不创建误导性投递记录。
- 管理后台新增“邮件投递”卡片，支持邮箱、模板、状态筛选和复制详情。
- 已补充后端回调 token、状态更新、未匹配事件测试。

### 目标

让邮件投递从“只记录发送请求”升级为“能接收服务商状态回调，并可由管理员筛选查看”。

### 后端施工

涉及文件：

- `server/src/app.js`
- `server/src/config/env.js`
- `server/tests/commercial-api.test.js`
- `DATABASE_SCHEMA.md`
- `DEPLOYMENT.md`

任务：

- 新增环境变量：
  - `EMAIL_CALLBACK_TOKEN=`
- 新增接口：
  - `POST /api/webhooks/email`
- 回调支持状态：
  - `delivered`
  - `bounced`
  - `failed`
  - `opened` 可记录但不作为关键状态
- 校验：
  - 使用 header token 或 query token 做最小保护。
  - 缺 token 或 token 不匹配返回 403。
- 数据更新：
  - 通过 provider event id、message id、email + template + token hash 等字段尽量匹配 `email_deliveries`。
  - 匹配失败时写系统事件，不创建误导性投递记录。
- 查询增强：
  - `GET /api/admin/dashboard` 增加最近邮件投递列表。
  - 可考虑新增 `GET /api/admin/email-deliveries`，支持 `template`、`status`、`email`、`limit`。

### 前端施工

涉及文件：

- `index.html`
- `app.js`
- `styles.css`

任务：

- 管理后台增加“邮件投递”卡片或独立 tab。
- 支持筛选：
  - 邮箱
  - 模板
  - 状态
- 支持复制失败详情。

### 测试

- 回调 token 缺失返回 403。
- 回调能把投递记录从 `sent` 更新为 `delivered` 或 `failed`。
- 管理员能看到邮件投递筛选结果。

### 验收

- 邮件状态可以由服务商回调更新。
- 管理员能按模板、状态、邮箱查看邮件投递。
- 回调失败不会污染投递记录。

## 五、阶段 C：管理后台独立页面雏形

状态：已实施。

完成记录：

- 新增 `#admin` hash 路由和全屏管理后台视图。
- 原“管理汇总”入口改为进入独立管理视图。
- 旧管理弹窗 DOM 与渲染逻辑保留，作为兼容基础。
- 独立后台拆分为概览、成员、用量、审计、反馈、邮件、账单、错误 8 个栏目。
- 未登录或非 owner/admin 访问 `#admin` 会被拦截并回到云端面板。
- 独立后台复用现有管理 API、CSV 导出、组织导出、删除草案、反馈状态流转和详情复制能力。
- 已补充未登录访问 `#admin` 的端到端守卫测试。

### 目标

将现有“管理后台弹窗”升级为更适合运营使用的独立视图，同时保留现有入口。

### 前端施工

涉及文件：

- `index.html`
- `app.js`
- `styles.css`
- `e2e/workbench.spec.js`

任务：

- 增加 hash 路由或内部全屏视图：
  - `#admin`
  - 或 `?view=admin`
- 原“管理汇总”按钮跳转/打开独立后台。
- 后台布局建议：
  - 顶部：组织名称、套餐、今日请求、错误数、反馈数。
  - 左侧或顶部 tab：概览、成员、用量、审计、反馈、邮件、账单、错误。
  - 主区：当前 tab 内容。
- 保留原弹窗逻辑一段时间作为兼容入口，或让弹窗按钮进入独立视图。
- 权限：
  - 前端隐藏普通成员入口。
  - 后端仍以 owner/admin 权限为准。

### 后端施工

本阶段尽量复用现有 API：

- `GET /api/admin/dashboard`
- `GET /api/usage/history`
- `GET /api/audit`
- `POST /api/feedback/:id/status`
- 新增邮件接口后可接入邮件 tab。

### 测试

- E2E：
  - owner/admin 可以进入独立管理视图。
  - 未登录或 member 不能进入。
  - 切换 tab 不破坏主工作台状态。

### 验收

- 管理后台不再受右侧 inspector 空间限制。
- 原管理入口仍可用。
- 普通成员无法访问管理后台数据。

## 六、阶段 D：PostgreSQL repository 试点

状态：已实施。

完成记录：

- 新增 `migration_versions` 迁移版本表。
- 新增 `server/src/db/migrations/migrationRunner.js`，按 SQL 文件顺序执行并记录版本。
- `PostgresStore.applyMigrations` 改为使用迁移执行器，健康检查会返回本次迁移 applied/skipped 数量。
- 新增 `server/src/db/repositories/usageRepository.js`，提供 `listUsageByOrganization` 只读查询。
- `GET /api/usage/history` 在 PostgreSQL Store 下优先走 `ai_usage` repository，JSON Store 路径不变。
- 补充 migration runner 与 usage repository 单元测试。
- 复查阶段 A/B/C 后修复独立管理后台刷新按钮加载态目标问题。

### 目标

开始从快照式 PostgreSQL Store 过渡到表级 repository，但只选择低风险读路径试点。

### 后端施工

涉及文件：

- `server/src/db/postgresStore.js`
- `server/migrations/`
- `server/src/db/repositories/`
- `server/tests/`
- `POSTGRES_REPOSITORY_REFACTOR_PLAN.md`

任务：

- 新增迁移版本表：
  - `migration_versions`
- 新增迁移执行记录逻辑。
- 建议先做 `audit_logs` 或 `ai_usage` 只读 repository：
  - `listUsageByOrganization`
  - 或 `listAuditLogsByOrganization`
- 让一个查询路径可选走 repository：
  - 优先 `GET /api/usage/history`
  - 或 `GET /api/audit`
- 保持 JSON Store 路径不变。

### 测试

- migration runner 能记录已执行版本。
- repository 查询按组织隔离。
- 分页或 limit 生效。
- 现有 server tests 全部继续通过。

### 验收

- PostgreSQL Store 启动能记录迁移版本。
- 至少一个只读 repository 可用。
- 不影响 JSON Store 和现有 API 响应结构。

## 七、阶段 E：备份加密与对象存储方案

状态：已实施。

完成记录：

- 新增 `BACKUP_ENCRYPTION_KEY`，配置后 `server:backup` 输出 `.json.gcm` 加密备份。
- 加密使用 Node 原生 `crypto` 的 AES-256-GCM，备份文件保存加密 envelope，不再保存明文正文。
- `server:backup:verify` 可识别明文 `.json` 和加密 `.json.gcm`，加密文件需要同一 `BACKUP_ENCRYPTION_KEY` 才能校验。
- 新增 `BACKUP_OBJECT_STORAGE_MODE=disabled|s3-compatible` 和 S3-compatible 配置项，默认关闭。
- 新增 S3-compatible PUT 上传适配器，使用原生 AWS Signature V4 签名，不引入新依赖。
- 未配置加密和对象存储时，本地备份行为保持原样。
- 补充备份加密、对象存储配置校验、S3 签名、明文备份校验和加密备份校验测试。

### 目标

让备份策略从“本地明文逻辑备份”推进到“可配置加密和上传”的生产方案雏形。

### 脚本施工

涉及文件：

- `server/scripts/backup.mjs`
- `server/scripts/verify-backup.mjs`
- `server/src/config/env.js`
- `DEPLOYMENT.md`
- `SECURITY.md`

任务：

- 新增配置预留：
  - `BACKUP_ENCRYPTION_KEY=`
  - `BACKUP_OBJECT_STORAGE_MODE=disabled|s3-compatible`
  - `BACKUP_OBJECT_STORAGE_BUCKET=`
  - `BACKUP_OBJECT_STORAGE_ENDPOINT=`
- 本轮可先做：
  - 文档化对象存储方案。
  - 脚本结构预留上传函数。
  - 未配置时保持本地备份。
- 如果实现加密：
  - 使用 Node 原生 `crypto` AES-GCM。
  - 加密文件扩展名建议 `.json.gcm`。
  - 校验脚本需要能识别未加密 JSON 与加密备份。

### 测试

- 未配置加密/对象存储时，现有备份命令行为不变。
- 配置无效时返回非 0，并触发失败告警。
- 如果实现加密，补充加密和解密校验测试。

### 验收

- 文档明确备份文件不应明文长期落盘。
- 脚本保持向后兼容。
- 恢复前密钥、权限、只读校验步骤清楚。

## 八、阶段 F：统一 review、测试、文档收口

状态：已实施。

完成记录：

- 复查阶段 A-E：支付 checkout、邮件回调、独立管理后台、PostgreSQL repository 试点和备份加固均未发现阻断问题。
- 完整运行构建、语法检查、单元测试、端到端测试、依赖审计、明文备份校验、加密备份校验和 diff 空白检查。
- 文档同步更新 `README.md`、`DEPLOYMENT.md`、`SECURITY.md`、`ARCHITECTURE.md`、`DATABASE_SCHEMA.md`、`COMMERCIALIZATION_PROGRESS_REPORT.md`、`TODO.md`、`REVIEW.md`。
- 新增下一阶段施工文件 `P2_ROUND5_COMMERCIALIZATION_BUILD_PLAN.md`。
- `git diff --check` 无空白错误，仅有 Windows 换行转换提示。

### 必跑命令

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
npm run server:backup
npm run server:backup:verify -- <backup-file>
git diff --check
```

### 文档更新

需要同步更新：

- `README.md`
- `DEPLOYMENT.md`
- `SECURITY.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `COMMERCIALIZATION_PROGRESS_REPORT.md`
- `TODO.md`
- `REVIEW.md`

### Review 重点

- 未登录本地模式是否仍完整可用。
- 支付 checkout 是否只能从后端创建。
- 支付 price ID 是否仍通过映射校验。
- 邮件回调是否具备最小鉴权。
- 管理后台权限是否后端强校验。
- PostgreSQL repository 试点是否不影响 JSON Store。
- 备份失败是否仍能被计划任务和 webhook 感知。

## 九、建议执行顺序与提交边界

建议拆成 5 个提交或 5 轮施工：

1. `billing checkout`
   - 后端 checkout 接口
   - 前端账单入口
   - 测试和文档

2. `email callbacks`
   - 邮件回调接口
   - 管理后台邮件筛选
   - 测试和部署说明

3. `admin workspace`
   - 独立管理后台视图
   - 权限和 E2E

4. `postgres repository pilot`
   - 迁移版本表
   - 一个只读 repository
   - repository 测试

5. `backup hardening`
   - 加密/对象存储方案
   - 脚本预留或轻量实现
   - 恢复演练文档

每轮完成后都应更新 `REVIEW.md` 的阶段记录；整轮完成后再更新 `COMMERCIALIZATION_PROGRESS_REPORT.md` 和下一阶段施工文件。

## 十、风险与回滚

### 支付

风险：配置错误导致用户无法升级或套餐误变更。

回滚：

- 将 `PAYMENT_CHECKOUT_MODE=disabled`。
- 保留 webhook 记录，不自动变更未映射 price ID。

### 邮件

风险：服务商回调格式差异导致投递状态匹配失败。

回滚：

- 仅记录系统事件，不更新 `email_deliveries`。
- 保留原发送逻辑。

### 管理后台

风险：独立视图影响主工作台布局。

回滚：

- 保留原弹窗入口。
- hash 路由异常时返回主工作台。

### PostgreSQL repository

风险：试点查询与快照兼容层结果不一致。

回滚：

- 使用 feature flag 或 driver 判断退回现有 Store 读路径。

### 备份

风险：加密或上传失败影响现有本地备份。

回滚：

- 未配置时始终走当前本地 JSON 备份。
- 上传失败不得删除本地备份。

## 十一、完成定义

P2 第四轮完成时，应达到：

- 用户能从云端面板看到套餐和升级入口。
- 邮件投递能接收服务商回调并在管理后台筛选。
- 管理后台有独立视图雏形。
- PostgreSQL 至少有一个表级只读 repository 试点。
- 备份加密/对象存储方案清楚，脚本不破坏当前备份能力。
- 所有测试通过，Review 文档和商业化进度文档同步更新。
