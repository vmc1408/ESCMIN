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
  FileText,
  Settings,
  CalendarDays
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, saveBatch, deleteData, fetchQuery, handleDbError, fetchById, deleteQuery } from '../lib/database';
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    term1_start: '',
    term1_end: '',
    term2_start: '',
    term2_end: '',
    class_weekday: 3,
    skip_holiday_neighbors: true,
    target_class_ids: [] as string[]
  });
  
  const [academicSettings, setAcademicSettings] = useState({
    term1_start: `${new Date().getFullYear()}-02-03`,
    term1_end: `${new Date().getFullYear()}-06-25`,
    term2_start: `${new Date().getFullYear()}-08-04`,
    term2_end: `${new Date().getFullYear()}-11-28`,
    class_weekday: 3, // Quarta-feira
    skip_holiday_neighbors: true,
    target_class_id: ''
  });

  const dayColors = [
    'text-slate-600',   // Dom
    'text-blue-600',     // Seg
    'text-emerald-600', // Ter
    'text-amber-600',   // Qua
    'text-indigo-600',  // Qui
    'text-rose-600',     // Sex
    'text-violet-600'  // Sáb
  ];

  const dayBgColors = [
    'bg-slate-50',
    'bg-blue-50',
    'bg-emerald-50',
    'bg-amber-50',
    'bg-indigo-50',
    'bg-rose-50',
    'bg-violet-50'
  ];

  const dayActiveColors = [
    'bg-slate-600 text-white border-slate-600 shadow-slate-100',
    'bg-blue-600 text-white border-blue-600 shadow-blue-100',
    'bg-emerald-600 text-white border-emerald-600 shadow-emerald-100',
    'bg-amber-600 text-white border-amber-600 shadow-amber-100',
    'bg-indigo-600 text-white border-indigo-600 shadow-indigo-100',
    'bg-rose-600 text-white border-rose-600 shadow-rose-100',
    'bg-violet-600 text-white border-violet-600 shadow-violet-100'
  ];

  // Memoize settings loading to prevent loops
  const [lastLoadedKey, setLastLoadedKey] = useState('');

  useEffect(() => {
    async function loadSettings() {
      const targetId = settingsForm.target_class_ids.length > 0 ? settingsForm.target_class_ids[0] : 'current';
      const key = `${targetId}_${settingsForm.class_weekday}`;
      
      if (key === lastLoadedKey) return;

      try {
        const data = await fetchById('academic_settings', targetId);
        if (data) {
          // Se o dia da semana salvo for o mesmo do que está no form (ou se o usuário acabou de abrir), carrega
          // Se o usuário mudou o dia e estamos carregando por turma, vamos ver se a turma tem outro dia salvo
          setSettingsForm(prev => ({
            ...prev,
            term1_start: formatDateForDisplay(data.term1_start),
            term1_end: formatDateForDisplay(data.term1_end),
            term2_start: formatDateForDisplay(data.term2_start),
            term2_end: formatDateForDisplay(data.term2_end),
            skip_holiday_neighbors: data.skip_holiday_neighbors ?? prev.skip_holiday_neighbors,
            // Only update weekday if we are loading first time or if it specifically matches
            class_weekday: data.class_weekday ?? prev.class_weekday
          }));
          setLastLoadedKey(key);
        } else {
          // Se não houver dados específicos, podemos manter o que está no form (que veio do 'current' no open)
          // Mas se o usuário mudar de turma e não tiver dados, talvez queiramos resetar para os valores globais
          if (targetId !== 'current') {
            const global = await fetchById('academic_settings', 'current');
            if (global) {
              setSettingsForm(prev => ({
                ...prev,
                term1_start: formatDateForDisplay(global.term1_start),
                term1_end: formatDateForDisplay(global.term1_end),
                term2_start: formatDateForDisplay(global.term2_start),
                term2_end: formatDateForDisplay(global.term2_end),
                skip_holiday_neighbors: global.skip_holiday_neighbors,
              }));
            }
          }
          setLastLoadedKey(key);
        }
      } catch (err) {
        console.error("Error loading settings:", err);
      }
    }

    if (showSettings) {
      loadSettings();
    }
  }, [showSettings, settingsForm.target_class_ids[0], settingsForm.class_weekday]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    type: 'class_day' as CalendarEvent['type'],
    class_id: '',
    subject_id: ''
  });

  const fetchData = React.useCallback(async () => {
    try {
      const fetchResults = await Promise.allSettled([
        fetchAll('calendar_events', '*', 'start_date'),
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchById('academic_settings', 'current')
      ]);

      const eventsData = fetchResults[0].status === 'fulfilled' ? fetchResults[0].value : [];
      const classesData = fetchResults[1].status === 'fulfilled' ? fetchResults[1].value : [];
      const subjectsData = fetchResults[2].status === 'fulfilled' ? fetchResults[2].value : [];
      const settingsData = fetchResults[3].status === 'fulfilled' ? fetchResults[3].value : null;

      setEvents(eventsData || []);
      setClasses(classesData || []);
      setSubjects(subjectsData || []);
      
      if (settingsData) {
        setAcademicSettings({
          ...settingsData,
          term1_start: settingsData.term1_start || `${new Date().getFullYear()}-02-03`,
          term1_end: settingsData.term1_end || `${new Date().getFullYear()}-06-25`,
          term2_start: settingsData.term2_start || `${new Date().getFullYear()}-08-04`,
          term2_end: settingsData.term2_end || `${new Date().getFullYear()}-11-28`,
          target_class_id: settingsData.target_class_id || ''
        });
      }
      
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
    { title: "Aniversário de São Paulo (Obs)", date: "2025-01-25", category: 'estadual' },
    { title: "Carnaval", date: "2025-03-04", category: 'nacional' },
    { title: "Sexta-feira Santa", date: "2025-04-18", category: 'nacional' },
    { title: "Páscoa", date: "2025-04-20", category: 'nacional' },
    { title: "Tiradentes", date: "2025-04-21", category: 'nacional' },
    { title: "Dia do Trabalho", date: "2025-05-01", category: 'nacional' },
    { title: "Santo Antônio (Guarulhos)", date: "2025-06-13", category: 'municipal' },
    { title: "Corpus Christi", date: "2025-06-19", category: 'nacional' },
    { title: "Revolução Constitucionalista", date: "2025-07-09", category: 'estadual' },
    { title: "Independência do Brasil", date: "2025-09-07", category: 'nacional' },
    { title: "Nossa Sra Aparecida", date: "2025-10-12", category: 'nacional' },
    { title: "Dia do Servidor Público", date: "2025-10-28", category: 'estadual' },
    { title: "Finados", date: "2025-11-02", category: 'nacional' },
    { title: "Proclamação da República", date: "2025-11-15", category: 'nacional' },
    { title: "Consciência Negra", date: "2025-11-20", category: 'nacional' },
    { title: "Imaculada Conceição (Aniv. Guarulhos)", date: "2025-12-08", category: 'municipal' },
    { title: "Natal", date: "2025-12-25", category: 'nacional' },
    // 2026
    { title: "Confraternização Universal", date: "2026-01-01", category: 'nacional' },
    { title: "Aniversário de São Paulo (Obs)", date: "2026-01-25", category: 'estadual' },
    { title: "Carnaval", date: "2026-02-17", category: 'nacional' },
    { title: "Sexta-feira Santa", date: "2026-04-03", category: 'nacional' },
    { title: "Páscoa", date: "2026-04-05", category: 'nacional' },
    { title: "Tiradentes", date: "2026-04-21", category: 'nacional' },
    { title: "Dia do Trabalho", date: "2026-05-01", category: 'nacional' },
    { title: "Santo Antônio (Guarulhos)", date: "2026-06-13", category: 'municipal' },
    { title: "Corpus Christi", date: "2026-06-04", category: 'nacional' },
    { title: "Revolução Constitucionalista", date: "2026-07-09", category: 'estadual' },
    { title: "Independência do Brasil", date: "2026-09-07", category: 'nacional' },
    { title: "Nossa Sra Aparecida", date: "2026-10-12", category: 'nacional' },
    { title: "Dia do Servidor Público", date: "2026-10-28", category: 'estadual' },
    { title: "Finados", date: "2026-11-02", category: 'nacional' },
    { title: "Proclamação da República", date: "2026-11-15", category: 'nacional' },
    { title: "Consciência Negra", date: "2026-11-20", category: 'nacional' },
    { title: "Imaculada Conceição (Aniv. Guarulhos)", date: "2026-12-08", category: 'municipal' },
    { title: "Natal", date: "2026-12-25", category: 'nacional' },
    // 2027
    { title: "Confraternização Universal", date: "2027-01-01", category: 'nacional' },
    { title: "Aniversário de São Paulo (Obs)", date: "2027-01-25", category: 'estadual' },
    { title: "Carnaval", date: "2027-02-09", category: 'nacional' },
    { title: "Sexta-feira Santa", date: "2027-03-26", category: 'nacional' },
    { title: "Páscoa", date: "2027-03-28", category: 'nacional' },
    { title: "Tiradentes", date: "2027-04-21", category: 'nacional' },
    { title: "Dia do Trabalho", date: "2027-05-01", category: 'nacional' },
    { title: "Santo Antônio (Guarulhos)", date: "2027-06-13", category: 'municipal' },
    { title: "Corpus Christi", date: "2027-05-27", category: 'nacional' },
    { title: "Revolução Constitucionalista", date: "2027-07-09", category: 'estadual' },
    { title: "Independência do Brasil", date: "2027-09-07", category: 'nacional' },
    { title: "Nossa Sra Aparecida", date: "2027-10-12", category: 'nacional' },
    { title: "Dia do Servidor Público", date: "2027-10-28", category: 'estadual' },
    { title: "Finados", date: "2027-11-02", category: 'nacional' },
    { title: "Proclamação da República", date: "2027-11-15", category: 'nacional' },
    { title: "Consciência Negra", date: "2027-11-20", category: 'nacional' },
    { title: "Imaculada Conceição (Aniv. Guarulhos)", date: "2027-12-08", category: 'municipal' },
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
      const yearHolidays = events.filter(e => {
        const d = new Date(e.start_date + 'T00:00:00');
        const isHoliday = e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun';
        return isHoliday && d.getFullYear() === currentYear;
      });
      
      // Se houver menos de 10 feriados, provável que falte sincronizar este ano
      if (yearHolidays.length < 10) {
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
          (e.type?.includes('holiday') || e.title === h.title)
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
        } else if (existingEvent.description !== description || existingEvent.title !== h.title || existingEvent.type !== type) {
          itemsToUpdate.push({
            id: existingEvent.id,
            title: h.title,
            start_date: h.date, // Required for batch upsert safety
            end_date: h.date,
            type: type,
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


  const clearClassDays = async () => {
    if (!isAdmin && !isDirector) return;
    if (!window.confirm("Deseja realmente EXCLUIR TODO o cronograma de aulas gerado? Esta ação não afetará feriados ou eventos manuais.")) return;
    
    setIsSyncing(true);
    try {
      const clearFilters: any[] = [
        { field: 'description', operator: 'ilike', value: 'Cronograma automático%' }
      ];
      
      await deleteQuery('calendar_events', clearFilters);
      await new Promise(r => setTimeout(r, 500));
      await fetchData();
      setNotification({ type: 'success', message: 'Cronograma de aulas excluído com sucesso!' });
    } catch (error) {
      console.error("Error clearing class days:", error);
      setNotification({ type: 'err', message: 'Erro ao excluir cronograma.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const generateClassDays = async (customSettings?: any) => {
    if (!userAuth) return;
    setIsSyncing(true);
    setNotification({ type: 'success', message: 'Sincronizando feriados e gerando cronograma...' });
    
    const settings = customSettings || academicSettings;
    
    try {
      // First, ensure holidays are up to date for the current year
      await syncHolidays(true);

      // --- CLEAR OLD AUTOMATIC EVENTS ---
      const clearFilters: any[] = [
        { field: 'description', operator: 'ilike', value: 'Cronograma automático%' }
      ];
      
      if (settings.target_class_id) {
        clearFilters.push({ field: 'class_id', operator: '==', value: settings.target_class_id });
      } else {
        clearFilters.push({ field: 'class_id', operator: 'is', value: null });
      }

      await deleteQuery('calendar_events', clearFilters);
      await new Promise(r => setTimeout(r, 500));
      await fetchData();

      const ranges = [
        { start: new Date(settings.term1_start + 'T00:00:00'), end: new Date(settings.term1_end + 'T00:00:00') },
        { start: new Date(settings.term2_start + 'T00:00:00'), end: new Date(settings.term2_end + 'T00:00:00') }
      ];

      const targetClass = settings.target_class_id ? classes.find(c => c.id === settings.target_class_id) : null;
      const classLabel = targetClass ? ` - ${targetClass.name}` : '';

      const holidays = events.filter(e => e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun');
      const holidayDates = new Set(holidays.map(h => h.start_date));

      const newEvents: any[] = [];

      // Add Term Start/End
      const termEvents = [
        { date: settings.term1_start, title: `Início do 1º Semestre${classLabel}`, type: 'start_term' },
        { date: settings.term1_end, title: `Término do 1º Semestre${classLabel}`, type: 'end_term' },
        { date: settings.term2_start, title: `Início do 2º Semestre${classLabel}`, type: 'start_term' },
        { date: settings.term2_end, title: `Término do Ano Letivo${classLabel}`, type: 'end_term' }
      ];

      for (const te of termEvents) {
        if (!te.date) continue;
        const dateStr = te.date;
        const exists = events.some(e => e.start_date === dateStr && (e.type === te.type || e.type.includes('holiday')) && (!settings.target_class_id || e.class_id === settings.target_class_id));
        
        if (!exists) {
          newEvents.push({
            title: te.title,
            start_date: dateStr,
            end_date: dateStr,
            type: te.type,
            description: te.title,
            class_id: settings.target_class_id || null,
            user_id: userAuth.uid,
            created_at: new Date().toISOString()
          });
        }
      }

      for (const range of ranges) {
        if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) continue;
        let current = new Date(range.start);
        while (current <= range.end) {
          if (current.getDay() === settings.class_weekday) {
            const dateStr = current.toISOString().split('T')[0];
            
            const yesterday = new Date(current);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const tomorrow = new Date(current);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            const isHoliday = holidayDates.has(dateStr);
            const prevIsHoliday = holidayDates.has(yesterdayStr);
            const nextIsHoliday = holidayDates.has(tomorrowStr);

            const isBridge = settings.skip_holiday_neighbors && (prevIsHoliday || nextIsHoliday);

            if (!isHoliday) {
              const alreadyHasEvent = events.some(e => 
                e.start_date === dateStr && 
                (e.type === 'class_day' || e.type.includes('holiday') || e.type.includes('_term')) &&
                (!settings.target_class_id || e.class_id === settings.target_class_id)
              );
              
              if (!alreadyHasEvent) {
                if (isBridge) {
                  newEvents.push({
                    title: `Aula Abonada${classLabel}`,
                    start_date: dateStr,
                    end_date: dateStr,
                    type: 'event',
                    description: 'Dia letivo suspenso por proximidade com feriado.',
                    class_id: settings.target_class_id || null,
                    user_id: userAuth.uid,
                    created_at: new Date().toISOString()
                  });
                } else {
                  newEvents.push({
                    title: 'Dia de Aula',
                    start_date: dateStr,
                    end_date: dateStr,
                    type: 'class_day',
                    description: `Cronograma automático${classLabel}`,
                    class_id: settings.target_class_id || null,
                    user_id: userAuth.uid,
                    created_at: new Date().toISOString()
                  });
                }
              }
            }
          }
          current.setDate(current.getDate() + 1);
        }
      }

      if (newEvents.length > 0) {
        await saveBatch('calendar_events', newEvents, 60000);
      }

      await fetchData();
      setNotification({ type: 'success', message: `${newEvents.length} registros acadêmicos gerados!` });
    } catch (error) {
      console.error("Error generating class days:", error);
      setNotification({ type: 'err', message: 'Erro ao gerar cronograma.' });
    } finally {
      setIsSyncing(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;
    setIsSyncing(true);

    try {
      const dbStartDate = parseDateToDB(formData.start_date);
      if (!dbStartDate) {
        setNotification({ type: 'err', message: 'Data de início é obrigatória e deve estar no formato DD/MM/AAAA' });
        setIsSyncing(false);
        return;
      }

      const data = {
        ...formData,
        start_date: dbStartDate,
        end_date: parseDateToDB(formData.end_date) || null,
        class_id: formData.class_id || null,
        subject_id: formData.subject_id || null,
        user_id: userAuth.uid,
        updated_at: new Date().toISOString()
      };

      await saveData('calendar_events', selectedEvent?.id, data);
      
      setNotification({ type: 'success', message: `Evento ${selectedEvent ? 'atualizado' : 'criado'} com sucesso!` });
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
      await fetchData();
    } catch (error: any) {
      console.error('Error saving calendar event:', error);
      const errorMsg = error.message || 'Erro ao salvar';
      setNotification({ type: 'err', message: `Erro ao salvar evento: ${errorMsg}` });
    } finally {
      setIsSyncing(false);
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
      setNotification({ type: 'success', message: 'Evento excluído com sucesso!' });
      fetchData();
    } catch (error) {
      handleDbError(error, 'delete', `calendar_events/${id}`);
    }
  };

  const isSyncingInPage = isSyncing; // Avoid naming conflict if any

  // Detect today's date in local format, or fallback to user's desired date if specifically requested
  const todayStr = React.useMemo(() => {
    // Basic local date
    const d = new Date();
    return d.toLocaleDateString('en-CA');
  }, []);

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

  // Deduplicate events for the current year
  const uniqueYearEvents = React.useMemo(() => {
    return events.filter(e => {
      const date = new Date(e.start_date + 'T00:00:00');
      return date.getFullYear() === currentDate.getFullYear();
    }).reduce((acc, current) => {
      // Agrupa visualmente eventos do mesmo tipo no mesmo dia (como "Dia de Aula", "Exame" ou "Aula Abonada")
      // e concatena os nomes das turmas se houver múltiplos eventos para turmas diferentes
      const isGroupable = current.type === 'class_day' || current.type === 'exam' || current.title.includes('Aula Abonada');
      const existingIndex = acc.findIndex(item => 
        item.start_date === current.start_date && 
        (isGroupable ? item.type === current.type : (item.title === current.title && item.type === current.type))
      );

      if (existingIndex === -1) {
        const displayEvent = { ...current };
        if (isGroupable && current.class_id) {
          const className = classes.find(c => c.id === current.class_id)?.name;
          if (className && !displayEvent.title.includes(className)) {
            displayEvent.title = displayEvent.title.includes(':') 
              ? `${displayEvent.title}, ${className}` 
              : `${displayEvent.title}: ${className}`;
          }
        }
        acc.push(displayEvent);
      } else {
        if (isGroupable && current.class_id) {
          const className = classes.find(c => c.id === current.class_id)?.name;
          if (className && !acc[existingIndex].title.includes(className)) {
            acc[existingIndex].title = acc[existingIndex].title.includes(':') 
              ? `${acc[existingIndex].title}, ${className}` 
              : `${acc[existingIndex].title}: ${className}`;
          }
        }
      }
      return acc;
    }, [] as CalendarEvent[]);
  }, [events, currentDate.getFullYear(), classes]);

  const filteredEvents = uniqueYearEvents.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(search.toLowerCase()) ||
                         event.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || 
                       (typeFilter === 'term' ? (event.type === 'start_term' || event.type === 'end_term' || event.type === 'class_day') : 
                        typeFilter === 'holiday_nac' ? (event.type === 'holiday_nac' || (event.type === 'holiday' && !(event.description || '').toLowerCase().includes('estadual') && !(event.description || '').toLowerCase().includes('municipal'))) :
                        typeFilter === 'holiday_est' ? (event.type === 'holiday_est' || (event.type === 'holiday' && (event.description || '').toLowerCase().includes('estadual'))) :
                        typeFilter === 'holiday_mun' ? (event.type === 'holiday_mun' || (event.type === 'holiday' && (event.description || '').toLowerCase().includes('municipal'))) : 
                        event.type === typeFilter);
    return matchesSearch && matchesType;
  });

  // Group events by month
  const groupedEvents = filteredEvents.reduce((acc, event) => {
    // Force local date interpretation
    const date = new Date(event.start_date + 'T00:00:00');
    const monthYear = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // Improved Stats for the filters using the memoized unique events
  const getEventCount = (type: string) => {
    if (type === 'all') return uniqueYearEvents.length;
    
    if (type === 'term') {
      return uniqueYearEvents.filter(e => e.type === 'start_term' || e.type === 'end_term' || e.type === 'class_day').length;
    }

    if (type === 'holiday_nac') {
      return uniqueYearEvents.filter(e => e.type === 'holiday_nac' || (e.type === 'holiday' && !(e.description || '').toLowerCase().includes('estadual') && !(e.description || '').toLowerCase().includes('municipal'))).length;
    }

    if (type === 'holiday_est') {
      return uniqueYearEvents.filter(e => e.type === 'holiday_est' || (e.type === 'holiday' && (e.description || '').toLowerCase().includes('estadual'))).length;
    }

    if (type === 'holiday_mun') {
      return uniqueYearEvents.filter(e => e.type === 'holiday_mun' || (e.type === 'holiday' && (e.description || '').toLowerCase().includes('municipal'))).length;
    }

    return uniqueYearEvents.filter(e => e.type === type).length;
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
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all shadow-sm"
                  title="Configurações Acadêmicas"
                >
                  <Settings size={20} />
                </button>
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
              </div>
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
        ].map((stat) => {
          const cardEvents = uniqueYearEvents.filter(e => {
            if (stat.id === 'class_day') return e.type === 'class_day';
            if (stat.id === 'holiday_nac') return e.type === 'holiday_nac' || (e.type === 'holiday' && !(e.description || '').toLowerCase().includes('estadual') && !(e.description || '').toLowerCase().includes('municipal'));
            if (stat.id === 'holiday_est') return e.type === 'holiday_est' || (e.type === 'holiday' && (e.description || '').toLowerCase().includes('estadual'));
            if (stat.id === 'holiday_mun') return e.type === 'holiday_mun' || (e.type === 'holiday' && (e.description || '').toLowerCase().includes('municipal'));
            return false;
          }).sort((a,b) => a.start_date.localeCompare(b.start_date));

          return (
            <motion.div 
              key={stat.id}
              whileHover={{ y: -4 }}
              onClick={() => {
                setTypeFilter(stat.id === 'class_day' ? 'term' : stat.id);
                setViewMode('list');
              }}
              className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 cursor-pointer hover:shadow-xl hover:shadow-blue-900/5 transition-all group relative overflow-visible"
            >
              <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl", stat.bg)} />
              
              {/* Hover List Dropdown */}
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30 pointer-events-none scale-95 group-hover:scale-100 origin-top">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Próximos Eventos</p>
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {cardEvents.length > 0 ? cardEvents.map(e => (
                    <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", stat.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-700 truncate">{e.title}</p>
                        <p className="text-[8px] font-medium text-slate-400 uppercase">{new Date(e.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-[10px] font-medium text-slate-400 italic px-1">Nenhum evento este ano</p>
                  )}
                </div>
              </div>

              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-105 z-10", stat.color)}>
                <span className="text-base font-black">{stat.count}</span>
              </div>
              <div className="flex flex-col z-10">
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none mb-1">{stat.label}</span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[9px] font-bold uppercase", stat.text)}>Ver detalhes</span>
                </div>
              </div>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                <ChevronRight size={16} className={stat.text} />
              </div>
            </motion.div>
          );
        })}
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
                  { id: 'holiday_est', label: 'Feriados Estaduais', icon: <div className="w-2 h-2 rounded-full bg-indigo-600" />, desc: 'Leis estaduais' },
                  { id: 'holiday_mun', label: 'Feriados Municipais', icon: <div className="w-2 h-2 rounded-full bg-amber-600" />, desc: 'Leis municipais' },
                  { id: 'term', label: 'Cronograma Escolar', icon: <Clock size={14} />, desc: 'Aulas e períodos' },
                  { id: 'event', label: 'Eventos & Datas', icon: <CalendarIcon size={14} />, desc: 'Atividades extras' }
                ].map(item => {
                  const count = getEventCount(item.id);
                  if (count === 0 && item.id !== 'all' && item.id !== 'term') return null;
                  
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
              const today = new Date().toLocaleDateString('en-CA');
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
                    const classEvents = uniqueYearEvents.filter(e => e.type === 'class_day')
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
                    const isToday = todayStr === dateStr;

                    return (
                      <motion.div 
                        key={`month-day-${day}`}
                        whileHover={{ scale: 1.01, zIndex: 10 }}
                        whileTap={{ scale: 0.98, backgroundColor: 'rgba(245, 158, 11, 0.05)' }}
                        onClick={() => {
                          if (isAdmin || isDirector) {
                            setFormData({
                              title: 'Dia de Aula',
                              description: '',
                              start_date: formatDateForDisplay(dateStr),
                              end_date: formatDateForDisplay(dateStr),
                              type: 'class_day',
                              class_id: '',
                              subject_id: ''
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
                                  const dayEvents = filteredEvents.filter(e => e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date));
                                  const holiday = dayEvents.find(e => e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun');
                                  const isToday = todayStr === dateStr;

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
                                        ? cn(
                                            dayEvents[0].type === 'class_day' 
                                              ? (dayActiveColors[new Date(dateStr + 'T00:00:00').getDay()].split(' ')[0] + " text-white border-transparent")
                                              : "bg-blue-600 text-white border-blue-700",
                                            "cursor-pointer hover:scale-110 shadow-sm"
                                          )
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
                              const dayEvents = filteredEvents.filter(e => e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date));
                              const holiday = dayEvents.find(e => e.type === 'holiday' || e.type === 'holiday_nac' || e.type === 'holiday_est' || e.type === 'holiday_mun');
                              const isToday = todayStr === dateStr;

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
                                        ? cn(
                                            dayEvents[0].type === 'class_day' 
                                              ? (dayActiveColors[new Date(dateStr + 'T00:00:00').getDay()].split(' ')[0] + " text-white border-transparent")
                                              : "bg-blue-600 text-white border-blue-700",
                                            "cursor-pointer hover:scale-110 shadow-sm"
                                          )
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
            <div className="space-y-12">
              {/* Seção 1: Eventos e Feriados Manuais */}
              {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).some(([_, events]) => events.some(e => e.type !== 'class_day' && !e.description?.includes('Cronograma automático'))) && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4 px-2">
                    <div className="h-px flex-1 bg-slate-200" />
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] whitespace-nowrap">Eventos & Feriados</h2>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  
                  {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => {
                    const manualEvents = monthEvents.filter(e => e.type !== 'class_day' && !e.description?.includes('Cronograma automático'));
                    if (manualEvents.length === 0) return null;

                    return (
                      <div key={`manual-${month}`} className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 flex items-center gap-2">
                          <div className="w-1 h-3 bg-blue-600 rounded-full" />
                          {month}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {manualEvents.map(event => (
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
                    );
                  })}
                </div>
              )}

              {/* Seção 2: Cronograma Automático */}
              {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).some(([_, events]) => events.some(e => e.type === 'class_day' || e.description?.includes('Cronograma automático'))) && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4 px-2">
                    <div className="h-px flex-1 bg-slate-200" />
                    <h2 className="text-xs font-black text-blue-400 uppercase tracking-[0.3em] whitespace-nowrap">Cronograma de Aulas Programadas</h2>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  
                  {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => {
                    const autoEvents = monthEvents.filter(e => e.type === 'class_day' || e.description?.includes('Cronograma automático'));
                    if (autoEvents.length === 0) return null;

                    return (
                      <div key={`auto-${month}`} className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 flex items-center gap-2">
                          <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                          {month}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {autoEvents.map(event => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              key={event.id} 
                              className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 hover:bg-white hover:border-blue-200 hover:shadow-md transition-all group cursor-pointer relative"
                              onClick={() => handleEdit(event)}
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                                    dayActiveColors[new Date(event.start_date + 'T00:00:00').getDay()].split(' ')[0],
                                    "text-white"
                                  )}>
                                    <BookOpen size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-[13px] font-black text-slate-800 leading-tight truncate">{event.title}</h4>
                                    <p className="text-[10px] font-bold text-slate-500 mt-1">
                                      {new Date(event.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                                    </p>
                                  </div>
                                </div>
                                
                                {(isAdmin || isDirector) && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(event.id);
                                    }}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                  </div>
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

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white max-w-xl w-full rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200/50"
            >
              <div className="px-8 py-10 bg-[#00174b] text-white relative">
                <button 
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full transition-all text-white/50 hover:text-white"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center shadow-2xl ring-4 ring-white/10">
                    <CalendarDays size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">Configurações</h3>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.25em] mt-1">Cronograma Automático</p>
                  </div>
                </div>
              </div>

              <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* 1. Dia da Semana (Prioridade conforme solicitado) */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                    <CalendarIcon size={12} /> Dia da Semana Principal
                  </h4>
                  <div className="grid grid-cols-7 gap-1.5">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => (
                      <button
                        key={day}
                        onClick={() => setSettingsForm({...settingsForm, class_weekday: i})}
                        className={cn(
                          "py-3 rounded-[1rem] text-[9px] font-black uppercase transition-all border-2",
                          settingsForm.class_weekday === i 
                            ? dayActiveColors[i] 
                            : "bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100 hover:border-slate-200"
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Datas dos Semestres */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 px-1">
                      <Star size={12} /> 1º Semestre
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="relative group">
                        <input 
                          type="text" 
                          placeholder="DD/MM/AAAA"
                          value={settingsForm.term1_start}
                          onChange={e => setSettingsForm({...settingsForm, term1_start: maskDate(e.target.value)})}
                          className="w-full bg-slate-50 border-2 border-transparent rounded-[1.25rem] py-4 px-5 text-sm font-bold text-slate-700 focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                        />
                        <span className="absolute -top-2 left-4 px-2 bg-white text-[8px] font-black text-slate-400 uppercase border border-slate-100 rounded-full">Início</span>
                      </div>
                      <div className="relative group">
                        <input 
                          type="text" 
                          placeholder="DD/MM/AAAA"
                          value={settingsForm.term1_end}
                          onChange={e => setSettingsForm({...settingsForm, term1_end: maskDate(e.target.value)})}
                          className="w-full bg-slate-50 border-2 border-transparent rounded-[1.25rem] py-4 px-5 text-sm font-bold text-slate-700 focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                        />
                         <span className="absolute -top-2 left-4 px-2 bg-white text-[8px] font-black text-slate-400 uppercase border border-slate-100 rounded-full">Fim</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2 px-1">
                      <Star size={12} /> 2º Semestre
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="relative group">
                        <input 
                          type="text" 
                          placeholder="DD/MM/AAAA"
                          value={settingsForm.term2_start}
                          onChange={e => setSettingsForm({...settingsForm, term2_start: maskDate(e.target.value)})}
                          className="w-full bg-slate-50 border-2 border-transparent rounded-[1.25rem] py-4 px-5 text-sm font-bold text-slate-700 focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                        />
                        <span className="absolute -top-2 left-4 px-2 bg-white text-[8px] font-black text-slate-400 uppercase border border-slate-100 rounded-full">Início</span>
                      </div>
                      <div className="relative group">
                        <input 
                          type="text" 
                          placeholder="DD/MM/AAAA"
                          value={settingsForm.term2_end}
                          onChange={e => setSettingsForm({...settingsForm, term2_end: maskDate(e.target.value)})}
                          className="w-full bg-slate-50 border-2 border-transparent rounded-[1.25rem] py-4 px-5 text-sm font-bold text-slate-700 focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                        />
                         <span className="absolute -top-2 left-4 px-2 bg-white text-[8px] font-black text-slate-400 uppercase border border-slate-100 rounded-full">Fim</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Turmas Alvo (Minimizado) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <BookOpen size={12} /> Turmas Alvo
                    </h4>
                    <button 
                      onClick={() => {
                        const allIds = classes.map(c => c.id);
                        const isAllSelected = settingsForm.target_class_ids.length === classes.length;
                        setSettingsForm({
                          ...settingsForm,
                          target_class_ids: isAllSelected ? [] : allIds
                        });
                      }}
                      className="text-[9px] font-bold text-blue-600 hover:underline"
                    >
                      {settingsForm.target_class_ids.length === classes.length ? 'Limpar Seleção' : 'Selecionar Todas'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-[1.5rem] border border-slate-100 shadow-inner max-h-32 overflow-y-auto custom-scrollbar">
                    {classes.map((c, idx) => {
                      const isSelected = settingsForm.target_class_ids.includes(c.id);
                      const classHighlight = dayActiveColors[idx % dayActiveColors.length].split(' ')[0];
                      const classText = dayColors[idx % dayColors.length];
                      
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            if (isSelected) {
                              setSettingsForm({
                                ...settingsForm,
                                target_class_ids: settingsForm.target_class_ids.filter(id => id !== c.id)
                              });
                            } else {
                              setSettingsForm({
                                ...settingsForm,
                                target_class_ids: [...settingsForm.target_class_ids, c.id]
                              });
                            }
                          }}
                          className={cn(
                            "px-3 py-2 rounded-xl text-[10px] font-bold transition-all border flex items-center gap-2",
                            isSelected 
                              ? `bg-white border-blue-100 ${classText} shadow-sm ring-1 ring-blue-50` 
                              : "bg-transparent border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/50"
                          )}
                        >
                          <div className={cn(
                            "w-2.5 h-2.5 rounded-full transition-all",
                            isSelected ? classHighlight : "bg-slate-200"
                          )} />
                          {c.code}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Opções Extras */}
                <div className="flex items-center justify-between p-5 bg-blue-50/30 rounded-[1.5rem] border border-blue-100/50">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-black text-slate-800">Abono Automático</p>
                    <p className="text-[9px] font-bold text-slate-400">Pular aulas vizinhas a feriados (Pontes).</p>
                  </div>
                  <button 
                    onClick={() => setSettingsForm({...settingsForm, skip_holiday_neighbors: !settingsForm.skip_holiday_neighbors})}
                    className={cn(
                      "w-12 h-6 rounded-full relative transition-all duration-300",
                      settingsForm.skip_holiday_neighbors ? "bg-blue-600" : "bg-slate-300"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                      settingsForm.skip_holiday_neighbors ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>

                {/* 5. Ações Adicionais (NOVO) */}
                {(isAdmin || isDirector) && (
                  <div className="pt-6 border-t border-slate-100 flex flex-col gap-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ações de Manutenção</h4>
                    <button
                      type="button"
                      onClick={clearClassDays}
                      className="w-full py-4 px-6 bg-red-50 text-red-600 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-red-100 transition-all border border-red-100"
                    >
                      <Trash2 size={16} />
                      Zerar Cronograma de Aulas (Limpar Testes)
                    </button>
                    <p className="text-[9px] font-bold text-slate-400 text-center px-4 leading-relaxed">
                      Esta ação remove permanentemente todos os registros automáticos do cronograma. Use para reiniciar testes ou corrigir erros em lote.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
                <button 
                  onClick={async () => {
                    const t1Start = parseDateToDB(settingsForm.term1_start);
                    const t1End = parseDateToDB(settingsForm.term1_end);
                    const t2Start = parseDateToDB(settingsForm.term2_start);
                    const t2End = parseDateToDB(settingsForm.term2_end);

                    if (!t1Start || !t1End || !t2Start || !t2End) {
                      setNotification({ type: 'err', message: 'Preencha todas as datas corretamente (DD/MM/AAAA).' });
                      return;
                    }

                    setIsSyncing(true);
                    try {
                      const targets = settingsForm.target_class_ids.length > 0 
                        ? settingsForm.target_class_ids 
                        : ['current'];

                      for (const targetId of targets) {
                        const updatedSettings = {
                          id: targetId,
                          term1_start: t1Start,
                          term1_end: t1End,
                          term2_start: t2Start,
                          term2_end: t2End,
                          class_weekday: settingsForm.class_weekday,
                          skip_holiday_neighbors: settingsForm.skip_holiday_neighbors,
                          target_class_id: targetId === 'current' ? null : targetId
                        };
                        
                        await saveData('academic_settings', targetId, updatedSettings);
                        if (targetId === 'current') setAcademicSettings(updatedSettings);
                        
                        // Generate days for each class
                        await generateClassDays(updatedSettings);
                      }

                      setShowSettings(false);
                      setNotification({ type: 'success', message: 'Configurações salvas e calendários atualizados!' });
                    } catch (error) {
                      console.error("Error saving settings:", error);
                      setNotification({ type: 'err', message: 'Erro ao salvar configurações.' });
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Salvar e Regerar Calendário
                    </>
                  )}
                </button>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3 text-slate-400 text-[9px] font-black uppercase tracking-widest hover:text-slate-600"
                >
                  Cancelar sem salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
