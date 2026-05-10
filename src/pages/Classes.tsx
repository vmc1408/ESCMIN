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
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { RotateCcw, FileText as FileIcon } from 'lucide-react';

interface Class {
  id: string;
  code: string;
  name: string;
  room?: string;
  status: 'Ativo' | 'Inativo';
  days_of_week: string[];
  year?: string;
  semester: string;
  subject_ids?: string[];
  start_date?: string;
  period: 'Manhã' | 'Tarde' | 'Noite';
  observations?: string;
  created_at: string;
  user_id: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
  year?: string;
  semester?: string;
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

const formatToISODate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  if (dateStr.includes('T')) return dateStr.split('T')[0];
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return dateStr;
};

// Memoized List Item to prevent lag
const ClassItem = React.memo(({ 
  cls, 
  isSelected, 
  onSelect, 
  subjects,
  className 
}: { 
  cls: Class, 
  isSelected: boolean, 
  onSelect: (c: Class) => void,
  subjects: Subject[],
  className?: string
}) => {
  return (
    <button
      onClick={() => onSelect(cls)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
        isSelected 
          ? "bg-blue-50 border-blue-100" 
          : "hover:bg-slate-50 border-transparent",
        className
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="font-medium">{cls.period}</span>
          <span className="text-slate-300">•</span>
          <span className="font-medium">{cls.year}</span>
          <span className="text-slate-300">•</span>
          <span className="font-medium">{cls.semester}</span>
        </div>
        {cls.subject_ids && cls.subject_ids.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cls.subject_ids.map(sid => {
              const subject = subjects.find(s => s.id === sid);
              if (!subject) return null;
              return (
                <span key={sid} className="bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100 text-[9px] font-bold">
                  {subject.name}
                </span>
              );
            })}
          </div>
        )}
        {cls.start_date && (
            <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-100 text-[10px] font-black uppercase">
              <Calendar size={10} />
              Início: {cls.start_date.includes('T') ? cls.start_date.split('T')[0].split('-').reverse().join('/') : 
                      cls.start_date.includes('-') ? cls.start_date.split('-').reverse().join('/') : 
                      cls.start_date}
            </div>
          )}
      </div>
    </button>
  );
});

export function Classes() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [formData, setFormData] = useState<Partial<Class>>({
    status: 'Ativo',
    days_of_week: [],
    period: 'Tarde',
    year: '1º Ano',
    semester: '1º Semestre',
    start_date: ''
  });

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchClasses = React.useCallback(async () => {
    setLoading(true);
    try {
      const [classesData, subjectsData] = await Promise.all([
        fetchAll('classes', '*', 'name', true),
        fetchAll('subjects', 'id, name, code, year, semester, program_content', 'name', true)
      ]);
      
      const normalizedSubjects = (subjectsData || []).map((s: any) => {
        let normalized = { ...s };
        if ((!normalized.year || !normalized.semester) && normalized.program_content) {
          const match = normalized.program_content.match(/\[METADATA:(.+?)\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.year) normalized.year = meta.year;
              if (!normalized.semester) normalized.semester = meta.semester;
            } catch (e) {}
          }
        }
        return normalized;
      });

      const normalizedClasses = (classesData || []).map((cls: Class) => {
        let normalized = { ...cls };
        
        // Normalize subject_ids (could be single ID from subject_id column or JSON string, or array)
        let sIds: string[] = [];
        if (Array.isArray((normalized as any).subject_ids)) {
          sIds = (normalized as any).subject_ids;
        } else if (typeof (normalized as any).subject_ids === 'string') {
          try {
            const parsed = JSON.parse((normalized as any).subject_ids);
            sIds = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e) {
            sIds = (normalized as any).subject_ids ? [(normalized as any).subject_ids] : [];
          }
        } else if ((normalized as any).subject_id) {
          sIds = [(normalized as any).subject_id];
        }

        if ((!normalized.year || !normalized.semester || sIds.length === 0) && normalized.observations) {
          const match = normalized.observations.match(/\[METADATA:(.+?)\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.year) normalized.year = meta.year;
              if (!normalized.semester) normalized.semester = meta.semester || meta.semester_id;
              if (sIds.length === 0 && (meta.subject_ids || meta.subject_id)) {
                sIds = meta.subject_ids || [meta.subject_id];
              }
            } catch (e) {}
          }
        }
        normalized.subject_ids = sIds;
        return normalized;
      });

      setClasses(normalizedClasses);
      setSubjects(normalizedSubjects);
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleSelectClass = React.useCallback((cls: Class) => {
    setSelectedClass(cls);
    setFormData({
      ...cls,
      start_date: formatDateForDisplay(cls.start_date)
    });
    setIsEditing(false);
  }, []);

  const handleNew = () => {
    setSelectedClass(null);
    setFormData({
      name: '',
      code: '',
      status: 'Ativo',
      days_of_week: [],
      period: 'Tarde',
      year: '1º Ano',
      start_date: '',
      semester: '1º Semestre',
      subject_ids: []
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
      setLoading(true);
      
      const syncData = {
        ...formData,
        start_date: parseDateToDB(formData.start_date)
      };

      // PROACTIVE METADATA SYNC:
      // Always sync year, semester and subject_ids into observations metadata 
      // before saving. This ensures data persistence even if Supabase columns are missing.
      const metadata: any = {};
      if (formData.year) metadata.year = formData.year;
      if (formData.semester) metadata.semester = formData.semester;
      if (formData.subject_ids) metadata.subject_ids = formData.subject_ids;
      
      if (Object.keys(metadata).length > 0) {
        const metadataStr = `[METADATA:${JSON.stringify(metadata)}]`;
        let cleanObs = (syncData.observations || '').replace(/\[METADATA:.+?\]/, '').trim();
        syncData.observations = (cleanObs + (cleanObs ? '\n' : '') + metadataStr).trim();
      }

      const savedId = await saveData('classes', selectedClass?.id, syncData);
      
      setIsEditing(false);
      // Wait for refresh
      await fetchClasses();
      
      // Update local state with the saved data to ensure UI sync
      const updatedData = { ...syncData, id: savedId } as Class;
      setSelectedClass(updatedData);
      setFormData(updatedData);
      
      setNotification({ type: 'success', message: 'Turma salva com sucesso!' });
    } catch (error: any) {
      console.error('Error saving class:', error);
      alert('Erro ao salvar turma: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = React.useCallback(async () => {
    if (!selectedClass?.id) return;

    try {
      setLoading(true);
      await deleteData('classes', selectedClass.id);
      
      setSelectedClass(null);
      setFormData({
        status: 'Ativo',
        days_of_week: [],
        period: 'Tarde'
      });
      setIsEditing(false);
      setShowDeleteConfirm(false);
      fetchClasses();
    } catch (error: any) {
      console.error('Error deleting class:', error);
      alert('Erro ao excluir turma: ' + error.message);
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, fetchClasses]);

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

  const filteredClasses = React.useMemo(() => {
    return classes.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'Todos' || (c.status || 'Ativo') === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [classes, searchTerm, statusFilter]);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-2">
      {/* Sidebar List */}
      <div className="w-[432px] bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden order-last">
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
            <ClassItem
              key={cls.id}
              cls={cls}
              subjects={subjects}
              isSelected={selectedClass?.id === cls.id}
              onSelect={handleSelectClass}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        {selectedClass || isEditing ? (
          <>
            {notification && (
              <div className={cn(
                "fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-3",
                notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
              )}>
                {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <p className="text-sm font-bold">{notification.message}</p>
              </div>
            )}
            <div className="p-4 border-b border-slate-50 bg-slate-50/50">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
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
                {!isEditing && selectedClass && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer flex items-center justify-center group"
                    title="Excluir Turma"
                  >
                    <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                  </button>
                )}
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
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="px-6 py-2 bg-white border border-slate-200 text-[#131b2e] rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                      <Edit2 size={16} />
                      Editar Cadastro
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-4xl mx-auto space-y-4">
                {/* Basic Info */}
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <School size={14} />
                    Informações da Turma
                  </h4>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 grid grid-cols-12 gap-3 pb-2">
                       <div className="col-span-8 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Ano Letivo</label>
                        <div className="flex bg-slate-50 p-1 rounded-xl gap-1">
                          {['1º Ano', '2º Ano', '3º Ano', '4º Ano'].map((year) => (
                            <button
                              key={year}
                              type="button"
                              disabled={!isEditing}
                              onClick={() => setFormData({...formData, year})}
                              className={cn(
                                "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all",
                                formData.year === year 
                                  ? "bg-white text-blue-600 shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700 disabled:opacity-50"
                              )}
                            >
                              {year}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Semestre</label>
                        <div className="flex bg-slate-50 p-1 rounded-xl gap-1">
                          {['1º Semestre', '2º Semestre'].map((sem) => (
                            <button
                              key={sem}
                              type="button"
                              disabled={!isEditing}
                              onClick={() => setFormData({...formData, semester: sem})}
                              className={cn(
                                "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all",
                                formData.semester === sem 
                                  ? "bg-white text-blue-600 shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700 disabled:opacity-50"
                              )}
                            >
                              {sem === '1º Semestre' ? '1º Sem.' : '2º Sem.'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 space-y-2">
                      <label className="text-xs font-bold text-slate-700">Disciplinas (Até 2 por Semestre)</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[0, 1].map((index) => (
                          <select 
                            key={index}
                            disabled={!isEditing}
                            value={formData.subject_ids?.[index] || ''}
                            onChange={(e) => {
                              const newIds = [...(formData.subject_ids || [])];
                              newIds[index] = e.target.value;
                              setFormData({...formData, subject_ids: newIds.filter(Boolean)});
                            }}
                            className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          >
                            <option value="">{index === 0 ? '1ª Disciplina...' : '2ª Disciplina (Opcional)...'}</option>
                            {subjects
                              .filter(s => {
                                const sSem = s.semester?.includes('1º') ? '1º Semestre' : s.semester?.includes('2º') ? '2º Semestre' : s.semester;
                                const matchesYear = !formData.year || !s.year || s.year === formData.year;
                                const matchesSemester = !formData.semester || !sSem || sSem === formData.semester;
                                return matchesYear && matchesSemester;
                              })
                              .map(subject => (
                                <option 
                                  key={subject.id} 
                                  value={subject.id}
                                  disabled={formData.subject_ids?.includes(subject.id) && formData.subject_ids[index] !== subject.id}
                                >
                                  [{subject.code}] {subject.name}
                                </option>
                              ))}
                          </select>
                        ))}
                      </div>
                      {subjects.filter(s => {
                        const sSem = s.semester?.includes('1º') ? '1º Semestre' : s.semester?.includes('2º') ? '2º Semestre' : s.semester;
                        const matchesYear = !formData.year || !s.year || s.year === formData.year;
                        const matchesSemester = !formData.semester || !sSem || sSem === formData.semester;
                        return matchesYear && matchesSemester;
                      }).length === 0 && (
                        <p className="text-[10px] text-amber-600 font-medium mt-1">Nenhuma disciplina cadastrada para este Ano/Semestre.</p>
                      )}
                    </div>

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
                      <label className="text-xs font-bold text-slate-700">Data de Início</label>
                      <input 
                        type="text"
                        placeholder="DD/MM/AAAA"
                        disabled={!isEditing}
                        value={formData.start_date || ''}
                        onChange={(e) => setFormData({...formData, start_date: maskDate(e.target.value)})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={5}
                      />
                    </div>
                    {/* Semester and Period below */}
                    <div className="col-span-4 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Período</label>
                      <div className="flex gap-2">
                        {['Manhã', 'Tarde', 'Noite'].map(p => (
                          <button
                            key={p}
                            disabled={!isEditing}
                            onClick={() => setFormData({...formData, period: p as any})}
                            className={cn(
                              "flex-1 py-1.5 rounded-xl text-xs font-bold transition-all",
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
                <section className="space-y-3">
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
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} />
                    Observações
                  </h4>
                  <textarea 
                    disabled={!isEditing}
                    value={(formData.observations || '').replace(/\[METADATA:.+?\]/, '').trim()}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedClass && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={32} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-[#131b2e]">Excluir Turma?</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Tem certeza que deseja excluir a turma <span className="font-bold text-slate-900">{selectedClass.name}</span>? 
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
              >
                {loading ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
