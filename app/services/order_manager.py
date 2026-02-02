"""
Servicio para gestión de pedidos, direcciones y pagos.
Abstrae la lógica de múltiples pedidos, direcciones y pagos del state machine.
"""
import json
import os
from typing import Any

from app.services.database.convex_client_native import ConvexBackend


# Singleton del backend de Convex para orders/addresses/payments
_convex_backend: ConvexBackend | None = None


def _get_convex_backend() -> ConvexBackend | None:
    """Obtiene el backend de Convex para operaciones de orders/addresses/payments."""
    global _convex_backend
    if _convex_backend is None:
        convex_url = os.getenv("CONVEX_URL")
        if convex_url:
            _convex_backend = ConvexBackend(convex_url)
    return _convex_backend


class OrderManager:
    """Gestor de pedidos que abstrae la complejidad de la base de datos."""

    def __init__(self, phone: str):
        self.phone = phone
        self._backend = _get_convex_backend()

    async def get_or_create_active_order(self) -> dict[str, Any]:
        """
        Obtiene el pedido activo o crea uno nuevo si no existe.
        Retorna el pedido con su ID.
        """
        if not self._backend:
            return {}

        # Intentar obtener pedido activo
        active_order = await self._backend.get_active_order(self.phone)

        if active_order:
            return active_order

        # Crear nuevo pedido
        result = await self._backend.create_order(self.phone)
        order_id = result.get("orderId")

        if order_id:
            return {
                "_id": order_id,
                "phone": self.phone,
                "order_number": result.get("orderNumber", 1),
                "items": "[]",
                "total": 0,
                "status": "pending",
            }

        return {}

    async def update_order_items(self, items: list[dict], total: float) -> bool:
        """Actualiza items y total del pedido activo."""
        if not self._backend:
            return False

        active_order = await self._backend.get_active_order(self.phone)

        if not active_order:
            # Crear pedido si no existe
            result = await self._backend.create_order(
                self.phone,
                items=json.dumps(items, ensure_ascii=False),
                total=total
            )
            return bool(result.get("orderId"))

        order_id = active_order.get("_id")
        if not order_id:
            return False

        return await self._backend.update_order_items(
            order_id,
            json.dumps(items, ensure_ascii=False),
            total
        )

    async def get_addresses(self) -> list[dict[str, Any]]:
        """Obtiene todas las direcciones del cliente."""
        if not self._backend:
            return []
        return await self._backend.get_addresses(self.phone)

    async def get_primary_address(self) -> dict[str, Any] | None:
        """Obtiene la direccion principal del cliente."""
        if not self._backend:
            return None
        return await self._backend.get_primary_address(self.phone)

    async def add_address(
        self,
        address: str,
        label: str | None = None,
        reference: str | None = None,
        is_primary: bool = False
    ) -> str | None:
        """Agrega una nueva direccion."""
        if not self._backend:
            return None
        return await self._backend.create_address(
            self.phone,
            address,
            label=label,
            reference=reference,
            is_primary=is_primary
        )

    async def set_order_delivery_address(
        self,
        address: str,
        reference: str | None = None,
        address_id: str | None = None,
        delivery_time: str | None = None
    ) -> bool:
        """Establece la direccion de entrega del pedido activo."""
        if not self._backend:
            return False

        active_order = await self._backend.get_active_order(self.phone)

        if not active_order:
            return False

        order_id = active_order.get("_id")
        if not order_id:
            return False

        return await self._backend.set_order_delivery_address(
            order_id,
            address,
            reference=reference,
            address_id=address_id,
            delivery_time=delivery_time
        )

    async def set_order_payment_method(self, payment_method: str) -> bool:
        """Establece el metodo de pago del pedido activo."""
        if not self._backend:
            return False

        active_order = await self._backend.get_active_order(self.phone)

        if not active_order:
            return False

        order_id = active_order.get("_id")
        if not order_id:
            return False

        return await self._backend.set_order_payment_method(order_id, payment_method)

    async def confirm_order(self) -> bool:
        """Confirma el pedido activo."""
        if not self._backend:
            return False

        active_order = await self._backend.get_active_order(self.phone)

        if not active_order:
            return False

        order_id = active_order.get("_id")
        if not order_id:
            return False

        return await self._backend.confirm_order(order_id)

    async def mark_order_paid(self) -> bool:
        """Marca el pedido activo como pagado."""
        if not self._backend:
            return False

        active_order = await self._backend.get_active_order(self.phone)

        if not active_order:
            return False

        order_id = active_order.get("_id")
        if not order_id:
            return False

        return await self._backend.mark_order_paid(order_id)

    async def cancel_order(self) -> bool:
        """Cancela el pedido activo."""
        if not self._backend:
            return False

        active_order = await self._backend.get_active_order(self.phone)

        if not active_order:
            return False

        order_id = active_order.get("_id")
        if not order_id:
            return False

        return await self._backend.cancel_order(order_id)

    async def get_order_history(self, limit: int = 10) -> list[dict[str, Any]]:
        """Obtiene el historial de pedidos del cliente."""
        if not self._backend:
            return []
        return await self._backend.get_orders_by_phone(self.phone, limit=limit)

    async def has_saved_addresses(self) -> bool:
        """Verifica si el cliente tiene direcciones guardadas."""
        if not self._backend:
            return False
        count = await self._backend.count_addresses(self.phone)
        return count > 0

    async def format_address_options(self) -> str:
        """
        Formatea las opciones de direccion para mostrar al usuario.
        Retorna un mensaje con las opciones disponibles.
        """
        addresses = await self.get_addresses()

        if not addresses:
            return ""

        lines = ["Tienes las siguientes direcciones guardadas:"]

        for i, addr in enumerate(addresses, 1):
            label = addr.get("label", "")
            address_text = addr.get("address", "")
            is_primary = addr.get("is_primary", False)
            addr_type = addr.get("address_type", "shipping")

            prefix = "* " if is_primary else "  "
            label_text = f"({label}) " if label else ""
            type_icon = "🏠" if addr_type == "billing" else "📦"
            lines.append(f"{prefix}{i}. {type_icon} {label_text}{address_text}")

        lines.append("")
        lines.append("Responde con el numero de la direccion que quieres usar,")
        lines.append("o escribe una nueva direccion.")

        return "\n".join(lines)

    # ============================================================
    # DIRECCIONES MEJORADAS (billing vs shipping)
    # ============================================================

    async def add_billing_address(
        self,
        address: str,
        city: str | None = None,
        label: str | None = None,
        reference: str | None = None,
    ) -> str | None:
        """Agrega una dirección oficial/de facturación."""
        if not self._backend:
            return None
        return await self._backend.create_address(
            self.phone,
            address,
            label=label or "Oficial",
            reference=reference,
            is_primary=False,
            address_type="billing",
            city=city,
        )

    async def add_shipping_address(
        self,
        address: str,
        city: str | None = None,
        label: str | None = None,
        reference: str | None = None,
        is_primary: bool = False,
    ) -> str | None:
        """Agrega una dirección de envío."""
        if not self._backend:
            return None
        return await self._backend.create_address(
            self.phone,
            address,
            label=label,
            reference=reference,
            is_primary=is_primary,
            address_type="shipping",
            city=city,
        )

    async def get_billing_address(self) -> dict[str, Any] | None:
        """Obtiene la dirección oficial/de facturación."""
        if not self._backend:
            return None
        addresses = await self._backend.get_addresses(self.phone)
        for addr in addresses:
            if addr.get("address_type") == "billing":
                return addr
        return None

    async def get_shipping_addresses(self) -> list[dict[str, Any]]:
        """Obtiene todas las direcciones de envío."""
        if not self._backend:
            return []
        addresses = await self._backend.get_addresses(self.phone)
        return [a for a in addresses if a.get("address_type", "shipping") == "shipping"]

    # ============================================================
    # PAGOS
    # ============================================================

    async def register_payment(
        self,
        amount: float,
        payment_method: str,
        reference: str | None = None,
        send_email: bool = True,
    ) -> dict[str, Any]:
        """
        Registra un nuevo pago para el pedido activo.
        
        Args:
            amount: Monto del pago
            payment_method: Método de pago (Bancolombia, Nequi, etc.)
            reference: Referencia o nota del comprobante
            send_email: Si se debe enviar notificación por email
        
        Returns:
            dict con paymentId, paymentNumber y si se envió email
        """
        if not self._backend:
            return {"error": "Backend no disponible"}

        active_order = await self._backend.get_active_order(self.phone)
        if not active_order:
            return {"error": "No hay pedido activo"}

        order_id = active_order.get("_id")
        if not order_id:
            return {"error": "ID de pedido no encontrado"}

        # Crear el pago con consecutivo
        result = await self._backend.create_payment(
            phone=self.phone,
            order_id=order_id,
            amount=amount,
            payment_method=payment_method,
            reference=reference,
        )

        payment_id = result.get("paymentId")
        payment_number = result.get("paymentNumber")

        if not payment_id:
            return {"error": "No se pudo crear el pago"}

        # Enviar email de notificación si está habilitado
        email_sent = False
        if send_email and payment_number:
            try:
                from app.services.email import send_payment_notification
                from app.services.lead import get_lead_info

                # Obtener info del cliente para el email
                lead_info = get_lead_info(self.phone)
                customer_name = lead_info.get("name")
                order_total = active_order.get("total")

                email_result = await send_payment_notification(
                    phone=self.phone,
                    payment_number=payment_number,
                    amount=amount,
                    payment_method=payment_method,
                    order_total=order_total,
                    customer_name=customer_name,
                )

                email_sent = email_result.get("sent", False)

                # Marcar email como enviado en el pago
                if email_sent:
                    await self._backend.mark_payment_email_sent(payment_id)

            except Exception as e:
                print(f"[OrderManager] Error enviando email de pago: {e}")

        return {
            "paymentId": payment_id,
            "paymentNumber": payment_number,
            "emailSent": email_sent,
        }

    async def get_payments(self) -> list[dict[str, Any]]:
        """Obtiene todos los pagos del pedido activo."""
        if not self._backend:
            return []

        active_order = await self._backend.get_active_order(self.phone)
        if not active_order:
            return []

        order_id = active_order.get("_id")
        if not order_id:
            return []

        return await self._backend.get_payments_by_order(order_id)

    async def get_total_paid(self) -> float:
        """Obtiene el total pagado del pedido activo."""
        if not self._backend:
            return 0.0

        active_order = await self._backend.get_active_order(self.phone)
        if not active_order:
            return 0.0

        order_id = active_order.get("_id")
        if not order_id:
            return 0.0

        return await self._backend.get_total_paid_by_order(order_id)

    async def get_pending_amount(self) -> float:
        """Obtiene el monto pendiente por pagar del pedido activo."""
        if not self._backend:
            return 0.0

        active_order = await self._backend.get_active_order(self.phone)
        if not active_order:
            return 0.0

        order_total = active_order.get("total", 0)
        total_paid = await self.get_total_paid()

        return max(0, order_total - total_paid)

    async def get_all_payments_history(self, limit: int = 20) -> list[dict[str, Any]]:
        """Obtiene el historial de todos los pagos del cliente."""
        if not self._backend:
            return []
        return await self._backend.get_payments_by_phone(self.phone, limit=limit)


def get_order_manager(phone: str) -> OrderManager:
    """Factory function para obtener un OrderManager."""
    return OrderManager(phone)
