# Multi YouTube — pruebas de servidor.py (se corren con probar.bat o: python pruebas/correr.py)
# Sin internet: la lectura de páginas se prueba con trozos de HTML de ejemplo, y la API con un servidor de
# prueba en un puerto libre y una carpeta de datos temporal (nunca toca tus datos reales).
# Con internet (python pruebas/correr.py --internet): además se lee YouTube de verdad.

import contextlib
import http.client
import io
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location('servidor', os.path.join(RAIZ, 'servidor.py'))
servidor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(servidor)

CON_INTERNET = os.environ.get('MITV_INTERNET') == '1'


def pagina_video(vid='abcdefghijk', titulo='Título \\u00e9', autor='Canal', canal='UC' + 'x' * 22,
                 directo=False, vivo=False):
    return ('<html><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"%s","title":"%s",'
            '"author":"%s","channelId":"%s","isLiveContent":%s%s}};</script></html>'
            % (vid, titulo, autor, canal, 'true' if directo else 'false', ',"isLive":true' if vivo else ''))


class LecturaDePaginas(unittest.TestCase):
    def test_detalles_video(self):
        d = servidor.detalles_video(pagina_video())
        self.assertEqual(d['video'], 'abcdefghijk')
        self.assertEqual(d['titulo'], 'Título é')          # los é del JSON se convierten
        self.assertEqual(d['autor'], 'Canal')
        self.assertEqual(d['canal'], 'UC' + 'x' * 22)

    def test_detalles_video_sin_datos(self):
        self.assertIsNone(servidor.detalles_video('<html>nada</html>'))

    def test_en_vivo_ahora(self):
        self.assertTrue(servidor.en_vivo_ahora('"isLiveNow":true'))
        self.assertTrue(servidor.en_vivo_ahora('"isLive":true'))
        self.assertFalse(servidor.en_vivo_ahora('"isLive":true,"isUpcoming":true'))   # programado, aún no empieza
        self.assertFalse(servidor.en_vivo_ahora('"isLive":false'))

    def test_info_video_con_pagina_falsa(self):
        original = servidor.bajar
        try:
            servidor.bajar = lambda url: pagina_video('abcdefghijk', directo=True, vivo=True)
            d = servidor.info_video('abcdefghijk')
            self.assertTrue(d['directo'] and d['vivo'])
            servidor.bajar = lambda url: pagina_video('otroIdxxxxx')
            self.assertIn('error', servidor.info_video('abcdefghijk'))   # la página es de otro video
        finally:
            servidor.bajar = original

    def test_validaciones(self):
        self.assertTrue(servidor.RX_RUTA.match('@LofiGirl'))
        self.assertTrue(servidor.RX_RUTA.match('c/nombre'))
        self.assertFalse(servidor.RX_RUTA.match('../../etc'))
        self.assertFalse(servidor.RX_RUTA.match('@a b'))
        self.assertTrue(servidor.RX_CANAL.match('UC' + 'a' * 22))
        self.assertFalse(servidor.RX_CANAL.match('UCcorto'))
        self.assertTrue(servidor.RX_VIDEO.match('dQw4w9WgXcQ'))


class SaludDeLaLectura(unittest.TestCase):
    def test_diagnosticos(self):
        self.assertEqual(servidor.diagnosticar('<form action="https://consent.youtube.com/save">'), servidor.FALLA_COOKIES)
        self.assertEqual(servidor.diagnosticar("Sign in to confirm you're not a bot"), servidor.FALLA_ROBOT)
        self.assertEqual(servidor.diagnosticar('<html>página nueva sin datos</html>'), servidor.FALLA_FORMATO)
        self.assertEqual(servidor.diagnosticar('var ytInitialPlayerResponse = {}'), '')   # formato normal

    def test_estado_cambia_y_recuerda_desde(self):
        with contextlib.redirect_stdout(io.StringIO()):   # el aviso que imprime no ensucia el resumen
            self._estado_cambia()

    def _estado_cambia(self):
        servidor.fijar_salud('ok')
        servidor.fijar_salud('falla', servidor.FALLA_FORMATO)
        desde = servidor.salud['desde']
        servidor.fijar_salud('falla', servidor.FALLA_FORMATO)   # sigue fallando: no cambia el "desde"
        self.assertEqual(servidor.salud['desde'], desde)
        self.assertEqual(servidor.salud['detalle'], servidor.FALLA_FORMATO)
        servidor.fijar_salud('ok')
        self.assertEqual(servidor.salud['estado'], 'ok')


class DatosEnArchivo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='mitv-prueba-')
        self.antes = (servidor.ARCHIVO_DATOS, servidor.CARPETA_RESPALDOS)
        servidor.ARCHIVO_DATOS = os.path.join(self.dir, 'datos.json')
        servidor.CARPETA_RESPALDOS = os.path.join(self.dir, 'respaldos')

    def tearDown(self):
        servidor.ARCHIVO_DATOS, servidor.CARPETA_RESPALDOS = self.antes
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_guardar_y_leer(self):
        self.assertIsNone(servidor.leer_datos())
        servidor.guardar_datos({'config': {'listas': {'A': ['x']}}})
        self.assertEqual(servidor.leer_datos()['config']['listas'], {'A': ['x']})
        self.assertEqual(len(os.listdir(servidor.CARPETA_RESPALDOS)), 1)   # respaldo del día

    def test_archivo_danado(self):
        with open(servidor.ARCHIVO_DATOS, 'w') as f:
            f.write('{no es json')
        self.assertIsNone(servidor.leer_datos())


class API(unittest.TestCase):
    """Un servidor de prueba de verdad, en un puerto libre y con datos temporales."""

    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix='mitv-prueba-')
        cls.antes = (servidor.ARCHIVO_DATOS, servidor.CARPETA_RESPALDOS)
        servidor.ARCHIVO_DATOS = os.path.join(cls.dir, 'datos.json')
        servidor.CARPETA_RESPALDOS = os.path.join(cls.dir, 'respaldos')
        servidor.Manejador.log_message = lambda *a: None   # sin el registro de cada consulta
        cls.srv = ThreadingHTTPServer(('127.0.0.1', 0), servidor.Manejador)
        cls.puerto = cls.srv.server_address[1]
        servidor.Manejador.puerto = cls.puerto
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        servidor.ARCHIVO_DATOS, servidor.CARPETA_RESPALDOS = cls.antes
        shutil.rmtree(cls.dir, ignore_errors=True)

    def pedir(self, metodo, ruta, cuerpo=None, cabeceras=None):
        c = http.client.HTTPConnection('127.0.0.1', self.puerto, timeout=10)
        h = {'Host': '127.0.0.1:%d' % self.puerto}
        h.update(cabeceras or {})
        c.request(metodo, ruta, body=cuerpo, headers=h)
        r = c.getresponse()
        datos = r.read()
        c.close()
        return r.status, r.getheader('Content-Type') or '', datos, r

    def test_estado(self):
        st, tipo, datos, _ = self.pedir('GET', '/api/estado')
        self.assertEqual(st, 200)
        self.assertIn('application/json', tipo)
        self.assertEqual(json.loads(datos), {'ok': True})

    def test_host_falso_rechazado(self):
        st, _, _, _ = self.pedir('GET', '/api/estado', cabeceras={'Host': 'malo.com:%d' % self.puerto})
        self.assertEqual(st, 403)   # protección contra "DNS rebinding"

    def test_guardar_datos_solo_desde_la_pagina(self):
        cuerpo = json.dumps({'config': {'listas': {'A': []}}})
        st, _, _, _ = self.pedir('POST', '/api/datos', cuerpo, {'Content-Type': 'application/json'})
        self.assertEqual(st, 403, 'sin la cabecera propia no se puede escribir')
        st, _, _, _ = self.pedir('POST', '/api/datos', cuerpo, {'Content-Type': 'application/json', 'X-MultiYouTube': '1',
                                                                 'Origin': 'http://malo.com'})
        self.assertEqual(st, 403, 'otra página no puede escribir')
        st, _, _, _ = self.pedir('POST', '/api/datos', '{"x":1}', {'Content-Type': 'application/json', 'X-MultiYouTube': '1'})
        self.assertEqual(st, 400, 'sin listas no se guarda')
        st, _, _, _ = self.pedir('POST', '/api/datos', cuerpo, {'Content-Type': 'application/json', 'X-MultiYouTube': '1'})
        self.assertEqual(st, 200)
        st, _, datos, _ = self.pedir('GET', '/api/datos')
        self.assertEqual(json.loads(datos)['datos']['config']['listas'], {'A': []})

    def test_mudanza_solo_desde_localhost_90(self):
        pedido = {'Origin': 'http://localhost:90', 'Access-Control-Request-Method': 'POST'}
        st, _, _, r = self.pedir('OPTIONS', '/api/datos', cabeceras=pedido)
        self.assertEqual(st, 204)
        self.assertEqual(r.getheader('Access-Control-Allow-Origin'), 'http://localhost:90')
        st, _, _, _ = self.pedir('OPTIONS', '/api/datos', cabeceras={'Origin': 'http://malo.com'})
        self.assertEqual(st, 403)

    def test_validacion_de_consultas(self):
        self.assertEqual(self.pedir('GET', '/api/canal?ruta=../../etc')[0], 404)
        self.assertEqual(self.pedir('GET', '/api/video?id=corto')[0], 404)
        self.assertEqual(self.pedir('GET', '/api/camara?url=ftp://algo')[0], 400)
        self.assertEqual(self.pedir('GET', '/api/inventada')[0], 404)

    def test_salud_responde(self):
        st, _, datos, _ = self.pedir('GET', '/api/salud')
        self.assertEqual(st, 200)
        self.assertIn(json.loads(datos)['estado'], ('desconocido', 'ok', 'falla', 'sin_conexion'))

    def test_archivos_de_la_pagina(self):
        st, tipo, _, r = self.pedir('GET', '/js/urls.js')
        self.assertEqual(st, 200)
        self.assertIn('javascript', tipo)
        self.assertEqual(r.getheader('Cache-Control'), 'no-cache')


@unittest.skipUnless(CON_INTERNET, 'solo con --internet')
class YouTubeDeVerdad(unittest.TestCase):
    def test_canario(self):
        servidor.revisar_salud()
        self.assertEqual(servidor.salud['estado'], 'ok', servidor.salud['detalle'])

    def test_handle_a_canal(self):
        self.assertTrue(servidor.RX_CANAL.match(servidor.info_canal('@YouTube').get('canal', '')))

    def test_video_conocido(self):
        d = servidor.info_video('dQw4w9WgXcQ')
        self.assertEqual(d.get('video'), 'dQw4w9WgXcQ')
        self.assertFalse(d.get('directo'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
