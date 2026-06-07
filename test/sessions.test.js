'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { reduce, emptyState, pruned } = require('../sessions.js');

const evt = (o) => ({ session_id: 's1', cwd: '/Users/x/proj', ...o });

test('SessionStart 创建 running 会话', () => {
  const s = reduce(emptyState(), evt({ hook_event_name: 'SessionStart' }), 1000);
  assert.equal(s.sessions.s1.state, 'running');
  assert.equal(s.sessions.s1.project, 'proj');
  assert.equal(s.sessions.s1.startedAt, 1000);
});

test('PostToolUse 累加工具计数并保持 running', () => {
  let s = reduce(emptyState(), evt({ hook_event_name: 'SessionStart' }), 1000);
  s = reduce(s, evt({ hook_event_name: 'PostToolUse', tool_name: 'Edit' }), 2000);
  s = reduce(s, evt({ hook_event_name: 'PostToolUse', tool_name: 'Bash' }), 3000);
  assert.equal(s.sessions.s1.state, 'running');
  assert.equal(s.sessions.s1.toolCalls, 2);
  assert.equal(s.sessions.s1.lastTool, 'Bash');
  assert.equal(s.sessions.s1.lastEventAt, 3000);
});

test('Notification → waiting，Stop → done', () => {
  let s = reduce(emptyState(), evt({ hook_event_name: 'SessionStart' }), 1000);
  s = reduce(s, evt({ hook_event_name: 'Notification' }), 2000);
  assert.equal(s.sessions.s1.state, 'waiting');
  s = reduce(s, evt({ hook_event_name: 'Stop' }), 3000);
  assert.equal(s.sessions.s1.state, 'done');
  assert.equal(s.sessions.s1.completedAt, 3000);
});

test('多会话独立维护', () => {
  let s = reduce(emptyState(), evt({ hook_event_name: 'SessionStart' }), 1000);
  s = reduce(s, { session_id: 's2', cwd: '/a/b/other', hook_event_name: 'SessionStart' }, 1100);
  assert.equal(Object.keys(s.sessions).length, 2);
  assert.equal(s.sessions.s2.project, 'other');
});

test('Stop 后再次活动可回到 running（续命）', () => {
  let s = reduce(emptyState(), evt({ hook_event_name: 'SessionStart' }), 1000);
  s = reduce(s, evt({ hook_event_name: 'Stop' }), 2000);
  s = reduce(s, evt({ hook_event_name: 'PostToolUse', tool_name: 'Read' }), 3000);
  assert.equal(s.sessions.s1.state, 'running');
  assert.equal(s.sessions.s1.toolCalls, 1);
});

test('prune 清理超时空闲会话', () => {
  let s = reduce(emptyState(), evt({ hook_event_name: 'SessionStart' }), 1000);
  const s2 = pruned(s, 1000 + 31 * 60 * 1000);
  assert.equal(Object.keys(s2.sessions).length, 0);
});
