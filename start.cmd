@echo off
rem SPACE: запуск на Windows двойным щелчком.
rem В первый раз сам ставит зависимости и собирает клиент, после обновления — тоже.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   SPACE нужен Node.js 22.18 или новее ^(лучше 24 LTS^):
  echo     winget install OpenJS.NodeJS.LTS
  echo   или установщик с https://nodejs.org/
  echo.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
