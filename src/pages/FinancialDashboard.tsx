import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  Printer,
  Users,
  CheckCircle2,
  AlertCircle,
  Bell,
  MessageCircle,
  Mail,
  Send,
  Copy,
  Check,
  ExternalLink,
  X,
  Search,
  Filter,
  RotateCcw,
  Sparkles,
  CheckSquare,
  Square,
  Play,
  SkipForward,
  ListChecks,
  UserCheck,
  SendHorizontal,
  ShieldCheck,
  Info,
  AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell
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

function formatPeriodsList(labels: string[]): string {
  if (!labels || labels.length === 0) return 'nenhuma pendência';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1).join(', ');
  return `${rest} e ${last}`;
}

const DEFAULT_ALL_PERIODS_WHATSAPP_TEMPLATE =
  'Olá, {NOME}! Paz e Bem. Lembramos cordialmente que na Escola Diocesana de Ministério (Turma: {TURMA}) constam em aberto {QTD_PERIODOS} contribuição(ões) ({PERIODOS_ABERTO}), totalizando o valor de {VALOR_TOTAL}. Caso já tenha realizado o pagamento via Pix ou transferência bancária, por favor desconsidere este aviso ou nos envie o comprovante. Para quaisquer dúvidas, estamos à disposição na secretaria.';

const DEFAULT_ALL_PERIODS_EMAIL_SUBJECT =
  'Escola Diocesana - Lembrete de Regularização de Contribuições ({QTD_PERIODOS} em aberto)';

const DEFAULT_SINGLE_MONTH_WHATSAPP_TEMPLATE =
  'Olá, {NOME}! Paz e Bem. Lembramos cordialmente que a contribuição de {MES}/{ANO} da Escola Diocesana de Ministério (Turma: {TURMA}) no valor de {VALOR} consta em aberto. Caso já tenha realizado o pagamento via Pix ou transferência bancária, por favor desconsidere este aviso ou nos envie o comprovante. Para quaisquer dúvidas, estamos à disposição na secretaria.';

const DEFAULT_SINGLE_MONTH_EMAIL_SUBJECT =
  'Escola Diocesana - Lembrete da Contribuição de {MES}/{ANO}';

const DEFAULT_COLLECTIVE_EMAIL_BODY =
  'Prezados alunos e alunas da Escola Diocesana de Ministério,\n\nPaz e Bem!\n\nEntramos em contato cordialmente para solicitar a conferência e regularização das contribuições/mensalidades em aberto do exercício letivo de {ANO}. Caso já tenha efetuado o pagamento via Pix ou transferência bancária recentemente, por favor desconsidere este comunicado ou nos envie o respectivo comprovante.\n\nPara consultar o demonstrativo detalhado de competências e regularizar a situação acadêmica, nossa secretaria permanece à inteira disposição.\n\nFraternalmente,\nSecretaria da Escola Diocesana de Ministério';

const DEFAULT_COLLECTIVE_EMAIL_SUBJECT =
  'Escola Diocesana de Ministério - Comunicado de Regularização de Contribuições Letivas';

const DEFAULT_CLASS_GROUP_WHATSAPP_ANNOUNCEMENT =
  '📢 *COMUNICADO DA SECRETARIA - ESCOLA DIOCESANA*\n\nPrezados alunos da turma *{TURMA}*,\n\nPaz e Bem! Solicitamos a gentileza de conferir a regularização de suas contribuições/mensalidades letivas de {ANO} junto à secretaria acadêmica. Caso já tenha realizado o pagamento via Pix ou transferência recentemente, favor encaminhar o comprovante para a baixa no sistema.\n\nContamos com a fraterna colaboração de todos!\n\n_Secretaria da Escola Diocesana de Ministério_';

export interface PhoneValidationResult {
  isValid: boolean;
  isWarning: boolean;
  status: 'valid' | 'warning' | 'invalid';
  reason: string;
  formattedDisplay: string;
  whatsappNumber: string;
  digits: string;
}

export function validateWhatsAppPhone(rawPhone: string | null | undefined): PhoneValidationResult {
  if (!rawPhone || !String(rawPhone).trim()) {
    return {
      isValid: false,
      isWarning: false,
      status: 'invalid',
      reason: 'Telefone ausente / não cadastrado',
      formattedDisplay: 'Não informado',
      whatsappNumber: '',
      digits: ''
    };
  }

  const str = String(rawPhone).trim();
  let digits = str.replace(/\D/g, '');

  // Remove prefixo 55 se já existir em números de 12 ou 13 dígitos
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Remove zero à esquerda no DDD (ex: 011...)
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  if (digits.length < 10) {
    return {
      isValid: false,
      isWarning: false,
      status: 'invalid',
      reason: `Número incompleto (${digits.length} dígitos)`,
      formattedDisplay: str,
      whatsappNumber: '',
      digits
    };
  }

  if (digits.length > 11) {
    return {
      isValid: false,
      isWarning: false,
      status: 'invalid',
      reason: `Excesso de dígitos (${digits.length} dígitos)`,
      formattedDisplay: str,
      whatsappNumber: '',
      digits
    };
  }

  const dddNum = parseInt(digits.slice(0, 2), 10);
  if (isNaN(dddNum) || dddNum < 11 || dddNum > 99) {
    return {
      isValid: false,
      isWarning: false,
      status: 'invalid',
      reason: `DDD inválido (${digits.slice(0, 2)})`,
      formattedDisplay: str,
      whatsappNumber: '',
      digits
    };
  }

  const phoneBody = digits.slice(2);
  if (/^(\d)\1+$/.test(phoneBody)) {
    return {
      isValid: false,
      isWarning: false,
      status: 'invalid',
      reason: 'Número repetido / teste',
      formattedDisplay: str,
      whatsappNumber: '',
      digits
    };
  }

  if (digits.length === 11) {
    const ninthDigit = digits[2];
    if (ninthDigit !== '9') {
      return {
        isValid: true,
        isWarning: true,
        status: 'warning',
        reason: 'Celular sem dígito 9 (pode falhar)',
        formattedDisplay: `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`,
        whatsappNumber: `55${digits}`,
        digits
      };
    }

    return {
      isValid: true,
      isWarning: false,
      status: 'valid',
      reason: 'Celular válido para WhatsApp',
      formattedDisplay: `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`,
      whatsappNumber: `55${digits}`,
      digits
    };
  }

  // 10 dígitos (Fixo ou Celular antigo)
  return {
    isValid: true,
    isWarning: true,
    status: 'warning',
    reason: '10 dígitos (Fixo ou sem 9)',
    formattedDisplay: `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`,
    whatsappNumber: `55${digits}`,
    digits
  };
}

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

  // Controles do Modal de Notificação de Inadimplência
  const [showNotificationModal, setShowNotificationModal] = useState<boolean>(false);
  const [notificationViewMode, setNotificationViewMode] = useState<'classes' | 'individual'>('classes');
  const [notificationClassGroupFilter, setNotificationClassGroupFilter] = useState<string>('all');
  const [notificationSearch, setNotificationSearch] = useState<string>('');
  const [notificationChannelTab, setNotificationChannelTab] = useState<'whatsapp' | 'email'>('whatsapp');
  const [notificationDebtScope, setNotificationDebtScope] = useState<'all_due' | 'selected_month' | 'all_year'>('all_due');
  const [customWhatsappTemplate, setCustomWhatsappTemplate] = useState<string>(DEFAULT_ALL_PERIODS_WHATSAPP_TEMPLATE);
  const [customEmailSubject, setCustomEmailSubject] = useState<string>(DEFAULT_ALL_PERIODS_EMAIL_SUBJECT);
  const [customCollectiveEmailBody, setCustomCollectiveEmailBody] = useState<string>(DEFAULT_COLLECTIVE_EMAIL_BODY);
  const [customCollectiveEmailSubject, setCustomCollectiveEmailSubject] = useState<string>(DEFAULT_COLLECTIVE_EMAIL_SUBJECT);
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [batchCopiedFeedback, setBatchCopiedFeedback] = useState<string | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState<boolean>(false);

  // Seleção múltipla para disparo em lote
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Assistente de Fila Sequencial para WhatsApp
  const [isQueueActive, setIsQueueActive] = useState<boolean>(false);
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [sentStudentIds, setSentStudentIds] = useState<Set<string>>(new Set());
  const [activeQueueGroupTitle, setActiveQueueGroupTitle] = useState<string>('');
  const [activeQueueStudentsOverride, setActiveQueueStudentsOverride] = useState<any[] | null>(null);

  // Central de Notificações WhatsApp por Turma (Módulo Unificado)
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [selectedValidationClassId, setSelectedValidationClassId] = useState<string>('all');
  const [validationTargetGroup, setValidationTargetGroup] = useState<any | null>(null);
  const [validatedContacts, setValidatedContacts] = useState<any[]>([]);
  const [validationFilter, setValidationFilter] = useState<'all' | 'valid' | 'warning' | 'invalid' | 'selected'>('all');
  const [validationSearch, setValidationSearch] = useState<string>('');
  const validationListRef = useRef<HTMLDivElement | null>(null);

  // Registro mensal persistente de mensagens disparadas por aluno pelo sistema
  const [monthlyNotificationLog, setMonthlyNotificationLog] = useState<Record<string, { count: number; lastSentAt: string }>>(() => {
    try {
      const now = new Date();
      const storageKey = `diocese_notif_log_${now.getFullYear()}_${now.getMonth() + 1}`;
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const registerStudentMessageSent = (studentId: string) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const fullStamp = `${dateStr} às ${timeStr}`;
    const storageKey = `diocese_notif_log_${now.getFullYear()}_${now.getMonth() + 1}`;

    setMonthlyNotificationLog(prev => {
      const current = prev[studentId] || { count: 0, lastSentAt: '' };
      const updated = {
        ...prev,
        [studentId]: {
          count: (current.count || 0) + 1,
          lastSentAt: fullStamp
        }
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // storage fallback
      }
      return updated;
    });

    setSentStudentIds(prev => new Set(prev).add(studentId));
  };

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

      const paidMonths = studentContribs
        .filter(c => Number(c.amount) > 0 || c.is_waived)
        .map(c => Number(c.reference_month));
      const plan = getStudentContributionPlan(student, studentClass, targetYear, paidMonths, activeAcad);

      return {
        student,
        studentClass,
        fee,
        plan,
        paidMonths,
        studentContribs
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

    // Métricas de Alunos em Dia e Inadimplência do Mês Selecionado
    const targetMonthNum = selectedMonth.monthNum;
    const payingStudentIdsInSelectedMonth = new Set<string>();
    relevantContributions.forEach(c => {
      let m = Number(c.reference_month);
      if (m === undefined || isNaN(m)) {
        if (c.payment_date) {
          const d = new Date(c.payment_date);
          if (!isNaN(d.getTime())) m = d.getMonth() + 1;
        }
      }
      const matchesMonth = targetMonthNum === 1 ? (m === 1 || m === 0) : m === targetMonthNum;
      if (matchesMonth && c.student_id && (Number(c.amount) > 0 || c.is_waived)) {
        payingStudentIdsInSelectedMonth.add(c.student_id);
      }
    });

    const totalActiveStudents = targetStudents.length;
    const alunosEmDiaCount = payingStudentIdsInSelectedMonth.size;
    const alunosInadimplentesCount = Math.max(0, totalActiveStudents - alunosEmDiaCount);
    const taxaAdimplenciaAlunos = totalActiveStudents > 0 
      ? Number(((alunosEmDiaCount / totalActiveStudents) * 100).toFixed(1))
      : 0;
    const taxaInadimplenciaAlunos = totalActiveStudents > 0
      ? Number((100 - taxaAdimplenciaAlunos).toFixed(1))
      : 0;

    // Relação enriquecida de alunos com mapeamento de todos os períodos em aberto e vencidos
    const enrichedStudentsList = studentPlans.map(({ student, studentClass, fee, plan, paidMonths }) => {
      const rawPhone = student.phone_mobile || student.phone_residential || student.phone_commercial || (student as any).phone || '';
      const digits = rawPhone.replace(/\D/g, '');
      let whatsappNumber = digits;
      if (digits.length === 10 || digits.length === 11) {
        whatsappNumber = `55${digits}`;
      }

      // 1. Todos os períodos acadêmicos em aberto no ano letivo
      const allOpenPeriodNumbers = plan.expectedPeriods.filter(p => !paidMonths.includes(p));

      // 2. Períodos vencidos até o momento atual
      const dueOpenPeriodNumbers = allOpenPeriodNumbers.filter(p => {
        if (!isCurrentYear) return targetYear < currentYear;
        if (p === 0) return true; // Matrícula
        return p <= currentMonth;
      });

      // 3. Pendente no mês selecionado em foco
      const isPendingInSelectedMonth = (
        !payingStudentIdsInSelectedMonth.has(student.id) &&
        (targetMonthNum === 1
          ? (plan.expectedPeriods.includes(0) || plan.expectedPeriods.includes(1))
          : plan.expectedPeriods.includes(targetMonthNum))
      );

      const getPeriodLabel = (p: number) => (p === 0 ? 'Matrícula' : `${MONTH_NAMES_LIST[p - 1]}/${targetYear}`);
      const getPeriodShort = (p: number) => (p === 0 ? 'Matr.' : `${MONTH_SHORT_LABELS[p - 1]}`);

      const allOpenPeriodLabels = allOpenPeriodNumbers.map(getPeriodLabel);
      const allOpenPeriodShorts = allOpenPeriodNumbers.map(getPeriodShort);

      const dueOpenPeriodLabels = dueOpenPeriodNumbers.map(getPeriodLabel);
      const dueOpenPeriodShorts = dueOpenPeriodNumbers.map(getPeriodShort);

      return {
        id: student.id,
        name: student.name,
        registration_number: student.registration_number,
        email: student.email || '',
        phone: rawPhone || '',
        whatsappNumber: digits.length >= 10 ? whatsappNumber : '',
        hasWhatsapp: digits.length >= 10,
        hasEmail: Boolean(student.email && student.email.includes('@')),
        className: studentClass?.name || 'Turma não atribuída',
        classId: studentClass?.id,
        fee: fee || 0,
        paidMonths,
        isPendingInSelectedMonth,
        allOpenPeriodNumbers,
        allOpenPeriodLabels,
        allOpenPeriodShorts,
        allOpenPeriodsFormatted: formatPeriodsList(allOpenPeriodLabels),
        allOpenTotalAmount: allOpenPeriodNumbers.length * (fee || 0),
        dueOpenPeriodNumbers,
        dueOpenPeriodLabels,
        dueOpenPeriodShorts,
        dueOpenPeriodsFormatted: formatPeriodsList(dueOpenPeriodLabels),
        dueOpenTotalAmount: dueOpenPeriodNumbers.length * (fee || 0)
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const pendingStudentsList = enrichedStudentsList.filter(s => s.isPendingInSelectedMonth);
    const allDuePendingStudentsList = enrichedStudentsList.filter(s => s.dueOpenPeriodNumbers.length > 0);
    const allYearPendingStudentsList = enrichedStudentsList.filter(s => s.allOpenPeriodNumbers.length > 0);

    const monthlyHistoryBars = monthlyPoints.map(p => ({
      month: p.monthShort,
      fullName: p.monthName,
      realizado: p.monthRealizado,
      previsto: p.monthPrevisto,
      isCurrent: p.isCurrent,
      isSelected: p.monthNum === targetMonthNum
    }));

    return {
      monthlyPoints,
      annualChartPoints,
      sem1ChartPoints,
      sem2ChartPoints,
      activeSemesterSummary,
      monthlyChartPoints,
      trioPoints,
      alunosEmDiaCount,
      alunosInadimplentesCount,
      taxaAdimplenciaAlunos,
      taxaInadimplenciaAlunos,
      totalActiveStudents,
      monthlyHistoryBars,
      pendingStudentsList,
      allDuePendingStudentsList,
      allYearPendingStudentsList,
      enrichedStudentsList,
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

  // Lista ativa de alunos inadimplentes conforme o escopo de débitos escolhido
  const activeScopeStudents = useMemo(() => {
    if (notificationDebtScope === 'all_due') {
      return delinquencyMonthlyData.allDuePendingStudentsList || [];
    }
    if (notificationDebtScope === 'all_year') {
      return delinquencyMonthlyData.allYearPendingStudentsList || [];
    }
    return delinquencyMonthlyData.pendingStudentsList || [];
  }, [delinquencyMonthlyData, notificationDebtScope]);

  // Agrupamento dos alunos inadimplentes por Turma / Grupo
  const classGroups = useMemo(() => {
    const map = new Map<string, {
      classId: string;
      className: string;
      classCode?: string;
      students: any[];
      totalDebtAmount: number;
      totalWhatsAppCount: number;
      totalEmailCount: number;
    }>();

    activeScopeStudents.forEach(student => {
      const cId = student.classId || 'sem_turma';
      const cName = student.className || 'Turma não atribuída';
      
      if (!map.has(cId)) {
        const foundClass = classes.find(c => c.id === cId);
        map.set(cId, {
          classId: cId,
          className: cName,
          classCode: foundClass?.code || '',
          students: [],
          totalDebtAmount: 0,
          totalWhatsAppCount: 0,
          totalEmailCount: 0
        });
      }

      const group = map.get(cId)!;
      group.students.push(student);
      
      const debt = notificationDebtScope === 'selected_month'
        ? student.fee
        : (notificationDebtScope === 'all_year' ? student.allOpenTotalAmount : student.dueOpenTotalAmount) || student.fee;
      
      group.totalDebtAmount += debt;
      if (student.hasWhatsapp) group.totalWhatsAppCount += 1;
      if (student.hasEmail) group.totalEmailCount += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.students.length - a.students.length);
  }, [activeScopeStudents, classes, notificationDebtScope]);

  // Turma atualmente carregada em foco (se houver)
  const activeLoadedClassGroup = useMemo(() => {
    if (notificationClassGroupFilter === 'all') return null;
    return classGroups.find(g => g.classId === notificationClassGroupFilter) || null;
  }, [classGroups, notificationClassGroupFilter]);

  // Alunos individuais filtrados pela turma e barra de busca
  // Regra solicitada: não carregar todos os 98 alunos de uma vez!
  // Carrega apenas quando uma turma específica for selecionada ou quando houver busca nominal digitada.
  const filteredPendingStudents = useMemo(() => {
    const query = notificationSearch.trim().toLowerCase();

    // 1. Se uma turma específica foi selecionada para carregar
    if (notificationClassGroupFilter !== 'all') {
      const classStudents = activeScopeStudents.filter(s => s.classId === notificationClassGroupFilter);
      if (!query) return classStudents;
      return classStudents.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.registration_number.toLowerCase().includes(query) ||
        s.className.toLowerCase().includes(query)
      );
    }

    // 2. Se nenhuma turma foi selecionada, mas o usuário digitou uma busca por nome ou RA
    if (query) {
      return activeScopeStudents.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.registration_number.toLowerCase().includes(query) ||
        s.className.toLowerCase().includes(query)
      );
    }

    // 3. Nenhuma turma selecionada e nenhuma busca: retorna vazio para não despejar todos os alunos
    return [];
  }, [activeScopeStudents, notificationClassGroupFilter, notificationSearch]);

  // Total acumulado em aberto no escopo ativo
  const totalPendingAmount = useMemo(() => {
    return activeScopeStudents.reduce((sum, s) => {
      if (notificationDebtScope === 'all_due') return sum + (s.dueOpenTotalAmount || s.fee);
      if (notificationDebtScope === 'all_year') return sum + (s.allOpenTotalAmount || s.fee);
      return sum + s.fee;
    }, 0);
  }, [activeScopeStudents, notificationDebtScope]);

  // Sincroniza a seleção quando a turma carregada ou os alunos mudam
  useEffect(() => {
    if (filteredPendingStudents.length > 0) {
      setSelectedStudentIds(new Set(filteredPendingStudents.map(s => s.id)));
    } else {
      setSelectedStudentIds(new Set());
    }
    setIsQueueActive(false);
    setQueueIndex(0);
    setActiveQueueStudentsOverride(null);
  }, [notificationClassGroupFilter, activeScopeStudents]);

  const handleSelectClassToLoad = (classId: string) => {
    setNotificationClassGroupFilter(classId);
    setNotificationViewMode('individual');
    setNotificationSearch('');
    const classStudents = activeScopeStudents.filter(s => s.classId === classId);
    setSelectedStudentIds(new Set(classStudents.map(s => s.id)));
  };

  const handleClearClassFilter = () => {
    setNotificationClassGroupFilter('all');
    setNotificationSearch('');
    setSelectedStudentIds(new Set());
  };

  // Gerador de Mensagem Personalizada com suporte a todos os períodos em aberto
  const generateStudentMessage = (student: any, template: string) => {
    const selectedMonth = delinquencyMonthlyData.comparison.selectedMonth;

    let periodosTexto = '';
    let qtdPeriodos = '1';
    let valorTotal = formatCurrency(student.fee);

    if (notificationDebtScope === 'all_due') {
      periodosTexto = student.dueOpenPeriodsFormatted || `${selectedMonth.monthName} de ${delinquencyYear}`;
      qtdPeriodos = String(student.dueOpenPeriodNumbers?.length || 1);
      valorTotal = formatCurrency(student.dueOpenTotalAmount || student.fee);
    } else if (notificationDebtScope === 'all_year') {
      periodosTexto = student.allOpenPeriodsFormatted || `${selectedMonth.monthName} de ${delinquencyYear}`;
      qtdPeriodos = String(student.allOpenPeriodNumbers?.length || 1);
      valorTotal = formatCurrency(student.allOpenTotalAmount || student.fee);
    } else {
      periodosTexto = `${selectedMonth.monthName} de ${delinquencyYear}`;
      qtdPeriodos = '1';
      valorTotal = formatCurrency(student.fee);
    }

    return template
      .replace(/{NOME}/g, student.name || 'Aluno(a)')
      .replace(/{MES}/g, selectedMonth.monthName)
      .replace(/{ANO}/g, String(delinquencyYear))
      .replace(/{VALOR}/g, formatCurrency(student.fee))
      .replace(/{VALOR_TOTAL}/g, valorTotal)
      .replace(/{TURMA}/g, student.className || 'Escola Diocesana')
      .replace(/{PERIODOS_ABERTO}/g, periodosTexto)
      .replace(/{QTD_PERIODOS}/g, qtdPeriodos);
  };

  const handleToggleSelectAll = () => {
    if (selectedStudentIds.size === filteredPendingStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredPendingStudents.map(s => s.id)));
    }
  };

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Disparo de E-mail Coletivo em Lote (CCO para todos os alunos selecionados)
  const handleTriggerCollectiveEmail = () => {
    const selectedStudents = activeScopeStudents.filter(s => selectedStudentIds.has(s.id) && s.hasEmail);
    if (selectedStudents.length === 0) return;
    const emails = selectedStudents.map(s => s.email).filter(Boolean);
    const body = customCollectiveEmailBody.replace(/{ANO}/g, String(delinquencyYear));
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(customCollectiveEmailSubject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    setBatchCopiedFeedback('collective_email');
    setTimeout(() => setBatchCopiedFeedback(null), 3500);
  };

  // Disparo de E-mail Coletivo de uma Turma Específica
  const handleTriggerCollectiveEmailForClass = (group: any) => {
    const classEmails = group.students.filter((s: any) => s.hasEmail).map((s: any) => s.email);
    if (classEmails.length === 0) return;
    const body = customCollectiveEmailBody.replace(/{ANO}/g, String(delinquencyYear));
    const subject = `${customCollectiveEmailSubject} - ${group.className}`;
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(classEmails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    setBatchCopiedFeedback('collective_email');
    setTimeout(() => setBatchCopiedFeedback(null), 3500);
  };

  // Carrega e valida contatos para a Central de Notificações WhatsApp por Turma
  const loadValidationContactsForClass = (
    classId: string,
    currentDebtScope: 'all_due' | 'selected_month' | 'all_year' = notificationDebtScope
  ) => {
    setSelectedValidationClassId(classId);
    const baseStudents = currentDebtScope === 'all_due'
      ? (delinquencyMonthlyData.allDuePendingStudentsList || [])
      : currentDebtScope === 'all_year'
      ? (delinquencyMonthlyData.allYearPendingStudentsList || [])
      : (delinquencyMonthlyData.pendingStudentsList || []);

    const studentsPool = classId === 'all'
      ? baseStudents
      : baseStudents.filter(s => s.classId === classId);

    let autoSelectedCount = 0;
    const contacts = studentsPool.map((student: any) => {
      const rawPhone = student.phone || student.phone_mobile || student.phone_residential || '';
      const val = validateWhatsAppPhone(rawPhone);
      // Auto-seleciona inicialmente até 5 contatos válidos (lote seguro anti-bloqueio)
      const shouldSelect = val.status !== 'invalid' && autoSelectedCount < 5;
      if (shouldSelect) autoSelectedCount++;
      return {
        student,
        rawPhone,
        ...val,
        isSelected: shouldSelect
      };
    });

    setValidatedContacts(contacts);
    setValidationFilter('all');
    setValidationSearch('');
  };

  // Abre diretamente a Central de Notificações WhatsApp por Turma
  const handleOpenWhatsAppCentral = (classId?: string) => {
    const chosenClass = classId || (classGroups.length > 0 ? classGroups[0].classId : 'all');
    loadValidationContactsForClass(chosenClass);
    setIsQueueActive(false);
    setQueueIndex(0);
    setActiveQueueStudentsOverride(null);
    setShowValidationModal(true);
  };

  const handleOpenContactValidation = (group: any) => {
    handleOpenWhatsAppCentral(group?.classId);
  };

  const handleToggleValidationContact = (studentId: string) => {
    setValidatedContacts(prev =>
      prev.map(c => (c.student.id === studentId ? { ...c, isSelected: !c.isSelected } : c))
    );
  };

  // Rola suavemente a lista do modal para exibir o primeiro contato selecionado
  const scrollToContactRow = (targetStudentId: string) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const container = validationListRef.current;
        if (!container) return;
        const targetEl = document.getElementById(`validation-contact-row-${targetStudentId}`);
        if (!targetEl) return;
        const containerRect = container.getBoundingClientRect();
        const elementRect = targetEl.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({
          top: Math.max(0, relativeTop - 12),
          behavior: 'smooth'
        });
      }, 40);
    });
  };

  // Seleciona os primeiros N alunos válidos (padrão: 5 para lote seguro) e rola para exibi-los
  const handleSelectSafeBatch = (batchSize: number = 5) => {
    let firstSelectedStudentId: string | null = null;
    let count = 0;
    setValidatedContacts(prev =>
      prev.map(c => {
        if (c.status === 'invalid') return { ...c, isSelected: false };
        if (count < batchSize) {
          count++;
          if (!firstSelectedStudentId) {
            firstSelectedStudentId = c.student.id;
          }
          return { ...c, isSelected: true };
        }
        return { ...c, isSelected: false };
      })
    );

    if (firstSelectedStudentId) {
      scrollToContactRow(firstSelectedStudentId);
    } else if (validationListRef.current) {
      validationListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Seleciona os próximos N alunos válidos seguintes e rola automaticamente para exibi-los sempre
  const handleSelectNextSafeBatch = (batchSize: number = 5) => {
    let firstSelectedStudentId: string | null = null;
    setValidatedContacts(prev => {
      const validIndices: number[] = [];
      prev.forEach((c, idx) => {
        if (c.status !== 'invalid') validIndices.push(idx);
      });

      if (validIndices.length === 0) return prev;

      const lastSelectedIndex = prev.reduce((last, c, idx) => (c.isSelected ? idx : last), -1);
      const nextCandidates = validIndices.filter(idx => idx > lastSelectedIndex);
      const targetIndicesArray = (nextCandidates.length > 0 ? nextCandidates : validIndices).slice(0, batchSize);
      const targetIndices = new Set(targetIndicesArray);

      if (targetIndicesArray.length > 0) {
        firstSelectedStudentId = prev[targetIndicesArray[0]]?.student?.id || null;
      }

      return prev.map((c, idx) => ({
        ...c,
        isSelected: targetIndices.has(idx)
      }));
    });

    if (firstSelectedStudentId) {
      scrollToContactRow(firstSelectedStudentId);
    }
  };

  const handleSelectAllValidInValidation = () => {
    setValidatedContacts(prev =>
      prev.map(c => ({
        ...c,
        isSelected: c.status !== 'invalid'
      }))
    );
  };

  const handleDeselectAllInValidation = () => {
    setValidatedContacts(prev =>
      prev.map(c => ({
        ...c,
        isSelected: false
      }))
    );
  };

  const handleConfirmValidationAndStartQueue = () => {
    const approvedStudents = validatedContacts
      .filter(c => c.isSelected && c.status !== 'invalid')
      .map(c => ({
        ...c.student,
        phone: c.formattedDisplay,
        whatsappNumber: c.whatsappNumber,
        hasWhatsapp: true
      }));

    if (approvedStudents.length === 0) return;

    setActiveQueueStudentsOverride(approvedStudents);
    const classTitle = selectedValidationClassId === 'all'
      ? 'Todas as Turmas'
      : (classGroups.find(g => g.classId === selectedValidationClassId)?.className || 'Turma');
    setActiveQueueGroupTitle(classTitle);
    setIsQueueActive(true);
    setQueueIndex(0);
  };

  // Disparo de Fila WhatsApp de uma Turma Específica (abre a conferência prévia)
  const handleStartQueueForClass = (group: any) => {
    handleOpenContactValidation(group);
  };

  // Alunos selecionados elegíveis para a fila de WhatsApp
  const selectedQueueStudents = useMemo(() => {
    if (activeQueueStudentsOverride) return activeQueueStudentsOverride;
    const baseList = filteredPendingStudents.length > 0 ? filteredPendingStudents : activeScopeStudents;
    return baseList.filter(s => selectedStudentIds.has(s.id) && s.hasWhatsapp);
  }, [filteredPendingStudents, activeScopeStudents, selectedStudentIds, activeQueueStudentsOverride]);

  // Aluno e URL do aluno atual na fila de disparo
  const currentQueueStudent = useMemo(() => {
    if (!isQueueActive || selectedQueueStudents.length === 0) return null;
    if (queueIndex < 0 || queueIndex >= selectedQueueStudents.length) return null;
    return selectedQueueStudents[queueIndex];
  }, [isQueueActive, selectedQueueStudents, queueIndex]);

  const currentQueueStudentMessage = useMemo(() => {
    if (!currentQueueStudent) return '';
    return generateStudentMessage(currentQueueStudent, customWhatsappTemplate);
  }, [currentQueueStudent, customWhatsappTemplate, notificationDebtScope, delinquencyYear]);

  const currentQueueWhatsappUrl = useMemo(() => {
    if (!currentQueueStudent?.whatsappNumber) return null;
    return `https://api.whatsapp.com/send?phone=${currentQueueStudent.whatsappNumber}&text=${encodeURIComponent(currentQueueStudentMessage)}`;
  }, [currentQueueStudent, currentQueueStudentMessage]);

  const handleStartQueue = () => {
    const studentsToValidate = selectedQueueStudents.length > 0
      ? selectedQueueStudents
      : (filteredPendingStudents.length > 0 ? filteredPendingStudents : activeScopeStudents);
    handleOpenContactValidation({
      className: activeLoadedClassGroup ? activeLoadedClassGroup.className : 'Alunos Selecionados',
      students: studentsToValidate
    });
  };

  const handleDirectWhatsAppClick = (student: any) => {
    registerStudentMessageSent(student.id);
  };

  // Copia o comunicado oficial da turma para colar diretamente no grupo de WhatsApp da turma
  const handleCopyClassGroupAnnouncement = async (group: any) => {
    const text = DEFAULT_CLASS_GROUP_WHATSAPP_ANNOUNCEMENT
      .replace(/{TURMA}/g, group.className)
      .replace(/{ANO}/g, String(delinquencyYear));
    try {
      await navigator.clipboard.writeText(text);
      setBatchCopiedFeedback(`group_announcement_${group.classId}`);
      setTimeout(() => setBatchCopiedFeedback(null), 3000);
    } catch {
      // fallback
    }
  };

  const handleCopyClassWhatsApp = async (group: any) => {
    const validPhones = group.students.filter((s: any) => s.phone).map((s: any) => s.phone);
    if (!validPhones.length) return;
    try {
      await navigator.clipboard.writeText(validPhones.join(', '));
      setBatchCopiedFeedback(`whatsapp_${group.classId}`);
      setTimeout(() => setBatchCopiedFeedback(null), 2500);
    } catch {
      // fallback
    }
  };

  const handleAdvanceCurrentQueue = () => {
    if (currentQueueStudent) {
      registerStudentMessageSent(currentQueueStudent.id);
    }

    if (queueIndex + 1 < selectedQueueStudents.length) {
      setQueueIndex(prev => prev + 1);
    } else {
      setIsQueueActive(false);
      setQueueIndex(0);
      setActiveQueueStudentsOverride(null);
    }
  };

  const handleSkipCurrentInQueue = () => {
    if (queueIndex + 1 < selectedQueueStudents.length) {
      setQueueIndex(prev => prev + 1);
    } else {
      setIsQueueActive(false);
      setQueueIndex(0);
      setActiveQueueStudentsOverride(null);
    }
  };

  const handleCloseQueue = () => {
    setIsQueueActive(false);
    setQueueIndex(0);
    setActiveQueueStudentsOverride(null);
  };

  const handleCopyMessage = async (student: any) => {
    const msg = generateStudentMessage(student, customWhatsappTemplate);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedStudentId(student.id);
      setTimeout(() => setCopiedStudentId(null), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyBatchWhatsApp = async () => {
    const validPhones = activeScopeStudents
      .filter(s => selectedStudentIds.has(s.id) && s.phone)
      .map(s => s.phone);
    if (!validPhones.length) return;
    try {
      await navigator.clipboard.writeText(validPhones.join(', '));
      setBatchCopiedFeedback('whatsapp');
      setTimeout(() => setBatchCopiedFeedback(null), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyBatchEmail = async () => {
    const validEmails = activeScopeStudents
      .filter(s => selectedStudentIds.has(s.id) && s.hasEmail)
      .map(s => s.email);
    if (!validEmails.length) return;
    try {
      await navigator.clipboard.writeText(validEmails.join(', '));
      setBatchCopiedFeedback('email');
      setTimeout(() => setBatchCopiedFeedback(null), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyBatchSummary = async () => {
    const list = activeScopeStudents.filter(s => selectedStudentIds.has(s.id));
    const selectedMonth = delinquencyMonthlyData.comparison.selectedMonth;
    const lines = list.map((s, idx) => {
      const periods = notificationDebtScope === 'selected_month'
        ? `${selectedMonth.monthName}/${delinquencyYear}`
        : (s.dueOpenPeriodsFormatted || s.allOpenPeriodsFormatted);
      const val = notificationDebtScope === 'selected_month'
        ? formatCurrency(s.fee)
        : formatCurrency(s.dueOpenTotalAmount || s.allOpenTotalAmount || s.fee);
      return `${idx + 1}. ${s.name} (RA: ${s.registration_number}) - Turma: ${s.className} - Períodos: [${periods}] - Total: ${val} | Tel: ${s.phone || 'Sem telefone'} | E-mail: ${s.email || 'Sem e-mail'}`;
    });

    const summaryText = `RELATÓRIO DE REGULARIZAÇÃO FINANCEIRA\nCompetência/Exercício: ${delinquencyYear}\nAlunos Selecionados: ${list.length}\nValor Total Acumulado: ${formatCurrency(totalPendingAmount)}\n\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(summaryText);
      setBatchCopiedFeedback('summary');
      setTimeout(() => setBatchCopiedFeedback(null), 2500);
    } catch {
      // fallback
    }
  };

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
    <div className="space-y-3 sm:space-y-3.5">
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

      {/* Cards de Métricas Reais de Inadimplência e Faturamento Mensal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Card 1: Alunos em Dia */}
        <div className="rounded-xl p-3 sm:p-3.5 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-xs border border-emerald-500/40 relative overflow-hidden group">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-100 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shrink-0"></span>
              Alunos em Dia
            </span>
            <div className="w-6.5 h-6.5 rounded-lg bg-white/10 flex items-center justify-center text-emerald-100 group-hover:scale-110 transition-transform shrink-0">
              <Users size={14} />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white tabular-nums">
              {delinquencyMonthlyData.alunosEmDiaCount}
            </span>
            <span className="text-[10.5px] font-bold text-emerald-100/90 truncate ml-1">
              de {delinquencyMonthlyData.totalActiveStudents} ativos ({delinquencyMonthlyData.taxaAdimplenciaAlunos}%)
            </span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-[9.5px] text-emerald-100/90">
            <span className="truncate">{delinquencyMonthlyData.comparison.selectedMonth.monthName} / {delinquencyYear}</span>
            <span className="font-semibold text-white">
              {delinquencyMonthlyData.alunosInadimplentesCount} pendente(s)
            </span>
          </div>
        </div>

        {/* Card 2: Total Faturado no Mês */}
        <div className="rounded-xl p-3 sm:p-3.5 bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 text-white shadow-xs border border-blue-600/40 relative overflow-hidden group">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider text-blue-200 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0"></span>
              Total Faturado no Mês
            </span>
            <div className="w-6.5 h-6.5 rounded-lg bg-white/10 flex items-center justify-center text-blue-200 group-hover:scale-110 transition-transform shrink-0">
              <Wallet size={14} />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white tabular-nums">
              {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthRealizado)}
            </span>
            <span className="text-[10.5px] font-bold text-blue-200/90 truncate ml-1">
              Previsto: {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthPrevisto)}
            </span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-[9.5px] text-blue-200/90">
            <span className="truncate">{delinquencyMonthlyData.comparison.selectedMonth.contribCount} recebimento(s)</span>
            <span className="font-semibold text-white">
              {delinquencyMonthlyData.comparison.selectedMonth.rateRealizado}% atingido
            </span>
          </div>
        </div>

        {/* Card 3: Percentual de Inadimplência */}
        <div className="rounded-xl p-3 sm:p-3.5 bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 text-white shadow-xs border border-amber-500/40 relative overflow-hidden group">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider text-amber-100 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"></span>
              Percentual de Inadimplência
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenWhatsAppCentral()}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-black uppercase tracking-wide backdrop-blur-xs transition-all shadow-xs cursor-pointer border border-emerald-400/50"
                title="Abrir Central de Notificações WhatsApp por Turma"
              >
                <MessageCircle size={12} className={cn("text-emerald-100 shrink-0", delinquencyMonthlyData.pendingStudentsList.length > 0 && "animate-pulse")} />
                <span>WhatsApp por Turma</span>
                {delinquencyMonthlyData.pendingStudentsList.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-emerald-950/70 text-[9px] font-black text-emerald-200">
                    {delinquencyMonthlyData.pendingStudentsList.length}
                  </span>
                )}
              </button>
              <div className="w-6.5 h-6.5 rounded-lg bg-white/10 flex items-center justify-center text-amber-100 group-hover:scale-110 transition-transform shrink-0">
                <TrendingDown size={14} />
              </div>
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white tabular-nums">
              {delinquencyMonthlyData.comparison.selectedMonth.rateInadimplencia}%
            </span>
            <span className="text-[10.5px] font-bold text-amber-100/90 truncate ml-1">
              Saldo: {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? delinquencyMonthlyData.comparison.selectedMonth.monthSaldo : 0)}
            </span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-[9.5px] text-amber-100/90">
            <span className="truncate">
              {delinquencyMonthlyData.pendingStudentsList.length} aluno(s) a notificar
            </span>
            <button
              type="button"
              onClick={() => handleOpenWhatsAppCentral()}
              className="font-bold text-white hover:underline cursor-pointer flex items-center gap-1 hover:text-emerald-200"
            >
              <MessageCircle size={11} className="text-emerald-200" />
              <span>Disparar WhatsApp</span>
              <ArrowRight size={10} />
            </button>
          </div>
        </div>

        {/* Card 4: Histórico de Pagamentos (Mini Gráfico Recharts) */}
        <div className="rounded-xl p-3 sm:p-3.5 bg-white border border-slate-200/90 text-slate-800 shadow-2xs flex flex-col justify-between relative overflow-hidden group">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5 truncate">
                <BarChart3 size={13} className="text-blue-600 shrink-0" />
                Histórico de Pagamentos
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                {delinquencyYear}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-[10px] text-slate-500 font-semibold">Total no Ano:</span>
              <span className="text-sm font-black text-slate-900 tabular-nums">
                {formatCurrency(delinquencyMonthlyData.annual.realizado)}
              </span>
            </div>
          </div>

          {/* Mini Gráfico de Barras Mensal com Recharts */}
          <div className="w-full h-[62px] mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={delinquencyMonthlyData.monthlyHistoryBars} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900/95 backdrop-blur-xs text-white p-2 rounded-lg shadow-lg border border-slate-700 text-[10px] z-50">
                          <p className="font-bold text-slate-100">{d.fullName} / {delinquencyYear}</p>
                          <p className="text-emerald-400 font-bold">Faturado: {formatCurrency(d.realizado)}</p>
                          <p className="text-slate-300 text-[9px]">Previsto: {formatCurrency(d.previsto)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="realizado" radius={[3, 3, 0, 0]}>
                  {delinquencyMonthlyData.monthlyHistoryBars.map((entry, index) => (
                    <Cell
                      key={`bar-cell-${index}`}
                      fill={entry.isSelected ? '#00174b' : entry.realizado > 0 ? '#10b981' : '#cbd5e1'}
                      cursor="pointer"
                      onClick={() => setSelectedComparisonMonth(index + 1)}
                    />
                  ))}
                </Bar>
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 8, fill: '#64748b' }} interval={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
            <span>Clique na barra para focar o mês</span>
            <span className="font-bold text-blue-700 hover:text-blue-900 cursor-pointer" onClick={() => setSelectedComparisonMonth(new Date().getMonth() + 1)}>
              Mês Vigente
            </span>
          </div>
        </div>
      </div>

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

      {/* Central de Notificações WhatsApp por Turma (Módulo Unificado) */}
      {showValidationModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] my-auto flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Cabeçalho do Módulo Central de WhatsApp */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-between gap-3 shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-xs">
                  <MessageCircle size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-white tracking-tight">
                      Central de Notificações WhatsApp por Turma
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10.5px] font-bold">
                      Exercício {delinquencyYear}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-tight mt-0.5 truncate">
                    Selecione a turma, valide os números e realize o envio seguro (individual ou em lotes de até 5 alunos)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowValidationModal(false);
                  setIsQueueActive(false);
                }}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Fechar Central de WhatsApp"
              >
                <X size={16} />
              </button>
            </div>

            {/* Barra de Filtro Inicial: Seletor de Turma e Escopo de Pendências */}
            <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
              {/* Seletor de Turma */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label htmlFor="whatsapp-central-class-select" className="text-xs font-black text-slate-700 flex items-center gap-1.5 shrink-0">
                  <Users size={14} className="text-emerald-700" />
                  <span>Turma:</span>
                </label>
                <div className="relative flex-1 max-w-md">
                  <select
                    id="whatsapp-central-class-select"
                    value={selectedValidationClassId}
                    onChange={e => loadValidationContactsForClass(e.target.value)}
                    className="w-full text-xs font-bold pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">
                      Todas as Turmas ({activeScopeStudents.length} alunos com pendência)
                    </option>
                    {classGroups.map(group => (
                      <option key={group.classId} value={group.classId}>
                        {group.className} ({group.students.length} alunos • {group.totalWhatsAppCount} WhatsApp)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Escopo de Débitos */}
              <div className="flex items-center gap-1 shrink-0 self-end md:self-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline mr-0.5">
                  Escopo:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationDebtScope('all_due');
                    loadValidationContactsForClass(selectedValidationClassId, 'all_due');
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    notificationDebtScope === 'all_due'
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                  )}
                  title="Notificar todas as parcelas já vencidas"
                >
                  Períodos Vencidos ({delinquencyMonthlyData.allDuePendingStudentsList?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationDebtScope('selected_month');
                    loadValidationContactsForClass(selectedValidationClassId, 'selected_month');
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    notificationDebtScope === 'selected_month'
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                  )}
                  title={`Notificar apenas o mês de ${delinquencyMonthlyData.comparison.selectedMonth.monthName}`}
                >
                  Mês Atual ({delinquencyMonthlyData.pendingStudentsList?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationDebtScope('all_year');
                    loadValidationContactsForClass(selectedValidationClassId, 'all_year');
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    notificationDebtScope === 'all_year'
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                  )}
                  title="Notificar o ano letivo completo"
                >
                  Ano Todo ({delinquencyMonthlyData.allYearPendingStudentsList?.length || 0})
                </button>
              </div>
            </div>

            {/* Assistente Integrado de Fila Sequencial WhatsApp (se ativada pelo botão em lote) */}
            {isQueueActive && selectedQueueStudents.length > 0 && currentQueueStudent && (
              <div className="mx-5 my-2.5 bg-emerald-950 text-white rounded-xl p-3 border border-emerald-600 shadow-md animate-in slide-in-from-top-2 duration-150 space-y-2 shrink-0">
                <div className="flex items-center justify-between border-b border-emerald-800 pb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-emerald-400 text-slate-950 flex items-center justify-center font-black text-xs">
                      {queueIndex + 1}
                    </div>
                    <span className="text-xs font-bold text-emerald-200 uppercase tracking-wide">
                      Fila WhatsApp {activeQueueGroupTitle ? `• ${activeQueueGroupTitle}` : ''} — Aluno {queueIndex + 1} de {selectedQueueStudents.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsQueueActive(false)}
                    className="text-[11px] text-emerald-300 hover:text-white flex items-center gap-1 cursor-pointer font-bold"
                  >
                    <X size={13} />
                    <span>Encerrar Fila</span>
                  </button>
                </div>

                <div className="w-full bg-emerald-900 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-emerald-400 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.round(((queueIndex + 1) / selectedQueueStudents.length) * 100)}%` }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-xs min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-black text-white">{currentQueueStudent.name}</strong>
                      <span className="text-[10px] text-emerald-300 font-mono">RA: {currentQueueStudent.registration_number || 'N/D'}</span>
                      <span className="text-[10px] text-emerald-200 bg-emerald-900 px-1.5 py-0.2 rounded border border-emerald-700">{currentQueueStudent.className}</span>
                    </div>
                    <div className="text-emerald-200 text-[11px] mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Tel: <strong>{currentQueueStudent.phone}</strong></span>
                      <span>•</span>
                      <span>Períodos: <strong className="text-amber-300">{notificationDebtScope === 'selected_month' ? delinquencyMonthlyData.comparison.selectedMonth.monthName : (currentQueueStudent.dueOpenPeriodsFormatted || currentQueueStudent.allOpenPeriodsFormatted)}</strong></span>
                      <span>•</span>
                      <span>Total: <strong className="text-white font-bold">{notificationDebtScope === 'selected_month' ? formatCurrency(currentQueueStudent.fee) : formatCurrency(currentQueueStudent.dueOpenTotalAmount || currentQueueStudent.fee)}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSkipCurrentInQueue}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <SkipForward size={12} />
                      <span>Pular</span>
                    </button>

                    {currentQueueWhatsappUrl ? (
                      <a
                        href={currentQueueWhatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleAdvanceCurrentQueue}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                        title={`Abrir WhatsApp Web para ${currentQueueStudent.name} e avançar para o próximo`}
                      >
                        <MessageCircle size={14} />
                        <span>Abrir no WhatsApp ({queueIndex + 1}/{selectedQueueStudents.length})</span>
                        <ArrowRight size={12} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAdvanceCurrentQueue}
                        className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold"
                      >
                        Sem WhatsApp - Pular
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Faixa de Métricas e Status dos Contatos */}
            {(() => {
              const totalContacts = validatedContacts.length;
              const validContacts = validatedContacts.filter(c => c.status === 'valid').length;
              const warningContacts = validatedContacts.filter(c => c.status === 'warning').length;
              const invalidContacts = validatedContacts.filter(c => c.status === 'invalid').length;
              const selectedApprovedCount = validatedContacts.filter(c => c.isSelected && c.status !== 'invalid').length;

              const filteredContacts = validatedContacts.filter(c => {
                if (validationFilter === 'selected' && (!c.isSelected || c.status === 'invalid')) return false;
                if (validationFilter === 'valid' && c.status !== 'valid') return false;
                if (validationFilter === 'warning' && c.status !== 'warning') return false;
                if (validationFilter === 'invalid' && c.status !== 'invalid') return false;
                if (validationSearch.trim()) {
                  const q = validationSearch.toLowerCase().trim();
                  const matchName = c.student?.name?.toLowerCase().includes(q);
                  const matchRa = c.student?.registration_number?.toLowerCase().includes(q);
                  const matchDigits = c.digits?.includes(q) || c.formattedDisplay?.toLowerCase().includes(q);
                  if (!matchName && !matchRa && !matchDigits) return false;
                }
                return true;
              });

              return (
                <>
                  {/* Métricas Interativas no Topo: Funcionam como Filtros Diretos (elimina barra duplicada) */}
                  <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setValidationFilter('all')}
                      className={cn(
                        "p-2 rounded-xl border text-center shadow-2xs transition-all cursor-pointer text-left sm:text-center",
                        validationFilter === 'all'
                          ? "bg-slate-900 text-white border-slate-900 ring-2 ring-slate-400"
                          : "bg-white border-slate-200 text-slate-800 hover:bg-slate-100/70"
                      )}
                      title="Exibir todos os contatos da turma"
                    >
                      <span className={cn(
                        "text-[9.5px] font-bold uppercase tracking-wider block",
                        validationFilter === 'all' ? "text-slate-300" : "text-slate-400"
                      )}>
                        Total
                      </span>
                      <span className="text-sm sm:text-base font-black">{totalContacts}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setValidationFilter(prev => prev === 'valid' ? 'all' : 'valid')}
                      className={cn(
                        "p-2 rounded-xl border text-center shadow-2xs transition-all cursor-pointer text-left sm:text-center",
                        validationFilter === 'valid'
                          ? "bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400"
                          : "bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100/70"
                      )}
                      title="Filtrar contatos válidos (11 dígitos com DDD)"
                    >
                      <span className={cn(
                        "text-[9.5px] font-bold uppercase tracking-wider block",
                        validationFilter === 'valid' ? "text-emerald-100" : "text-emerald-700"
                      )}>
                        Válidos (11d)
                      </span>
                      <span className="text-sm sm:text-base font-black flex items-center justify-start sm:justify-center gap-1">
                        <CheckCircle2 size={13} className={validationFilter === 'valid' ? "text-white" : "text-emerald-600"} />
                        {validContacts}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setValidationFilter(prev => prev === 'warning' ? 'all' : 'warning')}
                      className={cn(
                        "p-2 rounded-xl border text-center shadow-2xs transition-all cursor-pointer text-left sm:text-center",
                        validationFilter === 'warning'
                          ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-400"
                          : "bg-amber-50/70 border-amber-200 text-amber-800 hover:bg-amber-100/70"
                      )}
                      title="Filtrar contatos com 10 dígitos (requer atenção)"
                    >
                      <span className={cn(
                        "text-[9.5px] font-bold uppercase tracking-wider block",
                        validationFilter === 'warning' ? "text-amber-100" : "text-amber-700"
                      )}>
                        Atenção (10d)
                      </span>
                      <span className="text-sm sm:text-base font-black flex items-center justify-start sm:justify-center gap-1">
                        <AlertTriangle size={13} className={validationFilter === 'warning' ? "text-white" : "text-amber-600"} />
                        {warningContacts}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setValidationFilter(prev => prev === 'invalid' ? 'all' : 'invalid')}
                      className={cn(
                        "p-2 rounded-xl border text-center shadow-2xs transition-all cursor-pointer text-left sm:text-center",
                        validationFilter === 'invalid'
                          ? "bg-rose-600 text-white border-rose-700 ring-2 ring-rose-400"
                          : "bg-rose-50/70 border-rose-200 text-rose-800 hover:bg-rose-100/70"
                      )}
                      title="Filtrar contatos inválidos ou sem número"
                    >
                      <span className={cn(
                        "text-[9.5px] font-bold uppercase tracking-wider block",
                        validationFilter === 'invalid' ? "text-rose-100" : "text-rose-700"
                      )}>
                        Inválidos / Ausentes
                      </span>
                      <span className="text-sm sm:text-base font-black flex items-center justify-start sm:justify-center gap-1">
                        <AlertCircle size={13} className={validationFilter === 'invalid' ? "text-white" : "text-rose-600"} />
                        {invalidContacts}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setValidationFilter(prev => prev === 'selected' ? 'all' : 'selected')}
                      className={cn(
                        "p-2 rounded-xl border text-center shadow-2xs col-span-2 sm:col-span-1 transition-all cursor-pointer",
                        validationFilter === 'selected'
                          ? "bg-blue-600 text-white border-blue-700 ring-2 ring-blue-400 shadow-sm"
                          : "bg-blue-50/70 border-blue-200 text-blue-900 hover:bg-blue-100/70"
                      )}
                      title="Exibir apenas os alunos selecionados para o lote atual"
                    >
                      <span className={cn(
                        "text-[9.5px] font-bold uppercase tracking-wider block",
                        validationFilter === 'selected' ? "text-blue-100" : "text-blue-700"
                      )}>
                        Para Fila em Lote
                      </span>
                      <span className={cn(
                        "text-sm sm:text-base font-black flex items-center justify-center gap-1",
                        validationFilter === 'selected' ? "text-white" : "text-blue-800"
                      )}>
                        <UserCheck size={13} className={validationFilter === 'selected' ? "text-white" : "text-blue-600"} />
                        {selectedApprovedCount}
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold block mt-0.5",
                        validationFilter === 'selected'
                          ? "text-blue-100 underline font-extrabold"
                          : selectedApprovedCount === 0
                          ? "text-slate-400"
                          : selectedApprovedCount <= 5
                          ? "text-emerald-700"
                          : "text-amber-700"
                      )}>
                        {validationFilter === 'selected'
                          ? "Exibindo selecionados"
                          : selectedApprovedCount === 0
                          ? "Nenhum marcado"
                          : selectedApprovedCount <= 5
                          ? "✓ Lote Seguro (≤5)"
                          : `${selectedApprovedCount} alunos (Max 5)`}
                      </span>
                    </button>
                  </div>

                  {/* Barra Única e Compacta: Busca e Ações Rápidas (Sem a barra duplicada de filtros) */}
                  <div className="px-5 py-2 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                    <div className="relative flex-1 sm:max-w-xs">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={validationSearch}
                        onChange={e => setValidationSearch(e.target.value)}
                        placeholder="Buscar por nome, RA ou telefone..."
                        className="w-full text-xs pl-7 pr-7 py-1 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
                      />
                      {validationSearch && (
                        <button
                          type="button"
                          onClick={() => setValidationSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleSelectSafeBatch(5)}
                        className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
                        title="Selecionar até 5 alunos válidos para lote seguro sem risco de bloqueio"
                      >
                        <Users size={12} className="text-emerald-700" />
                        <span>Lote Seguro (5)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectNextSafeBatch(5)}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
                        title="Avançar, selecionar e rolar para os próximos 5 alunos da lista"
                      >
                        <SkipForward size={11} className="text-slate-500" />
                        <span>Próximos 5</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSelectAllValidInValidation}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-all shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
                        title="Marcar todos os contatos válidos"
                      >
                        <CheckSquare size={12} className="text-slate-600" />
                        <span>Todos</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDeselectAllInValidation}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition-all shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
                        title="Desmarcar todos os contatos"
                      >
                        <Square size={12} className="text-slate-400" />
                        <span>Limpar</span>
                      </button>
                    </div>
                  </div>

                  {/* Lista de Contatos Otimizada: Compacta para que os 5 selecionados fiquem 100% visíveis */}
                  <div
                    ref={validationListRef}
                    className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1.5 max-h-[62vh] min-h-[360px] bg-slate-50/50 scroll-smooth"
                  >
                    {filteredContacts.length === 0 ? (
                      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                        <Info size={28} className="mx-auto mb-2 text-slate-400" />
                        <p className="text-xs font-bold text-slate-700">Nenhum contato encontrado no filtro atual.</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Clique nas métricas acima para alternar os filtros.</p>
                      </div>
                    ) : (
                      filteredContacts.map(contact => {
                        const isInvalid = contact.status === 'invalid';
                        const isWarning = contact.status === 'warning';
                        const isValid = contact.status === 'valid';
                        const isChecked = contact.isSelected && !isInvalid;

                        const testMessage = generateStudentMessage(contact.student, customWhatsappTemplate);
                        const testUrl = contact.whatsappNumber
                          ? `https://api.whatsapp.com/send?phone=${contact.whatsappNumber}&text=${encodeURIComponent(testMessage)}`
                          : null;

                        const periodsChips = notificationDebtScope === 'selected_month'
                          ? [delinquencyMonthlyData.comparison.selectedMonth.monthShort]
                          : (notificationDebtScope === 'all_year' ? contact.student.allOpenPeriodShorts : contact.student.dueOpenPeriodShorts);

                        const debtAmount = notificationDebtScope === 'selected_month'
                          ? contact.student.fee
                          : (notificationDebtScope === 'all_year' ? contact.student.allOpenTotalAmount : contact.student.dueOpenTotalAmount) || contact.student.fee;

                        return (
                          <div
                            key={contact.student.id}
                            id={`validation-contact-row-${contact.student.id}`}
                            data-selected={isChecked ? 'true' : 'false'}
                            className={cn(
                              "px-3.5 py-2 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-2xs scroll-mt-3",
                              isInvalid
                                ? "bg-rose-50/40 border-rose-200 opacity-75"
                                : isChecked
                                ? "bg-emerald-50/35 border-emerald-400 ring-2 ring-emerald-500/30 hover:border-emerald-500 shadow-xs"
                                : "bg-white border-slate-200 opacity-70 hover:opacity-100"
                            )}
                          >
                            {/* Checkbox e Identificação do Aluno */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <button
                                type="button"
                                disabled={isInvalid}
                                onClick={() => handleToggleValidationContact(contact.student.id)}
                                className={cn(
                                  "transition-colors shrink-0",
                                  isInvalid ? "cursor-not-allowed opacity-30" : "cursor-pointer text-slate-400 hover:text-emerald-600"
                                )}
                                title={isInvalid ? "Número inválido - não pode ser enviado" : isChecked ? "Desmarcar este contato" : "Marcar para envio na fila em lote"}
                              >
                                {isChecked ? (
                                  <CheckSquare size={16} className="text-emerald-600" />
                                ) : (
                                  <Square size={16} className="text-slate-400" />
                                )}
                              </button>

                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 border",
                                isInvalid
                                  ? "bg-rose-100 text-rose-800 border-rose-200"
                                  : isWarning
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : isChecked
                                  ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                                  : "bg-emerald-100 text-emerald-800 border-emerald-200"
                              )}>
                                {contact.student.name.charAt(0).toUpperCase()}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                                    {contact.student.name}
                                  </h4>
                                  <span className="text-[9.5px] font-mono text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                                    RA: {contact.student.registration_number || 'N/D'}
                                  </span>
                                  {contact.student.className && (
                                    <span className="text-[9.5px] font-bold text-slate-600 bg-slate-100 px-1 py-0.2 rounded border border-slate-200 truncate max-w-[130px]">
                                      {contact.student.className}
                                    </span>
                                  )}
                                  {isChecked && (
                                    <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full border border-emerald-300 flex items-center gap-0.5 shrink-0 animate-in fade-in duration-150">
                                      <Check size={8} /> No Lote
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px]">
                                  <span className="font-extrabold text-amber-900 bg-amber-50 px-1.5 py-0.1 rounded border border-amber-200 text-[10.5px]">
                                    {formatCurrency(debtAmount)}
                                  </span>
                                  {periodsChips && periodsChips.length > 0 && (
                                    <span
                                      className="text-[9.5px] text-slate-500 font-medium truncate max-w-[280px]"
                                      title={periodsChips.join(', ')}
                                    >
                                      {periodsChips.length <= 4
                                        ? `(${periodsChips.join(', ')})`
                                        : `(${periodsChips.length} períodos: ${periodsChips.slice(0, 3).join(', ')}... +${periodsChips.length - 3})`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Coluna Direita: Telefone, Badges e Botão Enviar Individual */}
                            <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                              {/* Telefone */}
                              <div className="text-right sm:text-left min-w-[125px]">
                                <div className="flex items-center justify-end sm:justify-start gap-1">
                                  <MessageCircle size={12} className={isValid ? "text-emerald-600" : isWarning ? "text-amber-500" : "text-rose-500"} />
                                  <span className={cn(
                                    "font-mono text-xs font-bold",
                                    isInvalid ? "text-rose-700 line-through" : "text-slate-800"
                                  )}>
                                    {contact.formattedDisplay}
                                  </span>
                                </div>
                                {contact.rawPhone && contact.rawPhone !== contact.formattedDisplay && (
                                  <span className="text-[9px] text-slate-400 font-mono block">
                                    Orig: {contact.rawPhone}
                                  </span>
                                )}
                              </div>

                              {/* Badges de Validação e Indicador Mensal de Envios */}
                              <div className="flex flex-col items-end sm:items-start gap-0.5 shrink-0 min-w-[120px]">
                                {isValid && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <CheckCircle2 size={10} className="text-emerald-600" />
                                    <span>Válido (11d)</span>
                                  </span>
                                )}
                                {isWarning && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300" title={contact.reason}>
                                    <AlertTriangle size={10} className="text-amber-600" />
                                    <span>{contact.reason}</span>
                                  </span>
                                )}
                                {isInvalid && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300" title={contact.reason}>
                                    <AlertCircle size={10} className="text-rose-600" />
                                    <span>{contact.reason}</span>
                                  </span>
                                )}

                                {/* Indicador Mensal de Mensagens Enviadas a este Aluno */}
                                {(() => {
                                  const studentLog = monthlyNotificationLog[contact.student.id];
                                  const count = studentLog?.count || 0;
                                  if (count > 0) {
                                    return (
                                      <div
                                        className="inline-flex items-center gap-1 text-[9px] font-extrabold text-amber-900 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-300/80 shadow-2xs"
                                        title={`Disparos no mês corrente: ${count} mensagem(ns) enviada(s)${studentLog?.lastSentAt ? ` • Último envio: ${studentLog.lastSentAt}` : ''}`}
                                      >
                                        <Check size={9} className="text-emerald-600 shrink-0" />
                                        <span>{count} {count === 1 ? 'envio no mês' : 'envios no mês'}</span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div
                                      className="inline-flex items-center gap-1 text-[8.5px] text-slate-400 font-medium px-1.5 py-0.2 rounded bg-slate-100/80 border border-slate-200"
                                      title="Nenhuma mensagem disparada para este aluno pelo sistema no mês corrente"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                      <span>0 envios no mês</span>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Botão Enviar Individual */}
                              {testUrl && !isInvalid ? (
                                <a
                                  href={testUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => registerStudentMessageSent(contact.student.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs flex items-center gap-1 transition-all shadow-2xs shrink-0 cursor-pointer"
                                  title={`Disparo Individual: Abrir WhatsApp Web para ${contact.student.name} e registrar envio mensal`}
                                >
                                  <MessageCircle size={12} />
                                  <span>Enviar</span>
                                  <ExternalLink size={9} className="opacity-75" />
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="px-2 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold flex items-center gap-1 cursor-not-allowed shrink-0"
                                  title={contact.reason || "Número indisponível para envio"}
                                >
                                  <MessageCircle size={11} />
                                  <span>Sem Envio</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Rodapé do Modal */}
                  <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 shrink-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                      <span className="text-[11px] leading-tight text-slate-500">
                        <strong>Individual:</strong> Clique em <span className="text-emerald-700 font-bold">"Enviar"</span> na linha do aluno. <strong>Em Lote:</strong> Marque até 5 alunos e clique em <span className="text-emerald-700 font-bold">"Confirmar e Enviar Fila"</span>.
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => setShowValidationModal(false)}
                        className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirmValidationAndStartQueue}
                        disabled={selectedApprovedCount === 0}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={selectedApprovedCount === 0 ? "Selecione pelo menos um contato para iniciar a fila de envio" : `Disparar fila sequencial para os ${selectedApprovedCount} alunos selecionados`}
                      >
                        <Play size={12} fill="currentColor" />
                        <span>Confirmar e Enviar Fila ({selectedApprovedCount} {selectedApprovedCount === 1 ? 'aluno' : 'alunos'})</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
