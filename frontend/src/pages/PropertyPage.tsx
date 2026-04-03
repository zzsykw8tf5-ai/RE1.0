import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Ruler, Users, Euro, Download, RefreshCw, Trash2, ChevronLeft } from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import { getProperty, runFullAnalysis, downloadReport, deleteProperty } from '../services/api';
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

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

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

  if (loading) return <FullPageLoader label="Objekt wird geladen und analysiert..." />;
  if (!property) return <div className="p-8 text-center text-apple-text-secondary">Objekt nicht gefunden.</div>;

  return (
    <div>
      <TopBar
        title={property.name}
        subtitle={`${property.address}, ${property.zip_code} ${property.city}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-1.5 text-xs"><ChevronLeft size={13} /> Zurück</button>
            <button onClick={reRunAnalysis} disabled={analysisLoading} className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50">
              <RefreshCw size={13} className={analysisLoading ? 'animate-spin' : ''} /> Neu berechnen
            </button>
            <button onClick={() => downloadReport(Number(id))} className="btn-primary flex items-center gap-1.5 text-xs"><Download size={13} /> PDF Report</button>
            <button onClick={handleDelete} className="text-apple-red hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 size={14} /></button>
          </div>
        }
      />

      <div className="px-8 pt-6">
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
              <div className="flex flex-wrap gap-6 mt-3">
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
          <div className="flex gap-1 mt-6 border-b border-apple-gray-2 -mb-6 pb-0">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm transition-all relative ${ activeTab === tab.id ? 'text-apple-blue font-medium' : 'text-apple-text-secondary hover:text-apple-text' }`}>
                {tab.label}
                {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-apple-blue rounded-full" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-8 pb-8">
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
              {activeTab === 'overview' && <OverviewTab property={property} analysis={analysis} />}
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
    </div>
  );
}
