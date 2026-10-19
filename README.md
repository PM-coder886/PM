# All In 个人博客

Vue 3 + Vite 前端与 Cloudflare Workers + Hono + D1 + R2 后端组成的个人博客。包含文章发布与搜索、评论留言、友链、图册、站点统计、RSS/Sitemap 和管理员后台。

## 博客后端 API

Cloudflare Workers + Hono + D1 + R2 后端项目位于 [blog-api](./blog-api/)，包含 API 源码、数据库迁移、Wrangler 配置和部署说明。请参阅 [后端 README](./blog-api/README.md) 获取完整接口文档及 Wrangler 命令。

## 博客前端

前端使用 Vue 3、Vite、Vue Router、Pinia、Axios 和 Markdown-it。启动开发服务器：

```powershell
npm install
npm run dev
```

默认 API 地址为 `http://localhost:8787/api/v1`。如需更改，在仓库根目录的 `.env.local` 中设置：

```dotenv
VITE_API_BASE_URL=https://your-worker.example.workers.dev/api/v1
```

本地联调时，另开一个终端进入 `blog-api`，按[后端说明](./blog-api/README.md)创建本地 D1 并运行 `npm run dev`。Cloudflare Pages 使用 `npm run build` 构建 `dist`；设置 Pages 环境变量 `VITE_API_BASE_URL` 指向已部署的 Worker，并将该 Pages 域名加入 Worker 的 `CORS_ORIGIN`。
