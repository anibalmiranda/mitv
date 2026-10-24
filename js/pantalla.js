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

// ---------- Mensajes cortos abajo ----------
let timerIndicador = null;
function mostrarMensaje(texto) {
  const ind = $('indicador');
  ind.textContent = texto;
  ind.classList.add('visible');
  clearTimeout(timerIndicador);
  timerIndicador = setTimeout(() => ind.classList.remove('visible'), 2000);
}
