// Multi YouTube — main.js
// Arranque: atajos de teclado, eventos generales y carga inicial.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

$('engranaje').addEventListener('click', abrirPanel);
$('btnCancelar').addEventListener('click', cerrarPanel);
$('btnGuardar').addEventListener('click', guardarPanel);
fondo.addEventListener('click', e => { if (e.target === fondo) cerrarPanel(); });
document.addEventListener('keydown', e => {
  const panelAbierto = fondo.classList.contains('abierto');
  const buscarAbierto = fondoBuscar.classList.contains('abierto');
  const enCampo = e.target && e.target.matches && e.target.matches('input, textarea, select');
  if (e.key === 'Escape') {
    if (document.body.classList.contains('solo-visual')) { e.preventDefault(); salirEscena(); return; }   // vuelve al video
    if (buscarAbierto) { e.preventDefault(); cerrarBuscar(); return; }
    if (panelAbierto) cerrarPanel();
    else if (document.body.classList.contains('tira-abierta')) cerrarTira();
    else restaurarTodo();
  }
  if (e.key === 'Enter' && e.ctrlKey && panelAbierto) guardarPanel();
  // Atajos de una tecla (no mientras escribes en un campo ni con una ventana abierta):
  //  + / − volumen del que suena · M silenciar todo · F pantalla completa · C carrusel · 1 a 9 ir a ese video
  if (!panelAbierto && !buscarAbierto && !enCampo && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === '+' || k === '=') { e.preventDefault(); cambiarVolumenActual(5); }
    if (k === '-') { e.preventDefault(); cambiarVolumenActual(-5); }
    if (k === 'm') { e.preventDefault(); btnMuteGeneral.click(); }
    if (k === 'f') { e.preventDefault(); btnPantalla.click(); }
    if (k === 'c') {
      e.preventDefault();
      if (document.fullscreenElement) $('btnCarrusel').click();
      else mostrarMensaje('El carrusel es para pantalla completa: presiona F');
    }
    if (/^[1-9]$/.test(k)) { e.preventDefault(); irANumero(Number(k)); }
  }
  // Las flechas navegan solo si no estás escribiendo en un campo ni hay una ventana abierta
  if (document.fullscreenElement && !panelAbierto && !buscarAbierto && !enCampo) {
    if (e.key === 'ArrowRight') { e.preventDefault(); navegar(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); navegar(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); abrirTira(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); cerrarTira(); }
  }
});

let timerResize = null;
window.addEventListener('resize', () => { clearTimeout(timerResize); timerResize = setTimeout(ajustarGrilla, 80); });

cargar();
pintarSelector();
pintarPantalla();
render();
if (!config.vistaFav && !fuente().length && Object.keys(config.listas).length === 1) abrirPanel();
// Copia en archivo: si es más nueva que la del navegador (p. ej. se borraron sus datos), se recupera
// (si la página se abrió en la dirección antigua y el servidor está corriendo, primero se muda a la nueva)
mudarseSiHaceFalta().then(mudado => {
  if (mudado) return;
  sincronizarAlIniciar().then(() => {
    if (fondo.classList.contains('abierto') && fuente().length) cerrarPanel();
    ajustarCamaras();   // ya se sabe si hay servidor: algunas cámaras se conectan a través de él
    conectarTeclasMultimedia();
  });
});
// Si el visualizador quedó encendido, se reactiva solo (el permiso de la entrada ya está dado)
if (config.visualActivo) iniciarVisual(true);
