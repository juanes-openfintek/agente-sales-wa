import { DELIVERY_RECEIVER_TYPES, type DeliveryReceiverType } from "./types";

type DeliveryField =
  | "city"
  | "address"
  | "email"
  | "deliveryReceiverType"
  | "deliveryReceiverName"
  | "deliveryReceiverPhone";

type DeliveryInfo = {
  city?: string;
  address?: string;
  email?: string;
  deliveryReceiverType?: DeliveryReceiverType;
  deliveryReceiverName?: string;
  deliveryReceiverPhone?: string;
};

export function formatAskNameAgainSmart(options?: {
  apology?: boolean;
  profileNameSuggestion?: string;
}): string {
  const intro = options?.apology
    ? "Perdon, no quiero pedirte lo mismo."
    : "No alcance a captar tu nombre.";

  if (options?.profileNameSuggestion) {
    return `${intro}

Puedo usar el nombre de tu perfil: *${options.profileNameSuggestion}*.
Si te sirve, responde *si*. Si no, escribeme solo tu nombre.

Ejemplo: _Juan Perez_`;
  }

  return `${intro}

Escribeme solo tu nombre para seguir.

Ejemplo: _Juan Perez_`;
}

function formatReceiverTypeValue(type?: DeliveryReceiverType): string | undefined {
  switch (type) {
    case DELIVERY_RECEIVER_TYPES.SAME_PERSON:
      return "La misma persona";
    case DELIVERY_RECEIVER_TYPES.PORTERIA:
      return "Porteria";
    case DELIVERY_RECEIVER_TYPES.OTHER_PERSON:
      return "Otra persona";
    default:
      return undefined;
  }
}

function getDeliveryLabels(
  leadInfo: DeliveryInfo,
  storeType: "carnes" | "camisetas"
): Array<{ key: DeliveryField; label: string; value?: string }> {
  const fields: Array<{ key: DeliveryField; label: string; value?: string }> = [
    {
      key: "city",
      label: storeType === "camisetas" ? "ciudad de entrega" : "ciudad",
      value: leadInfo.city,
    },
    {
      key: "address",
      label: "direccion de entrega",
      value: leadInfo.address,
    },
    {
      key: "email",
      label: "correo electronico",
      value: leadInfo.email,
    },
    {
      key: "deliveryReceiverType",
      label: "quien recibe la entrega",
      value: formatReceiverTypeValue(leadInfo.deliveryReceiverType),
    },
  ];

  if (leadInfo.deliveryReceiverType === DELIVERY_RECEIVER_TYPES.OTHER_PERSON) {
    fields.push(
      {
        key: "deliveryReceiverName",
        label: "nombre de quien recibe",
        value: leadInfo.deliveryReceiverName,
      },
      {
        key: "deliveryReceiverPhone",
        label: "telefono de quien recibe",
        value: leadInfo.deliveryReceiverPhone,
      }
    );
  }

  return fields;
}

function buildDeliveryExample(
  missing: Array<{ key: DeliveryField }>,
  storeType: "carnes" | "camisetas"
): string {
  if (missing.length === 1) {
    switch (missing[0].key) {
      case "address":
        return "_Calle 123 #45-67_";
      case "email":
        return "_tucorreo@email.com_";
      case "deliveryReceiverType":
        return "_La recibo yo_";
      case "deliveryReceiverName":
        return "_La recibe Maria Perez_";
      case "deliveryReceiverPhone":
        return "_3001234567_";
      default:
        return storeType === "camisetas" ? "_Medellin_" : "_Bogota_";
    }
  }

  if (
    missing.some((field) => field.key === "deliveryReceiverName") ||
    missing.some((field) => field.key === "deliveryReceiverPhone")
  ) {
    return "_La recibe Maria Perez, 3001234567_";
  }

  return storeType === "camisetas"
    ? "_Medellin, Calle 123 #45-67, tucorreo@email.com, la recibo yo_"
    : "_Bogota, Calle 123 #45-67, tucorreo@email.com, la recibo yo_";
}

export function formatSmartDeliveryPrompt(
  leadInfo: DeliveryInfo,
  storeType: "carnes" | "camisetas",
  options?: {
    apology?: boolean;
    capturedNow?: DeliveryField[];
  }
): { missing: DeliveryField[]; prompt: string } {
  const fields = getDeliveryLabels(leadInfo, storeType);
  const known = fields.filter((field) => field.value);
  const missing = fields.filter((field) => !field.value);

  if (missing.length === 0) {
    return { missing: [], prompt: "" };
  }

  const header = options?.apology
    ? "Perdon, no quiero volver a pedirte lo mismo."
    : "Para cerrar el pedido me faltan unos datos.";

  const capturedNow = options?.capturedNow?.length
    ? `\n\nYa registre: ${options.capturedNow
        .map((field) => fields.find((entry) => entry.key === field)?.label)
        .filter(Boolean)
        .join(", ")}.`
    : "";

  const knownBlock = known.length
    ? `\n\nYa tengo:
${known.map((field) => `- ${field.label}: ${field.value}`).join("\n")}`
    : "";

  const missingBlock =
    missing.length === 1
      ? `\n\nSolo me falta:
1. ${missing[0].label.charAt(0).toUpperCase() + missing[0].label.slice(1)}`
      : `\n\nTodavia me faltan:
${missing
  .map((field, index) => `${index + 1}. ${field.label.charAt(0).toUpperCase() + field.label.slice(1)}`)
  .join("\n")}`;

  const receiverHint = missing.some((field) => field.key === "deliveryReceiverType")
    ? `\n\nPuedes responder:
- La recibo yo
- Se deja en porteria
- La recibe otra persona`
    : "";

  return {
    missing: missing.map((field) => field.key),
    prompt: `${header}${capturedNow}${knownBlock}${missingBlock}${receiverHint}

Si quieres, enviamelo en un solo mensaje. Ejemplo:
${buildDeliveryExample(missing, storeType)}`,
  };
}

export function formatUsingProfileName(name: string, storeType: "carnes" | "camisetas"): string {
  const nextStep =
    storeType === "camisetas"
      ? "Tenemos camisetas para dama, caballero y nino en varios colores y tallas."
      : "Tenemos cortes por kilo y combos listos.";

  return `Seguire con el nombre de tu perfil: *${name}*.

Si prefieres otro nombre, me lo corriges cuando quieras.

${nextStep}`;
}

export function formatDeliveryReceiverSummary(leadInfo: DeliveryInfo): string {
  switch (leadInfo.deliveryReceiverType) {
    case DELIVERY_RECEIVER_TYPES.SAME_PERSON:
      return "Recibe: la misma persona";
    case DELIVERY_RECEIVER_TYPES.PORTERIA:
      return "Recibe: porteria";
    case DELIVERY_RECEIVER_TYPES.OTHER_PERSON:
      return leadInfo.deliveryReceiverName && leadInfo.deliveryReceiverPhone
        ? `Recibe: ${leadInfo.deliveryReceiverName} (${leadInfo.deliveryReceiverPhone})`
        : "Recibe: otra persona";
    default:
      return "Recibe: por confirmar";
  }
}
