"""
Cliente de Supabase con la interfaz unificada.
Wrapper sobre el cliente existente.
"""

from datetime import datetime
from typing import Any
from .base import DatabaseBackend


class SupabaseBackend(DatabaseBackend):
    """Backend de Supabase usando el cliente existente."""

    def __init__(self, client):
        """
        Args:
            client: Cliente de Supabase ya inicializado (from app.config import supabase)
        """
        self.client = client

    # ============ LEADS ============

    async def get_lead(self, phone: str) -> dict[str, Any] | None:
        """Obtener lead por teléfono."""
        if not self.client:
            return None

        try:
            response = self.client.table("leads").select("*").eq("phone", phone).execute()
            if response.data and len(response.data) > 0:
                lead = response.data[0]
                return self._normalize_lead(lead)
            return None
        except Exception as e:
            print(f"[ERROR] Error obteniendo lead: {e}")
            return None

    async def get_all_leads(self) -> list[dict[str, Any]]:
        """Obtener todos los leads."""
        if not self.client:
            return []

        try:
            response = (
                self.client.table("leads")
                .select("*")
                .order("updated_at", desc=True)
                .execute()
            )
            return [self._normalize_lead(lead) for lead in response.data]
        except Exception as e:
            print(f"[ERROR] Error obteniendo leads: {e}")
            return []

    async def get_active_conversations(self) -> list[dict[str, Any]]:
        """Obtener conversaciones activas (status != payment_completed)."""
        if not self.client:
            return []

        try:
            response = (
                self.client.table("leads")
                .select("phone, name, status, last_customer_message_at, reminder_sent_at")
                .neq("status", "payment_completed")
                .execute()
            )
            return response.data
        except Exception:
            # Fallback si columnas no existen
            try:
                response = (
                    self.client.table("leads")
                    .select("phone, name, status, updated_at")
                    .neq("status", "payment_completed")
                    .execute()
                )
                return [
                    {
                        "phone": lead["phone"],
                        "name": lead.get("name"),
                        "status": lead.get("status"),
                        "last_customer_message_at": lead.get("updated_at"),
                        "reminder_sent_at": None,
                    }
                    for lead in response.data
                ]
            except Exception as e:
                print(f"[ERROR] Error obteniendo conversaciones: {e}")
                return []

    async def upsert_lead(self, phone: str, data: dict[str, Any]) -> dict[str, Any]:
        """Crear o actualizar lead."""
        if not self.client:
            return {"action": "skipped", "reason": "no client"}

        try:
            existing = self.client.table("leads").select("id").eq("phone", phone).execute()

            payload = {"phone": phone, "updated_at": datetime.now().isoformat()}
            payload.update(data)

            if existing.data and len(existing.data) > 0:
                self.client.table("leads").update(payload).eq("phone", phone).execute()
                return {"action": "updated"}
            else:
                payload["status"] = data.get("status", "new")
                payload["created_at"] = datetime.now().isoformat()
                self.client.table("leads").insert(payload).execute()
                return {"action": "created"}
        except Exception as e:
            print(f"[ERROR] Error en upsert lead: {e}")
            return {"action": "error", "error": str(e)}

    async def update_lead(self, phone: str, data: dict[str, Any]) -> bool:
        """Actualizar lead existente."""
        result = await self.upsert_lead(phone, data)
        return result.get("action") in ("updated", "created")

    # ============ EVENTS ============

    async def save_event(
        self,
        phone: str,
        direction: str,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Guardar evento de conversación."""
        if not self.client:
            return ""

        try:
            # Asegurar que existe el lead
            existing = self.client.table("leads").select("id").eq("phone", phone).execute()
            if not existing.data:
                self.client.table("leads").insert({
                    "phone": phone,
                    "status": "new",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                }).execute()

            # Actualizar tracking de inactividad si es mensaje entrante
            if direction == "in":
                self.client.table("leads").update({
                    "last_customer_message_at": datetime.now().isoformat(),
                    "reminder_sent_at": None,
                    "updated_at": datetime.now().isoformat(),
                }).eq("phone", phone).execute()

            data = {
                "phone": phone,
                "direction": direction,
                "text": text,
                "created_at": datetime.now().isoformat(),
            }
            if metadata:
                data["metadata"] = metadata

            response = self.client.table("events").insert(data).execute()
            return response.data[0].get("id", "") if response.data else ""
        except Exception as e:
            print(f"[ERROR] Error guardando evento: {e}")
            return ""

    async def get_history(
        self, phone: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Obtener historial de conversación."""
        if not self.client:
            return []

        try:
            response = (
                self.client.table("events")
                .select("direction, text")
                .eq("phone", phone)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return list(reversed(response.data))
        except Exception as e:
            print(f"[ERROR] Error obteniendo historial: {e}")
            return []

    async def get_events_with_metadata(
        self, phone: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Obtener eventos con metadata completa."""
        if not self.client:
            return []

        try:
            response = (
                self.client.table("events")
                .select("direction, text, created_at, metadata")
                .eq("phone", phone)
                .order("created_at", desc=False)
                .limit(limit)
                .execute()
            )
            return response.data
        except Exception as e:
            print(f"[ERROR] Error obteniendo eventos: {e}")
            return []

    async def count_incoming_messages(self, phone: str) -> int:
        """Contar mensajes entrantes de un cliente."""
        if not self.client:
            return 0

        try:
            response = (
                self.client.table("events")
                .select("id", count="exact")
                .eq("phone", phone)
                .eq("direction", "in")
                .execute()
            )
            return response.count or 0
        except Exception as e:
            print(f"[ERROR] Error contando mensajes: {e}")
            return 0

    # ============ CATALOG ============

    async def get_products(self) -> list[dict[str, Any]]:
        """Obtener todos los productos."""
        if not self.client:
            return []

        try:
            response = self.client.table("inventario_comidas_rapidas").select("*").execute()
            return response.data
        except Exception as e:
            print(f"[ERROR] Error obteniendo productos: {e}")
            return []

    async def get_combos(self) -> list[dict[str, Any]]:
        """Obtener todos los combos con sus items."""
        if not self.client:
            return []

        try:
            combos_response = self.client.table("combos").select("*").execute()
            combos = combos_response.data

            result = []
            for combo in combos:
                items_response = (
                    self.client.table("combo_items")
                    .select("*")
                    .eq("combo_key", combo["combo_key"])
                    .execute()
                )
                combo["items"] = items_response.data
                result.append(combo)

            return result
        except Exception as e:
            print(f"[ERROR] Error obteniendo combos: {e}")
            return []

    async def get_full_catalog(self) -> dict[str, Any]:
        """Obtener catálogo completo."""
        products = await self.get_products()
        combos = await self.get_combos()
        return {"products": products, "combos": combos}

    # ============ HELPERS ============

    def _normalize_lead(self, lead: dict) -> dict[str, Any]:
        """Normalizar estructura de lead."""
        return {
            "phone": lead.get("phone"),
            "name": lead.get("name"),
            "contact_phone": lead.get("contact_phone"),
            "email": lead.get("email"),
            "address": lead.get("address"),
            "age": lead.get("age"),
            "cedula": lead.get("cedula"),
            "city": lead.get("city"),
            "delivery_time": lead.get("delivery_time"),
            "status": lead.get("status", "new"),
            "payment_method": lead.get("payment_method"),
            "order_items": lead.get("order_items"),
            "order_total": lead.get("order_total"),
            "last_customer_message_at": lead.get("last_customer_message_at"),
            "reminder_sent_at": lead.get("reminder_sent_at"),
            "notify_preference": lead.get("notify_preference"),
        }
