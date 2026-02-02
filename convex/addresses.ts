import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============ QUERIES ============

// Obtener todas las direcciones de un cliente
export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();
  },
});

// Obtener la direccion principal de un cliente
export const getPrimary = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_phone_primary", (q) =>
        q.eq("phone", args.phone).eq("isPrimary", true)
      )
      .first();
  },
});

// Obtener direccion por ID
export const getById = query({
  args: { id: v.id("addresses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Contar direcciones de un cliente
export const countByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();
    return addresses.length;
  },
});

// Obtener dirección oficial/de facturación
export const getBilling = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_phone_type", (q) =>
        q.eq("phone", args.phone).eq("addressType", "billing")
      )
      .first();
  },
});

// Obtener direcciones de envío
export const getShipping = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .filter((q) => 
        q.or(
          q.eq(q.field("addressType"), "shipping"),
          q.eq(q.field("addressType"), undefined)
        )
      )
      .collect();
  },
});

// ============ MUTATIONS ============

// Crear nueva direccion
export const create = mutation({
  args: {
    phone: v.string(),
    address: v.string(),
    label: v.optional(v.string()),
    reference: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
    // Nuevo: tipo de dirección (billing = oficial/facturación, shipping = envío)
    addressType: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const isPrimary = args.isPrimary ?? false;
    const addressType = args.addressType ?? "shipping";

    // Si esta es la principal, quitar el flag de las otras
    if (isPrimary) {
      const existingAddresses = await ctx.db
        .query("addresses")
        .withIndex("by_phone", (q) => q.eq("phone", args.phone))
        .collect();

      for (const addr of existingAddresses) {
        if (addr.isPrimary) {
          await ctx.db.patch(addr._id, { isPrimary: false });
        }
      }
    }

    // Verificar si es la primera direccion de envío (hacerla principal automaticamente)
    const existingShipping = await ctx.db
      .query("addresses")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .filter((q) => q.neq(q.field("addressType"), "billing"))
      .collect();

    // Solo hacer principal automáticamente si es tipo shipping y es la primera
    const shouldBePrimary = addressType === "shipping" 
      ? (isPrimary || existingShipping.length === 0)
      : false; // Las direcciones billing nunca son "principales"

    return await ctx.db.insert("addresses", {
      phone: args.phone,
      address: args.address,
      label: args.label,
      reference: args.reference,
      isPrimary: shouldBePrimary,
      addressType: addressType,
      city: args.city,
      createdAt: Date.now(),
    });
  },
});

// Actualizar direccion
export const update = mutation({
  args: {
    id: v.id("addresses"),
    address: v.optional(v.string()),
    label: v.optional(v.string()),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(id, filteredUpdates);
    return id;
  },
});

// Establecer direccion como principal
export const setPrimary = mutation({
  args: {
    id: v.id("addresses"),
  },
  handler: async (ctx, args) => {
    const address = await ctx.db.get(args.id);
    if (!address) {
      throw new Error("Address not found");
    }

    // Quitar principal de otras direcciones del mismo cliente
    const existingAddresses = await ctx.db
      .query("addresses")
      .withIndex("by_phone", (q) => q.eq("phone", address.phone))
      .collect();

    for (const addr of existingAddresses) {
      if (addr.isPrimary && addr._id !== args.id) {
        await ctx.db.patch(addr._id, { isPrimary: false });
      }
    }

    // Establecer esta como principal
    await ctx.db.patch(args.id, { isPrimary: true });
    return args.id;
  },
});

// Eliminar direccion
export const remove = mutation({
  args: { id: v.id("addresses") },
  handler: async (ctx, args) => {
    const address = await ctx.db.get(args.id);
    if (!address) {
      throw new Error("Address not found");
    }

    const wasPrimary = address.isPrimary;
    const phone = address.phone;

    await ctx.db.delete(args.id);

    // Si era la principal, hacer principal a la mas reciente
    if (wasPrimary) {
      const remaining = await ctx.db
        .query("addresses")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .order("desc")
        .first();

      if (remaining) {
        await ctx.db.patch(remaining._id, { isPrimary: true });
      }
    }

    return { deleted: true };
  },
});
