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
      const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      const head = buf.toString('utf8', 0, n);
      const sid = (head.match(/"cliSessionId"\s*:\s*"([^"]+)"/) || [])[1];
      const title = (head.match(/"title"\s*:\s*"([^"]*)"/) || [])[1];
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
// 标题是异步生成的：定时刷新，有变化就推给客户端
setInterval(() => {
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
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`); // 连接即推全量快照
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  // CC hooks 投递事件
  if (req.method === 'POST' && url.pathname === '/hook') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const evt = JSON.parse(body || '{}');
        const now = Date.now();
        state = pruned(reduce(state, evt, now), now);
        broadcast();
      } catch (_) { /* 容错：坏 payload 不影响服务 */ }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`拼豆 bridge listening  http://localhost:${PORT}`);
});
