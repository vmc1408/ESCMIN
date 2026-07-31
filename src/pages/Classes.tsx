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
  Edit,
  ArrowLeft,
  RefreshCw,
  ArrowRight,
  GraduationCap,
  Layers
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
  subject_id?: string;
  subject_id_sem1?: string;
  subject_id_sem2?: string;
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
  status?: string;
  teacher_id?: string;
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
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Todos');
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

  const [acadSettings, setAcadSettings] = useState<any>(null);
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('Todos');
  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState<string>('Todos');

  // Import / Promotion Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSourceClassId, setImportSourceClassId] = useState('');
  const [importTargetYear, setImportTargetYear] = useState('2º Ano');
  const [importNewName, setImportNewName] = useState('');
  const [importNewCode, setImportNewCode] = useState('');
  const [importSem1SubjectId, setImportSem1SubjectId] = useState('');
  const [importSem2SubjectId, setImportSem2SubjectId] = useState('');
  const [importMigrateStudents, setImportMigrateStudents] = useState(true);
  const [importDeactivateSource, setImportDeactivateSource] = useState(false);
  const [sourceStudentsCount, setSourceStudentsCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  // Automatic semester determination consulting academic calendar dates
  const autoSemester = React.useMemo(() => {
    const now = new Date();
    let settings = acadSettings;
    if (!settings) {
      try {
        const stored = localStorage.getItem('academic_settings_current');
        if (stored) settings = JSON.parse(stored);
      } catch (e) {}
    }

    if (settings && settings.term2_start) {
      const t2Start = new Date(settings.term2_start + 'T00:00:00');
      const t2End = settings.term2_end ? new Date(settings.term2_end + 'T23:59:59') : null;
      if (now >= t2Start && (!t2End || now <= t2End)) {
        return '2º Semestre';
      }
      if (settings.term1_start) {
        const t1Start = new Date(settings.term1_start + 'T00:00:00');
        const t1End = settings.term1_end ? new Date(settings.term1_end + 'T23:59:59') : null;
        if (now >= t1Start && t1End && now <= t1End) {
          return '1º Semestre';
        }
      }
    }

    // Default calendar fallback: Jan-Jun = 1º Semestre, Jul-Dec = 2º Semestre
    return (now.getMonth() + 1) >= 7 ? '2º Semestre' : '1º Semestre';
  }, [acadSettings]);

  // Derived single subject ID for 1º and 2º semester in formData
  const sem1SubjectId = React.useMemo(() => {
    if (formData.subject_id_sem1 !== undefined && formData.subject_id_sem1 !== null) {
      return formData.subject_id_sem1;
    }
    const currentIds = formData.subject_ids || [];
    if (currentIds.length === 0) return '';
    
    // Check if there is a subject explicitly designated as 1st semester
    const explicit1 = currentIds.find(id => {
      if (!id) return false;
      const s = subjects.find(sub => sub.id === id);
      if (!s) return false;
      const sem = (s.semester || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return sem.includes('1') || name.includes('1º') || name.includes('1°') || name.includes('1 sem');
    });
    if (explicit1) return explicit1;

    // If first item is explicitly 2nd semester only
    const firstSub = currentIds[0] ? subjects.find(sub => sub.id === currentIds[0]) : null;
    if (firstSub) {
      const sem = (firstSub.semester || '').toLowerCase();
      const name = (firstSub.name || '').toLowerCase();
      if ((sem.includes('2') || name.includes('2º') || name.includes('2 sem')) && !sem.includes('1') && !name.includes('1º')) {
        return '';
      }
    }

    return currentIds[0] || '';
  }, [formData.subject_id_sem1, formData.subject_ids, subjects]);

  const sem2SubjectId = React.useMemo(() => {
    if (formData.subject_id_sem2 !== undefined && formData.subject_id_sem2 !== null) {
      return formData.subject_id_sem2;
    }
    const currentIds = formData.subject_ids || [];
    if (currentIds.length === 0) return '';

    // Check if there is a subject explicitly designated as 2nd semester
    const explicit2 = currentIds.find(id => {
      if (!id) return false;
      const s = subjects.find(sub => sub.id === id);
      if (!s) return false;
      const sem = (s.semester || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return sem.includes('2') || name.includes('2º') || name.includes('2°') || name.includes('2 sem');
    });
    if (explicit2 && explicit2 !== sem1SubjectId) return explicit2;

    // If array has 2 items, return index 1 if it differs from sem1
    if (currentIds.length > 1 && currentIds[1] && currentIds[1] !== sem1SubjectId) {
      return currentIds[1];
    }

    // If single item, check if it differs from sem1
    return currentIds.find(id => id && id !== sem1SubjectId) || '';
  }, [formData.subject_id_sem2, formData.subject_ids, subjects, sem1SubjectId]);

  const handleSetSemesterSubject = (semesterNum: 1 | 2, subjectId: string) => {
    let s1 = semesterNum === 1 ? subjectId : (formData.subject_id_sem1 !== undefined && formData.subject_id_sem1 !== null ? formData.subject_id_sem1 : sem1SubjectId);
    let s2 = semesterNum === 2 ? subjectId : (formData.subject_id_sem2 !== undefined && formData.subject_id_sem2 !== null ? formData.subject_id_sem2 : sem2SubjectId);

    if (semesterNum === 1 && s1 === s2) s2 = '';
    if (semesterNum === 2 && s2 === s1) s1 = '';

    const newSubjectIds = Array.from(new Set([s1, s2])).filter(Boolean);

    setFormData({
      ...formData,
      subject_id_sem1: s1,
      subject_id_sem2: s2,
      subject_ids: newSubjectIds
    });
  };

  const getSemOptions = (semesterNum: 1 | 2, currentSlotValue?: string) => {
    return subjects.filter(s => {
      const isCursoExtraClass = formData.year === 'Curso Extra';
      const matchesYear = isCursoExtraClass || !formData.year || !s.year || s.year === formData.year;

      const semField = (s.semester || '').toLowerCase();
      const nameField = (s.name || '').toLowerCase();
      const textToTest = `${semField} ${nameField}`;

      let matchesSem = true;

      const has1 = textToTest.includes('1º') || textToTest.includes('1°') || textToTest.includes('1º sem') || textToTest.includes('1 sem') || textToTest.includes('1º semestre') || semField === '1';
      const has2 = textToTest.includes('2º') || textToTest.includes('2°') || textToTest.includes('2º sem') || textToTest.includes('2 sem') || textToTest.includes('2º semestre') || semField === '2';
      const isBoth = semField.includes('ambos') || semField.includes('anual') || nameField.includes('ambos') || nameField.includes('anual');

      if (!isBoth) {
        if (semesterNum === 1) {
          if (has2 && !has1) matchesSem = false;
        } else if (semesterNum === 2) {
          if (has1 && !has2) matchesSem = false;
        }
      }

      const isActiveOrSelected = s.status === 'Ativo' || (formData.subject_ids || []).includes(s.id) || s.id === currentSlotValue;
      return matchesYear && matchesSem && isActiveOrSelected;
    });
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchClasses = React.useCallback(async () => {
    setLoading(true);
    try {
      const [classesData, subjectsData, instData, acadSettingsData] = await Promise.all([
        fetchAll('classes', '*', 'name', true),
        fetchAll('subjects', 'id, name, code, year, semester, status, program_content', 'name', true),
        fetchAll('institution_settings'),
        fetchAll('academic_settings').catch(() => [])
      ]);

      if (acadSettingsData && acadSettingsData.length > 0) {
        const currentSettings = acadSettingsData.find((s: any) => s.id === 'current') || acadSettingsData[0];
        setAcadSettings(currentSettings);
      }
      
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
        let metaSem1 = (normalized as any).subject_id_sem1 || '';
        let metaSem2 = (normalized as any).subject_id_sem2 || '';

        if (normalized.observations) {
          const match = normalized.observations.match(/\[METADATA:(\{[\s\S]*\})\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.year) normalized.year = meta.year;
              if (!normalized.semester) normalized.semester = meta.semester || meta.semester_id;
              if (meta.subject_id_sem1 !== undefined) metaSem1 = meta.subject_id_sem1;
              if (meta.subject_id_sem2 !== undefined) metaSem2 = meta.subject_id_sem2;
              if (meta.subject_ids && Array.isArray(meta.subject_ids) && meta.subject_ids.length > 0) {
                sIds = meta.subject_ids;
              } else if (sIds.length === 0 && meta.subject_id) {
                sIds = [meta.subject_id];
              }
              isSpecial = !!meta.is_special;
            } catch (e) {}
          }
        }

        // Infer sem1 / sem2 if missing
        if ((!metaSem1 && !metaSem2) && sIds.length > 0) {
          const loadedSubs = sIds.map(sid => normalizedSubjects.find(s => s.id === sid)).filter(Boolean);
          const isSem1Sub = (s: any) => {
            const sem = (s?.semester || '').toLowerCase();
            const name = (s?.name || '').toLowerCase();
            return sem.includes('1') || name.includes('1º') || name.includes('1°') || name.includes('1 sem');
          };
          const isSem2Sub = (s: any) => {
            const sem = (s?.semester || '').toLowerCase();
            const name = (s?.name || '').toLowerCase();
            return sem.includes('2') || name.includes('2º') || name.includes('2°') || name.includes('2 sem');
          };

          const exp1 = loadedSubs.find(s => isSem1Sub(s));
          const exp2 = loadedSubs.find(s => isSem2Sub(s));

          if (exp1) metaSem1 = exp1.id;
          if (exp2 && exp2.id !== metaSem1) metaSem2 = exp2.id;

          if (!metaSem1 && !metaSem2) {
            if (sIds.length === 1 && loadedSubs[0]) {
              if (isSem2Sub(loadedSubs[0]) && !isSem1Sub(loadedSubs[0])) {
                metaSem2 = sIds[0];
              } else {
                metaSem1 = sIds[0];
              }
            } else {
              metaSem1 = sIds[0] || '';
              metaSem2 = sIds[1] || '';
            }
          }
        }

        const consolidatedSids = Array.from(new Set([metaSem1, metaSem2, ...sIds])).filter(Boolean);

        (normalized as any).subject_id_sem1 = metaSem1;
        (normalized as any).subject_id_sem2 = metaSem2;
        normalized.subject_ids = consolidatedSids;
        (normalized as any).is_special = isSpecial;

        // Automatic semester based on class subjects or calendar date if not manually set
        if (!normalized.semester) {
          const clsSubs = consolidatedSids.map(sid => normalizedSubjects.find(s => s.id === sid)).filter(Boolean);
          const hasSem1 = clsSubs.some(s => (s?.semester || '').includes('1'));
          const hasSem2 = clsSubs.some(s => (s?.semester || '').includes('2'));
          if (hasSem1 && hasSem2) {
            normalized.semester = 'Anual';
          } else if (hasSem1) {
            normalized.semester = '1º Semestre';
          } else if (hasSem2) {
            normalized.semester = '2º Semestre';
          } else {
            normalized.semester = 'Anual';
          }
        }

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
      start_date: cls.start_date || '',
      subject_id_sem1: (cls as any).subject_id_sem1 || '',
      subject_id_sem2: (cls as any).subject_id_sem2 || '',
      subject_ids: cls.subject_ids || []
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
          if (iframe.contentWindow) {
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
              console.warn("Could not add afterprint listener on Classes iframe:", e);
              setTimeout(cleanup, 15000);
            }
            try {
              iframe.contentWindow.print();
            } catch (e) {
              console.warn("Print call failed on Classes iframe, downloading PDF instead:", e);
              doc.save("Lista_Turmas.pdf");
              setNotification({
                type: 'success',
                message: 'A impressão direta em iframe foi bloqueada pelo navegador. O arquivo PDF foi baixado para você imprimir manualmente.'
              });
              cleanup();
            }

            // Long fallback to clean up iframe in case afterprint doesn't trigger
            setTimeout(cleanup, 300000);
          } else {
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
      subject_id_sem1: '',
      subject_id_sem2: '',
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
      
      const s1 = formData.subject_id_sem1 !== undefined && formData.subject_id_sem1 !== null ? formData.subject_id_sem1 : sem1SubjectId;
      const s2 = formData.subject_id_sem2 !== undefined && formData.subject_id_sem2 !== null ? formData.subject_id_sem2 : sem2SubjectId;
      const cleanSubjectIds = Array.from(new Set([s1, s2])).filter(Boolean);

      const syncData = {
        ...formData,
        start_date: parseDateToDB(formData.start_date),
        subject_id: s1 || s2 || null,
        subject_id_sem1: s1 || null,
        subject_id_sem2: s2 || null,
        subject_ids: cleanSubjectIds
      };

      // PROACTIVE METADATA SYNC:
      // Always sync year, semester, subject_id_sem1, subject_id_sem2, subject_ids and is_special into observations metadata 
      // before saving. This ensures data persistence even if Supabase columns are missing.
      const metadata: any = {};
      if (formData.year) metadata.year = formData.year;
      if (formData.semester) metadata.semester = formData.semester;
      metadata.subject_id_sem1 = s1 || '';
      metadata.subject_id_sem2 = s2 || '';
      metadata.subject_ids = cleanSubjectIds;
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
        subject_id_sem1: s1,
        subject_id_sem2: s2,
        subject_ids: cleanSubjectIds,
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

  const setupImportModalDefaults = async (sourceClass: Class, customCode?: string) => {
    let nextYr = '2º Ano';
    if (sourceClass.year === '1º Ano') nextYr = '2º Ano';
    else if (sourceClass.year === '2º Ano') nextYr = '3º Ano';
    else if (sourceClass.year === '3º Ano') nextYr = '4º Ano';
    else if (sourceClass.year === '4º Ano') nextYr = 'Curso Extra';
    else nextYr = sourceClass.year || '2º Ano';

    setImportTargetYear(nextYr);

    let suggestedName = sourceClass.name;
    if (/\b20\d\d\b/.test(sourceClass.name)) {
      suggestedName = sourceClass.name.replace(/\b20\d\d\b/, (yrStr) => String(parseInt(yrStr, 10) + 1));
    } else if (sourceClass.year && suggestedName.toUpperCase().includes(sourceClass.year.toUpperCase())) {
      suggestedName = suggestedName.replace(new RegExp(sourceClass.year, 'gi'), nextYr);
    } else {
      suggestedName = `${sourceClass.name} - ${nextYr}`;
    }

    setImportNewName(suggestedName.toUpperCase());
    if (customCode) setImportNewCode(customCode);

    const sem1 = subjects.find(s => (s.year === nextYr || s.year === 'Curso Extra') && (s.semester || '').includes('1'));
    const sem2 = subjects.find(s => (s.year === nextYr || s.year === 'Curso Extra') && (s.semester || '').includes('2'));

    setImportSem1SubjectId(sem1 ? sem1.id : '');
    setImportSem2SubjectId(sem2 ? sem2.id : '');

    try {
      const [enrollments, studentsData] = await Promise.all([
        fetchAll('enrollments').catch(() => []),
        fetchAll('students').catch(() => [])
      ]);

      const sourceEnr = (enrollments || []).filter((e: any) => e.class_id === sourceClass.id && (e.status || 'Ativo') === 'Ativo');
      const directStudents = (studentsData || []).filter((s: any) => s.class_id === sourceClass.id && (s.status || 'Ativo') === 'Ativo');

      const uniqueStudentIds = new Set([
        ...sourceEnr.map((e: any) => e.student_id),
        ...directStudents.map((s: any) => s.id)
      ]);

      setSourceStudentsCount(uniqueStudentIds.size);
    } catch (err) {
      setSourceStudentsCount(0);
    }
  };

  const handleOpenImportModal = async () => {
    const maxCode = classes.reduce((max, c) => {
      const num = parseInt(c.code, 10);
      return !isNaN(num) ? Math.max(max, num) : max;
    }, 0);
    const nextCode = String(maxCode + 1).padStart(3, '0');

    const activeCls = classes.find(c => (c.status || 'Ativo') === 'Ativo') || classes[0];

    if (activeCls) {
      setImportSourceClassId(activeCls.id);
      await setupImportModalDefaults(activeCls, nextCode);
    } else {
      setImportSourceClassId('');
      setImportNewCode(nextCode);
      setImportNewName('');
      setImportTargetYear('2º Ano');
      setSourceStudentsCount(0);
    }

    setShowImportModal(true);
  };

  const handleExecuteImport = async () => {
    if (!importSourceClassId || !importNewName) {
      alert('Por favor, selecione a turma de origem e informe o nome da nova turma.');
      return;
    }

    const sourceClass = classes.find(c => c.id === importSourceClassId);
    if (!sourceClass) return;

    try {
      setIsImporting(true);

      const targetSubjects = [importSem1SubjectId, importSem2SubjectId].filter(Boolean);

      const newClassData: Partial<Class> = {
        name: importNewName,
        code: importNewCode || String(Date.now()).slice(-3),
        year: importTargetYear,
        period: sourceClass.period || 'Tarde',
        days_of_week: sourceClass.days_of_week || [],
        room: sourceClass.room || '',
        status: 'Ativo',
        subject_id: importSem1SubjectId || importSem2SubjectId || undefined,
        subject_ids: [importSem1SubjectId, importSem2SubjectId],
        start_date: new Date().toISOString().split('T')[0],
        observations: `[METADATA:${JSON.stringify({
          year: importTargetYear,
          subject_ids: [importSem1SubjectId, importSem2SubjectId],
          imported_from: sourceClass.id
        })}] Turma promovida/importada de ${sourceClass.name} (${sourceClass.year || 'Ano Anterior'})`
      };

      const newClassId = await saveData('classes', undefined, newClassData);

      let migratedStudentsCount = 0;

      if (importMigrateStudents) {
        const [allEnrollments, allStudents] = await Promise.all([
          fetchAll('enrollments').catch(() => []),
          fetchAll('students').catch(() => [])
        ]);

        const activeSourceEnrollments = (allEnrollments || []).filter((e: any) => e.class_id === sourceClass.id && (e.status || 'Ativo') === 'Ativo');
        const activeSourceStudents = (allStudents || []).filter((s: any) => s.class_id === sourceClass.id && (s.status || 'Ativo') === 'Ativo');

        const studentIdsToMigrate = Array.from(new Set([
          ...activeSourceEnrollments.map((e: any) => e.student_id),
          ...activeSourceStudents.map((s: any) => s.id)
        ]));

        migratedStudentsCount = studentIdsToMigrate.length;

        for (const studentId of studentIdsToMigrate) {
          await saveData('enrollments', undefined, {
            student_id: studentId,
            class_id: newClassId,
            status: 'Ativo',
            enrollment_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });

          await saveData('students', studentId, { class_id: newClassId });
        }
      }

      if (importDeactivateSource) {
        await saveData('classes', sourceClass.id, { ...sourceClass, status: 'Inativo' });
      }

      setShowImportModal(false);
      await fetchClasses();

      const createdClass = {
        ...newClassData,
        id: newClassId
      } as Class;

      setSelectedClass(createdClass);
      setFormData(createdClass);

      setNotification({
        type: 'success',
        message: `Turma "${importNewName}" importada com sucesso para o ${importTargetYear}! ${migratedStudentsCount} aluno(s) matriculado(s).`
      });

    } catch (error: any) {
      console.error('Error importing class:', error);
      alert('Erro ao importar turma: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const filteredClasses = React.useMemo(() => {
    let result = classes.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'Todos' || (c.status || 'Ativo') === statusFilter;
      
      const matchesYear = selectedYearFilter === 'Todos' || (c.year || '1º Ano') === selectedYearFilter;

      const matchesSemester = (() => {
        if (selectedSemesterFilter === 'Todos') return true;

        const semStr = (c.semester || '').toLowerCase();
        
        // If class is Anual / 1º e 2º / Ambos, it belongs to both semesters
        if (semStr.includes('anual') || semStr.includes('1º e 2º') || semStr.includes('ambos') || semStr.includes('1º/2º')) return true;

        const clsSubs = (c.subject_ids || []).map(sid => subjects.find(s => s.id === sid)).filter(Boolean);

        if (selectedSemesterFilter === '1º Semestre' || selectedSemesterFilter === '1º Sem') {
          if (semStr.includes('1')) return true;
          return clsSubs.some(s => (s?.semester || '').includes('1'));
        }

        if (selectedSemesterFilter === '2º Semestre' || selectedSemesterFilter === '2º Sem') {
          if (semStr.includes('2')) return true;
          return clsSubs.some(s => (s?.semester || '').includes('2'));
        }

        return true;
      })();

      return matchesSearch && matchesStatus && matchesYear && matchesSemester;
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
  }, [classes, subjects, searchTerm, statusFilter, selectedYearFilter, selectedSemesterFilter, sortBy]);

  const actualListCollapsed = selectedClass !== null || isEditing;

  return (
    <div className="h-[calc(100vh-6rem)] relative flex flex-col lg:flex-row gap-4 w-full p-4 overflow-hidden bg-slate-100/40">
      {/* Sidebar / List Panel */}
      <div 
        className={cn(
          "bg-white rounded-none shadow-xl flex flex-col border border-slate-200 overflow-hidden flex-shrink-0 transition-all duration-300",
          selectedClass || isEditing ? "hidden lg:flex lg:w-[360px] xl:w-[400px]" : "w-full lg:w-[360px] xl:w-[400px]"
        )}
      >
        <div className="flex-[1] flex flex-col overflow-hidden w-full bg-white">
          <div className="p-6 border-b border-slate-100 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Turmas</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-0.5">Gestão de Grupos Acadêmicos</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={handleOpenImportModal}
                  className="px-2.5 py-2 bg-blue-800 text-white rounded-none hover:bg-blue-900 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer text-[10px] font-bold uppercase tracking-wider"
                  title="IMPORTAR / PROMOVER TURMA DE UM ANO A OUTRO"
                >
                  <RefreshCw size={14} />
                  <span className="hidden sm:inline">Importar</span>
                </button>
                <button 
                  onClick={handleNew}
                  className="w-9 h-9 bg-slate-800 text-white rounded-none hover:bg-slate-900 transition-all flex items-center justify-center shadow-sm cursor-pointer active:scale-95"
                  title="NOVA TURMA"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={15} />
                <input 
                  type="text"
                  placeholder="Buscar por nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-none text-xs font-bold focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Semester Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none border-b border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1 mr-1">SEM:</span>
                {['Todos', '1º Semestre', '2º Semestre'].map((sem) => (
                  <button
                    key={sem}
                    type="button"
                    onClick={() => setSelectedSemesterFilter(sem)}
                    className={cn(
                      "px-2 py-1 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border flex items-center gap-1 cursor-pointer",
                      selectedSemesterFilter === sem
                        ? "bg-blue-800 text-white border-blue-800 shadow-xs"
                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800"
                    )}
                  >
                    <span>{sem === 'Todos' ? 'Todos os Semestres' : sem.replace(' Semestre', 'º Sem')}</span>
                  </button>
                ))}
              </div>

              {/* Year Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none border-b border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1 mr-1">ANO:</span>
                {['Todos', '1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((yr) => {
                  const count = yr === 'Todos' 
                    ? classes.length 
                    : classes.filter(c => (c.year || '1º Ano') === yr).length;
                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setSelectedYearFilter(yr)}
                      className={cn(
                        "px-2 py-1 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border flex items-center gap-1 cursor-pointer",
                        selectedYearFilter === yr
                          ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800"
                      )}
                    >
                      <span>{yr === 'Todos' ? 'Todos' : yr}</span>
                      <span className={cn(
                        "px-1 text-[8px] font-mono",
                        selectedYearFilter === yr ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-none text-[9px] font-bold text-slate-600 uppercase tracking-wider focus:ring-2 focus:ring-slate-500/10 outline-none transition-all cursor-pointer"
                >
                  <option value="name_year">Nome e Ano (Recente)</option>
                  <option value="name">Nome (A-Z)</option>
                  <option value="code">Código</option>
                  <option value="year">Ano Letivo</option>
                  <option value="period">Período</option>
                </select>
                
                <div className="flex bg-slate-100/80 p-1 rounded-none border border-slate-200">
                  {(['Todos', 'Ativo', 'Inativo'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "flex-1 py-1 text-[9px] font-bold uppercase tracking-wider rounded-none transition-all",
                        statusFilter === status
                          ? "bg-white text-slate-900 shadow-xs border border-slate-200" 
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

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3 opacity-50">
                <div className="w-8 h-8 border-3 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Sincronizando...</p>
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-3">
                <Search size={32} />
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

      {/* Main Content Area */}
      <div 
        className={cn(
          "bg-white rounded-none shadow-xl border border-slate-200 flex-1 flex flex-col overflow-hidden relative transition-all duration-300",
          selectedClass || isEditing ? "w-full flex" : "hidden lg:flex"
        )}
      >
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
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/20">
              <button
                type="button"
                onClick={() => {
                  setSelectedClass(null);
                  setIsEditing(false);
                }}
                className="mb-4 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft size={14} />
                <span>Ver Lista Completa de Turmas</span>
              </button>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-none bg-slate-800 text-white shadow-md flex items-center justify-center flex-shrink-0">
                  <School size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-none uppercase">
                    {isEditing ? (selectedClass ? 'Editar Registro' : 'Novo Lançamento') : formData.name}
                  </h3>
                  <div className="flex items-center gap-2.5 mt-2.5">
                    <span className="px-2.5 py-0.5 bg-white border border-slate-200 rounded-none text-[10px] font-bold text-slate-500 uppercase tracking-widest shadow-xs">
                      ID: {formData.code || '---'}
                    </span>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2.5 py-0.5 rounded-none text-[9px] font-bold uppercase tracking-widest border shadow-xs",
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
                                    const isCursoExtraClass = newYear === 'Curso Extra';
                                    const matchesYear = isCursoExtraClass || !newYear || !s.year || s.year === newYear;
                                    return matchesYear;
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
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Semestre Atual da Turma</label>
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200/80 uppercase tracking-wider flex items-center gap-1">
                              Automático (Calendário)
                            </span>
                          </div>
                          <div className="flex bg-slate-100 rounded-none p-1.5 gap-1.5 shadow-inner border border-slate-200/50">
                            {(formData.year === 'Curso Extra' ? ['1º Semestre', '2º Semestre', 'Ano Inteiro'] : ['1º Semestre', '2º Semestre']).map((sem) => {
                              const isActiveSem = (formData.semester || autoSemester) === sem;
                              return (
                                <button
                                  key={sem}
                                  type="button"
                                  disabled={!isEditing}
                                  onClick={() => {
                                    setFormData({...formData, semester: sem});
                                  }}
                                  className={cn(
                                    "flex-1 py-3 text-[10px] font-bold rounded-none uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5",
                                    isActiveSem 
                                      ? "bg-white text-slate-800 shadow-md border border-slate-100" 
                                      : "text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                  )}
                                >
                                  {isActiveSem && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                                  {sem === '1º Semestre' ? '1º Semestre' : sem === '2º Semestre' ? '2º Semestre' : 'Anual'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Matriz Curricular Ativa (1 Disciplina por Semestre) */}
                    <div className="col-span-12 space-y-5 pt-4">
                      <div className="flex items-baseline justify-between ml-1 pb-1 border-b border-slate-100">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <BookOpen size={14} className="text-slate-400" />
                          Matriz Curricular Ativa (1 Disciplina por Semestre)
                        </label>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Máximo de 1 disciplina no 1º sem e 1 no 2º sem
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* 1º SEMESTRE */}
                        <div className="p-4 bg-blue-50/40 border border-blue-100/80 rounded-none space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-800 bg-blue-100/90 px-2 py-0.5 uppercase tracking-wider border border-blue-200/60">
                              1º Semestre
                            </span>
                            <span className="text-[9px] font-bold text-blue-600/80 uppercase tracking-tight">
                              {sem1SubjectId ? '1 de 1 Definida' : '0 de 1 Definida'}
                            </span>
                          </div>

                          <div className="relative group">
                            <select 
                              disabled={!isEditing}
                              value={sem1SubjectId}
                              onChange={(e) => handleSetSemesterSubject(1, e.target.value)}
                              className="w-full pl-4 pr-10 py-3.5 bg-white border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 disabled:opacity-70 disabled:cursor-not-allowed outline-none transition-all shadow-xs appearance-none group-hover:border-slate-300"
                            >
                              <option value="">Selecionar Disciplina do 1º Semestre...</option>
                              {getSemOptions(1, sem1SubjectId).map(subject => (
                                <option 
                                  key={subject.id} 
                                  value={subject.id}
                                  disabled={subject.id === sem2SubjectId}
                                >
                                  [{subject.code}] {subject.name.toUpperCase()}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:rotate-180 transition-transform pointer-events-none" />
                          </div>
                        </div>

                        {/* 2º SEMESTRE */}
                        <div className="p-4 bg-emerald-50/40 border border-emerald-100/80 rounded-none space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 uppercase tracking-wider border border-emerald-200/60">
                              2º Semestre
                            </span>
                            <span className="text-[9px] font-bold text-emerald-600/80 uppercase tracking-tight">
                              {sem2SubjectId ? '1 de 1 Definida' : '0 de 1 Definida'}
                            </span>
                          </div>

                          <div className="relative group">
                            <select 
                              disabled={!isEditing}
                              value={sem2SubjectId}
                              onChange={(e) => handleSetSemesterSubject(2, e.target.value)}
                              className="w-full pl-4 pr-10 py-3.5 bg-white border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 disabled:opacity-70 disabled:cursor-not-allowed outline-none transition-all shadow-xs appearance-none group-hover:border-slate-300"
                            >
                              <option value="">Selecionar Disciplina do 2º Semestre...</option>
                              {getSemOptions(2, sem2SubjectId).map(subject => (
                                <option 
                                  key={subject.id} 
                                  value={subject.id}
                                  disabled={subject.id === sem1SubjectId}
                                >
                                  [{subject.code}] {subject.name.toUpperCase()}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:rotate-180 transition-transform pointer-events-none" />
                          </div>
                        </div>
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
          <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 md:p-8 space-y-6 bg-slate-50/40">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                  <School className="text-slate-800" size={26} />
                  <span>Gestão Geral de Turmas</span>
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Visão completa dos grupos acadêmicos organizados por ano letivo
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={handleOpenImportModal}
                  className="px-4 py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                  title="Importar turma de um ano para o próximo com alunos e disciplinas"
                >
                  <RefreshCw size={15} />
                  <span>Importar Turma (Próximo Ano)</span>
                </button>
                <button
                  onClick={handleNew}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={16} />
                  <span>Nova Turma</span>
                </button>
              </div>
            </div>

            {/* Quick Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-11 h-11 bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-base flex-shrink-0">
                  {classes.length}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Cadastradas</p>
                  <p className="text-xs font-bold text-slate-800 uppercase">Turmas no Sistema</p>
                </div>
              </div>

              <div className="bg-white p-4 border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-11 h-11 bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold text-base flex-shrink-0">
                  {classes.filter(c => (c.status || 'Ativo') === 'Ativo').length}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Status Ativo</p>
                  <p className="text-xs font-bold text-slate-800 uppercase">Turmas Ativas</p>
                </div>
              </div>

              <div className="bg-white p-4 border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-11 h-11 bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold text-base flex-shrink-0">
                  {autoSemester.replace(' Semestre', 'º Sem')}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Calendário Acadômico</p>
                  <p className="text-xs font-bold text-slate-800 uppercase">Semestre Vigente</p>
                </div>
              </div>
            </div>

            {/* Grid of All Classes */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col space-y-2 bg-white p-3 border border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Semester Filter Bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filtrar por Semestre:</span>
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                      {['Todos', '1º Semestre', '2º Semestre'].map((sem) => (
                        <button
                          key={sem}
                          type="button"
                          onClick={() => setSelectedSemesterFilter(sem)}
                          className={cn(
                            "px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer",
                            selectedSemesterFilter === sem
                              ? "bg-blue-800 text-white border-blue-800 shadow-2xs"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          {sem === 'Todos' ? 'Todos os Semestres' : sem}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Class counter */}
                  <span className="text-[10px] font-bold text-slate-400">({filteredClasses.length} turmas encontradas)</span>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  {/* Year Filter Bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filtrar por Ano Letivo:</span>
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                      {['Todos', '1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((yr) => {
                        const count = yr === 'Todos' 
                          ? classes.length 
                          : classes.filter(c => (c.year || '1º Ano') === yr).length;
                        return (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => setSelectedYearFilter(yr)}
                            className={cn(
                              "px-3 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border flex items-center gap-1.5 cursor-pointer",
                              selectedYearFilter === yr
                                ? "bg-slate-800 text-white border-slate-800 shadow-2xs"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                            )}
                          >
                            <span>{yr === 'Todos' ? 'Todos os Anos' : yr}</span>
                            <span className={cn(
                              "px-1.5 py-0.2 text-[9px] font-mono font-bold",
                              selectedYearFilter === yr ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                            )}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {filteredClasses.length === 0 ? (
                <div className="bg-white p-12 text-center border border-slate-200 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase">Nenhuma turma encontrada com o filtro atual</p>
                  <button
                    onClick={() => { setSearchTerm(''); setStatusFilter('Todos'); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Exibir Todas as Turmas
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredClasses.map((cls) => {
                    const clsSubs = (cls.subject_ids || []).map(sid => subjects.find(s => s.id === sid)).filter(Boolean);
                    const sem1Sub = clsSubs.find(s => (s?.semester || '').includes('1'));
                    const sem2Sub = clsSubs.find(s => (s?.semester || '').includes('2'));

                    return (
                      <div 
                        key={cls.id}
                        onClick={() => handleSelectClass(cls)}
                        className="bg-white border border-slate-200 hover:border-slate-400 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group space-y-4"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 bg-slate-800 text-white font-mono text-[10px] font-bold tracking-wider">
                              {cls.code}
                            </span>
                            <span className={cn(
                              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border",
                              (cls.status || 'Ativo') === 'Ativo' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                            )}>
                              {cls.status || 'Ativo'}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-900 transition-colors uppercase leading-snug pt-1">
                            {cls.name}
                          </h4>

                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <span>{cls.year || 'Ano N/D'}</span>
                            <span>•</span>
                            <span>{cls.period || 'Período N/D'}</span>
                            {cls.room && (
                              <>
                                <span>•</span>
                                <span>Sala {cls.room}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Linked Subjects Summary */}
                        <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[10px]">
                          <div className="flex items-center gap-1.5 text-blue-900 font-bold truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0"></span>
                            <span className="text-slate-400 uppercase text-[9px]">1º Sem:</span>
                            <span className="truncate uppercase">{sem1Sub ? sem1Sub.name : 'Nenhuma'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-emerald-900 font-bold truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0"></span>
                            <span className="text-slate-400 uppercase text-[9px]">2º Sem:</span>
                            <span className="truncate uppercase">{sem2Sub ? sem2Sub.name : 'Nenhuma'}</span>
                          </div>
                        </div>

                        <div className="pt-2 flex items-center justify-between text-[10px] font-bold text-slate-700 group-hover:text-slate-900 uppercase tracking-wider border-t border-slate-50">
                          <span>Abrir e Editar Turma</span>
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform text-slate-400 group-hover:text-slate-800" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Import / Transition Class Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-none shadow-2xl p-6 sm:p-8 max-w-2xl w-full space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto border border-slate-300">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-800 flex items-center justify-center font-bold">
                  <RefreshCw size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Importar / Promover Turma para Novo Ano</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trânsito de turma de um ano letivo para o seguinte</p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 text-xs">
              {/* Step 1: Select Source Class */}
              <div className="space-y-2 bg-slate-50 p-4 border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  1. Selecione a Turma de Origem (Ano Anterior) *
                </label>
                <select
                  value={importSourceClassId}
                  onChange={(e) => {
                    const srcId = e.target.value;
                    setImportSourceClassId(srcId);
                    const srcCls = classes.find(c => c.id === srcId);
                    if (srcCls) setupImportModalDefaults(srcCls);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-none font-bold text-slate-800 uppercase focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
                >
                  <option value="">-- SELECIONE A TURMA DE ORIGEM --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.name} ({c.year || 'Sem Ano'}) - {c.period}
                    </option>
                  ))}
                </select>

                {sourceStudentsCount > 0 && (
                  <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1.5 pt-1">
                    <Users size={13} />
                    <span>{sourceStudentsCount} aluno(s) ativo(s) detectado(s) nesta turma de origem.</span>
                  </p>
                )}
              </div>

              {/* Step 2: Configure Target Class */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1">
                  2. Configuração da Nova Turma de Destino
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Ano Letivo de Destino *
                    </label>
                    <select
                      value={importTargetYear}
                      onChange={(e) => {
                        const newYr = e.target.value;
                        setImportTargetYear(newYr);
                        const sem1 = subjects.find(s => (s.year === newYr || s.year === 'Curso Extra') && (s.semester || '').includes('1'));
                        const sem2 = subjects.find(s => (s.year === newYr || s.year === 'Curso Extra') && (s.semester || '').includes('2'));
                        setImportSem1SubjectId(sem1 ? sem1.id : '');
                        setImportSem2SubjectId(sem2 ? sem2.id : '');
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 font-bold text-slate-800 uppercase text-xs cursor-pointer"
                    >
                      <option value="1º Ano">1º Ano</option>
                      <option value="2º Ano">2º Ano</option>
                      <option value="3º Ano">3º Ano</option>
                      <option value="4º Ano">4º Ano</option>
                      <option value="Curso Extra">Curso Extra</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Código da Nova Turma
                    </label>
                    <input
                      type="text"
                      value={importNewCode}
                      onChange={(e) => setImportNewCode(e.target.value)}
                      placeholder="Ex: 005"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 font-mono font-bold text-slate-800 text-xs"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Nome da Nova Turma *
                    </label>
                    <input
                      type="text"
                      value={importNewName}
                      onChange={(e) => setImportNewName(e.target.value)}
                      placeholder="Ex: TEOLOGIA 2026"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 font-bold text-slate-800 uppercase text-xs"
                    />
                  </div>
                </div>

                {/* Subjects selection for Target Year */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-blue-50/50 border border-blue-200 space-y-1.5">
                    <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                      Disciplina 1º Semestre ({importTargetYear})
                    </label>
                    <select
                      value={importSem1SubjectId}
                      onChange={(e) => setImportSem1SubjectId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-blue-300 font-bold text-slate-800 uppercase text-[11px] cursor-pointer"
                    >
                      <option value="">-- Sem Disciplina 1º Sem --</option>
                      {subjects
                        .filter(s => (s.year === importTargetYear || importTargetYear === 'Curso Extra' || !s.year) && ((s.semester || '').includes('1') || !(s.semester || '').includes('2')))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            [{s.code}] {s.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="p-3 bg-emerald-50/50 border border-emerald-200 space-y-1.5">
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                      Disciplina 2º Semestre ({importTargetYear})
                    </label>
                    <select
                      value={importSem2SubjectId}
                      onChange={(e) => setImportSem2SubjectId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 font-bold text-slate-800 uppercase text-[11px] cursor-pointer"
                    >
                      <option value="">-- Sem Disciplina 2º Sem --</option>
                      {subjects
                        .filter(s => (s.year === importTargetYear || importTargetYear === 'Curso Extra' || !s.year) && (s.semester || '').includes('2'))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            [{s.code}] {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 3: Migration Options */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  3. Opções de Importação de Alunos
                </h4>

                <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 p-2.5 border border-slate-200">
                  <input
                    type="checkbox"
                    checked={importMigrateStudents}
                    onChange={(e) => setImportMigrateStudents(e.target.checked)}
                    className="w-4 h-4 text-blue-800 rounded-none focus:ring-0 cursor-pointer"
                  />
                  <span className="font-bold text-slate-800 text-xs">
                    Matricular automaticamente os {sourceStudentsCount} aluno(s) ativos da turma de origem na nova turma de {importTargetYear}
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 p-2.5 border border-slate-200">
                  <input
                    type="checkbox"
                    checked={importDeactivateSource}
                    onChange={(e) => setImportDeactivateSource(e.target.checked)}
                    className="w-4 h-4 text-blue-800 rounded-none focus:ring-0 cursor-pointer"
                  />
                  <span className="font-bold text-slate-800 text-xs">
                    Marcar turma de origem como "Inativa" (Concluída)
                  </span>
                </label>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold uppercase tracking-wider hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || !importSourceClassId || !importNewName}
                className="flex-1 py-3 bg-blue-800 text-white font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    <span>Confirmar e Importar Turma</span>
                  </>
                )}
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
                  <p className="text-[8pt] font-bold text-slate-400 uppercase mb-1">Disciplinas Vinculadas (Matriz Curricular)</p>
                  <div className="space-y-2 mt-2">
                    {(() => {
                      const classSubs = (selectedClass.subject_ids || [])
                        .map(sid => subjects.find(s => s.id === sid))
                        .filter(Boolean) as Subject[];
                      const printSem1 = classSubs.filter(s => (s.semester || '').includes('1'));
                      const printSem2 = classSubs.filter(s => (s.semester || '').includes('2'));
                      const printOther = classSubs.filter(s => !(s.semester || '').includes('1') && !(s.semester || '').includes('2'));

                      if (classSubs.length === 0) {
                        return <p className="text-[10pt] text-slate-400 italic">Nenhuma disciplina vinculada.</p>;
                      }

                      return (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[8.5pt] font-bold text-blue-800 uppercase tracking-wider mb-1">1º Semestre:</p>
                            {printSem1.length > 0 ? (
                              printSem1.map(s => (
                                <p key={s.id} className="text-[9.5pt] font-bold text-[#00174b] uppercase flex items-center gap-1.5 ml-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                  [{s.code}] {s.name}
                                </p>
                              ))
                            ) : (
                              <p className="text-[8.5pt] text-slate-400 italic ml-1">Nenhuma</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[8.5pt] font-bold text-emerald-800 uppercase tracking-wider mb-1">2º Semestre:</p>
                            {printSem2.length > 0 ? (
                              printSem2.map(s => (
                                <p key={s.id} className="text-[9.5pt] font-bold text-[#00174b] uppercase flex items-center gap-1.5 ml-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  [{s.code}] {s.name}
                                </p>
                              ))
                            ) : (
                              <p className="text-[8.5pt] text-slate-400 italic ml-1">Nenhuma</p>
                            )}
                          </div>
                          {printOther.length > 0 && (
                            <div className="col-span-2">
                              <p className="text-[8.5pt] font-bold text-slate-700 uppercase tracking-wider mb-1">Outras Disciplinas:</p>
                              {printOther.map(s => (
                                <p key={s.id} className="text-[9.5pt] font-bold text-[#00174b] uppercase flex items-center gap-1.5 ml-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                                  [{s.code}] {s.name}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
