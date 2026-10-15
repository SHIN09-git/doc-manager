@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   摹文拟笔工作台 - 一键启动
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js 20 或更高版本。
    echo 请先安装：https://nodejs.org/
    pause
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 npm，请重新安装 Node.js。
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    call npm.cmd install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

echo [信息] 正在构建并启动工作台与本地 API...
echo [信息] 启动后将自动打开 http://127.0.0.1:4173/index.html
echo [信息] 按 Ctrl+C 可停止本次启动的服务。
echo.
call npm.cmd start
if errorlevel 1 (
    echo.
    echo [错误] 启动失败，请保留本窗口中的错误信息。
    pause
)
