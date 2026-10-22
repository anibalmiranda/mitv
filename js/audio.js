// Multi YouTube — audio.js
// Audio exclusivo, fundidos de audio y modo solo audio.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Audio exclusivo ----------
function pintarAudio(celda) {
  const silenciado = celda.dataset.mute !== '0';   // los cuadros con error no tienen dataset.mute: nunca "suenan"
  celda.classList.toggle('con-audio', !silenciado);
  const ico = celda.querySelector('.icono-audio');
  if (ico) ico.textContent = silenciado ? '🔇' : '🔊';
  const est = celda.querySelector('.fila-audio .estado');
  if (est && celda.dataset.tipo === 'camara') { est.textContent = '📷 cámara (sin audio)'; return; }
  if (est) est.textContent = silenciado ? (config.modoAudio ? '⏸ clic para escuchar' : '🔇 clic para escuchar') : '🔊 sonando';
}
// Rampa de volumen (pasos cada 100 ms) para el fundido entre audios
function detenerRampa(celda) {
  if (celda._rampa) { clearInterval(celda._rampa); celda._rampa = null; }
}
function rampa(celda, desde, hasta, ms, alTerminar) {
  const ifr = celda.querySelector('iframe');
  detenerRampa(celda);
  const pasos = Math.max(1, Math.round(ms / 100));
  let i = 0;
  celda._vol = desde;
  comandoYT(ifr, 'setVolume', [desde]);
  celda._rampa = setInterval(() => {
    i++;
    const v = Math.round(desde + (hasta - desde) * i / pasos);
    celda._vol = v;
    comandoYT(ifr, 'setVolume', [v]);
    if (i >= pasos) {
      detenerRampa(celda);
      if (alTerminar) alTerminar();
    }
  }, 100);
}

// fadeMs > 0: el que se silencia baja de a poco y el que entra sube de a poco
function fijarAudio(celda, silenciar, fadeMs) {
  const ifr = celda.querySelector('iframe');
  if (!ifr) return;
  fadeMs = fadeMs || 0;
  if (silenciar) {
    const fin = () => {
      if (celda.dataset.mute !== '1') return;              // lo reactivaron durante el fundido
      // Ojo: NO subir el volumen aquí. En el reproductor de YouTube, setVolume() quita el silencio,
      // y el video anterior volvía a sonar fuerte. Se deja en 0 y silenciado; al reactivarlo se sube.
      comandoYT(ifr, 'setVolume', [0]);
      comandoYT(ifr, 'mute');
      if (config.modoAudio) comandoYT(ifr, 'pauseVideo');  // en solo audio, el que no suena se pausa
      celda._vol = 0;
      // Refuerzo por si alguna orden se perdió en el camino
      setTimeout(() => { if (celda.dataset.mute === '1' && !celda._rampa) comandoYT(ifr, 'mute'); }, 400);
    };
    if (fadeMs > 0) rampa(celda, celda._vol == null ? volumenDe(celda) : celda._vol, 0, fadeMs, fin);
    else { detenerRampa(celda); fin(); }
    celda.dataset.mute = '1';
  } else {
    // Si venía bajando (fundido de salida a medias), sube desde donde iba
    const desde = celda._rampa ? (celda._vol || 0) : 0;
    detenerRampa(celda);
    celda.dataset.mute = '0';
    delete celda.dataset.pendiente;
    olvidarSilencioGeneral();   // volvió a sonar algo: el botón de silenciar todo vuelve a su estado normal
    // El audio fue a otro: el que esperaba retomarse ya no lo recibirá (ni conserva su prioridad de carga)
    if (celdaPendiente && celdaPendiente !== celda) { delete celdaPendiente.dataset.pendiente; ocultarAvisoRetomar(); }
    guardarUltimo(celda);
    cargarYa(celda);             // si aún esperaba su turno en la carga escalonada, se carga ahora
    programarPausaOcultos();     // con la ventana oculta, el que recibe el audio es el que debe seguir corriendo
    const vol = volumenDe(celda);   // el volumen guardado para este video (100 si nunca se ajustó)
    if (fadeMs > 0) {
      comandoYT(ifr, 'setVolume', [desde]);
      comandoYT(ifr, 'unMute');
      comandoYT(ifr, 'playVideo');
      rampa(celda, desde, vol, fadeMs);
    } else {
      comandoYT(ifr, 'unMute');
      comandoYT(ifr, 'setVolume', [vol]);
      comandoYT(ifr, 'playVideo');
      celda._vol = vol;
    }
  }
  pintarAudio(celda);
}
function alternarAudio(celda) {
  if (celda.dataset.tipo === 'camara') return;   // sin audio: el que sonaba sigue sonando
  if (celda.dataset.mute === '1') {
    const ms = Math.max(0, Number(config.fade) || 0) * 1000;
    // El fundido se aplica solo al pasar el audio de un video a otro
    const habiaOtro = celdas.some(o => o !== celda && o.dataset.mute === '0');
    celdas.forEach(otra => { if (otra !== celda && otra.dataset.mute === '0') fijarAudio(otra, true, ms); });
    fijarAudio(celda, false, habiaOtro ? ms : 0);
  } else {
    fijarAudio(celda, true);
    olvidarUltimo();   // silenciaste el que sonaba: al recargar no se retoma nada
  }
}

// ---------- Volumen propio de cada video ----------
// Cada video o canal recuerda su volumen (config.volumenes, por clave): así los que suenan fuerte se bajan
// una vez y quedan parejos con los demás. Los fundidos suben hasta ese volumen en vez de hasta 100.
const VOLUMEN_MIN = 5;
function volumenDe(celda) {
  const v = config.volumenes[clave(celda.dataset.linea)];
  return typeof v === 'number' ? v : 100;
}
function fijarVolumen(celda, v, avisar) {
  const k = clave(celda.dataset.linea);
  if (!k) return;
  v = Math.min(100, Math.max(VOLUMEN_MIN, Math.round(v / 5) * 5));
  if (v === 100) delete config.volumenes[k]; else config.volumenes[k] = v;
  guardar();
  // Si está sonando (y no en pleno fundido), se aplica al tiro
  if (celda.dataset.mute === '0' && !celda._rampa) {
    comandoYT(celda.querySelector('iframe'), 'setVolume', [v]);
    celda._vol = v;
  }
  const barra = celda.querySelector('.volumen');
  if (barra) {
    barra.value = v;
    barra.title = 'Volumen de este video: ' + v + '% (se recuerda) · también con las teclas + y −';
  }
  if (avisar) mostrarMensaje('🔊 Volumen de este video: ' + v + '%');
}
// Teclas + y −: ajustan el volumen del que está sonando
function cambiarVolumenActual(paso) {
  const c = celdas.find(x => x.dataset.mute === '0');
  if (!c) { mostrarMensaje('No hay ningún video sonando'); return; }
  fijarVolumen(c, volumenDe(c) + paso, true);
}

// ---------- Modo solo audio (global) ----------
// cambio = true cuando el usuario apretó el botón (hay que pausar / reanudar)
function aplicarModoAudio(cambio) {
  document.body.classList.toggle('modo-audio', config.modoAudio);
  btnModoAudio.classList.toggle('activo', config.modoAudio);
  btnModoAudio.title = config.modoAudio ? 'Volver a mostrar los videos' : 'Solo audio (ocultar videos)';
  $('icoBarras').style.display = config.modoAudio ? 'none' : '';
  $('icoVideo').style.display = config.modoAudio ? '' : 'none';
  if (config.modoAudio) restaurarTodo();

  if (cambio) {
    celdas.forEach(c => {
      const ifr = c.querySelector('iframe');
      if (!ifr) return;
      if (config.modoAudio) {
        // Solo sigue reproduciendo el que tiene audio
        comandoYT(ifr, c.dataset.mute === '1' ? 'pauseVideo' : 'playVideo');
      } else if (config.autoplay) {
        comandoYT(ifr, 'playVideo');   // al volver a video, todos reproducen
      }
    });
  }
  celdas.forEach(pintarAudio);
  ajustarCamaras();
  ajustarGrilla();
  programarPausaOcultos();
}
btnModoAudio.addEventListener('click', () => {
  config.modoAudio = !config.modoAudio;
  guardar();
  aplicarModoAudio(true);
});

// ---------- Silenciar todo (botón de la barra superior) ----------
// Silencia al tiro el video que suena y lo recuerda; el segundo clic le devuelve el audio a ese mismo.
// Si mientras tanto le das el audio a otro (clic, flechas, carrusel), el silencio general se cancela solo.
// No borra el "último seleccionado": al recargar se sigue retomando ese video.
const btnMuteGeneral = $('btnMuteGeneral');
let silencioGeneral = null;   // celda que tenía el audio al silenciar todo
function pintarMuteGeneral() {
  const on = !!silencioGeneral;
  btnMuteGeneral.classList.toggle('activo', on);
  btnMuteGeneral.title = (on ? 'Volver a activar el sonido' : 'Silenciar todo') + ' (M)';
  $('icoSonido').style.display = on ? 'none' : '';
  $('icoSilencio').style.display = on ? '' : 'none';
}
function olvidarSilencioGeneral() {
  if (!silencioGeneral) return;
  silencioGeneral = null;
  pintarMuteGeneral();
}
btnMuteGeneral.addEventListener('click', () => {
  if (silencioGeneral) {
    const c = silencioGeneral;
    olvidarSilencioGeneral();
    if (c.isConnected && c.dataset.mute === '1') alternarAudio(c);
    mostrarMensaje('🔊 Sonido activado');
    return;
  }
  const c = celdas.find(x => x.dataset.mute === '0');
  if (!c) { mostrarMensaje('No hay ningún video sonando'); return; }
  fijarAudio(c, true, 0);
  silencioGeneral = c;
  pintarMuteGeneral();
  mostrarMensaje('🔇 Todo silenciado');
});
