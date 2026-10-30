import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  Calendar,
  Layers,
  TrendingUp,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ArrowRight,
  TrendingDown,
  RefreshCw,
  PlusCircle,
  FileText,
  CreditCard,
  Printer
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';

import { fetchAll } from '../lib/database';
import { isSupabaseConfigured } from '../lib/supabase';
import { cn, formatCurrency } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { Student, Class, Contribution } from '../types';
import { useUnits } from '../contexts/UnitContext';
import { getUnitColorTheme } from '../lib/unitColors';
import { getItemUnitId, isItemInUnit } from '../lib/unitService';
import { resolveAcademicSettingsForUnit } from '../lib/academicUtils';
import { financialConfigService } from '../services/financialConfigService';
import { getStudentContributionPlan } from '../lib/contributionRules';

const MONTH_NAMES_LIST = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export function FinancialDashboard() {
  const navigate = useNavigate();
  const { 
    selectedUnitId, 
    selectedUnit, 
    filterByActiveUnit,
    units
  } = useUnits();

  const unitTheme = useMemo(() => {
    return getUnitColorTheme(selectedUnit || selectedUnitId);
  }, [selectedUnit, selectedUnitId]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [allAcademicSettings, setAllAcademicSettings] = useState<any[]>([]);
  const [financialSettings, setFinancialSettings] = useState<any>(null);

  // Controles de Modo e Filtros
  const [delinquencyYear, setDelinquencyYear] = useState<number>(() => new Date().getFullYear());
  const [financialChartMode, setFinancialChartMode] = useState<'monthly' | 'semester' | 'annual'>('monthly');
  const [delinquencyClassFilter, setDelinquencyClassFilter] = useState<string>('all');

  // Controles específicos de cada visão:
  const [selectedComparisonMonth, setSelectedComparisonMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [monthlyChartScope, setMonthlyChartScope] = useState<'trio' | 'all'>('trio');
  const [monthlyDisplayType, setMonthlyDisplayType] = useState<'regular' | 'accumulated'>('regular');

  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(() => (new Date().getMonth() + 1 <= 6 ? 1 : 2));
  const [semesterDisplayType, setSemesterDisplayType] = useState<'regular' | 'accumulated'>('regular');

  const [annualDisplayType, setAnnualDisplayType] = useState<'regular' | 'accumulated'>('regular');

  // Carrega configurações financeiras
  useEffect(() => {
    financialConfigService.getSettings().then(setFinancialSettings).catch(() => {});
  }, []);

  // Busca dados essenciais
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [studentsData, classesData, enrollmentsData, contribsData, acadData] = await Promise.all([
        fetchAll('students').catch(() => []),
        fetchAll('classes').catch(() => []),
        fetchAll('enrollments').catch(() => []),
        fetchAll('contributions').catch(() => []),
        fetchAll('academic_settings').catch(() => [])
      ]);

      if (studentsData) setStudents(studentsData);
      if (classesData) setClasses(classesData);
      if (enrollmentsData) setEnrollments(enrollmentsData);
      if (contribsData) setContributions(contribsData);
      if (acadData) setAllAcademicSettings(acadData);
    } catch (err) {
      console.error('Erro ao carregar dados do Dashboard Financeiro:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Escopo de alunos e turmas pela unidade ativa
  const scopedStudents = useMemo(() => {
    return filterByActiveUnit(students, s => getItemUnitId(s));
  }, [students, filterByActiveUnit]);

  const scopedClasses = useMemo(() => {
    return filterByActiveUnit(classes, c => getItemUnitId(c));
  }, [classes, filterByActiveUnit]);

  // Mapa de vínculo de aluno para turma
  const studentToClassIdMap = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach(s => {
      if (s.class_id) map.set(s.id, s.class_id);
      else if ((s as any).current_class_id) map.set(s.id, (s as any).current_class_id);
    });
    enrollments.forEach((e: any) => {
      if (e.student_id && e.class_id && !map.has(e.student_id)) {
        map.set(e.student_id, e.class_id);
      }
    });
    return map;
  }, [students, enrollments]);

  // Anos de referência disponíveis para o seletor de ano
  const availableContributionYears = useMemo(() => {
    const yrs = new Set<number>();
    const currYr = new Date().getFullYear();
    yrs.add(currYr);
    yrs.add(currYr - 1);
    yrs.add(currYr + 1);
    contributions.forEach(c => {
      const y = Number(c.reference_year);
      if (y && y >= 2020 && y <= 2030) yrs.add(y);
    });
    return Array.from(yrs).sort((a, b) => b - a);
  }, [contributions]);

  // Cálculos do Previsto vs Realizado
  const delinquencyMonthlyData = useMemo(() => {
    const targetYear = delinquencyYear;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isCurrentYear = targetYear === currentYear;

    // Alunos elegíveis no escopo selecionado (unidade e opcionalmente turma filtrada)
    const targetStudents = scopedStudents.filter(s => {
      const isActive = !s.status || s.status === 'Ativo' || String(s.status).toLowerCase() === 'ativo';
      if (!isActive) return false;
      const classId = s.class_id || (s as any).current_class_id;
      if (delinquencyClassFilter !== 'all') {
        return classId === delinquencyClassFilter;
      }
      return true;
    });

    const { settings: activeAcad } = resolveAcademicSettingsForUnit(selectedUnitId, allAcademicSettings);

    // Mapeamento de planos de contribuição e mensalidades dos alunos para o ano
    const studentPlans = targetStudents.map(student => {
      const studentClass = classes.find(c => c.id === (student.class_id || (student as any).current_class_id));
      const fee = financialConfigService.resolveFee({
        year: targetYear,
        classId: studentClass?.id,
        className: studentClass?.name,
        studentClass,
        student
      }, financialSettings);

      const studentContribs = contributions.filter(c => {
        if (c.student_id !== student.id) return false;
        let y = Number(c.reference_year);
        if (!y && c.payment_date) {
          const d = new Date(c.payment_date);
          if (!isNaN(d.getTime())) y = d.getFullYear();
        }
        return y === targetYear;
      });

      const paidMonths = studentContribs.map(c => Number(c.reference_month));
      const plan = getStudentContributionPlan(student, studentClass, targetYear, paidMonths, activeAcad);

      return {
        student,
        studentClass,
        fee,
        plan
      };
    });

    // Contribuições no escopo da unidade e turma
    const relevantContributions = contributions.filter(c => {
      if (selectedUnitId !== 'all' && !isItemInUnit(getItemUnitId(c), selectedUnitId, units)) return false;
      let y = Number(c.reference_year);
      if (!y && c.payment_date) {
        const d = new Date(c.payment_date);
        if (!isNaN(d.getTime())) y = d.getFullYear();
      }
      if (y !== targetYear) return false;

      if (delinquencyClassFilter !== 'all') {
        const sClassId = studentToClassIdMap.get(c.student_id);
        if (sClassId !== delinquencyClassFilter) return false;
      }
      return true;
    });

    // Mapeamento mês a mês (1 a 12)
    let accumulatedPrevisto = 0;
    let accumulatedRealizado = 0;

    const monthlyPoints = Array.from({ length: 12 }, (_, idx) => {
      const monthNum = idx + 1;
      const monthShort = MONTH_SHORT_LABELS[idx];
      const monthName = MONTH_NAMES_LIST[idx];

      // Previsto mensal (valores a receber): soma dos valores esperados dos alunos
      let monthPrevisto = 0;
      studentPlans.forEach(({ fee, plan }) => {
        if (monthNum === 1) {
          if (plan.expectedPeriods.includes(0)) {
            monthPrevisto += fee;
          }
          if (plan.expectedPeriods.includes(1)) {
            monthPrevisto += fee;
          }
        } else {
          if (plan.expectedPeriods.includes(monthNum)) {
            monthPrevisto += fee;
          }
        }
      });

      // Realizado mensal (valores recebidos): soma das contribuições pagas para este mês
      const monthContribs = relevantContributions.filter(c => {
        let m = Number(c.reference_month);
        if (m === undefined || isNaN(m)) {
          if (c.payment_date) {
            const d = new Date(c.payment_date);
            if (!isNaN(d.getTime())) m = d.getMonth() + 1;
          }
        }
        if (monthNum === 1) {
          return m === 1 || m === 0;
        }
        return m === monthNum;
      });

      const monthRealizado = monthContribs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const monthSaldo = monthPrevisto - monthRealizado;
      const monthInadimplencia = Math.max(0, monthSaldo);

      // Acumulados progressivos ao longo do ano
      accumulatedPrevisto += monthPrevisto;
      accumulatedRealizado += monthRealizado;
      const accumulatedSaldo = accumulatedPrevisto - accumulatedRealizado;
      const accumulatedInadimplencia = Math.max(0, accumulatedSaldo);

      // Status temporal do mês
      const isPast = isCurrentYear ? monthNum < currentMonth : targetYear < currentYear;
      const isCurrent = isCurrentYear && monthNum === currentMonth;
      const isFuture = isCurrentYear ? monthNum > currentMonth : targetYear > currentYear;

      const rateRealizado = monthPrevisto > 0 
        ? Math.min(100, (monthRealizado / monthPrevisto) * 100)
        : (monthRealizado > 0 ? 100 : 0);

      const rateRealizadoAccum = accumulatedPrevisto > 0
        ? Math.min(100, (accumulatedRealizado / accumulatedPrevisto) * 100)
        : (accumulatedRealizado > 0 ? 100 : 0);

      return {
        monthNum,
        monthShort,
        monthName,
        monthPrevisto,
        monthRealizado,
        monthSaldo,
        monthMeta: monthPrevisto,
        monthInadimplencia,
        accumulatedPrevisto,
        accumulatedRealizado,
        accumulatedSaldo,
        accumulatedMeta: accumulatedPrevisto,
        accumulatedInadimplencia,
        rateRealizado: Number(rateRealizado.toFixed(1)),
        rateRealizadoAccum: Number(rateRealizadoAccum.toFixed(1)),
        rateArrecadacao: Number(rateRealizado.toFixed(1)),
        rateInadimplencia: monthPrevisto > 0 ? Number(Math.min(100, (monthInadimplencia / monthPrevisto) * 100).toFixed(1)) : 0,
        rateInadimplenciaAccum: accumulatedPrevisto > 0 ? Number(Math.min(100, (accumulatedInadimplencia / accumulatedPrevisto) * 100).toFixed(1)) : 0,
        isPast,
        isCurrent,
        isFuture,
        contribCount: monthContribs.length
      };
    });

    // 1. Total Anual (12 Meses)
    const annualPrevisto = monthlyPoints.reduce((acc, p) => acc + p.monthPrevisto, 0);
    const annualRealizado = monthlyPoints.reduce((acc, p) => acc + p.monthRealizado, 0);
    const annualSaldo = annualPrevisto - annualRealizado;
    const annualRateRealizado = annualPrevisto > 0 ? Number(Math.min(100, (annualRealizado / annualPrevisto) * 100).toFixed(1)) : (annualRealizado > 0 ? 100 : 0);

    const annualChartPoints = monthlyPoints.map(p => ({
      ...p,
      displayLabel: p.monthShort,
      previstoDisplay: annualDisplayType === 'accumulated' ? p.accumulatedPrevisto : p.monthPrevisto,
      realizadoDisplay: annualDisplayType === 'accumulated' ? p.accumulatedRealizado : p.monthRealizado,
      saldoDisplay: annualDisplayType === 'accumulated' ? p.accumulatedSaldo : p.monthSaldo,
      rateDisplay: annualDisplayType === 'accumulated' ? p.rateRealizadoAccum : p.rateRealizado
    }));

    // 2. 1º Semestre (Jan a Jun - meses 1 a 6)
    const sem1BasePoints = monthlyPoints.slice(0, 6);
    const sem1Previsto = sem1BasePoints.reduce((acc, p) => acc + p.monthPrevisto, 0);
    const sem1Realizado = sem1BasePoints.reduce((acc, p) => acc + p.monthRealizado, 0);
    const sem1Saldo = sem1Previsto - sem1Realizado;
    const sem1RateRealizado = sem1Previsto > 0 ? Number(Math.min(100, (sem1Realizado / sem1Previsto) * 100).toFixed(1)) : (sem1Realizado > 0 ? 100 : 0);

    let sem1RunPrevisto = 0;
    let sem1RunRealizado = 0;
    const sem1ChartPoints = sem1BasePoints.map(p => {
      sem1RunPrevisto += p.monthPrevisto;
      sem1RunRealizado += p.monthRealizado;
      const sem1RunSaldo = sem1RunPrevisto - sem1RunRealizado;
      const sem1RunRate = sem1RunPrevisto > 0 ? Number(Math.min(100, (sem1RunRealizado / sem1RunPrevisto) * 100).toFixed(1)) : 0;

      return {
        ...p,
        displayLabel: p.monthShort,
        previstoDisplay: semesterDisplayType === 'accumulated' ? sem1RunPrevisto : p.monthPrevisto,
        realizadoDisplay: semesterDisplayType === 'accumulated' ? sem1RunRealizado : p.monthRealizado,
        saldoDisplay: semesterDisplayType === 'accumulated' ? sem1RunSaldo : p.monthSaldo,
        rateDisplay: semesterDisplayType === 'accumulated' ? sem1RunRate : p.rateRealizado,
        semAccumPrevisto: sem1RunPrevisto,
        semAccumRealizado: sem1RunRealizado,
        semAccumSaldo: sem1RunSaldo
      };
    });

    // 3. 2º Semestre (Jul a Dez - meses 7 a 12)
    const sem2BasePoints = monthlyPoints.slice(6, 12);
    const sem2Previsto = sem2BasePoints.reduce((acc, p) => acc + p.monthPrevisto, 0);
    const sem2Realizado = sem2BasePoints.reduce((acc, p) => acc + p.monthRealizado, 0);
    const sem2Saldo = sem2Previsto - sem2Realizado;
    const sem2RateRealizado = sem2Previsto > 0 ? Number(Math.min(100, (sem2Realizado / sem2Previsto) * 100).toFixed(1)) : (sem2Realizado > 0 ? 100 : 0);

    let sem2RunPrevisto = 0;
    let sem2RunRealizado = 0;
    const sem2ChartPoints = sem2BasePoints.map(p => {
      sem2RunPrevisto += p.monthPrevisto;
      sem2RunRealizado += p.monthRealizado;
      const sem2RunSaldo = sem2RunPrevisto - sem2RunRealizado;
      const sem2RunRate = sem2RunPrevisto > 0 ? Number(Math.min(100, (sem2RunRealizado / sem2RunPrevisto) * 100).toFixed(1)) : 0;

      return {
        ...p,
        displayLabel: p.monthShort,
        previstoDisplay: semesterDisplayType === 'accumulated' ? sem2RunPrevisto : p.monthPrevisto,
        realizadoDisplay: semesterDisplayType === 'accumulated' ? sem2RunRealizado : p.monthRealizado,
        saldoDisplay: semesterDisplayType === 'accumulated' ? sem2RunSaldo : p.monthSaldo,
        rateDisplay: semesterDisplayType === 'accumulated' ? sem2RunRate : p.rateRealizado,
        semAccumPrevisto: sem2RunPrevisto,
        semAccumRealizado: sem2RunRealizado,
        semAccumSaldo: sem2RunSaldo
      };
    });

    const activeSemesterSummary = selectedSemester === 1 ? {
      number: 1,
      title: '1º Semestre',
      periodLabel: 'Janeiro a Junho',
      previsto: sem1Previsto,
      realizado: sem1Realizado,
      saldo: sem1Saldo,
      rateRealizado: sem1RateRealizado,
      chartPoints: sem1ChartPoints,
      basePoints: sem1BasePoints
    } : {
      number: 2,
      title: '2º Semestre',
      periodLabel: 'Julho a Dezembro',
      previsto: sem2Previsto,
      realizado: sem2Realizado,
      saldo: sem2Saldo,
      rateRealizado: sem2RateRealizado,
      chartPoints: sem2ChartPoints,
      basePoints: sem2BasePoints
    };

    // 4. Mês Selecionado vs. Antecessor e Posterior
    const targetMonthIdx = Math.min(Math.max(1, selectedComparisonMonth), 12) - 1;
    const selectedMonth = monthlyPoints[targetMonthIdx];
    const prevMonth = targetMonthIdx > 0 ? monthlyPoints[targetMonthIdx - 1] : null;
    const nextMonth = targetMonthIdx < 11 ? monthlyPoints[targetMonthIdx + 1] : null;

    // Variações em relação ao antecessor
    const deltaRealizadoVsPrev = prevMonth ? selectedMonth.monthRealizado - prevMonth.monthRealizado : null;
    const deltaRealizadoPctVsPrev = prevMonth && prevMonth.monthRealizado > 0
      ? Number((((selectedMonth.monthRealizado - prevMonth.monthRealizado) / prevMonth.monthRealizado) * 100).toFixed(1))
      : null;

    const deltaPrevistoVsPrev = prevMonth ? selectedMonth.monthPrevisto - prevMonth.monthPrevisto : null;
    const deltaSaldoVsPrev = prevMonth ? selectedMonth.monthSaldo - prevMonth.monthSaldo : null;

    // Variações em relação ao posterior
    const deltaPrevistoVsNext = nextMonth ? nextMonth.monthPrevisto - selectedMonth.monthPrevisto : null;
    const deltaRealizadoVsNext = nextMonth ? nextMonth.monthRealizado - selectedMonth.monthRealizado : null;

    // Pontos do trio (Antecessor, Selecionado, Posterior)
    const trioPoints = [
      prevMonth ? {
        ...prevMonth,
        role: 'antecessor',
        roleLabel: `${prevMonth.monthShort} (Antecessor)`,
        displayLabel: `${prevMonth.monthShort} (M-1)`,
        previstoDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.accumulatedPrevisto : prevMonth.monthPrevisto,
        realizadoDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.accumulatedRealizado : prevMonth.monthRealizado,
        saldoDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.accumulatedSaldo : prevMonth.monthSaldo,
        rateDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.rateRealizadoAccum : prevMonth.rateRealizado,
        isSelected: false
      } : null,
      {
        ...selectedMonth,
        role: 'selecionado',
        roleLabel: `${selectedMonth.monthShort} (Foco)`,
        displayLabel: `${selectedMonth.monthShort} (Foco)`,
        previstoDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.accumulatedPrevisto : selectedMonth.monthPrevisto,
        realizadoDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.accumulatedRealizado : selectedMonth.monthRealizado,
        saldoDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.accumulatedSaldo : selectedMonth.monthSaldo,
        rateDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.rateRealizadoAccum : selectedMonth.rateRealizado,
        isSelected: true
      },
      nextMonth ? {
        ...nextMonth,
        role: 'posterior',
        roleLabel: `${nextMonth.monthShort} (Posterior)`,
        displayLabel: `${nextMonth.monthShort} (M+1)`,
        previstoDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.accumulatedPrevisto : nextMonth.monthPrevisto,
        realizadoDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.accumulatedRealizado : nextMonth.monthRealizado,
        saldoDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.accumulatedSaldo : nextMonth.monthSaldo,
        rateDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.rateRealizadoAccum : nextMonth.rateRealizado,
        isSelected: false
      } : null
    ].filter(Boolean) as any[];

    // Pontos mensais de todos os 12 meses
    const monthlyAllPoints = monthlyPoints.map(p => ({
      ...p,
      displayLabel: p.monthShort,
      previstoDisplay: monthlyDisplayType === 'accumulated' ? p.accumulatedPrevisto : p.monthPrevisto,
      realizadoDisplay: monthlyDisplayType === 'accumulated' ? p.accumulatedRealizado : p.monthRealizado,
      saldoDisplay: monthlyDisplayType === 'accumulated' ? p.accumulatedSaldo : p.monthSaldo,
      rateDisplay: monthlyDisplayType === 'accumulated' ? p.rateRealizadoAccum : p.rateRealizado,
      isSelected: p.monthNum === selectedMonth.monthNum
    }));

    const monthlyChartPoints = monthlyChartScope === 'trio' ? trioPoints : monthlyAllPoints;

    return {
      monthlyPoints,
      annualChartPoints,
      sem1ChartPoints,
      sem2ChartPoints,
      activeSemesterSummary,
      monthlyChartPoints,
      trioPoints,
      annual: {
        previsto: annualPrevisto,
        realizado: annualRealizado,
        saldo: annualSaldo,
        rateRealizado: annualRateRealizado,
        meta: annualPrevisto,
        inadimplencia: Math.max(0, annualSaldo),
        rateInadimplencia: annualPrevisto > 0 ? Number(Math.min(100, (Math.max(0, annualSaldo) / annualPrevisto) * 100).toFixed(1)) : 0,
        rateArrecadacao: annualRateRealizado
      },
      sem1: {
        previsto: sem1Previsto,
        realizado: sem1Realizado,
        saldo: sem1Saldo,
        rateRealizado: sem1RateRealizado,
        meta: sem1Previsto,
        inadimplencia: Math.max(0, sem1Saldo),
        rateInadimplencia: sem1Previsto > 0 ? Number(Math.min(100, (Math.max(0, sem1Saldo) / sem1Previsto) * 100).toFixed(1)) : 0,
        rateArrecadacao: sem1RateRealizado
      },
      sem2: {
        previsto: sem2Previsto,
        realizado: sem2Realizado,
        saldo: sem2Saldo,
        rateRealizado: sem2RateRealizado,
        meta: sem2Previsto,
        inadimplencia: Math.max(0, sem2Saldo),
        rateInadimplencia: sem2Previsto > 0 ? Number(Math.min(100, (Math.max(0, sem2Saldo) / sem2Previsto) * 100).toFixed(1)) : 0,
        rateArrecadacao: sem2RateRealizado
      },
      comparison: {
        selectedMonth,
        prevMonth,
        nextMonth,
        deltaRealizadoVsPrev,
        deltaRealizadoPctVsPrev,
        deltaPrevistoVsPrev,
        deltaSaldoVsPrev,
        deltaPrevistoVsNext,
        deltaRealizadoVsNext
      },
      targetStudentsCount: targetStudents.length,
      isCurrentYear,
      currentMonth
    };
  }, [
    delinquencyYear,
    delinquencyClassFilter,
    selectedComparisonMonth,
    monthlyChartScope,
    monthlyDisplayType,
    selectedSemester,
    semesterDisplayType,
    annualDisplayType,
    scopedStudents,
    contributions,
    classes,
    financialSettings,
    allAcademicSettings,
    selectedUnit,
    selectedUnitId,
    units,
    studentToClassIdMap
  ]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Wallet}
          title="Dashboard Financeiro"
          description="Acompanhamento de Contribuições — Previsto vs. Realizado"
        />
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 shadow-2xs">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-emerald-600" />
          <p className="font-semibold text-sm">Carregando painel financeiro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página com Ações Rápidas */}
      <PageHeader
        icon={Wallet}
        title="Dashboard Financeiro"
        description="Acompanhamento mês a mês, semestral e anual do previsto versus realizado das contribuições"
      >
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="Atualizar dados financeiros"
          >
            <RefreshCw size={13} className={cn("text-slate-500", isRefreshing && "animate-spin text-emerald-600")} />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/contributions', { state: { viewMode: 'individual', tab: 'individual' } })}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <PlusCircle size={14} />
            <span>Lançar Contribuição</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/financial-report')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <FileText size={13} className="text-slate-500" />
            <span>Relatório</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/pix-conference')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <CreditCard size={13} className="text-slate-500" />
            <span>Conferência Pix</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/receipts')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <Printer size={13} className="text-slate-500" />
            <span>Recibos</span>
          </button>
        </div>
      </PageHeader>

      {/* Bloco Completo do Quadro Previsto vs Realizado */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
        <div>
          {/* Cabeçalho do Card com Controles de Navegação e Filtros */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100/80 shadow-2xs">
                <BarChart3 size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                    Previsto vs. Realizado (Contribuições)
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {financialChartMode === 'monthly' ? 'Visão Mensal' : financialChartMode === 'semester' ? 'Visão Semestral' : 'Visão Anual'}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">
                  {financialChartMode === 'monthly'
                    ? 'Acompanhamento mês a mês com comparativo entre antecessor, mês em foco e posterior'
                    : financialChartMode === 'semester'
                      ? `Resumo do ${delinquencyMonthlyData.activeSemesterSummary.title} (${delinquencyMonthlyData.activeSemesterSummary.periodLabel}) com valores mês a mês e totais`
                      : 'Resultado consolidado dos 12 meses do ano com demonstrativo analítico e saldo da diferença'}
                </p>
              </div>
            </div>

            {/* Barra de Controles: Abas (Mensal / Semestral / Anual), Turma e Ano */}
            <div className="flex items-center flex-wrap gap-2">
              {/* Seletor de Modo: Mensal / Semestral / Anual */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setFinancialChartMode('monthly')}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none",
                    financialChartMode === 'monthly'
                      ? "bg-white text-blue-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Navegar mês a mês comparando com antecessor e posterior"
                >
                  <Calendar size={12} className={financialChartMode === 'monthly' ? "text-blue-600" : "text-slate-400"} />
                  <span>Mensal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFinancialChartMode('semester')}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none",
                    financialChartMode === 'semester'
                      ? "bg-white text-blue-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Resumo do 1º ou 2º semestre com totais e mês a mês"
                >
                  <Layers size={12} className={financialChartMode === 'semester' ? "text-blue-600" : "text-slate-400"} />
                  <span>Semestral</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFinancialChartMode('annual')}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none",
                    financialChartMode === 'annual'
                      ? "bg-white text-blue-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Resultado consolidado anual dos 12 meses e saldo da diferença"
                >
                  <TrendingUp size={12} className={financialChartMode === 'annual' ? "text-blue-600" : "text-slate-400"} />
                  <span>Anual</span>
                </button>
              </div>

              {/* Filtro de Turma */}
              <div className="flex items-center gap-1 bg-slate-100/90 px-2 py-1 rounded-xl border border-slate-200/60 shadow-2xs">
                <GraduationCap size={13} className="text-slate-500 shrink-0" />
                <select
                  value={delinquencyClassFilter}
                  onChange={(e) => setDelinquencyClassFilter(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-800 cursor-pointer focus:outline-hidden max-w-[150px] truncate"
                  aria-label="Filtrar por turma"
                >
                  <option value="all">Todas as Turmas</option>
                  {scopedClasses
                    .filter(c => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo')
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                </select>
              </div>

              {/* Seletor de Ano */}
              <div className="flex items-center gap-1 bg-slate-100/90 px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs">
                <Calendar size={13} className="text-slate-500 shrink-0" />
                <select
                  value={delinquencyYear}
                  onChange={(e) => setDelinquencyYear(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-bold text-slate-800 cursor-pointer focus:outline-hidden"
                  aria-label="Selecionar ano de referência"
                >
                  {availableContributionYears.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ========================================================
              MODALIDADE 1: VISÃO MENSAL (COMPARAÇÃO ANTECESSOR E POSTERIOR)
             ======================================================== */}
          {financialChartMode === 'monthly' && (
            <div className="space-y-3.5 mb-4">
              {/* Barra de Navegação Mês a Mês Simplificada e Direta */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
                {/* Lado Esquerdo: Mês em Análise com navegação rápida */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Mês em Análise:
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedComparisonMonth(prev => Math.max(1, prev - 1))}
                      disabled={selectedComparisonMonth === 1}
                      className="p-1 rounded bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none border border-slate-200 shadow-2xs cursor-pointer transition-colors"
                      title="Mês anterior"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="px-2.5 py-0.5 bg-[#00174b] text-white rounded-lg text-xs font-bold shadow-2xs">
                      {MONTH_NAMES_LIST[selectedComparisonMonth - 1]} / {delinquencyYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedComparisonMonth(prev => Math.min(12, prev + 1))}
                      disabled={selectedComparisonMonth === 12}
                      className="p-1 rounded bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none border border-slate-200 shadow-2xs cursor-pointer transition-colors"
                      title="Próximo mês"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Centro: Seletor Rápido de Meses (Pills Jan a Dez) */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
                  {MONTH_SHORT_LABELS.map((label, idx) => {
                    const mNum = idx + 1;
                    const isSel = selectedComparisonMonth === mNum;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setSelectedComparisonMonth(mNum)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer",
                          isSel
                            ? "bg-[#00174b] text-white shadow-2xs"
                            : "bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200/70"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4 Cards Principais de Síntese */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Previsto a Receber */}
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                        Previsto a Receber
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">
                        {delinquencyMonthlyData.comparison.selectedMonth.monthShort}
                      </span>
                    </div>
                    <div className="text-xl font-black text-blue-950 tabular-nums">
                      {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthPrevisto)}
                    </div>
                    <p className="text-[11px] text-blue-700 font-medium mt-0.5">
                      Expectativa do plano curricular
                    </p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-blue-200/70 text-[11px] text-blue-900/80 flex justify-between">
                    <span>Acumulado no ano:</span>
                    <span className="font-bold">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.accumulatedPrevisto)}</span>
                  </div>
                </div>

                {/* 2. Realizado Recebido */}
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                        Realizado Recebido
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Efetivado
                      </span>
                    </div>
                    <div className="text-xl font-black text-emerald-950 tabular-nums">
                      {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthRealizado)}
                    </div>
                    <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                      {delinquencyMonthlyData.comparison.selectedMonth.contribCount} pagamento(s) computado(s)
                    </p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-emerald-200/70 text-[11px] text-emerald-900/80 flex justify-between">
                    <span>Acumulado no ano:</span>
                    <span className="font-bold">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.accumulatedRealizado)}</span>
                  </div>
                </div>

                {/* 3. Saldo da Diferença */}
                <div className={cn(
                  "p-3.5 rounded-xl border shadow-2xs flex flex-col justify-between",
                  delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0
                    ? "bg-amber-50/70 border-amber-200/80"
                    : "bg-slate-50 border-slate-200/80"
                )}>
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? "text-amber-900" : "text-slate-800"
                      )}>
                        Saldo da Diferença
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                        delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0
                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                      )}>
                        {delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? 'Pendente a Receber' : 'Quitado / Superávit'}
                      </span>
                    </div>
                    <div className={cn(
                      "text-xl font-black tabular-nums",
                      delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? "text-amber-950" : "text-slate-900"
                    )}>
                      {formatCurrency(Math.abs(delinquencyMonthlyData.comparison.selectedMonth.monthSaldo))}
                    </div>
                    <p className="text-[11px] font-medium mt-0.5 text-slate-500">
                      {delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0
                        ? 'Diferença prevista a ser recebida'
                        : 'Totalmente realizado'}
                    </p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-200/70 text-[11px] text-slate-600 flex justify-between">
                    <span>Saldo acum. no ano:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.accumulatedSaldo)}</span>
                  </div>
                </div>

                {/* 4. Taxa de Efetivação */}
                <div className="p-3.5 rounded-xl bg-violet-50/70 border border-violet-200/80 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-violet-900 uppercase tracking-wider">
                        Taxa de Efetivação
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                        Realizado / Previsto
                      </span>
                    </div>
                    <div className="text-xl font-black text-violet-950 tabular-nums">
                      {delinquencyMonthlyData.comparison.selectedMonth.rateRealizado}%
                    </div>
                    <p className="text-[11px] text-violet-700 font-medium mt-0.5">
                      Atingimento da previsão no mês
                    </p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-violet-200/70 text-[11px] text-violet-900/80 flex justify-between">
                    <span>Efetivação acum. ano:</span>
                    <span className="font-bold">{delinquencyMonthlyData.comparison.selectedMonth.rateRealizadoAccum}%</span>
                  </div>
                </div>
              </div>

              {/* Faixa Comparativa de Contexto Temporal */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Coluna 1: Contexto do Mês Anterior */}
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Mês Anterior (M - 1)
                      </span>
                      {delinquencyMonthlyData.comparison.prevMonth && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                          {delinquencyMonthlyData.comparison.prevMonth.monthName}
                        </span>
                      )}
                    </div>
                    {delinquencyMonthlyData.comparison.prevMonth ? (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500">Realizado:</span>
                          <span className="font-bold text-emerald-700">{formatCurrency(delinquencyMonthlyData.comparison.prevMonth.monthRealizado)}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500">Taxa de Realização:</span>
                          <span className="font-bold text-slate-800">{delinquencyMonthlyData.comparison.prevMonth.rateRealizado}%</span>
                        </div>
                        <div className="flex justify-between items-baseline text-[11px]">
                          <span className="text-slate-400">Saldo Pendente:</span>
                          <span className={cn(
                            "font-medium",
                            delinquencyMonthlyData.comparison.prevMonth.monthSaldo > 0 ? "text-amber-700" : "text-emerald-700"
                          )}>
                            {formatCurrency(delinquencyMonthlyData.comparison.prevMonth.monthSaldo)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-slate-400 italic">
                        Janeiro é o primeiro mês do exercício.
                      </div>
                    )}
                  </div>
                  {delinquencyMonthlyData.comparison.prevMonth && (
                    <button
                      type="button"
                      onClick={() => setSelectedComparisonMonth(selectedComparisonMonth - 1)}
                      className="mt-2.5 pt-2 border-t border-slate-200 text-left text-[11px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer flex items-center gap-1"
                    >
                      <ChevronLeft size={13} />
                      <span>Analisar {delinquencyMonthlyData.comparison.prevMonth.monthName}</span>
                    </button>
                  )}
                </div>

                {/* Coluna 2: Análise de Desempenho e Variação */}
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Variação & Desempenho
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-900 text-white">
                        {delinquencyMonthlyData.comparison.selectedMonth.monthName}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-500">Variação vs Mês Anterior:</span>
                        {delinquencyMonthlyData.comparison.deltaRealizadoVsPrev !== null ? (
                          <span className={cn(
                            "font-bold flex items-center gap-0.5",
                            delinquencyMonthlyData.comparison.deltaRealizadoVsPrev >= 0 ? "text-emerald-700" : "text-amber-700"
                          )}>
                            {delinquencyMonthlyData.comparison.deltaRealizadoVsPrev >= 0 ? `+${formatCurrency(delinquencyMonthlyData.comparison.deltaRealizadoVsPrev)}` : formatCurrency(delinquencyMonthlyData.comparison.deltaRealizadoVsPrev)}
                            {delinquencyMonthlyData.comparison.deltaRealizadoPctVsPrev !== null && ` (${delinquencyMonthlyData.comparison.deltaRealizadoPctVsPrev > 0 ? '+' : ''}${delinquencyMonthlyData.comparison.deltaRealizadoPctVsPrev}%)`}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-semibold">---</span>
                        )}
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-500">Média Mensal Realizada:</span>
                        <span className="font-bold text-slate-800">
                          {formatCurrency(delinquencyMonthlyData.annual.realizado / (delinquencyMonthlyData.isCurrentYear ? delinquencyMonthlyData.currentMonth : 12))} / mês
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline text-[11px]">
                        <span className="text-slate-400">Participação no Ano:</span>
                        <span className="font-medium text-slate-700">
                          {delinquencyMonthlyData.annual.realizado > 0
                            ? `${((delinquencyMonthlyData.comparison.selectedMonth.monthRealizado / delinquencyMonthlyData.annual.realizado) * 100).toFixed(1)}% do arrecadado`
                            : '0%'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-200 text-xs flex justify-between items-center text-slate-600">
                    <span>Atingimento da Meta:</span>
                    <span className="font-bold text-slate-800">{delinquencyMonthlyData.comparison.selectedMonth.rateRealizado}%</span>
                  </div>
                </div>

                {/* Coluna 3: Contexto do Próximo Mês */}
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Próximo Mês (M + 1)
                      </span>
                      {delinquencyMonthlyData.comparison.nextMonth && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                          {delinquencyMonthlyData.comparison.nextMonth.monthName}
                        </span>
                      )}
                    </div>
                    {delinquencyMonthlyData.comparison.nextMonth ? (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500">Previsão Projetada:</span>
                          <span className="font-bold text-slate-800">{formatCurrency(delinquencyMonthlyData.comparison.nextMonth.monthPrevisto)}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500">Situação:</span>
                          <span className="font-bold text-amber-700">
                            {delinquencyMonthlyData.comparison.nextMonth.isFuture ? 'A Vencer' : 'Vigente'}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline text-[11px]">
                          <span className="text-slate-400">Realizado até Agora:</span>
                          <span className="font-medium text-slate-600">{formatCurrency(delinquencyMonthlyData.comparison.nextMonth.monthRealizado)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-slate-400 italic">
                        Dezembro encerra o exercício letivo.
                      </div>
                    )}
                  </div>
                  {delinquencyMonthlyData.comparison.nextMonth && (
                    <button
                      type="button"
                      onClick={() => setSelectedComparisonMonth(selectedComparisonMonth + 1)}
                      className="mt-2.5 pt-2 border-t border-slate-200 text-right text-[11px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer flex items-center justify-end gap-1 ml-auto"
                    >
                      <span>Analisar {delinquencyMonthlyData.comparison.nextMonth.monthName}</span>
                      <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              MODALIDADE 2: VISÃO SEMESTRAL (1º OU 2º SEMESTRE)
             ======================================================== */}
          {financialChartMode === 'semester' && (
            <div className="space-y-3.5 mb-4">
              {/* Barra de Seleção de Semestre e Tipo de Exibição */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                    Semestre em Análise:
                  </span>
                  <div className="flex items-center p-0.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setSelectedSemester(1)}
                      className={cn(
                        "px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                        selectedSemester === 1
                          ? "bg-emerald-600 text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      1º Semestre (Jan a Jun)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSemester(2)}
                      className={cn(
                        "px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                        selectedSemester === 2
                          ? "bg-violet-600 text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      2º Semestre (Jul a Dez)
                    </button>
                  </div>
                </div>
              </div>

              {/* Cards de Resumo Total do Semestre Selecionado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Total Previsto no Semestre */}
                <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/70 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                        Total Previsto (Semestre)
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        6 Meses
                      </span>
                    </div>
                    <div className="text-lg font-black text-blue-950 tabular-nums">
                      {formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto)}
                    </div>
                    <p className="text-[10px] text-blue-700 font-semibold mt-0.5">
                      Valores orçados a receber ({delinquencyMonthlyData.activeSemesterSummary.periodLabel})
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-blue-200/60 text-[10px] text-blue-900/80 flex justify-between">
                    <span>Média mensal prevista:</span>
                    <span className="font-bold">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto / 6)}</span>
                  </div>
                </div>

                {/* Total Realizado no Semestre */}
                <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/70 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                        Total Realizado (Semestre)
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Arrecadado
                      </span>
                    </div>
                    <div className="text-lg font-black text-emerald-950 tabular-nums">
                      {formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado)}
                    </div>
                    <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                      Valores recebidos no período
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-emerald-200/60 text-[10px] text-emerald-900/80 flex justify-between">
                    <span>Média mensal realizada:</span>
                    <span className="font-bold">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado / 6)}</span>
                  </div>
                </div>

                {/* Saldo da Diferença Semestral */}
                <div className={cn(
                  "p-3 rounded-xl border shadow-2xs flex flex-col justify-between",
                  delinquencyMonthlyData.activeSemesterSummary.saldo > 0
                    ? "bg-amber-50/80 border-amber-200/80"
                    : "bg-slate-50 border-slate-200/80"
                )}>
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? "text-amber-900" : "text-slate-800"
                      )}>
                        Saldo da Diferença
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded",
                        delinquencyMonthlyData.activeSemesterSummary.saldo > 0
                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                      )}>
                        {delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? 'Pendente a Receber' : 'Superávit / Quitado'}
                      </span>
                    </div>
                    <div className={cn(
                      "text-lg font-black tabular-nums",
                      delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? "text-amber-950" : "text-slate-900"
                    )}>
                      {formatCurrency(Math.abs(delinquencyMonthlyData.activeSemesterSummary.saldo))}
                    </div>
                    <p className="text-[10px] font-semibold mt-0.5 text-slate-500">
                      Previsto ({formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto)}) - Realizado ({formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado)})
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-600 flex justify-between">
                    <span>Outro Semestre:</span>
                    <span className="font-bold text-slate-800">
                      {selectedSemester === 1 
                        ? `S2: ${formatCurrency(delinquencyMonthlyData.sem2.realizado)}`
                        : `S1: ${formatCurrency(delinquencyMonthlyData.sem1.realizado)}`}
                    </span>
                  </div>
                </div>

                {/* Taxa de Efetivação do Semestre */}
                <div className="p-3 rounded-xl bg-violet-50/80 border border-violet-200/70 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-violet-900 uppercase tracking-wider">
                        Taxa de Realização
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                        Semestral
                      </span>
                    </div>
                    <div className="text-lg font-black text-violet-950 tabular-nums">
                      {delinquencyMonthlyData.activeSemesterSummary.rateRealizado}%
                    </div>
                    <p className="text-[10px] text-violet-700 font-semibold mt-0.5">
                      Percentual atingido da meta do semestre
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-violet-200/60 text-[10px] text-violet-900/80 flex justify-between">
                    <span>Taxa Anual Global:</span>
                    <span className="font-bold">{delinquencyMonthlyData.annual.rateRealizado}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              MODALIDADE 3: VISÃO ANUAL (12 MESES)
             ======================================================== */}
          {financialChartMode === 'annual' && (
            <div className="space-y-3.5 mb-4">
              {/* Barra de Opções da Visão Anual */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                    Consolidado Anual:
                  </span>
                  <span className="px-2.5 py-0.5 bg-slate-800 text-white rounded text-xs font-black shadow-2xs">
                    Exercício {delinquencyYear} (12 Meses)
                  </span>
                </div>
              </div>

              {/* Cards de Resultado Anual Previsto, Realizado e Saldo da Diferença */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Resultado Anual Previsto */}
                <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/70 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                        Resultado Anual Previsto
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        Valores a Receber
                      </span>
                    </div>
                    <div className="text-lg font-black text-blue-950 tabular-nums">
                      {formatCurrency(delinquencyMonthlyData.annual.previsto)}
                    </div>
                    <p className="text-[10px] text-blue-700 font-semibold mt-0.5">
                      Total geral orçado para o ano letivo
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-blue-200/60 text-[10px] text-blue-900/80 flex justify-between">
                    <span>Média mensal orçada:</span>
                    <span className="font-bold">{formatCurrency(delinquencyMonthlyData.annual.previsto / 12)}</span>
                  </div>
                </div>

                {/* 2. Resultado Anual Realizado */}
                <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/70 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                        Resultado Anual Realizado
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Valores Recebidos
                      </span>
                    </div>
                    <div className="text-lg font-black text-emerald-950 tabular-nums">
                      {formatCurrency(delinquencyMonthlyData.annual.realizado)}
                    </div>
                    <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                      Total arrecadado no exercício
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-emerald-200/60 text-[10px] text-emerald-900/80 flex justify-between">
                    <span>Média mensal arrecadada:</span>
                    <span className="font-bold">{formatCurrency(delinquencyMonthlyData.annual.realizado / 12)}</span>
                  </div>
                </div>

                {/* 3. Saldo da Diferença Anual */}
                <div className={cn(
                  "p-3 rounded-xl border shadow-2xs flex flex-col justify-between",
                  delinquencyMonthlyData.annual.saldo > 0
                    ? "bg-amber-50/80 border-amber-200/80"
                    : "bg-slate-50 border-slate-200/80"
                )}>
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        delinquencyMonthlyData.annual.saldo > 0 ? "text-amber-900" : "text-slate-800"
                      )}>
                        Saldo da Diferença Anual
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded",
                        delinquencyMonthlyData.annual.saldo > 0
                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                      )}>
                        {delinquencyMonthlyData.annual.saldo > 0 ? 'Pendente a Receber' : 'Superávit / Quitado'}
                      </span>
                    </div>
                    <div className={cn(
                      "text-lg font-black tabular-nums",
                      delinquencyMonthlyData.annual.saldo > 0 ? "text-amber-950" : "text-slate-900"
                    )}>
                      {formatCurrency(Math.abs(delinquencyMonthlyData.annual.saldo))}
                    </div>
                    <p className="text-[10px] font-semibold mt-0.5 text-slate-500">
                      Previsto ({formatCurrency(delinquencyMonthlyData.annual.previsto)}) - Realizado ({formatCurrency(delinquencyMonthlyData.annual.realizado)})
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-600 flex justify-between">
                    <span>Divisão semestral:</span>
                    <span className="font-bold text-slate-800">
                      S1: {formatCurrency(delinquencyMonthlyData.sem1.realizado)} | S2: {formatCurrency(delinquencyMonthlyData.sem2.realizado)}
                    </span>
                  </div>
                </div>

                {/* 4. Taxa Anual de Efetivação */}
                <div className="p-3 rounded-xl bg-violet-50/80 border border-violet-200/70 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-violet-900 uppercase tracking-wider">
                        Taxa Anual de Efetivação
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                        Exercício
                      </span>
                    </div>
                    <div className="text-lg font-black text-violet-950 tabular-nums">
                      {delinquencyMonthlyData.annual.rateRealizado}%
                    </div>
                    <p className="text-[10px] text-violet-700 font-semibold mt-0.5">
                      Percentual da previsão anual concretizado
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-violet-200/60 text-[10px] text-violet-900/80 flex justify-between">
                    <span>Alunos no escopo:</span>
                    <span className="font-bold">{delinquencyMonthlyData.targetStudentsCount} matrículas</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              GRÁFICO DE BARRAS RECHARTS DINÂMICO
             ======================================================== */}
          <div className="w-full pt-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-2.5 px-1 pb-2 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    {financialChartMode === 'monthly'
                      ? `Comparativo de Barras (${monthlyChartScope === 'trio' ? '3 Meses: Anterior, Foco e Posterior' : '12 Meses'})`
                      : financialChartMode === 'semester'
                        ? `Comparativo Mês a Mês — ${delinquencyMonthlyData.activeSemesterSummary.title}`
                        : `Demonstrativo Anual dos 12 Meses`}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    {financialChartMode === 'monthly'
                      ? (monthlyDisplayType === 'accumulated' ? 'Valores Acumulados no Ano' : 'Valores do Mês')
                      : financialChartMode === 'semester'
                        ? (semesterDisplayType === 'accumulated' ? 'Evolução Acumulada no Semestre' : 'Valores Mês a Mês')
                        : (annualDisplayType === 'accumulated' ? 'Evolução Acumulada Anual' : 'Valores Mês a Mês')}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[10.5px] text-slate-500 font-medium mt-0.5">
                  {financialChartMode === 'monthly'
                    ? (monthlyChartScope === 'trio'
                        ? `Comparando ${delinquencyMonthlyData.comparison.prevMonth?.monthShort || '---'} (M-1), ${delinquencyMonthlyData.comparison.selectedMonth.monthShort} (Foco) e ${delinquencyMonthlyData.comparison.nextMonth?.monthShort || '---'} (M+1)`
                        : `Visão geral dos 12 meses de ${delinquencyYear} com o mês de ${delinquencyMonthlyData.comparison.selectedMonth.monthName} em foco`)
                    : financialChartMode === 'semester'
                      ? `Evolução das contribuições no ${delinquencyMonthlyData.activeSemesterSummary.periodLabel} de ${delinquencyYear}`
                      : `Resultado detalhado das 12 competências do exercício ${delinquencyYear}`}
                </p>
              </div>

              {/* Controles do Gráfico de Barras reunidos */}
              <div className="flex items-center flex-wrap gap-2 self-start md:self-auto shrink-0">
                {/* 1. Escopo das Barras (apenas modo mensal) */}
                {financialChartMode === 'monthly' && (
                  <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[9.5px] font-bold text-slate-400 px-1 uppercase tracking-wider hidden sm:inline">Escopo:</span>
                    <button
                      type="button"
                      onClick={() => setMonthlyChartScope('trio')}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                        monthlyChartScope === 'trio'
                          ? "bg-white text-blue-900 shadow-2xs font-extrabold"
                          : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      3 Meses (Foco)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyChartScope('all')}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                        monthlyChartScope === 'all'
                          ? "bg-white text-blue-900 shadow-2xs font-extrabold"
                          : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      12 Meses
                    </button>
                  </div>
                )}

                {/* 2. Alternador de Mês a Mês vs Acumulado */}
                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-slate-400 px-1 uppercase tracking-wider hidden sm:inline">Barras:</span>
                  {financialChartMode === 'monthly' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMonthlyDisplayType('regular')}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                          monthlyDisplayType === 'regular'
                            ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Mês a Mês
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonthlyDisplayType('accumulated')}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                          monthlyDisplayType === 'accumulated'
                            ? "bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Acumulado no Ano
                      </button>
                    </>
                  )}
                  {financialChartMode === 'semester' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSemesterDisplayType('regular')}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                          semesterDisplayType === 'regular'
                            ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Valores Mês a Mês
                      </button>
                      <button
                        type="button"
                        onClick={() => setSemesterDisplayType('accumulated')}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                          semesterDisplayType === 'accumulated'
                            ? "bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Acumulado no Semestre
                      </button>
                    </>
                  )}
                  {financialChartMode === 'annual' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAnnualDisplayType('regular')}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                          annualDisplayType === 'regular'
                            ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Valores Mês a Mês
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnnualDisplayType('accumulated')}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer",
                          annualDisplayType === 'accumulated'
                            ? "bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Evolução Acumulada
                      </button>
                    </>
                  )}
                </div>

                <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                  Valores em R$ (Reais)
                </span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={
                  financialChartMode === 'monthly'
                    ? delinquencyMonthlyData.monthlyChartPoints
                    : financialChartMode === 'semester'
                      ? delinquencyMonthlyData.activeSemesterSummary.chartPoints
                      : delinquencyMonthlyData.annualChartPoints
                }
                margin={{ top: 15, right: 15, left: -5, bottom: 5 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length) {
                    const mNum = e.activePayload[0].payload?.monthNum;
                    if (mNum) {
                      setSelectedComparisonMonth(mNum);
                    }
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="displayLabel"
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                  interval={0}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v) => v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : `R$${v}`}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3 rounded-xl shadow-2xl border border-slate-700/80 text-xs min-w-[260px]">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5 mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white text-[13px]">{data.monthName} / {delinquencyYear}</span>
                              {data.isSelected && (
                                <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">FOCO</span>
                              )}
                            </div>
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                              data.isCurrent
                                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                : data.isPast
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : "bg-slate-700 text-slate-300"
                            )}>
                              {data.isCurrent ? 'Mês Atual' : data.isPast ? 'Encerrado' : 'A Vencer'}
                            </span>
                          </div>

                          <div className="space-y-1.5 text-slate-300 text-[11px]">
                            {/* Previsto */}
                            <div className="flex justify-between items-center gap-3">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 shrink-0" />
                                <span>Previsto (A Receber):</span>
                              </span>
                              <span className="font-bold text-blue-300">{formatCurrency(data.previstoDisplay)}</span>
                            </div>

                            {/* Realizado */}
                            <div className="flex justify-between items-center gap-3">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" />
                                <span>Realizado (Recebido):</span>
                              </span>
                              <span className="font-bold text-emerald-400">{formatCurrency(data.realizadoDisplay)}</span>
                            </div>

                            {/* Saldo da Diferença */}
                            <div className="flex justify-between items-center gap-3">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" />
                                <span>Saldo da Diferença:</span>
                              </span>
                              <span className={cn(
                                "font-bold",
                                data.saldoDisplay > 0 ? "text-amber-400" : "text-emerald-400"
                              )}>
                                {formatCurrency(data.saldoDisplay)}
                              </span>
                            </div>

                            {/* Taxa de Efetivação */}
                            <div className="pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Taxa de Realização:</span>
                              <span className="font-black px-1.5 py-0.5 rounded text-[10px] text-emerald-400 bg-emerald-950/60">
                                {data.rateDisplay}%
                              </span>
                            </div>

                            {(monthlyDisplayType === 'accumulated' || semesterDisplayType === 'accumulated' || annualDisplayType === 'accumulated') && (
                              <div className="pt-1.5 border-t border-slate-700/40 text-[9.5px] text-slate-400 leading-tight">
                                Valores pontuais do mês: Previsto {formatCurrency(data.monthPrevisto)} | Realizado {formatCurrency(data.monthRealizado)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontWeight: 600 }}
                />
                <Bar
                  dataKey="previstoDisplay"
                  name="Previsto (A Receber)"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={financialChartMode === 'monthly' && monthlyChartScope === 'trio' ? 48 : 28}
                />
                <Bar
                  dataKey="realizadoDisplay"
                  name="Realizado (Recebido)"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={financialChartMode === 'monthly' && monthlyChartScope === 'trio' ? 48 : 28}
                />
                <Bar
                  dataKey="saldoDisplay"
                  name="Saldo da Diferença"
                  fill="#d97706"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={financialChartMode === 'monthly' && monthlyChartScope === 'trio' ? 48 : 28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ========================================================
              TABELAS E DEMONSTRATIVOS AUXILIARES CONFORME A MODALIDADE
             ======================================================== */}
          {/* Demonstrativo Semestral (Tabela dos 6 Meses) */}
          {financialChartMode === 'semester' && (
            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-slate-100/80 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Demonstrativo Mês a Mês do {delinquencyMonthlyData.activeSemesterSummary.title}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {delinquencyMonthlyData.activeSemesterSummary.periodLabel} / {delinquencyYear}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Mês</th>
                      <th className="py-2 px-3 text-right">Previsto (A Receber)</th>
                      <th className="py-2 px-3 text-right">Realizado (Recebido)</th>
                      <th className="py-2 px-3 text-right">Saldo da Diferença</th>
                      <th className="py-2 px-3 text-center">Efetivação (%)</th>
                      <th className="py-2 px-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {delinquencyMonthlyData.activeSemesterSummary.basePoints.map((p: any) => (
                      <tr key={p.monthNum} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{p.monthName}</span>
                          {p.isCurrent && (
                            <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.2 rounded font-bold">Atual</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-blue-900">{formatCurrency(p.monthPrevisto)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatCurrency(p.monthRealizado)}</td>
                        <td className={cn(
                          "py-2 px-3 text-right font-bold",
                          p.monthSaldo > 0 ? "text-amber-700" : "text-emerald-700"
                        )}>
                          {formatCurrency(p.monthSaldo)}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-slate-700">{p.rateRealizado}%</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedComparisonMonth(p.monthNum);
                              setFinancialChartMode('monthly');
                            }}
                            className="text-[10px] text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer"
                          >
                            Ver no Mensal
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black text-xs text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td className="py-2.5 px-3 uppercase">Total do Semestre</td>
                      <td className="py-2.5 px-3 text-right text-blue-950">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-950">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado)}</td>
                      <td className={cn(
                        "py-2.5 px-3 text-right",
                        delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? "text-amber-900" : "text-emerald-900"
                      )}>
                        {formatCurrency(delinquencyMonthlyData.activeSemesterSummary.saldo)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-900">{delinquencyMonthlyData.activeSemesterSummary.rateRealizado}%</td>
                      <td className="py-2.5 px-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Demonstrativo Anual (Tabela Completa de 12 Meses) */}
          {financialChartMode === 'annual' && (
            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-slate-100/80 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Demonstrativo Consolidado dos 12 Meses do Exercício
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Ano Letivo {delinquencyYear}
                </span>
              </div>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 shadow-2xs">
                    <tr>
                      <th className="py-2 px-3">Mês</th>
                      <th className="py-2 px-3 text-right">Previsto (A Receber)</th>
                      <th className="py-2 px-3 text-right">Realizado (Recebido)</th>
                      <th className="py-2 px-3 text-right">Saldo da Diferença</th>
                      <th className="py-2 px-3 text-center">Efetivação (%)</th>
                      <th className="py-2 px-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {delinquencyMonthlyData.monthlyPoints.map((p: any) => (
                      <tr key={p.monthNum} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{p.monthName}</span>
                          {p.isCurrent && (
                            <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.2 rounded font-bold">Atual</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-blue-900">{formatCurrency(p.monthPrevisto)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatCurrency(p.monthRealizado)}</td>
                        <td className={cn(
                          "py-2 px-3 text-right font-bold",
                          p.monthSaldo > 0 ? "text-amber-700" : "text-emerald-700"
                        )}>
                          {formatCurrency(p.monthSaldo)}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-slate-700">{p.rateRealizado}%</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedComparisonMonth(p.monthNum);
                              setFinancialChartMode('monthly');
                            }}
                            className="text-[10px] text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer"
                          >
                            Ver no Mensal
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-black text-xs text-white sticky bottom-0">
                    <tr>
                      <td className="py-2.5 px-3 uppercase text-slate-200">TOTAL GERAL ANUAL</td>
                      <td className="py-2.5 px-3 text-right text-blue-300">{formatCurrency(delinquencyMonthlyData.annual.previsto)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{formatCurrency(delinquencyMonthlyData.annual.realizado)}</td>
                      <td className={cn(
                        "py-2.5 px-3 text-right",
                        delinquencyMonthlyData.annual.saldo > 0 ? "text-amber-400" : "text-emerald-400"
                      )}>
                        {formatCurrency(delinquencyMonthlyData.annual.saldo)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-white">{delinquencyMonthlyData.annual.rateRealizado}%</td>
                      <td className="py-2.5 px-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Card Previsto vs Realizado com Atalhos */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <span className="leading-tight text-[11px]">
            {financialChartMode === 'monthly'
              ? '* Modo Mensal: acompanhe os lançamentos do mês em foco e compare com o mês anterior e posterior.'
              : financialChartMode === 'semester'
                ? '* Modo Semestral: visão analítica do 1º ou 2º semestre letivo com valores previstos, arrecadados e saldo pendente.'
                : '* Modo Anual: consolidação das 12 competências do exercício letivo com taxas de efetivação e metas.'}
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/contributions', { state: { viewMode: 'individual', tab: 'individual' } })}
              className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>Lançamentos</span>
              <ArrowRight size={11} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/financial-report')}
              className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>Relatório Detalhado</span>
              <ArrowRight size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
