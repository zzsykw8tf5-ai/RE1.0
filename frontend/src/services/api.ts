import axios from 'axios';
import type { Property, FullAnalysis, GermanValuationResult, USValuationResult, DCFResult, LocationAnalysis, RiskResult, Scenario, RentalArea, GifTypes, AreaRentEstimate, OsmBuildingEstimate, HealthcareResearch } from '../types';
import { DEMO_PROPERTIES, DEMO_ANALYSIS } from '../data/demoData';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// Check connectivity once
let backendAvailable: boolean | null = null;
async function isBackendUp(): Promise<boolean> {
  if (IS_DEMO) return false;
  if (backendAvailable !== null) return backendAvailable;
  try {
    await api.get('/api/health');
    backendAvailable = true;
  } catch {
    backendAvailable = false;
  }
  return backendAvailable;
}

// ---- Properties ----
export const getProperties = async (): Promise<Property[]> => {
  if (await isBackendUp()) return api.get('/api/properties').then(r => r.data);
  return DEMO_PROPERTIES;
};

export const getProperty = async (id: number): Promise<Property> => {
  if (await isBackendUp()) return api.get(`/api/properties/${id}`).then(r => r.data);
  return DEMO_PROPERTIES.find(p => p.id === id) ?? DEMO_PROPERTIES[0];
};

export const deleteProperty = async (id: number): Promise<void> => {
  if (await isBackendUp()) return api.delete(`/api/properties/${id}`).then(r => r.data);
};

export const updateProperty = async (id: number, data: Partial<{
  name: string; address: string; city: string; zip_code: string;
  property_type: string; construction_year: number; total_area_sqm: number;
  land_area_sqm: number; floors: number; units: number;
  purchase_price: number; purchase_date: string;
}>): Promise<Property> =>
  api.patch(`/api/properties/${id}`, data).then(r => r.data);

// ---- Upload ----
export const uploadExcel = (file: File): Promise<Property> => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/api/upload/excel', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const uploadPDF = (file: File): Promise<Record<string, unknown>> => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/api/upload/pdf', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const importFromImmoscout = (url: string): Promise<Property> =>
  api.post('/api/upload/immoscout', { url }).then(r => r.data);

// ---- Market data ----
export const getMarketData = (params: {
  city: string; property_type?: string; area_sqm?: number;
  purchase_price?: number; construction_year?: number;
}): Promise<Record<string, unknown>> =>
  api.get('/api/market-data', { params }).then(r => r.data);

// ---- Tenant management ----
export const addTenant = (propertyId: number, data: {
  name: string; unit?: string; area_sqm?: number; monthly_rent?: number;
  lease_start?: string; lease_end?: string; tenant_type?: string; creditworthiness?: string;
}): Promise<import('../types').Tenant> =>
  api.post(`/api/properties/${propertyId}/tenants`, data).then(r => r.data);

export const deleteTenant = (propertyId: number, tenantId: number): Promise<void> =>
  api.delete(`/api/properties/${propertyId}/tenants/${tenantId}`).then(r => r.data);

export const updateTenant = (propertyId: number, tenantId: number, data: {
  name: string; unit?: string; area_sqm?: number; monthly_rent?: number;
  lease_start?: string; lease_end?: string; tenant_type?: string; creditworthiness?: string;
}): Promise<import('../types').Tenant> =>
  api.patch(`/api/properties/${propertyId}/tenants/${tenantId}`, data).then(r => r.data);

export const createProperty = async (data: {
  name: string; address?: string; city?: string; zip_code?: string;
  property_type?: string; construction_year?: number; total_area_sqm?: number;
  land_area_sqm?: number; floors?: number; units?: number; purchase_price?: number;
  purchase_date?: string;
}): Promise<Property> => {
  if (!(await isBackendUp())) {
    throw new Error('Backend nicht verfügbar. Bitte stelle sicher, dass der Server läuft.');
  }
  return api.post('/api/properties', data).then(r => r.data);
};

export const downloadTemplate = async (): Promise<void> => {
  if (!(await isBackendUp())) {
    alert('Excel-Vorlage ist nur mit aktivem Backend verfügbar.\nBitte stelle sicher, dass RAILWAY_API_URL als GitHub Secret gesetzt ist.');
    return;
  }
  // Fetch as blob via CORS-permitted request, then create local blob URL
  const resp = await api.get('/api/upload/template', { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(resp.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'RE_Analyst_Vorlage.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
};

// ---- Analysis ----
export const runFullAnalysis = async (propertyId: number): Promise<FullAnalysis> => {
  if (await isBackendUp()) return api.get(`/api/analysis/full/${propertyId}`).then(r => r.data);
  return { ...DEMO_ANALYSIS, property: DEMO_PROPERTIES.find(p => p.id === propertyId) ?? DEMO_ANALYSIS.property };
};

export const runGermanValuation = async (propertyId: number, params?: Record<string, number>): Promise<GermanValuationResult> => {
  if (await isBackendUp()) return api.post(`/api/analysis/german-valuation/${propertyId}`, params || {}).then(r => r.data);
  return DEMO_ANALYSIS.german_valuation;
};

export const runUSValuation = async (propertyId: number, params?: Record<string, number>): Promise<USValuationResult> => {
  if (await isBackendUp()) return api.post(`/api/analysis/us-valuation/${propertyId}`, params || {}).then(r => r.data);
  return DEMO_ANALYSIS.us_valuation;
};

export const runDCF = async (propertyId: number, params?: Record<string, number>): Promise<DCFResult> => {
  if (await isBackendUp()) return api.post(`/api/analysis/dcf/${propertyId}`, params || {}).then(r => r.data);
  const base = DEMO_ANALYSIS.dcf;
  if (params && Object.keys(params).length > 0) return _applyScenarioToDemoData(base, params);
  return base;
};

export const runLocationAnalysis = async (propertyId: number): Promise<LocationAnalysis> => {
  if (await isBackendUp()) return api.post(`/api/analysis/location/${propertyId}`, {}).then(r => r.data);
  return DEMO_ANALYSIS.location;
};

export const runRiskModel = async (propertyId: number, params?: Record<string, number>): Promise<RiskResult> => {
  if (await isBackendUp()) return api.post(`/api/analysis/risk/${propertyId}`, params || {}).then(r => r.data);
  return DEMO_ANALYSIS.risk;
};

export const saveScenario = async (propertyId: number, data: { name: string; description: string; params: Record<string, number>; results: unknown }): Promise<Scenario> => {
  if (await isBackendUp()) return api.post(`/api/analysis/scenario/${propertyId}`, data).then(r => r.data);
  const stored = JSON.parse(localStorage.getItem(`scenarios_${propertyId}`) || '[]') as Scenario[];
  const newS: Scenario = {
    id: Date.now(), property_id: propertyId, name: data.name,
    description: data.description, params_json: JSON.stringify(data.params),
    results_json: JSON.stringify(data.results), created_at: new Date().toISOString(),
  };
  localStorage.setItem(`scenarios_${propertyId}`, JSON.stringify([newS, ...stored]));
  return newS;
};

export const getScenarios = async (propertyId: number): Promise<Scenario[]> => {
  if (await isBackendUp()) return api.get(`/api/analysis/scenarios/${propertyId}`).then(r => r.data);
  return JSON.parse(localStorage.getItem(`scenarios_${propertyId}`) || '[]');
};

// ---- Reports ----
export const downloadReport = async (propertyId: number): Promise<void> => {
  if (await isBackendUp()) { window.open(`${BASE_URL}/api/reports/${propertyId}`, '_blank'); return; }
  alert('PDF-Report steht nur mit aktivem Backend zur Verfügung.\nStarten Sie das Backend lokal: uvicorn app.main:app --port 8000');
};

export const checkHealth = (): Promise<{ status: string }> =>
  api.get('/api/health').then(r => r.data);

// ---- News ----
export interface NewsItem { title: string; link: string; pubDate: string; source: string; }
export const getNews = (q: string): Promise<{ items: NewsItem[] }> =>
  api.get('/api/news', { params: { q } }).then(r => r.data);

// ---- Tenant suggestions ----
export interface TenantSuggestion { name: string; is_company: boolean; type_label?: string; }
export const suggestTenants = (address: string, city: string = '', property_type: string = ''): Promise<{ suggestions: TenantSuggestion[] }> =>
  api.get('/api/suggest-tenants', { params: { address, city, property_type } }).then(r => r.data);

// ---- Company search (Clearbit autocomplete + DuckDuckGo fallback) ----
export interface CompanySuggestion { name: string; domain: string; logo: string; is_company: boolean; source: string; }
export const companySearch = (name: string): Promise<{ suggestions: CompanySuggestion[] }> =>
  api.get('/api/company-search', { params: { name } }).then(r => r.data);

// ---- Rental Areas ----
export const getGifTypes = (): Promise<GifTypes> =>
  api.get('/api/gif-types').then(r => r.data);

export const getAreaRent = (params: {
  nutzungsart: string; city: string; area_sqm?: number; lage_qualitaet?: string;
}): Promise<AreaRentEstimate> =>
  api.get('/api/area-rent', { params }).then(r => r.data);

export const getOsmEstimate = (propertyId: number): Promise<OsmBuildingEstimate> =>
  api.get(`/api/properties/${propertyId}/areas/osm-estimate`).then(r => r.data);

export const listAreas = (propertyId: number): Promise<RentalArea[]> =>
  api.get(`/api/properties/${propertyId}/areas`).then(r => r.data);

export const createArea = (propertyId: number, data: {
  nutzungsart?: string; etage?: string; lage_qualitaet?: string | null;
  name?: string | null; area_sqm?: number | null; market_rent_sqm?: number | null;
  beds?: number | null; status?: string; notes?: string | null;
}): Promise<RentalArea> =>
  api.post(`/api/properties/${propertyId}/areas`, data).then(r => r.data);

export const updateArea = (propertyId: number, areaId: number, data: Partial<{
  nutzungsart: string; etage: string; lage_qualitaet: string | null;
  name: string | null; area_sqm: number | null; market_rent_sqm: number | null;
  beds: number | null; status: string; notes: string | null;
}>): Promise<RentalArea> =>
  api.patch(`/api/properties/${propertyId}/areas/${areaId}`, data).then(r => r.data);

export const deleteArea = (propertyId: number, areaId: number): Promise<void> =>
  api.delete(`/api/properties/${propertyId}/areas/${areaId}`).then(r => r.data);

export const parseMapsUrl = (url: string): Promise<{ address: string; city: string; zip_code: string; raw: string; error?: string }> =>
  api.get('/api/parse-maps-url', { params: { url } }).then(r => r.data);

export const geocodeAddress = (address: string): Promise<{ lat: number | null; lng: number | null }> =>
  api.get('/api/geocode', { params: { address } }).then(r => r.data);

export const uploadPropertyPhoto = (propertyId: number, file: File): Promise<Property> => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/api/properties/${propertyId}/photo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const deletePropertyPhoto = (propertyId: number): Promise<void> =>
  api.delete(`/api/properties/${propertyId}/photo`).then(r => r.data);

export const getHealthcareResearch = (nutzungsart: string): Promise<HealthcareResearch> =>
  api.get(`/api/healthcare-research/${nutzungsart}`).then(r => r.data);

export const searchMdkQuality = (name: string, city: string) =>
  api.get('/api/mdk-search', { params: { name, city } }).then(r => r.data);

// ---- Google Reviews ----
export interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  time: string;
  profile_photo: string;
}
export interface GoogleReviewsResult {
  available: boolean;
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  maps_url?: string;
  search_url?: string;
  reviews?: GoogleReview[];
  query: string;
  reason?: string;
}
export const getGoogleReviews = (name: string, address?: string, city?: string): Promise<GoogleReviewsResult> =>
  api.get('/api/google-reviews', { params: { name, address: address ?? '', city: city ?? '' } }).then(r => r.data);

// ---- Demo mode: lightweight scenario simulation ----
function _applyScenarioToDemoData(base: DCFResult, params: Record<string, number>): DCFResult {
  const rentGrowth = params.rent_growth_rate ?? 0.02;
  const vacancy = params.vacancy_rate ?? 0.05;
  const discountRate = params.discount_rate ?? 0.065;
  const exitCap = params.exit_cap_rate ?? 0.045;
  const ltv = params.ltv ?? 0.65;
  const interestRate = params.interest_rate ?? 0.045;
  const purchasePrice = base.params_used?.purchase_price as number ?? 12500000;
  const equityInvested = purchasePrice * (1 - ltv);
  const debtService = purchasePrice * ltv * interestRate * 1.15;
  const capex = purchasePrice * (params.capex_rate ?? 0.015);

  const cfs = base.yearly_cashflows.map((cf, i) => {
    const growth = Math.pow(1 + rentGrowth, i);
    const grossIncome = Math.round(cf.gross_income * growth);
    const vacancyLoss = Math.round(grossIncome * vacancy);
    const effIncome = grossIncome - vacancyLoss;
    const opex = Math.round(effIncome * 0.25);
    const noi = effIncome - opex;
    const cfbt = noi - debtService - capex;
    return { ...cf, gross_income: grossIncome, vacancy_loss: vacancyLoss, effective_income: effIncome, operating_expenses: opex, noi, debt_service: Math.round(debtService), capex: Math.round(capex), cash_flow_before_tax: Math.round(cfbt), noi_yield: +(noi / purchasePrice * 100).toFixed(2) };
  });

  let cum = 0;
  cfs.forEach(cf => { cum += cf.cash_flow_before_tax; cf.cumulative_cf = Math.round(cum); });

  const lastNOI = cfs[cfs.length - 1].noi;
  const terminalValue = Math.round(lastNOI / exitCap);
  const saleProceeds = Math.round(terminalValue * 0.97);
  const cashFlows = [-equityInvested, ...cfs.map(cf => cf.cash_flow_before_tax)];
  cashFlows[cashFlows.length - 1] += saleProceeds;
  const totalEquityReturn = Math.round(cashFlows.slice(1).reduce((a, b) => a + b, 0));

  let irr = 0.08;
  for (let i = 0; i < 100; i++) {
    const npvV = cashFlows.reduce((s, c, j) => s + c / Math.pow(1 + irr, j), 0);
    const npvD = cashFlows.reduce((s, c, j) => j > 0 ? s - j * c / Math.pow(1 + irr, j + 1) : s, 0);
    if (Math.abs(npvD) < 1e-10) break;
    const newIrr = irr - npvV / npvD;
    if (Math.abs(newIrr - irr) < 1e-8) { irr = newIrr; break; }
    irr = newIrr;
  }
  const npv = Math.round(cashFlows.reduce((s, c, j) => s + c / Math.pow(1 + discountRate, j), 0));
  const coc = cfs.map(cf => +(cf.cash_flow_before_tax / equityInvested * 100).toFixed(2));
  const em = +(totalEquityReturn / equityInvested).toFixed(2);

  return {
    ...base,
    yearly_cashflows: cfs,
    terminal_value: terminalValue,
    sale_proceeds: saleProceeds,
    total_equity_return: totalEquityReturn,
    metrics: {
      ...base.metrics,
      irr: +irr.toFixed(4),
      npv,
      equity_multiple: em,
      cash_on_cash_returns: coc,
      avg_cash_on_cash: +(coc.reduce((a, b) => a + b, 0) / coc.length).toFixed(2),
      equity_invested: equityInvested,
    },
  };
}

export default api;
