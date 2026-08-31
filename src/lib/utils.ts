import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '---';
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('pt-BR').format(d);
      }
    }
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return '---';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

export function safeFormat(date: string | Date | null | undefined, formatStr: string, fallback: string = '---') {
  if (!date) return fallback;
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        try {
          return format(d, formatStr);
        } catch (e) {
          return fallback;
        }
      }
    }
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return fallback;
  try {
    return format(d, formatStr);
  } catch (e) {
    return fallback;
  }
}

export function parseSafeDate(dateValue: any): Date {
  if (!dateValue) return new Date();
  
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? new Date() : dateValue;
  }
  
  const dateStr = String(dateValue).trim();
  
  // Try YYYY-MM-DD pure date first to avoid UTC shifts
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Try ISO or YYYY-MM-DD
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Try DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
      d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Excel numeric date
  const num = Number(dateValue);
  if (!isNaN(num) && num > 30000) {
    const excelDate = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(excelDate.getTime())) return excelDate;
  }
  
  return new Date();
}

export function maskCEP(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{5})(\d)/, '$1-$2')
    .substring(0, 9);
}

export function maskPhone(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/g, '($1) $2')
    .replace(/(\d)(\d{4})$/, '$1-$2')
    .substring(0, 15);
}

export function maskDate(value: string) {
  const digits = value.replace(/\D/g, '').substring(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.substring(0, 2)}/${digits.substring(2)}`;
  return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4)}`;
}

export function formatDateForDisplay(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  
  // Handle ISO string by taking only the date part
  const pureDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  
  if (pureDate.includes('/')) {
    // Check if it's already DD/MM/YYYY
    const parts = pureDate.split('/');
    if (parts.length === 3 && parts[0].length <= 2) return pureDate;
    return pureDate;
  }
  
  const parts = pureDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) return `${day}/${month}/${year}`;
    if (day.length === 4) return `${year}/${month}/${day}`; // Handles some weird cases
  }
  return pureDate;
}

export function parseDateToDB(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  // If already YYYY-MM-DD
  if (dateStr.includes('-') && !dateStr.includes('/')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) return dateStr;
  }
  
  const digits = dateStr.replace(/\D/g, '');
  if (digits.length === 8) {
    const day = digits.substring(0, 2);
    const month = digits.substring(2, 4);
    const year = digits.substring(4, 8);
    return `${year}-${month}-${day}`;
  }
  
  // Fallback for partial dates or things that look like DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      if (day.length === 2 && month.length === 2 && year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  return null;
}

export function detectCourseFromClass(cls: any, availableCourses?: Array<{ code?: string; name: string }>): string {
  if (!cls) return '';

  // 1. Direct course field if present
  const directCourse = String(cls.course || '').trim();
  if (directCourse) {
    if (availableCourses && availableCourses.length > 0) {
      const match = availableCourses.find(c => 
        c.name.toLowerCase() === directCourse.toLowerCase() || 
        (c.code && c.code.toLowerCase() === directCourse.toLowerCase())
      );
      if (match) return match.name;
    }
    const dcLower = directCourse.toLowerCase();
    if (dcLower.includes('doutrina') || /\bdsi\b/i.test(dcLower)) return 'Doutrina Social da Igreja';
    if (dcLower.includes('negros') || dcLower.includes('santos') || /\bhsn\b/i.test(dcLower)) return 'História dos Santos Negros';
    if (dcLower.includes('teologia') || /\bteo\b/i.test(dcLower)) return 'Teologia';
    if (dcLower.includes('latim') || /\blat\b/i.test(dcLower)) return 'Latim';
    if (dcLower.includes('outros')) return 'Outros';
    return directCourse;
  }

  // 2. Observations metadata inspection
  if (cls.observations) {
    const match = String(cls.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
    if (match && match[1]) {
      try {
        const meta = JSON.parse(match[1]);
        if (meta.course) {
          const courseStr = String(meta.course).trim();
          if (availableCourses && availableCourses.length > 0) {
            const matched = availableCourses.find(c => 
              c.name.toLowerCase() === courseStr.toLowerCase() || 
              (c.code && c.code.toLowerCase() === courseStr.toLowerCase())
            );
            if (matched) return matched.name;
          }
          const mcLower = courseStr.toLowerCase();
          if (mcLower.includes('doutrina') || /\bdsi\b/i.test(mcLower)) return 'Doutrina Social da Igreja';
          if (mcLower.includes('negros') || mcLower.includes('santos') || /\bhsn\b/i.test(mcLower)) return 'História dos Santos Negros';
          if (mcLower.includes('teologia') || /\bteo\b/i.test(mcLower)) return 'Teologia';
          if (mcLower.includes('latim') || /\blat\b/i.test(mcLower)) return 'Latim';
          if (mcLower.includes('outros')) return 'Outros';
          return courseStr;
        }
      } catch (e) {}
    }
  }

  // 3. Dynamic course match against available courses if provided
  const str = `${cls.name || ''} ${cls.code || ''}`.toLowerCase();
  if (availableCourses && availableCourses.length > 0) {
    for (const c of availableCourses) {
      if (c.name && str.includes(c.name.toLowerCase())) return c.name;
      if (c.code) {
        const codeRegex = new RegExp(`\\b${c.code.toLowerCase()}\\b`, 'i');
        if (codeRegex.test(str)) return c.name;
      }
    }
  }

  // 4. Fallback standard heuristic matching
  if (
    str.includes('doutrina social') || 
    str.includes('doutrina') || 
    str.includes('dsi') || 
    str.includes('dout.') ||
    /\bdsi\b/i.test(str)
  ) {
    return 'Doutrina Social da Igreja';
  }

  if (
    str.includes('santos negros') || 
    str.includes('história dos santos') || 
    str.includes('negros') || 
    str.includes('hsn') ||
    /\bhsn\b/i.test(str)
  ) {
    return 'História dos Santos Negros';
  }

  if (
    str.includes('teologia') || 
    str.includes('teo-') || 
    str.includes('teo 20') || 
    str.includes('teo-2') ||
    /\bteo\b/i.test(str)
  ) {
    return 'Teologia';
  }

  if (
    str.includes('latim') || 
    str.includes('lat-') || 
    str.includes('lat 20') || 
    str.includes('lat-2') ||
    /\blat\b/i.test(str)
  ) {
    return 'Latim';
  }

  return '';
}

/**
 * Detects whether a subject belongs to the 1st or 2nd semester (or Anual)
 * based on its properties, metadata, class bindings (1º vs 2º semestre slots) or sequence.
 */
export function detectSubjectSemester(subject: any, classItem?: any): string {
  if (!subject) return '';

  // 1. Direct s.semester field on subject
  if (subject.semester && typeof subject.semester === 'string' && subject.semester.trim()) {
    const sem = subject.semester.trim();
    const semLower = sem.toLowerCase();
    if (semLower.includes('1') || semLower.includes('primeiro') || semLower.includes('1º') || semLower.includes('1°')) {
      return '1º Semestre';
    }
    if (semLower.includes('2') || semLower.includes('segundo') || semLower.includes('2º') || semLower.includes('2°')) {
      return '2º Semestre';
    }
    if (semLower.includes('anual')) {
      return 'Anual';
    }
    return sem;
  }

  // 2. Class associations if classItem provided
  if (classItem) {
    const sId = subject.id;
    // Check sem1 slots
    if (
      (classItem.subject_id_sem1 && classItem.subject_id_sem1 === sId) ||
      (classItem.subject_id_sem1_h1 && classItem.subject_id_sem1_h1 === sId) ||
      (classItem.subject_id_sem1_h2 && classItem.subject_id_sem1_h2 === sId)
    ) {
      return '1º Semestre';
    }

    // Check sem2 slots
    if (
      (classItem.subject_id_sem2 && classItem.subject_id_sem2 === sId) ||
      (classItem.subject_id_sem2_h1 && classItem.subject_id_sem2_h1 === sId) ||
      (classItem.subject_id_sem2_h2 && classItem.subject_id_sem2_h2 === sId)
    ) {
      return '2º Semestre';
    }

    // Check metadata inside class observations
    if (classItem.observations) {
      try {
        const match = String(classItem.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
        if (match && match[1]) {
          const meta = JSON.parse(match[1]);
          if (meta.subject_id_sem1_h1 === sId || meta.subject_id_sem1_h2 === sId || meta.subject_id_sem1 === sId) {
            return '1º Semestre';
          }
          if (meta.subject_id_sem2_h1 === sId || meta.subject_id_sem2_h2 === sId || meta.subject_id_sem2 === sId) {
            return '2º Semestre';
          }
        }
      } catch (e) {}
    }

    // Sequence position in subject_ids array if class has 4 slots (2 in 1st sem, 2 in 2nd sem)
    if (Array.isArray(classItem.subject_ids) && classItem.subject_ids.length > 0) {
      const idx = classItem.subject_ids.indexOf(sId);
      if (idx >= 0) {
        if (classItem.subject_ids.length === 4) {
          return idx < 2 ? '1º Semestre' : '2º Semestre';
        }
        if (classItem.subject_ids.length === 2 && (!classItem.semester || String(classItem.semester).toLowerCase().includes('anual'))) {
          return idx === 0 ? '1º Semestre' : '2º Semestre';
        }
      }
    }

    // If class itself is strictly 1º Semestre or 2º Semestre
    if (classItem.semester) {
      const clsSemLower = String(classItem.semester).toLowerCase();
      if (clsSemLower.includes('1') && !clsSemLower.includes('2')) {
        return '1º Semestre';
      }
      if (clsSemLower.includes('2') && !clsSemLower.includes('1')) {
        return '2º Semestre';
      }
    }
  }

  // 3. Subject program_content metadata
  if (subject.program_content) {
    try {
      const match = String(subject.program_content).match(/\[METADATA:(\{[\s\S]*?\})\]/);
      if (match && match[1]) {
        const meta = JSON.parse(match[1]);
        if (meta.semester) {
          const mSem = String(meta.semester).toLowerCase();
          if (mSem.includes('1')) return '1º Semestre';
          if (mSem.includes('2')) return '2º Semestre';
          if (mSem.includes('anual')) return 'Anual';
          return meta.semester;
        }
      }
    } catch (e) {}
  }

  // 4. Code / Name regex heuristics
  const str = `${subject.code || ''} ${subject.name || ''}`.toLowerCase();
  if (/\b(1º|1°|1o|1s|semestre 1|1º sem|1 sem|1ºsem|sem 1|1º semestre)\b/i.test(str)) {
    return '1º Semestre';
  }
  if (/\b(2º|2°|2o|2s|semestre 2|2º sem|2 sem|2ºsem|sem 2|2º semestre)\b/i.test(str)) {
    return '2º Semestre';
  }

  return '';
}

/**
 * Returns formatted subject name with semester tag, e.g.:
 * "ESCATOLOGIA (1º SEMESTRE)" or "ESCATOLOGIA - 1º SEMESTRE"
 */
export function formatSubjectDisplayName(subject: any, classItem?: any, uppercase: boolean = false): string {
  if (!subject) return '';
  const baseName = uppercase ? (subject.name || '').toUpperCase() : (subject.name || '');
  const sem = detectSubjectSemester(subject, classItem);
  if (!sem) return baseName;
  const semLabel = uppercase ? sem.toUpperCase() : sem;
  return `${baseName} (${semLabel})`;
}

/**
 * Checks if a student is considered active (not explicitly Inactive, Canceled, or Truncated).
 * Blank, null, undefined, 'Ativo', 'Matriculado', 'Cursando', 'Concluído' are treated as active.
 */
export function isStudentActive(student: any): boolean {
  if (!student) return false;
  if (!student.status) return true;
  const st = String(student.status).trim().toLowerCase();
  if (st === 'inativo' || st === 'trancado' || st === 'cancelado' || st === 'evadido' || st === 'desistente' || st === 'arquivado') {
    return false;
  }
  return true;
}

/**
 * Checks if an enrollment record is active.
 */
export function isEnrollmentActive(enrollment: any): boolean {
  if (!enrollment) return false;
  if (!enrollment.status) return true;
  const st = String(enrollment.status).trim().toLowerCase();
  return st !== 'inativo' && st !== 'cancelado' && st !== 'trancado' && st !== 'evadido';
}

/**
 * Checks if a student belongs to a specific class (either via student.class_id or via enrollments table).
 */
export function isStudentInClass(student: any, classId: string, enrollments?: any[]): boolean {
  if (!student || !classId) return false;
  
  // 1. Direct class_id on student record
  if (student.class_id === classId) return true;
  
  // 2. Lookup in enrollments collection
  if (Array.isArray(enrollments) && enrollments.length > 0) {
    const sId = student.id;
    const isEnrolled = enrollments.some((e: any) => 
      e && e.class_id === classId && 
      (e.student_id === sId || e.student_id === student.registration_number) && 
      isEnrollmentActive(e)
    );
    if (isEnrolled) return true;
  }
  
  return false;
}

/**
 * Filters and sorts students belonging to a class.
 * Accounts for direct class_id association AND enrollments table entries.
 */
export function filterStudentsForClass(
  students: any[], 
  classId: string, 
  enrollments?: any[], 
  onlyActive: boolean = true
): any[] {
  if (!Array.isArray(students) || !classId) return [];
  
  const classEnrollments = Array.isArray(enrollments) 
    ? enrollments.filter((e: any) => e.class_id === classId && isEnrollmentActive(e))
    : [];
  
  const enrolledStudentIds = new Set<string>();
  classEnrollments.forEach((e: any) => {
    if (e.student_id) enrolledStudentIds.add(String(e.student_id));
  });

  const matchedStudents: any[] = [];
  const seenIds = new Set<string>();

  for (const s of students) {
    if (!s || !s.id) continue;
    if (seenIds.has(s.id)) continue;

    if (onlyActive && !isStudentActive(s)) {
      continue;
    }

    const isDirect = s.class_id === classId;
    const isEnrolled = enrolledStudentIds.has(String(s.id)) || (s.registration_number && enrolledStudentIds.has(String(s.registration_number)));

    if (isDirect || isEnrolled) {
      matchedStudents.push(s);
      seenIds.add(s.id);
    }
  }

  return matchedStudents.sort((a, b) => {
    const nameA = a.name || a.full_name || '';
    const nameB = b.name || b.full_name || '';
    return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
  });
}

/**
 * Formats a student registration number (Matrícula / RA) for optimal visual presentation on screen and print.
 * Converts raw continuous 10-digit formats (e.g. '0020202017' -> '002020/2017')
 * and normalizes unpadded slashed codes (e.g. '2530/2026' -> '002530/2026').
 */
export function formatRegistrationNumber(reg: string | number | null | undefined, fallback: string = '---'): string {
  if (reg === null || reg === undefined) return fallback;
  const clean = String(reg).trim();
  if (!clean) return fallback;

  // Already has slash: e.g. "2530/2026" or "002530/2026"
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 2) {
      const numPart = parts[0].trim();
      const yearPart = parts[1].trim();
      if (/^\d+$/.test(numPart) && /^\d{4}$/.test(yearPart)) {
        return `${numPart.padStart(6, '0')}/${yearPart}`;
      }
      return `${numPart}/${yearPart}`;
    }
    return clean;
  }

  // 10 digits continuous (e.g. "0020202017" -> 6 digits sequential + 4 digits year "002020/2017")
  if (/^\d{10}$/.test(clean)) {
    const numPart = clean.substring(0, 6);
    const yearPart = clean.substring(6);
    return `${numPart}/${yearPart}`;
  }

  // Pure digits: 7 to 9 digits where the last 4 represent a valid 4-digit year (1970 - 2099)
  if (/^\d+$/.test(clean) && clean.length >= 7 && clean.length <= 10) {
    const yearPart = clean.slice(-4);
    const yearNum = parseInt(yearPart, 10);
    if (yearNum >= 1970 && yearNum <= 2099) {
      const numPart = clean.slice(0, -4);
      return `${numPart.padStart(6, '0')}/${yearPart}`;
    }
  }

  return clean;
}

