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

// Crear producto
export const createProduct = mutation({
  args: {
    nombre: v.string(),
    precio: v.number(),
    descripcion: v.optional(v.string()),
    categoria: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("inventarioComidasRapidas", {
      ...args,
      disponible: args.disponible ?? true,
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
    await ctx.db.patch(id, filteredUpdates);
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

// Crear combo
export const createCombo = mutation({
  args: {
    comboKey: v.string(),
    nombre: v.string(),
    precio: v.number(),
    descripcion: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("combos", {
      ...args,
      disponible: args.disponible ?? true,
    });
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

// Agregar item a combo
export const addComboItem = mutation({
  args: {
    comboKey: v.string(),
    itemName: v.string(),
    isFree: v.optional(v.boolean()),
    cantidad: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("comboItems", {
      ...args,
      cantidad: args.cantidad ?? 1,
    });
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
