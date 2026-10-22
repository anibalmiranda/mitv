@echo off
setlocal
rem ============================================================
rem  Multi YouTube - actualizar a la ultima version de GitHub
rem  Trae la version mas nueva de github.com/anibalmiranda/mitv.
rem  Tus listas, favoritos y ajustes no se tocan (viven en el navegador).
rem ============================================================

rem Corre desde una copia en TEMP: al actualizar, este mismo archivo puede cambiar,
rem y cmd falla si el .bat que esta leyendo se modifica a medio camino.
if /i not "%~1"=="--desde-temp" (
  copy /y "%~f0" "%TEMP%\mitv-actualizar.bat" >nul
  "%TEMP%\mitv-actualizar.bat" --desde-temp "%~dp0."
)
cd /d "%~2"

git --version >nul 2>nul || goto :singit
if not exist ".git" goto :sinrepo

rem Esta carpeta no se edita a mano: si hay cambios locales, no se pisan
git diff --quiet HEAD -- || goto :cambios

echo.
echo   Version actual:
git log -1 --format="     %%h  %%ad  %%s" --date=format:"%%Y-%%m-%%d %%H:%%M"
echo.
echo   Buscando version nueva en GitHub...
git fetch --quiet origin main || goto :sinred

for /f %%a in ('git rev-parse HEAD') do set "ANTES=%%a"
for /f %%a in ('git rev-parse origin/main') do set "NUEVA=%%a"
if "%ANTES%"=="%NUEVA%" (
  echo   Ya tienes la ultima version.
  goto :fin
)

git merge --ff-only --quiet origin/main || goto :error
echo.
echo   Actualizado a:
git log -1 --format="     %%h  %%ad  %%s" --date=format:"%%Y-%%m-%%d %%H:%%M"
echo.
echo   Cambios incluidos:
git log --format="     - %%s" %ANTES%..HEAD
echo.
echo   Si el servidor esta abierto, cierra su ventana y vuelve a abrir iniciar.bat.
goto :fin

:cambios
echo.
echo   Hay archivos modificados a mano en esta carpeta y no los voy a pisar:
git status --short
echo   Los cambios se hacen en la carpeta de desarrollo y se suben a GitHub.
echo   Para descartarlos y actualizar igual:  git reset --hard  (y vuelve a abrir este archivo)
goto :fin

:sinred
echo   No pude conectarme a GitHub. Revisa la conexion a internet.
goto :fin

:error
echo   No se pudo actualizar (la version local no coincide con GitHub).
goto :fin

:sinrepo
echo   Esta carpeta no es una copia de GitHub (falta .git).
goto :fin

:singit
echo   No encontre git. Instalalo desde git-scm.com y vuelve a abrir este archivo.

:fin
echo.
pause
