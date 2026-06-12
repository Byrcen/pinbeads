'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('path');

// 以子进程方式拉起 server（PINBEADS_PORT=0 随机端口），从启动日志解析实际端口
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PINBEADS_PORT: '0' },
    });
    let out = '';
    child.stdout.on('data', (c) => {
      out += c;
      const m = out.match(/localhost:(\d+)/);
      if (m && Number(m[1]) > 0) resolve({ child, port: Number(m[1]) });
    });
    child.stderr.on('data', (c) => { out += c; });
    child.on('error', reject);
    setTimeout(() => reject(new Error('server 未就绪，stdout: ' + out)), 5000).unref();
  });
}

test('GET /assets 字体：200 + font/woff2 + wOF2 魔数', async () => {
  const { child, port } = await startServer();
  try {
    const r = await fetch(`http://localhost:${port}/assets/fonts/fusion-pixel-12px-proportional-zh_hans.woff2`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'font/woff2');
    assert.ok((r.headers.get('cache-control') || '').includes('max-age=604800'));
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'wOF2');
  } finally { child.kill(); }
});

test('路径穿越（/assets/..%2Fserver.js）返回 404', async () => {
  const { child, port } = await startServer();
  try {
    const r = await fetch(`http://localhost:${port}/assets/..%2Fserver.js`);
    assert.equal(r.status, 404);
  } finally { child.kill(); }
});

test('不存在的资源返回 404', async () => {
  const { child, port } = await startServer();
  try {
    const r = await fetch(`http://localhost:${port}/assets/fonts/nope.woff2`);
    assert.equal(r.status, 404);
  } finally { child.kill(); }
});
