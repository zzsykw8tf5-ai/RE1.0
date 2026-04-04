import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getProperties } from '../services/api';
import type { Property } from '../types';
import { formatEur, formatSqm, propertyTypeLabel } from '../utils/format';
import TopBar from '../components/Layout/TopBar';
import { ArrowRight, Plus, Map, List, MapPin } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';

// Fix default leaflet marker icon (broken with bundlers)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

interface GeoProperty extends Property {
  lat?: number;
  lng?: number;
}

const TYPE_COLORS: Record<string, string> = {
  RESIDENTIAL: '#34C759',
  OFFICE: '#0066CC',
  RETAIL: '#FF9500',
  INDUSTRIAL: '#6E6E73',
  MIXED: '#AF52DE',
};


const ALL_TYPES = ['RESIDENTIAL', 'OFFICE', 'RETAIL', 'INDUSTRIAL', 'MIXED'] as const;

async function geocodeProperty(p: Property): Promise<GeoProperty> {
  const query = [p.address, p.zip_code, p.city].filter(Boolean).join(', ');
  if (!query) return p;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'de' } }
    );
    const data = await res.json();
    if (data[0]) return { ...p, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* ignore geocoding errors */ }
  return p;
}

export default function PortfolioPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<GeoProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    getProperties().then(d => { setProperties(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Geocode when switching to map view
  useEffect(() => {
    if (view !== 'map' || geocoding) return;
    const needsGeo = properties.filter(p => p.lat == null && (p.address || p.city));
    if (needsGeo.length === 0) return;
    setGeocoding(true);
    Promise.all(needsGeo.map(geocodeProperty)).then(results => {
      setProperties(prev => prev.map(p => {
        const geo = results.find(r => r.id === p.id);
        return geo ? geo : p;
      }));
      setGeocoding(false);
    });
  }, [view, properties, geocoding]);

  const filtered = typeFilter === 'ALL' ? properties : properties.filter(p => p.property_type === typeFilter);
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
              <div className="space-y-4">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-apple-text-secondary font-medium">Filter:</span>
                  {['ALL', ...ALL_TYPES].map(t => {
                    const color = t === 'ALL' ? '#6E6E73' : TYPE_COLORS[t];
                    const active = typeFilter === t;
                    return (
                      <button key={t} onClick={() => setTypeFilter(t)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'text-white border-transparent' : 'bg-white text-apple-text-secondary border-apple-gray-3 hover:border-apple-blue'}`}
                        style={active ? { backgroundColor: color, borderColor: color } : {}}
                      >
                        {t === 'ALL' ? `Alle (${properties.length})` : `${propertyTypeLabel(t)} (${properties.filter(p => p.property_type === t).length})`}
                      </button>
                    );
                  })}
                  {geocoding && <span className="text-xs text-apple-text-tertiary ml-2">Adressen werden geocodiert…</span>}
                </div>

                {properties.length === 0 ? (
                  <div className="card text-center py-12 text-apple-text-secondary text-sm">
                    Keine Objekte vorhanden.
                    <button onClick={() => navigate('/upload')} className="btn-primary ml-3 text-xs">Objekt hochladen</button>
                  </div>
                ) : (
                  <div className="card p-0 overflow-hidden" style={{ height: 520 }}>
                    <MapContainer
                      center={[51.1657, 10.4515]}
                      zoom={6}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {filtered.filter(p => p.lat != null && p.lng != null).map(p => {
                        const icon = L.divIcon({
                          className: '',
                          html: `<div style="background:${TYPE_COLORS[p.property_type] || '#6E6E73'};width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
                          iconSize: [28, 28],
                          iconAnchor: [14, 28],
                          popupAnchor: [0, -30],
                        });
                        return (
                          <Marker key={p.id} position={[p.lat!, p.lng!]} icon={icon}>
                            <Popup>
                              <div style={{ minWidth: 180 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
                                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{[p.address, p.city].filter(Boolean).join(', ')}</div>
                                <div style={{ fontSize: 11, marginBottom: 6 }}>
                                  <span style={{ background: TYPE_COLORS[p.property_type], color: 'white', padding: '1px 6px', borderRadius: 4 }}>{propertyTypeLabel(p.property_type)}</span>
                                  {p.purchase_price ? <span style={{ marginLeft: 6, fontWeight: 600 }}>{formatEur(p.purchase_price)}</span> : null}
                                </div>
                                {p.total_area_sqm ? <div style={{ fontSize: 11, color: '#666' }}>Fläche: {formatSqm(p.total_area_sqm)}</div> : null}
                                <button
                                  onClick={() => navigate(`/property/${p.id}`)}
                                  style={{ marginTop: 8, fontSize: 11, color: '#0066CC', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                                >
                                  Objekt öffnen →
                                </button>
                              </div>
                            </Popup>
                          </Marker>
                        );
                      })}
                    </MapContainer>
                  </div>
                )}
                {filtered.filter(p => p.lat == null).length > 0 && (
                  <p className="text-xs text-apple-text-tertiary">
                    {filtered.filter(p => p.lat == null).length} Objekte konnten nicht geocodiert werden (fehlende Adresse).
                  </p>
                )}
              </div>
            ) : (
              /* ── LIST VIEW ── */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-apple-text">Alle Objekte</h3>
                    <div className="flex gap-1">
                      {['ALL', ...ALL_TYPES].map(t => {
                        const cnt = t === 'ALL' ? properties.length : properties.filter(p => p.property_type === t).length;
                        if (cnt === 0 && t !== 'ALL') return null;
                        return (
                          <button key={t} onClick={() => setTypeFilter(t)}
                            className={`px-2.5 py-1 rounded-full text-xs transition-all ${typeFilter === t ? 'bg-apple-blue text-white' : 'bg-apple-gray-2 text-apple-text-secondary hover:bg-apple-gray-3'}`}>
                            {t === 'ALL' ? `Alle` : propertyTypeLabel(t)} ({cnt})
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
                        {filtered.map(p => {
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
