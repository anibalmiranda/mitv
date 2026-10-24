// Multi YouTube — mover.js
// Botón ⇄ de cada cuadro: mover o copiar ese video / canal / cámara a otra lista (o a una nueva).
//  - Mover: sale de la lista actual (sin recargar los demás) y queda al final de la elegida.
//  - Copiar: queda en las dos. Desde favoritos solo se copia (favoritos es aparte de las listas).
//  - Si ya está en la lista de destino, no se duplica.
// Los datos propios del canal (nombre y logo de TV, volumen, nombre memorizado) van por su clave, así que lo acompañan.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const fondoMover = $('fondoMover');
const NUEVA_LISTA = '__nueva__';
let celdaMover = null;

function abrirMover(celda) {
  celdaMover = celda;
  const tit = celda.querySelector('.titulo');
  $('moverQue').textContent = (tit && tit.textContent) || celda.dataset.linea;
  // Mismo orden y grupos que el selector de arriba, sin la lista actual
  const sel = $('moverDestino');
  sel.innerHTML = '';
  const grupos = new Map();
  Object.keys(config.listas).forEach(n => {
    if (!config.vistaFav && n === config.actual) return;
    const o = document.createElement('option');
    o.value = n;
    const corte = n.indexOf(' / ');
    o.textContent = corte > 0 ? n.slice(corte + 3) : n;
    if (corte > 0) {
      const g = n.slice(0, corte);
      if (!grupos.has(g)) { const og = document.createElement('optgroup'); og.label = g; grupos.set(g, og); sel.appendChild(og); }
      grupos.get(g).appendChild(o);
    } else sel.appendChild(o);
  });
  const nueva = document.createElement('option');
  nueva.value = NUEVA_LISTA;
  nueva.textContent = '＋ Nueva lista…';
  sel.insertBefore(nueva, sel.firstChild);   // primera, para que se vea
  // Por defecto, una lista del mismo grupo (p. ej. otra sub-lista de "TV"); si no, la primera que exista
  const g = config.vistaFav ? '' : grupoDe(config.actual);
  const opciones = [...sel.options].filter(o => o.value !== NUEVA_LISTA);
  const mismoGrupo = g && opciones.find(o => grupoDe(o.value) === g);
  sel.value = mismoGrupo ? mismoGrupo.value : (opciones[0] ? opciones[0].value : NUEVA_LISTA);
  $('moverNueva').value = '';
  pintarMoverNueva();
  $('btnMoverMover').hidden = config.vistaFav;   // desde favoritos solo se copia
  $('avisoMover').textContent = config.vistaFav ? 'Desde favoritos solo se puede copiar.' : '';
  fondoMover.classList.add('abierto');
}
function cerrarMover() { fondoMover.classList.remove('abierto'); celdaMover = null; }
// Al elegir "Nueva lista": aparece el nombre, propuesto dentro del mismo grupo ("TV / ") si estás en una sub-lista
function pintarMoverNueva() {
  const campo = $('moverNueva');
  const esNueva = $('moverDestino').value === NUEVA_LISTA;
  campo.hidden = !esNueva;
  $('btnMoverNueva').hidden = esNueva;
  if (esNueva && !campo.value) {
    const g = config.vistaFav ? '' : grupoDe(config.actual);
    campo.value = g ? g + ' / ' : '';
  }
  if (esNueva && fondoMover.classList.contains('abierto')) setTimeout(() => { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }, 0);
}
$('btnMoverNueva').addEventListener('click', () => { $('moverDestino').value = NUEVA_LISTA; pintarMoverNueva(); });
// Enter en el nombre = Mover (o Copiar desde favoritos)
$('moverNueva').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); moverOCopiar(!config.vistaFav); } });

function moverOCopiar(mover) {
  const celda = celdaMover;
  if (!celda) return;
  let destino = $('moverDestino').value;
  if (destino === NUEVA_LISTA) {
    destino = $('moverNueva').value.trim().slice(0, 60);
    if (!destino) { $('avisoMover').textContent = 'Escribe el nombre de la lista nueva.'; return; }
    if (!config.listas[destino]) config.listas[destino] = [];
  }
  const linea = celda.dataset.linea;
  const k = clave(linea);
  const yaEsta = config.listas[destino].some(l => l === linea || (k && clave(l) === k));
  if (!yaEsta) config.listas[destino].push(linea);
  if (mover && !config.vistaFav) conCausa('moviste el cuadro que sonaba a otra lista', () => quitar(celda));   // sale de la lista actual (también guarda)
  else guardar();
  pintarSelector();
  cerrarMover();
  const corto = destino.replace(' / ', ' → ');
  mostrarMensaje(yaEsta ? 'Ya estaba en "' + corto + '"' + (mover ? ': se quitó de esta lista' : '')
                        : (mover ? '⇄ Movido a "' : '⧉ Copiado a "') + corto + '"');
}

$('moverDestino').addEventListener('change', pintarMoverNueva);
$('btnMoverMover').addEventListener('click', () => moverOCopiar(true));
$('btnMoverCopiar').addEventListener('click', () => moverOCopiar(false));
$('btnMoverCancelar').addEventListener('click', cerrarMover);
fondoMover.addEventListener('click', e => { if (e.target === fondoMover) cerrarMover(); });
