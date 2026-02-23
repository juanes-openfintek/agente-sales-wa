/**
 * Script para registrar WhatsApp Flows en Meta.
 *
 * Uso:
 *   npx tsx src/register-flows.ts
 *
 * Requisitos:
 *   - WHATSAPP_BUSINESS_ACCOUNT_ID en .env
 *   - WHATSAPP_ACCESS_TOKEN en .env
 *
 * Este script:
 *   1. Crea cada Flow en Meta (obtiene el Flow ID)
 *   2. Sube el JSON del Flow
 *   3. Publica el Flow
 *   4. Imprime los Flow IDs para configurar como variables de entorno
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

if (!WABA_ID || !ACCESS_TOKEN) {
  console.error("❌ WHATSAPP_BUSINESS_ACCOUNT_ID y WHATSAPP_ACCESS_TOKEN son requeridos en .env");
  process.exit(1);
}

interface FlowDefinition {
  name: string;
  category: string;
  jsonFile: string;
  envVarName: string;
}

const FLOWS: FlowDefinition[] = [
  {
    name: "Recoleccion de Nombre",
    category: "SIGN_UP",
    jsonFile: "flows/name-collection.json",
    envVarName: "WHATSAPP_FLOW_NAME_ID",
  },
  {
    name: "Datos de Entrega",
    category: "SIGN_UP",
    jsonFile: "flows/delivery-info.json",
    envVarName: "WHATSAPP_FLOW_DELIVERY_ID",
  },
  {
    name: "Recoleccion de Cedula",
    category: "SIGN_UP",
    jsonFile: "flows/cedula-collection.json",
    envVarName: "WHATSAPP_FLOW_CEDULA_ID",
  },
];

async function createFlow(name: string, category: string): Promise<string | null> {
  console.log(`\n📝 Creando Flow: "${name}"...`);

  const res = await fetch(`${BASE_URL}/${WABA_ID}/flows`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, categories: [category] }),
  });

  const data: any = await res.json();

  if (!res.ok) {
    console.error(`   ❌ Error creando Flow:`, data.error?.message || data);
    return null;
  }

  console.log(`   ✅ Flow creado con ID: ${data.id}`);
  return data.id;
}

async function uploadFlowJson(flowId: string, jsonFile: string): Promise<boolean> {
  console.log(`   📤 Subiendo JSON: ${jsonFile}...`);

  const jsonPath = path.join(__dirname, jsonFile);
  if (!fs.existsSync(jsonPath)) {
    console.error(`   ❌ Archivo no encontrado: ${jsonPath}`);
    return false;
  }

  const jsonContent = fs.readFileSync(jsonPath, "utf-8");
  const blob = new Blob([jsonContent], { type: "application/json" });

  const formData = new FormData();
  formData.append("name", "flow.json");
  formData.append("asset_type", "FLOW_JSON");
  formData.append("file", blob, "flow.json");

  const res = await fetch(`${BASE_URL}/${flowId}/assets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: formData,
  });

  const data: any = await res.json();

  if (!res.ok) {
    console.error(`   ❌ Error subiendo JSON:`, data.error?.message || data);
    return false;
  }

  console.log(`   ✅ JSON subido correctamente`);
  return true;
}

async function publishFlow(flowId: string): Promise<boolean> {
  console.log(`   🚀 Publicando Flow...`);

  const res = await fetch(`${BASE_URL}/${flowId}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  });

  const data: any = await res.json();

  if (!res.ok) {
    console.error(`   ❌ Error publicando Flow:`, data.error?.message || data);
    console.log(`   ℹ️  Puedes publicarlo manualmente desde Meta Business Manager`);
    return false;
  }

  console.log(`   ✅ Flow publicado`);
  return true;
}

async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║   Registrar WhatsApp Flows en Meta            ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log(`\n📌 WABA ID: ${WABA_ID}`);
  console.log(`📌 API Version: ${API_VERSION}`);

  const results: Array<{ name: string; envVarName: string; flowId: string }> = [];

  for (const flow of FLOWS) {
    // 1. Crear Flow
    const flowId = await createFlow(flow.name, flow.category);
    if (!flowId) continue;

    // 2. Subir JSON
    const uploaded = await uploadFlowJson(flowId, flow.jsonFile);
    if (!uploaded) continue;

    // 3. Publicar (puede fallar si necesita revisión)
    await publishFlow(flowId);

    results.push({
      name: flow.name,
      envVarName: flow.envVarName,
      flowId,
    });
  }

  // Mostrar resumen
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   RESUMEN - Variables de Entorno              ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  if (results.length === 0) {
    console.log("❌ No se crearon Flows. Revisa los errores anteriores.\n");
    return;
  }

  console.log("Agrega estas variables en Railway:\n");
  for (const r of results) {
    console.log(`${r.envVarName}=${r.flowId}`);
  }

  console.log(`\n✅ ${results.length}/${FLOWS.length} Flows registrados exitosamente.\n`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
