import json
from typing import Any

from app.config import supabase, SEPARATOR, FREE_ITEM_LABEL


def get_productos_individuales() -> list[dict[str, Any]]:
    """Obtiene todos los productos individuales del inventario."""
    if not supabase:
        return []
    try:
        response = supabase.table("inventario_comidas_rapidas").select("*").execute()
        return response.data
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error obteniendo productos: {e}")
        return []


def get_combos_completos() -> list[dict[str, Any]]:
    """Obtiene todos los combos con sus items incluyendo información de gratis."""
    if not supabase:
        return []
    try:
        combos_response = supabase.table("combos").select("*").execute()
        combos = combos_response.data

        for combo in combos:
            items_response = (
                supabase.table("combo_items").select("*").eq("combo_key", combo["combo_key"]).execute()
            )
            items = items_response.data
            for item in items:
                item["is_free"] = item.get("is_free", False)

            combo["items"] = items

            items_with_price = []
            total_price = combo.get("precio", 0)

            for item in items:
                if item.get("is_free", False):
                    items_with_price.append(f"🎁 {item.get('item_name', '')} - {FREE_ITEM_LABEL}")
                else:
                    items_with_price.append(f"{item.get('item_name', '')}")

            combo["formatted_items"] = items_with_price
            combo["total_price"] = total_price

        return combos
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error obteniendo combos: {e}")
        return []


def get_catalogo_completo() -> str:
    """Obtiene el catálogo completo: productos individuales + combos."""
    productos = get_productos_individuales()
    combos = get_combos_completos()

    catalogo = {"productos_individuales": productos, "combos": combos}
    return json.dumps(catalogo, ensure_ascii=False)


def generate_order_summary_from_saved(order_items: list[str] | str | None, order_total: int | None) -> str:
    """
    Genera resumen del pedido desde datos guardados en el lead.

    Args:
        order_items: Lista de items o JSON string con los items del pedido
        order_total: Total del pedido

    Returns:
        str: Resumen formateado del pedido
    """
    default_summary = f"• Pedido personalizado\n{SEPARATOR}\n💰 Total: Consultar"

    if not order_items:
        return default_summary

    # Si es string JSON, parsear
    if isinstance(order_items, str):
        try:
            order_items = json.loads(order_items)
        except json.JSONDecodeError:
            return default_summary

    if not order_items or not isinstance(order_items, list):
        return default_summary

    # Formatear items
    formatted_items = []
    for item in order_items:
        if isinstance(item, str):
            # Si ya viene formateado, usarlo directo
            if item.startswith("•") or item.startswith("🎁"):
                formatted_items.append(item)
            else:
                formatted_items.append(f"• {item}")
        elif isinstance(item, dict):
            # Si viene como dict con name/price
            name = item.get("name", item.get("nombre", "Producto"))
            price = item.get("price", item.get("precio", 0))
            qty = item.get("qty", item.get("cantidad", 1))
            is_free = item.get("is_free", item.get("gratis", False))

            if is_free:
                formatted_items.append(f"🎁 {name} - {FREE_ITEM_LABEL}")
            elif price:
                formatted_items.append(f"• {name} x{qty} - ${price:,}")
            else:
                formatted_items.append(f"• {name} x{qty}")

    if not formatted_items:
        return default_summary

    summary = "\n".join(formatted_items)

    # Agregar total
    if order_total and order_total > 0:
        summary += f"\n{SEPARATOR}\n💰 *Total: ${order_total:,}*"
    else:
        summary += f"\n{SEPARATOR}\n💰 Total: Consultar"

    return summary


def generate_order_summary(phone: str) -> str:
    """
    Genera un resumen del pedido usando los datos guardados en el lead.

    Args:
        phone: Teléfono del cliente

    Returns:
        str: Resumen formateado del pedido
    """
    from app.services.lead import get_lead_info, is_test_phone, test_conversations

    # Obtener info del lead
    if is_test_phone(phone):
        lead_info = test_conversations.get(phone, {})
    else:
        lead_info = get_lead_info(phone)

    order_items = lead_info.get("order_items")
    order_total = lead_info.get("order_total")

    return generate_order_summary_from_saved(order_items, order_total)
