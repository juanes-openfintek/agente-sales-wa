import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============ QUERIES ============

// Obtener lead por teléfono
export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

// Obtener todos los leads ordenados por actualización
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("leads").order("desc").collect();
  },
});

// Obtener conversaciones activas (status != PAYMENT_COMPLETED)
export const getActiveConversations = query({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    return leads.filter((lead) => lead.status !== "payment_completed");
  },
});

// Verificar si existe un lead
export const exists = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
    return lead !== null;
  },
});

// ============ MUTATIONS ============

// Crear nuevo lead
export const create = mutation({
  args: {
    phone: v.string(),
    name: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    age: v.optional(v.number()),
    cedula: v.optional(v.string()),
    city: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    status: v.string(),
    paymentMethod: v.optional(v.string()),
    orderItems: v.optional(v.string()),
    orderTotal: v.optional(v.number()),
    notifyPreference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("leads", {
      ...args,
      lastCustomerMessageAt: now,
    });
  },
});

// Actualizar lead existente
export const update = mutation({
  args: {
    phone: v.string(),
    name: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    age: v.optional(v.number()),
    cedula: v.optional(v.string()),
    city: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    status: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    orderItems: v.optional(v.string()),
    orderTotal: v.optional(v.number()),
    lastCustomerMessageAt: v.optional(v.number()),
    reminderSentAt: v.optional(v.number()),
    notifyPreference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { phone, ...updates } = args;

    // Buscar el lead por teléfono
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();

    if (!lead) {
      throw new Error(`Lead not found: ${phone}`);
    }

    // Filtrar campos undefined
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(lead._id, filteredUpdates);
    return lead._id;
  },
});

// Upsert: crear o actualizar lead
export const upsert = mutation({
  args: {
    phone: v.string(),
    name: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    age: v.optional(v.number()),
    cedula: v.optional(v.string()),
    city: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    status: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    orderItems: v.optional(v.string()),
    orderTotal: v.optional(v.number()),
    lastCustomerMessageAt: v.optional(v.number()),
    reminderSentAt: v.optional(v.number()),
    notifyPreference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { phone, ...data } = args;

    // Buscar lead existente
    const existingLead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();

    if (existingLead) {
      // Actualizar
      const filteredUpdates = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      await ctx.db.patch(existingLead._id, filteredUpdates);
      return { action: "updated", id: existingLead._id };
    } else {
      // Crear nuevo
      const id = await ctx.db.insert("leads", {
        phone,
        status: data.status || "new",
        ...data,
      });
      return { action: "created", id };
    }
  },
});

// Marcar timestamp de mensaje de cliente
export const updateLastMessageTime = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    if (lead) {
      await ctx.db.patch(lead._id, {
        lastCustomerMessageAt: Date.now(),
      });
    }
  },
});

// Marcar recordatorio enviado
export const markReminderSent = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    if (lead) {
      await ctx.db.patch(lead._id, {
        reminderSentAt: Date.now(),
      });
    }
  },
});
