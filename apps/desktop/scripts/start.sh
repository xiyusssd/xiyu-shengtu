#!/usr/bin/env bash
# 一键启动开发版桌面 App：编译 Rust（如需要）+ 起 vite + 起二进制
# Ctrl+C 一并停

set -e
cd "$(dirname "$0")/.."

# 允许通过环境变量覆盖 IMAGEGEN_HOME
export IMAGEGEN_HOME="${IMAGEGEN_HOME:-$HOME/.imagegen}"

# 载入 cargo
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi

# 端口自检
VITE_PORT=1420
if lsof -i:$VITE_PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "→ 端口 $VITE_PORT 已被占用，先杀掉旧的 vite"
  pkill -f "vite.*$VITE_PORT" >/dev/null 2>&1 || true
  sleep 1
fi

# 编译 Rust（缺失或有变更时才会真编）
echo "→ 检查 Rust 二进制…"
BIN_PATH="src-tauri/target/debug/xiyu-shengtu"
if [ ! -f "$BIN_PATH" ]; then
  echo "  首次编译，需要 30–90 秒…"
fi
(cd src-tauri && cargo build 2>&1 | tail -3)

if [ ! -f "$BIN_PATH" ]; then
  echo "✗ 编译产物找不到：$BIN_PATH"
  exit 1
fi

# 启动 vite（后台）
echo "→ 启动 vite dev server（端口 $VITE_PORT）…"
node_modules/.bin/vite --port $VITE_PORT --host 127.0.0.1 >/tmp/xiyu-vite.log 2>&1 &
VITE_PID=$!

# 等 vite 就绪
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null http://127.0.0.1:$VITE_PORT/; then
    echo "  vite ready (PID $VITE_PID)"
    break
  fi
  sleep 0.5
done

# 启动 App
echo "→ 启动 xiyu-shengtu…"
"$BIN_PATH" &
APP_PID=$!
echo "  App PID $APP_PID"
echo "  日志：/tmp/xiyu-vite.log"
echo ""
echo "按 Ctrl+C 停止（会同时停掉 vite 和 App）"

# 清理函数
cleanup() {
  echo ""
  echo "→ 停止 App 和 vite…"
  kill "$APP_PID" 2>/dev/null || true
  kill "$VITE_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "  已停止"
  exit 0
}
trap cleanup INT TERM

# 只要 App 还在，就 wait
wait "$APP_PID"
# App 正常退出后也一并停 vite
kill "$VITE_PID" 2>/dev/null || true
