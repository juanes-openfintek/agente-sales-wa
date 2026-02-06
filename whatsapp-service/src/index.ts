import { config, validateConfig } from "./config.js";
import { startServer } from "./server.js";

console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   WhatsApp Service con Baileys                         ║
║   Agente Sales WA - Sistema de Conexión Propio         ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
`);

// Validar configuración
validateConfig();

// Iniciar servidor
startServer().catch((error) => {
  console.error("❌ Error iniciando servicio:", error);
  process.exit(1);
});
