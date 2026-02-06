# WhatsApp Service - Baileys + Convex

Servicio de conexión directa con WhatsApp usando [Baileys](https://github.com/WhiskeySockets/Baileys), integrado con Convex para el state machine y Gemini para IA.

## Arquitectura

```
WhatsApp ←→ Baileys ←→ Convex State Machine ←→ Gemini AI
                              ↓
                         Base de Datos
```

**Sin intermediarios. Sin Evolution API. Sin backend Python.**

## Requisitos

- Node.js 18+
- Cuenta de Convex
- API Key de Gemini (opcional, para respuestas inteligentes)

## Instalación

```bash
cd whatsapp-service
npm install
```

## Configuración

### 1. Variables de entorno locales

```bash
cp .env.example .env
```

Edita `.env`:
```env
PORT=3001
CONVEX_URL=https://tu-deployment.convex.cloud
DEV_MODE=true
```

### 2. Variables de entorno en Convex

```bash
# Configurar API key de Gemini (opcional pero recomendado)
npx convex env set GEMINI_API_KEY tu_api_key_de_gemini
```

### 3. Desplegar Convex

```bash
npx convex deploy
```

## Uso

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm run build
npm start
```

## Flujo de Mensajes

1. **Usuario envía mensaje** → WhatsApp
2. **Baileys recibe** → Extrae phone, text, imagen
3. **Llama a Convex** → `POST /webhook/message`
4. **State Machine procesa**:
   - Determina estado actual del lead
   - Si está en BROWSING, llama a Gemini AI
   - Genera respuesta apropiada
   - Guarda eventos en la base de datos
5. **Baileys envía respuesta** → WhatsApp

## Estados de Conversación

| Estado | Descripción |
|--------|-------------|
| `collecting_info` | Recolectando nombre del cliente |
| `browsing` | Navegando catálogo (usa Gemini AI) |
| `collecting_delivery_info` | Pidiendo ciudad, dirección, email |
| `confirming_order` | Confirmando pedido |
| `collecting_cedula` | Pidiendo cédula para factura |
| `payment_method` | Seleccionando método de pago |
| `waiting_transfer_proof` | Esperando comprobante |
| `payment_completed` | Pedido completado |

## Endpoints API

### Página Web
- `GET /` - Página con QR y estado de conexión

### API REST

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/status` | Estado de conexión |
| `GET` | `/api/qr` | QR en texto |
| `GET` | `/api/qr/image` | QR como imagen PNG |
| `POST` | `/api/send/text` | Enviar mensaje |
| `POST` | `/api/send/image` | Enviar imagen |
| `POST` | `/api/presence` | Enviar "escribiendo..." |
| `POST` | `/api/logout` | Cerrar sesión |
| `GET` | `/api/health` | Health check |

## Estructura del Proyecto

```
agente-sales-wa/
├── whatsapp-service/          # Servicio Baileys
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── config.ts          # Configuración
│   │   ├── baileys.ts         # Conexión WhatsApp
│   │   ├── server.ts          # Servidor Express
│   │   └── convex-client.ts   # Cliente HTTP Convex
│   └── auth_info/             # Sesión (no git)
│
└── convex/                    # Backend Convex
    ├── lib/
    │   ├── types.ts           # Estados, constantes
    │   ├── validation.ts      # Validaciones
    │   ├── messages.ts        # Templates
    │   └── ai.ts              # Gemini AI
    ├── conversation/
    │   └── handleMessage.ts   # State machine
    ├── schema.ts              # Base de datos
    └── http.ts                # Endpoints
```

## Notas Importantes

- La sesión se guarda en `auth_info/`. **NO la subas a git.**
- Si necesitas reconectar, elimina `auth_info/` o usa `/api/logout`.
- El QR se regenera automáticamente.
- Gemini AI es opcional - sin él, el bot usa respuestas básicas.
