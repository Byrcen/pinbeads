'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { emptyState, reduce, pruned } = require('./sessions.js');

const PORT = Number(process.env.PINBEADS_PORT || process.env.PORT || 4500);
let state = emptyState();
const clients = new Set(); // SSE 响应对象集合

// ===== 会话标题解析 =====
// Claude Code 桌面端把每个会话的元数据存在 App 存储里，含 cliSessionId 与人类可读 title。
// 我们扫这些 local_*.json，建立 session_id -> title 映射，让面板显示真实聊天标题。
const APP_SESS = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
let titleById = {};
function walkTitles(dir, map, depth) {
  if (depth > 4) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walkTitles(full, map, depth + 1); continue; }
    if (!(e.name.startsWith('local_') && e.name.endsWith('.json'))) continue;
    try {
      // title 在文件靠前处（其后才是超大的 mcp 配置），只读头部即可，避免解析整文件。
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(8192);                 // 8KB：降低 title 跨越读取边界而漏读的概率
      const n = fs.readSync(fd, buf, 0, 8192, 0);
      fs.closeSync(fd);
      const head = buf.toString('utf8', 0, n);
      const sid = (head.match(/"cliSessionId"\s*:\s*"([^"]+)"/) || [])[1];
      // 转义安全：标题里可能含 \" \\ 等转义，用 (?:\\.|[^"\\])* 完整捕获再 JSON 反转义
      const rawTitle = (head.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/) || [])[1];
      let title = rawTitle;
      if (rawTitle != null) { try { title = JSON.parse('"' + rawTitle + '"'); } catch (_) {} }
      if (sid && title) map[sid] = title;
    } catch (_) {}
  }
}
function refreshTitles() { const map = {}; walkTitles(APP_SESS, map, 0); titleById = map; }
refreshTitles();

// 给会话挂上 title 后再对外暴露
function snapshot() {
  const out = {};
  for (const [id, s] of Object.entries(state.sessions)) out[id] = { ...s, title: titleById[id] || null };
  return out;
}
function broadcast() {
  const data = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch (_) { clients.delete(res); }
  }
}
// 标题是异步生成的：定时刷新，有变化就推给客户端。无客户端时不扫盘（省 idle CPU/IO）。
setInterval(() => {
  if (clients.size === 0) return;
  const before = JSON.stringify(titleById);
  refreshTitles();
  if (JSON.stringify(titleById) !== before) broadcast();
}, 8000);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 游戏页面
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch (_) {
      res.writeHead(500); return res.end('index.html 未找到');
    }
  }

  // SSE 实时推送
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    refreshTitles();                                       // 连接时刷新一次标题（空闲期定时器跳过了扫盘）
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`); // 连接即推全量快照
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  // CC hooks 投递事件
  if (req.method === 'POST' && url.pathname === '/hook') {
    let body = '', tooBig = false;
    req.on('data', (c) => { if (tooBig) return; body += c; if (body.length > 1e6) { tooBig = true; body = ''; } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413); return res.end('payload too large'); }  // 明确回 413，不再静默断连
      try {
        const evt = JSON.parse(body || '{}');
        const now = Date.now();
        state = pruned(reduce(state, evt, now), now);
        broadcast();   // 每个 hook 都推：lastEventAt 必变，"变化才推"无意义；前端已增量 tick，推送很廉价
      } catch (e) { if (process.env.DEBUG_PINBEADS) console.error('hook parse error:', e.message); }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  // 静态资源（像素字体等）：仅白名单目录 assets/，规范化路径防穿越
  if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
    const ASSETS = path.join(__dirname, 'assets');
    const fp = path.normalize(path.join(__dirname, decodeURIComponent(url.pathname)));
    if (!fp.startsWith(ASSETS + path.sep)) { res.writeHead(404); return res.end('not found'); }
    const MIME = { '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
    try {
      const data = fs.readFileSync(fp);
      res.writeHead(200, {
        'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'public, max-age=604800',
      });
      return res.end(data);
    } catch (_) { res.writeHead(404); return res.end('not found'); }
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`拼豆 bridge listening  http://localhost:${server.address().port}`);
});
