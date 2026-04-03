"""Report generation API."""
import io
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.property import Property, Tenant
from ..services.report_generator import generate_report
from ..services.german_valuation import combined_valuation as de_valuation
from ..services.us_valuation import combined_us_valuation
from ..services.dcf_model import run_dcf
from ..services.location_analysis import analyze_location
from ..services.risk_model import calculate_property_risk

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{property_id}")
def get_report(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    tenants_db = db.query(Tenant).filter_by(property_id=property_id).all()
    tenants = []
    for t in tenants_db:
        d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        for key in ("lease_start", "lease_end"):
            if d.get(key):
                d[key] = str(d[key])
        tenants.append(d)

    prop_dict = {c.name: getattr(prop, c.name) for c in prop.__table__.columns}
    for key in ("purchase_date", "created_at", "updated_at"):
        if prop_dict.get(key):
            prop_dict[key] = str(prop_dict[key])

    annual_rent = sum(t.get("annual_rent", 0) for t in tenants) or prop.total_area_sqm * 15 * 12
    p = {
        "property_type": prop.property_type,
        "total_area_sqm": prop.total_area_sqm,
        "land_area_sqm": prop.land_area_sqm or prop.total_area_sqm * 0.5,
        "construction_year": prop.construction_year,
        "purchase_price": prop.purchase_price,
        "city": prop.city,
        "annual_rent": annual_rent,
    }

    dcf_result = run_dcf({**p, "initial_noi": annual_rent * 0.7})
    analysis_results = {
        "german_valuation": de_valuation(p),
        "us_valuation": combined_us_valuation(p),
        "dcf": dcf_result,
        "location": analyze_location({"city": prop.city, "zip_code": prop.zip_code, "address": prop.address, "property_type": prop.property_type}),
        "risk": calculate_property_risk(prop_dict, tenants, dcf_result),
    }

    pdf_bytes = generate_report(prop_dict, analysis_results)

    filename = f"RE_Report_{prop.name.replace(' ', '_')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
