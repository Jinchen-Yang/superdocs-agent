import { useCallback, useEffect, useRef, useState } from 'react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Background } from './components/Background';
import { AuthGate } from './components/AuthGate';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { AccountModal } from './components/AccountModal';
import { AdminModal } from './components/AdminModal';
import { AttachmentProvider, ChatSendProvider, Thread } from './chat/Thread';
import { useChatController } from './chat/useChatController';
import { api } from './api';
import { Toaster, toast } from './components/Toast';
import type { Conversation, ModelMeta, User } from './types';

export function App() {
  const [view, setView] = useState<'loading' | 'auth' | 'app'>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [model, setModel] = useState('deepseek-v4-flash');
  const [thinking, setThinking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('sd-theme') as 'light' | 'dark') || 'light');
  const [mobile, setMobile] = useState(() => window.innerWidth <= 760);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const embed = new URLSearchParams(window.location.search).has('embed');

  const modelRef = useRef(model);
  modelRef.current = model;
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;

  const loadConversations = useCallback(() => {
    api.conversations().then((d) => setConversations(d.conversations)).catch(() => toast.err('加载会话列表失败'));
  }, []);

  const chat = useChatController({
    modelRef,
    thinkingRef,
    onAuthExpired: () => {
      setUser(null);
      setView('auth');
    },
    onConversationsChanged: loadConversations,
    // 上传图片→自动切到多模态模型；移除/发送后→切回 DeepSeek（"平时保持 DeepSeek"）。
    onImageAttached: (attached) => {
      if (attached) {
        const mm = models.find((m) => m.multimodal);
        if (mm) {
          setModel(mm.id);
          setThinking(false);
        } else {
          toast.err('当前没有可用的多模态模型');
        }
      } else {
        setModel('deepseek-v4-flash');
      }
    },
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('sd-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 移动抽屉打开时 Esc 关闭（键盘可达）。
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const afterLogin = useCallback(() => {
    api
      .models()
      .then((d) => {
        setModels(d.models);
        if (d.models[0]) setModel(d.models[0].id);
      })
      .catch(() => toast.err('加载模型列表失败'));
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    api
      .me()
      .then((d) => {
        setUser(d.user);
        setView('app');
        afterLogin();
      })
      .catch(() => setView('auth'));
  }, [afterLogin]);

  const onAuthed = (u: User) => {
    setUser(u);
    setView('app');
    afterLogin();
  };

  // 内嵌模式：通知父页就绪，并接收宿主签发的 token 自动登录（方案 A）。
  useEffect(() => {
    if (!embed) return;
    const onMsg = (e: MessageEvent) => {
      const t = e.data && e.data.type === 'sd-embed-token' ? e.data.token : null;
      if (t) api.embed(String(t)).then((d) => onAuthed(d.user)).catch(() => {});
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({ type: 'sd-embed-ready' }, '*'); } catch { /* not embedded */ }
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed]);
  const onModel = (id: string) => {
    setModel(id);
    const m = models.find((x) => x.id === id);
    if (m && !m.thinking) setThinking(false);
  };
  const onSelectConv = (id: string) => {
    chat.openConversation(id);
    setSidebarOpen(false);
  };
  const onNewChat = () => {
    chat.newChat();
    setSidebarOpen(false);
  };
  const onRename = (id: string, title: string) => api.renameConversation(id, title).then(loadConversations).catch(() => {});
  const onDelete = (id: string) =>
    api.deleteConversation(id).then(() => {
      loadConversations();
      if (chat.activeId === id) chat.newChat();
    }).catch(() => {});
  const logout = async () => {
    await api.logout();
    setShowAccount(false);
    setUser(null);
    setView('auth');
    chat.newChat();
  };

  if (view !== 'app' || !user) {
    return (
      <>
        <Background />
        <Toaster />
        {view === 'loading' && (
          <div className="relative grid h-full place-items-center">
            <div className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-[var(--accent)]" role="status" aria-label="加载中" />
          </div>
        )}
        {view === 'auth' && <div className="relative h-full"><AuthGate onAuthed={onAuthed} /></div>}
      </>
    );
  }

  return (
    <>
      <Background />
      <div className="relative flex h-full p-0 md:gap-3 md:p-3">
        <div
          className={
            mobile
              ? 'fixed inset-y-0 left-0 z-50 transition-transform duration-300 ' + (sidebarOpen ? 'translate-x-0' : '-translate-x-[104%]')
              : ''
          }
        >
          <Sidebar
            conversations={conversations}
            activeId={chat.activeId}
            user={user}
            onSelect={onSelectConv}
            onNew={onNewChat}
            onRename={onRename}
            onDelete={onDelete}
            onOpenAccount={() => {
              setShowAccount(true);
              setSidebarOpen(false);
            }}
          />
        </div>
        {mobile && sidebarOpen && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

        <main
          className="frost relative flex min-w-0 flex-1 flex-col overflow-hidden md:rounded-3xl"
          style={{
            // 安全区(刘海/灵动岛/Home 指示条)：移动端 main 占满全屏，需让顶栏/输入框避开。
            // 桌面端 env(...) 解析为 0，md:p-3 外框照旧，无副作用。
            paddingTop: 'env(safe-area-inset-top)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
            // 键盘弹起用 --kb 抬升；收起时退回 Home 指示条高度。取 max 避免键盘弹起时双重叠加。
            paddingBottom: 'max(env(safe-area-inset-bottom), var(--kb, 0px))',
            transition: 'padding-bottom .18s ease',
          }}
        >
          <Topbar
            models={models}
            model={model}
            onModel={onModel}
            thinking={thinking}
            onThinking={() => setThinking((v) => !v)}
            theme={theme}
            onTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            onMenu={() => setSidebarOpen(true)}
            embed={embed}
            onClose={() => { try { window.parent.postMessage({ type: 'sd-embed-close' }, '*'); } catch { /* noop */ } }}
          />
          <div className="min-h-0 flex-1">
            <AssistantRuntimeProvider runtime={chat.runtime}>
              <ChatSendProvider value={chat.send}>
                <AttachmentProvider value={{ attachment: chat.attachment, attach: chat.attach, clear: chat.clearAttachment }}>
                  <Thread />
                </AttachmentProvider>
              </ChatSendProvider>
            </AssistantRuntimeProvider>
          </div>
          {!embed && (
            <div className="shrink-0 px-4 pb-1 pt-0.5 text-center text-[11px] leading-tight text-black/40 dark:text-white/40">
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="hover:underline">新ICP备2025024799号</a>
              <span className="mx-1.5 opacity-50">·</span>
              <a href="https://github.com/yangjinchen" target="_blank" rel="noreferrer" className="hover:underline">云间辞</a>
            </div>
          )}
        </main>
      </div>
      {showAccount && (
        <AccountModal
          user={user}
          onClose={() => setShowAccount(false)}
          onLogout={logout}
          onOpenAdmin={() => { setShowAccount(false); setShowAdmin(true); }}
        />
      )}
      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
      <Toaster />
    </>
  );
}
