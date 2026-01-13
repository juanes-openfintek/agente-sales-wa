"""
Funciones de validación mejoradas para datos del cliente.
"""
import re
from typing import Final

from app.config import VALID_CITIES


# ============================================================
# PATRONES REGEX
# ============================================================

# Email: más estricto que el anterior
# - Mínimo 2 caracteres antes del @
# - Dominio válido con al menos 2 caracteres
# - TLD de 2-10 caracteres (.co, .com, .travel, etc.)
EMAIL_PATTERN: Final[re.Pattern] = re.compile(
    r"^[a-zA-Z0-9._%+-]{2,}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$"
)

# Patrón para extraer email de texto libre (más permisivo para búsqueda)
EMAIL_SEARCH_PATTERN: Final[re.Pattern] = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}"
)

# Cédula colombiana: 6-15 dígitos
CEDULA_PATTERN: Final[re.Pattern] = re.compile(r"^\d{6,15}$")

# Patrón de dirección con números (#, -)
ADDRESS_NUMBER_PATTERN: Final[re.Pattern] = re.compile(
    r"\d{1,4}\s*(?:#|-)\s*\d{1,4}(?:\s*[-]\s*\d{1,4})?"
)

# Keywords de dirección colombiana
ADDRESS_KEYWORDS: Final[tuple[str, ...]] = (
    "calle", "cll", "cl",
    "carrera", "cra", "cr", "kr",
    "avenida", "av", "avda",
    "transversal", "trans", "tv",
    "diagonal", "diag", "dg",
    "manzana", "mz",
    "barrio", "br",
    "conjunto", "conj",
    "edificio", "ed",
    "torre", "tr",
    "apartamento", "apto", "apt",
    "casa",
    "local", "loc",
    "oficina", "of",
    "piso",
    "bloque", "blq",
    "#",
)

# Frases comunes a remover del nombre
NAME_PHRASES_TO_REMOVE: Final[tuple[str, ...]] = (
    "me llamo",
    "mi nombre es",
    "mi nombre completo es",
    "soy",
    "yo soy",
    "hola soy",
    "hola me llamo",
    "buenos dias",
    "buenos días",
    "buenas tardes",
    "buenas noches",
    "buen dia",
    "buen día",
    "hola",
)

# Palabras/frases que indican intención de pedido (NO es un nombre)
ORDER_INTENT_KEYWORDS: Final[tuple[str, ...]] = (
    "quiero",
    "quisiera",
    "me gustaria",
    "me gustaría",
    "necesito",
    "pedido",
    "pedir",
    "ordenar",
    "orden",
    "comprar",
    "compra",
    "catalogo",
    "catálogo",
    "menu",
    "menú",
    "productos",
    "combos",
    "combo",
    "carne",
    "carnes",
    "kilo",
    "kilos",
    "kg",
    "precio",
    "precios",
    "cuanto",
    "cuánto",
    "cuesta",
    "vale",
    "tienen",
    "hay",
    "venden",
    "ofrecen",
)

# TLDs comunes mal escritos (typos)
COMMON_TLD_TYPOS: Final[dict[str, str]] = {
    "con": "com",
    "cmo": "com",
    "cpm": "com",
    "vom": "com",
    "ocm": "com",
    "comm": "com",
    "cm": "com",
    "co": None,  # .co es válido (Colombia)
    "gmal": "gmail",
    "gmial": "gmail",
    "gmai": "gmail",
    "hotmal": "hotmail",
    "hotmai": "hotmail",
    "outloo": "outlook",
}


# ============================================================
# FUNCIONES DE VALIDACIÓN
# ============================================================

def validate_email(email: str) -> tuple[bool, str | None]:
    """
    Valida email con verificación de dominio apropiada.

    Returns:
        tuple[bool, str | None]: (es_válido, mensaje_error)
    """
    if not email:
        return False, "El correo electrónico está vacío"

    email = email.strip().lower()

    # Verificar formato básico
    if "@" not in email:
        return False, "El correo debe contener @. Ejemplo: correo@ejemplo.com"

    if email.count("@") > 1:
        return False, "El correo solo puede tener un @"

    # Validar con regex
    if not EMAIL_PATTERN.match(email):
        # Dar feedback específico
        local, domain = email.split("@") if "@" in email else (email, "")

        if len(local) < 2:
            return False, "El correo necesita al menos 2 caracteres antes del @"

        if not domain or "." not in domain:
            return False, "El dominio del correo no es válido. Ejemplo: gmail.com"

        return False, "Formato de correo inválido. Ejemplo: nombre@gmail.com"

    # Verificar typos comunes en TLD
    domain = email.split("@")[1]
    tld = domain.split(".")[-1]
    domain_name = domain.split(".")[0] if "." in domain else domain

    if tld in COMMON_TLD_TYPOS and COMMON_TLD_TYPOS[tld] is not None:
        suggested = COMMON_TLD_TYPOS[tld]
        return False, f"¿Quisiste decir .{suggested} en lugar de .{tld}?"

    # Verificar typos en dominios comunes
    for typo, correct in COMMON_TLD_TYPOS.items():
        if domain_name == typo and correct:
            return False, f"¿Quisiste decir {correct} en lugar de {typo}?"

    return True, None


def validate_name(name: str) -> tuple[bool, str | None]:
    """
    Valida y limpia el nombre del cliente.

    Returns:
        tuple[bool, str | None]: (es_válido, nombre_limpio_o_error)
        Si es válido, el segundo valor es el nombre limpio.
        Si no es válido, el segundo valor es el mensaje de error.
    """
    if not name:
        return False, "Por favor escribe tu nombre"

    # Limpiar frases comunes
    clean_name = name.lower().strip()

    for phrase in NAME_PHRASES_TO_REMOVE:
        clean_name = clean_name.replace(phrase, "")

    # Remover dígitos
    clean_name = re.sub(r"\d+", "", clean_name)

    # Remover puntuación excesiva
    clean_name = re.sub(r"[.,!?;:]+", "", clean_name)

    # Limpiar espacios múltiples
    clean_name = re.sub(r"\s+", " ", clean_name).strip()

    # Validaciones
    if len(clean_name) < 2:
        return False, "El nombre debe tener al menos 2 letras"

    if len(clean_name) > 50:
        return False, "El nombre es muy largo, usa solo tu nombre y apellido"

    # Verificar que solo contenga caracteres válidos (letras, espacios, acentos)
    if not re.match(r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$", clean_name):
        return False, "El nombre solo puede contener letras"

    # Capitalizar cada palabra
    clean_name = clean_name.title()

    return True, clean_name


def validate_address(address: str) -> tuple[bool, str | None]:
    """
    Valida formato de dirección colombiana.

    Returns:
        tuple[bool, str | None]: (es_válido, mensaje_error)
    """
    if not address:
        return False, "La dirección está vacía"

    address = address.strip()
    lower = address.lower()

    # Verificar longitud mínima
    if len(address) < 10:
        return False, "La dirección parece muy corta. Incluye tipo de vía y número"

    if len(address) > 200:
        return False, "La dirección es muy larga"

    # Debe tener al menos un keyword de dirección
    has_keyword = any(k in lower for k in ADDRESS_KEYWORDS)

    # O debe tener patrón de número con # o -
    has_number_pattern = bool(ADDRESS_NUMBER_PATTERN.search(address))

    if not has_keyword and not has_number_pattern:
        return False, (
            "No parece una dirección válida. "
            "Incluye tipo de vía (Calle, Carrera, etc.) y número. "
            "Ejemplo: Calle 123 # 45-67"
        )

    # Verificar que no sea solo un saludo o palabra común
    greeting_words = ["hola", "buenos", "buenas", "gracias", "si", "sí", "no", "ok", "vale"]
    first_word = lower.split()[0] if lower.split() else ""
    if first_word in greeting_words and not has_number_pattern:
        return False, "Por favor envía tu dirección completa. Ejemplo: Calle 123 # 45-67"

    return True, None


def validate_cedula(cedula: str) -> tuple[bool, str | None]:
    """
    Valida cédula colombiana.

    Returns:
        tuple[bool, str | None]: (es_válido, mensaje_error)
    """
    if not cedula:
        return False, "La cédula está vacía"

    # Remover espacios, puntos y guiones
    clean_cedula = cedula.replace(" ", "").replace(".", "").replace("-", "")

    # Validar que solo contenga dígitos
    if not clean_cedula.isdigit():
        return False, "La cédula solo puede contener números"

    # Validar longitud
    if len(clean_cedula) < 6:
        return False, "La cédula debe tener al menos 6 dígitos"

    if len(clean_cedula) > 15:
        return False, "La cédula no puede tener más de 15 dígitos"

    return True, None


def validate_city(city: str) -> tuple[bool, str | None]:
    """
    Valida que la ciudad esté en la lista de ciudades válidas.

    Returns:
        tuple[bool, str | None]: (es_válido, mensaje_error)
    """
    if not city:
        return False, "La ciudad está vacía"

    city_lower = city.lower().strip()

    if city_lower not in VALID_CITIES:
        return False, f"Solo hacemos entregas en Bogotá y Cali, no en {city}"

    return True, None


# ============================================================
# FUNCIONES DE EXTRACCIÓN
# ============================================================

def extract_email_from_text(text: str) -> str | None:
    """
    Extrae email de texto libre y lo valida.

    Returns:
        str | None: Email válido o None si no se encontró
    """
    if not text:
        return None

    match = EMAIL_SEARCH_PATTERN.search(text)
    if not match:
        return None

    email = match.group(0).strip().lower()

    # Validar el email extraído
    is_valid, _ = validate_email(email)
    return email if is_valid else None


def extract_cedula_from_text(text: str) -> str | None:
    """
    Extrae cédula de texto libre.

    Returns:
        str | None: Cédula válida o None si no se encontró
    """
    if not text:
        return None

    # Remover separadores comunes
    clean_text = text.replace(".", "").replace("-", "").replace(" ", "")

    # Buscar secuencia de 6-15 dígitos
    match = re.search(r"\d{6,15}", clean_text)
    if not match:
        return None

    cedula = match.group(0)

    # Validar
    is_valid, _ = validate_cedula(cedula)
    return cedula if is_valid else None


def extract_city_from_text(text: str) -> str | None:
    """
    Extrae ciudad válida del texto.

    Returns:
        str | None: Ciudad válida capitalizada o None
    """
    if not text:
        return None

    text_lower = text.lower()

    for city in VALID_CITIES:
        if city in text_lower:
            # Retornar con formato apropiado
            if city in ["bogota", "bogotá"]:
                return "Bogotá"
            elif city == "cali":
                return "Cali"

    return None


def looks_like_address(token: str) -> bool:
    """
    Heurística para detectar si un token parece una dirección.
    Versión mejorada que evita falsos positivos con saludos.

    Returns:
        bool: True si parece una dirección
    """
    if not token or len(token) < 6:
        return False

    lower = token.lower().strip()

    # Rechazar saludos y palabras comunes
    reject_words = [
        "hola", "buenos", "buenas", "gracias", "si", "sí", "no",
        "ok", "vale", "listo", "perfecto", "genial"
    ]
    if lower in reject_words or lower.split()[0] in reject_words:
        # Solo rechazar si no tiene patrones de dirección
        if not ADDRESS_NUMBER_PATTERN.search(token):
            return False

    # Verificar keywords de dirección
    if any(k in lower for k in ADDRESS_KEYWORDS):
        return True

    # Verificar patrón numérico típico de direcciones
    if ADDRESS_NUMBER_PATTERN.search(token):
        return True

    return False


def is_order_intent(text: str) -> bool:
    """
    Detecta si el texto es una intención de pedido en lugar de un nombre.

    Returns:
        bool: True si parece una intención de pedido
    """
    if not text:
        return False

    lower = text.lower().strip()

    # Verificar si contiene palabras de intención de pedido
    for keyword in ORDER_INTENT_KEYWORDS:
        if keyword in lower:
            return True

    return False


def is_new_order_request(text: str) -> bool:
    """
    Detecta si el texto es una solicitud de nuevo pedido.

    Returns:
        bool: True si quiere hacer un nuevo pedido
    """
    if not text:
        return False

    lower = text.lower().strip()

    new_order_phrases = [
        "nuevo pedido",
        "otro pedido",
        "quiero pedir",
        "quiero comprar",
        "quiero ordenar",
        "comprar mas",
        "comprar más",
        "pedir mas",
        "pedir más",
        "hacer otro",
        "hacer un pedido",
        "volver a pedir",
        "volver a comprar",
        "vendeme",
        "véndeme",
    ]

    for phrase in new_order_phrases:
        if phrase in lower:
            return True

    return False


def is_modification_request(text: str) -> bool:
    """
    Detecta si el texto es una solicitud de modificación del pedido.

    Returns:
        bool: True si quiere modificar el pedido
    """
    if not text:
        return False

    lower = text.lower().strip()

    modification_phrases = [
        # Cambiar/modificar
        "cambiar",
        "modificar",
        "editar",
        "corregir",
        # Agregar
        "agregar",
        "añadir",
        "adicionar",
        "incluir",
        "sumar",
        "poner",
        "meter",
        # Quitar
        "quitar",
        "eliminar",
        "remover",
        "sacar",
        "borrar",
        "sin",
        # Cambiar cantidad
        "mas",
        "más",
        "menos",
        "otro",
        "otra",
        "otros",
        "otras",
        # Intenciones de cambio
        "en vez de",
        "en lugar de",
        "mejor",
        "prefiero",
        "quisiera",
        "quiero otro",
        "quiero otra",
        "no ese",
        "no eso",
        "ese no",
        "eso no",
    ]

    for phrase in modification_phrases:
        if phrase in lower:
            return True

    return False


def extract_notify_preference(text: str) -> str | None:
    """
    Extrae la preferencia de tiempo para el próximo pedido/aviso.

    Returns:
        str | None: Preferencia de tiempo o None si no se encontró
    """
    if not text:
        return None

    lower = text.lower().strip()

    # Patrones de tiempo específicos
    time_patterns = [
        # Días específicos
        (r"\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b", None),
        # Semanas
        (r"\b(\d+)\s*semanas?\b", lambda m: f"{m.group(1)} semana(s)"),
        (r"\buna semana\b", "1 semana"),
        (r"\bdos semanas\b", "2 semanas"),
        (r"\btres semanas\b", "3 semanas"),
        (r"\bpr[oó]xima semana\b", "próxima semana"),
        # Meses
        (r"\b(\d+)\s*mes(?:es)?\b", lambda m: f"{m.group(1)} mes(es)"),
        (r"\bun mes\b", "1 mes"),
        (r"\bdos meses\b", "2 meses"),
        # Días
        (r"\b(\d+)\s*d[ií]as?\b", lambda m: f"{m.group(1)} día(s)"),
        (r"\bma[nñ]ana\b", "mañana"),
        (r"\bpasado ma[nñ]ana\b", "pasado mañana"),
        # Quincenas
        (r"\bquincena\b", "15 días"),
        (r"\bquincenal\b", "cada 15 días"),
        # Fechas
        (r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b", None),
        # Expresiones generales
        (r"\bfin de mes\b", "fin de mes"),
        (r"\bfin de semana\b", "fin de semana"),
        (r"\bprincipios de mes\b", "principios de mes"),
    ]

    import re
    for pattern, replacement in time_patterns:
        match = re.search(pattern, lower)
        if match:
            if replacement is None:
                return match.group(0).capitalize()
            elif callable(replacement):
                return replacement(match)
            else:
                return replacement

    # Si no encontró patrones específicos pero menciona tiempo
    general_time_words = ["pronto", "después", "luego", "cuando pueda", "ya te aviso", "te confirmo"]
    for word in general_time_words:
        if word in lower:
            return word.capitalize()

    return None
