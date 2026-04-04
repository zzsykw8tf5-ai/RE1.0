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

# ── gif Nutzungsart → Property-Typ Mapping für Marktmietdaten ─────────────────
_NUTZUNGSART_TO_PROPTYPE = {
    "BUERO":        "OFFICE",
    "EINZELHANDEL": "RETAIL",
    "LAGER":        "INDUSTRIAL",
    "PRODUKTION":   "INDUSTRIAL",
    "GASTRONOMIE":  "RETAIL",
    "PRAXIS":       "OFFICE",
    "WOHNEN":       "RESIDENTIAL",
    "HOTEL":        "RETAIL",
    # Gesundheit → OFFICE als Basis für Marktdaten
    "PFLEGEHEIM":   "OFFICE",
    "ALTENHEIM":    "OFFICE",
    "KRANKENHAUS":  "OFFICE",
    "AERZTEHAUS":   "OFFICE",
    "MVZ":          "OFFICE",
    "SONSTIGES":    "MIXED",
}

# Anpassungsfaktoren Lagequalität (Einzelhandel)
_LAGE_FAKTOR = {"1A": 1.6, "1B": 0.85, "NEBEN": 0.45}

# Anpassungsfaktoren Nutzungsart (abweichend vom Basis-Typ)
_NUTZUNGSART_FAKTOR = {
    "PRODUKTION":  0.80,   # Produktion etwas günstiger als Standard-Lager
    "GASTRONOMIE": 0.90,   # Gastronomie unter Prime-Retail
    "PRAXIS":      1.15,   # Praxis/Medizin Premium über Standard-Büro
    "HOTEL":       0.70,   # Hotel: Mietäquivalent niedriger (andere Struktur)
    # Gesundheitsimmobilien (Nettokaltmiete €/m²/Monat, Basis CBRE/JLL DE 2023)
    "PFLEGEHEIM":  1.20,   # Pflegeheime: ~14-18 €/m² Pacht-Äquivalent
    "ALTENHEIM":   1.10,   # Seniorenheime: ~13-17 €/m²
    "KRANKENHAUS": 0.95,   # Krankenhäuser: oft Sonderpacht/ÖD-Verträge
    "AERZTEHAUS":  1.25,   # Ärztehäuser: Premium über Standard-Büro
    "MVZ":         1.30,   # MVZ: höchste Rendite, knappe Flächen
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
        "PFLEGEHEIM": "Pflege", "ALTENHEIM": "Alten", "KRANKENHAUS": "Klinik",
        "AERZTEHAUS": "Arzt", "MVZ": "MVZ",
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
        "beds": a.beds,
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

    # 1. Geocode
    nom_url = "https://nominatim.openstreetmap.org/search"
    headers = {"User-Agent": "REAnalystPro/1.0", "Accept": "application/json"}
    lat, lng = None, None
    try:
        async with httpx.AsyncClient(headers=headers, timeout=6) as client:
            resp = await client.get(nom_url, params={"q": address, "format": "json", "limit": 1, "countrycodes": "de"})
        data = resp.json()
        if data:
            lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass

    if lat is None:
        return {"error": "Adresse konnte nicht geocodiert werden", "estimate": None}

    # 2. Overpass: Gebäude in 80m-Radius
    overpass_q = f"""
[out:json][timeout:12];
(
  way["building"](around:80,{lat},{lng});
  relation["building:part"](around:80,{lat},{lng});
);
out geom;
""".strip()
    elements = []
    try:
        async with httpx.AsyncClient(timeout=14) as client:
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

    best_footprint, best_tags = 0.0, {}
    for el in elements:
        geom = el.get("geometry", [])
        if geom:
            a = _area_sqm(geom)
            if a > best_footprint:
                best_footprint = a
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
        "rent_per_bed_day": "80–140 €/Bett/Tag (Pflegesatz)",
        "typical_lease": "20–25 Jahre (Doppel-Netto)",
        "operators": ["Korian", "Alloheim", "Orpea/Emeis", "Caritas", "AWO", "Vitanas"],
        "mdk_quality": {
            "source": "MDS / MDK-Qualitätsprüfung",
            "grades": ["Sehr gut", "Gut", "Befriedigend", "Ausreichend"],
            "url": "https://www.mds-ev.de/themen/pflegequalitaet.html",
            "note": "Jährliche MDK-Prüfung. Noten ab 2019 durch Pflegegradmatrix ersetzt (Outcome-Indikatoren).",
            "indicators": [
                "Dekubitusprophylaxe", "Sturz-/Schmerzmanagement",
                "Medikamentengabe", "Pflege bei Demenz",
                "Soziale Betreuung", "Hauswirtschaft",
            ],
        },
        "regulation": "SGB XI (Pflegeversicherung), Heimrecht (länderspezifisch, z.B. WTG NRW), Pflegepersonaluntergrenzen-Verordnung (PpUGV)",
        "risk_factors": [
            "Fachkräftemangel erhöht Betriebskosten",
            "Refinanzierungsrisiko bei Pflegekassensätzen",
            "MDK-Prüfungsergebnisse beeinflussen Belegung",
            "Energiekosten (hoher Verbrauch je Bett)",
        ],
        "market_trends": "Wachstumsmarkt durch Demografie; Leerstand <3 % in Ballungsräumen; Investitionsdruck durch ESG-Anforderungen",
    },
    "ALTENHEIM": {
        "label": "Alten-/Seniorenheim",
        "yield_range": "4.8–6.2 %",
        "rent_range": "13–18 €/m²/Monat",
        "rent_per_bed_day": "60–110 €/Bett/Tag",
        "typical_lease": "15–20 Jahre",
        "operators": ["Korian", "Alloheim", "Tertianum", "Augustinum", "Diakonie"],
        "mdk_quality": {
            "source": "MDS Qualitätsbericht",
            "note": "Betrifft stationäre Altenpflege mit SGB XI-Zulassung; ohne Zulassung nur Heimrecht.",
            "url": "https://www.mds-ev.de",
        },
        "regulation": "SGB XI (falls Pflegezulassung), Heimrecht/WTG, Bauordnungsrecht (Barrierefreiheit DIN 18040)",
        "risk_factors": [
            "Unterschied Senioren-Wohnen vs. vollstationär: unterschiedliche Zulassungspflichten",
            "Mietwohnrecht vs. Pachtrecht je nach Betriebsmodell",
        ],
        "market_trends": "Betreutes Wohnen wächst schneller als Vollpflege; Hybridkonzepte gefragt",
    },
    "KRANKENHAUS": {
        "label": "Krankenhaus / Klinik",
        "yield_range": "4.5–5.8 %",
        "rent_range": "10–18 €/m²/Monat (Bestandsmietäquivalent)",
        "rent_per_bed_day": "300–900 €/Bett/Tag (DRG-Erlös, nicht Miete)",
        "typical_lease": "Sondernutzung; oft kommunales Eigentum oder Erbpacht",
        "operators": ["Helios", "Asklepios", "Sana", "Rhön", "Unikliniken (öffentlich)"],
        "mdk_quality": {
            "source": "G-BA Qualitätsbericht / IQTIG",
            "note": "Krankenhäuser veröffentlichen alle 2 Jahre strukturierten Qualitätsbericht (§ 136b SGB V). Prüfung durch IQTIG (Institut für Qualitätssicherung und Transparenz).",
            "url": "https://www.g-ba.de/themen/qualitaetssicherung/",
            "indicators": [
                "Fallzahlen je Indikation (Mindestmengen)",
                "Komplikationsraten (QSKH)",
                "Hygieneindikatoren",
                "Patientenzufriedenheit (PEQ)",
            ],
        },
        "regulation": "KHG (Krankenhausfinanzierungsgesetz), DRG-System (InEK), Krankenhausstrukturgesetz (KHSG 2016), Krankenhausreform 2024 (Vorhaltefinanzierung)",
        "risk_factors": [
            "Reform 2024: Leistungsgruppen ersetzen Fallpauschalen → Standortunsicherheit",
            "Hoher Investitionsstau (Sanierungsbedarf >70 Mrd. €)",
            "Energieintensiv (ca. 200–300 kWh/m²/a)",
            "Öffentliche Träger dominieren → begrenzte Investoreninteressen",
        ],
        "market_trends": "Konsolidierung; Schließung von ~25 % der Krankenhäuser bis 2030 erwartet; Spezialkliniken attraktiver als Allgemeinhäuser",
    },
    "AERZTEHAUS": {
        "label": "Ärztehaus",
        "yield_range": "4.5–5.5 %",
        "rent_range": "14–22 €/m²/Monat",
        "typical_lease": "5–10 Jahre (Einzelarztpraxis), 10–15 Jahre (BAG/MVZ)",
        "operators": ["Einzelarztpraxen", "Berufsausübungsgemeinschaften (BAG)", "MVZ-Betreiber"],
        "mdk_quality": {
            "source": "KBV Qualitätssicherung / Ärztekammern",
            "note": "Niedergelassene Ärzte unterliegen Qualitätssicherung der KV (§ 135a SGB V). Einzelne Fachgruppen haben QM-Zertifizierungspflicht (z.B. QEP, EPA, KTQ).",
            "url": "https://www.kbv.de/html/qualitaet.php",
        },
        "regulation": "Zulassung durch Kassenärztliche Vereinigung (KV), Ärztekammerrecht, MBO-Ä, Datenschutz (DSFA für Praxen), Barrierefreiheit",
        "risk_factors": [
            "Einzelarztpraxis: Mietausfall bei Aufgabe/Tod",
            "KV-Zulassungsrecht beeinflusst Nachmietersuche",
            "Umbaukosten bei Mieterwechsel (Praxen = individuell)",
        ],
        "market_trends": "Nachfrage steigt durch Ärztemangel → BAG und MVZ als Wachstumssegment; ESG-Anforderungen bei Neubauten",
    },
    "MVZ": {
        "label": "Medizinisches Versorgungszentrum (MVZ)",
        "yield_range": "4.2–5.2 %",
        "rent_range": "16–25 €/m²/Monat",
        "typical_lease": "10–15 Jahre (oft mit Verlängerungsoption)",
        "operators": ["Primacare", "Heartbeat Medical", "MedKonzept", "KKH", "Helios MVZ", "Klinikträger-MVZ"],
        "mdk_quality": {
            "source": "KV-Qualitätssicherung / G-BA",
            "note": "MVZ unterliegt denselben Qualitätssicherungsmaßnahmen wie Praxen (§ 135a SGB V) plus ggf. sektorenübergreifenden Qualitätssicherungsmaßnahmen des G-BA.",
            "url": "https://www.g-ba.de",
            "indicators": [
                "Facharztstellen-Besetzung",
                "Abrechnungskonformität (KV-Prüfung)",
                "Hygieneplan",
                "Notfallversorgung (sofern Zulassung)",
            ],
        },
        "regulation": "§ 95 SGB V (MVZ-Gründungsrecht), GmbH-Recht (häufige Rechtsform), Zulassung durch Zulassungsausschuss der KV",
        "risk_factors": [
            "Trägerwechsel möglich → Mieterbonitäts-Due-Diligence essenziell",
            "Investorengeführte MVZ unter regulatorischem Druck (§ 95 Abs. 1a SGB V)",
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
