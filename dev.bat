@echo off
REM ============================================================
REM  STELLARIS Concert - 本地开发服务器（纯 JS / Node.js）
REM  双击运行即可启动,自动用默认浏览器打开页面
REM  需先安装 Node.js: https://nodejs.org/
REM ============================================================

setlocal

REM ---- 配置(可按需修改) ----
set "PORT=8000"
set "DIR=%~dp0"

cd /d "%DIR%"

REM ---- 检查 Node.js 是否可用 ----
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。请先安装: https://nodejs.org/
  echo        或直接改用: python -m http.server %PORT%
  pause
  exit /b 1
)

echo ==========================================
echo  STELLARIS Concert - Dev Server (Node)
echo  Bind:  0.0.0.0:%PORT%  (监听所有网卡,允许局域网访问)
echo  Local: http://localhost:%PORT%/
echo  Root:  %DIR%
echo ==========================================
echo  (按 Ctrl+C 停止)
echo.

REM 异步打开默认浏览器
start "" "http://localhost:%PORT%/"

REM 前台启动 HTTP 服务器（纯 JS，支持 Range 音频 seek）
node server.js %PORT%

endlocal
