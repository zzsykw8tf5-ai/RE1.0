"""Portfolio Risk Model for real estate assets."""
from datetime import datetime, date
from typing import Any


def calculate_property_risk(
    property_data: dict,
    tenants: list,
    dcf_results: dict | None = None,
    params: dict | None = None,
) -> dict:
    """
    Calculate comprehensive risk score for a property.
    Risk scores: 0–100, higher = more risk.
    """
    params = params or {}
    ltv = params.get("ltv", 0.65)
    interest_rate = params.get("interest_rate", 0.045)

    purchase_price = property_data.get("purchase_price", 0) or 1
    construction_year = property_data.get("construction_year", 2000) or 2000
    property_type = property_data.get("property_type", "OFFICE")
    total_area = property_data.get("total_area_sqm", 1000) or 1000

    age = datetime.now().year - construction_year

    # ---- 1. Market Risk ----
    market_risk = _calculate_market_risk(property_type, property_data)

    # ---- 2. Tenant Risk ----
    tenant_risk, tenant_concentration = _calculate_tenant_risk(tenants)

    # ---- 3. Structural Risk ----
    structural_risk = _calculate_structural_risk(age, property_type)

    # ---- 4. Liquidity Risk ----
    liquidity_risk = _calculate_liquidity_risk(property_type, purchase_price)

    # ---- 5. Financial Risk ----
    financial_risk = _calculate_financial_risk(ltv, interest_rate, dcf_results)

    # ---- 6. Regulatory Risk ----
    regulatory_risk = _calculate_regulatory_risk(age, property_type, construction_year)

    # ---- Weighted Overall ----
    weights = {
        "market": 0.20, "tenant": 0.25, "structural": 0.15,
        "liquidity": 0.15, "financial": 0.15, "regulatory": 0.10,
    }
    overall = (
        market_risk * weights["market"] +
        tenant_risk * weights["tenant"] +
        structural_risk * weights["structural"] +
        liquidity_risk * weights["liquidity"] +
        financial_risk * weights["financial"] +
        regulatory_risk * weights["regulatory"]
    )

    risk_category = (
        "Niedrig" if overall < 30 else
        "Mittel" if overall < 55 else
        "Erhöht" if overall < 75 else
        "Hoch"
    )

    # ---- Stress Tests ----
    noi = dcf_results.get("yearly_cashflows", [{}])[0].get("noi", purchase_price * 0.05) if dcf_results else purchase_price * 0.05
    market_cap_rate = noi / purchase_price if purchase_price else 0.05

    stress_tests = {
        "interest_rate_shock": {
            "impact_value": -purchase_price * 0.08,
            "impact_cashflow": -(ltv * purchase_price) * 0.02,
            "label": "+200 Basispunkte Zinsanstieg → ~8% Wertverlust",
        },
        "vacancy_shock": {
            "impact_value": -purchase_price * 0.06,
            "impact_cashflow": -noi * 0.25,
            "label": "+20% struktureller Leerstand",
        },
        "rent_decline": {
            "impact_value": -(noi * 0.15) / market_cap_rate if market_cap_rate > 0 else 0,
            "impact_cashflow": -noi * 0.15,
            "label": "-15% Mietpreisrückgang",
        },
        "cap_rate_expansion": {
            "impact_value": -(noi / (market_cap_rate + 0.01) - purchase_price) if market_cap_rate > 0 else -purchase_price * 0.12,
            "impact_cashflow": 0,
            "label": "+100 Bps Exit Cap Rate Ausweitung",
        },
    }

    # ---- Lease Expiry Profile ----
    lease_expiry = _build_lease_expiry_profile(tenants)

    # ---- Recommendations ----
    recommendations = _build_recommendations(
        overall, market_risk, tenant_risk, structural_risk,
        financial_risk, regulatory_risk, age, tenant_concentration
    )

    return {
        "scores": {
            "market_risk": round(market_risk, 1),
            "tenant_risk": round(tenant_risk, 1),
            "structural_risk": round(structural_risk, 1),
            "liquidity_risk": round(liquidity_risk, 1),
            "financial_risk": round(financial_risk, 1),
            "regulatory_risk": round(regulatory_risk, 1),
        },
        "overall_risk_score": round(overall, 1),
        "risk_category": risk_category,
        "stress_tests": stress_tests,
        "recommendations": recommendations,
        "lease_expiry_profile": lease_expiry,
        "tenant_concentration": tenant_concentration,
    }


def _calculate_market_risk(property_type: str, property_data: dict) -> float:
    base = {
        "RESIDENTIAL": 25, "OFFICE": 45, "RETAIL": 55,
        "INDUSTRIAL": 35, "MIXED": 38,
    }.get(property_type, 40)
    city = property_data.get("city", "").lower()
    city_adj = -8 if any(c in city for c in ["münchen", "berlin", "hamburg", "frankfurt"]) else \
               -4 if any(c in city for c in ["köln", "stuttgart", "düsseldorf"]) else 5
    return min(100, max(0, base + city_adj))


def _calculate_tenant_risk(tenants: list) -> tuple[float, list]:
    if not tenants:
        return 50.0, []

    total_rent = sum(t.get("annual_rent", 0) for t in tenants) or 1

    # Concentration
    concentration = []
    for t in sorted(tenants, key=lambda x: x.get("annual_rent", 0), reverse=True):
        share = t.get("annual_rent", 0) / total_rent * 100
        concentration.append({"name": t.get("name", "Unbekannt"), "share_pct": round(share, 1)})

    top_share = concentration[0]["share_pct"] / 100 if concentration else 0
    concentration_risk = min(80, top_share * 100)  # 100% single tenant = max risk

    # Creditworthiness
    cw_scores = {"A": 10, "B": 35, "C": 65}
    avg_cw = sum(cw_scores.get(t.get("creditworthiness", "B"), 35) for t in tenants) / len(tenants)

    # Lease expiry in next 3 years
    now = datetime.now().year
    expiring_soon = sum(
        t.get("annual_rent", 0) for t in tenants
        if t.get("lease_end") and _parse_year(t["lease_end"]) - now <= 3
    )
    expiry_risk = min(60, (expiring_soon / total_rent) * 80)

    risk = concentration_risk * 0.35 + avg_cw * 0.35 + expiry_risk * 0.30
    return min(100, max(0, risk)), concentration[:5]


def _calculate_structural_risk(age: int, property_type: str) -> float:
    age_risk = min(70, age * 1.2)  # Older buildings = more risk
    type_adj = {"INDUSTRIAL": 10, "RETAIL": 5, "OFFICE": 0, "RESIDENTIAL": -5, "MIXED": 0}.get(property_type, 0)
    return min(100, max(0, age_risk + type_adj))


def _calculate_liquidity_risk(property_type: str, purchase_price: float) -> float:
    type_risk = {"RESIDENTIAL": 20, "OFFICE": 35, "MIXED": 30, "RETAIL": 45, "INDUSTRIAL": 40}.get(property_type, 35)
    # Very high value = less liquid
    size_adj = 20 if purchase_price > 50_000_000 else 10 if purchase_price > 10_000_000 else 0
    return min(100, type_risk + size_adj)


def _calculate_financial_risk(ltv: float, interest_rate: float, dcf_results: dict | None) -> float:
    ltv_risk = min(60, ltv * 70)  # 85% LTV = ~60 risk
    rate_risk = min(40, interest_rate * 400)  # 10% rate = 40 risk
    dscr_risk = 0
    if dcf_results and dcf_results.get("metrics"):
        min_dscr = dcf_results["metrics"].get("min_dscr") or 1.5
        dscr_risk = max(0, 50 - float(min_dscr) * 20)
    return min(100, max(0, ltv_risk * 0.5 + rate_risk * 0.3 + dscr_risk * 0.2))


def _calculate_regulatory_risk(age: int, property_type: str, construction_year: int) -> float:
    # GEG energy efficiency risk for older buildings
    energy_risk = 50 if construction_year < 1980 else 30 if construction_year < 2000 else 10
    # Commercial properties have more regulatory exposure
    type_risk = {"RESIDENTIAL": 20, "OFFICE": 35, "RETAIL": 40, "INDUSTRIAL": 45, "MIXED": 30}.get(property_type, 30)
    return min(100, max(0, energy_risk * 0.6 + type_risk * 0.4))


def _build_lease_expiry_profile(tenants: list) -> list:
    expiry_map: dict[str, dict] = {}
    now_year = datetime.now().year
    for t in tenants:
        if not t.get("lease_end"):
            year_str = str(now_year + 5)
        else:
            year_str = str(_parse_year(t["lease_end"]))
        if year_str not in expiry_map:
            expiry_map[year_str] = {"year": year_str, "area_sqm": 0, "rent_pa": 0}
        expiry_map[year_str]["area_sqm"] += t.get("area_sqm", 0)
        expiry_map[year_str]["rent_pa"] += t.get("annual_rent", 0)

    return sorted(expiry_map.values(), key=lambda x: x["year"])[:8]


def _build_recommendations(
    overall: float, market: float, tenant: float, structural: float,
    financial: float, regulatory: float, age: int, concentration: list
) -> list[str]:
    recs = []
    if overall > 60:
        recs.append("Gesamtrisiko ist erhöht – Überprüfen Sie die Risikostrategie und ggf. Verkaufsoption")
    if tenant > 60:
        recs.append("Hohe Mieterkonzentration: Diversifizierung des Mietermixes anstreben")
    if concentration and concentration[0]["share_pct"] > 50:
        recs.append(f"Abhängigkeit von {concentration[0]['name']} ({concentration[0]['share_pct']:.0f}% Mietanteil) minimieren")
    if structural > 55:
        recs.append(f"Objekt ist {age} Jahre alt: Umfassendes technisches Due-Diligence und CapEx-Planung empfohlen")
    if financial > 55:
        recs.append("Fremdfinanzierung optimieren: Zinsbindung verlängern oder LTV reduzieren")
    if regulatory > 50:
        recs.append("Energetische Sanierung prüfen (GEG 2024 Anforderungen) – Fördermittel nutzen")
    if market > 55:
        recs.append("Marktrisiko erhöht: Mietpreisanpassungsklauseln und Indexierungen prüfen")
    if not recs:
        recs.append("Risikoprofil ist gut – Regelmäßiges Monitoring der KPIs empfohlen")
    return recs


def _parse_year(date_str: str) -> int:
    try:
        if isinstance(date_str, (date, datetime)):
            return date_str.year
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%Y"):
            try:
                return datetime.strptime(str(date_str), fmt).year
            except ValueError:
                pass
        return int(str(date_str)[:4])
    except Exception:
        return datetime.now().year + 5


def calculate_portfolio_risk(properties: list) -> dict:
    """Portfolio-level risk analysis."""
    if not properties:
        return {"portfolio_risk_score": 0, "diversification_score": 0, "summary": "Kein Portfolio vorhanden"}

    type_counts: dict[str, int] = {}
    city_counts: dict[str, int] = {}
    for p in properties:
        type_counts[p.get("property_type", "UNKNOWN")] = type_counts.get(p.get("property_type", "UNKNOWN"), 0) + 1
        city_counts[p.get("city", "Unknown")] = city_counts.get(p.get("city", "Unknown"), 0) + 1

    n = len(properties)
    type_hhi = sum((c / n) ** 2 for c in type_counts.values())
    city_hhi = sum((c / n) ** 2 for c in city_counts.values())
    diversification_score = round((1 - (type_hhi + city_hhi) / 2) * 100, 1)

    return {
        "portfolio_risk_score": round(50 - diversification_score * 0.3, 1),
        "diversification_score": diversification_score,
        "type_distribution": type_counts,
        "city_distribution": city_counts,
        "n_properties": n,
    }
