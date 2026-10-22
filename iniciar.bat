@echo off
setlocal
rem ============================================================
rem  Multi YouTube - inicia un servidor local y abre la pagina
rem  Usa el puerto 90, el mismo de antes: asi se conservan tus
rem  listas, favoritos y ajustes (quedan guardados por puerto).
rem  Para detenerlo, cierra esta ventana.
rem ============================================================
set "PUERTO=90"
cd /d "%~dp0"

rem Busca Python (sin caer en el acceso directo de la Microsoft Store)
python --version >nul 2>nul && (set "PY=python" & goto :iniciar)
py --version >nul 2>nul && (set "PY=py" & goto :iniciar)
goto :sinpython

:iniciar
echo.
echo   Multi YouTube en http://localhost:%PUERTO%/
echo   Cierra esta ventana para detenerlo.
echo.
rem Abre el navegador 2 segundos despues, cuando el servidor ya esta arriba
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PUERTO%/"
rem servidor.py entrega la pagina y ademas consulta a YouTube (@handle, directos que cambiaron de URL)
%PY% servidor.py %PUERTO%
echo.
echo   El servidor se detuvo. Si dice que el puerto esta en uso,
echo   cierra el servidor anterior (otra ventana) y vuelve a abrir este archivo.
pause
goto :eof

:sinpython
echo.
echo   No encontre Python en este equipo.
echo   Instalalo desde python.org (marca "Add python.exe to PATH")
echo   y vuelve a abrir este archivo.
echo.
pause
