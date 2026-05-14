#!/bin/bash

echo "========================================"
echo "  摹文拟笔工作台 - 启动服务器"
echo "========================================"
echo ""

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "[错误] 未检测到 Python"
    echo ""
    echo "请先安装 Python 3.x: https://www.python.org/downloads/"
    echo ""
    exit 1
fi

# 使用 python3 或 python
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python"
fi

echo "[信息] 正在启动 HTTP 服务器..."
echo "[信息] 端口: 8000"
echo ""
echo "========================================"
echo "  请在浏览器中访问:"
echo "  http://localhost:8000"
echo "========================================"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 启动 Python HTTP 服务器
$PYTHON_CMD -m http.server 8000
