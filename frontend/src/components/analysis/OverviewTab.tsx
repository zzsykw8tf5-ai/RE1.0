import { TrendingUp, Shield, MapPin, BarChart3, Users, Euro } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
} from 'recharts';
import type { FullAnalysis, Property } from '../../types';
import { formatEur, formatIRR, formatMultiple, getRiskBg, formatPctDirect, formatSqm } from '../../utils/format';
import ScoreRing from '../ui/ScoreRing';

interface Props { property: Property; analysis: FullAnalysis; }

export default function OverviewTab({ property, analysis }: Props) {
  const { german_valuation: de, us_valuation: us, dcf, location, risk } = analysis;

  const radarData = [
    { subject: 'Marktrisiko', value: 100 - risk.scores.market_risk },
    { subject: 'Mieter', value: 100 - risk.scores.tenant_risk },
    { subject: 'Substanz', value: 100 - risk.scores.structural_risk },
    { subject: 'Liquidität', value: 100 - risk.scores.liquidity_risk },
    { subject: 'Finanzen', value: 100 - risk.scores.financial_risk },
    { subject: 'Regulatorik', value: 100 - risk.scores.regulatory_risk },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          icon={Euro}
          iconColor="text-apple-blue"
          label="Verkehrswert (DE)"
          value={formatEur(de.combined.final_value)}
          sub={`${formatEur(de.combined.price_per_sqm)}/m²`}
        />
        <KpiCard
          icon={TrendingUp}
          iconColor="text-apple-green"
          label="IRR (10J.)"
          value={formatIRR(dcf.metrics.irr)}
          sub={`Equity-Multiple ${formatMultiple(dcf.metrics.equity_multiple)}`}
        />
        <KpiCard
          icon={Shield}
          iconColor={risk.overall_risk_score < 50 ? 'text-apple-green' : 'text-apple-orange'}
          label="Risiko-Score"
          value={risk.overall_risk_score.toFixed(0)}
          sub={risk.risk_category}
          badge={<span className={`badge text-xs ${getRiskBg(risk.overall_risk_score)}`}>{risk.risk_category}</span>}
        />
        <KpiCard
          icon={MapPin}
          iconColor="text-apple-purple"
          label="Standort-Score"
          value={location.overall_score.toFixed(0)}
          sub={location.macro.city_tier}
        />
      </div>

      {/* Valuation Comparison */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <BarChart3 size={15} className="text-apple-blue" />
            Bewertungsübersicht
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Ertragswert (DE)', value: de.ertragswertverfahren.ertragswert, pct: 100 },
              { label: 'Vergleichswert (DE)', value: de.vergleichswertverfahren.vergleichswert, pct: (de.vergleichswertverfahren.vergleichswert / de.ertragswertverfahren.ertragswert) * 100 },
              { label: 'Sachwert (DE)', value: de.sachwertverfahren.sachwert, pct: (de.sachwertverfahren.sachwert / de.ertragswertverfahren.ertragswert) * 100 },
              { label: 'Income Approach (US)', value: us.income_approach.value, pct: (us.income_approach.value / de.ertragswertverfahren.ertragswert) * 100 },
              { label: 'Kaufpreis', value: property.purchase_price, pct: (property.purchase_price / de.ertragswertverfahren.ertragswert) * 100 },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="text-apple-text-secondary">{row.label}</span>
                  <span className="font-medium text-apple-text">{formatEur(row.value)}</span>
                </div>
                <div className="h-1.5 bg-apple-gray-2 rounded-full">
                  <div
                    className="h-full rounded-full bg-apple-blue transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Radar */}
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <Shield size={15} className="text-apple-orange" />
            Risikoprofil
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#E8E8ED" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6E6E73' }} />
              <Radar
                dataKey="value"
                stroke="#0066CC"
                fill="#0066CC"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DCF Quick Stats */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
          <TrendingUp size={15} className="text-apple-green" />
          DCF Schnellübersicht (10 Jahre)
        </h3>
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'IRR', value: formatIRR(dcf.metrics.irr), sub: 'Internal Rate of Return' },
            { label: 'NPV', value: formatEur(dcf.metrics.npv), sub: 'Kapitalwert' },
            { label: 'Equity Multiple', value: formatMultiple(dcf.metrics.equity_multiple), sub: 'Eigenkapitalmultiplikator' },
            { label: 'Ø Cash-on-Cash', value: formatPctDirect(dcf.metrics.avg_cash_on_cash), sub: 'Durchschnittlich p.a.' },
            { label: 'Min. DSCR', value: dcf.metrics.min_dscr.toFixed(2), sub: 'Debt Service Coverage' },
          ].map(kpi => (
            <div key={kpi.label} className="text-center p-3 bg-apple-gray rounded-lg">
              <div className="text-lg font-semibold text-apple-text">{kpi.value}</div>
              <div className="text-xs font-medium text-apple-blue mt-0.5">{kpi.label}</div>
              <div className="text-[10px] text-apple-text-tertiary mt-0.5">{kpi.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tenants */}
      {property.tenants && property.tenants.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <Users size={15} className="text-apple-teal" />
            Mieter ({property.tenants.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-apple-text-tertiary uppercase tracking-wide border-b border-apple-gray-2">
                  <th className="pb-2 text-left">Mieter</th>
                  <th className="pb-2 text-left">Einheit</th>
                  <th className="pb-2 text-right">Fläche</th>
                  <th className="pb-2 text-right">Jahresmiete</th>
                  <th className="pb-2 text-left">Laufzeit bis</th>
                  <th className="pb-2 text-center">Bonität</th>
                </tr>
              </thead>
              <tbody>
                {property.tenants.map(t => (
                  <tr key={t.id} className="border-b border-apple-gray-2 last:border-0">
                    <td className="py-2.5 font-medium text-apple-text">{t.name}</td>
                    <td className="py-2.5 text-apple-text-secondary">{t.unit}</td>
                    <td className="py-2.5 text-right text-apple-text-secondary">{formatSqm(t.area_sqm)}</td>
                    <td className="py-2.5 text-right font-medium text-apple-text">{formatEur(t.annual_rent)}</td>
                    <td className="py-2.5 text-apple-text-secondary">
                      {t.lease_end ? new Date(t.lease_end).toLocaleDateString('de-DE') : 'unbefristet'}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`badge ${t.creditworthiness === 'A' ? 'badge-green' : t.creditworthiness === 'B' ? 'badge-orange' : 'badge-red'}`}>
                        {t.creditworthiness}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Risk Score Rings */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-5">Risikodetail</h3>
        <div className="flex justify-around flex-wrap gap-4">
          {[
            { label: 'Markt', score: 100 - risk.scores.market_risk },
            { label: 'Mieter', score: 100 - risk.scores.tenant_risk },
            { label: 'Substanz', score: 100 - risk.scores.structural_risk },
            { label: 'Liquidität', score: 100 - risk.scores.liquidity_risk },
            { label: 'Finanzen', score: 100 - risk.scores.financial_risk },
            { label: 'Regulatorik', score: 100 - risk.scores.regulatory_risk },
          ].map(r => (
            <ScoreRing key={r.label} score={r.score} label={r.label} size={72} />
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, iconColor, label, value, sub, badge }: {
  icon: typeof Euro; iconColor: string; label: string; value: string; sub: string; badge?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <Icon size={16} className={iconColor} />
        {badge}
      </div>
      <div className="text-2xl font-bold text-apple-text">{value}</div>
      <div className="text-xs text-apple-text-tertiary uppercase tracking-wide mt-0.5">{label}</div>
      <div className="text-xs text-apple-text-secondary mt-1">{sub}</div>
    </div>
  );
}
