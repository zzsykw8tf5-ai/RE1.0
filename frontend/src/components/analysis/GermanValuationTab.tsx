import type { GermanValuationResult, Property } from '../../types';
import { formatEur, formatPctDirect, formatNum } from '../../utils/format';
import { Scale, TrendingUp, Building2 } from 'lucide-react';

interface Props { data: GermanValuationResult; property: Property; }

function SectionCard({ icon: Icon, title, color, children }: { icon: typeof Scale; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
        <Icon size={15} className={color} />
        {title}
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

export default function GermanValuationTab({ data, property }: Props) {
  const { ertragswertverfahren: ewv, vergleichswertverfahren: vgw, sachwertverfahren: swv, combined } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Combined Result Banner */}
      <div className="rounded-apple-lg bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
        <div className="text-xs font-medium text-blue-200 uppercase tracking-widest mb-1">Verkehrswert nach ImmoWertV 2021</div>
        <div className="text-4xl font-bold mb-1">{formatEur(combined.final_value)}</div>
        <div className="text-blue-200 text-sm">{formatEur(combined.price_per_sqm)}/m² · {property.city}</div>
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-blue-500/40">
          <div>
            <div className="text-xl font-semibold">{formatEur(ewv.ertragswert)}</div>
            <div className="text-xs text-blue-200 mt-0.5">Ertragswert ({formatPctDirect(combined.ertragswert_weight * 100, 0)} %)</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{formatEur(vgw.vergleichswert)}</div>
            <div className="text-xs text-blue-200 mt-0.5">Vergleichswert ({formatPctDirect(combined.vergleichswert_weight * 100, 0)} %)</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{formatEur(swv.sachwert)}</div>
            <div className="text-xs text-blue-200 mt-0.5">Sachwert ({formatPctDirect(combined.sachwert_weight * 100, 0)} %)</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Ertragswertverfahren */}
        <SectionCard icon={TrendingUp} title="Ertragswertverfahren" color="text-apple-blue">
          <Row label="Jahresrohertrag" value={formatEur(ewv.jahresrohertrag)} />
          <Row label="Bewirtschaftungskosten" value={`– ${formatEur(ewv.bewirtschaftungskosten)}`} indent />
          <Row label="Reinertrag" value={formatEur(ewv.reinertrag)} bold />
          <div className="divider" />
          <Row label="Liegenschaftszinsanteil" value={`– ${formatEur(ewv.liegenschaftszinsanteil)}`} indent />
          <Row label="Gebäudereinertrag" value={formatEur(ewv.gebaeude_reinertrag)} />
          <Row label="Vervielfältiger" value={formatNum(ewv.vervielfaeltiger, 2)} />
          <Row label="Gebäudeertragswert" value={formatEur(ewv.gebaeude_ertragswert)} />
          <div className="divider" />
          <Row label="Bodenwert" value={formatEur(ewv.bodenwert)} />
          <Row label="Ertragswert" value={formatEur(ewv.ertragswert)} bold />
        </SectionCard>

        {/* Vergleichswertverfahren */}
        <SectionCard icon={Scale} title="Vergleichswertverfahren" color="text-apple-green">
          <Row label="Fläche" value={`${formatNum(vgw.flaeche_sqm)} m²`} />
          <Row label="Ø Vergleichspreis" value={formatEur(vgw.ø_vergleichspreis_sqm) + '/m²'} />
          <Row label="Lagefaktor" value={formatNum(vgw.lage_faktor, 2)} />
          <Row label="Ausstattungsfaktor" value={formatNum(vgw.ausstattung_faktor, 2)} />
          <div className="divider" />
          <Row label="Vergleichswert" value={formatEur(vgw.vergleichswert)} bold />

          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <div className="text-xs text-green-700 font-medium">Methode</div>
            <div className="text-xs text-green-600 mt-1">
              Basierend auf Kaufpreissammlungen vergleichbarer Objekte im Umkreis.
              Gewichtet nach Lage, Ausstattung und Zustand.
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Sachwertverfahren */}
      <SectionCard icon={Building2} title="Sachwertverfahren" color="text-apple-orange">
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

      {/* Legal Note */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-apple text-xs text-amber-700">
        <strong>Rechtlicher Hinweis:</strong> Diese Bewertung erfolgt nach der Immobilienwertermittlungsverordnung (ImmoWertV 2021).
        Sie dient als Orientierungswert. Für rechtsverbindliche Gutachten empfehlen wir die Beauftragung eines zertifizierten
        Sachverständigen (§ 194 BauGB).
      </div>
    </div>
  );
}
