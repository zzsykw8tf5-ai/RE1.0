"""News API – fetches Google News RSS for real estate topics."""
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
    "Accept": "application/rss+xml,application/xml,text/xml,*/*",
    "Accept-Language": "de-DE,de;q=0.9",
}


def _parse_rss(xml_text: str) -> list[dict]:
    """Parse RSS XML and return list of news items."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    items = []
    for item in root.findall(".//item")[:8]:
        title = item.findtext("title", "").strip()
        link = item.findtext("link", "").strip()
        pub_date = item.findtext("pubDate", "").strip()

        # Google News wraps source in <source> tag
        source_el = item.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else ""

        if title:
            items.append(
                {"title": title, "link": link, "pubDate": pub_date, "source": source}
            )
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
