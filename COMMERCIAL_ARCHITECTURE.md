# 商业化 P0 架构说明

本文档描述「摹文拟笔工作台」P0 商业化底座的工程边界。

## 模式

```text
未登录：本地模式
登录后：云端增强模式
```

本地模式继续使用浏览器端 IndexedDB / localStorage，不强制上传用户文档。云端增强模式通过后端 API 提供账号、组织、云端文档、云端执笔人、AI 代理、用量统计和审计日志。

## 组件

```text
Browser App
  - 文档编辑
  - 执笔人使用与构建
  - 本地存储
  - 云端模式入口

Commercial API Server
  - 认证与 Session
  - 组织与成员
  - 文档 CRUD
  - 执笔人 CRUD + 版本
  - AI 代理
  - API Key 加密
  - 用量统计
  - 审计日志

JSON Store for P0
  - 适合本地开发、内测和接口验证
  - P1 可迁移到 PostgreSQL / MySQL / SQLite

AI Provider
  - 默认 mock
  - 配置 Key 后走 OpenAI-compatible Chat Completions
```

## 数据边界

- 未登录用户的数据只保留在浏览器本地。
- 登录后的云端数据必须带 `organization_id`。
- API Key 只在后端加密存储，不返回前端。
- AI 调用统一经过 `/api/ai/chat`，用于限流、统计和审计。

## P0 暂不做

- 支付
- 官网转化页
- 复杂团队权限矩阵
- 实时协同编辑
- 模板市场
- 多模型市场

