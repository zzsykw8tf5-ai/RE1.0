import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Pencil, Trash2, X, Check, Layers, MapPin, RefreshCw, Info, Home, Heart, ExternalLink } from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import { getProperty, listAreas, createArea, updateArea, deleteArea, getGifTypes, getAreaRent, getOsmEstimate, updateProperty, getHealthcareResearch } from '../services/api';
import type { Property, RentalArea, GifTypes, AreaRentEstimate, OsmBuildingEstimate, HealthcareResearch } from '../types';
import { formatSqm, formatEur } from '../utils/format';

const HEALTHCARE_TYPES = new Set(['PFLEGEHEIM', 'ALTENHEIM', 'BETREUTES_WOHNEN', 'KRANKENHAUS', 'AERZTEHAUS', 'MVZ']);

type AreaForm = {
  nutzungsart: string;
  etage: string;
  lage_qualitaet: string;
  name: string;
  area_sqm: string;
  market_rent_sqm: string;
  beds: string;
  status: string;
  notes: string;
};

const emptyForm = (): AreaForm => ({
  nutzungsart: 'BUERO',
  etage: 'EG',
  lage_qualitaet: '',
  name: '',
  area_sqm: '',
  market_rent_sqm: '',
  beds: '',
  status: 'VERFUEGBAR',
  notes: '',
});

const ETAGEN_LIST = ['EG', 'OG1', 'OG2', 'OG3', 'OG4', 'OG5', 'OG6', 'OG7'];

interface AreaSuggestion {
  nutzungsart: string;
  nutzungsart_label: string;
  etage: string;
  area_sqm: number;
  lage_qualitaet: string | null;
}

function generateAreaSuggestions(estimate: NonNullable<OsmBuildingEstimate['estimate']>): AreaSuggestion[] {
  const { footprint_sqm, floors, building_type } = estimate;
  const perFloor = Math.round(footprint_sqm);
  const nutzungsartLabels: Record<string, string> = {
    BUERO: 'Bürofläche', EINZELHANDEL: 'Einzelhandelsfläche',
    LAGER: 'Lagerfläche', WOHNEN: 'Wohnfläche',
  };
  const suggestions: AreaSuggestion[] = [];
  const bt = (building_type || '').toLowerCase();

  if (bt === 'office' || bt === 'commercial_office') {
    for (let f = 0; f < Math.min(floors, 8); f++) {
      suggestions.push({ nutzungsart: 'BUERO', nutzungsart_label: nutzungsartLabels.BUERO, etage: ETAGEN_LIST[f] || 'EG', area_sqm: perFloor, lage_qualitaet: null });
    }
  } else if (bt === 'residential' || bt === 'apartments' || bt === 'house') {
    for (let f = 0; f < Math.min(floors, 8); f++) {
      suggestions.push({ nutzungsart: 'WOHNEN', nutzungsart_label: nutzungsartLabels.WOHNEN, etage: ETAGEN_LIST[f] || 'EG', area_sqm: perFloor, lage_qualitaet: null });
    }
  } else if (bt === 'industrial' || bt === 'warehouse') {
    suggestions.push({ nutzungsart: 'LAGER', nutzungsart_label: nutzungsartLabels.LAGER, etage: 'EG', area_sqm: perFloor * floors, lage_qualitaet: null });
  } else {
    // retail/commercial/yes/mixed/unknown → EG: Einzelhandel, OG: Bürofläche
    suggestions.push({ nutzungsart: 'EINZELHANDEL', nutzungsart_label: nutzungsartLabels.EINZELHANDEL, etage: 'EG', area_sqm: perFloor, lage_qualitaet: '1B' });
    for (let f = 1; f < Math.min(floors, 8); f++) {
      suggestions.push({ nutzungsart: 'BUERO', nutzungsart_label: nutzungsartLabels.BUERO, etage: ETAGEN_LIST[f] || `OG${f}`, area_sqm: perFloor, lage_qualitaet: null });
    }
  }
  return suggestions;
}

const STATUS_COLORS: Record<string, string> = {
  VERFUEGBAR:   'bg-green-100 text-green-800',
  VERMIETET:    'bg-blue-100 text-blue-800',
  EIGENGENUTZT: 'bg-purple-100 text-purple-800',
  LEERSTAND:    'bg-red-100 text-red-800',
};

export default function AreaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const propertyId = Number(id);

  const [property, setProperty] = useState<Property | null>(null);
  const [areas, setAreas] = useState<RentalArea[]>([]);
  const [gifTypes, setGifTypes] = useState<GifTypes | null>(null);
  const [loading, setLoading] = useState(true);

  // Slide-over form
  const [formOpen, setFormOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<RentalArea | null>(null);
  const [form, setForm] = useState<AreaForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Market rent hint
  const [rentHint, setRentHint] = useState<AreaRentEstimate | null>(null);
  const [rentLoading, setRentLoading] = useState(false);

  // OSM estimate
  const [osmResult, setOsmResult] = useState<OsmBuildingEstimate | null>(null);
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmAccepted, setOsmAccepted] = useState(false);

  // Healthcare research panel
  const [healthcareResearch, setHealthcareResearch] = useState<HealthcareResearch | null>(null);

  // Area suggestions from OSM
  const [areaSuggestions, setAreaSuggestions] = useState<AreaSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [creatingSuggestions, setCreatingSuggestions] = useState(false);
  const osmAutoFired = useRef(false);

  useEffect(() => {
    Promise.all([getProperty(propertyId), listAreas(propertyId), getGifTypes()])
      .then(([prop, arList, gTypes]) => {
        setProperty(prop);
        setAreas(arList);
        setGifTypes(gTypes);
        // Auto-trigger OSM estimate on first load if no areas yet
        if (arList.length === 0 && !osmAutoFired.current) {
          osmAutoFired.current = true;
          setOsmLoading(true);
          getOsmEstimate(propertyId)
            .then(setOsmResult)
            .catch(() => {})
            .finally(() => setOsmLoading(false));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [propertyId]);

  // Fetch rent hint whenever nutzungsart / area_sqm / lage_qualitaet change (with city)
  const fetchRentHint = useCallback(async (f: AreaForm, city: string) => {
    if (!f.nutzungsart || !city) return;
    setRentLoading(true);
    try {
      const params: Parameters<typeof getAreaRent>[0] = {
        nutzungsart: f.nutzungsart,
        city,
        area_sqm: f.area_sqm ? Number(f.area_sqm) : 200,
      };
      if (f.nutzungsart === 'EINZELHANDEL' && f.lage_qualitaet) {
        params.lage_qualitaet = f.lage_qualitaet;
      }
      setRentHint(await getAreaRent(params));
    } catch { /* ignore */ }
    finally { setRentLoading(false); }
  }, []);

  useEffect(() => {
    if (!formOpen || !property?.city) return;
    const t = setTimeout(() => fetchRentHint(form, property.city), 400);
    return () => clearTimeout(t);
  }, [form.nutzungsart, form.area_sqm, form.lage_qualitaet, formOpen, property, fetchRentHint]);

  // Load healthcare research when nutzungsart changes in form
  useEffect(() => {
    if (!formOpen) return;
    setHealthcareResearch(null);
    if (HEALTHCARE_TYPES.has(form.nutzungsart)) {
      getHealthcareResearch(form.nutzungsart).then(setHealthcareResearch).catch(() => {});
    }
  }, [form.nutzungsart, formOpen]);

  const openCreate = () => {
    setEditingArea(null);
    setForm(emptyForm());
    setRentHint(null);
    setHealthcareResearch(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (a: RentalArea) => {
    setEditingArea(a);
    setForm({
      nutzungsart: a.nutzungsart,
      etage: a.etage,
      lage_qualitaet: a.lage_qualitaet ?? '',
      name: a.name,
      area_sqm: a.area_sqm != null ? String(a.area_sqm) : '',
      market_rent_sqm: a.market_rent_sqm != null ? String(a.market_rent_sqm) : '',
      beds: a.beds != null ? String(a.beds) : '',
      status: a.status,
      notes: a.notes ?? '',
    });
    setRentHint(null);
    setHealthcareResearch(null);
    setFormError('');
    setFormOpen(true);
    if (HEALTHCARE_TYPES.has(a.nutzungsart)) {
      getHealthcareResearch(a.nutzungsart).then(setHealthcareResearch).catch(() => {});
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        nutzungsart: form.nutzungsart,
        etage: form.etage,
        lage_qualitaet: form.lage_qualitaet || null,
        name: form.name || null,
        area_sqm: form.area_sqm ? Number(form.area_sqm) : null,
        market_rent_sqm: form.market_rent_sqm ? Number(form.market_rent_sqm) : null,
        beds: form.beds ? Number(form.beds) : null,
        status: form.status,
        notes: form.notes || null,
      };
      if (editingArea) {
        const updated = await updateArea(propertyId, editingArea.id, payload);
        setAreas(prev => prev.map(a => a.id === updated.id ? updated : a));
      } else {
        const created = await createArea(propertyId, payload);
        setAreas(prev => [...prev, created]);
      }
      setFormOpen(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (areaId: number) => {
    if (!window.confirm('Fläche wirklich löschen?')) return;
    await deleteArea(propertyId, areaId);
    setAreas(prev => prev.filter(a => a.id !== areaId));
  };

  const handleOsmEstimate = async () => {
    setOsmLoading(true);
    setOsmResult(null);
    setOsmAccepted(false);
    try { setOsmResult(await getOsmEstimate(propertyId)); }
    catch { /* ignore */ }
    finally { setOsmLoading(false); }
  };

  const acceptOsmEstimate = async () => {
    if (!osmResult?.estimate || !property) return;
    try {
      const updated = await updateProperty(propertyId, {
        total_area_sqm: osmResult.estimate.estimated_gfa_sqm,
        land_area_sqm: osmResult.estimate.estimated_land_sqm,
        floors: osmResult.estimate.floors,
      });
      setProperty(updated);
      setOsmAccepted(true);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (osmResult?.estimate) {
      const suggs = generateAreaSuggestions(osmResult.estimate);
      setAreaSuggestions(suggs);
      setSelectedSuggestions(new Set(suggs.map((_, i) => i)));
    } else {
      setAreaSuggestions([]);
      setSelectedSuggestions(new Set());
    }
  }, [osmResult]);

  const createSuggestedAreas = async () => {
    setCreatingSuggestions(true);
    try {
      for (const idx of Array.from(selectedSuggestions).sort()) {
        const s = areaSuggestions[idx];
        const created = await createArea(propertyId, {
          nutzungsart: s.nutzungsart,
          etage: s.etage,
          lage_qualitaet: s.lage_qualitaet,
          area_sqm: s.area_sqm,
          status: 'VERFUEGBAR',
        });
        setAreas(prev => [...prev, created]);
      }
      setAreaSuggestions([]);
      setSelectedSuggestions(new Set());
      setOsmResult(null);
    } finally {
      setCreatingSuggestions(false);
    }
  };

  // Summary by Nutzungsart
  const summary = areas.reduce<Record<string, { count: number; sqm: number; rent: number }>>((acc, a) => {
    const key = a.nutzungsart_label;
    if (!acc[key]) acc[key] = { count: 0, sqm: 0, rent: 0 };
    acc[key].count += 1;
    acc[key].sqm += a.area_sqm ?? 0;
    acc[key].rent += (a.area_sqm ?? 0) * (a.market_rent_sqm ?? 0);
    return acc;
  }, {});

  const totalSqm = areas.reduce((s, a) => s + (a.area_sqm ?? 0), 0);
  const totalRent = areas.reduce((s, a) => s + (a.area_sqm ?? 0) * (a.market_rent_sqm ?? 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-apple-text-secondary text-sm">Lädt…</div>
  );

  return (
    <div>
      <TopBar
        title={`Flächen – ${property?.name ?? ''}`}
        subtitle={property ? `${property.address}, ${property.zip_code} ${property.city}` : ''}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/property/${id}`)} className="btn-secondary flex items-center gap-1.5 text-xs">
              <ChevronLeft size={13} /> Zurück
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-xs">
              <Plus size={13} /> Fläche anlegen
            </button>
          </div>
        }
      />

      <div className="px-4 py-4 md:px-8 md:py-6 space-y-6">

        {/* OSM Estimate Banner */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-apple-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <MapPin size={16} className="text-apple-blue" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-apple-text">OpenStreetMap Flächenschätzung</h3>
                  <p className="text-xs text-apple-text-secondary mt-0.5">
                    Automatische Schätzung von Gebäude- und Grundstücksfläche anhand der Adresse
                  </p>
                </div>
                <button
                  onClick={handleOsmEstimate}
                  disabled={osmLoading}
                  className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50"
                >
                  <RefreshCw size={12} className={osmLoading ? 'animate-spin' : ''} />
                  {osmLoading ? 'Suche…' : 'OSM Schätzung'}
                </button>
              </div>

              {osmResult && (
                <div className="mt-3">
                  {osmResult.error ? (
                    <p className="text-xs text-apple-red">{osmResult.error}</p>
                  ) : osmResult.estimate ? (
                    <div className="bg-apple-gray-1 rounded-apple p-3 space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Grundriss', val: `${osmResult.estimate.footprint_sqm} m²` },
                          { label: 'Etagen', val: String(osmResult.estimate.floors) },
                          { label: 'Geschossfläche (GFA)', val: `${osmResult.estimate.estimated_gfa_sqm} m²` },
                          { label: 'Grundstück (ca.)', val: `${osmResult.estimate.estimated_land_sqm} m²` },
                        ].map(({ label, val }) => (
                          <div key={label}>
                            <p className="text-xs text-apple-text-secondary">{label}</p>
                            <p className="text-sm font-semibold text-apple-text">{val}</p>
                          </div>
                        ))}
                      </div>
                      {osmResult.estimate.building_name && (
                        <p className="text-xs text-apple-text-secondary">
                          Gebäude: {osmResult.estimate.building_name} ({osmResult.estimate.building_type})
                        </p>
                      )}
                      <p className="text-xs text-apple-text-tertiary italic">{osmResult.source}</p>
                      {osmAccepted ? (
                        <p className="text-xs text-green-700 font-medium">Übernommen in Objektdaten.</p>
                      ) : (
                        <div className="flex gap-2 mt-1">
                          <button onClick={acceptOsmEstimate} className="btn-primary text-xs flex items-center gap-1">
                            <Check size={12} /> In Objekt übernehmen
                          </button>
                          <button onClick={() => setOsmResult(null)} className="btn-secondary text-xs">Verwerfen</button>
                        </div>
                      )}
                      {areaSuggestions.length > 0 && (
                        <div className="mt-3 border-t border-apple-gray-2 pt-3">
                          <p className="text-xs font-semibold text-apple-text mb-2">
                            Vorgeschlagene Flächen automatisch anlegen:
                          </p>
                          <div className="space-y-1 mb-3">
                            {areaSuggestions.map((s, idx) => (
                              <label key={idx} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-apple-gray-1 px-1 py-0.5 rounded">
                                <input
                                  type="checkbox"
                                  checked={selectedSuggestions.has(idx)}
                                  onChange={e => {
                                    setSelectedSuggestions(prev => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(idx); else next.delete(idx);
                                      return next;
                                    });
                                  }}
                                />
                                <span className="text-apple-text-secondary">{s.etage}</span>
                                <span className="font-medium text-apple-text">{s.nutzungsart_label}</span>
                                <span className="text-apple-text-tertiary">{s.area_sqm.toLocaleString('de-DE')} m²</span>
                                {s.lage_qualitaet && <span className="text-apple-blue">{s.lage_qualitaet}</span>}
                              </label>
                            ))}
                          </div>
                          <button
                            onClick={createSuggestedAreas}
                            disabled={creatingSuggestions || selectedSuggestions.size === 0}
                            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {creatingSuggestions ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
                            {selectedSuggestions.size} Fläche{selectedSuggestions.size !== 1 ? 'n' : ''} anlegen
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current property dimensions */}
        {property && (
          <div className="flex gap-4 text-sm text-apple-text-secondary">
            <span className="flex items-center gap-1">
              <Layers size={13} className="text-apple-text-tertiary" />
              Mietfläche gesamt: <strong className="text-apple-text ml-1">{formatSqm(property.total_area_sqm)}</strong>
            </span>
            <span className="flex items-center gap-1">
              Grundstück: <strong className="text-apple-text ml-1">{formatSqm(property.land_area_sqm)}</strong>
            </span>
            <span className="flex items-center gap-1">
              Etagen: <strong className="text-apple-text ml-1">{property.floors ?? '–'}</strong>
            </span>
          </div>
        )}

        {/* Summary */}
        {areas.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-apple-text mb-3">Flächenübersicht nach Nutzungsart</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-apple-gray-2 text-apple-text-secondary text-xs">
                    <th className="text-left pb-2 font-medium">Nutzungsart</th>
                    <th className="text-right pb-2 font-medium">Anzahl</th>
                    <th className="text-right pb-2 font-medium">Fläche (m²)</th>
                    <th className="text-right pb-2 font-medium">Marktmiete/Monat</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary).map(([label, row]) => (
                    <tr key={label} className="border-b border-apple-gray-1 last:border-0">
                      <td className="py-2 text-apple-text">{label}</td>
                      <td className="py-2 text-right text-apple-text-secondary">{row.count}</td>
                      <td className="py-2 text-right text-apple-text">{row.sqm.toLocaleString('de-DE')} m²</td>
                      <td className="py-2 text-right text-apple-text">{formatEur(row.rent)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-apple-gray-3 font-semibold">
                    <td className="pt-2 text-apple-text">Gesamt</td>
                    <td className="pt-2 text-right text-apple-text">{areas.length}</td>
                    <td className="pt-2 text-right text-apple-text">{totalSqm.toLocaleString('de-DE')} m²</td>
                    <td className="pt-2 text-right text-apple-text">{formatEur(totalRent)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Areas List */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-apple-text">Flächen ({areas.length})</h3>
            <button onClick={openCreate} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Plus size={12} /> Fläche anlegen
            </button>
          </div>

          {areas.length === 0 ? (
            <div className="text-center py-10">
              <Layers size={32} className="text-apple-text-tertiary mx-auto mb-2" />
              <p className="text-sm text-apple-text-secondary">Noch keine Flächen angelegt.</p>
              <button onClick={openCreate} className="btn-primary mt-3 text-xs">Erste Fläche anlegen</button>
            </div>
          ) : (
            <div className="space-y-2">
              {areas.map(area => (
                <div key={area.id} className="flex items-center gap-3 p-3 rounded-apple hover:bg-apple-gray-1 group transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-apple-text">{area.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[area.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {area.status_label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-apple-text-secondary">
                      <span>{area.nutzungsart_label}</span>
                      <span>{area.etage_label}</span>
                      {area.lage_label && <span>{area.lage_label}</span>}
                      {area.area_sqm != null && <span>{area.area_sqm.toLocaleString('de-DE')} m²</span>}
                      {area.beds != null && <span className="flex items-center gap-0.5"><Heart size={10} className="text-rose-500" />{area.beds} Betten</span>}
                      {area.market_rent_sqm != null && (
                        <span className="text-apple-blue font-medium">
                          {area.market_rent_sqm.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/m²/Mo
                          {area.area_sqm != null && ` · ${formatEur(area.area_sqm * area.market_rent_sqm)}/Mo`}
                        </span>
                      )}
                    </div>
                    {area.notes && <p className="text-xs text-apple-text-tertiary mt-0.5 truncate">{area.notes}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {area.status === 'VERFUEGBAR' && (
                      <button
                        onClick={() => navigate(`/onboard/${propertyId}?areaId=${area.id}`)}
                        className="p-1.5 hover:bg-green-50 rounded-lg"
                        title="Vermieten"
                      >
                        <Home size={13} className="text-green-700" />
                      </button>
                    )}
                    <button onClick={() => openEdit(area)} className="p-1.5 hover:bg-apple-gray-2 rounded-lg">
                      <Pencil size={13} className="text-apple-text-secondary" />
                    </button>
                    <button onClick={() => handleDelete(area.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                      <Trash2 size={13} className="text-apple-red" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slide-over form */}
      {formOpen && gifTypes && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setFormOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-apple-gray-2">
              <h2 className="text-base font-semibold text-apple-text">
                {editingArea ? 'Fläche bearbeiten' : 'Neue Fläche'}
              </h2>
              <button onClick={() => setFormOpen(false)} className="p-1.5 hover:bg-apple-gray-2 rounded-lg"><X size={16} /></button>
            </div>

            <div className="flex-1 px-6 py-4 space-y-4">
              {/* Nutzungsart */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Nutzungsart (gif MF/G 2017)</label>
                <select
                  value={form.nutzungsart}
                  onChange={e => setForm(f => ({ ...f, nutzungsart: e.target.value, lage_qualitaet: '' }))}
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                >
                  {gifTypes.nutzungsarten.map(n => (
                    <option key={n.key} value={n.key}>{n.label}</option>
                  ))}
                </select>
              </div>

              {/* Etage */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Etage</label>
                <select
                  value={form.etage}
                  onChange={e => setForm(f => ({ ...f, etage: e.target.value }))}
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                >
                  {gifTypes.etagen.map(e => (
                    <option key={e.key} value={e.key}>{e.label}</option>
                  ))}
                </select>
              </div>

              {/* Lagequalität – nur für Einzelhandel */}
              {form.nutzungsart === 'EINZELHANDEL' && (
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Lagequalität</label>
                  <select
                    value={form.lage_qualitaet}
                    onChange={e => setForm(f => ({ ...f, lage_qualitaet: e.target.value }))}
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                  >
                    <option value="">– keine Angabe –</option>
                    {gifTypes.lage_qualitaeten.map(l => (
                      <option key={l.key} value={l.key}>{l.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Fläche */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Mietfläche (m²)</label>
                <input
                  type="number"
                  min="0"
                  value={form.area_sqm}
                  onChange={e => setForm(f => ({ ...f, area_sqm: e.target.value }))}
                  placeholder="z.B. 150"
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                />
              </div>

              {/* Anzahl Betten – nur für Gesundheitsimmobilien */}
              {HEALTHCARE_TYPES.has(form.nutzungsart) && (
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">
                    Anzahl der Betten <span className="text-apple-text-tertiary font-normal">(Pflegeplätze)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.beds}
                    onChange={e => setForm(f => ({ ...f, beds: e.target.value }))}
                    placeholder="z.B. 80"
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                  />
                </div>
              )}

              {/* Market Rent + Hint */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">
                  Marktmiete (€/m²/Monat)
                  {rentLoading && <span className="ml-2 text-apple-blue animate-pulse">lädt…</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.market_rent_sqm}
                  onChange={e => setForm(f => ({ ...f, market_rent_sqm: e.target.value }))}
                  placeholder="z.B. 14.50"
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                />
                {rentHint && (
                  <div className="mt-1.5 bg-blue-50 rounded-apple px-3 py-2 flex items-start gap-2">
                    <Info size={12} className="text-apple-blue mt-0.5 flex-shrink-0" />
                    <div className="flex-1 text-xs text-apple-blue">
                      <span className="font-medium">Marktschätzung {rentHint.city}:</span>{' '}
                      {rentHint.rent_min.toFixed(2)} – {rentHint.rent_max.toFixed(2)} €/m²/Mo
                      {' '}(Ø {rentHint.rent_avg.toFixed(2)} €)
                      {form.nutzungsart === 'EINZELHANDEL' && rentHint.lage_qualitaet && (
                        <span> · {rentHint.lage_qualitaet}</span>
                      )}
                      <br />
                      <span className="opacity-70">Nutzung: {rentHint.nutzungsart_label}
                        {form.area_sqm ? ` · ${Number(form.area_sqm)} m²` : ''}</span>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, market_rent_sqm: String(rentHint.rent_avg) }))}
                        className="ml-2 underline font-medium"
                      >
                        Ø übernehmen
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bezeichnung */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">
                  Bezeichnung <span className="text-apple-text-tertiary font-normal">(leer = automatisch)</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. Büro 1.OG-01"
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                >
                  {gifTypes.status_optionen.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Notizen</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white resize-none"
                />
              </div>

              {/* Healthcare Research Panel */}
              {healthcareResearch && (
                <div className="rounded-apple border border-rose-200 bg-rose-50 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Heart size={13} className="text-rose-600" />
                    <span className="text-xs font-semibold text-rose-800">Research: {healthcareResearch.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-rose-600 font-medium">Rendite:</span> <span className="text-rose-900">{healthcareResearch.yield_range}</span></div>
                    {healthcareResearch.rent_range && <div><span className="text-rose-600 font-medium">Miete:</span> <span className="text-rose-900">{healthcareResearch.rent_range}</span></div>}
                    {healthcareResearch.rent_per_bed_day && <div className="col-span-2"><span className="text-rose-600 font-medium">Pflegesatz:</span> <span className="text-rose-900">{healthcareResearch.rent_per_bed_day}</span></div>}
                    {healthcareResearch.typical_lease && <div className="col-span-2"><span className="text-rose-600 font-medium">Laufzeit:</span> <span className="text-rose-900">{healthcareResearch.typical_lease}</span></div>}
                  </div>
                  {healthcareResearch.mdk_quality && (
                    <div className="border-t border-rose-200 pt-2 text-xs">
                      <div className="font-medium text-rose-700 mb-0.5">Qualitätsprüfung: {healthcareResearch.mdk_quality.source}</div>
                      <p className="text-rose-800 leading-relaxed">{healthcareResearch.mdk_quality.note}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {healthcareResearch.mdk_quality.url && (
                          <a href={healthcareResearch.mdk_quality.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-rose-600 hover:underline">
                            <ExternalLink size={10} /> MDS
                          </a>
                        )}
                        {healthcareResearch.mdk_quality.transparenz_url && (
                          <a href={healthcareResearch.mdk_quality.transparenz_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-rose-600 hover:underline">
                            <ExternalLink size={10} /> Pflegelotse
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {healthcareResearch.regulation && (
                    <div className="border-t border-rose-200 pt-2 text-xs">
                      <span className="font-medium text-rose-700">Regulatorik: </span>
                      <span className="text-rose-800">{healthcareResearch.regulation}</span>
                    </div>
                  )}
                  {healthcareResearch.risk_factors && healthcareResearch.risk_factors.length > 0 && (
                    <div className="border-t border-rose-200 pt-2 text-xs">
                      <div className="font-medium text-rose-700 mb-1">Risikofaktoren:</div>
                      <ul className="space-y-0.5">
                        {healthcareResearch.risk_factors.map((r, i) => (
                          <li key={i} className="flex gap-1.5 text-rose-800"><span className="text-rose-400 flex-shrink-0">•</span>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {healthcareResearch.market_trends && (
                    <div className="border-t border-rose-200 pt-2 text-xs">
                      <span className="font-medium text-rose-700">Markttrends: </span>
                      <span className="text-rose-800">{healthcareResearch.market_trends}</span>
                    </div>
                  )}
                </div>
              )}

              {formError && <p className="text-xs text-apple-red">{formError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-apple-gray-2 flex gap-2 justify-end">
              <button onClick={() => setFormOpen(false)} className="btn-secondary text-sm">Abbrechen</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
                <Check size={14} />{saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
