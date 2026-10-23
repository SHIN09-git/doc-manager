#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  摹文拟笔工作台 - 一键启动"
echo "========================================"
echo ""

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "[错误] 请先安装 Node.js 20 或更高版本：https://nodejs.org/"
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "[信息] 首次运行，正在安装依赖..."
    npm install
fi

echo "[信息] 正在构建并启动工作台与本地 API..."
echo "[信息] 启动后将自动打开 http://127.0.0.1:4173/index.html"
echo "[信息] 按 Ctrl+C 可停止本次启动的服务。"
echo ""
npm start
