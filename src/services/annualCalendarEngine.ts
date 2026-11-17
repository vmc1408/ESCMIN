/**
 * Motor de Cálculo e Regras de Negócio do Calendário Anual de Aulas
 * Implementa validação, geração determinística, precedência de feriados,
 * anos bissextos, preservação de ajustes manuais e versionamento.
 */

import {
  CalendarGenerationParameters,
  CalendarDayRecord,
  CalendarVersion,
  CalendarSummary,
  DayClassification,
  AcademicPeriod,
  RecessInterval,
  HolidayEntry
} from '../types/annualCalendar';
import { fetchAll, saveData, saveBatch, deleteQuery, fetchQuery, fetchById } from '../lib/database';
import { getClassWeekdays, sanitizeAcademicSettings, normalizeClassWeekdays, normalizeScheduleDate } from '../lib/academicUtils';
import { isItemInUnit } from '../lib/unitService';

export const MONTH_NAMES_BR = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const WEEKDAY_NAMES_BR = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

export const WEEKDAY_SHORT_BR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Verifica se um ano é bissexto
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Retorna a quantidade de dias em um mês (0 = Janeiro .. 11 = Dezembro),
 * respeitando anos bissextos para Fevereiro (29 dias).
 */
export function getDaysInMonth(year: number, monthIndex: number): number {
  if (monthIndex === 1) { // Fevereiro
    return isLeapYear(year) ? 29 : 28;
  }
  // Meses com 30 dias: Abril (3), Junho (5), Setembro (8), Novembro (10)
  if ([3, 5, 8, 10].includes(monthIndex)) {
    return 30;
  }
  return 31;
}

/**
 * Converte data string YYYY-MM-DD para Date em UTC seguro (meio-dia)
 */
export function parseDateSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Validação de integridade dos parâmetros do ano letivo
 */
export function validateCalendarParameters(params: CalendarGenerationParameters): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 1. Validação do ano
  if (!params.year || params.year < 2000 || params.year > 2100) {
    errors.push('Ano letivo inválido. Deve estar entre 2000 e 2100.');
  }

  // 2. Data início e fim do ano letivo
  if (!params.start_date || !params.end_date) {
    errors.push('Informe as datas de início e término do ano letivo.');
  } else if (params.start_date > params.end_date) {
    errors.push('A data de início do ano letivo deve ser anterior à data de término.');
  }

  // 3. Dias da semana
  if (!params.weekdays || params.weekdays.length === 0) {
    errors.push('Selecione pelo menos um dia da semana para realização de aulas.');
  }

  // 4. Períodos letivos
  const activePeriods = (params.periods || []).filter(p => p.is_active);
  if (activePeriods.length === 0) {
    errors.push('Cadastre e ative pelo menos um período letivo para o ano.');
  } else {
    for (let i = 0; i < activePeriods.length; i++) {
      const p = activePeriods[i];
      if (!p.start_date || !p.end_date) {
        errors.push(`O período "${p.name || i + 1}" possui datas incompletas.`);
      } else if (p.start_date > p.end_date) {
        errors.push(`No período "${p.name}", a data inicial é posterior à final.`);
      }

      // Validar sobreposição entre períodos ativos
      for (let j = i + 1; j < activePeriods.length; j++) {
        const p2 = activePeriods[j];
        if (p.start_date <= p2.end_date && p.end_date >= p2.start_date) {
          errors.push(`Existe sobreposição entre os períodos "${p.name}" e "${p2.name}".`);
        }
      }
    }
  }

  // 5. Recessos e férias
  for (const r of params.recesses || []) {
    if (r.start_date && r.end_date && r.start_date > r.end_date) {
      errors.push(`No recesso/férias "${r.name}", a data inicial é posterior à final.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Geração determinística de todos os dias do ano letivo com aplicação estrita das regras de precedência.
 *
 * ORDEM DE PRECEDÊNCIA (conforme especificação):
 * 1. Ajuste manual autorizado;
 * 2. Suspensão institucional;
 * 3. Férias ou recesso;
 * 4. Feriado municipal;
 * 5. Feriado estadual;
 * 6. Feriado nacional;
 * 7. Dia semanal de aula (dentro de período letivo ativo);
 * 8. Dia comum sem aula.
 */
export function generateAnnualCalendarDays(
  params: CalendarGenerationParameters,
  existingDays?: Record<string, CalendarDayRecord>
): Record<string, CalendarDayRecord> {
  const result: Record<string, CalendarDayRecord> = {};
  const year = params.year;
  const activeWeekdaysSet = new Set(params.weekdays);

  // Mapeamento de períodos ativos
  const activePeriods = (params.periods || []).filter(p => p.is_active);

  // Mapeamento de recessos e férias por data
  const recessMap = new Map<string, RecessInterval>();
  (params.recesses || []).forEach(r => {
    if (!r.start_date || !r.end_date) return;
    let curr = parseDateSafe(r.start_date);
    const end = parseDateSafe(r.end_date);
    while (curr <= end) {
      const y = curr.getUTCFullYear();
      const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
      const d = String(curr.getUTCDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;
      recessMap.set(dateKey, r);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
  });

  // Mapeamento de feriados por data
  const holidayMap = new Map<string, HolidayEntry>();
  (params.holidays || []).forEach(h => {
    if (h.date) {
      holidayMap.set(h.date, h);
    }
  });

  // Preservação de ajustes manuais
  const shouldPreserve = params.preserve_manual_overrides !== false && existingDays;

  // Itera por todos os 12 meses do ano
  for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
    const daysInMonth = getDaysInMonth(year, monthIdx);

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const mStr = String(monthIdx + 1).padStart(2, '0');
      const dStr = String(dayNum).padStart(2, '0');
      const dateKey = `${year}-${mStr}-${dStr}`;

      const dateObj = parseDateSafe(dateKey);
      const dayOfWeek = dateObj.getUTCDay(); // 0 = Dom, 1 = Seg, ... 6 = Sab

      // 1. AJUSTE MANUAL AUTORIZADO (Prioridade Máxima)
      if (shouldPreserve && existingDays[dateKey]?.is_manual_override) {
        result[dateKey] = {
          ...existingDays[dateKey],
          date: dateKey,
          day_of_week: dayOfWeek,
          year: year,
          unit_id: params.unit_id || 'matriz'
        };
        continue;
      }

      // 2. SUSPENSÃO INSTITUCIONAL
      const recessEntry = recessMap.get(dateKey);
      if (recessEntry && recessEntry.type === 'suspensao') {
        result[dateKey] = {
          date: dateKey,
          day_of_week: dayOfWeek,
          year: year,
          unit_id: params.unit_id || 'matriz',
          classification: 'suspension',
          is_class_day: false,
          event_name: recessEntry.name,
          origin: 'Suspensão Institucional',
          is_manual_override: false
        };
        continue;
      }

      // 3. FÉRIAS OU RECESSO
      if (recessEntry) {
        const isVacation = recessEntry.type === 'ferias';
        result[dateKey] = {
          date: dateKey,
          day_of_week: dayOfWeek,
          year: year,
          unit_id: params.unit_id || 'matriz',
          classification: isVacation ? 'vacation' : 'recess',
          is_class_day: false,
          event_name: recessEntry.name,
          origin: isVacation ? 'Férias Escolares' : 'Recesso Escolar',
          is_manual_override: false
        };
        continue;
      }

      // 4, 5, 6. FERIADOS (Municipal > Estadual > Nacional)
      const holiday = holidayMap.get(dateKey);
      if (holiday && !holiday.has_class) {
        let classification: DayClassification = 'holiday_nac';
        if (holiday.type === 'municipal') classification = 'holiday_mun';
        else if (holiday.type === 'estadual') classification = 'holiday_est';
        else if (holiday.type === 'institucional') classification = 'holiday_inst';

        result[dateKey] = {
          date: dateKey,
          day_of_week: dayOfWeek,
          year: year,
          unit_id: params.unit_id || 'matriz',
          classification,
          is_class_day: false,
          event_name: holiday.name,
          origin: holiday.origin,
          is_manual_override: false
        };
        continue;
      }

      // 7. DIA SEMANAL DE AULA DENTRO DO PERÍODO LETIVO
      // Verifica se a data está contida em algum período letivo ativo
      const currentPeriod = activePeriods.find(
        p => dateKey >= p.start_date && dateKey <= p.end_date
      );

      const isWeekdayClass = activeWeekdaysSet.has(dayOfWeek);

      if (currentPeriod && isWeekdayClass) {
        result[dateKey] = {
          date: dateKey,
          day_of_week: dayOfWeek,
          year: year,
          period_id: currentPeriod.id,
          period_name: currentPeriod.name,
          unit_id: params.unit_id || 'matriz',
          classification: 'class_day',
          is_class_day: true,
          event_name: `Dia Letivo (${currentPeriod.name})`,
          origin: 'Cronograma Regular',
          is_manual_override: false
        };
        continue;
      }

      // 8. DIA COMUM SEM AULA
      // Se for fim de semana (Sábado ou Domingo) e não foi configurado como aula
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      result[dateKey] = {
        date: dateKey,
        day_of_week: dayOfWeek,
        year: year,
        period_id: currentPeriod?.id,
        period_name: currentPeriod?.name,
        unit_id: params.unit_id || 'matriz',
        classification: isWeekend ? 'weekend_off' : 'non_class_day',
        is_class_day: false,
        event_name: isWeekend ? (dayOfWeek === 0 ? 'Domingo' : 'Sábado') : 'Sem Aula Programada',
        origin: 'Calendário Padrão',
        is_manual_override: false
      };
    }
  }

  return result;
}

/**
 * Calcula o sumário completo e indicadores do calendário gerado
 */
export function calculateCalendarSummary(
  year: number,
  days: Record<string, CalendarDayRecord>,
  targetMinimum?: number,
  periods: AcademicPeriod[] = []
): CalendarSummary {
  const monthMap = new Map<number, { class_days: number; holidays: number; recess_days: number }>();
  for (let m = 1; m <= 12; m++) {
    monthMap.set(m, { class_days: 0, holidays: 0, recess_days: 0 });
  }

  const periodMap = new Map<string, number>();
  periods.forEach(p => periodMap.set(p.id, 0));

  let totalClassDays = 0;
  let totalHolidays = 0;
  let totalRecessDays = 0;
  let totalManualOverrides = 0;

  Object.values(days).forEach(day => {
    if (day.year !== year) return;
    const monthNum = parseInt(day.date.split('-')[1], 10);
    const mData = monthMap.get(monthNum);

    if (day.is_manual_override) {
      totalManualOverrides++;
    }

    if (day.is_class_day) {
      totalClassDays++;
      if (mData) mData.class_days++;
      if (day.period_id && periodMap.has(day.period_id)) {
        periodMap.set(day.period_id, (periodMap.get(day.period_id) || 0) + 1);
      }
    } else {
      if (['holiday_nac', 'holiday_est', 'holiday_mun', 'holiday_inst'].includes(day.classification)) {
        totalHolidays++;
        if (mData) mData.holidays++;
      } else if (['recess', 'vacation', 'suspension'].includes(day.classification)) {
        totalRecessDays++;
        if (mData) mData.recess_days++;
      }
    }
  });

  const hasTarget = typeof targetMinimum === 'number' && targetMinimum > 0;
  const diff = hasTarget ? totalClassDays - targetMinimum : 0;

  const byMonth = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    month_name: MONTH_NAMES_BR[month - 1],
    class_days: data.class_days,
    holidays: data.holidays,
    recess_days: data.recess_days
  }));

  const byPeriod = periods.map(p => ({
    period_id: p.id,
    period_name: p.name,
    class_days: periodMap.get(p.id) || 0,
    start_date: p.start_date,
    end_date: p.end_date,
    is_active: p.is_active
  }));

  return {
    year,
    total_class_days: totalClassDays,
    target_minimum: hasTarget ? targetMinimum : undefined,
    difference_from_target: hasTarget ? diff : undefined,
    is_below_target: hasTarget ? totalClassDays < targetMinimum : false,
    total_holidays: totalHolidays,
    total_recess_days: totalRecessDays,
    total_manual_overrides: totalManualOverrides,
    by_month: byMonth,
    by_period: byPeriod
  };
}

/**
 * Aplica um ajuste manual a uma data específica
 */
export function applyManualOverrideToDate(
  days: Record<string, CalendarDayRecord>,
  dateStr: string,
  newClassification: DayClassification,
  isClassDay: boolean,
  reason: string,
  userName?: string
): Record<string, CalendarDayRecord> {
  const current = days[dateStr];
  if (!current) return days;

  return {
    ...days,
    [dateStr]: {
      ...current,
      classification: newClassification,
      is_class_day: isClassDay,
      is_manual_override: true,
      override_reason: reason || 'Ajuste manual do operador',
      last_modified_by: userName || 'Administrador',
      last_modified_at: new Date().toISOString()
    }
  };
}

/**
 * Remove o ajuste manual de uma data, voltando à regra calculada
 */
export function removeManualOverrideFromDate(
  days: Record<string, CalendarDayRecord>,
  dateStr: string,
  params: CalendarGenerationParameters
): Record<string, CalendarDayRecord> {
  // Regenera especificamente essa data recalculando
  const tempExisting = { ...days };
  delete tempExisting[dateStr];

  const regenerated = generateAnnualCalendarDays(params, tempExisting);
  return {
    ...days,
    [dateStr]: regenerated[dateStr] || days[dateStr]
  };
}

/**
 * Regenera somente um mês específico (1 a 12), preservando opcionalmente os ajustes manuais existentes
 */
export function regenerateMonthDays(
  params: CalendarGenerationParameters,
  existingDays: Record<string, CalendarDayRecord>,
  month: number,
  preserveManualOverrides: boolean = true
): Record<string, CalendarDayRecord> {
  const fullRegenerated = generateAnnualCalendarDays(
    { ...params, preserve_manual_overrides: preserveManualOverrides },
    preserveManualOverrides ? existingDays : undefined
  );

  const monthPrefix = `${params.year}-${String(month).padStart(2, '0')}-`;
  const result = { ...existingDays };

  Object.entries(fullRegenerated).forEach(([dateKey, dayRec]) => {
    if (dateKey.startsWith(monthPrefix)) {
      result[dateKey] = dayRec;
    }
  });

  return result;
}

/**
 * Regenera somente um período específico, preservando opcionalmente os ajustes manuais existentes
 */
export function regeneratePeriodDays(
  params: CalendarGenerationParameters,
  existingDays: Record<string, CalendarDayRecord>,
  periodId: string,
  preserveManualOverrides: boolean = true
): Record<string, CalendarDayRecord> {
  const period = params.periods.find(p => p.id === periodId);
  if (!period) return existingDays;

  const fullRegenerated = generateAnnualCalendarDays(
    { ...params, preserve_manual_overrides: preserveManualOverrides },
    preserveManualOverrides ? existingDays : undefined
  );

  const result = { ...existingDays };
  Object.entries(fullRegenerated).forEach(([dateKey, dayRec]) => {
    if (dateKey >= period.start_date && dateKey <= period.end_date) {
      result[dateKey] = dayRec;
    }
  });

  return result;
}

// ==========================================
// PERSISTÊNCIA E VERSIONAMENTO
// ==========================================

const STORAGE_KEY_PREFIX = 'academic_calendar_versions_';
const DRAFT_STORAGE_PREFIX = 'academic_calendar_draft_';

export interface CalendarDraftPayload {
  params: CalendarGenerationParameters;
  days: Record<string, CalendarDayRecord> | null;
  saved_at: string;
  saved_by: string;
}

/**
 * Salva o rascunho atual de parâmetros e/ou dias calculados.
 * Funciona mesmo se os dias de aula ainda não foram gerados, garantindo que o usuário
 * nunca perca os períodos, recessos, feriados ou parâmetros configurados.
 */
export async function saveCalendarDraft(
  params: CalendarGenerationParameters,
  days: Record<string, CalendarDayRecord> | null = null,
  userName?: string
): Promise<{ success: boolean; saved_at: string }> {
  const year = params.year;
  const unitId = params.unit_id || 'matriz';
  const now = new Date().toISOString();

  const draftData: CalendarDraftPayload = {
    params,
    days,
    saved_at: now,
    saved_by: userName || 'Administrador'
  };

  // 1. Salva no localStorage imediatamente
  try {
    localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${year}_${unitId}`, JSON.stringify(draftData));
  } catch (err) {
    console.warn('[CalendarEngine] Erro ao salvar rascunho no localStorage:', err);
    // Se estourar cota com os dias, salva ao menos os parâmetros essenciais
    try {
      localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${year}_${unitId}`, JSON.stringify({
        ...draftData,
        days: null
      }));
    } catch (e) {}
  }

  // 2. Persistência de backup em academic_parameters se disponível
  try {
    const draftRecordId = `draft_cal_${year}_${unitId}`;
    await saveData('academic_parameters', draftRecordId, {
      id: draftRecordId,
      unit_id: unitId,
      notes: JSON.stringify({
        draft_year: year,
        start_date: params.start_date,
        end_date: params.end_date,
        weekdays: params.weekdays,
        periods: params.periods,
        recesses: params.recesses,
        holidays_count: params.holidays?.length || 0,
        saved_at: now
      }),
      updated_at: now
    }).catch(() => {});
  } catch (e) {
    // Falha silenciosa de rede não bloqueia o rascunho local
  }

  return { success: true, saved_at: now };
}

/**
 * Obtém o rascunho salvo para o ano e unidade especificados
 */
export function getCalendarDraft(year: number, unitId = 'matriz'): CalendarDraftPayload | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${year}_${unitId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[CalendarEngine] Erro ao carregar rascunho do localStorage:', err);
  }
  return null;
}

/**
 * Carrega todas as versões de calendário para um determinado ano e unidade
 */
export async function getCalendarVersions(year: number, unitId = 'matriz'): Promise<CalendarVersion[]> {
  // 1. Tenta carregar do Supabase se a tabela existir
  try {
    const list = await fetchAll('academic_calendar_versions', '*', 'version', false);
    const filtered = (list || []).filter((v: any) => 
      Number(v.year) === Number(year) && 
      (v.unit_id === unitId || (!v.unit_id && unitId === 'matriz'))
    );

    if (filtered.length > 0) {
      return filtered.sort((a: any, b: any) => b.version - a.version);
    }
  } catch (err) {
    console.warn('[CalendarEngine] Erro ao buscar versões no banco remoto, verificando cache local:', err);
  }

  // 2. Fallback para localStorage
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${year}_${unitId}`);
    if (raw) {
      const parsed: CalendarVersion[] = JSON.parse(raw);
      return parsed.sort((a, b) => b.version - a.version);
    }
  } catch (e) {}

  return [];
}

export interface PublishSyncOptions {
  classes?: any[];
  weekdayClasses?: Record<number, string[]>;
  userId?: string;
  syncSettings?: boolean;
}

/**
 * Salva uma nova versão do calendário, preservando as anteriores para auditoria.
 */
export async function saveCalendarVersion(
  params: CalendarGenerationParameters,
  days: Record<string, CalendarDayRecord>,
  status: 'draft' | 'approved' | 'published',
  userName?: string,
  notes?: string,
  syncOptions?: PublishSyncOptions
): Promise<CalendarVersion> {
  const year = params.year;
  const unitId = params.unit_id || 'matriz';
  const existingVersions = await getCalendarVersions(year, unitId);
  const nextVersionNum = existingVersions.length > 0 
    ? Math.max(...existingVersions.map(v => v.version)) + 1 
    : 1;

  const summary = calculateCalendarSummary(year, days, params.minimum_class_days_target, params.periods);

  const classDaysByMonth: Record<string, number> = {};
  summary.by_month.forEach(m => {
    classDaysByMonth[String(m.month)] = m.class_days;
  });

  const classDaysByPeriod: Record<string, number> = {};
  summary.by_period.forEach(p => {
    classDaysByPeriod[p.period_id] = p.class_days;
  });

  const newVersion: CalendarVersion = {
    id: `cal_ver_${year}_${unitId}_v${nextVersionNum}_${Date.now()}`,
    year,
    version: nextVersionNum,
    status,
    title: `Calendário Letivo ${year} - Versão ${nextVersionNum} (${status === 'published' ? 'Oficial' : status === 'approved' ? 'Aprovado' : 'Rascunho'})`,
    state: params.state,
    city: params.city,
    start_date: params.start_date,
    end_date: params.end_date,
    weekdays: params.weekdays,
    minimum_class_days_target: params.minimum_class_days_target,
    periods: params.periods,
    recesses: params.recesses,
    holidays: params.holidays,
    total_class_days: summary.total_class_days,
    class_days_by_month: classDaysByMonth,
    class_days_by_period: classDaysByPeriod,
    total_holidays: summary.total_holidays,
    total_recess_days: summary.total_recess_days,
    manual_overrides_count: summary.total_manual_overrides,
    days,
    parameters_snapshot: params,
    created_at: new Date().toISOString(),
    created_by: userName || 'Administrador',
    unit_id: unitId,
    notes
  };

  // 1. Salvar no localStorage de forma resiliente (mantém até 5 versões mais recentes para evitar QuotaExceeded)
  try {
    const updated = [newVersion, ...existingVersions.filter(v => v.id !== newVersion.id)].slice(0, 5);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${year}_${unitId}`, JSON.stringify(updated));
  } catch (e) {
    console.warn('[CalendarEngine] Aviso ao salvar versão no localStorage, tentando salvar apenas versão atual:', e);
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${year}_${unitId}`, JSON.stringify([newVersion]));
    } catch (innerE) {
      console.error('[CalendarEngine] Falha ao gravar no localStorage:', innerE);
    }
  }

  // 2. Atualizar também o rascunho persistente caso seja status draft
  if (status === 'draft') {
    await saveCalendarDraft(params, days, userName);
  }

  // 3. Persistir no Supabase se configurado
  try {
    await saveData('academic_calendar_versions', newVersion.id, newVersion).catch(() => {});
  } catch (err) {
    console.warn('[CalendarEngine] Aviso ao salvar versão no banco remoto:', err);
  }

  // 4. Se o status for 'published', sincroniza também com 'calendar_events' e 'academic_settings'
  if (status === 'published') {
    await syncCalendarEventsWithPublishedDays(newVersion, syncOptions);
  }

  return newVersion;
}

export interface InitialAnnualParamsFromSettings {
  start_date: string;
  end_date: string;
  weekdays: number[];
  periods: AcademicPeriod[];
  weekdayClasses: Record<number, string[]>;
}

/**
 * Converte os parâmetros salvos em `academic_settings` (Parâmetros Semanais e Semestres)
 * no formato inicial esperado pelo Calendário Anual, respeitando fallbacks de `weekday_terms`.
 */
export function buildInitialAnnualParamsFromAcademicSettings(
  settings: any,
  targetYear: number
): InitialAnnualParamsFromSettings | null {
  if (!settings || typeof settings !== 'object') return null;

  const cleaned = sanitizeAcademicSettings(settings);
  const weekdays = normalizeClassWeekdays(cleaned.class_weekdays, []);
  const weekdayTerms = cleaned.weekday_terms && typeof cleaned.weekday_terms === 'object' ? cleaned.weekday_terms : {};

  let t1Start = normalizeScheduleDate(cleaned.term1_start || '');
  let t1End = normalizeScheduleDate(cleaned.term1_end || '');
  let t2Start = normalizeScheduleDate(cleaned.term2_start || '');
  let t2End = normalizeScheduleDate(cleaned.term2_end || '');

  const candidateDays = weekdays.length > 0
    ? weekdays
    : Object.keys(weekdayTerms).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 6).sort((a, b) => a - b);

  for (const d of candidateDays) {
    const dt = weekdayTerms[d] || weekdayTerms[String(d)];
    if (!dt || typeof dt !== 'object') continue;
    if (!t1Start && dt.term1_start) t1Start = normalizeScheduleDate(dt.term1_start);
    if (!t1End && dt.term1_end) t1End = normalizeScheduleDate(dt.term1_end);
    if (!t2Start && dt.term2_start) t2Start = normalizeScheduleDate(dt.term2_start);
    if (!t2End && dt.term2_end) t2End = normalizeScheduleDate(dt.term2_end);
  }

  const periods: AcademicPeriod[] = [
    {
      id: `sem1_${targetYear}`,
      name: '1º Semestre',
      start_date: t1Start,
      end_date: t1End,
      is_active: true,
      color: '#2563eb'
    },
    {
      id: `sem2_${targetYear}`,
      name: '2º Semestre',
      start_date: t2Start,
      end_date: t2End,
      is_active: true,
      color: '#059669'
    }
  ];

  const allStarts = [t1Start, t2Start].filter(Boolean).sort();
  const allEnds = [t1End, t2End].filter(Boolean).sort();
  const start_date = allStarts[0] || '';
  const end_date = allEnds[allEnds.length - 1] || '';

  const weekdayClasses: Record<number, string[]> = {};
  if (cleaned.weekday_classes && typeof cleaned.weekday_classes === 'object') {
    Object.entries(cleaned.weekday_classes).forEach(([k, list]) => {
      const dNum = Number(k);
      if (!isNaN(dNum) && dNum >= 1 && dNum <= 6 && Array.isArray(list)) {
        weekdayClasses[dNum] = list.filter(Boolean).map(String);
      }
    });
  }

  if (weekdays.length === 0 && !start_date && !end_date && Object.keys(weekdayClasses).length === 0) {
    return null;
  }

  return {
    start_date,
    end_date,
    weekdays,
    periods,
    weekdayClasses
  };
}

/**
 * Verifica se uma data respeita os termos específicos de um dia da semana (quando customizados em Parâmetros).
 * Se o dia não possui `weekday_terms` próprios configurados, segue os períodos gerais do Calendário Anual.
 */
export function isDateWithinWeekdayTerms(
  dateStr: string,
  weekday: number,
  settings: any
): boolean {
  if (!dateStr || !settings?.weekday_terms) return true;
  const dayTerms = settings.weekday_terms[weekday] || settings.weekday_terms[String(weekday)];
  if (!dayTerms || typeof dayTerms !== 'object') return true;

  const hasCustom = Boolean(
    dayTerms.term1_start || dayTerms.term1_end || dayTerms.term2_start || dayTerms.term2_end
  );
  if (!hasCustom) return true;

  const t1s = normalizeScheduleDate(dayTerms.term1_start || settings.term1_start || '');
  const t1e = normalizeScheduleDate(dayTerms.term1_end || settings.term1_end || '');
  const t2s = normalizeScheduleDate(dayTerms.term2_start || settings.term2_start || '');
  const t2e = normalizeScheduleDate(dayTerms.term2_end || settings.term2_end || '');

  const inSem1 = Boolean(t1s && t1e && dateStr >= t1s && dateStr <= t1e);
  const inSem2 = Boolean(t2s && t2e && dateStr >= t2s && dateStr <= t2e);

  if (!t1s && !t1e && !t2s && !t2e) return true;
  return inSem1 || inSem2;
}

/**
 * Sincroniza os dias letivos, termos, turmas vinculadas e academic_settings
 * com a tabela principal 'calendar_events' para que todo o sistema
 * (Frequência, Notas, Grade Acadêmica, Ficha do Aluno e Relatórios) reflita os novos dias de aula.
 */
export async function syncCalendarEventsWithPublishedDays(
  version: CalendarVersion,
  options?: PublishSyncOptions
): Promise<void> {
  const yearStr = String(version.year);
  const unitId = version.unit_id || 'matriz';

  try {
    // 1. Limpa eventos gerados automaticamente pelo calendário deste ano e unidade
    const [allEvents, fetchedClasses, existingSettings] = await Promise.all([
      fetchAll('calendar_events', '*', 'start_date'),
      options?.classes
        ? Promise.resolve(options.classes)
        : fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]).catch(() => []),
      fetchById('academic_settings', unitId === 'matriz' ? 'current' : `academic_settings_${unitId}`).catch(() => null)
    ]);

    const toDeleteIds = (allEvents || [])
      .filter((e: any) => {
        if (!e.start_date || !e.start_date.startsWith(yearStr)) return false;
        const eUnit = e.unit_id || 'matriz';
        if (unitId !== 'all' && !isItemInUnit(eUnit, unitId)) return false;
        const desc = (e.description || '').toLowerCase();
        const isAutoDesc = desc.includes('calendário anual') || desc.includes('cronograma automático');
        return (
          e.type === 'class_day' ||
          ((e.type === 'start_term' || e.type === 'end_term') && isAutoDesc) ||
          ((e.type === 'event' || e.type === 'cancelled_class') && desc.includes('calendário anual')) ||
          isAutoDesc
        );
      })
      .map((e: any) => e.id)
      .filter(Boolean);

    if (toDeleteIds.length > 0) {
      for (let i = 0; i < toDeleteIds.length; i += 80) {
        const chunk = toDeleteIds.slice(i, i + 80);
        await deleteQuery('calendar_events', [{ field: 'id', operator: 'in', value: chunk }]);
      }
    }

    // 2. Identifica turmas ativas da unidade e mapeia turmas por dia da semana
    const unitClasses = (fetchedClasses || []).filter((c: any) => {
      if (c.status && c.status !== 'Ativo') return false;
      if (unitId === 'all') return true;
      return isItemInUnit(c.unit_id || c.polo, unitId);
    });

    const resolvedWeekdayClasses: Record<number, string[]> = { ...(existingSettings?.weekday_classes || {}) };
    (version.weekdays || []).forEach(w => {
      if (w < 1 || w > 6) return;
      const explicitIds = options?.weekdayClasses?.[w];
      if (Array.isArray(explicitIds) && explicitIds.length > 0) {
        resolvedWeekdayClasses[w] = explicitIds;
      } else if (!Array.isArray(resolvedWeekdayClasses[w]) || resolvedWeekdayClasses[w].length === 0) {
        const matched = unitClasses
          .filter((c: any) => getClassWeekdays(c, existingSettings).includes(w))
          .map((c: any) => c.id)
          .filter(Boolean);
        resolvedWeekdayClasses[w] = matched;
      }
    });

    // 3. Cria eventos de dias letivos vinculados às turmas (respeitando overrides e weekday_terms)
    const newItems: any[] = [];
    const nowIso = new Date().toISOString();
    const signatureDesc = `Calendário Anual Oficial (${version.title})`;
    const configuredWeekdaysSet = new Set((version.weekdays || []).map(Number));

    Object.values(version.days).forEach(day => {
      const wDay = day.day_of_week;

      if (day.is_class_day) {
        if (!day.is_manual_override && !isDateWithinWeekdayTerms(day.date, wDay, existingSettings)) {
          return;
        }
        const classIdsForDay = resolvedWeekdayClasses[wDay] || [];

        if (classIdsForDay.length > 0) {
          classIdsForDay.forEach(cid => {
            const cls = unitClasses.find((c: any) => String(c.id) === String(cid));
            newItems.push({
              title: cls ? `Dia de Aula - ${cls.name}` : `Aula - ${day.period_name || 'Calendário Anual'}`,
              start_date: day.date,
              end_date: day.date,
              type: 'class_day',
              description: signatureDesc,
              class_id: cid,
              unit_id: cls?.unit_id || unitId,
              ...(options?.userId ? { user_id: options.userId } : {}),
              created_at: nowIso
            });
          });
        } else {
          newItems.push({
            title: `Dia de Aula - ${day.period_name || 'Calendário Anual'}`,
            start_date: day.date,
            end_date: day.date,
            type: 'class_day',
            description: signatureDesc,
            class_id: null,
            unit_id: unitId,
            ...(options?.userId ? { user_id: options.userId } : {}),
            created_at: nowIso
          });
        }
      } else if (day.is_manual_override && configuredWeekdaysSet.has(wDay)) {
        newItems.push({
          title: 'Suspensão / Ajuste Anual',
          start_date: day.date,
          end_date: day.date,
          type: 'cancelled_class',
          description: `${signatureDesc}${day.override_reason ? ` - ${day.override_reason}` : ''}`,
          class_id: null,
          unit_id: unitId,
          ...(options?.userId ? { user_id: options.userId } : {}),
          created_at: nowIso
        });
      }
    });

    // 3.1. Persiste recessos e férias publicados para visibilidade e respeito no Calendário Mensal e Parâmetros
    (version.recesses || []).forEach(recess => {
      if (!recess.start_date || !recess.end_date) return;
      const prefix = recess.type === 'ferias' ? 'Férias' : recess.type === 'suspensao' ? 'Suspensão' : 'Recesso';
      const cleanName = recess.name?.trim() || prefix;
      const hasKeyword = /f[eé]rias|recesso|suspens[aã]o/i.test(cleanName);
      newItems.push({
        title: hasKeyword ? cleanName : `${prefix} - ${cleanName}`,
        start_date: recess.start_date,
        end_date: recess.end_date,
        type: 'event',
        description: signatureDesc,
        class_id: null,
        unit_id: unitId,
        ...(options?.userId ? { user_id: options.userId } : {}),
        created_at: nowIso
      });
    });

    // 4. Cria marcos de início e término de períodos ativos
    const activePeriods = (version.periods || []).filter(p => p.is_active);
    activePeriods.forEach(p => {
      if (p.start_date) {
        newItems.push({
          title: `Início - ${p.name}`,
          start_date: p.start_date,
          end_date: p.start_date,
          type: 'start_term',
          description: signatureDesc,
          class_id: null,
          unit_id: unitId,
          ...(options?.userId ? { user_id: options.userId } : {}),
          created_at: nowIso
        });
      }
      if (p.end_date) {
        newItems.push({
          title: `Término - ${p.name}`,
          start_date: p.end_date,
          end_date: p.end_date,
          type: 'end_term',
          description: signatureDesc,
          class_id: null,
          unit_id: unitId,
          ...(options?.userId ? { user_id: options.userId } : {}),
          created_at: nowIso
        });
      }
    });

    // Salva em lotes seguros
    if (newItems.length > 0) {
      for (let i = 0; i < newItems.length; i += 150) {
        await saveBatch('calendar_events', newItems.slice(i, i + 150), 60000);
      }
    }

    // 5. Sincroniza academic_settings preservando weekday_terms e atualizando ciclos gerais
    if (options?.syncSettings !== false) {
      const targetSettingsId = unitId === 'matriz' ? 'current' : `academic_settings_${unitId}`;
      const p1 = activePeriods[0];
      const p2 = activePeriods[1] || activePeriods[activePeriods.length - 1];
      const weekdayTitles: Record<number, string> = { ...(existingSettings?.weekday_titles || {}) };
      (version.weekdays || []).forEach(w => {
        if (w >= 1 && w <= 6 && !weekdayTitles[w]) {
          weekdayTitles[w] = `Aula, Classe(s) Turma(s) de ${WEEKDAY_NAMES_BR[w]}`;
        }
      });

      const updatedSettings = sanitizeAcademicSettings({
        ...(existingSettings || {}),
        id: targetSettingsId,
        unit_id: unitId,
        term1_start: p1?.start_date || version.start_date || existingSettings?.term1_start || '',
        term1_end: p1?.end_date || existingSettings?.term1_end || '',
        term2_start: p2 && p2.id !== p1?.id ? p2.start_date : (existingSettings?.term2_start || ''),
        term2_end: (p2 && p2.id !== p1?.id ? p2.end_date : version.end_date) || existingSettings?.term2_end || '',
        class_weekdays: (version.weekdays || []).filter(w => w >= 1 && w <= 6),
        weekday_titles: weekdayTitles,
        weekday_classes: resolvedWeekdayClasses,
        weekday_terms: existingSettings?.weekday_terms || {},
        updated_at: nowIso
      });

      await saveData('academic_settings', targetSettingsId, updatedSettings).catch(() => {});
      try {
        localStorage.setItem(`academic_settings_${targetSettingsId}`, JSON.stringify(updatedSettings));
        if (unitId !== 'matriz') {
          localStorage.setItem(`academic_settings_${unitId}`, JSON.stringify(updatedSettings));
        } else {
          localStorage.setItem('academic_settings_current', JSON.stringify(updatedSettings));
        }
        window.dispatchEvent(new Event('academic-settings-updated'));
        window.dispatchEvent(new Event('units-updated'));
      } catch {}
    }
  } catch (err) {
    console.error('[CalendarEngine] Erro ao sincronizar calendar_events com calendário publicado:', err);
  }
}
