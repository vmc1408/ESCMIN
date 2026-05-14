import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  GraduationCap, 
  BookOpen, 
  UserCheck, 
  ArrowUpRight, 
  RefreshCw, 
  Activity, 
  Eye, 
  X,
  UserCircle,
  Wallet
} from 'lucide-react';
import { fetchCount, fetchAll, saveBatch } from '../lib/database';
import { isDbConnected, isSupabaseConfigured, lastLatency } from '../lib/supabase';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Student, Class } from '../types';

export function Dashboard() {
  const navigate = useNavigate();
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

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

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
      } catch (e) {
        console.error(`Stats error for ${collection}:`, e);
      }
    };

    try {
      // Run updates in parallel
      const [studentsData, classesData] = await Promise.all([
        fetchAll('students'),
        fetchAll('classes'),
        updateCategory('students', 'students'),
        updateCategory('teachers', 'teachers'),
        updateCategory('classes', 'classes'),
        updateCategory('subjects', 'subjects')
      ]);
      
      if (studentsData) setStudents(studentsData);
      if (classesData) setClasses(classesData);
      
      const now = new Date();
      setLastUpdated(now);
      localStorage.setItem('dashboard-stats-last-updated', now.toISOString());
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
        count: unallocatedCount,
        percentage: stats.students.active > 0 ? Math.round((unallocatedCount / stats.students.active) * 100) : 0,
        unallocated: true
      });
    }

    // Sort as requested: teo-26, 25, 24, 23 e ds-2026
    const sortOrder = ['teo-26', 'teo-25', 'teo-24', 'teo-23', 'ds-2026'];
    
    const sorted = [...classStats].sort((a, b) => {
      const indexA = sortOrder.findIndex(pattern => 
        a.code?.toLowerCase().includes(pattern.toLowerCase()) || 
        a.name?.toLowerCase().includes(pattern.toLowerCase())
      );
      const indexB = sortOrder.findIndex(pattern => 
        b.code?.toLowerCase().includes(pattern.toLowerCase()) || 
        b.name?.toLowerCase().includes(pattern.toLowerCase())
      );

      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      return b.count - a.count;
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

  return (
    <div className="space-y-8 p-1">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            {isRefreshing && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-semibold border border-indigo-100/50 animate-pulse">
                <RefreshCw size={10} className="animate-spin" />
                Sincronizando...
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-slate-500">Visão geral do sistema de gestão.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-1">Última Sincronização</p>
            <p className="text-xs font-medium text-slate-500">{lastUpdated.toLocaleTimeString('pt-BR')}</p>
          </div>
          <button 
            onClick={fetchStats}
            disabled={isRefreshing}
            className={cn(
              "p-2.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-95",
              isRefreshing && "opacity-50 cursor-wait"
            )}
          >
            <RefreshCw size={18} className={cn(isRefreshing && "animate-spin")} />
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="group relative bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`${stat.bg} ${stat.color} p-2.5 rounded-lg border ${stat.border} transition-transform group-hover:scale-105 duration-300`}>
                <stat.icon size={22} />
              </div>
              <button className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                <ArrowUpRight size={16} />
              </button>
            </div>

            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold text-slate-900 tracking-tight transition-all duration-500">
                  {isRefreshing ? "..." : stat.stats.active}
                </h3>
                <div className="flex items-center gap-2 group/status relative">
                  <div className={cn(
                    "h-2.5 w-2.5 rounded-full transition-all duration-500",
                    dbStatus === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-400"
                  )}></div>
                  
                  {/* Tooltip de Latência Precision */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#131b2e] text-[10px] text-white rounded opacity-0 group-hover/status:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold z-20 shadow-xl border border-slate-700">
                    {dbInfo.connected ? `${dbInfo.latency || '?'}ms (Estável)` : 'Reconectando...'}
                  </div>
                </div>
              </div>
            </div>
            

            
            {/* Background Accent Gradient */}
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className={`w-24 h-24 blur-3xl opacity-20 rounded-full ${stat.bg.replace('bg-', 'bg-')}`}></div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Ocupação Acadêmica Section moved from Reports */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-indigo-600 border border-slate-200">
              <GraduationCap size={18} />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Ocupação Acadêmica</h3>
              <p className="text-[10px] font-medium text-slate-500">Análise por turma</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Live</span>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {studentsByClass.length > 0 ? (
            studentsByClass.map((c, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "p-4 rounded-xl border transition-all duration-300 group hover:shadow-md",
                  c.bgClass,
                  c.borderClass
                )}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm",
                      "bg-gradient-to-br",
                      c.color
                    )}>
                      {c.code}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-900 truncate max-w-[100px]">
                          {c.name}
                        </p>
                        {c.count > 0 && (
                          <button 
                            onClick={() => handleViewStudents(c.id, c.name, !!c.unallocated)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all active:scale-95 whitespace-nowrap",
                              c.unallocated 
                                ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-600 hover:text-white hover:border-amber-600" 
                                : "bg-white text-slate-600 border-slate-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600"
                            )}
                          >
                            VER
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 uppercase mt-0.5 opacity-70">
                        {c.period}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900 tabular-nums tracking-tight">
                      {c.count}
                    </p>
                    <p className={cn("text-[10px] font-semibold uppercase tracking-tight", c.textClass)}>
                      Alunos
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Ocupação</span>
                    <span className={cn("text-[10px] font-bold tabular-nums", c.textClass)}>{c.percentage}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden border border-slate-100">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(c.percentage, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut", delay: i * 0.1 }}
                      className={cn("h-full rounded-full shadow-sm relative", c.color)} 
                    />
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw size={24} className="animate-spin opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest">Carregando dados ocupacionais...</p>
            </div>
          )}
        </div>
      </motion.div>
      {/* Students Modal */}
      {showStudentsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[999]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedClassLabel}</h3>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-1">
                  {isUnallocatedContext 
                    ? "Alunos ativos sem turma vinculada"
                    : `Alunos matriculados`
                  }
                </p>
              </div>
              <button 
                onClick={() => setShowStudentsModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all border border-slate-200 shadow-sm"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {selectedClassStudents.length > 0 ? (
                  selectedClassStudents.map((student) => (
                    <div key={student.id} className="p-3 bg-white border border-slate-100 rounded-lg flex items-center justify-between hover:border-indigo-200 hover:shadow-sm transition-all group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center text-slate-600 font-bold text-sm border border-slate-200 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <h5 className="text-sm font-bold text-slate-900">{student.name}</h5>
                          <p className="text-[10px] text-slate-500 uppercase mt-0.5">CPF: {student.cpf || '---'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setShowStudentsModal(false);
                            navigate('/students', { state: { studentId: student.id } });
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all border border-transparent hover:border-indigo-100"
                        >
                          <UserCircle size={16} />
                        </button>
                        <span className={cn(
                          "px-2 py-0.5 text-[9px] font-bold uppercase rounded border",
                          isUnallocatedContext ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        )}>
                          {isUnallocatedContext ? "Pendente" : "OK"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10">
                    <p className="text-slate-400 font-bold">Nenhum aluno nesta situação.</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between gap-3">
              {isUnallocatedContext && (
                <button 
                  onClick={handleDeactivateAllUnallocated}
                  disabled={isDeactivating || selectedClassStudents.length === 0}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-black text-sm hover:bg-slate-300 transition-all active:scale-95 flex items-center gap-2"
                >
                  {isDeactivating ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    'DESATIVAR TODOS'
                  )}
                </button>
              )}
              <div className="flex gap-3 flex-1 justify-end">
                <button 
                  onClick={() => {
                    setShowStudentsModal(false);
                    navigate('/students');
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-200"
                >
                  IR PARA ALUNOS
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
