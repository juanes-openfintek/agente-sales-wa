// ============================================================
// SERVICIO DE IA CON GEMINI + FALLBACK A GROQ
// ============================================================

import { encode } from "@toon-format/toon";
import { parseOrderItems } from "./orderUtils";
import { LeadInfo } from "./types";

// Configuración de Gemini - Usar el modelo más avanzado disponible
// (gemini-3-flash-preview)
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Configuración de Groq (fallback)
// Usamos un modelo no-reasoning para evitar respuestas con `content` vacío
// (algunos modelos de razonamiento pueden consumir tokens en `reasoning`)
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

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

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    code?: string;
  };
}

interface AIResponse {
  reply: string;
  orderItems?: string[];
  totalPrice?: number;
  action: string;
}

function truncateForContext(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function buildToonContext(
  leadInfo: LeadInfo,
  catalogData: unknown,
  conversationHistory: Array<{ direction: string; text: string }>
): string {
  const currentOrderItems = parseOrderItems(leadInfo.orderItems);

  const context = {
    customer: {
      name: leadInfo.name,
      city: leadInfo.city,
      email: leadInfo.email,
      address: leadInfo.address,
      status: leadInfo.status,
      paymentMethod: leadInfo.paymentMethod,
      storeType: leadInfo.storeType,
    },
    currentOrder: currentOrderItems.length > 0
      ? {
          items: currentOrderItems.map((item) => ({ item })),
          total: leadInfo.orderTotal,
        }
      : undefined,
    history: conversationHistory.slice(-8).map((message) => ({
      role: message.direction === "in" ? "client" : "assistant",
      text: truncateForContext(message.text, 160),
    })),
    catalog: catalogData,
  };

  return encode(context, {
    replacer: (_key, value) => {
      if (value === null || value === undefined || value === "") return undefined;
      if (Array.isArray(value) && value.length === 0) return undefined;
      return value;
    },
  });
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
          maxOutputTokens: 900,
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

// ============================================================
// GROQ API (Fallback)
// ============================================================

// Llamar a Groq API con historial de chat
// Misma arquitectura de contexto que Gemini: system prompt + historial + mensaje actual
// empaquetados de forma idéntica para consistencia en las respuestas
async function callGroq(
  systemPrompt: string,
  conversationHistory: Array<{ role: string; text: string }>,
  userMessage: string,
  apiKey: string
): Promise<string | null> {
  try {
    // Construir contexto idéntico a callGemini: system + historial en un bloque
    let systemContext = systemPrompt;

    if (conversationHistory.length > 0) {
      systemContext += "\n\nHISTORIAL DE LA CONVERSACIÓN RECIENTE:\n";
      for (const msg of conversationHistory) {
        const role = msg.role === "in" ? "Cliente" : "Asistente";
        systemContext += `${role}: ${msg.text}\n`;
      }
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemContext },
      { role: "user", content: "MENSAJE ACTUAL DEL CLIENTE:\n\"" + userMessage + "\"" },
    ];

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 900,
        top_p: 0.8,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error llamando a Groq (${response.status}):`, error);
      return null;
    }

    const data = (await response.json()) as GroqResponse;

    if (data.error) {
      console.error("Error de Groq API:", data.error.message);
      return null;
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error("Groq devolvió content vacío");
      return null;
    }

    return content;
  } catch (error) {
    console.error("Error en llamada a Groq:", error);
    return null;
  }
}

// Llamar a Groq con un solo prompt (para extracción simple)
async function callGroqSimple(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Error llamando a Groq:", error);
      return null;
    }

    const data = (await response.json()) as GroqResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error("Groq simple devolvió content vacío");
      return null;
    }

    return content;
  } catch (error) {
    console.error("Error en llamada a Groq:", error);
    return null;
  }
}

// Wrapper: intenta Gemini primero, luego Groq como fallback
async function callAI(
  systemPrompt: string,
  conversationHistory: Array<{ role: string; text: string }>,
  userMessage: string,
  geminiApiKey: string,
  groqApiKey: string
): Promise<string | null> {
  if (geminiApiKey) {
    const result = await callGemini(systemPrompt, conversationHistory, userMessage, geminiApiKey);
    if (result) return result;
    console.warn("Gemini falló, intentando con Groq como fallback...");
  }
  if (groqApiKey) {
    return await callGroq(systemPrompt, conversationHistory, userMessage, groqApiKey);
  }
  return null;
}

// Wrapper simple: intenta Gemini primero, luego Groq como fallback
async function callAISimple(
  prompt: string,
  geminiApiKey: string,
  groqApiKey: string
): Promise<string | null> {
  if (geminiApiKey) {
    const result = await callGeminiSimple(prompt, geminiApiKey);
    if (result) return result;
    console.warn("Gemini simple falló, intentando con Groq como fallback...");
  }
  if (groqApiKey) {
    return await callGroqSimple(prompt, groqApiKey);
  }
  return null;
}

// ============================================================
// FUNCIONES EXPORTADAS
// ============================================================

// Extraer nombre usando IA
export async function extractNameWithAI(
  userText: string,
  geminiApiKey: string,
  groqApiKey: string
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

  const result = await callAISimple(prompt, geminiApiKey, groqApiKey);

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

// Limpiar prefijos de "pensamiento" que algunos modelos agregan (ej: Gemini flash)
// Patrones comunes: "thought{...}\n{json}", "<think>...</think>{json}", etc.
function stripThinkingPrefix(text: string): string {
  // Eliminar bloques "thought{...}" o "thought {...}" al inicio
  text = text.replace(/^thought\s*\{[\s\S]*?\}\s*/i, "");
  // Eliminar bloques <think>...</think> al inicio
  text = text.replace(/^<think>[\s\S]*?<\/think>\s*/i, "");
  return text;
}

// Extraer el reply de una respuesta de IA, sin importar si es JSON válido o no.
// Maneja: JSON completo, JSON truncado, JSON con errores, o texto plano.
function extractReplyFromAIResponse(raw: string): AIResponse {
  // 1. Limpiar markdown code blocks y thinking prefixes
  let text = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  text = stripThinkingPrefix(text);

  // 2. Intentar parsear como JSON completo
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      // Escapar newlines dentro de strings JSON
      jsonStr = jsonStr.replace(/"([^"\\]|\\.)*"/g, (match) => {
        return match
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
      });

      const data = JSON.parse(jsonStr) as {
        reply?: string;
        order_items?: string[];
        total_price?: number;
        action?: string;
      };

      if (data.reply) {
        const validActions = ["none", "ready_for_checkout"];
        return {
          reply: cleanGeminiResponse(data.reply),
          orderItems: data.order_items,
          totalPrice: data.total_price,
          action: validActions.includes(data.action || "") ? data.action! : "none",
        };
      }
    }
  } catch {
    // JSON parsing falló — seguimos intentando
  }

  // 3. Extraer reply con regex (funciona con JSON truncado/roto)
  // Buscar "reply": "..." incluso si el JSON está incompleto
  const replyMatch = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)(")?/);
  if (replyMatch && replyMatch[1]) {
    let extracted = replyMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"');
    return {
      reply: cleanGeminiResponse(extracted),
      action: "none",
    };
  }

  // 4. Último fallback: si el texto parece JSON crudo, limpiar las llaves y keys
  // Esto cubre el caso donde sale { "reply": "texto... sin cerrar
  let cleaned = text;
  // Quitar { al inicio y } al final si existen
  cleaned = cleaned.replace(/^\s*\{?\s*"reply"\s*:\s*"?/, "");
  // Quitar trailing JSON artifacts
  cleaned = cleaned.replace(/",?\s*"order_items"[\s\S]*$/, "");
  cleaned = cleaned.replace(/",?\s*"action"[\s\S]*$/, "");
  cleaned = cleaned.replace(/"\s*\}\s*$/, "");

  if (cleaned && cleaned !== text) {
    // Pudimos extraer algo del JSON roto
    return {
      reply: cleanGeminiResponse(cleaned.replace(/\\n/g, "\n").replace(/\\"/g, '"')),
      action: "none",
    };
  }

  // 5. Si nada funcionó, devolver el texto limpio (sin JSON artifacts)
  return {
    reply: cleanGeminiResponse(text),
    action: "none",
  };
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
  catalogData: unknown,
  conversationHistory: Array<{ direction: string; text: string }>,
  geminiApiKey: string,
  groqApiKey: string
): Promise<AIResponse> {
  const customerName = leadInfo.name || "cliente";
  const toonContext = buildToonContext(leadInfo, catalogData, conversationHistory);

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
CONTEXTO ESTRUCTURADO (TOON):
${toonContext}

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
- Responde de forma breve: normalmente entre 2 y 5 lineas cortas
- Evita bloques largos, introducciones repetidas y volver a explicar todo el catalogo
- Si haces recomendaciones, prioriza 1 opcion principal y como maximo 3 opciones
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
- Prioriza respuestas cortas y utiles
- Normalmente responde en 1 a 3 lineas
- Si una frase basta, no agregues relleno
- Suena cercano y amable, nunca frio ni robotico
- Para listas usa bullets: • Item 1
- Para precios usa: $XX,XXX
- Para separadores usa: ━━━━━━━━━━━━━━━━━━━━━
- Para destacar usa: *texto* (negrita simple)
- Para gratis usa: 🎁 GRATIS
- NO uses **texto** (doble asterisco) - usa solo *texto*
- Evita mensajes de mas de 80 palabras salvo que el cliente pida mucho detalle

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

Si no hay un pedido concreto, order_items debe ser [] y total_price debe ser 0.

REGLAS EXTRA PARA EVITAR LOOPS:
- Nunca pidas nombre, ciudad, direccion, email, cedula, metodo de pago ni comprobante
- Si el cliente dice que ya dio un dato, reconoce el contexto y no lo pidas otra vez
- Si falta un detalle del pedido, pregunta solo por el siguiente dato puntual`;

  // Preparar historial formateado
  const formattedHistory = conversationHistory.map((msg) => ({
    role: msg.direction,
    text: msg.text,
  }));

  const result = await callAI(
    systemPrompt,
    formattedHistory,
    userText,
    geminiApiKey,
    groqApiKey
  );

  if (!result) {
    return {
      reply: `Lo siento ${customerName}, tuve un problema procesando tu solicitud. ¿Podrías repetir?`,
      action: "none",
    };
  }

  return extractReplyFromAIResponse(result);
}

// ============================================================
// GENERAR RESPUESTA DE VENTAS — CAMISETAS
// ============================================================
export async function generateShirtSalesResponse(
  userText: string,
  leadInfo: LeadInfo,
  catalogData: unknown,
  conversationHistory: Array<{ direction: string; text: string }>,
  geminiApiKey: string,
  groqApiKey: string
): Promise<AIResponse> {
  const customerName = leadInfo.name || "cliente";
  const toonContext = buildToonContext(leadInfo, catalogData, conversationHistory);

  // Construir el pedido actual si existe
  let currentOrderContext = "";
  if (leadInfo.orderItems) {
    try {
      const items = JSON.parse(leadInfo.orderItems);
      if (Array.isArray(items) && items.length > 0) {
        currentOrderContext = `\nPEDIDO ACTUAL DEL CLIENTE:\n${items.map((i: string) => `• ${i}`).join("\n")}\nTotal actual: $${(leadInfo.orderTotal || 0).toLocaleString()}\n`;
      }
    } catch {
      // Ignorar si no es JSON válido
    }
  }

  const systemPrompt = `Eres un asistente de ventas experto de una tienda de *Camisetas Piel de Durazno*. Vendemos camisetas al por mayor y menor para dama, caballero y niño. Tu objetivo es ayudar al cliente a elegir las camisetas que necesita y cerrar la venta.

INFORMACIÓN DEL CLIENTE:
- Nombre: ${customerName}
- Ciudad: ${leadInfo.city || "No proporcionada"}
- Email: ${leadInfo.email || "No proporcionado"}
- Dirección: ${leadInfo.address || "No proporcionada"}
- Estado actual: ${leadInfo.status}
${currentOrderContext}
CONTEXTO ESTRUCTURADO (TOON):
${toonContext}

REGLAS DE PRECIO (MUY IMPORTANTE — lee con atención):
- Lo que determina si hay recargo o no es el TOTAL DE UNIDADES del pedido completo (sumando todos los tipos)
- Si el total de unidades es 6 o más → cada camiseta se cobra al PRECIO BASE de su tipo
- Si el total de unidades es menos de 6 → cada camiseta se cobra al PRECIO BASE + $2.000

PRECIOS BASE por tipo:
- Dama: $11.000 | Con recargo (<6 und): $13.000
- Caballero: $12.000 | Con recargo (<6 und): $14.000
- Niño: $9.000 | Con recargo (<6 und): $11.000

EJEMPLOS DE CÁLCULO:
- 3 Dama + 3 Caballero = 6 unidades total → SIN recargo → 3×$11.000 + 3×$12.000 = $69.000
- 2 Dama + 2 Niño = 4 unidades total → CON recargo → 2×$13.000 + 2×$11.000 = $48.000
- 3 Caballero + 3 Dama = 6 unidades total → SIN recargo → 3×$12.000 + 3×$11.000 = $69.000
- 2 Caballero = 2 unidades total → CON recargo → 2×$14.000 = $28.000

CUANDO MUESTRES EL RESUMEN DEL PEDIDO:
- Muestra el precio unitario que REALMENTE aplica (ya con recargo incluido si corresponde)
- NO muestres "precio base + recargo" por separado, solo muestra el precio final por unidad
- Menciona brevemente si aplica o no el recargo y por qué (ej: "Como son menos de 6 unidades, aplica un recargo de $2.000 por camiseta")
- SIEMPRE menciona la regla de precio cuando el cliente pregunte por cantidades menores a 6

ENVÍO:
- Bogotá: $10.000 fijo (menciónalo cuando sepas que es de Bogotá)
- Otras ciudades: el costo de envío se cotiza; informa al cliente que lo avisarás
- NO hay restricción de ciudad — enviamos a todo el país

FLUJO DE VENTAS:

1. **EXPLORACIÓN DE PRODUCTOS**:
   - SIEMPRE usa el nombre del cliente (${customerName}) de forma natural
   - Presenta las opciones: dama ($11.000 base), caballero ($12.000 base), niño ($9.000 base)
   - Destaca los 19 colores disponibles y la variedad de tallas
   - Ayuda al cliente a calcular su pedido: tipo + talla + color + cantidad
   - Recuerda aplicar y mostrar la regla de precio según la cantidad

2. **CUANDO EL CLIENTE QUIERA HACER PEDIDO**:
   - Confirma los detalles: tipo de camiseta, talla, color, cantidad
   - Calcula el total con la regla de precio correspondiente
   - Incluye el envío si ya conoces la ciudad
   - Si ya tienes toda la info del cliente, responde con action: "ready_for_checkout"

REGLAS CRÍTICAS:
- Sé profesional pero cercano y amable
- Responde de forma breve: normalmente entre 2 y 5 lineas cortas
- Evita bloques largos, introducciones repetidas y volver a explicar todo el catalogo
- Si muestras opciones, prioriza 1 opcion principal y como maximo 3 opciones
- Habla de CAMISETAS, no de carnes ni otros productos
- NUNCA digas que no hay stock, que no hay disponibilidad o que no hay camisetas. SIEMPRE tenemos camisetas disponibles. El inventario lo manejamos nosotros internamente — tú solo vendes
- NUNCA confirmes un pedido que el cliente NO haya hecho explícitamente
- Solo usa action "ready_for_checkout" cuando el cliente EXPLÍCITAMENTE diga que quiere proceder (ej: "listo", "eso es todo", "quiero pedir eso")
- Si solo está preguntando precios o colores, NO asumas que quiere comprar

FORMATO DE MENSAJES (WhatsApp):
- Prioriza respuestas cortas y utiles
- Normalmente responde en 1 a 3 lineas
- Si una frase basta, no agregues relleno
- Suena cercano y amable, nunca frio ni robotico
- Para listas usa bullets: • Item 1
- Para precios usa: $XX.XXX
- Para separadores usa: ━━━━━━━━━━━━━━━━━━━━━
- Para destacar usa: *texto* (negrita simple)
- NO uses **texto** (doble asterisco)
- Evita mensajes de mas de 80 palabras salvo que el cliente pida mucho detalle

FORMATO DE RESPUESTA JSON (ESTRICTO - solo JSON, sin texto antes ni después):
{
    "reply": "Tu respuesta al cliente...",
    "order_items": ["Camiseta Dama Negra Talla M x2 - $26.000"],
    "total_price": 26000,
    "action": "none"
}

VALORES VÁLIDOS PARA "action":
- "none": Para la mayoría de interacciones
- "ready_for_checkout": SOLO cuando el cliente dice explícitamente que quiere proceder a comprar

Si no hay pedido concreto, order_items debe ser [] y total_price debe ser 0.

REGLAS EXTRA PARA EVITAR LOOPS:
- Nunca pidas nombre, ciudad, direccion, email, cedula, metodo de pago ni comprobante
- Si el cliente dice que ya dio un dato, reconoce el contexto y no lo pidas otra vez
- Si falta un detalle del pedido, pregunta solo por el siguiente dato puntual`;

  const formattedHistory = conversationHistory.map((msg) => ({
    role: msg.direction,
    text: msg.text,
  }));

  const result = await callAI(
    systemPrompt,
    formattedHistory,
    userText,
    geminiApiKey,
    groqApiKey
  );

  if (!result) {
    return {
      reply: `Lo siento ${customerName}, tuve un problema procesando tu solicitud. ¿Podrías repetir?`,
      action: "none",
    };
  }

  return extractReplyFromAIResponse(result);
}
