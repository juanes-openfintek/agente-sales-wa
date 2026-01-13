"""
Máquina de estados para el flujo de conversación de WhatsApp.
Refactorizado para eliminar duplicación y mejorar mantenibilidad.
"""
import re
from typing import Any

from app.config import (
    EVOLUTION_APIKEY,
    VALID_CITIES,
    ConversationState,
    PAYMENT_METHODS,
    SEPARATOR,
    supabase,
)
from app.services.ai import extract_name_with_ai, format_whatsapp_message, generate_gemini_response
from app.services.catalog import generate_order_summary
from app.services.lead import (
    get_history,
    get_lead_info,
    get_test_history,
    get_test_lead_info,
    is_test_phone,
    save_event,
    save_test_event,
    test_conversations,
    update_lead_info,
    update_test_lead_info,
)
from app.services.whatsapp import send_whatsapp
from app.utils.validation import (
    validate_email,
    validate_name,
    validate_address,
    validate_cedula,
    extract_email_from_text,
    extract_cedula_from_text,
    extract_city_from_text,
    looks_like_address,
    is_order_intent,
    is_new_order_request,
    is_modification_request,
    extract_notify_preference,
)
from app.utils.messages import (
    format_missing_fields_prompt,
    format_delivery_info_request,
    format_cedula_request,
    format_order_confirmation,
    format_payment_methods,
    format_validation_error,
    format_welcome_message,
    format_name_captured,
    format_transfer_proof_request,
    format_payment_completed_transfer,
    format_payment_completed_cash,
    format_order_cancelled,
    format_city_not_available,
    format_ask_name_again,
    format_ask_confirmation_again,
    format_cedula_invalid,
    format_order_already_completed,
    format_new_order_prompt,
    format_name_with_order_intent,
    format_modification_prompt,
    format_notify_preference_saved,
)


# ============================================================
# VALIDACIÓN DE DATOS DE ENVÍO
# ============================================================

def has_delivery_info(lead_info: dict[str, Any]) -> bool:
    """
    Valida si ya tenemos todos los datos de envío.
    NOTA: Cédula NO se incluye aquí - se pide después de confirmar pedido.
    """
    required_fields = ["city", "address", "email"]
    return all(lead_info.get(field) for field in required_fields)


def merge_delivery_info(text: str, lead_info: dict[str, Any]) -> dict[str, Any]:
    """
    Extrae datos de envío del texto con validación mejorada.
    Usa heurísticas para evitar tomar saludos como dirección.
    """
    t_lower = text.lower()

    # Verificar si el texto contiene indicios de datos de envío
    delivery_hints = (
        "@" in text
        or "#" in text
        or bool(re.search(r"\d{6,}", text))
        or any(
            k in t_lower
            for k in [
                "bogota", "bogotá", "cali",
                "direccion", "dirección",
                "calle", "carrera", "avenida", "transversal", "diag",
                "correo", "email", "gmail", "hotmail", "outlook",
            ]
        )
    )

    if not delivery_hints:
        return lead_info.copy()

    merged = {
        "city": lead_info.get("city"),
        "address": lead_info.get("address"),
        "email": lead_info.get("email"),
    }

    # 1) Email: extraer primero y validar
    if not merged["email"]:
        email = extract_email_from_text(text)
        if email:
            is_valid, _ = validate_email(email)
            if is_valid:
                merged["email"] = email

    # Quitar email del texto para no contaminar dirección
    text_wo_email = text
    if merged["email"]:
        text_wo_email = text.replace(merged["email"], " ")

    # 2) Tokens para ciudad/dirección
    tokens = [t.strip() for t in re.split(r"[,\n]", text_wo_email) if t.strip()]

    for token in tokens:
        # Ciudad
        if not merged["city"]:
            city = extract_city_from_text(token)
            if city:
                merged["city"] = city

        # Dirección (con validación mejorada)
        if not merged["address"] and looks_like_address(token):
            is_valid, error = validate_address(token)
            if is_valid:
                merged["address"] = token.strip()

    return merged


def apply_delivery_updates(
    phone: str,
    merged_info: dict[str, Any],
    lead_info: dict[str, Any],
    update_func
) -> dict[str, Any]:
    """Aplica datos de envío nuevos y los persiste si faltaban."""
    partial_updates = {}

    for field in ["city", "address", "email"]:
        new_value = merged_info.get(field)
        if new_value and not lead_info.get(field):
            # Capitalizar ciudad
            if field == "city":
                partial_updates[field] = new_value
            else:
                partial_updates[field] = new_value
            lead_info[field] = partial_updates[field]

    if partial_updates:
        update_func(phone, **partial_updates)

    return partial_updates


# ============================================================
# EXTRACCIÓN DE PREFERENCIA DE SIGUIENTE PEDIDO
# ============================================================

def extract_next_order_preference(text: str | None) -> dict[str, Any] | None:
    """Extrae preferencia de siguiente pedido (fecha aproximada) o rechazo."""
    if not text:
        return None

    t = text.lower()

    # Detectar rechazo
    if "no" in t and ("siguiente" in t or "segundo" in t or "otro pedido" in t):
        return {"preference": "rechazado", "decline": True}

    # Patrones de fecha
    date_patterns = [
        r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b",
        r"\b\d{1,2}-\d{1,2}(?:-\d{2,4})?\b",
        r"\b\d{1,2}\s*(?:de)?\s*(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\w*\b",
    ]

    for pattern in date_patterns:
        match = re.search(pattern, t)
        if match:
            return {"preference": match.group(0), "decline": False}

    # Días de la semana
    days = ["lunes", "martes", "miércoles", "miercoles", "jueves", "viernes", "sábado", "sabado", "domingo"]
    for day in days:
        if day in t:
            return {"preference": day, "decline": False}

    if "semana" in t:
        return {"preference": "dentro de 1-2 semanas", "decline": False}

    return None


def save_next_order_preference(phone: str, preference: str, save_event_func) -> None:
    """Guarda la intención de siguiente pedido en metadata de eventos."""
    save_event_func(phone, "out", f"next_order_preference:{preference}", {"next_order_preference": preference})


# ============================================================
# CACHE PARA DEDUPLICACIÓN DE MENSAJES
# ============================================================
import time as _time_module

# Guarda message_ids procesados recientemente para evitar duplicados
_processed_messages: dict[str, float] = {}
_MESSAGE_CACHE_TTL_SECONDS = 60  # Tiempo de vida del cache

# Rate limiting por teléfono - evita procesar mensajes muy seguidos del mismo usuario
_last_message_by_phone: dict[str, tuple[float, str]] = {}  # phone -> (timestamp, text)
_MIN_MESSAGE_INTERVAL_SECONDS = 3  # Mínimo 3 segundos entre mensajes del mismo usuario


def _cleanup_message_cache() -> None:
    """Limpia mensajes antiguos del cache."""
    now = _time_module.time()
    expired = [k for k, v in _processed_messages.items() if now - v > _MESSAGE_CACHE_TTL_SECONDS]
    for k in expired:
        del _processed_messages[k]

    # Limpiar también el rate limiter
    expired_phones = [k for k, (t, _) in _last_message_by_phone.items() if now - t > _MESSAGE_CACHE_TTL_SECONDS]
    for k in expired_phones:
        del _last_message_by_phone[k]


def _is_duplicate_message(message_id: str) -> bool:
    """Verifica si un mensaje ya fue procesado por ID."""
    _cleanup_message_cache()

    if message_id in _processed_messages:
        print(f"[DUPLICATE] Mensaje {message_id} ya procesado, ignorando...")
        return True

    _processed_messages[message_id] = _time_module.time()
    return False


def _is_rate_limited(phone: str, text: str) -> bool:
    """
    Verifica si el mensaje debe ser ignorado por rate limiting.
    Ignora mensajes idénticos del mismo usuario en menos de 3 segundos.
    """
    now = _time_module.time()

    if phone in _last_message_by_phone:
        last_time, last_text = _last_message_by_phone[phone]
        time_diff = now - last_time

        # Si es el mismo texto en menos de 3 segundos, es duplicado
        if time_diff < _MIN_MESSAGE_INTERVAL_SECONDS and last_text == text:
            print(f"[RATE_LIMIT] Mensaje duplicado de {phone} en {time_diff:.1f}s, ignorando...")
            return True

    _last_message_by_phone[phone] = (now, text)
    return False


# ============================================================
# HANDLER PRINCIPAL
# ============================================================

async def handle_webhook(raw: dict[str, Any], event_type: str | None = None) -> dict[str, Any]:
    """Procesa eventos de webhook de Evolution."""

    # Validar evento
    actual_event = raw.get("event") or event_type
    if actual_event and actual_event != "messages.upsert":
        return {"ok": True, "ignored": True}

    # Extraer datos del mensaje
    data = raw.get("data")
    if isinstance(data, list):
        data = data[0] if len(data) > 0 else {}
    if not isinstance(data, dict):
        return {"ok": True, "ignored": True}

    key_obj = data.get("key", {})
    from_me = key_obj.get("fromMe", False)
    if from_me:
        return {"ok": True, "ignored": True}

    # Verificar mensaje duplicado usando messageId
    message_id = key_obj.get("id", "")
    if message_id and _is_duplicate_message(message_id):
        return {"ok": True, "ignored": True, "reason": "duplicate"}

    # Extraer teléfono
    remote_jid = key_obj.get("remoteJid", "")
    phone = (
        remote_jid.replace("@s.whatsapp.net", "").replace("@c.us", "")
        or str(data.get("number", ""))
        or str(data.get("from", ""))
    )

    # Extraer mensaje
    msg_obj = data.get("message", {})
    text = (
        msg_obj.get("conversation")
        or msg_obj.get("extendedTextMessage", {}).get("text")
        or msg_obj.get("imageMessage", {}).get("caption")
        or ""
    )
    has_image = msg_obj.get("imageMessage") is not None

    if not phone or (not text and not has_image):
        return {"ok": True, "ignored": True}

    # Rate limiting - evitar mensajes duplicados muy seguidos del mismo usuario
    if text and _is_rate_limited(phone, text):
        return {"ok": True, "ignored": True, "reason": "rate_limited"}

    print(f"📩 [MSG] De: {phone} | Texto: {text[:30]}... | ID: {message_id}")

    # Determinar modo de prueba
    is_demo = raw.get("demo", False) or "demo" in phone.lower() or phone == "user"
    is_test = is_test_phone(phone)

    # Seleccionar funciones según modo
    if is_test:
        print(f"[TEST] Usando sistema de pruebas para {phone}")
        save_test_event(phone, "in", text)
        lead_info = get_test_lead_info(phone)
        save_event_func = save_test_event
        update_lead_func = update_test_lead_info
        get_history_func = lambda p, l=10: get_test_history(p, l)
    else:
        save_event(phone, "in", text)
        lead_info = get_lead_info(phone)
        save_event_func = save_event
        update_lead_func = update_lead_info
        get_history_func = lambda p, l=10: get_history(p, l)

    # Determinar estado actual con auto-transiciones
    current_state = lead_info.get("status", ConversationState.COLLECTING_INFO.value)

    # Auto-transición: Si tiene nombre pero está en collecting_info
    if current_state == ConversationState.COLLECTING_INFO.value and lead_info.get("name"):
        current_state = ConversationState.BROWSING.value
        update_lead_func(phone, status=ConversationState.BROWSING.value)

    # Auto-transición: Si tiene todos los datos de envío pero está en collecting_delivery_info
    if current_state == ConversationState.COLLECTING_DELIVERY_INFO.value and has_delivery_info(lead_info):
        current_state = ConversationState.CONFIRMING_ORDER.value
        update_lead_func(phone, status=ConversationState.CONFIRMING_ORDER.value)

    # Procesar según estado
    reply_text = ""
    image_url = None
    action = "none"
    ai_response: dict[str, Any] = {}

    # ============================================================
    # ESTADO: COLLECTING_INFO (Recolectando nombre)
    # ============================================================
    if current_state == ConversationState.COLLECTING_INFO.value or not lead_info.get("name"):
        # Contar mensajes para detectar si es primer mensaje
        if is_test:
            message_count = len([
                e for e in test_conversations.get(phone, {}).get("events", [])
                if e["direction"] == "in"
            ])
        else:
            if supabase:
                try:
                    res = (
                        supabase.table("events")
                        .select("id", count="exact")
                        .eq("phone", phone)
                        .eq("direction", "in")
                        .execute()
                    )
                    message_count = res.count or 0
                except Exception:
                    message_count = 0
            else:
                message_count = 0

        if message_count <= 1:
            # Primer mensaje - enviar bienvenida
            reply_text = format_whatsapp_message(format_welcome_message())
            update_lead_func(phone, status=ConversationState.COLLECTING_INFO.value)
        else:
            # Verificar si es una intención de pedido en lugar de nombre
            if is_order_intent(text):
                # El usuario quiere pedir pero no dio su nombre
                reply_text = format_whatsapp_message(format_name_with_order_intent())
            else:
                # Intentar extraer nombre usando IA (más robusto que reglas)
                extracted_name = extract_name_with_ai(text)
                
                if extracted_name:
                    # IA pudo extraer un nombre válido
                    contact_phone = lead_info.get("contact_phone") or phone
                    update_lead_func(
                        phone,
                        name=extracted_name,
                        contact_phone=contact_phone,
                        status=ConversationState.BROWSING.value
                    )
                    reply_text = format_whatsapp_message(format_name_captured(extracted_name))
                else:
                    # IA no pudo extraer nombre - pedir de nuevo
                    reply_text = format_whatsapp_message(format_ask_name_again())

    # ============================================================
    # ESTADO: BROWSING (Navegando catálogo)
    # ============================================================
    elif current_state == ConversationState.BROWSING.value:
        ai_response = generate_gemini_response(phone, text, get_history_func)
        reply_text = ai_response.get("reply", "")
        image_url = ai_response.get("suggested_product_image")
        action = ai_response.get("action", "none")

        # Intentar extraer datos de envío mientras navega
        if not has_delivery_info(lead_info):
            merged_info = merge_delivery_info(text, lead_info)
            apply_delivery_updates(phone, merged_info, lead_info, update_lead_func)

        # Si IA detecta que está listo para checkout
        if action == "ready_for_checkout":
            # Guardar el pedido de la respuesta de IA
            order_items = ai_response.get("order_items", [])
            order_total = ai_response.get("total_price", 0)

            if order_items:
                # Convertir a JSON si es lista
                import json
                order_items_json = json.dumps(order_items, ensure_ascii=False) if isinstance(order_items, list) else order_items
                update_lead_func(phone, order_items=order_items_json, order_total=order_total)

            if has_delivery_info(lead_info):
                # Tiene todos los datos - ir a confirmar
                update_lead_func(phone, status=ConversationState.CONFIRMING_ORDER.value)
                order_summary = generate_order_summary(phone)
                reply_text += "\n\n" + format_whatsapp_message(format_order_confirmation(order_summary))
                current_state = ConversationState.CONFIRMING_ORDER.value
            else:
                # Faltan datos - ir a collecting_delivery_info
                update_lead_func(phone, status=ConversationState.COLLECTING_DELIVERY_INFO.value)

                # Usar función centralizada para mostrar campos faltantes
                missing, prompt = format_missing_fields_prompt(lead_info)
                ack = "Perfecto, tomé tu pedido."
                reply_text = format_whatsapp_message(f"{ack}\n\n{prompt}")

    # ============================================================
    # ESTADO: COLLECTING_DELIVERY_INFO (Recolectando datos de envío)
    # ============================================================
    elif current_state == ConversationState.COLLECTING_DELIVERY_INFO.value:
        if has_delivery_info(lead_info):
            # Ya tiene todos los datos - ir a confirmar
            update_lead_func(phone, status=ConversationState.CONFIRMING_ORDER.value)
            order_summary = generate_order_summary(phone)
            reply_text = format_whatsapp_message(format_order_confirmation(order_summary))
            current_state = ConversationState.CONFIRMING_ORDER.value
        else:
            # Intentar extraer datos del mensaje
            merged_info = merge_delivery_info(text, lead_info)
            apply_delivery_updates(phone, merged_info, lead_info, update_lead_func)

            if has_delivery_info(lead_info):
                # Validar ciudad
                city_value = lead_info["city"].lower()

                if city_value not in VALID_CITIES:
                    # Ciudad no válida
                    reply_text = format_whatsapp_message(format_city_not_available(lead_info["city"]))
                    update_lead_func(phone, city=lead_info["city"], status=ConversationState.BROWSING.value)
                else:
                    # Todo correcto - guardar y confirmar
                    update_lead_func(
                        phone,
                        city=lead_info["city"],
                        address=lead_info["address"],
                        email=lead_info["email"],
                        delivery_time="24 horas",
                        status=ConversationState.CONFIRMING_ORDER.value,
                    )
                    order_summary = generate_order_summary(phone)
                    reply_text = format_whatsapp_message(format_order_confirmation(order_summary))
            else:
                # Aún faltan datos - usar función centralizada
                missing, prompt = format_missing_fields_prompt(lead_info)
                reply_text = format_whatsapp_message(prompt)

    # ============================================================
    # ESTADO: CONFIRMING_ORDER (Confirmando pedido)
    # ============================================================
    elif current_state == ConversationState.CONFIRMING_ORDER.value:
        text_lower = text.lower()

        if any(x in text_lower for x in ["si", "sí", "confirmar", "confirmo"]):
            # CAMBIO: Ahora va a COLLECTING_CEDULA en lugar de PAYMENT_METHOD
            update_lead_func(phone, status=ConversationState.COLLECTING_CEDULA.value)
            reply_text = format_whatsapp_message(format_cedula_request())

        elif any(x in text_lower for x in ["no", "cancelar"]):
            update_lead_func(phone, status=ConversationState.BROWSING.value)
            reply_text = format_whatsapp_message(format_order_cancelled())

        elif is_modification_request(text):
            # El usuario quiere modificar el pedido - volver a BROWSING
            update_lead_func(phone, status=ConversationState.BROWSING.value)
            reply_text = format_whatsapp_message(format_modification_prompt())

        else:
            # Si no es confirmación ni modificación clara, pasar a la IA para interpretar
            ai_response = generate_gemini_response(phone, text, get_history_func)
            ai_action = ai_response.get("action", "none")

            if ai_action == "ready_for_checkout":
                # La IA entendió un cambio y dio nuevo pedido
                order_items = ai_response.get("order_items", [])
                order_total = ai_response.get("total_price", 0)

                if order_items:
                    import json
                    order_items_json = json.dumps(order_items, ensure_ascii=False) if isinstance(order_items, list) else order_items
                    update_lead_func(phone, order_items=order_items_json, order_total=order_total)

                # Mostrar nuevo resumen
                order_summary = generate_order_summary(phone)
                reply_text = ai_response.get("reply", "") + "\n\n" + format_whatsapp_message(format_order_confirmation(order_summary))
            else:
                # La IA respondió pero no con checkout - puede ser modificación
                reply_text = ai_response.get("reply", "")
                if not reply_text:
                    reply_text = format_whatsapp_message(format_ask_confirmation_again())

    # ============================================================
    # ESTADO: COLLECTING_CEDULA (Nuevo estado - recolectando cédula)
    # ============================================================
    elif current_state == ConversationState.COLLECTING_CEDULA.value:
        # Intentar extraer cédula
        cedula = extract_cedula_from_text(text)

        if cedula:
            is_valid, error = validate_cedula(cedula)
            if is_valid:
                # Cédula válida - guardar e ir a método de pago
                update_lead_func(
                    phone,
                    cedula=cedula,
                    status=ConversationState.PAYMENT_METHOD.value
                )
                reply_text = format_whatsapp_message(format_payment_methods())
            else:
                # Cédula inválida - pedir de nuevo
                reply_text = format_whatsapp_message(format_validation_error("cédula", error))
        else:
            # No se encontró cédula
            reply_text = format_whatsapp_message(format_cedula_invalid())

    # ============================================================
    # ESTADO: PAYMENT_METHOD (Seleccionando método de pago)
    # ============================================================
    elif current_state == ConversationState.PAYMENT_METHOD.value:
        text_lower = text.lower().strip()
        payment_method = None

        # Usar mapeo centralizado de métodos de pago
        for key, method in PAYMENT_METHODS.items():
            if key in text_lower or key == text.strip():
                payment_method = method
                break

        if not payment_method:
            reply_text = format_whatsapp_message(format_payment_methods())
        else:
            if payment_method == "Contra entrega":
                update_lead_func(
                    phone,
                    payment_method=payment_method,
                    status=ConversationState.PAYMENT_COMPLETED.value
                )
                reply_text = format_whatsapp_message(format_payment_completed_cash())
                action = "transfer_agent"
            else:
                update_lead_func(
                    phone,
                    payment_method=payment_method,
                    status=ConversationState.WAITING_TRANSFER_PROOF.value
                )
                reply_text = format_whatsapp_message(format_transfer_proof_request(payment_method))

    # ============================================================
    # ESTADO: WAITING_TRANSFER_PROOF (Esperando comprobante)
    # ============================================================
    elif current_state == ConversationState.WAITING_TRANSFER_PROOF.value:
        # Verificar preferencia de siguiente pedido
        next_order = extract_next_order_preference(text)
        schedule_ack = ""

        if next_order:
            if next_order["decline"]:
                save_next_order_preference(phone, "rechazado", save_event_func)
                schedule_ack = "Listo, seguimos solo con este pedido. "
            else:
                save_next_order_preference(phone, next_order["preference"], save_event_func)
                schedule_ack = f"Anotado tu siguiente pedido para {next_order['preference']}. "

        # Verificar si envió comprobante
        if has_image or any(x in text.lower() for x in ["envié", "enviado", "listo", "ya pagué", "ya pague"]):
            update_lead_func(phone, status=ConversationState.PAYMENT_COMPLETED.value)
            reply_text = format_whatsapp_message(format_payment_completed_transfer(schedule_ack))
            action = "transfer_agent"
        else:
            prompt = "Por favor, envía el comprobante de tu transferencia como imagen para confirmar tu pedido."
            if schedule_ack:
                prompt = schedule_ack + prompt
            reply_text = format_whatsapp_message(prompt)

    # ============================================================
    # ESTADO: PAYMENT_COMPLETED (Pedido completado)
    # ============================================================
    elif current_state == ConversationState.PAYMENT_COMPLETED.value:
        # Verificar si quiere hacer un nuevo pedido
        if is_new_order_request(text):
            # Reiniciar para nuevo pedido pero mantener nombre y datos de contacto
            name = lead_info.get("name")
            contact_phone = lead_info.get("contact_phone")

            # Limpiar datos del pedido anterior pero mantener info del cliente
            update_lead_func(
                phone,
                status=ConversationState.BROWSING.value,
                cedula=None,
                address=None,
                city=None,
                email=None,
                delivery_time=None,
                payment_method=None,
                order_items=None,
                order_total=None,
            )

            reply_text = format_whatsapp_message(format_new_order_prompt())
        else:
            # Verificar si está respondiendo a la pregunta de cuándo quiere el próximo pedido
            notify_pref = extract_notify_preference(text)
            if notify_pref:
                # Guardar la preferencia
                update_lead_func(phone, notify_preference=notify_pref)
                reply_text = format_whatsapp_message(format_notify_preference_saved(notify_pref))
            else:
                reply_text = format_whatsapp_message(format_order_already_completed())

    # ============================================================
    # FALLBACK: Respuesta de IA
    # ============================================================
    if not reply_text:
        ai_response = generate_gemini_response(phone, text, get_history_func)
        reply_text = ai_response.get("reply", "Lo siento, ¿podrías repetir eso?")

    # Guardar evento de salida
    metadata = {
        "product_id": ai_response.get("suggested_product_id") if ai_response else None,
        "image": image_url,
        "action": action,
    }
    save_event_func(phone, "out", reply_text, metadata)

    # Enviar mensaje por WhatsApp
    if not is_demo and EVOLUTION_APIKEY:
        status, response = send_whatsapp(phone, reply_text, image_url)
        if status < 200 or status >= 300:
            print(f"[ERROR SEND] ({status}) Falló envío a {phone}: {response}")

    # Obtener estado actualizado para la respuesta
    if is_test:
        final_lead_info = get_test_lead_info(phone)
    else:
        final_lead_info = get_lead_info(phone)
    
    new_status = final_lead_info.get("status", current_state)

    return {"reply": reply_text, "image": image_url, "action": action, "new_status": new_status}
