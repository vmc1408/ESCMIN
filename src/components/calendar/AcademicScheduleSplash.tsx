import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Eye, EyeOff, Repeat, CalendarDays } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAllAcademicSchedulePeriods, formatDateBR, SchedulePeriod } from '../../lib/academicUtils';

interface AcademicScheduleSplashProps {
  settings: any;
  className?: string;
  defaultExpanded?: boolean;
  onOpenDaysReport?: () => void;
}

export function AcademicScheduleSplash({ 
  settings, 
  className = '', 
  defaultExpanded = true,
  onOpenDaysReport
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
      className={`bg-white border border-slate-200/90 rounded-2xl shadow-2xs p-3 sm:p-4 transition-all ${className}`}
      onMouseEnter={() => setIsPeriodPaused(true)}
      onMouseLeave={() => setIsPeriodPaused(false)}
    >
      {/* Barra superior de controle do Splash */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-2.5 ${showSchedule ? 'pb-2.5 border-b border-slate-100 mb-3' : ''}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-700 shrink-0">
            <Calendar size={14} />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
            <span className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight whitespace-nowrap">
              Ciclo Letivo e Semestres
            </span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">·</span>
            <span className="text-[11px] font-semibold text-teal-700 whitespace-nowrap">
              Cronograma Oficial{!showSchedule ? ` (${currentPeriod.label})` : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end shrink-0">
          {/* Seletor de Dias/Cronogramas */}
          {showSchedule && periods.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 h-[34px]">
              <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase text-slate-500 tracking-wider px-2 select-none whitespace-nowrap">
                <Repeat size={11} className="text-slate-400 shrink-0" />
                <span className="hidden sm:inline">Dia Letivo:</span>
              </span>
              {periods.map((p, idx) => {
                const isActive = idx === (activePeriodIndex % periods.length);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setActivePeriodIndex(idx)}
                    className={`h-[26px] px-2.5 rounded-md text-[10px] font-bold tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                      isActive 
                        ? 'bg-teal-600 text-white shadow-2xs' 
                        : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}

          {showSchedule && periods.length > 1 && onOpenDaysReport && (
            <div className="hidden sm:block w-px h-5 bg-slate-200 shrink-0" />
          )}

          {/* Botão Relatório de Dias e Meses de Aula */}
          {onOpenDaysReport && (
            <button
              type="button"
              onClick={onOpenDaysReport}
              className="h-[34px] flex items-center gap-1.5 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 hover:text-teal-950 border border-teal-200 rounded-lg text-[10px] font-bold tracking-wide transition-all cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
              title="Abrir relatório de dias e meses de aula"
            >
              <CalendarDays size={13} className="text-teal-700 shrink-0" />
              <span className="hidden sm:inline">Dias e Meses de Aula</span>
              <span className="inline sm:hidden">Dias de Aula</span>
            </button>
          )}

          {/* Botão Ocultar/Visualizar */}
          <button
            type="button"
            onClick={toggleShowSchedule}
            className="h-[34px] flex items-center gap-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200/90 rounded-lg text-[10px] font-bold tracking-wide transition-all cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
            title={showSchedule ? "Ocultar resumo das datas do cronograma" : "Visualizar resumo das datas do cronograma"}
          >
            {showSchedule ? (
              <>
                <EyeOff size={13} className="text-slate-500 shrink-0" />
                <span className="hidden sm:inline">Ocultar Cronograma</span>
                <span className="inline sm:hidden">Ocultar</span>
              </>
            ) : (
              <>
                <Eye size={13} className="text-teal-700 shrink-0" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
              {/* Card 1º Semestre */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50/90 border border-slate-200/90 hover:bg-slate-100/70 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-700 shrink-0">
                  <Calendar size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    <span>1º Semestre Letivo</span>
                    {periods.length > 1 && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-teal-700">{currentPeriod.label}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-slate-700 mt-0.5">
                    {formatPeriodDisplay(currentPeriod.t1Start, currentPeriod.t1End)}
                  </div>
                </div>
              </div>

              {/* Card 2º Semestre */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50/90 border border-slate-200/90 hover:bg-slate-100/70 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 shrink-0">
                  <Calendar size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    <span>2º Semestre Letivo</span>
                    {periods.length > 1 && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-amber-700">{currentPeriod.label}</span>
                      </>
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
