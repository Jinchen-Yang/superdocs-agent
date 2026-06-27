import { randomUUID } from 'node:crypto';
import { login as buptLogin } from '@byrdocs/bupt-auth';
import { query } from '../db/pool';
import { hashPassword, verifyPassword } from './password';

// 账号模型：一账号一学号(external_id)，全部经北邮统一认证(SSO)绑定。
// - 注册 = 把本地用户名/密码绑定到已 SSO 验证的学号账号；
// - 绑定后可用「本地密码」或「SSO」两种方式登录，都解析到同一账号。
// 验证码：onCaptcha → 自建 OCR(OCR_URL，POST 图片字节 → {text})，同 byrdocs 方案；无 OCR_URL 时撞验证码即失败。

const OCR_URL = process.env.OCR_URL || '';

async function ocrCaptcha(captchaUrl: string, cookie: string): Promise<string> {
  if (!OCR_URL) throw new Error('需要验证码');
  const img = await fetch(captchaUrl, { headers: { cookie } });
  const buf = Buffer.from(await img.arrayBuffer());
  const r = await fetch(OCR_URL, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: buf });
  const j = (await r.json()) as { text?: string };
  if (!j?.text) throw new Error('验证码识别失败');
  return j.text;
}

// 验证北邮统一认证（带验证码 OCR + 整体重试），返回身份；不建账号。凭据错抛 LoginError。
export async function buptSsoVerify(studentId: string, password: string): Promise<{ studentId: string; realName: string }> {
  const opts = OCR_URL ? { onCaptcha: ocrCaptcha } : undefined;
  let info: any;
  let lastErr: any;
  for (let i = 0; i < 3; i++) {
    try {
      info = await buptLogin(studentId, password, opts);
      break;
    } catch (e: any) {
      lastErr = e;
      // 密码错 → 直接抛，不重试；验证码识别错/网络抖动 → 下一轮取新验证码重试。
      if (e?.name === 'LoginError' && /密码错误|credentials/i.test(e?.message || '')) throw e;
    }
  }
  if (!info) throw lastErr || new Error('统一认证登录失败');
  return { studentId: info.user_name, realName: info.real_name || info.user_name };
}

// 按学号 upsert SSO 账号（无本地密码），返回 userId。
export async function findOrCreateSsoUser(studentId: string, realName: string): Promise<string> {
  const rows = await query<{ id: string }>(
    "SELECT id FROM app_user WHERE auth_provider = 'bupt-sso' AND external_id = $1",
    [studentId],
  );
  if (rows[0]) {
    await query('UPDATE app_user SET display_name = $2 WHERE id = $1', [rows[0].id, realName]).catch(() => {});
    return rows[0].id;
  }
  const id = randomUUID();
  await query(
    `INSERT INTO app_user (id, username, password_hash, display_name, avatar_seed, auth_provider, external_id)
     VALUES ($1, $2, NULL, $3, $4, 'bupt-sso', $5)`,
    [id, 'u' + studentId, realName, (realName || '?').slice(0, 1).toUpperCase(), studentId],
  );
  return id;
}

// 本地密码登录：只认「已绑定学号」(external_id 非空)且设了密码的账号。
export async function localVerify(username: string, password: string): Promise<string | null> {
  if (!username || !password) return null;
  const rows = await query<{ id: string; password_hash: string | null }>(
    'SELECT id, password_hash FROM app_user WHERE lower(username) = lower($1) AND password_hash IS NOT NULL AND external_id IS NOT NULL',
    [username],
  );
  const u = rows[0];
  if (!u || !u.password_hash) return null;
  if (!verifyPassword(password, u.password_hash)) return null;
  return u.id;
}

// 注册 = 把本地用户名/密码绑定到已 SSO 验证的学号账号（一账号一学号）。
export async function bindLocalCredentials(
  studentId: string,
  realName: string,
  username: string,
  password: string,
): Promise<{ userId: string } | { error: string }> {
  const taken = await query<{ external_id: string | null }>(
    'SELECT external_id FROM app_user WHERE lower(username) = lower($1)',
    [username],
  );
  if (taken[0] && taken[0].external_id !== studentId) return { error: '用户名已被占用' };

  const existing = await query<{ id: string }>(
    "SELECT id FROM app_user WHERE auth_provider = 'bupt-sso' AND external_id = $1",
    [studentId],
  );
  const hash = hashPassword(password);
  const avatar = (realName || '?').slice(0, 1).toUpperCase();
  if (existing[0]) {
    await query('UPDATE app_user SET username = $2, password_hash = $3, display_name = $4, avatar_seed = $5 WHERE id = $1', [
      existing[0].id, username, hash, realName, avatar,
    ]);
    return { userId: existing[0].id };
  }
  const id = randomUUID();
  await query(
    `INSERT INTO app_user (id, username, password_hash, display_name, avatar_seed, auth_provider, external_id)
     VALUES ($1, $2, $3, $4, $5, 'bupt-sso', $6)`,
    [id, username, hash, realName, avatar, studentId],
  );
  return { userId: id };
}
