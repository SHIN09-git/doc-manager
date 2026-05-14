@echo off
echo ========================================
echo   摹文拟笔工作台 - 启动服务器
echo ========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python
    echo.
    echo 请先安装 Python 3.x: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo [信息] 正在启动 HTTP 服务器...
echo [信息] 端口: 8000
echo.
echo ========================================
echo   请在浏览器中访问:
echo   http://localhost:8000
echo ========================================
echo.
echo 按 Ctrl+C 停止服务器
echo.

REM 启动 Python HTTP 服务器
python -m http.server 8000

pause
