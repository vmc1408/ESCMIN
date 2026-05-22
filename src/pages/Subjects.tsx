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
  AlertCircle,
  Printer,
  Filter
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  const [inst, setInst] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos' | ''>('Ativo');
  const [semesterFilter, setSemesterFilter] = useState<string>('Todos');
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'year'>('year');
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
      const [subjectsData, teachersData, instData] = await Promise.all([
        fetchAll('subjects', '*', 'name', true),
        fetchAll('teachers', 'id, name, subject_ids, status, observations', 'name', true),
        fetchAll('institution_settings')
      ]);
      
      const normalizedSubjects = (subjectsData || []).map((s: Subject) => {
        let normalized = { ...s };
        if ((!normalized.semester || !normalized.teacher_id || !normalized.year) && normalized.program_content) {
          const match = normalized.program_content.match(/\[METADATA:(\{[\s\S]*?\})\]/);
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
          const match = normalized.observations.match(/\[SUBJECTS:(\[[\s\S]*?\])\]/);
          if (match && match[1]) {
            try { sIds = JSON.parse(match[1]); } catch (e) {}
          }
        }
        normalized.subject_ids = Array.isArray(sIds) ? sIds : [];
        return normalized;
      });

      setSubjects(normalizedSubjects);
      setTeachers(normalizedTeachers);
      if (instData && instData.length > 0) setInst(instData[0]);
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
  
  const generateSubjectListPDF = async () => {
    try {
      const doc = new jsPDF();
      const margin = 15;
      const pageWidth = doc.internal.pageSize.width;

      if (inst?.logo_url) {
        try {
          doc.addImage(inst.logo_url, 'PNG', margin, 10, 20, 20);
        } catch (e) { console.error('Error adding logo', e); }
      }
      
      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.setFont('helvetica', 'bold');
      doc.text(inst?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIOS', 38, 18);
      
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      doc.text(`RELAÇÃO DE DISCIPLINAS • FILTRO: ${statusFilter.toUpperCase()}${semesterFilter !== 'Todos' ? ` • ${semesterFilter.toUpperCase()}` : ''}`, 38, 24);
      doc.text(`${inst?.city_uf || ''} • EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, 38, 29);

      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.5);
      doc.line(margin, 35, pageWidth - margin, 35);

      const tableData = filteredSubjects.map(s => {
        const teacher = teachers.find(t => t.id === s.teacher_id);
        return [
          s.code,
          s.name.toUpperCase(),
          s.year || '---',
          s.semester || '---',
          teacher?.name || '---',
          s.status || 'Ativo'
        ];
      });

      autoTable(doc, {
        startY: 40,
        head: [['CÓD.', 'NOME DA DISCIPLINA', 'ANO', 'SEM.', 'PROFESSOR', 'STATUS']],
        body: tableData,
        headStyles: { fillColor: [0, 23, 75], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: margin, right: margin }
      });

      const pages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        const footerText = `SISTEMA ESCMIN • Documento emitido em ${new Date().toLocaleString('pt-BR')} • Página ${i} de ${pages}`;
        doc.text(footerText, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
      }

      doc.autoPrint();
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
          }, 1000);
        }, 300);
      };
    } catch (error) {
      console.error('Error generating subject list PDF:', error);
      alert('Erro ao gerar relatório de disciplinas');
    }
  };

  const handleNew = () => {
    setSelectedSubject(null);
    
    // Suggest next numeric code
    const maxCode = subjects.reduce((max, s) => {
      const num = parseInt(s.code, 10);
      return !isNaN(num) ? Math.max(max, num) : max;
    }, 0);
    const nextCode = String(maxCode + 1).padStart(3, '0');

    setFormData({
      name: '',
      code: nextCode,
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
        let cleanContent = (syncData.program_content || '').replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').trim();
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
    let result = subjects.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.code.includes(searchTerm);
      
      const matchesStatus = !statusFilter || statusFilter === 'Todos' || (s.status || 'Ativo') === statusFilter;
      const matchesSemester = semesterFilter === 'Todos' || (s.semester && s.semester === semesterFilter);
      
      return matchesSearch && matchesStatus && matchesSemester;
    });

    return [...result].sort((a, b) => {
      if (sortBy === 'code') return a.code.localeCompare(b.code);
      if (sortBy === 'year') {
        const yearComp = (a.year || '').localeCompare(b.year || '');
        if (yearComp !== 0) return yearComp;
        return (a.semester || '').localeCompare(b.semester || '');
      }
      return a.name.localeCompare(b.name);
    });
  }, [subjects, searchTerm, statusFilter, sortBy]);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-2">
      {/* Sidebar List */}
      <div className="w-[432px] bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden order-last">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Disciplinas</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100 flex items-center">
                {filteredSubjects.length}
              </div>
              <button 
                onClick={generateSubjectListPDF}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-2 border border-indigo-100 shadow-sm"
                title="Imprimir Listagem Completa"
              >
                <Printer size={16} />
                <span className="text-[10px] font-black uppercase tracking-tight">Listagem</span>
              </button>
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
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Período</label>
              <select
                value={semesterFilter}
                onChange={(e) => {
                  setSemesterFilter(e.target.value);
                  setStatusFilter('');
                  setSearchTerm('');
                }}
                className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="Todos">Todos Semestres</option>
                <option value="1º Sem.">1º Semestre</option>
                <option value="2º Sem.">2º Semestre</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Situação</label>
              <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
                    className={cn(
                      "flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all",
                      statusFilter === status 
                        ? "bg-white text-blue-600 shadow-sm" 
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Ordenação</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="year">Ordenar por Ano</option>
                <option value="name">Ordenar por Nome</option>
                <option value="code">Ordenar por Código</option>
              </select>
            </div>
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
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <Printer size={16} />
                      Imprimir Ficha
                    </button>
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
                        <div className="flex bg-slate-50 p-1 rounded-xl gap-1 flex-wrap">
                          {['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((year) => (
                            <button
                              key={year}
                              type="button"
                              disabled={!isEditing}
                              onClick={() => setFormData({...formData, year})}
                              className={cn(
                                "flex-1 min-w-[60px] py-2 text-[10px] font-bold rounded-lg transition-all",
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
                          const match = (t as any).observations.match(/\[SUBJECTS:(\[[\s\S]*?\])\]/);
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
                    value={(formData.program_content || '').replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').trim()}
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

      {/* Printable Subject Record (Matches Teacher pattern) */}
      {selectedSubject && (
        <div id="printable-subject-record" className="hidden print:block text-black bg-white overflow-visible font-sans leading-tight relative w-full h-[285mm] mx-auto">
          <div className="w-full max-w-[210mm] mx-auto bg-white p-8 flex flex-col h-full">
            {/* Institutional Header */}
            <div className="flex items-center gap-6 mb-6 pb-2 border-b-2 border-black">
              <div className="flex-shrink-0 w-24 h-24 flex items-center justify-center">
                {inst?.logo_url ? (
                  <img src={inst.logo_url} className="w-full h-full object-contain max-h-24" referrerPolicy="no-referrer" alt="Logo" />
                ) : (
                  <div className="w-full h-full border-2 border-slate-200 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-300 font-black uppercase">
                    <span className="leading-none">SEM</span>
                    <span className="leading-none">LOGO</span>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col">
                <p className="text-[11pt] font-semibold tracking-widest text-slate-800 leading-tight">DIOCESE DE GUARULHOS</p>
                <h1 className="text-[19pt] font-black uppercase tracking-tight text-black leading-tight my-0.5">
                  {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                </h1>
                <p className="text-[12pt] font-bold text-slate-700 tracking-wide mt-1 uppercase">
                  {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                </p>
              </div>
            </div>

            {/* Document Title */}
            <div className="bg-black text-white py-2 px-4 mb-6 flex justify-between items-center">
              <h2 className="text-[14pt] font-black uppercase tracking-widest">FICHA DA DISCIPLINA</h2>
              <span className="text-[10pt] font-bold">CÓD: {selectedSubject.code}</span>
            </div>

            {/* Content Section */}
            <div className="space-y-6 flex-1">
              <div className="grid grid-cols-1 gap-4">
                <div className="border-b border-black/10 pb-2">
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Nome da Disciplina</p>
                  <p className="text-[12pt] font-black uppercase text-[#00174b]">{selectedSubject.name}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="border-b border-black/10 pb-2">
                    <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Ano / Semestre</p>
                    <p className="text-[11pt] font-bold">{selectedSubject.year || '---'} / {selectedSubject.semester || '---'}</p>
                  </div>
                  <div className="border-b border-black/10 pb-2">
                    <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Professor Responsável</p>
                    <p className="text-[11pt] font-bold uppercase">{teachers.find(t => t.id === selectedSubject.teacher_id)?.name || 'NÃO DEFINIDO'}</p>
                  </div>
                </div>

                <div className="border-b border-black/10 pb-2">
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Conteúdo Programático</p>
                  <div className="text-[10pt] leading-relaxed text-justify whitespace-pre-line min-h-[300px]">
                    {(selectedSubject.program_content || '').replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').trim() || 'Nenhum conteúdo descrito.'}
                  </div>
                </div>
              </div>

              {/* Signature Area */}
              <div className="mt-12 flex justify-between items-end px-4">
                <div className="space-y-1">
                  <p className="text-[10pt] font-bold text-slate-800">
                    Guarulhos, {new Date().toLocaleDateString('pt-BR')}
                  </p>
                  <p className="text-[8pt] text-slate-400 font-medium">Local e Data</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-[85mm] border-t-2 border-black mb-1"></div>
                  <p className="text-[10pt] font-black uppercase tracking-widest text-[#00174b]">Assinatura do Coordenador</p>
                  <p className="text-[7pt] text-slate-400 font-bold mt-1 tracking-tighter">Escola Diocesana de Ministérios - ESMIN</p>
                </div>
              </div>
            </div>

            {/* Institutional Footer */}
            <div className="mt-auto border-t-2 border-black pt-3 flex justify-between items-start text-[8.5pt] font-black text-black uppercase tracking-tight mb-2">
              <div className="flex-1 space-y-1">
                <p className="leading-none text-[9pt]">
                  {inst?.address}
                </p>
                {(inst?.cep || inst?.city_uf) && (
                  <p className="leading-none text-[9pt]">
                    {inst?.cep ? `CEP: ${inst.cep}` : ''} {inst?.city_uf ? ` - ${inst.city_uf}` : ''}
                  </p>
                )}
                <div className="flex items-center gap-4 leading-none font-bold text-[9pt]">
                  {inst?.phone && (
                    <span className="flex items-center gap-1.5">
                      TEL: {inst.phone}
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="#25D366" className="shrink-0">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    </span>
                  )}
                  {inst?.phone && inst?.email && <span className="opacity-30">|</span>}
                  {inst?.email && (
                    <span className="flex items-center gap-1">
                      EMAIL: <span className="lowercase font-bold">{inst.email}</span>
                    </span>
                  )}
                </div>
              </div>
              {inst?.secretary && (
                <div className="text-right max-w-[450px] leading-tight text-black font-black uppercase text-[8pt]">
                  <p className="whitespace-pre-line underline underline-offset-2 mb-1">Atendimento Secretaria:</p>
                  <p className="whitespace-pre-line lowercase font-bold text-[8.5pt]">{inst.secretary}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
