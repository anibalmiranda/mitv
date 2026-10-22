// Multi YouTube — sincronizar.js
// Copia de tus datos en un archivo (lo guarda servidor.py en %APPDATA%\MultiYouTube\datos.json, con un
// respaldo por día). El navegador sigue siendo el que manda mientras usas la página; el archivo sirve para:
//  - recuperar todo si se borran los datos del navegador, o si abres la página en otro navegador;
//  - no depender de acordarse de "Exportar configuración".
// Al abrir la página se queda con la copia más nueva (según config.guardado). Sin el servidor, no hace nada.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const ESPERA_SUBIDA_MS = 2000;   // los cambios seguidos se juntan en una sola escritura
let timerSubida = null;
let subidaPendiente = false;
let sincronizado = false;        // hasta saber qué copia es la más nueva, no se escribe el archivo

function programarSubida() {
  subidaPendiente = true;
  if (!sincronizado) return;
  clearTimeout(timerSubida);
  timerSubida = setTimeout(subirDatos, ESPERA_SUBIDA_MS);
}
function subirDatos(alSalir) {
  clearTimeout(timerSubida);
  if (!subidaPendiente || servidorOk === false) return;
  subidaPendiente = false;
  fetch('/api/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MultiYouTube': '1' },
    body: JSON.stringify({ app: 'multiyoutube', version: VERSION_RESPALDO, config }),
    keepalive: !!alSalir   // al cerrar la página, que alcance a llegar
  }).then(r => { if (!r.ok) subidaPendiente = true; })
    .catch(() => { subidaPendiente = true; });
}
// Al cerrar o recargar la página, se escribe lo que estaba esperando
window.addEventListener('pagehide', () => subirDatos(true));

async function sincronizarAlIniciar() {
  let d;
  try { d = await api('datos', {}); }
  catch (e) { return; }   // sin servidor: solo navegador, como antes
  sincronizado = true;
  const remoto = d.datos && d.datos.config;
  if (remoto && typeof remoto === 'object' && remoto.listas && (Number(remoto.guardado) || 0) > (config.guardado || 0)) {
    // El archivo es más nuevo (p. ej. se borraron los datos del navegador): se usa ese
    config = Object.assign(JSON.parse(JSON.stringify(CONFIG_INICIAL)), remoto);
    normalizarConfig();
    try { localStorage.setItem(CLAVE, JSON.stringify(config)); } catch (e) { }
    subidaPendiente = false;
    render();
    pintarSelector();
    pintarPantalla();
    mostrarMensaje('📂 Datos recuperados del archivo de respaldo');
    return;
  }
  // El navegador es igual o más nuevo: el archivo se pone al día
  if (!remoto || (config.guardado || 0) > (Number(remoto.guardado) || 0)) {
    subidaPendiente = true;
    subirDatos();
  }
}
