// EN 模式中文残留巡检（tuoleX auto）
// 用法：node scripts/en-scan.mjs [origin]   （默认 http://127.0.0.1:8082）
// 前置：tuolex-auto-web 已启动；登录用 admin/123456（可通过环境变量 EASY_SCAN_USER/PASS 覆盖）
// 输出：每路由 UI 残留（应修）与数据/内容类中文（按边界允许）分类
// 注：启发式分类，数据类中可能混入少量 UI 词，结果需人工复核；语言切换按钮「中」与用户名等按数据列出属正常
// 依赖：本机 Chrome（headless CDP）
import { spawn } from 'child_process';

const origin = process.argv[2] || 'http://127.0.0.1:8082';
const USER = process.env.EASY_SCAN_USER || 'admin';
const PASS = process.env.EASY_SCAN_PASS || '123456';
const ROUTES = ['fs/overview','fs/hara','fs/safety-chain','fs/analysis','fs/safety-case','fs/confirm','fs/plan','dashboard', 'projects', 'projects/1?tab=ventry', 'projects/1?tab=process', 'projects/1?tab=assess',
  'projects/1?tab=audit2', 'projects/1?tab=review', 'projects/1?tab=trace', 'projects/1?tab=config',
  'projects/1?tab=metric', 'projects/1?tab=feishu', 'quality', 'fmea', 'ebom', 'docs', 'signatures',
  'audit', 'export', 'users', 'regulations', 'feedback', 'workitems'];
const port = 9600 + Math.floor(Math.random() * 200);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=/tmp/cdp-enscan-${port}`, '--window-size=1440,900', 'about:blank']);
chrome.on('error', () => { console.error('Chrome 启动失败，请确认本机安装 Chrome'); process.exit(1); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(2500);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(t => t.type === 'page');
if (!page) { console.error('无页面目标'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
await send('Page.enable'); await send('Runtime.enable');

// 登录拿 token
let token = '';
try {
  const res = await fetch(origin + '/auto/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASS }) });
  token = ((await res.json()).token) || '';
} catch (e) { console.error('登录失败', e.message); process.exit(1); }
if (!token) { console.error('登录失败：无 token'); process.exit(1); }

// 整页引导（无 hash 根路径 → 注入 → reload 让 i18n 以 en 初始化）
await send('Page.navigate', { url: origin + '/' }); await sleep(2500);
await send('Runtime.evaluate', { expression: `localStorage.setItem('tuolex_token', '${token}'); localStorage.setItem('tuolex_lang', 'en')` });
await send('Page.reload', { ignoreCache: true }); await sleep(5000);

const EVAL = `(() => {
  const CJK = /[\\u4e00-\\u9fff]/;
  function uiish(el) {
    if (!el) return false;
    const t = el.tagName;
    const cls = String(el.className || '');
    if (['BUTTON','TH','H1','H2','H3','H4','LEGEND'].includes(t)) return true;
    if (el.getAttribute && (el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('title'))) return true;
    if (/ant-menu|ant-btn|ant-tabs-tab|ant-table-thead|ant-form-item-label|ant-modal-title|ant-alert|ant-empty|ant-dropdown-menu-item/.test(cls)) return true;
    return false;
  }
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.nodeValue || '';
    if (!CJK.test(txt)) continue;
    if (['SCRIPT','STYLE'].includes(n.parentElement && n.parentElement.tagName)) continue;
    const el = n.parentElement; if (!el) continue;
    const cls = String(el.className || '');
    if (/ant-table-tbody|ant-list-item|ProseMirror|doc-content|ke-content/.test(cls)) continue;
    const s = txt.trim().slice(0, 60);
    if (!s) continue;
    out.push({ tag: el.tagName, cls: cls.slice(0, 50), txt: s, ui: uiish(el) || uiish(el.parentElement) });
  }
  const uniq = {};
  for (const f of out) { const k = f.cls + '|' + f.txt; if (!uniq[k]) uniq[k] = f; }
  return JSON.stringify({ body: document.body.innerText.slice(0, 50), list: Object.values(uniq).slice(0, 40) });
})()`;

let uiTotal = 0;
for (const route of ROUTES) {
  await send('Runtime.evaluate', { expression: `location.hash = '#/${route}'` });
  await sleep(4500);
  const r = await send('Runtime.evaluate', { expression: EVAL, returnByValue: true });
  let items = [], body = '';
  try { const j = JSON.parse(r.result?.value || '{}'); items = j.list || []; body = j.body || ''; } catch { /* ignore */ }
  const ui = items.filter(x => x.ui);
  const data = items.filter(x => !x.ui);
  uiTotal += ui.length;
  const onLogin = body.includes('Sign In') && !body.includes('Dashboard');
  console.log(`[${route}]${onLogin ? ' !!未登录' : ''} 中文: UI=${ui.length} 数据=${data.length}`);
  for (const x of ui.slice(0, 12)) console.log(`   UI <${x.tag} ${x.cls}> ${x.txt}`);
  if (data.length > 14) console.log(`   (数据/内容类 ${data.length} 条，样本)`);
  for (const x of data.slice(0, 2)) console.log(`   · ${x.txt}`);
}
console.log(`\n==== UI 残留合计: ${uiTotal} ====`);
chrome.kill(); process.exit(uiTotal > 0 ? 1 : 0);
