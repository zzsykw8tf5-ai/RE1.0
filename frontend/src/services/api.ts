import axios from 'axios';
import type { Property, FullAnalysis, GermanValuationResult, USValuationResult, DCFResult, LocationAnalysis, RiskResult, Scenario } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
});

// ---- Properties ----
export const getProperties = (): Promise<Property[]> =>
  api.get('/api/properties').then(r => r.data);

export const getProperty = (id: number): Promise<Property> =>
  api.get(`/api/properties/${id}`).then(r => r.data);

export const deleteProperty = (id: number): Promise<void> =>
  api.delete(`/api/properties/${id}`).then(r => r.data);

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

export const downloadTemplate = (): void => {
  window.open(`${BASE_URL}/api/upload/template`, '_blank');
};

// ---- Analysis ----
export const runFullAnalysis = (propertyId: number): Promise<FullAnalysis> =>
  api.get(`/api/analysis/full/${propertyId}`).then(r => r.data);

export const runGermanValuation = (propertyId: number, params?: Record<string, number>): Promise<GermanValuationResult> =>
  api.post(`/api/analysis/german-valuation/${propertyId}`, params || {}).then(r => r.data);

export const runUSValuation = (propertyId: number, params?: Record<string, number>): Promise<USValuationResult> =>
  api.post(`/api/analysis/us-valuation/${propertyId}`, params || {}).then(r => r.data);

export const runDCF = (propertyId: number, params?: Record<string, number>): Promise<DCFResult> =>
  api.post(`/api/analysis/dcf/${propertyId}`, params || {}).then(r => r.data);

export const runLocationAnalysis = (propertyId: number): Promise<LocationAnalysis> =>
  api.post(`/api/analysis/location/${propertyId}`, {}).then(r => r.data);

export const runRiskModel = (propertyId: number, params?: Record<string, number>): Promise<RiskResult> =>
  api.post(`/api/analysis/risk/${propertyId}`, params || {}).then(r => r.data);

export const saveScenario = (propertyId: number, data: { name: string; description: string; params: Record<string, number>; results: unknown }): Promise<Scenario> =>
  api.post(`/api/analysis/scenario/${propertyId}`, data).then(r => r.data);

export const getScenarios = (propertyId: number): Promise<Scenario[]> =>
  api.get(`/api/analysis/scenarios/${propertyId}`).then(r => r.data);

// ---- Reports ----
export const downloadReport = (propertyId: number): void => {
  window.open(`${BASE_URL}/api/reports/${propertyId}`, '_blank');
};

export const checkHealth = (): Promise<{ status: string }> =>
  api.get('/api/health').then(r => r.data);

export default api;
