import type { AppUser } from './user';

// 管理员名单：ADMIN_IDS=逗号分隔的 学号(external_id) 或 用户名(username)。
// 仅名单内账号能看管理统计页。
const ADMINS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(u: AppUser | null | undefined): boolean {
  if (!u || ADMINS.length === 0) return false;
  return (
    (u.external_id != null && ADMINS.includes(u.external_id.toLowerCase())) ||
    (u.username != null && ADMINS.includes(u.username.toLowerCase()))
  );
}
