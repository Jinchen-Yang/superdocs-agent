import { query } from '../db/pool';
import { ensureSchema } from '../db/schema';
import { verifyPassword } from './password';

// 鉴权 provider 抽象 —— 给未来的 SSO 预留的统一接缝。
// 任何 provider 验证成功后都返回 userId，路由层统一调用 issueSession(c, userId)，与 provider 无关。
export interface AuthProvider {
  /** 唯一标识，对应 app_user.auth_provider，如 'local' | 'bupt-sso' */
  id: string;
  /** 验证凭据，成功返回已存在/新建用户的 userId，失败返回 null */
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

// TODO(sso): 接入北邮 SSO（你 GitHub 上现成的认证）时：
//   1) 在此实现并导出 buptSsoProvider: AuthProvider，authenticate 里校验 SSO 凭据/回调参数，
//      首登时在 app_user 建一条 { auth_provider:'bupt-sso', external_id:<学号>, password_hash:null }，返回其 userId；
//   2) 把它加进下面的 authProviders；
//   3) 在 routes/auth.ts 的 GET /app/auth/sso/callback 里：
//      const r = await buptSsoProvider.authenticate(c, c.req.query()); if (r) { issueSession(c, r.userId); return c.redirect('/app/ui'); }
export const authProviders: Record<string, AuthProvider> = { local: localProvider };
