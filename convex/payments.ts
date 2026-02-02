import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================
// QUERIES
// ============================================================

/**
 * Obtener pagos de un pedido
 */
export const getByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("desc")
      .collect();
  },
});

/**
 * Obtener pagos de un cliente
 */
export const getByPhone = query({
  args: { phone: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("payments")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }
    return await query.collect();
  },
});

/**
 * Obtener pago por ID
 */
export const getById = query({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Obtener pagos pendientes de revisión
 */
export const getPendingReview = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "pending_review"))
      .order("desc")
      .collect();
  },
});

/**
 * Obtener el último número de pago (consecutivo)
 */
export const getLastPaymentNumber = query({
  args: {},
  handler: async (ctx) => {
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", "payment_number"))
      .first();

    return counter?.value ?? 0;
  },
});

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Crear un nuevo pago con consecutivo automático
 */
export const create = mutation({
  args: {
    phone: v.string(),
    orderId: v.id("orders"),
    amount: v.number(),
    paymentMethod: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Obtener o crear contador de pagos
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", "payment_number"))
      .first();

    let nextPaymentNumber: number;

    if (counter) {
      // Incrementar contador existente
      nextPaymentNumber = counter.value + 1;
      await ctx.db.patch(counter._id, { value: nextPaymentNumber });
    } else {
      // Crear contador si no existe
      nextPaymentNumber = 1;
      await ctx.db.insert("counters", {
        name: "payment_number",
        value: nextPaymentNumber,
      });
    }

    // Crear el pago
    const paymentId = await ctx.db.insert("payments", {
      phone: args.phone,
      orderId: args.orderId,
      paymentNumber: nextPaymentNumber,
      amount: args.amount,
      paymentMethod: args.paymentMethod,
      status: "pending_review",
      reference: args.reference,
      createdAt: Date.now(),
      emailSent: false,
    });

    return {
      paymentId,
      paymentNumber: nextPaymentNumber,
    };
  },
});

/**
 * Verificar un pago (aprobar)
 */
export const verify = mutation({
  args: {
    id: v.id("payments"),
    verifiedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "verified",
      verifiedAt: Date.now(),
      verifiedBy: args.verifiedBy,
    });
    return { success: true };
  },
});

/**
 * Rechazar un pago
 */
export const reject = mutation({
  args: {
    id: v.id("payments"),
    verifiedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "rejected",
      verifiedAt: Date.now(),
      verifiedBy: args.verifiedBy,
    });
    return { success: true };
  },
});

/**
 * Marcar email como enviado
 */
export const markEmailSent = mutation({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      emailSent: true,
      emailSentAt: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Obtener total pagado de un pedido
 */
export const getTotalPaidByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.eq(q.field("status"), "verified"))
      .collect();

    return payments.reduce((sum, p) => sum + p.amount, 0);
  },
});
