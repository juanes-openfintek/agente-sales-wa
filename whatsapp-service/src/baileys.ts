import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  BaileysEventMap,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { config } from "./config.js";
import { EventEmitter } from "events";
import fs from "fs";

// Logger para Baileys - "warn" para ver errores importantes, "silent" para producción
const logger = pino({
  level: config.devMode ? "warn" : "silent"
});

// Interfaz para el estado de conexión
export interface ConnectionState {
  isConnected: boolean;
  qrCode: string | null;
  phoneNumber: string | null;
  lastDisconnectReason: string | null;
}

// Interfaz para mensajes entrantes procesados
export interface IncomingMessage {
  messageId: string;
  phone: string;
  text: string | null;
  imageUrl: string | null;
  timestamp: number;
  pushName: string | null;
}

// Clase principal para manejar Baileys
export class WhatsAppClient extends EventEmitter {
  private socket: WASocket | null = null;
  private state: ConnectionState = {
    isConnected: false,
    qrCode: null,
    phoneNumber: null,
    lastDisconnectReason: null,
  };

  constructor() {
    super();
  }

  // Obtener estado actual de la conexión
  getState(): ConnectionState {
    return { ...this.state };
  }

  // Iniciar conexión con WhatsApp
  async connect(): Promise<void> {
    // Asegurar que existe el directorio de autenticación
    if (!fs.existsSync(config.authDir)) {
      fs.mkdirSync(config.authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

    // Obtener la última versión de WhatsApp Web
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📱 Usando WA Web v${version.join(".")} (latest: ${isLatest})`);

    this.socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: ["Chrome (Linux)", "", ""],
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    // Manejar eventos de conexión
    this.socket.ev.on("connection.update", (update) => {
      this.handleConnectionUpdate(update);
    });

    // Guardar credenciales cuando cambien
    this.socket.ev.on("creds.update", saveCreds);

    // Manejar mensajes entrantes
    this.socket.ev.on("messages.upsert", (m) => {
      this.handleIncomingMessages(m);
    });
  }

  // Manejar actualizaciones de conexión
  private handleConnectionUpdate(
    update: Partial<BaileysEventMap["connection.update"]>
  ): void {
    const { connection, lastDisconnect, qr } = update;

    // Log para debug
    if (config.devMode) {
      console.log("🔍 Connection update:", JSON.stringify({ connection, hasQr: !!qr, lastDisconnect: lastDisconnect?.error?.message }));
    }

    // Nuevo QR disponible
    if (qr) {
      this.state.qrCode = qr;
      this.state.isConnected = false;
      this.emit("qr", qr);
      console.log("📱 Nuevo QR generado - Ábrelo en http://localhost:3001");
    }

    // Estado de conexión cambió
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      this.state.isConnected = false;
      this.state.lastDisconnectReason = DisconnectReason[statusCode] || `Code: ${statusCode}`;

      console.log(`❌ Desconectado: ${this.state.lastDisconnectReason}`);

      if (statusCode === DisconnectReason.loggedOut) {
        // Logout intencional - limpiar sesión y reconectar para nuevo QR
        this.clearSession();
        this.emit("logout");
        console.log("🔄 Generando nuevo QR en 3 segundos...");
        setTimeout(() => this.connect(), 3000);
      } else if (shouldReconnect) {
        // Reconectar solo si tiene sentido
        console.log("🔄 Reconectando en 5 segundos...");
        setTimeout(() => this.connect(), 5000);
      }
    } else if (connection === "connecting") {
      console.log("⏳ Conectando a WhatsApp...");
    } else if (connection === "open") {
      this.state.isConnected = true;
      this.state.qrCode = null;
      this.state.phoneNumber = this.socket?.user?.id?.split(":")[0] || null;

      console.log(`✅ Conectado como: +${this.state.phoneNumber}`);
      this.emit("connected", this.state.phoneNumber);
    }
  }

  // Manejar mensajes entrantes
  private async handleIncomingMessages(
    m: BaileysEventMap["messages.upsert"]
  ): Promise<void> {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      // Ignorar mensajes propios y de status
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;
      if (!msg.key.remoteJid) continue;

      // Solo procesar chats individuales (no grupos)
      if (msg.key.remoteJid.endsWith("@g.us")) continue;

      const phone = msg.key.remoteJid.replace("@s.whatsapp.net", "");
      const messageContent = msg.message;

      if (!messageContent) continue;

      let text: string | null = null;
      let imageUrl: string | null = null;

      // Extraer texto del mensaje
      if (messageContent.conversation) {
        text = messageContent.conversation;
      } else if (messageContent.extendedTextMessage?.text) {
        text = messageContent.extendedTextMessage.text;
      } else if (messageContent.imageMessage?.caption) {
        text = messageContent.imageMessage.caption;
      }

      // Si hay imagen, descargarla (para comprobantes de pago)
      if (messageContent.imageMessage && this.socket) {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
              logger,
              reuploadRequest: this.socket.updateMediaMessage,
            }
          );
          // Convertir a base64 para enviar a Convex
          imageUrl = `data:${messageContent.imageMessage.mimetype};base64,${(buffer as Buffer).toString("base64")}`;
        } catch (error) {
          console.error("Error descargando imagen:", error);
        }
      }

      const incomingMessage: IncomingMessage = {
        messageId: msg.key.id || `${Date.now()}`,
        phone,
        text,
        imageUrl,
        timestamp: msg.messageTimestamp as number || Date.now() / 1000,
        pushName: msg.pushName || null,
      };

      console.log(`📩 Mensaje de ${phone}: ${text || "[imagen]"}`);
      this.emit("message", incomingMessage);
    }
  }

  // Enviar mensaje de texto
  async sendText(phone: string, text: string): Promise<boolean> {
    if (!this.socket || !this.state.isConnected) {
      console.error("❌ No conectado a WhatsApp");
      return false;
    }

    try {
      const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
      await this.socket.sendMessage(jid, { text });
      console.log(`📤 Mensaje enviado a ${phone}`);
      return true;
    } catch (error) {
      console.error("Error enviando mensaje:", error);
      return false;
    }
  }

  // Enviar imagen con caption
  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string
  ): Promise<boolean> {
    if (!this.socket || !this.state.isConnected) {
      console.error("❌ No conectado a WhatsApp");
      return false;
    }

    try {
      const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
      await this.socket.sendMessage(jid, {
        image: { url: imageUrl },
        caption: caption || "",
      });
      console.log(`📤 Imagen enviada a ${phone}`);
      return true;
    } catch (error) {
      console.error("Error enviando imagen:", error);
      return false;
    }
  }

  // Enviar presencia (escribiendo...)
  async sendPresence(
    phone: string,
    presence: "composing" | "recording" | "paused" = "composing"
  ): Promise<boolean> {
    if (!this.socket || !this.state.isConnected) {
      return false;
    }

    try {
      const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
      await this.socket.sendPresenceUpdate(presence, jid);
      return true;
    } catch (error) {
      console.error("Error enviando presencia:", error);
      return false;
    }
  }

  // Limpiar sesión
  clearSession(): void {
    // Cerrar socket existente si hay uno
    if (this.socket) {
      this.socket.ev.removeAllListeners();
      this.socket.end(new Error("Session cleared"));
      this.socket = null;
    }

    if (fs.existsSync(config.authDir)) {
      fs.rmSync(config.authDir, { recursive: true, force: true });
      console.log("🗑️  Sesión eliminada");
    }
    this.state = {
      isConnected: false,
      qrCode: null,
      phoneNumber: null,
      lastDisconnectReason: null,
    };
  }

  // Desconectar
  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }
  }
}

// Instancia singleton
export const whatsappClient = new WhatsAppClient();
