import { CalendarEvent } from '../types';

export const getTypeStyle = (type: CalendarEvent['type'], startDate?: string) => {
  switch (type) {
    case 'holiday':
    case 'holiday_nac':
      return 'bg-red-50 text-red-700 border-red-100/50 shadow-sm font-semibold';
    case 'holiday_est':
      return 'bg-indigo-50 text-indigo-700 border-indigo-100/50 shadow-sm font-semibold';
    case 'holiday_mun':
      return 'bg-amber-50 text-amber-700 border-amber-100/50 shadow-sm font-semibold';
    case 'exam': 
      return 'bg-orange-50 text-orange-700 border-orange-100 font-semibold';
    case 'start_term': 
    case 'end_term':
      return 'bg-slate-900 text-white border-slate-950 font-semibold shadow-sm';
    case 'class_day': {
      if (startDate) {
        const date = new Date(startDate + 'T00:00:00');
        const weekday = date.getDay();
        if (weekday === 3) return 'bg-blue-50 text-blue-700 border-blue-100/50 shadow-sm font-black text-[9.5px] uppercase tracking-wider';
        if (weekday === 4) return 'bg-amber-50 text-amber-700 border-amber-100/50 shadow-sm font-black text-[9.5px] uppercase tracking-wider';
        return 'bg-blue-50 text-blue-700 border-blue-100/50 shadow-sm font-black text-[9.5px] uppercase tracking-wider';
      }
      return 'bg-blue-50 text-blue-700 border-blue-100';
    }
    case 'excused_class': 
      return 'bg-slate-50/80 text-slate-400 border-slate-200/50 opacity-90 font-black text-[9px] uppercase tracking-tighter';
    default: return 'bg-slate-50 text-slate-600 border-slate-100 font-black text-[9px] uppercase tracking-wider';
  }
};

export const getTypeText = (type: CalendarEvent['type'], description?: string) => {
  switch (type) {
    case 'holiday':
    case 'holiday_nac': return 'Feriado Nacional';
    case 'holiday_est': return 'Feriado Estadual';
    case 'holiday_mun': return 'Feriado Municipal';
    case 'exam': return 'Avaliação';
    case 'start_term': return 'Início Letivo';
    case 'end_term': return 'Cierre Letivo';
    case 'class_day': return 'Dia de Aula';
    case 'excused_class': return 'Dia de Aula';
    default: return 'Evento';
  }
};

export const getTypeColor = (type: CalendarEvent['type'], startDate?: string) => {
  switch (type) {
    case 'holiday':
    case 'holiday_nac': return 'bg-red-500';
    case 'holiday_est': return 'bg-slate-500';
    case 'holiday_mun': return 'bg-amber-500';
    case 'exam': return 'bg-orange-500';
    case 'start_term': return 'bg-slate-900';
    case 'end_term': return 'bg-slate-800';
    case 'class_day': {
      if (startDate) {
        const date = new Date(startDate + 'T00:00:00');
        const weekday = date.getDay();
        if (weekday === 3) return 'bg-blue-600';
        if (weekday === 4) return 'bg-amber-500';
      }
      return 'bg-emerald-600';
    }
    case 'excused_class': return 'bg-slate-400';
    default: return 'bg-slate-400';
  }
};
