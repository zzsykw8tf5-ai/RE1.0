import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, TrendingUp, Euro, Users, Plus, ArrowRight, BarChart3, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import TopBar from '../components/Layout/TopBar';
import StatCard from '../components/ui/StatCard';
import { getProperties } from '../services/api';
import type { Property } from '../types';
import { formatEur, formatSqm, propertyTypeLabel } from '../utils/format';

const TYPE_COLORS: Record<string, string> = {
  RESIDENTIAL: '#34C759',
  OFFICE: '#0066CC',
  RETAIL: '#FF9500',
  INDUSTRIAL: '#6E6E73',
  MIXED: '#AF52DE',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProperties().then(d => { setProperties(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const totalValue = properties.reduce((s, p) => s + (p.purchase_price || 0), 0);
  const totalArea = properties.reduce((s, p) => s + (p.total_area_sqm || 0), 0);
  const totalUnits = properties.reduce((s, p) => s + (p.units || 0), 0);
  const avgPricePerSqm = totalArea > 0 ? totalValue / totalArea : 0;

  const typeData = Object.entries(
    properties.reduce((acc, p) => {
      acc[p.property_type] = (acc[p.property_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, count]) => ({ type: propertyTypeLabel(type), count, key: type }));

  return (
    <div>
      <TopBar
        title="Portfolio Dashboard"
        subtitle={`${properties.length} ${properties.length === 1 ? 'Objekt' : 'Objekte'} im Portfolio`}
        actions={
          <button onClick={() => navigate('/upload')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} />
            Objekt hinzufügen
          </button>
        }
      />

      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-apple-gray-3 border-t-apple-blue rounded-full animate-spin" />
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-apple-gray-2 rounded-apple-xl flex items-center justify-center mb-5">
              <Building2 size={32} className="text-apple-text-tertiary" />
            </div>
            <h2 className="text-xl font-semibold text-apple-text mb-2">Noch keine Objekte</h2>
            <p className="text-sm text-apple-text-secondary max-w-sm mb-6">
              Laden Sie Ihr erstes Immobilienobjekt hoch, um die Analyse zu starten.
            </p>
            <button onClick={() => navigate('/upload')} className="btn-primary flex items-center gap-2">
              <Plus size={15} />
              Erstes Objekt hochladen
            </button>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <StatCard label="Portfolio-Wert" value={formatEur(totalValue, 0)} icon={Euro} iconColor="text-apple-blue" />
              <StatCard label="Gesamtfläche" value={formatSqm(totalArea)} icon={Building2} iconColor="text-apple-green" />
              <StatCard label="Einheiten" value={totalUnits} icon={Users} iconColor="text-apple-orange" />
              <StatCard label="Ø €/m²" value={formatEur(avgPricePerSqm, 0)} icon={TrendingUp} iconColor="text-apple-purple" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <div className="md:col-span-2 card">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-semibold text-apple-text">Objekte</h2>
                  <button onClick={() => navigate('/portfolio')} className="btn-ghost text-xs flex items-center gap-1">
                    Alle anzeigen <ArrowRight size={12} />
                  </button>
                </div>
                <div className="space-y-2">
                  {properties.slice(0, 6).map(p => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/property/${p.id}`)}
                      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-apple-gray transition-all group text-left"
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[p.property_type] || '#6E6E73' }}
                      >
                        {p.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-apple-text truncate">{p.name}</div>
                        <div className="text-xs text-apple-text-secondary">{p.address}, {p.city}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-medium text-apple-text">{formatEur(p.purchase_price)}</div>
                        <div className="text-xs text-apple-text-secondary">{formatSqm(p.total_area_sqm)}</div>
                      </div>
                      <ArrowRight size={14} className="text-apple-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="card">
                  <div className="text-sm font-semibold text-apple-text mb-4 flex items-center gap-2">
                    <BarChart3 size={15} className="text-apple-blue" />
                    Nutzungsarten
                  </div>
                  {typeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={typeData} barSize={24}>
                        <XAxis dataKey="type" tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip contentStyle={{ background: 'white', border: '1px solid #E8E8ED', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#F5F5F7' }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {typeData.map(entry => (
                            <Cell key={entry.key} fill={TYPE_COLORS[entry.key] || '#6E6E73'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-xs text-apple-text-tertiary">Keine Daten</div>
                  )}
                </div>

                <div className="card bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                  <div className="flex items-start justify-between mb-3">
                    <AlertTriangle size={18} className="text-blue-200" />
                    <span className="text-xs font-medium text-blue-200 bg-white/10 px-2 py-0.5 rounded-full">Risk Score</span>
                  </div>
                  <div className="text-3xl font-bold mb-1">–</div>
                  <div className="text-xs text-blue-200">Analysieren Sie ein Objekt, um den Portfolio-Risikoscore zu sehen</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
