import { query } from '../db/pool';
import { ensureSchema } from '../db/schema';
import { readSession } from './session';
import { isAdmin } from './admin';

export interface AppUser {
  id: string;
  username: string;
  password_hash: string | null;
  display_name: string | null;
  avatar_seed: string | null;
  auth_provider: string;
  external_id: string | null;
  session_epoch: number;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  await ensureSchema();
  const rows = await query<AppUser>(
    'SELECT id, username, password_hash, display_name, avatar_seed, auth_provider, external_id, session_epoch FROM app_user WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

// 会话纪元 +1：让该用户此前签发的所有无状态 token 立即失效（登出 / 改密时调用）。
export async function bumpSessionEpoch(id: string): Promise<void> {
  await query('UPDATE app_user SET session_epoch = session_epoch + 1 WHERE id = $1', [id]);
}

// 从签名 cookie 解析出当前用户；无会话/用户不存在/纪元已失效时返回 null。
export async function currentUser(c: any): Promise<AppUser | null> {
  const s = readSession(c);
  if (!s) return null;
  const u = await getUserById(s.userId);
  if (!u) return null;
  // token 内的 epoch 与库中不一致 → 该 token 已被改密/登出吊销。
  if ((u.session_epoch ?? 0) !== s.epoch) return null;
  return u;
}

// 暴露给前端的安全字段（不含 password_hash）。
export function publicUser(u: AppUser) {
  const name = u.display_name || u.username;
  return {
    id: u.id,
    username: u.username,
    displayName: name,
    avatarSeed: (u.avatar_seed || name || '?').slice(0, 1).toUpperCase(),
    provider: u.auth_provider,
    isAdmin: isAdmin(u),
  };
}
