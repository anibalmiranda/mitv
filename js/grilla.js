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
// reutilizar = true (al cambiar de lista o de vista, reemplazar o agregar una URL): los videos que ya estaban en
// pantalla se conservan con su reproductor andando, sin recargarse. Los cuadros se ordenan con CSS (order),
// así que un cuadro reutilizado nunca se mueve en la página (moverlo recargaría su reproductor).
// Sin reutilizar (cambiaron ajustes que van en la dirección del reproductor, o se importaron datos), todo se crea de nuevo.
function render(reutilizar) {
  const sonabaAntes = celdas.find(c => c.dataset.mute === '0') || null;   // para anotar si el audio se pierde
  cerrarTira();
  olvidarSilencioGeneral();   // las celdas se vuelven a crear
  if (carrusel && carrusel.vista !== vistaId()) detenerCarrusel();   // el carrusel es de la vista en que partió
  terminarFundidoImagen();
  const anteriores = new Map();   // clave → cuadro de la vista anterior con reproductor
  if (reutilizar) celdas.forEach(c => {
    const k = clave(c.dataset.linea);
    if (k && c.querySelector(SEL_REPRODUCTOR) && !anteriores.has(k)) anteriores.set(k, c);
  });
  const reutilizadas = new Set();
  // Lo que no se puede reutilizar se quita ya; lo reutilizable espera a ver si la vista nueva lo usa (al final)
  const candidatas = new Set(anteriores.values());
  [...contenedor.children].forEach(c => { if (!candidatas.has(c)) c.remove(); });
  celdas = [];
  comentarios = [];

  $('vacioTitulo').textContent = config.vistaFav ? 'Aún no tienes favoritos' : 'Sin videos en esta lista';
  $('vacioTexto').textContent = config.vistaFav
    ? 'Vuelve a una lista y marca hasta 9 videos con la ☆ (aparece al pasar el mouse por un cuadro)'
    : 'Presiona el engranaje ⚙ arriba a la derecha y pega una URL de YouTube por línea';

  let yaHayAudio = false;
  let idx = 0;
  // Último video seleccionado en esta vista: se retoma al cargar. Si se sabe bloqueado fuera de YouTube no se retoma:
  // no podría sonar, y el que suena se quedaría sin audio.
  const ult = config.ultimos[vistaId()];
  const hayUlt = !!ult && fuente().some(l => clave(l) === ult.clave && !esExternoConocido(l));
  // Si el que sonaba también está en esta vista (y no hay que retomar otro), sigue sonando sin cortarse
  const sigueSonando = (!hayUlt && [...anteriores.values()].find(c => c.dataset.mute === '0' && puedeSonar(c) &&
                          fuente().some(l => clave(l) === clave(c.dataset.linea)))) || null;
  if (sigueSonando) yaHayAudio = true;
  let pendiente = null;

  fuente().forEach(linea => {
    const item = parsear(linea);
    if (!item) { if (linea.trim()) comentarios.push(linea); return; }

    // ¿Ya estaba en pantalla? Se conserva tal cual (sigue reproduciendo) y solo se ajusta a esta vista
    const previa = item.tipo !== 'error' && anteriores.get(clave(linea));
    if (previa && !reutilizadas.has(previa)) {
      reutilizadas.add(previa);
      const esUlt = !previa._externo && hayUlt && !pendiente && clave(linea) === ult.clave;
      const muteado = previa !== sigueSonando && (previa._externo || hayUlt || config.mute || yaHayAudio);
      if (esUlt) { previa.dataset.pendiente = '1'; pendiente = previa; }
      else if (muteado && previa.dataset.mute === '0') conCausa('cambio de lista: esta lista retoma otro video', () => fijarAudio(previa, true));
      else if (!muteado && previa.dataset.mute === '1') conCausa('cambio de lista', () => fijarAudio(previa, false));
      if (!muteado || (esUlt && previa.dataset.mute === '0')) yaHayAudio = true;
      previa.dataset.linea = linea;
      previa.classList.remove('max', 'entrando');
      const bMax = previa.querySelector('.maximizar');
      if (bMax) bMax.textContent = '⤢';
      const bQuitar = previa.querySelector('.quitar');
      if (bQuitar) bQuitar.title = config.vistaFav ? 'Quitar de favoritos' : 'Quitar';
      pintarFav(previa);
      pintarSuperFavCelda(previa);
      pintarFondoCelda(previa);
      pintarAudio(previa);
      previa.style.order = celdas.length;
      celdas.push(previa);
      idx++;
      return;
    }

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
      const esExterno = !esCamara && esExternoConocido(linea);   // bloqueado por su dueño: no puede sonar aquí
      const esUlt = !esCamara && !esExterno && hayUlt && !pendiente && clave(linea) === ult.clave;
      const muteado = esCamara || esExterno || hayUlt || config.mute || yaHayAudio;
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
      } else if (item.tipo === 'hls') {
        // Canal de TV (tv.js): también espera su turno en la carga escalonada, mostrando su logo
        celda.appendChild(crearTv(celda, item));
        celda.classList.add('esperando');
        if (celda.dataset.thumb) celda.style.backgroundImage = 'url("' + celda.dataset.thumb + '")';
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
      else if (item.tipo === 'hls' && infoTv(linea)) fila.querySelector('.autor').textContent = infoTv(linea).grupo || '';
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
        // (clic en el que ya suena = silenciarlo)
        const causa = celda.dataset.mute === '0' ? 'clic en el cuadro que sonaba (lo silencia)' : 'clic en el cuadro';
        if (config.modoAudio) { conCausa(causa, () => alternarAudio(celda)); return; }
        timerClic = setTimeout(() => conCausa(causa, () => alternarAudio(celda)), 250);
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

      const bSuper = document.createElement('button');
      bSuper.className = 'superfav';
      bSuper.textContent = '👑';
      bSuper.addEventListener('click', () => alternarSuperFav(celda));
      celda.appendChild(bSuper);

      if (!esCamara) {
        const bFondo = document.createElement('button');
        bFondo.className = 'fondo';
        bFondo.textContent = '🎵';
        bFondo.addEventListener('click', () => alternarFondoCelda(celda));
        celda.appendChild(bFondo);
      }

      const bMover = document.createElement('button');
      bMover.className = 'mover';
      bMover.textContent = '⇄';
      bMover.title = 'Mover o copiar a otra lista';
      bMover.addEventListener('click', () => abrirMover(celda));
      celda.appendChild(bMover);

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
      pintarSuperFavCelda(celda);
      pintarFondoCelda(celda);
      pintarAudio(celda);
      if (esExterno) marcarExterno(celda);
      idx++;
    }

    const btn = document.createElement('button');
    btn.className = 'quitar';
    btn.title = config.vistaFav ? 'Quitar de favoritos' : 'Quitar';
    btn.textContent = '✕';
    // En la vista ampliada pide confirmar (segundo clic); en la grilla quita al tiro
    btn.addEventListener('click', () => {
      if (celda.classList.contains('max') && !btn.classList.contains('confirmar')) {
        btn.classList.add('confirmar');
        btn.textContent = '¿Quitar este canal? Clic de nuevo';
        btn._timer = setTimeout(() => { btn.classList.remove('confirmar'); btn.textContent = '✕'; }, 3500);
        return;
      }
      clearTimeout(btn._timer);
      quitar(celda);
    });
    celda.appendChild(btn);

    habilitarArrastre(celda);
    celda.style.order = celdas.length;
    celdas.push(celda);
    contenedor.appendChild(celda);
  });
  anteriores.forEach(c => { if (!reutilizadas.has(c)) c.remove(); });   // estaban, pero no en esta vista
  actualizarCarga();
  aplicarModoAudio(false);
  pintarFavsBoton();
  if (pendiente) conCausa('retomar el último video de esta lista', () => prepararRetomar(pendiente, ult));
  else ocultarAvisoRetomar();
  pintarAmpliado();   // los cuadros cambiaron: ¿quedó alguno ampliado?
  // ¿Se perdió el audio sin que nadie lo silenciara? (el que sonaba no está en la vista nueva, o se recargó todo)
  if (sonabaAntes && !sonabaAntes.isConnected && !celdas.some(c => c.dataset.mute === '0' || c.dataset.pendiente))
    anotarAudio(sonabaAntes, false, reutilizar ? 'cambio de lista: ese video no está en la lista nueva'
                                               : 'se recargó toda la grilla (cambio de ajustes o de datos)');
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
  const videos = celdas.filter(c => c.querySelector(SEL_REPRODUCTOR) && !c._externo);
  // Ahorro por inactividad: solo el que suena y el que se está viendo ampliado
  if (enAhorro) return new Set(videos.filter(c => c.dataset.mute === '0' || c.dataset.pendiente ||
                                                  c.classList.contains('max') || (fundido && fundido.nueva === c)));
  const limite = Number(config.maxActivos) || 0;
  if (!limite || videos.length <= limite) return new Set(videos);
  // Con uno ampliado, el anterior y el siguiente quedan precargados (las flechas y el carrusel cambian sin espera)
  const vecinos = vecinosDelAmpliado();
  const activas = new Set(videos.filter(c => c.dataset.mute === '0' || c.dataset.pendiente ||
                                              c.classList.contains('max') || c._despierta || vecinos.has(c)));
  for (const c of videos) { if (activas.size >= limite) break; activas.add(c); }
  return activas;
}
function vecinosDelAmpliado() {
  if (!contenedor.querySelector('.celda.max')) return new Set();
  return new Set([...(vecinosActivos() || [])].filter(c => c.querySelector(SEL_REPRODUCTOR)));
}
function actualizarCarga() {
  const activas = celdasActivas();
  celdas.forEach(c => { if (c.querySelector(SEL_REPRODUCTOR) && !activas.has(c)) dormirCelda(c); });
  const pendientes = celdas.filter(c => { const f = c.querySelector(SEL_REPRODUCTOR); return f && f.dataset.src && activas.has(c); });
  // Primero el que suena, después el ampliado y sus vecinos (precarga), después el resto en orden
  const vecinos = vecinosDelAmpliado();
  const prioridad = c => (c.dataset.pendiente || c.dataset.mute === '0') ? 0 : (c.classList.contains('max') || vecinos.has(c)) ? 1 : 2;
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
  const ifr = celda.querySelector(SEL_REPRODUCTOR);
  if (!ifr || !ifr.dataset.src || celda._externo) return;
  const src = ifr.dataset.src;
  delete ifr.dataset.src;
  if (ifr.tagName === 'VIDEO') iniciarTv(celda, ifr, src);   // canal de TV
  else ifr.src = src;
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
  if (item.tipo === 'hls') return item.id;   // canal de TV: su dirección tal cual
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
  if (thumb && celda.classList.contains('en-vivo') && thumb.includes('/mqdefault.jpg'))
    thumb = thumb.replace('/mqdefault.jpg', '/mqdefault_live.jpg') + '?t=' + Math.floor(Date.now() / 300000);
  celda.style.backgroundImage = thumb ? 'url("' + thumb + '")' : '';
}
function dormirCelda(celda) {
  const ifr = celda.querySelector(SEL_REPRODUCTOR);
  if (!ifr || celda._externo) return;
  if (!ifr.dataset.src) {   // estaba cargado: se descarga
    detenerRampa(celda);
    olvidarReproductor(celda);
    ifr.dataset.src = urlRecarga(celda);
    if (ifr.tagName === 'VIDEO') detenerTv(celda, ifr);   // canal de TV: se suelta su conexión
    else ifr.src = 'about:blank';
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

// ---------- Ahorro por inactividad ----------
// Tras config.ahorroMin minutos sin mover el mouse ni tocar el teclado (nadie está mirando), se descargan todos
// los reproductores menos el que suena y el ampliado, y se cortan las cámaras: cada reproductor de YouTube
// mantiene varias conexiones abiertas (video, anuncios, estadísticas) y el router lo nota. Con el primer
// movimiento todo vuelve a cargar (escalonado). No se activa con el carrusel andando (alguien está mirando).
let enAhorro = false;
function revisarAhorro() {
  const min = Number(config.ahorroMin) || 0;
  if (!min || enAhorro || carrusel || Date.now() - ultimaActividad < min * 60000) return;
  enAhorro = true;
  actualizarCarga();
  ajustarCamaras();
  mostrarMensaje('💤 Ahorro: sin actividad, solo sigue el video que suena');
}
function salirAhorro() {
  if (!enAhorro) return;
  enAhorro = false;
  actualizarCarga();
  ajustarCamaras();
  mostrarMensaje('👀 Volviendo a cargar los videos');
}
setInterval(revisarAhorro, 15000);

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
// Si era el que estaba ampliado (doble clic o pantalla completa), la vista avanza al siguiente, como con la flecha →
// (también al moverlo a otra lista con ⇄, que usa esta misma función).
function quitar(celda) {
  const eraAmpliado = celda.classList.contains('max') || !!(fundido && fundido.nueva === celda);
  let siguiente = null;
  if (eraAmpliado) {
    terminarFundidoImagen();
    const lista = validas();
    if (lista.length > 1) siguiente = lista[(lista.indexOf(celda) + 1) % lista.length];
  }
  if (celda.dataset.mute === '0') anotarAudio(celda, false, causaAudio || 'quitaste el cuadro que sonaba');
  celdas = celdas.filter(c => c !== celda);
  celda.remove();
  reordenar();
  sincronizarUrls();
  ajustarGrilla();
  pintarFavsBoton();
  if (siguiente) conCausa(causaAudio || 'quitaste el canal ampliado: pasa al siguiente', () => irA(siguiente));
  else if (eraAmpliado) pintarAmpliado();   // era el último: vuelve a la grilla
}
