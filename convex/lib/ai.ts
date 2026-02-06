// ============================================================
// SERVICIO DE IA CON GEMINI
// ============================================================

import { LeadInfo } from "./types";

// Configuración de Gemini - Usar el modelo más avanzado disponible
// gemini-2.5-flash-preview-04-17 es equivalente al que se usaba en Python (gemini-3-flash-preview)
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
    code?: number;
  };
}

interface AIResponse {
  reply: string;
  orderItems?: string[];
  totalPrice?: number;
  action: string;
}

// Llamar a Gemini API con historial de chat
async function callGemini(
  systemPrompt: string,
  conversationHistory: Array<{ role: string; text: string }>,
  userMessage: string,
  apiKey: string
): Promise<string | null> {
  try {
    // Construir el historial de conversación como contexto
    // Gemini REST API acepta múltiples "contents" para simular chat
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Sistema + historial como primer mensaje del "user"
    // (Gemini no tiene un rol "system" explícito en REST, lo incluimos como contexto)
    let systemContext = systemPrompt;

    if (conversationHistory.length > 0) {
      systemContext += "\n\nHISTORIAL DE LA CONVERSACIÓN RECIENTE:\n";
      for (const msg of conversationHistory) {
        const role = msg.role === "in" ? "Cliente" : "Asistente";
        systemContext += `${role}: ${msg.text}\n`;
      }
    }

    // Primer turno: system context
    contents.push({
      role: "user",
      parts: [{ text: systemContext + "\n\nMENSAJE ACTUAL DEL CLIENTE:\n\"" + userMessage + "\"" }],
    });

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.4, // Más bajo = más preciso y menos alucinaciones
          maxOutputTokens: 2048,
          topP: 0.8,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error llamando a Gemini (${response.status}):`, error);
      return null;
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      console.error("Error de Gemini API:", data.error.message);
      return null;
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error("Error en llamada a Gemini:", error);
    return null;
  }
}

// Llamar a Gemini con un solo prompt (para extracción simple)
async function callGeminiSimple(prompt: string, apiKey: string): Promise<string | null> {
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
          temperature: 0.1, // Muy bajo para extracción precisa
          maxOutputTokens: 100,
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
- "Si, mi nombre es Pedro pero no se para que lo necesitas" → Pedro
- "Maria Garcia" → Maria Garcia
- "soy carlos y quiero pedir" → Carlos
- "Buenos dias soy la señora Martha" → Martha
- "Quiero ver el menú" → NO_NAME
- "123456" → NO_NAME
- "hola" → NO_NAME
- "Si claro, me llamo Ana María Pérez" → Ana María Pérez
- "Jajaja ok soy Roberto" → Roberto

Responde SOLO con el nombre extraído (capitalizado correctamente) o NO_NAME. Sin explicaciones adicionales.`;

  const result = await callGeminiSimple(prompt, apiKey);

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
  // Convertir **texto** a *texto* (formato WhatsApp)
  text = text.replace(/\*\*(.*?)\*\*/g, "*$1*");
  // Convertir __texto__ a _texto_
  text = text.replace(/__(.*?)__/g, "_$1_");
  // Convertir ~~texto~~ a ~texto~
  text = text.replace(/~~(.*?)~~/g, "~$1~");
  // Limpiar asteriscos múltiples
  text = text.replace(/\*{3,}/g, "*");
  // Formatear precios - $XXXXX a $XX,XXX
  text = text.replace(/\$(\d+)/g, (_, num) => `$${Number(num).toLocaleString()}`);
  return text.trim();
}

// ============================================================
// GENERAR RESPUESTA DE VENTAS CON GEMINI
// ============================================================
export async function generateSalesResponse(
  userText: string,
  leadInfo: LeadInfo,
  catalog: string,
  conversationHistory: Array<{ direction: string; text: string }>,
  apiKey: string
): Promise<AIResponse> {
  const customerName = leadInfo.name || "cliente";

  // Construir el pedido actual si existe
  let currentOrderContext = "";
  if (leadInfo.orderItems) {
    try {
      const items = JSON.parse(leadInfo.orderItems);
      if (Array.isArray(items) && items.length > 0) {
        currentOrderContext = `\nPEDIDO ACTUAL DEL CLIENTE:\n${items.map((i: string) => `• ${i}`).join("\n")}\nTotal actual: $${(leadInfo.orderTotal || 0).toLocaleString()}\n`;
      }
    } catch {
      // Si no es JSON válido, ignorar
    }
  }

  const systemPrompt = `Eres un asistente de ventas experto de un DISTRIBUIDOR DE CARNES CRUDAS de alta calidad. Vendemos carnes al por mayor y menor a clientes finales. Tu objetivo es ayudar al cliente a encontrar las carnes que necesita y cerrar la venta.

INFORMACIÓN DEL CLIENTE:
- Nombre: ${customerName}
- Ciudad: ${leadInfo.city || "No proporcionada"}
- Email: ${leadInfo.email || "No proporcionado"}
- Dirección: ${leadInfo.address || "No proporcionada"}
- Estado actual: ${leadInfo.status}
${currentOrderContext}
CATÁLOGO COMPLETO DE CARNES Y COMBOS:
${catalog}

ZONAS DE COBERTURA:
- ✅ Bogotá
- ✅ Cali
- ❌ OTRAS CIUDADES: NO ENTREGAMOS (debes informar al cliente amablemente)

FLUJO DE VENTAS:

1. **EXPLORACIÓN DE PRODUCTOS**:
   - SIEMPRE usa el nombre del cliente (${customerName}) en tus respuestas de forma natural
   - Recomienda productos individuales (carnes por kilo) y combos
   - Explica las características de cada carne (ej: "Carne desmechada ideal para arepas, empanadas")
   - Los COMBOS son MÁS ECONÓMICOS - sugiérelos activamente mencionando los items gratis cuando aplique
   - Cuando muestres un combo, indica claramente qué items son gratis con "🎁 GRATIS"
   - Calcula el precio total considerando los items gratis
   - Menciona que vendemos al por mayor y menor

2. **CUANDO EL CLIENTE QUIERA HACER PEDIDO**:
   - Resume los productos y precio total (considerando items gratis)
   - Si ya tienes toda la info del cliente, responde con action: "ready_for_checkout"
   - Si falta información, el sistema se la pedirá automáticamente

REGLAS CRÍTICAS - LEE CON ATENCIÓN:
- Sé profesional pero cercano y amable
- Habla de carnes CRUDAS, no de comida preparada
- Menciona que son productos frescos y de alta calidad
- DESTACA LOS ITEMS GRATIS en los combos para hacerlos más atractivos
- NO inventes productos que no estén en el catálogo
- Si preguntan por una ciudad diferente a Bogotá o Cali, informa que NO entregamos allí
- NUNCA confirmes un pedido que el cliente NO haya hecho explícitamente
- NUNCA digas "tu pedido está listo" o "pedido confirmado" a menos que el cliente haya dicho claramente qué quiere comprar
- Si el cliente solo está preguntando, explorando o saludando, NO asumas que quiere hacer un pedido
- Solo usa action "ready_for_checkout" cuando el cliente EXPLÍCITAMENTE diga que quiere proceder con la compra (ej: "listo", "eso es todo", "confirmo", "quiero pedir eso")
- Si el cliente pregunta precios o info de productos, eso NO es un pedido - es exploración

FORMATO DE MENSAJES (IMPORTANTE - Usa formato WhatsApp):
- Para listas usa bullets: • Item 1
- Para precios usa: $XX,XXX
- Para separadores usa: ━━━━━━━━━━━━━━━━━━━━━
- Para destacar usa: *texto* (negrita simple)
- Para gratis usa: 🎁 GRATIS
- NO uses **texto** (doble asterisco) - usa solo *texto*

FORMATO DE RESPUESTA JSON (ESTRICTO - solo JSON, sin texto antes ni después):
{
    "reply": "Tu respuesta al cliente...",
    "order_items": ["Producto 1 - $X", "🎁 Producto gratis - GRATIS"],
    "total_price": 0,
    "action": "none"
}

VALORES VÁLIDOS PARA "action":
- "none": Para la mayoría de interacciones (exploración, preguntas, saludos, etc.)
- "ready_for_checkout": SOLO cuando el cliente dice explícitamente que quiere proceder a comprar

Si no hay un pedido concreto, order_items debe ser [] y total_price debe ser 0.`;

  // Preparar historial formateado
  const formattedHistory = conversationHistory.map((msg) => ({
    role: msg.direction,
    text: msg.text,
  }));

  const result = await callGemini(
    systemPrompt,
    formattedHistory,
    userText,
    apiKey
  );

  if (!result) {
    return {
      reply: `Lo siento ${customerName}, tuve un problema procesando tu solicitud. ¿Podrías repetir?`,
      action: "none",
    };
  }

  // Intentar parsear como JSON
  try {
    const cleanJson = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // Buscar el JSON en la respuesta (a veces Gemini agrega texto antes/después)
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No se encontró JSON en la respuesta de Gemini:", cleanJson.substring(0, 200));
      return {
        reply: cleanGeminiResponse(cleanJson),
        action: "none",
      };
    }

    const data = JSON.parse(jsonMatch[0]) as {
      reply?: string;
      order_items?: string[];
      total_price?: number;
      action?: string;
    };

    // Validar que la acción sea válida
    const validActions = ["none", "ready_for_checkout"];
    const parsedAction = validActions.includes(data.action || "") ? data.action! : "none";

    return {
      reply: cleanGeminiResponse(data.reply || ""),
      orderItems: data.order_items,
      totalPrice: data.total_price,
      action: parsedAction,
    };
  } catch (e) {
    console.error("Error parseando JSON de Gemini:", e, "Respuesta:", result.substring(0, 300));
    // Si no es JSON, usar el texto directamente
    return {
      reply: cleanGeminiResponse(result),
      action: "none",
    };
  }
}
