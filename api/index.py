from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
import os

# Adaptador para Vercel Serverless
try:
    from mangum import Mangum
except ImportError:
    Mangum = None

app = FastAPI(
    title="UbaVoy API",
    description="Backend Serverless para la plataforma de domicilios y mandados UbaVoy (Ubaté, Cundinamarca)",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# Configuración de CORS para permitir solicitudes del Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos Pydantic
class RechargeRequest(BaseModel):
    driverId: str = Field(..., description="ID o teléfono del domiciliario")
    driverName: Optional[str] = Field("Domiciliario UbaVoy", description="Nombre del domiciliario")
    amount: float = Field(..., gt=0, description="Monto en COP a recargar (ej. 5000, 10000)")
    paymentRef: Optional[str] = Field(None, description="Número de referencia Nequi/Daviplata")

class RechargeResponse(BaseModel):
    status: str
    message: str
    driverId: str
    amount: float
    newBalanceSimulated: float
    reference: str
    timestamp: str

class HealthResponse(BaseModel):
    status: str
    app: str
    city: str
    commissionPerOrderCOP: int
    timestamp: str

# Endpoints
@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """Endpoint de diagnóstico de salud del servidor Backend"""
    return HealthResponse(
        status="ok",
        app="UbaVoy API Serverless",
        city="Ubaté, Cundinamarca",
        commissionPerOrderCOP=500,
        timestamp=datetime.utcnow().isoformat() + "Z"
    )

@app.post("/api/drivers/recharge", response_model=RechargeResponse, status_code=status.HTTP_200_OK)
def recharge_driver_balance(payload: RechargeRequest):
    """
    Endpoint para gestionar la recarga de saldo de un domiciliario.
    En UbaVoy, cada carrera aceptada descuenta $500 COP del saldo del domiciliario.
    """
    if payload.amount < 1000:
        raise HTTPException(
            status_code=400, 
            detail="El monto mínimo de recarga es de $1,000 COP"
        )

    ref = payload.paymentRef or f"UB-NQ-{int(datetime.utcnow().timestamp())}"
    # Simulación de cálculo de saldo acumulado (o integración directa con base de datos)
    simulated_new_balance = 10000.0 + payload.amount  # Saldo base sugerido + recarga

    return RechargeResponse(
        status="success",
        message=f"Recarga de ${payload.amount:,.0f} COP aprobada exitosamente para {payload.driverName}.",
        driverId=payload.driverId,
        amount=payload.amount,
        newBalanceSimulated=simulated_new_balance,
        reference=ref,
        timestamp=datetime.utcnow().isoformat() + "Z"
    )

@app.get("/api/info")
def platform_info():
    """Información general sobre tarifas y comisiones de UbaVoy"""
    return {
        "platform": "UbaVoy Ubaté",
        "version": "1.0.0",
        "description": "Plataforma exprés de domicilios y mandados para Ubaté, Cundinamarca",
        "driverCommissionCOP": 500,
        "nequiNumber": "3100000000",
        "supportWhatsApp": "573100000000",
        "status": "active"
    }

# Handler para Vercel Serverless
handler = Mangum(app) if Mangum else app
