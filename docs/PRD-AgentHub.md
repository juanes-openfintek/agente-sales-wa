# PRD: AgentHub - Plataforma de Gestión de Agentes WhatsApp

## 📋 Información del Documento

| Campo | Valor |
|-------|-------|
| **Nombre del Producto** | AgentHub |
| **Versión PRD** | 1.0 |
| **Fecha** | Febrero 2026 |
| **Estado** | Draft |
| **Autor** | [Tu nombre] |

---

## 1. 🎯 Visión del Producto

### 1.1 Declaración de Visión

**AgentHub** es una plataforma SaaS que permite a negocios crear, gestionar y optimizar múltiples agentes de WhatsApp desde un panel de control centralizado. Similar a cómo Shopify democratizó el e-commerce, AgentHub democratiza la automatización de ventas por WhatsApp.

### 1.2 Problema que Resuelve

| Problema Actual | Solución AgentHub |
|----------------|-------------------|
| Cada agente de WhatsApp es un proyecto independiente y aislado | Panel unificado para gestionar N agentes |
| No hay visibilidad del desempeño de los agentes | Dashboard de métricas y KPIs en tiempo real |
| El inventario se maneja manualmente o en sistemas separados | Sistema de inventario integrado con los agentes |
| Difícil escalar a múltiples líneas/negocios | Multi-tenant con aislamiento por negocio |
| Sin historial centralizado de conversaciones | CRM de conversaciones con búsqueda y filtros |
| Configuración técnica compleja | Setup no-code/low-code para nuevos agentes |

### 1.3 Propuesta de Valor

> "Gestiona todos tus agentes de WhatsApp como si fueran tiendas en Shopify: configura, monitorea, optimiza y escala desde un solo lugar."

---

## 2. 👥 Usuarios Objetivo

### 2.1 Personas Principales

#### Persona 1: Dueño de Negocio (Owner)
- **Perfil**: Emprendedor con 1-5 líneas de WhatsApp para ventas
- **Necesidad**: Ver si sus agentes están funcionando bien, cuántas ventas generan
- **Frustración**: No sabe si el bot está perdiendo clientes o respondiendo mal
- **Meta**: Aumentar ventas sin contratar más personal

#### Persona 2: Operador / Community Manager
- **Perfil**: Encargado de revisar conversaciones y aprobar pagos
- **Necesidad**: Dashboard para ver mensajes pendientes, aprobar comprobantes
- **Frustración**: Tiene que revisar WhatsApp manualmente todo el día
- **Meta**: Procesar pedidos rápidamente sin perderse ninguno

#### Persona 3: Administrador de Inventario
- **Perfil**: Encargado de productos y stock
- **Necesidad**: Actualizar precios, disponibilidad, agregar productos
- **Frustración**: Los agentes venden productos que ya no hay
- **Meta**: Mantener catálogo sincronizado en tiempo real

#### Persona 4: Agencia / Reseller (Futuro)
- **Perfil**: Empresa que gestiona agentes para múltiples clientes
- **Necesidad**: Gestionar N negocios desde una cuenta
- **Frustración**: Manejar accesos y facturación por separado
- **Meta**: Escalar su operación de servicios

### 2.2 Casos de Uso Principales

| # | Actor | Caso de Uso |
|---|-------|-------------|
| UC1 | Owner | Ver dashboard con métricas del día/semana/mes |
| UC2 | Owner | Recibir alertas cuando un agente tiene problemas |
| UC3 | Operador | Ver cola de pagos pendientes de verificación |
| UC4 | Operador | Aprobar/rechazar comprobantes de pago |
| UC5 | Operador | Intervenir en conversación (takeover humano) |
| UC6 | Operador | Ver historial completo de un cliente |
| UC7 | Admin Inv. | Agregar/editar/eliminar productos |
| UC8 | Admin Inv. | Actualizar stock y precios |
| UC9 | Admin Inv. | Marcar productos como no disponibles |
| UC10 | Owner | Configurar respuestas y comportamiento del agente |
| UC11 | Owner | Conectar nueva línea de WhatsApp |
| UC12 | Owner | Ver reportes de ventas y conversiones |

---

## 3. 🏗️ Arquitectura de Alto Nivel

### 3.1 Componentes Principales

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENTHUB PLATFORM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Dashboard  │  │  Inventario  │  │  Analytics   │          │
│  │    & CRM     │  │   Manager    │  │   Engine     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Agent     │  │   Payment    │  │  Notification│          │
│  │  Configurator│  │   Gateway    │  │    Center    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      AGENT ORCHESTRATOR                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │ Agent N │               │
│  │ (WA #1) │ │ (WA #2) │ │ (WA #3) │ │ (WA #N) │               │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    WHATSAPP CONNECTIONS                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Evolution API / Baileys / Meta Cloud API / Multi-device│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Modelo de Datos Simplificado

```
Organization (Tenant)
├── Users (roles: owner, operator, inventory_admin)
├── Agents (cada línea de WhatsApp)
│   ├── Configuration (prompts, comportamiento)
│   ├── Conversations
│   │   ├── Messages
│   │   └── Events
│   └── Metrics
├── Catalog
│   ├── Categories
│   ├── Products
│   └── Combos
├── Orders
│   ├── Items
│   └── Payments
├── Customers (leads centralizados)
└── Settings
```

---

## 4. 📱 Módulos Funcionales

### 4.1 Dashboard Principal

**Objetivo**: Vista ejecutiva del estado de todos los agentes

| Métrica | Descripción |
|---------|-------------|
| Conversaciones Activas | Cuántas personas están hablando ahora |
| Mensajes Hoy | Total de mensajes enviados/recibidos |
| Pedidos del Día | Cantidad y monto total |
| Tasa de Conversión | % de conversaciones que terminan en venta |
| Tiempo de Respuesta | Promedio de respuesta del agente |
| Agentes con Problemas | Alertas de agentes desconectados o con errores |

**Widgets**:
- Gráfico de conversaciones por hora
- Mapa de calor de actividad semanal
- Top 5 productos vendidos
- Cola de tareas pendientes (pagos por verificar, etc.)

### 4.2 CRM de Conversaciones

**Objetivo**: Ver y gestionar todas las conversaciones

**Funcionalidades**:
- Lista de conversaciones con filtros (estado, fecha, agente)
- Vista detallada de conversación con timeline
- Búsqueda por teléfono, nombre o contenido
- Etiquetas personalizables (VIP, Problema, Seguimiento)
- Takeover humano: pausar agente e intervenir manualmente
- Notas internas por cliente
- Historial de pedidos del cliente

**Estados de Conversación**:
- 🟢 Activa (cliente interactuando)
- 🟡 Esperando respuesta del cliente
- 🔵 En proceso de pago
- ✅ Completada
- 🔴 Requiere atención humana
- ⚫ Archivada

### 4.3 Gestión de Inventario

**Objetivo**: Control centralizado del catálogo

**Funcionalidades**:

| Función | Descripción |
|---------|-------------|
| CRUD Productos | Crear, editar, eliminar productos |
| CRUD Combos | Gestionar combos y sus items |
| Categorías | Organizar por categorías |
| Precios | Actualizar precios individuales o masivos |
| Disponibilidad | Marcar disponible/no disponible |
| Stock | Control de inventario con alertas de bajo stock |
| Importar/Exportar | CSV, Excel para carga masiva |
| Historial | Log de cambios en productos |

**Sincronización**:
- Cambios reflejados en tiempo real en los agentes
- Webhook para integración con sistemas externos
- API para sincronizar con ERP/POS

### 4.4 Gestión de Pedidos

**Objetivo**: Seguimiento completo del ciclo de pedidos

**Estados del Pedido**:
```
[Pendiente] → [Confirmado] → [Pagado] → [En Preparación] → [Enviado] → [Entregado]
                    ↓
              [Cancelado]
```

**Funcionalidades**:
- Lista de pedidos con filtros
- Detalle de pedido con items, cliente, dirección
- Gestión de pagos múltiples por pedido
- Verificación de comprobantes con imagen
- Impresión de ticket/factura
- Notas y seguimiento interno
- Métricas: ticket promedio, productos más vendidos

### 4.5 Centro de Pagos

**Objetivo**: Gestionar verificación y seguimiento de pagos

**Funcionalidades**:
- Cola de pagos pendientes de verificación
- Visor de comprobantes (imágenes)
- Aprobar/Rechazar con un clic
- Notificación automática al cliente
- Historial de pagos por cliente
- Reconciliación con cuentas bancarias
- Reportes de ingresos

### 4.6 Configurador de Agentes

**Objetivo**: Configurar comportamiento de cada agente sin código

**Secciones**:

| Sección | Configuración |
|---------|---------------|
| **Identidad** | Nombre del agente, personalidad, tono |
| **Horarios** | Horario de atención, mensajes fuera de horario |
| **Catálogo** | Qué productos puede vender este agente |
| **Flujos** | Estados de conversación, transiciones |
| **Respuestas** | Mensajes predefinidos, templates |
| **Pagos** | Métodos de pago aceptados, cuentas bancarias |
| **Envíos** | Zonas de cobertura, costos de envío |
| **Integraciones** | Webhooks, APIs externas |

### 4.7 Analytics y Reportes

**Objetivo**: Insights para optimización

**Reportes Disponibles**:
- Ventas por período (día, semana, mes)
- Rendimiento por agente
- Productos más/menos vendidos
- Horarios de mayor actividad
- Tasa de conversión por fuente
- Clientes recurrentes vs nuevos
- Tiempo promedio de cierre de venta
- Motivos de abandono (si se detectan)

**Exportación**:
- PDF para reportes
- Excel/CSV para datos
- Scheduled reports por email

### 4.8 Centro de Notificaciones

**Objetivo**: Mantener al equipo informado

**Canales**:
- Push notifications en la plataforma
- Email
- WhatsApp (al número del operador)
- Webhook para Slack/Discord

**Eventos Notificables**:
- Nuevo pedido confirmado
- Pago recibido pendiente de verificación
- Agente desconectado
- Stock bajo
- Conversación requiere intervención
- Error en el agente

---

## 5. 🔐 Seguridad y Multi-Tenancy

### 5.1 Modelo de Aislamiento

- Cada **Organization** es un tenant aislado
- Los datos de un tenant nunca son visibles por otro
- Row-Level Security en base de datos
- API keys por organización

### 5.2 Roles y Permisos

| Rol | Dashboard | CRM | Inventario | Pedidos | Pagos | Config | Billing |
|-----|-----------|-----|------------|---------|-------|--------|---------|
| Owner | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| Admin | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Ver | ❌ |
| Operator | ✅ Ver | ✅ Full | ✅ Ver | ✅ Full | ✅ Full | ❌ | ❌ |
| Inventory | ✅ Ver | ❌ | ✅ Full | ✅ Ver | ❌ | ❌ | ❌ |
| Viewer | ✅ Ver | ✅ Ver | ✅ Ver | ✅ Ver | ✅ Ver | ❌ | ❌ |

### 5.3 Autenticación

- Login con email/password
- OAuth (Google, Microsoft)
- 2FA opcional
- Session management
- Audit log de acciones

---

## 6. 💰 Modelo de Monetización

### 6.1 Planes Propuestos

| Plan | Precio/mes | Agentes | Mensajes | Usuarios | Soporte |
|------|------------|---------|----------|----------|---------|
| **Starter** | $29 USD | 1 | 1,000 | 2 | Email |
| **Growth** | $79 USD | 3 | 5,000 | 5 | Chat |
| **Pro** | $199 USD | 10 | 20,000 | 15 | Prioritario |
| **Enterprise** | Custom | Ilimitado | Ilimitado | Ilimitado | Dedicado |

### 6.2 Add-ons

- Mensajes adicionales: $0.01/mensaje después del límite
- Agentes adicionales: $15/agente/mes
- API access: $49/mes
- White-label: $99/mes
- Integraciones premium: Variable

---

## 7. 🛣️ Roadmap

### Fase 1: MVP (3-4 meses)
- [ ] Autenticación y multi-tenancy básico
- [ ] Dashboard con métricas principales
- [ ] CRM de conversaciones (vista y búsqueda)
- [ ] Inventario básico (CRUD productos)
- [ ] Conexión con 1 tipo de WhatsApp API
- [ ] Gestión de pedidos básica

### Fase 2: Core Features (2-3 meses)
- [ ] Configurador de agentes no-code
- [ ] Centro de pagos con verificación
- [ ] Takeover humano en conversaciones
- [ ] Notificaciones multi-canal
- [ ] Combos y categorías en inventario
- [ ] Reportes básicos

### Fase 3: Scale (2-3 meses)
- [ ] Múltiples tipos de conexión WhatsApp
- [ ] Analytics avanzado
- [ ] API pública para integraciones
- [ ] Importación/exportación masiva
- [ ] Roles y permisos granulares
- [ ] Webhooks configurables

### Fase 4: Enterprise (3-4 meses)
- [ ] White-label
- [ ] Multi-organización para agencias
- [ ] SSO/SAML
- [ ] SLA y soporte enterprise
- [ ] Integraciones con ERPs populares
- [ ] Custom AI training por cliente

---

## 8. 📊 Métricas de Éxito

### KPIs del Producto

| Métrica | Target Año 1 |
|---------|--------------|
| Organizaciones activas | 100 |
| Agentes conectados | 300 |
| Mensajes procesados/mes | 500,000 |
| MRR | $15,000 USD |
| Churn mensual | < 5% |
| NPS | > 40 |

### KPIs de Usuarios

- Time to First Value: < 30 min (conectar primer agente)
- Daily Active Users: 60% de usuarios registrados
- Feature Adoption: 70% usa inventario, 80% usa CRM

---

## 9. 🤔 Preguntas Abiertas

1. **¿Qué proveedor de WhatsApp priorizar?**
   - Evolution API (self-hosted)
   - Meta Cloud API (oficial)
   - Baileys (no oficial pero flexible)

2. **¿Self-hosted u cloud-only?**
   - Empezar cloud-only para simplificar
   - Evaluar self-hosted para enterprise

3. **¿Integrar pasarela de pagos?**
   - Solo verificación manual inicial
   - Evaluar integración con PSPs (MercadoPago, etc.)

4. **¿Marketplace de templates/agentes?**
   - Plantillas de agentes por industria
   - Comunidad que comparta configuraciones

5. **¿Mobile app nativa?**
   - PWA responsiva inicial
   - App nativa si hay demanda

---

## 10. 📎 Anexos

### A. Glosario

| Término | Definición |
|---------|------------|
| **Agente** | Una instancia de bot conectada a un número de WhatsApp |
| **Tenant** | Organización/empresa cliente de AgentHub |
| **Takeover** | Cuando un humano toma control de una conversación del bot |
| **Conversión** | Conversación que termina en pedido confirmado |

### B. Competencia

| Competidor | Fortaleza | Debilidad |
|------------|-----------|-----------|
| Zenvia | Enterprise, Brasil | Caro, complejo |
| Twilio | API robusta | No es plataforma, requiere dev |
| ManyChat | Fácil de usar | Limitado para ventas complejas |
| Sirena | Enfocado en WhatsApp | Sin inventario integrado |

### C. Stack Tecnológico Sugerido

- **Frontend**: Next.js + TailwindCSS + shadcn/ui
- **Backend**: Convex (realtime) o Supabase
- **WhatsApp**: Evolution API + Baileys como fallback
- **AI**: OpenAI / Anthropic para agentes
- **Hosting**: Vercel + Railway/Render
- **Analytics**: Mixpanel o PostHog

---

*Este documento es un punto de partida para discusión. Se irá refinando con feedback del equipo y potenciales usuarios.*
