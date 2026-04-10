import { useState, useMemo } from 'react';
import { Euro, Percent, Calendar, TrendingUp, AlertCircle, Info, Save, Check } from 'lucide-react';
import type { Property, FullAnalysis } from '../../types';
import { formatEur } from '../../utils/format';
import { updateProperty } from '../../services/api';

interface Props {
  property: Property;
  analysis?: FullAnalysis | null;
  onPropertyUpdate?: (p: Property) => void;
}

function SliderInput({
  label, value, onChange, min, max, step, unit, hint,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string; hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-medium text-apple-text-secondary">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min} max={max} step={step}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            className="w-20 text-right px-2 py-1 text-xs border border-apple-gray-3 rounded-lg focus:outline-none focus:border-apple-blue bg-white font-medium"
          />
          <span className="text-xs text-apple-text-tertiary">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-apple-blue cursor-pointer"
      />
      {hint && <p className="text-[10px] text-apple-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}

function MetricBox({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-apple text-center ${highlight ? 'bg-apple-blue text-white' : 'bg-apple-gray'}`}>
      <div className={`text-lg font-bold ${highlight ? 'text-white' : 'text-apple-text'}`}>{value}</div>
      <div className={`text-[10px] uppercase tracking-wide mt-0.5 ${highlight ? 'text-blue-100' : 'text-apple-blue font-medium'}`}>{label}</div>
      {sub && <div className={`text-[10px] mt-0.5 ${highlight ? 'text-blue-100' : 'text-apple-text-tertiary'}`}>{sub}</div>}
    </div>
  );
}

export default function FinanzierungTab({ property, analysis, onPropertyUpdate }: Props) {
  const [ltv, setLtv] = useState(property.fin_ltv ?? 70);
  const [interest, setInterest] = useState(property.fin_interest_rate ?? 3.5);
  const [amortRate, setAmortRate] = useState(property.fin_amort_rate ?? 2.0);
  const [nebenkosten, setNebenkosten] = useState(property.fin_nebenkosten ?? 10);
  const [horizon, setHorizon] = useState(property.fin_horizon ?? 10);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProperty(property.id, {
        fin_ltv: ltv,
        fin_interest_rate: interest,
        fin_amort_rate: amortRate,
        fin_nebenkosten: nebenkosten,
        fin_horizon: horizon,
      });
      onPropertyUpdate?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const calc = useMemo(() => {
    const pp = property.purchase_price || 0;
    const nk = pp * nebenkosten / 100;
    const acquisition = pp + nk;
    const loan = pp * ltv / 100;
    const equity = acquisition - loan;

    // Standard annuity mortgage: monthly payment
    const r = interest / 1200; // monthly rate
    const n = horizon * 12;    // months
    const monthlyPayment = r > 0
      ? loan * r / (1 - Math.pow(1 + r, -n))
      : loan / n;
    const annualDebtService = monthlyPayment * 12;

    // German quick method (Anfangstilgung)
    const annuityRatePct = interest + amortRate;
    const annualPaymentSimple = loan * annuityRatePct / 100;

    // NOI from DCF year 1 (if available)
    const noi = analysis?.dcf?.yearly_cashflows?.[0]?.noi ?? null;
    const dscr = noi && annualDebtService > 0 ? noi / annualDebtService : null;

    // Amortization schedule
    const schedule: Array<{
      year: number; restschuld_start: number; zinsen: number; tilgung: number;
      jahresrate: number; restschuld_end: number; cashflow: number | null;
    }> = [];
    let remaining = loan;
    for (let y = 1; y <= horizon; y++) {
      const yearlyInterest = remaining * interest / 100;
      const yearlyPayment = monthlyPayment * 12;
      const yearlyAmort = yearlyPayment - yearlyInterest;
      const noiy = analysis?.dcf?.yearly_cashflows?.[y - 1]?.noi ?? null;
      const cf = noiy != null ? noiy - yearlyPayment : null;
      schedule.push({
        year: y,
        restschuld_start: remaining,
        zinsen: yearlyInterest,
        tilgung: yearlyAmort > 0 ? yearlyAmort : 0,
        jahresrate: yearlyPayment,
        restschuld_end: Math.max(0, remaining - (yearlyAmort > 0 ? yearlyAmort : 0)),
        cashflow: cf,
      });
      remaining = Math.max(0, remaining - (yearlyAmort > 0 ? yearlyAmort : 0));
    }

    const totalInterest = schedule.reduce((s, r) => s + r.zinsen, 0);
    const totalAmort = schedule.reduce((s, r) => s + r.tilgung, 0);
    const endBalance = schedule[schedule.length - 1]?.restschuld_end ?? loan;
    const yearsToPayoff = r > 0
      ? Math.log(monthlyPayment / (monthlyPayment - loan * r)) / Math.log(1 + r) / 12
      : loan / annualPaymentSimple;

    return {
      pp, nk, acquisition, loan, equity,
      monthlyPayment, annualDebtService,
      noi, dscr,
      schedule, totalInterest, totalAmort, endBalance, yearsToPayoff,
      ltvPct: loan / (pp || 1) * 100,
      equityPct: equity / (acquisition || 1) * 100,
    };
  }, [property.purchase_price, ltv, interest, amortRate, nebenkosten, horizon, analysis]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Input panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-apple-text flex items-center gap-2"><Percent size={14} className="text-apple-blue" />Finanzierungsparameter</h3>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {saved ? <Check size={13} /> : <Save size={13} />}
              {saving ? 'Speichern…' : saved ? 'Gespeichert' : 'Speichern'}
            </button>
          </div>
          <SliderInput label="Beleihungsauslauf (LTV)" value={ltv} onChange={setLtv} min={0} max={100} step={1} unit="%" hint="Anteil des Kaufpreises der fremdfinanziert wird" />
          <SliderInput label="Zinssatz" value={interest} onChange={setInterest} min={0.5} max={10} step={0.1} unit="%" />
          <SliderInput label="Anfangstilgung" value={amortRate} onChange={setAmortRate} min={0.5} max={10} step={0.1} unit="%" hint="Jährlicher Tilgungsanteil bei Beginn" />
          <SliderInput label="Kaufnebenkosten" value={nebenkosten} onChange={setNebenkosten} min={0} max={20} step={0.5} unit="%" hint="Notar, Grunderwerbsteuer, Makler etc." />
          <SliderInput label="Planungshorizont" value={horizon} onChange={setHorizon} min={3} max={30} step={1} unit="Jahre" />
        </div>

        <div className="card space-y-4">
          <h3 className="font-semibold text-apple-text flex items-center gap-2"><Euro size={14} className="text-apple-blue" />Kapitalstruktur</h3>
          <div className="space-y-2">
            {[
              { label: 'Kaufpreis', val: formatEur(calc.pp), color: 'bg-apple-gray-3', pct: 100 },
              { label: 'Kaufnebenkosten', val: formatEur(calc.nk), color: 'bg-apple-orange/60', pct: nebenkosten },
              { label: 'Fremdkapital (Darlehen)', val: formatEur(calc.loan), color: 'bg-apple-blue/70', pct: ltv },
              { label: 'Eigenkapitalbedarf', val: formatEur(calc.equity), color: 'bg-apple-green/70', pct: calc.equityPct },
            ].map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-apple-text-secondary">{r.label}</span>
                  <span className="font-semibold text-apple-text">{r.val}</span>
                </div>
                <div className="h-1.5 bg-apple-gray-2 rounded-full">
                  <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min(100, Math.max(2, r.pct))}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-apple-gray-2 pt-3 grid grid-cols-2 gap-3">
            <div className="text-xs">
              <span className="text-apple-text-secondary">Monatliche Rate</span>
              <div className="text-base font-bold text-apple-text mt-0.5">{formatEur(calc.monthlyPayment)}</div>
            </div>
            <div className="text-xs">
              <span className="text-apple-text-secondary">Jahresrate (Annuität)</span>
              <div className="text-base font-bold text-apple-text mt-0.5">{formatEur(calc.annualDebtService)}</div>
            </div>
            <div className="text-xs">
              <span className="text-apple-text-secondary">Tilgungsdauer</span>
              <div className="text-base font-bold text-apple-text mt-0.5">{isFinite(calc.yearsToPayoff) ? `${calc.yearsToPayoff.toFixed(1)} J.` : '∞'}</div>
            </div>
            <div className="text-xs">
              <span className="text-apple-text-secondary">Restschuld nach {horizon}J.</span>
              <div className="text-base font-bold text-apple-text mt-0.5">{formatEur(calc.endBalance)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricBox label="LTV" value={`${ltv} %`} sub={`EK ${(100 - ltv)} %`} />
        <MetricBox label="Monatliche Rate" value={formatEur(calc.monthlyPayment)} sub="Annuität / 12" highlight />
        <MetricBox
          label="DSCR"
          value={calc.dscr != null ? calc.dscr.toFixed(2) : '–'}
          sub={calc.dscr != null
            ? calc.dscr >= 1.3 ? 'Komfortabel' : calc.dscr >= 1.0 ? 'Kritisch' : 'Negativ'
            : 'NOI n.v.'}
        />
        <MetricBox label="Zinskosten gesamt" value={formatEur(calc.totalInterest)} sub={`${horizon} Jahre`} />
      </div>

      {/* DSCR warning */}
      {calc.dscr != null && calc.dscr < 1.0 && (
        <div className="flex items-start gap-2 p-3 rounded-apple bg-red-50 border border-red-200 text-xs text-red-800">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-red-600" />
          <span>DSCR &lt; 1,0: Der NOI reicht nicht aus, um den Schuldendienst zu decken. Erwägen Sie einen niedrigeren LTV oder höhere Mieteinnahmen.</span>
        </div>
      )}
      {calc.dscr != null && calc.dscr >= 1.0 && calc.dscr < 1.2 && (
        <div className="flex items-start gap-2 p-3 rounded-apple bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <Info size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
          <span>DSCR zwischen 1,0–1,2: Geringe Puffermarge. Banken erwarten in der Regel DSCR ≥ 1,2–1,25.</span>
        </div>
      )}

      {/* Amortization schedule */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
          <Calendar size={14} className="text-apple-blue" />Tilgungsplan ({horizon} Jahre)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-apple-gray-2 text-apple-text-tertiary uppercase tracking-wide">
                <th className="pb-2 text-left">Jahr</th>
                <th className="pb-2 text-right">Restschuld Start</th>
                <th className="pb-2 text-right">Zinsen</th>
                <th className="pb-2 text-right">Tilgung</th>
                <th className="pb-2 text-right">Jahresrate</th>
                <th className="pb-2 text-right">Restschuld Ende</th>
                {calc.noi != null && <th className="pb-2 text-right">Cash-Flow vor St.</th>}
              </tr>
            </thead>
            <tbody>
              {calc.schedule.map(row => (
                <tr key={row.year} className="border-b border-apple-gray-1 last:border-0 hover:bg-apple-gray transition-colors">
                  <td className="py-1.5 font-medium text-apple-text">Jahr {row.year}</td>
                  <td className="py-1.5 text-right text-apple-text-secondary">{formatEur(row.restschuld_start)}</td>
                  <td className="py-1.5 text-right text-apple-orange font-medium">{formatEur(row.zinsen)}</td>
                  <td className="py-1.5 text-right text-apple-green font-medium">{formatEur(row.tilgung)}</td>
                  <td className="py-1.5 text-right text-apple-text font-semibold">{formatEur(row.jahresrate)}</td>
                  <td className="py-1.5 text-right text-apple-text-secondary">{formatEur(row.restschuld_end)}</td>
                  {calc.noi != null && (
                    <td className={`py-1.5 text-right font-semibold ${row.cashflow != null && row.cashflow >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                      {row.cashflow != null ? formatEur(row.cashflow) : '–'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-apple-gray-3 font-semibold bg-apple-gray">
                <td className="pt-2 text-apple-text">Gesamt</td>
                <td className="pt-2" />
                <td className="pt-2 text-right text-apple-orange">{formatEur(calc.totalInterest)}</td>
                <td className="pt-2 text-right text-apple-green">{formatEur(calc.totalAmort)}</td>
                <td className="pt-2 text-right text-apple-text">{formatEur(calc.totalInterest + calc.totalAmort)}</td>
                <td className="pt-2 text-right text-apple-text-secondary">{formatEur(calc.endBalance)}</td>
                {calc.noi != null && <td className="pt-2" />}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[10px] text-apple-text-tertiary mt-3">
          Annuitätendarlehen, monatliche Tilgung. Restschuld nach {horizon} Jahren: {formatEur(calc.endBalance)} ({(calc.endBalance / (calc.loan || 1) * 100).toFixed(1)} % des Darlehens).
          {calc.noi != null && ' Cash-Flow = NOI aus DCF-Analyse abzüglich Schuldendienst.'}
        </p>
      </div>

      {/* Sensitivity */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-apple-blue" />Sensitivität: Monatliche Rate (€) nach LTV und Zinssatz
        </h3>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-apple-gray-2">
                <th className="pb-2 text-left text-apple-text-secondary">LTV \\ Zins</th>
                {[2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0].map(r => (
                  <th key={r} className={`pb-2 text-right ${r === interest ? 'text-apple-blue font-bold' : 'text-apple-text-tertiary'}`}>{r.toFixed(1)} %</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[50, 60, 70, 75, 80].map(l => (
                <tr key={l} className={`border-b border-apple-gray-1 last:border-0 ${l === ltv ? 'bg-blue-50 font-semibold' : ''}`}>
                  <td className={`py-1.5 ${l === ltv ? 'text-apple-blue font-bold' : 'text-apple-text-secondary'}`}>{l} %</td>
                  {[2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0].map(r => {
                    const loanS = (property.purchase_price || 0) * l / 100;
                    const rM = r / 1200;
                    const nS = horizon * 12;
                    const mp = rM > 0 ? loanS * rM / (1 - Math.pow(1 + rM, -nS)) : loanS / nS;
                    return (
                      <td key={r} className={`py-1.5 text-right ${l === ltv && r === interest ? 'text-apple-blue font-bold underline' : 'text-apple-text-secondary'}`}>
                        {Math.round(mp).toLocaleString('de-DE')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-apple-text-tertiary mt-2">Monatliche Annuitätenrate in €. Aktuell gewählte Kombination unterstrichen.</p>
      </div>

    </div>
  );
}
