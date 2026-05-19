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
  Wallet,
  ShieldCheck,
  TrendingUp
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

    // Sort dynamically by student count (descending) and name (alphabetical)
    const sorted = [...classStats].sort((a, b) => {
      // First sort by unallocated status (move to end)
      if (a.unallocated && !b.unallocated) return 1;
      if (!a.unallocated && b.unallocated) return -1;

      // Then sort by student count (descending)
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      
      // Finally by name/code
      const nameA = (a.code || a.name || '').toLowerCase();
      const nameB = (b.code || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
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
    <div className="space-y-10 p-2 pb-20">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-[#00174b] tracking-tighter">Painel de Controle</h1>
          <div className="flex items-center gap-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Panorama da Instituição</p>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
               <ShieldCheck size={12} /> Sistema Seguro
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchStats}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-100 text-[#00174b] text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-md hover:border-blue-100 transition-all active:scale-95"
          >
            <RefreshCw size={14} className={cn(isRefreshing && "animate-spin")} />
            Sync Agora
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, idx) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="group relative bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-100/50 border border-slate-50 hover:shadow-2xl transition-all duration-500 overflow-hidden"
          >
            <div className="flex items-start justify-between mb-8 relative z-10">
              <div className={`${stat.bg} ${stat.color} w-14 h-14 rounded-[1.25rem] flex items-center justify-center transition-transform group-hover:scale-110 duration-500`}>
                <stat.icon size={26} />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-4xl font-black text-[#00174b] tracking-tighter mt-1 tabular-nums">
                  {isRefreshing ? "..." : stat.stats.active}
                </h3>
              </div>
            </div>

            <div className="flex items-center justify-between relative z-10">
               <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Rede</span>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      dbStatus === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" : "bg-amber-400"
                    )}></div>
                    <span className="text-[10px] font-bold text-slate-400">{dbInfo.latency || '?'}ms</span>
                  </div>
               </div>
               <div className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[9px] font-black text-slate-600 uppercase tracking-widest">
                  Ativos
               </div>
            </div>

            <div className={`absolute -bottom-6 -right-6 w-32 h-32 blur-[60px] opacity-10 rounded-full transition-all group-hover:opacity-20 ${stat.bg.replace('bg-', 'bg-')}`} />
          </motion.div>
        ))}
      </div>      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-8 bg-white rounded-[3rem] border border-slate-50 shadow-2xl shadow-slate-200/50 overflow-hidden"
        >
          <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white relative overflow-hidden">
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                <Activity size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-[#00174b] tracking-tight">Ocupação Acadêmica</h3>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Análise por Turma</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 relative z-10 font-black text-[9px] uppercase tracking-widest">
              <TrendingUp size={14} className="fill-emerald-600" />
              Live
            </div>
          </div>
          
          <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#fafbfc]">
            {studentsByClass.length > 0 ? (
              studentsByClass.map((c, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "p-6 rounded-[2rem] border transition-all duration-500 group bg-white shadow-sm hover:shadow-xl hover:scale-[1.02]",
                    c.borderClass
                  )}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 px-3 w-auto flex items-center justify-center text-white font-black text-[11px] shadow-xl whitespace-nowrap rounded-xl",
                        "bg-gradient-to-br",
                        c.color
                      )}>
                        {c.code}
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-sm font-black text-[#00174b] tracking-tight truncate">{c.name}</h5>
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-0.5">{c.period}</p>
                      </div>
                    </div>
                    {c.count > 0 && (
                      <button 
                        onClick={() => handleViewStudents(c.id, c.name, !!c.unallocated)}
                        className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                      >
                        <Eye size={16} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end px-1">
                       <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Ocupação</span>
                          <span className="text-lg font-black text-[#00174b] tabular-nums leading-none">{c.percentage}%</span>
                       </div>
                       <div className="text-right">
                          <span className="text-lg font-black text-[#00174b] tabular-nums leading-none">{c.count}</span>
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Alunos</p>
                       </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(c.percentage, 100)}%` }}
                        transition={{ duration: 1.5, ease: "easeOut", delay: i * 0.1 }}
                        className={cn("h-full rounded-full shadow-lg", c.color)} 
                      />
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
               <div className="col-span-full py-20 flex flex-col items-center gap-4 text-slate-300">
                  <RefreshCw size={32} className="animate-spin opacity-20" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Atualizando Dados Acadêmicos...</span>
               </div>
            )}
          </div>
        </motion.div>

        <motion.div
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ delay: 0.6 }}
           className="lg:col-span-4 space-y-6"
        >


           <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-50 space-y-6">
              <h4 className="text-xs font-black text-[#00174b] uppercase tracking-widest px-2">Acesso Rápido</h4>
              <div className="grid grid-cols-2 gap-3">
                 {[
                   { label: 'Novo Aluno', icon: Users, path: '/students' },
                   { label: 'Calendário', icon: Activity, path: '/calendar' },
                   { label: 'Turmas', icon: GraduationCap, path: '/classes' },
                   { label: 'Docentes', icon: UserCheck, path: '/teachers' }
                 ].map((item, i) => (
                    <button 
                      key={i}
                      onClick={() => item.path !== '#' && navigate(item.path)}
                      className="flex flex-col items-center justify-center p-6 bg-[#fafbfc] border border-slate-50 rounded-[2rem] hover:bg-blue-50 hover:border-blue-100 hover:shadow-lg transition-all group"
                    >
                       <item.icon size={22} className="text-slate-300 group-hover:text-blue-600 mb-3" />
                       <span className="text-[9px] font-black text-slate-400 group-hover:text-blue-700 uppercase tracking-widest">{item.label}</span>
                    </button>
                 ))}
              </div>
           </div>
        </motion.div>
      </div>
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
