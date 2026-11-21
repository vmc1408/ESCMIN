import { Student, Class, Enrollment } from '../types';
import { parseSafeDate } from './utils';

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseLocalDateParts(raw?: string | null): DateParts | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // YYYY-MM-DD (or ISO timestamp)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month, day };
    }
  }

  // DD/MM/YYYY
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10);
    const year = parseInt(brMatch[3], 10);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month, day };
    }
  }

  const d = parseSafeDate(s);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate()
    };
  }

  return null;
}

function isStudentStatusActive(status?: string | null): boolean {
  if (!status) return true;
  const s = String(status).trim().toLowerCase();
  return s === 'ativo' || s === 'active' || s === '';
}

function isEnrollmentStatusClosed(status?: string | null): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s !== 'ativo' && s !== 'active' && s !== '';
}

/**
 * Extrai o ano de início de uma turma com base em múltiplos metadados.
 */
export function getClassStartYear(studentClass: Class | any): number {
  if (!studentClass) return new Date().getFullYear();
  const rawStart = studentClass.start_year || (studentClass as any).academic_year || (studentClass as any).year;
  if (rawStart) {
    const match = String(rawStart).match(/\b(19\d{2}|20\d{2})\b/);
    if (match) return parseInt(match[1], 10);
  }
  if (studentClass.code) {
    const codeMatch = String(studentClass.code).match(/-(\d{2})\b/);
    if (codeMatch && codeMatch[1]) {
      const yr2 = Number(codeMatch[1]);
      if (yr2 >= 0 && yr2 <= 99) return 2000 + yr2;
    }
  }
  if (studentClass.start_date) {
    const dp = parseLocalDateParts(studentClass.start_date);
    if (dp) return dp.year;
  }
  if (studentClass.created_at) {
    const yr = new Date(studentClass.created_at).getFullYear();
    if (!isNaN(yr)) return yr;
  }
  return new Date().getFullYear();
}

/**
 * Determina se uma turma ou estudante está no seu 1º Ano ou no mesmo ano de início das aulas.
 * 
 * Regra de Negócio:
 * - 1º ano de Teologia, nova turma de Doutrina Social da Igreja (DSI) ou qualquer outro curso ingressante
 *   iniciando naquele ano letivo.
 * - Turmas veteranas (2º ano, 3º ano, 4º ano, ou turmas que iniciaram em anos anteriores) NÃO são 1º ano.
 * - Somente no primeiro ano ou mesmo ano de início das aulas os meses de Janeiro e Fevereiro são facultativos.
 */
export function isFirstYearOrStarting(
  student: Student | undefined,
  studentClass: Class | undefined,
  targetYear: number
): boolean {
  // 1. Verificação explícita pela turma
  if (studentClass) {
    const yrStr = (studentClass.year || '').toLowerCase();
    const nameStr = (studentClass.name || '').toLowerCase();
    const codeStr = (studentClass.code || '').toLowerCase();

    // Se indicar expressamente 2º, 3º, 4º ano ou veterano -> NUNCA é 1º ano
    const isExplicitVeteran = (
      yrStr.includes('2º') || yrStr.includes('2°') || yrStr.includes('2 ano') || yrStr.includes('2ª') || yrStr.includes('2a') ||
      yrStr.includes('3º') || yrStr.includes('3°') || yrStr.includes('3 ano') || yrStr.includes('3ª') || yrStr.includes('3a') ||
      yrStr.includes('4º') || yrStr.includes('4°') || yrStr.includes('4 ano') || yrStr.includes('4ª') || yrStr.includes('4a') ||
      nameStr.includes('2º ano') || nameStr.includes('2° ano') || nameStr.includes('2 ano') || nameStr.includes('2ano') || nameStr.includes('segundo ano') ||
      nameStr.includes('3º ano') || nameStr.includes('3° ano') || nameStr.includes('3 ano') || nameStr.includes('3ano') || nameStr.includes('terceiro ano') ||
      nameStr.includes('4º ano') || nameStr.includes('4° ano') || nameStr.includes('4 ano') || nameStr.includes('4ano') || nameStr.includes('quarto ano') ||
      codeStr.includes('2ano') || codeStr.includes('3ano') || codeStr.includes('4ano') ||
      nameStr.includes('veteran') || codeStr.includes('vet')
    );

    if (isExplicitVeteran) {
      return false;
    }

    // Se a turma iniciou em ano ANTERIOR ao targetYear -> É turma veterana (não é ano de início)
    const classStartYear = getClassStartYear(studentClass);
    if (classStartYear < targetYear) {
      return false;
    }

    // Se indicar expressamente 1º ano / ingressante / iniciante
    if (
      yrStr.includes('1º') || yrStr.includes('1°') || yrStr.includes('1 ano') || yrStr.includes('1ª') || yrStr.includes('1a') ||
      nameStr.includes('1º ano') || nameStr.includes('1° ano') || nameStr.includes('1 ano') || nameStr.includes('1ºano') || nameStr.includes('1ano') ||
      nameStr.includes('primeiro ano') || nameStr.includes('ingressante') || nameStr.includes('iniciante') ||
      codeStr.includes('1ano') || codeStr.includes('1º') || codeStr.includes('1°')
    ) {
      return true;
    }

    // Se a turma iniciou no próprio targetYear (mesmo ano de início das aulas)
    // Aplica-se a Teologia, Doutrina Social da Igreja ou qualquer outra turma ingressante
    if (classStartYear === targetYear) {
      return true;
    }
  }

  // 2. Verificação pelo cadastro do estudante
  if (student) {
    if (student.start_date) {
      const dp = parseLocalDateParts(student.start_date);
      if (dp) {
        // Se o estudante ingressou antes do ano analisado -> é veterano
        if (dp.year < targetYear) return false;
        // Se ingressou exatamente no targetYear -> é ingressante / 1º ano
        if (dp.year === targetYear) return true;
      }
    }

    // Verificação de observações ou metadados do estudante
    if (student.observations) {
      const obs = student.observations.toLowerCase();
      if (obs.includes('1º ano') || obs.includes('1° ano') || obs.includes('primeiro ano') || obs.includes('ingressante')) {
        return true;
      }
      if (obs.includes('2º ano') || obs.includes('3º ano') || obs.includes('veterano')) {
        return false;
      }
    }
  }

  return false;
}

/**
 * Retorna o mês em que as aulas / encontros efetivamente se iniciam.
 * Por padrão é Março (mês 3), salvo se especificado no calendário ou turma.
 */
export function getMeetingsStartMonth(
  studentClass: Class | undefined,
  academicSettings?: any
): number {
  let startMonth = 3; // Março como padrão geral de início das aulas letivas do instituto

  if (academicSettings) {
    if (academicSettings.term1_start) {
      const dp = parseLocalDateParts(academicSettings.term1_start);
      if (dp) {
        startMonth = dp.month;
      }
    }
  }

  if (studentClass?.start_date) {
    const dp = parseLocalDateParts(studentClass.start_date);
    if (dp) {
      startMonth = dp.month;
    }
  }

  // Se turma semestral do 2º semestre (início em Julho/Agosto)
  if (studentClass?.semester === '2') {
    startMonth = Math.max(startMonth, 7);
  }

  return startMonth;
}

export interface ContributionPlan {
  isFirstYear: boolean;
  enrollmentFeeRequired: boolean; // Matrícula é obrigatória?
  meetingsStartMonth: number; // Mês de início dos encontros (ex: 3 / Março)
  facultativeMonths: number[]; // [1, 2] se 1º ano; vazio se veterano
  mandatoryMonths: number[]; // Meses regulares obrigatórios
  expectedPeriods: number[]; // Períodos esperados (0 para matrícula se devida, mais os meses obrigatórios e facultativos pagos)
}

export interface ContributionPlanOptions {
  enrollments?: Enrollment[];
  classes?: Class[];
}

function getAcademicEndMonth(studentClass: Class | undefined, academicSettings?: any): number {
  let academicEndMonth = 12;
  if (academicSettings?.term2_end) {
    const dp = parseLocalDateParts(academicSettings.term2_end);
    if (dp) {
      academicEndMonth = dp.month;
    }
  }
  if (studentClass?.semester === '1') {
    academicEndMonth = Math.min(academicEndMonth, 6);
  }
  return academicEndMonth;
}

/**
 * Calcula o plano acadêmico e financeiro de contribuições do estudante para o ano letivo,
 * respeitando a janela exata [Data de Matrícula .. Data de Inativação] de cada ciclo/matrícula.
 */
export function getStudentContributionPlan(
  student: Student,
  studentClass: Class | undefined,
  targetYear: number,
  paidMonths: number[] = [],
  academicSettings?: any,
  options?: ContributionPlanOptions
): ContributionPlan {
  const normalizedPaid = Array.from(
    new Set(paidMonths.map(m => Number(m)).filter(m => !isNaN(m) && m >= 0 && m <= 12))
  ).sort((a, b) => a - b);

  const studentEnrollments = (options?.enrollments || []).filter(
    e => String(e.student_id) === String(student.id)
  );

  // ============================================================================
  // MODO 1: Cálculo preciso por ciclos de matrícula (enrollments)
  // ============================================================================
  if (studentEnrollments.length > 0) {
    const expectedSet = new Set<number>(normalizedPaid);
    const mandatorySet = new Set<number>();
    const facultativeSet = new Set<number>();
    let anyFirstYearInTarget = false;
    let anyEnrollmentFeeRequired = false;
    let effectiveMeetingsStart = getMeetingsStartMonth(studentClass, academicSettings);
    let hasActiveOrDatedEnrollmentInYear = false;

    for (const enr of studentEnrollments) {
      const clsE =
        options?.classes?.find(c => c.id === enr.class_id) ||
        (studentClass && studentClass.id === enr.class_id ? studentClass : undefined);

      // Para determinar se é 1º ano neste ciclo, prioriza a data desta matrícula
      const effectiveStudentForCycle: Student = enr.enrollment_date
        ? { ...student, start_date: enr.enrollment_date }
        : student;

      const isFirstYearE = isFirstYearOrStarting(effectiveStudentForCycle, clsE, targetYear);
      const meetingsStartE = getMeetingsStartMonth(clsE, academicSettings);
      const academicEndE = getAcademicEndMonth(clsE, academicSettings);

      const startParts =
        parseLocalDateParts(enr.enrollment_date) ||
        parseLocalDateParts(clsE?.start_date) ||
        parseLocalDateParts(student.start_date) ||
        parseLocalDateParts(enr.created_at);

      // Se iniciou depois do targetYear, este ciclo não existia em targetYear
      if (startParts && startParts.year > targetYear) {
        continue;
      }

      const enrClosed = isEnrollmentStatusClosed(enr.status);
      const studentActive = isStudentStatusActive(student.status);

      // Data de saída/inativação deste vínculo
      const rawEndDate =
        enr.inactivation_date ||
        (enrClosed && !studentActive ? student.inactivation_date : undefined) ||
        (!studentActive ? student.inactivation_date : undefined);

      const endParts = parseLocalDateParts(rawEndDate);

      // Se a matrícula (ou aluno) já estava encerrada sem data de saída gravada (legado),
      // não inventa cobranças para não gerar falsas pendências retroativas.
      if ((enrClosed || !studentActive) && !endParts) {
        continue;
      }

      // Se encerrou antes do targetYear, este ciclo não gera cobranças em targetYear
      if (endParts && endParts.year < targetYear) {
        continue;
      }

      const wasFirstMatched = !hasActiveOrDatedEnrollmentInYear;
      hasActiveOrDatedEnrollmentInYear = true;
      if (isFirstYearE) anyFirstYearInTarget = true;

      const baseStartMonth = isFirstYearE ? meetingsStartE : 1;
      const winStartMonth =
        startParts && startParts.year === targetYear
          ? Math.max(baseStartMonth, startParts.month)
          : baseStartMonth;

      const winEndMonth =
        endParts && endParts.year === targetYear
          ? Math.min(academicEndE, endParts.month)
          : academicEndE;

      if (wasFirstMatched || winStartMonth < effectiveMeetingsStart) {
        effectiveMeetingsStart = winStartMonth;
      }

      if (isFirstYearE) {
        [1, 2].filter(m => m < meetingsStartE).forEach(m => facultativeSet.add(m));
      }

      // Se o ciclo esteve vigente no targetYear e é ingressante / 1º ano (ou iniciou no ano), taxa de matrícula é esperada
      const enrolledInTargetYear = startParts ? startParts.year === targetYear : false;
      if (isFirstYearE || enrolledInTargetYear) {
        anyEnrollmentFeeRequired = true;
        expectedSet.add(0);
      }

      if (winStartMonth <= winEndMonth) {
        for (let m = winStartMonth; m <= winEndMonth; m++) {
          mandatorySet.add(m);
          expectedSet.add(m);
        }
      }
    }

    const expectedPeriods = Array.from(expectedSet).sort((a, b) => a - b);
    const mandatoryMonths = Array.from(mandatorySet).sort((a, b) => a - b);
    const facultativeMonths = Array.from(facultativeSet).sort((a, b) => a - b);

    return {
      isFirstYear: anyFirstYearInTarget,
      enrollmentFeeRequired: anyEnrollmentFeeRequired,
      meetingsStartMonth: effectiveMeetingsStart,
      facultativeMonths,
      mandatoryMonths,
      expectedPeriods
    };
  }

  // ============================================================================
  // MODO 2: Fallback quando não há registros em enrollments (aluno legado/direto)
  // ============================================================================
  const isFirstYear = isFirstYearOrStarting(student, studentClass, targetYear);
  const meetingsStart = getMeetingsStartMonth(studentClass, academicSettings);
  const academicEndMonth = getAcademicEndMonth(studentClass, academicSettings);
  const studentActive = isStudentStatusActive(student.status);

  const startParts = parseLocalDateParts(student.start_date);
  const endParts = parseLocalDateParts(student.inactivation_date);

  // Aluno inativo sem data de inativação registrada: preserva somente o que já foi pago
  if (!studentActive && !endParts) {
    return {
      isFirstYear,
      enrollmentFeeRequired: normalizedPaid.includes(0),
      meetingsStartMonth: meetingsStart,
      facultativeMonths: isFirstYear ? [1, 2].filter(m => m < meetingsStart) : [],
      mandatoryMonths: [],
      expectedPeriods: normalizedPaid
    };
  }

  // Se iniciou depois do ano analisado ou encerrou antes do ano analisado -> somente pagos
  if ((startParts && startParts.year > targetYear) || (endParts && endParts.year < targetYear)) {
    return {
      isFirstYear,
      enrollmentFeeRequired: normalizedPaid.includes(0),
      meetingsStartMonth: meetingsStart,
      facultativeMonths: [],
      mandatoryMonths: [],
      expectedPeriods: normalizedPaid
    };
  }

  const baseStartMonth = isFirstYear ? meetingsStart : 1;
  const effectiveStartMonth =
    startParts && startParts.year === targetYear
      ? Math.max(baseStartMonth, startParts.month)
      : baseStartMonth;
  const effectiveEndMonth =
    endParts && endParts.year === targetYear
      ? Math.min(academicEndMonth, endParts.month)
      : academicEndMonth;

  if (isFirstYear) {
    const facultativeMonths = [1, 2].filter(m => m < meetingsStart);
    const mandatoryMonths: number[] = [];
    if (effectiveStartMonth <= effectiveEndMonth) {
      for (let m = effectiveStartMonth; m <= effectiveEndMonth; m++) {
        mandatoryMonths.push(m);
      }
    }

    const expectedPeriods: number[] = [0];
    mandatoryMonths.forEach(m => {
      if (!expectedPeriods.includes(m)) expectedPeriods.push(m);
    });
    normalizedPaid.forEach(m => {
      if (!expectedPeriods.includes(m)) {
        expectedPeriods.push(m);
      }
    });
    expectedPeriods.sort((a, b) => a - b);

    return {
      isFirstYear: true,
      enrollmentFeeRequired: true,
      meetingsStartMonth: meetingsStart,
      facultativeMonths,
      mandatoryMonths,
      expectedPeriods
    };
  } else {
    const mandatoryMonths: number[] = [];
    if (effectiveStartMonth <= effectiveEndMonth) {
      for (let m = effectiveStartMonth; m <= effectiveEndMonth; m++) {
        mandatoryMonths.push(m);
      }
    }

    const expectedPeriods: number[] = [...mandatoryMonths];
    if (normalizedPaid.includes(0) && !expectedPeriods.includes(0)) {
      expectedPeriods.unshift(0);
    }
    normalizedPaid.forEach(m => {
      if (!expectedPeriods.includes(m)) {
        expectedPeriods.push(m);
      }
    });
    expectedPeriods.sort((a, b) => a - b);

    return {
      isFirstYear: false,
      enrollmentFeeRequired: false,
      meetingsStartMonth: effectiveStartMonth,
      facultativeMonths: [],
      mandatoryMonths,
      expectedPeriods
    };
  }
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

/**
 * Retorna o rótulo formatado de qualquer mês ou matrícula.
 * 0 -> "Matrícula"
 * 1..12 -> "Janeiro" .. "Dezembro"
 */
export function formatContributionMonth(monthNum: number, short = false): string {
  if (monthNum === 0) return short ? 'Matr.' : 'Matrícula';
  if (monthNum >= 1 && monthNum <= 12) {
    return short ? MONTH_SHORT[monthNum - 1] : MONTH_NAMES[monthNum - 1];
  }
  return `Mês ${monthNum}`;
}

/**
 * Verifica se um determinado período de contribuição (0 = Matrícula, 1..12 = Jan..Dez) está vencido.
 * - Para anos anteriores (< ano atual): tudo está vencido.
 * - Para anos futuros (> ano atual): nada está vencido.
 * - No ano atual:
 *   - Matrícula (0): se exigida, vence no início das aulas/encontros (ou mês 2/3).
 *   - Meses (1..12): vence se o mês for menor que o mês corrente.
 */
export function isPeriodOverdue(
  period: number,
  targetYear: number,
  meetingsStartMonth: number = 3
): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (targetYear < currentYear) return true;
  if (targetYear > currentYear) return false;

  if (period === 0) {
    // Matrícula no ano corrente: considerada vencida se já atingiu o mês de início ou matrícula
    return currentMonth >= Math.min(meetingsStartMonth, 2);
  }
  return period < currentMonth;
}

/**
 * Verifica se um período de contribuição está no mês corrente.
 */
export function isPeriodCurrent(
  period: number,
  targetYear: number
): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (targetYear !== currentYear) return false;
  if (period === 0) return currentMonth <= 2; // Período de matrículas ativas no início do ano
  return period === currentMonth;
}

/**
 * Verifica se um período de contribuição é futuro (a vencer nos meses seguintes).
 */
export function isPeriodFuture(
  period: number,
  targetYear: number
): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (targetYear > currentYear) return true;
  if (targetYear < currentYear) return false;
  if (period === 0) return false;
  return period > currentMonth;
}

