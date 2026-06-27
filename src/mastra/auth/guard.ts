import type { AppUser } from './user';
import { currentUser } from './user';
import { campus } from './campus';

// 鉴权包装器：受保护路由统一用 authed(handler) 包一层 handler。
// 未登录直接 401；登录则把已解析的 user 作为第二参注入 handler——
// 杜绝"新增端点忘了校验 currentUser"这类结构性疏漏。
//
// 校园门禁(CAMPUS_GATE=on 时)：SSO 账号(北邮统一认证)放行任何网络；
// 本地账号仅限校园网 IP —— 把使用范围锁在「校园网内 或 校园成员」。
export function authed(handler: (c: any, user: AppUser) => any) {
  return async (c: any) => {
    const u = await currentUser(c);
    if (!u) return c.json({ error: '未登录' }, 401);
    if (campus.gateOn && u.auth_provider !== 'bupt-sso' && !campus.isFromCampus(c)) {
      return c.json({ error: '请在校园网内访问，或使用北邮统一认证登录' }, 403);
    }
    return handler(c, u);
  };
}
