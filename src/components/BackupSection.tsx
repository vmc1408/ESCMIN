import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileJson, 
  Sliders, 
  RefreshCw, 
  Check, 
  FileArchive, 
  AlertTriangle, 
  Lock,
  Layers,
  Search,
  FileCheck,
  RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchAll, saveBatch } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';

// Tipos de Backup
type BackupType = 'geral' | 'detalhado';

interface CollectionMeta {
  id: string;
  label: string;
  category: 'Administrativo' | 'Acadêmico' | 'Financeiro' | 'Diocese' | 'Segurança' | 'Arquivo Morto';
}

const COLLECTIONS: CollectionMeta[] = [
  { id: 'institution_settings', label: 'Configurações da Instituição', category: 'Administrativo' },
  { id: 'users', label: 'Usuários do Sistema', category: 'Segurança' },
  { id: 'email_registry', label: 'Pré-Autorização de Emails', category: 'Segurança' },
  { id: 'foraries', label: 'Foranias', category: 'Diocese' },
  { id: 'parishes', label: 'Paróquias', category: 'Diocese' },
  { id: 'clergy_leity', label: 'Clero e Leigos', category: 'Diocese' },
  { id: 'subjects', label: 'Disciplinas', category: 'Acadêmico' },
  { id: 'teachers', label: 'Professores', category: 'Acadêmico' },
  { id: 'classes', label: 'Turmas', category: 'Acadêmico' },
  { id: 'students', label: 'Alunos', category: 'Acadêmico' },
  { id: 'attendances', label: 'Frequência (Chamadas)', category: 'Acadêmico' },
  { id: 'grades', label: 'Notas e Boletins', category: 'Acadêmico' },
  { id: 'assessments', label: 'Avaliações Cadastradas', category: 'Acadêmico' },
  { id: 'calendar_events', label: 'Eventos e Cronograma', category: 'Acadêmico' },
  { id: 'contributions', label: 'Contribuições Financeiras', category: 'Financeiro' },
  { id: 'pix_reconciliations', label: 'Reconciliações Pix', category: 'Financeiro' },
  { id: 'receipts', label: 'Recibos Emitidos', category: 'Financeiro' },
  { id: 'certificates', label: 'Certificados e Diplomas', category: 'Administrativo' },
  { id: 'archived_students', label: 'Alunos Desligados (Arquivo)', category: 'Arquivo Morto' },
  { id: 'archived_teachers', label: 'Professores Históricos (Arquivo)', category: 'Arquivo Morto' },
  { id: 'archived_classes', label: 'Turmas Encerradas (Arquivo)', category: 'Arquivo Morto' },
  { id: 'archived_subjects', label: 'Disciplinas Históricas (Arquivo)', category: 'Arquivo Morto' },
];

export function BackupSection() {
  const { isAdmin } = useAuth();
  
  // Estados de Configuração da Cópia
  const [backupType, setBackupType] = useState<BackupType>('geral');
  const [selectedTables, setSelectedTables] = useState<string[]>(COLLECTIONS.map(c => c.id));
  const [backupSearchTerm, setBackupSearchTerm] = useState('');
  
  // Progresso da Cópia
  const [isBackupRunning, setIsBackupRunning] = useState(false);
  const [backupProgress, setBackupProgress] = useState({
    percent: 0,
    currentStep: '',
    completedTablesCount: 0,
    totalTablesCount: 0,
    recordsProcessed: 0
  });

  // Progresso da Restauração
  const [isRestoreRunning, setIsRestoreRunning] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({
    percent: 0,
    currentStep: '',
    completedTablesCount: 0,
    totalTablesCount: 0,
    recordsRestored: 0
  });

  // Contagens e Arquivo
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [parsedRestoreFile, setParsedRestoreFile] = useState<any | null>(null);
  const [selectedRestoreTables, setSelectedRestoreTables] = useState<string[]>([]);
  const [restoreSearchTerm, setRestoreSearchTerm] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Carregar contagens iniciais
  useEffect(() => {
    fetchTableRecordsCounts();
  }, []);

  const fetchTableRecordsCounts = async () => {
    setLoadingCounts(true);
    const counts: Record<string, number> = {};
    try {
      await Promise.all(
        COLLECTIONS.map(async (col) => {
          try {
            const list = await fetchAll(col.id);
            counts[col.id] = list?.length || 0;
          } catch (e) {
            counts[col.id] = 0;
          }
        })
      );
      setTableCounts(counts);
    } catch (err) {
      console.error("Erro ao calcular contagem de registros:", err);
    } finally {
      setLoadingCounts(false);
    }
  };

  // Cálculo de totais para Backup
  const totalLiveRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
  const activeSelectedTables = backupType === 'geral' ? COLLECTIONS.map(c => c.id) : selectedTables;
  const selectedLiveRecords = activeSelectedTables.reduce((sum, tid) => sum + (tableCounts[tid] || 0), 0);

  // AÇÃO: INICIAR GERAÇÃO DE CÓPIA DE SEGURANÇA
  const handleRunBackup = async () => {
    if (isBackupRunning) return;

    const tablesToBackup = backupType === 'detalhado' ? selectedTables : COLLECTIONS.map(c => c.id);

    if (tablesToBackup.length === 0) {
      setNotification({ type: 'error', message: 'Selecione ao menos uma tabela para exportação.' });
      setTimeout(() => setNotification(null), 3500);
      return;
    }

    setIsBackupRunning(true);
    setBackupProgress({
      percent: 0,
      currentStep: 'Iniciando módulo de extração segura...',
      completedTablesCount: 0,
      totalTablesCount: tablesToBackup.length,
      recordsProcessed: 0
    });

    const backupPayload: Record<string, any[]> = {};
    let totalRecordsProcessed = 0;

    try {
      for (let i = 0; i < tablesToBackup.length; i++) {
        const tableId = tablesToBackup[i];
        const tableMeta = COLLECTIONS.find(c => c.id === tableId);
        
        setBackupProgress(prev => ({
          ...prev,
          currentStep: `Extraindo tabela [${i + 1}/${tablesToBackup.length}]: ${tableMeta?.label || tableId}...`,
          percent: Math.round(((i) / tablesToBackup.length) * 85),
          completedTablesCount: i
        }));

        await new Promise(resolve => setTimeout(resolve, 200));

        const records = await fetchAll(tableId);
        const finalRecords = records || [];
        
        if (finalRecords.length > 0) {
          backupPayload[tableId] = finalRecords;
          totalRecordsProcessed += finalRecords.length;
        }

        setBackupProgress(prev => ({
          ...prev,
          completedTablesCount: i + 1,
          percent: Math.round(((i + 1) / tablesToBackup.length) * 85),
          recordsProcessed: totalRecordsProcessed
        }));
      }

      setBackupProgress(prev => ({
        ...prev,
        currentStep: 'Formatando arquivo JSON e verificando integridade...',
        percent: 92
      }));
      await new Promise(resolve => setTimeout(resolve, 400));

      const backupFile = {
        app: "SISTEMA ACADEMICO ESCMIN - GESTÃO EDUCACIONAL",
        version: "3.2.0-secure",
        timestamp: new Date().toISOString(),
        backup_type: backupType,
        records_count: totalRecordsProcessed,
        tables_count: tablesToBackup.length,
        data: backupPayload
      };

      const jsonString = JSON.stringify(backupFile, null, 2);
      const typeLabel = backupType === 'geral' ? 'geral' : 'detalhado';
      const dateStr = new Date().toISOString().split('T')[0];
      const defaultFileName = `backup-${typeLabel}-${dateStr}.json`;

      setBackupProgress(prev => ({
        ...prev,
        currentStep: 'Gerando download do arquivo de cópia...',
        percent: 98
      }));
      await new Promise(resolve => setTimeout(resolve, 300));

      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = defaultFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setBackupProgress(prev => ({
        ...prev,
        currentStep: 'Cópia de segurança gerada e baixada com sucesso!',
        percent: 100
      }));

      setNotification({
        type: 'success',
        message: `Cópia de segurança gerada com sucesso! ${totalRecordsProcessed} registros salvos em ${tablesToBackup.length} tabelas.`
      });
      setTimeout(() => setNotification(null), 4000);

      fetchTableRecordsCounts();

    } catch (error: any) {
      console.error(error);
      setNotification({ type: 'error', message: `Falha na cópia de segurança: ${error.message || error}` });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsBackupRunning(false);
    }
  };

  // RESTAURAÇÃO: Drag & Drop Eventos
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setRestoreError(null);
    setParsedRestoreFile(null);
    setSelectedRestoreTables([]);

    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      setRestoreError("Apenas arquivos JSON de backup são aceitos pelo sistema.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed.app || !parsed.data || typeof parsed.data !== 'object') {
          setRestoreError("Arquivo inválido. O arquivo selecionado não é um arquivo de backup reconhecido pelo sistema.");
          return;
        }

        setParsedRestoreFile(parsed);
        setSelectedRestoreTables(Object.keys(parsed.data));
      } catch (e) {
        setRestoreError("Falha ao analisar arquivo de backup. Certifique-se de que o arquivo JSON não está corrompido.");
      }
    };
    reader.readAsText(file);
  };

  // AÇÃO: EXECUTAR RESTAURAÇÃO
  const handleRunRestore = async () => {
    if (!parsedRestoreFile || isRestoreRunning) return;

    const dataObj = parsedRestoreFile.data;
    const tablesToRestore = Object.keys(dataObj).filter(id => selectedRestoreTables.includes(id));

    if (tablesToRestore.length === 0) {
      setRestoreError("Nenhuma tabela foi selecionada para restauração.");
      return;
    }

    setIsRestoreRunning(true);
    setRestoreProgress({
      percent: 0,
      currentStep: 'Abrindo conexões seguras com o banco de dados...',
      completedTablesCount: 0,
      totalTablesCount: tablesToRestore.length,
      recordsRestored: 0
    });

    let totalRestored = 0;

    try {
      for (let i = 0; i < tablesToRestore.length; i++) {
        const tableId = tablesToRestore[i];
        const items = dataObj[tableId];
        const tableMeta = COLLECTIONS.find(c => c.id === tableId);
        const countInTable = Array.isArray(items) ? items.length : 0;

        setRestoreProgress(prev => ({
          ...prev,
          currentStep: `Restaurando [${i + 1}/${tablesToRestore.length}]: ${tableMeta?.label || tableId} (${countInTable} reg)...`,
          percent: Math.round(((i) / tablesToRestore.length) * 90),
          completedTablesCount: i
        }));

        await new Promise(resolve => setTimeout(resolve, 350));

        if (Array.isArray(items) && items.length > 0) {
          await saveBatch(tableId, items);
          totalRestored += items.length;
        }

        setRestoreProgress(prev => ({
          ...prev,
          completedTablesCount: i + 1,
          percent: Math.round(((i + 1) / tablesToRestore.length) * 90),
          recordsRestored: totalRestored
        }));
      }

      setRestoreProgress({
        percent: 100,
        currentStep: 'Restauração concluída com sucesso! Atualizando cache...',
        completedTablesCount: tablesToRestore.length,
        totalTablesCount: tablesToRestore.length,
        recordsRestored: totalRestored
      });

      setNotification({
        type: 'success',
        message: `Cópia restaurada com sucesso! ${totalRestored} registros importados em ${tablesToRestore.length} tabelas.`
      });

      setParsedRestoreFile(null);
      setSelectedRestoreTables([]);
      fetchTableRecordsCounts();

      setTimeout(() => {
        window.location.reload();
      }, 2500);

    } catch (e: any) {
      console.error(e);
      setRestoreError(`Erro durante restauração: ${e.message || e}`);
      setNotification({ type: 'error', message: 'Houve uma falha na restauração do backup.' });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsRestoreRunning(false);
    }
  };

  const toggleSelectTable = (id: string) => {
    if (selectedTables.includes(id)) {
      setSelectedTables(prev => prev.filter(t => t !== id));
    } else {
      setSelectedTables(prev => [...prev, id]);
    }
  };

  const filteredCollections = COLLECTIONS.filter(c => 
    c.label.toLowerCase().includes(backupSearchTerm.toLowerCase()) ||
    c.category.toLowerCase().includes(backupSearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Toast Notification */}
      {notification && (
        <div className={cn(
          "p-4 border font-bold text-xs flex items-center justify-between shadow-md animate-in slide-in-from-top-2 duration-200",
          notification.type === 'success' ? "bg-emerald-50 text-emerald-900 border-emerald-300" : "bg-red-50 text-red-900 border-red-300"
        )}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <AlertCircle size={18} className="text-red-600 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs uppercase hover:underline opacity-80 cursor-pointer">
            Fechar
          </button>
        </div>
      )}

      {/* Grid 50% / 50% Lado a Lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* ========================================================
            COLUNA 1 (50%): CRIAR NOVA CÓPIA DE SEGURANÇA
        ======================================================== */}
        <div className="bg-white border border-slate-300 shadow-sm flex flex-col h-full">
          
          {/* Header da Cópia */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200">
                <Database size={20} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-tight">Criar Nova Cópia de Segurança</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Selecione o tipo e gere o arquivo (.json)</p>
              </div>
            </div>
            <button
              onClick={fetchTableRecordsCounts}
              disabled={loadingCounts || isBackupRunning}
              className="px-2.5 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
              title="Atualizar contagem de registros"
            >
              <RefreshCw size={12} className={cn(loadingCounts && "animate-spin text-indigo-600")} />
              <span>Sincronizar</span>
            </button>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-5">
            
            <div className="space-y-4">
              
              {/* Seleção do Tipo de Cópia */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  Tipo de Cópia
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBackupType('geral')}
                    className={cn(
                      "p-3.5 border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 h-full",
                      backupType === 'geral' 
                        ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20" 
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-extrabold text-xs text-slate-900 uppercase">Geral / Completo</span>
                      {backupType === 'geral' && (
                        <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-snug">
                      Backup integral de todas as tabelas e dados do sistema.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBackupType('detalhado')}
                    className={cn(
                      "p-3.5 border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 h-full",
                      backupType === 'detalhado' 
                        ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20" 
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-extrabold text-xs text-slate-900 uppercase">Detalhado / Segmentado</span>
                      {backupType === 'detalhado' && (
                        <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-snug">
                      Escolha manualmente quais tabelas deseja copiar.
                    </p>
                  </button>
                </div>
              </div>

              {/* Quadro de Resumo de Dados Selecionados */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Volume de Dados Selecionado:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-indigo-900">
                      {selectedLiveRecords} registros
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">•</span>
                    <span className="text-xs font-bold text-slate-700">
                      {activeSelectedTables.length} de {COLLECTIONS.length} tabelas
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-1 bg-white border border-slate-300 text-[10px] font-bold text-slate-700 uppercase">
                    Total Banco: {totalLiveRecords} reg
                  </span>
                </div>
              </div>

              {/* Modo Detalhado: Seletor de Tabelas */}
              {backupType === 'detalhado' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-slate-800 text-xs font-bold uppercase">
                      <Sliders size={14} className="text-indigo-600" />
                      <span>Selecionar Tabelas do Backup</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTables(COLLECTIONS.map(c => c.id))}
                        className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 uppercase cursor-pointer"
                      >
                        Marcar Tudo
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedTables([])}
                        className="text-[10px] font-bold text-slate-600 hover:text-slate-900 uppercase cursor-pointer"
                      >
                        Zerar
                      </button>
                    </div>
                  </div>

                  {/* Campo de Busca Rápida de Tabelas */}
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={backupSearchTerm}
                      onChange={(e) => setBackupSearchTerm(e.target.value)}
                      placeholder="Filtrar tabela..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 text-slate-800 placeholder-slate-400 uppercase font-semibold"
                    />
                  </div>

                  {/* Lista com scroll visível de tabelas */}
                  <div className="bg-white border border-slate-300 max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {filteredCollections.map((col) => {
                      const count = tableCounts[col.id] ?? 0;
                      const isChecked = selectedTables.includes(col.id);
                      return (
                        <div 
                          key={col.id}
                          onClick={() => toggleSelectTable(col.id)}
                          className={cn(
                            "p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none",
                            isChecked ? "bg-indigo-50/30" : "opacity-70"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn(
                              "w-4 h-4 border flex items-center justify-center transition-all shrink-0",
                              isChecked ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 bg-white"
                            )}>
                              {isChecked && <Check size={11} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{col.label}</p>
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase">{col.category}</span>
                            </div>
                          </div>
                          <span className={cn(
                            "px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 border",
                            count > 0 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-50 text-slate-400 border-slate-200"
                          )}>
                            {count} reg
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modo Geral: Visualizador Rápido das Tabelas Incluídas */}
              {backupType === 'geral' && (
                <div className="border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-600 uppercase">
                    <span className="flex items-center gap-1.5">
                      <Layers size={13} className="text-indigo-600" />
                      Tabelas Inclusas na Cópia Completa
                    </span>
                    <span className="text-indigo-800 font-black">{COLLECTIONS.length} Tabelas</span>
                  </div>
                  <div className="bg-white border border-slate-200 max-h-40 overflow-y-auto p-2 divide-y divide-slate-100 text-xs">
                    {COLLECTIONS.map(col => (
                      <div key={col.id} className="py-1 flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-700 truncate">{col.label}</span>
                        <span className="text-[10px] font-bold text-slate-500 shrink-0 ml-2">
                          {tableCounts[col.id] ?? 0} reg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Ações e Progresso da Cópia */}
            <div className="space-y-3 pt-2">
              
              {/* Indicador de Progresso da Cópia */}
              {isBackupRunning && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                    <span className="flex items-center gap-2 truncate">
                      <Loader2 size={14} className="animate-spin text-indigo-600 shrink-0" />
                      {backupProgress.currentStep}
                    </span>
                    <span className="font-mono text-indigo-800 shrink-0 ml-2">{backupProgress.percent}%</span>
                  </div>
                  
                  {/* Barra de Progresso */}
                  <div className="h-2.5 bg-indigo-100 overflow-hidden border border-indigo-200">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-300" 
                      style={{ width: `${backupProgress.percent}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                    <span>Tabelas: {backupProgress.completedTablesCount} / {backupProgress.totalTablesCount}</span>
                    <span>{backupProgress.recordsProcessed} registros lidos</span>
                  </div>
                </div>
              )}

              {/* Botão de Disparo */}
              <button
                type="button"
                onClick={handleRunBackup}
                disabled={isBackupRunning}
                className="w-full py-3.5 bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isBackupRunning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processando Cópia ({backupProgress.percent}%)...</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>Iniciar Geração de Cópia de Segurança</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>

        {/* ========================================================
            COLUNA 2 (50%): RESTAURAR BACKUP (.JSON)
        ======================================================== */}
        <div className="bg-white border border-slate-300 shadow-sm flex flex-col h-full">
          
          {/* Header da Restauração */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                <Upload size={20} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-tight">Restaurar Backup (.json)</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Importação e Reconciliação de Dados</p>
              </div>
            </div>
            {parsedRestoreFile && (
              <button
                type="button"
                onClick={() => {
                  setParsedRestoreFile(null);
                  setSelectedRestoreTables([]);
                  setRestoreError(null);
                }}
                className="px-2.5 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                title="Trocar Arquivo de Backup"
              >
                <RotateCcw size={12} />
                <span>Trocar</span>
              </button>
            )}
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-5">
            
            {isAdmin ? (
              <>
                <div className="space-y-4">
                  
                  {/* Dropzone de Arquivo quando nenhum arquivo está carregado */}
                  {!parsedRestoreFile ? (
                    <div 
                      className={cn(
                        "border-2 border-dashed p-8 text-center transition-all cursor-pointer select-none space-y-3 bg-slate-50/50",
                        dragActive ? "border-emerald-600 bg-emerald-50/40" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                      )}
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('restore-file-input')?.click()}
                    >
                      <input 
                        type="file" 
                        id="restore-file-input"
                        className="hidden" 
                        accept=".json"
                        onChange={handleFileChange}
                      />
                      <div className="w-14 h-14 bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-400 shadow-2xs">
                        <FileJson size={28} className="text-emerald-700" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">Solte o arquivo de backup aqui</p>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">ou clique para selecionar um arquivo .JSON no computador</p>
                      </div>
                      <span className="inline-block px-3 py-1 bg-white border border-slate-200 text-[10px] font-extrabold text-slate-600 uppercase">
                        Formato .JSON Seguro
                      </span>
                    </div>
                  ) : (
                    /* Conteúdo e Configuração do Arquivo Carregado */
                    <div className="space-y-3.5 animate-in fade-in duration-200">
                      
                      {/* Header do Arquivo Carregado */}
                      <div className="p-3 bg-emerald-50/80 border border-emerald-200 flex items-start gap-3">
                        <div className="w-9 h-9 bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-300">
                          <FileArchive size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Cópia de Segurança Carregada</p>
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase border border-emerald-200">
                              {parsedRestoreFile.backup_type?.toUpperCase() || 'COMPLETO'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-600 font-bold mt-0.5">
                            Realizado em: {new Date(parsedRestoreFile.timestamp).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      {/* Quadro com Totalizadores de Registros para Restauro */}
                      <div className="p-3.5 bg-slate-50 border border-slate-200 space-y-1">
                        <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">
                          Registros Selecionados para Restauro:
                        </span>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-emerald-900 font-black text-xs">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            <span>
                              {
                                Object.keys(parsedRestoreFile.data)
                                  .filter(t => selectedRestoreTables.includes(t))
                                  .reduce((sum, t) => sum + (Array.isArray(parsedRestoreFile.data[t]) ? parsedRestoreFile.data[t].length : 0), 0)
                              } de {parsedRestoreFile.records_count || 0} registros
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-600 uppercase">
                            {selectedRestoreTables.length} de {Object.keys(parsedRestoreFile.data).length} tabelas
                          </span>
                        </div>
                      </div>

                      {/* Lista de Seleção de Tabelas do Backup */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                            Tabelas no Backup
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedRestoreTables(Object.keys(parsedRestoreFile.data))}
                              className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 uppercase cursor-pointer"
                            >
                              Marcar Tudo
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedRestoreTables([])}
                              className="text-[10px] font-bold text-slate-600 hover:text-slate-900 uppercase cursor-pointer"
                            >
                              Zerar
                            </button>
                          </div>
                        </div>

                        {/* Busca em Tabelas da Restauração */}
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={restoreSearchTerm}
                            onChange={(e) => setRestoreSearchTerm(e.target.value)}
                            placeholder="Filtrar tabela no backup..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 text-slate-800 placeholder-slate-400 uppercase font-semibold"
                          />
                        </div>

                        {/* Container de Tabelas com Scroll */}
                        <div className="bg-white border border-slate-300 max-h-52 overflow-y-auto divide-y divide-slate-100">
                          {Object.keys(parsedRestoreFile.data)
                            .filter(tableId => {
                              const tableMeta = COLLECTIONS.find(c => c.id === tableId);
                              const label = tableMeta?.label || tableId;
                              return label.toLowerCase().includes(restoreSearchTerm.toLowerCase());
                            })
                            .map((tableId) => {
                              const items = parsedRestoreFile.data[tableId];
                              const count = Array.isArray(items) ? items.length : 0;
                              const tableMeta = COLLECTIONS.find(c => c.id === tableId);
                              const isChecked = selectedRestoreTables.includes(tableId);

                              return (
                                <div 
                                  key={tableId}
                                  onClick={() => {
                                    if (isChecked) {
                                      setSelectedRestoreTables(prev => prev.filter(id => id !== tableId));
                                    } else {
                                      setSelectedRestoreTables(prev => [...prev, tableId]);
                                    }
                                  }}
                                  className={cn(
                                    "p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none",
                                    isChecked ? "bg-emerald-50/40" : "opacity-60"
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={cn(
                                      "w-4 h-4 border flex items-center justify-center transition-all shrink-0",
                                      isChecked ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white"
                                    )}>
                                      {isChecked && <Check size={11} strokeWidth={3} />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-800 truncate">
                                        {tableMeta?.label || tableId}
                                      </p>
                                      <span className="text-[9px] font-extrabold text-slate-400 uppercase block">
                                        {tableMeta?.category || 'Módulo Geral'}
                                      </span>
                                    </div>
                                  </div>
                                  <span className={cn(
                                    "px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 border",
                                    isChecked ? "bg-emerald-100 text-emerald-900 border-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200"
                                  )}>
                                    {count} reg
                                  </span>
                                </div>
                              );
                            })}
                        </div>

                      </div>

                      {/* Aviso de Segurança */}
                      <div className="p-3 bg-amber-50 border border-amber-200 flex items-start gap-2">
                        <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-900 font-medium leading-relaxed">
                          <strong>Aviso:</strong> A restauração irá substituir dados com o mesmo identificador (ID) único. Faça um backup prévio dos dados atuais se necessário.
                        </p>
                      </div>

                    </div>
                  )}

                  {/* Mensagem de Erro na Restauração */}
                  {restoreError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 flex items-start gap-2 text-xs">
                      <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
                      <p className="font-semibold">{restoreError}</p>
                    </div>
                  )}

                </div>

                {/* Ações e Progresso da Restauração */}
                <div className="space-y-3 pt-2">
                  
                  {/* Indicador de Progresso da Restauração */}
                  {isRestoreRunning && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 space-y-2.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                        <span className="flex items-center gap-2 truncate">
                          <Loader2 size={14} className="animate-spin text-emerald-700 shrink-0" />
                          {restoreProgress.currentStep}
                        </span>
                        <span className="font-mono text-emerald-900 shrink-0 ml-2">{restoreProgress.percent}%</span>
                      </div>
                      
                      {/* Barra de Progresso */}
                      <div className="h-2.5 bg-emerald-100 overflow-hidden border border-emerald-200">
                        <div 
                          className="h-full bg-emerald-600 transition-all duration-300" 
                          style={{ width: `${restoreProgress.percent}%` }}
                        />
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                        <span>Tabelas: {restoreProgress.completedTablesCount} / {restoreProgress.totalTablesCount}</span>
                        <span>{restoreProgress.recordsRestored} registros importados</span>
                      </div>
                    </div>
                  )}

                  {/* Botões de Ação */}
                  {parsedRestoreFile && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleRunRestore}
                        disabled={isRestoreRunning || selectedRestoreTables.length === 0}
                        className="flex-1 py-3.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {isRestoreRunning ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Restaurando Dados ({restoreProgress.percent}%)...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw size={16} />
                            <span>Executar Restauração</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isRestoreRunning}
                        onClick={() => {
                          setParsedRestoreFile(null);
                          setSelectedRestoreTables([]);
                        }}
                        className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                </div>
              </>
            ) : (
              /* Caso o usuário não seja Admin */
              <div className="bg-slate-50 border border-slate-200 p-8 text-center space-y-4 my-auto">
                <div className="w-12 h-12 bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                  <Lock size={22} />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">
                    Restauração de Backup Bloqueada
                  </h4>
                  <p className="text-[10px] text-amber-700 font-bold uppercase tracking-widest">
                    Acesso Restrito a Administradores
                  </p>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium max-w-sm mx-auto">
                  Por motivos de integridade e segurança dos dados, a restauração de arquivos (.JSON) está restrita ao perfil de Administrador.
                </p>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
