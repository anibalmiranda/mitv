// Multi YouTube — pantalla.js
// Pantalla completa, mouse activo, mensajes, flechas, tira, carrusel, ampliar, pausar ocultos, calidad y fundido de imagen.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Pantalla completa ----------
function pintarPantalla() {
  const fs = !!document.fullscreenElement;
  btnPantalla.classList.toggle('activo', fs);
  btnPantalla.title = fs ? 'Salir de pantalla completa' : 'Pantalla completa';
  $('icoExpandir').style.display = fs ? 'none' : '';
  $('icoContraer').style.display = fs ? '' : 'none';
}
btnPantalla.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement;
  document.body.classList.toggle('pantalla-completa', fs);
  if (!fs) { cerrarTira(); detenerCarrusel(); salirEscena(); }
  else pedirMaxCalidad(contenedor.querySelector('.celda.max'));   // al crecer a toda la pantalla
  programarPausaOcultos();
  pintarPantalla();
  setTimeout(ajustarGrilla, 100);
});

// ---------- Mouse activo (pantalla completa) ----------
// Al mover el mouse se muestran 🔊 y EN VIVO; tras 2,5 s quieto se vuelven a ocultar
let timerMouse = null;
function mouseActivo() {
  document.body.classList.add('mouse-activo');
  clearTimeout(timerMouse);
  timerMouse = setTimeout(() => document.body.classList.remove('mouse-activo'), 2500);
}
document.addEventListener('mousemove', mouseActivo, { passive: true });
document.addEventListener('pointerdown', mouseActivo, { passive: true });

// ---------- Mensajes cortos abajo ----------
let timerIndicador = null;
function mostrarMensaje(texto) {
  const ind = $('indicador');
  ind.textContent = texto;
  ind.classList.add('visible');
  clearTimeout(timerIndicador);
  timerIndicador = setTimeout(() => ind.classList.remove('visible'), 2000);
}

// ---------- Anterior / siguiente y tira (pantalla completa) ----------
// Modo video: amplía el video elegido y le pasa el audio.
// Modo solo audio: le pasa el audio a esa fila.
// Las cámaras entran en la navegación solo cuando se ven videos (en solo audio no tienen nada que aportar)
function validas() {
  return celdas.filter(c => c.querySelector('iframe') || (c.dataset.tipo === 'camara' && !config.modoAudio));
}
function indiceActual(lista) {
  // Durante un fundido de imagen, el "actual" es el que está entrando
  let i = config.modoAudio
    ? lista.findIndex(c => c.dataset.mute === '0')
    : (fundido ? lista.indexOf(fundido.nueva) : lista.findIndex(c => c.classList.contains('max')));
  if (i === -1) i = lista.findIndex(c => c.dataset.mute === '0');
  return i;
}
function irA(celda) {
  const lista = validas();
  const pos = lista.indexOf(celda);
  if (pos === -1) return;
  if (!config.modoAudio && !celda.classList.contains('max')) cambiarAmpliado(celda);
  if (celda.dataset.mute === '1') alternarAudio(celda);
  const tit = celda.querySelector('.titulo');
  mostrarMensaje((pos + 1) + ' / ' + lista.length + (tit ? ' · ' + tit.textContent : ''));
}
function navegar(dir, auto) {
  const lista = validas();
  const n = lista.length;
  if (!n) return;
  if (!auto) reiniciarCarrusel();   // si cambias a mano, el carrusel vuelve a contar desde cero
  const actual = indiceActual(lista);
  const destino = actual === -1 ? (dir > 0 ? 0 : n - 1) : (actual + dir + n) % n;
  irA(lista[destino]);
  if (document.body.classList.contains('tira-abierta')) armarTira();
}
$('navPrev').addEventListener('click', () => navegar(-1));
$('navNext').addEventListener('click', () => navegar(1));

// ---------- Carrusel (pantalla completa) ----------
// Recorre todos los videos de la lista elegida (nunca los favoritos: si estás viendo favoritos, vuelve a la lista)
// y avanza solo al siguiente cada N segundos (con los fundidos de imagen y audio). Si cambias de lista o de vista, se detiene.
let carrusel = null;   // { timer, previo, vista }
function pintarCarrusel() {
  const on = !!carrusel;
  $('btnCarrusel').classList.toggle('activo', on);
  $('btnCarrusel').title = on ? 'Detener carrusel' : 'Carrusel: recorre los videos de la lista "' + config.actual + '" (cada ' + config.carruselSeg + ' s)';
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
    render();
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

function armarTira() {
  const cont = $('tiraItems');
  cont.innerHTML = '';
  const lista = validas();
  const actual = indiceActual(lista);
  if (!lista.length) {
    cont.innerHTML = '<div style="color:var(--suave);font-size:13px;padding:10px">No hay videos en esta vista</div>';
    return;
  }
  lista.forEach((c, i) => {
    const it = document.createElement('div');
    it.className = 'item' + (i === actual ? ' actual' : '');
    const th = document.createElement('div');
    th.className = 'thumb';
    if (c.dataset.thumb) th.style.backgroundImage = 'url("' + c.dataset.thumb + '")';
    else th.textContent = c.dataset.tipo === 'canal' ? '📡' : c.dataset.tipo === 'camara' ? '📷' : '▶';
    if (c.classList.contains('en-vivo')) {
      const v = document.createElement('span');
      v.className = 'etq-vivo';
      v.textContent = 'EN VIVO';
      th.appendChild(v);
    }
    it.appendChild(th);

    const t = document.createElement('div');
    t.className = 't';
    t.textContent = c.querySelector('.titulo').textContent;
    it.appendChild(t);
    const a = document.createElement('div');
    a.className = 'a';
    a.textContent = c.querySelector('.autor').textContent;
    it.appendChild(a);

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    it.appendChild(num);
    if (esFav(c.dataset.linea)) {
      const s = document.createElement('span');
      s.className = 'estrella';
      s.textContent = '★';
      it.appendChild(s);
    }
    if (c.dataset.mute === '0') {
      const s = document.createElement('span');
      s.className = 'sonando';
      s.textContent = '🔊 sonando';
      it.appendChild(s);
    }
    it.title = t.textContent;
    it.addEventListener('click', () => { irA(c); cerrarTira(); reiniciarCarrusel(); });
    cont.appendChild(it);
  });
  // Centra el actual en la tira
  const sel = cont.querySelector('.item.actual');
  if (sel) {
    cont.style.scrollBehavior = 'auto';
    cont.scrollLeft = sel.offsetLeft - (cont.clientWidth - sel.offsetWidth) / 2;
    cont.style.scrollBehavior = '';
  }
}
function abrirTira() { armarTira(); document.body.classList.add('tira-abierta'); }
function cerrarTira() { document.body.classList.remove('tira-abierta'); }
function alternarTira() {
  if (document.body.classList.contains('tira-abierta')) cerrarTira(); else abrirTira();
}
$('btnTira').addEventListener('click', alternarTira);
// La rueda del mouse mueve la tira hacia los lados
$('tiraItems').addEventListener('wheel', e => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    $('tiraItems').scrollLeft += e.deltaY;
  }
}, { passive: false });

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
}

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
  const ifr = celda.querySelector('iframe');
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
    const pausar = (activa && v && !v.has(c)) || (oculta && c.dataset.mute !== '0');
    if (c.dataset.tipo === 'camara') { c._pausadaFS = !!pausar; return; }   // se corta o reconecta abajo
    const ifr = c.querySelector('iframe');
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

// ---------- Máxima resolución ----------
// YouTube elige la calidad sola según el tamaño del reproductor y la conexión; no deja fijarla desde fuera.
// Lo que sí se hace: 1) el ampliado ocupa toda la pantalla en pantalla completa (más tamaño = más resolución)
// y 2) se le pide la calidad más alta. Si el reproductor no hace caso a esa petición, se queda en automático.
function pedirMaxCalidad(celda) {
  const ifr = celda && celda.querySelector('iframe');
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
}
