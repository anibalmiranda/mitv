# Ideas a implementar

Ideas conversadas para Multi YouTube que quedaron pendientes. Cuando se implemente una, se borra de aquí
(el detalle de lo hecho queda en el historial de git).

## Publicar Mitv para amigos (GitHub Pages)

El repositorio `anibalmiranda/mitv` es público: GitHub Pages lo puede publicar gratis en
`https://anibalmiranda.github.io/mitv/`.

- **Activarlo** (lo hace el dueño de la cuenta, 1 minuto): en GitHub, *Settings → Pages → Deploy from a branch →
  rama `main`, carpeta `/ (root)` → Save*.
- **Antes de activarlo, preparar:**
  - Una **lista de ejemplo** para que quien abra la página por primera vez no parta con la grilla vacía.
  - Un **aviso discreto en la versión web** que explique qué funciones requieren descargar Mitv y abrir `iniciar.bat`.
- **Funciona en la versión web:** grilla de YouTube, audio exclusivo y fundidos, volumen por video, listas,
  favoritos, super favorito, audio de fondo, carrusel, tira, atajos, cuenta atrás, visualizador, modo liviano,
  ahorro, exportar/importar configuración.
- **No funciona sin `servidor.py`:** canales por `@nombre`, búsqueda automática de directos, copia de datos en
  archivo, teclas multimedia, aviso de lectura de YouTube. Las cámaras `http://` las bloquea el navegador en
  una página `https://`.
- Cada visitante tiene sus propias listas (en su navegador). Para compartir las tuyas: ⚙ → Exportar configuración
  y que ellos usen Importar.
- Quien quiera todo puede descargar el proyecto (*Code → Download ZIP*) y abrir `iniciar.bat` (necesita Python).

## Otras fuentes en vivo

- **Twitch y Kick:** tienen reproductores incrustables oficiales.
- (Descartado: ipcamlive.)

## Recomendaciones pendientes

- **Nivelación automática del volumen** usando "Mezcla estéreo" con el visualizador encendido (complementa el
  volumen por video).
- **Iniciar con Windows:** acceso directo en la carpeta de Inicio que abra `iniciar.bat` minimizado.

## Limpieza

- Borrar `C:\Proyectos\Personal\Despliegues\Mitv_respaldo_2026-10-22` (copia antigua, ya no se usa). Antes,
  revisar qué carpeta sirve IIS si se sigue usando.
