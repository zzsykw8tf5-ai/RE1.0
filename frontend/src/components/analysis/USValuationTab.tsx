import type { USValuationResult, Property } from '../../types';
import { formatEur, formatUSD, formatPctDirect, formatNum, formatSqft } from '../../utils/format';
import { DollarSign, TrendingUp, Building2 } from 'lucide-react';

interface Props { data: USValuationResult; property: Property; }

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-apple-gray-2 last:border-0 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-apple-text' : 'text-apple-text-secondary'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-semibold text-apple-text' : 'text-apple-text'}`}>{value}</span>
    </div>
  );
}

export default function USValuationTab({ data }: Props) {
  const { income_approach: ia, sales_comparison: sc, cost_approach: ca, grm, combined } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Combined Result Banner */}
      <div className="rounded-apple-lg bg-gradient-to-r from-green-600 to-emerald-700 p-6 text-white">
        <div className="text-xs font-medium text-green-200 uppercase tracking-widest mb-1">Indicated Value (USPAP)</div>
        <div className="text-4xl font-bold mb-1">{formatUSD(combined.final_value_usd)}</div>
        <div className="text-green-200 text-sm">{formatEur(combined.final_value_eur)} · {formatPctDirect(combined.cap_rate)} % Cap Rate</div>
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-green-500/40">
          <div>
            <div className="text-xl font-semibold">{formatUSD(ia.value)}</div>
            <div className="text-xs text-green-200 mt-0.5">Income Approach ({formatPctDirect(combined.income_weight * 100, 0)} %)</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{formatUSD(sc.indicated_value)}</div>
            <div className="text-xs text-green-200 mt-0.5">Sales Comparison ({formatPctDirect(combined.sales_weight * 100, 0)} %)</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{formatUSD(ca.total_value)}</div>
            <div className="text-xs text-green-200 mt-0.5">Cost Approach ({formatPctDirect(combined.cost_weight * 100, 0)} %)</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Income Approach */}
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-apple-green" />
            Income Capitalization Approach
          </h3>
          <Row label="Gross Potential Income" value={formatUSD(ia.gross_rental_income)} />
          <Row label="Vacancy & Credit Loss" value={`– ${formatUSD(ia.vacancy_loss)}`} indent />
          <Row label="Effective Gross Income" value={formatUSD(ia.effective_gross_income)} bold />
          <Row label="Operating Expenses" value={`– ${formatUSD(ia.operating_expenses)}`} indent />
          <Row label="Net Operating Income (NOI)" value={formatUSD(ia.noi)} bold />
          <div className="my-2 border-t border-apple-gray-2" />
          <Row label="Overall Cap Rate" value={formatPctDirect(ia.cap_rate) + ' %'} />
          <Row label="Indicated Value" value={formatUSD(ia.value)} bold />

          <div className="mt-3 p-3 bg-green-50 rounded-lg">
            <div className="text-xs text-green-700">Value = NOI / Cap Rate</div>
          </div>
        </div>

        {/* Sales Comparison */}
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <DollarSign size={15} className="text-apple-blue" />
            Sales Comparison Approach
          </h3>
          <Row label="Subject Area" value={formatSqft(sc.total_area_sqft)} />
          <Row label="Adjusted Value / sqft" value={`$${formatNum(sc.value_per_sqft, 0)}/sqft`} />
          <Row label="Indicated Value" value={formatUSD(sc.indicated_value)} bold />
          {sc.adjustments.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-medium text-apple-text-secondary mb-2">Adjustments Applied:</div>
              <ul className="space-y-1">
                {sc.adjustments.map((adj, i) => (
                  <li key={i} className="text-xs text-apple-text-secondary flex items-start gap-1.5">
                    <span className="text-apple-blue mt-0.5">•</span>
                    {adj}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-apple-gray-2">
            <div className="text-xs font-medium text-apple-text-secondary mb-1">Gross Rent Multiplier</div>
            <Row label="GRM" value={formatNum(grm.gross_rent_multiplier, 2)} />
            <Row label="GRM Indicated Value" value={formatUSD(grm.grm_value)} />
          </div>
        </div>
      </div>

      {/* Cost Approach */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
          <Building2 size={15} className="text-apple-orange" />
          Cost Approach
        </h3>
        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <Row label="Site Value (Land)" value={formatUSD(ca.land_value)} />
            <Row label="Replacement Cost (New)" value={formatUSD(ca.replacement_cost)} />
            <Row label="Total Depreciation" value={`– ${formatUSD(ca.total_depreciation)}`} />
          </div>
          <div>
            <Row label="Depreciated Building Value" value={formatUSD(ca.depreciated_value)} />
            <Row label="Total Indicated Value" value={formatUSD(ca.total_value)} bold />
            <Row label="Value per sqft" value={`$${formatNum(combined.price_per_sqft, 0)}/sqft`} />
          </div>
        </div>
      </div>

      {/* USD/EUR Note */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-apple text-xs text-blue-700">
        <strong>FX Note:</strong> Werte in USD werden mit einem Wechselkurs von 1 EUR = 1,08 USD umgerechnet.
        Die Bewertung erfolgt gemäß den Uniform Standards of Professional Appraisal Practice (USPAP).
        Für eine offizielle US-Bewertung ist ein MAI-zertifizierter Appraiser erforderlich.
      </div>
    </div>
  );
}
