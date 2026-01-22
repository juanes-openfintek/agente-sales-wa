"""
Cliente de Convex para Python usando HTTP API.
"""

import os
import httpx
from typing import Any
from .base import DatabaseBackend


class ConvexBackend(DatabaseBackend):
    """Backend de Convex usando HTTP Actions."""

    def __init__(self, deployment_url: str | None = None):
        self.deployment_url = deployment_url or os.getenv("CONVEX_URL")
        if not self.deployment_url:
            raise ValueError("CONVEX_URL environment variable is required")

        # Asegurar que termine sin slash
        self.deployment_url = self.deployment_url.rstrip("/")
        self.http_url = f"{self.deployment_url}"
        self._client = httpx.AsyncClient(timeout=30.0)

    async def _request(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json_data: dict | None = None,
    ) -> Any:
        """Realizar request HTTP a Convex."""
        url = f"{self.http_url}{path}"

        response = await self._client.request(
            method=method,
            url=url,
            params=params,
            json=json_data,
        )
        response.raise_for_status()
        return response.json()

    # ============ LEADS ============

    async def get_lead(self, phone: str) -> dict[str, Any] | None:
        """Obtener lead por teléfono."""
        result = await self._request("GET", "/leads", params={"phone": phone})
        return result if result else None

    async def get_all_leads(self) -> list[dict[str, Any]]:
        """Obtener todos los leads."""
        return await self._request("GET", "/leads")

    async def get_active_conversations(self) -> list[dict[str, Any]]:
        """Obtener conversaciones activas."""
        return await self._request("GET", "/leads/active")

    async def upsert_lead(self, phone: str, data: dict[str, Any]) -> dict[str, Any]:
        """Crear o actualizar lead."""
        payload = {"phone": phone, **self._convert_keys_to_camel(data)}
        return await self._request("POST", "/leads", json_data=payload)

    async def update_lead(self, phone: str, data: dict[str, Any]) -> bool:
        """Actualizar lead existente."""
        try:
            await self.upsert_lead(phone, data)
            return True
        except Exception:
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
        payload = {
            "phone": phone,
            "direction": direction,
            "text": text,
        }
        if metadata:
            payload["metadata"] = metadata

        result = await self._request("POST", "/events", json_data=payload)
        return result.get("id", "")

    async def get_history(
        self, phone: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Obtener historial de conversación."""
        events = await self._request(
            "GET", "/events", params={"phone": phone, "limit": str(limit)}
        )
        return self._convert_events_to_snake(events)

    async def get_events_with_metadata(
        self, phone: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Obtener eventos con metadata completa."""
        return await self.get_history(phone, limit)

    async def count_incoming_messages(self, phone: str) -> int:
        """Contar mensajes entrantes de un cliente."""
        result = await self._request(
            "GET", "/events/count", params={"phone": phone}
        )
        return result.get("count", 0)

    # ============ CATALOG ============

    async def get_products(self) -> list[dict[str, Any]]:
        """Obtener todos los productos."""
        return await self._request("GET", "/products")

    async def get_combos(self) -> list[dict[str, Any]]:
        """Obtener todos los combos con sus items."""
        return await self._request("GET", "/combos")

    async def get_full_catalog(self) -> dict[str, Any]:
        """Obtener catálogo completo."""
        return await self._request("GET", "/catalog")

    # ============ HELPERS ============

    def _convert_keys_to_camel(self, data: dict[str, Any]) -> dict[str, Any]:
        """Convertir snake_case a camelCase para Convex."""
        def to_camel(snake_str: str) -> str:
            components = snake_str.split("_")
            return components[0] + "".join(x.title() for x in components[1:])

        return {to_camel(k): v for k, v in data.items() if v is not None}

    def _convert_events_to_snake(self, events: list[dict]) -> list[dict]:
        """Convertir eventos de camelCase a snake_case."""
        def to_snake(camel_str: str) -> str:
            import re
            return re.sub(r'(?<!^)(?=[A-Z])', '_', camel_str).lower()

        result = []
        for event in events:
            converted = {}
            for k, v in event.items():
                if k.startswith("_"):  # Skip Convex internal fields like _id, _creationTime
                    converted[k] = v
                else:
                    converted[to_snake(k)] = v
            result.append(converted)
        return result

    async def close(self):
        """Cerrar cliente HTTP."""
        await self._client.aclose()
