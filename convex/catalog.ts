import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";

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

// ============ CATÁLOGO DE CAMISETAS ============

// Colores compartidos por todos los tipos de camiseta
const COLORES_CAMISETAS = [
  "Blanco", "Negro", "Gris", "Amarillo", "Vainilla", "Nude", "Mocca",
  "Rojo", "Azul Navy", "Azul Rey", "Azul Medio", "Verde Militar",
  "Verde Cali", "Rosa", "Lila", "Petróleo", "Vinotinto", "Mostaza", "Terracota",
];

// Query interna: catálogo de camisetas formateado para el prompt de IA
export const getCamisetasCatalog = internalQuery({
  args: {},
  handler: async (ctx) => {
    const camisetas = await ctx.db.query("camisetas").collect();
    const activas = camisetas.filter((c) => c.activo !== false);

    let catalog = "CAMISETAS PIEL DE DURAZNO:\n\n";

    // Si la tabla está vacía, usar catálogo por defecto (el inventario lo manejamos nosotros)
    if (activas.length === 0) {
      catalog += `📌 *REGLA DE PRECIO*:\n`;
      catalog += `• Pedidos de 6 o más unidades → precio base por unidad\n`;
      catalog += `• Pedidos de menos de 6 unidades → precio base + $2.000 por camiseta\n\n`;
      catalog += `🚚 *ENVÍO*: Bogotá $10.000 | Otras ciudades: se cotiza\n\n`;
      catalog += `👕 *Camiseta Piel de Durazno Dama*\n`;
      catalog += `   Precio (≥6 und): $11.000 c/u\n`;
      catalog += `   Precio (<6 und): $13.000 c/u\n`;
      catalog += `   Tallas disponibles: S, M, L, XL\n\n`;
      catalog += `👕 *Camiseta Piel de Durazno Caballero Horma Recta*\n`;
      catalog += `   Precio (≥6 und): $12.000 c/u\n`;
      catalog += `   Precio (<6 und): $14.000 c/u\n`;
      catalog += `   Tallas disponibles: S, M, L, XL\n\n`;
      catalog += `👕 *Camiseta Piel de Durazno Niño*\n`;
      catalog += `   Precio (≥6 und): $9.000 c/u\n`;
      catalog += `   Precio (<6 und): $11.000 c/u\n`;
      catalog += `   Tallas disponibles: 2, 4, 6, 8, 10, 12, 14, 16\n\n`;
      const coloresStr = COLORES_CAMISETAS.join(", ");
      catalog += `🎨 *COLORES DISPONIBLES (aplican para todos los tipos)*:\n${coloresStr}\n`;
      return catalog;
    }
    catalog += `📌 *REGLA DE PRECIO*:\n`;
    catalog += `• Pedidos de 6 o más unidades → precio base por unidad\n`;
    catalog += `• Pedidos de menos de 6 unidades → precio base + $2.000 por camiseta\n\n`;
    catalog += `🚚 *ENVÍO*: Bogotá $10.000 | Otras ciudades: se cotiza\n\n`;

    for (const c of activas) {
      const tallasArr = JSON.parse(c.tallas) as string[];
      const precioMenor = c.precioBase + 2000;
      catalog += `👕 *${c.nombre}*\n`;
      catalog += `   Precio (≥6 und): $${c.precioBase.toLocaleString()} c/u\n`;
      catalog += `   Precio (<6 und): $${precioMenor.toLocaleString()} c/u\n`;
      catalog += `   Tallas disponibles: ${tallasArr.join(", ")}\n\n`;
    }

    const coloresStr = COLORES_CAMISETAS.join(", ");
    catalog += `🎨 *COLORES DISPONIBLES (aplican para todos los tipos)*:\n${coloresStr}\n`;

    return catalog;
  },
});

// Mutation pública: poblar tabla camisetas con datos iniciales del Excel
export const seedCamisetas = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("camisetas").collect();
    if (existing.length > 0) {
      return { message: "La tabla camisetas ya tiene datos, no se insertó nada.", count: 0 };
    }

    const coloresJson = JSON.stringify(COLORES_CAMISETAS);
    const tallasAdulto = JSON.stringify(["S", "M", "L", "XL"]);
    const tallasNino = JSON.stringify(["2", "4", "6", "8", "10", "12", "14", "16"]);

    await ctx.db.insert("camisetas", {
      nombre: "Camiseta Piel de Durazno Dama",
      tipo: "dama",
      tallas: tallasAdulto,
      colores: coloresJson,
      precioBase: 11000,
      activo: true,
    });

    await ctx.db.insert("camisetas", {
      nombre: "Camiseta Piel de Durazno Caballero Horma Recta",
      tipo: "caballero",
      tallas: tallasAdulto,
      colores: coloresJson,
      precioBase: 12000,
      activo: true,
    });

    await ctx.db.insert("camisetas", {
      nombre: "Camiseta Piel de Durazno Niño",
      tipo: "nino",
      tallas: tallasNino,
      colores: coloresJson,
      precioBase: 9000,
      activo: true,
    });

    return { message: "Camisetas insertadas correctamente.", count: 3 };
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
