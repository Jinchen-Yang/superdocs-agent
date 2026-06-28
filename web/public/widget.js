/* superdocs 聊天气泡加载器：宿主页 <script src=".../app/widget.js" defer data-accent="..."></script> 一行接入。
   在 Shadow DOM 里建悬浮气泡 + iframe(/app/ui?embed=1)，样式与宿主页完全隔离。 */
(function () {
  if (window.__sdWidgetLoaded) return;
  window.__sdWidgetLoaded = true;

  var script =
    document.currentScript ||
    (function () {
      var ss = document.querySelectorAll('script[src*="/app/widget.js"]');
      return ss[ss.length - 1];
    })();
  var origin = '';
  try { origin = new URL(script.src).origin; } catch (e) { return; }

  var attr = function (k, d) { return (script && script.getAttribute(k)) || d; };
  var cfg = {
    accent: attr('data-accent', '#4d6bfe'),
    side: attr('data-position', 'bottom-right').indexOf('left') >= 0 ? 'left' : 'right',
    token: attr('data-token', '') || window.SD_EMBED_TOKEN || '',
  };
  var iframeUrl = origin + '/app/ui?embed=1';

  var host = document.createElement('div');
  host.id = 'sd-agent-widget';
  (document.body || document.documentElement).appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var style = document.createElement('style');
  style.textContent =
    '*{box-sizing:border-box}' +
    '.wrap{position:fixed;bottom:16px;' + cfg.side + ':16px;z-index:2147483000;' +
    'font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}' +
    '.bubble{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:grid;place-items:center;' +
    'color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.28);transition:transform .2s}' +
    '.bubble:hover{transform:scale(1.06)}.bubble:active{transform:scale(.93)}' +
    '.panel{position:fixed;bottom:84px;' + cfg.side + ':16px;width:400px;height:min(620px,calc(100vh - 110px));' +
    'border-radius:18px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.32);background:#fff;' +
    'opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .22s,transform .22s}' +
    '.panel.open{opacity:1;transform:none;pointer-events:auto}' +
    '.panel iframe{width:100%;height:100%;border:none;display:block}' +
    '@media (max-width:480px){.panel{bottom:0;top:0;left:0;right:0;width:100%;height:100%;border-radius:0}}';
  root.appendChild(style);

  var SPARK = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 6.8L21 11l-6.6 2.2L12 20l-2.4-6.8L3 11l6.6-2.2z" fill="#fff"/></svg>';
  var CLOSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var wrap = document.createElement('div');
  wrap.className = 'wrap';
  var panel = document.createElement('div');
  panel.className = 'panel';
  var bubble = document.createElement('button');
  bubble.className = 'bubble';
  bubble.setAttribute('aria-label', 'AI 助手');
  bubble.style.background = cfg.accent;
  bubble.innerHTML = SPARK;
  wrap.appendChild(panel);
  wrap.appendChild(bubble);
  root.appendChild(wrap);

  var iframe = null;
  var opened = false;
  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.setAttribute('allow', 'clipboard-write; microphone');
    iframe.src = iframeUrl;
    panel.appendChild(iframe);
  }
  function open() { ensureIframe(); panel.classList.add('open'); opened = true; bubble.innerHTML = CLOSE; }
  function close() { panel.classList.remove('open'); opened = false; bubble.innerHTML = SPARK; }
  bubble.addEventListener('click', function () { (opened ? close : open)(); });

  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    var d = e.data || {};
    if (d.type === 'sd-embed-close') close();
    else if (d.type === 'sd-embed-ready' && cfg.token && e.source) {
      // 方案 A：把宿主签发的 token 交给 iframe 自动登录。
      e.source.postMessage({ type: 'sd-embed-token', token: cfg.token }, origin);
    }
  });
})();
