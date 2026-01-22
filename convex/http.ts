import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

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

export default http;
