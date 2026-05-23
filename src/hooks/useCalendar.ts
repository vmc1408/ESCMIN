import { useState, useCallback, useMemo } from 'react';
import { CalendarEvent, AcademicSettings } from '../types';

export function useCalendarHelpers() {
  const getEaster = useCallback((year: number) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = Math.floor((h + l - 7 * m + 114) / 31);
    const p = (h + l - 7 * m + 114) % 31;
    return new Date(year, n - 1, p + 1);
  }, []);

  const getHolidaysForYear = useCallback((year: number) => {
    const easter = getEaster(year);
    
    const carnival = new Date(easter);
    carnival.setDate(easter.getDate() - 47);
    
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    
    const corpusChristi = new Date(easter);
    corpusChristi.setDate(easter.getDate() + 60);

    return [
      { title: "Confraternização Universal", date: `${year}-01-01`, category: 'nacional' },
      { title: "Aniv. de São Paulo", date: `${year}-01-25`, category: 'estadual' },
      { title: "Carnaval", date: carnival.toISOString().split('T')[0], category: 'nacional' },
      { title: "Sexta-feira Santa", date: goodFriday.toISOString().split('T')[0], category: 'nacional' },
      { title: "Páscoa", date: easter.toISOString().split('T')[0], category: 'nacional' },
      { title: "Tiradentes", date: `${year}-04-21`, category: 'nacional' },
      { title: "Dia do Trabalho", date: `${year}-05-01`, category: 'nacional' },
      { title: "Corpus Christi", date: corpusChristi.toISOString().split('T')[0], category: 'nacional' },
      { title: "Independência do Brasil", date: `${year}-09-07`, category: 'nacional' },
      { title: "Nossa Sra Aparecida", date: `${year}-10-12`, category: 'nacional' },
      { title: "Finados", date: `${year}-11-02`, category: 'nacional' },
      { title: "Proclamação da República", date: `${year}-11-15`, category: 'nacional' },
      { title: "Consciência Negra", date: `${year}-11-20`, category: 'nacional' },
      { title: "Natal", date: `${year}-12-25`, category: 'nacional' },
      { title: "Revolução Constitucionalista", date: `${year}-07-09`, category: 'estadual' },
      { title: "Imaculada Conceição (Aniv. Guarulhos)", date: `${year}-12-08`, category: 'municipal' },
    ];
  }, [getEaster]);

  const getPeriodType = useCallback((dateStr: string, settings: AcademicSettings) => {
    if (!settings.term1_start || !settings.term1_end || !settings.term2_start || !settings.term2_end) return null;
    
    const date = new Date(dateStr + 'T00:00:00');
    const t1Start = new Date(settings.term1_start + 'T00:00:00');
    const t1End = new Date(settings.term1_end + 'T00:00:00');
    const t2Start = new Date(settings.term2_start + 'T00:00:00');
    const t2End = new Date(settings.term2_end + 'T00:00:00');

    if (date > t1End && date < t2Start) return 'vacation';
    if (date < t1Start || date > t2End) return 'recess';
    return null;
  }, []);

  return {
    getEaster,
    getHolidaysForYear,
    getPeriodType
  };
}
