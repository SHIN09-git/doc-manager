# 代码评审记录

## 2026-06-03 反馈处理 PostgreSQL Repository Review

范围：`server/src/db/repositories/feedbackRepository.js`、`server/src/db/postgresStore.js`、`server/src/app.js`、`server/tests/postgres-repository.test.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。用户反馈链路已从 PostgreSQL Store 的整库快照写回拆为 `system_events` 表级 repository：反馈创建、单条状态流转和批量状态处理都可在 PostgreSQL Store 下走独立事务；处理审计与状态更新保持同事务写入，JSON Store 兼容路径不变。

已确认：

- `/api/feedback` 在 Store 提供 `createFeedback` hook 时不再调用整库 `write()`。
- `/api/feedback/:id/status` 和 `/api/feedback/batch-status` 在 Store 提供反馈状态 hook 时会保留原有 metadata，并补写状态、负责人、SLA、备注、处理人和处理时间。
- `feedbackRepository` 会按 `organization_id + type='user.feedback'` 限定更新范围，找不到反馈时返回可映射为 404 的 `feedback_not_found`。
- Repository 测试覆盖反馈创建、单条处理、批量处理和 not found；API 回归测试覆盖 hook 路径不会回退 `write()`。

残余风险：

- 当前 repository 测试仍是轻量 fake pool，尚未接真实 PostgreSQL 实例跑集成验证。
- 错误事件本体跟进、邮件/支付回调事件和部分平台运行事件仍会写入或更新 `system_events`，后续可继续拆出更通用的 system event repository。

验证命令：

```bash
node --check server\src\db\repositories\feedbackRepository.js
node --check server\src\db\postgresStore.js
node --check server\src\app.js
node --test server\tests\postgres-repository.test.js
node --test server\tests\commercial-api.test.js
```

## 2026-06-02 人工确认充值 PostgreSQL Repository Review

范围：`server/src/db/repositories/manualPaymentRepository.js`、`server/src/db/repositories/creditRepository.js`、`server/src/db/postgresStore.js`、`server/src/billing/manualPaymentService.js`、`server/tests/postgres-repository.test.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。人工确认充值链路已从 PostgreSQL Store 的整库快照写回拆为表级 repository：用户提交订单写入 `manual_payment_orders`，管理员确认或拒绝只更新对应 pending 订单；确认时额度入账走 `credit_accounts`/`credit_ledger`，会员套餐开通更新 `organizations`，审计和系统事件保持同事务写入。JSON Store 兼容路径不变。

已确认：

- `manualPaymentService` 在 Store 提供 `createManualPaymentOrder` / `reviewManualPaymentOrder` hook 时不再调用整库 `write()`，原有错误码、凭证可见性和额度流水响应保持不变。
- `reviewManualPaymentOrder` 会先校验订单归属和 pending 状态，避免重复审核或跨组织审核。
- `grantCreditsForOrder` 只在确认通过且套餐含额度时写入入账流水；`activatePlanForManualPaymentOrder` 会在同套餐未过期时从原到期日顺延。
- Repository 测试覆盖订单创建、审核、重复审核拦截、会员到期顺延和额度入账；API 回归测试覆盖充值 hook 路径不会回退 `write()`。

残余风险：

- 当前 repository 测试仍是轻量 fake pool，尚未接真实 PostgreSQL 实例跑集成验证。
- 真实支付渠道、退款、对账和发票仍未接入；人工确认版适合灰度收款，但不能替代完整支付系统。
- 失败 AI 调用、反馈状态等部分 `system_events` 写入仍有兼容路径，后续可继续拆为表级 insert/update repository。

验证命令：

```bash
node --check server\src\db\repositories\manualPaymentRepository.js
node --check server\src\db\repositories\creditRepository.js
node --check server\src\db\postgresStore.js
node --check server\src\billing\manualPaymentService.js
node --test server\tests\postgres-repository.test.js
node --test server\tests\commercial-api.test.js
```

## 2026-06-02 额度扣减 PostgreSQL Repository Review

范围：`server/src/db/repositories/creditRepository.js`、`server/src/db/postgresStore.js`、`server/src/app.js`、`server/tests/postgres-repository.test.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。AI 日限用完后消耗已购额度的扣减链路已从整库快照写回拆成 `credit_accounts`/`credit_ledger` 表级 repository；PostgreSQL Store 下会在同一事务更新余额、写扣减流水和 `billing.credit.spend` 审计。JSON Store 兼容路径不变。

已确认：

- `spendCreditsForUsage` 在 Store 支持 repository hook 时走表级扣减，否则仍走原 JSON Store 写入。
- 扣减 SQL 使用 `balance >= amount` 条件更新，余额不足时不写扣减流水，并记录 `billing.credit.spend_skipped` 系统事件。
- `POST /api/ai/chat` 在触发超额额度消费时，会先走用量 repository，再走额度扣减 repository；除额度检查外，不再通过兼容 `write()` 写入用量或扣减流水。
- Repository 测试覆盖扣减成功和余额不足跳过；API 回归测试覆盖超额调用消耗已购额度的 hook 路径。

残余风险：

- 人工充值订单创建/审核、充值入账和套餐开通已在后一轮切到 `manual_payment_orders`、`credit_accounts`/`credit_ledger` 与 `organizations` repository；本节保留当时的阶段性风险记录。
- 失败 AI 调用后的 `system_events` 追加仍走兼容写入；当前与 repository 写入共享队列和 advisory lock，不会覆盖新记录，但后续可继续拆为表级事件插入。
- 当前 repository 测试仍是轻量 fake pool，尚未接真实 PostgreSQL 实例跑集成验证。

验证命令：

```bash
node --check server\src\db\repositories\creditRepository.js
node --check server\src\db\postgresStore.js
node --check server\src\app.js
node --test server\tests\postgres-repository.test.js
node --test server\tests\commercial-api.test.js
```

## 2026-06-02 AI 用量写入 PostgreSQL Repository Review

范围：`server/src/db/repositories/usageRepository.js`、`server/src/db/postgresStore.js`、`server/src/app.js`、`server/tests/postgres-repository.test.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。AI 调用用量记录已从 `ctx.store.write()` 的整库快照写回拆成 `ai_usage` 表级插入 repository；PostgreSQL Store 下会在同一事务写入用量记录和 `ai.chat` 审计日志。JSON Store 兼容路径不变。

已确认：

- `recordUsage` 会先构造统一的用量记录，Store 支持 `recordAiUsage` 时走 repository hook，否则仍走原 JSON Store 写入。
- `insertUsageRecord` 会归一化 token、成本、状态、时间字段，并返回与历史查询一致的公开结构。
- `POST /api/ai/chat` 在支持 repository hook 的 Store 下，正常调用只保留额度检查写入；实际用量记录和审计日志不再通过兼容 `write()` 追加。
- Repository 测试覆盖用量插入归一；API 回归测试覆盖 repository hook 路径。

残余风险：

- 失败 AI 调用后的 `system_events` 追加仍走兼容写入；当前与 repository 写入共享队列和 advisory lock，不会覆盖新用量记录，但后续可继续拆为表级事件插入。
- 额度扣减与额度流水已在后一轮切到 `credit_accounts`/`credit_ledger` repository；本节保留系统事件拆分风险记录。
- 当前 repository 测试仍是轻量 fake pool，尚未接真实 PostgreSQL 实例跑集成验证。

验证命令：

```bash
node --check server\src\db\repositories\usageRepository.js
node --check server\src\db\postgresStore.js
node --check server\src\app.js
node --test server\tests\postgres-repository.test.js
node --test server\tests\commercial-api.test.js
```

## 2026-06-02 执笔人 PostgreSQL Repository Review

范围：`server/src/db/repositories/writerRepository.js`、`server/src/db/postgresStore.js`、`server/src/app.js`、`server/tests/postgres-repository.test.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。执笔人云端写入已从整库快照写回拆为 `writer_profiles`/`writer_versions` 表级 repository，创建、更新、软删除、版本列表和版本恢复都在 PostgreSQL Store 下走独立事务；版本快照与审计日志保持同事务写入，JSON Store 兼容路径不变。

已确认：

- `/api/writers` 在 Store 提供 repository hook 时不会再调用整库 `write()`。
- 更新执笔人会检查 `expected_version`，冲突时继续返回 `version_conflict`，便于前端保留原有同步冲突处理。
- 调用名唯一约束冲突会统一映射为 `handle_exists`，包括数据库 `23505` 并发或软删除同名边界。
- 版本恢复会基于历史 `writer_versions` 生成新版本快照，不直接覆盖历史记录。
- Repository 测试覆盖列表读取、创建、调用名冲突、更新、版本冲突、版本恢复和软删除；API 回归测试覆盖 repository hook 路径。

残余风险：

- 当前 repository 测试仍是轻量 fake pool，尚未接真实 PostgreSQL 实例跑集成验证。
- `writer_profiles` 当前数据库唯一约束包含软删除记录；本轮已保证返回友好冲突，但如果未来需要“删除后释放调用名”，需要改为部分唯一索引并提供迁移脚本。
- `recordUsage` 已在后一轮切到 `ai_usage` 表级插入；部分系统事件写入仍保留兼容路径，正式多实例上线前还应继续评估表级 insert/update repository。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
git diff --check
```

## 2026-06-02 错误跟进 PostgreSQL Repository Review

范围：`server/src/db/repositories/opsTriageRepository.js`、`server/src/db/postgresStore.js`、`server/src/app.js`、`server/tests/postgres-repository.test.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。AI 失败记录的后台跟进映射已从整库快照写回拆为 `ops_triage` 表级 repository；系统事件跟进仍修改 `system_events` 本体，保留原路径。PostgreSQL Store 下的 AI 失败跟进会在同一事务 upsert `ops_triage` 并写入 `audit_logs`，同时和旧写路径共享 advisory lock。

已确认：

- `POST /api/ops/events/:id/triage` 处理 `ai_usage` 失败记录时，如果 Store 提供 `saveOpsTriage`，不会再调用整库 `write()`。
- `ops_triage` repository 按 `organization_id + source_type + source_id` 查询和 upsert，避免跨组织串写。
- 返回给后台的 AI 失败事件仍复用原 `buildAiUsageErrorItem` 结构，前端契约不变。
- Repository 测试覆盖查询构建、读取归一、已有记录更新和新记录插入；API 回归测试覆盖 repository hook 路径。

残余风险：

- `system_events` 的跟进仍走快照写回，因为它修改事件本体；如后续要彻底增量化，需要单独设计 `system_events` update repository。
- 执笔人表级写入已在后一轮完成；本节保留当时的 `system_events` 增量化风险记录。
- 当前 repository 测试仍是轻量 fake pool，尚未接真实 PostgreSQL 实例跑集成验证。

## 2026-06-02 后台偏好 PostgreSQL Repository Review

范围：`server/src/db/repositories/adminPreferenceRepository.js`、`server/src/db/repositories/auditRepository.js`、`server/src/db/postgresStore.js`、`server/src/app.js`、`server/tests/postgres-repository.test.js`。

结论：本轮没有发现阻断问题。后台偏好在 PostgreSQL Store 下已从整库快照写回拆为表级 repository，读取、保存和清空都按 `organization_id + user_id` 隔离；保存/清空时仍与旧快照写队列共享 `mowen_store_write` advisory lock，并在同一事务内写入审计日志，避免和未拆完的旧写路径交错。

已确认：

- `GET /api/admin/preferences` 在支持 repository 的 Store 下直接读取 `admin_preferences`，JSON Store 仍走原内存路径。
- `PUT /api/admin/preferences` 和 `DELETE /api/admin/preferences` 在 PostgreSQL Store 下使用表级事务，并回填 `this.data` 缓存，保证后续兼容读写仍能看到最新数据。
- `audit_logs` 新增插入方法，偏好保存和清空仍会写入审计记录。
- Repository 测试覆盖后台偏好查询构建、读取归一、已有记录更新、新记录插入、清空删除和审计插入。

残余风险：

- `ops_triage` 和执笔人表级写入已在后一轮完成；正式多实例上线前仍需继续评估剩余高频写入路径。
- 当前 repository 测试仍是轻量 fake pool，尚未接真实 PostgreSQL 实例跑集成验证。

## 2026-06-02 运营只读角色 Review

范围：`server/src/app.js`、`server/src/billing/manualPaymentService.js`、`src/admin/adminPage.js`、`src/modules/cloud/cloudActionsController.js`、`src/modules/cloud/cloudPanelRenderer.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。后台权限从 owner/admin 两级扩展为 owner/admin/operator，其中 operator 可以进入独立后台查看组织运营数据、用量、审计、错误、账单、接口摘要和保存个人筛选偏好，但关键写操作仍由 owner/admin 执行。

已确认：

- `operator` 可通过组织邀请加入，并通过 `admin.html` 或主工作台后台入口进入后台。
- `operator` 能读取 `/api/admin/dashboard`、`/api/usage/history`、`/api/audit`、`/api/ops/recent-errors`、`/api/billing/summary` 和接口摘要。
- `operator` 不能修改组织名称、保存接口密钥、发起 checkout、审核人工充值、处理反馈或保存错误跟进。
- 前端后台会对 `operator` 隐藏或降级展示写操作入口，避免只读用户误以为可以执行运营变更。

残余风险：

- `operator` 仍可查看较多组织运营元数据和接口尾号提示；正式商用前如需更细授权，应继续拆分“财务只读”“运维只读”等更窄角色。

## 2026-05-26 P2 第六轮施工后 Review

范围：`server/src/app.js`、`server/src/db/jsonStore.js`、`server/src/db/postgresStore.js`、`server/migrations/001_initial.sql`、`src/admin/adminPage.js`、`server/tests/commercial-api.test.js`、`e2e/workbench.spec.js`。

结论：本轮未发现阻断问题。上一轮指出的后台权限边界和契约不一致已经修复，后台深水区从“前端可视化增强”推进到“后端可持久化、可批量处理、可计费估算”的灰度运营闭环。

已确认：

- `/api/ops/recent-errors` 只返回当前组织的 warn/error 系统事件与当前组织 AI 失败记录，不再向组织管理员暴露 `organization_id === null` 的平台级事件。
- `POST /api/ops/events/:id/triage` 同时支持系统事件和 AI 失败记录；AI 失败记录通过 `ops_triage` 保存轻量跟进元数据。
- `POST /api/feedback/batch-status` 已替代后台批量反馈逐条请求路径，并写入审计日志。
- `recordUsage` 现在按 `AI_COST_RATES` 写入 `estimated_cost`，后台预算摘要来自后端字段，前端默认单价仅作为旧数据兜底。
- `admin_preferences` 支持按组织和用户保存审计筛选、错误筛选和反馈筛选；前端仍保留 localStorage 兜底。
- 后台概览新增 SLA 风险摘要和运营日报复制，反馈/错误列表新增 SLA 筛选。

残余风险：

- `ops_triage` 当前是轻量映射表，不是完整工单系统；如果后续要支持评论流、附件、状态历史，需要单独设计。
- PostgreSQL Store 仍以快照兼容写回为主，新表已经纳入迁移和快照列，但写入路径还没有拆成独立 repository。
- 平台级全局事件目前完全不进组织后台；未来若需要平台运营后台，需要新增超级管理员权限模型。

验证命令：

```bash
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
```

## 2026-05-24 后台深水区复查与下一阶段安排

范围：`src/admin/adminPage.js`、`server/src/app.js`、`styles.css`、`e2e/workbench.spec.js`、`server/tests/commercial-api.test.js`。

结论：没有发现会阻断当前独立后台主流程的问题；用量趋势、成本估算、审计保存筛选、反馈/错误跟进字段均有前后端闭环和测试覆盖。但发现一个应在下一阶段优先收口的权限/契约风险。

发现：

- [P1] `server/src/app.js:1197` `/api/ops/recent-errors` 会把 `organization_id === null` 的全局系统事件返回给任意组织 owner/admin。独立后台当前错误页走的是 `/api/admin/dashboard`，该路径只取当前组织事件；但该公开运营接口仍可能暴露全局登录失败、邮件异常、HTTP 失败等平台级事件元数据。下一阶段应默认只返回当前组织事件，并把平台级事件留给未来单独的超级管理员后台。
- [P2] `server/src/app.js:1193` 会把 AI 失败记录和系统事件一起放进 `/api/ops/recent-errors`，但 `server/src/app.js:1244` 的跟进接口只处理 `system_events`。如果未来后台改为直接消费 `/api/ops/recent-errors`，会出现“列表能展示 AI 失败，但保存跟进返回 404”的契约不一致。下一阶段应统一 AI 失败跟进存储，或在响应中标明不可跟进。
- [P2] `src/admin/adminPage.js:1140` 审计保存筛选仅在浏览器 localStorage 中保存，没有按组织/用户隔离和同步。当前单组织使用没问题；团队运营场景下建议云端化管理员偏好。

已确认：

- `src/admin/adminPage.js:399` 用量页会计算总 tokens、失败数、估算成本，并渲染趋势图。
- `src/admin/adminPage.js:429` 审计页支持保存、套用和删除筛选。
- `src/admin/adminPage.js:801` 反馈跟进会写回后端 `/feedback/:id/status`。
- `src/admin/adminPage.js:819` 错误跟进会写回后端 `/ops/events/:id/triage`。
- `server/tests/commercial-api.test.js:560` 覆盖反馈负责人、SLA、备注持久化。
- `server/tests/commercial-api.test.js:573` 覆盖错误事件跟进接口。
- `e2e/workbench.spec.js:899` 起覆盖后台用量、审计、反馈、错误的前端操作路径。

验证命令：

```bash
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
```

下一阶段施工文件：`P2_ROUND6_COMMERCIALIZATION_BUILD_PLAN.md`。

## 2026-05-24 后台深水区评审

范围：`src/admin/adminPage.js`、`server/src/app.js`、`styles.css`、`e2e/workbench.spec.js`、`server/tests/commercial-api.test.js`。

结论：本轮没有发现阻断问题。独立后台已经从“查看数据”继续推进到“看趋势、估成本、保存审计筛选、分派反馈与错误”的轻量运营闭环。

已确认：

- 用量页新增趋势图和估算成本，后端有 `estimated_cost` 时优先使用，缺省按默认 token 单价兜底。
- 审计页支持保存当前筛选、套用筛选和删除筛选；筛选保存在后台页本地存储，不影响服务端审计数据。
- 反馈页的负责人、备注、SLA 与状态会写回后端 `user.feedback` 事件 `metadata`，刷新后仍可见。
- 错误页新增状态、优先级、负责人、备注、SLA，并通过 `POST /api/ops/events/:eventId/triage` 写回系统事件元数据。
- 最近错误接口补充 `id` 和 `level`，保留旧 `type/message/metadata` 字段。
- 端到端测试覆盖新增 UI 路径，后端 API 测试覆盖反馈跟进和错误事件跟进。

剩余风险：

- 审计保存筛选当前是浏览器本地偏好，不会跟随账号跨设备同步。
- 反馈批量更新仍是逐条请求，后续可以补 `POST /api/feedback/batch-status`。
- 错误事件工单字段仍是轻量元数据，尚未拆成独立 issue/work order 表。

验证命令：

```bash
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
```

当前阶段性结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：28 项通过
- 端到端测试：29 项通过
- 依赖审计：0 个漏洞

## 2026-05-24 独立管理后台运营面板增强评审

范围：`src/admin/adminPage.js`、`styles.css`、`e2e/workbench.spec.js` 和相关文档。

结论：本轮没有发现阻断问题。独立后台的用量、审计、反馈和错误栏目已经从基础列表增强为可辅助运营判断和批量处理的面板，危险操作也从浏览器原生确认升级为统一二次确认弹窗。

已确认：

- 用量栏目展示匹配记录、成功/失败请求、总 tokens、任务类型分布，并支持逐条复制详情。
- 审计栏目展示动作类型、对象类型、最近记录、动作分布，并支持逐条复制详情。
- 反馈栏目支持批量标记为处理中、已解决或关闭，调用仍走后端反馈状态接口。
- 错误栏目支持按级别筛选，并可复制当前筛选后的错误列表。
- 成员移除、邀请撤销、接口删除、组织删除/停用草稿统一使用自定义确认弹窗，支持 Esc、遮罩取消和焦点回收。
- 端到端测试已扩展覆盖用量摘要、审计摘要、反馈批处理、错误筛选和确认弹窗。

剩余风险：

- 批量反馈更新当前仍是逐条请求，正式高并发运营后台可增加后端批量接口。
- 错误处理还没有“负责人/备注/SLA”字段，后续需要配合后端数据模型扩展。
- 用量和审计目前是摘要与列表，趋势图、成本估算和保存筛选视图仍待下一阶段补齐。

验证命令：

```bash
npm run check
npm run test:e2e
```

当前阶段性结果：

- 后端脚本检查：21 个 server 文件通过
- 端到端测试：29 项通过

## 2026-05-24 独立管理后台运营动作增强评审

范围：`admin.html`、`src/admin/adminPage.js`、后台页样式、独立后台端到端用例。

结论：本轮没有发现阻断问题。独立后台已经从“查看运营数据”推进到“完成基础运营动作”，并保留与现有商业化 API 的兼容路径。

已确认：

- 概览页可更新组织名称，继续复用后端 `/api/orgs/:id` 权限控制。
- 成员页可创建邀请、复制本轮返回的邀请码、重发/撤销邀请、调整成员角色和移除非 owner 成员。
- 新增“接口”栏目，可保存和删除组织级 API Key；页面只展示 `key_hint`，不会回显原始密钥。
- 账单页可读取 `/api/billing/summary` 的可用套餐，并通过 `/api/billing/checkout` 发起升级入口。
- 独立后台新增正向会话端到端冒烟测试，覆盖组织、成员、接口和账单核心动作。

剩余风险：

- 正向 E2E 当前使用 mocked API，会覆盖前端交互和请求契约；后续可再接临时真实后端 fixture。
- 成员移除、接口删除、组织删除草案仍依赖浏览器确认框；正式运营后台可以再补二次确认输入。
- 用量报表、审计高级查询、错误/反馈批处理和账单深度状态仍是后续增强项。

验证命令：

```bash
npm run check
npm run test:e2e
```

当前阶段性结果：

- 后端脚本检查：21 个 server 文件通过
- 端到端测试：29 项通过

## 2026-05-24 独立管理后台页面评审

范围：`admin.html`、`src/admin/adminPage.js`、主工作台管理入口、后台页样式和端到端门禁测试。

结论：独立后台页面已完成，没有发现阻断问题。后台能力从主工作台内的 `#admin` 视图进一步拆为可单独打开的 `admin.html`，更适合后续独立部署、权限细分和运营使用。

已确认：

- `admin.html` 不依赖主工作台 DOM，使用独立脚本直接调用云端 API。
- 页面支持 API 地址配置、登录、权限检查、刷新、退出和返回工作台。
- owner/admin 可以查看概览、成员、用量、审计、反馈、邮件、账单和错误栏目。
- 页面支持反馈状态流转、组织数据导出、用量/审计 CSV 导出、组织删除/停用草案和详情复制。
- 主工作台“管理后台”入口已改为跳转 `admin.html`。
- 旧 `#admin` 视图保留，可作为兼容入口。

剩余风险：

- 当前独立后台仍使用浏览器 Cookie 会话和同一个商业化 API，尚未拆成单独部署包。
- 正向登录后的后台完整 E2E 仍需要配合后端测试服务或专门 fixtures。
- 成员管理、API Key 管理和账单深度运营仍是后续增强项。

验证命令：

```bash
npm run check
npm run test:e2e
```

当前阶段性结果：

- 后端脚本检查：21 个 server 文件通过
- 端到端测试：28 项通过

## 2026-05-24 P2 第五轮阶段 C 评审

范围：PostgreSQL repository 扩面，重点复查 `audit_logs` 只读查询、`documents` 分页查询、接口兼容、JSON Store 回退和 repository 测试覆盖。

结论：阶段 C 已完成，没有发现阻断问题。真实支付渠道阶段已按当前安排暂缓；本轮优先把 PostgreSQL Store 从单表 `ai_usage` 试点扩展到审计和文档列表两个读路径。

已确认：

- `auditRepository` 查询始终带 `organization_id = $1`，并支持 `from`、`to`、`action`、`target_type`、`limit`。
- `GET /api/audit` 在 PostgreSQL Store 下优先走 repository；JSON Store 仍沿用原来的内存筛选逻辑。
- `documentRepository` 查询始终带组织隔离，默认排除 `deleted_at`，并支持 `include_deleted`、`type`、`folder_id`、`cursor_updated_at`、`cursor_id` 和 limit。
- `GET /api/documents` 在 PostgreSQL Store 下返回 `{ documents, page_info }`，旧的 `documents` 字段保持不变；JSON Store 响应不增加分页字段，保持旧行为。
- `ai_usage` 写入已在后一轮切为 insert-only repository；本节保留当时的阶段性风险记录。
- repository 测试覆盖了组织隔离、筛选、limit、游标分页、JSON/日期归一和迁移版本重复跳过。

剩余风险：

- 当前 repository 测试使用轻量假 pool 验证 SQL 与归一逻辑，尚未接真实 PostgreSQL 实例跑集成测试。
- 执笔人表级 repository 已在后一轮完成；本节保留当时的阶段性风险记录。
- 用量写入已在后一轮完成表级 repository；部分系统事件写入仍主要依赖快照兼容层，不适合高并发多实例生产。

验证命令：

```bash
npm run server:check
npm run server:test
```

当前阶段性结果：

- 后端脚本检查：21 个 server 文件通过
- 后端商业化 API 测试：28 项通过

## 2026-05-24 P2 第五轮阶段 A 评审

范围：真实邮件服务商适配，重点复查 Resend 发送适配、邮件回调字段映射、生产配置校验、部署说明和后端测试覆盖。

结论：阶段 A 已完成，没有发现阻断问题。当前邮件链路已经从通用 webhook 进入“可按真实服务商配置联调”的状态，同时保留 `generic-webhook` 兼容路径，不影响已有灰度部署。

已确认：

- `EMAIL_PROVIDER` 支持 `generic-webhook` 和 `resend`，生产环境选择 Resend 时必须配置 `EMAIL_RESEND_API_KEY`。
- Resend 发送请求会携带 `from`、`to`、`subject`、`text/html`、`tags.template`、`tags.delivery_id` 和 `Idempotency-Key`。
- Resend 返回的 `id` 会写入 `email_deliveries.metadata.message_id`，后续回调可按 message id 或 delivery id 匹配。
- `POST /api/webhooks/email` 可识别 Resend 风格的 `type`、`data.email_id`、`data.tags` 和 `data.bounce.message`。
- 回调状态已覆盖 `sent`、`delivered`、`bounced`、`failed`、`opened`，未匹配回调仍只写系统事件，不污染投递记录。
- 部署文档已补充 Resend 配置、模板变量、回调示例和退信/失败/限流运营处理。

剩余风险：

- 这轮使用本地假服务模拟 Resend API，尚未用真实 Resend 账号、发信域名和 webhook 订阅做端到端联调。
- 邮件失败告警仍主要依赖管理后台筛选和系统事件，后续可接入更主动的运营告警。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
```

当前结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：24 项通过
- 端到端测试：27 项通过
- 依赖审计：0 个漏洞
- `git diff --check` 无空白错误，仅有 Windows 换行转换提示

## 2026-05-24 P2 第四轮阶段 F 收口评审

范围：阶段 A-E 的整轮复查，包括支付 checkout、邮件投递回调、独立管理后台、PostgreSQL repository 试点、备份加密/对象存储，以及所有相关文档和测试。

结论：P2 第四轮已完成收口，没有发现阻断问题。当前仍适合继续作为“可收费灰度”版本推进，但真实支付渠道、真实邮件服务商、真实对象存储桶和 PostgreSQL 高并发写入仍需要下一轮集成验证。

已确认：

- 未登录本地模式仍完整可用，端到端测试覆盖云端未登录安全态。
- 支付 checkout 只能由后端创建，前端不拼接第三方支付链接。
- 配置 `PAYMENT_PLAN_PRICE_MAP` 后，price ID 仍由后端映射到内部套餐。
- 邮件回调具备 `EMAIL_CALLBACK_TOKEN` 最小鉴权，未匹配事件不会污染投递记录。
- 独立管理后台前端有 hash 守卫，后端管理 API 仍要求 owner/admin。
- PostgreSQL `ai_usage` repository 只影响 PostgreSQL Store 下的用量历史查询，JSON Store 路径不变。
- 备份脚本未配置时仍生成本地明文 JSON；配置加密后生成 `.json.gcm`；上传失败不会删除本地备份文件。

剩余风险：

- 真实邮件服务商、支付服务商和 S3-compatible 桶还需要按厂商做集成测试。
- PostgreSQL 仍只有一个只读 repository 试点，写入路径尚未扩面。
- 备份目前有结构校验，但仍缺完整恢复演练脚本和临时环境恢复流程。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
npm run server:backup
npm run server:backup:verify -- <plain-backup>
BACKUP_ENCRYPTION_KEY=... npm run server:backup
BACKUP_ENCRYPTION_KEY=... npm run server:backup:verify -- <encrypted-backup>
git diff --check
```

当前结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：23 项通过
- 端到端测试：27 项通过
- 依赖审计：0 个漏洞
- 明文备份校验和加密备份校验均通过
- `git diff --check` 无空白错误，仅有 Windows 换行转换提示

## 2026-05-24 P2 第四轮阶段 E 评审

范围：备份加密、加密备份校验、对象存储配置、S3-compatible 上传签名和部署/安全文档。

结论：阶段 E 没有发现阻断问题。备份脚本保持向后兼容，未配置加密和对象存储时仍输出本地 `.json`；配置 `BACKUP_ENCRYPTION_KEY` 后输出 `.json.gcm`；对象存储默认关闭，启用后通过原生 AWS Signature V4 PUT 上传副本。

已确认：

- 明文备份命令和校验命令保持可用。
- 加密备份命令可以生成 `.json.gcm`，校验脚本能用同一密钥解密并只读检查表结构。
- 错误或缺失备份密钥不会静默通过加密备份校验。
- `BACKUP_OBJECT_STORAGE_MODE=s3-compatible` 会校验 endpoint、bucket、access key 和 secret key。
- S3-compatible 上传请求按 bucket、prefix 和文件名生成 path-style 对象 key，并带有 `x-amz-content-sha256` 与 `Authorization` 签名。
- 新增能力没有引入第三方依赖。

剩余风险：

- S3-compatible 适配器已完成签名与 PUT 逻辑，但尚未在真实云厂商桶上做集成测试。
- 加密备份仍会先落本地文件，再上传副本；生产环境需要限制本地备份目录权限和生命周期。
- 还没有完整恢复演练脚本，本轮只做结构校验和部署步骤文档化。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
npm run server:check
npm run server:test
node server/scripts/backup.mjs
node server/scripts/verify-backup.mjs <plain-backup>
BACKUP_ENCRYPTION_KEY=... node server/scripts/backup.mjs
BACKUP_ENCRYPTION_KEY=... node server/scripts/verify-backup.mjs <encrypted-backup>
```

结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：23 项通过
- 端到端测试：27 项通过
- 依赖审计：0 个漏洞
- 明文备份校验和加密备份校验均通过
- `git diff --check` 无空白错误，仅提示 Windows 换行转换警告

## 2026-05-24 P2 第四轮阶段 A/B/C 复查与阶段 D 评审

范围：阶段 A 支付 checkout、阶段 B 邮件投递回调、阶段 C 独立管理后台，以及阶段 D PostgreSQL repository 试点。

结论：阶段 A/B/C 没有发现阻断阶段 D 的问题；已修复一个管理后台刷新按钮加载态目标不准确的小问题。阶段 D 已按低风险读路径落地，没有改变 JSON Store 行为，也没有把迁移版本表纳入整库快照写回。

已修复：

- 独立管理后台“刷新”按钮现在把加载态挂在全屏后台自己的按钮上，不再误用旧弹窗刷新按钮。

阶段 D 已确认：

- PostgreSQL 启动时会先确保 `migration_versions` 存在，再逐个执行 `server/migrations/*.sql`。
- 每个迁移文件以文件名作为版本 ID，执行成功后写入 `migration_versions`，重复启动会跳过已执行版本。
- `migration_versions` 不在 `TABLES` 快照表集合内，`saveAllWithClient` 不会清空迁移记录。
- `ai_usage` 新增只读 repository，并按 `organization_id`、筛选条件和 `limit` 查询。
- `GET /api/usage/history` 在 PostgreSQL Store 下优先走 repository，JSON Store 仍走原数组筛选。

剩余风险：

- 当前只切换了用量历史的只读路径，文档、执笔人、审计和写入路径仍采用兼容快照层。
- 还没有接真实 PostgreSQL 服务做集成测试；本轮新增的是 migration runner 和 repository 的脚本级单元测试。
- 快照写和未来增量写混用前，需要继续明确哪些接口已经切走，避免覆盖风险。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
git diff --check
```

结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：20 项通过
- 端到端测试：27 项通过
- 依赖审计：0 个漏洞
- `git diff --check` 无空白错误，仅提示 Windows 换行转换警告

阶段 D 开发中也单独运行过：

```bash
npm run server:check
npm run server:test
```

## 2026-05-24 P2 第四轮阶段 C 评审

范围：`#admin` 独立管理后台视图、管理后台 hash 路由、权限守卫、管理后台分区渲染和端到端守卫测试。

结论：阶段 C 没有发现阻断问题。管理能力已经从右侧面板弹窗升级为独立全屏视图，运营人员可以在更大的空间里查看组织、成员、用量、审计、反馈、邮件、账单和错误。旧弹窗逻辑保留，降低回滚风险。

已确认：

- `#admin` 路由会检查当前云端登录态和 owner/admin 角色。
- 未登录用户访问 `#admin` 会被拦截并回到云端面板。
- 独立后台复用现有 `GET /api/admin/dashboard`、用量、审计和反馈接口。
- 用量/审计 CSV 导出、组织导出、删除草案、反馈流转和详情复制仍复用原能力。
- 旧管理弹窗 DOM 保留，后续如需回退不需要恢复大量结构。

剩余风险：

- 目前独立后台仍在同一静态应用内，不是单独部署的运营应用。
- 登录态持久化后直达 `#admin` 的 owner/admin 正向 E2E 还未接入真实后端。
- 后台细分权限仍只有 owner/admin 两级，正式商业化后可能需要运营角色和只读角色。

验证命令：

```bash
npm run test:e2e
```

阶段完成后仍需在整轮收口时运行完整验证链路。

## 2026-05-24 P2 第四轮阶段 B 评审

范围：邮件服务商状态回调、`EMAIL_CALLBACK_TOKEN`、投递记录状态更新、管理后台邮件筛选和复制详情。

结论：阶段 B 没有发现阻断问题。邮件链路已经从“只记录发送请求”推进到“能接服务商回调并更新状态”；回调具备最小鉴权，匹配失败不会创建错误投递记录，管理后台也能做日常筛选。

已确认：

- 缺少或错误的邮件回调 token 会被拒绝。
- 回调可按 `delivery_id` 更新投递状态。
- 服务商回调支持 `delivered`、`bounced`、`failed`、`opened`。
- 未匹配回调只写系统事件，不污染 `email_deliveries`。
- 管理后台可以按邮箱、模板、状态筛选邮件投递，并复制详情。

剩余风险：

- 真实邮件服务商的签名算法尚未绑定，目前是通用 token 鉴权。
- 不同服务商事件字段差异较大，接入具体服务商时仍需写 provider adapter。
- 邮件投递列表仍在当前管理弹窗内，正式运营后台会在阶段 C 继续拆分。

验证命令：

```bash
npm run server:test
```

阶段完成后仍需在整轮收口时运行完整验证链路。

## 2026-05-24 P2 第四轮阶段 A 评审

范围：支付 checkout 配置、`POST /api/billing/checkout`、云端面板“账单与套餐”区域、checkout 权限测试与文档更新。

结论：阶段 A 没有发现阻断问题。升级入口已经从“前端未来可能直连支付链接”收敛为“后端创建 checkout”，权限、配置缺失和价格 ID 映射都有测试覆盖，适合继续进入邮件投递回调阶段。

已确认：

- 未登录用户不能创建 checkout。
- 普通成员不能为组织创建 checkout。
- owner/admin 在 checkout 未配置时收到友好业务错误。
- mock 模式可以返回后端生成的升级 URL。
- 配置 `PAYMENT_PLAN_PRICE_MAP` 后，checkout 会从后端解析 price ID。
- 前端本地模式下账单升级按钮禁用，不影响离线工作台。

剩余风险：

- 真实支付服务商 SDK 尚未接入，当前 `webhook` 模式仍是通用 checkout URL 适配。
- 还没有正式账单页、发票信息、支付成功回跳处理。
- 套餐权益仍主要体现在请求限额，付费墙和升级后 UI 引导还需要后续阶段补齐。

验证命令：

```bash
npm run server:test
```

阶段完成后仍需在整轮收口时运行完整验证链路。

## 2026-05-24 P2 第三轮商业化评审

范围：邮件服务商实接说明、支付价格 ID 映射、备份失败告警、管理后台导出/筛选/复制增强、PostgreSQL Store 表级 repository 改造方案，以及相关文档与测试。

结论：本轮没有发现阻断继续灰度试收费准备的问题。支付 webhook 已从“信任套餐字段”推进到“渠道价格 ID 映射”；备份脚本失败路径可被计划任务和告警 webhook 感知；管理后台补齐了运营常用的 CSV 导出、反馈筛选和错误复制；PostgreSQL 正式改造也有了可分阶段执行的施工方案。

已修复：

- `PAYMENT_PLAN_PRICE_MAP` 配置存在时，不再信任 webhook 原始 `plan` 字段，避免伪造字段直接改套餐。
- 备份脚本失败时输出 `{ ok: false }`、返回非 0 退出码，并支持最小化 webhook 告警。
- 管理后台错误/账单事件复制使用渲染时保留的可见数组，避免倒序展示后复制错对象。
- 反馈状态筛选改为本地重渲染，不额外刷新整个后台数据。

已确认：

- 支付失败和退款仍只记录运营事件，不会自动降级。
- 配置价格映射后，未命中价格 ID 的支付成功事件只记录 webhook，不更新组织套餐。
- 备份校验脚本只做只读结构校验，不执行恢复或覆盖。
- 管理后台 CSV 导出使用当前筛选结果，便于灰度运营留档。
- 组织级删除/停用仍只创建草案，不执行不可逆删除。

剩余风险：

- 支付 checkout、账单页和渠道 SDK 仍未接入。
- 邮件投递回调、退信处理和模板平台状态同步还未实现。
- 管理后台仍是前端内嵌弹窗，尚未拆成独立运营页面。
- PostgreSQL Store 仍未完成表级 repository 落地，目前只有拆分方案。
- 备份仍是本地逻辑备份，尚未加密上传对象存储。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
npm run server:backup
npm run server:backup:verify -- <backup-file>
```

当前阶段性结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：15 项通过
- 端到端测试：26 项通过
- 依赖审计：0 个漏洞
- 备份生成、备份校验、备份失败 webhook 告警路径均已验证

下一阶段施工文件：`P2_ROUND4_COMMERCIALIZATION_BUILD_PLAN.md`

## 2026-05-23 P2 第二轮商业化评审

范围：云端管理后台二级页面、用量/审计筛选、反馈状态流转、邮件模板与限流、支付事件适配层、备份校验脚本、组织数据导出和组织删除/停用草案。

结论：本轮没有发现阻断灰度运营的问题。管理后台已经从“单行汇总”推进为可操作二级页面；邮件请求有基础限流；支付事件从简单 plan 更新推进到轻量适配层；组织导出和删除草案具备最小治理闭环。

已确认：

- `GET /api/admin/dashboard` 仍只允许 owner/admin 访问，member 被拒绝。
- 反馈状态更新接口只允许 owner/admin 使用。
- 组织导出不会返回用户密码哈希或 API Key 密文，API Key 只保留 `key_hint` 等公开字段。
- 支付失败和退款只写入系统事件，不会自动降级套餐。
- 组织删除/停用只创建草案系统事件和审计，不会执行不可逆删除。
- 备份校验脚本只读校验 JSON 和必要表结构，不会覆盖线上数据。

剩余风险：

- 管理后台是内嵌二级弹窗，还不是独立运营后台应用。
- 邮件服务商仍通过通用 HTTP webhook 适配，缺少退信和模板平台状态回调。
- 支付渠道仍是通用事件适配，尚未绑定真实渠道价格 ID 与签名 SDK。
- 备份校验不等于完整恢复演练，还缺对象存储、加密存放和失败告警。
- PostgreSQL Store 仍采用快照式读写加 advisory lock，高并发上线前仍需表级 repository 改造。

验证命令：

```bash
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
npm run server:backup
npm run server:backup:verify -- <backup-file>
```

当前阶段性结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：15 项通过
- 端到端测试：26 项通过
- 依赖审计：0 个漏洞
- 备份生成与备份校验通过

下一阶段施工文件：`P2_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md`

## 2026-05-23 P2 第一轮商业化评审

范围：邮件投递适配、邮箱验证和密码重置邮件、支付 webhook HMAC 签名、套餐变更、管理汇总 API、云端面板管理汇总入口、备份脚本和相关测试。

结论：本轮没有发现阻断继续灰度试用的问题。邮件链路已经从“开发响应返回令牌”推进到“生产必须投递邮件”，支付 webhook 已从共享密钥占位升级为签名校验和幂等事件处理，管理汇总和备份脚本能支撑更稳的手工运营。

已修复：

- 支付 webhook 签名比较从普通哈希字符串比较改为 `timingSafeEqual`。
- 后端测试补充普通成员无法访问 `GET /api/admin/dashboard`。
- 后端测试补充过期支付 webhook 请求被拒绝。

已确认：

- 生产环境必须设置 `EMAIL_MODE=webhook`，不会在注册、申请邮箱验证或密码重置响应中暴露一次性令牌。
- 邮件投递会创建 `email_deliveries` 记录，成功/失败状态和重试次数可追踪。
- 支付 webhook 会校验 `x-webhook-timestamp` 和 `x-webhook-signature`，重复事件按 `provider + event_id` 幂等处理。
- owner/admin 可查看管理汇总，member 会被拒绝。
- `npm run server:backup` 可生成逻辑备份并清理过期备份。

剩余风险：

- 邮件 webhook 仍是通用适配层，还没有绑定具体邮件服务商模板、退信处理和验证码频率限制。
- 支付 webhook 已具备通用 HMAC 校验，但还没有接具体支付渠道 SDK，也没有完整处理退款、支付失败、发票失败等事件。
- 管理汇总目前是云端面板入口，不是正式独立后台页面。
- 备份脚本已能导出和清理旧备份，但还缺恢复演练、失败告警和加密存储策略。
- PostgreSQL Store 仍采用快照式读写加 advisory lock，不适合高并发多租户正式上线。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

当前阶段性结果：

- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：15 项通过
- 端到端测试：26 项通过
- 依赖审计：0 个漏洞

下一阶段施工文件：`P2_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md`

## 2026-05-23 P1 第二轮与第三轮评审

范围：账号安全、PostgreSQL Store、团队管理、云端数据导出删除、部署可观测、支付 webhook 占位、运营反馈和第三轮套餐/审计预埋。

结论：本轮没有发现阻断继续灰度试用的问题。账号安全和团队协作已经从“能登录同步”推进到“可邀请小团队试用”：邮箱验证、密码重置、登录节流、退出所有设备、成员管理、最近错误、数据导出删除和内测反馈均已形成最小闭环。

已修复：
- PostgreSQL Store 初版整库快照写回存在多实例覆盖风险；已把读取、变更、写回放入同一事务，并使用 PostgreSQL advisory lock 串行化写入。
- 支付 webhook 密钥比较改为哈希比较，避免直接字符串比较。
- 生产环境不在注册、邮箱验证和密码重置响应中暴露一次性令牌。
- 云端数据导出限制为当前用户拥有的文档和执笔人，避免导出同组织其他成员资料。

已确认：
- 未验证邮箱无法创建团队邀请或管理组织 API Key。
- 邀请接受必须匹配邀请码，邀请列表不会返回 token。
- 登录失败超过阈值会短时限流。
- 密码重置会清除旧 Session。
- 成员角色调整、成员移除、邀请撤销和重发都会写入审计。
- `/api/ready`、`/api/ops/recent-errors`、`/api/billing/summary`、`/api/webhooks/payments`、`/api/feedback` 均有后端测试覆盖。

剩余风险：
- PostgreSQL Store 当前为了兼容既有 Store 接口，仍采用“小团队可用”的快照式读写；正式多租户高并发上线前应改为表级增量写入或专用 repository。
- 邮箱验证和密码重置目前没有接入真实邮件服务，开发/灰度环境会返回令牌，生产环境需要接邮件发送。
- 支付 webhook 目前是共享密钥占位，正式接支付渠道时需要适配渠道签名算法。
- 云端管理能力仍在右侧面板内，后续应拆成独立管理后台。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

当前阶段性结果：
- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：14 项通过
- 端到端测试：26 项通过
- 依赖审计：0 个漏洞

## 2026-05-23 P1 商业化第一轮评审

范围：P1 第一轮商业化补齐，包括生产环境校验、存储抽象、PostgreSQL 迁移预留、组织邀请、云端同步冲突、AI 代理任务分类、套餐配额和前端云端协作入口。

结论：本轮没有发现阻断合并的问题。P1 第一轮已经把 P0 的“可验证后端”推进到更接近灰度上线的形态：生产环境会拒绝默认密钥，云端保存具备版本冲突保护，团队邀请链路有最小闭环，AI 代理能够按任务类型统计消耗。

已确认：
- `NODE_ENV=production` 下缺少强密钥或 `CORS_ORIGIN` 时服务拒绝启动。
- 本地开发仍可使用 JSON Store；`STORE_DRIVER=postgres` 已有接口和迁移草案，但生产读写实现仍保留为显式占位。
- 组织邀请必须由 owner/admin 创建，接受邀请时必须匹配邀请码。
- 文档和执笔人保存会携带版本；版本冲突返回 `version_conflict`，前端提供覆盖、另存、拉取处理。
- AI 代理增加请求超时，使用记录可以按 `task_type` 汇总。
- 套餐配额支持 `free/pro/team` 的基础限制分层。
- JSON Store 写入失败不会继续污染后续写入队列。

剩余风险：
- PostgreSQL Store 目前是预留实现，下一轮需要接入真实数据库驱动、迁移执行和 JSON 数据导入脚本。
- 邮箱验证、密码重置、登录失败节流和 Session 轮换仍未完成。
- 云端冲突提示目前使用轻量确认流程，还没有可视化差异对比。
- 云端团队协作面板是最小入口，成员角色调整、邀请撤销、审计查询还需要继续补。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
```

结果：
- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：9 项通过
- 端到端测试：26 项通过

下一阶段施工文档：`P1_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md`

## 2026-05-23 P0 商业化补齐评审

范围：`server/` 商业化后端、前端“云端”面板、AI 代理接入、同步入口、商业化文档与测试链路。

结论：本轮没有发现阻断 P0 验收的问题。账号、组织隔离、文档/执笔人云端 CRUD、版本、API Key 加密、AI 代理、用量统计、审计日志和前端云端入口已经形成最小闭环。

已确认：
- 未登录用户访问云端业务 API 会被拒绝，`/api/me` 保持本地模式兼容。
- 文档和执笔人按 `organization_id` 隔离。
- API Key 使用 AES-GCM 加密，接口只返回 `key_hint`。
- AI 代理写入成功/失败用量记录，并执行每日用户/组织请求限制。
- 前端本地模式不受影响，云端能力需要用户主动登录和手动同步。
- 云端 AI 代理通过 `credentials: include` 走后端 Session。

剩余风险：
- 当前后端开发模式使用 JSON 文件存储，不适合多人高并发生产环境；P1 需要迁移到数据库。
- 组织成员邀请、邮箱验证、重置密码和更细角色权限仍未实现。
- 云端同步目前是手动覆盖策略，P1 需要加入版本冲突提示。
- `app.js` 因新增云端入口继续膨胀，后续应拆出 `cloudController` 和 `apiSettingsController`。

验证命令：

```bash
npm run build
npm run check
npm test
npm run test:e2e
```

结果：
- 前端与核心单元测试：78 项通过
- 后端商业化 API 测试：6 项通过
- 端到端测试：26 项通过

下一阶段施工文档：`P1_COMMERCIALIZATION_BUILD_PLAN.md`

日期：2026-05-22

范围：当前主线代码、执笔人工作台、文档管理、PPT 生成、测试与文档状态。

## 结论

当前版本已经具备开源演示和本地使用的基础条件：

- 文档管理、编辑、导入导出、垃圾箱和拖拽流程已形成闭环。
- 执笔人从“训练表单”升级为“使用优先”的卡片工作台。
- 执笔人构建链路已经拆出单篇分析、多篇聚合、草案生成、测试和反馈优化。
- PPT 生成可以导出原生 `.pptx`，并支持多种默认风格和自动页数。
- 单元测试与端到端测试覆盖了主要交互路径。

当前没有发现必须阻断发布的 P0 问题。

## 已修复的重点问题

| 问题 | 处理结果 |
| --- | --- |
| 执笔人模块不突出 | 右侧默认进入执笔人工作台，生成窗口降为调用后的目标页 |
| 执笔人列表过重 | 卡片默认收缩，只显示名称和调用；点击后展开详情 |
| 构建中卡片收缩导致进度不可见 | 构建中和失败状态自动展开并显示进度、取消、重试 |
| 点击文档会改变排序 | 改为只高亮当前文档，排序由拖拽或菜单控制 |
| 误删无法恢复 | 增加垃圾箱窗口，支持单个和批量恢复、清除 |
| 导入 Word / PPTX 支持不足 | 增加 `.docx` 和 `.pptx` 内容读取，表格尽量转为 Markdown |
| 搜索输入频繁重渲染 | 增加防抖 |
| 大量数据 localStorage 超限风险 | IndexedDB 成为主存储，localStorage 保留兜底 |
| AI 长耗时不可取消 | 增加 AbortController 和进度反馈 |
| Playwright runner 不退出 | 修复静态服务与测试退出逻辑，便于 CI 稳定运行 |

## 测试状态

最近一次完整验证：

```bash
npm run build
npm run check
npm test
npm run test:e2e
```

结果：

- 前端与核心单元测试：238 项通过
- 后端服务与 repository 测试：94 项通过
- 端到端测试：30 项通过

GitHub Actions 已配置基础 CI，自动运行：

```bash
npm run check
npm test
```

## 架构观察

### 1. `app.js` 仍然偏大

虽然核心能力已经拆到 `src/modules/`，但 `app.js` 仍承担较多页面装配、事件绑定和旧逻辑兼容职责。

建议后续拆分：

- `skillWorkbenchController`
- `skillBuilderModalController`
- `documentPanelController`
- `apiSettingsController`
- `editorContextMenuController`

### 2. 执笔人内部命名仍有历史包袱

UI 和文档已经统一为“执笔人”，但代码中保留了 `skill/style` 命名。这对兼容旧数据和 `.skill.json` 包格式有价值，但会提高新贡献者理解成本。

建议短期保留，长期通过类型注释和边界函数逐步收敛。

### 3. AI 结果仍需要更强的本地预检

当前已经有隐私过滤和个案排除提示，但真正的敏感信息识别仍主要依赖模型输出。

建议增加更强的本地规则：

- 手机号、身份证、邮箱、精确地址检测
- 日期和人名疑似项提示
- 导出执笔人包前的敏感字段预览

### 4. 执笔人版本对比仍偏弱

现在可以查看版本和回退，但差异对比不够直观。

建议增加：

- 强规则变化
- 候选规则变化
- 禁止事项变化
- 常用表达库变化
- 测试通过率变化

### 5. 团队协作仍缺少推荐部署方案

项目目前是本地优先工具。团队使用时可能需要：

- 统一 AI 代理
- 共享执笔人仓库
- 团队模板规范
- 备份策略

这些可以先通过文档说明，再考虑实现。

## 下一轮建议

优先级从高到低：

1. 继续拆分 `app.js` 中的执笔人工作台控制逻辑。
2. 给执笔人包导入增加预览确认和敏感信息提示。
3. 增加执笔人版本差异对比。
4. 增加 API 配置连通性测试和错误诊断面板。
5. 补充团队部署和共享执笔人的文档示例。
