import React from 'react';
import { Database } from 'lucide-react';
import { BackupSection } from '../components/BackupSection';

export function BackupPage() {
  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <Database className="text-indigo-600" size={26} />
            Backup & Restauração
          </h2>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            Cópias de Segurança, Restauração Seletiva e Sincronização de Dados
          </p>
        </div>
      </header>

      <BackupSection />
    </div>
  );
}
