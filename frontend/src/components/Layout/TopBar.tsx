import { Menu } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  const { open } = useSidebar();

  return (
    <header className="bg-white border-b border-apple-gray-2 px-4 md:px-8 py-3 md:py-4 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger – mobile only */}
        <button
          onClick={open}
          className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-apple-gray text-apple-text-secondary flex-shrink-0"
          aria-label="Menü öffnen"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-base md:text-lg font-semibold text-apple-text truncate">{title}</h1>
          {subtitle && <p className="text-xs md:text-sm text-apple-text-secondary mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
