import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { getProperties } from '../../services/api';
import type { Property } from '../../types';

export default function Layout() {
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    getProperties()
      .then(setProperties)
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-apple-gray">
      <Sidebar properties={properties.map(p => ({ id: p.id, name: p.name, city: p.city }))} />
      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ properties, setProperties }} />
      </main>
    </div>
  );
}
