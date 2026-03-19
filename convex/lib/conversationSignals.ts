import { isLikelyNotAName, validateName } from "./validation";

export interface ConversationEvent {
  direction: string;
  text: string;
}

type DeliveryField = "city" | "address" | "email";

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function countOutgoingMatches(history: ConversationEvent[], patterns: string[]): number {
  return history.filter((event) => {
    if (event.direction !== "out") return false;
    const normalized = normalizeText(event.text);
    return patterns.some((pattern) => normalized.includes(pattern));
  }).length;
}

function capitalizeWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function countNamePrompts(history: ConversationEvent[]): number {
  return countOutgoingMatches(history, [
    "cual es tu nombre",
    "me puedes decir tu nombre",
    "no logre captar tu nombre",
    "solo necesito tu nombre",
    "solo enviame tu nombre",
  ]);
}

export function countDeliveryPrompts(history: ConversationEvent[]): number {
  return countOutgoingMatches(history, [
    "para completar tu pedido necesito",
    "solo me falta",
    "direccion de entrega",
    "correo electronico",
    "envialos en un solo mensaje",
  ]);
}

export function isFrustrationMessage(text: string): boolean {
  const normalized = normalizeText(text);
  return [
    "ya te lo di",
    "ya eso te lo di",
    "ya se lo di",
    "ya te dije",
    "ya lo mande",
    "ya lo envie",
    "ya te envie",
    "otra vez",
    "te lo acabo de dar",
    "me estas preguntando lo mismo",
    "ya respondi",
    "ya lo respondi",
  ].some((phrase) => normalized.includes(phrase));
}

export function extractProfileName(pushName?: string | null): string | null {
  if (!pushName) return null;

  const cleaned = pushName
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const candidate = cleaned
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 3)
    .join(" ");

  if (!candidate) return null;
  if (isLikelyNotAName(candidate)) return null;

  const validation = validateName(candidate);
  if (!validation.isValid) return null;

  return capitalizeWords(candidate);
}

export function getNewDeliveryFields(
  before: { city?: string; address?: string; email?: string },
  after: { city?: string; address?: string; email?: string }
): DeliveryField[] {
  const fields: DeliveryField[] = [];

  if (!before.city && after.city) fields.push("city");
  if (!before.address && after.address) fields.push("address");
  if (!before.email && after.email) fields.push("email");

  return fields;
}
