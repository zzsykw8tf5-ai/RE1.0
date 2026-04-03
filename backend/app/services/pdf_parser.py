"""PDF parser – extracts property data from exposés using regex on raw text."""
import io
import re

PDFPLUMBER_AVAILABLE = False

# Context words that mark an AGENT/PROVIDER section — addresses near these are NOT the object address
_PROVIDER_WORDS = [
    "makler", "anbieter", "ansprechpartner", "kontakt", "unser büro",
    "vermittler", "verkäufer", "berater", "immobilienbüro", "franchise",
    "telefon:", "tel.:", "fax:", "e-mail:", "email:", "impressum",
    "datenschutz", "agb", "öffnungszeiten",
]

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


# Street suffix keywords — lowercase (street names end with these in German)
_STREET_SUFFIXES = (
    r'straße|strasse|str\.|gasse|weg|allee|platz|ring|damm|hafen|ufer|chaussee'
    r'|berg|steig|pfad|markt|hof|zeile|stieg|promenade|kai'
    r'|Straße|Strasse|Gasse|Weg|Allee|Platz|Ring|Damm|Hafen|Ufer|Chaussee'
)
# Strict (no IGNORECASE) — only matches properly capitalized German words
# [A-ZÄÖÜ] = uppercase start, [a-zäöüßÄÖÜ] = lowercase body (Ä/Ö/Ü for compound names)
_STREET_WORD = r'[A-ZÄÖÜ][a-zäöüßÄÖÜ]+(?:[-][A-ZÄÖÜ]?[a-zäöüßÄÖÜ]+)*(?:\s[A-ZÄÖÜ][a-zäöüßÄÖÜ]+)*'


def _find_provider_section_start(text: str) -> int:
    """Find where the provider/agent contact section begins.
    Returns the character position, or len(text) if not found.
    Multi-word markers are more specific than single words like 'Makler'.
    """
    markers = [
        r'Ihr\s+Ansprechpartner',
        r'Kontaktdaten\s+(?:des\s+)?(?:Maklers?|Anbieters?)',
        r'Unser\s+(?:Büro|Team|Angebot)',
        r'Anbieter(?:profil)?:',
        r'(?:Anbietende|Vermittelnde)\s+(?:Firma|Person)',
        r'Makler(?:information|angaben|profil)',
    ]
    for pattern in markers:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.start()
    return len(text)


def _find_full_address(text: str) -> tuple[str | None, str | None, str | None]:
    """Find (street, zip, city) all in one combined pattern.
    Avoids addresses that appear after the provider/contact section.
    """
    provider_start = _find_provider_section_start(text)
    # Search only in the object part of the document
    object_text = text[:provider_start]

    # No IGNORECASE — prevents ALL-CAPS words like "EUR" or "MFH" from matching as street words
    forward_pat = re.compile(
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r')\s*\d+\s*[a-zA-Z]?)'
        r'\s*[,\n]\s*(\d{5})\s+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ][a-zäöüß\s\-]*)',
    )
    reverse_pat = re.compile(
        r'(\d{5})\s+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ][a-zäöüß\s\-]*?)\s*[,\n]\s*'
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r')\s*\d+\s*[a-zA-Z]?)',
    )
    labeled_pat = re.compile(
        r'(?:Objektadresse|Adresse\s*des\s*Objekts?|Objekt(?:standort)?)\s*[:\s]\s*'
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r')[^\n]{0,20})',
        re.IGNORECASE,
    )

    # 1) Try explicit label in object section
    m = labeled_pat.search(object_text)
    if m:
        street_raw = m.group(1).strip().rstrip(',')
        zip_m = re.search(r'(\d{5})\s+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ][a-zäöüß\s\-]+)', object_text[m.start():m.start()+200])
        if zip_m:
            return street_raw, zip_m.group(1), ' '.join(zip_m.group(2).strip().split()[:3])

    # 2) Forward then reverse pattern in object section
    for pat, is_forward in [(forward_pat, True), (reverse_pat, False)]:
        m = pat.search(object_text)
        if m:
            if is_forward:
                street = m.group(1).strip().rstrip(',')
                zip_code = m.group(2)
                city = ' '.join(m.group(3).strip().rstrip(',. ').split()[:3])
            else:
                zip_code = m.group(1)
                city = ' '.join(m.group(2).strip().rstrip(',. ').split()[:3])
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

    # Only search the object portion (before provider/contact section)
    provider_start = _find_provider_section_start(text)
    search_text = text[:provider_start]

    pattern = re.compile(
        r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r')\s*\d+\s*[a-zA-Z]?)',
    )
    m = pattern.search(search_text)
    if m:
        val = m.group(1).strip().rstrip(',')
        val = re.sub(r'\s*\d{5}\s+\S.*$', '', val).strip()
        if 3 < len(val) < 80:
            return val

    # Street without number (fallback)
    m = re.search(r'(' + _STREET_WORD + r'\s*(?:' + _STREET_SUFFIXES + r'))', search_text)
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


def _find_description(text: str) -> str | None:
    """Extract property description (longer continuous text block)."""
    # Look for labeled description section
    for pattern in [
        r'(?:Objektbeschreibung|Beschreibung|Exposé-Text|Ausstattung|Lagebeschreibung)\s*[:\n]\s*(.{50,800}?)(?:\n\n|\Z)',
        r'(?:Das Objekt|Das Gebäude|Die Immobilie)\s+(.{40,600}?)(?:\n\n|\Z)',
    ]:
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            desc = m.group(1).strip()
            if len(desc) > 40:
                return desc[:800]

    # Fallback: find longest paragraph in first half of document
    provider_start = _find_provider_section_start(text)
    object_text = text[:provider_start]
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', object_text) if len(p.strip()) > 80]
    if paragraphs:
        return max(paragraphs, key=len)[:800]
    return None


def _find_monthly_rent(text: str) -> float | None:
    """Find actual/current monthly rent (IST-Miete)."""
    for pattern in [
        r'(?:IST-Miete|Aktuelle\s+Miete|Kaltmiete|Monatliche\s+Miete|Jahresmiete\s*/\s*12)\s*[:\s]\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'(?:Mieteinnahmen|Mieterträge)\s*(?:p\.?\s*[Mm]\.?|monatlich)?\s*[:\s]\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                v = _parse_german_number(m.group(1))
                if v > 100:
                    return v
            except ValueError:
                continue
    return None


def _find_annual_rent(text: str) -> float | None:
    """Find annual rent / Jahresmiete."""
    for pattern in [
        r'(?:Jahresmiete|Jahresrohertrag|Jahresnettomiete|Jahresertrag|Mieteinnahmen\s*p\.?\s*a\.?)\s*[:\s]\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|Euro)',
        r'(?:Jahresmiete|Jahresrohertrag)\D{0,10}([0-9]{1,3}(?:[.,][0-9]{3})+)\s*(?:€|EUR)',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                v = _parse_german_number(m.group(1))
                if v > 1000:
                    return v
            except ValueError:
                continue
    return None


def _find_agent_info(text: str) -> dict:
    """Extract real estate agent/Makler contact information."""
    provider_start = _find_provider_section_start(text)
    # Look in the last 40% of the document (where agent info usually is)
    agent_section = text[provider_start:] if provider_start < len(text) else text[int(len(text) * 0.6):]

    result: dict[str, str | None] = {"name": None, "phone": None, "email": None, "address": None}

    # Company name (often first capitalized line in agent section)
    name_m = re.search(r'([A-ZÄÖÜ][a-zäöüßÄÖÜ\s&,\.\-]+(?:GmbH|AG|KG|Immobilien|Makler|Realty|Estate)[^\n]{0,40})', agent_section)
    if name_m:
        result["name"] = name_m.group(1).strip()[:120]

    # Phone
    phone_m = re.search(r'(?:Telefon|Tel\.?|Phone|Fon)\s*[:\s]?\s*([+0-9\s\(\)\-/]{7,20})', agent_section, re.IGNORECASE)
    if phone_m:
        result["phone"] = phone_m.group(1).strip()

    # Email
    email_m = re.search(r'([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})', agent_section)
    if email_m:
        result["email"] = email_m.group(1)

    # Agent address (street in agent section)
    addr_m = re.search(
        r'([A-ZÄÖÜ][a-zäöüßÄÖÜ]+(?:[-][A-ZÄÖÜ]?[a-zäöüßÄÖÜ]+)*\s*(?:straße|strasse|str\.|gasse|weg|allee|platz|ring|damm)\s*\d+[a-zA-Z]?)',
        agent_section,
    )
    if addr_m:
        result["address"] = addr_m.group(1).strip()

    return result


def _find_land_area(text: str) -> float | None:
    """Find Grundstücksfläche (land / plot area) in m²."""
    for pattern in [
        r'Grundst[üu]cksgr[öo][ß s]e\s*(?:ca\.?)?\s*[:\s]\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]',
        r'Grundst[üu]cksfl[äa]che\s*(?:ca\.?)?\s*[:\s]\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]',
        r'Grundst[üu]ck\s*(?:ca\.?)?\s*[:\s]\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]',
        r'Liegenschaft(?:sfläche)?\s*[:\s]\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]',
        r'Grundst[üu]ck(?:sgröße|sfläche)\D{0,6}([0-9]+(?:[.,][0-9]+)?)\s*m[²2]',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                v = float(m.group(1).replace('.', '').replace(',', '.'))
                if 10 < v < 10_000_000:
                    return v
            except ValueError:
                continue
    return None
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

    property_name = _find_property_name(text)
    property_type = _find_property_type(text)
    total_area = _find_area(text)
    purchase_price = _find_price(text)
    annual_rent = _find_annual_rent(text)
    monthly_rent = _find_monthly_rent(text)
    # If only monthly rent found, derive annual
    if annual_rent is None and monthly_rent is not None:
        annual_rent = round(monthly_rent * 12, 2)

    agent_info = _find_agent_info(text)
    description = _find_description(text)

    result = {
        "property_name": property_name,
        "address": street,
        "city": city,
        "zip_code": zip_code,
        "property_type": property_type,
        "total_area": total_area,
        "land_area": _find_land_area(text),
        "purchase_price": purchase_price,
        "construction_year": _find_construction_year(text),
        "units": _find_units(text),
        "floors": _find_floors(text),
        "annual_rent": annual_rent,
        "monthly_rent": monthly_rent,
        "description": description,
        "agent": agent_info,
        "raw_text_length": len(text),
    }

    data_fields = ["property_name", "address", "city", "property_type", "total_area", "purchase_price"]
    found = sum(1 for k in data_fields if result.get(k))
    result["extraction_confidence"] = "hoch" if found >= 5 else "mittel" if found >= 3 else "niedrig"
    return result
