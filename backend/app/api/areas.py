"""
Flächenverwaltung API – gif MF/G 2017 konforme Mietflächen pro Immobilie.

Endpoints:
  GET    /api/properties/{id}/areas              – Alle Flächen
  POST   /api/properties/{id}/areas              – Fläche anlegen
  PATCH  /api/properties/{id}/areas/{area_id}    – Fläche aktualisieren
  DELETE /api/properties/{id}/areas/{area_id}    – Fläche löschen
  GET    /api/properties/{id}/areas/osm-estimate – OSM Gebäudeflächenschätzung
  GET    /api/area-rent                          – Marktmiete nach Nutzungsart
  GET    /api/gif-types                          – gif Nutzungsarten Katalog
"""
import math
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.property import (
    Property, RentalArea,
    GIF_NUTZUNGSARTEN, ETAGEN, LAGE_QUALITAETEN, AREA_STATUS, HEALTHCARE_NUTZUNGSARTEN,
)

router = APIRouter(prefix="/api", tags=["areas"])

import re as _re
from urllib.parse import urlparse as _urlparse, parse_qs as _parse_qs

# ── gif Nutzungsart → Property-Typ Mapping für Marktmietdaten ─────────────────
_NUTZUNGSART_TO_PROPTYPE = {
    "BUERO":            "OFFICE",
    "EINZELHANDEL":     "RETAIL",
    "LAGER":            "INDUSTRIAL",
    "PRODUKTION":       "INDUSTRIAL",
    "GASTRONOMIE":      "RETAIL",
    "PRAXIS":           "OFFICE",
    "WOHNEN":           "RESIDENTIAL",
    "HOTEL":            "RETAIL",
    # Gesundheit → OFFICE als Mietbasis
    "PFLEGEHEIM":       "OFFICE",
    "ALTENHEIM":        "OFFICE",
    "BETREUTES_WOHNEN": "RESIDENTIAL",
    "KRANKENHAUS":      "OFFICE",
    "AERZTEHAUS":       "OFFICE",
    "MVZ":              "OFFICE",
    "SONSTIGES":        "MIXED",
}

# Anpassungsfaktoren Lagequalität (Einzelhandel)
_LAGE_FAKTOR = {"1A": 1.6, "1B": 0.85, "NEBEN": 0.45}

# Anpassungsfaktoren Nutzungsart (abweichend vom Basis-Typ)
_NUTZUNGSART_FAKTOR = {
    "PRODUKTION":       0.80,
    "GASTRONOMIE":      0.90,
    "PRAXIS":           1.15,
    "HOTEL":            0.70,
    # Gesundheitsimmobilien (CBRE/JLL DE Benchmarks 2023)
    "PFLEGEHEIM":       1.20,   # ~14-20 €/m²
    "ALTENHEIM":        1.10,   # ~13-17 €/m²
    "BETREUTES_WOHNEN": 0.95,   # ähnlich Wohnen + Aufschlag
    "KRANKENHAUS":      0.95,   # oft ÖD-Verträge
    "AERZTEHAUS":       1.25,   # Premium über Büro
    "MVZ":              1.30,   # höchste Rendite
}

# Größenrabatt (Fläche in m²)
def _size_factor(area_sqm: float) -> float:
    if area_sqm < 50:   return 1.20
    if area_sqm < 200:  return 1.00
    if area_sqm < 500:  return 0.95
    if area_sqm < 1000: return 0.90
    return 0.85


def _auto_name(nutzungsart: str, etage: str, lage_qualitaet: Optional[str], seq: int) -> str:
    """Erzeuge automatische Bezeichnung: 'Büro 2.OG-01', 'EH 1A EG-02', 'Lager UG-01'."""
    short = {
        "BUERO": "Büro", "EINZELHANDEL": "EH", "LAGER": "Lager",
        "PRODUKTION": "Prod.", "GASTRONOMIE": "Gastro", "PRAXIS": "Praxis",
        "WOHNEN": "Wohn.", "HOTEL": "Hotel",
        "PFLEGEHEIM": "Pflege", "ALTENHEIM": "Alten", "BETREUTES_WOHNEN": "Betreut",
        "KRANKENHAUS": "Klinik", "AERZTEHAUS": "Arzt", "MVZ": "MVZ",
        "SONSTIGES": "Fl.",
    }.get(nutzungsart, nutzungsart)

    etage_label = {
        "UG": "UG", "EG": "EG", "OG1": "1.OG", "OG2": "2.OG",
        "OG3": "3.OG", "OG4": "4.OG", "OG5": "5.OG", "DG": "DG",
    }.get(etage, etage)

    lage_part = f" {lage_qualitaet}" if lage_qualitaet and nutzungsart == "EINZELHANDEL" else ""
    return f"{short}{lage_part} {etage_label}-{seq:02d}"


def _area_dict(a: RentalArea) -> dict:
    return {
        "id": a.id,
        "property_id": a.property_id,
        "nutzungsart": a.nutzungsart,
        "nutzungsart_label": GIF_NUTZUNGSARTEN.get(a.nutzungsart, a.nutzungsart),
        "etage": a.etage,
        "etage_label": ETAGEN.get(a.etage or "EG", a.etage),
        "lage_qualitaet": a.lage_qualitaet,
        "lage_label": LAGE_QUALITAETEN.get(a.lage_qualitaet or "", ""),
        "name": a.name,
        "area_sqm": a.area_sqm,
        "market_rent_sqm": a.market_rent_sqm,
        "beds": getattr(a, "beds", None),
        "status": a.status,
        "status_label": AREA_STATUS.get(a.status or "VERFUEGBAR", a.status),
        "notes": a.notes,
        "created_at": str(a.created_at) if a.created_at else None,
    }


def _next_seq(db: Session, property_id: int, nutzungsart: str, etage: str) -> int:
    count = db.query(RentalArea).filter_by(
        property_id=property_id, nutzungsart=nutzungsart, etage=etage
    ).count()
    return count + 1


# ── Schemas ───────────────────────────────────────────────────────────────────

class AreaCreate(BaseModel):
    nutzungsart: str = "BUERO"
    etage: str = "EG"
    lage_qualitaet: Optional[str] = None
    name: Optional[str] = None           # if None → auto-generated
    area_sqm: Optional[float] = None
    market_rent_sqm: Optional[float] = None
    beds: Optional[int] = None
    status: str = "VERFUEGBAR"
    notes: Optional[str] = None


class AreaUpdate(BaseModel):
    nutzungsart: Optional[str] = None
    etage: Optional[str] = None
    lage_qualitaet: Optional[str] = None
    name: Optional[str] = None
    area_sqm: Optional[float] = None
    market_rent_sqm: Optional[float] = None
    beds: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/parse-maps-url")
async def parse_maps_url(url: str):
    """
    Löst einen Google Maps Link auf und extrahiert Adresse, PLZ und Stadt.
    Unterstützt Kurzlinks (maps.app.goo.gl) und Standard-URLs.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "de-DE,de;q=0.9",
    }

    resolved_url = url
    # Kurzlinks auflösen (maps.app.goo.gl oder goo.gl)
    if "goo.gl" in url or "maps.app.goo" in url:
        try:
            async with httpx.AsyncClient(headers=headers, timeout=8, follow_redirects=True) as client:
                resp = await client.get(url)
                resolved_url = str(resp.url)
        except Exception:
            return {"error": "Kurzlink konnte nicht aufgelöst werden", "address": "", "city": "", "zip_code": ""}

    # Adresse aus URL extrahieren
    address_raw = ""
    parsed = _urlparse(resolved_url)

    # Format 1: /maps/place/ADDRESS/@lat,lng
    place_match = _re.search(r"/maps/place/([^/@?]+)", parsed.path)
    if place_match:
        from urllib.parse import unquote_plus
        address_raw = unquote_plus(place_match.group(1))

    # Format 2: ?q=ADDRESS
    if not address_raw:
        qs = _parse_qs(parsed.query)
        q = qs.get("q", qs.get("query", []))[0] if (qs.get("q") or qs.get("query")) else ""
        if q:
            from urllib.parse import unquote_plus
            address_raw = unquote_plus(q)

    if not address_raw:
        return {"error": "Adresse nicht gefunden im Link", "address": "", "city": "", "zip_code": ""}

    # Bereinigen
    address_raw = address_raw.strip().rstrip("/")
    # "Deutschland" / "Germany" am Ende entfernen
    address_raw = _re.sub(r",?\s*(Deutschland|Germany)\s*$", "", address_raw, flags=_re.IGNORECASE).strip()

    # Teile aufsplitten: "Musterstraße 1, 10115 Berlin" oder "Musterstraße 1, Berlin"
    parts = [p.strip() for p in address_raw.split(",") if p.strip()]
    street = parts[0] if parts else ""
    zip_city_part = parts[1] if len(parts) > 1 else ""

    zip_code = ""
    city = ""
    zip_match = _re.match(r"^(\d{5})\s+(.+)$", zip_city_part)
    if zip_match:
        zip_code = zip_match.group(1)
        city = zip_match.group(2).strip()
    else:
        city = zip_city_part

    # Falls kein street (nur Ortsname), versuche Nominatim-Geocoding
    if not _re.search(r"\d", street) and not city:
        # Der ganze string ist wohl ein Ortsname → als city verwenden
        city = street
        street = ""

    # Falls Straße eine Hausnummer hat aber keine PLZ → Nominatim für PLZ fragen
    if street and not zip_code:
        try:
            query = address_raw
            nom_headers = {"User-Agent": "REAnalystPro/1.0", "Accept": "application/json"}
            async with httpx.AsyncClient(headers=nom_headers, timeout=6) as client:
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": query, "format": "json", "limit": 1, "countrycodes": "de", "addressdetails": 1}
                )
            data = resp.json()
            if data:
                addr = data[0].get("address", {})
                zip_code = addr.get("postcode", "")
                city = addr.get("city") or addr.get("town") or addr.get("village") or city
                road = addr.get("road", "")
                house = addr.get("house_number", "")
                if road:
                    street = f"{road} {house}".strip() if house else road
        except Exception:
            pass

    return {
        "address": street,
        "city": city,
        "zip_code": zip_code,
        "raw": address_raw,
    }


@router.get("/geocode")
async def geocode(address: str):
    """Geocodiert eine Adresse via Nominatim und gibt lat/lng zurück."""
    headers = {"User-Agent": "REAnalystPro/1.0", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=8) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "de"}
            )
        data = resp.json()
        if data:
            return {"lat": float(data[0]["lat"]), "lng": float(data[0]["lon"])}
    except Exception:
        pass
    return {"lat": None, "lng": None}


@router.get("/gif-types")
def gif_types():
    """Return gif Nutzungsarten, Etagen und Lagequalitäten für Dropdowns."""
    return {
        "nutzungsarten": [{"key": k, "label": v} for k, v in GIF_NUTZUNGSARTEN.items()],
        "etagen": [{"key": k, "label": v} for k, v in ETAGEN.items()],
        "lage_qualitaeten": [{"key": k, "label": v} for k, v in LAGE_QUALITAETEN.items()],
        "status_optionen": [{"key": k, "label": v} for k, v in AREA_STATUS.items()],
    }


@router.get("/area-rent")
def area_rent(
    nutzungsart: str,
    city: str,
    area_sqm: float = 200.0,
    lage_qualitaet: Optional[str] = None,
):
    """
    Schätze Marktmiete €/m²/Monat nach gif-Nutzungsart, Stadt und Fläche.
    Quellen: gif, JLL, CBRE, BNP Paribas (Richtwerte 2024).
    """
    from ..services.market_data import get_market_data

    prop_type = _NUTZUNGSART_TO_PROPTYPE.get(nutzungsart, "OFFICE")
    md = get_market_data(city=city, property_type=prop_type, area_sqm=area_sqm)
    rent = md.get("market_rent", {})

    base_avg = rent.get("avg_per_sqm", 12.0)
    base_min = rent.get("min_per_sqm", base_avg * 0.7)
    base_max = rent.get("prime_per_sqm", base_avg * 1.5)

    # Lagequalität nur für Einzelhandel
    lage_f = _LAGE_FAKTOR.get(lage_qualitaet or "", 1.0) if nutzungsart == "EINZELHANDEL" else 1.0
    # Nutzungsart-spezifischer Faktor
    ntz_f = _NUTZUNGSART_FAKTOR.get(nutzungsart, 1.0)
    # Größenrabatt
    size_f = _size_factor(area_sqm)

    factor = lage_f * ntz_f * size_f

    return {
        "nutzungsart": nutzungsart,
        "nutzungsart_label": GIF_NUTZUNGSARTEN.get(nutzungsart, nutzungsart),
        "lage_qualitaet": lage_qualitaet,
        "city": city,
        "area_sqm": area_sqm,
        "rent_min": round(base_min * factor, 2),
        "rent_avg": round(base_avg * factor, 2),
        "rent_max": round(base_max * factor, 2),
        "source": "gif MF/G 2017, JLL, CBRE, BNP Paribas – Richtwerte 2024",
    }


@router.get("/properties/{property_id}/areas/osm-estimate")
async def osm_building_estimate(property_id: int, db: Session = Depends(get_db)):
    """
    Schätze Gebäudefläche und Grundstücksfläche über OpenStreetMap.
    Geocodierung (Nominatim) → Overpass Gebäudepolygon → Shoelace-Formel.
    Nur Vorschlagswerte – müssen vom User bestätigt werden.
    """
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(404, "Objekt nicht gefunden")

    address = f"{prop.address or ''}, {prop.zip_code or ''} {prop.city or ''}, Deutschland".strip(", ")
    if len(address) < 10:
        return {"error": "Keine Adresse hinterlegt", "estimate": None}

    # 1. Geocode – erst mit voller Adresse, dann nur PLZ+Stadt als Fallback
    nom_url = "https://nominatim.openstreetmap.org/search"
    headers = {"User-Agent": "REAnalystPro/1.0", "Accept": "application/json"}
    lat, lng = None, None
    for query in [address, f"{prop.zip_code or ''} {prop.city or ''}".strip()]:
        if not query or len(query) < 4:
            continue
        try:
            async with httpx.AsyncClient(headers=headers, timeout=8) as client:
                resp = await client.get(nom_url, params={"q": query, "format": "json", "limit": 3, "countrycodes": "de", "addressdetails": 1})
            data = resp.json()
            if data:
                lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
                break
        except Exception:
            pass

    if lat is None:
        return {"error": "Adresse konnte nicht geocodiert werden", "estimate": None}

    # 2. Overpass: Gebäude in 300m-Radius (single call, nur ways mit geometry)
    overpass_q = f"""
[out:json][timeout:20];
way["building"](around:300,{lat},{lng});
out geom;
""".strip()
    elements = []
    try:
        async with httpx.AsyncClient(timeout=22) as client:
            resp = await client.post("https://overpass-api.de/api/interpreter", data={"data": overpass_q})
        elements = resp.json().get("elements", [])
    except Exception:
        pass

    if not elements:
        return {"error": "Kein Gebäude in OpenStreetMap an dieser Adresse gefunden", "estimate": None, "lat": lat, "lng": lng}

    # 3. Größtes Gebäude wählen + Fläche berechnen
    def _area_sqm(coords: list) -> float:
        if len(coords) < 3:
            return 0
        lat0 = coords[0]["lat"]
        mpl = 111320.0
        mlg = 111320.0 * math.cos(math.radians(lat0))
        pts = [(c["lon"] * mlg, c["lat"] * mpl) for c in coords]
        n = len(pts)
        s = sum(pts[i][0] * pts[(i+1) % n][1] - pts[(i+1) % n][0] * pts[i][1] for i in range(n))
        return abs(s) / 2

    def _centroid(coords: list) -> tuple:
        lats = [c["lat"] for c in coords]
        lons = [c["lon"] for c in coords]
        return sum(lats) / len(lats), sum(lons) / len(lons)

    # Nächstes Gebäude zum Geocode-Punkt wählen (nicht das größte)
    best_footprint, best_tags, best_dist = 0.0, {}, float("inf")
    for el in elements:
        geom = el.get("geometry", [])
        if not geom:
            continue
        clat, clng = _centroid(geom)
        dist = math.hypot((clat - lat) * 111320, (clng - lng) * 111320 * math.cos(math.radians(lat)))
        if dist < best_dist:
            best_dist = dist
            best_footprint = _area_sqm(geom)
            best_tags = el.get("tags", {})

    floors = int(best_tags.get("building:levels", prop.floors or 3))
    gfa = best_footprint * floors
    land = best_footprint * 1.25   # Grundstück ≈ Footprint + Außenanlagen

    return {
        "estimate": {
            "footprint_sqm": round(best_footprint),
            "floors": floors,
            "estimated_gfa_sqm": round(gfa),
            "estimated_land_sqm": round(land),
            "building_type": best_tags.get("building", ""),
            "building_name": best_tags.get("name", ""),
        },
        "lat": lat,
        "lng": lng,
        "source": "OpenStreetMap / Overpass API – nur Richtwerte",
    }


@router.get("/properties/{property_id}/areas")
def list_areas(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(404, "Objekt nicht gefunden")
    areas = db.query(RentalArea).filter_by(property_id=property_id).all()
    return [_area_dict(a) for a in areas]


@router.post("/properties/{property_id}/areas")
def create_area(property_id: int, data: AreaCreate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(404, "Objekt nicht gefunden")

    seq = _next_seq(db, property_id, data.nutzungsart, data.etage)
    name = data.name or _auto_name(data.nutzungsart, data.etage, data.lage_qualitaet, seq)

    area = RentalArea(
        property_id=property_id,
        nutzungsart=data.nutzungsart,
        etage=data.etage,
        lage_qualitaet=data.lage_qualitaet,
        name=name,
        area_sqm=data.area_sqm,
        market_rent_sqm=data.market_rent_sqm,
        beds=data.beds,
        status=data.status,
        notes=data.notes,
    )
    db.add(area)
    db.commit()
    db.refresh(area)
    return _area_dict(area)


@router.patch("/properties/{property_id}/areas/{area_id}")
def update_area(property_id: int, area_id: int, data: AreaUpdate, db: Session = Depends(get_db)):
    area = db.query(RentalArea).filter_by(id=area_id, property_id=property_id).first()
    if not area:
        raise HTTPException(404, "Fläche nicht gefunden")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(area, field, value)

    # Regenerate name if key fields changed but name not explicitly provided
    if data.name is None and any(f in data.model_dump(exclude_unset=True) for f in ["nutzungsart", "etage", "lage_qualitaet"]):
        seq = _next_seq(db, property_id, area.nutzungsart, area.etage)
        area.name = _auto_name(area.nutzungsart, area.etage, area.lage_qualitaet, max(1, seq - 1))

    db.commit()
    db.refresh(area)
    return _area_dict(area)


@router.delete("/properties/{property_id}/areas/{area_id}")
def delete_area(property_id: int, area_id: int, db: Session = Depends(get_db)):
    area = db.query(RentalArea).filter_by(id=area_id, property_id=property_id).first()
    if not area:
        raise HTTPException(404, "Fläche nicht gefunden")
    db.delete(area)
    db.commit()
    return {"ok": True}


# ── Healthcare Research ────────────────────────────────────────────────────────

_HEALTHCARE_DATA = {
    "PFLEGEHEIM": {
        "label": "Pflegeheim",
        "yield_range": "5.0–6.5 %",
        "rent_range": "14–20 €/m²/Monat",
        "rent_per_bed_day": "80–140 €/Bett/Tag (Pflegesatz inkl. Unterkunft & Verpflegung)",
        "typical_lease": "20–25 Jahre (Doppel-Netto-Pacht)",
        "operators": ["Korian", "Alloheim", "Orpea/Emeis", "Caritas", "AWO", "Vitanas", "Charleston"],
        "mdk_quality": {
            "source": "MDS / Medizinischer Dienst – Qualitätsprüfung § 114 SGB XI",
            "grades": ["Sehr gut", "Gut", "Befriedigend", "Ausreichend"],
            "url": "https://www.mds-ev.de/themen/pflegequalitaet.html",
            "transparenz_url": "https://www.pflegelotse.de",
            "note": "Seit 2019: Outcome-Indikatoren statt Schulnoten. Jährliche MDK-Prüfung. Ergebnisse öffentlich auf Pflegelotse.de / Weißer Liste.",
            "indicators": [
                "Dekubitusprophylaxe & Wundversorgung",
                "Sturzprophylaxe & Schmerzmanagement",
                "Medikamentengabe & Dokumentation",
                "Pflege bei Demenz & Freiheitsentzug",
                "Soziale Betreuung & Aktivierung",
                "Hygiene & Infektionsschutz",
            ],
            "live_search": True,
        },
        "regulation": "SGB XI, Heimrecht/WTG (länderspezifisch), PpUGV (Pflegepersonaluntergrenzen), PUEG 2023",
        "risk_factors": [
            "Fachkräftemangel → steigende Personalkosten",
            "Refinanzierungsrisiko bei Pflegekassensätzen",
            "MDK-Prüfungsergebnisse beeinflussen Belegung direkt",
            "Energiekosten: ~150–250 kWh/m²/a",
            "Betreiberwechsel: Zulassungsübertragung komplex",
        ],
        "market_trends": "Demografischer Wachstumsmarkt; Leerstand <3 % in Ballungsräumen; ESG-Druck bei Bestand; Neubau mit erhöhten Anforderungen (Einzelzimmerquote >80 %)",
    },
    "ALTENHEIM": {
        "label": "Alten-/Seniorenheim",
        "yield_range": "4.8–6.2 %",
        "rent_range": "13–18 €/m²/Monat",
        "rent_per_bed_day": "60–110 €/Bett/Tag",
        "typical_lease": "15–20 Jahre",
        "operators": ["Korian", "Alloheim", "Tertianum", "Augustinum", "Diakonie", "DRK"],
        "mdk_quality": {
            "source": "MDS Qualitätsbericht (sofern SGB XI-Zulassung)",
            "url": "https://www.mds-ev.de",
            "note": "Betrifft stationäre Altenpflege mit Pflegezulassung. Reine Seniorenwohnanlagen ohne Pflegezulassung unterliegen nur Heimrecht.",
            "live_search": False,
        },
        "regulation": "SGB XI (falls Pflegezulassung), Heimrecht/WTG, DIN 18040 (Barrierefreiheit)",
        "risk_factors": [
            "Unterschied Senioren-Wohnen vs. vollstationär: andere Zulassungspflichten",
            "Leerstandsrisiko bei Standorten außerhalb Ballungsräume",
        ],
        "market_trends": "Betreutes Wohnen wächst schneller als Vollpflege; Hybridkonzepte (Pflege + Wohnen) im Trend",
    },
    "BETREUTES_WOHNEN": {
        "label": "Betreutes Wohnen",
        "yield_range": "3.8–5.0 %",
        "rent_range": "10–16 €/m²/Monat (Kaltmiete) + Servicepauschale",
        "rent_per_bed_day": "n/a (Mietmodell, kein Pflegesatz)",
        "typical_lease": "Unbefristet (Wohnmietrecht) oder 5–10 Jahre",
        "operators": ["Vitanas", "Terragon", "KWA", "Johanniter", "Volkssolidarität"],
        "mdk_quality": {
            "source": "Kein MDK – Heimrecht nur bei amb. Pflege-WG",
            "note": "Betreutes Wohnen unterliegt i.d.R. nicht der MDK-Prüfpflicht. Qualitätskontrolle über Heimrecht nur wenn gleichzeitig Pflegedienstleistungen erbracht werden.",
            "live_search": False,
        },
        "regulation": "Wohnraummietrecht (BGB), Serviceverträge getrennt vom Mietvertrag, ggf. WTG bei Pflegedienst",
        "risk_factors": [
            "Mieterschutz erschwert Repositionierung",
            "Servicepauschale nicht indexierbar wie Gewerbemiete",
        ],
        "market_trends": "Stärkstes Nachfragewachstum im Senior-Living-Segment; großes institutionelles Interesse",
    },
    "KRANKENHAUS": {
        "label": "Krankenhaus / Klinik",
        "yield_range": "4.5–5.8 %",
        "rent_range": "10–18 €/m²/Monat (Bestandsmietäquivalent)",
        "rent_per_bed_day": "300–900 €/Bett/Tag (DRG-Erlös, nicht Miete)",
        "typical_lease": "Sondernutzung; oft kommunales Eigentum oder Erbpacht",
        "operators": ["Helios", "Asklepios", "Sana", "Rhön", "Unikliniken (öffentlich)"],
        "mdk_quality": {
            "source": "G-BA Qualitätsbericht / IQTIG (§ 136b SGB V)",
            "url": "https://www.g-ba.de/themen/qualitaetssicherung/",
            "note": "Krankenhäuser veröffentlichen alle 2 Jahre strukturierten Qualitätsbericht. Prüfung durch IQTIG. Mindestmengen für komplexe Eingriffe vorgeschrieben.",
            "indicators": [
                "Fallzahlen je Indikation (Mindestmengen § 136b SGB V)",
                "Komplikationsraten (QSKH-RL)",
                "Hygieneindikatoren (CDAD, MRSA)",
                "Patientenzufriedenheit (PEQ)",
                "Strukturqualität (Fachärzte, Geräte)",
            ],
            "live_search": False,
        },
        "regulation": "KHG, DRG-System (InEK), KHSG 2016, Krankenhausreform 2024 (Vorhaltefinanzierung + Leistungsgruppen)",
        "risk_factors": [
            "Reform 2024: Leistungsgruppen ersetzen Fallpauschalen → Standortunsicherheit",
            "Investitionsstau >70 Mrd. € bundesweit",
            "Energieintensiv: 200–300 kWh/m²/a",
            "Öffentliche Träger dominieren → begrenzte Investoreninteressen",
        ],
        "market_trends": "Konsolidierung; ~25 % Schließungen bis 2030 erwartet; Spezialkliniken attraktiver als Allgemeinhäuser",
    },
    "AERZTEHAUS": {
        "label": "Ärztehaus",
        "yield_range": "4.5–5.5 %",
        "rent_range": "14–22 €/m²/Monat",
        "typical_lease": "5–10 Jahre (Einzelpraxis), 10–15 Jahre (BAG/MVZ)",
        "operators": ["Einzelarztpraxen", "BAG (Berufsausübungsgemeinschaft)", "MVZ-Betreiber"],
        "mdk_quality": {
            "source": "KBV Qualitätssicherung / Ärztekammern (§ 135a SGB V)",
            "url": "https://www.kbv.de/html/qualitaet.php",
            "note": "Niedergelassene Ärzte unterliegen KV-Qualitätssicherung. Pflicht-QM: QEP, EPA oder KTQ je nach Fachgruppe.",
            "live_search": False,
        },
        "regulation": "KV-Zulassungsrecht, MBO-Ä, DSGVO (Praxis-DSFA), Barrierefreiheit DIN 18040",
        "risk_factors": [
            "Einzelarztpraxis: Mietausfall bei Praxisaufgabe/Tod",
            "Zulassung nicht automatisch übertragbar → Nachmietersuche komplex",
            "Umbaukosten bei Mieterwechsel",
        ],
        "market_trends": "Nachfrage steigt durch Ärztemangel; BAG & MVZ als Wachstumssegment; ESG bei Neubauten",
    },
    "MVZ": {
        "label": "Medizinisches Versorgungszentrum (MVZ)",
        "yield_range": "4.2–5.2 %",
        "rent_range": "16–25 €/m²/Monat",
        "typical_lease": "10–15 Jahre (oft mit Verlängerungsoption)",
        "operators": ["Primacare", "Heartbeat Medical", "MedKonzept", "Helios MVZ", "KKH", "Klinikträger-MVZ"],
        "mdk_quality": {
            "source": "KV-Qualitätssicherung + G-BA sektorenübergreifend",
            "url": "https://www.g-ba.de",
            "note": "MVZ unterliegt denselben QS-Maßnahmen wie Praxen (§ 135a SGB V) plus ggf. sektorenübergreifenden G-BA-QS-Richtlinien.",
            "indicators": [
                "Facharztstellen-Besetzung",
                "Abrechnungskonformität (KV-Prüfung)",
                "Hygieneplan",
                "Notfallversorgung (sofern Zulassung)",
            ],
            "live_search": False,
        },
        "regulation": "§ 95 SGB V (MVZ-Gründungsrecht), GmbH-Recht, KV-Zulassung, § 95 Abs. 1a SGB V (Investorenbeschränkungen)",
        "risk_factors": [
            "Trägerwechsel möglich → Mieterbonitäts-Due-Diligence kritisch",
            "Investorengeführte MVZ unter reg. Druck",
            "Abhängigkeit von KV-Zulassung und Sitz-Übertragung",
        ],
        "market_trends": "Stärkstes Wachstum im Gesundheitsimmobilien-Segment; Private-Equity-Konsolidierung; Standorte nahe Krankenhäuser bevorzugt",
    },
}


@router.get("/healthcare-research/{nutzungsart}")
def get_healthcare_research(nutzungsart: str):
    """Branchenspezifische Research-Daten für Gesundheitsimmobilien."""
    data = _HEALTHCARE_DATA.get(nutzungsart.upper())
    if not data:
        raise HTTPException(404, f"Keine Daten für Nutzungsart '{nutzungsart}'")
    return data


@router.get("/healthcare-research")
def list_healthcare_research():
    """Alle verfügbaren Gesundheits-Nutzungsarten mit Research."""
    return {k: {"label": v["label"], "yield_range": v["yield_range"]} for k, v in _HEALTHCARE_DATA.items()}


@router.get("/mdk-search")
async def mdk_quality_search(name: str, city: str = ""):
    """
    Sucht MDK-Qualitätsdaten für ein Pflegeheim via Pflegelotse / MDS.
    Gibt verfügbare öffentliche Qualitätsinformationen zurück.
    """
    query = f"{name} {city}".strip()
    results = []

    # Pflegelotse.de – öffentliche Suchfunktion
    try:
        headers = {
            "User-Agent": "REAnalystPro/1.0 (healthcare research tool)",
            "Accept": "application/json, text/html",
        }
        async with httpx.AsyncClient(headers=headers, timeout=10, follow_redirects=True) as client:
            # Try Pflegelotse search API
            resp = await client.get(
                "https://www.weisse-liste.de/de/pflegeheime/suche/",
                params={"q": query, "format": "json"},
            )
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    for item in (data.get("results") or data.get("items") or [])[:5]:
                        results.append({
                            "name": item.get("name", ""),
                            "address": item.get("address", ""),
                            "rating": item.get("rating") or item.get("quality_score"),
                            "source": "Weiße Liste",
                        })
                except Exception:
                    pass
    except Exception:
        pass

    return {
        "query": query,
        "results": results,
        "sources": [
            {"name": "Pflegelotse (Verbraucherzentrale)", "url": "https://www.pflegelotse.de/"},
            {"name": "Weiße Liste", "url": "https://www.weisse-liste.de/de/pflegeheime/suche/"},
            {"name": "MDS Pflegequalität", "url": "https://www.mds-ev.de/themen/pflegequalitaet.html"},
            {"name": "Heimverzeichnis.de", "url": f"https://www.heimverzeichnis.de/?search={query.replace(' ', '+')}"},
        ],
        "note": "Direkte MDK-Berichte sind nicht öffentlich als API verfügbar. Klicke auf die Quellen für die aktuellen Prüfberichte.",
    }

