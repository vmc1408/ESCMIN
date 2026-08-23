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
  BookOpen, 
  Clock, 
  Calendar, 
  Layers,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Award,
  Filter,
  Check,
  FileText
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Course, Class, Student } from '../types';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { cn, detectCourseFromClass } from '../lib/utils';

export function Courses() {
  const { isAdmin, isSecretary, isDirector } = useAuth();
  const canEdit = isAdmin || isDirector || isSecretary;

  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Ativo' | 'Inativo'>('Todos');

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
      const [coursesData, classesData, studentsData] = await Promise.all([
        fetchAll('courses'),
        fetchAll('classes'),
        fetchAll('students')
      ]);

      setCourses(coursesData || []);
      setClasses(classesData || []);
      setStudents(studentsData || []);
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
  const courseStats = useMemo(() => {
    const map = new Map<string, { classesCount: number; activeStudentsCount: number; totalStudentsCount: number }>();

    courses.forEach(c => {
      map.set(c.id, { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 });
    });

    // Match classes with courses
    const classToCourseMap = new Map<string, string>(); // classId -> courseId

    classes.forEach(cls => {
      const detectedName = detectCourseFromClass(cls, courses);
      const matchedCourse = courses.find(c => 
        c.name.toLowerCase() === detectedName.toLowerCase() ||
        (c.code && c.code.toLowerCase() === (cls.code || '').toLowerCase())
      );

      if (matchedCourse) {
        classToCourseMap.set(cls.id, matchedCourse.id);
        const stats = map.get(matchedCourse.id);
        if (stats) {
          stats.classesCount += 1;
        }
      }
    });

    // Match students with courses (either via direct student.course or through enrolled class)
    students.forEach(st => {
      let matchedCourseId: string | undefined;

      // 1. Direct course matching
      if (st.course) {
        const directMatch = courses.find(c => c.name.toLowerCase() === st.course?.toLowerCase());
        if (directMatch) matchedCourseId = directMatch.id;
      }

      // 2. Class-based matching fallback
      if (!matchedCourseId && st.class_id && classToCourseMap.has(st.class_id)) {
        matchedCourseId = classToCourseMap.get(st.class_id);
      }

      if (matchedCourseId && map.has(matchedCourseId)) {
        const stats = map.get(matchedCourseId)!;
        stats.totalStudentsCount += 1;
        if (st.status === 'Ativo') {
          stats.activeStudentsCount += 1;
        }
      }
    });

    return map;
  }, [courses, classes, students]);

  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const matchesSearch = 
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'Todos' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [courses, searchTerm, statusFilter]);

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
          <p className="text-[11px] text-slate-500 mt-1">
            {courses.filter(c => c.status === 'Ativo').length} ativos no sistema
          </p>
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
          <p className="text-[11px] text-slate-500 mt-1">
            Matriculados atualmente
          </p>
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

      {/* Search & Filter Toolbar */}
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

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase">Status:</span>
          {(['Todos', 'Ativo', 'Inativo'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors border",
                statusFilter === st 
                  ? "bg-slate-900 text-white border-slate-900" 
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Courses List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCourses.map(course => {
          const stats = courseStats.get(course.id) || { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 };
          const isDeleting = deleteConfirmId === course.id;

          return (
            <div 
              key={course.id}
              id={`course-card-${course.id}`}
              className={cn(
                "bg-white border transition-all shadow-sm flex flex-col justify-between relative group",
                course.status === 'Ativo' ? "border-slate-200 hover:border-slate-400" : "border-slate-200 bg-slate-50/50 opacity-80"
              )}
            >
              <div className="p-5 space-y-4">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-xs text-slate-700 uppercase shrink-0">
                      {course.code || 'CRS'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">
                        {course.name}
                      </h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Código: {course.code}
                      </span>
                    </div>
                  </div>

                  <span className={cn(
                    "text-[9px] font-black uppercase px-2 py-0.5 border tracking-wider",
                    course.status === 'Ativo' 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  )}>
                    {course.status}
                  </span>
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
                <div className="border-t border-slate-100 bg-slate-50/70 p-3 flex items-center justify-end gap-2">
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
                        id={`edit-course-btn-${course.id}`}
                        onClick={() => handleOpenEdit(course)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors shadow-2xs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                      <button
                        id={`delete-course-btn-${course.id}`}
                        onClick={() => setDeleteConfirmId(course.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                        title="Excluir curso"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredCourses.length === 0 && !loading && (
          <div className="col-span-full py-16 text-center bg-white border border-slate-200 p-8 shadow-sm">
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
        )}
      </div>

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
