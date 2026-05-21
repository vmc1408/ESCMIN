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

    // Sort by Name (A-Z) and Year (Desc)
    const sorted = [...classStats].sort((a, b) => {
      // First sort by unallocated status (move to end)
      if (a.unallocated && !b.unallocated) return 1;
      if (!a.unallocated && b.unallocated) return -1;

      // Helper to extract year and base name
      const extract = (s: string) => {
        const match = s.match(/\d{4}/);
        const yr = match ? parseInt(match[0]) : 0;
        const name = s.replace(/\d{4}/, '').trim().toLowerCase();
        return { yr, name };
      };

      const infoA = extract(a.name || '');
      const infoB = extract(b.name || '');

      // 1. Base Name (Alphabetical A-Z)
      if (infoA.name !== infoB.name) {
        return infoA.name.localeCompare(infoB.name);
      }

      // 2. Year (Descending)
      if (infoA.yr !== infoB.yr) {
        return infoB.yr - infoA.yr;
      }

      // 3. Fallback to Code
      return (a.code || '').localeCompare(b.code || '');
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
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Painel de Controle</h1>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Panorama da Instituição</p>
            <div className="w-1 h-1 rounded-full bg-slate-200" />
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 uppercase tracking-widest">
               <ShieldCheck size={11} /> Conexão Segura
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchStats}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-white border border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all active:scale-95"
          >
            <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
            Sincronizar
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-8 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
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
          
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/30">
            {studentsByClass.length > 0 ? (
              studentsByClass.map((c, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "p-4 rounded-md border bg-white transition-all shadow-sm flex flex-col h-full",
                    c.borderClass
                  )}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 px-2 flex items-center justify-center text-white font-bold text-[10px] whitespace-nowrap rounded",
                        "bg-slate-700",
                        c.color
                      )}>
                        {c.code}
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-[13px] font-bold text-slate-800 tracking-tight truncate">{c.name}</h5>
                        <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest">{c.period}</p>
                      </div>
                    </div>
                    {c.count > 0 && (
                      <button 
                        onClick={() => handleViewStudents(c.id, c.name, !!c.unallocated)}
                        className="w-6 h-6 rounded bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all flex items-center justify-center border border-slate-200"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </div>

                  <div className="mt-auto space-y-1.5">
                    <div className="flex justify-between items-end px-1">
                       <span className="text-[10px] font-bold text-slate-700">{c.percentage}%</span>
                       <span className="text-[10px] font-medium text-slate-500">{c.count} Alunos</span>
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
              ))
            ) : (
               <div className="col-span-full py-10 flex flex-col items-center gap-3 text-slate-400">
                  <RefreshCw size={24} className="animate-spin opacity-30" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Consultando Banco de Dados...</span>
               </div>
            )}
          </div>
        </motion.div>

        <motion.div
           initial={{ opacity: 0, x: 10 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ delay: 0.5 }}
           className="lg:col-span-4"
        >
           <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Acesso Rápido</h4>
              <div className="grid grid-cols-2 gap-2">
                 {[
                   { label: 'Matricular', icon: Users, path: '/students' },
                   { label: 'Calendário', icon: Activity, path: '/calendar' },
                   { label: 'Turmas', icon: GraduationCap, path: '/classes' },
                   { label: 'Docentes', icon: UserCheck, path: '/teachers' }
                 ].map((item, i) => (
                    <button 
                      key={i}
                      onClick={() => item.path !== '#' && navigate(item.path)}
                      className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-md hover:bg-slate-100 hover:border-slate-200 transition-all group"
                    >
                       <item.icon size={16} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                       <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-800">{item.label}</span>
                    </button>
                 ))}
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                 <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Último Update</span>
                    <span className="text-[10px] font-medium text-slate-600">{lastUpdated.toLocaleTimeString()}</span>
                 </div>
                 <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-bold uppercase tracking-widest border border-blue-100">
                    Sincronizado
                 </div>
              </div>
           </div>
        </motion.div>
      </div>

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
