import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  UserPlus,
  GraduationCap, 
  BookOpen, 
  Book,
  UserCheck, 
  ArrowUpRight, 
  RefreshCw, 
  Activity, 
  Eye, 
  EyeOff,
  X,
  UserCircle,
  Wallet,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Printer,
  Calendar,
  Repeat,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Sparkles,
  CheckCircle2,
  CheckSquare,
  Square,
  Settings2,
  ArrowRight,
  Info,
  Building2,
  Lock,
  DollarSign,
  PieChart as PieChartIcon,
  BarChart3,
  LayoutGrid,
  TrendingDown,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
  Layers
} from 'lucide-react';

const CHART_COLORS = [
  '#2563eb', // Blue 600
  '#059669', // Emerald 600
  '#d97706', // Amber 600
  '#7c3aed', // Violet 600
  '#db2777', // Pink 600
  '#0891b2', // Cyan 600
  '#ea580c', // Orange 600
  '#4f46e5', // Indigo 600
  '#e11d48', // Rose 600
  '#64748b', // Slate 500
];

const MONTH_NAMES_LIST = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

import { fetchCount, fetchAll, fetchById, saveBatch, saveData, fetchQuery } from '../lib/database';
import { supabase, isDbConnected, isSupabaseConfigured, lastLatency, testConnection } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { cn, normalizeClass, normalizeSubject, getClassSubjects, getSubjectClassDetails, formatCurrency } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { HabilitationModal } from '../components/HabilitationModal';
import { Student, Class, Subject, Teacher, Contribution } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../contexts/UnitContext';
import { getUnitColorTheme } from '../lib/unitColors';
import { getItemUnitId, isItemInUnit } from '../lib/unitService';
import { getAllAcademicSchedulePeriods, formatDateBR, resolveAcademicSettingsForUnit, computeAvailableAcademicYears } from '../lib/academicUtils';
import { getTeacherScope } from '../lib/teacherScope';
import { TeacherScopeBanner } from '../components/TeacherScopeBanner';
import { financialConfigService } from '../services/financialConfigService';
import { getStudentContributionPlan } from '../lib/contributionRules';

export function Dashboard() {
  const navigate = useNavigate();
  const { logout, isConnected, connError, profile, canAccess, isTeacher } = useAuth();
  const { 
    selectedUnitId, 
    selectedUnit, 
    setSelectedUnitId,
    isRestricted, 
    restrictedUnitId, 
    getUnitName, 
    filterByActiveUnit,
    activeUnits,
    hasMultipleUnits,
    units
  } = useUnits();

  // Tema de cores exclusivo da unidade ativa
  const unitTheme = useMemo(() => {
    return getUnitColorTheme(selectedUnit || selectedUnitId);
  }, [selectedUnit, selectedUnitId]);

  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'disconnected' | 'checking'>(
    isSupabaseConfigured ? (isDbConnected ? 'connected' : 'checking') : 'disconnected'
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dbInfo, setDbInfo] = useState<{connected: boolean, latency: number | null}>({
    connected: isDbConnected,
    latency: lastLatency
  });
  
  // Initial state from cache if available
  const [stats, setStats] = useState(() => {
    const cached = localStorage.getItem('dashboard-stats-cache');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return {
          students: { total: 0, active: 0, inactive: 0, archived: 0 },
          teachers: { total: 0, active: 0, inactive: 0, archived: 0 },
          classes: { total: 0, active: 0, inactive: 0, archived: 0 },
          subjects: { total: 0, active: 0, inactive: 0, archived: 0 }
        };
      }
    }
    return {
      students: { total: 0, active: 0, inactive: 0, archived: 0 },
      teachers: { total: 0, active: 0, inactive: 0, archived: 0 },
      classes: { total: 0, active: 0, inactive: 0, archived: 0 },
      subjects: { total: 0, active: 0, inactive: 0, archived: 0 }
    };
  });

  const [lastUpdated, setLastUpdated] = useState<Date>(() => {
    const cached = localStorage.getItem('dashboard-stats-last-updated');
    return cached ? new Date(cached) : new Date();
  });

  const [syncError, setSyncError] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [selectedContributionMonth, setSelectedContributionMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedContributionYear, setSelectedContributionYear] = useState<number>(() => new Date().getFullYear());
  const [academicViewMode, setAcademicViewMode] = useState<'charts' | 'cards'>('charts');

  // Estados para o Gráfico de Previsto vs Realizado (Mensal, Semestral e Anual)
  const [delinquencyYear, setDelinquencyYear] = useState<number>(() => new Date().getFullYear());
  const [financialChartMode, setFinancialChartMode] = useState<'monthly' | 'semester' | 'annual'>('monthly');
  const [delinquencyClassFilter, setDelinquencyClassFilter] = useState<string>('all');
  const [financialSettings, setFinancialSettings] = useState<any>(null);

  // Controles específicos de cada visão:
  const [selectedComparisonMonth, setSelectedComparisonMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [monthlyChartScope, setMonthlyChartScope] = useState<'trio' | 'all'>('trio');
  const [monthlyDisplayType, setMonthlyDisplayType] = useState<'regular' | 'accumulated'>('regular');

  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(() => (new Date().getMonth() + 1 <= 6 ? 1 : 2));
  const [semesterDisplayType, setSemesterDisplayType] = useState<'regular' | 'accumulated'>('regular');

  const [annualDisplayType, setAnnualDisplayType] = useState<'regular' | 'accumulated'>('regular');

  useEffect(() => {
    financialConfigService.getSettings().then(setFinancialSettings).catch(() => {});
  }, []);

  const teacherScope = useMemo(() => {
    if (!isTeacher) return null;
    return getTeacherScope(profile, teachers, subjects, classes, undefined, selectedUnitId, units);
  }, [isTeacher, profile, teachers, subjects, classes, selectedUnitId, units]);

  // Itens escopados pela unidade ativa (ou unidade restrita do usuário)
  const scopedStudents = useMemo(() => {
    return filterByActiveUnit(students, s => getItemUnitId(s));
  }, [students, filterByActiveUnit]);

  const scopedClasses = useMemo(() => {
    return filterByActiveUnit(classes, c => getItemUnitId(c));
  }, [classes, filterByActiveUnit]);

  const scopedTeachers = useMemo(() => {
    return filterByActiveUnit(teachers, t => getItemUnitId(t));
  }, [teachers, filterByActiveUnit]);

  const scopedSubjects = useMemo(() => {
    return filterByActiveUnit(subjects, s => getItemUnitId(s));
  }, [subjects, filterByActiveUnit]);

  // Estatísticas calculadas dinamicamente de acordo com o escopo de unidade ativo
  const displayStats = useMemo(() => {
    const isStudentActive = (s: any) => s.status === 'Ativo' || !s.status || String(s.status).toLowerCase() === 'ativo';
    const isClassActive = (c: any) => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';
    const isTeacherActive = (t: any) => !t.status || t.status === 'Ativo' || String(t.status).toLowerCase() === 'ativo';
    const isSubjectActive = (s: any) => !s.status || s.status === 'Ativo' || String(s.status).toLowerCase() === 'ativo';

    // Quando uma unidade específica estiver selecionada (ou se houver itens em memória), computa diretamente dos dados escopados
    if (selectedUnitId !== 'all' || students.length > 0 || classes.length > 0) {
      const studTotal = scopedStudents.length;
      const studActive = scopedStudents.filter(isStudentActive).length;

      const classTotal = scopedClasses.length;
      const classActive = scopedClasses.filter(isClassActive).length;

      const teacherTotal = scopedTeachers.length;
      const teacherActive = scopedTeachers.filter(isTeacherActive).length;

      const subjectTotal = scopedSubjects.length;
      const subjectActive = scopedSubjects.filter(isSubjectActive).length;

      return {
        students: {
          total: studTotal,
          active: studActive,
          inactive: Math.max(0, studTotal - studActive),
          archived: 0,
          current: studTotal
        },
        classes: {
          total: classTotal,
          active: classActive,
          inactive: Math.max(0, classTotal - classActive),
          archived: 0,
          current: classTotal
        },
        teachers: {
          total: teacherTotal,
          active: teacherActive,
          inactive: Math.max(0, teacherTotal - teacherActive),
          archived: 0,
          current: teacherTotal
        },
        subjects: {
          total: subjectTotal,
          active: subjectActive,
          inactive: Math.max(0, subjectTotal - subjectActive),
          archived: 0,
          current: subjectTotal
        }
      };
    }

    return stats;
  }, [selectedUnitId, scopedStudents, scopedClasses, scopedTeachers, scopedSubjects, students.length, classes.length, stats]);

  const [allAcademicSettings, setAllAcademicSettings] = useState<any[]>([]);

  // Escuta atualizações no cronograma escolar disparadas pelo calendário ou parâmetros
  useEffect(() => {
    const handleSettingsUpdated = () => {
      fetchAll('academic_settings').then(data => {
        if (data && Array.isArray(data)) {
          setAllAcademicSettings(data);
        }
      }).catch(err => console.warn('Aviso ao recarregar academic_settings:', err));
    };

    window.addEventListener('academic-settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('academic-settings-updated', handleSettingsUpdated);
    };
  }, []);

  // Determina e resolve o cronograma aplicável à unidade ativa (próprio do polo ou herdado da matriz)
  const acadSettings = useMemo(() => {
    const { settings } = resolveAcademicSettingsForUnit(selectedUnitId, allAcademicSettings);
    return settings;
  }, [selectedUnitId, allAcademicSettings]);

  const activeSemesterNum = useMemo(() => {
    const now = new Date();
    if (acadSettings) {
      if (acadSettings.current_term) {
        const num = parseInt(String(acadSettings.current_term), 10);
        if (num === 1 || num === 2) return num;
      }
      if (acadSettings.term2_start) {
        const t2Start = new Date(acadSettings.term2_start + 'T00:00:00');
        const t2End = acadSettings.term2_end ? new Date(acadSettings.term2_end + 'T23:59:59') : null;
        if (now >= t2Start && (!t2End || now <= t2End)) {
          return 2;
        }
        if (acadSettings.term1_start) {
          const t1Start = new Date(acadSettings.term1_start + 'T00:00:00');
          const t1End = acadSettings.term1_end ? new Date(acadSettings.term1_end + 'T23:59:59') : null;
          if (now >= t1Start && t1End && now <= t1End) {
            return 1;
          }
        }
      }
    }
    return (now.getMonth() + 1) >= 7 ? 2 : 1;
  }, [acadSettings]);

  const prevSyncErrorRef = useRef<string | null>(null);

  // Som único / Bip audível de falha de conexão
  useEffect(() => {
    if (syncError && !prevSyncErrorRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          
          // Helper para emitir um tom sintetizado de alerta
          const playTone = (freq: number, startTime: number, duration: number, type: 'sine' | 'sawtooth' | 'triangle' = 'triangle') => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.12, startTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
          };

          // Sequência marcante de 3 bips (grave-médio-agudo de atenção)
          const now = ctx.currentTime;
          playTone(440, now, 0.12, 'sawtooth');
          playTone(554, now + 0.15, 0.12, 'sawtooth');
          playTone(659, now + 0.30, 0.25, 'triangle');
        }
      } catch (err) {
        console.warn('Erro ao emitir alerta sonoro de conexão:', err);
      }
    }
    prevSyncErrorRef.current = syncError;
  }, [syncError]);

  const fetchStats = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setIsRefreshing(true);
    
    const updateCategory = async (category: keyof typeof stats, collection: string) => {
      try {
        const [total, active] = await Promise.all([
          fetchCount(collection),
          fetchCount(collection, 'Ativo')
        ]);
        
        const inactive = Math.max(0, total - active);
        const newStats = { total, active, inactive, archived: 0, current: total };
        
        setStats(prev => {
          const updated = {
            ...prev,
            [category]: newStats
          };
          localStorage.setItem('dashboard-stats-cache', JSON.stringify(updated));
          return updated;
        });
      } catch (e: any) {
        const isOfflineError = 
          (typeof window !== 'undefined' && !window.navigator.onLine) || 
          e?.message?.toLowerCase().includes('offline') || 
          e?.message?.toLowerCase().includes('failed to fetch') || 
          e?.message?.toLowerCase().includes('network error');

        if (isOfflineError) {
          console.warn(`Stats offline fallback for ${collection}:`, e?.message || e);
        } else {
          console.error(`Stats error for ${collection}:`, e);
        }
      }
    };

    try {
      setSyncError(null);
      // Run updates in parallel
      const [studentsData, classesData, subjectsData, teachersData, acadData, enrollmentsData, contribsData] = await Promise.all([
        fetchAll('students'),
        fetchAll('classes'),
        fetchAll('subjects'),
        fetchAll('teachers'),
        fetchAll('academic_settings').catch(() => []),
        fetchAll('enrollments').catch(() => []),
        fetchAll('contributions').catch(() => []),
        updateCategory('students', 'students'),
        updateCategory('teachers', 'teachers'),
        updateCategory('classes', 'classes'),
        updateCategory('subjects', 'subjects')
      ]);

      if (acadData && acadData.length > 0) {
        setAllAcademicSettings(acadData);
      } else {
        try {
          const byId = await fetchById('academic_settings', 'current');
          if (byId) setAllAcademicSettings([byId]);
        } catch (e) {}
      }
      
      if (studentsData) setStudents(studentsData);
      if (enrollmentsData) setEnrollments(enrollmentsData);
      if (contribsData) setContributions(contribsData);
      
      const normalizedSubjects = (subjectsData || []).map((s: Subject) => normalizeSubject(s));
      setSubjects(normalizedSubjects);

      if (teachersData) {
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
        setTeachers(normalizedTeachers);
      }

      if (classesData) {
        const normalizedClasses = (classesData || []).map((cls: Class) => {
          const normalized = normalizeClass(cls, normalizedSubjects);

          // Regra Fundamental: Não existe 5º Ano. Se a turma atingir este patamar ou estiver cadastrada como 5º Ano, converte para Curso Extra.
          const yrStr = (normalized.year || '').toLowerCase();
          if (yrStr.includes('5º') || yrStr.includes('5°') || yrStr.includes('5 ano') || yrStr.includes('5ª') || yrStr.includes('5a') || yrStr.includes('5th')) {
            normalized.year = 'Curso Extra';
          }

          return normalized;
        });
        setClasses(normalizedClasses);

        // Keep stats.classes strictly synchronized with loaded classes
        const totalClasses = normalizedClasses.length;
        const activeCount = normalizedClasses.filter(c => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo').length;
        setStats(prev => ({
          ...prev,
          classes: {
            total: totalClasses,
            active: activeCount,
            inactive: Math.max(0, totalClasses - activeCount),
            archived: 0,
            current: totalClasses
          }
        }));
      }
      
      const now = new Date();
      setLastUpdated(now);
      localStorage.setItem('dashboard-stats-last-updated', now.toISOString());
    } catch (e: any) {
      const isOfflineError = 
        (typeof window !== 'undefined' && !window.navigator.onLine) || 
        e?.message?.toLowerCase().includes('offline') || 
        e?.message?.toLowerCase().includes('failed to fetch') || 
        e?.message?.toLowerCase().includes('network error');

      if (isOfflineError) {
        console.warn("Dispositivo offline ou erro de rede ao atualizar estatísticas da dashboard:", e?.message || e);
      } else {
        console.error("Erro na sincronização automática:", e);
      }
      let errorMsg = e?.message || 'Erro de conexão com o banco de dados principal.';
      errorMsg = errorMsg.replace(/\[Supabase\]\s*/gi, '').replace(/supabase/gi, 'banco de dados');
      setSyncError(errorMsg);
      setDbStatus('error');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const [selectedClassStudents, setSelectedClassStudents] = useState<Student[]>([]);
  const [selectedClassLabel, setSelectedClassLabel] = useState("");
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [isUnallocatedContext, setIsUnallocatedContext] = useState(false);
  const [showDisciplines, setShowDisciplinesState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dashboard_show_disciplines') === 'true';
    } catch (e) {
      return false;
    }
  });

  const setShowDisciplines = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setShowDisciplinesState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      try {
        localStorage.setItem('dashboard_show_disciplines', String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const [dismissedNoticeYears, setDismissedNoticeYears] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem('dashboard_dismissed_planning_notices');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [noticeSecondsLeft, setNoticeSecondsLeft] = useState<number>(8);

  const handleDismissNotice = useCallback((year: string) => {
    setDismissedNoticeYears(prev => {
      if (prev.includes(year)) return prev;
      const next = [...prev, year];
      try {
        sessionStorage.setItem('dashboard_dismissed_planning_notices', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const academicOccupationRef = useRef<HTMLDivElement>(null);

  const handleToggleDisciplines = useCallback(() => {
    const willExpand = !showDisciplines;
    setShowDisciplines(willExpand);

    const mainContainer = document.querySelector('main');

    if (willExpand) {
      // Ao exibir as matérias (toda expansão), move a tela suavemente para baixo para acompanhar o conteúdo revelado
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (mainContainer) {
            mainContainer.scrollBy({ top: 220, behavior: 'smooth' });
          } else {
            window.scrollBy({ top: 220, behavior: 'smooth' });
          }
        }, 60);
      });
    } else {
      // Ao ocultar: NUNCA move a tela para baixo, mantendo a visualização estável
      if (mainContainer && academicOccupationRef.current) {
        const topBefore = academicOccupationRef.current.getBoundingClientRect().top;
        requestAnimationFrame(() => {
          setTimeout(() => {
            const topAfter = academicOccupationRef.current?.getBoundingClientRect().top;
            if (topBefore !== undefined && topAfter !== undefined && topAfter < topBefore) {
              mainContainer.scrollTop += (topAfter - topBefore);
            }
          }, 30);
        });
      }
    }
  }, [showDisciplines, setShowDisciplines]);

  // Helper to extract exact academic start year for a class
  const getClassStartYear = useCallback((c: any): number => {
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

    // 1. Primary source: start_year / academic_year
    const fromStart = extractYear(c.start_year || (c as any).academic_year);
    if (fromStart) return fromStart;

    // 2. Observations metadata
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

    // 4. Dates
    const fromStartDate = extractYear(c.start_date);
    if (fromStartDate) return fromStartDate;

    const fromCreated = extractYear(c.created_at);
    if (fromCreated) return fromCreated;

    return 2026;
  }, []);

  const getClassAcademicYear = useCallback((c: any): string => {
    if (c.unallocated) return 'S/T';
    return String(getClassStartYear(c));
  }, [getClassStartYear]);

  const currentAcademicYear = useMemo(() => '2026', []);

  // Persistent record of classes explicitly habilitated / promoted for future academic years (e.g. 2027)
  const [habilitatedMap, setHabilitatedMap] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('academic_habilitated_classes_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  });

  const [showHabilitationModal, setShowHabilitationModal] = useState(false);
  const [targetHabilitationYear, setTargetHabilitationYear] = useState('2027');

  const toggleClassHabilitation = useCallback((targetYear: string, classId: string) => {
    setHabilitatedMap(prev => {
      const currentList = prev[targetYear] || [];
      const exists = currentList.includes(classId);
      const updatedList = exists ? currentList.filter(id => id !== classId) : [...currentList, classId];
      const nextMap = { ...prev, [targetYear]: updatedList };
      try {
        localStorage.setItem('academic_habilitated_classes_v1', JSON.stringify(nextMap));
      } catch (e) {}
      return nextMap;
    });
  }, []);

  const setAllCohortsHabilitation = useCallback((targetYear: string, classIds: string[], enable: boolean) => {
    setHabilitatedMap(prev => {
      const currentSet = new Set(prev[targetYear] || []);
      classIds.forEach(id => {
        if (enable) currentSet.add(id);
        else currentSet.delete(id);
      });
      const nextMap = { ...prev, [targetYear]: Array.from(currentSet) };
      try {
        localStorage.setItem('academic_habilitated_classes_v1', JSON.stringify(nextMap));
      } catch (e) {}
      return nextMap;
    });
  }, []);

  // Helper to determine if a class is active / habilitated in the selected academic year.
  // Academic Lifecycle Rules:
  // 1. Momento Vigente (2026 / 'ATUAL'):
  //    Shows all cohorts currently active in 2026 (i.e. turmas 2026, plus active cohorts 2025, 2024, 2023).
  // 2. Anos Anteriores (< 2026, ex: 2025, 2024, 2023):
  //    Shows cohorts active during that historical year.
  // 3. Anos Futuros (> 2026, ex: 2027):
  //    Cohorts from past years (2026, 2025, 2024, 2023) are NOT yet habilitated for 2027 by default.
  //    They only appear if:
  //      - Created directly for 2027 (start_year === 2027 or year === '2027'), OR
  //      - Explicitly habilitated / promoted for 2027 via the Habilitação Manager or metadata.
  const isClassActiveInAcademicYear = useCallback((c: any, selectedYear: string): boolean => {
    if (!selectedYear || selectedYear === 'Todos') return true;
    if (c.unallocated) return false;

    const currentYearNum = parseInt(currentAcademicYear, 10); // 2026
    const targetYearNum = selectedYear === 'ATUAL' ? currentYearNum : parseInt(selectedYear, 10);
    if (isNaN(targetYearNum)) return true;

    const startYr = getClassStartYear(c);
    const isCurrentlyActive = !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';

    // 1. Momento Vigente (2026 ou 'ATUAL')
    if (selectedYear === 'ATUAL' || targetYearNum === currentYearNum) {
      if (isCurrentlyActive) {
        let endYr = startYr + 3;
        if (c.end_date) {
          const parsedEnd = parseInt(String(c.end_date).substring(0, 4), 10);
          if (!isNaN(parsedEnd)) endYr = parsedEnd;
        }
        return currentYearNum >= startYr && currentYearNum <= endYr;
      }
      return false;
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
    // Coortes de anos anteriores (2026, 2025, 2024, 2023) NÃO constam automaticamente
    // até que sejam criadas diretamente para aquele ano ou expressamente habilitadas.
    const isDirectlyForFutureYear = startYr === targetYearNum || 
      c.year === String(targetYearNum) ||
      String(c.start_year || '').includes(String(targetYearNum)) ||
      String(c.name || '').includes(String(targetYearNum)) ||
      String(c.code || '').includes(String(targetYearNum).slice(2));
    if (isDirectlyForFutureYear) return true;

    // Verificar se foi expressamente habilitada via Gerenciador de Habilitações (habilitatedMap)
    const yearHabilitatedList = habilitatedMap[String(targetYearNum)] || [];
    if (yearHabilitatedList.includes(c.id)) return true;

    // Verificar se possui marcação expressa nos metadados da turma
    const isMetaHabilitated = Boolean(
      (c.observations && (c.observations.includes(`habilitada_${targetYearNum}`) || c.observations.includes(`enabled_for_${targetYearNum}`))) ||
      (Array.isArray(c.enabled_years) && c.enabled_years.includes(String(targetYearNum)))
    );

    return isMetaHabilitated;
  }, [getClassStartYear, currentAcademicYear, habilitatedMap]);

  const [selectedAcademicYear, setSelectedAcademicYearState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('dashboard_selected_academic_year');
      if (saved) return saved;
    } catch (e) {}
    return 'ATUAL';
  });

  const setSelectedAcademicYear = useCallback((yr: string) => {
    setSelectedAcademicYearState(yr);
    try {
      localStorage.setItem('dashboard_selected_academic_year', yr);
    } catch (e) {}
  }, []);

  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setIsYearDropdownOpen(false);
      }
    }
    if (isYearDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isYearDropdownOpen]);

  // Temporizador para fechar o banner de planejamento automaticamente após 8 segundos
  useEffect(() => {
    const isFuture = selectedAcademicYear !== 'Todos' && 
                     selectedAcademicYear !== 'ATUAL' && 
                     parseInt(selectedAcademicYear, 10) > 2026;
    if (isFuture && !dismissedNoticeYears.includes(selectedAcademicYear)) {
      setNoticeSecondsLeft(8);
      const interval = setInterval(() => {
        setNoticeSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            handleDismissNotice(selectedAcademicYear);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [selectedAcademicYear, dismissedNoticeYears, handleDismissNotice]);

  // Anos acadêmicos disponíveis calculados dinamicamente com base em dados ATIVOS.
  // Regra fundamental: se não tem nenhum curso, turma ou cadastro ativo para o ano, ele NÃO deve ser listado como opção.
  const availableAcademicYears = useMemo(() => {
    return computeAvailableAcademicYears({
      classes: scopedClasses,
      students: scopedStudents,
      enrollments,
      currentAcademicYear,
      isClassActiveInAcademicYear,
      getClassStartYear,
      habilitatedMap
    });
  }, [scopedClasses, scopedStudents, enrollments, currentAcademicYear, isClassActiveInAcademicYear, getClassStartYear, habilitatedMap]);

  // Se o ano acadêmico selecionado não estiver na lista de anos disponíveis (e não for ATUAL ou Todos), volta para ATUAL
  useEffect(() => {
    if (
      selectedAcademicYear !== 'ATUAL' &&
      selectedAcademicYear !== 'Todos' &&
      availableAcademicYears.length > 0 &&
      !availableAcademicYears.includes(selectedAcademicYear)
    ) {
      setSelectedAcademicYear('ATUAL');
    }
  }, [availableAcademicYears, selectedAcademicYear, setSelectedAcademicYear]);

  const studentsByClass = useMemo(() => {
    const isClassActive = (c: any) => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';

    const activeClasses = scopedClasses.filter(c => {
      if (selectedAcademicYear === 'ATUAL') {
        if (!isClassActive(c)) return false;
      }
      return isClassActiveInAcademicYear(c, selectedAcademicYear);
    });

    const activeStudents = scopedStudents.filter(s => s.status === 'Ativo' || !s.status || String(s.status).toLowerCase() === 'ativo');
    
    // Active enrollments
    const activeEnrollments = (enrollments || []).filter((e: any) => e.status === 'Ativo' || !e.status || String(e.status).toLowerCase() === 'ativo');
    const enrolledMap = new Map<string, Set<string>>(); // classId -> Set of studentIds
    activeEnrollments.forEach((e: any) => {
      if (e.class_id && e.student_id) {
        if (!enrolledMap.has(e.class_id)) enrolledMap.set(e.class_id, new Set());
        enrolledMap.get(e.class_id)!.add(e.student_id);
      }
    });

    // Map each class to its distinct active student IDs
    const classStudentIdsMap = new Map<string, Set<string>>();
    activeClasses.forEach(c => {
      const sIds = new Set<string>();
      
      // 1. Direct class_id on student
      activeStudents.forEach(s => {
        if (s.class_id === c.id || (s as any).current_class_id === c.id) {
          sIds.add(s.id);
        }
        if (Array.isArray((s as any).class_ids) && (s as any).class_ids.includes(c.id)) {
          sIds.add(s.id);
        }
      });

      // 2. Enrollments table
      const fromEnrollments = enrolledMap.get(c.id);
      if (fromEnrollments) {
        fromEnrollments.forEach(studentId => {
          if (activeStudents.some(s => s.id === studentId)) {
            sIds.add(studentId);
          }
        });
      }

      classStudentIdsMap.set(c.id, sIds);
    });

    // Total distinct students allocated in active classes in the current view
    const totalDistinctStudentsInView = new Set<string>();
    activeClasses.forEach(c => {
      classStudentIdsMap.get(c.id)?.forEach(id => totalDistinctStudentsInView.add(id));
    });

    const baseStudentCount = totalDistinctStudentsInView.size > 0 
      ? totalDistinctStudentsInView.size 
      : (activeStudents.length > 0 ? activeStudents.length : 1);

    // Create base stats from active classes
    const classStats = activeClasses.map(c => {
      const studentSet = classStudentIdsMap.get(c.id) || new Set();
      const count = studentSet.size;
      
      // Calculate capacity / occupancy percentage
      const capacity = (c as any).max_students || (c as any).capacity || (c as any).vagas;
      let percentage = 0;
      if (capacity && Number(capacity) > 0) {
        percentage = Math.min(100, Math.round((count / Number(capacity)) * 100));
      } else {
        percentage = baseStudentCount > 0 ? Math.round((count / baseStudentCount) * 100) : 0;
      }

      return {
        id: c.id,
        code: c.code,
        name: c.name,
        period: c.period,
        year: c.year,
        start_year: c.start_year,
        status: c.status || 'Ativo',
        isPlanned: c.status === 'Inativo' || String(c.status).toLowerCase() === 'inativo',
        subject_ids: c.subject_ids || [],
        subject_id_sem1_h1: (c as any).subject_id_sem1_h1,
        subject_id_sem1_h2: (c as any).subject_id_sem1_h2,
        subject_id_sem2_h1: (c as any).subject_id_sem2_h1,
        subject_id_sem2_h2: (c as any).subject_id_sem2_h2,
        subject_id_sem1: (c as any).subject_id_sem1,
        subject_id_sem2: (c as any).subject_id_sem2,
        count,
        percentage,
        unallocated: false
      };
    });

    // Find active students not allocated in any active class
    const allAllocatedStudentIds = new Set<string>();
    scopedClasses.filter(isClassActive).forEach(c => {
      const fromEnrollments = enrolledMap.get(c.id);
      if (fromEnrollments) fromEnrollments.forEach(id => allAllocatedStudentIds.add(id));
    });
    activeStudents.forEach(s => {
      if (s.class_id && scopedClasses.some(c => c.id === s.class_id && isClassActive(c))) {
        allAllocatedStudentIds.add(s.id);
      }
    });

    const unallocated = activeStudents.filter(s => !allAllocatedStudentIds.has(s.id));
    const unallocatedCount = unallocated.length;

    if (unallocatedCount > 0) {
      classStats.push({
        id: 'unallocated',
        code: 'S/T',
        name: 'Sem Turma / Não Alocados',
        period: '---' as any,
        year: '---',
        start_year: '---',
        status: 'Ativo',
        isPlanned: false,
        subject_ids: [],
        subject_id_sem1_h1: undefined,
        subject_id_sem1_h2: undefined,
        subject_id_sem2_h1: undefined,
        subject_id_sem2_h2: undefined,
        subject_id_sem1: undefined,
        subject_id_sem2: undefined,
        count: unallocatedCount,
        percentage: activeStudents.length > 0 ? Math.round((unallocatedCount / activeStudents.length) * 100) : 0,
        unallocated: true
      });
    }

    // Helper to rank classes: 1º ano (1), 2º ano (2), 3º ano (3), 4º ano (4), Cursos Extras (5)
    const getClassRank = (item: { name?: string; code?: string; unallocated?: boolean; start_year?: string; year?: string }) => {
      if (item.unallocated) return 99;

      const yearStr = (item.year || '').toLowerCase();
      if (yearStr.includes('1º') || yearStr.includes('1°') || yearStr.includes('1 ano') || yearStr.includes('1ª') || yearStr.includes('1a')) return 1;
      if (yearStr.includes('2º') || yearStr.includes('2°') || yearStr.includes('2 ano') || yearStr.includes('2ª') || yearStr.includes('2a')) return 2;
      if (yearStr.includes('3º') || yearStr.includes('3°') || yearStr.includes('3 ano') || yearStr.includes('3ª') || yearStr.includes('3a')) return 3;
      if (yearStr.includes('4º') || yearStr.includes('4°') || yearStr.includes('4 ano') || yearStr.includes('4ª') || yearStr.includes('4a')) return 4;
      if (yearStr.includes('5º') || yearStr.includes('5°') || yearStr.includes('5 ano') || yearStr.includes('curso extra') || yearStr.includes('extra')) return 5;

      const name = (item.name || '').toLowerCase();
      const code = (item.code || '').toLowerCase();

      // Explicit ordinal year in name or code
      if (name.includes('1º ano') || name.includes('1° ano') || name.includes('1 ano') || name.includes('1ºano') || name.includes('1°ano') || code.includes('1ano') || code.includes('1º')) return 1;
      if (name.includes('2º ano') || name.includes('2° ano') || name.includes('2 ano') || name.includes('2ºano') || name.includes('2°ano') || code.includes('2ano') || code.includes('2º')) return 2;
      if (name.includes('3º ano') || name.includes('3° ano') || name.includes('3 ano') || name.includes('3ºano') || name.includes('3°ano') || code.includes('3ano') || code.includes('3º')) return 3;
      if (name.includes('4º ano') || name.includes('4° ano') || name.includes('4 ano') || name.includes('4ºano') || name.includes('4°ano') || code.includes('4ano') || code.includes('4º')) return 4;
      if (name.includes('5º ano') || name.includes('5° ano') || name.includes('5 ano') || code.includes('5ano') || code.includes('5º')) return 5;

      // Automatic progression calculation based on start year relative to 2026:
      const startYr = getClassStartYear(item);
      if (startYr && !isNaN(startYr)) {
        const refYear = selectedAcademicYear === 'Todos' ? 2026 : (parseInt(selectedAcademicYear, 10) || 2026);
        const diff = refYear - startYr; // E.g., 2026 - 2026 = 0 (1º Ano), 2026 - 2025 = 1 (2º Ano), 2026 - 2024 = 2 (3º Ano), 2026 - 2023 = 3 (4º Ano)
        if (diff >= 0 && diff < 4) {
          return diff + 1;
        }
        if (diff >= 4) {
          // Não existe 5º ano: atinge patamar de Curso Extra
          return 5;
        }
      }

      // Check if it's the core degree program (e.g. Teologia)
      const isCoreProgram = name.includes('teologia') || code.startsWith('teo');
      if (isCoreProgram) return 1;

      // Extra course / extension (e.g. Doutrina Social da Igreja)
      return 5;
    };

    // Sort by Rank (1º ano -> 2º ano -> 3º ano -> 4º ano -> Cursos extras)
    const sorted = [...classStats].sort((a, b) => {
      const rankA = getClassRank(a);
      const rankB = getClassRank(b);

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // If same rank, sort alphabetically by name
      return (a.name || '').localeCompare(b.name || '');
    });

    // Assign refined color schemes
    const colorSchemes = [
      { gradient: 'from-blue-600 to-blue-400', bg: 'bg-blue-50/50', border: 'border-blue-100', glow: 'shadow-blue-200/50', text: 'text-blue-700' },
      { gradient: 'from-emerald-600 to-emerald-400', bg: 'bg-emerald-50/50', border: 'border-emerald-100', glow: 'shadow-emerald-200/50', text: 'text-emerald-700' },
      { gradient: 'from-amber-500 to-orange-400', bg: 'bg-amber-50/50', border: 'border-amber-100', glow: 'shadow-amber-200/50', text: 'text-amber-700' },
      { gradient: 'from-purple-600 to-purple-400', bg: 'bg-purple-50/50', border: 'border-purple-100', glow: 'shadow-purple-200/50', text: 'text-purple-700' },
      { gradient: 'from-pink-600 to-pink-400', bg: 'bg-pink-50/50', border: 'border-pink-100', glow: 'shadow-pink-200/50', text: 'text-pink-700' },
      { gradient: 'from-cyan-600 to-cyan-400', bg: 'bg-cyan-50/50', border: 'border-cyan-100', glow: 'shadow-cyan-200/50', text: 'text-cyan-700' },
      { gradient: 'from-indigo-600 to-indigo-400', bg: 'bg-indigo-50/50', border: 'border-indigo-100', glow: 'shadow-indigo-200/50', text: 'text-indigo-700' },
      { gradient: 'from-rose-600 to-rose-400', bg: 'bg-rose-50/50', border: 'border-rose-100', glow: 'shadow-rose-200/50', text: 'text-rose-700' },
      { gradient: 'from-slate-600 to-slate-400', bg: 'bg-slate-50/50', border: 'border-slate-200', glow: 'shadow-slate-200/50', text: 'text-slate-700' },
    ];

    return sorted.map((s, i) => {
      const scheme = s.id === 'unallocated' 
        ? { gradient: 'from-slate-400 to-slate-300', bg: 'bg-slate-50', border: 'border-slate-200', glow: 'shadow-slate-100', text: 'text-slate-600' }
        : colorSchemes[i % colorSchemes.length];
      
      return {
        ...s,
        color: scheme.gradient,
        bgClass: scheme.bg,
        borderClass: scheme.border,
        glowClass: scheme.glow,
        textClass: scheme.text
      };
    });
  }, [scopedClasses, scopedStudents, enrollments, selectedAcademicYear, isClassActiveInAcademicYear, selectedUnitId]);

  // Eligible active cohorts from past/current years (<= 2026) that can be habilitated for a future cycle (e.g. 2027)
  const eligibleCohortsForHabilitation = useMemo(() => {
    const targetYrNum = parseInt(targetHabilitationYear, 10);
    if (isNaN(targetYrNum)) return [];

    const isClassActive = (c: any) => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';

    return scopedClasses
      .filter(c => {
        if (c.unallocated) return false;
        const startYr = getClassStartYear(c);
        return startYr <= 2026 && isClassActive(c);
      })
      .map(c => {
        const startYr = getClassStartYear(c);
        const yearDiff = targetYrNum - startYr;
        // Regra: Não existe 5º ano. Se atingir este patamar (yearDiff >= 4), o ano acadêmico projetado é Curso Extra.
        const projectedLevel = 
          yearDiff <= 0 ? '1º Ano' :
          yearDiff === 1 ? '2º Ano' :
          yearDiff === 2 ? '3º Ano' :
          yearDiff === 3 ? '4º Ano' :
          'Curso Extra';
        
        const isHabilitated = 
          (habilitatedMap[targetHabilitationYear] || []).includes(c.id) ||
          Boolean(
            (c.observations && (c.observations.includes(`habilitada_${targetYrNum}`) || c.observations.includes(`enabled_for_${targetYrNum}`))) ||
            (Array.isArray(c.enabled_years) && c.enabled_years.includes(String(targetYrNum)))
          );

        // Calculate student count for this class
        const count = scopedStudents.filter(s => 
          (s.status === 'Ativo' || !s.status) && 
          (s.class_id === c.id || (s as any).current_class_id === c.id)
        ).length;

        return {
          ...c,
          startYr,
          projectedLevel,
          isHabilitated,
          activeStudentsCount: count
        };
      })
      .sort((a, b) => b.startYr - a.startYr);
  }, [scopedClasses, scopedStudents, targetHabilitationYear, habilitatedMap, getClassStartYear, selectedUnitId]);

  const [isDeactivating, setIsDeactivating] = useState(false);

  const handleDeactivateAllUnallocated = async () => {
    if (selectedClassStudents.length === 0) return;
    
    try {
      setIsDeactivating(true);
      const updates = selectedClassStudents.map(s => ({
        ...s,
        status: 'Inativo'
      }));
      
      const success = await saveBatch('students', updates);
      if (success) {
        setShowStudentsModal(false);
        fetchStats();
      }
    } catch (error) {
      console.error('Error deactivating students:', error);
    } finally {
      setIsDeactivating(false);
    }
  };

  const getSubjectTeacher = useCallback((s: Subject) => {
    if (s.teacher_id) {
      const t = teachers.find(teach => teach.id === s.teacher_id);
      if (t) return t;
    }

    if (s.program_content) {
      const match = s.program_content.match(/\[METADATA:(\{[\s\S]*?\})\]/);
      if (match && match[1]) {
        try {
          const meta = JSON.parse(match[1]);
          if (meta.teacher_id) {
            const t = teachers.find(teach => teach.id === meta.teacher_id);
            if (t) return t;
          }
        } catch (e) {}
      }
    }

    const teacherWithSubject = teachers.find(teach => {
      const sIds = teach.subject_ids || [];
      if (Array.isArray(sIds) && sIds.includes(s.id)) return true;
      return false;
    });

    return teacherWithSubject || null;
  }, [teachers]);

  const handleViewStudents = (classId: string, className: string, isUnallocated: boolean) => {
    let filtered: Student[] = [];
    const isClassActive = (c: any) => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';
    const activeStudents = scopedStudents.filter(s => s.status === 'Ativo' || !s.status || String(s.status).toLowerCase() === 'ativo');
    const activeEnrollments = (enrollments || []).filter((e: any) => e.status === 'Ativo' || !e.status || String(e.status).toLowerCase() === 'ativo');
    
    if (isUnallocated) {
      const activeClasses = scopedClasses.filter(isClassActive);
      const activeClassIds = new Set(activeClasses.map(c => c.id));
      const enrolledStudentIds = new Set<string>();
      activeEnrollments.forEach((e: any) => {
        if (e.class_id && activeClassIds.has(e.class_id) && e.student_id) {
          enrolledStudentIds.add(e.student_id);
        }
      });
      filtered = activeStudents.filter(s => (!s.class_id || !activeClassIds.has(s.class_id)) && !enrolledStudentIds.has(s.id));
    } else {
      const enrolledInThisClass = new Set<string>();
      activeEnrollments.forEach((e: any) => {
        if (e.class_id === classId && e.student_id) {
          enrolledInThisClass.add(e.student_id);
        }
      });
      filtered = activeStudents.filter(s => s.class_id === classId || (s as any).current_class_id === classId || enrolledInThisClass.has(s.id));
    }
    
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setSelectedClassStudents(filtered);
    setSelectedClassLabel(className);
    setIsUnallocatedContext(isUnallocated);
    setShowStudentsModal(true);
  };

  useEffect(() => {
    fetchStats();
    
    // Listen for connection status changes
    const handleStatusChange = (e: any) => {
      setDbStatus(e.detail.connected ? 'connected' : 'error');
      setDbInfo({
        connected: e.detail.connected,
        latency: e.detail.latency
      });
      if (!e.detail.connected) {
        setSyncError('Conectividade de rede instável ou offline.');
      } else {
        setSyncError(null);
      }
    };
    window.addEventListener('supabase-status-change', handleStatusChange);
    
    // Refresh only on explicit window re-focus if significantly later
    const handleFocus = () => {
      const now = new Date().getTime();
      const last = lastUpdated.getTime();
      if (now - last > 30000) { // Only refresh if 30s passed
        fetchStats();
      }
    };
    window.addEventListener('focus', handleFocus);
    
    // Auto-refresh every 5 minutes (reduced from 1 min to save quota)
    const interval = setInterval(fetchStats, 300000);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('supabase-status-change', handleStatusChange);
      clearInterval(interval);
    };
  }, [fetchStats]);

  const statCards = [
    { label: 'Alunos', stats: displayStats.students, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', path: '/students' },
    { label: 'Turmas', stats: displayStats.classes, icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-50', path: '/classes' },
    { label: 'Disciplinas', stats: displayStats.subjects, icon: BookOpen, color: 'text-blue-700', bg: 'bg-blue-100/50', path: '/subjects' },
    { label: 'Professores', stats: displayStats.teachers, icon: UserCheck, color: 'text-emerald-700', bg: 'bg-emerald-100/50', path: '/teachers' },
  ];

  // Helper para mapa de alunos por turma para vinculação de contribuições
  const studentToClassIdMap = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach(s => {
      if (s.class_id) map.set(s.id, s.class_id);
      else if ((s as any).current_class_id) map.set(s.id, (s as any).current_class_id);
    });
    enrollments.forEach((e: any) => {
      if (e.student_id && e.class_id && !map.has(e.student_id)) {
        map.set(e.student_id, e.class_id);
      }
    });
    return map;
  }, [students, enrollments]);

  // Anos de referência disponíveis para o gráfico de contribuições
  const availableContributionYears = useMemo(() => {
    const yrs = new Set<number>();
    const currYr = new Date().getFullYear();
    yrs.add(currYr);
    yrs.add(currYr - 1);
    yrs.add(currYr + 1);
    contributions.forEach(c => {
      const y = Number(c.reference_year);
      if (y && y >= 2020 && y <= 2030) yrs.add(y);
    });
    return Array.from(yrs).sort((a, b) => b - a);
  }, [contributions]);

  // Dados do gráfico de pizza de ocupação acadêmica
  const pieOccupationData = useMemo(() => {
    const itemsWithStudents = studentsByClass.filter(c => c.count > 0);
    const dataList = itemsWithStudents.length > 0 ? itemsWithStudents : studentsByClass;
    const total = dataList.reduce((acc, c) => acc + c.count, 0);

    return dataList.map((c, idx) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      count: c.count,
      percentage: total > 0 ? Math.round((c.count / total) * 100) : 0,
      capacityPercentage: c.percentage,
      unallocated: !!c.unallocated,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    }));
  }, [studentsByClass]);

  // Dados do gráfico de torres das contribuições mensais por turma
  const monthlyClassContributions = useMemo(() => {
    const filtered = contributions.filter(c => {
      if (selectedUnitId !== 'all' && !isItemInUnit(getItemUnitId(c), selectedUnitId, units)) return false;
      let m = Number(c.reference_month);
      let y = Number(c.reference_year);
      if (!m || !y) {
        if (c.payment_date) {
          const d = new Date(c.payment_date);
          if (!isNaN(d.getTime())) {
            m = m || (d.getMonth() + 1);
            y = y || d.getFullYear();
          }
        }
      }
      return m === selectedContributionMonth && y === selectedContributionYear;
    });

    const totalAmount = filtered.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    const totalCount = filtered.length;

    const classMap = new Map<string, { total: number; count: number }>();
    studentsByClass.forEach(c => {
      classMap.set(c.id, { total: 0, count: 0 });
    });

    filtered.forEach(c => {
      const classId = studentToClassIdMap.get(c.student_id) || 'unallocated';
      const entry = classMap.get(classId) || { total: 0, count: 0 };
      entry.total += Number(c.amount) || 0;
      entry.count += 1;
      classMap.set(classId, entry);
    });

    const chartBars = studentsByClass
      .filter(c => !c.unallocated || (classMap.get('unallocated')?.total || 0) > 0)
      .map((c, idx) => {
        const stats = classMap.get(c.id) || { total: 0, count: 0 };
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          shortLabel: c.code || (c.name.length > 9 ? c.name.slice(0, 9) + '...' : c.name),
          total: stats.total,
          count: stats.count,
          studentCount: c.count,
          color: CHART_COLORS[idx % CHART_COLORS.length]
        };
      });

    return {
      bars: chartBars,
      totalAmount,
      totalCount
    };
  }, [contributions, selectedUnitId, selectedContributionMonth, selectedContributionYear, studentsByClass, studentToClassIdMap]);

  const handlePrevContributionMonth = () => {
    if (selectedContributionMonth === 1) {
      setSelectedContributionMonth(12);
      setSelectedContributionYear(prev => prev - 1);
    } else {
      setSelectedContributionMonth(prev => prev - 1);
    }
  };

  const handleNextContributionMonth = () => {
    if (selectedContributionMonth === 12) {
      setSelectedContributionMonth(1);
      setSelectedContributionYear(prev => prev + 1);
    } else {
      setSelectedContributionMonth(prev => prev + 1);
    }
  };

  const isCurrentContributionMonth = useMemo(() => {
    const now = new Date();
    return selectedContributionMonth === (now.getMonth() + 1) && selectedContributionYear === now.getFullYear();
  }, [selectedContributionMonth, selectedContributionYear]);

  const handleCurrentContributionMonth = () => {
    const now = new Date();
    setSelectedContributionMonth(now.getMonth() + 1);
    setSelectedContributionYear(now.getFullYear());
  };

  // Dados aprimorados do gráfico comparativo: Previsto vs Realizado (Mensal, Semestral e Anual)
  const delinquencyMonthlyData = useMemo(() => {
    const targetYear = delinquencyYear;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isCurrentYear = targetYear === currentYear;

    // Alunos elegíveis no escopo selecionado (unidade e opcionalmente turma filtrada)
    const targetStudents = scopedStudents.filter(s => {
      const isActive = !s.status || s.status === 'Ativo' || String(s.status).toLowerCase() === 'ativo';
      if (!isActive) return false;
      const classId = s.class_id || (s as any).current_class_id;
      if (delinquencyClassFilter !== 'all') {
        return classId === delinquencyClassFilter;
      }
      return true;
    });

    const { settings: activeAcad } = resolveAcademicSettingsForUnit(selectedUnitId, allAcademicSettings);

    // Mapeamento de planos de contribuição e mensalidades dos alunos para o ano
    const studentPlans = targetStudents.map(student => {
      const studentClass = classes.find(c => c.id === (student.class_id || (student as any).current_class_id));
      const fee = financialConfigService.resolveFee({
        year: targetYear,
        classId: studentClass?.id,
        className: studentClass?.name,
        studentClass,
        student
      }, financialSettings);

      const studentContribs = contributions.filter(c => {
        if (c.student_id !== student.id) return false;
        let y = Number(c.reference_year);
        if (!y && c.payment_date) {
          const d = new Date(c.payment_date);
          if (!isNaN(d.getTime())) y = d.getFullYear();
        }
        return y === targetYear;
      });

      const paidMonths = studentContribs.map(c => Number(c.reference_month));
      const plan = getStudentContributionPlan(student, studentClass, targetYear, paidMonths, activeAcad);

      return {
        student,
        studentClass,
        fee,
        plan
      };
    });

    // Contribuições no escopo da unidade e turma
    const relevantContributions = contributions.filter(c => {
      if (selectedUnitId !== 'all' && !isItemInUnit(getItemUnitId(c), selectedUnitId, units)) return false;
      let y = Number(c.reference_year);
      if (!y && c.payment_date) {
        const d = new Date(c.payment_date);
        if (!isNaN(d.getTime())) y = d.getFullYear();
      }
      if (y !== targetYear) return false;

      if (delinquencyClassFilter !== 'all') {
        const sClassId = studentToClassIdMap.get(c.student_id);
        if (sClassId !== delinquencyClassFilter) return false;
      }
      return true;
    });

    // Mapeamento mês a mês (1 a 12)
    let accumulatedPrevisto = 0;
    let accumulatedRealizado = 0;

    const monthlyPoints = Array.from({ length: 12 }, (_, idx) => {
      const monthNum = idx + 1;
      const monthShort = MONTH_SHORT_LABELS[idx];
      const monthName = MONTH_NAMES_LIST[idx];

      // Previsto mensal (valores a receber): soma dos valores esperados dos alunos
      let monthPrevisto = 0;
      studentPlans.forEach(({ fee, plan }) => {
        // Se for Janeiro (mês 1), inclui expectativa de Matrícula (mês 0) se houver
        if (monthNum === 1) {
          if (plan.expectedPeriods.includes(0)) {
            monthPrevisto += fee;
          }
          if (plan.expectedPeriods.includes(1)) {
            monthPrevisto += fee;
          }
        } else {
          if (plan.expectedPeriods.includes(monthNum)) {
            monthPrevisto += fee;
          }
        }
      });

      // Realizado mensal (valores recebidos): soma das contribuições pagas para este mês
      const monthContribs = relevantContributions.filter(c => {
        let m = Number(c.reference_month);
        if (m === undefined || isNaN(m)) {
          if (c.payment_date) {
            const d = new Date(c.payment_date);
            if (!isNaN(d.getTime())) m = d.getMonth() + 1;
          }
        }
        if (monthNum === 1) {
          return m === 1 || m === 0; // Janeiro engloba contribuições de Janeiro e Matrícula inicial
        }
        return m === monthNum;
      });

      const monthRealizado = monthContribs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const monthSaldo = monthPrevisto - monthRealizado; // Saldo da diferença (Previsto - Realizado)
      const monthInadimplencia = Math.max(0, monthSaldo);

      // Acumulados progressivos ao longo do ano
      accumulatedPrevisto += monthPrevisto;
      accumulatedRealizado += monthRealizado;
      const accumulatedSaldo = accumulatedPrevisto - accumulatedRealizado;
      const accumulatedInadimplencia = Math.max(0, accumulatedSaldo);

      // Status temporal do mês
      const isPast = isCurrentYear ? monthNum < currentMonth : targetYear < currentYear;
      const isCurrent = isCurrentYear && monthNum === currentMonth;
      const isFuture = isCurrentYear ? monthNum > currentMonth : targetYear > currentYear;

      const rateRealizado = monthPrevisto > 0 
        ? Math.min(100, (monthRealizado / monthPrevisto) * 100)
        : (monthRealizado > 0 ? 100 : 0);

      const rateRealizadoAccum = accumulatedPrevisto > 0
        ? Math.min(100, (accumulatedRealizado / accumulatedPrevisto) * 100)
        : (accumulatedRealizado > 0 ? 100 : 0);

      return {
        monthNum,
        monthShort,
        monthName,
        monthPrevisto,
        monthRealizado,
        monthSaldo,
        monthMeta: monthPrevisto,
        monthInadimplencia,
        accumulatedPrevisto,
        accumulatedRealizado,
        accumulatedSaldo,
        accumulatedMeta: accumulatedPrevisto,
        accumulatedInadimplencia,
        rateRealizado: Number(rateRealizado.toFixed(1)),
        rateRealizadoAccum: Number(rateRealizadoAccum.toFixed(1)),
        rateArrecadacao: Number(rateRealizado.toFixed(1)),
        rateInadimplencia: monthPrevisto > 0 ? Number(Math.min(100, (monthInadimplencia / monthPrevisto) * 100).toFixed(1)) : 0,
        rateInadimplenciaAccum: accumulatedPrevisto > 0 ? Number(Math.min(100, (accumulatedInadimplencia / accumulatedPrevisto) * 100).toFixed(1)) : 0,
        isPast,
        isCurrent,
        isFuture,
        contribCount: monthContribs.length
      };
    });

    // 1. Total Anual (12 Meses)
    const annualPrevisto = monthlyPoints.reduce((acc, p) => acc + p.monthPrevisto, 0);
    const annualRealizado = monthlyPoints.reduce((acc, p) => acc + p.monthRealizado, 0);
    const annualSaldo = annualPrevisto - annualRealizado;
    const annualRateRealizado = annualPrevisto > 0 ? Number(Math.min(100, (annualRealizado / annualPrevisto) * 100).toFixed(1)) : (annualRealizado > 0 ? 100 : 0);

    const annualChartPoints = monthlyPoints.map(p => ({
      ...p,
      displayLabel: p.monthShort,
      previstoDisplay: annualDisplayType === 'accumulated' ? p.accumulatedPrevisto : p.monthPrevisto,
      realizadoDisplay: annualDisplayType === 'accumulated' ? p.accumulatedRealizado : p.monthRealizado,
      saldoDisplay: annualDisplayType === 'accumulated' ? p.accumulatedSaldo : p.monthSaldo,
      rateDisplay: annualDisplayType === 'accumulated' ? p.rateRealizadoAccum : p.rateRealizado
    }));

    // 2. 1º Semestre (Jan a Jun - meses 1 a 6)
    const sem1BasePoints = monthlyPoints.slice(0, 6);
    const sem1Previsto = sem1BasePoints.reduce((acc, p) => acc + p.monthPrevisto, 0);
    const sem1Realizado = sem1BasePoints.reduce((acc, p) => acc + p.monthRealizado, 0);
    const sem1Saldo = sem1Previsto - sem1Realizado;
    const sem1RateRealizado = sem1Previsto > 0 ? Number(Math.min(100, (sem1Realizado / sem1Previsto) * 100).toFixed(1)) : (sem1Realizado > 0 ? 100 : 0);

    let sem1RunPrevisto = 0;
    let sem1RunRealizado = 0;
    const sem1ChartPoints = sem1BasePoints.map(p => {
      sem1RunPrevisto += p.monthPrevisto;
      sem1RunRealizado += p.monthRealizado;
      const sem1RunSaldo = sem1RunPrevisto - sem1RunRealizado;
      const sem1RunRate = sem1RunPrevisto > 0 ? Number(Math.min(100, (sem1RunRealizado / sem1RunPrevisto) * 100).toFixed(1)) : 0;

      return {
        ...p,
        displayLabel: p.monthShort,
        previstoDisplay: semesterDisplayType === 'accumulated' ? sem1RunPrevisto : p.monthPrevisto,
        realizadoDisplay: semesterDisplayType === 'accumulated' ? sem1RunRealizado : p.monthRealizado,
        saldoDisplay: semesterDisplayType === 'accumulated' ? sem1RunSaldo : p.monthSaldo,
        rateDisplay: semesterDisplayType === 'accumulated' ? sem1RunRate : p.rateRealizado,
        semAccumPrevisto: sem1RunPrevisto,
        semAccumRealizado: sem1RunRealizado,
        semAccumSaldo: sem1RunSaldo
      };
    });

    // 3. 2º Semestre (Jul a Dez - meses 7 a 12)
    const sem2BasePoints = monthlyPoints.slice(6, 12);
    const sem2Previsto = sem2BasePoints.reduce((acc, p) => acc + p.monthPrevisto, 0);
    const sem2Realizado = sem2BasePoints.reduce((acc, p) => acc + p.monthRealizado, 0);
    const sem2Saldo = sem2Previsto - sem2Realizado;
    const sem2RateRealizado = sem2Previsto > 0 ? Number(Math.min(100, (sem2Realizado / sem2Previsto) * 100).toFixed(1)) : (sem2Realizado > 0 ? 100 : 0);

    let sem2RunPrevisto = 0;
    let sem2RunRealizado = 0;
    const sem2ChartPoints = sem2BasePoints.map(p => {
      sem2RunPrevisto += p.monthPrevisto;
      sem2RunRealizado += p.monthRealizado;
      const sem2RunSaldo = sem2RunPrevisto - sem2RunRealizado;
      const sem2RunRate = sem2RunPrevisto > 0 ? Number(Math.min(100, (sem2RunRealizado / sem2RunPrevisto) * 100).toFixed(1)) : 0;

      return {
        ...p,
        displayLabel: p.monthShort,
        previstoDisplay: semesterDisplayType === 'accumulated' ? sem2RunPrevisto : p.monthPrevisto,
        realizadoDisplay: semesterDisplayType === 'accumulated' ? sem2RunRealizado : p.monthRealizado,
        saldoDisplay: semesterDisplayType === 'accumulated' ? sem2RunSaldo : p.monthSaldo,
        rateDisplay: semesterDisplayType === 'accumulated' ? sem2RunRate : p.rateRealizado,
        semAccumPrevisto: sem2RunPrevisto,
        semAccumRealizado: sem2RunRealizado,
        semAccumSaldo: sem2RunSaldo
      };
    });

    const activeSemesterSummary = selectedSemester === 1 ? {
      number: 1,
      title: '1º Semestre',
      periodLabel: 'Janeiro a Junho',
      previsto: sem1Previsto,
      realizado: sem1Realizado,
      saldo: sem1Saldo,
      rateRealizado: sem1RateRealizado,
      chartPoints: sem1ChartPoints,
      basePoints: sem1BasePoints
    } : {
      number: 2,
      title: '2º Semestre',
      periodLabel: 'Julho a Dezembro',
      previsto: sem2Previsto,
      realizado: sem2Realizado,
      saldo: sem2Saldo,
      rateRealizado: sem2RateRealizado,
      chartPoints: sem2ChartPoints,
      basePoints: sem2BasePoints
    };

    // 4. Mês Selecionado vs. Antecessor e Posterior
    const targetMonthIdx = Math.min(Math.max(1, selectedComparisonMonth), 12) - 1;
    const selectedMonth = monthlyPoints[targetMonthIdx];
    const prevMonth = targetMonthIdx > 0 ? monthlyPoints[targetMonthIdx - 1] : null;
    const nextMonth = targetMonthIdx < 11 ? monthlyPoints[targetMonthIdx + 1] : null;

    // Variações em relação ao antecessor
    const deltaRealizadoVsPrev = prevMonth ? selectedMonth.monthRealizado - prevMonth.monthRealizado : null;
    const deltaRealizadoPctVsPrev = prevMonth && prevMonth.monthRealizado > 0
      ? Number((((selectedMonth.monthRealizado - prevMonth.monthRealizado) / prevMonth.monthRealizado) * 100).toFixed(1))
      : null;

    const deltaPrevistoVsPrev = prevMonth ? selectedMonth.monthPrevisto - prevMonth.monthPrevisto : null;
    const deltaSaldoVsPrev = prevMonth ? selectedMonth.monthSaldo - prevMonth.monthSaldo : null;

    // Variações em relação ao posterior
    const deltaPrevistoVsNext = nextMonth ? nextMonth.monthPrevisto - selectedMonth.monthPrevisto : null;
    const deltaRealizadoVsNext = nextMonth ? nextMonth.monthRealizado - selectedMonth.monthRealizado : null;

    // Pontos do trio (Antecessor, Selecionado, Posterior)
    const trioPoints = [
      prevMonth ? {
        ...prevMonth,
        role: 'antecessor',
        roleLabel: `${prevMonth.monthShort} (Antecessor)`,
        displayLabel: `${prevMonth.monthShort} (M-1)`,
        previstoDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.accumulatedPrevisto : prevMonth.monthPrevisto,
        realizadoDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.accumulatedRealizado : prevMonth.monthRealizado,
        saldoDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.accumulatedSaldo : prevMonth.monthSaldo,
        rateDisplay: monthlyDisplayType === 'accumulated' ? prevMonth.rateRealizadoAccum : prevMonth.rateRealizado,
        isSelected: false
      } : null,
      {
        ...selectedMonth,
        role: 'selecionado',
        roleLabel: `${selectedMonth.monthShort} (Foco)`,
        displayLabel: `${selectedMonth.monthShort} (Foco)`,
        previstoDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.accumulatedPrevisto : selectedMonth.monthPrevisto,
        realizadoDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.accumulatedRealizado : selectedMonth.monthRealizado,
        saldoDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.accumulatedSaldo : selectedMonth.monthSaldo,
        rateDisplay: monthlyDisplayType === 'accumulated' ? selectedMonth.rateRealizadoAccum : selectedMonth.rateRealizado,
        isSelected: true
      },
      nextMonth ? {
        ...nextMonth,
        role: 'posterior',
        roleLabel: `${nextMonth.monthShort} (Posterior)`,
        displayLabel: `${nextMonth.monthShort} (M+1)`,
        previstoDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.accumulatedPrevisto : nextMonth.monthPrevisto,
        realizadoDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.accumulatedRealizado : nextMonth.monthRealizado,
        saldoDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.accumulatedSaldo : nextMonth.monthSaldo,
        rateDisplay: monthlyDisplayType === 'accumulated' ? nextMonth.rateRealizadoAccum : nextMonth.rateRealizado,
        isSelected: false
      } : null
    ].filter(Boolean) as any[];

    // Pontos mensais de todos os 12 meses para o modo mensal estendido
    const monthlyAllPoints = monthlyPoints.map(p => ({
      ...p,
      displayLabel: p.monthShort,
      previstoDisplay: monthlyDisplayType === 'accumulated' ? p.accumulatedPrevisto : p.monthPrevisto,
      realizadoDisplay: monthlyDisplayType === 'accumulated' ? p.accumulatedRealizado : p.monthRealizado,
      saldoDisplay: monthlyDisplayType === 'accumulated' ? p.accumulatedSaldo : p.monthSaldo,
      rateDisplay: monthlyDisplayType === 'accumulated' ? p.rateRealizadoAccum : p.rateRealizado,
      isSelected: p.monthNum === selectedMonth.monthNum
    }));

    const monthlyChartPoints = monthlyChartScope === 'trio' ? trioPoints : monthlyAllPoints;

    return {
      monthlyPoints,
      annualChartPoints,
      sem1ChartPoints,
      sem2ChartPoints,
      activeSemesterSummary,
      monthlyChartPoints,
      trioPoints,
      annual: {
        previsto: annualPrevisto,
        realizado: annualRealizado,
        saldo: annualSaldo,
        rateRealizado: annualRateRealizado,
        meta: annualPrevisto,
        inadimplencia: Math.max(0, annualSaldo),
        rateInadimplencia: annualPrevisto > 0 ? Number(Math.min(100, (Math.max(0, annualSaldo) / annualPrevisto) * 100).toFixed(1)) : 0,
        rateArrecadacao: annualRateRealizado
      },
      sem1: {
        previsto: sem1Previsto,
        realizado: sem1Realizado,
        saldo: sem1Saldo,
        rateRealizado: sem1RateRealizado,
        meta: sem1Previsto,
        inadimplencia: Math.max(0, sem1Saldo),
        rateInadimplencia: sem1Previsto > 0 ? Number(Math.min(100, (Math.max(0, sem1Saldo) / sem1Previsto) * 100).toFixed(1)) : 0,
        rateArrecadacao: sem1RateRealizado
      },
      sem2: {
        previsto: sem2Previsto,
        realizado: sem2Realizado,
        saldo: sem2Saldo,
        rateRealizado: sem2RateRealizado,
        meta: sem2Previsto,
        inadimplencia: Math.max(0, sem2Saldo),
        rateInadimplencia: sem2Previsto > 0 ? Number(Math.min(100, (Math.max(0, sem2Saldo) / sem2Previsto) * 100).toFixed(1)) : 0,
        rateArrecadacao: sem2RateRealizado
      },
      comparison: {
        selectedMonth,
        prevMonth,
        nextMonth,
        deltaRealizadoVsPrev,
        deltaRealizadoPctVsPrev,
        deltaPrevistoVsPrev,
        deltaSaldoVsPrev,
        deltaPrevistoVsNext,
        deltaRealizadoVsNext
      },
      targetStudentsCount: targetStudents.length,
      isCurrentYear,
      currentMonth
    };
  }, [
    delinquencyYear,
    delinquencyClassFilter,
    selectedComparisonMonth,
    monthlyChartScope,
    monthlyDisplayType,
    selectedSemester,
    semesterDisplayType,
    annualDisplayType,
    scopedStudents,
    contributions,
    classes,
    financialSettings,
    allAcademicSettings,
    selectedUnit,
    selectedUnitId,
    units,
    studentToClassIdMap
  ]);

  // ==========================================
  // TELA DEDICADA EXCLUSIVA PARA PROFESSOR / DOCENTE
  // 2 botões grandes e elegantes ao centro
  // Sem estatísticas gerais, sem cronogramas no topo e sem ocupação acadêmica
  // ==========================================
  if (isTeacher) {
    const teacherCards = [
      {
        title: 'Lançar Chamada',
        category: 'Presença Diária',
        description: 'Registro de frequência e faltas dos alunos aula a aula em tempo real.',
        icon: UserCheck,
        path: '/attendance',
        accentColor: 'emerald',
        bg: 'bg-white hover:bg-emerald-50/40',
        borderColor: 'border-slate-200 hover:border-emerald-300',
        iconBg: 'bg-emerald-500/10 text-emerald-600',
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        buttonText: 'Acessar Chamada'
      },
      {
        title: 'Apontamento de Notas',
        category: 'Boletim & Rendimento',
        description: 'Digitação das notas das avaliações, trabalhos e cálculo das médias semestrais.',
        icon: BookOpen,
        path: '/grades',
        accentColor: 'indigo',
        bg: 'bg-white hover:bg-indigo-50/40',
        borderColor: 'border-slate-200 hover:border-indigo-300',
        iconBg: 'bg-indigo-500/10 text-indigo-600',
        badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        buttonText: 'Lançar Notas'
      }
    ];

    return (
      <div className="space-y-8 p-1">
        {/* Cabeçalho do Professor */}
        <PageHeader
          title="Portal do Professor"
          description="Painel pedagógico exclusivo para lançamento de frequência e notas escolares."
          icon={GraduationCap}
        >
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200/80 rounded-xl shadow-xs">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'P'}
            </div>
            <div className="text-left">
              <span className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wide block leading-tight">
                {profile?.name || 'Professor(a)'}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">
                  Professor / Docente
                </span>
              </div>
            </div>
          </div>
        </PageHeader>

        {/* Alerta de Escopo do Professor e Conflito de Unidade */}
        {teacherScope && (
          <TeacherScopeBanner scope={teacherScope} availableClassesCount={teacherScope.allowedClassIds.size} />
        )}

        {/* Modal de Alerta de Conexão */}
        {(syncError || !isConnected) && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative overflow-hidden bg-slate-900 border-2 border-red-500 rounded-2xl shadow-2xl max-w-md w-full p-8 text-white flex flex-col items-center text-center"
            >
              <div className="relative mb-6">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-20 animate-ping" />
                <div className="relative p-5 bg-red-600 text-white rounded-full border border-red-400 shadow-lg shadow-red-600/30 flex items-center justify-center">
                  <AlertTriangle size={36} className="animate-bounce" />
                </div>
              </div>
              
              <span className="px-3 py-1 bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-full mb-3">
                Alerta de Conectividade
              </span>
              
              <h5 className="text-lg font-black uppercase tracking-wider text-white leading-tight">
                Falha de Conexão com o Servidor
              </h5>
              
              <p className="text-xs font-medium text-slate-300 mt-3 leading-relaxed">
                Ocorreu um erro de rede ou instabilidade ao comunicar-se com a base de dados central.
              </p>
              
              <div className="my-4 px-4 py-3 bg-red-950/50 border border-red-900/50 rounded-lg w-full text-left">
                <span className="text-[8px] font-bold text-red-400 uppercase tracking-widest block mb-0.5">Detalhes da conexão:</span>
                <p className="text-[11px] font-mono text-red-200 break-words">{syncError || connError || 'Dispositivo offline ou rede instável.'}</p>
              </div>

              <div className="flex flex-col gap-2 w-full mt-2">
                <button
                  onClick={async () => {
                    try {
                      await testConnection();
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  disabled={isRefreshing}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white font-black text-xs rounded-xl transition-all shadow-lg uppercase tracking-widest cursor-pointer"
                >
                  Tentar Reconectar Agora
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 2 Botões ao Centro da Tela */}
        <div className="max-w-3xl mx-auto pt-4 pb-8 space-y-6">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
              Atividades Pedagógicas
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Selecione o módulo que deseja acessar para realizar seus registros:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {teacherCards.map((card, idx) => (
              <motion.div
                key={card.path}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.08 }}
              >
                <button
                  onClick={() => navigate(card.path)}
                  className={cn(
                    "w-full text-left p-7 sm:p-8 rounded-2xl border transition-all duration-300 group cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between min-h-[220px]",
                    card.bg,
                    card.borderColor
                  )}
                >
                  <div>
                    {/* Top Row: Icon + Badge + Arrow */}
                    <div className="flex items-center justify-between mb-5">
                      <div className={cn("p-3.5 rounded-xl transition-transform duration-300 group-hover:scale-110", card.iconBg)}>
                        <card.icon size={28} strokeWidth={2.2} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border", card.badgeBg)}>
                          {card.category}
                        </span>
                        <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-[#131b2e] text-slate-400 group-hover:text-white flex items-center justify-center transition-all duration-300">
                          <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>

                    {/* Title and Description */}
                    <h4 className="text-xl font-black text-slate-800 tracking-tight group-hover:text-slate-950 transition-colors uppercase">
                      {card.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2">
                      {card.description}
                    </p>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600 group-hover:text-slate-900">
                    <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                      {card.buttonText}
                    </span>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-slate-700">
                      Entrar →
                    </span>
                  </div>
                </button>
              </motion.div>
            ))}
          </div>

          {/* Rodapé Informativo */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center gap-3 text-slate-500 text-xs">
            <div className="p-2 bg-slate-200/80 rounded-lg text-slate-600 shrink-0">
              <Info size={16} />
            </div>
            <p className="text-[11px] leading-relaxed font-medium">
              Todos os lançamentos de notas e chamadas são sincronizados em tempo real com a base de dados da instituição.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-1">

      {(syncError || !isConnected) && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative overflow-hidden bg-slate-900 border-2 border-red-500 rounded-2xl shadow-2xl max-w-md w-full p-8 text-white flex flex-col items-center text-center"
          >
            {/* Fundo listrado de advertência sutil */}
            <div className="absolute inset-0 bg-[linear-gradient(45deg,#ff000005_25%,transparent_25%,transparent_50%,#ff000005_50%,#ff000005_75%,transparent_75%,transparent)] bg-[size:30px_30px] opacity-40 pointer-events-none" />
            
            <div className="relative mb-6">
              {/* Anéis de pulso de perigo */}
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-20 animate-ping" />
              <div className="relative p-5 bg-red-600 text-white rounded-full border border-red-400 shadow-lg shadow-red-600/30 flex items-center justify-center">
                <AlertTriangle size={36} className="animate-bounce" />
              </div>
            </div>
            
            <span className="px-3 py-1 bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-full mb-3">
              Alerta de Conectividade
            </span>
            
            <h5 className="text-lg font-black uppercase tracking-wider text-white leading-tight">
              Falha de Conexão com o Servidor
            </h5>
            
            <p className="text-xs font-medium text-slate-300 mt-3 leading-relaxed">
              Ocorreu um erro de rede ou instabilidade ao comunicar-se com a base de dados central.
            </p>
            
            <div className="my-4 px-4 py-3 bg-red-950/50 border border-red-900/50 rounded-lg w-full text-left">
              <span className="text-[8px] font-bold text-red-400 uppercase tracking-widest block mb-0.5">Detalhes da conexão:</span>
              <p className="text-[11px] font-mono text-red-200 break-words">{syncError || connError || 'Dispositivo offline ou rede instável.'}</p>
            </div>
            
            <p className="text-xs text-slate-400 font-medium mb-2">
              Como este sistema opera de modo 100% online, é necessário estabelecer contato estável com o servidor principal para assegurar a integridade das operações.
            </p>

            <p className="text-xs text-red-400 font-semibold mb-6">
              Se o problema persistir, sugerimos atualizar a página (F5) ou fechar o sistema e tentar novamente mais tarde.
            </p>
 
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={async () => {
                  try {
                    await testConnection();
                    await fetchStats();
                  } catch (e) {
                    console.error(e);
                  }
                }}
                disabled={isRefreshing}
                className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-800 active:scale-[0.98] text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-red-600/40 uppercase tracking-widest border border-red-500 cursor-pointer flex items-center justify-center gap-2"
              >
                {isRefreshing ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Tentando reconectar...
                  </>
                ) : (
                  'Tentar Reconectar Agora'
                )}
              </button>

              <button
                onClick={async () => {
                  try {
                    await logout();
                    navigate('/login');
                  } catch (err) {
                    console.error('Erro ao sair do sistema:', err);
                  }
                }}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-[10px] rounded-xl transition-all uppercase tracking-widest border border-slate-700 cursor-pointer"
              >
                Sair / Fechar Sistema
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Module Header for Admin Dashboard */}
      <PageHeader
        title="Painel de Controle"
        description="Indicadores acadêmicos, estatísticas e visão operacional da instituição."
        icon={Activity}
        badge="Administração"
      />

      {/* Acesso Rápido - Botões com Estilo Leve, Limpo e Moderno */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2.5"
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-blue-600 rounded-full inline-block" />
            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Acesso Rápido</h4>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-3 sm:gap-3.5">
          {(isTeacher ? [
            { 
              label: 'Lançar Chamada', 
              subtitle: 'Frequência diária',
              icon: UserCheck, 
              path: '/attendance', 
              iconColor: 'text-emerald-700', 
              iconBg: 'bg-emerald-50 border border-emerald-100',
              hoverBorder: 'hover:border-emerald-300',
            },
            { 
              label: 'Lista de Frequência', 
              subtitle: 'Controle mensal',
              icon: Calendar, 
              path: '/monthly-attendance', 
              iconColor: 'text-blue-700', 
              iconBg: 'bg-blue-50 border border-blue-100',
              hoverBorder: 'hover:border-blue-300',
            },
            { 
              label: 'Apontamento de Notas', 
              subtitle: 'Médias e notas',
              icon: BookOpen, 
              path: '/grades', 
              iconColor: 'text-indigo-700', 
              iconBg: 'bg-indigo-50 border border-indigo-100',
              hoverBorder: 'hover:border-indigo-300',
            },
            { 
              label: 'Cadastrar Avaliações', 
              subtitle: 'Provas e trabalhos',
              icon: GraduationCap, 
              path: '/assessments', 
              iconColor: 'text-amber-700', 
              iconBg: 'bg-amber-50 border border-amber-100',
              hoverBorder: 'hover:border-amber-300',
            }
          ] : [
            { 
              label: 'Matricular', 
              subtitle: 'Novo aluno',
              icon: UserPlus, 
              path: '/students', 
              state: { action: 'new' },
              iconColor: 'text-blue-700', 
              iconBg: 'bg-blue-50 border border-blue-100',
              hoverBorder: 'hover:border-blue-300',
            },
            { 
              label: 'Controle e Histórico', 
              subtitle: 'Ficha acadêmica',
              icon: UserCircle, 
              path: '/student-ficha', 
              iconColor: 'text-rose-700', 
              iconBg: 'bg-rose-50 border border-rose-100',
              hoverBorder: 'hover:border-rose-300',
            },
            { 
              label: 'Gerar Impressos', 
              subtitle: 'Relatórios e listas',
              icon: Printer, 
              path: '/impressos', 
              iconColor: 'text-sky-700', 
              iconBg: 'bg-sky-50 border border-sky-100',
              hoverBorder: 'hover:border-sky-300',
            },
            { 
              label: 'Turmas / Classes', 
              subtitle: 'Gestão escolar',
              icon: GraduationCap, 
              path: '/classes', 
              iconColor: 'text-emerald-700', 
              iconBg: 'bg-emerald-50 border border-emerald-100',
              hoverBorder: 'hover:border-emerald-300',
            },
            { 
              label: 'Calendário', 
              subtitle: 'Cronograma letivo',
              icon: Calendar, 
              path: '/calendar', 
              iconColor: 'text-amber-700', 
              iconBg: 'bg-amber-50 border border-amber-100',
              hoverBorder: 'hover:border-amber-300',
            },
            { 
              label: 'Contribuições', 
              subtitle: 'Financeiro e taxas',
              icon: Wallet, 
              path: '/contributions', 
              iconColor: 'text-violet-700', 
              iconBg: 'bg-violet-50 border border-violet-100',
              hoverBorder: 'hover:border-violet-300',
            },
            { 
              label: 'Rel. Financeiro', 
              subtitle: 'Previsto e efetuado',
              icon: DollarSign, 
              path: '/financial-report', 
              iconColor: 'text-emerald-700', 
              iconBg: 'bg-emerald-50 border border-emerald-100',
              hoverBorder: 'hover:border-emerald-300',
            }
          ].filter(item => canAccess(item.path))).map((item, i) => (
            <button 
              key={i}
              onClick={() => {
                if (item.path !== '#') {
                  navigate(item.path, item.state ? { state: item.state } : undefined);
                }
              }}
              style={{ borderRadius: '20px' }}
              className={cn(
                "flex flex-col items-center justify-center p-2 sm:p-2.5 w-[100px] h-[100px] sm:w-[108px] sm:h-[108px] shrink-0 rounded-2xl sm:rounded-3xl transition-all duration-200 text-center group cursor-pointer bg-white border border-slate-200 shadow-2xs hover:shadow-md hover:border-slate-300 hover:-translate-y-1 active:scale-[0.98]",
                item.hoverBorder
              )}
            >
              <div 
                style={{ borderRadius: '12px' }}
                className={cn("w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 shrink-0 shadow-2xs mb-1.5", item.iconBg)}
              >
                <item.icon size={18} className={cn("shrink-0", item.iconColor)} />
              </div>
              <div className="min-w-0 w-full px-1">
                <span className="text-[10.5px] sm:text-[11px] font-bold text-slate-800 group-hover:text-blue-900 transition-colors leading-tight block truncate">
                  {item.label}
                </span>
                <span className="text-[8.5px] sm:text-[9px] text-slate-400 font-medium leading-tight block truncate mt-0.5">
                  {item.subtitle}
                </span>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Ocupação Acadêmica - Ajustada em 3 por linha */}
      <motion.div
        ref={academicOccupationRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={cn(
          "rounded-xl border shadow-2xs relative [overflow-anchor:none] transition-all",
          unitTheme.frameBorder,
          unitTheme.frameBorderTop,
          unitTheme.frameBg
        )}
        style={{ overflowAnchor: 'none' }}
      >
        <div className={cn(
          "px-5 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-20 rounded-t-xl bg-white/95 backdrop-blur-xs transition-colors",
          unitTheme.frameBorder
        )}>
          <div className="flex items-center gap-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs", unitTheme.iconBox)}>
              <Activity size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={cn("text-sm font-bold", unitTheme.textDark)}>Ocupação Acadêmica & Indicadores Financeiros</h3>
              </div>
              <p className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                {studentsByClass.filter(c => !c.unallocated).length} Turmas {selectedAcademicYear === 'Todos' ? '(Todos os Anos)' : selectedAcademicYear === 'ATUAL' ? '(Ciclo Atual 2026)' : `(Ano Letivo ${selectedAcademicYear})`}
              </p>
            </div>
          </div>

          {/* Barra de Controles Unificada, Moderna e sem Bordas Marcantes */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Atalho de Habilitações quando o banner foi dispensado temporariamente */}
            {selectedAcademicYear !== 'Todos' && 
             selectedAcademicYear !== 'ATUAL' && 
             parseInt(selectedAcademicYear, 10) > 2026 && 
             dismissedNoticeYears.includes(selectedAcademicYear) && (
              <button
                type="button"
                onClick={() => {
                  setTargetHabilitationYear(selectedAcademicYear);
                  setShowHabilitationModal(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 transition-all cursor-pointer select-none shadow-2xs"
                title={`Gerenciar Habilitações de Turmas para ${selectedAcademicYear}`}
              >
                <Sparkles size={13} className="text-amber-600" />
                <span className="hidden sm:inline">Habilitações {selectedAcademicYear}</span>
              </button>
            )}

            <div className="inline-flex items-center p-1 bg-slate-100/80 rounded-xl">
              {/* Seletor de Modo: Gráficos vs Cards */}
              <button
                type="button"
                onClick={() => setAcademicViewMode('charts')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none",
                  academicViewMode === 'charts'
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                )}
                title="Visualizar Gráficos (Ocupação, Contribuições e Inadimplência Acumulada)"
              >
                <PieChartIcon size={13} className={cn("shrink-0", academicViewMode === 'charts' ? "text-blue-600" : "text-slate-400")} />
                <span>Gráficos</span>
              </button>
              <button
                type="button"
                onClick={() => setAcademicViewMode('cards')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none",
                  academicViewMode === 'cards'
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                )}
                title="Visualizar Cards das Turmas"
              >
                <LayoutGrid size={13} className={cn("shrink-0", academicViewMode === 'cards' ? "text-blue-600" : "text-slate-400")} />
                <span>Cards</span>
              </button>

              <div className="w-px h-3.5 bg-slate-200 mx-1 shrink-0" />

              {/* Toggle Visibilidade das Matérias (visível apenas no modo Cards) */}
              {academicViewMode === 'cards' && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleDisciplines}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none",
                      showDisciplines
                        ? `${unitTheme.buttonSecondary} shadow-xs font-bold`
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                    )}
                    title={showDisciplines ? "Ocultar lista de matérias das turmas" : "Exibir lista de matérias das turmas"}
                  >
                    {showDisciplines ? (
                      <BookOpen size={14} className={cn("shrink-0", unitTheme.textAccent)} />
                    ) : (
                      <Book size={14} className="text-slate-400 shrink-0" />
                    )}
                    <span>Matérias</span>
                    <span 
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all",
                        showDisciplines ? `${unitTheme.dotIndicator} scale-100` : "bg-slate-300 scale-75"
                      )} 
                    />
                  </button>
                  <div className="w-px h-3.5 bg-slate-200 mx-1 shrink-0" />
                </>
              )}

              {/* Navegador de Ano Letivo com Popover Flutuante */}
              <div className="relative" ref={yearDropdownRef}>
                {(() => {
                  const activeYr = selectedAcademicYear === 'ATUAL' ? '2026' : selectedAcademicYear;
                  const currentYrIdx = availableAcademicYears.indexOf(activeYr);
                  const isAtOldest = selectedAcademicYear !== 'Todos' && (currentYrIdx === availableAcademicYears.length - 1 || currentYrIdx === -1);
                  const isAtNewest = selectedAcademicYear !== 'Todos' && currentYrIdx === 0;

                  const handlePrevYear = () => {
                    if (selectedAcademicYear === 'Todos') {
                      setSelectedAcademicYear('2026');
                      return;
                    }
                    if (currentYrIdx !== -1 && currentYrIdx < availableAcademicYears.length - 1) {
                      setSelectedAcademicYear(availableAcademicYears[currentYrIdx + 1]);
                    }
                  };

                  const handleNextYear = () => {
                    if (selectedAcademicYear === 'Todos') {
                      setSelectedAcademicYear('2026');
                      return;
                    }
                    if (currentYrIdx > 0) {
                      setSelectedAcademicYear(availableAcademicYears[currentYrIdx - 1]);
                    }
                  };

                  return (
                    <div className="flex items-center gap-0.5">
                      {/* Botão Ano Anterior */}
                      <button
                        type="button"
                        disabled={isAtOldest}
                        onClick={handlePrevYear}
                        className={cn(
                          "p-1.5 rounded-lg transition-all cursor-pointer select-none",
                          isAtOldest
                            ? "text-slate-300 cursor-not-allowed opacity-30"
                            : "text-slate-500 hover:text-slate-900 hover:bg-white/70 active:scale-95"
                        )}
                        title={
                          isAtOldest
                            ? `Primeiro ano cadastrado: ${activeYr}`
                            : "Voltar para o ano letivo anterior"
                        }
                      >
                        <ChevronLeft size={14} />
                      </button>

                      {/* Botão Seletor com Rótulo e Dropdown Moderno */}
                      <button
                        type="button"
                        onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none",
                          isYearDropdownOpen
                            ? "bg-white text-blue-900 shadow-xs"
                            : "text-slate-700 hover:text-slate-900 hover:bg-white/60"
                        )}
                        title="Clique para selecionar outro ano letivo"
                      >
                        <Calendar size={12} className="text-slate-400" />
                        <span>
                          {selectedAcademicYear === 'Todos' 
                            ? 'Todos os Anos' 
                            : selectedAcademicYear === 'ATUAL' 
                            ? '2026' 
                            : selectedAcademicYear}
                        </span>
                        <ChevronDown 
                          size={12} 
                          className={cn(
                            "text-slate-400 transition-transform duration-200", 
                            isYearDropdownOpen && "rotate-180 text-blue-600"
                          )} 
                        />
                      </button>

                      {/* Botão Próximo Ano */}
                      <button
                        type="button"
                        disabled={isAtNewest}
                        onClick={handleNextYear}
                        className={cn(
                          "p-1.5 rounded-lg transition-all cursor-pointer select-none",
                          isAtNewest
                            ? "text-slate-300 cursor-not-allowed opacity-30"
                            : "text-slate-500 hover:text-slate-900 hover:bg-white/70 active:scale-95"
                        )}
                        title={
                          isAtNewest
                            ? `Último ano cadastrado: ${activeYr}`
                            : "Avançar para o próximo ano letivo"
                        }
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  );
                })()}

                {/* Dropdown Flutuante Moderno e Limpo */}
                <AnimatePresence>
                  {isYearDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl shadow-slate-900/10 border border-slate-100 p-1.5 z-50 overflow-hidden"
                    >
                      <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Ano Letivo
                      </div>
                      
                      {/* Opção Ano Atual 2026 */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAcademicYear('ATUAL');
                          setIsYearDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left",
                          selectedAcademicYear === 'ATUAL' || selectedAcademicYear === '2026'
                            ? "bg-blue-50/80 text-blue-900"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span>2026</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                            Atual
                          </span>
                        </span>
                        {(selectedAcademicYear === 'ATUAL' || selectedAcademicYear === '2026') && (
                          <Check size={13} className="text-blue-600" />
                        )}
                      </button>

                      {/* Demais Anos Disponíveis */}
                      {availableAcademicYears
                        .filter(yr => yr !== '2026')
                        .map(yr => {
                          const isFuture = parseInt(yr, 10) > 2026;
                          const isSelected = selectedAcademicYear === yr;
                          return (
                            <button
                              key={yr}
                              type="button"
                              onClick={() => {
                                setSelectedAcademicYear(yr);
                                setIsYearDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left",
                                isSelected
                                  ? "bg-blue-50/80 text-blue-900"
                                  : "text-slate-700 hover:bg-slate-50"
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <span>{yr}</span>
                                {isFuture && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                    Planejamento
                                  </span>
                                )}
                              </span>
                              {isSelected && <Check size={13} className="text-blue-600" />}
                            </button>
                          );
                        })}

                      <div className="h-px bg-slate-100 my-1" />

                      {/* Opção Todos os Anos */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAcademicYear('Todos');
                          setIsYearDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left",
                          selectedAcademicYear === 'Todos'
                            ? "bg-blue-50/80 text-blue-900"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        <span>Todos os Anos</span>
                        {selectedAcademicYear === 'Todos' && <Check size={13} className="text-blue-600" />}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
        
        {/* Aviso de Planejamento Futuro (ex: 2027) - Temporário com Auto-fechamento */}
        <AnimatePresence>
          {selectedAcademicYear !== 'Todos' && 
           selectedAcademicYear !== 'ATUAL' && 
           parseInt(selectedAcademicYear, 10) > 2026 && 
           !dismissedNoticeYears.includes(selectedAcademicYear) && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mx-4 sm:mx-6 mt-3 bg-amber-50/90 border border-amber-200/90 rounded-xl overflow-hidden shadow-2xs relative">
                <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 pr-6 sm:pr-0">
                    <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                      <Info size={15} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-amber-950 leading-tight">
                          Planejamento do Ano Letivo {selectedAcademicYear}
                        </p>
                        <span className="text-[9px] font-bold text-amber-800 bg-amber-200/70 border border-amber-300/60 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                          Aviso temporário (fecha em {noticeSecondsLeft}s)
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800/90 leading-relaxed mt-1">
                        No momento vigente (2026), turmas de ciclos anteriores não constam automaticamente até serem expressamente habilitadas para o ciclo de {selectedAcademicYear}.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetHabilitationYear(selectedAcademicYear);
                        setShowHabilitationModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider shrink-0 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <Sparkles size={13} />
                      <span>Habilitações {selectedAcademicYear}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissNotice(selectedAcademicYear)}
                      className="p-1.5 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                      title="Dispensar aviso agora"
                      aria-label="Fechar aviso"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Barra de progresso temporal sutil */}
                <div className="h-0.5 w-full bg-amber-100 overflow-hidden">
                  <motion.div 
                    initial={{ width: '100%' }}
                    animate={{ width: `${(noticeSecondsLeft / 8) * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                    className="h-full bg-amber-500"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {academicViewMode === 'charts' ? (
          <div 
            className={cn(
              "p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 [overflow-anchor:none] rounded-b-xl transition-colors",
              unitTheme.frameBg
            )}
            style={{ overflowAnchor: 'none' }}
          >
            {/* Metade 1: Gráfico Tipo Pizza (Distribuição e Ocupação das Turmas) */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
              <div>
                {/* Cabeçalho do Card Pizza */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                      <PieChartIcon size={15} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Ocupação por Turma
                      </h4>
                      <p className="text-[10px] text-slate-500 font-medium">
                        Distribuição de alunos matriculados
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    {studentsByClass.filter(c => !c.unallocated).length} {studentsByClass.filter(c => !c.unallocated).length === 1 ? 'Turma' : 'Turmas'}
                  </span>
                </div>

                {/* Gráfico Tipo Pizza / Donut com Indicador Central */}
                {pieOccupationData.length > 0 ? (
                  <div className="relative flex items-center justify-center py-2">
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900/95 backdrop-blur-xs text-white p-2.5 rounded-xl shadow-xl border border-slate-700/80 text-xs">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: data.color }} />
                                    <span className="font-bold text-slate-100">{data.code} - {data.name}</span>
                                  </div>
                                  <div className="space-y-1 text-slate-300 text-[11px]">
                                    <div className="flex justify-between gap-4">
                                      <span>Alunos:</span>
                                      <span className="font-bold text-white">{data.count} alunos</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <span>Participação:</span>
                                      <span className="font-bold text-emerald-400">{data.percentage}%</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Pie
                          data={pieOccupationData}
                          dataKey="count"
                          nameKey="code"
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={88}
                          paddingAngle={3}
                          stroke="#ffffff"
                          strokeWidth={2}
                        >
                          {pieOccupationData.map((entry, index) => (
                            <Cell key={`pie-cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Rótulo Central do Donut */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-black text-slate-800 tracking-tight leading-none">
                        {pieOccupationData.reduce((acc, c) => acc + c.count, 0)}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                        Alunos
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs font-medium">
                    Nenhum aluno alocado para exibir no gráfico.
                  </div>
                )}

                {/* Legenda Detalhada e Clicável das Turmas */}
                <div className="mt-2 pt-2.5 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {pieOccupationData.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleViewStudents(item.id, item.name, !!item.unallocated)}
                        className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200 text-left group cursor-pointer"
                        title={`Clique para ver os alunos da turma ${item.name}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 pr-1">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-[11px] font-bold text-slate-700 truncate group-hover:text-blue-900 transition-colors">
                            {item.code}
                          </span>
                          <span className="text-[9.5px] text-slate-400 truncate">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-1.5">
                          <span className="text-[11px] font-bold text-slate-800">{item.count}</span>
                          <span className="text-[9.5px] text-slate-400">({item.percentage}%)</span>
                          <Eye size={11} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rodapé do Card Pizza */}
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                <span>Clique em qualquer turma para listar seus alunos</span>
                <span className="font-semibold text-slate-600">
                  {displayStats.students.active} ativos no total
                </span>
              </div>
            </div>

            {/* Metade 2: Gráfico Tipo Torres (Contribuições do Mês por Turma com Navegador Mensal) */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
              <div>
                {/* Cabeçalho do Card Torres com Navegador Mensal */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <BarChart3 size={15} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Contribuições do Mês por Turma
                      </h4>
                      <p className="text-[10px] text-slate-500 font-medium">
                        Arrecadação mensal por coorte
                      </p>
                    </div>
                  </div>

                  {/* Navegador Mensal Interativo com Anterior, Seletor e Próximo */}
                  <div className="flex items-center gap-0.5 bg-slate-100/90 p-1 rounded-xl shrink-0 self-start sm:self-auto border border-slate-200/60 shadow-2xs">
                    <button
                      type="button"
                      onClick={handlePrevContributionMonth}
                      className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer select-none"
                      title="Mês anterior"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <div className="flex items-center gap-1 px-1">
                      <select
                        value={selectedContributionMonth}
                        onChange={(e) => setSelectedContributionMonth(Number(e.target.value))}
                        className="bg-transparent text-[11px] font-bold text-slate-800 cursor-pointer focus:outline-hidden py-0.5"
                        aria-label="Selecionar mês de referência"
                      >
                        {MONTH_NAMES_LIST.map((name, idx) => (
                          <option key={idx} value={idx + 1}>{name}</option>
                        ))}
                      </select>
                      <span className="text-slate-400 text-xs font-bold">/</span>
                      <select
                        value={selectedContributionYear}
                        onChange={(e) => setSelectedContributionYear(Number(e.target.value))}
                        className="bg-transparent text-[11px] font-bold text-slate-800 cursor-pointer focus:outline-hidden py-0.5"
                        aria-label="Selecionar ano de referência"
                      >
                        {availableContributionYears.map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleNextContributionMonth}
                      className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer select-none"
                      title="Próximo mês"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Faixa com Resumo Financeiro do Mês Selecionado */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50/90 rounded-lg border border-slate-100 mb-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Total no Mês:
                    </span>
                    <span className="text-sm font-black text-emerald-700 tabular-nums">
                      {formatCurrency(monthlyClassContributions.totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200/80 shadow-2xs">
                      {monthlyClassContributions.totalCount} {monthlyClassContributions.totalCount === 1 ? 'recebimento' : 'recebimentos'}
                    </span>
                    {!isCurrentContributionMonth && (
                      <button
                        type="button"
                        onClick={handleCurrentContributionMonth}
                        className="text-[9px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        Mês Atual
                      </button>
                    )}
                  </div>
                </div>

                {/* Gráfico de Torres / Colunas */}
                <div className="w-full">
                  <ResponsiveContainer width="100%" height={215}>
                    <BarChart
                      data={monthlyClassContributions.bars}
                      margin={{ top: 12, right: 10, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                        interval={0}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900/95 backdrop-blur-xs text-white p-2.5 rounded-xl shadow-xl border border-slate-700/80 text-xs">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: data.color }} />
                                  <span className="font-bold text-slate-100">{data.code} - {data.name}</span>
                                </div>
                                <div className="space-y-1 text-slate-300 text-[11px]">
                                  <div className="flex justify-between gap-4">
                                    <span>Total no Mês:</span>
                                    <span className="font-bold text-emerald-400">{formatCurrency(data.total)}</span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span>Contribuições:</span>
                                    <span className="font-bold text-white">{data.count} pagamentos</span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span>Alunos na Turma:</span>
                                    <span className="font-bold text-slate-300">{data.studentCount} alunos</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar
                        dataKey="total"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={44}
                      >
                        {monthlyClassContributions.bars.map((entry, index) => (
                          <Cell key={`bar-cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Rodapé do Card Torres */}
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                <span>
                  {monthlyClassContributions.totalAmount > 0
                    ? `Líder: ${[...monthlyClassContributions.bars].sort((a,b) => b.total - a.total)[0]?.code || '---'}`
                    : `Sem lançamentos em ${MONTH_NAMES_LIST[selectedContributionMonth - 1]}`}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/financial-report')}
                  className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <span>Relatório Financeiro</span>
                  <ArrowRight size={11} />
                </button>
              </div>
            </div>

            {/* Bloco 3: Gráfico de Barras e Análise Avançada: Previsto vs Realizado (Mensal, Semestral e Anual) */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
              <div>
                {/* Cabeçalho do Card com Controles de Navegação e Filtros */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100/80 shadow-2xs">
                      <BarChart3 size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                          Previsto vs. Realizado (Contribuições)
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {financialChartMode === 'monthly' ? 'Visão Mensal' : financialChartMode === 'semester' ? 'Visão Semestral' : 'Visão Anual'}
                        </span>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">
                        {financialChartMode === 'monthly'
                          ? 'Acompanhamento mês a mês com comparativo entre antecessor, mês em foco e posterior'
                          : financialChartMode === 'semester'
                            ? `Resumo do ${delinquencyMonthlyData.activeSemesterSummary.title} (${delinquencyMonthlyData.activeSemesterSummary.periodLabel}) com valores mês a mês e totais`
                            : 'Resultado consolidado dos 12 meses do ano com demonstrativo analítico e saldo da diferença'}
                      </p>
                    </div>
                  </div>

                  {/* Barra de Controles: Abas (Mensal / Semestral / Anual), Turma e Ano */}
                  <div className="flex items-center flex-wrap gap-2">
                    {/* Seletor de Modo: Mensal / Semestral / Anual */}
                    <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setFinancialChartMode('monthly')}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none",
                          financialChartMode === 'monthly'
                            ? "bg-white text-blue-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                        title="Navegar mês a mês comparando com antecessor e posterior"
                      >
                        <Calendar size={12} className={financialChartMode === 'monthly' ? "text-blue-600" : "text-slate-400"} />
                        <span>Mensal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFinancialChartMode('semester')}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none",
                          financialChartMode === 'semester'
                            ? "bg-white text-blue-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                        title="Resumo do 1º ou 2º semestre com totais e mês a mês"
                      >
                        <Layers size={12} className={financialChartMode === 'semester' ? "text-blue-600" : "text-slate-400"} />
                        <span>Semestral</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFinancialChartMode('annual')}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none",
                          financialChartMode === 'annual'
                            ? "bg-white text-blue-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                        title="Resultado consolidado anual dos 12 meses e saldo da diferença"
                      >
                        <TrendingUp size={12} className={financialChartMode === 'annual' ? "text-blue-600" : "text-slate-400"} />
                        <span>Anual</span>
                      </button>
                    </div>

                    {/* Filtro de Turma */}
                    <div className="flex items-center gap-1 bg-slate-100/90 px-2 py-1 rounded-xl border border-slate-200/60 shadow-2xs">
                      <GraduationCap size={13} className="text-slate-500 shrink-0" />
                      <select
                        value={delinquencyClassFilter}
                        onChange={(e) => setDelinquencyClassFilter(e.target.value)}
                        className="bg-transparent text-[11px] font-bold text-slate-800 cursor-pointer focus:outline-hidden max-w-[130px] truncate"
                        aria-label="Filtrar por turma"
                      >
                        <option value="all">Todas as Turmas</option>
                        {scopedClasses
                          .filter(c => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo')
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                          ))}
                      </select>
                    </div>

                    {/* Seletor de Ano */}
                    <div className="flex items-center gap-1 bg-slate-100/90 px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs">
                      <Calendar size={13} className="text-slate-500 shrink-0" />
                      <select
                        value={delinquencyYear}
                        onChange={(e) => setDelinquencyYear(Number(e.target.value))}
                        className="bg-transparent text-[11px] font-bold text-slate-800 cursor-pointer focus:outline-hidden"
                        aria-label="Selecionar ano de referência"
                      >
                        {availableContributionYears.map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ========================================================
                    MODALIDADE 1: VISÃO MENSAL (COMPARAÇÃO ANTECESSOR E POSTERIOR)
                   ======================================================== */}
                {financialChartMode === 'monthly' && (
                  <div className="space-y-3.5 mb-4">
                    {/* Barra de Navegação Mês a Mês */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                          Mês em Análise:
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedComparisonMonth(prev => Math.max(1, prev - 1))}
                            disabled={selectedComparisonMonth === 1}
                            className="p-1 rounded bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none border border-slate-200 shadow-2xs cursor-pointer"
                            title="Mês anterior"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="px-2.5 py-0.5 bg-blue-600 text-white rounded text-xs font-black shadow-2xs">
                            {MONTH_NAMES_LIST[selectedComparisonMonth - 1]} / {delinquencyYear}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedComparisonMonth(prev => Math.min(12, prev + 1))}
                            disabled={selectedComparisonMonth === 12}
                            className="p-1 rounded bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none border border-slate-200 shadow-2xs cursor-pointer"
                            title="Próximo mês"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Seletor rápido de meses (Pills Jan a Dez) */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                        {MONTH_SHORT_LABELS.map((label, idx) => {
                          const mNum = idx + 1;
                          const isSel = selectedComparisonMonth === mNum;
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setSelectedComparisonMonth(mNum)}
                              className={cn(
                                "px-2 py-1 rounded-md text-[10px] font-bold transition-all shrink-0 cursor-pointer",
                                isSel
                                  ? "bg-blue-600 text-white shadow-2xs scale-105"
                                  : "bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200/70"
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Alternadores: Escopo Trio vs 12 Meses & Mês Isolado vs Acumulado */}
                      <div className="flex items-center gap-1.5 self-start md:self-auto shrink-0 flex-wrap">
                        {/* Trio vs 12 Meses */}
                        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200/80">
                          <button
                            type="button"
                            onClick={() => setMonthlyChartScope('trio')}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer",
                              monthlyChartScope === 'trio'
                                ? "bg-blue-50 text-blue-700 font-black"
                                : "text-slate-500 hover:text-slate-800"
                            )}
                          >
                            Foco Trio (M-1, M, M+1)
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonthlyChartScope('all')}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer",
                              monthlyChartScope === 'all'
                                ? "bg-blue-50 text-blue-700 font-black"
                                : "text-slate-500 hover:text-slate-800"
                            )}
                          >
                            12 Meses
                          </button>
                        </div>

                        {/* Mês Isolado vs Acumulado no Ano */}
                        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200/80">
                          <button
                            type="button"
                            onClick={() => setMonthlyDisplayType('regular')}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer",
                              monthlyDisplayType === 'regular'
                                ? "bg-emerald-50 text-emerald-800 font-black"
                                : "text-slate-500 hover:text-slate-800"
                            )}
                          >
                            Mês a Mês
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonthlyDisplayType('accumulated')}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer",
                              monthlyDisplayType === 'accumulated'
                                ? "bg-blue-50 text-blue-800 font-black"
                                : "text-slate-500 hover:text-slate-800"
                            )}
                          >
                            Acumulado no Ano
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Cards de Síntese do Mês Selecionado */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* Previsto no Mês */}
                      <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                              Previsto a Receber
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                              {delinquencyMonthlyData.comparison.selectedMonth.monthShort}
                            </span>
                          </div>
                          <div className="text-lg font-black text-blue-950 tabular-nums">
                            {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthPrevisto)}
                          </div>
                          <p className="text-[10px] text-blue-700 font-semibold mt-0.5">
                            Expectativa do plano curricular
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-blue-200/60 text-[10px] text-blue-900/80 flex justify-between">
                          <span>Acumulado no ano:</span>
                          <span className="font-bold">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.accumulatedPrevisto)}</span>
                        </div>
                      </div>

                      {/* Realizado no Mês */}
                      <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                              Realizado Recebido
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Efetivado
                            </span>
                          </div>
                          <div className="text-lg font-black text-emerald-950 tabular-nums">
                            {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthRealizado)}
                          </div>
                          <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                            {delinquencyMonthlyData.comparison.selectedMonth.contribCount} pagamento(s) computado(s)
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-emerald-200/60 text-[10px] text-emerald-900/80 flex justify-between">
                          <span>Acumulado no ano:</span>
                          <span className="font-bold">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.accumulatedRealizado)}</span>
                        </div>
                      </div>

                      {/* Saldo da Diferença */}
                      <div className={cn(
                        "p-3 rounded-xl border shadow-2xs flex flex-col justify-between",
                        delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0
                          ? "bg-amber-50/80 border-amber-200/80"
                          : "bg-slate-50 border-slate-200/80"
                      )}>
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? "text-amber-900" : "text-slate-800"
                            )}>
                              Saldo da Diferença
                            </span>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded",
                              delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0
                                ? "bg-amber-100 text-amber-900 border border-amber-200"
                                : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                            )}>
                              {delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? 'Pendente a Receber' : 'Quitado / Superávit'}
                            </span>
                          </div>
                          <div className={cn(
                            "text-lg font-black tabular-nums",
                            delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? "text-amber-950" : "text-slate-900"
                          )}>
                            {formatCurrency(Math.abs(delinquencyMonthlyData.comparison.selectedMonth.monthSaldo))}
                          </div>
                          <p className="text-[10px] font-semibold mt-0.5 text-slate-500">
                            {delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0
                              ? 'Diferença prevista a ser recebida'
                              : 'Totalmente realizado ou superavitário'}
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-600 flex justify-between">
                          <span>Saldo acum. no ano:</span>
                          <span className="font-bold text-slate-800">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.accumulatedSaldo)}</span>
                        </div>
                      </div>

                      {/* Taxa de Efetivação / Arrecadação */}
                      <div className="p-3 rounded-xl bg-violet-50/80 border border-violet-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-violet-900 uppercase tracking-wider">
                              Taxa de Efetivação
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                              Realizado / Previsto
                            </span>
                          </div>
                          <div className="text-lg font-black text-violet-950 tabular-nums">
                            {delinquencyMonthlyData.comparison.selectedMonth.rateRealizado}%
                          </div>
                          <p className="text-[10px] text-violet-700 font-semibold mt-0.5">
                            Atingimento da previsão no mês
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-violet-200/60 text-[10px] text-violet-900/80 flex justify-between">
                          <span>Efetivação acum. ano:</span>
                          <span className="font-bold">{delinquencyMonthlyData.comparison.selectedMonth.rateRealizadoAccum}%</span>
                        </div>
                      </div>
                    </div>

                    {/* COMPARATIVO DE 3 COLUNAS: ANTECESSOR vs SELECIONADO vs POSTERIOR */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Coluna 1: Mês Antecessor */}
                      <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                        {delinquencyMonthlyData.comparison.prevMonth ? (
                          <>
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                  Mês Antecessor (M - 1)
                                </span>
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                  {delinquencyMonthlyData.comparison.prevMonth.monthName}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-xs text-slate-500 font-medium">Previsto:</span>
                                <span className="text-sm font-bold text-slate-800">{formatCurrency(delinquencyMonthlyData.comparison.prevMonth.monthPrevisto)}</span>
                              </div>
                              <div className="flex items-baseline justify-between mt-1">
                                <span className="text-xs text-emerald-700 font-medium">Realizado:</span>
                                <span className="text-base font-black text-emerald-800">{formatCurrency(delinquencyMonthlyData.comparison.prevMonth.monthRealizado)}</span>
                              </div>
                              <div className="flex items-baseline justify-between mt-1 text-[11px]">
                                <span className="text-slate-500">Saldo da Diferença:</span>
                                <span className={cn(
                                  "font-bold",
                                  delinquencyMonthlyData.comparison.prevMonth.monthSaldo > 0 ? "text-amber-700" : "text-emerald-700"
                                )}>
                                  {formatCurrency(delinquencyMonthlyData.comparison.prevMonth.monthSaldo)}
                                </span>
                              </div>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-slate-200/70 space-y-1 text-[10.5px]">
                              <div className="flex justify-between text-slate-600">
                                <span>Taxa de Realização:</span>
                                <span className="font-bold text-slate-800">{delinquencyMonthlyData.comparison.prevMonth.rateRealizado}%</span>
                              </div>
                              <div className="flex justify-between text-slate-600">
                                <span>Acumulado até M-1:</span>
                                <span className="font-bold text-slate-800">{formatCurrency(delinquencyMonthlyData.comparison.prevMonth.accumulatedRealizado)}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedComparisonMonth(selectedComparisonMonth - 1)}
                                className="w-full mt-2 text-center text-[9.5px] font-bold text-blue-700 hover:text-blue-900 hover:underline pt-1 cursor-pointer"
                              >
                                ← Analisar este mês em foco
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-6 text-slate-400">
                            <span className="text-xs font-bold text-slate-600 mb-1">Início do Ano Letivo</span>
                            <span className="text-[10px]">Janeiro é o primeiro mês do ano letivo (não possui antecessor).</span>
                          </div>
                        )}
                      </div>

                      {/* Coluna 2: Mês Selecionado (Destaque Principal) */}
                      <div className="p-3.5 rounded-xl bg-blue-50/70 border-2 border-blue-500 shadow-xs flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-bl-lg">
                          Mês em Foco
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[11px] font-black text-blue-950 uppercase tracking-wider">
                              {delinquencyMonthlyData.comparison.selectedMonth.monthName} / {delinquencyYear}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-blue-800 font-medium">Previsto (A Receber):</span>
                            <span className="text-sm font-bold text-blue-950">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthPrevisto)}</span>
                          </div>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xs text-emerald-800 font-medium">Realizado (Recebido):</span>
                            <span className="text-xl font-black text-emerald-900">{formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthRealizado)}</span>
                          </div>
                          <div className="flex items-baseline justify-between mt-1 text-[11px]">
                            <span className="text-slate-700">Saldo da Diferença:</span>
                            <span className={cn(
                              "font-bold text-xs",
                              delinquencyMonthlyData.comparison.selectedMonth.monthSaldo > 0 ? "text-amber-800" : "text-emerald-800"
                            )}>
                              {formatCurrency(delinquencyMonthlyData.comparison.selectedMonth.monthSaldo)}
                            </span>
                          </div>
                        </div>

                        {/* Bloco de Variação comparativa vs Antecessor */}
                        <div className="mt-2.5 pt-2 border-t border-blue-200/80 space-y-1 text-[10.5px]">
                          {delinquencyMonthlyData.comparison.prevMonth ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600 font-medium">Variação Realizado vs M-1:</span>
                                {delinquencyMonthlyData.comparison.deltaRealizadoVsPrev !== null && (
                                  <span className={cn(
                                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[10px]",
                                    delinquencyMonthlyData.comparison.deltaRealizadoVsPrev >= 0
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  )}>
                                    {delinquencyMonthlyData.comparison.deltaRealizadoVsPrev >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                                    <span>
                                      {delinquencyMonthlyData.comparison.deltaRealizadoVsPrev >= 0 ? '+' : ''}
                                      {formatCurrency(delinquencyMonthlyData.comparison.deltaRealizadoVsPrev)}
                                      {delinquencyMonthlyData.comparison.deltaRealizadoPctVsPrev !== null ? ` (${delinquencyMonthlyData.comparison.deltaRealizadoPctVsPrev}%)` : ''}
                                    </span>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>Variação Previsto:</span>
                                <span className="font-semibold text-slate-700">
                                  {delinquencyMonthlyData.comparison.deltaPrevistoVsPrev !== null && (
                                    <>
                                      {delinquencyMonthlyData.comparison.deltaPrevistoVsPrev >= 0 ? '+' : ''}
                                      {formatCurrency(delinquencyMonthlyData.comparison.deltaPrevistoVsPrev)}
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 italic">Mês base inicial do exercício</div>
                          )}
                        </div>
                      </div>

                      {/* Coluna 3: Mês Posterior */}
                      <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                        {delinquencyMonthlyData.comparison.nextMonth ? (
                          <>
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                  Mês Posterior (M + 1)
                                </span>
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                  {delinquencyMonthlyData.comparison.nextMonth.monthName}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-xs text-slate-500 font-medium">Previsto Projetado:</span>
                                <span className="text-sm font-bold text-slate-800">{formatCurrency(delinquencyMonthlyData.comparison.nextMonth.monthPrevisto)}</span>
                              </div>
                              <div className="flex items-baseline justify-between mt-1">
                                <span className="text-xs text-emerald-700 font-medium">Realizado até Agora:</span>
                                <span className="text-base font-black text-emerald-800">{formatCurrency(delinquencyMonthlyData.comparison.nextMonth.monthRealizado)}</span>
                              </div>
                              <div className="flex items-baseline justify-between mt-1 text-[11px]">
                                <span className="text-slate-500">Saldo a Realizar:</span>
                                <span className="font-bold text-amber-700">
                                  {formatCurrency(delinquencyMonthlyData.comparison.nextMonth.monthSaldo)}
                                </span>
                              </div>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-slate-200/70 space-y-1 text-[10.5px]">
                              <div className="flex justify-between text-slate-600">
                                <span>Situação do Mês:</span>
                                <span className="font-bold text-slate-800">
                                  {delinquencyMonthlyData.comparison.nextMonth.isFuture ? 'A Vencer' : 'Vigente'}
                                </span>
                              </div>
                              <div className="flex justify-between text-slate-600">
                                <span>Variação de Previsão:</span>
                                <span className="font-bold text-slate-800">
                                  {delinquencyMonthlyData.comparison.deltaPrevistoVsNext !== null && (
                                    <>
                                      {delinquencyMonthlyData.comparison.deltaPrevistoVsNext >= 0 ? '+' : ''}
                                      {formatCurrency(delinquencyMonthlyData.comparison.deltaPrevistoVsNext)}
                                    </>
                                  )}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedComparisonMonth(selectedComparisonMonth + 1)}
                                className="w-full mt-2 text-center text-[9.5px] font-bold text-blue-700 hover:text-blue-900 hover:underline pt-1 cursor-pointer"
                              >
                                Analisar este mês em foco →
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-6 text-slate-400">
                            <span className="text-xs font-bold text-slate-600 mb-1">Encerramento do Ciclo</span>
                            <span className="text-[10px]">Dezembro é o último mês do ano letivo (não possui posterior).</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ========================================================
                    MODALIDADE 2: VISÃO SEMESTRAL (1º OU 2º SEMESTRE)
                   ======================================================== */}
                {financialChartMode === 'semester' && (
                  <div className="space-y-3.5 mb-4">
                    {/* Barra de Seleção de Semestre e Tipo de Exibição */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                          Semestre em Análise:
                        </span>
                        <div className="flex items-center p-0.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setSelectedSemester(1)}
                            className={cn(
                              "px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                              selectedSemester === 1
                                ? "bg-emerald-600 text-white shadow-2xs"
                                : "text-slate-600 hover:text-slate-900"
                            )}
                          >
                            1º Semestre (Jan a Jun)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedSemester(2)}
                            className={cn(
                              "px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                              selectedSemester === 2
                                ? "bg-violet-600 text-white shadow-2xs"
                                : "text-slate-600 hover:text-slate-900"
                            )}
                          >
                            2º Semestre (Jul a Dez)
                          </button>
                        </div>
                      </div>

                      {/* Alternador de exibição no semestre: Mês a Mês vs Acumulado no Semestre */}
                      <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-500 px-1.5">Barras:</span>
                        <button
                          type="button"
                          onClick={() => setSemesterDisplayType('regular')}
                          className={cn(
                            "px-2.5 py-0.5 rounded text-[10.5px] font-bold transition-all cursor-pointer",
                            semesterDisplayType === 'regular'
                              ? "bg-slate-100 text-slate-900 font-black shadow-2xs"
                              : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          Valores Mês a Mês
                        </button>
                        <button
                          type="button"
                          onClick={() => setSemesterDisplayType('accumulated')}
                          className={cn(
                            "px-2.5 py-0.5 rounded text-[10.5px] font-bold transition-all cursor-pointer",
                            semesterDisplayType === 'accumulated'
                              ? "bg-blue-50 text-blue-800 font-black shadow-2xs"
                              : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          Acumulado no Semestre
                        </button>
                      </div>
                    </div>

                    {/* Cards de Resumo Total do Semestre Selecionado */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* Total Previsto no Semestre */}
                      <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                              Total Previsto (Semestre)
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                              6 Meses
                            </span>
                          </div>
                          <div className="text-lg font-black text-blue-950 tabular-nums">
                            {formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto)}
                          </div>
                          <p className="text-[10px] text-blue-700 font-semibold mt-0.5">
                            Valores orçados a receber ({delinquencyMonthlyData.activeSemesterSummary.periodLabel})
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-blue-200/60 text-[10px] text-blue-900/80 flex justify-between">
                          <span>Média mensal prevista:</span>
                          <span className="font-bold">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto / 6)}</span>
                        </div>
                      </div>

                      {/* Total Realizado no Semestre */}
                      <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                              Total Realizado (Semestre)
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Arrecadado
                            </span>
                          </div>
                          <div className="text-lg font-black text-emerald-950 tabular-nums">
                            {formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado)}
                          </div>
                          <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                            Valores recebidos no período
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-emerald-200/60 text-[10px] text-emerald-900/80 flex justify-between">
                          <span>Média mensal realizada:</span>
                          <span className="font-bold">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado / 6)}</span>
                        </div>
                      </div>

                      {/* Saldo da Diferença Semestral */}
                      <div className={cn(
                        "p-3 rounded-xl border shadow-2xs flex flex-col justify-between",
                        delinquencyMonthlyData.activeSemesterSummary.saldo > 0
                          ? "bg-amber-50/80 border-amber-200/80"
                          : "bg-slate-50 border-slate-200/80"
                      )}>
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? "text-amber-900" : "text-slate-800"
                            )}>
                              Saldo da Diferença
                            </span>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded",
                              delinquencyMonthlyData.activeSemesterSummary.saldo > 0
                                ? "bg-amber-100 text-amber-900 border border-amber-200"
                                : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                            )}>
                              {delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? 'Pendente a Receber' : 'Superávit / Quitado'}
                            </span>
                          </div>
                          <div className={cn(
                            "text-lg font-black tabular-nums",
                            delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? "text-amber-950" : "text-slate-900"
                          )}>
                            {formatCurrency(Math.abs(delinquencyMonthlyData.activeSemesterSummary.saldo))}
                          </div>
                          <p className="text-[10px] font-semibold mt-0.5 text-slate-500">
                            Previsto ({formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto)}) - Realizado ({formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado)})
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-600 flex justify-between">
                          <span>Outro Semestre:</span>
                          <span className="font-bold text-slate-800">
                            {selectedSemester === 1 
                              ? `S2: ${formatCurrency(delinquencyMonthlyData.sem2.realizado)}`
                              : `S1: ${formatCurrency(delinquencyMonthlyData.sem1.realizado)}`}
                          </span>
                        </div>
                      </div>

                      {/* Taxa de Efetivação do Semestre */}
                      <div className="p-3 rounded-xl bg-violet-50/80 border border-violet-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-violet-900 uppercase tracking-wider">
                              Taxa de Realização
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                              Semestral
                            </span>
                          </div>
                          <div className="text-lg font-black text-violet-950 tabular-nums">
                            {delinquencyMonthlyData.activeSemesterSummary.rateRealizado}%
                          </div>
                          <p className="text-[10px] text-violet-700 font-semibold mt-0.5">
                            Percentual atingido da meta do semestre
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-violet-200/60 text-[10px] text-violet-900/80 flex justify-between">
                          <span>Taxa Anual Global:</span>
                          <span className="font-bold">{delinquencyMonthlyData.annual.rateRealizado}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ========================================================
                    MODALIDADE 3: VISÃO ANUAL (12 MESES)
                   ======================================================== */}
                {financialChartMode === 'annual' && (
                  <div className="space-y-3.5 mb-4">
                    {/* Barra de Opções da Visão Anual */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                          Consolidado Anual:
                        </span>
                        <span className="px-2.5 py-0.5 bg-slate-800 text-white rounded text-xs font-black shadow-2xs">
                          Exercício {delinquencyYear} (12 Meses)
                        </span>
                      </div>

                      {/* Alternador de exibição anual: Mês a Mês vs Evolução Acumulada Anual */}
                      <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-500 px-1.5">Barras:</span>
                        <button
                          type="button"
                          onClick={() => setAnnualDisplayType('regular')}
                          className={cn(
                            "px-2.5 py-0.5 rounded text-[10.5px] font-bold transition-all cursor-pointer",
                            annualDisplayType === 'regular'
                              ? "bg-slate-100 text-slate-900 font-black shadow-2xs"
                              : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          Valores Mês a Mês (12 Meses)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnnualDisplayType('accumulated')}
                          className={cn(
                            "px-2.5 py-0.5 rounded text-[10.5px] font-bold transition-all cursor-pointer",
                            annualDisplayType === 'accumulated'
                              ? "bg-blue-50 text-blue-800 font-black shadow-2xs"
                              : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          Evolução Acumulada Anual
                        </button>
                      </div>
                    </div>

                    {/* Cards de Resultado Anual Previsto, Realizado e Saldo da Diferença */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* 1. Resultado Anual Previsto */}
                      <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                              Resultado Anual Previsto
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                              Valores a Receber
                            </span>
                          </div>
                          <div className="text-lg font-black text-blue-950 tabular-nums">
                            {formatCurrency(delinquencyMonthlyData.annual.previsto)}
                          </div>
                          <p className="text-[10px] text-blue-700 font-semibold mt-0.5">
                            Total geral orçado para o ano letivo
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-blue-200/60 text-[10px] text-blue-900/80 flex justify-between">
                          <span>Média mensal orçada:</span>
                          <span className="font-bold">{formatCurrency(delinquencyMonthlyData.annual.previsto / 12)}</span>
                        </div>
                      </div>

                      {/* 2. Resultado Anual Realizado */}
                      <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                              Resultado Anual Realizado
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Valores Recebidos
                            </span>
                          </div>
                          <div className="text-lg font-black text-emerald-950 tabular-nums">
                            {formatCurrency(delinquencyMonthlyData.annual.realizado)}
                          </div>
                          <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                            Total arrecadado no exercício
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-emerald-200/60 text-[10px] text-emerald-900/80 flex justify-between">
                          <span>Média mensal arrecadada:</span>
                          <span className="font-bold">{formatCurrency(delinquencyMonthlyData.annual.realizado / 12)}</span>
                        </div>
                      </div>

                      {/* 3. Saldo da Diferença Anual */}
                      <div className={cn(
                        "p-3 rounded-xl border shadow-2xs flex flex-col justify-between",
                        delinquencyMonthlyData.annual.saldo > 0
                          ? "bg-amber-50/80 border-amber-200/80"
                          : "bg-slate-50 border-slate-200/80"
                      )}>
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              delinquencyMonthlyData.annual.saldo > 0 ? "text-amber-900" : "text-slate-800"
                            )}>
                              Saldo da Diferença Anual
                            </span>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded",
                              delinquencyMonthlyData.annual.saldo > 0
                                ? "bg-amber-100 text-amber-900 border border-amber-200"
                                : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                            )}>
                              {delinquencyMonthlyData.annual.saldo > 0 ? 'Pendente a Receber' : 'Superávit / Quitado'}
                            </span>
                          </div>
                          <div className={cn(
                            "text-lg font-black tabular-nums",
                            delinquencyMonthlyData.annual.saldo > 0 ? "text-amber-950" : "text-slate-900"
                          )}>
                            {formatCurrency(Math.abs(delinquencyMonthlyData.annual.saldo))}
                          </div>
                          <p className="text-[10px] font-semibold mt-0.5 text-slate-500">
                            Previsto ({formatCurrency(delinquencyMonthlyData.annual.previsto)}) - Realizado ({formatCurrency(delinquencyMonthlyData.annual.realizado)})
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-600 flex justify-between">
                          <span>Divisão semestral:</span>
                          <span className="font-bold text-slate-800">
                            S1: {formatCurrency(delinquencyMonthlyData.sem1.realizado)} | S2: {formatCurrency(delinquencyMonthlyData.sem2.realizado)}
                          </span>
                        </div>
                      </div>

                      {/* 4. Taxa Anual de Efetivação */}
                      <div className="p-3 rounded-xl bg-violet-50/80 border border-violet-200/70 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold text-violet-900 uppercase tracking-wider">
                              Taxa Anual de Efetivação
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                              Exercício
                            </span>
                          </div>
                          <div className="text-lg font-black text-violet-950 tabular-nums">
                            {delinquencyMonthlyData.annual.rateRealizado}%
                          </div>
                          <p className="text-[10px] text-violet-700 font-semibold mt-0.5">
                            Percentual da previsão anual concretizado
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-violet-200/60 text-[10px] text-violet-900/80 flex justify-between">
                          <span>Alunos no escopo:</span>
                          <span className="font-bold">{delinquencyMonthlyData.targetStudentsCount} matrículas</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ========================================================
                    GRÁFICO DE BARRAS RECHARTS DINÂMICO (PREVISTO vs REALIZADO vs SALDO)
                   ======================================================== */}
                <div className="w-full pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-2 px-1">
                    <span>
                      {financialChartMode === 'monthly'
                        ? `Comparativo de Barras (${monthlyChartScope === 'trio' ? 'Mês Anterior, Foco e Posterior' : '12 Meses'}) — ${monthlyDisplayType === 'accumulated' ? 'Valores Acumulados' : 'Valores do Mês'}`
                        : financialChartMode === 'semester'
                          ? `Comparativo Mês a Mês do ${delinquencyMonthlyData.activeSemesterSummary.title} (${semesterDisplayType === 'accumulated' ? 'Evolução Acumulada no Semestre' : 'Mês a Mês'})`
                          : `Demonstrativo Anual dos 12 Meses (${annualDisplayType === 'accumulated' ? 'Evolução Acumulada Anual' : 'Valores Mês a Mês'})`}
                    </span>
                    <span className="text-[10px] text-slate-400">Valores em R$ (Reais)</span>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={
                        financialChartMode === 'monthly'
                          ? delinquencyMonthlyData.monthlyChartPoints
                          : financialChartMode === 'semester'
                            ? delinquencyMonthlyData.activeSemesterSummary.chartPoints
                            : delinquencyMonthlyData.annualChartPoints
                      }
                      margin={{ top: 15, right: 15, left: -5, bottom: 5 }}
                      onClick={(e: any) => {
                        if (e && e.activePayload && e.activePayload.length) {
                          const mNum = e.activePayload[0].payload?.monthNum;
                          if (mNum) {
                            setSelectedComparisonMonth(mNum);
                            if (financialChartMode !== 'monthly') {
                              // Opcionalmente permite saltar para o mês
                            }
                          }
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="displayLabel"
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                        interval={0}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : `R$${v}`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3 rounded-xl shadow-2xl border border-slate-700/80 text-xs min-w-[260px]">
                                <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5 mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-white text-[13px]">{data.monthName} / {delinquencyYear}</span>
                                    {data.isSelected && (
                                      <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">FOCO</span>
                                    )}
                                  </div>
                                  <span className={cn(
                                    "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                                    data.isCurrent
                                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                      : data.isPast
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : "bg-slate-700 text-slate-300"
                                  )}>
                                    {data.isCurrent ? 'Mês Atual' : data.isPast ? 'Encerrado' : 'A Vencer'}
                                  </span>
                                </div>

                                <div className="space-y-1.5 text-slate-300 text-[11px]">
                                  {/* Previsto */}
                                  <div className="flex justify-between items-center gap-3">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 shrink-0" />
                                      <span>Previsto (A Receber):</span>
                                    </span>
                                    <span className="font-bold text-blue-300">{formatCurrency(data.previstoDisplay)}</span>
                                  </div>

                                  {/* Realizado */}
                                  <div className="flex justify-between items-center gap-3">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" />
                                      <span>Realizado (Recebido):</span>
                                    </span>
                                    <span className="font-bold text-emerald-400">{formatCurrency(data.realizadoDisplay)}</span>
                                  </div>

                                  {/* Saldo da Diferença */}
                                  <div className="flex justify-between items-center gap-3">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" />
                                      <span>Saldo da Diferença:</span>
                                    </span>
                                    <span className={cn(
                                      "font-bold",
                                      data.saldoDisplay > 0 ? "text-amber-400" : "text-emerald-400"
                                    )}>
                                      {formatCurrency(data.saldoDisplay)}
                                    </span>
                                  </div>

                                  {/* Taxa de Efetivação */}
                                  <div className="pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400">Taxa de Realização:</span>
                                    <span className="font-black px-1.5 py-0.5 rounded text-[10px] text-emerald-400 bg-emerald-950/60">
                                      {data.rateDisplay}%
                                    </span>
                                  </div>

                                  {/* Detalhamento auxiliar do mês isolado se estiver em modo acumulado */}
                                  {(monthlyDisplayType === 'accumulated' || semesterDisplayType === 'accumulated' || annualDisplayType === 'accumulated') && (
                                    <div className="pt-1.5 border-t border-slate-700/40 text-[9.5px] text-slate-400 leading-tight">
                                      Valores pontuais do mês: Previsto {formatCurrency(data.monthPrevisto)} | Realizado {formatCurrency(data.monthRealizado)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontWeight: 600 }}
                      />
                      <Bar
                        dataKey="previstoDisplay"
                        name="Previsto (A Receber)"
                        fill="#2563eb"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={financialChartMode === 'monthly' && monthlyChartScope === 'trio' ? 44 : 26}
                      />
                      <Bar
                        dataKey="realizadoDisplay"
                        name="Realizado (Recebido)"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={financialChartMode === 'monthly' && monthlyChartScope === 'trio' ? 44 : 26}
                      />
                      <Bar
                        dataKey="saldoDisplay"
                        name="Saldo da Diferença"
                        fill="#d97706"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={financialChartMode === 'monthly' && monthlyChartScope === 'trio' ? 44 : 26}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ========================================================
                    TABELAS E DEMONSTRATIVOS AUXILIARES CONFORME A MODALIDADE
                   ======================================================== */}
                {/* Demonstrativo Semestral (Tabela dos 6 Meses) */}
                {financialChartMode === 'semester' && (
                  <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="bg-slate-100/80 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Demonstrativo Mês a Mês do {delinquencyMonthlyData.activeSemesterSummary.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {delinquencyMonthlyData.activeSemesterSummary.periodLabel} / {delinquencyYear}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Mês</th>
                            <th className="py-2 px-3 text-right">Previsto (A Receber)</th>
                            <th className="py-2 px-3 text-right">Realizado (Recebido)</th>
                            <th className="py-2 px-3 text-right">Saldo da Diferença</th>
                            <th className="py-2 px-3 text-center">Efetivação (%)</th>
                            <th className="py-2 px-3 text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {delinquencyMonthlyData.activeSemesterSummary.basePoints.map((p: any) => (
                            <tr key={p.monthNum} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{p.monthName}</span>
                                {p.isCurrent && (
                                  <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.2 rounded font-bold">Atual</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-medium text-blue-900">{formatCurrency(p.monthPrevisto)}</td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatCurrency(p.monthRealizado)}</td>
                              <td className={cn(
                                "py-2 px-3 text-right font-bold",
                                p.monthSaldo > 0 ? "text-amber-700" : "text-emerald-700"
                              )}>
                                {formatCurrency(p.monthSaldo)}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-700">{p.rateRealizado}%</td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedComparisonMonth(p.monthNum);
                                    setFinancialChartMode('monthly');
                                  }}
                                  className="text-[10px] text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer"
                                >
                                  Ver no Mensal
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-100 font-black text-xs text-slate-900 border-t-2 border-slate-300">
                          <tr>
                            <td className="py-2.5 px-3 uppercase">Total do Semestre</td>
                            <td className="py-2.5 px-3 text-right text-blue-950">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.previsto)}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-950">{formatCurrency(delinquencyMonthlyData.activeSemesterSummary.realizado)}</td>
                            <td className={cn(
                              "py-2.5 px-3 text-right",
                              delinquencyMonthlyData.activeSemesterSummary.saldo > 0 ? "text-amber-900" : "text-emerald-900"
                            )}>
                              {formatCurrency(delinquencyMonthlyData.activeSemesterSummary.saldo)}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-900">{delinquencyMonthlyData.activeSemesterSummary.rateRealizado}%</td>
                            <td className="py-2.5 px-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Demonstrativo Anual (Tabela Completa de 12 Meses) */}
                {financialChartMode === 'annual' && (
                  <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="bg-slate-100/80 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Demonstrativo Consolidado dos 12 Meses do Exercício
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Ano Letivo {delinquencyYear}
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 shadow-2xs">
                          <tr>
                            <th className="py-2 px-3">Mês</th>
                            <th className="py-2 px-3 text-right">Previsto (A Receber)</th>
                            <th className="py-2 px-3 text-right">Realizado (Recebido)</th>
                            <th className="py-2 px-3 text-right">Saldo da Diferença</th>
                            <th className="py-2 px-3 text-center">Efetivação (%)</th>
                            <th className="py-2 px-3 text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {delinquencyMonthlyData.monthlyPoints.map((p: any) => (
                            <tr key={p.monthNum} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{p.monthName}</span>
                                {p.isCurrent && (
                                  <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.2 rounded font-bold">Atual</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-medium text-blue-900">{formatCurrency(p.monthPrevisto)}</td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatCurrency(p.monthRealizado)}</td>
                              <td className={cn(
                                "py-2 px-3 text-right font-bold",
                                p.monthSaldo > 0 ? "text-amber-700" : "text-emerald-700"
                              )}>
                                {formatCurrency(p.monthSaldo)}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-700">{p.rateRealizado}%</td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedComparisonMonth(p.monthNum);
                                    setFinancialChartMode('monthly');
                                  }}
                                  className="text-[10px] text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer"
                                >
                                  Ver no Mensal
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-900 font-black text-xs text-white sticky bottom-0">
                          <tr>
                            <td className="py-2.5 px-3 uppercase text-slate-200">TOTAL GERAL ANUAL</td>
                            <td className="py-2.5 px-3 text-right text-blue-300">{formatCurrency(delinquencyMonthlyData.annual.previsto)}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-400">{formatCurrency(delinquencyMonthlyData.annual.realizado)}</td>
                            <td className={cn(
                              "py-2.5 px-3 text-right",
                              delinquencyMonthlyData.annual.saldo > 0 ? "text-amber-400" : "text-emerald-400"
                            )}>
                              {formatCurrency(delinquencyMonthlyData.annual.saldo)}
                            </td>
                            <td className="py-2.5 px-3 text-center text-white">{delinquencyMonthlyData.annual.rateRealizado}%</td>
                            <td className="py-2.5 px-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé do Card Previsto vs Realizado */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-500">
                <span className="leading-tight">
                  {financialChartMode === 'monthly'
                    ? '* Modo Mensal: navegue mês a mês para comparar o previsto e realizado com o mês antecessor e posterior.'
                    : financialChartMode === 'semester'
                      ? '* Modo Semestral: resumo completo do 1º ou 2º semestre com totais previstos e realizados e detalhamento mês a mês.'
                      : '* Modo Anual: consolidação dos 12 meses do ano com demonstrativo analítico mês a mês e saldo da diferença.'}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/financial-report')}
                  className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 hover:underline cursor-pointer shrink-0 self-end sm:self-auto"
                >
                  <span>Abrir Relatório Financeiro Detalhado</span>
                  <ArrowRight size={11} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div 
            className={cn(
              "p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 [overflow-anchor:none] rounded-b-xl transition-colors",
              unitTheme.frameBg
            )}
            style={{ overflowAnchor: 'none' }}
          >
            {studentsByClass.length > 0 ? (
              studentsByClass.map((c, i) => {
                const classSubjects = getClassSubjects(c, subjects);
                const sem1Subs = classSubjects.filter(s => getSubjectClassDetails(s, c).semesterNumber === 1);
                const sem2Subs = classSubjects.filter(s => getSubjectClassDetails(s, c).semesterNumber === 2);
                const annualSubs = classSubjects.filter(s => {
                  const details = getSubjectClassDetails(s, c);
                  return details.semesterNumber !== 1 && details.semesterNumber !== 2;
                });
                
                // Grouping subjects for display with clear semester distinction
                const groupedBySem = [
                  { label: '1º SEM', subs: sem1Subs, color: 'text-blue-700 bg-blue-50 border-blue-200' },
                  { label: '2º SEM', subs: sem2Subs, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                  { label: 'ANUAL', subs: annualSubs, color: 'text-slate-600 bg-slate-100 border-slate-200' }
                ].filter(group => group.subs.length > 0);

                return (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={cn(
                      "p-3.5 rounded-xl border bg-white transition-all shadow-2xs flex flex-col justify-between h-full group hover:shadow-xs",
                      unitTheme.cardBorder,
                      unitTheme.cardHoverBorder
                    )}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2.5 min-w-0 pr-1">
                          <div className={cn(
                            "px-2 py-1 flex items-center justify-center font-bold font-mono text-[10px] whitespace-nowrap rounded-lg border shrink-0 transition-colors uppercase",
                            c.unallocated
                              ? "bg-slate-100 border-slate-200 text-slate-500"
                              : cn("border transition-colors", unitTheme.cardBg, unitTheme.cardBorder, unitTheme.textDark)
                          )}>
                            {c.code}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h5 className={cn("text-[12.5px] font-bold text-slate-800 tracking-tight truncate leading-snug transition-colors", `group-hover:${unitTheme.textDark}`)}>
                                {c.name}
                              </h5>
                              {c.isPlanned && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[7.5px] font-bold uppercase tracking-wider shrink-0">
                                  Inativa
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{c.period}</p>
                          </div>
                        </div>
                      </div>

                      {/* Informações das Matérias Agrupadas por Semestre com Animação Fluida para Baixo */}
                      <AnimatePresence initial={false}>
                        {!c.unallocated && showDisciplines && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden origin-top"
                          >
                            <div className="my-2 p-2.5 bg-slate-50/90 border border-slate-200/70 rounded-lg text-[10px] leading-tight overflow-hidden shadow-2xs">
                              {groupedBySem.length > 0 ? (
                                <div className="space-y-2">
                                  {groupedBySem.map((group, gIdx) => (
                                    <div key={gIdx} className="flex items-start gap-1.5 min-w-0">
                                      <span className={cn(
                                        "font-bold text-[7.5px] px-1 py-0.5 rounded shrink-0 border uppercase tracking-tight mt-0.5",
                                        group.color
                                      )}>
                                        {group.label}
                                      </span>
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        {group.subs.map((s, sIdx) => {
                                          const t = getSubjectTeacher(s as Subject);
                                          return (
                                            <div key={`dash-s-${s.id || s.code || sIdx}-${sIdx}`} className="min-w-0 leading-tight py-0.5">
                                              <p className="text-[9.5px] font-semibold text-slate-800 truncate">{s.name}</p>
                                              <p className="text-[8px] text-slate-400 truncate">{t ? `Prof. ${t.name}` : 'Sem prof. atribuído'}</p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[8.5px] text-slate-400 italic py-0.5 px-1">
                                  {classSubjects.length > 0 
                                    ? 'Matérias em análise / sem divisão semestral' 
                                    : 'Sem matérias vinculadas'}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex justify-between items-center px-0.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-bold text-slate-800 tabular-nums">{c.percentage}%</span>
                          <span className="text-[8.5px] font-semibold text-slate-400 uppercase tracking-wider">Ocupação</span>
                        </div>

                        {c.count > 0 ? (
                          <button 
                            onClick={() => handleViewStudents(c.id, c.name, !!c.unallocated)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9.5px] font-bold transition-all cursor-pointer group/btn shrink-0 shadow-2xs",
                              unitTheme.buttonHover,
                              unitTheme.cardBorder
                            )}
                            title="Ver Alunos da Turma"
                          >
                            <span>{c.count} Alunos</span>
                            <Eye size={12} className={cn("text-slate-400 group-hover/btn:text-current transition-colors", unitTheme.textAccent)} />
                          </button>
                        ) : (
                          <span className="text-[9px] font-medium text-slate-400 px-1">0 Alunos</span>
                        )}
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(c.percentage, 100)}%` }}
                          transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.03 }}
                          className={cn("h-full rounded-full transition-all", unitTheme.progressBar)} 
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
               <div className="col-span-full py-10 flex flex-col items-center justify-center gap-3 text-slate-500">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider text-center max-w-md">
                    {selectedAcademicYear === 'Todos' 
                      ? 'Nenhuma turma encontrada.' 
                      : selectedAcademicYear === 'ATUAL'
                        ? 'Nenhuma turma ativa encontrada para o ciclo atual.'
                        : parseInt(selectedAcademicYear, 10) > 2026
                          ? `Nenhuma turma habilitada ou cadastrada para o ano de ${selectedAcademicYear}.`
                          : `Nenhuma turma cadastrada para o ano letivo de ${selectedAcademicYear}.`}
                  </p>
                  
                  {selectedAcademicYear !== 'Todos' && parseInt(selectedAcademicYear, 10) > 2026 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetHabilitationYear(selectedAcademicYear);
                        setShowHabilitationModal(true);
                      }}
                      className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer shadow-xs"
                    >
                      <Sparkles size={14} />
                      <span>Habilitar Coortes para {selectedAcademicYear}</span>
                    </button>
                  )}

                  {selectedAcademicYear !== 'Todos' && (
                    <button
                      type="button"
                      onClick={() => setSelectedAcademicYear('ATUAL')}
                      className="px-3 py-1.5 bg-blue-900 text-white text-[10px] font-extrabold uppercase tracking-widest hover:bg-blue-950 transition-colors cursor-pointer rounded"
                    >
                      Retornar ao Ciclo Atual (2026)
                    </button>
                  )}
               </div>
            )}
          </div>
        )}
        </motion.div>

      {/* Modal de Habilitação Anual de Turmas */}
      <HabilitationModal
        isOpen={showHabilitationModal}
        onClose={() => setShowHabilitationModal(false)}
        initialTargetYear={targetHabilitationYear}
        classes={classes}
        students={students}
        onUpdated={() => {
          try {
            const raw = localStorage.getItem('academic_habilitated_classes_v1');
            if (raw) setHabilitatedMap(JSON.parse(raw));
          } catch (e) {}
          fetchStats();
        }}
      />

      {/* Students Modal */}
      {showStudentsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-[999]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg w-full max-w-xl overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedClassLabel}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {isUnallocatedContext ? "Pendente" : "Matriculados"}
                </p>
              </div>
              <button 
                onClick={() => setShowStudentsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 max-h-[50vh] overflow-y-auto custom-scrollbar bg-white">
              <div className="grid gap-2">
                {selectedClassStudents.length > 0 ? (
                  selectedClassStudents.map((student, stIdx) => (
                    <div key={`dash-st-${student.id || stIdx}-${stIdx}`} className="p-2 border border-slate-100 rounded-md flex items-center justify-between hover:bg-slate-50 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <h5 className="text-[13px] font-bold text-slate-800 leading-tight">{student.name}</h5>
                          <p className="text-[9px] text-slate-400 font-medium tracking-tight">CPF: {student.cpf || '---'}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setShowStudentsModal(false);
                          navigate('/students', {
                            state: {
                              studentId: student.id,
                              returnTo: {
                                path: '/dashboard',
                                sourceTitle: 'Dashboard'
                              }
                            }
                          });
                        }}
                        className="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
                      >
                        Ver Ficha
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6">
                    <p className="text-[11px] text-slate-400 font-medium">Nenhum registro encontrado.</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
              {isUnallocatedContext && (
                <button 
                  onClick={handleDeactivateAllUnallocated}
                  disabled={isDeactivating || selectedClassStudents.length === 0}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md font-bold text-[10px] hover:bg-slate-300 uppercase tracking-widest transition-all"
                >
                  {isDeactivating ? '...' : 'Desativar Todos'}
                </button>
              )}
              <button 
                onClick={() => {
                  setShowStudentsModal(false);
                  navigate('/students', isUnallocatedContext ? { state: { filterUnallocated: true } } : undefined);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md font-bold text-[10px] hover:bg-indigo-700 uppercase tracking-widest shadow-sm ml-auto cursor-pointer"
              >
                {isUnallocatedContext ? 'Alocar Alunos em Turma' : 'Gerenciar Alunos'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
