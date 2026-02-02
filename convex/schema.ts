import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Tabla de leads (clientes)
  leads: defineTable({
    phone: v.string(), // Teléfono del cliente (identificador principal)
    name: v.optional(v.string()),
    contactPhone: v.optional(v.string()), // Puede diferir del phone principal
    email: v.optional(v.string()),
    age: v.optional(v.number()),
    cedula: v.optional(v.string()), // ID colombiano
    city: v.optional(v.string()),
    status: v.string(), // Estado de conversación (ConversationState)
    lastCustomerMessageAt: v.optional(v.number()), // Timestamp
    reminderSentAt: v.optional(v.number()), // Timestamp
    notifyPreference: v.optional(v.string()),
    // Referencia al pedido activo actual
    currentOrderId: v.optional(v.id("orders")),
    // Contador de pedidos totales
    totalOrders: v.optional(v.number()),
    // Flag para evitar respuestas repetitivas en estado completado
    completedMessageSent: v.optional(v.boolean()),
    // DEPRECATED: Estos campos se mantienen por compatibilidad pero los pedidos van en orders
    address: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    orderItems: v.optional(v.string()),
    orderTotal: v.optional(v.number()),
  })
    .index("by_phone", ["phone"])
    .index("by_status", ["status"]),

  // Tabla de direcciones del cliente
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

  // Tabla de pedidos
  orders: defineTable({
    phone: v.string(), // Referencia al lead
    orderNumber: v.number(), // Número secuencial por lead (1, 2, 3...)
    items: v.string(), // JSON string de items del pedido
    total: v.number(),
    status: v.string(), // pending, confirmed, paid, preparing, delivered, cancelled
    // Dirección de entrega de este pedido específico
    deliveryAddressId: v.optional(v.id("addresses")),
    deliveryAddress: v.optional(v.string()), // Copia de la dirección para histórico
    deliveryReference: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    // Método de pago
    paymentMethod: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_phone", ["phone"])
    .index("by_phone_status", ["phone", "status"])
    .index("by_status", ["status"]),

  // Tabla de pagos (múltiples pagos por pedido)
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

  // Contador global para consecutivo de pagos
  counters: defineTable({
    name: v.string(), // "payment_number"
    value: v.number(),
  })
    .index("by_name", ["name"]),

  // Tabla de eventos (mensajes de conversación)
  events: defineTable({
    phone: v.string(), // Referencia al lead
    direction: v.string(), // "in" o "out"
    text: v.string(),
    metadata: v.optional(v.any()), // JSON metadata opcional
  })
    .index("by_phone", ["phone"])
    .index("by_phone_direction", ["phone", "direction"]),

  // Catálogo de productos
  inventarioComidasRapidas: defineTable({
    nombre: v.string(),
    precio: v.number(),
    descripcion: v.optional(v.string()),
    categoria: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  })
    .index("by_categoria", ["categoria"]),

  // Combos
  combos: defineTable({
    comboKey: v.string(), // Identificador único del combo
    nombre: v.string(),
    precio: v.number(),
    descripcion: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  })
    .index("by_combo_key", ["comboKey"]),

  // Items de combos
  comboItems: defineTable({
    comboKey: v.string(), // FK a combos
    itemName: v.string(),
    isFree: v.optional(v.boolean()),
    cantidad: v.optional(v.number()),
  })
    .index("by_combo_key", ["comboKey"]),
});
