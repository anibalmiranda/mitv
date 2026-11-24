// Multi YouTube — spotify.js
// Spotify: playlists, álbumes, canciones, artistas y podcasts en el reproductor oficial que Spotify ofrece para
// incrustar (open.spotify.com/embed/…). Canciones completas si el navegador tiene la sesión de Spotify iniciada;
// si no, Spotify entrega vistas previas de 30 s.
// Su reproductor no deja cambiar el volumen ni silenciar desde fuera, así que el audio exclusivo se maneja así:
//  - para empezar a oírlo, ▶ en su reproductor (la parte derecha del cuadro queda al alcance del mouse);
//  - darle ▶ (o un clic dentro de su reproductor) le da el audio a ese cuadro: los demás se silencian;
//  - cuando el audio pasa a otro cuadro (o se silencia todo), se le pide que pause; si sigue sonando (o no
//    respondió nunca), se vuelve a cargar, que lo detiene seguro;
//  - al volver a darle el audio, se le pide que siga donde quedó.
// No sirve de audio de fondo 🎵 ni tiene volumen propio (+ / −).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const ORIGEN_SPOTIFY = 'https://open.spotify.com';
const ESPERA_PAUSA_SPOTIFY_MS = 1500;   // si tras pedir la pausa sigue sonando, se recarga

function esSpotify(ifr) { return !!ifr && ifr.tagName === 'IFRAME' && !!ifr.closest('.celda.spotify'); }

function ordenSpotify(ifr, command) {
  if (ifr.contentWindow) ifr.contentWindow.postMessage({ command }, ORIGEN_SPOTIFY);
}
function recargarSpotify(celda, ifr) {
  clearTimeout(celda._spotifyPausa);
  celda._spotifyPausando = false;
  celda._spotifySonando = false;
  celda._spotifyPausadoPorMi = false;
  if (ifr.dataset.src || !ifr.src || ifr.src === 'about:blank') return;
  celda._listo = false;
  ifr.src = ifr.src;   // al recargar queda detenido
}

// Llamado por comandoYT en vez de mandar el mensaje de YouTube
function comandoSpotify(ifr, func) {
  const celda = ifr.closest('.celda');
  if (func === 'mute' || func === 'pauseVideo' || func === 'stopVideo') {
    clearTimeout(celda._spotifyPausa);
    if (!celda._spotifySonando && !celda._spotifyTocado) return;
    celda._spotifyTocado = false;
    if (!celda._spotifyHabla) { recargarSpotify(celda, ifr); return; }   // nunca contestó: lo seguro es recargar
    ordenSpotify(ifr, 'pause');
    celda._spotifyPausadoPorMi = true;
    celda._spotifyPausando = true;
    celda._spotifyPausa = setTimeout(() => {
      celda._spotifyPausando = false;
      if (celda._spotifySonando && celda.dataset.mute !== '0') recargarSpotify(celda, ifr);
    }, ESPERA_PAUSA_SPOTIFY_MS);
  } else if (func === 'unMute' || func === 'playVideo') {
    if (celda.dataset.mute !== '0') return;   // silenciado: Spotify no puede sonar "bajito"
    clearTimeout(celda._spotifyPausa);
    celda._spotifyPausando = false;
    if (celda._spotifyPausadoPorMi) { celda._spotifyPausadoPorMi = false; ordenSpotify(ifr, 'resume'); }
    else if (func === 'unMute' && !celda._spotifySonando && !celda._spotifyTocado)
      mostrarMensaje('🎵 Para oír Spotify, dale ▶ en su reproductor (en el cuadro)');
  }
}

// Al terminar de cargar su página ya está "funcionando"
function spotifyCargado(celda, ifr) {
  if (!ifr.src || ifr.src === 'about:blank') return;
  celda._listo = true;
  celda._estado = 1;
}

// Lo que cuenta su reproductor (reproduciendo / en pausa). Si empezó a sonar en un cuadro silenciado, es que le
// diste ▶ ahí: ese cuadro recibe el audio.
window.addEventListener('message', e => {
  if (e.origin !== ORIGEN_SPOTIFY) return;
  const ifr = [...contenedor.querySelectorAll('.celda.spotify iframe')].find(f => f.contentWindow === e.source);
  if (!ifr) return;
  const celda = ifr.closest('.celda');
  let d = e.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
  if (!d || typeof d !== 'object') return;
  celda._spotifyHabla = true;
  if (d.type !== 'playback_update') return;
  const info = d.payload || d.data || {};
  if (typeof info.isPaused !== 'boolean') return;
  celda._spotifySonando = !info.isPaused;
  if (!info.isPaused) {
    celda._spotifyPausadoPorMi = false;
    if (celda.dataset.mute === '1' && !celda._spotifyPausando) darAudioSpotify(celda);
  }
});
function darAudioSpotify(celda) {
  if (celda.dataset.mute !== '1') return;
  celda._spotifyTocado = true;   // ya está sonando: que no se le pida nada al darle el audio
  conCausa('▶ en el reproductor de Spotify', () => alternarAudio(celda));
  celda._spotifyTocado = false;
}

// Un clic dentro del iframe no llega a la página, pero la ventana pierde el foco y el iframe queda como elemento
// activo: tocaste su reproductor (normalmente para darle ▶) y ese cuadro recibe el audio.
window.addEventListener('blur', () => {
  setTimeout(() => {
    const ifr = document.activeElement;
    if (!esSpotify(ifr)) return;
    const celda = ifr.closest('.celda');
    if (celda.dataset.mute === '1') darAudioSpotify(celda);
    celda._spotifyTocado = true;   // pudo haberle dado ▶: al perder el audio se detiene
  }, 0);
});
