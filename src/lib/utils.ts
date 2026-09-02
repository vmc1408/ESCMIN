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

import { getSubjectClassDetails } from './classSubjectUtils';
export * from './classSubjectUtils';

/**
 * Detects whether a subject belongs to the 1st or 2nd semester (or Anual)
 * based on its properties, metadata, class bindings (1º vs 2º semestre slots) or sequence.
 */
export function detectSubjectSemester(subject: any, classItem?: any): string {
  if (!subject) return '';
  const details = getSubjectClassDetails(subject, classItem);
  return details.semester || '';
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

/**
 * Normalizes a string for search matching by stripping diacritics/accents,
 * converting to lowercase, and trimming whitespace.
 * e.g., "João Müller" -> "joao muller", "Conceição" -> "conceicao"
 */
export function normalizeSearchString(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Checks whether a candidate text matches a search query, handling:
 * 1. Accented vs non-accented characters interchangeably ("João" <-> "joao", "José" <-> "jose")
 * 2. Case-insensitivity ("MARIA" <-> "maria")
 * 3. Multi-word search matching (e.g. "joao silva" matches "João Pedro da Silva")
 * 4. Extra whitespace tolerance
 */
export function matchesSearchText(
  target: string | null | undefined,
  query: string | null | undefined
): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;

  const normTarget = normalizeSearchString(target);
  const normQuery = normalizeSearchString(query);

  if (!normQuery) return true;

  // Direct substring match first (fastest)
  if (normTarget.includes(normQuery)) return true;

  // Multi-word search: all query terms must appear in the target string
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1) {
    return queryTokens.every(token => normTarget.includes(token));
  }

  return false;
}

/**
 * Specialized helper to check if a student matches a search term across:
 * - Full name (accent-insensitive, multi-word matching)
 * - Registration number (both raw continuous and formatted e.g. "002020/2017")
 * - CPF (digits and formatted)
 * - Email (if provided)
 */
export function matchesStudentSearch(
  student: {
    name?: string | null;
    full_name?: string | null;
    registration_number?: string | number | null;
    code?: string | number | null;
    cpf?: string | null;
    email?: string | null;
  } | null | undefined,
  searchTerm: string | null | undefined
): boolean {
  if (!searchTerm || !searchTerm.trim()) return true;
  if (!student) return false;

  const rawTerm = searchTerm.trim();
  const normTerm = normalizeSearchString(rawTerm);
  if (!normTerm) return true;

  // 1. Match student name (accent and case insensitive, with multi-word support)
  const studentName = student.name || student.full_name || '';
  if (studentName && matchesSearchText(studentName, normTerm)) {
    return true;
  }

  // 2. Match registration number (both raw continuous and formatted e.g. "002020/2017")
  const regRaw = String(student.registration_number || student.code || '').trim();
  if (regRaw) {
    const normReg = normalizeSearchString(regRaw);
    if (normReg.includes(normTerm)) return true;

    const regFormatted = formatRegistrationNumber(regRaw, '');
    if (regFormatted && normalizeSearchString(regFormatted).includes(normTerm)) {
      return true;
    }
  }

  // 3. Match CPF (by pure digits or masked string)
  if (student.cpf) {
    const rawCpf = String(student.cpf).replace(/\D/g, '');
    const cleanTermDigits = rawTerm.replace(/\D/g, '');
    if (cleanTermDigits && rawCpf.includes(cleanTermDigits)) {
      return true;
    }
    if (student.cpf.toLowerCase().includes(rawTerm.toLowerCase())) {
      return true;
    }
  }

  // 4. Match email
  if (student.email) {
    if (student.email.toLowerCase().includes(rawTerm.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates a search relevance rank for a student (lower number = higher relevance):
 * 1: Exact name match
 * 2: Name starts with search query
 * 3: A word in the name starts with search query (e.g. "Silva" -> "Pedro da Silva")
 * 4: Exact registration match
 * 5: Registration starts with query
 * 6: CPF starts with query digits
 * 7: Name contains query as substring
 * 8: Multi-token match across name
 * 9: Registration or CPF contains query
 * 10: Other
 */
export function calculateStudentSearchRank(
  student: {
    name?: string | null;
    full_name?: string | null;
    registration_number?: string | number | null;
    code?: string | number | null;
    cpf?: string | null;
  } | null | undefined,
  searchTerm: string | null | undefined
): number {
  if (!searchTerm || !searchTerm.trim() || !student) return 99;

  const normTerm = normalizeSearchString(searchTerm);
  if (!normTerm) return 99;

  const name = normalizeSearchString(student.name || student.full_name || '');
  const reg = normalizeSearchString(String(student.registration_number || student.code || ''));
  const regFormatted = normalizeSearchString(formatRegistrationNumber(student.registration_number || student.code, ''));
  const cpfDigits = String(student.cpf || '').replace(/\D/g, '');
  const termDigits = searchTerm.replace(/\D/g, '');

  // Exact name match
  if (name === normTerm) return 1;

  // Full name starts with search term
  if (name.startsWith(normTerm)) return 2;

  // A word inside name starts with search term (e.g. "Pedro Silva" -> typing "silva")
  const words = name.split(/\s+/).filter(Boolean);
  if (words.some(w => w.startsWith(normTerm))) return 3;

  // Registration number match
  if (reg === normTerm || regFormatted === normTerm) return 4;
  if (reg.startsWith(normTerm) || regFormatted.startsWith(normTerm)) return 5;

  // CPF match
  if (termDigits && cpfDigits.startsWith(termDigits)) return 6;

  // Name contains search term anywhere
  if (name.includes(normTerm)) return 7;

  // Multi-term match
  const tokens = normTerm.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every(t => name.includes(t))) return 8;

  // Registration or CPF contains search term
  if (reg.includes(normTerm) || regFormatted.includes(normTerm) || (termDigits && cpfDigits.includes(termDigits))) return 9;

  return 10;
}

// Re-export centralized Subject & Class normalizers and helpers
export * from './classSubjectUtils';
