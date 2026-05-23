import React from 'react';
import { cn } from '../../lib/utils';
import { Bookmark } from 'lucide-react';
import { CalendarEvent, InstitutionSettings } from '../../types';
import { getTypeStyle, getTypeText } from '../../lib/calendar-utils';

interface HolidayListReportProps {
  holidays: CalendarEvent[];
  currentYear: string;
  institution: InstitutionSettings | null;
  currentDate: Date;
}

export function HolidayListReport({ holidays, currentYear, institution, currentDate }: HolidayListReportProps) {
  if (holidays.length === 0) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-3xl">
        <Bookmark size={32} className="mx-auto text-slate-200 mb-2" />
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum feriado para {currentYear}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-[8px] font-black text-slate-500 uppercase tracking-widest w-[100px]">Data</th>
              <th className="px-4 py-2 text-[8px] font-black text-slate-500 uppercase tracking-widest">Descrição do Feriado</th>
              <th className="px-4 py-2 text-[8px] font-black text-slate-500 uppercase tracking-widest w-[130px]">Nível</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {holidays.map(hol => {
              const date = new Date(hol.start_date + 'T00:00:00');
              return (
                <tr key={hol.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-1.5 w-[100px]">
                    <div className="text-[10px] font-black text-slate-900 leading-none">
                      {date.toLocaleDateString('pt-BR')}
                    </div>
                    <div className="text-[7px] font-bold text-slate-400 uppercase mt-0.5 tracking-tighter">
                      {date.toLocaleDateString('pt-BR', { weekday: 'long' })}
                    </div>
                  </td>
                  <td className="px-4 py-1.5">
                    <div className="text-[9px] font-black text-slate-800 uppercase tracking-tight">{hol.title}</div>
                    {hol.description && hol.description !== getTypeText(hol.type) && !hol.description.includes('Feriado') && (
                      <div className="text-[8px] font-semibold text-slate-400 mt-0.5">{hol.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-1.5 w-[130px]">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border whitespace-nowrap inline-block",
                      getTypeStyle(hol.type, hol.start_date)
                    )}>
                      {getTypeText(hol.type, hol.description)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200">
            <tr>
              <td colSpan={2} className="px-4 py-2 text-[9px] font-black text-slate-500 uppercase text-right">Total de Feriados no Ano:</td>
              <td className="px-4 py-2">
                <span className="text-[10px] font-black text-slate-900">{holidays.length}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="pt-4 flex justify-between items-center px-4">
        <p className="text-[7px] font-bold text-slate-300 uppercase tracking-[0.2em]">Escola Diocesana de Ministério • {currentDate.getFullYear()}</p>
        <div className="flex gap-10">
           <div className="text-center w-32 border-t border-slate-200 pt-1">
              <p className="text-[7px] font-bold text-slate-400 uppercase">Secretaria</p>
           </div>
        </div>
      </div>
    </div>
  );
}
