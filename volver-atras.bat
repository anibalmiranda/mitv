@echo off
setlocal
rem ============================================================
rem  Multi YouTube - volver a una version anterior
rem  Si una version nueva falla, regresa a una anterior.
rem  Para volver a la mas nueva, abre actualizar.bat.
rem  Tus listas, favoritos y ajustes no se tocan (viven en el navegador).
rem ============================================================
cd /d "%~dp0"

git --version >nul 2>nul || goto :singit
if not exist ".git" goto :sinrepo
git diff --quiet HEAD -- || goto :cambios

echo.
echo   Ultimas versiones (la primera es la que tienes ahora):
echo.
git log -15 --format="     %%h  %%ad  %%s" --date=format:"%%Y-%%m-%%d %%H:%%M"
echo.
set "VERSION="
set /p "VERSION=  Escribe el codigo de la version (Enter = la anterior a la actual): "
if not defined VERSION set "VERSION=HEAD~1"

git rev-parse --verify --quiet "%VERSION%^{commit}" >nul || goto :noexiste
git reset --hard --quiet "%VERSION%" || goto :error
echo.
echo   Listo, ahora tienes:
git log -1 --format="     %%h  %%ad  %%s" --date=format:"%%Y-%%m-%%d %%H:%%M"
echo.
echo   Si el servidor esta abierto, cierra su ventana y vuelve a abrir iniciar.bat.
echo   Para volver a la version mas nueva, abre actualizar.bat.
goto :fin

:noexiste
echo   No existe una version "%VERSION%". Copia el codigo tal como aparece en la lista.
goto :fin

:cambios
echo.
echo   Hay archivos modificados a mano en esta carpeta y no los voy a pisar:
git status --short
goto :fin

:error
echo   No se pudo cambiar de version.
goto :fin

:sinrepo
echo   Esta carpeta no es una copia de GitHub (falta .git).
goto :fin

:singit
echo   No encontre git. Instalalo desde git-scm.com y vuelve a abrir este archivo.

:fin
echo.
pause
