import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getClientAddress, requireAdmin } from '../lib/auth';
import type { AppEnv } from '../types';

const router = new Hono<AppEnv>();
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const slugSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
  description: z.string().max(500).default(''),
  parent_id: z.string().uuid().nullable().optional(),
});
const tagSchema = categorySchema.omit({ description: true });
const statusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });
const commentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  content: z.string().trim().min(1).max(3000),
  parent_id: z.string().uuid().nullable().optional(),
});
const friendSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().url().max(2000).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  description: z.string().max(500).default(''),
  avatar: z.string().url().max(2000).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).nullable().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  sort_order: z.number().int().min(-10000).max(10000).default(0),
});
const guestbookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  content: z.string().trim().min(1).max(2000),
});

function registerTaxonomy(
  path: '/categories' | '/tags',
  table: 'categories' | 'tags',
  schema: typeof categorySchema | typeof tagSchema,
) {
  router.get(path, async (c) => {
    const rows = await c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY name COLLATE NOCASE`).all();
    return c.json({ data: rows.results });
  });
  router.post(path, requireAdmin, zValidator('json', schema), async (c) => {
    const input = c.req.valid('json');
    const id = crypto.randomUUID();
    try {
      if (table === 'categories') {
        const category = input as z.infer<typeof categorySchema>;
        if (category.parent_id === id) return c.json({ error: 'A category cannot be its own parent' }, 400);
        if (category.parent_id && !(await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
          .bind(category.parent_id).first())) return c.json({ error: 'parent_id does not exist' }, 400);
        await c.env.DB.prepare('INSERT INTO categories (id, name, slug, description, parent_id) VALUES (?, ?, ?, ?, ?)')
          .bind(id, category.name, category.slug, category.description, category.parent_id ?? null).run();
      } else {
        const tag = input as z.infer<typeof tagSchema>;
        await c.env.DB.prepare('INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)')
          .bind(id, tag.name, tag.slug).run();
      }
    } catch (error) {
      if (error instanceof Error && /unique/i.test(error.message)) {
        return c.json({ error: 'Name or slug already exists' }, 409);
      }
      throw error;
    }
    return c.json({ data: { id, ...input } }, 201);
  });
  router.patch(`${path}/:id`, requireAdmin, zValidator('json', schema.partial()), async (c) => {
    const input = c.req.valid('json');
    if (Object.keys(input).length === 0) return c.json({ error: 'At least one field is required' }, 400);
    const fields = Object.keys(input);
    const allowed = table === 'categories' ? ['name', 'slug', 'description', 'parent_id'] : ['name', 'slug'];
    if (fields.some((field) => !allowed.includes(field))) return c.json({ error: 'Invalid fields' }, 400);
    const setSql = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => (input as Record<string, unknown>)[field]);
    if (table === 'categories' && 'parent_id' in input) {
      const parentId = (input as z.infer<typeof categorySchema>).parent_id;
      if (parentId === c.req.param('id')) return c.json({ error: 'A category cannot be its own parent' }, 400);
      if (parentId && !(await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
        .bind(parentId).first())) return c.json({ error: 'parent_id does not exist' }, 400);
    }
    try {
      const result = await c.env.DB.prepare(`UPDATE ${table} SET ${setSql} WHERE id = ?`)
        .bind(...values, c.req.param('id')).run();
      if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof Error && /unique/i.test(error.message)) {
        return c.json({ error: 'Name or slug already exists' }, 409);
      }
      throw error;
    }
    return c.json({ data: { id: c.req.param('id'), ...input } });
  });
  router.delete(`${path}/:id`, requireAdmin, async (c) => {
    const result = await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(c.req.param('id')).run();
    if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });
}

registerTaxonomy('/categories', 'categories', categorySchema);
registerTaxonomy('/tags', 'tags', tagSchema);

router.get('/posts/:id/comments', zValidator('query', pagination), async (c) => {
  const { page, limit } = c.req.valid('query');
  if (!(await publicPostExists(c, c.req.param('id')))) return c.json({ error: 'Post not found' }, 404);
  const rows = await c.env.DB.prepare(`SELECT id, post_id, parent_id, name, content, created_at
    FROM comments WHERE post_id = ? AND status = 'approved'
    ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(c.req.param('id'), limit, (page - 1) * limit).all();
  return c.json({ data: rows.results, page, limit });
});

router.post('/posts/:id/comments', zValidator('json', commentSchema), async (c) => {
  const post = await c.env.DB.prepare(`SELECT id FROM posts
    WHERE id = ? AND status = 'published' AND julianday(published_at) <= julianday('now')`)
    .bind(c.req.param('id')).first();
  if (!post) return c.json({ error: 'Post not found' }, 404);
  const input = c.req.valid('json');
  const blockedTerms = ['viagra', 'casino', '博彩', '贷款', '色情'];
  if (blockedTerms.some((term) => input.content.toLocaleLowerCase().includes(term.toLocaleLowerCase()))) {
    return c.json({ error: 'Comment contains blocked content' }, 400);
  }
  if (input.parent_id) {
    const parent = await c.env.DB.prepare(`SELECT id FROM comments
      WHERE id = ? AND post_id = ? AND status = 'approved'`)
      .bind(input.parent_id, c.req.param('id')).first();
    if (!parent) return c.json({ error: 'Reply target not found' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO comments (id, post_id, parent_id, name, email, content)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, c.req.param('id'), input.parent_id ?? null, input.name, input.email, input.content).run();
  return c.json({ data: { id, post_id: c.req.param('id'), parent_id: input.parent_id ?? null, name: input.name, content: input.content, status: 'pending' } }, 201);
});

router.get('/admin/comments', requireAdmin, zValidator('query', z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: pagination.shape.page,
  limit: pagination.shape.limit,
})), async (c) => {
  const { status, page, limit } = c.req.valid('query');
  const clause = status ? 'WHERE status = ?' : '';
  const statement = c.env.DB.prepare(`SELECT id, post_id, name, email, content, status, created_at
    FROM comments ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
  const rows = status
    ? await statement.bind(status, limit, (page - 1) * limit).all()
    : await statement.bind(limit, (page - 1) * limit).all();
  return c.json({ data: rows.results, page, limit });
});
router.patch('/admin/comments/:id', requireAdmin, zValidator('json', statusSchema), async (c) => {
  const { status } = c.req.valid('json');
  const result = await c.env.DB.prepare('UPDATE comments SET status = ? WHERE id = ?')
    .bind(status, c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Comment not found' }, 404);
  return c.json({ data: { id: c.req.param('id'), status } });
});
router.delete('/admin/comments/:id', requireAdmin, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Comment not found' }, 404);
  return c.body(null, 204);
});

async function visitorHash(address: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function publicPostExists(c: Context<AppEnv>, id: string) {
  return c.env.DB.prepare(`SELECT id FROM posts
    WHERE id = ? AND status = 'published' AND julianday(published_at) <= julianday('now')`).bind(id).first();
}
router.get('/posts/:id/likes', async (c) => {
  const post = await publicPostExists(c, c.req.param('id'));
  if (!post) return c.json({ error: 'Post not found' }, 404);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM likes WHERE post_id = ?')
    .bind(c.req.param('id')).first<{ total: number }>();
  const hash = await visitorHash(getClientAddress(c), c.env.JWT_SECRET);
  const [liked, bookmarked] = await Promise.all([
    c.env.DB.prepare('SELECT 1 FROM likes WHERE post_id = ? AND visitor_hash = ?')
      .bind(c.req.param('id'), hash).first(),
    c.env.DB.prepare('SELECT 1 FROM bookmarks WHERE post_id = ? AND visitor_hash = ?')
      .bind(c.req.param('id'), hash).first(),
  ]);
  const bookmarks = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM bookmarks WHERE post_id = ?')
    .bind(c.req.param('id')).first<{ total: number }>();
  return c.json({ data: { count: count?.total ?? 0, liked: !!liked,
    bookmarked: !!bookmarked, bookmark_count: bookmarks?.total ?? 0 } });
});
router.post('/posts/:id/likes', async (c) => {
  const postId = c.req.param('id');
  if (!(await publicPostExists(c, postId))) return c.json({ error: 'Post not found' }, 404);
  const hash = await visitorHash(getClientAddress(c), c.env.JWT_SECRET);
  await c.env.DB.prepare('INSERT OR IGNORE INTO likes (post_id, visitor_hash) VALUES (?, ?)')
    .bind(postId, hash).run();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM likes WHERE post_id = ?')
    .bind(postId).first<{ total: number }>();
  return c.json({ data: { count: count?.total ?? 0 } }, 201);
});
router.delete('/posts/:id/likes', async (c) => {
  const postId = c.req.param('id');
  if (!(await publicPostExists(c, postId))) return c.json({ error: 'Post not found' }, 404);
  const hash = await visitorHash(getClientAddress(c), c.env.JWT_SECRET);
  await c.env.DB.prepare('DELETE FROM likes WHERE post_id = ? AND visitor_hash = ?').bind(postId, hash).run();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM likes WHERE post_id = ?')
    .bind(postId).first<{ total: number }>();
  return c.json({ data: { count: count?.total ?? 0 } });
});

router.post('/posts/:id/bookmarks', async (c) => {
  const postId = c.req.param('id');
  if (!(await publicPostExists(c, postId))) return c.json({ error: 'Post not found' }, 404);
  const hash = await visitorHash(getClientAddress(c), c.env.JWT_SECRET);
  await c.env.DB.prepare('INSERT OR IGNORE INTO bookmarks (post_id, visitor_hash) VALUES (?, ?)')
    .bind(postId, hash).run();
  return c.json({ data: { bookmarked: true } }, 201);
});

router.delete('/posts/:id/bookmarks', async (c) => {
  const postId = c.req.param('id');
  if (!(await publicPostExists(c, postId))) return c.json({ error: 'Post not found' }, 404);
  const hash = await visitorHash(getClientAddress(c), c.env.JWT_SECRET);
  await c.env.DB.prepare('DELETE FROM bookmarks WHERE post_id = ? AND visitor_hash = ?')
    .bind(postId, hash).run();
  return c.json({ data: { bookmarked: false } });
});

router.get('/friends', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, name, url, description, avatar, sort_order
    FROM friends WHERE status = 'approved' ORDER BY sort_order, name COLLATE NOCASE`).all();
  return c.json({ data: rows.results });
});
router.post('/friends', zValidator('json', friendSchema.omit({ status: true, sort_order: true })), async (c) => {
  const input = c.req.valid('json');
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO friends (id, name, url, description, avatar)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, input.name, input.url, input.description, input.avatar ?? null).run();
  return c.json({ data: { id, ...input, status: 'pending' } }, 201);
});
router.get('/admin/friends', requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM friends ORDER BY sort_order, created_at DESC').all();
  return c.json({ data: rows.results });
});
router.post('/admin/friends', requireAdmin, zValidator('json', friendSchema), async (c) => {
  const input = c.req.valid('json');
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO friends (id, name, url, description, avatar, status, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.name, input.url, input.description, input.avatar ?? null, input.status, input.sort_order).run();
  return c.json({ data: { id, ...input } }, 201);
});
router.patch('/admin/friends/:id', requireAdmin, zValidator('json', friendSchema.partial()), async (c) => {
  const input = c.req.valid('json');
  const fields = Object.keys(input);
  if (!fields.length) return c.json({ error: 'At least one field is required' }, 400);
  const result = await c.env.DB.prepare(`UPDATE friends SET ${fields.map((field) => `${field} = ?`).join(', ')}
    WHERE id = ?`).bind(...fields.map((field) => (input as Record<string, unknown>)[field]), c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Friend link not found' }, 404);
  return c.json({ data: { id: c.req.param('id'), ...input } });
});
router.delete('/admin/friends/:id', requireAdmin, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM friends WHERE id = ?').bind(c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Friend link not found' }, 404);
  return c.body(null, 204);
});

router.get('/guestbook', zValidator('query', pagination), async (c) => {
  const { page, limit } = c.req.valid('query');
  const rows = await c.env.DB.prepare(`SELECT id, name, content, created_at FROM guestbook_entries
    WHERE status = 'approved' ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(limit, (page - 1) * limit).all();
  return c.json({ data: rows.results, page, limit });
});
router.post('/guestbook', zValidator('json', guestbookSchema), async (c) => {
  const input = c.req.valid('json');
  const blockedTerms = ['viagra', 'casino', '博彩', '贷款', '色情'];
  if (blockedTerms.some((term) => input.content.toLocaleLowerCase().includes(term.toLocaleLowerCase()))) {
    return c.json({ error: 'Message contains blocked content' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO guestbook_entries (id, name, email, content)
    VALUES (?, ?, ?, ?)`).bind(id, input.name, input.email ?? '', input.content).run();
  return c.json({ data: { id, name: input.name, content: input.content, status: 'pending' } }, 201);
});
router.get('/admin/guestbook', requireAdmin, zValidator('query', z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})), async (c) => {
  const { status } = c.req.valid('query');
  const rows = status
    ? await c.env.DB.prepare('SELECT * FROM guestbook_entries WHERE status = ? ORDER BY created_at DESC').bind(status).all()
    : await c.env.DB.prepare('SELECT * FROM guestbook_entries ORDER BY created_at DESC').all();
  return c.json({ data: rows.results });
});
router.patch('/admin/guestbook/:id', requireAdmin, zValidator('json', statusSchema), async (c) => {
  const { status } = c.req.valid('json');
  const result = await c.env.DB.prepare('UPDATE guestbook_entries SET status = ? WHERE id = ?')
    .bind(status, c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Guestbook entry not found' }, 404);
  return c.json({ data: { id: c.req.param('id'), status } });
});
router.delete('/admin/guestbook/:id', requireAdmin, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM guestbook_entries WHERE id = ?').bind(c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Guestbook entry not found' }, 404);
  return c.body(null, 204);
});

export default router;
