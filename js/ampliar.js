// Multi YouTube — ampliar.js
// Ampliar / miniatura, fundido de imagen al cambiar de video ampliado y pedido de máxima resolución.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Ampliar / miniatura ----------
// La celda se superpone sobre toda la grilla (97% x 90%); las demás siguen reproduciéndose debajo
function alternarMax(celda) {
  terminarFundidoImagen();
  const yaMax = celda.classList.contains('max');
  contenedor.querySelectorAll('.celda.max').forEach(c => {
    c.classList.remove('max');
    c.querySelector('.maximizar').textContent = '⤢';
  });
  if (!yaMax) {
    celda.classList.add('max');
    celda.querySelector('.maximizar').textContent = '⤡';
    cargarYa(celda);
    pedirMaxCalidad(celda);
  }
  actualizarUltimoMax();
  programarPausaOcultos();
  pintarAmpliado();
}
// Con un video ampliado (aunque no sea pantalla completa) se ven las barras ‹ › de navegación y la tira de abajo,
// y las flechas del teclado navegan (body.con-ampliado); al volver a la grilla desaparecen.
function pintarAmpliado() {
  const hay = !!contenedor.querySelector('.celda.max');
  const habia = document.body.classList.contains('con-ampliado');
  document.body.classList.toggle('con-ampliado', hay);
  if (hay && !habia && config.tiraFija) abrirTira();   // 📌 tira fija: se abre sola al ampliar
  if (!hay && !document.fullscreenElement) cerrarTira();
  pintarNombreAmpliado();
  if (hay) programarCarga();   // precarga el anterior y el siguiente del ampliado
}
// Rótulo abajo a la derecha con el nombre del canal ampliado (doble clic o pantalla completa); se pone al día al
// cambiar de canal (flechas, tira, carrusel) y cuando el reproductor informa el título.
function pintarNombreAmpliado() {
  const r = $('nombreAmpliado');
  const c = (fundido && fundido.nueva) || contenedor.querySelector('.celda.max');
  if (!c) { r.classList.remove('visible'); return; }
  const tit = (c.querySelector('.titulo') || {}).textContent || '';
  const aut = (c.querySelector('.autor') || {}).textContent || '';
  r.textContent = (c.classList.contains('en-vivo') ? '🔴 ' : '') + tit + (aut && aut !== tit ? ' — ' + aut : '');
  r.classList.toggle('visible', !!tit);
}

// ---------- Fundido de imagen al cambiar de video ampliado ----------
// El nuevo aparece encima del actual (de transparente a visible); al terminar, el anterior vuelve a la grilla.
let fundido = null;   // { vieja, nueva, timer }
function terminarFundidoImagen() {
  if (!fundido) return;
  clearTimeout(fundido.timer);
  const { vieja, nueva } = fundido;
  fundido = null;
  vieja.classList.remove('max');
  vieja.querySelector('.maximizar').textContent = '⤢';
  nueva.classList.remove('entrando');
  nueva.style.transition = 'none';
  nueva.style.opacity = '';
  void nueva.offsetWidth;                        // corta la transición en curso y deja la opacidad en 1
  nueva.style.transition = '';
  programarPausaOcultos();
  pintarNombreAmpliado();
}
function cambiarAmpliado(nueva) {
  terminarFundidoImagen();                       // si venía otro fundido, se completa al tiro
  const vieja = contenedor.querySelector('.celda.max');
  const ms = Math.max(0, Number(config.fadeImg) || 0) * 1000;
  if (!vieja || vieja === nueva || ms === 0) {
    if (!nueva.classList.contains('max')) alternarMax(nueva);
    return;
  }
  nueva.classList.add('max', 'entrando');
  nueva.querySelector('.maximizar').textContent = '⤡';
  cargarYa(nueva);
  pedirMaxCalidad(nueva);
  nueva.style.transition = 'none';
  nueva.style.opacity = '0';
  void nueva.offsetWidth;                        // fuerza el reflow para que parta la transición
  nueva.style.transition = 'opacity ' + ms + 'ms ease';
  nueva.style.opacity = '1';
  fundido = { vieja, nueva, timer: setTimeout(terminarFundidoImagen, ms + 50) };
  programarPausaOcultos();   // el que entra (y sus vecinos) se despiertan al tiro
  pintarAmpliado();
}

// ---------- Máxima resolución ----------
// YouTube elige la calidad sola según el tamaño del reproductor y la conexión; no deja fijarla desde fuera.
// Lo que sí se hace: 1) el ampliado ocupa toda la pantalla en pantalla completa (más tamaño = más resolución)
// y 2) se le pide la calidad más alta. Si el reproductor no hace caso a esa petición, se queda en automático.
function pedirMaxCalidad(celda) {
  const ifr = celda && celda.querySelector(SEL_REPRODUCTOR);
  if (!ifr) return;
  const pedir = () => {
    comandoYT(ifr, 'setPlaybackQualityRange', ['highres', 'highres']);
    comandoYT(ifr, 'setPlaybackQuality', ['highres']);
  };
  pedir();
  setTimeout(pedir, 1500);   // de nuevo cuando ya terminó de agrandarse
}
function restaurarTodo() {
  terminarFundidoImagen();
  contenedor.querySelectorAll('.celda.max').forEach(c => alternarMax(c));
}
