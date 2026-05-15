import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Search, 
  Filter,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  RefreshCw,
  Loader2,
  Check,
  X,
  School,
  BookOpen,
  Star,
  FileText
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, saveBatch, deleteData, fetchQuery, handleDbError } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  type: 'holiday' | 'holiday_nac' | 'holiday_est' | 'holiday_mun' | 'exam' | 'start_term' | 'end_term' | 'class_day' | 'event';
  class_id?: string;
  subject_id?: string;
  user_id: string;
  created_at: any;
}

interface Class {
  id: string;
  name: string;
  code: string;
  status: 'Ativo' | 'Inativo';
}

interface Subject {
  id: string;
  name: string;
  status: 'Ativo' | 'Inativo';
}

export function AcademicCalendar() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'month'>('month');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    type: 'event' as CalendarEvent['type'],
    class_id: '',
    subject_id: ''
  });

  const fetchData = React.useCallback(async () => {
    try {
      const fetchResults = await Promise.allSettled([
        fetchAll('calendar_events', '*', 'start_date'),
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }])
      ]);

      const eventsData = fetchResults[0].status === 'fulfilled' ? fetchResults[0].value : [];
      const classesData = fetchResults[1].status === 'fulfilled' ? fetchResults[1].value : [];
      const subjectsData = fetchResults[2].status === 'fulfilled' ? fetchResults[2].value : [];

      setEvents(eventsData || []);
      setClasses(classesData || []);
      setSubjects(subjectsData || []);
      
      if (fetchResults.some(r => r.status === 'rejected')) {
        console.warn('Algumas consultas falharam ao carregar o calendário acadêmico.');
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (viewMode === 'month') {
        if (e.key === 'ArrowLeft') prevMonth();
        if (e.key === 'ArrowRight') nextMonth();
      } else if (viewMode === 'grid') {
        if (e.key === 'ArrowLeft') prevYear();
        if (e.key === 'ArrowRight') nextYear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  // Lista de feriados fixos para sincronização automática
  const FIXED_HOLIDAYS = [
    // 2025
    { title: "Confraternização Universal", date: "2025-01-01", category: 'nacional' },
    { title: "Aniversário de São Paulo", date: "2025-01-25", category: 'municipal' },
    { title: "Carnaval", date: "2025-03-04", category: 'nacional' },
    { title: "Sexta-feira Santa", date: "2025-04-18", category: 'municipal' },
    { title: "Páscoa", date: "2025-04-20", category: 'nacional' },
    { title: "Tiradentes", date: "2025-04-21", category: 'nacional' },
    { title: "Dia do Trabalho", date: "2025-05-01", category: 'nacional' },
    { title: "Corpus Christi", date: "2025-06-19", category: 'municipal' },
    { title: "Revolução Constitucionalista", date: "2025-07-09", category: 'estadual' },
    { title: "Independência do Brasil", date: "2025-09-07", category: 'nacional' },
    { title: "Nossa Sra Aparecida", date: "2025-10-12", category: 'nacional' },
    { title: "Dia do Servidor Público", date: "2025-10-28", category: 'estadual' },
    { title: "Finados", date: "2025-11-02", category: 'nacional' },
    { title: "Proclamação da República", date: "2025-11-15", category: 'nacional' },
    { title: "Consciência Negra", date: "2025-11-20", category: 'nacional' },
    { title: "Aniv. Guarulhos / N. Sra. Conceição", date: "2025-12-08", category: 'municipal' },
    { title: "Natal", date: "2025-12-25", category: 'nacional' },
    // 2026
    { title: "Confraternização Universal", date: "2026-01-01", category: 'nacional' },
    { title: "Aniversário de São Paulo", date: "2026-01-25", category: 'municipal' },
    { title: "Carnaval", date: "2026-02-17", category: 'nacional' },
    { title: "Sexta-feira Santa", date: "2026-04-03", category: 'municipal' },
    { title: "Páscoa", date: "2026-04-05", category: 'nacional' },
    { title: "Tiradentes", date: "2026-04-21", category: 'nacional' },
    { title: "Dia do Trabalho", date: "2026-05-01", category: 'nacional' },
    { title: "Corpus Christi", date: "2026-06-04", category: 'municipal' },
    { title: "Revolução Constitucionalista", date: "2026-07-09", category: 'estadual' },
    { title: "Independência do Brasil", date: "2026-09-07", category: 'nacional' },
    { title: "Nossa Sra Aparecida", date: "2026-10-12", category: 'nacional' },
    { title: "Dia do Servidor Público", date: "2026-10-28", category: 'estadual' },
    { title: "Finados", date: "2026-11-02", category: 'nacional' },
    { title: "Proclamação da República", date: "2026-11-15", category: 'nacional' },
    { title: "Consciência Negra", date: "2026-11-20", category: 'nacional' },
    { title: "Aniv. Guarulhos / N. Sra. Conceição", date: "2026-12-08", category: 'municipal' },
    { title: "Natal", date: "2026-12-25", category: 'nacional' },
    // 2027
    { title: "Confraternização Universal", date: "2027-01-01", category: 'nacional' },
    { title: "Aniversário de São Paulo", date: "2027-01-25", category: 'municipal' },
    { title: "Carnaval", date: "2027-02-09", category: 'nacional' },
    { title: "Sexta-feira Santa", date: "2027-03-26", category: 'municipal' },
    { title: "Páscoa", date: "2027-03-28", category: 'nacional' },
    { title: "Tiradentes", date: "2027-04-21", category: 'nacional' },
    { title: "Dia do Trabalho", date: "2027-05-01", category: 'nacional' },
    { title: "Corpus Christi", date: "2027-05-27", category: 'municipal' },
    { title: "Revolução Constitucionalista", date: "2027-07-09", category: 'estadual' },
    { title: "Independência do Brasil", date: "2027-09-07", category: 'nacional' },
    { title: "Nossa Sra Aparecida", date: "2027-10-12", category: 'nacional' },
    { title: "Dia do Servidor Público", date: "2027-10-28", category: 'estadual' },
    { title: "Finados", date: "2027-11-02", category: 'nacional' },
    { title: "Proclamação da República", date: "2027-11-15", category: 'nacional' },
    { title: "Consciência Negra", date: "2027-11-20", category: 'nacional' },
    { title: "Aniv. Guarulhos / N. Sra. Conceição", date: "2027-12-08", category: 'municipal' },
    { title: "Natal", date: "2027-12-25", category: 'nacional' },
  ];

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Auto-sync feriados quando o administrador entra na página ou muda o ano
  const syncInProgress = React.useRef(false);

  useEffect(() => {
    if (isAdmin && !loading && !syncInProgress.current) {
      const currentYear = currentDate.getFullYear();
      const hasHolidaysForYear = events.some(e => {
        const d = new Date(e.start_date + 'T00:00:00');
        const isHoliday = e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun';
        return isHoliday && d.getFullYear() === currentYear;
      });
      
      // Se não houver nenhum feriado para o ano selecionado, disparar a sincronização
      if (!hasHolidaysForYear) {
        syncHolidays(true); 
      }
    }
  }, [isAdmin, loading, events.length, currentDate.getFullYear()]);

  const syncHolidays = async (silent = false) => {
    if (!userAuth || syncInProgress.current) return;
    syncInProgress.current = true;
    if (!silent) setIsSyncing(true);
    try {
      const itemsToUpdate: any[] = [];
      let newCount = 0;
      let updatedCount = 0;

      for (const h of FIXED_HOLIDAYS) {
        const hYear = new Date(h.date + 'T00:00:00').getFullYear();
        if (hYear !== currentDate.getFullYear()) continue;

        let description = 'Feriado Nacional';
        let type: CalendarEvent['type'] = 'holiday_nac';
        
        if (h.category === 'estadual') {
          description = 'Feriado Estadual';
          type = 'holiday_est';
        }
        if (h.category === 'municipal') {
          description = 'Feriado Municipal';
          type = 'holiday_mun';
        }

        // Check for existing holiday on this date OR with this title
        const existingEvent = events.find(e => 
          e.start_date === h.date && 
          (e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun' || e.title === h.title)
        );

        if (!existingEvent) {
          itemsToUpdate.push({
            title: h.title,
            start_date: h.date,
            end_date: h.date,
            type: type,
            description: description,
            user_id: userAuth.uid,
            created_at: new Date().toISOString()
          });
          newCount++;
        } else if (existingEvent.description !== description || existingEvent.title !== h.title) {
          itemsToUpdate.push({
            id: existingEvent.id,
            title: h.title,
            description: description,
            updated_at: new Date().toISOString()
          });
          updatedCount++;
        }
      }

      if (itemsToUpdate.length > 0) {
        await saveBatch('calendar_events', itemsToUpdate, 45000); // 45s timeout for batch
        await fetchData(); // Refresh events after sync
      }

      if (!silent && itemsToUpdate.length > 0) {
        setNotification({ 
          type: 'success', 
          message: `Sincronização concluída! ${newCount} novos e ${updatedCount} atualizados.` 
        });
      }
    } catch (error) {
      console.error("Error syncing holidays:", error);
      if (!silent) setNotification({ type: 'err', message: 'Erro ao sincronizar feriados.' });
    } finally {
      if (!silent) setIsSyncing(false);
      syncInProgress.current = false;
    }
  };


  const generateClassDays = async () => {
    if (!userAuth) return;
    setIsSyncing(true);
    setNotification({ type: 'success', message: 'Sincronizando holidays e gerando dias de aula...' });
    
    try {
      // First, ensure holidays are up to date for the current year
      await syncHolidays(true);

      const year = currentDate.getFullYear();
      const term1StartStr = `${year}-02-03`; // Início em Fevereiro
      const term1EndStr = `${year}-06-25`;
      const term2StartStr = `${year}-08-04`; 
      const term2EndStr = `${year}-11-28`;

      const ranges = [
        { start: new Date(term1StartStr + 'T00:00:00'), end: new Date(term1EndStr + 'T00:00:00') },
        { start: new Date(term2StartStr + 'T00:00:00'), end: new Date(term2EndStr + 'T00:00:00') }
      ];

      // Get holidays to check successors/predecessors
      const holidays = events.filter(e => e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun');
      const holidayDates = new Set(holidays.map(h => h.start_date));

      const newEvents: any[] = [];

      // Add Term Start/End
      const termEvents = [
        { date: term1StartStr, title: 'Início do 1º Semestre', type: 'start_term' },
        { date: term1EndStr, title: 'Término do 1º Semestre', type: 'end_term' },
        { date: term2StartStr, title: 'Início do 2º Semestre', type: 'start_term' },
        { date: term2EndStr, title: 'Término do Ano Letivo', type: 'end_term' }
      ];

      for (const te of termEvents) {
        // Only add if it's NOT a holiday and NOT already present
        const isHoliday = holidayDates.has(te.date);
        const exists = events.some(e => e.start_date === te.date && (e.type === te.type || e.type === 'holiday_nac' || e.type === 'holiday_mun' || e.type === 'holiday_est'));
        
        if (!exists && !isHoliday) {
          newEvents.push({
            title: te.title,
            start_date: te.date,
            end_date: te.date,
            type: te.type,
            description: te.title,
            user_id: userAuth.uid,
            created_at: new Date().toISOString()
          });
        }
      }

      for (const range of ranges) {
        let current = new Date(range.start);
        while (current <= range.end) {
          // Check if Wednesday (3) - Exemplo: Aulas às Quartas
          if (current.getDay() === 3) {
            const dateStr = current.toISOString().split('T')[0];
            
            // Checks for neighbors (pontes de feriado)
            const yesterday = new Date(current);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const tomorrow = new Date(current);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            const isHoliday = holidayDates.has(dateStr);
            const prevIsHoliday = holidayDates.has(yesterdayStr);
            const nextIsHoliday = holidayDates.has(tomorrowStr);

            // Não gera aula se for feriado, ou se houver feriado um dia antes/depois (opcional, para evitar pontes)
            if (!isHoliday && !prevIsHoliday && !nextIsHoliday) {
              const alreadyHasEvent = events.some(e => e.start_date === dateStr && (e.type === 'class_day' || e.type === 'holiday_nac' || e.type === 'holiday_mun' || e.type === 'holiday_est' || e.type === 'start_term' || e.type === 'end_term'));
              if (!alreadyHasEvent) {
                newEvents.push({
                  title: 'Dia de Aula',
                  start_date: dateStr,
                  end_date: dateStr,
                  type: 'class_day',
                  description: 'Quarta-feira regular de aula',
                  user_id: userAuth.uid,
                  created_at: new Date().toISOString()
                });
              }
            }
          }
          current.setDate(current.getDate() + 1);
        }
      }

      if (newEvents.length > 0) {
        await saveBatch('calendar_events', newEvents, 60000);
      }

      setNotification({ type: 'success', message: `${newEvents.length} eventos acadêmicos gerados!` });
    } catch (error) {
      console.error("Error generating class days:", error);
      setNotification({ type: 'err', message: 'Erro ao gerar dias de aula.' });
    } finally {
      setIsSyncing(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;

    try {
      const data = {
        ...formData,
        start_date: parseDateToDB(formData.start_date) || '',
        end_date: parseDateToDB(formData.end_date) || '',
        user_id: userAuth.uid,
        updated_at: new Date().toISOString()
      };

      await saveData('calendar_events', selectedEvent?.id, data);

      setIsEditing(false);
      setSelectedEvent(null);
      setFormData({
        title: '',
        description: '',
        start_date: '',
        end_date: '',
        type: 'event',
        class_id: '',
        subject_id: ''
      });
      fetchData();
    } catch (error: any) {
      console.error('Error saving calendar event:', error);
    }
  };

  const handleEdit = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setFormData({
      title: event.title,
      description: event.description,
      start_date: formatDateForDisplay(event.start_date),
      end_date: formatDateForDisplay(event.end_date),
      type: event.type,
      class_id: event.class_id || '',
      subject_id: event.subject_id || ''
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este evento?")) return;
    try {
      await deleteData('calendar_events', id);
    } catch (error) {
      handleDbError(error, 'delete', `calendar_events/${id}`);
    }
  };

  const getTypeStyle = (type: CalendarEvent['type'], description?: string) => {
    switch (type) {
      case 'holiday':
      case 'holiday_nac':
        return 'bg-red-600 text-white border-red-700 shadow-sm';
      case 'holiday_est':
        return 'bg-indigo-600 text-white border-indigo-700 shadow-sm';
      case 'holiday_mun':
        return 'bg-amber-600 text-white border-amber-700 shadow-sm';
      case 'exam': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'start_term': return 'bg-blue-600 text-white border-blue-700 font-black';
      case 'end_term': return 'bg-slate-800 text-white border-slate-900 font-black';
      case 'class_day': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getTypeText = (type: CalendarEvent['type'], description?: string) => {
    switch (type) {
      case 'holiday':
      case 'holiday_nac': return 'Feriado Nacional';
      case 'holiday_est': return 'Feriado Estadual';
      case 'holiday_mun': return 'Feriado Municipal';
      case 'exam': return 'Avaliação';
      case 'start_term': return 'Início de Turma';
      case 'end_term': return 'Término de Turma';
      case 'class_day': return 'Dia de Aula';
      default: return 'Evento';
    }
  };

  const getTypeColor = (type: CalendarEvent['type'], description?: string) => {
    switch (type) {
      case 'holiday':
      case 'holiday_nac': return 'bg-red-500';
      case 'holiday_est': return 'bg-indigo-500';
      case 'holiday_mun': return 'bg-amber-500';
      case 'exam': return 'bg-amber-500';
      case 'start_term': return 'bg-blue-600';
      case 'end_term': return 'bg-slate-800';
      case 'class_day': return 'bg-emerald-500';
      default: return 'bg-slate-400';
    }
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevYear = () => {
    setCurrentDate(prev => new Date(prev.getFullYear() - 1, prev.getMonth()));
  };

  const nextYear = () => {
    setCurrentDate(prev => new Date(prev.getFullYear() + 1, prev.getMonth()));
  };

  const prevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
  };

  const filteredEvents = events.filter(event => {
    const date = new Date(event.start_date + 'T00:00:00');
    const matchesYear = date.getFullYear() === currentDate.getFullYear();
    const matchesSearch = event.title.toLowerCase().includes(search.toLowerCase()) ||
                         event.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || 
                       (typeFilter === 'term' ? (event.type === 'start_term' || event.type === 'end_term' || event.type === 'class_day') : event.type === typeFilter);
    return matchesYear && matchesSearch && matchesType;
  }).reduce((acc, current) => {
    // Unique by title and date
    const x = acc.find(item => item.title === current.title && item.start_date === current.start_date);
    if (!x) return acc.concat([current]);
    else return acc;
  }, [] as CalendarEvent[]);

  // Group events by month
  const groupedEvents = filteredEvents.reduce((acc, event) => {
    // Force local date interpretation
    const date = new Date(event.start_date + 'T00:00:00');
    const monthYear = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // Improved Stats for the filters with deduplication
  const getEventCount = (type: string) => {
    const currentYearEvents = events.filter(e => new Date(e.start_date + 'T00:00:00').getFullYear() === currentDate.getFullYear());
    
    // Deduplicate by title and date for accurate counting
    const uniqueEvents = currentYearEvents.reduce((acc, current) => {
      const x = acc.find(item => item.title === current.title && item.start_date === current.start_date);
      if (!x) return acc.concat([current]);
      else return acc;
    }, [] as CalendarEvent[]);

    if (type === 'all') return uniqueEvents.length;
    
    if (type === 'term') {
      return uniqueEvents.filter(e => e.type === 'start_term' || e.type === 'end_term' || e.type === 'class_day').length;
    }

    if (type === 'holiday_nac') {
      return uniqueEvents.filter(e => e.type === 'holiday_nac' || (e.type === 'holiday' && !e.description.toLowerCase().includes('estadual') && !e.description.toLowerCase().includes('municipal'))).length;
    }

    if (type === 'holiday_est') {
      return uniqueEvents.filter(e => e.type === 'holiday_est' || (e.type === 'holiday' && e.description.toLowerCase().includes('estadual'))).length;
    }

    if (type === 'holiday_mun') {
      return uniqueEvents.filter(e => e.type === 'holiday_mun' || (e.type === 'holiday' && e.description.toLowerCase().includes('municipal'))).length;
    }

    return uniqueEvents.filter(e => e.type === type).length;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <CalendarIcon size={20} />
            </div>
            Calendário Escolar
          </h2>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest pl-13">Planejamento e Gestão Acadêmica</p>
        </div>

        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-lg z-50",
              notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            )}
          >
            {notification.type === 'success' ? <Check size={16} /> : <X size={16} />}
            {notification.message}
          </motion.div>
        )}

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
              <button 
                onClick={() => setViewMode('month')}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  viewMode === 'month' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Mês
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  viewMode === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Ano
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Lista
              </button>
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1 shadow-sm mr-2">
              <button onClick={viewMode === 'month' ? prevMonth : prevYear} className="p-1 hover:bg-slate-50 rounded-lg transition-all text-slate-400">
                <ChevronLeft size={18} />
              </button>
              <span className="px-3 text-xs font-black text-slate-700 tracking-tight min-w-[100px] text-center">
                {viewMode === 'month' 
                  ? currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                  : currentDate.getFullYear()
                }
              </span>
              <button onClick={viewMode === 'month' ? nextMonth : nextYear} className="p-1 hover:bg-slate-50 rounded-lg transition-all text-slate-400">
                <ChevronRight size={18} />
              </button>
            </div>

            {(isAdmin || isDirector) && (
              <button 
                onClick={() => {
                  setSelectedEvent(null);
                  setFormData({
                    title: '',
                    description: '',
                    start_date: '',
                    end_date: '',
                    type: 'event',
                    class_id: '',
                    subject_id: ''
                  });
                  setIsEditing(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-95"
              >
                <Plus size={16} />
                Novo Evento
              </button>
            )}
          </div>
      </div>

      {/* Resumo de Feriados e Eventos do Ano */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Painel Informativo de {currentDate.getFullYear()}</h3>
        {isAdmin && (
          <button 
            onClick={() => syncHolidays(false)}
            disabled={isSyncing}
            className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase hover:underline disabled:opacity-50"
          >
            {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Sincronizar Dados
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { id: 'holiday_nac', label: 'Feriados Nacionais', count: getEventCount('holiday_nac'), color: 'bg-red-500', text: 'text-red-500', bg: 'bg-red-50', icon: <div className="w-2 h-2 rounded-full bg-red-600" /> },
          { id: 'holiday_est', label: 'Feriados Estaduais', count: getEventCount('holiday_est'), color: 'bg-indigo-500', text: 'text-indigo-500', bg: 'bg-indigo-50', icon: <div className="w-2 h-2 rounded-full bg-indigo-600" /> },
          { id: 'holiday_mun', label: 'Feriados Municipais', count: getEventCount('holiday_mun'), color: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50', icon: <div className="w-2 h-2 rounded-full bg-amber-600" /> },
          { id: 'class_day', label: 'Aulas Programadas', count: getEventCount('class_day'), color: 'bg-blue-500', text: 'text-blue-500', bg: 'bg-blue-50', icon: <BookOpen size={14} /> },
        ].map((stat) => (
          <motion.div 
            key={stat.id}
            whileHover={{ y: -4 }}
            onClick={() => {
              setTypeFilter(stat.id === 'class_day' ? 'term' : stat.id);
              setViewMode('list');
            }}
            className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 cursor-pointer hover:shadow-xl hover:shadow-blue-900/5 transition-all group relative overflow-hidden"
          >
            <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity", stat.bg)} />
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-105 z-10", stat.color)}>
              <span className="text-base font-black">{stat.count}</span>
            </div>
            <div className="flex flex-col z-10">
              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none mb-1">{stat.label}</span>
              <div className="flex items-center gap-2">
                <span className={cn("text-[9px] font-bold uppercase", stat.text)}>Ver listagem</span>
              </div>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1">
              <ChevronRight size={16} className={stat.text} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-8">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2">
                <Search size={12} className="text-blue-600" />
                Busca Rápida
              </h4>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Título ou descrição..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-12 pr-4 text-xs font-medium focus:ring-2 focus:ring-blue-600/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Dashboard</h4>
                {(typeFilter !== 'all' || search) && (
                  <button 
                    onClick={() => {
                      setTypeFilter('all');
                      setSearch('');
                    }}
                    className="text-[9px] font-black text-blue-600 uppercase hover:underline"
                  >
                    Resetar
                  </button>
                )}
              </div>
              
              <div className="space-y-1.5">
                {[
                  { id: 'all', label: 'Calendário Global', icon: <Filter size={14} />, desc: 'Visão completa' },
                  { id: 'holiday_nac', label: 'Feriados Nacionais', icon: <div className="w-2 h-2 rounded-full bg-red-600" />, desc: 'Leis federais' },
                  { id: 'term', label: 'Cronograma Escolar', icon: <Clock size={14} />, desc: 'Aulas e períodos' },
                  { id: 'event', label: 'Eventos & Datas', icon: <CalendarIcon size={14} />, desc: 'Atividades extras' }
                ].map(item => {
                  const count = getEventCount(item.id);
                  const isActive = typeFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTypeFilter(item.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all group",
                        isActive 
                          ? "bg-slate-900 text-white shadow-xl shadow-slate-200" 
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                          isActive ? "bg-white/10 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600"
                        )}>
                          {item.icon}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold leading-none mb-1">{item.label}</p>
                          <p className={cn("text-[9px] font-medium leading-none", isActive ? "text-slate-400" : "text-slate-400")}>{item.desc}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "px-2 py-0.5 rounded-lg text-[9px] font-black",
                        isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                      )}>
                        {count}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Destaque informativo - Próximo Evento */}
            {(() => {
              const today = new Date().toISOString().split('T')[0];
              const nextEvent = events
                .filter(e => e.start_date >= today && (e.type.includes('holiday') || e.type === 'start_term'))
                .sort((a,b) => a.start_date.localeCompare(b.start_date))[0];
              
              if (!nextEvent) return null;

              return (
                <div className="bg-amber-50 p-5 rounded-[2rem] border border-amber-100 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-amber-500 rounded-lg flex items-center justify-center text-white">
                      <Star size={12} fill="currentColor" />
                    </div>
                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Próximo Marco</span>
                  </div>
                  <div>
                    <h5 className="text-[11px] font-black text-amber-900 leading-none mb-1">{nextEvent.title}</h5>
                    <p className="text-[10px] font-bold text-amber-600 uppercase">
                      {new Date(nextEvent.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                    </p>
                  </div>
                </div>
              );
            })()}

            {typeFilter === 'term' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-600 p-6 rounded-[2rem] text-white space-y-4 shadow-xl shadow-blue-200"
              >
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h5 className="text-xs font-black uppercase tracking-widest mb-1">Planilha de Aulas</h5>
                  <p className="text-[10px] text-blue-100 font-medium leading-relaxed">Gere um documento formatado com todas as datas letivas para impressão.</p>
                </div>
                <button 
                  onClick={() => {
                    const classEvents = events.filter(e => e.type === 'class_day' && new Date(e.start_date).getFullYear() === currentDate.getFullYear())
                      .sort((a,b) => a.start_date.localeCompare(b.start_date));
                    
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      const html = `
                        <html>
                          <head>
                            <title>Cronograma de Aulas - ${currentDate.getFullYear()}</title>
                            <style>
                              body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; }
                              header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
                              h1 { font-size: 18px; margin: 0; text-transform: uppercase; letter-spacing: 2px; }
                              table { width: 100%; border-collapse: collapse; }
                              th { background: #f8fafc; text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
                              td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
                              .footer { margin-top: 30px; font-size: 9px; color: #64748b; text-align: center; }
                            </style>
                          </head>
                          <body>
                            <header>
                              <div>
                                <h1>Cronograma Letivo ${currentDate.getFullYear()}</h1>
                                <p style="font-size: 10px; margin: 5px 0 0;">Relatório de Aulas Programadas</p>
                              </div>
                              <div style="font-size: 10px; text-align: right;">
                                Emitido em: ${new Date().toLocaleDateString('pt-BR')}<br>
                                Total de Aulas: ${classEvents.length}
                              </div>
                            </header>
                            <table>
                              <thead>
                                <tr>
                                  <th width="80">Data</th>
                                  <th width="100">Dia</th>
                                  <th>Título da Atividade</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${classEvents.map(e => `
                                  <tr>
                                    <td>${new Date(e.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                    <td>${new Date(e.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}</td>
                                    <td>${e.title}</td>
                                    <td>PROGRAMADA</td>
                                  </tr>
                                `).join('')}
                              </tbody>
                            </table>
                            <div class="footer">Este documento foi gerado pelo Sistema de Gestão Acadêmica UniLife.</div>
                          </body>
                        </html>
                      `;
                      printWindow.document.write(html);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }}
                  className="w-full bg-white text-blue-600 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-colors shadow-lg"
                >
                  Gerar Impressão
                </button>
              </motion.div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : viewMode === 'month' ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                {/* Calendário Mensal Estilizado */}
                <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
                  {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(day => (
                    <div key={day} className="bg-slate-50 py-3 text-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{day.substring(0, 3)}</span>
                    </div>
                  ))}
                  
                  {/* Células Vazias (Início do Mês) */}
                  {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => (
                    <div key={`empty-month-${i}`} className="bg-white/50 aspect-[4/3] md:aspect-auto md:h-32" />
                  ))}

                  {/* Dias do Mês */}
                  {Array.from({ length: daysInMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                    // Use filteredEvents which is already deduplicated
                    const dayEvents = filteredEvents.filter(e => e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date));
                    const isToday = new Date().toISOString().split('T')[0] === dateStr;

                    return (
                      <motion.div 
                        key={`month-day-${day}`}
                        whileHover={{ scale: 1.01, zIndex: 10 }}
                        whileTap={{ scale: 0.98, backgroundColor: 'rgba(245, 158, 11, 0.05)' }}
                        onClick={() => {
                          if (isAdmin || isDirector) {
                            setFormData({
                              ...formData,
                              start_date: formatDateForDisplay(dateStr),
                              end_date: formatDateForDisplay(dateStr),
                              title: '',
                              description: '',
                              type: 'event'
                            });
                            setSelectedEvent(null);
                            setIsEditing(true);
                          }
                        }}
                        className={cn(
                          "bg-white aspect-[4/3] md:aspect-auto md:min-h-[140px] p-2 flex flex-col gap-1 transition-all group/cell overflow-hidden cursor-pointer relative border-r border-b border-slate-100",
                          isToday && "bg-amber-50/30"
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <span className={cn(
                            "w-7 h-7 flex items-center justify-center rounded-lg text-xs font-black transition-all",
                            isToday ? "bg-amber-500 text-white shadow-lg shadow-amber-200" : "text-slate-400 group-hover/cell:text-blue-600"
                          )}>
                            {day}
                          </span>
                          {(isAdmin || isDirector) && (
                            <button 
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  start_date: formatDateForDisplay(dateStr),
                                  end_date: formatDateForDisplay(dateStr)
                                });
                                setIsEditing(true);
                              }}
                              className="opacity-0 group-hover/cell:opacity-100 p-1 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </div>

                        {/* Resumo de Eventos */}
                        <div className="flex flex-col gap-1 mt-1 overflow-y-auto custom-scrollbar flex-1 pb-1">
                          {dayEvents.map(event => (
                            <div 
                              key={event.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(event);
                              }}
                              className={cn(
                                "px-2 py-1 rounded-md text-[9px] font-bold truncate cursor-pointer transition-all hover:brightness-95 active:scale-95 border",
                                getTypeStyle(event.type, event.description)
                              )}
                              title={`${event.title}${event.description ? ': ' + event.description : ''}`}
                            >
                              {event.title}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Células Vazias (Fim do Mês) */}
                  {(() => {
                    const totalCells = firstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()) + daysInMonth(currentDate.getFullYear(), currentDate.getMonth());
                    const remaining = (7 - (totalCells % 7)) % 7;
                    return Array.from({ length: remaining }).map((_, i) => (
                      <div key={`empty-end-${i}`} className="bg-white/50 aspect-[4/3] md:aspect-auto md:h-32" />
                    ));
                  })()}
                </div>

                <div className="flex flex-wrap gap-4 pt-6 mt-6 border-t border-slate-50">
                  {[
                    { type: 'holiday_nac', label: 'Feriado Nacional', color: 'bg-red-600' },
                    { type: 'holiday_est', label: 'Feriado Estadual', color: 'bg-indigo-600' },
                    { type: 'holiday_mun', label: 'Feriado Municipal', color: 'bg-amber-600' },
                    { type: 'class_day', label: 'Dia de Aula', color: 'bg-blue-600' },
                    { type: 'exam', label: 'Avaliação', color: 'bg-amber-500' },
                    { type: 'start_term', label: 'Início', color: 'bg-blue-600' },
                    { type: 'end_term', label: 'Final', color: 'bg-slate-800' },
                  ].map(item => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", item.color)} />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="text-center pb-8 border-b border-slate-50 mb-8">
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                    Calendário Anual {currentDate.getFullYear()}
                  </h3>
                </div>

                <div className="space-y-12">
                      {/* Primeiro Semestre */}
                          <div className="space-y-4">
                        <h4 className="text-xs font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-3">
                          <div className="w-8 h-1 bg-blue-600 rounded-full" />
                          1º Semestre (Jan - Jun)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {[0, 1, 2, 3, 4, 5].map(monthIndex => (
                            <div key={monthIndex} className="p-6 bg-slate-50/50 rounded-[2.5rem] border border-slate-100/50 hover:shadow-2xl transition-all hover:bg-white hover:scale-[1.02] duration-500">
                              <h5 className="text-xs font-black text-[#00174b] uppercase tracking-widest text-center mb-6 border-b border-slate-200/50 pb-4">
                                {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                              </h5>
                              <div className="grid grid-cols-7 gap-2">
                                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) => (
                                  <div key={`sem1-${monthIndex}-${d}-${idx}`} className="text-center text-[10px] font-black text-slate-400 uppercase py-2">{d}</div>
                                ))}
                                {/* Days Logic */}
                                {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => (
                                  <div key={`empty-${monthIndex}-${i}`} className="aspect-square" />
                                ))}
                                {Array.from({ length: daysInMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => {
                                  const day = i + 1;
                                  const dateStr = `${currentDate.getFullYear()}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                                  const dayEvents = filteredEvents.filter(e => e.start_date === dateStr);
                                  const holiday = dayEvents.find(e => e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun');
                                  const isToday = new Date().toISOString().split('T')[0] === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-black transition-all relative group/day border-2 min-h-[44px]",
                                    holiday 
                                      ? holiday.description?.includes('Estadual')
                                        ? "bg-indigo-600 text-white border-indigo-700 cursor-pointer hover:scale-110 shadow-md ring-4 ring-indigo-100 ring-offset-2"
                                        : holiday.description?.includes('Municipal')
                                          ? "bg-amber-600 text-white border-amber-700 cursor-pointer hover:scale-110 shadow-md ring-4 ring-amber-100 ring-offset-2"
                                          : "bg-red-600 text-white border-red-700 cursor-pointer hover:scale-110 shadow-md ring-4 ring-red-100 ring-offset-2"
                                      : dayEvents.length > 0 
                                        ? "bg-blue-600 text-white cursor-pointer border-blue-700 hover:scale-110 shadow-sm" 
                                        : isToday ? "bg-amber-500 text-white border-amber-600 shadow-xl scale-110 z-10" : "bg-transparent text-slate-500 border-transparent hover:bg-slate-200/80 hover:border-slate-300"
                                  )}
                                >
                                  {day}
                                  {dayEvents.length > 1 && !holiday && (
                                    <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-400 rounded-full" />
                                  )}
                                  {dayEvents.length > 0 && (
                                    <div className={cn(
                                      "absolute -bottom-0.5 w-1 h-1 rounded-full",
                                      getTypeColor(dayEvents[0].type, dayEvents[0].description)
                                    )} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Segundo Semestre */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em] flex items-center gap-3">
                      <div className="w-8 h-1 bg-emerald-600 rounded-full" />
                      2º Semestre (Jul - Dez)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {[6, 7, 8, 9, 10, 11].map(monthIndex => (
                        <div key={monthIndex} className="p-6 bg-slate-50/50 rounded-[2.5rem] border border-slate-100/50 hover:shadow-2xl transition-all hover:bg-white hover:scale-[1.02] duration-500">
                          <h5 className="text-xs font-black text-[#00174b] uppercase tracking-widest text-center mb-6 border-b border-slate-200/50 pb-4">
                            {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                          </h5>
                          <div className="grid grid-cols-7 gap-2">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) => (
                              <div key={`sem2-${monthIndex}-${d}-${idx}`} className="text-center text-[10px] font-black text-slate-400 uppercase py-2">{d}</div>
                            ))}
                            {/* Days Logic */}
                            {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => (
                              <div key={`empty-${monthIndex}-${i}`} className="aspect-square" />
                            ))}
                            {Array.from({ length: daysInMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${currentDate.getFullYear()}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                              const dayEvents = filteredEvents.filter(e => e.start_date === dateStr);
                              const holiday = dayEvents.find(e => e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun');
                              const isToday = new Date().toISOString().split('T')[0] === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-black transition-all relative group/day border-2 min-h-[44px]",
                                    holiday 
                                      ? holiday.description?.includes('Estadual')
                                        ? "bg-indigo-600 text-white border-indigo-700 cursor-pointer hover:scale-110 shadow-md ring-4 ring-indigo-100 ring-offset-2"
                                        : holiday.description?.includes('Municipal')
                                          ? "bg-amber-600 text-white border-amber-700 cursor-pointer hover:scale-110 shadow-md ring-4 ring-amber-100 ring-offset-2"
                                          : "bg-red-600 text-white border-red-700 cursor-pointer hover:scale-110 shadow-md ring-4 ring-red-100 ring-offset-2"
                                      : dayEvents.length > 0 
                                        ? "bg-blue-600 text-white cursor-pointer border-blue-700 hover:scale-110 shadow-sm" 
                                        : isToday ? "bg-amber-500 text-white border-amber-600 shadow-xl scale-110 z-10" : "bg-transparent text-slate-500 border-transparent hover:bg-slate-200/80 hover:border-slate-300"
                                  )}
                                >
                                  {day}
                                  {dayEvents.length > 1 && !holiday && (
                                    <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-400 rounded-full" />
                                  )}
                                  {dayEvents.length > 0 && (
                                    <div className={cn(
                                      "absolute -bottom-0.5 w-1 h-1 rounded-full",
                                      getTypeColor(dayEvents[0].type, dayEvents[0].description)
                                    )} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-8 mt-12 border-t border-slate-100">
                  {[
                    { type: 'holiday_nac', label: 'Feriado Nacional', color: 'bg-red-600' },
                    { type: 'holiday_est', label: 'Feriado Estadual', color: 'bg-indigo-600' },
                    { type: 'holiday_mun', label: 'Feriado Municipal', color: 'bg-amber-600' },
                    { type: 'class_day', label: 'Dia de Aula', color: 'bg-blue-600' },
                    { type: 'exam', label: 'Avaliação', color: 'bg-amber-500' },
                    { type: 'start_term', label: 'Início Turma', color: 'bg-blue-600' },
                    { type: 'end_term', label: 'Final Turma', color: 'bg-slate-800' },
                  ].map(item => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full shadow-sm", item.color)} />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : Object.keys(groupedEvents).length > 0 ? (
            (Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => (
              <div key={month} className="space-y-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-2 flex items-center gap-2">
                  <div className="w-1 h-4 bg-blue-600 rounded-full" />
                  {month}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {monthEvents.map(event => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={event.id} 
                      className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group cursor-pointer relative"
                      onClick={() => handleEdit(event)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-3">
                          <span className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            getTypeStyle(event.type, event.description)
                          )}>
                            {getTypeText(event.type, event.description)}
                          </span>
                          <h4 className="text-lg font-black text-slate-800 leading-tight">{event.title}</h4>
                          <div className="flex flex-col gap-1">
                            <p className="text-xs font-bold text-blue-600 flex items-center gap-2">
                              <CalendarIcon size={14} />
                              {new Date(event.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                              {event.end_date && event.end_date !== event.start_date && (
                                <>
                                  <ChevronRight size={12} />
                                  {new Date(event.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </>
                              )}
                            </p>
                            {(event.class_id || event.subject_id) && (
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                {event.class_id && (
                                  <span className="flex items-center gap-1">
                                    <School size={12} />
                                    {classes.find(c => c.id === event.class_id)?.name || 'Turma não encontrada'}
                                  </span>
                                )}
                                {event.subject_id && (
                                  <span className="flex items-center gap-1">
                                    <BookOpen size={12} />
                                    {subjects.find(s => s.id === event.subject_id)?.name || 'Disciplina não encontrada'}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-xs font-medium text-slate-400 line-clamp-2">{event.description}</p>
                          )}
                        </div>
                        
                        {(isAdmin || isDirector) && (
                          <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(event);
                              }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(event.id);
                              }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-12 rounded-[3rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center">
                <CalendarIcon size={32} />
              </div>
              <div>
                <p className="text-lg font-black text-slate-400">Nenhum evento encontrado</p>
                <p className="text-sm font-bold text-slate-300">Tente ajustar seus filtros ou pesquisar por outro termo.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white max-w-2xl w-full rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200/50"
            >
              <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
                {/* Header do Modal */}
                <div className="px-8 py-10 bg-[#00174b] text-white relative">
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full transition-all text-white/50 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                  <div className="flex items-center gap-5">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl ring-4 ring-white/10",
                      getTypeColor(formData.type)
                    )}>
                      {['holiday', 'holiday_nac', 'holiday_est', 'holiday_mun'].includes(formData.type) ? <CalendarIcon size={28} /> : 
                       formData.type === 'exam' ? <Info size={28} /> : 
                       formData.type === 'class_day' ? <BookOpen size={28} /> : <CalendarIcon size={28} />}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">
                        {formData.title || (selectedEvent ? 'Editar Registro' : 'Novo Registro')}
                      </h3>
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.25em] mt-1">
                        {selectedEvent ? 'Gestão de Conteúdo Existente' : 'Inclusão no Calendário Acadêmico'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-10">
                  {/* Tipo de Evento (Grid Elegante) */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Natureza do Evento</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { id: 'event', label: 'Geral', icon: <CalendarIcon size={14} /> },
                        { id: 'holiday_nac', label: 'Feriado Nac.', icon: <CalendarIcon size={14} /> },
                        { id: 'holiday_est', label: 'Feriado Est.', icon: <CalendarIcon size={14} /> },
                        { id: 'holiday_mun', label: 'Feriado Mun.', icon: <CalendarIcon size={14} /> },
                        { id: 'start_term', label: 'Início', icon: <Plus size={14} /> },
                        { id: 'end_term', label: 'Final', icon: <X size={14} /> },
                        { id: 'class_day', label: 'Aula', icon: <BookOpen size={14} /> },
                        { id: 'exam', label: 'Avaliação', icon: <Info size={14} /> }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setFormData({...formData, type: type.id as any})}
                          className={cn(
                            "py-4 px-4 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-3 border-2",
                            formData.type === type.id 
                              ? "bg-blue-50 border-blue-600 text-blue-600 shadow-sm scale-[1.02]" 
                              : "bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100 hover:border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            formData.type === type.id ? "bg-blue-600 scale-125" : getTypeColor(type.id as any)
                          )} />
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Datas */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Período Selecionado</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="group">
                         <div className="relative">
                          <input 
                            required
                            type="text"
                            placeholder="DD/MM/AAAA"
                            value={formData.start_date}
                            onChange={e => {
                              const date = maskDate(e.target.value);
                              setFormData({...formData, start_date: date, end_date: formData.end_date || date});
                            }}
                            className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all shadow-inner"
                          />
                          <span className="absolute -top-2.5 left-6 px-2 bg-white text-[9px] font-black text-slate-400 uppercase rounded-full border border-slate-100">Início</span>
                        </div>
                      </div>
                      <div className="group">
                        <div className="relative">
                          <input 
                            type="text"
                            placeholder="DD/MM/AAAA"
                            value={formData.end_date}
                            onChange={e => setFormData({...formData, end_date: maskDate(e.target.value)})}
                            className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all shadow-inner"
                          />
                          <span className="absolute -top-2.5 left-6 px-2 bg-white text-[9px] font-black text-slate-400 uppercase rounded-full border border-slate-100">Término (Opcional)</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-2 pl-2 flex items-center gap-2 italic">
                      <Info size={12} className="text-blue-500" />
                      Para eventos de um único dia, utilize apenas a primeira data.
                    </p>
                  </div>

                  {/* Título e Descrição */}
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 text-[10px]">Título do Evento</label>
                      <input 
                        required
                        type="text"
                        placeholder="Ex: Reunião de Planejamento, Feriado..."
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-bold text-slate-700 placeholder:text-slate-300 focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all shadow-inner"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 text-[10px]">Informações Complementares</label>
                      <textarea 
                        placeholder="Detalhes relevantes sobre o evento..."
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        rows={4}
                        className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-bold text-slate-700 placeholder:text-slate-300 focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all resize-none shadow-inner"
                      />
                    </div>
                  </div>

                  {/* Turma e Disciplina */}
                  {['start_term', 'end_term', 'class_day', 'exam'].includes(formData.type) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Vincular Turma</label>
                        <select 
                          value={formData.class_id}
                          onChange={e => setFormData({...formData, class_id: e.target.value})}
                          className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 transition-all appearance-none shadow-inner cursor-pointer"
                        >
                          <option value="">Geral (Sem turma específica)</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Vincular Disciplina</label>
                        <select 
                          value={formData.subject_id}
                          onChange={e => setFormData({...formData, subject_id: e.target.value})}
                          className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 transition-all appearance-none shadow-inner cursor-pointer"
                        >
                          <option value="">Geral (Sem disciplina específica)</option>
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Fixo */}
                <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-5 bg-white border-2 border-slate-200 text-slate-500 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-[0.98]"
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    className="flex-2 py-5 bg-blue-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-2xl shadow-blue-200 transition-all active:scale-[0.98]"
                  >
                    Confirmar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
