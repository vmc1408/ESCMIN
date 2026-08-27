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
  Filter,
  Users,
  ArrowLeft
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
  workload?: string | number;
  teacher_id?: string;
  program_content?: string;
  created_at: string;
  user_id: string;
}

interface Teacher {
  id: string;
  code?: string;
  name: string;
  subject_ids?: string[];
  status: string;
  observations?: string;
  photo_url?: string;
  email?: string;
  phone_mobile?: string;
}

// Memoized List Item to prevent lag
const SubjectItem = React.memo(({ 
  subject, 
  isSelected, 
  onSelect, 
  className,
  teacherName,
  qualifiedCount
}: { 
  subject: Subject, 
  isSelected: boolean, 
  onSelect: (s: Subject) => void,
  className?: string,
  teacherName?: string,
  qualifiedCount?: number
}) => {
  return (
    <button
      onClick={() => onSelect(subject)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-none transition-all text-left",
        isSelected 
          ? "bg-slate-50 border-slate-200" 
          : "hover:bg-slate-50 border-transparent",
        className
      )}
    >
      <div className="w-10 h-10 rounded-none bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs relative">
        {subject.code}
        <div className={cn(
          "absolute -top-1 -right-1 w-3 h-3 rounded-none border-2 border-white",
          subject.status === 'Inativo' ? "bg-slate-300" : "bg-emerald-500"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-[#131b2e] truncate">{subject.name}</p>
          <span className={cn(
            "px-1.5 py-0.5 text-[8px] font-bold rounded uppercase",
            subject.status === 'Inativo' ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"
          )}>
            {subject.status || 'Ativo'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-slate-500 truncate">
            {subject.year ? `${subject.year} • ` : ''}
            {subject.semester ? `${subject.semester} • ` : ''} 
            {teacherName 
              ? `Prof: ${teacherName}` 
              : (qualifiedCount && qualifiedCount > 0 
                  ? `${qualifiedCount} prof. habilitado${qualifiedCount > 1 ? 's' : ''}` 
                  : 'Sem Professor')}
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
  const [hoverShowList, setHoverShowList] = useState(false);
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
        fetchAll('teachers', '*', 'name', true),
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
        if (normalized.year) {
          const yrStr = String(normalized.year).toLowerCase();
          if (yrStr.includes('5º') || yrStr.includes('5°') || yrStr.includes('5 ano') || yrStr.includes('5ª') || yrStr.includes('5a') || yrStr.includes('5th')) {
            normalized.year = 'Curso Extra';
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

      // Deduplica disciplinas e professores por ID para garantir chaves únicas
      const seenSubIds = new Set<string>();
      const uniqueSubjects: Subject[] = [];
      for (const s of normalizedSubjects) {
        const idStr = String(s.id || s.code || '');
        if (idStr && !seenSubIds.has(idStr)) {
          seenSubIds.add(idStr);
          uniqueSubjects.push(s);
        } else if (!idStr) {
          uniqueSubjects.push(s);
        }
      }

      const seenTeachIds = new Set<string>();
      const uniqueTeachers: Teacher[] = [];
      for (const t of normalizedTeachers) {
        const idStr = String(t.id || '');
        if (idStr && !seenTeachIds.has(idStr)) {
          seenTeachIds.add(idStr);
          uniqueTeachers.push(t);
        } else if (!idStr) {
          uniqueTeachers.push(t);
        }
      }

      setSubjects(uniqueSubjects);
      setTeachers(uniqueTeachers);
      if (instData && instData.length > 0) setInst(instData[0]);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const getQualifiedTeachers = React.useCallback((subjectId?: string) => {
    if (!subjectId) return [];
    return teachers.filter(t => {
      let sIds = t.subject_ids || [];
      if (typeof sIds === 'string' && (sIds as string).startsWith('{')) {
        sIds = (sIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
      }
      if ((!sIds || sIds.length === 0) && t.observations) {
        const match = t.observations.match(/\[SUBJECTS:(\[[\s\S]*?\])\]/);
        if (match && match[1]) {
          try { sIds = JSON.parse(match[1]); } catch (e) {}
        }
      }
      return Array.isArray(sIds) && sIds.includes(subjectId);
    });
  }, [teachers]);

  const currentSubjectId = selectedSubject?.id || formData.id;
  const qualifiedTeachers = getQualifiedTeachers(currentSubjectId);
  const otherTeachers = teachers.filter(t => !qualifiedTeachers.some(qt => qt.id === t.id));

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const handleSelectSubject = React.useCallback((subject: Subject) => {
    setSelectedSubject(subject);
    setFormData(subject);
    setIsEditing(false);
    setHoverShowList(false);
  }, []);
  
  const generateSubjectListPDF = async () => {
    try {
      const doc = new jsPDF();
      const margin = 15;
      const pageWidth = doc.internal.pageSize.width;

      // Header - Institution info ONLY above divider
      if (inst?.logo_url) {
        try {
          doc.addImage(inst.logo_url, 'PNG', margin, 10, 20, 20);
        } catch (e) { console.error('Error adding logo', e); }
      }
      
      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.setFont('helvetica', 'bold');
      doc.text(inst?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIOS', 38, 18);
      
      doc.setFontSize(8.5);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      const instInfo = [inst?.address, inst?.city_uf, inst?.phone ? `TEL: ${inst.phone}` : ''].filter(Boolean).join(' • ');
      doc.text(instInfo || 'GUARULHOS/SP', 38, 24);

      // Divider line
      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.5);
      doc.line(margin, 32, pageWidth - margin, 32);

      // Below the line: Report title & selected filters
      doc.setFontSize(11);
      doc.setTextColor(0, 23, 75);
      doc.setFont('helvetica', 'bold');
      doc.text('RELAÇÃO DE DISCIPLINAS', margin, 40);

      doc.setFontSize(8);
      doc.setTextColor(80);
      doc.setFont('helvetica', 'normal');
      const filterLabels = [`FILTRO: ${statusFilter.toUpperCase()}`];
      if (semesterFilter !== 'Todos') {
        filterLabels.push(`SEMESTRE: ${semesterFilter.toUpperCase()}`);
      } else {
        filterLabels.push('SEMESTRE: TODOS');
      }
      doc.text(filterLabels.join(' • '), margin, 45);
      doc.text(`EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, 45, { align: 'right' });

      const tableData = filteredSubjects.map(s => {
        const teacher = teachers.find(t => t.id === s.teacher_id);
        const qualCount = getQualifiedTeachers(s.id).length;
        const teacherText = teacher 
          ? teacher.name.toUpperCase() 
          : (qualCount > 0 ? `SEM RESP. (${qualCount} HAB.)` : 'SEM PROFESSOR');

        return [
          s.code,
          s.name.toUpperCase(),
          s.year || '---',
          s.semester || '---',
          teacherText,
          s.status || 'Ativo'
        ];
      });

      autoTable(doc, {
        startY: 50,
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
          try {
            if (!iframe.contentWindow) {
              throw new Error("No contentWindow available");
            }

            const cleanup = () => {
              try {
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
              } catch (e) {}
              URL.revokeObjectURL(url);
            };

            try {
              iframe.contentWindow.addEventListener('afterprint', cleanup);
            } catch (e) {
              console.warn("Could not add afterprint listener on Subjects iframe:", e);
              setTimeout(cleanup, 15000);
            }
            try {
              iframe.contentWindow.print();
            } catch (e) {
              console.warn("Print call failed on Subjects iframe, triggering fallback:", e);
              throw e;
            }

            // Long fallback to clean up iframe in case afterprint doesn't trigger
            setTimeout(cleanup, 300000);
          } catch (err) {
            console.warn("Iframe printing blocked, downloading PDF instead:", err);
            doc.save(`Lista_Disciplinas_${new Date().getFullYear()}.pdf`);
            setNotification({
              type: 'success',
              message: 'A impressão direta em iframe foi bloqueada pelo navegador. O arquivo PDF foi baixado para você imprimir manualmente.'
            });
            try {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            } catch (e) {}
            URL.revokeObjectURL(url);
          }
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
    setHoverShowList(false);
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
        // Clean up existing metadata and any orphaned closing brackets
        let cleanContent = (syncData.program_content || '')
          .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
          .replace(/\}\]$/g, '') // Remove orphaned trailing bracket if any
          .trim();
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

  const actualListCollapsed = selectedSubject !== null || isEditing;

  return (
    <>
      <div className={cn(
        "print:hidden h-auto lg:h-[calc(100vh-5.5rem)] min-h-[calc(100vh-5.5rem)] lg:min-h-0 relative flex flex-col lg:flex-row gap-3 sm:gap-4 w-full transition-all duration-300",
        actualListCollapsed ? "justify-center" : "justify-start"
      )}>
      {/* Green Hover Sensor / Marker */}
      {actualListCollapsed && !hoverShowList && (
        <div 
          onMouseEnter={() => setHoverShowList(true)}
          onClick={() => setHoverShowList(true)}
          className="absolute right-0 top-1/4 h-1/2 w-3 bg-emerald-500 hover:bg-emerald-600 cursor-pointer rounded-l-md shadow-md transition-all duration-200 flex flex-col justify-center items-center group z-[45]"
          title="Aproxime o mouse para ver a Lista de Disciplinas"
        >
          {/* Subtle glowing accent */}
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          
          {/* Hover instruction tooltip */}
          <div className="absolute right-4 bg-slate-900 border border-slate-800 text-emerald-400 font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded-none shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            ➔ Lista de Disciplinas <span className="text-slate-300">(Passe o mouse)</span>
          </div>
        </div>
      )}

      {/* Sidebar/Full List */}
      <div 
        onMouseLeave={() => {
          if (actualListCollapsed) {
            setHoverShowList(false);
          }
        }}
        className={cn(
          "bg-white rounded-none shadow-sm flex flex-col order-last transition-all duration-300 ease-in-out border border-slate-200 overflow-hidden shrink-0",
          actualListCollapsed 
            ? (hoverShowList 
                ? "absolute right-0 top-0 bottom-0 h-full z-50 w-full sm:w-[432px] opacity-100 shadow-2xl border-l border-slate-200" 
                : "w-0 opacity-0 border-0 pointer-events-none overflow-hidden hidden"
              )
            : "w-full lg:w-[380px] xl:w-[432px] opacity-100 h-full"
        )}
      >
        <div className="flex-[1] flex flex-col overflow-hidden w-full">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Disciplinas</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-slate-50 text-slate-900 text-[10px] font-bold rounded-none border border-slate-200 flex items-center">
                {filteredSubjects.length}
              </div>
              <button 
                onClick={generateSubjectListPDF}
                className="px-3 py-1.5 bg-slate-50 text-slate-800 rounded-none hover:bg-slate-100 transition-all flex items-center gap-2 border border-slate-200 shadow-sm"
                title="Imprimir Listagem Completa"
              >
                <Printer size={16} />
                <span className="text-[10px] font-bold uppercase tracking-tight">Listagem</span>
              </button>
              <button 
                onClick={handleNew}
                className="p-1.5 bg-slate-50 text-slate-800 rounded-none hover:bg-slate-100 transition-colors"
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
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-none text-sm focus:ring-2 focus:ring-slate-500/10"
            />
          </div>
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 ml-1">Período</label>
              <select
                value={semesterFilter}
                onChange={(e) => {
                  setSemesterFilter(e.target.value);
                  setStatusFilter('');
                  setSearchTerm('');
                }}
                className="w-full px-3 py-2 bg-slate-50 border-none rounded-none text-[10px] font-bold uppercase tracking-widest text-slate-600 focus:ring-2 focus:ring-slate-500/10"
              >
                <option value="Todos">Todos Semestres</option>
                <option value="1º Sem.">1º Semestre</option>
                <option value="2º Sem.">2º Semestre</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 ml-1">Situação</label>
              <div className="flex bg-slate-50 p-1 rounded-none border border-slate-100">
                {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
                    className={cn(
                      "flex-1 py-1.5 text-[9px] font-bold uppercase rounded-none transition-all",
                      statusFilter === status 
                        ? "bg-white text-slate-800 shadow-sm" 
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 ml-1">Ordenação</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border-none rounded-none text-[10px] font-bold uppercase tracking-widest text-slate-600 focus:ring-2 focus:ring-slate-500/10"
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
              <Loader2 className="animate-spin text-slate-705" />
            </div>
          ) : filteredSubjects.map((subject, sIdx) => {
            const teacher = teachers.find(t => t.id === subject.teacher_id);
            const qualCount = getQualifiedTeachers(subject.id).length;
            return (
              <SubjectItem
                key={`sub-item-${subject.id || subject.code || sIdx}-${sIdx}`}
                subject={subject}
                isSelected={selectedSubject?.id === subject.id}
                onSelect={handleSelectSubject}
                teacherName={teacher?.name}
                qualifiedCount={qualCount}
              />
            );
          })}
        </div>
      </div>
    </div>

      {/* Main Content */}
      <div className={cn(
        "bg-white rounded-none shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 min-w-0 h-full flex-1",
        actualListCollapsed ? "max-w-5xl mx-auto w-full" : "w-full"
      )}>
        {notification && (
          <div className={cn(
            "fixed top-6 right-6 z-[60] px-6 py-4 rounded-none shadow-2xl border text-sm font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-4",
            notification.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-red-50 border-red-100 text-red-600"
          )}>
            <div className={cn(
              "w-8 h-8 rounded-none flex items-center justify-center",
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
              <button
                type="button"
                onClick={() => {
                  setSelectedSubject(null);
                  setIsEditing(false);
                }}
                className="lg:hidden mb-3 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft size={14} />
                <span>Ver Lista Completa de Disciplinas</span>
              </button>
              <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-none bg-white shadow-sm flex items-center justify-center text-slate-800">
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
                          <span className="text-slate-900 font-bold">{formData.year}</span>
                        </>
                      )}
                      {formData.semester && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-slate-800 font-bold">{formData.semester}</span>
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
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
                {isEditing ? (
                  <>
                    {selectedSubject && (
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowDeleteConfirm(true);
                        }}
                        className="h-10 px-4 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wide mr-auto"
                        title="Excluir Disciplina"
                      >
                        <Trash2 size={16} />
                        <span>Excluir</span>
                      </button>
                    )}
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="h-10 px-4 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider"
                    >
                      <X size={15} />
                      <span>Cancelar</span>
                    </button>
                    <button 
                      onClick={handleSave}
                      className="h-10 px-6 bg-[#00174b] text-white hover:bg-[#000f33] rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md uppercase tracking-wider"
                    >
                      <Save size={16} />
                      <span>Salvar Disciplina</span>
                    </button>
                  </>
                ) : (
                  selectedSubject && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setSelectedSubject(null);
                          setIsEditing(false);
                        }}
                        className="h-10 px-4 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider"
                        title="Fechar Ficha"
                      >
                        <X size={15} />
                        <span className="hidden sm:inline">Fechar Ficha</span>
                      </button>

                      <button 
                        onClick={() => {
                          try {
                            window.print();
                          } catch (err) {
                            console.error("Print failed:", err);
                            setNotification({
                              type: 'error',
                              message: 'A impressão direta é bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba para imprimir.'
                            });
                          }
                        }}
                        className="h-10 w-10 bg-white border border-slate-200 text-slate-500 rounded-none hover:text-slate-800 hover:bg-slate-50 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                        title="Imprimir"
                      >
                        <Printer size={16} />
                      </button>

                      <button 
                        onClick={() => setIsEditing(true)}
                        className="h-10 px-4 bg-slate-800 border border-slate-800 hover:bg-slate-900 text-white rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                        <span>Editar</span>
                      </button>
                    </div>
                  )
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
                    <div className="col-span-12 sm:col-span-3 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Código</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.code || ''}
                        onChange={(e) => setFormData({...formData, code: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={1}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-9 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Nome da Disciplina</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.name || ''}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={2}
                      />
                    </div>
                    <div className="col-span-12 grid grid-cols-12 gap-3 pt-2">
                      <div className="col-span-12 md:col-span-8 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Ano</label>
                        <div className="flex bg-slate-50 p-1 rounded-none gap-1 flex-wrap">
                          {['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((year) => (
                            <button
                              key={year}
                              type="button"
                              disabled={!isEditing}
                              onClick={() => setFormData({...formData, year})}
                              className={cn(
                                "flex-1 min-w-[60px] py-2 text-[10px] font-bold rounded-none transition-all",
                                formData.year === year 
                                  ? "bg-white text-slate-800 shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700 disabled:opacity-50"
                              )}
                            >
                              {year}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="col-span-12 md:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Semestre</label>
                        <div className="flex bg-slate-50 p-1 rounded-none gap-1">
                          {['1º Sem.', '2º Sem.'].map((sem) => (
                            <button
                              key={sem}
                              type="button"
                              disabled={!isEditing}
                              onClick={() => setFormData({...formData, semester: sem})}
                              className={cn(
                                "flex-1 py-2 text-[10px] font-bold rounded-none transition-all",
                                formData.semester === sem 
                                  ? "bg-white text-slate-800 shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700 disabled:opacity-50"
                              )}
                            >
                              {sem}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-8 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Professor Responsável</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.teacher_id || ''}
                        onChange={(e) => setFormData({...formData, teacher_id: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={4}
                      >
                        <option value="">Selecione o professor responsável...</option>
                        {qualifiedTeachers.length > 0 ? (
                          <>
                            <optgroup label="⭐ Professores Habilitados (que escolheram esta disciplina)">
                              {qualifiedTeachers.map((teacher, idx) => (
                                <option key={`q-teach-${teacher.id}-${idx}`} value={teacher.id}>
                                  ✓ {teacher.name}
                                </option>
                              ))}
                            </optgroup>
                            {otherTeachers.length > 0 && (
                              <optgroup label="Outros Professores">
                                {otherTeachers.map((teacher, idx) => (
                                  <option key={`o-teach-${teacher.id}-${idx}`} value={teacher.id}>
                                    {teacher.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        ) : (
                          teachers.map((teacher, idx) => (
                            <option key={`teach-${teacher.id}-${idx}`} value={teacher.id}>{teacher.name}</option>
                          ))
                        )}
                      </select>
                      {currentSubjectId && qualifiedTeachers.length === 0 && (
                        <p className="text-[10px] text-amber-600 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0" />
                          Nenhum professor selecionou esta disciplina no seu cadastro.
                        </p>
                      )}
                    </div>
                    <div className="col-span-12 md:col-span-4 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Situação</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.status || 'Ativo'}
                        onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={11}
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Professores Habilitados no Cadastro */}
                <section className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Users size={14} className="text-slate-500" />
                      Professores Habilitados para esta Disciplina
                    </h4>
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 border border-slate-200">
                      {qualifiedTeachers.length} {qualifiedTeachers.length === 1 ? 'professor' : 'professores'}
                    </span>
                  </div>

                  {qualifiedTeachers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {qualifiedTeachers.map((teacher, tIdx) => {
                        const isResponsable = formData.teacher_id === teacher.id;
                        return (
                          <div 
                            key={`qteach-${teacher.id || tIdx}-${tIdx}`}
                            className={cn(
                              "p-3 bg-slate-50 border transition-all flex items-center gap-3 relative group",
                              isResponsable 
                                ? "border-amber-400 bg-amber-50/40 ring-1 ring-amber-400/20" 
                                : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/60"
                            )}
                          >
                            <div className="w-10 h-10 bg-white border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-600 shrink-0 overflow-hidden relative">
                              {teacher.photo_url ? (
                                <img src={teacher.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="uppercase">{teacher.name.substring(0, 2)}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{teacher.name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {isResponsable ? (
                                  <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-bold uppercase tracking-wider">
                                    Professor Responsável
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-100 uppercase tracking-tight">
                                    Habilitado
                                  </span>
                                )}
                              </div>
                            </div>
                            {isEditing && !isResponsable && (
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, teacher_id: teacher.id })}
                                className="text-[9px] font-bold text-slate-700 hover:text-amber-700 bg-white hover:bg-amber-50 border border-slate-200 px-2 py-1 shadow-2xs transition-all uppercase shrink-0 cursor-pointer"
                                title="Definir como Responsável"
                              >
                                Tornar Resp.
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50/80 border border-dashed border-slate-200 text-center space-y-1">
                      <p className="text-xs font-bold text-slate-600">Nenhum professor selecionou esta disciplina no seu cadastro.</p>
                      <p className="text-[10px] text-slate-400">
                        No menu Professores, ao cadastrar/editar cada professor, é possível selecionar as disciplinas que ele está apto a lecionar.
                      </p>
                    </div>
                  )}
                </section>

                {/* Content */}
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} />
                    Conteúdo Programático
                  </h4>
                  <textarea 
                    disabled={!isEditing}
                    value={(formData.program_content || '')
                      .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
                      .replace(/\s*\}\]\s*$/g, '') // Robust cleaning of orphaned brackets
                      .trim()}
                    onChange={(e) => setFormData({...formData, program_content: e.target.value})}
                    onKeyDown={handleKeyDown}
                    rows={12}
                    placeholder="Descreva aqui o conteúdo programático da disciplina..."
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 resize-none"
                    tabIndex={3}
                  />
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-none flex items-center justify-center">
              <BookOpen size={40} />
            </div>
            <p className="text-sm font-medium">Selecione uma disciplina para ver os detalhes</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedSubject && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-none shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-none flex items-center justify-center mx-auto">
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
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-none font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-none font-bold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
              >
                {loading ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Printable Subject Record */}
      {selectedSubject && (
        <div id="printable-subject-record" className="hidden print:flex flex-col justify-between text-slate-950 bg-white overflow-hidden font-sans leading-relaxed relative w-full h-[270mm] max-h-[270mm] min-h-[270mm] mx-auto p-0 box-border">
          {/* TOP SECTION: Header + Control Boxes + Subject Data + Content */}
          <div className="flex-1 flex flex-col justify-start pr-1">
            {/* Institutional Header with prominent doubled logo */}
            <div className="flex items-center gap-5 mb-2.5 pb-2.5 border-b-2 border-slate-900">
              <div className="flex-shrink-0 w-32 h-32 flex items-center justify-center">
                {inst?.logo_url ? (
                  <img
                    src={inst.logo_url}
                    className="w-full h-full object-contain max-h-32 max-w-32"
                    referrerPolicy="no-referrer"
                    alt="Logo da Instituição"
                  />
                ) : (
                  <div className="w-full h-full border border-slate-300 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-400 font-bold uppercase">
                    <span>SEM</span>
                    <span>LOGO</span>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <p className="text-[10pt] font-extrabold tracking-[0.2em] text-slate-600 uppercase leading-none mb-1.5">
                  {inst?.city_uf ? `DIOCESE DE ${inst.city_uf.split('/')[0].toUpperCase()}` : 'DIOCESE DE GUARULHOS'}
                </p>
                <h1 className="text-[17pt] font-black uppercase tracking-tight text-slate-950 leading-tight">
                  {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                </h1>
                <p className="text-[10pt] font-bold text-slate-600 tracking-wider uppercase mt-1">
                  {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                </p>
              </div>
            </div>

            <div className="text-center mb-2.5">
              <h2 className="text-[12pt] font-black uppercase tracking-[0.28em] text-slate-900 border-b-2 border-slate-900 pb-0.5 px-6 inline-block">
                Ficha da Disciplina
              </h2>
            </div>

            {/* TOP CONTROL BOXES */}
            <div className="grid grid-cols-12 gap-3.5 mb-2.5">
              <div className="col-span-3 border border-slate-800 p-2 flex flex-col h-[3cm] justify-between bg-white">
                <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                  Controle
                </p>
                <div className="flex-1 flex flex-col justify-center items-center">
                  <p className="text-[7pt] font-extrabold uppercase tracking-widest text-slate-400 mb-1 text-center">
                    Código da Matéria
                  </p>
                  <div className="border border-slate-400 bg-slate-50/70 h-8 w-28 flex items-center justify-center font-black text-[11.5pt] text-slate-950">
                    {selectedSubject.code}
                  </div>
                </div>
              </div>

              <div className="col-span-6 border border-slate-800 p-2 h-[3cm] flex flex-col justify-between bg-white">
                <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                  Informações Acadêmicas:
                </p>
                <div className="grid grid-cols-2 gap-3 text-center my-auto py-1">
                  <div className="border border-slate-200 p-1.5 bg-slate-50/50">
                    <p className="text-[6.5pt] font-extrabold uppercase text-slate-500">Ano Curricular</p>
                    <p className="text-[9.5pt] font-black uppercase text-slate-950">{selectedSubject.year || '---'}</p>
                  </div>
                  <div className="border border-slate-200 p-1.5 bg-slate-50/50">
                    <p className="text-[6.5pt] font-extrabold uppercase text-slate-500">Semestre</p>
                    <p className="text-[9.5pt] font-black uppercase text-slate-950">{selectedSubject.semester || '---'}</p>
                  </div>
                </div>
                <div className="text-[8pt] font-semibold flex items-center justify-between border-t border-slate-200 pt-1 text-slate-800">
                  <span>Carga Horária: <strong className="uppercase font-bold text-slate-950">{selectedSubject.workload ? `${selectedSubject.workload}h` : '30h'}</strong></span>
                  <span>Situação: <strong className="uppercase font-bold text-slate-950">{selectedSubject.status || 'Ativo'}</strong></span>
                </div>
              </div>

              <div className="col-span-3 border border-slate-800 p-2 flex flex-col justify-between items-center bg-white h-[3cm] mr-1">
                <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 w-full text-center">
                  Responsável
                </p>
                <div className="flex-1 flex flex-col justify-center items-center text-center px-1">
                  <p className="text-[9pt] font-bold uppercase leading-tight text-slate-900 line-clamp-2">
                    {teachers.find(t => t.id === selectedSubject.teacher_id)?.name || 'NÃO DEFINIDO'}
                  </p>
                  <p className="text-[6.5pt] font-extrabold uppercase text-slate-500 mt-1">Professor Titular</p>
                </div>
                <div className="text-[7pt] font-bold uppercase text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-full text-center">
                  {selectedSubject.status || 'Ativo'}
                </div>
              </div>
            </div>

            {/* DADOS DA DISCIPLINA */}
            <div className="space-y-2.5 mb-2.5 text-[9pt]">
              <div className="flex items-end gap-2">
                <span className="font-bold uppercase min-w-[70px] text-[8.5pt] text-slate-800">Disciplina:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9.5pt] text-slate-950 px-2 pb-1 min-h-[22px]">
                  {selectedSubject.name}
                </span>
              </div>

              <div className="flex items-end gap-2">
                <span className="font-bold uppercase min-w-[70px] text-[8.5pt] text-slate-800">Habilitados:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px]">
                  {getQualifiedTeachers(selectedSubject.id).length > 0 
                    ? getQualifiedTeachers(selectedSubject.id).map(t => t.name).join(', ') 
                    : 'Nenhum outro professor habilitado no cadastro'}
                </span>
              </div>
            </div>

            {/* CONTEÚDO PROGRAMÁTICO */}
            <div className="my-2 p-2.5 bg-slate-50/50 border border-slate-300 rounded-none space-y-1.5 flex-1 flex flex-col">
              <h4 className="text-[8pt] font-black uppercase text-center border-b border-slate-200 pb-1 tracking-wider text-slate-800">
                Conteúdo Programático e Ementa
              </h4>
              <div className="text-[8pt] leading-relaxed text-justify whitespace-pre-wrap text-slate-800 p-1 flex-1 min-h-[140px]">
                {(selectedSubject.program_content || '')
                  .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
                  .replace(/\s*\}\]\s*$/g, '')
                  .trim() || 'Nenhum conteúdo programático detalhado cadastrado.'}
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: PINNED FOOTER */}
          <div className="mt-auto pt-2 shrink-0 pr-1">
            {/* RODAPÉ INSTITUCIONAL */}
            <div className="border-t-2 border-slate-900 pt-1.5 pb-0 flex justify-between items-start text-slate-900 uppercase tracking-tight text-[7pt]">
              <div className="flex-1 space-y-0.5">
                <p className="leading-snug font-bold">
                  {inst?.address}
                </p>
                {(inst?.cep || inst?.city_uf) && (
                  <p className="leading-snug text-[7pt] font-bold">
                    {inst?.cep ? `CEP: ${inst.cep}` : ''} {inst?.city_uf ? ` - ${inst.city_uf}` : ''}
                  </p>
                )}
                {inst?.phone && (
                  <p className="leading-snug font-bold text-[7pt] pt-0.5">
                    <span className="normal-case">Telefone: {inst.phone}</span>
                  </p>
                )}
              </div>
              <div className="text-right max-w-[380px] leading-tight text-slate-900 font-bold text-[7pt] space-y-0.5 pr-1">
                {inst?.secretary && (
                  <>
                    <p className="whitespace-pre-line uppercase underline underline-offset-2 mb-0.5">Atendimento Secretaria:</p>
                    <p className="whitespace-pre-line lowercase font-bold text-[7pt]">{inst.secretary}</p>
                  </>
                )}
                {inst?.email && (
                  <p className="lowercase font-bold text-[7pt] pt-0.5">
                    email: {inst.email.toLowerCase()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
