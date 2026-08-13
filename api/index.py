from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict

# Adaptador para Vercel Serverless
try:
    from mangum import Mangum
except ImportError:
    Mangum = None

app = FastAPI(
    title="UbaVoy API",
    description="Backend Serverless para la plataforma de domicilios y mandados UbaVoy (Ubaté, Cundinamarca)",
    version="3.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos Pydantic
class RechargeRequest(BaseModel):
    driverId: str = Field(..., description="ID o celular del domiciliario")
    driverName: Optional[str] = Field("Domiciliario UbaVoy", description="Nombre del domiciliario")
    amount: float = Field(..., gt=0, description="Monto en COP a recargar")
    paymentRef: Optional[str] = Field(None, description="Número de referencia Nequi")

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
    coordinates: dict
    commissionPerOrderCOP: int
    timestamp: str

class AdminStatsResponse(BaseModel):
    status: str
    total_orders: int
    completed_orders: int
    total_revenue: float
    platform_commissions: float
    orders_by_status: Dict[str, int]
    city: str
    timestamp: str

# Endpoints
@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """Endpoint de diagnóstico de salud del servidor Backend"""
    return HealthResponse(
        status="ok",
        app="UbaVoy API Serverless v3.0",
        city="Ubaté, Cundinamarca",
        coordinates={"lat": 5.3081, "lng": -73.8144},
        commissionPerOrderCOP=500,
        timestamp=datetime.utcnow().isoformat() + "Z"
    )

@app.post("/api/drivers/recharge", response_model=RechargeResponse, status_code=status.HTTP_200_OK)
def recharge_driver_balance(payload: RechargeRequest):
    """Endpoint para recarga de saldo prepago de domiciliarios"""
    if payload.amount < 1000:
        raise HTTPException(
            status_code=400, 
            detail="El monto mínimo de recarga es de $1,000 COP"
        )

    ref = payload.paymentRef or f"UB-NQ-{int(datetime.utcnow().timestamp())}"
    simulated_new_balance = 10000.0 + payload.amount

    return RechargeResponse(
        status="success",
        message=f"Recarga de ${payload.amount:,.0f} COP aprobada exitosamente para {payload.driverName}.",
        driverId=payload.driverId,
        amount=payload.amount,
        newBalanceSimulated=simulated_new_balance,
        reference=ref,
        timestamp=datetime.utcnow().isoformat() + "Z"
    )

@app.get("/api/admin/stats", response_model=AdminStatsResponse)
def get_admin_stats():
    """Endpoint de Estadísticas y Métricas Generales del Dashboard Administrativo de UbaVoy"""
    total_orders = 12
    completed_orders = 8
    total_revenue = 64000.0
    commissions = total_orders * 500.0

    return AdminStatsResponse(
        status="success",
        total_orders=total_orders,
        completed_orders=completed_orders,
        total_revenue=total_revenue,
        platform_commissions=commissions,
        orders_by_status={
            "pending": 2,
            "assigned": 2,
            "completed": 8,
            "cancelled": 0
        },
        city="Ubaté, Cundinamarca",
        timestamp=datetime.utcnow().isoformat() + "Z"
    )

@app.get("/api/info")
def platform_info():
    """Información general sobre UbaVoy"""
    return {
        "platform": "UbaVoy Ubaté",
        "version": "3.0.0",
        "city": "Ubaté, Cundinamarca",
        "centerCoordinates": {"lat": 5.3081, "lng": -73.8144},
        "driverCommissionCOP": 500,
        "nequiNumber": "3100000000",
        "supportWhatsApp": "573100000000",
        "status": "active"
    }

# Handler para Vercel Serverless
handler = Mangum(app) if Mangum else app
