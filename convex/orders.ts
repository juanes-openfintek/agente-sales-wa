import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Estados de pedidos
// pending: Pedido en proceso de creacion
// confirmed: Pedido confirmado por el cliente
// paid: Pedido pagado
// preparing: En preparacion
// delivered: Entregado
// cancelled: Cancelado

// Estados de pago
// pending: Pendiente de pago
// partial: Pago parcial recibido
// completed: Pago completo

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

// Crear nuevo pedido (compatible con schema actualizado)
export const create = mutation({
  args: {
    phone: v.string(),
    items: v.optional(v.any()), // Puede ser string JSON o array
    total: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    finalAmount: v.optional(v.number()),
    deliveryAddress: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Obtener el numero de pedido siguiente
    const existingOrders = await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();

    const orderNumber = existingOrders.length + 1;
    const now = Date.now();

    // Calcular montos
    const totalAmount = args.totalAmount ?? args.total ?? 0;
    const discountAmount = args.discountAmount ?? 0;
    const finalAmount = args.finalAmount ?? totalAmount - discountAmount;

    // Normalizar items a JSON si es necesario
    let itemsValue = args.items;
    if (typeof itemsValue === "object" && itemsValue !== null) {
      itemsValue = JSON.stringify(itemsValue);
    }

    const orderId = await ctx.db.insert("orders", {
      phone: args.phone,
      orderNumber,
      items: itemsValue || "[]",
      totalAmount,
      discountAmount,
      finalAmount,
      total: finalAmount, // Mantener por compatibilidad
      status: "pending",
      paymentStatus: "pending",
      deliveryAddress: args.deliveryAddress,
      paymentMethod: args.paymentMethod,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
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
        updatedAt: now,
      });
    }

    return { orderId, orderNumber };
  },
});

// Actualizar items y total del pedido
export const updateItems = mutation({
  args: {
    id: v.id("orders"),
    items: v.any(), // Puede ser string o array
    total: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    finalAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Normalizar items
    let itemsValue = args.items;
    if (typeof itemsValue === "object" && itemsValue !== null) {
      itemsValue = JSON.stringify(itemsValue);
    }

    // Calcular montos
    const totalAmount = args.totalAmount ?? args.total ?? 0;
    const discountAmount = args.discountAmount ?? 0;
    const finalAmount = args.finalAmount ?? totalAmount - discountAmount;

    await ctx.db.patch(args.id, {
      items: itemsValue,
      totalAmount,
      discountAmount,
      finalAmount,
      total: finalAmount, // Mantener por compatibilidad
      updatedAt: now,
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
      updatedAt: Date.now(),
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
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

// Confirmar pedido
export const confirm = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
    });
    return args.id;
  },
});

// Marcar como pagado
export const markPaid = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "paid",
      paymentStatus: "completed",
      paidAt: now,
      updatedAt: now,
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
          updatedAt: now,
        });
      }
    }

    return args.id;
  },
});

// Actualizar estado de pago
export const updatePaymentStatus = mutation({
  args: {
    id: v.id("orders"),
    paymentStatus: v.string(), // pending, partial, completed
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      paymentStatus: args.paymentStatus,
      updatedAt: Date.now(),
    };

    if (args.paymentStatus === "completed") {
      updates.paidAt = Date.now();
    }

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

// Marcar como entregado
export const markDelivered = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "delivered",
      deliveredAt: now,
      updatedAt: now,
    });
    return args.id;
  },
});

// Cancelar pedido
export const cancel = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
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
          updatedAt: now,
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
    const now = Date.now();
    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Agregar timestamp segun el estado
    switch (args.status) {
      case "confirmed":
        updates.confirmedAt = now;
        break;
      case "paid":
        updates.paidAt = now;
        updates.paymentStatus = "completed";
        break;
      case "delivered":
        updates.deliveredAt = now;
        break;
      case "cancelled":
        updates.cancelledAt = now;
        break;
    }

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

// Agregar notas al pedido
export const addNotes = mutation({
  args: {
    id: v.id("orders"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      notes: args.notes,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

// Aplicar descuento
export const applyDiscount = mutation({
  args: {
    id: v.id("orders"),
    discountAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id);
    if (!order) {
      throw new Error("Order not found");
    }

    const totalAmount = order.totalAmount;
    const finalAmount = totalAmount - args.discountAmount;

    await ctx.db.patch(args.id, {
      discountAmount: args.discountAmount,
      finalAmount: finalAmount,
      total: finalAmount, // Mantener por compatibilidad
      updatedAt: Date.now(),
    });

    return args.id;
  },
});
