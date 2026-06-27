import { query } from './pool';

// 账号系统的自建表（与 Mastra 自带的 threads/messages 表分开）。幂等建表，可重复调用。
let _ready: Promise<void> | null = null;

async function doEnsure(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS app_user (
    id            text PRIMARY KEY,
    username      text NOT NULL,
    password_hash text,
    display_name  text,
    avatar_seed   text,
    auth_provider text NOT NULL DEFAULT 'local',
    external_id   text,
    created_at    timestamptz NOT NULL DEFAULT now()
  )`);
  // 用户名大小写不敏感唯一（不依赖 citext 扩展）
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS app_user_username_lower_idx ON app_user (lower(username))`);

  // 会话纪元：嵌进无状态 token，改密/登出时 +1 即可让该用户此前签发的所有 token 立即失效
  // （无状态 token 本无吊销能力，靠这一计数实现「服务端可吊销」）。对老表补列。
  await query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS session_epoch integer NOT NULL DEFAULT 0`);

  await query(`CREATE TABLE IF NOT EXISTS app_usage (
    id            bigserial PRIMARY KEY,
    user_id       text NOT NULL,
    thread_id     text,
    model         text,
    input_tokens  integer NOT NULL DEFAULT 0,
    output_tokens integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS app_usage_user_idx ON app_usage (user_id)`);
  // 今日用量按"用户+时间"过滤,复合索引覆盖该查询
  await query(`CREATE INDEX IF NOT EXISTS app_usage_user_created_idx ON app_usage (user_id, created_at)`);

  // 删除用户时级联清理其用量。Postgres 无 ADD CONSTRAINT IF NOT EXISTS,用 DO 块守卫;
  // 加约束前先清掉历史孤儿行(此前无 FK,可能存在),保证迁移幂等且不会因脏数据中断。
  await query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_usage_user_fk') THEN
      DELETE FROM app_usage WHERE user_id NOT IN (SELECT id FROM app_user);
      ALTER TABLE app_usage ADD CONSTRAINT app_usage_user_fk
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE;
    END IF;
  END $$`);

  // SSO 接入前置:同一 provider 下 external_id 唯一,避免首个 SSO 用户重复注册。
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS app_user_provider_external_idx
    ON app_user (auth_provider, external_id) WHERE external_id IS NOT NULL`);
}

export function ensureSchema(): Promise<void> {
  if (!_ready) {
    _ready = doEnsure().catch((e) => {
      _ready = null; // 失败后允许重试
      throw e;
    });
  }
  return _ready;
}
