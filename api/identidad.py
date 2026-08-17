"""
UbaVoy - Verificación de la sesión del administrador SIN cuenta de servicio
=============================================================================
Google bloquea la creación de claves de cuenta de servicio en este proyecto
(política de organización), así que no se puede usar firebase-admin para
validar la sesión en el servidor.

Alternativa: los tokens de Firebase son JWT firmados por Google con RS256.
Cualquiera puede verificar esa firma con las llaves públicas que Google
publica; lo que no se puede es falsificarla. Eso es exactamente lo que hace
este módulo, y no requiere ningún secreto.

Se comprueba, en este orden:
  1. La firma corresponde a una llave pública vigente de Google.
  2. El token fue emitido para ESTE proyecto (aud e iss).
  3. No está vencido.
  4. El correo es el del administrador.
"""

from __future__ import annotations

import json
import time
import urllib.request

# Certificados públicos con los que Google firma los tokens de Firebase.
URL_CERTIFICADOS = (
    'https://www.googleapis.com/robot/v1/metadata/x509/'
    'securetoken@system.gserviceaccount.com'
)

PROYECTO = 'ubavoy'
EMISOR = f'https://securetoken.google.com/{PROYECTO}'

# Los certificados se guardan en memoria: sin esto habría una petición a
# Google por cada carga del informe.
_cache = {'certificados': None, 'vence': 0}


def _certificados():
    ahora = time.time()
    if _cache['certificados'] and ahora < _cache['vence']:
        return _cache['certificados']

    with urllib.request.urlopen(URL_CERTIFICADOS, timeout=10) as r:
        datos = json.loads(r.read().decode('utf-8'))
        # Google indica cuánto dura la caché en la cabecera.
        control = r.headers.get('Cache-Control', '')
        segundos = 3600
        for parte in control.split(','):
            if 'max-age' in parte:
                try:
                    segundos = int(parte.split('=')[1])
                except Exception:
                    pass

    _cache['certificados'] = datos
    _cache['vence'] = ahora + max(300, segundos - 60)
    return datos


def verificar(token: str, correo_admin: str) -> tuple[bool, str]:
    """Devuelve (autorizado, detalle)."""
    if not token:
        return False, 'Falta la sesión'

    try:
        import jwt
    except ImportError:
        return False, 'Falta la librería de verificación en el servidor'

    try:
        encabezado = jwt.get_unverified_header(token)
    except Exception as e:
        return False, f'Token con formato inválido: {e}'

    kid = encabezado.get('kid')
    certificados = _certificados()
    if kid not in certificados:
        return False, 'El token no corresponde a ninguna llave vigente de Google'

    try:
        llave = _llave_publica(certificados[kid])
        datos = jwt.decode(
            token,
            llave,
            algorithms=['RS256'],
            audience=PROYECTO,
            issuer=EMISOR,
        )
    except Exception as e:
        return False, f'Sesión no válida o vencida: {e}'

    correo = (datos.get('email') or '').lower().strip()
    if correo != correo_admin.lower().strip():
        return False, f'La cuenta {correo or "(sin correo)"} no es administradora'

    return True, correo


def _llave_publica(certificado_pem: str):
    """Extrae la llave pública de un certificado X.509 en formato PEM."""
    from cryptography.x509 import load_pem_x509_certificate
    cert = load_pem_x509_certificate(certificado_pem.encode('utf-8'))
    return cert.public_key()
