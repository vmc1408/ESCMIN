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
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import fuzzysort from 'fuzzysort';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { cn, safeFormat, parseSafeDate, formatDate, formatDateForDisplay } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery } from '../lib/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Student, PixTransaction, Class } from '../types';
import { useAuth } from '../contexts/AuthContext';

export function PixConference() {
  const { user: userAuth } = useAuth();
  const [file, setFile] = useState<File | null>(null);
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
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [registeredPixIds, setRegisteredPixIds] = useState<Set<string>>(new Set());
  const [reconciliationMap, setReconciliationMap] = useState<Map<string, string>>(new Map());
  
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
    'ITAU': { date: 'Data', payer: 'Descrição', amount: 'Valor', id: 'Número', bank: '' },
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
    if (activeTab === 'history') {
      fetchHistory();
    }
    if (activeTab === 'new') {
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
        
        // Link student locally if we have them in state
        try {
          if (curr.matched_student_id && students && students.length > 0) {
            curr.student = students.find(s => s.id === curr.matched_student_id);
          }
        } catch (err) {
          console.warn('Error linking student in history:', err);
        }

        if (!acc[batchId]) {
          acc[batchId] = {
            batch_id: batchId,
            file_name: curr.file_name || 'Arquivo sem nome',
            created_at: curr.created_at || new Date().toISOString(),
            payer_name: curr.payer_name || 'N/A',
            amount: Number(curr.amount) || 0,
            status: curr.status || 'unknown',
            transactions: [],
            totalAmount: 0
          };
        }
        acc[batchId].transactions.push(curr);
        acc[batchId].totalAmount += Number(curr.amount) || 0;
        return acc;
      }, {});

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
    
    const confirmMsg = `Deseja excluir permanentemente os ${selectedHistoryIds.size} registros selecionados e TODOS os seus vínculos financeiros EM AMBAS AS BASES?`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    setNotification({ type: 'success', message: 'Excluindo registros selecionados sincronizadamente...' });

    try {
      const idsToDelete = Array.from(selectedHistoryIds) as string[];
      
      for (const id of idsToDelete) {
        // Find transaction_id to clean up contributions
        // Reconciliations might be in Supabase or Firebase
        let transactionId = null;
        
        if (isSupabaseConfigured) {
          const res = await supabase.from('pix_reconciliations').select('transaction_id').eq('id', id).maybeSingle();
          transactionId = res?.data?.transaction_id;
        }

        if (!transactionId) {
          // Check for transaction_id in our database
          const results = await fetchQuery('pix_reconciliations', [
            { field: 'id', operator: '==', value: id }
          ]);
          if (results && results.length > 0) {
            transactionId = results[0].transaction_id;
          }
        }

        if (transactionId) {
          // Delete linked contributions everywhere
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
    const confirmMsg = "ATENÇÃO: Isso excluirá PERMANENTEMENTE todos os registros de conciliação do histórico EM AMBAS AS BASES (Supabase e Firebase). As contribuições já lançadas no extrato dos alunos NÃO serão afetadas. Deseja continuar?";
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    setNotification({ type: 'success', message: 'Iniciando limpeza sincronizada da base...' });

    try {
      // Fetch all IDs to delete using fetchAll which handles hybrid mode
      const reconciliations = await fetchAll('pix_reconciliations', 'id');
      
      if (!reconciliations || reconciliations.length === 0) {
        setNotification({ type: 'success', message: 'A base já está vazia.' });
        setHistory([]);
        setReconciliationMap(new Map());
        setRegisteredPixIds(new Set());
        setTransactions([]);
        setFile(null);
        setIsDeleting(false);
        return;
      }

      console.info(`Limpando ${reconciliations.length} registros sincronizados...`);
      
      // Delete doc by doc using deleteData to ensure sync between providers
      for (let i = 0; i < reconciliations.length; i++) {
        const item = reconciliations[i];
        await deleteData('pix_reconciliations', item.id);
      }

      // Clear all local states
      setHistory([]);
      setReconciliationMap(new Map());
      setRegisteredPixIds(new Set());
      setTransactions([]);
      setFile(null);
      setSelectedIds(new Set());
      setSelectedHistoryIds(new Set());
      
      setNotification({ type: 'success', message: 'Bases sincronizadas e limpas com sucesso!' });
      
      // Refresh to ensure everything is in sync
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
    setIsDeleting(true);
    setNotification({ type: 'success', message: 'Iniciando limpeza sincronizada do registro e vínculos...' });
    
    try {
      // 1. Locate items by Batch ID
      const batchItems = await fetchQuery('pix_reconciliations', [
        { field: 'batch_id', operator: '==', value: batchId }
      ]);
      
      if (batchItems && batchItems.length > 0) {
        for (const item of batchItems) {
          const reconciliationId = item.id;
          const transactionId = item.transaction_id;
          
          // 2. Clear linked contributions
          const [s1, s2] = await Promise.all([
            fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: reconciliationId }]),
            transactionId ? fetchQuery('contributions', [{ field: 'pix_id', operator: '==', value: transactionId }]) : Promise.resolve([])
          ]);
          
          const docsToDelete = [...(s1 || []), ...(s2 || [])];
          for (const d of docsToDelete) {
            await deleteData('contributions', d.id);
          }

          // 3. Delete main reconciliation
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
        
        const processed = jsonData.map((row: any, index: number) => {
          const keys = Object.keys(row);
          
          const findValue = (searchTerms: string[], customKey?: string) => {
            if (customKey && row[customKey] !== undefined) return row[customKey];
            const foundKey = keys.find(k => searchTerms.some(term => k.toLowerCase().includes(term.toLowerCase())));
            return foundKey ? row[foundKey] : '';
          };

          const date = findValue(['data', 'movimento', 'operacao'], customMapping.date);
          const rawName = findValue(['nome', 'pagador', 'cliente', 'favorecido', 'descricao', 'historico'], customMapping.payer);
          
          let amount = 0;
          const rawAmount = findValue(['valor', 'quantia', 'montante'], customMapping.amount);
          if (typeof rawAmount === 'number') {
            amount = rawAmount;
          } else if (rawAmount) {
            amount = parseFloat(String(rawAmount).replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.'));
          }

          const id = findValue(['id', 'transacao', 'e2e', 'autenticacao', 'nsu', 'documento', 'numero', 'doc', 'ref', 'nº'], customMapping.id);
          
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
            origin_bank: bank,
            amount,
            transaction_id: finalId,
            status,
            matched_student_id: matchedId,
            is_manual: false,
            created_at: new Date().toISOString()
          };
        });

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
          file_name: file?.name || 'Importação Manual',
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
      doc.text(`Arquivo: ${file?.name || 'Importação Manual'}`, margin, 24);
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

      const fileName = file?.name.replace('.xlsx', '') || 'Pix';
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
      {/* Save Progress Overlay */}
      {isSaving && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#00174b]/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full text-center space-y-6">
            <div className="relative w-24 h-24 mx-auto">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                <circle 
                  cx="50" cy="50" r="45" fill="none" stroke="#2563eb" strokeWidth="8" 
                  strokeDasharray="282.7" 
                  strokeDashoffset={282.7 - (282.7 * saveProgress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-black text-[#00174b] transition-all">{saveProgress}%</span>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-black text-[#00174b]">Vinculando Registros</h3>
              <p className="text-slate-500 text-sm mt-2">Por favor, não feche esta página enquanto processamos a conciliação financeira.</p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${saveProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={cn(
          "fixed top-6 right-6 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300",
          notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-bold text-sm">{notification.message}</p>
          <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="max-w-[1920px] mx-auto space-y-6 print:hidden">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-[#00174b] tracking-tight">Conferência de Pix</h2>
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
            <button 
              onClick={() => {
                setActiveTab('new');
                setTransactions([]);
                setFile(null);
              }}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
                activeTab === 'new' ? "bg-[#00174b] text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Plus size={18} />
              Novo Arquivo
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
                activeTab === 'history' ? "bg-[#00174b] text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <RotateCcw size={18} />
              Histórico
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSimulationMode(!isSimulationMode)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 border",
                isSimulationMode 
                  ? "bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-100" 
                  : "bg-white text-slate-400 border-slate-100"
              )}
            >
              {isSimulationMode ? <Check size={16} /> : <Database size={16} />}
              {isSimulationMode ? 'Modo Simulação ON' : 'Modo Simulação OFF'}
            </button>

            {activeTab === 'new' && transactions.length > 0 && (
              <button 
                onClick={handleSave} 
                disabled={isSaving || isSimulationMode} 
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 min-w-[200px] justify-center",
                  selectedIds.size > 0 
                    ? "bg-blue-600 text-white shadow-blue-100" 
                    : "bg-[#00174b] text-white"
                )}
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isSaving ? (
                  <span>Salvando {saveProgress}%</span>
                ) : (
                  selectedIds.size > 0 
                    ? `Salvar Selecionados (${selectedIds.size})` 
                    : 'Salvar Lote Completo'
                )}
              </button>
            )}
          </div>
        </header>

        {activeTab === 'new' && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden mb-6">
            <button 
              onClick={() => setShowMappingConfig(!showMappingConfig)}
              className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="text-blue-600" size={20} />
                <span className="font-black text-[#00174b] uppercase tracking-wider text-sm">Configuração de Mapeamento (Colunas)</span>
              </div>
              {showMappingConfig ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            
            {showMappingConfig && (
              <div className="p-8 bt-1 border-t border-slate-50 bg-slate-50/30 animate-in slide-in-from-top-2 duration-300">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Selecione o seu banco ou informe o nome exato das colunas na sua planilha:</p>
                
                <div className="flex flex-wrap gap-2 mb-8">
                  {(Object.keys(BANK_PRESETS) as Array<keyof typeof BANK_PRESETS>).map(bank => (
                    <button 
                      key={bank}
                      onClick={() => handleApplyPreset(bank)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm"
                    >
                      {bank}
                    </button>
                  ))}
                  <button 
                    onClick={() => setCustomMapping({ date: '', payer: '', amount: '', id: '', bank: '' })}
                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all"
                  >
                    Limpar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Coluna: Data</label>
                    <input 
                      type="text" 
                      value={customMapping.date} 
                      onChange={(e) => setCustomMapping({...customMapping, date: e.target.value})}
                      placeholder="Ex: Data Operação"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Coluna: Pagador/Nome</label>
                    <input 
                      type="text" 
                      value={customMapping.payer} 
                      onChange={(e) => setCustomMapping({...customMapping, payer: e.target.value})}
                      placeholder="Ex: Nome Cliente"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Coluna: Valor</label>
                    <input 
                      type="text" 
                      value={customMapping.amount} 
                      onChange={(e) => setCustomMapping({...customMapping, amount: e.target.value})}
                      placeholder="Ex: Valor (R$)"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Coluna: ID Transação</label>
                    <input 
                      type="text" 
                      value={customMapping.id} 
                      onChange={(e) => setCustomMapping({...customMapping, id: e.target.value})}
                      placeholder="Ex: E2E ID"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Coluna: Banco Origem</label>
                    <input 
                      type="text" 
                      value={customMapping.bank} 
                      onChange={(e) => setCustomMapping({...customMapping, bank: e.target.value})}
                      placeholder="Ex: Instituição"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'new' ? (
          <>
            {transactions.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-[#00174b]">{stats.total}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Arquivo</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center">
                    <UserCheck size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-green-600">{stats.matched}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conciliados</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                    <Users size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-orange-600">{stats.multiple}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conflitos</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                    <UserX size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-red-600">{stats.unmatched}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes</p>
                  </div>
                </div>
                <div className={cn(
                  "bg-white p-6 rounded-[2rem] border shadow-sm flex items-center gap-4 transition-all",
                  stats.duplicates > 0 ? "border-amber-200 bg-amber-50/30" : "border-slate-100"
                )}>
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                    stats.duplicates > 0 ? "bg-amber-100 text-amber-600" : "bg-amber-50 text-amber-600"
                  )}>
                    <Database size={24} />
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-black text-amber-600">{stats.duplicates}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Sistema</p>
                  </div>
                  {stats.duplicates > 0 && (
                    <button 
                      onClick={handleResetDatabase}
                      disabled={isDeleting}
                      title="Limpar todos os registros para re-importar"
                      className="p-2 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 transition-colors"
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
                  "bg-white rounded-[2.5rem] border-2 border-dashed p-12 text-center transition-all duration-300 shadow-sm",
                  isDragging ? "border-blue-500 bg-blue-50/50" : "border-slate-200 hover:border-blue-400/50"
                )}
              >
                <div className="flex flex-col items-center max-w-lg mx-auto">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <CloudUpload size={32} className="text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-black text-[#00174b] mb-2 tracking-tight">Importar Extrato Pix</h3>
                  <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed">Arraste seu arquivo Excel para processamento automático ou selecione manualmente em seu computador.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                    <label className="flex-1 max-w-[240px] px-6 py-4 bg-[#00174b] text-white rounded-xl font-bold cursor-pointer hover:bg-blue-900 transition-all shadow-lg active:scale-95 text-sm flex items-center justify-center gap-2">
                      <Plus size={18} />
                      Selecionar Arquivo
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
                    </label>
                    <button onClick={fetchStudents} className="flex-1 max-w-[240px] px-6 py-4 bg-white text-slate-600 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm">
                      <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                      Sincronizar Alunos
                    </button>
                  </div>
                  
                  <div className="mt-8 pt-8 border-t border-slate-50 w-full flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{students.length} Alunos Online</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <FileSpreadsheet size={14} className="text-slate-300" />
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suporta .XLSX e .XLS</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FileSpreadsheet size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[#00174b]">{file.name}</h3>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-bold text-slate-400">{transactions.length} transações • Total {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalAmount)}</p>
                        {selectedIds.size > 0 && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-black uppercase rounded tracking-wider animate-in fade-in zoom-in">
                            {selectedIds.size} selecionados
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Buscar pagador ou banco..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 pr-6 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 w-64 transition-all"
                      />
                    </div>
                    <div className="flex bg-slate-50 p-1 rounded-2xl">
                      {(['all', 'matched', 'multiple', 'unmatched'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                            filter === f ? "bg-white text-[#00174b] shadow-sm" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          {f === 'all' ? 'Ver Todos' : f === 'matched' ? 'Conciliados' : f === 'multiple' ? 'Conflitos' : 'Pendentes'}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setFile(null); setTransactions([]); }} className="p-3 text-red-500 hover:bg-red-50 rounded-2xl transition-all">
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
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data / ID</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Banco Origem</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagador</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aluno Identificado</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredTransactions.map((t) => (
                        <tr 
                          key={t.transaction_id} 
                          className={cn(
                            "group transition-colors",
                            selectedIds.has(String(t.transaction_id)) ? "bg-blue-50/50" : "hover:bg-slate-50/30"
                          )}
                        >
                          <td className="px-6 py-6 text-center">
                            <input 
                              type="checkbox"
                              checked={selectedIds.has(String(t.transaction_id))}
                              onChange={() => toggleSelect(String(t.transaction_id))}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-6">
                            <p className="text-sm font-bold text-[#00174b]">{formatDateForDisplay(t.date)}</p>
                            <p className="text-[10px] font-mono text-slate-400 mt-1">{t.transaction_id}</p>
                          </td>
                          <td className="px-4 py-6">
                            <span className="px-3 py-1 bg-slate-100 text-[11px] font-black text-slate-600 rounded-lg uppercase tracking-wider">
                              {t.origin_bank}
                            </span>
                          </td>
                          <td className="px-4 py-6">
                            <p className="text-base font-black text-[#00174b] uppercase">{t.payer_name}</p>
                          </td>
                          <td className="px-4 py-6">
                            <p className="text-lg font-black text-[#00174b]">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                            </p>
                          </td>
                          <td className="px-4 py-6">
                            {t.status === 'matched' ? (
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                                  <UserCheck size={20} />
                                </div>
                                <div>
                                  <p className="text-sm font-black text-green-700">
                                    {(() => {
                                      const student = students.find(s => s.id === t.matched_student_id);
                                      if (!student) return 'Aluno não encontrado';
                                      const className = classes.find(c => c.id === student.class_id)?.name || 'Sem Turma';
                                      return `${student.name} (${student.registration_number}) - ${className}`;
                                    })()}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    {t.is_manual ? (
                                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 uppercase tracking-tighter animate-pulse shadow-sm shadow-indigo-100">
                                        Manual
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-green-600/60 uppercase">Automático</span>
                                    )}
                                    <span className="w-1 h-1 rounded-full bg-green-200" />
                                    <span className="text-[10px] font-bold text-green-600/60 uppercase">Conciliado</span>
                                    {registeredPixIds.has(String(t.transaction_id)) && (
                                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-black uppercase rounded tracking-wider ml-2">
                                        Lançado
                                      </span>
                                    )}
                                    {reconciliationMap.has(String(t.transaction_id)) && (
                                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded tracking-wider ml-2">
                                        Já Importado
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : t.status === 'multiple' ? (
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                                  <Users size={20} />
                                </div>
                                <div>
                                  <p className="text-sm font-black text-orange-700">Conflito de Nomes</p>
                                  <p className="text-[10px] font-bold text-orange-600/60 uppercase">Verificar Candidatos</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center">
                                  <UserX size={20} />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-400 italic">Não Identificado</p>
                                  <p className="text-[10px] font-bold text-slate-300 uppercase">Pendente</p>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-8 py-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {t.status === 'matched' && (
                                <>
                                  <button 
                                    onClick={() => setRegisteringContribution(t)}
                                    className={cn(
                                      "p-3 rounded-xl transition-all shadow-sm border relative group",
                                      registeredPixIds.has(String(t.transaction_id))
                                        ? "bg-green-50 border-green-200 text-green-600 hover:bg-green-100"
                                        : "bg-white border-blue-100 text-blue-500 hover:text-blue-700 hover:border-blue-200"
                                    )}
                                    title={registeredPixIds.has(String(t.transaction_id)) ? "Lançamento já efetuado - Clique para editar ou realizar novo lançamento" : "Lançar no Extrato do Aluno"}
                                  >
                                    <CreditCard size={20} />
                                    {registeredPixIds.has(String(t.transaction_id)) && (
                                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                      </div>
                                    )}
                                  </button>
                                  <button 
                                    onClick={() => {
                                      const originalIndex = transactions.findIndex(item => item.transaction_id === t.transaction_id);
                                      if (originalIndex !== -1) handleUndoMatch(originalIndex);
                                    }}
                                    disabled={registeredPixIds.has(String(t.transaction_id))}
                                    className={cn(
                                      "p-3 rounded-xl transition-all shadow-sm border",
                                      registeredPixIds.has(String(t.transaction_id))
                                        ? "bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed"
                                        : "bg-white border-red-100 text-red-400 hover:text-red-600 hover:border-red-200"
                                    )}
                                    title="Desfazer Conciliação"
                                  >
                                    <RotateCcw size={20} />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => {
                                  const originalIndex = transactions.findIndex(item => item.transaction_id === t.transaction_id);
                                  if (originalIndex !== -1) setMatchingTransactionIndex(originalIndex);
                                }}
                                disabled={registeredPixIds.has(String(t.transaction_id))}
                                className={cn(
                                  "p-3 rounded-xl transition-all shadow-sm border",
                                  registeredPixIds.has(String(t.transaction_id))
                                    ? "bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed"
                                    : "bg-white border-slate-200 text-slate-400 hover:text-[#00174b] hover:border-[#00174b]"
                                )}
                                title="Vincular Manualmente"
                              >
                                <MoreHorizontal size={20} />
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
          </>
        ) : (
          <div className="space-y-4">
            {historyLoading ? (
              <div className="bg-white rounded-2xl p-20 text-center border border-slate-100">
                <Loader2 className="animate-spin mx-auto text-blue-600 mb-4" size={48} />
                <p className="text-slate-400 font-bold">Carregando histórico de arquivos...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="bg-white rounded-2xl p-20 text-center border border-slate-100">
                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                  <RotateCcw size={40} />
                </div>
                <p className="text-slate-400 font-bold text-xl">Nenhum arquivo conciliado encontrado.</p>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-black text-[#00174b]">Histórico de Conciliações</h3>
                    <p className="text-sm font-bold text-slate-400">Gerencie e filtre importações passadas</p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedHistoryIds.size > 0 && (
                      <div className="flex items-center gap-2 mr-2">
                        <button 
                          onClick={handleBulkDeleteHistory}
                          disabled={isDeleting}
                          className="px-6 py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-red-100"
                        >
                          {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          Excluir Selecionados ({selectedHistoryIds.size})
                        </button>
                      </div>
                    )}

                    <button 
                      onClick={handleResetDatabase}
                      disabled={isDeleting}
                      className="px-6 py-3 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-600 transition-all flex items-center gap-2 shadow-lg shadow-amber-100"
                    >
                      <RotateCcw size={16} />
                      Limpar Base Total
                    </button>
                    <button 
                      onClick={toggleHistorySelectAll}
                      className={cn(
                        "px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border",
                        selectedHistoryIds.size > 0 && selectedHistoryIds.size === historyByMonth.flatMap(m => m.batches.flatMap((b: any) => b.transactions)).length
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-600"
                      )}
                    >
                      {selectedHistoryIds.size > 0 && selectedHistoryIds.size === historyByMonth.flatMap(m => m.batches.flatMap((b: any) => b.transactions)).length
                        ? "Desmarcar Todos" 
                        : "Selecionar Todos"
                      }
                    </button>

                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Buscar no histórico..."
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        className="pl-12 pr-6 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 w-64 transition-all"
                      />
                    </div>
                    <div className="flex bg-slate-50 p-1 rounded-2xl">
                      {(['all', 'matched', 'multiple', 'unmatched'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setHistoryFilter(f)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                            historyFilter === f ? "bg-white text-[#00174b] shadow-sm" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          {f === 'all' ? 'Ver Todos' : f === 'matched' ? 'Conciliados' : f === 'multiple' ? 'Conflitos' : 'Pendentes'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {historyByMonth.map((monthGroup) => (
                  <div key={monthGroup.key} className="space-y-4">
                    <div className="flex items-center gap-4 px-4">
                      <div className="h-px flex-1 bg-slate-100" />
                      <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                        <Filter size={14} />
                        {monthGroup.label}
                      </h4>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    <div className="space-y-4">
                      {monthGroup.batches.map((batch: any) => (
                        <div key={batch.batch_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all hover:border-blue-100 group/batch">
                          <div 
                            onClick={() => toggleBatch(batch.batch_id)}
                            className="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-5">
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBatchSelect(batch.transactions);
                                }}
                                className="flex items-center justify-center p-2 hover:bg-slate-100 rounded-xl transition-all"
                              >
                                <input 
                                  type="checkbox" 
                                  checked={batch.transactions.every((t: any) => selectedHistoryIds.has(String(t.id)))}
                                  onChange={() => {}} // Controlled by parent div click
                                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              </div>
                              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover/batch:scale-110 transition-transform">
                                <FileSpreadsheet size={28} />
                              </div>
                              <div>
                                <h3 className="text-lg font-black text-[#00174b] group-hover/batch:text-blue-600 transition-colors uppercase tracking-tight">
                                  {batch.transactions.length === 1 ? batch.payer_name : batch.file_name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {new Date(batch.created_at).toLocaleDateString('pt-BR')} • {new Date(batch.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className="w-1 h-1 rounded-full bg-slate-200" />
                                  <span className="px-2 py-0.5 bg-blue-50 text-[9px] font-black text-blue-500 uppercase rounded-lg tracking-wider border border-blue-100">
                                    {batch.transactions.length} {batch.transactions.length !== 1 ? 'Transações' : 'Transação'}
                                  </span>
                                  {batch.transactions.length > 1 ? (
                                    <>
                                      <span className="w-1 h-1 rounded-full bg-slate-200" />
                                      {(() => {
                                        const counts = batch.transactions.reduce((acc: any, t: any) => {
                                          acc[t.status || 'unmatched'] = (acc[t.status || 'unmatched'] || 0) + 1;
                                          return acc;
                                        }, {} as any);
                                        return (
                                          <div className="flex gap-1.5">
                                            {counts.matched > 0 && <span className="text-[9px] font-black text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md border border-green-100 uppercase tracking-tighter">{counts.matched} Concil.</span>}
                                            {counts.multiple > 0 && <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-100 uppercase tracking-tighter">{counts.multiple} Confl.</span>}
                                            {counts.unmatched > 0 && <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100 uppercase tracking-tighter">{counts.unmatched} Pend.</span>}
                                          </div>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <>
                                      <span className="w-1 h-1 rounded-full bg-slate-200" />
                                      <span className={cn(
                                        "px-2 py-0.5 text-[9px] font-black uppercase rounded-lg tracking-wider border",
                                        batch.status === 'matched' ? "bg-green-50 text-green-600 border-green-100" : 
                                        batch.status === 'multiple' ? "bg-orange-50 text-orange-600 border-orange-100" : "bg-slate-50 text-slate-400 border-slate-100"
                                      )}>
                                        {batch.status === 'matched' ? 'Conciliado' : batch.status === 'multiple' ? 'Conflito' : 'Pendente'}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-8">
                              <div className="hidden sm:flex flex-col items-end">
                                <p className="text-xl font-black text-[#00174b]">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(batch.filteredTotalAmount || batch.totalAmount)}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor Total</p>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {deleteConfirmId === batch.batch_id ? (
                                  <div className="flex flex-col items-end gap-2 bg-red-50 p-2.5 rounded-2xl border border-red-100 animate-in fade-in slide-in-from-right-4 ring-4 ring-red-50/50">
                                    <div className="flex items-center gap-2">
                                      <AlertCircle size={14} className="text-red-500" />
                                      <p className="text-[9px] font-black text-red-600 uppercase">
                                        Confirmar exclusão?
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      {isDeleting ? (
                                        <div className="px-3 py-1 flex items-center gap-2">
                                          <Loader2 size={12} className="animate-spin text-red-600" />
                                          <span className="text-[8px] font-black text-red-600 uppercase">Limpando...</span>
                                        </div>
                                      ) : (
                                        <>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteHistory(batch.batch_id); }}
                                            className="px-3 py-1.5 bg-red-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-red-700 transition-all shadow-md active:scale-95"
                                          >
                                            Sim, Excluir
                                          </button>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                            className="px-3 py-1.5 bg-white text-slate-400 text-[9px] font-black uppercase rounded-lg border border-slate-200 hover:bg-slate-50 transition-all"
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
                                    className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                    title="Excluir Arquivo"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                )}
                                <div className="p-2 text-slate-300">
                                  {expandedBatches.includes(batch.batch_id) ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                                </div>
                              </div>
                            </div>

                          </div>

                          {expandedBatches.includes(batch.batch_id) && (
                            <div className="border-t border-slate-50 bg-slate-50/20">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100/30">
                                      <th className="px-4 py-4 text-center">
                                        <div 
                                          onClick={() => toggleBatchSelect(batch.transactions)}
                                          className="flex items-center justify-center p-1 cursor-pointer"
                                        >
                                          <input 
                                            type="checkbox" 
                                            checked={batch.transactions.every((t: any) => selectedHistoryIds.has(String(t.id)))}
                                            onChange={() => {}}
                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                          />
                                        </div>
                                      </th>
                                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID Transação</th>
                                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Banco Origem</th>
                                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagador</th>
                                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aluno Vinculado</th>
                                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {batch.transactions.map((t: any) => (
                                      <tr 
                                        key={t.id} 
                                        className={cn(
                                          "hover:bg-white transition-colors",
                                          selectedHistoryIds.has(String(t.id)) ? "bg-blue-50/50" : ""
                                        )}
                                      >
                                        <td className="px-4 py-4 text-center">
                                          <div 
                                            onClick={() => toggleHistorySelect(String(t.id))}
                                            className="flex items-center justify-center p-1 cursor-pointer"
                                          >
                                            <input 
                                              type="checkbox" 
                                              checked={selectedHistoryIds.has(String(t.id))}
                                              onChange={() => {}}
                                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                          </div>
                                        </td>
                                        <td className="px-8 py-4">
                                          <p className="text-[10px] font-mono text-slate-400">{t.transaction_id}</p>
                                          <p className="text-[9px] text-slate-300">{t.date}</p>
                                        </td>
                                        <td className="px-8 py-4">
                                          <span className="px-2 py-0.5 bg-white border border-slate-100 text-[9px] font-black text-slate-500 rounded uppercase tracking-wider italic">
                                            {t.origin_bank}
                                          </span>
                                        </td>
                                        <td className="px-8 py-4">
                                          <p className="text-sm font-bold text-[#00174b] uppercase">{t.payer_name}</p>
                                        </td>
                                        <td className="px-8 py-4 text-right">
                                          <p className="text-sm font-black text-[#00174b]">
                                            {formatCurrencyLocal(t.amount)}
                                          </p>
                                        </td>
                                        <td className="px-8 py-4">
                                          {t.student ? (
                                            <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                                                <UserCheck size={16} />
                                              </div>
                                              <div>
                                                <div className="flex items-center gap-2">
                                                  <p className="text-xs font-black text-green-700">{t.student.name}</p>
                                                  {t.is_manual && (
                                                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase rounded border border-indigo-100">
                                                      Manual
                                                    </span>
                                                  )}
                                                </div>
                                                <p className="text-[9px] font-bold text-green-600/60 uppercase">Matrícula: {t.student.registration_number}</p>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2 opacity-40">
                                              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center">
                                                <UserX size={16} />
                                              </div>
                                              <span className="text-slate-400 italic text-[10px] font-bold uppercase">Não identificado</span>
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-8 py-4">
                                          <div className="flex items-center justify-center gap-2">
                                            {t.student && (
                                              <button 
                                                onClick={(e) => { e.stopPropagation(); setRegisteringContribution(t); }}
                                                className={cn(
                                                  "p-2.5 rounded-xl transition-all shadow-sm border relative group/btn",
                                                  registeredPixIds.has(String(t.transaction_id || t.id))
                                                    ? "bg-green-50 border-green-200 text-green-600 hover:bg-green-100"
                                                    : "bg-white border-blue-100 text-blue-400 hover:text-blue-600 hover:border-blue-200"
                                                )}
                                                title={registeredPixIds.has(String(t.transaction_id || t.id)) ? "Lançamento já efetuado - Clique para editar ou realizar novo lançamento" : "Registrar como Contribuição"}
                                              >
                                                <CreditCard size={18} className="group-hover/btn:scale-110 transition-transform" />
                                                {registeredPixIds.has(String(t.transaction_id || t.id)) && (
                                                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full flex items-center justify-center">
                                                    <div className="w-1 h-1 bg-white rounded-full" />
                                                  </div>
                                                )}
                                              </button>
                                            )}
                                            <button 
                                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(batch.batch_id); }}
                                              className="p-3 bg-white border border-red-100 text-red-400 hover:text-red-600 hover:border-red-300 rounded-xl transition-all shadow-sm group/btn-del"
                                              title="Excluir este registro permanentemente"
                                            >
                                              <Trash2 size={18} className="group-hover/btn-del:scale-110 transition-transform" />
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

        {/* Contribution Registration Modal */}
        {registeringContribution && (
          <div className="fixed inset-0 bg-[#00174b]/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#00174b]">Registrar Contribuição</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Confirme os dados de referência</p>
                  </div>
                </div>
                <button 
                  onClick={() => setRegisteringContribution(null)}
                  className="p-2 text-slate-400 hover:text-red-500 transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">Aluno Selecionado</p>
                  <p className="text-lg font-black text-[#00174b]">
                    {(registeringContribution.student || students.find((s: any) => s.id === registeringContribution.matched_student_id))?.name}
                  </p>
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <span className="text-slate-500 font-bold">Valor do Pix:</span>
                    <span className="text-blue-600 font-black">{formatCurrencyLocal(registeringContribution.amount)}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meses de Referência</label>
                    {selectedPeriods.length > 0 && (
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                        {selectedPeriods.length} Selecionado(s)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    {MONTHS.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => toggleMonth(i + 1)}
                        className={cn(
                          "py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2",
                          selectedPeriods.some(p => p.month === i + 1 && p.year === parseInt(contribYear))
                            ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100 scale-[1.02]"
                            : "bg-white border-white text-slate-400 hover:border-blue-100 hover:text-blue-500"
                        )}
                      >
                        {m.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* List of selected periods - More visual */}
                {selectedPeriods.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {selectedPeriods.map((p, idx) => (
                      <div key={idx} className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-[9px] font-black border border-blue-100 flex items-center gap-2 animate-in fade-in slide-in-from-left-2 shadow-sm">
                        {MONTHS[p.month - 1].substring(0, 3)} / {p.year}
                        <button 
                          onClick={() => {
                            if (selectedPeriods.length > 1) {
                              setSelectedPeriods(prev => prev.filter((_, i) => i !== idx));
                            }
                          }}
                          className="hover:text-red-500 transition-colors p-0.5 rounded-md hover:bg-red-50"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-2">Ano base</label>
                    <input 
                      type="number"
                      value={contribYear}
                      onChange={(e) => setContribYear(e.target.value)}
                      className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-[#00174b] focus:bg-white focus:border-blue-500 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-2">Tipo de Recebimento</label>
                    <select 
                      value="PIX"
                      disabled
                      className="w-full h-14 px-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500 transition-all outline-none cursor-not-allowed"
                    >
                      <option value="PIX">PIX</option>
                      <option value="Cartão">Cartão</option>
                      <option value="Dinheiro">Dinheiro</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                    <span>Divisão do Valor</span>
                    <span className="text-blue-600">{selectedPeriods.length} períodos selecionados</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs font-bold text-slate-600">Valor por mês:</span>
                    <span className="text-sm font-black text-[#00174b]">
                      {formatCurrencyLocal(registeringContribution.amount / selectedPeriods.length)}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={handleFinalContributionRegistration}
                  className="w-full py-5 bg-[#00174b] text-white rounded-[2rem] font-black text-lg hover:bg-blue-900 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
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
          <div className="fixed inset-0 bg-[#00174b]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-8 overflow-y-auto">
            <div className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-full animate-in fade-in zoom-in duration-300">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 print:hidden">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                    <Printer size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#00174b]">Visualização do Relatório</h3>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Confira os dados antes de imprimir</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={generatePDF}
                    className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 hover:scale-105 transition-all shadow-xl active:scale-95"
                  >
                    <Download size={20} />
                    Gerar Relatório (PDF)
                  </button>
                  <button 
                    onClick={() => setShowReportPreview(false)}
                    className="p-4 bg-white text-slate-400 hover:text-red-500 rounded-2xl transition-all border border-slate-100"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-12 bg-white print:p-0" id="printable-report">
                {/* Report Content */}
                <div className="max-w-4xl mx-auto space-y-12">
                  <div className="flex justify-between items-start border-b-4 border-[#00174b] pb-8">
                    <div>
                      <h1 className="text-4xl font-black text-[#00174b] uppercase tracking-tighter mb-2">Relatório de Conciliação Pix</h1>
                      <p className="text-slate-500 font-bold">Arquivo: {file?.name || 'Importação Manual'}</p>
                      <p className="text-slate-400 text-sm">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Resumo Geral</p>
                      <div className="space-y-1">
                        <p className="text-lg font-black text-[#00174b]">{stats.total} Transações</p>
                        <p className="text-green-600 font-bold">{stats.matched} Conciliados</p>
                        <p className="text-orange-600 font-bold">{stats.multiple} Conflitos</p>
                        <p className="text-red-600 font-bold">{stats.unmatched} Não Identificados</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-6 rounded-3xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Valor Total Processado</p>
                      <p className="text-3xl font-black text-[#00174b]">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          transactions.reduce((acc, t) => acc + t.amount, 0)
                        )}
                      </p>
                    </div>
                    <div className="bg-green-50 p-6 rounded-3xl">
                      <p className="text-[10px] font-black text-green-600/60 uppercase tracking-widest mb-4">Valor Conciliado</p>
                      <p className="text-3xl font-black text-green-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          transactions.filter(t => t.status === 'matched').reduce((acc, t) => acc + t.amount, 0)
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-xl font-black text-[#00174b] border-l-4 border-blue-600 pl-4">Detalhamento das Transações</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b-2 border-slate-100">
                            <th className="py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                            <th className="py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Banco</th>
                            <th className="py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagador</th>
                            <th className="py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor</th>
                            <th className="py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">St</th>
                            <th className="py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Aluno / Turma</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {transactions.map((t, i) => {
                            const student = students.find(s => s.id === t.matched_student_id);
                            const className = student ? (classes.find(c => c.id === student.class_id)?.name || 'Sem Turma') : '';
                            
                            return (
                              <tr key={i} className="break-inside-avoid hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 text-xs font-bold text-slate-500">{formatDateForDisplay(t.date)}</td>
                                <td className="py-3 text-xs font-medium text-slate-400 uppercase">{t.origin_bank || 'N/I'}</td>
                                <td className="py-3">
                                  <p className="text-xs font-black text-[#00174b] uppercase">{t.payer_name}</p>
                                </td>
                                <td className="py-3 text-right text-xs font-black text-[#00174b]">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                                </td>
                                <td className="py-3 text-center">
                                  {t.status === 'matched' ? (
                                    <span className="text-green-600 font-black" title="Conciliado">[V]</span>
                                  ) : t.status === 'multiple' ? (
                                    <span className="text-orange-600 font-black" title="Conflito">[!]</span>
                                  ) : (
                                    <span className="text-slate-300 font-black" title="Pendente">[-]</span>
                                  )}
                                </td>
                                <td className="py-3 pl-4">
                                  {student ? (
                                    <div>
                                      <p className="text-xs font-black text-[#00174b]">
                                        {student.name} <span className="text-[10px] text-slate-400 font-normal">({student.registration_number})</span>
                                      </p>
                                      <p className="text-[9px] font-bold text-blue-600/60 uppercase">{className}</p>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 italic text-[10px]">Não identificado</span>
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

        {/* Manual Match Modal */}
        {matchingTransactionIndex !== null && (
          <div className="fixed inset-0 bg-[#00174b]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="p-10 border-b border-slate-50">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-3xl font-black text-[#00174b]">Vincular Aluno</h3>
                    <p className="text-slate-500 font-medium mt-1">Selecione o aluno correspondente para esta transação.</p>
                  </div>
                  <button onClick={() => setMatchingTransactionIndex(null)} className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 rounded-2xl transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl mb-8 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagador no Extrato</p>
                    <p className="text-xl font-black text-[#00174b] uppercase">{transactions[matchingTransactionIndex].payer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor</p>
                    <p className="text-xl font-black text-[#00174b]">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transactions[matchingTransactionIndex].amount)}
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    type="text" 
                    placeholder="Buscar aluno por nome..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    className="w-full pl-14 pr-6 py-5 bg-slate-50 border-none rounded-3xl text-lg font-bold text-[#00174b] focus:ring-4 focus:ring-blue-500/10 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto p-4 space-y-2">
                {students
                  .filter(s => normalize(s.name).includes(normalize(manualSearch)))
                  .slice(0, 10)
                  .map(student => (
                    <button 
                      key={student.id}
                      onClick={() => handleManualMatch(student.id)}
                      className="w-full p-6 hover:bg-blue-50 rounded-[2rem] flex items-center justify-between group transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                          <UserCheck size={24} />
                        </div>
                        <div className="text-left">
                          <p className="text-lg font-black text-[#00174b] group-hover:text-blue-700">{student.name}</p>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{student.registration_number || 'Sem Matrícula'}</p>
                        </div>
                      </div>
                      <ArrowRight className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-2 transition-all" />
                    </button>
                  ))}
                {manualSearch && students.filter(s => normalize(s.name).includes(normalize(manualSearch))).length === 0 && (
                  <div className="p-10 text-center">
                    <p className="text-slate-400 font-bold">Nenhum aluno encontrado com este nome.</p>
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

        <div className="grid grid-cols-4 gap-4 mb-10">
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
