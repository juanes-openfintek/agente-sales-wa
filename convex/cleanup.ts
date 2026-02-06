import { mutation, query } from "./_generated/server";

/**
 * Script de limpieza para eliminar duplicados de la migración.
 */

// ============================================================
// QUERIES DE DIAGNÓSTICO
// ============================================================

/**
 * Obtener estadísticas de duplicados en combos
 */
export const getComboDuplicateStats = query({
  args: {},
  handler: async (ctx) => {
    const combos = await ctx.db.query("combos").collect();

    // Agrupar por comboKey
    const byKey: Record<string, typeof combos> = {};
    for (const combo of combos) {
      const key = combo.comboKey;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(combo);
    }

    // Encontrar duplicados
    const duplicates: { comboKey: string; count: number; ids: string[] }[] = [];
    for (const [key, items] of Object.entries(byKey)) {
      if (items.length > 1) {
        duplicates.push({
          comboKey: key,
          count: items.length,
          ids: items.map((i) => i._id),
        });
      }
    }

    return {
      totalCombos: combos.length,
      uniqueKeys: Object.keys(byKey).length,
      duplicateKeys: duplicates.length,
      duplicates,
    };
  },
});

/**
 * Obtener estadísticas de duplicados en productos
 */
export const getProductDuplicateStats = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("inventarioComidasRapidas").collect();

    // Agrupar por nombre
    const byName: Record<string, typeof products> = {};
    for (const product of products) {
      const name = product.nombre;
      if (!byName[name]) byName[name] = [];
      byName[name].push(product);
    }

    // Encontrar duplicados
    const duplicates: { nombre: string; count: number; ids: string[] }[] = [];
    for (const [name, items] of Object.entries(byName)) {
      if (items.length > 1) {
        duplicates.push({
          nombre: name,
          count: items.length,
          ids: items.map((i) => i._id),
        });
      }
    }

    return {
      totalProducts: products.length,
      uniqueNames: Object.keys(byName).length,
      duplicateNames: duplicates.length,
      duplicates,
    };
  },
});

/**
 * Obtener estadísticas de duplicados en comboItems
 */
export const getComboItemDuplicateStats = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("comboItems").collect();

    // Agrupar por comboKey + itemName
    const byKey: Record<string, typeof items> = {};
    for (const item of items) {
      const key = `${item.comboKey}::${item.itemName}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(item);
    }

    // Encontrar duplicados
    const duplicates: { key: string; count: number; ids: string[] }[] = [];
    for (const [key, itemList] of Object.entries(byKey)) {
      if (itemList.length > 1) {
        duplicates.push({
          key,
          count: itemList.length,
          ids: itemList.map((i) => i._id),
        });
      }
    }

    return {
      totalItems: items.length,
      uniqueKeys: Object.keys(byKey).length,
      duplicateKeys: duplicates.length,
      duplicates: duplicates.slice(0, 20), // Limitar para no saturar
    };
  },
});

// ============================================================
// MUTATIONS DE LIMPIEZA
// ============================================================

/**
 * Limpiar combos duplicados - mantiene el más reciente con datos válidos
 */
export const cleanupDuplicateCombos = mutation({
  args: {},
  handler: async (ctx) => {
    const combos = await ctx.db.query("combos").collect();

    // Agrupar por comboKey
    const byKey: Record<string, typeof combos> = {};
    for (const combo of combos) {
      const key = combo.comboKey;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(combo);
    }

    let deleted = 0;
    const kept: string[] = [];

    for (const [key, items] of Object.entries(byKey)) {
      if (items.length <= 1) {
        // No hay duplicados, mantener
        if (items[0]) kept.push(items[0]._id);
        continue;
      }

      // Ordenar: primero los que tienen nombre y precio válidos, luego por fecha (más reciente primero)
      items.sort((a, b) => {
        // Priorizar los que tienen datos válidos
        const aValid = a.nombre && a.nombre !== "" && a.precio > 0;
        const bValid = b.nombre && b.nombre !== "" && b.precio > 0;

        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;

        // Si ambos son válidos o inválidos, ordenar por fecha (más reciente primero)
        return b._creationTime - a._creationTime;
      });

      // Mantener el primero (mejor candidato), eliminar el resto
      kept.push(items[0]._id);

      for (let i = 1; i < items.length; i++) {
        await ctx.db.delete(items[i]._id);
        deleted++;
      }
    }

    return {
      deleted,
      kept: kept.length,
      message: `Eliminados ${deleted} combos duplicados. Mantenidos ${kept.length} únicos.`,
    };
  },
});

/**
 * Limpiar productos duplicados - mantiene el más reciente
 */
export const cleanupDuplicateProducts = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("inventarioComidasRapidas").collect();

    // Agrupar por nombre
    const byName: Record<string, typeof products> = {};
    for (const product of products) {
      const name = product.nombre;
      if (!byName[name]) byName[name] = [];
      byName[name].push(product);
    }

    let deleted = 0;
    const kept: string[] = [];

    for (const [_, items] of Object.entries(byName)) {
      if (items.length <= 1) {
        if (items[0]) kept.push(items[0]._id);
        continue;
      }

      // Ordenar por fecha (más reciente primero)
      items.sort((a, b) => b._creationTime - a._creationTime);

      // Mantener el primero, eliminar el resto
      kept.push(items[0]._id);

      for (let i = 1; i < items.length; i++) {
        await ctx.db.delete(items[i]._id);
        deleted++;
      }
    }

    return {
      deleted,
      kept: kept.length,
      message: `Eliminados ${deleted} productos duplicados. Mantenidos ${kept.length} únicos.`,
    };
  },
});

/**
 * Limpiar comboItems duplicados - mantiene el más reciente
 */
export const cleanupDuplicateComboItems = mutation({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("comboItems").collect();

    // Agrupar por comboKey + itemName
    const byKey: Record<string, typeof items> = {};
    for (const item of items) {
      const key = `${item.comboKey}::${item.itemName}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(item);
    }

    let deleted = 0;
    const kept: string[] = [];

    for (const [_, itemList] of Object.entries(byKey)) {
      if (itemList.length <= 1) {
        if (itemList[0]) kept.push(itemList[0]._id);
        continue;
      }

      // Ordenar por fecha (más reciente primero)
      itemList.sort((a, b) => b._creationTime - a._creationTime);

      // Mantener el primero, eliminar el resto
      kept.push(itemList[0]._id);

      for (let i = 1; i < itemList.length; i++) {
        await ctx.db.delete(itemList[i]._id);
        deleted++;
      }
    }

    return {
      deleted,
      kept: kept.length,
      message: `Eliminados ${deleted} comboItems duplicados. Mantenidos ${kept.length} únicos.`,
    };
  },
});

/**
 * Limpiar leads duplicados - mantiene el más reciente
 */
export const cleanupDuplicateLeads = mutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();

    // Agrupar por phone
    const byPhone: Record<string, typeof leads> = {};
    for (const lead of leads) {
      const phone = lead.phone;
      if (!byPhone[phone]) byPhone[phone] = [];
      byPhone[phone].push(lead);
    }

    let deleted = 0;
    const kept: string[] = [];

    for (const [_, items] of Object.entries(byPhone)) {
      if (items.length <= 1) {
        if (items[0]) kept.push(items[0]._id);
        continue;
      }

      // Ordenar: priorizar los que tienen más datos, luego por fecha
      items.sort((a, b) => {
        // Contar campos no vacíos
        const countFields = (obj: Record<string, unknown>) =>
          Object.values(obj).filter((v) => v !== null && v !== undefined && v !== "").length;

        const aFields = countFields(a as unknown as Record<string, unknown>);
        const bFields = countFields(b as unknown as Record<string, unknown>);

        if (aFields !== bFields) return bFields - aFields;

        // Si tienen la misma cantidad de campos, ordenar por fecha
        return b._creationTime - a._creationTime;
      });

      // Mantener el primero, eliminar el resto
      kept.push(items[0]._id);

      for (let i = 1; i < items.length; i++) {
        await ctx.db.delete(items[i]._id);
        deleted++;
      }
    }

    return {
      deleted,
      kept: kept.length,
      message: `Eliminados ${deleted} leads duplicados. Mantenidos ${kept.length} únicos.`,
    };
  },
});

/**
 * Ejecutar limpieza completa de todas las tablas
 */
export const cleanupAll = mutation({
  args: {},
  handler: async (ctx) => {
    // Nota: En Convex no podemos llamar otras mutations directamente,
    // así que duplicamos la lógica aquí para una limpieza completa.
    
    const results = {
      combos: { deleted: 0, kept: 0 },
      products: { deleted: 0, kept: 0 },
      comboItems: { deleted: 0, kept: 0 },
      leads: { deleted: 0, kept: 0 },
    };

    // --- Limpiar Combos ---
    const combos = await ctx.db.query("combos").collect();
    const combosByKey: Record<string, typeof combos> = {};
    for (const combo of combos) {
      const key = combo.comboKey;
      if (!combosByKey[key]) combosByKey[key] = [];
      combosByKey[key].push(combo);
    }

    for (const [_, items] of Object.entries(combosByKey)) {
      if (items.length <= 1) {
        results.combos.kept++;
        continue;
      }
      items.sort((a, b) => {
        const aValid = a.nombre && a.nombre !== "" && a.precio > 0;
        const bValid = b.nombre && b.nombre !== "" && b.precio > 0;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        return b._creationTime - a._creationTime;
      });
      results.combos.kept++;
      for (let i = 1; i < items.length; i++) {
        await ctx.db.delete(items[i]._id);
        results.combos.deleted++;
      }
    }

    // --- Limpiar Productos ---
    const products = await ctx.db.query("inventarioComidasRapidas").collect();
    const productsByName: Record<string, typeof products> = {};
    for (const product of products) {
      const name = product.nombre;
      if (!productsByName[name]) productsByName[name] = [];
      productsByName[name].push(product);
    }

    for (const [_, items] of Object.entries(productsByName)) {
      if (items.length <= 1) {
        results.products.kept++;
        continue;
      }
      items.sort((a, b) => b._creationTime - a._creationTime);
      results.products.kept++;
      for (let i = 1; i < items.length; i++) {
        await ctx.db.delete(items[i]._id);
        results.products.deleted++;
      }
    }

    // --- Limpiar ComboItems ---
    const comboItems = await ctx.db.query("comboItems").collect();
    const itemsByKey: Record<string, typeof comboItems> = {};
    for (const item of comboItems) {
      const key = `${item.comboKey}::${item.itemName}`;
      if (!itemsByKey[key]) itemsByKey[key] = [];
      itemsByKey[key].push(item);
    }

    for (const [_, items] of Object.entries(itemsByKey)) {
      if (items.length <= 1) {
        results.comboItems.kept++;
        continue;
      }
      items.sort((a, b) => b._creationTime - a._creationTime);
      results.comboItems.kept++;
      for (let i = 1; i < items.length; i++) {
        await ctx.db.delete(items[i]._id);
        results.comboItems.deleted++;
      }
    }

    // --- Limpiar Leads ---
    const leads = await ctx.db.query("leads").collect();
    const leadsByPhone: Record<string, typeof leads> = {};
    for (const lead of leads) {
      const phone = lead.phone;
      if (!leadsByPhone[phone]) leadsByPhone[phone] = [];
      leadsByPhone[phone].push(lead);
    }

    for (const [_, items] of Object.entries(leadsByPhone)) {
      if (items.length <= 1) {
        results.leads.kept++;
        continue;
      }
      items.sort((a, b) => b._creationTime - a._creationTime);
      results.leads.kept++;
      for (let i = 1; i < items.length; i++) {
        await ctx.db.delete(items[i]._id);
        results.leads.deleted++;
      }
    }

    return {
      ...results,
      summary: `Limpieza completada. Eliminados: ${results.combos.deleted} combos, ${results.products.deleted} productos, ${results.comboItems.deleted} comboItems, ${results.leads.deleted} leads.`,
    };
  },
});
