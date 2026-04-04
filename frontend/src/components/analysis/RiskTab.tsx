import type { RiskResult, Property } from '../../types';
import { Shield, AlertTriangle, TrendingDown, Zap } from 'lucide-react';
import { formatEur, getRiskBg, getRiskLabel } from '../../utils/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props { data: RiskResult; property: Property; }

function RiskBar({ label, score }: { label: string; score: number }) {
  const color = score < 30 ? '#34C759' : score < 55 ? '#FF9500' : score < 75 ? '#FF6B35' : '#FF3B30';
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-apple-text-secondary">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-apple-text">{score}</span>
          <span className={`badge text-[10px] ${getRiskBg(score)}`}>{getRiskLabel(score)}</span>
        </div>
      </div>
      <div className="h-2 bg-apple-gray-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function RiskTab({ data }: Props) {
  const { scores, overall_risk_score, risk_category, stress_tests, recommendations, lease_expiry_profile, tenant_concentration } = data;


  const stressData = [
    { name: '+200 Bps Zins', ...stress_tests.interest_rate_shock },
    { name: '+20% Leerstand', ...stress_tests.vacancy_shock },
    { name: '-15% Miete', ...stress_tests.rent_decline },
    { name: '+100 Bps Exit Cap', ...stress_tests.cap_rate_expansion },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className={`rounded-apple-lg p-6 ${overall_risk_score < 30 ? 'bg-gradient-to-r from-green-600 to-green-700' : overall_risk_score < 55 ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-red-600 to-red-700'} text-white`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium opacity-75 uppercase tracking-widest mb-1">Portfolio Risiko Modell</div>
            <div className="text-4xl font-bold">{overall_risk_score.toFixed(0)}/100</div>
            <div className="text-xl font-semibold opacity-90 mt-1">{risk_category}</div>
          </div>
          <Shield size={48} className="opacity-20" />
        </div>
        <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
          {Object.entries(scores).slice(0, 3).map(([key, val]) => (
            <div key={key}>
              <div className="text-lg font-semibold">{val}</div>
              <div className="text-xs opacity-70 capitalize">{key.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Risk Scores */}
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-5 flex items-center gap-2">
            <Shield size={15} className="text-apple-orange" />
            Risiko-Kategorien
          </h3>
          <div className="space-y-4">
            <RiskBar label="Marktrisiko" score={scores.market_risk} />
            <RiskBar label="Mieterrisiko" score={scores.tenant_risk} />
            <RiskBar label="Substanzrisiko" score={scores.structural_risk} />
            <RiskBar label="Liquiditätsrisiko" score={scores.liquidity_risk} />
            <RiskBar label="Finanzrisiko" score={scores.financial_risk} />
            <RiskBar label="Regulatorisches Risiko" score={scores.regulatory_risk} />
          </div>
        </div>

        {/* Tenant Concentration */}
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-5 flex items-center gap-2">
            <AlertTriangle size={15} className="text-apple-orange" />
            Mieterkonzentration
          </h3>
          {tenant_concentration.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={tenant_concentration} barSize={28} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'Anteil']} contentStyle={{ background: 'white', border: '1px solid #E8E8ED', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="share_pct" radius={[0, 4, 4, 0]}>
                    {tenant_concentration.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#0066CC' : i === 1 ? '#34C759' : i === 2 ? '#FF9500' : '#AEAEB2'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-xs text-apple-text-tertiary">
                {tenant_concentration[0]?.share_pct > 50 && (
                  <span className="badge badge-orange">Hohe Konzentration: Top-Mieter &gt; 50%</span>
                )}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-apple-text-tertiary">Keine Mieterdaten</div>
          )}
        </div>
      </div>

      {/* Lease Expiry Profile */}
      {lease_expiry_profile.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-5 flex items-center gap-2">
            <TrendingDown size={15} className="text-apple-blue" />
            Mietvertragslaufzeit-Profil (WAULT)
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={lease_expiry_profile} barSize={36}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: unknown, n: unknown) => [String(n) === 'area_sqm' ? `${v} m²` : formatEur(Number(v)), String(n) === 'area_sqm' ? 'Fläche' : 'Miete p.a.']}
                contentStyle={{ background: 'white', border: '1px solid #E8E8ED', borderRadius: 8, fontSize: 12 }}
                cursor={{ fill: '#F5F5F7' }}
              />
              <Bar dataKey="rent_pa" fill="#0066CC" radius={[4, 4, 0, 0]} name="Miete p.a." />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stress Tests */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-5 flex items-center gap-2">
          <Zap size={15} className="text-apple-red" />
          Stress-Tests
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {stressData.map(s => (
            <div key={s.name} className="bg-apple-gray rounded-lg p-4">
              <div className="text-sm font-medium text-apple-text mb-2">{s.name}</div>
              <div className="flex gap-4">
                <div>
                  <div className="text-xs text-apple-text-tertiary">Wertveränderung</div>
                  <div className={`text-base font-semibold ${s.impact_value < 0 ? 'text-apple-red' : 'text-apple-green'}`}>
                    {s.impact_value > 0 ? '+' : ''}{formatEur(s.impact_value)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-apple-text-tertiary">CF-Veränderung</div>
                  <div className={`text-base font-semibold ${s.impact_cashflow < 0 ? 'text-apple-red' : 'text-apple-green'}`}>
                    {s.impact_cashflow > 0 ? '+' : ''}{formatEur(s.impact_cashflow)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-apple-text-tertiary mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4">Empfehlungen</h3>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-apple-text-secondary">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
