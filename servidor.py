# Multi YouTube — servidor.py
# Servidor local: entrega la página (como antes hacía "python -m http.server") y además responde
# consultas que el navegador no puede hacer por su cuenta, porque YouTube no lo deja leer sus páginas:
#   /api/estado               → el servidor está arriba
#   /api/canal?ruta=@nombre   → ID del canal (UC…) de un @handle, /c/nombre o /user/nombre
#   /api/video?id=XXXXXXXXXXX → canal dueño de un video y si es (o fue) un directo
#   /api/directo?canal=UC…    → directo que el canal está transmitiendo ahora
#   /api/datos (GET / POST)   → copia en archivo de tus listas, favoritos y ajustes (ver CARPETA_DATOS)
#   /api/camara?url=...       → último cuadro de una cámara IP (MJPEG o foto fija), ver "Cámaras IP"
# Solo usa la biblioteca estándar de Python (no hay que instalar nada) y solo escucha en este equipo.
#
# Uso: python servidor.py [puerto]   (por defecto 18090)
# El puerto 90 de antes lo ocupa IIS (el servidor web de Windows): la página abierta ahí no llegaba a este
# servidor. Por eso este usa otro puerto, y la página vieja de localhost:90 le entrega tus datos una vez
# ("mudanza", ver sincronizar.js) y te lleva a la dirección nueva.

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
PUERTO_POR_DEFECTO = 18090
# Únicas páginas de otra dirección que pueden leer y escribir tus datos: la de antes (para la mudanza)
ORIGENES_MUDANZA = ('http://localhost:90', 'http://127.0.0.1:90')

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


# ---------- Cámaras IP a través del servidor ----------
# El navegador abre como máximo ~6 conexiones a la vez con un mismo equipo, y un stream MJPEG ocupa una todo
# el tiempo: con más cámaras del mismo equipo, las demás no cargaban. Además, las cámaras de foto fija
# (snapshot.jpg) se quedaban quietas y el navegador no deja poner usuario:clave en la URL de una imagen.
# Aquí el servidor se conecta a la cámara (una conexión por cámara, sin ese límite), guarda su último cuadro y
# la página se lo pide con consultas cortas (/api/camara?url=...). Si nadie la pide en 20 s, se desconecta.
CAMARA_INACTIVA_S = 20
CAMARA_FOTO_CADA_S = 1.0       # cámaras de foto fija: se vuelven a pedir cada segundo
MAX_CAMARAS = 40
MAX_CUADRO = 8 * 1024 * 1024


class Camara:
    def __init__(self, url):
        self.url = url
        self.cuadro = None
        self.error = None
        self.acceso = time.time()
        self.hilo = None
        self.listo = threading.Event()

    def pedir(self):
        partes = urllib.parse.urlsplit(self.url)
        url = self.url
        cabeceras = {'User-Agent': CABECERAS_YT['User-Agent']}
        if partes.username:   # usuario:clave en la URL → autenticación básica
            import base64
            cred = urllib.parse.unquote(partes.username) + ':' + urllib.parse.unquote(partes.password or '')
            cabeceras['Authorization'] = 'Basic ' + base64.b64encode(cred.encode('utf-8')).decode('ascii')
            url = urllib.parse.urlunsplit((partes.scheme, partes.hostname + (':%d' % partes.port if partes.port else ''),
                                           partes.path, partes.query, ''))
        return urllib.request.urlopen(urllib.request.Request(url, headers=cabeceras), timeout=15)

    def activa(self):
        return time.time() - self.acceso < CAMARA_INACTIVA_S

    def correr(self):
        try:
            while self.activa():
                try:
                    with self.pedir() as r:
                        tipo = (r.headers.get('Content-Type') or '').lower()
                        if 'multipart' in tipo:
                            self.leer_stream(r)          # MJPEG: vuelve cuando se corta o nadie la mira
                        elif tipo.startswith('image/'):
                            self.guardar(r.read(MAX_CUADRO))
                            time.sleep(CAMARA_FOTO_CADA_S)
                        else:
                            self.error = 'la dirección no entrega imágenes (' + (tipo or 'sin tipo') + ')'
                            self.listo.set()
                            time.sleep(10)
                except (urllib.error.URLError, OSError, ValueError) as e:
                    self.error = 'la cámara no responde (' + str(getattr(e, 'reason', e)) + ')'
                    self.listo.set()
                    time.sleep(3)
        finally:
            self.hilo = None

    def leer_stream(self, r):
        buf = b''
        while self.activa():
            trozo = r.read1(65536) if hasattr(r, 'read1') else r.read(65536)
            if not trozo:
                return
            buf += trozo
            # Cada cuadro JPEG va de FF D8 a FF D9; se guarda el último completo
            fin = buf.rfind(b'\xff\xd9')
            if fin >= 0:
                ini = buf.rfind(b'\xff\xd8', 0, fin)
                if ini >= 0:
                    self.guardar(buf[ini:fin + 2])
                buf = buf[fin + 2:]
            if len(buf) > MAX_CUADRO:
                buf = b''

    def guardar(self, cuadro):
        if cuadro:
            self.cuadro = cuadro
            self.error = None
            self.listo.set()


_camaras = {}
_camaras_lock = threading.Lock()


def cuadro_camara(url):
    """Último cuadro de la cámara (bytes) o un texto de error."""
    with _camaras_lock:
        cam = _camaras.get(url)
        nueva = not cam
        if not cam:
            for u in [u for u, c in _camaras.items() if not c.activa() and not c.hilo]:
                del _camaras[u]
            if len(_camaras) >= MAX_CAMARAS:
                return 'demasiadas cámaras a la vez'
            cam = _camaras[url] = Camara(url)
        cam.acceso = time.time()
        if not cam.hilo:
            cam.hilo = threading.Thread(target=cam.correr, daemon=True)
            cam.hilo.start()
    # Solo la primera consulta espera a que llegue un cuadro; las siguientes responden al tiro (una cámara
    # que no contesta no debe dejar ocupadas las pocas conexiones que el navegador abre con este servidor)
    if cam.cuadro is None and nueva:
        cam.listo.wait(8)
    return cam.cuadro if cam.cuadro is not None else (cam.error or 'conectando con la cámara…')


# ---------- Servidor ----------
class Manejador(SimpleHTTPRequestHandler):
    puerto = PUERTO_POR_DEFECTO
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
        propios = ('http://127.0.0.1:%d' % self.puerto, 'http://localhost:%d' % self.puerto)
        if origen and origen.lower() not in propios + ORIGENES_MUDANZA:
            return False
        return self.host_valido() and self.headers.get('X-MultiYouTube') == '1'

    def origen_mudanza(self):
        o = (self.headers.get('Origin') or '').lower()
        return o if o in ORIGENES_MUDANZA else None

    # Permiso previo que pide el navegador antes de que la página de localhost:90 mande tus datos
    def do_OPTIONS(self):
        o = self.origen_mudanza()
        if not o or not self.host_valido() or urllib.parse.urlsplit(self.path).path != '/api/datos':
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', o)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-MultiYouTube')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if not url.path.startswith('/api/'):
            return super().do_GET()
        if not self.host_valido():
            return self.responder(403, {'error': 'dirección no permitida'})
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        if url.path == '/api/camara':
            return self.entregar_camara(q.get('url', ''))
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

    def entregar_camara(self, url_camara):
        if not re.match(r'^https?://', url_camara, re.IGNORECASE):
            return self.responder(400, {'error': 'falta la dirección de la cámara (http:// o https://)'})
        res = cuadro_camara(url_camara)
        if isinstance(res, str):
            return self.responder(502, {'error': res})
        self.send_response(200)
        self.send_header('Content-Type', 'image/jpeg')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(res)))
        self.end_headers()
        self.wfile.write(res)

    def responder(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        ruta = urllib.parse.urlsplit(self.path).path
        if self.origen_mudanza() and ruta in ('/api/estado', '/api/datos'):
            self.send_header('Access-Control-Allow-Origin', self.origen_mudanza())
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, formato, *args):
        # Solo se anotan las consultas a YouTube y los errores, no cada archivo entregado ni cada guardado
        error = len(args) > 1 and str(args[1])[:1] in '45'
        rutina = any(self.path.startswith(r) for r in ('/api/datos', '/api/estado', '/api/camara', '/api/eventos'))
        if error or (self.path.startswith('/api/') and not rutina):
            super().log_message(formato, *args)


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else PUERTO_POR_DEFECTO
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
