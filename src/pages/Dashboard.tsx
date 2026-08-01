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
  X,
  UserCircle,
  Wallet,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Printer,
  Calendar,
  Repeat
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
import { fetchCount, fetchAll, saveBatch } from '../lib/database';
import { isDbConnected, isSupabaseConfigured, lastLatency, testConnection } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { Student, Class, Subject, Teacher } from '../types';
import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
  const navigate = useNavigate();
  const { logout, isConnected, connError } = useAuth();
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
      const [studentsData, classesData, subjectsData, teachersData, acadData] = await Promise.all([
        fetchAll('students'),
        fetchAll('classes'),
        fetchAll('subjects'),
        fetchAll('teachers'),
        fetchAll('academic_settings').catch(() => []),
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
      
      if (subjectsData) {
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
              } catch (e) {}
            }
          }
          return normalized;
        });
        setSubjects(normalizedSubjects);
      }

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
          let normalized = { ...cls };
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

          let metaSem1H1 = (normalized as any).subject_id_sem1_h1 || (normalized as any).subject_id_sem1 || '';
          let metaSem1H2 = (normalized as any).subject_id_sem1_h2 || '';
          let metaSem2H1 = (normalized as any).subject_id_sem2_h1 || (normalized as any).subject_id_sem2 || '';
          let metaSem2H2 = (normalized as any).subject_id_sem2_h2 || '';

          if (normalized.observations) {
            const match = normalized.observations.match(/\[METADATA:(\{[\s\S]*\})\]/);
            if (match && match[1]) {
              try {
                const meta = JSON.parse(match[1]);
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
              } catch (e) {}
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
          return normalized;
        });
        setClasses(normalizedClasses);
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

  const studentsByClass = useMemo(() => {
    const activeClasses = classes.filter(c => c.status === 'Ativo');
    const activeStudents = students.filter(s => s.status === 'Ativo' || !s.status);
    
    // Create base stats from active classes
    const classStats = activeClasses.map(c => {
      const count = activeStudents.filter(s => s.class_id === c.id).length;
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        period: c.period,
        subject_ids: c.subject_ids || [],
        subject_id_sem1_h1: (c as any).subject_id_sem1_h1,
        subject_id_sem1_h2: (c as any).subject_id_sem1_h2,
        subject_id_sem2_h1: (c as any).subject_id_sem2_h1,
        subject_id_sem2_h2: (c as any).subject_id_sem2_h2,
        subject_id_sem1: (c as any).subject_id_sem1,
        subject_id_sem2: (c as any).subject_id_sem2,
        count,
        percentage: stats.students.active > 0 ? Math.round((count / stats.students.active) * 100) : 0,
        unallocated: false
      };
    });

    // Check for students in inactive classes or without classes
    const activeClassIds = new Set(activeClasses.map(c => c.id));
    const unallocated = activeStudents.filter(s => !s.class_id || !activeClassIds.has(s.class_id));
    const unallocatedCount = unallocated.length;

    if (unallocatedCount > 0) {
      classStats.push({
        id: 'unallocated',
        code: 'S/T',
        name: 'Sem Turma / Turma Inativa',
        period: '---' as any,
        subject_ids: [],
        count: unallocatedCount,
        percentage: stats.students.active > 0 ? Math.round((unallocatedCount / stats.students.active) * 100) : 0,
        unallocated: true
      });
    }

    // Helper to rank classes: 1º ano (1), 2º ano (2), 3º ano (3), 4º ano (4), Cursos Extras (5)
    const getClassRank = (item: { name?: string; code?: string; unallocated?: boolean }) => {
      if (item.unallocated) return 99;

      const name = (item.name || '').toLowerCase();
      const code = (item.code || '').toLowerCase();

      // Explicit ordinal year in name or code
      if (name.includes('1º ano') || name.includes('1° ano') || name.includes('1 ano') || name.includes('1ºano') || name.includes('1°ano')) return 1;
      if (name.includes('2º ano') || name.includes('2° ano') || name.includes('2 ano') || name.includes('2ºano') || name.includes('2°ano')) return 2;
      if (name.includes('3º ano') || name.includes('3° ano') || name.includes('3 ano') || name.includes('3ºano') || name.includes('3°ano')) return 3;
      if (name.includes('4º ano') || name.includes('4° ano') || name.includes('4 ano') || name.includes('4ºano') || name.includes('4°ano')) return 4;

      // Extract 4-digit year (e.g. 2026, 2025, 2024, 2023) or 2-digit code suffix
      let yearNum = 0;
      const match4 = name.match(/20\d\d/) || code.match(/20\d\d/);
      if (match4) {
        yearNum = parseInt(match4[0], 10);
      } else {
        const match2 = code.match(/(\d\d)$/);
        if (match2) {
          const yr = parseInt(match2[1], 10);
          yearNum = yr < 100 ? 2000 + yr : yr;
        }
      }

      // Check if it's the core degree program (e.g. Teologia)
      const isCoreProgram = name.includes('teologia') || code.startsWith('teo');

      if (isCoreProgram) {
        if (yearNum === 2026) return 1; // 1º Ano
        if (yearNum === 2025) return 2; // 2º Ano
        if (yearNum === 2024) return 3; // 3º Ano
        if (yearNum === 2023) return 4; // 4º Ano
      }

      // Extra course / extension (e.g. Doutrina Social da Igreja 2026, DS-2026)
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
  }, [classes, students, stats.students.active]);

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
    const activeStudents = students.filter(s => s.status === 'Ativo' || !s.status);
    
    if (isUnallocated) {
      const activeClasses = classes.filter(c => c.status === 'Ativo');
      const activeClassIds = new Set(activeClasses.map(c => c.id));
      filtered = activeStudents.filter(s => !s.class_id || !activeClassIds.has(s.class_id));
    } else {
      filtered = activeStudents.filter(s => s.class_id === classId);
    }
    
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
    }, 4000);
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
              <span className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-500 tracking-wider px-2 py-0.5">
                <Repeat size={11} className="text-purple-600 animate-spin" />
                <span className="hidden sm:inline">Cronogramas:</span>
              </span>
              {periods.map((p, idx) => {
                const isActive = idx === (activePeriodIndex % periods.length);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setActivePeriodIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold tracking-wide transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-purple-600 text-white shadow-xs scale-102' 
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
            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-purple-50/90 border border-purple-200/80 rounded-xl text-slate-800 shadow-2xs min-w-[210px] relative overflow-hidden">
              <div className="p-1.5 bg-purple-600 text-white rounded-lg shrink-0">
                <Calendar size={14} />
              </div>
              <div className="text-[11px] leading-tight font-sans flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold text-purple-900 uppercase text-[9.5px] tracking-wider">
                    1º Semestre
                  </p>
                  {periods.length > 1 && (
                    <span className="text-[8.5px] font-extrabold bg-purple-200/90 text-purple-900 px-1.5 py-0.2 rounded uppercase">
                      {currentPeriod.label}
                    </span>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`t1-${currentPeriod.label}-${currentPeriod.t1Start}`}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.2 }}
                    className="font-bold text-slate-700 mt-0.5"
                  >
                    {formatPeriodDisplay(currentPeriod.t1Start, currentPeriod.t1End)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-indigo-50/90 border border-indigo-200/80 rounded-xl text-slate-800 shadow-2xs min-w-[210px] relative overflow-hidden">
              <div className="p-1.5 bg-indigo-600 text-white rounded-lg shrink-0">
                <Calendar size={14} />
              </div>
              <div className="text-[11px] leading-tight font-sans flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold text-indigo-900 uppercase text-[9.5px] tracking-wider">
                    2º Semestre
                  </p>
                  {periods.length > 1 && (
                    <span className="text-[8.5px] font-extrabold bg-indigo-200/90 text-indigo-900 px-1.5 py-0.2 rounded uppercase">
                      {currentPeriod.label}
                    </span>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`t2-${currentPeriod.label}-${currentPeriod.t2Start}`}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.2 }}
                    className="font-bold text-slate-700 mt-0.5"
                  >
                    {formatPeriodDisplay(currentPeriod.t2Start, currentPeriod.t2End)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {isRefreshing && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded text-[9px] font-black uppercase tracking-widest animate-pulse">
                <RefreshCw size={11} className="animate-spin" />
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

      {/* Acesso Rápido - Posicionado acima dos Cards Informativos */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-5 rounded-lg shadow-sm border border-slate-200"
      >
        <div className="flex items-center justify-between mb-3.5">
          <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Acesso Rápido</h4>
          <div className="flex items-center gap-2">
            <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Último Update: {lastUpdated.toLocaleTimeString()}</span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-bold uppercase tracking-widest border border-blue-100">
              Sincronizado
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { 
              label: 'Matricular', 
              icon: UserPlus, 
              path: '/students', 
              state: { action: 'new' },
              bg: 'bg-indigo-50/45 hover:bg-indigo-50/85 border-indigo-100/70 hover:border-indigo-200', 
              iconColor: 'text-indigo-600', 
              hoverShadow: 'hover:shadow-[0_6px_16px_rgba(99,102,241,0.12)]' 
            },
            { 
              label: 'Ficha do Aluno', 
              icon: UserCircle, 
              path: '/student-ficha', 
              bg: 'bg-rose-50/45 hover:bg-rose-50/85 border-rose-100/70 hover:border-rose-200', 
              iconColor: 'text-rose-600', 
              hoverShadow: 'hover:shadow-[0_6px_16px_rgba(244,63,94,0.12)]' 
            },
            { 
              label: 'Gerar Impressos', 
              icon: Printer, 
              path: '/impressos', 
              bg: 'bg-sky-50/45 hover:bg-sky-50/85 border-sky-100/70 hover:border-sky-200', 
              iconColor: 'text-sky-600', 
              hoverShadow: 'hover:shadow-[0_6px_16px_rgba(56,189,248,0.12)]' 
            },
            { 
              label: 'Turmas / Classes', 
              icon: GraduationCap, 
              path: '/classes', 
              bg: 'bg-emerald-50/45 hover:bg-emerald-50/85 border-emerald-100/70 hover:border-emerald-200', 
              iconColor: 'text-emerald-600', 
              hoverShadow: 'hover:shadow-[0_6px_16px_rgba(16,185,129,0.12)]' 
            },
            { 
              label: 'Calendário', 
              icon: Calendar, 
              path: '/calendar', 
              bg: 'bg-amber-50/45 hover:bg-amber-50/85 border-amber-100/70 hover:border-amber-200', 
              iconColor: 'text-amber-600', 
              hoverShadow: 'hover:shadow-[0_6px_16px_rgba(245,158,11,0.12)]' 
            },
            { 
              label: 'Contribuições', 
              icon: Wallet, 
              path: '/contributions', 
              bg: 'bg-violet-50/45 hover:bg-violet-50/85 border-violet-100/70 hover:border-violet-200', 
              iconColor: 'text-violet-600', 
              hoverShadow: 'hover:shadow-[0_6px_16px_rgba(139,92,246,0.12)]' 
            }
          ].map((item, i) => (
            <button 
              key={i}
              onClick={() => {
                if (item.path !== '#') {
                  navigate(item.path, item.state ? { state: item.state } : undefined);
                }
              }}
              className={cn(
                "flex flex-col items-start gap-1.5 p-3 border rounded-lg transition-all duration-300 text-left group hover:-translate-y-0.5 cursor-pointer w-full",
                item.bg,
                item.hoverShadow
              )}
            >
              <div className="p-1.5 rounded-md bg-white shadow-sm border border-slate-100 transition-colors duration-300">
                <item.icon size={16} className={cn("transition-transform duration-300 group-hover:scale-110 shrink-0", item.iconColor)} />
              </div>
              <span className="text-[9.5px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors tracking-tight leading-tight uppercase">
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
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
              <Activity size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Ocupação Acadêmica</h3>
              <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">Distribuição por Turma</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-bold uppercase tracking-widest border border-emerald-100">
            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
            Tempo Real
          </div>
        </div>
        
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/30">
            {studentsByClass.length > 0 ? (
              studentsByClass.map((c, i) => {
                const classSubjectList = (c.subject_ids || [])
                  .map(sid => subjects.find(s => s.id === sid))
                  .filter(Boolean) as Subject[];

                const sem1SlotIds = new Set([
                  c.subject_id_sem1_h1,
                  c.subject_id_sem1_h2,
                  c.subject_id_sem1
                ].filter(Boolean));

                const sem2SlotIds = new Set([
                  c.subject_id_sem2_h1,
                  c.subject_id_sem2_h2,
                  c.subject_id_sem2
                ].filter(Boolean));

                const sem1Subs: Subject[] = [];
                const sem2Subs: Subject[] = [];
                const remainingSubs: Subject[] = [];

                classSubjectList.forEach(s => {
                  if (sem1SlotIds.has(s.id)) {
                    sem1Subs.push(s);
                  } else if (sem2SlotIds.has(s.id)) {
                    sem2Subs.push(s);
                  } else {
                    const sem = (s.semester || '').toLowerCase();
                    const name = (s.name || '').toLowerCase();
                    const isSem1 = sem.includes('1') || name.includes('1º') || name.includes('1°') || name.includes('1 sem');
                    const isSem2 = sem.includes('2') || name.includes('2º') || name.includes('2°') || name.includes('2 sem');

                    if (isSem1 && !isSem2) {
                      sem1Subs.push(s);
                    } else if (isSem2 && !isSem1) {
                      sem2Subs.push(s);
                    } else {
                      remainingSubs.push(s);
                    }
                  }
                });

                if (remainingSubs.length > 0) {
                  if (sem1Subs.length === 0 && sem2Subs.length > 0) {
                    sem1Subs.push(...remainingSubs);
                  } else if (sem2Subs.length === 0 && sem1Subs.length > 0) {
                    sem2Subs.push(...remainingSubs);
                  } else if (sem1Subs.length === 0 && sem2Subs.length === 0) {
                    if (remainingSubs.length === 2) {
                      sem1Subs.push(remainingSubs[0]);
                      sem2Subs.push(remainingSubs[1]);
                    } else if (remainingSubs.length === 4) {
                      sem1Subs.push(remainingSubs[0], remainingSubs[1]);
                      sem2Subs.push(remainingSubs[2], remainingSubs[3]);
                    } else {
                      const half = Math.ceil(remainingSubs.length / 2);
                      sem1Subs.push(...remainingSubs.slice(0, half));
                      sem2Subs.push(...remainingSubs.slice(half));
                    }
                  } else {
                    remainingSubs.forEach(s => {
                      if (sem1Subs.length <= sem2Subs.length) {
                        sem1Subs.push(s);
                      } else {
                        sem2Subs.push(s);
                      }
                    });
                  }
                }

                const activeSubs = activeSemesterNum === 1 ? sem1Subs : sem2Subs;

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
                            <h5 className="text-[12px] font-bold text-slate-800 tracking-tight truncate leading-snug">{c.name}</h5>
                            <p className="text-[8.5px] font-medium text-slate-500 uppercase tracking-wider">{c.period}</p>
                          </div>
                        </div>
                      </div>

                      {/* Informações das Matérias Apenas do Semestre Ativo */}
                      {!c.unallocated && (
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
                                activeSubs.map(s => {
                                  const t = getSubjectTeacher(s);
                                  return (
                                    <div key={s.id} className="min-w-0 leading-tight py-0.5">
                                      <p className="text-[9px] font-bold text-slate-800 truncate">{s.name}</p>
                                      <p className="text-[8px] text-slate-500 truncate">{t ? `Prof. ${t.name}` : 'Sem prof. atribuído'}</p>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-[8.5px] text-slate-400 italic py-0.5">
                                  {classSubjectList.length > 0 ? `Sem matérias no ${activeSemesterNum}º Sem` : 'Sem matérias vinculadas'}
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
               <div className="col-span-full py-10 flex flex-col items-center gap-3 text-slate-400">
                  <RefreshCw size={24} className="animate-spin opacity-30" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Consultando Banco de Dados...</span>
               </div>
            )}
          </div>
        </motion.div>

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
                  selectedClassStudents.map((student) => (
                    <div key={student.id} className="p-2 border border-slate-100 rounded-md flex items-center justify-between hover:bg-slate-50 transition-all">
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
                  navigate('/students');
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md font-bold text-[10px] hover:bg-indigo-700 uppercase tracking-widest shadow-sm ml-auto"
              >
                Gerenciar Alunos
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
