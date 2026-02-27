// ============================================================
// STATE MACHINE - HANDLER PRINCIPAL DE MENSAJES
// ============================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  ConversationState,
  ConversationStateType,
  PAYMENT_METHODS,
  VALID_CITIES,
  type StateMachineResponse,
  type LeadInfo,
} from "../lib/types";
import {
  validateName,
  validateCedula,
  extractCedulaFromText,
  isOrderIntent,
  isNewOrderRequest,
  isModificationRequest,
  hasDeliveryInfo,
  mergeDeliveryInfo,
  isLikelyNotAName,
} from "../lib/validation";
import {
  formatWhatsAppMessage,
  formatWelcomeMessage,
  formatNameCaptured,
  formatAskNameAgain,
  formatNameWithOrderIntent,
  formatMissingFieldsPrompt,
  formatCedulaRequest,
  formatCedulaInvalid,
  formatOrderConfirmation,
  formatPaymentMethods,
  formatTransferProofRequest,
  formatPaymentCompletedTransfer,
  formatPaymentCompletedCash,
  formatOrderCancelled,
  formatCityNotAvailable,
  formatAskConfirmationAgain,
  formatOrderAlreadyCompleted,
  formatNewOrderPrompt,
  formatReturningCustomerGreeting,
  formatModificationPrompt,
  formatValidationError,
  formatStoreSelectionMessage,
  formatStoreNotRecognized,
  formatShirtWelcome,
  formatShirtMissingFieldsPrompt,
  formatShirtShippingInfo,
} from "../lib/messages";
import { extractNameWithAI, generateSalesResponse, generateShirtSalesResponse } from "../lib/ai";

// ============================================================
// INTERNAL QUERIES
// ============================================================

export const getLeadByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

export const getAllLeads = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("leads").collect();
  },
});

export const countIncomingMessages = internalQuery({
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

export const getConversationHistory = internalQuery({
  args: { phone: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc")
      .take(args.limit || 10);
    return events.reverse().map((e) => ({
      direction: e.direction,
      text: e.text,
    }));
  },
});

export const getCamisetasCatalog = internalQuery({
  args: {},
  handler: async (ctx) => {
    const camisetas = await ctx.db.query("camisetas").collect();
    const activas = camisetas.filter((c) => c.activo !== false);

    if (activas.length === 0) return "No hay camisetas disponibles en este momento.";

    const COLORES = [
      "Blanco", "Negro", "Gris", "Amarillo", "Vainilla", "Nude", "Mocca",
      "Rojo", "Azul Navy", "Azul Rey", "Azul Medio", "Verde Militar",
      "Verde Cali", "Rosa", "Lila", "Petróleo", "Vinotinto", "Mostaza", "Terracota",
    ];

    let catalog = "CAMISETAS PIEL DE DURAZNO:\n\n";
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
      catalog += `   Tallas: ${tallasArr.join(", ")}\n\n`;
    }

    catalog += `🎨 *COLORES (aplican para todos los tipos)*:\n${COLORES.join(", ")}\n`;
    return catalog;
  },
});

export const getCatalog = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("inventarioComidasRapidas").collect();
    const combos = await ctx.db.query("combos").collect();

    let catalog = "PRODUCTOS INDIVIDUALES (carnes crudas por kilo o unidad):\n";
    for (const p of products) {
      if (p.disponible !== false) {
        const desc = p.descripcion ? ` - ${p.descripcion}` : "";
        catalog += `• ${p.nombre} - $${p.precio.toLocaleString()}${desc}\n`;
      }
    }

    catalog += "\nCOMBOS (incluyen items gratis marcados con 🎁):\n";
    for (const c of combos) {
      if (c.disponible !== false) {
        catalog += `\n📦 ${c.nombre} - $${c.precio.toLocaleString()}`;
        if (c.descripcion) catalog += ` - ${c.descripcion}`;
        catalog += "\n";

        // Obtener items del combo
        const items = await ctx.db
          .query("comboItems")
          .withIndex("by_combo_key", (q) => q.eq("comboKey", c.comboKey))
          .collect();

        for (const item of items) {
          const qty = item.cantidad ?? item.qty ?? 1;
          if (item.isFree) {
            catalog += `  🎁 ${item.itemName} x${qty} - GRATIS\n`;
          } else {
            catalog += `  - ${item.itemName} x${qty}\n`;
          }
        }
      }
    }

    return catalog;
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================

export const upsertLead = internalMutation({
  args: {
    phone: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    cedula: v.optional(v.string()),
    status: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    orderItems: v.optional(v.string()),
    orderTotal: v.optional(v.number()),
    completedMessageSent: v.optional(v.boolean()),
    notifyPreference: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    storeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { phone, ...updates } = args;
    const now = Date.now();

    const existingLead = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();

    // Filtrar undefined
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (existingLead) {
      await ctx.db.patch(existingLead._id, {
        ...filteredUpdates,
        lastCustomerMessageAt: now,
        updatedAt: now,
      });
      return existingLead._id;
    } else {
      return await ctx.db.insert("leads", {
        phone,
        status: updates.status || ConversationState.COLLECTING_INFO,
        ...filteredUpdates,
        lastCustomerMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const saveEvent = internalMutation({
  args: {
    phone: v.string(),
    direction: v.string(),
    text: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      phone: args.phone,
      direction: args.direction,
      text: args.text,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

// ============================================================
// MAIN ACTION - PROCESS MESSAGE
// ============================================================

export const processMessage = internalAction({
  args: {
    phone: v.string(),
    text: v.string(),
    hasImage: v.optional(v.boolean()),
    pushName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<StateMachineResponse> => {
    const { phone, text, hasImage, pushName } = args;

    // Obtener API keys de IA (Gemini primario, Groq como fallback)
    // Configurar con: npx convex env set GEMINI_API_KEY ... / npx convex env set GROQ_API_KEY ...
    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    const groqApiKey = process.env.GROQ_API_KEY || "";

    // Guardar evento entrante
    await ctx.runMutation(internal.conversation.handleMessage.saveEvent, {
      phone,
      direction: "in",
      text: text || "[imagen]",
    });

    // Obtener info del lead
    const lead = await ctx.runQuery(internal.conversation.handleMessage.getLeadByPhone, { phone });

    const leadInfo: LeadInfo = lead
      ? {
          phone: lead.phone,
          name: lead.name,
          email: lead.email,
          address: lead.address,
          city: lead.city,
          cedula: lead.cedula,
          status: (lead.status as ConversationStateType) || ConversationState.SELECTING_STORE,
          paymentMethod: lead.paymentMethod,
          orderItems: lead.orderItems,
          orderTotal: lead.orderTotal,
          completedMessageSent: lead.completedMessageSent,
          notifyPreference: lead.notifyPreference,
          storeType: lead.storeType,
        }
      : {
          phone,
          status: ConversationState.SELECTING_STORE,
        };

    let currentState = leadInfo.status;
    let reply = "";
    let action = "none";
    const storeType = leadInfo.storeType || "";

    // Auto-transiciones
    if (currentState === ConversationState.COLLECTING_INFO && leadInfo.name) {
      currentState = ConversationState.BROWSING;
      await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
        phone,
        status: ConversationState.BROWSING,
      });
    }

    if (currentState === ConversationState.COLLECTING_DELIVERY_INFO && hasDeliveryInfo(leadInfo)) {
      currentState = ConversationState.CONFIRMING_ORDER;
      await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
        phone,
        status: ConversationState.CONFIRMING_ORDER,
      });
    }

    // ============================================================
    // ESTADO: SELECTING_STORE (Elegir entre carnes o camisetas)
    // ============================================================
    if (currentState === ConversationState.SELECTING_STORE || (!leadInfo.name && !storeType)) {
      const messageCount = await ctx.runQuery(
        internal.conversation.handleMessage.countIncomingMessages,
        { phone }
      );

      if (messageCount <= 1) {
        // Primer mensaje — preguntar qué tienda
        reply = formatWhatsAppMessage(formatStoreSelectionMessage());
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          status: ConversationState.SELECTING_STORE,
        });
      } else {
        const textLower = text.toLowerCase();
        const wantsCarnes = ["carne", "carnes", "1"].some((k) => textLower.includes(k));
        const wantsCamisetas = ["camiseta", "camisetas", "ropa", "camisa", "playera", "2"].some((k) => textLower.includes(k));

        if (wantsCarnes) {
          await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
            phone,
            storeType: "carnes",
            status: ConversationState.COLLECTING_INFO,
          });
          reply = formatWhatsAppMessage(formatWelcomeMessage());
          currentState = ConversationState.COLLECTING_INFO;
        } else if (wantsCamisetas) {
          await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
            phone,
            storeType: "camisetas",
            status: ConversationState.COLLECTING_INFO,
          });
          reply = formatWhatsAppMessage(formatShirtWelcome());
          currentState = ConversationState.COLLECTING_INFO;
        } else {
          reply = formatWhatsAppMessage(formatStoreNotRecognized());
        }
      }
    }

    // ============================================================
    // ESTADO: COLLECTING_INFO (Recolectando nombre)
    // ============================================================
    else if (currentState === ConversationState.COLLECTING_INFO || !leadInfo.name) {
      const messageCount = await ctx.runQuery(
        internal.conversation.handleMessage.countIncomingMessages,
        { phone }
      );

      if (messageCount <= 1) {
        // No debería pasar (el primer mensaje lo maneja SELECTING_STORE), pero por seguridad
        reply = formatWhatsAppMessage(formatStoreSelectionMessage());
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          status: ConversationState.SELECTING_STORE,
        });
      } else if (isOrderIntent(text)) {
        // Quiere pedir pero no dio nombre
        reply = formatWhatsAppMessage(formatNameWithOrderIntent());
      } else {
        // Intentar extraer nombre con IA
        let extractedName: string | null = null;

        if (geminiApiKey || groqApiKey) {
          extractedName = await extractNameWithAI(text, geminiApiKey, groqApiKey);
        }

        // Fallback a validación simple si no hay IA
        if (!extractedName && !isLikelyNotAName(text)) {
          const cleanText = text.trim();
          const validation = validateName(cleanText);
          if (validation.isValid && cleanText.split(" ").length <= 4) {
            extractedName = cleanText;
          }
        }

        if (extractedName) {
          await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
            phone,
            name: extractedName,
            status: ConversationState.BROWSING,
          });
          reply = formatWhatsAppMessage(formatNameCaptured(extractedName));
          currentState = ConversationState.BROWSING;
        } else {
          reply = formatWhatsAppMessage(formatAskNameAgain());
        }
      }
    }

    // ============================================================
    // ESTADO: BROWSING (Navegando catálogo)
    // ============================================================
    else if (currentState === ConversationState.BROWSING) {
      // Intentar extraer datos de envío mientras navega
      if (!hasDeliveryInfo(leadInfo)) {
        const merged = mergeDeliveryInfo(text, leadInfo);
        if (merged.city || merged.address || merged.email) {
          await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
            phone,
            city: merged.city,
            address: merged.address,
            email: merged.email,
          });
          Object.assign(leadInfo, merged);
        }
      }

      // Usar IA para generar respuesta de ventas (Gemini primario, Groq como fallback)
      if (geminiApiKey || groqApiKey) {
        // Cargar catálogo según la tienda elegida
        const catalog = storeType === "camisetas"
          ? await ctx.runQuery(internal.conversation.handleMessage.getCamisetasCatalog, {})
          : await ctx.runQuery(internal.conversation.handleMessage.getCatalog, {});

        const history = await ctx.runQuery(
          internal.conversation.handleMessage.getConversationHistory,
          { phone, limit: 10 }
        );

        // Llamar al agente de IA correspondiente
        const aiResponse = storeType === "camisetas"
          ? await generateShirtSalesResponse(text, leadInfo, catalog, history, geminiApiKey, groqApiKey)
          : await generateSalesResponse(text, leadInfo, catalog, history, geminiApiKey, groqApiKey);

        reply = formatWhatsAppMessage(aiResponse.reply);
        action = aiResponse.action;

        // Si la IA detecta checkout, guardar items y cambiar estado
        if (aiResponse.action === "ready_for_checkout") {
          const orderItemsJson = aiResponse.orderItems
            ? JSON.stringify(aiResponse.orderItems)
            : undefined;

          await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
            phone,
            orderItems: orderItemsJson,
            orderTotal: aiResponse.totalPrice,
          });

          if (hasDeliveryInfo(leadInfo)) {
            await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
              phone,
              status: ConversationState.CONFIRMING_ORDER,
            });
            currentState = ConversationState.CONFIRMING_ORDER;
          } else {
            await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
              phone,
              status: ConversationState.COLLECTING_DELIVERY_INFO,
            });
            const { prompt } = formatMissingFieldsPrompt(leadInfo);
            reply = formatWhatsAppMessage(`${aiResponse.reply}\n\n${prompt}`);
            currentState = ConversationState.COLLECTING_DELIVERY_INFO;
          }
        }
      } else {
        // Fallback sin IA
        const checkoutKeywords = ["pedir", "ordenar", "confirmar", "listo", "eso es todo"];
        const wantsCheckout = checkoutKeywords.some(k => text.toLowerCase().includes(k));

        if (wantsCheckout) {
          if (hasDeliveryInfo(leadInfo)) {
            await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
              phone,
              status: ConversationState.CONFIRMING_ORDER,
            });
            reply = formatWhatsAppMessage(formatOrderConfirmation("Tu pedido está siendo procesado..."));
            currentState = ConversationState.CONFIRMING_ORDER;
          } else {
            await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
              phone,
              status: ConversationState.COLLECTING_DELIVERY_INFO,
            });
            const { prompt } = formatMissingFieldsPrompt(leadInfo);
            reply = formatWhatsAppMessage(`Perfecto, tomé tu pedido.\n\n${prompt}`);
            currentState = ConversationState.COLLECTING_DELIVERY_INFO;
          }
        } else {
          reply = formatWhatsAppMessage(
            `Gracias por tu mensaje, ${leadInfo.name || ""}. Estoy procesando tu solicitud.\n\nCuando estés listo para ordenar, dime "quiero pedir".`
          );
        }
      }
    }

    // ============================================================
    // ESTADO: COLLECTING_DELIVERY_INFO
    // ============================================================
    else if (currentState === ConversationState.COLLECTING_DELIVERY_INFO) {
      const merged = mergeDeliveryInfo(text, leadInfo);

      await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
        phone,
        city: merged.city,
        address: merged.address,
        email: merged.email,
      });

      Object.assign(leadInfo, merged);

      if (hasDeliveryInfo(leadInfo)) {
        if (storeType === "camisetas") {
          // Camisetas: cualquier ciudad es válida, agregar info de envío
          const shippingInfo = formatShirtShippingInfo(leadInfo.city || "");
          await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
            phone,
            status: ConversationState.CONFIRMING_ORDER,
          });
          reply = formatWhatsAppMessage(formatOrderConfirmation(`Tu pedido está listo para confirmar.\n\n${shippingInfo}`));
          currentState = ConversationState.CONFIRMING_ORDER;
        } else {
          // Carnes: validar que la ciudad sea Bogotá o Cali
          const cityLower = (leadInfo.city || "").toLowerCase();
          if (!VALID_CITIES.includes(cityLower)) {
            reply = formatWhatsAppMessage(formatCityNotAvailable(leadInfo.city || ""));
            await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
              phone,
              status: ConversationState.BROWSING,
            });
            currentState = ConversationState.BROWSING;
          } else {
            await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
              phone,
              status: ConversationState.CONFIRMING_ORDER,
              deliveryTime: "24 horas",
            });
            reply = formatWhatsAppMessage(formatOrderConfirmation("Tu pedido está listo para confirmar."));
            currentState = ConversationState.CONFIRMING_ORDER;
          }
        }
      } else {
        const { prompt } = storeType === "camisetas"
          ? formatShirtMissingFieldsPrompt(leadInfo)
          : formatMissingFieldsPrompt(leadInfo);
        reply = formatWhatsAppMessage(prompt);
      }
    }

    // ============================================================
    // ESTADO: CONFIRMING_ORDER
    // ============================================================
    else if (currentState === ConversationState.CONFIRMING_ORDER) {
      const textLower = text.toLowerCase();

      if (["si", "sí", "confirmar", "confirmo"].some(x => textLower.includes(x))) {
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          status: ConversationState.COLLECTING_CEDULA,
        });
        reply = formatWhatsAppMessage(formatCedulaRequest());
        currentState = ConversationState.COLLECTING_CEDULA;
      } else if (["no", "cancelar"].some(x => textLower.includes(x))) {
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          status: ConversationState.BROWSING,
        });
        reply = formatWhatsAppMessage(formatOrderCancelled());
        currentState = ConversationState.BROWSING;
      } else if (isModificationRequest(text)) {
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          status: ConversationState.BROWSING,
        });
        reply = formatWhatsAppMessage(formatModificationPrompt());
        currentState = ConversationState.BROWSING;
      } else {
        reply = formatWhatsAppMessage(formatAskConfirmationAgain());
      }
    }

    // ============================================================
    // ESTADO: COLLECTING_CEDULA
    // ============================================================
    else if (currentState === ConversationState.COLLECTING_CEDULA) {
      const cedula = extractCedulaFromText(text);

      if (cedula) {
        const validation = validateCedula(cedula);
        if (validation.isValid) {
          await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
            phone,
            cedula,
            status: ConversationState.PAYMENT_METHOD,
          });
          reply = formatWhatsAppMessage(formatPaymentMethods());
          currentState = ConversationState.PAYMENT_METHOD;
        } else {
          reply = formatWhatsAppMessage(formatValidationError("cédula", validation.error));
        }
      } else {
        reply = formatWhatsAppMessage(formatCedulaInvalid());
      }
    }

    // ============================================================
    // ESTADO: PAYMENT_METHOD
    // ============================================================
    else if (currentState === ConversationState.PAYMENT_METHOD) {
      const textLower = text.toLowerCase().trim();
      let paymentMethod: string | undefined;

      for (const [key, method] of Object.entries(PAYMENT_METHODS)) {
        if (textLower === key || textLower.includes(key)) {
          paymentMethod = method;
          break;
        }
      }

      if (!paymentMethod) {
        reply = formatWhatsAppMessage(formatPaymentMethods());
      } else if (paymentMethod === "Contra entrega") {
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          paymentMethod,
          status: ConversationState.PAYMENT_COMPLETED,
        });
        reply = formatWhatsAppMessage(formatPaymentCompletedCash());
        currentState = ConversationState.PAYMENT_COMPLETED;
        action = "order_completed";
      } else {
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          paymentMethod,
          status: ConversationState.WAITING_TRANSFER_PROOF,
        });
        reply = formatWhatsAppMessage(formatTransferProofRequest(paymentMethod));
        currentState = ConversationState.WAITING_TRANSFER_PROOF;
      }
    }

    // ============================================================
    // ESTADO: WAITING_TRANSFER_PROOF
    // ============================================================
    else if (currentState === ConversationState.WAITING_TRANSFER_PROOF) {
      const proofKeywords = ["envié", "enviado", "listo", "ya pagué", "ya pague"];
      const hasProof = hasImage || proofKeywords.some(k => text.toLowerCase().includes(k));

      if (hasProof) {
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          status: ConversationState.PAYMENT_COMPLETED,
        });
        reply = formatWhatsAppMessage(formatPaymentCompletedTransfer());
        currentState = ConversationState.PAYMENT_COMPLETED;
        action = "order_completed";
      } else {
        reply = formatWhatsAppMessage(
          "Por favor, envía el comprobante de tu transferencia como imagen para confirmar tu pedido."
        );
      }
    }

    // ============================================================
    // ESTADO: PAYMENT_COMPLETED
    // ============================================================
    else if (currentState === ConversationState.PAYMENT_COMPLETED) {
      if (isNewOrderRequest(text)) {
        // Siempre volver a preguntar la tienda (preguntar siempre = true)
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          status: ConversationState.SELECTING_STORE,
          storeType: undefined,
          paymentMethod: undefined,
          orderItems: undefined,
          orderTotal: undefined,
          completedMessageSent: undefined,
        });

        reply = formatWhatsAppMessage(formatStoreSelectionMessage());
        currentState = ConversationState.SELECTING_STORE;
      } else if (!leadInfo.completedMessageSent) {
        await ctx.runMutation(internal.conversation.handleMessage.upsertLead, {
          phone,
          completedMessageSent: true,
        });
        reply = formatWhatsAppMessage(formatOrderAlreadyCompleted());
      } else {
        // Pedido ya completado y mensaje enviado - responder con mensaje de seguimiento
        reply = formatWhatsAppMessage(
          `Hola ${leadInfo.name || ""}! Tu pedido ya está en proceso de entrega. 🚚\n\nSi tienes alguna duda sobre tu pedido contáctanos directamente.\n\nSi deseas hacer un *nuevo pedido*, solo dime "quiero hacer otro pedido" 😊`
        );
      }
    }

    // ============================================================
    // FALLBACK
    // ============================================================
    if (!reply && currentState !== ConversationState.PAYMENT_COMPLETED && currentState !== ConversationState.SELECTING_STORE) {
      reply = formatWhatsAppMessage(
        "Lo siento, no entendí tu mensaje. ¿Podrías repetirlo de otra forma?"
      );
    }

    // Guardar evento de salida
    if (reply) {
      await ctx.runMutation(internal.conversation.handleMessage.saveEvent, {
        phone,
        direction: "out",
        text: reply,
        metadata: { action },
      });
    }

    return {
      reply,
      imageUrl: null,
      action,
      newStatus: currentState,
    };
  },
});
