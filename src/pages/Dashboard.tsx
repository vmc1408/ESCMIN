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
            <h1 className="text-3xl font-black text-[#131b2e] tracking-tight">Dashboard</h1>
            {isRefreshing && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100/50 animate-pulse">
                <RefreshCw size={10} className="animate-spin" />
                Sincronizando...
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-slate-500">Visão geral do sistema de gestão ESCMIN.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Última Sincronização</p>
            <p className="text-xs font-bold text-slate-500">{lastUpdated.toLocaleTimeString('pt-BR')}</p>
          </div>
          <button 
            onClick={fetchStats}
            disabled={isRefreshing}
            className={cn(
              "p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-[#131b2e] hover:border-slate-300 transition-all shadow-sm active:scale-95",
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="group relative bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`${stat.bg} ${stat.color} p-2.5 rounded-xl border ${stat.border} transition-transform group-hover:scale-110 duration-300`}>
                <stat.icon size={22} />
              </div>
              <button className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all">
                <ArrowUpRight size={16} />
              </button>
            </div>

            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-blue-600/80 uppercase tracking-widest mb-1">{stat.label} Operacionais</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-black text-[#131b2e] tracking-tighter transition-all duration-500">
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="px-7 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-blue-600 border border-slate-100">
              <GraduationCap size={20} />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-[#00174b]">Ocupação Acadêmica</h3>
              <p className="text-[9px] font-bold text-slate-400">Análise por Turma e Período</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live</span>
          </div>
        </div>
        <div className="p-7 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {studentsByClass.length > 0 ? (
            studentsByClass.map((c, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "p-5 rounded-[1.5rem] border transition-all duration-300 group hover:scale-[1.01] hover:shadow-xl",
                  c.bgClass,
                  c.borderClass,
                  c.glowClass
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-[10px] shadow-lg shadow-current/20",
                      "bg-gradient-to-br",
                      c.color
                    )}>
                      {c.code}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-black text-[#00174b] uppercase truncate max-w-[120px] leading-tight">
                          {c.name}
                        </p>
                        {c.count > 0 && (
                          <button 
                            onClick={() => handleViewStudents(c.id, c.name, !!c.unallocated)}
                            className={cn(
                              "px-2 py-0.5 rounded-lg text-[8px] font-black border transition-all active:scale-95 shadow-sm whitespace-nowrap",
                              c.unallocated 
                                ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-500 hover:text-white" 
                                : "bg-white text-slate-500 border-slate-200 hover:bg-blue-600 hover:text-white hover:border-blue-600"
                            )}
                          >
                            VER ALUNOS
                          </button>
                        )}
                      </div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5 opacity-70">
                        {c.period}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black text-[#00174b] tabular-nums tracking-tighter leading-none">
                      {c.count}
                    </p>
                    <p className={cn("text-[8px] font-black uppercase tracking-tighter mt-1", c.textClass)}>
                      Alunos
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest opacity-60">Ocupação</span>
                    <span className={cn("text-[9px] font-black tabular-nums", c.textClass)}>{c.percentage}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/40 rounded-full overflow-hidden border border-white/50 p-[2px] shadow-inner ring-1 ring-slate-100/20">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(c.percentage, 100)}%` }}
                      transition={{ duration: 1.2, ease: "easeOut", delay: i * 0.1 }}
                      className={cn("h-full bg-gradient-to-r rounded-full shadow-sm relative group-hover:brightness-110 transition-all", c.color)} 
                    >
                      <div className="absolute inset-0 bg-white/10 mix-blend-overlay"></div>
                    </motion.div>
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-black text-[#00174b]">{selectedClassLabel}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                  {isUnallocatedContext 
                    ? "Alunos ativos mas não vinculados a uma turma vigente"
                    : `Lista de alunos matriculados na turma ${selectedClassLabel}`
                  }
                </p>
              </div>
              <button 
                onClick={() => setShowStudentsModal(false)}
                className="w-10 h-10 rounded-xl hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-95 shadow-sm border border-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                {selectedClassStudents.length > 0 ? (
                  selectedClassStudents.map((student) => (
                    <div key={student.id} className="p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between group hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-[#00174b] font-black text-lg border border-slate-200 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <h5 className="font-black text-[#00174b] group-hover:text-blue-700 transition-colors">{student.name}</h5>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter mt-0.5">CPF: {student.cpf || 'Não informado'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => {
                              setShowStudentsModal(false);
                              navigate('/students', { state: { studentId: student.id } });
                            }}
                            className="p-1.5 bg-slate-50 hover:bg-blue-600 text-slate-400 hover:text-white rounded-lg transition-all shadow-sm border border-slate-100"
                            title="Ver Ficha do Aluno"
                          >
                            <UserCircle size={14} />
                          </button>
                          <button 
                            onClick={() => {
                              setShowStudentsModal(false);
                              navigate('/contributions', { state: { studentId: student.id } });
                            }}
                            className="p-1.5 bg-slate-50 hover:bg-emerald-600 text-slate-400 hover:text-white rounded-lg transition-all shadow-sm border border-slate-100"
                            title="Ver Financeiro"
                          >
                            <Wallet size={14} />
                          </button>
                          <span className={cn(
                            "px-3 py-1 text-[10px] font-black uppercase rounded-lg tracking-widest leading-none",
                            isUnallocatedContext ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                          )}>
                            {isUnallocatedContext ? "Requer Enturmação" : "Regular"}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-300 uppercase mt-1">ID: {student.registration_number}</p>
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
