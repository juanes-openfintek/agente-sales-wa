import os
import time
import json
import requests
import google.generativeai as genai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar variables de entorno desde el archivo .env en el directorio actual o padre
load_dotenv()
if not os.getenv("GEMINI_API_KEY"):
    load_dotenv("../.env")

# Configuración
EVOLUTION_URL = os.getenv("EVOLUTION_URL", "http://localhost:8080")
EVOLUTION_APIKEY = os.getenv("EVOLUTION_APIKEY", "7244e89f60cd1764389532d2634bf963")
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
    # Usar Gemini 2.0 Flash Experimental (más reciente y rápido disponible públicamente)
    # Nota: Gemini 3 requiere acceso especial y podría tener un nombre de modelo diferente
    # Si tienes acceso a Gemini 3, cámbialo manualmente a: 'models/gemini-3-flash' o similar
    model = genai.GenerativeModel('gemini-2.0-flash-exp')
    print("[OK] Gemini 2.0 Flash Experimental configurado")
else:
    print("WARNING: GEMINI_API_KEY not found in env vars")
    model = None

app = FastAPI()

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- BASE DE DATOS ---

def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row  # Para acceder por nombre de columna
    
    # Tabla de LEADS (Clientes)
    con.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        phone TEXT PRIMARY KEY,
        name TEXT,
        contact_phone TEXT,
        email TEXT,
        address TEXT,
        age INTEGER,
        status TEXT, -- new, collecting_info, browsing, checkout, won
        payment_info TEXT, -- Dummy JSON
        last_message TEXT,
        updated_at INTEGER
    )""")
    
    # Tabla de EVENTOS (Historial de chat)
    con.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT,
        direction TEXT, -- in / out
        text TEXT,
        ts INTEGER
    )""")
    
    # Tabla de PRODUCTOS
    con.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        category TEXT,
        price INTEGER,
        discount_percent INTEGER DEFAULT 0,
        image_url TEXT
    )""")
    
    con.commit()
    return con

# --- SEED DE PRODUCTOS ---
def seed_products():
    con = db()
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM products")
    if cur.fetchone()[0] == 0:
        products = [
            ("iPhone 15 Pro", "Titanio, Chip A17 Pro. El iPhone más ligero y potente.", "Smartphones", 4500000, 15, "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch-naturaltitanium?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692845785128"),
            ("Samsung Galaxy S24 Ultra", "AI integrada, Cámara de 200MP, S Pen.", "Smartphones", 5200000, 10, "https://images.samsung.com/is/image/samsung/p6pim/co/sm-s928bzkulpt/gallery/co-galaxy-s24-s928-sm-s928bzkulpt-539299440?$650_519_PNG$"),
            ("MacBook Air M3", "Superligera. M3 superpotente. Hasta 18 horas de batería.", "Laptops", 5800000, 20, "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-202402?wid=904&hei=840&fmt=jpeg&qlt=90&.v=1709056281033"),
            ("Sony WH-1000XM5", "Cancelación de ruido líder en la industria.", "Audio", 1400000, 25, "https://www.sony.com.co/image/6145c1d32e6ac8e63a46c912dc33c5bb?fmt=pjpeg&wid=330&bgcolor=FFFFFF&bgc=FFFFFF"),
            ("iPad Air 5", "Potencia M1. Pantalla Liquid Retina de 10.9 pulgadas.", "Tablets", 2800000, 0, "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-select-wifi-blue-202203?wid=940&hei=1112&fmt=png-alpha&.v=1645065732688")
        ]
        cur.executemany("INSERT INTO products (name, description, category, price, discount_percent, image_url) VALUES (?, ?, ?, ?, ?, ?)", products)
        con.commit()
        print("Productos iniciales cargados con descuentos.")
    con.close()

seed_products()

# --- LOGICA DEL AGENTE ---

def get_product_catalog():
    con = db()
    cur = con.cursor()
    cur.execute("SELECT * FROM products")
    rows = cur.fetchall()
    con.close()
    catalog = []
    for r in rows:
        price = r["price"]
        discount = r["discount_percent"]
        final_price = price - (price * discount // 100) if discount > 0 else price
        catalog.append({
            "id": r["id"],
            "name": r["name"],
            "desc": r["description"],
            "category": r["category"],
            "price": price,
            "discount": discount,
            "final_price": final_price,
            "img": r["image_url"]
        })
    return json.dumps(catalog, ensure_ascii=False)

def get_history(phone, limit=10):
    con = db()
    cur = con.cursor()
    cur.execute("SELECT direction, text FROM events WHERE phone = ? ORDER BY id DESC LIMIT ?", (phone, limit))
    rows = cur.fetchall()
    con.close()
    history = []
    for r in rows[::-1]: # Invertir para orden cronológico
        role = "user" if r["direction"] == "in" else "model"
        history.append({"role": role, "parts": [r["text"]]})
    return history

def get_lead_info(phone):
    """Obtiene información del lead"""
    con = db()
    cur = con.cursor()
    cur.execute("SELECT * FROM leads WHERE phone = ?", (phone,))
    lead = cur.fetchone()
    con.close()
    if lead:
        return {
            "name": lead["name"],
            "contact_phone": lead["contact_phone"],
            "email": lead["email"],
            "address": lead["address"],
            "age": lead["age"],
            "status": lead["status"]
        }
    return {"name": None, "contact_phone": None, "email": None, "address": None, "age": None, "status": "new"}

def update_lead_info(phone, **kwargs):
    """Actualiza información del lead"""
    con = db()
    cur = con.cursor()
    
    # Crear lead si no existe
    cur.execute("INSERT OR IGNORE INTO leads (phone, status, updated_at) VALUES (?, 'new', ?)", 
                (phone, int(time.time())))
    
    # Actualizar campos proporcionados
    fields = []
    values = []
    for key, value in kwargs.items():
        if value is not None:
            fields.append(f"{key} = ?")
            values.append(value)
    
    if fields:
        values.append(int(time.time()))
        values.append(phone)
        query = f"UPDATE leads SET {', '.join(fields)}, updated_at = ? WHERE phone = ?"
        cur.execute(query, values)
    
    con.commit()
    con.close()

def generate_gemini_response(phone, user_text):
    if not model:
        return "Error: Gemini API key no configurada.", None

    catalog = get_product_catalog()
    history = get_history(phone)
    lead_info = get_lead_info(phone)
    
    # Determinar qué información falta
    missing_info = []
    if not lead_info["name"]:
        missing_info.append("nombre")
    
    system_instruction = f"""
    Eres un asistente de ventas experto de una tienda de tecnología premium. Tu objetivo es ayudar al usuario a encontrar el producto ideal y cerrar la venta.
    
    INFORMACIÓN DEL CLIENTE:
    - Nombre: {lead_info["name"]}
    - Teléfono: {lead_info["contact_phone"] or "No proporcionado"}
    - Email: {lead_info["email"] or "No proporcionado"}
    - Dirección: {lead_info["address"] or "No proporcionada"}
    - Edad: {lead_info["age"] or "No proporcionada"}
    - Estado: {lead_info["status"]}
    
    CATÁLOGO DE PRODUCTOS (con PROMOCIONES):
    {catalog}
    
    FLUJO DE VENTAS (IMPORTANTE):
    
    1. **EXPLORACIÓN DE PRODUCTOS**:
       - SIEMPRE usa el nombre del cliente ({lead_info["name"]}) en tus respuestas de forma natural
       - Si pregunta por un producto general, haz preguntas específicas (presupuesto, uso, preferencias)
       - Al recomendar productos, DESTACA LOS DESCUENTOS si los tienen (ej: "¡El MacBook Air M3 tiene 20% de descuento!")
       - SIEMPRE incluye el ID y la imagen del producto recomendado
       - Calcula y muestra el precio final con descuento (precio - descuento)
    
    2. **PROCESO DE COMPRA** (cuando el usuario quiera comprar):
       - Confirma el producto y el precio final con descuento
       - Pide información faltante EN ESTE ORDEN (de a uno, NO pidas todo junto):
         a) Teléfono de contacto (si no lo tiene) → guarda en "contact_phone"
         b) Email (si no lo tiene)
         c) Dirección de envío (si no la tiene)
         d) Número de tarjeta (usa datos dummy, es una demo) → guarda en "payment_info"
       - Usa "update_lead" para guardar cada dato: {{"contact_phone": "...", "email": "...", "address": "...", "payment_info": "..."}}
       - Cuando tengas TODOS los datos (teléfono, email, dirección, tarjeta), cambia status a "won" y usa action: "transfer_agent"
    
    FORMATO DE RESPUESTA JSON (ESTRICTO):
    {{
        "reply": "Tu respuesta al usuario...",
        "suggested_product_id": 123 (o null),
        "suggested_product_image": "URL" (o null),
        "update_lead": {{"name": "Juan", "email": "..."}} (o null si no hay datos nuevos),
        "action": "none" | "transfer_agent"
    }}
    
    REGLAS IMPORTANTES:
    - Sé conversacional y amigable
    - Menciona SIEMPRE los descuentos disponibles
    - NO inventes productos fuera del catálogo
    - Recolecta información DE A UNO, no todo junto
    - Usa "update_lead" cada vez que el usuario te dé información personal
    """
    
    # Gemini Pro no soporta 'system_instruction' en el constructor history directamente en todas las versiones, 
    # así que lo inyectamos como el primer mensaje del historial o usamos la API de chat.
    
    chat = model.start_chat(history=history)
    
    try:
        response = chat.send_message(f"System: {system_instruction}\nUser: {user_text}")
        content = response.text
        
        print(f"[DEBUG] Respuesta de Gemini: {content[:200]}...")  # Primeros 200 chars
        
        # Limpiar bloques de código json si el modelo los pone
        clean_content = content.replace("```json", "").replace("```", "").strip()
        
        try:
            data = json.loads(clean_content)
            print(f"[DEBUG] JSON parseado correctamente: {data.get('reply', '')[:100]}")
            
            # Si hay información para actualizar del lead, hacerlo
            if data.get("update_lead"):
                update_lead_info(phone, **data["update_lead"])
                print(f"[DEBUG] Lead actualizado: {data['update_lead']}")
                
        except json.JSONDecodeError as je:
            print(f"[DEBUG] Error parseando JSON: {je}. Respuesta: {clean_content[:300]}")
            # Fallback si el modelo no devuelve JSON puro
            data = {
                "reply": clean_content,
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
            "action": "none"
        }

def send_whatsapp(to_phone: str, message: str, image_url: str = None):
    headers = {"apikey": EVOLUTION_APIKEY, "Content-Type": "application/json"}
    
    if image_url:
        # Enviar imagen con caption
        url = f"{EVOLUTION_URL}/message/sendMedia/{INSTANCE}"
        payload = {
            "number": to_phone,
            "mediatype": "image",
            "mimetype": "image/jpeg",
            "caption": message,
            "media": image_url
        }
    else:
        # Enviar solo texto
        url = f"{EVOLUTION_URL}/message/sendText/{INSTANCE}"
        payload = {"number": to_phone, "text": message}
        
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=20)
        return r.status_code, r.text
    except Exception as e:
        return 500, str(e)

# --- WEBHOOK ---

@app.post("/webhook")
async def webhook(req: Request):
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
    
    # Detectar demo
    is_demo = data.get("demo", False) or "demo" in phone.lower() or phone == "user"

    if not phone or not text:
        return {"ok": True, "ignored": True}

    # Guardar mensaje entrante
    con = db()
    con.execute("INSERT INTO events(phone, direction, text, ts) VALUES(?,?,?,?)",
                (phone, "in", text, int(time.time())))
    con.commit()
    con.close()

    # --- FLUJO DE RECOLECCIÓN DE NOMBRE (SIN GEMINI) ---
    lead_info = get_lead_info(phone)
    
    # Si no tiene nombre, manejar sin Gemini
    if not lead_info["name"]:
        # Contar mensajes del usuario para detectar si es la primera interacción
        con = db()
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM events WHERE phone = ? AND direction = 'in'", (phone,))
        message_count = cur.fetchone()[0]
        con.close()
        
        if message_count == 1:
            # Primera vez que escribe → Preguntar nombre
            reply_text = "¡Hola! Bienvenido a nuestra tienda. ¿Cuál es tu nombre?"
            image_url = None
        else:
            # Segunda interacción → Extraer y guardar nombre
            # Intentar extraer el nombre del mensaje
            name = text.strip()
            # Limpiar frases como "me llamo", "soy", "mi nombre es"
            name = name.replace("me llamo", "").replace("soy", "").replace("mi nombre es", "")
            name = name.replace("Me llamo", "").replace("Soy", "").replace("Mi nombre es", "")
            name = name.strip().split()[0] if name.strip() else "Amigo"  # Tomar solo el primer nombre
            
            # Guardar nombre
            update_lead_info(phone, name=name, status="browsing")
            
            reply_text = f"¡Encantado de conocerte, {name}! Somos una tienda de tecnología premium con productos increíbles. ¿Qué tipo de producto te interesa? Tenemos smartphones, laptops, tablets y más."
            image_url = None
        
        # Guardar respuesta del agente
        con = db()
        con.execute("INSERT INTO events(phone, direction, text, ts) VALUES(?,?,?,?)",
                    (phone, "out", reply_text, int(time.time())))
        con.commit()
        con.close()
        
        # No enviar por WhatsApp si es demo
        if not is_demo:
            send_whatsapp(phone, reply_text, image_url)
        
        return {"reply": reply_text, "image": image_url, "action": "none"}
    
    # --- CEREBRO GEMINI (si ya tiene nombre) ---
    ai_response = generate_gemini_response(phone, text)
    
    reply_text = ai_response.get("reply", "")
    image_url = ai_response.get("suggested_product_image")
    action = ai_response.get("action")

    # Guardar respuesta saliente
    con = db()
    con.execute("INSERT INTO events(phone, direction, text, ts) VALUES(?,?,?,?)",
                (phone, "out", reply_text, int(time.time())))
    con.commit()
    con.close()

    # Enviar a WhatsApp (si no es demo)
    sc = 0
    if not is_demo:
        sc, _ = send_whatsapp(phone, reply_text, image_url)

    return {
        "ok": True,
        "phone": phone,
        "reply": reply_text,
        "image": image_url,
        "action": action,
        "send_status_code": sc
    }

@app.get("/leads")
def leads():
    con = db()
    cur = con.cursor()
    cur.execute("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 50")
    rows = cur.fetchall()
    con.close()
    return {"leads": [dict(r) for r in rows]}

@app.get("/products")
def products():
    con = db()
    cur = con.cursor()
    cur.execute("SELECT * FROM products")
    rows = cur.fetchall()
    con.close()
    return {"products": [dict(r) for r in rows]}
