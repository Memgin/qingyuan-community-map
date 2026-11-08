@echo off
rem 本地预览服务：serve 项目根目录（bat 位于 tools/，故先回到上一级）
cd /d "%~dp0.."
echo ============================================
echo  Qingyuan Map - local preview server
echo  KEEP THIS WINDOW OPEN (minimize is ok)
echo.
echo   Map test : http://127.0.0.1:8001/index.html?demoRoute=1
echo   Home page: http://127.0.0.1:8001/index.html
echo ============================================
python tools\serve_local.py
pause
