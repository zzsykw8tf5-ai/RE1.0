import { useEffect, useState } from 'react';
import { Zap, X, Server } from 'lucide-react';
import { checkHealth } from '../../services/api';

export default function DemoBanner() {
  const [show, setShow] = useState(false);
  const [backendUp, setBackendUp] = useState(false);

  useEffect(() => {
    checkHealth()
      .then(() => setBackendUp(true))
      .catch(() => { setBackendUp(false); setShow(true); });
  }, []);

  if (!show || backendUp) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-slide-up">
      <div className="bg-white border border-apple-gray-3 rounded-apple-lg shadow-apple-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Zap size={15} className="text-amber-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-apple-text">Demo-Modus aktiv</div>
              <div className="text-xs text-apple-text-secondary mt-0.5 leading-relaxed">
                Kein Backend gefunden. Die App läuft mit Musterdaten
                (Bürogebäude München). Alle Analysen sind interaktiv.
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-apple-text-tertiary">
                <Server size={10} />
                Backend starten: <code className="bg-apple-gray px-1 py-0.5 rounded text-apple-text font-mono">uvicorn app.main:app --port 8000</code>
              </div>
            </div>
          </div>
          <button onClick={() => setShow(false)} className="text-apple-text-tertiary hover:text-apple-text mt-0.5">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
