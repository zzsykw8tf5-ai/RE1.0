import { createContext, useContext } from 'react';

interface SidebarContextType {
  open: () => void;
}

export const SidebarContext = createContext<SidebarContextType>({ open: () => {} });
export const useSidebar = () => useContext(SidebarContext);
