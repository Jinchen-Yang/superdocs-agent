import { z } from 'zod';
import { log } from '../util/log';

// 集中校验环境变量：启动时一次性 parse，把"弱密钥 / 数字配错"等在 boot 阶段就以聚合错误暴露，
// 而非等首个请求才零散报错（解决"env 校验两套策略不统一"）。
// 注：不替换各模块内联读取（避免大改），仅作权威的早期 fail-fast。
//
// 关于 DATABASE_URL：仅「告警」不「硬抛」——因为本模块会在 `mastra build` import 入口时执行，
// 构建环境未必有 DB；缺它的权威清晰报错由 db/pool.ts 在首次使用时给出（保留原有惰性语义）。

const isProd = process.env.NODE_ENV === 'production';

// 空串视作未设置：`.env.example` 里大量 `KEY=` 占位，避免被 coerce 成 0/NaN 误判。
const cleaned: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
);

// 只校验「设了就必须合法」的项；缺失与否的硬约束在 validateEnv 里单独处理。
const schema = z.object({
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
  const errors: string[] = [];
  const warnings: string[] = [];

  const r = schema.safeParse(cleaned);
  if (!r.success) {
    errors.push(...r.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  // 生产强约束：会话密钥必填，否则 token 可被伪造。注：session.ts 在 import 期已对此 fail-fast，
  // 且其 import 先于本函数触发——这里是冗余兜底/聚合提示，非唯一防线。
  if (isProd && !cleaned.APP_SESSION_SECRET) {
    errors.push('  - APP_SESSION_SECRET: 生产环境必填（否则会话 token 可被伪造）');
  }
  // 缺 DATABASE_URL 只告警，不阻断 import（构建期可能无 DB）；运行时由 db/pool.ts 权威报错。
  if (!cleaned.DATABASE_URL) {
    warnings.push('  - DATABASE_URL: 未设置，服务无法连接数据库（首个 DB 请求将报错）');
  }

  if (warnings.length) log.warn('环境变量提醒：\n' + warnings.join('\n'));
  if (errors.length) {
    log.error('环境变量校验未通过：\n' + errors.join('\n'));
    throw new Error('环境变量校验失败，请检查 .env（详见上方日志）');
  }
}
