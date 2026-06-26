import { createHmac, timingSafeEqual } from 'node:crypto';

// 无状态签名会话：cookie 值 = `<userId>.<exp>.<hmac>`，用 APP_SESSION_SECRET 签名。
// 手动 Set-Cookie（不依赖 hono/cookie），完全可控、无跨版本类型摩擦。
const IS_PROD = process.env.NODE_ENV === 'production';
const ENV_SECRET = process.env.APP_SESSION_SECRET;
// 生产绝不允许用硬编码默认值签名——否则任何人可伪造任意用户 token，直接 fail-fast。
if (IS_PROD && !ENV_SECRET) {
  throw new Error('[auth] 生产环境必须设置 APP_SESSION_SECRET（否则会话 token 可被伪造）');
}
if (!ENV_SECRET) {
  console.warn('[auth] APP_SESSION_SECRET 未设置，使用开发默认值（仅限本地，生产务必设置）');
}
const SECRET = ENV_SECRET || 'dev-insecure-session-secret-change-me';

const COOKIE = 'sd_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天
// 生产经 HTTPS 暴露，给 cookie 加 Secure，防明文链路嗅探。
const SECURE = IS_PROD ? '; Secure' : '';

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function makeToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = sign(`${userId}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return userId;
}

export function issueSession(c: any, userId: string): void {
  c.header('Set-Cookie', `${COOKIE}=${makeToken(userId)}; Path=/; HttpOnly; SameSite=Lax${SECURE}; Max-Age=${MAX_AGE}`, {
    append: true,
  });
}

export function clearSession(c: any): void {
  c.header('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax${SECURE}; Max-Age=0`, { append: true });
}

export function readUserId(c: any): string | null {
  const raw: string | undefined = c.req.header('Cookie') || c.req.header('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === COOKIE) {
      return verifyToken(decodeURIComponent(part.slice(idx + 1).trim()));
    }
  }
  return null;
}
