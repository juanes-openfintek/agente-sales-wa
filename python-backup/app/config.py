import os
from enum import Enum
from typing import Final

import google.generativeai as genai
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar variables de entorno
load_dotenv()
if not os.getenv("GEMINI_API_KEY"):
    load_dotenv("../.env")

# Configuración externa
EVOLUTION_URL = os.getenv("EVOLUTION_URL", "http://localhost:3001")
EVOLUTION_APIKEY = os.getenv("EVOLUTION_APIKEY", "")
INSTANCE = os.getenv("INSTANCE", "mi-agente-ia")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Configuración de Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


# ============================================================
# ENUM DE ESTADOS
# ============================================================
class ConversationState(str, Enum):
    """Estados posibles de la conversación."""
    COLLECTING_INFO = "collecting_info"
    BROWSING = "browsing"
    COLLECTING_DELIVERY_INFO = "collecting_delivery_info"
    CONFIRMING_ORDER = "confirming_order"
    COLLECTING_CEDULA = "collecting_cedula"  # Nuevo estado: cédula después de confirmar
    PAYMENT_METHOD = "payment_method"
    WAITING_TRANSFER_PROOF = "waiting_transfer_proof"
    PAYMENT_COMPLETED = "payment_completed"


# Descripciones de estados (para UI/logs)
STATE_DESCRIPTIONS: dict[str, str] = {
    ConversationState.COLLECTING_INFO: "Recolectando nombre",
    ConversationState.BROWSING: "Navegando catálogo / haciendo pedido",
    ConversationState.COLLECTING_DELIVERY_INFO: "Recolectando información de envío",
    ConversationState.CONFIRMING_ORDER: "Confirmando pedido antes de pago",
    ConversationState.COLLECTING_CEDULA: "Recolectando cédula",
    ConversationState.PAYMENT_METHOD: "Seleccionando método de pago",
    ConversationState.WAITING_TRANSFER_PROOF: "Esperando comprobante de transferencia",
    ConversationState.PAYMENT_COMPLETED: "Pago completado / Pedido en proceso",
}

# Mantener STATES para compatibilidad (deprecated)
STATES = {state.value: STATE_DESCRIPTIONS.get(state, state.value) for state in ConversationState}


# ============================================================
# CONSTANTES DE UI
# ============================================================
SEPARATOR: Final[str] = "━━━━━━━━━━━━━━━━━━━━━"
FREE_ITEM_LABEL: Final[str] = "GRATIS"


# ============================================================
# MÉTODOS DE PAGO
# ============================================================
PAYMENT_METHODS: dict[str, str] = {
    "1": "Bancolombia",
    "bancolombia": "Bancolombia",
    "2": "Nequi",
    "nequi": "Nequi",
    "3": "Daviplata",
    "daviplata": "Daviplata",
    "4": "BBva",
    "bbva": "BBva",
    "5": "Contra entrega",
    "contra entrega": "Contra entrega",
    "efectivo": "Contra entrega",
}


# ============================================================
# CONFIGURACIÓN DE INACTIVIDAD
# ============================================================
# Tiempo de espera antes de enviar recordatorio (15 minutos es más natural para ventas)
INACTIVITY_TIMEOUT_MINUTES: Final[int] = 10
# Intervalo de verificación del scheduler (cada 60 segundos)
SCHEDULER_CHECK_INTERVAL_SECONDS: Final[int] = 60


# ============================================================
# CIUDADES VÁLIDAS
# ============================================================
VALID_CITIES: list[str] = ["bogota", "bogotá", "cali"]

# Inicializar cliente de Supabase (opcional - solo para migración)
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[OK] Supabase conectado (modo legacy/migración)")
    except Exception as e:  # pragma: no cover - solo logueo
        print(f"[WARNING] No se pudo conectar a Supabase: {e}")
        supabase = None

# Configurar Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-3-flash-preview")
    print("[OK] Gemini configurado")
else:
    print("WARNING: GEMINI_API_KEY not found in env vars")
    model = None
