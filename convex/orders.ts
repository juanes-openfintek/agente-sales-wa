import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Estados de pedidos
// pending: Pedido en proceso de creacion
// confirmed: Pedido confirmado por el cliente
// paid: Pedido pagado
// preparing: En preparacion
// delivered: Entregado
// cancelled: Cancelado

// ============ QUERIES ============

// Obtener todos los pedidos de un cliente
export const getByPhone = query({
  args: { phone: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc");

    if (args.limit) {
      return await q.take(args.limit);
    }
    return await q.collect();
  },
});

// Obtener pedido por ID
export const getById = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Obtener pedido activo (pending o confirmed) de un cliente
export const getActive = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    // Buscar pedidos pendientes o confirmados
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc")
      .collect();

    return orders.find(
      (o) => o.status === "pending" || o.status === "confirmed"
    );
  },
});

// Obtener el ultimo pedido de un cliente
export const getLatest = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc")
      .first();
  },
});

// Contar pedidos de un cliente
export const countByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();
    return orders.length;
  },
});

// Obtener pedidos por estado
export const getByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .collect();
  },
});

// ============ MUTATIONS ============

// Crear nuevo pedido
export const create = mutation({
  args: {
    phone: v.string(),
    items: v.optional(v.string()),
    total: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Obtener el numero de pedido siguiente
    const existingOrders = await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();

    const orderNumber = existingOrders.length + 1;

    const orderId = await ctx.db.insert("orders", {
      phone: args.phone,
      orderNumber,
      items: args.items || "[]",
      total: args.total || 0,
      status: "pending",
      createdAt: Date.now(),
    });

    // Actualizar el lead con el pedido activo
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    if (lead) {
      await ctx.db.patch(lead._id, {
        currentOrderId: orderId,
        totalOrders: orderNumber,
      });
    }

    return { orderId, orderNumber };
  },
});

// Actualizar items y total del pedido
export const updateItems = mutation({
  args: {
    id: v.id("orders"),
    items: v.string(),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      items: args.items,
      total: args.total,
    });
    return args.id;
  },
});

// Establecer direccion de entrega
export const setDeliveryAddress = mutation({
  args: {
    id: v.id("orders"),
    addressId: v.optional(v.id("addresses")),
    address: v.string(),
    reference: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, addressId, address, reference, deliveryTime } = args;

    await ctx.db.patch(id, {
      deliveryAddressId: addressId,
      deliveryAddress: address,
      deliveryReference: reference,
      deliveryTime: deliveryTime,
    });

    return id;
  },
});

// Establecer metodo de pago
export const setPaymentMethod = mutation({
  args: {
    id: v.id("orders"),
    paymentMethod: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      paymentMethod: args.paymentMethod,
    });
    return args.id;
  },
});

// Confirmar pedido
export const confirm = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "confirmed",
      confirmedAt: Date.now(),
    });
    return args.id;
  },
});

// Marcar como pagado
export const markPaid = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "paid",
      paidAt: Date.now(),
    });

    // Limpiar referencia en el lead
    const order = await ctx.db.get(args.id);
    if (order) {
      const lead = await ctx.db
        .query("leads")
        .withIndex("by_phone", (q) => q.eq("phone", order.phone))
        .first();

      if (lead && lead.currentOrderId === args.id) {
        await ctx.db.patch(lead._id, {
          currentOrderId: undefined,
        });
      }
    }

    return args.id;
  },
});

// Marcar como entregado
export const markDelivered = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "delivered",
      deliveredAt: Date.now(),
    });
    return args.id;
  },
});

// Cancelar pedido
export const cancel = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: Date.now(),
    });

    // Limpiar referencia en el lead
    const order = await ctx.db.get(args.id);
    if (order) {
      const lead = await ctx.db
        .query("leads")
        .withIndex("by_phone", (q) => q.eq("phone", order.phone))
        .first();

      if (lead && lead.currentOrderId === args.id) {
        await ctx.db.patch(lead._id, {
          currentOrderId: undefined,
        });
      }
    }

    return args.id;
  },
});

// Actualizar estado generico
export const updateStatus = mutation({
  args: {
    id: v.id("orders"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { status: args.status };

    // Agregar timestamp segun el estado
    switch (args.status) {
      case "confirmed":
        updates.confirmedAt = Date.now();
        break;
      case "paid":
        updates.paidAt = Date.now();
        break;
      case "delivered":
        updates.deliveredAt = Date.now();
        break;
      case "cancelled":
        updates.cancelledAt = Date.now();
        break;
    }

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});
