import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DollarSign, 
  Printer, 
  Download, 
  Filter, 
  Calendar, 
  GraduationCap, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  RefreshCw, 
  ChevronRight, 
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
  ArrowUpDown
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll, getInstitutionSettings } from '../lib/database';
import { financialService } from '../services/financialService';
import { financialConfigService } from '../services/financialConfigService';
import { Student, Class, Contribution, FinancialSettings } from '../types';
import { useUnits } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { isItemInUnit, getItemUnitId } from '../lib/unitService';
import { formatCurrency, cn, parseSafeDate, matchesStudentSearch, formatDateForDisplay, normalizeClass, detectCourseFromClass } from '../lib/utils';
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

// Filtros - Inicialmente limpos, sem dados pré-selecionados
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [periodType, setPeriodType] = useState<PeriodType | ''>('');
  
  // Sub-períodos - Inicialmente limpos
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // '1' a '12'
  const [selectedQuarter, setSelectedQuarter] = useState<string>(''); // '1' a '4'
  const [selectedSemester, setSelectedSemester] = useState<string>(''); // '1' ou '2'

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [monthlyStandardFee, setMonthlyStandardFee] = useState<string>('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);

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
    setSelectedYear('');
    setPeriodType('');
    setSelectedMonth('');
    setSelectedQuarter('');
    setSelectedSemester('');
    setStatusFilter('');
    setSearchTerm('');
    setMonthlyStandardFee('');
  }, []);

  const handlePeriodTypeChange = useCallback((type: PeriodType) => {
    setPeriodType(prev => (prev === type ? '' : type));
    setSelectedMonth('');
    setSelectedQuarter('');
    setSelectedSemester('');
  }, []);

  // Carregamento de dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [studentsData, classesData, contribsData, instData, acadData, finSettingsData] = await Promise.all([
        fetchAll('students'),
        fetchAll('classes'),
        financialService.getContributions(),
        getInstitutionSettings(),
        fetchAll('academic_settings'),
        financialConfigService.getSettings()
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

  // Valida se os parâmetros obrigatórios foram definidos pelo usuário
  const isFilterReady = useMemo(() => {
    if (!selectedClassId) return false;
    if (!selectedYear) return false;
    if (!periodType) return false;
    if (periodType === 'mensal' && !selectedMonth) return false;
    if (periodType === 'trimestral' && !selectedQuarter) return false;
    if (periodType === 'semestral' && !selectedSemester) return false;
    return true;
  }, [selectedClassId, selectedYear, periodType, selectedMonth, selectedQuarter, selectedSemester]);

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
// 1. Prioriza o valor informado pelo usuário no filtro (caso preenchido)
// 2. Resolve pelo padrão financeiro do sistema (Regra Customizada -> Curso -> Turno/Período -> Ano -> Padrão Geral)
// 3. Procura histórico recente de contribuições do próprio aluno ou turma
// 4. Fallback padrão fixo R$ 100,00
const getStudentFee = useCallback((student: Student) => {
  if (monthlyStandardFee && Number(monthlyStandardFee) > 0) {
    return Number(monthlyStandardFee);
  }

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
  return 100; // Padrão de mensalidade do sistema escolar
}, [monthlyStandardFee, selectedYear, classes, financialSettings, contributions, students]);

// Processamento analítico por aluno
const reportData = useMemo(() => {
  if (!isFilterReady) {
    return [];
  }

  const yearNum = Number(selectedYear);

  // Filtragem de alunos por turma e busca
  const filteredStudents = scopedStudents.filter(student => {
    if (selectedClassId !== 'all' && student.class_id !== selectedClassId) {
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
  .sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
}, [
  isFilterReady,
  scopedStudents, 
  classes, 
  contributions, 
  selectedYear, 
  selectedClassId, 
  periodMonths, 
  searchTerm, 
  statusFilter, 
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
    const selectedClassName = selectedClassId === 'all' 
      ? 'Todas as Turmas' 
      : classes.find(c => c.id === selectedClassId)?.name || 'Turma Selecionada';
    
    const paramsText = `Turma: ${selectedClassName}  |  Período: ${periodLabel}  |  Unidade: ${getUnitName(selectedUnitId) || 'Todas'}  |  Obs: Mês atual classificado como previsto`;
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
      description="Acompanhamento consolidado de contribuições e mensalidades previstas e efetuadas por turma."
      icon={DollarSign}
      badge={getUnitName(selectedUnitId) || 'Geral'}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
          title="Recarregar Dados Financeiros"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>

        <button
          onClick={handleExportCSV}
          disabled={!isFilterReady}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
          title={isFilterReady ? "Exportar dados para Excel/CSV" : "Selecione os parâmetros para exportar"}
        >
          <FileSpreadsheet size={15} className="text-emerald-600" />
          <span className="hidden sm:inline">Exportar CSV</span>
        </button>

        <button
          onClick={handleExportPDF}
          disabled={!isFilterReady || isExportingPDF}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
          title={isFilterReady ? "Baixar em formato PDF Oficial" : "Selecione os parâmetros para baixar PDF"}
        >
          <Download size={15} className="text-blue-700" />
          <span className="hidden sm:inline">{isExportingPDF ? 'Gerando...' : 'Baixar PDF'}</span>
        </button>

        <button
          onClick={handlePrint}
          disabled={!isFilterReady}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
          title={isFilterReady ? "Imprimir relatório formatado" : "Selecione os parâmetros para imprimir"}
        >
          <Printer size={15} />
          <span>Imprimir</span>
        </button>
      </div>
    </PageHeader>

    {/* Cabeçalho Oficial de Impressão (visível apenas na impressão) */}
    <div className="hidden print:block mb-6 border-b border-slate-300 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {institution?.logo_url && (
            <img 
              src={institution.logo_url} 
              alt="Logo" 
              className="w-16 h-16 object-contain"
            />
          )}
          <div>
            <h1 className="text-lg font-black text-slate-900 uppercase">
              {institution?.name || 'Escola Diocesana de Ministério'}
            </h1>
            <p className="text-xs text-slate-600 font-medium">
              {institution?.address || 'Diocese de Guarulhos'} {institution?.city && `- ${institution.city}`} {institution?.cnpj && `| CNPJ: ${institution.cnpj}`}
            </p>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mt-1">
              Relatório Financeiro: Contribuições Previstas vs. Efetuadas
            </h2>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p className="font-bold text-slate-700">Emissão: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          <p>Unidade: {getUnitName(selectedUnitId) || 'Todas as Unidades'}</p>
          <p>Operador: {profile?.name || 'Administração'}</p>
        </div>
      </div>
      
      {/* Faixa de Parâmetros na Impressão */}
      <div className="mt-3 p-2.5 bg-slate-100 rounded text-xs flex items-center justify-between font-medium text-slate-800">
        <div>
          <span className="font-bold">Turma: </span>
          {selectedClassId === 'all' ? 'Todas as Turmas' : classes.find(c => c.id === selectedClassId)?.name || 'Pendente'}
        </div>
        <div>
          <span className="font-bold">Período: </span>
          {periodLabel}
        </div>
        <div>
          <span className="font-bold">Valor Base Mensal: </span>
          {formatCurrency(Number(monthlyStandardFee) || 0)}
        </div>
        <div>
          <span className="font-bold">Filtro de Situação: </span>
          {!statusFilter || statusFilter === 'all' ? 'Todos' : statusFilter === 'paid' ? 'Adimplentes' : statusFilter === 'partial' ? 'Parciais' : 'Inadimplentes'}
        </div>
      </div>
    </div>

    {/* Painel de Filtros e Seletores (oculto na impressão) */}
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 print:hidden space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-blue-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Filtros do Relatório</h3>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">Campos limpos</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-colors cursor-pointer"
            title="Limpar todos os campos e seleções"
          >
            <X size={13} />
            <span>Limpar Campos</span>
          </button>
          <div className="text-xs font-medium text-slate-500 hidden sm:block">
            Período: <span className="font-bold text-slate-800">{periodLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Seletor de Turma */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Turma
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
          >
            <option value="">Selecione uma Turma...</option>
            <option value="all">Todas as Turmas ({scopedClasses.length})</option>
            {scopedClasses.map(c => (
              <option key={c.id} value={c.id}>
                {c.code ? `[${c.code}] ` : ''}{c.name} {c.period ? `(${c.period})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Seletor de Ano Letivo */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Ano de Referência
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
          >
            <option value="">Selecione o Ano...</option>
            {availableYears.map(yr => (
              <option key={yr} value={String(yr)}>
                {yr} {yr === new Date().getFullYear() ? '(Ano Corrente)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Seletor de Regime do Período */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Tipo de Período
          </label>
          <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl h-10">
            {(['mensal', 'trimestral', 'semestral', 'anual'] as PeriodType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handlePeriodTypeChange(type)}
                className={cn(
                  "text-[10.5px] font-bold capitalize rounded-lg transition-all cursor-pointer flex items-center justify-center",
                  periodType === type 
                    ? "bg-white text-blue-900 shadow-2xs" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                )}
              >
                {type === 'mensal' ? 'Mês' : type === 'trimestral' ? 'Trim' : type === 'semestral' ? 'Sem' : 'Ano'}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-seletor do Período Especificado */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            {periodType === 'mensal' ? 'Mês Selecionado' : periodType === 'trimestral' ? 'Trimestre' : periodType === 'semestral' ? 'Semestre' : periodType === 'anual' ? 'Exercício Anual' : 'Detalhamento do Período'}
          </label>

          {periodType === '' && (
            <div className="w-full h-10 px-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 flex items-center">
              Aguardando tipo de período...
            </div>
          )}

          {periodType === 'mensal' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="">Selecione o mês...</option>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={String(idx + 1)}>
                  {name}
                </option>
              ))}
            </select>
          )}

          {periodType === 'trimestral' && (
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="">Selecione o trimestre...</option>
              <option value="1">1º Trimestre (Janeiro a Março)</option>
              <option value="2">2º Trimestre (Abril a Junho)</option>
              <option value="3">3º Trimestre (Julho a Setembro)</option>
              <option value="4">4º Trimestre (Outubro a Dezembro)</option>
            </select>
          )}

          {periodType === 'semestral' && (
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="">Selecione o semestre...</option>
              <option value="1">1º Semestre (Janeiro a Junho)</option>
              <option value="2">2º Semestre (Julho a Dezembro)</option>
            </select>
          )}

          {periodType === 'anual' && (
            <div className="w-full h-10 px-3 bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center">
              12 Meses (Jan a Dez {selectedYear ? `de ${selectedYear}` : ''})
            </div>
          )}
        </div>
      </div>

      {/* Linha secundária de filtros: Situação, Busca e Valor Padrão */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-slate-100">
        {/* Filtro por Situação Financeira */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Situação da Contribuição
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
          >
            <option value="">Todas as Situações</option>
            <option value="pending">Apenas com Pendências Vencidas (Vermelho)</option>
            <option value="regular">Apenas em Dia / Previstos (Amarelo)</option>
            <option value="paid">Apenas 100% Quitados (Verde)</option>
          </select>
        </div>

        {/* Busca por Aluno */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Buscar Aluno
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Nome, Matrícula ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Valor Base da Mensalidade / Previsão */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Valor Padrão da Contribuição (Mês) <span className="text-[10px] text-slate-400 font-normal lowercase ml-1">(opcional - padrão do sistema: {formatCurrency(financialSettings?.default_monthly_fee || 100)})</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
            <input
              type="number"
              min="0"
              step="5"
              placeholder={`Padrão: ${formatCurrency(financialSettings?.default_monthly_fee || 100)} ou turma/curso`}
              value={monthlyStandardFee}
              onChange={(e) => setMonthlyStandardFee(e.target.value)}
              className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
    </div>

    {!isFilterReady ? (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 sm:p-12 text-center shadow-2xs space-y-4 print:hidden">
        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
          <Filter size={26} />
        </div>
        <div className="max-w-md mx-auto">
          <h3 className="text-base font-bold text-slate-800">
            Campos Limpos — Selecione os Parâmetros
          </h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Para gerar o demonstrativo financeiro de contribuições (previsto vs. efetuado), selecione a <strong>Turma</strong>, o <strong>Ano de Referência</strong> e o <strong>Período</strong> nos campos acima.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-semibold">
          <span className={cn(
            "px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all",
            selectedClassId 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-slate-50 text-slate-400 border-slate-200"
          )}>
            {selectedClassId ? <Check size={13} className="text-emerald-600" /> : <Clock size={13} className="text-slate-400" />}
            1. Turma: {selectedClassId ? (selectedClassId === 'all' ? 'Todas as Turmas' : classes.find(c => c.id === selectedClassId)?.name || 'Selecionada') : 'Pendente'}
          </span>

          <span className={cn(
            "px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all",
            selectedYear 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-slate-50 text-slate-400 border-slate-200"
          )}>
            {selectedYear ? <Check size={13} className="text-emerald-600" /> : <Clock size={13} className="text-slate-400" />}
            2. Ano: {selectedYear || 'Pendente'}
          </span>

          <span className={cn(
            "px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all",
            periodType && (periodType === 'anual' || (periodType === 'mensal' && selectedMonth) || (periodType === 'trimestral' && selectedQuarter) || (periodType === 'semestral' && selectedSemester))
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-slate-50 text-slate-400 border-slate-200"
          )}>
            {periodType && (periodType === 'anual' || (periodType === 'mensal' && selectedMonth) || (periodType === 'trimestral' && selectedQuarter) || (periodType === 'semestral' && selectedSemester))
              ? <Check size={13} className="text-emerald-600" /> 
              : <Clock size={13} className="text-slate-400" />}
            3. Período: {periodType ? periodLabel : 'Pendente'}
          </span>
        </div>
      </div>
    ) : (
      <>
        {/* Cards de Métricas e Indicadores Consolidados */}
        <div className={cn(
          "grid gap-3.5 print:grid-cols-4 print:gap-2",
          showAVencerCard 
            ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" 
            : "grid-cols-1 sm:grid-cols-3"
        )}>
          {/* Card 1: Previsto (Amarelo) */}
          <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  Total Previsto
                </span>
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-200/80 max-w-full truncate" title={periodLabel}>
                  <Calendar size={11} className="text-amber-700 shrink-0" />
                  <span className="truncate">{periodLabel}</span>
                </span>
              </div>
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0">
                <Calendar size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-amber-700 tabular-nums">
                {formatCurrency(totals.totalPrevisto)}
              </span>
              <p className="text-[10px] text-amber-800/80 font-medium mt-1">
                Arrecadação total prevista ({totals.totalAlunos} alunos)
              </p>
            </div>
          </div>

          {/* Card 2: Efetuado / Arrecadado (Verde) */}
          <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  Total Efetuado (Arrecadado)
                </span>
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md border border-emerald-200/80 max-w-full truncate" title={periodLabel}>
                  <Calendar size={11} className="text-emerald-700 shrink-0" />
                  <span className="truncate">{periodLabel}</span>
                </span>
              </div>
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-700 tabular-nums">
                  {formatCurrency(totals.totalEfetuado)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-emerald-800 font-medium mt-1">
                <span>{totals.adimplentesCount} quitados</span>
                <span className="font-bold bg-emerald-100/90 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200/80">
                  {totals.taxaArrecadacao}% arrecadado
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-emerald-100 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                  style={{ width: `${totals.taxaArrecadacao}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Saldo Pendente (Vermelho) */}
          <div className="p-4 bg-red-50/50 rounded-2xl border border-red-200 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                  Saldo Pendente (Vencido)
                </span>
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-red-800 bg-red-100/90 px-2 py-0.5 rounded-md border border-red-200/80 max-w-full truncate" title={periodLabel}>
                  <Calendar size={11} className="text-red-700 shrink-0" />
                  <span className="truncate">{periodLabel}</span>
                </span>
              </div>
              <div className="p-2 bg-red-100 text-red-800 rounded-xl shrink-0">
                <AlertCircle size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-red-600 tabular-nums">
                {formatCurrency(totals.totalPendente)}
              </span>
              <p className="text-[10px] text-red-800/80 font-medium mt-1">
                {totals.pendentesCount} aluno(s) com parcelas vencidas
              </p>
            </div>
          </div>

          {/* Card 4: A Vencer / Período Restante (Exibido somente no mês atual e no período ano) */}
          {showAVencerCard && (
            <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-500 shrink-0" />
                    A Vencer (Restante)
                  </span>
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 max-w-full truncate" title={periodLabel}>
                    <Calendar size={11} className="text-slate-500 shrink-0" />
                    <span className="truncate">{isCurrentMonthPeriod ? 'Mês Atual' : 'Meses Restantes do Ano'}</span>
                  </span>
                </div>
                <div className="p-2 bg-slate-100 text-slate-700 rounded-xl shrink-0">
                  <Clock size={18} />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-800 tabular-nums">
                    {formatCurrency(isCurrentMonthPeriod ? Math.max(0, totals.totalPrevisto - totals.totalEfetuado) : totals.totalAVencer)}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    A Arrecadar
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium mt-1">
                  {isCurrentMonthPeriod ? 'Falta a ser arrecadado no mês atual' : 'Falta a ser arrecadado no período restante'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tabela Analítica de Contribuições por Aluno */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden print:border-none print:shadow-none">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-600" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Demonstrativo por Aluno ({reportData.length})
              </h4>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span>Previsto</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Efetuado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>Pendente (Vencido)</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 print:bg-slate-100">
                  <th className="py-3 px-3.5 text-center w-12">#</th>
                  <th className="py-3 px-3.5">Aluno / Matrícula</th>
                  <th className="py-3 px-3.5">Turma</th>
                  <th className="py-3 px-3.5 text-center">Meses do Período</th>
                  <th className="py-3 px-3.5 text-right text-amber-800">
                    <span className="inline-flex items-center gap-1 justify-end">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      Previsto
                    </span>
                  </th>
                  <th className="py-3 px-3.5 text-right text-emerald-800">
                    <span className="inline-flex items-center gap-1 justify-end">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Efetuado
                    </span>
                  </th>
                  <th className="py-3 px-3.5 text-right text-red-800">
                    <span className="inline-flex items-center gap-1 justify-end">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      Pendente (Vencido)
                    </span>
                  </th>
                  <th className="py-3 px-3.5 text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {reportData.length > 0 ? (
                  reportData.map((item, idx) => (
                    <tr 
                      key={item.student.id}
                      className="hover:bg-slate-50/60 transition-colors"
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

                      {/* Meses do período com badges interativos: Verde (Pago), Vermelho (Vencido), Amarelo (Previsto) */}
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

                      {/* Valor Previsto (Amarelo) */}
                      <td className="py-3 px-3.5 text-right font-bold text-amber-700 tabular-nums">
                        {formatCurrency(item.valorPrevisto)}
                      </td>

                      {/* Valor Efetuado (Verde) */}
                      <td className="py-3 px-3.5 text-right font-bold text-emerald-700 tabular-nums">
                        {formatCurrency(item.valorEfetuado)}
                      </td>

                      {/* Saldo Pendente (Vermelho) */}
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
                    <td colSpan={8} className="py-12 text-center text-slate-400">
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
                    <td colSpan={4} className="py-3 px-3.5 text-right uppercase tracking-wider text-[11px] font-bold text-slate-600">
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
