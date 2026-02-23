/**
 * Flow Manager — decide cuándo enviar un Flow y parsea las respuestas.
 *
 * Lógica:
 * - Después de que Convex responde, el server revisa si el nuevo estado
 *   necesita un Flow (ej: collecting_info → enviar Flow de nombre).
 * - Si hay Flow, se envía como mensaje interactivo EN LUGAR del texto.
 * - Cuando el usuario completa un Flow, el webhook recibe los datos
 *   estructurados y los convierte a texto que el state machine entiende.
 *
 * Los Flows son OPCIONALES. Si el usuario escribe texto en lugar de
 * usar el Flow, el state machine sigue funcionando normalmente.
 */

import { config } from "./config.js";
import { whatsappClient } from "./cloud-api.js";

// ==================== TIPOS ====================

export interface FlowConfig {
  flowId: string;
  ctaText: string; // Texto del botón
  screenId: string;
}

interface FlowResponseData {
  // Name Flow
  customer_name?: string;
  // Delivery Flow
  city?: string;
  address?: string;
  email?: string;
  // Cedula Flow
  cedula?: string;
}

// ==================== CONFIGURACIÓN DE FLOWS POR ESTADO ====================

/**
 * Mapeo de estados del state machine a Flows.
 * Solo los estados que tienen Flow configurado.
 */
function getFlowConfig(state: string): FlowConfig | null {
  const flows: Record<string, FlowConfig> = {};

  // Flow de nombre
  if (config.whatsapp.flowNameId) {
    flows["collecting_info"] = {
      flowId: config.whatsapp.flowNameId,
      ctaText: "Completar Datos",
      screenId: "NAME_SCREEN",
    };
  }

  // Flow de datos de entrega
  if (config.whatsapp.flowDeliveryId) {
    flows["collecting_delivery_info"] = {
      flowId: config.whatsapp.flowDeliveryId,
      ctaText: "Datos de Entrega",
      screenId: "DELIVERY_SCREEN",
    };
  }

  // Flow de cédula
  if (config.whatsapp.flowCedulaId) {
    flows["collecting_cedula"] = {
      flowId: config.whatsapp.flowCedulaId,
      ctaText: "Ingresar Cédula",
      screenId: "CEDULA_SCREEN",
    };
  }

  return flows[state] || null;
}

// ==================== ENVIAR FLOW ====================

/**
 * Intenta enviar un Flow para el estado dado.
 * Retorna true si se envió un Flow, false si se debe enviar texto normal.
 *
 * @param phone - Teléfono del usuario
 * @param state - Estado actual del state machine (ej: "collecting_info")
 * @param bodyText - Texto de Convex (se usa como cuerpo del mensaje con Flow)
 */
export async function trySendFlow(
  phone: string,
  state: string,
  bodyText: string
): Promise<boolean> {
  const flowConfig = getFlowConfig(state);

  if (!flowConfig) {
    return false; // No hay Flow para este estado
  }

  // Generar token único para este envío de Flow
  const flowToken = `${phone}_${state}_${Date.now()}`;

  const sent = await whatsappClient.sendFlow(
    phone,
    bodyText,
    flowConfig.flowId,
    flowToken,
    flowConfig.ctaText,
    flowConfig.screenId
  );

  if (sent) {
    console.log(`📋 Flow enviado: ${state} → ${phone}`);
    return true;
  }

  // Si falla el Flow, retornar false para que se envíe texto normal
  console.warn(`⚠️  Flow falló para ${state}, enviando texto normal`);
  return false;
}

// ==================== PARSEAR RESPUESTA DE FLOW ====================

/**
 * Parsea la respuesta de un WhatsApp Flow (nfm_reply) y retorna
 * texto formateado que el state machine de Convex puede entender.
 *
 * El state machine ya sabe parsear texto libre, así que convertimos
 * los datos estructurados del Flow a texto que coincida con lo esperado.
 */
export function parseFlowResponse(responseJson: string): string {
  try {
    const data: FlowResponseData = JSON.parse(responseJson);

    // Flow de nombre
    if (data.customer_name) {
      // El state machine usa extractNameWithAI() o validateName()
      // Simplemente retornamos el nombre limpio
      return data.customer_name.trim();
    }

    // Flow de datos de entrega
    if (data.city || data.address || data.email) {
      // El state machine usa mergeDeliveryInfo() que busca:
      // - Ciudad: "bogotá" o "cali"
      // - Dirección: texto con palabras clave (calle, carrera, etc.)
      // - Email: formato email@dominio.com
      // Enviamos todo en un solo mensaje para que lo parsee
      const parts: string[] = [];
      if (data.city) parts.push(data.city);
      if (data.address) parts.push(data.address);
      if (data.email) parts.push(data.email);
      return parts.join(", ");
    }

    // Flow de cédula
    if (data.cedula) {
      // El state machine usa extractCedulaFromText() que busca 6-12 dígitos
      return data.cedula.toString().trim();
    }

    // Si no reconocemos el formato, devolver el JSON como texto
    return responseJson;
  } catch {
    return responseJson;
  }
}

// ==================== UTILIDADES ====================

/**
 * Verifica si hay al menos un Flow configurado.
 * Útil para saber si se debe usar la lógica de Flows.
 */
export function hasAnyFlowConfigured(): boolean {
  return !!(
    config.whatsapp.flowNameId ||
    config.whatsapp.flowDeliveryId ||
    config.whatsapp.flowCedulaId
  );
}
