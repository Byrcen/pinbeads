'use strict';

// 会话状态机：纯函数 reducer，供 server.js 与测试共用。
// 一个 session 对象的形状：
//   { id, project, state: 'running'|'waiting'|'done',
//     toolCalls, lastTool, startedAt, lastEventAt, completedAt }

function emptyState() {
  return { sessions: {} };
}

function project(cwd) {
  return (cwd || '').split('/').filter(Boolean).pop() || '未知项目';
}

// 返回新 state（浅拷贝），不修改入参。now 为毫秒时间戳。
function reduce(state, evt, now) {
  const id = evt.session_id || 'unknown';
  const prev = state.sessions[id] || {
    id,
    project: project(evt.cwd),
    state: 'running',
    toolCalls: 0,
    lastTool: null,
    startedAt: now,
    lastEventAt: now,
    completedAt: null,
  };
  const s = {
    ...prev,
    project: project(evt.cwd) || prev.project,
    lastEventAt: now,
  };
  switch (evt.hook_event_name) {
    case 'SessionStart':
      Object.assign(s, { state: 'running', toolCalls: 0, startedAt: now, completedAt: null, lastTool: null });
      break;
    case 'PostToolUse':
      s.state = 'running';
      s.toolCalls = prev.toolCalls + 1;
      s.lastTool = evt.tool_name || prev.lastTool;
      break;
    case 'SubagentStop':
      s.state = 'running';
      break;
    case 'Notification':
      s.state = 'waiting';
      break;
    case 'Stop':
      s.state = 'done';
      s.completedAt = now;
      break;
    default:
      break;
  }
  return { ...state, sessions: { ...state.sessions, [id]: s } };
}

const IDLE_MS = 30 * 60 * 1000;

// 移除空闲超过 30 分钟的会话。
function pruned(state, now) {
  const out = {};
  for (const [id, s] of Object.entries(state.sessions)) {
    if (now - s.lastEventAt < IDLE_MS) out[id] = s;
  }
  return { ...state, sessions: out };
}

module.exports = { emptyState, reduce, pruned, project, IDLE_MS };
