// Multi YouTube — visualizador.js
// Visualizador de audio real (Mezcla estéreo / cable virtual), efectos, colores, escena negra y protector de pantalla.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Visualizador de audio real ----------
// La página no puede leer el audio dentro de los videos de YouTube (otro dominio), así que escucha una
// ENTRADA de audio del PC. Lo ideal es "Mezcla estéreo" (Stereo Mix), que entrega exactamente lo que suena
// en el equipo: audio limpio, funciona con audífonos y el permiso se pide una sola vez (sin diálogo de compartir).
// Si no existe, usa el micrófono. La entrada se puede elegir en el ⚙.
// El dibujo aparece sobre el video que tiene el audio (abajo del cuadro, o toda la fila en modo solo audio).
const btnVisual = $('btnVisual');
const lienzo = document.createElement('canvas');
lienzo.id = 'lienzoVisual';
const ctx2d = lienzo.getContext('2d');
let visual = null;   // { stream, actx, analizador, frec, onda, raf }
// Entradas que entregan lo que suena en el PC: Mezcla estéreo (Realtek) o el cable virtual VB-Audio
const RX_MEZCLA = /mezcla est|stereo mix|what u hear|lo que se oye|loopback|wave out|cable output|vb-audio/i;

function abrirEntrada(deviceId) {
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return navigator.mediaDevices.getUserMedia({ audio, video: false });
}
async function entradasDeAudio() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); }
  catch (e) { return []; }
}

// silencioso = true al reactivarlo solo cuando carga la página
// Mientras se espera el permiso o la entrada, otro clic no abre un segundo visualizador
let iniciandoVisual = false;
async function iniciarVisual(silencioso) {
  if (visual || iniciandoVisual) return;
  iniciandoVisual = true;
  try { await abrirVisual(silencioso); } finally { iniciandoVisual = false; }
}
async function abrirVisual(silencioso) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (!silencioso) mostrarMensaje('Este navegador no permite leer entradas de audio');
    return;
  }
  let stream = null;
  try {
    // 1) La entrada elegida en el ⚙ (o la que se encontró la vez anterior)
    if (config.visualEntrada) {
      try { stream = await abrirEntrada(config.visualEntrada); } catch (e) { stream = null; }
    }
    // 2) Automático: pide permiso, busca "Mezcla estéreo" y, si no está, se queda con el micrófono
    if (!stream) {
      stream = await abrirEntrada(null);
      const mezcla = (await entradasDeAudio()).find(d => RX_MEZCLA.test(d.label));
      if (mezcla) {
        const actual = stream.getAudioTracks()[0].getSettings().deviceId;
        if (actual !== mezcla.deviceId) {
          stream.getTracks().forEach(t => t.stop());
          stream = await abrirEntrada(mezcla.deviceId);
        }
      } else if (!silencioso) {
        mostrarMensaje('No encontré "Mezcla estéreo": usando el micrófono');
      }
    }
  } catch (e) {
    if (!silencioso) mostrarMensaje('Sin permiso para la entrada de audio: no se puede activar el visualizador');
    config.visualActivo = false;
    guardar();
    return;
  }
  const pista = stream.getAudioTracks()[0];
  if (!config.visualEntrada) config.visualEntrada = pista.getSettings().deviceId || '';
  const actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume().catch(() => {});   // si aún no hubo clic, se reanuda con el primero
  const fuenteAudio = actx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const analizador = actx.createAnalyser();
  analizador.fftSize = 2048;
  analizador.smoothingTimeConstant = 0.78;
  fuenteAudio.connect(analizador);           // no se conecta a los parlantes: así no hay eco
  visual = {
    stream, actx, analizador,
    frec: new Uint8Array(analizador.frequencyBinCount),
    onda: new Uint8Array(analizador.fftSize),
    raf: 0,
    etiqueta: pista.label || 'la entrada',
    ultimoSonido: Date.now(),
    avisoSilencio: false
  };
  pista.addEventListener('ended', () => detenerVisual(false));   // p. ej. se deshabilitó el dispositivo
  document.body.classList.add('visual-real');
  btnVisual.classList.add('activo');
  btnVisual.title = 'Detener visualizador (entrada: ' + (pista.label || 'audio') + ')';
  config.visualActivo = true;
  guardar();
  if (!silencioso) mostrarMensaje('🎵 Visualizador: ' + (pista.label || 'entrada de audio'));
  dibujarVisual();
}

// porUsuario = true cuando lo apagas con el botón (así no se reactiva al recargar)
function detenerVisual(porUsuario) {
  if (porUsuario) { config.visualActivo = false; guardar(); }
  if (!visual) return;
  salirEscena();
  cancelAnimationFrame(visual.raf);
  visual.stream.getTracks().forEach(t => t.stop());
  visual.actx.close().catch(() => {});
  visual = null;
  lienzo.classList.remove('visible');
  lienzo.remove();
  controlesVisual.remove();
  document.body.classList.remove('visual-real');
  btnVisual.classList.remove('activo');
  btnVisual.title = 'Visualizador de audio real (usa "Mezcla estéreo")';
}
btnVisual.addEventListener('click', () => { if (visual) detenerVisual(true); else iniciarVisual(false); });

// Selector de entrada en el ⚙ (los nombres aparecen después de dar el permiso la primera vez)
async function llenarSelectorEntrada() {
  const sel = $('selEntrada');
  const devs = await entradasDeAudio();
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = 'Automático (busca "Mezcla estéreo")';
  sel.appendChild(auto);
  devs.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || ('Entrada ' + (i + 1) + ' (activa el visualizador para ver los nombres)');
    sel.appendChild(o);
  });
  sel.value = devs.some(d => d.deviceId === config.visualEntrada) ? config.visualEntrada : '';
}

function dibujarVisual() {
  if (!visual) return;
  visual.raf = requestAnimationFrame(dibujarVisual);

  // El lienzo sigue al video que tiene el audio
  const destino = celdas.find(c => c.dataset.mute === '0' && c.isConnected);
  const enEscena = document.body.classList.contains('solo-visual');
  if (!destino && !enEscena) { lienzo.classList.remove('visible'); controlesVisual.remove(); return; }
  // Escena negra: al centro de la pantalla. Modo solo audio: dentro de la fila. Si no: abajo del cuadro.
  const contenedorLienzo = enEscena ? escena : (config.modoAudio ? destino.querySelector('.fila-audio') : destino);
  const contenedorBotones = enEscena ? escena : destino;
  if (lienzo.parentElement !== contenedorLienzo) contenedorLienzo.appendChild(lienzo);
  if (controlesVisual.parentElement !== contenedorBotones) contenedorBotones.appendChild(controlesVisual);
  lienzo.classList.add('visible');
  if (enEscena) {
    const tit = destino && destino.querySelector('.titulo');
    const txtTit = tit ? tit.textContent : '';
    if ($('escenaTitulo').textContent !== txtTit) $('escenaTitulo').textContent = txtTit;
  }

  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(lienzo.clientWidth * dpr));
  const H = Math.max(1, Math.round(lienzo.clientHeight * dpr));
  if (lienzo.width !== W || lienzo.height !== H) { lienzo.width = W; lienzo.height = H; }
  ctx2d.clearRect(0, 0, W, H);

  const { analizador, frec, onda } = visual;
  analizador.getByteFrequencyData(frec);
  analizador.getByteTimeDomainData(onda);

  // Diagnóstico: hay un video con audio pero la entrada no recibe nada → avisa una vez
  let pico = 0;
  for (let i = 0; i < frec.length; i += 8) if (frec[i] > pico) pico = frec[i];
  const ahora = Date.now();
  if (pico > 8 || (destino && destino.classList.contains('pausado')) || visual.actx.state !== 'running') visual.ultimoSonido = ahora;
  else if (!visual.avisoSilencio && ahora - visual.ultimoSonido > 6000) {
    visual.avisoSilencio = true;
    mostrarMensaje('El visualizador no recibe sonido de "' + visual.etiqueta + '": revisa la entrada en el ⚙');
  }

  const tipo = TIPOS_VISUAL[config.visualTipo] ? config.visualTipo : 'barras';
  const paleta = PALETAS[config.visualColor] || PALETAS.fuego;

  // Fondo suave para que se lea sobre el video (no en el circular ni en modo solo audio)
  const completo = TIPOS_COMPLETOS.includes(tipo);
  if (lienzo.classList.contains('completo') !== completo) lienzo.classList.toggle('completo', completo);
  if (!config.modoAudio && !enEscena) {
    if (!completo) {
      const fondoG = ctx2d.createLinearGradient(0, 0, 0, H);
      fondoG.addColorStop(0, 'rgba(0,0,0,0)');
      fondoG.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx2d.fillStyle = fondoG;
      ctx2d.fillRect(0, 0, W, H);
    } else if (tipo !== 'circular') {
      ctx2d.fillStyle = 'rgba(0,0,0,0.45)';   // HUD, túnel y seda: oscurece el video para que se luzcan
      ctx2d.fillRect(0, 0, W, H);
    }
  }

  numeroCuadro++;
  TIPOS_VISUAL[tipo].dibujar({ W, H, dpr, frec, onda, paleta });
}

// ---------- Colores y tipos del visualizador ----------
// Paleta = colores de abajo hacia arriba (o del centro hacia afuera en el circular). 'arcoiris' va por posición.
const PALETAS = {
  fuego:    { nombre: 'Fuego',    stops: ['#ff3b3b', '#ff7a3c', '#ffc83d'] },
  oceano:   { nombre: 'Océano',   stops: ['#0047ff', '#00a2ff', '#5ff3ff'] },
  neon:     { nombre: 'Neón',     stops: ['#ff00c8', '#9b5cff', '#00f0ff'] },
  bosque:   { nombre: 'Bosque',   stops: ['#0a8f3c', '#3fd15a', '#d4ff5a'] },
  atardecer:{ nombre: 'Atardecer',stops: ['#6a00f4', '#ff2e88', '#ffb347'] },
  blanco:   { nombre: 'Blanco',   stops: ['#bfbfbf', '#e8e8e8', '#ffffff'] },
  arcoiris: { nombre: 'Arcoíris', stops: ['#ff0000', '#00ff00', '#0000ff'], porPosicion: true }
};

function hexARgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
// Color en la posición t (0..1) de la paleta
function colorPaleta(paleta, t, alfa) {
  if (paleta.porPosicion) return 'hsla(' + Math.round(t * 300) + ',95%,58%,' + alfa + ')';
  const s = paleta.stops, x = Math.min(0.9999, Math.max(0, t)) * (s.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = hexARgb(s[i]), b = hexARgb(s[i + 1]);
  return 'rgba(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' +
         Math.round(a[2] + (b[2] - a[2]) * f) + ',' + alfa + ')';
}
function degradeVertical(paleta, yAbajo, yArriba) {
  const g = ctx2d.createLinearGradient(0, yAbajo, 0, yArriba);
  paleta.stops.forEach((c, i) => g.addColorStop(i / (paleta.stops.length - 1), colorPaleta(paleta, i / (paleta.stops.length - 1), 0.95)));
  return g;
}
// Espectro agrupado en N bandas con escala logarítmica (más detalle en bajos y medios). Devuelve 0..1
function bandas(frec, N) {
  const maxBin = Math.floor(frec.length * 0.72);   // hasta ~16 kHz
  const v = new Array(N);
  for (let i = 0; i < N; i++) {
    const b0 = Math.max(1, Math.floor(Math.pow(maxBin, i / N)));
    const b1 = Math.max(b0 + 1, Math.floor(Math.pow(maxBin, (i + 1) / N)));
    let suma = 0;
    for (let b = b0; b < b1; b++) suma += frec[b];
    v[i] = Math.pow(suma / (b1 - b0) / 255, 1.4);
  }
  return v;
}
function trazarOnda(onda, W, H, amp) {
  ctx2d.beginPath();
  const paso = onda.length / W;
  for (let x = 0; x < W; x++) {
    const v = onda[Math.floor(x * paso)] / 128 - 1;
    const y = H * 0.5 + v * H * amp;
    if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
  }
}

const TIPOS_VISUAL = {
  // Barras desde abajo + onda blanca encima (el original)
  barras: { nombre: 'Barras', dibujar({ W, H, dpr, frec, onda, paleta }) {
    const N = Math.max(24, Math.min(128, Math.floor(W / (9 * dpr))));
    const v = bandas(frec, N), ancho = W / N;
    ctx2d.fillStyle = degradeVertical(paleta, H, 0);
    for (let i = 0; i < N; i++) {
      if (paleta.porPosicion) ctx2d.fillStyle = colorPaleta(paleta, i / N, 0.95);
      const h = Math.max(2 * dpr, v[i] * H * 0.92);
      ctx2d.fillRect(i * ancho + ancho * 0.15, H - h, ancho * 0.7, h);
    }
    ctx2d.lineWidth = 2 * dpr;
    ctx2d.strokeStyle = 'rgba(255,255,255,0.7)';
    trazarOnda(onda, W, H, 0.42);
    ctx2d.stroke();
  }},
  // Barras reflejadas desde el centro hacia arriba y abajo
  espejo: { nombre: 'Espejo', dibujar({ W, H, dpr, frec, paleta }) {
    const N = Math.max(24, Math.min(128, Math.floor(W / (8 * dpr))));
    const v = bandas(frec, N), ancho = W / N, mitad = H / 2;
    for (let i = 0; i < N; i++) {
      const h = Math.max(1 * dpr, v[i] * mitad * 0.95);
      const g = ctx2d.createLinearGradient(0, mitad - h, 0, mitad + h);
      g.addColorStop(0, colorPaleta(paleta, paleta.porPosicion ? i / N : 1, 0.95));
      g.addColorStop(0.5, colorPaleta(paleta, paleta.porPosicion ? i / N : 0, 0.95));
      g.addColorStop(1, colorPaleta(paleta, paleta.porPosicion ? i / N : 1, 0.95));
      ctx2d.fillStyle = g;
      ctx2d.fillRect(i * ancho + ancho * 0.15, mitad - h, ancho * 0.7, h * 2);
    }
  }},
  // Solo la onda, gruesa y con brillo
  onda: { nombre: 'Onda', dibujar({ W, H, dpr, onda, paleta }) {
    const g = ctx2d.createLinearGradient(0, 0, W, 0);
    [0, 0.5, 1].forEach(t => g.addColorStop(t, colorPaleta(paleta, t, 1)));
    ctx2d.lineWidth = 3 * dpr;
    ctx2d.strokeStyle = g;
    ctx2d.shadowColor = colorPaleta(paleta, 0.5, 0.9);
    ctx2d.shadowBlur = 14 * dpr;
    trazarOnda(onda, W, H, 0.45);
    ctx2d.stroke();
    ctx2d.shadowBlur = 0;
    ctx2d.lineWidth = 1 * dpr;
    ctx2d.strokeStyle = 'rgba(255,255,255,0.55)';
    trazarOnda(onda, W, H, 0.45);
    ctx2d.stroke();
  }},
  // Espectro en círculo, con un núcleo que late con los bajos
  circular: { nombre: 'Circular', dibujar({ W, H, dpr, frec, paleta }) {
    const N = 96, v = bandas(frec, N);
    const cx = W / 2, cy = H / 2, base = Math.min(W, H);
    const bajos = (v[0] + v[1] + v[2] + v[3] + v[4] + v[5]) / 6;
    const r = base * (0.16 + bajos * 0.05);
    ctx2d.lineCap = 'round';
    ctx2d.lineWidth = Math.max(2 * dpr, (2 * Math.PI * r / N) * 0.55);
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const largo = Math.max(2 * dpr, v[i] * base * 0.28);
      ctx2d.strokeStyle = colorPaleta(paleta, paleta.porPosicion ? i / N : v[i], 0.95);
      ctx2d.beginPath();
      ctx2d.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      ctx2d.lineTo(cx + Math.cos(ang) * (r + largo), cy + Math.sin(ang) * (r + largo));
      ctx2d.stroke();
    }
    ctx2d.lineCap = 'butt';
    ctx2d.fillStyle = colorPaleta(paleta, 0.2, 0.18 + bajos * 0.4);
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx2d.fill();
  }},

  // HUD de ciencia ficción: anillos que giran, espectro radial segmentado y nivel al centro
  hud: { nombre: 'HUD', dibujar({ W, H, dpr, frec, paleta }) {
    const { t } = pasoTiempo();
    const N = 64, v = bandas(frec, N / 2);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.32;
    const bajos = (v[0] + v[1] + v[2] + v[3]) / 4;
    const nivel = v.reduce((a, b) => a + b, 0) / v.length;
    const c1 = colorPaleta(paleta, 0.85, 0.95), c2 = colorPaleta(paleta, 0.4, 0.55);
    ctx2d.shadowColor = c1;
    ctx2d.shadowBlur = 10 * dpr;

    // Anillo interior fino y anillo de trazos que gira
    ctx2d.strokeStyle = c2; ctx2d.lineWidth = 1 * dpr;
    ctx2d.beginPath(); ctx2d.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx2d.stroke();
    ctx2d.lineWidth = 3 * dpr; ctx2d.strokeStyle = c1;
    for (let k = 0; k < 48; k += 2) {
      const a0 = (k / 48) * Math.PI * 2 + t * 0.35;
      ctx2d.beginPath(); ctx2d.arc(cx, cy, R * 0.62, a0, a0 + (Math.PI * 2 / 48) * 0.8); ctx2d.stroke();
    }
    // Espectro radial en bloques (simétrico izquierda/derecha)
    const S = 9, largoBloque = R * 0.045;
    for (let i = 0; i < N; i++) {
      const idx = i < N / 2 ? i : N - 1 - i;
      const prendidos = Math.round(v[idx] * S);
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const cos = Math.cos(ang), sin = Math.sin(ang);
      for (let s = 0; s < S; s++) {
        const r0 = R * 0.72 + s * largoBloque * 1.35;
        ctx2d.strokeStyle = s < prendidos ? colorPaleta(paleta, s / S, 0.95) : 'rgba(255,255,255,0.05)';
        ctx2d.lineWidth = Math.max(2 * dpr, (2 * Math.PI * r0 / N) * 0.55);
        ctx2d.beginPath();
        ctx2d.moveTo(cx + cos * r0, cy + sin * r0);
        ctx2d.lineTo(cx + cos * (r0 + largoBloque), cy + sin * (r0 + largoBloque));
        ctx2d.stroke();
      }
    }
    // Arcos exteriores que giran al revés y crecen con los bajos
    ctx2d.strokeStyle = c1; ctx2d.lineWidth = 2 * dpr;
    for (let k = 0; k < 4; k++) {
      const a0 = -t * 0.5 + k * Math.PI / 2;
      ctx2d.beginPath(); ctx2d.arc(cx, cy, R * (1.28 + bajos * 0.06), a0, a0 + Math.PI / 3); ctx2d.stroke();
    }
    // Marcas tipo regla
    ctx2d.lineWidth = 1 * dpr; ctx2d.strokeStyle = c2;
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2, l = k % 10 === 0 ? R * 0.06 : R * 0.025;
      ctx2d.beginPath();
      ctx2d.moveTo(cx + Math.cos(a) * R * 1.4, cy + Math.sin(a) * R * 1.4);
      ctx2d.lineTo(cx + Math.cos(a) * (R * 1.4 + l), cy + Math.sin(a) * (R * 1.4 + l));
      ctx2d.stroke();
    }
    // Núcleo y nivel
    ctx2d.fillStyle = colorPaleta(paleta, 0.5, 0.12 + bajos * 0.35);
    ctx2d.beginPath(); ctx2d.arc(cx, cy, R * (0.42 + bajos * 0.06), 0, Math.PI * 2); ctx2d.fill();
    ctx2d.shadowBlur = 0;
    ctx2d.fillStyle = c1;
    ctx2d.font = '600 ' + Math.round(R * 0.18) + 'px Consolas, monospace';
    ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
    ctx2d.fillText(String(Math.round(nivel * 100)).padStart(2, '0'), cx, cy - R * 0.04);
    ctx2d.font = Math.round(R * 0.06) + 'px Consolas, monospace';
    ctx2d.fillStyle = c2;
    ctx2d.fillText('AUDIO LVL', cx, cy + R * 0.14);
  }},

  // Vúmetro vintage: columnas de LEDs con marca de pico que cae despacio
  vintage: { nombre: 'Vintage', dibujar({ W, H, dpr, frec, paleta }) {
    const { dt } = pasoTiempo();
    const N = Math.max(16, Math.min(40, Math.floor(W / (24 * dpr))));
    const v = bandas(frec, N);
    const S = Math.max(10, Math.min(24, Math.floor(H / (12 * dpr))));
    const margen = W * 0.04, ancho = (W - margen * 2) / N, alto = (H * 0.9) / S, base = H * 0.95;
    if (!estadoVisual.picos || estadoVisual.picos.length !== N) estadoVisual.picos = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const nivel = v[i];
      estadoVisual.picos[i] = Math.max(nivel, estadoVisual.picos[i] - dt * 0.35);
      const prendidos = Math.round(nivel * S), pico = Math.min(S - 1, Math.round(estadoVisual.picos[i] * S));
      const x = margen + i * ancho + ancho * 0.12;
      for (let s = 0; s < S; s++) {
        const y = base - (s + 1) * alto + alto * 0.18;
        const prendido = s < prendidos || (s === pico && pico > 0);
        // Paleta clásica (verde/amarillo/rojo) con "Fuego"; si no, la paleta elegida
        let col;
        if (config.visualColor === 'fuego') col = s / S < 0.6 ? '#3cff5a' : s / S < 0.85 ? '#ffd93c' : '#ff3b3b';
        ctx2d.fillStyle = prendido
          ? (col || colorPaleta(paleta, s / S, 0.95))
          : 'rgba(255,255,255,0.06)';
        ctx2d.fillRect(x, y, ancho * 0.76, alto * 0.64);
      }
    }
  }},

  // Túnel neón: marcos que avanzan hacia ti (más rápido con los bajos) y un ecualizador neón al centro
  tunel: { nombre: 'Túnel neón', dibujar({ W, H, dpr, frec, paleta }) {
    const { t, dt } = pasoTiempo();
    const v = bandas(frec, 48);
    const bajos = (v[0] + v[1] + v[2] + v[3]) / 4;
    if (!estadoVisual.tunel) estadoVisual.tunel = Array.from({ length: 16 }, (_, i) => (i + 1) / 16);
    const cx = W / 2, cy = H / 2, aspecto = W / H;
    const vel = 0.18 + bajos * 1.1;
    estadoVisual.tunel = estadoVisual.tunel.map(z => { z -= dt * vel * z; return z < 0.06 ? 1 : z; });
    const orden = [...estadoVisual.tunel].sort((a, b) => b - a);   // de lejos a cerca
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.rotate(Math.sin(t * 0.4) * 0.06);
    orden.forEach((z, k) => {
      const s = (Math.min(W, H) * 0.09) / z;
      const w = s * aspecto, h = s;
      const alfa = Math.min(1, (1 - z) * 1.4);
      const col = colorPaleta(paleta, ((k / orden.length) + t * 0.06) % 1, alfa);
      ctx2d.strokeStyle = col;
      ctx2d.shadowColor = col;
      ctx2d.shadowBlur = 16 * dpr;
      ctx2d.lineWidth = Math.max(1, (2 + (1 - z) * 6) * dpr);
      const r = Math.min(w, h) * 0.12;
      ctx2d.beginPath();
      ctx2d.moveTo(-w / 2 + r, -h / 2);
      ctx2d.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
      ctx2d.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
      ctx2d.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
      ctx2d.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
      ctx2d.closePath();
      ctx2d.stroke();
    });
    ctx2d.restore();
    // Ecualizador neón horizontal al centro (espejo)
    const N = v.length, anchoT = W * 0.5, ancho = anchoT / N, x0 = cx - anchoT / 2;
    ctx2d.shadowBlur = 12 * dpr;
    for (let i = 0; i < N; i++) {
      const h = Math.max(2 * dpr, v[i] * H * 0.16);
      const col = colorPaleta(paleta, i / N, 0.95);
      ctx2d.fillStyle = col; ctx2d.shadowColor = col;
      ctx2d.fillRect(x0 + i * ancho + ancho * 0.2, cy - h, ancho * 0.6, h * 2);
    }
    ctx2d.shadowBlur = 0;
  }},

  // Cintas de seda: ondas de luz que fluyen y se agitan con la música
  seda: { nombre: 'Seda', dibujar({ W, H, dpr, frec, paleta }) {
    const { t } = pasoTiempo();
    const v = bandas(frec, 10);
    const L = 6, paso = 6 * dpr;
    ctx2d.save();
    ctx2d.globalCompositeOperation = 'lighter';
    for (let k = 0; k < L; k++) {
      const energia = (v[(k * 2) % v.length] + v[(k * 2 + 1) % v.length]) / 2;
      const cy = H * (0.3 + 0.4 * (k / (L - 1)));
      const A = H * (0.06 + energia * 0.22);
      const grosor = (6 + energia * 40) * dpr;
      const f1 = 1.6 + k * 0.35, f2 = 3.1 + k * 0.5, fase = k * 1.7;
      const y = x => cy + Math.sin((x / W) * Math.PI * f1 + t * (0.5 + k * 0.08) + fase) * A
                        + Math.sin((x / W) * Math.PI * f2 - t * (0.8 + k * 0.05)) * A * 0.35;
      const g = ctx2d.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, colorPaleta(paleta, (k / L) % 1, 0));
      g.addColorStop(0.25, colorPaleta(paleta, ((k / L) + 0.15) % 1, 0.45));
      g.addColorStop(0.6, colorPaleta(paleta, ((k / L) + 0.35) % 1, 0.55));
      g.addColorStop(1, colorPaleta(paleta, ((k / L) + 0.5) % 1, 0));
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      for (let x = 0; x <= W; x += paso) {
        const yy = y(x) - grosor * (0.5 + 0.5 * Math.sin(x / W * 6 + t + k));
        if (x === 0) ctx2d.moveTo(x, yy); else ctx2d.lineTo(x, yy);
      }
      for (let x = W; x >= 0; x -= paso) {
        const yy = y(x) + grosor * (0.5 + 0.5 * Math.sin(x / W * 6 + t + k));
        ctx2d.lineTo(x, yy);
      }
      ctx2d.closePath();
      ctx2d.fill();
    }
    ctx2d.restore();
  }}
};

// Estado que algunos efectos necesitan entre cuadros (picos que caen, túnel, tiempo)
const estadoVisual = { ultimo: 0, t: 0, dt: 0, cuadro: -1 };
let numeroCuadro = 0;
function pasoTiempo() {
  if (estadoVisual.cuadro !== numeroCuadro) {
    const ahora = performance.now() / 1000;
    estadoVisual.dt = estadoVisual.ultimo ? Math.min(0.1, ahora - estadoVisual.ultimo) : 0.016;
    estadoVisual.ultimo = ahora;
    estadoVisual.t = ahora;
    estadoVisual.cuadro = numeroCuadro;
  }
  return estadoVisual;
}
// Tipos que usan todo el cuadro (y oscurecen el video detrás para que se vean)
const TIPOS_COMPLETOS = ['circular', 'hud', 'tunel', 'seda'];

// ---------- Botones transparentes: color y tipo ----------
const controlesVisual = document.createElement('div');
controlesVisual.id = 'controlesVisual';
controlesVisual.innerHTML =
  '<button data-accion="color" title="Cambiar color del visualizador">🎨</button>' +
  '<button data-accion="tipo" title="Cambiar tipo de visualizador">' +
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="12" width="3" height="8" rx="1"/><rect x="8" y="6" width="3" height="14" rx="1"/><rect x="13" y="9" width="3" height="11" rx="1"/><rect x="18" y="4" width="3" height="16" rx="1"/></svg>' +
  '</button>' +
  '<button data-accion="escena" title="Solo visualizador: fondo negro (Esc para volver al video)">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 15l3-4 3 3 3-5 3 6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
  '</button>';
controlesVisual.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  e.stopPropagation();
  if (b.dataset.accion === 'escena') {
    if (document.body.classList.contains('solo-visual')) salirEscena(); else entrarEscena();
    return;
  }
  if (b.dataset.accion === 'color') {
    const ks = Object.keys(PALETAS);
    config.visualColor = ks[(ks.indexOf(config.visualColor) + 1) % ks.length];
    mostrarMensaje('🎨 Color: ' + PALETAS[config.visualColor].nombre);
  } else {
    const ks = Object.keys(TIPOS_VISUAL);
    config.visualTipo = ks[(ks.indexOf(config.visualTipo) + 1) % ks.length];
    mostrarMensaje('Visualizador: ' + TIPOS_VISUAL[config.visualTipo].nombre);
    pintarTipoLienzo();
  }
  guardar();
});
// Evita que el clic en los botones cuente como "dar audio" o "ampliar"
['pointerdown', 'dblclick'].forEach(ev => controlesVisual.addEventListener(ev, e => e.stopPropagation()));
function pintarTipoLienzo() { lienzo.classList.toggle('completo', TIPOS_COMPLETOS.includes(config.visualTipo)); }
pintarTipoLienzo();

// ---------- Escena "solo visualizador" (pantalla completa) ----------
// Tapa todo con negro y deja el visualizador al centro; el audio sigue sonando.
// Esc vuelve al video: se "reserva" la tecla Esc (Keyboard Lock) para que no saque de pantalla completa;
// mantener Esc apretado sí sale de pantalla completa (lo maneja el navegador).
const escena = document.createElement('div');
escena.id = 'escenaVisual';
escena.innerHTML = '<div id="escenaAyuda">Esc para volver al video</div><div id="escenaTitulo"></div>';
document.body.appendChild(escena);
escena.addEventListener('dblclick', () => salirEscena());

let escenaPorProtector = false;   // true si la activó el protector de pantalla (cualquier movimiento la cierra)
function entrarEscena(porProtector) {
  if (!visual) { if (!porProtector) mostrarMensaje('Enciende primero el visualizador (botón de onda)'); return; }
  if (!document.fullscreenElement) { if (!porProtector) mostrarMensaje('Esta opción es para pantalla completa'); return; }
  escenaPorProtector = !!porProtector;
  document.body.classList.add('solo-visual');
  $('escenaAyuda').textContent = porProtector ? 'Protector de pantalla · mueve el mouse para volver' : 'Esc para volver al video';
  cerrarTira();
  if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {});
  if (!porProtector) mouseActivo();
}
function salirEscena() {
  if (!document.body.classList.contains('solo-visual')) return;
  document.body.classList.remove('solo-visual');
  escenaPorProtector = false;
  if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
  ultimaActividad = Date.now();
}

// ---------- Protector de pantalla ----------
// En pantalla completa y con el visualizador encendido: tras N minutos sin mover el mouse ni tocar el teclado,
// pasa sola a la escena negra. Si la activó el protector, cualquier movimiento, clic o tecla vuelve al video.
let ultimaActividad = Date.now();
let ultimaPos = null;
function registrarActividad(e) {
  // Ignora micro-movimientos del mouse (vibraciones de la mesa, etc.)
  if (e && e.type === 'mousemove') {
    const p = [e.screenX, e.screenY];
    if (ultimaPos && Math.abs(p[0] - ultimaPos[0]) + Math.abs(p[1] - ultimaPos[1]) < 6) return;
    ultimaPos = p;
  }
  ultimaActividad = Date.now();
  if (escenaPorProtector && document.body.classList.contains('solo-visual')) {
    salirEscena();
    // Esa tecla o clic solo "despierta": no debe además achicar el video ni cambiar el audio
    if (e && (e.type === 'keydown' || e.type === 'pointerdown')) e.stopImmediatePropagation();
  }
}
['mousemove', 'pointerdown', 'keydown', 'wheel'].forEach(ev =>
  document.addEventListener(ev, registrarActividad, { passive: true, capture: true }));
setInterval(() => {
  const min = Number(config.protectorMin) || 0;
  if (!min || !visual || !document.fullscreenElement) return;
  if (document.body.classList.contains('solo-visual') || fondo.classList.contains('abierto') ||
      fondoBuscar.classList.contains('abierto')) return;
  if (Date.now() - ultimaActividad >= min * 60000) entrarEscena(true);
}, 5000);
