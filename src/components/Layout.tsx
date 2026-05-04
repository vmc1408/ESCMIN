import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Fechar sidebar ao mudar de rota no mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Prevenir scroll quando sidebar aberto no mobile
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isSidebarOpen]);

  return (
    <div className="min-h-screen bg-[#faf8ff] flex overflow-hidden">
      {/* Botão de Menu Mobile */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#00174b] text-white rounded-lg shadow-lg active:scale-90 transition-transform"
      >
        <Menu size={20} />
      </button>

      {/* Overlay para fechar no Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar com classes responsivas */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 lg:relative lg:block transition-transform duration-300 ease-in-out",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-2 md:p-4 lg:p-4 custom-scrollbar">
          <div className="max-w-[2400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
