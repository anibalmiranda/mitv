// Multi YouTube — externos.js
// Videos y directos cuyo dueño no deja verlos fuera de youtube.com (errores 101 / 150 del reproductor).
// YouTube los bloquea en cualquier página: no se pueden reproducir en la grilla. En vez de un aviso inútil,
// el cuadro muestra la imagen en vivo que publica YouTube (se refresca sola) y un botón para verlo en YouTube,
// en una ventana chica aparte, encima del cuadro y de su tamaño, que se reutiliza. No le quita el audio al video que suena.
// Se recuerda (config.nombres[clave].externo) para no gastar conexiones intentando cargarlo cada vez; se vuelve
// a intentar una vez al día por si el canal lo permite de nuevo, o a mano con "reintentar aquí".
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const REINTENTO_EXTERNO_MS = 24 * 3600 * 1000;
const REFRESCO_MINIATURA_MS = 2 * 60 * 1000;

// ¿Ya se sabe que este video no se puede incrustar (y no toca reintentar todavía)?
function esExternoConocido(linea) {
  const mem = config.nombres[clave(linea)];
  return !!(mem && mem.externo && Date.now() - mem.externo < REINTENTO_EXTERNO_MS);
}

function marcarExterno(celda) {
  const k = clave(celda.dataset.linea);
  const mem = config.nombres[k] || (config.nombres[k] = { titulo: '', autor: '', vivo: celda.classList.contains('en-vivo'), t: Date.now() });
  if (!mem.externo) { mem.externo = Date.now(); guardar(); }
  celda._externo = true;
  celda.classList.add('externo');
  celda.classList.remove('esperando', 'dormida');
  // Tenía el audio pero no puede sonar aquí: el audio pasa al siguiente que sí pueda (si no hay, silencio)
  if (celda.dataset.mute === '0') {
    const lista = celdas.filter(c => c === celda || puedeSonar(c));
    const sig = lista.length > 1 ? lista[(lista.indexOf(celda) + 1) % lista.length] : null;
    conCausa('el video que sonaba está bloqueado fuera de YouTube', () => (sig ? alternarAudio(sig) : fijarAudio(celda, true)));
    if (sig) mostrarMensaje('🔒 Ese video solo se ve en YouTube: el audio pasa a ' + ((sig.querySelector('.titulo') || {}).textContent || 'el siguiente'));
  }

  let av = celda.querySelector('.aviso-externo');
  if (!av) {
    av = document.createElement('div');
    av.className = 'aviso-externo';
    av.innerHTML = '<span class="etq-vivo">EN VIVO</span><b class="nombre"></b>' +
                   '<span class="motivo">🔒 El dueño solo permite verlo en YouTube</span>' +
                   '<button type="button" class="ver">▶ Ver en YouTube</button>' +
                   '<span class="acciones"><a href="#" class="reintentar">reintentar aquí</a> · <a href="#" class="parecido">buscar otro</a></span>';
    av.querySelector('.ver').addEventListener('click', e => { e.stopPropagation(); verEnYouTube(celda); });
    av.querySelector('.reintentar').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); reintentarAqui(celda); });
    av.querySelector('.parecido').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); abrirBuscar(celda); });
    av.addEventListener('dblclick', e => { e.stopPropagation(); verEnYouTube(celda); });
    av.addEventListener('pointerdown', e => e.stopPropagation());
    celda.appendChild(av);
  }
  av.querySelector('.nombre').textContent = [mem.titulo, mem.autor].filter(Boolean).join(' — ') ||
    (celda.querySelector('.titulo') || {}).textContent || '';
  const est = celda.querySelector('.fila-audio .estado');
  if (est) est.textContent = '🔒 solo en YouTube';
  setTimeout(() => refrescarMiniaturaExterno(celda), 0);   // al armar la grilla, el cuadro aún no está en la página
}

// La miniatura "_live" de YouTube muestra un cuadro reciente de la transmisión: se vuelve a pedir cada 2 min
function refrescarMiniaturaExterno(celda) {
  clearTimeout(celda._timerExterno);
  if (!celda.isConnected || !celda._externo) return;
  const av = celda.querySelector('.aviso-externo');
  let thumb = celda.dataset.thumb;
  if (thumb && celda.classList.contains('en-vivo'))
    thumb = thumb.replace('/mqdefault.jpg', '/mqdefault_live.jpg') + '?t=' + Math.floor(Date.now() / REFRESCO_MINIATURA_MS);
  if (av) av.style.setProperty('--miniatura', thumb ? 'url("' + thumb + '")' : 'none');
  celda._timerExterno = setTimeout(() => refrescarMiniaturaExterno(celda), REFRESCO_MINIATURA_MS);
}

function verEnYouTube(celda) {
  const p = parsear(celda.dataset.linea);
  let url = urlOriginal(celda.dataset.linea);
  if (p && p.tipo === 'canal') url = 'https://www.youtube.com/channel/' + encodeURIComponent(p.id) + '/live';
  if (!url) return;
  // Siempre la misma ventana chica (si ya estaba abierta, se reutiliza), justo encima del cuadro y de su tamaño
  const pos = posicionVentana(celda);
  const v = window.open(url, 'multiyoutube-youtube',
                        'popup,width=' + pos.ancho + ',height=' + pos.alto + ',left=' + pos.x + ',top=' + pos.y);
  if (!v) { mostrarMensaje('El navegador bloqueó la ventana: permite las ventanas emergentes para esta página'); return; }
  try { v.moveTo(pos.x, pos.y); v.resizeTo(pos.ancho, pos.alto); } catch (e) { }   // la reutilizada también se acomoda
  v.focus();
  silenciarPorVentana(v);
}

// Mientras la ventana de YouTube está abierta, Multi YouTube queda en silencio (si no, se oyen los dos). Al cerrarla
// vuelve el audio a lo que sonaba, salvo que mientras tanto hayas activado el sonido a mano.
const REVISION_VENTANA_MS = 1000;
let ventanaYT = { ventana: null, silencio: '', timer: null };   // silencio: '' | 'grilla' | 'fondo'
function silenciarPorVentana(v) {
  ventanaYT.ventana = v;
  // Cada vez que se abre (también si ya estaba abierta y volviste a activar el sonido a mano)
  let silencio = '';
  if (fondoActivo) {
    if (!fondoSilenciado) { alternarSilencioFondo(); silencio = 'fondo'; }
  } else if (!silencioGeneral && celdas.some(c => c.dataset.mute === '0')) {
    btnMuteGeneral.click();
    silencio = 'grilla';
  }
  if (silencio) {
    ventanaYT.silencio = silencio;
    mostrarMensaje('🔇 Multi YouTube en silencio mientras ves la ventana de YouTube');
  }
  clearInterval(ventanaYT.timer);
  ventanaYT.timer = setInterval(() => { if (!ventanaYT.ventana || ventanaYT.ventana.closed) ventanaCerrada(); }, REVISION_VENTANA_MS);
}
function ventanaCerrada() {
  clearInterval(ventanaYT.timer);
  const s = ventanaYT.silencio;
  ventanaYT = { ventana: null, silencio: '', timer: null };
  // Solo si sigue el silencio que puso la ventana (si activaste el sonido a mano, no se toca)
  if (s === 'grilla' && silencioGeneral && !fondoActivo) btnMuteGeneral.click();
  else if (s === 'fondo' && fondoActivo && fondoSilenciado) alternarSilencioFondo();
  else return;
  mostrarMensaje('🔊 Se cerró la ventana de YouTube: vuelve el audio de Multi YouTube');
}
// Dónde va la ventana: sobre el cuadro, de su tamaño (mín. 480 × 300). Con el cuadro ampliado (ocupa toda la
// pantalla) se limita al 70% de la pantalla, centrada sobre él.
const VENTANA_MIN = { ancho: 480, alto: 300 };
const VENTANA_MAX_AMPLIADO = 0.7;
function posicionVentana(celda) {
  const r = celda.getBoundingClientRect();
  // Bordes del navegador (barra de pestañas y direcciones); en pantalla completa no hay
  const bordeX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const bordeY = Math.max(0, window.outerHeight - window.innerHeight - bordeX);
  let ancho = Math.max(VENTANA_MIN.ancho, Math.round(r.width));
  let alto = Math.max(VENTANA_MIN.alto, Math.round(r.height));
  let x = window.screenX + bordeX + r.left, y = window.screenY + bordeY + r.top;
  if (celda.classList.contains('max')) {
    const maxAncho = Math.round(screen.availWidth * VENTANA_MAX_AMPLIADO), maxAlto = Math.round(screen.availHeight * VENTANA_MAX_AMPLIADO);
    if (ancho > maxAncho || alto > maxAlto) {
      const f = Math.min(maxAncho / ancho, maxAlto / alto);
      x += (ancho - ancho * f) / 2;
      y += (alto - alto * f) / 2;
      ancho = Math.round(ancho * f);
      alto = Math.round(alto * f);
    }
  }
  return { x: Math.round(x), y: Math.round(y), ancho, alto };
}

function reintentarAqui(celda) {
  const mem = config.nombres[clave(celda.dataset.linea)];
  if (mem) { delete mem.externo; guardar(); }
  celda._externo = false;
  celda.classList.remove('externo');
  clearTimeout(celda._timerExterno);
  const av = celda.querySelector('.aviso-externo');
  if (av) av.remove();
  const ifr = celda.querySelector(SEL_REPRODUCTOR);
  if (!ifr) return;
  olvidarReproductor(celda);
  ifr.dataset.src = urlRecarga(celda);
  cargarYa(celda);
  mostrarMensaje('Reintentando… si el dueño sigue sin permitirlo, vuelve a aparecer el aviso');
}
