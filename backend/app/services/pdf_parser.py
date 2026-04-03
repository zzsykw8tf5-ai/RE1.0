"""PDF parser – extracts property data from exposés using regex on raw text."""
import io
import re

PDFPLUMBER_AVAILABLE = False


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


def _find_price(text: str) -> float | None:
    patterns = [
        r'Kaufpreis[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'Preis[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'Verkaufspreis[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'Marktwert[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'([0-9]{1,3}(?:\.[0-9]{3})+)\s*(?:€|EUR)',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace('.', '').replace(',', '.'))
            except ValueError:
                continue
    return None


def _find_area(text: str) -> float | None:
    patterns = [
        r'Gesamtfl[äa]che[:\s]+([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|qm|m2)',
        r'Mietfl[äa]che[:\s]+([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|qm|m2)',
        r'Nutzfl[äa]che[:\s]+([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|qm|m2)',
        r'Wohnfl[äa]che[:\s]+([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|qm|m2)',
        r'ca\.\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|qm|m2)',
        r'([0-9]{3,5}(?:[.,][0-9]+)?)\s*(?:m²|qm|m2)',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(',', '.'))
            except ValueError:
                continue
    return None


def _find_address(text: str) -> str | None:
    patterns = [
        r'(?:Adresse|Lage|Standort|Objekt(?:adresse)?)[:\s]+([A-ZÄÖÜ][^\n,]+)',
        r'([A-ZÄÖÜ][a-zäöüß]+(?:straße|str\.|gasse|weg|allee|platz|ring|damm)[^\n]*\d+[^\n]*)',
        r'(\d{5}\s+[A-ZÄÖÜ][a-zäöüß\s]+)',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def _find_property_name(text: str) -> str | None:
    for line in text.split('\n')[:10]:
        line = line.strip()
        if 5 < len(line) < 100 and not line.startswith('www') and not re.match(r'^\d', line):
            return line
    return None


def _find_property_type(text: str) -> str | None:
    t = text.lower()
    mapping = {
        "OFFICE": ["büro", "office", "verwaltung", "geschäftshaus"],
        "RETAIL": ["einzelhandel", "retail", "laden", "einkauf", "shopping"],
        "RESIDENTIAL": ["wohn", "wohnung", "apartment", "mfh", "mehrfamilienhaus"],
        "INDUSTRIAL": ["industrie", "logistik", "lager", "halle", "produktion"],
        "MIXED": ["gemischt", "mixed", "mischnutzung"],
    }
    for ptype, keywords in mapping.items():
        if any(kw in t for kw in keywords):
            return ptype
    return None


def _find_construction_year(text: str) -> int | None:
    for pattern in [r'Baujahr[:\s]+(\d{4})', r'Bj\.[:\s]+(\d{4})', r'erbaut[:\s]+(?:im\s+)?(?:Jahr\s+)?(\d{4})']:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            y = int(m.group(1))
            if 1850 <= y <= 2030:
                return y
    return None


def _find_units(text: str) -> int | None:
    for pattern in [r'(\d+)\s*(?:Einheiten|Mieteinheiten|Wohneinheiten|Wohnungen)', r'(\d+)\s*WE\b', r'(\d+)\s*ME\b']:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            u = int(m.group(1))
            if 1 <= u <= 10000:
                return u
    return None


def parse_pdf(file_bytes: bytes) -> dict:
    """Parse an uploaded PDF exposé and return extracted property fields."""
    text = _extract_text_from_pdf(file_bytes)

    if not text.strip():
        return {
            "error": "Text konnte nicht extrahiert werden (ggf. bild-basiertes PDF)",
            "property_name": None, "address": None, "property_type": None,
            "total_area": None, "purchase_price": None, "description": None,
        }

    result = {
        "property_name": _find_property_name(text),
        "address": _find_address(text),
        "property_type": _find_property_type(text),
        "total_area": _find_area(text),
        "purchase_price": _find_price(text),
        "construction_year": _find_construction_year(text),
        "units": _find_units(text),
        "description": text[:400] if text else None,
        "raw_text_length": len(text),
    }

    found = sum(1 for v in result.values() if v is not None)
    result["extraction_confidence"] = "hoch" if found >= 5 else "mittel" if found >= 3 else "niedrig"
    return result
