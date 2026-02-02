import os
from datetime import datetime
from typing import Any

from convex import ConvexClient

from app.config import ConversationState

# Almacenamiento temporal para conversaciones de prueba
test_conversations: dict[str, dict[str, Any]] = {}

# ============================================================
# SINGLETON DE CONVEX CLIENT
# ============================================================

_convex_client: ConvexClient | None = None


def _get_convex() -> ConvexClient | None:
    """Obtiene el cliente de Convex (singleton)."""
    global _convex_client
    if _convex_client is None:
        convex_url = os.getenv("CONVEX_URL")
        if convex_url:
            _convex_client = ConvexClient(convex_url)
            print(f"[OK] Convex conectado en lead.py: {convex_url}")
    return _convex_client


# Mapeo snake_case → camelCase para campos de lead
_FIELD_MAP: dict[str, str] = {
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
    "order_items": "orderItems",
    "order_total": "orderTotal",
    "notify_preference": "notifyPreference",
    "completed_message_sent": "completedMessageSent",
}

# Mapeo inverso camelCase → snake_case
_FIELD_MAP_REVERSE: dict[str, str] = {v: k for k, v in _FIELD_MAP.items()}
# Campos extra de Convex que necesitamos mapear
_FIELD_MAP_REVERSE.update({
    "lastCustomerMessageAt": "last_customer_message_at",
    "reminderSentAt": "reminder_sent_at",
    "totalOrders": "total_orders",
    "currentOrderId": "current_order_id",
})


def _to_camel_case(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Convierte kwargs snake_case a camelCase, filtrando None."""
    result = {}
    for key, value in kwargs.items():
        if value is None:
            continue  # No enviar None a Convex (v.optional no acepta null)
        camel_key = _FIELD_MAP.get(key, key)
        result[camel_key] = value
    return result


def _normalize_lead(lead: dict[str, Any]) -> dict[str, Any]:
    """Convierte un lead de Convex (camelCase) a snake_case."""
    result = _get_default_lead_info()

    for convex_key, value in lead.items():
        if convex_key.startswith("_"):
            continue  # Ignorar _id, _creationTime
        snake_key = _FIELD_MAP_REVERSE.get(convex_key, convex_key)

        # Convertir timestamps epoch ms → ISO string
        if snake_key in ("last_customer_message_at", "reminder_sent_at") and isinstance(value, (int, float)):
            try:
                result[snake_key] = datetime.fromtimestamp(value / 1000).isoformat()
            except (ValueError, OSError):
                result[snake_key] = None
        elif snake_key in result:
            result[snake_key] = value

    return result


# ============================================================
# FUNCIONES DE TEST (sin cambios - siguen usando dict en memoria)
# ============================================================


def is_test_phone(phone: str) -> bool:
    """Detecta si es un número de teléfono de prueba."""
    if not phone:
        return False

    phone_str = str(phone).lower()

    test_prefixes = ["demo", "test", "prueba", "dev", "qa"]
    test_suffixes = ["999", "888", "777", "666", "555"]

    for prefix in test_prefixes:
        if phone_str.startswith(prefix):
            return True

    for suffix in test_suffixes:
        if phone_str.endswith(suffix):
            return True

    if len(phone_str) < 7 or any(c.isalpha() for c in phone_str):
        return True

    return False


def get_test_lead_info(phone: str) -> dict[str, Any]:
    """Obtiene información de lead para pruebas (almacenamiento temporal)."""
    if phone not in test_conversations:
        test_conversations[phone] = {
            "name": None,
            "contact_phone": None,
            "email": None,
            "address": None,
            "cedula": None,
            "city": None,
            "delivery_time": None,
            "status": ConversationState.COLLECTING_INFO.value,
            "payment_method": None,
            "events": [],
            # Campos del pedido actual
            "order_items": None,
            "order_total": None,
            # Campos para tracking de inactividad
            "last_customer_message_at": None,
            "reminder_sent_at": None,
            # Campo para preferencia de aviso
            "notify_preference": None,
            # Campo para evitar respuestas repetitivas en estado completado
            "completed_message_sent": None,
        }

    return test_conversations[phone].copy()


def update_test_lead_info(phone: str, **kwargs: Any) -> None:
    """Actualiza información de lead para pruebas."""
    if phone not in test_conversations:
        get_test_lead_info(phone)

    test_conversations[phone].update(kwargs)
    print(f"[TEST] Lead actualizado para {phone}: {kwargs}")


def save_test_event(phone: str, direction: str, text: str, metadata: dict[str, Any] | None = None) -> None:
    """Guarda evento en conversación de prueba."""
    if phone not in test_conversations:
        get_test_lead_info(phone)

    event = {
        "direction": direction,
        "text": text,
        "metadata": metadata or {},
        "timestamp": datetime.now().isoformat(),
    }

    test_conversations[phone]["events"].append(event)

    # Si es mensaje entrante, actualizar tracking de inactividad
    if direction == "in":
        test_conversations[phone]["last_customer_message_at"] = datetime.now().isoformat()
        test_conversations[phone]["reminder_sent_at"] = None  # Limpiar reminder al recibir respuesta

    # Usar encode/decode para evitar errores de encoding con emojis en Windows
    try:
        text_preview = text[:50].encode('ascii', 'replace').decode('ascii')
    except Exception:
        text_preview = text[:50]
    print(f"[TEST] Evento guardado para {phone}: {direction} - {text_preview}...")


def get_test_history(phone: str, limit: int = 10) -> list[dict[str, Any]]:
    """Obtiene historial de conversación de prueba."""
    if phone not in test_conversations:
        return []

    events = test_conversations[phone]["events"][-limit:]
    history = []

    for event in events:
        role = "user" if event["direction"] == "in" else "model"
        history.append({"role": role, "parts": [event["text"]]})

    return history


def reset_test_conversation(phone: str) -> bool:
    """Resetea una conversación de prueba."""
    if phone in test_conversations:
        del test_conversations[phone]
        print(f"[TEST] Conversación reseteada para {phone}")
        return True
    return False


def list_test_conversations() -> dict[str, Any]:
    """Lista todas las conversaciones de prueba activas."""
    return {
        phone: {
            "name": data.get("name"),
            "status": data.get("status"),
            "events_count": len(data.get("events", [])),
            "last_activity": data.get("events", [{}])[-1].get("timestamp") if data.get("events") else None,
            "last_customer_message_at": data.get("last_customer_message_at"),
            "reminder_sent_at": data.get("reminder_sent_at"),
        }
        for phone, data in test_conversations.items()
    }


# ============================================================
# FUNCIONES DE PRODUCCIÓN (ahora usan Convex)
# ============================================================


def _get_default_lead_info() -> dict[str, Any]:
    """Retorna estructura por defecto de lead info."""
    return {
        "name": None,
        "contact_phone": None,
        "email": None,
        "address": None,
        "age": None,
        "cedula": None,
        "city": None,
        "delivery_time": None,
        "status": ConversationState.COLLECTING_INFO.value,
        "payment_method": None,
        # Campos del pedido actual
        "order_items": None,
        "order_total": None,
        # Campos de tracking de inactividad
        "last_customer_message_at": None,
        "reminder_sent_at": None,
        # Campo para preferencia de aviso
        "notify_preference": None,
        # Campo para evitar respuestas repetitivas en estado completado
        "completed_message_sent": None,
    }


def get_lead_info(phone: str) -> dict[str, Any]:
    """Obtiene información del lead desde Convex."""
    convex = _get_convex()
    if not convex:
        return _get_default_lead_info()

    try:
        result = convex.query("leads:getByPhone", {"phone": phone})
        if result:
            return _normalize_lead(result)
        return _get_default_lead_info()
    except Exception as e:
        print(f"[ERROR] Error obteniendo lead: {e}")
        return _get_default_lead_info()


def update_lead_info(phone: str, **kwargs: Any) -> None:
    """Actualiza información del lead en Convex."""
    convex = _get_convex()
    if not convex:
        return

    try:
        data = _to_camel_case(kwargs)
        data["phone"] = phone

        convex.mutation("leads:upsert", data)

        print(f"[DEBUG] Lead actualizado: {phone} - {kwargs}")
    except Exception as e:
        print(f"[ERROR] Error actualizando lead: {e}")


def save_event(phone: str, direction: str, text: str, metadata: dict[str, Any] | None = None) -> None:
    """Guarda un evento/mensaje en Convex."""
    convex = _get_convex()
    if not convex:
        return

    try:
        event_data: dict[str, Any] = {
            "phone": phone,
            "direction": direction,
            "text": text,
        }
        if metadata:
            event_data["metadata"] = metadata

        convex.mutation("events:save", event_data)

        # Si es mensaje entrante, actualizar tracking de inactividad
        if direction == "in":
            try:
                convex.mutation("leads:updateLastMessageTime", {"phone": phone})
            except Exception:
                pass  # No fallar si el lead aún no existe

    except Exception as e:
        print(f"[ERROR] Error guardando evento: {e}")


def get_history(phone: str, limit: int = 10) -> list[dict[str, Any]]:
    """Obtiene el historial de conversación desde Convex."""
    convex = _get_convex()
    if not convex:
        return []

    try:
        events = convex.query("events:getHistory", {"phone": phone, "limit": limit})

        # Convertir al formato que espera Gemini: {role: "user"|"model", parts: [text]}
        history: list[dict[str, Any]] = []
        for event in events:
            role = "user" if event.get("direction") == "in" else "model"
            history.append({"role": role, "parts": [event.get("text", "")]})

        return history
    except Exception as e:
        print(f"[ERROR] Error obteniendo historial: {e}")
        return []


def get_event_log(phone: str, limit: int = 100) -> list[dict[str, Any]]:
    """Devuelve eventos crudos (incluye timestamps/metadata) para rehidratar chats en front."""
    convex = _get_convex()
    if not convex:
        return []

    try:
        events = convex.query(
            "events:getEventsWithMetadata",
            {"phone": phone, "limit": limit},
        )
        # Normalizar a snake_case para compatibilidad
        return [
            {
                "direction": e.get("direction"),
                "text": e.get("text"),
                "created_at": e.get("_creationTime"),
                "metadata": e.get("metadata"),
            }
            for e in events
        ]
    except Exception as e:
        print(f"[ERROR] Error obteniendo eventos: {e}")
        return []


def count_incoming_messages(phone: str) -> int:
    """Cuenta los mensajes entrantes de un teléfono."""
    convex = _get_convex()
    if not convex:
        return 0

    try:
        return convex.query("events:countIncomingMessages", {"phone": phone})
    except Exception as e:
        print(f"[ERROR] Error contando mensajes: {e}")
        return 0


# ============================================================
# FUNCIONES PARA SCHEDULER DE INACTIVIDAD
# ============================================================

def get_all_active_conversations() -> list[dict[str, Any]]:
    """
    Obtiene todas las conversaciones que NO están en estado payment_completed.
    Usado para verificar inactividad.
    """
    # Primero agregar conversaciones de prueba
    active = []

    for phone, data in test_conversations.items():
        if data.get("status") != ConversationState.PAYMENT_COMPLETED.value:
            active.append({
                "phone": phone,
                "name": data.get("name"),
                "status": data.get("status"),
                "last_customer_message_at": data.get("last_customer_message_at"),
                "reminder_sent_at": data.get("reminder_sent_at"),
            })

    # Luego agregar de Convex
    convex = _get_convex()
    if convex:
        try:
            results = convex.query("leads:getActiveConversations", {})
            for lead in results:
                phone = lead.get("phone", "")
                # No duplicar si ya está en test_conversations
                if phone not in test_conversations:
                    # Convertir timestamps epoch ms → ISO string
                    last_msg = lead.get("lastCustomerMessageAt")
                    reminder = lead.get("reminderSentAt")

                    if isinstance(last_msg, (int, float)):
                        try:
                            last_msg = datetime.fromtimestamp(last_msg / 1000).isoformat()
                        except (ValueError, OSError):
                            last_msg = None

                    if isinstance(reminder, (int, float)):
                        try:
                            reminder = datetime.fromtimestamp(reminder / 1000).isoformat()
                        except (ValueError, OSError):
                            reminder = None

                    active.append({
                        "phone": phone,
                        "name": lead.get("name"),
                        "status": lead.get("status"),
                        "last_customer_message_at": last_msg,
                        "reminder_sent_at": reminder,
                    })
        except Exception as e:
            print(f"[ERROR] Error obteniendo conversaciones activas: {e}")

    return active


def mark_reminder_sent(phone: str) -> None:
    """Marca que se envió un recordatorio de inactividad."""
    now = datetime.now().isoformat()

    if is_test_phone(phone):
        if phone in test_conversations:
            test_conversations[phone]["reminder_sent_at"] = now
            print(f"[TEST] Reminder marcado para {phone}")
    else:
        convex = _get_convex()
        if convex:
            try:
                convex.mutation("leads:markReminderSent", {"phone": phone})
                print(f"[DEBUG] Reminder marcado para {phone}")
            except Exception as e:
                print(f"[ERROR] Error marcando reminder: {e}")
