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
  CalendarDays,
  Layout,
  Flag,
  MapPin,
  Map,
  ArrowUpAZ,
  ArrowDownZA,
  ListFilter
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

interface AcademicSettings {
  id?: string;
  term1_start: string;
  term1_end: string;
  term2_start: string;
  term2_end: string;
  class_weekdays: number[];
  weekday_titles?: Record<number, string>;
  target_class_ids: string[];
}

export function AcademicCalendar() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [weekdayFilter, setWeekdayFilter] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'year' | 'list' | 'month'>('month');
  const [showSettings, setShowSettings] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Helper para calcular a Páscoa (Algoritmo de Meeus/Jones/Butcher)
  const getEaster = (year: number) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = Math.floor((h + l - 7 * m + 114) / 31);
    const p = (h + l - 7 * m + 114) % 31;
    return new Date(year, n - 1, p + 1);
  };

  // Helper para gerar feriados dinamicamente para qualquer ano
  const getHolidaysForYear = (year: number) => {
    const easter = getEaster(year);
    
    // Carnival is 47 days before Easter
    const carnival = new Date(easter);
    carnival.setDate(easter.getDate() - 47);
    
    // Good Friday is 2 days before Easter
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    
    // Corpus Christi is 60 days after Easter
    const corpusChristi = new Date(easter);
    corpusChristi.setDate(easter.getDate() + 60);

    return [
      { title: "Confraternização Universal", date: `${year}-01-01`, category: 'nacional' },
      { title: "Carnaval", date: carnival.toISOString().split('T')[0], category: 'nacional' },
      { title: "Sexta-feira Santa", date: goodFriday.toISOString().split('T')[0], category: 'nacional' },
      { title: "Páscoa", date: easter.toISOString().split('T')[0], category: 'nacional' },
      { title: "Tiradentes", date: `${year}-04-21`, category: 'nacional' },
      { title: "Dia do Trabalho", date: `${year}-05-01`, category: 'nacional' },
      { title: "Corpus Christi", date: corpusChristi.toISOString().split('T')[0], category: 'nacional' },
      { title: "Independência do Brasil", date: `${year}-09-07`, category: 'nacional' },
      { title: "Nossa Sra Aparecida", date: `${year}-10-12`, category: 'nacional' },
      { title: "Finados", date: `${year}-11-02`, category: 'nacional' },
      { title: "Proclamação da República", date: `${year}-11-15`, category: 'nacional' },
      { title: "Consciência Negra", date: `${year}-11-20`, category: 'nacional' },
      { title: "Natal", date: `${year}-12-25`, category: 'nacional' },
      // Feriados Estaduais (SP)
      { title: "Revolução Constitucionalista", date: `${year}-07-09`, category: 'estadual' },
      { title: "Dia do Servidor Público", date: `${year}-10-28`, category: 'estadual' },
      // Feriados Municipais (Guarulhos exemplo)
      { title: "Santo Antônio (Guarulhos)", date: `${year}-06-13`, category: 'municipal' },
      { title: "Imaculada Conceição (Aniv. Guarulhos)", date: `${year}-12-08`, category: 'municipal' },
    ];
  };

  const [settingsForm, setSettingsForm] = useState({
    term1_start: '',
    term1_end: '',
    term2_start: '',
    term2_end: '',
    class_weekdays: [3] as number[],
    weekday_titles: {} as Record<number, string>,
    target_class_ids: [] as string[]
  });

  const [academicSettings, setAcademicSettings] = useState<AcademicSettings>({
    term1_start: `${new Date().getFullYear()}-02-03`,
    term1_end: `${new Date().getFullYear()}-06-25`,
    term2_start: `${new Date().getFullYear()}-08-04`,
    term2_end: `${new Date().getFullYear()}-11-28`,
    class_weekdays: [3], 
    weekday_titles: { 3: 'Dia de Aula' },
    target_class_ids: []
  });

  const dayColors = [
    'text-slate-600',   // Dom
    'text-blue-600',     // Seg
    'text-indigo-600',  // Ter
    'text-emerald-600', // Qua
    'text-yellow-500',  // Qui
    'text-rose-600',     // Sex
    'text-violet-600'  // Sáb
  ];

  const dayBgColors = [
    'bg-slate-50',
    'bg-blue-50',
    'bg-indigo-50',
    'bg-emerald-50',
    'bg-yellow-50',
    'bg-rose-50',
    'bg-violet-50'
  ];

  const dayActiveColors = [
    'bg-slate-600 text-white border-slate-600 shadow-slate-100',
    'bg-blue-600 text-white border-blue-600 shadow-blue-100',
    'bg-indigo-600 text-white border-indigo-600 shadow-indigo-100',
    'bg-emerald-600 text-white border-emerald-600 shadow-emerald-100',
    'bg-yellow-300 text-slate-800 border-yellow-300 shadow-yellow-100',
    'bg-rose-600 text-white border-rose-600 shadow-rose-100',
    'bg-violet-600 text-white border-violet-600 shadow-violet-100'
  ];

  // Helper para identificar semanas únicas
  const getWeekId = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0,0,0,0);
    // Ajuste para encontrar a quinta-feira da mesma semana (ISO 8601)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${weekNo}`;
  };

  // Memoize settings loading to prevent loops
  const [lastLoadedKey, setLastLoadedKey] = useState('');

  useEffect(() => {
    async function loadSettings() {
      // If we have a target class selected, try to load its specific settings first
      const targetId = settingsForm.target_class_ids.length === 1 ? settingsForm.target_class_ids[0] : null;
      
      if (!targetId) return;

      const key = `target_${targetId}`;
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
            // Only update weekdays if we are loading first time or if it specifically matches
            class_weekdays: data.class_weekdays ?? (data.class_weekday !== undefined ? [data.class_weekday] : prev.class_weekdays)
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
  }, [showSettings, settingsForm.target_class_ids[0], settingsForm.class_weekdays]);

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
          target_class_ids: settingsData.target_class_ids || (settingsData.target_class_id ? [settingsData.target_class_id] : []),
          class_weekdays: settingsData.class_weekdays || (settingsData.class_weekday !== undefined ? [settingsData.class_weekday] : [3])
        });
      }
      
      return {
        events: eventsData || [],
        classes: classesData || [],
        subjects: subjectsData || [],
        settings: settingsData
      };
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      return null;
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
      const currentYear = currentDate.getFullYear();
      const dynamicHolidays = getHolidaysForYear(currentYear);

      for (const h of dynamicHolidays) {
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
            start_date: h.date,
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

      const targetIds = (settings.target_class_ids && settings.target_class_ids.length > 0) 
        ? settings.target_class_ids 
        : [null];

      // --- SURGICAL CLEAR: Only delete events for the classes being updated ---
      for (const tid of targetIds) {
        const filters: any[] = [
          { field: 'description', operator: 'ilike', value: 'Cronograma automático%' }
        ];
        
        if (tid) {
          filters.push({ field: 'class_id', operator: '==', value: tid });
        } else {
          filters.push({ field: 'class_id', operator: 'is', value: null });
        }
        
        await deleteQuery('calendar_events', filters);
      }

      await new Promise(r => setTimeout(r, 800));
      const freshData = await fetchData();
      const currentEvents = freshData?.events || [];

      const ranges = [
        { start: new Date(settings.term1_start + 'T00:00:00'), end: new Date(settings.term1_end + 'T00:00:00') },
        { start: new Date(settings.term2_start + 'T00:00:00'), end: new Date(settings.term2_end + 'T00:00:00') }
      ];

      const newEvents: any[] = [];

      for (const tid of targetIds) {
        const targetClass = tid ? classes.find(c => c.id === tid) : null;
        const classLabel = targetClass ? ` - ${targetClass.name}` : '';
        const eventSignature = `Cronograma automático${classLabel}`;

        // Add Term Start/End
        const termEvents = [
          { date: settings.term1_start, title: `Início do 1º Semestre${classLabel}`, type: 'start_term' },
          { date: settings.term1_end, title: `Término do 1º Semestre${classLabel}`, type: 'end_term' },
          { date: settings.term2_start, title: `Início do 2º Semestre${classLabel}`, type: 'start_term' },
          { date: settings.term2_end, title: `Término do Ano Letivo${classLabel}`, type: 'end_term' }
        ];

        for (const te of termEvents) {
          if (!te.date) continue;
          newEvents.push({
            title: te.title,
            start_date: te.date,
            end_date: te.date,
            type: te.type,
            description: eventSignature,
            class_id: tid,
            user_id: userAuth.uid,
            created_at: new Date().toISOString()
          });
        }

        const holidayDates = new Set(currentEvents.filter(e => e.type.includes('holiday')).map(h => h.start_date));

        for (const range of ranges) {
          if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) continue;
          let currentDateObj = new Date(range.start);
          while (currentDateObj <= range.end) {
            const weekday = currentDateObj.getDay();
            if (settings.class_weekdays?.includes(weekday)) {
              const dateStr = currentDateObj.toISOString().split('T')[0];
              const dayTitle = settings.weekday_titles?.[weekday] || 'Dia de Aula';
              
              if (!holidayDates.has(dateStr)) {
                newEvents.push({
                  title: dayTitle,
                  start_date: dateStr,
                  end_date: dateStr,
                  type: 'class_day',
                  description: eventSignature,
                  class_id: tid,
                  user_id: userAuth.uid,
                  created_at: new Date().toISOString()
                });
              }
            }
            currentDateObj.setDate(currentDateObj.getDate() + 1);
          }
        }
      }

      if (newEvents.length > 0) await saveBatch('calendar_events', newEvents);
      await fetchData();
      setNotification({ type: 'success', message: 'Cronograma gerado com sucesso!' });
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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string, bypassConfirm = false) => {
    const eventToDelete = events.find(e => e.id === id);
    if (!eventToDelete) return;

    if (!bypassConfirm && confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      // Reset after 3 seconds
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }

    try {
      // Realiza a varredura e remove todas as instâncias (passadas e futuras) com o mesmo título e tipo
      await deleteQuery('calendar_events', [
        { field: 'title', operator: 'eq', value: eventToDelete.title },
        { field: 'type', operator: 'eq', value: eventToDelete.type }
      ]);
      
      setNotification({ type: 'success', message: 'Tudo removido: Varedura completa concluída com sucesso!' });
      setConfirmDeleteId(null);
      fetchData();
    } catch (error: any) {
      console.error('Erro ao excluir:', error);
      setNotification({ 
        type: 'err', 
        message: 'Erro ao excluir instâncias: Verifique sua conexão ou permissões.' 
      });
    }
  };

  const isSyncingInPage = isSyncing; // Avoid naming conflict if any

  // Detect today's date in local format, or fallback to user's desired date if specifically requested
  const todayStr = React.useMemo(() => {
    // Basic local date
    const d = new Date();
    return d.toLocaleDateString('en-CA');
  }, []);

  const getTypeStyle = (type: CalendarEvent['type'], startDate?: string) => {
    switch (type) {
      case 'holiday':
      case 'holiday_nac':
        return 'bg-red-50 text-red-700 border-red-100/50 shadow-sm font-semibold';
      case 'holiday_est':
        return 'bg-slate-100 text-slate-700 border-slate-200 shadow-sm font-semibold';
      case 'holiday_mun':
        return 'bg-amber-50 text-amber-700 border-amber-100/50 shadow-sm font-semibold';
      case 'exam': 
        return 'bg-orange-50 text-orange-700 border-orange-100 font-semibold';
      case 'start_term': 
      case 'end_term':
        return 'bg-slate-900 text-white border-slate-950 font-semibold shadow-sm';
      case 'class_day': {
        if (startDate) {
          const weekday = new Date(startDate + 'T00:00:00').getDay();
          if (weekday === 3) return 'bg-blue-50 text-blue-700 border-blue-100/50 shadow-sm font-semibold';
          if (weekday === 4) return 'bg-amber-50 text-amber-700 border-amber-100/50 shadow-sm font-semibold';
          return 'bg-emerald-50 text-emerald-700 border-emerald-100/50 shadow-sm font-semibold';
        }
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      }
      default: return 'bg-slate-50 text-slate-600 border-slate-100 font-medium';
    }
  };

  const getTypeText = (type: CalendarEvent['type'], description?: string) => {
    switch (type) {
      case 'holiday':
      case 'holiday_nac': return 'Feriado Nacional';
      case 'holiday_est': return 'Feriados Geral';
      case 'holiday_mun': return 'Feriado Municipal';
      case 'exam': return 'Avaliação';
      case 'start_term': return 'Início Letivo';
      case 'end_term': return 'Cierre Letivo';
      case 'class_day': return 'Dia de Aula';
      default: return 'Evento';
    }
  };

  const getTypeColor = (type: CalendarEvent['type'], startDate?: string) => {
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
          const weekday = new Date(startDate + 'T00:00:00').getDay();
          if (weekday === 3) return 'bg-blue-600';
          if (weekday === 4) return 'bg-amber-500';
        }
        return 'bg-emerald-600';
      }
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
    let filtered = events.filter(e => {
      const date = new Date(e.start_date + 'T00:00:00');
      const matchesYear = date.getFullYear() === currentDate.getFullYear();
      return matchesYear;
    });

    return filtered.reduce((acc, current) => {
      // Agrupa visualmente eventos do mesmo tipo no mesmo dia
      const isGroupable = current.type === 'class_day' || current.type === 'exam' || current.title.includes('Aula Abonada');
      const existingIndex = acc.findIndex(item => 
        item.start_date === current.start_date && 
        (isGroupable ? item.type === current.type : (item.title === current.title && item.type === current.type))
      );

      if (existingIndex === -1) {
        acc.push({ ...current });
      }
      // Se já existe um evento deste tipo no dia, não concatenamos mais as turmas no título para manter limpo
      // conforme solicitado ("somente do dia da turma x")
      return acc;
    }, [] as CalendarEvent[]);
  }, [events, currentDate.getFullYear(), classes]);

  const filteredEvents = React.useMemo(() => {
    return uniqueYearEvents.filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(search.toLowerCase()) ||
                           event.description.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || 
                         (typeFilter === 'term' ? (event.type === 'start_term' || event.type === 'end_term' || event.type === 'class_day') : 
                          typeFilter === 'holidays_all' ? event.type.includes('holiday') :
                          typeFilter === 'holiday_nac' ? (event.type === 'holiday_nac' || (event.type === 'holiday' && !(event.description || '').toLowerCase().includes('estadual') && !(event.description || '').toLowerCase().includes('municipal'))) :
                          typeFilter === 'holiday_est' ? (event.type === 'holiday_est' || (event.type === 'holiday' && (event.description || '').toLowerCase().includes('estadual'))) :
                          typeFilter === 'holiday_mun' ? (event.type === 'holiday_mun' || (event.type === 'holiday' && (event.description || '').toLowerCase().includes('municipal'))) : 
                          event.type === typeFilter);
      
      const matchesWeekday = weekdayFilter === null || (event.type === 'class_day' && new Date(event.start_date + 'T00:00:00').getDay() === weekdayFilter);
      
      return matchesSearch && matchesType && matchesWeekday;
    }).sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'date') {
        return a.start_date.localeCompare(b.start_date) * multiplier;
      }
      return a.title.localeCompare(b.title) * multiplier;
    });
  }, [uniqueYearEvents, search, typeFilter, weekdayFilter, sortBy, sortOrder]);

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
  const getEventCount = (type: string, weekday?: number) => {
    if (type === 'all') return uniqueYearEvents.length;
    
    if (type === 'class_day') {
      const classEvents = uniqueYearEvents.filter(e => e.type === 'class_day');
      if (weekday !== undefined) {
        const filtered = classEvents.filter(e => new Date(e.start_date + 'T00:00:00').getDay() === weekday);
        return new Set(filtered.map(e => getWeekId(e.start_date))).size;
      }
      return new Set(classEvents.map(e => getWeekId(e.start_date))).size;
    }

    if (type === 'term') {
      return uniqueYearEvents.filter(e => e.type === 'start_term' || e.type === 'end_term' || e.type === 'class_day').length;
    }

    if (type === 'holidays_all') {
      return uniqueYearEvents.filter(e => e.type.includes('holiday')).length;
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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 mb-12">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Gestão Institucional</span>
          </div>
          <h1 className="text-4xl font-semibold text-slate-900 tracking-tight flex items-center gap-3">
            Cronograma <span className="text-blue-600">Acadêmico</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium">Controle centralizado de ciclos letivos, feriados e atividades escolares.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Visualização e Navegação */}
          <div className="flex items-center bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex bg-slate-50 rounded-xl p-1">
              <button 
                onClick={() => setViewMode('month')}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  viewMode === 'month' ? "bg-white text-slate-900 shadow-md border border-slate-100" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Mês
              </button>
              <button 
                onClick={() => setViewMode('year')}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  viewMode === 'year' ? "bg-white text-slate-900 shadow-md border border-slate-100" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Ano
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  viewMode === 'list' ? "bg-white text-slate-900 shadow-md border border-slate-100" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Lista
              </button>
            </div>

            <div className="flex items-center gap-1 ml-2 pr-2">
              <button onClick={viewMode === 'month' ? prevMonth : prevYear} className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-slate-900">
                <ChevronLeft size={18} />
              </button>
              
              <div className="px-2">
                <select 
                  value={currentDate.getFullYear()}
                  onChange={(e) => setCurrentDate(new Date(parseInt(e.target.value), currentDate.getMonth()))}
                  className="bg-transparent text-[11px] font-bold text-slate-700 cursor-pointer focus:outline-none"
                >
                  {Array.from({ length: 31 }, (_, i) => 2024 + i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <button onClick={viewMode === 'month' ? nextMonth : nextYear} className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-slate-900">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {(isAdmin || isDirector) && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowSettings(true)}
                className="p-3 bg-white text-slate-600 rounded-2xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm group"
                title="Configurações Acadêmicas"
              >
                <Settings size={20} className="group-hover:rotate-45 transition-transform" />
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
                className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-95"
              >
                <Plus size={16} />
                Novo Registro
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start relative z-30">
        {(() => {
          const stats = [
            { 
              id: 'holidays_all', 
              label: 'Feriados & Atividades', 
              count: getEventCount('holidays_all'), 
              color: 'bg-red-600', 
              text: 'text-red-700', 
              bg: 'bg-red-50/50', 
              icon: <Flag size={18} /> 
            },
          ];

          // Encontra todos os dias da semana que tem aulas programadas
          const classWeekdays = academicSettings.class_weekdays || [3];
          classWeekdays.forEach(wd => {
            const label = (academicSettings.weekday_titles?.[wd] || 'Dia de Aula').replace(/^Dia de Aula - /, '');
            stats.push({
              id: `class_day_${wd}`,
              label: label,
              count: getEventCount('class_day', wd),
              color: wd === 3 ? 'bg-blue-600' : wd === 4 ? 'bg-amber-500' : 'bg-slate-700',
              text: wd === 3 ? 'text-blue-700' : wd === 4 ? 'text-amber-700' : 'text-slate-700',
              bg: wd === 3 ? 'bg-blue-50/50' : wd === 4 ? 'bg-amber-50/50' : 'bg-slate-50/50',
              icon: <BookOpen size={18} />
            });
          });

          return stats.map((stat) => {
            const cardEvents = events.filter(e => {
              if (stat.id.startsWith('class_day')) {
                const wd = stat.id.includes('_') ? parseInt(stat.id.split('_')[2]) : -1;
                return e.type === 'class_day' && (wd === -1 || new Date(e.start_date + 'T00:00:00').getDay() === wd);
              }
              if (stat.id === 'holidays_all') return e.type.includes('holiday');
              return false;
            }).sort((a,b) => a.start_date.localeCompare(b.start_date));

            return (
              <motion.div 
                key={stat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative"
              >
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between mb-5">
                    <div className={cn("p-3 rounded-xl", stat.bg, stat.text)}>
                      {stat.icon}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-2xl font-semibold text-slate-900">{stat.count}</p>
                    </div>
                  </div>

                  <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {cardEvents.length > 0 ? cardEvents.map(e => (
                      <div key={e.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50/50 hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", stat.color)} />
                          <p className="text-[11px] font-medium text-slate-700 truncate">{e.title}</p>
                        </div>
                        <span className="text-[10px] font-sans font-medium text-slate-400 whitespace-nowrap ml-2">
                          {new Date(e.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    )) : (
                      <p className="text-[10px] text-slate-400 font-medium italic text-center py-4">Nenhum evento registrado</p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          });
        })()}
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-12">
        {notification && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100]">
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "px-8 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-2xl",
                notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              )}
            >
              {notification.type === 'success' ? <Check size={16} /> : <X size={16} />}
              {notification.message}
            </motion.div>
          </div>
        )}

        <div className="lg:col-span-12 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : viewMode === 'month' ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white p-8 rounded-3xl shadow-sm overflow-hidden space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-1 shadow-inner">
                    <button 
                      onClick={prevMonth}
                      className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-400 hover:text-blue-600 active:scale-90"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div className="px-6 min-w-[200px] text-center">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">
                        {currentDate.toLocaleDateString('pt-BR', { month: 'long' })}
                      </span>
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-2 opacity-60">
                        {currentDate.getFullYear()}
                      </span>
                    </div>
                    <button 
                      onClick={nextMonth}
                      className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-400 hover:text-blue-600 active:scale-90"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visualização Mensal</span>
                  </div>
                </div>

                {/* Calendário Mensal Estilizado */}
                <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
                  {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(day => (
                    <div key={day} className="bg-slate-50 py-3 text-center border-b border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{day.substring(0, 3)}</span>
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
                          isToday && "bg-blue-50/20"
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <span className={cn(
                            "w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-all",
                            isToday ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-500 group-hover/cell:text-blue-600"
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
                                getTypeStyle(event.type, event.start_date)
                              )}
                              title={event.title.replace(/^Dia de Aula - /, '')}
                            >
                              {event.title.replace(/^Dia de Aula - /, '')}
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
          ) : viewMode === 'year' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <div className="text-center pb-8 border-b border-slate-50 mb-8">
                  <h3 className="text-2xl font-semibold text-slate-800 tracking-tight">
                    Calendário Anual {currentDate.getFullYear()}
                  </h3>
                </div>

                <div className="space-y-12">
                      {/* Primeiro Semestre */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Fluxo do Primeiro Semestre</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {[0, 1, 2, 3, 4, 5].map(monthIndex => (
                        <div key={monthIndex} className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-xl transition-all duration-300">
                          <h5 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest text-center mb-6 border-b border-slate-200 pb-4">
                            {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                          </h5>
                          <div className="grid grid-cols-7 gap-1.5">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) => (
                              <div key={`sem1-${monthIndex}-${d}-${idx}`} className="text-center text-[9px] font-bold text-slate-300 uppercase py-2">{d}</div>
                            ))}
                            {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => (
                              <div key={`empty-${monthIndex}-${i}`} className="aspect-square" />
                            ))}
                            {Array.from({ length: daysInMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${currentDate.getFullYear()}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                              const dayEvents = filteredEvents.filter(e => e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date));
                              const holiday = dayEvents.find(e => e.type.includes('holiday'));
                              const isToday = todayStr === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex items-center justify-center rounded-lg text-[10px] font-bold transition-all relative border w-full",
                                    holiday 
                                      ? "bg-red-50 text-red-600 border-red-100 cursor-pointer shadow-sm"
                                      : dayEvents.length > 0 
                                        ? "bg-blue-50 text-blue-600 border-blue-100 cursor-pointer shadow-sm"
                                        : isToday ? "bg-blue-600 text-white border-blue-700 shadow-md scale-110 z-10" : "bg-transparent text-slate-400 border-transparent hover:bg-white hover:border-slate-200"
                                  )}
                                >
                                  {day}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Segundo Semestre */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-emerald-600 rounded-full" />
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Fluxo do Segundo Semestre</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                       {[6, 7, 8, 9, 10, 11].map(monthIndex => (
                        <div key={monthIndex} className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-xl transition-all duration-300">
                          <h5 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest text-center mb-6 border-b border-slate-200 pb-4">
                            {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                          </h5>
                          <div className="grid grid-cols-7 gap-1.5">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) => (
                              <div key={`sem2-${monthIndex}-${d}-${idx}`} className="text-center text-[9px] font-bold text-slate-300 uppercase py-2">{d}</div>
                            ))}
                            {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => (
                              <div key={`empty-${monthIndex}-${i}`} className="aspect-square" />
                            ))}
                            {Array.from({ length: daysInMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${currentDate.getFullYear()}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                              const dayEvents = filteredEvents.filter(e => e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date));
                              const holiday = dayEvents.find(e => e.type.includes('holiday'));
                              const isToday = todayStr === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex items-center justify-center rounded-lg text-[10px] font-bold transition-all relative border w-full",
                                    holiday 
                                      ? "bg-red-50 text-red-600 border-red-100 cursor-pointer shadow-sm"
                                      : dayEvents.length > 0 
                                        ? "bg-blue-50 text-blue-600 border-blue-100 cursor-pointer shadow-sm"
                                        : isToday ? "bg-blue-600 text-white border-blue-700 shadow-md scale-110 z-10" : "bg-transparent text-slate-400 border-transparent hover:bg-white hover:border-slate-200"
                                  )}
                                >
                                  {day}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-8 mt-12 border-t border-slate-100">
                  {[
                    { type: 'holiday_nac', label: 'Feriado Nacional', color: 'bg-red-500' },
                    { type: 'holiday_est', label: 'Feriados Geral', color: 'bg-slate-500' },
                    { type: 'holiday_mun', label: 'Feriado Municipal', color: 'bg-amber-500' },
                    { type: 'class_day', label: 'Dia de Aula', color: 'bg-blue-600' },
                    { type: 'exam', label: 'Avaliação', color: 'bg-orange-500' },
                  ].map(item => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", item.color)} />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : viewMode === 'list' && Object.keys(groupedEvents).length > 0 ? (
            <div className="space-y-12 animate-in fade-in duration-500">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/50">
                    <ListFilter size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest leading-none">Ordenação</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Visualização em Lista</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                    <button 
                      onClick={() => setSortBy('date')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                        sortBy === 'date' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Data
                    </button>
                    <button 
                      onClick={() => setSortBy('title')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                        sortBy === 'title' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Título
                    </button>
                  </div>

                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => setSortOrder('asc')}
                      className={cn(
                        "p-2.5 rounded-xl transition-all border",
                        sortOrder === 'asc' ? "bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-100 scale-105" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                      )}
                      title="Ordem Crescente"
                    >
                      <ArrowUpAZ size={16} />
                    </button>
                    <button 
                      onClick={() => setSortOrder('desc')}
                      className={cn(
                        "p-2.5 rounded-xl transition-all border",
                        sortOrder === 'desc' ? "bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-100 scale-105" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                      )}
                      title="Ordem Decrescente"
                    >
                      <ArrowDownZA size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Seção 1: Eventos e Feriados Manuais */}
              {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).some(([_, events]) => events.some(e => e.type !== 'class_day' && !e.description?.includes('Cronograma automático'))) && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4 px-2">
                    <div className="h-px flex-1 bg-slate-200" />
                    <h2 className="text-xs font-bold text-blue-500/80 uppercase tracking-[0.3em] whitespace-nowrap">Eventos de Referência</h2>
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
                                  <h4 className="text-lg font-black text-slate-800 leading-tight">
                                    {event.title.replace(/^Dia de Aula - /, '')}
                                  </h4>
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
                                  {event.description && !event.description.includes('Cronograma automático') && (
                                    <p className="text-xs font-medium text-slate-400 line-clamp-2">{event.description}</p>
                                  )}
                                </div>
                                
                                {(isAdmin || isDirector) && (
                                  <div className="flex flex-col gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
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
                                        handleDelete(event.id, confirmDeleteId === event.id);
                                      }}
                                      className={cn(
                                        "p-2 rounded-xl transition-all",
                                        confirmDeleteId === event.id 
                                          ? "bg-red-600 text-white animate-pulse shadow-lg shadow-red-100" 
                                          : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                                      )}
                                    >
                                      {confirmDeleteId === event.id ? <Check size={16} /> : <Trash2 size={16} />}
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
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] whitespace-nowrap">Cronograma Automático</h2>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  
                  {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => {
                    const autoEvents = monthEvents.filter(e => e.type === 'class_day' || e.description?.includes('Cronograma automático'));
                    if (autoEvents.length === 0) return null;

                    return (
                      <div key={`auto-${month}`} className="space-y-4">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 flex items-center gap-2">
                          <div className="w-1 h-3 bg-blue-500/50 rounded-full" />
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
                                    <h4 className="text-[13px] font-black text-slate-800 leading-tight truncate">
                                      {event.title.replace(/^Dia de Aula - /, '')}
                                    </h4>
                                    <p className="text-[10px] font-bold text-slate-500 mt-1">
                                      {new Date(event.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                                    </p>
                                  </div>
                                </div>
                                
                                {(isAdmin || isDirector) && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(event.id, confirmDeleteId === event.id);
                                    }}
                                    className={cn(
                                      "p-2 rounded-lg transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100",
                                      confirmDeleteId === event.id 
                                        ? "bg-red-600 text-white animate-pulse" 
                                        : "text-slate-300 hover:text-red-500 hover:bg-red-50"
                                    )}
                                  >
                                    {confirmDeleteId === event.id ? <Check size={14} /> : <Trash2 size={14} />}
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
                  {!(isAdmin || isDirector) && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                      <div className="p-1 px-2.5 bg-amber-200 text-amber-800 rounded-lg text-[10px] font-black uppercase">Aviso</div>
                      <p className="text-[11px] font-bold text-amber-800">Você está em modo de visualização. Apenas Administradores podem alterar o calendário acadêmico.</p>
                    </div>
                  )}

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
                          disabled={!(isAdmin || isDirector)}
                          onClick={() => setFormData({...formData, type: type.id as any})}
                          className={cn(
                            "py-4 px-4 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-3 border-2 disabled:opacity-50 disabled:cursor-not-allowed",
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
                            readOnly={!(isAdmin || isDirector)}
                            type="text"
                            placeholder="DD/MM/AAAA"
                            value={formData.start_date}
                            onChange={e => {
                              const date = maskDate(e.target.value);
                              setFormData({...formData, start_date: date, end_date: formData.end_date || date});
                            }}
                            className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all shadow-inner disabled:opacity-70"
                          />
                          <span className="absolute -top-2.5 left-6 px-2 bg-white text-[9px] font-black text-slate-400 uppercase rounded-full border border-slate-100">Início</span>
                        </div>
                      </div>
                      <div className="group">
                        <div className="relative">
                          <input 
                            readOnly={!(isAdmin || isDirector)}
                            type="text"
                            placeholder="DD/MM/AAAA"
                            value={formData.end_date}
                            onChange={e => setFormData({...formData, end_date: maskDate(e.target.value)})}
                            className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all shadow-inner disabled:opacity-70"
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
                        readOnly={!(isAdmin || isDirector)}
                        type="text"
                        placeholder="Ex: Reunião de Planejamento, Feriado..."
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-bold text-slate-700 placeholder:text-slate-300 focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all shadow-inner disabled:opacity-70"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Fixo */}
                <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                  {selectedEvent && (isAdmin || isDirector) && (
                    <button 
                      type="button"
                      onClick={async () => {
                        if (confirmDeleteId === selectedEvent.id) {
                          await handleDelete(selectedEvent.id, true);
                          setIsEditing(false);
                        } else {
                          handleDelete(selectedEvent.id);
                        }
                      }}
                      className={cn(
                        "px-8 py-5 border-2 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98]",
                        confirmDeleteId === selectedEvent.id 
                          ? "bg-red-600 text-white border-red-600 animate-pulse" 
                          : "bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white"
                      )}
                    >
                      {confirmDeleteId === selectedEvent.id ? 'Confirmar Exclusão?' : 'Excluir'}
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-5 bg-white border-2 border-slate-200 text-slate-500 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-[0.98]"
                  >
                    {isAdmin || isDirector ? 'Descartar' : 'Fechar'}
                  </button>
                  {(isAdmin || isDirector) && (
                    <button 
                      type="submit"
                      className="flex-2 py-5 bg-blue-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-2xl shadow-blue-200 transition-all active:scale-[0.98]"
                    >
                      {selectedEvent ? 'Salvar Alterações' : 'Criar Registro'}
                    </button>
                  )}
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
                {/* 1. Dia da Semana */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                    <CalendarIcon size={12} /> Dias da Semana e Atividades
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'].map((day, i) => {
                      const isSelected = settingsForm.class_weekdays.includes(i);
                      return (
                        <div key={day} className={cn(
                          "flex items-center gap-3 p-3 rounded-2xl transition-all border-2",
                          isSelected ? "bg-white border-blue-100 shadow-sm" : "bg-slate-50 border-transparent opacity-60"
                        )}>
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSettingsForm({
                                  ...settingsForm,
                                  class_weekdays: settingsForm.class_weekdays.filter(d => d !== i)
                                });
                              } else {
                                setSettingsForm({
                                  ...settingsForm,
                                  class_weekdays: [...settingsForm.class_weekdays, i],
                                  weekday_titles: {
                                    ...settingsForm.weekday_titles,
                                    [i]: settingsForm.weekday_titles[i] || 'Dia de Aula'
                                  }
                                });
                              }
                            }}
                            className={cn(
                              "w-10 h-10 rounded-xl text-[10px] font-black uppercase transition-all shrink-0",
                              isSelected ? dayActiveColors[i] : "bg-slate-200 text-slate-400"
                            )}
                          >
                            {day.substring(0, 3)}
                          </button>
                          
                          {isSelected ? (
                            <div className="flex-1 relative">
                              <input 
                                type="text"
                                placeholder="Nome da Atividade (ex: Aula de Math)"
                                value={settingsForm.weekday_titles[i] || 'Dia de Aula'}
                                onChange={(e) => setSettingsForm({
                                  ...settingsForm,
                                  weekday_titles: { ...settingsForm.weekday_titles, [i]: e.target.value }
                                })}
                                className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 text-[11px] font-bold text-slate-700 focus:bg-white transition-all shadow-inner"
                              />
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">{day} (Inativo)</span>
                          )}
                        </div>
                      );
                    })}
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

                {/* 4. Ações Adicionais (NOVO) */}
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
                      const updatedSettings: AcademicSettings = {
                        id: 'current',
                        term1_start: t1Start,
                        term1_end: t1End,
                        term2_start: t2Start,
                        term2_end: t2End,
                        class_weekdays: settingsForm.class_weekdays,
                        weekday_titles: settingsForm.weekday_titles,
                        target_class_ids: settingsForm.target_class_ids
                      };
                      
                      await saveData('academic_settings', 'current', updatedSettings);
                      setAcademicSettings(updatedSettings);

                      // Generate days using current settings
                      await generateClassDays(updatedSettings);

                      setShowSettings(false);
                      setNotification({ type: 'success', message: 'Cronograma escolar atualizado e calendários gerados!' });
                    } catch (error) {
                      console.error("Error saving and generating:", error);
                      setNotification({ type: 'err', message: 'Erro no processo de salvamento.' });
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing}
                  className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Salvar Alterações e Atualizar Calendário
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
