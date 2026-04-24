import React, { createContext, useContext, useState, ReactNode } from 'react';

type ImportType = 'students' | 'teachers' | 'classes' | 'subjects';

interface ImportStatus {
  isProcessing: boolean;
  progress: number;
  type: ImportType | null;
  total: number;
  imported: number;
  error: string;
}

interface ImportContextType {
  status: ImportStatus;
  startImport: (type: ImportType, total: number) => void;
  updateProgress: (imported: number, progress: number) => void;
  setError: (error: string) => void;
  finishImport: () => void;
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
    error: '',
  });

  const startImport = (type: ImportType, total: number) => {
    setStatus({
      isProcessing: true,
      progress: 0,
      type,
      total,
      imported: 0,
      error: '',
    });
  };

  const updateProgress = (imported: number, progress: number) => {
    setStatus(prev => ({ ...prev, imported, progress }));
  };

  const setError = (error: string) => {
    setStatus(prev => ({ ...prev, error }));
  };

  const finishImport = () => {
    setStatus(prev => ({ ...prev, progress: 100, isProcessing: false }));
  };

  const resetImport = () => {
    setStatus({
      isProcessing: false,
      progress: 0,
      type: null,
      total: 0,
      imported: 0,
      error: '',
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
