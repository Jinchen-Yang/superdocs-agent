import { z } from 'zod';
import { log } from '../util/log';

// 集中校验环境变量：启动时一次性 parse，把"缺 DATABASE_URL / 弱密钥 / 数字配错"等
// 在 boot 阶段就以聚合错误暴露，而非等到首个请求才零散报错（解决"env 校验两套策略不统一"）。
// 注：不替换各模块内联读取（避免大改），仅作权威的早期 fail-fast。

const isProd = process.env.NODE_ENV === 'production';

// 空串视作未设置：`.env.example` 里大量 `KEY=` 占位，避免被 coerce 成 0/NaN 误判。
const cleaned: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
);

const schema = z.object({
  DATABASE_URL: z.string().min(1, '必填：Postgres 连接串'),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().optional(),
  APP_SESSION_SECRET: z.string().min(16, '至少 16 字符（openssl rand -hex 32）').optional(),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).optional(),
  PG_POOL_MAX: z.coerce.number().int().positive().optional(),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  SSO_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
});

export function validateEnv(): void {
  const r = schema.safeParse(cleaned);
  const issues: string[] = r.success ? [] : r.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  // 生产强约束：会话密钥必填，否则 token 可被伪造。
  if (isProd && !cleaned.APP_SESSION_SECRET) {
    issues.push('  - APP_SESSION_SECRET: 生产环境必填（否则会话 token 可被伪造）');
  }
  if (issues.length) {
    log.error('环境变量校验未通过：\n' + issues.join('\n'));
    throw new Error('环境变量校验失败，请检查 .env（详见上方日志）');
  }
}
