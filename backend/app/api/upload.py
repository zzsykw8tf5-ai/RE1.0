"""Upload and property management API."""
import io
import json
import re
import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.property import Property, Tenant
from ..services.excel_parser import (
    parse_property_master, parse_tenant_list, create_excel_template
)
from ..services.pdf_parser import parse_pdf

router = APIRouter(prefix="/api", tags=["upload"])


def _property_dict(p: Property) -> dict:
    d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
    if d.get("purchase_date"):
        d["purchase_date"] = str(d["purchase_date"])
    if d.get("created_at"):
        d["created_at"] = str(d["created_at"])
    if d.get("updated_at"):
        d["updated_at"] = str(d["updated_at"])
    return d


def _tenant_dict(t: Tenant) -> dict:
    d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
    for key in ("lease_start", "lease_end"):
        if d.get(key):
            d[key] = str(d[key])
    return d


def _map_immoscout_type(type_str: str) -> str:
    t = type_str.lower()
    if any(x in t for x in ["wohnung", "apartment", "etage", "residential"]):
        return "RESIDENTIAL"
    if any(x in t for x in ["büro", "office", "gewerbe", "commercial"]):
        return "OFFICE"
    if any(x in t for x in ["einzelhandel", "retail", "laden", "shop"]):
        return "RETAIL"
    if any(x in t for x in ["industrie", "lager", "logistik", "industrial"]):
        return "INDUSTRIAL"
    if any(x in t for x in ["gemischt", "mixed"]):
        return "MIXED"
    return "RESIDENTIAL"


@router.post("/upload/excel")
async def upload_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Parse an Excel file and store the property + tenants."""
    content = await file.read()
    try:
        prop_data = parse_property_master(content)
        tenant_data = parse_tenant_list(content)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Excel parsing error: {e}")

    prop = Property(**{k: v for k, v in prop_data.items() if k in Property.__table__.columns.keys()})
    db.add(prop)
    db.flush()

    for td in tenant_data:
        td["property_id"] = prop.id
        t = Tenant(**{k: v for k, v in td.items() if k in Tenant.__table__.columns.keys()})
        db.add(t)

    db.commit()
    db.refresh(prop)

    result = _property_dict(prop)
    result["tenants"] = [_tenant_dict(t) for t in db.query(Tenant).filter_by(property_id=prop.id).all()]
    return result


@router.post("/upload/pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Parse a PDF and return extracted data."""
    content = await file.read()
    try:
        data = parse_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF parsing error: {e}")
    return data


class ImmoScoutRequest(BaseModel):
    url: str


@router.post("/upload/immoscout")
async def import_from_immoscout(req: ImmoScoutRequest, db: Session = Depends(get_db)):
    """Fetch an ImmoScout24 listing URL and create a property from it."""
    url = req.url.strip()
    if not any(d in url for d in ["immoscout24.de", "immobilienscout24.de"]):
        raise HTTPException(status_code=400, detail="Bitte einen gültigen ImmoScout24-Link einfügen (immobilienscout24.de/expose/...)")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
    }

    try:
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=20) as client:
            resp = await client.get(url)
            if resp.status_code == 403:
                raise HTTPException(status_code=403, detail="ImmoScout24 blockiert automatische Anfragen. Bitte nutze den manuellen Import.")
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"ImmoScout24 antwortete mit Status {resp.status_code}")
            html = resp.text
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Zeitüberschreitung. ImmoScout24 hat nicht geantwortet.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Verbindungsfehler: {str(e)}")

    property_data: dict = {}

    # 1) Try __NEXT_DATA__ JSON (Next.js)
    next_match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html, re.DOTALL
    )
    if next_match:
        try:
            nd = json.loads(next_match.group(1))
            page_props = nd.get("props", {}).get("pageProps", {})
            expose = page_props.get("expose") or page_props.get("realEstate") or {}
            re_data = expose.get("realEstate", expose)

            addr = re_data.get("address", {})
            price_obj = re_data.get("price", {})

            property_data = {
                "name": re_data.get("title") or expose.get("title", "ImmoScout24 Objekt"),
                "address": f"{addr.get('street', '')} {addr.get('houseNumber', '')}".strip(),
                "city": addr.get("city", ""),
                "zip_code": str(addr.get("postcode", "")),
                "purchase_price": price_obj.get("value") or price_obj.get("nettoColdRent"),
                "total_area_sqm": (
                    re_data.get("livingSpace") or
                    re_data.get("totalFloorSpace") or
                    re_data.get("plotArea")
                ),
                "construction_year": re_data.get("yearConstructed") or re_data.get("constructionYear"),
                "units": re_data.get("numberOfRooms") or re_data.get("apartmentCount") or 1,
                "property_type": _map_immoscout_type(
                    str(re_data.get("type", {}).get("@id", ""))
                ),
            }
        except Exception:
            pass

    # 2) Fallback: JSON-LD
    if not property_data.get("name"):
        for ld_str in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL):
            try:
                ld = json.loads(ld_str)
                if isinstance(ld, list):
                    ld = ld[0] if ld else {}
                rtype = ld.get("@type", "")
                if rtype in ("Residence", "House", "Apartment", "RealEstateListing", "Product", "Offer"):
                    addr = ld.get("address", {})
                    floor_size = ld.get("floorSize", {})
                    property_data = {
                        "name": ld.get("name", "ImmoScout24 Objekt"),
                        "address": addr.get("streetAddress", ""),
                        "city": addr.get("addressLocality", ""),
                        "zip_code": addr.get("postalCode", ""),
                        "purchase_price": float(ld.get("price", 0)) or None,
                        "total_area_sqm": float(floor_size.get("value", 0)) or None,
                    }
                    break
            except Exception:
                continue

    # 3) Fallback: meta tags
    if not property_data.get("name"):
        title_m = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        price_m = re.search(r'<meta[^>]+product:price:amount[^>]+content="([^"]+)"', html)
        if title_m:
            property_data["name"] = title_m.group(1)
        if price_m:
            try:
                property_data["purchase_price"] = float(price_m.group(1).replace(".", "").replace(",", "."))
            except ValueError:
                pass

    if not property_data.get("name"):
        raise HTTPException(
            status_code=422,
            detail="Inserat-Daten konnten nicht extrahiert werden. ImmoScout24 blockiert möglicherweise Server-Anfragen. Bitte nutze den manuellen Excel-Import."
        )

    property_data.setdefault("name", "ImmoScout24 Objekt")
    property_data.setdefault("city", "")
    property_data.setdefault("property_type", "RESIDENTIAL")
    property_data.setdefault("units", 1)

    valid_cols = set(Property.__table__.columns.keys())
    prop = Property(**{k: v for k, v in property_data.items() if k in valid_cols and v is not None})
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return _property_dict(prop)


@router.get("/upload/template")
def download_template():
    """Return the standardized Excel template."""
    xlsx_bytes = create_excel_template()
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=RE_Analyst_Vorlage.xlsx"},
    )


class PropertyCreate(BaseModel):
    name: str
    address: str = ""
    city: str = ""
    zip_code: str = ""
    property_type: str = "RESIDENTIAL"
    construction_year: int | None = None
    total_area_sqm: float | None = None
    land_area_sqm: float | None = None
    floors: int | None = None
    units: int | None = None
    purchase_price: float | None = None
    purchase_date: str | None = None  # ISO date string "YYYY-MM-DD"


@router.post("/properties")
def create_property(data: PropertyCreate, db: Session = Depends(get_db)):
    """Create a property from manual form input."""
    from datetime import date as date_type
    raw = data.model_dump()
    # Parse purchase_date string to date object
    if raw.get("purchase_date"):
        try:
            raw["purchase_date"] = date_type.fromisoformat(raw["purchase_date"])
        except (ValueError, TypeError):
            raw["purchase_date"] = None
    valid_cols = set(Property.__table__.columns.keys())
    prop = Property(**{k: v for k, v in raw.items() if k in valid_cols and v is not None})
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return _property_dict(prop)


@router.get("/properties", response_model=List[dict])
def list_properties(db: Session = Depends(get_db)):
    props = db.query(Property).order_by(Property.created_at.desc()).all()
    return [_property_dict(p) for p in props]


@router.get("/properties/{property_id}")
def get_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    result = _property_dict(prop)
    result["tenants"] = [_tenant_dict(t) for t in db.query(Tenant).filter_by(property_id=property_id).all()]
    return result


@router.delete("/properties/{property_id}")
def delete_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    db.query(Tenant).filter_by(property_id=property_id).delete()
    db.delete(prop)
    db.commit()
    return {"ok": True}


class PropertyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    zip_code: str | None = None
    property_type: str | None = None
    construction_year: int | None = None
    total_area_sqm: float | None = None
    land_area_sqm: float | None = None
    floors: int | None = None
    units: int | None = None
    purchase_price: float | None = None
    purchase_date: str | None = None


@router.patch("/properties/{property_id}")
def update_property(property_id: int, data: PropertyUpdate, db: Session = Depends(get_db)):
    """Update an existing property's fields."""
    from datetime import date as date_type
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    raw = data.model_dump(exclude_unset=True)
    if "purchase_date" in raw:
        if raw["purchase_date"]:
            try:
                raw["purchase_date"] = date_type.fromisoformat(raw["purchase_date"])
            except (ValueError, TypeError):
                raw.pop("purchase_date")
        else:
            raw["purchase_date"] = None
    valid_cols = set(Property.__table__.columns.keys())
    for k, v in raw.items():
        if k in valid_cols:
            setattr(prop, k, v)
    db.commit()
    db.refresh(prop)
    result = _property_dict(prop)
    result["tenants"] = [_tenant_dict(t) for t in db.query(Tenant).filter_by(property_id=property_id).all()]
    return result


class TenantCreate(BaseModel):
    name: str
    unit: str = ""
    area_sqm: float | None = None
    monthly_rent: float | None = None
    lease_start: str | None = None
    lease_end: str | None = None
    tenant_type: str = "STANDARD"
    creditworthiness: str = "B"


@router.post("/properties/{property_id}/tenants")
def add_tenant(property_id: int, data: TenantCreate, db: Session = Depends(get_db)):
    """Add a tenant to a property."""
    from datetime import date as date_type
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    raw = data.model_dump()
    for key in ("lease_start", "lease_end"):
        if raw.get(key):
            try:
                raw[key] = date_type.fromisoformat(raw[key])
            except (ValueError, TypeError):
                raw[key] = None
    raw["property_id"] = property_id
    if raw.get("monthly_rent"):
        raw["annual_rent"] = round(raw["monthly_rent"] * 12, 2)
    valid_cols = set(Tenant.__table__.columns.keys())
    tenant = Tenant(**{k: v for k, v in raw.items() if k in valid_cols and v is not None})
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return _tenant_dict(tenant)


@router.patch("/properties/{property_id}/tenants/{tenant_id}")
def update_tenant(property_id: int, tenant_id: int, data: TenantCreate, db: Session = Depends(get_db)):
    """Update an existing tenant's fields."""
    from datetime import date as date_type
    tenant = db.query(Tenant).filter_by(id=tenant_id, property_id=property_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    raw = data.model_dump(exclude_unset=False)
    for key in ("lease_start", "lease_end"):
        if raw.get(key):
            try:
                raw[key] = date_type.fromisoformat(raw[key])
            except (ValueError, TypeError):
                raw[key] = None
    if raw.get("monthly_rent"):
        raw["annual_rent"] = round(raw["monthly_rent"] * 12, 2)
    valid_cols = set(Tenant.__table__.columns.keys())
    for k, v in raw.items():
        if k in valid_cols:
            setattr(tenant, k, v)
    db.commit()
    db.refresh(tenant)
    return _tenant_dict(tenant)


@router.delete("/properties/{property_id}/tenants/{tenant_id}")
def delete_tenant(property_id: int, tenant_id: int, db: Session = Depends(get_db)):
    """Remove a tenant from a property."""
    tenant = db.query(Tenant).filter_by(id=tenant_id, property_id=property_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    db.delete(tenant)
    db.commit()
    return {"ok": True}
