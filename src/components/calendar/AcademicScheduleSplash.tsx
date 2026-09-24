import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Eye, EyeOff, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAllAcademicSchedulePeriods, formatDateBR, SchedulePeriod } from '../../lib/academicUtils';

interface AcademicScheduleSplashProps {
  settings: any;
  className?: string;
  defaultExpanded?: boolean;
}

export function AcademicScheduleSplash({ 
  settings, 
  className = '', 
  defaultExpanded = true 
}: AcademicScheduleSplashProps) {
  const [showSchedule, setShowSchedule] = useState(() => {
    try {
      const stored = localStorage.getItem('academic_calendar_show_schedule_splash');
      if (stored !== null) {
        return stored === 'true';
      }
      return defaultExpanded;
    } catch {
      return defaultExpanded;
    }
  });

  const toggleShowSchedule = () => {
    setShowSchedule(prev => {
      const next = !prev;
      try {
        localStorage.setItem('academic_calendar_show_schedule_splash', String(next));
      } catch {}
      return next;
    });
  };

  const periods: SchedulePeriod[] = useMemo(() => {
    const raw = getAllAcademicSchedulePeriods(settings);
    // Filtragem defensiva: Domingo nunca é dia de aula
    return raw.filter(p => p.dayNum !== 0 && !p.label.toLowerCase().includes('domingo'));
  }, [settings]);

  const [activePeriodIndex, setActivePeriodIndex] = useState(0);
  const [isPeriodPaused, setIsPeriodPaused] = useState(false);

  // Troca automática entre os períodos a cada 8 segundos se houver múltiplos
  useEffect(() => {
    if (periods.length <= 1 || isPeriodPaused) return;
    const interval = setInterval(() => {
      setActivePeriodIndex(prev => (prev + 1) % periods.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [periods.length, isPeriodPaused]);

  if (!periods || periods.length === 0) {
    return null;
  }

  const currentPeriod = periods[activePeriodIndex % Math.max(1, periods.length)] || {
    label: 'Geral',
    t1Start: '',
    t1End: '',
    t2Start: '',
    t2End: ''
  };

  const formatPeriodDisplay = (startStr: string, endStr: string) => {
    if (startStr && endStr) {
      return (
        <span className="tabular-nums">
          <span className="font-bold text-slate-900">{formatDateBR(startStr)}</span>
          <span className="text-slate-400 font-normal mx-1">até</span>
          <span className="font-bold text-slate-900">{formatDateBR(endStr)}</span>
        </span>
      );
    }
    if (startStr) {
      return <span>A partir de <strong className="text-slate-900">{formatDateBR(startStr)}</strong></span>;
    }
    if (endStr) {
      return <span>Até <strong className="text-slate-900">{formatDateBR(endStr)}</strong></span>;
    }
    return <span className="text-slate-400 font-medium italic">Datas a definir</span>;
  };

  return (
    <div 
      className={`bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 sm:p-4 transition-all ${className}`}
      onMouseEnter={() => setIsPeriodPaused(true)}
      onMouseLeave={() => setIsPeriodPaused(false)}
    >
      {/* Barra superior de controle do Splash */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shrink-0">
            <Calendar size={13} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 tracking-tight">
              Ciclo Letivo e Semestres
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/80">
              Cronograma Oficial
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Seletor de Dias/Cronogramas */}
          {showSchedule && periods.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-500 tracking-wider px-2 py-0.5 select-none">
                <Repeat size={10} className="text-slate-400" />
                <span className="hidden sm:inline">Cronogramas:</span>
              </span>
              {periods.map((p, idx) => {
                const isActive = idx === (activePeriodIndex % periods.length);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setActivePeriodIndex(idx)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-blue-900 text-white shadow-2xs' 
                        : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Botão Ocultar/Visualizar */}
          <button
            type="button"
            onClick={toggleShowSchedule}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200/90 rounded-lg text-[10px] font-bold tracking-wide transition-all cursor-pointer shadow-2xs"
            title={showSchedule ? "Ocultar resumo das datas do cronograma" : "Visualizar resumo das datas do cronograma"}
          >
            {showSchedule ? (
              <>
                <EyeOff size={12} className="text-slate-500" />
                <span className="hidden sm:inline">Ocultar Cronograma</span>
                <span className="inline sm:hidden">Ocultar</span>
              </>
            ) : (
              <>
                <Eye size={12} className="text-blue-600" />
                <span className="hidden sm:inline">Visualizar Cronograma</span>
                <span className="inline sm:hidden">Ver Datas</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Cards dos Semestres Letivos */}
      <AnimatePresence>
        {showSchedule && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Card 1º Semestre */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/90 shadow-2xs hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-700 shrink-0">
                  <Calendar size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      1º Semestre Letivo
                    </span>
                    {periods.length > 1 && (
                      <span className="text-[8.5px] font-bold bg-blue-100/70 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200 uppercase">
                        {currentPeriod.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-slate-700 mt-0.5">
                    {formatPeriodDisplay(currentPeriod.t1Start, currentPeriod.t1End)}
                  </div>
                </div>
              </div>

              {/* Card 2º Semestre */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/90 shadow-2xs hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-700 shrink-0">
                  <Calendar size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      2º Semestre Letivo
                    </span>
                    {periods.length > 1 && (
                      <span className="text-[8.5px] font-bold bg-indigo-100/70 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200 uppercase">
                        {currentPeriod.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-slate-700 mt-0.5">
                    {formatPeriodDisplay(currentPeriod.t2Start, currentPeriod.t2End)}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
