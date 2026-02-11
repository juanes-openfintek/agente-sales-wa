import { validateConfig } from "./config.js";
import { startServer } from "./server.js";

console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   WhatsApp Cloud API Service                           ║
║   Agente Sales WA - Meta Business API                  ║
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
