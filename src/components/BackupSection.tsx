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
  RotateCcw,
  ShieldCheck,
  FolderOpen,
  Settings2,
  X,
  HardDriveDownload
} from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchAll } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import {
  BACKUP_COLLECTIONS,
  GeneratedBackupResult,
  ParsedBackupValidation,
  RestoreMode,
  RestoreReport,
  generateBackupPackage,
  supportsNativeSavePicker,
  saveBackupWithNativePicker,
  triggerFallbackDownload,
  parseAndValidateBackupFile,
  executeParameterizedRestore
} from '../services/backupService';

type BackupType = 'geral' | 'detalhado';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupSection() {
  const { isAdmin, profile } = useAuth();

  // Estados de Configuração da Cópia
  const [backupType, setBackupType] = useState<BackupType>('geral');
  const [selectedTables, setSelectedTables] = useState<string[]>(BACKUP_COLLECTIONS.map(c => c.id));
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

  // Modal/Prompt "Onde Salvar o Arquivo Gerado"
  const [pendingSaveBackup, setPendingSaveBackup] = useState<GeneratedBackupResult | null>(null);
  const [saveFileNameInput, setSaveFileNameInput] = useState('');
  const [savePickerBlockedHint, setSavePickerBlockedHint] = useState<string | null>(null);
  const [isSavingFile, setIsSavingFile] = useState(false);

  // Estado e Parâmetros da Restauração
  const [isRestoreRunning, setIsRestoreRunning] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({
    percent: 0,
    currentStep: '',
    completedTablesCount: 0,
    totalTablesCount: 0,
    recordsRestored: 0
  });
  const [parsedValidation, setParsedValidation] = useState<ParsedBackupValidation | null>(null);
  const [selectedRestoreTables, setSelectedRestoreTables] = useState<string[]>([]);
  const [restoreSearchTerm, setRestoreSearchTerm] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Parâmetros configuráveis de Restauração
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace');
  const [clearEmptyTablesInReplace, setClearEmptyTablesInReplace] = useState(true);
  const [preserveCurrentAdmin, setPreserveCurrentAdmin] = useState(true);
  const [restoreSystemCaches, setRestoreSystemCaches] = useState(true);
  const [runPostRestoreIntegrity, setRunPostRestoreIntegrity] = useState(true);
  const [confirmReplaceChecked, setConfirmReplaceChecked] = useState(false);
  const [restoreReport, setRestoreReport] = useState<RestoreReport | null>(null);

  // Contagens e Notificações
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string; duration?: number } | null>(null);

  useEffect(() => {
    if (!notification) return;
    const ms = notification.duration ?? 6000;
    if (ms <= 0) return;
    const timer = setTimeout(() => setNotification(null), ms);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    fetchTableRecordsCounts();
  }, []);

  const showToast = (type: 'success' | 'error' | 'info', message: string, duration = 6000) => {
    setNotification({ type, message, duration });
  };

  const fetchTableRecordsCounts = async () => {
    setLoadingCounts(true);
    const counts: Record<string, number> = {};
    try {
      await Promise.all(
        BACKUP_COLLECTIONS.map(async (col) => {
          try {
            const list = await fetchAll(col.id, 'id', '');
            counts[col.id] = list?.length || 0;
          } catch {
            counts[col.id] = 0;
          }
        })
      );
      setTableCounts(counts);
    } catch (err) {
      console.error('Erro ao calcular contagem de registros:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  const totalLiveRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
  const activeSelectedTables =
    backupType === 'geral' ? BACKUP_COLLECTIONS.map(c => c.id) : selectedTables;
  const selectedLiveRecords = activeSelectedTables.reduce((sum, tid) => sum + (tableCounts[tid] || 0), 0);

  // AÇÃO: GERAR BACKUP E PERGUNTAR ONDE SALVAR
  const handleRunBackup = async () => {
    if (isBackupRunning) return;

    const tablesToBackup =
      backupType === 'detalhado' ? selectedTables : BACKUP_COLLECTIONS.map(c => c.id);

    if (tablesToBackup.length === 0) {
      showToast('error', 'Selecione ao menos uma tabela para exportação.');
      return;
    }

    setIsBackupRunning(true);
    setSavePickerBlockedHint(null);
    setBackupProgress({
      percent: 0,
      currentStep: 'Iniciando módulo de extração completa...',
      completedTablesCount: 0,
      totalTablesCount: tablesToBackup.length,
      recordsProcessed: 0
    });

    try {
      const result = await generateBackupPackage({
        backupType,
        selectedTables: tablesToBackup,
        generatedBy: profile?.email || profile?.name || 'Administrador',
        onProgress: setBackupProgress
      });

      setSaveFileNameInput(result.defaultFileName);
      setPendingSaveBackup(result);

      // Tenta abrir o seletor nativo "Salvar Como" caso o navegador ainda mantenha a ativação do clique;
      // se expirar devido ao tempo de consulta no banco ou se estiver em iframe, mantém o modal aberto perguntando onde salvar.
      if (supportsNativeSavePicker()) {
        const pickerAttempt = await saveBackupWithNativePicker(result.blob, result.defaultFileName);
        if (pickerAttempt.status === 'saved') {
          setPendingSaveBackup(null);
          showToast(
            'success',
            `Cópia de segurança salva em "${pickerAttempt.fileName}" (${result.manifest.records_count} registros em ${result.manifest.tables_count} tabelas).`
          );
        } else if (pickerAttempt.status === 'cancelled') {
          setSavePickerBlockedHint('Você cancelou a seleção de pasta. O arquivo continua pronto caso queira escolher outro local.');
        } else if (pickerAttempt.reason) {
          setSavePickerBlockedHint(
            'Clique em "Escolher Pasta e Salvar" abaixo para abrir a janela de seleção de diretório.'
          );
        }
      }

      fetchTableRecordsCounts();
    } catch (error: any) {
      console.error(error);
      showToast('error', `Falha ao gerar backup: ${error?.message || error}`);
    } finally {
      setIsBackupRunning(false);
    }
  };

  // AÇÃO NO MODAL: Escolher pasta via File System Access API (clique síncrono do usuário)
  const handleSaveUsingNativePicker = async () => {
    if (!pendingSaveBackup || isSavingFile) return;
    setIsSavingFile(true);
    try {
      const targetName = saveFileNameInput.trim() || pendingSaveBackup.defaultFileName;
      const res = await saveBackupWithNativePicker(pendingSaveBackup.blob, targetName);
      if (res.status === 'saved') {
        setPendingSaveBackup(null);
        setSavePickerBlockedHint(null);
        showToast(
          'success',
          `Backup salvo com sucesso em "${res.fileName}" (${pendingSaveBackup.manifest.records_count} registros).`
        );
      } else if (res.status === 'cancelled') {
        setSavePickerBlockedHint('Seleção de pasta cancelada. Escolha outro local ou use o download direto.');
      } else {
        // Fallback automático para download padrão caso o contexto (ex: iframe restrito) impeça showSaveFilePicker
        const downloadedName = triggerFallbackDownload(pendingSaveBackup.blob, targetName);
        setPendingSaveBackup(null);
        setSavePickerBlockedHint(null);
        showToast(
          'info',
          `O navegador bloqueou o seletor de pastas neste ambiente e iniciou o download direto de "${downloadedName}".`
        );
      }
    } finally {
      setIsSavingFile(false);
    }
  };

  // AÇÃO NO MODAL: Download Direto
  const handleSaveDirectDownload = () => {
    if (!pendingSaveBackup) return;
    const targetName = saveFileNameInput.trim() || pendingSaveBackup.defaultFileName;
    const finalName = triggerFallbackDownload(pendingSaveBackup.blob, targetName);
    setPendingSaveBackup(null);
    setSavePickerBlockedHint(null);
    showToast(
      'success',
      `Download de "${finalName}" iniciado (${pendingSaveBackup.manifest.records_count} registros em ${pendingSaveBackup.manifest.tables_count} tabelas).`
    );
  };

  // RESTAURAÇÃO: Drag & Drop / Arquivo
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
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
    setParsedValidation(null);
    setSelectedRestoreTables([]);
    setConfirmReplaceChecked(false);
    setRestoreReport(null);

    if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
      setRestoreError('Apenas arquivos .JSON de backup são aceitos pelo sistema.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const validation = await parseAndValidateBackupFile(text);
        setParsedValidation(validation);
        setSelectedRestoreTables(validation.availableTables);
      } catch (e: any) {
        setRestoreError(
          e?.message || 'Falha ao analisar o arquivo de backup. Certifique-se de que o JSON não está corrompido.'
        );
      }
    };
    reader.readAsText(file);
  };

  // Verifica dependências parciais em modo Substituição
  const dependencyWarnings: string[] = [];
  if (parsedValidation && restoreMode === 'replace') {
    const sel = new Set(selectedRestoreTables);
    if ((sel.has('enrollments') || sel.has('attendances') || sel.has('grades')) && !sel.has('students')) {
      dependencyWarnings.push('Tabelas dependentes selecionadas sem "Alunos". Recomenda-se incluir Alunos.');
    }
    if ((sel.has('enrollments') || sel.has('attendances') || sel.has('grades')) && !sel.has('classes')) {
      dependencyWarnings.push('Tabelas dependentes selecionadas sem "Turmas". Recomenda-se incluir Turmas.');
    }
    if (sel.has('parishes') && !sel.has('foraries')) {
      dependencyWarnings.push('"Paróquias" selecionada sem "Foranias".');
    }
  }

  // AÇÃO: EXECUTAR RESTAURAÇÃO PARAMETRIZADA
  const handleRunRestore = async () => {
    if (!parsedValidation || isRestoreRunning) return;

    if (selectedRestoreTables.length === 0) {
      setRestoreError('Nenhuma tabela foi selecionada para restauração.');
      return;
    }

    if (restoreMode === 'replace' && !confirmReplaceChecked) {
      setRestoreError('Marque a caixa de confirmação para executar a Substituição Limpa.');
      return;
    }

    setIsRestoreRunning(true);
    setRestoreError(null);
    setRestoreReport(null);
    setRestoreProgress({
      percent: 0,
      currentStep: 'Preparando restauração parametrizada...',
      completedTablesCount: 0,
      totalTablesCount: selectedRestoreTables.length,
      recordsRestored: 0
    });

    try {
      const report = await executeParameterizedRestore(
        parsedValidation.manifest,
        {
          mode: restoreMode,
          selectedTables: selectedRestoreTables,
          clearEmptyTablesInReplace,
          preserveCurrentAdmin,
          restoreSystemCaches,
          runPostRestoreIntegrity,
          currentAdminProfile: profile
        },
        setRestoreProgress
      );

      setRestoreReport(report);
      fetchTableRecordsCounts();

      if (report.totalFailed === 0) {
        showToast(
          'success',
          `Restauração concluída! ${report.totalRecordsRestored} registros restaurados em ${report.totalTablesProcessed} tabelas.`,
          8000
        );
      } else {
        showToast(
          'info',
          `Restauração concluída com ${report.totalFailed} aviso(s). ${report.totalRecordsRestored} registros importados. Confira o relatório abaixo.`,
          0
        );
      }
    } catch (e: any) {
      console.error(e);
      setRestoreError(`Erro crítico durante restauração: ${e?.message || e}`);
      showToast('error', 'Houve uma falha durante a restauração do backup.');
    } finally {
      setIsRestoreRunning(false);
    }
  };

  const toggleSelectTable = (id: string) => {
    setSelectedTables(prev => (prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]));
  };

  const filteredCollections = BACKUP_COLLECTIONS.filter(
    c =>
      c.label.toLowerCase().includes(backupSearchTerm.toLowerCase()) ||
      c.category.toLowerCase().includes(backupSearchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(backupSearchTerm.toLowerCase())
  );

  const selectedRestoreRecordsCount = parsedValidation
    ? Object.keys(parsedValidation.manifest.data)
        .filter(t => selectedRestoreTables.includes(t))
        .reduce(
          (sum, t) =>
            sum + (Array.isArray(parsedValidation.manifest.data[t]) ? parsedValidation.manifest.data[t].length : 0),
          0
        )
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {notification && (
        <div
          className={cn(
            'p-4 border font-bold text-xs flex items-center justify-between shadow-md animate-in slide-in-from-top-2 duration-200',
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : notification.type === 'info'
                ? 'bg-indigo-50 text-indigo-900 border-indigo-300'
                : 'bg-red-50 text-red-900 border-red-300'
          )}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : notification.type === 'info' ? (
              <ShieldCheck size={18} className="text-indigo-600 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            title="Fechar aviso"
            onClick={() => setNotification(null)}
            className="text-xs uppercase hover:underline opacity-80 cursor-pointer ml-4 shrink-0"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Modal: Perguntar onde salvar após gerar o backup */}
      {pendingSaveBackup && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-4 sm:p-5 bg-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-800/80 border border-indigo-700 flex items-center justify-center">
                  <FolderOpen size={20} className="text-indigo-200" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">Onde Deseja Salvar o Backup?</h3>
                  <p className="text-[11px] text-indigo-200 font-medium">
                    Arquivo gerado e validado. Escolha o destino de gravação.
                  </p>
                </div>
              </div>
              <button
                type="button"
                title="Fechar"
                onClick={() => setPendingSaveBackup(null)}
                className="p-1.5 text-indigo-200 hover:text-white hover:bg-indigo-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Resumo do Pacote Gerado */}
              <div className="grid grid-cols-3 gap-2.5 bg-slate-50 border border-slate-200 p-3">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Tabelas</span>
                  <span className="text-sm font-black text-slate-900">
                    {pendingSaveBackup.manifest.tables_count}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Registros</span>
                  <span className="text-sm font-black text-indigo-800">
                    {pendingSaveBackup.manifest.records_count}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Tamanho</span>
                  <span className="text-sm font-black text-slate-900">
                    {formatBytes(pendingSaveBackup.sizeBytes)}
                  </span>
                </div>
              </div>

              {pendingSaveBackup.manifest.integrity_sha256 && (
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 flex items-center gap-2 text-[11px] text-emerald-900 font-semibold">
                  <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
                  <span className="truncate">
                    Assinatura SHA-256: <code className="font-mono">{pendingSaveBackup.manifest.integrity_sha256.slice(0, 20)}...</code>
                  </span>
                </div>
              )}

              {/* Nome do arquivo */}
              <div>
                <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1.5">
                  Nome do Arquivo (.json)
                </label>
                <input
                  type="text"
                  value={saveFileNameInput}
                  onChange={(e) => setSaveFileNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-semibold bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-600"
                  placeholder="escmin-backup.json"
                />
              </div>

              {savePickerBlockedHint && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>{savePickerBlockedHint}</span>
                </div>
              )}

              {/* Botões de Destino */}
              <div className="space-y-2 pt-1">
                {supportsNativeSavePicker() && (
                  <button
                    type="button"
                    disabled={isSavingFile}
                    onClick={handleSaveUsingNativePicker}
                    className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isSavingFile ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <FolderOpen size={16} />
                    )}
                    <span>Escolher Pasta e Salvar Arquivo...</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSavingFile}
                  onClick={handleSaveDirectDownload}
                  className={cn(
                    'w-full py-2.5 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer border',
                    supportsNativeSavePicker()
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                      : 'bg-indigo-700 hover:bg-indigo-800 text-white border-indigo-700'
                  )}
                >
                  <HardDriveDownload size={15} />
                  <span>Baixar via Navegador (Pasta de Downloads)</span>
                </button>
              </div>
            </div>
          </div>
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
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Criar Nova Cópia de Segurança
                </h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  30 Tabelas + Configurações + Polos + Hash SHA-256
                </p>
              </div>
            </div>
            <button
              onClick={fetchTableRecordsCounts}
              disabled={loadingCounts || isBackupRunning}
              className="px-2.5 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
              title="Atualizar contagem de registros"
            >
              <RefreshCw size={12} className={cn(loadingCounts && 'animate-spin text-indigo-600')} />
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
                    title="Gerar cópia de segurança completa com todas as 30 tabelas e parâmetros do sistema"
                    onClick={() => setBackupType('geral')}
                    className={cn(
                      'p-3.5 border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 h-full',
                      backupType === 'geral'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-extrabold text-xs text-slate-900 uppercase">Geral / Completo</span>
                      {backupType === 'geral' && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-snug">
                      Backup integral de todas as 30 tabelas, parâmetros, polos e caches.
                    </p>
                  </button>

                  <button
                    type="button"
                    title="Selecionar manualmente quais tabelas incluir no backup"
                    onClick={() => setBackupType('detalhado')}
                    className={cn(
                      'p-3.5 border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 h-full',
                      backupType === 'detalhado'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-extrabold text-xs text-slate-900 uppercase">
                        Detalhado / Segmentado
                      </span>
                      {backupType === 'detalhado' && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-snug">
                      Escolha manualmente quais tabelas deseja incluir no arquivo.
                    </p>
                  </button>
                </div>
              </div>

              {/* Quadro de Resumo de Dados Selecionados */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Volume de Dados Selecionado:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-indigo-900">{selectedLiveRecords} registros</span>
                    <span className="text-[10px] text-slate-400 font-bold">•</span>
                    <span className="text-xs font-bold text-slate-700">
                      {activeSelectedTables.length} de {BACKUP_COLLECTIONS.length} tabelas
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
                        onClick={() => setSelectedTables(BACKUP_COLLECTIONS.map(c => c.id))}
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

                  <div className="bg-white border border-slate-300 max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {filteredCollections.map((col) => {
                      const count = tableCounts[col.id] ?? 0;
                      const isChecked = selectedTables.includes(col.id);
                      return (
                        <div
                          key={col.id}
                          onClick={() => toggleSelectTable(col.id)}
                          className={cn(
                            'p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none',
                            isChecked ? 'bg-indigo-50/30' : 'opacity-70'
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={cn(
                                'w-4 h-4 border flex items-center justify-center transition-all shrink-0',
                                isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                              )}
                            >
                              {isChecked && <Check size={11} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{col.label}</p>
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase">
                                {col.category} • {col.id}
                              </span>
                            </div>
                          </div>
                          <span
                            className={cn(
                              'px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 border',
                              count > 0
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            )}
                          >
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
                      Todas as Tabelas Contempladas
                    </span>
                    <span className="text-indigo-800 font-black">{BACKUP_COLLECTIONS.length} Tabelas</span>
                  </div>
                  <div className="bg-white border border-slate-200 max-h-56 overflow-y-auto p-2 divide-y divide-slate-100 text-xs">
                    {BACKUP_COLLECTIONS.map(col => (
                      <div key={col.id} className="py-1.5 flex items-center justify-between text-[11px]">
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold text-slate-800 block truncate">{col.label}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{col.category}</span>
                        </div>
                        <span
                          className={cn(
                            'text-[10px] font-bold shrink-0 px-1.5 py-0.5 border',
                            (tableCounts[col.id] ?? 0) > 0
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          )}
                        >
                          {tableCounts[col.id] ?? 0} reg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Garantia de cobertura completa */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-200 text-[11px] text-indigo-900 flex items-start gap-2">
                <ShieldCheck size={15} className="text-indigo-700 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Cobertura Integral:</strong> Inclui tabelas acadêmicas, financeiras, diocese, polos/unidades,
                  usuários, histórico, arquivo morto e configurações de ambiente. Após gerar, será solicitado onde salvar.
                </p>
              </div>
            </div>

            {/* Ações e Progresso da Cópia */}
            <div className="space-y-3 pt-2">
              {isBackupRunning && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                    <span className="flex items-center gap-2 truncate">
                      <Loader2 size={14} className="animate-spin text-indigo-600 shrink-0" />
                      {backupProgress.currentStep}
                    </span>
                    <span className="font-mono text-indigo-800 shrink-0 ml-2">{backupProgress.percent}%</span>
                  </div>
                  <div className="h-2.5 bg-indigo-100 overflow-hidden border border-indigo-200">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${backupProgress.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                    <span>
                      Tabelas: {backupProgress.completedTablesCount} / {backupProgress.totalTablesCount}
                    </span>
                    <span>{backupProgress.recordsProcessed} registros lidos</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                title="Extrair dados selecionados e escolher onde salvar o arquivo .JSON"
                onClick={handleRunBackup}
                disabled={isBackupRunning}
                className="w-full py-3.5 bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isBackupRunning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Gerando Cópia ({backupProgress.percent}%)...</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>Gerar Cópia e Escolher Onde Salvar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================
            COLUNA 2 (50%): RESTAURAR BACKUP (.JSON) PARAMETRIZADO
        ======================================================== */}
        <div className="bg-white border border-slate-300 shadow-sm flex flex-col h-full">
          {/* Header da Restauração */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                <Upload size={20} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Restaurar Backup (.json)
                </h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Restauração Parametrizada por Dependências e Integridade
                </p>
              </div>
            </div>
            {(parsedValidation || restoreReport) && (
              <button
                type="button"
                onClick={() => {
                  setParsedValidation(null);
                  setSelectedRestoreTables([]);
                  setRestoreError(null);
                  setConfirmReplaceChecked(false);
                  setRestoreReport(null);
                }}
                className="px-2.5 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                title="Trocar Arquivo de Backup"
              >
                <RotateCcw size={12} />
                <span>Novo Arquivo</span>
              </button>
            )}
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-5">
            {isAdmin ? (
              <>
                <div className="space-y-4">
                  {/* Relatório Final Pós-Restauração */}
                  {restoreReport ? (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div
                        className={cn(
                          'p-4 border flex items-start gap-3',
                          restoreReport.totalFailed === 0
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                            : 'bg-amber-50 border-amber-300 text-amber-950'
                        )}
                      >
                        {restoreReport.totalFailed === 0 ? (
                          <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1 flex-1">
                          <h5 className="text-xs font-black uppercase tracking-tight">
                            {restoreReport.totalFailed === 0
                              ? 'Restauração Concluída com Perfeição'
                              : 'Restauração Concluída com Avisos'}
                          </h5>
                          <p className="text-[11px] font-medium">
                            Modo: <strong>{restoreReport.mode === 'replace' ? 'Substituição Limpa' : 'Mesclagem (Upsert)'}</strong> •{' '}
                            <strong>{restoreReport.totalRecordsRestored}</strong> registros restaurados •{' '}
                            {restoreReport.mode === 'replace' && (
                              <>
                                <strong>{restoreReport.totalRecordsDeleted}</strong> limpos anteriormente •{' '}
                              </>
                            )}
                            Duração: {(restoreReport.durationMs / 1000).toFixed(1)}s
                          </p>
                          {restoreReport.integrityCheckResult && (
                            <p className="text-[10px] font-semibold text-emerald-800">
                              Integridade referencial: {restoreReport.integrityCheckResult.deletedEnrollments} matrícula(s) órfã(s) limpa(s),{' '}
                              {restoreReport.integrityCheckResult.fixedStudents} vínculo(s) ajustado(s).
                            </p>
                          )}
                        </div>
                      </div>

                      {restoreReport.globalWarnings.length > 0 && (
                        <div className="p-3 bg-indigo-50 border border-indigo-200 space-y-1">
                          {restoreReport.globalWarnings.map((w, idx) => (
                            <p key={idx} className="text-[11px] text-indigo-900 font-medium">
                              • {w}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="border border-slate-200 max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {restoreReport.tableResults.map((tr) => (
                          <div key={tr.tableId} className="p-2.5 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800">{tr.label}</span>
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                                {tr.deletedCount > 0 && (
                                  <span className="text-slate-500">Limpos: {tr.deletedCount}</span>
                                )}
                                <span
                                  className={cn(
                                    'px-1.5 py-0.5 border',
                                    tr.status === 'ok'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : tr.status === 'skipped'
                                        ? 'bg-slate-50 text-slate-500 border-slate-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                  )}
                                >
                                  {tr.restoredCount}/{tr.attemptedCount} reg
                                </span>
                              </div>
                            </div>
                            {tr.warnings.length > 0 && (
                              <div className="text-[10px] text-amber-700 font-medium pl-2 border-l-2 border-amber-300">
                                {tr.warnings.map((w, i) => (
                                  <div key={i}>{w}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                      >
                        <RefreshCw size={16} />
                        <span>Recarregar Sistema e Ativar Dados Restaurados</span>
                      </button>
                    </div>
                  ) : !parsedValidation ? (
                    /* Dropzone de Arquivo */
                    <div
                      title="Clique ou arraste um arquivo .json de backup para restaurar"
                      className={cn(
                        'border-2 border-dashed p-8 text-center transition-all cursor-pointer select-none space-y-3 bg-slate-50/50',
                        dragActive
                          ? 'border-emerald-600 bg-emerald-50/40'
                          : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
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
                        title="Selecionar arquivo JSON de backup para restaurar"
                        className="hidden"
                        accept=".json"
                        onChange={handleFileChange}
                      />
                      <div className="w-14 h-14 bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-400 shadow-2xs">
                        <FileJson size={28} className="text-emerald-700" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">
                          Solte o arquivo de backup aqui
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">
                          ou clique para selecionar um arquivo .JSON no computador
                        </p>
                      </div>
                      <span className="inline-block px-3 py-1 bg-white border border-slate-200 text-[10px] font-extrabold text-slate-600 uppercase">
                        Compatível com Backups v3 e v4
                      </span>
                    </div>
                  ) : (
                    /* Arquivo Carregado + Parâmetros de Restauração */
                    <div className="space-y-3.5 animate-in fade-in duration-200">
                      {/* Header e Integridade do Arquivo Carregado */}
                      <div className="p-3 bg-emerald-50/80 border border-emerald-200 flex items-start gap-3">
                        <div className="w-9 h-9 bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-300">
                          <FileArchive size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">
                              Backup Analisado
                            </p>
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase border border-emerald-200">
                                {parsedValidation.manifest.backup_type?.toUpperCase() || 'COMPLETO'}
                              </span>
                              {parsedValidation.integrityStatus === 'valid' && (
                                <span className="px-1.5 py-0.5 bg-emerald-700 text-white text-[9px] font-black uppercase">
                                  SHA-256 ÍNTEGRO
                                </span>
                              )}
                              {parsedValidation.integrityStatus === 'legacy' && (
                                <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[9px] font-black uppercase">
                                  LEGADO
                                </span>
                              )}
                              {parsedValidation.integrityStatus === 'mismatch' && (
                                <span className="px-1.5 py-0.5 bg-amber-600 text-white text-[9px] font-black uppercase">
                                  HASH ALTERADO
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-600 font-bold mt-0.5">
                            Gerado em: {new Date(parsedValidation.manifest.timestamp).toLocaleString('pt-BR')}
                            {parsedValidation.manifest.generated_by &&
                              ` • Por: ${parsedValidation.manifest.generated_by}`}
                          </p>
                        </div>
                      </div>

                      {/* Parametrização do Modo de Restauração */}
                      <div className="p-3.5 bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex items-center gap-1.5 text-slate-800 text-[10px] font-black uppercase tracking-wider">
                          <Settings2 size={14} className="text-emerald-700" />
                          <span>Parâmetros da Restauração</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setRestoreMode('replace');
                              setConfirmReplaceChecked(false);
                            }}
                            className={cn(
                              'p-2.5 border text-left transition-all cursor-pointer',
                              restoreMode === 'replace'
                                ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-600/30'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black text-slate-900 uppercase">
                                Substituição Limpa
                              </span>
                              {restoreMode === 'replace' && (
                                <div className="w-2 h-2 rounded-full bg-emerald-700" />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                              Limpa as tabelas antes e recria o estado exato do backup (sem resíduos).
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRestoreMode('merge');
                              setConfirmReplaceChecked(false);
                            }}
                            className={cn(
                              'p-2.5 border text-left transition-all cursor-pointer',
                              restoreMode === 'merge'
                                ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-600/30'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black text-slate-900 uppercase">
                                Mesclagem (Upsert)
                              </span>
                              {restoreMode === 'merge' && (
                                <div className="w-2 h-2 rounded-full bg-emerald-700" />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                              Mantém registros extras atuais e atualiza/insere apenas os do arquivo.
                            </p>
                          </button>
                        </div>

                        {/* Checkboxes Parametrizáveis */}
                        <div className="space-y-1.5 pt-1 text-[11px] text-slate-700 font-semibold">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={preserveCurrentAdmin}
                              onChange={(e) => setPreserveCurrentAdmin(e.target.checked)}
                              className="accent-emerald-700"
                            />
                            <span>Preservar administrador conectado (impede perda de acesso)</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={restoreSystemCaches}
                              onChange={(e) => setRestoreSystemCaches(e.target.checked)}
                              className="accent-emerald-700"
                            />
                            <span>Aplicar configurações de instituição, financeiro, polos e calendário</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={runPostRestoreIntegrity}
                              onChange={(e) => setRunPostRestoreIntegrity(e.target.checked)}
                              className="accent-emerald-700"
                            />
                            <span>Verificar e reconciliar vínculos referenciais após restaurar</span>
                          </label>

                          {restoreMode === 'replace' && (
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={clearEmptyTablesInReplace}
                                onChange={(e) => setClearEmptyTablesInReplace(e.target.checked)}
                                className="accent-emerald-700"
                              />
                              <span>Zerar também tabelas que estavam vazias (0 reg) no backup</span>
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Quadro Resumo de Registros Selecionados */}
                      <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-emerald-900 font-black text-xs">
                          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                          <span>
                            {selectedRestoreRecordsCount} de {parsedValidation.totalRecords} registros
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 uppercase">
                          {selectedRestoreTables.length} de {parsedValidation.availableTables.length} tabelas
                        </span>
                      </div>

                      {/* Lista de Seleção de Tabelas */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                            Tabelas no Backup (Ordem Topológica FK)
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedRestoreTables(parsedValidation.availableTables)}
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

                        <div className="bg-white border border-slate-300 max-h-44 overflow-y-auto divide-y divide-slate-100">
                          {parsedValidation.availableTables
                            .filter(tableId => {
                              const tableMeta = BACKUP_COLLECTIONS.find(c => c.id === tableId);
                              const label = tableMeta?.label || tableId;
                              return (
                                label.toLowerCase().includes(restoreSearchTerm.toLowerCase()) ||
                                tableId.toLowerCase().includes(restoreSearchTerm.toLowerCase())
                              );
                            })
                            .map((tableId) => {
                              const items = parsedValidation.manifest.data[tableId];
                              const count = Array.isArray(items) ? items.length : 0;
                              const tableMeta = BACKUP_COLLECTIONS.find(c => c.id === tableId);
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
                                    'p-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none',
                                    isChecked ? 'bg-emerald-50/40' : 'opacity-60'
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className={cn(
                                        'w-4 h-4 border flex items-center justify-center transition-all shrink-0',
                                        isChecked
                                          ? 'bg-emerald-600 border-emerald-600 text-white'
                                          : 'border-slate-300 bg-white'
                                      )}
                                    >
                                      {isChecked && <Check size={11} strokeWidth={3} />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-800 truncate">
                                        {tableMeta?.label || tableId}
                                      </p>
                                      <span className="text-[9px] font-extrabold text-slate-400 uppercase block">
                                        {tableMeta?.category || 'Geral'} • {tableId}
                                      </span>
                                    </div>
                                  </div>
                                  <span
                                    className={cn(
                                      'px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 border',
                                      isChecked
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                    )}
                                  >
                                    {count} reg
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Alertas de dependência */}
                      {dependencyWarnings.length > 0 && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 space-y-1">
                          {dependencyWarnings.map((w, idx) => (
                            <p key={idx} className="text-[10px] text-amber-900 font-semibold flex items-start gap-1.5">
                              <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Confirmação de Segurança */}
                      {restoreMode === 'replace' ? (
                        <label className="p-3 bg-amber-50 border border-amber-300 flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={confirmReplaceChecked}
                            onChange={(e) => setConfirmReplaceChecked(e.target.checked)}
                            className="mt-0.5 accent-amber-700"
                          />
                          <span className="text-[10px] text-amber-950 font-semibold leading-relaxed">
                            <strong>Confirmação Obrigatória:</strong> Compreendo que o modo Substituição Limpa apagará os
                            registros atuais das tabelas selecionadas antes de restaurar este backup.
                          </span>
                        </label>
                      ) : (
                        <div className="p-2.5 bg-indigo-50 border border-indigo-200 flex items-start gap-2">
                          <AlertCircle size={14} className="text-indigo-700 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-indigo-900 font-medium leading-relaxed">
                            Modo Mesclagem ativo: registros existentes não presentes no backup serão preservados; IDs ou
                            chaves equivalentes serão atualizados.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mensagem de Erro */}
                  {restoreError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 flex items-start gap-2 text-xs">
                      <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
                      <p className="font-semibold">{restoreError}</p>
                    </div>
                  )}
                </div>

                {/* Progresso e Botões de Execução */}
                {!restoreReport && (
                  <div className="space-y-3 pt-2">
                    {isRestoreRunning && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 space-y-2.5 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                          <span className="flex items-center gap-2 truncate">
                            <Loader2 size={14} className="animate-spin text-emerald-700 shrink-0" />
                            {restoreProgress.currentStep}
                          </span>
                          <span className="font-mono text-emerald-900 shrink-0 ml-2">{restoreProgress.percent}%</span>
                        </div>
                        <div className="h-2.5 bg-emerald-100 overflow-hidden border border-emerald-200">
                          <div
                            className="h-full bg-emerald-600 transition-all duration-300"
                            style={{ width: `${restoreProgress.percent}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                          <span>
                            Tabelas: {restoreProgress.completedTablesCount} / {restoreProgress.totalTablesCount}
                          </span>
                          <span>{restoreProgress.recordsRestored} registros importados</span>
                        </div>
                      </div>
                    )}

                    {parsedValidation && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          title="Iniciar restauração parametrizada das tabelas selecionadas"
                          onClick={handleRunRestore}
                          disabled={
                            isRestoreRunning ||
                            selectedRestoreTables.length === 0 ||
                            (restoreMode === 'replace' && !confirmReplaceChecked)
                          }
                          className="flex-1 py-3.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                        >
                          {isRestoreRunning ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Restaurando ({restoreProgress.percent}%)...</span>
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
                            setParsedValidation(null);
                            setSelectedRestoreTables([]);
                            setConfirmReplaceChecked(false);
                            setRestoreError(null);
                          }}
                          className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
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
                  Por motivos de integridade e segurança dos dados, a restauração de arquivos (.JSON) está restrita ao
                  perfil de Administrador.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
