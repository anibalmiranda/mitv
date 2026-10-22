// Multi YouTube — camaras.js
// Cámaras IP: cualquier dirección http(s):// que no sea de YouTube (por ejemplo http://IP:puerto/mjpg/video.mjpg).
// El navegador muestra el stream MJPEG directo en una imagen. No tienen audio: se amplían, se navegan con las
// flechas y el carrusel como un video más, pero el audio se queda en el video que sonaba.
// Para ahorrar conexión, la imagen se corta en modo solo audio y cuando "pausar ocultos" la deja fuera de vista.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const REINTENTO_CAMARA_MS = 15000;   // si la cámara no responde, se vuelve a intentar cada 15 s

function crearCamara(celda, url) {
  celda.classList.add('camara');
  celda._urlCamara = url;
  const img = document.createElement('img');
  img.className = 'camara';
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.draggable = false;
  img.addEventListener('error', () => {
    if (!img.getAttribute('src')) return;   // se cortó a propósito (modo solo audio, oculta)
    marcarCaido(celda, 'camara');
    clearTimeout(celda._reintento);
    celda._reintento = setTimeout(() => reconectarCamara(celda), REINTENTO_CAMARA_MS);
  });
  img.addEventListener('load', () => { if (celda.classList.contains('caido')) quitarCaido(celda); });
  celda.appendChild(img);
  ajustarCamara(celda);
}

function camaraActiva(celda) { return !config.modoAudio && !celda._pausadaFS; }

// Conecta o corta el stream según si la cámara se está viendo
function ajustarCamara(celda) {
  const img = celda.querySelector('img.camara');
  if (!img) return;
  const on = camaraActiva(celda);
  if (on && !img.getAttribute('src')) img.src = celda._urlCamara;
  else if (!on && img.getAttribute('src')) { clearTimeout(celda._reintento); img.removeAttribute('src'); }
}
function ajustarCamaras() { celdas.forEach(c => { if (c.dataset.tipo === 'camara') ajustarCamara(c); }); }

function reconectarCamara(celda) {
  const img = celda.querySelector('img.camara');
  if (!img || !celda.isConnected || !camaraActiva(celda)) return;
  img.removeAttribute('src');
  img.src = celda._urlCamara;
}
