import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DollarSign, 
  Printer, 
  Download, 
  Filter, 
  Calendar, 
  GraduationCap, 
  Users, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft,
  Zap,
  FileSpreadsheet, 
  FileText,
  Building2,
  TrendingUp,
  TrendingDown,
  Percent,
  Check,
  X,
  CreditCard,
  Layers,
  ArrowUpDown,
  ChevronDown,
  SlidersHorizontal,
  BarChart3,
  PieChart,
  ShieldCheck,
  Eye,
  Sparkles
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll, getInstitutionSettings } from '../lib/database';
import { financialService } from '../services/financialService';
import { financialConfigService } from '../services/financialConfigService';
import { Student, Class, Contribution, FinancialSettings } from '../types';
import { useUnits } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { isItemInUnit, getItemUnitId } from '../lib/unitService';
import { formatCurrency, cn, parseSafeDate, matchesStudentSearch, formatDateForDisplay, normalizeClass, detectCourseFromClass, isStudentActive, isStudentInClass, filterStudentsForClass } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getStudentContributionPlan, formatContributionMonth, isFirstYearOrStarting } from '../lib/contributionRules';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

type PeriodType = 'mensal' | 'trimestral' | 'semestral' | 'anual';
type FinancialStatusFilter = 'all' | 'paid' | 'partial' | 'pending';

export function FinancialReport() {
  const { selectedUnitId, selectedUnit, activeUnits, getUnitName } = useUnits();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [academicSettingsList, setAcademicSettingsList] = useState<any[]>([]);
  const [financialSettings, setFinancialSettings] = useState<FinancialSettings | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);

// Filtros - Inicialmente limpos, sem dados pré-selecionados
  // 1º Filtro: Aluno ou Turma
  const [filterTarget, setFilterTarget] = useState<'class' | 'student'>('class');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);

  const [selectedYear, setSelectedYear] = useState<string>('');
  const [periodType, setPeriodType] = useState<PeriodType | ''>('');
  
  // Sub-períodos - Inicialmente limpos
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // '1' a '12'
  const [selectedQuarter, setSelectedQuarter] = useState<string>(''); // '1' a '4'
  const [selectedSemester, setSelectedSemester] = useState<string>(''); // '1' ou '2'

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'matricula' | 'previsto' | 'efetuado' | 'pendente' | 'status'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');

  const handleToggleSort = (field: 'name' | 'matricula' | 'previsto' | 'efetuado' | 'pendente' | 'status') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'name' || field === 'matricula' ? 'asc' : 'desc');
    }
  };

  // Anos de referência disponíveis baseados em turmas ou cadastros ativos
  const availableYears = useMemo(() => {
    const yrSet = new Set<number>();
    const currentYr = new Date().getFullYear();
    classes.forEach(c => {
      if (c.status === 'Inativo') return;
      const yrMatch = String(c.start_year || c.academic_year || c.year || '').match(/\b(20\d{2})\b/);
      if (yrMatch) yrSet.add(parseInt(yrMatch[1], 10));
      if (c.code) {
        const cm = String(c.code).match(/-(\d{2})\b/);
        if (cm && cm[1]) yrSet.add(2000 + parseInt(cm[1], 10));
      }
    });
    contributions.forEach(cb => {
      const y = Number(cb.reference_year || (cb as any).year);
      if (y && y >= 2000 && y <= 2100) yrSet.add(y);
    });
    if (yrSet.size === 0) yrSet.add(currentYr);
    return Array.from(yrSet).sort((a, b) => b - a);
  }, [classes, contributions]);

  // Limpa todos os campos para estado inicial
  const handleClearFilters = useCallback(() => {
    setSelectedClassId('');
    setSelectedStudentId('');
    setStudentSearchQuery('');
    setIsStudentDropdownOpen(false);
    setSelectedYear('');
    setPeriodType('');
    setSelectedMonth('');
    setSelectedQuarter('');
    setSelectedSemester('');
    setStatusFilter('');
    setSearchTerm('');
  }, []);

  const handlePeriodTypeChange = useCallback((type: PeriodType) => {
    setPeriodType(type);
    if (type === 'mensal') {
      const now = new Date();
      setSelectedMonth(String(now.getMonth() + 1));
      setSelectedQuarter('');
      setSelectedSemester('');
    } else if (type === 'trimestral') {
      const now = new Date();
      const currentQ = Math.floor(now.getMonth() / 3) + 1;
      setSelectedQuarter(String(currentQ));
      setSelectedMonth('');
      setSelectedSemester('');
    } else if (type === 'semestral') {
      const now = new Date();
      const currentS = now.getMonth() < 6 ? '1' : '2';
      setSelectedSemester(currentS);
      setSelectedMonth('');
      setSelectedQuarter('');
    } else if (type === 'anual') {
      setSelectedMonth('');
      setSelectedQuarter('');
      setSelectedSemester('');
    }
  }, []);

  // Navegação rápida de meses (Mês Anterior / Próximo Mês)
  const handlePrevMonth = useCallback(() => {
    const currentM = selectedMonth ? Number(selectedMonth) : new Date().getMonth() + 1;
    if (currentM > 1) {
      setSelectedMonth(String(currentM - 1));
    } else {
      const currentY = Number(selectedYear) || new Date().getFullYear();
      setSelectedYear(String(currentY - 1));
      setSelectedMonth('12');
    }
    if (periodType !== 'mensal') setPeriodType('mensal');
  }, [selectedMonth, selectedYear, periodType]);

  const handleNextMonth = useCallback(() => {
    const currentM = selectedMonth ? Number(selectedMonth) : new Date().getMonth() + 1;
    if (currentM < 12) {
      setSelectedMonth(String(currentM + 1));
    } else {
      const currentY = Number(selectedYear) || new Date().getFullYear();
      setSelectedYear(String(currentY + 1));
      setSelectedMonth('1');
    }
    if (periodType !== 'mensal') setPeriodType('mensal');
  }, [selectedMonth, selectedYear, periodType]);

  // Atalhos rápidos
  const handleSetCurrentMonth = useCallback(() => {
    const now = new Date();
    setSelectedYear(String(now.getFullYear()));
    setPeriodType('mensal');
    setSelectedMonth(String(now.getMonth() + 1));
    setSelectedQuarter('');
    setSelectedSemester('');
  }, []);

  const handleSetFullYear = useCallback(() => {
    const now = new Date();
    const yr = selectedYear || String(now.getFullYear());
    setSelectedYear(yr);
    setPeriodType('anual');
    setSelectedMonth('');
    setSelectedQuarter('');
    setSelectedSemester('');
  }, [selectedYear]);

  // Carregamento de dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [studentsData, classesData, contribsData, instData, acadData, finSettingsData, enrollmentsData] = await Promise.all([
        fetchAll('students'),
        fetchAll('classes'),
        financialService.getContributions(),
        getInstitutionSettings(),
        fetchAll('academic_settings'),
        financialConfigService.getSettings(),
        fetchAll('enrollments')
      ]);

      let loadedAcadSettings = acadData || [];
      if (!loadedAcadSettings || loadedAcadSettings.length === 0) {
        try {
          const currentStored = localStorage.getItem('academic_settings_current');
          if (currentStored) {
            loadedAcadSettings = [{ id: 'current', ...JSON.parse(currentStored) }];
          }
        } catch (e) {
          console.warn('Aviso ao carregar academic_settings do localStorage:', e);
        }
      }

      const normalizedClasses = (classesData || []).map((c: any) => normalizeClass(c));
      setStudents(studentsData || []);
      setClasses(normalizedClasses);
      setContributions(contribsData || []);
      setInstitution(instData || null);
      setAcademicSettingsList(loadedAcadSettings);
      setFinancialSettings(finSettingsData || null);
      setEnrollments(enrollmentsData || []);
    } catch (err) {
      console.error('Erro ao carregar dados do relatório financeiro:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const handleSettingsUpdated = (e: any) => {
      if (e.detail) {
        setFinancialSettings(e.detail);
      } else {
        financialConfigService.getSettings().then(setFinancialSettings);
      }
    };
    window.addEventListener('financial_settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('financial_settings_updated', handleSettingsUpdated);
  }, [loadData]);

  // Turmas filtradas pelo polo ativo
  const scopedClasses = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return classes;
    return classes.filter(c => isItemInUnit(getItemUnitId(c), selectedUnitId, activeUnits));
  }, [classes, selectedUnitId, activeUnits]);

  // Alunos filtrados pelo polo ativo
  const scopedStudents = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return students;
    return students.filter(s => {
      const studentClass = classes.find(c => c.id === s.class_id);
      const unit = getItemUnitId(s) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
      return isItemInUnit(unit, selectedUnitId, activeUnits);
    });
  }, [students, classes, selectedUnitId, activeUnits]);

  // Aluno atualmente selecionado no filtro individual
  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return students.find(s => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Lista de alunos correspondentes à busca de aluno no 1º filtro (apenas quando houver termo digitado)
  const searchedStudents = useMemo(() => {
    const query = studentSearchQuery.trim();
    if (!query) {
      return [];
    }
    const q = query.toLowerCase();
    const cleanDigits = q.replace(/\D/g, '');
    return scopedStudents.filter(s => {
      const name = (s.name || '').toLowerCase();
      const reg = (s.registration_number || '').toLowerCase();
      const cpf = (s.cpf || '').replace(/\D/g, '');
      return name.includes(q) || reg.includes(q) || (cleanDigits.length > 0 && cpf.includes(cleanDigits));
    }).slice(0, 15);
  }, [scopedStudents, studentSearchQuery]);

  const handleSelectStudent = useCallback((s: Student) => {
    setSelectedStudentId(s.id);
    setStudentSearchQuery(s.name || '');
    setIsStudentDropdownOpen(false);

    // Se o ano ainda não estiver definido, infere pela turma do aluno ou usa o ano atual
    if (!selectedYear) {
      const stClass = classes.find(c => c.id === s.class_id);
      const inferredYear = stClass?.start_year || stClass?.academic_year || new Date().getFullYear();
      setSelectedYear(String(inferredYear));
    }
    // Se o tipo de período ainda não estiver definido, define como 'anual' para visualização completa
    if (!periodType) {
      setPeriodType('anual');
    }
  }, [selectedYear, periodType, classes]);

  // Valida se os parâmetros obrigatórios foram definidos pelo usuário
  const isFilterReady = useMemo(() => {
    if (filterTarget === 'class' && !selectedClassId) return false;
    if (filterTarget === 'student' && !selectedStudentId) return false;
    if (!selectedYear) return false;
    if (!periodType) return false;
    if (periodType === 'mensal' && !selectedMonth) return false;
    if (periodType === 'trimestral' && !selectedQuarter) return false;
    if (periodType === 'semestral' && !selectedSemester) return false;
    return true;
  }, [filterTarget, selectedClassId, selectedStudentId, selectedYear, periodType, selectedMonth, selectedQuarter, selectedSemester]);

  // Determina os meses que compõem o período selecionado
  const periodMonths = useMemo((): number[] => {
    if (!periodType) return [];
    switch (periodType) {
      case 'mensal':
        return selectedMonth ? [Number(selectedMonth)] : [];
      case 'trimestral':
        if (!selectedQuarter) return [];
        const q = Number(selectedQuarter);
        if (q === 1) return [1, 2, 3];
        if (q === 2) return [4, 5, 6];
        if (q === 3) return [7, 8, 9];
        return [10, 11, 12];
      case 'semestral':
        if (!selectedSemester) return [];
        return Number(selectedSemester) === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
      case 'anual':
        return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      default:
        return [];
    }
  }, [periodType, selectedMonth, selectedQuarter, selectedSemester]);

  // Nome amigável do período
  const periodLabel = useMemo(() => {
    if (!periodType && !selectedYear) return 'Nenhum período selecionado';
    const yearStr = selectedYear ? String(selectedYear) : 'Ano pendente';
    switch (periodType) {
      case 'mensal':
        return selectedMonth ? `${MONTH_NAMES[Number(selectedMonth) - 1]} de ${yearStr}` : `Mês pendente (${yearStr})`;
      case 'trimestral':
        return selectedQuarter 
          ? `${selectedQuarter}º Trimestre de ${yearStr} (${MONTH_SHORT[(Number(selectedQuarter) - 1) * 3]} a ${MONTH_SHORT[Number(selectedQuarter) * 3 - 1]})`
          : `Trimestre pendente (${yearStr})`;
      case 'semestral':
        return selectedSemester 
          ? `${selectedSemester}º Semestre de ${yearStr} (${Number(selectedSemester) === 1 ? 'Jan a Jun' : 'Jul a Dez'})`
          : `Semestre pendente (${yearStr})`;
      case 'anual':
        return `Ano Letivo Completo de ${yearStr}`;
      default:
        return yearStr;
    }
  }, [periodType, selectedMonth, selectedQuarter, selectedSemester, selectedYear]);

  // Identifica se o período selecionado é o mês atual ou o ano completo para exibição do card 'A Vencer'
  const isCurrentMonthPeriod = useMemo(() => {
    const now = new Date();
    return (
      periodType === 'mensal' &&
      Number(selectedMonth) === (now.getMonth() + 1) &&
      Number(selectedYear) === now.getFullYear()
    );
  }, [periodType, selectedMonth, selectedYear]);

  const isAnnualPeriod = periodType === 'anual';
  const showAVencerCard = isCurrentMonthPeriod || isAnnualPeriod;

// Helper para verificar se um mês de um determinado ano já está vencido
// Regra de negócio do usuário:
// - Meses anteriores ao mês corrente do ano selecionado: VENCIDOS (compõem o saldo pendente se não pagos)
// - Mês atual: ainda PREVISTO (não conta como vencido/pendente)
// - Meses futuros: ainda PREVISTO (não contam como vencidos/pendente)
const isMonthOverdue = (month: number, year: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1 a 12

  if (year < currentYear) return true;
  if (year > currentYear) return false;
  if (month === 0) return currentMonth >= 2;
  return month < currentMonth;
};

const isMonthCurrent = (month: number, year: number) => {
  const now = new Date();
  if (year !== now.getFullYear()) return false;
  if (month === 0) return now.getMonth() + 1 <= 2;
  return month === (now.getMonth() + 1);
};

const isMonthFuture = (month: number, year: number) => {
  const now = new Date();
  if (year > now.getFullYear()) return true;
  if (year < now.getFullYear()) return false;
  if (month === 0) return false;
  return month > (now.getMonth() + 1);
};

// Helper para descobrir os meses esperados academicamente para o aluno no ano com base no plano de contribuições
const getExpectedMonthsForStudent = useCallback((student: Student, year: number, paidMonths: number[] = []) => {
  if (student.start_date) {
    const startDate = parseSafeDate(student.start_date);
    if (!isNaN(startDate.getTime()) && startDate.getFullYear() > year) {
      return [];
    }
  }

  const studentClass = classes.find(c => c.id === student.class_id);
  const classSettings = academicSettingsList.find(s => s && (s.id === student.class_id || s.id === `academic_settings_${student.class_id}`));
  const unitSettings = academicSettingsList.find(s => s && s.id === `academic_settings_${student.unit_id}`);
  const generalSettings = academicSettingsList.find(s => s && s.id === 'current');
  const activeSettings = classSettings || unitSettings || generalSettings;

  const plan = getStudentContributionPlan(student, studentClass, year, paidMonths, activeSettings);
  return plan.expectedPeriods;
}, [academicSettingsList, classes]);

// Helper para descobrir o valor da contribuição mensal do aluno:
// 1. Resolve pelas configurações do sistema por ano letivo e curso/turma (Regra Customizada -> Curso -> Turno/Período -> Ano -> Padrão Geral)
// 2. Procura histórico recente de contribuições do próprio aluno ou turma
// 3. Fallback padrão configurado no sistema ou R$ 100,00
const getStudentFee = useCallback((student: Student) => {
  const studentClass = classes.find(c => 
    c.id === student.class_id ||
    ((student as any).enrollments && (student as any).enrollments.some((e: any) => e.class_id === c.id)) ||
    ((student as any).course && c.course && c.course.trim().toLowerCase() === (student as any).course.trim().toLowerCase()) ||
    ((student as any).course && c.name && c.name.toLowerCase().includes((student as any).course.toLowerCase()))
  );
  const resolved = financialConfigService.resolveFee({
    year: Number(selectedYear) || new Date().getFullYear(),
    classId: student.class_id || studentClass?.id,
    className: studentClass?.name,
    studentClass,
    student,
    subjectId: (student as any).subject_id || (student as any).enrollments?.[0]?.subject_id || studentClass?.subject_id,
    courseName: studentClass?.course || (student as any).course || (studentClass ? detectCourseFromClass(studentClass) : ''),
    period: (student as any).period || studentClass?.period
  }, financialSettings);

  if (resolved && resolved > 0) {
    return resolved;
  }

  // Procura contribuição recente do aluno
  const studentContrib = contributions.find(c => c.student_id === student.id && Number(c.amount) > 0);
  if (studentContrib && Number(studentContrib.amount) > 0) {
    return Number(studentContrib.amount);
  }
  // Procura histórico na turma
  const classContrib = contributions.find(c => {
    const s = students.find(st => st.id === c.student_id);
    return s?.class_id === student.class_id && Number(c.amount) > 0;
  });
  if (classContrib && Number(classContrib.amount) > 0) {
    return Number(classContrib.amount);
  }
  // Procura no geral
  const anyContrib = contributions.find(c => Number(c.amount) > 0);
  if (anyContrib && Number(anyContrib.amount) > 0) {
    return Number(anyContrib.amount);
  }
  return Number(financialSettings?.default_monthly_fee) || 100;
}, [selectedYear, classes, financialSettings, contributions, students]);

// Processamento analítico por aluno
const reportData = useMemo(() => {
  if (!isFilterReady) {
    return [];
  }

  const yearNum = Number(selectedYear);

  // Filtragem de alunos por alvo (turma ou aluno individual correspondente)
  const filteredStudents = filterTarget === 'student'
    ? (() => {
        if (!selectedStudentId) return [];
        const found = scopedStudents.find(s => s.id === selectedStudentId) || students.find(s => s.id === selectedStudentId);
        return found ? [found] : [];
      })()
    : scopedStudents.filter(student => {
        if (!isStudentActive(student)) {
          return false;
        }
        if (selectedClassId !== 'all' && !isStudentInClass(student, selectedClassId, enrollments)) {
          return false;
        }
        if (searchTerm.trim() && !matchesStudentSearch(student, searchTerm.trim())) {
          return false;
        }
        return true;
      });

  return filteredStudents.map(student => {
    const studentClass = classes.find(c => c.id === student.class_id);
    const fee = getStudentFee(student);
    
    // Contribuições deste aluno no ano selecionado
    const studentContribs = contributions.filter(
      c => c.student_id === student.id && Number(c.reference_year) === yearNum
    );

    const paidMonthsInYear = studentContribs.map(c => Number(c.reference_month));
    const allExpectedInYear = getExpectedMonthsForStudent(student, yearNum, paidMonthsInYear);

    // Meses esperados que caem no período selecionado (se anual ou 1º sem, inclui taxa de matrícula se esperada/paga)
    const shouldIncludeMatricula = (periodType === 'anual' || (periodType === 'semestral' && selectedSemester === '1')) && (allExpectedInYear.includes(0) || paidMonthsInYear.includes(0));
    const relevantPeriods = shouldIncludeMatricula ? [0, ...periodMonths] : periodMonths;

    const expectedInPeriod = relevantPeriods.filter(m => allExpectedInYear.includes(m));

    // Contribuições correspondentes aos meses do período
    const contribsInPeriod = studentContribs.filter(c => relevantPeriods.includes(Number(c.reference_month)));

    // 1. Valor Previsto: Total da arrecadação com base no calendário e na matrícula
    const valorPrevisto = expectedInPeriod.length * fee;

    // 2. Valor Efetuado: Total arrecadado no período
    const valorEfetuado = contribsInPeriod.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // Mapeamento mês a mês dos pagamentos
    const paidByMonth = new Map<number, number>();
    contribsInPeriod.forEach(c => {
      const m = Number(c.reference_month);
      paidByMonth.set(m, (paidByMonth.get(m) || 0) + (Number(c.amount) || 0));
    });

    let overdueDebtTotal = 0;
    let overdueMonthsCount = 0;
    let futurePendingTotal = 0;

    const monthsStatus = relevantPeriods.map(m => {
      const isExpected = allExpectedInYear.includes(m);
      const amountPaid = paidByMonth.get(m) || 0;
      const isPaid = amountPaid >= fee || (amountPaid > 0 && isExpected && amountPaid >= fee * 0.9);
      const isOverdue = isExpected && !isPaid && isMonthOverdue(m, yearNum);
      const isCurrent = isMonthCurrent(m, yearNum);
      const isFuture = isMonthFuture(m, yearNum);
      const contrib = contribsInPeriod.find(c => Number(c.reference_month) === m);

      if (isOverdue) {
        overdueDebtTotal += Math.max(0, fee - amountPaid);
        overdueMonthsCount++;
      } else if (isExpected && !isPaid) {
        futurePendingTotal += Math.max(0, fee - amountPaid);
      }

      return {
        month: m,
        monthName: m === 0 ? 'Matrícula' : (MONTH_NAMES[m - 1] || `Mês ${m}`),
        monthShort: m === 0 ? 'Matr.' : (MONTH_SHORT[m - 1] || `M${m}`),
        isExpected,
        isPaid,
        isOverdue,
        isCurrent,
        isFuture,
        amountPaid,
        fee,
        paymentDate: contrib?.payment_date,
        paymentMethod: contrib?.payment_method
      };
    });

    // 3. Saldo Pendente: Soma de tudo que JÁ ESTÁ VENCIDO
    // (O mês atual e meses futuros continuam como previsto, sem entrar no saldo vencido)
    const saldoPendente = overdueDebtTotal;

    // Situação do Aluno
    let status: 'paid' | 'regular' | 'pending' | 'exempt' = 'regular';
    if (valorPrevisto === 0 && valorEfetuado === 0) {
      status = 'exempt';
    } else if (overdueMonthsCount > 0) {
      status = 'pending'; // Inadimplente: possui parcelas vencidas
    } else if (valorEfetuado >= valorPrevisto && valorPrevisto > 0) {
      status = 'paid'; // 100% quitado
    } else {
      status = 'regular'; // Em dia (mês atual/futuro previsto a vencer)
    }

    return {
      student,
      studentClass,
      expectedMonthsCount: expectedInPeriod.length,
      paidMonthsCount: contribsInPeriod.length,
      overdueMonthsCount,
      fee,
      valorPrevisto,
      valorEfetuado,
      saldoPendente,
      futurePendingTotal,
      monthsStatus,
      status,
      contribsInPeriod
    };
  })
  .filter(item => {
    if (!statusFilter || statusFilter === 'all') return true;
    if (statusFilter === 'pending') return item.saldoPendente > 0;
    if (statusFilter === 'paid') return item.status === 'paid';
    if (statusFilter === 'regular') return item.status === 'regular' || item.status === 'paid';
    return item.status === statusFilter;
  })
  .sort((a, b) => {
    let diff = 0;
    if (sortField === 'name') {
      diff = (a.student.name || '').localeCompare(b.student.name || '');
    } else if (sortField === 'matricula') {
      diff = (a.student.registration_number || '').localeCompare(b.student.registration_number || '');
    } else if (sortField === 'previsto') {
      diff = a.valorPrevisto - b.valorPrevisto;
    } else if (sortField === 'efetuado') {
      diff = a.valorEfetuado - b.valorEfetuado;
    } else if (sortField === 'pendente') {
      diff = a.saldoPendente - b.saldoPendente;
    } else if (sortField === 'status') {
      diff = a.status.localeCompare(b.status);
    }
    return sortOrder === 'asc' ? diff : -diff;
  });
}, [
  isFilterReady,
  filterTarget,
  selectedStudentId,
  scopedStudents, 
  classes, 
  contributions, 
  selectedYear, 
  selectedClassId, 
  periodMonths, 
  searchTerm, 
  statusFilter, 
  sortField,
  sortOrder,
  getExpectedMonthsForStudent,
  getStudentFee
]);

// Totais e Indicadores Consolidados
const totals = useMemo(() => {
  const totalAlunos = reportData.length;
  const totalPrevisto = reportData.reduce((acc, curr) => acc + curr.valorPrevisto, 0);
  const totalEfetuado = reportData.reduce((acc, curr) => acc + curr.valorEfetuado, 0);
  const totalPendente = reportData.reduce((acc, curr) => acc + curr.saldoPendente, 0);
  const totalAVencer = Math.max(0, totalPrevisto - totalEfetuado - totalPendente);

  const adimplentesCount = reportData.filter(r => r.status === 'paid').length;
  const emDiaCount = reportData.filter(r => r.status === 'regular').length;
  const pendentesCount = reportData.filter(r => r.saldoPendente > 0).length;

  const taxaArrecadacao = totalPrevisto > 0 
    ? Math.min(100, Math.round((totalEfetuado / totalPrevisto) * 100)) 
    : 100;

  return {
    totalAlunos,
    totalPrevisto,
    totalEfetuado,
    totalPendente,
    totalAVencer,
    adimplentesCount,
    emDiaCount,
    pendentesCount,
    taxaArrecadacao
  };
}, [reportData]);

// Disparo da impressão padrão do navegador (Ctrl+P / Botão)
const handlePrint = () => {
  if (!isFilterReady) return;
  window.print();
};

// Geração de PDF Oficial para Download
const handleExportPDF = () => {
  if (!isFilterReady) return;
  try {
    setIsExportingPDF(true);
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.width;

    // Cabeçalho da Instituição
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(institution?.name || 'Escola Diocesana de Ministério', 14, 15);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const subheader = [
      institution?.address || 'Diocese de Guarulhos',
      institution?.city ? `${institution.city} - SP` : '',
      institution?.cnpj ? `CNPJ: ${institution.cnpj}` : ''
    ].filter(Boolean).join(' | ');
    doc.text(subheader, 14, 21);

    // Título do Relatório
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO FINANCEIRO: DEMONSTRATIVO PREVISTO vs. EFETUADO`, 14, 29);

    // Parâmetros do Relatório
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const targetDesc = filterTarget === 'student'
      ? `Aluno: ${selectedStudent?.name || 'Aluno'} (Matrícula: ${selectedStudent?.registration_number || '---'})`
      : `Turma: ${selectedClassId === 'all' ? 'Todas as Turmas' : classes.find(c => c.id === selectedClassId)?.name || 'Turma Selecionada'}`;
    
    const paramsText = `${targetDesc}  |  Período: ${periodLabel}  |  Unidade: ${getUnitName(selectedUnitId) || 'Todas'}  |  Obs: Mês atual classificado como previsto`;
    doc.text(paramsText, 14, 35);

    // Linha divisória
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 38, pageWidth - 14, 38);

    // Quadro de Totais Sintéticos
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Alunos: ${totals.totalAlunos}  |  Previsto (Amarelo): ${formatCurrency(totals.totalPrevisto)}  |  Efetuado (Verde): ${formatCurrency(totals.totalEfetuado)}  |  Pendente Vencido (Vermelho): ${formatCurrency(totals.totalPendente)}  |  Arrecadação: ${totals.taxaArrecadacao}%`, 14, 44);

    // Tabela detalhada de alunos
    const tableBody = reportData.map((item, index) => {
      const statusLabel = item.status === 'paid' 
        ? 'Quitado' 
        : item.status === 'regular' 
        ? 'Em Dia (Previsto)' 
        : item.status === 'exempt'
        ? 'Isento'
        : `Pendente (${item.overdueMonthsCount} venc.)`;

      // Resumo dos meses
      const mesesResumo = item.monthsStatus
        .map(m => `${m.monthShort}: ${m.isPaid ? 'OK' : m.isOverdue ? 'VENC' : m.isExpected ? 'PREV' : '-'}`)
        .join(' ');

      return [
        (index + 1).toString(),
        item.student.registration_number || '---',
        item.student.name || '---',
        item.studentClass?.code || item.studentClass?.name || '---',
        mesesResumo,
        formatCurrency(item.valorPrevisto),
        formatCurrency(item.valorEfetuado),
        formatCurrency(item.saldoPendente),
        statusLabel
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [['#', 'Matrícula', 'Nome do Aluno', 'Turma', 'Meses do Período', 'Previsto', 'Efetuado', 'Pendente (Vencido)', 'Situação']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 60, halign: 'left' },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 55, halign: 'left', fontSize: 7 },
        5: { cellWidth: 26, halign: 'right', textColor: [180, 100, 0] },
        6: { cellWidth: 26, halign: 'right', textColor: [16, 120, 60] },
        7: { cellWidth: 26, halign: 'right', textColor: [200, 30, 30] },
        8: { cellWidth: 24, halign: 'center' }
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    // Rodapé com data de emissão e assinaturas
    const finalY = (doc as any).lastAutoTable.finalY + 14;
    if (finalY < doc.internal.pageSize.height - 35) {
      doc.setFontSize(8);
      doc.text(`Relatório emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} por ${profile?.name || 'Administração'}.`, 14, finalY);

      const signY = finalY + 16;
      doc.line(30, signY, 110, signY);
      doc.text('Tesouraria / Gestão Financeira', 45, signY + 4);

      doc.line(pageWidth - 110, signY, pageWidth - 30, signY);
      doc.text('Secretaria Acadêmica / Direção', pageWidth - 100, signY + 4);
    }

    const yearFileStr = selectedYear || 'geral';
    const periodFileStr = periodType || 'periodo';
    doc.save(`relatorio-financeiro-${yearFileStr}-${periodFileStr}.pdf`);
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
  } finally {
    setIsExportingPDF(false);
  }
};

// Exportar CSV para planilhas
const handleExportCSV = () => {
  if (!isFilterReady) return;
  const headers = ['Matrícula', 'Aluno', 'CPF', 'Turma', 'Período', 'Previsto', 'Efetuado', 'Pendente (Vencido)', 'Situação'];
  const rows = reportData.map(item => [
    item.student.registration_number || '',
    `"${item.student.name || ''}"`,
    item.student.cpf || '',
    `"${item.studentClass?.name || ''}"`,
    `"${periodLabel}"`,
    item.valorPrevisto.toFixed(2),
    item.valorEfetuado.toFixed(2),
    item.saldoPendente.toFixed(2),
    item.status === 'paid' ? 'Quitado' : item.status === 'regular' ? 'Em Dia' : item.status === 'exempt' ? 'Isento' : 'Pendente (Vencido)'
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  const yearFileStr = selectedYear || 'geral';
  const periodFileStr = periodType || 'periodo';
  link.setAttribute('download', `relatorio-financeiro-${yearFileStr}-${periodFileStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

return (
  <div className="space-y-6">
    {/* PageHeader exclusivo na visualização em tela */}
    <PageHeader
      title="Relatório Financeiro"
      description="Acompanhamento consolidado e individual de contribuições previstas e efetuadas por turma ou aluno."
      icon={DollarSign}
      badge={getUnitName(selectedUnitId) || 'Geral'}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95"
          title="Recarregar Dados Financeiros"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin text-slate-500")} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>

        <button
          onClick={handleExportCSV}
          disabled={!isFilterReady}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95"
          title={isFilterReady ? "Exportar dados para Excel/CSV" : "Selecione os parâmetros para exportar"}
        >
          <FileSpreadsheet size={15} className="text-emerald-600" />
          <span className="hidden sm:inline">Exportar CSV</span>
        </button>

        <button
          onClick={handleExportPDF}
          disabled={!isFilterReady || isExportingPDF}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95"
          title={isFilterReady ? "Baixar em formato PDF Oficial" : "Selecione os parâmetros para baixar PDF"}
        >
          <Download size={15} className="text-blue-700" />
          <span className="hidden sm:inline">{isExportingPDF ? 'Gerando...' : 'Baixar PDF'}</span>
        </button>

        <button
          onClick={handlePrint}
          disabled={!isFilterReady}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#00174b] hover:bg-blue-900 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
          title={isFilterReady ? "Imprimir relatório formatado" : "Selecione os parâmetros para imprimir"}
        >
          <Printer size={15} />
          <span>Imprimir Relatório</span>
        </button>
      </div>
    </PageHeader>

    {/* Cabeçalho Oficial de Impressão (visível apenas na impressão) */}
    <div className="hidden print:block mb-4 border-b-2 border-slate-800 pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {institution?.logo_url && (
            <img 
              src={institution.logo_url} 
              alt="Logo" 
              className="w-14 h-14 object-contain shrink-0"
            />
          )}
          <div>
            <h1 className="text-base font-black text-slate-900 uppercase leading-tight">
              {institution?.name || 'Escola Diocesana de Ministério'}
            </h1>
            <p className="text-[10px] text-slate-600 font-medium leading-tight">
              {institution?.address || 'Diocese de Guarulhos'} {institution?.city && `- ${institution.city}`} {institution?.cnpj && `| CNPJ: ${institution.cnpj}`}
            </p>
            <h2 className="text-xs font-black text-[#00174b] uppercase tracking-wide mt-0.5">
              Relatório Financeiro: Contribuições Previstas vs. Efetuadas
            </h2>
          </div>
        </div>
        <div className="text-right text-[10px] text-slate-600 shrink-0 leading-tight">
          <p className="font-bold text-slate-900">Emissão: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          <p>Unidade: {getUnitName(selectedUnitId) || 'Todas as Unidades'}</p>
          <p>Operador: {profile?.name || 'Administração'}</p>
        </div>
      </div>
      
      {/* Faixa de Parâmetros na Impressão */}
      <div className="mt-2.5 py-1.5 px-3 bg-slate-100 border border-slate-300 rounded-none text-[10.5px] flex items-center justify-between font-medium text-slate-800">
        <div>
          <span className="font-bold">{filterTarget === 'student' ? 'Aluno: ' : 'Turma: '}</span>
          <span className="font-semibold">
            {filterTarget === 'student'
              ? (selectedStudent ? `${selectedStudent.name} (${selectedStudent.registration_number || '---'})` : 'Pendente')
              : (selectedClassId === 'all' ? 'Todas as Turmas' : classes.find(c => c.id === selectedClassId)?.name || 'Pendente')}
          </span>
        </div>
        <div>
          <span className="font-bold">Período: </span>
          <span className="font-semibold">{periodLabel}</span>
        </div>
        <div>
          <span className="font-bold">Filtro de Situação: </span>
          <span className="font-semibold">
            {!statusFilter || statusFilter === 'all' ? 'Todos' : statusFilter === 'paid' ? 'Adimplentes' : statusFilter === 'partial' ? 'Parciais' : 'Inadimplentes'}
          </span>
        </div>
      </div>
    </div>

    {/* Console Executivo de Filtros e Parâmetros (oculto na impressão) */}
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs print:hidden overflow-hidden divide-y divide-slate-100">
      {/* Barra de Modo & Atalhos Rápidos */}
      <div className="px-4 py-3 sm:px-5 sm:py-3 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Seletor de Modo Principal */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">
            Consultar por:
          </span>
          <div className="inline-flex p-0.5 bg-slate-200/70 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setFilterTarget('class');
                setSelectedStudentId('');
                setStudentSearchQuery('');
                setIsStudentDropdownOpen(false);
              }}
              className={cn(
                "px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                filterTarget === 'class'
                  ? "bg-[#00174b] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <Users size={14} />
              <span>Por Turma</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterTarget('student');
                setSelectedClassId('');
                setIsStudentDropdownOpen(false);
              }}
              className={cn(
                "px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                filterTarget === 'student'
                  ? "bg-[#00174b] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <User size={14} />
              <span>Por Aluno</span>
            </button>
          </div>
        </div>

        {/* Lado Direito: Atalhos Rápidos e Limpar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 mr-1">
            <Zap size={13} className="text-amber-500" />
            <span className="text-[11px] font-medium text-slate-400">Atalhos:</span>
            <button
              type="button"
              onClick={handleSetCurrentMonth}
              className="px-2 py-0.5 rounded-md hover:bg-slate-200/70 text-slate-700 font-semibold hover:text-blue-900 transition-colors cursor-pointer text-xs"
            >
              Mês Atual
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={handleSetFullYear}
              className="px-2 py-0.5 rounded-md hover:bg-slate-200/70 text-slate-700 font-semibold hover:text-blue-900 transition-colors cursor-pointer text-xs"
            >
              Ano Completo
            </button>
          </div>

          {isFilterReady && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-900 rounded-lg text-xs font-bold border border-blue-100">
              <Calendar size={12} className="text-blue-600" />
              <span>{periodLabel}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleClearFilters}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-colors cursor-pointer"
            title="Limpar todos os campos e seleções"
          >
            <X size={13} />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Grid de Campos Principais: Distribuição Equilibrada e Proporcional */}
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4 items-end">
          {/* Campo 1: Turma ou Aluno (5 colunas) */}
          <div className="md:col-span-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                {filterTarget === 'class' ? <Users size={13} className="text-blue-700" /> : <User size={13} className="text-blue-700" />}
                <span>{filterTarget === 'class' ? 'Turma Cadastrada' : 'Aluno Cadastrado'}</span>
              </label>
              {filterTarget === 'class' && (
                <span className="text-[10px] text-slate-400 font-medium">
                  {scopedClasses.length} turmas disponíveis
                </span>
              )}
            </div>

            {filterTarget === 'class' ? (
              <div className="relative">
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedClassId(val);
                    if (val && val !== 'all' && !selectedYear) {
                      const targetCls = classes.find(c => c.id === val);
                      if (targetCls?.start_year || targetCls?.academic_year) {
                        setSelectedYear(String(targetCls.start_year || targetCls.academic_year));
                      }
                    }
                  }}
                  className="w-full h-10 px-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs cursor-pointer transition-all"
                >
                  <option value="">Selecione uma turma cadastrada...</option>
                  <option value="all">Todas as Turmas Cadastradas ({scopedClasses.length})</option>
                  {scopedClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code ? `[${c.code}] ` : ''}{c.name} {c.period ? `(${c.period})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="relative">
                {selectedStudent ? (
                  <div className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-[#00174b] text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                        {selectedStudent.name ? selectedStudent.name.charAt(0).toUpperCase() : 'A'}
                      </div>
                      <div className="min-w-0 flex items-center gap-2 truncate">
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {selectedStudent.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                          #{selectedStudent.registration_number || '---'}
                        </span>
                        {(() => {
                          const stClass = classes.find(c => c.id === selectedStudent.class_id);
                          return stClass ? (
                            <span className="text-[10px] font-semibold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 hidden md:inline truncate max-w-[160px]">
                              {stClass.name}
                            </span>
                          ) : null;
                        })()}
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold hidden lg:inline">
                          {selectedStudent.status || 'Ativo'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentId('');
                        setStudentSearchQuery('');
                        setIsStudentDropdownOpen(false);
                      }}
                      className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline shrink-0 cursor-pointer flex items-center gap-1"
                      title="Selecionar outro aluno"
                    >
                      <RefreshCw size={11} />
                      <span>Trocar</span>
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, matrícula ou CPF..."
                      value={studentSearchQuery}
                      onFocus={() => {
                        if (studentSearchQuery.trim().length > 0) {
                          setIsStudentDropdownOpen(true);
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStudentSearchQuery(val);
                        setIsStudentDropdownOpen(val.trim().length > 0);
                      }}
                      className="w-full h-10 pl-9 pr-8 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs transition-all"
                    />
                    {studentSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setStudentSearchQuery('');
                          setIsStudentDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        title="Limpar busca"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}

                {/* Autocomplete Dropdown - Exibido somente quando o usuário digitar uma busca */}
                {!selectedStudent && isStudentDropdownOpen && studentSearchQuery.trim().length > 0 && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setIsStudentDropdownOpen(false)} 
                    />
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto z-30 divide-y divide-slate-100">
                      {searchedStudents.length > 0 ? (
                        searchedStudents.map(st => {
                          const stClass = classes.find(c => c.id === st.class_id);
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => handleSelectStudent(st)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/70 transition-colors flex items-center justify-between cursor-pointer group"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="text-xs font-bold text-slate-900 group-hover:text-blue-900 truncate">
                                  {st.name}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                  Matrícula: <span className="font-mono font-bold text-slate-700">{st.registration_number || '---'}</span>
                                  {stClass ? ` • Turma: ${stClass.name}` : ' • Sem Turma'}
                                  {st.cpf ? ` • CPF: ${st.cpf}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={cn(
                                  "text-[9px] font-bold px-2 py-0.5 rounded-md",
                                  st.status === 'Inativo' ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                )}>
                                  {st.status || 'Ativo'}
                                </span>
                                {stClass?.code && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                    {stClass.code}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-500">
                          Nenhum aluno encontrado correspondente a &quot;<span className="font-bold text-slate-700">{studentSearchQuery}</span>&quot;
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Campo 2: Ano Letivo (2 colunas) */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Calendar size={13} className="text-blue-700" />
              <span>Ano Letivo</span>
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs cursor-pointer transition-all"
            >
              <option value="">Selecione o ano...</option>
              {availableYears.map(yr => (
                <option key={yr} value={String(yr)}>
                  Ano {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Campo 3: Regime de Periodicidade (2 colunas) */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Layers size={13} className="text-blue-700" />
              <span>Periodicidade</span>
            </label>
            <select
              value={periodType}
              onChange={(e) => handlePeriodTypeChange(e.target.value as PeriodType)}
              className="w-full h-10 px-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs cursor-pointer transition-all"
            >
              <option value="">Selecione...</option>
              <option value="mensal">Mensal (1 Mês)</option>
              <option value="trimestral">Trimestral (3 Meses)</option>
              <option value="semestral">Semestral (6 Meses)</option>
              <option value="anual">Anual (12 Meses)</option>
            </select>
          </div>

          {/* Campo 4: Seletor Específico do Período (3 colunas) */}
          <div className="md:col-span-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Clock size={13} className="text-blue-700" />
                <span>Período</span>
              </label>
              {periodType === 'mensal' && selectedMonth && (
                <span className="text-[10px] font-bold text-blue-900">
                  {MONTH_SHORT[Number(selectedMonth) - 1]} {selectedYear && `/${selectedYear}`}
                </span>
              )}
            </div>

            {periodType === '' && (
              <div className="w-full h-10 px-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 flex items-center justify-center italic">
                Defina a periodicidade...
              </div>
            )}

            {periodType === 'mensal' && (
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="h-10 px-2 flex items-center justify-center text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl transition-colors cursor-pointer shrink-0"
                  title="Mês anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full h-10 px-2.5 bg-slate-50/50 hover:bg-white focus:bg-white border-y border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs cursor-pointer transition-all"
                >
                  <option value="">Escolha o mês...</option>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={String(idx + 1)}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="h-10 px-2 flex items-center justify-center text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-l-0 border-slate-200 rounded-r-xl transition-colors cursor-pointer shrink-0"
                  title="Próximo mês"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {periodType === 'trimestral' && (
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs cursor-pointer transition-all"
              >
                <option value="">Selecione o trimestre...</option>
                <option value="1">1º Trimestre (Jan - Mar)</option>
                <option value="2">2º Trimestre (Abr - Jun)</option>
                <option value="3">3º Trimestre (Jul - Set)</option>
                <option value="4">4º Trimestre (Out - Dez)</option>
              </select>
            )}

            {periodType === 'semestral' && (
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs cursor-pointer transition-all"
              >
                <option value="">Selecione o semestre...</option>
                <option value="1">1º Semestre (Janeiro a Junho)</option>
                <option value="2">2º Semestre (Julho a Dezembro)</option>
              </select>
            )}

            {periodType === 'anual' && (
              <div className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center">
                Exercício Integral (Jan a Dez)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Barra Secundária: Filtro de Situação, Busca Rápida na Tabela e Modo de Exibição */}
      <div className="px-4 py-2.5 sm:px-5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Situação */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Situação:
            </span>
            <div className="inline-flex items-center gap-1">
              {[
                { id: '', label: 'Todos' },
                { id: 'paid', label: 'Quitados', dot: 'bg-emerald-500' },
                { id: 'regular', label: 'Em Dia', dot: 'bg-amber-500' },
                { id: 'pending', label: 'Inadimplentes', dot: 'bg-red-500' }
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                    statusFilter === st.id
                      ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  )}
                >
                  {st.dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", st.dot)} />}
                  <span>{st.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Se turma: Busca rápida de aluno dentro da lista */}
          {filterTarget === 'class' && (
            <div className="relative w-56">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar aluno na tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-8 pl-8 pr-7 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Resumo ao vivo & Modo de Visualização */}
        <div className="flex items-center gap-3">
          {isFilterReady && (
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              <span>{reportData.length} aluno(s) listado(s)</span>
              <span className="text-slate-300">·</span>
              <span className="text-emerald-700 font-bold">{totals.taxaArrecadacao}% arrecadado</span>
            </div>
          )}

          {filterTarget === 'class' && isFilterReady && (
            <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('detailed')}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-bold rounded transition-all cursor-pointer",
                  viewMode === 'detailed' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
                title="Exibir colunas completas com detalhamento mês a mês"
              >
                Detalhado
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-bold rounded transition-all cursor-pointer",
                  viewMode === 'compact' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
                title="Visualização compacta para maior densidade"
              >
                Compacto
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Estado Vazio Elegante e Proativo (Quando filtros ainda não foram preenchidos) */}
    {!isFilterReady ? (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-2xs space-y-6 print:hidden">
        <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-2xs">
          <ShieldCheck size={32} />
        </div>

        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-slate-900">
            Painel Financeiro Aguardando Parâmetros
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Selecione uma <strong>Turma</strong> cadastrada ou busque um <strong>Aluno</strong> individual, junto com o ano e período de referência para gerar a prestação de contas.
          </p>
        </div>

        {/* 3 Cartões Proativos de Ação Rápida */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-left">
          <button
            type="button"
            onClick={() => {
              setFilterTarget('class');
              if (scopedClasses.length > 0 && !selectedClassId) {
                setSelectedClassId(scopedClasses[0].id);
              }
              if (!selectedYear) {
                const nowYr = new Date().getFullYear();
                setSelectedYear(String(nowYr));
              }
              if (!periodType) {
                setPeriodType('anual');
              }
            }}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center mb-2.5">
                <Users size={16} />
              </div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-900">
                Consultar Turma
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Visualizar arrecadação consolidada da primeira turma ativa.
              </p>
            </div>
            <span className="text-[11px] font-bold text-blue-700 mt-3 inline-flex items-center gap-1">
              Carregar Turma <ChevronRight size={13} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterTarget('student');
              setIsStudentDropdownOpen(false);
              if (!selectedYear) setSelectedYear(String(new Date().getFullYear()));
              if (!periodType) setPeriodType('anual');
            }}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center mb-2.5">
                <User size={16} />
              </div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-900">
                Extrato por Aluno
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Localizar estudante por nome, matrícula ou CPF para extrato individual.
              </p>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 mt-3 inline-flex items-center gap-1">
              Buscar Aluno <ChevronRight size={13} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleSetCurrentMonth();
              if (scopedClasses.length > 0 && !selectedClassId) {
                setSelectedClassId('all');
              }
            }}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center mb-2.5">
                <Zap size={16} />
              </div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-900">
                Mês em Exercício
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Carregar imediatamente o mês corrente ({format(new Date(), 'MMMM/yyyy', { locale: ptBR })}).
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 mt-3 inline-flex items-center gap-1">
              Ver Mês Atual <ChevronRight size={13} />
            </span>
          </button>
        </div>
      </div>
    ) : (
      <>
        {/* NOVA FUNCIONALIDADE: Barra de Diagnóstico Visual da Arrecadação */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <BarChart3 size={15} className="text-blue-800" />
                <span>Diagnóstico Consolidado da Arrecadação</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Referência: <strong className="text-slate-800">{periodLabel}</strong> ({totals.totalAlunos} alunos no escopo)
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="text-slate-500">
                Total Previsto: <strong className="text-slate-900 font-mono">{formatCurrency(totals.totalPrevisto)}</strong>
              </span>
            </div>
          </div>

          {/* Barra Multissegmentada com Proporções Exatas */}
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            {/* Arrecadado / Efetuado (Verde) */}
            <div 
              className="bg-emerald-600 transition-all duration-500 relative group cursor-pointer"
              style={{ width: `${totals.totalPrevisto > 0 ? (totals.totalEfetuado / totals.totalPrevisto) * 100 : 0}%` }}
              title={`Arrecadado: ${formatCurrency(totals.totalEfetuado)} (${totals.taxaArrecadacao}%)`}
            />
            {/* A Vencer / Meses Futuros (Âmbar suave) */}
            <div 
              className="bg-amber-400 transition-all duration-500 relative group cursor-pointer"
              style={{ width: `${totals.totalPrevisto > 0 ? (totals.totalAVencer / totals.totalPrevisto) * 100 : 0}%` }}
              title={`A Vencer (Previsto): ${formatCurrency(totals.totalAVencer)}`}
            />
            {/* Inadimplente / Vencido (Vermelho) */}
            <div 
              className="bg-red-500 transition-all duration-500 relative group cursor-pointer"
              style={{ width: `${totals.totalPrevisto > 0 ? (totals.totalPendente / totals.totalPrevisto) * 100 : 0}%` }}
              title={`Inadimplente (Vencido): ${formatCurrency(totals.totalPendente)}`}
            />
          </div>

          {/* Legenda Informativa */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-0.5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0"></span>
                <span className="text-slate-600">Arrecadado:</span>
                <strong className="text-emerald-700 font-mono">{formatCurrency(totals.totalEfetuado)}</strong>
                <span className="text-[10px] text-emerald-800 bg-emerald-100 px-1 rounded font-bold font-mono">
                  {totals.taxaArrecadacao}%
                </span>
              </div>

              {totals.totalAVencer > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
                  <span className="text-slate-600">A Vencer:</span>
                  <strong className="text-amber-800 font-mono">{formatCurrency(totals.totalAVencer)}</strong>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></span>
                <span className="text-slate-600">Inadimplente:</span>
                <strong className="text-red-700 font-mono">{formatCurrency(totals.totalPendente)}</strong>
                <span className="text-[10px] text-slate-500">
                  ({totals.pendentesCount} {totals.pendentesCount === 1 ? 'aluno' : 'alunos'})
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 hidden lg:block">
              * Mês corrente é classificado como previsto em conformidade com as regras financeiras
            </div>
          </div>
        </div>

        {/* Cards de Métricas e Indicadores Consolidados */}
        <div className={cn(
          "grid gap-3.5 print:grid-cols-4 print:gap-2 print:mb-2.5",
          showAVencerCard 
            ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" 
            : "grid-cols-1 sm:grid-cols-3"
        )}>
          {/* Card 1: Previsto */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between print:p-2 print:rounded-none print:border-slate-300 print:shadow-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 print:text-[9.5px]">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  Total Previsto
                </span>
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 max-w-full truncate print:hidden" title={periodLabel}>
                  <Calendar size={11} className="text-slate-500 shrink-0" />
                  <span className="truncate">{periodLabel}</span>
                </span>
              </div>
              <div className="p-2 bg-amber-50 text-amber-700 rounded-xl shrink-0 border border-amber-100 print:hidden">
                <Calendar size={17} />
              </div>
            </div>
            <div className="mt-3 print:mt-1">
              <span className="text-2xl font-black text-slate-900 tabular-nums print:text-base">
                {formatCurrency(totals.totalPrevisto)}
              </span>
              <p className="text-[10px] text-slate-500 font-medium mt-1 print:text-[8px] print:mt-0">
                Base calculada para {totals.totalAlunos} aluno(s)
              </p>
            </div>
          </div>

          {/* Card 2: Efetuado / Arrecadado */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between print:p-2 print:rounded-none print:border-slate-300 print:shadow-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 print:text-[9.5px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  Total Efetuado (Arrecadado)
                </span>
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 max-w-full truncate print:hidden" title={periodLabel}>
                  <CheckCircle2 size={11} className="text-emerald-700 shrink-0" />
                  <span className="truncate">{totals.adimplentesCount} quitado(s)</span>
                </span>
              </div>
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl shrink-0 border border-emerald-100 print:hidden">
                <CheckCircle2 size={17} />
              </div>
            </div>
            <div className="mt-3 print:mt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-700 tabular-nums print:text-base">
                  {formatCurrency(totals.totalEfetuado)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-600 font-medium mt-1 print:text-[8px] print:mt-0">
                <span>{totals.adimplentesCount} alunos em dia</span>
                <span className="font-bold text-emerald-700 font-mono print:text-[8px]">
                  {totals.taxaArrecadacao}% da meta
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Saldo Pendente (Vencido) */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between print:p-2 print:rounded-none print:border-slate-300 print:shadow-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 print:text-[9.5px]">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                  Saldo Inadimplente (Vencido)
                </span>
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-red-800 bg-red-50 px-2 py-0.5 rounded-md border border-red-200 max-w-full truncate print:hidden" title={periodLabel}>
                  <AlertCircle size={11} className="text-red-700 shrink-0" />
                  <span className="truncate">{totals.pendentesCount} em atraso</span>
                </span>
              </div>
              <div className="p-2 bg-red-50 text-red-700 rounded-xl shrink-0 border border-red-100 print:hidden">
                <AlertCircle size={17} />
              </div>
            </div>
            <div className="mt-3 print:mt-1">
              <span className="text-2xl font-black text-red-600 tabular-nums print:text-base">
                {formatCurrency(totals.totalPendente)}
              </span>
              <p className="text-[10px] text-slate-500 font-medium mt-1 print:text-[8px] print:mt-0">
                {totals.pendentesCount} aluno(s) com parcelas vencidas
              </p>
            </div>
          </div>

          {/* Card 4: A Vencer / Restante */}
          {showAVencerCard && (
            <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between print:p-2 print:rounded-none print:border-slate-300 print:shadow-none">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 print:text-[9.5px]">
                    <Clock size={13} className="text-slate-500 shrink-0 print:hidden" />
                    A Vencer (Restante)
                  </span>
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 max-w-full truncate print:hidden" title={periodLabel}>
                    <Calendar size={11} className="text-slate-500 shrink-0" />
                    <span className="truncate">{isCurrentMonthPeriod ? 'Mês Atual' : 'Período Restante'}</span>
                  </span>
                </div>
                <div className="p-2 bg-slate-100 text-slate-700 rounded-xl shrink-0 print:hidden">
                  <Clock size={17} />
                </div>
              </div>
              <div className="mt-3 print:mt-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-800 tabular-nums print:text-base">
                    {formatCurrency(isCurrentMonthPeriod ? Math.max(0, totals.totalPrevisto - totals.totalEfetuado) : totals.totalAVencer)}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 print:hidden">
                    A Receber
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium mt-1 print:text-[8px] print:mt-0">
                  {isCurrentMonthPeriod ? 'Saldo previsto para este mês' : 'Saldo programado para meses futuros'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* NOVA FUNCIONALIDADE: Dossiê Individual do Aluno (quando 'Por Aluno' e aluno selecionado) */}
        {filterTarget === 'student' && selectedStudent && reportData.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#00174b] text-white font-bold text-sm flex items-center justify-center shadow-xs">
                  {selectedStudent.name ? selectedStudent.name.charAt(0).toUpperCase() : 'A'}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{selectedStudent.name}</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Matrícula: {selectedStudent.registration_number || '---'}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Turma: <strong className="text-slate-800">{classes.find(c => c.id === selectedStudent.class_id)?.name || 'Sem turma definida'}</strong>
                    {selectedStudent.cpf && ` • CPF: ${selectedStudent.cpf}`}
                    {selectedStudent.status && ` • Situação: ${selectedStudent.status}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Contribuição Prevista (Mês):</span>
                <span className="font-bold text-slate-900 font-mono bg-slate-100 px-2 py-1 rounded">
                  {formatCurrency(reportData[0].fee)}
                </span>
              </div>
            </div>

            {/* Grade Detalhada Mês a Mês do Aluno */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-700" />
                  <span>Demonstrativo Mês a Mês ({periodLabel})</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {reportData[0].monthsStatus.length} parcelas analisadas
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {reportData[0].monthsStatus.map((m) => (
                  <div 
                    key={m.month}
                    className={cn(
                      "p-3 rounded-xl border flex flex-col justify-between transition-all",
                      m.isPaid 
                        ? "bg-emerald-50/50 border-emerald-200" 
                        : m.isOverdue
                        ? "bg-red-50/50 border-red-200"
                        : m.isExpected
                        ? "bg-amber-50/30 border-amber-200/80"
                        : "bg-slate-50 border-slate-200 opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {m.monthName}
                      </span>
                      {m.isPaid ? (
                        <CheckCircle2 size={14} className="text-emerald-600" />
                      ) : m.isOverdue ? (
                        <AlertCircle size={14} className="text-red-600" />
                      ) : (
                        <Clock size={14} className="text-amber-500" />
                      )}
                    </div>

                    <div className="mt-2.5 space-y-1">
                      <div className="text-[11px] text-slate-600 flex justify-between">
                        <span>Previsto:</span>
                        <span className="font-mono font-semibold">{formatCurrency(m.fee)}</span>
                      </div>
                      <div className="text-[11px] flex justify-between">
                        <span>Pago:</span>
                        <span className={cn("font-mono font-bold", m.isPaid ? "text-emerald-700" : "text-slate-400")}>
                          {formatCurrency(m.amountPaid)}
                        </span>
                      </div>

                      {m.isPaid && m.paymentDate && (
                        <div className="text-[10px] text-emerald-800 pt-1 border-t border-emerald-200/60 truncate">
                          Pago em {formatDateForDisplay(m.paymentDate)}
                        </div>
                      )}

                      {m.isOverdue && (
                        <div className="text-[10px] text-red-700 font-bold pt-1 border-t border-red-200/60">
                          Parcela Vencida
                        </div>
                      )}

                      {!m.isPaid && !m.isOverdue && m.isExpected && (
                        <div className="text-[10px] text-amber-700 font-medium pt-1 border-t border-amber-200/60">
                          {m.isCurrent ? 'Mês Corrente' : 'A Vencer'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabela Analítica Oficial de Contribuições */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden print:border-none print:shadow-none">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2">
              {filterTarget === 'student' ? (
                <User size={16} className="text-blue-900" />
              ) : (
                <Users size={16} className="text-blue-900" />
              )}
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {filterTarget === 'student' && selectedStudent 
                  ? `Extrato Oficial do Aluno: ${selectedStudent.name}`
                  : `Tabela Analítica por Aluno (${reportData.length})`}
              </h4>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span>Previsto</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Efetuado</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span>Inadimplente (Vencido)</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 print:bg-slate-100">
                  <th className="py-3 px-3.5 text-center w-12">#</th>
                  
                  <th 
                    className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    onClick={() => handleToggleSort('name')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Aluno / Matrícula</span>
                      <ArrowUpDown size={12} className={cn("text-slate-400", sortField === 'name' && "text-blue-900 font-bold")} />
                    </div>
                  </th>

                  <th className="py-3 px-3.5">Turma</th>

                  {viewMode === 'detailed' && (
                    <th className="py-3 px-3.5 text-center">Meses do Período</th>
                  )}

                  <th 
                    className="py-3 px-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    onClick={() => handleToggleSort('previsto')}
                  >
                    <div className="inline-flex items-center gap-1 text-amber-800">
                      <span>Previsto</span>
                      <ArrowUpDown size={12} className={cn("text-slate-400", sortField === 'previsto' && "text-amber-800 font-bold")} />
                    </div>
                  </th>

                  <th 
                    className="py-3 px-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    onClick={() => handleToggleSort('efetuado')}
                  >
                    <div className="inline-flex items-center gap-1 text-emerald-800">
                      <span>Efetuado</span>
                      <ArrowUpDown size={12} className={cn("text-slate-400", sortField === 'efetuado' && "text-emerald-800 font-bold")} />
                    </div>
                  </th>

                  <th 
                    className="py-3 px-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    onClick={() => handleToggleSort('pendente')}
                  >
                    <div className="inline-flex items-center gap-1 text-red-800">
                      <span>Pendente (Vencido)</span>
                      <ArrowUpDown size={12} className={cn("text-slate-400", sortField === 'pendente' && "text-red-800 font-bold")} />
                    </div>
                  </th>

                  <th 
                    className="py-3 px-3.5 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    onClick={() => handleToggleSort('status')}
                  >
                    <div className="inline-flex items-center gap-1 justify-center">
                      <span>Situação</span>
                      <ArrowUpDown size={12} className={cn("text-slate-400", sortField === 'status' && "text-blue-900 font-bold")} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {reportData.length > 0 ? (
                  reportData.map((item, idx) => (
                    <tr 
                      key={item.student.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Número sequencial */}
                      <td className="py-3 px-3.5 text-center font-mono text-[10px] text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Nome e Matrícula */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0 border border-slate-200 print:hidden">
                            {item.student.name ? item.student.name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate leading-tight">
                              {item.student.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                              Matrícula: {item.student.registration_number || '---'} {item.student.cpf ? `| CPF: ${item.student.cpf}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Turma */}
                      <td className="py-3 px-3.5">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[10px] font-bold border border-slate-200">
                          {item.studentClass ? (item.studentClass.code || item.studentClass.name) : 'Sem Turma'}
                        </span>
                      </td>

                      {/* Meses do período com micro-badges interativos */}
                      {viewMode === 'detailed' && (
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap max-w-xs mx-auto">
                            {item.monthsStatus.map((m) => (
                              <span
                                key={m.month}
                                title={
                                  m.isPaid 
                                    ? `${m.monthName}: Pago ${formatCurrency(m.amountPaid)} em ${m.paymentDate ? formatDateForDisplay(m.paymentDate) : 'data n/d'} (${m.paymentMethod || 'PIX'})` 
                                    : m.isOverdue
                                    ? `${m.monthName}: Vencido e não quitado (${formatCurrency(m.fee)})` 
                                    : m.isCurrent
                                    ? `${m.monthName}: Mês atual (Previsto a vencer)` 
                                    : m.isFuture
                                    ? `${m.monthName}: Mês futuro (Previsto a vencer)`
                                    : `${m.monthName}: Fora do calendário letivo`
                                }
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all",
                                  m.isPaid 
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                                    : m.isOverdue 
                                    ? "bg-red-100 text-red-800 border border-red-300" 
                                    : m.isExpected
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : "bg-slate-100 text-slate-400 border border-slate-200 opacity-50"
                                )}
                              >
                                {m.monthShort}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}

                      {/* Valor Previsto */}
                      <td className="py-3 px-3.5 text-right font-bold text-amber-700 tabular-nums">
                        {formatCurrency(item.valorPrevisto)}
                      </td>

                      {/* Valor Efetuado */}
                      <td className="py-3 px-3.5 text-right font-bold text-emerald-700 tabular-nums">
                        {formatCurrency(item.valorEfetuado)}
                      </td>

                      {/* Saldo Pendente */}
                      <td className="py-3 px-3.5 text-right font-bold tabular-nums">
                        {item.saldoPendente > 0 ? (
                          <span className="text-red-600 font-black">
                            {formatCurrency(item.saldoPendente)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">
                            R$ 0,00
                          </span>
                        )}
                      </td>

                      {/* Situação */}
                      <td className="py-3 px-3.5 text-center">
                        {item.status === 'paid' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check size={11} /> Quitado
                          </span>
                        )}
                        {item.status === 'regular' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock size={11} /> Em Dia (Previsto)
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                            <AlertCircle size={11} /> Pendente ({item.overdueMonthsCount} venc.{item.overdueMonthsCount > 1 ? 's' : ''})
                          </span>
                        )}
                        {item.status === 'exempt' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            Isento
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={viewMode === 'detailed' ? 8 : 7} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <DollarSign size={32} className="text-slate-300" />
                        <p className="text-xs font-bold text-slate-700">Nenhum aluno encontrado para os filtros selecionados.</p>
                        <p className="text-[11px] text-slate-400">Experimente alterar a turma, o período ou limpar o termo de busca.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Rodapé da Tabela com Totais */}
              {reportData.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
                    <td colSpan={viewMode === 'detailed' ? 4 : 3} className="py-3 px-3.5 text-right uppercase tracking-wider text-[11px] font-bold text-slate-600">
                      Total Consolidado ({reportData.length} alunos):
                    </td>
                    <td className="py-3 px-3.5 text-right font-black text-amber-700 tabular-nums">
                      {formatCurrency(totals.totalPrevisto)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-black text-emerald-700 tabular-nums">
                      {formatCurrency(totals.totalEfetuado)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-black text-red-700 tabular-nums">
                      {formatCurrency(totals.totalPendente)}
                    </td>
                    <td className="py-3 px-3.5 text-center text-[11px] font-black text-indigo-700">
                      {totals.taxaArrecadacao}% Arrecadado
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </>
    )}

    {/* Seção de Assinaturas e Rodapé da Impressão */}
    <div className="hidden print:block mt-12 pt-8 border-t border-slate-300">
      <div className="grid grid-cols-2 gap-12 text-center text-xs text-slate-700">
        <div>
          <div className="border-t border-slate-400 w-3/4 mx-auto pt-2">
            <p className="font-bold text-slate-900">Tesouraria / Gestão Financeira</p>
            <p className="text-[10px] text-slate-500">Responsável pela Prestação de Contas</p>
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 w-3/4 mx-auto pt-2">
            <p className="font-bold text-slate-900">Secretaria Acadêmica / Direção</p>
            <p className="text-[10px] text-slate-500">Conferência e Arquivamento Oficial</p>
          </div>
        </div>
      </div>
      <div className="mt-8 text-center text-[9px] text-slate-400">
        Documento emitido eletronicamente pelo Sistema de Gestão Escolar ESCMIN em {format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss")}.
      </div>
    </div>
  </div>
);
}
