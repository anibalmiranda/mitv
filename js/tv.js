// Multi YouTube — tv.js
// Canales de TV por HLS (.m3u8), por ejemplo los de la lista tv.m3u8 de TDTChannels.
//  - Cada canal es un <video class="tv"> reproducido con hls.js (js/vendor/hls.min.js). comandoYT también entiende
//    estos videos (silenciar, volumen, reproducir, pausar, ir al en vivo), así que el audio exclusivo, los fundidos,
//    el volumen por canal, la pausa, el modo liviano, el ahorro y el audio de fondo funcionan igual que con YouTube.
//  - Si un canal falla: se prueba a través de servidor.py (/api/hls, para los que el navegador no puede leer directo)
//    y después sus direcciones de respaldo; si nada funciona, el cuadro queda "no disponible" con el motivo.
//  - Importar lista M3U (botón 📺 en el ⚙): cada grupo (group-title) queda como sub-lista "Nombre / Grupo" y, si hay
//    servidor, se revisa cada canal a fondo y los que no funcionan quedan comentados al final con el motivo
//    (se pueden volver a probar con "↺ Revisar descartados" del panel de estado).
// Los datos de cada canal (nombre, grupo, logo, respaldos, si va por el servidor) están en config.tv.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

function infoTv(linea) { return config.tv[clave(linea)] || null; }

// ---------- Reproductor ----------
function crearTv(celda, item) {
  const v = document.createElement('video');
  v.className = 'tv';
  v.muted = true;            // siempre parte silenciado: el navegador no deja partir con sonido sin un clic
  v.playsInline = true;
  v.autoplay = true;
  v.dataset.src = item.id;   // espera su turno en la carga escalonada (cargarIframe → iniciarTv)
  const t = infoTv(item.id);
  if (t && t.logo) celda.dataset.thumb = t.logo;
  celda.classList.add('en-vivo');   // la TV siempre es en vivo
  // "⏳ Cargando canal…" al centro mientras se conecta (y si se queda pegado cargando); se quita con la primera imagen
  const aviso = document.createElement('div');
  aviso.className = 'carga-tv';
  aviso.innerHTML = '<span class="ruedita"></span><span>Cargando canal…</span>';
  celda.appendChild(aviso);
  v.addEventListener('waiting', () => { if (celda._hls || v.getAttribute('src')) celda.classList.add('cargando-tv'); });
  v.addEventListener('playing', () => {
    celda._estado = 1;
    celda.classList.remove('pausado', 'cargando-tv');
    if (celda.classList.contains('caido')) quitarCaido(celda);
    if (!celda._listo) {
      celda._listo = true;
      // Si este canal tiene el audio (y ya hubo un clic), suena con su volumen
      if (celda.dataset.mute === '0' && huboGesto && !fondoActivo) { v.muted = false; v.volume = volumenDe(celda) / 100; }
      if (celda._pausadaFS || (config.modoAudio && celda.dataset.mute === '1')) v.pause();
    }
  });
  v.addEventListener('pause', () => { celda._estado = 2; celda.classList.add('pausado'); celda.classList.remove('cargando-tv'); });
  v.addEventListener('ended', () => { celda._estado = 0; });
  return v;
}

function iniciarTv(celda, video, url) {
  detenerTv(celda, video);
  celda._urlTv = url;
  celda.classList.add('cargando-tv');
  const t = infoTv(celda.dataset.linea) || {};
  const porServidor = (t.proxy || celda._tvProxy) && servidorOk !== false;
  const fuente = porServidor ? '/api/hls?url=' + encodeURIComponent(url) : url;
  if (window.Hls && Hls.isSupported()) {
    // capLevelToPlayerSize: un cuadro chico pide una calidad chica (ahorra conexión); el ampliado, la mejor
    const h = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20, liveSyncDurationCount: 3 });
    h.on(Hls.Events.ERROR, (ev, data) => { if (data.fatal) errorTv(celda, video, data); });
    h.loadSource(fuente);
    h.attachMedia(video);
    celda._hls = h;
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = fuente;   // navegadores con HLS propio
  } else {
    marcarCaido(celda, 'tv', 'este navegador no puede reproducir canales de TV');
    return;
  }
  video.play().catch(() => {});
}
function detenerTv(celda, video) {
  if (celda._hls) { celda._hls.destroy(); celda._hls = null; }
  if (video) { video.removeAttribute('src'); video.load(); }
  celda._listo = false;
  celda.classList.remove('cargando-tv');
}

// Algo falló sin remedio: primero a través del servidor, después la siguiente dirección de respaldo
function errorTv(celda, video, data) {
  if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !celda._recuperado) {   // a veces se arregla solo
    celda._recuperado = true;
    celda._hls.recoverMediaError();
    return;
  }
  const codigo = data.response && data.response.code;
  if (!celda._tvProxy && servidorOk === true && !(infoTv(celda.dataset.linea) || {}).proxy) {
    celda._tvProxy = true;   // quizás el navegador no podía leerlo directo (CORS): se prueba a través del servidor
    iniciarTv(celda, video, celda._urlTv);
    return;
  }
  const t = infoTv(celda.dataset.linea);
  const urls = [celda.dataset.linea].concat((t && t.respaldos) || []);
  const sig = urls[urls.indexOf(celda._urlTv) + 1];
  if (sig) {
    celda._tvProxy = false;
    iniciarTv(celda, video, sig);
    return;
  }
  detenerTv(celda, video);
  const motivo = codigo === 403 ? 'bloqueado (403): por país o sin permiso'
               : codigo === 404 ? 'el canal ya no existe (404)'
               : codigo ? 'el canal respondió ' + codigo : 'el canal no responde';
  marcarCaido(celda, 'tv', motivo);
}

// Lo que comandoYT le pide a un canal de TV (los mismos nombres que el reproductor de YouTube)
function comandoVideo(v, func, args) {
  const celda = v.closest('.celda');
  if (func === 'mute') v.muted = true;
  else if (func === 'unMute') v.muted = false;
  else if (func === 'setVolume') v.volume = Math.min(1, Math.max(0, (args[0] || 0) / 100));
  else if (func === 'playVideo') v.play().catch(() => {});
  else if (func === 'pauseVideo') v.pause();
  else if (func === 'seekTo' && args[0] >= 1e8) irAlVivo(v, celda);
  else if (func === 'seekTo') v.currentTime = args[0];
}
function irAlVivo(v, celda) {
  const h = celda && celda._hls;
  if (h && h.liveSyncPosition) v.currentTime = h.liveSyncPosition;
  else if (v.seekable.length) v.currentTime = Math.max(0, v.seekable.end(v.seekable.length - 1) - 3);
}

// Reproductor suelto (super favorito, audio de fondo): un <video> con su propio hls.js
function videoTvSuelto(url, silenciado) {
  const v = document.createElement('video');
  v.className = 'tv-suelto';
  v.muted = silenciado;
  v.playsInline = true;
  v.autoplay = true;
  const t = infoTv(url) || {};
  const fuente = t.proxy && servidorOk === true ? '/api/hls?url=' + encodeURIComponent(url) : url;
  if (window.Hls && Hls.isSupported()) {
    const h = new Hls({ capLevelToPlayerSize: true });
    h.loadSource(fuente);
    h.attachMedia(v);
    v._hls = h;
  } else v.src = fuente;
  v.play().catch(() => {});
  return v;
}
function quitarVideoSuelto(v) { if (v._hls) v._hls.destroy(); v.remove(); }

// ---------- Importar lista M3U ----------
const fondoTv = $('fondoTv');
let m3uLeida = null;   // { nombreArchivo, canales }

const ESTADOS_TV = {
  ok: '✔ funcionan', bloqueado: '🌍 bloqueados (país o permiso)', autorizacion: '🔒 piden autorización', drm: '🔒 cifrados (DRM)',
  noexiste: '✘ no existen', noresponde: '✘ no responden', publicidad: '⚠ con datos de publicidad sin rellenar',
  error: '✘ otros errores', formato: '⚠ formato no soportado (no son .m3u8 ni YouTube)'
};

function abrirImportarTv() {
  cerrarPanel();
  m3uLeida = null;
  $('tvGrupos').innerHTML = '';
  $('tvAviso').textContent = '';
  $('tvNombre').value = 'TV';
  $('tvComprobar').checked = servidorOk === true;
  $('tvComprobar').disabled = servidorOk !== true;
  $('tvComprobarTexto').textContent = servidorOk === true ? 'Comprobar cada canal y dejar fuera los que no funcionan (1–2 min)'
                                                           : 'Comprobar canales (necesita abrir la página con iniciar.bat)';
  $('btnTvImportar').disabled = true;
  fondoTv.classList.add('abierto');
}
function cerrarImportarTv() { fondoTv.classList.remove('abierto'); }

$('tvArchivo').addEventListener('change', () => {
  const f = $('tvArchivo').files[0];
  if (!f) return;
  const lector = new FileReader();
  lector.onload = () => {
    const canales = leerM3U(String(lector.result));
    if (!canales.length) { $('tvAviso').textContent = 'El archivo no tiene canales (¿es una lista M3U?).'; return; }
    m3uLeida = { canales };
    $('tvNombre').value = f.name.replace(/\.m3u8?$/i, '').replace(/[_-]+/g, ' ').trim().toUpperCase() || 'TV';
    // Un casillero por grupo, con cuántos canales trae
    const grupos = new Map();
    canales.forEach(c => grupos.set(c.grupo, (grupos.get(c.grupo) || 0) + 1));
    const cont = $('tvGrupos');
    cont.innerHTML = '';
    [...grupos].forEach(([g, n]) => {
      const l = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true; cb.value = g;
      l.append(cb, ' ' + g + ' (' + n + ')');
      cont.appendChild(l);
    });
    $('tvAviso').textContent = canales.length + ' canales en ' + grupos.size + ' grupos. Elige cuáles importar.';
    $('btnTvImportar').disabled = false;
  };
  lector.readAsText(f);
});
$('tvTodos').addEventListener('click', e => {
  e.preventDefault();
  const cbs = [...$('tvGrupos').querySelectorAll('input')];
  const marcar = cbs.some(c => !c.checked);
  cbs.forEach(c => { c.checked = marcar; });
});

// Revisa un canal: prueba sus direcciones en orden hasta encontrar una que funcione
async function comprobarCanal(c) {
  let primero = null;
  for (const url of c.urls) {
    if (!/\.m3u8($|[?#])/i.test(url.replace(/^https?:\/\/[^/]+/i, ''))) {
      const p = parsear(url);
      if (p && p.tipo !== 'error' && p.tipo !== 'camara') return { estado: 'ok', url, youtube: true };
      primero = primero || { estado: 'formato', detalle: 'formato no soportado' };
      continue;
    }
    let r;
    try { r = await api('canalhls', { url }); } catch (e) { r = { estado: 'error', detalle: e.message }; }
    if (r.estado === 'ok') return { estado: 'ok', url, proxy: !r.cors };
    primero = primero || r;
  }
  return primero || { estado: 'error', detalle: 'sin direcciones' };
}

$('btnTvImportar').addEventListener('click', async () => {
  if (!m3uLeida) return;
  const base = ($('tvNombre').value.trim() || 'TV').replace(/\s*\/\s*/g, '-');
  const elegidos = new Set([...$('tvGrupos').querySelectorAll('input:checked')].map(c => c.value));
  const canales = m3uLeida.canales.filter(c => elegidos.has(c.grupo));
  if (!canales.length) { $('tvAviso').textContent = 'Elige al menos un grupo.'; return; }
  const comprobar = $('tvComprobar').checked && servidorOk === true;
  $('btnTvImportar').disabled = true;

  // Revisión (varios a la vez: el navegador abre hasta ~6 conexiones con el servidor)
  const resultados = new Map();
  if (comprobar) {
    let hechos = 0, i = 0;
    const trabajador = async () => {
      while (i < canales.length) {
        const c = canales[i++];
        resultados.set(c, await comprobarCanal(c));
        hechos++;
        $('tvAviso').textContent = '🔎 Comprobando canales… ' + hechos + ' / ' + canales.length;
        $('tvBarra').style.width = (100 * hechos / canales.length) + '%';
      }
    };
    await Promise.all([1, 2, 3, 4, 5].map(trabajador));
  }

  // Una sub-lista por grupo: los que funcionan, y al final los descartados comentados con su motivo
  const hoy = new Date().toISOString().slice(0, 10);
  const cuenta = {};
  const porGrupo = new Map();
  canales.forEach(c => {
    const r = comprobar ? resultados.get(c) : { estado: 'ok', url: c.urls[0] };
    cuenta[r.estado] = (cuenta[r.estado] || 0) + 1;
    if (!porGrupo.has(c.grupo)) porGrupo.set(c.grupo, { lineas: [], descartes: [] });
    const g = porGrupo.get(c.grupo);
    if (r.estado === 'ok') {
      g.lineas.push(r.url);
      if (!r.youtube) {
        config.tv[clave(r.url)] = { nombre: c.nombre, grupo: c.grupo, logo: c.logo,
                                    respaldos: c.urls.filter(u => u !== r.url), proxy: !!r.proxy };
      }
    } else {
      g.descartes.push('# ✘ ' + hoy + ' ' + (r.detalle || ESTADOS_TV[r.estado] || r.estado) + ' · ' + c.nombre + ' · ' + c.urls[0]);
      config.tv[clave(c.urls[0])] = { nombre: c.nombre, grupo: c.grupo, logo: c.logo, respaldos: c.urls.slice(1), proxy: false };
    }
  });
  let primera = null;
  porGrupo.forEach((g, grupo) => {
    const nombre = base + ' / ' + grupo.replace(/\s*\/\s*/g, '-');
    config.listas[nombre] = g.lineas.concat(g.descartes);
    if (!primera && g.lineas.length) primera = nombre;
  });
  if (primera) { config.vistaFav = false; config.actual = primera; }
  guardar();
  render(true);
  pintarSelector();
  $('btnTvImportar').disabled = false;
  $('tvBarra').style.width = '0';
  $('tvAviso').textContent = '✔ Importado: ' + porGrupo.size + ' sub-lista(s) en "' + base + '". ' +
    Object.entries(cuenta).map(([e, n]) => (ESTADOS_TV[e] || e) + ': ' + n).join(' · ') +
    (comprobar ? '. Los descartados quedan comentados al final de cada sub-lista.' : '.');
});
$('btnTvCerrar').addEventListener('click', cerrarImportarTv);
fondoTv.addEventListener('click', e => { if (e.target === fondoTv) cerrarImportarTv(); });
$('btnImportarTv').addEventListener('click', abrirImportarTv);
