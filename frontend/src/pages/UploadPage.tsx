import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet, FileText, Download, CheckCircle2, AlertCircle,
  X, PenLine, ChevronRight, Info,
} from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import { uploadExcel, uploadPDF, downloadTemplate, createProperty } from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const PROPERTY_TYPES = [
  { value: 'RESIDENTIAL', label: 'Wohnen' },
  { value: 'OFFICE', label: 'Büro' },
  { value: 'RETAIL', label: 'Einzelhandel' },
  { value: 'INDUSTRIAL', label: 'Industrie / Logistik' },
  { value: 'MIXED', label: 'Gemischt' },
];

const EMPTY_FORM = {
  name: '', address: '', city: '', zip_code: '',
  property_type: 'RESIDENTIAL',
  purchase_price: '', total_area_sqm: '', land_area_sqm: '',
  construction_year: '', floors: '', units: '',
  purchase_date: '',
};

type FormData = typeof EMPTY_FORM;

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Mehrfamilienhaus', OFFICE: 'Bürogebäude',
  RETAIL: 'Einzelhandelsobjekt', INDUSTRIAL: 'Logistikimmobilie', MIXED: 'Mischnutzungsobjekt',
};

function buildAutoName(type: string, city: string, address: string): string {
  const parts = [TYPE_LABELS[type] || 'Objekt', city].filter(Boolean);
  if (address) parts.push(address);
  return parts.join(', ');
}

function ReviewForm({
  initial,
  confidence,
  description,
  onSave,
  onCancel,
}: {
  initial: Partial<FormData>;
  confidence?: string;
  description?: string;
  onSave: (data: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormData>(() => {
    const base = { ...EMPTY_FORM, ...initial };
    // Auto-generate name if not provided
    if (!base.name) {
      base.name = buildAutoName(base.property_type, base.city, base.address);
    }
    return base;
  });
  const [nameManuallyEdited, setNameManuallyEdited] = useState(!!initial.name);

  // Auto-update name when type/city/address change and user hasn't manually edited it
  const setField = (patch: Partial<FormData>) => {
    setForm(f => {
      const next = { ...f, ...patch };
      if (!nameManuallyEdited) {
        next.name = buildAutoName(next.property_type, next.city, next.address);
      }
      return next;
    });
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputCls = 'w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white';
  const labelCls = 'block text-xs font-medium text-apple-text-secondary mb-1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (err instanceof Error ? err.message : 'Fehler beim Speichern'));
      setSaving(false);
    }
  };

  const confidenceColor =
    confidence === 'hoch' ? 'text-apple-green bg-green-50 border-green-200' :
    confidence === 'mittel' ? 'text-yellow-700 bg-yellow-50 border-yellow-200' :
    'text-apple-red bg-red-50 border-red-200';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Confidence banner */}
      {confidence && (
        <div className={`flex items-start gap-2 p-3 rounded-apple border text-xs ${confidenceColor}`}>
          <Info size={14} className="mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">Extraktionsqualität: {confidence}</span>
            {confidence !== 'hoch' && <span className="ml-1">— bitte fehlende Felder ergänzen.</span>}
            {description && (
              <details className="mt-1">
                <summary className="cursor-pointer opacity-70">Extrahierter Text (Vorschau)</summary>
                <pre className="mt-1 whitespace-pre-wrap text-xs opacity-70 max-h-32 overflow-y-auto">{description}</pre>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Name + Typ */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Objektname <span className="text-apple-red">*</span></label>
          <input required className={inputCls} placeholder="z.B. Bürogebäude München Nord"
            value={form.name}
            onChange={e => { setNameManuallyEdited(true); setForm(f => ({ ...f, name: e.target.value })); }} />
        </div>
        <div>
          <label className={labelCls}>Objekttyp</label>
          <select className={inputCls} value={form.property_type}
            onChange={e => setField({ property_type: e.target.value })}>
            {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Adresse */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3 sm:col-span-2">
          <label className={labelCls}>Straße &amp; Hausnummer</label>
          <input className={inputCls} placeholder="Musterstraße 1"
            value={form.address} onChange={e => setField({ address: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>PLZ</label>
          <input className={inputCls} placeholder="80331"
            value={form.zip_code} onChange={e => setField({ zip_code: e.target.value })} />
        </div>
        <div className="col-span-3">
          <label className={labelCls}>Stadt</label>
          <input className={inputCls} placeholder="München"
            value={form.city} onChange={e => setField({ city: e.target.value })} />
        </div>
      </div>

      <hr className="border-apple-gray-2" />

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Kaufpreis (€)</label>
          <input type="number" className={inputCls} placeholder="5.000.000"
            value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Gesamtfläche (m²)</label>
          <input type="number" className={inputCls} placeholder="1.200"
            value={form.total_area_sqm} onChange={e => setForm(f => ({ ...f, total_area_sqm: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Grundstücksfläche (m²)</label>
          <input type="number" className={inputCls} placeholder="800"
            value={form.land_area_sqm} onChange={e => setForm(f => ({ ...f, land_area_sqm: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Baujahr</label>
          <input type="number" className={inputCls} placeholder="2005" min="1800" max="2100"
            value={form.construction_year} onChange={e => setForm(f => ({ ...f, construction_year: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Etagen</label>
          <input type="number" className={inputCls} placeholder="5"
            value={form.floors} onChange={e => setForm(f => ({ ...f, floors: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Einheiten</label>
          <input type="number" className={inputCls} placeholder="12"
            value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Kaufdatum</label>
          <input type="date" className={inputCls}
            value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-apple flex items-start gap-2">
          <AlertCircle size={15} className="text-apple-red mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-700">{error}</div>
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm flex items-center gap-1.5">
          <X size={14} /> Abbrechen
        </button>
        <button type="submit" disabled={saving || !form.name.trim()} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {saving ? <LoadingSpinner /> : <ChevronRight size={14} />}
          {saving ? 'Wird gespeichert...' : 'Objekt anlegen'}
        </button>
      </div>
    </form>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'manual' | 'excel' | 'pdf'>('manual');

  // Excel
  const [excelState, setExcelState] = useState<UploadState>('idle');
  const [excelError, setExcelError] = useState('');

  // PDF
  const [pdfState, setPdfState] = useState<UploadState>('idle');
  const [pdfExtracted, setPdfExtracted] = useState<Record<string, unknown> | null>(null);

  // Manual form state
  const [manualState, setManualState] = useState<UploadState>('idle');

  const onDropExcel = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setExcelState('uploading');
    try {
      const property = await uploadExcel(file);
      setExcelState('success');
      setTimeout(() => navigate(`/onboard/${property.id}`), 1500);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setExcelError(detail || (err instanceof Error ? err.message : 'Upload fehlgeschlagen'));
      setExcelState('error');
    }
  }, [navigate]);

  const onDropPDF = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setPdfState('uploading');
    setPdfExtracted(null);
    try {
      const data = await uploadPDF(file);
      setPdfExtracted(data);
      setPdfState('idle'); // show review form
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPdfState('error');
      console.error(detail);
    }
  }, []);

  const toPayload = (form: FormData) => ({
    name: form.name,
    address: form.address || undefined,
    city: form.city || undefined,
    zip_code: form.zip_code || undefined,
    property_type: form.property_type,
    purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
    total_area_sqm: form.total_area_sqm ? parseFloat(form.total_area_sqm) : undefined,
    land_area_sqm: form.land_area_sqm ? parseFloat(form.land_area_sqm) : undefined,
    construction_year: form.construction_year ? parseInt(form.construction_year) : undefined,
    floors: form.floors ? parseInt(form.floors) : undefined,
    units: form.units ? parseInt(form.units) : undefined,
    purchase_date: form.purchase_date || undefined,
  });

  const handlePdfSave = async (form: FormData) => {
    const property = await createProperty(toPayload(form));
    setPdfState('success');
    setTimeout(() => navigate(`/onboard/${property.id}`), 1200);
  };

  const handleManualSave = async (form: FormData) => {
    const property = await createProperty(toPayload(form));
    setManualState('success');
    setTimeout(() => navigate(`/onboard/${property.id}`), 1200);
  };

  // Auto-generate a property name from type + city + address
  const autoName = (type: string, city: string, address: string): string => {
    const typeLabel: Record<string, string> = {
      RESIDENTIAL: 'Mehrfamilienhaus', OFFICE: 'Bürogebäude',
      RETAIL: 'Einzelhandelsobjekt', INDUSTRIAL: 'Logistikimmobilie', MIXED: 'Mischnutzungsobjekt',
    };
    const parts = [typeLabel[type] || 'Objekt', city].filter(Boolean);
    if (address) parts.push(address);
    return parts.join(', ');
  };

  // Map PDF extracted fields to form fields
  const pdfToForm = (data: Record<string, unknown>): Partial<FormData> => {
    const city = (data.city as string) || '';
    const address = (data.address as string) || '';
    const type = (data.property_type as string) || 'RESIDENTIAL';
    const extractedName = (data.property_name as string) || '';
    return {
      name: extractedName || autoName(type, city, address),
      address,
      city,
      zip_code: (data.zip_code as string) || '',
      property_type: type,
      purchase_price: data.purchase_price != null ? String(Math.round(data.purchase_price as number)) : '',
      total_area_sqm: data.total_area != null ? String(data.total_area) : '',
      land_area_sqm: data.land_area != null ? String(data.land_area) : '',
      construction_year: data.construction_year != null ? String(data.construction_year) : '',
      floors: data.floors != null ? String(data.floors) : '',
      units: data.units != null ? String(data.units) : '',
      purchase_date: '',
    };
  };

  // Render agent info block from extraction
  const renderAgentInfo = (data: Record<string, unknown>) => {
    const agent = data.agent as Record<string, string | null> | undefined;
    if (!agent || !agent.name) return null;
    return (
      <div className="mt-4 p-3 bg-apple-gray rounded-apple border border-apple-gray-2 text-xs">
        <div className="font-medium text-apple-text-secondary mb-1">Maklerangaben (aus PDF extrahiert)</div>
        {agent.name && <div><span className="text-apple-text-tertiary">Name:</span> {agent.name}</div>}
        {agent.address && <div><span className="text-apple-text-tertiary">Adresse:</span> {agent.address}</div>}
        {agent.phone && <div><span className="text-apple-text-tertiary">Telefon:</span> {agent.phone}</div>}
        {agent.email && <div><span className="text-apple-text-tertiary">E-Mail:</span> <a href={`mailto:${agent.email}`} className="text-apple-blue">{agent.email}</a></div>}
      </div>
    );
  };

  const excelDz = useDropzone({
    onDrop: onDropExcel,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const pdfDz = useDropzone({
    onDrop: onDropPDF,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  });

  const TABS = [
    { id: 'manual' as const, label: 'Manuell', icon: <PenLine size={14} /> },
    { id: 'excel' as const, label: 'Excel-Upload', icon: <FileSpreadsheet size={14} /> },
    { id: 'pdf' as const, label: 'PDF / Exposé', icon: <FileText size={14} /> },
  ];

  return (
    <div>
      <TopBar
        title="Objekt importieren"
        subtitle="Manuell eingeben, Excel hochladen oder PDF-Exposé analysieren"
        actions={
          <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-xs">
            <Download size={14} /> Excel-Vorlage
          </button>
        }
      />

      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex gap-1 p-1 bg-apple-gray-2 rounded-lg w-fit mb-8">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white shadow-sm text-apple-text' : 'text-apple-text-secondary hover:text-apple-text'}`}>
              <span className="flex items-center gap-2">{tab.icon}{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Manuell ── */}
        {activeTab === 'manual' && (
          <div className="card-lg animate-fade-in">
            <h2 className="section-title mb-6">Objekt manuell anlegen</h2>
            {manualState === 'success' ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 size={40} className="text-apple-green" />
                <div className="text-base font-medium">Gespeichert! Du wirst weitergeleitet...</div>
              </div>
            ) : (
              <ReviewForm
                initial={EMPTY_FORM}
                onSave={handleManualSave}
                onCancel={() => setActiveTab('manual')}
              />
            )}
          </div>
        )}

        {/* ── Excel ── */}
        {activeTab === 'excel' && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-lg">
              <h2 className="section-title">Standardisiertes Excel hochladen</h2>
              <div {...excelDz.getRootProps()} className={`border-2 border-dashed rounded-apple-lg p-12 text-center cursor-pointer transition-all duration-200 ${excelDz.isDragActive ? 'border-apple-blue bg-blue-50' : 'border-apple-gray-3 hover:border-apple-blue hover:bg-blue-50/30'}`}>
                <input {...excelDz.getInputProps()} />
                {excelState === 'uploading' ? (
                  <LoadingSpinner label="Datei wird verarbeitet..." />
                ) : excelState === 'success' ? (
                  <div className="flex flex-col items-center gap-3">
                    <CheckCircle2 size={40} className="text-apple-green" />
                    <div className="text-base font-medium">Erfolgreich importiert!</div>
                  </div>
                ) : excelState === 'error' ? (
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle size={40} className="text-apple-red" />
                    <div className="text-sm text-apple-text-secondary">{excelError}</div>
                    <button onClick={() => setExcelState('idle')} className="btn-secondary text-xs flex items-center gap-1.5">
                      <X size={12} /> Erneut versuchen
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-apple-lg bg-green-50 flex items-center justify-center">
                      <FileSpreadsheet size={28} className="text-green-600" />
                    </div>
                    <div>
                      <div className="text-base font-medium text-apple-text">Excel-Datei hierher ziehen</div>
                      <div className="text-sm text-apple-text-secondary mt-1">oder klicken zum Auswählen</div>
                    </div>
                    <div className="text-xs text-apple-text-tertiary">.xlsx, .xls · max. 25 MB</div>
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={downloadTemplate} className="btn-ghost flex items-center gap-2 text-sm">
                  <Download size={14} /> Vorlage herunterladen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PDF ── */}
        {activeTab === 'pdf' && (
          <div className="space-y-6 animate-fade-in">
            {/* Upload zone — only show when no data extracted yet */}
            {!pdfExtracted && pdfState !== 'success' && (
              <div className="card-lg">
                <h2 className="section-title">PDF / Exposé hochladen</h2>
                <p className="text-sm text-apple-text-secondary mb-4">
                  Das Exposé wird automatisch analysiert — du kannst die extrahierten Daten danach prüfen und ergänzen.
                </p>
                <div {...pdfDz.getRootProps()} className={`border-2 border-dashed rounded-apple-lg p-12 text-center cursor-pointer transition-all duration-200 ${pdfDz.isDragActive ? 'border-apple-blue bg-blue-50' : 'border-apple-gray-3 hover:border-apple-blue hover:bg-blue-50/30'}`}>
                  <input {...pdfDz.getInputProps()} />
                  {pdfState === 'uploading' ? (
                    <LoadingSpinner label="PDF wird analysiert..." />
                  ) : pdfState === 'error' ? (
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle size={40} className="text-apple-red" />
                      <div className="text-sm text-apple-text-secondary">Analyse fehlgeschlagen.</div>
                      <button onClick={() => setPdfState('idle')} className="btn-secondary text-xs">Erneut versuchen</button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-apple-lg bg-red-50 flex items-center justify-center">
                        <FileText size={28} className="text-red-500" />
                      </div>
                      <div>
                        <div className="text-base font-medium text-apple-text">PDF hierher ziehen</div>
                        <div className="text-sm text-apple-text-secondary mt-1">oder klicken zum Auswählen</div>
                      </div>
                      <div className="text-xs text-apple-text-tertiary">.pdf · max. 25 MB</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Review form after extraction */}
            {pdfExtracted && pdfState !== 'success' && (
              <div className="card-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title m-0">Datenprüfung — extrahierte Felder</h2>
                  <button onClick={() => { setPdfExtracted(null); setPdfState('idle'); }}
                    className="btn-ghost text-xs flex items-center gap-1.5">
                    <X size={12} /> Neue PDF
                  </button>
                </div>
                <ReviewForm
                  initial={pdfToForm(pdfExtracted)}
                  confidence={pdfExtracted.extraction_confidence as string}
                  description={pdfExtracted.description as string}
                  onSave={handlePdfSave}
                  onCancel={() => { setPdfExtracted(null); setPdfState('idle'); }}
                />
                {/* Extracted rent data */}
                {(pdfExtracted.annual_rent != null || pdfExtracted.monthly_rent != null) && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-apple text-xs">
                    <div className="font-medium text-apple-green mb-1">Erkannte Mietdaten (für Onboarding vorgemerkt)</div>
                    {pdfExtracted.annual_rent != null && <div>Jahresmiete: <span className="font-semibold">{Number(pdfExtracted.annual_rent as number).toLocaleString('de-DE')} €</span></div>}
                    {pdfExtracted.monthly_rent != null && <div>Monatliche Miete: <span className="font-semibold">{Number(pdfExtracted.monthly_rent as number).toLocaleString('de-DE')} €</span></div>}
                  </div>
                )}
                {renderAgentInfo(pdfExtracted)}
              </div>
            )}

            {pdfState === 'success' && (
              <div className="card-lg flex flex-col items-center gap-3 py-8">
                <CheckCircle2 size={40} className="text-apple-green" />
                <div className="text-base font-medium">Objekt angelegt! Du wirst weitergeleitet...</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
