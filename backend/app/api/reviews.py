"""Google Places Reviews API."""
import os
import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["reviews"])

GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
_PLACES_BASE = "https://maps.googleapis.com/maps/api/place"


async def _find_place(query: str) -> dict | None:
    """Text Search to find a place_id."""
    if not GOOGLE_PLACES_API_KEY:
        return None
    params = {
        "query": query,
        "key": GOOGLE_PLACES_API_KEY,
        "language": "de",
        "fields": "place_id,name,rating,user_ratings_total,formatted_address",
    }
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(f"{_PLACES_BASE}/textsearch/json", params=params)
        data = r.json()
    results = data.get("results", [])
    return results[0] if results else None


async def _get_place_details(place_id: str) -> dict:
    """Fetch rating + reviews from Place Details."""
    params = {
        "place_id": place_id,
        "fields": "name,rating,user_ratings_total,reviews,url",
        "key": GOOGLE_PLACES_API_KEY,
        "language": "de",
    }
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(f"{_PLACES_BASE}/details/json", params=params)
        return r.json().get("result", {})


@router.get("/google-reviews")
async def get_google_reviews(name: str, address: str = "", city: str = ""):
    """
    Returns Google Places rating + up to 5 reviews for a given name/address.
    If GOOGLE_PLACES_API_KEY is not configured, returns a search_url fallback.
    """
    query_parts = [p for p in [name, address, city] if p]
    query = ", ".join(query_parts)

    if not GOOGLE_PLACES_API_KEY:
        from urllib.parse import quote_plus
        search_url = f"https://www.google.com/maps/search/{quote_plus(query)}"
        return {
            "available": False,
            "reason": "GOOGLE_PLACES_API_KEY not configured",
            "search_url": search_url,
            "query": query,
        }

    try:
        place = await _find_place(query)
        if not place:
            from urllib.parse import quote_plus
            return {
                "available": False,
                "reason": "Kein Treffer in Google Places",
                "search_url": f"https://www.google.com/maps/search/{quote_plus(query)}",
                "query": query,
            }

        details = await _get_place_details(place["place_id"])
        reviews_raw = details.get("reviews", [])
        reviews = [
            {
                "author": r.get("author_name", ""),
                "rating": r.get("rating", 0),
                "text": r.get("text", ""),
                "time": r.get("relative_time_description", ""),
                "profile_photo": r.get("profile_photo_url", ""),
            }
            for r in reviews_raw[:5]
        ]

        return {
            "available": True,
            "name": details.get("name", place.get("name", name)),
            "rating": details.get("rating") or place.get("rating"),
            "user_ratings_total": details.get("user_ratings_total") or place.get("user_ratings_total", 0),
            "maps_url": details.get("url", f"https://www.google.com/maps/place/?q=place_id:{place['place_id']}"),
            "reviews": reviews,
            "query": query,
        }
    except Exception as exc:
        from urllib.parse import quote_plus
        return {
            "available": False,
            "reason": str(exc),
            "search_url": f"https://www.google.com/maps/search/{quote_plus(query)}",
            "query": query,
        }
