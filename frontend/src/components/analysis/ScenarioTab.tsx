import { useState, useEffect } from 'react';
import type { Property, Scenario } from '../../types';
import { runDCF, saveScenario, getScenarios } from '../../services/api';
import type { DCFResult } from '../../types';
import { formatEur, formatIRR, formatMultiple, formatPctDirect } from '../../utils/format';
import { Play, Save, ChevronDown, ChevronUp } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';

interface Props { property: Property; }

const BASE_PARAMS = {
  rent_growth_rate: 2.0,
  vacancy_rate: 5.0,
  expense_growth_rate: 2.5,
  capex_rate: 1.5,
  discount_rate: 6.5,
  exit_cap_rate: 5.0,
  ltv: 65,
  interest_rate: 4.5,
  hold_period: 10,
};

function makeDefaultParams(property: import('../../types').Property) {
  return {
    ...BASE_PARAMS,
    ltv: property.fin_ltv ?? BASE_PARAMS.ltv,
    interest_rate: property.fin_interest_rate ?? BASE_PARAMS.interest_rate,
    hold_period: property.fin_horizon ?? BASE_PARAMS.hold_period,
  };
}

interface ParamInputProps {
  label: string; sub: string; param: string;
  value: number; min: number; max: number; step: number;
  onChange: (key: string, val: number) => void;
}

function ParamInput({ label, sub, param, value, min, max, step, onChange }: ParamInputProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <div>
          <div className="text-sm font-medium text-apple-text">{label}</div>
          <div className="text-[10px] text-apple-text-tertiary">{sub}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-apple-blue w-12 text-right">{value.toFixed(1)} %</span>
        </div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(param, Number(e.target.value))}
        className="w-full h-1.5 bg-apple-gray-3 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-apple-blue [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:shadow-sm"
      />
      <div className="flex justify-between text-[10px] text-apple-text-tertiary mt-0.5">
        <span>{min}%</span><span>{max}%</span>
      </div>
    </div>
  );
}

export default function ScenarioTab({ property }: Props) {
  const [params, setParams] = useState(() => makeDefaultParams(property));
  const [result, setResult] = useState<DCFResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState<number | null>(null);

  useEffect(() => {
    getScenarios(property.id).then(setScenarios).catch(() => {});
  }, [property.id]);

  const run = async () => {
    setLoading(true);
    try {
      const r = await runDCF(property.id, {
        rent_growth_rate: params.rent_growth_rate / 100,
        vacancy_rate: params.vacancy_rate / 100,
        expense_growth_rate: params.expense_growth_rate / 100,
        capex_rate: params.capex_rate / 100,
        discount_rate: params.discount_rate / 100,
        exit_cap_rate: params.exit_cap_rate / 100,
        ltv: params.ltv / 100,
        interest_rate: params.interest_rate / 100,
        hold_period: params.hold_period,
      });
      setResult(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!result || !scenarioName) return;
    setSaving(true);
    try {
      const s = await saveScenario(property.id, {
        name: scenarioName,
        description: `IRR: ${formatIRR(result.metrics.irr)}, NPV: ${formatEur(result.metrics.npv)}`,
        params: params as unknown as Record<string, number>,
        results: result,
      });
      setScenarios(prev => [s, ...prev]);
      setScenarioName('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const loadScenario = (s: Scenario) => {
    const p = JSON.parse(s.params_json) as typeof BASE_PARAMS;
    setParams(p);
    const r = JSON.parse(s.results_json) as DCFResult;
    setResult(r);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Parameter Sliders */}
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-apple-text">Szenario-Parameter</h3>
              <p className="text-xs text-apple-text-secondary mt-0.5">Passen Sie die Annahmen an und berechnen Sie das Ergebnis</p>
            </div>
            <button onClick={run} disabled={loading} className="btn-primary flex items-center gap-2 text-sm">
              {loading ? <LoadingSpinner size="sm" /> : <Play size={14} />}
              Berechnen
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <ParamInput
              label="Mietwachstum" sub="Jährlich" param="rent_growth_rate"
              value={params.rent_growth_rate} min={-2} max={8} step={0.1}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
            <ParamInput
              label="Leerstandsrate" sub="Strukturell" param="vacancy_rate"
              value={params.vacancy_rate} min={0} max={20} step={0.5}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
            <ParamInput
              label="Kostenwachstum" sub="Betriebskosten" param="expense_growth_rate"
              value={params.expense_growth_rate} min={0} max={8} step={0.1}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
            <ParamInput
              label="CapEx Rate" sub="% des Gebäudewerts" param="capex_rate"
              value={params.capex_rate} min={0} max={5} step={0.1}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
            <ParamInput
              label="Diskontierungssatz" sub="WACC / Hurdle Rate" param="discount_rate"
              value={params.discount_rate} min={3} max={15} step={0.25}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
            <ParamInput
              label="Exit Cap Rate" sub="Verkaufs-Kapitalisierung" param="exit_cap_rate"
              value={params.exit_cap_rate} min={2} max={10} step={0.25}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
            <ParamInput
              label="LTV" sub="Beleihungsauslauf" param="ltv"
              value={params.ltv} min={0} max={85} step={5}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
            <ParamInput
              label="Zinssatz" sub="Fremdkapitalzins" param="interest_rate"
              value={params.interest_rate} min={1} max={10} step={0.25}
              onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
            />
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          {result ? (
            <>
              <div className="card bg-gradient-to-br from-apple-blue to-blue-700 text-white">
                <div className="text-xs font-medium text-blue-200 uppercase tracking-widest mb-3">Szenario-Ergebnis</div>
                <div className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold">{formatIRR(result.metrics.irr)}</div>
                    <div className="text-xs text-blue-200">IRR</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-blue-500/40">
                    <div>
                      <div className="text-lg font-semibold">{formatMultiple(result.metrics.equity_multiple)}</div>
                      <div className="text-xs text-blue-200">Equity Multiple</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{formatPctDirect(result.metrics.avg_cash_on_cash)} %</div>
                      <div className="text-xs text-blue-200">Ø Cash-on-Cash</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="space-y-2 text-sm">
                  {[
                    { l: 'NPV', v: formatEur(result.metrics.npv) },
                    { l: 'Min. DSCR', v: result.metrics.min_dscr.toFixed(2) },
                    { l: 'Payback', v: result.metrics.payback_period > 0 ? `${result.metrics.payback_period} J.` : '> Haltedauer' },
                    { l: 'Total Return', v: formatEur(result.total_equity_return) },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex justify-between border-b border-apple-gray-2 pb-2 last:border-0 last:pb-0">
                      <span className="text-apple-text-secondary">{l}</span>
                      <span className="font-medium text-apple-text">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save */}
              <div className="card">
                <div className="text-sm font-medium text-apple-text mb-2">Szenario speichern</div>
                <input
                  value={scenarioName}
                  onChange={e => setScenarioName(e.target.value)}
                  placeholder="Szenario-Name..."
                  className="input text-sm mb-2"
                />
                <button
                  onClick={save}
                  disabled={!scenarioName || saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? <LoadingSpinner size="sm" /> : <Save size={13} />}
                  Speichern
                </button>
              </div>
            </>
          ) : (
            <div className="card h-48 flex flex-col items-center justify-center text-center gap-3">
              <Play size={24} className="text-apple-text-tertiary" />
              <div className="text-sm text-apple-text-secondary">
                Parameter anpassen und<br />Berechnung starten
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved Scenarios */}
      {scenarios.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <Save size={15} className="text-apple-blue" />
            Gespeicherte Szenarien ({scenarios.length})
          </h3>
          <div className="space-y-2">
            {scenarios.map(s => {
              const r = JSON.parse(s.results_json) as DCFResult;
              const isOpen = expandedScenario === s.id;
              return (
                <div key={s.id} className="border border-apple-gray-2 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-3 hover:bg-apple-gray cursor-pointer" onClick={() => setExpandedScenario(isOpen ? null : s.id)}>
                    <div>
                      <div className="text-sm font-medium text-apple-text">{s.name}</div>
                      <div className="text-xs text-apple-text-secondary">{s.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); loadScenario(s); }} className="btn-ghost text-xs py-1 px-2">Laden</button>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="p-3 pt-0 border-t border-apple-gray-2 bg-apple-gray/30">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mt-3">
                        {[
                          { l: 'IRR', v: formatIRR(r.metrics.irr) },
                          { l: 'NPV', v: formatEur(r.metrics.npv) },
                          { l: 'Equity Multiple', v: formatMultiple(r.metrics.equity_multiple) },
                          { l: 'Ø CoC', v: formatPctDirect(r.metrics.avg_cash_on_cash) + '%' },
                        ].map(({ l, v }) => (
                          <div key={l} className="bg-white p-2 rounded text-center">
                            <div className="text-sm font-semibold text-apple-text">{v}</div>
                            <div className="text-[10px] text-apple-text-tertiary">{l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
