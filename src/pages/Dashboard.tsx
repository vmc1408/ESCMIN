import React, { useEffect, useState, useCallback } from 'react';
import { Users, GraduationCap, BookOpen, UserCheck, ArrowUpRight, RefreshCw } from 'lucide-react';
import { db, fetchCount } from '../lib/firebase';
import { motion } from 'motion/react';

export function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    students: { total: 0, active: 0, inactive: 0 },
    teachers: { total: 0, active: 0, inactive: 0 },
    classes: { total: 0, active: 0, inactive: 0 },
    subjects: { total: 0, active: 0, inactive: 0 }
  });

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const getStats = async (collectionName: string) => {
      try {
        const [total, active, inactive] = await Promise.all([
          fetchCount(collectionName),
          fetchCount(collectionName, 'Ativo'),
          fetchCount(collectionName, 'Inativo')
        ]);
        
        return { total, active, inactive };
      } catch (e) {
        console.error(`Stats error for ${collectionName}:`, e);
        return { total: 0, active: 0, inactive: 0 };
      }
    };

    try {
      const [students, teachers, classes, subjects] = await Promise.all([
        getStats('students'),
        getStats('teachers'),
        getStats('classes'),
        getStats('subjects')
      ]);
      setStats({ students, teachers, classes, subjects });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    
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
          <h1 className="text-3xl font-black text-[#131b2e] tracking-tight">Dashboard</h1>
          <p className="text-sm font-medium text-slate-500">Visão geral do sistema de gestão ESCMIN.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Última Sincronização</p>
            <p className="text-xs font-bold text-slate-500">{lastUpdated.toLocaleTimeString('pt-BR')}</p>
          </div>
          <button 
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-100 rounded-2xl text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Atualizando...' : 'Atualizar Dados'}
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
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">{stat.label} Ativos</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-5xl font-black text-[#131b2e] tracking-tighter">{stat.stats.active}</h3>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-slate-50">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">Inativos</p>
                <p className="text-lg font-black text-slate-400 tracking-tight">{stat.stats.inactive}</p>
              </div>
              <div className="space-y-1 border-l border-slate-100 pl-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">Registrados</p>
                <p className="text-lg font-black text-slate-700 tracking-tight">{stat.stats.total}</p>
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
