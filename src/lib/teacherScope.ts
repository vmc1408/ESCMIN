import { Teacher, Subject, Class, UserProfile, Assessment } from '../types';
import { normalizeSubject } from './utils';

export interface TeacherScope {
  isTeacherRole: boolean;
  teacher: Teacher | null;
  teacherName: string;
  allowedSubjectIds: Set<string>;
  allowedClassIds: Set<string>;
  hasAccess: boolean;
  emptyReason?: string;
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
    const matched = teachers.find(t => t.id === profile.teacher_id);
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
 * Calcula o escopo de turmas e disciplinas permitidas para o usuário logado.
 * Se o usuário não for professor (for admin, diretor, secretario, etc.), retorna escopo irrestrito.
 */
export function getTeacherScope(
  profile: UserProfile | null | undefined,
  teachers: Array<Teacher | any>,
  subjects: Array<Subject | any>,
  classes: Array<Class | any>,
  assessments?: Array<Assessment | any>
): TeacherScope {
  const isTeacherRole = profile?.role === 'professor' || profile?.role === 'docente';

  if (!isTeacherRole) {
    // Escopo total (administradores, diretores, secretários, assistentes)
    const allSubjectIds = new Set(subjects.map(s => s.id));
    const allClassIds = new Set(classes.map(c => c.id));
    return {
      isTeacherRole: false,
      teacher: null,
      teacherName: profile?.name || 'Administrador',
      allowedSubjectIds: allSubjectIds,
      allowedClassIds: allClassIds,
      hasAccess: true
    };
  }

  const teacher = findTeacherForUser(profile, teachers);
  const teacherName = teacher?.name || profile?.name || 'Professor(a)';

  if (!teacher) {
    return {
      isTeacherRole: true,
      teacher: null,
      teacherName,
      allowedSubjectIds: new Set<string>(),
      allowedClassIds: new Set<string>(),
      hasAccess: false,
      emptyReason: `Não foi encontrado nenhum cadastro de docente vinculado ao seu usuário (${profile?.email || profile?.name}). Solicite à Secretaria ou Direção que vincule o seu usuário ao cadastro de Docente correspondente na aba Usuários.`
    };
  }

  // Coleta todas as disciplinas do professor:
  // 1. Disciplinas listadas no array subject_ids do professor
  // 2. Disciplinas cujo subject.teacher_id === teacher.id
  const allowedSubjectIds = new Set<string>();

  // Helper para normalizar subject_ids do professor
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
        teacherSubIds = raw ? [raw] : [];
      }
    }
  }

  teacherSubIds.forEach(id => {
    if (id) allowedSubjectIds.add(id);
  });

  // Também verificar nas disciplinas se teacher_id bate
  subjects.forEach(sub => {
    if (sub.teacher_id === teacher.id) {
      allowedSubjectIds.add(sub.id);
    }
  });

  // Também verificar em avaliações se houver
  if (assessments && assessments.length > 0) {
    assessments.forEach(ass => {
      // Se houver algum assessment com o subject do professor
      if (ass.subject_id && teacherSubIds.includes(ass.subject_id)) {
        allowedSubjectIds.add(ass.subject_id);
      }
    });
  }

  // Agora, coleta as turmas que possuem pelo menos uma dessas disciplinas
  const allowedClassIds = new Set<string>();

  classes.forEach(cls => {
    // Coleta todos os IDs de disciplinas associados a essa turma
    const classSubjectIds: string[] = [];
    if (Array.isArray(cls.subject_ids)) {
      classSubjectIds.push(...cls.subject_ids);
    } else if (typeof cls.subject_ids === 'string') {
      try {
        const parsed = JSON.parse(cls.subject_ids);
        if (Array.isArray(parsed)) classSubjectIds.push(...parsed);
        else if (parsed) classSubjectIds.push(parsed);
      } catch {
        if (cls.subject_ids) classSubjectIds.push(cls.subject_ids);
      }
    }
    if (cls.subject_id) classSubjectIds.push(cls.subject_id);
    if (cls.subject_id_sem1) classSubjectIds.push(cls.subject_id_sem1);
    if (cls.subject_id_sem1_h1) classSubjectIds.push(cls.subject_id_sem1_h1);
    if (cls.subject_id_sem1_h2) classSubjectIds.push(cls.subject_id_sem1_h2);
    if (cls.subject_id_sem2) classSubjectIds.push(cls.subject_id_sem2);
    if (cls.subject_id_sem2_h1) classSubjectIds.push(cls.subject_id_sem2_h1);
    if (cls.subject_id_sem2_h2) classSubjectIds.push(cls.subject_id_sem2_h2);

    // Verifica se alguma disciplina da turma pertence ao professor
    const hasAllowedSubject = classSubjectIds.some(sId => allowedSubjectIds.has(sId));
    if (hasAllowedSubject) {
      allowedClassIds.add(cls.id);
    }
  });

  return {
    isTeacherRole: true,
    teacher,
    teacherName,
    allowedSubjectIds,
    allowedClassIds,
    hasAccess: allowedSubjectIds.size > 0 && allowedClassIds.size > 0,
    emptyReason: allowedSubjectIds.size === 0
      ? `O docente ${teacher.name} ainda não possui nenhuma disciplina vinculada na Escala de Professores.`
      : allowedClassIds.size === 0
      ? `As disciplinas do docente ${teacher.name} ainda não foram alocadas em nenhuma turma ativa.`
      : undefined
  };
}
