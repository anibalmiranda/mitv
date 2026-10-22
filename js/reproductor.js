// Multi YouTube — reproductor.js
// Comunicación con YouTube: estado, títulos, retomar el último, siguiente al terminar, directo, inicio aleatorio, playlists.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Comunicación con el reproductor de YouTube (postMessage) ----------
function comandoYT(iframe, func, args) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*');
}
// Le pide al reproductor que informe título, autor y estado
function escucharYT(iframe, idx) {
  const enviar = () => {
    if (iframe.contentWindow)
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: idx, channel: 'widget' }), '*');
  };
  enviar();
  setTimeout(enviar, 1000);
  setTimeout(enviar, 3000);
}
window.addEventListener('message', e => {
  let host = '';
  try { host = new URL(e.origin).hostname; } catch (err) { return; }
  if (!/youtube(-nocookie)?\.com$/.test(host)) return;
  let d;
  try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
  if (!d) return;
  const ifr = [...contenedor.querySelectorAll('iframe')].find(f => f.contentWindow === e.source);
  if (!ifr) return;
  const celda = ifr.parentElement;
  // Error del reproductor: video borrado, privado, no incrustable o directo que ya no existe
  if (d.event === 'onError') { marcarCaido(celda, d.info); return; }
  if (!d.info || typeof d.info !== 'object') return;
  // Primer mensaje = reproductor listo: re-aplica el audio por si la orden llegó antes de que cargara
  if (!celda._listo) {
    celda._listo = true;
    if (celda.dataset.mute === '0') {
      comandoYT(ifr, 'unMute');
      comandoYT(ifr, 'setVolume', [celda._vol == null ? volumenDe(celda) : celda._vol]);
      comandoYT(ifr, 'playVideo');
    }
    if (celda.classList.contains('max')) pedirMaxCalidad(celda);
  }
  if (d.info.videoData) {
    const vd = d.info.videoData;
    if (vd.title) {
      celda.querySelector('.titulo').textContent = vd.title;
      if (celda === celdaPendiente) mostrarAvisoRetomar();
    }
    if (vd.author) celda.querySelector('.autor').textContent = vd.author;
    // Se memoriza el nombre para mostrarlo aunque el video deje de existir y para "Buscar parecido"
    if (vd.title || vd.author) {
      const vivo = typeof vd.isLive === 'boolean' ? vd.isLive : celda.classList.contains('en-vivo');
      recordarNombre(clave(celda.dataset.linea), vd.title, vd.author, vivo);
    }
    if (vd.video_id && vd.video_id !== celda._videoActual) {
      // Cambió el video (playlist que avanzó o salto al azar): se reinicia lo que dependía del video anterior
      celda._videoActual = vd.video_id;
      celda._dur = null;
      celda._durVista = null;
      celda._durNueva = null;
      celda._durNuevaVista = null;
      // Canales en vivo y playlists informan su video actual: con eso hay miniatura para la tira
      if (celda.dataset.tipo !== 'video' || !celda.dataset.thumb)
        celda.dataset.thumb = 'https://i.ytimg.com/vi/' + vd.video_id + '/mqdefault.jpg';
    }
  }
  detectarVivo(celda, d.info);
  vigilarDirecto(celda, d.info);
  intentarPlaylistAleatoria(celda, ifr, d.info);
  intentarInicioAleatorio(celda, ifr, d.info);
  // Vigilante: si un video que debería estar silenciado informa que está sonando, se vuelve a silenciar
  if (celda.dataset.mute === '1' && !celda._rampa && d.info.muted === false) {
    comandoYT(ifr, 'setVolume', [0]);
    comandoYT(ifr, 'mute');
  }
  if (typeof d.info.playerState === 'number') {
    // 0 = terminado, 2 = pausado, 5 = sin iniciar → barras quietas
    celda.classList.toggle('pausado', [0, 2, 5].includes(d.info.playerState));
    if (d.info.playerState === 1 && celda.classList.contains('caido')) quitarCaido(celda);   // volvió a funcionar
    // En modo solo audio, si uno silenciado empieza a reproducir, se pausa
    // (salvo que esté en pleno fundido de salida)
    if (((config.modoAudio && celda.dataset.mute === '1') || celda._pausadaFS) && !celda._rampa && !celda.dataset.pendiente && (d.info.playerState === 1 || d.info.playerState === 3))
      comandoYT(ifr, 'pauseVideo');
    // Playlist o Mix que terminó un video y se quedó parado: se le pide el siguiente
    // (si es el último de la lista, vuelve a empezar por uno al azar)
    if (d.info.playerState === 0 && celda.dataset.tipo === 'lista' && celda._estadoPrevio !== 0) {
      const total = Array.isArray(celda._playlist) ? celda._playlist.length : 0;
      setTimeout(() => {
        if (celda._estado !== 0) return;   // ya avanzó solo
        if (total > 1 && celda._playlistIndex >= total - 1) comandoYT(ifr, 'playVideoAt', [Math.floor(Math.random() * total)]);
        else comandoYT(ifr, 'nextVideo');
      }, 1500);
    }
    // Video normal (no playlist, no en vivo) que terminó
    if (d.info.playerState === 0 && celda.dataset.tipo === 'video' && celda._estadoPrevio !== 0 &&
        !celda.classList.contains('en-vivo')) {
      videoTerminado(celda);
    }
    // Directo que terminó: quizás el canal ya transmite con otra URL
    if (d.info.playerState === 0 && celda.dataset.tipo === 'video' && celda._estadoPrevio !== 0 &&
        celda.classList.contains('en-vivo')) {
      revisarDirecto(celda);
    }
    celda._estadoPrevio = d.info.playerState;
  }
  if (Array.isArray(d.info.playlist)) celda._playlist = d.info.playlist;
  if (typeof d.info.playlistIndex === 'number') celda._playlistIndex = d.info.playlistIndex;
});

// ---------- Retomar el último seleccionado al cargar / recargar ----------
// Se recuerda por vista (cada lista y favoritos tienen el suyo): qué video tenía el audio y si estaba ampliado.
// El navegador no deja partir con sonido sin una interacción, así que el video arranca silenciado
// y recibe el audio con el primer clic o tecla en cualquier parte de la página.
function vistaId() { return config.vistaFav ? 'fav' : 'lista:' + config.actual; }
function guardarUltimo(celda) {
  const k = clave(celda.dataset.linea);
  if (!k) return;
  config.ultimos[vistaId()] = { clave: k, max: celda.classList.contains('max') };
  guardar();
}
function olvidarUltimo() {
  delete config.ultimos[vistaId()];
  guardar();
}
function actualizarUltimoMax() {
  const u = config.ultimos[vistaId()];
  if (!u) return;
  const c = celdas.find(x => clave(x.dataset.linea) === u.clave);
  if (!c) return;
  u.max = c.classList.contains('max');
  guardar();
}

let celdaPendiente = null;
let huboGesto = false;   // tras la primera interacción, el navegador ya deja activar el sonido
function prepararRetomar(celda, ult) {
  if (ult.max && !config.modoAudio) alternarMax(celda);
  if (huboGesto) {        // p. ej. al cambiar de lista: retoma directo, sin aviso
    delete celda.dataset.pendiente;
    if (celda.dataset.mute === '1') alternarAudio(celda);   // reutilizado al cambiar de lista: quizás ya suena
    return;
  }
  celdaPendiente = celda;
  mostrarAvisoRetomar();
}
function mostrarAvisoRetomar() {
  if (!celdaPendiente) return;
  const tit = celdaPendiente.querySelector('.titulo');
  $('avisoRetomar').textContent = '🔊 Clic en cualquier parte para seguir escuchando: ' + (tit ? tit.textContent : 'el último video');
  $('avisoRetomar').classList.add('visible');
}
function ocultarAvisoRetomar() {
  celdaPendiente = null;
  $('avisoRetomar').classList.remove('visible');
}
function retomarAudio(e) {
  huboGesto = true;
  // El navegador deja el analizador de audio en pausa hasta la primera interacción
  if (visual && visual.actx.state === 'suspended') visual.actx.resume().catch(() => {});
  if (!celdaPendiente) return;
  const c = celdaPendiente;
  ocultarAvisoRetomar();
  delete c.dataset.pendiente;
  // Si el clic fue sobre un video, su propio manejador decide (le da el audio a ese)
  if (e && e.target && e.target.closest && e.target.closest('.capa-audio')) return;
  if (!c.isConnected) return;
  if (c.dataset.mute === '1') alternarAudio(c);
}
// Primer gesto del usuario (en fase de captura, antes que cualquier otro manejador)
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, retomarAudio, true));

// ---------- Al terminar un video: pasar al siguiente ----------
// - Si el que terminó tenía el audio: el audio (y la ampliación, si estaba ampliado) pasa al siguiente de la
//   lista, con los fundidos de siempre. Después de la última vuelve a la primera.
// - El que terminó (o uno silenciado que terminó) vuelve a partir en un punto al azar, para que la grilla
//   no quede llena de pantallas de "fin de video". En modo solo audio, los silenciados quedan pausados.
function reiniciarVideo(celda) {
  const ifr = celda.querySelector('iframe');
  if (!ifr) return;
  const mem = celda._videoActual && config.duraciones[celda._videoActual];
  const dur = celda._dur || (mem && !mem.vivo ? mem.d : 0);
  const seg = config.inicioAleatorio ? segundoAleatorio(dur) : 0;
  comandoYT(ifr, 'seekTo', [seg, true]);
  if ((config.modoAudio && celda.dataset.mute === '1') || celda._pausadaFS) comandoYT(ifr, 'pauseVideo');
  else comandoYT(ifr, 'playVideo');
}
function videoTerminado(celda) {
  if (!config.alTerminarSiguiente) return;
  const lista = celdas.filter(c => c === celda || puedeSonar(c));   // se saltan cámaras y bloqueados
  const tieneAudio = celda.dataset.mute === '0';
  if (tieneAudio && lista.length > 1) {
    const sig = lista[(lista.indexOf(celda) + 1) % lista.length];
    if (celda.classList.contains('max') && !config.modoAudio) cambiarAmpliado(sig);
    alternarAudio(sig);
    reiniciarCarrusel();
    const tit = sig.querySelector('.titulo');
    mostrarMensaje('⏭ Siguiente: ' + (tit ? tit.textContent : 'video'));
    // Se reinicia cuando terminó de bajar el volumen, para que no se escuche partir de nuevo
    const espera = Math.max(0, Number(config.fade) || 0) * 1000 + 400;
    setTimeout(() => reiniciarVideo(celda), espera);
  } else {
    reiniciarVideo(celda);   // uno solo en la lista, o silenciado: vuelve a partir
  }
}

// ---------- Detección de directo ----------
// 1) videoData.isLive del reproductor (lo más confiable, aunque no está documentado)
// 2) respaldo: la duración es 0 mientras reproduce, o va creciendo → directo; fija varias veces → no
function fijarVivo(celda, vivo) {
  if (celda.classList.contains('en-vivo') === vivo) return;
  celda.classList.toggle('en-vivo', vivo);
  if (document.body.classList.contains('tira-abierta')) armarTira();
}
function detectarVivo(celda, info) {
  if (typeof info.playerState === 'number') celda._estado = info.playerState;
  if (info.videoData && typeof info.videoData.isLive === 'boolean') {
    celda._vivoSeguro = true;
    fijarVivo(celda, info.videoData.isLive);
    return;
  }
  if (celda._vivoSeguro || typeof info.duration !== 'number') return;
  const dur = info.duration;
  if (dur === 0) {
    if (celda._estado === 1) fijarVivo(celda, true);
  } else if (celda._durPrev != null) {
    if (dur > celda._durPrev + 0.5) { celda._durIgual = 0; fijarVivo(celda, true); }
    else if (Math.abs(dur - celda._durPrev) < 0.01) {
      celda._durIgual = (celda._durIgual || 0) + 1;
      if (celda._durIgual >= 3) fijarVivo(celda, false);
    }
  }
  celda._durPrev = dur;
}

// ---------- Inicio aleatorio (solo videos que NO son en vivo) ----------
// Una vez por carga: apenas se sabe la duración y que no es directo, salta a un punto al azar
// entre el 5% y el 85% del video. Si la URL trae un tiempo (?t=), se respeta y no se salta.
// ---------- Playlists: parten en un video al azar y siguen en modo aleatorio ----------
// Al cargar, el reproductor informa la lista de videos; se elige uno al azar (playVideoAt) y se activa el
// modo aleatorio de YouTube (setShuffle) para que lo que venga después también salga mezclado.
// Usa la misma casilla "Inicio aleatorio" del ⚙.
function intentarPlaylistAleatoria(celda, ifr, info) {
  if (celda.dataset.tipo !== 'lista' || celda._listaHecha) return;
  if (!config.inicioAleatorio) { celda._listaHecha = true; return; }
  if (!Array.isArray(info.playlist) || !info.playlist.length) return;
  celda._listaHecha = true;
  const n = info.playlist.length;
  comandoYT(ifr, 'setShuffle', [true]);
  if (n > 1) {
    const i = Math.floor(Math.random() * n);
    celda._esperaVideo = info.playlist[i];   // el salto dentro del video espera a que cargue este
    celda._saltoHecho = false;
    comandoYT(ifr, 'playVideoAt', [i]);
  }
}

// Memoriza la duración del video que está sonando en el cuadro (y si es directo), para la próxima carga
function aprenderDuracion(celda, info) {
  const id = celda._videoActual;
  if (!id || celda._durAprendida === id) return;
  const vivoConocido = info.videoData && typeof info.videoData.isLive === 'boolean';
  if (vivoConocido && info.videoData.isLive) { celda._durAprendida = id; recordarDuracion(id, 0, true); return; }
  if (typeof info.duration === 'number' && info.duration > 0) {
    celda._durNueva = info.duration;
    if (!celda._durNuevaVista) celda._durNuevaVista = Date.now();
  }
  if (!celda._durNueva) return;
  const noEsVivo = (vivoConocido && !info.videoData.isLive) ||
                   (!celda.classList.contains('en-vivo') && Date.now() - celda._durNuevaVista >= 3000);
  if (!noEsVivo) return;
  celda._durAprendida = id;
  recordarDuracion(id, celda._durNueva, false);
}

function intentarInicioAleatorio(celda, ifr, info) {
  aprenderDuracion(celda, info);
  if (!config.inicioAleatorio || celda._saltoHecho || celda.dataset.inicio) return;
  if (celda.dataset.tipo === 'canal') { celda._saltoHecho = true; return; }
  // Playlist: primero se elige el video al azar; el salto de tiempo se hace ya en ese video
  if (celda.dataset.tipo === 'lista') {
    if (!celda._listaHecha) return;
    if (celda._esperaVideo && celda._videoActual !== celda._esperaVideo) return;
  }
  if (typeof info.duration === 'number' && info.duration > 0) {
    celda._dur = info.duration;
    if (!celda._durVista) celda._durVista = Date.now();
  }
  if (!celda._dur) return;
  const vivoConocido = info.videoData && typeof info.videoData.isLive === 'boolean';
  if (vivoConocido && info.videoData.isLive) { celda._saltoHecho = true; return; }
  // Sin el dato isLive, espera 3 s de duración estable para descartar que sea directo
  const noEsVivo = (vivoConocido && !info.videoData.isLive) ||
                   (!celda.classList.contains('en-vivo') && Date.now() - celda._durVista >= 3000);
  if (!noEsVivo) return;
  if (celda.classList.contains('en-vivo')) { celda._saltoHecho = true; return; }
  celda._saltoHecho = true;
  const seg = segundoAleatorio(celda._dur);   // entre 10 s y duración − 10 s
  if (seg) comandoYT(ifr, 'seekTo', [seg, true]);
}
