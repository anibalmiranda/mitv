// Multi YouTube — pantalla.js
// Pantalla completa, mouse activo y mensajes cortos abajo.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Pantalla completa ----------
function pintarPantalla() {
  const fs = !!document.fullscreenElement;
  btnPantalla.classList.toggle('activo', fs);
  btnPantalla.title = (fs ? 'Salir de pantalla completa' : 'Pantalla completa') + ' (F)';
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
  else {
    pedirMaxCalidad(contenedor.querySelector('.celda.max'));   // al crecer a toda la pantalla
    if (config.tiraFija) abrirTira();
  }
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

// ---------- Menú y flechas se ocultan solos (pantalla completa) ----------
// Tras 10 s sin mover el mouse desaparecen el menú de arriba, las flechas ‹ › y la pestaña de la tira (y el cursor).
// Sobre el video de YouTube la página no recibe el movimiento del mouse: por eso, mientras están ocultos, una capa
// transparente (#atrapaMouse) cubre todo y al primer movimiento vuelven a aparecer.
const ESPERA_UI = 10000;
let timerUi = null, ultimoMouse = null;
function mostrarUi() {
  document.body.classList.remove('ui-oculta');
  clearTimeout(timerUi);
  if (document.fullscreenElement) timerUi = setTimeout(ocultarUi, ESPERA_UI);
}
function ocultarUi() {
  if (!document.fullscreenElement) return;
  // No mientras el mouse descansa sobre el menú o las flechas, con la tira abierta o con una ventana abierta
  const encima = document.querySelector('#barra-sup:hover, .nav-btn:hover, #zonaTira:hover');
  if (encima || document.body.classList.contains('tira-abierta') || document.querySelector('.abierto')) {
    timerUi = setTimeout(ocultarUi, ESPERA_UI);
    return;
  }
  document.body.classList.add('ui-oculta');
}
document.addEventListener('mousemove', e => {
  // Al aparecer la capa, el navegador puede avisar un "movimiento" sin que el mouse se haya movido: se ignora
  const pos = e.screenX + ',' + e.screenY;
  if (document.body.classList.contains('ui-oculta') && pos === ultimoMouse) return;
  ultimoMouse = pos;
  mostrarUi();
}, { passive: true });
document.addEventListener('pointerdown', mostrarUi, { passive: true });
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) mostrarUi();
  else { clearTimeout(timerUi); document.body.classList.remove('ui-oculta'); }
});

// ---------- Mensajes cortos abajo ----------
let timerIndicador = null;
function mostrarMensaje(texto) {
  const ind = $('indicador');
  ind.textContent = texto;
  ind.classList.add('visible');
  clearTimeout(timerIndicador);
  timerIndicador = setTimeout(() => ind.classList.remove('visible'), 2000);
}
