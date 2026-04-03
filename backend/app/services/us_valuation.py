"""
US real estate valuation per USPAP (Uniform Standards of Professional Appraisal Practice).

Implements the three approaches to value:
1. Income Approach (Direct Capitalization)
2. Sales Comparison Approach
3. Cost Approach

Plus ancillary analyses: GRM, combined reconciliation.
"""

import math
from typing import Any


# ─── Market defaults ──────────────────────────────────────────────────────────

CAP_RATE_DEFAULTS = {
    "RESIDENTIAL": 0.055,
    "OFFICE":      0.065,
    "RETAIL":      0.070,
    "INDUSTRIAL":  0.060,
    "MIXED":       0.065,
}

REPLACEMENT_COST_DEFAULTS = {
    # USD per sq ft, approximate US 2024 construction costs
    "RESIDENTIAL": 160,
    "OFFICE":      200,
    "RETAIL":      175,
    "INDUSTRIAL":  90,
    "MIXED":       180,
}

EXPENSE_RATIO_DEFAULTS = {
    "RESIDENTIAL": 0.40,
    "OFFICE":      0.35,
    "RETAIL":      0.30,
    "INDUSTRIAL":  0.25,
    "MIXED":       0.35,
}

ECONOMIC_LIFE_DEFAULTS = {
    "RESIDENTIAL": 40,
    "OFFICE":      45,
    "RETAIL":      40,
    "INDUSTRIAL":  35,
    "MIXED":       40,
}


def income_approach(params: dict) -> dict:
    """
    Direct Capitalization – Income Approach per USPAP.

    Required params:
        gross_rental_income (float):   Potential Gross Income (PGI) in $/year
        vacancy_rate (float):          Vacancy & collection loss (0–1, e.g. 0.05)
        operating_expenses (float):    Annual operating expenses ($)
        cap_rate (float):              Overall capitalization rate (e.g. 0.065)

    Optional params:
        other_income (float):          Other income (parking, laundry, etc.)
        property_type (str):           For defaults
        reserves (float):              Capital reserves per year ($)
    """
    pgi = float(params.get("gross_rental_income", 0))
    vacancy_rate = float(params.get("vacancy_rate", 0.05))
    operating_expenses = float(params.get("operating_expenses", 0))
    cap_rate = float(params.get("cap_rate", 0.065))
    other_income = float(params.get("other_income", 0))
    reserves = float(params.get("reserves", 0))
    property_type = params.get("property_type", "OFFICE")

    # If no operating expenses provided, use default ratio
    if operating_expenses == 0 and pgi > 0:
        expense_ratio = EXPENSE_RATIO_DEFAULTS.get(property_type, 0.35)
        effective_gross_income = pgi * (1 - vacancy_rate) + other_income
        operating_expenses = effective_gross_income * expense_ratio

    # Step 1: Effective Gross Income (EGI)
    vacancy_loss = pgi * vacancy_rate
    egi = pgi - vacancy_loss + other_income

    # Step 2: Net Operating Income (NOI)
    noi = egi - operating_expenses - reserves

    # Step 3: Indicated Value via Direct Cap
    value = noi / cap_rate if cap_rate > 0 else 0

    # Metrics
    expense_ratio_actual = operating_expenses / egi if egi > 0 else 0
    gross_income_multiplier = value / pgi if pgi > 0 else 0
    value_per_unit = None  # Would need unit count

    # Sensitivity to cap rate ±50bps
    value_low_cap = noi / (cap_rate - 0.005) if (cap_rate - 0.005) > 0 else 0
    value_high_cap = noi / (cap_rate + 0.005) if (cap_rate + 0.005) > 0 else 0

    return {
        "approach": "Income Approach – Direct Capitalization (USPAP)",
        "inputs": {
            "potential_gross_income": round(pgi, 2),
            "vacancy_rate_pct": round(vacancy_rate * 100, 1),
            "other_income": round(other_income, 2),
            "operating_expenses": round(operating_expenses, 2),
            "cap_rate_pct": round(cap_rate * 100, 2),
            "reserves": round(reserves, 2),
        },
        "income_analysis": {
            "potential_gross_income": round(pgi, 2),
            "vacancy_loss": round(vacancy_loss, 2),
            "effective_gross_income": round(egi, 2),
            "operating_expenses": round(operating_expenses, 2),
            "net_operating_income": round(noi, 2),
        },
        "gross_income": round(pgi, 2),
        "effective_gross_income": round(egi, 2),
        "noi": round(noi, 2),
        "value": round(value, 2),
        "metrics": {
            "expense_ratio_pct": round(expense_ratio_actual * 100, 1),
            "gross_income_multiplier": round(gross_income_multiplier, 2),
            "noi_yield_pct": round(cap_rate * 100, 2),
        },
        "cap_rate_sensitivity": {
            f"value_at_{round((cap_rate-0.005)*100,1)}pct": round(value_low_cap, 2),
            f"value_at_{round(cap_rate*100,1)}pct": round(value, 2),
            f"value_at_{round((cap_rate+0.005)*100,1)}pct": round(value_high_cap, 2),
        },
        "details": {
            "vacancy_loss": round(vacancy_loss, 2),
            "effective_gross_income": round(egi, 2),
        },
    }


def sales_comparison_approach(params: dict) -> dict:
    """
    Sales Comparison Approach per USPAP.

    Required params:
        subject_area_sqft (float):     Subject property size (sq ft)

    Optional params:
        comparables (list[dict]):      Each with {price, area, adjustments: {key: amount}}
                                       OR {price_sqft, adjustments: {key: pct}}
        subject_adjustments (dict):    Adjustments applied to subject vs comps

    Returns:
        adjusted_value_per_sqft, indicated_value, details
    """
    subject_area_sqft = float(params.get("subject_area_sqft", 0))
    comparables = params.get("comparables", [])

    if not comparables:
        return {
            "approach": "Sales Comparison Approach (USPAP)",
            "error": "No comparable sales provided",
            "indicated_value": 0,
            "adjusted_value_per_sqft": 0,
        }

    comp_details = []
    adjusted_prices_sqft = []

    for i, comp in enumerate(comparables):
        sale_price = float(comp.get("price", comp.get("sale_price", 0)))
        area_sqft = float(comp.get("area", comp.get("area_sqft", 0)))

        if area_sqft > 0:
            price_sqft = sale_price / area_sqft
        else:
            price_sqft = float(comp.get("price_sqft", 0))

        if price_sqft == 0:
            continue

        # Apply adjustments (can be dollar amounts or percentages)
        adjustments = comp.get("adjustments", {})
        total_adj_pct = 0
        total_adj_dollar = 0
        adj_detail = {}

        for adj_name, adj_val in adjustments.items():
            if isinstance(adj_val, (int, float)):
                if abs(adj_val) <= 1:
                    # Treat as percentage
                    total_adj_pct += float(adj_val)
                    adj_detail[adj_name] = {"type": "pct", "value": adj_val}
                else:
                    # Treat as dollar/sqft amount
                    total_adj_dollar += float(adj_val)
                    adj_detail[adj_name] = {"type": "dollar_sqft", "value": adj_val}

        adjusted_price_sqft = price_sqft * (1 + total_adj_pct) + total_adj_dollar
        adjusted_prices_sqft.append(adjusted_price_sqft)

        total_gross_adj = abs(total_adj_pct) + abs(total_adj_dollar / price_sqft if price_sqft else 0)

        comp_details.append({
            "comparable": i + 1,
            "address": comp.get("address", comp.get("adresse", f"Comp {i+1}")),
            "sale_price": round(sale_price, 2),
            "area_sqft": round(area_sqft, 0) if area_sqft else None,
            "unadjusted_price_sqft": round(price_sqft, 2),
            "adjustments": adj_detail,
            "net_adjustment_pct": round(total_adj_pct * 100, 1),
            "gross_adjustment_pct": round(total_gross_adj * 100, 1),
            "adjusted_price_sqft": round(adjusted_price_sqft, 2),
        })

    if not adjusted_prices_sqft:
        return {
            "approach": "Sales Comparison Approach (USPAP)",
            "error": "No valid comparables after processing",
            "indicated_value": 0,
        }

    # Reconcile comparable values (simple mean and median)
    mean_sqft = sum(adjusted_prices_sqft) / len(adjusted_prices_sqft)
    sorted_prices = sorted(adjusted_prices_sqft)
    n = len(sorted_prices)
    median_sqft = sorted_prices[n // 2] if n % 2 != 0 else (sorted_prices[n//2-1] + sorted_prices[n//2]) / 2

    # Weight most comparable (least gross adjustment) more heavily
    # Simple approach: use median for reconciled value
    reconciled_sqft = median_sqft
    indicated_value = subject_area_sqft * reconciled_sqft

    # Reconciliation range
    range_low = subject_area_sqft * min(adjusted_prices_sqft)
    range_high = subject_area_sqft * max(adjusted_prices_sqft)

    return {
        "approach": "Sales Comparison Approach (USPAP)",
        "inputs": {
            "subject_area_sqft": round(subject_area_sqft, 0),
            "number_of_comparables": len(comp_details),
        },
        "comparables": comp_details,
        "reconciliation": {
            "mean_price_sqft": round(mean_sqft, 2),
            "median_price_sqft": round(median_sqft, 2),
            "min_price_sqft": round(min(adjusted_prices_sqft), 2),
            "max_price_sqft": round(max(adjusted_prices_sqft), 2),
            "reconciled_price_sqft": round(reconciled_sqft, 2),
        },
        "adjusted_value_per_sqft": round(reconciled_sqft, 2),
        "indicated_value": round(indicated_value, 2),
        "value_range": {
            "low": round(range_low, 2),
            "high": round(range_high, 2),
        },
        "details": comp_details,
    }


def cost_approach(params: dict) -> dict:
    """
    Cost Approach per USPAP.

    Required params:
        land_value (float):            Site value ($)
        area_sqft (float):             Building area (sq ft)
        age_years (int):               Actual age of improvements

    Optional params:
        replacement_cost_sqft (float): Cost to replace per sq ft (default by type)
        effective_age (int):           Effective age (may differ from actual age)
        economic_life (int):           Total economic life of improvements
        physical_deterioration (float): Additional physical deterioration ($)
        functional_obsolescence (float): Functional obsolescence ($)
        external_obsolescence (float):  External obsolescence ($)
        property_type (str):           For defaults
    """
    land_value = float(params.get("land_value", 0))
    area_sqft = float(params.get("area_sqft", 0))
    age_years = int(params.get("age_years", 10))
    property_type = params.get("property_type", "OFFICE")

    rc_default = REPLACEMENT_COST_DEFAULTS.get(property_type, 180)
    replacement_cost_sqft = float(params.get("replacement_cost_sqft", rc_default))

    economic_life = int(params.get("economic_life", ECONOMIC_LIFE_DEFAULTS.get(property_type, 40)))
    effective_age = int(params.get("effective_age", age_years))
    physical_deterioration = float(params.get("physical_deterioration", 0))
    functional_obsolescence = float(params.get("functional_obsolescence", 0))
    external_obsolescence = float(params.get("external_obsolescence", 0))

    # Reproduction/Replacement Cost New (RCN)
    replacement_cost = replacement_cost_sqft * area_sqft

    # Depreciation via Age-Life Method
    if economic_life > 0:
        depreciation_rate = min(effective_age / economic_life, 1.0)
    else:
        depreciation_rate = 0

    # Physical depreciation (age-life)
    physical_depreciation_age_life = replacement_cost * depreciation_rate

    # Additional physical deterioration (curable/incurable)
    total_physical = physical_depreciation_age_life + physical_deterioration

    # Total depreciation
    total_depreciation = total_physical + functional_obsolescence + external_obsolescence
    total_depreciation = min(total_depreciation, replacement_cost)

    # Depreciated value of improvements
    depreciated_value = replacement_cost - total_depreciation
    depreciated_value = max(0, depreciated_value)

    # Total value
    total_value = land_value + depreciated_value

    remaining_life = max(0, economic_life - effective_age)

    return {
        "approach": "Cost Approach (USPAP)",
        "inputs": {
            "land_value": round(land_value, 2),
            "area_sqft": round(area_sqft, 0),
            "replacement_cost_sqft": round(replacement_cost_sqft, 2),
            "actual_age_years": age_years,
            "effective_age_years": effective_age,
            "economic_life_years": economic_life,
        },
        "cost_analysis": {
            "replacement_cost_new": round(replacement_cost, 2),
            "depreciation": {
                "physical_age_life": round(physical_depreciation_age_life, 2),
                "physical_additional": round(physical_deterioration, 2),
                "functional_obsolescence": round(functional_obsolescence, 2),
                "external_obsolescence": round(external_obsolescence, 2),
                "total_depreciation": round(total_depreciation, 2),
                "depreciation_rate_pct": round(depreciation_rate * 100, 1),
            },
        },
        "replacement_cost": round(replacement_cost, 2),
        "depreciation": round(total_depreciation, 2),
        "depreciated_value": round(depreciated_value, 2),
        "total_value": round(total_value, 2),
        "details": {
            "land_value": round(land_value, 2),
            "improvements_value": round(depreciated_value, 2),
            "remaining_economic_life": remaining_life,
            "land_to_value_ratio_pct": round(land_value / total_value * 100, 1) if total_value > 0 else 0,
        },
    }


def grm_analysis(params: dict) -> dict:
    """
    Gross Rent Multiplier (GRM) Analysis.

    params:
        sale_price (float):            Property sale price ($)
        gross_monthly_rent (float):    Monthly gross rent ($)
        gross_annual_rent (float):     Annual gross rent ($ – alternative to monthly)
        comparable_grms (list[float]): GRM from comparable sales
        property_type (str):           For context
    """
    sale_price = float(params.get("sale_price", 0))
    gross_monthly_rent = float(params.get("gross_monthly_rent", 0))
    gross_annual_rent = float(params.get("gross_annual_rent", gross_monthly_rent * 12))
    comparable_grms = [float(g) for g in params.get("comparable_grms", [])]
    property_type = params.get("property_type", "RESIDENTIAL")

    # Calculate subject GRM if we have both price and rent
    subject_grm = None
    if sale_price > 0 and gross_annual_rent > 0:
        subject_grm = sale_price / gross_annual_rent
    elif sale_price > 0 and gross_monthly_rent > 0:
        subject_grm = sale_price / (gross_monthly_rent * 12)

    # Market GRM from comparables
    market_grm = None
    indicated_value_grm = None
    if comparable_grms:
        market_grm = sum(comparable_grms) / len(comparable_grms)
        if gross_annual_rent > 0:
            indicated_value_grm = market_grm * gross_annual_rent
        elif gross_monthly_rent > 0:
            indicated_value_grm = market_grm * gross_monthly_rent * 12

    # Typical GRM ranges by property type (annual)
    typical_grm_ranges = {
        "RESIDENTIAL": (8, 15),
        "OFFICE": (7, 12),
        "RETAIL": (7, 13),
        "INDUSTRIAL": (6, 11),
        "MIXED": (7, 13),
    }
    typical_range = typical_grm_ranges.get(property_type, (7, 13))

    return {
        "approach": "Gross Rent Multiplier Analysis",
        "inputs": {
            "sale_price": round(sale_price, 2),
            "gross_annual_rent": round(gross_annual_rent, 2),
            "gross_monthly_rent": round(gross_annual_rent / 12, 2) if gross_annual_rent else 0,
        },
        "subject_grm": round(subject_grm, 2) if subject_grm else None,
        "market_grm": round(market_grm, 2) if market_grm else None,
        "indicated_value": round(indicated_value_grm, 2) if indicated_value_grm else None,
        "comparable_grms": comparable_grms,
        "typical_grm_range": {
            "property_type": property_type,
            "low": typical_range[0],
            "high": typical_range[1],
        },
        "interpretation": (
            "Subject GRM is within typical market range."
            if subject_grm and typical_range[0] <= subject_grm <= typical_range[1]
            else (
                "Subject GRM is above typical market range – property may be overpriced or rents below market."
                if subject_grm and subject_grm > typical_range[1]
                else "Subject GRM is below typical market range – property may be underpriced or rents above market."
                if subject_grm
                else "Insufficient data for GRM analysis."
            )
        ),
    }


def combined_us_valuation(params: dict) -> dict:
    """
    Combined US valuation with reconciliation of all three approaches.

    Applies USPAP reconciliation principles – weights applied based on
    data quality and relevance to property type.

    params:
        All params for individual approaches, plus:
        weight_income (float):        Weight for income approach (0–1)
        weight_sales (float):         Weight for sales comparison (0–1)
        weight_cost (float):          Weight for cost approach (0–1)
    """
    property_type = params.get("property_type", "OFFICE")

    # Default weights by property type (USPAP-aligned)
    if property_type == "RESIDENTIAL":
        default_weights = {"income": 0.3, "sales": 0.6, "cost": 0.1}
    elif property_type == "INDUSTRIAL":
        default_weights = {"income": 0.5, "sales": 0.3, "cost": 0.2}
    elif property_type in ("OFFICE", "RETAIL", "MIXED"):
        default_weights = {"income": 0.6, "sales": 0.3, "cost": 0.1}
    else:
        default_weights = {"income": 0.5, "sales": 0.4, "cost": 0.1}

    w_income = float(params.get("weight_income", default_weights["income"]))
    w_sales = float(params.get("weight_sales", default_weights["sales"]))
    w_cost = float(params.get("weight_cost", default_weights["cost"]))

    # Normalize
    w_total = w_income + w_sales + w_cost
    if w_total > 0:
        w_income /= w_total
        w_sales /= w_total
        w_cost /= w_total

    # Run individual approaches
    income_result = income_approach(params)
    sales_result = sales_comparison_approach(params)
    cost_result = cost_approach(params)
    grm_result = grm_analysis(params)

    income_value = income_result.get("value", 0)
    sales_value = sales_result.get("indicated_value", 0)
    cost_value = cost_result.get("total_value", 0)

    # Adjust weights if any approach is 0 (data not provided)
    active_approaches = {
        "income": income_value > 0,
        "sales": sales_value > 0,
        "cost": cost_value > 0,
    }

    effective_weights = {}
    active_weight_sum = 0
    for approach, is_active in active_approaches.items():
        if approach == "income":
            w = w_income
        elif approach == "sales":
            w = w_sales
        else:
            w = w_cost
        effective_weights[approach] = w if is_active else 0
        if is_active:
            active_weight_sum += w

    # Normalize active weights
    if active_weight_sum > 0:
        for k in effective_weights:
            effective_weights[k] /= active_weight_sum

    # Reconciled value
    reconciled_value = (
        income_value * effective_weights.get("income", 0)
        + sales_value * effective_weights.get("sales", 0)
        + cost_value * effective_weights.get("cost", 0)
    )

    # Confidence assessment
    active_count = sum(1 for v in active_approaches.values() if v)
    if active_count == 3:
        confidence = "high"
    elif active_count == 2:
        confidence = "medium"
    else:
        confidence = "low"

    # Range analysis
    values = [v for v in [income_value, sales_value, cost_value] if v > 0]
    value_range_low = min(values) if values else 0
    value_range_high = max(values) if values else 0

    return {
        "approach": "Combined US Valuation – USPAP Reconciliation",
        "individual_approaches": {
            "income_approach": income_result,
            "sales_comparison": sales_result,
            "cost_approach": cost_result,
            "grm_analysis": grm_result,
        },
        "approach_values": {
            "income_approach": round(income_value, 2),
            "sales_comparison": round(sales_value, 2),
            "cost_approach": round(cost_value, 2),
        },
        "weights_applied": {
            "income_approach": round(effective_weights.get("income", 0), 3),
            "sales_comparison": round(effective_weights.get("sales", 0), 3),
            "cost_approach": round(effective_weights.get("cost", 0), 3),
        },
        "reconciled_value": round(reconciled_value, 2),
        "value_range": {
            "low": round(value_range_low, 2),
            "high": round(value_range_high, 2),
        },
        "confidence": confidence,
        "reconciliation_narrative": (
            f"The income approach ({round(effective_weights.get('income', 0)*100)}% weight) "
            f"indicates ${income_value:,.0f}. "
            + (
                f"The sales comparison approach ({round(effective_weights.get('sales', 0)*100)}% weight) "
                f"indicates ${sales_value:,.0f}. "
                if sales_value > 0 else ""
            )
            + (
                f"The cost approach ({round(effective_weights.get('cost', 0)*100)}% weight) "
                f"indicates ${cost_value:,.0f}. "
                if cost_value > 0 else ""
            )
            + f"Reconciled value: ${reconciled_value:,.0f}."
        ),
    }
