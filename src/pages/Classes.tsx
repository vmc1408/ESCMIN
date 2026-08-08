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
  Eye
} from 'lucide-react';
import { motion } from 'motion/react';
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
  status: 'Ativo' | 'Inativo' | 'Encerrada';
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
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [inst, setInst] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Encerrada' | 'Todos'>('Todos');
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
  const [selectedAcademicYearFilter, setSelectedAcademicYearFilter] = useState<string>('2026');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Helper to extract exact academic base year for a class (Ano Letivo field)
  const getClassAcademicYear = React.useCallback((c: any): string => {
    if (c.unallocated) return 'S/T';

    // 1. Primary source: start_year field (Campo 2 Ano Letivo in class form)
    if (c.start_year && String(c.start_year).trim().length === 4) {
      return String(c.start_year).trim();
    }

    // 2. Secondary source: observations metadata
    if (c.observations) {
      const match = c.observations.match(/\[METADATA:(\{[\s\S]*\})\]/);
      if (match && match[1]) {
        try {
          const meta = JSON.parse(match[1]);
          if (meta.start_year && String(meta.start_year).trim().length === 4) {
            return String(meta.start_year).trim();
          }
        } catch (e) {}
      }
    }

    // 3. Fallback: start_date or created_at
    if (c.start_date && String(c.start_date).length >= 4) {
      const yr = String(c.start_date).substring(0, 4);
      if (!isNaN(Number(yr)) && Number(yr) >= 1999 && Number(yr) <= 2100) return yr;
    }
    if (c.created_at && String(c.created_at).length >= 4) {
      const yr = String(c.created_at).substring(0, 4);
      if (!isNaN(Number(yr)) && Number(yr) >= 1999 && Number(yr) <= 2100) return yr;
    }

    return '2026';
  }, []);

  // Helper to determine if a class matches the selected academic year
  const isClassActiveInAcademicYear = React.useCallback((c: any, selectedYear: string): boolean => {
    if (!selectedYear || selectedYear === 'Todos') return true;
    if (c.unallocated) return false;
    return getClassAcademicYear(c) === selectedYear;
  }, [getClassAcademicYear]);

  const availableAcademicYears = React.useMemo(() => {
    const yrSet = new Set<string>(['2026']);
    classes.forEach(c => {
      if (c.unallocated) return;
      const yr = getClassAcademicYear(c);
      if (yr && yr !== 'S/T' && !isNaN(Number(yr))) {
        yrSet.add(yr);
      }
    });
    return Array.from(yrSet).sort((a, b) => Number(b) - Number(a));
  }, [classes, getClassAcademicYear]);

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
  const [sourceStudentsList, setSourceStudentsList] = useState<Array<{ id: string, name: string, registration_number?: string }>>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
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

  const PREDEFINED_COURSES = React.useMemo(() => [
    'Teologia',
    'Latim',
    'Doutrina Social da Igreja',
    'História dos Santos Negros',
    'Outros'
  ], []);

  const isNameLocked = React.useMemo(() => {
    const c = (formData.course || '').trim().toLowerCase();
    return !c.includes('outros');
  }, [formData.course]);

  const generateAutoClassName = React.useCallback((course: string, startYear: string | number, academicYear: string) => {
    if (!course || !startYear) return '';

    const yrStr = String(startYear).trim();
    if (!yrStr || yrStr.length < 2) return '';
    const yr2Digits = yrStr.slice(-2);

    const STOP_WORDS = new Set([
      'de', 'da', 'do', 'dos', 'das', 'na', 'no', 'nas', 'nos',
      'para', 'com', 'em', 'e', 'a', 'o', 'os', 'as', 'por'
    ]);

    const cleanCourse = course.trim();
    const lower = cleanCourse.toLowerCase();

    let prefix = '';

    if (lower.includes('doutrina') && lower.includes('social')) {
      prefix = 'DSI';
    } else if (lower.includes('santos') && lower.includes('negros')) {
      prefix = 'HSN';
    } else if (lower.includes('teologia')) {
      prefix = 'TEO';
    } else if (lower.includes('latim')) {
      prefix = 'LAT';
    } else {
      const words = cleanCourse
        .split(/\s+/)
        .filter(w => {
          const norm = w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return !STOP_WORDS.has(norm);
        });

      if (words.length >= 3) {
        prefix = words.map(w => w[0]).join('').toUpperCase();
      } else if (words.length === 2 && (words[0].length <= 3 || words[1].length <= 3)) {
        prefix = words.map(w => w[0]).join('').toUpperCase();
      } else if (words.length > 0) {
        const cleanWord = words[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        prefix = cleanWord.slice(0, 3).toUpperCase();
      } else {
        prefix = cleanCourse.slice(0, 3).toUpperCase();
      }
    }

    const cleanAcademicYear = academicYear ? academicYear.trim() : '';
    return cleanAcademicYear ? `${prefix}-${yr2Digits} ${cleanAcademicYear}`.toUpperCase() : `${prefix}-${yr2Digits}`.toUpperCase();
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

    setFormData(prev => ({
      ...prev,
      course: newCourse,
      start_year: String(newStartYear),
      year: newAcademicYear,
      name: autoGeneratedName,
      subject_id_sem1_h1: s1h1,
      subject_id_sem1_h2: s1h2,
      subject_id_sem2_h1: s2h1,
      subject_id_sem2_h2: s2h2,
      subject_id_sem1: s1h1 || s1h2 || '',
      subject_id_sem2: s2h1 || s2h2 || '',
      subject_ids: cleanSubjectIds
    }));
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

  useEffect(() => {
    if (!selectedClass) {
      setSelectedClassStudentCount(null);
      return;
    }

    let isMounted = true;
    Promise.all([
      fetchAll('enrollments').catch(() => []),
      fetchAll('students').catch(() => [])
    ]).then(([enrollments, studentsData]) => {
      if (!isMounted) return;
      const sourceEnr = (enrollments || []).filter((e: any) => e.class_id === selectedClass.id && (e.status || 'Ativo') === 'Ativo');
      const directStudents = (studentsData || []).filter((s: any) => s.class_id === selectedClass.id && (s.status || 'Ativo') === 'Ativo');

      const studentSet = new Set<string>();
      directStudents.forEach((s: any) => studentSet.add(s.id));
      sourceEnr.forEach((e: any) => { if (e.student_id) studentSet.add(e.student_id); });

      setSelectedClassStudentCount(studentSet.size);
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
    
    doc.setFontSize(14);
    doc.text(`Lista de Alunos Matriculados`, 14, 15);
    doc.setFontSize(11);
    doc.text(`Turma: ${className} (${classCode})`, 14, 22);
    doc.setFontSize(9);
    doc.text(`Total de Alunos: ${modalStudents.length} | Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    const tableRows = modalStudents.map((s, idx) => [
      idx + 1,
      (s.name || s.full_name || '---').toUpperCase(),
      s.registration_number || s.code || '---',
      s.cpf || '---',
      s.status || 'Ativo'
    ]);

    autoTable(doc, {
      startY: 32,
      head: [['#', 'Nome do Aluno', 'Matrícula', 'CPF', 'Status']],
      body: tableRows,
      headStyles: { fillColor: [0, 23, 75], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 }
    });

    doc.save(`Alunos_Turma_${classCode}.pdf`);
  }, [selectedClass, formData, modalStudents]);

  const handleSelectClass = React.useCallback((cls: Class) => {
    setSelectedClass(cls);
    const startYearFromDate = cls.start_date ? cls.start_date.substring(0, 4) : String(new Date().getFullYear());
    const detectedCourse = cls.course || (PREDEFINED_COURSES.find(c => (cls.name || '').toUpperCase().includes(c.toUpperCase())) || 'Teologia');
    
    setFormData({
      ...cls,
      course: detectedCourse,
      start_year: (cls as any).start_year || startYearFromDate,
      start_date: cls.start_date || '',
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
      if (formData.year) metadata.year = formData.year;
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

  const computePromotedClassName = (sourceName: string, targetYear: string) => {
    if (!sourceName) return '';
    const baseName = sourceName
      .replace(/\s*\([\dº\s]*ano\)/i, '')
      .replace(/\s*\(curso\s*extra\)/i, '')
      .trim();

    return targetYear ? `${baseName} (${targetYear.toUpperCase()})` : baseName;
  };

  const setupImportModalDefaults = async (sourceClass: Class, customCode?: string) => {
    let nextYr = '2º Ano';
    if (sourceClass.year === '1º Ano') nextYr = '2º Ano';
    else if (sourceClass.year === '2º Ano') nextYr = '3º Ano';
    else if (sourceClass.year === '3º Ano') nextYr = '4º Ano';
    else if (sourceClass.year === '4º Ano') nextYr = 'Curso Extra';
    else nextYr = sourceClass.year || '2º Ano';

    setImportTargetYear(nextYr);

    // Auto-generate promoted class name: base name + new year
    const generatedName = computePromotedClassName(sourceClass.name, nextYr);
    setImportNewName(generatedName);

    if (customCode) setImportNewCode(customCode);

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

      // Automatically link all subjects belonging to target year for both 1st and 2nd semesters
      const targetYearSubs = subjects.filter(s => s.year === importTargetYear);
      const sem1Subs = targetYearSubs.filter(s => (s.semester || '').includes('1'));
      const sem2Subs = targetYearSubs.filter(s => (s.semester || '').includes('2'));

      const s1h1 = sem1Subs[0]?.id || '';
      const s1h2 = sem1Subs[1]?.id || '';
      const s2h1 = sem2Subs[0]?.id || '';
      const s2h2 = sem2Subs[1]?.id || '';

      const autoSubjectIds = [s1h1, s1h2, s2h1, s2h2].filter(Boolean);

      const newClassData: Partial<Class> = {
        name: importNewName,
        code: importNewCode || String(Date.now()).slice(-3),
        year: importTargetYear,
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
        start_date: new Date().toISOString().split('T')[0],
        observations: `[METADATA:${JSON.stringify({
          year: importTargetYear,
          subject_id_sem1_h1: s1h1,
          subject_id_sem1_h2: s1h2,
          subject_id_sem2_h1: s2h1,
          subject_id_sem2_h2: s2h2,
          subject_id_sem1: s1h1 || s1h2,
          subject_id_sem2: s2h1 || s2h2,
          subject_ids: autoSubjectIds,
          imported_from: sourceClass.id
        })}] Turma promovida/importada de ${sourceClass.name} (${sourceClass.year || 'Ano Anterior'})`
      };

      const newClassId = await saveData('classes', undefined, newClassData);

      let migratedStudentsCount = 0;

      const studentIdsToMigrate = importMigrateStudents 
        ? sourceStudentsList.map(s => s.id)
        : selectedStudentIds;

      if (studentIdsToMigrate.length > 0) {
        migratedStudentsCount = studentIdsToMigrate.length;

        for (const studentId of studentIdsToMigrate) {
          // Add new enrollment record linking student to the new class
          await saveData('enrollments', undefined, {
            student_id: studentId,
            class_id: newClassId,
            status: 'Ativo',
            enrollment_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });

          // Update current class_id for student while PRESERVING registration_number and personal data intact
          await saveData('students', studentId, { class_id: newClassId });
        }
      }

      // Mark source class as Encerrada (closed) to keep data accessible until course end
      if (importDeactivateSource) {
        await saveData('classes', sourceClass.id, { ...sourceClass, status: 'Encerrada' });
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

  const hasActiveFilters = searchTerm !== '' || selectedYearFilter !== 'Todos' || selectedSemesterFilter !== 'Todos' || statusFilter !== 'Todos' || selectedPeriodFilter !== 'Todos' || selectedAcademicYearFilter !== 'Todos';

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedYearFilter('Todos');
    setSelectedSemesterFilter('Todos');
    setStatusFilter('Todos');
    setSelectedPeriodFilter('Todos');
    setSelectedAcademicYearFilter('Todos');
  };

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
            
            <div className="space-y-2.5">
              {/* Search Bar */}
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={15} />
                <input 
                  type="text"
                  placeholder="Buscar por nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 text-xs font-bold focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button 
                    type="button" 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                    title="Limpar busca"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Academic Year Filter Widget with Steppers */}
              <div className="space-y-1.5 bg-slate-50 p-2 border border-slate-200/80 rounded">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Calendar size={13} className="text-blue-800" /> Turma(s):
                  </label>
                </div>

                <div className="flex items-center bg-white p-0.5 border border-slate-300 rounded gap-1 shadow-2xs">
                  {(() => {
                    const currentYrIdx = availableAcademicYears.indexOf(selectedAcademicYearFilter);
                    const isAtOldest = selectedAcademicYearFilter !== 'Todos' && (currentYrIdx === availableAcademicYears.length - 1 || currentYrIdx === -1);
                    const isAtNewest = selectedAcademicYearFilter !== 'Todos' && currentYrIdx === 0;

                    return (
                      <>
                        <button
                          type="button"
                          disabled={isAtOldest}
                          onClick={() => {
                            if (selectedAcademicYearFilter === 'Todos') {
                              setSelectedAcademicYearFilter('2026');
                            } else {
                              const idx = availableAcademicYears.indexOf(selectedAcademicYearFilter);
                              if (idx !== -1 && idx < availableAcademicYears.length - 1) {
                                setSelectedAcademicYearFilter(availableAcademicYears[idx + 1]);
                              }
                            }
                          }}
                          className={cn(
                            "p-1 rounded transition-all cursor-pointer shrink-0 select-none",
                            isAtOldest
                              ? "text-slate-300 cursor-not-allowed opacity-60"
                              : "text-slate-600 hover:text-blue-900 hover:bg-slate-100"
                          )}
                          title={
                            isAtOldest
                              ? `Não há turmas cadastradas em anos anteriores a ${selectedAcademicYearFilter}`
                              : "Voltar para o Ano Anterior com Turmas"
                          }
                        >
                          <ChevronLeft size={16} />
                        </button>

                        <select
                          id="classes-academic-year-select"
                          value={selectedAcademicYearFilter}
                          onChange={(e) => setSelectedAcademicYearFilter(e.target.value)}
                          className="flex-1 bg-transparent text-xs font-black text-blue-950 outline-none cursor-pointer hover:text-blue-700 transition-all uppercase tracking-wider py-1"
                        >
                          {availableAcademicYears.map(yr => (
                            <option key={yr} value={yr}>
                              ANO {yr}
                            </option>
                          ))}
                          <option value="Todos">TODOS OS ANOS</option>
                        </select>

                        <button
                          type="button"
                          disabled={isAtNewest}
                          onClick={() => {
                            if (selectedAcademicYearFilter === 'Todos') {
                              setSelectedAcademicYearFilter('2026');
                            } else {
                              const idx = availableAcademicYears.indexOf(selectedAcademicYearFilter);
                              if (idx > 0) {
                                setSelectedAcademicYearFilter(availableAcademicYears[idx - 1]);
                              }
                            }
                          }}
                          className={cn(
                            "p-1 rounded transition-all cursor-pointer shrink-0 select-none",
                            isAtNewest
                              ? "text-slate-300 cursor-not-allowed opacity-60"
                              : "text-slate-600 hover:text-blue-900 hover:bg-slate-100"
                          )}
                          title={
                            isAtNewest
                              ? `Não há turmas cadastradas em anos futuros a ${selectedAcademicYearFilter}`
                              : "Avançar para o Próximo Ano com Turmas"
                          }
                        >
                          <ChevronRight size={16} />
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Dynamic Select Menu for Módulo/Ano and Semestre */}
              <div className="grid grid-cols-1 gap-2">
                {/* Ano Letivo / Módulo Select */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      Ano Letivo / Módulo:
                    </label>
                    {selectedYearFilter !== 'Todos' && (
                      <span className="text-[8px] font-black text-blue-700 bg-blue-50 px-1 border border-blue-100 uppercase">Filtro Ativo</span>
                    )}
                  </div>
                  <select
                    value={selectedYearFilter}
                    onChange={(e) => setSelectedYearFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all cursor-pointer"
                  >
                    <option value="Todos">Todos os Anos / Módulos ({classes.length} turmas)</option>
                    {['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Curso Extra'].map((yr) => {
                      const count = classes.filter(c => (c.year || '1º Ano') === yr).length;
                      return (
                        <option key={yr} value={yr}>
                          {yr} ({count} {count === 1 ? 'turma' : 'turmas'})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Semestre & Status Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Semestre:</label>
                    <select
                      value={selectedSemesterFilter}
                      onChange={(e) => setSelectedSemesterFilter(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all cursor-pointer"
                    >
                      <option value="Todos">Todos os Semestres</option>
                      <option value="1º Semestre">1º Semestre</option>
                      <option value="2º Semestre">2º Semestre</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Status:</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800 focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all cursor-pointer"
                    >
                      <option value="Todos">Todos os Status</option>
                      <option value="Ativo">Apenas Ativos</option>
                      <option value="Encerrada">Turmas Encerradas</option>
                      <option value="Inativo">Inativos</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Dynamic Expandable Advanced Filter Options */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="text-[9.5px] font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 flex items-center gap-1.5 py-0.5 cursor-pointer"
                >
                  <SlidersHorizontal size={12} className="text-blue-700" />
                  <span>{showAdvancedFilters ? 'Ocultar Filtros Extras' : 'Filtros Extras & Ordenação'}</span>
                  <ChevronDown size={12} className={cn("transition-transform duration-200", showAdvancedFilters && "rotate-180")} />
                </button>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-[9px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={10} />
                    <span>Limpar</span>
                  </button>
                )}
              </div>

              {/* Advanced Collapsible Section (Hidden before selection) */}
              {showAdvancedFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-2.5 bg-slate-100/90 border border-slate-200 space-y-2"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider">Turno / Período:</label>
                      <select
                        value={selectedPeriodFilter}
                        onChange={(e) => setSelectedPeriodFilter(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 text-[10px] font-bold text-slate-800 focus:border-slate-400 outline-none cursor-pointer"
                      >
                        <option value="Todos">Todos os Turnos</option>
                        <option value="Manhã">Manhã</option>
                        <option value="Tarde">Tarde</option>
                        <option value="Noite">Noite</option>
                        <option value="Integral">Integral</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider">Ordenar por:</label>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 text-[10px] font-bold text-slate-800 focus:border-slate-400 outline-none cursor-pointer"
                      >
                        <option value="name_year">Nome e Ano (Recente)</option>
                        <option value="name">Nome (A-Z)</option>
                        <option value="code">Código</option>
                        <option value="year">Ano Letivo</option>
                        <option value="period">Período</option>
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Active Filter Badges / Chips */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
                  {statusFilter !== 'Todos' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-200 text-[9px] font-extrabold uppercase">
                      Status: {statusFilter}
                      <button type="button" onClick={() => setStatusFilter('Todos')} className="hover:text-rose-600 cursor-pointer">
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
                      formData.status === 'Inativo' 
                        ? "bg-slate-50 text-slate-500 border-slate-200" 
                        : formData.status === 'Encerrada'
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}>
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full", 
                        formData.status === 'Inativo' 
                          ? "bg-slate-400" 
                          : formData.status === 'Encerrada'
                            ? "bg-amber-500"
                            : "bg-emerald-500 animate-pulse"
                      )} />
                      {formData.status || 'Ativo'}
                    </div>
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
                        type="button"
                        onClick={() => handleOpenStudentsModal()}
                        className="h-10 px-4 bg-blue-900 hover:bg-blue-950 text-white rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider cursor-pointer"
                        title="Ver lista de alunos matriculados nesta turma"
                      >
                        <Users size={15} />
                        <span>Alunos Matriculados ({selectedClassStudentCount ?? 0})</span>
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
                          {/* Code / ID (Auto) */}
                          <div className="w-full sm:w-[90px] space-y-1.5 shrink-0">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                                CÓD.
                              </label>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                AUTO
                              </span>
                            </div>
                            <input 
                              type="text"
                              readOnly
                              disabled
                              value={formData.code || ''}
                              placeholder="001"
                              className="w-full px-3 py-2.5 bg-slate-100/90 border border-slate-300 text-xs font-mono font-black text-slate-600 text-center cursor-not-allowed outline-none uppercase"
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
                          <div className="w-full sm:w-[150px] space-y-1.5 shrink-0 relative">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-5 h-5 bg-blue-900 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                                Ano Letivo <span className="text-rose-600 font-black">*</span>
                              </label>
                            </div>
                            <input
                              type="text"
                              disabled={!isEditing}
                              maxLength={4}
                              placeholder="EX: 2026"
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
                                    alert('Ano letivo inválido! O ano deve estar entre 1999 e 2100.');
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
                          <div className="w-full sm:w-[180px] space-y-1.5 shrink-0">
                            <div className="flex items-center justify-between ml-0.5">
                              <label className="text-[11px] font-extrabold text-blue-950 uppercase tracking-widest flex items-center gap-1.5">
                                <Clock size={13} className="text-blue-900 shrink-0" />
                                Turno de Aula
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
                              <option value="">-- SELECIONE TURNO --</option>
                              <option value="Noite">NOITE</option>
                              <option value="Manhã">MANHÃ</option>
                              <option value="Tarde">TARDE</option>
                              <option value="Sábado">SÁBADO</option>
                              <option value="Integral">INTEGRAL</option>
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
                                {isNameLocked ? (
                                  <Lock size={13} className="text-slate-500" />
                                ) : (
                                  <Unlock size={13} className="text-emerald-600" />
                                )}
                                Nome / Identificador da Turma
                              </label>
                              {isNameLocked ? (
                                <span className="text-[9px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 uppercase tracking-wider border border-slate-300 flex items-center gap-1">
                                  <Lock size={10} /> BLOQUEADO
                                </span>
                              ) : (
                                <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 uppercase tracking-wider border border-emerald-300 flex items-center gap-1">
                                  <Unlock size={10} /> LIBERADO
                                </span>
                              )}
                            </div>
                            <input 
                              type="text"
                              disabled={!isEditing || isNameLocked}
                              placeholder="EX: TEO-27 1º ANO, DSI-27 1º ANO..."
                              value={formData.name || ''}
                              onChange={(e) => setFormData({...formData, name: e.target.value})}
                              onKeyDown={handleKeyDown}
                              className={cn(
                                "w-full px-3.5 py-2.5 border text-xs font-black outline-none transition-all uppercase placeholder:text-slate-300 h-[42px]",
                                isNameLocked
                                  ? "bg-slate-100/90 text-slate-600 border-slate-300 cursor-not-allowed"
                                  : "bg-white text-blue-950 border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600"
                              )}
                              tabIndex={1}
                            />
                            <p className="text-[9px] font-medium text-slate-500 italic ml-0.5 leading-tight">
                              {isNameLocked 
                                ? "Gerado automaticamente pelo Curso e Ano. Selecione 'Outros' para personalizar."
                                : "Digite o nome personalizado para esta turma."}
                            </p>
                          </div>

                          {/* Field 2: Sala / Local das Aulas */}
                          <div className="flex-[1.5] min-w-[180px] space-y-1.5">
                            <div className="flex items-center justify-between ml-0.5 h-[17px]">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Sala / Local das Aulas</label>
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

                          {/* Field 3: Alunos Ativos */}
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
                                {getSemOptions(1, sem1H1SubjectId).map(subject => (
                                  <option 
                                    key={subject.id} 
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
                                {getSemOptions(1, sem1H2SubjectId).map(subject => (
                                  <option 
                                    key={subject.id} 
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
                                {getSemOptions(2, sem2H1SubjectId).map(subject => (
                                  <option 
                                    key={subject.id} 
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
                                {getSemOptions(2, sem2H2SubjectId).map(subject => (
                                  <option 
                                    key={subject.id} 
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200">
                <div className="flex items-center gap-2.5">
                  <School className="text-slate-700" size={18} />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Catálogo de Turmas
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-extrabold text-[10px] border border-slate-200">
                    {filteredClasses.length} {filteredClasses.length === 1 ? 'turma encontrada' : 'turmas encontradas'}
                  </span>
                </div>

                {hasActiveFilters && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      Filtros definidos no menu
                    </span>
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[9.5px] font-extrabold uppercase tracking-wider border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw size={11} />
                      <span>Limpar Filtros</span>
                    </button>
                  </div>
                )}
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
                    const s1h1 = subjects.find(s => s.id === (cls as any).subject_id_sem1_h1);
                    const s1h2 = subjects.find(s => s.id === (cls as any).subject_id_sem1_h2);
                    const s2h1 = subjects.find(s => s.id === (cls as any).subject_id_sem2_h1);
                    const s2h2 = subjects.find(s => s.id === (cls as any).subject_id_sem2_h2);

                    let sem1Subs = [s1h1, s1h2].filter(Boolean) as Subject[];
                    let sem2Subs = [s2h1, s2h2].filter(Boolean) as Subject[];

                    if (sem1Subs.length === 0 || sem2Subs.length === 0) {
                      const clsSubs = (cls.subject_ids || []).map(sid => subjects.find(s => s.id === sid)).filter(Boolean) as Subject[];
                      if (sem1Subs.length === 0) {
                        const matched = clsSubs.filter(s => (s?.semester || '').includes('1'));
                        if (matched.length > 0) sem1Subs = matched;
                        else if (cls.year) sem1Subs = subjects.filter(s => s.year === cls.year && (s.semester || '').includes('1'));
                      }
                      if (sem2Subs.length === 0) {
                        const matched = clsSubs.filter(s => (s?.semester || '').includes('2'));
                        if (matched.length > 0) sem2Subs = matched;
                        else if (cls.year) sem2Subs = subjects.filter(s => s.year === cls.year && (s.semester || '').includes('2'));
                      }
                    }

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
                              (cls.status || 'Ativo') === 'Ativo' 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                : cls.status === 'Encerrada'
                                  ? "bg-amber-50 text-amber-800 border-amber-200 font-extrabold"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
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

                        {/* Linked Subjects Summary (All subjects per semester) */}
                        <div className="pt-3 border-t border-slate-100 space-y-2 text-[10px]">
                          <div className="flex items-start gap-1.5 text-blue-900 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0 mt-1"></span>
                            <span className="text-slate-400 uppercase text-[9px] shrink-0 font-semibold">1º Sem:</span>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              {sem1Subs.length > 0 ? (
                                sem1Subs.map((s, idx) => (
                                  <span key={s.id || idx} className="uppercase leading-tight text-[10px]">
                                    {s.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 uppercase">Nenhuma</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-start gap-1.5 text-emerald-900 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0 mt-1"></span>
                            <span className="text-slate-400 uppercase text-[9px] shrink-0 font-semibold">2º Sem:</span>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              {sem2Subs.length > 0 ? (
                                sem2Subs.map((s, idx) => (
                                  <span key={s.id || idx} className="uppercase leading-tight text-[10px]">
                                    {s.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 uppercase">Nenhuma</span>
                              )}
                            </div>
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
          <div className={cn(
            "bg-white rounded-none shadow-2xl p-6 sm:p-8 w-full space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto border border-slate-300 transition-all duration-300",
            !importMigrateStudents ? "max-w-5xl" : "max-w-3xl"
          )}>
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

            {/* Grid Layout: 2 Columns if list is active, 1 column if all migrated automatically */}
            <div className={cn("grid gap-6 text-xs items-start", !importMigrateStudents ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1")}>
              {/* Left Column: Form Settings */}
              <div className={cn("space-y-5", !importMigrateStudents ? "lg:col-span-6" : "")}>
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

                  {/* 2. Destination Class Configuration */}
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 sm:col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Código
                        </label>
                        <span className="text-[7.5px] font-extrabold text-blue-700 bg-blue-50 px-1 py-0.2 uppercase border border-blue-100">
                          Auto
                        </span>
                      </div>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={importNewCode}
                        placeholder="Ex: 001"
                        className="w-full px-2.5 py-2 bg-slate-100 border border-slate-200 font-mono font-bold text-slate-600 text-xs cursor-not-allowed text-center"
                        title="Código sequencial gerado automaticamente pelo sistema"
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Ano Letivo de Destino *
                      </label>
                      <select
                        value={importTargetYear}
                        onChange={(e) => {
                          const newYr = e.target.value;
                          setImportTargetYear(newYr);
                          const srcCls = classes.find(c => c.id === importSourceClassId);
                          if (srcCls) {
                            setImportNewName(computePromotedClassName(srcCls.name, newYr));
                          }
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

                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Nome da Nova Turma *
                      </label>
                      <input
                        type="text"
                        value={importNewName}
                        onChange={(e) => setImportNewName(e.target.value)}
                        placeholder="Ex: TEOLOGIA 2026 (2º ANO)"
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

                  <label className="flex items-start gap-2.5 cursor-pointer bg-slate-50 p-2.5 border border-slate-200">
                    <input
                      type="checkbox"
                      checked={importDeactivateSource}
                      onChange={(e) => setImportDeactivateSource(e.target.checked)}
                      className="w-4 h-4 text-blue-800 rounded-none focus:ring-0 cursor-pointer mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">
                        Marcar turma de origem como "Turma Encerrada"
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium block pt-0.5">
                        A turma anterior passa ao status "Encerrada", mantendo todos os históricos e dados estáveis e acessíveis até o encerramento do curso.
                      </span>
                    </div>
                  </label>
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
                        .map((student) => {
                          const isSelected = selectedStudentIds.includes(student.id);
                          return (
                            <label
                              key={student.id}
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

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-5 py-2.5 bg-slate-100 text-slate-700 font-bold uppercase text-xs tracking-wider border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer rounded-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || !importSourceClassId || !importNewName}
                className="px-6 py-2.5 bg-blue-800 text-white font-bold uppercase text-xs tracking-wider border border-blue-900 hover:bg-blue-900 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer rounded-none"
              >
                {isImporting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Importando...</span>
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
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={handleExportClassStudentListPDF}
                  disabled={modalStudents.length === 0}
                  className="flex-1 sm:flex-none px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Exportar Lista em PDF"
                >
                  <Printer size={14} />
                  <span>Imprimir PDF</span>
                </button>
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
                          key={s.id || idx}
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
