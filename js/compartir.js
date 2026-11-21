// Multi YouTube — compartir.js
// 🔗 Compartir: con un canal ampliado, copia al portapapeles un link de Multi YouTube (…/?ver=<canal>&lista=<lista>)
// que al abrirlo en el navegador carga directo ese canal ampliado, en su lista y con el audio. Si el canal ya no
// está en ninguna lista, se muestra igual sin guardarlo (ver extraTemporal en config.js).
// abrirCanal también lo usan los Programas ⏰ (programas.js).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

function linkCompartir(celda) {
  const u = new URL(location.pathname, location.origin);
  u.searchParams.set('ver', celda.dataset.linea);
  if (!config.vistaFav) u.searchParams.set('lista', config.actual);
  return u.href;
}
async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch (e) { }
  // Sin permiso del portapapeles moderno: el método antiguo
  const t = document.createElement('textarea');
  t.value = texto;
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { }
  t.remove();
  return ok;
}
async function compartirCelda(celda) {
  const link = linkCompartir(celda);
  if (await copiarTexto(link)) mostrarMensaje('🔗 Link copiado: ábrelo en el navegador para ver este canal ampliado');
  else window.prompt('Copia este link (Ctrl+C):', link);
}

// Va a un canal: cambia a la lista que lo tiene (la indicada si aún lo tiene, si no la primera que lo tenga), lo
// amplía y le da el audio. temporal = true: si no está en ninguna lista, se muestra igual sin guardarlo.
// Devuelve 'lista', 'temporal' o '' (no se encontró).
function abrirCanal(linea, lista, causa, temporal) {
  const k = clave(linea);
  if (!k) return '';
  const tiene = n => (config.listas[n] || []).some(l => clave(l) === k);
  const destino = tiene(lista) ? lista : Object.keys(config.listas).find(tiene);
  if (!destino && !temporal) return '';
  detenerCarrusel();
  salirEscena();
  if (fondoActivo) { config.fondoActivo = false; guardar(); aplicarFondo(); }   // que se oiga el canal
  if (destino) {
    if (config.vistaFav || config.actual !== destino) {
      config.vistaFav = false;
      config.actual = destino;
      guardar();
      render(true);
      pintarSelector();
    }
  } else if (!celdas.some(c => clave(c.dataset.linea) === k)) {
    extraTemporal = { linea, vista: vistaId() };
    render(true);
  }
  const celda = celdas.find(c => clave(c.dataset.linea) === k);
  if (!celda) return '';
  conCausa(causa, () => irA(celda));
  return destino ? 'lista' : 'temporal';
}

// Al abrir la página con un link compartido (después de cargar los datos)
function abrirCompartido() {
  const q = new URLSearchParams(location.search);
  const ver = q.get('ver');
  if (!ver) return;
  history.replaceState(null, '', location.pathname);   // al recargar ya no vuelve a saltar a ese canal
  if (!clave(ver)) { mostrarMensaje('🔗 El link compartido no trae un canal válido'); return; }
  if (abrirCanal(ver, q.get('lista'), 'link compartido', true) === 'temporal')
    mostrarMensaje('🔗 Este canal no está en tus listas: se muestra sin guardarlo (con ⇄ lo copias a una lista)');
}
