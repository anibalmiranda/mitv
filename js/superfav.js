// Multi YouTube — superfav.js
// Super favorito: UN solo video entre todas las listas (se marca con 👑 en su cuadro; marcar otro reemplaza al
// anterior). El botón de la barra superior (o la tecla S) lo muestra u oculta en una ventanita "imagen en imagen"
// en la esquina inferior izquierda, siempre sin audio. Tiene su propio reproductor: sigue a la vista aunque cambies
// de lista, amplíes otro video o pases a pantalla completa. Con la ventana minimizada se pausa (no gasta conexión).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const btnSuperFav = $('btnSuperFav');
const ventanaSuper = $('superFav');

function esSuperFav(linea) {
  const k = clave(linea);
  return !!k && !!config.superFav && clave(config.superFav) === k;
}

// ---------- Marcar / desmarcar (botón 👑 de cada cuadro) ----------
function pintarSuperFavCelda(celda) {
  const si = esSuperFav(celda.dataset.linea);
  celda.classList.toggle('es-superfav', si);
  const b = celda.querySelector('.superfav');
  if (b) b.title = si ? 'Es tu super favorito (clic para quitarlo)' : 'Marcar como super favorito (miniatura en la esquina, tecla S)';
}
function alternarSuperFav(celda) {
  const linea = celda.dataset.linea;
  if (!clave(linea)) return;
  if (esSuperFav(linea)) {
    config.superFav = '';
    config.superFavVisible = false;
    mostrarMensaje('👑 Ya no hay super favorito');
  } else {
    config.superFav = linea;
    config.superFavVisible = true;   // al marcarlo se muestra al tiro
    const tit = celda.querySelector('.titulo');
    mostrarMensaje('👑 Super favorito: ' + (tit ? tit.textContent : 'este video'));
  }
  guardar();
  celdas.forEach(pintarSuperFavCelda);
  mostrarSuperFav();
}

// ---------- Ventanita en la esquina ----------
function mostrarSuperFav() {
  const visible = !!(config.superFav && config.superFavVisible);
  btnSuperFav.classList.toggle('activo', visible);
  btnSuperFav.title = (visible ? 'Ocultar el super favorito' : 'Mostrar el super favorito en la esquina') + ' (S)';
  if (!visible) { ventanaSuper.classList.remove('visible'); vaciarSuperFav(); return; }
  // Si ya muestra este mismo video, no se recarga
  if (ventanaSuper.dataset.linea === config.superFav && ventanaSuper.querySelector('iframe, img')) {
    ventanaSuper.classList.add('visible');
    return;
  }
  vaciarSuperFav();
  const item = parsear(config.superFav);
  if (!item || item.tipo === 'error') return;
  ventanaSuper.dataset.linea = config.superFav;
  let medio;
  if (item.tipo === 'camara') {
    medio = document.createElement('img');
    medio.referrerPolicy = 'no-referrer';
    medio.src = item.id;
  } else {
    // Video normal con duración conocida: parte en un punto al azar, como en la grilla
    if (item.tipo === 'video' && config.inicioAleatorio && !item.inicio) {
      const mem = config.duraciones[item.id];
      if (mem && !mem.vivo) item.inicioAzar = segundoAleatorio(mem.d);
    }
    medio = document.createElement('iframe');
    medio.src = urlEmbed(item, true, true);   // siempre silenciado
    medio.allow = 'autoplay; encrypted-media; picture-in-picture';
    medio.referrerPolicy = 'strict-origin-when-cross-origin';
    medio.title = 'Super favorito';
  }
  ventanaSuper.insertBefore(medio, ventanaSuper.firstChild);
  ventanaSuper.classList.add('visible');
}
function vaciarSuperFav() {
  ventanaSuper.querySelectorAll('iframe, img').forEach(m => m.remove());
  delete ventanaSuper.dataset.linea;
}
function alternarVentanaSuperFav() {
  if (!config.superFav) { mostrarMensaje('Primero marca un super favorito con la 👑 de un cuadro'); return; }
  config.superFavVisible = !config.superFavVisible;
  guardar();
  mostrarSuperFav();
}
// Si la URL del super favorito se reemplaza (a mano o porque el directo cambió), la ventanita se pone al día
function superFavReemplazado(vieja, nueva) {
  if (!config.superFav || clave(config.superFav) !== clave(vieja)) return;
  config.superFav = nueva;
  mostrarSuperFav();
}

btnSuperFav.addEventListener('click', alternarVentanaSuperFav);
$('cerrarSuperFav').addEventListener('click', e => { e.stopPropagation(); if (config.superFavVisible) alternarVentanaSuperFav(); });
// Con la ventana minimizada o en otra pestaña, se pausa; al volver, sigue
document.addEventListener('visibilitychange', () => {
  const f = ventanaSuper.querySelector('iframe');
  if (f) comandoYT(f, document.hidden ? 'pauseVideo' : 'playVideo');
});
