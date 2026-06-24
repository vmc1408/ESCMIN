import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CreditCard, Download, Plus, Calendar, User as UserIcon, Loader2, CheckCircle2, FileText, Printer, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp, AlertCircle, Link2Off, X, FileDown, DollarSign, Trash2, Search } from 'lucide-react';
import { financialService } from '../services/financialService';
import { fetchAll, saveData, deleteData, fetchQuery, fetchById } from '../lib/database';
import { Student, Contribution, Class } from '../types';
import { formatCurrency, cn, safeFormat, parseSafeDate, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation } from 'react-router-dom';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function Contributions() {
  const location = useLocation();
  const initialStudentId = (location.state as any)?.studentId;
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [viewMode, setViewMode] = useState<'individual' | 'period' | 'unpaid'>('individual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodData, setPeriodData] = useState<(Contribution & { student?: Student })[]>([]);
  const [recentContributions, setRecentContributions] = useState<(Contribution & { student?: Student })[]>([]);
  const [filterType, setFilterType] = useState<'payment' | 'created'>('payment');
  const [searchByName, setSearchByName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [selectedForPrint, setSelectedForPrint] = useState<Contribution[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteConfirmationFor, setDeleteConfirmationFor] = useState<Contribution | null>(null);
  const [unlinkConfirmationFor, setUnlinkConfirmationFor] = useState<Contribution | null>(null);
  const [receiptPreviewData, setReceiptPreviewData] = useState<Contribution[] | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPrintingStatement, setIsPrintingStatement] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState<string[]>([]);
  
  // Helper to calculate expected months for a student in a specific year
  const getExpectedMonthsForStudent = (student: Student, year: number) => {
    // If student started after this year, they are not expected to pay anything for this year
    if (student.start_date) {
      const startDate = parseSafeDate(student.start_date);
      if (!isNaN(startDate.getTime()) && startDate.getFullYear() > year) {
        return [];
      }
    }

    // Determine starting month for this year
    let startMonth = 1; // January
    if (student.start_date) {
      const startDate = parseSafeDate(student.start_date);
      if (!isNaN(startDate.getTime()) && startDate.getFullYear() === year) {
        startMonth = startDate.getMonth() + 1; // 1-indexed
      }
    }

    // Determine end month for this year - always 12 as requested so future months of the year are also checked and reported
    const endMonth = 12; // December

    const expected: number[] = [];
    for (let m = startMonth; m <= endMonth; m++) {
      expected.push(m);
    }
    return expected;
  };

  // States for Unpaid (Mensalidades em Aberto) dashboard
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  const [allActiveStudents, setAllActiveStudents] = useState<Student[]>([]);
  const [unpaidContributions, setUnpaidContributions] = useState<Contribution[]>([]);
  const [unpaidClassFilter, setUnpaidClassFilter] = useState<string>('');
  const [unpaidSearchTerm, setUnpaidSearchTerm] = useState<string>('');
  const [unpaidYear, setUnpaidYear] = useState<number>(new Date().getFullYear());

  const toggleStudentExpansion = (studentId: string) => {
    setExpandedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId) 
        : [...prev, studentId]
    );
  };

  // Estados para Registro Manual
  const [manualMonths, setManualMonths] = useState<number[]>([]);
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [manualAmount, setManualAmount] = useState('100,00');
  const [manualMethod, setManualMethod] = useState<'Dinheiro' | 'PIX' | 'Cartão'>('Dinheiro');
  const [manualObservations, setManualObservations] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  useEffect(() => {
    fetchInitialData();
    fetchRecentContributions();
    
    // Default to period view with last 15 days if no internal navigation student
    if (!initialStudentId) {
      setViewMode('period');
      fetchPeriodContributions();
    }
  }, []); // Only once on mount

  useEffect(() => {
    // Focus listener for automatic updates
    const handleFocus = () => {
      if (selectedStudent) {
        fetchContributions(selectedStudent.id, selectedYear);
      }
      fetchRecentContributions();
    };
    window.addEventListener('focus', handleFocus);
    
    const handleAfterPrint = () => {
      setIsPrinting(false);
      setIsPrintingStatement(false);
      setReceiptPreviewData(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedStudent, selectedYear]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const triggerDirectPrint = (data: Contribution[]) => {
    // 1. Sort data chronologically: Year ASC, then Month ASC
    const sortedData = [...data].sort((a, b) => {
      if (a.reference_year !== b.reference_year) {
        return a.reference_year - b.reference_year;
      }
      return a.reference_month - b.reference_month;
    });

    // 2. Prepare data
    setReceiptPreviewData(sortedData);
    setIsPrinting(true);
    
    // 2. Small delay + focus for maximum hardware reliability
    setTimeout(() => {
      window.focus();
      try {
        window.print();
      } catch (e) {
        console.error("Print command failed, user can use manual button.", e);
      }
    }, 600);
  };

  const fetchRecentContributions = async () => {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fifteenDaysAgoStr = fifteenDaysAgo.toISOString().split('T')[0];

    try {
      const data = await fetchQuery('contributions', [
        { field: 'payment_date', operator: '>=', value: fifteenDaysAgoStr + 'T00:00:00Z' }
      ], 'payment_date');

      const dataWithStudents = await Promise.all((data || []).map(async (c: any) => {
        let student = null;
        if (c.student_id) {
          student = await fetchById('students', c.student_id);
        }
        return { ...c, student };
      }));
      setRecentContributions(dataWithStudents as any);
      if (!selectedStudent && viewMode === 'individual' && !initialStudentId) {
        setPeriodData(dataWithStudents as any);
        setViewMode('period');
      }
    } catch (error) {
      console.error('Error fetching recent:', error);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [classesData, instData] = await Promise.all([
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }], 'code'),
        financialService.getInstitutionSettings()
      ]);

      setClasses(classesData || []);
      setInstitution(instData || null);

      if (initialStudentId) {
        const studentData = await fetchById('students', initialStudentId);
        
        if (studentData) {
          const typedStudent = studentData as Student;
          setSelectedStudent(typedStudent);
          setStudents([typedStudent]);
          setViewMode('individual');
          fetchContributions(typedStudent.id, selectedYear);
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchStudents = async (val: string) => {
    setSearchTerm(val);
    if (val.length < 3) {
      setStudents([]);
      return;
    }

    setIsSearching(true);
    try {
      const [nameData, regData] = await Promise.all([
        fetchQuery('students', [
          { field: 'name', operator: 'ilike', value: `%${val}%` }
        ]),
        fetchQuery('students', [
          { field: 'registration_number', operator: 'ilike', value: `%${val}%` }
        ])
      ]);

      const combined = [...(nameData || []), ...(regData || [])];
      // Filter active status locally (handles implicit active status where status field is omitted/null)
      const activeCombined = combined.filter((s: any) => (s.status || 'Ativo') === 'Ativo');
      // Deduplicate by ID
      const unique = Array.from(new Map(activeCombined.map(item => [item.id, item])).values());
      // Sort alphabetically by name
      const sorted = (unique as Student[]).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStudents(sorted);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchPeriodContributions = async () => {
    setLoading(true);
    try {
      const dateField = filterType === 'payment' ? 'payment_date' : 'created_at';
      const dbStart = parseDateToDB(startDate);
      const dbEnd = parseDateToDB(endDate);
      
      const filters = [];
      if (dbStart) {
        filters.push({ field: dateField, operator: '>=', value: dbStart });
      }
      if (dbEnd) {
        filters.push({ field: dateField, operator: '<=', value: dbEnd + (dateField === 'created_at' ? 'T23:59:59Z' : 'z') });
      }
      
      const docsData = await fetchQuery('contributions', filters);

      if (!docsData) {
        setPeriodData([]);
        setViewMode('period');
        return;
      }
      
      // Batch fetch students
      const rawStudentIds = docsData.map(c => c.student_id).filter(Boolean);
      const uniqueStudentIds = Array.from(new Set(rawStudentIds));
      const studentMap = new Map();
      
      if (uniqueStudentIds.length > 0) {
        const sData = await fetchQuery('students', [
          { field: 'id', operator: 'in', value: uniqueStudentIds }
        ]);
        const activeSData = (sData || []).filter((s: any) => (s.status || 'Ativo') === 'Ativo');
        activeSData.forEach(s => studentMap.set(s.id, s));
      }

      let data = docsData
        .map(c => ({
          ...c,
          student: studentMap.get(c.student_id) || null
        }))
        .filter(c => c.student !== null);

      if (searchByName.trim()) {
        const term = searchByName.toLowerCase();
        data = data.filter(c => 
          c.student?.name?.toLowerCase().includes(term) || 
          c.student?.registration_number?.toLowerCase().includes(term)
        );
      }

      setPeriodData(data as any);
      setViewMode('period');
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao buscar dados: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchContributions = async (studentId: string | undefined, year: number) => {
    if (!studentId) {
      setContributions([]);
      return;
    }
    try {
      const data = await fetchQuery('contributions', [
        { field: 'student_id', operator: '==', value: studentId },
        { field: 'reference_year', operator: '==', value: year }
      ], 'reference_month');
      setContributions((data || []) as Contribution[]);
    } catch (error: any) {
      console.error('Error fetching contributions:', error.message);
    }
  };

  // Fetch all active students and contributions of selected year for the unpaid/debtors report
  const fetchUnpaidData = async (targetYear = unpaidYear) => {
    setUnpaidLoading(true);
    try {
      // 1. Fetch all students and filter active ones locally (handles implicit active status where status field is empty/null)
      const allStuds = await fetchAll('students');
      const studs = (allStuds || [])
        .filter((s: any) => (s.status || 'Ativo') === 'Ativo')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      // 2. Fetch all contributions for this year (supporting both numeric and string values for reference_year)
      const [yearContribsNum, yearContribsStr] = await Promise.all([
        fetchQuery('contributions', [{ field: 'reference_year', operator: '==', value: targetYear }]),
        fetchQuery('contributions', [{ field: 'reference_year', operator: '==', value: String(targetYear) }])
      ]);
      const combinedContribs = [...(yearContribsNum || []), ...(yearContribsStr || [])];
      const uniqueContribs = Array.from(new Map(combinedContribs.map(c => [c.id, c])).values());

      setAllActiveStudents(studs as Student[]);
      setUnpaidContributions(uniqueContribs as Contribution[]);
    } catch (error: any) {
      console.error('Error fetching unpaid data:', error);
      setNotification({ type: 'error', message: 'Erro ao carregar inadimplência: ' + error.message });
    } finally {
      setUnpaidLoading(false);
    }
  };

  // Compute list of students with unpaid months
  const unpaidReportList = useMemo(() => {
    if (!unpaidClassFilter) return [];

    return allActiveStudents.map(student => {
      // Expected months for this student in the selected unpaidYear
      const expectedMonths = getExpectedMonthsForStudent(student, unpaidYear);
      
      // Paid months this year
      const paidMonths = unpaidContributions
        .filter(c => c.student_id === student.id)
        .map(c => c.reference_month);
      
      // Unpaid months
      const unpaidMonths = expectedMonths.filter(m => !paidMonths.includes(m));
      
      return {
        student,
        expectedMonths,
        paidMonths,
        unpaidMonths,
        pendingCount: unpaidMonths.length,
        estimatedDebt: unpaidMonths.length * 100 // Estimate $100.00 standard monthly fee
      };
    })
    .filter(item => item.pendingCount > 0) // only show if there are outstanding/pending months
    .filter(item => {
      // Search term filter
      if (!unpaidSearchTerm.trim()) return true;
      const term = unpaidSearchTerm.toLowerCase();
      return (
        item.student.name?.toLowerCase().includes(term) ||
        item.student.registration_number?.toLowerCase().includes(term)
      );
    })
    .filter(item => {
      // Class filter
      if (unpaidClassFilter === 'all') return true;
      return item.student.class_id === unpaidClassFilter;
    });
  }, [allActiveStudents, unpaidContributions, unpaidYear, unpaidSearchTerm, unpaidClassFilter]);

  // Calculate stats breakdown for top overview cards (overdue vs future/to-be-due)
  const unpaidStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed
    
    let totalOverdueMonths = 0;
    let totalFutureMonths = 0;
    
    unpaidReportList.forEach(item => {
      item.unpaidMonths.forEach(m => {
        const isFuture = unpaidYear > currentYear || (unpaidYear === currentYear && m > currentMonth);
        if (isFuture) {
          totalFutureMonths++;
        } else {
          totalOverdueMonths++;
        }
      });
    });
    
    return {
      totalOverdueDebt: totalOverdueMonths * 100,
      totalFutureDebt: totalFutureMonths * 100,
      totalOverdueMonths,
      totalFutureMonths
    };
  }, [unpaidReportList, unpaidYear]);

  // Generate PDF report for unpaid fees (Relatório de Mensalidades em Aberto)
  const generateUnpaidReport = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 14;

      // Header Banner
      doc.setFillColor(19, 27, 46); // Deep Navy background
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      const title = 'RELATÓRIO DE MENSALIDADES EM ABERTO';
      doc.text(title, margin, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(226, 232, 240);
      const yearText = `ANO DE REFERÊNCIA DO RELATÓRIO: ${unpaidYear}`;
      doc.text(yearText, margin, 25);
      
      const genDate = `GERADO EM: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`.toUpperCase();
      doc.text(genDate, margin, 30);

      // Filter text
      let filterText = 'FILTRO DE SELEÇÃO: TODAS AS TURMAS';
      if (unpaidClassFilter !== 'all') {
        const cls = classes.find(c => c.id === unpaidClassFilter);
        filterText = `FILTRO DE SELEÇÃO: TURMA ${cls?.name?.toUpperCase() || unpaidClassFilter}`;
      }
      doc.text(filterText, margin, 35);

      // Table data
      const tableRows = unpaidReportList.map((item, index) => {
        const studentName = item.student.name?.toUpperCase() || 'SEM NOME';
        const studentRA = item.student.registration_number || 'S/ RA';
        const className = classes.find(c => c.id === item.student.class_id)?.name?.toUpperCase() || 'SEM TURMA';
        const pendingMonthsText = item.unpaidMonths.map(m => MONTHS[m - 1].substring(0, 3).toUpperCase()).join(', ');
        
        return [
          index + 1,
          `${studentName}\n(${studentRA})`,
          className,
          item.pendingCount,
          pendingMonthsText,
          formatCurrency(item.estimatedDebt)
        ];
      });

      autoTable(doc, {
        startY: 45,
        head: [['#', 'ESTUDANTE / REGISTRO ACADÊMICO', 'TURMA VINCULADA', 'MESES DEV.', 'MESES PENDENTES', 'VALOR ESTIMADO']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 8.5,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [50, 50, 50]
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 60 },
          2: { cellWidth: 40 },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 40 },
          5: { cellWidth: 20, halign: 'right' }
        },
        margin: { left: margin, right: margin }
      });

      // Total summary at the bottom
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      
      const totalStudents = unpaidReportList.length;
      const totalEstimatedDebt = unpaidReportList.reduce((acc, curr) => acc + curr.estimatedDebt, 0);
      
      doc.text(`TOTAL DE ALUNOS COM REGISTRO DE PENDÊNCIA: ${totalStudents}`, margin, finalY);
      doc.text(`VALOR TOTAL PENDENTE ESTIMADO CONSOLIDADO: ${formatCurrency(totalEstimatedDebt)}`, margin, finalY + 6);

      doc.save(`Relatorio_Mensalidades_Aberto_${unpaidYear}.pdf`);
    } catch (error) {
      console.error('Error generating unpaid report:', error);
      alert('Erro ao gerar relatório de mensalidades em aberto');
    }
  };

  useEffect(() => {
    if (selectedStudent) {
      fetchContributions(selectedStudent.id, selectedYear);
    }
  }, [selectedYear, selectedStudent]);

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setSelectedForPrint([]);
  };

  const togglePrintSelection = (contribution: Contribution) => {
    setSelectedForPrint(prev => {
      const isSelected = prev.some(c => c.id === contribution.id);
      if (isSelected) {
        return prev.filter(c => c.id !== contribution.id);
      } else {
        if (prev.length >= 6) {
          setNotification({ type: 'error', message: '⚠️ AVISO: Limite máximo de 6 contribuições por recibo para manter a formatação em página única.' });
          return prev;
        }
        return [...prev, contribution];
      }
    });
  };

  const handleUnlinkPix = async () => {
    if (!unlinkConfirmationFor) return;
    const contrib = unlinkConfirmationFor;
    setUnlinkConfirmationFor(null);

    try {
      await saveData('contributions', contrib.id, { 
        pix_id: null,
        origin: null
      });

      setContributions(prev => prev.map(c => 
        c.id === contrib.id ? { ...c, pix_id: undefined, origin: undefined } : c
      ));
      
      setNotification({ type: 'success', message: 'Contribuição agora é um registro manual.' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao desvincular: ' + error.message });
    }
  };

  const handleDeleteContribution = async () => {
    if (!deleteConfirmationFor) return;
    const contrib = deleteConfirmationFor;
    setDeleteConfirmationFor(null);

    setIsDeleting(contrib.id);
    try {
      await deleteData('contributions', contrib.id);

      setContributions(prev => prev.filter(c => c.id !== contrib.id));
      setNotification({ type: 'success', message: 'Contribuição excluída com sucesso!' });
      
      // Limpa seleção de impressão se estiver nela
      setSelectedForPrint(prev => prev.filter(c => c.id !== contrib.id));
    } catch (error: any) {
      console.error('Falha ao excluir:', error);
      setNotification({ type: 'error', message: 'Erro ao excluir: ' + error.message });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleAddContribution = (monthIndex: number) => {
    if (!selectedStudent) return;
    setManualMonths([monthIndex]);
    setManualAmount('100,00');
    setManualMethod('Dinheiro');
    setManualDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const formatManualAmount = () => {
    let clean = manualAmount.replace(/[^\d.,]/g, '');
    if (!clean) return;
    
    // Normalize to number string
    let numStr = clean;
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      // Formata de volta para o padrão brasileiro para exibição
      setManualAmount(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  };

  const toggleManualMonth = (monthIndex: number) => {
    setManualMonths(prev => {
      if (prev.includes(monthIndex)) {
        return prev.filter(m => m !== monthIndex);
      }
      if (prev.length >= 6) {
        setNotification({ type: 'error', message: '⚠️ LIMITE ATINGIDO: Selecione no máximo 6 meses por lançamento para garantir o recibo em duas vias na página.' });
        return prev;
      }
      return [...prev, monthIndex].sort((a, b) => a - b);
    });
  };

  const saveManualContribution = async () => {
    if (!selectedStudent || manualMonths.length === 0) {
      setNotification({ type: 'error', message: 'Selecione pelo menos um mês.' });
      return;
    }

    // Limpeza rigorosa do valor monetário
    let clean = manualAmount.replace(/[^\d.,]/g, '');
    if (clean.includes(',')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    }
    
    const totalAmount = parseFloat(clean);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      setNotification({ type: 'error', message: 'Insira um valor válido.' });
      return;
    }

    setIsSavingManual(true);
    try {
      const amountPerMonth = totalAmount / manualMonths.length;
      const finalDate = parseSafeDate(manualDate).toISOString();

      // Check for existing contributions
      const existingContribs = await fetchQuery('contributions', [
        { field: 'student_id', operator: '==', value: selectedStudent.id },
        { field: 'reference_year', operator: '==', value: selectedYear },
        { field: 'reference_month', operator: 'in', value: manualMonths.map(idx => idx + 1) }
      ]);

      if (existingContribs && (existingContribs as any[]).length > 0) {
        const duplicateMonths = (existingContribs as any[]).map((c: any) => MONTHS[c.reference_month - 1]).join(', ');
        setNotification({ 
          type: 'error', 
          message: `Já existe contribuição para ${duplicateMonths}/${selectedYear}. Verifique.` 
        });
        setIsSavingManual(false);
        return;
      }
      
      const recordsToInsert = manualMonths.map(monthIdx => ({
        student_id: selectedStudent.id,
        amount: amountPerMonth,
        reference_month: monthIdx + 1,
        reference_year: selectedYear,
        payment_date: finalDate,
        payment_method: manualMethod,
        observations: manualObservations,
        created_at: new Date().toISOString()
      }));

      const savedDocs = await Promise.all(recordsToInsert.map(async (rec) => {
        const finalId = await saveData('contributions', undefined, rec);
        return { id: finalId, ...rec };
      }));

      setContributions(prev => [...prev, ...savedDocs as any]);
      setManualMonths([]);
      setManualObservations('');
      
      // Force refresh for recent list and any other lists
      fetchRecentContributions();
      
      setNotification({ type: 'success', message: `✅ ${manualMonths.length} lançamento(s) registrado(s) com sucesso!` });
    } catch (error: any) {
      console.error('Erro detalhado:', error);
      setNotification({ type: 'error', message: 'Erro ao registrar: ' + error.message });
    } finally {
      setIsSavingManual(false);
    }
  };

  const generateSelectedReceipts = (specificBatch?: Contribution[], action: 'save' | 'print' = 'save') => {
    const currentContribs = specificBatch || selectedForPrint;
    if (currentContribs.length === 0) return;
    
    // Sort by year then month
    const sortedContribs = [...currentContribs].sort((a, b) => {
      if (a.reference_year !== b.reference_year) {
        return a.reference_year - b.reference_year;
      }
      return a.reference_month - b.reference_month;
    });
    
    if (sortedContribs.length === 1) {
      generateReceipt(sortedContribs[0], action);
    } else {
      generateMultiReceipt(sortedContribs, action);
    }
  };

  const generateMultiReceipt = async (selectedContribs: Contribution[], action: 'save' | 'print' = 'save') => {
    const student = (selectedContribs[0] as any).student || selectedStudent;
    if (!student) return;
    
    const studentClass = classes.find(c => c.id === student.class_id);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    const drawSection = (startY: number, title: string, currentContribs: Contribution[]) => {
      // Header Section
      const centerX = pageWidth / 2;
      
      // Left Logo
      let textStartX = margin;
      let logoWidth = 0;

      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'auto', margin, startY, 18, 18);
          logoWidth = 22;
        } catch (e) {}
      }
      
      textStartX = margin + logoWidth;

      // Text Content
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('DIOCESE DE GUARULHOS', textStartX, startY + 4);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text((institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS').toUpperCase(), textStartX, startY + 10);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80);
      doc.text((institution?.subtitle || '').toUpperCase(), textStartX, startY + 14);

      const contactInfo = [
        institution?.phone ? `TEL: ${institution.phone}` : '',
        institution?.email ? `EMAIL: ${institution.email.toLowerCase()}` : ''
      ].filter(Boolean).join('  |  ');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(contactInfo, textStartX, startY + 18);

      // Main Horizontal Divider
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.line(margin, startY + 20, pageWidth - margin, startY + 20);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('RECIBO DE CONTRIBUIÇÃO MENSAL (MÚLTIPLO)', centerX, startY + 26, { align: 'center' });
      
      doc.setFontSize(7);
      doc.text(title, pageWidth - margin, startY + 26, { align: 'right' });

      // Student Info Section
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, startY + 28, pageWidth - (margin * 2), 10, 'F');
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(120);
      doc.text('MATRICULA / ALUNO(A)', margin + 3, startY + 32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text(`${student.registration_number || '---'} - ${student.name.toUpperCase()}`, margin + 3, startY + 36);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text('TURMA / CURSO', pageWidth - margin - 50, startY + 32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${studentClass?.code || '---'} - ${student.course || '---'}`, pageWidth - margin - 50, startY + 36);

      // Grid for multiple payments
      const tableRows: any[][] = [];
      for (let i = 0; i < currentContribs.length; i += 2) {
        const row = [];
        for (let j = 0; j < 2; j++) {
          const c = currentContribs[i + j];
          if (c) {
            const method = c.pix_id ? 'PIX (Importado)' : (c.payment_method || 'Dinheiro');
            row.push(`${MONTHS[c.reference_month - 1]} / ${c.reference_year}`);
            row.push(formatCurrency(c.amount));
            row.push(method);
          } else {
            row.push('', '', '');
          }
        }
        tableRows.push(row);
      }

      autoTable(doc, {
        startY: startY + 39,
        head: [['Mês/Ano', 'Valor', 'Metodo', 'Mês/Ano', 'Valor', 'Metodo']],
        body: tableRows,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1, halign: 'center' },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        margin: { left: margin, right: margin }
      });

      const nextY = (doc as any).lastAutoTable.finalY + 3;
      
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      const totalBatch = currentContribs.reduce((acc, curr) => acc + curr.amount, 0);
      doc.text(`Recebido em: ${safeFormat(new Date(), 'dd/MM/yyyy')}`, margin, nextY + 3);
      doc.text(`TOTAL ACUMULADO => ${formatCurrency(totalBatch)}`, pageWidth - margin, nextY + 3, { align: 'right' });

      // Box Message / Observations
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.rect(margin, nextY + 6, pageWidth - (margin * 2), 18);
      
      const contribObs = currentContribs.map(c => c.observations).filter(Boolean).join('; ');
      const finalMsg = [contribObs, institution?.receipt_message].filter(Boolean).join(' • ');
      
      if (finalMsg) {
        doc.setFontSize(6);
        doc.setTextColor(100);
        const customLines = doc.splitTextToSize(finalMsg, pageWidth - (margin * 2) - 10);
        doc.text(customLines, margin + 5, nextY + 11);
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.text('" PAZ E BEM "', pageWidth / 2, nextY + 15, { align: 'center' });
      }

      // Signatures
      const sigY = nextY + 38;
      doc.setDrawColor(200);
      doc.line(margin + 10, sigY, margin + 70, sigY);
      doc.line(pageWidth - margin - 70, sigY, pageWidth - margin - 10, sigY);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('ASSINATURA DO ALUNO', margin + 40, sigY + 3, { align: 'center' });
      doc.text('CARIMBO E ASSINATURA ESCOLA', pageWidth - margin - 40, sigY + 3, { align: 'center' });

      // Footer
      doc.setFontSize(5.5);
      doc.setTextColor(180);
      const footerText = (institution?.footer_text || `Documento emitido via ${institution?.name || 'Sistema de Gestão'}`).toUpperCase();
      doc.text(footerText, pageWidth / 2, sigY + 8, { align: 'center' });

      // Footer Metadata
      doc.setFontSize(4.5);
      doc.setTextColor(180);
      const multipleMethods = Array.from(new Set(currentContribs.map(c => c.pix_id ? 'PIX por Importação' : `Pagamento Direto (${c.payment_method || 'Dinheiro'})`))).join(' / ');
      const regDates = currentContribs.map(c => safeFormat(c.created_at || c.payment_date, 'dd/MM/yyyy')).join(', ');
      doc.text(`SISTEMA ${institution?.name?.toUpperCase() || 'ESCMIN'} - REGISTRO(S): ${regDates} - MODO(S): ${multipleMethods.toUpperCase()}`, pageWidth / 2, sigY + 11, { align: 'center' });
    };

    // First copy
    drawSection(10, 'VIA - ESCOLA', selectedContribs);
    // Dashed line
    doc.setLineWidth(0.4);
    doc.setDrawColor(120, 120, 120);
    (doc as any).setLineDash([2, 2]);
    doc.line(0, 148.5, pageWidth, 148.5);
    (doc as any).setLineDash([]);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    // Second copy
    drawSection(155, 'VIA - ALUNO', selectedContribs);

    if (action === 'save') {
      doc.save(`Recibo_Multiplo_${student.name.replace(/\s+/g, '_')}.pdf`);
    } else {
      triggerDirectPrint(selectedContribs);
    }
  };

  const generateReceipt = async (contribution: Contribution, action: 'save' | 'print' = 'save') => {
    const student = (contribution as any).student || selectedStudent;
    if (!student) return;
    
    const studentClass = classes.find(c => c.id === student.class_id);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    const drawSection = (startY: number, title: string) => {
      // Header Section
      const centerX = pageWidth / 2;
      
      // Left Logo
      let textStartX = margin;
      let logoWidth = 0;

      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'auto', margin, startY, 18, 18);
          logoWidth = 22;
        } catch (e) {}
      }
      
      textStartX = margin + logoWidth;

      // Text Content
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('DIOCESE DE GUARULHOS', textStartX, startY + 4);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text((institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS').toUpperCase(), textStartX, startY + 10);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80);
      doc.text((institution?.subtitle || '').toUpperCase(), textStartX, startY + 14);

      const contactInfo = [
        institution?.phone ? `TEL: ${institution.phone}` : '',
        institution?.email ? `EMAIL: ${institution.email.toLowerCase()}` : ''
      ].filter(Boolean).join('  |  ');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(contactInfo, textStartX, startY + 18);

      // Main Horizontal Divider
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.line(margin, startY + 20, pageWidth - margin, startY + 20);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('RECIBO DE CONTRIBUIÇÃO MENSAL', centerX, startY + 26, { align: 'center' });
      
      doc.setFontSize(7);
      doc.text(title, pageWidth - margin, startY + 26, { align: 'right' });

      // Student Info Section
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, startY + 28, pageWidth - (margin * 2), 12, 'F');
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(120);
      doc.text('MATRICULA / ALUNO(A)', margin + 3, startY + 33);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text(`${student.registration_number || '---'} - ${student.name.toUpperCase()}`, margin + 3, startY + 37);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text('TURMA / CURSO', pageWidth - margin - 50, startY + 33);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${studentClass?.code || '---'} - ${student.course || '---'}`, pageWidth - margin - 50, startY + 37);

      const method = contribution.pix_id ? 'PIX (Importado)' : (contribution.payment_method || 'Dinheiro');
      const origin = contribution.origin ? ` (${contribution.origin})` : '';

      // Main Table
      autoTable(doc, {
        startY: startY + 42,
        head: [['Mês / Ano Referência', 'Valor da Contribuição', 'Meio de Pagamento / Origem']],
        body: [[
          `${MONTHS[contribution.reference_month - 1]} / ${contribution.reference_year}`,
          formatCurrency(contribution.amount),
          `${method}${origin}`
        ]],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, halign: 'center' },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        margin: { left: margin, right: margin }
      });

      const nextY = (doc as any).lastAutoTable.finalY + 5;
      
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`Recebido em: ${safeFormat(contribution.payment_date, 'dd/MM/yyyy')}`, margin, nextY + 5);
      doc.text(`VALOR TOTAL => ${formatCurrency(contribution.amount)}`, pageWidth - margin, nextY + 5, { align: 'right' });

      // Observations Box
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.rect(margin, nextY + 10, pageWidth - (margin * 2), 20);
      
      const finalMsg = [contribution.observations, institution?.receipt_message].filter(Boolean).join(' • ');
      if (finalMsg) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        const customLines = doc.splitTextToSize(finalMsg, pageWidth - (margin * 2) - 10);
        doc.text(customLines, margin + 5, nextY + 16);
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('" PAZ E BEM "', pageWidth / 2, nextY + 22, { align: 'center' });
      }

      // Signatures
      const sigY = nextY + 45;
      doc.setDrawColor(200);
      doc.line(margin + 10, sigY, margin + 70, sigY);
      doc.line(pageWidth - margin - 70, sigY, pageWidth - margin - 10, sigY);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('ASSINATURA DO ALUNO', margin + 40, sigY + 3, { align: 'center' });
      doc.text('CARIMBO E ASSINATURA ESCOLA', pageWidth - margin - 40, sigY + 3, { align: 'center' });

      // Footer Metadata
      doc.setFontSize(5);
      doc.setTextColor(150);
      const regDateStr = safeFormat(contribution.created_at || contribution.payment_date, 'dd/MM/yyyy HH:mm');
      const pmMethodStr = contribution.pix_id ? 'PIX POR IMPORTAÇÃO' : `PAGAMENTO DIRETO (${(contribution.payment_method || 'Dinheiro').toUpperCase()})`;
      doc.text(`SISTEMA ${institution?.name?.toUpperCase() || 'ESCMIN'} - EMISSÃO: ${safeFormat(new Date(), 'dd/MM/yyyy HH:mm')} - REGISTRO DO PAGAMENTO: ${regDateStr} - MODO DE PAGAMENTO: ${pmMethodStr}`, margin, sigY + 8);
    };

    // First copy
    drawSection(10, 'VIA - ESCOLA');
    // Dashed line
    doc.setLineWidth(0.4);
    doc.setDrawColor(120, 120, 120);
    (doc as any).setLineDash([2, 2]);
    doc.line(0, 148.5, pageWidth, 148.5);
    (doc as any).setLineDash([]);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    // Second copy
    drawSection(155, 'VIA - ALUNO');

    if (action === 'save') {
      doc.save(`Recibo_${student.name.replace(/\s+/g, '_')}_${contribution.reference_month}.pdf`);
    } else {
      triggerDirectPrint([contribution]);
    }
  };
  const generateStatement = async () => {
    if (!selectedStudent) return;
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;
      const centerX = pageWidth / 2;
      let y = 15;

      // Professional Header
      let textStartX = margin;
      let logoWidth = 0;

      if (institution?.logo_url) {
        try { 
          doc.addImage(institution.logo_url, 'auto', margin, y, 22, 22); 
          logoWidth = 26;
        } catch (e) {}
      }
      
      textStartX = margin + logoWidth;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('DIOCESE DE GUARULHOS', textStartX, y + 5);

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(institution?.name?.toUpperCase() || 'ESCMIN - GESTÃO ESCOLAR', textStartX, y + 13);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80);
      doc.text(institution?.subtitle?.toUpperCase() || '', textStartX, y + 18);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(margin, y + 25, pageWidth - margin, y + 25);

      y += 35;

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text('EXTRATO ANUAL DE CONTRIBUIÇÕES', centerX, y, { align: 'center' });
      
      y += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50);
      doc.text(`ALUNO: ${selectedStudent.name.toUpperCase()}`, margin, y);
      doc.text(`MATRÍCULA: ${selectedStudent.registration_number || '---'}`, margin, y + 5);
      doc.text(`ANO DE REFERÊNCIA: ${selectedYear}`, pageWidth - margin, y, { align: 'right' });

      const statementData = MONTHS.map((month, idx) => {
        const contrib = contributions.find(c => c.reference_month === idx + 1);
        return [
          month.toUpperCase(),
          contrib ? formatCurrency(contrib.amount) : '---',
          contrib ? safeFormat(contrib.payment_date, 'dd/MM/yyyy') : 'PENDENTE',
          contrib?.observations || ''
        ];
      });

      autoTable(doc, {
        startY: y + 10,
        head: [['MÊS DE REFERÊNCIA', 'VALOR PAGO', 'DATA PAGAMENTO', 'OBSERVAÇÕES']],
        body: statementData,
        theme: 'grid',
        headStyles: { fillColor: [0, 23, 75], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'center' }
        }
      });

      const total = contributions.reduce((acc, c) => acc + c.amount, 0);
      let finalY = (doc as any).lastAutoTable.finalY + 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(`TOTAL ACUMULADO NO ANO: ${formatCurrency(total)}`, pageWidth - margin, finalY, { align: 'right' });

      // Important notes / Footer
      if (institution?.receipt_message || institution?.footer_text) {
        finalY = doc.internal.pageSize.height - 30;
        doc.setLineWidth(0.2);
        doc.setDrawColor(200);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150);
        
        const footerNote = institution?.receipt_message || '';
        const splitNote = doc.splitTextToSize(footerNote, pageWidth - margin * 2);
        doc.text(splitNote, centerX, finalY + 5, { align: 'center' });
        
        const sysInfo = institution?.footer_text || `Documento oficial gerado via ${institution?.name || 'Sistema de Gestão'} em ${new Date().toLocaleString('pt-BR')}`;
        doc.text(sysInfo.toUpperCase(), centerX, finalY + 15, { align: 'center' });
      }

      doc.save(`Extrato_${selectedStudent.name.replace(/\s+/g, '_')}_${selectedYear}.pdf`);
    } catch (error) {
      console.error('Error generating statement:', error);
      alert('Erro ao gerar extrato anual');
    }
  };

  const clearSelection = () => {
    setSelectedStudent(null);
    setContributions([]);
    setSearchTerm('');
    setSearchByName('');
    setStudents([]);
    setStartDate('');
    setEndDate('');
    setViewMode('period');
    fetchRecentContributions();
  };

  const filteredStudents = students;

  return (
    <>
      <div className={cn(
        "h-[calc(100vh-8rem)] flex flex-col gap-2 print:hidden",
        isPrinting && "hidden"
      )}>
      <PageHeader
        title="Gestão de Contribuições"
        description="Lançamento e controle de contribuições de uso interno da tesouraria."
        icon={TrendingUp}
        badge="Tesouraria & Conferência"
      >
        <button 
          onClick={clearSelection}
          className="h-10 px-4 bg-white border border-slate-200 text-slate-600 rounded-none hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer text-[10px] font-bold uppercase tracking-wider"
        >
          <X size={14} /> Limpar Filtros
        </button>
      </PageHeader>

      <div className="bg-white p-5 rounded-none shadow-sm border border-slate-200/80 flex flex-col gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-50/50 p-3 rounded-none border border-slate-200/50">
          {/* Busca por Nome */}
          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome / Matrícula</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {isSearching ? <Loader2 size={16} className="text-blue-500 animate-spin" /> : <Search size={16} className="text-slate-400" />}
              </div>
              <input 
                type="text"
                placeholder="Pesquisar..."
                value={searchTerm || searchByName}
                onChange={(e) => {
                  setSearchByName(e.target.value);
                  handleSearchStudents(e.target.value);
                }}
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-none text-sm focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 transition-all font-medium text-slate-700"
              />
            </div>
          </div>

          {/* Filtro de Tipo de Data */}
          <div className="lg:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-3">Tipo</label>
            <input 
              type="text"
              readOnly
              value="AUTOMÁTICO"
              className="w-full px-4 h-[3.25rem] bg-slate-100/60 border border-slate-200 rounded-none text-xs font-black uppercase tracking-wider text-slate-500 cursor-not-allowed select-none flex items-center justify-center text-center"
              title="O tipo é detectado automaticamente nas informações consultadas (Pagamento Direto ou PIX por Importação)."
            />
          </div>

          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-3">Período</label>
            <div className="flex items-center gap-2 bg-white p-1 rounded-none border border-slate-200 h-[3.25rem]">
              <div className="flex-1 flex items-center px-3 gap-2">
                <Calendar size={14} className="text-slate-300" />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold uppercase text-[#131b2e] focus:ring-0 w-full p-0"
                />
              </div>
              <div className="w-px h-6 bg-slate-100" />
              <div className="flex-1 flex items-center px-3 gap-2">
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold uppercase text-[#131b2e] focus:ring-0 w-full p-0"
                />
              </div>
            </div>
          </div>

          {/* Ação */}
          <div className="lg:col-span-2 flex items-end">
            <button 
              onClick={fetchPeriodContributions}
              className="w-full h-[3.25rem] bg-slate-900 text-white rounded-none font-bold text-[10px] uppercase tracking-wider hover:bg-slate-800 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm"
            >
              <Search size={14} />
              Filtrar
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-2 overflow-hidden">
        {/* Sidebar - Conditional Results or Recent */}
        <div className={cn(
          "w-80 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden transition-all duration-300 order-last",
          searchTerm.length > 0 || students.length > 0 ? "translate-x-0" : "-translate-x-full opacity-0 pointer-events-none w-0"
        )}>
            <div className="p-4 border-b border-slate-50">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                Resultados
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px]">{students.length}</span>
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {students.length === 0 && searchTerm.length >= 3 && !isSearching && (
              <div className="p-8 text-center space-y-3">
                <Search size={32} className="mx-auto text-slate-200" />
                <p className="text-xs font-bold text-slate-400">Nenhum contribuinte encontrado.</p>
              </div>
            )}
            {students.map((student) => (
              <button
                key={student.id}
                onClick={() => { setViewMode('individual'); handleSelectStudent(student); }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left",
                  selectedStudent?.id === student.id 
                    ? "bg-blue-600 text-white shadow-xl shadow-blue-200" 
                    : "hover:bg-slate-50 text-slate-600 border border-transparent"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px]",
                  selectedStudent?.id === student.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                )}>
                  {student.registration_number.split('/')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate">{student.name}</p>
                  <p className={cn(
                    "text-[10px] font-bold truncate opacity-60",
                    selectedStudent?.id === student.id ? "text-white" : "text-slate-400"
                  )}>
                    {student.registration_number}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          {/* Aba de navegação de modos de visualização */}
          <div className="flex border-b border-slate-100 bg-slate-50/40 p-1.5 shrink-0 gap-1.5">
            <button
              onClick={() => {
                setViewMode('period');
                fetchPeriodContributions();
              }}
              className={cn(
                "flex-1 py-2.5 px-4 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2",
                viewMode === 'period' 
                  ? "bg-[#131b2e] text-white shadow-lg" 
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              <Calendar size={14} />
              Lançamentos do Período
            </button>
            <button
              onClick={() => {
                if (selectedStudent) {
                  setViewMode('individual');
                } else {
                  setNotification({ type: 'info', message: 'Selecione um contribuinte no campo "Nome / Matrícula" acima para ver a Ficha Individual' });
                }
              }}
              className={cn(
                "flex-1 py-2.5 px-4 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2",
                viewMode === 'individual' 
                  ? "bg-[#131b2e] text-white shadow-lg" 
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                !selectedStudent && "opacity-50 cursor-not-allowed"
              )}
            >
              <UserIcon size={14} />
              Ficha Individual {selectedStudent ? `(${selectedStudent.name.split(' ')[0]})` : ''}
            </button>
            <button
              onClick={() => {
                setViewMode('unpaid');
                fetchUnpaidData();
              }}
              className={cn(
                "flex-1 py-2.5 px-4 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2",
                viewMode === 'unpaid' 
                  ? "bg-[#131b2e] text-white shadow-lg" 
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              <AlertCircle size={14} />
              Mensalidades em Aberto
            </button>
          </div>

          {viewMode === 'unpaid' ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
              {/* Unpaid Filters & Header */}
              <div className="p-5 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-[#131b2e] flex items-center gap-2">
                    <AlertCircle size={18} className="text-[#131b2e]" />
                    Inadimplência de Mensalidades
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Acompanhamento de mensalidades em aberto e controle de arrecadação para o ano letivo de <strong>{unpaidYear}</strong>.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Selector of Year */}
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                    <button 
                      onClick={() => {
                        const newY = unpaidYear - 1;
                        setUnpaidYear(newY);
                        fetchUnpaidData(newY);
                      }}
                      className="p-1.5 hover:bg-white rounded-lg transition-all"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-3 text-xs font-black text-[#131b2e]">{unpaidYear}</span>
                    <button 
                      onClick={() => {
                        const newY = unpaidYear + 1;
                        setUnpaidYear(newY);
                        fetchUnpaidData(newY);
                      }}
                      className="p-1.5 hover:bg-white rounded-lg transition-all"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Class Filter */}
                  <select
                    value={unpaidClassFilter}
                    onChange={(e) => setUnpaidClassFilter(e.target.value)}
                    className="h-10 px-3 bg-slate-100 border-none rounded-xl text-xs font-black text-[#131b2e] focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">SELECIONE UMA TURMA...</option>
                    <option value="all">TODAS AS TURMAS</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                    ))}
                  </select>

                  {/* Print Report PDF Button */}
                  <button
                    onClick={generateUnpaidReport}
                    disabled={!unpaidClassFilter || unpaidReportList.length === 0}
                    className="h-10 px-4 bg-[#131b2e] text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md active:scale-95"
                  >
                    <FileDown size={15} />
                    Exportar PDF
                  </button>
                </div>
              </div>

              {/* Unpaid Search Input */}
              <div className="px-5 py-3 border-b border-slate-100 bg-white shrink-0">
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar inadimplentes por nome ou RA..."
                    value={unpaidSearchTerm}
                    onChange={(e) => setUnpaidSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-medium text-slate-700 placeholder-slate-400 focus:bg-slate-100 focus:ring-2 focus:ring-slate-150 transition-all"
                  />
                </div>
              </div>

              {/* Unpaid Content Area */}
              <div className="flex-1 overflow-y-auto p-5">
                {unpaidLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={36} className="text-blue-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Processando cruzamento de dados...</p>
                  </div>
                ) : !unpaidClassFilter ? (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
                    <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
                      <Search size={32} className="text-blue-500 opacity-80" />
                    </div>
                    <h4 className="text-sm font-black text-[#131b2e] uppercase tracking-wider">Selecione uma Turma</h4>
                    <p className="text-xs text-center text-slate-400 max-w-sm mt-2 leading-relaxed">
                      Selecione uma turma específica no filtro acima ou escolha <strong>Todas as Turmas</strong> para carregar o relatório de mensalidades em aberto.
                    </p>
                  </div>
                ) : unpaidReportList.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-4">
                      <CheckCircle2 size={32} className="text-emerald-500 opacity-80" />
                    </div>
                    <h4 className="text-sm font-black text-[#131b2e] uppercase tracking-wider">Tudo Regularizado!</h4>
                    <p className="text-xs text-center text-slate-400 max-w-sm mt-2 leading-relaxed">
                      Nenhum estudante ativo elegível possui mensalidades pendentes para os filtros selecionados neste ano de {unpaidYear}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alunos em Aberto</p>
                          <h4 className="text-2xl font-black text-[#131b2e] mt-1">{unpaidReportList.length} Alunos</h4>
                        </div>
                        <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center">
                          <UserIcon size={22} />
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Total Vencido (Atrasado)</p>
                          <h4 className="text-2xl font-black text-rose-600 mt-1">
                            {formatCurrency(unpaidStats.totalOverdueDebt)}
                          </h4>
                        </div>
                        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                          <DollarSign size={22} />
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Total a Vencer (Projetado)</p>
                          <h4 className="text-2xl font-black text-blue-600 mt-1">
                            {formatCurrency(unpaidStats.totalFutureDebt)}
                          </h4>
                        </div>
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                          <DollarSign size={22} />
                        </div>
                      </div>
                    </div>

                    {/* Table List of Debtors */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Estudante</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Turma</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Meses Pendentes</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Meses em Aberto</th>
                            <th className="px-6 py-4 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Valor Estimado</th>
                            <th className="px-6 py-4"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {unpaidReportList.map(item => {
                            const className = classes.find(c => c.id === item.student.class_id)?.name || 'Sem turma';
                            const currentYear = new Date().getFullYear();
                            const currentMonth = new Date().getMonth() + 1; // 1-indexed

                            const overdueMonths = item.unpaidMonths.filter(m => {
                              const isFuture = unpaidYear > currentYear || (unpaidYear === currentYear && m > currentMonth);
                              return !isFuture;
                            });
                            const hasOverdue = overdueMonths.length > 0;

                            return (
                              <tr key={item.student.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm",
                                      hasOverdue ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                                    )}>
                                      {item.student.name.charAt(0)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-[#131b2e] leading-snug">{item.student.name}</p>
                                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.student.registration_number}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                    {className}
                                  </span>
                                </td>
                                <td className={cn(
                                  "px-6 py-4 text-center font-black text-sm",
                                  hasOverdue ? "text-rose-600" : "text-blue-600"
                                )}>
                                  {item.pendingCount}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1 max-w-[280px]">
                                    {item.unpaidMonths.map(m => {
                                      const isFuture = unpaidYear > currentYear || (unpaidYear === currentYear && m > currentMonth);
                                      return (
                                        <span 
                                          key={m} 
                                          className={cn(
                                            "px-2 py-0.5 border rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center gap-1",
                                            isFuture 
                                              ? "bg-blue-50 text-blue-600 border-blue-100/50" 
                                              : "bg-rose-50 text-rose-600 border-rose-100/50"
                                          )}
                                          title={isFuture ? 'Mensalidade a vencer' : 'Mensalidade vencida'}
                                        >
                                          {MONTHS[m - 1].substring(0, 3)}
                                          {isFuture && <span className="text-[7px]">⏳</span>}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className={cn(
                                    "text-sm font-black px-3 py-1.5 rounded-xl",
                                    hasOverdue ? "text-rose-600 bg-rose-50" : "text-blue-600 bg-blue-50"
                                  )}>
                                    {formatCurrency(item.estimatedDebt)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    onClick={() => {
                                      setSelectedStudent(item.student);
                                      setViewMode('individual');
                                      fetchContributions(item.student.id, unpaidYear);
                                    }}
                                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                  >
                                    Regularizar
                                  </button>
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
            </div>
          ) : selectedStudent && viewMode === 'individual' ? (
          <>
            <div className="p-4 border-b border-slate-50 bg-slate-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-3xl bg-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-blue-200">
                    {selectedStudent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#131b2e] leading-tight">{selectedStudent.name}</h3>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><Calendar size={14} /> {selectedStudent.registration_number}</span>
                      <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-lg text-[10px] font-black uppercase tracking-wider">{selectedStudent.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <button 
                      onClick={() => setSelectedYear(selectedYear - 1)}
                      className="p-1 px-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="px-2 text-sm font-black text-[#131b2e]">{selectedYear}</span>
                    <button 
                      onClick={() => setSelectedYear(selectedYear + 1)}
                      className="p-1 px-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                        {selectedForPrint.length > 0 && (
                          <div className="flex gap-1.5">
                            <button 
                              onClick={() => {
                                generateSelectedReceipts(selectedForPrint, 'print');
                                setSelectedForPrint([]);
                              }}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-lg active:scale-95 animate-in fade-in slide-in-from-right-4"
                            >
                              <Printer size={14} />
                              ({selectedForPrint.length})
                            </button>
                          </div>
                        )}
                  <button 
                    onClick={() => {
                      setIsPrintingStatement(true);
                      setTimeout(() => {
                        window.focus();
                        try {
                          window.print();
                        } catch (err) {
                          console.error("Print failed:", err);
                          setNotification({
                            type: 'error',
                            message: 'A impressão direta é bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba para imprimir.'
                          });
                        }
                      }, 600);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#00174b] text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#002a8a] transition-all shadow-lg active:scale-95"
                  >
                    <FileText size={16} />
                    Extrato
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0"><TrendingUp size={14} /></div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total no Ano</p>
                    <p className="text-sm font-black text-[#131b2e]">{formatCurrency(contributions.reduce((acc, c) => acc + c.amount, 0))}</p>
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-50 text-green-600 rounded-lg flex items-center justify-center shrink-0"><CheckCircle2 size={14} /></div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Meses Pagos</p>
                    <p className="text-sm font-black text-[#131b2e]">{contributions.length} / 12</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {MONTHS.map((month, idx) => {
                  const contrib = contributions.find(c => c.reference_month === idx + 1);
                  return (
                    <div 
                      key={month}
                      className={cn(
                        "group p-3 rounded-xl border transition-all duration-300 flex flex-col gap-2.5 h-full",
                        contrib 
                          ? "bg-emerald-50/50 border-emerald-100 ring-1 ring-emerald-50/50" 
                          : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {contrib && (
                            <input 
                              type="checkbox"
                              checked={selectedForPrint.some(c => c.id === contrib.id)}
                              onChange={() => togglePrintSelection(contrib)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          )}
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            contrib ? "text-emerald-600" : "text-slate-400"
                          )}>
                            {month}
                          </span>
                        </div>
                        {contrib && (
                          <div className="w-5 h-5 rounded-md bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/10">
                            <CheckCircle2 size={12} />
                          </div>
                        )}
                      </div>

                      {contrib ? (
                        <>
                          <div className="space-y-0.5">
                            <p className="text-lg font-black text-[#131b2e] leading-none">{formatCurrency(contrib.amount)}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[9px] font-bold text-slate-400">Pago: {safeFormat(contrib.payment_date, 'dd/MM/yy')}</p>
                              <span className={cn(
                                "px-1.5 py-px rounded text-[7px] font-black uppercase tracking-wider border",
                                contrib.pix_id 
                                  ? "bg-blue-50 text-blue-600 border-blue-100" 
                                  : "bg-slate-50 text-slate-600 border-slate-100"
                              )}>
                                {contrib.pix_id ? 'Importado' : `Direto (${contrib.payment_method || 'Dinheiro'})`}
                              </span>
                            </div>
                            {contrib.observations && (
                              <p className="text-[9px] text-slate-400 italic truncate" title={contrib.observations}>
                                {contrib.observations}
                              </p>
                            )}
                          </div>
                           <div className="flex gap-2 pt-1.5 border-t border-emerald-100/50">
                             <button 
                               onClick={() => setReceiptPreviewData([contrib])}
                               className="p-1.5 bg-white text-slate-400 border border-slate-100 rounded-lg hover:bg-slate-50 transition-all"
                               title="Visualizar Recibo"
                             >
                               <FileText size={14} />
                             </button>
                             <button 
                               onClick={() => generateSelectedReceipts([contrib], 'print')}
                               className="flex-1 py-1.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
                             >
                               <Printer size={10} />
                               Imprimir
                             </button>
                             {contrib.pix_id && (
                               <button 
                                 onClick={() => setUnlinkConfirmationFor(contrib)}
                                 className="flex-1 py-1.5 bg-slate-50 text-blue-500 border border-slate-100 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-1.5"
                                 title="Tornar Manual (Desvincular do Pix)"
                               >
                                 <Link2Off size={10} />
                                 Manual
                               </button>
                             )}
                             <button 
                               onClick={() => setDeleteConfirmationFor(contrib)}
                               disabled={isDeleting === contrib.id}
                               className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 transition-all bg-white border border-red-100 rounded-xl shadow-sm disabled:opacity-50"
                               title="Excluir Registro / Recibo"
                             >
                               {isDeleting === contrib.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                             </button>
                           </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-0.5 py-1">
                            <p className="text-xs font-bold text-slate-300">Pendente</p>
                          </div>
                          <button 
                            onClick={() => handleAddContribution(idx)}
                            className="w-full py-2 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all border border-dashed border-slate-200 flex items-center justify-center gap-1.5"
                          >
                            <Plus size={12} />
                            Registrar
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
          ) : viewMode === 'period' ? (
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#131b2e] leading-tight">Relatório de Período</h3>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
                      {formatDateForDisplay(startDate)} ATÉ {formatDateForDisplay(endDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-4">
                    <div className="flex flex-col items-center">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Total</p>
                      <p className="text-base font-black text-[#131b2e]">{formatCurrency(periodData.reduce((acc, c) => acc + c.amount, 0))}</p>
                    </div>
                    <div className="w-px h-6 bg-emerald-200" />
                    <div className="flex flex-col items-center text-right">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Registros</p>
                      <p className="text-base font-black text-[#131b2e]">{periodData.length}</p>
                    </div>
                  </div>

                  {selectedForPrint.length > 0 && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                      <button 
                        onClick={() => {
                          triggerDirectPrint(selectedForPrint);
                        }}
                        className="px-4 py-3 bg-white text-emerald-600 border border-emerald-600 rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-emerald-50 transition-all flex items-center gap-2 shadow-sm"
                      >
                        <FileDown size={14} />
                        Ver ({selectedForPrint.length})
                      </button>
                      <button 
                        onClick={() => {
                          generateSelectedReceipts(selectedForPrint, 'print');
                          setSelectedForPrint([]);
                        }}
                        className="px-4 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                      >
                        <Printer size={14} />
                        Imprimir Seleção
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto rounded-3xl border border-slate-100 shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 w-10"></th>
                      <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Contribuinte / Matrícula</th>
                      <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Informação do Período</th>
                      <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Método</th>
                      <th className="px-6 py-4 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Valor Total</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-24 text-center text-slate-300">
                          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                            <AlertCircle size={32} className="opacity-20" />
                          </div>
                          <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Nenhum registro encontrado</p>
                          <p className="text-sm text-slate-300 mt-2">Tente ajustar os filtros de data ou nome acima.</p>
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        const grouped = periodData.reduce((acc, curr) => {
                          const studentId = curr.student_id;
                          if (!acc[studentId]) {
                            acc[studentId] = {
                              student: curr.student,
                              contributions: [],
                              total: 0
                            };
                          }
                          acc[studentId].contributions.push(curr);
                          acc[studentId].total += Number(curr.amount);
                          return acc;
                        }, {} as Record<string, { student?: Student; contributions: (Contribution & { student?: Student })[]; total: number }>);

                        return Object.values(grouped).map((group: any) => {
                          const studentId = group.student?.id || '';
                          const isExpanded = expandedStudents.includes(studentId);
                          
                          return (
                            <React.Fragment key={studentId}>
                              <tr 
                                onClick={(e) => {
                                  // Don't toggle if clicking a button
                                  if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                                  toggleStudentExpansion(studentId);
                                }}
                                className={cn(
                                  "border-b border-slate-50 hover:bg-slate-50 transition-all cursor-pointer group relative",
                                  isExpanded ? "bg-slate-50/50" : ""
                                )}
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-4">
                                     <input 
                                      type="checkbox"
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      checked={group.contributions.every((c: any) => selectedForPrint.some(s => s.id === c.id))}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        if (e.target.checked) {
                                          setSelectedForPrint(prev => {
                                            const next = [...prev];
                                            let addedCount = 0;
                                            group.contributions.forEach((c: any) => {
                                              if (next.length < 6 && !next.some(s => s.id === c.id)) {
                                                next.push(c);
                                                addedCount++;
                                              }
                                            });
                                            if (next.length >= 6 && addedCount < group.contributions.length) {
                                              setNotification({ type: 'error', message: '⚠️ ATENÇÃO: Apenas 6 itens permitidos por recibo. Nem todos os itens do grupo foram selecionados.' });
                                            }
                                            return next;
                                          });
                                        } else {
                                          const groupIds = group.contributions.map((c: any) => c.id);
                                          setSelectedForPrint(prev => prev.filter(c => !groupIds.includes(c.id)));
                                        }
                                      }}
                                    />
                                    <div className={cn(
                                      "p-1.5 rounded-lg transition-all",
                                      isExpanded ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                    )}>
                                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs">
                                      {group.student?.name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-[#131b2e] leading-snug">{group.student?.name || 'Contribuinte Deletado'}</p>
                                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{group.student?.registration_number || 'S/ MATRÍCULA'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                                    {group.contributions.length} {group.contributions.length === 1 ? 'Lançamento' : 'Lançamentos'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    {Array.from(new Set(group.contributions.map((c: any) => c.pix_id ? 'PIX por Importação' : `Pagamento Direto (${c.payment_method || 'Dinheiro'})`))).map((type: any) => (
                                      <span 
                                        key={type} 
                                        className={cn(
                                          "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border",
                                          type.startsWith('PIX')
                                            ? "bg-blue-50 text-blue-600 border-blue-100"
                                            : "bg-slate-50 text-slate-600 border-slate-100"
                                        )}
                                      >
                                        {type}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className="text-sm font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl">{formatCurrency(group.total)}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const studentWithId = group.student ? { id: studentId, ...group.student } : null;
                                        setSelectedStudent(studentWithId as Student); 
                                        setViewMode('individual'); 
                                        fetchContributions(studentId, group.contributions[0].reference_year); 
                                      }} 
                                      className="p-2.5 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm border border-blue-100" 
                                      title="Extrato do Aluno"
                                    >
                                      <FileText size={18} />
                                    </button>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        triggerDirectPrint(group.contributions);
                                      }} 
                                      className="p-2.5 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm border border-emerald-100" 
                                      title="Visualizar Recibos Multiplos"
                                    >
                                      <Printer size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && group.contributions.map((c: any) => (
                                <tr key={c.id} className="bg-slate-50/10 border-b border-slate-50/50 hover:bg-slate-50/40 transition-colors group/inner">
                                  <td className="px-6 py-3 pl-12 flex items-center gap-4">
                                     <input 
                                      type="checkbox"
                                      checked={selectedForPrint.some(s => s.id === c.id)}
                                      onChange={() => togglePrintSelection(c)}
                                      className="w-3.5 h-3.5 rounded border-slate-200 text-blue-500 focus:ring-blue-400"
                                    />
                                  </td>
                                  <td className="px-6 py-4 text-xs font-medium text-slate-500">
                                    {filterType === 'payment' ? 'Pago em' : 'Importado em'} {safeFormat(filterType === 'payment' ? c.payment_date : (c.created_at || c.payment_date), 'dd/MM/yyyy')}
                                  </td>
                                  <td className="px-6 py-4 text-xs font-bold uppercase text-[#131b2e] tracking-wider">
                                    {MONTHS[c.reference_month - 1]} / {c.reference_year}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <span className={cn(
                                        "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border",
                                        c.pix_id 
                                          ? "bg-blue-50 text-blue-600 border-blue-100" 
                                          : "bg-slate-50 text-slate-600 border-slate-100"
                                      )}>
                                        {c.pix_id ? 'PIX por Importação' : `Pagamento Direto (${c.payment_method || 'Dinheiro'})`}
                                      </span>
                                      {c.pix_id && <span title="Registro Conciliado"><Link2Off size={11} className="text-blue-500" /></span>}
                                      {c.observations && (
                                        <span className="text-[10px] text-slate-400 italic truncate max-w-[150px]" title={c.observations}>
                                          • {c.observations}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <span className="text-sm font-black text-[#131b2e]">{formatCurrency(c.amount)}</span>
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover/inner:opacity-100 transition-opacity">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setReceiptPreviewData([c]); }} 
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" 
                                        title="Visualizar Recibo"
                                      >
                                        <FileText size={16} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateSelectedReceipts([c], 'print'); }} 
                                        className="p-2 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm" 
                                        title="Imprimir Agora"
                                      >
                                        <Printer size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        });
                      })()
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
              <div className="w-24 h-24 rounded-2xl bg-white border border-slate-100 shadow-xl flex items-center justify-center mb-6">
                <Search size={40} className="text-blue-600 opacity-20" />
              </div>
              <h3 className="text-xl font-black text-[#131b2e]">Controle de Contribuições</h3>
              <p className="text-sm text-center max-w-sm mt-2 text-slate-500 font-medium">
                Pesquise por um contribuinte no campo acima ou filtre um período específico para visualizar os recebimentos.
              </p>
            </div>
          )}
        </div>

        {/* Modais de Confirmação Customizados */}
        {(deleteConfirmationFor || unlinkConfirmationFor) && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 p-8 space-y-6">
              <div className={cn(
                "w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-lg",
                deleteConfirmationFor ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
              )}>
                {deleteConfirmationFor ? <Trash2 size={32} /> : <Link2Off size={32} />}
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-xl font-black text-[#131b2e]">
                  {deleteConfirmationFor ? 'Excluir Lançamento?' : 'Tornar Manual?'}
                </h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  {deleteConfirmationFor 
                    ? `Deseja realmente excluir permanentemente o registro de ${formatCurrency(deleteConfirmationFor.amount)} referente a ${MONTHS[deleteConfirmationFor.reference_month-1]}?`
                    : 'Isso removerá o vínculo com o Pix, tornando este recebimento um registro independente na ficha do aluno.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { setDeleteConfirmationFor(null); setUnlinkConfirmationFor(null); }}
                  className="py-4 bg-slate-50 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={deleteConfirmationFor ? handleDeleteContribution : handleUnlinkPix}
                  className={cn(
                    "py-4 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all active:scale-95",
                    deleteConfirmationFor ? "bg-red-600 hover:bg-red-700 shadow-red-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
                >
                  {deleteConfirmationFor ? 'Confirmar Exclusão' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notificações flutuantes centralizadas com backdrop */}
        {notification && (
          <div className="fixed inset-0 bg-[#020617]/50 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
            <div className={cn(
              "p-6 rounded-2xl shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200 max-w-md w-full border border-white/15",
              notification.type === 'success' ? "bg-emerald-600 text-white" : 
              notification.type === 'error' ? "bg-red-600 text-white" : "bg-blue-600 text-white"
            )}>
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center animate-bounce">
                {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase tracking-widest opacity-80">
                  {notification.type === 'success' ? 'Sucesso' : notification.type === 'error' ? 'Atenção / Erro' : 'Informativo'}
                </h4>
                <p className="text-sm font-bold leading-relaxed">{notification.message}</p>
              </div>
              <button 
                onClick={() => setNotification(null)} 
                className="mt-2 w-full py-2.5 bg-white/20 hover:bg-white/35 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Registro Manual */}
      {manualMonths.length > 0 && (
        <div className="fixed inset-0 bg-[#00174b]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[#00174b]">Registrar Contribuição</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lançamento na Ficha do Aluno • {selectedYear}</p>
                </div>
              </div>
              <button 
                onClick={() => setManualMonths([])}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto">
              {/* Seleção de Meses - Estilo mais profissional */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Selecione os Meses</label>
                  {manualMonths.length > 0 && (
                    <button 
                      onClick={() => setManualMonths([])}
                      className="text-[10px] font-black text-red-500 uppercase hover:underline"
                    >
                      Limpar Tudo
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  {MONTHS.map((m, idx) => (
                    <button
                      key={m}
                      onClick={() => toggleManualMonth(idx)}
                      className={cn(
                        "py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border-2",
                        manualMonths.includes(idx) 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100 scale-[1.02]" 
                          : "bg-white border-white text-slate-500 hover:border-blue-100 hover:text-blue-600"
                      )}
                    >
                      {m.substring(0, 3)}
                    </button>
                  ))}
                </div>
                {manualMonths.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {manualMonths.map(mIdx => (
                      <span key={mIdx} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase border border-blue-100">
                        {MONTHS[mIdx]}
                      </span>
                    ))}
                  </div>
                )}
                {manualMonths.length > 1 && (
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-start gap-2">
                    <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-bold leading-tight">Atenção: O valor total de R$ {manualAmount} será dividido proporcionalmente entre os {manualMonths.length} meses selecionados.</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Valor */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Valor Total</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">R$</span>
                    <input 
                      type="text"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      onBlur={formatManualAmount}
                      onKeyDown={(e) => e.key === 'Enter' && formatManualAmount()}
                      className="w-full bg-slate-50 border-0 rounded-2xl py-4 pl-14 pr-6 text-2xl font-black text-[#00174b] focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Data do Pagamento */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Data do Pagamento</label>
                  <input 
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-slate-50 border-0 rounded-2xl py-4 px-6 text-xl font-black text-[#00174b] focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Método */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Forma de Recebimento</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['Dinheiro', 'PIX', 'Cartão'] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setManualMethod(method)}
                      className={cn(
                        "py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border-2",
                        manualMethod === method 
                          ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" 
                          : "bg-white border-slate-100 text-slate-400 hover:border-blue-200 hover:text-blue-500"
                      )}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Observações</label>
                <textarea 
                  value={manualObservations}
                  onChange={(e) => setManualObservations(e.target.value)}
                  placeholder="Informações adicionais sobre este pagamento..."
                  className="w-full bg-slate-50 border-0 rounded-2xl py-4 px-6 text-sm font-medium text-[#00174b] focus:ring-2 focus:ring-blue-500 transition-all resize-none h-24"
                />
              </div>
              
              <div className="pt-4">
                <button 
                  onClick={saveManualContribution}
                  disabled={isSavingManual || manualMonths.length === 0}
                  className="w-full bg-[#00174b] text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                >
                  {isSavingManual ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Salvando Contribuições...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      Registrar {manualMonths.length > 1 ? `${manualMonths.length} Meses` : 'Pagamento'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Modal de Visualização de Recibo Tela */}
      {receiptPreviewData && !isPrinting && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[95vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Printer size={20} />
                </div>
                <h3 className="text-lg font-black text-[#131b2e]">Visualização do Recibo</h3>
              </div>
              <button onClick={() => setReceiptPreviewData(null)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-100/30">
              <div className="max-w-xl mx-auto space-y-8">
                {[1, 2].map((via) => (
                  <div key={via} className="bg-white p-12 shadow-sm border border-slate-200 rounded-lg relative overflow-hidden">
                    {/* Header Recibo */}
                    <div className={cn(
                      "flex items-start mb-10 relative",
                      institution?.logo_url ? "gap-8" : "justify-center text-center"
                    )}>
                      {institution?.logo_url && (
                        <div className="shrink-0 pt-1">
                          <img src={institution.logo_url} className="w-20 h-20 rounded-lg object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      
                      <div className={cn(
                        "flex-1 space-y-1",
                        !institution?.logo_url && "text-center"
                      )}>
                        <h4 className="text-xl font-black text-[#00174b] uppercase tracking-tight leading-tight">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
                        <p className="text-[10px] text-slate-500 font-bold max-w-sm leading-relaxed">{institution?.address || 'Endereço não configurado'}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider pt-1">
                          {institution?.phone && <span>TEL: {institution.phone}</span>}
                          {institution?.email && <span className="lowercase underline">email: {institution.email.toLowerCase()}</span>}
                        </div>
                        {institution?.website && (
                          <p className="text-[9px] text-blue-600 font-black uppercase tracking-[0.2em] pt-1 border-t border-slate-50 inline-block">{institution.website}</p>
                        )}
                      </div>
                      
                      <div className="absolute right-0 top-0 text-right h-full flex flex-col justify-center">
                        <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest vertical-text transform rotate-180" style={{ writingMode: 'vertical-lr' }}>
                          {via === 1 ? 'VIA ESCOLA' : 'VIA ALUNO'}
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-px bg-slate-100 mb-8" />
                    
                    <div className="text-center mb-10">
                      <h2 className="text-xl font-black text-[#00174b] uppercase tracking-[0.3em] inline-block border-b-2 border-[#00174b] pb-1">Recibo de Contribuição</h2>
                    </div>

                    <div className="space-y-10">
                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 grid grid-cols-2 gap-8 relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1.5 h-full bg-blue-600"></div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Matricula / Aluno(a)</p>
                          <p className="text-sm font-black text-[#00174b]">
                            {(receiptPreviewData?.[0] as any)?.student?.registration_number || selectedStudent?.registration_number || '---'} - {(receiptPreviewData?.[0] as any)?.student?.name || selectedStudent?.name || 'NOME NÃO ENCONTRADO'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Turma Acadêmica</p>
                          <p className="text-sm font-black text-[#00174b]">
                            {classes.find(cl => cl.id === ((receiptPreviewData?.[0] as any)?.student?.class_id || selectedStudent?.class_id))?.name || '---'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {[0, 1].map((colIndex) => {
                          const half = Math.ceil(receiptPreviewData.length / 2);
                          const items = colIndex === 0 
                            ? receiptPreviewData.slice(0, half) 
                            : receiptPreviewData.slice(half);
                          
                          if (colIndex === 1 && items.length === 0) return null;

                          return (
                            <div key={colIndex} className="border border-slate-200 rounded-xl overflow-hidden">
                              <table className="w-full text-[10px] text-center">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                  <tr>
                                    <th className="py-2 px-2 font-black text-slate-500 uppercase leading-none text-[9px]">Mês / Ano</th>
                                    <th className="py-2 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Valor</th>
                                    <th className="py-2 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Modo</th>
                                    <th className="py-2 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Data Pagto.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((reg) => (
                                    <tr key={reg.id} className="border-b border-slate-100 last:border-0 font-bold text-[#131b2e]">
                                      <td className="py-1.5 px-2">{(MONTHS[reg.reference_month - 1]?.substring(0, 3) || 'N/I')} / {reg.reference_year}</td>
                                      <td className="py-1.5 px-2 border-l border-slate-100">{formatCurrency(reg.amount)}</td>
                                      <td className="py-1.5 px-2 border-l border-slate-100 text-[9px] font-semibold text-slate-600">
                                        {reg.pix_id ? 'Importado' : (reg.payment_method || 'Dinheiro')}
                                      </td>
                                      <td className="py-1.5 px-2 border-l border-slate-100 text-[#00174b]">{reg.payment_date ? safeFormat(reg.payment_date, 'dd/MM/yy') : '--/--/--'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex justify-between items-center px-6">
                        <span className="text-[10px] font-black text-blue-900 uppercase">Total das Contribuições</span>
                        <span className="text-sm font-black text-blue-900">{formatCurrency(receiptPreviewData.reduce((acc, c) => acc + c.amount, 0))}</span>
                      </div>

                      <div className="flex justify-between items-end pt-4">
                        <div className="space-y-0.5">
                          <p className="text-[9px] font-bold text-slate-400">Data do Recebimento: {receiptPreviewData?.[0]?.payment_date ? safeFormat(receiptPreviewData[0].payment_date, 'dd/MM/yyyy') : '---'}</p>
                          {receiptPreviewData?.length === 1 ? (
                            <>
                              <p className="text-[9px] font-bold text-slate-400">Modo de Pagamento: {receiptPreviewData[0].pix_id ? 'PIX por Importação' : `Pagamento Direto (${receiptPreviewData[0].payment_method || 'Dinheiro'})`}</p>
                              <p className="text-[9px] font-bold text-slate-400">Registro no Sistema: {safeFormat(receiptPreviewData[0].created_at || receiptPreviewData[0].payment_date, 'dd/MM/yyyy HH:mm')}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-[9px] font-bold text-slate-400">Registro(s) no Sistema: {receiptPreviewData.map(c => safeFormat(c.created_at || c.payment_date, 'dd/MM/yyyy')).join(', ')}</p>
                            </>
                          )}
                          <p className="text-[9px] font-bold text-slate-300">Emissão: {safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                        <div className="text-center">
                          <div className="w-48 border-b border-slate-300 mb-2"></div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Responsável / Tesouraria</p>
                        </div>
                      </div>
                    </div>

                    {via === 1 && (
                      <div className="absolute left-0 bottom-0 w-full h-[2px] border-b-2 border-dashed border-slate-400 mt-4 flex items-center justify-center">
                        <span className="bg-white px-4 text-[8px] font-black text-slate-500 uppercase -translate-y-[1px] flex items-center gap-1">✂️ CORTE AQUI ✂️</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-white border-t border-slate-100 grid grid-cols-2 gap-4">
              <button 
                onClick={() => generateSelectedReceipts(receiptPreviewData!, 'save')}
                className="py-4 bg-[#00174b] text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-800 shadow-xl transition-all text-[10px]"
              >
                <FileDown size={18} /> Baixar PDF
              </button>
              <button 
                onClick={() => generateSelectedReceipts(receiptPreviewData!, 'print')}
                className="py-4 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-700 shadow-xl transition-all text-[10px]"
              >
                <Printer size={18} /> Imprimir Recibo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Area - THE ONLY THING VISIBLE DURING PRINT */}
      {receiptPreviewData && (
        <div 
          id="printable-contribution-receipt"
          className={cn(
            "bg-white text-black p-0 m-0 w-full min-h-screen z-[9999]",
            isPrinting ? "fixed inset-0 overflow-y-auto bg-white" : "hidden",
            "print:static print:block print:overflow-visible print:h-auto"
          )}
        >
          {/* Barra de Controle de Segurança (Não sai na impressão) */}
          <div className="print:hidden sticky top-0 left-0 w-full bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-center justify-between z-[200] shadow-2xl gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <Printer size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest leading-none mb-1">Painel de Impressão</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Utilize os controles abaixo se a janela não abrir.</p>
              </div>
            </div>
            
            <div className="flex items-center flex-wrap justify-center gap-3">
              <button 
                onMouseDown={() => {
                  try {
                    window.print();
                  } catch (err) {
                    console.error("Print failed:", err);
                    setNotification({
                      type: 'error',
                      message: 'A impressão direta é bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba para imprimir.'
                    });
                  }
                }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
              >
                <Printer size={16} /> Abrir Impressora
              </button>

              <button 
                onClick={() => generateSelectedReceipts(receiptPreviewData!, 'save')}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
              >
                <FileDown size={16} /> Baixar PDF (Reserva)
              </button>

              <div className="w-px h-8 bg-white/10 hidden sm:block mx-1"></div>

              <button 
                onClick={() => {
                  setIsPrinting(false);
                  setReceiptPreviewData(null);
                }}
                className="px-6 py-2.5 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <X size={16} /> Voltar ao Sistema
              </button>
            </div>
          </div>

          <div id="printable-area" className={cn("space-y-2 p-4 print:p-0 print:space-y-0 print:h-full print:flex print:flex-col", isPrinting && "pt-4 print:pt-0")}>
            {[1, 2].map((via) => (
              <div key={via} className={cn(
                "bg-white p-4 border border-slate-200 print:border-none rounded-lg relative overflow-hidden break-inside-avoid shadow-none mb-2 print:mb-0 print:flex-1 print:flex print:flex-col print:justify-center",
                via === 2 && "print:mt-12" // Lower via aluno to distance from cut line
              )}>
                <div>
                  {/* Header Recibo */}
                  <div className={cn(
                    "flex items-start relative mb-1",
                    institution?.logo_url ? "gap-6" : "justify-center text-center"
                  )}>
                    {institution?.logo_url && (
                      <div className="shrink-0 pt-0.5">
                        <img src={institution.logo_url} className="w-14 h-14 rounded-xl object-contain" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    
                    <div className={cn(
                      "flex-1 space-y-0.5",
                      !institution?.logo_url && "text-center"
                    )}>
                      <h4 className="text-lg font-black text-[#00174b] uppercase tracking-tight leading-tight">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
                      <p className="text-[9px] text-slate-500 font-bold max-w-sm leading-relaxed">{institution?.address || 'Av. Venus, 195 - Itapegica - Guarulhos - Cep 07044-170'}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                        {institution?.phone && <span>TEL: {institution.phone}</span>}
                        {institution?.email && <span className="lowercase">EMAIL: {institution.email.toLowerCase()}</span>}
                      </div>
                    </div>
                    
                    <div className="absolute -right-4 top-1/2 -translate-y-1/2 opacity-30 select-none">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] [writing-mode:vertical-rl] rotate-180 py-4">
                        {via === 1 ? 'VIA ESCOLA' : 'VIA ALUNO'}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-px bg-slate-100 mb-1" />
                
                  <div className="text-center mb-2">
                    <h2 className="text-lg font-black text-[#00174b] uppercase tracking-[0.2em] inline-block border-b-2 border-[#00174b] pb-0.5">Recibo de Contribuição</h2>
                  </div>

                <div className="space-y-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 grid grid-cols-2 gap-4 relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1.5 h-full bg-blue-600"></div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">Matricula / Aluno(a)</p>
                      <p className="text-xs font-black text-[#00174b]">
                        {(receiptPreviewData?.[0] as any)?.student?.registration_number || selectedStudent?.registration_number || '---'} - {(receiptPreviewData?.[0] as any)?.student?.name || selectedStudent?.name || 'NOME NÃO ENCONTRADO'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">Turma Acadêmica</p>
                      <p className="text-xs font-black text-[#00174b]">
                        {classes.find(cl => cl.id === ((receiptPreviewData?.[0] as any)?.student?.class_id || selectedStudent?.class_id))?.name || '---'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {[0, 1].map((colIndex) => {
                      const half = Math.ceil(receiptPreviewData.length / 2);
                      const items = colIndex === 0 
                        ? receiptPreviewData.slice(0, half) 
                        : receiptPreviewData.slice(half);
                      
                      return (
                        <div key={colIndex} className="border border-slate-200 rounded-xl overflow-hidden min-h-[140px]">
                          <table className="w-full text-xs text-center h-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-2 font-black text-slate-500 uppercase leading-none text-[9px]">Mês / Ano</th>
                                <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Valor</th>
                                <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Modo</th>
                                <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Data Pagto.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((reg) => (
                                <tr key={reg.id} className="border-b border-slate-100 last:border-0 font-bold text-[#131b2e]">
                                  <td className="py-2 px-2 text-[10px]">{(MONTHS[reg.reference_month - 1]?.substring(0, 3) || 'N/I')} / {reg.reference_year}</td>
                                  <td className="py-2 px-2 border-l border-slate-100 text-[10px]">{formatCurrency(reg.amount)}</td>
                                  <td className="py-2 px-2 border-l border-slate-100 text-[9px] font-semibold text-slate-600">
                                    {reg.pix_id ? 'Importado' : (reg.payment_method || 'Dinheiro')}
                                  </td>
                                  <td className="py-2 px-2 border-l border-slate-100 text-[#00174b] text-[10px]">{reg.payment_date ? safeFormat(reg.payment_date, 'dd/MM/yy') : '--/--/--'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-center px-4 min-h-[60px]">
                      <span className="text-[8px] font-black text-slate-400 uppercase mb-1">Mensagem / Aviso de Recibo</span>
                      <p className="text-[9px] font-semibold text-slate-600 leading-tight">
                        {institution?.receipt_message || 'Contribuição recebida com gratidão para o desenvolvimento da escola.'}
                      </p>
                    </div>
                    <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex justify-between items-center px-6">
                      <span className="text-[10px] font-black text-blue-900 uppercase">Total das Contribuições</span>
                      <span className="text-xl font-black text-blue-900">{formatCurrency(receiptPreviewData.reduce((acc, c) => acc + c.amount, 0))}</span>
                    </div>
                  </div>

                  <div className="w-full h-px bg-slate-100 my-4" />

                  <div className="flex justify-between items-end pt-1">
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-bold text-slate-400">Data do Recebimento: {receiptPreviewData?.[0]?.payment_date ? safeFormat(receiptPreviewData[0].payment_date, 'dd/MM/yyyy') : '---'}</p>
                      {receiptPreviewData?.length === 1 ? (
                        <>
                          <p className="text-[8px] font-bold text-slate-400">Modo de Pagamento: {receiptPreviewData[0].pix_id ? 'PIX por Importação' : `Pagamento Direto (${receiptPreviewData[0].payment_method || 'Dinheiro'})`}</p>
                          <p className="text-[8px] font-bold text-slate-400">Registro no Sistema: {safeFormat(receiptPreviewData[0].created_at || receiptPreviewData[0].payment_date, 'dd/MM/yyyy HH:mm')}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[8px] font-bold text-slate-400">Modo de Pagamento: Vários</p>
                          <p className="text-[8px] font-bold text-slate-400">Registro(s) no Sistema: {receiptPreviewData.map(c => safeFormat(c.created_at || c.payment_date, 'dd/MM/yyyy')).join(', ')}</p>
                        </>
                      )}
                      <p className="text-[8px] font-bold text-slate-300">Emissão: {safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    <div className="text-center">
                      <div className="w-48 border-b border-slate-400 mb-1"></div>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Responsável / Tesouraria</p>
                    </div>
                  </div>
                </div>
              </div>

              {via === 1 && (
                <div className="absolute left-0 -bottom-[1px] w-full flex items-center justify-center pointer-events-none z-20">
                  <div className="w-full border-b-2 border-dashed border-slate-400 flex items-center justify-center">
                    <span className="bg-white px-4 text-[8px] font-black text-slate-500 uppercase -translate-y-[1px] flex items-center gap-1">✂️ CORTE AQUI ✂️</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Printable Area - Statement (Professional & Minimalist) */}
      {isPrintingStatement && selectedStudent && (
        <div 
          id="printable-statement"
          className={cn(
            "bg-white text-black p-0 m-0 w-full min-h-screen z-[9999]",
            "fixed inset-0 overflow-y-auto bg-white",
            "print:static print:block print:overflow-visible print:h-auto"
          )}
        >
          {/* Control Bar */}
          <div className="print:hidden sticky top-0 left-0 w-full bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-center justify-between z-[200] gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <FileText className="text-slate-300" size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider leading-none mb-1">Extrato de Contribuinte</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{selectedStudent.name}</p>
              </div>
            </div>
            
            <div className="flex items-center flex-wrap justify-center gap-3">
              <button 
                onMouseDown={() => {
                  try {
                    window.print();
                  } catch (err) {
                    console.error("Print failed:", err);
                    setNotification({
                      type: 'error',
                      message: 'A impressão direta é bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba para imprimir.'
                    });
                  }
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95"
              >
                <Printer size={16} /> Imprimir
              </button>

              <button 
                onClick={generateStatement}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95"
              >
                <FileDown size={16} /> PDF
              </button>

              <button 
                onClick={() => setIsPrintingStatement(false)}
                className="px-6 py-2 bg-red-600/10 hover:bg-red-600 text-red-600 hover:text-white rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95"
              >
                <X size={16} /> Sair
              </button>
            </div>
          </div>

          <div className="max-w-[800px] mx-auto p-12 print:p-0 bg-white flex flex-col min-h-screen font-sans">
            {/* Institutional Header */}
            <div className="flex items-center gap-6 mb-6 pb-2 border-b-2 border-black">
              <div className="flex-shrink-0 w-24 h-24 flex items-center justify-center">
                {institution?.logo_url ? (
                  <img src={institution.logo_url} className="w-full h-full object-contain max-h-24" referrerPolicy="no-referrer" alt="Logo" />
                ) : (
                  <div className="w-full h-full border-2 border-slate-200 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-300 font-black uppercase">
                    <span className="leading-none">SEM</span>
                    <span className="leading-none">LOGO</span>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col">
                <p className="text-[11pt] font-semibold tracking-widest text-slate-800 leading-tight">DIOCESE DE GUARULHOS</p>
                <h1 className="text-[19pt] font-black uppercase tracking-tight text-black leading-tight my-0.5">
                  {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                </h1>
                <p className="text-[12pt] font-bold text-slate-700 tracking-wide mt-1 uppercase">
                  {institution?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                </p>
              </div>
            </div>

            <div className="mb-6">
               <h2 className="text-base font-bold text-center uppercase tracking-[0.1em] border-b border-black/10 pb-3 mb-4">Extrato Anual de Contribuições - {selectedYear}</h2>
               
               <div className="grid grid-cols-2 gap-8 bg-slate-50 p-4 rounded border border-slate-200">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Dados do Aluno</span>
                    <p className="text-sm font-bold text-black uppercase">{selectedStudent.name}</p>
                    <p className="text-[11px] text-slate-600 font-medium">Matrícula: {selectedStudent.registration_number || 'Não Informada'}</p>
                    <p className="text-[11px] text-slate-600 font-medium">Turma: {classes.find(cl => cl.id === selectedStudent?.class_id)?.name || 'Não informada'}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Período de Referência</span>
                    <p className="text-sm font-bold text-black">Janeiro a Dezembro de {selectedYear}</p>
                    <p className="text-[11px] text-slate-600 font-medium">Situação: {contributions.length === 12 ? 'Ano Completo' : 'Em Aberto'}</p>
                  </div>
               </div>
            </div>

            <div className="flex-1">
              <table className="w-full border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="py-2 px-4 text-left text-[10px] font-bold text-black uppercase tracking-wider">Mes de Referência</th>
                    <th className="py-2 px-4 text-right text-[10px] font-bold text-black uppercase tracking-wider">Valor Recebido</th>
                    <th className="py-2 px-4 text-center text-[10px] font-bold text-black uppercase tracking-wider">Data do Pagamento</th>
                    <th className="py-2 px-4 text-left text-[10px] font-bold text-black uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {MONTHS.map((month, idx) => {
                    const contrib = contributions.find(c => c.reference_month === idx + 1);
                    return (
                      <tr key={month} className="even:bg-slate-50/50">
                        <td className="py-2 px-4 text-[11px] font-bold text-slate-700 uppercase">{month}</td>
                        <td className="py-2 px-4 text-[11px] font-bold text-black text-right">{contrib ? formatCurrency(contrib.amount) : '---'}</td>
                        <td className="py-2 px-4 text-[11px] font-medium text-slate-600 text-center">{contrib ? safeFormat(contrib.payment_date, 'dd/MM/yyyy') : '---'}</td>
                        <td className="py-2 px-4 text-[9px] font-bold uppercase text-center">
                          {contrib ? (
                            <span className="text-emerald-700">Pago / Liquidado</span>
                          ) : (
                            <span className="text-slate-300">Pendente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t border-black font-bold">
                    <td className="py-3 px-4 text-[10px] text-black uppercase">Total Geral do Período</td>
                    <td className="py-3 px-4 text-sm text-black text-right">
                      {formatCurrency(contributions.reduce((acc, c) => acc + c.amount, 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Institutional Footer */}
            <div className="mt-auto border-t-2 border-black pt-3 flex justify-between items-start text-[8.5pt] font-black text-black uppercase tracking-tight mb-2">
              <div className="flex-1 space-y-1">
                <p className="leading-none text-[9pt]">
                  {institution?.address}
                </p>
                {(institution?.cep || institution?.city_uf) && (
                  <p className="leading-none text-[9pt]">
                    {institution?.cep ? `CEP: ${institution.cep}` : ''} {institution?.city_uf ? ` - ${institution.city_uf}` : ''}
                  </p>
                )}
                <div className="flex items-center gap-4 leading-none font-bold text-[9pt]">
                  {institution?.phone && (
                    <span className="flex items-center gap-1.5">
                      TEL: {institution.phone}
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="#25D366" className="shrink-0">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    </span>
                  )}
                  {institution?.phone && institution?.email && <span className="opacity-30">|</span>}
                  {institution?.email && (
                    <span className="flex items-center gap-1">
                      EMAIL: <span className="lowercase font-bold">{institution.email}</span>
                    </span>
                  )}
                </div>
              </div>
              {institution?.secretary && (
                <div className="text-right max-w-[450px] leading-tight text-black font-black uppercase text-[8pt]">
                  <p className="whitespace-pre-line underline underline-offset-2 mb-1">Atendimento Secretaria:</p>
                  <p className="whitespace-pre-line lowercase font-bold text-[8.5pt]">{institution.secretary}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
