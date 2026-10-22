@echo off
setlocal
rem ============================================================
rem  Multi YouTube - pruebas automaticas
rem    probar.bat            : sin internet (rapido; no toca tus datos)
rem    probar.bat --internet : ademas comprueba la lectura de YouTube
rem ============================================================
cd /d "%~dp0"
set "PYTHONIOENCODING=utf-8"
chcp 65001 >nul
python --version >nul 2>nul && (set "PY=python" & goto :correr)
py --version >nul 2>nul && (set "PY=py" & goto :correr)
echo   No encontre Python. Instalalo desde python.org y vuelve a abrir este archivo.
pause
goto :eof

:correr
%PY% pruebas\correr.py %*
echo.
pause
