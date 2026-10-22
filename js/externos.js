// Multi YouTube — externos.js
// Videos y directos cuyo dueño no deja verlos fuera de youtube.com (errores 101 / 150 del reproductor).
// YouTube los bloquea en cualquier página: no se pueden reproducir en la grilla. En vez de un aviso inútil,
// el cuadro muestra la imagen en vivo que publica YouTube (se refresca sola) y un botón para verlo en YouTube,
// en una ventana aparte que se reutiliza. No le quita el audio al video que suena.
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
  if (celda.dataset.mute === '0') fijarAudio(celda, true);   // no puede sonar aquí

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
  // Siempre la misma ventana: si ya estaba abierta, se reutiliza
  const v = window.open(url, 'multiyoutube-youtube', 'popup,width=1100,height=650');
  if (v) v.focus();
  else mostrarMensaje('El navegador bloqueó la ventana: permite las ventanas emergentes para esta página');
}

function reintentarAqui(celda) {
  const mem = config.nombres[clave(celda.dataset.linea)];
  if (mem) { delete mem.externo; guardar(); }
  celda._externo = false;
  celda.classList.remove('externo');
  clearTimeout(celda._timerExterno);
  const av = celda.querySelector('.aviso-externo');
  if (av) av.remove();
  const ifr = celda.querySelector('iframe');
  if (!ifr) return;
  olvidarReproductor(celda);
  ifr.dataset.src = urlRecarga(celda);
  cargarYa(celda);
  mostrarMensaje('Reintentando… si el dueño sigue sin permitirlo, vuelve a aparecer el aviso');
}
