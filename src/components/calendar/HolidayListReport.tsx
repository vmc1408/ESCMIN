import React from 'react';
import { cn } from '../../lib/utils';
import { Bookmark } from 'lucide-react';
import { CalendarEvent, InstitutionSettings } from '../../types';
import { getTypeStyle, getTypeText } from '../../lib/calendar-utils';

interface HolidayListReportProps {
  holidays: CalendarEvent[];
  currentYear: string;
  institution?: InstitutionSettings | null;
  currentDate?: Date;
  totalCount?: number;
  showSummaryRow?: boolean;
}

export function HolidayListReport({
  holidays,
  currentYear,
  totalCount,
  showSummaryRow = true
}: HolidayListReportProps) {
  if (holidays.length === 0) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
        <Bookmark size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nenhum feriado para {currentYear}</p>
      </div>
    );
  }

  const finalTotal = typeof totalCount === 'number' ? totalCount : holidays.length;

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-100 border-b border-slate-300">
          <tr>
            <th className="px-3 py-2 text-[8pt] font-black text-slate-700 uppercase tracking-wider w-[110px]">Data</th>
            <th className="px-3 py-2 text-[8pt] font-black text-slate-700 uppercase tracking-wider">Descrição do Feriado</th>
            <th className="px-3 py-2 text-[8pt] font-black text-slate-700 uppercase tracking-wider w-[135px] text-right">Nível</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {holidays.map(hol => {
            const date = new Date(hol.start_date + 'T00:00:00');
            return (
              <tr key={hol.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-3 py-1.5 w-[110px]">
                  <div className="text-[8.5pt] font-black text-slate-900 leading-none">
                    {date.toLocaleDateString('pt-BR')}
                  </div>
                  <div className="text-[6.5pt] font-bold text-slate-500 uppercase mt-0.5 tracking-tight">
                    {date.toLocaleDateString('pt-BR', { weekday: 'long' })}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="text-[8.5pt] font-bold text-slate-900 uppercase tracking-tight">{hol.title}</div>
                  {hol.description && hol.description !== getTypeText(hol.type) && !hol.description.includes('Feriado') && (
                    <div className="text-[7pt] font-medium text-slate-500 mt-0.5">{hol.description}</div>
                  )}
                </td>
                <td className="px-3 py-1.5 w-[135px] text-right">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[7pt] font-black uppercase tracking-wider border whitespace-nowrap inline-block",
                    getTypeStyle(hol.type, hol.start_date, hol.title)
                  )}>
                    {getTypeText(hol.type, hol.description)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        {showSummaryRow && (
          <tfoot className="bg-slate-100 border-t-2 border-slate-300">
            <tr>
              <td colSpan={2} className="px-3 py-2 text-[8pt] font-black text-slate-700 uppercase text-right">
                Total de Feriados no Ano ({currentYear}):
              </td>
              <td className="px-3 py-2 text-right">
                <span className="text-[9.5pt] font-black text-slate-950">{finalTotal}</span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
