import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// ============ HEALTH CHECK ============

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok", message: "Convex HTTP Actions working!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ============ LEADS ENDPOINTS ============

// GET /leads/:phone - Obtener lead por teléfono
http.route({
  path: "/leads",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const phone = url.searchParams.get("phone");

    if (phone) {
      const lead = await ctx.runQuery(api.leads.getByPhone, { phone });
      return new Response(JSON.stringify(lead), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const leads = await ctx.runQuery(api.leads.getAll, {});
      return new Response(JSON.stringify(leads), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// POST /leads - Crear o actualizar lead
http.route({
  path: "/leads",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const result = await ctx.runMutation(api.leads.upsert, body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /leads/active - Obtener conversaciones activas
http.route({
  path: "/leads/active",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const leads = await ctx.runQuery(api.leads.getActiveConversations, {});
    return new Response(JSON.stringify(leads), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ============ EVENTS ENDPOINTS ============

// GET /events - Obtener historial de eventos
http.route({
  path: "/events",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const phone = url.searchParams.get("phone");
    const limit = parseInt(url.searchParams.get("limit") || "20");

    if (!phone) {
      return new Response(JSON.stringify({ error: "phone is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const events = await ctx.runQuery(api.events.getHistory, { phone, limit });
    return new Response(JSON.stringify(events), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /events - Guardar nuevo evento
http.route({
  path: "/events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const result = await ctx.runMutation(api.events.save, body);
    return new Response(JSON.stringify({ id: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /events/count - Contar mensajes entrantes
http.route({
  path: "/events/count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const phone = url.searchParams.get("phone");

    if (!phone) {
      return new Response(JSON.stringify({ error: "phone is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const count = await ctx.runQuery(api.events.countIncomingMessages, {
      phone,
    });
    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ============ CATALOG ENDPOINTS ============

// GET /catalog - Obtener catálogo completo
http.route({
  path: "/catalog",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const catalog = await ctx.runQuery(api.catalog.getFullCatalog, {});
    return new Response(JSON.stringify(catalog), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /products - Obtener productos
http.route({
  path: "/products",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const products = await ctx.runQuery(api.catalog.getAllProducts, {});
    return new Response(JSON.stringify(products), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /combos - Obtener combos
http.route({
  path: "/combos",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const comboKey = url.searchParams.get("comboKey");

    if (comboKey) {
      const combo = await ctx.runQuery(api.catalog.getComboByKey, { comboKey });
      const items = await ctx.runQuery(api.catalog.getComboItems, { comboKey });
      return new Response(JSON.stringify({ ...combo, items }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const combos = await ctx.runQuery(api.catalog.getAllCombos, {});
      return new Response(JSON.stringify(combos), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ============ WHATSAPP WEBHOOK - STATE MACHINE ============

// POST /webhook/message - Procesar mensaje de WhatsApp (nuevo endpoint directo)
http.route({
  path: "/webhook/message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { phone, text, hasImage, pushName } = body;

      if (!phone) {
        return new Response(JSON.stringify({ error: "phone is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Llamar al state machine
      const result = await ctx.runAction(
        internal.conversation.handleMessage.processMessage,
        {
          phone,
          text: text || "",
          hasImage: hasImage || false,
          pushName: pushName || null,
        }
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error processing message:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error", details: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// POST /webhook - Compatibilidad con formato Evolution API (legacy)
http.route({
  path: "/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const raw = await request.json();

      // Validar evento
      const event = raw.event;
      if (event && event !== "messages.upsert") {
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Extraer datos del mensaje (formato Evolution API)
      const data = Array.isArray(raw.data) ? raw.data[0] : raw.data;
      if (!data) {
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const keyObj = data.key || {};
      if (keyObj.fromMe) {
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Extraer teléfono
      const remoteJid = keyObj.remoteJid || "";
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");

      // Extraer mensaje
      const msgObj = data.message || {};
      const text =
        msgObj.conversation ||
        msgObj.extendedTextMessage?.text ||
        msgObj.imageMessage?.caption ||
        "";
      const hasImage = !!msgObj.imageMessage;
      const pushName = data.pushName || null;

      if (!phone || (!text && !hasImage)) {
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Llamar al state machine
      const result = await ctx.runAction(
        internal.conversation.handleMessage.processMessage,
        {
          phone,
          text,
          hasImage,
          pushName,
        }
      );

      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response(
        JSON.stringify({ ok: false, error: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// GET /leads/all - Obtener todos los leads (para test-ui)
http.route({
  path: "/leads/all",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const leads = await ctx.runQuery(internal.conversation.handleMessage.getAllLeads);
      return new Response(JSON.stringify(leads), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error getting leads:", error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// GET /history/:phone - Obtener historial de conversación (para test-ui)
http.route({
  path: "/history/:phone",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const phone = url.pathname.split("/").pop() || "";
      const limit = parseInt(url.searchParams.get("limit") || "50");

      const events = await ctx.runQuery(
        internal.conversation.handleMessage.getConversationHistory,
        { phone, limit }
      );

      return new Response(JSON.stringify(events), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error getting history:", error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// POST /reset/:phone - Resetear conversación (para test-ui)
http.route({
  path: "/reset/:phone",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const phone = url.pathname.split("/").pop() || "";

      await ctx.runMutation(
        internal.conversation.handleMessage.upsertLead,
        {
          phone,
          status: "collecting_info",
          orderItems: undefined,
          orderTotal: undefined,
          paymentMethod: undefined,
          cedula: undefined,
          completedMessageSent: undefined,
          deliveryTime: undefined,
        }
      );

      return new Response(
        JSON.stringify({ success: true, message: `Conversación de ${phone} reseteada` }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Error resetting conversation:", error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

export default http;
