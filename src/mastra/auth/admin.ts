import type { AppUser } from './user';

// 管理员名单：ADMIN_IDS=逗号分隔的「学号(external_id)」。
// 只认学号——绝不认 username：username 是注册时用户自选的任意字符串，
// 若拿它判权限，任何有北邮 SSO 账号的人都能抢注某用户名直接提权。
const ADMINS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(u: AppUser | null | undefined): boolean {
  if (!u || ADMINS.length === 0) return false;
  // 仅按学号判定。external_id 由北邮统一认证回填、用户不可自改。
  return u.external_id != null && ADMINS.includes(u.external_id.toLowerCase());
}
