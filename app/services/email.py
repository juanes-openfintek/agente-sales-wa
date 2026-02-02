"""
Servicio de envío de emails usando Resend API.
"""
import os
from typing import Any

import httpx


# Configuración de Resend
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "pagos@tudominio.com")
NOTIFICATION_EMAIL = os.getenv("NOTIFICATION_EMAIL", "ventas@tudominio.com")


class EmailService:
    """Servicio para enviar emails via Resend API."""

    BASE_URL = "https://api.resend.com"

    def __init__(self):
        self.api_key = RESEND_API_KEY
        if not self.api_key:
            print("[EMAIL] WARNING: RESEND_API_KEY no configurada")

    async def send_email(
        self,
        to: str | list[str],
        subject: str,
        html: str,
        from_email: str | None = None,
    ) -> dict[str, Any]:
        """
        Envía un email usando Resend API.
        
        Args:
            to: Destinatario(s)
            subject: Asunto del email
            html: Contenido HTML del email
            from_email: Email remitente (opcional, usa default)
        
        Returns:
            dict con id del email o error
        """
        if not self.api_key:
            return {"error": "RESEND_API_KEY no configurada", "sent": False}

        if isinstance(to, str):
            to = [to]

        payload = {
            "from": from_email or RESEND_FROM_EMAIL,
            "to": to,
            "subject": subject,
            "html": html,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/emails",
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    print(f"[EMAIL] Enviado exitosamente: {data.get('id')}")
                    return {"id": data.get("id"), "sent": True}
                else:
                    error_msg = response.text
                    print(f"[EMAIL] Error enviando: {response.status_code} - {error_msg}")
                    return {"error": error_msg, "sent": False}

        except Exception as e:
            print(f"[EMAIL] Excepción enviando email: {e}")
            return {"error": str(e), "sent": False}

    async def send_payment_notification(
        self,
        phone: str,
        payment_number: int,
        amount: float,
        payment_method: str,
        order_total: float | None = None,
        customer_name: str | None = None,
    ) -> dict[str, Any]:
        """
        Envía notificación de nuevo pago recibido.
        
        Args:
            phone: Teléfono del cliente que pagó
            payment_number: Consecutivo interno del pago
            amount: Monto del pago
            payment_method: Método de pago usado
            order_total: Total del pedido (opcional)
            customer_name: Nombre del cliente (opcional)
        """
        subject = f"💰 Nuevo Pago #{payment_number} - {payment_method}"

        # Formatear monto
        amount_formatted = f"${amount:,.0f}".replace(",", ".")

        # HTML del email
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    border-radius: 10px 10px 0 0;
                    text-align: center;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 24px;
                }}
                .content {{
                    background: #f9fafb;
                    padding: 30px;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    border-radius: 0 0 10px 10px;
                }}
                .payment-box {{
                    background: white;
                    border: 2px solid #10b981;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    text-align: center;
                }}
                .payment-number {{
                    font-size: 14px;
                    color: #6b7280;
                    margin-bottom: 5px;
                }}
                .payment-amount {{
                    font-size: 36px;
                    font-weight: bold;
                    color: #10b981;
                    margin: 10px 0;
                }}
                .detail-row {{
                    display: flex;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                }}
                .detail-label {{
                    color: #6b7280;
                    font-weight: 500;
                }}
                .detail-value {{
                    font-weight: 600;
                    color: #111827;
                }}
                .phone-highlight {{
                    background: #fef3c7;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 16px;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 20px;
                    color: #9ca3af;
                    font-size: 12px;
                }}
                .badge {{
                    display: inline-block;
                    background: #dbeafe;
                    color: #1d4ed8;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-top: 10px;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>💰 Nuevo Pago Recibido</h1>
                <span class="badge">Pendiente de Verificación</span>
            </div>
            <div class="content">
                <div class="payment-box">
                    <div class="payment-number">Pago #{payment_number}</div>
                    <div class="payment-amount">{amount_formatted}</div>
                    <div style="color: #6b7280;">{payment_method}</div>
                </div>
                
                <div class="detail-row">
                    <span class="detail-label">📱 Teléfono</span>
                    <span class="detail-value phone-highlight">{phone}</span>
                </div>
                
                {"<div class='detail-row'><span class='detail-label'>👤 Cliente</span><span class='detail-value'>" + customer_name + "</span></div>" if customer_name else ""}
                
                {"<div class='detail-row'><span class='detail-label'>📦 Total Pedido</span><span class='detail-value'>$" + f"{order_total:,.0f}".replace(",", ".") + "</span></div>" if order_total else ""}
                
                <div class="detail-row">
                    <span class="detail-label">💳 Método</span>
                    <span class="detail-value">{payment_method}</span>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; text-align: center;">
                    <strong>⚠️ Acción Requerida</strong><br>
                    <span style="font-size: 14px;">Este pago requiere verificación manual</span>
                </div>
            </div>
            <div class="footer">
                Este es un mensaje automático del sistema de pagos.<br>
                No responder a este correo.
            </div>
        </body>
        </html>
        """

        return await self.send_email(
            to=NOTIFICATION_EMAIL,
            subject=subject,
            html=html,
        )


# Singleton del servicio
_email_service: EmailService | None = None


def get_email_service() -> EmailService:
    """Obtiene la instancia singleton del servicio de email."""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service


async def send_payment_notification(
    phone: str,
    payment_number: int,
    amount: float,
    payment_method: str,
    order_total: float | None = None,
    customer_name: str | None = None,
) -> dict[str, Any]:
    """
    Función de conveniencia para enviar notificación de pago.
    """
    service = get_email_service()
    return await service.send_payment_notification(
        phone=phone,
        payment_number=payment_number,
        amount=amount,
        payment_method=payment_method,
        order_total=order_total,
        customer_name=customer_name,
    )
