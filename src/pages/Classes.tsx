import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  School,
  Users,
  Calendar,
  Clock,
  FileText,
  Loader2,
  Plus,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase, fetchAll } from '../lib/supabase';

interface Class {
  id: string;
  code: string;
  name: string;
  room?: string;
  status: 'Ativo' | 'Inativo';
  days_of_week: string[];
  semester: string;
  period: 'Manhã' | 'Tarde' | 'Noite';
  observations?: string;
  created_at: string;
  user_id: string;
}

const DAYS = [
  { label: 'Segunda', value: 'Segunda' },
  { label: 'Terça', value: 'Terça' },
  { label: 'Quarta', value: 'Quarta' },
  { label: 'Quinta', value: 'Quinta' },
  { label: 'Sexta', value: 'Sexta' },
  { label: 'Sábado', value: 'Sábado' },
  { label: 'Domingo', value: 'Domingo' },
];

const SEMESTERS = ['1º Semestre', '2º Semestre', '3º Semestre', '4º Semestre'];

export function Classes() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Class>>({
    status: 'Ativo',
    days_of_week: [],
    period: 'Tarde'
  });

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const data = await fetchAll('classes', '*', 'name', true);
      setClasses(data || []);
      if (data && data.length > 0 && !selectedClass) {
        setSelectedClass(data[0]);
        setFormData(data[0]);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClass = (cls: Class) => {
    setSelectedClass(cls);
    setFormData(cls);
    setIsEditing(false);
  };

  const handleNew = () => {
    setSelectedClass(null);
    setFormData({
      name: '',
      code: '',
      status: 'Ativo',
      days_of_week: [],
      period: 'Tarde'
    });
    setIsEditing(true);
  };

  const toggleDay = (day: string) => {
    if (!isEditing) return;
    const current = formData.days_of_week || [];
    if (current.includes(day)) {
      setFormData({ ...formData, days_of_week: current.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, days_of_week: [...current, day] });
    }
  };

  const handleSave = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { id, created_at, ...saveData } = formData as any;
      const classData: any = { ...saveData };
      if (userData.user?.id) {
        classData.user_id = userData.user.id;
      }

      let error;
      if (selectedClass) {
        const { error: updateError } = await supabase
          .from('classes')
          .update(classData)
          .eq('id', selectedClass.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('classes')
          .insert([classData]);
        error = insertError;
      }

      if (error) throw error;
      
      setIsEditing(false);
      fetchClasses();
    } catch (error) {
      console.error('Error saving class:', error);
      alert('Erro ao salvar turma');
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

  const filteredClasses = classes.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'Todos' || (c.status || 'Ativo') === statusFilter || (c.status === '' && statusFilter === 'Ativo');
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Sidebar List */}
      <div className="w-72 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Turmas</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100">
                {classes.length}
              </div>
              <button 
                onClick={handleNew}
                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                title="Nova Turma"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Buscar turma..."
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
          ) : filteredClasses.map((cls) => (
            <button
              key={cls.id}
              onClick={() => handleSelectClass(cls)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
                selectedClass?.id === cls.id 
                  ? "bg-blue-50 border-blue-100" 
                  : "hover:bg-slate-50 border-transparent"
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[10px] relative">
                {cls.code}
                <div className={cn(
                  "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                  cls.status === 'Inativo' ? "bg-slate-300" : "bg-emerald-500"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#131b2e] truncate">{cls.name}</p>
                  <span className={cn(
                    "px-1.5 py-0.5 text-[8px] font-black rounded uppercase",
                    cls.status === 'Inativo' ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"
                  )}>
                    {cls.status || 'Ativo'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">{cls.period} • {cls.semester}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        {selectedClass || isEditing ? (
          <>
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-600">
                  <School size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#131b2e]">
                    {isEditing ? (selectedClass ? 'Editar Turma' : 'Nova Turma') : formData.name}
                  </h3>
                  <p className="text-sm text-slate-500">Turma: {formData.code}</p>
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
                      Salvar Turma
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
                    <School size={14} />
                    Informações da Turma
                  </h4>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-3 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Turma (Código)</label>
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
                    <div className="col-span-6 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Nome do Curso</label>
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
                    <div className="col-span-3 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Sala</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.room || ''}
                        onChange={(e) => setFormData({...formData, room: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={3}
                      />
                    </div>
                    <div className="col-span-4 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Situação</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.status || 'Ativo'}
                        onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={4}
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </div>
                    <div className="col-span-4 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Semestre</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.semester || ''}
                        onChange={(e) => setFormData({...formData, semester: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={5}
                      >
                        <option value="">Selecione...</option>
                        {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Período</label>
                      <div className="flex gap-2">
                        {['Manhã', 'Tarde', 'Noite'].map(p => (
                          <button
                            key={p}
                            disabled={!isEditing}
                            onClick={() => setFormData({...formData, period: p as any})}
                            className={cn(
                              "flex-1 py-2 rounded-xl text-xs font-bold transition-all",
                              formData.period === p 
                                ? "bg-blue-600 text-white shadow-md" 
                                : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Days of Week */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} />
                    Dias da Semana
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        disabled={!isEditing}
                        onClick={() => toggleDay(day.value)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border",
                          formData.days_of_week?.includes(day.value)
                            ? "bg-blue-50 border-blue-200 text-blue-700"
                            : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                      >
                        {formData.days_of_week?.includes(day.value) && <CheckCircle2 size={14} />}
                        {day.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Additional Info */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} />
                    Observações
                  </h4>
                  <textarea 
                    disabled={!isEditing}
                    value={formData.observations || ''}
                    onChange={(e) => setFormData({...formData, observations: e.target.value})}
                    onKeyDown={handleKeyDown}
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 resize-none"
                    tabIndex={6}
                  />
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center">
              <School size={40} />
            </div>
            <p className="text-sm font-medium">Selecione uma turma para ver os detalhes</p>
          </div>
        )}
      </div>
    </div>
  );
}
