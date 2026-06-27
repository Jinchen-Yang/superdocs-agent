import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import type { User } from '../types';

export function AuthGate({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError('');
  };

  const submit = async () => {
    const username = form.username.trim();
    const password = form.password;
    if (username.length < 2) return setError('用户名至少 2 个字符');
    if (password.length < 8) return setError('密码至少 8 位');
    setBusy(true);
    setError('');
    try {
      const { user } = isRegister
        ? await api.register({ username, password, displayName: form.displayName.trim() })
        : await api.login({ username, password });
      onAuthed(user);
    } catch (e) {
      setError((e as Error).message || '失败');
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const inputCls =
    'w-full rounded-xl border border-white/40 bg-white/60 px-3.5 py-3 text-[14.5px] outline-none dark:bg-white/5';

  return (
    <div className="grid h-full place-items-center p-6" style={{ paddingBottom: 'calc(1.5rem + var(--kb, 0px))', transition: 'padding-bottom .18s ease' }}>
      <div className="glass flex w-full max-w-[380px] flex-col gap-3 rounded-3xl px-7 py-8 text-center" style={{ animation: 'riseIn .5s ease both' }}>
        <div className="accent-grad mx-auto grid size-14 place-items-center rounded-2xl shadow-lg">
          <Sparkles className="size-7 text-white" />
        </div>
        <h1 className="m-0 text-xl font-extrabold">{isRegister ? '注册 superdocs' : '登录 superdocs'}</h1>
        <p className="text-sub -mt-1 mb-1 text-[13px]">北邮智能助手 · 资料检索 + 新生答疑</p>
        <input className={inputCls} placeholder="用户名" value={form.username} onChange={set('username')} onKeyDown={onKey} />
        {isRegister && (
          <input className={inputCls} placeholder="昵称（可选）" value={form.displayName} onChange={set('displayName')} onKeyDown={onKey} />
        )}
        <input className={inputCls} type="password" placeholder="密码（至少 8 位）" value={form.password} onChange={set('password')} onKeyDown={onKey} />
        {error && <div className="text-[13px] font-semibold text-rose-500">{error}</div>}
        <button
          className="accent-grad mt-1 rounded-xl py-3 text-[15px] font-bold text-white shadow-md disabled:opacity-60"
          onClick={submit}
          disabled={busy}
        >
          {busy ? '请稍候…' : isRegister ? '注册并登录' : '登录'}
        </button>
        <button
          className="py-1 text-[13px] font-semibold"
          style={{ color: 'var(--accent)' }}
          onClick={() => {
            setMode(isRegister ? 'login' : 'register');
            setError('');
          }}
        >
          {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
        </button>
      </div>
    </div>
  );
}
