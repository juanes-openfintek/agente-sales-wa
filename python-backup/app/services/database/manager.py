"""
Database Manager - Gestiona la migración gradual entre Supabase y Convex.

Configuración via variables de entorno:
- DATABASE_BACKEND: "supabase" | "convex" | "dual" (default: "supabase")
- CONVEX_URL: URL de deployment de Convex (requerido para convex/dual)

Modos:
- supabase: Solo usa Supabase (actual)
- convex: Solo usa Convex (después de migración completa)
- dual: Escribe a ambos, lee de Supabase (para migración gradual)
"""

import os
from typing import Any
from .base import DatabaseBackend
from .convex_client import ConvexBackend
from .supabase_client import SupabaseBackend


class DatabaseManager:
    """
    Gestor de base de datos que permite migración gradual.

    Usage:
        db = DatabaseManager()
        lead = await db.get_lead("1234567890")
    """

    def __init__(
        self,
        backend_mode: str | None = None,
        supabase_client=None,
        convex_url: str | None = None,
    ):
        self.mode = backend_mode or os.getenv("DATABASE_BACKEND", "supabase")
        self._supabase: SupabaseBackend | None = None
        self._convex: ConvexBackend | None = None

        # Inicializar backends según modo
        if self.mode in ("supabase", "dual"):
            if supabase_client is None:
                from app.config import supabase as default_client
                supabase_client = default_client
            if supabase_client:
                self._supabase = SupabaseBackend(supabase_client)

        if self.mode in ("convex", "dual"):
            url = convex_url or os.getenv("CONVEX_URL")
            if url:
                self._convex = ConvexBackend(url)

        # Validar configuración
        if self.mode == "convex" and not self._convex:
            raise ValueError("CONVEX_URL required when DATABASE_BACKEND=convex")

        print(f"[DB] DatabaseManager inicializado en modo: {self.mode}")

    @property
    def primary(self) -> DatabaseBackend | None:
        """Backend principal para lecturas."""
        if self.mode == "convex":
            return self._convex
        return self._supabase  # supabase o dual

    @property
    def secondary(self) -> DatabaseBackend | None:
        """Backend secundario para escrituras duales."""
        if self.mode == "dual":
            return self._convex
        return None

    async def _write_to_both(self, operation: str, *args, **kwargs) -> Any:
        """Ejecuta operación de escritura en ambos backends (modo dual)."""
        result = None

        # Escribir al primario
        if self.primary:
            method = getattr(self.primary, operation)
            result = await method(*args, **kwargs)

        # Escribir al secundario (si existe)
        if self.secondary:
            try:
                method = getattr(self.secondary, operation)
                await method(*args, **kwargs)
            except Exception as e:
                print(f"[DB WARNING] Error escribiendo a secundario: {e}")
                # No fallar si el secundario falla

        return result

    # ============ LEADS ============

    async def get_lead(self, phone: str) -> dict[str, Any] | None:
        """Obtener lead por teléfono."""
        if self.primary:
            return await self.primary.get_lead(phone)
        return None

    async def get_all_leads(self) -> list[dict[str, Any]]:
        """Obtener todos los leads."""
        if self.primary:
            return await self.primary.get_all_leads()
        return []

    async def get_active_conversations(self) -> list[dict[str, Any]]:
        """Obtener conversaciones activas."""
        if self.primary:
            return await self.primary.get_active_conversations()
        return []

    async def upsert_lead(self, phone: str, data: dict[str, Any]) -> dict[str, Any]:
        """Crear o actualizar lead."""
        if self.mode == "dual":
            return await self._write_to_both("upsert_lead", phone, data)
        elif self.primary:
            return await self.primary.upsert_lead(phone, data)
        return {"action": "skipped"}

    async def update_lead(self, phone: str, data: dict[str, Any]) -> bool:
        """Actualizar lead existente."""
        if self.mode == "dual":
            await self._write_to_both("update_lead", phone, data)
            return True
        elif self.primary:
            return await self.primary.update_lead(phone, data)
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
        if self.mode == "dual":
            return await self._write_to_both("save_event", phone, direction, text, metadata)
        elif self.primary:
            return await self.primary.save_event(phone, direction, text, metadata)
        return ""

    async def get_history(
        self, phone: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Obtener historial de conversación."""
        if self.primary:
            return await self.primary.get_history(phone, limit)
        return []

    async def get_events_with_metadata(
        self, phone: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Obtener eventos con metadata completa."""
        if self.primary:
            return await self.primary.get_events_with_metadata(phone, limit)
        return []

    async def count_incoming_messages(self, phone: str) -> int:
        """Contar mensajes entrantes de un cliente."""
        if self.primary:
            return await self.primary.count_incoming_messages(phone)
        return 0

    # ============ CATALOG ============

    async def get_products(self) -> list[dict[str, Any]]:
        """Obtener todos los productos."""
        if self.primary:
            return await self.primary.get_products()
        return []

    async def get_combos(self) -> list[dict[str, Any]]:
        """Obtener todos los combos con sus items."""
        if self.primary:
            return await self.primary.get_combos()
        return []

    async def get_full_catalog(self) -> dict[str, Any]:
        """Obtener catálogo completo."""
        if self.primary:
            return await self.primary.get_full_catalog()
        return {"products": [], "combos": []}

    # ============ LIFECYCLE ============

    async def close(self):
        """Cerrar conexiones."""
        if self._convex:
            await self._convex.close()


# Singleton global para uso en la aplicación
_db_manager: DatabaseManager | None = None


def get_database() -> DatabaseManager:
    """Obtener instancia global del DatabaseManager."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager


def reset_database():
    """Resetear instancia (útil para tests)."""
    global _db_manager
    _db_manager = None
