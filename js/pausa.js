// Multi YouTube — pausa.js
// Pausar los que no se ven (video ampliado, ventana minimizada u otra pestaña).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Pausar los que no se ven ----------
// Con la casilla "Pausar los que no se ven" del ⚙:
// - Con un video ampliado (en pantalla completa o no), los demás quedan tapados: solo siguen corriendo el actual,
//   el anterior y el siguiente (así las flechas y el carrusel cambian sin pantalla de carga).
// - Con la ventana minimizada o en otra pestaña, solo sigue el que tiene el audio.
// El resto se pausa y deja libre la conexión (las cámaras se cortan). Al reanudar un directo, salta al en vivo.
// Al volver a la grilla o a la ventana, todos vuelven.
function vecinosActivos() {
  const lista = validas();
  const n = lista.length;
  const i = indiceActual(lista);
  if (i < 0) return null;
  const s = new Set([lista[i]]);
  if (n > 1) { s.add(lista[(i + 1) % n]); s.add(lista[(i - 1 + n) % n]); }
  return s;
}
function pausaOcultosActiva() {
  return config.pausarOcultos && !config.modoAudio && !!contenedor.querySelector('.celda.max');
}
function ventanaOculta() { return config.pausarOcultos && document.hidden; }
function reanudarCelda(celda) {
  const ifr = celda.querySelector(SEL_REPRODUCTOR);
  if (!ifr) return;
  if (celda.classList.contains('en-vivo')) comandoYT(ifr, 'seekTo', [1e9, true]);   // al borde del en vivo
  comandoYT(ifr, 'playVideo');
}
function aplicarPausaOcultos() {
  const activa = pausaOcultosActiva();
  const v = activa ? vecinosActivos() : null;
  const oculta = ventanaOculta();
  let reintentar = false;
  celdas.forEach(c => {
    const pausar = (activa && v && !v.has(c)) || (oculta && (c.dataset.mute !== '0' || fondoActivo));
    if (c.dataset.tipo === 'camara') { c._pausadaFS = !!pausar; return; }   // se corta o reconecta abajo
    const ifr = c.querySelector(SEL_REPRODUCTOR);
    if (!ifr) return;
    if (pausar && !c._pausadaFS) {
      if (c._rampa) { reintentar = true; return; }   // todavía bajando el audio: se pausa al terminar
      comandoYT(ifr, 'pauseVideo');
      c._pausadaFS = true;
    } else if (!pausar && c._pausadaFS) {
      c._pausadaFS = false;
      if (!(config.modoAudio && c.dataset.mute === '1')) reanudarCelda(c);
    }
  });
  ajustarCamaras();
  if (reintentar) setTimeout(aplicarPausaOcultos, Math.max(0, Number(config.fade) || 0) * 1000 + 300);
}
let timerPausa = null;
function programarPausaOcultos() { clearTimeout(timerPausa); timerPausa = setTimeout(aplicarPausaOcultos, 60); }
// Al minimizar o volver a la ventana se aplica al tiro (con la ventana oculta, el navegador retrasa los timers)
document.addEventListener('visibilitychange', () => { clearTimeout(timerPausa); aplicarPausaOcultos(); });
