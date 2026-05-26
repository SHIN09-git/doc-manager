# PostgreSQL Store 表级 Repository 改造方案

当前 PostgreSQL Store 为了兼容既有 `read/write` 接口，采用整库快照读写并通过 advisory lock 串行化写入。该方案适合小团队灰度，但不适合正式商业化后的多租户高并发。

## 目标

- 将高频数据从“整库快照写回”改为表级增量 SQL。
- 保持现有 JSON Store 和前端接口兼容。
- 优先覆盖 `documents`、`writer_profiles`、`ai_usage`、`audit_logs`。
- 引入迁移版本表，支持后续多版本增量迁移。

## 非目标

- 本轮不重写所有业务接口。
- 不一次性删除现有 Store `read/write` 兼容层。
- 不引入复杂 ORM，优先使用轻量 SQL repository。

## 目标结构

```text
server/src/db/
  postgresStore.js              # 保留兼容入口
  repositories/
    repositoryContext.js         # 连接池、事务、组织范围、分页工具
    documentRepository.js
    writerRepository.js
    usageRepository.js
    auditRepository.js
  migrations/
    migrationRunner.js
```

每个 repository 只负责单表或强相关表的增量操作，例如：

- `documentRepository.listByOrganization({ organizationId, cursor, limit })`
- `documentRepository.upsert(input)`
- `documentRepository.softDelete(id)`
- `writerRepository.createVersion(writer)`
- `usageRepository.insertUsage(record)`
- `auditRepository.insertAudit(record)`

## 迁移版本表

建议新增：

```sql
create table if not exists migration_versions (
  id text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);
```

迁移文件按顺序命名：

```text
001_initial.sql
002_repository_indexes.sql
003_migration_versions.sql
```

## 分阶段施工

### P3R1：迁移框架

- 新增 `migration_versions`。
- 迁移脚本改为逐个文件执行并记录版本。
- 保持 `001_initial.sql` 兼容已有库。

### P3R2：只读 repository

- [x] 为 `ai_usage` 增加组织级历史查询 repository。
- [x] 为 `audit_logs` 增加组织级审计查询 repository，支持日期、action、target_type 和 limit。
- [x] 为 `documents` 增加组织级分页查询 repository，支持软删除过滤、类型、文件夹和游标分页。
- [ ] 为 `writer_profiles` 增加分页查询。
- [x] 用量、审计和文档列表接口在 PostgreSQL Store 下优先走只读 repository。
- [x] 保留快照读作为兜底，JSON Store 行为不变。

### P3R3：写入 repository

- 文档和执笔人新增/更新/删除改为增量 SQL。
- `ai_usage` 和 `audit_logs` 改为 insert-only。当前评估结论：在审计写入、系统事件和 `ctx.store.write` 快照事务边界拆清前，暂不切写入路径，避免增量写被后续快照写覆盖。
- 版本冲突仍使用现有 `version` 字段。

### P3R4：兼容层收缩

- `postgresStore.read/write` 只保留低频管理或迁移场景。
- 高频 API 不再整库读写。
- 补 PostgreSQL 集成测试。

### P3R5：生产校验

- 压测多组织并发读写。
- 校验分页、软删除、版本冲突、组织隔离。
- 制定备份和回滚步骤。

## 兼容策略

- JSON Store 不变。
- 旧 API 响应结构不变。
- 现有 `server/tests/*.test.js` 必须继续通过。
- 新增 repository 测试时，优先覆盖组织隔离、分页边界、版本冲突和软删除。

## 风险

- 混用快照写和增量写可能产生覆盖风险，迁移阶段需要明确哪些接口已经切换。
- 迁移版本表上线前要先在灰度库验证，避免重复执行旧迁移。
- 分页接口改变默认返回量时，前端需要同步处理“加载更多”或筛选范围。
