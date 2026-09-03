import { Teacher, Subject, Class, UserProfile, Assessment } from '../types';
import { normalizeSubject, getClassSubjects } from './utils';

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
        // Fallback para lista separada por vírgula (ex: "001,012")
        if (raw.includes(',')) {
          teacherSubIds = raw.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          teacherSubIds = raw ? [raw] : [];
        }
      }
    }
  }

  // Fallback: Checa metadados na observação do professor [SUBJECTS:[...]]
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

  // Também verificar nas disciplinas se teacher_id bate (direto ou via metadados de program_content)
  subjects.forEach(sub => {
    const subTeacherId = sub.teacher_id;
    const teacherId = teacher.id;
    const teacherNameClean = (teacher.name || '').toLowerCase().trim();
    
    // 1. Match direto por ID
    if (subTeacherId === teacherId) {
      allowedSubjectIds.add(sub.id);
      return;
    }

    // 2. Match por Nome (caso o teacher_id na disciplina seja o nome do professor)
    if (subTeacherId && typeof subTeacherId === 'string' && subTeacherId.length > 2) {
      const cleanSubTeacherId = subTeacherId.toLowerCase().trim();
      
      // Helper para remover títulos e comparar
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

    // 3. Match via metadados de program_content
    if (sub.program_content) {
      try {
        const match = String(sub.program_content).match(/\[METADATA:(\{[\s\S]*?\})\]/);
        if (match && match[1]) {
          const meta = JSON.parse(match[1]);
          if (meta.teacher_id === teacherId) {
            allowedSubjectIds.add(sub.id);
          } else if (meta.teacher_id && typeof meta.teacher_id === 'string') {
            // Repetir lógica de nome para metadados
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

  // Também verificar em avaliações se houver
  if (assessments && assessments.length > 0) {
    assessments.forEach(ass => {
      // Se houver algum assessment com o subject do professor
      if (ass.subject_id && (teacherSubIds.includes(ass.subject_id) || allowedSubjectIds.has(ass.subject_id))) {
        allowedSubjectIds.add(ass.subject_id);
      }
    });
  }

  // Agora, coleta as turmas que possuem pelo menos uma dessas disciplinas
  const allowedClassIds = new Set<string>();

  classes.forEach(cls => {
    // Coleta todas as disciplinas associadas a essa turma (usando a mesma lógica do Dashboard)
    const classSubjects = getClassSubjects(cls, subjects);
    
    // Verifica se alguma disciplina da turma pertence ao professor
    const hasAllowedSubject = classSubjects.some(s => allowedSubjectIds.has(s.id));
    
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
