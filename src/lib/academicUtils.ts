import { AcademicParameters, Subject } from '../types';

export const WEEKDAY_MAP: Record<string, number> = {
  'domingo': 0, 'dom': 0, '0': 0,
  'segunda': 1, 'segunda-feira': 1, 'seg': 1, '1': 1, '2ª': 1, '2a': 1,
  'terça': 2, 'terca': 2, 'terça-feira': 2, 'terca-feira': 2, 'ter': 2, '2': 2, '3ª': 2, '3a': 2,
  'quarta': 3, 'quarta-feira': 3, 'qua': 3, '3': 3, '4ª': 3, '4a': 3,
  'quinta': 4, 'quinta-feira': 4, 'qui': 4, '4': 4, '5ª': 4, '5a': 4,
  'sexta': 5, 'sexta-feira': 5, 'sex': 5, '5': 5, '6ª': 5, '6a': 5,
  'sábado': 6, 'sabado': 6, 'sab': 6, '6': 6, 'sáb': 6
};

/**
 * Detects the specific weekday indices (0-6) for a given class.
 */
export function getClassWeekdays(
  classObj: any,
  settings?: any,
  calendarEvents?: any[],
  attendances?: any[]
): number[] {
  if (!classObj) return [];

  const foundDays = new Set<number>();

  // 1. Check days_of_week property (Array, JSON string, or comma-separated string)
  let rawDays: any = classObj.days_of_week;
  if (typeof rawDays === 'string') {
    try {
      rawDays = JSON.parse(rawDays);
    } catch {
      rawDays = rawDays.split(',').map((s: string) => s.trim());
    }
  }

  if (Array.isArray(rawDays) && rawDays.length > 0) {
    rawDays.forEach(d => {
      const key = String(d).trim().toLowerCase();
      if (WEEKDAY_MAP[key] !== undefined) {
        foundDays.add(WEEKDAY_MAP[key]);
      }
    });
  }

  // 2. Check shift / schedule field (e.g., "NOITE - QUINTA", "Quinta-feira", "Sábado")
  const scheduleStr = `${classObj.schedule || ''} ${classObj.shift || ''}`.toLowerCase();
  Object.keys(WEEKDAY_MAP).forEach(k => {
    if (k.length >= 3 && scheduleStr.includes(k)) {
      foundDays.add(WEEKDAY_MAP[k]);
    }
  });

  // 3. Check class name (e.g., "Doutrina Social da Igreja 2026 - Quinta")
  const nameLower = (classObj.name || '').toLowerCase();
  Object.keys(WEEKDAY_MAP).forEach(k => {
    if (k.length >= 3 && nameLower.includes(k)) {
      foundDays.add(WEEKDAY_MAP[k]);
    }
  });

  // 4. Check settings.weekday_classes mapping
  if (settings?.weekday_classes && classObj.id) {
    Object.entries(settings.weekday_classes).forEach(([wDay, classList]: [string, any]) => {
      if (Array.isArray(classList) && classList.includes(classObj.id)) {
        const dNum = parseInt(wDay, 10);
        if (!isNaN(dNum) && dNum >= 0 && dNum <= 6) {
          foundDays.add(dNum);
        }
      }
    });
  }

  // 5. Fallback to attendance record patterns if still empty
  if (foundDays.size === 0 && attendances && classObj.id) {
    const classAtts = attendances.filter(a => String(a.class_id) === String(classObj.id) && a.date);
    if (classAtts.length > 0) {
      const counts: Record<number, number> = {};
      classAtts.forEach(a => {
        const dStr = a.date.includes('T') ? a.date.split('T')[0] : a.date;
        const d = new Date(dStr + 'T12:00:00').getDay();
        counts[d] = (counts[d] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0 && sorted[0][1] >= 2) {
        foundDays.add(parseInt(sorted[0][0], 10));
      }
    }
  }

  // 6. Fallback to calendar events specific to this class
  if (foundDays.size === 0 && calendarEvents && classObj.id) {
    const specific = calendarEvents.filter(e => String(e.class_id) === String(classObj.id) && e.start_date);
    if (specific.length > 0) {
      const counts: Record<number, number> = {};
      specific.forEach(e => {
        const d = new Date(e.start_date + 'T12:00:00').getDay();
        counts[d] = (counts[d] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        foundDays.add(parseInt(sorted[0][0], 10));
      }
    }
  }

  return Array.from(foundDays);
}

/**
 * Returns strictly the school day events that apply to this specific class.
 * Filters out global events that occur on other weekdays not taught in this class.
 */
export function getClassSchoolDays(
  classObj: any,
  calendarEvents: any[],
  settings?: any,
  attendances?: any[]
): any[] {
  if (!calendarEvents || calendarEvents.length === 0) return [];
  if (!classObj) return calendarEvents.filter(e => e.type === 'class_day');

  const classWeekdays = getClassWeekdays(classObj, settings, calendarEvents, attendances);
  const seenDates = new Set<string>();
  const result: any[] = [];

  calendarEvents.forEach(e => {
    if (e.type !== 'class_day') return;
    if (!e.start_date) return;

    const dateStr = e.start_date.includes('T') ? e.start_date.split('T')[0] : e.start_date;
    if (seenDates.has(dateStr)) return;

    const isClassSpecific = e.class_id && String(e.class_id) === String(classObj.id);
    const isGlobal = !e.class_id;

    if (isClassSpecific) {
      seenDates.add(dateStr);
      result.push(e);
    } else if (isGlobal) {
      if (classWeekdays.length > 0) {
        const dateObj = new Date(dateStr + 'T12:00:00');
        const wDay = dateObj.getDay();
        if (classWeekdays.includes(wDay)) {
          seenDates.add(dateStr);
          result.push(e);
        }
      } else {
        // If class has no weekday detected, keep global
        seenDates.add(dateStr);
        result.push(e);
      }
    }
  });

  return result.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/**
 * Counts scheduled class days per month index (0 = Jan, ..., 11 = Dec).
 */
export function getScheduledDaysByMonth(classSchoolDays: any[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (let i = 0; i < 12; i++) {
    counts[i] = 0;
  }

  (classSchoolDays || []).forEach(e => {
    if (!e.start_date) return;
    let mIdx = -1;
    if (e.start_date.includes('-')) {
      const parts = e.start_date.split('-');
      if (parts.length >= 2) mIdx = parseInt(parts[1], 10) - 1;
    } else if (e.start_date.includes('/')) {
      const parts = e.start_date.split('/');
      if (parts.length >= 2) mIdx = parseInt(parts[1], 10) - 1;
    }
    if (mIdx >= 0 && mIdx < 12) {
      counts[mIdx] += 1;
    }
  });

  return counts;
}

/**
 * Calculates total scheduled class days for a subject depending on its semester.
 */
export function getSubjectTotalClassDays(
  subSemester: string,
  scheduledDaysByMonth: Record<number, number>,
  totalClassDaysFallback = 33
): number {
  const sem1 = [0, 1, 2, 3, 4, 5, 6].reduce((acc, m) => acc + (scheduledDaysByMonth[m] || 0), 0);
  const sem2 = [7, 8, 9, 10, 11].reduce((acc, m) => acc + (scheduledDaysByMonth[m] || 0), 0);
  const annual = sem1 + sem2;

  if (subSemester === '1º Semestre') {
    return sem1 > 0 ? sem1 : Math.round(totalClassDaysFallback / 2);
  }
  if (subSemester === '2º Semestre') {
    return sem2 > 0 ? sem2 : Math.round(totalClassDaysFallback / 2);
  }
  return annual > 0 ? annual : totalClassDaysFallback;
}

/**
 * Comprehensive calculation of student attendance metrics and approval status.
 */
export function calculateAttendanceMetrics(params: {
  presences: number;
  absences: number;
  subjectTotalClassDays: number;
  absenceLimitPercentage?: number;
}) {
  const { presences, absences, subjectTotalClassDays, absenceLimitPercentage = 25 } = params;
  const totalRecorded = presences + absences;

  // Maximum tolerated absences for the entire discipline/period
  const maxAllowedAbsences = Math.floor(subjectTotalClassDays * (absenceLimitPercentage / 100));

  // Percentage of presence based on classes recorded so far
  const presencePercentage = totalRecorded > 0
    ? Math.max(0, Math.min(100, Math.round((presences / totalRecorded) * 100)))
    : null;

  // Attendance Approval:
  // A student fails by absences ONLY if their absences EXCEED the maximum allowed absences for the subject/period.
  // When classes are in progress, having a single absence when 4 are allowed is strictly APPROVED/REGULAR.
  const isAttendanceApproved = absences <= maxAllowedAbsences;

  let attendanceStatus: 'Regular' | 'Atenção' | 'Excesso de Faltas' | 'Sem Registros' = 'Sem Registros';
  if (totalRecorded === 0) {
    attendanceStatus = 'Sem Registros';
  } else if (!isAttendanceApproved) {
    attendanceStatus = 'Excesso de Faltas';
  } else if (absences >= Math.max(1, maxAllowedAbsences - 1) && maxAllowedAbsences > 1) {
    attendanceStatus = 'Atenção';
  } else {
    attendanceStatus = 'Regular';
  }

  return {
    presences,
    absences,
    totalRecorded,
    subjectTotalClassDays,
    maxAllowedAbsences,
    presencePercentage,
    isAttendanceApproved,
    attendanceStatus
  };
}
