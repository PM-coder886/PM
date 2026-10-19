import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function signature(input: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(input)));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifyCredentials(
  username: string,
  password: string,
  env: AppEnv['Bindings'],
): Promise<boolean> {
  const [actualUsername, actualPassword] = await Promise.all([
    signature(username, env.JWT_SECRET),
    signature(password, env.JWT_SECRET),
  ]);
  const [expectedUsername, expectedPassword] = await Promise.all([
    signature(env.ADMIN_USERNAME, env.JWT_SECRET),
    signature(env.ADMIN_PASSWORD, env.JWT_SECRET),
  ]);
  return (
    constantTimeEqual(toBase64Url(actualUsername), toBase64Url(expectedUsername)) &&
    constantTimeEqual(toBase64Url(actualPassword), toBase64Url(expectedPassword))
  );
}

export async function createToken(username: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ sub: username, iat: now, exp: now + 60 * 60 * 12 })),
  );
  const content = `${header}.${payload}`;
  return `${content}.${toBase64Url(await signature(content, secret))}`;
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(decoder.decode(fromBase64Url(headerPart))) as { alg?: string };
    const payload = JSON.parse(decoder.decode(fromBase64Url(payloadPart))) as {
      sub?: string;
      exp?: number;
    };
    if (header.alg !== 'HS256' || !payload.sub || !payload.exp || payload.exp <= Date.now() / 1000) {
      return null;
    }

    const expected = await signature(`${headerPart}.${payloadPart}`, secret);
    const actual = fromBase64Url(signaturePart);
    if (actual.length !== expected.length) return null;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= expected[index] ^ actual[index];
    }
    return difference === 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const username = token ? await verifyToken(token, c.env.JWT_SECRET) : null;
  if (!username || !constantTimeEqual(username, c.env.ADMIN_USERNAME)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('admin', { username });
  await next();
};

export function getClientAddress(c: Context<AppEnv>): string {
  return c.req.header('CF-Connecting-IP') ?? 'unknown';
}
