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
  AlertCircle,
  Printer,
  Filter,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Edit
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  is_special?: boolean;
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
        "w-full flex items-center gap-4 p-4 rounded-none transition-all text-left relative overflow-hidden group",
        isSelected 
          ? "bg-slate-800 text-white shadow-xl shadow-none ring-1 ring-slate-400" 
          : "hover:bg-slate-50 text-slate-600 border border-transparent hover:border-slate-200",
        className
      )}
    >
      <div className={cn(
        "w-12 h-12 rounded-none flex items-center justify-center font-bold text-xs relative flex-shrink-0 transition-transform group-hover:scale-110",
        isSelected ? "bg-white/20 text-white shadow-inner" : "bg-slate-100 text-slate-500 border border-slate-200"
      )}>
        {cls.code}
        <div className={cn(
          "absolute -top-1 -right-1 w-3 h-3 rounded-none border-2",
          isSelected ? "border-slate-500 shadow-sm" : "border-white",
          cls.status === 'Inativo' ? "bg-slate-300" : "bg-emerald-500"
        )} />
      </div>
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <p className={cn(
            "text-sm font-bold truncate tracking-tight uppercase",
            isSelected ? "text-white" : "text-slate-900"
          )}>{cls.name}</p>
          {(cls as any).is_special && (
            <span className={cn(
              "px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase rounded-none leading-none tracking-normal border flex-shrink-0",
              isSelected 
                ? "bg-amber-500/20 text-amber-200 border-amber-500/35" 
                : "bg-amber-55 text-amber-600 border-amber-200"
            )}>
              Especial
            </span>
          )}
        </div>
        <div className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-[0.15em] mt-1 pr-2",
          isSelected ? "text-slate-300" : "text-slate-400"
        )}>
          <span>{cls.period}</span>
          <span className={cn("w-1 h-1 rounded-full", isSelected ? "bg-slate-300" : "bg-slate-300")} />
          <span>{cls.year || '---'}</span>
          <span className={cn("w-1 h-1 rounded-full", isSelected ? "bg-slate-300" : "bg-slate-300")} />
          <span>{cls.semester || '---'}</span>
        </div>
      </div>
      
      {isSelected && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 animate-in fade-in slide-in-from-right-4 duration-300">
          <ChevronRight size={20} />
        </div>
      )}
    </button>
  );
});

export function Classes() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [inst, setInst] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [sortBy, setSortBy] = useState<'name_year' | 'name' | 'code' | 'year' | 'period'>('name_year');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hoverShowList, setHoverShowList] = useState(false);
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
      const [classesData, subjectsData, instData] = await Promise.all([
        fetchAll('classes', '*', 'name', true),
        fetchAll('subjects', 'id, name, code, year, semester, status, program_content', 'name', true),
        fetchAll('institution_settings')
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

        let isSpecial = false;
        if (normalized.observations) {
          const match = normalized.observations.match(/\[METADATA:(\{[\s\S]*\})\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.year) normalized.year = meta.year;
              if (!normalized.semester) normalized.semester = meta.semester || meta.semester_id;
              if (sIds.length === 0 && (meta.subject_ids || meta.subject_id)) {
                sIds = meta.subject_ids || [meta.subject_id];
              }
              isSpecial = !!meta.is_special;
            } catch (e) {}
          }
        }
        (normalized as any).is_special = isSpecial;
        normalized.subject_ids = sIds;
        return normalized;
      });

      setClasses(normalizedClasses);
      setSubjects(normalizedSubjects);
      if (instData && instData.length > 0) setInst(instData[0]);
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
      start_date: cls.start_date || ''
    });
    setIsEditing(false);
    setHoverShowList(false);
  }, []);

  const generateClassListPDF = async () => {
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
      doc.text(`RELAÇÃO DE TURMAS • FILTRO: ${statusFilter.toUpperCase()}`, 38, 24);
      doc.text(`${inst?.city_uf || ''} • EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, 38, 29);

      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.5);
      doc.line(margin, 35, pageWidth - margin, 35);

      const tableData = filteredClasses.map(c => [
        c.code,
        c.name.toUpperCase(),
        c.year || '---',
        c.period,
        (c.days_of_week || []).join(', '),
        c.status || 'Ativo'
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['CÓD.', 'NOME DA TURMA', 'ANO', 'PERÍODO', 'DIAS', 'STATUS']],
        body: tableData,
        headStyles: { fillColor: [0, 23, 75], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 6.5, cellPadding: 2, font: 'helvetica' },
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
      console.error('Error generating class list PDF:', error);
      alert('Erro ao gerar relatório de turmas');
    }
  };

  const handleNew = () => {
    setSelectedClass(null);

    // Suggest next numeric code
    const maxCode = classes.reduce((max, c) => {
      const num = parseInt(c.code, 10);
      return !isNaN(num) ? Math.max(max, num) : max;
    }, 0);
    const nextCode = String(maxCode + 1).padStart(3, '0');

    setFormData({
      name: '',
      code: nextCode,
      status: 'Ativo',
      days_of_week: [],
      period: 'Tarde',
      year: '1º Ano',
      start_date: '',
      semester: '1º Semestre',
      subject_ids: [],
      is_special: false
    });
    setIsEditing(true);
    setHoverShowList(false);
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
      // Always sync year, semester, subject_ids and is_special into observations metadata 
      // before saving. This ensures data persistence even if Supabase columns are missing.
      const metadata: any = {};
      if (formData.year) metadata.year = formData.year;
      if (formData.semester) metadata.semester = formData.semester;
      if (formData.subject_ids) metadata.subject_ids = formData.subject_ids;
      if (formData.is_special !== undefined) metadata.is_special = formData.is_special;
      
      if (Object.keys(metadata).length > 0) {
        const metadataStr = `[METADATA:${JSON.stringify(metadata)}]`;
        // Clean up existing metadata and any orphaned closing brackets
        let cleanObs = (syncData.observations || '')
          .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
          .replace(/\}\]$/g, '') // Remove orphaned trailing bracket if any
          .trim();
        syncData.observations = (cleanObs + (cleanObs ? '\n' : '') + metadataStr).trim();
      }

      const savedId = await saveData('classes', selectedClass?.id, syncData);
      
      setIsEditing(false);
      // Wait for refresh
      await fetchClasses();
      
      // Update local state with the saved data to ensure UI sync
      const updatedData = { 
        ...syncData, 
        id: savedId,
        start_date: syncData.start_date
      } as Class;
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

  const extractYearInfo = (name: string, yearAttr?: string) => {
    const match = name.match(/\d{4}/);
    const yr = match ? parseInt(match[0]) : (yearAttr ? parseInt(yearAttr) : 0);
    const baseName = name.replace(/\d{4}/, '').trim().toLowerCase();
    return { yr, baseName };
  };

  const filteredClasses = React.useMemo(() => {
    let result = classes.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'Todos' || (c.status || 'Ativo') === statusFilter;
      
      return matchesSearch && matchesStatus;
    });

    return [...result].sort((a, b) => {
      if (sortBy === 'name_year') {
        const infoA = extractYearInfo(a.name, a.year);
        const infoB = extractYearInfo(b.name, b.year);
        if (infoA.baseName !== infoB.baseName) return infoA.baseName.localeCompare(infoB.baseName);
        return infoB.yr - infoA.yr; // Year Descending
      }
      if (sortBy === 'code') return a.code.localeCompare(b.code);
      if (sortBy === 'year') return (a.year || '').localeCompare(b.year || '');
      if (sortBy === 'period') return a.period.localeCompare(b.period);
      return a.name.localeCompare(b.name);
    });
  }, [classes, searchTerm, statusFilter, sortBy]);

  const actualListCollapsed = selectedClass !== null || isEditing;

  return (
    <div className={cn(
      "h-[calc(100vh-6rem)] relative flex gap-4 w-full transition-all duration-300 p-4",
      actualListCollapsed ? "justify-center" : "justify-end"
    )}>
      {/* Green Hover Sensor / Marker */}
      {actualListCollapsed && !hoverShowList && (
        <div 
          onMouseEnter={() => setHoverShowList(true)}
          onClick={() => setHoverShowList(true)}
          className="absolute right-0 top-1/4 h-1/2 w-4 bg-emerald-500 hover:bg-emerald-600 cursor-pointer rounded-l-md shadow-md transition-all duration-200 flex flex-col justify-center items-center group z-[45]"
          title="Aproxime o mouse para ver a Lista de Turmas"
        >
          {/* Subtle glowing accent */}
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          
          {/* Hover instruction tooltip */}
          <div className="absolute right-4 bg-slate-900 border border-slate-800 text-emerald-400 font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded-none shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            ➔ Lista de Turmas <span className="text-slate-300">(Passe o mouse)</span>
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
          "bg-white rounded-none shadow-2xl flex flex-col order-last transition-all duration-300 ease-in-out border border-slate-200 overflow-hidden",
          actualListCollapsed 
            ? (hoverShowList 
                ? "absolute right-0 top-4 bottom-4 h-[calc(100%-2rem)] z-50 w-full sm:w-[440px] opacity-100 shadow-2xl border-l border-slate-200" 
                : "w-0 opacity-0 border-0 pointer-events-none overflow-hidden hidden"
              )
            : "w-full lg:w-[440px] opacity-100"
        )}
      >
        <div className="flex-[1] flex flex-col overflow-hidden w-full bg-white">
          <div className="p-8 border-b border-slate-100 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Turmas</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestão de Grupos Acadêmicos</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-none border border-slate-200 shadow-sm uppercase tracking-widest leading-none">
                  {filteredClasses.length}
                </div>
                <button 
                  onClick={handleNew}
                  className="w-10 h-10 bg-slate-800 text-white rounded-none hover:bg-slate-900 transition-all flex items-center justify-center shadow-lg shadow-none active:scale-90"
                  title="NOVA TURMA"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={16} />
                <input 
                  type="text"
                  placeholder="Buscar por nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-none text-xs font-bold focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-none text-[10px] font-bold text-slate-600 uppercase tracking-widest focus:ring-4 focus:ring-slate-500/5 outline-none transition-all cursor-pointer"
                >
                  <option value="name_year">Nome e Ano (Recente Primeiro)</option>
                  <option value="name">Ordenar por Nome (A-Z)</option>
                  <option value="code">Ordenar por Código</option>
                  <option value="year">Ordenar por Ano</option>
                  <option value="period">Ordenar por Período</option>
                </select>
                
                <div className="flex bg-slate-100/50 p-1.5 rounded-none border border-slate-200">
                  {(['Ativo', 'Todos'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status === 'Todos' ? 'Todos' : 'Ativo')}
                      className={cn(
                        "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-none transition-all",
                        (status === 'Todos' && statusFilter === 'Todos') || (status === 'Ativo' && statusFilter === 'Ativo')
                          ? "bg-white text-slate-800 shadow-sm border border-slate-100" 
                          : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3 opacity-50">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Sincronizando...</p>
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-4">
                <Search size={40} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Nenhuma turma encontrada</p>
              </div>
            ) : (
              filteredClasses.map((cls) => (
                <ClassItem
                  key={cls.id}
                  cls={cls}
                  subjects={subjects}
                  isSelected={selectedClass?.id === cls.id}
                  onSelect={handleSelectClass}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={cn(
        "bg-white rounded-none shadow-2xl border border-slate-200 flex flex-col overflow-hidden relative transition-all duration-300",
        actualListCollapsed ? "flex-grow flex-1 max-w-5xl w-[100%] mx-auto opacity-100" : "w-0 h-0 opacity-0 pointer-events-none hidden"
      )}>
        {selectedClass || isEditing ? (
          <>
            {notification && (
              <div className={cn(
                "fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-8 py-4 rounded-none shadow-2xl animate-in fade-in slide-in-from-top-12 duration-500 flex items-center gap-4 border",
                notification.type === 'success' ? "bg-emerald-600 text-white border-emerald-500" : "bg-red-600 text-white border-red-500"
              )}>
                <div className="w-8 h-8 rounded-none bg-white/20 flex items-center justify-center">
                  {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.1em]">{notification.message}</p>
              </div>
            )}
            <div className="px-10 py-8 border-b border-slate-100 bg-slate-50/20">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-none bg-slate-800 text-white shadow-xl shadow-none flex items-center justify-center">
                  <School size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight leading-none uppercase">
                    {isEditing ? (selectedClass ? 'Editar Registro' : 'Novo Lançamento') : formData.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-none text-[10px] font-bold text-slate-500 uppercase tracking-widest shadow-sm">
                      ID: {formData.code || '---'}
                    </span>
                    <div className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-none text-[9px] font-bold uppercase tracking-widest border shadow-sm",
                      formData.status === 'Inativo' ? "bg-slate-50 text-slate-500 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full", formData.status === 'Inativo' ? "bg-slate-400" : "bg-emerald-500 animate-pulse")} />
                      {formData.status || 'Ativo'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
                {isEditing ? (
                  <>
                    {selectedClass && (
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowDeleteConfirm(true);
                        }}
                        className="h-10 px-4 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wide mr-auto"
                        title="Excluir Turma"
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
                      <span>Salvar Cadastro</span>
                    </button>
                  </>
                ) : (
                  selectedClass && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setSelectedClass(null);
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

          <div className="flex-1 overflow-y-auto p-4 sm:p-10 bg-slate-50/10">
              <div className="max-w-4xl mx-auto space-y-12 pb-20">
                {/* Basic Info */}
                <section className="space-y-6">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-none bg-slate-100 flex items-center justify-center text-slate-400">
                      <School size={20} />
                     </div>
                     <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                        Informações Principais
                      </h4>
                      <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  
                  <div className="grid grid-cols-12 gap-4 md:gap-8">
                    <div className="col-span-12 space-y-6">
                       <div className="grid grid-cols-12 gap-4 md:gap-8">
                         <div className="col-span-12 md:col-span-8 space-y-3">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Ano Acadêmico</label>
                          <div className="flex bg-slate-100 rounded-none p-1.5 gap-1.5 shadow-inner border border-slate-200/50">
                            {['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((year) => (
                              <button
                                key={year}
                                type="button"
                                disabled={!isEditing}
                                onClick={() => {
                                  const newYear = year;
                                  const validSubjects = (formData.subject_ids || []).filter(sid => {
                                    const s = subjects.find(sub => sub.id === sid);
                                    if (!s) return false;
                                    const sSem = s.semester?.includes('1º') ? '1º Semestre' : s.semester?.includes('2º') ? '2º Semestre' : s.semester;
                                    const isCursoExtraClass = newYear === 'Curso Extra';
                                    const matchesYear = isCursoExtraClass || !newYear || !s.year || s.year === newYear;
                                    const matchesSemester = isCursoExtraClass || !formData.semester || !sSem || sSem === formData.semester;
                                    return matchesYear && matchesSemester;
                                  });
                                  setFormData({...formData, year: newYear, subject_ids: validSubjects});
                                }}
                                className={cn(
                                  "flex-1 py-3 text-[10px] font-bold rounded-none uppercase tracking-widest transition-all duration-300",
                                  formData.year === year 
                                    ? "bg-white text-slate-800 shadow-md border border-slate-100" 
                                    : "text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                )}
                              >
                                {year}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="col-span-12 md:col-span-4 space-y-3">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Semestre Atual</label>
                          <div className="flex bg-slate-100 rounded-none p-1.5 gap-1.5 shadow-inner border border-slate-200/50">
                            {(formData.year === 'Curso Extra' ? ['1º Semestre', '2º Semestre', 'Ano Inteiro'] : ['1º Semestre', '2º Semestre']).map((sem) => (
                              <button
                                key={sem}
                                type="button"
                                disabled={!isEditing}
                                onClick={() => {
                                  const newSemester = sem;
                                  const validSubjects = (formData.subject_ids || []).filter(sid => {
                                    const s = subjects.find(sub => sub.id === sid);
                                    if (!s) return false;
                                    const sSem = s.semester?.includes('1º') ? '1º Semestre' : s.semester?.includes('2º') ? '2º Semestre' : s.semester;
                                    const isCursoExtraClass = formData.year === 'Curso Extra';
                                    const matchesYear = isCursoExtraClass || !formData.year || !s.year || s.year === formData.year;
                                    let matchesSemester = !newSemester || !sSem || sSem === newSemester;
                                    if (isCursoExtraClass && newSemester === 'Ano Inteiro') matchesSemester = true;
                                    return matchesYear && matchesSemester;
                                  });
                                  setFormData({...formData, semester: newSemester, subject_ids: validSubjects});
                                }}
                                className={cn(
                                  "flex-1 py-3 text-[10px] font-bold rounded-none uppercase tracking-widest transition-all duration-300",
                                  formData.semester === sem 
                                    ? "bg-white text-slate-800 shadow-md border border-slate-100" 
                                    : "text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                )}
                              >
                                {sem === '1º Semestre' ? '1º' : sem === '2º Semestre' ? '2º' : 'Anual'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 space-y-4 pt-4">
                      <div className="flex items-baseline justify-between ml-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Matriz Curricular Ativa</label>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {formData.year === 'Curso Extra' ? 'Permitido até 4 disciplinas' : 'Permitido até 2 disciplinas por ciclo'}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                        {(formData.year === 'Curso Extra' ? [0, 1, 2, 3] : [0, 1]).map((index) => (
                          <div key={index} className="relative group">
                            <select 
                              disabled={!isEditing}
                              value={formData.subject_ids?.[index] || ''}
                              onChange={(e) => {
                                const newIds = [...(formData.subject_ids || [])];
                                newIds[index] = e.target.value;
                                setFormData({...formData, subject_ids: newIds.filter(Boolean)});
                              }}
                              className="w-full pl-6 pr-12 py-5 bg-white border border-slate-200 rounded-none text-sm font-bold text-slate-700 focus:ring-8 focus:ring-slate-500/5 focus:border-slate-400 disabled:opacity-60 disabled:cursor-not-allowed outline-none transition-all shadow-sm appearance-none group-hover:border-slate-300"
                            >
                              <option value="">{index === 0 ? 'Selecionar Disciplina Primária...' : 'Selecionar Disciplina Secundária...'}</option>
                              {subjects
                                 .filter(s => {
                                   const sSem = (s as any).semester?.includes('1º') ? '1º Semestre' : (s as any).semester?.includes('2º') ? '2º Semestre' : (s as any).semester;
                                   const isCursoExtraClass = formData.year === 'Curso Extra';
                                   const matchesYear = isCursoExtraClass || !formData.year || !(s as any).year || (s as any).year === formData.year;
                                   let matchesSemester = !formData.semester || !sSem || sSem === formData.semester;
                                   if (isCursoExtraClass) matchesSemester = true;
                                   const isActiveOrSelected = (s as any).status === 'Ativo' || formData.subject_ids?.includes(s.id);
                                   return matchesYear && matchesSemester && isActiveOrSelected;
                                 })
                                .map(subject => (
                                  <option 
                                    key={subject.id} 
                                    value={subject.id}
                                    disabled={formData.subject_ids?.includes(subject.id) && formData.subject_ids[index] !== subject.id}
                                  >
                                    [{subject.code}] {subject.name.toUpperCase()}
                                  </option>
                                ))}
                            </select>
                            <ChevronDown size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:rotate-180 transition-transform pointer-events-none" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="col-span-12 grid grid-cols-12 gap-4 md:gap-8 pt-8">
                       <div className="col-span-12 sm:col-span-3 space-y-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Código</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.code || ''}
                          onChange={(e) => setFormData({...formData, code: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-6 py-4 bg-white border border-slate-200 rounded-none text-sm font-bold text-slate-700 focus:ring-8 focus:ring-slate-500/5 focus:border-slate-400 disabled:bg-slate-100 disabled:opacity-50 transition-all shadow-sm outline-none"
                          tabIndex={1}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-6 space-y-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nome Identificador do Curso</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          placeholder="EX: TEOLOGIA AVANÇADA 2026"
                          value={formData.name || ''}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-6 py-4 bg-white border border-slate-200 rounded-none text-sm font-bold text-slate-700 focus:ring-8 focus:ring-slate-500/5 focus:border-slate-400 shadow-sm outline-none transition-all uppercase placeholder:text-slate-300"
                          tabIndex={2}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-3 space-y-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Sala / Local</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.room || ''}
                          onChange={(e) => setFormData({...formData, room: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-6 py-4 bg-white border border-slate-200 rounded-none text-sm font-bold text-slate-700 focus:ring-8 focus:ring-slate-500/5 shadow-sm outline-none transition-all"
                          tabIndex={3}
                        />
                      </div>
                    </div>

                    <div className="col-span-12 grid grid-cols-12 gap-4 md:gap-8">
                       <div className="col-span-12 sm:col-span-4 space-y-3 pt-2">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Data Prevista de Início</label>
                        <div className="relative group">
                          <input 
                            type="date"
                            disabled={!isEditing}
                            value={formData.start_date || ''}
                            onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                            onKeyDown={handleKeyDown}
                            className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-none text-sm font-bold text-slate-700 focus:ring-8 focus:ring-slate-500/5 shadow-sm outline-none transition-all"
                            tabIndex={5}
                          />
                          <Calendar size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                      <div className="col-span-12 sm:col-span-8 space-y-3 pt-2">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Turno de Aula</label>
                        <div className="flex bg-slate-100 rounded-none p-1.5 gap-1.5 shadow-inner border border-slate-200/50">
                          {['Manhã', 'Tarde', 'Noite'].map(p => (
                            <button
                              key={p}
                              disabled={!isEditing}
                              onClick={() => setFormData({...formData, period: p as any})}
                              className={cn(
                                "flex-1 py-3 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all duration-300",
                                formData.period === p 
                                  ? "bg-white text-slate-800 shadow-md border border-slate-100" 
                                  : "text-slate-400 hover:text-slate-600"
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Regime do Curso / Turma Especial Option */}
                    <div className="col-span-12 pt-4">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1 block mb-3">Características Acadêmicas</label>
                      <button
                        type="button"
                        disabled={!isEditing}
                        onClick={() => setFormData({ ...formData, is_special: !formData.is_special })}
                        className={cn(
                          "w-full p-4 border rounded-none text-left flex items-start gap-4 transition-all shadow-sm outline-none",
                          formData.is_special
                            ? "bg-amber-50/50 border-amber-300 text-amber-900"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 border mt-0.5 rounded-none flex items-center justify-center flex-shrink-0 transition-all",
                          formData.is_special
                            ? "bg-amber-600 border-amber-600 text-white"
                            : "border-slate-300 bg-white"
                        )}>
                          {formData.is_special && <CheckCircle2 size={13} className="stroke-[3px]" />}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Turma Especial (Ex: Doutrina Social - Curta Duração)</p>
                          <p className="text-[10px] text-slate-500 font-semibold leading-normal">
                            Marque esta opção para cursos estruturados em curta duração (como 1 ou 2 anos). 
                            Isso autoriza a emissão excepcional de <strong>Diploma de Conclusão / Honra</strong> ao completar apenas <strong>1 ano letivo</strong> de curso, dispensando a exigência padrão de 4 anos aplicável a turmas regulares.
                          </p>
                        </div>
                      </button>
                    </div>

                  </div>
                </section>

                {/* Days of Week */}
                <section className="space-y-6">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-none bg-slate-100 flex items-center justify-center text-slate-400">
                      <Clock size={20} />
                     </div>
                     <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                        Cronograma da Semana
                      </h4>
                      <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        disabled={!isEditing}
                        onClick={() => toggleDay(day.value)}
                        className={cn(
                          "px-6 py-4 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-500 flex items-center gap-3 border shadow-sm",
                          formData.days_of_week?.includes(day.value)
                            ? "bg-slate-800 border-slate-400 text-white shadow-xl shadow-none scale-105"
                            : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-800"
                        )}
                      >
                        {formData.days_of_week?.includes(day.value) ? <CheckCircle2 size={18} /> : <div className="w-4.5 h-4.5 rounded-full border-2 border-slate-200" />}
                        {day.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Additional Info */}
                <section className="space-y-6">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-none bg-slate-100 flex items-center justify-center text-slate-400">
                      <FileText size={20} />
                     </div>
                     <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                        Observações Complementares
                      </h4>
                      <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <textarea 
                    disabled={!isEditing}
                    placeholder="Informações adicionais sobre a turma..."
                    value={(formData.observations || '')
                      .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
                      .replace(/\s*\}\]\s*$/g, '') // Robust cleaning of orphaned brackets
                      .trim()}
                    onChange={(e) => setFormData({...formData, observations: e.target.value})}
                    onKeyDown={handleKeyDown}
                    rows={6}
                    className="w-full px-8 py-6 bg-white border border-slate-200 rounded-none text-sm font-medium text-slate-700 focus:ring-8 focus:ring-slate-500/5 focus:border-slate-400 disabled:bg-slate-100/50 outline-none transition-all resize-none shadow-sm placeholder:text-slate-300"
                    tabIndex={6}
                  />
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/20 p-20">
            <div className="flex flex-col items-center text-center max-w-sm space-y-10">
              <div className="relative">
                <div className="absolute inset-0 bg-slate-600/10 blur-3xl rounded-full" />
                <div className="relative w-32 h-32 bg-white rounded-none shadow-2xl flex items-center justify-center text-slate-200 border border-slate-50">
                  <School size={64} className="animate-pulse" />
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">Base de Conhecimento</h3>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest leading-loose">
                  Navegue pela listagem lateral para visualizar os detalhes cadastrais ou criar novos grupos de ensino.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedClass && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-none shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-none flex items-center justify-center mx-auto">
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

      {/* Printable Class Record */}
      {selectedClass && (
        <div id="printable-class-record" className="hidden print:block text-black bg-white overflow-visible font-sans leading-tight relative w-full h-[285mm] mx-auto">
          <div className="w-full max-w-[210mm] mx-auto bg-white p-8 flex flex-col h-full">
            {/* Institutional Header */}
            <div className="flex items-center gap-6 mb-6 pb-2 border-b-2 border-black">
              <div className="flex-shrink-0 w-24 h-24 flex items-center justify-center">
                {inst?.logo_url ? (
                  <img src={inst.logo_url} className="w-full h-full object-contain max-h-24" referrerPolicy="no-referrer" alt="Logo" />
                ) : (
                  <div className="w-full h-full border-2 border-slate-200 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-300 font-bold uppercase">
                    <span className="leading-none">SEM</span>
                    <span className="leading-none">LOGO</span>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col">
                <p className="text-[11pt] font-semibold tracking-widest text-slate-800 leading-tight">DIOCESE DE GUARULHOS</p>
                <h1 className="text-[19pt] font-bold uppercase tracking-tight text-black leading-tight my-0.5">
                  {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                </h1>
                <p className="text-[12pt] font-bold text-slate-700 tracking-wide mt-1 uppercase">
                  {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                </p>
              </div>
            </div>

            {/* Document Title */}
            <div className="bg-black text-white py-2 px-4 mb-6 flex justify-between items-center">
              <h2 className="text-[14pt] font-bold uppercase tracking-widest">FICHA DA TURMA</h2>
              <span className="text-[10pt] font-bold">Turma: {selectedClass.code}</span>
            </div>

            {/* Content Section */}
            <div className="space-y-6 flex-1">
              <div className="grid grid-cols-1 gap-4">
                <div className="border-b border-black/10 pb-2">
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Nome do Curso / Turma</p>
                  <p className="text-[12pt] font-bold uppercase text-[#00174b]">{selectedClass.name}</p>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="border-b border-black/10 pb-2">
                    <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Ano Letivo</p>
                    <p className="text-[11pt] font-bold">{selectedClass.year || '---'}</p>
                  </div>
                  <div className="border-b border-black/10 pb-2">
                    <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Semestre</p>
                    <p className="text-[11pt] font-bold uppercase">{selectedClass.semester || '---'}</p>
                  </div>
                  <div className="border-b border-black/10 pb-2">
                    <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Período</p>
                    <p className="text-[11pt] font-bold uppercase">{selectedClass.period || '---'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border-b border-black/10 pb-2">
                    <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Sala</p>
                    <p className="text-[11pt] font-bold uppercase">{selectedClass.room || '---'}</p>
                  </div>
                  <div className="border-b border-black/10 pb-2">
                    <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Duração</p>
                    <p className="text-[11pt] font-bold uppercase">Início em: {selectedClass.start_date || '---'}</p>
                  </div>
                </div>

                <div className="border-b border-black/10 pb-2">
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Dias da Semana</p>
                  <p className="text-[11pt] font-bold uppercase">{(selectedClass.days_of_week || []).join(', ') || 'Não definidos'}</p>
                </div>

                <div className="border-b border-black/10 pb-2">
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Disciplinas Vinculadas</p>
                  <div className="space-y-1 mt-2">
                    {selectedClass.subject_ids?.map(sid => (
                      <p key={sid} className="text-[10pt] font-bold text-[#00174b] uppercase flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                        {subjects.find(s => s.id === sid)?.name || '---'}
                      </p>
                    ))}
                    {!selectedClass.subject_ids?.length && <p className="text-[10pt] text-slate-400 italic">Nenhuma disciplina vinculada.</p>}
                  </div>
                </div>

                <div className="border-b border-black/10 pb-2">
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Observações da Turma</p>
                  <div className="text-[10pt] leading-relaxed text-justify whitespace-pre-line min-h-[100px]">
                    {(selectedClass.observations || '').replace(/\[METADATA:.+?\]/, '').trim() || 'Sem observações adicionais.'}
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
                  <p className="text-[10pt] font-bold uppercase tracking-widest text-[#00174b]">Assinatura da Secretaria</p>
                  <p className="text-[7pt] text-slate-400 font-bold mt-1 tracking-tighter">Escola Diocesana de Ministérios - ESMIN</p>
                </div>
              </div>
            </div>

            {/* Institutional Footer */}
            <div className="mt-auto border-t-2 border-black pt-3 flex justify-between items-start text-[8.5pt] font-bold text-black uppercase tracking-tight mb-2">
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
                <div className="text-right max-w-[450px] leading-tight text-black font-bold uppercase text-[8pt]">
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
