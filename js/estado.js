// Multi YouTube — estado.js
// 1) Panel de estado de la lista (botón 📋 en el ⚙ o tecla E): de una vez, qué cuadros de la vista funcionan, cuáles
//    están en vivo, caídos, bloqueados fuera de YouTube, dormidos o con la URL mal escrita, con acciones por fila
//    (ir, buscar parecido, buscar el directo actual) y "Revisar directos ahora" (la revisión de directos.js).
// 2) Aviso si la lectura de YouTube deja de funcionar: servidor.py la vigila (/api/salud) y aquí se muestra un aviso
//    arriba al centro mientras falle (la búsqueda de directos y los @handle dependen de ella).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const fondoEstado = $('fondoEstado');
const CONSULTA_SALUD_MS = 10 * 60000;
let saludActual = null;          // última respuesta de /api/salud
let avisoSaludCerrado = null;    // 'desde' del aviso que cerraste (vuelve a salir si cambia el problema)
let timerEstado = null;

const horaCorta = seg => seg ? new Date(seg * 1000).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';

// ---------- Salud de la lectura de YouTube ----------
async function consultarSalud(revisarAhora) {
  if (servidorOk !== true) { pintarSalud(); return; }
  try { saludActual = await api('salud', revisarAhora ? { revisar: '1' } : {}); }
  catch (e) { saludActual = null; }
  pintarSalud();
}
function textoSalud() {
  if (servidorOk !== true) return { malo: false, texto: 'Sin servidor: la búsqueda de directos y los @handle necesitan abrir la página con iniciar.bat' };
  const s = saludActual;
  if (!s || s.estado === 'desconocido') return { malo: false, texto: '⏳ Revisando la lectura de YouTube…' };
  if (s.estado === 'ok') return { malo: false, texto: '✔ La lectura de YouTube funciona (revisada a las ' + horaCorta(s.revisado) + ')' };
  if (s.estado === 'sin_conexion') return { malo: true, texto: '⚠ Sin conexión con YouTube desde las ' + horaCorta(s.desde) + ': no se pueden buscar directos ni @handle' };
  return { malo: true, texto: '⚠ La lectura de YouTube falla desde las ' + horaCorta(s.desde) + ': ' + (s.detalle || 'error') +
                             '. La búsqueda de directos y los @handle no funcionan hasta ajustar servidor.py' };
}
function pintarSalud() {
  const t = textoSalud();
  const linea = $('estadoLectura');
  if (linea) { linea.textContent = t.texto; linea.classList.toggle('malo', t.malo); }
  const av = $('avisoSistema');
  const mostrar = t.malo && saludActual && avisoSaludCerrado !== saludActual.desde;
  av.classList.toggle('visible', !!mostrar);
  if (mostrar) av.querySelector('.texto').textContent = t.texto;
}
$('avisoSistema').querySelector('button').addEventListener('click', () => {
  avisoSaludCerrado = saludActual && saludActual.desde;
  pintarSalud();
});
setInterval(() => consultarSalud(), CONSULTA_SALUD_MS);

// ---------- Panel de estado ----------
function estadoDeCelda(c) {
  const p = parsear(c.dataset.linea);
  if (c.classList.contains('error')) {
    if (p && p.pendiente) return ['⏳', 'buscando el canal…', ''];
    return ['❌', (p && p.motivo) || 'URL no reconocida', 'malo'];
  }
  if (c._externo) return ['🔒', 'el dueño solo permite verlo en YouTube', 'malo'];
  if (c.classList.contains('caido')) {
    const av = c.querySelector('.aviso-caido');
    const motivo = av ? [av.querySelector('.motivo'), av.querySelector('.directo')].filter(x => x && x.textContent).map(x => x.textContent).join(' · ') : '';
    return ['⚠', motivo || 'no disponible', 'malo'];
  }
  if (c.dataset.tipo === 'camara') return c._conectada ? ['📷', 'conectada' + (c._modoCam === 'servidor' ? ' (a través del servidor)' : ''), 'bien']
                                                       : ['📷', 'desconectada mientras no se ve', ''];
  if (c.classList.contains('dormida')) return ['💤', enAhorro ? 'descargado por el ahorro (sin actividad)' : 'dormido (modo liviano)', ''];
  if (c.classList.contains('esperando')) return ['⏳', 'esperando su turno para cargar', ''];
  if (!c._listo) return ['⏳', 'cargando', ''];
  if (c._estado === 0) return ['⏹', c.classList.contains('en-vivo') ? 'el directo terminó' : 'terminó', 'malo'];
  if (c.classList.contains('pausado') || c._pausadaFS) return ['⏸', 'en pausa' + (c._pausadaFS ? ' (no se ve)' : ''), ''];
  return ['▶', 'funcionando', 'bien'];
}

function armarEstado() {
  const tabla = $('estadoTabla');
  tabla.innerHTML = '';
  const cuenta = { total: 0, bien: 0, vivo: 0, malo: 0 };
  celdas.forEach((c, i) => {
    const [icono, texto, clase] = estadoDeCelda(c);
    cuenta.total++;
    if (clase === 'bien') cuenta.bien++;
    if (clase === 'malo') cuenta.malo++;
    if (c.classList.contains('en-vivo')) cuenta.vivo++;

    const fila = document.createElement('div');
    fila.className = 'estado-fila ' + clase;
    const num = document.createElement('span');
    num.className = 'n';
    num.textContent = i + 1;
    const nom = document.createElement('div');
    nom.className = 'nombre';
    const tit = c.querySelector('.titulo'), aut = c.querySelector('.autor');
    const marcas = (c.classList.contains('en-vivo') ? '🔴 ' : '') + (c.dataset.mute === '0' ? '🔊 ' : '') +
                   (c.classList.contains('es-fav') ? '★ ' : '') + (c.classList.contains('es-superfav') ? '👑 ' : '') +
                   (c.classList.contains('es-fondo') ? '🎵 ' : '');
    const b = document.createElement('b');
    b.textContent = marcas + ((tit && tit.textContent) || c.dataset.linea);
    const sub = document.createElement('small');
    sub.textContent = [(aut && aut.textContent), c.dataset.linea].filter(Boolean).join(' · ');
    nom.append(b, sub);
    const est = document.createElement('span');
    est.className = 'est';
    est.textContent = icono + ' ' + texto;

    const acc = document.createElement('span');
    acc.className = 'acc';
    const boton = (txt, titulo, fn) => {
      const x = document.createElement('button');
      x.textContent = txt; x.title = titulo;
      x.addEventListener('click', fn);
      acc.appendChild(x);
    };
    if (!c.classList.contains('error')) boton('Ir', 'Ir a este video (le da el audio o lo amplía)', () => { cerrarEstado(); irANumero(validas().indexOf(c) + 1); });
    if (c.dataset.tipo !== 'camara' && !c.classList.contains('error')) boton('🔍', 'Buscar parecido', () => { cerrarEstado(); abrirBuscar(c); });
    if (clase === 'malo' && esDirectoConocido(c.dataset.linea)) boton('📡', 'Buscar el directo actual del canal y cambiarlo si cambió de URL', () => revisarDirecto(c));
    fila.append(num, nom, est, acc);
    tabla.appendChild(fila);
  });
  if (!celdas.length) tabla.textContent = 'Esta vista no tiene videos.';
  $('estadoResumen').textContent = cuenta.total + ' cuadro(s) · ' + cuenta.bien + ' funcionando · ' + cuenta.vivo + ' en vivo · ' +
                                   cuenta.malo + ' con problemas';
  pintarHistorialAudio();
}
// Últimos cambios de audio con su causa (audio.js): para saber qué acción dejó sin sonido
function pintarHistorialAudio() {
  const cont = $('estadoAudioLista');
  cont.innerHTML = '';
  if (!historialAudio.length) { cont.textContent = 'Todavía no hay cambios de audio en esta sesión.'; return; }
  historialAudio.slice(0, 12).forEach(h => {
    const fila = document.createElement('div');
    fila.className = h.sonando ? 'sonando' : 'silencio';
    const hora = new Date(h.t).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fila.textContent = hora + '  ' + (h.sonando ? '🔊 ' : '🔇 ') + (h.titulo ? h.titulo + ' — ' : '') + h.causa;
    cont.appendChild(fila);
  });
}

function abrirEstado() {
  $('tituloEstado').textContent = '📋 Estado de ' + (config.vistaFav ? 'favoritos' : 'la lista "' + config.actual + '"');
  armarEstado();
  pintarSalud();
  fondoEstado.classList.add('abierto');
  clearInterval(timerEstado);
  timerEstado = setInterval(armarEstado, 2000);   // se va poniendo al día mientras está abierto
}
function cerrarEstado() {
  fondoEstado.classList.remove('abierto');
  clearInterval(timerEstado);
}

$('btnRevisarDirectos').addEventListener('click', async () => {
  const b = $('btnRevisarDirectos');
  if (servidorOk !== true) { $('estadoRevision').textContent = 'Necesita el servidor: abre la página con iniciar.bat.'; return; }
  b.disabled = true;
  const r = await revisarDirectosGuardados(av => {
    $('estadoRevision').textContent = av ? '📡 Revisando directos guardados… ' + av.hechos + ' / ' + av.total : '';
  });
  b.disabled = false;
  if (!r) { $('estadoRevision').textContent = 'Ya hay una revisión en curso.'; return; }
  $('estadoRevision').textContent = '📡 ' + r.revisados + ' directo(s) revisado(s) en todas las listas · ' +
    (r.reemplazados.length ? r.reemplazados.length + ' actualizado(s): ' + r.reemplazados.join(', ') : 'ninguno cambió de URL');
  armarEstado();
});
$('btnRevisarLectura').addEventListener('click', async () => {
  $('estadoLectura').textContent = '⏳ Revisando la lectura de YouTube…';
  await consultarSalud(true);
});
$('btnEstadoCerrar').addEventListener('click', cerrarEstado);
$('btnEstado').addEventListener('click', () => { cerrarPanel(); abrirEstado(); });
fondoEstado.addEventListener('click', e => { if (e.target === fondoEstado) cerrarEstado(); });
