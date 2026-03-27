// ============================================================
// TIPOS Y CONSTANTES COMPARTIDAS
// ============================================================

// Estados de conversación
export const ConversationState = {
  SELECTING_STORE: "selecting_store",  // Nuevo: elegir entre carnes o camisetas
  COLLECTING_INFO: "collecting_info",
  BROWSING: "browsing",
  COLLECTING_DELIVERY_INFO: "collecting_delivery_info",
  CONFIRMING_ORDER: "confirming_order",
  COLLECTING_CEDULA: "collecting_cedula",
  PAYMENT_METHOD: "payment_method",
  WAITING_TRANSFER_PROOF: "waiting_transfer_proof",
  PAYMENT_COMPLETED: "payment_completed",
} as const;

export type ConversationStateType = typeof ConversationState[keyof typeof ConversationState];

// Descripciones de estados
export const STATE_DESCRIPTIONS: Record<ConversationStateType, string> = {
  [ConversationState.SELECTING_STORE]: "Seleccionando tienda (carnes o camisetas)",
  [ConversationState.COLLECTING_INFO]: "Recolectando nombre",
  [ConversationState.BROWSING]: "Navegando catálogo / haciendo pedido",
  [ConversationState.COLLECTING_DELIVERY_INFO]: "Recolectando información de envío",
  [ConversationState.CONFIRMING_ORDER]: "Confirmando pedido antes de pago",
  [ConversationState.COLLECTING_CEDULA]: "Recolectando cédula",
  [ConversationState.PAYMENT_METHOD]: "Seleccionando método de pago",
  [ConversationState.WAITING_TRANSFER_PROOF]: "Esperando comprobante de transferencia",
  [ConversationState.PAYMENT_COMPLETED]: "Pago completado / Pedido en proceso",
};

// Métodos de pago
export const PAYMENT_METHODS: Record<string, string> = {
  "1": "Bancolombia",
  "bancolombia": "Bancolombia",
  "2": "Nequi",
  "nequi": "Nequi",
  "3": "Daviplata",
  "daviplata": "Daviplata",
  "4": "BBva",
  "bbva": "BBva",
  "5": "Contra entrega",
  "contra entrega": "Contra entrega",
  "efectivo": "Contra entrega",
};

// Ciudades válidas
export const VALID_CITIES = ["bogota", "bogotá", "cali"];

// Constantes de UI
export const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━";

// Interfaz para mensaje entrante
export interface IncomingMessage {
  messageId: string;
  phone: string;
  text: string | null;
  imageUrl: string | null;
  timestamp: number;
  pushName: string | null;
}

// Interfaz para respuesta del state machine
export interface StateMachineResponse {
  reply: string;
  imageUrl?: string | null;
  action: string;
  newStatus: ConversationStateType;
}

export const DELIVERY_RECEIVER_TYPES = {
  SAME_PERSON: "same_person",
  PORTERIA: "porteria",
  OTHER_PERSON: "other_person",
} as const;

export type DeliveryReceiverType =
  typeof DELIVERY_RECEIVER_TYPES[keyof typeof DELIVERY_RECEIVER_TYPES];

// Interfaz para información del lead
export interface LeadInfo {
  phone: string;
  name?: string;
  email?: string;
  address?: string;
  city?: string;
  deliveryReceiverType?: DeliveryReceiverType;
  deliveryReceiverName?: string;
  deliveryReceiverPhone?: string;
  cedula?: string;
  status: ConversationStateType;
  paymentMethod?: string;
  orderItems?: string;
  orderTotal?: number;
  completedMessageSent?: boolean;
  notifyPreference?: string;
  storeType?: string; // "carnes" | "camisetas"
}
