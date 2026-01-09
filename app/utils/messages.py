"""
Templates de mensajes centralizados para el agente de ventas.
Elimina duplicación y mantiene consistencia en respuestas.
"""
from typing import Any

from app.config import SEPARATOR


# ============================================================
# CAMPOS DE ENTREGA (sin cédula - se pide aparte)
# ============================================================
DELIVERY_FIELDS = [
    {"key": "city", "display": "Ciudad", "prompt": "Ciudad (Bogotá o Cali)"},
    {"key": "address", "display": "Dirección", "prompt": "Dirección completa"},
    {"key": "email", "display": "Correo", "prompt": "Correo electrónico"},
]


# ============================================================
# FUNCIONES DE FORMATO
# ============================================================

def format_missing_fields_prompt(lead_info: dict[str, Any]) -> tuple[list[str], str]:
    """
    Genera lista de campos faltantes y mensaje apropiado.
    NO incluye cédula (se pide después de confirmar pedido).

    Args:
        lead_info: Información actual del lead

    Returns:
        tuple[list[str], str]: (lista_faltantes, mensaje_completo)
    """
    missing = []
    already = []

    for field in DELIVERY_FIELDS:
        value = lead_info.get(field["key"])
        if value:
            already.append(f'{field["display"]}: {value}')
        else:
            missing.append(field["prompt"])

    # Construir acknowledgment si ya tenemos datos
    ack = ""
    if already:
        ack = "Ya tengo: " + "; ".join(already) + ".\n\n"

    # Construir prompt según cantidad de faltantes
    if len(missing) == 0:
        return [], ack + "¡Tengo todos tus datos de envío!"

    if len(missing) == 1:
        prompt = f"Solo me falta tu {missing[0]} para continuar."
    else:
        missing_text = ", ".join(missing)
        prompt = (
            f"Me faltan estos datos: {missing_text}\n\n"
            "Envíalos separados por comas.\n\n"
            "Ejemplo:\n"
            "Bogotá, Calle 123 #45-67, correo@ejemplo.com"
        )

    return missing, ack + prompt


def format_delivery_info_request(name: str) -> str:
    """
    Formato de solicitud inicial de datos de envío.
    NO incluye cédula.
    """
    return (
        f"Perfecto, {name}. Para procesar tu pedido, necesito los siguientes datos:\n\n"
        f"{SEPARATOR}\n"
        "📍 *Ciudad* (Bogotá o Cali)\n"
        "🏠 *Dirección completa*\n"
        "📧 *Correo electrónico*\n"
        f"{SEPARATOR}\n\n"
        "Envíalos separados por comas:\n\n"
        "📝 *Ejemplo:*\n"
        "Bogotá, Calle 123 #45-67, correo@ejemplo.com\n\n"
        "⏰ Tiempo de entrega: 24 horas."
    )


def format_cedula_request() -> str:
    """
    Formato de solicitud de cédula (después de confirmar pedido).
    """
    return (
        "¡Excelente! Tu pedido está confirmado.\n\n"
        f"{SEPARATOR}\n"
        "Para finalizar, necesito tu número de *cédula*:\n"
        f"{SEPARATOR}\n\n"
        "📝 *Ejemplo:* 1234567890"
    )


def format_order_confirmation(order_summary: str) -> str:
    """
    Formato de confirmación de pedido.
    """
    return (
        f"📦 *RESUMEN DE TU PEDIDO*\n\n"
        f"{order_summary}\n\n"
        f"{SEPARATOR}\n"
        "¿Confirmas este pedido?\n\n"
        "✅ Responde *SÍ* para continuar\n"
        "❌ Responde *NO* para cancelar o modificar"
    )


def format_payment_methods() -> str:
    """
    Formato de opciones de método de pago.
    """
    return (
        "Perfecto, ahora selecciona tu método de pago:\n\n"
        "💳 *TRANSFERENCIA/PSE:*\n"
        "• 1️⃣ *Bancolombia*\n"
        "• 2️⃣ *Nequi*\n"
        "• 3️⃣ *Daviplata*\n"
        "• 4️⃣ *BBva*\n\n"
        "💵 *PAGO AL RECIBIR:*\n"
        "• 5️⃣ *Contra entrega* (efectivo)\n\n"
        f"{SEPARATOR}\n"
        "Responde con el *número* de tu opción."
    )


def format_validation_error(field_name: str, error: str) -> str:
    """
    Formato de error de validación con solicitud de reintento.

    Args:
        field_name: Nombre del campo que falló
        error: Mensaje de error específico
    """
    return (
        f"⚠️ Hubo un problema con tu {field_name}:\n"
        f"{error}\n\n"
        "Por favor, inténtalo de nuevo."
    )


def format_inactivity_reminder(name: str | None) -> str:
    """
    Formato de recordatorio por inactividad.

    Args:
        name: Nombre del cliente (opcional)
    """
    greeting = f"¡Hola {name}!" if name else "¡Hola!"
    return (
        f"{greeting}\n\n"
        "Vi que quedaste a medias con tu pedido. "
        "¿Te gustaría continuar? 🥩\n\n"
        "Responde *SÍ* para seguir o escríbeme tu pregunta."
    )


def format_welcome_message() -> str:
    """
    Mensaje de bienvenida inicial.
    """
    return (
        "🥩 ¡Hola! Bienvenido a nuestro distribuidor de *carnes finas* de alta calidad\n\n"
        "Para empezar, ¿cuál es tu nombre?\n\n"
        "📝 *Ejemplo:* Juan"
    )


def format_name_captured(name: str) -> str:
    """
    Mensaje después de capturar el nombre.
    """
    return (
        f"¡Perfecto, {name}! Somos distribuidores de carnes finas de alta calidad. 🥩\n\n"
        "Tenemos productos individuales por kilo y combos especiales. "
        "¿Qué te gustaría ver?\n\n"
        "Puedo mostrarte nuestro catálogo completo o recomendarte algo según tus necesidades."
    )


def format_transfer_proof_request(payment_method: str) -> str:
    """
    Solicitud de comprobante de transferencia.
    """
    return (
        f"Excelente. Por favor envía el comprobante de tu transferencia {payment_method} "
        "para confirmar tu pedido. Puedes enviarlo como imagen o screenshot.\n\n"
        "De una vez vamos a organizar tu siguiente pedido, tenemos disponibilidad "
        "para dentro de 1-2 semanas, ¿para qué día lo prefieres?"
    )


def format_payment_completed_transfer(schedule_ack: str = "") -> str:
    """
    Mensaje de pago completado (transferencia).
    """
    return (
        f"{schedule_ack}"
        "¡Pago verificado y pedido confirmado! 🎉\n\n"
        "Tu orden está siendo preparada y saldrá pronto hacia tu dirección.\n\n"
        "Te contactaremos cuando el pedido esté en camino. ¡Gracias por tu compra!"
    )


def format_payment_completed_cash() -> str:
    """
    Mensaje de pago completado (contra entrega).
    """
    return (
        "¡Pedido confirmado! 🎉\n\n"
        "Tu orden está siendo preparada y saldrá pronto hacia tu dirección. "
        "Pagarás en efectivo al recibir.\n\n"
        "Te contactaremos cuando el pedido esté en camino. ¡Gracias por tu compra!"
    )


def format_order_cancelled() -> str:
    """
    Mensaje cuando el usuario cancela el pedido.
    """
    return "Entendido. ¿Deseas modificar algo del pedido o ver otros productos?"


def format_city_not_available(city: str) -> str:
    """
    Mensaje cuando la ciudad no tiene cobertura.
    """
    return (
        f"Lo siento, actualmente solo hacemos entregas en Bogotá y Cali. "
        f"No podemos enviar a {city}. 😔\n\n"
        "¿Deseas que te contactemos cuando ampliemos cobertura a tu ciudad?"
    )


def format_ask_name_again() -> str:
    """
    Mensaje para pedir el nombre nuevamente.
    """
    return "Por favor, escribe tu nombre.\n\n📝 *Ejemplo:* Juan"


def format_ask_confirmation_again() -> str:
    """
    Mensaje para pedir confirmación nuevamente.
    """
    return "Por favor responde *SÍ* para confirmar o *NO* para cancelar/modificar."


def format_cedula_invalid() -> str:
    """
    Mensaje cuando no se detecta cédula válida.
    """
    return (
        "No pude encontrar un número de cédula válido.\n\n"
        "Por favor envía solo tu número de cédula (6-15 dígitos).\n\n"
        "📝 *Ejemplo:* 1234567890"
    )


def format_order_already_completed() -> str:
    """
    Mensaje cuando el pedido ya está completado.
    """
    return "Tu pedido ya está confirmado. Si tienes alguna pregunta adicional, por favor escríbenos."


def format_new_order_prompt() -> str:
    """
    Mensaje cuando el cliente quiere hacer un nuevo pedido después de completar uno.
    """
    return (
        "¡Claro! Me encanta que quieras hacer otro pedido. 🥩\n\n"
        "Vamos a empezar de nuevo. ¿Qué te gustaría ordenar esta vez?\n\n"
        "Puedo mostrarte nuestro catálogo o recomendarte algo según tus necesidades."
    )


def format_name_with_order_intent() -> str:
    """
    Mensaje cuando detectamos que el usuario quiere pedir pero no dio su nombre.
    """
    return (
        "¡Perfecto! Veo que quieres hacer un pedido. 🥩\n\n"
        "Antes de continuar, ¿me puedes decir tu nombre?\n\n"
        "📝 *Ejemplo:* Juan"
    )
