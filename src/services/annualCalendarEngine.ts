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
import { fetchAll, saveData, deleteQuery, fetchQuery } from '../lib/database';

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
  targetMinimum: number,
  periods: AcademicPeriod[]
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

  const diff = totalClassDays - targetMinimum;

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
    target_minimum: targetMinimum,
    difference_from_target: diff,
    is_below_target: totalClassDays < targetMinimum,
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

/**
 * Carrega todas as versões de calendário para um determinado ano e unidade
 */
export async function getCalendarVersions(year: number, unitId = 'matriz'): Promise<CalendarVersion[]> {
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

  // Fallback para localStorage
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${year}_${unitId}`);
    if (raw) {
      const parsed: CalendarVersion[] = JSON.parse(raw);
      return parsed.sort((a, b) => b.version - a.version);
    }
  } catch (e) {}

  return [];
}

/**
 * Salva uma nova versão do calendário, preservando as anteriores para auditoria.
 */
export async function saveCalendarVersion(
  params: CalendarGenerationParameters,
  days: Record<string, CalendarDayRecord>,
  status: 'draft' | 'approved' | 'published',
  userName?: string,
  notes?: string
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
    title: `Calendário Letivo ${year} - Versão ${nextVersionNum}`,
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

  // 1. Salvar no localStorage de forma resiliente
  try {
    const updated = [newVersion, ...existingVersions];
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${year}_${unitId}`, JSON.stringify(updated));
  } catch (e) {
    console.warn('[CalendarEngine] Aviso ao salvar versão no localStorage:', e);
  }

  // 2. Persistir no Supabase
  try {
    await saveData('academic_calendar_versions', newVersion.id, newVersion);
  } catch (err) {
    console.warn('[CalendarEngine] Aviso ao salvar versão no banco remoto:', err);
  }

  // 3. Se o status for 'published', sincroniza também com 'calendar_events'
  if (status === 'published') {
    await syncCalendarEventsWithPublishedDays(newVersion);
  }

  return newVersion;
}

/**
 * Sincroniza os dias letivos, feriados e termos com a tabela principal 'calendar_events'
 * para que todo o sistema (Frequência, Calendário Mensal, Grade e Relatórios) reflita os novos dias de aula.
 */
export async function syncCalendarEventsWithPublishedDays(version: CalendarVersion): Promise<void> {
  const yearStr = String(version.year);
  const unitId = version.unit_id || 'matriz';

  try {
    // 1. Limpa eventos gerados automaticamente pelo calendário deste ano e unidade
    const allEvents = await fetchAll('calendar_events', '*', 'start_date');
    const toDeleteIds = (allEvents || [])
      .filter((e: any) => {
        if (!e.start_date || !e.start_date.startsWith(yearStr)) return false;
        const eUnit = e.unit_id || 'matriz';
        if (eUnit !== unitId && unitId !== 'all') return false;
        const desc = (e.description || '').toLowerCase();
        return (
          e.type === 'class_day' || 
          desc.includes('calendário anual') || 
          desc.includes('cronograma automático')
        );
      })
      .map((e: any) => e.id);

    if (toDeleteIds.length > 0) {
      await deleteQuery('calendar_events', [{ field: 'id', operator: 'in', value: toDeleteIds }]);
    }

    // 2. Cria eventos de dias letivos para os dias classificados como class_day
    const newItems: any[] = [];
    Object.values(version.days).forEach(day => {
      if (day.is_class_day) {
        newItems.push({
          title: `Aula - ${day.period_name || 'Calendário Anual'}`,
          start_date: day.date,
          end_date: day.date,
          type: 'class_day',
          description: `Calendário Anual Oficial (${version.title})`,
          unit_id: unitId,
          created_at: new Date().toISOString()
        });
      }
    });

    // Salva em lotes no Supabase
    for (let i = 0; i < newItems.length; i += 20) {
      const batch = newItems.slice(i, i + 20);
      await Promise.all(batch.map(item => saveData('calendar_events', null, item)));
    }
  } catch (err) {
    console.error('[CalendarEngine] Erro ao sincronizar calendar_events com calendário publicado:', err);
  }
}
