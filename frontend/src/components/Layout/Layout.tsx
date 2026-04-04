import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import DemoBanner from '../ui/DemoBanner';
import { getProperties } from '../../services/api';
import type { Property } from '../../types';
import { SidebarContext } from '../../contexts/SidebarContext';

export default function Layout() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getProperties()
      .then(setProperties)
      .catch(() => {});
  }, []);

  return (
    <SidebarContext.Provider value={{ open: () => setSidebarOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-apple-gray">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          properties={properties.map(p => ({ id: p.id, name: p.name, city: p.city }))}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 overflow-y-auto min-w-0">
          <Outlet context={{ properties, setProperties }} />
        </main>
        <DemoBanner />
      </div>
    </SidebarContext.Provider>
  );
}
