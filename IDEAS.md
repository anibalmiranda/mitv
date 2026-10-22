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

## Canales de TV por HLS y listas M3U (como `tv.m3u8` de TDTChannels)

- Reproducir streams `.m3u8` con hls.js (incluida en el proyecto), integrados con todo lo existente (audio
  exclusivo, volumen, modo liviano, super favorito, audio de fondo, panel de estado) y probando la dirección de
  respaldo si un canal se cae. Los que no permiten lectura directa del navegador (CORS), a través de `servidor.py`.
- Importar listas M3U desde el ⚙: elegir grupos y crear una lista de Mitv por grupo, con nombre y logo de cada canal.
- **Sub-categorías:** la lista importada queda como un grupo en el selector (`<optgroup>`), con sus categorías
  (`group-title`) como sub-listas. Por dentro el nombre es "TV España / Generalistas", así que respaldos, archivo de
  datos y sincronización no cambian. Las listas propias también podrían agruparse igual ("Noticias / Chile").
  El M3U trae un solo nivel; reunir "Int. América / Europa / Asia…" en "Internacional" sería opcional (interpretando nombres).
- **Filtrar al importar** (lo revisa `servidor.py`, varios a la vez, con barra de progreso; ~1–2 min para 571):
  - ✔ funcionan · 🌍 bloqueados por país (403) · 🔒 requieren autorización (401) o tienen DRM (`#EXT-X-KEY` cifrado) ·
    ✘ no existen / no responden (404, sin servidor) · ⚠ URLs con marcadores de publicidad sin rellenar (`[DEVICE_ID]`, `[IP]`…).
  - Revisar en profundidad: lista maestra → primera calidad → primer fragmento (hay canales que entregan la lista a
    cualquiera y bloquean recién el video, como "Teledeporte GEO").
  - Resumen antes de crear las listas, con incluir/descartar por tipo (por defecto solo los que funcionan).
  - Duplicados del mismo canal: queda la primera dirección que funciona; las otras, como respaldo automático.
  - Lo descartado queda anotado, con "Revisar de nuevo" (hay canales que vuelven). Sin servidor se importa sin filtro.
- La lista oficial está en `https://www.tdtchannels.com/lists/tv.m3u8` (proyecto `github.com/LaQuay/TDTChannels`,
  licencia Apache 2.0, actualizado a diario). Prueba del 2026-10-22: 26 de 30 canales responden desde Chile;
  los "GEO" solo funcionan desde España.
- `tv.m3u8` no se sube a este repositorio (son datos; agregarlo a `.gitignore`).

## Botón "🧹 Comprobar lista" (para cualquier lista, en cualquier momento)

- En el panel de estado (`E`): revisa todas las líneas de la lista que estás viendo (aunque estén dormidas).
  - YouTube: que el video exista y que su dueño permita verlo fuera de YouTube (detectar antes los 101/150).
  - Directos terminados: primero buscar el directo actual del canal; solo si no hay, cuenta como caído.
  - HLS (cuando exista): revisión profunda hasta el primer fragmento. Cámaras: que entreguen imagen.
- Muestra un resumen ("38 funcionan · 4 no existen · 2 bloqueados…") y el botón "Quitar los que no funcionan".
- No se borran: quedan **comentadas en la misma lista** con motivo y fecha
  (`# ✘ 2026-10-22 no existe (404) · https://…`); Mitv ya ignora las líneas con `#` y siguen visibles en el ⚙.
- "↺ Revisar los descartados": vuelve a probar las líneas comentadas y restaura las que funcionan de nuevo.
- Usa la misma revisión que el filtro al importar M3U (en `servidor.py`).

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
