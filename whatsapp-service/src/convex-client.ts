import { config } from "./config.js";
import { IncomingMessage } from "./cloud-api.js";

// Respuesta del state machine
export interface StateMachineResponse {
  reply: string;
  imageUrl?: string | null;
  action: string;
  newStatus: string;
}

// Cliente HTTP para comunicarse con Convex
export class ConvexClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.convexUrl;
  }

  // Helper para hacer requests
  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" = "GET",
    body?: Record<string, unknown>
  ): Promise<T | null> {
    if (!this.baseUrl) {
      console.warn("⚠️  CONVEX_URL no configurada");
      return null;
    }

    try {
      const url = `${this.baseUrl}${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error en Convex: ${response.status} - ${errorText}`);
        return null;
      }

      return await response.json() as T;
    } catch (error) {
      console.error("Error comunicando con Convex:", error);
      return null;
    }
  }

  // Procesar mensaje con el state machine de Convex (NUEVO - directo)
  async processMessage(message: IncomingMessage): Promise<StateMachineResponse | null> {
    const payload = {
      phone: message.phone,
      text: message.text || "",
      hasImage: !!message.imageUrl,
      pushName: message.pushName,
    };

    console.log(`🔄 Procesando mensaje en Convex: ${message.phone}`);

    const result = await this.request<StateMachineResponse>(
      "/webhook/message",
      "POST",
      payload
    );

    if (result) {
      console.log(`✅ Respuesta de Convex: ${result.reply?.substring(0, 50)}...`);
    }

    return result;
  }

  // Guardar evento directamente
  async saveEvent(
    phone: string,
    direction: "in" | "out",
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    const result = await this.request("/events", "POST", {
      phone,
      direction,
      text,
      metadata,
    });
    return result !== null;
  }

  // Obtener información del lead
  async getLead(phone: string): Promise<Record<string, unknown> | null> {
    return await this.request(`/leads?phone=${encodeURIComponent(phone)}`);
  }

  // Verificar health de Convex
  async health(): Promise<boolean> {
    const result = await this.request<{ status: string }>("/health");
    return result?.status === "ok";
  }

  // Obtener todos los leads (para test-ui)
  async getAllLeads(): Promise<any[]> {
    const result = await this.request("/leads/all");
    return Array.isArray(result) ? result : [];
  }

  // Obtener historial de conversación (para test-ui)
  async getConversationHistory(phone: string, limit: number = 50): Promise<any[]> {
    const result = await this.request(`/history/${phone}?limit=${limit}`);
    return Array.isArray(result) ? result : [];
  }

  // Resetear conversación (para test-ui)
  async resetConversation(phone: string): Promise<boolean> {
    const result = await this.request(`/reset/${phone}`, "POST");
    return result !== null;
  }
}

// Instancia singleton
export const convexClient = new ConvexClient();
