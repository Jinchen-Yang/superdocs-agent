import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type Provider = 'deepseek' | 'zhipu' | 'qwen';
export type ModelMeta = {
  id: string; provider: Provider; label: string; multimodal: boolean;
  thinking: boolean; // 是否支持"深度思考"开关(DeepSeek V4 via providerOptions)
  inPrice: number; outPrice: number; currency: 'CNY'; enabled: boolean;
};

// 一处定义所有可选模型;加模型=加一项。价格 ¥/百万 token(约值,按官方美元价×7 折算,以官网为准)。
// 注:deepseek-chat / deepseek-reasoner 于 2026-07-24 下线,已切换到 V4 正式 ID。
export const MODELS: Record<string, ModelMeta> = {
  'deepseek-v4-flash': { id: 'deepseek-v4-flash', provider: 'deepseek', label: 'DeepSeek V4',        multimodal: false, thinking: true,  inPrice: 1, outPrice: 2,  currency: 'CNY', enabled: true },
  'deepseek-v4-pro':   { id: 'deepseek-v4-pro',   provider: 'deepseek', label: 'DeepSeek V4 Pro',    multimodal: false, thinking: true,  inPrice: 3, outPrice: 6,  currency: 'CNY', enabled: true },
  'glm-4.6':           { id: 'glm-4.6',           provider: 'zhipu',    label: '智谱 GLM-4.6',        multimodal: false, thinking: false, inPrice: 0, outPrice: 0,  currency: 'CNY', enabled: true },
  'glm-4v-plus':       { id: 'glm-4v-plus',       provider: 'zhipu',    label: '智谱 GLM-4V(多模态)', multimodal: true,  thinking: false, inPrice: 0, outPrice: 0,  currency: 'CNY', enabled: true },
  'qwen-vl-max':       { id: 'qwen-vl-max',       provider: 'qwen',     label: '通义千问 VL(多模态)', multimodal: true,  thinking: false, inPrice: 0, outPrice: 0,  currency: 'CNY', enabled: true },
};

const providerKeys: Record<Provider, string | undefined> = {
  deepseek: process.env.DEEPSEEK_API_KEY,
  zhipu: process.env.ZHIPU_API_KEY,
  qwen: process.env.QWEN_API_KEY,
};

// 启动即检查:缺 key 的提供商先告警,尽早暴露配置缺漏(而非等用户点了某模型才在调用时 401)。
for (const [p, k] of Object.entries(providerKeys)) {
  if (!k) console.warn(`[models] ${p} 的 API key 未设置,选用该提供商的模型时会报错`);
}

const providers = {
  deepseek: createDeepSeek({ apiKey: providerKeys.deepseek ?? '' }),
  zhipu: createOpenAICompatible({ name: 'zhipu', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: providerKeys.zhipu ?? '' }),
  qwen: createOpenAICompatible({ name: 'qwen', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: providerKeys.qwen ?? '' }),
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
