import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type Provider = 'deepseek' | 'zhipu' | 'qwen';
export type ModelMeta = {
  id: string; provider: Provider; label: string; multimodal: boolean;
  inPrice: number; outPrice: number; currency: 'CNY'; enabled: boolean;
};

// 一处定义所有可选模型;加模型=加一项。价格 ¥/百万 token(占位,P5 再核准)。
export const MODELS: Record<string, ModelMeta> = {
  'deepseek-chat':     { id: 'deepseek-chat',     provider: 'deepseek', label: 'DeepSeek V3',         multimodal: false, inPrice: 2, outPrice: 8,  currency: 'CNY', enabled: true },
  'deepseek-reasoner': { id: 'deepseek-reasoner', provider: 'deepseek', label: 'DeepSeek R1(推理)',  multimodal: false, inPrice: 4, outPrice: 16, currency: 'CNY', enabled: true },
  'glm-4.6':           { id: 'glm-4.6',           provider: 'zhipu',    label: '智谱 GLM-4.6',        multimodal: false, inPrice: 0, outPrice: 0,  currency: 'CNY', enabled: true },
  'glm-4v-plus':       { id: 'glm-4v-plus',       provider: 'zhipu',    label: '智谱 GLM-4V(多模态)', multimodal: true,  inPrice: 0, outPrice: 0,  currency: 'CNY', enabled: true },
  'qwen-vl-max':       { id: 'qwen-vl-max',       provider: 'qwen',     label: '通义千问 VL(多模态)', multimodal: true,  inPrice: 0, outPrice: 0,  currency: 'CNY', enabled: true },
};

const providers = {
  deepseek: createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY ?? '' }),
  zhipu: createOpenAICompatible({ name: 'zhipu', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: process.env.ZHIPU_API_KEY ?? '' }),
  qwen: createOpenAICompatible({ name: 'qwen', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: process.env.QWEN_API_KEY ?? '' }),
} as const;

export const DEFAULT_MODEL = 'deepseek-chat';

export function resolveModel(id?: string) {
  const meta = MODELS[id ?? ''] ?? MODELS[DEFAULT_MODEL];
  return (providers[meta.provider] as any)(meta.id);
}
export function listModels() {
  return Object.values(MODELS).filter((m) => m.enabled)
    .map(({ id, label, provider, multimodal }) => ({ id, label, provider, multimodal }));
}
