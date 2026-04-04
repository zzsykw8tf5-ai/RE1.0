import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet, FileText, Download, CheckCircle2, AlertCircle,
  X, PenLine, MapPin, ChevronRight, Info,
} from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import { uploadExcel, uploadPDF, downloadTemplate, createProperty, parseMapsUrl } from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const PROPERTY_TYPES = [
  { value: 'OFFICE',      label: 'Büro',                icon: '🏢' },
  { value: 'RETAIL',      label: 'Einzelhandel',        icon: '🛍️' },
  { value: 'RESIDENTIAL', label: 'Wohnen',              icon: '🏠' },
  { value: 'INDUSTRIAL',  label: 'Industrie / Logistik',icon: '🏭' },
  { value: 'MIXED',       label: 'Gemischt',            icon: '🏙️' },
];

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Mehrfamilienhaus', OFFICE: 'Bürogebäude',
  RETAIL: 'Einzelhandelsobjekt', INDUSTRIAL: 'Logistikimmobilie', MIXED: 'Mischnutzungsobjekt',
};

function buildAutoName(type: string, city: string, address: string): string {
  const parts = [TYPE_LABELS[type] || 'Objekt', city].filter(Boolean);
  if (address) parts.push(address);
  return parts.join(', ');
}

// ── Simplified manual form ────────────────────────────────────────────────────
function QuickForm({ onSave, onCancel }: {
  onSave: (data: { name: string; address: string; city: string; zip_code: string; property_type: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [mapsUrl, setMapsUrl] = useState('');
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [propertyType, setPropertyType] = useState('OFFICE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filled = !!(address && city);
  const name = buildAutoName(propertyType, city, address);

  const handleMapsUrl = async () => {
    if (!mapsUrl.trim()) return;
    setMapsLoading(true);
    setMapsError('');
    try {
      const result = await parseMapsUrl(mapsUrl.trim());
      if (result.error) { setMapsError(result.error); return; }
      if (result.address) setAddress(result.address);
      if (result.city) setCity(result.city);
      if (result.zip_code) setZipCode(result.zip_code);
      if (!result.address && !result.city) setMapsError('Adresse nicht erkannt — bitte manuell eingeben');
    } catch {
      setMapsError('Fehler beim Auflösen des Links');
    } finally {
      setMapsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !city) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ name, address, city, zip_code: zipCode, property_type: propertyType });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Fehler beim Speichern');
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Step 1: Maps URL */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-apple-blue text-white text-xs flex items-center justify-center font-semibold">1</div>
          <span className="text-sm font-semibold text-apple-text">Google Maps Link einfügen</span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-apple-text-tertiary" />
            <input
              type="text"
              className="w-full pl-8 pr-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
              placeholder="maps.app.goo.gl/... oder Google Maps URL"
              value={mapsUrl}
              onChange={e => { setMapsUrl(e.target.value); setMapsError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleMapsUrl(); } }}
            />
          </div>
          <button
            type="button"
            disabled={!mapsUrl.trim() || mapsLoading}
            onClick={handleMapsUrl}
            className="btn-primary text-xs whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
          >
            {mapsLoading ? <LoadingSpinner /> : <MapPin size={12} />}
            {mapsLoading ? 'Lädt…' : 'Adresse laden'}
          </button>
        </div>
        {mapsError && <p className="text-[10px] text-apple-red mt-1">{mapsError}</p>}

        {/* Address result */}
        {(address || city) && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-apple">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-apple-green mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-apple-green">Adresse erkannt</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-apple-text-secondary mb-0.5">Straße & Nr.</label>
                    <input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-apple-text-secondary mb-0.5">PLZ</label>
                    <input className={inputCls} value={zipCode} onChange={e => setZipCode(e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-apple-text-secondary mb-0.5">Stadt</label>
                    <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual address fallback */}
        {!address && !city && (
          <div className="mt-2">
            <p className="text-[10px] text-apple-text-tertiary mb-2">Oder Adresse manuell eingeben:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="col-span-2">
                <input className={inputCls} placeholder="Musterstraße 1" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div>
                <input className={inputCls} placeholder="PLZ" value={zipCode} onChange={e => setZipCode(e.target.value)} />
              </div>
              <div className="col-span-3">
                <input className={inputCls} placeholder="Stadt" value={city} onChange={e => setCity(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Property type */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-apple-blue text-white text-xs flex items-center justify-center font-semibold">2</div>
          <span className="text-sm font-semibold text-apple-text">Nutzungsart wählen</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROPERTY_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setPropertyType(t.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-apple border text-sm font-medium transition-all ${
                propertyType === t.value
                  ? 'border-apple-blue bg-blue-50 text-apple-blue'
                  : 'border-apple-gray-3 text-apple-text-secondary hover:border-apple-blue/40 hover:bg-apple-gray-1'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview name */}
      {filled && (
        <div className="p-3 bg-apple-gray-1 rounded-apple text-xs text-apple-text-secondary">
          Objektname: <span className="font-medium text-apple-text">{name}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-apple flex items-start gap-2">
          <AlertCircle size={15} className="text-apple-red mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-700">{error}</div>
        </div>
      )}

      <div className="flex justify-between items-center pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm flex items-center gap-1.5">
          <X size={14} /> Abbrechen
        </button>
        <button
          type="submit"
          disabled={saving || !filled}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <LoadingSpinner /> : <ChevronRight size={14} />}
          {saving ? 'Wird angelegt...' : 'Objekt anlegen → Flächen'}
        </button>
      </div>
    </form>
  );
}

// ── PDF review form (full fields for extracted data) ──────────────────────────
function ReviewForm({
  initial, confidence, description, onSave, onCancel,
}: {
  initial: Record<string, string>;
  confidence?: string;
  description?: string;
  onSave: (data: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputCls = 'w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white';
  const labelCls = 'block text-xs font-medium text-apple-text-secondary mb-1';
  const confidenceColor = confidence === 'hoch' ? 'text-apple-green bg-green-50 border-green-200' : confidence === 'mittel' ? 'text-yellow-700 bg-yellow-50 border-yellow-200' : 'text-apple-red bg-red-50 border-red-200';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Fehler beim Speichern'); setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {confidence && (
        <div className={`flex items-start gap-2 p-3 rounded-apple border text-xs ${confidenceColor}`}>
          <Info size={14} className="mt-0.5 flex-shrink-0" />
          <span><span className="font-medium">Extraktionsqualität: {confidence}</span>{confidence !== 'hoch' && ' — bitte fehlende Felder ergänzen.'}</span>
        </div>
      )}
      {description && (
        <details className="text-xs text-apple-text-tertiary">
          <summary className="cursor-pointer">Extrahierter Text</summary>
          <pre className="mt-1 whitespace-pre-wrap opacity-70 max-h-32 overflow-y-auto">{description}</pre>
        </details>
      )}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Objektname *', key: 'name' }, { label: 'Adresse', key: 'address' },
          { label: 'Stadt', key: 'city' }, { label: 'PLZ', key: 'zip_code' },
          { label: 'Kaufpreis (€)', key: 'purchase_price' }, { label: 'Fläche (m²)', key: 'total_area_sqm' },
          { label: 'Baujahr', key: 'construction_year' }, { label: 'Etagen', key: 'floors' },
        ].map(({ label, key }) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <input className={inputCls} value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
          </div>
        ))}
        <div className="col-span-2">
          <label className={labelCls}>Nutzungsart</label>
          <select className={inputCls} value={form.property_type ?? 'OFFICE'} onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))}>
            {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-apple-red">{error}</p>}
      <div className="flex justify-between pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm"><X size={14} /> Abbrechen</button>
        <button type="submit" disabled={saving || !form.name} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {saving ? <LoadingSpinner /> : <ChevronRight size={14} />}
          {saving ? 'Speichern...' : 'Objekt anlegen'}
        </button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UploadPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'manual' | 'excel' | 'pdf'>('manual');
  const [excelState, setExcelState] = useState<UploadState>('idle');
  const [excelError, setExcelError] = useState('');
  const [pdfState, setPdfState] = useState<UploadState>('idle');
  const [pdfExtracted, setPdfExtracted] = useState<Record<string, unknown> | null>(null);
  const [manualState, setManualState] = useState<UploadState>('idle');

  const onDropExcel = useCallback(async (files: File[]) => {
    const file = files[0]; if (!file) return;
    setExcelState('uploading');
    try {
      const property = await uploadExcel(file);
      setExcelState('success');
      setTimeout(() => navigate(`/areas/${property.id}`), 1500);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setExcelError(detail || 'Upload fehlgeschlagen'); setExcelState('error');
    }
  }, [navigate]);

  const onDropPDF = useCallback(async (files: File[]) => {
    const file = files[0]; if (!file) return;
    setPdfState('uploading'); setPdfExtracted(null);
    try { const data = await uploadPDF(file); setPdfExtracted(data); setPdfState('idle'); }
    catch { setPdfState('error'); }
  }, []);

  const handleManualSave = async (data: { name: string; address: string; city: string; zip_code: string; property_type: string }) => {
    const property = await createProperty(data);
    setManualState('success');
    setTimeout(() => navigate(`/areas/${property.id}`), 1000);
  };

  const handlePdfSave = async (form: Record<string, string>) => {
    const property = await createProperty({
      name: form.name, address: form.address, city: form.city, zip_code: form.zip_code,
      property_type: form.property_type || 'OFFICE',
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
      total_area_sqm: form.total_area_sqm ? parseFloat(form.total_area_sqm) : undefined,
      construction_year: form.construction_year ? parseInt(form.construction_year) : undefined,
      floors: form.floors ? parseInt(form.floors) : undefined,
    });
    setPdfState('success');
    setTimeout(() => navigate(`/areas/${property.id}`), 1000);
  };

  const pdfToForm = (data: Record<string, unknown>): Record<string, string> => ({
    name: (data.property_name as string) || '',
    address: (data.address as string) || '',
    city: (data.city as string) || '',
    zip_code: (data.zip_code as string) || '',
    property_type: (data.property_type as string) || 'OFFICE',
    purchase_price: data.purchase_price != null ? String(Math.round(data.purchase_price as number)) : '',
    total_area_sqm: data.total_area != null ? String(data.total_area) : '',
    construction_year: data.construction_year != null ? String(data.construction_year) : '',
    floors: data.floors != null ? String(data.floors) : '',
  });

  const excelDz = useDropzone({ onDrop: onDropExcel, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] }, maxFiles: 1 });
  const pdfDz = useDropzone({ onDrop: onDropPDF, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1 });

  const TABS = [
    { id: 'manual' as const, label: 'Neu', icon: <PenLine size={14} /> },
    { id: 'excel' as const, label: 'Excel', icon: <FileSpreadsheet size={14} /> },
    { id: 'pdf' as const, label: 'PDF / Exposé', icon: <FileText size={14} /> },
  ];

  return (
    <div>
      <TopBar
        title="Objekt anlegen"
        subtitle="Google Maps Link einfügen → Flächen → Mieter"
        actions={<button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-xs"><Download size={14} /> Excel-Vorlage</button>}
      />

      <div className="p-8 max-w-2xl mx-auto">
        <div className="flex gap-1 p-1 bg-apple-gray-2 rounded-lg w-fit mb-8">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white shadow-sm text-apple-text' : 'text-apple-text-secondary hover:text-apple-text'}`}>
              <span className="flex items-center gap-2">{tab.icon}{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Manual */}
        {activeTab === 'manual' && (
          <div className="card-lg animate-fade-in">
            {manualState === 'success' ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <CheckCircle2 size={44} className="text-apple-green" />
                <div className="text-base font-medium">Objekt angelegt! Flächen werden geladen…</div>
              </div>
            ) : (
              <QuickForm onSave={handleManualSave} onCancel={() => setManualState('idle')} />
            )}
          </div>
        )}

        {/* Excel */}
        {activeTab === 'excel' && (
          <div className="card-lg animate-fade-in">
            <h2 className="section-title mb-4">Excel hochladen</h2>
            <div {...excelDz.getRootProps()} className={`border-2 border-dashed rounded-apple-lg p-12 text-center cursor-pointer transition-all ${excelDz.isDragActive ? 'border-apple-blue bg-blue-50' : 'border-apple-gray-3 hover:border-apple-blue hover:bg-blue-50/30'}`}>
              <input {...excelDz.getInputProps()} />
              {excelState === 'uploading' ? <LoadingSpinner label="Wird verarbeitet..." /> :
               excelState === 'success' ? <div className="flex flex-col items-center gap-3"><CheckCircle2 size={40} className="text-apple-green" /><div>Importiert!</div></div> :
               excelState === 'error' ? <div className="flex flex-col items-center gap-3"><AlertCircle size={40} className="text-apple-red" /><div className="text-sm">{excelError}</div><button onClick={() => setExcelState('idle')} className="btn-secondary text-xs">Erneut</button></div> :
               <div className="flex flex-col items-center gap-3"><FileSpreadsheet size={36} className="text-green-500" /><div className="text-sm font-medium">Excel hierher ziehen oder klicken</div><div className="text-xs text-apple-text-tertiary">.xlsx, .xls</div></div>}
            </div>
            <button onClick={downloadTemplate} className="btn-ghost flex items-center gap-2 text-sm mt-4"><Download size={14} /> Vorlage herunterladen</button>
          </div>
        )}

        {/* PDF */}
        {activeTab === 'pdf' && (
          <div className="animate-fade-in space-y-6">
            {!pdfExtracted && pdfState !== 'success' && (
              <div className="card-lg">
                <h2 className="section-title mb-4">PDF / Exposé analysieren</h2>
                <div {...pdfDz.getRootProps()} className={`border-2 border-dashed rounded-apple-lg p-12 text-center cursor-pointer transition-all ${pdfDz.isDragActive ? 'border-apple-blue bg-blue-50' : 'border-apple-gray-3 hover:border-apple-blue hover:bg-blue-50/30'}`}>
                  <input {...pdfDz.getInputProps()} />
                  {pdfState === 'uploading' ? <LoadingSpinner label="PDF wird analysiert..." /> :
                   pdfState === 'error' ? <div className="flex flex-col items-center gap-3"><AlertCircle size={40} className="text-apple-red" /><div className="text-sm">Analyse fehlgeschlagen</div><button onClick={() => setPdfState('idle')} className="btn-secondary text-xs">Erneut</button></div> :
                   <div className="flex flex-col items-center gap-3"><FileText size={36} className="text-red-500" /><div className="text-sm font-medium">PDF hierher ziehen oder klicken</div></div>}
                </div>
              </div>
            )}
            {pdfExtracted && pdfState !== 'success' && (
              <div className="card-lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="section-title m-0">Extrahierte Daten prüfen</h2>
                  <button onClick={() => { setPdfExtracted(null); setPdfState('idle'); }} className="btn-ghost text-xs"><X size={12} /> Neue PDF</button>
                </div>
                <ReviewForm initial={pdfToForm(pdfExtracted)} confidence={pdfExtracted.extraction_confidence as string} description={pdfExtracted.description as string} onSave={handlePdfSave} onCancel={() => { setPdfExtracted(null); setPdfState('idle'); }} />
              </div>
            )}
            {pdfState === 'success' && (
              <div className="card-lg flex flex-col items-center gap-3 py-10">
                <CheckCircle2 size={44} className="text-apple-green" />
                <div className="text-base font-medium">Objekt angelegt! Flächen werden geladen…</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
