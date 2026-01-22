import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============ QUERIES ============

// Obtener historial de conversación (últimos N mensajes)
export const getHistory = query({
  args: {
    phone: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const events = await ctx.db
      .query("events")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc")
      .take(limit);

    // Devolver en orden cronológico (más antiguo primero)
    return events.reverse();
  },
});

// Obtener eventos con metadata completa
export const getEventsWithMetadata = query({
  args: {
    phone: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    return await ctx.db
      .query("events")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("asc")
      .take(limit);
  },
});

// Contar mensajes entrantes de un cliente
export const countIncomingMessages = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_phone_direction", (q) =>
        q.eq("phone", args.phone).eq("direction", "in")
      )
      .collect();

    return events.length;
  },
});

// Obtener historial formateado para prompt
export const getFormattedHistory = query({
  args: {
    phone: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const events = await ctx.db
      .query("events")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc")
      .take(limit);

    // Devolver en orden cronológico, formateado
    return events.reverse().map((event) => ({
      role: event.direction === "in" ? "user" : "assistant",
      content: event.text,
    }));
  },
});

// ============ MUTATIONS ============

// Guardar nuevo evento/mensaje
export const save = mutation({
  args: {
    phone: v.string(),
    direction: v.string(), // "in" o "out"
    text: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      phone: args.phone,
      direction: args.direction,
      text: args.text,
      metadata: args.metadata,
    });
  },
});

// Guardar mensaje entrante (helper)
export const saveIncoming = mutation({
  args: {
    phone: v.string(),
    text: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      phone: args.phone,
      direction: "in",
      text: args.text,
      metadata: args.metadata,
    });
  },
});

// Guardar mensaje saliente (helper)
export const saveOutgoing = mutation({
  args: {
    phone: v.string(),
    text: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      phone: args.phone,
      direction: "out",
      text: args.text,
      metadata: args.metadata,
    });
  },
});

// Eliminar historial de un cliente (para limpieza/GDPR)
export const deleteByPhone = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    return { deleted: events.length };
  },
});
