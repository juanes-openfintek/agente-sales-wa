import os
import time
import json
import requests
import google.generativeai as genai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime

# Cargar variables de entorno
load_dotenv()
if not os.getenv("GEMINI_API_KEY"):
    load_dotenv("../.env")

# Configuración
EVOLUTION_URL = os.getenv("EVOLUTION_URL", "http://localhost:8080")
EVOLUTION_APIKEY = os.getenv("EVOLUTION_APIKEY", "")
INSTANCE = os.getenv("INSTANCE", "mi-agente-ia")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Configuración de Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Inicializar cliente de Supabase
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[OK] Supabase conectado correctamente")
    except Exception as e:
        print(f"[ERROR] No se pudo conectar a Supabase: {e}")
        supabase = None
else:
    print("[WARNING] SUPABASE_URL o SUPABASE_KEY no encontradas en .env")

# Configurar Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-3-flash-preview')
    print("[OK] Gemini configurado")
else:
    print("WARNING: GEMINI_API_KEY not found in env vars")
    model = None

app = FastAPI()

# Habilitar CORS - Configuración completa para evitar errores de preflight
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "http://localhost:3000",
        "http://localhost:5174" 
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache de preflight por 1 hora
)

# --- SISTEMA DE ESTADOS ---

# Estados posibles del agente
STATES = {
    "collecting_info": "Recolectando nombre y teléfono",
    "browsing": "Navegando catálogo / haciendo pedido",
    "collecting_delivery_info": "Recolectando información de envío",
    "confirming_order": "Confirmando pedido antes de pago",
    "payment_method": "Seleccionando método de pago",
    "waiting_transfer_proof": "Esperando comprobante de transferencia",
    "payment_completed": "Pago completado / Pedido en proceso"
}

# Ciudades donde entregamos
VALID_CITIES = ["bogota", "bogotá", "cali"]

def get_state_response(state, lead_info, user_text=None, order_summary=None):
    """Genera respuestas automáticas según el estado (sin Gemini)"""
    
    if state == "collecting_info":
        return {
            "reply": "🥩 ¡Hola! Bienvenido a nuestro distribuidor de *carnes crudas* de alta calidad\n\nPara empezar, ¿cuál es tu nombre y número de teléfono?\n\n📝 *Ejemplo:* Juan 3001234567",
            "next_state": "collecting_info"
        }
    
    elif state == "collecting_delivery_info":
        name = lead_info.get("name", "")
        return {
            "reply": f"✅ Perfecto, {name}. Para procesar tu pedido, necesito los siguientes datos:\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *Cédula*\n📍 *Ciudad* (Bogotá o Cali)\n🏠 *Dirección completa*\n📧 *Correo electrónico*\n⏰ *Tiempo de entrega* (ej: mañana, hoy tarde)\n━━━━━━━━━━━━━━━━━━━━━\n\nEnvíalos separados por comas en este orden:\n\n📝 *Ejemplo:*\n1234567890, Bogotá, Calle 123 #45-67, correo@ejemplo.com, mañana",
            "next_state": "collecting_delivery_info"
        }
    
    elif state == "confirming_order":
        return {
            "reply": f"📦 *RESUMEN DE TU PEDIDO*\n\n{order_summary}\n\n━━━━━━━━━━━━━━━━━━━━━\n¿Confirmas este pedido?\n\n✅ Responde *SÍ* para continuar al pago\n❌ Responde *NO* para cancelar o modificar",
            "next_state": "confirming_order"
        }
    
    elif state == "payment_method":
        return {
            "reply": "Perfecto, ahora selecciona tu método de pago:\n\n💳 *TRANSFERENCIA/PSE:*\n• 1️⃣ *Bancolombia*\n• 2️⃣ *Nequi*\n• 3️⃣ *Daviplata*\n• 4️⃣ *BBva*\n\n💵 *PAGO AL RECIBIR:*\n• 5️⃣ *Contra entrega* (efectivo)\n\n━━━━━━━━━━━━━━━━━━━━━\nResponde con el *número* de tu opción.",
            "next_state": "payment_method"
        }
    
    elif state == "waiting_transfer_proof":
        payment_method = lead_info.get("payment_method", "transferencia")
        return {
            "reply": (
                f"Excelente. Por favor envía el comprobante de tu transferencia {payment_method} para confirmar tu pedido. "
                "Puedes enviarlo como imagen o screenshot.\n\n"
                "De una vez vamos a organizar tu siguiente pedido, tenemos disponibilidad para dentro de 1-2 semanas, "
                "¿para qué día lo prefieres?"
            ),
            "next_state": "waiting_transfer_proof"
        }
    
    elif state == "payment_completed":
        payment_method = lead_info.get("payment_method", "")
        if payment_method == "Contra entrega":
            return {
                "reply": "¡Pedido confirmado! 🎉\n\nTu orden está siendo preparada y saldrá pronto hacia tu dirección. Pagarás en efectivo al recibir.\n\nTe contactaremos cuando el pedido esté en camino. ¡Gracias por tu compra!",
                "next_state": "payment_completed"
            }
        else:
            return {
                "reply": "¡Pago verificado y pedido confirmado! 🎉\n\nTu orden está siendo preparada y saldrá pronto hacia tu dirección.\n\nTe contactaremos cuando el pedido esté en camino. ¡Gracias por tu compra!",
                "next_state": "payment_completed"
            }
    
    return None

# --- SISTEMA DE PRUEBAS ---

# Almacenamiento temporal para conversaciones de prueba
test_conversations = {}

def is_test_phone(phone):
    """Detecta si es un número de teléfono de prueba"""
    if not phone:
        return False

    phone_str = str(phone).lower()

    # Números que empiezan con "demo", "test", "prueba"
    test_prefixes = ["demo", "test", "prueba", "dev", "qa"]

    # Números que terminan con ciertos sufijos
    test_suffixes = ["999", "888", "777", "666", "555"]

    # Verificar prefijos
    for prefix in test_prefixes:
        if phone_str.startswith(prefix):
            return True

    # Verificar sufijos
    for suffix in test_suffixes:
        if phone_str.endswith(suffix):
            return True

    # Números muy cortos o con letras (para demo)
    if len(phone_str) < 7 or any(c.isalpha() for c in phone_str):
        return True

    return False

def get_test_lead_info(phone):
    """Obtiene información de lead para pruebas (almacenamiento temporal)"""
    if phone not in test_conversations:
        test_conversations[phone] = {
            "name": None,
            "contact_phone": None,
            "email": None,
            "address": None,
            "cedula": None,
            "city": None,
            "delivery_time": None,
            "status": "collecting_info",
            "payment_method": None,
            "events": []
        }

    return test_conversations[phone].copy()

def update_test_lead_info(phone, **kwargs):
    """Actualiza información de lead para pruebas"""
    if phone not in test_conversations:
        get_test_lead_info(phone)

    test_conversations[phone].update(kwargs)
    print(f"[TEST] Lead actualizado para {phone}: {kwargs}")

def save_test_event(phone, direction, text, metadata=None):
    """Guarda evento en conversación de prueba"""
    if phone not in test_conversations:
        get_test_lead_info(phone)

    event = {
        "direction": direction,
        "text": text,
        "metadata": metadata or {},
        "timestamp": datetime.now().isoformat()
    }

    test_conversations[phone]["events"].append(event)
    print(f"[TEST] Evento guardado para {phone}: {direction} - {text[:50]}...")

def get_test_history(phone, limit=10):
    """Obtiene historial de conversación de prueba"""
    if phone not in test_conversations:
        return []

    events = test_conversations[phone]["events"][-limit:]
    history = []

    for event in events:
        role = "user" if event["direction"] == "in" else "model"
        history.append({"role": role, "parts": [event["text"]]})

    return history

def reset_test_conversation(phone):
    """Resetea una conversación de prueba"""
    if phone in test_conversations:
        del test_conversations[phone]
        print(f"[TEST] Conversación reseteada para {phone}")
        return True
    return False

def list_test_conversations():
    """Lista todas las conversaciones de prueba activas"""
    return {
        phone: {
            "name": data.get("name"),
            "status": data.get("status"),
            "events_count": len(data.get("events", [])),
            "last_activity": data.get("events", [-1])[-1].get("timestamp") if data.get("events") else None
        }
        for phone, data in test_conversations.items()
    }

# --- FUNCIONES DE FORMATO ---

def format_whatsapp_message(text):
    """Formatea texto para WhatsApp con el formato correcto"""
    # Limpiar formato markdown y convertir a formato WhatsApp

    # Los asteriscos ya están en el formato correcto de WhatsApp (*texto*)
    # Solo nos aseguramos de que no haya problemas de encoding

    # Convertir separadores largos si es necesario
    text = text.replace("━━━━━━━━━━━━━━━━━━━━━", "━━━━━━━━━━━━━━━━━━━━━")

    # Asegurar que los emojis y símbolos estén bien
    text = text.replace("✅", "✅").replace("❌", "❌").replace("📦", "📦")
    text = text.replace("💰", "💰").replace("💳", "💳").replace("💵", "💵")

    return text.strip()

def clean_gemini_response(text):
    """Limpia la respuesta de Gemini para formato WhatsApp"""
    # Gemini a veces devuelve texto con formato markdown que no queremos
    # Convertir formato markdown a formato WhatsApp correcto

    # Convertir formato markdown estándar a formato WhatsApp
    import re

    # **negrita** -> *negrita*
    text = re.sub(r'\*\*(.*?)\*\*', r'*\1*', text)

    # __cursiva__ -> _cursiva_
    text = re.sub(r'__(.*?)__', r'_\1_', text)

    # ~~tachado~~ -> ~tachado~
    text = re.sub(r'~~(.*?)~~', r'~\1~', text)

    # Eliminar cualquier triple asterisco o más
    text = re.sub(r'\*{3,}', '*', text)

    # Asegurar que los precios estén bien formateados
    text = re.sub(r'\$(\d+)', lambda m: f"${int(m.group(1)):,}", text)

    return text

# --- FUNCIONES DE BASE DE DATOS (SUPABASE) ---

def get_productos_individuales():
    """Obtiene todos los productos individuales del inventario"""
    if not supabase:
        return []
    try:
        response = supabase.table('inventario_comidas_rapidas').select('*').execute()
        return response.data
    except Exception as e:
        print(f"[ERROR] Error obteniendo productos: {e}")
        return []

def get_combos_completos():
    """Obtiene todos los combos con sus items incluyendo información de gratis"""
    if not supabase:
        return []
    try:
        # Obtener combos
        combos_response = supabase.table('combos').select('*').execute()
        combos = combos_response.data

        # Para cada combo, obtener sus items con info de gratis
        for combo in combos:
            items_response = supabase.table('combo_items')\
                .select('*')\
                .eq('combo_key', combo['combo_key'])\
                .execute()

            # Marcar items gratis
            items = items_response.data
            for item in items:
                item['is_free'] = item.get('is_free', False)

            combo['items'] = items

            # Calcular precio real considerando items gratis
            items_with_price = []
            total_price = combo.get('precio', 0)

            for item in items:
                if item.get('is_free', False):
                    items_with_price.append(f"🎁 {item.get('item_name', '')} - GRATIS")
                else:
                    items_with_price.append(f"{item.get('item_name', '')}")

            combo['formatted_items'] = items_with_price
            combo['total_price'] = total_price

        return combos
    except Exception as e:
        print(f"[ERROR] Error obteniendo combos: {e}")
        return []

def get_catalogo_completo():
    """Obtiene el catálogo completo: productos individuales + combos"""
    productos = get_productos_individuales()
    combos = get_combos_completos()

    catalogo = {
        "productos_individuales": productos,
        "combos": combos
    }

    return json.dumps(catalogo, ensure_ascii=False)

def generate_order_summary(phone):
    """Genera un resumen detallado del pedido desde el historial"""
    if not supabase:
        return "• Pedido personalizado\n━━━━━━━━━━━━━━━━━━━━━\n💰 Total: Consultar"

    try:
        # Obtener mensajes recientes del usuario para detectar qué pidió
        messages = get_history(phone, limit=20)

        # Buscar patrones de pedido en los mensajes del usuario
        order_items = []
        total = 0

        # Buscar en mensajes del usuario (direction='in')
        user_messages = [msg for msg in messages if msg['role'] == 'user']

        for msg in user_messages:
            text = msg['parts'][0].lower()

            # Buscar productos individuales mencionados
            productos = get_productos_individuales()
            for prod in productos:
                prod_name = prod.get('nombre', '').lower()
                if prod_name in text:
                    # Intentar extraer cantidad
                    import re
                    qty_match = re.search(r'(\d+)\s*(?:kilos?|kg)', text)
                    qty = int(qty_match.group(1)) if qty_match else 1

                    price = prod.get('precio', 0) * qty
                    order_items.append(f"• {prod.get('nombre', 'Producto')} x{qty} - ${price:,}")
                    total += price
                    break

            # Buscar combos mencionados
            combos = get_combos_completos()
            for combo in combos:
                combo_name = combo.get('nombre', '').lower()
                if combo_name in text or combo.get('combo_key', '') in text:
                    combo_price = combo.get('precio', 0)
                    order_items.append(f"• {combo.get('nombre', 'Combo')} - ${combo_price:,}")

                    # Agregar items del combo (incluyendo gratis)
                    if 'items' in combo:
                        for item in combo['items']:
                            if item.get('is_free', False):
                                order_items.append(f"  🎁 {item.get('item_name', '')} - GRATIS")
                            else:
                                order_items.append(f"  • {item.get('item_name', '')}")

                    total += combo_price
                    break

        if not order_items:
            return "• Pedido personalizado\n━━━━━━━━━━━━━━━━━━━━━\n💰 Total: Consultar"

        summary = "\n".join(order_items)
        summary += f"\n━━━━━━━━━━━━━━━━━━━━━\n💰 *Total: ${total:,}*"

        return summary

    except Exception as e:
        print(f"[ERROR] Error generando resumen de pedido: {e}")
        return "• Pedido personalizado\n━━━━━━━━━━━━━━━━━━━━━\n💰 Total: Consultar"

def get_lead_info(phone):
    """Obtiene información del lead desde Supabase"""
    if not supabase:
        return {
            "name": None, "contact_phone": None, "email": None, "address": None, 
            "age": None, "cedula": None, "city": None, "delivery_time": None,
            "status": "collecting_info", "payment_method": None
        }
    
    try:
        response = supabase.table('leads').select('*').eq('phone', phone).execute()
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
                "status": lead.get("status", "collecting_info"),
                "payment_method": lead.get("payment_method")
            }
        return {
            "name": None, "contact_phone": None, "email": None, "address": None,
            "age": None, "cedula": None, "city": None, "delivery_time": None,
            "status": "collecting_info", "payment_method": None
        }
    except Exception as e:
        print(f"[ERROR] Error obteniendo lead: {e}")
        return {
            "name": None, "contact_phone": None, "email": None, "address": None,
            "age": None, "cedula": None, "city": None, "delivery_time": None,
            "status": "collecting_info", "payment_method": None
        }

def update_lead_info(phone, **kwargs):
    """Actualiza información del lead en Supabase"""
    if not supabase:
        return
    
    try:
        # Verificar si el lead existe
        existing = supabase.table('leads').select('id').eq('phone', phone).execute()
        
        data = {
            "phone": phone,
            "updated_at": datetime.now().isoformat()
        }
        data.update(kwargs)
        
        if existing.data and len(existing.data) > 0:
            # Actualizar
            supabase.table('leads').update(data).eq('phone', phone).execute()
        else:
            # Crear
            data["status"] = kwargs.get("status", "new")
            supabase.table('leads').insert(data).execute()
        
        print(f"[DEBUG] Lead actualizado: {phone} - {kwargs}")
    except Exception as e:
        print(f"[ERROR] Error actualizando lead: {e}")

def save_event(phone, direction, text, metadata=None):
    """Guarda un evento/mensaje en Supabase"""
    if not supabase:
        return
    
    try:
        # Asegurar que el lead existe antes de guardar el evento
        # (requerido por la foreign key constraint)
        existing = supabase.table('leads').select('id').eq('phone', phone).execute()
        if not existing.data or len(existing.data) == 0:
            # Crear lead si no existe
            supabase.table('leads').insert({
                "phone": phone,
                "status": "new",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }).execute()
            print(f"[DEBUG] Lead creado automáticamente para {phone}")
        
        # Ahora guardar el evento
        data = {
            "phone": phone,
            "direction": direction,
            "text": text,
            "created_at": datetime.now().isoformat()
        }
        if metadata:
            data["metadata"] = metadata
        
        supabase.table('events').insert(data).execute()
    except Exception as e:
        print(f"[ERROR] Error guardando evento: {e}")

def get_history(phone, limit=10):
    """Obtiene el historial de conversación desde Supabase"""
    if not supabase:
        return []
    
    try:
        response = supabase.table('events')\
            .select('direction, text')\
            .eq('phone', phone)\
            .order('created_at', desc=True)\
            .limit(limit)\
            .execute()
        
        # Invertir para orden cronológico
        history = []
        for event in reversed(response.data):
            role = "user" if event["direction"] == "in" else "model"
            history.append({"role": role, "parts": [event["text"]]})
        
        return history
    except Exception as e:
        print(f"[ERROR] Error obteniendo historial: {e}")
        return []

def get_event_log(phone, limit=100):
    """Devuelve eventos crudos (incluye timestamps/metadata) para rehidratar chats en front"""
    if not supabase:
        return []
    
    try:
        response = supabase.table('events')\
            .select('direction, text, created_at, metadata')\
            .eq('phone', phone)\
            .order('created_at', desc=False)\
            .limit(limit)\
            .execute()
        return response.data
    except Exception as e:
        print(f"[ERROR] Error obteniendo eventos: {e}")
        return []

def extract_next_order_preference(text):
    """Extrae preferencia de siguiente pedido (fecha aproximada) o rechazo"""
    if not text:
        return None

    t = text.lower()

    # Rechazo explícito
    if "no" in t and ("siguiente" in t or "segundo" in t or "otro pedido" in t):
        return {"preference": "rechazado", "decline": True}

    import re
    date_patterns = [
        r'\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b',
        r'\b\d{1,2}-\d{1,2}(?:-\d{2,4})?\b',
        r'\b\d{1,2}\s*(?:de)?\s*(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\w*\b',
    ]
    for pattern in date_patterns:
        match = re.search(pattern, t)
        if match:
            return {"preference": match.group(0), "decline": False}

    days = ["lunes", "martes", "miércoles", "miercoles", "jueves", "viernes", "sábado", "sabado", "domingo"]
    for day in days:
        if day in t:
            return {"preference": day, "decline": False}

    if "semana" in t:
        return {"preference": "dentro de 1-2 semanas", "decline": False}

    return None

def save_next_order_preference(phone, preference, save_event_func):
    """Guarda la intención de siguiente pedido en metadata de eventos"""
    save_event_func(phone, "out", f"next_order_preference:{preference}", {"next_order_preference": preference})

# --- LÓGICA DE GEMINI ---

def generate_gemini_response(phone, user_text, get_history_func=None):
    """Genera respuesta usando Gemini con contexto del catálogo"""
    if not model:
        return {
            "reply": "Error: Gemini no está configurado",
            "suggested_product_id": None,
            "suggested_product_image": None,
            "update_lead": None,
            "action": "none"
        }

    catalogo = get_catalogo_completo()
    # Usar función de historial pasada como parámetro, o la función normal por defecto
    if get_history_func:
        history = get_history_func(phone)
    else:
        history = get_history(phone)
    lead_info = get_lead_info(phone)
    
    system_instruction = f"""
    Eres un asistente de ventas experto de un DISTRIBUIDOR DE CARNES CRUDAS de alta calidad. Vendemos carnes al por mayor y menor a clientes finales. Tu objetivo es ayudar al cliente a encontrar las carnes que necesita y cerrar la venta.

    INFORMACIÓN DEL CLIENTE:
    - Nombre: {lead_info["name"]}
    - Teléfono: {lead_info["contact_phone"] or "No proporcionado"}
    - Ciudad: {lead_info.get("city", "No proporcionada")}
    - Email: {lead_info["email"] or "No proporcionado"}
    - Dirección: {lead_info["address"] or "No proporcionada"}
    - Estado: {lead_info["status"]}

    CATÁLOGO COMPLETO DE CARNES Y COMBOS:
    {catalogo}

    ZONAS DE COBERTURA:
    - ✅ Bogotá
    - ✅ Cali
    - ❌ OTRAS CIUDADES: NO ENTREGAMOS (debes informar al cliente amablemente)

    FLUJO DE VENTAS:

    1. **EXPLORACIÓN DE PRODUCTOS**:
       - SIEMPRE usa el nombre del cliente ({lead_info["name"]}) en tus respuestas de forma natural
       - Recomienda productos individuales (carnes por kilo) y combos
       - Explica las características de cada carne (ej: "Carne desmechada ideal para arepas, empanadas")
       - Los COMBOS son MÁS ECONÓMICOS - sugierelos activamente mencionando los items gratis cuando aplique
       - Cuando muestres un combo, indica claramente qué items son gratis con "🎁 GRATIS"
       - Calcula el precio total considerando los items gratis
       - Menciona que vendemos al por mayor y menor

    2. **CUANDO EL CLIENTE QUIERA HACER PEDIDO**:
       - Resume los productos y precio total (considerando items gratis)
       - Si ya tienes toda la info del cliente, responde con action: "ready_for_checkout"
       - Si falta información, el sistema se la pedirá automáticamente

    FORMATO DE MENSAJES (IMPORTANTE - Usa formato WhatsApp):
    - Para listas usa bullets: • Item 1
    - Para precios usa: $XX,XXX
    - Para separadores usa: ━━━━━━━━━━━━━━━━━━━━━
    - Para destacar usa: *texto* (negrita)
    - Para gratis usa: 🎁 GRATIS
    - NO uses **texto** (doble asterisco) - usa solo *texto*

    FORMATO DE RESPUESTA JSON (ESTRICTO):
    {{
        "reply": "Tu respuesta al cliente...",
        "order_items": ["Carne desmechada 2kg - $104,000", "🎁 Pollo desmechado 1kg - GRATIS"],
        "total_price": 104000,
        "action": "none" | "ready_for_checkout"
    }}

    REGLAS:
    - Sé profesional pero cercano
    - Habla de carnes crudas, no de comida preparada
    - Menciona que son productos frescos y de alta calidad
    - DESTACA LOS ITEMS GRATIS en los combos para hacerlos más atractivos
    - NO inventes productos fuera del catálogo
    - Si preguntan por una ciudad diferente a Bogotá o Cali, informa que NO entregamos allí
    """
    
    chat = model.start_chat(history=history)
    
    try:
        response = chat.send_message(f"System: {system_instruction}\nUser: {user_text}")
        content = response.text
        
        print(f"[DEBUG] Respuesta de Gemini: {content[:200]}...")
        
        # Limpiar bloques de código json
        clean_content = content.replace("```json", "").replace("```", "").strip()
        
        try:
            data = json.loads(clean_content)
            print(f"[DEBUG] JSON parseado correctamente: {data.get('reply', '')[:100]}")

            # Limpiar y formatear la respuesta
            if "reply" in data:
                data["reply"] = clean_gemini_response(data["reply"])
                data["reply"] = format_whatsapp_message(data["reply"])

            # Si hay información para actualizar del lead, hacerlo
            if data.get("update_lead"):
                update_lead_info(phone, **data["update_lead"])
                print(f"[DEBUG] Lead actualizado: {data['update_lead']}")

        except json.JSONDecodeError as je:
            print(f"[DEBUG] Error parseando JSON: {je}. Respuesta: {clean_content[:300]}")
            # Limpiar respuesta fallback
            clean_reply = clean_gemini_response(clean_content)
            clean_reply = format_whatsapp_message(clean_reply)

            data = {
                "reply": clean_reply,
                "suggested_product_id": None,
                "suggested_product_image": None,
                "update_lead": None,
                "action": "none"
            }
            
        return data
        
    except Exception as e:
        print(f"[ERROR] Error Gemini completo: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "reply": "Lo siento, tuve un problema procesando tu solicitud. ¿Podrías repetir?",
            "suggested_product_id": None,
            "suggested_product_image": None,
            "update_lead": None,
            "action": "none"
        }

def send_whatsapp(to_phone: str, message: str, image_url: str = None):
    """Envía mensaje por WhatsApp vía Evolution API"""
    headers = {"apikey": EVOLUTION_APIKEY, "Content-Type": "application/json"}
    
    if image_url:
        url = f"{EVOLUTION_URL}/message/sendMedia/{INSTANCE}"
        payload = {
            "number": to_phone,
            "mediatype": "image",
            "mimetype": "image/jpeg",
            "caption": message,
            "media": image_url
        }
    else:
        url = f"{EVOLUTION_URL}/message/sendText/{INSTANCE}"
        payload = {"number": to_phone, "text": message}
        
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=20)
        return r.status_code, r.text
    except Exception as e:
        return 500, str(e)

# --- ENDPOINTS ---

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Agente de comidas rápidas funcionando con Supabase"}

@app.get("/leads")
def get_leads():
    """Endpoint para obtener todos los leads"""
    if not supabase:
        return {"leads": [], "error": "Supabase no configurado"}
    
    try:
        response = supabase.table('leads').select('*').order('updated_at', desc=True).execute()
        return {"leads": response.data}
    except Exception as e:
        return {"leads": [], "error": str(e)}

@app.get("/productos")
def get_productos_endpoint():
    """Endpoint para obtener el catálogo completo"""
    try:
        productos = get_productos_individuales()
        combos = get_combos_completos()
        return {
            "productos_individuales": productos,
            "combos": combos
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/history/{phone}")
def get_history_endpoint(phone: str, limit: int = 50):
    """Historial completo de mensajes para un número (rehidrata chat en el front)"""
    # Permitir revisar también conversaciones de prueba
    if is_test_phone(phone):
        events = test_conversations.get(phone, {}).get("events", [])
        return {"events": events[:limit], "source": "test"}
    
    if not supabase:
        return {"events": [], "error": "Supabase no configurado"}
    
    events = get_event_log(phone, limit=limit)
    return {"events": events, "source": "supabase"}

@app.get("/test-conversations")
def get_test_conversations():
    """Endpoint para ver conversaciones de prueba activas"""
    return {"test_conversations": list_test_conversations()}

@app.post("/reset-test/{phone}")
def reset_test_conversation_endpoint(phone: str):
    """Endpoint para resetear una conversación de prueba"""
    success = reset_test_conversation(phone)
    return {"success": success, "message": f"Conversación de {phone} reseteada" if success else f"No se encontró conversación para {phone}"}

@app.post("/test-webhook")
async def test_webhook_endpoint(request: Request):
    """Endpoint para pruebas manuales sin WhatsApp"""
    data = await request.json()
    phone = data.get("phone", "test123")
    text = data.get("text", "")

    # Forzar que sea tratado como demo
    test_data = {
        "data": {
            "key": {"remoteJid": f"{phone}@s.whatsapp.net"},
            "message": {"conversation": text}
        },
        "demo": True
    }

    # Llamar al webhook normal
    return await webhook(Request(scope={"type": "http", "method": "POST", "path": "/webhook"}, _receive=lambda: {"type": "http.request", "body": json.dumps(test_data).encode()}))

# https://ai-agents-v0no.onrender.com/webhook 
# Endpoint para utilizar webhook de render y conectarlo a evolution api
@app.post("/webhook")
async def webhook(req: Request):
    """Webhook para recibir mensajes"""
    data = await req.json()

    phone = (
        data.get("data", {}).get("key", {}).get("remoteJid", "")
        .replace("@s.whatsapp.net", "")
        or data.get("number")
        or data.get("from")
        or ""
    )

    text = (
        data.get("data", {}).get("message", {}).get("conversation")
        or data.get("message")
        or data.get("text")
        or ""
    )
    
    # Detectar demo y números de prueba
    is_demo = data.get("demo", False) or "demo" in phone.lower() or phone == "user"
    is_test = is_test_phone(phone)

    if not phone or not text:
        return {"ok": True, "ignored": True}

    # Usar sistema de pruebas si es número de prueba
    if is_test:
        print(f"[TEST] Usando sistema de pruebas para {phone}")
        # Guardar mensaje entrante en sistema de pruebas
        save_test_event(phone, "in", text)
        # Obtener info del lead de pruebas
        lead_info = get_test_lead_info(phone)
        current_state = lead_info.get("status", "collecting_info")

        # Funciones para pruebas
        save_event_func = save_test_event
        get_lead_func = get_test_lead_info
        update_lead_func = update_test_lead_info
        get_history_func = lambda p, l=10: get_test_history(p, l)
    else:
        # Sistema normal de Supabase
        save_event(phone, "in", text)
        # Funciones normales de Supabase
        save_event_func = save_event
        get_lead_func = get_lead_info
        update_lead_func = update_lead_info
        get_history_func = lambda p, l=10: get_history(p, l)
    
    reply_text = ""
    image_url = None
    action = "none"
    ai_response = {}  # Inicializar para evitar UnboundLocalError
    
    # ESTADO 1: Recolectar nombre y teléfono en un solo mensaje
    if current_state == "collecting_info" or (not lead_info["name"] or not lead_info["contact_phone"]):
        # Contar mensajes para saber si es la primera interacción
        # Para pruebas, contar mensajes de la conversación de prueba
        if is_test:
            message_count = len([e for e in test_conversations.get(phone, {}).get("events", []) if e["direction"] == "in"])
        else:
            try:
                if supabase:
                    response = supabase.table('events')\
                        .select('id', count='exact')\
                        .eq('phone', phone)\
                        .eq('direction', 'in')\
                        .execute()
                    message_count = response.count or 0
                else:
                    message_count = 0
            except:
                message_count = 0
        
        if message_count <= 1:
            # Primera interacción → Pedir nombre y teléfono
            state_response = get_state_response("collecting_info", lead_info)
            reply_text = format_whatsapp_message(state_response["reply"])
            update_lead_func(phone, status="collecting_info")
        else:
            # Segunda interacción → Extraer nombre y teléfono del mensaje
            import re

            # Extraer teléfono (buscar secuencia de 7-10 dígitos)
            phone_pattern = r'(\d{7,10})'
            phone_match = re.search(phone_pattern, text)
            contact_phone = phone_match.group(1) if phone_match else None

            # Extraer nombre (todo lo que no sea el teléfono)
            name = text.strip()
            if contact_phone:
                name = name.replace(contact_phone, "").strip()

            # Limpiar el nombre
            name = name.replace("me llamo", "").replace("soy", "").replace("mi nombre es", "")
            name = name.replace("Me llamo", "").replace("Soy", "").replace("Mi nombre es", "")
            name = name.replace("nombre", "").replace("teléfono", "").replace("telefono", "")
            name = name.strip().split()[0] if name.strip() else "Amigo"

            # Validar que tengamos ambos datos
            if contact_phone and len(contact_phone) >= 7 and name:
                update_lead_func(phone, name=name, contact_phone=contact_phone, status="browsing")
                reply_text = format_whatsapp_message(f"¡Perfecto, {name}! Somos distribuidores de carnes crudas de alta calidad. 🥩\n\nTenemos productos individuales por kilo y combos especiales. ¿Qué te gustaría ver?\n\nPuedo mostrarte nuestro catálogo completo o recomendarte algo según tus necesidades.")
            else:
                reply_text = format_whatsapp_message("Por favor, escribe tu nombre y número de teléfono.\n\nEjemplo: Juan 3001234567")
    
    # ESTADO 2: Navegando catálogo / haciendo pedido (USA GEMINI)
    elif current_state == "browsing":
        # Usar Gemini para responder sobre el catálogo
        ai_response = generate_gemini_response(phone, text, get_history_func)
        reply_text = ai_response.get("reply", "")
        image_url = ai_response.get("suggested_product_image")
        action = ai_response.get("action", "none")

        # Si Gemini indica que el pedido está listo (action: ready_for_checkout)
        if action == "ready_for_checkout":
            # Pasar a recolectar información de envío
            update_lead_func(phone, status="collecting_delivery_info")
            state_response = get_state_response("collecting_delivery_info", lead_info)
            reply_text += "\n\n" + format_whatsapp_message(state_response["reply"])
    
    # ESTADO 3: Recolectar información de envío (cédula, ciudad, dirección, correo, tiempo)
    elif current_state == "collecting_delivery_info":
        import re
        
        # Parsear los datos: cédula, ciudad, dirección, correo, tiempo
        parts = [p.strip() for p in text.split(',')]
        
        if len(parts) >= 5:
            cedula = parts[0]
            city = parts[1].lower()
            address = parts[2]
            email = parts[3]
            delivery_time = parts[4]
            
            # Validar que la ciudad sea Bogotá o Cali
            if city not in VALID_CITIES:
                reply_text = format_whatsapp_message(f"Lo siento, actualmente solo hacemos entregas en Bogotá y Cali. No podemos enviar a {parts[1]}. 😔\n\n¿Deseas que te contactemos cuando ampliemos cobertura a tu ciudad?")
                update_lead_func(phone, city=parts[1], status="browsing")
            else:
                # Guardar información
                update_lead_func(
                    phone,
                    cedula=cedula,
                    city=city.capitalize(),
                    address=address,
                    email=email,
                    delivery_time=delivery_time,
                    status="confirming_order"
                )
                
                # Generar resumen del pedido desde el historial
                order_summary = generate_order_summary(phone)
                state_response = get_state_response("confirming_order", lead_info, order_summary=order_summary)
                reply_text = format_whatsapp_message(state_response["reply"])
        else:
            reply_text = "Por favor, envía todos los datos separados por comas:\n\nCédula, Ciudad, Dirección, Correo, Tiempo de entrega\n\nEjemplo:\n1234567890, Bogotá, Calle 123 #45-67, correo@ejemplo.com, mañana"
    
    # ESTADO 4: Confirmar pedido
    elif current_state == "confirming_order":
        text_lower = text.lower()
        
        if "si" in text_lower or "sí" in text_lower or "confirmar" in text_lower or "confirmo" in text_lower:
            # Confirmar pedido y pasar a método de pago
            update_lead_func(phone, status="payment_method")
            state_response = get_state_response("payment_method", lead_info)
            reply_text = format_whatsapp_message(state_response["reply"])
        elif "no" in text_lower or "cancelar" in text_lower:
            # Cancelar y volver al catálogo
            update_lead_func(phone, status="browsing")
            reply_text = format_whatsapp_message("Entendido. ¿Deseas modificar algo del pedido o ver otros productos?")
        else:
            # No entendió
            reply_text = "Por favor responde SÍ para confirmar o NO para cancelar/modificar."
    
    # ESTADO 5: Método de pago
    elif current_state == "payment_method":
        text_lower = text.lower()
        
        # Detectar método de pago por número o palabra clave
        if "1" in text or "bancolombia" in text_lower:
            payment_method = "Bancolombia"
        elif "2" in text or "nequi" in text_lower:
            payment_method = "Nequi"
        elif "3" in text or "daviplata" in text_lower:
            payment_method = "Daviplata"
        elif "4" in text or "bbva" in text_lower:
            payment_method = "BBva"
        elif "5" in text or "contra entrega" in text_lower or "efectivo" in text_lower:
            payment_method = "Contra entrega"
        else:
            # No entendió la opción
            state_response = get_state_response("payment_method", lead_info)
            reply_text = format_whatsapp_message(state_response["reply"])
            payment_method = None
        
        if payment_method:
            if payment_method == "Contra entrega":
                # Contra entrega = pedido confirmado directo
                update_lead_func(phone, payment_method=payment_method, status="payment_completed")
                state_response = get_state_response("payment_completed", lead_info)
                reply_text = format_whatsapp_message(state_response["reply"])
                action = "transfer_agent"
            else:
                # Transferencia/PSE = pedir comprobante
                update_lead_func(phone, payment_method=payment_method, status="waiting_transfer_proof")
                lead_info["payment_method"] = payment_method
                state_response = get_state_response("waiting_transfer_proof", lead_info)
                reply_text = format_whatsapp_message(state_response["reply"])
    
    # ESTADO 6: Esperando comprobante de transferencia
    elif current_state == "waiting_transfer_proof":
        # Aquí detectarías si se envió una imagen (comprobante)
        # Por ahora, cualquier mensaje confirma el pago
        has_image = data.get("data", {}).get("message", {}).get("imageMessage") is not None
        
        # Capturar intención de siguiente pedido en 1-2 semanas
        next_order = extract_next_order_preference(text)
        schedule_ack = ""
        if next_order:
            if next_order["decline"]:
                save_next_order_preference(phone, "rechazado", save_event_func)
                schedule_ack = "Listo, seguimos solo con este pedido. "
            else:
                save_next_order_preference(phone, next_order["preference"], save_event_func)
                schedule_ack = f"Anotado tu siguiente pedido para {next_order['preference']}. "
        
        if has_image or "envié" in text.lower() or "enviado" in text.lower() or "listo" in text.lower():
            update_lead_info(phone, status="payment_completed")
            state_response = get_state_response("payment_completed", lead_info)
            reply_text = format_whatsapp_message(schedule_ack + state_response["reply"])
            action = "transfer_agent"  # Notificar a un agente humano para verificar
        else:
            reply_prompt = "Por favor, envía el comprobante de tu transferencia como imagen para confirmar tu pedido."
            if schedule_ack:
                reply_prompt = schedule_ack + reply_prompt
            reply_text = format_whatsapp_message(reply_prompt)
    
    # ESTADO 7: Pago completado
    elif current_state == "payment_completed":
        reply_text = "Tu pedido ya está confirmado y en proceso de preparación. Si tienes alguna pregunta adicional, por favor escríbenos."
    
    # Fallback: Si no hay reply_text, usar respuesta genérica
    if not reply_text:
        reply_text = "Lo siento, algo salió mal. Por favor, intenta de nuevo o contacta a soporte."
    
    # Guardar respuesta
    metadata = {
        "product_id": ai_response.get("suggested_product_id") if ai_response else None,
        "image": image_url,
        "action": action
    }
    save_event_func(phone, "out", reply_text, metadata)
    
    # Enviar por WhatsApp si no es demo
    if not is_demo and EVOLUTION_APIKEY:
        send_whatsapp(phone, reply_text, image_url)
    
    return {
        "reply": reply_text,
        "image": image_url,
        "action": action
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

