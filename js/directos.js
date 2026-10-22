// Multi YouTube — directos.js
// Lo que usa el servidor local (servidor.py, se abre con iniciar.bat):
//  - @handle → ID del canal, para poder poner canales como "@LofiGirl" o "youtube.com/@LofiGirl" en las listas.
//  - Directos que cambiaron de URL: cuando un directo se cae, termina o pasa a ser un video grabado, se busca
//    lo que el canal transmite ahora y la URL se reemplaza sola en todas las listas y favoritos.
//  - En "Buscar parecido", el botón "📡 Directo actual" trae la URL del directo del canal sin buscar a mano.
// Si la página se abre sin el servidor, todo lo demás funciona igual que antes.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const REVISION_DIRECTO_MS = 5 * 60000;   // canal sin transmitir: se vuelve a revisar cada 5 min

// ---------- Consultas al servidor ----------
let servidorOk = null;   // null = aún no se sabe; false = la página se abrió sin servidor.py
async function api(que, params) {
  if (servidorOk === false) throw new Error('sin servidor');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let r;
  try {
    r = await fetch('/api/' + que + '?' + new URLSearchParams(params), { cache: 'no-store', signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('YouTube tardó demasiado en responder');
    if (servidorOk !== true) servidorOk = false;
    throw new Error('sin servidor');
  } finally {
    clearTimeout(timer);
  }
  // Un servidor de archivos común (python -m http.server) responde una página de error, no JSON
  if (!(r.headers.get('Content-Type') || '').includes('application/json')) {
    servidorOk = false;
    throw new Error('sin servidor');
  }
  servidorOk = true;
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d;
}
function textoError(e) {
  return e.message === 'sin servidor' ? 'esto necesita el servidor: abre la página con iniciar.bat' : e.message;
}

// ---------- @handle → ID del canal ----------
function resolverRutasPendientes() {
  const rutas = new Set();
  fuente().forEach(l => { const p = parsear(l); if (p && p.pendiente && !estadoRutas[p.ruta]) rutas.add(p.ruta); });
  rutas.forEach(resolverRuta);
}
async function resolverRuta(ruta) {
  estadoRutas[ruta] = 'buscando';
  try {
    const d = await api('canal', { ruta });
    config.handles[ruta] = d.canal;
    delete estadoRutas[ruta];
    if (d.nombre) recordarNombre('canal:' + d.canal, '', d.nombre, true);   // nombre del canal, al tiro
    guardar();
    programarRender();
  } catch (e) {
    estadoRutas[ruta] = e.message === 'sin servidor' ? 'sinServidor' : 'fallo:' + e.message;
    repintarErrores();
  }
}
// Varias rutas resueltas casi a la vez → una sola recarga de la grilla
let timerRender = null;
function programarRender() {
  clearTimeout(timerRender);
  timerRender = setTimeout(() => { render(); pintarSelector(); }, 300);
}
// Actualiza el texto de los cuadros con error sin recargar los videos
function repintarErrores() {
  celdas.forEach(c => {
    if (!c.classList.contains('error') || !c.firstChild || c.firstChild.nodeType !== Node.TEXT_NODE) return;
    const p = parsear(c.dataset.linea);
    if (p && p.tipo === 'error') c.firstChild.nodeValue = (p.motivo || 'URL no reconocida') + ' → ' + p.original;
  });
}

// ---------- Canal dueño de cada directo ----------
// Se averigua mientras el directo funciona: si después lo borran, igual se sabe a qué canal preguntarle.
function guardarCanal(k, d) {
  if (!k || !d || !d.canal) return;
  const mem = config.nombres[k] || { titulo: d.titulo || '', autor: d.autor || '', vivo: !!d.vivo, t: Date.now() };
  if (mem.canal === d.canal && mem.directo === !!d.directo) return;
  mem.canal = d.canal;
  mem.directo = !!d.directo;
  config.nombres[k] = mem;
  guardar();
}
async function aprenderCanal(celda) {
  if (celda._canalPedido) return;
  celda._canalPedido = true;
  const p = parsear(celda.dataset.linea);
  const k = clave(celda.dataset.linea);
  if (!p || p.tipo !== 'video' || (config.nombres[k] && config.nombres[k].canal)) return;
  try { guardarCanal(k, await api('video', { id: p.id })); } catch (e) { }
}

// Lo llama el reproductor con cada mensaje de un cuadro
function vigilarDirecto(celda, info) {
  if (celda.dataset.tipo !== 'video') return;
  if (celda.classList.contains('en-vivo')) aprenderCanal(celda);
  // Era un directo y ahora el reproductor dice que no lo es (terminó y quedó grabado): ¿el canal sigue en vivo?
  const vd = info.videoData;
  if (celda._eraDirecto && !celda._directoRevisado && vd && vd.isLive === false && vd.video_id &&
      (celda._estado === 1 || celda._estado === 0)) {
    celda._directoRevisado = true;
    revisarDirecto(celda);
  }
}

// ---------- Directo que cambió de URL ----------
async function revisarDirecto(celda) {
  const p = parsear(celda.dataset.linea);
  if (!p || p.tipo !== 'video' || celda._revisandoDirecto || servidorOk === false) return;
  celda._revisandoDirecto = true;
  clearTimeout(celda._timerDirecto);
  const linea = celda.dataset.linea;
  const k = clave(linea);
  try {
    // ¿El video existe todavía? ¿De qué canal es? ¿Es (o fue) un directo?
    let info = null;
    try { info = await api('video', { id: p.id }); guardarCanal(k, info); }
    catch (e) { if (e.message === 'sin servidor') return; }
    const mem = config.nombres[k] || {};
    const canal = (info && info.canal) || mem.canal;
    const eraDirecto = info ? info.directo
      : (mem.directo || mem.vivo || celda._eraDirecto || celda.classList.contains('en-vivo'));
    if (!canal || !eraDirecto) return;   // video normal: queda el aviso con "Buscar parecido"
    if (!(info && info.vivo)) {
      avisoDirecto(celda, 'buscando el directo actual del canal…');
      const d = await api('directo', { canal });
      if (!celda.isConnected || celda.dataset.linea !== linea) return;
      if (d.vivo && d.video && d.video !== p.id) { cambiarDirecto(celda, d); return; }
      avisoDirecto(celda, 'el canal no está transmitiendo ahora; se revisa de nuevo cada 5 min');
    }
    // Se vuelve a revisar más tarde mientras siga caído o terminado
    celda._timerDirecto = setTimeout(() => {
      if (celda.isConnected && (celda.classList.contains('caido') || celda._estado === 0)) revisarDirecto(celda);
    }, REVISION_DIRECTO_MS);
  } catch (e) {
    avisoDirecto(celda, 'no se pudo revisar el canal: ' + textoError(e));
  } finally {
    celda._revisandoDirecto = false;
  }
}
// Texto extra en el aviso "No disponible" del cuadro (si está caído)
function avisoDirecto(celda, texto) {
  const av = celda.querySelector('.aviso-caido');
  if (!av) return;
  let s = av.querySelector('.directo');
  if (!s) {
    s = document.createElement('span');
    s.className = 'directo';
    av.insertBefore(s, av.querySelector('button'));
  }
  s.textContent = texto ? '📡 ' + texto : '';
}

// Cambia la URL en todas las listas y favoritos, y recarga solo ese cuadro (los demás siguen sin cortarse)
function cambiarDirecto(celda, d) {
  const vieja = celda.dataset.linea;
  const nueva = 'https://www.youtube.com/watch?v=' + d.video;
  // Lo que se sabía de la línea vieja (sobre todo el canal) pasa a la nueva
  config.nombres[clave(nueva)] = Object.assign({}, config.nombres[clave(vieja)], {
    titulo: d.titulo || '', autor: d.autor || '', vivo: true, directo: true, canal: d.canal, t: Date.now()
  });
  const cambios = reemplazarEnConfig(vieja, nueva);
  guardar();
  recargarCelda(celda, nueva);
  pintarSelector();
  mostrarMensaje('📡 Directo actualizado: ' + (d.autor || d.titulo || 'nuevo video') +
                 (cambios > 1 ? ' (en ' + cambios + ' lugares)' : ''));
}
function recargarCelda(celda, linea) {
  const item = parsear(linea);
  const ifr = celda.querySelector('iframe');
  if (!item || !ifr) return;
  clearTimeout(celda._timerDirecto);
  celda.dataset.linea = linea;
  ['_listo', '_videoActual', '_dur', '_durVista', '_durNueva', '_durNuevaVista', '_durAprendida', '_vivoSeguro',
   '_durPrev', '_durIgual', '_estado', '_estadoPrevio', '_canalPedido', '_directoRevisado'].forEach(k => { celda[k] = null; });
  celda._saltoHecho = true;    // es un directo: no se salta a un punto al azar
  celda._eraDirecto = true;
  delete celda.dataset.inicio;
  celda.dataset.thumb = 'https://i.ytimg.com/vi/' + encodeURIComponent(item.id) + '/mqdefault.jpg';
  celda.classList.add('en-vivo');
  quitarCaido(celda);
  const mem = config.nombres[clave(linea)];
  if (mem && mem.titulo) celda.querySelector('.titulo').textContent = mem.titulo;
  if (mem && mem.autor) celda.querySelector('.autor').textContent = mem.autor;
  const muteado = celda.dataset.mute === '1';
  ifr.dataset.src = urlEmbed(item, muteado, !(config.modoAudio && muteado) && !celda._pausadaFS);
  cargarYa(celda);   // carga al tiro (y lo saca de la cola de carga escalonada si aún esperaba)
  pintarFav(celda);
}

// ---------- Botón "📡 Directo actual" en Buscar parecido ----------
async function canalDeCelda(celda) {
  const p = parsear(celda.dataset.linea);
  if (!p) return null;
  if (p.tipo === 'canal') return p.id;
  const k = clave(celda.dataset.linea);
  if (config.nombres[k] && config.nombres[k].canal) return config.nombres[k].canal;
  if (p.tipo !== 'video') return null;
  try {
    const d = await api('video', { id: p.id });
    guardarCanal(k, d);
    return d.canal;
  } catch (e) {
    if (e.message === 'sin servidor') throw e;
    return null;   // el video ya no existe y no se alcanzó a saber su canal
  }
}
async function buscarDirectoActual() {
  const c = celdaBuscar;
  if (!c) return;
  const av = $('avisoBuscar');
  av.classList.remove('ok');
  av.textContent = '📡 Consultando a YouTube…';
  try {
    const canal = await canalDeCelda(c);
    if (celdaBuscar !== c) return;
    if (!canal) { av.textContent = 'No sé de qué canal es este video: busca por nombre con "Buscar en YouTube".'; return; }
    const d = await api('directo', { canal });
    if (celdaBuscar !== c) return;
    if (!d.vivo) { av.textContent = 'El canal no está transmitiendo en vivo ahora.'; return; }
    $('buscarNuevaUrl').value = 'https://www.youtube.com/watch?v=' + d.video;
    av.classList.add('ok');
    av.textContent = '📡 En vivo ahora: ' + (d.titulo || d.video) + ' — elige Reemplazar o Agregar.';
  } catch (e) {
    if (celdaBuscar === c) av.textContent = 'No se pudo: ' + textoError(e) + '.';
  }
}
$('btnBuscarDirecto').addEventListener('click', buscarDirectoActual);
