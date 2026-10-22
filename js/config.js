// Multi YouTube — config.js
// Configuración: constantes, referencias a elementos, guardar/cargar, listas, duraciones memorizadas.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const CLAVE = 'multiyoutube.config.v1';
const MAX_FAV = 9;
const VALOR_FAV = '__favoritos__';
const $ = id => document.getElementById(id);
const contenedor = $('contenedor');
const vacio = $('vacio');
const fondo = $('fondo');
const txt = $('urls');
const aviso = $('aviso');
const chkAutoplay = $('chkAutoplay');
const chkMute = $('chkMute');
const btnModoAudio = $('btnModoAudio');
const btnPantalla = $('btnPantalla');
const btnFavs = $('btnFavs');
const selLista = $('selLista');
const nombreLista = $('nombreLista');
const btnEliminar = $('btnEliminar');

let config = {
  listas: { 'Principal': [] }, actual: 'Principal',
  favoritos: [], vistaFav: false,
  autoplay: true, mute: true, modoAudio: false,
  fade: 7,      // segundos de fundido al pasar el audio de un video a otro (0 = sin fundido)
  fadeImg: 1.5, // segundos de fundido de imagen al cambiar de video ampliado (0 = sin fundido)
  ultimos: {},  // último video seleccionado por vista, para retomarlo al cargar
  carruselSeg: 30, // cada cuántos segundos cambia el carrusel
  inicioAleatorio: true, // los videos que no son en vivo parten en un punto al azar
  alTerminarSiguiente: true, // al terminar un video, el audio pasa al siguiente
  pausarOcultos: true,   // en pantalla completa pausa los ocultos (salvo el anterior y el siguiente)
  visualActivo: false,   // visualizador encendido (se reactiva solo al recargar)
  visualEntrada: '',     // deviceId de la entrada de audio ('' = automático: busca "Mezcla estéreo")
  duraciones: {},        // memoria de duraciones { idVideo: { d: segundos, vivo: bool, t: fecha } }
  visualColor: 'fuego',  // paleta del visualizador
  visualTipo: 'barras',  // barras | espejo | onda | circular | hud | vintage | tunel | seda
  protectorMin: 5,       // minutos sin actividad para el protector de pantalla (0 = apagado)
  nombres: {},           // memoria de nombres { claveLinea: { titulo, autor, vivo, canal, directo, t } } para buscar parecidos
  handles: {},           // @handle (o c/nombre, user/nombre) → ID del canal (UC…), averiguado por servidor.py
  guardado: 0            // cuándo se guardó por última vez: decide qué copia es la más nueva (navegador o archivo)
};
const CONFIG_INICIAL = JSON.parse(JSON.stringify(config));   // valores por defecto, para datos que lleguen incompletos
const MAX_DURACIONES = 800;
const MAX_NOMBRES = 800;
let celdas = [];        // celdas en el orden visual
let comentarios = [];   // líneas '#' de la lista actual (se conservan al reordenar)
let creandoLista = false;

// ---------- Persistencia ----------
function cargar() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) {
      const c = JSON.parse(raw);
      // Migración desde la versión con una sola lista
      if (Array.isArray(c.urls) && !c.listas) { c.listas = { 'Principal': c.urls }; c.actual = 'Principal'; }
      delete c.urls;
      config = Object.assign(config, c);
    }
  } catch (e) { /* sin storage, seguimos en memoria */ }
  normalizarConfig();
}
// Completa o corrige lo que falte o venga dañado (de una versión anterior, de un respaldo, del archivo)
function normalizarConfig() {
  if (!config.listas || !Object.keys(config.listas).length) config.listas = { 'Principal': [] };
  if (!config.listas[config.actual]) config.actual = Object.keys(config.listas)[0];
  if (!Array.isArray(config.favoritos)) config.favoritos = [];
  if (!config.ultimos || typeof config.ultimos !== 'object') config.ultimos = {};
  if (!config.duraciones || typeof config.duraciones !== 'object') config.duraciones = {};
  if (!config.nombres || typeof config.nombres !== 'object') config.nombres = {};
  if (!config.handles || typeof config.handles !== 'object') config.handles = {};
}

// ---------- Nombres memorizados ----------
// Guarda el título y el canal de cada línea de la lista apenas el reproductor los informa.
// Sirve para mostrar el nombre aunque el video deje de existir, y para "Buscar parecido".
function recordarNombre(claveLinea, titulo, autor, vivo) {
  if (!claveLinea || (!titulo && !autor)) return;
  const prev = config.nombres[claveLinea] || {};
  const nuevo = Object.assign({}, prev, {   // conserva lo demás que se sabe (canal, directo)
    titulo: titulo || prev.titulo || '',
    autor: autor || prev.autor || '',
    vivo: vivo == null ? !!prev.vivo : !!vivo,
    t: Date.now()
  });
  if (prev.titulo === nuevo.titulo && prev.autor === nuevo.autor && prev.vivo === nuevo.vivo) return;
  config.nombres[claveLinea] = nuevo;
  const ks = Object.keys(config.nombres);
  if (ks.length > MAX_NOMBRES) {
    ks.sort((a, b) => config.nombres[a].t - config.nombres[b].t)
      .slice(0, ks.length - MAX_NOMBRES).forEach(k => delete config.nombres[k]);
  }
  guardar();
}

// ---------- Duraciones y punto al azar ----------
// YouTube no entrega la duración de un video sin cargarlo (para eso habría que usar su API con clave).
// Por eso la página la memoriza la primera vez que el video carga; desde la siguiente carga ya la sabe
// y arma la URL con start=<segundo al azar>, así el video parte directo ahí, sin verse el salto.
// Rango: entre el segundo 10 y la duración menos 10.
function segundoAleatorio(dur) {
  if (!dur || dur <= 30) return 0;   // videos muy cortos: desde el inicio
  return Math.floor(10 + Math.random() * (dur - 20));
}
function recordarDuracion(id, dur, vivo) {
  if (!id) return;
  const prev = config.duraciones[id];
  if (prev && prev.vivo === vivo && Math.abs((prev.d || 0) - (dur || 0)) < 1) return;
  config.duraciones[id] = { d: Math.round(dur || 0), vivo: !!vivo, t: Date.now() };
  // Mantener la memoria acotada: se borran los más antiguos
  const ids = Object.keys(config.duraciones);
  if (ids.length > MAX_DURACIONES) {
    ids.sort((a, b) => config.duraciones[a].t - config.duraciones[b].t)
       .slice(0, ids.length - MAX_DURACIONES).forEach(k => delete config.duraciones[k]);
  }
  guardar();
}
function guardar() {
  config.guardado = Date.now();
  try { localStorage.setItem(CLAVE, JSON.stringify(config)); } catch (e) { }
  programarSubida();   // y la copia en archivo (sincronizar.js)
}
// Lo que se está mostrando: favoritos o la lista elegida
function fuente() { return config.vistaFav ? config.favoritos : (config.listas[config.actual] || []); }
function fijarFuente(lineas) {
  if (config.vistaFav) config.favoritos = lineas;
  else config.listas[config.actual] = lineas;
}
