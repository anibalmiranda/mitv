// Multi YouTube — rudo.js
// Canales de rudo.video (TVN, Mega, T13, 24 Horas…): se muestra su página oficial rudo.video/live/<canal> en un
// iframe, tal como ellos la ofrecen. Su reproductor no acepta órdenes desde fuera (ni volumen ni silencio) y en
// Chrome los directos parten siempre silenciados, así que el audio se maneja así:
//  - para oírlo se activa el sonido con el 🔊 de su propio reproductor (la barra de abajo queda al alcance del mouse);
//  - un clic dentro de su reproductor le da el audio a ese cuadro (los demás se silencian);
//  - cuando el audio pasa a otro cuadro (o se silencia todo), se vuelve a cargar: parte de nuevo silenciado.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

function esRudo(ifr) { return !!ifr && ifr.tagName === 'IFRAME' && !!ifr.closest('.celda.rudo'); }

// Llamado por comandoYT en vez de mandar el mensaje de YouTube
function comandoRudo(ifr, func) {
  const celda = ifr.closest('.celda');
  if (func === 'unMute' && !celda._rudoSonido) {
    celda._rudoSonido = true;
    if (!celda._rudoTocado) mostrarMensaje('🔊 Para oír este canal, activa el sonido con el parlante de su reproductor (abajo)');
    celda._rudoTocado = false;
  }
  if (func === 'mute' && celda._rudoSonido) {
    celda._rudoSonido = false;
    if (!ifr.dataset.src && ifr.src && ifr.src !== 'about:blank') {
      celda._listo = false;
      ifr.src = ifr.src;   // al recargar, su reproductor parte de nuevo silenciado
    }
  }
}

// Al terminar de cargar su página ya está "funcionando" (no informa más que eso)
function rudoCargado(celda, ifr) {
  if (!ifr.src || ifr.src === 'about:blank') return;
  celda._listo = true;
  celda._estado = 1;
}

// Un clic dentro del iframe no llega a la página, pero la ventana pierde el foco y el iframe queda como elemento
// activo: así se sabe que tocaste su reproductor (normalmente, para activar el sonido) y ese cuadro recibe el audio.
window.addEventListener('blur', () => {
  setTimeout(() => {
    const ifr = document.activeElement;
    if (!esRudo(ifr)) return;
    const celda = ifr.closest('.celda');
    celda._rudoTocado = true;
    if (celda.dataset.mute === '1') conCausa('clic dentro del reproductor de rudo.video', () => alternarAudio(celda));
    celda._rudoSonido = true;   // pudo haber activado su sonido: al perder el audio se recarga
    celda._rudoTocado = false;
  }, 0);
});
