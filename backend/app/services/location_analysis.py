"""
Location analysis service for German real estate.

Provides macro and micro analysis with scoring based on German city data.
Uses internal data for major German cities and zip code ranges.
"""

from typing import Any


# ─── German city database ──────────────────────────────────────────────────────

GERMAN_CITY_DATA = {
    "berlin": {
        "tier": "A-Stadt",
        "city_rating": 8.5,
        "population_trend": "wachsend",
        "population": 3_700_000,
        "gdp_growth": 2.1,
        "unemployment_rate": 8.2,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 8.0,
        "economic_diversity_score": 8.5,
        "typical_cap_rates": {"RESIDENTIAL": 2.8, "OFFICE": 4.2, "RETAIL": 4.8},
        "typical_rent_office_sqm": 32,
        "typical_rent_retail_sqm": 45,
        "typical_rent_resi_sqm": 18,
        "zip_ranges": [(10000, 14200)],
    },
    "munich": {
        "tier": "A-Stadt",
        "city_rating": 9.5,
        "population_trend": "stark wachsend",
        "population": 1_560_000,
        "gdp_growth": 3.2,
        "unemployment_rate": 3.8,
        "real_estate_market_trend": "sehr positiv",
        "infrastructure_score": 9.2,
        "economic_diversity_score": 9.0,
        "typical_cap_rates": {"RESIDENTIAL": 2.2, "OFFICE": 3.5, "RETAIL": 3.8},
        "typical_rent_office_sqm": 42,
        "typical_rent_retail_sqm": 65,
        "typical_rent_resi_sqm": 24,
        "zip_ranges": [(80000, 81999)],
    },
    "münchen": {
        "tier": "A-Stadt",
        "city_rating": 9.5,
        "population_trend": "stark wachsend",
        "population": 1_560_000,
        "gdp_growth": 3.2,
        "unemployment_rate": 3.8,
        "real_estate_market_trend": "sehr positiv",
        "infrastructure_score": 9.2,
        "economic_diversity_score": 9.0,
        "typical_cap_rates": {"RESIDENTIAL": 2.2, "OFFICE": 3.5, "RETAIL": 3.8},
        "typical_rent_office_sqm": 42,
        "typical_rent_retail_sqm": 65,
        "typical_rent_resi_sqm": 24,
        "zip_ranges": [(80000, 81999)],
    },
    "hamburg": {
        "tier": "A-Stadt",
        "city_rating": 8.8,
        "population_trend": "wachsend",
        "population": 1_850_000,
        "gdp_growth": 2.5,
        "unemployment_rate": 6.8,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 8.5,
        "economic_diversity_score": 8.8,
        "typical_cap_rates": {"RESIDENTIAL": 2.6, "OFFICE": 4.0, "RETAIL": 4.5},
        "typical_rent_office_sqm": 30,
        "typical_rent_retail_sqm": 55,
        "typical_rent_resi_sqm": 20,
        "zip_ranges": [(20000, 22999)],
    },
    "frankfurt": {
        "tier": "A-Stadt",
        "city_rating": 9.0,
        "population_trend": "wachsend",
        "population": 760_000,
        "gdp_growth": 2.8,
        "unemployment_rate": 5.5,
        "real_estate_market_trend": "sehr positiv",
        "infrastructure_score": 9.0,
        "economic_diversity_score": 9.2,
        "typical_cap_rates": {"RESIDENTIAL": 2.8, "OFFICE": 3.8, "RETAIL": 4.2},
        "typical_rent_office_sqm": 40,
        "typical_rent_retail_sqm": 60,
        "typical_rent_resi_sqm": 21,
        "zip_ranges": [(60000, 65999)],
    },
    "cologne": {
        "tier": "A-Stadt",
        "city_rating": 8.2,
        "population_trend": "wachsend",
        "population": 1_080_000,
        "gdp_growth": 1.9,
        "unemployment_rate": 9.2,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 8.0,
        "economic_diversity_score": 8.0,
        "typical_cap_rates": {"RESIDENTIAL": 3.0, "OFFICE": 4.5, "RETAIL": 5.0},
        "typical_rent_office_sqm": 25,
        "typical_rent_retail_sqm": 40,
        "typical_rent_resi_sqm": 17,
        "zip_ranges": [(50000, 51999)],
    },
    "köln": {
        "tier": "A-Stadt",
        "city_rating": 8.2,
        "population_trend": "wachsend",
        "population": 1_080_000,
        "gdp_growth": 1.9,
        "unemployment_rate": 9.2,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 8.0,
        "economic_diversity_score": 8.0,
        "typical_cap_rates": {"RESIDENTIAL": 3.0, "OFFICE": 4.5, "RETAIL": 5.0},
        "typical_rent_office_sqm": 25,
        "typical_rent_retail_sqm": 40,
        "typical_rent_resi_sqm": 17,
        "zip_ranges": [(50000, 51999)],
    },
    "stuttgart": {
        "tier": "A-Stadt",
        "city_rating": 8.6,
        "population_trend": "stabil",
        "population": 635_000,
        "gdp_growth": 2.4,
        "unemployment_rate": 4.5,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 8.3,
        "economic_diversity_score": 8.8,
        "typical_cap_rates": {"RESIDENTIAL": 2.8, "OFFICE": 4.0, "RETAIL": 4.5},
        "typical_rent_office_sqm": 28,
        "typical_rent_retail_sqm": 45,
        "typical_rent_resi_sqm": 19,
        "zip_ranges": [(70000, 70999)],
    },
    "düsseldorf": {
        "tier": "A-Stadt",
        "city_rating": 8.4,
        "population_trend": "stabil",
        "population": 640_000,
        "gdp_growth": 2.0,
        "unemployment_rate": 8.5,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 8.2,
        "economic_diversity_score": 8.3,
        "typical_cap_rates": {"RESIDENTIAL": 2.9, "OFFICE": 4.2, "RETAIL": 4.8},
        "typical_rent_office_sqm": 30,
        "typical_rent_retail_sqm": 50,
        "typical_rent_resi_sqm": 18,
        "zip_ranges": [(40000, 40999)],
    },
    "dusseldorf": {
        "tier": "A-Stadt",
        "city_rating": 8.4,
        "population_trend": "stabil",
        "population": 640_000,
        "gdp_growth": 2.0,
        "unemployment_rate": 8.5,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 8.2,
        "economic_diversity_score": 8.3,
        "typical_cap_rates": {"RESIDENTIAL": 2.9, "OFFICE": 4.2, "RETAIL": 4.8},
        "typical_rent_office_sqm": 30,
        "typical_rent_retail_sqm": 50,
        "typical_rent_resi_sqm": 18,
        "zip_ranges": [(40000, 40999)],
    },
    "leipzig": {
        "tier": "B-Stadt",
        "city_rating": 7.5,
        "population_trend": "wachsend",
        "population": 620_000,
        "gdp_growth": 2.8,
        "unemployment_rate": 7.5,
        "real_estate_market_trend": "positiv",
        "infrastructure_score": 7.0,
        "economic_diversity_score": 7.2,
        "typical_cap_rates": {"RESIDENTIAL": 3.8, "OFFICE": 5.5, "RETAIL": 6.0},
        "typical_rent_office_sqm": 16,
        "typical_rent_retail_sqm": 28,
        "typical_rent_resi_sqm": 13,
        "zip_ranges": [(4000, 4999)],
    },
    "dresden": {
        "tier": "B-Stadt",
        "city_rating": 7.2,
        "population_trend": "stabil",
        "population": 560_000,
        "gdp_growth": 1.8,
        "unemployment_rate": 7.2,
        "real_estate_market_trend": "neutral",
        "infrastructure_score": 7.2,
        "economic_diversity_score": 7.0,
        "typical_cap_rates": {"RESIDENTIAL": 4.0, "OFFICE": 5.8, "RETAIL": 6.2},
        "typical_rent_office_sqm": 14,
        "typical_rent_retail_sqm": 25,
        "typical_rent_resi_sqm": 12,
        "zip_ranges": [(1000, 1999)],
    },
    "nuremberg": {
        "tier": "B-Stadt",
        "city_rating": 7.6,
        "population_trend": "stabil",
        "population": 520_000,
        "gdp_growth": 2.0,
        "unemployment_rate": 5.8,
        "real_estate_market_trend": "neutral",
        "infrastructure_score": 7.5,
        "economic_diversity_score": 7.5,
        "typical_cap_rates": {"RESIDENTIAL": 3.5, "OFFICE": 5.2, "RETAIL": 5.8},
        "typical_rent_office_sqm": 18,
        "typical_rent_retail_sqm": 30,
        "typical_rent_resi_sqm": 14,
        "zip_ranges": [(90000, 90999)],
    },
    "nürnberg": {
        "tier": "B-Stadt",
        "city_rating": 7.6,
        "population_trend": "stabil",
        "population": 520_000,
        "gdp_growth": 2.0,
        "unemployment_rate": 5.8,
        "real_estate_market_trend": "neutral",
        "infrastructure_score": 7.5,
        "economic_diversity_score": 7.5,
        "typical_cap_rates": {"RESIDENTIAL": 3.5, "OFFICE": 5.2, "RETAIL": 5.8},
        "typical_rent_office_sqm": 18,
        "typical_rent_retail_sqm": 30,
        "typical_rent_resi_sqm": 14,
        "zip_ranges": [(90000, 90999)],
    },
    "hannover": {
        "tier": "B-Stadt",
        "city_rating": 7.0,
        "population_trend": "stabil",
        "population": 540_000,
        "gdp_growth": 1.5,
        "unemployment_rate": 8.0,
        "real_estate_market_trend": "neutral",
        "infrastructure_score": 7.5,
        "economic_diversity_score": 7.2,
        "typical_cap_rates": {"RESIDENTIAL": 4.0, "OFFICE": 5.5, "RETAIL": 6.0},
        "typical_rent_office_sqm": 17,
        "typical_rent_retail_sqm": 28,
        "typical_rent_resi_sqm": 13,
        "zip_ranges": [(30000, 30999)],
    },
    "bremen": {
        "tier": "B-Stadt",
        "city_rating": 6.8,
        "population_trend": "stabil",
        "population": 570_000,
        "gdp_growth": 1.2,
        "unemployment_rate": 10.5,
        "real_estate_market_trend": "neutral",
        "infrastructure_score": 7.0,
        "economic_diversity_score": 6.8,
        "typical_cap_rates": {"RESIDENTIAL": 4.2, "OFFICE": 6.0, "RETAIL": 6.5},
        "typical_rent_office_sqm": 15,
        "typical_rent_retail_sqm": 25,
        "typical_rent_resi_sqm": 12,
        "zip_ranges": [(28000, 28999)],
    },
}

DEFAULT_CITY_DATA = {
    "tier": "C-Stadt",
    "city_rating": 5.5,
    "population_trend": "rückläufig",
    "population": 100_000,
    "gdp_growth": 0.8,
    "unemployment_rate": 9.5,
    "real_estate_market_trend": "neutral",
    "infrastructure_score": 5.5,
    "economic_diversity_score": 5.0,
    "typical_cap_rates": {"RESIDENTIAL": 5.0, "OFFICE": 7.0, "RETAIL": 7.5},
    "typical_rent_office_sqm": 10,
    "typical_rent_retail_sqm": 15,
    "typical_rent_resi_sqm": 8,
    "zip_ranges": [],
}

ZIP_TIER_MAP = {
    # Berlin
    range(10115, 14200): ("Berlin", "A-Stadt"),
    # Munich
    range(80331, 81929): ("München", "A-Stadt"),
    # Hamburg
    range(20095, 22769): ("Hamburg", "A-Stadt"),
    # Frankfurt
    range(60311, 60599): ("Frankfurt am Main", "A-Stadt"),
    # Cologne
    range(50667, 51149): ("Köln", "A-Stadt"),
    # Stuttgart
    range(70173, 70629): ("Stuttgart", "A-Stadt"),
    # Düsseldorf
    range(40210, 40629): ("Düsseldorf", "A-Stadt"),
    # Leipzig
    range(4001, 4357): ("Leipzig", "B-Stadt"),
    # Dresden
    range(1067, 1328): ("Dresden", "B-Stadt"),
    # Nuremberg
    range(90403, 90491): ("Nürnberg", "B-Stadt"),
    # Hannover
    range(30159, 30669): ("Hannover", "B-Stadt"),
    # Bremen
    range(28195, 28779): ("Bremen", "B-Stadt"),
}


def _lookup_city_data(city: str, zip_code: str | None = None) -> dict:
    """Find city data by name or zip code."""
    city_lower = city.strip().lower() if city else ""

    # Try direct city name match
    if city_lower in GERMAN_CITY_DATA:
        return GERMAN_CITY_DATA[city_lower]

    # Try partial name match
    for known_city, data in GERMAN_CITY_DATA.items():
        if known_city in city_lower or city_lower in known_city:
            return data

    # Try zip code lookup
    if zip_code:
        try:
            zip_int = int(str(zip_code).strip()[:5])
            for known_city, data in GERMAN_CITY_DATA.items():
                for zip_range in data.get("zip_ranges", []):
                    if len(zip_range) == 2 and zip_range[0] <= zip_int <= zip_range[1]:
                        return data
        except (ValueError, TypeError):
            pass

    return DEFAULT_CITY_DATA


def _micro_analysis(city_data: dict, zip_code: str | None, property_type: str) -> dict:
    """
    Generate micro-location analysis based on city tier and zip code.
    """
    tier = city_data.get("tier", "C-Stadt")
    base_scores = {
        "A-Stadt": {
            "neighborhood_rating": 7.5,
            "public_transport_score": 8.5,
            "amenities_score": 8.0,
            "walkability_score": 7.8,
        },
        "B-Stadt": {
            "neighborhood_rating": 6.5,
            "public_transport_score": 7.0,
            "amenities_score": 6.5,
            "walkability_score": 6.5,
        },
        "C-Stadt": {
            "neighborhood_rating": 5.0,
            "public_transport_score": 5.0,
            "amenities_score": 5.0,
            "walkability_score": 5.0,
        },
    }

    scores = base_scores.get(tier, base_scores["C-Stadt"]).copy()

    # Estimate vacancy rate for area based on property type
    cap_rates = city_data.get("typical_cap_rates", {})
    vacancy_estimates = {
        "A-Stadt": {"RESIDENTIAL": 1.5, "OFFICE": 5.0, "RETAIL": 6.0, "INDUSTRIAL": 4.0, "MIXED": 4.5},
        "B-Stadt": {"RESIDENTIAL": 3.0, "OFFICE": 8.0, "RETAIL": 9.0, "INDUSTRIAL": 6.0, "MIXED": 7.0},
        "C-Stadt": {"RESIDENTIAL": 5.0, "OFFICE": 12.0, "RETAIL": 14.0, "INDUSTRIAL": 10.0, "MIXED": 11.0},
    }
    vacancy_rate = vacancy_estimates.get(tier, vacancy_estimates["C-Stadt"]).get(property_type, 8.0)

    # Rent level context
    rent_keys = {
        "OFFICE": "typical_rent_office_sqm",
        "RETAIL": "typical_rent_retail_sqm",
        "RESIDENTIAL": "typical_rent_resi_sqm",
        "INDUSTRIAL": "typical_rent_office_sqm",  # fallback
        "MIXED": "typical_rent_office_sqm",
    }
    rent_key = rent_keys.get(property_type, "typical_rent_office_sqm")
    typical_rent = city_data.get(rent_key, 0)

    development_potential = {
        "A-Stadt": "hoch – starke Nachfrage, begrenzte Neubauflächen",
        "B-Stadt": "mittel – wachsender Markt mit Aufholpotenzial",
        "C-Stadt": "begrenzt – Leerstandsrisiken, selektive Nachfrage",
    }.get(tier, "unbekannt")

    return {
        "neighborhood_rating": round(scores["neighborhood_rating"], 1),
        "public_transport_score": round(scores["public_transport_score"], 1),
        "amenities_score": round(scores["amenities_score"], 1),
        "walkability_score": round(scores["walkability_score"], 1),
        "vacancy_rate_area_pct": vacancy_rate,
        "typical_rent_sqm": typical_rent,
        "rent_level_comparison": (
            "überdurchschnittlich" if tier == "A-Stadt" else
            "durchschnittlich" if tier == "B-Stadt" else
            "unterdurchschnittlich"
        ),
        "development_potential": development_potential,
        "cap_rate_reference_pct": cap_rates.get(property_type, cap_rates.get("OFFICE", 5.0)),
    }


def _identify_risks(city_data: dict, property_type: str) -> list[str]:
    """Generate risk factors based on city data and property type."""
    risks = []
    tier = city_data.get("tier", "C-Stadt")
    unemployment = city_data.get("unemployment_rate", 8.0)
    market_trend = city_data.get("real_estate_market_trend", "neutral")

    if tier == "C-Stadt":
        risks.append("Leerstandsrisiko durch strukturellen Nachfragerückgang")
        risks.append("Begrenzte Exit-Möglichkeiten durch dünnen Investitionsmarkt")

    if unemployment > 9:
        risks.append(f"Erhöhte Arbeitslosigkeit ({unemployment}%) belastet Mieternachfrage")

    if property_type == "RETAIL":
        risks.append("Strukturwandel im Einzelhandel durch E-Commerce-Wachstum")
        risks.append("Steigende Leerstände in B-/C-Lagen des Einzelhandels")

    if property_type == "OFFICE":
        risks.append("Homeoffice-Trend erhöht Flächeneffizienz, Nachfrage nach Qualitätsflächen differenziert")

    if market_trend in ("negativ", "rückläufig"):
        risks.append("Aktueller Markttrend zeigt Preiskorrektur")

    if city_data.get("gdp_growth", 1.5) < 1.0:
        risks.append("Schwaches Wirtschaftswachstum der Region")

    risks.append("Steigende Zinsen erhöhen Refinanzierungsrisiken")
    risks.append("GEG 2024: ESG-Anforderungen erfordern energetische Investitionen")

    return risks[:6]  # Cap at 6 risks


def _identify_opportunities(city_data: dict, property_type: str) -> list[str]:
    """Generate opportunities based on city data and property type."""
    opportunities = []
    tier = city_data.get("tier", "C-Stadt")
    population_trend = city_data.get("population_trend", "stabil")

    if tier == "A-Stadt":
        opportunities.append("A-Stadt-Lage mit stabiler institutioneller Nachfrage")
        opportunities.append("Internationale Investoren erhöhen Liquidität und Exit-Optionen")

    if "wachsend" in population_trend:
        opportunities.append(f"Bevölkerungswachstum ({population_trend}) stützt Mieternachfrage langfristig")

    if property_type == "RESIDENTIAL":
        opportunities.append("Wohnraummangel in Ballungszentren stützt Mietpreisentwicklung")

    if property_type == "INDUSTRIAL":
        opportunities.append("E-Commerce-Boom treibt Nachfrage nach Logistikflächen")
        opportunities.append("Nearshoring-Trend erhöht Industrieflächennachfrage")

    if tier == "B-Stadt":
        opportunities.append("B-Stadt-Investments bieten attraktive Risk-Return-Profile")
        opportunities.append("Nachholpotenzial gegenüber A-Städten bei weiterer Urbanisierung")

    opportunities.append("ESG-konforme Objekte erzielen Premiummieten und niedrigere Leerstandsquoten")

    return opportunities[:5]  # Cap at 5 opportunities


def _calculate_overall_score(city_data: dict, micro: dict, property_type: str) -> int:
    """Calculate overall location score 0–100."""
    city_rating = city_data.get("city_rating", 5.5)
    infra_score = city_data.get("infrastructure_score", 5.5)
    eco_diversity = city_data.get("economic_diversity_score", 5.0)
    neighborhood = micro.get("neighborhood_rating", 5.0)
    public_transport = micro.get("public_transport_score", 5.0)

    # Weighted average of scores (all on 1-10 scale)
    weighted = (
        city_rating * 0.25
        + infra_score * 0.20
        + eco_diversity * 0.15
        + neighborhood * 0.20
        + public_transport * 0.20
    )

    # Normalize to 0–100
    score = (weighted / 10) * 100
    return round(min(100, max(0, score)))


def _generate_recommendation(overall_score: int, city_data: dict, property_type: str) -> str:
    """Generate a qualitative investment recommendation."""
    tier = city_data.get("tier", "C-Stadt")
    market_trend = city_data.get("real_estate_market_trend", "neutral")

    if overall_score >= 80:
        base = "Sehr attraktiver Standort für langfristige Investitionen."
    elif overall_score >= 65:
        base = "Solider Standort mit guten Fundamentaldaten."
    elif overall_score >= 50:
        base = "Standort mit gemischten Signalen – sorgfältige Due Diligence erforderlich."
    else:
        base = "Erhöhte Standortrisiken – konservative Bewertungsansätze empfohlen."

    type_comment = {
        "OFFICE": f" Für Büroimmobilien gilt: Qualität und Flexibilität der Flächen sind entscheidend ({tier}-Lage).",
        "RETAIL": f" Einzelhandelsflächen in {tier}-Lagen profitieren von starker Fußfrequenz und Einzugsgebiet.",
        "RESIDENTIAL": f" Wohnimmobilien in {tier}-Städten bieten {market_trend.replace('sehr ', '').replace(' ', '')} Mietpreisentwicklung.",
        "INDUSTRIAL": f" Logistik-/Industriestandort mit {market_trend} Marktdynamik.",
        "MIXED": f" Gemischt genutzte Objekte bieten Diversifikation im {tier}-Markt.",
    }.get(property_type, "")

    return base + type_comment


def analyze_location(params: dict) -> dict:
    """
    Perform macro and micro location analysis for a German property.

    params:
        city (str):           City name
        zip_code (str|None):  Postal code
        address (str|None):   Street address
        property_type (str):  RESIDENTIAL/OFFICE/RETAIL/INDUSTRIAL/MIXED
    """
    city = params.get("city", "")
    zip_code = params.get("zip_code", "")
    address = params.get("address", "")
    property_type = params.get("property_type", "OFFICE")

    # Lookup city data
    city_data = _lookup_city_data(city, zip_code)
    tier = city_data.get("tier", "C-Stadt")

    # Macro analysis
    macro_analysis = {
        "city_tier": tier,
        "city_rating": city_data.get("city_rating"),
        "population_trend": city_data.get("population_trend"),
        "population": city_data.get("population"),
        "gdp_growth_pct": city_data.get("gdp_growth"),
        "unemployment_rate_pct": city_data.get("unemployment_rate"),
        "real_estate_market_trend": city_data.get("real_estate_market_trend"),
        "infrastructure_score": city_data.get("infrastructure_score"),
        "economic_diversity_score": city_data.get("economic_diversity_score"),
        "typical_cap_rates_pct": city_data.get("typical_cap_rates", {}),
        "rental_market": {
            "typical_office_rent_sqm": city_data.get("typical_rent_office_sqm"),
            "typical_retail_rent_sqm": city_data.get("typical_rent_retail_sqm"),
            "typical_residential_rent_sqm": city_data.get("typical_rent_resi_sqm"),
        },
    }

    # Micro analysis
    micro_analysis = _micro_analysis(city_data, zip_code, property_type)

    # Risk factors
    risk_factors = _identify_risks(city_data, property_type)

    # Opportunities
    opportunities = _identify_opportunities(city_data, property_type)

    # Overall score
    overall_score = _calculate_overall_score(city_data, micro_analysis, property_type)

    # Recommendation
    recommendation = _generate_recommendation(overall_score, city_data, property_type)

    # Score breakdown
    score_breakdown = {
        "makrolage": round(city_data.get("city_rating", 5.5) * 10),
        "infrastruktur": round(city_data.get("infrastructure_score", 5.5) * 10),
        "wirtschaftsstruktur": round(city_data.get("economic_diversity_score", 5.0) * 10),
        "mikrolage": round(micro_analysis["neighborhood_rating"] * 10),
        "erreichbarkeit": round(micro_analysis["public_transport_score"] * 10),
        "gesamt": overall_score,
    }

    return {
        "standort": {
            "city": city,
            "zip_code": zip_code,
            "address": address,
            "property_type": property_type,
        },
        "macro_analysis": macro_analysis,
        "micro_analysis": micro_analysis,
        "risk_factors": risk_factors,
        "opportunities": opportunities,
        "overall_score": overall_score,
        "score_breakdown": score_breakdown,
        "recommendation": recommendation,
        "data_source": "Internes Referenzdatenbankmodell (Stand 2024) – für professionelle Gutachten externe Marktdaten heranziehen.",
    }
