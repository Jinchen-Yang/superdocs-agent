import { randomUUID } from 'node:crypto';
import { login } from '@byrdocs/bupt-auth';
import { query } from '../db/pool';
import { ensureSchema } from '../db/schema';
import { verifyPassword } from './password';

// 鉴权 provider 抽象 —— 本地密码 + 北邮统一认证(SSO) 的统一接缝。
// 任何 provider 验证成功后都返回 userId，路由层统一调用 issueSession(c, userId)，与 provider 无关。
export interface AuthProvider {
  /** 唯一标识，对应 app_user.auth_provider，如 'local' | 'bupt-sso' */
  id: string;
  /** 验证凭据，成功返回已存在/新建用户的 userId，失败返回 null（SSO 凭据/网络错误以抛异常表达） */
  authenticate(c: any, body: any): Promise<{ userId: string } | null>;
}

export const localProvider: AuthProvider = {
  id: 'local',
  async authenticate(_c, body) {
    await ensureSchema();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');
    if (!username || !password) return null;
    const rows = await query<{ id: string; password_hash: string | null }>(
      "SELECT id, password_hash FROM app_user WHERE lower(username) = lower($1) AND auth_provider = 'local'",
      [username],
    );
    const u = rows[0];
    if (!u || !u.password_hash) return null;
    if (!verifyPassword(password, u.password_hash)) return null;
    return { userId: u.id };
  },
};

// 北邮统一认证：用学号+密码经 @byrdocs/bupt-auth 登录北邮 SSO，成功即证明校园成员身份。
// 首登在 app_user 建 { auth_provider:'bupt-sso', external_id:<学号>, password_hash:null }；
// 验证码由 ocr.byrdocs.org 自动识别（需 BUPT_OCR_TOKEN），无 token 时仅在恰好不需要验证码时可成功。
// 凭据错误抛 LoginError、需验证码但无 token 抛 OCRError —— 由路由层映射为提示。
export const buptSsoProvider: AuthProvider = {
  id: 'bupt-sso',
  async authenticate(_c, body) {
    await ensureSchema();
    const studentId = String(body?.studentId || body?.username || '').trim();
    const password = String(body?.password || '');
    if (!studentId || !password) return null;

    const ocrToken = process.env.BUPT_OCR_TOKEN;
    const info = await login(studentId, password, ocrToken ? { ocr: { token: ocrToken } } : {});

    const externalId = info.user_name; // 学号
    const realName = info.real_name || externalId;

    const existing = await query<{ id: string }>(
      "SELECT id FROM app_user WHERE auth_provider = 'bupt-sso' AND external_id = $1",
      [externalId],
    );
    if (existing[0]) {
      await query('UPDATE app_user SET display_name = $2 WHERE id = $1', [existing[0].id, realName]).catch(() => {});
      return { userId: existing[0].id };
    }

    const id = randomUUID();
    await query(
      `INSERT INTO app_user (id, username, password_hash, display_name, avatar_seed, auth_provider, external_id)
       VALUES ($1, $2, NULL, $3, $4, 'bupt-sso', $5)`,
      [id, 'sso_' + externalId, realName, (realName || '?').slice(0, 1).toUpperCase(), externalId],
    );
    return { userId: id };
  },
};

export const authProviders: Record<string, AuthProvider> = {
  local: localProvider,
  'bupt-sso': buptSsoProvider,
};
