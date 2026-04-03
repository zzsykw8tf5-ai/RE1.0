"""Upload and property management API."""
import io
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
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


@router.post("/upload/excel")
async def upload_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Parse an Excel file and store the property + tenants."""
    content = await file.read()
    try:
        prop_data = parse_property_master(content)
        tenant_data = parse_tenant_list(content)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Excel parsing error: {e}")

    # Create property
    prop = Property(**{k: v for k, v in prop_data.items() if k in Property.__table__.columns.keys()})
    db.add(prop)
    db.flush()

    # Create tenants
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


@router.get("/upload/template")
def download_template():
    """Return the standardized Excel template."""
    xlsx_bytes = create_excel_template()
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=RE_Analyst_Vorlage.xlsx"},
    )


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
