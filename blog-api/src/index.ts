import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import authRoutes from './routes/auth';
import communityRoutes from './routes/community';
import postRoutes from './routes/posts';
import siteRoutes from './routes/site';
import metaRoutes from './routes/meta';
import { rateLimit } from './middleware/rate-limit';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  console.error('Unhandled API error', error);
  return c.json({ error: 'Internal server error' }, 500);
});
app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.use('/api/*', secureHeaders());
app.use('/api/*', cors({
  origin: (origin: string, c: Context<AppEnv>) => {
    const allowed = c.env.CORS_ORIGIN.split(',').map((value) => value.trim());
    if (allowed.includes('*')) return '*';
    return allowed.includes(origin) ? origin : '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-Post-Token'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 86400,
}));
app.use('/api/*', bodyLimit({ maxSize: 6 * 1024 * 1024 }));
app.use('/api/*', rateLimit);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/api/v1', authRoutes);
app.route('/api/v1', postRoutes);
app.route('/api/v1', communityRoutes);
app.route('/api/v1', siteRoutes);
app.route('/api/v1', metaRoutes);

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([
      env.DB.prepare(`UPDATE posts SET status = 'published', published_at = scheduled_at,
        scheduled_at = NULL, updated_at = datetime('now')
        WHERE status = 'scheduled' AND julianday(scheduled_at) <= julianday('now')`).run(),
      env.DB.prepare('DELETE FROM rate_limits WHERE window_started_at < ?')
        .bind(Math.floor(Date.now() / 1000) - 3600).run(),
    ]));
  },
};
