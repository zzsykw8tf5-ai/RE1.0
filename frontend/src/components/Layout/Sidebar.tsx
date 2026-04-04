import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Upload, Building2, BarChart3,
  ChevronRight, TrendingUp,
} from 'lucide-react';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Objekt hochladen' },
  { to: '/portfolio', icon: BarChart3, label: 'Portfolio' },
];

interface SidebarProps {
  properties?: { id: number; name: string; city: string }[];
}

export default function Sidebar({ properties = [] }: SidebarProps) {
  const navigate = useNavigate();

  return (
    <aside className="w-60 bg-white border-r border-apple-gray-2 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 border-b border-apple-gray-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-apple-blue to-blue-600 rounded-lg flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-apple-text">RE Analyst</div>
            <div className="text-[10px] text-apple-text-tertiary uppercase tracking-widest">Pro</div>
          </div>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3 pt-4 overflow-y-auto">
        <div className="space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-apple-blue text-white'
                    : 'text-apple-text-secondary hover:bg-apple-gray hover:text-apple-text'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>

        {/* Properties List */}
        {properties.length > 0 && (
          <div className="mt-6">
            <div className="px-3 mb-2">
              <span className="text-[10px] font-semibold text-apple-text-tertiary uppercase tracking-widest">
                Objekte ({properties.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {properties.map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/property/${p.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-apple-text-secondary hover:bg-apple-gray hover:text-apple-text transition-all group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-apple-blue flex-shrink-0" />
                    <span className="truncate text-xs">{p.name}</span>
                  </div>
                  <ChevronRight size={12} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-apple-gray-2 space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50">
          <TrendingUp size={14} className="text-apple-blue" />
          <div className="min-w-0">
            <div className="text-xs font-medium text-apple-text">Marktdaten</div>
            <div className="text-[10px] text-apple-text-tertiary">Live aktuell</div>
          </div>
        </div>
        <div className="px-3 py-1 text-[10px] text-apple-text-tertiary text-center select-none">
          v0.5.0 · 04.04.2026
        </div>
      </div>
    </aside>
  );
}
