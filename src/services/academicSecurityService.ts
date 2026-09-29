import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Course, Class, Student, Enrollment } from '../types';
import { detectCourseFromClass } from '../lib/utils';

export interface ActiveClassDetail {
  id: string;
  name: string;
  code?: string;
  year?: string;
  semester?: string;
  status: string;
  activeStudentsCount: number;
}

export interface ActiveStudentDetail {
  id: string;
  name: string;
  registration_number?: string;
  linkType: 'primary' | 'enrollment';
  status: string;
}

export interface CourseSafetyCheckResult {
  canDelete: boolean;
  activeClasses: ActiveClassDetail[];
  inactiveClassesCount: number;
  totalClassesCount: number;
  activeStudentsCount: number;
  totalStudentsCount: number;
  reasons: string[];
  message: string;
  suggestedAction: 'inactivate' | 'none';
}

export interface ClassSafetyCheckResult {
  canDelete: boolean;
  activeStudents: ActiveStudentDetail[];
  activeStudentsCount: number;
  totalStudentsCount: number;
  reasons: string[];
  message: string;
  suggestedAction: 'inactivate' | 'transfer' | 'none';
}

/**
 * Normaliza strings para comparações seguras sem sensibilidade a acentos/espaços
 */
function normalizeStr(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Verifica se uma turma pertence ao curso especificado
 */
export function isClassLinkedToCourse(
  cls: Class,
  course: Course,
  allCourses: Course[] = []
): boolean {
  if (!cls || !course) return false;

  // 1. Vínculo por ID exato
  if (cls.course && cls.course === course.id) return true;

  // 2. Vínculo por código exato
  if (course.code && cls.course && cls.course.toUpperCase() === course.code.toUpperCase()) {
    return true;
  }

  // 3. Vínculo por nome do curso no campo course
  if (cls.course && normalizeStr(cls.course) === normalizeStr(course.name)) {
    return true;
  }

  // 4. Detecção inteligente pelo nome/código da turma e observações
  const detectedName = detectCourseFromClass(cls, allCourses.length > 0 ? allCourses : [course]);
  if (detectedName && normalizeStr(detectedName) === normalizeStr(course.name)) {
    return true;
  }

  return false;
}

export const academicSecurityService = {
  /**
   * Avalia a segurança de exclusão de um Curso usando dados em memória (rápido para UI)
   */
  evaluateCourseDeletionSafety(
    course: Course,
    context: {
      courses: Course[];
      classes: Class[];
      students: Student[];
      enrollments?: Enrollment[];
    }
  ): CourseSafetyCheckResult {
    const { courses, classes, students, enrollments = [] } = context;

    // 1. Identificar todas as turmas vinculadas a este curso
    const linkedClasses = classes.filter(cls => isClassLinkedToCourse(cls, course, courses));

    // Mapear alunos ativos
    const activeStudentIds = new Set(
      students.filter(s => (s.status || 'Ativo') === 'Ativo').map(s => s.id)
    );

    // Mapear matrículas ativas por turma
    const activeEnrollmentsByClass = new Map<string, Set<string>>();
    enrollments.forEach(enr => {
      if ((enr.status || 'Ativo') === 'Ativo' && activeStudentIds.has(enr.student_id)) {
        if (!activeEnrollmentsByClass.has(enr.class_id)) {
          activeEnrollmentsByClass.set(enr.class_id, new Set());
        }
        activeEnrollmentsByClass.get(enr.class_id)!.add(enr.student_id);
      }
    });

    const activeClasses: ActiveClassDetail[] = [];
    let inactiveClassesCount = 0;
    const distinctActiveStudentIdsInCourse = new Set<string>();
    let totalStudentsCount = 0;

    linkedClasses.forEach(cls => {
      // Alunos vinculados diretamente como turma principal
      const directActive = students.filter(
        s => s.class_id === cls.id && (s.status || 'Ativo') === 'Ativo'
      );
      directActive.forEach(s => distinctActiveStudentIdsInCourse.add(s.id));

      // Alunos matriculados via tabela enrollments
      const enrolledSet = activeEnrollmentsByClass.get(cls.id) || new Set<string>();
      enrolledSet.forEach(sId => distinctActiveStudentIdsInCourse.add(sId));

      const totalActiveInThisClass = new Set([
        ...directActive.map(s => s.id),
        ...Array.from(enrolledSet)
      ]).size;

      const isClassActive = cls.status === 'Ativo' || (!cls.status && cls.status !== 'Inativo' && cls.status !== 'Encerrada');

      if (isClassActive) {
        activeClasses.push({
          id: cls.id,
          name: cls.name,
          code: cls.code,
          year: cls.year,
          semester: cls.semester,
          status: cls.status || 'Ativo',
          activeStudentsCount: totalActiveInThisClass
        });
      } else {
        inactiveClassesCount++;
      }
    });

    // Também verificar alunos vinculados diretamente ao curso (ex: sem turma ou texto do curso)
    students.forEach(s => {
      if ((s.status || 'Ativo') === 'Ativo' && s.course) {
        if (
          normalizeStr(s.course) === normalizeStr(course.name) ||
          (course.code && s.course.toUpperCase() === course.code.toUpperCase())
        ) {
          distinctActiveStudentIdsInCourse.add(s.id);
        }
      }
      if (s.course && (normalizeStr(s.course) === normalizeStr(course.name) || (course.code && s.course.toUpperCase() === course.code.toUpperCase()))) {
        totalStudentsCount++;
      }
    });

    const reasons: string[] = [];
    let canDelete = true;

    if (activeClasses.length > 0) {
      canDelete = false;
      const classNames = activeClasses.map(c => `"${c.name}"`).slice(0, 3).join(', ');
      const extraCount = activeClasses.length > 3 ? ` e mais ${activeClasses.length - 3} turma(s)` : '';
      reasons.push(
        `O curso possui ${activeClasses.length} turma(s) ativa(s) e frequente(s) em andamento: ${classNames}${extraCount}.`
      );
    }

    if (distinctActiveStudentIdsInCourse.size > 0 && activeClasses.length === 0) {
      canDelete = false;
      reasons.push(
        `Existem ${distinctActiveStudentIdsInCourse.size} aluno(s) ativo(s) vinculado(s) ao programa deste curso.`
      );
    }

    let message = '';
    if (!canDelete) {
      message = `Não é possível excluir o curso "${course.name}". ` + reasons.join(' ') +
        ` Para garantir a segurança dos dados acadêmicos, encerre ou inative as turmas ativas antes de excluir o curso, ou utilize a opção "Inativar Curso".`;
    } else {
      message = `O curso "${course.name}" não possui turmas ativas nem alunos frequentes vinculados. A exclusão definitiva pode ser executada com segurança.`;
    }

    return {
      canDelete,
      activeClasses,
      inactiveClassesCount,
      totalClassesCount: linkedClasses.length,
      activeStudentsCount: distinctActiveStudentIdsInCourse.size,
      totalStudentsCount: Math.max(totalStudentsCount, distinctActiveStudentIdsInCourse.size),
      reasons,
      message,
      suggestedAction: canDelete ? 'none' : 'inactivate'
    };
  },

  /**
   * Faz verificação em tempo real diretamente contra a base de dados (Supabase)
   */
  async checkCourseDeletionSafetyLive(courseId: string): Promise<CourseSafetyCheckResult> {
    if (!isSupabaseConfigured) {
      return {
        canDelete: true,
        activeClasses: [],
        inactiveClassesCount: 0,
        totalClassesCount: 0,
        activeStudentsCount: 0,
        totalStudentsCount: 0,
        reasons: [],
        message: 'Modo offline ou Supabase não configurado.',
        suggestedAction: 'none'
      };
    }

    try {
      // 1. Obter o curso
      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle();

      const course: Course = courseData || {
        id: courseId,
        name: 'Curso',
        code: '',
        status: 'Ativo'
      };

      // 2. Obter turmas
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name, code, status, course, year, semester, observations');

      // 3. Obter alunos ativos
      const { data: activeStudentsData } = await supabase
        .from('students')
        .select('id, name, status, class_id, course')
        .eq('status', 'Ativo');

      // 4. Obter matrículas ativas
      const { data: activeEnrollmentsData } = await supabase
        .from('enrollments')
        .select('id, student_id, class_id, status')
        .eq('status', 'Ativo');

      const allCourses: Course[] = courseData ? [courseData] : [];

      return this.evaluateCourseDeletionSafety(course, {
        courses: allCourses,
        classes: (classesData || []) as Class[],
        students: (activeStudentsData || []) as Student[],
        enrollments: (activeEnrollmentsData || []) as Enrollment[]
      });
    } catch (err) {
      console.error('[academicSecurityService] Erro ao verificar segurança do curso:', err);
      // Por segurança contra falhas de rede, bloquear e avisar
      return {
        canDelete: false,
        activeClasses: [],
        inactiveClassesCount: 0,
        totalClassesCount: 0,
        activeStudentsCount: 0,
        totalStudentsCount: 0,
        reasons: ['Não foi possível validar com segurança as turmas ativas devido a um erro de conexão.'],
        message: 'Erro ao validar turmas ativas do curso. Tente novamente em instantes.',
        suggestedAction: 'inactivate'
      };
    }
  },

  /**
   * Avalia a segurança de exclusão de uma Turma usando dados em memória (rápido para UI)
   */
  evaluateClassDeletionSafety(
    classItem: Class,
    context: {
      classes?: Class[];
      students: Student[];
      enrollments?: Enrollment[];
    }
  ): ClassSafetyCheckResult {
    const { students, enrollments = [] } = context;
    const classId = classItem.id;

    // Alunos ativos com vínculo direto (class_id)
    const directActiveStudents = students.filter(
      s => s.class_id === classId && (s.status || 'Ativo') === 'Ativo'
    );

    // Alunos vinculados via matrícula ativa na turma
    const enrolledActiveStudentIds = new Set<string>();
    enrollments.forEach(enr => {
      if (enr.class_id === classId && (enr.status || 'Ativo') === 'Ativo') {
        enrolledActiveStudentIds.add(enr.student_id);
      }
    });

    const mapActiveStudents = new Map<string, ActiveStudentDetail>();

    // Adiciona diretos
    directActiveStudents.forEach(s => {
      mapActiveStudents.set(s.id, {
        id: s.id,
        name: s.name,
        registration_number: s.registration_number,
        linkType: 'primary',
        status: s.status || 'Ativo'
      });
    });

    // Adiciona por matrícula
    enrolledActiveStudentIds.forEach(studentId => {
      const studentObj = students.find(s => s.id === studentId);
      if (studentObj && (studentObj.status || 'Ativo') === 'Ativo') {
        if (!mapActiveStudents.has(studentId)) {
          mapActiveStudents.set(studentId, {
            id: studentObj.id,
            name: studentObj.name,
            registration_number: studentObj.registration_number,
            linkType: 'enrollment',
            status: studentObj.status || 'Ativo'
          });
        }
      }
    });

    const activeStudents = Array.from(mapActiveStudents.values());
    activeStudents.sort((a, b) => a.name.localeCompare(b.name));

    // Total de estudantes (incluindo inativos e concluídos)
    const totalStudentsCount = students.filter(
      s => s.class_id === classId || enrolledActiveStudentIds.has(s.id)
    ).length;

    const reasons: string[] = [];
    const canDelete = activeStudents.length === 0;

    if (!canDelete) {
      const sampleNames = activeStudents.slice(0, 3).map(s => s.name).join(', ');
      const extra = activeStudents.length > 3 ? ` e mais ${activeStudents.length - 3} aluno(s)` : '';
      reasons.push(
        `A turma possui ${activeStudents.length} aluno(s) ativo(s) inscrito(s): ${sampleNames}${extra}.`
      );
    }

    let message = '';
    if (!canDelete) {
      message = `Não é permitido excluir a turma "${classItem.name}". ` + reasons.join(' ') +
        ` Para garantir a segurança dos registros dos estudantes, é obrigatório transferir ou inativar os alunos matriculados antes da exclusão física, ou alterar o status da turma para "Inativo" ou "Encerrada".`;
    } else {
      message = `A turma "${classItem.name}" não possui alunos ativos inscritos. A exclusão física pode ser realizada.`;
    }

    return {
      canDelete,
      activeStudents,
      activeStudentsCount: activeStudents.length,
      totalStudentsCount: Math.max(totalStudentsCount, activeStudents.length),
      reasons,
      message,
      suggestedAction: canDelete ? 'none' : 'transfer'
    };
  },

  /**
   * Faz verificação em tempo real diretamente contra o Supabase para exclusão de Turma
   */
  async checkClassDeletionSafetyLive(classId: string): Promise<ClassSafetyCheckResult> {
    if (!isSupabaseConfigured) {
      return {
        canDelete: true,
        activeStudents: [],
        activeStudentsCount: 0,
        totalStudentsCount: 0,
        reasons: [],
        message: 'Modo offline ou Supabase não configurado.',
        suggestedAction: 'none'
      };
    }

    try {
      // 1. Obter informações da turma
      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .maybeSingle();

      const cls: Class = classData || {
        id: classId,
        name: 'Turma',
        code: '',
        status: 'Ativo',
        semester: '1º Semestre',
        days_of_week: [],
        user_id: '',
        created_at: ''
      };

      // 2. Obter alunos com vínculo direto e ativos
      const { data: directStudents } = await supabase
        .from('students')
        .select('id, name, registration_number, status, class_id')
        .eq('class_id', classId)
        .eq('status', 'Ativo');

      // 3. Obter matrículas ativas na turma
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, student_id, status')
        .eq('class_id', classId)
        .eq('status', 'Ativo');

      const enrolledStudentIds = (enrollments || []).map((e: any) => e.student_id).filter(Boolean);

      let enrolledActiveStudents: any[] = [];
      if (enrolledStudentIds.length > 0) {
        const { data: enrStudents } = await supabase
          .from('students')
          .select('id, name, registration_number, status')
          .in('id', enrolledStudentIds)
          .eq('status', 'Ativo');
        enrolledActiveStudents = enrStudents || [];
      }

      const mapActive = new Map<string, ActiveStudentDetail>();

      (directStudents || []).forEach((s: any) => {
        mapActive.set(s.id, {
          id: s.id,
          name: s.name,
          registration_number: s.registration_number,
          linkType: 'primary',
          status: s.status || 'Ativo'
        });
      });

      enrolledActiveStudents.forEach((s: any) => {
        if (!mapActive.has(s.id)) {
          mapActive.set(s.id, {
            id: s.id,
            name: s.name,
            registration_number: s.registration_number,
            linkType: 'enrollment',
            status: s.status || 'Ativo'
          });
        }
      });

      const activeStudents = Array.from(mapActive.values());
      activeStudents.sort((a, b) => a.name.localeCompare(b.name));

      const canDelete = activeStudents.length === 0;
      const reasons: string[] = [];

      if (!canDelete) {
        const sampleNames = activeStudents.slice(0, 3).map(s => s.name).join(', ');
        const extra = activeStudents.length > 3 ? ` e mais ${activeStudents.length - 3} aluno(s)` : '';
        reasons.push(
          `A turma possui ${activeStudents.length} aluno(s) ativo(s) matriculado(s): ${sampleNames}${extra}.`
        );
      }

      return {
        canDelete,
        activeStudents,
        activeStudentsCount: activeStudents.length,
        totalStudentsCount: activeStudents.length,
        reasons,
        message: !canDelete
          ? `Não é permitido excluir a turma "${cls.name}". ` + reasons.join(' ') +
            ` Remaneje ou inative os alunos antes da exclusão física.`
          : `Turma "${cls.name}" sem alunos ativos. Exclusão permitida.`,
        suggestedAction: canDelete ? 'none' : 'transfer'
      };
    } catch (err) {
      console.error('[academicSecurityService] Erro ao verificar segurança da turma:', err);
      return {
        canDelete: false,
        activeStudents: [],
        activeStudentsCount: 0,
        totalStudentsCount: 0,
        reasons: ['Não foi possível validar com segurança os alunos ativos devido a uma falha de conexão.'],
        message: 'Erro de comunicação com a base de dados. Exclusão prevenida por segurança.',
        suggestedAction: 'inactivate'
      };
    }
  }
};
