import React from 'react';
import { Database } from 'lucide-react';
import { BackupSection } from '../components/BackupSection';
import { PageHeader } from '../components/PageHeader';

export function BackupPage() {
  return (
    <div className="w-full space-y-3 sm:space-y-3.5 pb-6">
      <PageHeader
        title="Backup & Restauração"
        description="Cópias de Segurança, Restauração Seletiva e Sincronização de Dados"
        icon={Database}
      />

      <BackupSection />
    </div>
  );
}

