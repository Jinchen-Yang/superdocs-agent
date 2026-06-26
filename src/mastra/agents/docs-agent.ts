import { Agent } from '@mastra/core/agent';
import { resolveModel } from '../models/registry';
import { docTools } from '../tools/registry';
import { memory } from '../memory/memory';
import { examFinderSkill } from '../skills/exam-finder';

export const docsAgent = new Agent({
  id: 'docs-agent',
  name: 'docs-agent',
  instructions: `你是北邮资料镜像站 superdocs 的智能助手。
- 用 search_documents 检索教材(book)/试题(test)/资料(doc);命中后用 get_document 取详情、get_download_url 给下载链接。
- 记住用户的学号/姓名/学院/常用课程/偏好(写入工作记忆),后续个性化。
- 简洁、中文优先,不编造不存在的资料。下载受校园网/登录限制时如实告知。`,
  model: ({ runtimeContext }: any) => resolveModel(runtimeContext?.get?.('model')),
  tools: docTools,
  memory,
  skills: [examFinderSkill],
});
