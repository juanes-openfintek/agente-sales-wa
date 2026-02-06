// ============================================================
// SCRIPT DE ADMINISTRACIÓN: RESET DE CONVERSACIONES
// ============================================================
// Este script resetea las conversaciones de prueba manteniendo
// la información básica de los leads (nombre, email, teléfono)

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ConversationState } from "../lib/types";

// Mutation para resetear todas las conversaciones
export const resetAllConversations = mutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    
    let resetCount = 0;
    
    for (const lead of leads) {
      await ctx.db.patch(lead._id, {
        // Resetear estado a inicio
        status: ConversationState.COLLECTING_INFO,
        
        // Limpiar datos de pedido
        orderItems: undefined,
        orderTotal: undefined,
        paymentMethod: undefined,
        cedula: undefined,
        completedMessageSent: undefined,
        deliveryTime: undefined,
        
        // Mantener información básica:
        // - name
        // - email
        // - phone
        // - city
        // - address
        // - notifyPreference
        
        // Actualizar timestamp
        updatedAt: Date.now(),
      });
      
      resetCount++;
    }
    
    // Opcional: También podemos limpiar los eventos viejos
    // (descomenta si quieres borrar el historial de mensajes)
    /*
    const events = await ctx.db.query("events").collect();
    let eventsDeleted = 0;
    for (const event of events) {
      await ctx.db.delete(event._id);
      eventsDeleted++;
    }
    */
    
    return {
      success: true,
      leadsReset: resetCount,
      message: `✅ ${resetCount} conversaciones reseteadas exitosamente`,
    };
  },
});

// Mutation para resetear una conversación específica por teléfono
export const resetConversationByPhone = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
    
    if (!lead) {
      return {
        success: false,
        message: `❌ No se encontró lead con teléfono ${args.phone}`,
      };
    }
    
    await ctx.db.patch(lead._id, {
      status: ConversationState.COLLECTING_INFO,
      orderItems: undefined,
      orderTotal: undefined,
      paymentMethod: undefined,
      cedula: undefined,
      completedMessageSent: undefined,
      deliveryTime: undefined,
      updatedAt: Date.now(),
    });
    
    return {
      success: true,
      message: `✅ Conversación de ${lead.name || args.phone} reseteada`,
    };
  },
});

// Mutation para limpiar TODOS los eventos (historial de chat)
export const clearAllEvents = mutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    
    let deletedCount = 0;
    for (const event of events) {
      await ctx.db.delete(event._id);
      deletedCount++;
    }
    
    return {
      success: true,
      eventsDeleted: deletedCount,
      message: `✅ ${deletedCount} eventos eliminados`,
    };
  },
});

// Mutation para ver el estado actual de todas las conversaciones
export const getConversationsStatus = mutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    
    const summary = leads.map((lead) => ({
      phone: lead.phone,
      name: lead.name || "Sin nombre",
      status: lead.status,
      hasOrder: !!lead.orderItems,
      orderTotal: lead.orderTotal || 0,
    }));
    
    return {
      total: leads.length,
      conversations: summary,
    };
  },
});
