import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Tabla de leads (clientes)
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
    orderItems: v.optional(v.string()), // JSON string de items
    orderTotal: v.optional(v.number()),
    lastCustomerMessageAt: v.optional(v.number()), // Timestamp
    reminderSentAt: v.optional(v.number()), // Timestamp
    notifyPreference: v.optional(v.string()),
  })
    .index("by_phone", ["phone"])
    .index("by_status", ["status"]),

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
