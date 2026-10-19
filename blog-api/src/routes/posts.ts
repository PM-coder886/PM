import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth';
import type { AppEnv } from '../types';

const router = new Hono<AppEnv>();
const tagIdsSchema = z.array(z.string().uuid()).max(50)
  .refine((ids) => new Set(ids).size === ids.length, 'tag_ids must not contain duplicates');
const postSchema = z.object({
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().max(500).default(''),
  content: z.string().min(1).max(200000),
  cover_image: z.string().url().max(2000)
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
  scheduled_at: z.string().datetime().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  tag_ids: tagIdsSchema.default([]),
  password: z.string().max(200).optional(),
});
const updatePostSchema = postSchema.partial().extend({ tag_ids: tagIdsSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(160).optional(),
  tag: z.string().trim().max(160).optional(),
});
const adminPostQuerySchema = paginationSchema.extend({
  status: z.enum(['draft', 'scheduled', 'published']).optional(),
  q: z.string().trim().max(200).optional(),
});

type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  cover_image: string | null;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  category: string | null;
  tags: string;
  password_protected: number;
  view_count: number;
  password_hash: string | null;
};

const postSelect = `
  SELECT p.id, p.slug, p.title, p.excerpt, p.cover_image, p.status,
         p.published_at, p.scheduled_at, p.category_id, p.created_at, p.updated_at,
         CASE WHEN p.password_hash IS NULL THEN 0 ELSE 1 END AS password_protected,
         p.view_count,
         c.name AS category,
         COALESCE((
           SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'slug', t.slug))
           FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id
         ), '[]') AS tags`;

function formatPost(row: PostRow) {
  return { ...row, tags: JSON.parse(row.tags) as Array<{ id: string; name: string; slug: string }> };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')),
    (character) => character.charCodeAt(0));
}

async function sign(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function passwordHash(postId: string, password: string, secret: string): Promise<string> {
  return toBase64Url(await sign(`post-password:${postId}:${password}`, secret));
}

async function createPostToken(postId: string, secret: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({
    post_id: postId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })));
  return `${payload}.${toBase64Url(await sign(payload, secret))}`;
}

async function hasPostToken(token: string, postId: string, secret: string): Promise<boolean> {
  try {
    const [payloadPart, signaturePart, extra] = token.split('.');
    if (!payloadPart || !signaturePart || extra) return false;
    const expected = await sign(payloadPart, secret);
    const actual = fromBase64Url(signaturePart);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    if (difference !== 0) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart))) as {
      post_id?: string;
      exp?: number;
    };
    return payload.post_id === postId && typeof payload.exp === 'number' && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

router.get('/posts', zValidator('query', paginationSchema), async (c) => {
  const { page, limit, q, category, tag } = c.req.valid('query');
  const offset = (page - 1) * limit;
  const filters = [
    "p.status = 'published'",
    "julianday(p.published_at) <= julianday('now')",
  ];
  const bindings: (string | number)[] = [];
  if (q) {
    filters.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)');
    bindings.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) {
    filters.push('EXISTS (SELECT 1 FROM categories fc WHERE fc.id = p.category_id AND fc.slug = ?)');
    bindings.push(category);
  }
  if (tag) {
    filters.push('EXISTS (SELECT 1 FROM post_tags fpt JOIN tags ft ON ft.id = fpt.tag_id WHERE fpt.post_id = p.id AND ft.slug = ?)');
    bindings.push(tag);
  }
  const where = `WHERE ${filters.join(' AND ')}`;
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`${postSelect} FROM posts p LEFT JOIN categories c ON c.id = p.category_id
      ${where} ORDER BY p.published_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset).all<PostRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM posts p ${where}`)
      .bind(...bindings).first<{ total: number }>(),
  ]);
  return c.json({ data: rows.results.map(formatPost), page, limit, total: count?.total ?? 0, q, category, tag });
});

router.get('/posts/:slug', async (c) => {
  const row = await c.env.DB.prepare(`${postSelect}, p.content FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ? AND p.status = 'published' AND julianday(p.published_at) <= julianday('now')`)
    .bind(c.req.param('slug')).first<PostRow>();
  if (!row) return c.json({ error: 'Post not found' }, 404);
  const post = formatPost(row);
  if (row.password_protected) {
    const token = c.req.header('X-Post-Token') ?? '';
    if (!(await hasPostToken(token, row.id, c.env.JWT_SECRET))) {
      const { content: _content, ...lockedPost } = post;
      return c.json({ data: { ...lockedPost, locked: true } });
    }
  }
  const day = new Date().toISOString().slice(0, 10);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').bind(row.id),
    c.env.DB.prepare(`INSERT INTO page_views (day, path, views) VALUES (?, ?, 1)
      ON CONFLICT(day, path) DO UPDATE SET views = page_views.views + 1`)
      .bind(day, `/posts/${row.slug}`),
  ]);
  return c.json({ data: { ...post, view_count: row.view_count + 1, locked: false } });
});

router.post('/posts/:slug/unlock', zValidator('json', z.object({
  password: z.string().min(1).max(200),
})), async (c) => {
  const row = await c.env.DB.prepare(`SELECT id, password_hash FROM posts
    WHERE slug = ? AND status = 'published' AND julianday(published_at) <= julianday('now')`)
    .bind(c.req.param('slug')).first<{ id: string; password_hash: string | null }>();
  if (!row) return c.json({ error: 'Post not found' }, 404);
  if (!row.password_hash) return c.json({ error: 'This post does not require a password' }, 400);
  const { password } = c.req.valid('json');
  if (!constantTimeEqual(await passwordHash(row.id, password, c.env.JWT_SECRET), row.password_hash)) {
    return c.json({ error: 'Incorrect post password' }, 401);
  }
  return c.json({ data: { token: await createPostToken(row.id, c.env.JWT_SECRET), expires_in: 3600 } });
});

router.get('/admin/posts', requireAdmin, zValidator('query', adminPostQuerySchema), async (c) => {
  const { page, limit, status, q } = c.req.valid('query');
  const filters: string[] = [];
  const bindings: (string | number)[] = [];
  if (status) {
    filters.push('p.status = ?');
    bindings.push(status);
  }
  if (q) {
    filters.push('(p.title LIKE ? OR p.slug LIKE ?)');
    bindings.push(`%${q}%`, `%${q}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`${postSelect}, p.content FROM posts p
      LEFT JOIN categories c ON c.id = p.category_id ${where}
      ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, (page - 1) * limit).all<PostRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM posts p ${where}`)
      .bind(...bindings).first<{ total: number }>(),
  ]);
  return c.json({ data: rows.results.map(formatPost), page, limit, total: count?.total ?? 0 });
});

router.get('/admin/posts/:id', requireAdmin, async (c) => {
  const row = await c.env.DB.prepare(`${postSelect}, p.content FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`)
    .bind(c.req.param('id')).first<PostRow>();
  if (!row) return c.json({ error: 'Post not found' }, 404);
  return c.json({ data: formatPost(row) });
});

router.post('/posts', requireAdmin, zValidator('json', postSchema), async (c) => {
  const input = c.req.valid('json');
  if (input.status === 'scheduled' && (!input.scheduled_at || Date.parse(input.scheduled_at) <= Date.now())) {
    return c.json({ error: 'scheduled_at must be a future ISO-8601 date for scheduled posts' }, 400);
  }
  if (input.category_id && !(await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
    .bind(input.category_id).first())) {
    return c.json({ error: 'category_id does not exist' }, 400);
  }
  if (input.tag_ids.length) {
    const placeholders = input.tag_ids.map(() => '?').join(', ');
    const tags = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM tags WHERE id IN (${placeholders})`)
      .bind(...input.tag_ids).first<{ total: number }>();
    if (tags?.total !== input.tag_ids.length) return c.json({ error: 'One or more tag_ids do not exist' }, 400);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const scheduledAt = input.status === 'scheduled' ? input.scheduled_at! : null;
  const publishedAt = input.status === 'published' ? now : null;
  const passwordHashValue = input.password ? await passwordHash(id, input.password, c.env.JWT_SECRET) : null;
  try {
    const statements = [
      c.env.DB.prepare(`INSERT INTO posts
        (id, slug, title, excerpt, content, cover_image, status, published_at, scheduled_at, category_id, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, input.slug, input.title, input.excerpt, input.content, input.cover_image ?? null,
          input.status, publishedAt, scheduledAt, input.category_id ?? null, passwordHashValue),
      ...input.tag_ids.map((tagId) =>
        c.env.DB.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(id, tagId)),
    ];
    await c.env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return c.json({ error: 'A post with this slug already exists' }, 409);
    }
    throw error;
  }
  const { password: _password, ...safeInput } = input;
  return c.json({ data: { id, ...safeInput, password_protected: !!passwordHashValue,
    published_at: publishedAt, scheduled_at: scheduledAt, created_at: now } }, 201);
});

router.patch('/posts/:id', requireAdmin, zValidator('json', updatePostSchema), async (c) => {
  const input = c.req.valid('json');
  const existing = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(c.req.param('id')).first<PostRow>();
  if (!existing) return c.json({ error: 'Post not found' }, 404);
  if (input.category_id && !(await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
    .bind(input.category_id).first())) {
    return c.json({ error: 'category_id does not exist' }, 400);
  }
  if (input.tag_ids?.length) {
    const placeholders = input.tag_ids.map(() => '?').join(', ');
    const tags = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM tags WHERE id IN (${placeholders})`)
      .bind(...input.tag_ids).first<{ total: number }>();
    if (tags?.total !== input.tag_ids.length) return c.json({ error: 'One or more tag_ids do not exist' }, 400);
  }

  const status = input.status ?? existing.status;
  const scheduledAt = input.scheduled_at === undefined ? existing.scheduled_at : input.scheduled_at;
  if (status === 'scheduled' && (!scheduledAt || Date.parse(scheduledAt) <= Date.now())) {
    return c.json({ error: 'scheduled_at must be a future ISO-8601 date for scheduled posts' }, 400);
  }
  const publishedAt = status === 'published'
    ? (existing.status === 'published' ? existing.published_at : new Date().toISOString())
    : null;
  const nextScheduledAt = status === 'scheduled' ? scheduledAt : null;
  const passwordHashValue = input.password === undefined
    ? undefined
    : input.password ? await passwordHash(existing.id, input.password, c.env.JWT_SECRET) : null;

  try {
    const statements = [
      c.env.DB.prepare(`UPDATE posts SET
        slug = ?, title = ?, excerpt = ?, content = ?, cover_image = ?, status = ?,
        published_at = ?, scheduled_at = ?,                 category_id = ?, password_hash = ?, updated_at = datetime('now')
        WHERE id = ?`)
        .bind(input.slug ?? existing.slug, input.title ?? existing.title,
          input.excerpt ?? existing.excerpt, input.content ?? existing.content,
          input.cover_image === undefined ? existing.cover_image : input.cover_image,
          status, publishedAt, nextScheduledAt,
          input.category_id === undefined ? existing.category_id : input.category_id,
          passwordHashValue === undefined ? existing.password_hash : passwordHashValue, existing.id),
    ];
    if (input.tag_ids !== undefined) {
      statements.push(c.env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(existing.id));
      statements.push(...input.tag_ids.map((tagId) =>
        c.env.DB.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(existing.id, tagId)));
    }
    await c.env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return c.json({ error: 'A post with this slug already exists' }, 409);
    }
    throw error;
  }
  const { password: _password, ...safeInput } = input;
  return c.json({ data: { id: existing.id, ...safeInput, password_protected: passwordHashValue
    ? true : passwordHashValue === null ? false : !!existing.password_hash,
    status, published_at: publishedAt, scheduled_at: nextScheduledAt } });
});

router.delete('/posts/:id', requireAdmin, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Post not found' }, 404);
  return c.body(null, 204);
});

export default router;
