import { Router, Request, Response } from "express";
import crypto from "crypto";
import { config } from "./config.js";
import { whatsappClient, IncomingMessage } from "./cloud-api.js";

export const webhookRouter = Router();

// Callback para mensajes procesados (se configura desde server.ts)
type MessageHandler = (message: IncomingMessage) => Promise<void>;
let onMessageReceived: MessageHandler | null = null;

export function setMessageHandler(handler: MessageHandler): void {
  onMessageReceived = handler;
}

// ==================== DEDUPLICACIÓN ====================

const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutos

function isDuplicate(messageId: string): boolean {
  const now = Date.now();
  // Limpiar entradas antiguas
  for (const [id, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL_MS) processedMessages.delete(id);
  }
  if (processedMessages.has(messageId)) return true;
  processedMessages.set(messageId, now);
  return false;
}

// ==================== VERIFICACIÓN DE FIRMA ====================

function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", config.whatsapp.appSecret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace("sha256=", "")),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ==================== WEBHOOK ENDPOINTS ====================

// GET /webhook — Verificación de Meta (challenge response)
webhookRouter.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.whatsapp.webhookVerifyToken) {
    console.log("✅ Webhook verificado exitosamente");
    res.status(200).send(challenge);
  } else {
    console.warn("⚠️  Verificación de webhook fallida: token no coincide");
    res.sendStatus(403);
  }
});

// POST /webhook — Mensajes entrantes de Meta
webhookRouter.post("/webhook", async (req: Request & { rawBody?: Buffer }, res: Response) => {
  // IMPORTANTE: Responder 200 inmediatamente (Meta reintenta si no recibe en 20s)
  res.sendStatus(200);

  // Verificar firma del webhook si app secret está configurado
  if (config.whatsapp.appSecret && req.rawBody) {
    const signature = req.headers["x-hub-signature-256"] as string;
    if (!verifyWebhookSignature(req.rawBody, signature)) {
      console.error("❌ Firma de webhook inválida - ignorando");
      return;
    }
  }

  try {
    const body = req.body;

    if (body.object !== "whatsapp_business_account") return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // Manejar actualizaciones de estado (delivered, read, etc.)
        if (value.statuses) {
          for (const status of value.statuses) {
            handleStatusUpdate(status);
          }
        }

        // Manejar mensajes entrantes
        if (value.messages) {
          for (const message of value.messages) {
            await handleIncomingMessage(message, value.contacts);
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
  }
});

// ==================== PROCESAMIENTO DE MENSAJES ====================

async function handleIncomingMessage(
  message: any,
  contacts: any[] | undefined
): Promise<void> {
  // Ignorar tipos no soportados
  if (message.type === "unsupported" || message.type === "system") return;

  // Deduplicar
  if (isDuplicate(message.id)) {
    console.log(`🔄 Mensaje duplicado ${message.id}, ignorando`);
    return;
  }

  const phone = message.from; // ej: "573001234567"
  const pushName = contacts?.[0]?.profile?.name || null;
  let text: string | null = null;
  let imageUrl: string | null = null;

  // Extraer contenido según el tipo de mensaje
  switch (message.type) {
    case "text":
      text = message.text?.body || null;
      break;

    case "image":
      // Descargar imagen y convertir a base64 (para comprobantes de pago)
      if (message.image?.id) {
        imageUrl = await whatsappClient.downloadMedia(message.image.id);
      }
      text = message.image?.caption || null;
      break;

    case "interactive":
      // Respuestas de botones y listas
      if (message.interactive?.type === "button_reply") {
        text = message.interactive.button_reply.title;
      } else if (message.interactive?.type === "list_reply") {
        text = message.interactive.list_reply.title;
      } else if (message.interactive?.type === "nfm_reply") {
        // Respuesta de WhatsApp Flow (formulario)
        text = handleFlowResponse(message.interactive.nfm_reply);
      }
      break;

    case "document":
    case "video":
    case "audio":
    case "sticker":
      text = `[${message.type}]`;
      break;

    case "location":
      text = `[ubicacion: ${message.location?.latitude}, ${message.location?.longitude}]`;
      break;

    default:
      text = null;
  }

  // Construir IncomingMessage (compatible con la interfaz de baileys.ts)
  const incomingMessage: IncomingMessage = {
    messageId: message.id || `cloud-${Date.now()}`,
    phone,
    jid: phone, // En Cloud API, JID es simplemente el teléfono
    text,
    imageUrl,
    timestamp: parseInt(message.timestamp) || Date.now() / 1000,
    pushName,
  };

  console.log(`📩 Mensaje de ${phone}: ${text?.substring(0, 30) || "[media]"}`);

  // Marcar como leído
  await whatsappClient.markAsRead(message.id);

  // Despachar al handler configurado
  if (onMessageReceived) {
    await onMessageReceived(incomingMessage);
  }
}

// Procesar respuestas de WhatsApp Flows
function handleFlowResponse(nfmReply: any): string {
  try {
    const responseData = JSON.parse(nfmReply.response_json || "{}");
    // Convertir respuesta del Flow a texto que el state machine pueda parsear
    return `[FLOW_RESPONSE] ${JSON.stringify(responseData)}`;
  } catch {
    return nfmReply.body || "";
  }
}

// Manejar actualizaciones de estado de mensajes
function handleStatusUpdate(status: any): void {
  const statusType = status.status; // sent, delivered, read, failed
  if (statusType === "failed") {
    console.error(`❌ Mensaje ${status.id} falló:`, status.errors);
  }
}
