from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import model, supabase
from app.domain.state_machine import handle_webhook
from app.services.catalog import get_combos_completos, get_productos_individuales
from app.services.lead import (
    get_event_log,
    is_test_phone,
    list_test_conversations,
    reset_test_conversation,
    test_conversations,
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
    return {"status": "ok", "message": "Agente de comidas rápidas funcionando con Supabase"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "supabase": "connected" if supabase else "disconnected", "gemini": "configured" if model else "not configured"}


@app.get("/leads")
def get_leads():
    if not supabase:
        return {"leads": [], "error": "Supabase no configurado"}

    try:
        response = supabase.table("leads").select("*").order("updated_at", desc=True).execute()
        return {"leads": response.data}
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

    if not supabase:
        return {"events": [], "error": "Supabase no configurado"}

    events = get_event_log(phone, limit=limit)
    return {"events": events, "source": "supabase"}


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

    test_data: dict[str, Any] = {
        "data": {
            "key": {"remoteJid": f"{phone}@s.whatsapp.net"},
            "message": {"conversation": text}
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
