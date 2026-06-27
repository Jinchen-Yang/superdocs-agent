import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { Dialog } from './Dialog';
import type { AdminStats } from '../types';

const fmt = (v: number) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
};

export function AdminModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AdminStats | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.adminStats().then(setS).catch((e) => setErr((e as Error).message || '加载失败'));
  }, []);

  const stat = (label: string, val: string, sub?: string) => (
    <div className="frost flex-1 rounded-xl px-2.5 py-3 text-center">
      <div className="text-xl font-extrabold">{val}</div>
      <div className="text-sub mt-0.5 text-[11px]">{label}</div>
      {sub && <div className="text-faint text-[10.5px]">{sub}</div>}
    </div>
  );
  const sectionLabel = 'text-faint mt-2 text-[11.5px] font-extrabold uppercase tracking-wider';

  return (
    <Dialog
      label="管理统计"
      onClose={onClose}
      className="glass fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[94%] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 overflow-y-auto rounded-3xl p-5"
    >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold">📊 管理统计</div>
            <div className="text-sub text-[12.5px] font-semibold">superdocs · 仅管理员可见</div>
          </div>
          <button onClick={onClose} aria-label="关闭" className="text-sub grid size-8 place-items-center rounded-lg bg-black/5 dark:bg-white/10">
            <X className="size-4" />
          </button>
        </div>

        {err && <div className="text-[13px] font-semibold text-rose-500">{err}</div>}
        {!s && !err && <div className="text-sub py-6 text-center text-[13px]">加载中…</div>}

        {s && (
          <>
            <div className={sectionLabel}>用户</div>
            <div className="flex gap-2">
              {stat('总用户', fmt(s.users.total))}
              {stat('已绑定', fmt(s.users.bound))}
              {stat('真正在用', fmt(s.users.active), '发过对话')}
            </div>

            <div className={sectionLabel}>Token 消耗</div>
            <div className="flex gap-2">
              {stat('累计 tokens', fmt(s.tokens.total), `入 ${fmt(s.tokens.input)} / 出 ${fmt(s.tokens.output)}`)}
              {stat('今日 tokens', fmt(s.today.total))}
              {stat('对话次数', fmt(s.tokens.calls), `今日 ${fmt(s.today.calls)}`)}
            </div>

            <div className={sectionLabel}>按模型</div>
            {s.byModel.length === 0 && <div className="text-faint text-[12.5px]">暂无</div>}
            {s.byModel.map((m) => (
              <div key={m.model} className="flex justify-between rounded-lg bg-white/40 px-3 py-1.5 text-[12.5px] dark:bg-white/5">
                <span className="font-semibold">{m.model}</span>
                <span className="text-sub font-bold">{fmt(m.tokens)} tk · {m.calls} 次</span>
              </div>
            ))}

            <div className={sectionLabel}>Top 用户（按 token）</div>
            {s.topUsers.length === 0 && <div className="text-faint text-[12.5px]">暂无</div>}
            {s.topUsers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white/40 px-3 py-1.5 text-[12.5px] dark:bg-white/5">
                <span className="text-faint w-5 font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{t.name}{t.sid && <span className="text-faint font-normal"> · {t.sid}</span>}</span>
                <span className="text-sub shrink-0 font-bold">{fmt(t.tokens)} tk · {t.calls} 次</span>
              </div>
            ))}
          </>
        )}
    </Dialog>
  );
}
