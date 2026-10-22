// Multi YouTube — urls.js
// Reconocer URLs de YouTube (videos, directos, canales, playlists, Mix) y armar la dirección del reproductor.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Parseo de URLs ----------
function parsear(linea) {
  const s = (linea || '').trim();
  if (!s || s.startsWith('#')) return null;

  // ID pelado de 11 caracteres
  if (/^[\w-]{11}$/.test(s)) return { tipo: 'video', id: s };
  // @handle pelado (por ejemplo "@LofiGirl")
  if (s.startsWith('@')) return canalPorRuta(s.split(/[\/?#\s]/)[0], s);

  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); }
  catch (e) { return { tipo: 'error', original: s }; }

  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  const partes = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' && partes[0]) {
    return { tipo: 'video', id: partes[0], inicio: tiempo(u) };
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    // watch?v=...&list=... se toma como playlist. Los "Mix" de YouTube (list=RD...) se cargan
    // partiendo desde su video, que es como el reproductor incrustado acepta reproducirlos.
    const lst = u.searchParams.get('list');
    if (lst) return { tipo: 'lista', id: lst, video: u.searchParams.get('v') || '', mix: /^RD/.test(lst) };
    if (u.searchParams.get('v')) return { tipo: 'video', id: u.searchParams.get('v'), inicio: tiempo(u) };
    if (['live', 'shorts', 'embed', 'v'].includes(partes[0]) && partes[1]) {
      if (partes[1] === 'live_stream' && u.searchParams.get('channel'))
        return { tipo: 'canal', id: u.searchParams.get('channel') };
      return { tipo: 'video', id: partes[1], inicio: tiempo(u), pistaVivo: partes[0] === 'live' };
    }
    if (partes[0] === 'channel' && partes[1]) return { tipo: 'canal', id: partes[1] };
    if (u.searchParams.get('list')) return { tipo: 'lista', id: u.searchParams.get('list') };
    // youtube.com/@nombre (también /@nombre/live, /streams...), /c/nombre y /user/nombre: canal en vivo
    if (partes[0] && partes[0].startsWith('@')) return canalPorRuta(partes[0], s);
    if (['c', 'user'].includes(partes[0]) && partes[1]) return canalPorRuta(partes[0] + '/' + partes[1], s);
  }
  // Canal de TV por HLS: la dirección termina en .m3u8 (puede traer parámetros)
  if (/^https?:\/\//i.test(s) && /\.m3u8($|[?#])/i.test(u.pathname + u.search)) return { tipo: 'hls', id: s };
  // Cualquier otra dirección http(s):// escrita completa se toma como cámara IP (stream MJPEG o imagen)
  if (/^https?:\/\//i.test(s)) return { tipo: 'camara', id: s };
  return { tipo: 'error', original: s, motivo: 'Solo se aceptan URLs de YouTube o de cámaras (http://…)' };
}

// ---------- @handle → ID del canal ----------
// YouTube no deja incrustar un canal por su @handle: hace falta su ID (UC…). Lo averigua el servidor
// (servidor.py) y queda guardado en config.handles; mientras tanto la línea aparece como "Buscando…".
let estadoRutas = {};   // ruta → 'buscando' | 'fallo' | 'sinServidor' (solo en esta sesión)
function normalizarRuta(ruta) {
  let r = ruta;
  try { r = decodeURIComponent(ruta); } catch (e) { }
  return r.toLowerCase();
}
function canalPorRuta(ruta, original) {
  const k = normalizarRuta(ruta);
  const id = config.handles[k];
  if (id) return { tipo: 'canal', id, ruta: k };
  const est = estadoRutas[k];
  const motivo = est === 'sinServidor' ? 'Los @handle necesitan el servidor: abre la página con iniciar.bat'
               : est && est.startsWith('fallo') ? 'No se pudo usar ' + ruta + ': ' + (est.slice(6) || 'no encontré ese canal')
               : '⏳ Buscando el canal ' + ruta + '…';
  return { tipo: 'error', original, motivo, ruta: k, pendiente: !est || est === 'buscando' };
}

function tiempo(u) {
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  if (!t) return 0;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
}

// Identidad de un video, sin importar cómo se escribió la URL
function clave(linea) {
  const p = parsear(linea);
  return (p && p.tipo !== 'error') ? p.tipo + ':' + p.id : null;
}
function esFav(linea) {
  const k = clave(linea);
  return !!k && config.favoritos.some(f => clave(f) === k);
}
function cantFavs() { return config.favoritos.filter(f => clave(f)).length; }

function urlEmbed(item, muteado, autoplay) {
  const p = new URLSearchParams();
  p.set('autoplay', autoplay ? '1' : '0');
  p.set('mute', muteado ? '1' : '0');
  p.set('playsinline', '1');
  p.set('rel', '0');
  p.set('enablejsapi', '1');
  if (location.origin && location.origin.startsWith('http')) p.set('origin', location.origin);

  if (item.tipo === 'video') {
    const inicio = item.inicio || item.inicioAzar;
    if (inicio) p.set('start', inicio);
    return 'https://www.youtube.com/embed/' + encodeURIComponent(item.id) + '?' + p.toString();
  }
  if (item.tipo === 'canal') {
    p.set('channel', item.id);
    return 'https://www.youtube.com/embed/live_stream?' + p.toString();
  }
  if (item.tipo === 'lista') {
    p.set('list', item.id);
    // Mix (RD...): embed/<video>?list=RD... ; si el mix no trae video, se usa el que va en su nombre (RD + id)
    if (item.mix) {
      const v = item.video || (/^RD[\w-]{11}$/.test(item.id) ? item.id.slice(2) : '');
      if (v) return 'https://www.youtube.com/embed/' + encodeURIComponent(v) + '?' + p.toString();
    }
    return 'https://www.youtube.com/embed/videoseries?' + p.toString();
  }
  return null;
}

function nombreInicial(item, idx) {
  if (item.tipo === 'hls') {
    const t = config.tv[item.tipo + ':' + item.id];
    if (t && t.nombre) return t.nombre;
    try { return 'Canal de TV ' + new URL(item.id).host; } catch (e) { return 'Canal de TV'; }
  }
  if (item.tipo === 'camara') {
    try { return 'Cámara ' + new URL(item.id).host; } catch (e) { return 'Cámara'; }
  }
  if (item.tipo === 'canal') return 'Canal en vivo ' + (item.ruta || item.id);
  if (item.tipo === 'lista') return 'Lista ' + item.id;
  return 'Video ' + (idx + 1) + ' (' + item.id + ')';
}

// ---------- Listas de canales M3U (como tv.m3u8 de TDTChannels) ----------
// Devuelve [{ grupo, nombre, logo, id, urls: [principal, respaldos...] }]: las entradas del mismo canal (mismo
// tvg-id o nombre, dentro del mismo grupo) se juntan en una, con sus direcciones en orden.
function leerM3U(texto) {
  const canales = [], porClave = new Map();
  let ext = null;
  String(texto).split(/\r?\n/).forEach(bruta => {
    const l = bruta.trim();
    if (l.startsWith('#EXTINF')) {
      const atr = n => { const m = l.match(new RegExp(n + '="([^"]*)"')); return m ? m[1] : ''; };
      const coma = l.lastIndexOf(',');
      ext = { grupo: atr('group-title') || 'Sin grupo', nombre: (coma >= 0 ? l.slice(coma + 1) : '').trim() || atr('tvg-name') || 'Canal',
              logo: atr('tvg-logo'), id: atr('tvg-id') };
      return;
    }
    if (!l || l.startsWith('#') || !ext) return;
    if (/^https?:\/\//i.test(l)) {
      const k = ext.grupo + '|' + (ext.id || ext.nombre).toLowerCase();
      let c = porClave.get(k);
      if (!c) { c = Object.assign({ urls: [] }, ext); porClave.set(k, c); canales.push(c); }
      if (!c.urls.includes(l)) c.urls.push(l);
    }
    ext = null;
  });
  return canales;
}
