import json
import re
from typing import Any

from app.config import supabase, SEPARATOR, FREE_ITEM_LABEL
from app.services.lead import get_history


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


def generate_order_summary(phone: str) -> str:
    """Genera un resumen detallado del pedido desde el historial."""
    default_summary = f"• Pedido personalizado\n{SEPARATOR}\n💰 Total: Consultar"

    if not supabase:
        return default_summary

    try:
        messages = get_history(phone, limit=20)

        order_items: list[str] = []
        total = 0

        user_messages = [msg for msg in messages if msg["role"] == "user"]

        for msg in user_messages:
            text = msg["parts"][0].lower()

            productos = get_productos_individuales()
            for prod in productos:
                prod_name = prod.get("nombre", "").lower()
                if prod_name in text:
                    qty_match = re.search(r"(\d+)\s*(?:kilos?|kg)", text)
                    qty = int(qty_match.group(1)) if qty_match else 1

                    price = prod.get("precio", 0) * qty
                    order_items.append(f"• {prod.get('nombre', 'Producto')} x{qty} - ${price:,}")
                    total += price
                    break

            combos = get_combos_completos()
            for combo in combos:
                combo_name = combo.get("nombre", "").lower()
                if combo_name in text or combo.get("combo_key", "") in text:
                    combo_price = combo.get("precio", 0)
                    order_items.append(f"• {combo.get('nombre', 'Combo')} - ${combo_price:,}")

                    if "items" in combo:
                        for item in combo["items"]:
                            if item.get("is_free", False):
                                order_items.append(f"  🎁 {item.get('item_name', '')} - {FREE_ITEM_LABEL}")
                            else:
                                order_items.append(f"  • {item.get('item_name', '')}")

                    total += combo_price
                    break

        if not order_items:
            return default_summary

        summary = "\n".join(order_items)
        summary += f"\n{SEPARATOR}\n💰 *Total: ${total:,}*"

        return summary

    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error generando resumen de pedido: {e}")
        return default_summary
