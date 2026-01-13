import json
import re
from typing import Any, Dict, List

from app.config import model
from app.services.catalog import get_catalogo_completo
from app.services.lead import get_history as get_history_default
from app.services.lead import get_lead_info


def extract_name_with_ai(user_text: str) -> str | None:
    """
    Usa Gemini para extraer el nombre de una respuesta del usuario.
    Es más robusto que algoritmos basados en reglas.
    
    Args:
        user_text: El texto que el usuario envió cuando se le preguntó su nombre
        
    Returns:
        str | None: El nombre extraído o None si no se pudo identificar
    """
    if not model:
        return None
    
    if not user_text or len(user_text.strip()) < 2:
        return None
    
    prompt = f"""Eres un asistente que extrae nombres de personas de mensajes de texto.

El usuario respondió a la pregunta "¿Cuál es tu nombre?" con el siguiente mensaje:
"{user_text}"

Tu tarea es extraer SOLO el nombre de la persona. 

REGLAS:
1. Extrae SOLO el nombre propio (puede incluir apellido si lo mencionó)
2. Ignora saludos, comentarios adicionales, quejas, o cualquier texto que no sea el nombre
3. Si el mensaje contiene frases como "me llamo X", "soy X", "mi nombre es X", extrae solo X
4. Si no puedes identificar un nombre válido, responde exactamente: NO_NAME
5. Un nombre válido tiene entre 2 y 50 caracteres y solo contiene letras y espacios
6. NO incluyas puntuación, números, ni palabras que no sean parte del nombre

Ejemplos:
- "Hola me llamo Juan" → Juan
- "Si, mi nombre es Pedro pero no se para que lo necesitas" → Pedro
- "Maria Garcia" → Maria Garcia
- "soy carlos y quiero pedir" → Carlos
- "Buenos dias soy la señora Martha" → Martha
- "Quiero ver el menú" → NO_NAME
- "123456" → NO_NAME
- "hola" → NO_NAME
- "Si claro, me llamo Ana María Pérez" → Ana María Pérez
- "Jajaja ok soy Roberto" → Roberto

Responde SOLO con el nombre extraído (capitalizado correctamente) o NO_NAME. Sin explicaciones adicionales."""

    try:
        response = model.generate_content(prompt)
        result = response.text.strip()
        
        print(f"[AI NAME] Input: '{user_text}' → Output: '{result}'")
        
        # Verificar si no se encontró nombre
        if result == "NO_NAME" or result.upper() == "NO_NAME":
            return None
        
        # Limpiar el resultado
        # Remover posibles comillas o caracteres extra
        result = result.strip('"\'').strip()
        
        # Validar que el resultado sea un nombre válido
        if len(result) < 2 or len(result) > 50:
            return None
        
        # Verificar que solo contenga caracteres válidos para un nombre
        if not re.match(r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$", result):
            return None
        
        # Capitalizar correctamente
        result = result.title()
        
        return result
        
    except Exception as e:
        print(f"[AI NAME ERROR] Error extrayendo nombre: {e}")
        return None


def format_whatsapp_message(text: str) -> str:
    """Formatea texto para WhatsApp con el formato correcto."""
    text = text.replace("━━━━━━━━━━━━━━━━━━━━━", "━━━━━━━━━━━━━━━━━━━━━")
    text = text.replace("✅", "✅").replace("❌", "❌").replace("📦", "📦")
    text = text.replace("💰", "💰").replace("💳", "💳").replace("💵", "💵")
    return text.strip()


def clean_gemini_response(text: str) -> str:
    """Limpia la respuesta de Gemini para formato WhatsApp."""
    text = re.sub(r"\*\*(.*?)\*\*", r"*\1*", text)
    text = re.sub(r"__(.*?)__", r"_\1_", text)
    text = re.sub(r"~~(.*?)~~", r"~\1~", text)
    text = re.sub(r"\*{3,}", "*", text)
    text = re.sub(r"\$(\d+)", lambda m: f"${int(m.group(1)):,}", text)
    return text


def generate_gemini_response(phone: str, user_text: str, get_history_func=None) -> Dict[str, Any]:
    """Genera respuesta usando Gemini con contexto del catálogo."""
    if not model:
        return {
            "reply": "Error: Gemini no está configurado",
            "suggested_product_id": None,
            "suggested_product_image": None,
            "update_lead": None,
            "action": "none",
        }

    catalogo = get_catalogo_completo()
    history = get_history_func(phone) if get_history_func else get_history_default(phone)
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

        clean_content = content.replace("```json", "").replace("```", "").strip()

        try:
            data = json.loads(clean_content)
            print(f"[DEBUG] JSON parseado correctamente: {data.get('reply', '')[:100]}")

            if "reply" in data:
                data["reply"] = clean_gemini_response(data["reply"])
                data["reply"] = format_whatsapp_message(data["reply"])

            if data.get("update_lead"):
                from app.services.lead import update_lead_info

                update_lead_info(phone, **data["update_lead"])
                print(f"[DEBUG] Lead actualizado: {data['update_lead']}")

        except json.JSONDecodeError as je:
            print(f"[DEBUG] Error parseando JSON: {je}. Respuesta: {clean_content[:300]}")
            clean_reply = clean_gemini_response(clean_content)
            clean_reply = format_whatsapp_message(clean_reply)

            data = {
                "reply": clean_reply,
                "suggested_product_id": None,
                "suggested_product_image": None,
                "update_lead": None,
                "action": "none",
            }

        return data

    except Exception as e:  # pragma: no cover - log de conexión
        print(f"[ERROR] Error Gemini completo: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "reply": "Lo siento, tuve un problema procesando tu solicitud. ¿Podrías repetir?",
            "suggested_product_id": None,
            "suggested_product_image": None,
            "update_lead": None,
            "action": "none",
        }
