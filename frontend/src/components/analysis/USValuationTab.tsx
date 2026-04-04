import type { USValuationResult, Property } from '../../types';
import { formatEur, formatPctDirect, formatNum, formatSqm } from '../../utils/format';
import { Euro, TrendingUp, Building2 } from 'lucide-react';

interface Props { data: USValuationResult; property: Property; }

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-apple-gray-2 last:border-0 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-apple-text' : 'text-apple-text-secondary'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-semibold text-apple-text' : 'text-apple-text'}`}>{value}</span>
    </div>
  );
}

export default function USValuationTab({ data, property }: Props) {
  const { income_approach: ia, sales_comparison: sc, cost_approach: ca, grm, combined } = data;
  // Always show in EUR (local currency for German properties)
  const fmt = formatEur;
  // Convert sqft → m² (1 sqft = 0.0929 m²)
  const sqftToSqm = (sqft: number) => formatSqm(sqft * 0.0929);
  const perSqmFromSqft = (perSqft: number) => `${formatNum(perSqft / 0.0929, 0)} €/m²`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-apple-lg bg-gradient-to-r from-green-600 to-emerald-700 p-6 text-white">
        <div className="text-xs font-medium text-green-200 uppercase tracking-widest mb-1">Indicated Value (USPAP) · {property.city || 'DE'}</div>
        <div className="text-4xl font-bold mb-1">{fmt(combined.final_value_eur)}</div>
        <div className="text-green-200 text-sm">{formatPctDirect(combined.cap_rate)} % Cap Rate · US Appraisal Methodik</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mt-5 pt-5 border-t border-green-500/40">
          <div><div className="text-xl font-semibold">{fmt(ia.value)}</div><div className="text-xs text-green-200 mt-0.5">Income Approach ({formatPctDirect(combined.income_weight * 100, 0)} %)</div></div>
          <div><div className="text-xl font-semibold">{fmt(sc.indicated_value)}</div><div className="text-xs text-green-200 mt-0.5">Sales Comparison ({formatPctDirect(combined.sales_weight * 100, 0)} %)</div></div>
          <div><div className="text-xl font-semibold">{fmt(ca.total_value)}</div><div className="text-xs text-green-200 mt-0.5">Cost Approach ({formatPctDirect(combined.cost_weight * 100, 0)} %)</div></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2"><TrendingUp size={15} className="text-apple-green" />Income Capitalization Approach</h3>
          <Row label="Gross Potential Income" value={fmt(ia.gross_rental_income)} />
          <Row label="Vacancy & Credit Loss" value={`– ${fmt(ia.vacancy_loss)}`} indent />
          <Row label="Effective Gross Income" value={fmt(ia.effective_gross_income)} bold />
          <Row label="Operating Expenses" value={`– ${fmt(ia.operating_expenses)}`} indent />
          <Row label="Net Operating Income (NOI)" value={fmt(ia.noi)} bold />
          <Row label="Overall Cap Rate" value={formatPctDirect(ia.cap_rate) + ' %'} />
          <Row label="Indicated Value" value={fmt(ia.value)} bold />
          <div className="mt-3 p-3 bg-green-50 rounded-lg"><div className="text-xs text-green-700">Value = NOI / Cap Rate</div></div>
        </div>
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2"><Euro size={15} className="text-apple-blue" />Sales Comparison Approach</h3>
          <Row label="Objektfläche" value={sqftToSqm(sc.total_area_sqft)} />
          <Row label="Angepasster Wert / m²" value={perSqmFromSqft(sc.value_per_sqft)} />
          <Row label="Indicated Value" value={fmt(sc.indicated_value)} bold />
          {sc.adjustments.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-medium text-apple-text-secondary mb-2">Anpassungen:</div>
              <ul className="space-y-1">{sc.adjustments.map((adj, i) => <li key={i} className="text-xs text-apple-text-secondary flex items-start gap-1.5"><span className="text-apple-blue mt-0.5">•</span>{adj}</li>)}</ul>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-apple-gray-2">
            <div className="text-xs font-medium text-apple-text-secondary mb-1">Gross Rent Multiplier</div>
            <Row label="GRM" value={formatNum(grm.gross_rent_multiplier, 2)} />
            <Row label="GRM Indicated Value" value={fmt(grm.grm_value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2"><Building2 size={15} className="text-apple-orange" />Cost Approach</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <Row label="Grundstückswert" value={fmt(ca.land_value)} />
            <Row label="Herstellungskosten (Neuwert)" value={fmt(ca.replacement_cost)} />
            <Row label="Gesamte Wertminderung" value={`– ${fmt(ca.total_depreciation)}`} />
          </div>
          <div>
            <Row label="Gebäudewert (abgeschrieben)" value={fmt(ca.depreciated_value)} />
            <Row label="Indicated Value" value={fmt(ca.total_value)} bold />
            <Row label="Wert / m²" value={perSqmFromSqft(combined.price_per_sqft)} />
          </div>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-apple text-xs text-blue-700">
        <strong>Hinweis:</strong> Die Bewertung erfolgt nach US-amerikanischer Appraisal-Methodik (USPAP – Uniform Standards of Professional Appraisal Practice), alle Werte in der Landeswährung des Objektstandorts (<strong>EUR</strong>).
      </div>
    </div>
  );
}
