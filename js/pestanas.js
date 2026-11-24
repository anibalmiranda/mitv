// Multi YouTube — pestanas.js
// Pestañas: una lista con más de POR_PESTANA cuadros se divide en pestañas de POR_PESTANA. Solo se ve y se carga
// la pestaña activa (los cuadros de las otras no cargan nada), salvo el que suena, que sigue sonando aunque no se
// vea. Se cambia con las flechas ‹ › de arriba al centro, con sus números o con las teclas Re Pág / Av Pág.
// Al ampliar un canal, ir a un número o navegar con las flechas o la tira, la pestaña sigue a ese canal.
// Cada lista recuerda su pestaña mientras la página está abierta.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const POR_PESTANA = 20;
const pestanaPorVista = {};

function hayPestanas() { return celdas.length > POR_PESTANA; }
function totalPestanas() { return Math.ceil(celdas.length / POR_PESTANA); }
function pestanaDe(celda) { return Math.floor(celdas.indexOf(celda) / POR_PESTANA); }
function pestanaActual() { return Math.max(0, Math.min(pestanaPorVista[vistaId()] || 0, totalPestanas() - 1)); }
function enPestana(celda) { return !hayPestanas() || pestanaDe(celda) === pestanaActual(); }

// Marca qué cuadros quedan fuera de la pestaña activa (los llama ajustarGrilla)
function aplicarPestanas() {
  const max = contenedor.querySelector('.celda.max');
  if (max && hayPestanas() && !enPestana(max)) pestanaPorVista[vistaId()] = pestanaDe(max);   // la pestaña sigue al ampliado
  celdas.forEach(c => c.classList.toggle('fuera-pestana', !enPestana(c)));
  pintarPestanas();
}

function irAPestana(n, avisar) {
  if (!hayPestanas()) return;
  const total = totalPestanas();
  n = ((n % total) + total) % total;   // de la última se pasa a la primera
  if (n === pestanaActual()) return;
  pestanaPorVista[vistaId()] = n;
  ajustarGrilla();
  actualizarCarga();
  ajustarCamaras();
  programarPausaOcultos();
  if (avisar) {
    const desde = n * POR_PESTANA + 1, hasta = Math.min(celdas.length, desde + POR_PESTANA - 1);
    mostrarMensaje('Pestaña ' + (n + 1) + ' de ' + total + ' · canales ' + desde + ' a ' + hasta);
  }
}
function cambiarPestana(dir) { irAPestana(pestanaActual() + dir, true); }
// Lleva a la pestaña de ese cuadro (si está en otra)
function mostrarPestanaDe(celda) { if (celda && hayPestanas() && !enPestana(celda)) irAPestana(pestanaDe(celda)); }

// ---------- Botones de arriba al centro: ‹ 1 2 3 › ----------
function pintarPestanas() {
  const barra = $('barraPestanas');
  document.body.classList.toggle('con-pestanas', hayPestanas());
  if (!hayPestanas()) { barra.innerHTML = ''; barra.dataset.huella = ''; return; }
  const total = totalPestanas(), actual = pestanaActual();
  const huella = celdas.length + '|' + actual;
  if (barra.dataset.huella === huella) return;
  barra.dataset.huella = huella;
  barra.innerHTML = '';
  const boton = (texto, titulo, fn, clase) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.title = titulo;
    if (clase) b.className = clase;
    b.addEventListener('click', fn);
    barra.appendChild(b);
  };
  boton('‹', 'Pestaña anterior (Re Pág)', () => cambiarPestana(-1), 'flecha');
  for (let i = 0; i < total; i++) {
    const desde = i * POR_PESTANA + 1, hasta = Math.min(celdas.length, desde + POR_PESTANA - 1);
    boton(String(i + 1), 'Canales ' + desde + ' a ' + hasta, () => irAPestana(i, true), i === actual ? 'activa' : '');
  }
  boton('›', 'Pestaña siguiente (Av Pág)', () => cambiarPestana(1), 'flecha');
}
