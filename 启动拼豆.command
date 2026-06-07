#!/bin/bash
# 双击即可：启动拼豆桥并用正确地址打开浏览器。
# 关闭此终端窗口即停止 CC 联动。

cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

PORT="${PINBEADS_PORT:-4500}"
URL="http://localhost:${PORT}"

# 找不到 node 就给清晰提示，别静默失败
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没找到 node。请确认已安装 Node，或把它加入 PATH 后重试。"
  echo "   按回车键关闭此窗口。"
  read -r _
  exit 1
fi

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✅ 桥已在运行（端口 ${PORT}），直接打开页面…"
  open "$URL"
  echo "（联动由已运行的进程负责，本窗口可关闭）"
else
  echo "🧩 正在启动拼豆桥… 关闭此窗口即停止联动。"
  echo "   页面：${URL}"
  ( sleep 1; open "$URL" ) &
  exec env PINBEADS_PORT="${PORT}" node server.js
fi
