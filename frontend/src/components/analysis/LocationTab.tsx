import { useEffect, useState } from 'react';
import type { LocationAnalysis, Property } from '../../types';
import { MapPin, TrendingUp, AlertTriangle, CheckCircle2, Star, Newspaper, Camera, ExternalLink } from 'lucide-react';
import ScoreRing from '../ui/ScoreRing';
import { getNews } from '../../services/api';
import type { NewsItem } from '../../services/api';

interface Props { data: LocationAnalysis; property?: Property; }

function ScoreBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? '#34C759' : pct >= 50 ? '#FF9500' : '#FF3B30';
  return (
    <div>
      <div className="flex justify-between items-center text-sm mb-1.5"><span className="text-apple-text-secondary">{label}</span><span className="font-medium text-apple-text">{value}/{max}</span></div>
      <div className="h-2 bg-apple-gray-2 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
    </div>
  );
}

interface NewsBlockProps { title: string; query: string; icon?: React.ReactNode; }
function NewsBlock({ title, query, icon }: NewsBlockProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNews(query)
      .then(r => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [query]);

  const searchUrl = `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=de&gl=DE`;

  return (
    <div className="card">
      <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
        {icon ?? <Newspaper size={15} className="text-apple-blue" />}
        {title}
        <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-apple-text-tertiary hover:text-apple-blue transition-colors">
          <ExternalLink size={13} />
        </a>
      </h3>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-4 bg-apple-gray-2 rounded animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-apple-text-tertiary">Keine aktuellen Meldungen gefunden.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="border-b border-apple-gray-2 last:border-0 pb-2 last:pb-0">
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sm text-apple-text hover:text-apple-blue transition-colors line-clamp-2 font-medium leading-snug">
                {item.title}
              </a>
              <div className="flex items-center gap-2 mt-0.5">
                {item.source && <span className="text-[10px] text-apple-text-tertiary">{item.source}</span>}
                {item.pubDate && <span className="text-[10px] text-apple-text-tertiary">{new Date(item.pubDate).toLocaleDateString('de-DE')}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LocationTab({ data, property }: Props) {
  const { macro, micro, risk_factors, opportunities, overall_score, recommendation, city } = data;
  const tierColor = macro.city_tier === 'A-Stadt' ? 'badge-green' : macro.city_tier === 'B-Stadt' ? 'badge-orange' : 'badge-gray';

  // Build address strings for map / links
  const fullAddress = [property?.address, data.zip_code, city].filter(Boolean).join(', ');
  const mapQuery = encodeURIComponent(fullAddress || city);
  const googleMapsUrl = `https://maps.google.com/maps?q=${mapQuery}`;
  const streetViewUrl = `https://maps.google.com/maps?q=${mapQuery}&layer=c`;
  const googlePhotosUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(fullAddress || city)}+Immobilie`;

  // News queries
  const tenantName = property?.tenants?.[0]?.name ?? '';
  const locationQuery = `Immobilien ${city} ${data.zip_code ?? ''}`.trim();
  const tenantQuery = tenantName ? `${tenantName} Nachrichten` : `Unternehmen ${city} Nachrichten`;
  const reNewsQuery = `Immobilienmarkt ${city} ${macro.city_tier}`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-apple-lg bg-gradient-to-br from-purple-600 to-indigo-700 p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-purple-200 uppercase tracking-widest mb-1">Standortanalyse</div>
            <div className="text-3xl font-bold mb-1">{city}</div>
            <div className="text-purple-200 text-sm">{data.zip_code}{property?.address ? ` · ${property.address}` : ''}</div>
          </div>
          <div className="text-center"><div className="text-5xl font-bold">{overall_score}</div><div className="text-xs text-purple-200 mt-1">Gesamt-Score</div></div>
        </div>
        <div className="mt-4 pt-4 border-t border-purple-500/40 text-sm text-purple-100">{recommendation}</div>
      </div>

      {/* Map + Street View */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-apple-gray-2">
          <h3 className="font-semibold text-apple-text flex items-center gap-2"><MapPin size={15} className="text-apple-purple" />Karte & Lage</h3>
          <div className="flex items-center gap-2">
            <a href={streetViewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-apple-text-secondary hover:text-apple-blue transition-colors px-2.5 py-1.5 rounded-lg bg-apple-gray hover:bg-apple-gray-2">
              <Camera size={12} /> Street View
            </a>
            <a href={googlePhotosUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-apple-text-secondary hover:text-apple-blue transition-colors px-2.5 py-1.5 rounded-lg bg-apple-gray hover:bg-apple-gray-2">
              <Camera size={12} /> Fotos
            </a>
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-apple-blue hover:underline">
              <ExternalLink size={12} /> Google Maps öffnen
            </a>
          </div>
        </div>
        <iframe
          title="Standortkarte"
          src={`https://maps.google.com/maps?q=${mapQuery}&output=embed&z=15`}
          width="100%"
          height="320"
          style={{ border: 0, display: 'block' }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      {/* Macro + Micro */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2"><TrendingUp size={15} className="text-apple-blue" />Makroanalyse<span className={`badge ${tierColor} ml-auto`}>{macro.city_tier}</span></h3>
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
              {macro.facts.map((f, i) => <div key={i} className="text-xs text-apple-text-secondary flex items-start gap-1.5"><Star size={10} className="text-apple-orange mt-0.5 flex-shrink-0" />{f}</div>)}
            </div>
          )}
        </div>
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2"><MapPin size={15} className="text-apple-purple" />Mikroanalyse – Nachbarschaft</h3>
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

      {/* Score overview */}
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
          ].map(r => <ScoreRing key={r.label} score={r.score} label={r.label} sublabel={r.sub} size={72} />)}
        </div>
      </div>

      {/* Opportunities + Risk factors */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2"><CheckCircle2 size={15} className="text-apple-green" />Chancen</h3>
          <ul className="space-y-2">{opportunities.map((o, i) => <li key={i} className="flex items-start gap-2 text-sm text-apple-text-secondary"><span className="w-5 h-5 rounded-full bg-green-100 text-green-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>{o}</li>)}</ul>
        </div>
        <div className="card">
          <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2"><AlertTriangle size={15} className="text-apple-orange" />Risikofaktoren</h3>
          <ul className="space-y-2">{risk_factors.map((r, i) => <li key={i} className="flex items-start gap-2 text-sm text-apple-text-secondary"><span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">!</span>{r}</li>)}</ul>
        </div>
      </div>

      {/* News section */}
      <div>
        <h3 className="font-semibold text-apple-text mb-3 flex items-center gap-2"><Newspaper size={15} className="text-apple-blue" />Aktuelle News</h3>
        <div className="grid grid-cols-3 gap-4">
          <NewsBlock
            title="Immobilienmarkt"
            query={reNewsQuery}
            icon={<TrendingUp size={15} className="text-apple-blue" />}
          />
          <NewsBlock
            title={`Standort ${city}`}
            query={locationQuery}
            icon={<MapPin size={15} className="text-apple-purple" />}
          />
          {tenantName ? (
            <NewsBlock
              title={`Mieter: ${tenantName}`}
              query={tenantQuery}
              icon={<Newspaper size={15} className="text-apple-orange" />}
            />
          ) : (
            <NewsBlock
              title="Wirtschaft & Mieter"
              query={`Gewerbe Mieter ${city}`}
              icon={<Newspaper size={15} className="text-apple-orange" />}
            />
          )}
        </div>
      </div>

      {/* Data source disclaimer */}
      <div className="rounded-apple border border-apple-gray-3 bg-apple-gray px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={13} className="text-apple-orange mt-0.5 flex-shrink-0" />
          <div className="text-[11px] text-apple-text-secondary leading-relaxed">
            <span className="font-medium text-apple-text">Datengrundlage: </span>
            {data.data_source ?? 'Internes Referenzdatenbankmodell (Stand 2024)'}
            {' '}Für gutachterliche Bewertungen externe Marktdaten heranziehen:
            {' '}
            <a href="https://www.destatis.de" target="_blank" rel="noopener noreferrer" className="text-apple-blue hover:underline">Destatis</a>
            {' · '}
            <a href="https://www.jll.de/de/trends-und-insights/research" target="_blank" rel="noopener noreferrer" className="text-apple-blue hover:underline">JLL Research</a>
            {' · '}
            <a href="https://www.cbre.de/de-de/research-and-reports" target="_blank" rel="noopener noreferrer" className="text-apple-blue hover:underline">CBRE Research</a>
            {' · '}
            <a href="https://www.ivd.net/marktdaten" target="_blank" rel="noopener noreferrer" className="text-apple-blue hover:underline">IVD Marktdaten</a>
          </div>
        </div>
      </div>
    </div>
  );
}
