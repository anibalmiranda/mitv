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
// Saca de un título de directo lo que cambia todos los días (emojis, "EN VIVO", fechas, "24/7"...)
function limpiarTitulo(t) {
  return (t || '')
    .replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, ' ')
    .replace(/\b(en vivo|en directo|directo|live|live stream|24\/7|24 horas|señal en vivo|transmisión en vivo)\b/gi, ' ')
    .replace(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/g, ' ')
    .split(/\s[|•·]\s|\s-\s/)[0]
    .replace(/[|•·#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function datosBusqueda(celda) {
  const mem = config.nombres[clave(celda.dataset.linea)] || {};
  const tituloVisible = (celda.querySelector('.titulo') || {}).textContent || '';
  const autorVisible = (celda.querySelector('.autor') || {}).textContent || '';
  const titulo = mem.titulo || (esNombreDeRelleno(tituloVisible) ? '' : tituloVisible);
  const autor = mem.autor || autorVisible;
  const vivo = !!mem.vivo || celda.classList.contains('en-vivo') || celda.dataset.tipo === 'canal';
  let consulta;
  if (vivo) consulta = autor ? autor + ' en vivo' : limpiarTitulo(titulo);   // el canal es lo que no cambia
  else consulta = titulo || autor;
  return { titulo, autor, vivo, consulta: (consulta || '').trim() };
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
function abrirBuscar(celda) {
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
  fondoBuscar.classList.add('abierto');
  setTimeout(() => { $('buscarTexto').focus(); $('buscarTexto').select(); }, 50);
}
function cerrarBuscar() {
  fondoBuscar.classList.remove('abierto');
  celdaBuscar = null;
}
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
  return cambios;
}

// Reemplaza la URL vieja por la nueva en todas las listas y favoritos
function reemplazarUrl() {
  if (!celdaBuscar) return;
  const nueva = $('buscarNuevaUrl').value.trim();
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
  fijarFuente(celdas.map(c => c === celdaBuscar ? nueva : c.dataset.linea).concat(comentarios));
  guardar();
  cerrarBuscar();
  render();
  pintarSelector();
  mostrarMensaje('🔁 URL reemplazada' + (cambios > 1 ? ' en ' + cambios + ' lugares (listas y favoritos)' : ''));
}

// Agrega la URL nueva justo después del video actual, en la lista que se está viendo (el original se mantiene).
// En la vista de favoritos la agrega a favoritos, si queda cupo.
function agregarUrl() {
  if (!celdaBuscar) return;
  const nueva = $('buscarNuevaUrl').value.trim();
  const p = parsear(nueva);
  const av = $('avisoBuscar');
  av.classList.remove('ok');
  if (!p || p.tipo === 'error') { av.textContent = 'Esa URL no es de YouTube o no la reconozco.'; return; }
  const kNueva = clave(nueva);
  if (celdas.some(c => clave(c.dataset.linea) === kNueva)) { av.textContent = 'Ese video ya está en esta lista.'; return; }
  if (config.vistaFav && cantFavs() >= MAX_FAV) { av.textContent = 'Favoritos está lleno (máximo ' + MAX_FAV + '): quita uno o usa Reemplazar.'; return; }
  const orden = celdas.map(c => c.dataset.linea);
  orden.splice(celdas.indexOf(celdaBuscar) + 1, 0, nueva);
  fijarFuente(orden.concat(comentarios));
  guardar();
  const destino = config.vistaFav ? 'favoritos' : 'la lista "' + config.actual + '"';
  cerrarBuscar();
  render();
  pintarSelector();
  mostrarMensaje('➕ Agregado a ' + destino + ', justo después del original');
}

$('btnBuscarYT').addEventListener('click', buscarEnYouTube);
$('btnBuscarReemplazar').addEventListener('click', reemplazarUrl);
$('btnBuscarAgregar').addEventListener('click', agregarUrl);
$('btnBuscarCerrar').addEventListener('click', cerrarBuscar);
fondoBuscar.addEventListener('click', e => { if (e.target === fondoBuscar) cerrarBuscar(); });
$('buscarTexto').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarEnYouTube(); } });
$('buscarNuevaUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); reemplazarUrl(); } });
