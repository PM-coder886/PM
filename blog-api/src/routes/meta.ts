import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth';
import type { AppEnv } from '../types';

const router = new Hono<AppEnv>();

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]!);
}

function xmlResponse(body: string) {
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

async function getPublishedPosts(c: Context<AppEnv>) {
  return c.env.DB.prepare(`SELECT slug, title, excerpt, published_at FROM posts
    WHERE status = 'published' AND julianday(published_at) <= julianday('now')
    ORDER BY published_at DESC`).all<{
      slug: string;
      title: string;
      excerpt: string;
      published_at: string;
    }>();
}

router.get('/archives', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT strftime('%Y', published_at) AS year,
      strftime('%m', published_at) AS month, COUNT(*) AS total
    FROM posts WHERE status = 'published' AND julianday(published_at) <= julianday('now')
    GROUP BY year, month ORDER BY year DESC, month DESC`).all();
  return c.json({ data: rows.results });
});

router.get('/sitemap.xml', async (c) => {
  const posts = await getPublishedPosts(c);
  const baseUrl = (c.env.PUBLIC_SITE_URL ?? c.env.CORS_ORIGIN.split(',')[0]).trim().replace(/\/+$/, '');
  const urls = [
    `${baseUrl}/`,
    ...posts.results.map((post) => `${baseUrl}/posts/${encodeURIComponent(post.slug)}`),
  ];
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')
  }\n</urlset>`);
});

router.get('/feed.xml', async (c) => {
  const posts = await getPublishedPosts(c);
  const baseUrl = (c.env.PUBLIC_SITE_URL ?? c.env.CORS_ORIGIN.split(',')[0]).trim().replace(/\/+$/, '');
  const title = c.env.SITE_TITLE ?? 'Personal Blog';
  const items = posts.results.map((post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(`${baseUrl}/posts/${encodeURIComponent(post.slug)}`)}</link>
      <guid>${escapeXml(`${baseUrl}/posts/${encodeURIComponent(post.slug)}`)}</guid>
      <pubDate>${new Date(`${post.published_at}Z`).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
    </item>`).join('\n');
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>
    <title>${escapeXml(title)}</title><link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(title)} RSS feed</description>\n${items}\n  </channel></rss>`);
});

router.get('/gallery', zValidator('query', z.object({
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})), async (c) => {
  const { cursor, limit } = c.req.valid('query');
  const page = await c.env.MEDIA.list({ prefix: 'images/', cursor, limit });
  const baseUrl = c.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  return c.json({
    data: page.objects.map((object) => ({
      key: object.key,
      name: object.key.slice('images/'.length),
      url: `${baseUrl}/${object.key}`,
      uploaded_at: object.uploaded.toISOString(),
      size: object.size,
    })),
    cursor: page.truncated ? page.cursor : null,
  });
});

router.post('/page-views', zValidator('json', z.object({
  path: z.string().trim().min(1).max(500).startsWith('/').refine((value) => !value.startsWith('//')),
})), async (c) => {
  const { path } = c.req.valid('json');
  const day = new Date().toISOString().slice(0, 10);
  await c.env.DB.prepare(`INSERT INTO page_views (day, path, views) VALUES (?, ?, 1)
    ON CONFLICT(day, path) DO UPDATE SET views = page_views.views + 1`)
    .bind(day, path).run();
  return c.body(null, 204);
});

router.get('/stats', async (c) => {
  const [views, posts] = await Promise.all([
    c.env.DB.prepare('SELECT COALESCE(SUM(views), 0) AS total FROM page_views')
      .first<{ total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM posts
      WHERE status = 'published' AND julianday(published_at) <= julianday('now')`)
      .first<{ total: number }>(),
  ]);
  return c.json({ data: { total_views: views?.total ?? 0, published_posts: posts?.total ?? 0 } });
});

router.get('/admin/stats', requireAdmin, zValidator('query', z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
})), async (c) => {
  const { days } = c.req.valid('query');
  const [daily, topPosts, totals] = await Promise.all([
    c.env.DB.prepare(`SELECT day, SUM(views) AS views FROM page_views
      WHERE day >= date('now', ?) GROUP BY day ORDER BY day`)
      .bind(`-${days - 1} days`).all(),
    c.env.DB.prepare(`SELECT id, slug, title, view_count FROM posts
      WHERE status = 'published' ORDER BY view_count DESC LIMIT 10`).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS posts,
        (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS pending_comments,
        (SELECT COUNT(*) FROM guestbook_entries WHERE status = 'pending') AS pending_messages
      FROM posts`).first(),
  ]);
  return c.json({ data: { daily: daily.results, top_posts: topPosts.results, totals } });
});

export default router;
