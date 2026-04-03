"""PDF parser – extracts property data from exposés using regex on raw text."""
import io
import re

PDFPLUMBER_AVAILABLE = False

# Words that indicate navigation/header text, not property data
_SKIP_WORDS = [
    "inserieren", "makler", "eigentümer:innen", "eigentümer", "suchende",
    "anmelden", "registrieren", "newsletter", "immoscout", "immonet",
    "immowelt", "login", "merken", "kontakt", "anfrage", "weitere",
    "www.", "http", "tel:", "fax:", "@", "datenschutz", "impressum",
    "cookie", "agb", "nutzungsbedingungen", "provisionsfrei", "ab 0 €",
    "gold partner", "identität", "verifiziert", "jetzt", "hier gefunden",
]


def _try_import_pdfplumber():
    global PDFPLUMBER_AVAILABLE
    try:
        import pdfplumber  # noqa: F401
        PDFPLUMBER_AVAILABLE = True
        return pdfplumber
    except Exception:
        return None


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from PDF using pdfplumber if available."""
    plumber = _try_import_pdfplumber()
    if not plumber:
        return ""
    try:
        text_parts = []
        with plumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts)
    except Exception:
        return ""


def _parse_german_number(s: str) -> float:
    """Convert German number format '1.234.567,89' or '1.234.567' to float."""
    s = s.strip()
    # German format: dots as thousand separators, comma as decimal
    if ',' in s:
        # Remove thousand-separator dots, replace decimal comma
        return float(s.replace('.', '').replace(',', '.'))
    else:
        # Only dots: if last group has != 3 digits it's a decimal, else thousand sep
        parts = s.split('.')
        if len(parts) > 1 and len(parts[-1]) != 3:
            return float(s.replace('.', '').replace(',', '.'))
        return float(s.replace('.', ''))


def _find_price(text: str) -> float | None:
    """Find purchase price, prioritising explicitly labelled prices."""
    labeled = [
        r'Kaufpreis\s*(?:ab)?\s*[:\s]\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'Verkaufspreis\s*[:\s]\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'Marktwert\s*[:\s]\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'Preis\s*[:\s]\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
    ]
    for pattern in labeled:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                v = _parse_german_number(m.group(1))
                if v > 10_000:
                    return v
            except ValueError:
                continue

    # Fallback: find standalone large Euro amounts (≥100k), prefer first match
    candidates = []
    for m in re.finditer(
        r'([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?)\s*(?:€|EUR)',
        text, re.IGNORECASE
    ):
        try:
            v = _parse_german_number(m.group(1))
            if v >= 100_000:
                candidates.append(v)
        except ValueError:
            continue
    # Return the most common value (likely the headline price)
    if candidates:
        from collections import Counter
        return Counter(candidates).most_common(1)[0][0]
    return None


def _find_area(text: str) -> float | None:
    """Find the main usable/rentable area in m²."""
    labeled = [
        r'(?:Gesamtfl[äa]che|Mietfl[äa]che|Nutzfl[äa]che|Vermietbare?\s*Fl[äa]che|Wohnfl[äa]che)\s*(?:ca\.?)?\s*[:\s]\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]',
        r'(?:Gesamtfl[äa]che|Mietfl[äa]che|Nutzfl[äa]che)\s*(?:ca\.?)?\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]',
        r'ca\.\s*([0-9]{2,6}(?:[.,][0-9]+)?)\s*m[²2]',
        r'([0-9]{3,6}(?:[.,][0-9]+)?)\s*m[²2]',
    ]
    for pattern in labeled:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                v = float(m.group(1).replace('.', '').replace(',', '.'))
                if 10 < v < 1_000_000:
                    return v
            except ValueError:
                continue
    return None


_STREET_SUFFIXES = (
    r'straße|strasse|str\.|gasse|weg|allee|platz|ring|damm|hafen|ufer|chaussee'
    r'|berg|steig|pfad|markt|hof|zeile|stieg|promenade|kai'
)
_STREET_WORD = (
    r'[A-ZÄÖÜ][a-zäöüß]+(?:[-][A-Za-zäöüßÄÖÜ]+)*'
    r'(?:\s+[A-Za-zäöüßÄÖÜ]+)*'
)


def _find_full_address(text: str) -> tuple[str | None, str | None, str | None]:
    """Find (street, zip, city) all in one combined pattern."""
    # Forward: Musterstraße 12[a], 30179 Hannover
    m = re.search(
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r')\s*\d+\s*[a-zA-Z]?)'
        r'\s*[,\n]\s*(\d{5})\s+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ][a-zäöüß\s\-]*)',
        text, re.IGNORECASE,
    )
    if m:
        street = m.group(1).strip().rstrip(',')
        zip_code = m.group(2)
        city = m.group(3).strip().rstrip(',. ')
        city = ' '.join(city.split()[:3])
        return street, zip_code, city

    # Reverse: 30179 Hannover, Musterstraße 12
    m = re.search(
        r'(\d{5})\s+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ][a-zäöüß\s\-]*?)\s*[,\n]\s*'
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r')\s*\d+\s*[a-zA-Z]?)',
        text, re.IGNORECASE,
    )
    if m:
        zip_code = m.group(1)
        city = m.group(2).strip().rstrip(',. ')
        city = ' '.join(city.split()[:3])
        street = m.group(3).strip().rstrip(',')
        return street, zip_code, city

    return None, None, None


def _find_zip_and_city(text: str) -> tuple[str | None, str | None]:
    """Extract German ZIP code and city name."""
    # Pattern: 5-digit ZIP followed by city name (handle multi-word cities like "Bad Homburg")
    m = re.search(
        r'\b(\d{5})\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){0,2})(?:\s*[\n,./]|$)',
        text,
    )
    if m:
        return m.group(1), m.group(2).strip()
    # Looser fallback
    m = re.search(r'\b(\d{5})\s+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-]+)', text)
    if m:
        city = m.group(2).strip()
        return m.group(1), city
    return None, None


def _find_street(text: str) -> str | None:
    """Extract street address (without ZIP/city)."""
    # Labeled patterns take priority
    labeled = [
        r'(?:Adresse|Objektadresse|Anschrift)\s*[:\s]\s*([A-ZÄÖÜ][^\n]{5,60})',
        r'(?:Lage|Standort)\s*[:\s]\s*([A-ZÄÖÜ][^\n]{5,60})',
    ]
    for pattern in labeled:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            val = m.group(1).strip().rstrip(',')
            val = re.sub(r'\s*\d{5}\s+\S.*$', '', val).strip()
            if 3 < len(val) < 80:
                return val

    # Street followed by house number
    pattern = (
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r')\s*\d+\s*[a-zA-Z]?)'
    )
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        val = m.group(1).strip().rstrip(',')
        val = re.sub(r'\s*\d{5}\s+\S.*$', '', val).strip()
        if 3 < len(val) < 80:
            return val

    # Street without number (fallback)
    m = re.search(
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r'))',
        text, re.IGNORECASE,
    )
    if m:
        val = m.group(1).strip().rstrip(',')
        if 3 < len(val) < 80:
            return val

    return None


def _find_property_name(text: str) -> str | None:
    """Find the property title, skipping navigation/marketing boilerplate."""
    # First try explicit title patterns
    for pattern in [
        r'(?:Objekt(?:bezeichnung|titel|name)|Titel)\s*[:\s]\s*(.+)',
        r'Exposé[:\s]+(.+)',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:120]

    # Scan first 30 lines for a meaningful title
    for line in text.split('\n')[:30]:
        line = line.strip()
        if not (8 < len(line) < 120):
            continue
        if re.match(r'^\d', line):
            continue
        line_lower = line.lower()
        if any(skip in line_lower for skip in _SKIP_WORDS):
            continue
        # Skip lines that look like navigation (many | or • separators)
        if line.count('|') > 2 or line.count('•') > 2:
            continue
        # Skip lines that are just numbers/symbols
        if re.match(r'^[\d\s€.,\-/]+$', line):
            continue
        return line
    return None


def _find_property_type(text: str) -> str:
    t = text.lower()
    scores: dict[str, int] = {
        "OFFICE": 0, "RETAIL": 0, "RESIDENTIAL": 0, "INDUSTRIAL": 0, "MIXED": 0,
    }
    mapping = {
        "OFFICE": ["bürogebäude", "bürofläche", "büro", "office", "verwaltung", "geschäftshaus", "gewerbegebäude"],
        "RETAIL": ["einzelhandel", "retail", "laden", "einkauf", "shopping", "supermarkt"],
        "RESIDENTIAL": ["wohngebäude", "wohnung", "apartment", "mfh", "mehrfamilienhaus", "wohnanlage"],
        "INDUSTRIAL": ["industrie", "logistik", "lagerhalle", "lager", "halle", "produktion"],
        "MIXED": ["gemischt", "mixed", "mischnutzung", "wohn- und gewerbe"],
    }
    for ptype, keywords in mapping.items():
        for kw in keywords:
            if kw in t:
                scores[ptype] += (2 if len(kw) > 6 else 1)
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "OFFICE"


def _find_construction_year(text: str) -> int | None:
    for pattern in [
        r'Baujahr\s*[:\s]\s*(\d{4})',
        r'Bj\.\s*(\d{4})',
        r'erbaut\s+(?:im\s+)?(?:Jahr\s+)?(\d{4})',
        r'Bezugsfertig\s*[:\s]\s*(\d{4})',
        r'Baujahr\D{0,10}(\d{4})',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            y = int(m.group(1))
            if 1850 <= y <= 2035:
                return y
    return None


def _find_units(text: str) -> int | None:
    for pattern in [
        r'(\d+)\s*(?:Miet)?einheiten',
        r'(\d+)\s*Wohneinheiten',
        r'(\d+)\s*Wohnungen',
        r'(\d+)\s*WE\b',
        r'(\d+)\s*ME\b',
        r'(\d+)\s*(?:Gewerbe)?einheiten',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            u = int(m.group(1))
            if 1 <= u <= 10_000:
                return u
    return None


def _find_floors(text: str) -> int | None:
    for pattern in [
        r'(\d+)\s*(?:Ober)?geschoss(?:e|ig)',
        r'(\d+)[\s-]*(?:stöckig|geschossig|Etagen)',
        r'Etagen?\s*[:\s]\s*(\d+)',
        r'Geschosse?\s*[:\s]\s*(\d+)',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            f = int(m.group(1))
            if 1 <= f <= 100:
                return f
    return None


def parse_pdf(file_bytes: bytes) -> dict:
    """Parse an uploaded PDF exposé and return extracted property fields."""
    text = _extract_text_from_pdf(file_bytes)

    if not text.strip():
        return {
            "error": "Text konnte nicht extrahiert werden (ggf. bild-basiertes PDF)",
            "property_name": None, "address": None, "city": None, "zip_code": None,
            "property_type": None, "total_area": None, "purchase_price": None,
            "description": None,
        }

    # Try combined address first (most reliable)
    street, zip_code, city = _find_full_address(text)
    if not street:
        street = _find_street(text)
    if not zip_code or not city:
        _zip, _city = _find_zip_and_city(text)
        if not zip_code:
            zip_code = _zip
        if not city:
            city = _city

    result = {
        "property_name": _find_property_name(text),
        "address": street,
        "city": city,
        "zip_code": zip_code,
        "property_type": _find_property_type(text),
        "total_area": _find_area(text),
        "purchase_price": _find_price(text),
        "construction_year": _find_construction_year(text),
        "units": _find_units(text),
        "floors": _find_floors(text),
        "description": text[:500] if text else None,
        "raw_text_length": len(text),
    }

    data_fields = ["property_name", "address", "city", "property_type", "total_area", "purchase_price"]
    found = sum(1 for k in data_fields if result.get(k))
    result["extraction_confidence"] = "hoch" if found >= 5 else "mittel" if found >= 3 else "niedrig"
    return result
