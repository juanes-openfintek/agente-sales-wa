import { escapeHtml, formatOrderItemsAsHtml } from "./orderUtils";

interface ScheduledOrderEmailArgs {
  phone: string;
  customerName?: string;
  customerEmail?: string;
  address?: string;
  city?: string;
  deliveryReceiverType?: string;
  deliveryReceiverName?: string;
  deliveryReceiverPhone?: string;
  storeType?: string;
  orderItems?: string;
  orderTotal?: number;
  orderNumber?: number;
}

function formatMoney(value?: number): string {
  if (!value) return "No disponible";
  return `$${value.toLocaleString("es-CO")}`;
}

function formatDeliveryReceiver(args: ScheduledOrderEmailArgs): string {
  switch (args.deliveryReceiverType) {
    case "same_person":
      return "La misma persona";
    case "porteria":
      return "Porteria";
    case "other_person":
      return args.deliveryReceiverName && args.deliveryReceiverPhone
        ? `${args.deliveryReceiverName} (${args.deliveryReceiverPhone})`
        : args.deliveryReceiverName || "Otra persona";
    default:
      return "No disponible";
  }
}

export async function sendScheduledOrderEmail(args: ScheduledOrderEmailArgs): Promise<{
  sent: boolean;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[EMAIL] RESEND_API_KEY no configurada. No se enviara correo.");
    return { sent: false, error: "missing_resend_api_key" };
  }

  const to = process.env.NOTIFICATION_EMAIL || "ds.ai@openfintek.co";
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const storeLabel = args.storeType === "camisetas" ? "Camisetas" : "Carnes";
  const customerName = args.customerName || "Sin nombre";
  const orderNumber = args.orderNumber ? `#${args.orderNumber}` : "sin numero";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
      <h1 style="margin:0 0 16px">Nuevo pedido agendado (${escapeHtml(storeLabel)})</h1>
      <p style="margin:0 0 20px">Demo notification</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;font-weight:bold">Pedido</td><td style="padding:8px 0">${escapeHtml(orderNumber)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold">Cliente</td><td style="padding:8px 0">${escapeHtml(customerName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold">Telefono</td><td style="padding:8px 0">${escapeHtml(args.phone)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold">Correo cliente</td><td style="padding:8px 0">${escapeHtml(args.customerEmail || "No disponible")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold">Ciudad</td><td style="padding:8px 0">${escapeHtml(args.city || "No disponible")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold">Direccion</td><td style="padding:8px 0">${escapeHtml(args.address || "No disponible")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold">Recibe</td><td style="padding:8px 0">${escapeHtml(formatDeliveryReceiver(args))}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="padding:8px 0">${escapeHtml(formatMoney(args.orderTotal))}</td></tr>
      </table>
      <h2 style="margin:0 0 12px">Items</h2>
      <ul style="padding-left:20px;margin:0 0 20px">
        ${formatOrderItemsAsHtml(args.orderItems)}
      </ul>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[DEMO] Pedido agendado ${orderNumber} - ${storeLabel}`,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EMAIL] Error enviando email (HTTP ${response.status}):`, errorText);
      return { sent: false, error: errorText };
    }

    const responseData = await response.json();
    console.log(`[EMAIL] ✅ Email enviado exitosamente a ${to}. ID: ${responseData.id || "N/A"}`);
    return { sent: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[EMAIL] Error enviando email:", errorMessage);
    return { sent: false, error: errorMessage };
  }
}
