import { createHmac, timingSafeEqual } from 'node:crypto';

// 无状态签名会话：cookie 值 = `<userId>.<epoch>.<exp>.<hmac>`，用 APP_SESSION_SECRET 签名。
// epoch = 会话纪元，与 app_user.session_epoch 比对：改密/登出时把库里 +1，旧 token 即失效（可吊销）。
// 手动 Set-Cookie（不依赖 hono/cookie），完全可控、无跨版本类型摩擦。
const IS_PROD = process.env.NODE_ENV === 'production';
const ENV_SECRET = process.env.APP_SESSION_SECRET;
// 生产绝不允许用硬编码默认值签名——否则任何人可伪造任意用户 token，直接 fail-fast。
if (IS_PROD && !ENV_SECRET) {
  throw new Error('[auth] 生产环境必须设置 APP_SESSION_SECRET（否则会话 token 可被伪造）');
}
// 即便非生产：一旦显式设了密钥就强制足够长，避免「线上漏配 NODE_ENV 但设了弱密钥」的中间态。
if (ENV_SECRET && ENV_SECRET.length < 16) {
  throw new Error('[auth] APP_SESSION_SECRET 过短（至少 16 字符，建议 openssl rand -hex 32）');
}
if (!ENV_SECRET) {
  console.warn('[auth] APP_SESSION_SECRET 未设置，使用开发默认值（仅限本地，生产务必设置）');
}
const SECRET = ENV_SECRET || 'dev-insecure-session-secret-change-me';

const COOKIE = 'sd_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天
// 生产：SameSite=None; Secure; Partitioned —— 让会话在第三方 iframe(内嵌气泡)里也能用，
// 且按宿主站分区(CHIPS)隔离。跨站 CSRF 由"仅接受 application/json + 无通配 CORS"兜底。
// 开发(无 HTTPS)回落 SameSite=Lax。
const COOKIE_ATTRS = IS_PROD ? '; Secure; SameSite=None; Partitioned' : '; SameSite=Lax';

export type SessionClaims = { userId: string; epoch: number };

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function makeToken(userId: string, epoch: number): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${userId}.${epoch}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

// 验签 + 校验过期，返回 { userId, epoch }；epoch 是否仍有效由调用方与库中 session_epoch 比对。
function verifyToken(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [userId, epochStr, exp, sig] = parts;
  const expected = sign(`${userId}.${epochStr}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  const epoch = Number(epochStr);
  if (!Number.isFinite(epoch)) return null;
  return { userId, epoch };
}

export function issueSession(c: any, userId: string, epoch: number): void {
  c.header('Set-Cookie', `${COOKIE}=${makeToken(userId, epoch)}; Path=/; HttpOnly${COOKIE_ATTRS}; Max-Age=${MAX_AGE}`, {
    append: true,
  });
}

export function clearSession(c: any): void {
  c.header('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly${COOKIE_ATTRS}; Max-Age=0`, { append: true });
}

// 从签名 cookie 解出 { userId, epoch }；无 cookie / 验签失败 / 过期时返回 null。
export function readSession(c: any): SessionClaims | null {
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
