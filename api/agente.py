"""
UbaVoy - Agente conversacional que toma pedidos
=============================================================================
El cliente conversa en el navegador; este módulo es el único que habla con
OpenAI. La llave vive aquí (variable de entorno de Vercel) y NUNCA en el
HTML, porque cualquiera que abra la página podría leerla y gastar el saldo.

REPARTO DE RESPONSABILIDADES (la regla que sostiene todo esto):

    El modelo pone las palabras.  El código pone la verdad.

El modelo entiende lo que escribió la persona y redacta la siguiente frase.
Nada más. No decide precios, no confirma pedidos y no escribe en la base de
datos: eso lo hace el navegador del cliente, porque las reglas de Firestore
exigen que el pedido lo cree su propio dueño (client_uid == request.auth.uid).

Si el modelo alucina un precio de $3.000, aquí se descarta y se vuelve a
preguntar. Un pedido mal formado nunca llega a Firestore.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

# Debe coincidir con preciosValidos() en firestore.rules. Si cambian los
# paquetes, se cambian en los dos lados.
PRECIOS_VALIDOS = (5000, 7000)

MODELO = os.environ.get('OPENAI_MODEL', 'gpt-5-mini')
URL_OPENAI = 'https://api.openai.com/v1/chat/completions'

# Topes de tamaño. No son cosmética: cada token que entra se paga, y sin
# techo alguien podría mandar un mensaje enorme y encarecer la cuenta.
MAX_CARACTERES_MENSAJE = 400
MAX_TURNOS_HISTORIAL = 12

# Ojo con este número: los modelos de razonamiento (la familia gpt-5) gastan
# tokens "pensando" ANTES de escribir, y salen de este mismo presupuesto. Con
# un techo bajo se lo gastan razonando y devuelven la respuesta vacía, que se
# ve como un fallo genérico y cuesta horas de diagnosticar.
#
# Subirlo no encarece: solo se paga lo que el modelo realmente genera, y
# nuestras respuestas son de dos frases.
MAX_TOKENS_RESPUESTA = int(os.environ.get('OPENAI_MAX_TOKENS', '2000'))

# Freno por usuario. Advertencia honesta: Vercel arranca procesos nuevos
# constantemente, así que esta memoria se pierde y el freno NO es infalible.
# Sirve contra un bucle accidental o un clic repetido. La protección real es
# el tope de gasto configurado en la cuenta de OpenAI.
_uso = {}
MAX_MENSAJES_POR_HORA = 60


INSTRUCCIONES = (
    "Eres quien toma los pedidos de UbaVoy, el servicio de domicilios de "
    "Ubaté, Cundinamarca. Hablas como un vecino amable: de tú, con frases "
    "cortas, sin formalidades ni palabras rebuscadas. Nunca usas emojis ni "
    "viñetas.\n\n"
    "Tu único trabajo es reunir tres datos, en este orden:\n"
    "1. QUÉ necesita que le lleven (por ejemplo: un almuerzo del restaurante "
    "La Esquina, una droga de la farmacia del parque).\n"
    "2. A DÓNDE lo llevamos (la dirección en Ubaté).\n"
    "3. SI la entrega es dentro del centro o fuera del centro.\n\n"
    "Reglas:\n"
    "- Pregunta UNA sola cosa a la vez, y solo lo que todavía falta.\n"
    "- Si la persona te da varios datos de una vez, tómalos todos y salta "
    "las preguntas que ya quedaron resueltas.\n"
    "- Confirma en una frase corta lo que entendiste antes de la siguiente "
    "pregunta.\n"
    "- Si algo te queda ambiguo, pregunta; no lo inventes. Es preferible una "
    "pregunta de más que una dirección equivocada.\n"
    "- Nunca inventes el precio ni digas que el pedido quedó confirmado. Eso "
    "lo maneja la aplicación, no tú.\n"
    "- Si te preguntan algo que no tiene que ver con el pedido, responde "
    "breve y amable y vuelve a lo que falta.\n\n"
    "En cada respuesta devuelves los campos que hayas logrado reunir hasta "
    "ahora (o null si aún no los tienes) y la frase que le vas a decir a la "
    "persona. Para el precio: dentro del centro son 5000 y fuera del centro "
    "son 7000."
)

ESQUEMA = {
    "name": "pedido_en_curso",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "respuesta": {
                "type": "string",
                "description": "Lo que le dices a la persona. Una o dos frases.",
            },
            "task_description": {
                "type": ["string", "null"],
                "description": "Qué hay que llevarle, o null si aún no lo sabes.",
            },
            "delivery_address": {
                "type": ["string", "null"],
                "description": "Dirección de entrega en Ubaté, o null.",
            },
            "estimated_price": {
                "type": ["integer", "null"],
                "description": "5000 dentro del centro, 7000 fuera, null si no se sabe.",
            },
        },
        "required": [
            "respuesta",
            "task_description",
            "delivery_address",
            "estimated_price",
        ],
        "additionalProperties": False,
    },
}


def _texto_limpio(valor, maximo):
    """Recorta y normaliza. Devuelve None si no queda nada aprovechable."""
    if not isinstance(valor, str):
        return None
    limpio = ' '.join(valor.split()).strip()
    if len(limpio) < 3:
        return None
    return limpio[:maximo]


def _validar_estado(crudo):
    """
    Aquí es donde el código pone la verdad: lo que devuelve el modelo se
    acepta campo por campo, y lo que no cumple se descarta en silencio para
    que el agente lo vuelva a preguntar.
    """
    if not isinstance(crudo, dict):
        crudo = {}

    precio = crudo.get('estimated_price')
    if precio not in PRECIOS_VALIDOS:
        precio = None

    return {
        'task_description': _texto_limpio(crudo.get('task_description'), 300),
        'delivery_address': _texto_limpio(crudo.get('delivery_address'), 200),
        'estimated_price': precio,
    }


def _fusionar(previo, nuevo):
    """
    Un dato ya confirmado no se pierde porque el modelo lo omita en un turno
    posterior. Solo se sobrescribe cuando el modelo trae algo concreto, que
    es como la persona corrige ("no, era la calle 15").
    """
    salida = dict(previo)
    for campo, valor in nuevo.items():
        if valor is not None:
            salida[campo] = valor
    return salida


def _pasa_el_freno(uid):
    ahora = time.time()
    marcas = [t for t in _uso.get(uid, []) if ahora - t < 3600]
    if len(marcas) >= MAX_MENSAJES_POR_HORA:
        _uso[uid] = marcas
        return False
    marcas.append(ahora)
    _uso[uid] = marcas
    return True


def _llamar_openai(mensajes):
    llave = os.environ.get('OPENAI_API_KEY', '').strip()
    if not llave:
        raise RuntimeError(
            'Falta OPENAI_API_KEY en las variables de entorno de Vercel'
        )

    cuerpo = json.dumps({
        'model': MODELO,
        'messages': mensajes,
        'max_completion_tokens': MAX_TOKENS_RESPUESTA,
        'response_format': {'type': 'json_schema', 'json_schema': ESQUEMA},
    }).encode('utf-8')

    peticion = urllib.request.Request(
        URL_OPENAI,
        data=cuerpo,
        headers={
            'Authorization': 'Bearer ' + llave,
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(peticion, timeout=25) as r:
            respuesta = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detalle = e.read().decode('utf-8', 'replace')[:400]
        raise RuntimeError(
            'OpenAI respondio ' + str(e.code) + ' con el modelo ' + MODELO
            + ': ' + detalle
        )
    except Exception as e:
        raise RuntimeError('No se pudo hablar con OpenAI: ' + str(e))

    # El diagnóstico va aquí y no en el cliente: cuando algo falla hay que
    # poder saber SI el modelo contestó vacío y por qué se detuvo, que es lo
    # que distingue "se quedó sin tokens razonando" de "rechazó la petición".
    try:
        eleccion = respuesta['choices'][0]
    except Exception:
        raise RuntimeError('OpenAI no devolvio ninguna respuesta: '
                           + json.dumps(respuesta)[:300])

    contenido = (eleccion.get('message') or {}).get('content') or ''
    razon = eleccion.get('finish_reason', 'desconocida')
    uso = respuesta.get('usage') or {}

    if not contenido.strip():
        raise RuntimeError(
            'El modelo ' + MODELO + ' contesto vacio (motivo: ' + str(razon)
            + ', tokens usados: ' + str(uso.get('completion_tokens', '?'))
            + ' de ' + str(MAX_TOKENS_RESPUESTA) + '). Si el motivo es '
            '"length", suba OPENAI_MAX_TOKENS o use un modelo sin razonamiento.'
        )

    try:
        return json.loads(contenido)
    except Exception as e:
        raise RuntimeError('Respuesta del modelo ilegible (' + str(e)
                           + '): ' + contenido[:200])


def conversar(carga, uid):
    """
    Un turno de la conversación.

    Recibe el mensaje de la persona, el estado de lo que ya se reunió y los
    últimos turnos. Devuelve la siguiente frase y el estado actualizado.
    El navegador es quien decide cuándo crear el pedido, no este módulo.
    """
    if not _pasa_el_freno(uid):
        return {
            'respuesta': 'Vamos muy rápido. Espera un momento y seguimos.',
            'estado': _validar_estado(carga.get('estado')),
            'faltan': [],
            'listo': False,
            'frenado': True,
        }

    mensaje = (carga.get('mensaje') or '').strip()[:MAX_CARACTERES_MENSAJE]
    if not mensaje:
        raise ValueError('Mensaje vacío')

    estado_previo = _validar_estado(carga.get('estado'))

    # El historial se recorta: reenviar toda la charla en cada turno encarece
    # la cuenta sin mejorar las respuestas. El estado ya resume lo importante.
    historial = carga.get('historial') or []
    if not isinstance(historial, list):
        historial = []
    historial = historial[-MAX_TURNOS_HISTORIAL:]

    resumen = json.dumps(estado_previo, ensure_ascii=False)
    mensajes = [
        {'role': 'system', 'content': INSTRUCCIONES},
        {'role': 'system', 'content': 'Datos reunidos hasta ahora: ' + resumen},
    ]
    for turno in historial:
        if not isinstance(turno, dict):
            continue
        texto = (turno.get('texto') or '')[:MAX_CARACTERES_MENSAJE]
        if not texto:
            continue
        papel = 'assistant' if turno.get('rol') == 'agente' else 'user'
        mensajes.append({'role': papel, 'content': texto})
    mensajes.append({'role': 'user', 'content': mensaje})

    salida = _llamar_openai(mensajes)
    estado = _fusionar(estado_previo, _validar_estado(salida))

    faltan = [campo for campo, valor in estado.items() if valor is None]

    # "listo" lo calcula el servidor mirando los datos, nunca el modelo: si lo
    # decidiera el modelo, bastaría con que dijera que ya terminó para que se
    # creara un pedido incompleto.
    return {
        'respuesta': (_texto_limpio(salida.get('respuesta'), 400)
                      or '¿Me lo repites, por favor?'),
        'estado': estado,
        'faltan': faltan,
        'listo': not faltan,
    }
