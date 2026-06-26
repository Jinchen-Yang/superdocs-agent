import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// 用 Node 内置 scrypt 做密码散列，避开 bcrypt 的原生编译依赖。
// 存储格式：scrypt$<salt-hex>$<hash-hex>
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const ref = Buffer.from(hashHex, 'hex');
  const test = scryptSync(password, salt, 64);
  return ref.length === test.length && timingSafeEqual(ref, test);
}
