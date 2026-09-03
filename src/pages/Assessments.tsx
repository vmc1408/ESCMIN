import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Calendar, 
  BookOpen, 
  Users, 
  Trash2, 
  Edit3,
  FileText,
  AlertCircle,
  Activity,
  Award,
  ChevronRight,
  SlidersHorizontal,
  Info,
  CheckCircle2,
  X,
  HelpCircle,
  Search,
  Archive,
  History,
  GraduationCap,
  Check
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll, fetchQuery, saveData as saveRecord, deleteData as deleteRecord } from '../lib/database';
import { Assessment, Class, Subject, Teacher } from '../types';
import { formatSubjectDisplayName, filterStudentsForClass, normalizeClass, normalizeSubject, getClassSubjects } from '../lib/utils';
import { detectSubjectSemester, getAvailablePeriodsForSubject } from '../lib/academicUtils';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherScope } from '../lib/teacherScope';

export const Assessments: React.FC = () => {
  const { user, profile } = useAuth();
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

  const [formData, setFormData] = useState<Partial<Assessment>>({
    title: '',
    date: new Date().toISOString().split('T')[0],
    weight: 10,
    class_id: '',
    subject_id: '',
    period: '1ª Avaliação',
    description: ''
  });

  // Filters
  const [filterClass, setFilterClass] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Auto-dimiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    loadData();
  }, []);

  // Pre-fill fields from Grades redirect
  useEffect(() => {
    const redirectStr = sessionStorage.getItem('assessments_redirect');
    if (redirectStr && classes.length > 0 && subjects.length > 0) {
      try {
        const data = JSON.parse(redirectStr);
        if (data.classId) {
          setFilterClass(data.classId);
          setFormData(prev => ({ ...prev, class_id: data.classId }));
        }
        if (data.subjectId) {
          setFilterSubject(data.subjectId);
          setFormData(prev => ({ ...prev, subject_id: data.subjectId }));
        }
        setActiveTab('register');
        sessionStorage.removeItem('assessments_redirect');
      } catch (e) {
        console.error('Error parsing assessments redirect:', e);
      }
    }
  }, [classes, subjects]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assessData, classesData, subjectsData, studentsData, enrollmentsData, gradesData, teachersData] = await Promise.all([
        fetchAll('assessments'),
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchAll('students'),
        fetchAll('enrollments').catch(() => []),
        fetchAll('grades'),
        fetchAll('teachers', '*', 'name')
      ]);

      const normalizedSubjects = (subjectsData || []).map((s: any) => normalizeSubject(s));
      const normalizedClasses = (classesData || []).map((cls: any) => normalizeClass(cls, normalizedSubjects));

      const sortedClasses = (normalizedClasses || []).sort((a: any, b: any) => {
        const extract = (s: string) => {
          const match = s.match(/\d{4}/);
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

  // Pre-fills filters when user triggers "Nova Avaliação"
  const handleOpenNewForm = () => {
    setEditingId(null);
    setFormData({
      title: '',
      date: new Date().toISOString().split('T')[0],
      weight: 10,
      class_id: filterClass || '',
      subject_id: filterSubject || '',
      period: filterPeriod || '1º Bimestre',
      description: ''
    });
    setActiveTab('register');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.class_id || !formData.subject_id || !formData.title || !formData.period) {
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
      const dataToSave = {
        ...formData,
        user_id: formData.user_id || user?.uid || null,
        created_at: formData.created_at || new Date().toISOString()
      };
      await saveRecord('assessments', editingId || undefined, dataToSave as any);
      
      setEditingId(null);
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
      date: assessment.date ? assessment.date.split('T')[0] : new Date().toISOString().split('T')[0],
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

  // Escopo de acesso para perfil de professor
  const teacherScope = React.useMemo(() => {
    return getTeacherScope(profile, teachers, subjects, classes, assessments);
  }, [profile, teachers, subjects, classes, assessments]);

  // Turmas permitidas para o usuário atual
  const availableClasses = React.useMemo(() => {
    if (!teacherScope.isTeacherRole) return classes;
    return classes.filter(c => teacherScope.allowedClassIds.has(c.id));
  }, [classes, teacherScope]);

  // Se o professor tiver apenas 1 turma disponível, pré-seleciona nos filtros e no formulário
  useEffect(() => {
    if (teacherScope.isTeacherRole && availableClasses.length === 1) {
      if (!filterClass) setFilterClass(availableClasses[0].id);
      setFormData(prev => ({ ...prev, class_id: prev.class_id || availableClasses[0].id }));
    }
  }, [teacherScope.isTeacherRole, availableClasses, filterClass]);

  // Se a turma filtrada não for mais permitida, reseta
  useEffect(() => {
    if (teacherScope.isTeacherRole && filterClass && !teacherScope.allowedClassIds.has(filterClass)) {
      setFilterClass('');
      setFilterSubject('');
    }
  }, [teacherScope.isTeacherRole, teacherScope.allowedClassIds, filterClass]);

  // Disciplinas disponíveis para os filtros
  const availableSubjectsForFilter = React.useMemo(() => {
    const cls = filterClass ? classes.find(c => c.id === filterClass) : null;
    const base = cls ? getClassSubjects(cls, subjects) : subjects;
    
    if (teacherScope.isTeacherRole && cls) {
      const teacherAllowed = subjects.filter(s => teacherScope.allowedSubjectIds.has(s.id));
      const classYear = String(cls.year || cls.name || '');
      
      const teacherSubsForThisClass = teacherAllowed.filter(s => {
        if (base.find(cs => cs.id === s.id)) return true;
        if (s.year && classYear.includes(String(s.year))) return true;
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
  }, [filterClass, classes, subjects, teacherScope]);

  // Disciplinas disponíveis para o formulário de cadastro/edição
  const availableSubjectsForForm = React.useMemo(() => {
    const cls = formData.class_id ? classes.find(c => c.id === formData.class_id) : null;
    const base = cls ? getClassSubjects(cls, subjects) : subjects;

    if (teacherScope.isTeacherRole && cls) {
      const teacherAllowed = subjects.filter(s => teacherScope.allowedSubjectIds.has(s.id));
      const classYear = String(cls.year || cls.name || '');
      
      const teacherSubsForThisClass = teacherAllowed.filter(s => {
        if (base.find(cs => cs.id === s.id)) return true;
        if (s.year && classYear.includes(String(s.year))) return true;
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

  // Compute filtered items
  const filteredAssessments = assessments.filter(a => {
    if (teacherScope.isTeacherRole && !teacherScope.allowedSubjectIds.has(a.subject_id)) {
      return false;
    }
    const matchesClass = !filterClass || a.class_id === filterClass;
    const matchesSubject = !filterSubject || a.subject_id === filterSubject;
    
    let matchesPeriod = true;
    if (filterPeriod) {
      if (filterPeriod === '1ª Avaliação') {
        matchesPeriod = a.period === '1ª Avaliação' || a.period === '1º Bimestre';
      } else if (filterPeriod === '2ª Avaliação') {
        matchesPeriod = a.period === '2ª Avaliação' || a.period === '2º Bimestre';
      } else if (filterPeriod === '3ª Avaliação') {
        matchesPeriod = a.period === '3ª Avaliação' || a.period === '3º Bimestre';
      } else if (filterPeriod === '4ª Avaliação') {
        matchesPeriod = a.period === '4ª Avaliação' || a.period === '4º Bimestre';
      } else {
        matchesPeriod = a.period === filterPeriod;
      }
    }

    const matchesSearch = !filterSearch || 
      (a.title || '').toLowerCase().includes(filterSearch.toLowerCase()) || 
      (a.description || '').toLowerCase().includes(filterSearch.toLowerCase());
    return matchesClass && matchesSubject && matchesPeriod && matchesSearch;
  });

  const getClassName = (id: string) => classes.find(c => c.id === id)?.name || 'N/A';
  const getSubjectName = (subjectId: string, classId?: string) => {
    const sub = subjects.find(s => s.id === subjectId);
    if (!sub) return 'N/A';
    const cls = classId ? classes.find(c => c.id === classId) : undefined;
    return formatSubjectDisplayName(sub, cls);
  };

  // Styles utility for bimester and assessment tags
  const getBimesterBadgeStyles = (period: string) => {
    switch(period) {
      case '1º Bimestre': 
      case '1ª Avaliação':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case '2º Bimestre': 
      case '2ª Avaliação':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '3º Bimestre': 
      case '3ª Avaliação':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case '4º Bimestre': 
      case '4ª Avaliação':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default: 
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
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

      {/* Header Panel */}
      <PageHeader
        title="Gestão de Avaliações"
        description="Planejamento e controle de atividades avaliativas de uso exclusivo da escola."
        icon={FileText}
      >
        <div className="flex bg-slate-100 p-1 rounded-none border border-slate-200">
          <button
            onClick={() => {
              setActiveTab('consult');
              setEditingId(null);
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'consult'
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Search size={13} />
            Consultar & Histórico
          </button>
          <button
            onClick={() => {
              setActiveTab('register');
              setEditingId(null);
              setFormData({
                title: '',
                date: new Date().toISOString().split('T')[0],
                weight: 10,
                class_id: filterClass || '',
                subject_id: filterSubject || '',
                period: filterPeriod || '1º Bimestre',
                description: ''
              });
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus size={13} />
            {editingId ? 'Editar Avaliação' : 'Registrar Nova'}
          </button>
        </div>
      </PageHeader>

      {/* Teacher Scope Notification / Indicator */}
      {teacherScope.isTeacherRole && (
        <div className="bg-indigo-50/80 border border-indigo-100 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-950 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <GraduationCap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase tracking-widest bg-indigo-200/80 text-indigo-800 px-2 py-0.5 rounded">
                  Modo Docente
                </span>
                {teacherScope.teacher ? (
                  <span className="text-[11px] font-black text-indigo-950">
                    {teacherScope.teacher.name}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-800">
                    Docente não vinculado
                  </span>
                )}
              </div>
              <p className="text-[9px] font-medium text-indigo-700 mt-0.5">
                {teacherScope.hasAccess 
                  ? `Exibindo apenas as ${availableClasses.length} turma(s) e ${teacherScope.allowedSubjectIds.size} disciplina(s) atribuídas à sua escala de aulas.`
                  : teacherScope.emptyReason}
              </p>
            </div>
          </div>
          {teacherScope.hasAccess && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded border border-emerald-200 flex items-center gap-1">
                <Check size={11} />
                Acesso Restrito & Seguro
              </span>
            </div>
          )}
        </div>
      )}

      {activeTab === 'consult' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-2 text-slate-700 text-xs font-bold uppercase tracking-wider">
              <SlidersHorizontal size={14} className="text-indigo-600" />
              <span>Pesquisa e Filtros de Organização</span>
            </div>
            <div className="text-[10px] text-slate-400 font-semibold bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100 flex items-center gap-1">
              <History size={11} className="text-slate-400" />
              Dica: Filtre por turma e avaliação para carregar consultas consolidadas e históricas
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* SEARCH TEXT FILTER */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-0.5 font-bold">Título / Conteúdo</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Pesquisar por título..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 font-medium placeholder:text-slate-400 outline-none"
                />
              </div>
            </div>

            {/* Class Filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-0.5 font-bold">Turma</label>
              <div className="relative">
                <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select 
                  value={filterClass}
                  onChange={(e) => {
                    setFilterClass(e.target.value);
                    setFilterSubject('');
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 font-medium outline-none"
                >
                  <option value="">Todas as Turmas</option>
                  {availableClasses.map((c, idx) => <option key={`ass-cls-opt-${c.id || idx}-${idx}`} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Subject Filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-0.5 font-bold">Disciplina</label>
              <div className="relative">
                <BookOpen size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select 
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 font-medium outline-none"
                >
                  <option value="">Todas as Disciplinas</option>
                  {availableSubjectsForFilter.map((s, idx) => {
                    const selectedClass = classes.find(c => c.id === filterClass);
                    return (
                      <option key={`ass-sub-opt-${s.id || idx}-${idx}`} value={s.id}>
                        {formatSubjectDisplayName(s, selectedClass)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Period Filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-0.5 font-bold">Avaliação</label>
              <div className="relative">
                <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select 
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 font-medium outline-none"
                >
                  <option value="">Todas as Avaliações</option>
                  {(() => {
                    const selClass = classes.find(c => c.id === filterClass);
                    const selSub = subjects.find(s => s.id === filterSubject);
                    const available = getAvailablePeriodsForSubject(selSub, selClass);
                    if (available.length > 0) {
                      return available.map(p => (
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
            </div>
          </div>

          {(filterClass || filterSubject || filterPeriod || filterSearch) && (
            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-slate-400 font-bold uppercase">
                {filteredAssessments.length} avaliações encontradas com filtros ativos
              </span>
              <button 
                onClick={() => {
                  setFilterClass('');
                  setFilterSubject('');
                  setFilterPeriod('');
                  setFilterSearch('');
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <X size={14} />
                Limpar Todos os Filtros
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'consult' && (
        <>
          {/* Main Grid View */}
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando avaliações...</p>
            </div>
          ) : !filterClass ? (
            <div className="py-20 text-center bg-slate-50/50 rounded-2xl border border-slate-200 max-w-xl mx-auto flex flex-col items-center justify-center p-8 space-y-4 shadow-2xs">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-xs">
                <Users size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-800 tracking-tight">Consulte as Avaliações por Turma</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Para visualizar ou editar as avaliações cadastradas, por favor selecione uma <strong>Turma</strong> no painel de filtros acima.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center pt-2">
                {availableClasses.slice(0, 4).map((c, idx) => (
                  <button
                    key={`ass-cls-quick-${c.id || idx}-${idx}`}
                    onClick={() => setFilterClass(c.id)}
                    className="text-[11px] font-bold bg-white text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-3 py-1.5 rounded-lg shadow-2xs transition-all cursor-pointer"
                  >
                    {c.name}
                  </button>
                ))}
                {availableClasses.length > 4 && (
                  <span className="text-[10px] text-slate-400 flex items-center font-bold px-1.5">
                    +{availableClasses.length - 4} mais
                  </span>
                )}
              </div>
            </div>
          ) : filteredAssessments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredAssessments.map((a, aIdx) => {
              // Calculate status values dynamically
              const classStudents = filterStudentsForClass(students, a.class_id, enrollments, true);
              const totalClassStudentsCount = classStudents.length;
              
              const registeredGradesForAssessment = grades.filter(g => 
                g.class_id === a.class_id && 
                g.subject_id === a.subject_id && 
                (g.period === a.id || g.period === a.title) &&
                g.value !== null && g.value !== undefined && g.value !== ''
              );
              const registeredGradesCount = registeredGradesForAssessment.length;
              const hasGrades = registeredGradesCount > 0;
              const isDiaryComplete = totalClassStudentsCount > 0 && registeredGradesCount === totalClassStudentsCount;
              const launchPercentage = totalClassStudentsCount > 0 ? Math.round((registeredGradesCount / totalClassStudentsCount) * 100) : 0;

              return (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  key={`ass-card-${a.id || aIdx}-${aIdx}`}
                  className="bg-white flex flex-col justify-between rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100 transition-all overflow-hidden"
                >
                  <div className="p-5 space-y-4">
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getBimesterBadgeStyles(a.period)}`}>
                        {a.period}
                      </span>
                      
                      <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                        <button 
                          onClick={() => handleEdit(a)} 
                          title="Editar avaliação"
                          className="p-1 px-1.5 text-slate-400 hover:text-indigo-600 transition-colors hover:bg-white rounded"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button 
                          onClick={() => triggerDeleteConfirm(a.id)} 
                          title="Excluir avaliação"
                          className="p-1 px-1.5 text-slate-400 hover:text-red-600 transition-colors hover:bg-white rounded"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    
                    {/* Title */}
                    <div>
                      <h3 className="text-base font-bold text-slate-800 leading-tight uppercase tracking-tight line-clamp-1">{a.title}</h3>
                      {a.description ? (
                        <p className="text-xs text-slate-400 italic mt-1 line-clamp-2 max-h-11">
                          "{a.description}"
                        </p>
                      ) : (
                        <p className="text-xs text-slate-300 italic mt-1 font-medium">Sem descrição ou conteúdo vinculados.</p>
                      )}
                    </div>

                    {/* Metadata indicators */}
                    <div className="pt-2 text-xs space-y-2 text-slate-600 border-t border-dashed border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <Users size={14} className="text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">{getClassName(a.class_id)}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <BookOpen size={14} className="text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">{getSubjectName(a.subject_id, a.class_id)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Calendar size={13} className="shrink-0" />
                          <span className="font-medium text-[11px]">
                            {a.date ? new Date(a.date).toLocaleDateString('pt-BR') : '---'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-800 font-bold bg-slate-100/60 px-1.5 py-0.5 rounded text-[11px] justify-center border border-slate-200/50">
                          <Award size={13} className="text-indigo-600 shrink-0" />
                          <span>Valor: {a.weight}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Meter completion bar */}
                  <div className="px-5 py-3.5 bg-slate-50/50 border-t border-slate-150 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Lançamento de Notas:</span>
                      <span className={`font-bold ${isDiaryComplete ? 'text-emerald-700' : hasGrades ? 'text-indigo-600' : 'text-slate-500'}`}>
                        {isDiaryComplete 
                          ? '✓ Completo! (100%)' 
                          : `${registeredGradesCount} de ${totalClassStudentsCount} alunos (${launchPercentage}%)`
                        }
                      </span>
                    </div>

                    {/* Bar visual */}
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${launchPercentage}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={`h-full rounded-full ${isDiaryComplete ? 'bg-emerald-600' : hasGrades ? 'bg-indigo-600' : 'bg-slate-400'}`}
                      />
                    </div>

                    {/* Direct Shortcut Link */}
                    <button 
                      onClick={() => handleGoToGrades(a)}
                      className={`w-full flex items-center justify-center gap-1.5 mt-2.5 py-2 px-3 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                        isDiaryComplete
                          ? 'bg-white text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600 shadow-xs hover:shadow-md shadow-indigo-100'
                      }`}
                    >
                      <Activity size={13} />
                      {isDiaryComplete ? 'Revisar Notas' : 'Lançar Notas no Diário'}
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div className="py-24 text-center bg-slate-50/40 rounded-2xl border-2 border-dashed border-slate-200 max-w-lg mx-auto flex flex-col items-center justify-center p-8 space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center">
            <AlertCircle size={32} />
          </div>
          <div>
            <p className="text-base font-bold text-slate-800 tracking-tight">Nenhuma avaliação encontrada</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
              Você pode registrar uma nova atividade avaliativa usando os filtros e acionando o botão superior.
            </p>
          </div>
          <button 
            onClick={handleOpenNewForm}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 mt-2"
          >
            <Plus size={14} />
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
            <div className="bg-white rounded-xl overflow-hidden shadow-md border border-slate-200 col-span-1 lg:col-span-7">
              {/* Form Title banner */}
              <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{editingId ? 'Editar Parâmetros da Avaliação' : 'Registrar Nova Avaliação'}</h2>
                  <p className="text-xs text-indigo-100">Essa atividade gerará pautas automáticas de notas para os alunos da turma selecionada</p>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setActiveTab('consult');
                  }}
                  className="text-indigo-200 hover:text-white transition-colors"
                  title="Voltar para Consulta"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Title field */}
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Título da Avaliação *</label>
                    <input 
                      type="text"
                      required
                      value={formData.title}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      placeholder="Ex: Prova Escrita, Seminário, Redação de Exercícios"
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-semibold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  {/* Class Field */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5 font-bold">Turma *</label>
                    <select 
                      required
                      value={formData.class_id}
                      onChange={e => setFormData({...formData, class_id: e.target.value, subject_id: ''})}
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
                      value={formData.subject_id}
                      disabled={!formData.class_id}
                      onChange={e => {
                        const newSubId = e.target.value;
                        const selClass = classes.find(c => c.id === formData.class_id);
                        const selSub = subjects.find(s => s.id === newSubId);
                        const periods = getAvailablePeriodsForSubject(selSub, selClass);
                        const firstPeriod = periods.length > 0 ? periods[0].name : '1ª Avaliação';
                        setFormData({
                          ...formData, 
                          subject_id: newSubId,
                          period: periods.some(p => p.name === formData.period) ? formData.period : firstPeriod
                        });
                      }}
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
                      value={formData.period}
                      onChange={e => setFormData({...formData, period: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    >
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
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
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
                      value={formData.weight}
                      onChange={e => setFormData({...formData, weight: parseFloat(e.target.value)})}
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  {/* Description Field */}
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Descrição / Conteúdo Programático</label>
                    <textarea 
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="Ex: Trabalho individual sobre Doutrina Social da Igreja Capítulos 1 e 2"
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setActiveTab('consult');
                    }}
                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-indigo-100 transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    {saving && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />}
                    {editingId ? 'Salvar Alterações' : 'Criar Avaliação'}
                  </button>
                </div>
              </form>
            </div>

            {/* Real-time Preview Section */}
            <div className="col-span-1 lg:col-span-5 space-y-4 lg:sticky lg:top-6">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-wider pl-1">
                <span>Visualização em Tempo Real</span>
              </div>

              <div className="bg-slate-55 border border-slate-200/80 rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px]">
                {/* Simulated Card */}
                <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-100 overflow-hidden text-left">
                  <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getBimesterBadgeStyles(formData.period || '1ª Avaliação')}`}>
                        {formData.period || '1ª Avaliação'}
                      </span>
                      
                      <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 uppercase tracking-wider">
                        Modo Prévia
                      </span>
                    </div>
                    
                    <div>
                      <h3 className="text-base font-bold text-slate-800 leading-tight uppercase tracking-tight truncate">
                        {formData.title || 'Título da Nova Avaliação'}
                      </h3>
                      <p className="text-xs text-slate-400 italic mt-1 line-clamp-2 min-h-11 leading-relaxed">
                        {formData.description ? `"${formData.description}"` : '"Sem descrição ou conteúdo programático vinculados até o momento."'}
                      </p>
                    </div>

                    <div className="pt-2 text-xs space-y-2 text-slate-600 border-t border-dashed border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <Users size={14} className="text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">
                          {formData.class_id ? getClassName(formData.class_id) : 'Turma Não Definida'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <BookOpen size={14} className="text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">
                          {formData.subject_id ? getSubjectName(formData.subject_id) : 'Disciplina Não Definida'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Calendar size={13} className="shrink-0" />
                          <span className="font-medium text-[11px]">
                            {formData.date ? new Date(formData.date).toLocaleDateString('pt-BR') : '---'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-800 font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-[11px] justify-center border border-amber-200/50">
                          <Award size={13} className="text-amber-600 shrink-0" />
                          <span>Valor: {formData.weight || 10}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-semibold">Lançamento de Notas:</span>
                      <span className="text-slate-400 font-bold">
                        0 de 0 alunos (0%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full bg-slate-300 w-0" />
                    </div>

                    <div className="text-center text-[10px] text-slate-400 font-medium py-1 italic">
                      As pautas de notas estarão prontas após salvar!
                    </div>
                  </div>
                </div>

                <div className="text-center max-w-xs mt-4 text-[11px] text-slate-400 leading-relaxed font-semibold">
                  Certifique-se de preencher todos os campos marcados com asterisco (*) para registrar esta atividade de forma correta.
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CUSTOM DIALOG: Deletion Confirmation */}
      <AnimatePresence>
        {deleteConfirmId && (
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
                  className="flex-1 py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar, Manter Avaliação
                </button>
                <button 
                  onClick={handleDelete}
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
