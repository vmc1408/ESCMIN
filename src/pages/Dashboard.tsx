import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  UserPlus,
  GraduationCap, 
  BookOpen, 
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
  Sparkles,
  CheckCircle2,
  CheckSquare,
  Square,
  Settings2,
  ArrowRight,
  Info
} from 'lucide-react';

const formatDateBR = (dateStr?: string) => {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export interface SchedulePeriod {
  label: string;
  dayNum?: number;
  t1Start: string;
  t1End: string;
  t2Start: string;
  t2End: string;
}

const WEEKDAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado'
};

const getAllAcademicSchedulePeriods = (settings: any): SchedulePeriod[] => {
  const periods: SchedulePeriod[] = [];
  const seenLabels = new Set<string>();

  let combined = { ...(settings || {}) };
  try {
    const stored = localStorage.getItem('academic_settings_current');
    if (stored) {
      const parsed = JSON.parse(stored);
      combined = { ...parsed, ...combined };
      if (parsed.weekday_terms) {
        combined.weekday_terms = { ...(parsed.weekday_terms || {}), ...(combined.weekday_terms || {}) };
      }
    }
  } catch (e) {}

  if (combined.weekday_terms) {
    const dayKeys = Object.keys(combined.weekday_terms)
      .map(k => Number(k))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    for (const d of dayKeys) {
      const termObj = combined.weekday_terms[d] || combined.weekday_terms[String(d)];
      if (termObj && (termObj.term1_start || termObj.term1_end || termObj.term2_start || termObj.term2_end)) {
        const labelName = WEEKDAY_NAMES[d] || `Dia ${d}`;
        if (!seenLabels.has(labelName)) {
          seenLabels.add(labelName);
          periods.push({
            label: labelName,
            dayNum: d,
            t1Start: termObj.term1_start || '',
            t1End: termObj.term1_end || '',
            t2Start: termObj.term2_start || '',
            t2End: termObj.term2_end || ''
          });
        }
      }
    }
  }

  const rootT1Start = combined.term1_start || '';
  const rootT1End = combined.term1_end || '';
  const rootT2Start = combined.term2_start || '';
  const rootT2End = combined.term2_end || '';

  if (periods.length === 0 && (rootT1Start || rootT1End || rootT2Start || rootT2End)) {
    periods.push({
      label: 'Geral',
      t1Start: rootT1Start,
      t1End: rootT1End,
      t2Start: rootT2Start,
      t2End: rootT2End
    });
  }

  return periods;
};
import { fetchCount, fetchAll, fetchById, saveBatch, saveData } from '../lib/database';
import { supabase, isDbConnected, isSupabaseConfigured, lastLatency, testConnection } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { cn, normalizeClass, normalizeSubject, getClassSubjects, getSubjectClassDetails } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { Student, Class, Subject, Teacher } from '../types';
import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
  const navigate = useNavigate();
  const { logout, isConnected, connError, profile, canAccess, isTeacher } = useAuth();
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

  const [acadSettings, setAcadSettings] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('academic_settings_current');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });

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
      const [studentsData, classesData, subjectsData, teachersData, acadData, enrollmentsData] = await Promise.all([
        fetchAll('students'),
        fetchAll('classes'),
        fetchAll('subjects'),
        fetchAll('teachers'),
        fetchAll('academic_settings').catch(() => []),
        fetchAll('enrollments').catch(() => []),
        updateCategory('students', 'students'),
        updateCategory('teachers', 'teachers'),
        updateCategory('classes', 'classes'),
        updateCategory('subjects', 'subjects')
      ]);

      if (acadData && acadData.length > 0) {
        const current = acadData.find((s: any) => s.id === 'current') || acadData[0];
        setAcadSettings(current);
      } else {
        try {
          const byId = await fetchById('academic_settings', 'current');
          if (byId) setAcadSettings(byId);
        } catch (e) {}
      }
      
      if (studentsData) setStudents(studentsData);
      if (enrollmentsData) setEnrollments(enrollmentsData);
      
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

  // Available academic years derived from standard horizon and existing classes
  const availableAcademicYears = useMemo(() => {
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

  const studentsByClass = useMemo(() => {
    const isClassActive = (c: any) => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';

    const activeClasses = classes.filter(c => {
      if (selectedAcademicYear === 'ATUAL') {
        if (!isClassActive(c)) return false;
      }
      return isClassActiveInAcademicYear(c, selectedAcademicYear);
    });

    const activeStudents = students.filter(s => s.status === 'Ativo' || !s.status || String(s.status).toLowerCase() === 'ativo');
    
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
    classes.filter(isClassActive).forEach(c => {
      const fromEnrollments = enrolledMap.get(c.id);
      if (fromEnrollments) fromEnrollments.forEach(id => allAllocatedStudentIds.add(id));
    });
    activeStudents.forEach(s => {
      if (s.class_id && classes.some(c => c.id === s.class_id && isClassActive(c))) {
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
  }, [classes, students, enrollments, selectedAcademicYear, isClassActiveInAcademicYear]);

  // Eligible active cohorts from past/current years (<= 2026) that can be habilitated for a future cycle (e.g. 2027)
  const eligibleCohortsForHabilitation = useMemo(() => {
    const targetYrNum = parseInt(targetHabilitationYear, 10);
    if (isNaN(targetYrNum)) return [];

    const isClassActive = (c: any) => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';

    return classes
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
        const count = students.filter(s => 
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
  }, [classes, students, targetHabilitationYear, habilitatedMap, getClassStartYear]);

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
    const activeStudents = students.filter(s => s.status === 'Ativo' || !s.status || String(s.status).toLowerCase() === 'ativo');
    const activeEnrollments = (enrollments || []).filter((e: any) => e.status === 'Ativo' || !e.status || String(e.status).toLowerCase() === 'ativo');
    
    if (isUnallocated) {
      const activeClasses = classes.filter(isClassActive);
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
    { label: 'Alunos', stats: stats.students, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Turmas', stats: stats.classes, icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Disciplinas', stats: stats.subjects, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-100/50', border: 'border-blue-200/50' },
    { label: 'Professores', stats: stats.teachers, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-100/50', border: 'border-emerald-200/50' },
  ];

  const periods = useMemo(() => getAllAcademicSchedulePeriods(acadSettings), [acadSettings]);
  const [activePeriodIndex, setActivePeriodIndex] = useState(0);
  const [isPeriodPaused, setIsPeriodPaused] = useState(false);

  useEffect(() => {
    if (periods.length <= 1 || isPeriodPaused) return;
    const interval = setInterval(() => {
      setActivePeriodIndex((prev) => (prev + 1) % periods.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [periods.length, isPeriodPaused]);

  const currentPeriod = periods[activePeriodIndex % Math.max(1, periods.length)] || {
    label: 'Cronograma',
    t1Start: '',
    t1End: '',
    t2Start: '',
    t2End: ''
  };

  const formatPeriodDisplay = (startStr: string, endStr: string) => {
    if (startStr && endStr) {
      return (
        <>
          {formatDateBR(startStr)} <span className="text-slate-400 font-normal mx-0.5">até</span> {formatDateBR(endStr)}
        </>
      );
    }
    if (startStr) {
      return <>A partir de {formatDateBR(startStr)}</>;
    }
    if (endStr) {
      return <>Até {formatDateBR(endStr)}</>;
    }
    return <span className="text-slate-400 font-medium italic">A definir no Cronograma</span>;
  };

  // ==========================================
  // TELA DEDICADA EXCLUSIVA PARA PROFESSOR / DOCENTE
  // 4 botões ao centro (2 em cima e 2 em baixo formando um quadrado)
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
        title: 'Lista de Frequência',
        category: 'Mapa Mensal',
        description: 'Consulta e impressão da lista de presença consolidada por mês e turma.',
        icon: Calendar,
        path: '/monthly-attendance',
        accentColor: 'blue',
        bg: 'bg-white hover:bg-blue-50/40',
        borderColor: 'border-slate-200 hover:border-blue-300',
        iconBg: 'bg-blue-500/10 text-blue-600',
        badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
        buttonText: 'Ver Lista de Frequência'
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
      },
      {
        title: 'Cadastrar Avaliações',
        category: 'Critérios Avaliativos',
        description: 'Configuração dos instrumentos avaliativos, pesos, provas e trabalhos.',
        icon: GraduationCap,
        path: '/assessments',
        accentColor: 'amber',
        bg: 'bg-white hover:bg-amber-50/40',
        borderColor: 'border-slate-200 hover:border-amber-300',
        iconBg: 'bg-amber-500/10 text-amber-600',
        badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
        buttonText: 'Gerenciar Avaliações'
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

        {/* 4 Botões ao Centro da Tela em Formato de Quadrado (2 em cima e 2 em baixo) */}
        <div className="max-w-4xl mx-auto pt-2 pb-8 space-y-6">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
              Atividades Pedagógicas
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Selecione o módulo que deseja acessar para realizar seus registros:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                    "w-full text-left p-6 sm:p-7 rounded-2xl border transition-all duration-300 group cursor-pointer shadow-xs hover:shadow-lg hover:-translate-y-1 flex flex-col justify-between min-h-[190px]",
                    card.bg,
                    card.borderColor
                  )}
                >
                  <div>
                    {/* Top Row: Icon + Badge + Arrow */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn("p-3 rounded-xl transition-transform duration-300 group-hover:scale-110", card.iconBg)}>
                        <card.icon size={26} strokeWidth={2.2} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border", card.badgeBg)}>
                          {card.category}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-[#131b2e] text-slate-400 group-hover:text-white flex items-center justify-center transition-all duration-300">
                          <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>

                    {/* Title and Description */}
                    <h4 className="text-lg font-black text-slate-800 tracking-tight group-hover:text-slate-950 transition-colors uppercase">
                      {card.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5">
                      {card.description}
                    </p>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600 group-hover:text-slate-900">
                    <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                      {card.buttonText}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 group-hover:text-slate-600">
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
      <PageHeader
        title="Painel de Controle"
        description="Painel de monitoramento e controle de informações internas da instituição."
        icon={Activity}
      >
        <div 
          className="flex flex-col gap-2 items-stretch sm:items-end"
          onMouseEnter={() => setIsPeriodPaused(true)}
          onMouseLeave={() => setIsPeriodPaused(false)}
        >
          {periods.length > 1 && (
            <div className="flex items-center gap-1.5 self-center sm:self-end bg-slate-100/90 border border-slate-200/80 p-1 rounded-xl shadow-2xs">
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500 tracking-wider px-2 py-0.5">
                <Repeat size={11} className="text-slate-500" />
                <span className="hidden sm:inline">Cronogramas:</span>
              </span>
              {periods.map((p, idx) => {
                const isActive = idx === (activePeriodIndex % periods.length);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setActivePeriodIndex(idx)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-extrabold tracking-wide transition-all duration-300 cursor-pointer ${
                      isActive 
                        ? 'bg-[#131b2e] text-white shadow-xs font-black' 
                        : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-50/90 border border-slate-200/80 rounded-xl text-slate-800 shadow-2xs min-w-[210px] relative overflow-hidden transition-all duration-300">
              <div className="p-1.5 bg-[#131b2e] text-white rounded-lg shrink-0">
                <Calendar size={14} />
              </div>
              <div className="text-[11px] leading-tight font-sans flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold text-slate-900 uppercase text-[9.5px] tracking-wider">
                    1º Semestre
                  </p>
                  {periods.length > 1 && (
                    <span className="text-[8.5px] font-extrabold bg-slate-200/90 text-slate-700 px-1.5 py-0.2 rounded uppercase transition-all duration-300">
                      {currentPeriod.label}
                    </span>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`t1-${currentPeriod.label}-${currentPeriod.t1Start}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="font-bold text-slate-700 mt-0.5"
                  >
                    {formatPeriodDisplay(currentPeriod.t1Start, currentPeriod.t1End)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-50/90 border border-slate-200/80 rounded-xl text-slate-800 shadow-2xs min-w-[210px] relative overflow-hidden transition-all duration-300">
              <div className="p-1.5 bg-[#131b2e] text-white rounded-lg shrink-0">
                <Calendar size={14} />
              </div>
              <div className="text-[11px] leading-tight font-sans flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold text-slate-900 uppercase text-[9.5px] tracking-wider">
                    2º Semestre
                  </p>
                  {periods.length > 1 && (
                    <span className="text-[8.5px] font-extrabold bg-slate-200/90 text-slate-700 px-1.5 py-0.2 rounded uppercase transition-all duration-300">
                      {currentPeriod.label}
                    </span>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`t2-${currentPeriod.label}-${currentPeriod.t2Start}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="font-bold text-slate-700 mt-0.5"
                  >
                    {formatPeriodDisplay(currentPeriod.t2Start, currentPeriod.t2End)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {isRefreshing && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[9px] font-black uppercase tracking-widest animate-pulse">
                <RefreshCw size={11} className="animate-spin text-slate-500" />
                <span>Sincronizando...</span>
              </div>
            )}
          </div>
        </div>
      </PageHeader>

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

      {/* Acesso Rápido - Botões Flutuantes sem Quadro */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2.5"
      >
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Acesso Rápido</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(isTeacher ? [
            { 
              label: 'Lançar Chamada', 
              icon: UserCheck, 
              path: '/attendance', 
              bg: 'bg-white hover:bg-emerald-50/60', 
              iconColor: 'text-emerald-600', 
              iconBg: 'bg-emerald-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Lista de Frequência', 
              icon: Calendar, 
              path: '/monthly-attendance', 
              bg: 'bg-white hover:bg-blue-50/60', 
              iconColor: 'text-blue-600', 
              iconBg: 'bg-blue-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Apontamento de Notas', 
              icon: BookOpen, 
              path: '/grades', 
              bg: 'bg-white hover:bg-indigo-50/60', 
              iconColor: 'text-indigo-600', 
              iconBg: 'bg-indigo-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Cadastrar Avaliações', 
              icon: GraduationCap, 
              path: '/assessments', 
              bg: 'bg-white hover:bg-amber-50/60', 
              iconColor: 'text-amber-600', 
              iconBg: 'bg-amber-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            }
          ] : [
            { 
              label: 'Matricular', 
              icon: UserPlus, 
              path: '/students', 
              state: { action: 'new' },
              bg: 'bg-white hover:bg-indigo-50/60', 
              iconColor: 'text-indigo-600', 
              iconBg: 'bg-indigo-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Controle e Histórico', 
              icon: UserCircle, 
              path: '/student-ficha', 
              bg: 'bg-white hover:bg-rose-50/60', 
              iconColor: 'text-rose-600', 
              iconBg: 'bg-rose-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Gerar Impressos', 
              icon: Printer, 
              path: '/impressos', 
              bg: 'bg-white hover:bg-sky-50/60', 
              iconColor: 'text-sky-600', 
              iconBg: 'bg-sky-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Turmas / Classes', 
              icon: GraduationCap, 
              path: '/classes', 
              bg: 'bg-white hover:bg-emerald-50/60', 
              iconColor: 'text-emerald-600', 
              iconBg: 'bg-emerald-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Calendário', 
              icon: Calendar, 
              path: '/calendar', 
              bg: 'bg-white hover:bg-amber-50/60', 
              iconColor: 'text-amber-600', 
              iconBg: 'bg-amber-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            },
            { 
              label: 'Contribuições', 
              icon: Wallet, 
              path: '/contributions', 
              bg: 'bg-white hover:bg-violet-50/60', 
              iconColor: 'text-violet-600', 
              iconBg: 'bg-violet-50/80',
              hoverShadow: 'hover:-translate-y-0.5' 
            }
          ].filter(item => canAccess(item.path))).map((item, i) => (
            <button 
              key={i}
              onClick={() => {
                if (item.path !== '#') {
                  navigate(item.path, item.state ? { state: item.state } : undefined);
                }
              }}
              className={cn(
                "flex flex-row items-center gap-2.5 px-3.5 py-2.5 rounded-lg transition-all duration-300 text-left group cursor-pointer w-full min-h-[44px]",
                item.bg,
                item.hoverShadow
              )}
            >
              <div className={cn("p-1.5 rounded-md transition-all duration-300 shrink-0", item.iconBg)}>
                <item.icon size={16} className={cn("transition-transform duration-300 group-hover:scale-110 shrink-0", item.iconColor)} />
              </div>
              <span className="text-[9.5px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors tracking-tight leading-tight uppercase truncate">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Informative Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="group relative bg-white p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-6">
              <div className={`${stat.bg} ${stat.color} w-10 h-10 rounded-md flex items-center justify-center transition-transform group-hover:scale-105`}>
                <stat.icon size={20} />
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight mt-1 tabular-nums">
                  {isRefreshing ? "..." : stat.stats.active}
                </h3>
              </div>
            </div>

            <div className="flex items-center justify-between">
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Latência</span>
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      dbStatus === 'connected' ? "bg-emerald-500" : "bg-amber-400"
                    )}></div>
                    <span className="text-[9px] font-medium text-slate-400">{dbInfo.latency || '?'} ms</span>
                  </div>
               </div>
               <div className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                  Ativos
               </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Ocupação Acadêmica - Ajustada em 3 por linha */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Activity size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Ocupação Acadêmica</h3>
              <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">
                {studentsByClass.filter(c => !c.unallocated).length} Turmas {selectedAcademicYear === 'Todos' ? '(Todos os Anos)' : selectedAcademicYear === 'ATUAL' ? '(Ciclo Atual 2026)' : `(Ano Letivo ${selectedAcademicYear})`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Habilitação Anual de Turmas Button */}
            <button
              type="button"
              onClick={() => {
                const yr = selectedAcademicYear !== 'Todos' && selectedAcademicYear !== 'ATUAL' && parseInt(selectedAcademicYear, 10) > 2026 
                  ? selectedAcademicYear 
                  : '2027';
                setTargetHabilitationYear(yr);
                setShowHabilitationModal(true);
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-2xs select-none active:scale-[0.98]",
                selectedAcademicYear !== 'Todos' && parseInt(selectedAcademicYear, 10) > 2026
                  ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600 shadow-xs"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              )}
              title="Gerenciar Habilitação de Turmas para Novos Ciclos Letivos"
            >
              <Sparkles size={14} className={selectedAcademicYear !== 'Todos' && parseInt(selectedAcademicYear, 10) > 2026 ? "text-amber-100" : "text-amber-600"} />
              <span>Habilitação {selectedAcademicYear !== 'Todos' && parseInt(selectedAcademicYear, 10) > 2026 ? selectedAcademicYear : '2027'}</span>
            </button>

            {/* Toggle Visibilidade das Disciplinas */}
            <button
              type="button"
              onClick={() => setShowDisciplines(!showDisciplines)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-2xs select-none active:scale-[0.98]",
                showDisciplines
                  ? "bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100/80"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/80"
              )}
              title={showDisciplines ? "Ocultar Disciplinas nas Turmas" : "Exibir Disciplinas nas Turmas"}
            >
              {showDisciplines ? (
                <>
                  <EyeOff size={14} className="text-blue-700" />
                  <span>Ocultar Matérias</span>
                </>
              ) : (
                <>
                  <Eye size={14} className="text-slate-600" />
                  <span>Exibir Matérias</span>
                </>
              )}
            </button>

            {/* Seleção de Turma(s) por Ano - Flutuante Sem Bordas e Sem Sombras */}
            <div className="flex items-center bg-white p-1 rounded-lg gap-1 transition-all duration-200">
              {(() => {
                const currentYrIdx = availableAcademicYears.indexOf(selectedAcademicYear);
                const isAtOldest = selectedAcademicYear !== 'Todos' && selectedAcademicYear !== 'ATUAL' && (currentYrIdx === availableAcademicYears.length - 1 || currentYrIdx === -1);
                const isAtNewest = selectedAcademicYear !== 'Todos' && selectedAcademicYear !== 'ATUAL' && currentYrIdx === 0;

                return (
                  <>
                    {/* Botão Ano Anterior */}
                    <button
                      type="button"
                      disabled={isAtOldest}
                      onClick={() => {
                        if (selectedAcademicYear === 'Todos' || selectedAcademicYear === 'ATUAL') {
                          setSelectedAcademicYear('2026');
                        } else {
                          const idx = availableAcademicYears.indexOf(selectedAcademicYear);
                          if (idx !== -1 && idx < availableAcademicYears.length - 1) {
                            setSelectedAcademicYear(availableAcademicYears[idx + 1]);
                          }
                        }
                      }}
                      className={cn(
                        "p-1.5 rounded-md transition-all cursor-pointer shrink-0 select-none",
                        isAtOldest
                          ? "text-slate-300 cursor-not-allowed opacity-50"
                          : "text-slate-600 hover:text-blue-900 hover:bg-slate-100"
                      )}
                      title={
                        isAtOldest
                          ? `Não há turmas cadastradas em anos anteriores a ${selectedAcademicYear}`
                          : "Voltar para o Ano Anterior"
                      }
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <div className="flex items-center gap-1.5 px-1.5">
                      <Calendar size={14} className="text-blue-700 shrink-0" />
                      <span className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider whitespace-nowrap hidden sm:inline">
                        Turma(s):
                      </span>
                      <select
                        id="dash-academic-year"
                        value={selectedAcademicYear}
                        onChange={(e) => setSelectedAcademicYear(e.target.value)}
                        className="bg-transparent text-xs font-black text-blue-950 border-none outline-none cursor-pointer hover:text-blue-700 transition-all uppercase tracking-wider py-1 pl-1 pr-0"
                      >
                        <option value="ATUAL">CICLO ATUAL (2026)</option>
                        {availableAcademicYears.map(yr => (
                          <option key={yr} value={yr}>
                            ANO {yr}
                          </option>
                        ))}
                        <option value="Todos">TODOS OS ANOS</option>
                      </select>
                    </div>

                    {/* Botão Próximo Ano */}
                    <button
                      type="button"
                      disabled={isAtNewest}
                      onClick={() => {
                        if (selectedAcademicYear === 'Todos' || selectedAcademicYear === 'ATUAL') {
                          setSelectedAcademicYear('2027');
                        } else {
                          const idx = availableAcademicYears.indexOf(selectedAcademicYear);
                          if (idx > 0) {
                            setSelectedAcademicYear(availableAcademicYears[idx - 1]);
                          }
                        }
                      }}
                      className={cn(
                        "p-1.5 rounded-md transition-all cursor-pointer shrink-0 select-none",
                        isAtNewest
                          ? "text-slate-300 cursor-not-allowed opacity-50"
                          : "text-slate-600 hover:text-blue-900 hover:bg-slate-100"
                      )}
                      title={
                        isAtNewest
                          ? `Não há turmas cadastradas em anos futuros a ${selectedAcademicYear}`
                          : "Avançar para o Próximo Ano"
                      }
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        
        {/* Aviso de Planejamento Futuro (ex: 2027) */}
        {selectedAcademicYear !== 'Todos' && selectedAcademicYear !== 'ATUAL' && parseInt(selectedAcademicYear, 10) > 2026 && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Info size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900 leading-tight">
                  Planejamento do Ano Letivo {selectedAcademicYear}
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                  No momento vigente (2026), as turmas ativas de anos anteriores (2026, 2025, 2024, 2023) não constam automaticamente até serem expressamente habilitadas para o ciclo de {selectedAcademicYear}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTargetHabilitationYear(selectedAcademicYear);
                setShowHabilitationModal(true);
              }}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold uppercase tracking-wider shrink-0 transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>Gerenciar Habilitações</span>
            </button>
          </div>
        )}

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/30">
            {studentsByClass.length > 0 ? (
              studentsByClass.map((c, i) => {
                const classSubjects = getClassSubjects(c, subjects);
                const sem1Subs = classSubjects.filter(s => getSubjectClassDetails(s, c).semesterNumber === 1);
                const sem2Subs = classSubjects.filter(s => getSubjectClassDetails(s, c).semesterNumber === 2);
                const activeSubs = activeSemesterNum === 1
                  ? (sem1Subs.length > 0 ? sem1Subs : (sem2Subs.length === 0 ? classSubjects : []))
                  : (sem2Subs.length > 0 ? sem2Subs : (sem1Subs.length === 0 ? classSubjects : []));


                return (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      "p-2.5 sm:p-3 rounded-md border bg-white transition-all shadow-2xs flex flex-col justify-between h-full",
                      c.borderClass
                    )}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <div className={cn(
                            "h-6 px-1.5 flex items-center justify-center text-white font-bold text-[9px] whitespace-nowrap rounded shrink-0",
                            "bg-slate-700",
                            c.color
                          )}>
                            {c.code}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h5 className="text-[12px] font-bold text-slate-800 tracking-tight truncate leading-snug">{c.name}</h5>
                              {c.isPlanned && (
                                <span className="px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[7.5px] font-bold uppercase tracking-wider shrink-0">
                                  Inativa
                                </span>
                              )}
                            </div>
                            <p className="text-[8.5px] font-medium text-slate-500 uppercase tracking-wider">{c.period}</p>
                          </div>
                        </div>
                      </div>

                      {/* Informações das Matérias Apenas do Semestre Ativo */}
                      {!c.unallocated && showDisciplines && (
                        <div className="my-1.5 py-1 px-1.5 bg-slate-50/90 border border-slate-100/90 rounded text-[9.5px] leading-tight overflow-hidden">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className={cn(
                              "font-bold text-[7.5px] px-1 py-0.5 rounded shrink-0 border uppercase tracking-tight mt-0.5",
                              activeSemesterNum === 1 
                                ? "text-blue-700 bg-blue-50 border-blue-100" 
                                : "text-emerald-700 bg-emerald-50 border-emerald-100"
                            )}>
                              {activeSemesterNum}º Sem
                            </span>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              {activeSubs.length > 0 ? (
                                activeSubs.map((s, sIdx) => {
                                  const t = getSubjectTeacher(s as Subject);
                                  return (
                                    <div key={`dash-s-${s.id || s.code || sIdx}-${sIdx}`} className="min-w-0 leading-tight py-0.5">
                                      <p className="text-[9px] font-bold text-slate-800 truncate">{s.name}</p>
                                      <p className="text-[8px] text-slate-500 truncate">{t ? `Prof. ${t.name}` : 'Sem prof. atribuído'}</p>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-[8.5px] text-slate-400 italic py-0.5">
                                  {classSubjects.length > 0 ? `Sem matérias no ${activeSemesterNum}º Sem` : 'Sem matérias vinculadas'}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 space-y-1">
                      <div className="flex justify-between items-center px-0.5">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[10.5px] font-bold text-slate-800">{c.percentage}%</span>
                          <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">Ocupação Acadêmica</span>
                        </div>

                        {c.count > 0 ? (
                          <button 
                            onClick={() => handleViewStudents(c.id, c.name, !!c.unallocated)}
                            className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded border border-slate-200/80 hover:border-blue-200 text-[9px] font-bold transition-all cursor-pointer group shrink-0"
                            title="Ver Alunos da Turma"
                          >
                            <span>{c.count} Alunos</span>
                            <Eye size={11} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                          </button>
                        ) : (
                          <span className="text-[9px] font-medium text-slate-400 px-1">0 Alunos</span>
                        )}
                      </div>
                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(c.percentage, 100)}%` }}
                          transition={{ duration: 1, ease: "easeOut", delay: i * 0.05 }}
                          className={cn("h-full", c.color)} 
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
        </motion.div>

      {/* Modal de Habilitação Anual de Turmas */}
      {showHabilitationModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-[999]">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Habilitação de Turmas para o Ano Letivo {targetHabilitationYear}
                  </h3>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                    Ciclo Vigente: 2026 • Gestão de Continuidade e Progressão de Coortes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHabilitationModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4 bg-white">
              {/* Painel Explicativo */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-lg flex items-start gap-3">
                <Info size={18} className="text-blue-700 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-900 leading-relaxed">
                  No momento vigente (<strong>2026</strong>), as turmas ativas de anos anteriores (<strong>2026, 2025, 2024 e 2023</strong>) 
                  permanecem alocadas no ciclo de 2026. Para que constem em <strong>{targetHabilitationYear}</strong>, você deve habilitá-las abaixo.
                </p>
              </div>

              {/* Seletor de Ano Alvo & Ações em Massa */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Ano Alvo:</span>
                  <select
                    value={targetHabilitationYear}
                    onChange={(e) => setTargetHabilitationYear(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded px-2.5 py-1 outline-none cursor-pointer hover:bg-slate-200/70 transition-all"
                  >
                    <option value="2027">2027 (Próximo Ciclo)</option>
                    <option value="2028">2028</option>
                    <option value="2029">2029</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = eligibleCohortsForHabilitation.map(c => c.id);
                      setAllCohortsHabilitation(targetHabilitationYear, allIds, true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-xs font-bold transition-all cursor-pointer"
                  >
                    <CheckSquare size={13} />
                    <span>Habilitar Todas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = eligibleCohortsForHabilitation.map(c => c.id);
                      setAllCohortsHabilitation(targetHabilitationYear, allIds, false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded text-xs font-bold transition-all cursor-pointer"
                  >
                    <Square size={13} />
                    <span>Desabilitar Todas</span>
                  </button>
                </div>
              </div>

              {/* Lista de Coortes Ativas Elegíveis */}
              <div className="space-y-2.5">
                {eligibleCohortsForHabilitation.length > 0 ? (
                  eligibleCohortsForHabilitation.map((c, cIdx) => (
                    <div
                      key={`hab-c-${c.id || c.code || cIdx}-${cIdx}`}
                      className={cn(
                        "p-3.5 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                        c.isHabilitated
                          ? "bg-emerald-50/40 border-emerald-200"
                          : "bg-slate-50/60 border-slate-200 opacity-80 hover:opacity-100"
                      )}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                          c.isHabilitated ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
                        )}>
                          {c.code || c.name.substring(0, 3)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-bold text-slate-900 leading-tight">{c.name}</h4>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                              c.isHabilitated 
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-200" 
                                : "bg-slate-200 text-slate-600"
                            )}>
                              {c.isHabilitated ? `Habilitada em ${targetHabilitationYear}` : `Não Habilitada em ${targetHabilitationYear}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10.5px] text-slate-500 mt-1 flex-wrap font-medium">
                            <span>Ingresso: <strong>{c.startYr}</strong></span>
                            <span>•</span>
                            <span className="text-indigo-700 font-bold">Progressão: {c.projectedLevel} em {targetHabilitationYear}</span>
                            <span>•</span>
                            <span>{c.activeStudentsCount} Alunos Ativos</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => toggleClassHabilitation(targetHabilitationYear, c.id)}
                          className={cn(
                            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs",
                            c.isHabilitated
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
                          )}
                        >
                          {c.isHabilitated ? (
                            <>
                              <CheckCircle2 size={15} />
                              <span>Habilitada</span>
                            </>
                          ) : (
                            <>
                              <Square size={15} className="text-slate-400" />
                              <span>Habilitar para {targetHabilitationYear}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400 text-xs font-medium">
                    Nenhuma turma ativa encontrada para habilitação.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">
                {eligibleCohortsForHabilitation.filter(c => c.isHabilitated).length} de {eligibleCohortsForHabilitation.length} turmas habilitadas para {targetHabilitationYear}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowHabilitationModal(false);
                  if (selectedAcademicYear === targetHabilitationYear) {
                    fetchStats();
                  }
                }}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs"
              >
                Concluir & Atualizar
              </button>
            </div>
          </motion.div>
        </div>
      )}

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
                          navigate('/students', { state: { studentId: student.id } });
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
