import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Users, GraduationCap, BookOpen, UserCheck, ArrowUpRight, RefreshCw, Activity } from 'lucide-react';
import { fetchCount, fetchAll } from '../lib/database';
import { isDbConnected, isSupabaseConfigured, lastLatency } from '../lib/supabase';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Student, Class } from '../types';

export function Dashboard() {
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
        const [total, active, archived] = await Promise.all([
          fetchCount(collection),
          fetchCount(collection, 'Ativo'),
          fetchCount(collection, 'Arquivado') // Custom logic added to database.ts
        ]);
        
        const inactive = Math.max(0, total - active);
        const newStats = { total: total + archived, active, inactive, archived, current: total };
        
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

  const studentsByClass = useMemo(() => {
    return classes
      .filter(c => c.status === 'Ativo')
      .map(c => {
        const count = students.filter(s => s.class_id === c.id).length;
        const totalActive = stats.students.active;
        return {
          code: c.code,
          name: c.name,
          period: c.period,
          count,
          percentage: totalActive > 0 ? Math.round((count / totalActive) * 100) : (stats.students.total > 0 ? Math.round((count / stats.students.total) * 100) : 0)
        };
      }).sort((a, b) => b.count - a.count);
  }, [classes, students, stats.students.active, stats.students.total]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, idx) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="group relative bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-6">
              <div className={`${stat.bg} ${stat.color} p-3.5 rounded-2xl border ${stat.border} transition-transform group-hover:scale-110 duration-300`}>
                <stat.icon size={26} />
              </div>
              <button className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all">
                <ArrowUpRight size={18} />
              </button>
            </div>

            <div className="space-y-0.5">
              <p className="text-[11px] font-black text-blue-600/80 uppercase tracking-[0.2em] mb-1">{stat.label} Ativos</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-6xl font-black text-[#131b2e] tracking-tighter transition-all duration-500">
                  {isRefreshing && stat.stats.total === 0 ? "..." : stat.stats.active}
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
        className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center text-blue-600">
              <GraduationCap size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#00174b]">Ocupação Acadêmica</h3>
              <p className="text-[10px] font-bold text-slate-400">Análise por Turma e Período</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Atualizado Realtime</span>
          </div>
        </div>
        <div className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {studentsByClass.length > 0 ? (
            studentsByClass.slice(0, 6).map((c, i) => (
              <div key={i} className="space-y-3 group">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      {c.code}
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#00174b] group-hover:text-blue-600 transition-colors uppercase truncate max-w-[150px]">{c.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{c.period}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#00174b]">{c.count} Alunos</p>
                    <p className="text-[10px] font-bold text-emerald-500">{c.percentage}% do Efetivo</p>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${c.percentage}%` }}
                    transition={{ duration: 1, delay: i * 0.1 }}
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-sm" 
                  ></motion.div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw size={24} className="animate-spin opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest">Carregando dados ocupacionais...</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
