import { Student, Class, Contribution } from '../types';
import { parseSafeDate } from './utils';

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
    const d = parseSafeDate(studentClass.start_date);
    if (!isNaN(d.getTime())) return d.getFullYear();
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
      const d = parseSafeDate(student.start_date);
      if (!isNaN(d.getTime())) {
        // Se o estudante ingressou antes do ano analisado -> é veterano
        if (d.getFullYear() < targetYear) return false;
        // Se ingressou exatamente no targetYear -> é ingressante / 1º ano
        if (d.getFullYear() === targetYear) return true;
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
      const d = parseSafeDate(academicSettings.term1_start);
      if (!isNaN(d.getTime())) {
        startMonth = d.getMonth() + 1;
      }
    }
  }

  if (studentClass?.start_date) {
    const cd = parseSafeDate(studentClass.start_date);
    if (!isNaN(cd.getTime())) {
      startMonth = cd.getMonth() + 1;
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

/**
 * Calcula o plano acadêmico e financeiro de contribuições do estudante para o ano letivo.
 * 
 * Regra:
 * - 1º ano / início de curso:
 *   - Matrícula (mês 0): Obrigatória.
 *   - Janeiro (1) e Fevereiro (2): FACULTATIVOS (não geram pendência se não pagos; se pagos, são reconhecidos).
 *   - Mês de início dos encontros em diante (ex: 3 a 12): Obrigatórios.
 * - Veteranos (2º ano em diante):
 *   - Janeiro (1) e Fevereiro (2): NÃO SÃO FACULTATIVOS. São meses normais de contribuição escolar.
 *   - Todos os meses do ano letivo (1 a 12) são obrigatórios.
 */
export function getStudentContributionPlan(
  student: Student,
  studentClass: Class | undefined,
  targetYear: number,
  paidMonths: number[] = [],
  academicSettings?: any
): ContributionPlan {
  const isFirstYear = isFirstYearOrStarting(student, studentClass, targetYear);
  const meetingsStart = getMeetingsStartMonth(studentClass, academicSettings);

  let academicEndMonth = 12;
  if (academicSettings?.term2_end) {
    const ed = new Date(academicSettings.term2_end + 'T00:00:00');
    if (!isNaN(ed.getTime())) {
      academicEndMonth = ed.getMonth() + 1;
    }
  }
  if (studentClass?.semester === '1') {
    academicEndMonth = Math.min(academicEndMonth, 6);
  }

  // Verifica se o aluno já pagou a matrícula (mês 0 ou referência a matrícula)
  const hasPaidMatricula = paidMonths.includes(0);

  if (isFirstYear) {
    // 1º Ano / Início de curso:
    // Janeiro e Fevereiro são facultativos
    const facultativeMonths = [1, 2].filter(m => m < meetingsStart);
    
    // Meses regulares obrigatórios: do início dos encontros até o encerramento letivo
    const mandatoryMonths: number[] = [];
    for (let m = meetingsStart; m <= academicEndMonth; m++) {
      mandatoryMonths.push(m);
    }

    // Períodos esperados:
    // 1) Matrícula (0) é obrigatória para o 1º ano!
    const expectedPeriods: number[] = [0];

    // 2) Meses obrigatórios (encontros)
    mandatoryMonths.forEach(m => {
      if (!expectedPeriods.includes(m)) expectedPeriods.push(m);
    });

    // 3) Se o aluno pagou os facultativos (Janeiro ou Fevereiro), inclui para não sumir do status de pago
    paidMonths.forEach(m => {
      if (facultativeMonths.includes(m) && !expectedPeriods.includes(m)) {
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
    // Veteranos (2º ano em diante):
    // Janeiro e Fevereiro NÃO SÃO FACULTATIVOS.
    const mandatoryMonths: number[] = [];
    for (let m = 1; m <= academicEndMonth; m++) {
      mandatoryMonths.push(m);
    }

    const expectedPeriods: number[] = [...mandatoryMonths];

    // Se o veterano pagou matrícula/rematrícula (mês 0), inclui nos períodos esperados
    if (hasPaidMatricula && !expectedPeriods.includes(0)) {
      expectedPeriods.unshift(0);
    }

    // Inclui eventuais antecipações pagas
    paidMonths.forEach(m => {
      if (!expectedPeriods.includes(m)) {
        expectedPeriods.push(m);
      }
    });

    expectedPeriods.sort((a, b) => a - b);

    return {
      isFirstYear: false,
      enrollmentFeeRequired: false,
      meetingsStartMonth: 1, // Veteranos têm ciclo contínuo desde Janeiro
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

