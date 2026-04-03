import type { GermanValuationResult, Property } from '../../types';
import { formatEur, formatPctDirect, formatNum } from '../../utils/format';
import { Scale, TrendingUp, Building2, Star } from 'lucide-react';

interface Props { data: GermanValuationResult; property: Property; }

function SectionCard({
  icon: Icon, title, color, children, primary,
}: {
  icon: typeof Scale; title: string; color: string; children: React.ReactNode; primary?: boolean;
}) {
  return (
    <div className={`card ${primary ? 'ring-2 ring-apple-blue ring-offset-1' : ''}`}>
      <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
        <Icon size={15} className={color} />
        {title}
        {primary && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-apple-blue bg-blue-50 px-2 py-0.5 rounded-full">
            <Star size={9} /> Leitverfahren
          </span>
        )}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-apple-gray-2 last:border-0 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-apple-text' : 'text-apple-text-secondary'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-semibold text-apple-text' : 'text-apple-text'}`}>{value}</span>
    </div>
  );
}

const COMMERCIAL = ['OFFICE', 'RETAIL', 'MIXED'];
const INDUSTRIAL = ['INDUSTRIAL'];

export default function GermanValuationTab({ data, property }: Props) {
  const { ertragswertverfahren: ewv, vergleichswertverfahren: vgw, sachwertverfahren: swv, combined } = data;
  const pt = property.property_type;

  // Determine which method is the Leitverfahren per ImmoWertV
  const leit = COMMERCIAL.includes(pt) ? 'ertrag' : INDUSTRIAL.includes(pt) ? 'sach' : 'vergleich';

  // Human-readable method name for header badge
  const leitLabel =
    leit === 'ertrag' ? 'Ertragswertverfahren (Gewerbe)' :
    leit === 'sach'   ? 'Sachwertverfahren (Industrie/Sonstige)' :
                        'Vergleichswertverfahren (Wohnen)';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-apple-lg bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
        <div className="flex items-start justify-between mb-1">
          <div className="text-xs font-medium text-blue-200 uppercase tracking-widest">Verkehrswert nach ImmoWertV 2021</div>
          <span className="text-[10px] font-semibold bg-white/20 rounded-full px-2.5 py-1 text-white">
            Leitverfahren: {leitLabel}
          </span>
        </div>
        <div className="text-4xl font-bold mb-1">{formatEur(combined.final_value)}</div>
        <div className="text-blue-200 text-sm">{formatEur(combined.price_per_sqm)}/m² · {property.city}</div>
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-blue-500/40">
          <div className={leit === 'ertrag' ? 'opacity-100' : 'opacity-70'}>
            <div className="text-xl font-semibold">{formatEur(ewv.ertragswert)}</div>
            <div className="text-xs text-blue-200 mt-0.5">Ertragswert ({formatPctDirect(combined.ertragswert_weight * 100, 0)} %)</div>
          </div>
          <div className={leit === 'vergleich' ? 'opacity-100' : 'opacity-70'}>
            <div className="text-xl font-semibold">{formatEur(vgw.vergleichswert)}</div>
            <div className="text-xs text-blue-200 mt-0.5">Vergleichswert ({formatPctDirect(combined.vergleichswert_weight * 100, 0)} %)</div>
          </div>
          <div className={leit === 'sach' ? 'opacity-100' : 'opacity-70'}>
            <div className="text-xl font-semibold">{formatEur(swv.sachwert)}</div>
            <div className="text-xs text-blue-200 mt-0.5">Sachwert ({formatPctDirect(combined.sachwert_weight * 100, 0)} %)</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <SectionCard icon={TrendingUp} title="Ertragswertverfahren" color="text-apple-blue" primary={leit === 'ertrag'}>
          <Row label="Jahresrohertrag" value={formatEur(ewv.jahresrohertrag)} />
          <Row label="Bewirtschaftungskosten" value={`– ${formatEur(ewv.bewirtschaftungskosten)}`} indent />
          <Row label="Reinertrag" value={formatEur(ewv.reinertrag)} bold />
          <Row label="Liegenschaftszinsanteil" value={`– ${formatEur(ewv.liegenschaftszinsanteil)}`} indent />
          <Row label="Gebäudereinertrag" value={formatEur(ewv.gebaeude_reinertrag)} />
          <Row label="Vervielfältiger" value={formatNum(ewv.vervielfaeltiger, 2)} />
          <Row label="Gebäudeertragswert" value={formatEur(ewv.gebaeude_ertragswert)} />
          <Row label="Bodenwert" value={formatEur(ewv.bodenwert)} />
          <Row label="Ertragswert" value={formatEur(ewv.ertragswert)} bold />
        </SectionCard>
        <SectionCard icon={Scale} title="Vergleichswertverfahren" color="text-apple-green" primary={leit === 'vergleich'}>
          <Row label="Fläche" value={`${formatNum(vgw.flaeche_sqm)} m²`} />
          <Row label="Ø Vergleichspreis" value={formatEur(vgw.ø_vergleichspreis_sqm) + '/m²'} />
          <Row label="Lagefaktor" value={formatNum(vgw.lage_faktor, 2)} />
          <Row label="Ausstattungsfaktor" value={formatNum(vgw.ausstattung_faktor, 2)} />
          <Row label="Vergleichswert" value={formatEur(vgw.vergleichswert)} bold />
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <div className="text-xs text-green-700 font-medium">Methode</div>
            <div className="text-xs text-green-600 mt-1">Basierend auf Kaufpreissammlungen vergleichbarer Objekte im Umkreis. Gewichtet nach Lage, Ausstattung und Zustand.</div>
          </div>
        </SectionCard>
      </div>

      <SectionCard icon={Building2} title="Sachwertverfahren" color="text-apple-orange" primary={leit === 'sach'}>
        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <Row label="Bodenwert" value={formatEur(swv.bodenwert)} />
            <Row label="Gebäudesachwert (brutto)" value={formatEur(swv.gebaeude_sachwert)} />
            <Row label="Marktanpassungsfaktor" value={formatNum(swv.marktanpassungsfaktor, 2)} />
          </div>
          <div>
            <Row label="Kaufpreis" value={formatEur(property.purchase_price)} />
            <Row label="Bruttoanfangsrendite" value={formatPctDirect(combined.gross_initial_yield) + ' %'} />
            <Row label="Sachwert (gesamt)" value={formatEur(swv.sachwert)} bold />
          </div>
        </div>
      </SectionCard>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-apple text-xs text-amber-700">
        <strong>Rechtlicher Hinweis:</strong> Diese Bewertung erfolgt nach der Immobilienwertermittlungsverordnung (ImmoWertV 2021). Sie dient als Orientierungswert. Für rechtsverbindliche Gutachten empfehlen wir die Beauftragung eines zertifizierten Sachverständigen (§ 194 BauGB).
      </div>
    </div>
  );
}
