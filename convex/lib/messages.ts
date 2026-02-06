// ============================================================
// TEMPLATES DE MENSAJES
// ============================================================

import { SEPARATOR } from "./types";

// Formatear mensaje para WhatsApp (limpia formato)
export function formatWhatsAppMessage(text: string): string {
  return text.trim().replace(/\n{3,}/g, "\n\n");
}

// Mensaje de bienvenida
export function formatWelcomeMessage(): string {
  return `¡Hola! 👋 Bienvenido a *Comidas Rápidas*.

Soy tu asistente virtual y estoy aquí para ayudarte con tu pedido.

Para comenzar, *¿me podrías decir tu nombre?*`;
}

// Nombre capturado
export function formatNameCaptured(name: string): string {
  return `¡Mucho gusto, *${name}*! 🎉

Ahora puedo ayudarte con tu pedido. ¿Qué te gustaría ordenar hoy?

Tenemos hamburguesas, perros calientes, combos y más. Solo dime qué se te antoja.`;
}

// Pedir nombre de nuevo
export function formatAskNameAgain(): string {
  return `No logré captar tu nombre. ¿Me lo podrías repetir por favor?

Solo necesito tu nombre para personalizar tu experiencia. 😊`;
}

// Pedir nombre con intención de pedido
export function formatNameWithOrderIntent(): string {
  return `¡Excelente! Veo que quieres hacer un pedido. 🍔

Pero primero, *¿me podrías decir tu nombre?* Así puedo atenderte mejor.`;
}

// Solicitar datos de envío faltantes
export function formatMissingFieldsPrompt(leadInfo: {
  city?: string;
  address?: string;
  email?: string;
}): { missing: string[]; prompt: string } {
  const missing: string[] = [];

  if (!leadInfo.city) missing.push("ciudad (Bogotá o Cali)");
  if (!leadInfo.address) missing.push("dirección de entrega");
  if (!leadInfo.email) missing.push("correo electrónico");

  if (missing.length === 0) {
    return { missing: [], prompt: "" };
  }

  const prompt = `Para completar tu pedido necesito los siguientes datos:

${missing.map((field, i) => `${i + 1}. ${field.charAt(0).toUpperCase() + field.slice(1)}`).join("\n")}

Por favor, envíalos en un solo mensaje. Por ejemplo:
_Bogotá, Calle 123 #45-67, tucorreo@email.com_`;

  return { missing, prompt };
}

// Solicitar cédula
export function formatCedulaRequest(): string {
  return `Perfecto, tu pedido está casi listo. ✅

Para la factura, necesito tu *número de cédula* (sin puntos ni guiones).`;
}

// Cédula inválida
export function formatCedulaInvalid(): string {
  return `No pude identificar tu número de cédula.

Por favor, envíame solo los dígitos de tu cédula (entre 6 y 12 números).`;
}

// Confirmación de pedido
export function formatOrderConfirmation(orderSummary: string): string {
  return `${SEPARATOR}
📋 *RESUMEN DE TU PEDIDO*
${SEPARATOR}

${orderSummary}

${SEPARATOR}

¿Está todo correcto? Responde *SÍ* para confirmar o *NO* para cancelar.

También puedes decirme si quieres agregar o cambiar algo.`;
}

// Métodos de pago
export function formatPaymentMethods(): string {
  return `¡Perfecto! 🎉 Tu pedido está confirmado.

${SEPARATOR}
💳 *SELECCIONA TU MÉTODO DE PAGO*
${SEPARATOR}

*1.* Bancolombia
*2.* Nequi
*3.* Daviplata
*4.* BBVA
*5.* Contra entrega (efectivo)

Responde con el *número* o el *nombre* del método de pago.`;
}

// Solicitar comprobante de transferencia
export function formatTransferProofRequest(paymentMethod: string): string {
  return `Has seleccionado pago por *${paymentMethod}*.

Por favor, realiza la transferencia a:

${SEPARATOR}
🏦 *DATOS PARA TRANSFERENCIA*
${SEPARATOR}
• Banco: ${paymentMethod}
• Tipo: Ahorros
• Número: 123-456789-00
• Titular: Comidas Rápidas SAS
${SEPARATOR}

Una vez realices el pago, *envíame una foto o captura del comprobante* para confirmar tu pedido.`;
}

// Pago completado - transferencia
export function formatPaymentCompletedTransfer(scheduleAck: string = ""): string {
  return `${scheduleAck}¡Gracias! 🙏 He recibido tu comprobante.

Tu pedido está siendo procesado y llegará en las próximas *24 horas*.

Te enviaremos un correo con los detalles de seguimiento.

¡Gracias por tu compra! 🍔`;
}

// Pago completado - contra entrega
export function formatPaymentCompletedCash(): string {
  return `¡Perfecto! Tu pedido ha sido confirmado. ✅

Pagarás *en efectivo* al momento de la entrega.

Tu pedido llegará en las próximas *24 horas*.

¡Gracias por tu compra! 🍔`;
}

// Pedido cancelado
export function formatOrderCancelled(): string {
  return `Entendido, tu pedido ha sido cancelado. ❌

Si cambias de opinión, estoy aquí para ayudarte. Solo dime qué te gustaría ordenar.`;
}

// Ciudad no disponible
export function formatCityNotAvailable(city: string): string {
  return `Lo siento, por el momento solo hacemos entregas en *Bogotá* y *Cali*. 😔

La ciudad "${city}" no está disponible para entregas.

¿Tienes alguna dirección en Bogotá o Cali donde podamos entregar?`;
}

// Confirmación no clara
export function formatAskConfirmationAgain(): string {
  return `No entendí tu respuesta.

¿Confirmas tu pedido? Responde *SÍ* para confirmar o *NO* para cancelar.`;
}

// Pedido ya completado
export function formatOrderAlreadyCompleted(): string {
  return `Tu pedido ya está en proceso. 📦

Si necesitas ayuda adicional o quieres hacer un *nuevo pedido*, solo dímelo.

También puedes escribir "nuevo pedido" para comenzar uno nuevo.`;
}

// Nuevo pedido
export function formatNewOrderPrompt(): string {
  return `¡Claro! Estoy listo para un nuevo pedido. 🍔

¿Qué te gustaría ordenar esta vez?`;
}

// Saludo cliente recurrente
export function formatReturningCustomerGreeting(name: string, address?: string): string {
  let greeting = `¡Hola de nuevo, *${name}*! 👋

¡Qué gusto verte otra vez!`;

  if (address) {
    greeting += `\n\n¿Enviamos a la misma dirección?\n📍 ${address}`;
  }

  greeting += `\n\n¿Qué te gustaría pedir hoy?`;

  return greeting;
}

// Modificación de pedido
export function formatModificationPrompt(): string {
  return `Claro, puedes modificar tu pedido.

Dime qué te gustaría cambiar, agregar o quitar.`;
}

// Preferencia de notificación guardada
export function formatNotifyPreferenceSaved(preference: string): string {
  return `¡Anotado! 📝

Te avisaremos ${preference} para tu próximo pedido.

¡Gracias por elegirnos!`;
}

// Selección de dirección guardada
export function formatAddressSelectionPrompt(
  addresses: Array<{ address: string; isPrimary: boolean }>,
  primary?: { address: string } | null
): string {
  let prompt = `Tenemos estas direcciones guardadas:\n\n`;

  addresses.forEach((addr, i) => {
    const marker = addr.isPrimary ? " ⭐" : "";
    prompt += `*${i + 1}.* ${addr.address}${marker}\n`;
  });

  prompt += `\n*Nueva* - Agregar nueva dirección\n\n`;
  prompt += `Responde con el número de la dirección o escribe "nueva" para agregar otra.`;

  return prompt;
}

// Dirección seleccionada
export function formatAddressSelected(address: string): string {
  return `Perfecto, enviaremos a:\n📍 *${address}*`;
}

// Error de validación genérico
export function formatValidationError(field: string, error?: string): string {
  return `El ${field} no es válido. ${error || "Por favor, verifica e intenta de nuevo."}`;
}
