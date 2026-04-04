import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Ruler, Users, Euro, Download, RefreshCw, Trash2, ChevronLeft, Pencil, X, Check, UserPlus, Layers } from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import { getProperty, runFullAnalysis, downloadReport, deleteProperty, updateProperty } from '../services/api';
import type { Property, FullAnalysis } from '../types';
import { formatEur, formatSqm, propertyTypeLabel } from '../utils/format';
import { FullPageLoader } from '../components/ui/LoadingSpinner';
import GermanValuationTab from '../components/analysis/GermanValuationTab';
import USValuationTab from '../components/analysis/USValuationTab';
import DCFTab from '../components/analysis/DCFTab';
import LocationTab from '../components/analysis/LocationTab';
import RiskTab from '../components/analysis/RiskTab';
import ScenarioTab from '../components/analysis/ScenarioTab';
import OverviewTab from '../components/analysis/OverviewTab';

type Tab = 'overview' | 'german' | 'us' | 'dcf' | 'location' | 'risk' | 'scenarios';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'german', label: 'Bewertung DE' },
  { id: 'us', label: 'Bewertung US' },
  { id: 'dcf', label: 'DCF Modell' },
  { id: 'location', label: 'Standort' },
  { id: 'risk', label: 'Risiko' },
  { id: 'scenarios', label: 'Szenarien' },
];

const PROPERTY_TYPES = ['RESIDENTIAL', 'OFFICE', 'RETAIL', 'INDUSTRIAL', 'HEALTHCARE', 'MIXED'] as const;

interface EditForm {
  name: string; address: string; city: string; zip_code: string;
  property_type: string; construction_year: string; total_area_sqm: string;
  land_area_sqm: string; floors: string; units: string;
  purchase_price: string; purchase_date: string;
}

function toEditForm(p: Property): EditForm {
  return {
    name: p.name ?? '',
    address: p.address ?? '',
    city: p.city ?? '',
    zip_code: p.zip_code ?? '',
    property_type: p.property_type ?? 'RESIDENTIAL',
    construction_year: p.construction_year ? String(p.construction_year) : '',
    total_area_sqm: p.total_area_sqm ? String(p.total_area_sqm) : '',
    land_area_sqm: p.land_area_sqm ? String(p.land_area_sqm) : '',
    floors: p.floors ? String(p.floors) : '',
    units: p.units ? String(p.units) : '',
    purchase_price: p.purchase_price ? String(p.purchase_price) : '',
    purchase_date: p.purchase_date ? p.purchase_date.slice(0, 10) : '',
  };
}

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([getProperty(Number(id)), runFullAnalysis(Number(id))])
      .then(([prop, anal]) => { setProperty(prop); setAnalysis(anal); })
      .catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const reRunAnalysis = async () => {
    if (!id) return;
    setAnalysisLoading(true);
    try { setAnalysis(await runFullAnalysis(Number(id))); }
    catch (e) { console.error(e); }
    finally { setAnalysisLoading(false); }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Objekt wirklich löschen?')) return;
    await deleteProperty(Number(id));
    navigate('/');
  };

  const openEdit = () => {
    if (!property) return;
    setEditForm(toEditForm(property));
    setEditError('');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!id || !editForm) return;
    setEditSaving(true);
    setEditError('');
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name,
        address: editForm.address,
        city: editForm.city,
        zip_code: editForm.zip_code,
        property_type: editForm.property_type,
        construction_year: editForm.construction_year ? Number(editForm.construction_year) : null,
        total_area_sqm: editForm.total_area_sqm ? Number(editForm.total_area_sqm) : null,
        land_area_sqm: editForm.land_area_sqm ? Number(editForm.land_area_sqm) : null,
        floors: editForm.floors ? Number(editForm.floors) : null,
        units: editForm.units ? Number(editForm.units) : null,
        purchase_price: editForm.purchase_price ? Number(editForm.purchase_price) : null,
        purchase_date: editForm.purchase_date || null,
      };
      const updated = await updateProperty(Number(id), payload as Parameters<typeof updateProperty>[1]);
      setProperty(updated);
      setEditOpen(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) return <FullPageLoader label="Objekt wird geladen und analysiert..." />;
  if (!property) return <div className="p-8 text-center text-apple-text-secondary">Objekt nicht gefunden.</div>;

  return (
    <div>
      <TopBar
        title={property.name}
        subtitle={`${property.address}, ${property.zip_code} ${property.city}`}
        actions={
          <div className="flex items-center gap-1.5 md:gap-2">
            <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-1 text-xs p-1.5 md:px-3"><ChevronLeft size={13} /><span className="hidden md:inline">Zurück</span></button>
            <button onClick={openEdit} className="btn-secondary flex items-center gap-1 text-xs p-1.5 md:px-3"><Pencil size={13} /><span className="hidden md:inline">Bearbeiten</span></button>
            <button onClick={() => navigate(`/areas/${id}`)} className="btn-secondary flex items-center gap-1 text-xs p-1.5 md:px-3"><Layers size={13} /><span className="hidden md:inline">Flächen</span></button>
            <button onClick={() => navigate(`/onboard/${id}`)} className="btn-secondary flex items-center gap-1 text-xs p-1.5 md:px-3"><UserPlus size={13} /><span className="hidden md:inline">Mieter</span></button>
            <button onClick={reRunAnalysis} disabled={analysisLoading} className="btn-secondary flex items-center gap-1 text-xs p-1.5 md:px-3 disabled:opacity-50">
              <RefreshCw size={13} className={analysisLoading ? 'animate-spin' : ''} /><span className="hidden md:inline">Neu</span>
            </button>
            <button onClick={() => downloadReport(Number(id))} className="btn-primary flex items-center gap-1 text-xs p-1.5 md:px-3"><Download size={13} /><span className="hidden md:inline">PDF</span></button>
            <button onClick={handleDelete} className="text-apple-red hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 size={14} /></button>
          </div>
        }
      />

      <div className="px-4 pt-4 md:px-8 md:pt-6">
        <div className="card mb-0 rounded-b-none border-b-0">
          <div className="flex items-start gap-6">
            {/* Mini Street View / Map thumbnail */}
            {property.address || property.city ? (
              <div className="w-14 h-14 rounded-apple-lg overflow-hidden flex-shrink-0 relative">
                <iframe
                  title="Objektkarte"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent([property.address, property.zip_code, property.city].filter(Boolean).join(', '))}&output=embed&z=17`}
                  width="120"
                  height="120"
                  style={{ border: 0, marginLeft: '-3px', marginTop: '-3px', pointerEvents: 'none' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-apple-lg flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0066CC, #0055A5)' }}>
                {property.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3 flex-wrap">
                <span className="badge badge-blue">{propertyTypeLabel(property.property_type)}</span>
                <span className="badge badge-gray">Baujahr {property.construction_year}</span>
              </div>
              <div className="flex flex-wrap gap-3 md:gap-6 mt-3">
                {[
                  { icon: MapPin, val: `${property.address}, ${property.city}` },
                  { icon: Ruler, val: formatSqm(property.total_area_sqm) },
                  { icon: Users, val: `${property.units} Einheiten` },
                  { icon: Calendar, val: property.purchase_date ? new Date(property.purchase_date).toLocaleDateString('de-DE') : '–' },
                  { icon: Euro, val: formatEur(property.purchase_price) },
                ].map(({ icon: Icon, val }) => (
                  <div key={val} className="flex items-center gap-1.5 text-sm text-apple-text-secondary">
                    <Icon size={13} className="text-apple-text-tertiary" /><span>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-1 mt-6 border-b border-apple-gray-2 -mb-6 pb-0 overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 md:px-4 py-3 text-xs md:text-sm whitespace-nowrap transition-all relative flex-shrink-0 ${ activeTab === tab.id ? 'text-apple-blue font-medium' : 'text-apple-text-secondary hover:text-apple-text' }`}>
                {tab.label}
                {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-apple-blue rounded-full" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pb-6 md:px-8 md:pb-8">
        <div className="bg-white rounded-b-apple rounded-t-none shadow-apple px-6 py-6">
          {analysisLoading ? (
            <FullPageLoader label="Analyse wird neu berechnet..." />
          ) : !analysis ? (
            <div className="text-center py-12 text-apple-text-secondary text-sm">
              Analyse konnte nicht geladen werden.
              <button onClick={reRunAnalysis} className="btn-primary ml-3 text-xs">Erneut versuchen</button>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab property={property} analysis={analysis} onPropertyUpdate={(p) => setProperty(p)} />}
              {activeTab === 'german' && <GermanValuationTab data={analysis.german_valuation} property={property} />}
              {activeTab === 'us' && <USValuationTab data={analysis.us_valuation} property={property} />}
              {activeTab === 'dcf' && <DCFTab data={analysis.dcf} property={property} />}
              {activeTab === 'location' && <LocationTab data={analysis.location} property={property} />}
              {activeTab === 'risk' && <RiskTab data={analysis.risk} property={property} />}
              {activeTab === 'scenarios' && <ScenarioTab property={property} />}
            </>
          )}
        </div>
      </div>

      {/* Edit slide-over panel */}
      {editOpen && editForm && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/30" onClick={() => setEditOpen(false)} />
          {/* Panel */}
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-apple-gray-2">
              <h2 className="text-base font-semibold text-apple-text">Objekt bearbeiten</h2>
              <button onClick={() => setEditOpen(false)} className="p-1.5 hover:bg-apple-gray-2 rounded-lg"><X size={16} /></button>
            </div>
            <div className="flex-1 px-6 py-4 space-y-4">
              {([
                { label: 'Name', key: 'name', type: 'text' },
                { label: 'Adresse', key: 'address', type: 'text' },
                { label: 'Stadt', key: 'city', type: 'text' },
                { label: 'PLZ', key: 'zip_code', type: 'text' },
                { label: 'Baujahr', key: 'construction_year', type: 'number' },
                { label: 'Mietfläche (m²)', key: 'total_area_sqm', type: 'number' },
                { label: 'Grundstücksfläche (m²)', key: 'land_area_sqm', type: 'number' },
                { label: 'Etagen', key: 'floors', type: 'number' },
                { label: 'Einheiten', key: 'units', type: 'number' },
                { label: 'Kaufpreis (€)', key: 'purchase_price', type: 'number' },
                { label: 'Kaufdatum', key: 'purchase_date', type: 'date' },
              ] as { label: string; key: keyof EditForm; type: string }[]).map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">{label}</label>
                  <input
                    type={type}
                    value={editForm[key]}
                    onChange={e => setEditForm(f => f ? { ...f, [key]: e.target.value } : f)}
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Nutzungsart</label>
                <select
                  value={editForm.property_type}
                  onChange={e => setEditForm(f => f ? { ...f, property_type: e.target.value } : f)}
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                >
                  {PROPERTY_TYPES.map(t => (
                    <option key={t} value={t}>{propertyTypeLabel(t)}</option>
                  ))}
                </select>
              </div>
              {editError && <p className="text-xs text-apple-red">{editError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-apple-gray-2 flex gap-2 justify-end">
              <button onClick={() => setEditOpen(false)} className="btn-secondary text-sm">Abbrechen</button>
              <button onClick={handleEditSave} disabled={editSaving} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
                <Check size={14} />{editSaving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
