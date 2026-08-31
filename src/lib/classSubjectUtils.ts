/**
 * Centralized Subject & Class Normalization and Resolution Utilities
 * Ensures homogeneous semester (1º and 2º Semestre) and subject slot handling
 * across all system modules: Classes, Subjects, StudentFicha (Histórico), Bulletin,
 * Grades, Attendance, Assessments, Reports, Impressos, and Documents.
 */

export interface SubjectItemType {
  id: string;
  code?: string;
  name: string;
  status?: string;
  year?: string;
  semester?: string;
  workload?: string | number;
  teacher_id?: string;
  program_content?: string;
  [key: string]: any;
}

export interface ClassItemType {
  id: string;
  code?: string;
  name: string;
  status?: string;
  year?: string;
  semester?: string;
  course?: string;
  start_year?: string;
  subject_id?: string;
  subject_ids?: string[] | string | any;
  subject_id_sem1?: string;
  subject_id_sem1_h1?: string;
  subject_id_sem1_h2?: string;
  subject_id_sem2?: string;
  subject_id_sem2_h1?: string;
  subject_id_sem2_h2?: string;
  observations?: string;
  is_special?: boolean;
  [key: string]: any;
}

export interface SubjectClassDetails {
  semester: '1º Semestre' | '2º Semestre' | 'Anual';
  semesterNumber: 1 | 2 | 3; // 1 = 1º Sem, 2 = 2º Sem, 3 = Anual/Outro
  slotNumber: number; // 1=Sem1 H1, 2=Sem1 H2, 3=Sem2 H1, 4=Sem2 H2, etc.
  slotLabel: string;
  sortOrder: number; // Guaranteed strict sorting: 1º Semestre (1..99) < 2º Semestre (100..199) < Anual (200+)
}

/**
 * Normalizes a subject record by parsing metadata stored in program_content.
 */
export function normalizeSubject<T extends SubjectItemType>(subject: T): T {
  if (!subject) return subject;
  const normalized = { ...subject };

  if (normalized.program_content) {
    try {
      const match = String(normalized.program_content).match(/\[METADATA:(\{[\s\S]*?\})\]/);
      if (match && match[1]) {
        const meta = JSON.parse(match[1]);
        if (!normalized.semester && meta.semester) normalized.semester = meta.semester;
        if (!normalized.teacher_id && meta.teacher_id) normalized.teacher_id = meta.teacher_id;
        if (!normalized.year && meta.year) normalized.year = meta.year;
        if (!normalized.workload && meta.workload) normalized.workload = meta.workload;
      }
    } catch {}
  }

  // Standardize semester string if present
  if (normalized.semester) {
    const s = String(normalized.semester).trim().toLowerCase();
    if (s.includes('1') || s.includes('primeiro') || s.includes('1º') || s.includes('1°')) {
      normalized.semester = '1º Semestre';
    } else if (s.includes('2') || s.includes('segundo') || s.includes('2º') || s.includes('2°')) {
      normalized.semester = '2º Semestre';
    } else if (s.includes('anual') || s.includes('ambos')) {
      normalized.semester = 'Anual';
    }
  }

  return normalized;
}

/**
 * Robustly normalizes a class object, extracting all semester slots and subject_ids from:
 * 1. Direct fields: subject_id_sem1_h1, subject_id_sem1_h2, subject_id_sem2_h1, subject_id_sem2_h2, subject_id_sem1, subject_id_sem2
 * 2. observations [METADATA:{...}] payload
 * 3. subject_ids array / JSON string
 * 4. Fallback intelligent distribution of subjects into slots
 */
export function normalizeClass<T extends ClassItemType>(cls: T, allSubjects?: SubjectItemType[]): T {
  if (!cls) return cls;
  const normalized: any = { ...cls };

  let sIds: string[] = [];
  if (Array.isArray(normalized.subject_ids)) {
    sIds = [...normalized.subject_ids];
  } else if (typeof normalized.subject_ids === 'string') {
    try {
      const parsed = JSON.parse(normalized.subject_ids);
      sIds = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      sIds = normalized.subject_ids ? [normalized.subject_ids] : [];
    }
  } else if (normalized.subject_id) {
    sIds = [normalized.subject_id];
  }

  let metaSem1H1 = normalized.subject_id_sem1_h1 || '';
  let metaSem1H2 = normalized.subject_id_sem1_h2 || '';
  let metaSem2H1 = normalized.subject_id_sem2_h1 || '';
  let metaSem2H2 = normalized.subject_id_sem2_h2 || '';
  let metaSem1 = normalized.subject_id_sem1 || '';
  let metaSem2 = normalized.subject_id_sem2 || '';
  let isSpecial = !!normalized.is_special;

  if (normalized.observations) {
    try {
      const match = String(normalized.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
      if (match && match[1]) {
        const meta = JSON.parse(match[1]);
        if (!normalized.year && meta.year) normalized.year = meta.year;
        if (!normalized.semester && (meta.semester || meta.semester_id)) {
          normalized.semester = meta.semester || meta.semester_id;
        }
        if (meta.course && !normalized.course) normalized.course = meta.course;
        if (meta.start_year && (!normalized.start_year || String(normalized.start_year).trim() === '')) {
          normalized.start_year = String(meta.start_year).trim();
        }
        if (meta.subject_id_sem1_h1 !== undefined && meta.subject_id_sem1_h1 !== null) metaSem1H1 = meta.subject_id_sem1_h1;
        if (meta.subject_id_sem1_h2 !== undefined && meta.subject_id_sem1_h2 !== null) metaSem1H2 = meta.subject_id_sem1_h2;
        if (meta.subject_id_sem2_h1 !== undefined && meta.subject_id_sem2_h1 !== null) metaSem2H1 = meta.subject_id_sem2_h1;
        if (meta.subject_id_sem2_h2 !== undefined && meta.subject_id_sem2_h2 !== null) metaSem2H2 = meta.subject_id_sem2_h2;
        if (meta.subject_id_sem1 !== undefined && !metaSem1H1) metaSem1H1 = meta.subject_id_sem1;
        if (meta.subject_id_sem2 !== undefined && !metaSem2H1) metaSem2H1 = meta.subject_id_sem2;
        if (meta.subject_ids && Array.isArray(meta.subject_ids) && meta.subject_ids.length > 0) {
          meta.subject_ids.forEach((id: string) => {
            if (id && !sIds.includes(id)) sIds.push(id);
          });
        }
        if (meta.is_special !== undefined) isSpecial = !!meta.is_special;
      }
    } catch {}
  }

  // Include direct slot values into sIds
  [metaSem1H1, metaSem1H2, metaSem2H1, metaSem2H2, metaSem1, metaSem2].forEach(id => {
    if (id && !sIds.includes(id)) sIds.push(id);
  });

  // If slots are not fully filled, but we have subjects in sIds, distribute them intelligently
  if (allSubjects && allSubjects.length > 0 && sIds.length > 0) {
    const loadedSubs = sIds.map(sid => allSubjects.find(s => s.id === sid)).filter(Boolean) as SubjectItemType[];
    
    // Check if slots are missing
    if (!metaSem1H1 || !metaSem1H2 || !metaSem2H1 || !metaSem2H2) {
      const isSem1Sub = (s: SubjectItemType) => {
        const sem = (s?.semester || '').toLowerCase();
        const name = (s?.name || '').toLowerCase();
        return sem.includes('1') || name.includes('1º') || name.includes('1°') || name.includes('1 sem');
      };
      const isSem2Sub = (s: SubjectItemType) => {
        const sem = (s?.semester || '').toLowerCase();
        const name = (s?.name || '').toLowerCase();
        return sem.includes('2') || name.includes('2º') || name.includes('2°') || name.includes('2 sem');
      };

      const s1Candidates = loadedSubs.filter(s => isSem1Sub(s));
      const s2Candidates = loadedSubs.filter(s => isSem2Sub(s));
      const otherCandidates = loadedSubs.filter(s => !isSem1Sub(s) && !isSem2Sub(s));

      if (!metaSem1H1 && s1Candidates[0]) metaSem1H1 = s1Candidates[0].id;
      if (!metaSem1H2 && s1Candidates[1]) metaSem1H2 = s1Candidates[1].id;
      if (!metaSem2H1 && s2Candidates[0]) metaSem2H1 = s2Candidates[0].id;
      if (!metaSem2H2 && s2Candidates[1]) metaSem2H2 = s2Candidates[1].id;

      // Fill any remaining empty slots with unassigned subjects
      const currentAssigned = new Set([metaSem1H1, metaSem1H2, metaSem2H1, metaSem2H2].filter(Boolean));
      const unassigned = loadedSubs.filter(s => !currentAssigned.has(s.id));

      let uIdx = 0;
      if (!metaSem1H1 && unassigned[uIdx]) { metaSem1H1 = unassigned[uIdx].id; uIdx++; }
      if (!metaSem1H2 && unassigned[uIdx]) { metaSem1H2 = unassigned[uIdx].id; uIdx++; }
      if (!metaSem2H1 && unassigned[uIdx]) { metaSem2H1 = unassigned[uIdx].id; uIdx++; }
      if (!metaSem2H2 && unassigned[uIdx]) { metaSem2H2 = unassigned[uIdx].id; uIdx++; }
    }
  }

  const consolidatedSids = Array.from(
    new Set([metaSem1H1, metaSem1H2, metaSem2H1, metaSem2H2, metaSem1, metaSem2, ...sIds])
  ).filter(Boolean) as string[];

  normalized.subject_id_sem1_h1 = metaSem1H1 || null;
  normalized.subject_id_sem1_h2 = metaSem1H2 || null;
  normalized.subject_id_sem2_h1 = metaSem2H1 || null;
  normalized.subject_id_sem2_h2 = metaSem2H2 || null;
  normalized.subject_id_sem1 = metaSem1H1 || metaSem1H2 || null;
  normalized.subject_id_sem2 = metaSem2H1 || metaSem2H2 || null;
  normalized.subject_ids = consolidatedSids;
  normalized.is_special = isSpecial;

  // Infer days_of_week as array if needed
  if (typeof normalized.days_of_week === 'string') {
    try {
      normalized.days_of_week = JSON.parse(normalized.days_of_week);
    } catch {
      normalized.days_of_week = normalized.days_of_week ? [normalized.days_of_week] : [];
    }
  }

  return normalized as T;
}

/**
 * Returns exact semester, slot, and sortOrder for a subject within a class context.
 * Guarantees that all 1º Semestre subjects have sortOrder (1..99),
 * and all 2º Semestre subjects have sortOrder (100..199).
 */
export function getSubjectClassDetails(
  subject: SubjectItemType,
  classItem?: ClassItemType | null
): SubjectClassDetails {
  if (!subject) {
    return {
      semester: '1º Semestre',
      semesterNumber: 1,
      slotNumber: 1,
      slotLabel: '1º Semestre',
      sortOrder: 1
    };
  }

  const subId = subject.id;

  // 1. Check explicit class slot configuration FIRST (gives class-level authoritative schedule)
  if (classItem) {
    const s1h1 = classItem.subject_id_sem1_h1;
    const s1h2 = classItem.subject_id_sem1_h2;
    const s2h1 = classItem.subject_id_sem2_h1;
    const s2h2 = classItem.subject_id_sem2_h2;
    const s1 = classItem.subject_id_sem1;
    const s2 = classItem.subject_id_sem2;

    if (s1h1 && subId === s1h1) {
      return {
        semester: '1º Semestre',
        semesterNumber: 1,
        slotNumber: 1,
        slotLabel: '1º Horário (1º Semestre)',
        sortOrder: 1
      };
    }
    if (s1h2 && subId === s1h2) {
      return {
        semester: '1º Semestre',
        semesterNumber: 1,
        slotNumber: 2,
        slotLabel: '2º Horário (1º Semestre)',
        sortOrder: 2
      };
    }
    if (s2h1 && subId === s2h1) {
      return {
        semester: '2º Semestre',
        semesterNumber: 2,
        slotNumber: 3,
        slotLabel: '1º Horário (2º Semestre)',
        sortOrder: 101
      };
    }
    if (s2h2 && subId === s2h2) {
      return {
        semester: '2º Semestre',
        semesterNumber: 2,
        slotNumber: 4,
        slotLabel: '2º Horário (2º Semestre)',
        sortOrder: 102
      };
    }
    if (s1 && subId === s1) {
      return {
        semester: '1º Semestre',
        semesterNumber: 1,
        slotNumber: 1,
        slotLabel: '1º Semestre',
        sortOrder: 3
      };
    }
    if (s2 && subId === s2) {
      return {
        semester: '2º Semestre',
        semesterNumber: 2,
        slotNumber: 3,
        slotLabel: '2º Semestre',
        sortOrder: 103
      };
    }

    // Check observations metadata in class
    if (classItem.observations) {
      try {
        const match = String(classItem.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
        if (match && match[1]) {
          const meta = JSON.parse(match[1]);
          if (meta.subject_id_sem1_h1 === subId) {
            return { semester: '1º Semestre', semesterNumber: 1, slotNumber: 1, slotLabel: '1º Horário (1º Semestre)', sortOrder: 1 };
          }
          if (meta.subject_id_sem1_h2 === subId) {
            return { semester: '1º Semestre', semesterNumber: 1, slotNumber: 2, slotLabel: '2º Horário (1º Semestre)', sortOrder: 2 };
          }
          if (meta.subject_id_sem2_h1 === subId) {
            return { semester: '2º Semestre', semesterNumber: 2, slotNumber: 3, slotLabel: '1º Horário (2º Semestre)', sortOrder: 101 };
          }
          if (meta.subject_id_sem2_h2 === subId) {
            return { semester: '2º Semestre', semesterNumber: 2, slotNumber: 4, slotLabel: '2º Horário (2º Semestre)', sortOrder: 102 };
          }
        }
      } catch {}
    }

    // If subject is in classItem.subject_ids list
    if (Array.isArray(classItem.subject_ids)) {
      const idx = classItem.subject_ids.indexOf(subId);
      if (idx >= 0) {
        const sem = (subject.semester || '').toLowerCase();
        const name = (subject.name || '').toLowerCase();
        if (sem.includes('1') || name.includes('1º') || name.includes('1°') || name.includes('1 sem')) {
          return {
            semester: '1º Semestre',
            semesterNumber: 1,
            slotNumber: 10 + idx,
            slotLabel: '1º Semestre',
            sortOrder: 10 + idx
          };
        }
        if (sem.includes('2') || name.includes('2º') || name.includes('2°') || name.includes('2 sem')) {
          return {
            semester: '2º Semestre',
            semesterNumber: 2,
            slotNumber: 20 + idx,
            slotLabel: '2º Semestre',
            sortOrder: 110 + idx
          };
        }
        // If class itself is strictly 1º Semestre or 2º Semestre
        if (classItem.semester) {
          const clsSemLower = String(classItem.semester).toLowerCase();
          if (clsSemLower.includes('2') && !clsSemLower.includes('1')) {
            return {
              semester: '2º Semestre',
              semesterNumber: 2,
              slotNumber: 20 + idx,
              slotLabel: '2º Semestre',
              sortOrder: 110 + idx
            };
          }
        }
        return {
          semester: '1º Semestre',
          semesterNumber: 1,
          slotNumber: 10 + idx,
          slotLabel: '1º Semestre',
          sortOrder: 10 + idx
        };
      }
    }
  }

  // 2. Direct semester property on subject
  if (subject.semester && typeof subject.semester === 'string' && subject.semester.trim()) {
    const s = subject.semester.trim().toLowerCase();
    if (s.includes('1') || s.includes('primeiro') || s.includes('1º') || s.includes('1°') || s.includes('1 sem')) {
      return {
        semester: '1º Semestre',
        semesterNumber: 1,
        slotNumber: 50,
        slotLabel: '1º Semestre',
        sortOrder: 50
      };
    }
    if (s.includes('2') || s.includes('segundo') || s.includes('2º') || s.includes('2°') || s.includes('2 sem')) {
      return {
        semester: '2º Semestre',
        semesterNumber: 2,
        slotNumber: 50,
        slotLabel: '2º Semestre',
        sortOrder: 150
      };
    }
    if (s.includes('anual') || s.includes('ambos')) {
      return {
        semester: 'Anual',
        semesterNumber: 3,
        slotNumber: 50,
        slotLabel: 'Anual',
        sortOrder: 250
      };
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
          if (mSem.includes('1')) {
            return { semester: '1º Semestre', semesterNumber: 1, slotNumber: 60, slotLabel: '1º Semestre', sortOrder: 60 };
          }
          if (mSem.includes('2')) {
            return { semester: '2º Semestre', semesterNumber: 2, slotNumber: 60, slotLabel: '2º Semestre', sortOrder: 160 };
          }
        }
      }
    } catch {}
  }

  // 4. Name regex heuristics
  const str = `${subject.code || ''} ${subject.name || ''}`.toLowerCase();
  if (/\b(1º|1°|1o|1s|semestre 1|1º sem|1 sem|1ºsem|sem 1|1º semestre)\b/i.test(str)) {
    return {
      semester: '1º Semestre',
      semesterNumber: 1,
      slotNumber: 70,
      slotLabel: '1º Semestre',
      sortOrder: 70
    };
  }
  if (/\b(2º|2°|2o|2s|semestre 2|2º sem|2 sem|2ºsem|sem 2|2º semestre)\b/i.test(str)) {
    return {
      semester: '2º Semestre',
      semesterNumber: 2,
      slotNumber: 70,
      slotLabel: '2º Semestre',
      sortOrder: 170
    };
  }

  // Default fallback: 1º Semestre
  return {
    semester: '1º Semestre',
    semesterNumber: 1,
    slotNumber: 80,
    slotLabel: '1º Semestre',
    sortOrder: 80
  };
}

/**
 * Returns all subjects belonging to a class, sorted strictly by:
 * 1º Semestre (1º Horário -> 2º Horário -> Outros)
 * followed by 2º Semestre (1º Horário -> 2º Horário -> Outros)
 * followed by Anual/Geral.
 */
export function getClassSubjects(
  classItem: ClassItemType | null | undefined,
  allSubjects: SubjectItemType[],
  assessments?: any[],
  grades?: any[]
): SubjectItemType[] {
  if (!classItem) return [];

  const classId = classItem.id;
  const sIds = new Set<string>();

  // Add from slots
  [
    classItem.subject_id_sem1_h1,
    classItem.subject_id_sem1_h2,
    classItem.subject_id_sem2_h1,
    classItem.subject_id_sem2_h2,
    classItem.subject_id_sem1,
    classItem.subject_id_sem2,
    classItem.subject_id
  ].forEach(id => {
    if (id) sIds.add(id);
  });

  // Add from subject_ids
  if (Array.isArray(classItem.subject_ids)) {
    classItem.subject_ids.forEach(id => {
      if (id) sIds.add(id);
    });
  }

  // Add from observations metadata
  if (classItem.observations) {
    try {
      const match = String(classItem.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
      if (match && match[1]) {
        const meta = JSON.parse(match[1]);
        [
          meta.subject_id_sem1_h1,
          meta.subject_id_sem1_h2,
          meta.subject_id_sem2_h1,
          meta.subject_id_sem2_h2,
          meta.subject_id_sem1,
          meta.subject_id_sem2
        ].forEach(id => {
          if (id) sIds.add(id);
        });
        if (meta.subject_ids && Array.isArray(meta.subject_ids)) {
          meta.subject_ids.forEach((id: string) => {
            if (id) sIds.add(id);
          });
        }
      }
    } catch {}
  }

  // Fallback: assessments or grades for this class
  if (assessments && assessments.length > 0) {
    assessments.forEach(a => {
      if (a.class_id === classId && a.subject_id) sIds.add(a.subject_id);
    });
  }
  if (grades && grades.length > 0) {
    grades.forEach(g => {
      if (g.class_id === classId && g.subject_id) sIds.add(g.subject_id);
    });
  }

  const matchedSubjects = allSubjects.filter(sub => sIds.has(sub.id));

  // Sort strictly by semester and slot
  matchedSubjects.sort((a, b) => {
    const detailsA = getSubjectClassDetails(a, classItem);
    const detailsB = getSubjectClassDetails(b, classItem);

    if (detailsA.sortOrder !== detailsB.sortOrder) {
      return detailsA.sortOrder - detailsB.sortOrder;
    }
    return (a.name || '').localeCompare(b.name || '', 'pt-BR');
  });

  return matchedSubjects;
}

/**
 * Returns formatted display name for a subject with its semester / slot tag.
 * e.g., "MARIOLOGIA (1º SEMESTRE - 1º HORÁRIO)" or "MARIOLOGIA (1º SEMESTRE)"
 */
export function formatSubjectDisplayName(
  subject: SubjectItemType | any,
  classItem?: ClassItemType | any,
  uppercase: boolean = false
): string {
  if (!subject) return '';
  const baseName = uppercase ? (subject.name || '').toUpperCase() : (subject.name || '');
  const details = getSubjectClassDetails(subject, classItem);
  const tag = details.slotLabel ? (uppercase ? details.slotLabel.toUpperCase() : details.slotLabel) : (uppercase ? details.semester.toUpperCase() : details.semester);
  return `${baseName} (${tag})`;
}
