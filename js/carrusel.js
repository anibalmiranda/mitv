// Multi YouTube — carrusel.js
// Carrusel: recorre solo los videos de la lista elegida cada N segundos (pantalla completa).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Carrusel (pantalla completa) ----------
// Recorre todos los videos de la lista elegida (nunca los favoritos: si estás viendo favoritos, vuelve a la lista)
// y avanza solo al siguiente cada N segundos (con los fundidos de imagen y audio). Si cambias de lista o de vista, se detiene.
let carrusel = null;   // { timer, previo, vista }
function pintarCarrusel() {
  const on = !!carrusel;
  $('btnCarrusel').classList.toggle('activo', on);
  $('btnCarrusel').title = (on ? 'Detener carrusel' : 'Carrusel: recorre los videos de la lista "' + config.actual + '" (cada ' + config.carruselSeg + ' s)') + ' (C)';
  document.body.classList.toggle('carrusel-activo', on);
}
function animarBarraCarrusel(ms) {
  const b = $('barraCarrusel');
  b.style.transition = 'none';
  b.style.width = '0';
  void b.offsetWidth;
  b.style.transition = 'width ' + ms + 'ms linear';
  b.style.width = '100%';
}
// Salta a un punto al azar (solo videos que no son en vivo y cuya duración ya se conoce)
function saltoAleatorio(celda) {
  if (!config.inicioAleatorio || !celda || celda.dataset.inicio) return;
  if (celda.dataset.tipo === 'canal' || celda.classList.contains('en-vivo')) return;
  // Duración: la del video actual o, si no, la memorizada
  const mem = celda._videoActual && config.duraciones[celda._videoActual];
  const dur = celda._dur || (mem && !mem.vivo ? mem.d : 0);
  const seg = segundoAleatorio(dur);   // entre 10 s y duración − 10 s
  if (seg) comandoYT(celda.querySelector('iframe'), 'seekTo', [seg, true]);
}
function siguienteDelCarrusel() {
  const lista = validas();
  if (!lista.length) return null;
  const i = indiceActual(lista);
  return lista[(i + 1) % lista.length];
}
function programarCarrusel() {
  if (!carrusel) return;
  clearTimeout(carrusel.timer);
  clearTimeout(carrusel.previo);
  const ms = Math.max(5, Number(config.carruselSeg) || 30) * 1000;
  animarBarraCarrusel(ms);
  // 3 s antes del cambio, el próximo video salta a un punto al azar (así ya cargó cuando aparece)
  carrusel.previo = setTimeout(() => saltoAleatorio(siguienteDelCarrusel()), Math.max(0, ms - 3000));
  carrusel.timer = setTimeout(() => {
    if (!validas().length) { detenerCarrusel(); return; }
    navegar(1, true);
    programarCarrusel();
  }, ms);
}
function reiniciarCarrusel() { if (carrusel) programarCarrusel(); }
function iniciarCarrusel() {
  if (config.vistaFav) {
    config.vistaFav = false;
    guardar();
    render(true);
    pintarSelector();
  }
  const lista = validas();
  if (!lista.length) { mostrarMensaje('La lista "' + config.actual + '" no tiene videos para el carrusel'); return; }
  const i = indiceActual(lista);
  const yaAmpliado = !!contenedor.querySelector('.celda.max');
  if (i === -1 || (!config.modoAudio && !yaAmpliado)) irA(lista[i === -1 ? 0 : i]);
  carrusel = { vista: vistaId() };
  pintarCarrusel();
  programarCarrusel();
  mostrarMensaje('▶ Carrusel de "' + config.actual + '" (' + lista.length + ' videos): cambia cada ' + config.carruselSeg + ' s');
}
function detenerCarrusel() {
  if (!carrusel) return;
  clearTimeout(carrusel.timer);
  clearTimeout(carrusel.previo);
  carrusel = null;
  pintarCarrusel();
  if (document.fullscreenElement) mostrarMensaje('⏹ Carrusel detenido');
}
$('btnCarrusel').addEventListener('click', () => { if (carrusel) detenerCarrusel(); else iniciarCarrusel(); });
