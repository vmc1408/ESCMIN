import React from 'react';
import { Database } from 'lucide-react';
import { BackupSection } from '../components/BackupSection';

export function BackupPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <Database className="text-indigo-600 animate-pulse" size={26} />
            Central de Backup e Nuvem
          </h2>
          <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mt-1">
            Restauração, Cópias de Segurança e Sincronização de Dados do Sistema
          </p>
        </div>
      </header>

      <BackupSection />
    </div>
  );
}
