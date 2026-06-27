import type { AdminStats, Conversation, ModelMeta, Profile, ServerMessage, User } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error || `HTTP ${r.status}`, r.status);
  }
  return r.json() as Promise<T>;
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  me: () => j<{ user: User }>('/app/auth/me'),
  login: (b: { username: string; password: string }) => j<{ user: User }>('/app/auth/login', jsonPost(b)),
  register: (b: { username: string; password: string; studentId: string; ssoPassword: string }) =>
    j<{ user: User }>('/app/auth/register', jsonPost(b)),
  sso: (b: { studentId: string; password: string }) => j<{ user: User }>('/app/auth/sso', jsonPost(b)),
  embed: (token: string) => j<{ user: User }>('/app/auth/embed', jsonPost({ token })),
  whoami: (): Promise<{ ip: string; campus: boolean; gate: boolean; cidrs: number } | null> =>
    j<{ ip: string; campus: boolean; gate: boolean; cidrs: number }>('/app/auth/whoami').catch(() => null),
  logout: () => fetch('/app/auth/logout', { method: 'POST' }).catch(() => {}),
  models: () => j<{ models: ModelMeta[] }>('/app/models'),
  conversations: () => j<{ conversations: Conversation[] }>('/app/conversations'),
  renameConversation: (id: string, title: string) =>
    j<{ conversation: Conversation }>(`/app/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
  deleteConversation: (id: string) =>
    fetch(`/app/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  messages: (id: string) => j<{ messages: ServerMessage[] }>(`/app/conversations/${encodeURIComponent(id)}/messages`),
  profile: () => j<Profile>('/app/profile'),
  adminStats: () => j<AdminStats>('/app/admin/stats'),
  saveMemory: (workingMemory: string) =>
    fetch('/app/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workingMemory }),
    }),
};

export const uid = () =>
  's-' + (globalThis.crypto && 'randomUUID' in globalThis.crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
