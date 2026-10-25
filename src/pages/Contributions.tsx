import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CreditCard, Download, Plus, Calendar, User as UserIcon, Loader2, CheckCircle2, FileText, Printer, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp, AlertCircle, Link2Off, X, FileDown, DollarSign, Trash2, Search, GraduationCap, Award, Clock, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown, Receipt } from 'lucide-react';
import { financialService } from '../services/financialService';
import { financialConfigService } from '../services/financialConfigService';
import { fetchAll, saveData, deleteData, fetchQuery, fetchById } from '../lib/database';
import { Student, Contribution, Class, FinancialSettings } from '../types';
import { formatCurrency, cn, safeFormat, parseSafeDate, maskDate, formatDateForDisplay, parseDateToDB, matchesStudentSearch, calculateStudentSearchRank, normalizeClass, detectCourseFromClass } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../contexts/UnitContext';
import { isItemInUnit, getItemUnitId } from '../lib/unitService';
import { UnitConflictBanner } from '../components/UnitConflictBanner';
import { PinInput } from '../components/PinInput';
import { 
  getStudentContributionPlan, 
  formatContributionMonth, 
  isFirstYearOrStarting,
  isPeriodOverdue,
  isPeriodFuture,
  isPeriodCurrent
} from '../lib/contributionRules';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const computePeriodDateRange = (period: 'mensal' | 'semestral' | 'anual', m: number, sem: 1 | 2, yr: number) => {
  let s = '';
  let e = '';
  if (period === 'mensal') {
    const lastDay = new Date(yr, m, 0).getDate();
    s = `${yr}-${String(m).padStart(2, '0')}-01`;
    e = `${yr}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (period === 'semestral') {
    if (sem === 1) {
      s = `${yr}-01-01`;
      e = `${yr}-06-30`;
    } else {
      s = `${yr}-07-01`;
      e = `${yr}-12-31`;
    }
  } else if (period === 'anual') {
    s = `${yr}-01-01`;
    e = `${yr}-12-31`;
  }
  return { start: s, end: e };
};

export const renderPaymentMethodBadge = (methodStr?: string, isWaived?: boolean, pixId?: string) => {
  if (isWaived || methodStr === 'Abono') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
        <Award size={10} className="text-amber-600" />
        <span>Abono</span>
      </span>
    );
  }

  const raw = (methodStr || '').trim().toLowerCase();
  const isPix = Boolean(pixId || raw === 'pix');

  if (isPix) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
        <span>{pixId ? 'PIX (Importado)' : 'PIX'}</span>
      </span>
    );
  }

  if (raw.includes('crédito') || raw.includes('credito')) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
        <CreditCard size={10} className="text-purple-600" />
        <span>Cartão Crédito</span>
      </span>
    );
  }

  if (raw.includes('débito') || raw.includes('debito')) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
        <CreditCard size={10} className="text-indigo-600" />
        <span>Cartão Débito</span>
      </span>
    );
  }

  if (raw.includes('cartão') || raw.includes('cartao')) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
        <CreditCard size={10} className="text-indigo-600" />
        <span>Cartão</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
      <DollarSign size={10} className="text-emerald-600" />
      <span>Dinheiro</span>
    </span>
  );
};

export function Contributions() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialStudentId = (location.state as any)?.studentId;
  const { selectedUnitId, selectedUnit, activeUnits, getUnitName } = useUnits();
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [viewMode, setViewModeState] = useState<'individual' | 'period' | 'unpaid'>(() => {
    try {
      const saved = localStorage.getItem('contributions_view_mode');
      if (saved === 'individual' || saved === 'period' || saved === 'unpaid') {
        return saved;
      }
    } catch (e) {}
    return 'individual';
  });

  const setViewMode = useCallback((mode: 'individual' | 'period' | 'unpaid') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('contributions_view_mode', mode);
    } catch (e) {}
  }, []);

  // Estados para seleção de tipo de alvo e periodicidade (mensal, semestral, anual)
  const [reportTarget, setReportTarget] = useState<'class' | 'student'>('class');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [periodOption, setPeriodOption] = useState<'mensal' | 'semestral' | 'anual'>('mensal');
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(() => (new Date().getMonth() + 1 <= 6 ? 1 : 2));

  // Inicialização de datas estritamente alinhada com o período selecionado (padrão: Mês Atual)
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const yr = now.getFullYear();
    const m = now.getMonth() + 1;
    const sem: 1 | 2 = m <= 6 ? 1 : 2;
    return computePeriodDateRange('mensal', m, sem, yr).start;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const yr = now.getFullYear();
    const m = now.getMonth() + 1;
    const sem: 1 | 2 = m <= 6 ? 1 : 2;
    return computePeriodDateRange('mensal', m, sem, yr).end;
  });

  // Estados para ordenação da tabela de lançamentos por período
  const [periodSortField, setPeriodSortField] = useState<'date' | 'name' | 'amount'>('date');
  const [periodSortDirection, setPeriodSortDirection] = useState<'asc' | 'desc'>('desc'); // Padrão: mais recente para o mais antigo

  const handlePeriodSort = (field: 'date' | 'name' | 'amount') => {
    if (periodSortField === field) {
      setPeriodSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setPeriodSortField(field);
      setPeriodSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const [periodData, setPeriodData] = useState<(Contribution & { student?: Student })[]>([]);
  const [recentContributions, setRecentContributions] = useState<(Contribution & { student?: Student })[]>([]);
  const [filterType, setFilterType] = useState<'payment' | 'created'>('payment');
  const [searchByName, setSearchByName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<any[]>([]);

  // Helper com hierarquia estrita de resolução de turma para sincronização absoluta com o cadastro de alunos
  const resolveStudentClass = useCallback((student: Student | null | undefined): Class | undefined => {
    if (!student || !classes || classes.length === 0) return undefined;

    // 1. PRIORIDADE ABSOLUTA: student.class_id direto do cadastro do aluno
    if (student.class_id) {
      const targetId = String(student.class_id).trim();
      const directMatch = classes.find(c => String(c.id).trim() === targetId);
      if (directMatch) return directMatch;
    }

    // 2. SEGUNDA PRIORIDADE: Matrícula ativa do aluno na tabela de matrículas (enrollments)
    if (student.id && allEnrollments && allEnrollments.length > 0) {
      const activeEnrollment = allEnrollments.find(e => 
        String(e.student_id).trim() === String(student.id).trim() && 
        (e.status || 'Ativo') === 'Ativo' && 
        e.class_id
      );
      if (activeEnrollment) {
        const enrMatch = classes.find(c => String(c.id).trim() === String(activeEnrollment.class_id).trim());
        if (enrMatch) return enrMatch;
      }
    }

    // 3. TERCEIRA PRIORIDADE: Array de matrículas embutido no objeto do aluno (se presente)
    if (Array.isArray((student as any).enrollments) && (student as any).enrollments.length > 0) {
      for (const enr of (student as any).enrollments) {
        if (enr.class_id) {
          const m = classes.find(c => String(c.id).trim() === String(enr.class_id).trim());
          if (m) return m;
        }
      }
    }

    // 4. QUARTA PRIORIDADE: Nome da turma coincide exatamente com class_name (se presente)
    if ((student as any).class_name) {
      const targetName = String((student as any).class_name).trim().toLowerCase();
      const nameMatch = classes.find(c => c.name && c.name.trim().toLowerCase() === targetName);
      if (nameMatch) return nameMatch;
    }

    // 5. QUINTA PRIORIDADE: Busca por curso APENAS se houver correspondência inequívoca (uma única turma do curso)
    const rawCourse = (student as any).course ? String((student as any).course).trim().toLowerCase() : '';
    if (rawCourse && rawCourse !== 'sem curso informado' && rawCourse !== 'identificar curso...') {
      const courseClasses = classes.filter(c => 
        (c.course && c.course.trim().toLowerCase() === rawCourse) ||
        (c.name && c.name.trim().toLowerCase() === rawCourse)
      );
      if (courseClasses.length === 1) {
        return courseClasses[0];
      }
    }

    return undefined;
  }, [classes, allEnrollments]);

  const applyPeriodDates = useCallback((period: 'mensal' | 'semestral' | 'anual', m: number, sem: 1 | 2, yr: number) => {
    const { start: s, end: e } = computePeriodDateRange(period, m, sem, yr);
    setStartDate(s);
    setEndDate(e);
    setSelectedYear(yr);
    setUnpaidYear(yr);
    return { start: s, end: e };
  }, []);
  
  // Scoped Classes to active unit
  const scopedClasses = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return classes;
    return classes.filter(c => isItemInUnit(getItemUnitId(c), selectedUnitId, activeUnits));
  }, [classes, selectedUnitId, activeUnits]);
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
  const [academicSettingsList, setAcademicSettingsList] = useState<any[]>([]);
  const [financialSettings, setFinancialSettings] = useState<FinancialSettings | null>(null);
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false);
  
  const { profile, canDelete } = useAuth();
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  // Helper to calculate expected months for a student in a specific year
  const getExpectedMonthsForStudent = (student: Student, year: number, paidMonths: number[] = []) => {
    // If student started after this year, they are not expected to pay anything for this year
    if (student.start_date) {
      const startDate = parseSafeDate(student.start_date);
      if (!isNaN(startDate.getTime()) && startDate.getFullYear() > year) {
        return [];
      }
    }

    const studentClass = resolveStudentClass(student);
    const classSettings = academicSettingsList.find(s => s.id === student.class_id);
    const generalSettings = academicSettingsList.find(s => s.id === 'current');
    const activeSettings = classSettings || generalSettings;

    const plan = getStudentContributionPlan(student, studentClass, year, paidMonths, activeSettings);
    return plan.expectedPeriods;
  };

  // States for Unpaid (Mensalidades em Aberto) dashboard
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  const [allActiveStudents, setAllActiveStudents] = useState<Student[]>([]);
  const [unpaidContributions, setUnpaidContributions] = useState<Contribution[]>([]);
  const [unpaidClassFilter, setUnpaidClassFilter] = useState<string>('');
  const [unpaidSearchTerm, setUnpaidSearchTerm] = useState<string>('');
  const [unpaidYear, setUnpaidYear] = useState<number>(new Date().getFullYear());
  const [hideStudentName, setHideStudentName] = useState<boolean>(false);
  const [showDateTime, setShowDateTime] = useState<boolean>(true);
  const [showPendingTotalizer, setShowPendingTotalizer] = useState<boolean>(true);

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
  const [manualMethod, setManualMethod] = useState<'Dinheiro' | 'PIX' | 'Cartão' | 'Cartão de Crédito' | 'Cartão de Débito'>('Dinheiro');
  const [manualObservations, setManualObservations] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Estados para Abono de Matrícula e Mensalidade
  const [abonoModal, setAbonoModal] = useState<{
    isOpen: boolean;
    periods: number[];
    reason: string;
    date: string;
    isSubmitting: boolean;
  } | null>(null);

  // Estados da Ficha Individual (Auditoria, Extrato e Seleção de Parcelas)
  const [individualSubTab, setIndividualSubTab] = useState<'statement' | 'pending' | 'balance'>('statement');
  const [selectedPendingMonths, setSelectedPendingMonths] = useState<number[]>([]);

  const isContributionWaived = (c: Contribution | any): boolean => {
    if (!c) return false;
    return Boolean(
      c.is_waived === true ||
      c.payment_method === 'Abono' ||
      c.status === 'abonado' ||
      (typeof c.observations === 'string' && c.observations.startsWith('[ABONO]'))
    );
  };

  useEffect(() => {
    fetchInitialData();
    fetchRecentContributions();
    
    // Default to period view with last 15 days if no internal navigation student
    if (!initialStudentId) {
      setViewMode('period');
      fetchPeriodContributions();
    }

    const handleSettingsUpdated = (e: any) => {
      if (e.detail) {
        setFinancialSettings(e.detail);
      } else {
        financialConfigService.getSettings().then(setFinancialSettings);
      }
    };
    window.addEventListener('financial_settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('financial_settings_updated', handleSettingsUpdated);
  }, []); // Only once on mount

  // Filtragem 100% automática e reativa conforme seleção de Alvo (Turma/Aluno) e Período (Mensal/Semestral/Anual)
  useEffect(() => {
    if (viewMode === 'period') {
      fetchPeriodContributions(startDate, endDate);
    }
  }, [viewMode, startDate, endDate, reportTarget, selectedClassId, selectedStudent?.id, selectedUnitId]);

  useEffect(() => {
    if (viewMode === 'unpaid') {
      fetchUnpaidData(selectedYear);
    }
  }, [viewMode, selectedYear, selectedUnitId]);

  useEffect(() => {
    // Focus listener for automatic updates
    const handleFocus = () => {
      if (isPrinting || isPrintingStatement) return;
      if (selectedStudent) {
        fetchContributions(selectedStudent.id, selectedYear);
      }
      fetchRecentContributions();
    };
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedStudent, selectedYear, isPrinting, isPrintingStatement]);

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

    // 2. Prepare data to display in the Print Preview overlay
    setReceiptPreviewData(sortedData);
    setIsPrinting(true);
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
      }
    } catch (error) {
      console.error('Error fetching recent:', error);
    }
  };

  const fetchAcademicSettings = async () => {
    let settingsList: any[] = [];
    try {
      const dbSettings = await fetchAll('academic_settings');
      if (dbSettings && dbSettings.length > 0) {
        settingsList = [...dbSettings];
      }
    } catch (err) {
      console.warn("Could not fetch academic_settings from db:", err);
    }

    setAcademicSettingsList(settingsList);
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [rawClasses, instData, finData, rawStudents, _, rawEnrollments] = await Promise.all([
        fetchAll('classes').catch(() => []),
        financialService.getInstitutionSettings(),
        financialConfigService.getSettings(),
        fetchAll('students').catch(() => []),
        fetchAcademicSettings(),
        fetchAll('enrollments').catch(() => [])
      ]);

      const normalizedClasses = (rawClasses || []).map((cls: any) => normalizeClass(cls));
      setClasses(normalizedClasses);
      setAllEnrollments(rawEnrollments || []);
      setInstitution(instData || null);
      setFinancialSettings(finData || null);

      const activeStuds = (rawStudents || []).filter((s: any) => (s.status || 'Ativo') === 'Ativo');
      allStudentsCacheRef.current = activeStuds;
      setAllActiveStudents(activeStuds as Student[]);

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

  const allStudentsCacheRef = React.useRef<Student[] | null>(null);

  const handleSearchStudents = async (val: string) => {
    setSearchTerm(val);
    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setStudents([]);
      return;
    }

    setIsResultsCollapsed(false);
    setIsSearching(true);
    try {
      if (!allStudentsCacheRef.current || allStudentsCacheRef.current.length === 0) {
        const all = await fetchAll('students');
        allStudentsCacheRef.current = (all || []).filter((s: any) => (s.status || 'Ativo') === 'Ativo');
      }

      let pool = allStudentsCacheRef.current || [];
      if (selectedUnitId && selectedUnitId !== 'all') {
        pool = pool.filter(s => {
          const studentClass = resolveStudentClass(s);
          const studentUnit = getItemUnitId(s) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
          return isItemInUnit(studentUnit, selectedUnitId, activeUnits);
        });
      }

      const matched = pool.filter(s => matchesStudentSearch(s, trimmed));
      const sorted = matched.sort((a, b) => {
        const rankA = calculateStudentSearchRank(a, trimmed);
        const rankB = calculateStudentSearchRank(b, trimmed);
        if (rankA !== rankB) return rankA - rankB;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
      });
      setStudents(sorted);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchPeriodContributions = async (start = startDate, end = endDate) => {
    setLoading(true);
    try {
      const dateField = filterType === 'payment' ? 'payment_date' : 'created_at';
      const dbStart = parseDateToDB(start);
      const dbEnd = parseDateToDB(end);
      
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

      if (selectedUnitId && selectedUnitId !== 'all') {
        data = data.filter(c => {
          const student = c.student;
          const studentClass = student ? classes.find(cls => cls.id === student.class_id) : undefined;
          const itemUnit = (c as any).unit_id || (student ? getItemUnitId(student) : undefined) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
          return isItemInUnit(itemUnit, selectedUnitId, activeUnits);
        });
      }

      if (reportTarget === 'class' && selectedClassId && selectedClassId !== 'all') {
        data = data.filter(c => {
          if (c.student?.class_id === selectedClassId) return true;
          const sClass = resolveStudentClass(c.student);
          return sClass?.id === selectedClassId;
        });
      }

      if (reportTarget === 'student' && selectedStudent) {
        data = data.filter(c => c.student_id === selectedStudent.id);
      }

      if (searchByName.trim()) {
        const term = searchByName.trim();
        data = data.filter(c => matchesStudentSearch(c.student, term));
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
      // 1. Fetch all students and enrollments locally
      const [allStuds, rawEnrollments] = await Promise.all([
        fetchAll('students'),
        fetchAll('enrollments').catch(() => [])
      ]);
      setAllEnrollments(rawEnrollments || []);

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

      // 3. Ensure academic settings are loaded
      await fetchAcademicSettings();

      setAllActiveStudents(studs as Student[]);
      setUnpaidContributions(uniqueContribs as Contribution[]);
    } catch (error: any) {
      console.error('Error fetching unpaid data:', error);
      setNotification({ type: 'error', message: 'Erro ao carregar inadimplência: ' + error.message });
    } finally {
      setUnpaidLoading(false);
    }
  };

  // Turma do aluno atualmente selecionado
  const selectedStudentClass = useMemo(() => resolveStudentClass(selectedStudent), [selectedStudent, resolveStudentClass]);

  // Compute list of students with unpaid months
  const unpaidReportList = useMemo(() => {
    const targetClass = reportTarget === 'class' ? (selectedClassId || unpaidClassFilter) : (unpaidClassFilter || 'all');
    if (!targetClass && reportTarget === 'class') return [];

    const scopedPool = (!selectedUnitId || selectedUnitId === 'all')
      ? allActiveStudents
      : allActiveStudents.filter(student => {
          const studentClass = resolveStudentClass(student);
          const studentUnit = getItemUnitId(student) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
          return isItemInUnit(studentUnit, selectedUnitId, activeUnits);
        });

    return scopedPool.map(student => {
      // Paid months this year
      const paidMonths = unpaidContributions
        .filter(c => c.student_id === student.id)
        .map(c => c.reference_month);

      // Expected months for this student in the selected unpaidYear, aligned with academic settings
      let expectedMonths = getExpectedMonthsForStudent(student, unpaidYear, paidMonths);
      
      // Filtrar conforme periodicidade selecionada
      if (periodOption === 'mensal') {
        expectedMonths = expectedMonths.filter(m => m === selectedMonth);
      } else if (periodOption === 'semestral') {
        const semMonths = selectedSemester === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
        expectedMonths = expectedMonths.filter(m => semMonths.includes(m));
      }

      // Unpaid months
      const unpaidMonths = expectedMonths.filter(m => !paidMonths.includes(m));
      
      const studentClass = resolveStudentClass(student);
      const studentFee = financialConfigService.resolveFee({
        year: unpaidYear,
        classId: student.class_id || studentClass?.id,
        className: studentClass?.name,
        studentClass,
        student,
        subjectId: (student as any).subject_id || (student as any).enrollments?.[0]?.subject_id || studentClass?.subject_id,
        courseName: studentClass?.course || (student as any).course || (studentClass ? detectCourseFromClass(studentClass) : ''),
        period: (student as any).period || studentClass?.period
      }, financialSettings);

      return {
        student,
        expectedMonths,
        paidMonths,
        unpaidMonths,
        pendingCount: unpaidMonths.length,
        studentFee,
        estimatedDebt: unpaidMonths.length * studentFee
      };
    })
    .filter(item => item.pendingCount > 0) // only show if there are outstanding/pending months
    .filter(item => {
      // Search term filter
      if (!unpaidSearchTerm.trim()) return true;
      return matchesStudentSearch(item.student, unpaidSearchTerm.trim());
    })
    .filter(item => {
      if (reportTarget === 'student' && selectedStudent) {
        return item.student.id === selectedStudent.id;
      }
      // Class filter
      if (!targetClass || targetClass === 'all') return true;
      return item.student.class_id === targetClass;
    });
  }, [allActiveStudents, unpaidContributions, unpaidYear, unpaidSearchTerm, unpaidClassFilter, selectedClassId, reportTarget, selectedStudent, periodOption, selectedMonth, selectedSemester, selectedUnitId, activeUnits, classes, financialSettings]);

  // Calculate stats breakdown for top overview cards (overdue vs future/to-be-due)
  const unpaidStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed
    
    let totalOverdueMonths = 0;
    let totalFutureMonths = 0;
    let totalOverdueDebt = 0;
    let totalFutureDebt = 0;
    
    unpaidReportList.forEach(item => {
      const fee = item.studentFee || 100;
      item.unpaidMonths.forEach(m => {
        const isFuture = isPeriodFuture(m, unpaidYear);
        if (isFuture) {
          totalFutureMonths++;
          totalFutureDebt += fee;
        } else {
          totalOverdueMonths++;
          totalOverdueDebt += fee;
        }
      });
    });
    
    return {
      totalOverdueDebt,
      totalFutureDebt,
      totalOverdueMonths,
      totalFutureMonths,
      totalUnpaidAmount: totalOverdueDebt + totalFutureDebt
    };
  }, [unpaidReportList, unpaidYear]);

  const currentExpectedMonths = useMemo(() => {
    if (!selectedStudent) return [];
    const paidMonths = contributions.map(c => c.reference_month);
    return getExpectedMonthsForStudent(selectedStudent, selectedYear, paidMonths);
  }, [selectedStudent, selectedYear, contributions, academicSettingsList]);

  const studentPlan = useMemo(() => {
    if (!selectedStudent) return null;
    const studentClass = resolveStudentClass(selectedStudent);
    const classSettings = academicSettingsList.find(s => s.id === selectedStudent.class_id);
    const generalSettings = academicSettingsList.find(s => s.id === 'current');
    const activeSettings = classSettings || generalSettings;
    const paidMonths = contributions.map(c => c.reference_month);
    return getStudentContributionPlan(selectedStudent, studentClass, selectedYear, paidMonths, activeSettings);
  }, [selectedStudent, selectedYear, contributions, academicSettingsList, classes]);

  // Parcelas em aberto do aluno selecionado no ano corrente
  const individualUnpaidMonths = useMemo(() => {
    if (!selectedStudent) return [];
    const paidMonths = contributions.map(c => c.reference_month);
    return currentExpectedMonths
      .filter(m => m > 0 && !paidMonths.includes(m))
      .map(m => {
        const isOverdue = isPeriodOverdue(m, selectedYear);
        const isFacultative = Boolean(studentPlan?.isFirstYear && studentPlan.facultativeMonths.includes(m));
        const studentClass = resolveStudentClass(selectedStudent);
        const fee = financialConfigService.resolveFee({
          year: selectedYear,
          classId: selectedStudent.class_id || studentClass?.id,
          className: studentClass?.name,
          studentClass,
          student: selectedStudent,
          subjectId: (selectedStudent as any).subject_id || (selectedStudent as any).enrollments?.[0]?.subject_id || studentClass?.subject_id,
          courseName: studentClass?.course || (selectedStudent as any).course || (studentClass ? detectCourseFromClass(studentClass) : ''),
          period: (selectedStudent as any).period || studentClass?.period
        }, financialSettings);
        return {
          month: m,
          monthName: MONTHS[m - 1],
          isOverdue,
          isFacultative,
          dueDate: `10/${String(m).padStart(2, '0')}/${selectedYear}`,
          amount: fee
        };
      });
  }, [selectedStudent, contributions, currentExpectedMonths, selectedYear, studentPlan, classes, financialSettings]);

  const togglePendingMonthSelection = (m: number) => {
    setSelectedPendingMonths(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a, b) => a - b)
    );
  };

  const handleBatchAddContributions = (monthsToPay: number[]) => {
    if (!selectedStudent || monthsToPay.length === 0) return;
    const limitedMonths = monthsToPay.slice(0, 6);
    setManualMonths(limitedMonths);
    const studentClass = resolveStudentClass(selectedStudent);
    const resolvedFee = financialConfigService.resolveFee({
      year: selectedYear,
      classId: selectedStudent.class_id || studentClass?.id,
      className: studentClass?.name,
      studentClass,
      student: selectedStudent,
      subjectId: (selectedStudent as any).subject_id || (selectedStudent as any).enrollments?.[0]?.subject_id || studentClass?.subject_id,
      courseName: studentClass?.course || (selectedStudent as any).course || (studentClass ? detectCourseFromClass(studentClass) : ''),
      period: (selectedStudent as any).period || studentClass?.period
    }, financialSettings);
    setManualAmount((resolvedFee * limitedMonths.length).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setManualMethod('Dinheiro');
    setManualDate(format(new Date(), 'yyyy-MM-dd'));
  };

  // Generate PDF report and trigger direct print for unpaid fees (Relatório de Inadimplência)
  const generateUnpaidReport = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;

      let currentY = 12;

      // 1. Institutional Header
      let textStartX = margin;
      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'PNG', margin, currentY, 20, 20);
          textStartX = margin + 24;
        } catch (e) {
          console.error('Error adding logo to PDF', e);
        }
      }

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'bold');
      doc.text((institution?.diocese_name || 'DIOCESE DE GUARULHOS').toUpperCase(), textStartX, currentY + 5);

      doc.setFontSize(12);
      doc.setTextColor(19, 27, 46);
      doc.setFont('helvetica', 'bold');
      doc.text((institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS').toUpperCase(), textStartX, currentY + 11);

      doc.setFontSize(8.5);
      doc.setTextColor(120, 120, 120);
      doc.setFont('helvetica', 'bold');
      doc.text((institution?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO').toUpperCase(), textStartX, currentY + 16);

      currentY += 22;

      // Divider Line
      doc.setDrawColor(19, 27, 46);
      doc.setLineWidth(0.6);
      doc.line(margin, currentY, pageWidth - margin, currentY);

      currentY += 7;

      // 2. Report Title & Subheader Info
      doc.setFontSize(11);
      doc.setTextColor(19, 27, 46);
      doc.setFont('helvetica', 'bold');
      doc.text('RELATÓRIO DE INADIMPLÊNCIA / MENSALIDADES EM ABERTO', margin, currentY);

      // Date and Time aligned to the right side (only if showDateTime is enabled)
      if (showDateTime) {
        const emissionDateTime = `EMISSÃO: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(emissionDateTime.toUpperCase(), pageWidth - margin, currentY, { align: 'right' });
      }

      currentY += 6;

      const selectedClassName = unpaidClassFilter === 'all'
        ? 'TODAS AS TURMAS'
        : (classes.find(c => c.id === unpaidClassFilter)?.name?.toUpperCase() || 'TURMA SELECIONADA');

      // Prominent Class Title & Academic Reference Year
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(19, 27, 46);
      doc.text(`TURMA: ${selectedClassName}   •   ANO LETIVO: ${unpaidYear}`, margin, currentY);

      currentY += 5;
      if (hideStudentName) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 40, 40);
        doc.text('IDENTIFICAÇÃO RESERVADA: EXIBINDO APENAS NÚMERO DE REGISTRO / MATRÍCULA (NOMES OCULTOS)', margin, currentY);
      } else {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('IDENTIFICAÇÃO PADRÃO: NOME COMPLETO E NÚMERO DE REGISTRO ACADÊMICO (RA)', margin, currentY);
      }

      currentY += 5;

      // 3. Table Rows
      const tableRows = unpaidReportList.map((item, index) => {
        const studentName = item.student.name?.toUpperCase() || 'SEM NOME';
        const studentRA = item.student.registration_number || 'S/ RA';
        const className = classes.find(c => c.id === item.student.class_id)?.name?.toUpperCase() || 'SEM TURMA';
        const pendingMonthsText = item.unpaidMonths.map(m => formatContributionMonth(m, true).toUpperCase()).join(', ');
        
        const identification = hideStudentName 
          ? `REGISTRO N°: ${studentRA}`
          : `${studentName}\n(${studentRA})`;

        return [
          index + 1,
          identification,
          className,
          item.pendingCount,
          pendingMonthsText,
          formatCurrency(item.estimatedDebt)
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [[
          '#', 
          hideStudentName ? 'N° REGISTRO ACADÊMICO (MATRÍCULA)' : 'ESTUDANTE / REGISTRO ACADÊMICO', 
          'TURMA VINCULADA', 
          'MESES DEV.', 
          'MESES PENDENTES', 
          'VALOR ESTIMADO'
        ]],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [19, 27, 46],
          textColor: [255, 255, 255],
          fontSize: 8.5,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [40, 40, 40]
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 62 },
          2: { cellWidth: 38 },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 32 },
          5: { cellWidth: 22, halign: 'right' }
        },
        margin: { left: margin, right: margin }
      });

      // Total Summary (Opção de exibição do totalizador de pendentes)
      if (showPendingTotalizer) {
        const finalY = (doc as any).lastAutoTable.finalY + 8;
        if (finalY + 20 < pageHeight - 15) {
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, finalY, pageWidth - (margin * 2), 16, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(19, 27, 46);

          const totalStudents = unpaidReportList.length;
          const totalEstimatedDebt = unpaidReportList.reduce((acc, curr) => acc + curr.estimatedDebt, 0);

          doc.text(`TOTAL DE ALUNOS COM PENDÊNCIA(S): ${totalStudents}`, margin + 4, finalY + 6);
          doc.text(`VALOR TOTAL PENDENTE ESTIMADO: ${formatCurrency(totalEstimatedDebt)}`, margin + 4, finalY + 11.5);
        }
      }

      // Footer with page numbering
      const totalPages = (doc as any).internal.getNumberOfPages();
      
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        
        const footerLeft = `SISTEMA ESCMIN • ${institution?.name || 'Escola Diocesana de Ministérios'} • Relatório de Inadimplência`;
        
        doc.text(footerLeft, margin, pageHeight - 8, { align: 'left' });
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
      }

      // 4. Download PDF for printing
      doc.save(`Relatorio_Inadimplencia_${unpaidYear}.pdf`);
      setNotification({ type: 'success', message: 'Relatório de inadimplência gerado em PDF com sucesso!' });
    } catch (error) {
      console.error('Error generating unpaid report:', error);
      setNotification({ type: 'error', message: 'Erro ao gerar relatório de inadimplência.' });
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
    setIsResultsCollapsed(true);
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
    if (!canDelete) {
      setNotification({ type: 'error', message: 'Ação não permitida: O perfil de Assistente é vedado de excluir registros.' });
      setDeleteConfirmationFor(null);
      return;
    }

    if (!enteredPin) {
      setPinError('A chave de segurança (PIN) é obrigatória para excluir.');
      return;
    }

    setIsDeleting(deleteConfirmationFor.id);
    try {
      let isPinValid = false;

      // 1. Check logged-in user PIN
      if (profile?.pin && enteredPin === profile.pin) {
        isPinValid = true;
      } else if (enteredPin === '0000') {
        // Fallback or backup master PIN
        isPinValid = true;
      } else {
        // 2. Fetch administrator users and check if the entered PIN matches any admin
        const adminUsers = await fetchQuery('users', [{ field: 'role', operator: '==', value: 'admin' }]);
        if (adminUsers && adminUsers.length > 0) {
          isPinValid = adminUsers.some((admin: any) => admin.pin && admin.pin === enteredPin);
        }
      }

      if (!isPinValid) {
        setPinError('Chave de segurança (PIN) inválida.');
        setEnteredPin('');
        setIsDeleting(null);
        return;
      }

      const contrib = deleteConfirmationFor;
      setDeleteConfirmationFor(null);
      setEnteredPin('');
      setPinError('');

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

  const handleAddContribution = (periodNumber: number) => {
    if (!selectedStudent) return;
    setManualMonths([periodNumber]);
    const studentClass = resolveStudentClass(selectedStudent);
    const resolvedFee = financialConfigService.resolveFee({
      year: selectedYear,
      classId: selectedStudent.class_id || studentClass?.id,
      className: studentClass?.name,
      studentClass,
      student: selectedStudent,
      subjectId: (selectedStudent as any).subject_id || (selectedStudent as any).enrollments?.[0]?.subject_id || studentClass?.subject_id,
      courseName: studentClass?.course || (selectedStudent as any).course || (studentClass ? detectCourseFromClass(studentClass) : ''),
      period: (selectedStudent as any).period || studentClass?.period
    }, financialSettings);
    setManualAmount(resolvedFee.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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

  const toggleManualMonth = (periodNumber: number) => {
    setManualMonths(prev => {
      let next: number[];
      if (prev.includes(periodNumber)) {
        next = prev.filter(m => m !== periodNumber);
      } else {
        if (prev.length >= 6) {
          setNotification({ type: 'error', message: '⚠️ LIMITE ATINGIDO: Selecione no máximo 6 períodos por lançamento para garantir o recibo em duas vias na página.' });
          return prev;
        }
        next = [...prev, periodNumber].sort((a, b) => a - b);
      }

      if (selectedStudent && next.length > 0) {
        const studentClass = resolveStudentClass(selectedStudent);
        const resolvedFee = financialConfigService.resolveFee({
          year: selectedYear,
          classId: selectedStudent.class_id || studentClass?.id,
          className: studentClass?.name,
          studentClass,
          student: selectedStudent,
          subjectId: (selectedStudent as any).subject_id || (selectedStudent as any).enrollments?.[0]?.subject_id || studentClass?.subject_id,
          courseName: studentClass?.course || (selectedStudent as any).course || (studentClass ? detectCourseFromClass(studentClass) : ''),
          period: (selectedStudent as any).period || studentClass?.period
        }, financialSettings);
        setManualAmount((resolvedFee * next.length).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }

      return next;
    });
  };

  const saveManualContribution = async () => {
    if (!selectedStudent || manualMonths.length === 0) {
      setNotification({ type: 'error', message: 'Selecione pelo menos um mês ou período.' });
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
        { field: 'reference_month', operator: 'in', value: manualMonths }
      ]);

      if (existingContribs && (existingContribs as any[]).length > 0) {
        const duplicateMonths = (existingContribs as any[]).map((c: any) => formatContributionMonth(c.reference_month)).join(', ');
        setNotification({ 
          type: 'error', 
          message: `Já existe contribuição para ${duplicateMonths}/${selectedYear}. Verifique.` 
        });
        setIsSavingManual(false);
        return;
      }
      
      const studentClass = resolveStudentClass(selectedStudent);
      const studentUnitId = (selectedStudent as any).unit_id || studentClass?.unit_id || (selectedUnitId && selectedUnitId !== 'all' ? selectedUnitId : 'matriz');

      const recordsToInsert = manualMonths.map(periodNum => ({
        student_id: selectedStudent.id,
        amount: amountPerMonth,
        reference_month: periodNum,
        reference_year: selectedYear,
        payment_date: finalDate,
        payment_method: manualMethod,
        observations: manualObservations,
        unit_id: studentUnitId,
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

  const handleOpenAbonoModal = (periods: number[]) => {
    if (!selectedStudent) {
      setNotification({ type: 'error', message: 'Selecione um aluno primeiro.' });
      return;
    }
    if (periods.length === 0) {
      setNotification({ type: 'error', message: 'Selecione pelo menos um mês ou a taxa de matrícula para abonar.' });
      return;
    }
    setAbonoModal({
      isOpen: true,
      periods,
      reason: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      isSubmitting: false
    });
  };

  const confirmAbono = async () => {
    if (!selectedStudent || !abonoModal || abonoModal.periods.length === 0) return;
    if (!abonoModal.reason.trim()) {
      setNotification({ type: 'error', message: 'Por favor, informe uma breve justificativa para o abono.' });
      return;
    }

    setAbonoModal(prev => prev ? { ...prev, isSubmitting: true } : null);
    try {
      const finalDate = parseSafeDate(abonoModal.date || format(new Date(), 'yyyy-MM-dd')).toISOString();

      // Verificar duplicidades existentes
      const existingContribs = await fetchQuery('contributions', [
        { field: 'student_id', operator: '==', value: selectedStudent.id },
        { field: 'reference_year', operator: '==', value: selectedYear },
        { field: 'reference_month', operator: 'in', value: abonoModal.periods }
      ]);

      if (existingContribs && (existingContribs as any[]).length > 0) {
        const duplicateMonths = (existingContribs as any[]).map((c: any) => formatContributionMonth(c.reference_month)).join(', ');
        setNotification({ 
          type: 'error', 
          message: `Já existe lançamento para ${duplicateMonths}/${selectedYear}. Exclua o lançamento anterior antes de abonar.` 
        });
        setAbonoModal(prev => prev ? { ...prev, isSubmitting: false } : null);
        return;
      }

      const studentClass = resolveStudentClass(selectedStudent);
      const studentUnitId = (selectedStudent as any).unit_id || studentClass?.unit_id || (selectedUnitId && selectedUnitId !== 'all' ? selectedUnitId : 'matriz');

      const recordsToInsert = abonoModal.periods.map(periodNum => ({
        student_id: selectedStudent.id,
        amount: 0,
        reference_month: periodNum,
        reference_year: selectedYear,
        payment_date: finalDate,
        payment_method: 'Abono',
        is_waived: true,
        status: 'abonado',
        waiver_reason: abonoModal.reason.trim(),
        observations: `[ABONO] ${abonoModal.reason.trim()}`,
        unit_id: studentUnitId,
        created_at: new Date().toISOString()
      }));

      const savedDocs = await Promise.all(recordsToInsert.map(async (rec) => {
        const finalId = await saveData('contributions', undefined, rec);
        return { id: finalId, ...rec };
      }));

      setContributions(prev => [...prev, ...savedDocs as any]);
      setManualMonths([]);
      setAbonoModal(null);
      fetchRecentContributions();
      setNotification({ 
        type: 'success', 
        message: `✅ ${abonoModal.periods.length > 1 ? `${abonoModal.periods.length} períodos abonados` : 'Período abonado'} com sucesso!` 
      });
    } catch (error: any) {
      console.error('Erro ao abonar:', error);
      setNotification({ type: 'error', message: 'Erro ao registrar abono: ' + error.message });
      setAbonoModal(prev => prev ? { ...prev, isSubmitting: false } : null);
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
    
    const studentClass = resolveStudentClass(student);
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
      const turmaLabel = studentClass 
        ? `${studentClass.code ? `${studentClass.code} - ` : ''}${studentClass.name}`
        : (student.course || '---');
      doc.text(turmaLabel, pageWidth - margin - 50, startY + 36);

      // Grid for multiple payments
      const tableRows: any[][] = [];
      for (let i = 0; i < currentContribs.length; i += 2) {
        const row = [];
        for (let j = 0; j < 2; j++) {
          const c = currentContribs[i + j];
          if (c) {
            const isWaived = isContributionWaived(c);
            const method = isWaived ? 'Abono (Isenção)' : (c.pix_id ? 'PIX (Importado)' : (c.payment_method || 'Dinheiro'));
            row.push(`${formatContributionMonth(c.reference_month)} / ${c.reference_year}`);
            row.push(isWaived ? 'R$ 0,00' : formatCurrency(c.amount));
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

      // Box Message / Observations - Sem opção de impressão da justificativa do abono
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.rect(margin, nextY + 6, pageWidth - (margin * 2), 18);
      
      const contribObs = currentContribs.filter(c => !isContributionWaived(c)).map(c => c.observations).filter(Boolean).join('; ');
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
    
    const studentClass = resolveStudentClass(student);
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
      const turmaLabel = studentClass 
        ? `${studentClass.code ? `${studentClass.code} - ` : ''}${studentClass.name}`
        : (student.course || '---');
      doc.text(turmaLabel, pageWidth - margin - 50, startY + 37);

      const isWaived = isContributionWaived(contribution);
      const method = isWaived ? 'Abono (Isenção Concedida)' : (contribution.pix_id ? 'PIX (Importado)' : (contribution.payment_method || 'Dinheiro'));
      const origin = contribution.origin ? ` (${contribution.origin})` : '';

      // Main Table
      autoTable(doc, {
        startY: startY + 42,
        head: [['Mês / Ano Referência', 'Valor da Contribuição', 'Meio de Pagamento / Origem']],
        body: [[
          `${formatContributionMonth(contribution.reference_month)} / ${contribution.reference_year}`,
          isWaived ? 'R$ 0,00' : formatCurrency(contribution.amount),
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
      doc.text(`VALOR TOTAL => ${isWaived ? 'R$ 0,00' : formatCurrency(contribution.amount)}`, pageWidth - margin, nextY + 5, { align: 'right' });

      // Observations Box - Sem opção de impressão da justificativa do abono
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.rect(margin, nextY + 10, pageWidth - (margin * 2), 20);
      
      const obsToPrint = isWaived ? '' : contribution.observations;
      const finalMsg = [obsToPrint, institution?.receipt_message].filter(Boolean).join(' • ');
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
      
      // Info Box (Double Column)
      const boxY = y + 5;
      const boxHeight = 22;
      const boxWidth = pageWidth - margin * 2;
      
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.3);
      doc.rect(margin, boxY, boxWidth, boxHeight, 'FD');

      // Left Column: Dados do Aluno
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('DADOS DO ALUNO', margin + 4, boxY + 5);

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(selectedStudent.name.toUpperCase(), margin + 4, boxY + 10);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(`Matrícula: ${selectedStudent.registration_number || '---'}`, margin + 4, boxY + 15);
      
      const studentClass = resolveStudentClass(selectedStudent);
      doc.text(`Turma: ${studentClass?.name || '---'}`, margin + 4, boxY + 19);

      // Right Column: Período de Referência
      const rightColX = pageWidth - margin - 80;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('PERÍODO DE REFERÊNCIA', rightColX, boxY + 5);

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(`Janeiro a Dezembro de ${selectedYear}`, rightColX, boxY + 10);

      const unpaidExpected = currentExpectedMonths.filter(m => !contributions.some(c => c.reference_month === m));
      const situationText = unpaidExpected.length === 0 ? 'Regularizado' : 'Em Aberto';
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(`Situação: ${situationText}`, rightColX, boxY + 15);

      const statementData: any[][] = [];

      // Matrícula (se devida ou registrada)
      if (currentExpectedMonths.includes(0) || contributions.some(c => c.reference_month === 0)) {
        const matContrib = contributions.find(c => c.reference_month === 0);
        const isExp = currentExpectedMonths.includes(0);
        const isWaived = isContributionWaived(matContrib);
        let status = 'DISPENSADO';
        if (matContrib) {
          status = isWaived ? 'ABONADA' : 'PAGO / LIQUIDADO';
        } else if (isExp) {
          status = 'PENDENTE';
        }
        statementData.push([
          'TAXA DE MATRÍCULA',
          matContrib ? (isWaived ? 'R$ 0,00' : formatCurrency(matContrib.amount)) : '---',
          matContrib ? safeFormat(matContrib.payment_date, 'dd/MM/yyyy') : '---',
          status
        ]);
      }

      MONTHS.forEach((month, idx) => {
        const monthNum = idx + 1;
        const contrib = contributions.find(c => c.reference_month === monthNum);
        const isExpected = currentExpectedMonths.includes(monthNum);
        const isWaived = isContributionWaived(contrib);
        
        let status = 'DISPENSADO';
        if (contrib) {
          status = isWaived ? 'ABONADO' : 'PAGO / LIQUIDADO';
        } else if (isExpected) {
          status = 'PENDENTE';
        }

        statementData.push([
          month.toUpperCase(),
          contrib ? (isWaived ? 'R$ 0,00' : formatCurrency(contrib.amount)) : '---',
          contrib ? safeFormat(contrib.payment_date, 'dd/MM/yyyy') : '---',
          status
        ]);
      });

      autoTable(doc, {
        startY: boxY + boxHeight + 8,
        head: [['MÊS DE REFERÊNCIA', 'VALOR RECEBIDO', 'DATA DO PAGAMENTO', 'STATUS']],
        body: statementData,
        theme: 'grid',
        headStyles: { fillColor: [0, 23, 75], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'center' },
          3: { halign: 'center' }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3) {
            const val = data.cell.text[0];
            if (val === 'PAGO / LIQUIDADO') {
              data.cell.styles.textColor = [16, 124, 65]; // Green
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'ABONADO' || val === 'ABONADA') {
              data.cell.styles.textColor = [0, 23, 75]; // Navy
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'PENDENTE') {
              data.cell.styles.textColor = [211, 47, 47]; // Red
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'DISPENSADO') {
              data.cell.styles.textColor = [120, 144, 156]; // Grey
              data.cell.styles.fontStyle = 'italic';
            }
          }
        }
      });

      const total = contributions.reduce((acc, c) => acc + c.amount, 0);
      let finalY = (doc as any).lastAutoTable.finalY + 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(`TOTAL GERAL DO PERÍODO: ${formatCurrency(total)}`, pageWidth - margin, finalY, { align: 'right' });

      // Important notes / Footer
      if (institution?.address || institution?.secretary || institution?.phone || institution?.email) {
        finalY = doc.internal.pageSize.height - 30;
        doc.setLineWidth(0.2);
        doc.setDrawColor(200);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        
        doc.setFontSize(7);
        doc.setTextColor(50);
        
        // Left Column: Address and Contact
        const leftLines = [
          institution?.address || '',
          institution?.cep || institution?.city_uf ? `CEP: ${institution.cep || ''}${institution.city_uf ? ' - ' + institution.city_uf : ''}` : '',
          institution?.phone ? `Telefone: ${institution.phone}` : ''
        ].filter(Boolean);
        
        doc.setFont('helvetica', 'normal');
        let currentLeftY = finalY + 5;
        leftLines.forEach(line => {
          doc.text(line, margin, currentLeftY);
          currentLeftY += 4;
        });

        // Right Column: Secretary Hour & Email
        if (institution?.secretary || institution?.email) {
          let currentRightY = finalY + 5;
          if (institution?.secretary) {
            doc.setFont('helvetica', 'bold');
            doc.text('ATENDIMENTO SECRETARIA:', pageWidth - margin, currentRightY, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            currentRightY += 4;
            
            const secLines = doc.splitTextToSize(institution.secretary.toLowerCase(), 80);
            secLines.forEach((line: string) => {
              doc.text(line, pageWidth - margin, currentRightY, { align: 'right' });
              currentRightY += 4;
            });
          }
          if (institution?.email) {
            doc.setFont('helvetica', 'normal');
            doc.text(`email: ${institution.email.toLowerCase()}`, pageWidth - margin, currentRightY, { align: 'right' });
          }
        }
      }

      // Rodapé com numeração de páginas
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        doc.text(`SISTEMA ESCMIN • Extrato de Contribuição`, margin, doc.internal.pageSize.height - 8);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, doc.internal.pageSize.height - 8, { align: 'right' });
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
    setReportTarget('class');
    setSelectedClassId('all');
    setUnpaidClassFilter('');
    setPeriodOption('mensal');
    const m = new Date().getMonth() + 1;
    const yr = new Date().getFullYear();
    const sem: 1 | 2 = m <= 6 ? 1 : 2;
    setSelectedMonth(m);
    setSelectedSemester(sem);
    setSelectedYear(yr);
    applyPeriodDates('mensal', m, sem, yr);
    
    const d = new Date();
    d.setDate(d.getDate() - 15);
    const start = format(d, 'yyyy-MM-dd');
    const end = format(new Date(), 'yyyy-MM-dd');
    
    setStartDate(start);
    setEndDate(end);
    setViewMode('period');
    fetchPeriodContributions(start, end);
  };

  const filteredStudents = students;

  return (
    <>
      <div className={cn(
        "lg:h-[calc(100vh-8rem)] h-auto flex flex-col gap-2 sm:gap-2.5 print:hidden lg:overflow-hidden",
        isPrinting && "hidden"
      )}>
      <PageHeader
        title="Gestão de Contribuições"
        description="Lançamento e controle de contribuições de uso interno da tesouraria."
        icon={TrendingUp}
        badge="Tesouraria & Conferência"
        className="!mb-0 mb-0"
      />

      {/* Unit Conflict Banner */}
      <UnitConflictBanner
        moduleName="Gestão de Contribuições"
        entityNameSingular="contribuinte"
        entityNamePlural="contribuintes"
        totalRecordsAllUnits={allStudentsCacheRef.current?.length || 0}
        recordsInActiveUnit={students.length}
        selectedItemUnit={selectedStudent ? (getItemUnitId(selectedStudent) || classes.find(c => c.id === selectedStudent.class_id)?.unit_id) : undefined}
        selectedItemName={selectedStudent?.name}
      />

      {/* 1. Abas Principais de Relatório (Fusão de Lançamento e Ficha em "Contribuição") */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs shrink-0 flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (reportTarget === 'student' && selectedStudent) {
              setViewMode('individual');
              fetchContributions(selectedStudent.id, selectedYear);
            } else {
              setReportTarget('class');
              setViewMode('period');
              fetchPeriodContributions();
            }
          }}
          className={cn(
            "flex-1 py-2.5 px-4 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs",
            (viewMode === 'period' || viewMode === 'individual')
              ? "bg-[#00174b] text-white ring-2 ring-blue-600/40 shadow-md"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50/80 border border-slate-200/70"
          )}
        >
          <Receipt size={15} className={(viewMode === 'period' || viewMode === 'individual') ? "text-blue-300" : "text-blue-600"} />
          <span>Contribuição</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewMode('unpaid');
            fetchUnpaidData(selectedYear);
          }}
          className={cn(
            "flex-1 py-2.5 px-4 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs",
            viewMode === 'unpaid'
              ? "bg-[#00174b] text-white ring-2 ring-rose-600/40 shadow-md"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50/80 border border-slate-200/70"
          )}
        >
          <AlertCircle size={15} className={viewMode === 'unpaid' ? "text-rose-300" : "text-rose-600"} />
          <span>Inadimplência</span>
        </button>
      </div>

      {/* 2. Barra de Filtros Unificada da Gestão de Contribuição */}
      <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200/90 shadow-2xs shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Lado Esquerdo: Alvo (Por Turma vs Por Aluno) + Seleção e Informação da Turma */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap min-w-0">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">
            Alvo:
          </span>
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                setReportTarget('class');
                if (viewMode !== 'unpaid') {
                  setViewMode('period');
                  fetchPeriodContributions();
                }
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                reportTarget === 'class' && (viewMode === 'period' || viewMode === 'unpaid')
                  ? "bg-[#00174b] text-white shadow-2xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <GraduationCap size={13} />
              <span>Por Turma</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReportTarget('student');
                if (viewMode !== 'unpaid') {
                  setViewMode('individual');
                  if (selectedStudent) {
                    fetchContributions(selectedStudent.id, selectedYear);
                  }
                }
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                reportTarget === 'student' || viewMode === 'individual'
                  ? "bg-[#00174b] text-white shadow-2xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <UserIcon size={13} />
              <span>Por Aluno</span>
            </button>
          </div>

          {/* Opção Por Turma: Dropdown de Turmas */}
          {reportTarget === 'class' && (
            <div className="flex items-center gap-1.5 min-w-[200px] sm:min-w-[240px]">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedClassId(val);
                  setUnpaidClassFilter(val);
                }}
                className="w-full h-8.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              >
                <option value="all">Todas as Turmas ({scopedClasses.length})</option>
                {scopedClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.code ? `${c.code} - ${c.name}` : c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Opção Por Aluno: Aluno Selecionado + Informação da Turma (Quadro 1) OU Campo de Busca */}
          {reportTarget === 'student' && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0">
              {selectedStudent ? (
                <>
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl">
                    <UserIcon size={13} className="text-blue-600 shrink-0" />
                    <span className="text-xs font-extrabold text-blue-950 truncate max-w-[150px] sm:max-w-[200px]">
                      {selectedStudent.name}
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded font-mono">
                      {selectedStudent.registration_number}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudent(null);
                        setSearchByName('');
                        setSearchTerm('');
                      }}
                      className="p-0.5 hover:bg-blue-200 rounded-md text-blue-700 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Trocar aluno"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Informação da Turma do Aluno (Quadro 1 Marcado pelo Usuário) */}
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100/90 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shrink-0 shadow-2xs">
                    <GraduationCap size={14} className="text-blue-600 shrink-0" />
                    <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Turma:</span>
                    <span className="text-slate-900 font-extrabold truncate max-w-[180px] sm:max-w-[240px]">
                      {selectedStudentClass ? (
                        `${selectedStudentClass.code ? `${selectedStudentClass.code} - ` : ''}${selectedStudentClass.name}`
                      ) : (
                        (selectedStudent as any).course || 'Sem Turma'
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <div className="relative min-w-[220px] sm:min-w-[280px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="student-search-input-individual"
                    type="text"
                    placeholder="Digite o Nome ou RA do Aluno..."
                    value={searchTerm || searchByName}
                    onChange={(e) => {
                      setSearchByName(e.target.value);
                      handleSearchStudents(e.target.value);
                    }}
                    className="w-full h-8.5 pl-8 pr-3 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  {students.length > 0 && !selectedStudent && (
                    <div className="absolute left-0 top-full mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1 space-y-1">
                      {students.slice(0, 8).map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            handleSelectStudent(s);
                            setViewMode('individual');
                            setReportTarget('student');
                            fetchContributions(s.id, selectedYear);
                            setSearchTerm('');
                            setSearchByName('');
                            setStudents([]);
                          }}
                          className="w-full text-left p-2 hover:bg-blue-50 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-slate-800 truncate">{s.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">RA: {s.registration_number}</p>
                          </div>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded shrink-0">
                            Selecionar
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lado Direito: Período (Mensal / Semestral / Anual) com Tamanho Fixo */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">
            Período:
          </span>
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPeriodOption('mensal');
                const dates = applyPeriodDates('mensal', selectedMonth, selectedSemester, selectedYear);
                if (viewMode === 'period') {
                  fetchPeriodContributions(dates.start, dates.end);
                }
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                periodOption === 'mensal'
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriodOption('semestral');
                const dates = applyPeriodDates('semestral', selectedMonth, selectedSemester, selectedYear);
                if (viewMode === 'period') {
                  fetchPeriodContributions(dates.start, dates.end);
                }
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                periodOption === 'semestral'
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Semestral
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriodOption('anual');
                const dates = applyPeriodDates('anual', selectedMonth, selectedSemester, selectedYear);
                if (viewMode === 'period') {
                  fetchPeriodContributions(dates.start, dates.end);
                }
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                periodOption === 'anual'
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Anual
            </button>
          </div>

          {/* Sub-seletores de Mês / Semestre / Ano com Tamanho Fixo */}
          <div className="w-[275px] shrink-0 h-8.5 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5">
            {periodOption === 'mensal' && (
              <div className="w-full flex items-center justify-between">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setSelectedMonth(m);
                    const dates = applyPeriodDates('mensal', m, selectedSemester, selectedYear);
                    if (viewMode === 'period') {
                      fetchPeriodContributions(dates.start, dates.end);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-none flex-1 truncate"
                >
                  {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((mName, idx) => (
                    <option key={idx + 1} value={idx + 1}>{mName}</option>
                  ))}
                </select>
                <span className="text-slate-300 px-2 shrink-0">/</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    const yr = Number(e.target.value);
                    setSelectedYear(yr);
                    setUnpaidYear(yr);
                    const dates = applyPeriodDates('mensal', selectedMonth, selectedSemester, yr);
                    if (viewMode === 'period') {
                      fetchPeriodContributions(dates.start, dates.end);
                    }
                    if (selectedStudent && viewMode === 'individual') {
                      fetchContributions(selectedStudent.id, yr);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-none shrink-0"
                >
                  {[2026, 2025, 2024, 2023].map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            )}

            {periodOption === 'semestral' && (
              <div className="w-full flex items-center justify-between">
                <select
                  value={selectedSemester}
                  onChange={(e) => {
                    const sem = Number(e.target.value) as 1 | 2;
                    setSelectedSemester(sem);
                    const dates = applyPeriodDates('semestral', selectedMonth, sem, selectedYear);
                    if (viewMode === 'period') {
                      fetchPeriodContributions(dates.start, dates.end);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-none flex-1 truncate pr-1"
                >
                  <option value={1}>1º Semestre (Jan a Jun)</option>
                  <option value={2}>2º Semestre (Jul a Dez)</option>
                </select>
                <span className="text-slate-300 px-1.5 shrink-0">/</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    const yr = Number(e.target.value);
                    setSelectedYear(yr);
                    setUnpaidYear(yr);
                    const dates = applyPeriodDates('semestral', selectedMonth, selectedSemester, yr);
                    if (viewMode === 'period') {
                      fetchPeriodContributions(dates.start, dates.end);
                    }
                    if (selectedStudent && viewMode === 'individual') {
                      fetchContributions(selectedStudent.id, yr);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-none shrink-0"
                >
                  {[2026, 2025, 2024, 2023].map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            )}

            {periodOption === 'anual' && (
              <div className="w-full flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">Exercício:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    const yr = Number(e.target.value);
                    setSelectedYear(yr);
                    setUnpaidYear(yr);
                    const dates = applyPeriodDates('anual', selectedMonth, selectedSemester, yr);
                    if (viewMode === 'period') {
                      fetchPeriodContributions(dates.start, dates.end);
                    }
                    if (selectedStudent && viewMode === 'individual') {
                      fetchContributions(selectedStudent.id, yr);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
                >
                  {[2026, 2025, 2024, 2023].map(yr => (
                    <option key={yr} value={yr}>{yr} (Ano Completo)</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedStudent && (
            <button
              type="button"
              onClick={clearSelection}
              className="h-8.5 px-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
              title="Limpar seleção do aluno"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-2 lg:overflow-hidden overflow-visible">
        {/* Sidebar - Aba Resultados com Fundo Bordô Claro */}
        {students.length > 0 && (
          isResultsCollapsed ? (
            /* Collapsed State */
            <div className="lg:w-12 w-full bg-[#fdf2f4] rounded-2xl border border-rose-200/80 flex lg:flex-col items-center justify-between p-2 shrink-0 transition-all duration-300 lg:order-last shadow-xs">
              <button
                onClick={() => setIsResultsCollapsed(false)}
                className="w-full flex lg:flex-col items-center justify-between lg:justify-center gap-2 text-rose-900 hover:text-rose-950 font-black text-xs cursor-pointer p-1.5 rounded-xl hover:bg-rose-100/80 transition-all group"
                title="Expandir resultados de busca"
              >
                <div className="p-2 bg-rose-200/80 text-rose-950 rounded-xl group-hover:scale-105 transition-transform flex items-center justify-center">
                  <ChevronLeft size={16} className="hidden lg:block" />
                  <ChevronDown size={16} className="lg:hidden" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 hidden lg:block py-2">
                  Resultados ({students.length})
                </span>
                <span className="text-xs font-black uppercase tracking-wider lg:hidden">
                  Ver Resultados ({students.length})
                </span>
              </button>
            </div>
          ) : (
            /* Expanded State */
            <div className="w-full lg:w-80 bg-[#fdf2f4] rounded-2xl shadow-sm border border-rose-200/80 flex flex-col overflow-hidden transition-all duration-300 lg:order-last shrink-0">
              <div className="p-3.5 sm:p-4 border-b border-rose-200/60 bg-rose-100/50 flex items-center justify-between">
                <h3 className="text-[10px] font-black text-rose-900 uppercase tracking-widest flex items-center gap-2">
                  Resultados
                  <span className="px-2 py-0.5 bg-rose-200 text-rose-950 font-black rounded-lg text-[10px]">{students.length}</span>
                </h3>
                <button
                  onClick={() => setIsResultsCollapsed(true)}
                  className="px-2 py-1 bg-rose-200/60 hover:bg-rose-200 text-rose-900 hover:text-rose-950 rounded-lg transition-all text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                  title="Recolher aba de resultados"
                >
                  <span>Recolher</span>
                  <ChevronRight size={14} className="hidden lg:block" />
                  <ChevronUp size={14} className="lg:hidden" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto max-h-60 lg:max-h-none p-2 space-y-1">
                {students.length === 0 && searchTerm.length >= 3 && !isSearching && (
                  <div className="p-8 text-center space-y-3">
                    <Search size={32} className="mx-auto text-rose-300" />
                    <p className="text-xs font-bold text-rose-800/70">Nenhum contribuinte encontrado.</p>
                  </div>
                )}
                {students.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => { setViewMode('individual'); handleSelectStudent(student); }}
                    className={cn(
                      "w-full flex items-center gap-3.5 p-3.5 rounded-xl transition-all text-left cursor-pointer",
                      selectedStudent?.id === student.id 
                        ? "bg-[#721c24] text-white shadow-lg shadow-rose-900/20" 
                        : "bg-white/80 hover:bg-white text-slate-700 border border-rose-100/80 shadow-xs"
                    )}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0",
                      selectedStudent?.id === student.id ? "bg-white/20 text-white" : "bg-rose-100/70 text-rose-900"
                    )}>
                      {student.registration_number.split('/')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{student.name}</p>
                      <p className={cn(
                        "text-[10px] font-bold truncate opacity-80",
                        selectedStudent?.id === student.id ? "text-rose-100" : "text-rose-900/70"
                      )}>
                        {student.registration_number}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {/* Main Workspace */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          {viewMode === 'unpaid' ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
              {/* Unpaid Filters & Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-[#131b2e] flex items-center gap-2">
                    <AlertCircle size={18} className="text-[#131b2e]" />
                    Inadimplência de Mensalidades
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {reportTarget === 'class' ? (
                      selectedClassId === 'all' ? 'Todas as Turmas' : classes.find(c => c.id === selectedClassId)?.name || 'Turma Selecionada'
                    ) : (
                      selectedStudent ? selectedStudent.name : 'Todos os Alunos'
                    )} • Exercício <strong>{unpaidYear}</strong> ({periodOption === 'mensal' ? `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][selectedMonth - 1]}` : periodOption === 'semestral' ? `${selectedSemester}º Semestre` : '12 Meses'})
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Opções do Relatório */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 transition-all select-none border border-slate-200/60">
                      <input 
                        type="checkbox" 
                        checked={hideStudentName} 
                        onChange={(e) => setHideStudentName(e.target.checked)} 
                        className="rounded border-slate-300 text-[#131b2e] focus:ring-slate-400 w-3.5 h-3.5 cursor-pointer accent-[#131b2e]" 
                      />
                      <span className="whitespace-nowrap text-[11px]">Ocultar Nome</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 transition-all select-none border border-slate-200/60">
                      <input 
                        type="checkbox" 
                        checked={showPendingTotalizer} 
                        onChange={(e) => setShowPendingTotalizer(e.target.checked)} 
                        className="rounded border-slate-300 text-[#131b2e] focus:ring-slate-400 w-3.5 h-3.5 cursor-pointer accent-[#131b2e]" 
                      />
                      <span className="whitespace-nowrap text-[11px]">Totalizador</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 transition-all select-none border border-slate-200/60">
                      <input 
                        type="checkbox" 
                        checked={showDateTime} 
                        onChange={(e) => setShowDateTime(e.target.checked)} 
                        className="rounded border-slate-300 text-[#131b2e] focus:ring-slate-400 w-3.5 h-3.5 cursor-pointer accent-[#131b2e]" 
                      />
                      <span className="whitespace-nowrap text-[11px]">Data e Hora</span>
                    </label>
                  </div>

                  {/* Direct Print Button */}
                  <button
                    onClick={generateUnpaidReport}
                    disabled={unpaidReportList.length === 0}
                    className="h-9 px-3.5 bg-[#131b2e] text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                    title="Imprimir relatório de inadimplência"
                  >
                    <Printer size={14} />
                    Imprimir Relatório
                  </button>
                </div>
              </div>

              {/* Unpaid Content Area */}
              <div className="flex-1 overflow-y-auto p-5">
                {unpaidLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={36} className="text-blue-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Processando cruzamento de dados...</p>
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
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Estudante</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Turma</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Meses Pendentes</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Situação das Mensalidades (Ano Completo)</th>
                            <th className="px-6 py-4 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Valor Estimado</th>
                            <th className="px-6 py-4"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {unpaidReportList.map(item => {
                            const itemClass = resolveStudentClass(item.student);
                            const className = itemClass ? (itemClass.code ? `${itemClass.code} - ${itemClass.name}` : itemClass.name) : 'Sem turma';
                            const currentYear = new Date().getFullYear();
                            const currentMonth = new Date().getMonth() + 1; // 1-indexed

                            const overdueMonths = item.unpaidMonths.filter(m => isPeriodOverdue(m, unpaidYear));
                            const hasOverdue = overdueMonths.length > 0;

                            return (
                              <tr key={item.student.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm",
                                      hasOverdue ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                                    )}>
                                      {hideStudentName ? '#' : item.student.name.charAt(0)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-[#131b2e] leading-snug">
                                        {hideStudentName ? 'ALUNO RESERVADO' : item.student.name}
                                      </p>
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
                                  <div className="flex flex-wrap gap-1 max-w-[340px]">
                                    {/* Matrícula (Período 0) */}
                                    {(item.expectedMonths.includes(0) || item.paidMonths.includes(0)) && (() => {
                                      const isPaidMatr = item.paidMonths.includes(0);
                                      const isExpectedMatr = item.expectedMonths.includes(0);
                                      if (isPaidMatr) {
                                        return (
                                          <span 
                                            key="matr-badge" 
                                            className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[8.5px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-sm shadow-emerald-500/5"
                                            title="Taxa de Matrícula Paga / Liquidada"
                                          >
                                            MATR ✓
                                          </span>
                                        );
                                      }
                                      if (isExpectedMatr) {
                                        return (
                                          <span 
                                            key="matr-badge" 
                                            className="px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-md text-[8.5px] font-black uppercase tracking-wider flex items-center gap-0.5"
                                            title="Matrícula Pendente (Obrigatória no 1º Ano)"
                                          >
                                            MATR !
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}

                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                                      const isPaid = item.paidMonths.includes(m);
                                      const isExpected = item.expectedMonths.includes(m);
                                      const isFuture = isPeriodFuture(m, unpaidYear);
                                      const monthName = MONTHS[m - 1].substring(0, 3).toUpperCase();

                                      if (isPaid) {
                                        return (
                                          <span 
                                            key={m} 
                                            className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-md text-[8.5px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-sm shadow-emerald-500/5"
                                            title="Mensalidade Paga / Liquidada"
                                          >
                                            {monthName} ✓
                                          </span>
                                        );
                                      }

                                      if (isExpected) {
                                        return (
                                          <span 
                                            key={m} 
                                            className={cn(
                                              "px-1.5 py-0.5 border rounded-md text-[8.5px] font-black uppercase tracking-wider flex items-center gap-0.5",
                                              isFuture 
                                                ? "bg-blue-50 text-blue-600 border-blue-100/50" 
                                                : "bg-rose-50 text-rose-600 border-rose-100/50"
                                            )}
                                            title={isFuture ? 'Mensalidade a vencer' : 'Mensalidade vencida'}
                                          >
                                            {monthName}
                                            {isFuture && <span className="text-[7px]">⏳</span>}
                                          </span>
                                        );
                                      }

                                      // Non-mandatory/Optional
                                      return (
                                        <span 
                                          key={m} 
                                          className="px-1.5 py-0.5 bg-slate-50 text-slate-400 border border-slate-200/40 border-dashed rounded-md text-[8.5px] font-black uppercase tracking-wider flex items-center gap-0.5"
                                          title="Facultativo / Dispensado (1º Ano)"
                                        >
                                          {monthName}
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
                  </div>
                )}
              </div>
            </div>
          ) : viewMode === 'individual' ? (
            selectedStudent ? (
            <>
            {/* Barra Compacta de Aluno e Indicadores Resumidos */}
            <div className="px-3.5 sm:px-4 py-2 border-b border-slate-200/80 bg-slate-50/80 shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                {/* Lado Esquerdo: Aluno, RA e Status */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#00174b] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-2xs">
                    {selectedStudent.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-[#131b2e] leading-tight truncate">
                        {selectedStudent.name}
                      </h3>
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-black uppercase tracking-wider shrink-0">
                        {selectedStudent.status}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 font-mono leading-none mt-0.5">
                      RA: {selectedStudent.registration_number}
                    </p>
                  </div>
                </div>

                {/* Informação da Turma do Aluno (Quadro 2 Marcado pelo Usuário) */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-2xs shrink-0">
                  <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <GraduationCap size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none">Turma</p>
                    <p className="text-xs font-black text-[#131b2e] truncate max-w-[200px] sm:max-w-[260px]">
                      {selectedStudentClass ? (
                        `${selectedStudentClass.code ? `${selectedStudentClass.code} - ` : ''}${selectedStudentClass.name}`
                      ) : (
                        (selectedStudent as any).course || 'Sem Turma Atribuída'
                      )}
                    </p>
                  </div>
                  {selectedStudentClass?.period && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase">
                      {selectedStudentClass.period}
                    </span>
                  )}
                </div>

                {/* Centro: Indicadores Financeiros Rápidos */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                    <TrendingUp size={12} className="text-emerald-600" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Total Quitado:</span>
                    <span className="text-xs font-black font-mono">
                      {formatCurrency(contributions.reduce((acc, c) => acc + c.amount, 0))}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                    <CheckCircle2 size={12} className="text-blue-600" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-blue-600">Meses Pagos:</span>
                    <span className="text-xs font-black font-mono">
                      {contributions.filter(c => c.reference_month > 0).length} de {currentExpectedMonths.filter(m => m > 0).length}
                    </span>
                  </div>
                </div>

                {/* Lado Direito: Navegação de Ano e Ações Globais */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                    <button 
                      onClick={() => setSelectedYear(selectedYear - 1)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors cursor-pointer"
                      title="Ano anterior"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="px-1.5 text-xs font-black text-[#131b2e] font-mono">{selectedYear}</span>
                    <button 
                      onClick={() => setSelectedYear(selectedYear + 1)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors cursor-pointer"
                      title="Próximo ano"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>

                  {selectedForPrint.length > 0 && (
                    <button 
                      onClick={() => {
                        generateSelectedReceipts(selectedForPrint, 'print');
                        setSelectedForPrint([]);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 transition-all shadow-2xs active:scale-95 cursor-pointer"
                      title="Imprimir Recibos Selecionados"
                    >
                      <Printer size={13} />
                      <span>Imprimir ({selectedForPrint.length})</span>
                    </button>
                  )}

                  <button 
                    onClick={() => setIsPrintingStatement(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#00174b] text-white rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-[#00256e] transition-all shadow-2xs active:scale-95 cursor-pointer"
                    title="Emitir Extrato Financeiro Anual"
                  >
                    <FileText size={13} />
                    <span>Extrato Anual</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Faixa Opcional e Compacta de Taxa de Matrícula */}
            {(studentPlan?.enrollmentFeeRequired || contributions.some(c => c.reference_month === 0)) && (() => {
              const contrib = contributions.find(c => c.reference_month === 0);
              const isExpected = currentExpectedMonths.includes(0);
              const isWaived = Boolean(contrib && isContributionWaived(contrib));
              return (
                <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl border bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-slate-200 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
                      contrib ? "bg-emerald-100 text-emerald-700" : isExpected ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                    )}>
                      <GraduationCap size={13} />
                    </div>
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Taxa de Matrícula
                      </span>
                      {contrib ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                          isWaived
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        )}>
                          {isWaived ? 'Abonada' : 'Quitada'}
                        </span>
                      ) : isExpected ? (
                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                          Obrigatória (1º Ano)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                          Dispensada
                        </span>
                      )}

                      {contrib && (
                        <span className="text-xs font-black font-mono text-slate-900 ml-1">
                          {isWaived ? 'R$ 0,00' : formatCurrency(contrib.amount)}
                        </span>
                      )}
                      {contrib && (
                        <span className="text-[10px] text-slate-500 font-medium">
                          ({isWaived ? 'Abono: ' : 'Pago: '}{safeFormat(contrib.payment_date, 'dd/MM/yy')})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {contrib ? (
                      <>
                        <button 
                          type="button"
                          onClick={() => setReceiptPreviewData([contrib])}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                          title="Visualizar Recibo"
                        >
                          <FileText size={12} />
                          <span>Ver</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => generateSelectedReceipts([contrib], 'print')}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                          title="Imprimir Recibo"
                        >
                          <Printer size={12} />
                          <span>Recibo</span>
                        </button>
                        {contrib.pix_id && (
                          <button 
                            type="button"
                            onClick={() => setUnlinkConfirmationFor(contrib)}
                            className="px-2 py-1 bg-white hover:bg-blue-600 hover:text-white text-blue-600 border border-blue-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            title="Tornar Manual (Desvincular do Pix)"
                          >
                            <Link2Off size={11} />
                            <span>Manual</span>
                          </button>
                        )}
                        {canDelete && (
                          <button 
                            type="button"
                            onClick={() => setDeleteConfirmationFor(contrib)}
                            disabled={isDeleting === contrib.id}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Excluir Registro"
                          >
                            {isDeleting === contrib.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button 
                          type="button"
                          onClick={() => handleAddContribution(0)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95",
                            isExpected 
                              ? "bg-[#00174b] text-white hover:bg-[#00256e]" 
                              : "bg-slate-700 text-white hover:bg-slate-800"
                          )}
                        >
                          <Plus size={12} />
                          <span>+ Quitar Matrícula</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleOpenAbonoModal([0])}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1 cursor-pointer active:scale-95"
                          title="Abonar Taxa de Matrícula (Isenção)"
                        >
                          <Award size={12} />
                          <span>Abonar</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* CONTAINER LADO A LADO RESPONSIVO: CALENDÁRIO À ESQUERDA + EXTRATO/AUDITORIA À DIREITA */}
            <div className="flex-1 flex flex-col xl:flex-row min-h-0 overflow-hidden bg-slate-50/20">
              
              {/* COLUNA ESQUERDA: CALENDÁRIO DAS 12 PARCELAS (LADO A LADO) */}
              <div className="w-full xl:w-[480px] 2xl:w-[520px] shrink-0 flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 bg-white overflow-hidden">
                <div className="p-2 sm:p-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Calendar size={13} className="text-[#00174b]" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                      Calendário {selectedYear}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold font-mono">
                      (12 Parcelas)
                    </span>
                  </div>

                  {/* Ações em Lote para parcelas selecionadas ou recibos */}
                  {selectedPendingMonths.length > 0 ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                      <span className="text-[9px] font-black text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded font-mono">
                        {selectedPendingMonths.length} sel.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleBatchAddContributions(selectedPendingMonths)}
                        className="px-2 py-0.5 bg-[#00174b] hover:bg-blue-900 text-white text-[9px] font-black uppercase tracking-wider rounded-md flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
                        title="Quitar parcelas selecionadas"
                      >
                        <Plus size={10} />
                        <span>Quitar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAbonoModal(selectedPendingMonths)}
                        className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[9px] font-black uppercase tracking-wider rounded-md flex items-center gap-0.5 cursor-pointer active:scale-95 transition-all"
                        title="Abonar parcelas selecionadas"
                      >
                        <Award size={10} />
                        <span>Abonar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPendingMonths([])}
                        className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded text-xs cursor-pointer"
                        title="Desmarcar todas"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : selectedForPrint.length > 0 ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                      <span className="text-[9px] font-black text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded font-mono">
                        {selectedForPrint.length} recibo(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          generateSelectedReceipts(selectedForPrint, 'print');
                          setSelectedForPrint([]);
                        }}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-wider rounded-md flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
                        title="Imprimir recibos selecionados"
                      >
                        <Printer size={10} />
                        <span>Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedForPrint([])}
                        className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded text-xs cursor-pointer"
                        title="Limpar seleção"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100/90 border border-slate-200/60 px-2 py-0.5 rounded-full">
                      Gestão de Contribuições
                    </span>
                  )}
                </div>

                {/* Grid das 12 Parcelas com rolagem independente */}
                <div className="flex-1 overflow-y-auto p-2 sm:p-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2">
                  {MONTHS.map((month, idx) => {
                    const monthNum = idx + 1;
                    const contrib = contributions.find(c => c.reference_month === monthNum);
                    const isExpected = currentExpectedMonths.includes(monthNum);
                    const isFacultative = Boolean(studentPlan?.isFirstYear && studentPlan.facultativeMonths.includes(monthNum));
                    const isOverdue = !contrib && isExpected && isPeriodOverdue(monthNum, selectedYear);
                    const isWaived = Boolean(contrib && isContributionWaived(contrib));
                    const isPendingSelected = selectedPendingMonths.includes(monthNum);

                    return (
                      <div 
                        key={month}
                        className={cn(
                          "rounded-xl border p-2 transition-all duration-200 flex flex-col justify-between gap-1 shadow-2xs hover:shadow-xs",
                          contrib
                            ? isWaived 
                              ? "bg-blue-50/40 border-blue-200/90 hover:border-blue-300"
                              : "bg-emerald-50/40 border-emerald-200/90 hover:border-emerald-300"
                            : isOverdue
                            ? "bg-rose-50/40 border-rose-200/90 hover:border-rose-300 ring-1 ring-rose-200/40"
                            : isFacultative
                            ? "bg-amber-50/30 border-amber-200/80 hover:border-amber-300"
                            : "bg-white border-slate-200/90 hover:border-slate-300",
                          isPendingSelected && "ring-2 ring-blue-500 border-blue-500 bg-blue-50/30"
                        )}
                      >
                        {/* Topo do Card: Checkbox de Seleção, Número, Nome do Mês e Status */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {contrib ? (
                              <input 
                                type="checkbox"
                                checked={selectedForPrint.some(c => c.id === contrib.id)}
                                onChange={() => togglePrintSelection(contrib)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                title="Selecionar para impressão de recibo"
                              />
                            ) : (
                              <input 
                                type="checkbox"
                                checked={isPendingSelected}
                                onChange={() => togglePendingMonthSelection(monthNum)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-[#00174b] focus:ring-blue-500 cursor-pointer shrink-0"
                                title="Selecionar para quitação ou abono em lote"
                              />
                            )}
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-wider truncate",
                              contrib
                                ? isWaived ? "text-blue-900" : "text-emerald-900"
                                : isOverdue
                                ? "text-rose-900"
                                : isFacultative
                                ? "text-amber-900"
                                : "text-slate-800"
                            )}>
                              {month}
                            </span>
                          </div>

                          {/* Pílula de Status Informativa */}
                          {contrib ? (
                            <span className={cn(
                              "px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5",
                              isWaived 
                                ? "bg-blue-100 text-blue-800 border border-blue-200" 
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            )}>
                              <CheckCircle2 size={8} />
                              <span>{isWaived ? 'Abonado' : 'Pago'}</span>
                            </span>
                          ) : isOverdue ? (
                            <span className="px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 shrink-0 flex items-center gap-0.5">
                              <AlertCircle size={8} />
                              <span>Vencido</span>
                            </span>
                          ) : isFacultative ? (
                            <span className="px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                              Facultativo
                            </span>
                          ) : isExpected ? (
                            <span className="px-1.5 py-0.2 rounded text-[7.5px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                              A Vencer
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[7.5px] font-medium uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100 shrink-0">
                              Isento
                            </span>
                          )}
                        </div>

                        {/* Corpo do Card: Valor e Detalhes */}
                        <div className="py-0.5">
                          {contrib ? (
                            <div className="space-y-0.5">
                              <div className="flex items-baseline justify-between gap-1">
                                <span className="text-xs font-black font-mono text-[#131b2e] leading-tight">
                                  {isWaived ? 'R$ 0,00' : formatCurrency(contrib.amount)}
                                </span>
                                <span className={cn(
                                  "text-[7px] font-bold px-1 py-0.2 rounded border",
                                  isWaived 
                                    ? "bg-blue-50 text-blue-700 border-blue-100" 
                                    : contrib.pix_id 
                                    ? "bg-blue-50 text-blue-700 border-blue-100" 
                                    : "bg-slate-50 text-slate-600 border-slate-200"
                                )}>
                                  {isWaived ? 'Abono' : (contrib.pix_id ? 'Pix' : (contrib.payment_method || 'Dinheiro'))}
                                </span>
                              </div>
                              <p className="text-[8.5px] font-bold text-slate-400 leading-tight">
                                {isWaived ? 'Abono: ' : 'Pago: '}{safeFormat(contrib.payment_date, 'dd/MM/yy')}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="flex items-baseline justify-between gap-1">
                                <span className={cn(
                                  "text-[11px] font-bold leading-tight",
                                  isOverdue ? "text-rose-700 font-black" : isFacultative ? "text-amber-700" : "text-slate-500"
                                )}>
                                  {isOverdue ? "Em atraso" : isFacultative ? "Opcional" : isExpected ? "Mensalidade regular" : "Dispensado"}
                                </span>
                              </div>
                              <p className="text-[8.5px] text-slate-400 leading-tight">
                                {isOverdue ? `Venceu: 10/${String(monthNum).padStart(2, '0')}/${selectedYear}` : isExpected ? `Venc.: 10/${String(monthNum).padStart(2, '0')}/${selectedYear}` : 'Sem cobrança'}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Ações Rápidas do Card (Onde se gerencia o processo) */}
                        <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                          {contrib ? (
                            <>
                              <button 
                                type="button"
                                onClick={() => setReceiptPreviewData([contrib])}
                                className="p-1 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-md text-[8.5px] font-bold transition-all cursor-pointer shadow-2xs"
                                title="Visualizar Recibo"
                              >
                                <FileText size={11} />
                              </button>
                              <button 
                                type="button"
                                onClick={() => generateSelectedReceipts([contrib], 'print')}
                                className="flex-1 py-1 px-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                                title="Imprimir Recibo"
                              >
                                <Printer size={10} />
                                <span>Recibo</span>
                              </button>
                              {contrib.pix_id && (
                                <button 
                                  type="button"
                                  onClick={() => setUnlinkConfirmationFor(contrib)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md text-[8.5px] font-bold transition-all cursor-pointer"
                                  title="Tornar Manual (Desvincular do Pix)"
                                >
                                  <Link2Off size={10} />
                                </button>
                              )}
                              {canDelete && (
                                <button 
                                  type="button"
                                  onClick={() => setDeleteConfirmationFor(contrib)}
                                  disabled={isDeleting === contrib.id}
                                  className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer disabled:opacity-50"
                                  title="Excluir Registro"
                                >
                                  {isDeleting === contrib.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button 
                                type="button"
                                onClick={() => handleAddContribution(monthNum)}
                                className={cn(
                                  "flex-1 py-1 px-1 rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95",
                                  isOverdue
                                    ? "bg-rose-700 hover:bg-rose-800 text-white"
                                    : "bg-[#00174b] hover:bg-[#00256e] text-white"
                                )}
                                title={`Registrar quitação de ${month}`}
                              >
                                <Plus size={10} />
                                <span>+ Quitar</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleOpenAbonoModal([monthNum])}
                                className="py-1 px-1.5 rounded-md text-[8.5px] font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center gap-0.5 cursor-pointer active:scale-95 transition-all"
                                title={`Abonar mensalidade de ${month} (Isenção)`}
                              >
                                <Award size={10} />
                                <span>Abonar</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>

              {/* COLUNA DIREITA: PAINEL PROFISSIONAL DE AUDITORIA, EXTRATO & COBRANÇA (LADO A LADO) */}
              <div className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden">
                {/* Cabeçalho com Abas Profissionais */}
                <div className="px-3 sm:px-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setIndividualSubTab('statement')}
                      className={cn(
                        "px-3 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all flex items-center gap-2 border-b-2 cursor-pointer",
                        individualSubTab === 'statement'
                          ? "bg-white text-[#00174b] border-[#00174b] shadow-2xs"
                          : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100"
                      )}
                    >
                      <FileText size={13} className={individualSubTab === 'statement' ? "text-[#00174b]" : "text-slate-400"} />
                      <span>Extrato de Lançamentos & Recibos</span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold",
                        individualSubTab === 'statement' ? "bg-blue-100 text-[#00174b]" : "bg-slate-200 text-slate-600"
                      )}>
                        {contributions.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIndividualSubTab('pending')}
                      className={cn(
                        "px-3 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all flex items-center gap-2 border-b-2 cursor-pointer",
                        individualSubTab === 'pending'
                          ? "bg-white text-rose-700 border-rose-600 shadow-2xs"
                          : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100"
                      )}
                    >
                      <AlertCircle size={13} className={individualSubTab === 'pending' ? "text-rose-600" : "text-slate-400"} />
                      <span>Pendências & Cobrança</span>
                      {individualUnpaidMonths.filter(m => m.isOverdue).length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-black bg-rose-100 text-rose-800">
                          {individualUnpaidMonths.filter(m => m.isOverdue).length} vencida(s)
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIndividualSubTab('balance')}
                      className={cn(
                        "px-3 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all flex items-center gap-2 border-b-2 cursor-pointer",
                        individualSubTab === 'balance'
                          ? "bg-white text-indigo-700 border-indigo-600 shadow-2xs"
                          : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100"
                      )}
                    >
                      <TrendingUp size={13} className={individualSubTab === 'balance' ? "text-indigo-600" : "text-slate-400"} />
                      <span>Balanço & Diagnóstico</span>
                    </button>
                  </div>

                  {/* Ações rápidas da aba */}
                  <div className="flex items-center gap-2 py-1">
                    {individualSubTab === 'statement' && contributions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allContribs = [...contributions].sort((a, b) => a.reference_month - b.reference_month);
                          generateSelectedReceipts(allContribs, 'print');
                        }}
                        className="px-2.5 py-1 bg-[#00174b] hover:bg-blue-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 transition-all"
                        title="Imprimir todos os comprovantes emitidos em lote"
                      >
                        <Printer size={12} />
                        <span>Imprimir Extrato Completo ({contributions.length})</span>
                      </button>
                    )}

                    {individualSubTab === 'pending' && individualUnpaidMonths.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                          Total Aberto: {formatCurrency(individualUnpaidMonths.reduce((acc, m) => acc + m.amount, 0))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Conteúdo com rolagem da Sub-Aba Ativa */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                  {/* ABA 1: EXTRATO DE LANÇAMENTOS (SOMENTE INFORMATIVO & DETALHADO) */}
                  {individualSubTab === 'statement' && (
                    contributions.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                          <FileText size={24} />
                        </div>
                        <h5 className="text-sm font-black text-slate-700 uppercase">Nenhum pagamento registrado em {selectedYear}</h5>
                        <p className="text-xs text-slate-400 max-w-sm mt-1">
                          O gerenciamento, quitações e abonos são realizados através dos cartões mensais no quadro de contribuições à esquerda.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full min-w-[620px] text-left text-xs">
                          <thead className="bg-[#00174b] text-white text-[10px] font-black uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">#</th>
                              <th className="py-2.5 px-3">Referência</th>
                              <th className="py-2.5 px-3">Data Pagto</th>
                              <th className="py-2.5 px-3">Modalidade</th>
                              <th className="py-2.5 px-3">Valor Pago</th>
                              <th className="py-2.5 px-3">Situação</th>
                              <th className="py-2.5 px-3">Autenticação / Registro</th>
                              <th className="py-2.5 px-3 text-right">Observações & Justificativas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {[...contributions]
                              .sort((a, b) => a.reference_month - b.reference_month)
                              .map((c, index) => {
                                const isWaived = isContributionWaived(c);
                                return (
                                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400 font-bold">
                                      {String(index + 1).padStart(2, '0')}
                                    </td>
                                    <td className="py-2.5 px-3 font-black text-slate-900">
                                      {c.reference_month === 0 ? 'Taxa de Matrícula' : `Mensalidade de ${MONTHS[c.reference_month - 1]}/${c.reference_year}`}
                                    </td>
                                    <td className="py-2.5 px-3 font-medium text-slate-600">
                                      {safeFormat(c.payment_date, 'dd/MM/yyyy')}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border",
                                        isWaived
                                          ? "bg-blue-50 text-blue-700 border-blue-200"
                                          : c.pix_id
                                          ? "bg-blue-50 text-blue-700 border-blue-200"
                                          : "bg-slate-100 text-slate-700 border-slate-200"
                                      )}>
                                        {isWaived ? 'Abono (Isenção)' : c.pix_id ? 'Pix (Importado)' : (c.payment_method || 'Dinheiro')}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                                      {isWaived ? 'R$ 0,00' : formatCurrency(c.amount)}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={cn(
                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                        isWaived ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                                      )}>
                                        <CheckCircle2 size={10} />
                                        <span>{isWaived ? 'Isento' : 'Liquidado'}</span>
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-[10px] font-mono text-slate-500">
                                      {c.pix_id ? `Pix: ${c.pix_id.substring(0, 16)}...` : `Recibo: #${c.reference_year}-${String(c.reference_month).padStart(2, '0')}`}
                                    </td>
                                    <td className="py-2.5 px-3 text-[11px] text-slate-600 font-medium text-right max-w-xs break-words">
                                      {c.observations || (isWaived ? (c.waiver_reason || 'Isenção administrativa') : 'Sem observações adicionais')}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t border-slate-200 text-[10px] font-bold text-slate-600">
                            <tr>
                              <td colSpan={4} className="py-2.5 px-3 text-right font-black uppercase tracking-wider">
                                Total Geral Liquidado ({contributions.length} parcelas):
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black text-sm text-[#00174b]">
                                {formatCurrency(contributions.reduce((acc, c) => acc + c.amount, 0))}
                              </td>
                              <td colSpan={3} className="py-2.5 px-3 text-right text-slate-500">
                                {contributions.filter(c => isContributionWaived(c)).length} parcela(s) com abono administrativo
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                  )}

                  {/* ABA 2: PENDÊNCIAS & DIAGNÓSTICO (SOMENTE INFORMATIVO & DIAGNÓSTICO) */}
                  {individualSubTab === 'pending' && (
                    individualUnpaidMonths.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-emerald-50/30 rounded-2xl border border-emerald-100">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mb-3">
                          <CheckCircle2 size={24} />
                        </div>
                        <h5 className="text-sm font-black text-emerald-900 uppercase">Aluno 100% Adimplente em {selectedYear}!</h5>
                        <p className="text-xs text-emerald-700 max-w-sm mt-1">
                          Todas as parcelas previstas para este estudante estão quitadas ou devidamente abonadas. Nenhuma pendência financeira.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full min-w-[620px] text-left text-xs">
                          <thead className="bg-[#00174b] text-white text-[10px] font-black uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Parcela</th>
                              <th className="py-2.5 px-3">Data Vencimento</th>
                              <th className="py-2.5 px-3">Situação</th>
                              <th className="py-2.5 px-3">Valor Previsto</th>
                              <th className="py-2.5 px-3">Regra Aplicável</th>
                              <th className="py-2.5 px-3 text-right">Diagnóstico Financeiro</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {individualUnpaidMonths.map((item) => (
                              <tr key={item.month} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3 font-black text-slate-900 flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center font-mono text-[10px] font-bold">
                                    {item.month}
                                  </span>
                                  <span>{item.monthName} / {selectedYear}</span>
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                                  {item.dueDate}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border",
                                    item.isOverdue
                                      ? "bg-rose-50 text-rose-700 border-rose-200 font-black animate-pulse"
                                      : item.isFacultative
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-slate-100 text-slate-600 border-slate-200"
                                  )}>
                                    {item.isOverdue ? 'Vencida (Em Débito)' : item.isFacultative ? 'Facultativo (1º Ano)' : 'A Vencer (Futuro)'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                                  {formatCurrency(item.amount)}
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-slate-500">
                                  {item.isFacultative ? 'Opcional, não gera restrição' : 'Mensalidade regular prevista em plano'}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <span className={cn(
                                    "text-[9.5px] font-bold px-2 py-0.5 rounded-md border",
                                    item.isOverdue
                                      ? "bg-rose-50 text-rose-700 border-rose-200 font-black"
                                      : item.isFacultative
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-slate-50 text-slate-600 border-slate-200"
                                  )}>
                                    {item.isOverdue ? "Pendente de Quitação" : item.isFacultative ? "Dispensável" : "Dentro do Prazo"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-rose-50/50 border-t border-rose-200 text-[10px] font-bold text-rose-900">
                            <tr>
                              <td colSpan={3} className="py-2.5 px-3 text-right font-black uppercase tracking-wider">
                                Total em Atraso ({individualUnpaidMonths.filter(m => m.isOverdue).length} parcelas vencidas):
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black text-sm text-rose-700">
                                {formatCurrency(individualUnpaidMonths.filter(m => m.isOverdue).reduce((acc, m) => acc + m.amount, 0))}
                              </td>
                              <td colSpan={2} className="py-2.5 px-3 text-right text-slate-500">
                                Total a Vencer: {formatCurrency(individualUnpaidMonths.filter(m => !m.isOverdue && !m.isFacultative).reduce((acc, m) => acc + m.amount, 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                  )}

                  {/* ABA 3: BALANÇO & DIAGNÓSTICO FINANCEIRO */}
                  {individualSubTab === 'balance' && (
                    <div className="space-y-4">
                      {/* 4 Cards de Métricas Analíticas */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Previsto no Ano</span>
                          <p className="text-base font-black text-slate-900 font-mono">
                            {formatCurrency((contributions.length + individualUnpaidMonths.length) * 100)}
                          </p>
                          <span className="text-[10px] text-slate-500 font-medium mt-1 block">
                            {contributions.length + individualUnpaidMonths.length} parcelas no exercício
                          </span>
                        </div>

                        <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200 shadow-2xs">
                          <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Total Efetivamente Pago</span>
                          <p className="text-base font-black text-emerald-800 font-mono">
                            {formatCurrency(contributions.filter(c => !isContributionWaived(c)).reduce((acc, c) => acc + c.amount, 0))}
                          </p>
                          <span className="text-[10px] text-emerald-600 font-medium mt-1 block">
                            {contributions.filter(c => !isContributionWaived(c)).length} parcela(s) quitada(s)
                          </span>
                        </div>

                        <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200 shadow-2xs">
                          <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest block mb-1">Total de Abonos (Isenções)</span>
                          <p className="text-base font-black text-blue-800 font-mono">
                            {contributions.filter(c => isContributionWaived(c)).length} mês(es)
                          </p>
                          <span className="text-[10px] text-blue-600 font-medium mt-1 block">
                            Concedidos administrativamente
                          </span>
                        </div>

                        <div className="p-3.5 bg-rose-50/50 rounded-xl border border-rose-200 shadow-2xs">
                          <span className="text-[9px] font-black text-rose-700 uppercase tracking-widest block mb-1">Saldo em Atraso (Débito)</span>
                          <p className="text-base font-black text-rose-700 font-mono">
                            {formatCurrency(individualUnpaidMonths.filter(m => m.isOverdue).reduce((acc, m) => acc + m.amount, 0))}
                          </p>
                          <span className="text-[10px] text-rose-600 font-medium mt-1 block">
                            {individualUnpaidMonths.filter(m => m.isOverdue).length} parcela(s) vencida(s)
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso de Quitação Anual */}
                      <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/80">
                        <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2">
                          <span className="text-slate-800">Status Geral do Exercício {selectedYear}</span>
                          <span className="text-[#00174b] font-mono">
                            {contributions.length} de {contributions.length + individualUnpaidMonths.length} parcelas resolvidas ({Math.round((contributions.length / (contributions.length + individualUnpaidMonths.length || 1)) * 100)}%)
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                          {/* Liquidado */}
                          <div 
                            style={{ width: `${(contributions.filter(c => !isContributionWaived(c)).length / (contributions.length + individualUnpaidMonths.length || 1)) * 100}%` }}
                            className="bg-emerald-500 h-full transition-all"
                            title="Pago em dia"
                          />
                          {/* Abonado */}
                          <div 
                            style={{ width: `${(contributions.filter(c => isContributionWaived(c)).length / (contributions.length + individualUnpaidMonths.length || 1)) * 100}%` }}
                            className="bg-blue-500 h-full transition-all"
                            title="Abonado"
                          />
                          {/* Vencido */}
                          <div 
                            style={{ width: `${(individualUnpaidMonths.filter(m => m.isOverdue).length / (contributions.length + individualUnpaidMonths.length || 1)) * 100}%` }}
                            className="bg-rose-500 h-full transition-all"
                            title="Vencido em atraso"
                          />
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 mt-2 flex-wrap">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Pago ({contributions.filter(c => !isContributionWaived(c)).length})</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Abonado ({contributions.filter(c => isContributionWaived(c)).length})</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Vencido ({individualUnpaidMonths.filter(m => m.isOverdue).length})</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> A Vencer ({individualUnpaidMonths.filter(m => !m.isOverdue && !m.isFacultative).length})</span>
                        </div>
                      </div>

                      {/* Informações Cadastrais e Contratuais */}
                      <div className="p-4 bg-white rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Estudante</span>
                          <p className="font-black text-slate-800">{selectedStudent.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">RA: {selectedStudent.registration_number}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Turma & Curso Vinculado</span>
                          <p className="font-bold text-slate-800">{resolveStudentClass(selectedStudent)?.name || 'Turma não informada'}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{resolveStudentClass(selectedStudent)?.course || 'Curso regular'}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Regra de Contribuição</span>
                          <p className="font-bold text-slate-800">Dia 10 de cada mês</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {studentPlan?.isFirstYear ? 'Plano de Ingressante (1º Ano)' : 'Plano Regular Anual (Veterano)'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-slate-50/50">
                <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-900 mb-4 shadow-2xs">
                  <UserIcon size={32} />
                </div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider mb-1.5">
                  Ficha Individual do Aluno
                </h3>
                <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                  Digite o <strong>Nome</strong> ou <strong>Matrícula/RA</strong> do estudante no campo de busca acima para carregar o histórico financeiro detalhado de contribuições.
                </p>

                {/* 3 Cartões de Orientação Simples e Objetivos */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl w-full text-left mb-6">
                  <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center mb-2">
                      1
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 mb-1">Localizar Aluno</h4>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Informe o nome ou número de matrícula/RA no campo superior.
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 font-black text-xs flex items-center justify-center mb-2">
                      2
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 mb-1">Selecionar Cadastro</h4>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Clique no aluno desejado na lista suspensa de sugestões instantâneas.
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center mb-2">
                      3
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 mb-1">Histórico Completo</h4>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Consulte as 12 parcelas, registre quitações, abonos e emita relatórios.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const inputEl = document.getElementById('student-search-input-individual') as HTMLInputElement | null;
                    if (inputEl) {
                      inputEl.focus();
                      inputEl.select();
                    }
                  }}
                  className="px-5 py-2.5 bg-[#00174b] hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Search size={14} />
                  <span>Digitar Nome ou RA do Aluno</span>
                </button>
              </div>
            )
          ) : (
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#131b2e] leading-tight">Lançamentos de Contribuição</h3>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                        {reportTarget === 'class' ? (
                          selectedClassId === 'all' ? 'Todas as Turmas' : classes.find(c => c.id === selectedClassId)?.name || 'Turma Selecionada'
                        ) : (
                          selectedStudent ? selectedStudent.name : 'Aluno'
                        )}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200/80 font-black text-[9.5px] uppercase tracking-wider">
                        {periodOption === 'mensal' && `Mês de ${MONTHS[selectedMonth - 1]} / ${selectedYear}`}
                        {periodOption === 'semestral' && `${selectedSemester}º Semestre de ${selectedYear} (${selectedSemester === 1 ? 'Jan a Jun' : 'Jul a Dez'})`}
                        {periodOption === 'anual' && `Exercício Anual de ${selectedYear}`}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-slate-500 font-bold text-[10px]">
                        {formatDateForDisplay(startDate)} ATÉ {formatDateForDisplay(endDate)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-4">
                    <div className="flex flex-col items-center">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Total</p>
                      <p className="text-sm md:text-base font-black text-[#131b2e]">{formatCurrency(periodData.reduce((acc, c) => acc + c.amount, 0))}</p>
                    </div>
                    <div className="w-px h-6 bg-emerald-200" />
                    <div className="flex flex-col items-center text-right">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Registros</p>
                      <p className="text-sm md:text-base font-black text-[#131b2e]">{periodData.length}</p>
                    </div>
                  </div>

                  {selectedForPrint.length > 0 && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                      <button 
                        onClick={() => {
                          triggerDirectPrint(selectedForPrint);
                        }}
                        className="px-3 py-2 md:px-4 md:py-3 bg-white text-emerald-600 border border-emerald-600 rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-wider hover:bg-emerald-50 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <FileDown size={14} />
                        Ver ({selectedForPrint.length})
                      </button>
                      <button 
                        onClick={() => {
                          generateSelectedReceipts(selectedForPrint, 'print');
                          setSelectedForPrint([]);
                        }}
                        className="px-3 py-2 md:px-4 md:py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                      >
                        <Printer size={14} />
                        Imprimir Seleção
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto rounded-3xl border border-slate-100 shadow-sm bg-white">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[840px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-5 py-3.5 w-12 text-center"></th>
                      
                      {/* Contribuinte / Matrícula com ordenação */}
                      <th 
                        onClick={() => handlePeriodSort('name')}
                        className="px-5 py-3.5 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-700 transition-colors select-none group"
                        title="Clique para ordenar por Nome do Contribuinte"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Contribuinte / Matrícula</span>
                          {periodSortField === 'name' ? (
                            periodSortDirection === 'asc' ? <ArrowUp size={13} className="text-blue-600 font-black" /> : <ArrowDown size={13} className="text-blue-600 font-black" />
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>

                      {/* Informação do Período */}
                      <th className="px-5 py-3.5 text-xs font-black text-slate-500 uppercase tracking-widest">
                        Informação do Período
                      </th>

                      {/* Método */}
                      <th className="px-5 py-3.5 text-xs font-black text-slate-500 uppercase tracking-widest">
                        Método
                      </th>

                      {/* Data Pagto com ordenação */}
                      <th 
                        onClick={() => handlePeriodSort('date')}
                        className="px-5 py-3.5 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-700 transition-colors select-none group"
                        title="Clique para ordenar por Data do Pagamento (Padrão: Mais recente primeiro)"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Data Pagto</span>
                          {periodSortField === 'date' ? (
                            periodSortDirection === 'asc' ? <ArrowUp size={13} className="text-blue-600 font-black" /> : <ArrowDown size={13} className="text-blue-600 font-black" />
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>

                      {/* Valor Total com ordenação */}
                      <th 
                        onClick={() => handlePeriodSort('amount')}
                        className="px-5 py-3.5 text-right text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-700 transition-colors select-none group"
                        title="Clique para ordenar por Valor Total"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Valor Total</span>
                          {periodSortField === 'amount' ? (
                            periodSortDirection === 'asc' ? <ArrowUp size={13} className="text-blue-600 font-black" /> : <ArrowDown size={13} className="text-blue-600 font-black" />
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>

                      <th className="px-5 py-3.5 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-24 text-center text-slate-300">
                          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                            <AlertCircle size={32} className="opacity-20" />
                          </div>
                          <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Nenhum registro encontrado</p>
                          <p className="text-sm text-slate-300 mt-2">Tente ajustar os filtros de período ou nome acima.</p>
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
                              total: 0,
                              latestDate: '',
                              earliestDate: ''
                            };
                          }
                          acc[studentId].contributions.push(curr);
                          acc[studentId].total += Number(curr.amount || 0);
                          const payDate = curr.payment_date || curr.created_at || '';
                          if (!acc[studentId].latestDate || payDate > acc[studentId].latestDate) {
                            acc[studentId].latestDate = payDate;
                          }
                          if (!acc[studentId].earliestDate || payDate < acc[studentId].earliestDate) {
                            acc[studentId].earliestDate = payDate;
                          }
                          return acc;
                        }, {} as Record<string, { student?: Student; contributions: (Contribution & { student?: Student })[]; total: number; latestDate: string; earliestDate: string }>);

                        const groupList = Object.values(grouped);

                        // Ordenar lançamentos internos de cada aluno:
                        // Se as datas de pagamento forem diferentes, segue a ordenação da coluna de data;
                        // Se a data de pagamento for a mesma (ou na ausência de datas distintas), mantém estritamente a ordem cronológica mensal (ano e mês de referência: Jan -> Dez)
                        groupList.forEach(group => {
                          group.contributions.sort((a, b) => {
                            const da = a.payment_date ? new Date(a.payment_date).getTime() : 0;
                            const db = b.payment_date ? new Date(b.payment_date).getTime() : 0;
                            if (da !== db) {
                              return periodSortDirection === 'asc' ? da - db : db - da;
                            }
                            // Mesma data de pagamento: ordenar estritamente pelo ano e mês de referência crescente (Janeiro -> Dezembro)
                            const yDiff = (Number(a.reference_year) || 0) - (Number(b.reference_year) || 0);
                            if (yDiff !== 0) return yDiff;
                            return (Number(a.reference_month) || 0) - (Number(b.reference_month) || 0);
                          });
                        });

                        // Ordenar lista de contribuintes agrupada conforme seleção do usuário (Padrão: Data mais recente primeiro)
                        groupList.sort((a, b) => {
                          if (periodSortField === 'name') {
                            const nameA = a.student?.name || '';
                            const nameB = b.student?.name || '';
                            const cmp = nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
                            return periodSortDirection === 'asc' ? cmp : -cmp;
                          } else if (periodSortField === 'amount') {
                            const diff = a.total - b.total;
                            return periodSortDirection === 'asc' ? diff : -diff;
                          } else {
                            // date (mais recente para o mais antigo por padrão)
                            const da = a.latestDate ? new Date(a.latestDate).getTime() : 0;
                            const db = b.latestDate ? new Date(b.latestDate).getTime() : 0;
                            const diff = da - db;
                            if (diff !== 0) return periodSortDirection === 'asc' ? diff : -diff;
                            return (a.student?.name || '').localeCompare(b.student?.name || '', 'pt-BR', { sensitivity: 'base' });
                          }
                        });

                        return groupList.map((group: any) => {
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
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-3">
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
                                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs shrink-0">
                                      {group.student?.name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-[#131b2e] leading-snug">{group.student?.name || 'Contribuinte Deletado'}</p>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">{group.student?.registration_number || 'S/ MATRÍCULA'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex flex-col gap-1">
                                    <span className="w-fit px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-black uppercase tracking-wider border border-blue-200/60">
                                      {group.contributions.length} {group.contributions.length === 1 ? 'Lançamento' : 'Lançamentos'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-bold">
                                      {[...group.contributions]
                                        .sort((a: any, b: any) => {
                                          const yDiff = (Number(a.reference_year) || 0) - (Number(b.reference_year) || 0);
                                          if (yDiff !== 0) return yDiff;
                                          return (Number(a.reference_month) || 0) - (Number(b.reference_month) || 0);
                                        })
                                        .map((c: any) => c.reference_month === 0 ? 'Matrícula' : MONTHS[c.reference_month - 1]?.substring(0, 3))
                                        .join(', ')}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex flex-wrap gap-1.5 items-center">
                                    {(() => {
                                      const uniqueTypes = Array.from(new Set(group.contributions.map((c: any) => {
                                        if (isContributionWaived(c)) return 'abono';
                                        if (c.pix_id || (c.payment_method || '').toLowerCase() === 'pix') return c.pix_id ? 'pix_import' : 'pix';
                                        const raw = (c.payment_method || '').toLowerCase();
                                        if (raw.includes('crédito') || raw.includes('credito')) return 'credit';
                                        if (raw.includes('débito') || raw.includes('debito')) return 'debit';
                                        if (raw.includes('cartão') || raw.includes('cartao')) return 'card';
                                        return 'cash';
                                      })));

                                      return uniqueTypes.map((mType: any) => {
                                        if (mType === 'abono') return <React.Fragment key={mType}>{renderPaymentMethodBadge('Abono', true)}</React.Fragment>;
                                        if (mType === 'pix_import') return <React.Fragment key={mType}>{renderPaymentMethodBadge('PIX', false, 'imp')}</React.Fragment>;
                                        if (mType === 'pix') return <React.Fragment key={mType}>{renderPaymentMethodBadge('PIX', false)}</React.Fragment>;
                                        if (mType === 'credit') return <React.Fragment key={mType}>{renderPaymentMethodBadge('Cartão de Crédito', false)}</React.Fragment>;
                                        if (mType === 'debit') return <React.Fragment key={mType}>{renderPaymentMethodBadge('Cartão de Débito', false)}</React.Fragment>;
                                        if (mType === 'card') return <React.Fragment key={mType}>{renderPaymentMethodBadge('Cartão', false)}</React.Fragment>;
                                        return <React.Fragment key={mType}>{renderPaymentMethodBadge('Dinheiro', false)}</React.Fragment>;
                                      });
                                    })()}
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar size={13} className="text-slate-400 shrink-0" />
                                    <span className="font-mono text-xs font-bold text-slate-800">
                                      {safeFormat(group.latestDate, 'dd/MM/yyyy')}
                                    </span>
                                    {group.contributions.length > 1 && (
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 py-0.2 rounded" title={`${group.contributions.length} pagamentos realizados`}>
                                        +{group.contributions.length - 1}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  <span className="text-sm font-black text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl font-mono">{formatCurrency(group.total)}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const studentWithId = group.student ? { id: studentId, ...group.student } : null;
                                        setSelectedStudent(studentWithId as Student); 
                                        setViewMode('individual'); 
                                        fetchContributions(studentId, group.contributions[0].reference_year); 
                                      }} 
                                      className="p-2 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm border border-blue-100 cursor-pointer" 
                                      title="Ficha e Extrato do Aluno"
                                    >
                                      <FileText size={16} />
                                    </button>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        triggerDirectPrint(group.contributions);
                                      }} 
                                      className="p-2 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm border border-emerald-100 cursor-pointer" 
                                      title="Visualizar Recibos Múltiplos"
                                    >
                                      <Printer size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && group.contributions.map((c: any) => (
                                <tr key={c.id} className="bg-slate-50/20 border-b border-slate-100/60 hover:bg-slate-50/60 transition-colors group/inner">
                                  <td className="px-5 py-2.5 pl-12">
                                     <input 
                                      type="checkbox"
                                      checked={selectedForPrint.some(s => s.id === c.id)}
                                      onChange={() => togglePrintSelection(c)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                      <span>
                                        {c.reference_month === 0 ? 'Taxa de Matrícula' : `Mensalidade de ${MONTHS[c.reference_month - 1]}/${c.reference_year}`}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono font-bold">
                                      {c.reference_month === 0 ? 'Mês 0' : `Mês ${String(c.reference_month).padStart(2, '0')}/${c.reference_year}`}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <div className="flex items-center gap-2">
                                      {renderPaymentMethodBadge(c.payment_method, isContributionWaived(c), c.pix_id)}
                                      {c.pix_id && <span title="Registro Conciliado"><Link2Off size={11} className="text-blue-500" /></span>}
                                      {c.observations && (
                                        <span className="text-[10px] text-slate-400 italic truncate max-w-[140px]" title={c.observations}>
                                          • {c.observations}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700">
                                      <Clock size={12} className="text-slate-400" />
                                      <span>{safeFormat(c.payment_date, 'dd/MM/yyyy')}</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5 text-right">
                                    <span className="text-xs font-mono font-black text-slate-900">
                                      {isContributionWaived(c) ? 'R$ 0,00' : formatCurrency(c.amount)}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover/inner:opacity-100 transition-opacity">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setReceiptPreviewData([c]); }} 
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer" 
                                        title="Visualizar Recibo"
                                      >
                                        <FileText size={15} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateSelectedReceipts([c], 'print'); }} 
                                        className="p-1.5 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all shadow-xs cursor-pointer" 
                                        title="Imprimir Agora"
                                      >
                                        <Printer size={15} />
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
            </div>
          )}
        </div>

        {/* Modais de Confirmação Customizados */}
        {((deleteConfirmationFor && canDelete) || unlinkConfirmationFor) && (
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
                    ? `Deseja realmente excluir permanentemente o registro de ${formatCurrency(deleteConfirmationFor.amount)} referente a ${formatContributionMonth(deleteConfirmationFor.reference_month)}?`
                    : 'Isso removerá o vínculo com o Pix, tornando este recebimento um registro independente na ficha do aluno.'}
                </p>
              </div>

              {deleteConfirmationFor && (
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
                    onEnter={handleDeleteContribution}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { 
                    setDeleteConfirmationFor(null); 
                    setUnlinkConfirmationFor(null); 
                    setEnteredPin(''); 
                    setPinError(''); 
                  }}
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
        <div className="fixed inset-0 bg-[#00174b]/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col my-auto max-h-[95vh]">
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#00174b] leading-tight">Registrar Contribuição</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Lançamento na Ficha do Aluno • {selectedYear}</p>
                </div>
              </div>
              <button 
                onClick={() => setManualMonths([])}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {/* Seleção de Meses - 6 colunas para caber em 2 linhas compactas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecione os Períodos / Meses</label>
                  {manualMonths.length > 0 && (
                    <button 
                      onClick={() => setManualMonths([])}
                      className="text-[10px] font-black text-red-500 uppercase hover:underline"
                    >
                      Limpar Tudo
                    </button>
                  )}
                </div>

                {/* Opção Taxa de Matrícula (Período 0) */}
                <button
                  type="button"
                  onClick={() => toggleManualMonth(0)}
                  className={cn(
                    "w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border flex items-center justify-between shadow-sm",
                    manualMonths.includes(0)
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-emerald-500/20"
                      : "bg-emerald-50/60 border-emerald-200/80 text-emerald-800 hover:bg-emerald-100/70"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <GraduationCap size={16} />
                    Taxa de Matrícula (Período 0 - Início do Curso)
                  </span>
                  {manualMonths.includes(0) ? (
                    <span className="px-2 py-0.5 bg-white/20 rounded text-[9px] font-black uppercase">Selecionada ✓</span>
                  ) : (
                    <span className="text-[10px] font-bold opacity-75">Clique para selecionar</span>
                  )}
                </button>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  {MONTHS.map((m, idx) => {
                    const monthNum = idx + 1;
                    const isSelected = manualMonths.includes(monthNum);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleManualMonth(monthNum)}
                        className={cn(
                          "py-2 px-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border",
                          isSelected 
                            ? "bg-blue-600 border-blue-600 text-white shadow-sm scale-[1.02]" 
                            : "bg-white border-slate-100 text-slate-600 hover:border-blue-200 hover:text-blue-600"
                        )}
                      >
                        {m.substring(0, 3)}
                      </button>
                    );
                  })}
                </div>
                {manualMonths.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {manualMonths.map(pNum => (
                      <span key={pNum} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px] font-black uppercase border border-blue-100">
                        {formatContributionMonth(pNum)}
                      </span>
                    ))}
                  </div>
                )}
                {manualMonths.length > 1 && (
                  <div className="bg-amber-50 px-3 py-2 rounded-lg border border-amber-100 flex items-center gap-2">
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    <p className="text-[11px] text-amber-800 font-bold leading-tight">O valor de R$ {manualAmount} será rateado proporcionalmente entre os {manualMonths.length} meses selecionados.</p>
                  </div>
                )}
              </div>

              {/* Grid Responsivo para Valores e Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Valor Total */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Total</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">R$</span>
                    <input 
                      type="text"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      onBlur={formatManualAmount}
                      onKeyDown={(e) => e.key === 'Enter' && formatManualAmount()}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-xl font-black text-[#00174b] focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Data do Pagamento */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data do Pagamento</label>
                  <input 
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm font-bold text-[#00174b] focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all h-[46px]"
                  />
                </div>
              </div>

              {/* Forma de Recebimento */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Forma de Recebimento</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setManualMethod(method)}
                      className={cn(
                        "py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border cursor-pointer text-center",
                        manualMethod === method 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-200 hover:text-blue-600"
                      )}
                    >
                      {method === 'Cartão de Crédito' ? 'Cartão Créd.' : method === 'Cartão de Débito' ? 'Cartão Déb.' : method}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleOpenAbonoModal(manualMonths)}
                    className="py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 flex items-center justify-center gap-1 shadow-2xs cursor-pointer text-center"
                    title="Abonar períodos selecionados com justificativa"
                  >
                    <Award size={13} className="text-amber-600" />
                    Abono
                  </button>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações</label>
                <textarea 
                  value={manualObservations}
                  onChange={(e) => setManualObservations(e.target.value)}
                  placeholder="Informações adicionais sobre este pagamento..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium text-[#00174b] focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all resize-none h-16"
                />
              </div>
              
              <div className="pt-2">
                <button 
                  onClick={saveManualContribution}
                  disabled={isSavingManual || manualMonths.length === 0}
                  className="w-full bg-[#00174b] text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2.5 hover:bg-blue-900 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingManual ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Salvando Contribuições...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Registrar {manualMonths.length > 1 ? `${manualMonths.length} Meses` : 'Pagamento'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pequena Janela / Modal de Abono de Contribuição */}
      {abonoModal && abonoModal.isOpen && selectedStudent && (
        <div className="fixed inset-0 bg-[#00174b]/50 backdrop-blur-sm z-[130] flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:hidden">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col my-auto">
            {/* Header da Janela */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00174b] text-white flex items-center justify-center shadow-md shadow-blue-950/20 shrink-0">
                  <Award size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#00174b] uppercase tracking-wide leading-tight">Abonar Contribuição</h3>
                  <p className="text-[10px] font-bold text-slate-500">Concessão de Isenção do Aluno • {selectedYear}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setAbonoModal(null)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo da Janela */}
            <div className="p-4 sm:p-5 space-y-3.5">
              {/* Identificação do Aluno e Períodos */}
              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100/90 space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-slate-500 uppercase tracking-wider">Aluno(a):</span>
                  <span className="font-mono text-slate-600 font-bold">Matrícula: {selectedStudent.registration_number || '---'}</span>
                </div>
                <p className="text-xs font-black text-[#00174b] truncate">{selectedStudent.name}</p>
                <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-500">Período(s) a Abonar:</span>
                  {abonoModal.periods.map(p => (
                    <span key={p} className="px-2 py-0.5 bg-[#00174b] text-white rounded text-[9px] font-black uppercase">
                      {formatContributionMonth(p)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Data da Concessão */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                  Data da Concessão do Abono
                </label>
                <input 
                  type="date"
                  value={abonoModal.date}
                  onChange={(e) => setAbonoModal(prev => prev ? { ...prev, date: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-[#00174b] focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Campo de Texto Limitado para Breve Justificativa */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                    Breve Justificativa do Motivo do Abono *
                  </label>
                  <span className={cn(
                    "text-[10px] font-mono font-bold",
                    abonoModal.reason.length >= 230 ? "text-red-600" : "text-slate-400"
                  )}>
                    {abonoModal.reason.length} / 250
                  </span>
                </div>
                <textarea 
                  value={abonoModal.reason}
                  onChange={(e) => setAbonoModal(prev => prev ? { ...prev, reason: e.target.value.slice(0, 250) } : null)}
                  maxLength={250}
                  rows={3}
                  placeholder="Informe o motivo do abono (ex: bolsa de estudos pastoral, dispensa pela coordenação)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all resize-none leading-relaxed placeholder:text-slate-400"
                />
                <p className="text-[9.5px] text-slate-500 leading-snug italic bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                  ℹ️ <strong>Auditoria Interna:</strong> Esta justificativa é registrada para controle administrativo interno. Não há opção de impressão da justificativa em recibos ou relatórios oficiais.
                </p>
              </div>
            </div>

            {/* Rodapé da Janela - Sem opção de impressão da justificativa */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbonoModal(null)}
                disabled={abonoModal.isSubmitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAbono}
                disabled={abonoModal.isSubmitting || !abonoModal.reason.trim()}
                className="px-5 py-2 bg-[#00174b] hover:bg-blue-900 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-blue-950/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {abonoModal.isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Gravando Abono...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    Confirmar Abono
                  </>
                )}
              </button>
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
                            {resolveStudentClass((receiptPreviewData?.[0] as any)?.student || selectedStudent)?.name || '---'}
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
                                      <td className="py-1.5 px-2">{formatContributionMonth(reg.reference_month, true)} / {reg.reference_year}</td>
                                      <td className="py-1.5 px-2 border-l border-slate-100">{isContributionWaived(reg) ? 'R$ 0,00' : formatCurrency(reg.amount)}</td>
                                      <td className="py-1.5 px-2 border-l border-slate-100 text-[9px] font-semibold text-slate-600">
                                        {isContributionWaived(reg) ? 'Abono (Isenção)' : (reg.pix_id ? 'Importado' : (reg.payment_method || 'Dinheiro'))}
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
                <p className="text-[10px] text-slate-400 font-bold uppercase">Visualize o recibo abaixo e clique em "Abrir Impressora" para imprimir com segurança.</p>
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
                        {resolveStudentClass((receiptPreviewData?.[0] as any)?.student || selectedStudent)?.name || '---'}
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
                                  <td className="py-2 px-2 text-[10px]">{formatContributionMonth(reg.reference_month, true)} / {reg.reference_year}</td>
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
        <>
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 10mm 15mm 10mm 15mm !important;
              }
              #printable-statement {
                display: block !important;
                visibility: visible !important;
                background: white !important;
                position: relative !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              #statement-print-container {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                box-sizing: border-box !important;
                margin: 0 auto !important;
                padding: 0 !important;
                background: white !important;
                overflow: visible !important;
              }
              #statement-print-footer {
                margin-top: 15mm !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
            }
          `}} />
          <div 
            id="printable-statement"
            className={cn(
              "bg-white text-black p-0 m-0 w-full min-h-screen z-[9999]",
              "fixed inset-0 overflow-y-auto bg-white",
              "print:static print:block print:overflow-visible print:h-auto print:max-h-[290mm] print:overflow-hidden"
            )}
          >
          {/* Control Bar */}
          <div className="print:hidden sticky top-0 left-0 w-full bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-center justify-between z-[200] gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <FileText className="text-slate-300" size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider leading-none mb-1">Painel de Impressão do Extrato</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">{selectedStudent.name} • Clique em "Imprimir" para iniciar</p>
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
 
          <div id="statement-print-container" className="max-w-[800px] mx-auto p-12 print:p-0 bg-white flex flex-col min-h-screen font-sans">
            {/* Institutional Header */}
            <div className="flex items-center gap-6 mb-6 print:mb-3 pb-2 border-b-2 border-black">
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

            <div className="mb-6 print:mb-3">
               <h2 className="text-base font-bold text-center uppercase tracking-[0.1em] border-b border-black/10 pb-3 mb-4 print:pb-1.5 print:mb-2">Extrato Anual de Contribuições - {selectedYear}</h2>
               
               <div className="grid grid-cols-2 gap-8 bg-slate-50 p-4 rounded border border-slate-200 print:p-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Dados do Aluno</span>
                    <p className="text-sm font-bold text-black uppercase">{selectedStudent.name}</p>
                    <p className="text-[11px] text-slate-600 font-medium">Matrícula: {selectedStudent.registration_number || 'Não Informada'}</p>
                    <p className="text-[11px] text-slate-600 font-medium">Turma: {classes.find(cl => cl.id === selectedStudent?.class_id)?.name || 'Não informada'}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Período de Referência</span>
                    <p className="text-sm font-bold text-black">Janeiro a Dezembro de {selectedYear}</p>
                    {(() => {
                      const unpaidExpected = currentExpectedMonths.filter(m => !contributions.some(c => c.reference_month === m));
                      const isRegularized = unpaidExpected.length === 0;
                      return (
                        <p className="text-[11px] text-slate-600 font-medium">Situação: {isRegularized ? 'Regularizado' : 'Em Aberto'}</p>
                      );
                    })()}
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
                  {/* Linha de Matrícula (se devida no plano ou se paga) */}
                  {(currentExpectedMonths.includes(0) || contributions.some(c => c.reference_month === 0)) && (() => {
                    const contrib = contributions.find(c => c.reference_month === 0);
                    const isExpected = currentExpectedMonths.includes(0);
                    return (
                      <tr key="matricula-statement-row" className="bg-blue-50/20 font-medium">
                        <td className="py-2 print:py-1 px-4 text-[11px] font-black text-blue-900 uppercase">
                          Taxa de Matrícula (Início de Curso)
                        </td>
                        <td className="py-2 print:py-1 px-4 text-[11px] font-bold text-black text-right">
                          {contrib ? formatCurrency(contrib.amount) : '---'}
                        </td>
                        <td className="py-2 print:py-1 px-4 text-[11px] font-medium text-slate-600 text-center">
                          {contrib ? safeFormat(contrib.payment_date, 'dd/MM/yyyy') : '---'}
                        </td>
                        <td className="py-2 print:py-1 px-4 text-[9.5px] font-black uppercase text-center">
                          {contrib ? (
                            <span className="text-emerald-700">PAGO / LIQUIDADO</span>
                          ) : isExpected ? (
                            <span className="text-rose-600">PENDENTE</span>
                          ) : (
                            <span className="text-slate-400 italic font-medium">DISPENSADO</span>
                          )}
                        </td>
                      </tr>
                    );
                  })()}

                  {MONTHS.map((month, idx) => {
                    const monthNum = idx + 1;
                    const contrib = contributions.find(c => c.reference_month === monthNum);
                    const isExpected = currentExpectedMonths.includes(monthNum);
                    const isFacultative = Boolean(studentPlan?.isFirstYear && studentPlan.facultativeMonths.includes(monthNum));
                    return (
                      <tr key={month} className="even:bg-slate-50/50">
                        <td className="py-2 print:py-1 px-4 text-[11px] font-bold text-slate-700 uppercase">
                          {month} {isFacultative && !contrib ? '(Facultativo)' : ''}
                        </td>
                        <td className="py-2 print:py-1 px-4 text-[11px] font-bold text-black text-right">{contrib ? formatCurrency(contrib.amount) : '---'}</td>
                        <td className="py-2 print:py-1 px-4 text-[11px] font-medium text-slate-600 text-center">{contrib ? safeFormat(contrib.payment_date, 'dd/MM/yyyy') : '---'}</td>
                        <td className="py-2 print:py-1 px-4 text-[9.5px] font-black uppercase text-center">
                          {contrib ? (
                            <span className="text-emerald-700">PAGO / LIQUIDADO</span>
                          ) : isExpected ? (
                            <span className="text-rose-600">PENDENTE</span>
                          ) : isFacultative ? (
                            <span className="text-amber-700 font-bold">FACULTATIVO</span>
                          ) : (
                            <span className="text-slate-400 italic font-medium">DISPENSADO</span>
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
            <div id="statement-print-footer" className="mt-8 border-t-2 border-black pt-3 flex justify-between items-start text-[6.5pt] font-black text-black uppercase tracking-tight mb-2 print:mt-12">
              <div className="flex-1 space-y-1">
                <p className="leading-none text-[6.5pt]">
                  {institution?.address}
                </p>
                {(institution?.cep || institution?.city_uf) && (
                  <p className="leading-none text-[6.5pt]">
                    {institution?.cep ? `CEP: ${institution.cep}` : ''} {institution?.city_uf ? ` - ${institution.city_uf}` : ''}
                  </p>
                )}
                {institution?.phone && (
                  <p className="leading-none font-bold text-[6.5pt] pt-0.5">
                    <span className="normal-case">Telefone: {institution.phone}</span>
                  </p>
                )}
              </div>
              <div className="text-right max-w-[450px] leading-tight text-black font-black text-[6.5pt] space-y-1">
                {institution?.secretary && (
                  <>
                    <p className="whitespace-pre-line uppercase underline underline-offset-2 mb-1">Atendimento Secretaria:</p>
                    <p className="whitespace-pre-line lowercase font-bold text-[6pt]">{institution.secretary}</p>
                  </>
                )}
                {institution?.email && (
                  <p className="lowercase font-bold text-[6.5pt] pt-0.5">
                    email: {institution.email.toLowerCase()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </>
  );
}
