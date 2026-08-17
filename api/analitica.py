"""
UbaVoy - Motor de analitica
=============================================================================
Lee Firestore del lado del servidor con firebase-admin y calcula los
indicadores del negocio.

Por que del lado del servidor y no en el navegador: el panel en JavaScript solo
puede leer lo que las reglas le permiten al administrador conectado, y calcular
sobre miles de documentos en el celular es lento. Aqui se hace con pandas, y el
resultado viaja ya resumido.

Las fechas de la plataforma vienen en dos formatos porque el proyecto crecio
por partes: unas como texto ISO desde las apps y otras como Timestamp de
Firestore desde el sembrado inicial. Todo se normaliza en un solo lugar.
"""

from __future__ import annotations

import os
import json
from datetime import datetime, timedelta, timezone

import pandas as pd

# Comision que UbaVoy cobra por carrera. Debe coincidir con firestore.rules
# y con las apps; si se cambia en un lado y no en otro, los ingresos
# reportados aqui dejan de corresponder con la realidad.
COMISION_POR_CARRERA = 1000

BOGOTA = timezone(timedelta(hours=-5))

_firestore = None


# ---------------------------------------------------------------------------
# Conexion
# ---------------------------------------------------------------------------

def obtener_firestore():
    """
    Devuelve el cliente de Firestore, o None si no hay credenciales.

    La cuenta de servicio es un SECRETO y por eso no vive en el repositorio:
    se inyecta como variable de entorno FIREBASE_SERVICE_ACCOUNT en Vercel.
    Sin ella el panel sigue abriendo, pero avisa que no hay datos.
    """
    global _firestore
    if _firestore is not None:
        return _firestore

    credencial_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '').strip()
    if not credencial_json:
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            datos = json.loads(credencial_json)
            firebase_admin.initialize_app(credentials.Certificate(datos))

        _firestore = firestore.client()
        return _firestore
    except Exception as e:  # pragma: no cover
        print(f'[analitica] No se pudo conectar a Firestore: {e}')
        return None


def verificar_administrador(token_id: str, correo_dueno: str) -> tuple[bool, str]:
    """
    Comprueba contra Firebase que quien pide el panel es el administrador.

    No basta con mirar el correo que manda el navegador: se valida la firma
    del token en el servidor, que es lo unico que no se puede falsificar.
    """
    if not token_id:
        return False, 'Falta la sesion'
    try:
        import firebase_admin
        from firebase_admin import auth, credentials

        if not firebase_admin._apps:
            credencial_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '').strip()
            if not credencial_json:
                return False, 'El servidor no tiene credenciales configuradas'
            firebase_admin.initialize_app(credentials.Certificate(json.loads(credencial_json)))

        datos = auth.verify_id_token(token_id)
        correo = (datos.get('email') or '').lower()
        if correo != correo_dueno.lower():
            return False, f'La cuenta {correo} no es administradora'
        return True, correo
    except Exception as e:
        return False, f'Sesion no valida: {e}'


# ---------------------------------------------------------------------------
# Normalizacion de fechas
# ---------------------------------------------------------------------------

def a_fecha(valor):
    """Convierte texto ISO o Timestamp de Firestore a datetime con zona."""
    if valor is None or valor == '':
        return None
    try:
        if hasattr(valor, 'timestamp'):          # Timestamp de Firestore
            return datetime.fromtimestamp(valor.timestamp(), tz=timezone.utc)
        if isinstance(valor, datetime):
            return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)
        texto = str(valor).replace('Z', '+00:00')
        f = datetime.fromisoformat(texto)
        return f if f.tzinfo else f.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _minutos(desde, hasta):
    a, b = a_fecha(desde), a_fecha(hasta)
    if not a or not b:
        return None
    delta = (b - a).total_seconds() / 60
    # Diferencias absurdas casi siempre son datos sucios de las pruebas.
    return delta if 0 <= delta <= 60 * 24 * 7 else None


# ---------------------------------------------------------------------------
# Carga
# ---------------------------------------------------------------------------

def preparar_pedidos(df: 'pd.DataFrame') -> 'pd.DataFrame':
    """Deja el DataFrame de pedidos con las columnas derivadas que usa el informe."""
    if df.empty:
        return df

    def col(nombre):
        return df[nombre] if nombre in df.columns else pd.Series([None] * len(df), index=df.index)

    df['f_creado'] = col('created_at').map(a_fecha)
    df['f_asignado'] = col('assigned_at').map(a_fecha)
    df['f_entregado'] = col('completed_at').map(a_fecha)

    df['min_espera'] = [_minutos(c, a) for c, a in zip(col('created_at'), col('assigned_at'))]
    df['min_entrega'] = [_minutos(a, e) for a, e in zip(col('assigned_at'), col('completed_at'))]
    df['min_total'] = [_minutos(c, e) for c, e in zip(col('created_at'), col('completed_at'))]

    df['estado'] = col('status').astype(str).str.lower()
    df['valor'] = pd.to_numeric(col('estimated_price'), errors='coerce').fillna(0)
    return df


def datos_desde_navegador(carga: dict):
    """
    Arma los DataFrames con los documentos que envía el panel del
    administrador desde el navegador.

    Existe porque Google bloquea la creación de claves de cuenta de servicio
    en este proyecto, asi que el servidor no puede leer Firestore por su
    cuenta. El navegador SI puede: ya está autenticado como administrador y
    las reglas le permiten listar las colecciones. El servidor solo analiza
    lo que recibe, y verifica aparte que quien envía sea el administrador.
    """
    def tabla(nombre):
        filas = carga.get(nombre) or []
        return pd.DataFrame(filas) if filas else pd.DataFrame()

    pedidos = preparar_pedidos(tabla('orders'))

    return {
        'pedidos': pedidos,
        'usuarios': tabla('users'),
        'recargas': tabla('recharges'),
        'promociones': tabla('promociones'),
    }


def cargar_datos():
    """Trae las colecciones y las deja como DataFrames listos para analizar."""
    db = obtener_firestore()
    if db is None:
        return None

    def leer(nombre):
        filas = []
        for doc in db.collection(nombre).stream():
            d = doc.to_dict() or {}
            d['id'] = doc.id
            filas.append(d)
        return pd.DataFrame(filas)

    pedidos = leer('orders')
    usuarios = leer('users')
    recargas = leer('recharges')
    promos = leer('promociones')

    if not pedidos.empty:
        pedidos['f_creado'] = pedidos.get('created_at').map(a_fecha) if 'created_at' in pedidos else None
        pedidos['f_asignado'] = pedidos['assigned_at'].map(a_fecha) if 'assigned_at' in pedidos else None
        pedidos['f_entregado'] = pedidos['completed_at'].map(a_fecha) if 'completed_at' in pedidos else None

        pedidos['min_espera'] = [
            _minutos(c, a) for c, a in zip(
                pedidos.get('created_at', pd.Series([None] * len(pedidos))),
                pedidos.get('assigned_at', pd.Series([None] * len(pedidos))))
        ]
        pedidos['min_entrega'] = [
            _minutos(a, e) for a, e in zip(
                pedidos.get('assigned_at', pd.Series([None] * len(pedidos))),
                pedidos.get('completed_at', pd.Series([None] * len(pedidos))))
        ]
        pedidos['min_total'] = [
            _minutos(c, e) for c, e in zip(
                pedidos.get('created_at', pd.Series([None] * len(pedidos))),
                pedidos.get('completed_at', pd.Series([None] * len(pedidos))))
        ]
        pedidos['estado'] = pedidos.get('status', pd.Series(['?'] * len(pedidos))).astype(str).str.lower()
        pedidos['valor'] = pd.to_numeric(pedidos.get('estimated_price', 0), errors='coerce').fillna(0)

    return {
        'pedidos': pedidos,
        'usuarios': usuarios,
        'recargas': recargas,
        'promociones': promos,
    }


# ---------------------------------------------------------------------------
# Indicadores
# ---------------------------------------------------------------------------

def _p(serie, percentil):
    s = pd.Series([x for x in serie if x is not None and pd.notna(x)])
    return round(float(s.quantile(percentil)), 1) if len(s) else None


def calcular(datos):
    """Resume todo el negocio en un diccionario de indicadores."""
    pedidos = datos['pedidos']
    usuarios = datos['usuarios']
    recargas = datos['recargas']
    promos = datos['promociones']

    r = {'hay_datos': not pedidos.empty}
    if pedidos.empty:
        return r

    entregados = pedidos[pedidos['estado'].isin(['completed', 'delivered'])]
    cancelados = pedidos[pedidos['estado'] == 'cancelled']
    pendientes = pedidos[pedidos['estado'] == 'pending']

    # --- Operacion ---
    r['total_pedidos'] = int(len(pedidos))
    r['entregados'] = int(len(entregados))
    r['cancelados'] = int(len(cancelados))
    r['pendientes'] = int(len(pendientes))
    r['tasa_exito'] = round(len(entregados) / len(pedidos) * 100, 1) if len(pedidos) else 0

    # --- Dinero ---
    r['gmv'] = int(entregados['valor'].sum())
    r['ticket_promedio'] = int(entregados['valor'].mean()) if len(entregados) else 0
    r['comisiones'] = int(len(entregados) * COMISION_POR_CARRERA)

    # --- Tiempos: lo que de verdad mide la calidad del servicio ---
    r['espera_mediana'] = _p(pedidos['min_espera'], 0.5)
    r['espera_p90'] = _p(pedidos['min_espera'], 0.9)
    r['entrega_mediana'] = _p(pedidos['min_entrega'], 0.5)
    r['entrega_p90'] = _p(pedidos['min_entrega'], 0.9)
    r['total_mediana'] = _p(pedidos['min_total'], 0.5)

    # --- Clientes ---
    if 'client_uid' in pedidos:
        por_cliente = pedidos.groupby('client_uid').size()
        r['clientes_unicos'] = int(len(por_cliente))
        r['clientes_recurrentes'] = int((por_cliente > 1).sum())
        r['tasa_recompra'] = round((por_cliente > 1).sum() / len(por_cliente) * 100, 1) if len(por_cliente) else 0
        r['pedidos_por_cliente'] = round(float(por_cliente.mean()), 2) if len(por_cliente) else 0
    else:
        r['clientes_unicos'] = r['clientes_recurrentes'] = 0
        r['tasa_recompra'] = r['pedidos_por_cliente'] = 0

    # --- Domiciliarios ---
    if not usuarios.empty and 'role' in usuarios:
        conductores = usuarios[usuarios['role'] == 'driver']
        r['domiciliarios'] = int(len(conductores))
        r['saldo_circulante'] = int(pd.to_numeric(conductores.get('balance', 0), errors='coerce').fillna(0).sum())
    else:
        r['domiciliarios'] = 0
        r['saldo_circulante'] = 0

    if 'assigned_driver_id' in entregados and len(entregados):
        ranking = (entregados.groupby('assigned_driver_id')
                   .agg(entregas=('id', 'count'),
                        recaudado=('valor', 'sum'),
                        minutos=('min_entrega', 'mean'))
                   .sort_values('entregas', ascending=False))
        nombres = {}
        if 'driver_name' in entregados:
            nombres = entregados.groupby('assigned_driver_id')['driver_name'].last().to_dict()
        r['ranking'] = [
            {
                'nombre': str(nombres.get(uid, uid))[:24],
                'entregas': int(fila.entregas),
                'recaudado': int(fila.recaudado),
                'minutos': round(float(fila.minutos), 1) if pd.notna(fila.minutos) else None,
            }
            for uid, fila in ranking.head(10).iterrows()
        ]
        r['domiciliarios_activos'] = int(len(ranking))
    else:
        r['ranking'] = []
        r['domiciliarios_activos'] = 0

    # --- Recargas ---
    if not recargas.empty and 'status' in recargas:
        aprobadas = recargas[recargas['status'] == 'approved']
        montos = pd.to_numeric(aprobadas.get('amount', 0), errors='coerce').fillna(0)
        r['recargas_aprobadas'] = int(len(aprobadas))
        r['ingresos_recargas'] = int(montos.sum())
        r['recargas_pendientes'] = int((recargas['status'] == 'pending').sum())
    else:
        r['recargas_aprobadas'] = r['ingresos_recargas'] = r['recargas_pendientes'] = 0

    # --- Promociones ---
    if not promos.empty:
        usados = promos['usado_por'].notna().sum() if 'usado_por' in promos else 0
        r['promos_creados'] = int(len(promos))
        r['promos_canjeados'] = int(usados)
    else:
        r['promos_creados'] = r['promos_canjeados'] = 0

    # --- Actividad reciente ---
    fechas = [f for f in pedidos['f_creado'] if f is not None]
    if fechas:
        ahora = datetime.now(timezone.utc)
        r['pedidos_7d'] = sum(1 for f in fechas if (ahora - f).days < 7)
        r['pedidos_30d'] = sum(1 for f in fechas if (ahora - f).days < 30)
        r['primer_pedido'] = min(fechas).astimezone(BOGOTA).strftime('%d/%m/%Y')
        r['ultimo_pedido'] = max(fechas).astimezone(BOGOTA).strftime('%d/%m/%Y %H:%M')
        dias_operando = max(1, (max(fechas) - min(fechas)).days + 1)
        r['dias_operando'] = dias_operando
        r['pedidos_por_dia'] = round(len(pedidos) / dias_operando, 2)
    else:
        r['pedidos_7d'] = r['pedidos_30d'] = 0
        r['primer_pedido'] = r['ultimo_pedido'] = '—'
        r['dias_operando'] = 0
        r['pedidos_por_dia'] = 0

    return r


def series_temporales(pedidos):
    """Prepara las series que alimentan las graficas."""
    if pedidos.empty:
        return {}

    df = pedidos[pedidos['f_creado'].notna()].copy()
    if df.empty:
        return {}

    df['local'] = df['f_creado'].map(lambda f: f.astimezone(BOGOTA))
    df['dia'] = df['local'].map(lambda f: f.date())
    df['hora'] = df['local'].map(lambda f: f.hour)
    df['dia_semana'] = df['local'].map(lambda f: f.weekday())

    por_dia = df.groupby('dia').size().reset_index(name='pedidos')
    por_hora = df.groupby('hora').size().reindex(range(24), fill_value=0)

    mapa = df.groupby(['dia_semana', 'hora']).size().unstack(fill_value=0)
    mapa = mapa.reindex(index=range(7), columns=range(24), fill_value=0)

    coords = []
    if 'delivery_coords' in df:
        for c in df['delivery_coords']:
            if isinstance(c, dict) and isinstance(c.get('lat'), (int, float)):
                coords.append((float(c['lat']), float(c['lng'])))

    return {
        'por_dia': por_dia,
        'por_hora': por_hora,
        'mapa_calor': mapa,
        'coords': coords,
        'espera': [x for x in df['min_espera'] if x is not None and pd.notna(x)],
        'entrega': [x for x in df['min_entrega'] if x is not None and pd.notna(x)],
    }
