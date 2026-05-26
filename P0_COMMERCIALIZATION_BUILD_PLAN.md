# P0 商业化补齐施工文档

## 2026-05-23 施工状态

本轮已按 P0 顺序补齐最小商业化底座：

- `COMMERCIAL_ARCHITECTURE.md`：完成商业化边界、云端链路、数据/隐私责任划分。
- `DATABASE_SCHEMA.md`：完成最小数据模型与后续迁移边界。
- `server/`：完成 Node 原生 HTTP 后端骨架，包含账号、组织、文档、执笔人、版本、API Key、AI 代理、用量、审计。
- 前端：新增“云端”面板，本地模式保持可用，登录后可手动同步文档/执笔人并启用云端 AI 代理。
- 安全：密码哈希、Session Cookie、组织隔离、API Key 加密、基础限流、审计日志已进入 P0 实现。

本文件后续保留为 P0 施工依据；下一阶段进入 `P1_COMMERCIALIZATION_BUILD_PLAN.md`。

本文档用于指导「摹文拟笔工作台」商业化 P0 级别能力的补齐。目标不是一次性做完整 SaaS，而是先搭好后续账号、组织、云端执笔人、AI 代理、额度和计费都依赖的底座。

## P0 总目标

把当前本地优先的浏览器工作台，升级为：

```text
未登录：继续本地使用
登录后：支持云端账号、组织、云端执笔人、AI 代理和用量统计
团队版：后续可扩展组织执笔人库、权限、审计和订阅
```

P0 不追求完整商业闭环，但必须解决：

- 用户是谁
- 属于哪个组织
- 数据存在哪里
- AI 请求从哪里走
- 谁能访问什么
- 用量如何统计
- 敏感数据如何保护

## 总体施工顺序

推荐顺序：

```text
1. 商业化架构草案
2. 数据模型
3. 后端 API 骨架
4. 登录与组织
5. AI 代理
6. 云端文档与执笔人同步
7. 用量统计与限流
8. 安全基线
9. 前端接入与本地模式兼容
```

不要先做：

- 支付系统
- 官网首页
- 复杂权限矩阵
- 协同编辑
- 模板市场
- 多模型市场

这些都依赖 P0 底座。

## P0-1：商业化架构草案

### 目标

明确商业化版本的系统边界，避免后续边做边推翻。

### 需要产出

- `COMMERCIAL_ARCHITECTURE.md`
- 前后端职责划分
- 本地模式与云端模式的边界
- AI 调用链路图
- 数据存储与隐私边界

### 建议架构

```text
Browser App
  - 本地文档编辑
  - 本地 IndexedDB / localStorage
  - 登录状态识别
  - 云端同步入口

Backend API
  - 用户认证
  - 组织管理
  - 文档 / 执笔人云端存储
  - AI 代理
  - 用量统计
  - 审计日志

Database
  - 用户
  - 组织
  - 文档
  - 执笔人
  - AI 用量
  - 审计日志

Object Storage
  - 大文件
  - 导入原始文件，可选
  - 导出文件，可选

AI Providers
  - OpenAI
  - 兼容 OpenAI 接口的第三方模型
  - 后续可扩展本地 / 私有模型
```

### 验收标准

- 能解释清楚未登录用户和登录用户的数据差异。
- 能解释清楚 AI Key 存在前端还是后端。
- 能解释清楚组织数据如何隔离。
- 能解释清楚哪些能力属于 P0，哪些延后。

## P0-2：核心数据模型

### 目标

先设计商业化底座最小数据模型，后续 API 和权限都以此为准。

### 核心表

#### users

用户表。

字段建议：

- `id`
- `email`
- `name`
- `avatar_url`
- `password_hash`
- `created_at`
- `updated_at`
- `last_login_at`
- `disabled_at`

#### organizations

组织表。

字段建议：

- `id`
- `name`
- `slug`
- `plan`
- `created_by`
- `created_at`
- `updated_at`

#### memberships

组织成员关系。

字段建议：

- `id`
- `organization_id`
- `user_id`
- `role`
- `created_at`

角色先只做：

- `owner`
- `admin`
- `member`

#### documents

云端文档表。

字段建议：

- `id`
- `organization_id`
- `owner_id`
- `title`
- `type`
- `folder_id`
- `content`
- `source`
- `created_at`
- `updated_at`
- `deleted_at`

#### writer_profiles

执笔人表。

字段建议：

- `id`
- `organization_id`
- `owner_id`
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

#### writer_versions

执笔人版本表。

字段建议：

- `id`
- `writer_profile_id`
- `version`
- `summary_md`
- `skill_json`
- `quality_report`
- `created_by`
- `created_at`

#### ai_usage

AI 用量记录。

字段建议：

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
- `created_at`

#### api_keys

用户或组织模型 Key 配置。

字段建议：

- `id`
- `organization_id`
- `user_id`
- `provider`
- `encrypted_key`
- `key_hint`
- `created_at`
- `updated_at`
- `disabled_at`

#### audit_logs

审计日志。

字段建议：

- `id`
- `organization_id`
- `user_id`
- `action`
- `target_type`
- `target_id`
- `metadata`
- `created_at`

### 验收标准

- 所有云端数据都能关联到 `organization_id`。
- 执笔人有版本表。
- AI 用量能按用户和组织统计。
- API Key 不以明文存储。
- 文档和执笔人都支持软删除。

## P0-3：后端 API 骨架

### 目标

先搭一个最小后端服务，让前端可以从纯本地应用过渡到云端增强应用。

### 建议目录

```text
server/
  src/
    app.ts
    config/
    db/
    middleware/
    modules/
      auth/
      organizations/
      documents/
      writers/
      ai/
      usage/
      audit/
    utils/
  tests/
  package.json
  .env.example
```

如果先不引入 TypeScript，也可以用：

```text
server/
  src/
    app.js
    ...
```

### 最小 API

#### 健康检查

```text
GET /api/health
```

返回服务状态。

#### 当前用户

```text
GET /api/me
```

返回当前用户、组织和权限。

#### 组织

```text
GET /api/orgs
POST /api/orgs
GET /api/orgs/:orgId
```

#### 文档

```text
GET /api/documents
POST /api/documents
GET /api/documents/:id
PUT /api/documents/:id
DELETE /api/documents/:id
```

#### 执笔人

```text
GET /api/writers
POST /api/writers
GET /api/writers/:id
PUT /api/writers/:id
DELETE /api/writers/:id
GET /api/writers/:id/versions
POST /api/writers/:id/versions/:versionId/restore
```

#### AI 代理

```text
POST /api/ai/chat
```

后续所有 AI 调用都从这里走。

#### 用量

```text
GET /api/usage/current
GET /api/usage/history
```

### 验收标准

- 后端可以独立启动。
- `/api/health` 可访问。
- `/api/me` 能返回模拟用户。
- 文档和执笔人的 CRUD 路由存在。
- AI 代理入口存在，即使第一版只返回 mock。
- 有 `.env.example`。

## P0-4：登录与组织

### 目标

让系统知道当前用户是谁、属于哪个组织、拥有什么角色。

### 最小实现

- 邮箱 + 密码注册
- 邮箱 + 密码登录
- Session 或 JWT
- 当前用户接口
- 默认创建个人组织
- 组织成员角色

### 权限规则

P0 只做简单规则：

| 角色 | 能力 |
| --- | --- |
| owner | 管理组织、成员、数据、配置 |
| admin | 管理文档、执笔人、成员 |
| member | 使用文档、执笔人、AI 生成 |

### 验收标准

- 未登录不能访问云端 API。
- 登录后能获取用户和组织。
- 新用户默认有一个个人组织。
- API 返回当前用户角色。
- 前端可以显示“本地模式 / 云端模式”。

## P0-5：AI 代理

### 目标

把 AI 调用从前端直连改成后端代理，为额度、计费、审计和模型切换打基础。

### 最小能力

```text
POST /api/ai/chat
```

请求字段：

- `task_type`
- `messages`
- `model`
- `temperature`
- `metadata`

后端负责：

- 校验登录状态
- 校验组织额度
- 读取模型配置
- 调用模型供应商
- 记录用量
- 返回结果
- 处理错误

### Key 策略

支持两种：

- 用户自带 Key
- 平台托管 Key

P0 可以先做用户自带 Key，但接口设计要预留平台托管。

### 验收标准

- 前端可以通过后端完成一次 AI 调用。
- 后端不会把 API Key 返回给前端。
- 调用失败有友好错误。
- 用量被写入 `ai_usage`。
- 支持取消或超时。

## P0-6：云端文档与执笔人同步

### 目标

保留本地优先模式，同时允许登录用户将文档和执笔人保存到云端。

### 文档同步

需要支持：

- 上传当前文档到云端
- 从云端拉取文档列表
- 更新云端文档
- 软删除云端文档
- 本地文档和云端文档的来源标记

### 执笔人同步

需要支持：

- 上传执笔人
- 拉取组织执笔人库
- 更新执笔人
- 查看版本
- 回退版本
- 启用 / 停用
- 导入 / 导出保留

### 冲突策略

P0 先做简单策略：

- 云端保存时覆盖云端最新版。
- 若云端更新时间晚于本地，提示用户确认。
- 不做实时协同编辑。

### 验收标准

- 未登录时现有本地功能不受影响。
- 登录后可以保存文档到云端。
- 登录后可以保存执笔人到云端。
- 云端数据都有组织隔离。
- 删除是软删除。

## P0-7：用量统计与限流

### 目标

防止 AI 成本失控。

### 最小统计

按以下维度统计：

- 用户
- 组织
- 模型
- 任务类型
- 日期
- token 数
- 估算成本
- 成功 / 失败

### 最小限流

P0 可先做：

- 每用户每日请求数
- 每组织每日请求数
- 单次输入长度限制
- 单文件大小限制
- 失败重试上限

### 验收标准

- 超额请求会被拦截。
- 前端能看到友好提示。
- 管理员能查看基础用量。
- AI 调用失败也会记录状态。

## P0-8：安全基线

### 目标

避免商业化上线时出现基础安全问题。

### 必做项

- HTTPS
- 密码哈希
- API Key 加密存储
- 后端鉴权中间件
- 组织数据隔离
- 文件类型限制
- 文件大小限制
- XSS 防护
- CSRF 防护，若使用 Cookie session
- 请求限流
- 审计日志
- 错误信息脱敏
- 数据备份

### API Key 加密

要求：

- 不明文入库
- 不返回前端
- 只显示 `key_hint`
- 支持禁用和替换

### 审计日志

至少记录：

- 登录
- 创建文档
- 删除文档
- 创建执笔人
- 修改执笔人
- 删除执笔人
- AI 调用
- API Key 配置变更

### 验收标准

- 不能跨组织读取数据。
- API Key 不出现在响应和日志里。
- 上传危险文件会被拒绝。
- 重要操作有审计日志。

## P0-9：前端接入与本地模式兼容

### 目标

让当前前端平滑接入云端能力，而不是推翻现有本地工作台。

### 前端状态

需要增加：

- 登录状态
- 当前组织
- 当前同步模式
- 云端保存状态
- AI 代理模式
- 用量状态

### UI 入口

需要增加：

- 登录 / 退出
- 当前组织切换
- 本地 / 云端标识
- 保存到云端
- 从云端导入
- 用量提示
- API Key 云端配置入口

### 兼容规则

- 未登录时：所有当前本地功能继续可用。
- 登录后：用户可以选择同步，不强制上传。
- 本地 API Key 功能可保留。
- 云端 API Key 配置必须走后端加密。

### 验收标准

- 旧用户打开页面不丢数据。
- 未登录可继续使用。
- 登录后能看到云端能力入口。
- 前端 AI 调用可以切换为后端代理。

## 第一轮最小施工建议

建议第一轮只做这些：

```text
1. COMMERCIAL_ARCHITECTURE.md
2. DATABASE_SCHEMA.md
3. server/ 后端骨架
4. .env.example
5. /api/health
6. /api/me mock
7. /api/ai/chat mock
8. 前端保留本地模式，不接真实云同步
```

第一轮不要做真实支付和复杂权限。

## 第二轮施工建议

```text
1. 真实用户注册 / 登录
2. 默认个人组织
3. 文档云端 CRUD
4. 执笔人云端 CRUD
5. AI 代理接真实模型
6. ai_usage 写入
```

## 第三轮施工建议

```text
1. 用量限制
2. API Key 加密存储
3. 审计日志
4. 前端云端同步入口
5. 基础管理后台
```

## P0 完成定义

P0 完成时，应满足：

- 有后端服务。
- 有账号系统。
- 有组织模型。
- 有文档云端存储。
- 有执笔人云端存储。
- AI 调用走后端代理。
- 有基础用量统计。
- 有基础限流。
- API Key 加密。
- 组织数据隔离。
- 未登录本地模式不受影响。

完成这些之后，才适合进入：

- 支付系统
- 官网转化页
- Pro / Team 套餐
- 私有化部署包装
