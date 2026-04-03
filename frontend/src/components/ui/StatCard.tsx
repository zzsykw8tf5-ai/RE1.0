import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  trend?: { value: number; label?: string };
  badge?: ReactNode;
}

export default function StatCard({ label, value, subtitle, icon: Icon, iconColor = 'text-apple-blue', trend, badge }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="stat-label">{label}</div>
          <div className="stat-value mt-1">{value}</div>
          {subtitle && <div className="text-xs text-apple-text-secondary mt-1">{subtitle}</div>}
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
              <span>{trend.value >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
              {trend.label && <span className="text-apple-text-tertiary font-normal">{trend.label}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon && (
            <div className="w-9 h-9 rounded-lg bg-apple-gray flex items-center justify-center">
              <Icon size={18} className={iconColor} />
            </div>
          )}
          {badge}
        </div>
      </div>
    </div>
  );
}
