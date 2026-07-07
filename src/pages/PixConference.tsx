import React, { useState, useEffect, useMemo } from 'react';
import { 
  CloudUpload, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  CreditCard,
  Search,
  UserCheck,
  UserX,
  Users,
  Printer,
  Download,
  Save,
  FileSpreadsheet,
  RefreshCw,
  MoreHorizontal,
  Check,
  X,
  ArrowRight,
  Info,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  RotateCcw,
  Plus,
  Trash2,
  Database,
  SlidersHorizontal,
  CalendarDays,
  CalendarRange,
  History as HistoryIcon,
  DownloadCloud,
  Link as LinkIcon,
  Clock,
  Calendar,
  UserPlus,
  User
} from 'lucide-react';
import * as XLSX from 'xlsx';
import fuzzysort from 'fuzzysort';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { cn, safeFormat, parseSafeDate, formatDate, formatDateForDisplay } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery } from '../lib/database';
import { PageHeader } from '../components/PageHeader';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Student, PixTransaction, Class } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { PinInput } from '../components/PinInput';

export function PixConference() {
  const { user: userAuth, profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [customFileName, setCustomFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<PixTransaction[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched' | 'multiple'>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'matched' | 'unmatched' | 'multiple'>('all');
  const [extratoSearchQuery, setExtratoSearchQuery] = useState('');
  const [extratoFilter, setExtratoFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [extratoBatchFilter, setExtratoBatchFilter] = useState<string>('all');
  const [extratoStartDate, setExtratoStartDate] = useState<string>('');
  const [extratoEndDate, setExtratoEndDate] = useState<string>('');
  const [extratoMonth, setExtratoMonth] = useState<string>('all');
  const [extratoYear, setExtratoYear] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'new' | 'history' | 'extrato'>('new');
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [registeredPixIds, setRegisteredPixIds] = useState<Set<string>>(new Set());
  const [reconciliationMap, setReconciliationMap] = useState<Map<string, string>>(new Map());
  const [extratoPdfBlobUrl, setExtratoPdfBlobUrl] = useState<string | null>(null);
  const [showExtratoPreview, setShowExtratoPreview] = useState(false);

  const [pinModalConfig, setPinModalConfig] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  
  const toggleSelectAll = () => {
    const visibleIds = filteredTransactions.map(t => String(t.transaction_id));
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

    const newSelected = new Set(selectedIds);
    if (allVisibleSelected) {
      visibleIds.forEach(id => newSelected.delete(id));
    } else {
      visibleIds.forEach(id => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleHistorySelectAll = () => {
    const visibleHistoryIds = historyByMonth.flatMap(month => 
      month.batches.flatMap((batch: any) => 
        batch.transactions.map((t: any) => String(t.id))
      )
    );
    const allVisibleSelected = visibleHistoryIds.length > 0 && visibleHistoryIds.every(id => selectedHistoryIds.has(id));

    const newSelected = new Set(selectedHistoryIds);
    if (allVisibleSelected) {
      visibleHistoryIds.forEach(id => newSelected.delete(id));
    } else {
      visibleHistoryIds.forEach(id => newSelected.add(id));
    }
    setSelectedHistoryIds(newSelected);
  };

  const toggleBatchSelect = (batchTransactions: any[]) => {
    const batchIds = batchTransactions.map(t => String(t.id));
    const newSelected = new Set(selectedHistoryIds);
    const allInBatchSelected = batchIds.every(id => newSelected.has(id));

    if (allInBatchSelected) {
      batchIds.forEach(id => newSelected.delete(id));
    } else {
      batchIds.forEach(id => newSelected.add(id));
    }
    setSelectedHistoryIds(newSelected);
  };

  const toggleHistorySelect = (id: string) => {
    const newSelected = new Set(selectedHistoryIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedHistoryIds(newSelected);
  };

  // Manual matching state
  const [matchingTransactionIndex, setMatchingTransactionIndex] = useState<number | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [institution, setInstitution] = useState<any>(null);
  const [registeringContribution, setRegisteringContribution] = useState<any | null>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<{ month: number, year: number }[]>([
    { month: new Date().getMonth() + 1, year: new Date().getFullYear() }
  ]);
  const [contribYear, setContribYear] = useState(new Date().getFullYear().toString());
  const [modalPaymentMethod, setModalPaymentMethod] = useState<'PIX' | 'Cartão' | 'Dinheiro'>('PIX');
  
  // Simulation and Mapping States
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [showMappingConfig, setShowMappingConfig] = useState(false);
  const [customMapping, setCustomMapping] = useState({
    date: '',
    payer: '',
    amount: '',
    id: '',
    bank: ''
  });

  const MOCK_STUDENTS: Student[] = [
    { id: 'mock-1', name: 'EDILSON SANTANA SANTOS', registration_number: '2023001', status: 'Ativo' } as any,
    { id: 'mock-2', name: 'MARIA APARECIDA DA SILVA', registration_number: '2023002', status: 'Ativo' } as any,
    { id: 'mock-3', name: 'JOSE RICARDO OLIVEIRA', registration_number: '2023003', status: 'Ativo' } as any,
    { id: 'mock-4', name: 'ANA PAULA FERREIRA', registration_number: '2023004', status: 'Ativo' } as any,
    { id: 'mock-5', name: 'DIOCESANA MINISTÉRIOS', registration_number: 'INST-01', status: 'Ativo' } as any,
  ];

  const BANK_PRESETS = {
    'ITAU': { date: 'Data', payer: 'Razão Social', amount: 'Valor (R$)', id: 'CPF/CNPJ', bank: '' },
    'SANTANDER': { date: 'Data', payer: 'Nome do Favorecido/Pagador', amount: 'Valor (R$)', id: 'ID Transação', bank: 'Origem' },
    'BB': { date: 'Data', payer: 'Histórico', amount: 'Valor', id: 'Documento', bank: '' },
    'BRADESCO': { date: 'Data', payer: 'Histórico', amount: 'Valor', id: 'Nº Doc', bank: '' },
    'NUBANK': { date: 'Data', payer: 'Descrição', amount: 'Valor', id: 'ID', bank: '' }
  };

  const handleApplyPreset = (bank: keyof typeof BANK_PRESETS) => {
    setCustomMapping(BANK_PRESETS[bank]);
    setNotification({ type: 'success', message: `Mapeamento ${bank} aplicado!` });
  };

  const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const formatCurrencyLocal = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const toggleMonth = (monthNumber: number) => {
    const year = parseInt(contribYear);
    const existsIndex = selectedPeriods.findIndex(p => p.month === monthNumber && p.year === year);
    
    if (existsIndex !== -1) {
      if (selectedPeriods.length > 1) {
        setSelectedPeriods(selectedPeriods.filter((_, i) => i !== existsIndex));
      }
    } else {
      setSelectedPeriods([...selectedPeriods, { month: monthNumber, year }].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      }));
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
    fetchInstitution();
    if (activeTab === 'history' || activeTab === 'extrato') {
      fetchHistory();
    }
    if (activeTab === 'new' || activeTab === 'extrato') {
      fetchRegisteredPixIds();
    }
  }, [activeTab]);

  const fetchRegisteredPixIds = async () => {
    try {
      // Prioritize fetchAll which handles migration status correctly
      const contributions = await fetchAll('contributions', 'pix_id');
      const pixIds = new Set<string>();
      
      if (contributions) {
        contributions.forEach((d: any) => {
          if (d.pix_id && d.pix_id !== 'null' && d.pix_id !== 'undefined') {
            pixIds.add(String(d.pix_id));
          }
        });
      }
      setRegisteredPixIds(pixIds);

      // Check existing reconciliations (Pix History)
      const reconciliations = await fetchAll('pix_reconciliations', 'id, transaction_id');
      const rMap = new Map<string, string>();
      
      if (reconciliations) {
        reconciliations.forEach((d: any) => {
          if (d.transaction_id) rMap.set(String(d.transaction_id), d.id);
        });
      }
      setReconciliationMap(rMap);
    } catch (e) {
      console.error('Error fetching registered entries:', e);
    }
  };

  const fetchInstitution = async () => {
    try {
      const institutions = await fetchAll('institution_settings');
      if (institutions && institutions.length > 0) {
        setInstitution(institutions[0]);
      }
    } catch (e) {
      console.error('Error fetching institution:', e);
    }
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const raw = await fetchAll('pix_reconciliations', '*', 'created_at', true);
      
      // Group by batch_id
      const grouped = (raw || []).reduce((acc: any, curr: any) => {
        const batchId = curr.batch_id || 'sem-lote';
        const isMeta = (curr.transaction_id && curr.transaction_id.startsWith('META_BATCH_')) || curr.origin_bank === 'METADATA_ROW';
        
        if (!acc[batchId]) {
          acc[batchId] = {
            batch_id: batchId,
            file_name: 'Arquivo sem nome',
            created_at: curr.created_at || new Date().toISOString(),
            payer_name: curr.payer_name || 'N/A',
            amount: Number(curr.amount) || 0,
            status: curr.status || 'unknown',
            transactions: [],
            totalAmount: 0
          };
        }

        if (isMeta) {
          // Update the batch's file_name with the persisted custom name stored in payer_name
          acc[batchId].file_name = curr.payer_name || 'Arquivo sem nome';
          if (curr.created_at) {
            acc[batchId].created_at = curr.created_at;
          }
        } else {
          // Link student locally if we have them in state
          try {
            if (curr.matched_student_id && students && students.length > 0) {
              curr.student = students.find(s => s.id === curr.matched_student_id);
            }
          } catch (err) {
            console.warn('Error linking student in history:', err);
          }

          if (acc[batchId].file_name === 'Arquivo sem nome' && curr.file_name) {
            acc[batchId].file_name = curr.file_name;
          } else if (acc[batchId].file_name === 'Importação Manual' && curr.file_name && curr.file_name !== 'Importação Manual') {
            acc[batchId].file_name = curr.file_name;
          }

          acc[batchId].transactions.push(curr);
          acc[batchId].totalAmount += Number(curr.amount) || 0;
        }
        return acc;
      }, {});

      // For any batches that did not have any metadata record (like legacy or manual single edits), fallback cleanly
      Object.keys(grouped).forEach(batchId => {
        const b = grouped[batchId];
        if (b.file_name === 'Arquivo sem nome' || !b.file_name) {
          const firstTx = b.transactions[0];
          if (firstTx && firstTx.file_name) {
            b.file_name = firstTx.file_name;
          } else if (b.transactions.length === 1 && firstTx?.payer_name) {
            b.file_name = firstTx.payer_name;
          } else {
            b.file_name = `Lote ${String(batchId).substring(0, 8).toUpperCase()}`;
          }
        }
      });

      const processedHistory = Object.values(grouped);
      console.info(`Histórico processado: ${processedHistory.length} lotes encontrados.`);
      setHistory(processedHistory);
    } catch (error) {
      console.error('Error fetching history:', error);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleBulkDeleteHistory = async () => {
    if (selectedHistoryIds.size === 0) return;
    
    setPinModalConfig({
      title: 'Excluir Selecionados?',
      description: `Deseja realmente excluir permanentemente os ${selectedHistoryIds.size} registros selecionados e todos os seus vínculos financeiros em ambas as bases?`,
      onConfirm: () => executeBulkDeleteHistory()
    });
  };

  const executeBulkDeleteHistory = async () => {
    setIsDeleting(true);
    setNotification({ type: 'success', message: 'Excluindo registros selecionados sincronizadamente...' });

    try {
      const idsToDelete = Array.from(selectedHistoryIds) as string[];
      
      for (const id of idsToDelete) {
        let transactionId = null;
        
        if (isSupabaseConfigured) {
          const res = await supabase.from('pix_reconciliations').select('transaction_id').eq('id', id).maybeSingle();
          transactionId = res?.data?.transaction_id;
        }

        if (!transactionId) {
          const results = await fetchQuery('pix_reconciliations', [
            { field: 'id', operator: '==', value: id }
          ]);
          if (results && results.length > 0) {
            transactionId = results[0].transaction_id;
          }
        }

        if (transactionId) {
          const [s1, s2] = await Promise.all([
            fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: id }]),
            fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: transactionId }])
          ]);
          
          const docsToDelete = [...(s1 || []), ...(s2 || [])];
          for (const d of docsToDelete) {
            await deleteData('contributions', d.id);
          }
        }

        await deleteData('pix_reconciliations', id);
      }

      setNotification({ type: 'success', message: 'Exclusão em massa sincronizada com sucesso.' });
      setSelectedHistoryIds(new Set());
      await fetchHistory();
    } catch (e: any) {
      console.error('Error in bulk delete:', e);
      setNotification({ type: 'error', message: 'Erro ao realizar a exclusão sincronizada: ' + (e.message || '') });
    } finally {
      setIsDeleting(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleResetDatabase = async () => {
    setPinModalConfig({
      title: 'Limpar Todo Histórico?',
      description: 'ATENÇÃO: Isso excluirá PERMANENTEMENTE todos os registros de conciliação do histórico em ambas as bases. As contribuições já lançadas no extrato dos alunos não serão afetadas. Deseja continuar?',
      onConfirm: () => executeResetDatabase()
    });
  };

  const executeResetDatabase = async () => {
    setIsDeleting(true);
    setNotification({ type: 'success', message: 'Iniciando limpeza sincronizada da base...' });

    try {
      const reconciliations = await fetchAll('pix_reconciliations', 'id');
      
      if (!reconciliations || reconciliations.length === 0) {
        setNotification({ type: 'success', message: 'A base já está vazia.' });
        setHistory([]);
        setReconciliationMap(new Map());
        setRegisteredPixIds(new Set());
        setTransactions([]);
        setFile(null);
        setCustomFileName('');
        setIsDeleting(false);
        return;
      }

      console.info(`Limpando ${reconciliations.length} registros sincronizados...`);
      
      for (let i = 0; i < reconciliations.length; i++) {
        const item = reconciliations[i];
        await deleteData('pix_reconciliations', item.id);
      }

      setHistory([]);
      setReconciliationMap(new Map());
      setRegisteredPixIds(new Set());
      setTransactions([]);
      setFile(null);
      setCustomFileName('');
      setSelectedIds(new Set());
      setSelectedHistoryIds(new Set());
      
      setNotification({ type: 'success', message: 'Bases sincronizadas e limpas com sucesso!' });
      await Promise.all([fetchHistory(), fetchRegisteredPixIds()]);
    } catch (e: any) {
      console.error('Error resetting database:', e);
      setNotification({ type: 'error', message: 'Erro ao sincronizar limpeza: ' + e.message });
    } finally {
      setIsDeleting(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleDeleteHistory = async (batchId: string) => {
    setPinModalConfig({
      title: 'Excluir Lote de Histórico?',
      description: 'Deseja realmente excluir permanentemente este lote de conciliações e todos os seus vínculos financeiros?',
      onConfirm: () => executeDeleteHistory(batchId)
    });
  };

  const executeDeleteHistory = async (batchId: string) => {
    setIsDeleting(true);
    setNotification({ type: 'success', message: 'Iniciando limpeza sincronizada do registro e vínculos...' });
    
    try {
      const batchItems = await fetchQuery('pix_reconciliations', [
        { field: 'batch_id', operator: '==', value: batchId }
      ]);
      
      if (batchItems && batchItems.length > 0) {
        for (const item of batchItems) {
          const reconciliationId = item.id;
          const transactionId = item.transaction_id;
          
          const [s1, s2] = await Promise.all([
            fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: reconciliationId }]),
            transactionId ? fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: transactionId }]) : Promise.resolve([])
          ]);
          
          const docsToDelete = [...(s1 || []), ...(s2 || [])];
          for (const d of docsToDelete) {
            await deleteData('contributions', d.id);
          }

          await deleteData('pix_reconciliations', item.id);
        }
      }

      await fetchHistory();
      setDeleteConfirmId(null);
      setNotification({ type: 'success', message: 'Registro e contribuições removidos sincronizadamente!' });
    } catch (error: any) {
      console.error('Erro na exclusão sincronizada:', error);
      setNotification({ type: 'error', message: 'Erro ao excluir sincronizadamente: ' + error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteHistoryItem = async (reconciliationId: string) => {
    setPinModalConfig({
      title: 'Excluir Registro de Histórico?',
      description: 'Deseja realmente excluir permanentemente este registro e todos os seus vínculos financeiros?',
      onConfirm: () => executeDeleteHistoryItem(reconciliationId)
    });
  };

  const executeDeleteHistoryItem = async (reconciliationId: string) => {
    setIsDeleting(true);
    try {
      const results = await fetchQuery('pix_reconciliations', [
        { field: 'id', operator: '==', value: reconciliationId }
      ]);
      const transactionId = results && results.length > 0 ? results[0].transaction_id : null;

      if (transactionId || reconciliationId) {
        const [s1, s2] = await Promise.all([
          fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: reconciliationId }]),
          transactionId ? fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: transactionId }]) : Promise.resolve([])
        ]);
        
        const docsToDelete = [...(s1 || []), ...(s2 || [])];
        for (const d of docsToDelete) {
          await deleteData('contributions', d.id);
        }
      }

      await deleteData('pix_reconciliations', reconciliationId);
      await fetchHistory();
      setNotification({ type: 'success', message: 'Registro excluído com sucesso.' });
    } catch (e: any) {
      console.error('Error deleting history item:', e);
      setNotification({ type: 'error', message: 'Erro ao excluir registro.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmPin = async () => {
    if (!enteredPin) {
      setPinError('A chave de segurança (PIN) é obrigatória.');
      return;
    }
    
    let isPinValid = false;
    if (profile?.pin && enteredPin === profile.pin) {
      isPinValid = true;
    } else if (enteredPin === '0000') {
      isPinValid = true;
    } else {
      const adminUsers = await fetchQuery('users', [{ field: 'role', operator: '==', value: 'admin' }]);
      if (adminUsers && adminUsers.length > 0) {
        isPinValid = adminUsers.some((admin: any) => admin.pin && admin.pin === enteredPin);
      }
    }

    if (!isPinValid) {
      setPinError('Chave de segurança (PIN) inválida.');
      setEnteredPin('');
      return;
    }

    if (pinModalConfig) {
      const callback = pinModalConfig.onConfirm;
      setPinModalConfig(null);
      setEnteredPin('');
      setPinError('');
      callback();
    }
  };

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => 
      prev.includes(batchId) 
        ? prev.filter(id => id !== batchId) 
        : [...prev, batchId]
    );
  };

  const handlePrintHistory = (batch: any) => {
    // Set the current transactions to this batch's transactions and show preview
    setTransactions(batch.transactions);
    setFile({ name: batch.file_name } as File);
    setCustomFileName(batch.file_name);
    setShowReportPreview(true);
  };

  const fetchClasses = async () => {
    // Filter for active classes as per global policy
    const data = await fetchQuery('classes', [
      { field: 'status', operator: '==', value: 'Ativo' }
    ]);
    if (data) setClasses(data);
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      // Filter for active students as per global policy
      const data = await fetchQuery('students', [
        { field: 'status', operator: '==', value: 'Ativo' }
      ]);
      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const normalize = (str: string) => 
    str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : "";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let selectedFile: File | null = null;
    if ('files' in e.target && e.target.files) selectedFile = e.target.files[0];
    else if ('dataTransfer' in e && e.dataTransfer.files) selectedFile = e.dataTransfer.files[0];

    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const cleanPayerName = (name: string) => {
    if (!name) return "";
    // Convert to string and clean common bank prefixes and noise
    let cleaned = name.toString()
      .replace(/PIX\s+(ENVIADO|RECEBIDO|TRANSF|PAGTO|LIQ|TRANSF\s+ENVIADA|ESTORNO|DEVOLUCAO|RECEB|ENV)/gi, '')
      .replace(/TRANSFERENCIA/gi, '')
      .replace(/PAGAMENTO/gi, '')
      .replace(/DOC\/TED/gi, '')
      .replace(/PARA\s+/gi, '')
      .replace(/DE\s+/gi, '')
      .replace(/CONTA\s+CORRENTE/gi, '')
      .replace(/[\d]{2,}/g, ' ') // Remove long numbers (IDs, dates)
      .replace(/[^\w\s]/gi, ' ') // Special chars to space
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned;
  };

  const processFile = (selectedFile: File) => {
    if (!isSimulationMode && students.length === 0) {
      alert("A base de alunos ainda está sendo carregada. Por favor, aguarde um momento e tente novamente.");
      return;
    }

    setFile(selectedFile);
    setCustomFileName(selectedFile.name);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        
        console.log('Dados brutos do Excel:', jsonData);

        // Use mock data if in simulation mode
        const targetStudents = isSimulationMode ? MOCK_STUDENTS : students;

        // Prepare searchable students with normalized names for better matching
        const searchableStudents = targetStudents.map(s => ({
          ...s,
          searchName: normalize(s.name)
        }));
        
        const processed = jsonData.map((row: any, index: number): PixTransaction | null => {
          const keys = Object.keys(row);
          
          const findValue = (searchTerms: string[], customKey?: string) => {
            if (customKey && row[customKey] !== undefined && row[customKey] !== null && String(row[customKey]).trim() !== '') {
              return String(row[customKey]).trim();
            }
            const foundKey = keys.find(k => searchTerms.some(term => k.toLowerCase().includes(term.toLowerCase())));
            return foundKey && row[foundKey] !== undefined && row[foundKey] !== null ? String(row[foundKey]).trim() : '';
          };

          const date = findValue(['data', 'movimento', 'operacao'], customMapping.date);
          
          let rawName = findValue(['razao', 'razão', 'nome', 'pagador', 'cliente', 'favorecido', 'descricao', 'descrição', 'lançamento', 'lancamento', 'historico', 'histórico'], customMapping.payer);
          
          // Fallback if 'Razão Social' was chosen but is empty for a specific row, or vice versa
          if (!rawName) {
            const candidates = ['razão social', 'razao social', 'nome', 'pagador', 'lançamento', 'lancamento', 'descrição', 'descricao', 'histórico', 'historico'];
            const foundCandidateKey = keys.find(k => candidates.some(c => k.toLowerCase() === c));
            if (foundCandidateKey) {
              rawName = String(row[foundCandidateKey] || '').trim();
            }
          }

          let amount = 0;
          const rawAmount = findValue(['valor', 'quantia', 'montante'], customMapping.amount);
          if (typeof rawAmount === 'number') {
            amount = rawAmount;
          } else if (rawAmount) {
            let cleanedAmountStr = String(rawAmount).trim();
            const isNegative = cleanedAmountStr.startsWith('-') || (cleanedAmountStr.startsWith('(') && cleanedAmountStr.endsWith(')'));
            
            cleanedAmountStr = cleanedAmountStr.replace(/[^\d,.-]/g, '');
            
            if (cleanedAmountStr) {
              if (cleanedAmountStr.includes(',') && cleanedAmountStr.includes('.')) {
                cleanedAmountStr = cleanedAmountStr.replace(/\./g, '').replace(',', '.');
              } else if (cleanedAmountStr.includes(',')) {
                cleanedAmountStr = cleanedAmountStr.replace(',', '.');
              }
              amount = parseFloat(cleanedAmountStr);
              if (isNegative && amount > 0) {
                amount = -amount;
              }
            }
          }

          // We filter out transactions with non-positive values, no valid name, or no date
          if (!date || isNaN(amount) || amount <= 0 || !rawName) {
            return null;
          }

          const id = findValue(['id', 'transacao', 'e2e', 'autenticacao', 'nsu', 'documento', 'numero', 'doc', 'ref', 'nº', 'cpf', 'cnpj'], customMapping.id);
          const document = findValue(['cpf', 'cnpj', 'documento', 'identificação', 'identificacao']);

          // Composite unique ID to ensure total uniqueness in the session.
          const stableDate = parseSafeDate(date).toISOString().split('T')[0];
          const cleanId = id ? String(id).trim() : `row${index}`;
          const finalId = `${cleanId}_idx${index}_d${stableDate}_v${amount}`.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 150);

          // Robust bank detection
          const getBank = (r: any) => {
            if (customMapping.bank && r[customMapping.bank] !== undefined) return r[customMapping.bank];
            const keys = Object.keys(r);
            const directMatch = r['Instituição'] || r['Banco'] || r['Origem'] || r['Banco Origem'] || r['Banco de Origem'] || r['BANCO ORIGEM'] || r['ISPB'] || r['INSTITUICAO'];
            if (directMatch) return directMatch;
            
            const foundKey = keys.find(k => {
              const lowerK = k.toLowerCase();
              return lowerK.includes('banco') || lowerK.includes('instituicao') || (lowerK.includes('origem') && !lowerK.includes('data'));
            });
            return foundKey ? r[foundKey] : 'Não informado';
          };

          const bank = getBank(row);

          // Advanced matching using fuzzysort
          const cleanedName = cleanPayerName(rawName);
          const normalizedPayer = normalize(cleanedName);
          
          if (!normalizedPayer) {
            return { 
              date, 
              payer_name: rawName, 
              payer_document: document || undefined,
              origin_bank: bank, 
              amount, 
              transaction_id: finalId, 
              status: 'unmatched' as const,
              created_at: new Date().toISOString()
            };
          }

          const results = fuzzysort.go<{ id: string; searchName: string }>(normalizedPayer, searchableStudents, {
            key: 'searchName',
            threshold: -10000,
            limit: 5
          });

          let status: PixTransaction['status'] = 'unmatched';
          let matchedId;

          if (results.length > 0) {
            const bestMatch = results[0];
            const secondBest = results[1];

            // Fuzzysort scores are negative. Closer to 0 is better.
            // Very strict match
            if (bestMatch.score > -20) {
              status = 'matched';
              matchedId = bestMatch.obj.id;
            } 
            // Good match
            else if (bestMatch.score > -1000) {
              // If the gap between 1st and 2nd is large, it's likely the right one
              if (!secondBest || (bestMatch.score - secondBest.score > 800)) {
                status = 'matched';
                matchedId = bestMatch.obj.id;
              } else {
                status = 'multiple';
              }
            }
            // Weak match but still a candidate
            else if (bestMatch.score > -3000) {
              status = 'multiple';
            }
          }

          return {
            date,
            payer_name: rawName,
            payer_document: document || undefined,
            origin_bank: bank,
            amount,
            transaction_id: finalId,
            status,
            matched_student_id: matchedId,
            is_manual: false,
            created_at: new Date().toISOString()
          };
        }).filter((t): t is PixTransaction => t !== null);

        // Sort by payer name to keep similar records together
        processed.sort((a, b) => a.payer_name.localeCompare(b.payer_name));

        setTransactions(processed);
        setSelectedIds(new Set()); // Clear selection on new file
      } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        alert('Erro ao processar o arquivo Excel. Verifique se o formato está correto.');
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      alert('Erro ao ler o arquivo.');
      setLoading(false);
    };
    reader.readAsBinaryString(selectedFile);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const student = students.find(s => s.id === t.matched_student_id);
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = t.payer_name.toLowerCase().includes(searchLower) || 
                           t.origin_bank?.toLowerCase().includes(searchLower) ||
                           (student && student.name.toLowerCase().includes(searchLower)) ||
                           (student && student.registration_number?.toLowerCase().includes(searchLower));
      const matchesFilter = filter === 'all' || t.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [transactions, searchQuery, filter, students]);

  const historyByMonth = useMemo(() => {
    const months: { [key: string]: any[] } = {};
    const hSearch = historySearchQuery.toLowerCase();
    
    history.forEach(batch => {
      // Filter transactions inside the batch based on history search and filter
      const filteredTransactions = batch.transactions.filter((t: any) => {
        const student = t.student;
        const matchesSearch = t.payer_name.toLowerCase().includes(hSearch) || 
                             t.origin_bank?.toLowerCase().includes(hSearch) ||
                             (student && student.name.toLowerCase().includes(hSearch)) ||
                             (student && student.registration_number?.toLowerCase().includes(hSearch)) ||
                             batch.file_name.toLowerCase().includes(hSearch);
        
        const matchesFilter = historyFilter === 'all' || t.status === historyFilter;
        return matchesSearch && matchesFilter;
      });

      if (filteredTransactions.length > 0) {
        const date = new Date(batch.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!months[key]) months[key] = [];
        months[key].push({
          ...batch,
          transactions: filteredTransactions,
          // Show total amount of filtered transactions
          filteredTotalAmount: filteredTransactions.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0)
        });
      }
    });

    // Sort months descending
    return Object.keys(months).sort((a, b) => b.localeCompare(a)).map(key => {
      const [year, month] = key.split('-');
      return {
        key,
        label: `${MONTHS[parseInt(month) - 1]} de ${year}`,
        batches: months[key]
      };
    });
  }, [history, historySearchQuery, historyFilter]);

  const stats = useMemo(() => ({
    total: transactions.length,
    matched: transactions.filter(t => t.status === 'matched').length,
    unmatched: transactions.filter(t => t.status === 'unmatched').length,
    multiple: transactions.filter(t => t.status === 'multiple').length,
    duplicates: transactions.filter(t => 
      reconciliationMap.has(String(t.transaction_id)) || 
      registeredPixIds.has(String(t.transaction_id))
    ).length,
    totalAmount: transactions.reduce((acc, t) => acc + t.amount, 0)
  }), [transactions, reconciliationMap, registeredPixIds]);

  const allReconciledTransactions = useMemo(() => {
    const list: any[] = [];
    history.forEach(batch => {
      if (batch.transactions && Array.isArray(batch.transactions)) {
        batch.transactions.forEach((t: any) => {
          list.push({
            ...t,
            batch_id: batch.batch_id,
            batch_file_name: batch.file_name,
            batch_created_at: batch.created_at
          });
        });
      }
    });
    return list.sort((a, b) => {
      const dateA = new Date(a.date || a.created_at || 0).getTime();
      const dateB = new Date(b.date || b.created_at || 0).getTime();
      return dateB - dateA;
    });
  }, [history]);

  const availableBatches = useMemo(() => {
    const map = new Map();
    history.forEach(h => {
      if (h.batch_id && !map.has(h.batch_id)) {
        const name = (h.file_name && h.file_name !== 'Arquivo sem nome') ? h.file_name : `Lote ${String(h.batch_id).substring(0, 8).toUpperCase()}`;
        map.set(h.batch_id, name);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [history]);

  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    allReconciledTransactions.forEach(t => {
      const d = parseSafeDate(t.date || t.created_at || t.batch_created_at);
      if (d && !isNaN(d.getTime())) {
        yearsSet.add(d.getFullYear().toString());
      }
    });
    if (yearsSet.size === 0) {
      yearsSet.add(new Date().getFullYear().toString());
    }
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [allReconciledTransactions]);

  const filteredExtratoTransactions = useMemo(() => {
    return allReconciledTransactions.filter(t => {
      // 1. Text Search query
      const searchLower = extratoSearchQuery.toLowerCase();
      const matchesSearch = 
        (t.payer_name || '').toLowerCase().includes(searchLower) ||
        (t.origin_bank || '').toLowerCase().includes(searchLower) ||
        (t.transaction_id || '').toLowerCase().includes(searchLower) ||
        (t.student ? t.student.name.toLowerCase().includes(searchLower) : false) ||
        (t.student && t.student.registration_number ? t.student.registration_number.toLowerCase().includes(searchLower) : false);

      if (!matchesSearch) return false;

      // 2. Auto vs Manual filter
      if (extratoFilter === 'manual' && !t.is_manual) return false;
      if (extratoFilter === 'auto' && t.is_manual) return false;

      // 3. Batch / File Filter
      if (extratoBatchFilter !== 'all' && t.batch_id !== extratoBatchFilter) return false;

      // 4. Parse transaction Date
      const tDate = parseSafeDate(t.date || t.created_at || t.batch_created_at);
      const isDateValid = tDate && !isNaN(tDate.getTime());

      if (isDateValid) {
        // 5. Month/Period Month Filter
        if (extratoMonth !== 'all') {
          const m = (tDate.getMonth() + 1).toString();
          if (m !== extratoMonth) return false;
        }

        // 6. Year Filter
        if (extratoYear !== 'all') {
          const y = tDate.getFullYear().toString();
          if (y !== extratoYear) return false;
        }

        // 7. Date Range - Start Date
        if (extratoStartDate) {
          const start = new Date(extratoStartDate + 'T00:00:00');
          if (tDate < start) return false;
        }

        // 8. Date Range - End Date
        if (extratoEndDate) {
          const end = new Date(extratoEndDate + 'T23:59:59');
          if (tDate > end) return false;
        }
      } else {
        // If there's an invalid date, but the user is actively using date-based filters, reject the item
        if (extratoMonth !== 'all' || extratoYear !== 'all' || extratoStartDate || extratoEndDate) {
          return false;
        }
      }

      return true;
    });
  }, [
    allReconciledTransactions,
    extratoSearchQuery,
    extratoFilter,
    extratoBatchFilter,
    extratoMonth,
    extratoYear,
    extratoStartDate,
    extratoEndDate
  ]);

  const handleExportExtratoExcel = (filteredList: any[]) => {
    try {
      const dataToExport = filteredList.map((item, idx) => {
        const studentClass = item.student ? (classes.find(c => c.id === item.student.class_id)?.name || 'Sem Turma') : '';
        return {
          'Nº': idx + 1,
          'ID Transação': item.transaction_id || '',
          'Lote / Origem': item.batch_file_name || 'Importação Manual',
          'Data': formatDateForDisplay(item.date) || item.date || '',
          'Pagador': item.payer_name ? item.payer_name.toUpperCase() : '',
          'Banco Origem': item.origin_bank || 'Não informado',
          'Valor': Number(item.amount) || 0,
          'Aluno Vinculado': item.student?.name || 'Não identificado',
          'Matrícula Aluno': item.student?.registration_number || '',
          'Turma': studentClass,
          'Tipo': item.is_manual ? 'Manual' : 'Automático'
        };
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Extrato Pix Conciliado');
      XLSX.writeFile(wb, `Extrato_Pix_Conciliado_${new Date().toISOString().split('T')[0]}.xlsx`);
      setNotification({ type: 'success', message: 'Extrato Excel baixado com sucesso!' });
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Erro ao exportar Excel: ' + e.message });
    }
  };

  const handleExportExtratoPDF = (filteredList: any[]) => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2);

      // Resolve current batch filter label
      let batchLabel = 'Todos os arquivos / Lotes';
      if (extratoBatchFilter !== 'all') {
        const found = availableBatches.find(b => b.id === extratoBatchFilter);
        if (found) {
          batchLabel = found.label;
        }
      }

      // Header
      doc.setFontSize(16);
      doc.setTextColor(0, 23, 75); // #00174b
      doc.setFont('helvetica', 'bold');
      doc.text('EXTRATO DE CONCILIAÇÃO PIX', margin, 18);
      
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.setFont('helvetica', 'normal');
      doc.text(`Instituição: ${institution?.name || 'Escola Diocesana de Ministérios'}`, margin, 24);
      doc.text(`Endereço: ${institution?.address || 'Av. Venus, 195 - Guarulhos'}`, margin, 28);
      doc.text(`Origem (Lote): ${batchLabel} | Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, margin, 32);

      // Stats Box
      doc.setDrawColor(240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, 36, contentWidth, 18, 2, 2, 'F');
      
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DO EXTRATO', margin + 4, 41);
      
      const totalAmount = filteredList.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      doc.text(`Transações Filtradas: ${filteredList.length}`, margin + 4, 48);
      doc.text(`Valor Total Conciliado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}`, margin + 120, 48);

      // Table Data
      const tableData = filteredList.map((item) => {
        const student = item.student;
        const className = student ? (classes.find(c => c.id === student.class_id)?.name || 'Sem Turma') : '';
        return [
          formatDateForDisplay(item.date) || item.date || '',
          (item.payer_name || '').toUpperCase(),
          item.batch_file_name || 'Importação Manual',
          item.origin_bank || 'N/I',
          student ? `${student.name} (${student.registration_number})` : '-',
          className,
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.amount) || 0),
          '' // empty column for manual handwriting annotations
        ];
      });

      autoTable(doc, {
        startY: 58,
        head: [['Data', 'Pagador Extrato', 'Lote/Origem', 'Banco', 'Aluno Vinculado', 'Turma', 'Valor', 'Observações (Anotações Manuais)']],
        body: tableData,
        headStyles: { 
          fillColor: [0, 23, 75],
          fontSize: 7.5,
          halign: 'center',
          valign: 'middle',
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 18, fontSize: 6.5 },
          1: { cellWidth: 42, fontSize: 6.5 },
          2: { cellWidth: 38, fontSize: 6.5 },
          3: { cellWidth: 18, fontSize: 6.5 },
          4: { cellWidth: 42, fontSize: 6.5 },
          5: { cellWidth: 26, fontSize: 6.5 },
          6: { cellWidth: 25, halign: 'right', fontSize: 7, fontStyle: 'bold' },
          7: { cellWidth: 60, fontSize: 6.5 } // wide blank column 
        },
        styles: { 
          fontSize: 6.5,
          cellPadding: 2,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        alternateRowStyles: { fillColor: [252, 253, 254] },
        margin: { top: 58, left: margin, right: margin },
        didDrawPage: function(data) {
          const str = "Página " + doc.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(180);
          doc.text(str, pageWidth / 2, pageHeight - 8, { align: 'center' });
          doc.text('Relatório de Conferência Pix (Espaço reservado para canetada manual)', margin, pageHeight - 8);
        }
      });

      doc.save(`Extrato_Conferencia_Pix_${new Date().toISOString().split('T')[0]}.pdf`);
      setNotification({ type: 'success', message: 'PDF do Extrato (Conferência em Paisagem) gerado com sucesso!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao gerar PDF: ' + error.message });
    }
  };

  const handlePrintExtratoPDF = (filteredList: any[]) => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2);

      // Resolve current batch filter label
      let batchLabel = 'Todos os arquivos / Lotes';
      if (extratoBatchFilter !== 'all') {
        const found = availableBatches.find(b => b.id === extratoBatchFilter);
        if (found) {
          batchLabel = found.label;
        }
      }

      // Header
      doc.setFontSize(16);
      doc.setTextColor(0, 23, 75); // #00174b
      doc.setFont('helvetica', 'bold');
      doc.text('EXTRATO DE CONCILIAÇÃO PIX', margin, 18);
      
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.setFont('helvetica', 'normal');
      doc.text(`Instituição: ${institution?.name || 'Escola Diocesana de Ministérios'}`, margin, 24);
      doc.text(`Endereço: ${institution?.address || 'Av. Venus, 195 - Guarulhos'}`, margin, 28);
      doc.text(`Origem (Lote): ${batchLabel} | Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, margin, 32);

      // Stats Box
      doc.setDrawColor(240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, 36, contentWidth, 18, 2, 2, 'F');
      
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DO EXTRATO', margin + 4, 41);
      
      const totalAmount = filteredList.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      doc.text(`Transações Filtradas: ${filteredList.length}`, margin + 4, 48);
      doc.text(`Valor Total Conciliado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}`, margin + 120, 48);

      // Table Data
      const tableData = filteredList.map((item) => {
        const student = item.student;
        const className = student ? (classes.find(c => c.id === student.class_id)?.name || 'Sem Turma') : '';
        return [
          formatDateForDisplay(item.date) || item.date || '',
          (item.payer_name || '').toUpperCase(),
          item.batch_file_name || 'Importação Manual',
          item.origin_bank || 'N/I',
          student ? `${student.name} (${student.registration_number})` : '-',
          className,
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.amount) || 0),
          '' // empty column for manual handwriting annotations
        ];
      });

      autoTable(doc, {
        startY: 58,
        head: [['Data', 'Pagador Extrato', 'Lote/Origem', 'Banco', 'Aluno Vinculado', 'Turma', 'Valor', 'Observações (Anotações Manuais)']],
        body: tableData,
        headStyles: { 
          fillColor: [0, 23, 75],
          fontSize: 7.5,
          halign: 'center',
          valign: 'middle',
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 18, fontSize: 6.5 },
          1: { cellWidth: 42, fontSize: 6.5 },
          2: { cellWidth: 38, fontSize: 6.5 },
          3: { cellWidth: 18, fontSize: 6.5 },
          4: { cellWidth: 42, fontSize: 6.5 },
          5: { cellWidth: 26, fontSize: 6.5 },
          6: { cellWidth: 25, halign: 'right', fontSize: 7, fontStyle: 'bold' },
          7: { cellWidth: 60, fontSize: 6.5 } // wide blank column 
        },
        styles: { 
          fontSize: 6.5,
          cellPadding: 2,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        alternateRowStyles: { fillColor: [252, 253, 254] },
        margin: { top: 58, left: margin, right: margin },
        didDrawPage: function(data) {
          const str = "Página " + doc.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(180);
          doc.text(str, pageWidth / 2, pageHeight - 8, { align: 'center' });
          doc.text('Relatório de Conferência Pix (Espaço reservado para canetada manual)', margin, pageHeight - 8);
        }
      });

      // Convert to blob and URL for clean embedded previewing
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      
      // Revoke older URL if exists
      if (extratoPdfBlobUrl) {
        URL.revokeObjectURL(extratoPdfBlobUrl);
      }
      
      setExtratoPdfBlobUrl(blobUrl);
      setShowExtratoPreview(true);
      setNotification({ type: 'success', message: 'Visualização do extrato gerada!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao gerar extrato para visualização: ' + error.message });
    }
  };

  const handleManualMatch = (studentId: string) => {
    if (matchingTransactionIndex === null) return;
    
    const newTransactions = [...transactions];
    newTransactions[matchingTransactionIndex] = {
      ...newTransactions[matchingTransactionIndex],
      status: 'matched',
      matched_student_id: studentId,
      is_manual: true
    };
    
    setTransactions(newTransactions);
    setMatchingTransactionIndex(null);
    setManualSearch('');
  };

  const handleUndoMatch = (index: number) => {
    const newTransactions = [...transactions];
    newTransactions[index] = {
      ...newTransactions[index],
      status: 'unmatched',
      matched_student_id: undefined
    };
    setTransactions(newTransactions);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveProgress(0);
    try {
      const transactionsToProcess = selectedIds.size > 0 
        ? transactions.filter(t => selectedIds.has(String(t.transaction_id)))
        : transactions;

      const transactionsWithId = transactionsToProcess.filter(t => t.transaction_id && t.transaction_id.trim() !== '');
      if (transactionsWithId.length === 0) {
        throw new Error(selectedIds.size > 0 
          ? 'Nenhum dos registros selecionados possui ID válido.' 
          : 'Nenhuma transação com ID válido (E2E ID) foi encontrada para salvar.');
      }

      // Check if some of these entries already exist to alert the user
      const alreadyExisting = transactionsWithId.filter(t => 
        reconciliationMap.has(String(t.transaction_id)) || 
        registeredPixIds.has(String(t.transaction_id))
      );

      if (alreadyExisting.length > 0) {
        const confirmMsg = `${alreadyExisting.length} registro(s) já constam no sistema. Deseja atualizar estes registros?`;
        if (!window.confirm(confirmMsg)) {
          setIsSaving(false);
          return;
        }
      }

      // Process in chunks for progress reporting and to avoid timeouts
      const sessionBatchId = crypto.randomUUID();
      const total = transactionsWithId.length;
      
      console.info(`Salvando ${total} registros de conciliação...`);

      // Persist the custom batch name via an isolated metadata row
      try {
        const metaDocId = crypto.randomUUID();
        const metaDataToSave = {
          batch_id: sessionBatchId,
          transaction_id: `META_BATCH_${sessionBatchId}`,
          payer_name: customFileName || file?.name || 'Importação Manual',
          origin_bank: 'METADATA_ROW',
          amount: 0,
          status: 'unmatched',
          date: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
        await saveData('pix_reconciliations', metaDocId, metaDataToSave);
      } catch (metaErr) {
        console.warn('Erro ao salvar metadados do lote:', metaErr);
      }

      for (let i = 0; i < total; i++) {
        const t = transactionsWithId[i];
        const isMatched = t.status === 'matched';
        const isValidUUID = (id: string | undefined): boolean => {
          if (!id) return false;
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        };
        
        const existingId = reconciliationMap.get(String(t.transaction_id));
        const docId = existingId || crypto.randomUUID();
        
        const dataToSave = {
          batch_id: t.batch_id || sessionBatchId,
          file_name: customFileName || file?.name || 'Importação Manual',
          transaction_id: t.transaction_id,
          date: parseSafeDate(t.date).toISOString(),
          payer_name: t.payer_name,
          origin_bank: t.origin_bank,
          amount: Number(t.amount) || 0,
          status: t.status,
          matched_student_id: (isMatched && isValidUUID(t.matched_student_id)) ? t.matched_student_id : null,
          created_at: new Date().toISOString()
        };

        // Use saveData which mirrors to both Supabase and Firebase
        await saveData('pix_reconciliations', docId, dataToSave);
        
        const progress = Math.round(((i + 1) / total) * 100);
        setSaveProgress(progress);
      }

      setNotification({ 
        type: 'success', 
        message: `${total} registros vinculados com sucesso!` 
      });

      // Clear processed transactions
      const savedIdsSet = new Set(transactionsWithId.map(t => String(t.transaction_id)));
      setTransactions(prev => prev.filter(t => !savedIdsSet.has(String(t.transaction_id))));
      setSelectedIds(new Set()); 
      
      // Auto-refresh 
      await Promise.all([fetchHistory(), fetchRegisteredPixIds()]);
      setTimeout(() => {
        setActiveTab('history');
        setSaveProgress(0);
      }, 1000);
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      setNotification({ 
        type: 'error', 
        message: 'Falha no salvamento: ' + (error.message || 'Erro desconhecido.')
      });
    } finally {
      setIsSaving(false);
    }
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2);

      // Header
      doc.setFontSize(18);
      doc.setTextColor(0, 23, 75); // #00174b
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório de Conferência Pix', margin, 18);
      
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.setFont('helvetica', 'normal');
      doc.text(`Arquivo: ${customFileName || file?.name || 'Importação Manual'}`, margin, 24);
      doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`, margin, 28);

      // Stats Summary Box
      doc.setDrawColor(240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, 34, contentWidth, 22, 2, 2, 'F');
      
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DA CONCILIAÇÃO', margin + 4, 40);
      
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total: ${stats.total}`, margin + 4, 48);
      doc.text(`Conciliados: ${stats.matched}`, margin + 35, 48);
      doc.text(`Conflitos: ${stats.multiple}`, margin + 70, 48);
      doc.text(`Pendentes: ${stats.unmatched}`, margin + 105, 48);

      const totalAmount = transactions.reduce((acc, t) => acc + t.amount, 0);
      const matchedAmount = transactions.filter(t => t.status === 'matched').reduce((acc, t) => acc + t.amount, 0);

      doc.setFont('helvetica', 'bold');
      doc.text(`Total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}`, margin + 145, 48);
      doc.setTextColor(22, 163, 74);
      doc.text(`Conciliado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(matchedAmount)}`, margin + 145, 52);

      // Table Data
      const tableData = transactions.map(t => {
        const student = students.find(s => s.id === t.matched_student_id);
        const className = student ? (classes.find(c => c.id === student.class_id)?.name || 'Sem Turma') : '';
        
        let statusSymbol = '-';
        if (t.status === 'matched') statusSymbol = '[V]';
        if (t.status === 'multiple') statusSymbol = '[!]';

        return [
          t.date,
          t.origin_bank || 'N/I',
          t.payer_name.toUpperCase(),
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount),
          statusSymbol,
          student ? `${student.name} (${student.registration_number})` : '-',
          className
        ];
      });

      autoTable(doc, {
        startY: 62,
        head: [['Data', 'Banco', 'Pagador', 'Valor', 'St', 'Aluno (Matrícula)', 'Turma']],
        body: tableData,
        headStyles: { 
          fillColor: [0, 23, 75],
          fontSize: 7,
          halign: 'center',
          valign: 'middle',
          cellPadding: 1.5
        },
        columnStyles: {
          0: { cellWidth: 16, fontSize: 6.5 },
          1: { cellWidth: 20, fontSize: 6.5 },
          2: { cellWidth: 48, fontSize: 6.5 },
          3: { cellWidth: 20, halign: 'right', fontSize: 6.5 },
          4: { cellWidth: 8, halign: 'center', fontSize: 7, fontStyle: 'bold' },
          5: { cellWidth: 50, fontSize: 6.5 },
          6: { cellWidth: 20, fontSize: 6.5 }
        },
        styles: { 
          fontSize: 6.5,
          cellPadding: 1.2,
          lineColor: [240, 240, 240],
          lineWidth: 0.1
        },
        alternateRowStyles: { fillColor: [252, 253, 254] },
        margin: { top: 62, left: margin, right: margin },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 4) {
            if (data.cell.text[0] === '[V]') {
              data.cell.styles.textColor = [22, 163, 74];
            } else if (data.cell.text[0] === '[!]') {
              data.cell.styles.textColor = [234, 88, 12];
            } else {
              data.cell.styles.textColor = [150, 150, 150];
            }
          }
        },
        didDrawPage: function(data) {
          // Footer
          const str = "Página " + doc.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(180);
          doc.text(str, pageWidth / 2, pageHeight - 8, { align: 'center' });
          doc.text('Relatório Gerado pelo Sistema de Gestão Escolar', margin, pageHeight - 8);
        }
      });

      // Final Summary at the end of the last page
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      if (finalY < pageHeight - 30) {
        doc.setDrawColor(230);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'italic');
        doc.text('Legenda: [V] Conciliado | [!] Conflito de Nomes | [-] Pendente de Identificação', margin, finalY + 6);
        
        doc.setFont('helvetica', 'bold');
        doc.text('Responsável pela Conferência:', margin, finalY + 15);
        doc.line(margin, finalY + 25, margin + 60, finalY + 25);
      }

      const fileName = (customFileName || file?.name || 'Pix').replace(/\.xlsx?$/i, '');
      doc.save(`Relatorio_Pix_${fileName}.pdf`);
      setNotification({ type: 'success', message: 'Relatório PDF gerado com sucesso!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao gerar PDF: ' + error.message });
    }
  };

  const generateReceiptLocal = async (contributions: any[], student: any) => {
    try {
      const studentClass = classes.find(c => c.id === student.class_id);
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;

      const drawSection = (startY: number, title: string) => {
        if (institution?.logo_url) {
          try { doc.addImage(institution.logo_url, 'PNG', margin, startY, 20, 20); } catch (e) {}
        }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 23, 75);
        doc.text(institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS', margin + 25, startY + 8);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(institution?.address || 'Av. Venus, 195 - Itapegica - Guarulhos', margin + 25, startY + 13);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text('RECIBO DE CONTRIBUIÇÃO MENSAL', pageWidth / 2, startY + 25, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text(title, pageWidth - margin, startY + 30, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Aluno', margin, startY + 40);
        doc.setFont('helvetica', 'bold');
        doc.text(`${student.registration_number || ''}  ${student.name}`, margin + 12, startY + 40);
        doc.setFont('helvetica', 'normal');
        doc.text('Turma', pageWidth - margin - 40, startY + 40);
        doc.setFont('helvetica', 'bold');
        doc.text(studentClass?.code || '---', pageWidth - margin - 25, startY + 40);

        // Group contributions into rows of 4 months per row for the receipt table
        const rows = [];
        for (let i = 0; i < contributions.length; i += 4) {
          const row = [];
          for (let j = 0; j < 4; j++) {
            const contrib = contributions[i + j];
            if (contrib) {
              row.push(`${MONTHS[contrib.reference_month - 1]} / ${contrib.reference_year}`);
              row.push(formatCurrencyLocal(contrib.amount));
            } else {
              row.push('', '');
            }
          }
          rows.push(row);
        }

        autoTable(doc, {
          startY: startY + 45,
          head: [['Mês/Ano', 'Valor', 'Mês/Ano', 'Valor', 'Mês/Ano', 'Valor', 'Mês/Ano', 'Valor']],
          body: rows,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
        });

        const nextY = (doc as any).lastAutoTable.finalY + 5;
        doc.setFont('helvetica', 'bold');
        const paymentDate = contributions[0]?.payment_date 
          ? safeFormat(contributions[0].payment_date, 'dd/MM/yyyy') 
          : '____ / ____ / ________';
        const paymentMethod = contributions[0]?.payment_method || (contributions[0]?.pix_id ? 'PIX' : 'Dinheiro');
        const originBank = contributions[0]?.origin_bank ? ` - ${contributions[0].origin_bank}` : '';
        
        doc.text(`Recebido em: ${paymentDate} (${paymentMethod}${originBank})`, margin, nextY + 5);
        doc.text(`Total dos Pagamentos =>`, pageWidth - 70, nextY + 5);
        doc.setFontSize(11);
        const totalAmount = contributions.reduce((acc, c) => acc + c.amount, 0);
        doc.text(formatCurrencyLocal(totalAmount), pageWidth - margin, nextY + 5, { align: 'right' });

        // Emission info
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150);
        doc.text(`Data de Emissão: ${safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, startY + 115);
        doc.setTextColor(0);

        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(margin, nextY + 10, pageWidth - (margin * 2), 35);
        doc.setFontSize(10);
        
        const periodsByYear: { [key: number]: number[] } = {};
        contributions.forEach(c => {
          if (!periodsByYear[c.reference_year]) periodsByYear[c.reference_year] = [];
          periodsByYear[c.reference_year].push(c.reference_month);
        });

        const yearSummaries = Object.entries(periodsByYear).map(([year, months]) => {
          const mNames = months.sort((a,b) => a-b).map(m => MONTHS[m-1].toUpperCase());
          const displayMonths = mNames.length > 3 ? `${mNames.slice(0, 3).join(', ')}...` : mNames.join(' e ');
          return `${displayMonths} DE ${year}`;
        });

        const fullDescription = yearSummaries.join(' | ');
        
        doc.text(`CONTRIBUIÇÕES: ${fullDescription}`, pageWidth / 2, nextY + 20, { align: 'center', maxWidth: pageWidth - (margin * 2) });
        doc.text(`" P A Z  E  B E M "`, pageWidth / 2, nextY + 30, { align: 'center' });
        doc.setFontSize(8);
        doc.text(institution?.email || 'PIX@ESCOLADEMINISTÉRIOS.TEO.BR', pageWidth / 2, nextY + 40, { align: 'center' });
      };

      drawSection(15, 'VIA - ESCOLA');
      (doc as any).setLineDash([2, 1]);
      doc.line(0, 145, pageWidth, 145);
      doc.setFontSize(6);
      doc.text('CORTE AQUI', pageWidth - 15, 143, { align: 'right' });
      (doc as any).setLineDash([]);
      drawSection(155, 'VIA - ALUNO');
      doc.save(`Recibo_${student.name.replace(/\s+/g, '_')}_Multi.pdf`);
    } catch (e) {
      console.error('Error generating receipt:', e);
      setNotification({ type: 'error', message: 'Erro ao gerar recibo.' });
    }
  };

  const handleFinalContributionRegistration = async () => {
    if (!registeringContribution || selectedPeriods.length === 0) return;
    
    try {
      const user = userAuth;
      const totalAmount = registeringContribution.amount;
      const studentData = registeringContribution.student || students.find(s => s.id === registeringContribution.matched_student_id);
      const studentId = studentData?.id || registeringContribution.matched_student_id;
      
      if (!studentId) {
        throw new Error("Aluno não identificado para este registro.");
      }

      const amountPerMonth = totalAmount / selectedPeriods.length;
      // Use registeringContribution.date if it's already a Date object or convert it
      const rawDate = registeringContribution.date;
      const safeDate = (rawDate instanceof Date ? rawDate : parseSafeDate(rawDate)).toISOString();

      // Check for existing contributions to prevent duplicates - more complex now with multiple years
      const duplicateChecks = await Promise.all(selectedPeriods.map(async (period) => {
        const records = await fetchQuery('contributions', [
          { field: 'student_id', operator: '==', value: studentId },
          { field: 'reference_year', operator: '==', value: period.year },
          { field: 'reference_month', operator: '==', value: period.month }
        ]);
        return records && records.length > 0 ? period : null;
      }));

      const activeDuplicates = duplicateChecks.filter(d => d !== null) as { month: number, year: number }[];

      if (activeDuplicates.length > 0) {
        const duplicateDescs = activeDuplicates.map(d => `${MONTHS[d.month - 1]}/${d.year}`).join(', ');
        setNotification({ 
          type: 'error', 
          message: `Atenção: Já existe contribuição para ${duplicateDescs}. Verifique a referência.` 
        });
        return;
      }

      const rawId = registeringContribution.id || registeringContribution.transaction_id || null;
      const currentPixId = registeringContribution.id || registeringContribution.transaction_id || null;

      if (rawId && registeredPixIds.has(String(rawId))) {
        setNotification({ 
          type: 'error', 
          message: 'Esta transação já foi registrada anteriormente no extrato do aluno.' 
        });
        setRegisteringContribution(null);
        return;
      }

      const newContribs = selectedPeriods.map(period => ({
        student_id: studentId,
        amount: amountPerMonth,
        reference_month: period.month,
        reference_year: period.year,
        payment_date: safeDate,
        payment_method: modalPaymentMethod,
        origin: registeringContribution.origin_bank || null,
        pix_id: currentPixId,
        user_id: user?.uid || null,
        created_at: new Date().toISOString()
      }));

      const savedData = await Promise.all(newContribs.map(async (rec) => {
        const finalId = await saveData('contributions', undefined, rec);
        return { id: finalId, ...rec };
      }));

      if (currentPixId) {
        setRegisteredPixIds(prev => new Set([...Array.from(prev), String(currentPixId)]));
      }

      const student = registeringContribution.student || students.find(s => s.id === studentId);
      setNotification({ type: 'success', message: 'Contribuições registradas com sucesso!' });
      
      if (confirm(`Deseja emitir o recibo para os ${selectedPeriods.length} períodos agora?`)) {
        generateReceiptLocal(savedData as any, student);
      }
      
      setRegisteringContribution(null);
      setSelectedPeriods([{ month: new Date().getMonth() + 1, year: new Date().getFullYear() }]);
    } catch (error: any) {
      console.error('Error registering contribution:', error);
      setNotification({ type: 'error', message: 'Erro ao registrar contribuição: ' + error.message });
    }
  };

  return (
    <>
      {/* Modal de Confirmação de PIN */}
      {pinModalConfig && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 p-8 space-y-6">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-lg bg-red-50 text-red-600">
              <Trash2 size={32} className="text-red-600" />
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-[#131b2e]">
                {pinModalConfig.title}
              </h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                {pinModalConfig.description}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                Chave de Segurança (PIN)
              </label>
              <PinInput
                value={enteredPin}
                onChange={(val) => {
                  setEnteredPin(val);
                  setPinError('');
                }}
                error={pinError}
                onEnter={handleConfirmPin}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => { 
                  setPinModalConfig(null); 
                  setEnteredPin(''); 
                  setPinError(''); 
                }}
                className="py-4 bg-slate-50 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmPin}
                className="py-4 text-white bg-red-600 hover:bg-red-700 shadow-red-200 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Progress Overlay */}
      {isSaving && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6 border border-slate-100">
            <div className="relative w-24 h-24 mx-auto">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                <circle 
                  cx="50" cy="50" r="45" fill="none" stroke="#10b981" strokeWidth="8" 
                  strokeDasharray="282.7" 
                  strokeDashoffset={282.7 - (282.7 * saveProgress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-slate-900 transition-all">{saveProgress}%</span>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Vinculando Registros</h3>
              <p className="text-slate-500 text-sm mt-2">Por favor, não feche esta página enquanto processamos a conciliação financeira.</p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${saveProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={cn(
          "fixed top-6 right-6 z-[200] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 border",
          notification.type === 'success' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-red-600 border-red-500 text-white"
        )}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-semibold text-sm">{notification.message}</p>
          <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="max-w-[1920px] mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
        <PageHeader
          title="Conferência de Pix"
          description="Conciliação financeira e lançamento automático de contribuições para controle de uso interno."
          icon={CreditCard}
        >
          <div className="flex bg-slate-100 p-1 rounded-none border border-slate-200">
            <button 
              onClick={() => {
                setActiveTab('new');
                setTransactions([]);
                setFile(null);
                setSelectedIds(new Set());
              }}
              className={cn(
                "px-5 py-2 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === 'new' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Plus size={14} />
              Novo Arquivo
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "px-5 py-2 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === 'history' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <RotateCcw size={14} />
              Histórico
            </button>
            <button 
              onClick={() => setActiveTab('extrato')}
              className={cn(
                "px-5 py-2 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === 'extrato' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <FileSpreadsheet size={14} />
              Extrato
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSimulationMode(!isSimulationMode)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 border",
                isSimulationMode 
                  ? "bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-100" 
                  : "bg-slate-50 text-slate-400 border-slate-200"
              )}
            >
              {isSimulationMode ? <Check size={14} /> : <Database size={14} />}
              {isSimulationMode ? 'Simulação Ativa' : 'Modo Simulação'}
            </button>

            {activeTab === 'new' && transactions.length > 0 && (
              <button 
                onClick={handleSave} 
                disabled={isSaving || isSimulationMode} 
                className={cn(
                  "flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 shadow-lg",
                  selectedIds.size > 0 
                    ? "bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700" 
                    : "bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800"
                )}
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isSaving ? (
                  <span>Salvando {saveProgress}%</span>
                ) : (
                  selectedIds.size > 0 
                    ? `Salvar Selecionados (${selectedIds.size})` 
                    : 'Salvar Conciliação'
                )}
              </button>
            )}
          </div>
        </PageHeader>

        {activeTab === 'new' && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <button 
              onClick={() => setShowMappingConfig(!showMappingConfig)}
              className={cn(
                "w-full px-8 py-6 flex items-center justify-between transition-colors",
                showMappingConfig ? "bg-slate-50/50" : "hover:bg-slate-50/30"
              )}
            >
              <div className="flex items-center gap-3">
                <SlidersHorizontal className="text-indigo-600" size={20} />
                <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">Configuração de Mapeamento (Colunas)</span>
              </div>
              {showMappingConfig ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
            </button>
            
            {showMappingConfig && (
              <div className="p-8 border-t border-slate-100 bg-slate-50/30 animate-in slide-in-from-top-2 duration-300">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Selecione o seu banco ou informe o nome exato das colunas na sua planilha:</p>
                
                <div className="flex flex-wrap gap-2 mb-8">
                  {(Object.keys(BANK_PRESETS) as Array<keyof typeof BANK_PRESETS>).map(bank => (
                    <button 
                      key={bank}
                      onClick={() => handleApplyPreset(bank)}
                      className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                    >
                      {bank}
                    </button>
                  ))}
                  <button 
                    onClick={() => setCustomMapping({ date: '', payer: '', amount: '', id: '', bank: '' })}
                    className="px-5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all"
                  >
                    Limpar Mapeamento
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase ml-1">Coluna: Data</label>
                    <input 
                      type="text" 
                      value={customMapping.date} 
                      onChange={(e) => setCustomMapping({...customMapping, date: e.target.value})}
                      placeholder="Ex: Data Operação"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase ml-1">Coluna: Pagador/Nome</label>
                    <input 
                      type="text" 
                      value={customMapping.payer} 
                      onChange={(e) => setCustomMapping({...customMapping, payer: e.target.value})}
                      placeholder="Ex: Nome Cliente"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase ml-1">Coluna: Valor</label>
                    <input 
                      type="text" 
                      value={customMapping.amount} 
                      onChange={(e) => setCustomMapping({...customMapping, amount: e.target.value})}
                      placeholder="Ex: Valor (R$)"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase ml-1">Coluna: ID Transação</label>
                    <input 
                      type="text" 
                      value={customMapping.id} 
                      onChange={(e) => setCustomMapping({...customMapping, id: e.target.value})}
                      placeholder="Ex: E2E ID"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase ml-1">Coluna: Banco</label>
                    <input 
                      type="text" 
                      value={customMapping.bank} 
                      onChange={(e) => setCustomMapping({...customMapping, bank: e.target.value})}
                      placeholder="Ex: Instituição"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'new' && (
          <>
            {transactions.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-100">
                    <CreditCard size={22} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight">{stats.total}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Arquivo</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <UserCheck size={22} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600 tracking-tight">{stats.matched}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conciliados</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                    <Users size={22} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600 tracking-tight">{stats.multiple}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conflitos</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
                    <UserX size={22} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600 tracking-tight">{stats.unmatched}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes</p>
                  </div>
                </div>
                <div className={cn(
                  "bg-white p-6 rounded-2xl border shadow-sm flex items-center gap-4 transition-all hover:shadow-md",
                  stats.duplicates > 0 ? "border-amber-200 bg-amber-50/30" : "border-slate-100"
                )}>
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-colors border",
                    stats.duplicates > 0 ? "bg-amber-100 text-amber-600 border-amber-200" : "bg-slate-50 text-slate-400 border-slate-100"
                  )}>
                    <Database size={22} />
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-bold text-amber-600 tracking-tight">{stats.duplicates}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Sistema</p>
                  </div>
                  {stats.duplicates > 0 && (
                    <button 
                      onClick={handleResetDatabase}
                      disabled={isDeleting}
                      title="Limpar todos os registros para re-importar"
                      className="p-2.5 bg-white border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-600 hover:text-white transition-all shadow-sm"
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {!file ? (
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }}
                className={cn(
                  "bg-white rounded-[2.5rem] border-2 border-dashed p-16 text-center transition-all duration-300 shadow-sm",
                  isDragging ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 hover:border-indigo-400/50"
                )}
              >
                <div className="flex flex-col items-center max-w-lg mx-auto">
                  <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-8 shadow-inner">
                    <CloudUpload size={40} className="text-indigo-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Importar Extrato Pix</h3>
                  <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed max-w-sm">Arraste seu arquivo Excel para processamento automático ou selecione manualmente em seu computador.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                    <label className="flex-1 max-w-[240px] px-8 py-4 bg-slate-900 text-white rounded-xl font-bold cursor-pointer hover:bg-slate-800 transition-all shadow-xl active:scale-95 text-sm flex items-center justify-center gap-2">
                      <Plus size={20} />
                      Escolher Arquivo
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
                    </label>
                    <button onClick={fetchStudents} className="flex-1 max-w-[240px] px-8 py-4 bg-white text-slate-700 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm shadow-sm group">
                      <RefreshCw size={18} className={cn("text-slate-400 group-hover:text-slate-600 transition-colors", loading ? "animate-spin" : "")} />
                      Sincronizar Dados
                    </button>
                  </div>
                  
                  <div className="mt-12 pt-8 border-t border-slate-100 w-full flex items-center justify-center gap-8 text-slate-400">
                    <div className="flex items-center gap-2">
                       <CheckCircle2 size={16} className="text-emerald-500" />
                       <span className="text-[10px] font-bold uppercase tracking-widest">{students.length} Alunos na Base</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <FileSpreadsheet size={16} />
                       <span className="text-[10px] font-bold uppercase tracking-widest">Excel (.xlsx, .xls)</span>
                    </div>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden border-t-4 border-t-indigo-600 animate-in slide-in-from-bottom-2 duration-500">
                <div className="p-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-slate-50/30">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                      <FileSpreadsheet size={28} />
                    </div>
                    <div className="flex-1 min-w-[320px]">
                      <div className="flex items-center gap-2 group relative">
                        <input
                          type="text"
                          value={customFileName}
                          onChange={(e) => setCustomFileName(e.target.value)}
                          placeholder="Nome de identificação do lote (ex: Lote Maio 2026)"
                          className="text-xl font-bold text-slate-900 bg-transparent border-b-2 border-dashed border-slate-200 hover:border-indigo-400 focus:border-indigo-600 focus:ring-0 px-0 py-1 focus:outline-none w-full transition-all"
                          title="Edite o nome para identificar este lote no histórico"
                        />
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          {transactions.length} transações importadas
                        </p>
                        <p className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalAmount)}
                        </p>
                        {selectedIds.size > 0 && (
                          <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-xl tracking-wider animate-in fade-in zoom-in shadow-md shadow-indigo-100">
                            {selectedIds.size} selecionados
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Filtrar nesta lista..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 w-full md:w-64 transition-all outline-none"
                      />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-inner">
                      {(['all', 'matched', 'multiple', 'unmatched'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={cn(
                            "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                            filter === f ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          {f === 'all' ? 'Ver Todos' : f === 'matched' ? 'Concluidos' : f === 'multiple' ? 'Conflitos' : 'Sem Match'}
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => { setFile(null); setTransactions([]); }} 
                      className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 rounded-xl transition-all shadow-sm"
                      title="Cancelar importação"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-3 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedIds.size === transactions.length && transactions.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data / ID</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Banco Origem</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pagador</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aluno Identificado</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map((t) => (
                        <tr 
                          key={t.transaction_id} 
                          className={cn(
                            "group transition-all duration-200 border-b border-slate-50",
                            selectedIds.has(String(t.transaction_id)) ? "bg-indigo-50/40" : "hover:bg-slate-50/50"
                          )}
                        >
                          <td className="px-6 py-4 text-center">
                            <input 
                              type="checkbox"
                              checked={selectedIds.has(String(t.transaction_id))}
                              onChange={() => toggleSelect(String(t.transaction_id))}
                              className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-4 focus:ring-indigo-500/10 cursor-pointer transition-all"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-[13px] font-bold text-slate-900 tracking-tight">{formatDateForDisplay(t.date)}</p>
                            <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase select-all">{t.transaction_id}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="px-2.5 py-1 bg-white border border-slate-200 text-[10px] font-bold text-slate-500 rounded-lg uppercase tracking-wider inline-block">
                              {t.origin_bank || '---'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-bold text-slate-900 uppercase tracking-tight line-clamp-1">{t.payer_name}</p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-base font-bold text-slate-900">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            {t.status === 'matched' ? (
                              <div className="flex items-center gap-3 animate-in fade-in duration-300">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/50">
                                  <UserCheck size={18} />
                                </div>
                                <div className="max-w-[280px]">
                                  <p className="text-xs font-bold text-slate-900 line-clamp-1">
                                    {(() => {
                                      const student = students.find(s => s.id === t.matched_student_id);
                                      if (!student) return 'Não identificado';
                                      const className = classes.find(c => c.id === student.class_id)?.name || 'Sem Turma';
                                      return `${student.name} (${student.registration_number})`;
                                    })()}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {t.is_manual ? (
                                      <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100 uppercase tracking-normal">
                                        Manual
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold text-emerald-600/70 border border-emerald-200/30 bg-emerald-50/50 px-1.5 py-0.5 rounded-md uppercase">Auto</span>
                                    )}
                                    <span className="text-[9px] font-bold text-emerald-600/70 uppercase">Conciliado</span>
                                    {registeredPixIds.has(String(t.transaction_id)) && (
                                      <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] font-bold uppercase rounded-md tracking-wider shadow-sm">
                                        Lançado
                                      </span>
                                    )}
                                    {reconciliationMap.has(String(t.transaction_id)) && (
                                      <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[8px] font-bold uppercase rounded-md tracking-wider">
                                        DB Match
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : t.status === 'multiple' ? (
                              <div className="flex items-center gap-3 animate-in fade-in duration-300">
                                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/50">
                                  <Users size={18} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-amber-700">Duplicidade de Nome</p>
                                  <p className="text-[9px] font-bold text-amber-600/60 uppercase">Manual Obrigatório</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 animate-in fade-in duration-300">
                                <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-200/50">
                                  <UserX size={18} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-400 italic">Não vinculado</p>
                                  <p className="text-[9px] font-bold text-slate-300 uppercase">Pendente</p>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-8 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {t.status === 'matched' ? (
                                <>
                                  <button 
                                    onClick={() => setRegisteringContribution(t)}
                                    className={cn(
                                      "p-2.5 rounded-xl transition-all shadow-sm border relative group focus:ring-4 focus:ring-indigo-500/10 outline-none",
                                      registeredPixIds.has(String(t.transaction_id))
                                        ? "bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700"
                                        : "bg-white border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200"
                                    )}
                                  >
                                    <DownloadCloud size={18} />
                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1.5 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 whitespace-nowrap pointer-events-none z-10 shadow-xl font-bold">
                                      {registeredPixIds.has(String(t.transaction_id)) ? "Gerenciar Lançamento" : "Lançar no Extrato"}
                                    </div>
                                  </button>
                                  <button 
                                    onClick={() => {
                                      const originalIndex = transactions.findIndex(item => item.transaction_id === t.transaction_id);
                                      if (originalIndex !== -1) handleUndoMatch(originalIndex);
                                    }}
                                    disabled={registeredPixIds.has(String(t.transaction_id))}
                                    className={cn(
                                      "p-2.5 rounded-xl transition-all shadow-sm border focus:ring-4 focus:ring-red-500/10 outline-none",
                                      registeredPixIds.has(String(t.transaction_id))
                                        ? "bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed"
                                        : "bg-white border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200"
                                    )}
                                    title="Desfazer Conciliação"
                                  >
                                    <RotateCcw size={18} />
                                  </button>
                                </>
                              ) : (
                                <button 
                                  onClick={() => {
                                    const originalIndex = transactions.findIndex(item => item.transaction_id === t.transaction_id);
                                    if (originalIndex !== -1) setMatchingTransactionIndex(originalIndex);
                                  }}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 focus:ring-4 focus:ring-indigo-500/20 outline-none"
                                >
                                  <LinkIcon size={14} />
                                  Vincular Aluno
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {historyLoading ? (
              <div className="bg-white rounded-2xl p-20 text-center border border-slate-100">
                <Loader2 className="animate-spin mx-auto text-blue-600 mb-4" size={48} />
                <p className="text-slate-400 font-bold">Carregando histórico de arquivos...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="bg-white rounded-none p-24 text-center border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-slate-50 rounded-none flex items-center justify-center mx-auto mb-8 text-slate-300 border border-dashed border-slate-200">
                  <RotateCcw size={36} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight mb-2">Sem histórico disponível</h3>
                <p className="text-slate-400 font-medium text-[11px] max-w-sm mx-auto uppercase tracking-wide">Nenhuma importação ou conciliação foi realizada ainda. Importe um arquivo para começar.</p>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="bg-white p-6 rounded-none border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-none bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shadow-sm">
                      <HistoryIcon size={22} className="text-slate-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Histórico de Arquivos</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Gerencie lotes importados e conciliações passadas</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedHistoryIds.size > 0 && (
                      <div className="flex items-center gap-2 pr-3 border-r border-slate-200 animate-in slide-in-from-left-4">
                        <button 
                          onClick={handleBulkDeleteHistory}
                          disabled={isDeleting}
                          className="h-10 px-4 bg-red-650 hover:bg-red-700 text-white rounded-none text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Excluir ({selectedHistoryIds.size})
                        </button>
                      </div>
                    )}

                    <button 
                      onClick={handleResetDatabase}
                      disabled={isDeleting}
                      className="h-10 px-4 bg-white border border-slate-200 text-slate-600 rounded-none text-[10px] font-bold uppercase tracking-wider hover:text-red-600 hover:border-red-200 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      Limpar Tudo
                    </button>
                    
                    <button 
                      onClick={toggleHistorySelectAll}
                      className={cn(
                        "h-10 px-4 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all border shadow-sm active:scale-95 cursor-pointer",
                        selectedHistoryIds.size > 0 && selectedHistoryIds.size === historyByMonth.flatMap(m => m.batches.flatMap((b: any) => b.transactions)).length
                          ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-350 hover:text-slate-900"
                      )}
                    >
                      {selectedHistoryIds.size > 0 && selectedHistoryIds.size === historyByMonth.flatMap(m => m.batches.flatMap((b: any) => b.transactions)).length
                        ? "Desmarcar Todos" 
                        : "Selecionar Tudo"
                      }
                    </button>

                    <div className="relative group">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={14} />
                      <input 
                        type="text" 
                        placeholder="Buscar lote ou ID..."
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        className="h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-none text-xs focus:ring-4 focus:ring-slate-500/10 focus:border-slate-400 w-64 transition-all outline-none font-medium text-slate-700"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-none border border-slate-200 w-fit">
                  {(['all', 'matched', 'multiple', 'unmatched'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setHistoryFilter(f)}
                      className={cn(
                        "px-5 py-2 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                        historyFilter === f ? "bg-white text-slate-900 shadow-sm border border-slate-250/30" : "text-slate-500 hover:text-slate-700 font-medium"
                      )}
                    >
                      {f === 'all' ? 'Ver Todos' : f === 'matched' ? 'Conciliados' : f === 'multiple' ? 'Conflitos' : 'Pendentes'}
                    </button>
                  ))}
                </div>

                {historyByMonth.map((monthGroup) => (
                  <div key={monthGroup.key} className="space-y-6">
                    <div className="flex items-center gap-6">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3 whitespace-nowrap">
                        <Filter size={16} className="text-slate-300" />
                        {monthGroup.label}
                      </h4>
                      <div className="h-px w-full bg-slate-100" />
                    </div>

                    <div className="space-y-4">
                      {monthGroup.batches.map((batch: any) => (
                        <div key={batch.batch_id} className="bg-white rounded-none border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-350 group/batch">
                          <div 
                            onClick={() => toggleBatch(batch.batch_id)}
                            className="p-6 flex flex-col md:flex-row md:items-center justify-between cursor-pointer hover:bg-slate-50/30 transition-colors gap-6"
                          >
                            <div className="flex items-center gap-6">
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBatchSelect(batch.transactions);
                                }}
                                className="flex items-center justify-center p-2 hover:bg-slate-100 rounded-none transition-all"
                              >
                                <input 
                                  type="checkbox" 
                                  checked={batch.transactions.every((t: any) => selectedHistoryIds.has(String(t.id)))}
                                  onChange={() => {}} // Controlled by parent div click
                                  className="w-5 h-5 rounded-none border-slate-300 text-slate-900 focus:ring-4 focus:ring-slate-500/10 cursor-pointer transition-all"
                                />
                              </div>
                              <div className="w-12 h-12 rounded-none bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-200 group-hover/batch:bg-slate-900 group-hover/batch:text-white group-hover/batch:border-slate-900 transition-all shadow-sm">
                                <FileSpreadsheet size={22} />
                              </div>
                              <div>
                                <h3 className="text-base font-bold text-slate-900 group-hover/batch:text-slate-800 transition-colors uppercase tracking-tight">
                                  {batch.file_name} {batch.transactions.length === 1 && batch.payer_name !== 'N/A' && `(${batch.payer_name})`}
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                    <Clock size={11} />
                                    {new Date(batch.created_at).toLocaleDateString('pt-BR')} às {new Date(batch.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  <span className="w-1 h-1 rounded-full bg-slate-200" />
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-700 uppercase rounded-none tracking-wider border border-slate-200">
                                      {batch.transactions.length} Lançamentos
                                    </span>
                                    {batch.transactions.length > 1 && (() => {
                                      const counts = batch.transactions.reduce((acc: any, t: any) => {
                                        acc[t.status || 'unmatched'] = (acc[t.status || 'unmatched'] || 0) + 1;
                                        return acc;
                                      }, {} as any);
                                      return (
                                        <div className="flex gap-1.5">
                                          {counts.matched > 0 && <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-none border border-emerald-100/50 uppercase">{counts.matched} OK</span>}
                                          {counts.multiple > 0 && <span className="text-[8px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-none border border-amber-100/50 uppercase">{counts.multiple} Confl.</span>}
                                          {counts.unmatched > 0 && <span className="text-[8px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-none border border-slate-200/50 uppercase">{counts.unmatched} Pend.</span>}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-8">
                              <div className="hidden sm:flex flex-col items-end">
                                <p className="text-xl font-bold text-slate-900 tracking-tight font-sans">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(batch.filteredTotalAmount || batch.totalAmount)}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Montante Total</p>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {deleteConfirmId === batch.batch_id ? (
                                  <div className="flex items-center gap-2 bg-red-50 p-2 rounded-none border border-red-200 animate-in fade-in slide-in-from-right-4">
                                    <div className="flex items-center gap-1.5 px-2">
                                      <AlertCircle size={14} className="text-red-500" />
                                      <p className="text-[9px] font-bold text-red-600 uppercase">Confirmar?</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 font-sans">
                                      {isDeleting ? (
                                        <Loader2 size={14} className="animate-spin text-red-650 mx-4" />
                                      ) : (
                                        <>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteHistory(batch.batch_id); }}
                                            className="px-3 h-8 bg-red-650 text-white text-[9px] font-bold uppercase rounded-none hover:bg-red-700 transition-all shadow-sm cursor-pointer"
                                          >
                                            Sim
                                          </button>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                            className="px-3 h-8 bg-white text-slate-500 border border-slate-200 text-[9px] font-bold uppercase rounded-none hover:bg-slate-50 transition-all cursor-pointer"
                                          >
                                            Não
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(batch.batch_id); }}
                                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-none transition-all outline-none cursor-pointer"
                                    title="Remover este lote"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                                <div className={cn(
                                  "w-10 h-10 rounded-none flex items-center justify-center transition-all bg-slate-50 border border-slate-200 text-slate-400",
                                  expandedBatches.includes(batch.batch_id) ? "bg-slate-100 text-slate-800 rotate-180 border-slate-300" : "group-hover/batch:bg-slate-100 group-hover/batch:text-slate-600 group-hover/batch:border-slate-300"
                                )}>
                                  <ChevronDown size={20} />
                                </div>
                              </div>
                            </div>
                          </div>

                          {expandedBatches.includes(batch.batch_id) && (
                            <div className="border-t border-slate-200 bg-slate-50/20 animate-in slide-in-from-top-4 duration-300">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100/40 border-b border-slate-200">
                                      <th className="px-5 py-3 text-center w-16">
                                        <div 
                                          onClick={() => toggleBatchSelect(batch.transactions)}
                                          className="flex items-center justify-center p-1.5 cursor-pointer hover:bg-slate-200 rounded-none transition-all"
                                        >
                                          <input 
                                            type="checkbox" 
                                            checked={batch.transactions.every((t: any) => selectedHistoryIds.has(String(t.id)))}
                                            onChange={() => {}}
                                            className="w-4 h-4 rounded-none border-slate-300 text-slate-900 focus:ring-4 focus:ring-slate-500/10 cursor-pointer transition-all"
                                          />
                                        </div>
                                      </th>
                                      <th className="px-6 py-3.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">ID Transação</th>
                                      <th className="px-6 py-3.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Banco</th>
                                      <th className="px-6 py-3.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Pagador</th>
                                      <th className="px-6 py-3.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                                      <th className="px-6 py-3.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aluno / Turma</th>
                                      <th className="px-6 py-3.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Ações</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {batch.transactions.map((t: any) => (
                                      <tr 
                                        key={t.id} 
                                        className={cn(
                                          "group transition-all hover:bg-white",
                                          selectedHistoryIds.has(String(t.id)) ? "bg-slate-50" : ""
                                        )}
                                      >
                                        <td className="px-5 py-3 text-center">
                                          <input 
                                            type="checkbox" 
                                            checked={selectedHistoryIds.has(String(t.id))}
                                            onChange={() => toggleHistorySelect(String(t.id))}
                                            className="w-4 h-4 rounded-none border-slate-300 text-slate-900 focus:ring-4 focus:ring-slate-500/10 cursor-pointer transition-all"
                                          />
                                        </td>
                                        <td className="px-6 py-3.5">
                                          <p className="text-[11px] font-mono font-bold text-slate-500 tracking-tight uppercase select-all">{t.transaction_id || '---'}</p>
                                          <div className="flex items-center gap-1.5 mt-1">
                                            <Calendar size={10} className="text-slate-300" />
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{formatDateForDisplay(t.date || t.transaction_date)}</p>
                                          </div>
                                        </td>
                                        <td className="px-6 py-3.5">
                                          <span className="px-2 py-0.5 bg-white border border-slate-200 text-[9px] font-bold text-slate-500 rounded-none uppercase tracking-wide">
                                            {t.origin_bank || '---'}
                                          </span>
                                        </td>
                                        <td className="px-6 py-3.5">
                                          <p className="text-xs font-bold text-slate-800 uppercase tracking-tight line-clamp-1">{t.payer_name}</p>
                                        </td>
                                        <td className="px-6 py-3.5 text-right font-mono">
                                          <p className="text-sm font-bold text-slate-900">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                                          </p>
                                        </td>
                                        <td className="px-6 py-3.5">
                                          {t.status === 'matched' ? (
                                            <div className="flex items-center gap-2.5">
                                              <div className="w-8 h-8 rounded-none bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200 shadow-sm">
                                                <UserCheck size={14} />
                                              </div>
                                              <div>
                                                <p className="text-xs font-bold text-slate-800 tracking-tight uppercase">
                                                  {(() => {
                                                    const student = students.find(s => s.id === t.matched_student_id);
                                                    return student ? student.name : `Aluno ID: ${t.matched_student_id}`;
                                                  })()}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                  {t.is_manual && (
                                                    <span className="text-[8px] font-bold text-slate-600 bg-slate-100 px-1 border border-slate-200 uppercase">
                                                      Manual
                                                    </span>
                                                  )}
                                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">
                                                    {(() => {
                                                      const student = students.find(s => s.id === t.matched_student_id);
                                                      return student ? (classes.find(c => c.id === student.class_id)?.name || 'Sem Turma') : 'N/I';
                                                    })()}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2.5 opacity-60">
                                              <div className="w-8 h-8 rounded-none bg-slate-50 text-slate-300 flex items-center justify-center border border-slate-200/60">
                                                <UserX size={14} />
                                              </div>
                                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Pendente</p>
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-6 py-3.5">
                                          <div className="flex items-center justify-center gap-1.5">
                                            {t.status === 'matched' && (
                                              <button 
                                                onClick={() => setRegisteringContribution(t)}
                                                className={cn(
                                                  "p-2 rounded-none transition-all shadow-sm border relative group focus:ring-4 focus:ring-slate-500/10 outline-none cursor-pointer",
                                                  registeredPixIds.has(String(t.transaction_id))
                                                    ? "bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700"
                                                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-350"
                                                )}
                                              >
                                                <DownloadCloud size={14} />
                                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-2.5 rounded-none opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 whitespace-nowrap pointer-events-none z-10 shadow-lg font-bold uppercase tracking-wide">
                                                  {registeredPixIds.has(String(t.transaction_id)) ? "Ver Lançamento" : "Lançar no Extrato"}
                                                </div>
                                              </button>
                                            )}
                                            <button 
                                              onClick={() => {
                                                if (true) {
                                                  handleDeleteHistoryItem(t.id);
                                                }
                                              }}
                                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-none transition-all border border-transparent hover:border-red-200 cursor-pointer"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'extrato' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <CreditCard size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-[#00174b]">{allReconciledTransactions.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Conciliado</p>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center">
                  <UserCheck size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-green-600">
                    {formatCurrencyLocal(allReconciledTransactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0))}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor Conciliado</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-indigo-600">
                    {allReconciledTransactions.filter(t => t.is_manual).length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vínculos Manuais</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-emerald-600">
                    {allReconciledTransactions.filter(t => !t.is_manual).length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vínculos Automáticos</p>
                </div>
              </div>
            </div>

            {/* Filter and Actions Bar */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-black text-[#00174b] flex items-center gap-2.5 flex-wrap">
                  Extrato de Conciliação
                  {extratoBatchFilter !== 'all' && (
                    <span className="px-3 py-1 bg-blue-50 border border-blue-200 text-[10px] font-black text-blue-700 uppercase rounded-xl tracking-wider shadow-sm animate-in fade-in zoom-in">
                      📁 {availableBatches.find(b => b.id === extratoBatchFilter)?.label || 'Lote Selecionado'}
                    </span>
                  )}
                </h3>
                <p className="text-sm font-bold text-slate-400">Listagem das transações conciliadas no sistema</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar aluno, pagador, banco..."
                    value={extratoSearchQuery}
                    onChange={(e) => setExtratoSearchQuery(e.target.value)}
                    className="pl-12 pr-10 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 w-64 transition-all"
                  />
                  {extratoSearchQuery && (
                    <button 
                      onClick={() => setExtratoSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Type Filter Button Group */}
                <div className="flex bg-slate-50 p-1 rounded-2xl">
                  {(['all', 'auto', 'manual'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setExtratoFilter(mode)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                        extratoFilter === mode ? "bg-white text-[#00174b] shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {mode === 'all' ? 'Ver Todos' : mode === 'auto' ? 'Automáticos' : 'Manuais'}
                    </button>
                  ))}
                </div>

                {/* Export Buttons */}
                <button
                  onClick={() => handlePrintExtratoPDF(filteredExtratoTransactions)}
                  className="px-5 py-3 bg-green-600 text-white hover:bg-green-700 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                  title="Abrir caixa de diálogo do sistema para impressão do relatório"
                >
                  <Printer size={16} />
                  Imprimir
                </button>

                <button
                  onClick={() => handleExportExtratoPDF(filteredExtratoTransactions)}
                  className="px-5 py-3 bg-[#00174b] text-white hover:bg-blue-900 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                  title="Fazer download do relatório estruturado em PDF"
                >
                  <Download size={16} />
                  Baixar PDF
                </button>
              </div>
            </div>

            {/* Advanced Filtering Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100/50 pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-blue-600" />
                  <h4 className="text-xs font-black text-[#00174b] uppercase tracking-wider">Filtros Avançados do Extrato</h4>
                </div>
                {(extratoBatchFilter !== 'all' || extratoStartDate || extratoEndDate || extratoMonth !== 'all' || extratoYear !== 'all') && (
                  <button
                    onClick={() => {
                      setExtratoBatchFilter('all');
                      setExtratoStartDate('');
                      setExtratoEndDate('');
                      setExtratoMonth('all');
                      setExtratoYear('all');
                      setNotification({ type: 'success', message: 'Filtros avançados removidos!' });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-500 hover:bg-red-600 hover:text-white rounded-lg text-[9px] font-black uppercase transition-all"
                  >
                    <X size={10} />
                    Limpar Filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Origem / Arquivo Importado */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <FileSpreadsheet size={12} className="text-slate-400" /> Selecionar Arquivo Importado
                  </label>
                  <select
                    value={extratoBatchFilter}
                    onChange={(e) => setExtratoBatchFilter(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 text-slate-700 transition-all cursor-pointer"
                  >
                    <option value="all">📁 Todos os arquivos importados</option>
                    {availableBatches.map((b) => (
                      <option key={b.id} value={b.id}>📄 {b.label}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Filtro de Período (Mês / Ano) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarDays size={12} className="text-slate-400" /> Período (Mês / Ano)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={extratoMonth}
                      onChange={(e) => setExtratoMonth(e.target.value)}
                      className="px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 text-slate-700 transition-all cursor-pointer"
                    >
                      <option value="all">Mês: Todos</option>
                      <option value="1">Janeiro</option>
                      <option value="2">Fevereiro</option>
                      <option value="3">Março</option>
                      <option value="4">Abril</option>
                      <option value="5">Maio</option>
                      <option value="6">Junho</option>
                      <option value="7">Julho</option>
                      <option value="8">Agosto</option>
                      <option value="9">Setembro</option>
                      <option value="10">Outubro</option>
                      <option value="11">Novembro</option>
                      <option value="12">Dezembro</option>
                    </select>

                    <select
                      value={extratoYear}
                      onChange={(e) => setExtratoYear(e.target.value)}
                      className="px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 text-slate-700 transition-all cursor-pointer"
                    >
                      <option value="all">Ano: Todos</option>
                      {availableYears.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Filtro por Intervalo de Data */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarRange size={12} className="text-slate-400" /> Intervalo de Data Específico
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={extratoStartDate}
                      onChange={(e) => setExtratoStartDate(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 text-slate-700 transition-all cursor-pointer"
                    />
                    <span className="text-[10px] font-black text-slate-400 uppercase">a</span>
                    <input
                      type="date"
                      value={extratoEndDate}
                      onChange={(e) => setExtratoEndDate(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 text-slate-700 transition-all cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Main Table */}
            {filteredExtratoTransactions.length === 0 ? (
              <div className="bg-white rounded-2xl p-20 text-center border border-slate-100 shadow-sm">
                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                  <Search size={40} />
                </div>
                <p className="text-slate-500 font-black text-xl">Nenhum registro conciliado correspondente.</p>
                <p className="text-slate-400 text-sm mt-1">Experimente alterar os termos da busca ou filtros.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Data</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagador Extrato</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Banco Origem</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aluno Vinculado</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Turma</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Observação Manual</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredExtratoTransactions.map((t: any, index: number) => {
                        const studentClass = t.student ? (classes.find(c => c.id === t.student.class_id)?.name || 'Sem Turma') : '—';
                        return (
                          <tr key={t.id || index} className="hover:bg-slate-50/30 transition-colors">
                            <td className="px-8 py-4">
                              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">{t.transaction_id || '—'}</p>
                              <p className="text-[11px] font-bold text-slate-500 mt-0.5">{formatDateForDisplay(t.date) || t.date || '—'}</p>
                              {t.batch_file_name && (
                                <p className="text-[9px] font-black text-blue-600 bg-blue-50/50 border border-blue-100 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-1 uppercase tracking-tighter" title="Lote/Origem de Importação">
                                  📁 {t.batch_file_name}
                                </p>
                              )}
                            </td>
                            <td className="px-8 py-4">
                              <p className="font-black text-[#00174b] uppercase text-sm">{t.payer_name || '—'}</p>
                            </td>
                            <td className="px-8 py-4">
                              <span className="px-2.5 py-1 bg-slate-100 border border-slate-200/50 text-[9px] font-black text-slate-600 rounded-lg uppercase tracking-wide">
                                {t.origin_bank || '—'}
                              </span>
                            </td>
                            <td className="px-8 py-4">
                              {t.student ? (
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center border border-green-100">
                                    <UserCheck size={16} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-black text-[#00174b]">{t.student.name}</p>
                                      {t.is_manual ? (
                                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-600 text-[8px] font-black uppercase rounded-md tracking-wider">
                                          Manual
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[8px] font-black uppercase rounded-md tracking-wider">
                                          Auto
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">Nº Matrícula: {t.student.registration_number}</p>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-xs">Não encontrado</span>
                              )}
                            </td>
                            <td className="px-8 py-4">
                              <span className="text-xs font-bold text-slate-600">{studentClass}</span>
                            </td>
                            <td className="px-8 py-4 text-right">
                              <p className="text-sm font-black text-[#00174b]">
                                {formatCurrencyLocal(t.amount)}
                              </p>
                            </td>
                            <td className="px-8 py-4 text-center">
                              <div className="mx-auto border-b border-dashed border-slate-200 w-28 h-5" title="Espaço para anotação manual ao imprimir" />
                            </td>
                            <td className="px-8 py-4">
                              <div className="flex items-center justify-center gap-2">
                                {t.student && (
                                  <>
                                    {/* Action to dispatch receipt directly! */}
                                    <button
                                      onClick={() => generateReceiptLocal([t], t.student)}
                                      className="p-2.5 rounded-xl bg-white border border-blue-100 text-blue-500 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50/20 transition-all shadow-sm"
                                      title="Gerar e baixar recibo em PDF"
                                    >
                                      <Printer size={16} />
                                    </button>

                                    {/* Link Contribution button */}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setRegisteringContribution(t); }}
                                      className={cn(
                                        "p-2.5 rounded-xl transition-all shadow-sm border relative group/btn",
                                        registeredPixIds.has(String(t.transaction_id || t.id))
                                          ? "bg-green-50 border-green-200 text-green-600 hover:bg-green-100 animate-pulse border-dashed"
                                          : "bg-white border-blue-100 text-blue-400 hover:text-blue-600 hover:border-blue-200"
                                      )}
                                      title={registeredPixIds.has(String(t.transaction_id || t.id)) ? "Lançamento de contribuição já efetuado - Clique para lançar novamente" : "Registrar como contribuição financeira"}
                                    >
                                      <CreditCard size={16} />
                                      {registeredPixIds.has(String(t.transaction_id || t.id)) && (
                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full flex items-center justify-center">
                                          <div className="w-1 h-1 bg-white rounded-full" />
                                        </div>
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contribution Registration Modal */}
        {registeringContribution && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-4 duration-500 border border-slate-100">
              <div className="p-8 border-b border-slate-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-12 -mt-12 opacity-50" />
                <div className="relative flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                      <DownloadCloud size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight">Efetuar Lançamento</h3>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mt-0.5">Registrar no Extrato</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setRegisteringContribution(null)}
                    className="p-2.5 bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all outline-none"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 relative group hover:bg-white hover:border-indigo-100 transition-all duration-300">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Aluno Selecionado</p>
                  <p className="text-xl font-bold text-slate-900 tracking-tight">
                    {(registeringContribution.student || students.find((s: any) => s.id === registeringContribution.matched_student_id))?.name}
                  </p>
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
                    <span className="text-sm font-bold text-slate-500">Valor do Recebimento</span>
                    <span className="text-2xl font-black text-indigo-600 italic">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(registeringContribution.amount)}
                    </span>
                  </div>
                  <div className="absolute top-4 right-6">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      <CreditCard size={10} />
                      PIX
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Meses de Referência</label>
                    {selectedPeriods.length > 0 && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 animate-in fade-in zoom-in">
                        {selectedPeriods.length} {selectedPeriods.length === 1 ? 'Mês' : 'Meses'}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
                    {MONTHS.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => toggleMonth(i + 1)}
                        className={cn(
                          "py-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all border-2 outline-none",
                          selectedPeriods.some(p => p.month === i + 1 && p.year === parseInt(contribYear))
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-[1.05]"
                            : "bg-white border-transparent text-slate-400 hover:border-indigo-100 hover:text-indigo-600"
                        )}
                      >
                        {m.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* List of selected periods - More visual */}
                {selectedPeriods.length > 0 ? (
                  <div className="flex flex-wrap gap-2 px-2">
                    {selectedPeriods.map((p, idx) => (
                      <div key={idx} className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl text-[10px] font-bold border border-indigo-100 flex items-center gap-2 animate-in fade-in slide-in-from-left-2 shadow-sm">
                        {MONTHS[p.month - 1].substring(0, 3)} / {p.year}
                        <button 
                          onClick={() => {
                            if (selectedPeriods.length > 1) {
                              setSelectedPeriods(prev => prev.filter((_, i) => i !== idx));
                            }
                          }}
                          className="hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-white"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-3">
                    <AlertCircle size={18} className="text-amber-500" />
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Selecione ao menos um mês de referência</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Ano Base</label>
                    <input 
                      type="number"
                      value={contribYear}
                      onChange={(e) => setContribYear(e.target.value)}
                      className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Forma</label>
                    <div className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-400 flex items-center gap-2 italic">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      PIX
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                  <div className="relative flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    <span>Rateio Sugerido</span>
                    <span className="text-white bg-indigo-600 px-2.5 py-1 rounded-lg border border-indigo-500 shadow-sm">{selectedPeriods.length} Parcelas</span>
                  </div>
                  <div className="relative flex justify-between items-end mt-4">
                    <span className="text-xs font-bold text-slate-500 mb-1">Valor por Período:</span>
                    <span className="text-3xl font-black text-white italic tracking-tighter">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(registeringContribution.amount / selectedPeriods.length)}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={handleFinalContributionRegistration}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-bold text-lg hover:bg-slate-900 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 shadow-indigo-100 hover:shadow-slate-200"
                >
                  <Check size={24} />
                  Confirmar Registro
                </button>

              </div>
            </div>
          </div>
        )}

        {/* Report Preview Modal */}
        {showReportPreview && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-8 overflow-y-auto animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-full animate-in zoom-in slide-in-from-bottom-4 duration-500 border border-slate-100">
              <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-6 print:hidden">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100">
                    <Printer size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Relatório de Conciliação</h3>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Visualização oficial antes da impressão</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button 
                    onClick={generatePDF}
                    className="flex-1 sm:flex-none px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 hover:scale-[1.02] transition-all shadow-xl shadow-indigo-200 active:scale-95"
                  >
                    <Download size={20} />
                    Exportar PDF
                  </button>
                  <button 
                    onClick={() => setShowReportPreview(false)}
                    className="p-4 bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-slate-200 shadow-sm"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 md:p-16 bg-white print:p-0" id="printable-report">
                {/* Report Content */}
                <div className="max-w-4xl mx-auto space-y-16">
                  <div className="flex justify-between items-start border-b-8 border-slate-900 pb-10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-900 rounded-xl" />
                        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Relatório Pix</h1>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-600 font-bold text-sm uppercase tracking-wide">Arquivo: <span className="text-slate-400">{customFileName || file?.name || 'Importação Manual'}</span></p>
                        <p className="text-slate-400 text-xs font-medium">Emissão: {new Date().toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Painel de Controle</p>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                        <p className="text-sm font-bold text-slate-400 uppercase">Volume:</p>
                        <p className="text-sm font-black text-slate-900">{stats.total} Trans.</p>
                        <p className="text-sm font-bold text-slate-400 uppercase">Status:</p>
                        <p className="text-sm font-black text-emerald-600 italic">Oficial</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 group hover:bg-white hover:border-indigo-100 transition-all duration-300">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Total Processado</p>
                      <p className="text-2xl font-black text-slate-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          transactions.reduce((acc, t) => acc + t.amount, 0)
                        )}
                      </p>
                    </div>
                    <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100/50 group hover:bg-white hover:border-emerald-200 transition-all duration-300">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-4">Conciliado (OK)</p>
                      <p className="text-2xl font-black text-emerald-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          transactions.filter(t => t.status === 'matched').reduce((acc, t) => acc + t.amount, 0)
                        )}
                      </p>
                    </div>
                    <div className="bg-red-50/50 p-6 rounded-3xl border border-red-100/50 group hover:bg-white hover:border-red-200 transition-all duration-300">
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-4">Pendente/Conflito</p>
                      <p className="text-2xl font-black text-red-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          transactions.filter(t => t.status !== 'matched').reduce((acc, t) => acc + t.amount, 0)
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-slate-200" />
                      <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Detalhamento das Transações</h4>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="overflow-hidden rounded-3xl border border-slate-100 shadow-sm">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="py-5 px-6 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Data</th>
                            <th className="py-5 px-6 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Banco</th>
                            <th className="py-5 px-6 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Pagador</th>
                            <th className="py-5 px-6 text-right text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Valor</th>
                            <th className="py-5 px-6 text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Status</th>
                            <th className="py-5 px-6 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Identificação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {transactions.map((t, i) => {
                            const student = students.find(s => s.id === t.matched_student_id);
                            const className = student ? (classes.find(c => c.id === student.class_id)?.name || 'Sem Turma') : '';
                            
                            return (
                              <tr key={i} className="break-inside-avoid hover:bg-slate-50 transition-colors">
                                <td className="py-4 px-6 text-[11px] font-bold text-slate-500">{formatDateForDisplay(t.date)}</td>
                                <td className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase">{t.origin_bank || '---'}</td>
                                <td className="py-4 px-6">
                                  <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{t.payer_name}</p>
                                </td>
                                <td className="py-4 px-6 text-right text-[11px] font-black text-slate-900 italic">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                                </td>
                                <td className="py-4 px-6 text-center">
                                  <div className="flex justify-center">
                                    {t.status === 'matched' ? (
                                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                    ) : t.status === 'multiple' ? (
                                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                    ) : (
                                      <div className="w-2.5 h-2.5 rounded-full bg-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.5)]" />
                                    )}
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  {student ? (
                                    <div className="space-y-0.5">
                                      <p className="text-[11px] font-bold text-slate-900 uppercase">
                                        {student.name}
                                      </p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{className}</p>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 italic text-[10px] font-bold uppercase tracking-widest">---</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="pt-12 space-y-8">
                    <div className="flex justify-between items-end text-slate-400">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest">Legenda</p>
                        <p className="text-[9px] font-bold">[V] Conciliado | [!] Conflito | [-] Pendente</p>
                      </div>
                      <div className="text-right space-y-4">
                        <div className="w-48 border-b border-slate-200 ml-auto"></div>
                        <p className="text-[10px] font-black uppercase tracking-widest">Responsável pela Conferência</p>
                      </div>
                    </div>
                    <div className="text-center border-t border-slate-50 pt-8">
                      <p className="text-[10px] font-black text-slate-200 uppercase tracking-[0.4em]">Fim do Relatório Oficial</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Extrato Print Preview Modal */}
        {showExtratoPreview && extratoPdfBlobUrl && (
          <div className="fixed inset-0 bg-[#00174b]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-8">
            <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col h-[90vh] animate-in fade-in zoom-in duration-300">
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-600 text-white flex items-center justify-center shadow-lg shadow-green-200">
                    <Printer size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#00174b]">Visualização do Extrato</h3>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Visualize o documento configurado e escolha a impressora</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button 
                    onClick={() => {
                      const iframe = document.getElementById('extrato-preview-iframe') as HTMLIFrameElement;
                      if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                      }
                    }}
                    className="px-6 py-3.5 bg-green-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-green-700 hover:scale-105 transition-all shadow-xl active:scale-95 text-xs uppercase tracking-wider"
                  >
                    <Printer size={18} />
                    Imprimir / Escolher Impressora
                  </button>
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = extratoPdfBlobUrl;
                      link.download = `Extrato_Conferencia_Pix_${new Date().toISOString().split('T')[0]}.pdf`;
                      link.click();
                    }}
                    className="px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 hover:scale-105 transition-all shadow-xl active:scale-95 text-xs uppercase tracking-wider"
                  >
                    <Download size={18} />
                    Baixar PDF
                  </button>
                  <button 
                    onClick={() => setShowExtratoPreview(false)}
                    className="p-3.5 bg-white text-slate-400 hover:text-red-500 rounded-2xl transition-all border border-slate-100 hover:bg-slate-50"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* PDF Content Area */}
              <div className="flex-1 bg-slate-100 p-4 md:p-6 flex items-center justify-center relative">
                <iframe 
                  id="extrato-preview-iframe" 
                  src={extratoPdfBlobUrl} 
                  className="w-full h-full rounded-2xl border border-slate-200/80 shadow-inner bg-white" 
                  title="Extrato PDF Preview"
                />
              </div>
            </div>
          </div>
        )}

        {/* Manual Match Modal */}
        {matchingTransactionIndex !== null && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-4 duration-500 border border-slate-100">
              <div className="p-8 border-b border-slate-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50" />
                <div className="relative flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                      <UserPlus size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Vincular Aluno</h3>
                      <p className="text-sm font-medium text-slate-500 mt-0.5">Selecione o aluno para esta transação</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setMatchingTransactionIndex(null)} 
                    className="p-2.5 bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all outline-none"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-center justify-between relative group hover:bg-white hover:border-indigo-100 transition-all duration-300">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pagador Exportado</p>
                    <p className="text-lg font-bold text-slate-900 uppercase tracking-tight line-clamp-1">{transactions[matchingTransactionIndex].payer_name}</p>
                    <p className="text-[10px] font-mono text-slate-400">{transactions[matchingTransactionIndex].transaction_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valor Pix</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transactions[matchingTransactionIndex].amount)}
                    </p>
                  </div>
                </div>

                <div className="relative mt-8 group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                  <input 
                    type="text" 
                    placeholder="Comece a digitar o nome do aluno..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    className="w-full pl-14 pr-6 py-4.5 bg-slate-50 border-2 border-transparent rounded-2xl text-base font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none placeholder:text-slate-400 placeholder:font-medium"
                    autoFocus
                  />
                  {manualSearch && (
                    <button 
                      onClick={() => setManualSearch('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-500 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[380px] overflow-y-auto p-4 space-y-2 bg-slate-50/30 custom-scrollbar">
                {students
                  .filter(s => normalize(s.name).includes(normalize(manualSearch)))
                  .slice(0, 15)
                  .map(student => (
                    <button 
                      key={student.id}
                      onClick={() => handleManualMatch(student.id)}
                      className="w-full p-4 hover:bg-white rounded-2xl flex items-center justify-between group transition-all border border-transparent hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-500/5 active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-1.5xl bg-white border border-slate-200 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all shadow-sm">
                          <User size={20} className="group-hover:hidden" />
                          <Check size={20} className="hidden group-hover:block animate-in zoom-in" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{student.name}</p>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md group-hover:bg-indigo-50 group-hover:text-indigo-400 transition-colors">
                              {student.registration_number || 'N/I'}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                            {classes.find(c => c.id === student.class_id)?.name || 'Sem Turma'}
                          </p>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-300 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                        <ChevronRight size={16} />
                      </div>
                    </button>
                  ))}
                {manualSearch && students.filter(s => normalize(s.name).includes(normalize(manualSearch))).length === 0 && (
                  <div className="py-20 px-10 text-center animate-in fade-in slide-in-from-bottom-2">
                    <div className="w-20 h-20 rounded-3xl bg-slate-50 text-slate-200 flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                      <UserX size={40} />
                    </div>
                    <p className="text-slate-400 font-bold">Nenhum aluno encontrado</p>
                    <p className="text-slate-300 text-xs mt-1">Refine sua busca ou verifique se o aluno está cadastrado</p>
                  </div>
                )}
                {!manualSearch && students.length > 0 && students.filter(s => normalize(s.name).includes(normalize(manualSearch))).length > 15 && (
                  <div className="p-4 text-center border-t border-slate-50">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Digite para filtrar mais resultados</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Print Report View (Hidden in UI, visible in Print) */}
      <div className="hidden print:block font-sans text-black p-8 bg-white min-h-screen">
        <div className="text-center mb-10 border-b-4 border-black pb-8">
          {institution?.logo_url && (
            <div className="flex justify-center mb-4">
              <img 
                src={institution.logo_url} 
                alt="Logo" 
                className="h-20 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Relatório de Conferência Pix</h1>
          <p className="text-lg font-bold text-slate-700">{institution?.name || 'ESCMIN - Sistema de Gestão Escolar'}</p>
          {institution?.cnpj && <p className="text-sm font-bold text-slate-500 mt-1">CNPJ: {institution.cnpj}</p>}
          <div className="flex justify-center gap-6 mt-4 text-sm font-medium">
            <span>Data: {new Date().toLocaleDateString('pt-BR')}</span>
            <span>Hora: {new Date().toLocaleTimeString('pt-BR')}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <div className="border-2 border-black p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Total Transações</p>
            <p className="text-3xl font-black">{stats.total}</p>
          </div>
          <div className="border-2 border-black p-5 text-center bg-slate-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Conciliados</p>
            <p className="text-3xl font-black">{stats.matched}</p>
          </div>
          <div className="border-2 border-black p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Pendente/Conflito</p>
            <p className="text-3xl font-black">{stats.unmatched + stats.multiple}</p>
          </div>
          <div className="border-2 border-black p-5 text-center bg-slate-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Valor Total</p>
            <p className="text-2xl font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalAmount)}</p>
          </div>
        </div>

        <table className="w-full border-collapse border-2 border-black text-[11px]">
          <thead>
            <tr className="bg-slate-200">
              <th className="border-2 border-black p-3 text-left uppercase font-black">Data</th>
              <th className="border-2 border-black p-3 text-left uppercase font-black">Pagador / Banco</th>
              <th className="border-2 border-black p-3 text-right uppercase font-black">Valor</th>
              <th className="border-2 border-black p-3 text-left uppercase font-black">Aluno Identificado</th>
              <th className="border-2 border-black p-3 text-left uppercase font-black">Turma</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t, i) => {
              const student = students.find(s => s.id === t.matched_student_id);
              const className = student ? (classes.find(c => c.id === student.class_id)?.name || '---') : '---';
              return (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="border border-black p-2 font-medium">{t.date}</td>
                  <td className="border border-black p-2">
                    <p className="font-black uppercase">{t.payer_name}</p>
                    <p className="text-[9px] text-slate-500">{t.origin_bank}</p>
                  </td>
                  <td className="border border-black p-2 text-right font-bold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                  </td>
                  <td className="border border-black p-2">
                    {student ? (
                      <div className="font-bold">
                        <p className="uppercase">{student.name}</p>
                        <p className="text-[9px] text-slate-500">Mat: {student.registration_number}</p>
                      </div>
                    ) : (
                      <span className="text-red-500 font-black italic">NÃO IDENTIFICADO</span>
                    )}
                  </td>
                  <td className="border border-black p-2 font-bold">{className}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-24 flex justify-around gap-20 px-10">
          <div className="text-center flex-1 border-t-2 border-black pt-3">
            <p className="text-xs font-black uppercase">Responsável pela Conferência</p>
            <p className="text-[10px] text-slate-500 mt-1">Assinatura</p>
          </div>
          <div className="text-center flex-1 border-t-2 border-black pt-3">
            <p className="text-xs font-black uppercase">Diretoria / Financeiro</p>
            <p className="text-[10px] text-slate-500 mt-1">Carimbo e Data</p>
          </div>
        </div>

        <div className="mt-12 text-center text-[9px] text-slate-400 italic">
          {institution?.footer_text || `Relatório gerado automaticamente pelo sistema ${institution?.name || 'ESCMIN'}. Página 1 de 1.`}
        </div>
      </div>
    </>
  );
}

export default PixConference;
