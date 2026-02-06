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

    # ============ ORDERS ============

    async def create_order(self, phone: str, items: str | None = None, total: float | None = None) -> dict[str, Any]:
        """Crear nuevo pedido."""
        try:
            payload: dict[str, Any] = {"phone": phone}
            if items:
                payload["items"] = items
            if total is not None:
                payload["total"] = total
            result = self._client.mutation("orders:create", payload)
            return result if result else {"orderId": None, "orderNumber": 0}
        except Exception as e:
            print(f"[Convex ERROR] create_order: {e}")
            return {"orderId": None, "orderNumber": 0, "error": str(e)}

    async def get_active_order(self, phone: str) -> dict[str, Any] | None:
        """Obtener pedido activo (pending o confirmed) del cliente."""
        try:
            result = self._client.query("orders:getActive", {"phone": phone})
            return self._normalize_order(result) if result else None
        except Exception as e:
            print(f"[Convex ERROR] get_active_order: {e}")
            return None

    async def get_orders_by_phone(self, phone: str, limit: int | None = None) -> list[dict[str, Any]]:
        """Obtener pedidos del cliente."""
        try:
            payload: dict[str, Any] = {"phone": phone}
            if limit:
                payload["limit"] = limit
            results = self._client.query("orders:getByPhone", payload)
            return [self._normalize_order(order) for order in results]
        except Exception as e:
            print(f"[Convex ERROR] get_orders_by_phone: {e}")
            return []

    async def get_order_by_id(self, order_id: str) -> dict[str, Any] | None:
        """Obtener pedido por ID."""
        try:
            result = self._client.query("orders:getById", {"id": order_id})
            return self._normalize_order(result) if result else None
        except Exception as e:
            print(f"[Convex ERROR] get_order_by_id: {e}")
            return None

    async def update_order_items(self, order_id: str, items: str, total: float) -> bool:
        """Actualizar items y total del pedido."""
        try:
            self._client.mutation("orders:updateItems", {
                "id": order_id,
                "items": items,
                "total": total,
            })
            return True
        except Exception as e:
            print(f"[Convex ERROR] update_order_items: {e}")
            return False

    async def set_order_delivery_address(
        self,
        order_id: str,
        address: str,
        reference: str | None = None,
        address_id: str | None = None,
        delivery_time: str | None = None,
    ) -> bool:
        """Establecer direccion de entrega del pedido."""
        try:
            payload: dict[str, Any] = {"id": order_id, "address": address}
            if reference:
                payload["reference"] = reference
            if address_id:
                payload["addressId"] = address_id
            if delivery_time:
                payload["deliveryTime"] = delivery_time
            self._client.mutation("orders:setDeliveryAddress", payload)
            return True
        except Exception as e:
            print(f"[Convex ERROR] set_order_delivery_address: {e}")
            return False

    async def set_order_payment_method(self, order_id: str, payment_method: str) -> bool:
        """Establecer metodo de pago del pedido."""
        try:
            self._client.mutation("orders:setPaymentMethod", {
                "id": order_id,
                "paymentMethod": payment_method,
            })
            return True
        except Exception as e:
            print(f"[Convex ERROR] set_order_payment_method: {e}")
            return False

    async def confirm_order(self, order_id: str) -> bool:
        """Confirmar pedido."""
        try:
            self._client.mutation("orders:confirm", {"id": order_id})
            return True
        except Exception as e:
            print(f"[Convex ERROR] confirm_order: {e}")
            return False

    async def mark_order_paid(self, order_id: str) -> bool:
        """Marcar pedido como pagado."""
        try:
            self._client.mutation("orders:markPaid", {"id": order_id})
            return True
        except Exception as e:
            print(f"[Convex ERROR] mark_order_paid: {e}")
            return False

    async def cancel_order(self, order_id: str) -> bool:
        """Cancelar pedido."""
        try:
            self._client.mutation("orders:cancel", {"id": order_id})
            return True
        except Exception as e:
            print(f"[Convex ERROR] cancel_order: {e}")
            return False

    # ============ ADDRESSES ============

    async def get_addresses(self, phone: str) -> list[dict[str, Any]]:
        """Obtener todas las direcciones del cliente."""
        try:
            results = self._client.query("addresses:getByPhone", {"phone": phone})
            return [self._normalize_address(addr) for addr in results]
        except Exception as e:
            print(f"[Convex ERROR] get_addresses: {e}")
            return []

    async def get_primary_address(self, phone: str) -> dict[str, Any] | None:
        """Obtener direccion principal del cliente."""
        try:
            result = self._client.query("addresses:getPrimary", {"phone": phone})
            return self._normalize_address(result) if result else None
        except Exception as e:
            print(f"[Convex ERROR] get_primary_address: {e}")
            return None

    async def create_address(
        self,
        phone: str,
        address: str,
        label: str | None = None,
        reference: str | None = None,
        is_primary: bool = False,
        address_type: str = "shipping",
        city: str | None = None,
    ) -> str | None:
        """Crear nueva direccion."""
        try:
            payload: dict[str, Any] = {"phone": phone, "address": address}
            if label:
                payload["label"] = label
            if reference:
                payload["reference"] = reference
            if is_primary:
                payload["isPrimary"] = is_primary
            if address_type:
                payload["addressType"] = address_type
            if city:
                payload["city"] = city
            result = self._client.mutation("addresses:create", payload)
            return str(result) if result else None
        except Exception as e:
            print(f"[Convex ERROR] create_address: {e}")
            return None

    async def set_primary_address(self, address_id: str) -> bool:
        """Establecer direccion como principal."""
        try:
            self._client.mutation("addresses:setPrimary", {"id": address_id})
            return True
        except Exception as e:
            print(f"[Convex ERROR] set_primary_address: {e}")
            return False

    async def delete_address(self, address_id: str) -> bool:
        """Eliminar direccion."""
        try:
            self._client.mutation("addresses:remove", {"id": address_id})
            return True
        except Exception as e:
            print(f"[Convex ERROR] delete_address: {e}")
            return False

    async def count_addresses(self, phone: str) -> int:
        """Contar direcciones del cliente."""
        try:
            count = self._client.query("addresses:countByPhone", {"phone": phone})
            return int(count) if count else 0
        except Exception as e:
            print(f"[Convex ERROR] count_addresses: {e}")
            return 0

    # ============ PAYMENTS ============

    async def create_payment(
        self,
        phone: str,
        order_id: str,
        amount: float,
        payment_method: str,
        reference: str | None = None,
    ) -> dict[str, Any]:
        """Crear nuevo pago con consecutivo automático."""
        try:
            payload: dict[str, Any] = {
                "phone": phone,
                "orderId": order_id,
                "amount": amount,
                "paymentMethod": payment_method,
            }
            if reference:
                payload["reference"] = reference

            result = self._client.mutation("payments:create", payload)
            return result if result else {"paymentId": None, "paymentNumber": 0}
        except Exception as e:
            print(f"[Convex ERROR] create_payment: {e}")
            return {"paymentId": None, "paymentNumber": 0, "error": str(e)}

    async def get_payments_by_order(self, order_id: str) -> list[dict[str, Any]]:
        """Obtener pagos de un pedido."""
        try:
            results = self._client.query("payments:getByOrder", {"orderId": order_id})
            return [self._normalize_payment(p) for p in results]
        except Exception as e:
            print(f"[Convex ERROR] get_payments_by_order: {e}")
            return []

    async def get_payments_by_phone(self, phone: str, limit: int | None = None) -> list[dict[str, Any]]:
        """Obtener pagos de un cliente."""
        try:
            payload: dict[str, Any] = {"phone": phone}
            if limit:
                payload["limit"] = limit
            results = self._client.query("payments:getByPhone", payload)
            return [self._normalize_payment(p) for p in results]
        except Exception as e:
            print(f"[Convex ERROR] get_payments_by_phone: {e}")
            return []

    async def get_total_paid_by_order(self, order_id: str) -> float:
        """Obtener total pagado de un pedido."""
        try:
            total = self._client.query("payments:getTotalPaidByOrder", {"orderId": order_id})
            return float(total) if total else 0.0
        except Exception as e:
            print(f"[Convex ERROR] get_total_paid_by_order: {e}")
            return 0.0

    async def verify_payment(self, payment_id: str, verified_by: str | None = None) -> bool:
        """Verificar (aprobar) un pago."""
        try:
            payload: dict[str, Any] = {"id": payment_id}
            if verified_by:
                payload["verifiedBy"] = verified_by
            self._client.mutation("payments:verify", payload)
            return True
        except Exception as e:
            print(f"[Convex ERROR] verify_payment: {e}")
            return False

    async def reject_payment(self, payment_id: str, verified_by: str | None = None) -> bool:
        """Rechazar un pago."""
        try:
            payload: dict[str, Any] = {"id": payment_id}
            if verified_by:
                payload["verifiedBy"] = verified_by
            self._client.mutation("payments:reject", payload)
            return True
        except Exception as e:
            print(f"[Convex ERROR] reject_payment: {e}")
            return False

    async def mark_payment_email_sent(self, payment_id: str) -> bool:
        """Marcar email de pago como enviado."""
        try:
            self._client.mutation("payments:markEmailSent", {"id": payment_id})
            return True
        except Exception as e:
            print(f"[Convex ERROR] mark_payment_email_sent: {e}")
            return False

    async def get_pending_review_payments(self) -> list[dict[str, Any]]:
        """Obtener pagos pendientes de revisión."""
        try:
            results = self._client.query("payments:getPendingReview", {})
            return [self._normalize_payment(p) for p in results]
        except Exception as e:
            print(f"[Convex ERROR] get_pending_review_payments: {e}")
            return []

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

    def _normalize_order(self, order: dict | None) -> dict[str, Any]:
        """Normalizar pedido."""
        if not order:
            return {}

        normalized = self._to_snake_case(order)

        # Convertir timestamps de epoch ms a ISO string si es necesario
        for field in ["created_at", "confirmed_at", "paid_at", "delivered_at", "cancelled_at"]:
            if field in normalized and isinstance(normalized[field], (int, float)):
                from datetime import datetime
                normalized[field] = datetime.fromtimestamp(normalized[field] / 1000).isoformat()

        return normalized

    def _normalize_address(self, address: dict | None) -> dict[str, Any]:
        """Normalizar direccion."""
        if not address:
            return {}

        normalized = self._to_snake_case(address)

        # Convertir timestamp de creacion
        if "created_at" in normalized and isinstance(normalized["created_at"], (int, float)):
            from datetime import datetime
            normalized["created_at"] = datetime.fromtimestamp(normalized["created_at"] / 1000).isoformat()

        return normalized

    def _normalize_payment(self, payment: dict | None) -> dict[str, Any]:
        """Normalizar pago."""
        if not payment:
            return {}

        normalized = self._to_snake_case(payment)

        # Convertir timestamps de epoch ms a ISO string
        for field in ["created_at", "verified_at", "email_sent_at"]:
            if field in normalized and isinstance(normalized[field], (int, float)):
                from datetime import datetime
                normalized[field] = datetime.fromtimestamp(normalized[field] / 1000).isoformat()

        return normalized

    async def close(self):
        """Cerrar cliente (convex-py no requiere cierre explícito)."""
        pass
