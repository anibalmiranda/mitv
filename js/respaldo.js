// Multi YouTube — respaldo.js
// Exportar e importar la configuración completa (listas, favoritos, nombres y duraciones memorizadas, ajustes)
// como un archivo .json. Sirve de respaldo y para pasar todo a otro PC o navegador.
// Al importar se elige: "Agregar a lo actual" (suma listas y favoritos) o "Reemplazar todo".
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const VERSION_RESPALDO = 1;
let respaldoPendiente = null;   // configuración leída del archivo, esperando que elijas cómo cargarla

function avisoPanel(texto, ok) {
  aviso.textContent = texto;
  aviso.classList.toggle('ok', !!ok);
}

// ---------- Exportar ----------
function exportarConfig() {
  const datos = {
    app: 'multiyoutube',
    version: VERSION_RESPALDO,
    exportado: new Date().toISOString(),
    config: config
  };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const hoy = new Date();
  const fecha = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  a.href = URL.createObjectURL(blob);
  a.download = 'multiyoutube-respaldo-' + fecha + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  const nListas = Object.keys(config.listas).length;
  const nVideos = Object.values(config.listas).reduce((s, l) => s + l.filter(x => parsear(x)).length, 0);
  avisoPanel('⬇ Exportado: ' + nListas + ' lista(s), ' + nVideos + ' video(s), ' + cantFavs() + ' favorito(s).', true);
}

// ---------- Importar ----------
// Acepta el archivo exportado ({ app, version, config }) o directamente un objeto de configuración
function leerRespaldo(texto) {
  let obj;
  try { obj = JSON.parse(texto); } catch (e) { throw new Error('el archivo no es un JSON válido'); }
  const c = obj && obj.config ? obj.config : obj;
  if (!c || typeof c !== 'object') throw new Error('el archivo no tiene configuración');
  // Respaldo de la primera versión (una sola lista en "urls")
  if (Array.isArray(c.urls) && !c.listas) c.listas = { 'Principal': c.urls };
  if (!c.listas || typeof c.listas !== 'object' || Array.isArray(c.listas)) throw new Error('el archivo no trae listas');
  const limpias = {};
  Object.keys(c.listas).forEach(n => {
    if (Array.isArray(c.listas[n])) limpias[String(n).slice(0, 40)] = c.listas[n].filter(l => typeof l === 'string');
  });
  if (!Object.keys(limpias).length) throw new Error('las listas del archivo están vacías o dañadas');
  c.listas = limpias;
  if (!Array.isArray(c.favoritos)) c.favoritos = [];
  c.favoritos = c.favoritos.filter(l => typeof l === 'string');
  return c;
}

function elegirArchivo() {
  $('archivoImportar').value = '';
  $('archivoImportar').click();
}
$('archivoImportar').addEventListener('change', () => {
  const f = $('archivoImportar').files[0];
  if (!f) return;
  const lector = new FileReader();
  lector.onload = () => {
    try {
      respaldoPendiente = leerRespaldo(String(lector.result));
    } catch (err) {
      respaldoPendiente = null;
      avisoPanel('No se pudo importar: ' + err.message + '.');
      return;
    }
    const c = respaldoPendiente;
    const nListas = Object.keys(c.listas).length;
    const nVideos = Object.values(c.listas).reduce((s, l) => s + l.filter(x => parsear(x)).length, 0);
    const nFavs = c.favoritos.filter(x => clave(x)).length;
    avisoPanel('Archivo "' + f.name + '": ' + nListas + ' lista(s), ' + nVideos + ' video(s), ' + nFavs + ' favorito(s). ¿Cómo lo cargo?', true);
    mostrarOpcionesImportar(true);
  };
  lector.onerror = () => avisoPanel('No se pudo leer el archivo.');
  lector.readAsText(f);
});

function mostrarOpcionesImportar(si) {
  $('opcionesImportar').hidden = !si;
  $('btnExportar').hidden = si;
  $('btnImportar').hidden = si;
}

// Reemplazar todo: queda exactamente lo del archivo (más los valores por defecto que falten)
function importarReemplazar() {
  const c = respaldoPendiente;
  if (!c) return;
  const base = JSON.parse(JSON.stringify(config));
  ['listas', 'favoritos', 'ultimos', 'duraciones', 'nombres', 'handles', 'volumenes', 'tv'].forEach(k => { base[k] = Array.isArray(base[k]) ? [] : {}; });
  config = Object.assign(base, c);
  if (!config.listas[config.actual]) config.actual = Object.keys(config.listas)[0];
  if (cantFavs() > MAX_FAV) config.favoritos = config.favoritos.filter(f => clave(f)).slice(0, MAX_FAV);
  if (!config.ultimos || typeof config.ultimos !== 'object') config.ultimos = {};
  if (!config.duraciones || typeof config.duraciones !== 'object') config.duraciones = {};
  if (!config.nombres || typeof config.nombres !== 'object') config.nombres = {};
  normalizarConfig();
  terminarImportacion('⬆ Importado: se reemplazó todo con lo del archivo.');
}

// Agregar a lo actual: suma listas (sin repetir videos), favoritos (hasta 9) y la memoria de nombres/duraciones.
// Tus ajustes actuales (fundidos, carrusel, visualizador...) no se tocan.
function importarAgregar() {
  const c = respaldoPendiente;
  if (!c) return;
  let listasNuevas = 0, videosNuevos = 0, favsNuevos = 0, favsSinCupo = 0;
  Object.keys(c.listas).forEach(n => {
    if (!config.listas[n]) { config.listas[n] = c.listas[n].slice(); listasNuevas++; videosNuevos += c.listas[n].filter(x => parsear(x)).length; return; }
    const ya = new Set(config.listas[n].map(l => clave(l) || l));
    c.listas[n].forEach(l => {
      const k = clave(l) || l;
      if (!ya.has(k)) { config.listas[n].push(l); ya.add(k); if (parsear(l)) videosNuevos++; }
    });
  });
  c.favoritos.forEach(f => {
    if (!clave(f) || esFav(f)) return;
    if (cantFavs() >= MAX_FAV) { favsSinCupo++; return; }
    config.favoritos.push(f);
    favsNuevos++;
  });
  ['duraciones', 'nombres', 'handles', 'volumenes', 'tv'].forEach(k => {
    if (!c[k] || typeof c[k] !== 'object') return;
    Object.keys(c[k]).forEach(id => { if (!config[k][id]) config[k][id] = c[k][id]; });
  });
  terminarImportacion('⬆ Agregado: ' + listasNuevas + ' lista(s) nueva(s), ' + videosNuevos + ' video(s) nuevo(s), ' +
                      favsNuevos + ' favorito(s)' + (favsSinCupo ? ' (' + favsSinCupo + ' no cupieron: máximo ' + MAX_FAV + ')' : '') + '.');
}

function terminarImportacion(mensaje) {
  respaldoPendiente = null;
  mostrarOpcionesImportar(false);
  guardar();
  render();
  pintarSelector();
  abrirPanel();               // refresca el panel con lo importado
  avisoPanel(mensaje, true);
}

$('btnExportar').addEventListener('click', exportarConfig);
$('btnImportar').addEventListener('click', elegirArchivo);
$('btnImportarAgregar').addEventListener('click', importarAgregar);
$('btnImportarReemplazar').addEventListener('click', importarReemplazar);
$('btnImportarCancelar').addEventListener('click', () => {
  respaldoPendiente = null;
  mostrarOpcionesImportar(false);
  avisoPanel('');
});
