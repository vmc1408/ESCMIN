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
  Code,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { RotateCcw, FileText as FileIcon } from 'lucide-react';

interface Subject {
  id: string;
  code: string;
  name: string;
  status: 'Ativo' | 'Inativo';
  year?: string;
  semester?: string;
  teacher_id?: string;
  program_content?: string;
  created_at: string;
  user_id: string;
}

interface Teacher {
  id: string;
  name: string;
  subject_ids?: string[];
  status: string;
  observations?: string;
}

// Memoized List Item to prevent lag
const SubjectItem = React.memo(({ 
  subject, 
  isSelected, 
  onSelect, 
  className,
  teacherName
}: { 
  subject: Subject, 
  isSelected: boolean, 
  onSelect: (s: Subject) => void,
  className?: string,
  teacherName?: string
}) => {
  return (
    <button
      onClick={() => onSelect(subject)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
        isSelected 
          ? "bg-blue-50 border-blue-100" 
          : "hover:bg-slate-50 border-transparent",
        className
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
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-slate-500 truncate">
            {subject.year ? `${subject.year} • ` : ''}
            {subject.semester ? `${subject.semester} • ` : ''} 
            {teacherName || 'Sem Professor'}
          </p>
        </div>
      </div>
    </button>
  );
});

export function Subjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Subject>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchSubjects = React.useCallback(async () => {
    setLoading(true);
    try {
      const [subjectsData, teachersData] = await Promise.all([
        fetchAll('subjects', '*', 'name', true),
        fetchAll('teachers', 'id, name, subject_ids, status, observations', 'name', true)
      ]);
      
      const normalizedSubjects = (subjectsData || []).map((s: Subject) => {
        let normalized = { ...s };
        if ((!normalized.semester || !normalized.teacher_id || !normalized.year) && normalized.program_content) {
          const match = normalized.program_content.match(/\[METADATA:(.+?)\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.semester) normalized.semester = meta.semester;
              if (!normalized.teacher_id) normalized.teacher_id = meta.teacher_id;
              if (!normalized.year) normalized.year = meta.year;
            } catch (e) {
              // ignore
            }
          }
        }
        return normalized;
      });

      const normalizedTeachers = (teachersData || []).map((t: Teacher) => {
        let normalized = { ...t };
        let sIds = normalized.subject_ids || [];
        
        if (typeof sIds === 'string' && (sIds as string).startsWith('{')) {
          sIds = (sIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
        }
        
        if ((!sIds || sIds.length === 0) && normalized.observations) {
          const match = normalized.observations.match(/\[SUBJECTS:(.+?)\]/);
          if (match && match[1]) {
            try { sIds = JSON.parse(match[1]); } catch (e) {}
          }
        }
        normalized.subject_ids = Array.isArray(sIds) ? sIds : [];
        return normalized;
      });

      setSubjects(normalizedSubjects);
      setTeachers(normalizedTeachers);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const handleSelectSubject = React.useCallback((subject: Subject) => {
    setSelectedSubject(subject);
    setFormData(subject);
    setIsEditing(false);
  }, []);

  const handleNew = () => {
    setSelectedSubject(null);
    setFormData({
      name: '',
      code: String(subjects.length + 1).padStart(3, '0'),
      status: 'Ativo',
      year: '',
      semester: '',
      teacher_id: '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      // PROACTIVE METADATA SYNC:
      // Always sync year, semester and teacher_id into program_content metadata 
      // before saving. This ensures data persistence even if Supabase columns are missing.
      const syncData = { ...formData };
      const metadata: any = {};
      if (formData.year) metadata.year = formData.year;
      if (formData.semester) metadata.semester = formData.semester;
      if (formData.teacher_id) metadata.teacher_id = formData.teacher_id;
      
      if (Object.keys(metadata).length > 0) {
        const metadataStr = `[METADATA:${JSON.stringify(metadata)}]`;
        let cleanContent = (syncData.program_content || '').replace(/\[METADATA:.+?\]/, '').trim();
        syncData.program_content = (cleanContent + (cleanContent ? '\n' : '') + metadataStr).trim();
      }

      await saveData('subjects', selectedSubject?.id, syncData);
      
      setNotification({
        type: 'success',
        message: selectedSubject ? 'Disciplina atualizada com sucesso!' : 'Nova disciplina criada com sucesso!'
      });
      
      setIsEditing(false);
      await fetchSubjects();
    } catch (err: any) {
      console.error('Error saving subject:', err);
      setNotification({
        type: 'error',
        message: 'Erro ao salvar disciplina: ' + err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = React.useCallback(async () => {
    if (!selectedSubject?.id) return;

    try {
      setLoading(true);
      await deleteData('subjects', selectedSubject.id);
      
      setSelectedSubject(null);
      setFormData({});
      setIsEditing(false);
      setShowDeleteConfirm(false);
      fetchSubjects();
    } catch (error: any) {
      console.error('Error deleting subject:', error);
      alert('Erro ao excluir disciplina: ' + error.message);
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  }, [selectedSubject, fetchSubjects]);

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

  const filteredSubjects = React.useMemo(() => {
    return subjects.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.code.includes(searchTerm);
      
      const matchesStatus = statusFilter === 'Todos' || (s.status || 'Ativo') === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [subjects, searchTerm, statusFilter]);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-2">
      {/* Sidebar List */}
      <div className="w-[432px] bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden order-last">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Disciplinas</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100">
                {filteredSubjects.length}
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
          ) : filteredSubjects.map((subject) => {
            const teacher = teachers.find(t => t.id === subject.teacher_id);
            return (
              <SubjectItem
                key={subject.id}
                subject={subject}
                isSelected={selectedSubject?.id === subject.id}
                onSelect={handleSelectSubject}
                teacherName={teacher?.name}
              />
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        {notification && (
          <div className={cn(
            "fixed top-6 right-6 z-[60] px-6 py-4 rounded-2xl shadow-2xl border text-sm font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-4",
            notification.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-red-50 border-red-100 text-red-600"
          )}>
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center",
              notification.type === 'success' ? "bg-emerald-100" : "bg-red-100"
            )}>
              {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </div>
            {notification.message}
          </div>
        )}

        {selectedSubject || isEditing ? (
          <>
            <div className="p-4 border-b border-slate-50 bg-slate-50/50">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-600">
                  <BookOpen size={32} />
                </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#131b2e]">
                      {isEditing ? (selectedSubject ? 'Editar Disciplina' : 'Nova Disciplina') : formData.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                      <span>Código: {formData.code}</span>
                      {formData.year && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-blue-700 font-bold">{formData.year}</span>
                        </>
                      )}
                      {formData.semester && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-blue-600 font-bold">{formData.semester}</span>
                        </>
                      )}
                      {formData.teacher_id && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-slate-600">Prof: {teachers.find(t => t.id === formData.teacher_id)?.name}</span>
                        </>
                      )}
                    </div>
                  </div>
              </div>
              <div className="flex gap-3">
                {!isEditing && selectedSubject && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer flex items-center justify-center group"
                    title="Excluir Disciplina"
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
                      Salvar Disciplina
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
                    <Code size={14} />
                    Identificação
                  </h4>
                  <div className="grid grid-cols-12 gap-3">
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
                    <div className="col-span-12 grid grid-cols-12 gap-3 pt-2">
                      <div className="col-span-8 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Ano</label>
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
                          {['1º Sem.', '2º Sem.'].map((sem) => (
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
                              {sem}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-8 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Professor Responsável</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.teacher_id || ''}
                        onChange={(e) => setFormData({...formData, teacher_id: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={4}
                      >
                        <option value="">Selecione um professor</option>
                        {teachers
                          .filter(t => {
                            // Only show teachers who have this subject in their registration
                            if (!selectedSubject?.id) return true;
                            
                            let sIds = t.subject_ids || [];
                            if (typeof sIds === 'string' && (sIds as string).startsWith('{')) {
                              sIds = (sIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
                            }

                            // Fallback: check metadata in observations
                            if ((!sIds || sIds.length === 0) && (t as any).observations) {
                              const match = (t as any).observations.match(/\[SUBJECTS:(.+?)\]/);
                              if (match && match[1]) {
                                try {
                                  sIds = JSON.parse(match[1]);
                                } catch (e) {
                                  console.warn('Failed to parse metadata');
                                }
                              }
                            }
                            
                            return Array.isArray(sIds) && sIds.includes(selectedSubject.id);
                          })
                          .map(teacher => (
                            <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                          ))
                        }
                      </select>
                      {selectedSubject?.id && teachers.filter(t => {
                        let sIds = t.subject_ids || [];
                        if (typeof sIds === 'string' && (sIds as string).startsWith('{')) {
                           sIds = (sIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
                        }
                        // Fallback: check metadata in observations
                        if ((!sIds || sIds.length === 0) && (t as any).observations) {
                          const match = (t as any).observations.match(/\[SUBJECTS:(.+?)\]/);
                          if (match && match[1]) {
                            try {
                              sIds = JSON.parse(match[1]);
                            } catch (e) {
                              // ignore
                            }
                          }
                        }
                        return Array.isArray(sIds) && sIds.includes(selectedSubject.id);
                      }).length === 0 && (
                        <p className="text-[10px] text-amber-600 font-medium mt-1">Nenhum professor habilitado para esta disciplina.</p>
                      )}
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
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} />
                    Conteúdo Programático
                  </h4>
                  <textarea 
                    disabled={!isEditing}
                    value={(formData.program_content || '').replace(/\[METADATA:.+?\]/, '').trim()}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedSubject && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={32} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-[#131b2e]">Excluir Disciplina?</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Tem certeza que deseja excluir a disciplina <span className="font-bold text-slate-900">{selectedSubject.name}</span>? 
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
