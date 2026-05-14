@echo off
echo ========================================
echo   摹文拟笔工作台 - 环境检查
echo ========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] 检测到 Python
    python --version
    echo.
    echo 可以直接运行 start.bat 启动服务器
    echo.
    pause
    exit /b 0
)

echo [提示] 未检测到 Python
echo.
echo ========================================
echo   安装 Python（推荐）
echo ========================================
echo.
echo 1. 访问: https://www.python.org/downloads/
echo 2. 下载 Python 3.x 安装程序
echo 3. 运行安装程序
echo 4. 重要: 勾选 "Add Python to PATH"
echo 5. 点击 "Install Now"
echo 6. 安装完成后，重新运行此脚本
echo.
echo ========================================
echo   其他方案
echo ========================================
echo.
echo 方案 1: 使用 VS Code + Live Server 扩展
echo   - 安装 VS Code: https://code.visualstudio.com/
echo   - 安装 Live Server 扩展
echo   - 右键 index.html 选择 "Open with Live Server"
echo.
echo 方案 2: 使用 Node.js
echo   - 安装 Node.js: https://nodejs.org/
echo   - 运行: npx http-server -p 8000
echo.
echo 详细说明请查看: GETTING_STARTED.md
echo.

pause
