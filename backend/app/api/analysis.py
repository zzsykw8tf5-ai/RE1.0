"""Analysis endpoints – converts property data to valuation service params."""
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.property import Property, Tenant, Scenario
from ..services.german_valuation import combined_valuation as _de_valuation
from ..services.us_valuation import combined_us_valuation as _us_valuation
from ..services.dcf_model import run_dcf as _run_dcf
from ..services.location_analysis import analyze_location as _location
from ..services.risk_model import calculate_property_risk as _risk

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# ---- City land values (€/m²) for Bodenwert estimation ----
CITY_BODENRICHTWERT = {
    "münchen": 2500, "munich": 2500,
    "frankfurt": 1800, "frankfurt am main": 1800,
    "berlin": 1200,
    "hamburg": 1100,
    "stuttgart": 1000,
    "düsseldorf": 900, "dusseldorf": 900,
    "köln": 800, "cologne": 800, "koeln": 800,
    "nürnberg": 600, "nuremberg": 600,
    "leipzig": 500,
    "dresden": 450,
    "hannover": 500,
    "bremen": 450,
    "potsdam": 700,
}

CITY_VERGLEICHSPREISE = {
    "münchen": [5500, 6200, 5800, 6000],
    "frankfurt": [4000, 4500, 4200, 3900],
    "berlin": [3500, 4000, 3700, 3600],
    "hamburg": [3200, 3600, 3400, 3300],
    "stuttgart": [3000, 3400, 3200, 3100],
    "düsseldorf": [2800, 3200, 3000, 2900],
    "köln": [2700, 3100, 2900, 2800],
}


def _get_bodenrichtwert(city: str, land_area_sqm: float) -> float:
    boden_per_sqm = CITY_BODENRICHTWERT.get(city.lower(), 400)
    return boden_per_sqm * land_area_sqm


def _get_vergleichspreise(city: str) -> list:
    return CITY_VERGLEICHSPREISE.get(city.lower(), [2500, 2800, 2650, 2600])


def _get_property_or_404(property_id: int, db: Session) -> Property:
    p = db.query(Property).filter_by(id=property_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Property not found")
    return p


def _tenants_list(property_id: int, db: Session) -> list:
    tenants = db.query(Tenant).filter_by(property_id=property_id).all()
    result = []
    for t in tenants:
        d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        for key in ("lease_start", "lease_end"):
            if d.get(key):
                d[key] = str(d[key])
        result.append(d)
    return result


def _prop_dict(p: Property) -> dict:
    d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
    for key in ("purchase_date", "created_at", "updated_at"):
        if d.get(key):
            d[key] = str(d[key])
    return d


SQM_TO_SQFT = 10.7639
EUR_TO_USD = 1.08

CAP_RATES = {
    "RESIDENTIAL": 0.040, "OFFICE": 0.055, "RETAIL": 0.060,
    "INDUSTRIAL": 0.065, "MIXED": 0.050,
}


def _us_params(prop: Property, annual_rent: float, extra: dict = None) -> dict:
    """Build US valuation parameters from property data."""
    extra = extra or {}
    ptype = prop.property_type or "OFFICE"
    area_sqft = (prop.total_area_sqm or 1000) * SQM_TO_SQFT
    purchase_price_usd = (prop.purchase_price or 5000000) * EUR_TO_USD
    annual_rent_usd = annual_rent * EUR_TO_USD
    land_value_usd = _get_bodenrichtwert(prop.city or "", prop.land_area_sqm or (prop.total_area_sqm or 500) * 0.5) * EUR_TO_USD
    construction_year = prop.construction_year or 2000
    age = datetime.now().year - construction_year
    cap_rate = CAP_RATES.get(ptype, 0.055)
    city = (prop.city or "").lower()
    # A-city premium: lower cap rate
    if any(c in city for c in ["münchen", "berlin", "frankfurt", "hamburg"]):
        cap_rate -= 0.005

    return {
        "property_type": ptype,
        "gross_rental_income": annual_rent_usd,
        "vacancy_rate": 0.05,
        "cap_rate": cap_rate,
        "area_sqft": area_sqft,
        "total_area_sqft": area_sqft,
        "subject_area_sqft": area_sqft,
        "land_value": land_value_usd,
        "replacement_cost_sqft": 220.0,
        "age_years": age,
        "effective_age": min(age, 30),
        "economic_life": 45,
        "purchase_price": purchase_price_usd,
        "comparables": [],
        **extra,
    }


def _normalize_us_output(raw: dict, prop: Property, annual_rent_eur: float) -> dict:
    """Map US valuation service output to frontend-expected structure."""
    ind = raw.get("individual_approaches", {})
    ia = ind.get("income_approach", {})
    sc = ind.get("sales_comparison", {})
    ca = ind.get("cost_approach", {})
    grm = ind.get("grm_analysis", {})
    weights = raw.get("weights_applied", {})
    reconciled = raw.get("reconciled_value", 0) or 0

    ia_analysis = ia.get("income_analysis", {})
    pgi_usd = ia.get("gross_income", 0) or 0
    vacancy_usd = ia_analysis.get("vacancy_loss", 0) or 0
    egi_usd = ia.get("effective_gross_income", 0) or 0
    egi_usd = egi_usd or ia_analysis.get("effective_gross_income", 0) or 0
    opex_usd = ia_analysis.get("operating_expenses", 0) or 0
    noi_usd = ia.get("noi", 0) or 0
    ia_value = ia.get("value", 0) or 0

    # Fallback: compute from annual_rent_eur if service returned 0
    if ia_value == 0 and annual_rent_eur > 0:
        ptype = prop.property_type or "OFFICE"
        cap_rate = CAP_RATES.get(ptype, 0.055)
        city = (prop.city or "").lower()
        if any(c in city for c in ["münchen", "berlin", "frankfurt", "hamburg"]):
            cap_rate -= 0.005
        rent_usd = annual_rent_eur * EUR_TO_USD
        noi_usd = rent_usd * 0.95 * 0.65  # 5% vacancy, 35% opex
        pgi_usd = rent_usd
        vacancy_usd = rent_usd * 0.05
        egi_usd = rent_usd * 0.95
        opex_usd = egi_usd * 0.35
        ia_value = noi_usd / cap_rate if cap_rate > 0 else 0

    sc_value = sc.get("indicated_value", 0) or 0
    ca_value = ca.get("total_value", 0) or 0

    # Fallback: sales comparison based on area
    area_sqft = (prop.total_area_sqm or 1000) * SQM_TO_SQFT
    if sc_value == 0 and ia_value > 0:
        sc_value = ia_value * 0.97  # slight discount
    if ca_value == 0 and ia_value > 0:
        ca_value = ia_value * 0.85

    # Final reconciled value
    if reconciled == 0:
        reconciled = ia_value * 0.6 + sc_value * 0.3 + ca_value * 0.1

    grm_val = grm.get("indicated_value") or (reconciled * 0.99 if reconciled else 0)
    grm_mult = grm.get("market_grm") or (reconciled / pgi_usd if pgi_usd > 0 else 0)

    cap_rate_actual = (noi_usd / ia_value * 100) if ia_value > 0 else 5.5

    return {
        "income_approach": {
            "gross_rental_income": round(pgi_usd),
            "vacancy_loss": round(vacancy_usd),
            "effective_gross_income": round(egi_usd),
            "operating_expenses": round(opex_usd),
            "noi": round(noi_usd),
            "cap_rate": round(cap_rate_actual, 2),
            "value": round(ia_value),
        },
        "sales_comparison": {
            "value_per_sqft": round(sc_value / area_sqft, 0) if area_sqft > 0 else 0,
            "total_area_sqft": round(area_sqft, 0),
            "indicated_value": round(sc_value),
            "adjustments": sc.get("adjustments", ["Lagebereinigung", "Ausstattungsbereinigung", "Zeitbereinigung"]),
        },
        "cost_approach": {
            "land_value": round(ca.get("details", {}).get("land_value", 0) or _get_bodenrichtwert(prop.city or "", prop.land_area_sqm or 500) * EUR_TO_USD),
            "replacement_cost": round(ca.get("replacement_cost", 0) or ca_value * 1.18),
            "total_depreciation": round(ca.get("depreciation", 0) or ca_value * 0.18),
            "depreciated_value": round(ca_value * 0.85),
            "total_value": round(ca_value),
        },
        "grm": {
            "gross_rent_multiplier": round(float(grm_mult), 2) if grm_mult else 0,
            "grm_value": round(grm_val) if grm_val else 0,
        },
        "combined": {
            "income_weight": weights.get("income", 0.6),
            "sales_weight": weights.get("sales", 0.3),
            "cost_weight": weights.get("cost", 0.1),
            "final_value_usd": round(reconciled),
            "final_value_eur": round(reconciled / EUR_TO_USD),
            "price_per_sqft": round(reconciled / area_sqft, 0) if area_sqft > 0 else 0,
            "cap_rate": round(cap_rate_actual, 2),
        },
    }


def _de_params(prop: Property, annual_rent: float, extra: dict = None) -> dict:
    """Build German valuation parameters from property data."""
    extra = extra or {}
    construction_year = prop.construction_year or 2000
    age = datetime.now().year - construction_year
    ptype = prop.property_type or "OFFICE"
    land_area = prop.land_area_sqm or (prop.total_area_sqm * 0.5 if prop.total_area_sqm else 500)
    total_area = prop.total_area_sqm or 1000
    bodenwert = _get_bodenrichtwert(prop.city or "", land_area)
    vergleichspreise = _get_vergleichspreise(prop.city or "")

    return {
        "property_type": ptype,
        "jahresrohertrag": annual_rent,
        "restnutzungsdauer": max(5, 60 - age),
        "bodenwert": bodenwert,
        "bgf_sqm": total_area * 1.15,  # BGF slightly larger than NF
        "baujahr": construction_year,
        "flaeche_sqm": total_area,
        "vergleichspreise": vergleichspreise,
        "lage_faktor": 1.05,
        "ausstattung_faktor": 1.0,
        **extra,
    }


def _normalize_de_output(raw: dict, prop: Property, annual_rent: float) -> dict:
    """Map raw combined_valuation output to frontend-expected structure."""
    einzeln = raw.get("einzelbewertungen", {})
    gewichtung = raw.get("gewichtung", {})
    einzelwerte = raw.get("einzelwerte", {})
    verkehrswert = raw.get("verkehrswert", 0) or 0
    kennzahlen = raw.get("kennzahlen", {})

    ewv = einzeln.get("ertragswertverfahren", {})
    vgw = einzeln.get("vergleichswertverfahren", {})
    swv = einzeln.get("sachwertverfahren", {})

    bwk = ewv.get("berechnungsschritte", {}).get("bewirtschaftungskosten", {})
    total_area = prop.total_area_sqm or 1

    ertragswert = ewv.get("ertragswert", 0) or 0
    vergleichswert = vgw.get("vergleichswert", 0) or 0
    sachwert = swv.get("sachwert", 0) or 0

    price_per_sqm = verkehrswert / total_area if total_area > 0 else 0
    gross_yield = (annual_rent / verkehrswert * 100) if verkehrswert > 0 else 0

    return {
        "ertragswertverfahren": {
            "jahresrohertrag": ewv.get("eingabeparameter", {}).get("jahresrohertrag", annual_rent),
            "bewirtschaftungskosten": bwk.get("gesamt_eur", 0),
            "reinertrag": ewv.get("reinertrag", 0),
            "liegenschaftszinsanteil": ewv.get("berechnungsschritte", {}).get("liegenschaftszinsanteil", 0),
            "gebaeude_reinertrag": ewv.get("berechnungsschritte", {}).get("gebaeude_reinertrag", 0),
            "vervielfaeltiger": ewv.get("berechnungsschritte", {}).get("vervielfaeltiger", 0),
            "gebaeude_ertragswert": ewv.get("gebaeude_ertragswert", 0),
            "bodenwert": ewv.get("eingabeparameter", {}).get("bodenwert", 0),
            "ertragswert": ertragswert,
        },
        "vergleichswertverfahren": {
            "flaeche_sqm": total_area,
            "ø_vergleichspreis_sqm": vgw.get("berechnungsschritte", {}).get("gewichteter_vergleichspreis_sqm", 0) or (vergleichswert / total_area if total_area > 0 else 0),
            "lage_faktor": vgw.get("berechnungsschritte", {}).get("lage_faktor", 1.0) if isinstance(vgw.get("berechnungsschritte"), dict) else 1.0,
            "ausstattung_faktor": vgw.get("berechnungsschritte", {}).get("ausstattung_faktor", 1.0) if isinstance(vgw.get("berechnungsschritte"), dict) else 1.0,
            "vergleichswert": vergleichswert,
        },
        "sachwertverfahren": {
            "bodenwert": swv.get("bodenwert", 0) or swv.get("eingabeparameter", {}).get("bodenwert", 0),
            "gebaeude_sachwert": swv.get("gebaeude_sachwert", 0),
            "marktanpassungsfaktor": swv.get("berechnungsschritte", {}).get("marktanpassung", {}).get("faktor", 1.0) if isinstance(swv.get("berechnungsschritte"), dict) else 1.0,
            "sachwert": sachwert,
        },
        "combined": {
            "ertragswert_weight": gewichtung.get("ertragswert", 0.7),
            "vergleichswert_weight": gewichtung.get("vergleichswert", 0.2),
            "sachwert_weight": gewichtung.get("sachwert", 0.1),
            "final_value": verkehrswert,
            "price_per_sqm": round(price_per_sqm, 0),
            "gross_initial_yield": round(gross_yield, 2),
        },
        "params_used": {"annual_rent": annual_rent, "purchase_price": prop.purchase_price},
    }


def _normalize_dcf_output(raw: dict) -> dict:
    """
    Map DCF service output to frontend-expected structure.
    The service uses irr_pct (percentage), frontend expects irr (decimal).
    """
    metrics = raw.get("metrics", {})

    # IRR: service returns percentage (e.g. 8.5), frontend expects decimal (0.085)
    irr_pct = metrics.get("irr_pct", 0) or 0
    irr = irr_pct / 100.0

    # Cash-on-cash: service returns list of percentages
    coc_raw = metrics.get("cash_on_cash_returns", [])
    coc_pct = [(c or 0) for c in coc_raw]
    avg_coc_pct = metrics.get("average_coc_return_pct", 0) or 0

    # DSCR
    dscr_raw = [(d or 0) for d in (metrics.get("dscr") or [])]
    min_dscr = metrics.get("min_dscr") or (min(d for d in dscr_raw if d > 0) if any(d > 0 for d in dscr_raw) else 1.5)

    # Payback period
    payback = metrics.get("payback_period_years") or 0

    # Equity invested
    inputs = raw.get("inputs", {})
    equity = inputs.get("equity_invested", 0) or 0

    # Yearly cashflows – add noi_yield if missing
    purchase_price = inputs.get("purchase_price", 1) or 1
    cfs = raw.get("yearly_cashflows", [])
    for cf in cfs:
        if "noi_yield" not in cf:
            noi = cf.get("noi", 0) or 0
            cf["noi_yield"] = round(noi / purchase_price * 100, 2) if purchase_price else 0

    # Build sensitivity in expected format
    sensitivity_raw = raw.get("sensitivity", {})
    exit_cap_scenarios = []
    irr_matrix = sensitivity_raw.get("irr_matrix", {}).get("values_pct", {})
    npv_matrix = sensitivity_raw.get("npv_matrix", {}).get("values_usd", {})
    for cap_key, rent_map in irr_matrix.items():
        base_irr = (rent_map.get("2.0%") or rent_map.get(list(rent_map.keys())[len(rent_map)//2], 0)) or 0
        npv_row = (npv_matrix.get(cap_key) or {})
        base_npv_raw = npv_row.get("2.0%") or npv_row.get(list(npv_row.keys())[len(npv_row)//2] if npv_row else "2.0%", 0) or 0
        exit_cap_scenarios.append({
            "label": f"Exit Cap {cap_key}",
            "irr": base_irr / 100.0,
            "npv": float(base_npv_raw),
            "equity_multiple": metrics.get("equity_multiple", 1.0),
        })

    rent_scenarios = []
    base_cap = list(irr_matrix.keys())[len(irr_matrix)//2] if irr_matrix else None
    if base_cap and base_cap in irr_matrix:
        for rg_key, irr_val in irr_matrix[base_cap].items():
            npv_val = (npv_matrix.get(base_cap) or {}).get(rg_key, 0) or 0
            rent_scenarios.append({
                "label": f"Mietwachstum {rg_key}",
                "irr": (irr_val or 0) / 100.0,
                "npv": float(npv_val),
                "equity_multiple": metrics.get("equity_multiple", 1.0),
            })

    normalized_metrics = {
        "npv": metrics.get("npv", 0) or 0,
        "irr": irr,
        "equity_multiple": metrics.get("equity_multiple", 0) or 0,
        "cash_on_cash_returns": coc_pct,
        "avg_cash_on_cash": avg_coc_pct,
        "dscr": dscr_raw,
        "min_dscr": float(min_dscr),
        "payback_period": int(payback) if payback else 0,
        "total_investment": purchase_price,
        "equity_invested": equity,
    }

    return {
        "yearly_cashflows": cfs,
        "terminal_value": raw.get("terminal_value", 0) or 0,
        "sale_proceeds": raw.get("sale_proceeds", 0) or raw.get("net_sale_proceeds", 0) or 0,
        "total_equity_return": raw.get("total_equity_return", 0) or 0,
        "metrics": normalized_metrics,
        "sensitivity": {
            "rent_growth_scenarios": rent_scenarios,
            "exit_cap_scenarios": exit_cap_scenarios,
        },
        "params_used": inputs,
    }


@router.post("/german-valuation/{property_id}")
def german_valuation(property_id: int, params: dict = None, db: Session = Depends(get_db)):
    params = params or {}
    prop = _get_property_or_404(property_id, db)
    tenants = _tenants_list(property_id, db)
    annual_rent = sum(t.get("annual_rent", 0) for t in tenants) or (prop.total_area_sqm or 1000) * 15 * 12
    de_params = _de_params(prop, annual_rent, params)
    raw = _de_valuation(de_params)
    return _normalize_de_output(raw, prop, annual_rent)


@router.post("/us-valuation/{property_id}")
def us_valuation(property_id: int, params: dict = None, db: Session = Depends(get_db)):
    params = params or {}
    prop = _get_property_or_404(property_id, db)
    tenants = _tenants_list(property_id, db)
    annual_rent = sum(t.get("annual_rent", 0) for t in tenants) or (prop.total_area_sqm or 1000) * 15 * 12
    raw = _us_valuation(_us_params(prop, annual_rent, params))
    return _normalize_us_output(raw, prop, annual_rent)


@router.post("/dcf/{property_id}")
def dcf_analysis(property_id: int, params: dict = None, db: Session = Depends(get_db)):
    params = params or {}
    prop = _get_property_or_404(property_id, db)
    tenants = _tenants_list(property_id, db)
    annual_rent = sum(t.get("annual_rent", 0) for t in tenants) or (prop.total_area_sqm or 1000) * 15 * 12
    raw = _run_dcf({
        "purchase_price": prop.purchase_price or 5000000,
        "initial_noi": annual_rent * 0.7,
        "annual_rent": annual_rent,
        "property_type": prop.property_type,
        **params,
    })
    return _normalize_dcf_output(raw)


def _normalize_location(raw: dict) -> dict:
    """Map location service output to frontend-expected structure."""
    standort = raw.get("standort", {})
    macro = raw.get("macro_analysis", {})
    micro = raw.get("micro_analysis", {})
    return {
        "macro": {
            "city_tier": macro.get("city_tier", "B-Stadt"),
            "city_rating": macro.get("city_rating", 7.0),
            "population_trend": macro.get("population_trend", "stabil"),
            "gdp_growth": macro.get("gdp_growth_pct", 2.0),
            "unemployment_rate": macro.get("unemployment_rate_pct", 5.0),
            "real_estate_market_trend": macro.get("real_estate_market_trend", "positiv"),
            "infrastructure_score": macro.get("infrastructure_score", 7.0),
            "economic_diversity_score": macro.get("economic_diversity_score", 7.0),
            "facts": raw.get("opportunities", [])[:3],
        },
        "micro": {
            "neighborhood_rating": micro.get("neighborhood_rating", 7.0),
            "public_transport_score": micro.get("public_transport_score", 7.0),
            "amenities_score": micro.get("amenities_score", 7.0),
            "walkability_score": micro.get("walkability_score", 7.0),
            "vacancy_rate_area": micro.get("vacancy_rate_area_pct", 5.0),
            "rent_level_comparison": micro.get("rent_level_comparison", "marktüblich"),
            "development_potential": micro.get("development_potential", "mittel"),
        },
        "risk_factors": raw.get("risk_factors", []),
        "opportunities": raw.get("opportunities", []),
        "overall_score": raw.get("overall_score", 70),
        "recommendation": raw.get("recommendation", ""),
        "city": standort.get("city", ""),
        "zip_code": standort.get("zip_code", ""),
        "data_source": raw.get("data_source", "Internes Referenzdatenbankmodell (Stand 2024)"),
    }


@router.post("/location/{property_id}")
def location_analysis(property_id: int, params: dict = None, db: Session = Depends(get_db)):
    prop = _get_property_or_404(property_id, db)
    raw = _location({"city": prop.city or "Berlin", "zip_code": prop.zip_code or "10115", "address": prop.address or "", "property_type": prop.property_type or "OFFICE"})
    return _normalize_location(raw)


@router.post("/risk/{property_id}")
def risk_analysis(property_id: int, params: dict = None, db: Session = Depends(get_db)):
    params = params or {}
    prop = _get_property_or_404(property_id, db)
    tenants = _tenants_list(property_id, db)
    annual_rent = sum(t.get("annual_rent", 0) for t in tenants) or (prop.total_area_sqm or 1000) * 15 * 12
    dcf_result = _normalize_dcf_output(_run_dcf({
        "purchase_price": prop.purchase_price or 5000000,
        "initial_noi": annual_rent * 0.7,
        "annual_rent": annual_rent,
        "property_type": prop.property_type,
    }))
    return _risk(_prop_dict(prop), tenants, dcf_result, params)


@router.get("/full/{property_id}")
def full_analysis(property_id: int, db: Session = Depends(get_db)):
    """Run all analyses with sensible defaults."""
    prop = _get_property_or_404(property_id, db)
    tenants = _tenants_list(property_id, db)
    prop_dict = _prop_dict(prop)
    prop_dict["tenants"] = tenants

    annual_rent = sum(t.get("annual_rent", 0) for t in tenants) or (prop.total_area_sqm or 1000) * 15 * 12

    de_params = _de_params(prop, annual_rent)
    de_raw = _de_valuation(de_params)
    de_result = _normalize_de_output(de_raw, prop, annual_rent)

    us_raw = _us_valuation(_us_params(prop, annual_rent))
    us_result = _normalize_us_output(us_raw, prop, annual_rent)

    dcf_result = _normalize_dcf_output(_run_dcf({
        "purchase_price": prop.purchase_price or 5000000,
        "initial_noi": annual_rent * 0.7,
        "annual_rent": annual_rent,
        "property_type": prop.property_type,
    }))

    loc_result = _normalize_location(_location({"city": prop.city or "Berlin", "zip_code": prop.zip_code or "10115", "address": prop.address or "", "property_type": prop.property_type or "OFFICE"}))
    risk_result = _risk(prop_dict, tenants, dcf_result)

    return {
        "property": prop_dict,
        "german_valuation": de_result,
        "us_valuation": us_result,
        "dcf": dcf_result,
        "location": loc_result,
        "risk": risk_result,
    }


@router.post("/scenario/{property_id}")
def save_scenario(property_id: int, data: dict, db: Session = Depends(get_db)):
    _get_property_or_404(property_id, db)
    s = Scenario(
        property_id=property_id,
        name=data.get("name", "Szenario"),
        description=data.get("description", ""),
        params_json=json.dumps(data.get("params", {})),
        results_json=json.dumps(data.get("results", {})),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {c.name: getattr(s, c.name) for c in s.__table__.columns if c.name not in ("created_at",)} | {"created_at": str(s.created_at)}


@router.get("/scenarios/{property_id}")
def list_scenarios(property_id: int, db: Session = Depends(get_db)):
    scenarios = db.query(Scenario).filter_by(property_id=property_id).order_by(Scenario.created_at.desc()).all()
    return [{c.name: getattr(s, c.name) for c in s.__table__.columns if c.name not in ("created_at",)} | {"created_at": str(s.created_at)} for s in scenarios]
