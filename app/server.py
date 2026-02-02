from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import model
from app.domain.state_machine import handle_webhook
from app.services.catalog import get_combos_completos, get_productos_individuales
from app.services.lead import (
    get_event_log,
    get_lead_info,
    is_test_phone,
    list_test_conversations,
    reset_test_conversation,
    test_conversations,
    _get_convex,
)
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona el ciclo de vida de la aplicación."""
    # Startup: iniciar scheduler de inactividad
    start_scheduler()
    yield
    # Shutdown: detener scheduler
    stop_scheduler()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)


@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    return {"ok": True}


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Agente de comidas rápidas funcionando con Convex"}


@app.get("/health")
def health_check():
    convex = _get_convex()
    return {"status": "healthy", "convex": "connected" if convex else "disconnected", "gemini": "configured" if model else "not configured"}


@app.get("/leads")
def get_leads():
    convex = _get_convex()
    if not convex:
        return {"leads": [], "error": "Convex no configurado"}

    try:
        results = convex.query("leads:getAll", {})
        return {"leads": results}
    except Exception as e:
        return {"leads": [], "error": str(e)}


@app.get("/productos")
def get_productos_endpoint():
    try:
        productos = get_productos_individuales()
        combos = get_combos_completos()
        return {"productos_individuales": productos, "combos": combos}
    except Exception as e:
        return {"error": str(e)}


@app.get("/history/{phone}")
def get_history_endpoint(phone: str, limit: int = 50):
    if is_test_phone(phone):
        events = test_conversations.get(phone, {}).get("events", [])
        return {"events": events[:limit], "source": "test"}

    events = get_event_log(phone, limit=limit)
    return {"events": events, "source": "convex"}


@app.get("/test-conversations")
def get_test_conversations():
    return {"test_conversations": list_test_conversations()}


@app.post("/reset-test/{phone}")
def reset_test_conversation_endpoint(phone: str):
    success = reset_test_conversation(phone)
    return {"success": success, "message": f"Conversación de {phone} reseteada" if success else f"No se encontró conversación para {phone}"}


@app.post("/test-webhook")
async def test_webhook_endpoint(request: Request):
    data = await request.json()
    phone = data.get("phone", "test123")
    text = data.get("text", "")
    has_image = data.get("has_image", False)

    # Construir mensaje segun si tiene imagen o no
    if has_image:
        # Simular un imageMessage de WhatsApp
        message_obj: dict[str, Any] = {
            "imageMessage": {
                "caption": text or "Comprobante de pago",
                "mimetype": "image/jpeg",
            }
        }
    else:
        message_obj = {"conversation": text}

    test_data: dict[str, Any] = {
        "data": {
            "key": {"remoteJid": f"{phone}@s.whatsapp.net"},
            "message": message_obj
        },
        "demo": True
    }

    return await handle_webhook(test_data)


@app.get("/webhook")
async def webhook_get():
    return {"status": "ok", "message": "Webhook endpoint activo. Usa POST para enviar eventos."}


@app.post("/webhook")
@app.post("/webhook/{event_type}")
async def webhook(req: Request, event_type: str | None = None):
    try:
        raw = await req.json()
    except Exception as e:
        print(f"[ERROR JSON] No se pudo parsear JSON: {e}")
        return {"ok": False, "error": str(e)}

    return await handle_webhook(raw, event_type)
