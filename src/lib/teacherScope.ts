import { Teacher, Subject, Class, UserProfile, Assessment } from '../types';
import { normalizeSubject, getClassSubjects } from './utils';
import { getItemUnitId, isItemInUnit, getUnitName, getUserRestrictedUnit } from './unitService';

export interface TeacherScope {
  isTeacherRole: boolean;
  teacher: Teacher | null;
  teacherName: string;
  allowedSubjectIds: Set<string>;
  allowedClassIds: Set<string>;
  hasAccess: boolean;
  emptyReason?: string;
  // Gestão e diagnóstico de regras de unidade (polo)
  hasUnitConflict?: boolean;
  conflictType?: 'none' | 'no_classes_in_unit' | 'classes_in_other_unit';
  conflictMessage?: string;
  activeUnitName?: string;
  teacherUnitName?: string;
  otherUnitClasses?: Array<{ id: string; name: string; unitName: string }>;
}

/**
 * Encontra o registro de Teacher correspondente ao usuário logado
 */
export function findTeacherForUser(
  profile: UserProfile | null | undefined,
  teachers: Array<Teacher | any>
): any | null {
  if (!profile) return null;

  // 1. Vínculo direto por teacher_id no perfil
  if (profile.teacher_id) {
    const matched = teachers.find(t => String(t.id) === String(profile.teacher_id));
    if (matched) return matched;
  }

  // 2. Vínculo por e-mail (case-insensitive)
  if (profile.email) {
    const cleanEmail = profile.email.toLowerCase().trim();
    const matched = teachers.find(t => t.email && t.email.toLowerCase().trim() === cleanEmail);
    if (matched) return matched;
  }

  // 3. Vínculo por nome (case-insensitive e normalizado)
  const cleanName = (profile.name || profile.full_name || '').toLowerCase().trim();
  if (cleanName) {
    // Busca exata
    let matched = teachers.find(t => (t.name || '').toLowerCase().trim() === cleanName);
    if (matched) return matched;

    // Busca por inclusão (ex: "Pedro Paulo" em "Pe. Pedro Paulo" ou vice-versa)
    const stripTitles = (s: string) => s.toLowerCase()
      .replace(/^(prof\.|prof|professor|professora|pe\.|pe|padre|dom|mons\.|frei)\s+/gi, '')
      .trim();

    const strippedUserName = stripTitles(cleanName);
    if (strippedUserName.length >= 3) {
      matched = teachers.find(t => {
        const strippedTeacherName = stripTitles(t.name || '');
        return strippedTeacherName.includes(strippedUserName) || strippedUserName.includes(strippedTeacherName);
      });
      if (matched) return matched;
    }
  }

  return null;
}

/**
 * Calcula o escopo de turmas e disciplinas permitidas para o usuário logado,
 * priorizando estritamente as regras de unidade (polo).
 * Se o usuário não for professor (for admin, diretor, secretario, etc.), retorna escopo por unidade.
 */
export function getTeacherScope(
  profile: UserProfile | null | undefined,
  teachers: Array<Teacher | any>,
  subjects: Array<Subject | any>,
  classes: Array<Class | any>,
  assessments?: Array<Assessment | any>,
  activeUnitId?: string,
  units: Array<any> = []
): TeacherScope {
  const isTeacherRole = profile?.role === 'professor' || profile?.role === 'docente';

  // Prioridade máxima de unidade: se o usuário tiver restrição no perfil, essa é a unidade mandatória
  const restrictedUnitId = getUserRestrictedUnit(profile);
  const effectiveUnitId = restrictedUnitId || activeUnitId;
  const isFilteringByUnit = effectiveUnitId && effectiveUnitId !== 'all' && effectiveUnitId.toLowerCase() !== 'todas';
  const activeUnitName = getUnitName(units, effectiveUnitId);

  if (!isTeacherRole) {
    // Escopo para administradores, secretários, diretores:
    // Se houver unidade ativa selecionada, restringe as turmas para essa unidade
    const scopedClasses = isFilteringByUnit 
      ? classes.filter(c => isItemInUnit(getItemUnitId(c), effectiveUnitId, units))
      : classes;

    const allSubjectIds = new Set(subjects.map(s => s.id));
    const allClassIds = new Set(scopedClasses.map(c => c.id));
    return {
      isTeacherRole: false,
      teacher: null,
      teacherName: profile?.name || 'Administrador',
      allowedSubjectIds: allSubjectIds,
      allowedClassIds: allClassIds,
      hasAccess: true,
      activeUnitName
    };
  }

  const teacher = findTeacherForUser(profile, teachers);
  const teacherName = teacher?.name || profile?.name || 'Professor(a)';
  const teacherAssignedUnitId = profile?.unit_id || teacher?.unit_id;
  const teacherUnitName = getUnitName(units, teacherAssignedUnitId);

  if (!teacher) {
    return {
      isTeacherRole: true,
      teacher: null,
      teacherName,
      allowedSubjectIds: new Set<string>(),
      allowedClassIds: new Set<string>(),
      hasAccess: false,
      emptyReason: `Não foi encontrado nenhum cadastro de docente vinculado ao seu usuário (${profile?.email || profile?.name}). Solicite à Secretaria ou Direção que vincule o seu usuário ao cadastro de Docente correspondente na aba Usuários.`,
      activeUnitName,
      teacherUnitName
    };
  }

  // Coleta todas as disciplinas do professor na instituição
  const allowedSubjectIds = new Set<string>();

  let teacherSubIds: string[] = [];
  if (Array.isArray(teacher.subject_ids)) {
    teacherSubIds = teacher.subject_ids;
  } else if (typeof teacher.subject_ids === 'string') {
    const raw = teacher.subject_ids as string;
    if (raw.startsWith('{')) {
      teacherSubIds = raw.replace(/[{}]/g, '').split(',').filter(Boolean);
    } else {
      try {
        const parsed = JSON.parse(raw);
        teacherSubIds = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        if (raw.includes(',')) {
          teacherSubIds = raw.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          teacherSubIds = raw ? [raw] : [];
        }
      }
    }
  }

  if (teacher.observations) {
    const match = teacher.observations.match(/\[SUBJECTS:(\[[\s\S]*?\])\]/);
    if (match && match[1]) {
      try {
        const metaIds = JSON.parse(match[1]);
        if (Array.isArray(metaIds)) {
          metaIds.forEach(id => {
            if (id && !teacherSubIds.includes(id)) teacherSubIds.push(id);
          });
        }
      } catch {}
    }
  }

  teacherSubIds.forEach(id => {
    if (id) allowedSubjectIds.add(id);
  });

  subjects.forEach(sub => {
    const subTeacherId = sub.teacher_id;
    const teacherId = teacher.id;
    const teacherNameClean = (teacher.name || '').toLowerCase().trim();
    
    if (subTeacherId === teacherId) {
      allowedSubjectIds.add(sub.id);
      return;
    }

    if (subTeacherId && typeof subTeacherId === 'string' && subTeacherId.length > 2) {
      const cleanSubTeacherId = subTeacherId.toLowerCase().trim();
      const stripTitles = (s: string) => s.toLowerCase()
        .replace(/^(prof\.|prof|professor|professora|pe\.|pe|padre|dom|mons\.|frei)\s+/gi, '')
        .trim();

      const s1 = stripTitles(cleanSubTeacherId);
      const s2 = stripTitles(teacherNameClean);

      if (s1 === s2 || (s1.length > 3 && s2.includes(s1)) || (s2.length > 3 && s1.includes(s2))) {
        allowedSubjectIds.add(sub.id);
        return;
      }
    }

    if (sub.program_content) {
      try {
        const match = String(sub.program_content).match(/\[METADATA:(\{[\s\S]*?\})\]/);
        if (match && match[1]) {
          const meta = JSON.parse(match[1]);
          if (meta.teacher_id === teacherId) {
            allowedSubjectIds.add(sub.id);
          } else if (meta.teacher_id && typeof meta.teacher_id === 'string') {
            const stripTitles = (s: string) => s.toLowerCase()
              .replace(/^(prof\.|prof|professor|professora|pe\.|pe|padre|dom|mons\.|frei)\s+/gi, '')
              .trim();
            const s1 = stripTitles(meta.teacher_id);
            const s2 = stripTitles(teacherNameClean);
            if (s1 === s2 && s1.length > 2) {
              allowedSubjectIds.add(sub.id);
            }
          }
        }
      } catch {}
    }
  });

  if (assessments && assessments.length > 0) {
    assessments.forEach(ass => {
      if (ass.subject_id && (teacherSubIds.includes(ass.subject_id) || allowedSubjectIds.has(ass.subject_id))) {
        allowedSubjectIds.add(ass.subject_id);
      }
    });
  }

  // 1. Coleta todas as turmas que possuem disciplinas do professor
  const globalClassesWithTeacherSubjects: any[] = [];
  classes.forEach(cls => {
    const classSubjects = getClassSubjects(cls, subjects);
    const hasAllowedSubject = classSubjects.some(s => allowedSubjectIds.has(s.id));
    if (hasAllowedSubject) {
      globalClassesWithTeacherSubjects.push(cls);
    }
  });

  // 2. Aplica RIGOROSAMENTE as regras da unidade ativa
  let scopedClasses: any[] = [];
  let otherUnitClasses: Array<{ id: string; name: string; unitName: string }> = [];

  if (isFilteringByUnit) {
    scopedClasses = globalClassesWithTeacherSubjects.filter(cls => 
      isItemInUnit(getItemUnitId(cls), effectiveUnitId, units)
    );
    const excludedClasses = globalClassesWithTeacherSubjects.filter(cls => 
      !isItemInUnit(getItemUnitId(cls), effectiveUnitId, units)
    );
    otherUnitClasses = excludedClasses.map(cls => ({
      id: cls.id,
      name: cls.name || 'Turma',
      unitName: getUnitName(units, getItemUnitId(cls))
    }));
  } else {
    scopedClasses = globalClassesWithTeacherSubjects;
  }

  const allowedClassIds = new Set<string>(scopedClasses.map(c => c.id));

  // 3. Detecção e diagnóstico de conflitos de unidade
  let hasUnitConflict = false;
  let conflictType: 'none' | 'no_classes_in_unit' | 'classes_in_other_unit' = 'none';
  let conflictMessage: string | undefined = undefined;

  if (isFilteringByUnit && otherUnitClasses.length > 0 && scopedClasses.length === 0) {
    // CONFLITO TOTAL: Professor tem turmas em outra unidade (ex: Matriz), mas nenhuma na unidade em que está conectado!
    hasUnitConflict = true;
    conflictType = 'classes_in_other_unit';
    const distinctOtherUnits = Array.from(new Set(otherUnitClasses.map(o => o.unitName))).join(', ');
    const classesListStr = otherUnitClasses.map(o => `"${o.name}"`).join(', ');

    conflictMessage = `Conflito de Unidade: O perfil de ${teacherName} está restrito à "${activeUnitName}", porém suas turmas ativas (${classesListStr}) pertencem à "${distinctOtherUnits}". Não há turmas desta unidade vinculadas à sua escala de aulas no momento.`;
  } else if (isFilteringByUnit && otherUnitClasses.length > 0 && scopedClasses.length > 0) {
    // CONFLITO PARCIAL / AVISO: Professor leciona nesta unidade e também possui turmas em outra unidade
    hasUnitConflict = true;
    conflictType = 'classes_in_other_unit';
    const distinctOtherUnits = Array.from(new Set(otherUnitClasses.map(o => o.unitName))).join(', ');
    const classesListStr = otherUnitClasses.map(o => `"${o.name}"`).join(', ');

    conflictMessage = `Exibindo apenas as ${scopedClasses.length} turma(s) da unidade "${activeUnitName}". As turmas ${classesListStr} pertencem à "${distinctOtherUnits}" e estão ocultadas nesta unidade.`;
  }

  // 4. Definição de permissão de acesso e mensagem de motivo vazio
  const hasAccess = allowedSubjectIds.size > 0 && allowedClassIds.size > 0;
  let emptyReason: string | undefined = undefined;

  if (allowedSubjectIds.size === 0) {
    emptyReason = `O docente ${teacherName} ainda não possui nenhuma disciplina vinculada na Escala de Professores.`;
  } else if (allowedClassIds.size === 0) {
    if (hasUnitConflict && conflictMessage) {
      emptyReason = conflictMessage;
    } else if (isFilteringByUnit) {
      emptyReason = `Não há turmas ativas na unidade "${activeUnitName}" alocadas para as disciplinas do docente ${teacherName}.`;
    } else {
      emptyReason = `As disciplinas do docente ${teacherName} ainda não foram alocadas em nenhuma turma ativa.`;
    }
  }

  return {
    isTeacherRole: true,
    teacher,
    teacherName,
    allowedSubjectIds,
    allowedClassIds,
    hasAccess,
    emptyReason,
    hasUnitConflict,
    conflictType,
    conflictMessage,
    activeUnitName,
    teacherUnitName,
    otherUnitClasses
  };
}
