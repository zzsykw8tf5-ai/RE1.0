"""News + tenant-suggestion API."""
import asyncio
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["news"])

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9",
}

_SKIP_PHRASES = {
    "immobilienscout", "immowelt", "immonet", "wikipedia", "google",
    "youtube", "linkedin", "xing", "facebook", "twitter", "kununu",
    "gelbe seiten", "stadtbranchenbuch", "yelp", "trivago", "booking",
    "instagram", "tiktok",
}

# OSM shop/amenity tags → human-readable label
_OSM_SHOP_LABELS = {
    "supermarket": "Supermarkt", "convenience": "Kiosk/Convenience",
    "chemist": "Drogerie", "pharmacy": "Apotheke",
    "clothes": "Bekleidung", "shoes": "Schuhe", "furniture": "Möbel",
    "electronics": "Elektronik", "hardware": "Baumarkt",
    "bakery": "Bäckerei", "butcher": "Metzgerei", "florist": "Blumen",
    "hairdresser": "Friseur", "beauty": "Kosmetik",
    "bank": "Bank", "insurance": "Versicherung",
    "restaurant": "Restaurant", "cafe": "Café", "fast_food": "Fastfood",
    "gym": "Fitness", "sports": "Sport",
    "optician": "Optiker", "medical_supply": "Sanitätshaus",
    "copyshop": "Copyshop", "travel_agency": "Reisebüro",
    "mobile_phone": "Telekommunikation", "bicycle": "Fahrrad",
    "pet": "Tierhandlung", "garden_centre": "Gartencenter",
    "kiosk": "Kiosk", "alcohol": "Spirituosen",
    "office": "Büro",
    # Healthcare / Gesundheit
    "nursing_home": "Pflegeheim", "social_facility": "Sozialeinrichtung",
    "hospital": "Krankenhaus", "clinic": "Klinik", "doctors": "Arztpraxis",
    "dentist": "Zahnarztpraxis", "physiotherapist": "Physiotherapie",
    "retirement_home": "Altenheim",
}


def _parse_rss(xml_text: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    items = []
    for item in root.findall(".//item")[:8]:
        title = item.findtext("title", "").strip()
        link = item.findtext("link", "").strip()
        pub_date = item.findtext("pubDate", "").strip()
        source_el = item.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else ""
        if title:
            items.append({"title": title, "link": link, "pubDate": pub_date, "source": source})
    return items


@router.get("/news")
async def get_news(q: str) -> dict:
    """Fetch Google News RSS for query q."""
    encoded = quote_plus(q)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=de&gl=DE&ceid=DE:de"
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=8, follow_redirects=True) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return {"items": []}
        return {"items": _parse_rss(resp.text)}
    except Exception:
        return {"items": []}


@router.get("/geocode")
async def geocode(q: str) -> dict:
    """Geocode address string via Nominatim (OSM). Returns {lat, lng} or empty."""
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": q, "format": "json", "limit": 1, "countrycodes": "de"}
    nom_headers = {**_HEADERS, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(headers=nom_headers, timeout=5) as client:
            resp = await client.get(url, params=params)
        if resp.status_code == 200:
            results = resp.json()
            if results:
                return {"lat": float(results[0]["lat"]), "lng": float(results[0]["lon"])}
    except Exception:
        pass
    return {}


async def _geocode_address(address: str, city: str) -> tuple[float, float] | None:
    """Return (lat, lng) for the address, or None if geocoding fails."""
    query = f"{address}, {city}, Deutschland".strip(", ")
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": query, "format": "json", "limit": 1, "countrycodes": "de"}
    headers = {**_HEADERS, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=6) as client:
            resp = await client.get(url, params=params)
        if resp.status_code == 200:
            data = resp.json()
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None


async def _overpass_tenants(lat: float, lng: float, radius: int = 150) -> list[dict]:
    """
    Query OpenStreetMap Overpass API for shops, offices, and businesses
    within `radius` metres of the given coordinates.
    Returns list of {name, type_label, is_company}.
    """
    # Query all nodes/ways with shops, offices, amenities and healthcare tags
    overpass_query = f"""
[out:json][timeout:15];
(
  node["shop"](around:{radius},{lat},{lng});
  node["amenity"](around:{radius},{lat},{lng});
  node["office"](around:{radius},{lat},{lng});
  node["healthcare"](around:{radius},{lat},{lng});
  way["name"]["shop"](around:{radius},{lat},{lng});
  way["name"]["amenity"](around:{radius},{lat},{lng});
  way["name"]["office"](around:{radius},{lat},{lng});
  way["name"]["healthcare"](around:{radius},{lat},{lng});
  way["amenity"="nursing_home"](around:{radius},{lat},{lng});
  way["amenity"="hospital"](around:{radius},{lat},{lng});
  way["amenity"="clinic"](around:{radius},{lat},{lng});
  way["amenity"="social_facility"](around:{radius},{lat},{lng});
);
out tags;
""".strip()

    url = "https://overpass-api.de/api/interpreter"
    try:
        async with httpx.AsyncClient(timeout=14) as client:
            resp = await client.post(url, data={"data": overpass_query})
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception:
        return []

    seen: set[str] = set()
    results: list[dict] = []

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        name = (tags.get("brand") or tags.get("operator") or tags.get("name") or "").strip()
        if not name or len(name) < 2 or name.lower() in seen:
            continue
        seen.add(name.lower())

        shop = tags.get("shop", "")
        amenity = tags.get("amenity", "")
        office = tags.get("office", "")
        healthcare = tags.get("healthcare", "")
        kind = shop or amenity or healthcare or office or "Gewerbe"
        type_label = _OSM_SHOP_LABELS.get(kind, kind.replace("_", " ").capitalize())

        results.append({
            "name": name,
            "type_label": type_label,
            "is_company": True,
        })

    # Sort: shops first (most relevant for retail tenants), then offices/amenities
    results.sort(key=lambda x: (0 if x["type_label"] in _OSM_SHOP_LABELS.values() else 1, x["name"]))
    return results


_PROPERTY_TYPE_DDG_TERMS: dict[str, list[str]] = {
    "HEALTHCARE": [
        "Pflegeheim Pflegedienst Seniorenresidenz Betreiber",
        "Klinik Krankenhaus Ärztehaus MVZ Arztpraxis",
    ],
    "OFFICE":     [
        "GmbH AG KG Unternehmen Büro",
        "Gewerbe ansässige Unternehmen Firma",
    ],
    "RETAIL":     [
        "GmbH AG Einzelhandel Shop Filiale",
        "Gewerbe Einzelhändler Ladenlokal",
    ],
    "INDUSTRIAL": [
        "GmbH AG Logistik Produktion Lager Spedition",
        "Gewerbe Industrie Fertigung",
    ],
    "MIXED":      [
        "GmbH AG Unternehmen Gewerbe",
        "Gewerbe ansässige Unternehmen Firma",
    ],
}

# OSM tags relevant for healthcare
_HEALTHCARE_OSM_TAGS = {
    "nursing_home", "social_facility", "hospital", "clinic", "doctors",
    "dentist", "physiotherapist", "retirement_home",
}


@router.get("/suggest-tenants")
async def suggest_tenants(address: str, city: str = "", property_type: str = "") -> dict:
    """
    Find tenants at the given address matching the property type.
    Primary: OpenStreetMap Overpass + northdata.de
    Fallback: DuckDuckGo (type-specific search terms)
    """
    import asyncio

    if not address or len(address.strip()) < 3:
        return {"suggestions": []}

    addr = address.strip()
    city_part = city.strip()
    ptype = property_type.upper()
    is_healthcare = ptype == "HEALTHCARE"

    # ── OSM: find nearby facilities ───────────────────────────────────────────
    coords = await _geocode_address(addr, city_part)
    osm_results: list[dict] = []
    if coords:
        lat, lng = coords
        radius = 800 if is_healthcare else 500
        all_osm = await _overpass_tenants(lat, lng, radius=radius)
        if is_healthcare:
            # Prioritise healthcare facility types
            hc = [r for r in all_osm if r.get("type_label") in {
                _OSM_SHOP_LABELS.get(t, t) for t in _HEALTHCARE_OSM_TAGS
            }]
            others = [r for r in all_osm if r not in hc]
            osm_results = hc + others
        else:
            osm_results = all_osm

    if osm_results:
        return {"suggestions": osm_results[:15]}

    # ── Fallback: northdata + DuckDuckGo ─────────────────────────────────────
    ddg_terms = _PROPERTY_TYPE_DDG_TERMS.get(ptype, _PROPERTY_TYPE_DDG_TERMS["MIXED"])

    nd_task = _northdata_search(addr, city_part)
    ddg1_task = _ddg_search(f'"{addr}" {city_part} {ddg_terms[0]}')
    ddg2_query = (
        f'{city_part} {ddg_terms[1]}' if is_healthcare and city_part
        else f'{addr} {city_part} {ddg_terms[1] if len(ddg_terms) > 1 else ""}'
    )
    ddg2_task = _ddg_search(ddg2_query)

    nd_results, ddg1_html, ddg2_html = await asyncio.gather(nd_task, ddg1_task, ddg2_task)

    seen: set[str] = set()
    suggestions: list[dict] = []

    for item in nd_results:
        nl = item["name"].lower()
        if nl not in seen:
            seen.add(nl)
            suggestions.append(item)

    for html in [ddg1_html, ddg2_html]:
        if html:
            suggestions.extend(_extract_companies(html, seen))

    # For healthcare also try to extract non-corporate names (e.g. "Alloheim", "Korian")
    if is_healthcare:
        hc_re = re.compile(
            r'\b((?:Pflegeheim|Seniorenresidenz|Seniorenstift|Klinik|Ärztehaus|Pflegezentrum|Altenheim)'
            r'\s+[A-ZÄÖÜa-zäöüß\s\-]{3,40})',
            re.UNICODE,
        )
        for html in [ddg1_html, ddg2_html]:
            if not html:
                continue
            text = _html_to_text(html)
            for m in hc_re.finditer(text):
                name = ' '.join(m.group(1).split()).strip('.,;: ')
                nl = name.lower()
                if nl not in seen and 5 <= len(name) <= 80:
                    seen.add(nl)
                    suggestions.append({"name": name, "is_company": False,
                                        "type_label": "Gesundheitseinrichtung"})

    suggestions.sort(key=lambda x: (0 if x.get("is_company") else 1))
    return {"suggestions": suggestions[:10]}


_COMPANY_SUFFIXES = re.compile(
    r'([A-ZÄÖÜ][A-Za-zÄÖÜäöüß&\s\.\-]{1,50}'
    r'(?:GmbH\s*&\s*Co\.\s*KG|GmbH\s*&\s*Co|GmbH|AG|KG|SE|UG|mbH|eG|Ltd|GbR|OHG|Inc\.?))',
    re.UNICODE,
)


@router.get("/company-search")
async def company_search(name: str) -> dict:
    """
    Search for a company by name.
    Primary: Clearbit autocomplete (free, no API key) — returns name, domain, logo.
    Fallback: DuckDuckGo HTML search.
    """
    if not name or len(name.strip()) < 2:
        return {"suggestions": []}

    suggestions: list[dict] = []

    # 1. Clearbit autocomplete (no API key required)
    try:
        cb_url = f"https://autocomplete.clearbit.com/v1/companies/suggest?query={quote_plus(name)}"
        async with httpx.AsyncClient(
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=4,
        ) as client:
            resp = await client.get(cb_url)
        if resp.status_code == 200:
            for co in resp.json()[:7]:
                co_name = co.get("name", "").strip()
                domain = co.get("domain", "").strip()
                if co_name:
                    suggestions.append({
                        "name": co_name,
                        "domain": domain,
                        "logo": f"https://logo.clearbit.com/{domain}" if domain else "",
                        "is_company": True,
                        "source": "clearbit",
                    })
    except Exception:
        pass

    # 2. DuckDuckGo fallback if Clearbit returned nothing
    if not suggestions:
        query = f"{name} GmbH AG Unternehmen Deutschland"
        encoded = quote_plus(query)
        ddg_url = f"https://html.duckduckgo.com/html/?q={encoded}&kl=de-de"
        try:
            async with httpx.AsyncClient(headers=_HEADERS, timeout=8, follow_redirects=True) as client:
                resp = await client.get(ddg_url)
            if resp.status_code == 200:
                titles = re.findall(r'class="result__a"[^>]*>([^<]+)</a>', resp.text)
                seen: set[str] = set()
                for title in titles[:10]:
                    title = re.sub(r'<[^>]+>', '', title).strip()
                    if not title or title.lower() in seen or len(title) < 3 or len(title) > 80:
                        continue
                    if any(skip in title.lower() for skip in _SKIP_PHRASES):
                        continue
                    is_co = any(kw in title for kw in ['GmbH', 'AG', 'KG', 'SE', 'mbH', 'eG', 'Ltd'])
                    seen.add(title.lower())
                    suggestions.append({
                        "name": title, "domain": "", "logo": "",
                        "is_company": is_co, "source": "ddg",
                    })
        except Exception:
            pass

    suggestions.sort(key=lambda x: (0 if x["is_company"] else 1))
    return {"suggestions": suggestions[:7]}


_COMPANY_SUFFIXES = re.compile(
    r'([A-ZÄÖÜ][A-Za-zÄÖÜäöüß&\s\.\-]{1,50}'
    r'(?:GmbH\s*&\s*Co\.\s*KG|GmbH\s*&\s*Co|GmbH|AG|KG|SE|UG|mbH|eG|Ltd|GbR|OHG|Inc\.?))',
    re.UNICODE,
)

_HTML_TAG = re.compile(r'<[^>]+>')
_HTML_ENTITY = re.compile(r'&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]+);')


def _html_to_text(html: str) -> str:
    text = _HTML_TAG.sub(' ', html)
    text = _HTML_ENTITY.sub(' ', text)
    return text


def _extract_companies(raw_html: str, seen: set[str]) -> list[dict]:
    """Extract all company names (with legal suffix) from raw HTML."""
    text = _html_to_text(raw_html)
    results = []
    for m in _COMPANY_SUFFIXES.finditer(text):
        name = ' '.join(m.group(1).split())  # normalise whitespace
        name = name.strip('.,;: ')
        nl = name.lower()
        if nl in seen or len(name) < 5 or len(name) > 90:
            continue
        if any(skip in nl for skip in _SKIP_PHRASES):
            continue
        seen.add(nl)
        results.append({"name": name, "is_company": True})
    return results


async def _ddg_search(query: str, timeout: int = 9) -> str:
    """Fetch DuckDuckGo HTML results for a query. Returns raw HTML or ''."""
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}&kl=de-de"
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url)
        return resp.text if resp.status_code == 200 else ""
    except Exception:
        return ""


async def _northdata_search(address: str, city: str) -> list[dict]:
    """
    Scrape northdata.de for companies registered at this address.
    northdata.de is a German company register aggregator.
    """
    query = f"{address} {city}".strip()
    url = f"https://www.northdata.de/{quote_plus(query)}"
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=8, follow_redirects=True) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return []
        html = resp.text
        seen: set[str] = set()
        # northdata lists company names in <strong> or heading tags
        candidates = re.findall(r'<(?:strong|h\d|a)[^>]*>([^<]{4,80})</(?:strong|h\d|a)>', html)
        results = []
        for raw in candidates[:20]:
            name = _html_to_text(raw).strip()
            if _COMPANY_SUFFIXES.search(name):
                nl = name.lower()
                if nl not in seen:
                    seen.add(nl)
                    results.append({"name": name.strip('.,; '), "is_company": True})
        return results
    except Exception:
        return []




@router.get("/company-search")
async def company_search(name: str) -> dict:
    """
    Search for a company by name.
    Primary: Clearbit autocomplete (free, no API key) — returns name, domain, logo.
    Fallback: DuckDuckGo HTML search.
    """
    if not name or len(name.strip()) < 2:
        return {"suggestions": []}

    suggestions: list[dict] = []

    # 1. Clearbit autocomplete (no API key required)
    try:
        cb_url = f"https://autocomplete.clearbit.com/v1/companies/suggest?query={quote_plus(name)}"
        async with httpx.AsyncClient(
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=4,
        ) as client:
            resp = await client.get(cb_url)
        if resp.status_code == 200:
            for co in resp.json()[:7]:
                co_name = co.get("name", "").strip()
                domain = co.get("domain", "").strip()
                if co_name:
                    suggestions.append({
                        "name": co_name,
                        "domain": domain,
                        "logo": f"https://logo.clearbit.com/{domain}" if domain else "",
                        "is_company": True,
                        "source": "clearbit",
                    })
    except Exception:
        pass

    # 2. DuckDuckGo fallback if Clearbit returned nothing
    if not suggestions:
        query = f"{name} GmbH AG Unternehmen Deutschland"
        encoded = quote_plus(query)
        ddg_url = f"https://html.duckduckgo.com/html/?q={encoded}&kl=de-de"
        try:
            async with httpx.AsyncClient(headers=_HEADERS, timeout=8, follow_redirects=True) as client:
                resp = await client.get(ddg_url)
            if resp.status_code == 200:
                titles = re.findall(r'class="result__a"[^>]*>([^<]+)</a>', resp.text)
                seen: set[str] = set()
                for title in titles[:10]:
                    title = re.sub(r'<[^>]+>', '', title).strip()
                    if not title or title.lower() in seen or len(title) < 3 or len(title) > 80:
                        continue
                    if any(skip in title.lower() for skip in _SKIP_PHRASES):
                        continue
                    is_co = any(kw in title for kw in ['GmbH', 'AG', 'KG', 'SE', 'mbH', 'eG', 'Ltd'])
                    seen.add(title.lower())
                    suggestions.append({
                        "name": title, "domain": "", "logo": "",
                        "is_company": is_co, "source": "ddg",
                    })
        except Exception:
            pass

    suggestions.sort(key=lambda x: (0 if x["is_company"] else 1))
    return {"suggestions": suggestions[:7]}
