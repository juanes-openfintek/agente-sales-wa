import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================================
  // LEADS (Clientes)
  // ============================================================
  leads: defineTable({
    phone: v.string(), // Teléfono del cliente (identificador principal)
    name: v.optional(v.string()),
    contactPhone: v.optional(v.string()), // Puede diferir del phone principal
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    age: v.optional(v.number()),
    cedula: v.optional(v.string()), // ID colombiano
    city: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    status: v.string(), // Estado de conversación (ConversationState)
    paymentMethod: v.optional(v.string()),
    // Campos de pedido (legacy, para compatibilidad)
    orderItems: v.optional(v.string()), // JSON string
    orderTotal: v.optional(v.number()),
    // Información de pago adicional (jsonb en Supabase)
    paymentInfo: v.optional(v.any()), // JSON object
    // Último mensaje del cliente
    lastMessage: v.optional(v.string()),
    // Timestamps para tracking de inactividad
    lastCustomerMessageAt: v.optional(v.number()), // Timestamp ms
    reminderSentAt: v.optional(v.number()), // Timestamp ms
    // Preferencia de notificación
    notifyPreference: v.optional(v.string()),
    // Referencia al pedido activo actual
    currentOrderId: v.optional(v.id("orders")),
    // Contador de pedidos totales
    totalOrders: v.optional(v.number()),
    // Flag para evitar respuestas repetitivas en estado completado
    completedMessageSent: v.optional(v.boolean()),
    // Timestamps
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_phone", ["phone"])
    .index("by_status", ["status"]),

  // ============================================================
  // ADDRESSES (Direcciones del cliente)
  // ============================================================
  addresses: defineTable({
    phone: v.string(), // Referencia al lead
    label: v.optional(v.string()), // "Casa", "Trabajo", "Oficina", etc.
    address: v.string(), // Dirección completa
    city: v.optional(v.string()), // Ciudad
    reference: v.optional(v.string()), // Referencia o indicaciones adicionales
    isPrimary: v.boolean(), // Si es la dirección principal
    // Tipo de dirección: "billing" (oficial/facturación) o "shipping" (envío)
    addressType: v.optional(v.string()), // "billing" | "shipping" - default "shipping"
    createdAt: v.number(), // Timestamp de creación
  })
    .index("by_phone", ["phone"])
    .index("by_phone_primary", ["phone", "isPrimary"])
    .index("by_phone_type", ["phone", "addressType"]),

  // ============================================================
  // ORDERS (Pedidos)
  // ============================================================
  orders: defineTable({
    phone: v.string(), // Referencia al lead
    orderNumber: v.optional(v.number()), // Número secuencial por lead (1, 2, 3...)
    // Items del pedido (jsonb en Supabase)
    items: v.any(), // JSON array de items - puede ser string o array
    // Montos
    totalAmount: v.number(), // Monto total antes de descuentos
    discountAmount: v.optional(v.number()), // Descuento aplicado (default 0)
    finalAmount: v.number(), // Monto final a pagar
    // DEPRECATED: mantener por compatibilidad
    total: v.optional(v.number()), // Alias de finalAmount
    // Estados
    status: v.string(), // pending, confirmed, preparing, delivered, cancelled
    paymentStatus: v.optional(v.string()), // pending, partial, completed
    // Dirección de entrega
    deliveryAddressId: v.optional(v.id("addresses")),
    deliveryAddress: v.optional(v.string()), // Copia de la dirección para histórico
    deliveryReference: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    // Método de pago
    paymentMethod: v.optional(v.string()),
    // Notas adicionales
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_phone", ["phone"])
    .index("by_phone_status", ["phone", "status"])
    .index("by_status", ["status"]),

  // ============================================================
  // PAYMENTS (Pagos - múltiples por pedido)
  // ============================================================
  payments: defineTable({
    phone: v.string(), // Referencia al lead
    orderId: v.id("orders"), // Referencia al pedido
    // Consecutivo interno global (1, 2, 3, 4...)
    paymentNumber: v.number(),
    // Monto del pago
    amount: v.number(),
    // Método de pago usado
    paymentMethod: v.string(), // Bancolombia, Nequi, Daviplata, etc.
    // Estado del pago
    status: v.string(), // "pending_review", "verified", "rejected"
    // Notas o referencia del comprobante
    reference: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()),
    // Quién verificó (para auditoría)
    verifiedBy: v.optional(v.string()),
    // Flag si se envió notificación por email
    emailSent: v.optional(v.boolean()),
    emailSentAt: v.optional(v.number()),
  })
    .index("by_phone", ["phone"])
    .index("by_order", ["orderId"])
    .index("by_status", ["status"])
    .index("by_payment_number", ["paymentNumber"]),

  // ============================================================
  // COUNTERS (Contadores globales)
  // ============================================================
  counters: defineTable({
    name: v.string(), // "payment_number"
    value: v.number(),
  }).index("by_name", ["name"]),

  // ============================================================
  // EVENTS (Mensajes de conversación)
  // ============================================================
  events: defineTable({
    phone: v.string(), // Referencia al lead
    direction: v.string(), // "in" o "out"
    text: v.string(),
    metadata: v.optional(v.any()), // JSON metadata opcional
    createdAt: v.optional(v.number()), // Timestamp de creación
  })
    .index("by_phone", ["phone"])
    .index("by_phone_direction", ["phone", "direction"]),

  // ============================================================
  // INVENTARIO (Productos)
  // ============================================================
  inventarioComidasRapidas: defineTable({
    nombre: v.string(),
    precio: v.number(),
    descripcion: v.optional(v.string()),
    categoria: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_categoria", ["categoria"]),

  // ============================================================
  // COMBOS
  // ============================================================
  combos: defineTable({
    comboKey: v.string(), // Identificador único del combo
    // Supabase usa "name", Convex usa "nombre" - soportamos ambos
    nombre: v.string(),
    name: v.optional(v.string()), // Alias para compatibilidad
    // Supabase usa "price_cop", Convex usa "precio"
    precio: v.number(),
    priceCop: v.optional(v.number()), // Alias para compatibilidad
    descripcion: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  }).index("by_combo_key", ["comboKey"]),

  // ============================================================
  // COMBO ITEMS
  // ============================================================
  comboItems: defineTable({
    comboId: v.optional(v.string()), // UUID de Supabase (para migración)
    comboKey: v.string(), // FK a combos por key
    itemName: v.string(),
    // Supabase usa "qty", Convex usa "cantidad"
    cantidad: v.optional(v.number()),
    qty: v.optional(v.number()), // Alias para compatibilidad
    isFree: v.optional(v.boolean()),
  }).index("by_combo_key", ["comboKey"]),
});
