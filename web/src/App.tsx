import { useCallback, useEffect, useRef, useState } from 'react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Background } from './components/Background';
import { AuthGate } from './components/AuthGate';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { AccountModal } from './components/AccountModal';
import { ChatSendProvider, Thread } from './chat/Thread';
import { useChatController } from './chat/useChatController';
import { api } from './api';
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

  const modelRef = useRef(model);
  modelRef.current = model;
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;

  const loadConversations = useCallback(() => {
    api.conversations().then((d) => setConversations(d.conversations)).catch(() => {});
  }, []);

  const chat = useChatController({
    modelRef,
    thinkingRef,
    onAuthExpired: () => {
      setUser(null);
      setView('auth');
    },
    onConversationsChanged: loadConversations,
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

  const afterLogin = useCallback(() => {
    api
      .models()
      .then((d) => {
        setModels(d.models);
        if (d.models[0]) setModel(d.models[0].id);
      })
      .catch(() => {});
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
          />
          <div className="min-h-0 flex-1">
            <AssistantRuntimeProvider runtime={chat.runtime}>
              <ChatSendProvider value={chat.send}>
                <Thread />
              </ChatSendProvider>
            </AssistantRuntimeProvider>
          </div>
        </main>
      </div>
      {showAccount && <AccountModal user={user} onClose={() => setShowAccount(false)} onLogout={logout} />}
    </>
  );
}
