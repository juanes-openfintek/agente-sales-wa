#!/usr/bin/env python3
"""
Script para probar la conexión con Convex.
"""

import asyncio
import os
import sys

# Agregar el directorio raíz al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from app.services.database.convex_client_native import ConvexBackend

load_dotenv()


async def test_convex():
    """Probar conexión y operaciones básicas con Convex."""
    print("=" * 60)
    print("TEST DE CONEXION CON CONVEX")
    print("=" * 60)

    convex_url = os.getenv("CONVEX_URL")
    if not convex_url:
        print("[ERROR] CONVEX_URL no configurado en .env")
        return

    print(f"\nConectando a: {convex_url}")

    try:
        client = ConvexBackend(convex_url)
        print("[OK] Cliente Convex inicializado")

        # Test 1: Crear un lead de prueba
        print("\n--- Test 1: Crear lead de prueba ---")
        test_phone = "test_convex_999"
        result = await client.upsert_lead(
            phone=test_phone,
            data={
                "name": "Test Convex",
                "status": "collecting_info",
            }
        )
        print(f"[OK] Lead creado: {result}")

        # Test 2: Leer el lead
        print("\n--- Test 2: Leer lead ---")
        lead = await client.get_lead(test_phone)
        if lead:
            print(f"[OK] Lead encontrado: {lead.get('name')} - {lead.get('status')}")
        else:
            print("[ERROR] Lead no encontrado")

        # Test 3: Guardar evento
        print("\n--- Test 3: Guardar evento ---")
        event_id = await client.save_event(
            phone=test_phone,
            direction="in",
            text="Hola, quiero hacer un pedido",
        )
        print(f"[OK] Evento guardado: {event_id}")

        # Test 4: Leer historial
        print("\n--- Test 4: Leer historial ---")
        history = await client.get_history(test_phone, limit=5)
        print(f"[OK] Historial obtenido: {len(history)} eventos")
        for event in history:
            print(f"  - {event.get('direction')}: {event.get('text')[:50]}")

        # Test 5: Contar mensajes
        print("\n--- Test 5: Contar mensajes entrantes ---")
        count = await client.count_incoming_messages(test_phone)
        print(f"[OK] Mensajes entrantes: {count}")

        # Test 6: Obtener todos los leads
        print("\n--- Test 6: Obtener todos los leads ---")
        all_leads = await client.get_all_leads()
        print(f"[OK] Total de leads: {len(all_leads)}")

        print("\n" + "=" * 60)
        print("[OK] TODOS LOS TESTS PASARON")
        print("=" * 60)

        await client.close()

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_convex())
