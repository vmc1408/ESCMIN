import React, { useMemo } from 'react';
import { CalendarEvent, Class, InstitutionSettings } from '../../types';
import { Calendar, CheckCircle2, AlertTriangle, XCircle, Info, CalendarDays } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DayMonthClassReportProps {
  events: CalendarEvent[];
  classes: Class[];
  currentYear: string;
  selectedClassId?: string; // 'all' or class ID
  selectedWeekday?: number | 'all'; // 0..6 or 'all'
  selectedMonth?: number | 'all'; // 0..11 or 'all'
  institution?: InstitutionSettings | null;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function DayMonthClassReport({
  events,
  classes,
  currentYear,
  selectedClassId = 'all',
  selectedWeekday = 'all',
  selectedMonth = 'all'
}: DayMonthClassReportProps) {

  // Process all class events for the year
  const processedData = useMemo(() => {
    // Academic event types representing classes/evaluations
    const targetTypes = ['class_day', 'exam', 'excused_class', 'cancelled_class'];

    const filtered = events.filter(e => {
      if (!e.start_date || !e.start_date.startsWith(currentYear)) return false;
      if (!targetTypes.includes(e.type)) return false;

      // Filter by class
      if (selectedClassId !== 'all') {
        if (e.class_id && e.class_id !== selectedClassId) return false;
      }

      // Filter by weekday
      const d = new Date(e.start_date + 'T00:00:00');
      const wDay = d.getDay();
      if (selectedWeekday !== 'all' && wDay !== selectedWeekday) return false;

      // Filter by month
      const mIdx = d.getMonth();
      if (selectedMonth !== 'all' && mIdx !== selectedMonth) return false;

      return true;
    });

    // Deduplicate same date + type + title to avoid duplicates
    const uniqueMap = new Map<string, CalendarEvent>();
    filtered.forEach(e => {
      const key = `${e.start_date}_${e.type}_${e.class_id || 'all'}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, e);
      }
    });

    const uniqueEvents = Array.from(uniqueMap.values()).sort((a, b) => 
      a.start_date.localeCompare(b.start_date)
    );

    // Grouping: By Weekday OR By Month
    // Let's create an organized structure grouped by Weekday (each weekday has its months and days)
    // and overall summaries.
    const byWeekday: Record<number, {
      weekday: number;
      name: string;
      events: CalendarEvent[];
      byMonth: Record<number, CalendarEvent[]>;
      totalClasses: number;
      regularClasses: number;
      exams: number;
      excused: number;
      cancelled: number;
    }> = {};

    // Grouping by Month (each month has its weekdays and days)
    const byMonth: Record<number, {
      monthIndex: number;
      name: string;
      events: CalendarEvent[];
      byWeekday: Record<number, CalendarEvent[]>;
      totalClasses: number;
      regularClasses: number;
      exams: number;
      excused: number;
      cancelled: number;
    }> = {};

    let totalClassesCount = 0;
    let regularCount = 0;
    let examCount = 0;
    let excusedCount = 0;
    let cancelledCount = 0;

    uniqueEvents.forEach(e => {
      const d = new Date(e.start_date + 'T00:00:00');
      const wDay = d.getDay();
      const mIdx = d.getMonth();

      // Init weekday group
      if (!byWeekday[wDay]) {
        byWeekday[wDay] = {
          weekday: wDay,
          name: WEEKDAY_NAMES[wDay],
          events: [],
          byMonth: {},
          totalClasses: 0,
          regularClasses: 0,
          exams: 0,
          excused: 0,
          cancelled: 0
        };
      }
      byWeekday[wDay].events.push(e);
      if (!byWeekday[wDay].byMonth[mIdx]) {
        byWeekday[wDay].byMonth[mIdx] = [];
      }
      byWeekday[wDay].byMonth[mIdx].push(e);

      // Init month group
      if (!byMonth[mIdx]) {
        byMonth[mIdx] = {
          monthIndex: mIdx,
          name: MONTH_NAMES[mIdx],
          events: [],
          byWeekday: {},
          totalClasses: 0,
          regularClasses: 0,
          exams: 0,
          excused: 0,
          cancelled: 0
        };
      }
      byMonth[mIdx].events.push(e);
      if (!byMonth[mIdx].byWeekday[wDay]) {
        byMonth[mIdx].byWeekday[wDay] = [];
      }
      byMonth[mIdx].byWeekday[wDay].push(e);

      // Counts
      if (e.type === 'class_day') {
        byWeekday[wDay].regularClasses++;
        byMonth[mIdx].regularClasses++;
        regularCount++;
      } else if (e.type === 'exam') {
        byWeekday[wDay].exams++;
        byMonth[mIdx].exams++;
        examCount++;
      } else if (e.type === 'excused_class') {
        byWeekday[wDay].excused++;
        byMonth[mIdx].excused++;
        excusedCount++;
      } else if (e.type === 'cancelled_class') {
        byWeekday[wDay].cancelled++;
        byMonth[mIdx].cancelled++;
        cancelledCount++;
      }

      if (e.type !== 'cancelled_class') {
        byWeekday[wDay].totalClasses++;
        byMonth[mIdx].totalClasses++;
        totalClassesCount++;
      }
    });

    return {
      allEvents: uniqueEvents,
      byWeekday,
      byMonth,
      stats: {
        totalValid: totalClassesCount,
        regular: regularCount,
        exams: examCount,
        excused: excusedCount,
        cancelled: cancelledCount
      }
    };
  }, [events, currentYear, selectedClassId, selectedWeekday, selectedMonth]);

  const selectedClassName = useMemo(() => {
    if (selectedClassId === 'all') return 'Todas as Turmas Ativas';
    const found = classes.find(c => c.id === selectedClassId);
    return found ? `${found.name} (${found.code})` : 'Turma Selecionada';
  }, [selectedClassId, classes]);

  if (processedData.allEvents.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-none my-6">
        <CalendarDays size={36} className="mx-auto text-slate-300 mb-2" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Nenhum dia de aula localizado</h4>
        <p className="text-[10px] text-slate-400 mt-1 max-w-md mx-auto">
          Não foram encontrados dias de aula cadastrados para o ano letivo de {currentYear} com os filtros selecionados.
        </p>
      </div>
    );
  }

  // Active weekdays sorted 1..6 (Seg..Sab), then 0 (Dom) if any
  const sortedWeekdays = Object.keys(processedData.byWeekday)
    .map(Number)
    .sort((a, b) => {
      const orderA = a === 0 ? 7 : a;
      const orderB = b === 0 ? 7 : b;
      return orderA - orderB;
    });

  return (
    <div className="space-y-6 font-sans">
      {/* Informações de Cabeçalho / Filtros do Relatório */}
      <div className="bg-slate-50 border border-slate-200 p-3 sm:p-4 rounded-none flex flex-wrap items-center justify-between gap-3 text-slate-700">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-900">
              Relatório de Dias e Meses Letivos ({currentYear})
            </span>
          </div>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-4">
            Escopo: {selectedClassName} • {selectedWeekday !== 'all' ? WEEKDAY_NAMES[Number(selectedWeekday)] : 'Todos os Dias da Semana'} • {selectedMonth !== 'all' ? MONTH_NAMES[Number(selectedMonth)] : 'Ano Completo (12 Meses)'}
          </p>
        </div>

        {/* Resumo Rápido de Métricas */}
        <div className="flex items-center gap-3 sm:gap-4 divide-x divide-slate-200">
          <div className="text-right">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Dias de Aula</span>
            <span className="text-sm font-black text-slate-900 leading-none">{processedData.stats.totalValid}</span>
          </div>
          <div className="pl-3 sm:pl-4 text-right">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Regulares</span>
            <span className="text-sm font-black text-emerald-700 leading-none">{processedData.stats.regular}</span>
          </div>
          <div className="pl-3 sm:pl-4 text-right">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Avaliações</span>
            <span className="text-sm font-black text-amber-700 leading-none">{processedData.stats.exams}</span>
          </div>
          {processedData.stats.excused > 0 && (
            <div className="pl-3 sm:pl-4 text-right">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Abonadas</span>
              <span className="text-sm font-black text-slate-600 leading-none">{processedData.stats.excused}</span>
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 1: GRADE COMPARATIVA RESUMIDA - MESES X DIAS DA SEMANA */}
      <div className="avoid-break space-y-2">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <Calendar size={13} className="text-slate-700" />
            1. Quadro Sinóptico Mensal de Aulas por Dia da Semana
          </h3>
          <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">
            Distribuição de Encontros por Mês
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-300">
          <table className="w-full text-center border-collapse text-slate-800">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-[8.5px] font-black uppercase tracking-wider text-slate-700">
                <th className="py-2 px-3 text-left w-28 border-r border-slate-200">Mês</th>
                {sortedWeekdays.map(wDay => (
                  <th key={`head-wday-${wDay}`} className="py-2 px-2 border-r border-slate-200">
                    <span className="hidden sm:inline">{WEEKDAY_NAMES[wDay]}</span>
                    <span className="sm:hidden">{WEEKDAY_SHORT[wDay]}</span>
                  </th>
                ))}
                <th className="py-2 px-3 bg-slate-200 text-slate-900 w-24">Total Mês</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[10px]">
              {MONTH_NAMES.map((mName, mIdx) => {
                const monthData = processedData.byMonth[mIdx];
                const totalInMonth = monthData?.totalClasses || 0;
                
                // If filter by month is active, highlight or hide
                if (selectedMonth !== 'all' && selectedMonth !== mIdx) return null;

                return (
                  <tr 
                    key={`synoptic-month-${mIdx}`} 
                    className={cn(
                      "hover:bg-slate-50 transition-colors",
                      totalInMonth > 0 ? "bg-white" : "bg-slate-50/50 opacity-60"
                    )}
                  >
                    <td className="py-1.5 px-3 text-left font-black text-slate-900 border-r border-slate-200 uppercase text-[9px]">
                      {mName}
                    </td>
                    {sortedWeekdays.map(wDay => {
                      const count = monthData?.byWeekday[wDay]?.filter(e => e.type !== 'cancelled_class').length || 0;
                      return (
                        <td key={`cell-${mIdx}-${wDay}`} className="py-1.5 px-2 border-r border-slate-200">
                          {count > 0 ? (
                            <span className={cn(
                              "inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-[10px]",
                              wDay === 3 ? "bg-sky-50 text-sky-800 border border-sky-200" :
                              wDay === 4 ? "bg-amber-50 text-amber-800 border border-amber-200" :
                              "bg-slate-100 text-slate-800"
                            )}>
                              {count} {count === 1 ? 'aula' : 'aulas'}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-medium">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-3 font-black bg-slate-100/70 text-slate-900 text-[10px]">
                      {totalInMonth > 0 ? `${totalInMonth} aulas` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 border-t-2 border-slate-400 font-black text-[9px] uppercase text-slate-900">
                <td className="py-2 px-3 text-left border-r border-slate-300">Total Anual</td>
                {sortedWeekdays.map(wDay => {
                  const wTotal = processedData.byWeekday[wDay]?.totalClasses || 0;
                  return (
                    <td key={`total-wday-${wDay}`} className="py-2 px-2 border-r border-slate-300">
                      {wTotal} aulas
                    </td>
                  );
                })}
                <td className="py-2 px-3 bg-slate-300 text-slate-950 font-black text-[11px]">
                  {processedData.stats.totalValid}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SEÇÃO 2: DETALHAMENTO CRONOLÓGICO SEPARADO POR DIA DA SEMANA */}
      <div className="space-y-6 pt-2">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <CalendarDays size={13} className="text-slate-700" />
            2. Detalhamento dos Dias e Meses por Dia da Semana
          </h3>
          <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">
            Listagem Completa de Datas
          </span>
        </div>

        {sortedWeekdays.map(wDay => {
          const wGroup = processedData.byWeekday[wDay];
          if (!wGroup || wGroup.events.length === 0) return null;

          const sortedMonths = Object.keys(wGroup.byMonth)
            .map(Number)
            .sort((a, b) => a - b);

          return (
            <div key={`weekday-block-${wDay}`} className="page-break border-2 border-slate-300 rounded-none bg-white overflow-hidden shadow-xs">
              {/* Header do Dia da Semana */}
              <div className={cn(
                "p-3 sm:px-4 flex flex-wrap items-center justify-between gap-2 border-b-2",
                wDay === 3 ? "bg-sky-50 border-sky-300 text-sky-950" :
                wDay === 4 ? "bg-amber-50 border-amber-300 text-amber-950" :
                "bg-slate-100 border-slate-300 text-slate-900"
              )}>
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-7 h-7 rounded-none flex items-center justify-center font-black text-xs border uppercase",
                    wDay === 3 ? "bg-sky-600 text-white border-sky-700" :
                    wDay === 4 ? "bg-amber-600 text-white border-amber-700" :
                    "bg-slate-800 text-white border-slate-900"
                  )}>
                    {WEEKDAY_SHORT[wDay]}
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider">
                      {wGroup.name}
                    </h4>
                    <span className="text-[8.5px] font-bold uppercase tracking-widest opacity-75">
                      {wGroup.totalClasses} Encontros Letivos Programados no Ano
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider">
                  <span className="px-2 py-0.5 bg-white/80 rounded border border-current">
                    Regulares: {wGroup.regularClasses}
                  </span>
                  <span className="px-2 py-0.5 bg-white/80 rounded border border-current">
                    Avaliações: {wGroup.exams}
                  </span>
                  {wGroup.excused > 0 && (
                    <span className="px-2 py-0.5 bg-white/80 rounded border border-current">
                      Abonadas: {wGroup.excused}
                    </span>
                  )}
                  {wGroup.cancelled > 0 && (
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200">
                      Canceladas: {wGroup.cancelled}
                    </span>
                  )}
                </div>
              </div>

              {/* Tabela de Meses e Datas */}
              <div className="p-3 sm:p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sortedMonths.map(mIdx => {
                    const mEvents = wGroup.byMonth[mIdx] || [];
                    const validEventsInMonth = mEvents.filter(e => e.type !== 'cancelled_class');

                    return (
                      <div key={`m-card-${wDay}-${mIdx}`} className="avoid-break border border-slate-200 rounded-none bg-slate-50/50 p-2.5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-2">
                            <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider">
                              {MONTH_NAMES[mIdx]}
                            </span>
                            <span className="text-[8px] font-black px-1.5 py-0.2 bg-white text-slate-600 rounded border border-slate-200 uppercase">
                              {validEventsInMonth.length} {validEventsInMonth.length === 1 ? 'dia' : 'dias'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            {mEvents.map(ev => {
                              const d = new Date(ev.start_date + 'T00:00:00');
                              const dayNum = String(d.getDate()).padStart(2, '0');
                              const isExam = ev.type === 'exam';
                              const isExcused = ev.type === 'excused_class';
                              const isCancelled = ev.type === 'cancelled_class';
                              
                              const cleanTitle = (ev.title || '')
                                .replace(/^Dia de Aula - /, '')
                                .replace(/^Aula - /, '')
                                .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
                                .replace(/\[SUBJECTS:\[[\s\S]*?\]\]/g, '')
                                .trim();

                              const className = ev.class_id ? classes.find(c => c.id === ev.class_id)?.name : null;

                              return (
                                <div 
                                  key={`ev-${ev.id}`} 
                                  className={cn(
                                    "flex items-center justify-between gap-1.5 p-1 px-1.5 rounded-none text-[9px] border transition-all",
                                    isCancelled ? "bg-rose-50/80 text-rose-400 border-rose-200 line-through" :
                                    isExam ? "bg-amber-50 text-amber-900 border-amber-200 font-bold" :
                                    isExcused ? "bg-slate-100 text-slate-600 border-slate-200 italic" :
                                    "bg-white text-slate-800 border-slate-200"
                                  )}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={cn(
                                      "w-5 h-5 flex items-center justify-center font-black text-[10px] rounded-none shrink-0 border",
                                      isCancelled ? "bg-rose-200 text-rose-800 border-rose-300" :
                                      isExam ? "bg-amber-500 text-white border-amber-600" :
                                      wDay === 3 ? "bg-sky-100 text-sky-800 border-sky-300" :
                                      wDay === 4 ? "bg-amber-100 text-amber-800 border-amber-300" :
                                      "bg-slate-200 text-slate-800 border-slate-300"
                                    )}>
                                      {dayNum}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="font-bold truncate text-[8.5px] leading-tight">
                                        {cleanTitle || (isExam ? 'Avaliação' : 'Aula Regular')}
                                      </p>
                                      {className && selectedClassId === 'all' && (
                                        <p className="text-[7px] text-slate-400 truncate uppercase leading-none mt-0.5">
                                          {className}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <span className={cn(
                                    "text-[7px] font-black uppercase px-1 py-0.2 rounded border shrink-0",
                                    isCancelled ? "bg-rose-100 text-rose-700 border-rose-300" :
                                    isExam ? "bg-amber-100 text-amber-800 border-amber-300" :
                                    isExcused ? "bg-slate-200 text-slate-700 border-slate-300" :
                                    "bg-slate-50 text-slate-600 border-slate-200"
                                  )}>
                                    {isExam ? 'Prova' : isExcused ? 'Abonada' : isCancelled ? 'Canc.' : 'Aula'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* LEGENDA NO RODAPÉ DO RELATÓRIO */}
      <div className="mt-4 pt-3 border-t border-slate-300 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[8px] font-bold uppercase tracking-wider text-slate-700">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-white border border-slate-300 text-slate-800 flex items-center justify-center font-black">
            01
          </div>
          <span>Aula Regular</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-amber-500 border border-amber-600 text-white flex items-center justify-center font-black">
            01
          </div>
          <span>Avaliação / Exame</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center font-black">
            01
          </div>
          <span>Aula Abonada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-rose-200 border border-rose-300 text-rose-800 flex items-center justify-center font-black line-through">
            01
          </div>
          <span>Aula Cancelada</span>
        </div>
      </div>
    </div>
  );
}
