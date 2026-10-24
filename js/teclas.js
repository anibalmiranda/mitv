// Multi YouTube — teclas.js
// Teclas multimedia del teclado (⏯ ⏭ ⏮ ⏹), aunque el navegador no esté al frente. Las escucha servidor.py
// (solo Windows) y las manda por una conexión abierta (/api/eventos). Sin el servidor, no hace nada.
//  ⏯ silencia o devuelve el sonido (como el botón de silenciar todo) · ⏹ silencia
//  ⏭ ⏮ pasan el audio al video siguiente / anterior; en pantalla completa, con un video ampliado o en modo
//     solo audio, cambian de video igual que las flechas.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

function conectarTeclasMultimedia() {
  if (servidorOk !== true || typeof EventSource === 'undefined') return;
  const eventos = new EventSource('/api/eventos');   // si el servidor se reinicia, el navegador se reconecta solo
  eventos.onmessage = e => {
    let d;
    try { d = JSON.parse(e.data); } catch (err) { return; }
    accionMultimedia(d.tecla);
  };
}

function accionMultimedia(tecla) {
  ultimaActividad = Date.now();   // también cuenta como actividad (sale del ahorro)
  salirAhorro();
  if (tecla === 'playpausa') { btnMuteGeneral.click(); return; }
  if (tecla === 'detener') {
    if (!silencioGeneral && celdas.some(c => c.dataset.mute === '0')) btnMuteGeneral.click();
    return;
  }
  if (tecla === 'siguiente') navegarMultimedia(1);
  if (tecla === 'anterior') navegarMultimedia(-1);
}

function navegarMultimedia(dir) {
  if (document.fullscreenElement || contenedor.querySelector('.celda.max') || config.modoAudio) {
    navegar(dir);
    return;
  }
  // En la grilla: solo pasa el audio (sin ampliar). Las cámaras y los bloqueados se saltan.
  const lista = celdas.filter(puedeSonar);
  if (!lista.length) return;
  const i = lista.findIndex(c => c.dataset.mute === '0');
  const n = lista.length;
  const sig = lista[i === -1 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n];
  if (sig.dataset.mute === '1') conCausa('tecla multimedia ⏭ ⏮', () => alternarAudio(sig));
  reiniciarCarrusel();
  const tit = sig.querySelector('.titulo');
  mostrarMensaje((dir > 0 ? '⏭ ' : '⏮ ') + (tit ? tit.textContent : 'video'));
}
