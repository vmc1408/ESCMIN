import React, { useEffect, useState, useCallback } from 'react';
import { Users, GraduationCap, BookOpen, UserCheck, ArrowUpRight, RefreshCw } from 'lucide-react';
import { fetchCount } from '../lib/database';
import { isDbConnected, isSupabaseConfigured, lastLatency } from '../lib/supabase';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

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
          students: { total: 0, active: 0, inactive: 0 },
          teachers: { total: 0, active: 0, inactive: 0 },
          classes: { total: 0, active: 0, inactive: 0 },
          subjects: { total: 0, active: 0, inactive: 0 }
        };
      }
    }
    return {
      students: { total: 0, active: 0, inactive: 0 },
      teachers: { total: 0, active: 0, inactive: 0 },
      classes: { total: 0, active: 0, inactive: 0 },
      subjects: { total: 0, active: 0, inactive: 0 }
    };
  });

  const [lastUpdated, setLastUpdated] = useState<Date>(() => {
    const cached = localStorage.getItem('dashboard-stats-last-updated');
    return cached ? new Date(cached) : new Date();
  });

  const fetchStats = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setIsRefreshing(true);
    
    const updateCategory = async (category: keyof typeof stats, collection: string) => {
      try {
        // Buscamos apenas Total e Ativo para economizar 1 requisição por card (economiza 33% de tráfego inicial)
        const [total, active] = await Promise.all([
          fetchCount(collection),
          fetchCount(collection, 'Ativo')
        ]);
        
        const inactive = Math.max(0, total - active);
        const newStats = { total, active, inactive };
        
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
      await Promise.allSettled([
        updateCategory('students', 'students'),
        updateCategory('teachers', 'teachers'),
        updateCategory('classes', 'classes'),
        updateCategory('subjects', 'subjects')
      ]);
      
      const now = new Date();
      setLastUpdated(now);
      localStorage.setItem('dashboard-stats-last-updated', now.toISOString());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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
            
            <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-slate-50">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">Inativos</p>
                <p className="text-lg font-black text-slate-400 tracking-tight">
                  {isRefreshing && stat.stats.total === 0 ? "-" : stat.stats.inactive}
                </p>
              </div>
              <div className="space-y-1 border-l border-slate-100 pl-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">Registrados</p>
                <p className="text-lg font-black text-slate-700 tracking-tight">
                  {isRefreshing && stat.stats.total === 0 ? "-" : stat.stats.total}
                </p>
              </div>
            </div>
            
            {/* Background Accent Gradient */}
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className={`w-24 h-24 blur-3xl opacity-20 rounded-full ${stat.bg.replace('bg-', 'bg-')}`}></div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
