// Multi YouTube — navegacion.js
// Anterior / siguiente (flechas y botones) y tira de miniaturas para elegir un video.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Anterior / siguiente y tira (pantalla completa) ----------
// Modo video: amplía el video elegido y le pasa el audio.
// Modo solo audio: le pasa el audio a esa fila.
// Las cámaras entran en la navegación solo cuando se ven videos (en solo audio no tienen nada que aportar)
function validas() {
  return celdas.filter(c => c.querySelector(SEL_REPRODUCTOR) || (c.dataset.tipo === 'camara' && !config.modoAudio));
}
function indiceActual(lista) {
  // Durante un fundido de imagen, el "actual" es el que está entrando
  let i = config.modoAudio
    ? lista.findIndex(c => c.dataset.mute === '0')
    : (fundido ? lista.indexOf(fundido.nueva) : lista.findIndex(c => c.classList.contains('max')));
  if (i === -1) i = lista.findIndex(c => c.dataset.mute === '0');
  return i;
}
function irA(celda) {
  const lista = validas();
  const pos = lista.indexOf(celda);
  if (pos === -1) return;
  if (!config.modoAudio && !celda.classList.contains('max')) cambiarAmpliado(celda);
  if (celda.dataset.mute === '1') conCausa(causaAudio || 'navegación (flechas, tira o número)', () => alternarAudio(celda));
  const tit = celda.querySelector('.titulo');
  mostrarMensaje((pos + 1) + ' / ' + lista.length + (tit ? ' · ' + tit.textContent : ''));
}
function navegar(dir, auto) {
  const lista = validas();
  const n = lista.length;
  if (!n) return;
  if (!auto) reiniciarCarrusel();   // si cambias a mano, el carrusel vuelve a contar desde cero
  const actual = indiceActual(lista);
  const destino = actual === -1 ? (dir > 0 ? 0 : n - 1) : (actual + dir + n) % n;
  irA(lista[destino]);
  if (document.body.classList.contains('tira-abierta')) armarTira();
}
// Teclas 1 a 9: van al video con ese número (el mismo que muestra la tira). En pantalla completa, con un video
// ampliado o en solo audio, como las flechas; en la grilla, solo le pasan el audio (una cámara se amplía).
function irANumero(n) {
  const lista = validas();
  const c = lista[n - 1];
  if (!c) { mostrarMensaje('No hay un video ' + n + ' en esta vista'); return; }
  reiniciarCarrusel();
  if (document.fullscreenElement || contenedor.querySelector('.celda.max') || config.modoAudio) irA(c);
  else if (c.dataset.tipo === 'camara') alternarMax(c);
  else {
    if (c.dataset.mute === '1') conCausa('tecla de número', () => alternarAudio(c));
    const tit = c.querySelector('.titulo');
    mostrarMensaje(n + ' / ' + lista.length + (tit ? ' · ' + tit.textContent : ''));
  }
  if (document.body.classList.contains('tira-abierta')) armarTira();
}
$('navPrev').addEventListener('click', () => navegar(-1));
$('navNext').addEventListener('click', () => navegar(1));

// ---------- Tira de miniaturas (pantalla completa, flecha abajo) ----------
function armarTira() {
  const cont = $('tiraItems');
  cont.innerHTML = '';
  const lista = validas();
  const actual = indiceActual(lista);
  if (!lista.length) {
    cont.innerHTML = '<div style="color:var(--suave);font-size:13px;padding:10px">No hay videos en esta vista</div>';
    return;
  }
  lista.forEach((c, i) => {
    const it = document.createElement('div');
    it.className = 'item' + (i === actual ? ' actual' : '');
    const th = document.createElement('div');
    th.className = 'thumb';
    if (c.dataset.thumb) th.style.backgroundImage = 'url("' + c.dataset.thumb + '")';
    else th.textContent = c.dataset.tipo === 'canal' ? '📡' : c.dataset.tipo === 'camara' ? '📷' : c.dataset.tipo === 'rudo' ? '📺' : '▶';
    if (c.classList.contains('en-vivo')) {
      const v = document.createElement('span');
      v.className = 'etq-vivo';
      v.textContent = 'EN VIVO';
      th.appendChild(v);
    }
    it.appendChild(th);

    const t = document.createElement('div');
    t.className = 't';
    t.textContent = c.querySelector('.titulo').textContent;
    it.appendChild(t);
    const a = document.createElement('div');
    a.className = 'a';
    a.textContent = c.querySelector('.autor').textContent;
    it.appendChild(a);

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    it.appendChild(num);
    if (esFav(c.dataset.linea)) {
      const s = document.createElement('span');
      s.className = 'estrella';
      s.textContent = '★';
      it.appendChild(s);
    }
    if (c.dataset.mute === '0') {
      const s = document.createElement('span');
      s.className = 'sonando';
      s.textContent = '🔊 sonando';
      it.appendChild(s);
    }
    it.title = t.textContent;
    it.addEventListener('click', () => { irA(c); if (!config.tiraFija) cerrarTira(); else armarTira(); reiniciarCarrusel(); });
    cont.appendChild(it);
  });
  // Centra el actual en la tira
  const sel = cont.querySelector('.item.actual');
  if (sel) {
    cont.style.scrollBehavior = 'auto';
    cont.scrollLeft = sel.offsetLeft - (cont.clientWidth - sel.offsetWidth) / 2;
    cont.style.scrollBehavior = '';
  }
  pintarFlechasTira();
}
function abrirTira() { armarTira(); document.body.classList.add('tira-abierta'); }
function cerrarTira() { document.body.classList.remove('tira-abierta'); }
function alternarTira() {
  if (document.body.classList.contains('tira-abierta')) cerrarTira(); else abrirTira();
}
$('btnTira').addEventListener('click', alternarTira);
// Flechas ‹ ›: recorren la tira de a una pantalla para llegar al resto de los canales
function desplazarTira(dir) {
  const cont = $('tiraItems');
  cont.scrollBy({ left: dir * cont.clientWidth * 0.85 });   // suave por el CSS (scroll-behavior)
  setTimeout(pintarFlechasTira, 450);   // por si el aviso de desplazamiento llega tarde
}
function pintarFlechasTira() {
  const cont = $('tiraItems');
  const fin = cont.scrollWidth - cont.clientWidth;
  $('tiraAnt').classList.toggle('oculta', cont.scrollLeft <= 2);
  $('tiraSig').classList.toggle('oculta', cont.scrollLeft >= fin - 2);
}
$('tiraAnt').addEventListener('click', () => desplazarTira(-1));
$('tiraSig').addEventListener('click', () => desplazarTira(1));
$('tiraItems').addEventListener('scroll', pintarFlechasTira, { passive: true });
window.addEventListener('resize', pintarFlechasTira);
// 📌 Tira fija: queda abierta al ampliar un video o entrar a pantalla completa y no se cierra al elegir un canal.
// Cerrarla a mano (botón, flecha arriba o Esc) la esconde solo hasta la próxima vez que amplíes.
function pintarFijarTira() { $('btnFijarTira').classList.toggle('activo', !!config.tiraFija); }
function alternarTiraFija() {
  config.tiraFija = !config.tiraFija;
  guardar();
  pintarFijarTira();
  if (config.tiraFija) abrirTira();
  mostrarMensaje(config.tiraFija ? '📌 Tira fija: queda abierta' : 'Tira suelta: se cierra al elegir un canal');
}
$('btnFijarTira').addEventListener('click', alternarTiraFija);
// La rueda del mouse mueve la tira hacia los lados
$('tiraItems').addEventListener('wheel', e => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    $('tiraItems').scrollLeft += e.deltaY;
  }
}, { passive: false });
