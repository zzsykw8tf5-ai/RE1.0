"""News + tenant-suggestion API."""
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

# Words that appear in search results but are not company names
_SKIP_PHRASES = {
    "immobilienscout", "immowelt", "immonet", "wikipedia", "google",
    "youtube", "linkedin", "xing", "facebook", "twitter", "kununu",
    "gelbe seiten", "stadtbranchenbuch", "yelp", "trivago", "booking",
    "instagram", "tiktok",
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


@router.get("/suggest-tenants")
async def suggest_tenants(address: str, city: str = "") -> dict:
    """
    Search DuckDuckGo for companies/tenants at the given address.
    Returns a list of name suggestions for commercial tenant fields.
    """
    query = f'"{address}" {city} Unternehmen Mieter Büro Standort'.strip()
    encoded = quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded}&kl=de-de"

    suggestions: list[dict] = []
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=10, follow_redirects=True) as client:
            resp = await client.get(url)

        if resp.status_code != 200:
            return {"suggestions": suggestions}

        html = resp.text

        # Extract result titles (company/page names)
        titles = re.findall(r'class="result__a"[^>]*>([^<]+)</a>', html)
        snippets = re.findall(r'class="result__snippet"[^>]*>([^<]+)</a>', html)

        seen: set[str] = set()
        for title in titles[:10]:
            title = re.sub(r'<[^>]+>', '', title).strip()
            title_lower = title.lower()
            if not title or title_lower in seen:
                continue
            if any(skip in title_lower for skip in _SKIP_PHRASES):
                continue
            if len(title) < 3 or len(title) > 80:
                continue
            # Prefer titles that look like company names (contain GmbH, AG, etc.)
            is_company = any(kw in title for kw in ['GmbH', 'AG', 'KG', 'mbH', 'SE', 'eG', 'Ltd', 'GbR', 'OHG'])
            seen.add(title_lower)
            suggestions.append({"name": title, "is_company": is_company})

        # Add snippet-derived names as lower-priority fallback
        for snippet in snippets[:5]:
            snippet = re.sub(r'<[^>]+>', '', snippet).strip()
            # Try to extract company name from snippets (often "XY GmbH ...")
            company_match = re.search(
                r'([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\s&\-]+(?:GmbH|AG|KG|SE|mbH|eG|Ltd|GbR|OHG))',
                snippet,
            )
            if company_match:
                name = company_match.group(1).strip()
                name_lower = name.lower()
                if name_lower not in seen and len(name) > 3:
                    seen.add(name_lower)
                    suggestions.append({"name": name, "is_company": True})

    except Exception:
        pass

    # Sort: real companies first
    suggestions.sort(key=lambda x: (0 if x["is_company"] else 1))
    return {"suggestions": suggestions[:6]}


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
