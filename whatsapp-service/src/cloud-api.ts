import { config } from "./config.js";

// Interfaz para mensajes entrantes (compatible con baileys.ts)
export interface IncomingMessage {
  messageId: string;
  phone: string;
  jid: string; // En Cloud API = phone (mantenido para compatibilidad)
  text: string | null;
  imageUrl: string | null;
  timestamp: number;
  pushName: string | null;
}

// Estado de conexión (simplificado - sin QR)
export interface ConnectionState {
  isConnected: boolean;
  phoneNumber: string | null;
  lastError: string | null;
}

const GRAPH_API_BASE = `https://graph.facebook.com`;

function getApiUrl(path: string): string {
  return `${GRAPH_API_BASE}/${config.whatsapp.apiVersion}/${path}`;
}

function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.whatsapp.accessToken}`,
    "Content-Type": "application/json",
  };
}

export class WhatsAppCloudClient {
  private state: ConnectionState = {
    isConnected: false,
    phoneNumber: null,
    lastError: null,
  };

  getState(): ConnectionState {
    return { ...this.state };
  }

  // Verificar que el token y phone number ID son válidos
  async initialize(): Promise<void> {
    try {
      const res = await fetch(
        getApiUrl(config.whatsapp.phoneNumberId),
        { headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` } }
      );

      if (res.ok) {
        const data = (await res.json()) as { display_phone_number?: string };
        this.state.isConnected = true;
        this.state.phoneNumber = data.display_phone_number || config.whatsapp.phoneNumberId;
        this.state.lastError = null;
        console.log(`✅ Cloud API conectada: ${this.state.phoneNumber}`);
      } else {
        const err = await res.text();
        this.state.isConnected = false;
        this.state.lastError = `API error: ${res.status} - ${err}`;
        console.error(`❌ Error conectando Cloud API: ${this.state.lastError}`);
      }
    } catch (error) {
      this.state.isConnected = false;
      this.state.lastError = String(error);
      console.error(`❌ Error conectando Cloud API: ${this.state.lastError}`);
    }
  }

  // Enviar mensaje de texto
  async sendText(phone: string, text: string): Promise<boolean> {
    return this.sendMessage(phone, { type: "text", text: { body: text } });
  }

  // Enviar imagen con caption opcional
  async sendImage(phone: string, imageUrl: string, caption?: string): Promise<boolean> {
    // Si es base64 (data URI), subir como media primero
    if (imageUrl.startsWith("data:")) {
      const mediaId = await this.uploadMedia(imageUrl);
      if (!mediaId) return false;
      return this.sendMessage(phone, {
        type: "image",
        image: { id: mediaId, caption: caption || "" },
      });
    }
    // Si es URL normal
    return this.sendMessage(phone, {
      type: "image",
      image: { link: imageUrl, caption: caption || "" },
    });
  }

  // Indicador de "escribiendo" - no soportado en Cloud API, es no-op
  async sendPresence(_phone: string, _presence?: string): Promise<boolean> {
    return true;
  }

  // Marcar mensaje como leído
  async markAsRead(messageId: string): Promise<boolean> {
    try {
      const res = await fetch(
        getApiUrl(`${config.whatsapp.phoneNumberId}/messages`),
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            messaging_product: "whatsapp",
            status: "read",
            message_id: messageId,
          }),
        }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  // Enviar botones interactivos (max 3 botones)
  async sendButtons(
    phone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string
  ): Promise<boolean> {
    const interactive: Record<string, unknown> = {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    };
    if (headerText) (interactive as any).header = { type: "text", text: headerText };
    if (footerText) (interactive as any).footer = { text: footerText };

    return this.sendMessage(phone, { type: "interactive", interactive });
  }

  // Enviar lista interactiva (para opciones como métodos de pago)
  async sendList(
    phone: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    headerText?: string,
    footerText?: string
  ): Promise<boolean> {
    const interactive: Record<string, unknown> = {
      type: "list",
      body: { text: bodyText },
      action: { button: buttonText, sections },
    };
    if (headerText) (interactive as any).header = { type: "text", text: headerText };
    if (footerText) (interactive as any).footer = { text: footerText };

    return this.sendMessage(phone, { type: "interactive", interactive });
  }

  // Enviar WhatsApp Flow (para formularios estructurados)
  async sendFlow(
    phone: string,
    bodyText: string,
    flowId: string,
    flowToken: string,
    flowCta: string,
    screenId?: string,
    flowData?: Record<string, unknown>
  ): Promise<boolean> {
    const parameters: Record<string, unknown> = {
      flow_message_version: "3",
      flow_id: flowId,
      flow_cta: flowCta,
      flow_token: flowToken,
      mode: "published",
    };

    if (screenId) {
      parameters.flow_action = "navigate";
      parameters.flow_action_payload = { screen: screenId, data: flowData || {} };
    }

    return this.sendMessage(phone, {
      type: "interactive",
      interactive: {
        type: "flow",
        body: { text: bodyText },
        action: { name: "flow", parameters },
      },
    });
  }

  // Descargar media por ID (para comprobantes de pago)
  async downloadMedia(mediaId: string): Promise<string | null> {
    try {
      // Paso 1: Obtener URL del media
      const metaRes = await fetch(getApiUrl(mediaId), {
        headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
      });
      if (!metaRes.ok) return null;

      const meta = (await metaRes.json()) as { url: string; mime_type?: string };

      // Paso 2: Descargar el archivo
      const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
      });
      if (!fileRes.ok) return null;

      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const mimeType = meta.mime_type || "image/jpeg";
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch (error) {
      console.error("❌ Error descargando media:", error);
      return null;
    }
  }

  // Subir media (para enviar imágenes en base64)
  private async uploadMedia(dataUri: string): Promise<string | null> {
    try {
      const [header, base64Data] = dataUri.split(",");
      const mimeType = header.match(/data:(.*?);/)?.[1] || "image/jpeg";
      const buffer = Buffer.from(base64Data, "base64");

      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append("type", mimeType);
      formData.append("file", new Blob([buffer], { type: mimeType }), "image.jpg");

      const res = await fetch(
        getApiUrl(`${config.whatsapp.phoneNumberId}/media`),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
          body: formData,
        }
      );

      if (!res.ok) {
        console.error("❌ Error subiendo media:", await res.text());
        return null;
      }

      const data = (await res.json()) as { id?: string };
      return data.id || null;
    } catch (error) {
      console.error("❌ Error subiendo media:", error);
      return null;
    }
  }

  // Método core para enviar mensajes con reintentos
  private async sendMessage(
    phone: string,
    messagePayload: Record<string, unknown>,
    retries: number = 2
  ): Promise<boolean> {
    // Normalizar teléfono: quitar sufijos de JID, prefijo +
    const cleanPhone = phone
      .replace("@s.whatsapp.net", "")
      .replace("@lid", "")
      .replace("@c.us", "")
      .replace(/^\+/, "");

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(
          getApiUrl(`${config.whatsapp.phoneNumberId}/messages`),
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: cleanPhone,
              ...messagePayload,
            }),
          }
        );

        if (res.ok) {
          console.log(`📤 Mensaje enviado a ${cleanPhone}`);
          return true;
        }

        const err = (await res.json()) as { error?: { code?: number } };
        const errorCode = err?.error?.code;

        // Rate limit (130429) o error de servidor (5xx) - reintentar
        if ((errorCode === 130429 || res.status >= 500) && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`⏳ Reintentando en ${delay}ms (intento ${attempt + 1})...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        console.error(`❌ Error enviando a ${cleanPhone}:`, err);
        return false;
      } catch (error) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        console.error(`❌ Error enviando a ${cleanPhone}:`, error);
        return false;
      }
    }
    return false;
  }
}

// Singleton
export const whatsappClient = new WhatsAppCloudClient();
