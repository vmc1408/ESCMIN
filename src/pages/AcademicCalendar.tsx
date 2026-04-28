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
  BookOpen
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db, saveData, deleteData, handleFirestoreError } from '../lib/database';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  serverTimestamp,
  orderBy,
  where
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  type: 'holiday' | 'exam' | 'start_term' | 'end_term' | 'class_day' | 'event';
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    type: 'event' as CalendarEvent['type'],
    class_id: '',
    subject_id: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'calendar_events'), orderBy('start_date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CalendarEvent[];
      setEvents(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', 'calendar_events');
      setLoading(false);
    });

    const unsubscribeClasses = onSnapshot(query(collection(db, 'classes'), where('status', '==', 'Ativo')), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    });

    const unsubscribeSubjects = onSnapshot(query(collection(db, 'subjects'), where('status', '==', 'Ativo')), (snap) => {
      setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
    });

    return () => {
      unsubscribe();
      unsubscribeClasses();
      unsubscribeSubjects();
    };
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  // Lista de feriados fixos para sincronização automática
  const FIXED_HOLIDAYS = [
    // 2026
    { title: "Confraternização Universal", date: "2026-01-01", type: "holiday" },
    { title: "Carnaval", date: "2026-02-17", type: "holiday" },
    { title: "Sexta-feira Santa", date: "2026-04-03", type: "holiday" },
    { title: "Páscoa", date: "2026-04-05", type: "holiday" },
    { title: "Tiradentes", date: "2026-04-21", type: "holiday" },
    { title: "Dia do Trabalho", date: "2026-05-01", type: "holiday" },
    { title: "Corpus Christi", date: "2026-06-04", type: "holiday" },
    { title: "Revolução Constitucionalista (SP)", date: "2026-07-09", type: "holiday" },
    { title: "Independência do Brasil", date: "2026-09-07", type: "holiday" },
    { title: "Nossa Sra Aparecida", date: "2026-10-12", type: "holiday" },
    { title: "Finados", date: "2026-11-02", type: "holiday" },
    { title: "Proclamação da República", date: "2026-11-15", type: "holiday" },
    { title: "Consciência Negra", date: "2026-11-20", type: "holiday" },
    { title: "Natal", date: "2026-12-25", type: "holiday" },
    // 2027
    { title: "Confraternização Universal", date: "2027-01-01", type: "holiday" },
    { title: "Carnaval", date: "2027-02-09", type: "holiday" },
    { title: "Sexta-feira Santa", date: "2027-03-26", type: "holiday" },
    { title: "Páscoa", date: "2027-03-28", type: "holiday" },
    { title: "Tiradentes", date: "2027-04-21", type: "holiday" },
    { title: "Dia do Trabalho", date: "2027-05-01", type: "holiday" },
    { title: "Corpus Christi", date: "2027-05-27", type: "holiday" },
    { title: "Revolução Constitucionalista (SP)", date: "2027-07-09", type: "holiday" },
    { title: "Independência do Brasil", date: "2027-09-07", type: "holiday" },
    { title: "Nossa Sra Aparecida", date: "2027-10-12", type: "holiday" },
    { title: "Finados", date: "2027-11-02", type: "holiday" },
    { title: "Proclamação da República", date: "2027-11-15", type: "holiday" },
    { title: "Consciência Negra", date: "2027-11-20", type: "holiday" },
    { title: "Natal", date: "2027-12-25", type: "holiday" },
  ];

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Auto-sync feriados quando o administrador entra na página
  useEffect(() => {
    if (isAdmin && !loading) {
      const hasHolidays = events.some(e => e.type === 'holiday');
      // Se não houver nenhum feriado nacional na lista, disparar a sincronização
      if (!hasHolidays) {
        syncHolidays(true); 
      }
    }
  }, [isAdmin, loading, events.length]);

  const syncHolidays = async (silent = false) => {
    if (!userAuth) return;
    if (!silent) setIsSyncing(true);
    try {
      const promises = FIXED_HOLIDAYS.map(async (h) => {
        const exists = events.some(e => e.start_date === h.date && e.title === h.title);
        if (!exists) {
          await saveData('calendar_events', undefined, {
            title: h.title,
            start_date: h.date,
            end_date: h.date,
            type: 'holiday',
            description: h.title.includes('(SP)') ? 'Feriado Estadual de São Paulo' : 'Feriado Nacional',
            user_id: userAuth.uid,
            created_at: new Date().toISOString()
          });
        }
      });

      await Promise.all(promises);
      if (!silent) setNotification({ type: 'success', message: 'Calendário sincronizado com feriados!' });
    } catch (error) {
      console.error("Error syncing holidays:", error);
      if (!silent) setNotification({ type: 'err', message: 'Erro ao sincronizar.' });
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;

    try {
      const data = {
        ...formData,
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
    } catch (error: any) {
      handleFirestoreError(error, selectedEvent ? 'update' : 'create', 'calendar_events');
    }
  };

  const handleEdit = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setFormData({
      title: event.title,
      description: event.description,
      start_date: event.start_date,
      end_date: event.end_date,
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
      handleFirestoreError(error, 'delete', `calendar_events/${id}`);
    }
  };

  const getTypeStyle = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'holiday': return 'bg-red-600 text-white border-red-700 shadow-sm';
      case 'exam': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'start_term': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'end_term': return 'bg-slate-50 text-slate-600 border-slate-100';
      case 'class_day': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getTypeText = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'holiday': return 'Feriado';
      case 'exam': return 'Avaliação';
      case 'start_term': return 'Início de Turma';
      case 'end_term': return 'Término de Turma';
      case 'class_day': return 'Dia de Aula';
      default: return 'Evento';
    }
  };

  const getTypeColor = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'holiday': return 'bg-red-500';
      case 'exam': return 'bg-amber-500';
      case 'start_term': return 'bg-blue-500';
      case 'end_term': return 'bg-slate-500';
      case 'class_day': return 'bg-emerald-500';
      default: return 'bg-slate-400';
    }
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevYear = () => {
    setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth()));
  };

  const nextYear = () => {
    setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth()));
  };

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(search.toLowerCase()) ||
                         event.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || event.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Group events by month
  const groupedEvents = filteredEvents.reduce((acc, event) => {
    const date = new Date(event.start_date);
    const monthYear = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

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
              onClick={() => setViewMode('grid')}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                viewMode === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Grade
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
          {(isAdmin || isDirector) && (
            <button 
              onClick={() => syncHolidays(false)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
            >
              {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sincronizar Feriados
            </button>
          )}

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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Pesquisar</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text"
                  placeholder="Título ou descrição..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Filtrar por Tipo</label>
              <div className="space-y-2">
                {['all', 'holiday', 'exam', 'start_term', 'end_term', 'class_day', 'event'].map(type => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      typeFilter === type ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {type === 'all' ? 'Todos' : getTypeText(type as any)}
                    {typeFilter === type && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : viewMode === 'grid' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between pb-8 border-b border-slate-50 mb-8">
                  <button onClick={prevYear} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                    <ChevronLeft size={24} className="text-slate-400" />
                  </button>
                  <div className="text-center">
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                      Calendário Anual {currentDate.getFullYear()}
                    </h3>
                  </div>
                  <button onClick={nextYear} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                    <ChevronRight size={24} className="text-slate-400" />
                  </button>
                </div>

                <div className="space-y-12">
                  {/* Primeiro Semestre */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-3">
                      <div className="w-8 h-1 bg-blue-600 rounded-full" />
                      1º Semestre (Jan - Jun)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {[0, 1, 2, 3, 4, 5].map(monthIndex => (
                        <div key={monthIndex} className="p-4 bg-slate-50/50 rounded-3xl border border-slate-100/50 hover:shadow-xl transition-all hover:bg-white hover:scale-[1.02] duration-300">
                          <h5 className="text-[10px] font-black text-[#00174b] uppercase tracking-widest text-center mb-4 border-b border-slate-200/50 pb-2">
                            {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                          </h5>
                          <div className="grid grid-cols-7 gap-1">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) => (
                              <div key={`sem1-${monthIndex}-${d}-${idx}`} className="text-center text-[8px] font-black text-slate-400 uppercase py-1">{d}</div>
                            ))}
                            {/* Days Logic */}
                            {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => (
                              <div key={`empty-${monthIndex}-${i}`} className="aspect-square" />
                            ))}
                            {Array.from({ length: daysInMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${currentDate.getFullYear()}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                              const dayEvents = events.filter(e => e.start_date === dateStr);
                              const isToday = new Date().toISOString().split('T')[0] === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex flex-col items-center justify-center rounded-lg text-[10px] font-black transition-all relative group/day",
                                    dayEvents.length > 0 
                                      ? "bg-white text-blue-600 cursor-pointer border border-blue-100 shadow-sm hover:scale-110" 
                                      : isToday ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-200/50"
                                  )}
                                >
                                  {day}
                                  {dayEvents.length > 0 && (
                                    <div className={cn(
                                      "absolute -bottom-0.5 w-1 h-1 rounded-full",
                                      getTypeColor(dayEvents[0].type)
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
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {[6, 7, 8, 9, 10, 11].map(monthIndex => (
                        <div key={monthIndex} className="p-4 bg-slate-50/50 rounded-3xl border border-slate-100/50 hover:shadow-xl transition-all hover:bg-white hover:scale-[1.02] duration-300">
                          <h5 className="text-[10px] font-black text-[#00174b] uppercase tracking-widest text-center mb-4 border-b border-slate-200/50 pb-2">
                            {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                          </h5>
                          <div className="grid grid-cols-7 gap-1">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) => (
                              <div key={`sem2-${monthIndex}-${d}-${idx}`} className="text-center text-[8px] font-black text-slate-400 uppercase py-1">{d}</div>
                            ))}
                            {/* Days Logic */}
                            {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => (
                              <div key={`empty-${monthIndex}-${i}`} className="aspect-square" />
                            ))}
                            {Array.from({ length: daysInMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${currentDate.getFullYear()}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                              const dayEvents = events.filter(e => e.start_date === dateStr);
                              const isToday = new Date().toISOString().split('T')[0] === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex flex-col items-center justify-center rounded-lg text-[10px] font-black transition-all relative group/day",
                                    dayEvents.length > 0 
                                      ? "bg-white text-blue-600 cursor-pointer border border-blue-100 shadow-sm hover:scale-110" 
                                      : isToday ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-200/50"
                                  )}
                                >
                                  {day}
                                  {dayEvents.length > 0 && (
                                    <div className={cn(
                                      "absolute -bottom-0.5 w-1 h-1 rounded-full",
                                      getTypeColor(dayEvents[0].type)
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

                <div className="flex flex-wrap gap-4 pt-8 mt-12 border-t border-slate-50">
                  {[
                    { type: 'holiday', label: 'Feriado' },
                    { type: 'exam', label: 'Avaliação' },
                    { type: 'start_term', label: 'Início Turma' },
                    { type: 'end_term', label: 'Final Turma' },
                    { type: 'class_day', label: 'Dia de Aula' }
                  ].map(item => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full border", getTypeColor(item.type as any))} />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
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
                            getTypeStyle(event.type)
                          )}>
                            {getTypeText(event.type)}
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white max-w-lg w-full rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-50 p-8 border-b border-slate-100">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                    {selectedEvent ? <Edit2 size={20} /> : <Plus size={20} />}
                  </div>
                  {selectedEvent ? 'Editar Evento' : 'Novo Evento'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Título do Evento</label>
                    <input 
                      required
                      type="text"
                      value={formData.title}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      placeholder="Ex: Prova Bimestral, Feriado Municipal..."
                      className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Início</label>
                      <input 
                        required
                        type="date"
                        value={formData.start_date}
                        onChange={e => setFormData({...formData, start_date: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Fim (Opcional)</label>
                      <input 
                        type="date"
                        value={formData.end_date}
                        onChange={e => setFormData({...formData, end_date: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de Evento</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'event', label: 'Evento Geral' },
                        { id: 'holiday', label: 'Feriado' },
                        { id: 'start_term', label: 'Início Turma' },
                        { id: 'end_term', label: 'Final Turma' },
                        { id: 'class_day', label: 'Dia de Aula' },
                        { id: 'exam', label: 'Avaliação' }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setFormData({...formData, type: type.id as any})}
                          className={cn(
                            "px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-tight border transition-all text-center",
                            formData.type === type.id 
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" 
                              : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                          )}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Descrição</label>
                    <textarea 
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="Detalhes adicionais sobre o evento..."
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none"
                    />
                  </div>

                  {['start_term', 'end_term', 'class_day', 'exam'].includes(formData.type) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Turma (Opcional)</label>
                        <select 
                          value={formData.class_id}
                          onChange={e => setFormData({...formData, class_id: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none"
                        >
                          <option value="">Selecione...</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Disciplina (Opcional)</label>
                        <select 
                          value={formData.subject_id}
                          onChange={e => setFormData({...formData, subject_id: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none"
                        >
                          <option value="">Selecione...</option>
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-95"
                  >
                    Salvar Evento
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
