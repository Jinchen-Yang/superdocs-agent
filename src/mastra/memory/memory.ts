import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { fastembed } from '@mastra/fastembed';

const connectionString = process.env.DATABASE_URL!;

export const memory = new Memory({
  storage: new PostgresStore({ id: 'superdocs-mem', connectionString }),
  vector: new PgVector({ id: 'superdocs-vec', connectionString }),
  embedder: fastembed,
  options: {
    lastMessages: 20,
    semanticRecall: { topK: 3, messageRange: 2, scope: 'resource' },
    workingMemory: {
      enabled: true,
      scope: 'resource', // 个人记忆按用户(resource)持久化,跨该用户的所有会话共享
      template: [
        '# 用户档案',
        '- 学号(user_name):',
        '- 姓名(real_name):',
        '- 学院/专业:',
        '- 角色(roles):',
        '- 常用课程:',
        '- 偏好(语言/详略):',
        '- 默认模型:',
      ].join('\n'),
    },
    // observationalMemory: true, // TODO: 表 mastra_observational_memory 未自动建,待迁移后开
  },
});
