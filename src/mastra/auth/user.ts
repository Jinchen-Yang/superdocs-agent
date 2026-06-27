import { query } from '../db/pool';
import { ensureSchema } from '../db/schema';
import { readUserId } from './session';
import { isAdmin } from './admin';

export interface AppUser {
  id: string;
  username: string;
  password_hash: string | null;
  display_name: string | null;
  avatar_seed: string | null;
  auth_provider: string;
  external_id: string | null;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  await ensureSchema();
  const rows = await query<AppUser>(
    'SELECT id, username, password_hash, display_name, avatar_seed, auth_provider, external_id FROM app_user WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

// 从签名 cookie 解析出当前用户；无会话/用户不存在时返回 null。
export async function currentUser(c: any): Promise<AppUser | null> {
  const id = readUserId(c);
  if (!id) return null;
  return getUserById(id);
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
