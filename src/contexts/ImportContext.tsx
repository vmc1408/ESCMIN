import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ImportType = 'students' | 'teachers' | 'classes' | 'subjects' | 'parishes' | 'foraries' | 'clergy_leity' | 'courses';

export interface ImportStatus {
  isProcessing: boolean;
  progress: number;
  type: ImportType | null;
  total: number;
  imported: number;
  currentStepText: string;
  currentItemName?: string;
  error: string;
  lastBatchId?: string;
}

interface ImportContextType {
  status: ImportStatus;
  startImport: (type: ImportType, total: number) => void;
  updateProgress: (imported: number, progress: number, stepText?: string, itemName?: string) => void;
  setError: (error: string) => void;
  finishImport: (batchId?: string) => void;
  resetImport: () => void;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ImportStatus>({
    isProcessing: false,
    progress: 0,
    type: null,
    total: 0,
    imported: 0,
    currentStepText: '',
    currentItemName: '',
    error: '',
    lastBatchId: undefined,
  });

  const startImport = (type: ImportType, total: number) => {
    setStatus({
      isProcessing: true,
      progress: 0,
      type,
      total,
      imported: 0,
      currentStepText: 'Iniciando validação dos registros...',
      currentItemName: '',
      error: '',
      lastBatchId: undefined,
    });
  };

  const updateProgress = (imported: number, progress: number, stepText?: string, itemName?: string) => {
    setStatus(prev => ({ 
      ...prev, 
      imported, 
      progress,
      currentStepText: stepText !== undefined ? stepText : prev.currentStepText,
      currentItemName: itemName !== undefined ? itemName : prev.currentItemName
    }));
  };

  const setError = (error: string) => {
    setStatus(prev => ({ ...prev, error, isProcessing: false }));
  };

  const finishImport = (batchId?: string) => {
    setStatus(prev => ({ 
      ...prev, 
      progress: 100, 
      isProcessing: false, 
      currentStepText: 'Importação concluída com sucesso!',
      lastBatchId: batchId || prev.lastBatchId
    }));
  };

  const resetImport = () => {
    setStatus({
      isProcessing: false,
      progress: 0,
      type: null,
      total: 0,
      imported: 0,
      currentStepText: '',
      currentItemName: '',
      error: '',
      lastBatchId: undefined,
    });
  };

  return (
    <ImportContext.Provider value={{ status, startImport, updateProgress, setError, finishImport, resetImport }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const context = useContext(ImportContext);
  if (context === undefined) {
    throw new Error('useImport must be used within an ImportProvider');
  }
  return context;
}
