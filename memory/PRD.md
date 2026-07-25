# Mi Economía - PRD (Product Requirements Document)

## Overview
App móvil de finanzas personales en pesos argentinos (ARS), estilo Lemon Cash (dark theme + lima).

## Autenticación
- **Emergent-managed Google OAuth** (auth.emergentagent.com)
- Solo perfil básico (nombre, email, foto)
- La app NO maneja contraseñas propias
- Token JWT válido 7 días, refrescable con re-login
- Storage seguro: `expo-secure-store` en mobile, `localStorage` en web

## Datos y Seguridad
Datos asociados a la cuenta Google:
- `user_id` (interno, generado con `user_{uuid[:12]}`)
- `email`, `name`, `picture` (perfil Google)
- Todas las transacciones, categorías, presupuestos e inversiones del usuario

**Cifrado en reposo (at rest):**
- Todos los campos financieros sensibles (montos, descripciones, cantidades, precios) están cifrados con **AES-256 vía Fernet (cryptography)** antes de guardarse en MongoDB.
- ENCRYPTION_KEY se almacena solo en backend/.env (nunca expuesta al cliente).
- Un ataque a la base de datos NO puede leer los montos sin la clave.

**Almacenamiento:**
- MongoDB en la nube (Emergent-managed)
- Backup automático mediante sincronización de datos ligados a `user_id`
- Al login desde otro dispositivo, todos los datos se restauran automáticamente
- Exportación manual `.emgbak` también cifrada con Fernet

## Funcionalidades Core

### Dashboard (Inicio)
- Balance del período (ingresos - gastos)
- Selector de mes flotante (historial de meses)
- Resumen de ingresos, gastos, ahorros, inversiones
- Gráfico donut de gastos por categoría
- Botón acceso rápido a Configuración

### Movimientos (Transacciones)
- CRUD completo (crear, editar, eliminar)
- 3 tipos: Gasto, Ingreso, Ahorro
- **Selector de fecha** (default hoy, se puede modificar)
- Selector de categoría con chips scrollables
- Descripción opcional
- Toast automático de alerta cuando se alcanza el umbral del presupuesto

### Inversiones
- CRUD para crypto, acciones, otros
- Cálculo automático de ganancia/pérdida por inversión y total portfolio
- **Búsqueda de criptos en CoinGecko** con precios en ARS
- **Sync manual** de precios crypto en tiempo real (botón refresh)
- Auto-fill precio actual al seleccionar crypto

### Presupuestos
- Presupuesto mensual por categoría de gasto
- Umbral de alerta configurable (default 80%)
- **BUG FIX**: current_spent se actualiza automáticamente al crear/editar/eliminar transacciones
- Barra de progreso con código de colores
- Sección de alertas activas

### Reportes
- Gráfico de línea: tendencia de balance últimos 6 meses
- Gráfico de barras: top 5 gastos por categoría
- Estadísticas: promedios, mejor mes
- **Exportar a PDF** + compartir (expo-print + expo-sharing)

### Configuración
- Perfil del usuario (Google)
- Badge de seguridad "Datos cifrados en la nube"
- Gestión de categorías (link)
- Exportar backup cifrado
- Cerrar sesión con confirmación

### Categorías
- 13 categorías predefinidas al crear cuenta (9 gastos + 4 ingresos)
- CRUD para categorías personalizadas
- Selector de icono (20 iconos) y color (10 colores)
- Categorías predefinidas: editables pero no eliminables

## Tecnologías
- **Frontend**: Expo SDK 54, Expo Router, React Native 0.81, TypeScript
- **Charts**: react-native-gifted-charts (PieChart, LineChart, BarChart)
- **Backend**: FastAPI, Motor (async MongoDB), Pydantic v2
- **Storage**: MongoDB
- **Auth**: Emergent-managed Google OAuth (WebBrowser + Linking)
- **Encryption**: cryptography.fernet (AES-128 CBC + HMAC)
- **External APIs**: CoinGecko (público, sin API key)
- **PDF**: expo-print + expo-sharing
- **State**: Zustand + React Context (auth)

## Endpoints Backend (todos requieren Auth Bearer)
- `/api/auth/session` (POST) — intercambia session_id por session_token
- `/api/auth/me` (GET) — perfil usuario
- `/api/auth/logout` (POST)
- `/api/categories` (GET/POST/PUT/DELETE)
- `/api/transactions` (GET/POST/PUT/DELETE) — con filtro `?month=YYYY-MM`
- `/api/budgets` (GET/POST/PUT/DELETE), `/budgets/alerts`
- `/api/investments` (CRUD), `/investments/total`
- `/api/crypto/search`, `/crypto/price/{id}`, `/crypto/sync-prices`
- `/api/analytics/dashboard`, `/expenses-by-category`, `/trends`, `/available-months`
- `/api/backup/export` — retorna blob cifrado con Fernet

## Testing
- **Backend**: 21/21 tests pasados
- Cifrado at-rest verificado en MongoDB
- Bug fix del presupuesto verificado end-to-end
- Aislamiento entre usuarios verificado
