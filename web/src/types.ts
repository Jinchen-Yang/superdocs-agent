export type User = {
  id: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  provider: string;
  isAdmin?: boolean;
};

export type AdminStats = {
  users: { total: number; bound: number; active: number };
  tokens: { total: number; input: number; output: number; calls: number };
  today: { total: number; calls: number };
  byModel: { model: string; tokens: number; calls: number }[];
  topUsers: { name: string; sid: string; tokens: number; calls: number }[];
};

export type ModelMeta = {
  id: string;
  label: string;
  provider: string;
  multimodal: boolean;
  thinking: boolean;
};

export type Conversation = { id: string; title: string; updatedAt: string };

export type ServerMessage = { role: 'user' | 'assistant'; content: string };

// 前端持有的消息(external store)。reasoning=深度思考,searching=检索中占位。
// image=用户随该消息上传的图片(data URL),用于多模态与气泡内回显。
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  searching?: boolean;
  image?: string;
};

export type Usage = {
  total: { input: number; output: number; calls: number };
  today: { input: number; output: number; calls: number };
  byModel: { model: string; input: number; output: number }[];
};

export type Profile = { user: User; workingMemory: string; usage: Usage };
