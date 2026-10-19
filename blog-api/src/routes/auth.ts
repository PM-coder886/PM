import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createToken, requireAdmin, verifyCredentials } from '../lib/auth';
import type { AppEnv } from '../types';

const router = new Hono<AppEnv>();
const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

router.post('/auth/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json');
  if (!(await verifyCredentials(username, password, c.env))) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }
  return c.json({
    access_token: await createToken(username, c.env.JWT_SECRET),
    token_type: 'Bearer',
    expires_in: 43200,
  });
});

router.get('/auth/me', requireAdmin, (c) => c.json({ username: c.get('admin').username }));

export default router;
