# 摹文拟笔工作台

摹文拟笔工作台是一个本地优先的文档与演示稿工作台，用来管理资料、起草文本、训练“执笔人”，并把稳定的写作规范复用到下一次生成里。

它适合需要反复写正式材料的人：学校、机关、企事业单位、社群组织、项目团队都可以把自己的通知、总结、方案、纪要、汇报等样本文档沉淀成可调用的“执笔人”。

## 核心能力

| 模块 | 能做什么 |
| --- | --- |
| 文档管理 | 导入、拖拽、阅读、归类、标签、排序、垃圾箱恢复、真实文件夹关联 |
| 文本编辑 | 手工编辑、查找替换与匹配数量提示、撤销、右键整理格式、段落 AI 改写、默认导出 Word |
| AI 起草 | 用提示词生成新文档、插入到当前文档、覆盖当前文档，并支持 `@调用名` 调用执笔人 |
| 执笔人工作台 | 以卡片方式展示可用执笔人，支持调用、启用、详情、测试、导入导出与重训 |
| 执笔人生成 | 从多篇同类样本中提取结构、文风、句式、禁忌和审稿标准，生成可编辑、可测试、可迭代的写作能力 |
| PPT 生成 | 从文本和资料生成原生 `.pptx`，支持公文汇报、校园培训、瑞士风、归藏风格和自定义风格 |
| AI 接口 | 接入 OpenAI 兼容的 Chat Completions 接口；可本机直连，也可登录后走云端 AI 代理 |
| 云端模式 | 可选商业化后端，支持账号安全、组织、团队邀请、文档/执笔人同步、版本冲突提示、API Key 加密、用量统计、审计日志和灰度反馈 |

云端页内置“功能地图”，把这些能力按“资料与文档、执笔人、生成与演示、云端与商业化”归类，并提供跳转入口。它不是新的功能孤岛，而是给第一次使用或长期运营时的功能导航。

## 为什么是“执笔人”

很多文档不是“写一篇”这么简单，而是要长期稳定地符合某种文种、格式、口吻和审稿习惯。

执笔人的目标是把这些可复用规则沉淀下来：

1. 单篇样本只产生候选规则。
2. 多篇样本共同验证后，才形成强规则。
3. 人名、时间、地点、活动名称、临时安排等个案信息会被过滤，不会被当成通用写法。
4. 每次生成、测试、反馈和重训都会进入版本链路，便于持续优化。

在生成窗口输入提示词时，可以直接使用 `@通知执笔人` 这类调用名；也可以在执笔人卡片上点击“调用”，系统会自动切到生成窗口并写入调用名。

## 快速开始

### 直接打开

这是一个静态前端项目，可以直接打开：

```text
index.html
```

如果浏览器对本地文件权限限制较多，建议使用本地服务。

### 本地服务

```bash
npm install
npm run build
node e2e/serve-static.mjs
```

然后访问：

```text
http://127.0.0.1:4173/index.html
```

如果要部署到真实网站，可以先生成静态发布目录：

```bash
npm run build:static
```

发布目录是 `dist/`。完整上线准备见 [WEBSITE_DEPLOYMENT.md](WEBSITE_DEPLOYMENT.md)。

### 可选云端后端

P0 商业化底座已提供最小后端服务。另开一个终端运行：

```bash
npm run server:dev
```

默认后端地址：

```text
http://127.0.0.1:8787/api
```

然后在右上角“云端”面板注册或登录。未登录时仍然是完整本地工作台；登录后可以完成邮箱验证、手动同步当前文档、当前执笔人，保存组织 API Key，把 AI 调用切换到云端代理，并通过团队协作区邀请和管理成员。owner/admin 可以查看账单与套餐、创建升级入口，也可以进入独立后台页 `admin.html`，管理组织名称、成员邀请、成员角色、组织接口密钥、套餐升级入口和人工确认充值订单，观察用量趋势与成本估算、审计摘要与保存筛选、反馈批处理、反馈/错误负责人备注 SLA、邮件投递、错误筛选和账单事件，导出用量/审计 CSV，并复制详情。operator 运营只读角色可进入后台查看运营数据和保存个人筛选偏好，但不能修改组织、密钥、账单、反馈或错误跟进。

最新后台能力还包括：AI 失败记录可与系统错误使用同一跟进入口保存负责人、备注、优先级和 SLA；审计筛选与后台筛选偏好会按组织和用户保存到云端，并保留本地兜底；成本估算可由后端 `AI_COST_RATES` 统一计算，并在后台展示今日/本月预算摘要；人工确认版充值支持微信/支付宝收款码、用户提交付款备注/凭证、管理员确认后开通会员或发放 AI 额度。

云端开发模式默认使用 `server/.data/db.json`。设置 `STORE_DRIVER=postgres` 和 `DATABASE_URL` 后，后端会使用 PostgreSQL，按 `server/migrations/*.sql` 执行迁移并记录 `migration_versions`。当前已把 `ai_usage` 历史查询、`audit_logs` 审计查询、`documents` 文档列表拆为表级只读 repository，并把后台偏好、AI 失败跟进、反馈处理、系统错误事件跟进、执笔人云端写入、AI 用量写入、额度扣减和人工确认充值等高价值路径推进到表级读写 repository；JSON Store 路径保持不变。生产模式会校验强密钥、`CORS_ORIGIN` 和邮件投递模式，避免默认配置直接上线。邮件发送可选择通用 HTTP webhook 或 Resend 适配，邮件服务商状态可通过 `POST /api/webhooks/email` 回调更新；支付渠道价格 ID 可通过 `PAYMENT_PLAN_PRICE_MAP` 映射到内部套餐；人工确认充值可配置 `MANUAL_PAYMENT_WECHAT_QR_URL`、`MANUAL_PAYMENT_ALIPAY_QR_URL`、`MANUAL_PAYMENT_PACKAGES`；备份可运行 `npm run server:backup`，配置 `BACKUP_ENCRYPTION_KEY` 后会输出 `.json.gcm` 加密备份，也可以配置 S3-compatible 对象存储上传副本。`npm run server:backup:verify -- <backup-file>` 可校验明文或加密备份结构，失败告警可接 `BACKUP_FAILURE_WEBHOOK_URL`。

## 基本流程

1. 在右上角“接口”中配置 AI 服务。
2. 在左侧文档栏导入或拖入资料。
3. 进入默认打开的“执笔人”窗口，点击“生成执笔人”。
4. 从本地或已导入文档中选择 1 到 8 篇同类样本。
5. 启动生成后，卡片会在主窗口显示构建进度和结果。
6. 点击执笔人卡片的“调用”，进入生成窗口继续起草。
7. 在中间编辑区人工修订，最后保存或导出为 Word。

## 支持格式

| 类型 | 导入阅读 | 说明 |
| --- | --- | --- |
| `.txt` / `.md` / `.text` | 支持 | 自动尝试 UTF-8、GB18030、GBK、UTF-16 等编码 |
| `.csv` | 支持 | 会转为可读文本 |
| `.docx` | 支持 | 正文和表格会尽量转为 Markdown |
| `.pptx` | 支持 | 会读取幻灯片中的文本和表格 |
| `.doc` / `.ppt` | 建议转换 | 老格式建议先另存为 `.docx` / `.pptx` 后导入 |
| `.pdf` | 预留入口 | 目前不作为核心稳定格式 |

## AI 接口

默认可以在浏览器里配置自己的 OpenAI 兼容接口：

- Base URL
- Endpoint Path，通常是 `/chat/completions`
- Model
- API Key
- 可选系统提示词

接口配置默认保存在本机浏览器。若启用云端模式，组织 API Key 会提交给后端加密保存，只返回 `key_hint`，后续 AI 请求可通过 `/api/ai/chat` 代理完成，并写入用量统计和审计日志。AI 代理会记录文档生成、段落改写、执笔人构建、PPT 生成等任务类型，便于后续做套餐配额和成本分析。AI 请求失败时，工作台会给出友好错误提示，并对超时、限流、JSON 解析问题做重试和容错。

## 快捷键

- `Ctrl/Cmd+S`：在文档标题、正文、类型、文件夹或默认执笔人控件中保存当前文档。
- `Ctrl/Cmd+Z`：在正文编辑框中调用工作台撤销。
- `Esc`：关闭右键菜单、`@执笔人` 提及面板、执笔人生成弹窗或响应式工具抽屉。

## 开发命令

```bash
npm install
npm run build
npm run check
npm test
npm run test:e2e
```

当前测试覆盖：

- 前端与核心单元测试：238 项
- 后端服务与 repository 测试：100 项
- 端到端测试：30 项
- GitHub Actions：自动运行 `npm run check` 和 `npm test`

## 项目结构

```text
school-doc-manager/
├─ index.html              # 页面结构
├─ admin.html              # 独立管理后台页面
├─ styles.css              # 设计 token 与界面样式
├─ app.js                  # 兼容层与页面装配
├─ src/
│  ├─ main.js              # 打包入口
│  ├─ admin/               # 独立后台页面脚本
│  ├─ modules/             # 文档、自定义类型、编辑器、导入拖拽、执笔人、PPT、AI、云端 API/会话/同步/用户操作/面板、功能地图、存储等模块
│  ├─ ui/                  # 图标、主题、布局、视图切换和通用 UI 组件
│  └─ utils/               # 事件、DOM、拖拽路由、通用工具
├─ server/                 # 商业化后端：账号安全、组织、团队、同步、AI 代理、用量、审计、邮件、支付、备份
├─ test/                   # 单元测试
├─ e2e/                    # Playwright 端到端测试与静态服务
└─ build/bundle.js         # 构建产物，index.html 直接加载它
```

更完整的架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 数据与隐私

摹文拟笔工作台默认本地优先：

- 文档内容、执笔人、版本和配置主要存放在浏览器 IndexedDB。
- localStorage 只作为轻量启动与兼容兜底。
- 只有你主动调用 AI 时，相关提示词、样本摘要或生成内容才会发送到你配置的 AI 服务。
- 本机直连模式下，API Key 保存在本机浏览器，不会提交到仓库。
- 云端模式下，API Key 只在后端加密存储，前端和 API 响应只显示 `key_hint`。

使用真实敏感材料前，请先确认你配置的 AI 服务与单位数据规范相符。更多说明见 [SECURITY.md](SECURITY.md)。

## 文档

- [GETTING_STARTED.md](GETTING_STARTED.md)：面向使用者的上手指南
- [ARCHITECTURE.md](ARCHITECTURE.md)：面向开发者的架构说明
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献指南
- [TODO.md](TODO.md)：后续路线图
- [REVIEW.md](REVIEW.md)：当前代码评审记录
- [SECURITY.md](SECURITY.md)：安全与隐私说明
- [CHANGELOG.md](CHANGELOG.md)：更新记录
- [COMMERCIALIZATION_PLAN.md](COMMERCIALIZATION_PLAN.md)：商业化总体规划
- [COMMERCIALIZATION_PROGRESS_REPORT.md](COMMERCIALIZATION_PROGRESS_REPORT.md)：商业化阶段总结与未完成清单
- [P2_ROUND1_COMMERCIALIZATION_BUILD_PLAN.md](P2_ROUND1_COMMERCIALIZATION_BUILD_PLAN.md)：邮件、签名支付 webhook、管理汇总和备份施工记录
- [P2_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md](P2_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md)：管理后台、支付适配、备份校验和组织治理施工记录
- [P2_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md](P2_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md)：邮件/支付实接、备份告警、管理后台增强施工记录
- [P2_ROUND4_COMMERCIALIZATION_BUILD_PLAN.md](P2_ROUND4_COMMERCIALIZATION_BUILD_PLAN.md)：支付入口、邮件回调、独立后台、PostgreSQL repository 试点和备份加固施工记录
- [P2_ROUND6_COMMERCIALIZATION_BUILD_PLAN.md](P2_ROUND6_COMMERCIALIZATION_BUILD_PLAN.md)：后台权限边界、AI 失败跟进、成本预算、后台偏好与 SLA 运营闭环施工记录
- [P2_ROUND7_COMMERCIALIZATION_BUILD_PLAN.md](P2_ROUND7_COMMERCIALIZATION_BUILD_PLAN.md)：PostgreSQL 写入拆分、后台角色细分和真实服务商联调计划
- [P2_ROUND4_EXECUTION_PLAN.md](P2_ROUND4_EXECUTION_PLAN.md)：P2 第四轮阶段 A-F 执行记录
- [P2_ROUND5_COMMERCIALIZATION_BUILD_PLAN.md](P2_ROUND5_COMMERCIALIZATION_BUILD_PLAN.md)：真实服务商集成、PostgreSQL repository 扩面和恢复演练施工计划与阶段 A 记录
- [P1_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md](P1_ROUND2_COMMERCIALIZATION_BUILD_PLAN.md)：灰度能力施工记录
- [P1_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md](P1_ROUND3_COMMERCIALIZATION_BUILD_PLAN.md)：运营与计费预埋施工记录
- [DEPLOYMENT.md](DEPLOYMENT.md)：灰度部署指南
- [PRIVACY_POLICY.md](PRIVACY_POLICY.md)：隐私政策草案
- [TERMS_OF_SERVICE.md](TERMS_OF_SERVICE.md)：用户协议草案

## 许可证

MIT
