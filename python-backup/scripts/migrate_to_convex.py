#!/usr/bin/env python3
"""
Script de migración de Supabase a Convex.

Uso:
    python scripts/migrate_to_convex.py --dry-run    # Ver qué se migraría
    python scripts/migrate_to_convex.py              # Ejecutar migración
    python scripts/migrate_to_convex.py --only leads # Solo migrar leads
    python scripts/migrate_to_convex.py --only orders # Solo migrar orders

Requisitos:
    - SUPABASE_URL y SUPABASE_KEY configurados
    - CONVEX_URL configurado (tu deployment de Convex)
    - pip install convex supabase python-dotenv
"""

import argparse
import os
import sys
from datetime import datetime
from typing import Any

# Configurar encoding UTF-8 para Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')  # type: ignore

# Agregar el directorio raíz al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from supabase import create_client
from convex import ConvexClient


def to_camel_case(snake_str: str) -> str:
    """Convertir snake_case a camelCase."""
    components = snake_str.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


def timestamp_to_ms(ts: str | None) -> int | None:
    """Convertir timestamp ISO a milisegundos epoch."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except (ValueError, AttributeError):
        return None


class ConvexMigrator:
    """Migrador de datos de Supabase a Convex."""

    def __init__(self, convex_url: str, dry_run: bool = False):
        self.dry_run = dry_run

        # Inicializar Convex
        self.convex = ConvexClient(convex_url)
        print(f"[OK] Convex conectado: {convex_url}")

        # Inicializar Supabase
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL y SUPABASE_KEY son requeridos")

        self.supabase = create_client(supabase_url, supabase_key)
        print("[OK] Supabase conectado")

    def _convert_lead(self, lead: dict) -> dict:
        """Convertir lead de Supabase a formato Convex."""
        # Mapeo de campos snake_case a camelCase
        field_map = {
            "phone": "phone",
            "name": "name",
            "contact_phone": "contactPhone",
            "email": "email",
            "address": "address",
            "age": "age",
            "cedula": "cedula",
            "city": "city",
            "delivery_time": "deliveryTime",
            "status": "status",
            "payment_method": "paymentMethod",
            "payment_info": "paymentInfo",
            "last_message": "lastMessage",
            "order_items": "orderItems",
            "order_total": "orderTotal",
            "notify_preference": "notifyPreference",
        }

        result: dict[str, Any] = {}
        for supabase_key, convex_key in field_map.items():
            value = lead.get(supabase_key)
            if value is not None:
                result[convex_key] = value

        # Asegurar status por defecto
        if "status" not in result:
            result["status"] = "collecting_info"

        # Convertir timestamps a epoch ms
        for ts_field, convex_field in [
            ("last_customer_message_at", "lastCustomerMessageAt"),
            ("reminder_sent_at", "reminderSentAt"),
            ("created_at", "createdAt"),
            ("updated_at", "updatedAt"),
        ]:
            ts_value = timestamp_to_ms(lead.get(ts_field))
            if ts_value:
                result[convex_field] = ts_value

        return result

    def _convert_order(self, order: dict) -> dict:
        """Convertir order de Supabase a formato Convex."""
        result: dict[str, Any] = {
            "phone": order["phone"],
            "status": order.get("status", "pending"),
        }

        # Items - puede ser jsonb o string
        items = order.get("items")
        if items is not None:
            if isinstance(items, (list, dict)):
                import json
                result["items"] = json.dumps(items)
            else:
                result["items"] = str(items)
        else:
            result["items"] = "[]"

        # Montos
        total_amount = order.get("total_amount", 0)
        discount_amount = order.get("discount_amount", 0)
        final_amount = order.get("final_amount", total_amount - discount_amount)

        result["totalAmount"] = float(total_amount) if total_amount else 0
        result["discountAmount"] = float(discount_amount) if discount_amount else 0
        result["finalAmount"] = float(final_amount) if final_amount else 0
        result["total"] = result["finalAmount"]  # Alias por compatibilidad

        # Campos opcionales
        if order.get("delivery_address"):
            result["deliveryAddress"] = order["delivery_address"]
        if order.get("payment_method"):
            result["paymentMethod"] = order["payment_method"]
        if order.get("payment_status"):
            result["paymentStatus"] = order["payment_status"]
        if order.get("notes"):
            result["notes"] = order["notes"]

        # Timestamps
        result["createdAt"] = timestamp_to_ms(order.get("created_at")) or int(
            datetime.now().timestamp() * 1000
        )
        if order.get("updated_at"):
            result["updatedAt"] = timestamp_to_ms(order["updated_at"])

        return result

    def _convert_event(self, event: dict) -> dict:
        """Convertir event de Supabase a formato Convex."""
        result = {
            "phone": event["phone"],
            "direction": event["direction"],
            "text": event["text"],
        }

        if event.get("metadata"):
            result["metadata"] = event["metadata"]

        if event.get("created_at"):
            result["createdAt"] = timestamp_to_ms(event["created_at"])

        return result

    def _convert_combo(self, combo: dict) -> dict:
        """Convertir combo de Supabase a formato Convex."""
        return {
            "comboKey": combo.get("combo_key", ""),
            "nombre": combo.get("name", ""),
            "name": combo.get("name"),  # Alias
            "precio": combo.get("price_cop", 0),
            "priceCop": combo.get("price_cop"),  # Alias
            "disponible": True,
        }

    def _convert_combo_item(self, item: dict) -> dict:
        """Convertir combo_item de Supabase a formato Convex."""
        return {
            "comboKey": item.get("combo_key", ""),
            "comboId": str(item.get("combo_id", "")),  # UUID como string
            "itemName": item.get("item_name", ""),
            "cantidad": int(item.get("qty", 1)) if item.get("qty") else 1,
            "qty": int(item.get("qty", 1)) if item.get("qty") else 1,  # Alias
            "isFree": item.get("is_free", False),
        }

    def _convert_product(self, product: dict) -> dict:
        """Convertir producto de Supabase a formato Convex."""
        result = {
            "nombre": product.get("nombre", ""),
            "precio": product.get("precio", 0),
            "disponible": True,
        }

        if product.get("created_at"):
            result["createdAt"] = timestamp_to_ms(product["created_at"])
        if product.get("updated_at"):
            result["updatedAt"] = timestamp_to_ms(product["updated_at"])

        return result

    def migrate_leads(self) -> int:
        """Migrar tabla leads."""
        print("\n📋 Migrando leads...")

        response = self.supabase.table("leads").select("*").execute()
        leads = response.data
        print(f"  Encontrados: {len(leads)} leads")

        migrated = 0
        for lead in leads:
            convex_lead = self._convert_lead(lead)
            phone = convex_lead.get("phone", "unknown")

            if self.dry_run:
                print(
                    f"  [DRY-RUN] Lead: {phone} ({convex_lead.get('name', 'sin nombre')})"
                )
                migrated += 1
                continue

            try:
                self.convex.mutation("leads:upsert", convex_lead)
                migrated += 1
                print(f"  ✓ Lead {phone}")
            except Exception as e:
                print(f"  ✗ Error migrando lead {phone}: {e}")

        return migrated

    def migrate_orders(self) -> int:
        """Migrar tabla orders."""
        print("\n📦 Migrando orders...")

        try:
            response = (
                self.supabase.table("orders")
                .select("*")
                .order("created_at")
                .execute()
            )
            orders = response.data
        except Exception as e:
            print(f"  ⚠ Tabla orders no existe o error: {e}")
            return 0

        print(f"  Encontrados: {len(orders)} pedidos")

        # Agrupar por phone para calcular orderNumber
        orders_by_phone: dict[str, int] = {}
        migrated = 0

        for order in orders:
            phone = order.get("phone", "unknown")
            orders_by_phone[phone] = orders_by_phone.get(phone, 0) + 1
            order_number = orders_by_phone[phone]

            convex_order = self._convert_order(order)
            convex_order["orderNumber"] = order_number

            if self.dry_run:
                print(
                    f"  [DRY-RUN] Order #{order_number} para {phone} - ${convex_order['finalAmount']}"
                )
                migrated += 1
                continue

            try:
                self.convex.mutation("orders:create", convex_order)
                migrated += 1
                print(f"  ✓ Order #{order_number} para {phone}")
            except Exception as e:
                print(f"  ✗ Error migrando order de {phone}: {e}")

        return migrated

    def migrate_events(self) -> int:
        """Migrar tabla events."""
        print("\n📝 Migrando events...")

        response = (
            self.supabase.table("events").select("*").order("created_at").execute()
        )
        events = response.data
        print(f"  Encontrados: {len(events)} eventos")

        migrated = 0
        for event in events:
            convex_event = self._convert_event(event)

            if self.dry_run:
                migrated += 1
                if migrated % 100 == 0:
                    print(f"  [DRY-RUN] ... {migrated} eventos")
                continue

            try:
                self.convex.mutation("events:save", convex_event)
                migrated += 1
                if migrated % 100 == 0:
                    print(f"  ... {migrated} eventos migrados")
            except Exception as e:
                print(f"  ✗ Error migrando evento: {e}")

        print(f"  ✓ {migrated} eventos migrados")
        return migrated

    def migrate_products(self) -> int:
        """Migrar tabla inventario_comidas_rapidas."""
        print("\n🍔 Migrando productos...")

        try:
            response = (
                self.supabase.table("inventario_comidas_rapidas").select("*").execute()
            )
            products = response.data
        except Exception as e:
            print(f"  ⚠ Tabla inventario_comidas_rapidas no existe o error: {e}")
            return 0

        print(f"  Encontrados: {len(products)} productos")

        migrated = 0
        for p in products:
            convex_product = self._convert_product(p)

            if self.dry_run:
                print(
                    f"  [DRY-RUN] Producto: {convex_product['nombre']} - ${convex_product['precio']}"
                )
                migrated += 1
                continue

            try:
                self.convex.mutation("catalog:createProduct", convex_product)
                migrated += 1
                print(f"  ✓ Producto: {convex_product['nombre']}")
            except Exception as e:
                print(f"  ✗ Error migrando producto {convex_product['nombre']}: {e}")

        return migrated

    def migrate_combos(self) -> int:
        """Migrar tablas combos y combo_items."""
        print("\n🎁 Migrando combos...")

        try:
            combos_response = self.supabase.table("combos").select("*").execute()
            combos = combos_response.data
        except Exception as e:
            print(f"  ⚠ Tabla combos no existe o error: {e}")
            return 0

        print(f"  Encontrados: {len(combos)} combos")

        migrated = 0
        for combo in combos:
            convex_combo = self._convert_combo(combo)

            if self.dry_run:
                print(
                    f"  [DRY-RUN] Combo: {convex_combo['comboKey']} - ${convex_combo['precio']}"
                )
                migrated += 1
            else:
                try:
                    self.convex.mutation("catalog:createCombo", convex_combo)
                    migrated += 1
                    print(f"  ✓ Combo: {convex_combo['comboKey']}")
                except Exception as e:
                    print(f"  ✗ Error migrando combo {convex_combo['comboKey']}: {e}")
                    continue

            # Migrar items del combo
            try:
                items_response = (
                    self.supabase.table("combo_items")
                    .select("*")
                    .eq("combo_key", combo.get("combo_key", ""))
                    .execute()
                )
                items = items_response.data
            except Exception as e:
                print(f"    ⚠ Error obteniendo items de {combo.get('combo_key')}: {e}")
                continue

            for item in items:
                convex_item = self._convert_combo_item(item)

                if self.dry_run:
                    free_label = " (GRATIS)" if item.get("is_free") else ""
                    qty = convex_item.get("cantidad", 1)
                    print(
                        f"    [DRY-RUN] Item: {qty}x {convex_item['itemName']}{free_label}"
                    )
                else:
                    try:
                        self.convex.mutation("catalog:addComboItem", convex_item)
                        print(f"    ✓ Item: {convex_item['itemName']}")
                    except Exception as e:
                        print(f"    ✗ Error migrando item {convex_item['itemName']}: {e}")

        return migrated

    def run(self, only: str | None = None):
        """Ejecutar migración completa o parcial."""
        print("=" * 60)
        print("🚀 MIGRACIÓN SUPABASE → CONVEX")
        print("=" * 60)

        if self.dry_run:
            print("\n⚠️  MODO DRY-RUN: No se escribirán datos\n")

        start_time = datetime.now()

        tables = {
            "leads": self.migrate_leads,
            "orders": self.migrate_orders,
            "events": self.migrate_events,
            "products": self.migrate_products,
            "combos": self.migrate_combos,
            "catalog": lambda: self.migrate_products() + self.migrate_combos(),
        }

        if only:
            if only not in tables:
                print(f"❌ Tabla no válida: {only}")
                print(f"   Opciones: {', '.join(tables.keys())}")
                return
            results = {only: tables[only]()}
        else:
            # Migrar en orden específico
            results = {}
            for name in ["leads", "orders", "events", "products", "combos"]:
                results[name] = tables[name]()

        elapsed = datetime.now() - start_time

        print("\n" + "=" * 60)
        print("📊 RESUMEN DE MIGRACIÓN")
        print("=" * 60)
        for table, count in results.items():
            print(f"  {table}: {count} registros")
        print(f"\n⏱  Tiempo total: {elapsed}")

        return results


def main():
    parser = argparse.ArgumentParser(description="Migrar datos de Supabase a Convex")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simular migración sin escribir datos",
    )
    parser.add_argument(
        "--convex-url",
        help="URL de Convex (default: CONVEX_URL env var)",
    )
    parser.add_argument(
        "--only",
        choices=["leads", "orders", "events", "products", "combos", "catalog"],
        help="Migrar solo una tabla específica",
    )
    args = parser.parse_args()

    convex_url = args.convex_url or os.getenv("CONVEX_URL")
    if not convex_url:
        print("❌ Error: CONVEX_URL no configurado")
        print("   Usa --convex-url o configura la variable de entorno CONVEX_URL")
        sys.exit(1)

    migrator = ConvexMigrator(convex_url, dry_run=args.dry_run)
    migrator.run(only=args.only)


if __name__ == "__main__":
    main()
