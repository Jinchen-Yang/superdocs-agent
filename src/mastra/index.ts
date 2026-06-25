import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { docsAgent } from './agents/docs-agent';

export const mastra = new Mastra({
  agents: { docsAgent },
  storage: new PostgresStore({ id: 'superdocs', connectionString: process.env.DATABASE_URL! }),
});
