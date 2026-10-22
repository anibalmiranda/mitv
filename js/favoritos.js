// Multi YouTube — favoritos.js
// Favoritos (máx. 9, comunes a todas las listas).
// Los archivos se cargan en orden desde index.html y comparten variables (scripts clásicos).

// ---------- Favoritos (máx. 9, comunes a todas las listas) ----------
function pintarFav(celda) {
  const fav = esFav(celda.dataset.linea);
  celda.classList.toggle('es-fav', fav);
  const b = celda.querySelector('.fav');
  if (b) { b.textContent = fav ? '★' : '☆'; b.title = fav ? 'Quitar de favoritos' : 'Agregar a favoritos'; }
}
function pintarFavsBoton() {
  btnFavs.classList.toggle('activo', config.vistaFav);
  btnFavs.title = config.vistaFav ? 'Volver a la lista "' + config.actual + '"' : 'Ver favoritos (' + cantFavs() + '/' + MAX_FAV + ')';
}
function alternarFav(celda) {
  const linea = celda.dataset.linea;
  const k = clave(linea);
  if (!k) return;
  if (config.vistaFav) {          // en favoritos, quitar la estrella lo saca de la vista
    quitar(celda);
    mostrarMensaje('Quitado de favoritos (' + cantFavs() + '/' + MAX_FAV + ')');
    return;
  }
  if (esFav(linea)) {
    config.favoritos = config.favoritos.filter(f => clave(f) !== k);
    mostrarMensaje('Quitado de favoritos (' + cantFavs() + '/' + MAX_FAV + ')');
  } else {
    if (cantFavs() >= MAX_FAV) { mostrarMensaje('Máximo ' + MAX_FAV + ' favoritos, quita uno primero'); return; }
    config.favoritos.push(linea);
    mostrarMensaje('★ Agregado a favoritos (' + cantFavs() + '/' + MAX_FAV + ')');
  }
  guardar();
  celdas.forEach(pintarFav);
  pintarFavsBoton();
  pintarSelector();
}
btnFavs.addEventListener('click', () => {
  config.vistaFav = !config.vistaFav;
  guardar();
  render(true);
  pintarSelector();
});
