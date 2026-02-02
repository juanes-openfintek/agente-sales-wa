import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============ PRODUCTOS (inventario_comidas_rapidas) ============

// Obtener todos los productos
export const getAllProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("inventarioComidasRapidas").collect();
  },
});

// Obtener productos por categoría
export const getProductsByCategory = query({
  args: { categoria: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventarioComidasRapidas")
      .withIndex("by_categoria", (q) => q.eq("categoria", args.categoria))
      .collect();
  },
});

// Obtener productos disponibles
export const getAvailableProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("inventarioComidasRapidas").collect();
    return products.filter((p) => p.disponible !== false);
  },
});

// Crear producto (compatible con Supabase)
export const createProduct = mutation({
  args: {
    nombre: v.string(),
    precio: v.number(),
    descripcion: v.optional(v.string()),
    categoria: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
    // Timestamps opcionales para migración
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("inventarioComidasRapidas", {
      nombre: args.nombre,
      precio: args.precio,
      descripcion: args.descripcion,
      categoria: args.categoria,
      disponible: args.disponible ?? true,
      createdAt: args.createdAt ?? now,
      updatedAt: args.updatedAt ?? now,
    });
  },
});

// Actualizar producto
export const updateProduct = mutation({
  args: {
    id: v.id("inventarioComidasRapidas"),
    nombre: v.optional(v.string()),
    precio: v.optional(v.number()),
    descripcion: v.optional(v.string()),
    categoria: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// ============ COMBOS ============

// Obtener todos los combos
export const getAllCombos = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("combos").collect();
  },
});

// Obtener combo por key
export const getComboByKey = query({
  args: { comboKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("combos")
      .withIndex("by_combo_key", (q) => q.eq("comboKey", args.comboKey))
      .first();
  },
});

// Crear combo (compatible con Supabase - mapea name a nombre, price_cop a precio)
export const createCombo = mutation({
  args: {
    comboKey: v.string(),
    // Campos Convex
    nombre: v.optional(v.string()),
    precio: v.optional(v.number()),
    // Campos Supabase (aliases)
    name: v.optional(v.string()),
    priceCop: v.optional(v.number()),
    // Comunes
    descripcion: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Mapear campos de Supabase a Convex
    const nombre = args.nombre ?? args.name ?? "Sin nombre";
    const precio = args.precio ?? args.priceCop ?? 0;

    return await ctx.db.insert("combos", {
      comboKey: args.comboKey,
      nombre,
      precio,
      // Guardar aliases para compatibilidad
      name: args.name,
      priceCop: args.priceCop,
      descripcion: args.descripcion,
      disponible: args.disponible ?? true,
    });
  },
});

// Actualizar combo
export const updateCombo = mutation({
  args: {
    comboKey: v.string(),
    nombre: v.optional(v.string()),
    precio: v.optional(v.number()),
    descripcion: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { comboKey, ...updates } = args;

    const combo = await ctx.db
      .query("combos")
      .withIndex("by_combo_key", (q) => q.eq("comboKey", comboKey))
      .first();

    if (!combo) {
      throw new Error(`Combo not found: ${comboKey}`);
    }

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(combo._id, filteredUpdates);
    return combo._id;
  },
});

// ============ COMBO ITEMS ============

// Obtener items de un combo
export const getComboItems = query({
  args: { comboKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comboItems")
      .withIndex("by_combo_key", (q) => q.eq("comboKey", args.comboKey))
      .collect();
  },
});

// Agregar item a combo (compatible con Supabase - mapea qty a cantidad)
export const addComboItem = mutation({
  args: {
    comboKey: v.string(),
    itemName: v.string(),
    // Campos Supabase
    comboId: v.optional(v.string()), // UUID de Supabase
    qty: v.optional(v.number()),
    // Campos Convex
    cantidad: v.optional(v.number()),
    isFree: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Mapear qty a cantidad
    const cantidad = args.cantidad ?? args.qty ?? 1;

    return await ctx.db.insert("comboItems", {
      comboKey: args.comboKey,
      itemName: args.itemName,
      comboId: args.comboId, // Guardar para referencia
      cantidad,
      qty: args.qty, // Guardar alias
      isFree: args.isFree ?? false,
    });
  },
});

// Eliminar items de un combo
export const deleteComboItems = mutation({
  args: { comboKey: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("comboItems")
      .withIndex("by_combo_key", (q) => q.eq("comboKey", args.comboKey))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    return { deleted: items.length };
  },
});

// ============ CATÁLOGO COMPLETO ============

// Obtener catálogo completo (productos + combos con items)
export const getFullCatalog = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("inventarioComidasRapidas").collect();
    const combos = await ctx.db.query("combos").collect();

    // Agregar items a cada combo
    const combosWithItems = await Promise.all(
      combos.map(async (combo) => {
        const items = await ctx.db
          .query("comboItems")
          .withIndex("by_combo_key", (q) => q.eq("comboKey", combo.comboKey))
          .collect();
        return { ...combo, items };
      })
    );

    return {
      products,
      combos: combosWithItems,
    };
  },
});

// Obtener catálogo formateado para Supabase (normalizar nombres)
export const getFullCatalogNormalized = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("inventarioComidasRapidas").collect();
    const combos = await ctx.db.query("combos").collect();

    // Normalizar productos
    const normalizedProducts = products.map((p) => ({
      id: p._id,
      nombre: p.nombre,
      precio: p.precio,
      descripcion: p.descripcion,
      categoria: p.categoria,
      disponible: p.disponible,
    }));

    // Agregar items a cada combo y normalizar
    const combosWithItems = await Promise.all(
      combos.map(async (combo) => {
        const items = await ctx.db
          .query("comboItems")
          .withIndex("by_combo_key", (q) => q.eq("comboKey", combo.comboKey))
          .collect();

        return {
          id: combo._id,
          combo_key: combo.comboKey,
          name: combo.nombre,
          price_cop: combo.precio,
          descripcion: combo.descripcion,
          disponible: combo.disponible,
          items: items.map((i) => ({
            item_name: i.itemName,
            qty: i.cantidad ?? i.qty ?? 1,
            is_free: i.isFree ?? false,
          })),
        };
      })
    );

    return {
      products: normalizedProducts,
      combos: combosWithItems,
    };
  },
});
