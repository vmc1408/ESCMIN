import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  Trash2, 
  Edit3,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll, fetchQuery, saveData as saveRecord, deleteData as deleteRecord } from '../lib/database';
import { Assessment, Class, Subject, Teacher } from '../types';
import { formatSubjectDisplayName, normalizeClass, normalizeSubject, getClassSubjects, doesSubjectYearMatchClass, isSubjectActive, mergeClassStudentsWithHistory } from '../lib/utils';
import { getAvailablePeriodsForSubject } from '../lib/academicUtils';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../contexts/UnitContext';
import { getTeacherScope } from '../lib/teacherScope';
import { TeacherScopeBanner } from '../components/TeacherScopeBanner';

const getEmptyFormData = (): Partial<Assessment> => ({
  title: '',
  date: '',
  weight: undefined,
  class_id: '',
  subject_id: '',
  period: '',
  description: ''
});

const formatDateBR = (dateStr?: string): string => {
  if (!dateStr) return '---';
  const clean = String(dateStr).split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? '---' : parsed.toLocaleDateString('pt-BR');
};

export const Assessments: React.FC = () => {
  const { user, profile, canDelete } = useAuth();
  const { selectedUnitId, units, isItemInActiveUnit, filterByActiveUnit } = useUnits();
  const navigate = useNavigate();

  // State Management
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'consult' | 'register'>('consult');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Dialog / Warning states instead of native browser prompts
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const [formData, setFormData] = useState<Partial<Assessment>>(getEmptyFormData);

  // Academic Year Pagination
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    loadData();
  }, []);

  // Open clean registration tab when navigated from Grades shortcut
  useEffect(() => {
    const redirectStr = sessionStorage.getItem('assessments_redirect');
    if (redirectStr && classes.length > 0 && subjects.length > 0) {
      sessionStorage.removeItem('assessments_redirect');
      setEditingId(null);
      setFormData(getEmptyFormData());
      setActiveTab('register');
    }
  }, [classes, subjects]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assessData, classesData, subjectsData, studentsData, enrollmentsData, gradesData, teachersData] = await Promise.all([
        fetchAll('assessments'),
        fetchAll('classes', '*', 'name'),
        fetchAll('subjects', 'id,name,code,year,semester,status,program_content,teacher_id'),
        fetchAll('students'),
        fetchAll('enrollments').catch(() => []),
        fetchAll('grades'),
        fetchAll('teachers', '*', 'name')
      ]);

      const normalizedSubjects = (subjectsData || []).map((s: any) => normalizeSubject(s));
      const normalizedClasses = (classesData || []).map((cls: any) => normalizeClass(cls, normalizedSubjects));

      const sortedClasses = (normalizedClasses || []).sort((a: any, b: any) => {
        const activeA = !a.status || a.status === 'Ativo';
        const activeB = !b.status || b.status === 'Ativo';
        if (activeA !== activeB) return activeA ? -1 : 1;
        const extract = (s: string) => {
          const match = s.match(/\d+/);
          const yr = match ? parseInt(match[0]) : 0;
          const name = s.replace(/\d{4}/, '').trim().toLowerCase();
          return { yr, name };
        };
        const infoA = extract(a.name || '');
        const infoB = extract(b.name || '');
        if (infoA.name !== infoB.name) return infoA.name.localeCompare(infoB.name);
        return infoB.yr - infoA.yr;
      });

      setAssessments(assessData as Assessment[] || []);
      setClasses(sortedClasses as Class[] || []);
      setSubjects(normalizedSubjects as Subject[] || []);
      setStudents(studentsData || []);
      setEnrollments(enrollmentsData || []);
      setGrades(gradesData || []);
      setTeachers(teachersData || []);
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      const errorMsg = error.message || '';
      if (errorMsg.includes('42P01') || errorMsg.includes('does not exist')) {
        setNotification({
          type: 'error',
          message: 'A tabela de Avaliações ainda não existe no seu banco de dados. Execute o Checkup de Schema em Configurações.'
        });
      } else {
        setNotification({
          type: 'error',
          message: 'Erro ao carregar avaliações do diário de notas.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Opens a completely clean registration form (no preloading)
  const handleOpenNewForm = () => {
    setEditingId(null);
    setFormData(getEmptyFormData());
    setActiveTab('register');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.class_id ||
      !formData.subject_id ||
      !formData.period ||
      !formData.date ||
      !formData.weight ||
      Number(formData.weight) <= 0 ||
      !formData.title?.trim()
    ) {
      setNotification({
        type: 'error',
        message: 'Por favor, preencha todos os campos obrigatórios (*).'
      });
      return;
    }

    if (teacherScope.isTeacherRole && !teacherScope.allowedSubjectIds.has(formData.subject_id)) {
      setNotification({
        type: 'error',
        message: 'Você não tem permissão para cadastrar ou editar avaliações para esta disciplina.'
      });
      return;
    }

    // Verificar duplicidade de avaliação por turma, matéria e período
    const duplicate = assessments.find(a => 
      a.class_id === formData.class_id &&
      a.subject_id === formData.subject_id &&
      a.period === formData.period &&
      a.id !== editingId
    );

    if (duplicate) {
      setNotification({
        type: 'error',
        message: `Já existe uma avaliação cadastrada neste período (${formData.period}) para esta disciplina nesta turma.`
      });
      return;
    }

    setSaving(true);
    try {
      const targetClass = classes.find(c => c.id === formData.class_id);
      const effectiveUnitId = (formData as any).unit_id || targetClass?.unit_id || (selectedUnitId && selectedUnitId !== 'all' ? selectedUnitId : 'matriz');

      const dataToSave = {
        ...formData,
        title: formData.title.trim(),
        weight: Number(formData.weight),
        unit_id: effectiveUnitId,
        user_id: formData.user_id || user?.uid || null,
        created_at: formData.created_at || new Date().toISOString()
      };
      await saveRecord('assessments', editingId || undefined, dataToSave as any);
      
      const savedYearMatch = /^(\d{4})/.exec(String(formData.date || ''));
      if (savedYearMatch) {
        const parsedYear = Number(savedYearMatch[1]);
        if (parsedYear >= 2000 && parsedYear <= 2100) {
          setSelectedYear(parsedYear);
        }
      }

      setEditingId(null);
      setFormData(getEmptyFormData());
      setNotification({
        type: 'success',
        message: editingId ? 'Avaliação atualizada com sucesso!' : 'Nova avaliação cadastrada com sucesso!'
      });
      setActiveTab('consult');
      loadData();
    } catch (error: any) {
      console.error('Erro ao salvar avaliação:', error);
      setNotification({
        type: 'error',
        message: 'Falha ao salvar os dados da avaliação. Tente novamente mais tarde.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (assessment: Assessment) => {
    setFormData({
      ...assessment,
      date: assessment.date ? assessment.date.split('T')[0] : '',
      description: assessment.description || ''
    });
    setEditingId(assessment.id);
    setActiveTab('register');
  };

  const triggerDeleteConfirm = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    if (!canDelete) {
      setNotification({
        type: 'error',
        message: 'Ação não permitida: O perfil de Assistente é vedado de excluir registros.'
      });
      setDeleteConfirmId(null);
      return;
    }
    const targetId = deleteConfirmId;
    setDeleteConfirmId(null);

    try {
      const assessmentToDelete = assessments.find(a => a.id === targetId);
      if (!assessmentToDelete) return;

      // 1. Delete the assessment itself
      await deleteRecord('assessments', targetId);
      
      // 2. Delete related grades (linked safely by class, subject and period mismatch)
      const relatedGrades = await fetchQuery('grades', [
        { field: 'class_id', operator: '==', value: assessmentToDelete.class_id },
        { field: 'subject_id', operator: '==', value: assessmentToDelete.subject_id },
        { field: 'period', operator: '==', value: assessmentToDelete.id }
      ]);

      // Backwards compatible delete
      const oldRelatedGrades = await fetchQuery('grades', [
        { field: 'class_id', operator: '==', value: assessmentToDelete.class_id },
        { field: 'subject_id', operator: '==', value: assessmentToDelete.subject_id },
        { field: 'period', operator: '==', value: assessmentToDelete.title }
      ]);

      const allOldGrades = [...(relatedGrades || []), ...(oldRelatedGrades || [])];
      if (allOldGrades.length > 0) {
        await Promise.all(allOldGrades.map(g => deleteRecord('grades', g.id)));
      }

      setNotification({
        type: 'success',
        message: 'Avaliação e todas as notas associadas foram excluídas com sucesso.'
      });
      loadData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      setNotification({
        type: 'error',
        message: 'Erro ao excluir a avaliação e suas notas.'
      });
    }
  };

  const handleGoToGrades = (assessment: Assessment) => {
    // Stores parameters securely inside sessionStorage and performs the transition
    sessionStorage.setItem('grades_redirect', JSON.stringify({
      classId: assessment.class_id,
      subjectId: assessment.subject_id,
      periodId: assessment.id
    }));
    navigate('/grades');
  };

  // Escopo de acesso para perfil de professor com prioridade para as regras da unidade ativa
  const teacherScope = React.useMemo(() => {
    return getTeacherScope(profile, teachers, subjects, classes, assessments, selectedUnitId, units);
  }, [profile, teachers, subjects, classes, assessments, selectedUnitId, units]);

  // Turmas permitidas para o usuário atual
  const availableClasses = React.useMemo(() => {
    if (teacherScope.isTeacherRole) {
      return classes.filter(c => teacherScope.allowedClassIds.has(c.id));
    }
    if (selectedUnitId && selectedUnitId !== 'all' && selectedUnitId.toLowerCase() !== 'todas') {
      return filterByActiveUnit(classes, c => c.unit_id || (c as any).polo);
    }
    return classes;
  }, [classes, teacherScope, selectedUnitId, filterByActiveUnit]);

  // Disciplinas disponíveis para o formulário de cadastro/edição
  const availableSubjectsForForm = React.useMemo(() => {
    const cls = formData.class_id ? classes.find(c => c.id === formData.class_id) : null;
    const base = cls ? getClassSubjects(cls, subjects) : subjects.filter(isSubjectActive);

    if (teacherScope.isTeacherRole && cls) {
      const teacherAllowed = subjects.filter(s => teacherScope.allowedSubjectIds.has(s.id));
      
      const teacherSubsForThisClass = teacherAllowed.filter(s => {
        if (base.find(cs => cs.id === s.id)) return true;
        if (base.length === 0 && isSubjectActive(s) && doesSubjectYearMatchClass(s.year, cls)) return true;
        return false;
      });

      const combined = [...base];
      teacherSubsForThisClass.forEach(ts => {
        if (!combined.find(c => c.id === ts.id)) combined.push(ts);
      });

      return combined.filter(s => teacherScope.allowedSubjectIds.has(s.id));
    }

    if (teacherScope.isTeacherRole) {
      return base.filter(s => teacherScope.allowedSubjectIds.has(s.id));
    }
    return base;
  }, [formData.class_id, classes, subjects, teacherScope]);

  const getClassName = (id: string) => classes.find(c => c.id === id)?.name || 'N/A';
  const getSubjectName = (subjectId: string, classId?: string) => {
    const sub = subjects.find(s => s.id === subjectId);
    if (!sub) return 'N/A';
    const cls = classId ? classes.find(c => c.id === classId) : undefined;
    return formatSubjectDisplayName(sub, cls);
  };

  const getAssessmentYear = React.useCallback((a: Assessment): number => {
    const dateYearMatch = /^(\d{4})/.exec(String(a.date || '').trim());
    if (dateYearMatch) {
      const yr = Number(dateYearMatch[1]);
      if (yr >= 2000 && yr <= 2100) return yr;
    }
    const cls = classes.find(c => c.id === a.class_id);
    if (cls) {
      const clsYearRaw = (cls as any).academic_year || (cls as any).start_year || cls.year || cls.name?.match(/\b(20\d{2})\b/)?.[1] || cls.start_date?.slice(0, 4);
      const clsYr = Number(clsYearRaw);
      if (clsYr >= 2000 && clsYr <= 2100) return clsYr;
    }
    const createdMatch = /^(\d{4})/.exec(String(a.created_at || '').trim());
    if (createdMatch) {
      const yr = Number(createdMatch[1]);
      if (yr >= 2000 && yr <= 2100) return yr;
    }
    return currentYear;
  }, [classes, currentYear]);

  // All assessments allowed for active unit & user role
  const scopedAssessments = React.useMemo(() => {
    return assessments.filter(a => {
      if (teacherScope.isTeacherRole && !teacherScope.allowedSubjectIds.has(a.subject_id)) {
        return false;
      }
      if (selectedUnitId && selectedUnitId !== 'all') {
        const cls = classes.find(c => c.id === a.class_id);
        const itemUnit = (a as any).unit_id || cls?.unit_id || (cls as any)?.polo || 'matriz';
        if (!isItemInActiveUnit(itemUnit)) {
          return false;
        }
      }
      return true;
    });
  }, [assessments, teacherScope, selectedUnitId, classes, isItemInActiveUnit]);

  // Distinct years available for pagination
  const availableYears = React.useMemo(() => {
    const yearsSet = new Set<number>([currentYear, selectedYear]);
    scopedAssessments.forEach(a => yearsSet.add(getAssessmentYear(a)));
    availableClasses.forEach(c => {
      const y = Number((c as any).academic_year || (c as any).start_year || c.year || c.name?.match(/\b(20\d{2})\b/)?.[1]);
      if (y >= 2000 && y <= 2100) yearsSet.add(y);
    });
    const minY = Math.min(...Array.from(yearsSet), currentYear - 2);
    const maxY = Math.max(...Array.from(yearsSet), currentYear);
    const fullList: number[] = [];
    for (let y = maxY; y >= minY; y--) {
      fullList.push(y);
    }
    return fullList;
  }, [scopedAssessments, availableClasses, currentYear, selectedYear, getAssessmentYear]);

  // Assessments filtered strictly by selected academic year
  const yearAssessments = React.useMemo(() => {
    return scopedAssessments
      .filter(a => getAssessmentYear(a) === selectedYear)
      .sort((a, b) => {
        const clsCmp = getClassName(a.class_id).localeCompare(getClassName(b.class_id));
        if (clsCmp !== 0) return clsCmp;
        const subCmp = getSubjectName(a.subject_id, a.class_id).localeCompare(getSubjectName(b.subject_id, b.class_id));
        if (subCmp !== 0) return subCmp;
        const perCmp = String(a.period || '').localeCompare(String(b.period || ''));
        if (perCmp !== 0) return perCmp;
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
  }, [scopedAssessments, selectedYear, getAssessmentYear, classes, subjects]);

  // Semantic text color for period kicker (clean typography without pill clutter)
  const getPeriodTextClass = (period: string) => {
    switch(period) {
      case '1º Bimestre': 
      case '1ª Avaliação':
        return 'text-indigo-700';
      case '2º Bimestre': 
      case '2ª Avaliação':
        return 'text-emerald-700';
      case '3º Bimestre': 
      case '3ª Avaliação':
        return 'text-amber-700';
      case '4º Bimestre': 
      case '4ª Avaliação':
        return 'text-rose-700';
      default: 
        return 'text-slate-500';
    }
  };

  return (
    <div className="w-full space-y-3 sm:space-y-3.5">
      {/* Notifications Banner */}
      <AnimatePresence>
        {notification && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-sm bg-white rounded-2xl shadow-xl border p-6 flex flex-col items-center text-center space-y-4 ${
                notification.type === 'success' ? 'border-emerald-100' : 'border-red-100'
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xs ${
                notification.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}>
                {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
              </div>
              
              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-slate-900">
                  {notification.type === 'success' ? 'Sucesso!' : 'Atenção / Aviso'}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  {notification.message}
                </p>
              </div>

              <button 
                onClick={() => setNotification(null)}
                title="Fechar aviso"
                className={`w-full py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  notification.type === 'success' 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clean Minimal Header Panel */}
      <PageHeader title="Avaliações">
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab('consult');
              setEditingId(null);
            }}
            title="Consultar avaliações cadastradas por ano letivo"
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'consult'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Consultar & Histórico
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setEditingId(null);
              setFormData(getEmptyFormData());
            }}
            title="Abrir formulário limpo para cadastrar nova avaliação"
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'register'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {editingId ? 'Editar Avaliação' : 'Registrar Nova'}
          </button>
        </div>
      </PageHeader>

      {/* Teacher Scope Notification / Indicator & Unit Conflict Alert */}
      <TeacherScopeBanner scope={teacherScope} availableClassesCount={availableClasses.length} className="mb-4" />

      {activeTab === 'consult' && (
        <>
          {/* Lightweight Inline Year Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <p className="text-xs font-medium text-slate-500 tabular-nums">
              <span className="font-semibold text-slate-800">{selectedYear}</span>
              <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
              <span>
                {yearAssessments.length} {yearAssessments.length === 1 ? 'avaliação registrada' : 'avaliações registradas'}
              </span>
            </p>

            {/* Compact Year Pagination */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedYear(prev => prev - 1)}
                title={`Carregar avaliações de ${selectedYear - 1}`}
                aria-label="Ano anterior"
                className="p-1.5 rounded-md text-slate-500 hover:text-indigo-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                title="Selecionar ano letivo"
                className="px-2.5 py-1 bg-transparent text-xs font-semibold text-slate-800 tabular-nums outline-none cursor-pointer"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setSelectedYear(prev => prev + 1)}
                disabled={selectedYear >= currentYear + 1}
                title={`Carregar avaliações de ${selectedYear + 1}`}
                aria-label="Próximo ano"
                className="p-1.5 rounded-md text-slate-500 hover:text-indigo-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Main Grid View */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs font-medium text-slate-400">Carregando avaliações...</p>
            </div>
          ) : yearAssessments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <AnimatePresence>
                {yearAssessments.map((a, aIdx) => {
                  const registeredGradesForAssessment = grades.filter(g => 
                    g.class_id === a.class_id && 
                    g.subject_id === a.subject_id && 
                    (g.period === a.id || g.period === a.title) &&
                    g.value !== null && g.value !== undefined && g.value !== ''
                  );
                  const historyIds = new Set<string>(registeredGradesForAssessment.map(g => String(g.student_id)).filter(Boolean));
                  const classStudents = mergeClassStudentsWithHistory(students, a.class_id, enrollments, historyIds);
                  const totalClassStudentsCount = classStudents.length;
                  const registeredGradesCount = registeredGradesForAssessment.length;
                  const hasGrades = registeredGradesCount > 0;
                  const isDiaryComplete = totalClassStudentsCount > 0 && registeredGradesCount === totalClassStudentsCount;
                  const launchPercentage = totalClassStudentsCount > 0 ? Math.round((registeredGradesCount / totalClassStudentsCount) * 100) : 0;

                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.16 }}
                      key={`ass-card-${a.id || aIdx}-${aIdx}`}
                      className="bg-white flex flex-col justify-between rounded-xl border border-slate-200 hover:border-slate-300 transition-colors overflow-hidden"
                    >
                      <div className="p-5 space-y-3">
                        {/* Quiet kicker + action icons */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold ${getPeriodTextClass(a.period)}`}>
                            {a.period}
                          </span>
                          
                          <div className="flex items-center gap-1">
                            <button 
                              type="button"
                              onClick={() => handleEdit(a)} 
                              title="Editar avaliação"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit3 size={14} />
                            </button>
                            {canDelete && (
                              <button 
                                type="button"
                                onClick={() => triggerDeleteConfirm(a.id)} 
                                title="Excluir avaliação"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50/60 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Title + optional description */}
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-1">
                            {a.title}
                          </h3>
                          {a.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                              {a.description}
                            </p>
                          )}
                        </div>

                        {/* Unboxed clean metadata */}
                        <div className="pt-2.5 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                          <p className="font-medium text-slate-700 truncate">
                            {getClassName(a.class_id)}
                            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                            <span className="text-slate-500 font-normal">{getSubjectName(a.subject_id, a.class_id)}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {formatDateBR(a.date)}
                            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                            <span className="font-semibold text-slate-700">Peso {a.weight}</span>
                          </p>
                        </div>
                      </div>

                      {/* Footer: completion bar & direct action */}
                      <div className="px-5 py-3.5 bg-slate-50/60 border-t border-slate-100 space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] tabular-nums">
                          <span className="text-slate-500">Notas lançadas</span>
                          <span className={`font-semibold ${isDiaryComplete ? 'text-emerald-700' : hasGrades ? 'text-indigo-700' : 'text-slate-500'}`}>
                            {isDiaryComplete 
                              ? 'Completo (100%)' 
                              : `${registeredGradesCount}/${totalClassStudentsCount} (${launchPercentage}%)`
                            }
                          </span>
                        </div>

                        <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${launchPercentage}%` }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className={`h-full rounded-full ${isDiaryComplete ? 'bg-emerald-600' : hasGrades ? 'bg-indigo-600' : 'bg-slate-400'}`}
                          />
                        </div>

                        <button 
                          type="button"
                          onClick={() => handleGoToGrades(a)}
                          title={isDiaryComplete ? "Abrir diário para revisar notas" : "Abrir diário para lançar notas"}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors border cursor-pointer ${
                            isDiaryComplete
                              ? 'bg-white text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600'
                          }`}
                        >
                          {isDiaryComplete ? 'Revisar Notas' : 'Lançar Notas'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-200 max-w-md mx-auto flex flex-col items-center justify-center p-6 space-y-3">
              <p className="text-sm font-medium text-slate-600">
                Nenhuma avaliação registrada em <span className="font-semibold text-slate-800 tabular-nums">{selectedYear}</span>.
              </p>
              <button 
                type="button"
                onClick={handleOpenNewForm}
                title="Cadastrar uma nova atividade avaliativa"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Nova Avaliação
              </button>
            </div>
          )}
        </>
      )}

      {/* Inline Form Container for Register / Edit Tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'register' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2"
          >
            {/* Form Section */}
            <div className="bg-white rounded-xl overflow-hidden shadow-xs border border-slate-200 col-span-1 lg:col-span-7">
              {/* Clean Form Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">
                  {editingId ? 'Editar Avaliação' : 'Nova Avaliação'}
                </h2>
                <button 
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormData(getEmptyFormData());
                    setActiveTab('consult');
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
                  title="Voltar para Consulta"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Class Field */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5 font-bold">Turma *</label>
                    <select 
                      required
                      value={formData.class_id || ''}
                      onChange={e => setFormData({...formData, class_id: e.target.value, subject_id: '', period: ''})}
                      title="Selecionar a turma para esta avaliação"
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    >
                      <option value="">Selecione a turma...</option>
                      {availableClasses.map((c, idx) => <option key={`ass-mdl-cls-${c.id || idx}-${idx}`} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Subject Field */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5 font-bold">Disciplina *</label>
                    <select 
                      required
                      value={formData.subject_id || ''}
                      disabled={!formData.class_id}
                      onChange={e => {
                        const newSubId = e.target.value;
                        const selClass = classes.find(c => c.id === formData.class_id);
                        const selSub = subjects.find(s => s.id === newSubId);
                        const periods = getAvailablePeriodsForSubject(selSub, selClass);
                        setFormData({
                          ...formData, 
                          subject_id: newSubId,
                          period: formData.period && periods.some(p => p.name === formData.period) ? formData.period : ''
                        });
                      }}
                      title="Selecionar a disciplina vinculada à avaliação"
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">Selecione...</option>
                      {availableSubjectsForForm.map((s, idx) => {
                        const selectedClass = classes.find(c => c.id === formData.class_id);
                        return (
                          <option key={`ass-mdl-sub-${s.id || idx}-${idx}`} value={s.id}>
                            {formatSubjectDisplayName(s, selectedClass)}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Period Field */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Período / Avaliação *</label>
                    <select 
                      required
                      value={formData.period || ''}
                      onChange={e => setFormData({...formData, period: e.target.value})}
                      title="Selecionar a etapa ou avaliação correspondente"
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    >
                      <option value="">Selecione...</option>
                      {(() => {
                        const formClass = classes.find(c => c.id === formData.class_id);
                        const formSub = subjects.find(s => s.id === formData.subject_id);
                        const available = getAvailablePeriodsForSubject(formSub, formClass);
                        if (available.length > 0) {
                          return available.map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ));
                        }
                        return (
                          <>
                            <option value="1ª Avaliação">1ª Avaliação</option>
                            <option value="2ª Avaliação">2ª Avaliação</option>
                            <option value="3ª Avaliação">3ª Avaliação</option>
                            <option value="4ª Avaliação">4ª Avaliação</option>
                          </>
                        );
                      })()}
                    </select>
                  </div>

                  {/* Date Picker */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Data da Realização *</label>
                    <input 
                      type="date"
                      required
                      value={formData.date || ''}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      title="Data prevista ou realizada da avaliação"
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  {/* Weight Field */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Valor Máximo (Peso) *</label>
                    <input 
                      type="number"
                      step="0.1"
                      min="0.1"
                      required
                      value={formData.weight ?? ''}
                      onChange={e => setFormData({...formData, weight: e.target.value === '' ? undefined : parseFloat(e.target.value)})}
                      placeholder="Ex: 10"
                      title="Nota máxima ou peso atribuído à avaliação"
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  {/* Description Field */}
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Descrição / Conteúdo Programático</label>
                    <textarea 
                      value={formData.description || ''}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="Ex: Trabalho individual sobre Doutrina Social da Igreja Capítulos 1 e 2"
                      title="Descrição detalhada ou conteúdo programático cobrado na avaliação"
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none"
                    />
                  </div>

                  {/* Title field (last option) */}
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Título da Avaliação *</label>
                    <input 
                      type="text"
                      required
                      value={formData.title || ''}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      placeholder="Ex: Prova Escrita, Seminário, Redação de Exercícios"
                      title="Título identificador da atividade avaliativa"
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-semibold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setFormData(getEmptyFormData());
                      setActiveTab('consult');
                    }}
                    title="Cancelar e retornar à consulta de avaliações"
                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    title={editingId ? "Salvar alterações nesta avaliação" : "Cadastrar nova avaliação e gerar pauta"}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-indigo-100 transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    {saving && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />}
                    {editingId ? 'Salvar Alterações' : 'Criar Avaliação'}
                  </button>
                </div>
              </form>
            </div>

            {/* Clean Preview Section */}
            <div className="col-span-1 lg:col-span-5 space-y-2.5 lg:sticky lg:top-6">
              <p className="text-xs font-medium text-slate-400 pl-1">Prévia do registro</p>

              <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl overflow-hidden text-left">
                <div className="p-5 space-y-3">
                  <span className={`inline-block text-xs font-semibold ${getPeriodTextClass(formData.period || '')}`}>
                    {formData.period || 'Período'}
                  </span>
                  
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                      {formData.title || 'Título da Avaliação'}
                    </h3>
                    {formData.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {formData.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    <p className="font-medium text-slate-700 truncate">
                      {formData.class_id ? getClassName(formData.class_id) : 'Turma não selecionada'}
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                      <span className="text-slate-500 font-normal">
                        {formData.subject_id ? getSubjectName(formData.subject_id, formData.class_id) : 'Disciplina'}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {formatDateBR(formData.date)}
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-700">
                        {formData.weight ? `Peso ${formData.weight}` : 'Peso ---'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-slate-50/60 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] tabular-nums">
                    <span className="text-slate-400">Notas lançadas</span>
                    <span className="text-slate-400 font-semibold">0/0 (0%)</span>
                  </div>
                  <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-slate-300 w-0" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CUSTOM DIALOG: Deletion Confirmation */}
      <AnimatePresence>
        {deleteConfirmId && canDelete && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-xl p-6 shadow-xl border border-slate-200 text-center space-y-4"
            >
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-100">
                <Trash2 size={24} />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-800">Deseja realmente excluir esta avaliação?</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Atenção: Ao excluir esta avaliação, <span className="text-red-600 font-bold">todas as notas já lançadas para os alunos nesta atividade</span> no diário também serão permanentemente removidas!
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  title="Cancelar e manter avaliação cadastrada"
                  className="flex-1 py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar, Manter Avaliação
                </button>
                <button 
                  onClick={handleDelete}
                  title="Confirmar exclusão definitiva da avaliação e suas notas"
                  className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-red-100 transition-all cursor-pointer"
                >
                  Sim, Excluir Tudo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
