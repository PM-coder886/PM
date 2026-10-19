import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth';
import type { AppEnv } from '../types';

const router = new Hono<AppEnv>();
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 20) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value).every(([, item]) => isJsonValue(item, depth + 1));
  }
  return false;
}
const settingValue = z.custom<JsonValue>(isJsonValue);
const settingsSchema = z.record(z.string().min(1).max(100), settingValue)
  .refine((settings) => Object.keys(settings).length <= 100, 'At most 100 settings can be changed at once')
  .refine((settings) => JSON.stringify(settings).length <= 100_000, 'Settings payload exceeds 100 KB');
const imageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/avif', 'avif'],
]);

router.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare('SELECT key, value FROM settings ORDER BY key').all<{
    key: string;
    value: string;
  }>();
  const data: Record<string, unknown> = Object.create(null);
  for (const row of rows.results) data[row.key] = JSON.parse(row.value);
  return c.json({ data });
});

router.put('/admin/settings', requireAdmin, zValidator('json', settingsSchema), async (c) => {
  const settings = c.req.valid('json');
  const now = new Date().toISOString();
  const statements = Object.entries(settings).map(([key, value]) =>
    c.env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(key, JSON.stringify(value), now));
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ data: settings });
});

router.post('/admin/uploads', requireAdmin, async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'Multipart field "file" is required' }, 400);
  const extension = imageTypes.get(file.type);
  if (!extension) return c.json({ error: 'Only JPEG, PNG, WebP, GIF, and AVIF images are allowed' }, 415);
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    return c.json({ error: 'Image must be between 1 byte and 5 MB' }, 413);
  }

  const key = `images/${crypto.randomUUID()}.${extension}`;
  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });
  const baseUrl = c.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  return c.json({ data: { key, url: `${baseUrl}/${key}` } }, 201);
});

router.delete('/admin/uploads/:name', requireAdmin, async (c) => {
  const name = c.req.param('name');
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/i.test(name)) {
    return c.json({ error: 'Invalid image key' }, 400);
  }
  await c.env.MEDIA.delete(`images/${name}`);
  return c.body(null, 204);
});

router.delete('/admin/settings/:key', requireAdmin, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM settings WHERE key = ?')
    .bind(c.req.param('key')).run();
  if (!result.meta.changes) return c.json({ error: 'Setting not found' }, 404);
  return c.body(null, 204);
});

export default router;
