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
  isWaitingForQR: boolean; // true cuando se inició la conexión y esperamos que escaneen el QR
  qrCode: string | null;
  phoneNumber: string | null;
  lastDisconnectReason: string | null;
}

// Interfaz para mensajes entrantes procesados
export interface IncomingMessage {
  messageId: string;
  phone: string;
  jid: string; // JID original para responder (puede ser @s.whatsapp.net o @lid)
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
    isWaitingForQR: false,
    qrCode: null,
    phoneNumber: null,
    lastDisconnectReason: null,
  };

  // Guards contra reconexiones concurrentes
  private isReconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
  }

  // Obtener estado actual de la conexión
  getState(): ConnectionState {
    return { ...this.state };
  }

  // Cerrar el socket actual de forma segura (SIN borrar sesión)
  private closeExistingSocket(): void {
    if (this.socket) {
      try {
        // Eliminar todos los listeners para evitar callbacks fantasma
        this.socket.ev.removeAllListeners("connection.update");
        this.socket.ev.removeAllListeners("creds.update");
        this.socket.ev.removeAllListeners("messages.upsert");
        // Terminar el socket
        this.socket.end(undefined);
      } catch (error) {
        console.error("⚠️  Error cerrando socket anterior:", error);
      }
      this.socket = null;
    }
  }

  // Iniciar conexión con WhatsApp
  async connect(): Promise<void> {
    // Evitar reconexiones concurrentes
    if (this.isReconnecting) {
      console.log("⏳ Ya hay una reconexión en curso, ignorando...");
      return;
    }

    this.isReconnecting = true;

    try {
      // IMPORTANTE: Cerrar socket anterior antes de crear uno nuevo
      this.closeExistingSocket();

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
    } catch (error) {
      console.error("❌ Error en connect():", error);
    } finally {
      this.isReconnecting = false;
    }
  }

  // Programar reconexión con guard
  private scheduleReconnect(delayMs: number, reason: string): void {
    // Cancelar reconexión previa si hay una pendiente
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    console.log(`🔄 Reconectando en ${delayMs / 1000}s (razón: ${reason})...`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delayMs);
  }

  // Manejar actualizaciones de conexión
  private handleConnectionUpdate(
    update: Partial<BaileysEventMap["connection.update"]>
  ): void {
    const { connection, lastDisconnect, qr } = update;

    // Log para debug - siempre mostrar estado de conexión
    console.log("🔍 Connection update:", JSON.stringify({ 
      connection, 
      hasQr: !!qr, 
      lastDisconnect: lastDisconnect?.error?.message 
    }));

    // Nuevo QR disponible
    if (qr) {
      this.state.qrCode = qr;
      this.state.isConnected = false;
      this.state.isWaitingForQR = true;
      this.emit("qr", qr);
      console.log("📱 Nuevo QR generado - Escanéalo en la página web del servicio");
    }

    // Estado de conexión cambió
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      this.state.isConnected = false;
      this.state.lastDisconnectReason = DisconnectReason[statusCode] || `Code: ${statusCode}`;

      console.log(`❌ Desconectado: ${this.state.lastDisconnectReason} (code: ${statusCode})`);

      if (statusCode === DisconnectReason.loggedOut) {
        // Logout intencional - limpiar sesión y reconectar para nuevo QR
        this.clearSession();
        this.emit("logout");
        this.scheduleReconnect(3000, "loggedOut - nuevo QR");
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        // Otra sesión tomó el control - NO reconectar automáticamente
        // ya que causaría un loop infinito de conflictos
        this.state.isWaitingForQR = false;
        console.log("⚠️  Otra sesión de WhatsApp Web está activa. NO reconectando automáticamente.");
        console.log("⚠️  Cierra las otras sesiones de WhatsApp Web y usa /api/reset para reconectar.");
      } else if (shouldReconnect) {
        // Mantener isWaitingForQR = true porque vamos a reconectar
        // Para otros errores (timeout, stream error, etc.) reconectar con delay
        const delay = statusCode === DisconnectReason.restartRequired ? 1000 : 5000;
        this.scheduleReconnect(delay, this.state.lastDisconnectReason || "unknown");
      }
    } else if (connection === "connecting") {
      console.log("⏳ Conectando a WhatsApp...");
    } else if (connection === "open") {
      this.state.isConnected = true;
      this.state.isWaitingForQR = false;
      this.state.qrCode = null;
      this.state.phoneNumber = this.socket?.user?.id?.split(":")[0] || null;
      this.state.lastDisconnectReason = null;

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

      // Guardar el JID original para poder responder
      // Formatos posibles: 573001234567@s.whatsapp.net, 224098609319972@lid, etc.
      const originalJid = msg.key.remoteJid;
      
      // Extraer identificador (puede ser número o LID)
      const phone = originalJid
        .replace("@s.whatsapp.net", "")
        .replace("@lid", "")
        .replace("@c.us", "");
      
      console.log(`🔍 JID original: ${originalJid}, phone extraído: ${phone}`);
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
        jid: originalJid, // Guardamos el JID original para responder
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
  async sendText(jid: string, text: string): Promise<boolean> {
    if (!this.socket || !this.state.isConnected) {
      console.error("❌ No conectado a WhatsApp");
      return false;
    }

    try {
      // El JID debe tener el formato completo (ej: 573001234567@s.whatsapp.net o 224098609319972@lid)
      const targetJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
      console.log(`📤 Enviando mensaje a JID: ${targetJid}`);
      
      const result = await this.socket.sendMessage(targetJid, { text });
      
      if (result?.status) {
        console.log(`📤 Mensaje enviado a ${jid} (status: ${result.status})`);
      } else {
        console.log(`📤 Mensaje enviado a ${jid}`);
      }
      return true;
    } catch (error) {
      console.error(`❌ Error enviando mensaje a ${jid}:`, error);
      return false;
    }
  }

  // Enviar imagen con caption
  async sendImage(
    jid: string,
    imageUrl: string,
    caption?: string
  ): Promise<boolean> {
    if (!this.socket || !this.state.isConnected) {
      console.error("❌ No conectado a WhatsApp");
      return false;
    }

    try {
      const targetJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
      await this.socket.sendMessage(targetJid, {
        image: { url: imageUrl },
        caption: caption || "",
      });
      console.log(`📤 Imagen enviada a ${jid}`);
      return true;
    } catch (error) {
      console.error(`❌ Error enviando imagen a ${jid}:`, error);
      return false;
    }
  }

  // Enviar presencia (escribiendo...)
  async sendPresence(
    jid: string,
    presence: "composing" | "recording" | "paused" = "composing"
  ): Promise<boolean> {
    if (!this.socket || !this.state.isConnected) {
      return false;
    }

    try {
      const targetJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
      await this.socket.sendPresenceUpdate(presence, targetJid);
      return true;
    } catch (error) {
      // Presencia no es crítica, no hacer log ruidoso
      return false;
    }
  }

  // Limpiar sesión completamente (borra credenciales)
  clearSession(): void {
    // Cerrar socket existente
    this.closeExistingSocket();

    // Cancelar reconexión pendiente
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (fs.existsSync(config.authDir)) {
      fs.rmSync(config.authDir, { recursive: true, force: true });
      console.log("🗑️  Sesión eliminada");
    }
    this.state = {
      isConnected: false,
      isWaitingForQR: false,
      qrCode: null,
      phoneNumber: null,
      lastDisconnectReason: null,
    };
  }

  // Desconectar (logout de WhatsApp)
  async disconnect(): Promise<void> {
    // Cancelar reconexión pendiente
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (error) {
        console.error("Error en logout:", error);
      }
      this.socket = null;
    }
  }
}

// Instancia singleton
export const whatsappClient = new WhatsAppClient();
