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
  HelpCircle
} from 'lucide-react';
import { fetchAll, fetchQuery, saveData as saveRecord, deleteData as deleteRecord } from '../lib/database';
import { Assessment, Class, Subject } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const Assessments: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State Management
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
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
    period: '1º Bimestre',
    description: ''
  });

  // Filters
  const [filterClass, setFilterClass] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');

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

  const loadData = async () => {
    setLoading(true);
    try {
      const [assessData, classesData, subjectsData, studentsData, gradesData] = await Promise.all([
        fetchAll('assessments'),
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('students', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchAll('grades')
      ]);

      const normalizedClasses = (classesData || []).map((cls: any) => {
        let sIds: string[] = [];
        if (Array.isArray(cls.subject_ids)) {
          sIds = cls.subject_ids;
        } else if (typeof cls.subject_ids === 'string' && cls.subject_ids.startsWith('{')) {
          sIds = cls.subject_ids.replace(/[{}]/g, '').split(',').filter(Boolean);
        } else if (typeof cls.subject_ids === 'string') {
          try {
            const parsed = JSON.parse(cls.subject_ids);
            sIds = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e) {
            sIds = cls.subject_ids ? [cls.subject_ids] : [];
          }
        } else if (cls.subject_id) {
          sIds = [cls.subject_id];
        }
        return { ...cls, subject_ids: sIds };
      });

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
      setSubjects(subjectsData as Subject[] || []);
      setStudents(studentsData || []);
      setGrades(gradesData || []);
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
    setShowForm(true);
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

    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        user_id: formData.user_id || user?.uid || null,
        created_at: formData.created_at || new Date().toISOString()
      };
      await saveRecord('assessments', editingId || undefined, dataToSave as any);
      
      setShowForm(false);
      setEditingId(null);
      setNotification({
        type: 'success',
        message: editingId ? 'Avaliação atualizada com sucesso!' : 'Nova avaliação cadastrada com sucesso!'
      });
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
    setShowForm(true);
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

  // Compute filtered items
  const filteredAssessments = assessments.filter(a => {
    return (!filterClass || a.class_id === filterClass) &&
           (!filterSubject || a.subject_id === filterSubject) &&
           (!filterPeriod || a.period === filterPeriod);
  });

  const getClassName = (id: string) => classes.find(c => c.id === id)?.name || 'N/A';
  const getSubjectName = (id: string) => subjects.find(s => s.id === id)?.name || 'N/A';

  // Styles utility for bimester tags
  const getBimesterBadgeStyles = (period: string) => {
    switch(period) {
      case '1º Bimestre': 
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case '2º Bimestre': 
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '3º Bimestre': 
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case '4º Bimestre': 
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
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`flex items-center gap-3 p-4 rounded-xl border font-semibold text-sm shadow-md ${
              notification.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertCircle size={18} className="text-red-500" />}
            <span className="flex-1">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
              <FileText size={20} />
            </div>
            Cadastrar Avaliações
          </h1>
          <p className="text-xs text-slate-500 mt-1 pl-13">Planeje as provas, atividades e trabalhos de cada bimestre escolar</p>
        </div>
        
        <button 
          onClick={handleOpenNewForm}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-indigo-100 cursor-pointer"
        >
          <Plus size={18} />
          Nova Avaliação
        </button>
      </div>

      {/* Filtering Space */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-slate-700 text-xs font-bold uppercase tracking-wider mb-2">
          <SlidersHorizontal size={14} className="text-indigo-600" />
          <span>Filtros de Organização</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 font-medium"
              >
                <option value="">Todas as Turmas</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 font-medium"
              >
                <option value="">Todas as Disciplinas</option>
                {subjects
                  .filter(s => {
                    if (!filterClass) return true;
                    const selectedClass = classes.find(c => c.id === filterClass);
                    return selectedClass?.subject_ids?.includes(s.id);
                  })
                  .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Period Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 ml-0.5 font-bold">Bimestre</label>
            <div className="relative">
              <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select 
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 font-medium"
              >
                <option value="">Todos os Bimestres</option>
                <option value="1º Bimestre">1º Bimestre</option>
                <option value="2º Bimestre">2º Bimestre</option>
                <option value="3º Bimestre">3º Bimestre</option>
                <option value="4º Bimestre">4º Bimestre</option>
              </select>
            </div>
          </div>
        </div>

        {(filterClass || filterSubject || filterPeriod) && (
          <div className="flex justify-end pt-2">
            <button 
              onClick={() => {
                setFilterClass('');
                setFilterSubject('');
                setFilterPeriod('');
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <X size={14} />
              Limpar Filtros Ativos
            </button>
          </div>
        )}
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando avaliações...</p>
        </div>
      ) : filteredAssessments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredAssessments.map((a) => {
              // Calculate status values dynamically
              const classStudents = students.filter(s => s.class_id === a.class_id);
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
                  key={a.id}
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
                        <span className="font-semibold truncate">{getSubjectName(a.subject_id)}</span>
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
            Nova Avaliação de Exemplo
          </button>
        </div>
      )}

      {/* Modal Overlay: Custom Form */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-xl overflow-hidden shadow-xl border border-slate-200"
            >
              {/* Form Title banner */}
              <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{editingId ? 'Editar Parâmetros da Avaliação' : 'Cadastrar Nova Avaliação'}</h2>
                  <p className="text-xs text-indigo-100">Essa atividade gerará pautas automáticas de notas para os alunos</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-indigo-200 hover:text-white transition-colors"
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
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Subject Field */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5 font-bold">Disciplina *</label>
                    <select 
                      required
                      value={formData.subject_id}
                      disabled={!formData.class_id}
                      onChange={e => setFormData({...formData, subject_id: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">Selecione...</option>
                      {subjects
                        .filter(s => {
                          if (!formData.class_id) return true;
                          const selectedClass = classes.find(c => c.id === formData.class_id);
                          return selectedClass?.subject_ids?.includes(s.id);
                        })
                        .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  {/* Period Field */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 pl-0.5">Período / Bimestre *</label>
                    <select 
                      required
                      value={formData.period}
                      onChange={e => setFormData({...formData, period: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    >
                      <option value="1º Bimestre">1º Bimestre</option>
                      <option value="2º Bimestre">2º Bimestre</option>
                      <option value="3º Bimestre">3º Bimestre</option>
                      <option value="4º Bimestre">4º Bimestre</option>
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

                  {/* Description Description */}
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
                    onClick={() => setShowForm(false)}
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
            </motion.div>
          </div>
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
