import { Agent } from '@mastra/core/agent';
import { deepseek } from '@ai-sdk/deepseek';

export const docsAgent = new Agent({
  id: 'docs-agent',
  name: 'docs-agent',
  instructions: '你是北邮资料镜像站 superdocs 的智能助手。帮用户检索教材/试题/资料、给下载链接、查校园身份。简洁、中文优先,不编造不存在的资料。',
  model: deepseek('deepseek-chat'),
});
