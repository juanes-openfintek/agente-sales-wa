// ============================================================
// SERVICIO DE IA CON GEMINI
// ============================================================

import { LeadInfo } from "./types";

// Configuración de Gemini
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface AIResponse {
  reply: string;
  orderItems?: string[];
  totalPrice?: number;
  action: string;
}

// Llamar a Gemini API
async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Error llamando a Gemini:", error);
      return null;
    }

    const data = (await response.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error("Error en llamada a Gemini:", error);
    return null;
  }
}

// Extraer nombre usando IA
export async function extractNameWithAI(
  userText: string,
  apiKey: string
): Promise<string | null> {
  if (!userText || userText.trim().length < 2) {
    return null;
  }

  const prompt = `Eres un asistente que extrae nombres de personas de mensajes de texto.

El usuario respondió a la pregunta "¿Cuál es tu nombre?" con el siguiente mensaje:
"${userText}"

Tu tarea es extraer SOLO el nombre de la persona.

REGLAS:
1. Extrae SOLO el nombre propio (puede incluir apellido si lo mencionó)
2. Ignora saludos, comentarios adicionales, quejas, o cualquier texto que no sea el nombre
3. Si el mensaje contiene frases como "me llamo X", "soy X", "mi nombre es X", extrae solo X
4. Si no puedes identificar un nombre válido, responde exactamente: NO_NAME
5. Un nombre válido tiene entre 2 y 50 caracteres y solo contiene letras y espacios
6. NO incluyas puntuación, números, ni palabras que no sean parte del nombre

Ejemplos:
- "Hola me llamo Juan" → Juan
- "Maria Garcia" → Maria Garcia
- "soy carlos y quiero pedir" → Carlos
- "Quiero ver el menú" → NO_NAME
- "123456" → NO_NAME

Responde SOLO con el nombre extraído (capitalizado correctamente) o NO_NAME. Sin explicaciones adicionales.`;

  const result = await callGemini(prompt, apiKey);

  if (!result) {
    return null;
  }

  const cleaned = result.trim().replace(/^["']|["']$/g, "");

  if (cleaned === "NO_NAME" || cleaned.toUpperCase() === "NO_NAME") {
    return null;
  }

  // Validar que sea un nombre válido
  if (cleaned.length < 2 || cleaned.length > 50) {
    return null;
  }

  // Verificar que solo contenga caracteres válidos para un nombre
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(cleaned)) {
    return null;
  }

  // Capitalizar correctamente
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Limpiar respuesta de Gemini para WhatsApp
function cleanGeminiResponse(text: string): string {
  // Convertir **texto** a *texto*
  text = text.replace(/\*\*(.*?)\*\*/g, "*$1*");
  // Convertir __texto__ a _texto_
  text = text.replace(/__(.*?)__/g, "_$1_");
  // Limpiar asteriscos múltiples
  text = text.replace(/\*{3,}/g, "*");
  // Formatear precios
  text = text.replace(/\$(\d+)/g, (_, num) => `$${Number(num).toLocaleString()}`);
  return text.trim();
}

// Generar respuesta de ventas con Gemini
export async function generateSalesResponse(
  userText: string,
  leadInfo: LeadInfo,
  catalog: string,
  conversationHistory: Array<{ direction: string; text: string }>,
  apiKey: string
): Promise<AIResponse> {
  const historyText = conversationHistory
    .slice(-10) // Últimos 10 mensajes
    .map((msg) => `${msg.direction === "in" ? "Cliente" : "Asistente"}: ${msg.text}`)
    .join("\n");

  const prompt = `Eres un asistente de ventas experto de un DISTRIBUIDOR DE CARNES CRUDAS de alta calidad. Vendemos carnes al por mayor y menor a clientes finales.

INFORMACIÓN DEL CLIENTE:
- Nombre: ${leadInfo.name || "No proporcionado"}
- Ciudad: ${leadInfo.city || "No proporcionada"}
- Email: ${leadInfo.email || "No proporcionado"}
- Dirección: ${leadInfo.address || "No proporcionada"}
- Estado: ${leadInfo.status}

CATÁLOGO DE PRODUCTOS:
${catalog}

HISTORIAL DE CONVERSACIÓN:
${historyText}

MENSAJE DEL CLIENTE:
"${userText}"

ZONAS DE COBERTURA:
- ✅ Bogotá
- ✅ Cali
- ❌ OTRAS CIUDADES: NO ENTREGAMOS

INSTRUCCIONES:
1. Responde de forma profesional pero cercana
2. Usa el nombre del cliente (${leadInfo.name || "cliente"}) de forma natural
3. Recomienda productos y combos del catálogo
4. Los COMBOS son más económicos - sugiérelos activamente
5. Cuando muestres un combo, indica items gratis con "🎁 GRATIS"
6. Si el cliente quiere pedir, resume productos y precio total

FORMATO DE MENSAJES (WhatsApp):
- Listas: • Item 1
- Precios: $XX,XXX
- Negrita: *texto*
- Gratis: 🎁 GRATIS

RESPONDE EN JSON ESTRICTO:
{
  "reply": "Tu respuesta al cliente...",
  "order_items": ["Producto 1 - $X", "🎁 Producto 2 - GRATIS"],
  "total_price": 0,
  "action": "none" | "ready_for_checkout"
}

Si el cliente está listo para confirmar su pedido, usa action: "ready_for_checkout".
Si no hay pedido aún, usa action: "none".`;

  const result = await callGemini(prompt, apiKey);

  if (!result) {
    return {
      reply: "Lo siento, tuve un problema procesando tu solicitud. ¿Podrías repetir?",
      action: "none",
    };
  }

  // Intentar parsear como JSON
  try {
    const cleanJson = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const data = JSON.parse(cleanJson) as AIResponse;

    return {
      reply: cleanGeminiResponse(data.reply || ""),
      orderItems: data.orderItems,
      totalPrice: data.totalPrice,
      action: data.action || "none",
    };
  } catch {
    // Si no es JSON, usar el texto directamente
    return {
      reply: cleanGeminiResponse(result),
      action: "none",
    };
  }
}
