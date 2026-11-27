/* 小Z · 平台内智能助手（各平台通用同一份文件）
 * 纯原生 JS，无依赖。注入右下角机器人按钮 + 对话窗。
 * 后端：/api/assist/status | /api/assist/ask（平台自己的 API，内部走 EasyX AI 网关）。
 * 限域：只答本平台内的问题；AI 不可用时回落到平台知识卡片。
 * 配置：页面里先设 window.ZBOT_CFG = { api, tokenKeys, name, platformName, greeting } 再引本文件。 */
(function () {
  if (window.__zbotLoaded) return;
  window.__zbotLoaded = true;
  var CFG = window.ZBOT_CFG || {};
  // API 前缀：优先 CFG.api；否则由本脚本的 src 推导（/csv/js/zbot-lite.js → /csv/api/assist）
  var API = CFG.api || (function () {
    try {
      var src = (document.currentScript && document.currentScript.src) || '';
      var m = src.match(/^(.*\/)js\/zbot-lite\.js/);
      if (m) return m[1] + 'api/assist';
    } catch (e) { /* ignore */ }
    return '/api/assist';
  })();
  var BOT = CFG.name || '小Z';
  var PNAME = CFG.platformName || 'EasyX';
  var MODE_LABEL = { ai: 'AI 对话', rag: '法规检索', degrade: '知识库检索', off: '已停用', login: '知识库检索 · 登录可用 AI' };
  // 门户登录态（管理台/试用账号登录后写入 easyx_admin_token）；匿名时不发 Authorization
  function authHeaders(extra) {
    var h = extra || {};
    try {
      // 读取顺序：门户普通用户 token → 管理 token（管理员在门户也能用 AI）
      var keys = CFG.tokenKeys || ['easyx_portal_token', 'easyx_admin_token'];
      var t = null;
      for (var i = 0; i < keys.length; i++) { t = localStorage.getItem(keys[i]); if (t) break; }
      if (t) h.Authorization = 'Bearer ' + t;
    } catch (e) { /* ignore */ }
    return h;
  }
  var state = { mode: 'degrade', suggestions: [], history: [], opened: false, statusLoaded: false };

  // ---------- 样式 ----------
  var css = ''
  + '.zbot-fab{position:fixed;right:28px;bottom:96px;z-index:150;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;'
  + 'background:linear-gradient(135deg,#2ea8ff,#3dd6a8);color:#04202a;display:flex;align-items:center;justify-content:center;'
  + 'box-shadow:0 10px 30px rgba(46,168,255,.45),inset 0 0 0 1px rgba(255,255,255,.25);transition:transform .15s,filter .15s;}'
  + '.zbot-fab:hover{transform:translateY(-2px);filter:brightness(1.06);}'
  + '.zbot-fab .zt{position:absolute;top:-6px;right:-6px;background:#ff7a3d;color:#fff;font-size:10px;font-weight:800;'
  + 'padding:2px 7px;border-radius:999px;box-shadow:0 3px 10px rgba(255,122,61,.5);}'
  + '@media(max-width:680px){.zbot-fab{right:16px;bottom:84px;width:54px;height:54px;}}'
  + '.zbot-panel{position:fixed;right:28px;bottom:96px;z-index:151;width:380px;max-width:calc(100vw - 32px);height:min(600px,calc(100vh - 130px));'
  + 'background:#0f1a2e;border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.55);'
  + 'display:flex;flex-direction:column;overflow:hidden;color:#e8eef7;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;'
  + 'opacity:0;visibility:hidden;transform:translateY(10px) scale(.98);transition:opacity .18s,transform .18s,visibility .18s;}'
  + '.zbot-panel.open{opacity:1;visibility:visible;transform:none;}'
  + '@media(max-width:680px){.zbot-panel{right:16px;bottom:84px;height:min(560px,calc(100vh - 120px));}}'
  + '.zbot-head{display:flex;align-items:center;gap:10px;padding:13px 15px;background:linear-gradient(135deg,rgba(46,168,255,.18),rgba(61,214,168,.14));border-bottom:1px solid rgba(255,255,255,.1);}'
  + '.zbot-head .av{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#2ea8ff,#3dd6a8);color:#04202a;display:flex;align-items:center;justify-content:center;font-size:19px;}'
  + '.zbot-head .tt{font-weight:800;font-size:14.5px;line-height:1.2;}'
  + '.zbot-head .st{font-size:11px;color:#8fa3bd;}'
  + '.zbot-head .tag{margin-left:auto;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.08);color:#bfe9dc;border:1px solid rgba(255,255,255,.14);}'
  + '.zbot-head .x{background:none;border:none;color:#8fa3bd;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;}'
  + '.zbot-head .x:hover{color:#fff;}'
  + '.zbot-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;}'
  + '.zbot-msg{max-width:86%;font-size:13.5px;line-height:1.62;white-space:pre-wrap;word-break:break-word;padding:9px 12px;border-radius:12px;}'
  + '.zbot-msg.bot{align-self:flex-start;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-bottom-left-radius:4px;}'
  + '.zbot-msg.user{align-self:flex-end;background:linear-gradient(135deg,#1e8fe8,#2ea8ff);color:#04202a;font-weight:600;border-bottom-right-radius:4px;}'
  + '.zbot-src{margin-top:7px;font-size:11.5px;color:#8fa3bd;border-top:1px dashed rgba(255,255,255,.12);padding-top:6px;}'
  + '.zbot-src a{color:#7fd7ff;text-decoration:none;margin-right:8px;}'
  + '.zbot-src a:hover{text-decoration:underline;}'
  + '.zbot-chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 14px 6px;}'
  + '.zbot-chip{font-size:12px;color:#cfe2f5;background:rgba(46,168,255,.12);border:1px solid rgba(46,168,255,.3);border-radius:999px;padding:5px 11px;cursor:pointer;}'
  + '.zbot-chip:hover{background:rgba(46,168,255,.22);}'
  + '.zbot-foot{display:flex;gap:8px;padding:11px 12px;border-top:1px solid rgba(255,255,255,.1);}'
  + '.zbot-foot input{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:10px 12px;color:#e8eef7;font-size:13.5px;outline:none;}'
  + '.zbot-foot input:focus{border-color:#3dd6a8;}'
  + '.zbot-foot button{background:linear-gradient(135deg,#2ea8ff,#3dd6a8);border:none;border-radius:10px;padding:0 16px;color:#04202a;font-weight:800;cursor:pointer;font-size:13.5px;}'
  + '.zbot-foot button:disabled{opacity:.5;cursor:not-allowed;}'
  + '.zbot-note{font-size:10.5px;color:#6f8399;text-align:center;padding:0 12px 10px;}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- DOM ----------
  var fab = document.createElement('button');
  fab.className = 'zbot-fab';
  fab.setAttribute('aria-label', CFG.name ? (CFG.name + ' 智能助手') : '小Z 智能助手');
  fab.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#04202a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.3" fill="#04202a"/>'
    + '<circle cx="9" cy="13" r="1.2" fill="#04202a" stroke="none"/><circle cx="15" cy="13" r="1.2" fill="#04202a" stroke="none"/>'
    + '<path d="M9 16.5h6"/></svg><span class="zt">AI</span>';

  var panel = document.createElement('div');
  panel.className = 'zbot-panel';
  panel.innerHTML = ''
    + '<div class="zbot-head">'
    +   '<div class="av">🤖</div>'
    +   '<div><div class="tt">' + BOT + '</div><div class="st">' + PNAME + ' 使用助手</div></div>'
    +   '<span class="tag" id="zbotModeTag">连接中…</span>'
    +   '<button class="x" id="zbotClose" aria-label="关闭">×</button>'
    + '</div>'
    + '<div class="zbot-body" id="zbotBody"></div>'
    + '<div class="zbot-chips" id="zbotChips"></div>'
    + '<div class="zbot-foot">'
    +   '<input id="zbotInput" placeholder="问我 ' + PNAME + ' 怎么用…" autocomplete="off" />'
    +   '<button id="zbotSend">发送</button>'
    + '</div>'
    + '<div class="zbot-note">' + BOT + ' 只回答 ' + PNAME + ' 内的问题 · 辅助参考，不作为合规判定依据</div>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var body = panel.querySelector('#zbotBody');
  var chips = panel.querySelector('#zbotChips');
  var input = panel.querySelector('#zbotInput');
  var sendBtn = panel.querySelector('#zbotSend');
  var modeTag = panel.querySelector('#zbotModeTag');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function addMsg(role, text, sources) {
    var d = document.createElement('div');
    d.className = 'zbot-msg ' + role;
    var html = esc(text);
    if (sources && sources.length) {
      var links = sources.map(function (s) {
        return s.link ? '<a href="' + esc(s.link.href) + '">🔗 ' + esc(s.link.label || s.title) + '</a>' : '<span>📄 ' + esc(s.title) + '</span>';
      }).join('');
      html += '<div class="zbot-src">依据：' + links + '</div>';
    }
    d.innerHTML = html;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }

  function renderChips(list) {
    chips.innerHTML = '';
    (list || []).forEach(function (q) {
      var c = document.createElement('div');
      c.className = 'zbot-chip';
      c.textContent = q;
      c.onclick = function () { input.value = q; send(); };
      chips.appendChild(c);
    });
  }

  function greeting() {
    addMsg('bot', CFG.greeting || ('你好，我是' + BOT + ' 👋 —— ' + PNAME + ' 的使用助手。\n我可以介绍页面用途、说明某个按钮是干嘛的、教你某个流程怎么走（只限本平台内）。'));
  }

  function toggle(open) {
    state.opened = open === undefined ? !state.opened : open;
    panel.classList.toggle('open', state.opened);
    fab.style.display = state.opened ? 'none' : 'flex';
    if (state.opened && !body.childElementCount) greeting();
    if (state.opened) { loadStatus(); input.focus(); }
  }

  function loadStatus() {
    if (state.statusLoaded) return;
    fetch(API + '/status', { headers: authHeaders() }).then(function (r) { return r.json(); }).then(function (d) {
      state.statusLoaded = true;
      state.mode = d.mode || 'degrade';
      state.loginRequired = !!d.loginRequired;
      state.suggestions = d.suggestions || [];
      modeTag.textContent = state.loginRequired ? MODE_LABEL.login : (MODE_LABEL[state.mode] || state.mode);
      if (!body.childElementCount) greeting();
      renderChips(state.suggestions.slice(0, 4));
    }).catch(function () {
      modeTag.textContent = '知识库检索';
    });
  }

  function send() {
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('user', text);
    sendBtn.disabled = true;
    modeTag.textContent = '思考中…';
    var typing = addMsg('bot', '…');
    fetch(API + '/ask', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: text, history: state.history.slice(-6) }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      typing.remove();
      if (d.error) { addMsg('bot', '抱歉：' + d.error); modeTag.textContent = MODE_LABEL[state.mode] || state.mode; sendBtn.disabled = false; return; }
      addMsg('bot', d.answer || '（无回答）', d.sources);
      state.mode = d.mode || state.mode;
      state.loginRequired = !!d.loginRequired;
      modeTag.textContent = state.loginRequired ? MODE_LABEL.login : (MODE_LABEL[state.mode] || state.mode);
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: d.answer || '' });
      if (d.suggestions && d.suggestions.length) renderChips(d.suggestions.slice(0, 4));
      sendBtn.disabled = false;
    }).catch(function (e) {
      typing.remove();
      addMsg('bot', '网络异常，请稍后再试：' + (e && e.message ? e.message : e));
      sendBtn.disabled = false;
    });
  }

  fab.onclick = function () { toggle(); };
  panel.querySelector('#zbotClose').onclick = function () { toggle(false); };
  sendBtn.onclick = send;
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  // 开放给外部调试
  window.__zbot = { toggle: toggle, open: function () { toggle(true); } };
})();
