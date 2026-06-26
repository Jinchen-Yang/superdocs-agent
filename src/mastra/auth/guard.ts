import type { AppUser } from './user';
import { currentUser } from './user';

// 鉴权包装器：受保护路由统一用 authed(handler) 包一层 handler。
// 未登录直接 401；登录则把已解析的 user 作为第二参注入 handler——
// 杜绝"新增端点忘了校验 currentUser"这类结构性疏漏。
export function authed(handler: (c: any, user: AppUser) => any) {
  return async (c: any) => {
    const u = await currentUser(c);
    if (!u) return c.json({ error: '未登录' }, 401);
    return handler(c, u);
  };
}
