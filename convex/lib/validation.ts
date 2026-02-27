// ============================================================
// FUNCIONES DE VALIDACIÓN
// ============================================================

import { VALID_CITIES } from "./types";

// Palabras que NUNCA son un nombre de persona
const NON_NAME_WORDS = new Set([
  // Saludos
  "hola", "hello", "hi", "hey", "alo", "aló", "buenas", "buenos",
  // Saludos con tiempo
  "buen", "buendia", "buendía",
  // Respuestas cortas
  "si", "sí", "no", "ok", "okay", "okey", "dale", "listo", "claro", "bien",
  "mal", "regular", "gracias", "porfa", "perfecto", "exacto", "correcto",
  // Preguntas / conectores
  "que", "qué", "como", "cómo", "cuando", "cuándo", "donde", "dónde",
  "quien", "quién", "cual", "cuál", "para", "con", "por", "favor",
  // Palabras de chat
  "jaja", "jeje", "xd", "lol", "oke", "va", "ya", "ah", "oh", "uh",
  // Expresiones
  "genial", "excelente", "super", "súper", "chévere", "chevere",
]);

// Verifica si un texto es claramente un saludo/palabra común y no un nombre
export function isLikelyNotAName(text: string): boolean {
  const lower = text.trim().toLowerCase();
  // Si cada palabra del texto está en el blocklist, no es un nombre
  const words = lower.split(/\s+/);
  return words.every((w) => NON_NAME_WORDS.has(w));
}

// Validar nombre
export function validateName(name: string): { isValid: boolean; error?: string } {
  if (!name || name.trim().length < 2) {
    return { isValid: false, error: "El nombre debe tener al menos 2 caracteres" };
  }
  if (name.trim().length > 100) {
    return { isValid: false, error: "El nombre es demasiado largo" };
  }
  // Rechazar si parece ser solo números o caracteres especiales
  if (/^[\d\s\W]+$/.test(name)) {
    return { isValid: false, error: "El nombre no parece válido" };
  }
  // Rechazar saludos y palabras comunes que no son nombres
  if (isLikelyNotAName(name)) {
    return { isValid: false, error: "Eso no parece un nombre" };
  }
  return { isValid: true };
}

// Validar email
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: "El email no tiene un formato válido" };
  }
  return { isValid: true };
}

// Validar dirección
export function validateAddress(address: string): { isValid: boolean; error?: string } {
  if (!address || address.trim().length < 10) {
    return { isValid: false, error: "La dirección es muy corta" };
  }
  if (address.trim().length > 200) {
    return { isValid: false, error: "La dirección es demasiado larga" };
  }
  return { isValid: true };
}

// Validar cédula colombiana
export function validateCedula(cedula: string): { isValid: boolean; error?: string } {
  // Limpiar caracteres no numéricos
  const cleanCedula = cedula.replace(/\D/g, "");

  if (cleanCedula.length < 6 || cleanCedula.length > 12) {
    return { isValid: false, error: "La cédula debe tener entre 6 y 12 dígitos" };
  }
  return { isValid: true };
}

// Extraer email del texto
export function extractEmailFromText(text: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : null;
}

// Extraer cédula del texto
export function extractCedulaFromText(text: string): string | null {
  // Buscar secuencias de 6-12 dígitos
  const cedulaRegex = /\b\d{6,12}\b/;
  const match = text.replace(/[.\-\s]/g, "").match(cedulaRegex);
  return match ? match[0] : null;
}

// Extraer ciudad del texto
export function extractCityFromText(text: string): string | null {
  const textLower = text.toLowerCase();

  for (const city of VALID_CITIES) {
    if (textLower.includes(city)) {
      // Normalizar a formato capitalizado
      return city === "bogota" || city === "bogotá" ? "Bogotá" : "Cali";
    }
  }
  return null;
}

// Verificar si parece una dirección
export function looksLikeAddress(text: string): boolean {
  const addressKeywords = [
    "calle", "carrera", "cra", "cl", "avenida", "av",
    "transversal", "tr", "diagonal", "dg", "manzana",
    "conjunto", "edificio", "torre", "apto", "apartamento",
    "casa", "local", "oficina", "#", "no.", "número"
  ];

  const textLower = text.toLowerCase();
  return addressKeywords.some(keyword => textLower.includes(keyword));
}

// Detectar intención de pedido
export function isOrderIntent(text: string): boolean {
  const orderKeywords = [
    "quiero", "quisiera", "me gustaría", "pedido", "pedir",
    "ordenar", "comprar", "llevar", "combo", "hamburguesa",
    "pizza", "perro", "hot dog"
  ];

  const textLower = text.toLowerCase();
  return orderKeywords.some(keyword => textLower.includes(keyword));
}

// Detectar solicitud de nuevo pedido
export function isNewOrderRequest(text: string): boolean {
  const newOrderKeywords = [
    "nuevo pedido", "otro pedido", "pedir de nuevo",
    "quiero pedir", "hacer otro", "nueva orden"
  ];

  const textLower = text.toLowerCase();
  return newOrderKeywords.some(keyword => textLower.includes(keyword));
}

// Detectar solicitud de modificación
export function isModificationRequest(text: string): boolean {
  const modificationKeywords = [
    "cambiar", "modificar", "agregar", "quitar", "añadir",
    "eliminar", "diferente", "otro", "más", "menos"
  ];

  const textLower = text.toLowerCase();
  return modificationKeywords.some(keyword => textLower.includes(keyword));
}

// Verificar si tiene todos los datos de envío
export function hasDeliveryInfo(leadInfo: {
  city?: string;
  address?: string;
  email?: string;
}): boolean {
  return !!(leadInfo.city && leadInfo.address && leadInfo.email);
}

// Extraer datos de envío del texto
export function mergeDeliveryInfo(
  text: string,
  currentInfo: { city?: string; address?: string; email?: string }
): { city?: string; address?: string; email?: string } {
  const result = { ...currentInfo };

  // Extraer email si no existe
  if (!result.email) {
    const email = extractEmailFromText(text);
    if (email) {
      const validation = validateEmail(email);
      if (validation.isValid) {
        result.email = email;
      }
    }
  }

  // Extraer ciudad si no existe
  if (!result.city) {
    const city = extractCityFromText(text);
    if (city) {
      result.city = city;
    }
  }

  // Extraer dirección si no existe y parece dirección
  if (!result.address && looksLikeAddress(text)) {
    // Quitar email del texto para no contaminarlo
    let cleanText = text;
    if (result.email) {
      cleanText = text.replace(result.email, "").trim();
    }

    const validation = validateAddress(cleanText);
    if (validation.isValid) {
      result.address = cleanText.trim();
    }
  }

  return result;
}
