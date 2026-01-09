"""
Utilidades compartidas para el agente de ventas.
"""

from app.utils.validation import (
    validate_email,
    validate_name,
    validate_address,
    validate_cedula,
    extract_email_from_text,
    extract_cedula_from_text,
)

from app.utils.messages import (
    format_missing_fields_prompt,
    format_delivery_info_request,
    format_cedula_request,
    format_validation_error,
    format_inactivity_reminder,
    format_payment_methods,
    format_order_confirmation,
    format_new_order_prompt,
    format_name_with_order_intent,
)

__all__ = [
    # Validación
    "validate_email",
    "validate_name",
    "validate_address",
    "validate_cedula",
    "extract_email_from_text",
    "extract_cedula_from_text",
    # Mensajes
    "format_missing_fields_prompt",
    "format_delivery_info_request",
    "format_cedula_request",
    "format_validation_error",
    "format_inactivity_reminder",
    "format_payment_methods",
    "format_order_confirmation",
    "format_new_order_prompt",
    "format_name_with_order_intent",
]
