// Multi YouTube — cuentaatras.js
// Cuenta atrás hasta la hora de salida, en la esquina superior izquierda, con el mismo reloj de paletas
// (flip clock) de la página "salida.html": tres tarjetas Horas · Minutos · Segundos.
//  - Salida = hora de entrada + jornada (lunes a jueves una cantidad de horas, viernes otra). Se configura en el ⚙.
//  - Al pasar la hora de salida sigue contando el tiempo excedido, en rojo.
//  - El botón de la barra superior (o la tecla T) la muestra u oculta; solo corre mientras se ve.
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

const CUENTA_INICIAL = { entrada: '07:49', semana: 9, viernes: 8, visible: false };   // los mismos de salida.html
const btnCuenta = $('btnCuenta');
const cajaCuenta = $('cuentaAtras');
let timerCuenta = null;

function cuentaConfig() {
  const c = config.cuentaAtras;
  return (c && typeof c === 'object') ? c : (config.cuentaAtras = Object.assign({}, CUENTA_INICIAL));
}

// Hora de salida de hoy: entrada + jornada del día (viernes distinto)
function horaSalida(ahora) {
  const c = cuentaConfig();
  const [h, m] = String(c.entrada || CUENTA_INICIAL.entrada).split(':').map(Number);
  const horas = ahora.getDay() === 5 ? Number(c.viernes) : Number(c.semana);
  const salida = new Date(ahora);
  salida.setHours(0, 0, 0, 0);
  salida.setMinutes((h || 0) * 60 + (m || 0) + Math.round((horas || 0) * 60));   // setMinutes desborda bien a horas
  return salida;
}

// Efecto paleta: la mitad de arriba cae y descubre el número nuevo (igual que en salida.html)
function ponerPaleta(tarjeta, valor) {
  if (tarjeta.dataset.value === valor) return;
  const viejo = tarjeta.dataset.value || '--';
  tarjeta.dataset.value = valor;
  tarjeta.querySelectorAll('.leaf').forEach(l => l.remove());
  const arriba = tarjeta.querySelector('.half.top:not(.leaf) span');
  const abajo = tarjeta.querySelector('.half.bottom:not(.leaf) span');
  const hoja = (clases, texto) => {
    const d = document.createElement('div');
    d.className = clases;
    const s = document.createElement('span');
    s.textContent = texto;
    d.appendChild(s);
    return d;
  };
  const hojaArriba = hoja('half top leaf', viejo);
  const hojaAbajo = hoja('half bottom leaf', valor);
  arriba.textContent = valor;   // detrás de la paleta que cae ya está el nuevo
  abajo.textContent = viejo;    // abajo sigue el viejo hasta que la paleta lo tape
  tarjeta.append(hojaArriba, hojaAbajo);
  hojaAbajo.addEventListener('animationend', () => {
    abajo.textContent = valor;
    hojaArriba.remove();
    hojaAbajo.remove();
  });
}

function tickCuenta() {
  clearTimeout(timerCuenta);
  if (!cuentaConfig().visible) return;
  const ahora = new Date();
  const diff = Math.floor((horaSalida(ahora) - ahora) / 1000);
  const excedido = diff <= 0;
  const seg = Math.abs(diff);
  const dos = n => String(n).padStart(2, '0');
  ponerPaleta($('caHoras'), dos(Math.floor(seg / 3600)));
  ponerPaleta($('caMinutos'), dos(Math.floor((seg % 3600) / 60)));
  ponerPaleta($('caSegundos'), dos(seg % 60));
  cajaCuenta.querySelectorAll('.flip, .time-block').forEach(e => e.classList.toggle('overtime', excedido));
  cajaCuenta.title = excedido ? 'Tiempo excedido desde la hora de salida' : 'Falta para la hora de salida';
  // Se alinea con el cambio de segundo del reloj
  timerCuenta = setTimeout(tickCuenta, 1000 - (Date.now() % 1000) + 5);
}

function mostrarCuenta() {
  const on = !!cuentaConfig().visible;
  cajaCuenta.classList.toggle('visible', on);
  btnCuenta.classList.toggle('activo', on);
  btnCuenta.title = (on ? 'Ocultar la cuenta atrás' : 'Cuenta atrás hasta la hora de salida') + ' (T)';
  if (on) tickCuenta(); else clearTimeout(timerCuenta);
}
function alternarCuenta() {
  const c = cuentaConfig();
  c.visible = !c.visible;
  guardar();
  mostrarCuenta();
}
btnCuenta.addEventListener('click', alternarCuenta);

// ---------- Campos del ⚙ ----------
function llenarCamposCuenta() {
  const c = cuentaConfig();
  $('caEntrada').value = c.entrada;
  $('caSemana').value = c.semana;
  $('caViernes').value = c.viernes;
}
function leerCamposCuenta() {
  const c = cuentaConfig();
  const limitar = (v, min, max, def) => { const n = parseFloat(v); return isNaN(n) ? def : Math.min(max, Math.max(min, n)); };
  if (/^\d{1,2}:\d{2}$/.test($('caEntrada').value)) c.entrada = $('caEntrada').value.padStart(5, '0');
  c.semana = limitar($('caSemana').value, 0, 24, c.semana);
  c.viernes = limitar($('caViernes').value, 0, 24, c.viernes);
  if (c.visible) tickCuenta();   // se nota al tiro
}
