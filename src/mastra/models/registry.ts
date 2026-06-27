import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { withTimeout } from '../util/fetch';

// 上游若一直不返回响应头则在此超时(默认 30s)；一旦开始返回(流式补全)即不再约束，正常长流不受影响。
const llmFetch = withTimeout(Number(process.env.LLM_TIMEOUT_MS) || 30_000);

export type Provider = 'deepseek' | 'mimo';
export type ModelMeta = {
  id: string; provider: Provider; label: string; multimodal: boolean;
  thinking: boolean; // 是否支持"深度思考"开关(DeepSeek V4 via providerOptions)
  inPrice: number; outPrice: number; currency: 'CNY'; enabled: boolean;
};

// 一处定义所有可选模型;加模型=加一项。label 后缀标注能力档,方便用户按"智能程度"选。
// MiMo(小米)为按月续费的 credits 计费(非按 token 计价),inPrice/outPrice 仅占位;
// 每账户用量限额方案待后续设计(见 README/TODO)。DeepSeek 价格 ¥/百万 token(约值,以官网为准)。
export const MODELS: Record<string, ModelMeta> = {
  'deepseek-v4-flash': { id: 'deepseek-v4-flash', provider: 'deepseek', label: 'DeepSeek V4 · 快速',         multimodal: false, thinking: true,  inPrice: 1, outPrice: 2, currency: 'CNY', enabled: true },
  'deepseek-v4-pro':   { id: 'deepseek-v4-pro',   provider: 'deepseek', label: 'DeepSeek V4 Pro · 更强',     multimodal: false, thinking: true,  inPrice: 3, outPrice: 6, currency: 'CNY', enabled: true },
  'mimo-v2.5-pro':     { id: 'mimo-v2.5-pro',     provider: 'mimo',     label: '小米 MiMo V2.5 Pro · 旗舰',   multimodal: false, thinking: false, inPrice: 0, outPrice: 0, currency: 'CNY', enabled: true },
  'mimo-v2.5':         { id: 'mimo-v2.5',         provider: 'mimo',     label: '小米 MiMo V2.5 · 标准',       multimodal: false, thinking: false, inPrice: 0, outPrice: 0, currency: 'CNY', enabled: true },
  'mimo-v2-pro':       { id: 'mimo-v2-pro',       provider: 'mimo',     label: '小米 MiMo V2 Pro · 上代旗舰', multimodal: false, thinking: false, inPrice: 0, outPrice: 0, currency: 'CNY', enabled: true },
  'mimo-v2-omni':      { id: 'mimo-v2-omni',      provider: 'mimo',     label: '小米 MiMo V2 Omni · 多模态',  multimodal: true,  thinking: false, inPrice: 0, outPrice: 0, currency: 'CNY', enabled: true },
};

const providerKeys: Record<Provider, string | undefined> = {
  deepseek: process.env.DEEPSEEK_API_KEY,
  mimo: process.env.MIMO_API_KEY,
};

// 启动即检查:缺 key 的提供商先告警,尽早暴露配置缺漏(而非等用户点了某模型才在调用时 401)。
for (const [p, k] of Object.entries(providerKeys)) {
  if (!k) console.warn(`[models] ${p} 的 API key 未设置,选用该提供商的模型时会报错`);
}

const providers = {
  deepseek: createDeepSeek({ apiKey: providerKeys.deepseek ?? '', fetch: llmFetch }),
  // 小米 MiMo：OpenAI 兼容协议，专属 Base URL。
  mimo: createOpenAICompatible({ name: 'mimo', baseURL: 'https://token-plan-cn.xiaomimimo.com/v1', apiKey: providerKeys.mimo ?? '', fetch: llmFetch }),
} as const;

export const DEFAULT_MODEL = 'deepseek-v4-flash';

export function resolveModel(id?: string) {
  const meta = MODELS[id ?? ''] ?? MODELS[DEFAULT_MODEL];
  // 缺 key 时给出明确错误,而非传空串让下游 LLM 调用报难懂的 401。
  if (!providerKeys[meta.provider]) {
    throw new Error(`模型 ${meta.id} 所属提供商 ${meta.provider} 未配置 API key`);
  }
  return (providers[meta.provider] as any)(meta.id);
}
export function listModels() {
  return Object.values(MODELS).filter((m) => m.enabled)
    .map(({ id, label, provider, multimodal, thinking }) => ({ id, label, provider, multimodal, thinking }));
}

// 给定模型与开关,产出传给 docsAgent.stream 的 providerOptions(仅 DeepSeek 支持思考开关)。
export function thinkingProviderOptions(modelId: string, enabled: boolean) {
  const meta = MODELS[modelId];
  if (!meta || meta.provider !== 'deepseek' || !meta.thinking) return undefined;
  return enabled
    ? { deepseek: { thinking: { type: 'enabled' as const }, reasoningEffort: 'high' as const } }
    : { deepseek: { thinking: { type: 'disabled' as const } } };
}
