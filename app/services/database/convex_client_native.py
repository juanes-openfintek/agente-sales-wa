"""
Cliente de Convex para Python usando el SDK oficial convex-py.
Mucho más simple y confiable que HTTP Actions.
"""

import os
from typing import Any
from convex import ConvexClient
from .base import DatabaseBackend


class ConvexBackend(DatabaseBackend):
    """Backend de Convex usando el cliente oficial convex-py."""

    def __init__(self, deployment_url: str | None = None):
        self.deployment_url = deployment_url or os.getenv("CONVEX_URL")
        if not self.deployment_url:
            raise ValueError("CONVEX_URL environment variable is required")

        # Inicializar cliente oficial
        self._client = ConvexClient(self.deployment_url)
        print(f"[Convex] Cliente inicializado: {self.deployment_url}")

    # ============ LEADS ============

    async def get_lead(self, phone: str) -> dict[str, Any] | None:
        """Obtener lead por teléfono."""
        try:
            result = self._client.query("leads:getByPhone", {"phone": phone})
            return self._normalize_lead(result) if result else None
        except Exception as e:
            print(f"[Convex ERROR] get_lead: {e}")
            return None

    async def get_all_leads(self) -> list[dict[str, Any]]:
        """Obtener todos los leads."""
        try:
            results = self._client.query("leads:getAll", {})
            return [self._normalize_lead(lead) for lead in results]
        except Exception as e:
            print(f"[Convex ERROR] get_all_leads: {e}")
            return []

    async def get_active_conversations(self) -> list[dict[str, Any]]:
        """Obtener conversaciones activas."""
        try:
            results = self._client.query("leads:getActiveConversations", {})
            return [self._normalize_lead_light(lead) for lead in results]
        except Exception as e:
            print(f"[Convex ERROR] get_active_conversations: {e}")
            return []

    async def upsert_lead(self, phone: str, data: dict[str, Any]) -> dict[str, Any]:
        """Crear o actualizar lead."""
        try:
            payload = {"phone": phone, **self._to_camel_case(data)}
            result = self._client.mutation("leads:upsert", payload)
            return result
        except Exception as e:
            print(f"[Convex ERROR] upsert_lead: {e}")
            return {"action": "error", "error": str(e)}

    async def update_lead(self, phone: str, data: dict[str, Any]) -> bool:
        """Actualizar lead existente."""
        try:
            payload = {"phone": phone, **self._to_camel_case(data)}
            self._client.mutation("leads:update", payload)
            return True
        except Exception as e:
            print(f"[Convex ERROR] update_lead: {e}")
            return False

    # ============ EVENTS ============

    async def save_event(
        self,
        phone: str,
        direction: str,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Guardar evento de conversación."""
        try:
            payload = {
                "phone": phone,
                "direction": direction,
                "text": text,
            }
            if metadata:
                payload["metadata"] = metadata

            result = self._client.mutation("events:save", payload)
            return str(result) if result else ""
        except Exception as e:
            print(f"[Convex ERROR] save_event: {e}")
            return ""

    async def get_history(
        self, phone: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Obtener historial de conversación."""
        try:
            results = self._client.query("events:getHistory", {"phone": phone, "limit": limit})
            return [self._normalize_event(event) for event in results]
        except Exception as e:
            print(f"[Convex ERROR] get_history: {e}")
            return []

    async def get_events_with_metadata(
        self, phone: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Obtener eventos con metadata completa."""
        try:
            results = self._client.query("events:getEventsWithMetadata", {"phone": phone, "limit": limit})
            return [self._normalize_event(event) for event in results]
        except Exception as e:
            print(f"[Convex ERROR] get_events_with_metadata: {e}")
            return []

    async def count_incoming_messages(self, phone: str) -> int:
        """Contar mensajes entrantes de un cliente."""
        try:
            count = self._client.query("events:countIncomingMessages", {"phone": phone})
            return int(count) if count else 0
        except Exception as e:
            print(f"[Convex ERROR] count_incoming_messages: {e}")
            return 0

    # ============ CATALOG ============

    async def get_products(self) -> list[dict[str, Any]]:
        """Obtener todos los productos."""
        try:
            return self._client.query("catalog:getAllProducts", {})
        except Exception as e:
            print(f"[Convex ERROR] get_products: {e}")
            return []

    async def get_combos(self) -> list[dict[str, Any]]:
        """Obtener todos los combos con sus items."""
        try:
            combos = self._client.query("catalog:getAllCombos", {})
            # Agregar items a cada combo
            result = []
            for combo in combos:
                items = self._client.query("catalog:getComboItems", {"comboKey": combo.get("comboKey")})
                combo["items"] = items
                result.append(combo)
            return result
        except Exception as e:
            print(f"[Convex ERROR] get_combos: {e}")
            return []

    async def get_full_catalog(self) -> dict[str, Any]:
        """Obtener catálogo completo."""
        try:
            return self._client.query("catalog:getFullCatalog", {})
        except Exception as e:
            print(f"[Convex ERROR] get_full_catalog: {e}")
            return {"products": [], "combos": []}

    # ============ HELPERS ============

    def _to_camel_case(self, data: dict[str, Any]) -> dict[str, Any]:
        """Convertir snake_case a camelCase."""
        def to_camel(snake_str: str) -> str:
            components = snake_str.split("_")
            return components[0] + "".join(x.title() for x in components[1:])

        return {to_camel(k): v for k, v in data.items() if v is not None}

    def _to_snake_case(self, data: dict[str, Any]) -> dict[str, Any]:
        """Convertir camelCase a snake_case."""
        import re
        def to_snake(camel_str: str) -> str:
            return re.sub(r'(?<!^)(?=[A-Z])', '_', camel_str).lower()

        result = {}
        for k, v in data.items():
            # Skip Convex internal fields
            if k.startswith("_"):
                result[k] = v
            else:
                result[to_snake(k)] = v
        return result

    def _normalize_lead(self, lead: dict | None) -> dict[str, Any]:
        """Normalizar estructura de lead de Convex a formato esperado."""
        if not lead:
            return {}

        normalized = self._to_snake_case(lead)

        # Convertir timestamps de epoch ms a ISO string si es necesario
        for field in ["last_customer_message_at", "reminder_sent_at"]:
            if field in normalized and isinstance(normalized[field], (int, float)):
                from datetime import datetime
                normalized[field] = datetime.fromtimestamp(normalized[field] / 1000).isoformat()

        return normalized

    def _normalize_lead_light(self, lead: dict) -> dict[str, Any]:
        """Normalizar lead light (solo campos básicos)."""
        return self._to_snake_case(lead)

    def _normalize_event(self, event: dict) -> dict[str, Any]:
        """Normalizar evento."""
        return self._to_snake_case(event)

    async def close(self):
        """Cerrar cliente (convex-py no requiere cierre explícito)."""
        pass
