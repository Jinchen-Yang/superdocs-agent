import { createHmac, timingSafeEqual } from 'node:crypto';

// 内嵌单点登录（方案 A）：宿主站(如 byrdocs.org)后端用约定密钥 EMBED_JWT_SECRET 签一个 HS256 JWT，
// 载荷含学号(sub)。本服务验签后据此建会话——实现"登录了宿主站 = 自动登录助手"。
// 未配置 EMBED_JWT_SECRET 时该能力关闭（内嵌仍可用气泡内自行登录，即方案 C）。
const SECRET = process.env.EMBED_JWT_SECRET || '';

export const embedSsoEnabled = (): boolean => !!SECRET;

export function verifyEmbedToken(token: string): { studentId: string; realName: string } | null {
  if (!SECRET || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) return null;
  const studentId = String(payload.sub || payload.student_id || payload.user_name || '').trim();
  if (!studentId) return null;
  return { studentId, realName: String(payload.name || payload.real_name || studentId) };
}
