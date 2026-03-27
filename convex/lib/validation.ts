// ============================================================
// FUNCIONES DE VALIDACION
// ============================================================

import {
  DELIVERY_RECEIVER_TYPES,
  VALID_CITIES,
  type DeliveryReceiverType,
} from "./types";

// Palabras que NUNCA son un nombre de persona
const NON_NAME_WORDS = new Set([
  "hola", "hello", "hi", "hey", "alo", "alo", "buenas", "buenos",
  "buen", "buendia", "buendia",
  "si", "si", "no", "ok", "okay", "okey", "dale", "listo", "claro", "bien",
  "mal", "regular", "gracias", "porfa", "perfecto", "exacto", "correcto",
  "que", "que", "como", "como", "cuando", "cuando", "donde", "donde",
  "quien", "quien", "cual", "cual", "para", "con", "por", "favor",
  "jaja", "jeje", "xd", "lol", "oke", "va", "ya", "ah", "oh", "uh",
  "genial", "excelente", "super", "super", "chevere", "chevere",
]);

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function capitalizeWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Verifica si un texto es claramente un saludo/palabra comun y no un nombre
export function isLikelyNotAName(text: string): boolean {
  const lower = normalizeText(text);
  const words = lower.split(/\s+/);
  return words.every((word) => NON_NAME_WORDS.has(word));
}

// Validar nombre
export function validateName(name: string): { isValid: boolean; error?: string } {
  if (!name || name.trim().length < 2) {
    return { isValid: false, error: "El nombre debe tener al menos 2 caracteres" };
  }
  if (name.trim().length > 100) {
    return { isValid: false, error: "El nombre es demasiado largo" };
  }
  if (/^[\d\s\W]+$/.test(name)) {
    return { isValid: false, error: "El nombre no parece valido" };
  }
  if (isLikelyNotAName(name)) {
    return { isValid: false, error: "Eso no parece un nombre" };
  }
  return { isValid: true };
}

// Validar email
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: "El email no tiene un formato valido" };
  }
  return { isValid: true };
}

// Validar telefono
export function validatePhone(phone: string): { isValid: boolean; error?: string } {
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 7 || cleanPhone.length > 15) {
    return { isValid: false, error: "El telefono debe tener entre 7 y 15 digitos" };
  }
  return { isValid: true };
}

// Validar direccion
export function validateAddress(address: string): { isValid: boolean; error?: string } {
  if (!address || address.trim().length < 10) {
    return { isValid: false, error: "La direccion es muy corta" };
  }
  if (address.trim().length > 200) {
    return { isValid: false, error: "La direccion es demasiado larga" };
  }
  return { isValid: true };
}

// Validar cedula colombiana
export function validateCedula(cedula: string): { isValid: boolean; error?: string } {
  const cleanCedula = cedula.replace(/\D/g, "");

  if (cleanCedula.length < 6 || cleanCedula.length > 12) {
    return { isValid: false, error: "La cedula debe tener entre 6 y 12 digitos" };
  }
  return { isValid: true };
}

// Extraer email del texto
export function extractEmailFromText(text: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : null;
}

// Extraer telefono del texto
export function extractPhoneFromText(text: string): string | null {
  const phoneRegex = /(?:\+?\d[\d\s-]{6,}\d)/;
  const match = text.match(phoneRegex);
  if (!match) return null;

  const cleanPhone = match[0].replace(/\D/g, "");
  const validation = validatePhone(cleanPhone);
  return validation.isValid ? cleanPhone : null;
}

// Extraer cedula del texto
export function extractCedulaFromText(text: string): string | null {
  const cedulaRegex = /\b\d{6,12}\b/;
  const match = text.replace(/[.\-\s]/g, "").match(cedulaRegex);
  return match ? match[0] : null;
}

// Extraer ciudad del texto
export function extractCityFromText(text: string): string | null {
  const textLower = normalizeText(text);

  for (const city of VALID_CITIES) {
    if (textLower.includes(normalizeText(city))) {
      return city === "bogota" || city === "bogota" ? "Bogota" : "Cali";
    }
  }
  return null;
}

function extractAnyCityFromToken(text: string): string | null {
  const trimmed = text.trim().replace(/[.;]$/, "");
  if (!trimmed) return null;
  if (trimmed.length < 4) return null;
  if (trimmed.includes("@")) return null;
  if (looksLikeAddress(trimmed)) return null;
  if (/\d/.test(trimmed)) return null;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return null;
  if (
    words.some((word) =>
      [
        "si",
        "no",
        "ok",
        "hola",
        "listo",
        "dale",
        "gracias",
        "envio",
        "direccion",
        "correo",
        "email",
        "vivo",
        "estoy",
        "en",
        "para",
        "queda",
        "ubicado",
        "ciudad",
      ].includes(normalizeText(word))
    )
  ) {
    return null;
  }
  if (!words.every((word) => /^[a-zA-ZÀ-ÿ.'-]+$/.test(word))) return null;

  return capitalizeWords(words.join(" "));
}

function cleanupReceiverName(text: string): string {
  return text
    .replace(/[0-9]/g, " ")
    .replace(
      /\b(la recibe|lo recibe|recibe|sera|sera|otra persona|persona|porteria|recepcion|telefono|celular|contacto|nombre|es|seria|deja|dejala|dejarla|en)\b/gi,
      " "
    )
    .replace(/\b(mi|su)\b/gi, " ")
    .replace(
      /\b(esposa|esposo|hermana|hermano|mama|papa|tia|tio|prima|primo|novia|novio|amiga|amigo|vecina|vecino|portero|portera)\b/gi,
      " "
    )
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReceiverNameFromToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || looksLikeAddress(trimmed) || trimmed.includes("@")) return null;

  const patterns = [
    /\b(?:la|lo)\s+recibe\s+(.+)$/i,
    /\brecibe\s+(.+)$/i,
    /\bsera\s+(.+)$/i,
    /\bser[aá]\s+(.+)$/i,
    /\botra persona(?:\s+la\s+recibe)?\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match?.[1]) continue;
    const candidate = cleanupReceiverName(match[1]);
    if (!candidate) continue;
    const validation = validateName(candidate);
    if (validation.isValid) {
      return capitalizeWords(candidate);
    }
  }

  const candidate = cleanupReceiverName(trimmed);
  if (!candidate) return null;

  const validation = validateName(candidate);
  if (!validation.isValid || candidate.split(/\s+/).length > 4) {
    return null;
  }

  return capitalizeWords(candidate);
}

function detectDeliveryReceiverType(text: string): DeliveryReceiverType | null {
  const normalized = normalizeText(text);

  if (
    ["porteria", "recepcion", "vigilancia", "portero", "portera"].some((value) =>
      normalized.includes(value)
    )
  ) {
    return DELIVERY_RECEIVER_TYPES.PORTERIA;
  }

  if (
    [
      "la recibo yo",
      "lo recibo yo",
      "yo la recibo",
      "yo lo recibo",
      "misma persona",
      "yo mismo",
      "yo misma",
      "personalmente",
      "para mi",
      "soy yo",
    ].some((value) => normalized.includes(value))
  ) {
    return DELIVERY_RECEIVER_TYPES.SAME_PERSON;
  }

  if (
    [
      "otra persona",
      "la recibe",
      "lo recibe",
      "recibe mi",
      "recibe otra",
      "recibira",
      "sera otra persona",
    ].some((value) => normalized.includes(value))
  ) {
    return DELIVERY_RECEIVER_TYPES.OTHER_PERSON;
  }

  if (normalized === "yo" || normalized === "si yo") {
    return DELIVERY_RECEIVER_TYPES.SAME_PERSON;
  }

  return null;
}

// Verificar si parece una direccion
export function looksLikeAddress(text: string): boolean {
  const addressKeywords = [
    "calle", "carrera", "cra", "cl", "avenida", "av",
    "transversal", "tr", "diagonal", "dg", "manzana",
    "conjunto", "edificio", "torre", "apto", "apartamento",
    "casa", "local", "oficina", "#", "no.", "numero",
  ];

  const textLower = normalizeText(text);
  return addressKeywords.some((keyword) => textLower.includes(keyword));
}

// Detectar intencion de pedido
export function isOrderIntent(text: string): boolean {
  const orderKeywords = [
    "quiero", "quisiera", "me gustaria", "pedido", "pedir",
    "ordenar", "comprar", "llevar", "combo", "hamburguesa",
    "pizza", "perro", "hot dog",
  ];

  const textLower = normalizeText(text);
  return orderKeywords.some((keyword) => textLower.includes(keyword));
}

// Detectar solicitud de nuevo pedido
export function isNewOrderRequest(text: string): boolean {
  const newOrderKeywords = [
    "nuevo pedido", "otro pedido", "pedir de nuevo",
    "quiero pedir", "hacer otro", "nueva orden",
  ];

  const textLower = normalizeText(text);
  return newOrderKeywords.some((keyword) => textLower.includes(keyword));
}

// Detectar solicitud de modificacion
export function isModificationRequest(text: string): boolean {
  const modificationKeywords = [
    "cambiar", "modificar", "agregar", "quitar", "anadir",
    "eliminar", "diferente", "otro", "mas", "menos",
  ];

  const textLower = normalizeText(text);
  return modificationKeywords.some((keyword) => textLower.includes(keyword));
}

// Verificar si tiene todos los datos de envio
export function hasDeliveryInfo(leadInfo: {
  city?: string;
  address?: string;
  email?: string;
  deliveryReceiverType?: DeliveryReceiverType;
  deliveryReceiverName?: string;
  deliveryReceiverPhone?: string;
}): boolean {
  if (!leadInfo.city || !leadInfo.address || !leadInfo.email || !leadInfo.deliveryReceiverType) {
    return false;
  }

  if (leadInfo.deliveryReceiverType === DELIVERY_RECEIVER_TYPES.OTHER_PERSON) {
    return !!(leadInfo.deliveryReceiverName && leadInfo.deliveryReceiverPhone);
  }

  return true;
}

// Extraer datos de envio del texto
export function mergeDeliveryInfo(
  text: string,
  currentInfo: {
    city?: string;
    address?: string;
    email?: string;
    deliveryReceiverType?: DeliveryReceiverType;
    deliveryReceiverName?: string;
    deliveryReceiverPhone?: string;
  },
  options?: { allowAnyCity?: boolean }
): {
  city?: string;
  address?: string;
  email?: string;
  deliveryReceiverType?: DeliveryReceiverType;
  deliveryReceiverName?: string;
  deliveryReceiverPhone?: string;
} {
  const result = { ...currentInfo };
  const allowAnyCity = options?.allowAnyCity ?? false;
  const textLower = normalizeText(text);
  const detectedReceiverType = detectDeliveryReceiverType(text);
  const waitingReceiverDetails =
    currentInfo.deliveryReceiverType === DELIVERY_RECEIVER_TYPES.OTHER_PERSON &&
    (!currentInfo.deliveryReceiverName || !currentInfo.deliveryReceiverPhone);

  const deliveryHints =
    text.includes("@") ||
    text.includes("#") ||
    /\d{4,}/.test(text) ||
    [
      "bogota",
      "cali",
      "direccion",
      "calle",
      "carrera",
      "avenida",
      "transversal",
      "diagonal",
      "correo",
      "email",
      "gmail",
      "hotmail",
      "outlook",
      "porteria",
      "recepcion",
      "recibe",
      "recibir",
      "misma persona",
      "otra persona",
      "yo",
    ].some((keyword) => textLower.includes(keyword));

  if (!deliveryHints && !allowAnyCity && !detectedReceiverType && !waitingReceiverDetails) {
    return result;
  }

  if (!result.email) {
    const email = extractEmailFromText(text);
    if (email) {
      const validation = validateEmail(email);
      if (validation.isValid) {
        result.email = email;
      }
    }
  }

  let textWithoutEmail = text;
  if (result.email) {
    textWithoutEmail = text.replace(result.email, " ").trim();
  }

  const detectedReceiverTypeWithoutEmail = detectDeliveryReceiverType(textWithoutEmail);
  if (detectedReceiverTypeWithoutEmail || detectedReceiverType) {
    result.deliveryReceiverType = detectedReceiverTypeWithoutEmail || detectedReceiverType;
    if (result.deliveryReceiverType !== DELIVERY_RECEIVER_TYPES.OTHER_PERSON) {
      result.deliveryReceiverName = undefined;
      result.deliveryReceiverPhone = undefined;
    }
  }

  if (
    result.deliveryReceiverType === DELIVERY_RECEIVER_TYPES.OTHER_PERSON &&
    !result.deliveryReceiverPhone
  ) {
    const receiverPhone = extractPhoneFromText(textWithoutEmail);
    if (receiverPhone) {
      result.deliveryReceiverPhone = receiverPhone;
    }
  }

  const tokens = textWithoutEmail
    .split(/[,\n]/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (!result.city) {
      const city = extractCityFromText(token);
      if (city) {
        result.city = city;
      } else if (allowAnyCity) {
        const anyCity = extractAnyCityFromToken(token);
        if (anyCity) {
          result.city = anyCity;
        }
      }
    }

    if (!result.address && looksLikeAddress(token)) {
      const validation = validateAddress(token);
      if (validation.isValid) {
        result.address = token.trim();
      }
    }

    if (
      result.deliveryReceiverType === DELIVERY_RECEIVER_TYPES.OTHER_PERSON &&
      !result.deliveryReceiverName
    ) {
      const receiverName = extractReceiverNameFromToken(token);
      if (receiverName) {
        result.deliveryReceiverName = receiverName;
      }
    }
  }

  if (!result.city && allowAnyCity) {
    const anyCity = extractAnyCityFromToken(tokens[0] || "");
    if (anyCity) {
      result.city = anyCity;
    }
  }

  if (!result.address && looksLikeAddress(textWithoutEmail)) {
    const validation = validateAddress(textWithoutEmail.trim());
    if (validation.isValid) {
      result.address = textWithoutEmail.trim();
    }
  }

  if (
    result.deliveryReceiverType === DELIVERY_RECEIVER_TYPES.OTHER_PERSON &&
    !result.deliveryReceiverName
  ) {
    const receiverName = extractReceiverNameFromToken(textWithoutEmail);
    if (receiverName) {
      result.deliveryReceiverName = receiverName;
    }
  }

  return result;
}
