import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  AlertTriangle,
  Printer,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Edit,
  ArrowLeft,
  RefreshCw,
  ArrowRight,
  GraduationCap,
  Layers,
  SlidersHorizontal,
  Lock,
  Unlock,
  Eye,
  FileSpreadsheet,
  Hash,
  CheckSquare,
  Square,
  UserCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn, maskDate, formatDateForDisplay, parseDateToDB, detectCourseFromClass } from '../lib/utils';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { supabase } from '../lib/supabase';
import { Course } from '../types';
import { RotateCcw, FileText as FileIcon } from 'lucide-react';

interface Class {
  id: string;
  code: string;
  name: string;
  course?: string;
  room?: string;
  status: 'Ativo' | 'Inativo' | 'Encerrada';
  days_of_week: string[];
  year?: string;
  start_year?: string;
  academic_year?: string;
  semester: string;
  subject_id?: string;
  subject_id_sem1?: string;
  subject_id_sem1_h1?: string;
  subject_id_sem1_h2?: string;
  subject_id_sem2?: string;
  subject_id_sem2_h1?: string;
  subject_id_sem2_h2?: string;
  subject_ids?: string[];
  start_date?: string;
  period?: 'Manhã' | 'Tarde' | 'Noite' | string;
  observations?: string;
  enabled_years?: string[];
  is_special?: boolean;
  unallocated?: boolean;
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
  program_content?: string;
}

const DAYS = [
  { label: 'Segunda', value: 'Segunda', dotColor: 'bg-blue-500' },
  { label: 'Terça', value: 'Terça', dotColor: 'bg-purple-500' },
  { label: 'Quarta', value: 'Quarta', dotColor: 'bg-emerald-500' },
  { label: 'Quinta', value: 'Quinta', dotColor: 'bg-amber-500' },
  { label: 'Sexta', value: 'Sexta', dotColor: 'bg-rose-500' },
  { label: 'Sábado', value: 'Sábado', dotColor: 'bg-indigo-500' },
  { label: 'Domingo', value: 'Domingo', dotColor: 'bg-cyan-500' },
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
  const isInactive = cls.status === 'Inativo';
  const isClosed = cls.status === 'Encerrada';

  return (
    <button
      onClick={() => onSelect(cls)}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-none transition-all text-left relative overflow-hidden group",
        isSelected 
          ? "bg-slate-800 text-white shadow-xl ring-1 ring-slate-400" 
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
          isInactive ? "bg-amber-500" : isClosed ? "bg-slate-400" : "bg-emerald-500"
        )} title={isInactive ? "Turma Inativa (Planejamento)" : isClosed ? "Turma Encerrada" : "Turma Ativa"} />
      </div>
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <p className={cn(
            "text-sm font-bold truncate tracking-tight uppercase",
            isSelected ? "text-white" : "text-slate-900"
          )}>{cls.name}</p>
          {isInactive && (
            <span className={cn(
              "px-1.5 py-0.5 text-[8px] font-black uppercase rounded-none leading-none tracking-normal border flex-shrink-0",
              isSelected 
                ? "bg-amber-500/30 text-amber-200 border-amber-400/40" 
                : "bg-amber-100 text-amber-900 border-amber-300"
            )}>
              Inativo
            </span>
          )}
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
          <span className={cn("w-1 h-1 rounded-full", isSelected ? "bg-slate-300" : "bg-slate-300")} />
          <span className={cn(
            isInactive ? (isSelected ? "text-amber-300 font-bold" : "text-amber-700 font-bold") : ""
          )}>
            {isInactive ? 'Inativo' : isClosed ? 'Encerrada' : 'Ativo'}
          </span>
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
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [coursesList, setCoursesList] = useState<Course[]>([]);
  const [inst, setInst] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilterState] = useState<'Ativo' | 'Inativo' | 'Encerrada' | 'Todos'>(() => {
    try {
      const saved = localStorage.getItem('classes_status_filter');
      if (saved === 'Ativo' || saved === 'Inativo' || saved === 'Encerrada' || saved === 'Todos') return saved;
    } catch (e) {}
    return 'Todos';
  });

  const setStatusFilter = React.useCallback((status: 'Ativo' | 'Inativo' | 'Encerrada' | 'Todos') => {
    setStatusFilterState(status);
    try {
      localStorage.setItem('classes_status_filter', status);
    } catch (e) {}
  }, []);

  const [sortBy, setSortBy] = useState<'name_year' | 'name' | 'code' | 'year' | 'period'>('name_year');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hoverShowList, setHoverShowList] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [modalStudents, setModalStudents] = useState<any[]>([]);
  const [loadingModalStudents, setLoadingModalStudents] = useState(false);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [includeEmissionDate, setIncludeEmissionDate] = useState(false);
  const [isCustomNameUnlocked, setIsCustomNameUnlocked] = useState(false);

  // Unallocated Students Management State
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<any[]>([]);
  const [showUnallocatedModal, setShowUnallocatedModal] = useState(false);
  const [targetClassForUnallocated, setTargetClassForUnallocated] = useState<string>('');
  const [unallocatedSearchTerm, setUnallocatedSearchTerm] = useState('');
  const [selectedUnallocatedStudentIds, setSelectedUnallocatedStudentIds] = useState<string[]>([]);
  const [isAllocatingStudents, setIsAllocatingStudents] = useState(false);
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
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>('Todos');
  const [selectedAcademicYearFilter, setSelectedAcademicYearFilterState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('classes_academic_year_filter');
      if (saved) return saved;
    } catch (e) {}
    return 'ATUAL';
  });

  const setSelectedAcademicYearFilter = React.useCallback((val: string) => {
    setSelectedAcademicYearFilterState(val);
    try {
      localStorage.setItem('classes_academic_year_filter', val);
    } catch (e) {}
  }, []);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Helper to extract exact academic start year for a class
  const getClassStartYear = React.useCallback((c: any): number => {
    if (!c || c.unallocated) return 2026;

    const extractYear = (val: any): number | null => {
      if (!val) return null;
      const str = String(val).trim();
      if (/^\d{4}$/.test(str)) {
        const num = Number(str);
        if (num >= 1990 && num <= 2100) return num;
      }
      const ddmmyyyy = str.match(/\b\d{1,2}\/\d{1,2}\/(\d{4})\b/);
      if (ddmmyyyy && ddmmyyyy[1]) return Number(ddmmyyyy[1]);
      const yyyymmdd = str.match(/\b(\d{4})-\d{1,2}-\d{1,2}\b/);
      if (yyyymmdd && yyyymmdd[1]) return Number(yyyymmdd[1]);
      const anyYr = str.match(/\b(20\d{2}|19\d{2})\b/);
      if (anyYr && anyYr[1]) return Number(anyYr[1]);
      return null;
    };

    // 1. Primary source: start_year field (Campo 2 Ano Letivo in class form)
    const fromStart = extractYear(c.start_year || c.academic_year);
    if (fromStart) return fromStart;

    // 2. Secondary source: observations metadata
    if (c.observations) {
      const match = c.observations.match(/\[METADATA:(\{[\s\S]*?\})\]/);
      if (match && match[1]) {
        try {
          const meta = JSON.parse(match[1]);
          const fromMeta = extractYear(meta.start_year || meta.academic_year || meta.year);
          if (fromMeta) return fromMeta;
        } catch (e) {}
      }
    }

    // 3. Name or Code (e.g., "TEO-23", "TEO-24", "TEO-25", "TEO-26", "2026", "2025")
    const fromName = extractYear(c.name);
    if (fromName) return fromName;

    if (c.code) {
      const codeMatch = String(c.code).match(/-(\d{2})\b/);
      if (codeMatch && codeMatch[1]) {
        const yr2 = Number(codeMatch[1]);
        if (yr2 >= 0 && yr2 <= 99) return 2000 + yr2;
      }
      const fromCode = extractYear(c.code);
      if (fromCode) return fromCode;
    }

    // 4. Fallback: start_date or created_at
    const fromStartDate = extractYear(c.start_date);
    if (fromStartDate) return fromStartDate;

    const fromCreated = extractYear(c.created_at);
    if (fromCreated) return fromCreated;

    return 2026;
  }, []);

  const getClassAcademicYear = React.useCallback((c: any): string => {
    if (c.unallocated) return 'S/T';
    return String(getClassStartYear(c));
  }, [getClassStartYear]);

  const currentAcademicYear = React.useMemo(() => '2026', []);

  // Persistent record of classes explicitly habilitated / promoted for future academic years (e.g. 2027)
  const [habilitatedMap, setHabilitatedMap] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('academic_habilitated_classes_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  });

  // Helper to determine if a class is active in the selected academic year
  // In Classes management:
  // - If selectedYear is 'ATUAL': shows classes active in current academic year 2026 (including cohorts starting in 2023..2026)
  // - If selectedYear is 'Todos': shows all classes
  // - If selectedYear is a specific past year (< 2026): shows cohorts active during that historical year
  // - If selectedYear is a future year (> 2026, ex: 2027): cohorts from previous years (2026, 2025, 2024, 2023)
  //   do NOT appear by default unless explicitly habilitated for that year
  const isClassActiveInAcademicYear = React.useCallback((c: any, selectedYear: string): boolean => {
    if (!selectedYear || selectedYear === 'Todos') return true;
    if (c.unallocated) return false;
    
    const currentYearNum = parseInt(currentAcademicYear, 10);
    const targetYearNum = selectedYear === 'ATUAL' ? currentYearNum : parseInt(selectedYear, 10);
    if (isNaN(targetYearNum)) return true;

    const startYr = getClassStartYear(c);
    const isCurrentlyActive = !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';

    // 1. Momento Vigente (2026 ou 'ATUAL')
    if (targetYearNum === currentYearNum) {
      if (isCurrentlyActive) {
        return startYr <= currentYearNum;
      }
      let endYr = startYr + 3;
      if (c.end_date) {
        const parsedEnd = parseInt(String(c.end_date).substring(0, 4), 10);
        if (!isNaN(parsedEnd)) endYr = parsedEnd;
      }
      return currentYearNum >= startYr && currentYearNum <= endYr;
    }

    // 2. Anos Anteriores / Histórico (< 2026)
    if (targetYearNum < currentYearNum) {
      let endYr = startYr + 3;
      if (c.end_date) {
        const parsedEnd = parseInt(String(c.end_date).substring(0, 4), 10);
        if (!isNaN(parsedEnd)) endYr = parsedEnd;
      }
      return targetYearNum >= startYr && targetYearNum <= endYr;
    }

    // 3. Anos Futuros (> 2026, ex: 2027)
    // Turmas de anos anteriores (2026, 2025, 2024, 2023) não constam automaticamente até serem habilitadas
    const isDirectlyForFutureYear = startYr === targetYearNum || c.year === String(targetYearNum);
    if (isDirectlyForFutureYear) return true;

    const yearHabilitatedList = habilitatedMap[String(targetYearNum)] || [];
    if (yearHabilitatedList.includes(c.id)) return true;

    const isMetaHabilitated = Boolean(
      (c.observations && (c.observations.includes(`habilitada_${targetYearNum}`) || c.observations.includes(`enabled_for_${targetYearNum}`))) ||
      (Array.isArray(c.enabled_years) && c.enabled_years.includes(String(targetYearNum)))
    );

    return isMetaHabilitated;
  }, [getClassStartYear, currentAcademicYear, habilitatedMap]);

  const availableAcademicYears = React.useMemo(() => {
    const yrSet = new Set<string>(['2027', '2026', '2025', '2024', '2023']);
    classes.forEach(c => {
      if (c.unallocated) return;
      const yr = getClassStartYear(c);
      if (yr && !isNaN(yr)) {
        yrSet.add(String(yr));
      }
    });
    return Array.from(yrSet).sort((a, b) => Number(b) - Number(a));
  }, [classes, getClassStartYear]);

  // Import / Promotion Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSourceClassId, setImportSourceClassId] = useState('');
  const [importTargetAcademicYear, setImportTargetAcademicYear] = useState('2027');
  const [importTargetYear, setImportTargetYear] = useState('2º Ano');
  const [importNewName, setImportNewName] = useState('');
  const [importNewCode, setImportNewCode] = useState('');
  const [importSem1SubjectId, setImportSem1SubjectId] = useState('');
  const [importSem2SubjectId, setImportSem2SubjectId] = useState('');
  const [importMigrateStudents, setImportMigrateStudents] = useState(true);
  const [sourceStudentsCount, setSourceStudentsCount] = useState(0);
  const [sourceStudentsList, setSourceStudentsList] = useState<Array<{ id: string, name: string, registration_number?: string }>>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importProgressText, setImportProgressText] = useState('');
  const [selectedClassStudentCount, setSelectedClassStudentCount] = useState<number | null>(null);

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

  // Derived subject IDs for 1º and 2º semester (1º and 2º horario each, total 4 slots)
  const sem1H1SubjectId = React.useMemo(() => {
    if (formData.subject_id_sem1_h1 !== undefined && formData.subject_id_sem1_h1 !== null) {
      return formData.subject_id_sem1_h1;
    }
    if (formData.subject_id_sem1) return formData.subject_id_sem1;
    const currentIds = formData.subject_ids || [];
    const sem1Subs = currentIds.filter(id => {
      const s = subjects.find(sub => sub.id === id);
      if (!s) return false;
      const sem = (s.semester || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return sem.includes('1') || name.includes('1º') || name.includes('1°') || name.includes('1 sem');
    });
    return sem1Subs[0] || currentIds[0] || '';
  }, [formData.subject_id_sem1_h1, formData.subject_id_sem1, formData.subject_ids, subjects]);

  const sem1H2SubjectId = React.useMemo(() => {
    if (formData.subject_id_sem1_h2 !== undefined && formData.subject_id_sem1_h2 !== null) {
      return formData.subject_id_sem1_h2;
    }
    const currentIds = formData.subject_ids || [];
    const sem1Subs = currentIds.filter(id => {
      const s = subjects.find(sub => sub.id === id);
      if (!s) return false;
      const sem = (s.semester || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return sem.includes('1') || name.includes('1º') || name.includes('1°') || name.includes('1 sem');
    });
    if (sem1Subs.length > 1) {
      return sem1Subs.find(id => id !== sem1H1SubjectId) || '';
    }
    return '';
  }, [formData.subject_id_sem1_h2, formData.subject_ids, subjects, sem1H1SubjectId]);

  const sem2H1SubjectId = React.useMemo(() => {
    if (formData.subject_id_sem2_h1 !== undefined && formData.subject_id_sem2_h1 !== null) {
      return formData.subject_id_sem2_h1;
    }
    if (formData.subject_id_sem2) return formData.subject_id_sem2;
    const currentIds = formData.subject_ids || [];
    const sem2Subs = currentIds.filter(id => {
      const s = subjects.find(sub => sub.id === id);
      if (!s) return false;
      const sem = (s.semester || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return sem.includes('2') || name.includes('2º') || name.includes('2°') || name.includes('2 sem');
    });
    return sem2Subs[0] || currentIds.find(id => id !== sem1H1SubjectId && id !== sem1H2SubjectId) || '';
  }, [formData.subject_id_sem2_h1, formData.subject_id_sem2, formData.subject_ids, subjects, sem1H1SubjectId, sem1H2SubjectId]);

  const sem2H2SubjectId = React.useMemo(() => {
    if (formData.subject_id_sem2_h2 !== undefined && formData.subject_id_sem2_h2 !== null) {
      return formData.subject_id_sem2_h2;
    }
    const currentIds = formData.subject_ids || [];
    const sem2Subs = currentIds.filter(id => {
      const s = subjects.find(sub => sub.id === id);
      if (!s) return false;
      const sem = (s.semester || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return sem.includes('2') || name.includes('2º') || name.includes('2°') || name.includes('2 sem');
    });
    if (sem2Subs.length > 1) {
      return sem2Subs.find(id => id !== sem2H1SubjectId) || '';
    }
    return '';
  }, [formData.subject_id_sem2_h2, formData.subject_ids, subjects, sem2H1SubjectId]);

  const PREDEFINED_COURSES = React.useMemo(() => {
    const list = coursesList.filter(c => c.status === 'Ativo').map(c => c.name);
    if (list.length === 0) {
      return [
        'Teologia',
        'Latim',
        'Doutrina Social da Igreja',
        'História dos Santos Negros',
        'Outros'
      ];
    }
    if (!list.includes('Outros')) {
      list.push('Outros');
    }
    return list;
  }, [coursesList]);

  const isNameLocked = React.useMemo(() => {
    if (isCustomNameUnlocked) return false;
    const c = (formData.course || '').trim().toLowerCase();
    return !c.includes('outros');
  }, [formData.course, isCustomNameUnlocked]);

  const generateAutoClassName = React.useCallback((course: string, startYear: string | number, academicYear: string) => {
    if (!course || !startYear) return '';

    const yrStr = String(startYear).trim();
    if (!yrStr || yrStr.length < 2) return '';
    const yr2Digits = yrStr.slice(-2);
    const fullStartYear = yrStr.length === 4 ? parseInt(yrStr, 10) : 2000 + parseInt(yr2Digits, 10);

    const cleanCourse = course.trim().toUpperCase();
    if (!cleanCourse || cleanCourse === 'OUTROS') {
      return `TURMA ${fullStartYear}`;
    }

    // Regra: Uma nova turma terá sempre o Nome do Curso + Ano Letivo Original de Início, sem nenhum outro complemento
    return `${cleanCourse} ${fullStartYear}`;
  }, []);

  const courseSuggestions = React.useMemo(() => {
    const set = new Set<string>();
    PREDEFINED_COURSES.forEach(c => set.add(c.toUpperCase()));
    classes.forEach(c => {
      if (c.name) set.add(c.name.trim().toUpperCase());
    });
    return Array.from(set);
  }, [classes, PREDEFINED_COURSES]);

  const getSubjectsForCourseAndYear = React.useCallback((allSubjects: Subject[], courseName: string, yearStr: string) => {
    if (!yearStr) return [];
    const yearMatched = allSubjects.filter(s => {
      if (yearStr === 'Curso Extra') return s.year === 'Curso Extra' || !s.year;
      return s.year === yearStr;
    });

    if (!courseName) return [];

    const lowerCourse = courseName.toLowerCase().trim();
    if (lowerCourse.includes('outros')) return yearMatched;

    const STOP_WORDS = new Set([
      'de', 'da', 'do', 'dos', 'das', 'na', 'no', 'nas', 'nos',
      'para', 'com', 'em', 'e', 'a', 'o', 'os', 'as', 'por'
    ]);

    return yearMatched.filter(s => {
      const sCourse = ((s as any).course || '').toLowerCase();
      const sName = (s.name || '').toLowerCase();
      const sProgram = (s.program_content || '').toLowerCase();

      if (sCourse && sCourse.includes(lowerCourse)) return true;

      if (lowerCourse.includes('teologia')) {
        if (sCourse && !sCourse.includes('teologia')) return false;
        const isLatim = sName.includes('latim');
        const isDsi = sName.includes('doutrina') || sName.includes('dsi');
        const isHsn = sName.includes('santos') || sName.includes('negros') || sName.includes('hsn');
        return !isLatim && !isDsi && !isHsn;
      }

      if (lowerCourse.includes('latim')) {
        return sName.includes('latim') || sProgram.includes('latim') || sCourse.includes('latim');
      }

      if (lowerCourse.includes('doutrina')) {
        return sName.includes('doutrina') || sName.includes('dsi') || sProgram.includes('doutrina') || sCourse.includes('doutrina');
      }

      if (lowerCourse.includes('santos') || lowerCourse.includes('negros')) {
        return sName.includes('santos') || sName.includes('negros') || sName.includes('hsn') || sProgram.includes('santos') || sCourse.includes('santos');
      }

      const firstWord = lowerCourse
        .split(/\s+/)
        .filter(w => !STOP_WORDS.has(w))[0];

      if (firstWord && firstWord.length >= 3) {
        return sName.includes(firstWord) || sProgram.includes(firstWord) || sCourse.includes(firstWord);
      }

      return false;
    });
  }, []);

  const autoFoundSubjects = React.useMemo(() => {
    if (!formData.year || !formData.course) return [];
    return getSubjectsForCourseAndYear(subjects, formData.course, formData.year);
  }, [subjects, formData.year, formData.course, getSubjectsForCourseAndYear]);

  const sem1AutoSubs = React.useMemo(() => {
    const s1h1 = subjects.find(s => s.id === sem1H1SubjectId);
    const s1h2 = subjects.find(s => s.id === sem1H2SubjectId);
    if (s1h1 || s1h2) return [s1h1, s1h2].filter(Boolean) as Subject[];
    return autoFoundSubjects.filter(s => (s.semester || '').includes('1'));
  }, [subjects, sem1H1SubjectId, sem1H2SubjectId, autoFoundSubjects]);

  const sem2AutoSubs = React.useMemo(() => {
    const s2h1 = subjects.find(s => s.id === sem2H1SubjectId);
    const s2h2 = subjects.find(s => s.id === sem2H2SubjectId);
    if (s2h1 || s2h2) return [s2h1, s2h2].filter(Boolean) as Subject[];
    return autoFoundSubjects.filter(s => (s.semester || '').includes('2'));
  }, [subjects, sem2H1SubjectId, sem2H2SubjectId, autoFoundSubjects]);

  const handleSelectCourseStartYearAndAcademicYear = React.useCallback((
    newCourse: string,
    newStartYear: string | number,
    newAcademicYear: string
  ) => {
    const matched = getSubjectsForCourseAndYear(subjects, newCourse, newAcademicYear);

    const sem1Subs = matched.filter(s => (s.semester || '').includes('1'));
    const sem2Subs = matched.filter(s => (s.semester || '').includes('2'));

    const s1h1 = sem1Subs[0]?.id || '';
    const s1h2 = sem1Subs[1]?.id || '';
    const s2h1 = sem2Subs[0]?.id || '';
    const s2h2 = sem2Subs[1]?.id || '';
    const cleanSubjectIds = Array.from(new Set([s1h1, s1h2, s2h1, s2h2])).filter(Boolean);

    const autoGeneratedName = generateAutoClassName(newCourse, newStartYear, newAcademicYear);

    setFormData(prev => {
      const cLower = (newCourse || '').toLowerCase();
      const yrStr = String(newStartYear || '').trim();
      const yr2 = yrStr.slice(-2);

      // Only generate autoCode if code is empty or 'AUTO'
      let autoCode = prev.code;
      if (!autoCode || autoCode === 'AUTO') {
        if (cLower.includes('teologia') && yr2) {
          autoCode = `TEO-${yr2}`;
        } else if (cLower.includes('doutrina') && yr2) {
          autoCode = `DSI-${yr2}`;
        } else if (cLower.includes('latim') && yr2) {
          autoCode = `LAT-${yr2}`;
        } else if (cLower.includes('santos') && yr2) {
          autoCode = `HSN-${yr2}`;
        }
      }

      // Preserve existing custom name unless it was empty
      const finalName = prev.name ? prev.name : autoGeneratedName;

      return {
        ...prev,
        course: newCourse,
        start_year: String(newStartYear),
        year: newAcademicYear,
        name: finalName,
        code: prev.code || autoCode,
        subject_id_sem1_h1: s1h1,
        subject_id_sem1_h2: s1h2,
        subject_id_sem2_h1: s2h1,
        subject_id_sem2_h2: s2h2,
        subject_id_sem1: s1h1 || s1h2 || '',
        subject_id_sem2: s2h1 || s2h2 || '',
        subject_ids: cleanSubjectIds
      };
    });
  }, [subjects, generateAutoClassName, getSubjectsForCourseAndYear]);

  const handleSelectYear = React.useCallback((newYear: string) => {
    const currentCourse = formData.course || '';
    const currentStartYear = formData.start_year || new Date().getFullYear();
    handleSelectCourseStartYearAndAcademicYear(currentCourse, currentStartYear, newYear);
  }, [formData.course, formData.start_year, handleSelectCourseStartYearAndAcademicYear]);

  const handleSetSemesterSubject = (semesterNum: 1 | 2, slotNum: 1 | 2, subjectId: string) => {
    let s1h1 = semesterNum === 1 && slotNum === 1 ? subjectId : sem1H1SubjectId;
    let s1h2 = semesterNum === 1 && slotNum === 2 ? subjectId : sem1H2SubjectId;
    let s2h1 = semesterNum === 2 && slotNum === 1 ? subjectId : sem2H1SubjectId;
    let s2h2 = semesterNum === 2 && slotNum === 2 ? subjectId : sem2H2SubjectId;

    if (subjectId) {
      if (!(semesterNum === 1 && slotNum === 1) && s1h1 === subjectId) s1h1 = '';
      if (!(semesterNum === 1 && slotNum === 2) && s1h2 === subjectId) s1h2 = '';
      if (!(semesterNum === 2 && slotNum === 1) && s2h1 === subjectId) s2h1 = '';
      if (!(semesterNum === 2 && slotNum === 2) && s2h2 === subjectId) s2h2 = '';
    }

    const cleanSubjectIds = Array.from(new Set([s1h1, s1h2, s2h1, s2h2])).filter(Boolean);

    setFormData({
      ...formData,
      subject_id_sem1_h1: s1h1,
      subject_id_sem1_h2: s1h2,
      subject_id_sem2_h1: s2h1,
      subject_id_sem2_h2: s2h2,
      subject_id_sem1: s1h1 || s1h2 || '',
      subject_id_sem2: s2h1 || s2h2 || '',
      subject_ids: cleanSubjectIds
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
      const [classesData, subjectsData, instData, acadSettingsData, coursesData, studentsData, enrollmentsData] = await Promise.all([
        fetchAll('classes', '*', 'name', true),
        fetchAll('subjects', 'id, name, code, year, semester, status, program_content', 'name', true),
        fetchAll('institution_settings'),
        fetchAll('academic_settings').catch(() => []),
        fetchAll('courses').catch(() => []),
        fetchAll('students', '*', 'name', true).catch(() => []),
        fetchAll('enrollments').catch(() => [])
      ]);

      if (studentsData) setAllStudents(studentsData);
      if (enrollmentsData) setAllEnrollments(enrollmentsData);

      if (coursesData && coursesData.length > 0) {
        setCoursesList(coursesData);
      }

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
        let metaSem1H1 = (normalized as any).subject_id_sem1_h1 || (normalized as any).subject_id_sem1 || '';
        let metaSem1H2 = (normalized as any).subject_id_sem1_h2 || '';
        let metaSem2H1 = (normalized as any).subject_id_sem2_h1 || (normalized as any).subject_id_sem2 || '';
        let metaSem2H2 = (normalized as any).subject_id_sem2_h2 || '';

        if (normalized.observations) {
          const match = normalized.observations.match(/\[METADATA:(\{[\s\S]*\})\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.year) normalized.year = meta.year;
              if (!normalized.semester) normalized.semester = meta.semester || meta.semester_id;
              if (meta.course && !(normalized as any).course) {
                (normalized as any).course = meta.course;
              }
              if (meta.start_year && (!normalized.start_year || String(normalized.start_year).trim() === '')) {
                (normalized as any).start_year = String(meta.start_year).trim();
              }
              if (meta.subject_id_sem1_h1 !== undefined) metaSem1H1 = meta.subject_id_sem1_h1;
              if (meta.subject_id_sem1_h2 !== undefined) metaSem1H2 = meta.subject_id_sem1_h2;
              if (meta.subject_id_sem2_h1 !== undefined) metaSem2H1 = meta.subject_id_sem2_h1;
              if (meta.subject_id_sem2_h2 !== undefined) metaSem2H2 = meta.subject_id_sem2_h2;
              if (meta.subject_id_sem1 !== undefined && !metaSem1H1) metaSem1H1 = meta.subject_id_sem1;
              if (meta.subject_id_sem2 !== undefined && !metaSem2H1) metaSem2H1 = meta.subject_id_sem2;
              if (meta.subject_ids && Array.isArray(meta.subject_ids) && meta.subject_ids.length > 0) {
                sIds = meta.subject_ids;
              } else if (sIds.length === 0 && meta.subject_id) {
                sIds = [meta.subject_id];
              }
              isSpecial = !!meta.is_special;
            } catch (e) {}
          }
        }

        if (!(normalized as any).course) {
          (normalized as any).course = detectCourseFromClass(normalized);
        }

        // Infer sem1 and sem2 slots if missing
        if ((!metaSem1H1 || !metaSem1H2 || !metaSem2H1 || !metaSem2H2) && normalized.year) {
          const yearSubs = normalizedSubjects.filter(s => s.year === normalized.year);
          const yearSem1 = yearSubs.filter(s => (s.semester || '').includes('1'));
          const yearSem2 = yearSubs.filter(s => (s.semester || '').includes('2'));

          if (!metaSem1H1 && yearSem1[0]) metaSem1H1 = yearSem1[0].id;
          if (!metaSem1H2 && yearSem1[1]) metaSem1H2 = yearSem1[1].id;
          if (!metaSem2H1 && yearSem2[0]) metaSem2H1 = yearSem2[0].id;
          if (!metaSem2H2 && yearSem2[1]) metaSem2H2 = yearSem2[1].id;
        }

        if ((!metaSem1H1 && !metaSem1H2 && !metaSem2H1 && !metaSem2H2) && sIds.length > 0) {
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

          const s1List = loadedSubs.filter(s => isSem1Sub(s));
          const s2List = loadedSubs.filter(s => isSem2Sub(s));

          if (!metaSem1H1 && s1List[0]) metaSem1H1 = s1List[0].id;
          if (!metaSem1H2 && s1List[1]) metaSem1H2 = s1List[1].id;
          if (!metaSem2H1 && s2List[0]) metaSem2H1 = s2List[0].id;
          if (!metaSem2H2 && s2List[1]) metaSem2H2 = s2List[1].id;

          if (!metaSem1H1 && !metaSem2H1) {
            metaSem1H1 = sIds[0] || '';
            metaSem1H2 = sIds[1] || '';
            metaSem2H1 = sIds[2] || '';
            metaSem2H2 = sIds[3] || '';
          }
        }

        const consolidatedSids = Array.from(new Set([metaSem1H1, metaSem1H2, metaSem2H1, metaSem2H2, ...sIds])).filter(Boolean);

        (normalized as any).subject_id_sem1_h1 = metaSem1H1;
        (normalized as any).subject_id_sem1_h2 = metaSem1H2;
        (normalized as any).subject_id_sem2_h1 = metaSem2H1;
        (normalized as any).subject_id_sem2_h2 = metaSem2H2;
        (normalized as any).subject_id_sem1 = metaSem1H1 || metaSem1H2;
        (normalized as any).subject_id_sem2 = metaSem2H1 || metaSem2H2;
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

        // Regra Fundamental: Não existe 5º Ano. Se a turma atingir este patamar ou estiver cadastrada como 5º Ano, converte para Curso Extra.
        const yrStr = (normalized.year || '').toLowerCase();
        if (yrStr.includes('5º') || yrStr.includes('5°') || yrStr.includes('5 ano') || yrStr.includes('5ª') || yrStr.includes('5a') || yrStr.includes('5th')) {
          normalized.year = 'Curso Extra';
        }

        return normalized;
      });

      // Deduplica turmas e disciplinas por ID para garantir integridade de chaves
      const seenClassIds = new Set<string>();
      const uniqueClasses: Class[] = [];
      for (const cls of normalizedClasses) {
        const idStr = String(cls.id || cls.code || '');
        if (idStr && !seenClassIds.has(idStr)) {
          seenClassIds.add(idStr);
          uniqueClasses.push(cls);
        } else if (!idStr) {
          uniqueClasses.push(cls);
        }
      }

      const seenSubjectIds = new Set<string>();
      const uniqueSubjects: Subject[] = [];
      for (const s of normalizedSubjects) {
        const idStr = String(s.id || s.code || '');
        if (idStr && !seenSubjectIds.has(idStr)) {
          seenSubjectIds.add(idStr);
          uniqueSubjects.push(s);
        } else if (!idStr) {
          uniqueSubjects.push(s);
        }
      }

      setClasses(uniqueClasses);
      setSubjects(uniqueSubjects);
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

  useEffect(() => {
    if (!selectedClass) {
      setSelectedClassStudentCount(null);
      setModalStudents([]);
      return;
    }

    let isMounted = true;
    Promise.all([
      fetchAll('enrollments').catch(() => []),
      fetchAll('students').catch(() => [])
    ]).then(([enrollments, studentsData]) => {
      if (!isMounted) return;
      const classId = selectedClass.id;
      const classEnrollments = (enrollments || []).filter((e: any) => e.class_id === classId && (e.status || 'Ativo') === 'Ativo');
      const enrolledIds = new Set<string>();
      classEnrollments.forEach((e: any) => { if (e.student_id) enrolledIds.add(e.student_id); });

      const matched = (studentsData || []).filter((s: any) => {
        const isDirect = s.class_id === classId;
        const isEnrolled = enrolledIds.has(s.id);
        return isDirect || isEnrolled;
      });

      matched.sort((a: any, b: any) => (a.name || a.full_name || '').localeCompare(b.name || b.full_name || ''));

      setModalStudents(matched);
      setSelectedClassStudentCount(matched.length);
    });

    return () => { isMounted = false; };
  }, [selectedClass]);

  const handleOpenStudentsModal = React.useCallback(async (targetClass?: Class) => {
    const clsToUse = targetClass || selectedClass;
    if (!clsToUse) return;
    
    setShowStudentsModal(true);
    setLoadingModalStudents(true);
    setModalSearchTerm('');

    try {
      const [enrollments, studentsData] = await Promise.all([
        fetchAll('enrollments').catch(() => []),
        fetchAll('students').catch(() => [])
      ]);

      const classId = clsToUse.id;
      const classEnrollments = (enrollments || []).filter((e: any) => e.class_id === classId && (e.status || 'Ativo') === 'Ativo');
      const enrolledIds = new Set<string>();
      classEnrollments.forEach((e: any) => { if (e.student_id) enrolledIds.add(e.student_id); });

      const matched = (studentsData || []).filter((s: any) => {
        const isDirect = s.class_id === classId;
        const isEnrolled = enrolledIds.has(s.id);
        return isDirect || isEnrolled;
      });

      matched.sort((a: any, b: any) => (a.name || a.full_name || '').localeCompare(b.name || b.full_name || ''));

      setModalStudents(matched);
      setSelectedClassStudentCount(matched.length);
    } catch (err) {
      console.error('Erro ao carregar lista de alunos:', err);
    } finally {
      setLoadingModalStudents(false);
    }
  }, [selectedClass]);

  const handleExportClassStudentListPDF = React.useCallback(() => {
    if (!selectedClass && !formData.name) return;
    const className = selectedClass?.name || formData.name || 'Turma';
    const classCode = selectedClass?.code || formData.code || '---';

    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.width;

    // 1. Institutional Header
    let textStartX = margin;
    if (inst?.logo_url) {
      try {
        doc.addImage(inst.logo_url, 'PNG', margin, 10, 22, 22);
        textStartX = margin + 26;
      } catch (e) {
        console.error('Error adding logo to PDF', e);
      }
    }

    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'bold');
    doc.text((inst?.diocese_name || 'DIOCESE DE GUARULHOS').toUpperCase(), textStartX, 15);

    doc.setFontSize(13);
    doc.setTextColor(0, 23, 75);
    doc.setFont('helvetica', 'bold');
    doc.text((inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS').toUpperCase(), textStartX, 21);

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'bold');
    doc.text((inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO').toUpperCase(), textStartX, 26);

    // Header divider line (separating Institutional Header from Document Title)
    doc.setDrawColor(0, 23, 75);
    doc.setLineWidth(0.6);
    doc.line(margin, 35, pageWidth - margin, 35);

    // 2. Document Title & Metadata (Below the divider line)
    // Left side: Title & Class Info
    doc.setFontSize(11);
    doc.setTextColor(0, 23, 75);
    doc.setFont('helvetica', 'bold');
    doc.text(`LISTA DE ALUNOS MATRICULADOS`, margin, 42);

    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`TURMA: ${className.toUpperCase()} (${classCode})`, margin, 47);

    // Right side: Total Students & Optional Emission Date
    doc.setFontSize(9);
    doc.setTextColor(0, 23, 75);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: ${modalStudents.length} ALUNO(S)`, pageWidth - margin, 42, { align: 'right' });

    if (includeEmissionDate) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(`EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, 47, { align: 'right' });
    }

    // 3. Table of Students
    const tableRows = modalStudents.map((s, idx) => [
      idx + 1,
      (s.name || s.full_name || '---').toUpperCase(),
      s.registration_number || s.code || '---',
      s.cpf || '---',
      s.status || 'Ativo'
    ]);

    autoTable(doc, {
      startY: 52,
      head: [['#', 'NOME DO ALUNO', 'MATRÍCULA', 'CPF', 'STATUS']],
      body: tableRows,
      headStyles: { fillColor: [0, 23, 75], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8.5, cellPadding: 2.5, font: 'helvetica' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin }
    });

    // 4. Institutional Footer
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.setFont('helvetica', 'normal');

      let footerLeft = `SISTEMA ESCMIN • ${inst?.name || 'Escola Diocesana de Ministérios'}`;
      if (includeEmissionDate) {
        footerLeft += ` • Emissão: ${new Date().toLocaleString('pt-BR')}`;
      }
      doc.text(footerLeft, margin, doc.internal.pageSize.height - 8, { align: 'left' });

      // Page numbering right-aligned
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, doc.internal.pageSize.height - 8, { align: 'right' });
    }

    // 4. Direct Print Execution (No File Save Download)
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
          } catch (e) {}

          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(cleanup, 12000);
          } catch (e) {
            console.warn("Direct print failed on iframe, opening blob URL:", e);
            window.open(url, '_blank');
          }
        }
      }, 300);
    };
  }, [selectedClass, formData, modalStudents, inst, includeEmissionDate]);

  const handleSelectClass = React.useCallback((cls: Class) => {
    setSelectedClass(cls);
    const startYearFromDate = cls.start_date ? cls.start_date.substring(0, 4) : String(new Date().getFullYear());
    const detectedCourse = cls.course || detectCourseFromClass(cls) || (PREDEFINED_COURSES.find(c => (cls.name || '').toUpperCase().includes(c.toUpperCase())) || 'Teologia');
    
    setFormData({
      ...cls,
      course: detectedCourse,
      start_year: (cls as any).start_year || startYearFromDate,
      start_date: cls.start_date ? formatDateForDisplay(cls.start_date) : '',
      subject_id_sem1_h1: (cls as any).subject_id_sem1_h1 || (cls as any).subject_id_sem1 || '',
      subject_id_sem1_h2: (cls as any).subject_id_sem1_h2 || '',
      subject_id_sem2_h1: (cls as any).subject_id_sem2_h1 || (cls as any).subject_id_sem2 || '',
      subject_id_sem2_h2: (cls as any).subject_id_sem2_h2 || '',
      subject_id_sem1: (cls as any).subject_id_sem1 || '',
      subject_id_sem2: (cls as any).subject_id_sem2 || '',
      subject_ids: cls.subject_ids || []
    });
    setIsEditing(false);
    setHoverShowList(false);
  }, [PREDEFINED_COURSES]);

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
      course: '',
      start_year: '',
      name: '',
      code: nextCode,
      status: 'Ativo',
      days_of_week: [],
      period: '',
      year: '',
      start_date: '',
      semester: '1º Semestre',
      subject_id_sem1_h1: '',
      subject_id_sem1_h2: '',
      subject_id_sem2_h1: '',
      subject_id_sem2_h2: '',
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
    // Validate Mandatory Fields 1, 2, and 3
    if (!formData.course) {
      alert('Atenção: O Campo 1 (Curso Escolhido) é obrigatório!');
      return;
    }

    const startYrNum = parseInt(String(formData.start_year || ''), 10);
    if (!formData.start_year || isNaN(startYrNum) || startYrNum < 1999 || startYrNum > 2100) {
      alert('Atenção: O Campo 2 (Ano Letivo) é obrigatório e deve conter um ano válido entre 1999 e 2100!');
      return;
    }

    if (!formData.year) {
      alert('Atenção: O Campo 3 (Ano Acadêmico) é obrigatório!');
      return;
    }

    // Regra: Não existe 5º ano, converter para Curso Extra
    let validatedAcademicYear = formData.year;
    if (validatedAcademicYear.includes('5º') || validatedAcademicYear.includes('5°') || validatedAcademicYear.includes('5 ano') || validatedAcademicYear.includes('5ª') || validatedAcademicYear.includes('5a')) {
      validatedAcademicYear = 'Curso Extra';
    }

    if (!formData.name) {
      alert('Atenção: O Nome / Identificador da Turma é obrigatório!');
      return;
    }

    try {
      setLoading(true);
      
      const s1h1 = formData.subject_id_sem1_h1 !== undefined && formData.subject_id_sem1_h1 !== null ? formData.subject_id_sem1_h1 : sem1H1SubjectId;
      const s1h2 = formData.subject_id_sem1_h2 !== undefined && formData.subject_id_sem1_h2 !== null ? formData.subject_id_sem1_h2 : sem1H2SubjectId;
      const s2h1 = formData.subject_id_sem2_h1 !== undefined && formData.subject_id_sem2_h1 !== null ? formData.subject_id_sem2_h1 : sem2H1SubjectId;
      const s2h2 = formData.subject_id_sem2_h2 !== undefined && formData.subject_id_sem2_h2 !== null ? formData.subject_id_sem2_h2 : sem2H2SubjectId;

      const cleanSubjectIds = Array.from(new Set([s1h1, s1h2, s2h1, s2h2])).filter(Boolean);

      const syncData = {
        ...formData,
        year: validatedAcademicYear,
        start_date: parseDateToDB(formData.start_date),
        subject_id: s1h1 || s1h2 || s2h1 || s2h2 || null,
        subject_id_sem1: s1h1 || s1h2 || null,
        subject_id_sem2: s2h1 || s2h2 || null,
        subject_id_sem1_h1: s1h1 || null,
        subject_id_sem1_h2: s1h2 || null,
        subject_id_sem2_h1: s2h1 || null,
        subject_id_sem2_h2: s2h2 || null,
        subject_ids: cleanSubjectIds
      };

      // PROACTIVE METADATA SYNC:
      // Always sync year, semester, subject slots, subject_ids and is_special into observations metadata 
      // before saving. This ensures data persistence even if Supabase columns are missing.
      const metadata: any = {};
      if (formData.course) metadata.course = formData.course;
      if (validatedAcademicYear) metadata.year = validatedAcademicYear;
      if (formData.start_year) metadata.start_year = formData.start_year;
      if (formData.semester) metadata.semester = formData.semester;
      metadata.subject_id_sem1_h1 = s1h1 || '';
      metadata.subject_id_sem1_h2 = s1h2 || '';
      metadata.subject_id_sem2_h1 = s2h1 || '';
      metadata.subject_id_sem2_h2 = s2h2 || '';
      metadata.subject_id_sem1 = s1h1 || s1h2 || '';
      metadata.subject_id_sem2 = s2h1 || s2h2 || '';
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
        subject_id_sem1_h1: s1h1,
        subject_id_sem1_h2: s1h2,
        subject_id_sem2_h1: s2h1,
        subject_id_sem2_h2: s2h2,
        subject_id_sem1: s1h1 || s1h2,
        subject_id_sem2: s2h1 || s2h2,
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

  const handleToggleClassStatus = React.useCallback(async (classToToggle: Class, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const currentStatus = classToToggle.status || 'Ativo';
    const newStatus: 'Ativo' | 'Inativo' = currentStatus === 'Ativo' ? 'Inativo' : 'Ativo';

    try {
      setLoading(true);
      const updatedClass = { ...classToToggle, status: newStatus };
      await saveData('classes', classToToggle.id, updatedClass);

      setClasses(prev => prev.map(c => c.id === classToToggle.id ? updatedClass : c));

      if (selectedClass?.id === classToToggle.id) {
        setSelectedClass(updatedClass);
        setFormData(prev => ({ ...prev, status: newStatus }));
      }

      setNotification({
        type: 'success',
        message: newStatus === 'Ativo'
          ? `Turma "${classToToggle.name}" ATIVADA com sucesso!`
          : `Turma "${classToToggle.name}" definida como INATIVA com sucesso.`
      });
    } catch (err: any) {
      console.error('Error toggling class status:', err);
      setNotification({
        type: 'error',
        message: 'Erro ao alterar status da turma: ' + (err?.message || 'Erro desconhecido')
      });
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  const handleDelete = React.useCallback(async () => {
    if (!selectedClass?.id) return;

    try {
      setLoading(true);
      const className = selectedClass.name;
      const classYear = selectedClass.year || '';
      const classAcademicYear = getClassStartYear(selectedClass);

      await deleteData('classes', selectedClass.id);
      
      setSelectedClass(null);
      setFormData({
        status: 'Ativo',
        days_of_week: [],
        period: 'Tarde'
      });
      setIsEditing(false);
      setShowDeleteConfirm(false);
      setNotification({
        type: 'success',
        message: `Turma "${className}" (${classYear} - Ano ${classAcademicYear}) excluída com sucesso! Os dados e turmas de outros anos/períodos foram preservados.`
      });
      await fetchClasses();
    } catch (error: any) {
      console.error('Error deleting class:', error);
      setNotification({
        type: 'error',
        message: 'Erro ao excluir turma: ' + (error?.message || 'Erro desconhecido')
      });
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, fetchClasses, getClassStartYear]);

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

  const computePromotedClassCode = (sourceCode: string, targetAcademicYear?: string, sourceCourse?: string, sourceStartYear?: string | number) => {
    const targetYr2 = targetAcademicYear ? String(targetAcademicYear).slice(-2) : '27';
    
    if (sourceCode) {
      const cleanCode = sourceCode.trim().toUpperCase();
      // Matches TEO-23, TEO-23/26, TEO-23/27, TEO23, etc.
      const match = cleanCode.match(/^([A-Z]+)[-_]?(\d{2})(?:[/-]\d{2})?$/);
      if (match) {
        const prefix = match[1];
        const startYr2 = match[2];
        return `${prefix}-${startYr2}/${targetYr2}`;
      }
      const matchGeneric = cleanCode.match(/^([A-Z0-9_-]+?)(?:[/-]\d{2})?$/);
      if (matchGeneric && matchGeneric[1] && isNaN(Number(matchGeneric[1]))) {
        return `${matchGeneric[1]}/${targetYr2}`;
      }
    }

    // Fallback based on course name
    let prefix = 'TEO';
    const cName = (sourceCourse || '').toLowerCase();
    if (cName.includes('doutrina') && cName.includes('social')) prefix = 'DSI';
    else if (cName.includes('santos') && cName.includes('negros')) prefix = 'HSN';
    else if (cName.includes('latim')) prefix = 'LAT';
    else if (cName.includes('teologia')) prefix = 'TEO';
    else if (sourceCourse && sourceCourse.length >= 3) prefix = sourceCourse.substring(0, 3).toUpperCase();

    const startYr2 = sourceStartYear ? String(sourceStartYear).slice(-2) : '23';
    return `${prefix}-${startYr2}/${targetYr2}`;
  };

  const computePromotedClassName = (sourceName: string, targetAcademicYear?: string) => {
    if (!sourceName) return '';
    let baseName = sourceName
      .replace(/\s*\([\dº\s]*ano\)/i, '')
      .replace(/\s*\(curso\s*extra\)/i, '')
      .trim();

    // Se já possuir sufixo de ano de progressão anterior como " - 2026", " - 2027", "/2026", "/2027", remove para atualizar com o novo formato
    baseName = baseName.replace(/\s*[-–—]\s*(20\d{2}|19\d{2})$/, '').trim();
    baseName = baseName.replace(/\/(20\d{2}|19\d{2})$/, '').trim();
    baseName = baseName.replace(/\/\d{2}$/, '').trim();

    // Se o nome base contiver um ano (ex: TEOLOGIA 2023), gera no formato padrão TEOLOGIA 2023/2027
    const startYrMatch = baseName.match(/\b(20\d{2}|19\d{2})\b/);
    if (startYrMatch && targetAcademicYear) {
      const startYr = startYrMatch[1];
      const prefix = baseName.substring(0, baseName.indexOf(startYr) + startYr.length).trim();
      if (String(targetAcademicYear) !== startYr) {
        return `${prefix}/${targetAcademicYear}`.toUpperCase();
      }
      return prefix.toUpperCase();
    }

    if (targetAcademicYear) {
      return `${baseName}/${targetAcademicYear}`.toUpperCase();
    }

    return baseName.toUpperCase();
  };

  const setupImportModalDefaults = async (sourceClass: Class, customCode?: string) => {
    let nextYr = '2º Ano';
    if (sourceClass.year === '1º Ano') nextYr = '2º Ano';
    else if (sourceClass.year === '2º Ano') nextYr = '3º Ano';
    else if (sourceClass.year === '3º Ano') nextYr = '4º Ano';
    else if (sourceClass.year === '4º Ano') nextYr = '4º Ano';
    else nextYr = sourceClass.year || '2º Ano';

    setImportTargetYear(nextYr);

    const srcYr = getClassStartYear(sourceClass);
    // Para turmas do 1º ao 3º ano, calcula o próximo ano letivo
    let gradeOffset = 1;
    if (sourceClass.year === '1º Ano') gradeOffset = 1;
    else if (sourceClass.year === '2º Ano') gradeOffset = 2;
    else if (sourceClass.year === '3º Ano') gradeOffset = 3;
    else if (sourceClass.year === '4º Ano') gradeOffset = 4;

    const projectedAcademicYear = String(srcYr ? srcYr + gradeOffset : new Date().getFullYear() + 1);
    setImportTargetAcademicYear(projectedAcademicYear);

    // Formato padrão definido: preserva o nome original da turma e adiciona /xxxx (ex: TEOLOGIA 2023/2027)
    setImportNewName(computePromotedClassName(sourceClass.name || '', projectedAcademicYear));
    const promotedCode = computePromotedClassCode(sourceClass.code || '', projectedAcademicYear, sourceClass.course || sourceClass.name, srcYr);
    setImportNewCode(customCode || promotedCode);

    setImportMigrateStudents(true);

    try {
      const [enrollments, studentsData] = await Promise.all([
        fetchAll('enrollments').catch(() => []),
        fetchAll('students').catch(() => [])
      ]);

      const sourceEnr = (enrollments || []).filter((e: any) => e.class_id === sourceClass.id && (e.status || 'Ativo') === 'Ativo');
      const directStudents = (studentsData || []).filter((s: any) => s.class_id === sourceClass.id && (s.status || 'Ativo') === 'Ativo');

      const studentMap = new Map<string, { id: string, name: string, registration_number?: string }>();
      
      directStudents.forEach((s: any) => {
        studentMap.set(s.id, {
          id: s.id,
          name: s.name,
          registration_number: s.registration_number
        });
      });

      sourceEnr.forEach((e: any) => {
        if (!studentMap.has(e.student_id)) {
          const found = (studentsData || []).find((s: any) => s.id === e.student_id);
          if (found) {
            studentMap.set(found.id, {
              id: found.id,
              name: found.name,
              registration_number: found.registration_number
            });
          } else {
            studentMap.set(e.student_id, {
              id: e.student_id,
              name: e.student_name || `Aluno ID: ${e.student_id}`
            });
          }
        }
      });

      const list = Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setSourceStudentsList(list);
      setSourceStudentsCount(list.length);
      setSelectedStudentIds(list.map(s => s.id));
    } catch (err) {
      setSourceStudentsList([]);
      setSourceStudentsCount(0);
      setSelectedStudentIds([]);
    }
  };

  const handleConclude4thYearClass = async (targetClass: Class) => {
    if (!targetClass) return;
    try {
      setIsImporting(true);
      const updatedClass = {
        ...targetClass,
        status: 'Encerrada' as const,
        observations: ((targetClass.observations || '') + ' [Curso Concluído - Ciclo Acadêmico Finalizado no 4º Ano]').trim()
      };
      await saveData('classes', targetClass.id, updatedClass);
      setClasses(prev => prev.map(c => c.id === targetClass.id ? updatedClass : c));
      if (selectedClass?.id === targetClass.id) {
        setSelectedClass(prev => prev ? updatedClass : null);
        setFormData(prev => ({ ...prev, status: 'Encerrada' }));
      }
      setShowImportModal(false);
      setNotification({
        type: 'success',
        message: `🎓 Turma "${targetClass.name}" encerrada com sucesso como CURSO CONCLUÍDO!`
      });
    } catch (err: any) {
      console.error(err);
      alert('Erro ao encerrar turma: ' + err.message);
    } finally {
      setIsImporting(false);
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
      setImportTargetAcademicYear('2027');
      setImportTargetYear('2º Ano');
      setSourceStudentsCount(0);
      setSourceStudentsList([]);
      setSelectedStudentIds([]);
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
      setImportProgress(10);
      setImportProgressText('Criando nova estrutura da turma no banco de dados...');

      // Automatically link all subjects belonging to target year for both 1st and 2nd semesters
      const targetYearSubs = subjects.filter(s => s.year === importTargetYear);
      const sem1Subs = targetYearSubs.filter(s => (s.semester || '').includes('1'));
      const sem2Subs = targetYearSubs.filter(s => (s.semester || '').includes('2'));

      const s1h1 = sem1Subs[0]?.id || '';
      const s1h2 = sem1Subs[1]?.id || '';
      const s2h1 = sem2Subs[0]?.id || '';
      const s2h2 = sem2Subs[1]?.id || '';

      const autoSubjectIds = [s1h1, s1h2, s2h1, s2h2].filter(Boolean);

      const targetAcademicYr = importTargetAcademicYear || String(getClassStartYear(sourceClass) + 1);

      const newClassData: Partial<Class> = {
        name: importNewName,
        code: importNewCode || String(Date.now()).slice(-3),
        year: importTargetYear,
        start_year: targetAcademicYr,
        academic_year: targetAcademicYr,
        period: sourceClass.period || 'Tarde',
        days_of_week: sourceClass.days_of_week || [],
        room: sourceClass.room || '',
        status: 'Ativo',
        subject_id: s1h1 || s2h1 || undefined,
        subject_id_sem1_h1: s1h1,
        subject_id_sem1_h2: s1h2,
        subject_id_sem2_h1: s2h1,
        subject_id_sem2_h2: s2h2,
        subject_id_sem1: s1h1 || s1h2 || undefined,
        subject_id_sem2: s2h1 || s2h2 || undefined,
        subject_ids: autoSubjectIds,
        start_date: `${targetAcademicYr}-02-01`,
        observations: `[METADATA:${JSON.stringify({
          year: importTargetYear,
          start_year: targetAcademicYr,
          academic_year: targetAcademicYr,
          subject_id_sem1_h1: s1h1,
          subject_id_sem1_h2: s1h2,
          subject_id_sem2_h1: s2h1,
          subject_id_sem2_h2: s2h2,
          subject_id_sem1: s1h1 || s1h2,
          subject_id_sem2: s2h1 || s2h2,
          subject_ids: autoSubjectIds,
          imported_from: sourceClass.id
        })}] Turma promovida/importada de ${sourceClass.name} (${sourceClass.year || 'Ano Anterior'}) para o Ano Letivo ${targetAcademicYr}`
      };

      const newClassId = await saveData('classes', undefined, newClassData);
      setImportProgress(30);
      setImportProgressText(`Turma criada com sucesso (ID: ${newClassId}). Preparando alunos...`);

      let migratedStudentsCount = 0;
      const createdEnrollmentIds: string[] = [];

      const studentIdsToMigrate = importMigrateStudents 
        ? sourceStudentsList.map(s => s.id)
        : selectedStudentIds;

      if (studentIdsToMigrate.length > 0) {
        const totalToMigrate = studentIdsToMigrate.length;

        for (let idx = 0; idx < totalToMigrate; idx++) {
          const studentId = studentIdsToMigrate[idx];
          const currentStudent = sourceStudentsList.find(s => s.id === studentId);
          const studentName = currentStudent?.name || `Aluno #${idx + 1}`;

          const pct = Math.round(30 + ((idx + 1) / totalToMigrate) * 60);
          setImportProgress(pct);
          setImportProgressText(`Matriculando aluno ${idx + 1} de ${totalToMigrate}: ${studentName}...`);

          // Add new enrollment record linking student to the new class in that academic year
          const enrId = await saveData('enrollments', undefined, {
            student_id: studentId,
            class_id: newClassId,
            academic_year: targetAcademicYr,
            status: 'Ativo',
            enrollment_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });
          if (enrId) createdEnrollmentIds.push(enrId);

          // Update current class_id ONLY if promoting for the current active calendar year
          if (targetAcademicYr === currentAcademicYear) {
            await saveData('students', studentId, { class_id: newClassId });
          }
          migratedStudentsCount++;

          // Small yield to let React render progress bar
          if (idx % 2 === 0) {
            await new Promise(r => setTimeout(r, 20));
          }
        }
      }

      // Record batch in import history so user can revert if desired
      try {
        const batchRecord = {
          id: `BATCH-CLASS-PROMOTION-${Date.now()}`,
          type: 'classes',
          filename: `Promoção: ${sourceClass.name} -> ${importNewName}`,
          record_count: 1,
          inserted_ids: [newClassId],
          created_at: new Date().toISOString(),
          status: 'completed',
          summary: `Turma "${importNewName}" criada a partir de ${sourceClass.name} com ${migratedStudentsCount} aluno(s). Turma de origem mantida intacta.`,
          details: {
            names: [importNewName],
            codes: [importNewCode || '---']
          }
        };
        const cached = localStorage.getItem('db_import_history');
        const list = cached ? JSON.parse(cached) : [];
        list.unshift(batchRecord);
        localStorage.setItem('db_import_history', JSON.stringify(list));
        saveData('import_history', batchRecord.id, batchRecord).catch(() => {});
      } catch (e) {}

      setImportProgress(100);
      setImportProgressText('Concluído com sucesso!');

      setShowImportModal(false);
      await fetchClasses();

      const createdClass = {
        ...newClassData,
        id: newClassId
      } as Class;

      setSelectedClass(createdClass);
      setFormData(createdClass);

      const srcYear = getClassStartYear(sourceClass);
      setNotification({
        type: 'success',
        message: `✅ Nova turma "${importNewName}" (${importTargetYear} - Ano Letivo ${targetAcademicYr}) criada com sucesso! ${migratedStudentsCount} aluno(s) matriculado(s). A turma de origem "${sourceClass.name}" (Ano Letivo ${srcYear}) foi 100% PRESERVADA e permanece ativa no seu ano letivo.`
      });

    } catch (error: any) {
      console.error('Error importing class:', error);
      alert('Erro ao importar turma: ' + error.message);
    } finally {
      setIsImporting(false);
      setImportProgress(0);
      setImportProgressText('');
    }
  };

  const filteredClasses = React.useMemo(() => {
    let result = classes.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'Todos' || (c.status || 'Ativo') === statusFilter;
      
      const matchesYear = selectedYearFilter === 'Todos' || (c.year || '1º Ano') === selectedYearFilter;

      const matchesPeriod = selectedPeriodFilter === 'Todos' || (c.period || '') === selectedPeriodFilter;

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

      const matchesAcademicYear = isClassActiveInAcademicYear(c, selectedAcademicYearFilter);

      return matchesSearch && matchesStatus && matchesYear && matchesSemester && matchesPeriod && matchesAcademicYear;
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
  }, [classes, subjects, searchTerm, statusFilter, selectedYearFilter, selectedSemesterFilter, selectedPeriodFilter, selectedAcademicYearFilter, sortBy, isClassActiveInAcademicYear]);

  const hasActiveFilters = searchTerm !== '' || selectedYearFilter !== 'Todos' || selectedSemesterFilter !== 'Todos' || statusFilter !== 'Todos' || selectedPeriodFilter !== 'Todos' || selectedAcademicYearFilter !== 'ATUAL';

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedYearFilter('Todos');
    setSelectedSemesterFilter('Todos');
    setStatusFilter('Todos');
    setSelectedPeriodFilter('Todos');
    setSelectedAcademicYearFilter('ATUAL');
  };

  // Unallocated Students calculations
  const unallocatedStudents = React.useMemo(() => {
    const activeClassIds = new Set(classes.filter(c => c.status === 'Ativo' || !c.status).map(c => c.id));
    return allStudents.filter(s => {
      if (s.status === 'Inativo') return false;
      const hasValidPrimary = s.class_id && activeClassIds.has(s.class_id);
      const hasValidMulti = allEnrollments.some(e => e.student_id === s.id && (e.status || 'Ativo') === 'Ativo' && activeClassIds.has(e.class_id));
      return !hasValidPrimary && !hasValidMulti;
    });
  }, [allStudents, allEnrollments, classes]);

  const filteredUnallocatedStudents = React.useMemo(() => {
    const term = unallocatedSearchTerm.trim().toLowerCase();
    if (!term) return unallocatedStudents;
    return unallocatedStudents.filter(s => 
      (s.name || '').toLowerCase().includes(term) ||
      (s.registration_number || '').includes(term) ||
      (s.cpf || '').includes(term)
    );
  }, [unallocatedStudents, unallocatedSearchTerm]);

  const handleBatchAllocateStudents = async () => {
    if (!targetClassForUnallocated || selectedUnallocatedStudentIds.length === 0) return;
    setIsAllocatingStudents(true);
    try {
      const targetClass = classes.find(c => c.id === targetClassForUnallocated);
      const detectedCourse = targetClass ? detectCourseFromClass(targetClass) : '';
      const now = new Date().toISOString().split('T')[0];

      for (const studentId of selectedUnallocatedStudentIds) {
        const student = allStudents.find(s => s.id === studentId);
        const studentCourse = detectedCourse || student?.course;

        // 1. Update student's primary class
        await saveData('students', studentId, {
          class_id: targetClassForUnallocated,
          ...(studentCourse ? { course: studentCourse } : {}),
          ...(targetClass?.start_date ? { start_date: targetClass.start_date } : {})
        });

        // 2. Add enrollment record
        await saveData('enrollments', undefined, {
          student_id: studentId,
          class_id: targetClassForUnallocated,
          status: 'Ativo',
          enrollment_date: targetClass?.start_date || now
        });
      }

      setNotification({
        type: 'success',
        message: `${selectedUnallocatedStudentIds.length} aluno(s) vinculado(s) com sucesso à turma "${targetClass?.name || ''}"!`
      });

      setSelectedUnallocatedStudentIds([]);
      setShowUnallocatedModal(false);
      await fetchClasses();
    } catch (err: any) {
      console.error('Erro na alocação em lote:', err);
      setNotification({
        type: 'error',
        message: 'Erro ao alocar alunos: ' + (err.message || 'Erro desconhecido')
      });
    } finally {
      setIsAllocatingStudents(false);
    }
  };

  const actualListCollapsed = selectedClass !== null || isEditing;

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
          "bg-white rounded-none shadow-sm flex flex-col order-last transition-all duration-300 ease-in-out border border-slate-200 overflow-hidden shrink-0",
          actualListCollapsed 
            ? (hoverShowList 
                ? "absolute right-0 top-0 bottom-0 h-full z-50 w-full sm:w-[432px] opacity-100 shadow-2xl border-l border-slate-200" 
                : "w-0 opacity-0 border-0 pointer-events-none overflow-hidden hidden"
              )
            : "w-full lg:w-[380px] xl:w-[420px] opacity-100 h-full"
        )}
      >
        <div className="flex-[1] flex flex-col overflow-hidden w-full bg-white">
          <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Turmas</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black border border-slate-200">
                    {filteredClasses.length}
                  </span>
                </h2>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-0.5">Catálogo e Gestão de Grupos</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={handleOpenImportModal}
                  className="px-2.5 py-1.5 bg-blue-800 text-white rounded-none hover:bg-blue-900 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer text-[10px] font-bold uppercase tracking-wider"
                  title="IMPORTAR / PROMOVER TURMA DE UM ANO A OUTRO"
                >
                  <RefreshCw size={13} />
                  <span className="hidden sm:inline">Importar</span>
                </button>
                <button 
                  onClick={handleNew}
                  className="px-3 py-1.5 bg-slate-800 text-white rounded-none hover:bg-slate-900 transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95 text-[10px] font-bold uppercase tracking-wider"
                  title="NOVA TURMA"
                >
                  <Plus size={14} />
                  <span>Nova</span>
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              {/* Unallocated Students Alert / Quick Allocation Button */}
              {unallocatedStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetClassForUnallocated(selectedClass?.id || classes.find(c => c.status === 'Ativo' || !c.status)?.id || '');
                    setSelectedUnallocatedStudentIds([]);
                    setUnallocatedSearchTerm('');
                    setShowUnallocatedModal(true);
                  }}
                  className="w-full p-2.5 bg-amber-50 hover:bg-amber-100/90 border border-amber-300 text-amber-950 flex items-center justify-between text-left transition-all cursor-pointer shadow-2xs group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0 group-hover:scale-110 transition-transform" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider leading-tight text-amber-950">
                        {unallocatedStudents.length} Aluno(s) Sem Turma
                      </p>
                      <p className="text-[9px] text-amber-700 font-semibold truncate">
                        Clique para vincular a uma turma ativa
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-amber-600 group-hover:bg-amber-700 text-white text-[9px] font-black uppercase tracking-wider shrink-0 transition-colors shadow-2xs">
                    Alocar
                  </span>
                </button>
              )}

              {/* Search Bar */}
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={14} />
                <input 
                  type="text"
                  placeholder="Buscar por nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-7 py-2 bg-slate-50 border border-slate-200 text-[11px] font-bold focus:ring-1 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button 
                    type="button" 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                    title="Limpar busca"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Row 1: Ano Letivo (Base/Histórico) & Módulo / Série */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Ano Letivo:</span>
                    {selectedAcademicYearFilter !== 'ATUAL' && (
                      <span className="text-[8px] font-black text-blue-700 bg-blue-50 px-1 border border-blue-200 uppercase">Filtro</span>
                    )}
                  </label>
                  <select
                    value={selectedAcademicYearFilter}
                    onChange={(e) => setSelectedAcademicYearFilter(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-1 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all cursor-pointer uppercase"
                  >
                    <option value="ATUAL">Ano Atual ({currentAcademicYear})</option>
                    <option value="Todos">Todos os Anos (Histórico)</option>
                    {availableAcademicYears.map(yr => (
                      <option key={yr} value={yr}>Ano {yr}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Módulo / Série:</label>
                  <select
                    value={selectedYearFilter}
                    onChange={(e) => setSelectedYearFilter(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-1 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all cursor-pointer"
                  >
                    <option value="Todos">Todos os Módulos</option>
                    {['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Semestre & Turno/Período */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Semestre:</label>
                  <select
                    value={selectedSemesterFilter}
                    onChange={(e) => setSelectedSemesterFilter(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-1 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all cursor-pointer"
                  >
                    <option value="Todos">Todos os Semestres</option>
                    <option value="1º Semestre">1º Semestre</option>
                    <option value="2º Semestre">2º Semestre</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Turno / Período:</label>
                  <select
                    value={selectedPeriodFilter}
                    onChange={(e) => setSelectedPeriodFilter(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-1 focus:ring-slate-500/10 focus:border-slate-400 outline-none cursor-pointer"
                  >
                    <option value="Todos">Todos os Turnos</option>
                    <option value="Noite">Noite</option>
                    <option value="Manhã">Manhã</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Sábado">Sábado</option>
                    <option value="Integral">Integral</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Status & Ordenação */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Status:</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-1 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all cursor-pointer"
                  >
                    <option value="Todos">Todos os Status</option>
                    <option value="Ativo">Apenas Ativos</option>
                    <option value="Encerrada">Turmas Encerradas</option>
                    <option value="Inativo">Inativos</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Ordenar por:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-1 focus:ring-slate-500/10 focus:border-slate-400 outline-none cursor-pointer"
                  >
                    <option value="name_year">Nome e Ano (Recente)</option>
                    <option value="name">Nome (A-Z)</option>
                    <option value="code">Código</option>
                    <option value="year">Ano / Módulo</option>
                    <option value="period">Turno / Período</option>
                  </select>
                </div>
              </div>

              {/* Active Filter Badges / Chips */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                  {selectedAcademicYearFilter !== 'ATUAL' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-900 text-white text-[9px] font-extrabold uppercase">
                      Ano: {selectedAcademicYearFilter === 'Todos' ? 'Todos os Anos' : selectedAcademicYearFilter}
                      <button type="button" onClick={() => setSelectedAcademicYearFilter('ATUAL')} className="hover:text-amber-300 cursor-pointer">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 text-[9px] font-extrabold uppercase">
                      Busca: "{searchTerm}"
                      <button type="button" onClick={() => setSearchTerm('')} className="hover:text-rose-600 cursor-pointer">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {selectedYearFilter !== 'Todos' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 text-white text-[9px] font-extrabold uppercase">
                      {selectedYearFilter}
                      <button type="button" onClick={() => setSelectedYearFilter('Todos')} className="hover:text-amber-300 cursor-pointer">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {selectedSemesterFilter !== 'Todos' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-800 text-white text-[9px] font-extrabold uppercase">
                      {selectedSemesterFilter}
                      <button type="button" onClick={() => setSelectedSemesterFilter('Todos')} className="hover:text-amber-300 cursor-pointer">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {selectedPeriodFilter !== 'Todos' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-900 border border-purple-200 text-[9px] font-extrabold uppercase">
                      Turno: {selectedPeriodFilter}
                      <button type="button" onClick={() => setSelectedPeriodFilter('Todos')} className="hover:text-rose-600 cursor-pointer">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {statusFilter !== 'Todos' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-200 text-[9px] font-extrabold uppercase">
                      Status: {statusFilter}
                      <button type="button" onClick={() => setStatusFilter('Todos')} className="hover:text-rose-600 cursor-pointer">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-[9px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer ml-auto"
                  >
                    <RotateCcw size={10} />
                    <span>Limpar Tudo</span>
                  </button>
                </div>
              )}
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
              filteredClasses.map((cls, clsIdx) => (
                <ClassItem
                  key={`cls-item-${cls.id || cls.code || clsIdx}-${clsIdx}`}
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

      {/* Main Content Area (Class Details or Registration Form or Overview Dashboard) */}
      <div 
        className={cn(
          "bg-white rounded-none shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 min-w-0 h-full flex-1",
          actualListCollapsed ? "max-w-5xl mx-auto w-full" : "w-full"
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
                      formData.status === 'Inativo' 
                        ? "bg-amber-50 text-amber-800 border-amber-300" 
                        : formData.status === 'Encerrada'
                          ? "bg-slate-100 text-slate-600 border-slate-300"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}>
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full", 
                        formData.status === 'Inativo' 
                          ? "bg-amber-500" 
                          : formData.status === 'Encerrada'
                            ? "bg-slate-400"
                            : "bg-emerald-500 animate-pulse"
                      )} />
                      {formData.status === 'Inativo' ? 'Inativo' : (formData.status || 'Ativo')}
                    </div>

                    {selectedClass && !isEditing && (
                      <button
                        type="button"
                        onClick={() => handleToggleClassStatus(selectedClass)}
                        className={cn(
                          "px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border",
                          (selectedClass.status || 'Ativo') === 'Ativo'
                            ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                        )}
                        title={(selectedClass.status || 'Ativo') === 'Ativo' ? "Clique para desativar esta turma" : "Clique para ativar esta turma"}
                      >
                        {(selectedClass.status || 'Ativo') === 'Ativo' ? (
                          <>
                            <Clock size={11} className="text-amber-700" />
                            <span>Desativar Turma</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={11} className="text-white" />
                            <span>Ativar Turma</span>
                          </>
                        )}
                      </button>
                    )}

                    {selectedClass && (
                      <button
                        type="button"
                        onClick={() => handleOpenStudentsModal()}
                        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-none text-[9px] font-extrabold uppercase tracking-widest bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 transition-all cursor-pointer shadow-xs group"
                        title="Clique para ver a lista de alunos matriculados nesta turma"
                      >
                        <Users size={12} className="text-blue-700 group-hover:scale-110 transition-transform" />
                        <span>{selectedClassStudentCount !== null ? `${selectedClassStudentCount} Alunos Matriculados` : 'Carregando Alunos...'}</span>
                        <Eye size={12} className="text-blue-600 ml-1 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    )}
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
                      {/* Step 1, Step 2 & Turno: Course, Start Year & Shift Selection */}
                      <div className="bg-blue-50/30 p-5 border border-blue-100/80 space-y-4">
                        <div className="flex flex-wrap items-end gap-3 md:gap-5">
                          {/* Code / ID */}
                          <div className="w-full sm:w-[130px] space-y-1.5 shrink-0">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1">
                                <Hash size={12} className="text-blue-900" />
                                CÓD.
                              </label>
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cLower = (formData.course || '').toLowerCase();
                                    const yrStr = String(formData.start_year || '').trim();
                                    const yr2 = yrStr.slice(-2);
                                    let auto = '';
                                    if (cLower.includes('teologia')) auto = `TEO-${yr2}`;
                                    else if (cLower.includes('doutrina')) auto = `DSI-${yr2}`;
                                    else if (cLower.includes('latim')) auto = `LAT-${yr2}`;
                                    else if (cLower.includes('santos')) auto = `HSN-${yr2}`;
                                    else auto = `TUR-${yr2}`;
                                    if (auto) setFormData({ ...formData, code: auto });
                                  }}
                                  className="text-[9px] font-bold text-blue-700 hover:text-blue-950 hover:underline cursor-pointer"
                                  title="Gerar código padrão baseado no curso e ano de início"
                                >
                                  🪄 Auto
                                </button>
                              )}
                            </div>
                            <input 
                              type="text"
                              disabled={!isEditing}
                              value={formData.code || ''}
                              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                              placeholder="EX: TEO-23"
                              className={cn(
                                "w-full px-3 py-2.5 border text-xs font-mono font-black text-center outline-none uppercase transition-all h-[42px]",
                                isEditing 
                                  ? "bg-white text-blue-950 border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600" 
                                  : "bg-slate-100/90 border-slate-300 text-slate-600 cursor-not-allowed"
                              )}
                            />
                          </div>

                          {/* Step 1: Course */}
                          <div className="flex-1 min-w-[200px] max-w-sm space-y-1.5">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-5 h-5 bg-blue-900 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                                Curso Escolhido <span className="text-rose-600 font-black">*</span>
                              </label>
                              <span className="text-[9px] font-extrabold text-blue-700 uppercase tracking-wider">
                                OBRIGATÓRIO
                              </span>
                            </div>
                            <select
                              disabled={!isEditing}
                              value={formData.course || ''}
                              onChange={(e) => handleSelectCourseStartYearAndAcademicYear(e.target.value, formData.start_year || '', formData.year || '')}
                              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 text-xs font-extrabold text-blue-950 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all uppercase"
                            >
                              <option value="">-- SELECIONE O CURSO --</option>
                              {PREDEFINED_COURSES.map(courseName => (
                                <option key={courseName} value={courseName}>
                                  {courseName === 'Outros' ? 'OUTROS / PERSONALIZADO' : courseName.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Step 2: Start Year / Reference Academic Year */}
                          <div className="w-full sm:w-[130px] space-y-1.5 shrink-0 relative">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-5 h-5 bg-blue-900 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                                Ano Início <span className="text-rose-600 font-black">*</span>
                              </label>
                            </div>
                            <input
                              type="text"
                              disabled={!isEditing}
                              maxLength={4}
                              placeholder="EX: 2023"
                              value={formData.start_year || ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                handleSelectCourseStartYearAndAcademicYear(formData.course || '', val, formData.year || '');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const yrNum = parseInt(formData.start_year || '', 10);
                                  if (formData.start_year && (isNaN(yrNum) || yrNum < 1999 || yrNum > 2100)) {
                                    alert('Ano inválido! O ano deve estar entre 1999 e 2100.');
                                    return;
                                  }
                                  document.getElementById('period-select')?.focus();
                                }
                              }}
                              className={cn(
                                "w-full px-3.5 py-2.5 bg-white border text-xs font-black outline-none transition-all font-mono placeholder:text-slate-300 uppercase",
                                formData.start_year && formData.start_year.length === 4 && (parseInt(formData.start_year, 10) < 1999 || parseInt(formData.start_year, 10) > 2100)
                                  ? "border-rose-500 text-rose-700 focus:ring-4 focus:ring-rose-500/10"
                                  : "border-slate-300 text-blue-950 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600"
                              )}
                            />
                            {formData.start_year && formData.start_year.length === 4 && (parseInt(formData.start_year, 10) < 1999 || parseInt(formData.start_year, 10) > 2100) && (
                              <div className="absolute top-full left-0 mt-1 whitespace-nowrap z-20 bg-rose-600 text-white border border-rose-700 px-2 py-1 shadow-md text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                                <span>⚠️</span> Ano inválido! (1999-2100)
                              </div>
                            )}
                          </div>

                          {/* Turno de Aula */}
                          <div className="w-full sm:w-[150px] space-y-1.5 shrink-0">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                                <Clock size={13} className="text-blue-900 shrink-0" />
                                Turno
                              </label>
                              <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wider">
                                PERÍODO
                              </span>
                            </div>
                            <select
                              id="period-select"
                              disabled={!isEditing}
                              value={formData.period || ''}
                              onChange={(e) => setFormData({ ...formData, period: e.target.value as any })}
                              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 text-xs font-extrabold text-blue-950 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all uppercase"
                            >
                              <option value="">-- TURNO --</option>
                              <option value="Noite">NOITE</option>
                              <option value="Manhã">MANHÃ</option>
                              <option value="Tarde">TARDE</option>
                              <option value="Sábado">SÁBADO</option>
                              <option value="Integral">INTEGRAL</option>
                            </select>
                          </div>

                          {/* Status da Turma */}
                          <div className="w-full sm:w-[150px] space-y-1.5 shrink-0">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-blue-900 shrink-0" />
                                Status da Turma
                              </label>
                            </div>
                            <select
                              disabled={!isEditing}
                              value={formData.status || 'Ativo'}
                              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                              className={cn(
                                "w-full px-3 py-2.5 bg-white border text-xs font-extrabold uppercase outline-none transition-all h-[42px]",
                                formData.status === 'Inativo' 
                                  ? "border-amber-400 text-amber-900 bg-amber-50/50" 
                                  : formData.status === 'Encerrada'
                                    ? "border-slate-400 text-slate-700 bg-slate-100"
                                    : "border-emerald-500 text-emerald-950 bg-emerald-50/30"
                              )}
                            >
                              <option value="Ativo">ATIVO (NORMAL)</option>
                              <option value="Inativo">INATIVO</option>
                              <option value="Encerrada">ENCERRADA</option>
                            </select>
                          </div>
                        </div>

                        {/* Dias de Aula na Semana */}
                        <div className="w-full space-y-2 pt-3 border-t border-blue-100/60">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 ml-0.5">
                            <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                              <Calendar size={13} className="text-blue-900 shrink-0" />
                              Dias de Aula na Semana
                            </label>
                            <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wider">
                              {formData.days_of_week && formData.days_of_week.length > 0 
                                ? `${formData.days_of_week.length} DIA(S): ${formData.days_of_week.join(', ')}`
                                : 'NENHUM DIA SELECIONADO'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {DAYS.map((day) => {
                              const isSelected = formData.days_of_week?.includes(day.value);
                              return (
                                <button
                                  key={day.value}
                                  type="button"
                                  disabled={!isEditing}
                                  onClick={() => toggleDay(day.value)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-none text-[10px] font-extrabold uppercase tracking-wider transition-all border flex items-center gap-1.5 cursor-pointer group",
                                    isSelected
                                      ? "bg-blue-900 border-blue-900 text-white shadow-xs"
                                      : "bg-white border-slate-300 text-slate-700 hover:border-slate-400 disabled:opacity-50"
                                  )}
                                >
                                  <div className={cn(
                                    "w-2.5 h-2.5 rounded-xs transition-all shrink-0",
                                    day.dotColor,
                                    isSelected ? "ring-2 ring-white/60 scale-110" : "opacity-75 group-hover:opacity-100"
                                  )} />
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Step 3: Academic Year */}
                        <div className="w-full space-y-2 pt-3 border-t border-blue-100/60">
                          <div className="flex items-center justify-between ml-0.5">
                            <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-2">
                              <span className="w-5 h-5 bg-blue-900 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-xs">3</span>
                              Ano Acadêmico <span className="text-rose-600 font-black">*</span>
                            </label>
                            <span className="text-[9px] font-extrabold text-blue-800 bg-blue-100/80 px-2 py-0.5 border border-blue-200 uppercase tracking-wider">
                              {formData.year ? `SELECIONADO: ${formData.year}` : 'CLIQUE EM UMA OPÇÃO ABAIXO'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-100/80 p-2 border border-slate-300/80">
                            {['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((year) => {
                              const isSelected = formData.year === year;
                              return (
                                <button
                                  key={year}
                                  type="button"
                                  disabled={!isEditing}
                                  onClick={() => handleSelectCourseStartYearAndAcademicYear(formData.course || '', formData.start_year || '', year)}
                                  className={cn(
                                    "group relative flex items-center justify-center gap-2 py-3 px-3.5 text-xs font-black uppercase tracking-wider transition-all duration-150 border-2 cursor-pointer outline-none select-none active:scale-[0.98]",
                                    isSelected 
                                      ? "bg-gradient-to-r from-blue-900 via-blue-950 to-indigo-950 text-white border-blue-900 shadow-md ring-2 ring-blue-500/30 z-10" 
                                      : "bg-white text-slate-700 border-slate-300 hover:border-blue-500 hover:bg-blue-50/70 hover:text-blue-900 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                  )}
                                >
                                  {isSelected ? (
                                    <CheckCircle2 size={15} className="text-amber-400 shrink-0 animate-in zoom-in-75 duration-150" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 group-hover:border-blue-500 group-hover:bg-blue-100/50 shrink-0 transition-colors" />
                                  )}
                                  <span className="truncate">{year}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Step 4, Sala, & Alunos Ativos in the same row */}
                        <div className="flex flex-wrap md:flex-nowrap items-start gap-4 pt-2">
                          {/* Field 1: Nome / Identificador da Turma */}
                          <div className="flex-[2] min-w-[220px] space-y-1.5">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                                <Edit2 size={13} className="text-blue-900" />
                                ID Turma / Nome
                                <span className="text-rose-600 font-black">*</span>
                              </label>
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const autoName = generateAutoClassName(formData.course || '', formData.start_year || '', formData.year || '');
                                    if (autoName) setFormData({ ...formData, name: autoName });
                                  }}
                                  className="text-[9px] font-extrabold px-2 py-0.5 uppercase tracking-wider text-blue-900 bg-blue-100 hover:bg-blue-200 border border-blue-300 flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                                  title="Preencher com o nome padrão automático do curso e ano"
                                >
                                  🪄 Sugerir Nome Padrão
                                </button>
                              )}
                            </div>
                            <input 
                              type="text"
                              disabled={!isEditing}
                              placeholder="EX: TEOLOGIA 2023, LATIM 2026..."
                              value={formData.name || ''}
                              onChange={(e) => setFormData({...formData, name: e.target.value.toUpperCase()})}
                              onKeyDown={handleKeyDown}
                              className={cn(
                                "w-full px-3.5 py-2.5 border text-xs font-black outline-none transition-all uppercase placeholder:text-slate-300 h-[42px]",
                                isEditing
                                  ? "bg-white text-blue-950 border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600"
                                  : "bg-slate-100/90 text-slate-600 border-slate-300 cursor-not-allowed"
                              )}
                              tabIndex={1}
                            />
                            <p className="text-[9px] font-medium text-slate-500 italic ml-0.5 leading-tight">
                              {isEditing ? "Campo totalmente editável. Digite o nome desejado para esta turma (ex: TEOLOGIA 2023)." : "Identificador oficial da turma."}
                            </p>
                          </div>

                          {/* Field 2: Sala / Local das Aulas */}
                          <div className="flex-[1.2] min-w-[150px] space-y-1.5">
                            <div className="flex items-center justify-between ml-0.5 h-[17px]">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Sala / Local</label>
                            </div>
                            <input 
                              type="text"
                              disabled={!isEditing}
                              placeholder="EX: SALA 01 / AUDITÓRIO"
                              value={formData.room || ''}
                              onChange={(e) => setFormData({...formData, room: e.target.value})}
                              onKeyDown={handleKeyDown}
                              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 text-xs font-bold text-slate-700 focus:ring-4 focus:ring-slate-500/10 outline-none transition-all h-[42px]"
                              tabIndex={2}
                            />
                          </div>

                          {/* Field 3: Data de Início */}
                          <div className="flex-[1] min-w-[130px] space-y-1.5">
                            <div className="flex items-center justify-between ml-0.5 h-[17px]">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Data Início</label>
                            </div>
                            <input 
                              type="text"
                              disabled={!isEditing}
                              placeholder="DD/MM/AAAA"
                              maxLength={10}
                              value={formData.start_date || ''}
                              onChange={(e) => setFormData({...formData, start_date: maskDate(e.target.value)})}
                              onKeyDown={handleKeyDown}
                              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 text-xs font-bold text-slate-700 focus:ring-4 focus:ring-slate-500/10 outline-none transition-all h-[42px] font-mono"
                              tabIndex={3}
                            />
                          </div>

                          {/* Field 4: Alunos Ativos */}
                          <div className="w-full md:w-[180px] shrink-0 space-y-1.5">
                            <div className="flex items-center justify-between ml-0.5 h-[17px]">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Alunos Ativos</label>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenStudentsModal()}
                              className="w-full flex items-center justify-between gap-2 bg-white hover:bg-blue-50/80 px-3 py-2 border border-slate-300 hover:border-blue-500 transition-all h-[42px] text-left cursor-pointer group shadow-2xs rounded-none"
                              title="Clique para ver a lista completa de alunos desta turma"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 bg-blue-900 text-white flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-blue-950 transition-colors">
                                  <Users size={13} />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-xs font-extrabold text-slate-900 uppercase block leading-none truncate">
                                    {selectedClassStudentCount !== null ? `${selectedClassStudentCount} Aluno(s)` : '---'}
                                  </span>
                                  <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Matriculados</p>
                                </div>
                              </div>
                              <span className="text-[9px] font-black text-blue-800 bg-blue-100/90 group-hover:bg-blue-900 group-hover:text-white px-1.5 py-0.5 uppercase tracking-wider transition-all border border-blue-200 shrink-0">
                                Ver
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Matriz Curricular Ativa (2 Disciplinas por Semestre - 1º e 2º Horário) */}
                    <div className="col-span-12 space-y-5 pt-2">
                      <div className="flex items-baseline justify-between ml-1 pb-1 border-b border-slate-100">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <BookOpen size={14} className="text-slate-400" />
                          Matriz Curricular Ativa
                        </label>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Definição de Horários e Matérias
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* 1º SEMESTRE */}
                        <div className="p-4 bg-blue-50/40 border border-blue-100/80 rounded-none space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-800 bg-blue-100/90 px-2 py-0.5 uppercase tracking-wider border border-blue-200/60">
                              1º Semestre
                            </span>
                            <span className="text-[9px] font-bold text-blue-600/80 uppercase tracking-tight">
                              {[sem1H1SubjectId, sem1H2SubjectId].filter(Boolean).length} de 2 Definidas
                            </span>
                          </div>

                          {/* 1º Horário */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-blue-900/70 uppercase tracking-wider flex items-center gap-1.5">
                              <Clock size={12} className="text-blue-500" />
                              1º Horário (1ª Matéria)
                            </label>
                            <div className="relative group">
                              <select 
                                disabled={!isEditing}
                                value={sem1H1SubjectId}
                                onChange={(e) => handleSetSemesterSubject(1, 1, e.target.value)}
                                className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 disabled:opacity-70 disabled:cursor-not-allowed outline-none transition-all shadow-xs appearance-none group-hover:border-slate-300"
                              >
                                <option value="">Selecionar 1º Horário (1º Semestre)...</option>
                                {getSemOptions(1, sem1H1SubjectId).map((subject, idx) => (
                                  <option 
                                    key={`s1h1-${subject.id}-${idx}`} 
                                    value={subject.id}
                                    disabled={[sem1H2SubjectId, sem2H1SubjectId, sem2H2SubjectId].includes(subject.id)}
                                  >
                                    [{subject.code}] {subject.name.toUpperCase()}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:rotate-180 transition-transform pointer-events-none" />
                            </div>
                          </div>

                          {/* 2º Horário */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-blue-900/70 uppercase tracking-wider flex items-center gap-1.5">
                              <Clock size={12} className="text-blue-500" />
                              2º Horário (2ª Matéria)
                            </label>
                            <div className="relative group">
                              <select 
                                disabled={!isEditing}
                                value={sem1H2SubjectId}
                                onChange={(e) => handleSetSemesterSubject(1, 2, e.target.value)}
                                className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 disabled:opacity-70 disabled:cursor-not-allowed outline-none transition-all shadow-xs appearance-none group-hover:border-slate-300"
                              >
                                <option value="">Selecionar 2º Horário (1º Semestre)...</option>
                                {getSemOptions(1, sem1H2SubjectId).map((subject, idx) => (
                                  <option 
                                    key={`s1h2-${subject.id}-${idx}`} 
                                    value={subject.id}
                                    disabled={[sem1H1SubjectId, sem2H1SubjectId, sem2H2SubjectId].includes(subject.id)}
                                  >
                                    [{subject.code}] {subject.name.toUpperCase()}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:rotate-180 transition-transform pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        {/* 2º SEMESTRE */}
                        <div className="p-4 bg-emerald-50/40 border border-emerald-100/80 rounded-none space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 uppercase tracking-wider border border-emerald-200/60">
                              2º Semestre
                            </span>
                            <span className="text-[9px] font-bold text-emerald-600/80 uppercase tracking-tight">
                              {[sem2H1SubjectId, sem2H2SubjectId].filter(Boolean).length} de 2 Definidas
                            </span>
                          </div>

                          {/* 1º Horário */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-emerald-900/70 uppercase tracking-wider flex items-center gap-1.5">
                              <Clock size={12} className="text-emerald-500" />
                              1º Horário (1ª Matéria)
                            </label>
                            <div className="relative group">
                              <select 
                                disabled={!isEditing}
                                value={sem2H1SubjectId}
                                onChange={(e) => handleSetSemesterSubject(2, 1, e.target.value)}
                                className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 disabled:opacity-70 disabled:cursor-not-allowed outline-none transition-all shadow-xs appearance-none group-hover:border-slate-300"
                              >
                                <option value="">Selecionar 1º Horário (2º Semestre)...</option>
                                {getSemOptions(2, sem2H1SubjectId).map((subject, idx) => (
                                  <option 
                                    key={`s2h1-${subject.id}-${idx}`} 
                                    value={subject.id}
                                    disabled={[sem1H1SubjectId, sem1H2SubjectId, sem2H2SubjectId].includes(subject.id)}
                                  >
                                    [{subject.code}] {subject.name.toUpperCase()}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:rotate-180 transition-transform pointer-events-none" />
                            </div>
                          </div>

                          {/* 2º Horário */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-emerald-900/70 uppercase tracking-wider flex items-center gap-1.5">
                              <Clock size={12} className="text-emerald-500" />
                              2º Horário (2ª Matéria)
                            </label>
                            <div className="relative group">
                              <select 
                                disabled={!isEditing}
                                value={sem2H2SubjectId}
                                onChange={(e) => handleSetSemesterSubject(2, 2, e.target.value)}
                                className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 disabled:opacity-70 disabled:cursor-not-allowed outline-none transition-all shadow-xs appearance-none group-hover:border-slate-300"
                              >
                                <option value="">Selecionar 2º Horário (2º Semestre)...</option>
                                {getSemOptions(2, sem2H2SubjectId).map((subject, idx) => (
                                  <option 
                                    key={`s2h2-${subject.id}-${idx}`} 
                                    value={subject.id}
                                    disabled={[sem1H1SubjectId, sem1H2SubjectId, sem2H1SubjectId].includes(subject.id)}
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
                    </div>



                    {/* Status da Turma: Ativo vs Inativo (Planejada) vs Encerrada */}
                    <div className="col-span-12 pt-2 space-y-2">
                      <div className="flex items-center justify-between ml-1 pb-1 border-b border-slate-100">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <SlidersHorizontal size={14} className="text-slate-400" />
                          Status Operacional da Turma
                        </label>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Ativação Manual / Pré-Cadastro
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Option 1: Ativo */}
                        <button
                          type="button"
                          disabled={!isEditing}
                          onClick={() => setFormData({ ...formData, status: 'Ativo' })}
                          className={cn(
                            "p-3.5 border text-left flex items-start gap-3 transition-all outline-none select-none",
                            isEditing ? "cursor-pointer" : "cursor-default",
                            (formData.status || 'Ativo') === 'Ativo'
                              ? "bg-emerald-50/90 border-emerald-500 text-emerald-950 shadow-sm ring-1 ring-emerald-500/30"
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0",
                            (formData.status || 'Ativo') === 'Ativo'
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-slate-300 bg-white"
                          )}>
                            {(formData.status || 'Ativo') === 'Ativo' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <p className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                              <span>Ativo</span>
                              <span className="text-[8px] font-black bg-emerald-200/80 text-emerald-950 px-1 py-0.2">Vigente</span>
                            </p>
                            <p className="text-[9.5px] text-slate-500 font-medium leading-tight">
                              Turma em funcionamento ativo no período letivo (aulas e diários liberados).
                            </p>
                          </div>
                        </button>

                        {/* Option 2: Inativo / Pré-cadastro */}
                        <button
                          type="button"
                          disabled={!isEditing}
                          onClick={() => setFormData({ ...formData, status: 'Inativo' })}
                          className={cn(
                            "p-3.5 border text-left flex items-start gap-3 transition-all outline-none select-none",
                            isEditing ? "cursor-pointer" : "cursor-default",
                            formData.status === 'Inativo'
                              ? "bg-amber-50/90 border-amber-500 text-amber-950 shadow-sm ring-1 ring-amber-500/30"
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0",
                            formData.status === 'Inativo'
                              ? "border-amber-600 bg-amber-600 text-white"
                              : "border-slate-300 bg-white"
                          )}>
                            {formData.status === 'Inativo' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <p className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                              <span>Inativo</span>
                            </p>
                            <p className="text-[9.5px] text-slate-500 font-medium leading-tight">
                              Turma temporariamente inativa ou em planejamento para ciclo posterior.
                            </p>
                          </div>
                        </button>

                        {/* Option 3: Encerrada */}
                        <button
                          type="button"
                          disabled={!isEditing}
                          onClick={() => setFormData({ ...formData, status: 'Encerrada' })}
                          className={cn(
                            "p-3.5 border text-left flex items-start gap-3 transition-all outline-none select-none",
                            isEditing ? "cursor-pointer" : "cursor-default",
                            formData.status === 'Encerrada'
                              ? "bg-slate-100 border-slate-500 text-slate-900 shadow-sm ring-1 ring-slate-400"
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0",
                            formData.status === 'Encerrada'
                              ? "border-slate-600 bg-slate-600 text-white"
                              : "border-slate-300 bg-white"
                          )}>
                            {formData.status === 'Encerrada' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-800">Encerrada</p>
                            <p className="text-[9.5px] text-slate-500 font-medium leading-tight">
                              Ciclo letivo finalizado e arquivado para registro histórico.
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Regime do Curso / Turma Especial Option */}
                    <div className="col-span-12 pt-2">
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
                      .replace(/\s*\}\]\s*$/g, '')
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
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4 p-8">
            <div className="w-20 h-20 bg-slate-50 border border-slate-200/60 rounded-none flex items-center justify-center text-slate-300">
              <School size={40} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">Nenhuma Turma Selecionada</p>
              <p className="text-xs text-slate-400 font-medium max-w-sm">
                Selecione uma turma na lista ao lado para visualizar os detalhes, alunos matriculados, disciplinas e diário acadêmico.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedClass && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-none shadow-2xl p-6 sm:p-8 max-w-md w-full space-y-5 animate-in zoom-in-95 duration-200 border border-slate-300">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-none flex items-center justify-center mx-auto border border-red-200">
              <Trash2 size={28} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-[#131b2e] uppercase tracking-tight">Excluir Turma Específica?</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Você está excluindo apenas este registro da turma:
              </p>
              <div className="bg-slate-50 border border-slate-200 p-3 text-left space-y-1.5 font-sans">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Turma:</span>
                  <span className="font-bold text-slate-900">{selectedClass.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Código:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedClass.code}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Ano Letivo / Módulo:</span>
                  <span className="font-bold text-blue-900">Ano {getClassStartYear(selectedClass)} ({selectedClass.year || '1º Ano'})</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Turno / Período:</span>
                  <span className="font-bold text-slate-700">{selectedClass.period}</span>
                </div>
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 border border-amber-200 text-left font-medium leading-snug">
                <strong>Proteção de Histórico:</strong> Esta exclusão afeta apenas esta turma. Se esta foi uma turma promovida/importada, os alunos serão mantidos e revinculados com segurança à sua turma anterior.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-none font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors border border-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-none font-bold text-xs uppercase tracking-wider hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import / Transition Class Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={cn(
            "bg-white rounded-none shadow-2xl p-6 sm:p-8 w-full space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto border border-slate-300 transition-all duration-300",
            !importMigrateStudents ? "max-w-5xl" : "max-w-3xl"
          )}>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-800 flex items-center justify-center font-bold border border-blue-200">
                  <RefreshCw size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Importar / Promover Turma para Novo Ciclo</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trânsito seguro de alunos entre anos e períodos letivos</p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Grid Layout: 2 Columns if list is active, 1 column if all migrated automatically */}
            <div className={cn("grid gap-6 text-xs items-start", !importMigrateStudents ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1")}>
              {/* Left Column: Form Settings */}
              <div className={cn("space-y-5", !importMigrateStudents ? "lg:col-span-6" : "")}>
                {/* Step 1: Select Source Class */}
                <div className="space-y-2 bg-slate-50 p-4 border border-slate-200">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    1. Selecione a Turma de Origem *
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
                    {classes.map((c, cIdx) => (
                      <option key={`imp-c-${c.id || c.code || cIdx}-${cIdx}`} value={c.id}>
                        [{c.code}] {c.name} (Ano {getClassStartYear(c)} - {c.year || 'Sem Ano'}) - {c.period}
                      </option>
                    ))}
                  </select>

                  {sourceStudentsCount > 0 && (
                    <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1.5 pt-1">
                      <Users size={13} />
                      <span>{sourceStudentsCount} aluno(s) ativo(s) detectado(s) nesta turma de origem.</span>
                    </p>
                  )}

                  {(() => {
                    const srcCls = classes.find(c => c.id === importSourceClassId);
                    if (srcCls && srcCls.year === '4º Ano') {
                      return (
                        <div className="bg-amber-50 border-2 border-amber-400 p-3.5 space-y-2 text-amber-950 mt-2">
                          <div className="flex items-center gap-2 font-black text-xs text-amber-900 uppercase tracking-wide">
                            <AlertTriangle size={16} className="text-amber-700 shrink-0" />
                            <span>Turma no 4º Ano — Ciclo Acadêmico Finalizado</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-amber-900 font-medium">
                            A turma de origem <strong>{srcCls.name}</strong> já está no <strong>4º Ano</strong> (ano letivo final do curso). No 4º ano a turma não progride para novos anos letivos; a turma deve ser encerrada com o status <strong>Curso Concluído</strong>.
                          </p>
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleConclude4thYearClass(srcCls)}
                              className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold uppercase text-[10px] tracking-wider flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                            >
                              <CheckCircle2 size={13} />
                              <span>Encerrar Turma (Curso Concluído)</span>
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Step 2: Configure Target Class */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1">
                    2. Configuração da Nova Turma de Destino
                  </h4>

                  {/* 2. Destination Class Configuration */}
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 sm:col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Código
                        </label>
                        <span className="text-[7.5px] font-extrabold text-blue-700 bg-blue-50 px-1 py-0.2 uppercase border border-blue-100">
                          Sugestão
                        </span>
                      </div>
                      <input
                        type="text"
                        value={importNewCode}
                        onChange={(e) => setImportNewCode(e.target.value.toUpperCase())}
                        placeholder="Ex: TEO-23/27"
                        className="w-full px-2.5 py-2 bg-white border border-slate-300 font-mono font-bold text-slate-800 text-xs text-center uppercase focus:ring-2 focus:ring-blue-500/20 outline-none"
                        title="Código da turma (pode ser ajustado livremente)"
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Ano Calendário *
                      </label>
                      <select
                        value={importTargetAcademicYear}
                        onChange={(e) => {
                          const newYr = e.target.value;
                          setImportTargetAcademicYear(newYr);
                          const srcCls = classes.find(c => c.id === importSourceClassId);
                          if (srcCls) {
                            setImportNewName(computePromotedClassName(srcCls.name || '', newYr));
                            setImportNewCode(computePromotedClassCode(srcCls.code || '', newYr, srcCls.course || srcCls.name, getClassStartYear(srcCls)));
                          }
                        }}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 font-bold text-slate-800 uppercase text-xs cursor-pointer"
                      >
                        {Array.from(new Set([
                          importTargetAcademicYear,
                          '2029', '2028', '2027', '2026', '2025', '2024'
                        ].filter(Boolean))).sort((a, b) => Number(b) - Number(a)).map(yr => (
                          <option key={yr} value={yr}>Ano {yr}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Módulo / Série *
                      </label>
                      <select
                        value={importTargetYear}
                        onChange={(e) => {
                          setImportTargetYear(e.target.value);
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 font-bold text-slate-800 uppercase text-xs cursor-pointer"
                      >
                        <option value="1º Ano">1º Ano</option>
                        <option value="2º Ano">2º Ano</option>
                        <option value="3º Ano">3º Ano</option>
                        <option value="4º Ano">4º Ano</option>
                      </select>
                    </div>

                    <div className="col-span-12">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Nome da Nova Turma *
                        </label>
                        {importSourceClassId && (
                          <button
                            type="button"
                            onClick={() => {
                              const srcCls = classes.find(c => c.id === importSourceClassId);
                              if (srcCls) {
                                setImportNewName(computePromotedClassName(srcCls.name || '', importTargetAcademicYear));
                                setImportNewCode(computePromotedClassCode(srcCls.code || '', importTargetAcademicYear, srcCls.course || srcCls.name, getClassStartYear(srcCls)));
                              }
                            }}
                            className="text-[9px] font-bold text-blue-700 hover:text-blue-900 underline uppercase"
                          >
                            Restaurar Padrão
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={importNewName}
                        onChange={(e) => setImportNewName(e.target.value)}
                        placeholder="Ex: TEOLOGIA 2023/2027"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 font-bold text-slate-800 uppercase text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 3: Options */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    3. Opções de Importação e Promoção de Alunos
                  </h4>

                  <label className="flex items-start gap-2.5 cursor-pointer bg-slate-50 p-3 border border-slate-200 hover:bg-slate-100/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={importMigrateStudents}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setImportMigrateStudents(checked);
                        if (checked) {
                          setSelectedStudentIds(sourceStudentsList.map(s => s.id));
                        } else {
                          setSelectedStudentIds([]);
                        }
                      }}
                      className="w-4 h-4 text-blue-800 rounded-none focus:ring-0 cursor-pointer mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">
                        Matricular automaticamente TODOS os {sourceStudentsCount} aluno(s) ativos na nova turma
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium block pt-0.5">
                        {importMigrateStudents 
                          ? 'Todos os alunos da turma de origem serão matriculados em bloco.'
                          : 'Desmarcado: selecione individualmente na listagem ao lado quais alunos deseja promover.'
                        }
                      </span>
                    </div>
                  </label>

                  {/* Preservation Guarantee Banner */}
                  <div className="bg-emerald-50/90 border border-emerald-300 p-3.5 space-y-1.5 text-emerald-950">
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-900">
                      <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                      <span className="uppercase tracking-wide">Garantia de Preservação Integral da Turma de Origem</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-950 font-medium">
                      A turma de origem <strong>{classes.find(c => c.id === importSourceClassId)?.name || 'selecionada'}</strong> (Ano Letivo {classes.find(c => c.id === importSourceClassId) ? getClassStartYear(classes.find(c => c.id === importSourceClassId)) : '---'}) <strong>NÃO</strong> será modificada, nem encerrada e nem excluída. Ela permanecerá 100% ativa e intacta no seu ano letivo.
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1 text-[10px] font-bold text-emerald-800 border-t border-emerald-200/80">
                      <span className="flex items-center gap-1">✓ Turma de Origem Intacta</span>
                      <span className="flex items-center gap-1">✓ Nova Turma Criada no Ano {importTargetAcademicYear}</span>
                      <span className="flex items-center gap-1">✓ Histórico Preservado</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Individual Student Selection Panel (Appears side-by-side when importMigrateStudents is FALSE) */}
              {!importMigrateStudents && (
                <div className="lg:col-span-6 border border-slate-300 bg-slate-50 p-4 space-y-3 flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-blue-800" />
                      <div>
                        <span className="font-bold text-slate-800 text-xs uppercase tracking-tight block">
                          Seleção Individual de Alunos
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          Marque os alunos que serão promovidos para a nova turma
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-900 font-mono font-extrabold text-[10px] border border-blue-200">
                      {selectedStudentIds.length} de {sourceStudentsList.length} selecionado(s)
                    </span>
                  </div>

                  {/* Search and Quick Action Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={studentSearchTerm}
                        onChange={(e) => setStudentSearchTerm(e.target.value)}
                        placeholder="Buscar por nome ou matrícula..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
                      />
                      <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds(sourceStudentsList.map(s => s.id))}
                        className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 text-[10px] font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds([])}
                        className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 text-[10px] font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Nenhum
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Checkbox List of Students */}
                  <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto border border-slate-200 bg-white divide-y divide-slate-100">
                    {sourceStudentsList.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 italic text-xs">
                        Nenhum aluno ativo cadastrado nesta turma de origem.
                      </div>
                    ) : (
                      sourceStudentsList
                        .filter(s => 
                          !studentSearchTerm || 
                          s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()) || 
                          (s.registration_number || '').includes(studentSearchTerm)
                        )
                        .map((student, sIdx) => {
                          const isSelected = selectedStudentIds.includes(student.id);
                          return (
                            <label
                              key={`imp-st-${student.id || sIdx}-${sIdx}`}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors text-xs select-none",
                                isSelected ? "bg-blue-50/70 hover:bg-blue-100/60" : "hover:bg-slate-50 text-slate-600"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const newIds = Array.from(new Set([...selectedStudentIds, student.id]));
                                      setSelectedStudentIds(newIds);
                                      if (newIds.length === sourceStudentsList.length) {
                                        setImportMigrateStudents(true);
                                      }
                                    } else {
                                      setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.id));
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-800 rounded-none focus:ring-0 cursor-pointer shrink-0"
                                />
                                <span className={cn("truncate font-medium", isSelected ? "font-bold text-slate-900" : "text-slate-700")}>
                                  {student.name}
                                </span>
                              </div>
                              {student.registration_number && (
                                <span className="font-mono text-[10px] text-slate-400 font-semibold shrink-0 ml-2 bg-slate-100 px-1.5 py-0.5 border border-slate-200">
                                  Matrícula: {student.registration_number}
                                </span>
                              )}
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Real-time Progress indicator when importing */}
            {isImporting && (
              <div className="bg-blue-50 border border-blue-200 p-4 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs font-black text-blue-950 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin text-blue-800" />
                    <span>{importProgressText || 'Processando importação...'}</span>
                  </span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full h-2.5 bg-blue-200/60 overflow-hidden">
                  <div 
                    className="h-full bg-blue-900 transition-all duration-300 ease-out"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                disabled={isImporting}
                onClick={() => setShowImportModal(false)}
                className="px-5 py-2.5 bg-slate-100 text-slate-700 font-bold uppercase text-xs tracking-wider border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer rounded-none disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || !importSourceClassId || !importNewName || classes.find(c => c.id === importSourceClassId)?.year === '4º Ano'}
                className="px-6 py-2.5 bg-blue-800 text-white font-bold uppercase text-xs tracking-wider border border-blue-900 hover:bg-blue-900 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer rounded-none"
                title={classes.find(c => c.id === importSourceClassId)?.year === '4º Ano' ? 'Turmas no 4º ano já completaram o ciclo acadêmico e não progridem mais.' : ''}
              >
                {isImporting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Importando ({importProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={15} />
                    <span>Confirmar Importação</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Lista de Alunos Matriculados */}
      {showStudentsModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-800 text-white flex items-center justify-center shrink-0">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
                    Alunos Matriculados
                    <span className="text-[10px] bg-blue-700 text-white px-2 py-0.5 rounded-none font-black">
                      {modalStudents.length} ALUNO(S)
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300 font-medium uppercase tracking-wider">
                    TURMA: {selectedClass?.name || formData.name || '---'} ({selectedClass?.code || formData.code || '---'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStudentsModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Toolbar (Search & Export) */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="BUSCAR POR NOME, MATRÍCULA OU CPF..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 text-xs font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 transition-all uppercase"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto shrink-0">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 bg-white border border-slate-300 px-3 py-2 cursor-pointer hover:bg-slate-100/80 transition-colors select-none shadow-2xs">
                  <input
                    type="checkbox"
                    checked={includeEmissionDate}
                    onChange={(e) => setIncludeEmissionDate(e.target.checked)}
                    className="w-3.5 h-3.5 text-blue-900 focus:ring-blue-500 rounded-none border-slate-300 cursor-pointer"
                  />
                  <span>Data/Hora de Emissão</span>
                </label>
                <button
                  type="button"
                  onClick={handleExportClassStudentListPDF}
                  disabled={modalStudents.length === 0}
                  className="flex-1 sm:flex-none px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Imprimir Lista de Alunos"
                >
                  <Printer size={14} />
                  <span>Imprimir</span>
                </button>
                {unallocatedStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetClassForUnallocated(selectedClass?.id || formData.id || '');
                      setSelectedUnallocatedStudentIds([]);
                      setUnallocatedSearchTerm('');
                      setShowUnallocatedModal(true);
                    }}
                    className="flex-1 sm:flex-none px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Adicionar alunos sem turma diretamente a esta turma"
                  >
                    <Plus size={14} />
                    <span>Adicionar Sem Turma ({unallocatedStudents.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Student List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[250px] bg-slate-100/50">
              {loadingModalStudents ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                  <Loader2 size={32} className="animate-spin text-blue-900" />
                  <p className="text-xs font-bold uppercase tracking-wider">Carregando lista de alunos...</p>
                </div>
              ) : modalStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 bg-white border border-dashed border-slate-300 p-8">
                  <Users size={36} className="text-slate-300" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Nenhum aluno matriculado nesta turma</p>
                  <p className="text-[10px] text-slate-400">Você pode matricular ou vincular alunos através do menu de Gestão de Alunos.</p>
                </div>
              ) : (() => {
                const filtered = modalStudents.filter(s => {
                  if (!modalSearchTerm) return true;
                  const term = modalSearchTerm.toLowerCase();
                  const name = (s.name || s.full_name || '').toLowerCase();
                  const reg = (s.registration_number || s.code || '').toLowerCase();
                  const cpf = (s.cpf || '').toLowerCase();
                  return name.includes(term) || reg.includes(term) || cpf.includes(term);
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase bg-white border border-slate-200">
                      Nenhum aluno encontrado para "{modalSearchTerm}"
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-2">
                      <span>Exibindo {filtered.length} de {modalStudents.length} aluno(s)</span>
                    </div>
                    <div className="bg-white border border-slate-200 divide-y divide-slate-100 shadow-2xs">
                      {filtered.map((s, idx) => (
                        <div
                          key={`cls-mdl-st-${s.id || s.registration_number || idx}-${idx}`}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 bg-blue-950 text-white font-extrabold text-xs flex items-center justify-center shrink-0 uppercase">
                              {(s.name || s.full_name || 'A').substring(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-900 uppercase tracking-wide truncate">
                                {s.name || s.full_name || 'Aluno sem nome'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-semibold uppercase">
                                <span>MATRÍCULA: {s.registration_number || s.code || '---'}</span>
                                {s.cpf && (
                                  <>
                                    <span>•</span>
                                    <span>CPF: {s.cpf}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <span className={cn(
                              "text-[9px] font-black px-2 py-0.5 uppercase tracking-wider border",
                              (s.status || 'Ativo') === 'Inativo'
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            )}>
                              {s.status || 'Ativo'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setShowStudentsModal(false);
                                navigate('/students', { state: { studentId: s.id } });
                              }}
                              className="px-3 py-1.5 bg-blue-900 hover:bg-blue-950 text-white text-[10px] font-extrabold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                              title="Ver ficha completa do aluno"
                            >
                              <span>Ver Ficha</span>
                              <ArrowRight size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowStudentsModal(false);
                  if (selectedClass) {
                    navigate('/students', { state: { classId: selectedClass.id } });
                  } else {
                    navigate('/students');
                  }
                }}
                className="text-xs font-bold text-blue-300 hover:text-white uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Ir para Gestão Geral de Alunos</span>
                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={() => setShowStudentsModal(false)}
                className="w-full sm:w-auto px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestão e Alocação de Alunos Sem Turma */}
      {showUnallocatedModal && (
        <div className="fixed inset-0 z-[210] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-amber-600 text-white flex items-center justify-between border-b border-amber-700 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-700 text-white flex items-center justify-center shrink-0 shadow-inner">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                    <span>Alunos Sem Turma Ativa</span>
                    <span className="text-[10px] bg-amber-800 text-amber-100 px-2 py-0.5 font-extrabold">
                      {unallocatedStudents.length} ALUNO(S) ENCONTRADO(S)
                    </span>
                  </h3>
                  <p className="text-[11px] text-amber-100 font-medium tracking-wide">
                    Selecione os alunos e a turma de destino para matriculá-los em lote ou individualmente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUnallocatedModal(false)}
                className="p-1.5 text-amber-100 hover:text-white hover:bg-amber-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Target Class Selection Bar */}
            <div className="p-4 bg-amber-50/80 border-b border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
              <div className="flex-1 w-full space-y-1">
                <label className="text-[11px] font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <School size={14} className="text-amber-700" />
                  <span>Turma de Destino para Matrícula:</span>
                </label>
                <select
                  value={targetClassForUnallocated}
                  onChange={(e) => setTargetClassForUnallocated(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-amber-300 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-2xs"
                >
                  <option value="">-- Escolha uma turma ativa para receber os alunos --</option>
                  {classes.filter(c => c.status === 'Ativo' || !c.status).map(c => (
                    <option key={`dest-cls-${c.id}`} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ''} - {c.period || 'Sem período'} | {c.year || '1º Ano'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Toolbar: Search & Select All */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="BUSCAR POR NOME, MATRÍCULA OU CPF..."
                  value={unallocatedSearchTerm}
                  onChange={(e) => setUnallocatedSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all uppercase"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedUnallocatedStudentIds.length === filteredUnallocatedStudents.length) {
                      setSelectedUnallocatedStudentIds([]);
                    } else {
                      setSelectedUnallocatedStudentIds(filteredUnallocatedStudents.map(s => s.id));
                    }
                  }}
                  disabled={filteredUnallocatedStudents.length === 0}
                  className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {selectedUnallocatedStudentIds.length > 0 && selectedUnallocatedStudentIds.length === filteredUnallocatedStudents.length ? (
                    <CheckSquare size={14} className="text-amber-600" />
                  ) : (
                    <Square size={14} className="text-slate-400" />
                  )}
                  <span>
                    {selectedUnallocatedStudentIds.length === filteredUnallocatedStudents.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </span>
                </button>

                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-2 border border-slate-200">
                  <strong className="text-amber-700">{selectedUnallocatedStudentIds.length}</strong> de {unallocatedStudents.length} selecionado(s)
                </span>
              </div>
            </div>

            {/* List of Unallocated Students */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[250px] bg-slate-100/50">
              {filteredUnallocatedStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 bg-white border border-dashed border-slate-300 p-8">
                  <UserCheck size={36} className="text-emerald-500" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {unallocatedStudents.length === 0 ? 'Nenhum aluno sem turma no momento!' : 'Nenhum aluno corresponde à busca'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {unallocatedStudents.length === 0 
                      ? 'Todos os alunos cadastrados e ativos já estão vinculados a turmas ativas.' 
                      : 'Tente refinar ou limpar o termo digitado na barra de busca.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredUnallocatedStudents.map((s, idx) => {
                    const isSelected = selectedUnallocatedStudentIds.includes(s.id);
                    return (
                      <div
                        key={`unalloc-st-${s.id || idx}`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedUnallocatedStudentIds(selectedUnallocatedStudentIds.filter(id => id !== s.id));
                          } else {
                            setSelectedUnallocatedStudentIds([...selectedUnallocatedStudentIds, s.id]);
                          }
                        }}
                        className={cn(
                          "p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all cursor-pointer select-none",
                          isSelected
                            ? "bg-amber-50/90 border-amber-400 ring-1 ring-amber-400"
                            : "bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/30"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Handled by parent container click
                            className="w-4 h-4 text-amber-600 rounded-none focus:ring-0 cursor-pointer shrink-0"
                          />
                          <div className="w-9 h-9 bg-slate-800 text-white font-black text-xs flex items-center justify-center shrink-0 uppercase border border-slate-700">
                            {s.name ? s.name.substring(0, 2) : 'AL'}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-tight truncate flex items-center gap-2">
                              <span>{s.name || 'SEM NOME'}</span>
                              <span className="text-[9px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.2 border border-amber-300">
                                SEM TURMA
                              </span>
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500 font-medium">
                              {s.registration_number && (
                                <span>Matrícula: <strong className="text-slate-700">{s.registration_number}</strong></span>
                              )}
                              {s.cpf && (
                                <span>CPF: <strong className="text-slate-700">{s.cpf}</strong></span>
                              )}
                              {s.birth_date && (
                                <span>Nasc: {formatDateForDisplay(s.birth_date)}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowUnallocatedModal(false);
                              navigate('/students', { state: { studentId: s.id } });
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer border border-slate-200"
                            title="Ver ficha completa do aluno"
                          >
                            <span>Ficha</span>
                            <ArrowRight size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowUnallocatedModal(false);
                  navigate('/students');
                }}
                className="text-xs font-bold text-amber-300 hover:text-white uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Ir para a Página de Alunos</span>
                <ArrowRight size={14} />
              </button>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowUnallocatedModal(false)}
                  disabled={isAllocatingStudents}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleBatchAllocateStudents}
                  disabled={!targetClassForUnallocated || selectedUnallocatedStudentIds.length === 0 || isAllocatingStudents}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {isAllocatingStudents ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Matriculando Alunos...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={15} />
                      <span>
                        Matricular {selectedUnallocatedStudentIds.length} Aluno(s)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Printable Class Record */}
      {selectedClass && (
        <div id="printable-class-record" className="hidden print:flex flex-col justify-between text-slate-950 bg-white overflow-hidden font-sans leading-tight relative w-full h-[270mm] max-h-[270mm] min-h-[270mm] mx-auto p-0 box-border">
          {/* TOP SECTION: Header + Control Boxes + Class Data + Curriculum */}
          <div className="flex-1 flex flex-col justify-start">
            {/* Institutional Header */}
            <div className="flex items-center gap-4 mb-2.5 pb-2.5 border-b-2 border-slate-900">
              <div className="flex-shrink-0 w-20 h-20 flex items-center justify-center">
                {inst?.logo_url ? (
                  <img
                    src={inst.logo_url}
                    className="w-full h-full object-contain max-h-20 max-w-20"
                    referrerPolicy="no-referrer"
                    alt="Logo da Instituição"
                  />
                ) : (
                  <div className="w-full h-full border border-slate-300 border-dashed flex flex-col items-center justify-center text-[7pt] text-slate-400 font-bold uppercase">
                    <span>SEM</span>
                    <span>LOGO</span>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <p className="text-[9pt] font-extrabold tracking-[0.2em] text-slate-600 uppercase leading-none mb-1">
                  {inst?.city_uf ? `DIOCESE DE ${inst.city_uf.split('/')[0].toUpperCase()}` : 'DIOCESE DE GUARULHOS'}
                </p>
                <h1 className="text-[15.5pt] font-black uppercase tracking-tight text-slate-950 leading-tight">
                  {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                </h1>
                <p className="text-[9.5pt] font-bold text-slate-600 tracking-wider uppercase mt-0.5">
                  {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                </p>
              </div>
            </div>

            <div className="text-center mb-2.5">
              <h2 className="text-[12pt] font-black uppercase tracking-[0.28em] text-slate-900 border-b-2 border-slate-900 pb-0.5 px-6 inline-block">
                Ficha da Turma
              </h2>
            </div>

            {/* TOP CONTROL BOXES */}
            <div className="grid grid-cols-12 gap-3 mb-2.5">
              <div className="col-span-3 border border-slate-800 p-2 flex flex-col h-[3cm] justify-between bg-white">
                <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                  Controle
                </p>
                <div className="flex-1 flex flex-col justify-center items-center">
                  <p className="text-[7pt] font-extrabold uppercase tracking-widest text-slate-400 mb-1 text-center">
                    Código da Turma
                  </p>
                  <div className="border border-slate-400 bg-slate-50/70 h-8 w-28 flex items-center justify-center font-black text-[11.5pt] text-slate-950">
                    {selectedClass.code}
                  </div>
                </div>
              </div>

              <div className="col-span-6 border border-slate-800 p-2 h-[3cm] flex flex-col justify-between bg-white">
                <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                  Informações Acadêmicas:
                </p>
                <div className="grid grid-cols-3 gap-2 text-center my-auto py-1">
                  <div className="border border-slate-200 p-1 bg-slate-50/50">
                    <p className="text-[6.5pt] font-extrabold uppercase text-slate-500">Ano Letivo</p>
                    <p className="text-[9pt] font-black uppercase text-slate-950">{selectedClass.year || selectedClass.start_year || '---'}</p>
                  </div>
                  <div className="border border-slate-200 p-1 bg-slate-50/50">
                    <p className="text-[6.5pt] font-extrabold uppercase text-slate-500">Semestre</p>
                    <p className="text-[9pt] font-black uppercase text-slate-950">{selectedClass.semester || 'Anual'}</p>
                  </div>
                  <div className="border border-slate-200 p-1 bg-slate-50/50">
                    <p className="text-[6.5pt] font-extrabold uppercase text-slate-500">Turno</p>
                    <p className="text-[9pt] font-black uppercase text-slate-950">{selectedClass.period || '---'}</p>
                  </div>
                </div>
                <div className="text-[8pt] font-semibold flex items-center justify-between border-t border-slate-200 pt-1 text-slate-800">
                  <span>Sala: <strong className="uppercase font-bold text-slate-950">{selectedClass.room || 'Principal'}</strong></span>
                  <span>Status: <strong className="uppercase font-bold text-slate-950">{selectedClass.status || 'Ativo'}</strong></span>
                </div>
              </div>

              <div className="col-span-3 border border-slate-800 p-2 flex flex-col justify-between items-center bg-white h-[3cm]">
                <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 w-full text-center">
                  Matriculados
                </p>
                <div className="flex-1 flex flex-col justify-center items-center">
                  <p className="text-[20pt] font-black leading-none text-slate-950">
                    {modalStudents.length > 0 ? modalStudents.length : (selectedClassStudentCount !== null ? selectedClassStudentCount : '0')}
                  </p>
                  <p className="text-[7pt] font-extrabold uppercase tracking-wider text-slate-600 mt-1">Alunos Ativos</p>
                </div>
                <div className="text-[7pt] font-bold uppercase text-slate-500 text-center">Ano {selectedClass.year || ''}</div>
              </div>
            </div>

            {/* DADOS DA TURMA */}
            <div className="space-y-1.5 mb-2 text-[9pt]">
              <div className="flex items-end gap-2">
                <span className="font-bold uppercase min-w-[70px] text-[8.5pt] text-slate-800">Turma:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9.5pt] text-slate-950 px-2 pb-0.5 min-h-[19px]">
                  {selectedClass.name}
                </span>
              </div>

              <div className="flex gap-4">
                <div className="flex-[3] flex items-end gap-2">
                  <span className="font-bold uppercase text-[8.5pt] text-slate-800">Curso Base:</span>
                  <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-0.5 min-h-[19px]">
                    {selectedClass.course || 'Teologia e Ministérios'}
                  </span>
                </div>
                <div className="flex-[2] flex items-end gap-2">
                  <span className="font-bold uppercase text-[8.5pt] text-slate-800">Início em:</span>
                  <span className="flex-1 border-b border-slate-400 font-bold text-[9pt] text-slate-950 px-2 pb-0.5 text-center min-h-[19px]">
                    {selectedClass.start_date ? formatDateForDisplay(selectedClass.start_date) : '---'}
                  </span>
                </div>
              </div>

              <div className="flex items-end gap-2">
                <span className="font-bold uppercase min-w-[70px] text-[8.5pt] text-slate-800">Dias de Aula:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-0.5 min-h-[19px]">
                  {(selectedClass.days_of_week || []).join(', ') || 'Não especificado'}
                </span>
              </div>
            </div>

            {/* MATRIZ CURRICULAR */}
            <div className="my-2 p-2.5 bg-slate-50/50 border border-slate-300 rounded-none space-y-1.5">
              <h4 className="text-[8pt] font-black uppercase text-center border-b border-slate-200 pb-1 tracking-wider text-slate-800">
                Matriz Curricular Vinculada
              </h4>
              {(() => {
                const classSubs = (selectedClass.subject_ids || [])
                  .map(sid => subjects.find(s => s.id === sid))
                  .filter(Boolean) as Subject[];
                const printSem1 = classSubs.filter(s => (s.semester || '').includes('1'));
                const printSem2 = classSubs.filter(s => (s.semester || '').includes('2'));
                const printOther = classSubs.filter(s => !(s.semester || '').includes('1') && !(s.semester || '').includes('2'));

                if (classSubs.length === 0) {
                  return <p className="text-[7.5pt] text-slate-400 italic text-center py-2">Nenhuma disciplina vinculada a esta turma.</p>;
                }

                return (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-3 text-[8pt]">
                      {/* 1º Semestre */}
                      <div className="border border-slate-200 p-2 bg-white">
                        <p className="font-bold uppercase text-blue-900 border-b border-slate-200 pb-1 mb-1 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                          1º Semestre
                        </p>
                        {printSem1.length > 0 ? (
                          <ul className="list-disc list-inside space-y-0.5 font-bold uppercase text-slate-900 text-[7.5pt]">
                            {printSem1.map((s, idx) => (
                              <li key={`psem1-${s.id || idx}-${idx}`}>{s.code ? `[${s.code}] ` : ''}{s.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[7pt] text-slate-400 italic">Nenhuma disciplina vinculada.</p>
                        )}
                      </div>

                      {/* 2º Semestre */}
                      <div className="border border-slate-200 p-2 bg-white">
                        <p className="font-bold uppercase text-emerald-900 border-b border-slate-200 pb-1 mb-1 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                          2º Semestre
                        </p>
                        {printSem2.length > 0 ? (
                          <ul className="list-disc list-inside space-y-0.5 font-bold uppercase text-slate-900 text-[7.5pt]">
                            {printSem2.map((s, idx) => (
                              <li key={`psem2-${s.id || idx}-${idx}`}>{s.code ? `[${s.code}] ` : ''}{s.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[7pt] text-slate-400 italic">Nenhuma disciplina vinculada.</p>
                        )}
                      </div>
                    </div>

                    {printOther.length > 0 && (
                      <div className="border border-slate-200 p-1.5 bg-white text-[7.5pt]">
                        <span className="font-bold uppercase text-slate-700 mr-1.5">Outras Disciplinas:</span>
                        <span className="font-medium uppercase text-slate-900">
                          {printOther.map(s => s.name).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* OBSERVAÇÕES */}
            <div className="mt-1">
              <span className="text-[8pt] font-black uppercase text-slate-800">Observações da Turma:</span>
              <div className="text-[8pt] border border-slate-300 p-2 min-h-[40px] leading-relaxed whitespace-pre-wrap mt-0.5 bg-slate-50/30">
                {(() => {
                  const rawObs = selectedClass.observations || '';
                  const cleaned = rawObs
                    .replace(/\[METADATA:[\s\S]*?\]/gi, '')
                    .replace(/\{[\s\S]*?\}/g, '')
                    .replace(/is_special\s*:\s*(true|false)/gi, '')
                    .replace(/["']?is_special["']?\s*:\s*(true|false)/gi, '')
                    .replace(/is_special/gi, '')
                    .replace(/["'{}\[\]]/g, '')
                    .replace(/,+/g, '')
                    .replace(/\n\s*\n/g, '\n')
                    .trim();
                  return cleaned || 'Sem observações adicionais.';
                })()}
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: PINNED FOOTER */}
          <div className="mt-auto pt-2 shrink-0">
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
              <div className="text-right max-w-[380px] leading-tight text-slate-900 font-bold text-[7pt] space-y-0.5">
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
