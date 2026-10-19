import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { getClientAddress } from '../lib/auth';

export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const now = Math.floor(Date.now() / 1000);
  const login = c.req.path.endsWith('/auth/login') && c.req.method === 'POST';
  const unlock = c.req.path.endsWith('/unlock') && c.req.method === 'POST';
  const sensitive = login || unlock;
  const maxRequests = sensitive ? 5 : 120;
  const scope = login ? 'login' : unlock ? 'unlock' : 'api';
  const bucket = `${scope}:${getClientAddress(c)}`;
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits (bucket_key, window_started_at, request_count)
     VALUES (?, ?, 1)
     ON CONFLICT(bucket_key) DO UPDATE SET
       window_started_at = CASE
         WHEN rate_limits.window_started_at <= ? THEN excluded.window_started_at
         ELSE rate_limits.window_started_at
       END,
       request_count = CASE
         WHEN rate_limits.window_started_at <= ? THEN 1
         ELSE rate_limits.request_count + 1
       END
     RETURNING request_count`,
  )
    .bind(bucket, now, now - 60, now - 60)
    .first<{ request_count: number }>();

  if (!row) throw new Error('D1 rate-limit upsert did not return a request count');
  c.header('X-RateLimit-Limit', String(maxRequests));
  c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - row.request_count)));
  if (row.request_count > maxRequests) {
    c.header('Retry-After', '60');
    return c.json({ error: 'Too many requests. Try again in 60 seconds.' }, 429);
  }
  await next();
};
