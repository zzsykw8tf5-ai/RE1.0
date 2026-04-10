import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, Plus, Trash2,
  TrendingUp, Info, CheckCircle2, AlertCircle, Building2, Search,
} from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { getProperty, getMarketData, addTenant, deleteTenant, updateTenant, suggestTenants, companySearch, listAreas, updateArea } from '../services/api';
import type { Property, Tenant, RentalArea } from '../types';
import type { TenantSuggestion, CompanySuggestion } from '../services/api';

const COMMERCIAL_TYPES = ['OFFICE', 'RETAIL', 'INDUSTRIAL', 'MIXED'];

const TODAY = new Date().toISOString().slice(0, 10);

const LEASE_DURATION_YEARS: Record<string, number> = {
  BUERO: 5, EINZELHANDEL: 10, LAGER: 5, PRODUKTION: 7,
  GASTRONOMIE: 10, PRAXIS: 5, WOHNEN: 1, HOTEL: 15, SONSTIGES: 3,
};

function leaseEndDate(nutzungsart: string): string {
  const years = LEASE_DURATION_YEARS[nutzungsart] ?? 5;
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface MarketData {
  city: string;
  market_tier: string;
  property_type: string;
  area_sqm: number;
  market_rent: {
    min_per_sqm: number; avg_per_sqm: number; max_per_sqm: number; prime_per_sqm: number;
    annual_at_min: number; annual_at_avg: number; annual_at_max: number;
    unit: string;
  };
  bodenrichtwert: { wohn_avg: number; gewerbe_avg: number; unit: string; note: string };
  cap_rate: { min: number; avg: number; max: number; implied: number | null };
  multiplier: { min: number; avg: number; max: number; implied: number };
  vacancy_rate_typical: number;
  cost_defaults: {
    vacancy_rate: number;
    verwaltung_pct: number;
    instandhaltung_per_sqm: number;
    instandhaltung_annual: number;
    versicherung_per_sqm: number;
    versicherung_annual: number;
    sonstige_pct: number;
    nicht_umlagefaehig_pct: number;
    note: string;
  };
  data_sources: string;
}

interface TenantRow {
  id?: number;       // set after save
  area_id?: number;  // linked rental area
  name: string;
  unit: string;
  area_sqm: string;
  monthly_rent: string;
  lease_start: string;
  lease_end: string;
  tenant_type: string;
  creditworthiness: string;
  saved: boolean;
  saving: boolean;
  editing: boolean;   // true when editing a previously saved row
  error: string;
}

interface CostRow {
  label: string;
  key: string;
  value: number;
  unit: '€/Jahr' | '% Rohertrag' | '€/m²/Jahr';
  editable: boolean;
  note?: string;
}

const emptyTenant = (): TenantRow => ({
  area_id: undefined,
  name: '', unit: '', area_sqm: '', monthly_rent: '',
  lease_start: '', lease_end: '',
  tenant_type: 'STANDARD', creditworthiness: 'B',
  saved: false, saving: false, editing: false, error: '',
});

const TENANT_TYPES = ['ANCHOR', 'STANDARD', 'SMALL'];
const CRED = ['A', 'B', 'C'];
const fmt = (n: number) => new Intl.NumberFormat('de-DE').format(Math.round(n));
const fmtEur = (n: number) => `${fmt(n)} €`;

// ── Step indicator ──────────────────────────────────────────────────────────────

function Steps({ current }: { current: number }) {
  const steps = ['Mieterliste', 'Bewirtschaftungskosten'];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-apple text-sm font-medium transition-all ${
            i === current ? 'bg-apple-blue text-white' :
            i < current  ? 'bg-green-100 text-green-700' :
                           'bg-apple-gray-2 text-apple-text-tertiary'
          }`}>
            {i < current
              ? <CheckCircle2 size={14} />
              : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-xs">{i + 1}</span>
            }
            {label}
          </div>
          {i < steps.length - 1 && <div className="w-6 h-px bg-apple-gray-3 mx-1" />}
        </div>
      ))}
    </div>
  );
}

// ── Market rent badge ─────────────────────────────────────────────────────────

function MarketBadge({ market }: { market: MarketData }) {
  const r = market.market_rent;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-apple p-4 mb-6">
      <div className="flex items-start gap-2">
        <TrendingUp size={15} className="text-apple-blue mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-xs font-semibold text-apple-blue mb-1">
            Marktmiete {market.city.charAt(0).toUpperCase() + market.city.slice(1)} · {market.property_type} · {market.market_tier}-Lage
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-apple-text-secondary">
            <span><span className="font-medium text-apple-text">{r.min_per_sqm}–{r.max_per_sqm} €</span>/m²/Monat</span>
            <span>Ø <span className="font-medium text-apple-text">{r.avg_per_sqm} €/m²</span></span>
            <span>Jahresmiete Ø <span className="font-medium text-apple-text">{fmtEur(r.annual_at_avg)}</span></span>
          </div>
          <div className="text-[10px] text-apple-text-tertiary mt-1">{market.data_sources}</div>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Mieterliste ───────────────────────────────────────────────────────

function TenantStep({
  property, market, savedTenants, areas, initialAreaId, onTenantAdded, onTenantDeleted, onNext,
}: {
  property: Property;
  market: MarketData | null;
  savedTenants: Tenant[];
  areas: RentalArea[];
  initialAreaId?: number;
  onTenantAdded: (t: Tenant) => void;
  onTenantDeleted: (id: number) => void;
  onNext: () => void;
}) {
  // Pre-populate rows from already-saved tenants so they can be edited/deleted
  const [rows, setRows] = useState<TenantRow[]>(() => {
    const preloaded: TenantRow[] = savedTenants.map(t => ({
      id: t.id,
      name: t.name,
      unit: t.unit || '',
      area_sqm: t.area_sqm != null ? String(t.area_sqm) : '',
      monthly_rent: t.monthly_rent != null ? String(t.monthly_rent) : '',
      lease_start: t.lease_start ? String(t.lease_start).slice(0, 10) : '',
      lease_end: t.lease_end ? String(t.lease_end).slice(0, 10) : '',
      tenant_type: t.tenant_type || 'STANDARD',
      creditworthiness: t.creditworthiness || 'B',
      saved: true, saving: false, editing: false, error: '',
    }));
    const firstRow = emptyTenant();
    if (initialAreaId) {
      const area = areas.find(a => a.id === initialAreaId);
      if (area) {
        firstRow.area_id = area.id;
        firstRow.unit = area.name;
        firstRow.area_sqm = area.area_sqm != null ? String(area.area_sqm) : '';
        firstRow.monthly_rent = area.market_rent_sqm && area.area_sqm
          ? String(Math.round(area.market_rent_sqm * area.area_sqm)) : '';
        firstRow.lease_start = TODAY;
        firstRow.lease_end = leaseEndDate(area.nutzungsart);
      }
    }
    return [...preloaded, firstRow];
  });
  const [suggestions, setSuggestions] = useState<TenantSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestFired = useRef(false);
  const [nameDropdown, setNameDropdown] = useState<{ rowIdx: number; results: CompanySuggestion[] } | null>(null);
  const nameSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCommercial = COMMERCIAL_TYPES.includes(property.property_type);

  // Auto-load address-based tenant suggestions once on mount
  useEffect(() => {
    if (!isCommercial || !property.address || suggestFired.current) return;
    suggestFired.current = true;
    setSuggestLoading(true);
    suggestTenants(property.address, property.city ?? '')
      .then(r => setSuggestions(r.suggestions))
      .catch(() => {})
      .finally(() => setSuggestLoading(false));
  }, [isCommercial, property.address, property.city]);

  const handleNameChange = (i: number, value: string) => {
    updateRow(i, { name: value });
    if (nameSearchTimer.current) clearTimeout(nameSearchTimer.current);
    setNameDropdown(null);
    if (value.trim().length >= 3) {
      nameSearchTimer.current = setTimeout(async () => {
        try {
          const res = await companySearch(value.trim());
          if (res.suggestions.length > 0) setNameDropdown({ rowIdx: i, results: res.suggestions });
        } catch { /* silently ignore */ }
      }, 420);
    }
  };

  const applyNameSuggestion = (i: number, name: string) => {
    updateRow(i, { name });
    setNameDropdown(null);
  };

  const totalAnnualRent = savedTenants.reduce((s, t) => s + (t.annual_rent || 0), 0);
  const totalArea = savedTenants.reduce((s, t) => s + (t.area_sqm || 0), 0);
  const occupancyPct = property.total_area_sqm > 0 ? (totalArea / property.total_area_sqm) * 100 : 0;

  const updateRow = (i: number, patch: Partial<TenantRow>) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const handleSuggestTenants = async () => {
    if (!property.address) return;
    setSuggestLoading(true);
    try {
      const res = await suggestTenants(property.address, property.city ?? '');
      setSuggestions(res.suggestions);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  };

  const applySuggestion = (name: string) => {
    // Fill the first empty row or add a new one
    const emptyIdx = rows.findIndex(r => !r.name && !r.saved);
    if (emptyIdx >= 0) {
      updateRow(emptyIdx, { name });
    } else {
      setRows(rs => [...rs, { ...emptyTenant(), name }]);
    }
    setSuggestions(prev => prev.filter(s => s.name !== name));
  };

  const suggestRent = useCallback((areaStr: string): string => {
    if (!market || !areaStr) return '';
    const area = parseFloat(areaStr);
    if (isNaN(area) || area <= 0) return '';
    return String(Math.round(market.market_rent.avg_per_sqm * area));
  }, [market]);

  const handleAreaBlur = (i: number, val: string) => {
    const row = rows[i];
    if (!row.monthly_rent && val) {
      const suggested = suggestRent(val);
      if (suggested) updateRow(i, { monthly_rent: suggested });
    }
  };

  const handleSave = async (i: number) => {
    const row = rows[i];
    if (!row.name.trim()) return;
    updateRow(i, { saving: true, error: '' });
    const linkedArea = row.area_id ? areas.find(a => a.id === row.area_id) : undefined;
    const leaseStart = row.lease_start || TODAY;
    const leaseEnd = row.lease_end || (linkedArea ? leaseEndDate(linkedArea.nutzungsart) : '');
    try {
      const tenant = await addTenant(property.id, {
        name: row.name,
        unit: row.unit || undefined,
        area_sqm: row.area_sqm ? parseFloat(row.area_sqm) : undefined,
        monthly_rent: row.monthly_rent ? parseFloat(row.monthly_rent) : undefined,
        lease_start: leaseStart,
        lease_end: leaseEnd || undefined,
        tenant_type: row.tenant_type,
        creditworthiness: row.creditworthiness,
      });
      updateRow(i, { saved: true, saving: false, id: tenant.id, lease_start: leaseStart, lease_end: leaseEnd });
      onTenantAdded(tenant);
      if (row.area_id) {
        try { await updateArea(property.id, row.area_id, { status: 'VERMIETET' }); } catch { /* ignore */ }
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      updateRow(i, { saving: false, error: detail || 'Speichern fehlgeschlagen' });
    }
  };

  const handleUpdate = async (i: number) => {
    const row = rows[i];
    if (!row.name.trim() || !row.id) return;
    updateRow(i, { saving: true, error: '' });
    const linkedArea = row.area_id ? areas.find(a => a.id === row.area_id) : undefined;
    const leaseStart = row.lease_start || TODAY;
    const leaseEnd = row.lease_end || (linkedArea ? leaseEndDate(linkedArea.nutzungsart) : '');
    try {
      const tenant = await updateTenant(property.id, row.id, {
        name: row.name,
        unit: row.unit || undefined,
        area_sqm: row.area_sqm ? parseFloat(row.area_sqm) : undefined,
        monthly_rent: row.monthly_rent ? parseFloat(row.monthly_rent) : undefined,
        lease_start: leaseStart,
        lease_end: leaseEnd || undefined,
        tenant_type: row.tenant_type,
        creditworthiness: row.creditworthiness,
      });
      updateRow(i, { saved: true, saving: false, editing: false });
      onTenantDeleted(tenant.id);
      onTenantAdded(tenant);
      if (row.area_id) {
        try { await updateArea(property.id, row.area_id, { status: 'VERMIETET' }); } catch { /* ignore */ }
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      updateRow(i, { saving: false, error: detail || 'Aktualisierung fehlgeschlagen' });
    }
  };

  const handleDelete = async (tenantId: number, rowIdx: number) => {
    await deleteTenant(property.id, tenantId);
    setRows(rs => rs.filter((_, i) => i !== rowIdx));
    onTenantDeleted(tenantId);
  };

  const addFullOccupancy = async () => {
    if (!market) return;
    const area = property.total_area_sqm || 1000;
    const monthly = Math.round(market.market_rent.avg_per_sqm * area);
    const tenant = await addTenant(property.id, {
      name: 'Vollvermietung (Marktmiete)',
      area_sqm: area,
      monthly_rent: monthly,
      tenant_type: 'STANDARD',
      creditworthiness: 'B',
    });
    onTenantAdded(tenant);
    setRows(rs => [
      ...rs,
      { ...emptyTenant(), saved: true, id: tenant.id,
        name: 'Vollvermietung (Marktmiete)',
        area_sqm: String(area), monthly_rent: String(monthly) },
    ]);
  };

  const inputCls = 'w-full px-2 py-1.5 rounded border border-apple-gray-3 text-xs focus:outline-none focus:border-apple-blue bg-white';

  return (
    <div>
      {market && <MarketBadge market={market} />}

      {/* Address-based tenant suggestions */}
      {isCommercial && property.address && (suggestLoading || suggestions.length > 0) && (
        <div className="mb-4 rounded-apple border border-apple-blue/30 bg-blue-50/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-apple-blue/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-apple-blue">
              <Building2 size={14} />
              Bekannte Gewerbemieter – {property.address}{property.city ? `, ${property.city}` : ''}
            </div>
            <button
              onClick={handleSuggestTenants}
              disabled={suggestLoading}
              className="text-[11px] text-apple-blue hover:underline disabled:opacity-50 flex items-center gap-1"
            >
              {suggestLoading ? <LoadingSpinner /> : <Search size={11} />}
              {suggestLoading ? 'Suche läuft…' : 'Neu suchen'}
            </button>
          </div>
          <div className="px-4 py-3">
            {suggestLoading && suggestions.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-apple-text-tertiary">
                <LoadingSpinner /> Suche nach Gewerbermieter an dieser Adresse…
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => applySuggestion(s.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-white border border-apple-blue/30 text-apple-text hover:bg-blue-100 hover:border-apple-blue transition-colors shadow-sm"
                  >
                    <Building2 size={10} className="text-apple-blue flex-shrink-0" />
                    <span>{s.name}</span>
                    {s.type_label && <span className="text-[10px] text-apple-text-tertiary">· {s.type_label}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary bar */}
      {savedTenants.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-4 p-3 bg-apple-gray-1 rounded-apple text-xs">
          <span><span className="font-semibold">{savedTenants.length}</span> Mieter</span>
          <span>Gesamtfläche vermietet: <span className="font-semibold">{fmt(totalArea)} m²</span></span>
          <span>Vermietungsstand: <span className={`font-semibold ${occupancyPct >= 90 ? 'text-apple-green' : occupancyPct >= 70 ? 'text-yellow-600' : 'text-apple-red'}`}>{Math.round(occupancyPct)} %</span></span>
          <span>Jahresmiete (IST): <span className="font-semibold text-apple-blue">{fmtEur(totalAnnualRent)}</span></span>
        </div>
      )}

      {/* Tenant rows */}
      <div className="space-y-3 mb-4">
        {rows.map((row, i) => (
          <div key={i} className={`border rounded-apple p-3 ${
            row.saved && !row.editing
              ? row.name.toLowerCase().startsWith('leerstand')
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-green-200 bg-green-50/30'
              : 'border-apple-gray-3 bg-white'
          }`}>
            {row.saved && !row.editing ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {row.name.toLowerCase().startsWith('leerstand')
                    ? <AlertCircle size={14} className="text-amber-500" />
                    : <CheckCircle2 size={14} className="text-apple-green" />
                  }
                  <span className="font-medium">{row.name}</span>
                  {row.area_sqm && <span className="text-apple-text-secondary">{row.area_sqm} m²</span>}
                  {row.monthly_rent && !row.name.toLowerCase().startsWith('leerstand') && (
                    <span className="text-apple-blue font-medium">{fmtEur(parseFloat(row.monthly_rent))}/Monat</span>
                  )}
                  {row.monthly_rent && row.name.toLowerCase().startsWith('leerstand') && (
                    <span className="text-amber-600 text-xs">Potenzial: {fmtEur(parseFloat(row.monthly_rent))}/Monat</span>
                  )}
                  {row.lease_end && <span className="text-apple-text-tertiary text-xs">bis {row.lease_end}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {row.name.toLowerCase().startsWith('leerstand') ? (
                    <button onClick={() => updateRow(i, { saved: false, editing: true, name: '' })}
                      className="text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded transition-colors font-medium">
                      Vermieten
                    </button>
                  ) : (
                    <button onClick={() => updateRow(i, { saved: false, editing: true })}
                      className="text-xs text-apple-blue hover:bg-blue-50 px-2 py-0.5 rounded transition-colors">
                      Bearbeiten
                    </button>
                  )}
                  {row.id && (
                    <button onClick={() => handleDelete(row.id!, i)} className="text-apple-text-tertiary hover:text-apple-red transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {areas.length > 0 && (
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-[10px] text-apple-text-secondary mb-0.5">Fläche zuordnen</label>
                    <select
                      className={inputCls}
                      value={row.area_id ?? ''}
                      onChange={e => {
                        const areaId = e.target.value ? Number(e.target.value) : undefined;
                        const area = areaId ? areas.find(a => a.id === areaId) : undefined;
                        updateRow(i, {
                          area_id: areaId,
                          unit: area ? area.name : row.unit,
                          area_sqm: area?.area_sqm != null ? String(area.area_sqm) : row.area_sqm,
                          monthly_rent: area?.market_rent_sqm && area?.area_sqm
                            ? String(Math.round(area.market_rent_sqm * area.area_sqm)) : row.monthly_rent,
                          lease_start: area ? (row.lease_start || TODAY) : row.lease_start,
                          lease_end: area ? (row.lease_end || leaseEndDate(area.nutzungsart)) : row.lease_end,
                        });
                      }}
                    >
                      <option value="">– Keine Fläche –</option>
                      {areas.filter(a =>
                        (a.status === 'VERFUEGBAR' && !rows.some((r, ri) => ri !== i && r.saved && r.area_id === a.id))
                        || a.id === row.area_id
                      ).map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.area_sqm ?? '?'} m² · {a.nutzungsart_label})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-1 relative">
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">Mieter *</label>
                  <input
                    className={inputCls}
                    placeholder="Musterfirma GmbH"
                    value={row.name}
                    onChange={e => handleNameChange(i, e.target.value)}
                    onBlur={() => setTimeout(() => setNameDropdown(null), 200)}
                    autoComplete="off"
                  />
                  {nameDropdown && nameDropdown.rowIdx === i && nameDropdown.results.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 bg-white border border-apple-gray-3 rounded-apple shadow-lg mt-0.5 max-h-52 overflow-y-auto">
                      {nameDropdown.results.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); applyNameSuggestion(i, s.name); }}
                          className="w-full text-left px-3 py-2 hover:bg-apple-gray flex items-center gap-2 text-sm border-b border-apple-gray-2 last:border-0"
                        >
                          {s.logo ? (
                            <img src={s.logo} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <Building2 size={14} className="text-apple-text-tertiary flex-shrink-0" />
                          )}
                          <span className="font-medium text-apple-text truncate">{s.name}</span>
                          {s.domain && <span className="text-[10px] text-apple-text-tertiary ml-auto flex-shrink-0">{s.domain}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">Einheit</label>
                  <input className={inputCls} placeholder="EG-01" value={row.unit}
                    onChange={e => updateRow(i, { unit: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">Fläche m²</label>
                  <input type="number" className={inputCls} placeholder="500" value={row.area_sqm}
                    onChange={e => updateRow(i, { area_sqm: e.target.value })}
                    onBlur={e => handleAreaBlur(i, e.target.value)} />
                </div>
                <div>
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">
                    Kaltmiete/Monat €
                    {market && row.area_sqm && (
                      <button className="ml-1 text-apple-blue underline" onClick={() => updateRow(i, { monthly_rent: suggestRent(row.area_sqm) })}>
                        Ø {market.market_rent.avg_per_sqm} €/m²
                      </button>
                    )}
                  </label>
                  <input type="number" className={inputCls} placeholder="8.500" value={row.monthly_rent}
                    onChange={e => updateRow(i, { monthly_rent: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">Mietbeginn</label>
                  <input type="date" className={inputCls} value={row.lease_start}
                    onChange={e => updateRow(i, { lease_start: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">Mietende</label>
                  <input type="date" className={inputCls} value={row.lease_end}
                    onChange={e => updateRow(i, { lease_end: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">Mietertyp</label>
                  <select className={inputCls} value={row.tenant_type}
                    onChange={e => updateRow(i, { tenant_type: e.target.value })}>
                    {TENANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-apple-text-secondary mb-0.5">Bonität</label>
                  <select className={inputCls} value={row.creditworthiness}
                    onChange={e => updateRow(i, { creditworthiness: e.target.value })}>
                    {CRED.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-4 flex items-center gap-2 pt-1">
                  {row.editing ? (
                    <>
                      <button disabled={!row.name.trim() || row.saving} onClick={() => handleUpdate(i)}
                        className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50">
                        {row.saving ? <LoadingSpinner /> : <CheckCircle2 size={12} />}
                        Aktualisieren
                      </button>
                      <button onClick={() => updateRow(i, { saved: true, editing: false, error: '' })}
                        className="btn-secondary text-xs">
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <button disabled={!row.name.trim() || row.saving} onClick={() => handleSave(i)}
                      className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50">
                      {row.saving ? <LoadingSpinner /> : <CheckCircle2 size={12} />}
                      Mieter speichern
                    </button>
                  )}
                  {row.error && <span className="text-xs text-apple-red">{row.error}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>


      {/* Vacancy summary */}
      {property.total_area_sqm > 0 && (
        (() => {
          const vacantSqm = Math.max(0, property.total_area_sqm - totalArea);
          const vacantPct = Math.round((vacantSqm / property.total_area_sqm) * 100);
          if (vacantSqm <= 0) return null;
          return (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-apple flex items-center justify-between">
              <div className="text-xs">
                <span className="font-semibold text-amber-700">{fmt(vacantSqm)} m²</span>
                <span className="text-amber-600"> unvermietete Fläche ({vacantPct}%)</span>
              </div>
              <button
                onClick={() => {
                  const potentialRent = market ? Math.round(market.market_rent.avg_per_sqm * vacantSqm) : 0;
                  setRows(rs => [...rs, {
                    ...emptyTenant(),
                    name: 'Leerstand',
                    area_sqm: String(Math.round(vacantSqm)),
                    monthly_rent: potentialRent ? String(potentialRent) : '',
                  }]);
                }}
                className="text-xs btn-secondary border-amber-300 text-amber-700 hover:bg-amber-100 flex items-center gap-1"
              >
                <Plus size={11} /> Leerstand anlegen
              </button>
            </div>
          );
        })()
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button onClick={() => setRows(rs => [...rs, emptyTenant()])}
          className="btn-secondary text-xs flex items-center gap-1.5">
          <Plus size={12} /> Weiteren Mieter hinzufügen
        </button>
        {market && savedTenants.length === 0 && (
          <button onClick={addFullOccupancy}
            className="btn-ghost text-xs flex items-center gap-1.5 text-apple-blue">
            <TrendingUp size={12} /> Vollvermietung zu Marktmiete annehmen
          </button>
        )}
      </div>

      <div className="flex justify-between">
        <span className="text-xs text-apple-text-tertiary pt-2">
          {savedTenants.length === 0 ? 'Ohne Mieter wird mit Marktmiete gerechnet.' : ''}
        </span>
        <button onClick={onNext} className="btn-primary flex items-center gap-2">
          Weiter zu Bewirtschaftungskosten <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Bewirtschaftungskosten ────────────────────────────────────────────

function CostStep({
  property, market, onBack, onFinish,
}: {
  property: Property;
  market: MarketData | null;
  onBack: () => void;
  onFinish: () => void;
}) {
  const area = property.total_area_sqm || 1000;
  const cd = market?.cost_defaults;

  const [costs, setCosts] = useState<CostRow[]>(() => [
    {
      label: 'Leerstandsrate (Mietausfall)',
      key: 'vacancy',
      value: cd ? Math.round(cd.vacancy_rate * 100 * 10) / 10 : 6.0,
      unit: '% Rohertrag',
      editable: true,
      note: cd?.note || 'Standortüblicher Leerstand',
    },
    {
      label: 'Verwaltungskosten',
      key: 'verwaltung',
      value: cd ? Math.round(cd.verwaltung_pct * 100 * 10) / 10 : 3.0,
      unit: '% Rohertrag',
      editable: true,
      note: 'Hausverwaltung, Buchführung (gem. II. BV)',
    },
    {
      label: 'Instandhaltung / Capex',
      key: 'instandhaltung',
      value: cd ? cd.instandhaltung_per_sqm : 12.0,
      unit: '€/m²/Jahr',
      editable: true,
      note: `Gebäudealter berücksichtigt · ${cd ? fmtEur(cd.instandhaltung_annual) : '–'}/Jahr`,
    },
    {
      label: 'Gebäudeversicherung',
      key: 'versicherung',
      value: cd ? cd.versicherung_per_sqm : 0.5,
      unit: '€/m²/Jahr',
      editable: true,
      note: cd ? `≈ ${fmtEur(cd.versicherung_annual)}/Jahr` : '',
    },
    {
      label: 'Sonstige nicht-umlagefähige Kosten',
      key: 'sonstige',
      value: cd ? Math.round(cd.sonstige_pct * 100 * 10) / 10 : 2.0,
      unit: '% Rohertrag',
      editable: true,
      note: 'Grundsteuer-Anteil, Bankgebühren etc.',
    },
  ]);

  const update = (key: string, val: number) =>
    setCosts(cs => cs.map(c => c.key === key ? { ...c, value: val } : c));

  // Compute summary
  const vacancyPct = costs.find(c => c.key === 'vacancy')?.value ?? 6;
  const verwaltungPct = costs.find(c => c.key === 'verwaltung')?.value ?? 3;
  const instandhaltung = costs.find(c => c.key === 'instandhaltung')?.value ?? 12;
  const versicherung = costs.find(c => c.key === 'versicherung')?.value ?? 0.5;
  const sonstigePct = costs.find(c => c.key === 'sonstige')?.value ?? 2;

  const grossRent = market?.market_rent.annual_at_avg ?? 0;
  const vacancyEur   = grossRent * (vacancyPct / 100);
  const verwaltungEur = grossRent * (verwaltungPct / 100);
  const instandEur   = instandhaltung * area;
  const versichEur   = versicherung * area;
  const sonstigeEur  = grossRent * (sonstigePct / 100);
  const totalBewirt  = vacancyEur + verwaltungEur + instandEur + versichEur + sonstigeEur;
  const noi           = Math.max(0, grossRent - totalBewirt);
  const noiYield      = property.purchase_price ? (noi / property.purchase_price) * 100 : 0;
  const mult          = noi > 0 && property.purchase_price ? property.purchase_price / noi : null;

  return (
    <div>
      {market && (
        <div className="bg-blue-50 border border-blue-200 rounded-apple p-4 mb-6 text-xs text-apple-text-secondary">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-apple-blue mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-apple-blue">Smart Defaults für {property.city || 'diesen Standort'}</span>
              {' – '}basierend auf Marktdaten ({market.market_tier}-Lage, {market.property_type}).
              Passe die Werte an dein Objekt an.
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {costs.map(cost => (
          <div key={cost.key} className="flex items-center gap-4 p-3 border border-apple-gray-2 rounded-apple bg-white">
            <div className="flex-1">
              <div className="text-sm font-medium text-apple-text">{cost.label}</div>
              {cost.note && <div className="text-xs text-apple-text-tertiary">{cost.note}</div>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="number"
                step="0.1"
                min="0"
                className="w-20 px-2 py-1.5 rounded border border-apple-gray-3 text-sm text-right focus:outline-none focus:border-apple-blue"
                value={cost.value}
                onChange={e => update(cost.key, parseFloat(e.target.value) || 0)}
              />
              <span className="text-xs text-apple-text-tertiary w-20">{cost.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* NOI Summary */}
      {grossRent > 0 && (
        <div className="p-4 bg-apple-gray-1 rounded-apple-lg mb-8">
          <div className="text-sm font-semibold text-apple-text mb-3">Überschlagsrechnung (Marktmiete)</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-apple-text-secondary">Jahres-Rohertrag (Markt)</span>
              <span className="font-medium">{fmtEur(grossRent)}</span>
            </div>
            <div className="flex justify-between text-apple-red">
              <span>./. Bewirtschaftungskosten ges.</span>
              <span>– {fmtEur(totalBewirt)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-apple-gray-3 pt-1.5 mt-1.5">
              <span>= NOI (Nettobetriebsergebnis)</span>
              <span className="text-apple-green">{fmtEur(noi)}</span>
            </div>
            <div className="flex justify-between text-apple-text-secondary">
              <span>Ist-Rendite (NOI / Kaufpreis)</span>
              <span className={noiYield > 0 ? (noiYield >= 4.5 ? 'text-apple-green' : 'text-yellow-600') : ''}>
                {property.purchase_price ? `${noiYield.toFixed(2)} %` : '– kein Kaufpreis'}
              </span>
            </div>
            {mult && (
              <div className="flex justify-between text-apple-text-secondary">
                <span>Vervielfältiger (Kaufpreis / NOI)</span>
                <span>{mult.toFixed(1)}x</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="btn-ghost flex items-center gap-2">
          <ChevronLeft size={14} /> Zurück
        </button>
        <button onClick={onFinish} className="btn-primary flex items-center gap-2">
          <Building2 size={14} /> Zur Objektanalyse
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [property, setProperty] = useState<Property | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [areas, setAreas] = useState<RentalArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const initialAreaId = searchParams.get('areaId') ? Number(searchParams.get('areaId')) : undefined;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const prop = await getProperty(Number(id));
        setProperty(prop);
        setTenants(prop.tenants || []);
        listAreas(Number(id)).then(setAreas).catch(() => {});
        if (prop.city) {
          try {
            const md = await getMarketData({
              city: prop.city,
              property_type: prop.property_type || 'OFFICE',
              area_sqm: prop.total_area_sqm,
              purchase_price: prop.purchase_price,
              construction_year: prop.construction_year,
            });
            setMarket(md as unknown as MarketData);
          } catch {
            // Market data is optional – continue without it
          }
        }
      } catch {
        setError('Objekt konnte nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner label="Wird geladen..." /></div>;
  if (error || !property) return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <AlertCircle size={40} className="text-apple-red mx-auto mb-3" />
        <div className="text-base font-semibold text-apple-text mb-2">Objekt nicht gefunden</div>
        <div className="text-sm text-apple-text-secondary mb-4">
          {error || 'Das Objekt konnte nicht geladen werden.'}<br />
          <span className="text-xs text-apple-text-tertiary">
            Hinweis: Bei einem Server-Neustart auf Railway gehen SQLite-Daten verloren. Für dauerhafte Speicherung PostgreSQL einrichten.
          </span>
        </div>
        <button onClick={() => navigate('/upload')} className="btn-primary text-sm">
          Neues Objekt anlegen
        </button>
        <button onClick={() => navigate('/')} className="btn-ghost text-sm ml-2">
          Zum Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <TopBar
        title={property.name}
        subtitle={`Onboarding · ${property.city || ''}${property.city && property.property_type ? ' · ' : ''}${property.property_type || ''}`}
        actions={
          <button onClick={() => navigate(`/property/${property.id}`)} className="btn-ghost text-xs">
            Überspringen
          </button>
        }
      />
      <div className="p-8 max-w-4xl mx-auto">
        <Steps current={step} />

        {step === 0 && (
          <div className="card-lg">
            <h2 className="section-title mb-1">Mieterliste</h2>
            <p className="text-sm text-apple-text-secondary mb-6">
              Erfasse alle Mieter des Objekts. Die Marktmiete wird automatisch als Vorschlag eingetragen.
            </p>
            <TenantStep
              property={property}
              market={market}
              savedTenants={tenants}
              areas={areas}
              initialAreaId={initialAreaId}
              onTenantAdded={t => setTenants(ts => [...ts, t])}
              onTenantDeleted={id => setTenants(ts => ts.filter(t => t.id !== id))}
              onNext={() => setStep(1)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="card-lg">
            <h2 className="section-title mb-1">Bewirtschaftungskosten</h2>
            <p className="text-sm text-apple-text-secondary mb-6">
              Nicht-umlagefähige Kosten nach II. BV – vorausgefüllt mit Markt-Richtwerten für {property.city || 'diesen Standort'}.
            </p>
            <CostStep
              property={property}
              market={market}
              onBack={() => setStep(0)}
              onFinish={() => navigate(`/property/${property.id}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
