// Multi YouTube — camaras.js
// Cámaras IP: cualquier dirección http(s):// que no sea de YouTube (por ejemplo http://IP:puerto/mjpg/video.mjpg).
// No tienen audio: se amplían, se navegan con las flechas y el carrusel como un video más, pero el audio se queda
// en el video que sonaba. Para ahorrar conexión, se cortan en modo solo audio y cuando "pausar los que no se ven"
// las deja fuera de vista.
// Cada cámara elige sola cómo conectarse (modoCamara):
//  - 'directo':  el navegador muestra el stream MJPEG tal cual (lo más fluido).
//  - 'servidor': servidor.py se conecta a la cámara y la página le pide el último cuadro varias veces por segundo.
//                Se usa cuando hay más de LIMITE_DIRECTO cámaras del mismo equipo (el navegador abre solo ~6
//                conexiones con un mismo equipo y el resto no cargaba), con cámaras de foto fija (snapshot) y con
//                usuario:clave en la URL (el navegador no los manda en una imagen).
//  - 'foto':     cámara de foto fija sin servidor: el navegador la vuelve a pedir cada INTERVALO_FOTO_MS.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const REINTENTO_CAMARA_MS = 15000;   // si la cámara no responde, se vuelve a intentar cada 15 s
const LIMITE_DIRECTO = 5;            // cámaras de un mismo equipo que se conectan directo (deja una conexión libre)
const INTERVALO_SERVIDOR_MS = 250;   // modo 'servidor': cuadros por segundo ≈ 4 (más fluido si está ampliada)
const INTERVALO_SERVIDOR_AMPLIADA_MS = 120;
const INTERVALO_FOTO_MS = 2000;      // modo 'foto': cada cuánto se vuelve a pedir la imagen

function crearCamara(celda, url) {
  celda.classList.add('camara');
  celda._urlCamara = url;
  const img = document.createElement('img');
  img.className = 'camara';
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.draggable = false;
  img.addEventListener('error', () => {
    if (celda._modoCam !== 'directo' || !img.getAttribute('src')) return;   // los otros modos manejan sus errores
    marcarCaido(celda, 'camara');
    clearTimeout(celda._reintento);
    celda._reintento = setTimeout(() => reconectarCamara(celda), REINTENTO_CAMARA_MS);
  });
  img.addEventListener('load', () => { if (celda.classList.contains('caido')) quitarCaido(celda); });
  celda.appendChild(img);
  ajustarCamara(celda);
}

// ---------- Cómo conectarse ----------
function equipoDe(url) { try { return new URL(url).host.toLowerCase(); } catch (e) { return url; } }
function pareceFoto(url) {
  const sinParametros = url.split(/[?#]/)[0];
  if (/mjpe?g|video\.cgi|faststream|stream/i.test(sinParametros)) return false;
  return /\.(jpe?g|png|gif|bmp|webp)$/i.test(sinParametros) || /snapshot|snap\.cgi|image\.cgi|still/i.test(sinParametros);
}
function tieneCredenciales(url) { try { return !!new URL(url).username; } catch (e) { return false; } }
function modoCamara(celda) {
  const url = celda._urlCamara;
  if (servidorOk === true) {
    const delMismoEquipo = celdas.filter(c => c.dataset.tipo === 'camara' && equipoDe(c._urlCamara) === equipoDe(url)).length;
    if (delMismoEquipo > LIMITE_DIRECTO || pareceFoto(url) || tieneCredenciales(url)) return 'servidor';
  }
  return pareceFoto(url) ? 'foto' : 'directo';
}

function camaraActiva(celda) {
  return !config.modoAudio && !celda._pausadaFS && !(enAhorro && !celda.classList.contains('max'));
}

// Conecta, cambia de modo o corta la cámara según si se está viendo
function ajustarCamara(celda) {
  const img = celda.querySelector('img.camara');
  if (!img) return;
  if (!camaraActiva(celda)) { detenerCamara(celda); return; }
  const modo = modoCamara(celda);
  if (celda._modoCam === modo && celda._conectada) return;
  detenerCamara(celda);
  celda._modoCam = modo;
  celda._conectada = true;
  if (modo === 'directo') img.src = celda._urlCamara;
  else sondear(celda, celda._sondeoId);
}
function ajustarCamaras() { celdas.forEach(c => { if (c.dataset.tipo === 'camara') ajustarCamara(c); }); }

function detenerCamara(celda) {
  const img = celda.querySelector('img.camara');
  clearTimeout(celda._reintento);
  clearTimeout(celda._sondeo);
  celda._sondeoId = (celda._sondeoId || 0) + 1;   // corta cualquier pedido en curso del modo anterior
  celda._conectada = false;
  if (img) img.removeAttribute('src');
  if (celda._urlObjeto) { URL.revokeObjectURL(celda._urlObjeto); celda._urlObjeto = null; }
}

function reconectarCamara(celda) {
  if (!celda.isConnected || !camaraActiva(celda)) return;
  detenerCamara(celda);
  ajustarCamara(celda);
}

// ---------- Modos 'servidor' y 'foto': se pide un cuadro, se muestra y se pide el siguiente ----------
async function sondear(celda, id) {
  const img = celda.querySelector('img.camara');
  const vigente = () => celda.isConnected && celda._sondeoId === id;
  let espera;
  try {
    if (celda._modoCam === 'servidor') {
      const r = await fetch('/api/camara?url=' + encodeURIComponent(celda._urlCamara), { cache: 'no-store' });
      if (!vigente()) return;
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (!vigente()) return;
        marcarCaido(celda, 'camara', d.error ? d.error + '; se reintenta' : '');
        espera = d.error && d.error.startsWith('conectando') ? 1000 : REINTENTO_CAMARA_MS;
      } else {
        const u = URL.createObjectURL(await r.blob());
        if (!vigente()) { URL.revokeObjectURL(u); return; }
        img.src = u;
        if (celda._urlObjeto) URL.revokeObjectURL(celda._urlObjeto);
        celda._urlObjeto = u;
        if (celda.classList.contains('caido')) quitarCaido(celda);
        espera = celda.classList.contains('max') ? INTERVALO_SERVIDOR_AMPLIADA_MS : INTERVALO_SERVIDOR_MS;
      }
    } else {
      // Sin servidor: se carga la foto aparte y se cambia de una vez (sin parpadeo)
      const sep = celda._urlCamara.includes('?') ? '&' : '?';
      const nueva = new Image();
      nueva.referrerPolicy = 'no-referrer';
      await new Promise((ok, mal) => { nueva.onload = ok; nueva.onerror = mal; nueva.src = celda._urlCamara + sep + '_t=' + Date.now(); });
      if (!vigente()) return;
      img.src = nueva.src;
      if (celda.classList.contains('caido')) quitarCaido(celda);
      espera = INTERVALO_FOTO_MS;
    }
  } catch (e) {
    if (!vigente()) return;
    marcarCaido(celda, 'camara');
    espera = REINTENTO_CAMARA_MS;
  }
  celda._sondeo = setTimeout(() => { if (vigente()) sondear(celda, id); }, espera);
}
