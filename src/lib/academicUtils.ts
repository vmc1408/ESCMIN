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
 * Detects the semester for a given subject or within the context of a class.
 */
export function detectSubjectSemester(subject: any, classObj?: any): '1º Semestre' | '2º Semestre' | 'Anual' {
  if (!subject && !classObj) return 'Anual';

  const subId = subject?.id || (typeof subject === 'string' ? subject : null);
  
  // 1. Check direct subject semester property
  const rawSem = String(subject?.semester || '').trim().toLowerCase();
  if (rawSem.includes('1') || rawSem.includes('1º') || rawSem.includes('1°') || rawSem.includes('1o') || rawSem.includes('primeiro')) {
    return '1º Semestre';
  }
  if (rawSem.includes('2') || rawSem.includes('2º') || rawSem.includes('2°') || rawSem.includes('2o') || rawSem.includes('segundo')) {
    return '2º Semestre';
  }

  // 2. Check program_content metadata if present on subject
  if (subject?.program_content) {
    try {
      const match = String(subject.program_content).match(/\[METADATA:(\{[\s\S]*?\})\]/);
      if (match && match[1]) {
        const meta = JSON.parse(match[1]);
        const mSem = String(meta.semester || '').trim().toLowerCase();
        if (mSem.includes('1') || mSem.includes('1º') || mSem.includes('1°') || mSem.includes('1o') || mSem.includes('primeiro')) {
          return '1º Semestre';
        }
        if (mSem.includes('2') || mSem.includes('2º') || mSem.includes('2°') || mSem.includes('2o') || mSem.includes('segundo')) {
          return '2º Semestre';
        }
        if (mSem.includes('anual') || mSem.includes('ambos')) {
          return 'Anual';
        }
      }
    } catch {}
  }

  // 3. Check class assignment fields if classObj is provided (supports single class or array of classes)
  if (classObj && subId) {
    const classList = Array.isArray(classObj) ? classObj : [classObj];
    for (const c of classList) {
      if (!c) continue;
      const sem1Fields: string[] = [c.subject_id_sem1, c.subject_id_sem1_h1, c.subject_id_sem1_h2].filter(Boolean);
      const sem2Fields: string[] = [c.subject_id_sem2, c.subject_id_sem2_h1, c.subject_id_sem2_h2].filter(Boolean);

      if (c.observations) {
        try {
          const match = String(c.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
          if (match && match[1]) {
            const meta = JSON.parse(match[1]);
            if (meta.subject_id_sem1_h1) sem1Fields.push(meta.subject_id_sem1_h1);
            if (meta.subject_id_sem1_h2) sem1Fields.push(meta.subject_id_sem1_h2);
            if (meta.subject_id_sem1) sem1Fields.push(meta.subject_id_sem1);
            if (meta.subject_id_sem2_h1) sem2Fields.push(meta.subject_id_sem2_h1);
            if (meta.subject_id_sem2_h2) sem2Fields.push(meta.subject_id_sem2_h2);
            if (meta.subject_id_sem2) sem2Fields.push(meta.subject_id_sem2);
          }
        } catch {}
      }

      if (sem1Fields.some(id => String(id) === String(subId))) {
        return '1º Semestre';
      }
      if (sem2Fields.some(id => String(id) === String(subId))) {
        return '2º Semestre';
      }
    }
  }

  // 4. Name and code regex heuristics
  const str = `${subject?.code || ''} ${subject?.name || ''}`.toLowerCase();
  if (/\b(1º|1°|1o|1s|semestre 1|1º sem|1 sem|1ºsem|sem 1|1º semestre)\b/i.test(str)) {
    return '1º Semestre';
  }
  if (/\b(2º|2°|2o|2s|semestre 2|2º sem|2 sem|2ºsem|sem 2|2º semestre)\b/i.test(str)) {
    return '2º Semestre';
  }

  if (rawSem.includes('anual') || rawSem.includes('ano') || rawSem.includes('ambos')) {
    return 'Anual';
  }

  return 'Anual';
}

/**
 * Returns the effective date boundaries (YYYY-MM-DD) for a given semester.
 */
export function getSemesterDateRange(
  semester: string,
  academicSettings?: any,
  referenceYear = new Date().getFullYear()
): { start: string; end: string } {
  const normSem = detectSubjectSemester({ semester });
  const yr = referenceYear || new Date().getFullYear();

  if (normSem === '1º Semestre') {
    const start = academicSettings?.term1_start ? String(academicSettings.term1_start).split('T')[0] : `${yr}-01-01`;
    const end = academicSettings?.term1_end ? String(academicSettings.term1_end).split('T')[0] : `${yr}-07-31`;
    return { start, end };
  }

  if (normSem === '2º Semestre') {
    const start = academicSettings?.term2_start ? String(academicSettings.term2_start).split('T')[0] : `${yr}-08-01`;
    const end = academicSettings?.term2_end ? String(academicSettings.term2_end).split('T')[0] : `${yr}-12-31`;
    return { start, end };
  }

  return {
    start: `${yr}-01-01`,
    end: `${yr}-12-31`
  };
}

/**
 * Returns the relevant evaluation periods (bimesters or assessments) for a subject according to its semester.
 */
export function getAvailablePeriodsForSubject(
  subject: any,
  classObj?: any
): { id: string; name: string; semester: '1º Semestre' | '2º Semestre' | 'Anual' }[] {
  const semester = detectSubjectSemester(subject, classObj);

  if (semester === '1º Semestre') {
    return [
      { id: '1ª Avaliação', name: '1ª Avaliação', semester: '1º Semestre' },
      { id: '2ª Avaliação', name: '2ª Avaliação', semester: '1º Semestre' }
    ];
  }

  if (semester === '2º Semestre') {
    return [
      { id: '1ª Avaliação', name: '1ª Avaliação', semester: '2º Semestre' },
      { id: '2ª Avaliação', name: '2ª Avaliação', semester: '2º Semestre' },
      { id: '3ª Avaliação', name: '3ª Avaliação', semester: '2º Semestre' },
      { id: '4ª Avaliação', name: '4ª Avaliação', semester: '2º Semestre' }
    ];
  }

  return [
    { id: '1ª Avaliação', name: '1ª Avaliação', semester: 'Anual' },
    { id: '2ª Avaliação', name: '2ª Avaliação', semester: 'Anual' },
    { id: '3ª Avaliação', name: '3ª Avaliação', semester: 'Anual' },
    { id: '4ª Avaliação', name: '4ª Avaliação', semester: 'Anual' }
  ];
}

/**
 * Checks if a given date (YYYY-MM-DD or DD/MM/YYYY) is valid for the subject's semester.
 */
export function isDateInSubjectSemester(
  dateStr: string,
  subject: any,
  classObj?: any,
  academicSettings?: any
): boolean {
  if (!dateStr || !subject) return true;

  const semester = detectSubjectSemester(subject, classObj);
  if (semester === 'Anual') return true;

  let isoDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  if (isoDate.includes('/')) {
    const parts = isoDate.split('/');
    if (parts.length === 3) {
      isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  let monthIndex = -1;
  if (isoDate.includes('-')) {
    const parts = isoDate.split('-');
    if (parts.length >= 2) {
      monthIndex = parseInt(parts[1], 10) - 1;
    }
  }

  if (monthIndex < 0 || monthIndex > 11) return true;

  // If specific term dates exist in settings, also respect them
  const yr = parseInt(isoDate.split('-')[0], 10) || new Date().getFullYear();
  const range = getSemesterDateRange(semester, academicSettings, yr);

  if (semester === '1º Semestre') {
    // 1st semester is standard Jan-Jul (months 0..6)
    if (academicSettings?.term1_start && academicSettings?.term1_end) {
      return isoDate >= range.start && isoDate <= range.end;
    }
    return monthIndex <= 6;
  }

  if (semester === '2º Semestre') {
    // 2nd semester is standard Aug-Dec (months 7..11)
    if (academicSettings?.term2_start && academicSettings?.term2_end) {
      return isoDate >= range.start && isoDate <= range.end;
    }
    return monthIndex >= 7;
  }

  return true;
}

/**
 * Checks if a 0-indexed month (0 = Jan, 11 = Dec) belongs to the subject's semester.
 */
export function isMonthInSubjectSemester(
  monthIndex: number,
  subject: any,
  classObj?: any
): boolean {
  if (monthIndex < 0 || monthIndex > 11 || !subject) return true;
  const semester = detectSubjectSemester(subject, classObj);
  if (semester === '1º Semestre') {
    return monthIndex <= 6; // Jan to Jul
  }
  if (semester === '2º Semestre') {
    return monthIndex >= 7; // Aug to Dec
  }
  return true;
}

/**
 * Filters a list of class school days to only include those belonging to the subject's semester.
 */
export function filterSchoolDaysForSubject(
  classSchoolDays: any[],
  subject: any,
  classObj?: any,
  academicSettings?: any
): any[] {
  if (!classSchoolDays || classSchoolDays.length === 0) return [];
  if (!subject) return classSchoolDays;

  return classSchoolDays.filter(day => {
    const dStr = day.start_date || day.dbValue || day.date;
    if (!dStr) return true;
    return isDateInSubjectSemester(dStr, subject, classObj, academicSettings);
  });
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

  // Maximum tolerated absences for the entire discipline/period based on planned school days
  const maxAllowedAbsences = Math.floor(subjectTotalClassDays * (absenceLimitPercentage / 100));

  // Percentage of presence based on the total planned class days for the subject/course
  // e.g., 5 presences in a 33-class curriculum = (5 / 33) * 100 = 15.15% (15%)
  const presencePercentage = subjectTotalClassDays > 0
    ? Math.max(0, Math.min(100, Math.round((presences / subjectTotalClassDays) * 100)))
    : (totalRecorded > 0 ? Math.max(0, Math.min(100, Math.round((presences / totalRecorded) * 100))) : null);

  // Percentage of absences based on the total planned class days
  const absencePercentage = subjectTotalClassDays > 0
    ? Math.max(0, Math.min(100, Math.round((absences / subjectTotalClassDays) * 100)))
    : 0;

  // Attendance Approval:
  // A student fails by absences ONLY if their total absences EXCEED the maximum allowed absences for the subject/period.
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
    absencePercentage,
    isAttendanceApproved,
    attendanceStatus
  };
}

/**
 * Normalizes a date into standard YYYY-MM-DD format for database and input[type="date"] binding.
 */
export function normalizeScheduleDate(dateStr: any): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (str.includes('T')) return str.split('T')[0];
  if (str.includes('-') && !str.includes('/')) {
    const parts = str.split('-');
    if (parts[0].length === 4) return str;
  }
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (d.length <= 2 && m.length <= 2 && y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
  }
  return str;
}

/**
 * Resolves the start date for a class based on the academic schedule / cronograma.
 * Prioritizes class/weekday terms in academic settings, class_day events,
 * and academic calendar term bounds.
 */
export function getClassStartDateFromSchedule(
  targetClass: any,
  academicSettingsList?: any[],
  calendarEvents?: any[]
): string {
  if (!targetClass) return '';

  // 1. Resolve combined academic settings
  let settings: any = null;
  if (Array.isArray(academicSettingsList) && academicSettingsList.length > 0) {
    settings = academicSettingsList.find(s => s && s.id === targetClass.id)
      || academicSettingsList.find(s => s && s.id === 'current')
      || academicSettingsList[0];
  }

  // Also check localStorage if settings not found or missing fields
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (targetClass.id) {
        const storedClass = localStorage.getItem(`academic_settings_${targetClass.id}`);
        if (storedClass) {
          const parsed = JSON.parse(storedClass);
          settings = { ...parsed, ...(settings || {}) };
        }
      }
      const storedCurrent = localStorage.getItem('academic_settings_current');
      if (storedCurrent) {
        const parsed = JSON.parse(storedCurrent);
        settings = { ...parsed, ...(settings || {}) };
      }
    } catch (e) {}
  }

  // 2. Identify if this class is for the 2º Semestre
  const semStr = String(targetClass.semester || targetClass.name || '').toLowerCase();
  const isSem2 = semStr.includes('2º') || semStr.includes('2o') || semStr.includes('2°') || 
                 semStr.includes('segundo semestre') || semStr.includes('2 sem');

  // 3. Resolve class weekdays
  const weekdays = getClassWeekdays(targetClass, settings, calendarEvents);

  // 4. Check specific start_term calendar events for this class
  if (Array.isArray(calendarEvents) && calendarEvents.length > 0) {
    const classEvents = calendarEvents.filter(e => e && e.start_date);
    
    // Class-specific start_term
    const specificTermStarts = classEvents.filter(e => 
      e.type === 'start_term' && e.class_id && String(e.class_id) === String(targetClass.id)
    );
    if (specificTermStarts.length > 0) {
      if (isSem2) {
        const sem2Term = specificTermStarts.find(e => 
          e.title?.includes('2º') || e.title?.includes('2o') || e.title?.includes('2°') || 
          parseInt(e.start_date.split('-')[1] || '0', 10) >= 7
        );
        if (sem2Term?.start_date) {
          return normalizeScheduleDate(sem2Term.start_date);
        }
      } else {
        const sem1Term = specificTermStarts.find(e => 
          e.title?.includes('1º') || e.title?.includes('1o') || e.title?.includes('1°') || 
          parseInt(e.start_date.split('-')[1] || '0', 10) <= 7
        );
        if (sem1Term?.start_date) {
          return normalizeScheduleDate(sem1Term.start_date);
        }
      }
      if (specificTermStarts[0]?.start_date) {
        return normalizeScheduleDate(specificTermStarts[0].start_date);
      }
    }
  }

  // 5. Check weekday-specific terms in academic settings (e.g. weekday_terms[w].term1_start)
  if (settings?.weekday_terms) {
    for (const w of weekdays) {
      const termObj = settings.weekday_terms[w] || settings.weekday_terms[String(w)];
      if (termObj) {
        if (isSem2 && termObj.term2_start) {
          return normalizeScheduleDate(termObj.term2_start);
        }
        if (!isSem2 && termObj.term1_start) {
          return normalizeScheduleDate(termObj.term1_start);
        }
      }
    }
    // Check any weekday_terms where targetClass is mapped in weekday_classes
    if (settings.weekday_classes && targetClass.id) {
      for (const [wStr, cIds] of Object.entries(settings.weekday_classes)) {
        if (Array.isArray(cIds) && cIds.includes(targetClass.id)) {
          const termObj = settings.weekday_terms[wStr] || settings.weekday_terms[Number(wStr)];
          if (termObj) {
            if (isSem2 && termObj.term2_start) return normalizeScheduleDate(termObj.term2_start);
            if (!isSem2 && termObj.term1_start) return normalizeScheduleDate(termObj.term1_start);
          }
        }
      }
    }
  }

  // 6. Check school days (class_day events) from cronograma
  if (Array.isArray(calendarEvents) && calendarEvents.length > 0) {
    const schoolDays = getClassSchoolDays(targetClass, calendarEvents, settings);
    if (schoolDays.length > 0) {
      if (isSem2) {
        const sem2Days = schoolDays.filter(d => {
          const m = parseInt(d.start_date.split('-')[1] || '0', 10);
          return m >= 7;
        });
        if (sem2Days.length > 0) {
          return normalizeScheduleDate(sem2Days[0].start_date);
        }
      } else {
        const sem1Days = schoolDays.filter(d => {
          const m = parseInt(d.start_date.split('-')[1] || '0', 10);
          return m <= 7;
        });
        if (sem1Days.length > 0) {
          return normalizeScheduleDate(sem1Days[0].start_date);
        }
        return normalizeScheduleDate(schoolDays[0].start_date);
      }
    }

    // Check global start_term events
    const globalTermStarts = calendarEvents.filter(e => e && e.type === 'start_term' && e.start_date);
    if (globalTermStarts.length > 0) {
      if (isSem2) {
        const sem2 = globalTermStarts.find(e => 
          e.title?.includes('2º') || e.title?.includes('2o') || e.title?.includes('2°') || 
          parseInt(e.start_date.split('-')[1] || '0', 10) >= 7
        );
        if (sem2?.start_date) return normalizeScheduleDate(sem2.start_date);
      } else {
        const sem1 = globalTermStarts.find(e => 
          e.title?.includes('1º') || e.title?.includes('1o') || e.title?.includes('1°') || 
          parseInt(e.start_date.split('-')[1] || '0', 10) <= 7
        );
        if (sem1?.start_date) return normalizeScheduleDate(sem1.start_date);
      }
    }
  }

  // 7. Check global academic_settings term starts
  if (settings) {
    if (isSem2 && settings.term2_start) {
      return normalizeScheduleDate(settings.term2_start);
    }
    if (!isSem2 && settings.term1_start) {
      return normalizeScheduleDate(settings.term1_start);
    }
    if (settings.term1_start) {
      return normalizeScheduleDate(settings.term1_start);
    }
  }

  // 8. Fallback to targetClass.start_date
  if (targetClass.start_date) {
    return normalizeScheduleDate(targetClass.start_date);
  }

  return '';
}

