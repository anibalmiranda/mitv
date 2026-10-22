# Multi YouTube — servidor.py
# Servidor local: entrega la página (como antes hacía "python -m http.server") y además responde
# consultas que el navegador no puede hacer por su cuenta, porque YouTube no lo deja leer sus páginas:
#   /api/estado               → el servidor está arriba
#   /api/canal?ruta=@nombre   → ID del canal (UC…) de un @handle, /c/nombre o /user/nombre
#   /api/video?id=XXXXXXXXXXX → canal dueño de un video y si es (o fue) un directo
#   /api/directo?canal=UC…    → directo que el canal está transmitiendo ahora
#   /api/datos (GET / POST)   → copia en archivo de tus listas, favoritos y ajustes (ver CARPETA_DATOS)
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
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CARPETA = os.path.dirname(os.path.abspath(__file__))

# Tus datos van fuera de la carpeta del programa: así la versión de desarrollo y la desplegada comparten
# los mismos (igual que comparten los del navegador) y actualizar o volver de versión nunca los toca.
CARPETA_DATOS = os.path.join(os.environ.get('APPDATA') or os.path.expanduser('~'), 'MultiYouTube')
ARCHIVO_DATOS = os.path.join(CARPETA_DATOS, 'datos.json')
CARPETA_RESPALDOS = os.path.join(CARPETA_DATOS, 'respaldos')
RESPALDOS_A_GUARDAR = 14          # un respaldo por día, los últimos 14 días
MAX_DATOS = 20 * 1024 * 1024      # tope de tamaño para lo que manda la página

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


# ---------- Datos del usuario en archivo ----------
_datos_lock = threading.Lock()


def leer_datos():
    try:
        with open(ARCHIVO_DATOS, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return None   # archivo dañado: la página sigue con lo del navegador y lo vuelve a escribir


def guardar_datos(datos):
    with _datos_lock:
        os.makedirs(CARPETA_RESPALDOS, exist_ok=True)
        # Se escribe a un archivo aparte y se reemplaza de una vez: un corte de luz no deja el archivo a medias
        tmp = ARCHIVO_DATOS + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False)
        os.replace(tmp, ARCHIVO_DATOS)
        # Respaldo del día (el primero que se guarda cada día) y se borran los más antiguos
        hoy = os.path.join(CARPETA_RESPALDOS, 'datos-' + date.today().isoformat() + '.json')
        if not os.path.exists(hoy):
            with open(hoy, 'w', encoding='utf-8') as f:
                json.dump(datos, f, ensure_ascii=False)
            viejos = sorted(n for n in os.listdir(CARPETA_RESPALDOS) if n.startswith('datos-'))
            for n in viejos[:-RESPALDOS_A_GUARDAR]:
                os.remove(os.path.join(CARPETA_RESPALDOS, n))


# ---------- Servidor ----------
class Manejador(SimpleHTTPRequestHandler):
    puerto = 90
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

    # Las consultas /api/ solo se aceptan si vienen a esta dirección (127.0.0.1 o localhost con este puerto).
    # Evita que otra página web, haciéndose pasar por "este equipo" (DNS rebinding), use el servidor.
    def host_valido(self):
        host = (self.headers.get('Host') or '').lower()
        return host in ('127.0.0.1:%d' % self.puerto, 'localhost:%d' % self.puerto)

    # Para escribir se exige además una cabecera propia: una página ajena no puede mandarla sin permiso
    # del servidor (el navegador lo bloquea), así que no puede pisar tus datos.
    def escritura_valida(self):
        origen = self.headers.get('Origin')
        if origen and origen.lower() not in ('http://127.0.0.1:%d' % self.puerto, 'http://localhost:%d' % self.puerto):
            return False
        return self.host_valido() and self.headers.get('X-MultiYouTube') == '1'

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if not url.path.startswith('/api/'):
            return super().do_GET()
        if not self.host_valido():
            return self.responder(403, {'error': 'dirección no permitida'})
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

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path != '/api/datos':
            return self.responder(404, {'error': 'consulta desconocida'})
        if not self.escritura_valida():
            return self.responder(403, {'error': 'escritura no permitida'})
        try:
            largo = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            largo = 0
        if largo <= 0 or largo > MAX_DATOS:
            return self.responder(400, {'error': 'tamaño inválido'})
        try:
            datos = json.loads(self.rfile.read(largo).decode('utf-8'))
        except ValueError:
            return self.responder(400, {'error': 'no es JSON'})
        # Lo mínimo para no guardar basura encima de tus datos: una configuración con listas
        c = datos.get('config') if isinstance(datos, dict) else None
        if not isinstance(c, dict) or not isinstance(c.get('listas'), dict):
            return self.responder(400, {'error': 'no trae una configuración válida'})
        try:
            guardar_datos(datos)
        except OSError as e:
            return self.responder(500, {'error': 'no se pudo escribir el archivo: ' + str(e)})
        self.responder(200, {'ok': True})

    def api(self, que, q):
        if que == 'estado':
            return {'ok': True}
        if que == 'datos':
            return {'datos': leer_datos(), 'archivo': ARCHIVO_DATOS}
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
        # Solo se anotan las consultas a YouTube y los errores, no cada archivo entregado ni cada guardado
        error = len(args) > 1 and str(args[1])[:1] in '45'
        rutina = self.path.startswith('/api/datos') or self.path.startswith('/api/estado')
        if error or (self.path.startswith('/api/') and not rutina):
            super().log_message(formato, *args)


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    Manejador.puerto = puerto
    servidor = ThreadingHTTPServer(('127.0.0.1', puerto), Manejador)
    print('  Sirviendo ' + CARPETA)
    print('  Tus datos se guardan en ' + ARCHIVO_DATOS)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
