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


class FrenoDeYouTube(unittest.TestCase):
    """Si YouTube responde 429, se deja de consultarle un rato y el aviso se quita solo cuando vuelve a responder."""

    def setUp(self):
        self.original = servidor.urllib.request.urlopen
        self.pedidos = 0
        servidor._freno.update(hasta=0.0, espera=servidor.FRENO_INICIAL_S)
        self.addCleanup(lambda: setattr(servidor.urllib.request, 'urlopen', self.original))
        self.addCleanup(lambda: servidor._freno.update(hasta=0.0, espera=servidor.FRENO_INICIAL_S))
        self.addCleanup(lambda: servidor.fijar_salud('ok'))
        silencio = contextlib.redirect_stdout(io.StringIO())
        silencio.__enter__()
        self.addCleanup(silencio.__exit__, None, None, None)

    def responder(self, codigo):
        def urlopen(req, timeout=None):
            self.pedidos += 1
            if codigo != 200:
                raise servidor.urllib.error.HTTPError(req.full_url, codigo, 'x', None, None)
            return contextlib.nullcontext(io.BytesIO(pagina_video().encode()))
        servidor.urllib.request.urlopen = urlopen

    def test_tras_un_429_no_se_vuelve_a_consultar(self):
        self.responder(429)
        with self.assertRaises(servidor.urllib.error.HTTPError):
            servidor.bajar('https://www.youtube.com/watch?v=abcdefghijk')
        self.assertEqual(servidor.salud['estado'], 'falla')
        self.assertIn('bajar el ritmo', servidor.salud['detalle'])
        self.assertGreater(servidor.frenado(), 14 * 60)
        with self.assertRaises(servidor.urllib.error.HTTPError) as e:
            servidor.bajar('https://www.youtube.com/watch?v=otro0000000')
        self.assertEqual(e.exception.code, 429)
        self.assertEqual(self.pedidos, 1, 'durante la pausa no se molesta a YouTube')

    def test_la_pausa_crece_si_sigue_frenando_y_una_lectura_buena_quita_el_aviso(self):
        self.responder(429)
        for _ in range(2):
            servidor._freno['hasta'] = 0.0   # terminó la pausa anterior
            with self.assertRaises(servidor.urllib.error.HTTPError):
                servidor.bajar('https://www.youtube.com/watch?v=abcdefghijk')
        self.assertGreater(servidor.frenado(), 29 * 60, 'la segunda pausa es el doble')
        servidor._freno['hasta'] = 0.0
        self.responder(200)
        servidor.bajar('https://www.youtube.com/watch?v=abcdefghijk')
        self.assertEqual(servidor.salud['estado'], 'ok', 'volvió a responder: se quita el aviso')
        self.assertEqual(servidor._freno['espera'], servidor.FRENO_INICIAL_S)

    def test_video_normal_se_recuerda_mas_que_un_directo(self):
        servidor._cache.clear()
        llamadas = []
        normal = servidor.recordado('prueba:n', lambda r: 600 if r.get('directo') else 6 * 3600,
                                    lambda: llamadas.append(1) or {'directo': False})
        self.assertGreater(servidor._cache['prueba:n'][0] - servidor.time.time(), 5 * 3600)
        servidor.recordado('prueba:n', 600, lambda: llamadas.append(1) or {})
        self.assertEqual(len(llamadas), 1, 'la segunda vez sale de la memoria')
        self.assertEqual(normal, {'directo': False})


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


class CanalesHLS(unittest.TestCase):
    """Un servidor HLS falso en un puerto libre simula cada caso (sin internet)."""

    RUTAS = {
        '/ok/maestra.m3u8': (200, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\ncalidad.m3u8\n'),
        '/ok/calidad.m3u8': (200, '#EXTM3U\n#EXTINF:6,\nviejo.ts\n#EXTINF:6,\nnuevo.ts\n'),
        '/ok/nuevo.ts': (200, 'x' * 100),
        '/ok/viejo.ts': (403, ''),                       # DVR: el fragmento antiguo bloqueado no importa
        '/geo/maestra.m3u8': (200, '#EXTM3U\n#EXTINF:6,\nseg.ts\n'),
        '/geo/seg.ts': (403, ''),                        # la lista sí, el video no (como los "GEO")
        '/drm/maestra.m3u8': (200, '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x",KEYFORMAT="com.apple.streamingkeydelivery"\n#EXTINF:6,\nseg.ts\n'),
        '/html/maestra.m3u8': (200, '<html>no soy una lista</html>'),
        '/redir.m3u8': (302, ''),                        # redirige a /ok/maestra.m3u8
    }
    conexiones = 0                                       # conexiones TCP que recibió el servidor falso

    @classmethod
    def setUpClass(cls):
        from http.server import BaseHTTPRequestHandler
        rutas = cls.RUTAS

        clase = cls

        class Falso(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'                # conexiones que se pueden reutilizar

            def setup(self):
                clase.conexiones += 1
                super().setup()

            def do_GET(self):
                codigo, cuerpo = rutas.get(self.path, (404, ''))
                self.send_response(codigo)
                if self.path.startswith('/ok/'):
                    self.send_header('Access-Control-Allow-Origin', '*')
                if self.path == '/redir.m3u8':
                    self.send_header('Location', '/ok/maestra.m3u8')
                self.send_header('Content-Length', str(len(cuerpo)))
                self.end_headers()
                self.wfile.write(cuerpo.encode())

            def log_message(self, *a):
                pass

        cls.falso = ThreadingHTTPServer(('127.0.0.1', 0), Falso)
        cls.base = 'http://127.0.0.1:%d' % cls.falso.server_address[1]
        threading.Thread(target=cls.falso.serve_forever, daemon=True).start()

        # El intermediario de verdad (servidor.py) en otro puerto libre
        servidor.Manejador.log_message = lambda *a: None
        cls.mitv = ThreadingHTTPServer(('127.0.0.1', 0), servidor.Manejador)
        servidor.Manejador.puerto = cls.mitv.server_address[1]
        threading.Thread(target=cls.mitv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.falso.shutdown()
        cls.falso.server_close()
        cls.mitv.shutdown()
        cls.mitv.server_close()

    def por_intermediario(self, ruta):
        import urllib.parse
        c = http.client.HTTPConnection('127.0.0.1', servidor.Manejador.puerto, timeout=10)
        c.request('GET', '/api/hls?url=' + urllib.parse.quote(self.base + ruta, safe=''),
                  headers={'Host': '127.0.0.1:%d' % servidor.Manejador.puerto})
        r = c.getresponse()
        cuerpo = r.read()
        c.close()
        return r.status, cuerpo.decode('utf-8', 'replace')

    def test_intermediario_reescribe_listas_y_entrega_video(self):
        import urllib.parse
        st, cuerpo = self.por_intermediario('/ok/maestra.m3u8')
        self.assertEqual(st, 200)
        self.assertIn('/api/hls?url=' + urllib.parse.quote(self.base + '/ok/calidad.m3u8', safe=''), cuerpo)
        st, cuerpo = self.por_intermediario('/redir.m3u8')       # sigue la redirección y reescribe desde la final
        self.assertIn(urllib.parse.quote(self.base + '/ok/calidad.m3u8', safe=''), cuerpo)
        self.assertEqual(self.por_intermediario('/ok/nuevo.ts'), (200, 'x' * 100))
        self.assertEqual(self.por_intermediario('/geo/seg.ts')[0], 403)   # los errores pasan tal cual

    def test_intermediario_reutiliza_la_conexion(self):
        antes = CanalesHLS.conexiones
        for _ in range(4):
            self.assertEqual(self.por_intermediario('/ok/nuevo.ts')[0], 200)
        self.assertLessEqual(CanalesHLS.conexiones - antes, 1, 'cuatro trozos, una sola conexión con el canal')

    def test_canal_que_funciona_y_con_permiso_directo(self):
        self.assertEqual(servidor.revisar_hls(self.base + '/ok/maestra.m3u8'), {'estado': 'ok', 'cors': True})

    def test_bloqueado_aunque_la_lista_responda(self):
        r = servidor.revisar_hls(self.base + '/geo/maestra.m3u8')
        self.assertEqual(r['estado'], 'bloqueado')

    def test_cifrado_drm(self):
        self.assertEqual(servidor.revisar_hls(self.base + '/drm/maestra.m3u8')['estado'], 'drm')

    def test_no_existe_y_no_es_lista(self):
        self.assertEqual(servidor.revisar_hls(self.base + '/nada.m3u8')['estado'], 'noexiste')
        self.assertEqual(servidor.revisar_hls(self.base + '/html/maestra.m3u8')['estado'], 'noexiste')

    def test_marcadores_de_publicidad(self):
        self.assertEqual(servidor.revisar_hls('https://x.tv/p.m3u8?did=[DEVICE_ID]')['estado'], 'publicidad')

    def test_reescribir_lista_para_el_intermediario(self):
        lista = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="clave.key"\n#EXTINF:6,\nseg1.ts\nhttps://otro.tv/seg2.ts\n'
        r = servidor.reescribir_lista_hls(lista, 'https://canal.tv/vivo/lista.m3u8')
        self.assertIn('URI="/api/hls?url=https%3A%2F%2Fcanal.tv%2Fvivo%2Fclave.key"', r)
        self.assertIn('/api/hls?url=https%3A%2F%2Fcanal.tv%2Fvivo%2Fseg1.ts', r)
        self.assertIn('/api/hls?url=https%3A%2F%2Fotro.tv%2Fseg2.ts', r)
        self.assertIn('#EXTINF:6,', r)


@unittest.skipUnless(CON_INTERNET, 'solo con --internet')
class ConexionesCortadas(unittest.TestCase):
    """Si el navegador corta la conexión antes de la respuesta, la consola no se llena de errores."""

    def anotado(self, error):
        srv = servidor.Servidor(('127.0.0.1', 0), servidor.Manejador)
        salida = io.StringIO()
        try:
            with contextlib.redirect_stderr(salida):
                try:
                    raise error
                except Exception:
                    srv.handle_error(None, ('127.0.0.1', 1))
        finally:
            srv.server_close()
        return salida.getvalue()

    def test_conexion_cortada_no_se_anota(self):
        for e in (ConnectionAbortedError(10053, 'anulada'), ConnectionResetError(), BrokenPipeError()):
            self.assertEqual(self.anotado(e), '', type(e).__name__)

    def test_otros_errores_si_se_anotan(self):
        self.assertIn('ValueError', self.anotado(ValueError('de verdad')))


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
