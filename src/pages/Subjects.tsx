import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  BookOpen,
  FileText,
  Loader2,
  Plus,
  Code
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase, fetchAll } from '../lib/supabase';

interface Subject {
  id: string;
  code: string;
  name: string;
  status: 'Ativo' | 'Inativo';
  program_content?: string;
  created_at: string;
  user_id: string;
}

export function Subjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Subject>>({});

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    setLoading(true);
    try {
      const data = await fetchAll('subjects', '*', 'name', true);
      setSubjects(data || []);
      if (data && data.length > 0 && !selectedSubject) {
        setSelectedSubject(data[0]);
        setFormData(data[0]);
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSubject = (subject: Subject) => {
    setSelectedSubject(subject);
    setFormData(subject);
    setIsEditing(false);
  };

  const handleNew = () => {
    setSelectedSubject(null);
    setFormData({
      name: '',
      code: String(subjects.length + 1).padStart(3, '0'),
      status: 'Ativo',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { id, created_at, ...saveData } = formData as any;
      const subjectData: any = { ...saveData };
      if (userData.user?.id) {
        subjectData.user_id = userData.user.id;
      }

      let error;
      if (selectedSubject) {
        const { error: updateError } = await supabase
          .from('subjects')
          .update(subjectData)
          .eq('id', selectedSubject.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('subjects')
          .insert([subjectData]);
        error = insertError;
      }

      if (error) throw error;
      
      setIsEditing(false);
      fetchSubjects();
    } catch (error) {
      console.error('Error saving subject:', error);
      alert('Erro ao salvar disciplina');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const nextTabIndex = (target.tabIndex || 0) + 1;
      const nextElement = document.querySelector(`[tabIndex="${nextTabIndex}"]`) as HTMLElement;
      if (nextElement) {
        nextElement.focus();
      }
    }
  };

  const filteredSubjects = subjects.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.includes(searchTerm);
    
    const matchesStatus = statusFilter === 'Todos' || (s.status || 'Ativo') === statusFilter || (s.status === '' && statusFilter === 'Ativo');
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Sidebar List */}
      <div className="w-72 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Disciplinas</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100">
                {subjects.length}
              </div>
              <button 
                onClick={handleNew}
                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                title="Nova Disciplina"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Buscar disciplina..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex bg-slate-50 p-1 rounded-xl">
            {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                  statusFilter === status 
                    ? "bg-white text-blue-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="animate-spin text-blue-500" />
            </div>
          ) : filteredSubjects.map((subject) => (
            <button
              key={subject.id}
              onClick={() => handleSelectSubject(subject)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
                selectedSubject?.id === subject.id 
                  ? "bg-blue-50 border-blue-100" 
                  : "hover:bg-slate-50 border-transparent"
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs relative">
                {subject.code}
                <div className={cn(
                  "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                  subject.status === 'Inativo' ? "bg-slate-300" : "bg-emerald-500"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#131b2e] truncate">{subject.name}</p>
                  <span className={cn(
                    "px-1.5 py-0.5 text-[8px] font-black rounded uppercase",
                    subject.status === 'Inativo' ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"
                  )}>
                    {subject.status || 'Ativo'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">Disciplina Acadêmica</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        {selectedSubject || isEditing ? (
          <>
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-600">
                  <BookOpen size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#131b2e]">
                    {isEditing ? (selectedSubject ? 'Editar Disciplina' : 'Nova Disciplina') : formData.name}
                  </h3>
                  <p className="text-sm text-slate-500">Código: {formData.code}</p>
                </div>
              </div>
              <div className="flex gap-3">
                {isEditing ? (
                  <>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSave}
                      className="px-6 py-2 bg-[#00174b] text-white rounded-xl text-sm font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
                    >
                      Salvar Disciplina
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2 bg-white border border-slate-200 text-[#131b2e] rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    <Edit2 size={16} />
                    Editar Cadastro
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-4xl space-y-8">
                {/* Basic Info */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Code size={14} />
                    Identificação
                  </h4>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-3 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Código</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.code || ''}
                        onChange={(e) => setFormData({...formData, code: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={1}
                      />
                    </div>
                    <div className="col-span-9 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Nome da Disciplina</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.name || ''}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={2}
                      />
                    </div>
                    <div className="col-span-12 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Situação</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.status || 'Ativo'}
                        onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={11}
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Content */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} />
                    Conteúdo Programático
                  </h4>
                  <textarea 
                    disabled={!isEditing}
                    value={formData.program_content || ''}
                    onChange={(e) => setFormData({...formData, program_content: e.target.value})}
                    onKeyDown={handleKeyDown}
                    rows={12}
                    placeholder="Descreva aqui o conteúdo programático da disciplina..."
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 resize-none"
                    tabIndex={3}
                  />
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center">
              <BookOpen size={40} />
            </div>
            <p className="text-sm font-medium">Selecione uma disciplina para ver os detalhes</p>
          </div>
        )}
      </div>
    </div>
  );
}
