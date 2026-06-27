import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import type { User } from '../types';

type Tab = 'sso' | 'local';

export function AuthGate({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [tab, setTab] = useState<Tab>('sso');
  const [mode, setMode] = useState<'login' | 'register'>('login'); // 本地账号
  const [form, setForm] = useState({ username: '', password: '', studentId: '', ssoPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ campus: boolean; gate: boolean } | null>(null);
  const isRegister = mode === 'register';

  useEffect(() => {
    api.whoami().then((w) => w && setInfo({ campus: w.campus, gate: w.gate }));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError('');
  };

  const run = async (fn: () => Promise<{ user: User }>) => {
    setBusy(true);
    setError('');
    try {
      const { user } = await fn();
      onAuthed(user);
    } catch (e) {
      setError((e as Error).message || '失败');
      setBusy(false);
    }
  };

  const submitLocal = () => {
    const username = form.username.trim();
    if (username.length < 2) return setError('用户名至少 2 个字符');
    if (form.password.length < 8) return setError('本地密码至少 8 位');
    if (isRegister && (!form.studentId.trim() || !form.ssoPassword)) {
      return setError('注册需填学号和统一认证密码以绑定');
    }
    run(() =>
      isRegister
        ? api.register({ username, password: form.password, studentId: form.studentId.trim(), ssoPassword: form.ssoPassword })
        : api.login({ username, password: form.password }),
    );
  };

  const submitSso = () => {
    const studentId = form.studentId.trim();
    if (!studentId || !form.ssoPassword) return setError('请填写学号和密码');
    run(() => api.sso({ studentId, password: form.ssoPassword }));
  };

  const submit = () => {
    if (busy) return; // 防 Enter 绕过 disabled 重复提交
    return tab === 'sso' ? submitSso() : submitLocal();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const inputCls = 'w-full rounded-xl border border-white/40 bg-white/60 px-3.5 py-3 text-base outline-none dark:bg-white/5';
  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => {
        setTab(t);
        setError('');
      }}
      className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition ${tab === t ? 'accent-grad text-white shadow' : 'text-sub'}`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="grid h-full place-items-center p-6"
      style={{
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.5rem + max(env(safe-area-inset-bottom), var(--kb, 0px)))',
        transition: 'padding-bottom .18s ease',
      }}
    >
      <div className="glass flex w-full max-w-[380px] flex-col gap-3 rounded-3xl px-7 py-8 text-center" style={{ animation: 'riseIn .5s ease both' }}>
        <div className="accent-grad mx-auto grid size-14 place-items-center rounded-2xl shadow-lg">
          <Sparkles className="size-7 text-white" />
        </div>
        <h1 className="m-0 text-xl font-extrabold">登录 superdocs</h1>
        <p className="text-sub -mt-1 text-[13px]">北邮智能助手 · 资料检索 + 新生答疑</p>

        <div className="frost flex gap-1 rounded-xl p-1">
          {tabBtn('sso', '北邮统一认证')}
          {tabBtn('local', '本地账号')}
        </div>

        {info?.gate && (
          <div className="text-[12px] font-semibold" style={{ color: info.campus ? '#19c39c' : 'var(--accent)' }}>
            {info.campus ? '✓ 你在校园网内，可直接登录' : '校外访问：请用「北邮统一认证」登录'}
          </div>
        )}

        {tab === 'sso' ? (
          <>
            <input className={inputCls} placeholder="学号" value={form.studentId} onChange={set('studentId')} onKeyDown={onKey} />
            <input className={inputCls} type="password" placeholder="统一认证密码" value={form.ssoPassword} onChange={set('ssoPassword')} onKeyDown={onKey} />
            <p className="text-faint -mt-1 text-[11.5px] leading-relaxed">用北邮学号和统一身份认证密码登录，校内外均可用，仅验证身份不存储密码。</p>
          </>
        ) : (
          <>
            <input className={inputCls} placeholder="用户名" value={form.username} onChange={set('username')} onKeyDown={onKey} />
            <input className={inputCls} type="password" placeholder="本地密码（至少 8 位）" value={form.password} onChange={set('password')} onKeyDown={onKey} />
            {isRegister && (
              <>
                <input className={inputCls} placeholder="学号（绑定统一认证）" value={form.studentId} onChange={set('studentId')} onKeyDown={onKey} />
                <input className={inputCls} type="password" placeholder="统一认证密码（仅验证身份，不存储）" value={form.ssoPassword} onChange={set('ssoPassword')} onKeyDown={onKey} />
                <p className="text-faint -mt-1 text-[11.5px] leading-relaxed">注册需用北邮统一认证验证身份并绑定；绑定后本地密码或统一认证两种方式都能登录。</p>
              </>
            )}
          </>
        )}

        {error && <div className="text-[13px] font-semibold text-rose-500">{error}</div>}

        <button className="accent-grad mt-1 rounded-xl py-3 text-[15px] font-bold text-white shadow-md disabled:opacity-60" onClick={submit} disabled={busy}>
          {busy ? '请稍候…' : tab === 'sso' ? '统一认证登录' : isRegister ? '注册并登录' : '登录'}
        </button>

        {tab === 'local' && (
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
        )}
      </div>
    </div>
  );
}
