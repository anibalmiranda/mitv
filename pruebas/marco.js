// Multi YouTube — pruebas/marco.js
// Mini marco de pruebas para el navegador: prueba('nombre', async () => { ... }) y correrPruebas().
// El resultado queda como JSON en <pre id="resultado"> (lo lee pruebas/correr.py) y legible en la página.

const _pruebas = [];
function prueba(nombre, fn) { _pruebas.push({ nombre, fn }); }
function igual(obtenido, esperado, que) {
  if (JSON.stringify(obtenido) !== JSON.stringify(esperado))
    throw new Error((que ? que + ': ' : '') + 'se esperaba ' + JSON.stringify(esperado) + ' y salió ' + JSON.stringify(obtenido));
}
function cierto(valor, que) { if (!valor) throw new Error(que || 'se esperaba verdadero'); }
const espera = ms => new Promise(r => setTimeout(r, ms));

async function correrPruebas() {
  const res = { total: _pruebas.length, pasadas: [], fallas: [] };
  for (const p of _pruebas) {
    try { await p.fn(); res.pasadas.push(p.nombre); }
    catch (e) { res.fallas.push({ prueba: p.nombre, error: (e && e.message) || String(e) }); }
  }
  const pre = document.getElementById('resultado');
  pre.textContent = JSON.stringify(res);
  const lista = document.getElementById('legible');
  if (lista) {
    lista.textContent = res.pasadas.map(n => '✔ ' + n).concat(res.fallas.map(f => '✘ ' + f.prueba + ' — ' + f.error)).join('\n') +
      '\n\n' + res.pasadas.length + ' / ' + res.total + ' pasaron';
  }
  return res;
}
