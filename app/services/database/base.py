"""
Interfaz base para backends de base de datos.
Permite migración gradual entre Supabase y Convex.
"""

from abc import ABC, abstractmethod
from typing import Any


class DatabaseBackend(ABC):
    """Interfaz abstracta para operaciones de base de datos."""

    # ============ LEADS ============

    @abstractmethod
    async def get_lead(self, phone: str) -> dict[str, Any] | None:
        """Obtener lead por teléfono."""
        pass

    @abstractmethod
    async def get_all_leads(self) -> list[dict[str, Any]]:
        """Obtener todos los leads."""
        pass

    @abstractmethod
    async def get_active_conversations(self) -> list[dict[str, Any]]:
        """Obtener conversaciones activas (status != payment_completed)."""
        pass

    @abstractmethod
    async def upsert_lead(self, phone: str, data: dict[str, Any]) -> dict[str, Any]:
        """Crear o actualizar lead."""
        pass

    @abstractmethod
    async def update_lead(self, phone: str, data: dict[str, Any]) -> bool:
        """Actualizar lead existente."""
        pass

    # ============ EVENTS ============

    @abstractmethod
    async def save_event(
        self,
        phone: str,
        direction: str,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Guardar evento de conversación."""
        pass

    @abstractmethod
    async def get_history(
        self, phone: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Obtener historial de conversación."""
        pass

    @abstractmethod
    async def get_events_with_metadata(
        self, phone: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Obtener eventos con metadata completa."""
        pass

    @abstractmethod
    async def count_incoming_messages(self, phone: str) -> int:
        """Contar mensajes entrantes de un cliente."""
        pass

    # ============ CATALOG ============

    @abstractmethod
    async def get_products(self) -> list[dict[str, Any]]:
        """Obtener todos los productos."""
        pass

    @abstractmethod
    async def get_combos(self) -> list[dict[str, Any]]:
        """Obtener todos los combos con sus items."""
        pass

    @abstractmethod
    async def get_full_catalog(self) -> dict[str, Any]:
        """Obtener catálogo completo."""
        pass
