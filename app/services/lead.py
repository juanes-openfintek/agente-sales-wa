from datetime import datetime
from typing import Any

from app.config import supabase, ConversationState

# Almacenamiento temporal para conversaciones de prueba
test_conversations: dict[str, dict[str, Any]] = {}


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
            # Nuevos campos para tracking de inactividad
            "last_customer_message_at": None,
            "reminder_sent_at": None,
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

    print(f"[TEST] Evento guardado para {phone}: {direction} - {text[:50]}...")


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
        # Campos de tracking de inactividad
        "last_customer_message_at": None,
        "reminder_sent_at": None,
    }


def get_lead_info(phone: str) -> dict[str, Any]:
    """Obtiene información del lead desde Supabase."""
    if not supabase:
        return _get_default_lead_info()

    try:
        response = supabase.table("leads").select("*").eq("phone", phone).execute()
        if response.data and len(response.data) > 0:
            lead = response.data[0]
            return {
                "name": lead.get("name"),
                "contact_phone": lead.get("contact_phone"),
                "email": lead.get("email"),
                "address": lead.get("address"),
                "age": lead.get("age"),
                "cedula": lead.get("cedula"),
                "city": lead.get("city"),
                "delivery_time": lead.get("delivery_time"),
                "status": lead.get("status", ConversationState.COLLECTING_INFO.value),
                "payment_method": lead.get("payment_method"),
                # Campos de tracking de inactividad
                "last_customer_message_at": lead.get("last_customer_message_at"),
                "reminder_sent_at": lead.get("reminder_sent_at"),
            }
        return _get_default_lead_info()
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error obteniendo lead: {e}")
        return _get_default_lead_info()


def update_lead_info(phone: str, **kwargs: Any) -> None:
    """Actualiza información del lead en Supabase."""
    if not supabase:
        return

    try:
        existing = supabase.table("leads").select("id").eq("phone", phone).execute()

        data = {"phone": phone, "updated_at": datetime.now().isoformat()}
        data.update(kwargs)

        if existing.data and len(existing.data) > 0:
            supabase.table("leads").update(data).eq("phone", phone).execute()
        else:
            data["status"] = kwargs.get("status", "new")
            supabase.table("leads").insert(data).execute()

        print(f"[DEBUG] Lead actualizado: {phone} - {kwargs}")
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error actualizando lead: {e}")


def save_event(phone: str, direction: str, text: str, metadata: dict[str, Any] | None = None) -> None:
    """Guarda un evento/mensaje en Supabase."""
    if not supabase:
        return

    try:
        existing = supabase.table("leads").select("id").eq("phone", phone).execute()
        if not existing.data or len(existing.data) == 0:
            supabase.table("leads").insert(
                {
                    "phone": phone,
                    "status": "new",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                }
            ).execute()
            print(f"[DEBUG] Lead creado automáticamente para {phone}")

        # Si es mensaje entrante, actualizar tracking de inactividad
        if direction == "in":
            update_lead_info(
                phone,
                last_customer_message_at=datetime.now().isoformat(),
                reminder_sent_at=None  # Limpiar reminder al recibir respuesta
            )

        data = {
            "phone": phone,
            "direction": direction,
            "text": text,
            "created_at": datetime.now().isoformat(),
        }
        if metadata:
            data["metadata"] = metadata

        supabase.table("events").insert(data).execute()
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error guardando evento: {e}")


def get_history(phone: str, limit: int = 10) -> list[dict[str, Any]]:
    """Obtiene el historial de conversación desde Supabase."""
    if not supabase:
        return []

    try:
        response = (
            supabase.table("events")
            .select("direction, text")
            .eq("phone", phone)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        history: list[dict[str, Any]] = []
        for event in reversed(response.data):
            role = "user" if event["direction"] == "in" else "model"
            history.append({"role": role, "parts": [event["text"]]})

        return history
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error obteniendo historial: {e}")
        return []


def get_event_log(phone: str, limit: int = 100) -> list[dict[str, Any]]:
    """Devuelve eventos crudos (incluye timestamps/metadata) para rehidratar chats en front."""
    if not supabase:
        return []

    try:
        response = (
            supabase.table("events")
            .select("direction, text, created_at, metadata")
            .eq("phone", phone)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return response.data
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error obteniendo eventos: {e}")
        return []


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

    # Luego agregar de Supabase
    if supabase:
        try:
            response = (
                supabase.table("leads")
                .select("phone, name, status, last_customer_message_at, reminder_sent_at")
                .neq("status", ConversationState.PAYMENT_COMPLETED.value)
                .execute()
            )
            for lead in response.data:
                # No duplicar si ya está en test_conversations
                if lead["phone"] not in test_conversations:
                    active.append(lead)
        except Exception as e:  # pragma: no cover
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
        update_lead_info(phone, reminder_sent_at=now)
        print(f"[DEBUG] Reminder marcado para {phone}")
