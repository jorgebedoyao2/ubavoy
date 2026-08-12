# 🚀 UbaVoy - Plataforma Exprés de Domicilios y Mandados

**UbaVoy** es una Progressive Web App (PWA) de alto rendimiento, ultraligera y con diseño *Mobile-First* diseñada especialmente para la gestión de domicilios y mandados exprés en la ciudad de **Ubaté, Cundinamarca**.

![UbaVoy Logo](/public/icon-192.svg)

---

## 🌟 Características Principales

1. **Interfaz Móvil PWA Instalable**:
   - Diseño moderno con paleta Verde Esmeralda y Dorado Ámbar, animaciones fluidas, modo oscuro y soporte offline con *Service Worker*.
   - **Switch de Rol en tiempo real**: alterna instantáneamente entre la vista de **"Pedir Mandado"** (Cliente) y **"Soy Domiciliario"** (Repartidor).

2. **Módulo Cliente ("Pedir Mandado")**:
   - Formulario directo para especificar la descripción del pedido, Punto A (Origen), Punto B (Destino), Celular WhatsApp y Pago Estimado (COP).
   - **Rastreo en Vivo**: Barra de progreso y tarjeta interactiva que se actualiza en tiempo real cuando un domiciliario acepta la carrera, con enlace directo para chatear por WhatsApp con el domiciliario asignado.

3. **Módulo Domiciliario ("Soy Domiciliario")**:
   - **Gestión de Saldo**: Muestra el Saldo Disponible en COP y modal interactivo para recargas vía Nequi/WhatsApp o API REST.
   - **Feed de Carreras Disponibles**: Conexión en tiempo real (*onSnapshot*) con Firebase Firestore para listar pedidos con estado `pending`.
   - **Lógica de Aceptación y Comisión**: Valida saldo disponible (mínimo $500 COP), descuenta automáticamente $500 COP de comisión por carrera y abre el chat directo de WhatsApp con el cliente.

4. **Backend Serverless en FastAPI**:
   - API REST optimizada para **Vercel Serverless Functions**.
   - Endpoints de salud (`/api/health`), información (`/api/info`) y recargas de domiciliarios (`/api/drivers/recharge`).

---

## 📂 Estructura del Proyecto

```
UbaVoy/
├── public/
│   ├── index.html            # Frontend PWA (Tailwind CSS CDN + FontAwesome + JS logic)
│   ├── manifest.json         # Web App Manifest PWA
│   ├── sw.js                 # Service Worker (Cache offline & PWA install)
│   ├── icon-192.svg          # Icono PWA (192x192)
│   └── icon-512.svg          # Icono PWA (512x512)
├── api/
│   └── index.py              # Backend Serverless en FastAPI (Python)
├── firebase_config.js        # Configuración modular de Firebase Firestore
├── vercel.json               # Enrutamiento para Vercel Serverless + Frontend Estático
├── requirements.txt          # Dependencias de Python (FastAPI, Uvicorn, Mangum)
├── .gitignore                # Ignorados de Git para Python y Vercel
└── README.md                 # Instrucciones de uso y despliegue
```

---

## ⚡ Instalación y Ejecución Local

### Prerrequisitos
- **Python 3.9+**
- Navegador Web moderno (Chrome, Edge, Safari, Firefox)

### 1. Clonar o acceder al repositorio e iniciar Git
```bash
cd UbaVoy
git init
```

### 2. Configurar entorno virtual de Python e instalar dependencias
En Windows (PowerShell):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate
pip install -r requirements.txt
```

En Linux / macOS:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Probar la API de FastAPI localmente
```bash
uvicorn api.index:app --reload --port 8000
```
Visita la documentación interactiva OpenAPI/Swagger en:
👉 `http://127.0.0.1:8000/api/docs`

### 4. Probar el Frontend PWA localmente
Puedes abrir directamente el archivo `public/index.html` en tu navegador o usar un servidor HTTP local de Python:
```bash
python -m http.server 3000 --directory public
```
Abre en tu navegador:
👉 `http://localhost:3000`

> 💡 **Nota sobre Firestore:** El proyecto incluye un **Modo Demo Local** (*LocalStorage Fallback*) que permite probar toda la experiencia (publicar mandados, aceptar carreras, descontar saldo y simular recargas) de inmediato sin necesidad de llaves de Firebase.

---

## 🔥 Conexión a tu Proyecto de Firebase Firestore

Para conectar el proyecto a tu base de datos de producción en Firebase:

1. Ve a la [Consola de Firebase](https://console.firebase.google.com/) y crea un proyecto llamado `ubavoy`.
2. Crea una base de datos **Firestore Database** en modo de prueba o producción.
3. Agrega una aplicación Web a tu proyecto Firebase y copia el objeto de configuración.
4. Abre el archivo `firebase_config.js` y reemplaza el objeto `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY_REAL",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

---

## 🌐 Despliegue en Vercel

El archivo `vercel.json` ya se encuentra preconfigurado para compilar la API de FastAPI en la ruta `/api` y servir los archivos estáticos de `/public` en la raíz `/`.

### Opción A: Despliegue mediante Vercel CLI
```bash
npm install -g vercel
vercel
```

### Opción B: Despliegue desde GitHub
1. Sube tu código a GitHub:
   ```bash
   git add .
   git commit -m "Inicializar proyecto UbaVoy PWA + FastAPI"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/ubavoy.git
   git push -u origin main
   ```
2. Importa el repositorio desde el panel de [Vercel](https://vercel.com/new).
3. Vercel detectará automáticamente la función Python en `api/index.py` y los archivos estáticos. ¡Haz clic en **Deploy**!

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**: HTML5 Semantic, JavaScript Vanilla (ES6+), Tailwind CSS (CDN), FontAwesome 6, Google Fonts (Outfit / Inter).
- **PWA**: Web App Manifest v2, Service Worker (offline-first caching strategy).
- **Base de Datos en Tiempo Real**: Firebase Firestore Client SDK.
- **Backend Serverless**: Python 3.9+, FastAPI, Pydantic, Mangum ASGI Adapter.
- **Hosting / Cloud**: Vercel Serverless Functions.

---

*Desarrollado para Ubaté, Cundinamarca - UbaVoy Exprés 2026*
