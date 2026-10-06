/**
 * Tipos e Modelos para a Geração Automática do Calendário Anual de Aulas
 * Módulo: Cronograma > Parâmetros > Calendário Anual de Aulas
 */

export type HolidayType = 'nacional' | 'estadual' | 'municipal' | 'institucional';

export type DayClassification = 
  | 'class_day'          // Dia letivo regular
  | 'holiday_nac'        // Feriado nacional
  | 'holiday_est'        // Feriado estadual
  | 'holiday_mun'        // Feriado municipal
  | 'holiday_inst'       // Feriado institucional
  | 'recess'             // Recesso escolar
  | 'vacation'           // Férias escolares
  | 'suspension'         // Suspensão de aula
  | 'weekend_off'        // Fim de semana sem aula
  | 'non_class_day'      // Dia comum sem aula (fora da semana ou do período)
  | 'custom_class'       // Dia letivo por ajuste manual (ex: sábado letivo)
  | 'custom_off';        // Dia sem aula por ajuste manual

export interface AcademicPeriod {
  id: string;
  name: string;           // Ex: "1º Semestre", "2º Semestre", "1º Bimestre"
  start_date: string;     // YYYY-MM-DD
  end_date: string;       // YYYY-MM-DD
  is_active: boolean;     // Ativo / Inativo
  notes?: string;
  color?: string;
}

export interface RecessInterval {
  id: string;
  name: string;           // Ex: "Recesso Escolar de Julho", "Semana Santa", "Férias de Janeiro"
  start_date: string;     // YYYY-MM-DD
  end_date: string;       // YYYY-MM-DD
  type: 'recesso' | 'ferias' | 'suspensao';
  notes?: string;
}

export interface HolidayEntry {
  id: string;
  name: string;
  date: string;           // YYYY-MM-DD
  type: HolidayType;
  state?: string;         // UF (ex: 'SP')
  city?: string;          // Município (ex: 'Guarulhos')
  is_movable?: boolean;   // Feriado com data móvel (ex: Carnaval, Páscoa, Corpus Christi)
  origin: string;         // 'API BrasilAPI' | 'Tabela Estadual' | 'Tabela Municipal' | 'Cadastro Manual' | 'Cálculo Interno'
  has_class: boolean;     // Se haverá aula ou não (padrão: false)
  notes?: string;
  query_date?: string;    // Data da consulta da origem
}

export interface CalendarDayRecord {
  date: string;           // YYYY-MM-DD
  day_of_week: number;    // 0 = Dom, 1 = Seg, ... 6 = Sab
  year: number;
  period_id?: string;
  period_name?: string;
  unit_id?: string;
  classification: DayClassification;
  is_class_day: boolean;
  event_name?: string;
  origin?: string;
  is_manual_override: boolean;
  override_reason?: string;
  last_modified_by?: string;
  last_modified_at?: string;
}

export interface CalendarGenerationParameters {
  year: number;
  state: string;          // UF (ex: 'SP')
  city: string;           // Município (ex: 'Guarulhos')
  start_date: string;     // YYYY-MM-DD
  end_date: string;       // YYYY-MM-DD
  weekdays: number[];     // Dias de aula: [1, 2, 3, 4, 5] (Seg a Sex), [3, 6], etc.
  minimum_class_days_target: number; // Ex: 200
  periods: AcademicPeriod[];
  recesses: RecessInterval[];
  holidays: HolidayEntry[];
  unit_id?: string;       // 'matriz' ou ID do polo
  preserve_manual_overrides?: boolean;
}

export interface CalendarVersion {
  id: string;
  year: number;
  version: number;        // 1, 2, 3...
  status: 'draft' | 'approved' | 'published' | 'archived';
  title?: string;
  state: string;
  city: string;
  start_date: string;
  end_date: string;
  weekdays: number[];
  minimum_class_days_target: number;
  periods: AcademicPeriod[];
  recesses: RecessInterval[];
  holidays: HolidayEntry[];
  total_class_days: number;
  class_days_by_month: Record<string, number>; // Mês "1".."12" -> quantidade
  class_days_by_period: Record<string, number>; // period_id -> quantidade
  total_holidays: number;
  total_recess_days: number;
  manual_overrides_count: number;
  days: Record<string, CalendarDayRecord>; // YYYY-MM-DD -> CalendarDayRecord
  parameters_snapshot: CalendarGenerationParameters;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  unit_id?: string;
  notes?: string;
}

export interface CalendarSummary {
  year: number;
  total_class_days: number;
  target_minimum: number;
  difference_from_target: number;
  is_below_target: boolean;
  total_holidays: number;
  total_recess_days: number;
  total_manual_overrides: number;
  by_month: Array<{
    month: number;
    month_name: string;
    class_days: number;
    holidays: number;
    recess_days: number;
  }>;
  by_period: Array<{
    period_id: string;
    period_name: string;
    class_days: number;
    start_date: string;
    end_date: string;
    is_active: boolean;
  }>;
}
