@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ========================================
echo   摹文拟笔工作台 - 环境检查
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 goto missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing

echo [成功] 已检测到 Node.js 与 npm
node --version
call npm.cmd --version
echo.
if exist "node_modules" (
    echo [成功] 项目依赖已安装，可以直接运行 start.bat
) else (
    echo [提示] 尚未安装依赖，start.bat 会在首次运行时自动安装
)
echo.
pause
exit /b 0

:missing
echo [错误] 未检测到完整的 Node.js 环境。
echo 请安装 Node.js 20 或更高版本：https://nodejs.org/
echo 安装后重新运行本检查。
echo.
pause
exit /b 1
