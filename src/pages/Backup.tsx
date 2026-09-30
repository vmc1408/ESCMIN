import React from 'react';
import { Database } from 'lucide-react';
import { BackupSection } from '../components/BackupSection';
import { PageHeader } from '../components/PageHeader';

export function BackupPage() {
  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Backup & Restauração"
        description="Cópias de Segurança, Restauração Seletiva e Sincronização de Dados"
        icon={Database}
      />

      <BackupSection />
    </div>
  );
}

