import express, { Request, Response } from "express";
import cors from "cors";
import QRCode from "qrcode";
import { config } from "./config.js";
import { whatsappClient, IncomingMessage } from "./baileys.js";
import { convexClient } from "./convex-client.js";

const app = express();

// Configurar CORS para permitir peticiones desde el test-ui
app.use(cors({
  origin: "*", // En producción, especificar dominios permitidos
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}));

app.use(express.json());

// Estado actual del QR en base64 para mostrar en web
let currentQRBase64: string | null = null;

// ==================== PÁGINAS WEB ====================

// Página principal con QR
app.get("/", (req: Request, res: Response) => {
  const state = whatsappClient.getState();

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp - Agente Sales</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 450px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        }
        h1 {
            color: #1a1a2e;
            margin-bottom: 10px;
            font-size: 24px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            border-radius: 50px;
            font-weight: 500;
            margin-bottom: 25px;
        }
        .status.connected {
            background: #d4edda;
            color: #155724;
        }
        .status.disconnected {
            background: #fff3cd;
            color: #856404;
        }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        .connected .status-dot { background: #28a745; }
        .disconnected .status-dot { background: #ffc107; }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .qr-container {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 25px;
        }
        .qr-container img {
            max-width: 280px;
            width: 100%;
            height: auto;
        }
        .phone-number {
            font-size: 18px;
            color: #333;
            margin-bottom: 20px;
        }
        .phone-number strong {
            color: #667eea;
        }
        .instructions {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            text-align: left;
            font-size: 14px;
            color: #555;
        }
        .instructions ol {
            padding-left: 20px;
        }
        .instructions li {
            margin-bottom: 8px;
        }
        .btn {
            display: inline-block;
            padding: 12px 30px;
            border-radius: 50px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s;
            border: none;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        .btn-danger:hover {
            background: #c82333;
        }
        .btn-refresh {
            background: #667eea;
            color: white;
            margin-top: 15px;
        }
        .btn-refresh:hover {
            background: #5a6fd6;
        }
        .actions {
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>WhatsApp Agente Sales</h1>
        <p class="subtitle">Sistema de conexión propio con Baileys</p>

        ${state.isConnected ? `
            <div class="status connected">
                <span class="status-dot"></span>
                Conectado
            </div>
            <p class="phone-number">Número: <strong>+${state.phoneNumber}</strong></p>
            <div class="actions">
                <form action="/api/logout" method="POST" style="display:inline;">
                    <button type="submit" class="btn btn-danger">Desconectar</button>
                </form>
            </div>
        ` : state.lastDisconnectReason ? `
            <div class="status disconnected">
                <span class="status-dot"></span>
                Desconectado: ${state.lastDisconnectReason}
            </div>
            ${currentQRBase64 ? `
                <div class="qr-container">
                    <img src="${currentQRBase64}" alt="Código QR de WhatsApp">
                </div>
            ` : `
                <p style="color: #666; margin: 30px 0;">Esperando QR...</p>
            `}
            <div class="instructions">
                <p style="margin-bottom: 10px;"><strong>Si el QR no aparece o la sesión está corrupta:</strong></p>
            </div>
            <div class="actions" style="margin-top: 15px;">
                <form action="/api/reset" method="POST" style="display:inline;">
                    <button type="submit" class="btn btn-danger">🔄 Reiniciar Sesión</button>
                </form>
            </div>
            <button onclick="location.reload()" class="btn btn-refresh">Actualizar</button>
        ` : `
            <div class="status disconnected">
                <span class="status-dot"></span>
                Esperando conexión
            </div>
            ${currentQRBase64 ? `
                <div class="qr-container">
                    <img src="${currentQRBase64}" alt="Código QR de WhatsApp">
                </div>
                <div class="instructions">
                    <ol>
                        <li>Abre WhatsApp en tu teléfono</li>
                        <li>Ve a <strong>Configuración > Dispositivos vinculados</strong></li>
                        <li>Toca en <strong>Vincular dispositivo</strong></li>
                        <li>Escanea este código QR</li>
                    </ol>
                </div>
            ` : `
                <p style="color: #666; margin: 30px 0;">Generando código QR...</p>
            `}
            <button onclick="location.reload()" class="btn btn-refresh">Actualizar</button>
        `}
    </div>

    <script>
        // Auto-refresh cada 10 segundos si no está conectado
        ${!state.isConnected ? 'setTimeout(() => location.reload(), 10000);' : ''}
    </script>
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

// Obtener QR en formato texto
app.get("/api/qr", (req: Request, res: Response) => {
  const state = whatsappClient.getState();

  if (state.isConnected) {
    res.json({ success: false, message: "Ya conectado", qr: null });
    return;
  }

  if (!state.qrCode) {
    res.json({ success: false, message: "QR no disponible aún", qr: null });
    return;
  }

  res.json({ success: true, qr: state.qrCode });
});

// Obtener QR como imagen
app.get("/api/qr/image", async (req: Request, res: Response) => {
  const state = whatsappClient.getState();

  if (state.isConnected || !state.qrCode) {
    res.status(404).send("QR no disponible");
    return;
  }

  try {
    const qrBuffer = await QRCode.toBuffer(state.qrCode, { width: 300 });
    res.setHeader("Content-Type", "image/png");
    res.send(qrBuffer);
  } catch (error) {
    res.status(500).send("Error generando QR");
  }
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

// Enviar presencia (escribiendo...)
app.post("/api/presence", async (req: Request, res: Response) => {
  const { phone, presence } = req.body;

  if (!phone) {
    res.status(400).json({ success: false, error: "phone es requerido" });
    return;
  }

  const success = await whatsappClient.sendPresence(phone, presence || "composing");
  res.json({ success });
});

// Cerrar sesión
app.post("/api/logout", async (req: Request, res: Response) => {
  await whatsappClient.disconnect();

  // Redirect to home if called from browser
  const acceptHeader = req.headers.accept || "";
  if (acceptHeader.includes("text/html")) {
    res.redirect("/");
    return;
  }

  res.json({ success: true, message: "Sesión cerrada" });
});

// Limpiar sesión completamente (para casos de sesión corrupta)
app.post("/api/reset", async (req: Request, res: Response) => {
  console.log("🔄 Limpiando sesión de WhatsApp...");
  whatsappClient.clearSession();
  
  // Reconectar para generar nuevo QR
  setTimeout(() => {
    whatsappClient.connect();
  }, 1000);

  // Redirect to home if called from browser
  const acceptHeader = req.headers.accept || "";
  if (acceptHeader.includes("text/html")) {
    res.redirect("/");
    return;
  }

  res.json({ success: true, message: "Sesión limpiada, escanea el nuevo QR" });
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
      phone,
      text: text || "",
      hasImage: has_image || false,
      pushName: null,
    });

    res.json({
      success: true,
      reply: response.reply,
      new_status: response.newStatus,
      action: response.action,
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
        events_count: 0, // Podríamos contar eventos si es necesario
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
  const { phone } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;

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
  const { phone } = req.params;

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
  // Escuchar eventos de WhatsApp
  whatsappClient.on("qr", async (qr: string) => {
    // Generar QR como base64 para mostrar en la web
    currentQRBase64 = await QRCode.toDataURL(qr, { width: 300 });
  });

  whatsappClient.on("connected", (phone: string) => {
    currentQRBase64 = null;
    console.log(`✅ WhatsApp conectado: ${phone}`);
  });

  whatsappClient.on("message", async (message: IncomingMessage) => {
    console.log(`📩 Mensaje de ${message.phone} (JID: ${message.jid}): ${message.text?.substring(0, 30) || "[imagen]"}...`);

    // Procesar mensaje con el state machine de Convex
    const response = await convexClient.processMessage(message);

    if (!response) {
      console.warn("⚠️  No se pudo procesar el mensaje en Convex");
      return;
    }

    // Usar el JID original para responder (importante para @lid)
    const replyTo = message.jid;

    // Enviar respuesta automáticamente si hay una
    if (response.reply) {
      // Mostrar indicador de "escribiendo..."
      await whatsappClient.sendPresence(replyTo, "composing");

      // Pequeña pausa para que se sienta más natural
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Enviar respuesta usando el JID original
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

  // Iniciar conexión con WhatsApp
  await whatsappClient.connect();

  // Iniciar servidor HTTP
  app.listen(config.port, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 WhatsApp Service iniciado                         ║
║                                                        ║
║   📍 URL Local: http://localhost:${config.port}                ║
║   📱 Escanea el QR para conectar WhatsApp              ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);
  });
}
