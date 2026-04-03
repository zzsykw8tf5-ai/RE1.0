import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProperties } from '../services/api';
import type { Property } from '../types';
import { formatEur, formatSqm, propertyTypeLabel } from '../utils/format';
import TopBar from '../components/Layout/TopBar';
import { ArrowRight, Plus, Map, List, MapPin, ExternalLink } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';

const TYPE_COLORS: Record<string, string> = {
  RESIDENTIAL: '#34C759',
  OFFICE: '#0066CC',
  RETAIL: '#FF9500',
  INDUSTRIAL: '#6E6E73',
  MIXED: '#AF52DE',
};

function PropertyMapCard({ property }: { property: Property }) {
  const address = [property.address, property.zip_code, property.city].filter(Boolean).join(', ');
  const query = encodeURIComponent(address || property.city);
  const googleMapsUrl = `https://maps.google.com/maps?q=${query}`;
  const streetViewUrl = `https://maps.google.com/maps?q=${query}&layer=c`;

  return (
    <div className="card overflow-hidden p-0 flex flex-col">
      <div className="relative">
        <iframe
          title={property.name}
          src={`https://maps.google.com/maps?q=${query}&output=embed&z=16`}
          width="100%"
          height="180"
          style={{ border: 0, display: 'block' }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div
          className="absolute top-2 left-2 px-2 py-1 text-[10px] font-semibold text-white rounded-md"
          style={{ backgroundColor: TYPE_COLORS[property.property_type] || '#6E6E73' }}
        >
          {propertyTypeLabel(property.property_type)}
        </div>
      </div>
      <div className="p-3 flex-1">
        <div className="font-medium text-apple-text text-sm truncate">{property.name}</div>
        <div className="text-[11px] text-apple-text-secondary mt-0.5 truncate flex items-center gap-1">
          <MapPin size={9} />{address}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-semibold text-apple-blue">{formatEur(property.purchase_price)}</span>
          <div className="flex items-center gap-1.5">
            <a href={streetViewUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-apple-text-tertiary hover:text-apple-blue flex items-center gap-0.5">
              Street View <ExternalLink size={9} />
            </a>
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-apple-text-tertiary hover:text-apple-blue flex items-center gap-0.5">
              Maps <ExternalLink size={9} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    getProperties().then(d => { setProperties(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const totalValue = properties.reduce((s, p) => s + p.purchase_price, 0);
  const totalArea = properties.reduce((s, p) => s + p.total_area_sqm, 0);

  const pieData = Object.entries(
    properties.reduce((acc, p) => {
      const key = propertyTypeLabel(p.property_type);
      acc[key] = (acc[key] || 0) + p.purchase_price;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const cityData = Object.entries(
    properties.reduce((acc, p) => {
      acc[p.city] = (acc[p.city] || 0) + p.purchase_price;
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([city, value]) => ({ city, value }));

  return (
    <div>
      <TopBar
        title="Portfolio"
        subtitle={`${properties.length} Objekte · ${formatEur(totalValue)} Gesamtwert`}
        actions={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-apple-gray-2 rounded-apple p-0.5">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${view === 'list' ? 'bg-white shadow-sm text-apple-blue font-medium' : 'text-apple-text-secondary'}`}
              >
                <List size={13} /> Liste
              </button>
              <button
                onClick={() => setView('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${view === 'map' ? 'bg-white shadow-sm text-apple-blue font-medium' : 'text-apple-text-secondary'}`}
              >
                <Map size={13} /> Karte
              </button>
            </div>
            <button onClick={() => navigate('/upload')} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> Objekt hinzufügen
            </button>
          </div>
        }
      />

      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-apple-gray-3 border-t-apple-blue rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* KPI row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Objekte', value: properties.length },
                { label: 'Gesamtfläche', value: formatSqm(totalArea) },
                { label: 'Portfoliowert', value: formatEur(totalValue) },
                { label: 'Ø Objektgröße', value: properties.length > 0 ? formatSqm(totalArea / properties.length) : '–' },
              ].map(({ label, value }) => (
                <div key={label} className="card">
                  <div className="text-xs text-apple-text-tertiary uppercase tracking-wide mb-1">{label}</div>
                  <div className="text-2xl font-semibold text-apple-text">{value}</div>
                </div>
              ))}
            </div>

            {view === 'map' ? (
              /* ── MAP VIEW ── */
              <div>
                {properties.length === 0 ? (
                  <div className="card text-center py-12 text-apple-text-secondary text-sm">
                    Keine Objekte vorhanden.
                    <button onClick={() => navigate('/upload')} className="btn-primary ml-3 text-xs">Objekt hochladen</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {properties.slice(0, 9).map(p => (
                      <div key={p.id} className="cursor-pointer" onClick={() => navigate(`/property/${p.id}`)}>
                        <PropertyMapCard property={p} />
                      </div>
                    ))}
                  </div>
                )}
                {properties.length > 9 && (
                  <p className="text-xs text-apple-text-tertiary text-center mt-3">
                    {properties.length - 9} weitere Objekte – zur Liste wechseln für vollständige Übersicht.
                  </p>
                )}
              </div>
            ) : (
              /* ── LIST VIEW ── */
              <>
                <div className="grid grid-cols-2 gap-6">
                  <div className="card">
                    <h3 className="font-semibold text-apple-text mb-4">Nutzungsarten (nach Wert)</h3>
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" label={false} labelLine={false}>
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={Object.values(TYPE_COLORS)[i % 5]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: unknown) => formatEur(Number(v))} contentStyle={{ background: 'white', border: '1px solid #E8E8ED', borderRadius: 8, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <div className="h-40 flex items-center justify-center text-apple-text-tertiary text-sm">Keine Daten</div>}
                  </div>

                  <div className="card">
                    <h3 className="font-semibold text-apple-text mb-4">Portfolio nach Stadt</h3>
                    {cityData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={cityData} layout="vertical" barSize={18}>
                          <XAxis type="number" tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="city" tick={{ fontSize: 11, fill: '#6E6E73' }} axisLine={false} tickLine={false} width={70} />
                          <Tooltip formatter={(v: unknown) => formatEur(Number(v))} contentStyle={{ background: 'white', border: '1px solid #E8E8ED', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#F5F5F7' }} />
                          <Bar dataKey="value" fill="#0066CC" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="h-40 flex items-center justify-center text-apple-text-tertiary text-sm">Keine Daten</div>}
                  </div>
                </div>

                <div className="card overflow-x-auto">
                  <h3 className="font-semibold text-apple-text mb-4">Alle Objekte</h3>
                  {properties.length === 0 ? (
                    <div className="text-center py-12 text-apple-text-secondary text-sm">
                      Keine Objekte vorhanden.
                      <button onClick={() => navigate('/upload')} className="btn-primary ml-3 text-xs">Objekt hochladen</button>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-apple-text-tertiary uppercase tracking-wide border-b border-apple-gray-2">
                          {['Objekt', 'Ort', 'Typ', 'Fläche', 'Einheiten', 'Kaufpreis', 'Baujahr', ''].map(h => (
                            <th key={h} className="pb-3 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {properties.map(p => {
                          const addr = [p.address, p.zip_code, p.city].filter(Boolean).join(', ');
                          const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(addr || p.city)}`;
                          return (
                            <tr key={p.id} className="border-b border-apple-gray-2 last:border-0 hover:bg-apple-gray cursor-pointer group" onClick={() => navigate(`/property/${p.id}`)}>
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[p.property_type] || '#6E6E73' }}>
                                    {p.name.charAt(0)}
                                  </div>
                                  <span className="font-medium text-apple-text">{p.name}</span>
                                </div>
                              </td>
                              <td className="py-3 text-apple-text-secondary">
                                <div className="flex items-center gap-1.5">
                                  {p.city}
                                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-apple-text-tertiary hover:text-apple-blue transition-colors">
                                    <MapPin size={11} />
                                  </a>
                                </div>
                              </td>
                              <td className="py-3"><span className="badge badge-blue">{propertyTypeLabel(p.property_type)}</span></td>
                              <td className="py-3 text-apple-text-secondary">{formatSqm(p.total_area_sqm)}</td>
                              <td className="py-3 text-apple-text-secondary">{p.units}</td>
                              <td className="py-3 font-medium text-apple-text">{formatEur(p.purchase_price)}</td>
                              <td className="py-3 text-apple-text-secondary">{p.construction_year}</td>
                              <td className="py-3"><ArrowRight size={14} className="text-apple-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
