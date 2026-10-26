// Multi YouTube — fondo.js
// Audio de fondo ("banda sonora"): el audio de UN video elegido (botón 🎵 de su cuadro, uno solo entre todas las
// listas) suena mientras miras la grilla. Con el botón de la barra superior (o la tecla B) activo:
//  - suena solo ese audio, con su propio reproductor oculto (aunque el video no esté en la lista que ves);
//  - los videos de la grilla quedan en silencio, aunque navegues, amplíes otro o corra el carrusel: el que
//    "tiene el audio" sigue marcado (para navegar y para volver), pero no suena (ver comandoYT en reproductor.js);
//  - M / ⏯ silencian la banda sonora, + / − ajustan su volumen (se recuerda) y sigue sonando con la ventana minimizada;
//  - un video normal se repite al terminar.
// Al desactivarlo, vuelve el audio normal en el video que tenías elegido.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const btnFondo = $('btnFondo');
const cajaFondo = $('audioFondo');
let fondoSilenciado = false;   // M / ⏯ con el audio de fondo activo

function esFondo(linea) {
  const k = clave(linea);
  return !!k && !!config.fondoAudio && clave(config.fondoAudio) === k;
}
function nombreFondo() {
  const mem = config.nombres[clave(config.fondoAudio)];
  const item = parsear(config.fondoAudio);
  return (mem && (mem.titulo || mem.autor)) || (item ? nombreInicial(item, 0) : 'el audio de fondo');
}
function volumenFondo() {
  const v = config.volumenes[clave(config.fondoAudio)];
  return typeof v === 'number' ? v : 100;
}

// ---------- Marcar / desmarcar (botón 🎵 de cada cuadro) ----------
function pintarFondoCelda(celda) {
  const si = esFondo(celda.dataset.linea);
  celda.classList.toggle('es-fondo', si);
  const b = celda.querySelector('.fondo');
  if (b) b.title = si ? 'Es tu audio de fondo (clic para quitarlo)' : 'Usar su audio como audio de fondo de toda la grilla (tecla B)';
}
function alternarFondoCelda(celda) {
  const linea = celda.dataset.linea;
  if (!clave(linea)) return;
  if (celda.dataset.tipo === 'rudo') { mostrarMensaje('🎵 Los canales de rudo.video no se pueden usar de audio de fondo'); return; }
  if (esFondo(linea)) {
    config.fondoAudio = '';
    config.fondoActivo = false;
    mostrarMensaje('🎵 Ya no hay audio de fondo');
  } else {
    config.fondoAudio = linea;
    config.fondoActivo = true;   // al elegirlo se activa al tiro
    const tit = celda.querySelector('.titulo');
    mostrarMensaje('🎵 Audio de fondo: ' + (tit ? tit.textContent : 'este video'));
  }
  guardar();
  celdas.forEach(pintarFondoCelda);
  aplicarFondo();
}

// ---------- Activar / desactivar ----------
function alternarFondo() {
  if (!config.fondoAudio) { mostrarMensaje('Primero elige un audio de fondo con la 🎵 de un cuadro'); return; }
  config.fondoActivo = !config.fondoActivo;
  guardar();
  aplicarFondo();
  mostrarMensaje(config.fondoActivo ? '🎵 Audio de fondo: ' + nombreFondo() : '🔊 Vuelve el audio de los videos');
}

function aplicarFondo() {
  const antes = fondoActivo;
  fondoActivo = !!(config.fondoAudio && config.fondoActivo);
  btnFondo.classList.toggle('activo', fondoActivo);
  btnFondo.title = (fondoActivo ? 'Audio de fondo: ' + nombreFondo() + ' (clic para volver al audio de los videos)'
                                : 'Audio de fondo: el audio de un video elegido con 🎵 suena para toda la grilla') + ' (B)';
  if (fondoActivo) {
    if (!antes) anotarAudio(null, true, 'audio de fondo activado: suena "' + nombreFondo() + '" y la grilla queda en silencio');
    fondoSilenciado = false;
    crearReproductorFondo();
    // Silencia la grilla (el elegido sigue marcado para navegar y para volver)
    contenedor.querySelectorAll(SEL_REPRODUCTOR).forEach(f => comandoYT(f, 'mute'));
  } else {
    vaciarFondo();
    if (antes) {
      anotarAudio(null, false, 'audio de fondo desactivado: vuelve el audio de los videos');
      // Vuelve el audio normal en el video que tenía el audio
      const c = celdas.find(x => x.dataset.mute === '0' && puedeSonar(x));
      if (c) {
        const f = c.querySelector(SEL_REPRODUCTOR);
        comandoYT(f, 'unMute');
        comandoYT(f, 'setVolume', [volumenDe(c)]);
        comandoYT(f, 'playVideo');
        c._vol = volumenDe(c);
      }
    }
  }
  celdas.forEach(pintarAudio);
  programarPausaOcultos();
}

// ---------- Reproductor oculto ----------
function crearReproductorFondo() {
  if (cajaFondo.dataset.linea === config.fondoAudio && cajaFondo.querySelector('iframe, video')) {
    const f = cajaFondo.querySelector('iframe, video');
    comandoYT(f, 'unMute'); comandoYT(f, 'setVolume', [volumenFondo()]); comandoYT(f, 'playVideo');
    return;
  }
  vaciarFondo();
  const item = parsear(config.fondoAudio);
  if (!item || item.tipo === 'error' || item.tipo === 'camara' || item.tipo === 'rudo') return;
  if (item.tipo === 'hls') {   // canal de TV o radio por HLS (tv.js)
    const v = videoTvSuelto(item.id, !huboGesto || fondoSilenciado);
    v.volume = volumenFondo() / 100;
    cajaFondo.dataset.linea = config.fondoAudio;
    cajaFondo.appendChild(v);
    return;
  }
  if (item.tipo === 'video' && config.inicioAleatorio && !item.inicio) {
    const mem = config.duraciones[item.id];
    if (mem && !mem.vivo) item.inicioAzar = segundoAleatorio(mem.d);
  }
  let url = urlEmbed(item, !huboGesto, true);   // sin un clic previo el navegador no deja partir con sonido
  if (item.tipo === 'video') url += '&loop=1&playlist=' + encodeURIComponent(item.id);   // se repite al terminar
  const f = document.createElement('iframe');
  f.src = url;
  f.allow = 'autoplay; encrypted-media';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.title = 'Audio de fondo';
  // Volumen guardado (y sonido, si ya hubo clic) apenas el reproductor está listo
  f.addEventListener('load', () => [500, 1500, 3500].forEach(ms => setTimeout(() => {
    if (!fondoActivo || f.parentElement !== cajaFondo) return;
    comandoYT(f, 'setVolume', [volumenFondo()]);
    if (huboGesto && !fondoSilenciado) { comandoYT(f, 'unMute'); comandoYT(f, 'playVideo'); }
  }, ms)));
  cajaFondo.dataset.linea = config.fondoAudio;
  cajaFondo.appendChild(f);
}
function vaciarFondo() {
  cajaFondo.querySelectorAll('iframe, video').forEach(f => { if (f._hls) f._hls.destroy(); f.remove(); });
  delete cajaFondo.dataset.linea;
}
// Al abrir la página con el audio de fondo activo, el navegador no deja sonar hasta el primer clic o tecla
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
  const f = cajaFondo.querySelector('iframe, video');
  if (!fondoActivo || fondoSilenciado || !f) return;
  comandoYT(f, 'unMute'); comandoYT(f, 'setVolume', [volumenFondo()]); comandoYT(f, 'playVideo');
}, { capture: true, once: true }));

// ---------- M / ⏯ y + / − con el audio de fondo activo ----------
function alternarSilencioFondo() {
  const f = cajaFondo.querySelector('iframe, video');
  fondoSilenciado = !fondoSilenciado;
  if (f) comandoYT(f, fondoSilenciado ? 'mute' : 'unMute');
  if (f && !fondoSilenciado) comandoYT(f, 'setVolume', [volumenFondo()]);
  mostrarMensaje(fondoSilenciado ? '🔇 Audio de fondo en silencio' : '🎵 Audio de fondo: ' + nombreFondo());
}
function cambiarVolumenFondo(paso) {
  const k = clave(config.fondoAudio);
  const v = Math.min(100, Math.max(VOLUMEN_MIN, Math.round((volumenFondo() + paso) / 5) * 5));
  if (v === 100) delete config.volumenes[k]; else config.volumenes[k] = v;
  guardar();
  const f = cajaFondo.querySelector('iframe, video');
  if (f && !fondoSilenciado) comandoYT(f, 'setVolume', [v]);
  mostrarMensaje('🎵 Volumen del audio de fondo: ' + v + '%');
}

// Si la URL del audio de fondo se reemplaza (a mano o porque el directo cambió), se pone al día
function fondoReemplazado(vieja, nueva) {
  if (!config.fondoAudio || clave(config.fondoAudio) !== clave(vieja)) return;
  config.fondoAudio = nueva;
  if (fondoActivo) crearReproductorFondo();
}

btnFondo.addEventListener('click', alternarFondo);
