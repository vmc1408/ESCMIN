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
  Filter
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
  const [inst, setInst] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [sortBy, setSortBy] = useState<'name_year' | 'name' | 'code' | 'year' | 'period'>('name_year');
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
      start_date: formatDateForDisplay(cls.start_date)
    });
    setIsEditing(false);
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

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-2">
      {/* Sidebar List */}
      <div className="w-[432px] bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden order-last">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Turmas</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100 flex items-center">
                {filteredClasses.length}
              </div>
              <button 
                onClick={generateClassListPDF}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-2 border border-indigo-100 shadow-sm"
                title="Imprimir Listagem Completa"
              >
                <Printer size={16} />
                <span className="text-[10px] font-black uppercase tracking-tight">Listagem</span>
              </button>
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
          <div className="grid grid-cols-2 gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border-none rounded-lg text-[10px] font-bold text-slate-600 focus:ring-1 focus:ring-blue-500/20"
            >
              <option value="name_year">Nome e Ano (Recente)</option>
              <option value="name">Ordenar por Nome</option>
              <option value="code">Ordenar por Código</option>
              <option value="year">Ordenar por Ano</option>
              <option value="period">Ordenar por Período</option>
            </select>
            <div className="flex bg-slate-50 p-1 rounded-lg">
              {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "flex-1 py-1 text-[8px] font-black uppercase rounded transition-all",
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
                    <School size={14} />
                    Informações da Turma
                  </h4>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 grid grid-cols-12 gap-3 pb-2">
                       <div className="col-span-8 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Ano Letivo</label>
                        <div className="flex bg-slate-50 p-1 rounded-xl gap-1 flex-wrap">
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
                                  // When Curso Extra, we allow any semester
                                  const matchesSemester = isCursoExtraClass || !formData.semester || !sSem || sSem === formData.semester;
                                  
                                  return matchesYear && matchesSemester;
                                });
                                setFormData({...formData, year: newYear, subject_ids: validSubjects});
                              }}
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
                                  if (isCursoExtraClass && newSemester === 'Ano Inteiro') {
                                    matchesSemester = true; // Show all for full year
                                  } else if (isCursoExtraClass) {
                                    matchesSemester = matchesSemester || isCursoExtraClass; // Keep current flexible behavior if preferred
                                  }
                                  
                                  return matchesYear && matchesSemester;
                                });
                                setFormData({...formData, semester: newSemester, subject_ids: validSubjects});
                              }}
                              className={cn(
                                "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all",
                                formData.semester === sem 
                                  ? "bg-white text-blue-600 shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700 disabled:opacity-50"
                              )}
                            >
                              {sem === '1º Semestre' ? '1º Sem.' : sem === '2º Semestre' ? '2º Sem.' : 'Ambos'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 space-y-2">
                      <label className="text-xs font-bold text-slate-700">Disciplinas {formData.year === 'Curso Extra' ? '(Até 4 por Ano)' : '(Até 2 por Semestre)'}</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(formData.year === 'Curso Extra' ? [0, 1, 2, 3] : [0, 1]).map((index) => (
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
                                 const sSem = (s as any).semester?.includes('1º') ? '1º Semestre' : (s as any).semester?.includes('2º') ? '2º Semestre' : (s as any).semester;

                                 const isCursoExtraClass = formData.year === 'Curso Extra';
                                 
                                 const matchesYear = isCursoExtraClass || !formData.year || !(s as any).year || (s as any).year === formData.year;
                                 let matchesSemester = !formData.semester || !sSem || sSem === formData.semester;

                                 if (isCursoExtraClass) {
                                   if (formData.semester === 'Ano Inteiro') {
                                     matchesSemester = true;
                                   } else {
                                     // If a specific semester is chosen for extra course, maybe we still want to show all but prioritize?
                                     // The user asked to permit selecting simultaneously.
                                     // So if "Ano Inteiro" or "Ambos" is selected, it should work.
                                     matchesSemester = true; // Let's make it always true for Curso Extra to be simple
                                   }
                                 }

                                 const isActiveOrSelected = (s as any).status === 'Ativo' || formData.subject_ids?.includes(s.id);
                                 return matchesYear && matchesSemester && isActiveOrSelected;
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
                        const isCursoExtraClass = formData.year === 'Curso Extra';
                        const matchesYear = isCursoExtraClass || !formData.year || !s.year || s.year === formData.year;
                        const matchesSemester = isCursoExtraClass || !formData.semester || !sSem || sSem === formData.semester;
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
              <h2 className="text-[14pt] font-black uppercase tracking-widest">FICHA DA TURMA</h2>
              <span className="text-[10pt] font-bold">Turma: {selectedClass.code}</span>
            </div>

            {/* Content Section */}
            <div className="space-y-6 flex-1">
              <div className="grid grid-cols-1 gap-4">
                <div className="border-b border-black/10 pb-2">
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Nome do Curso / Turma</p>
                  <p className="text-[12pt] font-black uppercase text-[#00174b]">{selectedClass.name}</p>
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
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
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
                  <p className="text-[10pt] font-black uppercase tracking-widest text-[#00174b]">Assinatura da Secretaria</p>
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
