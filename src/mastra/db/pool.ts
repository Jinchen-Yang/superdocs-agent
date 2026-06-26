import { Pool } from 'pg';

// 单例 pg.Pool，复用 DATABASE_URL。自建连接池而非借 Mastra 的 PostgresStore.db，
// 避免与 Mastra 内部 init 时序耦合。
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL 未设置，无法连接 Postgres');
    _pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return _pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}
