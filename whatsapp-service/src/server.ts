import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { whatsappClient, IncomingMessage } from "./cloud-api.js";
import { convexClient } from "./convex-client.js";
import { webhookRouter, setMessageHandler } from "./webhook.js";

const app = express();

// Configurar CORS para permitir peticiones desde el test-ui
app.use(cors({
  origin: "*", // En producción, especificar dominios permitidos
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}));

// JSON parser con captura de raw body (para verificación de firma del webhook)
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));

// Montar rutas del webhook de Meta (GET /webhook y POST /webhook)
app.use(webhookRouter);

// ==================== PÁGINA DE STATUS ====================

app.get("/", (req: Request, res: Response) => {
  const state = whatsappClient.getState();

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Cloud API - Agente Sales</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 32px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { margin: 0 0 8px; color: #1a1a2e; }
        .subtitle { color: #888; margin: 0 0 24px; font-size: 14px; }
        .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 500;
            margin-bottom: 16px;
        }
        .status.ok { background: #d4edda; color: #155724; }
        .status.err { background: #f8d7da; color: #721c24; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .ok .dot { background: #28a745; }
        .err .dot { background: #dc3545; }
        .info { margin: 12px 0; color: #555; font-size: 14px; }
        .info strong { color: #333; }
        code {
            background: #f1f3f5;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
            word-break: break-all;
        }
        .error-text { color: #dc3545; }
    </style>
</head>
<body>
    <div class="card">
        <h1>WhatsApp Cloud API</h1>
        <p class="subtitle">Agente Sales - Meta Business API</p>

        <div class="status ${state.isConnected ? 'ok' : 'err'}">
            <span class="dot"></span>
            ${state.isConnected ? 'Conectado' : 'Desconectado'}
        </div>

        ${state.phoneNumber ? `<p class="info">Teléfono: <strong>${state.phoneNumber}</strong></p>` : ''}
        ${state.lastError ? `<p class="info error-text">Error: ${state.lastError}</p>` : ''}

        <p class="info">Webhook URL: <code>${req.protocol}://${req.get('host')}/webhook</code></p>
        <p class="info" style="color: #888; font-size: 12px; margin-top: 20px;">
            Configura esta URL en Meta Business Manager &gt; WhatsApp &gt; Configuración &gt; Webhook
        </p>
    </div>
</body>
</html>
  `;

  res.send(html);
});

// ==================== API REST ====================

// Estado de la conexión
app.get("/api/status", (req: Request, res: Response) => {
  res.json(whatsappClient.getState());
});

// Enviar mensaje de texto
app.post("/api/send/text", async (req: Request, res: Response) => {
  const { phone, text } = req.body;

  if (!phone || !text) {
    res.status(400).json({ success: false, error: "phone y text son requeridos" });
    return;
  }

  const success = await whatsappClient.sendText(phone, text);
  res.json({ success });
});

// Enviar imagen
app.post("/api/send/image", async (req: Request, res: Response) => {
  const { phone, imageUrl, caption } = req.body;

  if (!phone || !imageUrl) {
    res.status(400).json({ success: false, error: "phone e imageUrl son requeridos" });
    return;
  }

  const success = await whatsappClient.sendImage(phone, imageUrl, caption);
  res.json({ success });
});

// Enviar botones interactivos
app.post("/api/send/buttons", async (req: Request, res: Response) => {
  const { phone, body: bodyText, buttons, header, footer } = req.body;

  if (!phone || !bodyText || !buttons) {
    res.status(400).json({ success: false, error: "phone, body y buttons son requeridos" });
    return;
  }

  const success = await whatsappClient.sendButtons(phone, bodyText, buttons, header, footer);
  res.json({ success });
});

// Enviar lista interactiva
app.post("/api/send/list", async (req: Request, res: Response) => {
  const { phone, body: bodyText, buttonText, sections, header, footer } = req.body;

  if (!phone || !bodyText || !sections) {
    res.status(400).json({ success: false, error: "phone, body y sections son requeridos" });
    return;
  }

  const success = await whatsappClient.sendList(phone, bodyText, buttonText, sections, header, footer);
  res.json({ success });
});

// Enviar presencia (no-op en Cloud API)
app.post("/api/presence", async (req: Request, res: Response) => {
  const { phone, presence } = req.body;

  if (!phone) {
    res.status(400).json({ success: false, error: "phone es requerido" });
    return;
  }

  const success = await whatsappClient.sendPresence(phone, presence || "composing");
  res.json({ success });
});

// Health check
app.get("/api/health", async (req: Request, res: Response) => {
  const waState = whatsappClient.getState();
  const convexOk = await convexClient.health();

  res.json({
    status: "ok",
    whatsapp: {
      connected: waState.isConnected,
      phone: waState.phoneNumber,
    },
    convex: {
      connected: convexOk,
    },
  });
});

// ==================== COMPATIBILIDAD CON EVOLUTION API ====================
// Estos endpoints mantienen compatibilidad con el backend Python existente

// Enviar texto (formato Evolution API)
app.post("/message/sendText/:instance", async (req: Request, res: Response) => {
  const { number, text } = req.body;

  if (!number || !text) {
    res.status(400).json({ error: "number y text son requeridos" });
    return;
  }

  const success = await whatsappClient.sendText(number, text);
  res.json({ success, key: { id: Date.now().toString() } });
});

// Enviar media (formato Evolution API)
app.post("/message/sendMedia/:instance", async (req: Request, res: Response) => {
  const { number, media, caption } = req.body;

  if (!number || !media) {
    res.status(400).json({ error: "number y media son requeridos" });
    return;
  }

  const success = await whatsappClient.sendImage(number, media, caption);
  res.json({ success, key: { id: Date.now().toString() } });
});

// Enviar presencia (formato Evolution API)
app.post("/chat/sendPresence/:instance", async (req: Request, res: Response) => {
  const { number, presence } = req.body;

  if (!number) {
    res.status(400).json({ error: "number es requerido" });
    return;
  }

  const success = await whatsappClient.sendPresence(number, presence || "composing");
  res.json({ success });
});

// ==================== TEST UI ENDPOINTS ====================
// Endpoints para el test-ui (simulador de WhatsApp)

// Endpoint de salud simplificado para test-ui
app.get("/health", async (req: Request, res: Response) => {
  const waState = whatsappClient.getState();
  res.json({
    status: "ok",
    connected: waState.isConnected,
    phone: waState.phoneNumber,
  });
});

// Simular webhook de WhatsApp para testing
app.post("/test-webhook", async (req: Request, res: Response) => {
  const { phone, text, has_image, image_data } = req.body;

  if (!phone) {
    res.status(400).json({ error: "phone es requerido" });
    return;
  }

  try {
    // Llamar a Convex para procesar el mensaje
    const response = await convexClient.processMessage({
      messageId: `test-${Date.now()}`,
      phone,
      jid: phone,
      text: text || "",
      imageUrl: image_data || null,
      timestamp: Date.now() / 1000,
      pushName: null,
    });

    if (!response) {
      return res.status(500).json({ error: "No se recibió respuesta de Convex" });
    }

    res.json({
      success: true,
      reply: response.reply || "",
      new_status: response.newStatus || "unknown",
      action: response.action || "none",
    });
  } catch (error) {
    console.error("Error en test-webhook:", error);
    res.status(500).json({ error: "Error procesando mensaje" });
  }
});

// Obtener conversaciones de prueba
app.get("/test-conversations", async (req: Request, res: Response) => {
  try {
    // Obtener todos los leads de Convex
    const leads = await convexClient.getAllLeads();

    // Filtrar solo los de prueba (teléfonos que empiezan con test, demo, etc.)
    const testLeads = leads.filter((lead: any) => {
      const phone = lead.phone.toLowerCase();
      return (
        phone.startsWith("test") ||
        phone.startsWith("demo") ||
        phone.startsWith("prueba") ||
        phone.startsWith("dev") ||
        phone.startsWith("qa") ||
        phone.endsWith("999") ||
        phone.endsWith("888") ||
        phone.endsWith("777") ||
        phone.length < 7
      );
    });

    // Convertir a formato esperado por test-ui
    const conversations: Record<string, any> = {};
    for (const lead of testLeads) {
      conversations[lead.phone] = {
        name: lead.name,
        status: lead.status,
        events_count: 0,
        last_activity: lead.updatedAt || lead.createdAt,
      };
    }

    res.json({ test_conversations: conversations });
  } catch (error) {
    console.error("Error obteniendo conversaciones:", error);
    res.status(500).json({ error: "Error obteniendo conversaciones" });
  }
});

// Obtener historial de conversación
app.get("/history/:phone", async (req: Request, res: Response) => {
  const phone = Array.isArray(req.params.phone) ? req.params.phone[0] : req.params.phone;
  const limitParam = req.query.limit;
  const limit = parseInt(typeof limitParam === 'string' ? limitParam : '50') || 50;

  try {
    const events = await convexClient.getConversationHistory(phone, limit);
    res.json({ events });
  } catch (error) {
    console.error("Error obteniendo historial:", error);
    res.status(500).json({ error: "Error obteniendo historial" });
  }
});

// Resetear conversación de prueba
app.post("/reset-test/:phone", async (req: Request, res: Response) => {
  const phone = Array.isArray(req.params.phone) ? req.params.phone[0] : req.params.phone;

  try {
    await convexClient.resetConversation(phone);
    res.json({ success: true, message: `Conversación de ${phone} reseteada` });
  } catch (error) {
    console.error("Error reseteando conversación:", error);
    res.status(500).json({ error: "Error reseteando conversación" });
  }
});

// ==================== INICIALIZACIÓN ====================

export async function startServer(): Promise<void> {
  // Inicializar Cloud API (verificar token)
  await whatsappClient.initialize();

  // Configurar handler de mensajes del webhook
  setMessageHandler(async (message: IncomingMessage) => {
    console.log(`📩 Mensaje de ${message.phone}: ${message.text?.substring(0, 30) || "[media]"}...`);

    // Procesar mensaje con el state machine de Convex
    const response = await convexClient.processMessage(message);

    if (!response) {
      console.warn("⚠️  No se pudo procesar el mensaje en Convex");
      return;
    }

    const replyTo = message.phone;

    // Enviar respuesta automáticamente si hay una
    if (response.reply) {
      // Pequeña pausa para que se sienta más natural
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Enviar respuesta
      const sent = await whatsappClient.sendText(replyTo, response.reply);

      if (sent) {
        console.log(`📤 Respuesta enviada a ${message.phone} [${response.newStatus}]`);
      } else {
        console.error(`❌ Error enviando respuesta a ${message.phone}`);
      }

      // Si hay imagen, enviarla también
      if (response.imageUrl) {
        await whatsappClient.sendImage(replyTo, response.imageUrl);
      }
    } else {
      console.log(`🔕 Sin respuesta para ${message.phone} (modo silencioso)`);
    }
  });

  // Iniciar servidor HTTP
  app.listen(config.port, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 WhatsApp Cloud API Service iniciado               ║
║                                                        ║
║   📍 URL: http://localhost:${config.port}                     ║
║   🔗 Webhook: http://localhost:${config.port}/webhook          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);
  });
}
