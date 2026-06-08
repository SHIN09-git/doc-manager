# 真实网站上线准备清单

本文档用于把“摹文拟笔工作台”从本地项目部署成可通过域名访问的网站。

## 推荐架构

第一版建议采用“静态前端 + Node API + PostgreSQL”的拆分：

| 部分 | 建议 |
| --- | --- |
| 主站域名 | `https://your-domain.example` |
| API 域名 | `https://api.your-domain.example` |
| 前端托管 | Cloudflare Pages / Vercel / Render Static Site |
| 后端托管 | Render / Railway / Fly.io / VPS + Docker |
| 数据库 | PostgreSQL，推荐 Neon / Supabase / Render PostgreSQL / 云厂商 RDS |
| 邮件 | Resend 优先，或任意 HTTP webhook 邮件服务 |
| 充值 | 先用微信/支付宝收款码 + 管理员后台人工确认 |
| HTTPS | 托管平台自动签发，或 Cloudflare + 源站证书 |

## 你需要自己准备

1. 域名：至少一个主域名，可选再加 `api.` 子域名。
2. 托管账号：Cloudflare/Vercel/Render/Railway/服务器任选。
3. PostgreSQL 数据库连接地址。
4. 邮件服务账号，例如 Resend API Key。
5. AI 服务商 Key，或后续由管理员在后台配置组织 API Key。
6. 微信和支付宝收款码图片，并能通过 HTTPS URL 访问。
7. 套餐定价：例如 Pro 月费、Team 月费、AI 额度包。

## 本仓库已准备

| 文件 | 用途 |
| --- | --- |
| `scripts/build-static.mjs` | 生成可部署的静态前端目录 `dist/` |
| `server/env.production.example` | 生产环境变量模板 |
| `Dockerfile` | 构建后端 API 镜像 |
| `docker-compose.prod.yml` | VPS 单机部署 API + PostgreSQL 的参考配置 |
| `render.yaml` | Render 静态站 + API + PostgreSQL 的蓝图草案 |
| `DEPLOYMENT.md` | 更详细的灰度部署、邮件、备份和 PostgreSQL 说明 |

## 前端部署

生成静态目录：

```bash
npm install
npm run build:static
```

部署时把 `dist/` 作为发布目录。里面包含：

- `index.html`：用户工作台
- `admin.html`：管理员后台
- `styles.css`
- `build/bundle.js`
- `src/admin/adminPage.js`

部署完成后，访问：

```text
https://your-domain.example/index.html
https://your-domain.example/admin.html
```

上线后用户需要在工作台右上角“云端”里填写后端 API 地址：

```text
https://api.your-domain.example/api
```

后续可以再做“默认云端 API 地址”的产品化配置，减少用户手填。

## 后端部署

复制生产环境变量模板：

```bash
copy server\env.production.example server\.env.production
```

Linux/macOS：

```bash
cp server/env.production.example server/.env.production
```

重点修改：

```bash
DATABASE_URL=postgres://...
APP_URL=https://your-domain.example/index.html
CORS_ORIGIN=https://your-domain.example
SESSION_SECRET=随机长字符串
APP_ENCRYPTION_SECRET=另一个随机长字符串
EMAIL_FROM=摹文拟笔工作台 <noreply@your-domain.example>
EMAIL_RESEND_API_KEY=re_xxx
MANUAL_PAYMENT_RECEIVER_NAME=你的收款主体
MANUAL_PAYMENT_WECHAT_QR_URL=https://your-domain.example/assets/wechat-pay.png
MANUAL_PAYMENT_ALIPAY_QR_URL=https://your-domain.example/assets/alipay.png
MANUAL_PAYMENT_PACKAGES=[...]
```

本地模拟生产 API：

```bash
npm run start:api
```

Docker Compose 参考：

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

健康检查：

```text
GET https://api.your-domain.example/api/health
GET https://api.your-domain.example/api/ready
```

## Render 部署参考

仓库已提供 `render.yaml`。使用 Render Blueprint 时需要重点填写这些环境变量：

- `APP_URL`
- `CORS_ORIGIN`
- `EMAIL_FROM`
- `EMAIL_RESEND_API_KEY`
- `MANUAL_PAYMENT_RECEIVER_NAME`
- `MANUAL_PAYMENT_WECHAT_QR_URL`
- `MANUAL_PAYMENT_ALIPAY_QR_URL`
- `MANUAL_PAYMENT_PACKAGES`

Render 创建后通常会得到两个地址：

```text
https://mowen-web.onrender.com
https://mowen-api.onrender.com/api
```

绑定域名后建议改为：

```text
https://your-domain.example
https://api.your-domain.example/api
```

## DNS 记录

常见配置：

| 记录 | 类型 | 指向 |
| --- | --- | --- |
| `@` | CNAME / A | 前端托管平台 |
| `www` | CNAME | 前端托管平台 |
| `api` | CNAME / A | 后端托管平台 |

如果使用 Cloudflare，建议开启代理和自动 HTTPS。

## 人工确认充值上线流程

1. 准备微信和支付宝收款码图片。
2. 把图片上传到可 HTTPS 访问的位置。
3. 在 `MANUAL_PAYMENT_*` 环境变量里配置收款码和套餐。
4. 用户在“我的云端 → 套餐与充值”提交订单。
5. 管理员进入 `admin.html`，在“账单”中确认或拒绝订单。
6. 确认后系统自动开通套餐或增加 AI 额度。

## 上线前检查

```bash
npm run build:static
npm run check
npm test
npm run test:e2e
npm run deploy:check -- server/.env.production
```

后端生产模式必须满足：

- `NODE_ENV=production`
- `STORE_DRIVER=postgres`
- `DATABASE_URL` 有效
- `SESSION_SECRET` 和 `APP_ENCRYPTION_SECRET` 足够长且不是默认值
- `EMAIL_MODE=webhook`
- `CORS_ORIGIN` 指向真实前端域名
- `SESSION_SECURE=true`

## 我现在能继续做的事

1. 把默认云端 API 地址改成线上域名配置，减少用户手填。
2. 做一个 `/assets` 静态目录，用来放收款码和品牌图片。
3. 根据真实域名和套餐配置继续扩展部署环境自检规则。
4. 把 GitHub Actions 增加 `npm run build:static` 检查。
5. 根据你选择的平台，继续细化 Cloudflare Pages、Vercel、Render 或 VPS 的专门部署文档。
