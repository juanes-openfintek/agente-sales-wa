import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const config = {
  // Servidor
  port: parseInt(process.env.PORT || "3001", 10),

  // Convex
  convexUrl: process.env.CONVEX_URL || "",

  // Modo desarrollo (muestra QR en terminal)
  devMode: process.env.DEV_MODE === "true",

  // Directorio para guardar la sesión de WhatsApp
  authDir: path.join(process.cwd(), "auth_info"),
};

export function validateConfig(): void {
  if (!config.convexUrl) {
    console.warn("⚠️  CONVEX_URL no está configurada. Las llamadas a Convex fallarán.");
  }
}
