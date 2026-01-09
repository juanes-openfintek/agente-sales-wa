"""
Scheduler para seguimiento automático de conversaciones inactivas.
Usa APScheduler para ejecutar verificaciones periódicas.
"""
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import (
    INACTIVITY_TIMEOUT_MINUTES,
    SCHEDULER_CHECK_INTERVAL_SECONDS,
    ConversationState,
)
from app.services.lead import get_all_active_conversations, mark_reminder_sent
from app.services.whatsapp import send_whatsapp
from app.utils.messages import format_inactivity_reminder


# Scheduler global
scheduler = AsyncIOScheduler()


async def check_inactive_conversations() -> None:
    """
    Verifica todas las conversaciones activas por inactividad.
    Envía UN recordatorio por sesión de inactividad.

    Lógica:
    - Si el último mensaje del cliente fue hace más de INACTIVITY_TIMEOUT_MINUTES
    - Y no se ha enviado un recordatorio después de ese mensaje
    - Entonces envía un recordatorio y marca reminder_sent_at
    """
    print("[SCHEDULER] Verificando conversaciones inactivas...")

    now = datetime.now(timezone.utc)
    timeout = timedelta(minutes=INACTIVITY_TIMEOUT_MINUTES)

    conversations = get_all_active_conversations()
    reminders_sent = 0

    for conv in conversations:
        phone = conv.get("phone")
        status = conv.get("status")

        # Saltar conversaciones completadas (doble verificación)
        if status == ConversationState.PAYMENT_COMPLETED.value:
            continue

        last_message_str = conv.get("last_customer_message_at")
        reminder_sent_str = conv.get("reminder_sent_at")

        # Si no hay timestamp de último mensaje, saltar
        if not last_message_str:
            continue

        # Parsear timestamps
        try:
            # Intentar parsear con zona horaria
            if last_message_str.endswith("Z"):
                last_message_str = last_message_str.replace("Z", "+00:00")

            # Si no tiene zona horaria, asumir UTC
            if "+" not in last_message_str and "-" not in last_message_str[-6:]:
                last_msg_time = datetime.fromisoformat(last_message_str).replace(tzinfo=timezone.utc)
            else:
                last_msg_time = datetime.fromisoformat(last_message_str)
        except (ValueError, TypeError) as e:
            print(f"[SCHEDULER] Error parseando timestamp para {phone}: {e}")
            continue

        # Verificar si está inactivo
        time_since_last_msg = now - last_msg_time
        is_inactive = time_since_last_msg > timeout

        if not is_inactive:
            continue

        # Verificar si ya se envió un recordatorio para esta sesión de inactividad
        already_reminded = False
        if reminder_sent_str:
            try:
                if reminder_sent_str.endswith("Z"):
                    reminder_sent_str = reminder_sent_str.replace("Z", "+00:00")

                if "+" not in reminder_sent_str and "-" not in reminder_sent_str[-6:]:
                    reminder_time = datetime.fromisoformat(reminder_sent_str).replace(tzinfo=timezone.utc)
                else:
                    reminder_time = datetime.fromisoformat(reminder_sent_str)

                # El recordatorio es válido si se envió después del último mensaje
                already_reminded = reminder_time > last_msg_time
            except (ValueError, TypeError):
                pass

        if already_reminded:
            continue

        # Enviar recordatorio
        print(f"[SCHEDULER] Enviando recordatorio a {phone} (inactivo por {time_since_last_msg})")

        name = conv.get("name")
        message = format_inactivity_reminder(name)

        try:
            status_code, response = send_whatsapp(phone, message)

            if 200 <= status_code < 300:
                mark_reminder_sent(phone)
                reminders_sent += 1
                print(f"[SCHEDULER] Recordatorio enviado exitosamente a {phone}")
            else:
                print(f"[SCHEDULER] Error enviando recordatorio a {phone}: ({status_code}) {response}")
        except Exception as e:
            print(f"[SCHEDULER] Excepción enviando recordatorio a {phone}: {e}")

    if reminders_sent > 0:
        print(f"[SCHEDULER] Total de recordatorios enviados: {reminders_sent}")
    else:
        print("[SCHEDULER] No hay conversaciones que requieran recordatorio")


def start_scheduler() -> None:
    """Inicia el scheduler de verificación de inactividad."""
    scheduler.add_job(
        check_inactive_conversations,
        "interval",
        seconds=SCHEDULER_CHECK_INTERVAL_SECONDS,
        id="inactivity_check",
        replace_existing=True,
    )
    scheduler.start()
    print(f"[SCHEDULER] Iniciado - verificación cada {SCHEDULER_CHECK_INTERVAL_SECONDS} segundos")


def stop_scheduler() -> None:
    """Detiene el scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[SCHEDULER] Detenido")
