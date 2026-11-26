// Multi YouTube — buscar.js
// "Buscar parecido": cuando un video o directo deja de funcionar (o cambió de URL), busca en YouTube por el
// nombre que tenía registrado y permite reemplazar la URL en todas las listas y favoritos de una vez.
// También marca los cuadros cuyo video ya no está disponible.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const fondoBuscar = $('fondoBuscar');
let celdaBuscar = null;

// Códigos de error del reproductor de YouTube
const ERRORES_YT = {
  2: 'la URL no es válida',
  5: 'el reproductor no pudo cargarlo',
  100: 'el video no existe, fue eliminado o es privado',
  101: 'el dueño no permite verlo fuera de YouTube',
  150: 'el dueño no permite verlo fuera de YouTube',
  153: 'falta el origen (abre la página desde localhost)',
  camara: 'la cámara no responde; se reintenta cada 15 s'
};

// ---------- Cuadro caído ----------
// texto (opcional): motivo concreto en vez del genérico del código (p. ej. lo que respondió la cámara)
function marcarCaido(celda, codigo, texto) {
  // 101 / 150: el video existe, pero su dueño no deja verlo fuera de YouTube (externos.js)
  if (codigo === 101 || codigo === 150) { marcarExterno(celda); return; }
  celda.classList.add('caido');
  const motivo = texto || ERRORES_YT[codigo] || ('error ' + codigo);
  let av = celda.querySelector('.aviso-caido');
  if (!av) {
    av = document.createElement('div');
    av.className = 'aviso-caido';
    av.innerHTML = '<b>⚠ No disponible</b><span class="motivo"></span><span class="nombre"></span>' +
                   '<button type="button">🔍 Buscar parecido</button>';
    av.querySelector('button').addEventListener('click', e => { e.stopPropagation(); abrirBuscar(celda); });
    ['pointerdown', 'dblclick'].forEach(ev => av.addEventListener(ev, e => e.stopPropagation()));
    celda.appendChild(av);
  }
  av.querySelector('.motivo').textContent = motivo;
  const mem = config.nombres[clave(celda.dataset.linea)];
  av.querySelector('.nombre').textContent = mem ? [mem.titulo, mem.autor].filter(Boolean).join(' — ') : '';
  const est = celda.querySelector('.fila-audio .estado');
  if (est) est.textContent = '⚠ no disponible';
  revisarDirecto(celda);   // si era un directo, quizás el canal sigue en vivo con otra URL (directos.js)
}
function quitarCaido(celda) {
  celda.classList.remove('caido');
  const av = celda.querySelector('.aviso-caido');
  if (av) av.remove();
  pintarAudio(celda);
}

// ---------- Qué buscar ----------
// Los nombres de relleno ("Video 3 (id)", "Canal en vivo UC...", "Lista PL...") no sirven para buscar
function esNombreDeRelleno(t) {
  return !t || /^Video \d+ \(/.test(t) || /^Canal en vivo UC/.test(t) || /^Lista [\w-]+$/.test(t);
}
// Qué buscar: TODAS las palabras del título (cada una cuenta como palabra clave) más el canal, sin lo que cambia
// todos los días en un directo (emojis, "EN VIVO", "LIVE", "24/7", fechas) ni signos, y sin repetir palabras.
// "EarthCam Live: Abbey Road Crossing (London, England)" — EarthCam → "EarthCam Abbey Road Crossing London England"
function limpiarParaBuscar(t) {
  return (t || '')
    .replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, ' ')
    .replace(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/g, ' ')
    .replace(/(^|[^\p{L}\p{N}])(en vivo|en directo|live stream|livestream|live cam|live|24\/7|24h|24 horas|señal en vivo|transmisión en vivo|directo)(?=$|[^\p{L}\p{N}])/giu, '$1 ')
    .replace(/[^\p{L}\p{N}'&+.]+/gu, ' ')
    .replace(/(^|\s)[.']+|[.']+(?=\s|$)/g, ' ');
}
function palabrasClave(titulo, autor) {
  const vistas = new Set(), palabras = [];
  (limpiarParaBuscar(titulo) + ' ' + limpiarParaBuscar(autor)).split(/\s+/).forEach(p => {
    const k = p.toLowerCase();
    if (p && !vistas.has(k)) { vistas.add(k); palabras.push(p); }
  });
  return palabras.join(' ').slice(0, 150).trim();
}
function datosBusqueda(celda) {
  const mem = config.nombres[clave(celda.dataset.linea)] || {};
  const tituloVisible = (celda.querySelector('.titulo') || {}).textContent || '';
  const autorVisible = (celda.querySelector('.autor') || {}).textContent || '';
  const titulo = mem.titulo || (esNombreDeRelleno(tituloVisible) ? '' : tituloVisible);
  const autor = mem.autor || autorVisible;
  const vivo = !!mem.vivo || celda.classList.contains('en-vivo') || celda.dataset.tipo === 'canal';
  return { titulo, autor, vivo, consulta: palabrasClave(titulo, autor) };
}
function urlOriginal(linea) {
  const p = parsear(linea);
  if (!p || p.tipo === 'error') return '';
  if (p.tipo === 'video') return 'https://www.youtube.com/watch?v=' + encodeURIComponent(p.id);
  if (p.tipo === 'canal') return 'https://www.youtube.com/channel/' + encodeURIComponent(p.id) + '/streams';
  if (p.tipo === 'lista') return 'https://www.youtube.com/playlist?list=' + encodeURIComponent(p.id);
  return '';
}

// ---------- Ventana ----------
// 🔍 de arriba (o la tecla /): la misma búsqueda, sin un cuadro de partida; lo elegido se agrega a la lista que elijas
let buscarGlobal = false;
let ultimaListaBuscar = '';   // a la que se agregó la última vez: al volver a abrir sigue elegida
function modoBuscar(global) {
  buscarGlobal = global;
  $('tituloBuscar').textContent = global ? '🔍 Buscar en YouTube' : '🔍 Buscar parecido en YouTube';
  $('buscarOriginal').hidden = global;
  $('buscarDestino').hidden = !global;
  $('btnBuscarDirecto').hidden = global;
  $('btnBuscarReemplazar').hidden = global;
  $('btnBuscarAgregar').title = global ? 'Agrega la URL al final de la lista elegida arriba'
                                       : 'Deja este video y agrega el nuevo justo después, en la lista que estás viendo';
}
function abrirBuscarGlobal() {
  modoBuscar(true);
  celdaBuscar = null;
  const sel = $('buscarLista');
  sel.innerHTML = '';
  Object.keys(config.listas).forEach(n => sel.appendChild(new Option(n, n)));
  sel.value = config.listas[ultimaListaBuscar] ? ultimaListaBuscar : config.actual;
  $('buscarNuevaUrl').value = '';
  $('avisoBuscar').textContent = '';
  $('avisoBuscar').classList.remove('ok');
  $('buscarCanalBloque').hidden = true;
  canalN++;
  if (!$('buscarTexto').value.trim()) $('buscarResultados').innerHTML = '';
  fondoBuscar.classList.add('abierto');
  setTimeout(() => { $('buscarTexto').focus(); $('buscarTexto').select(); }, 50);
}

function abrirBuscar(celda) {
  modoBuscar(false);
  celdaBuscar = celda;
  const d = datosBusqueda(celda);
  const orig = $('buscarOriginal');
  orig.innerHTML = '';
  orig.appendChild(document.createTextNode('Registrado como: '));
  const b = document.createElement('b');
  b.textContent = [d.titulo, d.autor].filter(Boolean).join(' — ') || '(sin nombre guardado: escribe qué buscar)';
  orig.appendChild(b);
  const url = urlOriginal(celda.dataset.linea);
  if (url) {
    orig.appendChild(document.createTextNode(' · '));
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = celda.dataset.tipo === 'canal' ? 'ver el canal ↗' : 'abrir original ↗';
    orig.appendChild(a);
  }
  $('buscarTexto').value = d.consulta;
  $('buscarSoloVivo').checked = d.vivo;
  $('buscarNuevaUrl').value = '';
  $('avisoBuscar').textContent = '';
  $('avisoBuscar').classList.remove('ok');
  $('buscarResultados').innerHTML = '';
  fondoBuscar.classList.add('abierto');
  setTimeout(() => { $('buscarTexto').focus(); $('buscarTexto').select(); }, 50);
  if (d.consulta) buscarAqui();   // busca solo al abrir, con lo que tenía registrado
  buscarVivosDelCanal(celda, d);
}
function cerrarBuscar() {
  fondoBuscar.classList.remove('abierto');
  celdaBuscar = null;
  buscarGlobal = false;
  busquedaN++;   // si quedó una búsqueda en curso, su respuesta ya no se muestra
  canalN++;
}

// ---------- Lo que su canal transmite en vivo ahora ----------
// Si es un directo (o un canal en vivo), arriba se muestran todos los directos de ese mismo canal (un canal puede
// transmitir varias cámaras a la vez), aunque también salgan en la búsqueda de abajo.
let canalN = 0;
async function buscarVivosDelCanal(celda, d) {
  const n = ++canalN;
  const bloque = $('buscarCanalBloque'), cont = $('buscarCanal');
  bloque.hidden = true;
  cont.innerHTML = '';
  if (!d.vivo) return;
  const p = parsear(celda.dataset.linea);
  let canal = p && p.tipo === 'canal' ? p.id : (config.nombres[clave(celda.dataset.linea)] || {}).canal;
  const vigente = () => n === canalN && celdaBuscar === celda;
  try {
    if (!canal && p && p.tipo === 'video') canal = (await api('video', { id: p.id })).canal;
    if (!vigente() || !canal) return;
    $('buscarCanalTitulo').textContent = '📡 En vivo ahora en ' + (d.autor || 'su canal');
    bloque.hidden = false;
    avisoEnCaja('⏳ Revisando qué transmite el canal y los permisos…', cont);
    const r = await api('vivoscanal', { canal });
    if (!vigente()) return;
    pintarResultados(r.resultados || [], true, cont, { autor: d.autor, vacio: 'El canal no está transmitiendo en vivo ahora.' });
  } catch (e) {
    if (!vigente() || bloque.hidden) return;
    avisoEnCaja('No se pudo revisar el canal: ' + textoError(e) + '.', cont);
  }
}
// "ver más en YouTube ↗": los resultados completos en otra pestaña (copias la URL y la pegas abajo)
function buscarEnYouTube() {
  const q = $('buscarTexto').value.trim();
  if (!q) { $('avisoBuscar').textContent = 'Escribe qué buscar.'; return; }
  let url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  if ($('buscarSoloVivo').checked) url += '&sp=EgJAAQ%253D%253D';   // filtro "En vivo" de YouTube
  window.open(url, '_blank', 'noopener');
  $('avisoBuscar').classList.add('ok');
  $('avisoBuscar').textContent = 'Resultados abiertos en otra pestaña. Copia la URL que te sirva, pégala abajo y elige Reemplazar o Agregar.';
  setTimeout(() => $('buscarNuevaUrl').focus(), 50);
}

// ---------- Búsqueda aquí mismo (servidor.py) ----------
// Muestra los primeros 25 resultados como miniaturas, con EN VIVO y si el dueño permite verlo fuera de YouTube.
// Un clic lo elige (queda su URL abajo), doble clic lo reemplaza al tiro. Los bloqueados no se pueden elegir.
let busquedaN = 0;
function avisoEnCaja(texto, cont) {
  cont = cont || $('buscarResultados');
  cont.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'buscando';
  d.textContent = texto;
  cont.appendChild(d);
}
async function buscarAqui() {
  const q = $('buscarTexto').value.trim();
  const av = $('avisoBuscar');
  av.classList.remove('ok');
  av.textContent = '';
  if (!q) { av.textContent = 'Escribe qué buscar.'; return; }
  const n = ++busquedaN;
  const vivo = $('buscarSoloVivo').checked;
  avisoEnCaja('⏳ Buscando "' + q + '"' + (vivo ? ' (solo en vivo)' : '') + ' y revisando los permisos…');
  let d;
  try { d = await api('buscar', { q, vivo: vivo ? '1' : '0' }); }
  catch (e) {
    if (n !== busquedaN) return;
    $('buscarResultados').innerHTML = '';
    av.textContent = 'No se pudo buscar aquí: ' + textoError(e) + '. Usa "ver más en YouTube ↗".';
    return;
  }
  if (n !== busquedaN || (!celdaBuscar && !buscarGlobal)) return;
  pintarResultados(d.resultados || [], vivo);
}
// cont: dónde (la búsqueda o los directos del canal); op.autor: el canal si el resultado no lo trae; op.vacio: aviso sin resultados
function pintarResultados(lista, vivo, cont, op) {
  cont = cont || $('buscarResultados');
  op = op || {};
  if (!lista.length) { avisoEnCaja(op.vacio || ('No encontré nada' + (vivo ? ' transmitiendo en vivo' : '') + '. Prueba con otras palabras.'), cont); return; }
  cont.innerHTML = '';
  const kActual = celdaBuscar ? clave(celdaBuscar.dataset.linea) : null;
  const enDestino = buscarGlobal ? new Set((config.listas[$('buscarLista').value] || []).map(clave).filter(Boolean)) : new Set();
  lista.forEach(v => {
    const url = 'https://www.youtube.com/watch?v=' + v.id;
    const it = document.createElement('button');
    it.type = 'button';
    it.className = 'resultado' + (v.incrustable === false ? ' bloqueado' : '');
    const th = document.createElement('div');
    th.className = 'thumb';
    const img = document.createElement('img');
    img.src = v.miniatura;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    th.appendChild(img);
    if (v.vivo) { const b = document.createElement('span'); b.className = 'etq-vivo'; b.textContent = 'EN VIVO'; th.appendChild(b); }
    if (clave(url) === kActual) { const b = document.createElement('span'); b.className = 'es-actual'; b.textContent = 'el que tienes'; th.appendChild(b); }
    else if (enDestino.has(clave(url))) { const b = document.createElement('span'); b.className = 'es-actual'; b.textContent = 'ya está en la lista'; th.appendChild(b); }
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = v.titulo;
    const a = document.createElement('div');
    a.className = 'a';
    a.textContent = [v.canal || op.autor, v.detalle].filter(Boolean).join(' · ');
    const perm = document.createElement('div');
    perm.className = 'permiso';
    perm.textContent = v.incrustable === true ? '✅ Se puede ver aquí' : v.incrustable === false ? '🔒 Solo en YouTube (bloqueado por el dueño)'
                                                                     : '❔ No se pudo revisar el permiso';
    it.append(th, t, a, perm);
    it.title = v.titulo + (v.canal ? ' — ' + v.canal : '');
    it.dataset.url = url;
    const elegir = (dobleClic) => {
      const av = $('avisoBuscar');
      if (v.incrustable === false) {
        av.classList.remove('ok');
        av.textContent = 'El dueño de ese video no permite verlo fuera de YouTube: elige otro.';
        return false;
      }
      // Clic marca / desmarca (se pueden marcar varios); + Agregar los suma todos. Reemplazar usa uno solo.
      if (dobleClic !== true) it.classList.toggle('elegido');
      else it.classList.add('elegido');
      const n = marcados().length;
      av.classList.toggle('ok', n > 0);
      av.textContent = !n ? '' : n === 1 && !buscarGlobal
        ? '✔ Elegido: ' + v.titulo + '. Marca más para agregar varios, o Reemplazar / + Agregar a la lista.'
        : '✔ ' + n + ' elegido(s). Marca más o aprieta + Agregar a la lista' + (buscarGlobal ? ' (o doble clic).' : ' (Reemplazar es con uno solo).');
      if (it.classList.contains('elegido')) copiarTexto(url);
      return true;
    };
    it.addEventListener('click', () => elegir());
    it.addEventListener('dblclick', () => {
      if (buscarGlobal) { if (elegir(true)) agregarUrl(); return; }
      // doble clic en un cuadro: reemplaza con ese (solo ese)
      if (v.incrustable === false) { elegir(); return; }
      cont.closest('#panelBuscar').querySelectorAll('.resultado.elegido').forEach(x => x.classList.remove('elegido'));
      it.classList.add('elegido');
      reemplazarUrl();
    });
    cont.appendChild(it);
  });
}

// Cambia la línea vieja por la nueva en TODAS las listas y en favoritos (mismo video = misma clave).
// El "último seleccionado" y el volumen ajustado pasan al nuevo. Devuelve cuántos lugares cambió (no guarda).
function reemplazarEnConfig(vieja, nueva) {
  const kVieja = clave(vieja);
  let cambios = 0;
  const cambiar = arr => arr.map(l => {
    if (l === vieja || (kVieja && clave(l) === kVieja)) { cambios++; return nueva; }
    return l;
  });
  Object.keys(config.listas).forEach(n => { config.listas[n] = cambiar(config.listas[n]); });
  config.favoritos = cambiar(config.favoritos);
  Object.values(config.ultimos).forEach(u => { if (u && u.clave === kVieja) u.clave = clave(nueva); });
  const kNueva = clave(nueva);
  if (kVieja && kNueva && config.volumenes[kVieja] != null && config.volumenes[kNueva] == null)
    config.volumenes[kNueva] = config.volumenes[kVieja];   // el volumen ajustado sigue con la URL nueva
  superFavReemplazado(vieja, nueva);
  fondoReemplazado(vieja, nueva);
  return cambios;
}

function marcados() { return [...$('panelBuscar').querySelectorAll('.resultado.elegido')].map(x => x.dataset.url); }
// Reemplaza la URL vieja por la nueva (la marcada o la pegada; una sola) en todas las listas y favoritos
function reemplazarUrl() {
  if (!celdaBuscar) return;
  const pegada = $('buscarNuevaUrl').value.trim(), m = marcados();
  if (m.length + (pegada ? 1 : 0) > 1) {
    $('avisoBuscar').classList.remove('ok');
    $('avisoBuscar').textContent = 'Para reemplazar elige uno solo (con varios marcados usa + Agregar a la lista).';
    return;
  }
  const nueva = pegada || m[0] || '';
  const p = parsear(nueva);
  if (!p || p.tipo === 'error') {
    $('avisoBuscar').classList.remove('ok');
    $('avisoBuscar').textContent = 'Esa URL no es de YouTube o no la reconozco.';
    return;
  }
  const vieja = celdaBuscar.dataset.linea;
  const kVieja = clave(vieja);
  if (clave(nueva) === kVieja) {
    $('avisoBuscar').classList.remove('ok');
    $('avisoBuscar').textContent = 'Es la misma URL que ya tenías.';
    return;
  }
  const cambios = reemplazarEnConfig(vieja, nueva);
  // La vista actual se reescribe además según el orden que tiene en pantalla
  fijarFuente(conComentarios(celdas.map(c => clave(c.dataset.linea) === kVieja ? nueva : c.dataset.linea), l => l === nueva ? kVieja : (clave(l) || l)));
  guardar();
  cerrarBuscar();
  render(true);
  pintarSelector();
  mostrarMensaje('🔁 URL reemplazada' + (cambios > 1 ? ' en ' + cambios + ' lugares (listas y favoritos)' : ''));
}

// Lo marcado (y la URL pegada abajo) para agregar: { urls } o { error }
function paraAgregar() {
  const urls = marcados();
  const pegada = $('buscarNuevaUrl').value.trim();
  if (pegada) {
    const p = parsear(pegada);
    if (!p || p.tipo === 'error') return { error: 'La URL pegada no la reconozco.' };
    urls.push(pegada);
  }
  return urls.length ? { urls } : { error: 'Marca uno o más resultados (clic) o pega una URL.' };
}
// Después de agregar, la ventana queda abierta para seguir agregando: lo agregado queda marcado "ya está en la lista"
function agregados(texto) {
  $('panelBuscar').querySelectorAll('.resultado.elegido').forEach(it => {
    const th = it.querySelector('.thumb');
    if (th && !th.querySelector('.es-actual')) { const b = document.createElement('span'); b.className = 'es-actual'; b.textContent = 'ya está en la lista'; th.appendChild(b); }
    it.classList.remove('elegido');
  });
  $('buscarNuevaUrl').value = '';
  const av = $('avisoBuscar');
  av.classList.add('ok');
  av.textContent = texto + ' Puedes seguir marcando y agregando; Cerrar cuando termines.';
}
const textoRepetidos = r => r ? ' (' + r + ' ya estaba' + (r > 1 ? 'n' : '') + ')' : '';

// Desde el 🔍 de un cuadro: justo después del original, en la lista que se está viendo (o en favoritos, si queda cupo)
function agregarUrl() {
  if (buscarGlobal) { agregarAListaElegida(); return; }
  if (!celdaBuscar) return;
  const av = $('avisoBuscar');
  av.classList.remove('ok');
  const sel = paraAgregar();
  if (sel.error) { av.textContent = sel.error; return; }
  const nuevas = [];
  sel.urls.forEach(u => { if (![...celdas.map(c => c.dataset.linea), ...nuevas].some(l => clave(l) === clave(u))) nuevas.push(u); });
  if (!nuevas.length) { av.textContent = (sel.urls.length > 1 ? 'Ya están todos' : 'Ya está') + ' en esta lista.'; return; }
  if (config.vistaFav && cantFavs() + nuevas.length > MAX_FAV) { av.textContent = 'No caben en favoritos (máximo ' + MAX_FAV + '): quita alguno o usa Reemplazar.'; return; }
  const kOrig = clave(celdaBuscar.dataset.linea);
  const orden = celdas.map(c => c.dataset.linea);
  const i = orden.findIndex(l => clave(l) === kOrig);
  orden.splice(i >= 0 ? i + 1 : orden.length, 0, ...nuevas);
  fijarFuente(conComentarios(orden));
  guardar();
  render(true);
  pintarSelector();
  const destino = config.vistaFav ? 'favoritos' : '"' + config.actual + '"';
  agregados('➕ ' + (nuevas.length > 1 ? nuevas.length + ' agregados' : 'Agregado') + ' a ' + destino + ', después del original' + textoRepetidos(sel.urls.length - nuevas.length) + '.');
}

// Búsqueda global (🔍 de arriba o /): al final de la lista elegida, sin repetir
function agregarAListaElegida() {
  const av = $('avisoBuscar');
  av.classList.remove('ok');
  const sel = paraAgregar();
  if (sel.error) { av.textContent = sel.error; return; }
  const nombre = $('buscarLista').value;
  const lista = config.listas[nombre];
  if (!lista) return;
  const nuevas = [];
  sel.urls.forEach(u => { if (![...lista, ...nuevas].some(l => clave(l) === clave(u))) nuevas.push(u); });
  if (!nuevas.length) { av.textContent = (sel.urls.length > 1 ? 'Ya están todos' : 'Ya está') + ' en la lista "' + nombre + '".'; return; }
  lista.push(...nuevas);
  ultimaListaBuscar = nombre;
  guardar();
  if (nombre === config.actual && !config.vistaFav) render(true);
  pintarSelector();
  agregados('➕ ' + (nuevas.length > 1 ? nuevas.length + ' agregados' : 'Agregado') + ' al final de "' + nombre + '"' + textoRepetidos(sel.urls.length - nuevas.length) + '.');
}

$('btnBuscarGlobal').addEventListener('click', abrirBuscarGlobal);
$('btnBuscarYT').addEventListener('click', buscarAqui);
$('buscarAbrirYT').addEventListener('click', e => { e.preventDefault(); buscarEnYouTube(); });
$('buscarSoloVivo').addEventListener('change', () => { if ($('buscarTexto').value.trim()) buscarAqui(); });
$('btnBuscarReemplazar').addEventListener('click', reemplazarUrl);
$('btnBuscarAgregar').addEventListener('click', agregarUrl);
$('btnBuscarCerrar').addEventListener('click', cerrarBuscar);
fondoBuscar.addEventListener('click', e => { if (e.target === fondoBuscar) cerrarBuscar(); });
$('buscarTexto').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarAqui(); } });
$('buscarNuevaUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (buscarGlobal ? agregarUrl : reemplazarUrl)(); } });
$('buscarLista').addEventListener('change', () => { if ($('buscarResultados').querySelector('.resultado')) buscarAqui(); });
