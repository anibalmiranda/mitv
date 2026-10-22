@echo off
setlocal
rem ============================================================
rem  Multi YouTube - inicia el servidor local y abre la pagina
rem  Usa el puerto 18090. El 90 de antes lo ocupa IIS (el servidor
rem  web de Windows) y ahi la pagina no llegaba a servidor.py.
rem  Tus listas, favoritos y ajustes se pasan solos a la direccion
rem  nueva la primera vez (y quedan tambien en un archivo).
rem  Para detenerlo, cierra esta ventana.
rem ============================================================
set "PUERTO=18090"
set "URL=http://127.0.0.1:%PUERTO%/"
cd /d "%~dp0"

rem Si ya esta corriendo (otra ventana), solo se abre la pagina
curl -s -o nul -m 2 "%URL%api/estado" >nul 2>nul && (
  echo   Multi YouTube ya esta corriendo: abriendo %URL%
  start "" "%URL%"
  timeout /t 3 /nobreak >nul
  goto :eof
)

rem Busca Python (sin caer en el acceso directo de la Microsoft Store)
python --version >nul 2>nul && (set "PY=python" & goto :iniciar)
py --version >nul 2>nul && (set "PY=py" & goto :iniciar)
goto :sinpython

:iniciar
echo.
echo   Multi YouTube en %URL%
echo   Cierra esta ventana para detenerlo.
echo.
rem Abre el navegador 2 segundos despues, cuando el servidor ya esta arriba
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start %URL%"
rem servidor.py entrega la pagina, guarda tus datos y consulta a YouTube (@handle, directos que cambiaron de URL)
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
