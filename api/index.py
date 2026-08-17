"""
UbaVoy - Backend serverless
=============================================================================
Sirve el informe de operación en Python, leyendo Firestore desde el servidor.

Cambio importante frente a la versión anterior: los endpoints devolvían
números fijos escritos a mano (12 pedidos, saldo simulado) que nadie usaba y
que daban una falsa sensación de tener métricas. Ahora todo sale de datos
reales o dice claramente que no hay datos.
"""

from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

try:
    from mangum import Mangum
except ImportError:
    Mangum = None

# Correo del dueño de la plataforma. Debe coincidir con firestore.rules.
CORREO_ADMIN = 'devsites02@gmail.com'

app = FastAPI(
    title="UbaVoy API",
    description="Backend serverless de UbaVoy (Ubaté, Cundinamarca)",
    version="4.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# El informe se abre desde el panel de administración, que vive en el mismo
# dominio. No se permite cualquier origen: este backend expone datos del
# negocio, y antes estaba abierto a todo internet con credenciales activadas.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ubavoy.vercel.app",
        "http://localhost:3900",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _token_de(cabecera: str | None) -> str:
    if not cabecera:
        return ''
    return cabecera[7:].strip() if cabecera.lower().startswith('bearer ') else cabecera.strip()


@app.get("/api/health")
def salud():
    """Diagnóstico rápido del backend."""
    from api import analitica  # import perezoso: acelera el arranque en frío
    return {
        "estado": "ok",
        "servicio": "UbaVoy API v4",
        "ciudad": "Ubaté, Cundinamarca",
        "comision_por_carrera": analitica.COMISION_POR_CARRERA,
        "base_de_datos": "conectada" if analitica.obtener_firestore() else "sin credenciales",
        "momento": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/dashboard", response_class=HTMLResponse)
def dashboard(authorization: str | None = Header(default=None)):
    """
    Informe completo de la operación, en HTML.

    Requiere la sesión de Google del administrador: el token se verifica
    contra Firebase en el servidor, no basta con decir que se es admin.
    """
    from api import analitica, graficas, panel

    if analitica.obtener_firestore() is None:
        return HTMLResponse(panel.sin_credenciales(), status_code=200)

    ok, detalle = analitica.verificar_administrador(_token_de(authorization), CORREO_ADMIN)
    if not ok:
        raise HTTPException(status_code=401, detail=detalle)

    datos = analitica.cargar_datos()
    if datos is None or datos['pedidos'].empty:
        return HTMLResponse(panel.sin_datos(), status_code=200)

    indicadores = analitica.calcular(datos)
    series = analitica.series_temporales(datos['pedidos'])

    figuras = {
        'dia': graficas.pedidos_por_dia(series),
        'hora': graficas.pedidos_por_hora(series),
        'calor': graficas.mapa_calor(series),
        'tiempos': graficas.tiempos(series),
        'mapa': graficas.mapa_entregas(series),
        'embudo': graficas.embudo(indicadores),
        'ranking': graficas.ranking_domiciliarios(indicadores),
    }

    return HTMLResponse(panel.construir(indicadores, figuras))


@app.post("/api/informe", response_class=HTMLResponse)
async def informe_desde_navegador(
    carga: dict,
    authorization: str | None = Header(default=None),
):
    """
    Arma el informe con los datos que envía el panel del administrador.

    Por qué existe esta ruta ademas de /api/dashboard: Google bloquea la
    creación de claves de cuenta de servicio en este proyecto (política de
    organización), así que el servidor no puede leer Firestore por su cuenta.
    El navegador del administrador sí puede, porque ya tiene sesión y las
    reglas le permiten listar las colecciones.

    La sesión se verifica igual: se comprueba la firma del token contra las
    llaves públicas de Google, que no requiere ningún secreto. Sin eso, este
    endpoint quedaría abierto a que cualquiera lo use como servidor de cálculo.
    """
    from api import analitica, graficas, panel, identidad

    autorizado, detalle = identidad.verificar(_token_de(authorization), CORREO_ADMIN)
    if not autorizado:
        raise HTTPException(status_code=401, detail=detalle)

    datos = analitica.datos_desde_navegador(carga)
    if datos['pedidos'].empty:
        return HTMLResponse(panel.sin_datos(), status_code=200)

    indicadores = analitica.calcular(datos)
    series = analitica.series_temporales(datos['pedidos'])

    figuras = {
        'dia': graficas.pedidos_por_dia(series),
        'hora': graficas.pedidos_por_hora(series),
        'calor': graficas.mapa_calor(series),
        'tiempos': graficas.tiempos(series),
        'mapa': graficas.mapa_entregas(series),
        'embudo': graficas.embudo(indicadores),
        'ranking': graficas.ranking_domiciliarios(indicadores),
    }

    return HTMLResponse(panel.construir(indicadores, figuras))


@app.get("/api/metricas")
def metricas(authorization: str | None = Header(default=None)):
    """Los mismos indicadores en JSON, para hojas de cálculo o presentaciones."""
    from api import analitica

    if analitica.obtener_firestore() is None:
        return JSONResponse({"error": "El servidor no tiene credenciales configuradas"}, status_code=503)

    ok, detalle = analitica.verificar_administrador(_token_de(authorization), CORREO_ADMIN)
    if not ok:
        raise HTTPException(status_code=401, detail=detalle)

    datos = analitica.cargar_datos()
    if datos is None:
        return JSONResponse({"error": "No se pudo leer la base de datos"}, status_code=500)

    return analitica.calcular(datos)


@app.get("/api/info")
def info():
    from api import analitica
    return {
        "plataforma": "UbaVoy Ubaté",
        "version": "4.0.0",
        "ciudad": "Ubaté, Cundinamarca",
        "centro": {"lat": 5.3081, "lng": -73.8144},
        "comision_por_carrera": analitica.COMISION_POR_CARRERA,
        "estado": "activo",
    }


handler = Mangum(app) if Mangum else app
