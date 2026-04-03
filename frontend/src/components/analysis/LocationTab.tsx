import type { LocationAnalysis } from '../../types';
import { MapPin, TrendingUp, AlertTriangle, CheckCircle2, Star } from 'lucide-react';
import ScoreRing from '../ui/ScoreRing';

interface Props { data: LocationAnalysis; }

function ScoreBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? '#34C759' : pct >= 50 ? '#FF9500' : '#FF3B30';
  return (
    <div>
      <div className="flex justify-between items-center text-sm mb-1.5">
        <span className="text-apple-text-secondary">{label}</span>
        <span className="font-medium text-apple-text">{value}/{max}</span>
      </div>
      <div className="h-2 bg-apple-gray-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function LocationTab({ data }: Props) {
  const { macro, micro, risk_factors, opportunities, overall_score, recommendation, city } = data;

  const tierColor = macro.city_tier === 'A-Stadt' ? 'badge-green'
    : macro.city_tier === 'B-Stadt' ? 'badge-orange' : 'badge-gray';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-apple-lg bg-gradient-to-br from-purple-600 to-indigo-700 p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-purple-200 uppercase tracking-widest mb-1">Standortanalyse</div>
            <div className="text-3xl font-bold mb-1">{city}</div>
            <div className="text-purple-200 text-sm">{data.zip_code}</div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold">{overall_score}</div>
            <div className="text-xs text-purple-200 mt-1">Gesamt-Score</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-purple-500/40 text-sm text-purple-100">
          {recommendation}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Macro Analysis */}
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-apple-blue" />
            Makroanalyse
            <span className={`badge ${tierColor} ml-auto`}>{macro.city_tier}</span>
          </h3>
          <div className="space-y-3">
            <ScoreBar label="Stadtbewertung" value={macro.city_rating} />
            <ScoreBar label="Infrastruktur" value={macro.infrastructure_score} />
            <ScoreBar label="Wirtschaftliche Diversität" value={macro.economic_diversity_score} />
          </div>
          <div className="divider" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Bevölkerungstrend', value: macro.population_trend },
              { label: 'BIP-Wachstum', value: `${macro.gdp_growth.toFixed(1)} %` },
              { label: 'Arbeitslosigkeit', value: `${macro.unemployment_rate.toFixed(1)} %` },
              { label: 'Markttrend', value: macro.real_estate_market_trend },
            ].map(item => (
              <div key={item.label} className="bg-apple-gray p-2.5 rounded-lg">
                <div className="text-[10px] text-apple-text-tertiary uppercase tracking-wide">{item.label}</div>
                <div className="text-sm font-medium text-apple-text mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>
          {macro.facts.length > 0 && (
            <div className="mt-3 space-y-1">
              {macro.facts.map((f, i) => (
                <div key={i} className="text-xs text-apple-text-secondary flex items-start gap-1.5">
                  <Star size={10} className="text-apple-orange mt-0.5 flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Micro Analysis */}
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <MapPin size={15} className="text-apple-purple" />
            Mikroanalyse – Nachbarschaft
          </h3>
          <div className="space-y-3">
            <ScoreBar label="Lage-Bewertung" value={micro.neighborhood_rating} />
            <ScoreBar label="ÖPNV-Anbindung" value={micro.public_transport_score} />
            <ScoreBar label="Infrastruktur/Amenities" value={micro.amenities_score} />
            <ScoreBar label="Fußläufigkeit" value={micro.walkability_score} />
          </div>
          <div className="divider" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Leerstandsrate (Lage)', value: `${micro.vacancy_rate_area.toFixed(1)} %` },
              { label: 'Mietpreis-Niveau', value: micro.rent_level_comparison },
              { label: 'Entwicklungspotenzial', value: micro.development_potential },
            ].map(item => (
              <div key={item.label} className="bg-apple-gray p-2.5 rounded-lg">
                <div className="text-[10px] text-apple-text-tertiary uppercase tracking-wide">{item.label}</div>
                <div className="text-sm font-medium text-apple-text mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Score Rings */}
      <div className="card">
        <h3 className="font-semibold text-apple-text mb-5">Score-Übersicht</h3>
        <div className="flex justify-around flex-wrap gap-4">
          {[
            { score: macro.city_rating * 10, label: 'Stadtqualität', sub: `${macro.city_rating}/10` },
            { score: macro.infrastructure_score * 10, label: 'Infrastruktur', sub: `${macro.infrastructure_score}/10` },
            { score: micro.neighborhood_rating * 10, label: 'Lage', sub: `${micro.neighborhood_rating}/10` },
            { score: micro.public_transport_score * 10, label: 'ÖPNV', sub: `${micro.public_transport_score}/10` },
            { score: micro.amenities_score * 10, label: 'Amenities', sub: `${micro.amenities_score}/10` },
            { score: overall_score, label: 'Gesamt', sub: `${overall_score}/100` },
          ].map(r => (
            <ScoreRing key={r.label} score={r.score} label={r.label} sublabel={r.sub} size={72} />
          ))}
        </div>
      </div>

      {/* Opportunities & Risks */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-apple-green" />
            Chancen
          </h3>
          <ul className="space-y-2">
            {opportunities.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-apple-text-secondary">
                <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {o}
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
            <AlertTriangle size={15} className="text-apple-orange" />
            Risikofaktoren
          </h3>
          <ul className="space-y-2">
            {risk_factors.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-apple-text-secondary">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  !
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
