# 🚀 UbaVoy v7.0 - Arquitectura Multiapp (3 PWAs Independientes)

**UbaVoy** es la plataforma exprés de domicilios y mandados para **Ubaté, Cundinamarca**. Esta versión v7.0 reestructura el proyecto en **3 Aplicaciones / Progressive Web Apps (PWAs) independientes** que comparten la misma base de datos en **Firebase Firestore (Proyecto 'ubavoy')** y el backend serverless en **FastAPI**.

![UbaVoy Logo](/public/icon-192.svg)

---

## 📂 Estructura del Repositorio

```
UbaVoy/
├── apps/
│   ├── client/               # PWA Cliente (pedir mandados, direcciones guardadas, mapa, rastreo)
│   │   ├── index.html
│   │   ├── manifest.json
│   │   └── sw.js
│   ├── driver/               # PWA Domiciliario (bolsa de trabajo, saldo, alerta sonora, GPS)
│   │   ├── index.html
│   │   ├── manifest.json
│   │   └── sw.js
│   └── admin/                # Dashboard Administrador (aprobaciones, saldo, métricas)
│       ├── index.html
│       ├── manifest.json
│       └── sw.js
├── shared/
│   └── firebase_config.js    # Credenciales compartidas de Firebase Firestore 'ubavoy'
├── api/
│   └── index.py              # Backend Serverless en FastAPI (Python)
├── public/
│   ├── index.html            # Landing / Portal Selector de Aplicaciones
│   └── icons...
├── vercel.json               # Configuración de enrutamiento independiente en Vercel
├── requirements.txt          # Dependencias de Python
└── README.md                 # Instrucciones de uso y despliegue
```

---

## 📱 Aplicaciones Incluidas

1. **App Cliente (`/apps/client/`)**:
   - PWA enfocado 100% en el usuario cliente.
   - Autenticación rápida por celular WhatsApp.
   - Libreta de direcciones guardadas (`🏠 Casa`, `🏢 Trabajo`, `📍 Otra`).
   - Mapa interactivo Leaflet CartoDB Dark Matter con pin central tipo Uber.
   - Rastreo en vivo de domiciliario asignado e historial con botón **Repetir Mandado en 1-Clic**.

2. **App Domiciliario (`/apps/driver/`)**:
   - PWA para repartidores y conductores de Ubaté.
   - Verificación de aprobación por admin (`is_approved == true`).
   - Bolsa de trabajo en tiempo real con **Alerta Sonora (Web Audio API)**.
   - Botón **Aceptar Carrera (-$500 COP)** y navegación **Google Maps GPS**.
   - Gestión de saldo prepago en COP y recargas por Nequi.

3. **Dashboard Administrador (`/apps/admin/`)**:
   - Aplicación web con puerta de acceso por PIN seguro (PIN por defecto: `1234`).
   - Switch de **Aprobar / Bloquear** domiciliarios en tiempo real.
   - Formulario para **acreditar saldo prepago** a cualquier domiciliario en Firestore.
   - Supervisor general de órdenes y métricas financieras de Ubaté.

---

## ⚡ Ejecución Local

### Servidor Local de Estáticos
Puedes servir el repositorio localmente con cualquier servidor HTTP (ej: Python):
```bash
python -m http.server 3000
```
Accede desde tu navegador a:
- 🌐 **Portal Selector**: `http://localhost:3000/public/`
- 🛍️ **App Cliente**: `http://localhost:3000/apps/client/`
- 🛵 **App Domiciliario**: `http://localhost:3000/apps/driver/`
- 👑 **Dashboard Admin**: `http://localhost:3000/apps/admin/`

---

## 🌐 Despliegue en Vercel

### Opción A: Despliegue Único del Repositorio
El archivo `vercel.json` en la raíz está configurado para servir todas las apps y la API:
- `/` -> Landing / Selector (`/public/index.html`)
- `/apps/client/` -> PWA Cliente
- `/apps/driver/` -> PWA Domiciliario
- `/apps/admin/` -> Dashboard Administrador
- `/api/` -> Backend Serverless Python FastAPI

### Opción B: Despliegue Independiente por Proyecto en Vercel
En el panel de Vercel, puedes crear 3 proyectos diferentes conectados al mismo repositorio de GitHub configurando el **Root Directory** en:
- `apps/client` para la App de Clientes
- `apps/driver` para la App de Domiciliarios
- `apps/admin` para el Dashboard Administrador

---

## 🎨 Herramientas de diseño (skills de Claude Code)

El proyecto usa **UI/UX Pro Max**, un conjunto de *skills* de diseño de código
abierto (licencia MIT) que aporta criterios de tipografía, color, accesibilidad,
jerarquía visual y patrones de interacción al construir o revisar pantallas.

Repositorio: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

**No está dentro de este repositorio a propósito.** Se instala en el equipo, no
en el proyecto, por dos razones: pesa 11 MB de datos de diseño que no tienen que
ver con el negocio de domicilios, y así queda disponible en cualquier otro
proyecto sin reinstalarla.

### Cómo instalarla en un equipo nuevo

```bash
git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git /tmp/uiux
cp -r /tmp/uiux/.claude/skills/* ~/.claude/skills/
```

Skills que instala: `ui-ux-pro-max` (la principal), `design`, `design-system`,
`brand`, `ui-styling`, `banner-design` y `slides`.

> Revisado antes de instalar: licencia MIT, sin `eval`, `exec` ni `os.system`.
> Sus scripts de Python solo se ejecutan si se invocan explícitamente; ninguno
> corre solo. Los que acceden a internet (Pexels, Google Fonts) son opcionales.

---

*UbaVoy Ubaté 2026 - Arquitectura Multiapp PWA*
