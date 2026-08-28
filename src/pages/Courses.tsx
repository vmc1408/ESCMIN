import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  GraduationCap, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Clock, 
  Layers,
  RotateCcw,
  LayoutGrid,
  List as ListIcon,
  CheckCircle,
  Archive,
  PowerOff,
  Power
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Course, Class, Student, Enrollment } from '../types';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { cn, detectCourseFromClass } from '../lib/utils';

export function Courses() {
  const { isAdmin, isSecretary, isDirector } = useAuth();
  const canEdit = isAdmin || isDirector || isSecretary;

  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Ativo' | 'Inativo'>('Todos');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('courses_view_mode');
      if (saved === 'grid' || saved === 'table') return saved;
    } catch (e) {}
    return 'table'; // Padrão: listagem
  });

  const handleSetViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    try {
      localStorage.setItem('courses_view_mode', mode);
    } catch (e) {}
  };

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState<Partial<Course>>({
    code: '',
    name: '',
    description: '',
    duration_years: 1,
    duration_semesters: 2,
    status: 'Ativo',
    workload_hours: 120
  });

  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesData, classesData, studentsData, enrollmentsData] = await Promise.all([
        fetchAll('courses'),
        fetchAll('classes'),
        fetchAll('students'),
        fetchAll('enrollments').catch(() => [])
      ]);

      setCourses(coursesData || []);
      setClasses(classesData || []);
      setStudents(studentsData || []);
      setEnrollments(enrollmentsData || []);
    } catch (err: any) {
      console.error('Erro ao carregar cursos:', err);
      showNotification('error', 'Erro ao carregar catálogo de cursos.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Statistics calculation
  const { courseStats, totalActiveInCourses, unassignedActiveStudents } = useMemo(() => {
    const map = new Map<string, { classesCount: number; activeStudentsCount: number; totalStudentsCount: number }>();

    courses.forEach(c => {
      map.set(c.id, { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 });
    });

    const validClassIds = new Set(classes.map(c => c.id));
    const classesMap = new Map<string, Class>(classes.map(c => [c.id, c]));

    // Match classes with courses
    const classToCourseMap = new Map<string, string>(); // classId -> courseId

    classes.forEach(cls => {
      const detectedName = detectCourseFromClass(cls, courses);
      const matchedCourse = courses.find(c => 
        c.name.trim().toLowerCase() === detectedName.trim().toLowerCase() ||
        (c.code && c.code.trim().toLowerCase() === (cls.code || '').trim().toLowerCase()) ||
        c.name.toLowerCase().includes(detectedName.toLowerCase()) ||
        detectedName.toLowerCase().includes(c.name.toLowerCase())
      );

      if (matchedCourse) {
        classToCourseMap.set(cls.id, matchedCourse.id);
        const stats = map.get(matchedCourse.id);
        if (stats) {
          stats.classesCount += 1;
        }
      }
    });

    let assignedActiveCount = 0;
    let unassignedActiveCount = 0;

    // Match students with courses (either via direct student.course, direct class, or enrolled classes)
    students.forEach(st => {
      let matchedCourseIds = new Set<string>();

      // 1. Direct course matching
      if (st.course) {
        const cleanCourse = st.course.trim().toLowerCase();
        const directMatch = courses.find(c => 
          c.name.trim().toLowerCase() === cleanCourse ||
          (c.code && c.code.trim().toLowerCase() === cleanCourse) ||
          c.name.toLowerCase().includes(cleanCourse) ||
          cleanCourse.includes(c.name.toLowerCase())
        );
        if (directMatch) matchedCourseIds.add(directMatch.id);
      }

      // 2. Direct class matching
      if (st.class_id && validClassIds.has(st.class_id)) {
        if (classToCourseMap.has(st.class_id)) {
          matchedCourseIds.add(classToCourseMap.get(st.class_id)!);
        } else {
          const cls = classesMap.get(st.class_id);
          if (cls) {
            const detected = detectCourseFromClass(cls, courses);
            const match = courses.find(c => c.name.toLowerCase() === detected.toLowerCase());
            if (match) matchedCourseIds.add(match.id);
          }
        }
      }

      // 3. Matched enrollments (parallel / secondary courses)
      const studentEnrs = enrollments.filter(e => e.student_id === st.id && (e.status || 'Ativo') === 'Ativo');
      studentEnrs.forEach(enr => {
        if (enr.class_id && validClassIds.has(enr.class_id)) {
          const cid = classToCourseMap.get(enr.class_id);
          if (cid) matchedCourseIds.add(cid);
        }
      });

      if (matchedCourseIds.size > 0) {
        matchedCourseIds.forEach(cId => {
          if (map.has(cId)) {
            const stats = map.get(cId)!;
            stats.totalStudentsCount += 1;
            if (st.status === 'Ativo') {
              stats.activeStudentsCount += 1;
            }
          }
        });
        if (st.status === 'Ativo') {
          assignedActiveCount += 1;
        }
      } else {
        if (st.status === 'Ativo') {
          unassignedActiveCount += 1;
        }
      }
    });

    return { 
      courseStats: map, 
      totalActiveInCourses: assignedActiveCount, 
      unassignedActiveStudents: unassignedActiveCount 
    };
  }, [courses, classes, students, enrollments]);

  // Filter and logically group active vs inactive
  const { activeCourses, inactiveCourses } = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    
    const filtered = courses.filter(c => {
      const matchesSearch = 
        (c.name || '').toLowerCase().includes(term) ||
        (c.code || '').toLowerCase().includes(term) ||
        (c.description || '').toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'Todos' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return {
      activeCourses: filtered.filter(c => c.status === 'Ativo'),
      inactiveCourses: filtered.filter(c => c.status === 'Inativo')
    };
  }, [courses, searchTerm, statusFilter]);

  const totalFiltered = activeCourses.length + inactiveCourses.length;

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      duration_years: 1,
      duration_semesters: 2,
      status: 'Ativo',
      workload_hours: 120
    });
    setShowModal(true);
  };

  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      code: course.code || '',
      name: course.name || '',
      description: course.description || '',
      duration_years: course.duration_years || 1,
      duration_semesters: course.duration_semesters || 2,
      status: course.status || 'Ativo',
      workload_hours: course.workload_hours || 0
    });
    setShowModal(true);
  };

  const handleToggleStatus = async (course: Course) => {
    const newStatus = course.status === 'Ativo' ? 'Inativo' : 'Ativo';
    try {
      await saveData('courses', course.id, {
        ...course,
        status: newStatus,
        updated_at: new Date().toISOString()
      });
      showNotification('success', `Curso alterado para "${newStatus}" com sucesso.`);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao alterar status:', err);
      showNotification('error', 'Falha ao alterar status do curso.');
    }
  };

  // Auto-generate code when typing name if creating new
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const updates: Partial<Course> = { name: val };
    
    if (!editingCourse && (!formData.code || formData.code.trim() === '')) {
      const STOP_WORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'para', 'em']);
      const words = val.trim().split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase()));
      if (words.length >= 3) {
        updates.code = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
      } else if (words.length > 0 && words[0].length >= 3) {
        updates.code = words[0].slice(0, 3).toUpperCase();
      }
    }
    
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.code?.trim()) {
      showNotification('error', 'Nome e Código de identificação do curso são obrigatórios.');
      return;
    }

    const cleanCode = formData.code.trim().toUpperCase();
    const cleanName = formData.name.trim();

    // Check code duplication
    const duplicate = courses.find(c => 
      c.code.toUpperCase() === cleanCode && 
      (!editingCourse || c.id !== editingCourse.id)
    );

    if (duplicate) {
      showNotification('error', `O código "${cleanCode}" já está sendo utilizado pelo curso "${duplicate.name}".`);
      return;
    }

    setIsSaving(true);
    try {
      const id = editingCourse?.id || `course-${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
      const payload: Course = {
        id,
        code: cleanCode,
        name: cleanName,
        description: formData.description?.trim() || '',
        duration_years: Number(formData.duration_years) || 1,
        duration_semesters: Number(formData.duration_semesters) || 2,
        status: formData.status || 'Ativo',
        workload_hours: Number(formData.workload_hours) || 0,
        updated_at: new Date().toISOString(),
        created_at: editingCourse?.created_at || new Date().toISOString()
      };

      await saveData('courses', id, payload);
      showNotification('success', editingCourse ? 'Curso atualizado com sucesso!' : 'Novo curso cadastrado com sucesso!');
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar curso:', err);
      showNotification('error', 'Falha ao salvar curso: ' + (err.message || 'Erro desconhecido.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (courseId: string) => {
    const stats = courseStats.get(courseId);
    if (stats && (stats.classesCount > 0 || stats.totalStudentsCount > 0)) {
      showNotification('error', `Não é possível excluir este curso pois existem ${stats.classesCount} turma(s) e ${stats.totalStudentsCount} estudante(s) vinculados a ele.`);
      setDeleteConfirmId(null);
      return;
    }

    try {
      await deleteData('courses', courseId);
      showNotification('success', 'Curso removido do catálogo com sucesso.');
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao excluir curso:', err);
      showNotification('error', 'Falha ao excluir curso: ' + (err.message || 'Erro desconhecido.'));
    }
  };

  const renderCourseCard = (course: Course) => {
    const stats = courseStats.get(course.id) || { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 };
    const isDeleting = deleteConfirmId === course.id;
    const isInactive = course.status === 'Inativo';

    return (
      <div 
        key={course.id}
        id={`course-card-${course.id}`}
        className={cn(
          "bg-white border transition-all shadow-sm flex flex-col justify-between relative group",
          isInactive 
            ? "border-slate-200 bg-slate-50/60 opacity-85 hover:opacity-100" 
            : "border-slate-200 hover:border-slate-400"
        )}
      >
        <div className="p-5 space-y-4">
          {/* Card Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "w-10 h-10 border flex items-center justify-center font-black text-xs uppercase shrink-0",
                isInactive 
                  ? "bg-slate-100 border-slate-200 text-slate-500" 
                  : "bg-slate-900 border-slate-900 text-white"
              )}>
                {course.code || 'CRS'}
              </div>
              <div className="min-w-0">
                <h3 className={cn(
                  "text-sm font-bold leading-tight truncate",
                  isInactive ? "text-slate-700" : "text-slate-900"
                )}>
                  {course.name}
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Código: {course.code}
                </span>
              </div>
            </div>

            <button
              onClick={() => canEdit && handleToggleStatus(course)}
              disabled={!canEdit}
              title={canEdit ? "Clique para alternar o status" : undefined}
              className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 border tracking-wider transition-all shrink-0",
                course.status === 'Ativo' 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              )}
            >
              {course.status}
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-600 line-clamp-2 min-h-[32px] leading-relaxed">
            {course.description || 'Nenhuma descrição complementar informada para este curso.'}
          </p>

          {/* Technical Specs Badge Grid */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
            <div className="bg-slate-50 border border-slate-100 p-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Duração</span>
              <span className="text-xs font-black text-slate-800">
                {course.duration_years || 1} {course.duration_years === 1 ? 'Ano' : 'Anos'}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Semestres</span>
              <span className="text-xs font-black text-slate-800">
                {course.duration_semesters || 2} Sem.
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Carga Horária</span>
              <span className="text-xs font-black text-slate-800">
                {course.workload_hours || 0}h
              </span>
            </div>
          </div>

          {/* Related Data Counter */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <strong>{stats.classesCount}</strong> turma(s)
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <strong>{stats.activeStudentsCount}</strong> aluno(s) ativo(s)
            </span>
          </div>
        </div>

        {/* Card Footer Actions */}
        {canEdit && (
          <div className="border-t border-slate-100 bg-slate-50/70 p-3 flex items-center justify-between gap-2">
            {isDeleting ? (
              <div className="flex items-center gap-2 w-full justify-between">
                <span className="text-[11px] font-bold text-rose-600">Confirmar exclusão?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 border border-slate-300 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(course.id)}
                    className="px-2.5 py-1 text-xs bg-rose-600 text-white hover:bg-rose-700 font-bold"
                  >
                    Sim, Excluir
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleToggleStatus(course)}
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-semibold transition-colors px-2 py-1 border",
                    isInactive 
                      ? "text-emerald-700 hover:bg-emerald-50 border-emerald-200 bg-white" 
                      : "text-slate-600 hover:bg-slate-100 border-slate-200 bg-white"
                  )}
                  title={isInactive ? "Reativar curso" : "Inativar curso"}
                >
                  {isInactive ? <Power className="w-3 h-3 text-emerald-600" /> : <PowerOff className="w-3 h-3 text-slate-400" />}
                  <span>{isInactive ? 'Reativar' : 'Inativar'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    id={`edit-course-btn-${course.id}`}
                    onClick={() => handleOpenEdit(course)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors shadow-2xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    id={`delete-course-btn-${course.id}`}
                    onClick={() => setDeleteConfirmId(course.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                    title="Excluir curso"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCourseTable = (list: Course[], title: string, badgeColor: string) => {
    return (
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={cn("w-2.5 h-2.5 rounded-full", badgeColor)} />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {title} ({list.length})
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nome do Curso</th>
                <th className="py-3 px-4">Duração</th>
                <th className="py-3 px-4">Carga Horária</th>
                <th className="py-3 px-4 text-center">Turmas</th>
                <th className="py-3 px-4 text-center">Alunos Ativos</th>
                <th className="py-3 px-4 text-center">Status</th>
                {canEdit && <th className="py-3 px-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {list.map(course => {
                const stats = courseStats.get(course.id) || { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 };
                const isDeleting = deleteConfirmId === course.id;
                const isInactive = course.status === 'Inativo';

                return (
                  <tr 
                    key={course.id} 
                    className={cn(
                      "hover:bg-slate-50/80 transition-colors",
                      isInactive && "bg-slate-50/40 text-slate-600"
                    )}
                  >
                    <td className="py-3.5 px-4 font-black uppercase text-slate-900">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-[11px]">
                        {course.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{course.name}</div>
                      {course.description && (
                        <div className="text-[11px] text-slate-500 line-clamp-1 max-w-md mt-0.5">
                          {course.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {course.duration_years || 1} ano(s) • {course.duration_semesters || 2} sem.
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-semibold">
                      {course.workload_hours || 0} horas
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                        <Layers className="w-3 h-3 text-slate-400" />
                        {stats.classesCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                        <Users className="w-3 h-3 text-slate-400" />
                        {stats.activeStudentsCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => canEdit && handleToggleStatus(course)}
                        disabled={!canEdit}
                        className={cn(
                          "text-[9px] font-black uppercase px-2 py-0.5 border tracking-wider",
                          course.status === 'Ativo' 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        )}
                      >
                        {course.status}
                      </button>
                    </td>
                    {canEdit && (
                      <td className="py-3.5 px-4 text-right">
                        {isDeleting ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] font-bold text-rose-600 mr-1">Confirmar?</span>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200 border border-slate-300"
                            >
                              Não
                            </button>
                            <button
                              onClick={() => handleDelete(course.id)}
                              className="px-2 py-0.5 text-[11px] bg-rose-600 text-white hover:bg-rose-700 font-bold"
                            >
                              Sim
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEdit(course)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 rounded-xs"
                              title="Editar curso"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(course.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xs"
                              title="Excluir curso"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div id="courses-page-container" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {notification && (
        <div 
          id="courses-notification-toast"
          className={cn(
            "fixed top-5 right-5 z-50 p-4 rounded shadow-xl flex items-center gap-3 text-sm font-semibold border transition-all animate-in slide-in-from-top-2",
            notification.type === 'success' 
              ? "bg-emerald-50 text-emerald-900 border-emerald-300" 
              : "bg-rose-50 text-rose-900 border-rose-300"
          )}
        >
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <PageHeader 
        title="Gestão de Cursos"
        description="Catálogo acadêmico oficial de cursos, matrizes de formação e carga horária"
        icon={GraduationCap}
        badge="Catálogo Acadêmico"
      >
        <div className="flex items-center gap-2">
          <button
            id="refresh-courses-btn"
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
            title="Recarregar catálogo"
          >
            <RotateCcw className={cn("w-4 h-4", loading && "animate-spin text-slate-400")} />
          </button>
          {canEdit && (
            <button
              id="create-course-btn"
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Novo Curso
            </button>
          )}
        </div>
      </PageHeader>

      {/* Stats Cards Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cursos Cadastrados</span>
            <GraduationCap className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{courses.length}</p>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
            <span className="text-emerald-700 font-bold">{courses.filter(c => c.status === 'Ativo').length} ativos</span>
            <span>•</span>
            <span className="text-slate-500">{courses.filter(c => c.status === 'Inativo').length} inativos</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de Turmas</span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{classes.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Distribuídas nos cursos
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alunos Ativos</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {students.filter(s => s.status === 'Ativo').length}
          </p>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-1">
            <span className="font-semibold text-emerald-700">{totalActiveInCourses} em cursos</span>
            {unassignedActiveStudents > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-700 font-medium">{unassignedActiveStudents} sem turma</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carga Horária Média</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {courses.length > 0 
              ? Math.round(courses.reduce((acc, curr) => acc + (curr.workload_hours || 0), 0) / courses.length) 
              : 0}h
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Por programa formativo
          </p>
        </div>
      </div>

      {/* Search, Filter & Layout View Toolbar */}
      <div className="bg-white border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="course-search-input"
            type="text"
            placeholder="Buscar por nome, sigla ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-800 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Status Filter Tabs */}
          <div className="flex items-center bg-slate-100 p-0.5 border border-slate-200">
            {(['Todos', 'Ativo', 'Inativo'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  statusFilter === st 
                    ? "bg-white text-slate-900 shadow-2xs font-black" 
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {st}
              </button>
            ))}
          </div>

          {/* View Mode Switcher: Grid vs Table */}
          <div className="flex items-center border border-slate-200 bg-white p-0.5">
            <button
              id="courses-view-table-btn"
              onClick={() => handleSetViewMode('table')}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === 'table' 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
              title="Visualização em Listagem (Padrão)"
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button
              id="courses-view-grid-btn"
              onClick={() => handleSetViewMode('grid')}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === 'grid' 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
              title="Visualização em Blocos"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering based on viewMode and Status Sections */}
      {totalFiltered === 0 && !loading ? (
        <div className="py-16 text-center bg-white border border-slate-200 p-8 shadow-sm">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Nenhum curso encontrado</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm 
              ? 'Nenhum registro corresponde aos termos pesquisados. Tente ajustar os filtros.' 
              : 'O catálogo de cursos está vazio. Clique em "Novo Curso" para iniciar o cadastro.'}
          </p>
          {canEdit && !searchTerm && (
            <button
              onClick={handleOpenCreate}
              className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800 shadow-sm"
            >
              Cadastrar Primeiro Curso
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-8">
          {/* SECTION: CURSOS ATIVOS */}
          {activeCourses.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Cursos Ativos ({activeCourses.length})
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Disponíveis para matrículas e novas turmas
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeCourses.map(renderCourseCard)}
              </div>
            </div>
          )}

          {/* SECTION: CURSOS INATIVOS */}
          {inactiveCourses.length > 0 && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-amber-600" />
                  <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Cursos Inativos / Arquivados ({inactiveCourses.length})
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Ocultos para novas turmas, mantidos para histórico
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {inactiveCourses.map(renderCourseCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Table for Active Courses */}
          {activeCourses.length > 0 && renderCourseTable(activeCourses, 'Cursos Ativos', 'bg-emerald-500')}

          {/* Table for Inactive Courses */}
          {inactiveCourses.length > 0 && renderCourseTable(inactiveCourses, 'Cursos Inativos / Arquivados', 'bg-amber-500')}
        </div>
      )}

      {/* Modal de Criação / Edição */}
      {showModal && (
        <div id="course-form-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl max-w-xl w-full animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white border border-slate-200 flex items-center justify-center text-slate-700">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    {editingCourse ? 'Editar Curso' : 'Novo Curso no Catálogo'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Definição de parâmetros e nomenclatura acadêmica
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Nome do Curso <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="course-name-input"
                    type="text"
                    required
                    placeholder="Ex: Teologia, Doutrina Social da Igreja..."
                    value={formData.name || ''}
                    onChange={handleNameChange}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Sigla / Código <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="course-code-input"
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Ex: TEO, DSI..."
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-black text-slate-900 uppercase focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Descrição / Objetivo Acadêmico
                </label>
                <textarea
                  id="course-description-input"
                  rows={3}
                  placeholder="Informações sobre a finalidade pastoral, público-alvo ou ementa geral..."
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-slate-900 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">
                    Duração (Anos)
                  </label>
                  <input
                    id="course-duration-years-input"
                    type="number"
                    min={1}
                    max={10}
                    value={formData.duration_years || 1}
                    onChange={(e) => setFormData({ ...formData, duration_years: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">
                    Semestres
                  </label>
                  <input
                    id="course-duration-semesters-input"
                    type="number"
                    min={1}
                    max={20}
                    value={formData.duration_semesters || 2}
                    onChange={(e) => setFormData({ ...formData, duration_semesters: parseInt(e.target.value, 10) || 2 })}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">
                    Carga Horária (h)
                  </label>
                  <input
                    id="course-workload-hours-input"
                    type="number"
                    min={0}
                    step={10}
                    value={formData.workload_hours || 0}
                    onChange={(e) => setFormData({ ...formData, workload_hours: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">
                    Status
                  </label>
                  <select
                    id="course-status-select"
                    value={formData.status || 'Ativo'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Salvando...' : (editingCourse ? 'Atualizar Curso' : 'Salvar Curso')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
