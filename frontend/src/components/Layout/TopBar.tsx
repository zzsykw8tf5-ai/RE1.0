import { Bell } from 'lucide-react';

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header className="bg-white border-b border-apple-gray-2 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-semibold text-apple-text">{title}</h1>
        {subtitle && <p className="text-sm text-apple-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-apple-gray transition-colors">
          <Bell size={16} className="text-apple-text-secondary" />
        </button>
      </div>
    </header>
  );
}
