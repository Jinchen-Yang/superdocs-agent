import { useState } from 'react';
import { MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import type { Conversation, User } from '../types';

const isToday = (s: string) => {
  const d = new Date(s);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  user: User;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenAccount: () => void;
};

function ConvRow({ c, active, onSelect, onRename, onDelete }: {
  c: Conversation;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.title);

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const t = text.trim();
          if (t && t !== c.title) onRename(t);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'Escape') {
            setText(c.title);
            setEditing(false);
          }
        }}
        className="w-full rounded-xl border px-2.5 py-2 text-[13.5px] outline-none"
        style={{ borderColor: 'var(--accent)', background: 'rgba(255,255,255,.7)' }}
      />
    );
  }

  return (
    <div className="group relative flex items-center">
      <button
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pl-2.5 pr-9 text-left transition ${active ? 'frost' : 'hover:bg-white/40 dark:hover:bg-white/5'}`}
      >
        <span className={`grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${active ? 'accent-grad text-white' : 'text-sub bg-black/5 dark:bg-white/10'}`}>
          {(c.title || '·').slice(0, 1)}
        </span>
        <span className={`flex-1 truncate text-[13.5px] ${active ? 'font-bold' : 'text-sub'}`}>{c.title || '新对话'}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenu((v) => !v);
        }}
        aria-label="会话操作菜单"
        aria-haspopup="menu"
        aria-expanded={menu}
        className="text-faint absolute right-1 grid size-7 place-items-center rounded-lg opacity-100 transition md:opacity-0 md:group-hover:opacity-100"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="glass absolute right-1 top-9 z-20 flex min-w-28 flex-col rounded-xl p-1.5">
            <button
              className="rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-white/40 dark:hover:bg-white/10"
              onClick={() => {
                setMenu(false);
                setEditing(true);
              }}
            >
              重命名
            </button>
            <button
              className="rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-rose-500 hover:bg-white/40 dark:hover:bg-white/10"
              onClick={() => {
                setMenu(false);
                if (confirm('删除这个对话？不可恢复。')) onDelete();
              }}
            >
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Sidebar({ conversations, activeId, user, onSelect, onNew, onRename, onDelete, onOpenAccount }: Props) {
  const today = conversations.filter((c) => isToday(c.updatedAt));
  const earlier = conversations.filter((c) => !isToday(c.updatedAt));
  const Group = ({ label, list }: { label: string; list: Conversation[] }) =>
    list.length === 0 ? null : (
      <>
        <div className="text-faint px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider">{label}</div>
        {list.map((c) => (
          <ConvRow
            key={c.id}
            c={c}
            active={activeId === c.id}
            onSelect={() => onSelect(c.id)}
            onRename={(t) => onRename(c.id, t)}
            onDelete={() => onDelete(c.id)}
          />
        ))}
      </>
    );

  return (
    <aside
      aria-label="会话侧边栏"
      className="frost flex h-full w-[272px] shrink-0 flex-col gap-2 rounded-none p-3.5 md:rounded-3xl"
      style={{
        // 移动抽屉占满左侧到屏幕边缘，避开安全区；桌面端 env(...) = 0，等同 p-3.5。
        paddingTop: 'calc(0.875rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))',
        paddingLeft: 'calc(0.875rem + env(safe-area-inset-left))',
      }}
    >
      <div className="flex items-center gap-2.5 px-1.5 pb-2 pt-1">
        <div className="accent-grad grid size-8 place-items-center rounded-[9px] shadow">
          <Sparkles className="size-4 text-white" />
        </div>
        <span className="text-[17px] font-extrabold tracking-tight">superdocs</span>
      </div>

      <button
        onClick={onNew}
        className="flex items-center gap-2.5 rounded-xl border border-white/40 bg-white/50 px-3.5 py-2.5 text-[13.5px] font-semibold transition hover:scale-[1.01] dark:bg-white/5"
      >
        <Plus className="size-4" style={{ color: 'var(--accent)' }} />
        新对话 New chat
      </button>

      <div className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
        <Group label="今天 Today" list={today} />
        <Group label="更早 Earlier" list={earlier} />
        {conversations.length === 0 && <div className="text-faint px-2.5 py-4 text-[12.5px] leading-relaxed">还没有对话，开始新对话吧。</div>}
      </div>

      <button
        onClick={onOpenAccount}
        className="flex items-center gap-2.5 rounded-xl border border-white/30 bg-white/30 p-2 text-left transition hover:bg-white/50 dark:bg-white/5"
      >
        <div className="accent-grad grid size-8 shrink-0 place-items-center rounded-[10px] text-[14px] font-bold text-white">
          {(user.avatarSeed || user.displayName || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-bold">{user.displayName || user.username}</div>
          <div className="text-[11.5px] font-semibold" style={{ color: 'var(--accent)' }}>账号 · 个人页</div>
        </div>
      </button>
    </aside>
  );
}
