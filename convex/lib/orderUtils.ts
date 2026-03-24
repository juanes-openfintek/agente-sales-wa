export function parseOrderItems(orderItems?: string): string[] {
  if (!orderItems) return [];

  try {
    const parsed = JSON.parse(orderItems);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // ignore malformed legacy payloads
  }

  return [];
}

export function formatOrderItemsAsHtml(orderItems?: string): string {
  const items = parseOrderItems(orderItems);
  if (items.length === 0) {
    return "<li>Sin items detallados</li>";
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
