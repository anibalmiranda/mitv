// Multi YouTube — organizar.js
// ⚙ "🤖 Organizar con IA": ordena una lista por temas con un modelo de Ollama instalado en este equipo (servidor.py
// le pasa los nombres de los canales; nada sale a internet). La música queda agrupada por estilo, los canales de TV
// y las cámaras por región, y lo demás por tema. Cada grupo parte con un título "# ── Lofi ──" (se ve en ⚙, no ocupa
// un cuadro y se mueve con el primer canal del grupo al reordenar).
//  - "Esta lista": ordena lo que está en el cuadro de texto; se aplica con Guardar (Cancelar lo deshace).
//  - "Todas las listas": las ordena una por una y las guarda; "↶ Deshacer" las deja como estaban.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const RX_TITULO_GRUPO = /^#\s*──/;   // los títulos que pone esta función (se reemplazan al volver a organizar)
const MIN_PARA_ORGANIZAR = 4;
let respaldoOrganizar = null;        // listas antes de "Todas las listas", para Deshacer

// Lo que el modelo ve de cada línea: su nombre (o algo de su dirección) y qué es
function descripcionIA(linea) {
  const p = parsear(linea);
  const k = clave(linea);
  const n = (k && config.nombres[k]) || {};
  const t = (k && config.tv[k]) || {};
  let nombre = [n.titulo, n.autor].filter(Boolean).join(' — ') || t.nombre || '';
  let tipo = 'video';
  if (p.tipo === 'hls') tipo = 'canal de TV' + (t.grupo && !/undefined|general/i.test(t.grupo) ? ', ' + t.grupo : '');
  else if (p.tipo === 'camara') tipo = 'cámara en vivo';
  else if (p.tipo === 'rudo') tipo = 'canal de TV chileno';
  else if (p.tipo === 'spotify') tipo = 'Spotify';
  else if (p.tipo === 'lista') tipo = 'playlist de música o videos';
  else if (p.tipo === 'canal' || n.vivo) tipo = 'transmisión en vivo';
  if (/^https?:\/\//i.test(linea.trim()) && !/youtu/i.test(linea)) {   // la dirección también da pistas (rtve.es, .cl…)
    const corta = linea.trim().replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').slice(0, 60);
    nombre = nombre ? nombre + ' (' + corta + ')' : corta;
  }
  return (nombre || (p.tipo === 'error' ? linea.trim() : nombreInicial(p, 0))) + ' [' + tipo + ']';
}

// Arma la lista nueva: cada grupo con su título y sus líneas. Los títulos de grupo anteriores se quitan; los demás
// comentarios (p. ej. los descartados "# ✘ …") quedan al final.
function armarOrganizada(lineas, grupos) {
  const items = lineas.filter(l => l.trim() && parsear(l));
  const otros = lineas.filter(l => l.trim() && !parsear(l) && !RX_TITULO_GRUPO.test(l.trim()));
  const res = [];
  grupos.forEach(g => {
    const sel = g.items.map(i => items[i - 1]).filter(Boolean);
    if (sel.length) res.push('# ── ' + g.titulo + ' ──', ...sel);
  });
  return res.concat(otros);
}

async function pedirOrganizar(nombre, lineas, modelo) {
  const items = lineas.filter(l => l.trim() && parsear(l));
  const r = await fetch('/api/organizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MultiYouTube': '1' },
    body: JSON.stringify({ modelo, lista: nombre, elementos: items.map(descripcionIA) })
  }).catch(() => { throw new Error('sin servidor'); });
  const d = await r.json().catch(() => ({ error: 'el servidor no respondió bien' }));
  if (d.error) throw new Error(d.error);
  return { lineas: armarOrganizada(lineas, d.grupos), grupos: d.grupos };
}

// ---------- Panel ⚙ ----------
async function llenarModelosIA() {
  const sel = $('selModeloIA'), est = $('estadoIA');
  if (servidorOk !== true) { sel.innerHTML = ''; est.textContent = 'Necesita el servidor (iniciar.bat) y Ollama.'; return; }
  let d;
  try { d = await api('modelosia', {}); } catch (e) { d = { error: textoError(e), modelos: [] }; }
  sel.innerHTML = '';
  (d.modelos || []).forEach(m => sel.appendChild(new Option(m, m)));
  if (config.modeloIA && d.modelos.includes(config.modeloIA)) sel.value = config.modeloIA;
  $('btnOrganizarIA').disabled = !(d.modelos || []).length;
  if (!$('btnOrganizarIA').disabled || !est.dataset.ocupado) est.textContent = d.error || '';
}

async function organizarConIA() {
  const est = $('estadoIA'), btn = $('btnOrganizarIA'), modelo = $('selModeloIA').value;
  if (!modelo) return;
  config.modeloIA = modelo;
  const todas = $('selAlcanceIA').value === 'todas';
  btn.disabled = true;
  est.dataset.ocupado = '1';
  const inicio = Date.now();
  const reloj = setInterval(() => { est.dataset.seg = Math.round((Date.now() - inicio) / 1000); pintar(); }, 1000);
  let texto = '';
  const pintar = () => { est.textContent = texto + ' (' + (est.dataset.seg || 0) + ' s)'; };
  try {
    if (!todas) {
      const lineas = txt.value.split(/\r?\n/);
      if (lineas.filter(l => l.trim() && parsear(l)).length < MIN_PARA_ORGANIZAR) { texto = ''; est.textContent = 'La lista es muy corta para organizarla.'; return; }
      texto = '🤖 Organizando con ' + modelo + '… (la primera vez tarda más: carga el modelo)'; pintar();
      const r = await pedirOrganizar(nombreLista.value.trim() || config.actual, lineas, modelo);
      txt.value = r.lineas.join('\n');
      est.textContent = '🤖 ' + r.grupos.length + ' grupos: ' + r.grupos.map(g => g.titulo).join(' · ') + '. Revisa y aprieta Guardar (Cancelar lo deshace).';
    } else {
      const nombres = Object.keys(config.listas).filter(n => config.listas[n].filter(l => parsear(l)).length >= MIN_PARA_ORGANIZAR);
      const antes = JSON.parse(JSON.stringify(config.listas));
      const fallas = [];
      for (let i = 0; i < nombres.length; i++) {
        texto = '🤖 Organizando ' + (i + 1) + ' de ' + nombres.length + ': ' + nombres[i] + '…'; pintar();
        try { config.listas[nombres[i]] = (await pedirOrganizar(nombres[i], config.listas[nombres[i]], modelo)).lineas; }
        catch (e) { if (e.message === 'sin servidor') throw e; fallas.push(nombres[i] + ' (' + e.message + ')'); }
      }
      respaldoOrganizar = antes;
      $('btnDeshacerIA').hidden = false;
      guardar(); render(true); pintarSelector();
      if (!config.vistaFav) txt.value = fuente().join('\n');
      est.textContent = '🤖 Listo: ' + (nombres.length - fallas.length) + ' lista(s) organizadas' +
        (fallas.length ? ' · no se pudo con ' + fallas.join(', ') : '') + '. "↶ Deshacer" las deja como estaban.';
    }
  } catch (e) {
    est.textContent = '⚠ No se pudo organizar: ' + textoError(e) + '.';
  } finally {
    clearInterval(reloj);
    delete est.dataset.ocupado;
    delete est.dataset.seg;
    btn.disabled = false;
  }
}

function deshacerOrganizar() {
  if (!respaldoOrganizar) return;
  config.listas = respaldoOrganizar;
  respaldoOrganizar = null;
  $('btnDeshacerIA').hidden = true;
  normalizarConfig();
  guardar(); render(true); pintarSelector();
  if (!config.vistaFav) txt.value = fuente().join('\n');
  $('estadoIA').textContent = '↶ Las listas quedaron como estaban antes de organizarlas.';
}

$('btnOrganizarIA').addEventListener('click', organizarConIA);
$('btnDeshacerIA').addEventListener('click', deshacerOrganizar);
$('selModeloIA').addEventListener('change', () => { config.modeloIA = $('selModeloIA').value; guardar(); });
