export type PropertyType = 'RESIDENTIAL' | 'OFFICE' | 'RETAIL' | 'INDUSTRIAL' | 'MIXED';
export type TenantType = 'ANCHOR' | 'STANDARD' | 'SMALL';
export type Creditworthiness = 'A' | 'B' | 'C';
export type RiskCategory = 'Niedrig' | 'Mittel' | 'Erhöht' | 'Hoch';

export interface Property {
  id: number;
  name: string;
  address: string;
  city: string;
  zip_code: string;
  property_type: PropertyType;
  construction_year: number;
  total_area_sqm: number;
  land_area_sqm: number;
  floors: number;
  units: number;
  purchase_price: number;
  purchase_date: string;
  photo_url?: string | null;
  created_at: string;
  tenants?: Tenant[];
}

export interface Tenant {
  id: number;
  property_id: number;
  name: string;
  unit: string;
  area_sqm: number;
  monthly_rent: number;
  annual_rent: number;
  lease_start: string;
  lease_end: string;
  tenant_type: TenantType;
  creditworthiness: Creditworthiness;
}

export interface Scenario {
  id: number;
  property_id: number;
  name: string;
  description: string;
  params_json: string;
  results_json: string;
  created_at: string;
}

// ---- German Valuation ----
export interface GermanValuationResult {
  ertragswertverfahren: {
    jahresrohertrag: number;
    bewirtschaftungskosten: number;
    reinertrag: number;
    liegenschaftszinsanteil: number;
    gebaeude_reinertrag: number;
    vervielfaeltiger: number;
    gebaeude_ertragswert: number;
    bodenwert: number;
    ertragswert: number;
  };
  vergleichswertverfahren: {
    flaeche_sqm: number;
    ø_vergleichspreis_sqm: number;
    lage_faktor: number;
    ausstattung_faktor: number;
    vergleichswert: number;
  };
  sachwertverfahren: {
    bodenwert: number;
    gebaeude_sachwert: number;
    marktanpassungsfaktor: number;
    sachwert: number;
  };
  combined: {
    ertragswert_weight: number;
    vergleichswert_weight: number;
    sachwert_weight: number;
    final_value: number;
    price_per_sqm: number;
    gross_initial_yield: number;
  };
  params_used: Record<string, number>;
}

// ---- US Valuation ----
export interface USValuationResult {
  income_approach: {
    gross_rental_income: number;
    vacancy_loss: number;
    effective_gross_income: number;
    operating_expenses: number;
    noi: number;
    cap_rate: number;
    value: number;
  };
  sales_comparison: {
    value_per_sqft: number;
    total_area_sqft: number;
    indicated_value: number;
    adjustments: string[];
  };
  cost_approach: {
    land_value: number;
    replacement_cost: number;
    total_depreciation: number;
    depreciated_value: number;
    total_value: number;
  };
  grm: {
    gross_rent_multiplier: number;
    grm_value: number;
  };
  combined: {
    income_weight: number;
    sales_weight: number;
    cost_weight: number;
    final_value_usd: number;
    final_value_eur: number;
    price_per_sqft: number;
    cap_rate: number;
  };
}

// ---- DCF ----
export interface DCFYearlyCashflow {
  year: number;
  gross_income: number;
  vacancy_loss: number;
  effective_income: number;
  operating_expenses: number;
  noi: number;
  debt_service: number;
  capex: number;
  cash_flow_before_tax: number;
  cumulative_cf: number;
  noi_yield: number;
}

export interface DCFResult {
  yearly_cashflows: DCFYearlyCashflow[];
  terminal_value: number;
  sale_proceeds: number;
  total_equity_return: number;
  metrics: {
    npv: number;
    irr: number;
    equity_multiple: number;
    cash_on_cash_returns: number[];
    avg_cash_on_cash: number;
    dscr: number[];
    min_dscr: number;
    payback_period: number;
    total_investment: number;
    equity_invested: number;
  };
  sensitivity: {
    rent_growth_scenarios: SensitivityRow[];
    exit_cap_scenarios: SensitivityRow[];
  };
  params_used: Record<string, number>;
}

export interface SensitivityRow {
  label: string;
  irr: number;
  npv: number;
  equity_multiple: number;
}

// ---- Location ----
export interface LocationAnalysis {
  macro: {
    city_tier: string;
    city_rating: number;
    population_trend: string;
    gdp_growth: number;
    unemployment_rate: number;
    real_estate_market_trend: string;
    infrastructure_score: number;
    economic_diversity_score: number;
    facts: string[];
  };
  micro: {
    neighborhood_rating: number;
    public_transport_score: number;
    amenities_score: number;
    walkability_score: number;
    vacancy_rate_area: number;
    rent_level_comparison: string;
    development_potential: string;
  };
  risk_factors: string[];
  opportunities: string[];
  overall_score: number;
  recommendation: string;
  city: string;
  zip_code: string;
  data_source?: string;
}

// ---- Risk ----
export interface RiskResult {
  scores: {
    market_risk: number;
    tenant_risk: number;
    structural_risk: number;
    liquidity_risk: number;
    financial_risk: number;
    regulatory_risk: number;
  };
  overall_risk_score: number;
  risk_category: RiskCategory;
  stress_tests: {
    interest_rate_shock: { impact_value: number; impact_cashflow: number; label: string };
    vacancy_shock: { impact_value: number; impact_cashflow: number; label: string };
    rent_decline: { impact_value: number; impact_cashflow: number; label: string };
    cap_rate_expansion: { impact_value: number; impact_cashflow: number; label: string };
  };
  recommendations: string[];
  lease_expiry_profile: { year: string; area_sqm: number; rent_pa: number }[];
  tenant_concentration: { name: string; share_pct: number }[];
}

// ---- Rental Areas (gif MF/G 2017) ----
export interface RentalArea {
  id: number;
  property_id: number;
  nutzungsart: string;
  nutzungsart_label: string;
  etage: string;
  etage_label: string;
  lage_qualitaet: string | null;
  lage_label: string;
  name: string;
  area_sqm: number | null;
  market_rent_sqm: number | null;
  beds: number | null;
  status: string;
  status_label: string;
  notes: string | null;
  created_at: string | null;
}

export interface HealthcareResearch {
  label: string;
  yield_range: string;
  rent_range?: string;
  rent_per_bed_day?: string;
  typical_lease?: string;
  operators?: string[];
  mdk_quality?: {
    source: string;
    note: string;
    url?: string;
    transparenz_url?: string;
    grades?: string[];
    indicators?: string[];
    live_search?: boolean;
  };
  regulation?: string;
  risk_factors?: string[];
  market_trends?: string;
}

export interface GifTypes {
  nutzungsarten: { key: string; label: string }[];
  etagen: { key: string; label: string }[];
  lage_qualitaeten: { key: string; label: string }[];
  status_optionen: { key: string; label: string }[];
}

export interface AreaRentEstimate {
  nutzungsart: string;
  nutzungsart_label: string;
  lage_qualitaet: string | null;
  city: string;
  area_sqm: number;
  rent_min: number;
  rent_avg: number;
  rent_max: number;
  source: string;
}

export interface OsmBuildingEstimate {
  estimate: {
    footprint_sqm: number;
    floors: number;
    estimated_gfa_sqm: number;
    estimated_land_sqm: number;
    building_type: string;
    building_name: string;
  } | null;
  lat?: number;
  lng?: number;
  error?: string;
  source?: string;
}

// ---- Full Analysis ----
export interface FullAnalysis {
  property: Property;
  german_valuation: GermanValuationResult;
  us_valuation: USValuationResult;
  dcf: DCFResult;
  location: LocationAnalysis;
  risk: RiskResult;
}
