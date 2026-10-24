# Multi YouTube — servidor.py
# Servidor local: entrega la página (como antes hacía "python -m http.server") y además responde
# consultas que el navegador no puede hacer por su cuenta, porque YouTube no lo deja leer sus páginas:
#   /api/estado               → el servidor está arriba
#   /api/canal?ruta=@nombre   → ID del canal (UC…) de un @handle, /c/nombre o /user/nombre
#   /api/video?id=XXXXXXXXXXX → canal dueño de un video y si es (o fue) un directo
#   /api/directo?canal=UC…    → directo que el canal está transmitiendo ahora
#   /api/datos (GET / POST)   → copia en archivo de tus listas, favoritos y ajustes (ver CARPETA_DATOS)
#   /api/camara?url=...       → último cuadro de una cámara IP (MJPEG o foto fija), ver "Cámaras IP"
#   /api/eventos              → conexión abierta por la que llegan las teclas multimedia (solo Windows)
#   /api/salud[?revisar=1]    → si la lectura de YouTube funciona (ver "Salud de la lectura de YouTube")
#   /api/canalhls?url=...     → revisa a fondo un canal de TV .m3u8 (ver "Canales de TV por HLS")
#   /api/hls?url=...          → intermediario para canales .m3u8 que el navegador no puede leer directo
# Solo usa la biblioteca estándar de Python (no hay que instalar nada) y solo escucha en este equipo.
#
# Uso: python servidor.py [puerto]   (por defecto 18090)
# El puerto 90 de antes lo ocupa IIS (el servidor web de Windows): la página abierta ahí no llegaba a este
# servidor. Por eso este usa otro puerto, y la página vieja de localhost:90 le entrega tus datos una vez
# ("mudanza", ver sincronizar.js) y te lleva a la dirección nueva.

import html
import http.client
import json
import os
import queue
import re
import ssl
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
        vigilar_pagina(pagina)
        return {'error': 'no encontré ese canal'}
    t = re.search(r'<meta property="og:title" content="([^"]*)"', pagina)
    return {'canal': m.group(1), 'nombre': html.unescape(t.group(1)) if t else ''}


def info_video(vid):
    pagina = bajar('https://www.youtube.com/watch?v=' + vid)
    d = detalles_video(pagina)
    if not d or d['video'] != vid:
        vigilar_pagina(pagina)
        return {'error': 'el video no existe o no se puede leer'}
    d['directo'] = '"isLiveContent":true' in pagina   # es (o fue) una transmisión en vivo
    d['vivo'] = d['directo'] and en_vivo_ahora(pagina)
    d['incrustable'] = '"playableInEmbed":false' not in pagina   # el dueño permite verlo fuera de YouTube
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


# ---------- Canales de TV por HLS (.m3u8) ----------
# revisar_hls: revisa un canal a fondo (lista maestra → primera calidad → primer fragmento de video), porque hay
# canales que entregan la lista a cualquiera y recién bloquean el video (p. ej. los "GEO" fuera de España).
# También averigua si el navegador puede leerlo directo (CORS); si no, la página lo pide a través de /api/hls,
# que reescribe las direcciones de la lista para que todo pase por este servidor.
RX_MARCADOR_PUBLICIDAD = re.compile(r'\[[A-Z_]{2,}\]')   # [DEVICE_ID], [IP]... que la app original debía rellenar
MAX_LISTA_HLS = 2 * 1024 * 1024


def _pedir_hls(url, poco=False):
    req = urllib.request.Request(url, headers={'User-Agent': CABECERAS_YT['User-Agent'],
                                               'Origin': 'http://127.0.0.1:%d' % Manejador.puerto})
    if poco:
        req.add_header('Range', 'bytes=0-2047')
    r = urllib.request.urlopen(req, timeout=12)
    cuerpo = r.read(2048 if poco else MAX_LISTA_HLS)
    r.close()
    return r, cuerpo


def _ultima_uri(texto):
    """Último fragmento de video de una lista (la línea que sigue al último #EXTINF)."""
    lineas = texto.splitlines()
    for i in range(len(lineas) - 1, -1, -1):
        if lineas[i].startswith('#EXTINF'):
            for sig in lineas[i + 1:]:
                sig = sig.strip()
                if sig and not sig.startswith('#'):
                    return sig
    return None


def _primera_uri(texto, tras):
    """Primera dirección que viene después de una línea que empieza con `tras` (#EXT-X-STREAM-INF, #EXTINF)."""
    lineas = texto.splitlines()
    for i, l in enumerate(lineas):
        if l.startswith(tras):
            for sig in lineas[i + 1:]:
                sig = sig.strip()
                if sig and not sig.startswith('#'):
                    return sig
    m = re.search(r'#EXT-X-MAP:[^\n]*URI="([^"]+)"', texto)   # fMP4: el segmento de inicio
    return m.group(1) if (m and tras == '#EXTINF') else None


def revisar_hls(url):
    if RX_MARCADOR_PUBLICIDAD.search(url):
        return {'estado': 'publicidad', 'detalle': 'la dirección trae datos de publicidad sin rellenar'}
    cors = True
    try:
        r, cuerpo = _pedir_hls(url)
        cors = cors and bool(r.headers.get('Access-Control-Allow-Origin'))
        texto = cuerpo.decode('utf-8', 'replace')
        base = r.geturl()
        if '#EXTM3U' not in texto:
            return {'estado': 'noexiste', 'detalle': 'la dirección no entrega una lista de video'}
        if '#EXT-X-STREAM-INF' in texto:                      # lista maestra: se entra a la primera calidad
            variante = _primera_uri(texto, '#EXT-X-STREAM-INF')
            if not variante:
                return {'estado': 'noexiste', 'detalle': 'la lista no trae calidades de video'}
            r, cuerpo = _pedir_hls(urllib.parse.urljoin(base, variante))
            cors = cors and bool(r.headers.get('Access-Control-Allow-Origin'))
            texto = cuerpo.decode('utf-8', 'replace')
            base = r.geturl()
        if re.search(r'#EXT-X-KEY:[^\n]*(METHOD=SAMPLE-AES|com\.widevine|com\.microsoft\.playready|com\.apple\.streamingkeydelivery)', texto):
            return {'estado': 'drm', 'detalle': 'el video está cifrado (DRM): solo se ve en la app oficial'}
        # El ÚLTIMO fragmento (el en vivo, lo que de verdad se ve): en las listas con DVR el primero puede ser de
        # hace horas y estar bloqueado por derechos de otro programa (RTVE bloquea fuera de España según el programa)
        segmento = _ultima_uri(texto) or _primera_uri(texto, '#EXTINF')
        if segmento:
            r, _ = _pedir_hls(urllib.parse.urljoin(base, segmento), poco=True)
            cors = cors and bool(r.headers.get('Access-Control-Allow-Origin'))
        return {'estado': 'ok', 'cors': cors}
    except urllib.error.HTTPError as e:
        if e.code in (401, 407):
            return {'estado': 'autorizacion', 'detalle': 'pide autorización (%d)' % e.code}
        if e.code in (403, 451):
            return {'estado': 'bloqueado', 'detalle': 'bloqueado (%d): por país o sin permiso' % e.code}
        if e.code in (404, 410):
            return {'estado': 'noexiste', 'detalle': 'ya no existe (%d)' % e.code}
        return {'estado': 'error', 'detalle': 'el canal respondió %d' % e.code}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {'estado': 'noresponde', 'detalle': 'no responde (' + str(getattr(e, 'reason', e))[:60] + ')'}


def reescribir_lista_hls(texto, base):
    """Cambia cada dirección de la lista por /api/hls?url=… (para canales que el navegador no puede leer directo)."""
    def via(uri):
        return '/api/hls?url=' + urllib.parse.quote(urllib.parse.urljoin(base, uri), safe='')
    salida = []
    for linea in texto.splitlines():
        if linea.strip() and not linea.startswith('#'):
            salida.append(via(linea.strip()))
        elif linea.startswith('#') and 'URI="' in linea:
            salida.append(re.sub(r'URI="([^"]+)"', lambda m: 'URI="' + via(m.group(1)) + '"', linea))
        else:
            salida.append(linea)
    return '\n'.join(salida) + '\n'


# ---------- Conexiones reutilizables para el intermediario de TV ----------
# Un canal pide un trozo de video cada pocos segundos: abrir una conexión nueva (y su cifrado HTTPS) para cada uno
# era lo más lento del intermediario. Aquí las conexiones con cada servidor de canal se guardan y se reutilizan.
MAX_CONEXIONES_POR_EQUIPO = 4
_conexiones = {}                 # (esquema, equipo) → conexiones libres
_conexiones_lock = threading.Lock()
_ssl = ssl.create_default_context()


def _conexion(esquema, equipo):
    with _conexiones_lock:
        libres = _conexiones.get((esquema, equipo))
        if libres:
            return libres.pop()
    if esquema == 'https':
        return http.client.HTTPSConnection(equipo, timeout=20, context=_ssl)
    return http.client.HTTPConnection(equipo, timeout=20)


def _devolver_conexion(esquema, equipo, con, respuesta):
    """La conexión vuelve al pozo solo si quedó lista para otro pedido."""
    if respuesta.will_close or not respuesta.isclosed():
        con.close()
        return
    with _conexiones_lock:
        libres = _conexiones.setdefault((esquema, equipo), [])
        if len(libres) < MAX_CONEXIONES_POR_EQUIPO:
            libres.append(con)
            return
    con.close()


def pedir_reutilizando(url, saltos=3):
    """GET con conexiones reutilizables (y siguiendo redirecciones). Devuelve (con, respuesta, esquema, equipo, url_final)."""
    p = urllib.parse.urlsplit(url)
    ruta = (p.path or '/') + ('?' + p.query if p.query else '')
    cabeceras = {'User-Agent': CABECERAS_YT['User-Agent'], 'Accept': '*/*', 'Connection': 'keep-alive'}
    for intento in (1, 2):   # una conexión guardada puede haberse cerrado: se reintenta con una nueva
        con = _conexion(p.scheme, p.netloc)
        try:
            con.request('GET', ruta, headers=cabeceras)
            r = con.getresponse()
            break
        except (http.client.HTTPException, OSError):
            con.close()
            if intento == 2:
                raise
    if r.status in (301, 302, 303, 307, 308) and r.getheader('Location') and saltos > 0:
        r.read()
        _devolver_conexion(p.scheme, p.netloc, con, r)
        return pedir_reutilizando(urllib.parse.urljoin(url, r.getheader('Location')), saltos - 1)
    return con, r, p.scheme, p.netloc, url


# ---------- Salud de la lectura de YouTube ----------
# Este servidor lee las páginas públicas de YouTube (no usa su API oficial): si YouTube cambia su página o pide
# comprobar que no eres un robot, la lectura deja de funcionar sin avisar. Para notarlo, al arrancar y cada
# 3 horas lee un video y un canal que siempre existen ("canario"); también mira cada página que lee. La página
# consulta /api/salud y muestra un aviso si algo anda mal.
CANARIO_VIDEO = 'dQw4w9WgXcQ'
CANARIO_CANAL = '@YouTube'
REVISION_SALUD_S = 3 * 3600
salud = {'estado': 'desconocido', 'detalle': '', 'desde': None, 'revisado': None}   # estado: ok | falla | sin_conexion
_salud_lock = threading.Lock()
FALLA_FORMATO = 'YouTube cambió el formato de su página'
FALLA_ROBOT = 'YouTube pide comprobar que no eres un robot'
FALLA_COOKIES = 'YouTube muestra la página de aceptar cookies'


def fijar_salud(estado, detalle=''):
    with _salud_lock:
        if salud['estado'] != estado:
            salud['desde'] = time.time()
            if estado != 'ok':
                print('  (!) Lectura de YouTube: ' + (detalle or estado))
        salud.update(estado=estado, detalle=detalle, revisado=time.time())


def diagnosticar(pagina):
    """Por qué una página de YouTube no trae lo esperado ('' si no hay una razón clara)."""
    if 'consent.youtube.com' in pagina[:20000]:
        return FALLA_COOKIES
    if 'not a bot' in pagina or 'no eres un bot' in pagina or '/sorry/index' in pagina:
        return FALLA_ROBOT
    if 'ytInitialPlayerResponse' not in pagina and 'ytInitialData' not in pagina:
        return FALLA_FORMATO
    return ''


def vigilar_pagina(pagina):
    """Una página que no se pudo leer: si es por una causa general (no por ese video), se avisa."""
    razon = diagnosticar(pagina)
    if razon:
        fijar_salud('falla', razon)


def revisar_salud():
    try:
        pagina = bajar('https://www.youtube.com/watch?v=' + CANARIO_VIDEO)
        d = detalles_video(pagina)
        if not d or d['video'] != CANARIO_VIDEO or not d.get('canal'):
            return fijar_salud('falla', diagnosticar(pagina) or 'no se pudo leer un video que siempre existe')
        c = info_canal(CANARIO_CANAL)
        if not RX_CANAL.match(c.get('canal', '')):
            return fijar_salud('falla', 'no se pudo leer la página de un canal')
        fijar_salud('ok')
    except urllib.error.HTTPError as e:
        fijar_salud('falla', 'YouTube respondió ' + str(e.code))
    except (urllib.error.URLError, OSError):
        fijar_salud('sin_conexion', 'no hay conexión con YouTube')


def vigilar_salud():
    time.sleep(5)   # que el servidor alcance a arrancar
    while True:
        revisar_salud()
        time.sleep(REVISION_SALUD_S)


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
                            time.sleep(1)                # si la cámara corta seguido, no reconectar en ráfaga
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


# ---------- Teclas multimedia del teclado (solo Windows) ----------
# Se escuchan en todo Windows (aunque el navegador no esté al frente) con un "gancho" de teclado. Solo se
# toman mientras la página está abierta (conectada a /api/eventos): entonces no siguen a otros programas
# (Spotify, el propio navegador). Con la página cerrada, las teclas funcionan como siempre.
TECLAS_MULTIMEDIA = {0xB3: 'playpausa', 0xB0: 'siguiente', 0xB1: 'anterior', 0xB2: 'detener'}
_oyentes = []                  # una cola por página conectada; las teclas van a la más reciente
_oyentes_lock = threading.Lock()


def avisar_tecla(accion):
    with _oyentes_lock:
        cola = _oyentes[-1] if _oyentes else None
    if cola:
        cola.put(accion)
    return bool(cola)


def escuchar_teclas_multimedia():
    if sys.platform != 'win32':
        return
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP = 13, 0x0100, 0x0101, 0x0104, 0x0105

    class KBDLLHOOKSTRUCT(ctypes.Structure):
        _fields_ = [('vkCode', wintypes.DWORD), ('scanCode', wintypes.DWORD), ('flags', wintypes.DWORD),
                    ('time', wintypes.DWORD), ('dwExtraInfo', ctypes.c_size_t)]

    LRESULT = ctypes.c_ssize_t
    HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
    user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]
    user32.SetWindowsHookExW.restype = wintypes.HHOOK
    user32.CallNextHookEx.argtypes = [wintypes.HHOOK, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
    user32.CallNextHookEx.restype = LRESULT
    user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
    kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
    kernel32.GetModuleHandleW.restype = wintypes.HMODULE
    tomadas = set()   # teclas cuyo "apretar" se tomó: su "soltar" tampoco sigue a otros programas

    def gancho(codigo, wparam, lparam):
        if codigo == 0:
            vk = ctypes.cast(lparam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents.vkCode
            accion = TECLAS_MULTIMEDIA.get(vk)
            if accion and wparam in (WM_KEYDOWN, WM_SYSKEYDOWN) and avisar_tecla(accion):
                tomadas.add(vk)
                return 1
            if wparam in (WM_KEYUP, WM_SYSKEYUP) and vk in tomadas:
                tomadas.discard(vk)
                return 1
        return user32.CallNextHookEx(None, codigo, wparam, lparam)

    funcion = HOOKPROC(gancho)   # se guarda la referencia: si Python la libera, Windows llamaría a la nada
    if not user32.SetWindowsHookExW(WH_KEYBOARD_LL, funcion, kernel32.GetModuleHandleW(None), 0):
        print('  (No se pudieron escuchar las teclas multimedia: error %d)' % ctypes.get_last_error())
        return
    msg = wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:   # el gancho necesita este bucle de mensajes
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))


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
        if url.path == '/api/eventos':
            return self.entregar_eventos()
        if url.path == '/api/hls':
            return self.entregar_hls(q.get('url', ''))
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
        if que == 'salud':
            if q.get('revisar') == '1':
                revisar_salud()
            with _salud_lock:
                return dict(salud)
        if que == 'datos':
            return {'datos': leer_datos(), 'archivo': ARCHIVO_DATOS}
        if que == 'canal' and RX_RUTA.match(q.get('ruta', '')):
            ruta = q['ruta'].lower()
            return recordado('canal:' + ruta, 7 * 86400, lambda: info_canal(ruta))
        if que == 'video' and RX_VIDEO.match(q.get('id', '')):
            return recordado('video:' + q['id'], 600, lambda: info_video(q['id']))
        if que == 'canalhls' and re.match(r'^https?://', q.get('url', ''), re.IGNORECASE):
            return recordado('hls:' + q['url'], 600, lambda: revisar_hls(q['url']))
        if que == 'directo' and RX_CANAL.match(q.get('canal', '')):
            return recordado('directo:' + q['canal'], 60, lambda: info_directo(q['canal']))
        return None

    # Conexión abierta con la página (Server-Sent Events): por aquí le llegan las teclas multimedia
    def entregar_eventos(self):
        cola = queue.Queue()
        with _oyentes_lock:
            _oyentes.append(cola)
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(b': conectado\n\n')
            self.wfile.flush()
            while True:
                try:
                    texto = 'data: ' + json.dumps({'tecla': cola.get(timeout=5)}) + '\n\n'
                except queue.Empty:
                    texto = ': sigo aqui\n\n'   # así se nota pronto si la página se cerró
                self.wfile.write(texto.encode('utf-8'))
                self.wfile.flush()
        except OSError:
            pass   # la página se cerró o se recargó
        finally:
            with _oyentes_lock:
                _oyentes.remove(cola)

    # Intermediario para canales HLS que el navegador no puede leer directo (sin permiso CORS)
    def entregar_hls(self, url_hls):
        if not re.match(r'^https?://', url_hls, re.IGNORECASE):
            return self.responder(400, {'error': 'falta la dirección del canal (http:// o https://)'})
        try:
            con, r, esquema, equipo, base = pedir_reutilizando(url_hls)
        except (http.client.HTTPException, OSError, ValueError):
            return self.responder(502, {'error': 'el canal no responde'})
        if r.status >= 400:
            r.read()
            _devolver_conexion(esquema, equipo, con, r)
            return self.responder(r.status, {'error': 'el canal respondió %d' % r.status})
        tipo = r.getheader('Content-Type') or 'application/octet-stream'
        es_lista = 'mpegurl' in tipo.lower() or '.m3u8' in urllib.parse.urlsplit(base).path.lower()
        try:
            if es_lista:
                # Las listas son chicas: se leen enteras para cambiar sus direcciones por las de este servidor
                datos = r.read(MAX_LISTA_HLS)
                _devolver_conexion(esquema, equipo, con, r)
                if datos[:7] == b'#EXTM3U':
                    datos = reescribir_lista_hls(datos.decode('utf-8', 'replace'), base).encode('utf-8')
                    tipo = 'application/vnd.apple.mpegurl'
                self.send_response(200)
                self.send_header('Content-Type', tipo)
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(datos)))
                self.end_headers()
                self.wfile.write(datos)
                return
            # Trozos de video: se van entregando a medida que llegan (no se espera el trozo completo)
            self.send_response(200)
            self.send_header('Content-Type', tipo)
            self.send_header('Cache-Control', 'no-store')
            if r.getheader('Content-Length'):
                self.send_header('Content-Length', r.getheader('Content-Length'))
            self.end_headers()
            while True:
                trozo = r.read(65536)
                if not trozo:
                    break
                self.wfile.write(trozo)
            _devolver_conexion(esquema, equipo, con, r)
        except (http.client.HTTPException, OSError):
            con.close()   # la página dejó de pedirlo (p. ej. cambió de canal) o el canal se cortó

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
        rutina = any(self.path.startswith(r) for r in ('/api/datos', '/api/estado', '/api/camara', '/api/eventos', '/api/salud', '/api/hls', '/api/canalhls'))
        if error or (self.path.startswith('/api/') and not rutina):
            super().log_message(formato, *args)


def main():
    # Si la consola de Windows no puede mostrar algún carácter, que lo reemplace en vez de fallar
    try:
        sys.stdout.reconfigure(errors='replace')
    except (AttributeError, ValueError):
        pass
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else PUERTO_POR_DEFECTO
    Manejador.puerto = puerto
    servidor = ThreadingHTTPServer(('127.0.0.1', puerto), Manejador)
    print('  Sirviendo ' + CARPETA)
    print('  Tus datos se guardan en ' + ARCHIVO_DATOS)
    threading.Thread(target=escuchar_teclas_multimedia, daemon=True).start()
    threading.Thread(target=vigilar_salud, daemon=True).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
