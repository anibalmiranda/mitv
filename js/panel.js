// Multi YouTube — panel.js
// Selector de listas y panel de configuración (⚙).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Listas guardadas ----------
function pintarSelector() {
  selLista.innerHTML = '';
  const of = document.createElement('option');
  of.value = VALOR_FAV;
  of.textContent = '★ Favoritos (' + cantFavs() + '/' + MAX_FAV + ')';
  selLista.appendChild(of);
  Object.keys(config.listas).forEach(n => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n + ' (' + config.listas[n].filter(l => parsear(l)).length + ')';
    selLista.appendChild(o);
  });
  selLista.value = config.vistaFav ? VALOR_FAV : config.actual;
}
selLista.addEventListener('change', () => {
  if (selLista.value === VALOR_FAV) {
    config.vistaFav = true;
  } else {
    config.vistaFav = false;
    config.actual = selLista.value;
  }
  guardar();
  render(true);
  pintarSelector();
  selLista.blur();
});

function nombreLibre(base) {
  let i = Object.keys(config.listas).length + 1, n;
  do { n = base + ' ' + i++; } while (config.listas[n]);
  return n;
}

// ---------- Panel ----------
function abrirPanel() {
  creandoLista = false;
  const fav = config.vistaFav;
  $('tituloPanel').textContent = fav ? '★ Favoritos (máx. ' + MAX_FAV + ', comunes a todas las listas)' : 'Configurar lista';
  $('filaNombre').style.display = fav ? 'none' : '';
  nombreLista.value = config.actual;
  txt.value = fuente().join('\n');
  chkAutoplay.checked = config.autoplay;
  chkMute.checked = config.mute;
  $('chkAleatorio').checked = config.inicioAleatorio;
  $('chkSiguiente').checked = config.alTerminarSiguiente;
  $('chkPausarOcultos').checked = config.pausarOcultos;
  $('numFade').value = config.fade;
  $('numFadeImg').value = config.fadeImg;
  $('numCarrusel').value = config.carruselSeg;
  $('numProtector').value = config.protectorMin;
  $('numMaxActivos').value = config.maxActivos || 0;
  $('numAhorro').value = config.ahorroMin || 0;
  llenarCamposCuenta();
  llenarSelectorEntrada();
  aviso.textContent = '';
  aviso.classList.remove('ok');
  resetEliminar();
  fondo.classList.add('abierto');
  setTimeout(() => txt.focus(), 50);
}
function cerrarPanel() {
  fondo.classList.remove('abierto');
  creandoLista = false;
  resetEliminar();
  respaldoPendiente = null;          // si quedó una importación a medio elegir, se descarta
  mostrarOpcionesImportar(false);
}

$('btnNueva').addEventListener('click', () => {
  creandoLista = true;
  nombreLista.value = nombreLibre('Lista');
  txt.value = '';
  aviso.textContent = 'Nueva lista: ponle nombre, pega las URLs y guarda.';
  nombreLista.select();
});

let timerEliminar = null;
function resetEliminar() {
  clearTimeout(timerEliminar);
  btnEliminar.classList.remove('confirmar');
  btnEliminar.textContent = 'Eliminar lista';
}
btnEliminar.addEventListener('click', () => {
  if (creandoLista) { abrirPanel(); return; }   // cancela la creación
  if (Object.keys(config.listas).length <= 1) { aviso.textContent = 'Debe quedar al menos una lista.'; return; }
  if (!btnEliminar.classList.contains('confirmar')) {
    btnEliminar.classList.add('confirmar');
    btnEliminar.textContent = '¿Seguro? Clic de nuevo';
    timerEliminar = setTimeout(resetEliminar, 3000);
    return;
  }
  delete config.listas[config.actual];
  delete config.ultimos['lista:' + config.actual];
  config.actual = Object.keys(config.listas)[0];
  guardar();
  render(true);
  pintarSelector();
  cerrarPanel();
});

// Lo que obliga a recargar los videos: qué se muestra y los ajustes que van en la URL de cada reproductor
function huellaRender() {
  return JSON.stringify([vistaId(), fuente(), config.autoplay, config.mute, config.inicioAleatorio]);
}

function guardarPanel() {
  const lineas = txt.value.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
  const huellaAntes = huellaRender();
  const ajustesReproductor = () => JSON.stringify([config.autoplay, config.mute, config.inicioAleatorio]);
  const ajustesAntes = ajustesReproductor();

  if (config.vistaFav) {
    // Favoritos: máximo 9 y sin repetidos
    const vistos = new Set();
    const validos = lineas.filter(l => { const k = clave(l); if (!k || vistos.has(k)) return false; vistos.add(k); return true; });
    if (validos.length > MAX_FAV) { aviso.textContent = 'Máximo ' + MAX_FAV + ' favoritos: hay ' + validos.length + '. Quita algunos.'; return; }
    config.favoritos = validos;
  } else {
    const nombre = nombreLista.value.trim() || (creandoLista ? nombreLibre('Lista') : config.actual);
    if (creandoLista) {
      if (config.listas[nombre]) { aviso.textContent = 'Ya existe una lista con ese nombre.'; return; }
      config.listas[nombre] = lineas;
    } else if (nombre !== config.actual) {
      if (config.listas[nombre]) { aviso.textContent = 'Ya existe una lista con ese nombre.'; return; }
      // Renombrar manteniendo la posición en el selector
      const nuevas = {};
      Object.keys(config.listas).forEach(k => { nuevas[k === config.actual ? nombre : k] = config.listas[k]; });
      config.listas = nuevas;
      config.listas[nombre] = lineas;
      // El último video seleccionado se recuerda por nombre de lista: pasa al nombre nuevo
      const ult = config.ultimos['lista:' + config.actual];
      delete config.ultimos['lista:' + config.actual];
      if (ult) config.ultimos['lista:' + nombre] = ult;
    } else {
      config.listas[nombre] = lineas;
    }
    config.actual = nombre;
  }
  config.autoplay = chkAutoplay.checked;
  config.mute = chkMute.checked;
  config.inicioAleatorio = $('chkAleatorio').checked;
  config.alTerminarSiguiente = $('chkSiguiente').checked;
  config.pausarOcultos = $('chkPausarOcultos').checked;
  config.fade = Math.min(20, Math.max(0, parseInt($('numFade').value, 10) || 0));
  config.fadeImg = Math.min(10, Math.max(0, parseFloat($('numFadeImg').value) || 0));
  config.carruselSeg = Math.min(600, Math.max(5, parseInt($('numCarrusel').value, 10) || 30));
  config.protectorMin = Math.min(120, Math.max(0, parseInt($('numProtector').value, 10) || 0));
  config.maxActivos = Math.min(50, Math.max(0, parseInt($('numMaxActivos').value, 10) || 0));
  config.ahorroMin = Math.min(240, Math.max(0, parseInt($('numAhorro').value, 10) || 0));
  if (!config.ahorroMin) salirAhorro();
  leerCamposCuenta();
  // Entrada del visualizador: si cambió y está encendido, se reinicia con la nueva
  const nuevaEntrada = $('selEntrada').value;
  const cambioEntrada = nuevaEntrada !== (config.visualEntrada || '') && !(nuevaEntrada === '' && !config.visualEntrada);
  if (cambioEntrada) {
    config.visualEntrada = nuevaEntrada;
    if (visual) { detenerVisual(false); iniciarVisual(false); }
  }
  guardar();
  // Si solo cambiaron ajustes que se leen al vuelo (fundidos, carrusel, protector, modo liviano...), los videos siguen sin recargarse
  // (y si cambió la lista pero no los ajustes del reproductor, los videos que siguen en ella no se recargan)
  if (huellaRender() !== huellaAntes) render(ajustesReproductor() === ajustesAntes);
  else { programarPausaOcultos(); reiniciarCarrusel(); pintarCarrusel(); actualizarCarga(); }
  pintarSelector();

  const malas = lineas.map(parsear).filter(x => x && x.tipo === 'error' && !x.pendiente);   // @handle en búsqueda no cuentan
  if (malas.length) {
    aviso.textContent = `Ojo: ${malas.length} línea(s) no se reconocieron (aparecen marcadas en la grilla).`;
    setTimeout(cerrarPanel, 1800);
  } else {
    cerrarPanel();
  }
}
