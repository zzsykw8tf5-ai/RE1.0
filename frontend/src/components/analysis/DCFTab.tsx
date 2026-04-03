import type { DCFResult, Property } from '../../types';
import { formatEur, formatIRR, formatMultiple, formatPctDirect } from '../../utils/format';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';

interface Props { data: DCFResult; property: Property; }

const EUR_TICK = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v);

export default function DCFTab({ data }: Props) {
  const { yearly_cashflows: cfs, metrics, sensitivity, terminal_value, sale_proceeds } = data;

  const chartData = cfs.map(cf => ({
    Jahr: `J${cf.year}`,
    NOI: Math.round(cf.noi),
    'Cash Flow': Math.round(cf.cash_flow_before_tax),
    'Kum. CF': Math.round(cf.cumulative_cf),
  }));

  const waterfall = cfs.slice(0, 1).flatMap(cf => [
    { name: 'Mieteinnahmen', value: cf.gross_income, fill: '#34C759' },
    { name: 'Leerstand', value: -cf.vacancy_loss, fill: '#FF3B30' },
    { name: 'Betriebskosten', value: -cf.operating_expenses, fill: '#FF9500' },
    { name: 'NOI', value: cf.noi, fill: '#0066CC' },
    { name: 'Schuldendienst', value: -cf.debt_service, fill: '#AF52DE' },
    { name: 'CapEx', value: -cf.capex, fill: '#30B0C7' },
    { name: 'Cash Flow', value: cf.cash_flow_before_tax, fill: cf.cash_flow_before_tax >= 0 ? '#34C759' : '#FF3B30' },
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metrics Banner */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'IRR', value: formatIRR(metrics.irr), sub: '10-Jahres Rendite', color: 'from-blue-600 to-blue-700' },
          { label: 'NPV', value: formatEur(metrics.npv), sub: 'Kapitalwert', color: 'from-green-600 to-green-700' },
          { label: 'Equity Multiple', value: formatMultiple(metrics.equity_multiple), sub: 'EK-Multiplikator', color: 'from-purple-600 to-purple-700' },
          { label: 'Ø CoC', value: formatPctDirect(metrics.avg_cash_on_cash) + ' %', sub: 'Cash-on-Cash p.a.', color: 'from-orange-500 to-orange-600' },
          { label: 'Min. DSCR', value: metrics.min_dscr.toFixed(2), sub: 'Debt Coverage', color: metrics.min_dscr >= 1.25 ? 'from-teal-600 to-teal-700' : 'from-red-500 to-red-600' },
        ].map(kpi => (
          <div key={kpi.label} className={`bg-gradient-to-br ${kpi.color} rounded-apple p-4 text-white`}>
            <div className="text-2xl font-bold">{kpi.value}</div>
            <div className="text-xs font-medium opacity-80 mt-0.5">{kpi.label}</div>
            <div className="text-[10px] opacity-60 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Cashflow Chart */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-5">Cashflow-Verlauf (10 Jahre)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="noi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0066CC" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0066CC" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34C759" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#34C759" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F7" />
            <XAxis dataKey="Jahr" tick={{ fontSize: 11, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={EUR_TICK} tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v: unknown, n: unknown) => [formatEur(Number(v)), String(n)]}
              contentStyle={{ background: 'white', border: '1px solid #E8E8ED', borderRadius: 8, fontSize: 12 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#AEAEB2" strokeWidth={1} />
            <Area dataKey="NOI" stroke="#0066CC" fill="url(#noi)" strokeWidth={2} dot={false} />
            <Area dataKey="Cash Flow" stroke="#34C759" fill="url(#cf)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Year 1 Waterfall */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-5">Cashflow-Aufschlüsselung (Jahr 1)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={waterfall} barSize={36}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={EUR_TICK} tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: unknown) => formatEur(Number(v))} contentStyle={{ background: 'white', border: '1px solid #E8E8ED', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#F5F5F7' }} />
            <ReferenceLine y={0} stroke="#AEAEB2" />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {waterfall.map((e, i) => (
                <rect key={i} fill={e.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Yearly Table */}
      <div className="card overflow-x-auto">
        <h3 className="font-semibold text-apple-text mb-4">Jahresübersicht</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-apple-text-tertiary uppercase tracking-wide border-b border-apple-gray-2">
              {['Jahr', 'Rohertrag', 'NOI', 'Schuldend.', 'CapEx', 'Cash Flow', 'Kum. CF', 'NOI-Yield', 'CoC'].map(h => (
                <th key={h} className="pb-2 text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cfs.map(cf => (
              <tr key={cf.year} className="border-b border-apple-gray-2 last:border-0 hover:bg-apple-gray">
                <td className="py-2 font-medium text-apple-text">{cf.year}</td>
                <td className="py-2 text-right text-apple-text-secondary">{formatEur(cf.gross_income)}</td>
                <td className="py-2 text-right font-medium text-apple-text">{formatEur(cf.noi)}</td>
                <td className="py-2 text-right text-apple-text-secondary">{formatEur(cf.debt_service)}</td>
                <td className="py-2 text-right text-apple-text-secondary">{formatEur(cf.capex)}</td>
                <td className={`py-2 text-right font-medium ${cf.cash_flow_before_tax >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                  {formatEur(cf.cash_flow_before_tax)}
                </td>
                <td className={`py-2 text-right ${cf.cumulative_cf >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                  {formatEur(cf.cumulative_cf)}
                </td>
                <td className="py-2 text-right text-apple-text-secondary">{formatPctDirect(cf.noi_yield)} %</td>
                <td className="py-2 text-right text-apple-text-secondary">
                  {metrics.cash_on_cash_returns[cf.year - 1] !== undefined
                    ? formatPctDirect(metrics.cash_on_cash_returns[cf.year - 1]) + ' %'
                    : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Exit & Sensitivity */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4">Exit-Analyse (Jahr 10)</h3>
          <div className="space-y-2">
            <div className="flex justify-between py-2 border-b border-apple-gray-2">
              <span className="text-sm text-apple-text-secondary">Verkaufserlös</span>
              <span className="text-sm font-medium text-apple-text">{formatEur(sale_proceeds)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-apple-gray-2">
              <span className="text-sm text-apple-text-secondary">Terminal Value</span>
              <span className="text-sm font-medium text-apple-text">{formatEur(terminal_value)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm font-semibold text-apple-text">Total Equity Return</span>
              <span className="text-sm font-semibold text-apple-green">{formatEur(data.total_equity_return)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4">Sensitivität – Exit Cap Rate</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-apple-text-tertiary uppercase border-b border-apple-gray-2">
                <th className="pb-2 text-left">Szenario</th>
                <th className="pb-2 text-right">IRR</th>
                <th className="pb-2 text-right">Equity Multiple</th>
              </tr>
            </thead>
            <tbody>
              {sensitivity.exit_cap_scenarios.map(s => (
                <tr key={s.label} className="border-b border-apple-gray-2 last:border-0">
                  <td className="py-2 text-apple-text-secondary">{s.label}</td>
                  <td className={`py-2 text-right font-medium ${s.irr >= 0.08 ? 'text-apple-green' : s.irr >= 0.05 ? 'text-apple-orange' : 'text-apple-red'}`}>
                    {formatIRR(s.irr)}
                  </td>
                  <td className="py-2 text-right text-apple-text">{formatMultiple(s.equity_multiple)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
