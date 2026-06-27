import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

// 移动端键盘：整页用 CSS 锁死(body position:fixed)、不滚不跳；这里只把"键盘高度"写进 --kb，
// 由聊天区 padding-bottom 把输入框+气泡抬到键盘上方(只动聊天区，不动整页)。
const setKb = () => {
  const vv = window.visualViewport;
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  document.documentElement.style.setProperty('--kb', kb + 'px');
};
setKb();
window.visualViewport?.addEventListener('resize', setKb);
window.visualViewport?.addEventListener('scroll', setKb);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
