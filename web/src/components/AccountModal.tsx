import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { Dialog } from './Dialog';
import { toast } from './Toast';
import type { Profile, User } from '../types';

const fmt = (n: number) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
};

export function AccountModal({ user, onClose, onLogout, onOpenAdmin }: { user: User; onClose: () => void; onLogout: () => void; onOpenAdmin?: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memory, setMemory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .profile()
      .then((p) => {
        setProfile(p);
        setMemory(p.workingMemory || '');
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    const r = await api.saveMemory(memory).catch(() => null);
    setSaving(false);
    if (r && r.ok) toast.ok('记忆已保存');
    else toast.err('保存失败，请重试');
  };

  const today = profile?.usage.today;
  const total = profile?.usage.total;
  const stat = (label: string, val: string) => (
    <div className="frost flex-1 rounded-xl px-2.5 py-3 text-center">
      <div className="text-lg font-extrabold">{val}</div>
      <div className="text-sub mt-0.5 text-[11px]">{label}</div>
    </div>
  );
  const sectionLabel = 'text-faint mt-2 text-[11.5px] font-extrabold uppercase tracking-wider';

  return (
    <Dialog
      label="账号与个人页"
      onClose={onClose}
      className="glass fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[92%] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 overflow-y-auto rounded-3xl p-5"
    >
        <div className="flex items-center gap-3">
          <div className="accent-grad grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white">
            {(user.avatarSeed || user.displayName || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold">{user.displayName || user.username}</div>
            <div className="text-sub text-[12.5px] font-semibold">@{user.username} · {user.provider}</div>
          </div>
          <button onClick={onClose} aria-label="关闭" className="text-sub grid size-8 place-items-center rounded-lg bg-black/5 dark:bg-white/10">
            <X className="size-4" />
          </button>
        </div>

        <div className={sectionLabel}>Token 消耗 Usage</div>
        <div className="flex gap-2">
          {stat('今日 tokens', fmt((today?.input || 0) + (today?.output || 0)))}
          {stat('累计 tokens', fmt((total?.input || 0) + (total?.output || 0)))}
          {stat('对话次数', String(total?.calls || 0))}
        </div>
        {(profile?.usage.byModel || []).map((r) => (
          <div key={r.model} className="flex justify-between rounded-lg bg-white/40 px-3 py-1.5 text-[12.5px] dark:bg-white/5">
            <span className="font-semibold">{r.model || '(未知)'}</span>
            <span className="text-sub font-bold">{fmt((r.input || 0) + (r.output || 0))} tk</span>
          </div>
        ))}

        <div className={sectionLabel}>个人记忆 Working Memory</div>
        <textarea
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          placeholder="助手会自动记录你的学号 / 姓名 / 学院 / 常用课程 / 偏好，也可手动编辑后保存。"
          className="min-h-28 w-full resize-y rounded-xl border border-white/40 bg-white/55 px-3.5 py-3 text-[13.5px] leading-relaxed outline-none dark:bg-white/5"
        />

        {user.isAdmin && onOpenAdmin && (
          <button onClick={onOpenAdmin} className="frost mt-1 rounded-xl py-2.5 text-[13.5px] font-bold" style={{ color: 'var(--accent)' }}>
            📊 管理统计
          </button>
        )}

        <div className="mt-1.5 flex gap-2.5">
          <button onClick={save} className="accent-grad flex-1 rounded-xl py-3 text-[14px] font-bold text-white shadow-md disabled:opacity-60" disabled={saving}>
            {saving ? '保存中…' : '保存记忆'}
          </button>
          <button onClick={onLogout} className="rounded-xl border border-rose-400/40 px-4 py-3 text-[14px] font-bold text-rose-500">
            退出登录
          </button>
        </div>
    </Dialog>
  );
}
