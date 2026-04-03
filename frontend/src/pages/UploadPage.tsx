import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, FileText, Download, CheckCircle2, AlertCircle, X, Link, PenLine } from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import { uploadExcel, uploadPDF, downloadTemplate, importFromImmoscout, createProperty } from '../services/api';
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
};

export default function UploadPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'excel' | 'pdf' | 'immoscout' | 'manual'>('excel');

  // Excel
  const [excelState, setExcelState] = useState<UploadState>('idle');
  const [excelError, setExcelError] = useState('');

  // PDF
  const [pdfState, setPdfState] = useState<UploadState>('idle');

  // ImmoScout
  const [immoUrl, setImmoUrl] = useState('');
  const [immoState, setImmoState] = useState<UploadState>('idle');
  const [immoError, setImmoError] = useState('');

  // Manual form
  const [form, setForm] = useState(EMPTY_FORM);
  const [manualState, setManualState] = useState<UploadState>('idle');
  const [manualError, setManualError] = useState('');

  const onDropExcel = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setExcelState('uploading');
    try {
      const property = await uploadExcel(file);
      setExcelState('success');
      setTimeout(() => navigate(`/property/${property.id}`), 1500);
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
    try {
      await uploadPDF(file);
      setPdfState('success');
    } catch {
      setPdfState('error');
    }
  }, []);

  const handleImmoImport = async () => {
    if (!immoUrl.trim()) return;
    setImmoState('uploading');
    setImmoError('');
    try {
      const property = await importFromImmoscout(immoUrl.trim());
      setImmoState('success');
      setTimeout(() => navigate(`/property/${property.id}`), 1500);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setImmoError(detail || (err instanceof Error ? err.message : 'Import fehlgeschlagen'));
      setImmoState('error');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setManualState('uploading');
    setManualError('');
    try {
      const payload = {
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
      };
      const property = await createProperty(payload);
      setManualState('success');
      setTimeout(() => navigate(`/property/${property.id}`), 1500);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setManualError(detail || (err instanceof Error ? err.message : 'Speichern fehlgeschlagen'));
      setManualState('error');
    }
  };

  const excelDz = useDropzone({
    onDrop: onDropExcel,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
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
    { id: 'immoscout' as const, label: 'ImmoScout24', icon: <Link size={14} /> },
  ];

  const inputCls = 'w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white';
  const labelCls = 'block text-xs font-medium text-apple-text-secondary mb-1';

  return (
    <div>
      <TopBar
        title="Objekt importieren"
        subtitle="Manuell eingeben, Excel / PDF hochladen oder ImmoScout24-Link einfügen"
        actions={
          <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-xs">
            <Download size={14} /> Excel-Vorlage
          </button>
        }
      />

      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex gap-1 p-1 bg-apple-gray-2 rounded-lg w-fit mb-8 flex-wrap">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white shadow-sm text-apple-text' : 'text-apple-text-secondary hover:text-apple-text'}`}>
              <span className="flex items-center gap-2">{tab.icon}{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Manuell ── */}
        {activeTab === 'manual' && (
          <div className="animate-fade-in">
            <div className="card-lg">
              <h2 className="section-title mb-6">Objekt manuell anlegen</h2>
              {manualState === 'success' ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CheckCircle2 size={40} className="text-apple-green" />
                  <div className="text-base font-medium">Objekt gespeichert! Du wirst weitergeleitet...</div>
                </div>
              ) : (
                <form onSubmit={handleManualSubmit} className="space-y-5">
                  {/* Name + Typ */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelCls}>Objektname <span className="text-apple-red">*</span></label>
                      <input required className={inputCls} placeholder="z.B. Bürogebäude München Nord" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Objekttyp</label>
                      <select className={inputCls} value={form.property_type} onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))}>
                        {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Adresse */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-3 sm:col-span-2">
                      <label className={labelCls}>Straße &amp; Hausnummer</label>
                      <input className={inputCls} placeholder="Musterstraße 1" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>PLZ</label>
                      <input className={inputCls} placeholder="80331" value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))} />
                    </div>
                    <div className="col-span-3">
                      <label className={labelCls}>Stadt</label>
                      <input className={inputCls} placeholder="München" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                    </div>
                  </div>

                  <hr className="border-apple-gray-2" />

                  {/* Kennzahlen */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>Kaufpreis (€)</label>
                      <input type="number" className={inputCls} placeholder="5.000.000" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Gesamtfläche (m²)</label>
                      <input type="number" className={inputCls} placeholder="1.200" value={form.total_area_sqm} onChange={e => setForm(f => ({ ...f, total_area_sqm: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Grundstücksfläche (m²)</label>
                      <input type="number" className={inputCls} placeholder="800" value={form.land_area_sqm} onChange={e => setForm(f => ({ ...f, land_area_sqm: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Baujahr</label>
                      <input type="number" className={inputCls} placeholder="2005" min="1800" max="2100" value={form.construction_year} onChange={e => setForm(f => ({ ...f, construction_year: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Etagen</label>
                      <input type="number" className={inputCls} placeholder="5" value={form.floors} onChange={e => setForm(f => ({ ...f, floors: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Einheiten</label>
                      <input type="number" className={inputCls} placeholder="12" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
                    </div>
                  </div>

                  {manualState === 'error' && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-apple flex items-start gap-2">
                      <AlertCircle size={15} className="text-apple-red mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-red-700">{manualError}</div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setForm(EMPTY_FORM)} className="btn-ghost text-sm">Zurücksetzen</button>
                    <button type="submit" disabled={manualState === 'uploading' || !form.name.trim()} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                      {manualState === 'uploading' ? <LoadingSpinner /> : <PenLine size={14} />}
                      {manualState === 'uploading' ? 'Wird gespeichert...' : 'Objekt anlegen'}
                    </button>
                  </div>
                </form>
              )}
            </div>
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
                    <button onClick={() => setExcelState('idle')} className="btn-secondary text-xs flex items-center gap-1.5"><X size={12} /> Erneut versuchen</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-apple-lg bg-green-50 flex items-center justify-center"><FileSpreadsheet size={28} className="text-green-600" /></div>
                    <div><div className="text-base font-medium text-apple-text">Excel-Datei hierher ziehen</div><div className="text-sm text-apple-text-secondary mt-1">oder klicken zum Auswählen</div></div>
                    <div className="text-xs text-apple-text-tertiary">.xlsx, .xls · max. 25 MB</div>
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end"><button onClick={downloadTemplate} className="btn-ghost flex items-center gap-2 text-sm"><Download size={14} /> Vorlage herunterladen</button></div>
            </div>
          </div>
        )}

        {/* ── PDF ── */}
        {activeTab === 'pdf' && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-lg">
              <h2 className="section-title">PDF / Exposé hochladen</h2>
              <div {...pdfDz.getRootProps()} className={`border-2 border-dashed rounded-apple-lg p-12 text-center cursor-pointer transition-all duration-200 ${pdfDz.isDragActive ? 'border-apple-blue bg-blue-50' : 'border-apple-gray-3 hover:border-apple-blue hover:bg-blue-50/30'}`}>
                <input {...pdfDz.getInputProps()} />
                {pdfState === 'uploading' ? (
                  <LoadingSpinner label="PDF wird analysiert..." />
                ) : pdfState === 'success' ? (
                  <div className="flex flex-col items-center gap-3"><CheckCircle2 size={40} className="text-apple-green" /><div className="text-base font-medium">PDF erfolgreich extrahiert!</div></div>
                ) : pdfState === 'error' ? (
                  <div className="flex flex-col items-center gap-3"><AlertCircle size={40} className="text-apple-red" /><button onClick={() => setPdfState('idle')} className="btn-secondary text-xs">Erneut versuchen</button></div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-apple-lg bg-red-50 flex items-center justify-center"><FileText size={28} className="text-red-500" /></div>
                    <div><div className="text-base font-medium">PDF hierher ziehen</div><div className="text-sm text-apple-text-secondary mt-1">oder klicken zum Auswählen</div></div>
                    <div className="text-xs text-apple-text-tertiary">.pdf · max. 25 MB</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ImmoScout ── */}
        {activeTab === 'immoscout' && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-lg">
              <h2 className="section-title">ImmoScout24 Inserat importieren</h2>
              <p className="text-sm text-apple-text-secondary mb-6">
                Füge einen Link zu einem ImmoScout24-Inserat ein — die Objektdaten werden automatisch extrahiert.
              </p>
              {immoState === 'success' ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CheckCircle2 size={40} className="text-apple-green" />
                  <div className="text-base font-medium">Erfolgreich importiert! Du wirst weitergeleitet...</div>
                </div>
              ) : (
                <>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      value={immoUrl}
                      onChange={e => { setImmoUrl(e.target.value); setImmoState('idle'); setImmoError(''); }}
                      placeholder="https://www.immobilienscout24.de/expose/..."
                      className="flex-1 px-4 py-3 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                      disabled={immoState === 'uploading'}
                      onKeyDown={e => e.key === 'Enter' && handleImmoImport()}
                    />
                    <button onClick={handleImmoImport} disabled={!immoUrl.trim() || immoState === 'uploading'} className="btn-primary flex items-center gap-2 disabled:opacity-50 whitespace-nowrap">
                      {immoState === 'uploading' ? <LoadingSpinner /> : <Link size={14} />}
                      {immoState === 'uploading' ? 'Wird geladen...' : 'Importieren'}
                    </button>
                  </div>
                  {immoState === 'error' && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-apple flex items-start gap-3">
                      <AlertCircle size={16} className="text-apple-red mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-red-800 mb-1">Import fehlgeschlagen</div>
                        <div className="text-xs text-red-700 mb-3">{immoError}</div>
                        <button onClick={() => setActiveTab('manual')} className="btn-secondary text-xs flex items-center gap-1.5">
                          <PenLine size={12} /> Stattdessen manuell eingeben
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-6 p-4 bg-apple-gray-1 rounded-apple">
                    <div className="text-xs font-medium text-apple-text-secondary mb-2">Hinweis</div>
                    <ul className="text-xs text-apple-text-tertiary space-y-1">
                      <li>• Unterstützt: <strong>immobilienscout24.de/expose/...</strong> Links</li>
                      <li>• ImmoScout24 kann automatische Anfragen gelegentlich blockieren</li>
                      <li>• Falls der Import fehlschlägt → Tab "Manuell" als Alternative</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
