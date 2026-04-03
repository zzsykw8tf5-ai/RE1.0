"""Market data API – returns market rent, Bodenrichtwert and cost estimates."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.property import Property, Tenant
from ..services.market_data import get_market_data

router = APIRouter(prefix="/api", tags=["market"])


@router.get("/market-data")
def market_data(
    city: str,
    property_type: str = "OFFICE",
    area_sqm: Optional[float] = None,
    purchase_price: Optional[float] = None,
    construction_year: Optional[int] = None,
):
    """Return market data estimates for a city + property type."""
    if not city or len(city) < 2:
        raise HTTPException(status_code=400, detail="Bitte eine Stadt angeben.")
    return get_market_data(city, property_type, area_sqm, purchase_price, construction_year)


@router.get("/market-data/property/{property_id}")
def market_data_for_property(property_id: int, db: Session = Depends(get_db)):
    """Return market data pre-loaded for a specific property."""
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Objekt nicht gefunden.")
    return get_market_data(
        city=prop.city or "",
        property_type=prop.property_type or "OFFICE",
        area_sqm=prop.total_area_sqm,
        purchase_price=prop.purchase_price,
        construction_year=prop.construction_year,
    )


# ── Tenant management ─────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    name: str
    unit: Optional[str] = None
    area_sqm: Optional[float] = None
    monthly_rent: Optional[float] = None
    annual_rent: Optional[float] = None
    lease_start: Optional[str] = None
    lease_end: Optional[str] = None
    tenant_type: Optional[str] = "STANDARD"
    creditworthiness: Optional[str] = "B"


def _tenant_dict(t: Tenant) -> dict:
    d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
    for key in ("lease_start", "lease_end"):
        if d.get(key):
            d[key] = str(d[key])
    return d


@router.post("/properties/{property_id}/tenants")
def add_tenant(property_id: int, data: TenantCreate, db: Session = Depends(get_db)):
    """Add a tenant to a property."""
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Objekt nicht gefunden.")

    # Auto-calculate annual rent from monthly or vice versa
    monthly = data.monthly_rent
    annual = data.annual_rent
    if monthly and not annual:
        annual = monthly * 12
    elif annual and not monthly:
        monthly = annual / 12

    valid_cols = set(Tenant.__table__.columns.keys())
    tenant_data = {
        "property_id": property_id,
        "name": data.name,
        "unit": data.unit,
        "area_sqm": data.area_sqm,
        "monthly_rent": monthly,
        "annual_rent": annual,
        "tenant_type": data.tenant_type or "STANDARD",
        "creditworthiness": data.creditworthiness or "B",
    }

    # Parse date strings
    from datetime import date
    for date_field in ("lease_start", "lease_end"):
        val = getattr(data, date_field)
        if val:
            try:
                tenant_data[date_field] = date.fromisoformat(val)
            except ValueError:
                pass

    t = Tenant(**{k: v for k, v in tenant_data.items() if k in valid_cols and v is not None})
    db.add(t)
    db.commit()
    db.refresh(t)
    return _tenant_dict(t)


@router.delete("/properties/{property_id}/tenants/{tenant_id}")
def delete_tenant(property_id: int, tenant_id: int, db: Session = Depends(get_db)):
    t = db.query(Tenant).filter_by(id=tenant_id, property_id=property_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Mieter nicht gefunden.")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.put("/properties/{property_id}/tenants/{tenant_id}")
def update_tenant(property_id: int, tenant_id: int, data: TenantCreate, db: Session = Depends(get_db)):
    t = db.query(Tenant).filter_by(id=tenant_id, property_id=property_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Mieter nicht gefunden.")

    monthly = data.monthly_rent
    annual = data.annual_rent
    if monthly and not annual:
        annual = monthly * 12
    elif annual and not monthly:
        monthly = annual / 12

    if data.name:
        t.name = data.name
    if data.unit is not None:
        t.unit = data.unit
    if data.area_sqm is not None:
        t.area_sqm = data.area_sqm
    if monthly is not None:
        t.monthly_rent = monthly
    if annual is not None:
        t.annual_rent = annual
    if data.tenant_type:
        t.tenant_type = data.tenant_type
    if data.creditworthiness:
        t.creditworthiness = data.creditworthiness

    from datetime import date
    for date_field in ("lease_start", "lease_end"):
        val = getattr(data, date_field)
        if val:
            try:
                setattr(t, date_field, date.fromisoformat(val))
            except ValueError:
                pass

    db.commit()
    db.refresh(t)
    return _tenant_dict(t)
