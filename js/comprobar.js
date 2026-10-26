// Multi YouTube — comprobar.js
// "🧹 Comprobar lista" (panel de estado): revisa TODAS las líneas de la lista que estás viendo (aunque estén
// dormidas) con servidor.py, arregla lo que se puede arreglar solo y deja fuera lo que no funciona:
//  - videos de YouTube: que existan y que su dueño permita verlos fuera de YouTube;
//  - directos terminados: si el canal transmite con otra URL, se cambia (no cuenta como falla);
//  - canales en vivo (UC… / @handle): que estén transmitiendo;
//  - canales de TV (.m3u8): revisión a fondo; si la dirección principal falla y un respaldo funciona, se cambia;
//  - cámaras: que entreguen imagen.
// Lo que no funciona NO se borra: queda comentado en la misma lista ("# ✘ fecha motivo · URL"), así que desaparece de
// la grilla pero sigue en el ⚙. "↺ Revisar descartados" vuelve a probar esas líneas y restaura las que funcionan.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const RX_DESCARTE = /^# ✘ \d{4}-\d{2}-\d{2} .* · (\S+)\s*$/;   // la URL es lo último de la línea
let comprobacion = null;   // { malas: [{ linea, motivo }] } tras "Comprobar lista"

// Devuelve { ok, motivo, nueva } (nueva: la línea que la reemplaza si se arregló sola)
async function comprobarLinea(linea) {
  const p = parsear(linea);
  if (!p) return { ok: true };
  if (p.tipo === 'error') return p.pendiente ? { ok: true } : { ok: false, motivo: p.motivo || 'URL no reconocida' };
  if (p.tipo === 'lista' || p.tipo === 'rudo') return { ok: true };
  if (p.tipo === 'canal') {
    const d = await api('directo', { canal: p.id });
    return d.vivo ? { ok: true } : { ok: false, motivo: 'el canal no está transmitiendo' };
  }
  if (p.tipo === 'camara') {
    const r = await fetch('/api/camara?url=' + encodeURIComponent(p.id), { cache: 'no-store' });
    if (r.ok) return { ok: true };
    const d = await r.json().catch(() => ({}));
    return { ok: false, motivo: d.error || 'la cámara no responde' };
  }
  if (p.tipo === 'hls') {
    const t = infoTv(linea) || {};
    let primero = null;
    for (const url of [linea].concat(t.respaldos || [])) {
      const r = await api('canalhls', { url });
      if (r.estado === 'ok') {
        if (url === linea) { t.proxy = !r.cors; return { ok: true }; }
        // Funciona un respaldo: pasa a ser la dirección principal (con los datos del canal)
        config.tv[clave(url)] = Object.assign({}, t, { respaldos: [linea].concat((t.respaldos || []).filter(u => u !== url)), proxy: !r.cors });
        return { ok: true, nueva: url };
      }
      primero = primero || r;
    }
    return { ok: false, motivo: (primero && primero.detalle) || 'no funciona' };
  }
  // Video de YouTube
  let info;
  try { info = await api('video', { id: p.id }); }
  catch (e) { if (e.message === 'sin servidor') throw e; return { ok: false, motivo: 'el video no existe o es privado' }; }
  if (info.incrustable === false) return { ok: false, motivo: 'el dueño solo permite verlo en YouTube' };
  if (info.directo && !info.vivo) {
    const canal = info.canal || (config.nombres[clave(linea)] || {}).canal;
    const d = canal ? await api('directo', { canal }) : { vivo: false };
    if (d.vivo && d.video && d.video !== p.id) return { ok: true, nueva: 'https://www.youtube.com/watch?v=' + d.video };
    return { ok: false, motivo: 'el directo terminó y el canal no transmite ahora' };
  }
  return { ok: true };
}

// Revisa una lista de líneas, de a varias a la vez; avisa el avance
async function comprobarVarias(lineas, alAvanzar) {
  const res = new Array(lineas.length);
  let i = 0, hechos = 0;
  const trabajador = async () => {
    while (i < lineas.length) {
      const n = i++;
      try { res[n] = await comprobarLinea(lineas[n]); }
      catch (e) { if (e.message === 'sin servidor') throw e; res[n] = { ok: false, motivo: e.message }; }
      alAvanzar(++hechos, lineas.length);
    }
  };
  await Promise.all([1, 2, 3, 4].map(trabajador));
  return res;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

async function comprobarLista() {
  const info = $('estadoRevision'), btnQuitar = $('btnQuitarMalas');
  btnQuitar.hidden = true;
  if (servidorOk !== true) { info.textContent = 'Comprobar necesita el servidor: abre la página con iniciar.bat.'; return; }
  const lineas = fuente().filter(l => { const p = parsear(l); return p; });   // sin comentarios
  if (!lineas.length) { info.textContent = 'Esta vista no tiene líneas para comprobar.'; return; }
  $('btnComprobar').disabled = true;
  let res;
  try {
    res = await comprobarVarias(lineas, (h, t) => { info.textContent = '🧹 Comprobando… ' + h + ' / ' + t; });
  } catch (e) {
    info.textContent = 'No se pudo comprobar: ' + textoError(e) + '.';
    $('btnComprobar').disabled = false;
    return;
  }
  // Lo que se arregló solo (directo con otra URL, respaldo de TV que funciona) se aplica al tiro
  let arreglados = 0;
  res.forEach((r, n) => { if (r.ok && r.nueva) { reemplazarEnConfig(lineas[n], r.nueva); arreglados++; } });
  if (arreglados) { guardar(); render(true); pintarSelector(); }
  const malas = res.map((r, n) => ({ linea: lineas[n], motivo: r.motivo, ok: r.ok })).filter(x => !x.ok);
  comprobacion = { malas };
  info.textContent = '🧹 ' + lineas.length + ' revisada(s) · ' + (lineas.length - malas.length) + ' funcionan' +
    (arreglados ? ' (' + arreglados + ' arreglada(s) sola(s))' : '') + ' · ' + malas.length + ' no funcionan' +
    (malas.length ? ': ' + malas.slice(0, 4).map(m => m.motivo).join('; ') + (malas.length > 4 ? '…' : '') : '');
  btnQuitar.hidden = !malas.length;
  btnQuitar.textContent = 'Quitar los que no funcionan (' + malas.length + ')';
  $('btnComprobar').disabled = false;
  armarEstado();
}

// Comenta las líneas que no funcionan (no se pierden: quedan con su motivo para "Revisar descartados")
function quitarMalas() {
  if (!comprobacion || !comprobacion.malas.length) return;
  const motivo = new Map(comprobacion.malas.map(m => [m.linea, m.motivo]));
  const nombreDe = l => { const t = infoTv(l); return t && t.nombre ? t.nombre + ' · ' : ''; };
  fijarFuente(fuente().map(l => motivo.has(l)
    ? '# ✘ ' + hoyISO() + ' ' + String(motivo.get(l) || 'no funciona').replace(/·/g, '-') + ' · ' + nombreDe(l) + l
    : l));
  guardar();
  render(true);
  pintarSelector();
  $('estadoRevision').textContent = '✔ ' + comprobacion.malas.length + ' línea(s) quedaron comentadas en la lista (se ven en el ⚙). ' +
                                    'Usa "↺ Revisar descartados" más adelante para recuperar las que vuelvan.';
  $('btnQuitarMalas').hidden = true;
  comprobacion = null;
  armarEstado();
}

// Vuelve a probar las líneas comentadas por "Comprobar lista" (o al importar) y restaura las que funcionan
async function revisarDescartados() {
  const info = $('estadoRevision');
  if (servidorOk !== true) { info.textContent = 'Necesita el servidor: abre la página con iniciar.bat.'; return; }
  const descartes = fuente().filter(l => RX_DESCARTE.test(l));
  if (!descartes.length) { info.textContent = 'Esta lista no tiene líneas descartadas.'; return; }
  $('btnDescartados').disabled = true;
  const urls = descartes.map(l => l.match(RX_DESCARTE)[1]);
  let res;
  try { res = await comprobarVarias(urls, (h, t) => { info.textContent = '↺ Revisando descartados… ' + h + ' / ' + t; }); }
  catch (e) { info.textContent = 'No se pudo revisar: ' + textoError(e) + '.'; $('btnDescartados').disabled = false; return; }
  const vuelven = new Map();
  res.forEach((r, n) => { if (r.ok) vuelven.set(descartes[n], r.nueva || urls[n]); });
  if (vuelven.size) {
    fijarFuente(fuente().map(l => vuelven.has(l) ? vuelven.get(l) : l));
    guardar();
    render(true);
    pintarSelector();
  }
  info.textContent = '↺ ' + descartes.length + ' descartada(s) revisada(s) · ' + vuelven.size + ' volvieron a funcionar y se restauraron';
  $('btnDescartados').disabled = false;
  armarEstado();
}

$('btnComprobar').addEventListener('click', comprobarLista);
$('btnQuitarMalas').addEventListener('click', quitarMalas);
$('btnDescartados').addEventListener('click', revisarDescartados);
