import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Calendar, 
  BookOpen, 
  Users, 
  Trash2, 
  Edit3,
  FileText,
  AlertCircle
} from 'lucide-react';
import { fetchAll, fetchQuery, saveData as saveRecord, deleteData as deleteRecord } from '../lib/database';

interface Assessment {
  id: string;
  title: string;
  date: string;
  weight: number;
  class_id: string;
  subject_id: string;
  period: string; // 1º Bimestre, etc
  description?: string;
  created_at: string;
}

interface Class {
  id: string;
  name: string;
  subject_ids?: string[];
}

interface Subject {
  id: string;
  name: string;
}

export const Assessments: React.FC = () => {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Assessment>>({
    title: '',
    date: new Date().toISOString().split('T')[0],
    weight: 10,
    class_id: '',
    subject_id: '',
    period: '1º Bimestre',
    description: ''
  });

  const [filterClass, setFilterClass] = useState('');
  const [filterSubject, setFilterSubject] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assessData, classesData, subjectsData] = await Promise.all([
        fetchAll('assessments'),
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }])
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

      setAssessments(assessData as Assessment[] || []);
      setClasses(normalizedClasses as Class[] || []);
      setSubjects(subjectsData as Subject[] || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.class_id || !formData.subject_id || !formData.title) {
      alert('Preencha os campos obrigatórios');
      return;
    }

    try {
      const dataToSave = {
        ...formData,
        created_at: formData.created_at || new Date().toISOString()
      };
      await saveRecord('assessments', editingId || undefined, dataToSave as any);
      setShowForm(false);
      setEditingId(null);
      setFormData({
        title: '',
        date: new Date().toISOString().split('T')[0],
        weight: 10,
        class_id: '',
        subject_id: '',
        period: '1º Bimestre',
        description: ''
      });
      loadData();
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  };

  const handleEdit = (assessment: Assessment) => {
    setFormData(assessment);
    setEditingId(assessment.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Deseja excluir esta avaliação?')) {
      try {
        await deleteRecord('assessments', id);
        loadData();
      } catch (error) {
        console.error('Erro ao excluir:', error);
      }
    }
  };

  const filteredAssessments = assessments.filter(a => {
    return (!filterClass || a.class_id === filterClass) &&
           (!filterSubject || a.subject_id === filterSubject);
  });

  const getClassName = (id: string) => classes.find(c => c.id === id)?.name || 'N/A';
  const getSubjectName = (id: string) => subjects.find(s => s.id === id)?.name || 'N/A';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Cadastrar Avaliações</h1>
          <p className="text-slate-500 font-medium">Gerencie as atividades e provas do período letivo</p>
        </div>
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({
              title: '',
              date: new Date().toISOString().split('T')[0],
              weight: 10,
              class_id: '',
              subject_id: '',
              period: '1º Bimestre',
              description: ''
            });
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Nova Avaliação
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative">
          <Users size={18} className="absolute left-4 top-3.5 text-slate-400" />
          <select 
            value={filterClass}
            onChange={(e) => {
              setFilterClass(e.target.value);
              setFilterSubject('');
            }}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="">Todas as Turmas</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="relative">
          <BookOpen size={18} className="absolute left-4 top-3.5 text-slate-400" />
          <select 
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none"
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

      {/* Main List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredAssessments.length > 0 ? (
          filteredAssessments.map(a => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={a.id}
              className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-blue-900/5 transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FileText size={24} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(a)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                    <Edit3 size={18} />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              <h3 className="text-lg font-black text-slate-800 mb-1">{a.title}</h3>
              <div className="flex items-center gap-2 text-blue-600 text-[10px] font-black uppercase tracking-widest mb-4">
                <span>{a.period}</span>
                <span className="w-1 h-1 rounded-full bg-blue-200"></span>
                <span>Peso: {a.weight}</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                  <Users size={14} />
                  {getClassName(a.class_id)}
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                  <BookOpen size={14} />
                  {getSubjectName(a.subject_id)}
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                  <Calendar size={14} />
                  {new Date(a.date).toLocaleDateString('pt-BR')}
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
            <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 font-bold">Nenhuma avaliação encontrada.</p>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-xl rounded-[32px] overflow-hidden shadow-2xl"
          >
            <div className="p-8 bg-blue-600 text-white">
              <h2 className="text-2xl font-black">{editingId ? 'Editar Avaliação' : 'Nova Avaliação'}</h2>
              <p className="text-blue-100 font-medium">Preencha os detalhes da atividade</p>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Título da Avaliação</label>
                  <input 
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="Ex: Prova Mensal, Trabalho de Grupo"
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Turma</label>
                  <select 
                    required
                    value={formData.class_id}
                    onChange={e => setFormData({...formData, class_id: e.target.value, subject_id: ''})}
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold"
                  >
                    <option value="">Selecione...</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Disciplina</label>
                  <select 
                    required
                    value={formData.subject_id}
                    onChange={e => setFormData({...formData, subject_id: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold"
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

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Período</label>
                  <select 
                    required
                    value={formData.period}
                    onChange={e => setFormData({...formData, period: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold"
                  >
                    <option value="1º Bimestre">1º Bimestre</option>
                    <option value="2º Bimestre">2º Bimestre</option>
                    <option value="3º Bimestre">3º Bimestre</option>
                    <option value="4º Bimestre">4º Bimestre</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Data</label>
                  <input 
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Peso (Valor)</label>
                  <input 
                    type="number"
                    step="0.1"
                    required
                    value={formData.weight}
                    onChange={e => setFormData({...formData, weight: parseFloat(e.target.value)})}
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all"
                >
                  Salvar Avaliação
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
