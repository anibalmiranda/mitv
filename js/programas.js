// Multi YouTube — programas.js
// Programas: a cierta hora (y en ciertos días) la página cambia sola a un canal, para no perderse un programa.
// Se configuran en el ⚙ (sección "Programas"). Un minuto antes avisa; a la hora, cambia a la lista de ese canal,
// lo amplía y le da el audio (apaga el carrusel, la pantalla negra del visualizador y el audio de fondo).
// Si la página se abre un poco tarde (hasta 3 min después), igual cambia.
// config.programas = [{ hora: 'HH:MM', dias: [0..6] (0 = domingo), lista, linea, activo }]
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const DIAS_PROGRAMA = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
const MARGEN_PROGRAMA_MS = 3 * 60000;   // si a la hora justa la página no estaba abierta, igual cambia hasta 3 min después
const AVISO_PROGRAMA_MS = 60000;        // aviso un minuto antes

function nombreCanal(linea) {
  const mem = config.nombres[clave(linea)];
  const p = parsear(linea);
  return (mem && mem.titulo) || (p && p.tipo !== 'error' ? nombreInicial(p, 0) : linea);
}

// ---------- En el ⚙ ----------
function opcionesCanales(sel, lista, linea) {
  sel.innerHTML = '';
  const vacia = document.createElement('option');
  vacia.value = '';
  vacia.textContent = '— elige el canal —';
  sel.appendChild(vacia);
  Object.keys(config.listas).forEach(n => {
    const og = document.createElement('optgroup');
    og.label = n;
    config.listas[n].forEach(l => {
      const p = parsear(l);
      if (!p || p.tipo === 'error' || p.tipo === 'camara') return;
      const o = document.createElement('option');
      o.value = JSON.stringify([n, l]);
      o.textContent = nombreCanal(l);
      if (n === lista && l === linea) o.selected = true;
      og.appendChild(o);
    });
    if (og.children.length) sel.appendChild(og);
  });
  // El canal ya no está en esa lista (se movió o se renombró la lista): se busca por su clave en las demás
  if (linea && !sel.value) {
    const k = clave(linea);
    const o = [...sel.options].find(x => x.value && clave(JSON.parse(x.value)[1]) === k);
    if (o) o.selected = true;
  }
}
function filaPrograma(p) {
  const f = document.createElement('div');
  f.className = 'programa';
  const activo = document.createElement('input');
  activo.type = 'checkbox';
  activo.className = 'activo';
  activo.checked = p.activo !== false;
  activo.title = 'Activo (desmárcalo para pausarlo sin borrarlo)';
  const hora = document.createElement('input');
  hora.type = 'time';
  hora.className = 'hora';
  hora.value = p.hora || '21:00';
  const dias = document.createElement('span');
  dias.className = 'dias';
  DIAS_PROGRAMA.forEach(([n, letra]) => {
    const l = document.createElement('label');
    l.className = 'dia';
    l.innerHTML = '<input type="checkbox"><span></span>';
    l.querySelector('input').value = n;
    l.querySelector('input').checked = (p.dias || [0, 1, 2, 3, 4, 5, 6]).includes(n);
    l.querySelector('span').textContent = letra;
    dias.appendChild(l);
  });
  const canal = document.createElement('select');
  canal.className = 'canal';
  opcionesCanales(canal, p.lista, p.linea);
  const quitar = document.createElement('button');
  quitar.className = 'btn secundario';
  quitar.textContent = '✕';
  quitar.title = 'Quitar este programa';
  quitar.addEventListener('click', () => f.remove());
  f.append(activo, hora, dias, canal, quitar);
  return f;
}
function llenarProgramas() {
  const cont = $('listaProgramas');
  cont.innerHTML = '';
  (config.programas || []).forEach(p => cont.appendChild(filaPrograma(p)));
}
$('btnAgregarPrograma').addEventListener('click', () => $('listaProgramas').appendChild(filaPrograma({})));
// Al guardar el ⚙ (las filas sin canal o sin hora no se guardan)
function leerProgramas() {
  config.programas = [...$('listaProgramas').querySelectorAll('.programa')].map(f => {
    const v = f.querySelector('.canal').value;
    const hora = f.querySelector('.hora').value;
    if (!v || !/^\d{1,2}:\d{2}$/.test(hora)) return null;
    const [lista, linea] = JSON.parse(v);
    return {
      hora: hora.padStart(5, '0'),
      dias: [...f.querySelectorAll('.dia input:checked')].map(x => Number(x.value)),
      lista, linea,
      activo: f.querySelector('.activo').checked,
    };
  }).filter(Boolean);
}

// ---------- A la hora ----------
const programasHechos = new Set();   // 'día|hora|línea': cada programa se avisa y se cambia una sola vez
function irAPrograma(p) {
  const k = clave(p.linea);
  const tiene = n => (config.listas[n] || []).some(l => clave(l) === k);
  const lista = tiene(p.lista) ? p.lista : Object.keys(config.listas).find(tiene);
  if (!lista) { mostrarMensaje('⏰ No encontré en tus listas el canal del programa de las ' + p.hora); return; }
  detenerCarrusel();
  salirEscena();
  if (fondoActivo) { config.fondoActivo = false; guardar(); aplicarFondo(); }   // que se oiga el programa
  if (config.vistaFav || config.actual !== lista) {
    config.vistaFav = false;
    config.actual = lista;
    guardar();
    render(true);
    pintarSelector();
  }
  const celda = celdas.find(c => clave(c.dataset.linea) === k);
  if (!celda) return;
  conCausa('programa de las ' + p.hora, () => irA(celda));
  mostrarMensaje('⏰ ' + p.hora + ' · ' + nombreCanal(p.linea));
}
function revisarProgramas(ahora) {
  ahora = ahora || new Date();
  (config.programas || []).forEach(p => {
    if (p.activo === false || !p.linea || !/^\d\d:\d\d$/.test(p.hora || '')) return;
    const [h, m] = p.hora.split(':').map(Number);
    const t = new Date(ahora);
    t.setHours(h, m, 0, 0);
    if (!(p.dias || []).includes(t.getDay())) return;
    const dif = ahora - t;
    const k = t.toDateString() + '|' + p.hora + '|' + p.linea;
    if (dif >= -AVISO_PROGRAMA_MS && dif < 0 && !programasHechos.has('aviso|' + k)) {
      programasHechos.add('aviso|' + k);
      mostrarMensaje('⏰ En 1 minuto: ' + nombreCanal(p.linea));
    }
    if (dif >= 0 && dif < MARGEN_PROGRAMA_MS && !programasHechos.has(k)) {
      programasHechos.add(k);
      irAPrograma(p);
    }
  });
}
setInterval(() => revisarProgramas(), 10000);
