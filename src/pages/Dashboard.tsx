import React, { useEffect, useState } from 'react';
import { Users, GraduationCap, BookOpen, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Dashboard() {
  const [stats, setStats] = useState({
    students: { total: 0, active: 0, inactive: 0 },
    teachers: { total: 0, active: 0, inactive: 0 },
    classes: { total: 0, active: 0, inactive: 0 },
    subjects: { total: 0, active: 0, inactive: 0 }
  });

  useEffect(() => {
    const fetchStats = async () => {
      const fetchEntityStats = async (table: string) => {
        const [total, active, inactive] = await Promise.all([
          supabase.from(table).select('*', { count: 'exact', head: true }),
          supabase.from(table).select('*', { count: 'exact', head: true }).or('status.eq.Ativo,status.is.null,status.eq.""'),
          supabase.from(table).select('*', { count: 'exact', head: true }).eq('status', 'Inativo')
        ]);
        return {
          total: total.count || 0,
          active: active.count === null ? (total.count || 0) : (active.count || 0),
          inactive: inactive.count || 0
        };
      };

      const [students, teachers, classes, subjects] = await Promise.all([
        fetchEntityStats('students'),
        fetchEntityStats('teachers'),
        fetchEntityStats('classes'),
        fetchEntityStats('subjects')
      ]);
      
      setStats({ students, teachers, classes, subjects });
    };

    fetchStats();
  }, []);

  const statCards = [
    { 
      label: 'Alunos', 
      stats: stats.students, 
      icon: Users, 
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50'
    },
    { 
      label: 'Turmas', 
      stats: stats.classes, 
      icon: GraduationCap, 
      color: 'bg-emerald-500',
      lightColor: 'bg-emerald-50'
    },
    { 
      label: 'Disciplinas', 
      stats: stats.subjects, 
      icon: BookOpen, 
      color: 'bg-amber-500',
      lightColor: 'bg-amber-50'
    },
    { 
      label: 'Professores', 
      stats: stats.teachers, 
      icon: UserCheck, 
      color: 'bg-purple-500',
      lightColor: 'bg-purple-50'
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[#131b2e]">Dashboard</h1>
        <p className="text-slate-500">Bem-vindo ao sistema de gestão ESCMIN.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                <p className="text-3xl font-black text-[#131b2e]">{stat.stats.total}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-2xl text-white shadow-lg shadow-current/20`}>
                <stat.icon size={24} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-4 border-t border-slate-50">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ativos</span>
                <span className="text-sm font-bold text-emerald-600">{stat.stats.active}</span>
              </div>
              <div className="flex flex-col border-l border-slate-50 pl-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inativos</span>
                <span className="text-sm font-bold text-slate-400">{stat.stats.inactive}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
