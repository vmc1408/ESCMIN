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

  const [inst, setInst] = useState<any>(null);

  useEffect(() => {
    const loadInst = async () => {
      try {
        const { getInstitutionSettings } = await import('../lib/database');
        const data = await getInstitutionSettings();
        if (data) setInst(data);
      } catch (e) {
        console.error(e);
      }
    };
    loadInst();
  }, []);

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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar print:p-0">
          <div className="max-w-[1600px] mx-auto min-h-full flex flex-col">
            <div className="flex-1">
              <Outlet />
            </div>
            
            {/* Global Footer */}
            <footer className="mt-20 pt-8 border-t border-slate-200/50 pb-8 print:hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start opacity-60 hover:opacity-100 transition-opacity">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-2 border-b border-slate-200 w-fit pb-0.5">Endereço Institucional</p>
                  <p className="text-xs font-medium text-slate-600">{inst?.address || 'Av. Venus, 195 - Itapegica - Guarulhos/SP - Cep 07044-170'}</p>
                  <p className="text-xs font-medium text-slate-600">Tel: {inst?.phone || '(11) 2421-2935'} | Email: {inst?.email || 'email@email.com'}</p>
                </div>
                <div className="space-y-1.5 md:text-right">
                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-2 border-b border-slate-200 w-fit ml-auto pb-0.5">Atendimento Secretaria</p>
                  <p className="text-xs font-medium text-slate-600">De Quarta à Sexta-feira das 14h às 18h</p>
                  <p className="text-[10px] font-bold text-[#497cff] uppercase tracking-tighter mt-4">Sistema de Gestão Escolar - Diocese de Guarulhos</p>
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
