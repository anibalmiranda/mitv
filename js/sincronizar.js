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

// ---------- Mudanza desde la dirección antigua ----------
// Antes la página se abría en localhost:90, pero ese puerto lo ocupa IIS (el servidor web de Windows) y la
// página no llegaba a servidor.py. Ahora el servidor usa PUERTO_SERVIDOR. Si la página se abre en otra dirección
// (la antigua, o como archivo) y el servidor está corriendo, le manda los datos de este navegador —solo si son
// más nuevos que los del archivo— y te lleva a la dirección nueva, donde se recuperan desde el archivo.
const PUERTO_SERVIDOR = 18090;
const URL_SERVIDOR = 'http://127.0.0.1:' + PUERTO_SERVIDOR;
async function mudarseSiHaceFalta() {
  if (location.port === String(PUERTO_SERVIDOR)) return false;
  const pedir = (ruta, opciones) => fetch(URL_SERVIDOR + ruta, Object.assign({ cache: 'no-store' }, opciones));
  let remoto;
  try {
    const r = await pedir('/api/datos');
    if (!r.ok) return false;
    remoto = ((await r.json()).datos || {}).config;
  } catch (e) {
    return false;   // el servidor no está corriendo: se sigue aquí, como antes
  }
  let hayLocales = false;
  try { hayLocales = !!localStorage.getItem(CLAVE); } catch (e) { }
  const remotoGuardado = (remoto && Number(remoto.guardado)) || 0;
  if (hayLocales && (!remoto || (config.guardado || 0) > remotoGuardado)) {
    // Lo que se muda es lo vigente: cuenta como lo más nuevo (más que cualquier cosa vacía de la dirección nueva)
    config.guardado = Date.now();
    try {
      const r = await pedir('/api/datos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MultiYouTube': '1' },
        body: JSON.stringify({ app: 'multiyoutube', version: VERSION_RESPALDO, config })
      });
      if (!r.ok) throw new Error();
    } catch (e) {
      mostrarMensaje('⚠ No pude pasar tus datos al servidor nuevo: sigues en la dirección antigua');
      return false;
    }
  }
  mostrarMensaje('➡ Abriendo la dirección nueva (' + URL_SERVIDOR + ')…');
  location.replace(URL_SERVIDOR + '/');
  return true;
}
// Al revés: la dirección nueva parte vacía y el archivo no tiene nada (primera vez). Los datos siguen en el
// navegador, pero guardados bajo la dirección antigua: se va UNA vez a localhost:90 para que los mande y vuelva.
const URL_ANTIGUA = 'http://localhost:90/';
const MARCA_MUDANZA = 'multiyoutube.mudanza';
async function buscarDatosEnDireccionAntigua() {
  if (location.port !== String(PUERTO_SERVIDOR) || datosLocalesAlCargar) return false;
  try { if (localStorage.getItem(MARCA_MUDANZA)) return false; localStorage.setItem(MARCA_MUDANZA, String(Date.now())); }
  catch (e) { return false; }
  // Solo si la dirección antigua responde (si no, el navegador quedaría en una página de error)
  try { await fetch(URL_ANTIGUA + 'index.html', { mode: 'no-cors', cache: 'no-store' }); }
  catch (e) { return false; }
  mostrarMensaje('🔎 Buscando tus listas en la dirección antigua…');
  // Con una dirección única, para que el navegador no use una copia vieja de esa página (sin la mudanza)
  location.replace(URL_ANTIGUA + '?mudanza=' + Date.now());
  return true;
}

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
    mostrarSuperFav();
    mostrarCuenta();
    aplicarFondo();
    mostrarMensaje('📂 Datos recuperados del archivo de respaldo');
    return;
  }
  // Primera vez en la dirección nueva, sin nada guardado aún: los datos están en la antigua
  if (!remoto && await buscarDatosEnDireccionAntigua()) { sincronizado = false; return; }
  // El navegador es igual o más nuevo: el archivo se pone al día
  if (!remoto || (config.guardado || 0) > (Number(remoto.guardado) || 0)) {
    subidaPendiente = true;
    subirDatos();
  }
}
