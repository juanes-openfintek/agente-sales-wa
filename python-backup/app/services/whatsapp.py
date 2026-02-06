import requests

from app.config import EVOLUTION_APIKEY, EVOLUTION_URL, INSTANCE


def send_whatsapp(to_phone: str, message: str, image_url: str | None = None):
    """Envía mensaje por WhatsApp vía Evolution API."""
    headers = {"apikey": EVOLUTION_APIKEY, "Content-Type": "application/json"}

    if image_url:
        url = f"{EVOLUTION_URL}/message/sendMedia/{INSTANCE}"
        payload = {
            "number": to_phone,
            "mediatype": "image",
            "mimetype": "image/jpeg",
            "caption": message,
            "media": image_url,
        }
    else:
        url = f"{EVOLUTION_URL}/message/sendText/{INSTANCE}"
        payload = {"number": to_phone, "text": message}

    try:
        r = requests.post(url, json=payload, headers=headers, timeout=20)
        return r.status_code, r.text
    except Exception as e:  # pragma: no cover - log de conexión
        return 500, str(e)


def set_typing_status(phone: str, status: str = "composing") -> None:
    """Envía estado de presencia a WhatsApp ('composing' o 'paused')."""
    url = f"{EVOLUTION_URL}/chat/sendPresence/{INSTANCE}"
    headers = {"apikey": EVOLUTION_APIKEY, "Content-Type": "application/json"}
    payload = {"number": phone, "presence": status, "delay": 20000}

    try:
        requests.post(url, json=payload, headers=headers, timeout=5)
    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR PRESENCE] No se pudo enviar status: {e}")
