import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, FileText, Download, CheckCircle2, AlertCircle, X } from 'lucide-react';
import TopBar from '../components/Layout/TopBar';
import { uploadExcel, uploadPDF, downloadTemplate } from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface UploadResult {
  type: 'excel' | 'pdf';
  data: Record<string, unknown>;
  state: UploadState;
  error?: string;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [excelResult, setExcelResult] = useState<UploadResult | null>(null);
  const [pdfResult, setPdfResult] = useState<UploadResult | null>(null);
  const [activeTab, setActiveTab] = useState<'excel' | 'pdf'>('excel');

  const onDropExcel = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setExcelResult({ type: 'excel', data: {}, state: 'uploading' });
    try {
      const property = await uploadExcel(file);
      setExcelResult({ type: 'excel', data: property as unknown as Record<string, unknown>, state: 'success' });
      setTimeout(() => navigate(`/property/${property.id}`), 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
      setExcelResult({ type: 'excel', data: {}, state: 'error', error: message });
    }
  }, [navigate]);

  const onDropPDF = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setPdfResult({ type: 'pdf', data: {}, state: 'uploading' });
    try {
      const data = await uploadPDF(file);
      setPdfResult({ type: 'pdf', data, state: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
      setPdfResult({ type: 'pdf', data: {}, state: 'error', error: message });
    }
  }, []);

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

  return (
    <div>
      <TopBar
        title="Objekt hochladen"
        subtitle="Excel-Daten oder PDF-Exposé importieren"
        actions={
          <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-xs">
            <Download size={14} /> Excel-Vorlage
          </button>
        }
      />

      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex gap-1 p-1 bg-apple-gray-2 rounded-lg w-fit mb-8">
          {(['excel', 'pdf'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${ activeTab === tab ? 'bg-white shadow-sm text-apple-text' : 'text-apple-text-secondary hover:text-apple-text' }`}>
              {tab === 'excel' ? <span className="flex items-center gap-2"><FileSpreadsheet size={14} /> Excel-Upload</span> : <span className="flex items-center gap-2"><FileText size={14} /> PDF / Exposé</span>}
            </button>
          ))}
        </div>

        {activeTab === 'excel' && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-lg">
              <h2 className="section-title">Standardisiertes Excel hochladen</h2>
              <div {...excelDz.getRootProps()} className={`border-2 border-dashed rounded-apple-lg p-12 text-center cursor-pointer transition-all duration-200 ${ excelDz.isDragActive ? 'border-apple-blue bg-blue-50' : 'border-apple-gray-3 hover:border-apple-blue hover:bg-blue-50/30' }`}>
                <input {...excelDz.getInputProps()} />
                {excelResult?.state === 'uploading' ? (
                  <LoadingSpinner label="Datei wird verarbeitet..." />
                ) : excelResult?.state === 'success' ? (
                  <div className="flex flex-col items-center gap-3">
                    <CheckCircle2 size={40} className="text-apple-green" />
                    <div className="text-base font-medium text-apple-text">Erfolgreich importiert!</div>
                  </div>
                ) : excelResult?.state === 'error' ? (
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle size={40} className="text-apple-red" />
                    <div className="text-sm text-apple-text-secondary">{excelResult.error}</div>
                    <button onClick={() => setExcelResult(null)} className="btn-secondary text-xs flex items-center gap-1.5"><X size={12} /> Erneut versuchen</button>
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

        {activeTab === 'pdf' && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-lg">
              <h2 className="section-title">PDF / Exposé hochladen</h2>
              <div {...pdfDz.getRootProps()} className={`border-2 border-dashed rounded-apple-lg p-12 text-center cursor-pointer transition-all duration-200 ${ pdfDz.isDragActive ? 'border-apple-blue bg-blue-50' : 'border-apple-gray-3 hover:border-apple-blue hover:bg-blue-50/30' }`}>
                <input {...pdfDz.getInputProps()} />
                {pdfResult?.state === 'uploading' ? (
                  <LoadingSpinner label="PDF wird analysiert..." />
                ) : pdfResult?.state === 'success' ? (
                  <div className="flex flex-col items-center gap-3"><CheckCircle2 size={40} className="text-apple-green" /><div className="text-base font-medium text-apple-text">PDF erfolgreich extrahiert!</div></div>
                ) : pdfResult?.state === 'error' ? (
                  <div className="flex flex-col items-center gap-3"><AlertCircle size={40} className="text-apple-red" /><button onClick={() => setPdfResult(null)} className="btn-secondary text-xs">Erneut versuchen</button></div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-apple-lg bg-red-50 flex items-center justify-center"><FileText size={28} className="text-red-500" /></div>
                    <div><div className="text-base font-medium text-apple-text">PDF hierher ziehen</div><div className="text-sm text-apple-text-secondary mt-1">oder klicken zum Auswählen</div></div>
                    <div className="text-xs text-apple-text-tertiary">.pdf · max. 25 MB</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
