// Multi YouTube — grilla.js
// Cuadrícula auto gestionada, dibujo de los cuadros y arrastrar para reordenar.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Cuadrícula auto gestionada ----------
// Busca la combinación columnas x filas que deja cada video 16:9 lo más grande posible
function calcularGrilla(n, W, H, gap) {
  let mejor = { cols: 1, filas: n, area: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const filas = Math.ceil(n / cols);
    const w = (W - gap * (cols - 1)) / cols;
    const h = (H - gap * (filas - 1)) / filas;
    if (w <= 0 || h <= 0) continue;
    const anchoVideo = Math.min(w, h * 16 / 9);
    const area = anchoVideo * (anchoVideo * 9 / 16);
    if (area > mejor.area) mejor = { cols, filas, area };
  }
  return mejor;
}

function ajustarGrilla() {
  const n = celdas.length;
  vacio.style.display = n ? 'none' : 'flex';
  if (!n) return;
  const gap = 6;
  const r = contenedor.getBoundingClientRect();
  const g = calcularGrilla(n, r.width, r.height, gap);
  contenedor.style.gridTemplateColumns = `repeat(${g.cols}, 1fr)`;
  contenedor.style.gridTemplateRows = `repeat(${g.filas}, 1fr)`;
}

// ---------- Render ----------
function render() {
  cerrarTira();
  olvidarSilencioGeneral();   // las celdas se vuelven a crear
  if (carrusel && carrusel.vista !== vistaId()) detenerCarrusel();   // el carrusel es de la vista en que partió
  contenedor.innerHTML = '';
  celdas = [];
  comentarios = [];

  $('vacioTitulo').textContent = config.vistaFav ? 'Aún no tienes favoritos' : 'Sin videos en esta lista';
  $('vacioTexto').textContent = config.vistaFav
    ? 'Vuelve a una lista y marca hasta 9 videos con la ☆ (aparece al pasar el mouse por un cuadro)'
    : 'Presiona el engranaje ⚙ arriba a la derecha y pega una URL de YouTube por línea';

  let yaHayAudio = false;
  let idx = 0;
  // Último video seleccionado en esta vista: se retoma al cargar
  const ult = config.ultimos[vistaId()];
  const hayUlt = !!ult && fuente().some(l => clave(l) === ult.clave);
  let pendiente = null;

  fuente().forEach(linea => {
    const item = parsear(linea);
    if (!item) { if (linea.trim()) comentarios.push(linea); return; }

    const celda = document.createElement('div');
    celda.className = 'celda';
    celda.dataset.linea = linea;

    if (item.tipo === 'error') {
      celda.classList.add('error');
      celda.textContent = (item.motivo || 'URL no reconocida') + ' → ' + item.original;
    } else {
      // Audio exclusivo: si no se parte silenciado, solo el primer video arranca con audio
      // Si hay que retomar el último seleccionado, todos parten silenciados y ese recibe el audio después
      // Las cámaras no tienen audio: siempre "silenciadas" y nunca le quitan el audio a un video
      const esCamara = item.tipo === 'camara';
      const esUlt = !esCamara && hayUlt && !pendiente && clave(linea) === ult.clave;
      const muteado = esCamara || hayUlt || config.mute || yaHayAudio;
      if (!muteado) yaHayAudio = true;
      celda.dataset.mute = muteado ? '1' : '0';
      celda.dataset.tipo = item.tipo;
      if (item.inicio) celda.dataset.inicio = item.inicio;   // tiempo pedido en la URL: no se salta al azar
      if (item.tipo === 'video') celda.dataset.thumb = 'https://i.ytimg.com/vi/' + encodeURIComponent(item.id) + '/mqdefault.jpg';
      // En modo solo audio, los silenciados parten pausados (salvo el último seleccionado, que siempre arranca)
      const autoplay = esUlt || (config.autoplay && !(config.modoAudio && muteado));
      if (esUlt) { celda.dataset.pendiente = '1'; pendiente = celda; }

      // Duración ya conocida y no es directo: el punto al azar va en la URL (parte directo ahí)
      if (item.tipo === 'video' && config.inicioAleatorio && !item.inicio) {
        const mem = config.duraciones[item.id];
        if (mem && !mem.vivo) {
          item.inicioAzar = segundoAleatorio(mem.d);
          celda._saltoHecho = true;   // ya no hace falta el salto después de cargar
          celda._dur = mem.d;
        }
      }

      if (esCamara) {
        crearCamara(celda, item.id);
      } else {
        // El reproductor no se carga todavía: espera su turno en la carga escalonada (abajo) mostrando la miniatura
        const ifr = document.createElement('iframe');
        ifr.dataset.src = urlEmbed(item, muteado, autoplay);
        celda.classList.add('esperando');
        if (celda.dataset.thumb) celda.style.backgroundImage = 'url("' + celda.dataset.thumb + '")';
        ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
        ifr.allowFullscreen = true;
        ifr.referrerPolicy = 'strict-origin-when-cross-origin';
        ifr.title = 'Video ' + (idx + 1);
        const id = idx;
        ifr.addEventListener('load', () => escucharYT(ifr, id));
        celda.appendChild(ifr);
      }

      // Fila de solo audio (barras + título)
      const fila = document.createElement('div');
      fila.className = 'fila-audio';
      fila.innerHTML =
        '<div class="barras"><span></span><span></span><span></span><span></span><span></span></div>' +
        '<div class="info"><div class="titulo-fila"><span class="etq-vivo">EN VIVO</span><div class="titulo"></div></div><div class="autor"></div></div>' +
        '<div class="estado"></div>';
      // Si ya conocemos su nombre (de una carga anterior), se muestra al tiro, aunque el video ya no exista
      const memNombre = config.nombres[clave(linea)];
      fila.querySelector('.titulo').textContent = (memNombre && memNombre.titulo) || nombreInicial(item, idx);
      if (memNombre && memNombre.autor) fila.querySelector('.autor').textContent = memNombre.autor;
      celda.appendChild(fila);
      // ¿La última vez era un directo? Si ahora no lo es, quizás el canal empezó otra transmisión (directos.js)
      if (item.tipo === 'video')
        celda._eraDirecto = !!(memNombre && memNombre.vivo) || !!item.pistaVivo ||
                            !!(config.duraciones[item.id] && config.duraciones[item.id].vivo);

      // Capa de clic: un clic = audio, doble clic = ampliar / miniatura
      const capa = document.createElement('div');
      capa.className = 'capa-audio';
      capa.title = 'Clic: audio · Doble clic: ampliar / miniatura · Arrastrar: reordenar';
      let timerClic = null;
      capa.addEventListener('click', () => {
        clearTimeout(timerClic);
        if (config.modoAudio) { alternarAudio(celda); return; }
        timerClic = setTimeout(() => alternarAudio(celda), 250);
      });
      capa.addEventListener('dblclick', e => {
        e.preventDefault();
        clearTimeout(timerClic);
        if (!config.modoAudio) alternarMax(celda);
      });
      celda.appendChild(capa);

      const ico = document.createElement('div');
      ico.className = 'icono-audio';
      celda.appendChild(ico);

      // Volumen propio de este video (se recuerda): para emparejar canales que suenan más fuerte o más bajo
      if (!esCamara) {
        const vol = document.createElement('input');
        vol.type = 'range';
        vol.className = 'volumen';
        vol.min = VOLUMEN_MIN; vol.max = 100; vol.step = 5;
        vol.value = volumenDe(celda);
        vol.title = 'Volumen de este video: ' + vol.value + '% (se recuerda) · también con las teclas + y −';
        vol.addEventListener('input', () => fijarVolumen(celda, Number(vol.value)));
        // Que mover la barra no cuente como clic (audio), doble clic (ampliar) ni arrastre del cuadro
        vol.addEventListener('pointerdown', e => { e.stopPropagation(); celda._enVolumen = true; });
        vol.addEventListener('pointerup', () => { celda._enVolumen = false; });
        ['click', 'dblclick'].forEach(ev => vol.addEventListener(ev, e => e.stopPropagation()));
        celda.appendChild(vol);
      }
      // Modo liviano: un cuadro dormido despierta al dejar el mouse encima un momento
      celda.addEventListener('mouseenter', () => despertarPorMouse(celda, true));
      celda.addEventListener('mouseleave', () => despertarPorMouse(celda, false));

      const vivo = document.createElement('span');
      vivo.className = 'etq-vivo';
      vivo.textContent = 'EN VIVO';
      celda.appendChild(vivo);
      // Pista inicial por la URL; el reproductor lo confirma o lo corrige después
      if (item.tipo === 'canal' || item.pistaVivo) celda.classList.add('en-vivo');

      const bFav = document.createElement('button');
      bFav.className = 'fav';
      bFav.addEventListener('click', () => alternarFav(celda));
      celda.appendChild(bFav);

      const bMax = document.createElement('button');
      bMax.className = 'maximizar';
      bMax.title = 'Ampliar / miniatura';
      bMax.textContent = '⤢';
      bMax.addEventListener('click', () => alternarMax(celda));
      celda.appendChild(bMax);

      const bBuscar = document.createElement('button');
      bBuscar.className = 'buscar';
      bBuscar.title = 'Buscar algo parecido en YouTube (por si dejó de transmitir o cambió de URL)';
      bBuscar.textContent = '🔍';
      bBuscar.addEventListener('click', () => abrirBuscar(celda));
      celda.appendChild(bBuscar);

      pintarFav(celda);
      pintarAudio(celda);
      idx++;
    }

    const btn = document.createElement('button');
    btn.className = 'quitar';
    btn.title = config.vistaFav ? 'Quitar de favoritos' : 'Quitar';
    btn.textContent = '✕';
    btn.addEventListener('click', () => quitar(celda));
    celda.appendChild(btn);

    habilitarArrastre(celda);
    celda.style.order = celdas.length;
    celdas.push(celda);
    contenedor.appendChild(celda);
  });
  actualizarCarga();
  aplicarModoAudio(false);
  pintarFavsBoton();
  if (pendiente) prepararRetomar(pendiente, ult);
  else ocultarAvisoRetomar();
  resolverRutasPendientes();   // @handle que aún no se sabe a qué canal corresponden
}

// ---------- Carga escalonada y modo liviano ----------
// Cada cuadro es un reproductor de YouTube completo: cargarlos todos a la vez traba el PC. Se cargan de a
// TANDA_CARGA cada INTERVALO_CARGA ms: primero el que tiene (o va a recibir) el audio, después el resto en orden.
// Mientras esperan se ve su miniatura. Si le das el audio a uno o lo amplías, se carga al tiro (cargarYa).
// Modo liviano (config.maxActivos > 0, en el ⚙): solo esa cantidad de reproductores queda en movimiento. Siempre
// cuentan el que tiene el audio y el ampliado; el resto se llena en el orden de la lista. Los demás "duermen":
// se descarga su reproductor y se ve su miniatura (en los directos, una que YouTube actualiza cada pocos minutos).
// Un cuadro dormido despierta al dejar el mouse encima medio segundo, y vuelve a dormir 15 s después de salir.
const TANDA_CARGA = 2;
const INTERVALO_CARGA = 600;
const ESPERA_DESPERTAR_MS = 500;
const ESPERA_DORMIR_MS = 15000;
let colaCarga = [];
let timerCarga = null;

function celdasActivas() {
  const videos = celdas.filter(c => c.querySelector('iframe'));
  const limite = Number(config.maxActivos) || 0;
  if (!limite || videos.length <= limite) return new Set(videos);
  const activas = new Set(videos.filter(c => c.dataset.mute === '0' || c.dataset.pendiente ||
                                              c.classList.contains('max') || c._despierta));
  for (const c of videos) { if (activas.size >= limite) break; activas.add(c); }
  return activas;
}
function actualizarCarga() {
  const activas = celdasActivas();
  celdas.forEach(c => { if (c.querySelector('iframe') && !activas.has(c)) dormirCelda(c); });
  const pendientes = celdas.filter(c => { const f = c.querySelector('iframe'); return f && f.dataset.src && activas.has(c); });
  const prioridad = c => (c.dataset.pendiente || c.dataset.mute === '0') ? 0 : 1;
  colaCarga = pendientes.sort((a, b) => prioridad(a) - prioridad(b));   // sort estable: el resto queda en orden
  // Si ya venía cargando, se respeta el ritmo; si no, la primera tanda parte al tiro
  const enCurso = !!timerCarga;
  clearTimeout(timerCarga);
  timerCarga = null;
  if (enCurso) timerCarga = setTimeout(cargarTanda, INTERVALO_CARGA);
  else cargarTanda();
}
let timerActualizar = null;
function programarCarga() { clearTimeout(timerActualizar); timerActualizar = setTimeout(actualizarCarga, 200); }
function cargarTanda() {
  timerCarga = null;
  colaCarga = colaCarga.filter(c => c.isConnected);
  colaCarga.splice(0, TANDA_CARGA).forEach(cargarIframe);
  if (colaCarga.length) timerCarga = setTimeout(cargarTanda, INTERVALO_CARGA);
}
function cargarIframe(celda) {
  const ifr = celda.querySelector('iframe');
  if (!ifr || !ifr.dataset.src) return;
  ifr.src = ifr.dataset.src;
  delete ifr.dataset.src;
  celda.classList.remove('esperando', 'dormida');
  celda.style.backgroundImage = '';
}
function cargarYa(celda) {
  if (!celda) return;
  colaCarga = colaCarga.filter(c => c !== celda);
  cargarIframe(celda);
  if (Number(config.maxActivos) > 0) programarCarga();   // otro se duerme si se pasó del máximo
}

// Lo que el cuadro sabía de su reproductor deja de valer cuando este se descarga o se reemplaza
function olvidarReproductor(celda) {
  ['_listo', '_videoActual', '_dur', '_durVista', '_durNueva', '_durNuevaVista', '_durAprendida', '_vivoSeguro',
   '_durPrev', '_durIgual', '_estado', '_estadoPrevio', '_canalPedido', '_directoRevisado', '_listaHecha',
   '_esperaVideo', '_playlist', '_playlistIndex'].forEach(k => { celda[k] = null; });
  celda._saltoHecho = false;
}
// Dirección para volver a cargar el cuadro: parte en un punto al azar si ya se sabe la duración
function urlRecarga(celda) {
  const item = parsear(celda.dataset.linea);
  const muteado = celda.dataset.mute === '1';
  if (item.tipo === 'video' && config.inicioAleatorio && !item.inicio) {
    const mem = config.duraciones[item.id];
    if (mem && !mem.vivo) { item.inicioAzar = segundoAleatorio(mem.d); celda._saltoHecho = true; celda._dur = mem.d; }
  }
  if (item.tipo === 'canal' || celda.classList.contains('en-vivo')) celda._saltoHecho = true;
  return urlEmbed(item, muteado, !(config.modoAudio && muteado));
}
function ponerMiniatura(celda) {
  let thumb = celda.dataset.thumb;
  // En los directos, la miniatura "_live" muestra un cuadro reciente de la transmisión (se pide de nuevo cada 5 min)
  if (thumb && celda.classList.contains('en-vivo'))
    thumb = thumb.replace('/mqdefault.jpg', '/mqdefault_live.jpg') + '?t=' + Math.floor(Date.now() / 300000);
  celda.style.backgroundImage = thumb ? 'url("' + thumb + '")' : '';
}
function dormirCelda(celda) {
  const ifr = celda.querySelector('iframe');
  if (!ifr) return;
  if (!ifr.dataset.src) {   // estaba cargado: se descarga
    detenerRampa(celda);
    olvidarReproductor(celda);
    ifr.dataset.src = urlRecarga(celda);
    ifr.src = 'about:blank';
  }
  celda.classList.add('esperando', 'dormida');
  ponerMiniatura(celda);
}
function despertarPorMouse(celda, entra) {
  clearTimeout(celda._timerDespertar);
  if (!(Number(config.maxActivos) > 0)) return;
  if (entra) {
    if (!celda.classList.contains('dormida')) return;
    celda._timerDespertar = setTimeout(() => { celda._despierta = true; cargarYa(celda); }, ESPERA_DESPERTAR_MS);
  } else if (celda._despierta) {
    celda._timerDespertar = setTimeout(() => { celda._despierta = false; programarCarga(); }, ESPERA_DORMIR_MS);
  }
}

// Reescribe la lista que se está viendo según el orden visual de las celdas
function sincronizarUrls() {
  fijarFuente(celdas.map(c => c.dataset.linea).concat(comentarios));
  guardar();
  pintarSelector();
}
function reordenar() { celdas.forEach((c, i) => c.style.order = i); }

// ---------- Arrastrar: el video arrastrado siempre queda justo antes del que sueltas encima ----------
// Usa CSS order: no se recarga ningún video
let arrastrada = null;
function limpiarMarcas(celda) { celda.classList.remove('sobre', 'ins-antes', 'ins-despues'); }

function habilitarArrastre(celda) {
  celda.draggable = true;
  celda.addEventListener('dragstart', e => {
    if (celda.classList.contains('max') || celda._enVolumen) { e.preventDefault(); return; }
    arrastrada = celda;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ''); } catch (err) { }
    celda.classList.add('arrastrada');
    document.body.classList.add('arrastrando');
  });
  celda.addEventListener('dragover', e => {
    if (!arrastrada || arrastrada === celda) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    celda.classList.add('ins-antes');
  });
  celda.addEventListener('dragleave', e => {
    if (!celda.contains(e.relatedTarget)) limpiarMarcas(celda);
  });
  celda.addEventListener('drop', e => {
    e.preventDefault();
    limpiarMarcas(celda);
    if (!arrastrada || arrastrada === celda) return;
    celdas.splice(celdas.indexOf(arrastrada), 1);
    celdas.splice(celdas.indexOf(celda), 0, arrastrada);
    reordenar();
    sincronizarUrls();
  });
  celda.addEventListener('dragend', () => {
    celdas.forEach(c => { limpiarMarcas(c); c.classList.remove('arrastrada'); });
    document.body.classList.remove('arrastrando');
    arrastrada = null;
  });
}

// Quita un cuadro sin recargar los demás (en la vista de favoritos, lo saca de favoritos)
function quitar(celda) {
  celdas = celdas.filter(c => c !== celda);
  celda.remove();
  reordenar();
  sincronizarUrls();
  ajustarGrilla();
  pintarFavsBoton();
}
