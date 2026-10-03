import React, { useMemo } from 'react';
import { CalendarEvent, InstitutionSettings } from '../../types';
import { CalendarDays, Calendar, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DayMonthClassReportProps {
  events: CalendarEvent[];
  currentYear: string;
  selectedWeekday?: number | 'all'; // 0..6 or 'all'
  selectedMonth?: number | 'all'; // 0..11 or 'all'
  institution?: InstitutionSettings | null;
  onPrint?: () => void;
  isInlineView?: boolean;
  variant?: 'consolidated' | 'detailed' | 'both';
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

interface MonthReportData {
  monthIndex: number;
  monthName: string;
  days: number[]; // Distinct days of the month with classes, sorted: [4, 10, 12, 16]
  totalClasses: number;
}

interface WeekdayReportData {
  weekday: number;
  weekdayName: string;
  months: MonthReportData[];
  totalAnnualClasses: number;
}

export function DayMonthClassReport({
  events,
  currentYear,
  selectedWeekday = 'all',
  selectedMonth = 'all',
  institution,
  onPrint,
  isInlineView = false,
  variant
}: DayMonthClassReportProps) {
  const [activeTab, setActiveTab] = React.useState<'consolidated' | 'detailed'>(() => {
    if (variant === 'consolidated') return 'consolidated';
    return 'detailed';
  });

  const effectiveVariant = variant || activeTab;

  // Process schedule dates:
  // ONLY dates defined in the schedule as class days / exams (class_day, exam)
  // Deduplicated strictly by date: 1 date = 1 class day regardless of how many classes/subjects exist!
  const { weekdaySections, totalAnnualAllWeekdays, synopticTable } = useMemo(() => {
    const targetTypes = ['class_day', 'exam'];

    // 1. Collect all unique class dates in the year
    const uniqueDates = new Set<string>();

    events.forEach(e => {
      if (!e.start_date || !e.start_date.startsWith(currentYear)) return;
      if (!targetTypes.includes(e.type)) return;
      uniqueDates.add(e.start_date);
    });

    const sortedDates = Array.from(uniqueDates).sort();

    // Map: weekday -> monthIndex -> Set of day numbers
    const weekdayMap = new Map<number, Map<number, Set<number>>>();
    // Map: monthIndex -> Set of all day numbers (across weekdays)
    const monthAllMap = new Map<number, Set<number>>();

    sortedDates.forEach(dateStr => {
      const d = new Date(dateStr + 'T00:00:00');
      const wDay = d.getDay();
      const mIdx = d.getMonth();
      const dayNum = d.getDate();

      // Filter by selected weekday if set
      if (selectedWeekday !== 'all' && wDay !== selectedWeekday) return;

      // Filter by selected month if set
      if (selectedMonth !== 'all' && mIdx !== selectedMonth) return;

      if (!weekdayMap.has(wDay)) {
        weekdayMap.set(wDay, new Map<number, Set<number>>());
      }
      const mGroup = weekdayMap.get(wDay)!;
      if (!mGroup.has(mIdx)) {
        mGroup.set(mIdx, new Set<number>());
      }
      mGroup.get(mIdx)!.add(dayNum);

      if (!monthAllMap.has(mIdx)) {
        monthAllMap.set(mIdx, new Set<number>());
      }
      monthAllMap.get(mIdx)!.add(dayNum);
    });

    // Build structured sections for each weekday
    const weekdayKeys = Array.from(weekdayMap.keys()).sort((a, b) => {
      const orderA = a === 0 ? 7 : a;
      const orderB = b === 0 ? 7 : b;
      return orderA - orderB;
    });

    let overallTotal = 0;

    const weekdaySections: WeekdayReportData[] = weekdayKeys.map(wDay => {
      const mGroup = weekdayMap.get(wDay)!;
      const monthIndices = Array.from(mGroup.keys()).sort((a, b) => a - b);

      let wTotal = 0;
      const months: MonthReportData[] = monthIndices.map(mIdx => {
        const days = Array.from(mGroup.get(mIdx)!).sort((a, b) => a - b);
        wTotal += days.length;
        return {
          monthIndex: mIdx,
          monthName: MONTH_NAMES[mIdx],
          days,
          totalClasses: days.length
        };
      });

      overallTotal += wTotal;

      return {
        weekday: wDay,
        weekdayName: WEEKDAY_NAMES[wDay],
        months,
        totalAnnualClasses: wTotal
      };
    });

    // Synoptic Table: Month x Weekday
    const synopticTable = MONTH_NAMES.map((mName, mIdx) => {
      if (selectedMonth !== 'all' && selectedMonth !== mIdx) return null;

      const cells: Record<number, number> = {};
      let monthTotal = 0;

      weekdayKeys.forEach(wDay => {
        const days = weekdayMap.get(wDay)?.get(mIdx);
        const count = days ? days.size : 0;
        cells[wDay] = count;
        monthTotal += count;
      });

      return {
        monthIndex: mIdx,
        monthName: mName,
        cells,
        monthTotal
      };
    }).filter(Boolean);

    return {
      weekdaySections,
      totalAnnualAllWeekdays: overallTotal,
      synopticTable: synopticTable as { monthIndex: number; monthName: string; cells: Record<number, number>; monthTotal: number }[]
    };
  }, [events, currentYear, selectedWeekday, selectedMonth]);

  if (weekdaySections.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl my-4 bg-slate-50/50">
        <CalendarDays size={32} className="mx-auto text-slate-300 mb-2" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Nenhum dia de aula definido no cronograma</h4>
        <p className="text-[10px] text-slate-400 mt-1 max-w-md mx-auto">
          Não foram encontrados dias de aula cadastrados no cronograma acadêmico de {currentYear}.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 font-sans", isInlineView ? "p-4 sm:p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs" : "")}>
      
      {/* Barra de Título / Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-700 inline-block" />
            <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-900">
              Cronograma: Dias e Meses de Aula ({currentYear})
            </h2>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-4 mt-0.5">
            Dias de aula por mês definidos no cronograma oficial • Separado por dia da semana
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-900 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-2 shadow-xs">
            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Total no Ano:</span>
            <span className="text-sm font-black text-white leading-none">
              {totalAnnualAllWeekdays} {totalAnnualAllWeekdays === 1 ? 'Dia Letivo' : 'Dias Letivos'}
            </span>
          </div>

          {onPrint && (
            <button
              onClick={onPrint}
              className="print:hidden flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
              title="Imprimir este relatório"
            >
              <Printer size={14} />
              <span>Imprimir</span>
            </button>
          )}
        </div>
      </div>

      {/* SELETOR DE MODO DO RELATÓRIO (CONSOLIDADO vs DETALHADO) */}
      <div className="flex items-center justify-between gap-3 bg-slate-150/70 p-1.5 rounded-xl border border-slate-200 print:hidden">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('consolidated')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
              effectiveVariant === 'consolidated'
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            <Calendar size={13} />
            <span>1. Relatório Consolidado (Totais por Mês)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('detailed')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
              effectiveVariant === 'detailed'
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            <CalendarDays size={13} />
            <span>2. Relatório Detalhado (Dias Individuais)</span>
          </button>
        </div>
        
        <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-widest hidden sm:inline pr-2">
          {effectiveVariant === 'consolidated' ? 'Visão: Quadro Sinóptico de Totais' : 'Visão: Relação Nominal de Datas'}
        </span>
      </div>

      {/* 1. QUADRO SINÓPTICO: RESUMO DE DIAS POR MÊS E DIA DA SEMANA (CONSOLIDADO) */}
      {(effectiveVariant === 'consolidated' || effectiveVariant === 'both') && (
      <div className="avoid-break space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <Calendar size={13} className="text-slate-700" />
            1. Quadro de Aulas por Mês e Dia da Semana (Totais por Mês)
          </h3>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Quantidade de Encontros por Mês
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-300 rounded-none shadow-2xs">
          <table className="w-full text-center border-collapse text-slate-800 text-[10px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-[9px] font-black uppercase tracking-wider text-slate-700">
                <th className="py-2.5 px-4 text-left border-r border-slate-200">Mês</th>
                {weekdaySections.map(w => (
                  <th key={`sinop-th-${w.weekday}`} className="py-2.5 px-3 border-r border-slate-200">
                    <span className="hidden sm:inline">{w.weekdayName}</span>
                    <span className="sm:hidden">{WEEKDAY_SHORT[w.weekday]}</span>
                  </th>
                ))}
                <th className="py-2.5 px-4 bg-slate-200 text-slate-900 font-black">Total Mês</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {synopticTable.map(row => {
                const hasClasses = row.monthTotal > 0;
                return (
                  <tr 
                    key={`sinop-tr-${row.monthIndex}`}
                    className={cn(
                      "hover:bg-slate-50 transition-colors",
                      hasClasses ? "bg-white" : "bg-slate-50/60 opacity-60"
                    )}
                  >
                    <td className="py-2 px-4 text-left font-black text-slate-900 border-r border-slate-200 uppercase text-[9.5px]">
                      {row.monthName}
                    </td>
                    {weekdaySections.map(w => {
                      const count = row.cells[w.weekday] || 0;
                      return (
                        <td key={`sinop-cell-${row.monthIndex}-${w.weekday}`} className="py-2 px-3 border-r border-slate-200 font-bold">
                          {count > 0 ? (
                            <span className={cn(
                              "inline-block px-2.5 py-0.5 rounded text-[10px] font-extrabold",
                              w.weekday === 3 ? "bg-sky-50 text-sky-800 border border-sky-200" :
                              w.weekday === 4 ? "bg-amber-50 text-amber-800 border border-amber-200" :
                              "bg-slate-100 text-slate-800 border border-slate-200"
                            )}>
                              {count} {count === 1 ? 'aula' : 'aulas'}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-normal">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-4 font-black bg-slate-100/70 text-slate-950 text-[10px]">
                      {row.monthTotal > 0 ? `${row.monthTotal} ${row.monthTotal === 1 ? 'aula' : 'aulas'}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 border-t-2 border-slate-400 font-black text-[9.5px] uppercase text-slate-900">
                <td className="py-2.5 px-4 text-left border-r border-slate-300">Total Anual</td>
                {weekdaySections.map(w => (
                  <td key={`sinop-foot-${w.weekday}`} className="py-2.5 px-3 border-r border-slate-300">
                    {w.totalAnnualClasses} aulas
                  </td>
                ))}
                <td className="py-2.5 px-4 bg-slate-300 text-slate-950 font-black text-[11px]">
                  {totalAnnualAllWeekdays} aulas
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      )}

      {/* 2. DETALHAMENTO DIRETAS DE DIAS DE AULA POR MÊS (SEPARADO POR DIA DA SEMANA - DETALHADO) */}
      {(effectiveVariant === 'detailed' || effectiveVariant === 'both') && (
      <div className="space-y-6 pt-2">
        <div className="flex items-center justify-between pb-1 border-b border-slate-300">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <CalendarDays size={13} className="text-slate-700" />
            2. Relação de Dias de Aula por Mês (Dias Individuais Separados por Dia da Semana)
          </h3>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Definidos no Cronograma Oficial
          </span>
        </div>

        {weekdaySections.map(wSection => (
          <div 
            key={`wsec-${wSection.weekday}`}
            className="page-break border-2 border-slate-300 rounded-none bg-white shadow-2xs overflow-hidden"
          >
            {/* Header da Seção: Dia da Semana */}
            <div className={cn(
              "px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b-2",
              wSection.weekday === 3 ? "bg-sky-50 border-sky-300 text-sky-950" :
              wSection.weekday === 4 ? "bg-amber-50 border-amber-300 text-amber-950" :
              "bg-slate-100 border-slate-300 text-slate-900"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded flex items-center justify-center font-black text-xs uppercase shadow-xs",
                  wSection.weekday === 3 ? "bg-sky-600 text-white" :
                  wSection.weekday === 4 ? "bg-amber-600 text-white" :
                  "bg-slate-800 text-white"
                )}>
                  {WEEKDAY_SHORT[wSection.weekday]}
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider">
                    {wSection.weekdayName}
                  </h4>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    Cronograma Regular de Aulas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-white px-3 py-1 rounded border border-current shadow-2xs">
                  Total no Ano: <strong className="text-xs ml-1">{wSection.totalAnnualClasses} aulas</strong>
                </span>
              </div>
            </div>

            {/* Listagem Clara e Direta de Mês e Dias de Aula */}
            <div className="divide-y divide-slate-200">
              {wSection.months.map(m => {
                const formattedDaysList = m.days.map(d => String(d).padStart(2, '0')).join(', ');

                return (
                  <div 
                    key={`m-row-${wSection.weekday}-${m.monthIndex}`}
                    className="avoid-break p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 hover:bg-slate-50/60 transition-colors"
                  >
                    {/* Bloco do Mês e Total de Aulas */}
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                      <div>
                        <span className="text-xs font-black uppercase text-slate-900 tracking-wide">
                          {m.monthName}
                        </span>
                        <div className="text-[9.5px] font-bold text-blue-700 uppercase tracking-wider">
                          Total de {String(m.totalClasses).padStart(2, '0')} {m.totalClasses === 1 ? 'aula' : 'aulas'}
                        </div>
                      </div>
                    </div>

                    {/* Bloco dos Dias Específicos: ex: "Dias: 04, 10, 12, 16" */}
                    <div className="flex-1 flex flex-wrap items-center gap-1.5 sm:justify-start">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mr-1">
                        Dias:
                      </span>
                      {m.days.map(dayNum => (
                        <span 
                          key={`badge-${wSection.weekday}-${m.monthIndex}-${dayNum}`}
                          className={cn(
                            "inline-flex items-center justify-center font-black text-xs px-2.5 py-0.5 rounded border shadow-2xs",
                            wSection.weekday === 3 ? "bg-sky-50 text-sky-900 border-sky-200" :
                            wSection.weekday === 4 ? "bg-amber-50 text-amber-900 border-amber-200" :
                            "bg-white text-slate-800 border-slate-300"
                          )}
                        >
                          {String(dayNum).padStart(2, '0')}
                        </span>
                      ))}
                    </div>

                    {/* Resumo em Texto Puro para Leitura Rápida ou Impressão */}
                    <div className="hidden lg:block text-right min-w-[120px]">
                      <span className="text-[9px] font-mono text-slate-500 font-semibold">
                        ({formattedDaysList})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rodapé da Seção com Total do Dia da Semana */}
            <div className="p-3 px-5 bg-slate-50 border-t border-slate-300 flex items-center justify-between text-[10px] font-black uppercase text-slate-800">
              <span>Total de Dias de Aula ({wSection.weekdayName}):</span>
              <span className="text-xs font-black text-blue-900">
                {wSection.totalAnnualClasses} {wSection.totalAnnualClasses === 1 ? 'Aula no Ano' : 'Aulas no Ano'}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* 3. RESUMO GERAL CONSOLIDADO NO FINAL DO RELATÓRIO */}
      <div className="avoid-break bg-slate-900 text-white p-4 sm:p-5 rounded-none shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 block mb-1">
            Consolidação do Ano Letivo {currentYear}
          </span>
          <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
            Total Geral de Dias de Aula Definidos no Cronograma:
          </h4>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight tabular-nums">
              {totalAnnualAllWeekdays}
            </span>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block">
              Dias de Aula no Ano
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
