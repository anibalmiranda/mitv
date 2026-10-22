# Multi YouTube — servidor.py
# Servidor local: entrega la página (como antes hacía "python -m http.server") y además responde
# consultas que el navegador no puede hacer por su cuenta, porque YouTube no lo deja leer sus páginas:
#   /api/estado               → el servidor está arriba
#   /api/canal?ruta=@nombre   → ID del canal (UC…) de un @handle, /c/nombre o /user/nombre
#   /api/video?id=XXXXXXXXXXX → canal dueño de un video y si es (o fue) un directo
#   /api/directo?canal=UC…    → directo que el canal está transmitiendo ahora
# Solo usa la biblioteca estándar de Python (no hay que instalar nada) y solo escucha en este equipo.
#
# Uso: python servidor.py [puerto]   (por defecto 90, el mismo de siempre: así se conservan tus datos)

import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CARPETA = os.path.dirname(os.path.abspath(__file__))

# Se hace pasar por un navegador común; las cookies evitan la página de "Antes de ir a YouTube" (consentimiento)
CABECERAS_YT = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
                  'Chrome/130.0 Safari/537.36',
    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
    'Cookie': 'SOCS=CAI; CONSENT=YES+',
}

RX_CANAL = re.compile(r'^UC[\w-]{22}$')
RX_VIDEO = re.compile(r'^[\w-]{11}$')
# @handle, c/nombre o user/nombre (sin barras, espacios ni caracteres de consulta)
RX_RUTA = re.compile(r'^(@|c/|user/)[^\s/?#&%"<>\\]{1,100}$', re.IGNORECASE)


# ---------- Memoria de respuestas (para no consultar a YouTube a cada rato) ----------
_cache = {}
_cache_lock = threading.Lock()


def recordado(clave, segundos, calcular):
    ahora = time.time()
    with _cache_lock:
        v = _cache.get(clave)
        if v and ahora - v[0] < segundos:
            return v[1]
    res = calcular()
    with _cache_lock:
        _cache[clave] = (ahora, res)
    return res


# ---------- Lectura de páginas de YouTube ----------
def bajar(url):
    req = urllib.request.Request(url, headers=CABECERAS_YT)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', 'replace')


def texto_json(s):
    """Convierte el contenido de un string JSON ("…\\u00e9…") a texto normal."""
    try:
        return json.loads('"' + s + '"')
    except ValueError:
        return s


def detalles_video(pagina):
    """Lee el bloque videoDetails de una página de video (o de /live): id, título, autor y canal."""
    i = pagina.find('"videoDetails":{')
    if i < 0:
        return None
    trozo = pagina[i:i + 20000]
    def campo(nombre, rx=r'((?:[^"\\]|\\.)*)'):
        m = re.search('"' + nombre + '":"' + rx + '"', trozo)
        return texto_json(m.group(1)) if m else ''
    vid = campo('videoId', r'([\w-]{11})')
    if not vid:
        return None
    return {
        'video': vid,
        'titulo': campo('title'),
        'autor': campo('author'),
        'canal': campo('channelId', r'(UC[\w-]{22})'),
    }


def en_vivo_ahora(pagina):
    if '"isLiveNow":true' in pagina:
        return True
    return '"isLive":true' in pagina and '"isUpcoming":true' not in pagina


def info_canal(ruta):
    try:
        pagina = bajar('https://www.youtube.com/' + urllib.parse.quote(ruta, safe='@/'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {'error': 'no encontré ese canal'}
        raise
    m = (re.search(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"', pagina) or
         re.search(r'"externalId":"(UC[\w-]{22})"', pagina))
    if not m:
        return {'error': 'no encontré ese canal'}
    t = re.search(r'<meta property="og:title" content="([^"]*)"', pagina)
    return {'canal': m.group(1), 'nombre': html.unescape(t.group(1)) if t else ''}


def info_video(vid):
    pagina = bajar('https://www.youtube.com/watch?v=' + vid)
    d = detalles_video(pagina)
    if not d or d['video'] != vid:
        return {'error': 'el video no existe o no se puede leer'}
    d['directo'] = '"isLiveContent":true' in pagina   # es (o fue) una transmisión en vivo
    d['vivo'] = d['directo'] and en_vivo_ahora(pagina)
    return d


def info_directo(canal):
    # /channel/UC…/live lleva al directo que el canal transmite ahora (si no hay, muestra la página del canal)
    pagina = bajar('https://www.youtube.com/channel/' + canal + '/live')
    d = detalles_video(pagina)
    if not d or not en_vivo_ahora(pagina):
        return {'vivo': False, 'canal': canal}
    d['vivo'] = True
    d['canal'] = d.get('canal') or canal
    return d


# ---------- Servidor ----------
class Manejador(SimpleHTTPRequestHandler):
    # Algunos Windows registran .js como text/plain: se fuerza el tipo correcto
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json'})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CARPETA, **kwargs)

    def end_headers(self):
        # Que el navegador revise siempre si hay archivos nuevos (así ve los cambios sin borrar la caché)
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if not url.path.startswith('/api/'):
            return super().do_GET()
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            res = self.api(url.path[5:], q)
        except urllib.error.HTTPError as e:
            res = {'error': 'YouTube respondió ' + str(e.code)}
        except (urllib.error.URLError, TimeoutError, OSError):
            res = {'error': 'sin conexión con YouTube'}
        if res is None:
            return self.responder(404, {'error': 'consulta desconocida o datos inválidos'})
        self.responder(200, res)

    def api(self, que, q):
        if que == 'estado':
            return {'ok': True}
        if que == 'canal' and RX_RUTA.match(q.get('ruta', '')):
            ruta = q['ruta'].lower()
            return recordado('canal:' + ruta, 7 * 86400, lambda: info_canal(ruta))
        if que == 'video' and RX_VIDEO.match(q.get('id', '')):
            return recordado('video:' + q['id'], 600, lambda: info_video(q['id']))
        if que == 'directo' and RX_CANAL.match(q.get('canal', '')):
            return recordado('directo:' + q['canal'], 60, lambda: info_directo(q['canal']))
        return None

    def responder(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, formato, *args):
        # Solo se anotan las consultas a YouTube y los errores, no cada archivo entregado
        if self.path.startswith('/api/') or (len(args) > 1 and str(args[1])[:1] in '45'):
            super().log_message(formato, *args)


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    servidor = ThreadingHTTPServer(('127.0.0.1', puerto), Manejador)
    print('  Sirviendo ' + CARPETA)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
