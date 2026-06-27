import { Pool } from 'pg';
import { log } from '../util/log';

// 单例 pg.Pool，复用 DATABASE_URL。自建连接池而非借 Mastra 的 PostgresStore.db，
// 避免与 Mastra 内部 init 时序耦合。
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL 未设置，无法连接 Postgres');
    // 区分「未设置」与「显式 0(=禁用超时)」：0 是 falsy，不能用 `|| 15000` 回落，否则 0 失效（与 .env.example 的「0=不限」矛盾）。
    const stmtRaw = process.env.PG_STATEMENT_TIMEOUT_MS;
    const statementTimeout = stmtRaw == null || stmtRaw === '' ? 15_000 : Number(stmtRaw);
    _pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // 反向 SSH 隧道 / NAT 下空闲连接易被中途掐断，开启 TCP keepalive 主动探活。
      keepAlive: true,
      // 慢查询硬上限，避免单条卡死的查询长期占用连接（0=不限，可用 env 调）。
      statement_timeout: statementTimeout,
    });
    // 关键：必须监听 'error'。pg 在「后台空闲连接被对端断开」时会在 Pool 上发 error 事件，
    // 无监听器则被 Node 当作未捕获异常 → 整个进程 crash（隧道抖动/PG 重启时几乎必触发）。
    // 这里仅记录，坏连接会被连接池自动剔除并按需重建。
    _pool.on('error', (e: any) => log.error('pg 空闲连接异常(已忽略，连接池将自动回收重建)', { err: e?.message || String(e) }));
  }
  return _pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}
