# Multi YouTube — corre todas las pruebas automáticas.
# Uso: probar.bat            (o: python pruebas/correr.py)
#      probar.bat --internet (además comprueba la lectura de YouTube de verdad)
#
#  1. Servidor (test_servidor.py): lectura de páginas de YouTube con ejemplos, diagnóstico de fallas, datos en
#     archivo y la seguridad de la API, con un servidor de prueba en un puerto libre y una carpeta temporal.
#  2. Navegador, unitarias (unitarias.html): reconocimiento de URLs de todos los formatos.
#  3. Navegador, integración (integracion.html): la aplicación completa con datos de prueba.
# Las pruebas del navegador usan Edge o Chrome sin interfaz, con un perfil temporal, sin acceso a internet y
# servidas en otro puerto: nunca tocan tus listas, tu navegador ni tu archivo de datos.

import functools
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAVEGADORES = [
    r'%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe',
    r'%ProgramFiles%\Microsoft\Edge\Application\msedge.exe',
    r'%ProgramFiles%\Google\Chrome\Application\chrome.exe',
    r'%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe',
    r'%LocalAppData%\Google\Chrome\Application\chrome.exe',
]


def titulo(texto):
    print('\n' + texto + '\n' + '-' * len(texto))


# ---------- 1. Servidor ----------
def pruebas_servidor(con_internet):
    titulo('1. Servidor (servidor.py)')
    if con_internet:
        os.environ['MITV_INTERNET'] = '1'
    sys.path.insert(0, os.path.join(RAIZ, 'pruebas'))
    import test_servidor
    suite = unittest.defaultTestLoader.loadTestsFromModule(test_servidor)
    res = unittest.TextTestRunner(stream=sys.stdout, verbosity=1).run(suite)
    return res.wasSuccessful()


# ---------- 2 y 3. Navegador ----------
class Archivos(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{'.js': 'application/javascript', '.css': 'text/css'})

    def log_message(self, *a):
        pass


def buscar_navegador():
    for ruta in NAVEGADORES:
        ruta = os.path.expandvars(ruta)
        if os.path.isfile(ruta):
            return ruta
    return shutil.which('msedge') or shutil.which('chrome') or shutil.which('google-chrome')


def pruebas_pagina(nombre, url, navegador):
    titulo(nombre)
    perfil = tempfile.mkdtemp(prefix='mitv-pruebas-')
    try:
        orden = [navegador, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
                 '--user-data-dir=' + perfil,
                 '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',   # sin internet: no depende de YouTube
                 '--virtual-time-budget=120000', '--dump-dom', url]
        try:
            salida = subprocess.run(orden, capture_output=True, timeout=300).stdout.decode('utf-8', 'replace')
        except subprocess.TimeoutExpired:
            print('  [FALLA] el navegador no terminó a tiempo')
            return False
    finally:
        shutil.rmtree(perfil, ignore_errors=True)
    m = re.search(r'<pre id="resultado">(.*?)</pre>', salida, re.S)
    if not m or not m.group(1).strip():
        print('  [FALLA] la página no entregó resultados (¿error de JavaScript al cargar?)')
        return False
    res = json.loads(html.unescape(m.group(1)))
    for n in res['pasadas']:
        print('  [OK]    ' + n)
    for f in res['fallas']:
        print('  [FALLA] ' + f['prueba'] + '\n          ' + f['error'])
    print('  %d de %d pasaron' % (len(res['pasadas']), res['total']))
    return not res['fallas'] and len(res['pasadas']) == res['total']


def main():
    con_internet = '--internet' in sys.argv
    resultados = {'Servidor': pruebas_servidor(con_internet)}

    navegador = buscar_navegador()
    if not navegador:
        titulo('2 y 3. Navegador')
        print('  No encontré Edge ni Chrome: se saltan las pruebas del navegador.')
    else:
        srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Archivos, directory=RAIZ))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = 'http://127.0.0.1:%d/pruebas/' % srv.server_address[1]
        try:
            resultados['URLs (navegador)'] = pruebas_pagina('2. URLs (navegador)', base + 'unitarias.html', navegador)
            resultados['Aplicación completa (navegador)'] = pruebas_pagina('3. Aplicación completa (navegador)',
                                                                         base + 'integracion.html?aislado=1', navegador)
        finally:
            srv.shutdown()

    titulo('Resumen')
    for nombre, ok in resultados.items():
        print('  ' + ('[OK]    ' if ok else '[FALLA] ') + nombre)
    todo_ok = all(resultados.values())
    print('\n  ' + ('Todo funciona.' if todo_ok else 'Hay pruebas que fallan: revisa los detalles de arriba.'))
    return 0 if todo_ok else 1


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(errors='replace')
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
