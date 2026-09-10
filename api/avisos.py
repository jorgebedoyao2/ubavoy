"""
UbaVoy - Avisos push a los domiciliarios
=============================================================================
Sin esto, el domiciliario solo se entera de una carrera si tiene la app
abierta en pantalla. Cierra la app, entra una llamada o se duerme el
teléfono, y el pedido no le llega. Cada pedido que nadie contesta es un
cliente que no vuelve.

POR QUÉ NO SE USA FIREBASE CLOUD MESSAGING, que sería lo natural: enviar por
FCM exige una cuenta de servicio, y Google BLOQUEA crear esa llave en este
proyecto (política de la organización). Es el mismo muro del informe. Y hay
un segundo problema: este servidor tampoco puede LEER Firestore, así que
aunque las suscripciones estuvieran en la base de datos, no podría saber a
quién avisar.

OneSignal resuelve las dos cosas: guarda él las suscripciones, y aquí solo se
dice "avísale a los domiciliarios".

EL TEXTO LO ARMA EL SERVIDOR, NO EL CLIENTE. Esa es la decisión de seguridad
importante: si el navegador pudiera mandar el mensaje que quisiera, cualquier
persona con una cuenta podría usar este endpoint para difundir lo que se le
antoje a todos los domiciliarios. El cliente aporta datos; las frases están
aquí.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

URL_ONESIGNAL = 'https://api.onesignal.com/notifications'
APP_ID = os.environ.get('ONESIGNAL_APP_ID', '1b0051c9-b521-4a6f-9d90-03eca15afc97')

# Tope por usuario. Igual que en el agente: no es infalible porque Vercel
# reinicia procesos, pero frena un bucle accidental o un botón repetido.
_uso = {}
MAX_AVISOS_POR_HORA = 12


def _cabecera_autorizacion(llave: str) -> str:
    """
    OneSignal cambió el formato: las llaves nuevas (os_v2_...) van con 'Key' y
    las antiguas con 'Basic'. Se detecta por el prefijo en vez de obligar a
    configurar cuál es, que es un detalle que nadie recuerda seis meses
    después.
    """
    return ('Key ' if llave.startswith('os_v2_') else 'Basic ') + llave


def _pasa_el_freno(uid: str) -> bool:
    ahora = time.time()
    marcas = [t for t in _uso.get(uid, []) if ahora - t < 3600]
    if len(marcas) >= MAX_AVISOS_POR_HORA:
        _uso[uid] = marcas
        return False
    marcas.append(ahora)
    _uso[uid] = marcas
    return True


def _texto_corto(valor, maximo: int) -> str:
    if not isinstance(valor, str):
        return ''
    return ' '.join(valor.split()).strip()[:maximo]


def _enviar(carga: dict) -> dict:
    llave = os.environ.get('ONESIGNAL_REST_API_KEY', '').strip()
    if not llave:
        raise RuntimeError(
            'Falta ONESIGNAL_REST_API_KEY en las variables de entorno de Vercel'
        )

    peticion = urllib.request.Request(
        URL_ONESIGNAL,
        data=json.dumps(carga).encode('utf-8'),
        headers={
            'Authorization': _cabecera_autorizacion(llave),
            'Content-Type': 'application/json; charset=utf-8',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(peticion, timeout=15) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detalle = e.read().decode('utf-8', 'replace')[:400]
        raise RuntimeError('OneSignal respondio ' + str(e.code) + ': ' + detalle)
    except Exception as e:
        raise RuntimeError('No se pudo hablar con OneSignal: ' + str(e))


def avisar_carrera_nueva(carga: dict, uid: str) -> dict:
    """
    Le suena el celular a todos los domiciliarios disponibles.

    Del cliente solo se toman la dirección y el precio, recortados. El resto
    del mensaje es fijo.
    """
    if not _pasa_el_freno(uid):
        return {'enviado': False, 'motivo': 'Demasiados avisos seguidos'}

    direccion = _texto_corto(carga.get('delivery_address'), 60) or 'Ubaté'
    try:
        precio = int(carga.get('estimated_price') or 0)
    except (TypeError, ValueError):
        precio = 0
    if precio not in (5000, 7000):
        precio = 5000

    respuesta = _enviar({
        'app_id': APP_ID,
        # Solo a quien esté marcado como domiciliario. Un cliente que por
        # alguna razón quedara suscrito no recibe carreras.
        'filters': [
            {'field': 'tag', 'key': 'rol', 'relation': '=', 'value': 'domiciliario'},
        ],
        'headings': {'en': '🚨 Nueva carrera en Ubaté', 'es': '🚨 Nueva carrera en Ubaté'},
        'contents': {
            'en': f'Entrega en {direccion} · ${precio:,} COP'.replace(',', '.'),
            'es': f'Entrega en {direccion} · ${precio:,} COP'.replace(',', '.'),
        },
        'url': 'https://ubavoy.vercel.app/apps/driver/',
        # Un solo aviso visible a la vez: si entran tres carreras seguidas, el
        # domiciliario ve la última y no tres notificaciones apiladas.
        'web_push_topic': 'carrera-nueva',
        'chrome_web_icon': 'https://ubavoy.vercel.app/icon-driver-192.png',
        'priority': 10,
        # Si en 10 minutos no se entregó, ya no sirve: la carrera se tomó o
        # el cliente la cancelo.
        'ttl': 600,
    })

    return {
        'enviado': True,
        'destinatarios': respuesta.get('recipients', 0),
        'id': respuesta.get('id', ''),
    }


def estado() -> dict:
    """Diagnóstico para /api/health. Nunca devuelve el valor de la llave."""
    llave = os.environ.get('ONESIGNAL_REST_API_KEY', '').strip()
    return {
        'llave_onesignal': 'configurada' if llave else 'FALTA',
        'formato_llave': ('nueva (Key)' if llave.startswith('os_v2_')
                          else 'antigua (Basic)' if llave else '-'),
        'app_id': APP_ID[:8] + '...' if APP_ID else 'FALTA',
    }
