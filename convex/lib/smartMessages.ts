export function formatAskNameAgainSmart(options?: {
  apology?: boolean;
  profileNameSuggestion?: string;
}): string {
  const intro = options?.apology
    ? "Perdon, no quiero pedirte lo mismo."
    : "No logre captar tu nombre.";

  if (options?.profileNameSuggestion) {
    return `${intro}

Puedo usar el nombre de tu perfil: *${options.profileNameSuggestion}*.
Si te sirve, responde *si* y seguimos. Si no, escribeme solo tu nombre.

Ejemplo: _Juan Perez_`;
  }

  return `${intro}

Escribeme solo tu nombre en un solo mensaje para continuar.

Ejemplo: _Juan Perez_`;
}

function getDeliveryLabels(
  leadInfo: { city?: string; address?: string; email?: string },
  storeType: "carnes" | "camisetas"
): Array<{ key: "city" | "address" | "email"; label: string; value?: string }> {
  return [
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
  ];
}

export function formatSmartDeliveryPrompt(
  leadInfo: { city?: string; address?: string; email?: string },
  storeType: "carnes" | "camisetas",
  options?: {
    apology?: boolean;
    capturedNow?: Array<"city" | "address" | "email">;
  }
): { missing: string[]; prompt: string } {
  const fields = getDeliveryLabels(leadInfo, storeType);
  const known = fields.filter((field) => field.value);
  const missing = fields.filter((field) => !field.value);

  if (missing.length === 0) {
    return { missing: [], prompt: "" };
  }

  const header = options?.apology
    ? "Perdon, no quiero volver a pedirte lo mismo."
    : "Para completar tu pedido necesito unos datos mas.";

  const capturedNow = options?.capturedNow?.length
    ? `\n\nYa registre: ${options.capturedNow
        .map((field) => fields.find((entry) => entry.key === field)?.label)
        .filter(Boolean)
        .join(", ")}.`
    : "";

  const knownBlock = known.length
    ? `\n\nYa tengo esto:
${known.map((field) => `• ${field.label}: ${field.value}`).join("\n")}`
    : "";

  const missingBlock =
    missing.length === 1
      ? `\n\nSolo me falta:
1. ${missing[0].label.charAt(0).toUpperCase() + missing[0].label.slice(1)}`
      : `\n\nTodavia me faltan:
${missing.map((field, index) => `${index + 1}. ${field.label.charAt(0).toUpperCase() + field.label.slice(1)}`).join("\n")}`;

  const example =
    missing.length === 1
      ? missing[0].key === "address"
        ? "_Calle 123 #45-67_"
        : missing[0].key === "email"
          ? "_tucorreo@email.com_"
          : storeType === "camisetas"
            ? "_Medellin_"
            : "_Bogota_"
      : storeType === "camisetas"
        ? "_Medellin, Calle 123 #45-67, tucorreo@email.com_"
        : "_Bogota, Calle 123 #45-67, tucorreo@email.com_";

  return {
    missing: missing.map((field) => field.key),
    prompt: `${header}${capturedNow}${knownBlock}${missingBlock}

Enviamelo en un solo mensaje si quieres. Ejemplo:
${example}`,
  };
}

export function formatUsingProfileName(name: string, storeType: "carnes" | "camisetas"): string {
  const nextStep = storeType === "camisetas"
    ? "Tenemos camisetas para dama, caballero y nino en varios colores y tallas."
    : "Tenemos productos individuales por kilo y combos especiales.";

  return `Voy a continuar con el nombre de tu perfil: *${name}*.

Si prefieres otro nombre, me lo corriges en cualquier momento.

${nextStep}`;
}
