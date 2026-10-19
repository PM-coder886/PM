# Personal Blog API

Cloudflare Workers + Hono + D1 + R2 的个人博客 REST API。所有业务接口以 `/api/v1` 为前缀；`/health` 为健康检查。

## 项目结构

```text
blog-api/
├── migrations/
│   └── 0001_init.sql
│   └── 0002_blog_features.sql
├── src/
│   ├── index.ts                 # Hono 应用、CORS、定时发布 Cron
│   ├── types.ts                 # Workers bindings/context 类型
│   ├── lib/
│   │   └── auth.ts              # HMAC-SHA256 JWT、管理员鉴权
│   ├── middleware/
│   │   └── rate-limit.ts        # 基于 D1 的 IP 限流
│   └── routes/
│       ├── auth.ts
│       ├── posts.ts
│       ├── community.ts         # 分类、标签、评论、点赞、友链、留言板
│       ├── site.ts              # 站点配置、R2 图片上传
│       └── meta.ts              # 归档、图库、统计、Sitemap、RSS
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## 初始化和运行

在 `blog-api` 目录执行以下命令：

```powershell
npm install
npx wrangler login

# 创建 D1 和 R2
npx wrangler d1 create blog-db
npx wrangler r2 bucket create blog-media
```

将 `wrangler d1 create` 输出的数据库 ID 填入 `wrangler.toml` 的 `database_id`。为图片桶绑定一个公开访问域名（推荐使用 R2 自定义域名），再把 `R2_PUBLIC_BASE_URL` 改为该域名；它只用于生成图片 URL，不会公开桶的写权限。

配置管理员和 JWT 签名密钥。生产环境通过 Wrangler Secret 保存，不要把真实密钥提交到代码库：

```powershell
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put JWT_SECRET
```

`JWT_SECRET` 应是随机生成的高熵字符串（至少 32 字节）；管理员账号由上述 Worker Secrets 配置，不在数据库中保存密码。`CORS_ORIGIN` 可在 `wrangler.toml` 中配置一个或多个逗号分隔的前端源；只允许公开配置 API 的站点源，禁止将含凭据的管理站点配置为 `*`。生产环境还应配置 `PUBLIC_SITE_URL`（用于 Sitemap/RSS 链接）、`SITE_TITLE` 和图片自定义域名 `R2_PUBLIC_BASE_URL`。

本地开发时在 `blog-api/.dev.vars` 写入下列变量（仅本地使用，不提交）：

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-local-password
JWT_SECRET=replace-with-a-random-secret-at-least-32-bytes-long
```

管理员登录和私密文章解锁共用 `JWT_SECRET`。`.dev.vars` 应保持在本地，不要提交。

然后执行：

```powershell
npm run db:local
npm run dev
```

初始化远端数据库、部署：

```powershell
npm run db:remote
npm run deploy
```

`wrangler.toml` 已配置每 5 分钟运行一次 Cron：到期定时文章发布，并清理过期限流窗口记录。可使用 `npx wrangler deployments list` 查看部署，使用 `npx wrangler tail` 查看线上日志。

## API

除登录、健康检查外，管理接口都要求请求头 `Authorization: Bearer <access_token>`。参数校验失败返回 `400`，未授权返回 `401`，限流返回 `429`；JSON 响应使用 `{ "data": ... }` 或 `{ "error": "..." }`。

### 管理员和文章

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | 公开 | 管理员登录，提交 `{ "username", "password" }` |
| GET | `/api/v1/auth/me` | 管理员 | 验证当前 Token |
| GET | `/api/v1/posts?page=1&limit=20&q=term&category=slug&tag=slug` | 公开 | 已发布文章分页、搜索和分类/标签筛选 |
| GET | `/api/v1/posts/:slug` | 公开 | 读取已发布文章 |
| POST | `/api/v1/posts/:slug/unlock` | 公开 | 校验密码并获取 1 小时文章访问令牌 |
| GET | `/api/v1/admin/posts?status=draft&q=term` | 管理员 | 全部文章分页/筛选 |
| GET | `/api/v1/admin/posts/:id` | 管理员 | 读取文章（包含草稿） |
| POST | `/api/v1/posts` | 管理员 | 创建文章 |
| PATCH | `/api/v1/posts/:id` | 管理员 | 更新文章 |
| DELETE | `/api/v1/posts/:id` | 管理员 | 删除文章 |

文章字段：`slug`、`title`、`content` 必填；`excerpt`、`cover_image`、`category_id`、`tag_ids`、`password` 可选。`status` 为 `draft`、`published` 或 `scheduled`。公开读取私密文章时不返回正文；先提交密码到 unlock 接口，再把响应的 token 放入 `X-Post-Token` 请求头获取正文。创建文章传入非空 `password` 可启用密码保护，更新时传 `password: ""` 可移除密码。定时发布时须提供未来的 ISO-8601 `scheduled_at`，例如：

```json
{
  "slug": "hello-world",
  "title": "Hello world",
  "content": "文章正文",
  "status": "scheduled",
  "scheduled_at": "2027-01-01T09:00:00.000Z",
  "tag_ids": []
}
```

### 分类、标签、互动和站点

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| GET/POST | `/api/v1/categories` | GET 公开；POST 管理员 | 分类列表/创建 |
| PATCH/DELETE | `/api/v1/categories/:id` | 管理员 | 更新/删除分类 |
| GET/POST | `/api/v1/tags` | GET 公开；POST 管理员 | 标签列表/创建 |
| PATCH/DELETE | `/api/v1/tags/:id` | 管理员 | 更新/删除标签 |
| GET/POST | `/api/v1/posts/:id/comments` | 公开 | 已审核评论列表/提交评论（待审核） |
| POST 评论字段 | `parent_id` | 公开 | 回复同一文章下已审核的评论 |
| GET | `/api/v1/admin/comments?status=pending` | 管理员 | 管理评论 |
| PATCH/DELETE | `/api/v1/admin/comments/:id` | 管理员 | 审核 `{ "status": "approved" }` 或删除 |
| GET/POST/DELETE | `/api/v1/posts/:id/likes` | 公开 | 查询、点赞、取消点赞；每个 Cloudflare 客户端 IP 对每篇文章计一次 |
| GET/POST/DELETE | `/api/v1/posts/:id/bookmarks` | 公开 | 查询互动状态（likes GET）、收藏和取消收藏 |
| GET | `/api/v1/friends` | 公开 | 已审核友链 |
| POST | `/api/v1/friends` | 公开 | 提交友链申请（等待审核） |
| GET/POST | `/api/v1/admin/friends` | 管理员 | 查看全部/创建友链 |
| PATCH/DELETE | `/api/v1/admin/friends/:id` | 管理员 | 更新/删除友链 |
| GET/POST | `/api/v1/guestbook` | 公开 | 已审核留言分页/提交留言（待审核） |
| GET | `/api/v1/admin/guestbook?status=pending` | 管理员 | 管理留言 |
| PATCH/DELETE | `/api/v1/admin/guestbook/:id` | 管理员 | 审核或删除留言 |
| GET | `/api/v1/settings` | 公开 | 获取站点公开配置 |
| PUT/DELETE | `/api/v1/admin/settings`、`/api/v1/admin/settings/:key` | 管理员 | 批量写入或删除站点配置 |
| POST | `/api/v1/admin/uploads` | 管理员 | multipart 表单字段 `file` 上传图片到 R2 |
| DELETE | `/api/v1/admin/uploads/:name` | 管理员 | 删除上传图片（`name` 为返回的 key 最后一段） |
| GET | `/api/v1/gallery?limit=30&cursor=...` | 公开 | 分页读取 R2 图库 |
| GET | `/api/v1/archives` | 公开 | 按年月统计已发布文章 |
| GET | `/api/v1/stats` | 公开 | 获取公开访问量和文章总数 |
| GET | `/api/v1/admin/stats?days=30` | 管理员 | 获取每日访问趋势、热门文章和待审核数量 |
| POST | `/api/v1/page-views` | 公开 | 记录页面路径与日期，不记录 IP 或用户标识 |
| GET | `/api/v1/sitemap.xml`、`/api/v1/feed.xml` | 公开 | 生成 Sitemap 和 RSS |

友链和留言的审核状态为 `pending`、`approved`、`rejected`。只把非机密的公开站点配置写入 settings，因为公开读取接口会返回其中全部键值。

## 安全与运维说明

- CORS 来源由 `CORS_ORIGIN` 精确配置；请求体限制 6 MiB，R2 图片限 JPEG/PNG/WebP/GIF/AVIF，单张最大 5 MiB。
- D1 限流按客户端 IP 计数：常规 API 每分钟 120 次，登录和文章密码解锁每分钟 5 次。限流状态跨 Worker 实例共享；每次 API 请求会写入 D1。Cron 每 5 分钟清理一小时以前的窗口数据。
- 文章浏览统计保留文章累计数及每日页面路径计数；`page_views` 不包含 IP、Cookie 或其他访客标识。点赞/收藏使用带密钥的客户端 IP HMAC，仅作为去重值保存。
- R2 上传使用 UUID 文件名，不接受客户端提供的对象路径。配置 `R2_PUBLIC_BASE_URL` 前，应先为 R2 配好只读公开域名。
- 定期备份 D1；更改 JWT Secret 会使现有 Token 失效。
