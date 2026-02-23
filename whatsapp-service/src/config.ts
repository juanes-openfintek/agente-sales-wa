import dotenv from "dotenv";

dotenv.config();

export const config = {
  // Servidor
  port: parseInt(process.env.PORT || "3001", 10),

  // Convex backend
  convexUrl: process.env.CONVEX_URL || "",

  // WhatsApp Cloud API
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",

    // WhatsApp Flow IDs (opcionales — si no están, se usa texto normal)
    flowNameId: process.env.WHATSAPP_FLOW_NAME_ID || "",
    flowDeliveryId: process.env.WHATSAPP_FLOW_DELIVERY_ID || "",
    flowCedulaId: process.env.WHATSAPP_FLOW_CEDULA_ID || "",
  },
};

export function validateConfig(): void {
  if (!config.convexUrl) {
    console.warn("⚠️  CONVEX_URL no está configurada. Las llamadas a Convex fallarán.");
  }
  if (!config.whatsapp.phoneNumberId) {
    console.error("❌ WHATSAPP_PHONE_NUMBER_ID es requerido.");
  }
  if (!config.whatsapp.accessToken) {
    console.error("❌ WHATSAPP_ACCESS_TOKEN es requerido.");
  }
  if (!config.whatsapp.webhookVerifyToken) {
    console.error("❌ WHATSAPP_WEBHOOK_VERIFY_TOKEN es requerido.");
  }
}
