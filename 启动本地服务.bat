@echo off
cd /d "%~dp0"
echo ============================================
echo  Qingyuan Map - local preview server
echo  KEEP THIS WINDOW OPEN (minimize is ok)
echo.
echo   Map test : http://127.0.0.1:8001/index.html?demoRoute=1
echo   Home page: http://127.0.0.1:8001/index.html
echo ============================================
python serve_local.py
pause
