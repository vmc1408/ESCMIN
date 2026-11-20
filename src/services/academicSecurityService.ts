import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Course, Class, Student, Enrollment } from '../types';
import { detectCourseFromClass } from '../lib/utils';
import { extractExplicitClassSubjectIds, normalizeClass, normalizeSubject } from '../lib/classSubjectUtils';

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
  historicalRecordsCount?: number;
  reasons: string[];
  message: string;
  suggestedAction: 'inactivate' | 'transfer' | 'none';
}

export interface HistoryBreakdownItem {
  label: string;
  count: number;
}

export interface EntityHistorySafetyCheckResult {
  canDelete: boolean;
  entityType: 'student' | 'subject' | 'teacher';
  entityId: string;
  entityName: string;
  totalLinkedRecords: number;
  breakdown: HistoryBreakdownItem[];
  reasons: string[];
  message: string;
  suggestedAction: 'inactivate' | 'none';
}

async function countTableRows(table: string, column: string, value: string): Promise<number> {
  if (!isSupabaseConfigured || !value) return 0;
  try {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, value);
    if (error) {
      console.warn(`[academicSecurityService] Aviso ao contar registros em "${table}.${column}":`, error.message);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.warn(`[academicSecurityService] Exceção ao contar registros em "${table}.${column}":`, err);
    return 0;
  }
}

async function countTableRowsIn(table: string, column: string, values: string[]): Promise<number> {
  if (!isSupabaseConfigured || !values || values.length === 0) return 0;
  try {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in(column, values);
    if (error) {
      console.warn(`[academicSecurityService] Aviso ao contar lote em "${table}.${column}":`, error.message);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.warn(`[academicSecurityService] Exceção ao contar lote em "${table}.${column}":`, err);
    return 0;
  }
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
    const distinctTotalStudentIdsInCourse = new Set<string>();

    linkedClasses.forEach(cls => {
      // Alunos vinculados diretamente como turma principal (ativos e históricos)
      const directAll = students.filter(s => s.class_id === cls.id);
      directAll.forEach(s => distinctTotalStudentIdsInCourse.add(s.id));

      const directActive = directAll.filter(s => (s.status || 'Ativo') === 'Ativo');
      directActive.forEach(s => distinctActiveStudentIdsInCourse.add(s.id));

      // Alunos matriculados via tabela enrollments
      enrollments.forEach(enr => {
        if (enr.class_id === cls.id && enr.student_id) {
          distinctTotalStudentIdsInCourse.add(enr.student_id);
        }
      });

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
      if (s.course && (
        normalizeStr(s.course) === normalizeStr(course.name) ||
        (course.code && s.course.toUpperCase() === course.code.toUpperCase())
      )) {
        distinctTotalStudentIdsInCourse.add(s.id);
        if ((s.status || 'Ativo') === 'Ativo') {
          distinctActiveStudentIdsInCourse.add(s.id);
        }
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

    if (canDelete && (inactiveClassesCount > 0 || distinctTotalStudentIdsInCourse.size > 0)) {
      canDelete = false;
      reasons.push(
        `O curso possui histórico acadêmico preservado (${inactiveClassesCount} turma(s) encerrada(s)/inativa(s) e ${distinctTotalStudentIdsInCourse.size} vínculo(s) de aluno(s)).`
      );
    }

    let message = '';
    if (!canDelete) {
      message = `Não é possível excluir o curso "${course.name}". ` + reasons.join(' ') +
        ` Para preservar o histórico acadêmico, utilize a opção "Inativar Curso".`;
    } else {
      message = `O curso "${course.name}" não possui turmas nem histórico de alunos vinculados. A exclusão definitiva pode ser executada com segurança.`;
    }

    return {
      canDelete,
      activeClasses,
      inactiveClassesCount,
      totalClassesCount: linkedClasses.length,
      activeStudentsCount: distinctActiveStudentIdsInCourse.size,
      totalStudentsCount: distinctTotalStudentIdsInCourse.size,
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
      const [{ data: courseData }, { data: classesData }, { data: studentsData }, { data: enrollmentsData }] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
        supabase.from('classes').select('id, name, code, status, course, year, semester, observations'),
        supabase.from('students').select('id, name, status, class_id, course'),
        supabase.from('enrollments').select('id, student_id, class_id, status')
      ]);

      const course: Course = courseData || {
        id: courseId,
        name: 'Curso',
        code: '',
        status: 'Ativo'
      };

      const allCourses: Course[] = courseData ? [courseData] : [];

      return this.evaluateCourseDeletionSafety(course, {
        courses: allCourses,
        classes: (classesData || []) as Class[],
        students: (studentsData || []) as Student[],
        enrollments: (enrollmentsData || []) as Enrollment[]
      });
    } catch (err) {
      console.error('[academicSecurityService] Erro ao verificar segurança do curso:', err);
      return {
        canDelete: false,
        activeClasses: [],
        inactiveClassesCount: 0,
        totalClassesCount: 0,
        activeStudentsCount: 0,
        totalStudentsCount: 0,
        reasons: ['Não foi possível validar com segurança as turmas e vínculos históricos devido a um erro de conexão.'],
        message: 'Erro ao validar histórico do curso. Tente novamente em instantes.',
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

    // Alunos vinculados via matrícula ativa ou histórica na turma
    const enrolledActiveStudentIds = new Set<string>();
    const allClassEnrolledStudentIds = new Set<string>();
    enrollments.forEach(enr => {
      if (enr.class_id === classId && enr.student_id) {
        allClassEnrolledStudentIds.add(enr.student_id);
        if ((enr.status || 'Ativo') === 'Ativo') {
          enrolledActiveStudentIds.add(enr.student_id);
        }
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
      s => s.class_id === classId || allClassEnrolledStudentIds.has(s.id)
    ).length;

    const reasons: string[] = [];
    let canDelete = activeStudents.length === 0;

    if (!canDelete) {
      const sampleNames = activeStudents.slice(0, 3).map(s => s.name).join(', ');
      const extra = activeStudents.length > 3 ? ` e mais ${activeStudents.length - 3} aluno(s)` : '';
      reasons.push(
        `A turma possui ${activeStudents.length} aluno(s) ativo(s) inscrito(s): ${sampleNames}${extra}.`
      );
    } else if (totalStudentsCount > 0) {
      canDelete = false;
      reasons.push(
        `A turma possui ${totalStudentsCount} registro(s) de aluno(s) inativo(s)/egresso(s) vinculados ao histórico.`
      );
    }

    let message = '';
    if (!canDelete) {
      message = `Não é permitido excluir a turma "${classItem.name}". ` + reasons.join(' ') +
        ` Para preservar o histórico de chamadas, notas e matrículas, utilize a opção "Inativar Turma" (ou altere o status para Encerrada).`;
    } else {
      message = `A turma "${classItem.name}" não possui alunos ativos inscritos. Será realizada validação final de diários/notas no servidor antes da exclusão.`;
    }

    return {
      canDelete,
      activeStudents,
      activeStudentsCount: activeStudents.length,
      totalStudentsCount: Math.max(totalStudentsCount, activeStudents.length),
      reasons,
      message,
      suggestedAction: activeStudents.length > 0 ? 'transfer' : (canDelete ? 'none' : 'inactivate')
    };
  },

  /**
   * Faz verificação em tempo real diretamente contra o Supabase para exclusão de Turma
   * (verifica alunos ativos E histórico acadêmico em attendances, grades, assessments e enrollments)
   */
  async checkClassDeletionSafetyLive(classId: string): Promise<ClassSafetyCheckResult> {
    if (!isSupabaseConfigured) {
      return {
        canDelete: true,
        activeStudents: [],
        activeStudentsCount: 0,
        totalStudentsCount: 0,
        historicalRecordsCount: 0,
        reasons: [],
        message: 'Modo offline ou Supabase não configurado.',
        suggestedAction: 'none'
      };
    }

    try {
      const [
        { data: classData },
        { data: directStudents },
        { data: allEnrollments },
        attendancesCount,
        gradesCount,
        assessmentsCount
      ] = await Promise.all([
        supabase.from('classes').select('*').eq('id', classId).maybeSingle(),
        supabase.from('students').select('id, name, registration_number, status, class_id').eq('class_id', classId),
        supabase.from('enrollments').select('id, student_id, status').eq('class_id', classId),
        countTableRows('attendances', 'class_id', classId),
        countTableRows('grades', 'class_id', classId),
        countTableRows('assessments', 'class_id', classId)
      ]);

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

      const activeEnrollments = (allEnrollments || []).filter((e: any) => (e.status || 'Ativo') === 'Ativo');
      const enrolledStudentIds = activeEnrollments.map((e: any) => e.student_id).filter(Boolean);

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

      (directStudents || [])
        .filter((s: any) => (s.status || 'Ativo') === 'Ativo')
        .forEach((s: any) => {
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

      const totalStudentsLinked = new Set([
        ...(directStudents || []).map((s: any) => s.id),
        ...(allEnrollments || []).map((e: any) => e.student_id).filter(Boolean)
      ]).size;

      const historicalRecordsCount = attendancesCount + gradesCount + assessmentsCount + (allEnrollments || []).length;
      const reasons: string[] = [];
      let canDelete = activeStudents.length === 0 && historicalRecordsCount === 0 && totalStudentsLinked === 0;

      if (activeStudents.length > 0) {
        const sampleNames = activeStudents.slice(0, 3).map(s => s.name).join(', ');
        const extra = activeStudents.length > 3 ? ` e mais ${activeStudents.length - 3} aluno(s)` : '';
        reasons.push(
          `A turma possui ${activeStudents.length} aluno(s) ativo(s) matriculado(s): ${sampleNames}${extra}.`
        );
      }

      const historyParts: string[] = [];
      if (attendancesCount > 0) historyParts.push(`${attendancesCount} chamada(s)/frequência(s)`);
      if (gradesCount > 0) historyParts.push(`${gradesCount} lançamento(s) de nota(s)`);
      if (assessmentsCount > 0) historyParts.push(`${assessmentsCount} avaliação(ões)`);
      if (totalStudentsLinked > activeStudents.length) {
        historyParts.push(`${totalStudentsLinked - activeStudents.length} vínculo(s) histórico(s) de ex-aluno(s)/inativo(s)`);
      } else if ((allEnrollments || []).length > 0 && activeStudents.length === 0) {
        historyParts.push(`${(allEnrollments || []).length} matrícula(s) registrada(s)`);
      }

      if (historyParts.length > 0) {
        reasons.push(`Há histórico acadêmico preservado nesta turma: ${historyParts.join(', ')}.`);
      }

      const suggestedAction: 'inactivate' | 'transfer' | 'none' =
        canDelete ? 'none' : (activeStudents.length > 0 ? 'transfer' : 'inactivate');

      return {
        canDelete,
        activeStudents,
        activeStudentsCount: activeStudents.length,
        totalStudentsCount: Math.max(totalStudentsLinked, activeStudents.length),
        historicalRecordsCount,
        reasons,
        message: !canDelete
          ? `Não é permitido excluir definitivamente a turma "${cls.name}". ` + reasons.join(' ') +
            ` Para evitar a perda de registros históricos nos diários, chamadas e boletins, altere o status da turma para "Inativo".`
          : `Turma "${cls.name}" sem alunos ou registros históricos vinculados. Exclusão permitida.`,
        suggestedAction
      };
    } catch (err) {
      console.error('[academicSecurityService] Erro ao verificar segurança da turma:', err);
      return {
        canDelete: false,
        activeStudents: [],
        activeStudentsCount: 0,
        totalStudentsCount: 0,
        historicalRecordsCount: 0,
        reasons: ['Não foi possível validar com segurança os dados históricos devido a uma falha de conexão.'],
        message: 'Erro de comunicação com a base de dados. Exclusão prevenida por segurança.',
        suggestedAction: 'inactivate'
      };
    }
  },

  /**
   * Verifica em tempo real se um Aluno possui histórico acadêmico ou financeiro antes da exclusão física
   */
  async checkStudentDeletionSafetyLive(studentId: string, knownName?: string): Promise<EntityHistorySafetyCheckResult> {
    if (!isSupabaseConfigured || !studentId) {
      return {
        canDelete: true,
        entityType: 'student',
        entityId: studentId,
        entityName: knownName || 'Aluno',
        totalLinkedRecords: 0,
        breakdown: [],
        reasons: [],
        message: 'Modo offline ou identificador inválido.',
        suggestedAction: 'none'
      };
    }

    try {
      const [
        { data: studentData },
        attendancesCount,
        gradesCount,
        contributionsCount,
        receiptsCount,
        certificatesCount
      ] = await Promise.all([
        supabase.from('students').select('id, name').eq('id', studentId).maybeSingle(),
        countTableRows('attendances', 'student_id', studentId),
        countTableRows('grades', 'student_id', studentId),
        countTableRows('contributions', 'student_id', studentId),
        countTableRows('receipts', 'student_id', studentId),
        countTableRows('certificates', 'student_id', studentId)
      ]);

      const entityName = studentData?.name || knownName || 'Aluno';
      const breakdown: HistoryBreakdownItem[] = [
        { label: 'Registros de Frequência / Chamadas', count: attendancesCount },
        { label: 'Notas / Avaliações Lançadas', count: gradesCount },
        { label: 'Contribuições / Mensalidades', count: contributionsCount },
        { label: 'Recibos Financeiros', count: receiptsCount },
        { label: 'Certificados Emitidos', count: certificatesCount }
      ].filter(item => item.count > 0);

      const totalLinkedRecords = breakdown.reduce((sum, item) => sum + item.count, 0);
      const canDelete = totalLinkedRecords === 0;
      const reasons = breakdown.map(b => `${b.count} ${b.label.toLowerCase()}`);

      const message = !canDelete
        ? `Exclusão bloqueada para preservar o histórico de "${entityName}": existem ${reasons.join(', ')}. Utilize a opção "Inativar Aluno" para encerrar a matrícula sem apagar chamadas, notas ou histórico financeiro dos relatórios.`
        : `O aluno "${entityName}" não possui registros de chamada, notas, financeiro ou certificados lançados. Exclusão permitida.`;

      return {
        canDelete,
        entityType: 'student',
        entityId: studentId,
        entityName,
        totalLinkedRecords,
        breakdown,
        reasons,
        message,
        suggestedAction: canDelete ? 'none' : 'inactivate'
      };
    } catch (err) {
      console.error('[academicSecurityService] Erro ao verificar segurança do aluno:', err);
      return {
        canDelete: false,
        entityType: 'student',
        entityId: studentId,
        entityName: knownName || 'Aluno',
        totalLinkedRecords: 1,
        breakdown: [],
        reasons: ['Não foi possível validar com segurança o histórico do aluno por falha de conexão.'],
        message: 'Erro de comunicação ao validar o histórico do aluno. Exclusão bloqueada por segurança.',
        suggestedAction: 'inactivate'
      };
    }
  },

  /**
   * Verifica em tempo real se uma Disciplina possui chamadas, notas, avaliações ou vínculo com turmas
   */
  async checkSubjectDeletionSafetyLive(subjectId: string, knownName?: string): Promise<EntityHistorySafetyCheckResult> {
    if (!isSupabaseConfigured || !subjectId) {
      return {
        canDelete: true,
        entityType: 'subject',
        entityId: subjectId,
        entityName: knownName || 'Disciplina',
        totalLinkedRecords: 0,
        breakdown: [],
        reasons: [],
        message: 'Modo offline ou identificador inválido.',
        suggestedAction: 'none'
      };
    }

    try {
      const [
        { data: subjectData },
        attendancesCount,
        gradesCount,
        assessmentsCount,
        calendarCount,
        { data: classesData }
      ] = await Promise.all([
        supabase.from('subjects').select('id, name').eq('id', subjectId).maybeSingle(),
        countTableRows('attendances', 'subject_id', subjectId),
        countTableRows('grades', 'subject_id', subjectId),
        countTableRows('assessments', 'subject_id', subjectId),
        countTableRows('calendar_events', 'subject_id', subjectId),
        supabase.from('classes').select('id, name, subject_id, subject_id_sem1, subject_id_sem2, subject_ids, observations')
      ]);

      const linkedClassesCount = (classesData || []).filter((cls: any) => {
        const normalized = normalizeClass(cls);
        return extractExplicitClassSubjectIds(normalized).has(subjectId);
      }).length;

      const entityName = subjectData?.name || knownName || 'Disciplina';
      const breakdown: HistoryBreakdownItem[] = [
        { label: 'Registros de Chamada / Frequência', count: attendancesCount },
        { label: 'Notas Lançadas', count: gradesCount },
        { label: 'Avaliações / Trabalhos', count: assessmentsCount },
        { label: 'Turmas com Matriz Vinculada', count: linkedClassesCount },
        { label: 'Eventos / Fechamentos no Calendário', count: calendarCount }
      ].filter(item => item.count > 0);

      const totalLinkedRecords = breakdown.reduce((sum, item) => sum + item.count, 0);
      const canDelete = totalLinkedRecords === 0;
      const reasons = breakdown.map(b => `${b.count} ${b.label.toLowerCase()}`);

      const message = !canDelete
        ? `Exclusão bloqueada para preservar o histórico da disciplina "${entityName}": existem ${reasons.join(', ')}. Utilize a opção "Inativar Disciplina" para mantê-la íntegra em boletins e diários passados.`
        : `A disciplina "${entityName}" não possui aulas, notas, avaliações ou turmas vinculadas. Exclusão permitida.`;

      return {
        canDelete,
        entityType: 'subject',
        entityId: subjectId,
        entityName,
        totalLinkedRecords,
        breakdown,
        reasons,
        message,
        suggestedAction: canDelete ? 'none' : 'inactivate'
      };
    } catch (err) {
      console.error('[academicSecurityService] Erro ao verificar segurança da disciplina:', err);
      return {
        canDelete: false,
        entityType: 'subject',
        entityId: subjectId,
        entityName: knownName || 'Disciplina',
        totalLinkedRecords: 1,
        breakdown: [],
        reasons: ['Não foi possível validar o histórico da disciplina por falha de conexão.'],
        message: 'Erro de comunicação ao validar histórico da disciplina. Exclusão bloqueada por segurança.',
        suggestedAction: 'inactivate'
      };
    }
  },

  /**
   * Verifica em tempo real se um Professor possui vínculo com disciplinas, turmas ou calendário antes da exclusão física
   */
  async checkTeacherDeletionSafetyLive(teacherId: string, knownName?: string): Promise<EntityHistorySafetyCheckResult> {
    if (!isSupabaseConfigured || !teacherId) {
      return {
        canDelete: true,
        entityType: 'teacher',
        entityId: teacherId,
        entityName: knownName || 'Professor',
        totalLinkedRecords: 0,
        breakdown: [],
        reasons: [],
        message: 'Modo offline ou identificador inválido.',
        suggestedAction: 'none'
      };
    }

    try {
      const [
        { data: teacherData },
        { data: subjectsData },
        { data: classesData },
        calendarCount
      ] = await Promise.all([
        supabase.from('teachers').select('id, name, subject_ids').eq('id', teacherId).maybeSingle(),
        supabase.from('subjects').select('id, name, teacher_id, program_content'),
        supabase.from('classes').select('id, name, teacher_id'),
        countTableRows('calendar_events', 'user_id', teacherId)
      ]);

      const teacherSubjectIds = new Set<string>();
      if (teacherData?.subject_ids) {
        let rawIds: string[] = [];
        if (Array.isArray(teacherData.subject_ids)) {
          rawIds = teacherData.subject_ids;
        } else if (typeof teacherData.subject_ids === 'string') {
          const raw = teacherData.subject_ids.trim();
          if (raw.startsWith('{')) rawIds = raw.replace(/[{}]/g, '').split(',').filter(Boolean);
          else {
            try {
              const parsed = JSON.parse(raw);
              rawIds = Array.isArray(parsed) ? parsed : [];
            } catch {
              rawIds = raw ? [raw] : [];
            }
          }
        }
        rawIds.forEach(sid => sid && teacherSubjectIds.add(sid));
      }

      const directlyTaughtSubjectIds = (subjectsData || [])
        .map((s: any) => normalizeSubject(s))
        .filter((s: any) => s.teacher_id === teacherId)
        .map((s: any) => s.id);

      directlyTaughtSubjectIds.forEach((sid: string) => teacherSubjectIds.add(sid));

      const linkedSubjectList = Array.from(teacherSubjectIds);
      const [subjectAttendancesCount, subjectGradesCount] = linkedSubjectList.length > 0
        ? await Promise.all([
            countTableRowsIn('attendances', 'subject_id', linkedSubjectList),
            countTableRowsIn('grades', 'subject_id', linkedSubjectList)
          ])
        : [0, 0];

      const linkedClassesCount = (classesData || []).filter((c: any) => c.teacher_id === teacherId).length;
      const entityName = teacherData?.name || knownName || 'Professor';

      const breakdown: HistoryBreakdownItem[] = [
        { label: 'Disciplinas Atribuídas', count: directlyTaughtSubjectIds.length || linkedSubjectList.length },
        { label: 'Turmas Vinculadas', count: linkedClassesCount },
        { label: 'Chamadas nas Disciplinas Lecionadas', count: subjectAttendancesCount },
        { label: 'Notas nas Disciplinas Lecionadas', count: subjectGradesCount },
        { label: 'Eventos no Calendário', count: calendarCount }
      ].filter(item => item.count > 0);

      const totalLinkedRecords = breakdown.reduce((sum, item) => sum + item.count, 0);
      const canDelete = totalLinkedRecords === 0;
      const reasons = breakdown.map(b => `${b.count} ${b.label.toLowerCase()}`);

      const message = !canDelete
        ? `Exclusão bloqueada para preservar o histórico docente de "${entityName}": existem ${reasons.join(', ')}. Utilize a opção "Inativar Professor" para manter o nome do docente preservado nas pautas e relatórios antigos.`
        : `O professor "${entityName}" não possui disciplinas, turmas ou registros históricos vinculados. Exclusão permitida.`;

      return {
        canDelete,
        entityType: 'teacher',
        entityId: teacherId,
        entityName,
        totalLinkedRecords,
        breakdown,
        reasons,
        message,
        suggestedAction: canDelete ? 'none' : 'inactivate'
      };
    } catch (err) {
      console.error('[academicSecurityService] Erro ao verificar segurança do professor:', err);
      return {
        canDelete: false,
        entityType: 'teacher',
        entityId: teacherId,
        entityName: knownName || 'Professor',
        totalLinkedRecords: 1,
        breakdown: [],
        reasons: ['Não foi possível validar o histórico do professor por falha de conexão.'],
        message: 'Erro de comunicação ao validar histórico do professor. Exclusão bloqueada por segurança.',
        suggestedAction: 'inactivate'
      };
    }
  }
};
