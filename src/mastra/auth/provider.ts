import { randomUUID } from 'node:crypto';
import { login as buptLogin } from '@byrdocs/bupt-auth';
import { query, withTransaction } from '../db/pool';
import { verifyPassword } from './password';
import { withTimeout, withDeadline } from '../util/fetch';

const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS) || 10_000;
const SSO_TIMEOUT_MS = Number(process.env.SSO_TIMEOUT_MS) || 20_000;
const tfetch = withTimeout(OCR_TIMEOUT_MS);

// 账号模型：一账号一学号(external_id)，全部经北邮统一认证(SSO)。
// - 登录 = SSO（学号 + 统一认证密码）；首次自动建账号。
// - 改版前的本地账号（external_id 为空、无法再用密码登录）可经「迁移」并入统一认证账号。
// 验证码：onCaptcha → 自建 OCR(OCR_URL，POST 图片字节 → {text})；无 OCR_URL 时撞验证码即失败。

const OCR_URL = process.env.OCR_URL || '';

async function ocrCaptcha(captchaUrl: string, cookie: string): Promise<string> {
  if (!OCR_URL) throw new Error('需要验证码');
  const img = await tfetch(captchaUrl, { headers: { cookie } });
  if (!img.ok) throw new Error('验证码图片获取失败');
  const buf = Buffer.from(await img.arrayBuffer());
  const r = await tfetch(OCR_URL, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: buf });
  if (!r.ok) throw new Error('验证码识别服务异常'); // 先判 ok 再 .json()，避免对非 2xx 响应解析出错。
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
      // buptLogin 不暴露可注入的 fetch，用 withDeadline 限制单次等待，避免上游 hang 把整轮重试拖死。
      info = await withDeadline(buptLogin(studentId, password, opts), SSO_TIMEOUT_MS, '统一认证');
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

// 本地密码登录：只认「已绑定学号」(external_id 非空)且设了密码的账号（即已迁移过的老账号）。
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

// 老本地账号迁移/合并到统一认证账号。调用方须先 buptSsoVerify 通过、传入已验证的 studentId/realName。
// 全程在单事务 + 学号级 advisory 锁内完成（消除 read-decide-write 的 TOCTOU：并发 merge / merge 撞 SSO 首登）。
// 情形 A：该学号尚无 SSO 账号 → 就地把老账号升级为 SSO 账号（set external_id/provider），不删、不搬数据。
// 情形 B：该学号已另有 SSO 账号 → 把老账号数据并入该账号，吸收用户名/密码（若其还没密码），删空壳。
// 唯一索引冲突(23505，极端并发)由调用方 catch → 提示重试。
export async function migrateLocalToSso(
  oldUsername: string,
  oldPassword: string,
  studentId: string,
  realName: string,
): Promise<{ userId: string } | { error: string }> {
  return withTransaction(async (q) => {
    // 同一学号的合并串行化，挡住「两个 merge 同时进情形 A」与多数 merge↔SSO 竞态。
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', ['sso:' + studentId]);

    const old = (
      await q<{ id: string; password_hash: string | null; external_id: string | null }>(
        'SELECT id, password_hash, external_id FROM app_user WHERE lower(username) = lower($1)',
        [oldUsername],
      )
    )[0];
    if (!old || !old.password_hash || !verifyPassword(oldPassword, old.password_hash)) {
      return { error: '旧账号用户名或密码错误' };
    }
    if (old.external_id) {
      return { error: '该账号已绑定统一认证，直接用学号登录即可' };
    }

    // 锁内重新读 canon（含其 password_hash），FOR UPDATE 防并发改动。
    const ex = (
      await q<{ id: string; password_hash: string | null }>(
        "SELECT id, password_hash FROM app_user WHERE auth_provider = 'bupt-sso' AND external_id = $1 FOR UPDATE",
        [studentId],
      )
    )[0];

    // 情形 A：就地升级（最常见；满足「原有账号不删」）。
    if (!ex) {
      await q(
        "UPDATE app_user SET auth_provider = 'bupt-sso', external_id = $2, display_name = COALESCE(NULLIF(display_name, ''), $3), session_epoch = session_epoch + 1 WHERE id = $1",
        [old.id, studentId, realName],
      );
      return { userId: old.id };
    }

    const canonId = ex.id;
    const canonHasPw = !!ex.password_hash;
    if (canonId === old.id) return { userId: canonId }; // 理论不会发生（old.external_id 为空）

    // 情形 B：并入既有 SSO 账号（搬数据 → 吸收凭据 → 删空壳）。
    await q('UPDATE app_usage SET user_id = $1 WHERE user_id = $2', [canonId, old.id]);
    await q('UPDATE mastra_threads SET "resourceId" = $1 WHERE "resourceId" = $2', [canonId, old.id]);
    await q('UPDATE mastra_messages SET "resourceId" = $1 WHERE "resourceId" = $2', [canonId, old.id]);
    // working memory：canon 无该行 → 把老的搬过去；canon 已有 → 保留 canon 的。
    await q(
      'UPDATE mastra_resources SET id = $1 WHERE id = $2 AND NOT EXISTS (SELECT 1 FROM mastra_resources WHERE id = $1)',
      [canonId, old.id],
    );
    // 上一步若已搬走则此处 0 行；若 canon 已有记忆则删掉老账号残留的孤儿行（mastra_resources 无指向 app_user 的 FK，不随删用户级联）。
    await q('DELETE FROM mastra_resources WHERE id = $1', [old.id]);

    if (!canonHasPw) {
      // canon 是纯 SSO（用户名形如 u<学号>、无密码）→ 吸收老账号的用户名+密码。
      // 先删老账号腾出用户名（lower(username) 唯一），再写到 canon，避免唯一冲突。
      const o = (
        await q<{ username: string; password_hash: string | null }>(
          'SELECT username, password_hash FROM app_user WHERE id = $1',
          [old.id],
        )
      )[0];
      await q('DELETE FROM app_user WHERE id = $1', [old.id]);
      await q('UPDATE app_user SET username = $2, password_hash = $3, session_epoch = session_epoch + 1 WHERE id = $1', [
        canonId,
        o.username,
        o.password_hash,
      ]);
    } else {
      await q('DELETE FROM app_user WHERE id = $1', [old.id]);
      await q('UPDATE app_user SET session_epoch = session_epoch + 1 WHERE id = $1', [canonId]);
    }
    return { userId: canonId };
  });
}
