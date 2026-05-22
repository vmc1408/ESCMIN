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
  ListFilter,
  CalendarPlus,
  GraduationCap,
  Settings2,
  Calendar,
  Globe,
  Target,
  CheckCircle2,
  ArrowRight,
  Printer,
  FileDown,
  LayoutGrid,
  Divide
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, saveBatch, deleteData, fetchQuery, handleDbError, fetchById, deleteQuery, getInstitutionSettings } from '../lib/database';
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
  const [institution, setInstitution] = useState<any>(null);
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
  const [editingDayIndex, setEditingDayIndex] = useState<number>(1);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    title: string;
    message: string;
    action: () => Promise<void>;
    type: 'danger' | 'info';
  } | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printType, setPrintType] = useState<'class_schedule' | 'annual_poster' | 'monthly_grid' | null>(null);
  const [printFilters, setPrintFilters] = useState({
    class_id: 'all',
    weekday: 'all' as number | 'all',
    month: 'all' as number | 'all'
  });
  
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

  const [activeStep, setActiveStep] = useState(1);

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

  const getPeriodType = (dateStr: string, settings: AcademicSettings) => {
    if (!settings.term1_start || !settings.term1_end || !settings.term2_start || !settings.term2_end) return null;
    
    const date = new Date(dateStr + 'T00:00:00');
    const t1Start = new Date(settings.term1_start + 'T00:00:00');
    const t1End = new Date(settings.term1_end + 'T00:00:00');
    const t2Start = new Date(settings.term2_start + 'T00:00:00');
    const t2End = new Date(settings.term2_end + 'T00:00:00');

    // Férias: Entre término do 1º semestre e início do 2º semestre
    if (date > t1End && date < t2Start) return 'vacation';

    // Recesso: Antes do início das aulas ou após o término do ano letivo
    if (date < t1Start || date > t2End) return 'recess';

    return null;
  };

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

  // Initialize settingsForm when opening settings
  useEffect(() => {
    if (showSettings && academicSettings) {
      setSettingsForm({
        term1_start: formatDateForDisplay(academicSettings.term1_start),
        term1_end: formatDateForDisplay(academicSettings.term1_end),
        term2_start: formatDateForDisplay(academicSettings.term2_start),
        term2_end: formatDateForDisplay(academicSettings.term2_end),
        class_weekdays: academicSettings.class_weekdays || [],
        weekday_titles: academicSettings.weekday_titles || {},
        target_class_ids: academicSettings.target_class_ids || []
      });
      setActiveStep(1); // Reset to first step when opening
    }
  }, [showSettings, academicSettings]);

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

      const sortedClasses = (classesData || []).sort((a: any, b: any) => {
        const extract = (s: string) => {
          const match = s.match(/\d{4}/);
          const yr = match ? parseInt(match[0]) : 0;
          const name = s.replace(/\d{4}/, '').trim().toLowerCase();
          return { yr, name };
        };
        const infoA = extract(a.name || '');
        const infoB = extract(b.name || '');
        if (infoA.name !== infoB.name) return infoA.name.localeCompare(infoB.name);
        return infoB.yr - infoA.yr;
      });

      setEvents(eventsData || []);
      setClasses(sortedClasses);
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
    const fetchInstitution = async () => {
      const inst = await getInstitutionSettings();
      if (inst) setInstitution(inst);
    };
    fetchInstitution();
  }, [fetchData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (viewMode === 'month') {
        if (e.key === 'ArrowLeft') prevMonth();
        if (e.key === 'ArrowRight') nextMonth();
      } else if (viewMode === 'year') {
        if (e.key === 'ArrowLeft') prevYear();
        if (e.key === 'ArrowRight') nextYear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
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
    if (!silent) {
      setIsSyncing(true);
      setSyncProgress(20);
      setSyncMessage('Sincronizando feriados nacionais...');
    }
    try {
      const itemsToUpdate: any[] = [];
      let newCount = 0;
      let updatedCount = 0;
      const currentYear = currentDate.getFullYear();
      const dynamicHolidays = getHolidaysForYear(currentYear);

      const totalH = dynamicHolidays.length;
      for (let i = 0; i < totalH; i++) {
        const h = dynamicHolidays[i];
        if (!silent) {
          setSyncProgress(20 + Math.floor((i / totalH) * 40));
          setSyncMessage(`Verificando: ${h.title}`);
        }
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
        if (!silent) setSyncMessage('Salvando alterações...');
        await saveBatch('calendar_events', itemsToUpdate, 45000); // 45s timeout for batch
        if (!silent) setSyncProgress(90);
        await fetchData(); // Refresh events after sync
      }

      if (!silent) {
        setSyncProgress(100);
        if (itemsToUpdate.length > 0) {
          setNotification({ 
            type: 'success', 
            message: `Sincronização concluída! ${newCount} novos e ${updatedCount} atualizados.` 
          });
        }
      }
    } catch (error) {
      console.error("Error syncing holidays:", error);
      if (!silent) setNotification({ type: 'err', message: 'Erro ao sincronizar feriados.' });
    } finally {
      syncInProgress.current = false;
      if (!silent) {
        setTimeout(() => {
          setIsSyncing(false);
          setSyncProgress(0);
        }, 500);
      }
    }
  };


  const clearClassDays = async () => {
    if (!isAdmin && !isDirector) return;
    
    setConfirmModalConfig({
      title: "Confirmar Limpeza Total",
      message: "ATENÇÃO: Deseja realmente EXCLUIR TODOS os cronogramas de aulas gerados? Feriados e eventos manuais serão preservados. Esta ação não pode ser desfeita.",
      type: 'danger',
      action: async () => {
        setShowConfirmModal(false);
        setIsSyncing(true);
        setSyncProgress(5);
        setSyncMessage('Iniciando limpeza total...');

        try {
          // STEP 1: Attempt broad deletion patterns via server-side deleteQuery
          setSyncProgress(15);
          setSyncMessage('Removendo por padrões (Passo 1/3)...');
          
          const patterns = [
            { field: 'description', operator: 'ilike', value: '%Cronograma automático%' },
            { field: 'title', operator: 'ilike', value: 'Dia de Aula%' },
            { field: 'title', operator: 'ilike', value: 'Início do % Semestre%' },
            { field: 'title', operator: 'ilike', value: 'Término do % Semestre%' },
            { field: 'title', operator: 'ilike', value: 'Término do Ano Letivo%' }
          ];

          for (let i = 0; i < patterns.length; i++) {
            await deleteQuery('calendar_events', [patterns[i]]);
            setSyncProgress(15 + Math.floor((i / patterns.length) * 25));
          }

          // STEP 2: Surgical fetch and local filter for high-reliability cleanup
          setSyncProgress(40);
          setSyncMessage('Verificando remanescentes (Passo 2/3)...');
          
          const freshData = await fetchData();
          const allCurrentEvents = freshData?.events || [];
          
          // Identify leftovers using local string matching (very reliable)
          const leftOver = allCurrentEvents.filter(e => {
            const desc = (e.description || '').toLowerCase();
            const title = (e.title || '').toLowerCase();
            const type = e.type;
            
            const isAutoGenerated = 
              desc.includes('cronograma automático') || 
              title.includes('dia de aula') || 
              title.includes('semestre') ||
              title.includes('letivo') ||
              ['class_day', 'start_term', 'end_term'].includes(type);
              
            // NEVER delete manual holidays, but allow auto-generated ones
            const isManualHoliday = type.includes('holiday') && !desc.includes('cronograma automático');
            
            return isAutoGenerated && !isManualHoliday;
          });

          if (leftOver.length > 0) {
            setSyncProgress(60);
            setSyncMessage(`Limpando ${leftOver.length} registros remanescentes via ID...`);
            
            // Delete in surgical batches by ID
            const batchSize = 25;
            for (let i = 0; i < leftOver.length; i += batchSize) {
              const chunk = leftOver.slice(i, i + batchSize);
              const ids = chunk.map(item => item.id);
              await deleteQuery('calendar_events', [{ field: 'id', operator: 'in', value: ids }]);
              setSyncProgress(60 + Math.floor((i / leftOver.length) * 30));
            }
          }

          setSyncProgress(95);
          setSyncMessage('Limpando cache e atualizando...');
          await fetchData();
          
          setSyncProgress(100);
          setNotification({ type: 'success', message: 'Limpeza concluída! Todo o cronograma automático foi removido.' });
        } catch (error) {
          console.error("Erro na limpeza:", error);
          setNotification({ type: 'err', message: 'Houve um problema na exclusão. Tente uma atualização forçada (F5).' });
        } finally {
          setTimeout(() => {
            setIsSyncing(false);
            setSyncProgress(0);
            setSyncMessage('');
          }, 1000);
        }
      }
    });
    setShowConfirmModal(true);
  };

  const generateClassDays = async (customSettings?: any) => {
    if (!userAuth) return;
    setIsSyncing(true);
    setSyncProgress(5);
    setSyncMessage('Preparando geração do cronograma...');
    
    const settings = customSettings || academicSettings;
    
    try {
      setSyncProgress(15);
      setSyncMessage('Sincronizando base de feriados...');
      // First, ensure holidays are up to date for the current year
      await syncHolidays(true);

      const targetIds = (settings.target_class_ids && settings.target_class_ids.length > 0) 
        ? settings.target_class_ids 
        : [null];

      setSyncProgress(25);
      setSyncMessage('Limpando registros anteriores...');
      // --- SURGICAL CLEAR: Only delete events for the classes being updated ---
      for (let i = 0; i < targetIds.length; i++) {
        const tid = targetIds[i];
        setSyncMessage(`Limpando histórico: ${i+1}/${targetIds.length}`);
        const filters: any[] = [
          { field: 'description', operator: 'ilike', value: '%Cronograma automático%' }
        ];
        
        if (tid) {
          filters.push({ field: 'class_id', operator: '==', value: tid });
        } else {
          filters.push({ field: 'class_id', operator: 'is', value: null });
        }
        
        await deleteQuery('calendar_events', filters);
        setSyncProgress(25 + Math.floor((i / targetIds.length) * 15));
      }

      setSyncProgress(40);
      setSyncMessage('Preparando novos eventos...');
      await new Promise(r => setTimeout(r, 800));
      const freshData = await fetchData();
      const currentEvents = freshData?.events || [];

      const ranges = [
        { start: new Date(settings.term1_start + 'T00:00:00'), end: new Date(settings.term1_end + 'T00:00:00') },
        { start: new Date(settings.term2_start + 'T00:00:00'), end: new Date(settings.term2_end + 'T00:00:00') }
      ];

      const newEvents: any[] = [];

      for (let i = 0; i < targetIds.length; i++) {
        const tid = targetIds[i];
        const targetClass = tid ? classes.find(c => c.id === tid) : null;
        const classLabel = targetClass ? ` - ${targetClass.name}` : '';
        const eventSignature = `Cronograma automático${classLabel}`;
        setSyncMessage(`Calculando aulas: ${targetClass?.name || 'Geral'}`);
        setSyncProgress(45 + Math.floor((i / targetIds.length) * 30));

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

        // --- REMOVIDO GERAÇÃO DE EVENTOS DE FÉRIAS E RECESSO ---
        // A visualização agora é feita via lógica no renderizador
        
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

      setSyncProgress(85);
      setSyncMessage(`Gravando ${newEvents.length} registros...`);
      if (newEvents.length > 0) await saveBatch('calendar_events', newEvents);
      
      setSyncProgress(95);
      setSyncMessage('Finalizando...');
      await fetchData();
      setSyncProgress(100);
      setNotification({ type: 'success', message: 'Cronograma gerado com sucesso!' });
    } catch (error) {
      console.error("Error generating class days:", error);
      setNotification({ type: 'err', message: 'Erro ao gerar cronograma.' });
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
        setSyncMessage('');
      }, 500);
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
      const isGroupable = current.type === 'class_day' || current.title.includes('Aula Abonada');
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

  // Eventos para impressão: Ignoram filtros de UI e desduplicação agressiva
  const printEvents = React.useMemo(() => {
    return events.filter(e => {
      const date = new Date(e.start_date + 'T00:00:00');
      return date.getFullYear() === currentDate.getFullYear();
    }).sort((a, b) => {
      // Sort by date first
      const dateCompare = a.start_date.localeCompare(b.start_date);
      if (dateCompare !== 0) return dateCompare;
      
      // Secondary sort: Priority keywords for events on the same day
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      
      // Keywords that should appear first on that day
      const firstKeywords = ['início', 'inicio', 'abertura', 'aula inaugural', 'boas-vindas'];
      // Keywords that should appear last
      const lastKeywords = ['término', 'termino', 'encerramento', 'final'];

      const aIsFirst = firstKeywords.some(k => aTitle.includes(k)) || a.type === 'start_term';
      const bIsFirst = firstKeywords.some(k => bTitle.includes(k)) || b.type === 'start_term';
      
      if (aIsFirst && !bIsFirst) return -1;
      if (!aIsFirst && bIsFirst) return 1;

      const aIsLast = lastKeywords.some(k => aTitle.includes(k)) || a.type === 'end_term';
      const bIsLast = lastKeywords.some(k => bTitle.includes(k)) || b.type === 'end_term';

      if (aIsLast && !bIsLast) return 1;
      if (!aIsLast && bIsLast) return -1;
      
      return a.title.localeCompare(b.title);
    });
  }, [events, currentDate.getFullYear()]);

  const involvedClasses = React.useMemo(() => {
    if (printFilters.class_id !== 'all') {
      return classes.filter(c => c.id === printFilters.class_id);
    }
    const classIds = new Set<string>();
    printEvents.forEach(e => {
      const matchesWeekday = printFilters.weekday === 'all' || new Date(e.start_date + 'T00:00:00').getDay() === printFilters.weekday;
      const isAcademic = ['class_day', 'start_term', 'end_term', 'exam', 'event'].includes(e.type);
      if (matchesWeekday && isAcademic && e.class_id) {
        classIds.add(e.class_id);
      }
    });
    const filtered = classes.filter(c => classIds.has(c.id));
    return [...filtered].sort((a, b) => {
      const extract = (s: string) => {
        const match = s.match(/\d{4}/);
        const yr = match ? parseInt(match[0]) : 0;
        const name = s.replace(/\d{4}/, '').trim().toLowerCase();
        return { yr, name };
      };
      const infoA = extract(a.name || '');
      const infoB = extract(b.name || '');
      if (infoA.name !== infoB.name) return infoA.name.localeCompare(infoB.name);
      return infoB.yr - infoA.yr;
    });
  }, [printEvents, printFilters, classes]);

  const printGroupedEvents = React.useMemo(() => {
    return printEvents.reduce((acc, event) => {
      const date = new Date(event.start_date + 'T00:00:00');
      
      // Filter by month if specified
      if (printFilters.month !== 'all' && date.getMonth() !== printFilters.month) {
        return acc;
      }

      const monthYear = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(event);
      return acc;
    }, {} as Record<string, CalendarEvent[]>);
  }, [printEvents, printFilters.month]);

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
        return {
          weeks: new Set(filtered.map(e => getWeekId(e.start_date))).size,
          days: filtered.length
        };
      }
      return {
        weeks: new Set(classEvents.map(e => getWeekId(e.start_date))).size,
        days: classEvents.length
      };
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

  // Função para calcular progresso de aulas passadas vs total
  const getClassProgress = (weekday: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const classEvents = uniqueYearEvents.filter(e => 
      e.type === 'class_day' && 
      new Date(e.start_date + 'T00:00:00').getDay() === weekday
    );
    
    const total = classEvents.length;
    const completed = classEvents.filter(e => new Date(e.start_date + 'T00:00:00') < today).length;
    const remaining = total - completed;
    
    return { total, completed, remaining };
  };

  const renderIntegratedToolbar = () => {
    if (!academicSettings) return null;
    
    return (
      <div className="flex flex-col xl:flex-row xl:items-center gap-8">
        {/* Lado Esquerdo: Controles de Navegação e Visão */}
        <div className="flex flex-col gap-3 shrink-0">
          {/* Seletor de Visão - Aumentado */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50 shadow-inner w-fit">
            <button 
              onClick={() => setViewMode('month')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                viewMode === 'month' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Mês
            </button>
            <button 
              onClick={() => setViewMode('year')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                viewMode === 'year' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Ano
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                viewMode === 'list' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Lista
            </button>
          </div>

          {/* Navegação de Data Contextual - Aumentado */}
          <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm w-fit self-start">
            <button 
              onClick={viewMode === 'month' ? prevMonth : prevYear}
              className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-blue-600 active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            
            <div className="px-5 min-w-[120px] text-center border-x border-slate-100">
              <span className="text-xs font-black text-slate-800 uppercase tracking-[0.1em]">
                {viewMode === 'month' 
                  ? currentDate.toLocaleDateString('pt-BR', { month: 'long' }).replace('.', '')
                  : currentDate.getFullYear()
                }
              </span>
              {viewMode === 'month' && (
                <span className="text-[10px] font-bold text-slate-400 ml-2">
                  {currentDate.getFullYear()}
                </span>
              )}
            </div>

            <button 
              onClick={viewMode === 'month' ? nextMonth : nextYear}
              className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-blue-600 active:scale-90"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Lado Direito: Status e Progresso (Antigo AcademicStatus) */}
        <div className="flex-1 flex flex-col md:flex-row items-center gap-8 min-w-0">
          {/* Progresso e Datas - Tamanho Reduzido */}
          <div className="w-full max-w-[240px] space-y-2 overflow-hidden bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
            <div className="flex justify-between items-end px-1 gap-4">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-tight border border-emerald-200 truncate">
                  {new Date() < new Date(academicSettings.term1_start) ? 'Preparação' : 
                   new Date() > new Date(academicSettings.term2_end) ? 'Encerrado' : 'Em curso'}
                </span>
              </div>
            </div>
            <div className="h-2 bg-white rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner">
              {(() => {
                const start = new Date(academicSettings.term1_start).getTime();
                const end = new Date(academicSettings.term2_end).getTime();
                const now = new Date().getTime();
                const total = end - start;
                const elapsed = now - start;
                const progress = Math.min(Math.max((elapsed / total) * 100, 0), 100);
                return (
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-blue-600 rounded-full"
                  />
                );
              })()}
            </div>
            <div className="flex justify-between px-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Início: {formatDateForDisplay(academicSettings.term1_start)}</span>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Fim: {formatDateForDisplay(academicSettings.term2_end)}</span>
            </div>
          </div>

          {/* Contagem Quarta/Quinta Staked - Aumentado e Estilizado */}
          <div className="flex flex-col gap-3 shrink-0 border-l border-slate-100 pl-8 min-w-[220px]">
            <div className="flex items-center justify-end gap-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quarta</span>
              <div className="flex items-baseline gap-1.5 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
                {(() => {
                  const count = getEventCount('class_day', 3);
                  const days = typeof count === 'object' ? count.days : 0;
                  return <span className="text-xl font-black text-blue-600 leading-none">{days}</span>;
                })()}
                <span className="text-[9px] font-bold text-blue-400 uppercase">Aulas</span>
              </div>
              {(() => {
                const progress = getClassProgress(3);
                return (
                  <div className="flex flex-col items-end min-w-[50px]">
                    <span className="text-[10px] font-black text-orange-600 leading-none">-{progress.remaining}</span>
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Restam</span>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-end gap-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quinta</span>
              <div className="flex items-baseline gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                {(() => {
                  const count = getEventCount('class_day', 4);
                  const days = typeof count === 'object' ? count.days : 0;
                  return <span className="text-xl font-black text-indigo-600 leading-none">{days}</span>;
                })()}
                <span className="text-[9px] font-bold text-indigo-400 uppercase">Aulas</span>
              </div>
              {(() => {
                const progress = getClassProgress(4);
                return (
                  <div className="flex flex-col items-end min-w-[50px]">
                    <span className="text-[10px] font-black text-orange-600 leading-none">-{progress.remaining}</span>
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Restam</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {(isAdmin || isDirector) && (
            <div className="flex flex-col gap-1.5 ml-2">
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
                className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 transition-all rounded-xl shadow-lg shadow-blue-100 active:scale-95"
                title="Novo Registro"
              >
                <Plus size={18} />
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white transition-all rounded-xl border border-slate-100 shadow-sm active:scale-95"
                title="Configurações Acadêmicas"
              >
                <Settings size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };


  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 no-print">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Calendar className="text-blue-600" size={20} />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cronograma Acadêmico</h1>
          </div>
          <p className="text-slate-500 text-xs font-medium">Gestão de ciclos letivos e atividades escolares.</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowPrintOptions(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all active:scale-95 border border-slate-200"
          >
            <Printer size={16} />
            Imprimir Relatórios
          </button>
        </div>
      </div>





      {/* Overlay de Sincronização e Progresso */}
      <AnimatePresence>
        {isSyncing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6 relative">
                <RefreshCw size={24} className="text-blue-600 animate-spin" />
                <div className="absolute inset-0 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-2">Processando...</h3>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-6 h-4">
                {syncMessage || 'Sincronizando dados...'}
              </p>

              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <motion.div 
                  className="h-full bg-blue-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${syncProgress}%` }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                />
              </div>
              <div className="flex justify-between w-full">
                <span className="text-[10px] font-bold text-blue-600">{syncProgress}%</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Aguarde</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
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
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-100">
              <div className="pb-8 border-b border-slate-50 mb-8">
                {renderIntegratedToolbar()}
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
                    const periodType = getPeriodType(dateStr, academicSettings);
                    const isVacation = periodType === 'vacation' || periodType === 'recess' || dayEvents.some(e => e.title.toLowerCase().includes('férias') || e.title.toLowerCase().includes('recesso'));
                    const isHoliday = dayEvents.some(e => e.type.includes('holiday'));

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
                          isToday && "bg-blue-50/20",
                          isVacation && "bg-stripes-slate",
                          isHoliday && "bg-stripes-red"
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
                                "px-2 py-0.5 rounded-md text-[8.5px] font-bold whitespace-normal break-words leading-[1.1] cursor-pointer transition-all hover:brightness-95 active:scale-95 border",
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
                    { type: 'exam', label: 'Avaliação', color: 'bg-orange-500' },
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
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                {renderIntegratedToolbar()}
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
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
                              const periodType = getPeriodType(dateStr, academicSettings);
                              const isVacation = periodType === 'vacation' || periodType === 'recess' || dayEvents.some(e => e.title.toLowerCase().includes('férias') || e.title.toLowerCase().includes('recesso'));
                              const isToday = todayStr === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex items-center justify-center rounded-lg text-[10px] font-bold transition-all relative border w-full overflow-hidden",
                                    holiday 
                                      ? "bg-red-50 text-red-600 border-red-100 cursor-pointer shadow-sm bg-stripes-red"
                                      : isVacation
                                        ? "bg-slate-50 text-slate-600 border-slate-100 cursor-pointer shadow-sm bg-stripes-slate"
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
                              const periodType = getPeriodType(dateStr, academicSettings);
                              const isVacation = periodType === 'vacation' || periodType === 'recess' || dayEvents.some(e => e.title.toLowerCase().includes('férias') || e.title.toLowerCase().includes('recesso'));
                              const isToday = todayStr === dateStr;

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex items-center justify-center rounded-lg text-[10px] font-bold transition-all relative border w-full overflow-hidden",
                                    holiday 
                                      ? "bg-red-50 text-red-600 border-red-100 cursor-pointer shadow-sm bg-stripes-red"
                                      : isVacation
                                        ? "bg-slate-50 text-slate-600 border-slate-100 cursor-pointer shadow-sm bg-stripes-slate"
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
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                {renderIntegratedToolbar()}
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/50">
                    <ListFilter size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-none">Ordenação da Lista</h3>
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
                <div className="space-y-6">
                  <div className="flex items-center gap-4 px-2">
                    <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">Eventos de Referência</h2>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  
                  {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => {
                    const manualEvents = monthEvents.filter(e => e.type !== 'class_day' && !e.description?.includes('Cronograma automático'));
                    if (manualEvents.length === 0) return null;

                    return (
                      <div key={`manual-${month}`} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100">
                          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <CalendarIcon size={12} className="text-blue-500" />
                            {month}
                          </h3>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {manualEvents.map(event => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              key={event.id} 
                              className="px-6 py-4 hover:bg-blue-50/30 transition-all group cursor-pointer flex items-center justify-between gap-6"
                              onClick={() => handleEdit(event)}
                            >
                              <div className="flex items-center gap-6 flex-1 min-w-0">
                                {/* Data Compacta */}
                                <div className="flex flex-col items-center justify-center min-w-[50px] py-1 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-white group-hover:border-blue-200 transition-colors">
                                  <span className="text-[14px] font-black text-slate-800 leading-none">
                                    {new Date(event.start_date + 'T00:00:00').getDate()}
                                  </span>
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                    {new Date(event.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                  </span>
                                </div>

                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-3">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border shrink-0",
                                      getTypeStyle(event.type, event.description)
                                    )}>
                                      {getTypeText(event.type, event.description)}
                                    </span>
                                    <h4 className="text-sm font-bold text-slate-800 truncate">
                                      {event.title.replace(/^Dia de Aula - /, '')}
                                    </h4>
                                  </div>
                                  
                                  <div className="flex items-center gap-4">
                                    {event.end_date && event.end_date !== event.start_date && (
                                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                        Até {new Date(event.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                      </span>
                                    )}
                                    {(event.class_id || event.subject_id) && (
                                      <div className="flex items-center gap-3">
                                        {event.class_id && (
                                          <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-tight">
                                            <School size={10} />
                                            {classes.find(c => c.id === event.class_id)?.name}
                                          </span>
                                        )}
                                        {event.subject_id && (
                                          <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-tight">
                                            <BookOpen size={10} />
                                            {subjects.find(s => s.id === event.subject_id)?.name}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {event.description && !event.description.includes('Cronograma automático') && (
                                      <span className="text-[10px] font-medium text-slate-400 truncate opacity-60 italic">— {event.description}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {(isAdmin || isDirector) && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEdit(event);
                                    }}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all border border-transparent hover:border-blue-100 shadow-sm hover:shadow-md"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(event.id, confirmDeleteId === event.id);
                                    }}
                                    className={cn(
                                      "p-2 rounded-lg transition-all border border-transparent",
                                      confirmDeleteId === event.id 
                                        ? "bg-red-600 text-white animate-pulse shadow-lg" 
                                        : "text-slate-400 hover:text-red-600 hover:bg-white hover:border-red-100 hover:shadow-md"
                                    )}
                                  >
                                    {confirmDeleteId === event.id ? <Check size={14} /> : <Trash2 size={14} />}
                                  </button>
                                </div>
                              )}
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
                <div className="space-y-6">
                  <div className="flex items-center gap-4 px-2">
                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200">Cronograma de Aulas</h2>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  
                  {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => {
                    const autoEvents = monthEvents.filter(e => e.type === 'class_day' || e.description?.includes('Cronograma automático'));
                    if (autoEvents.length === 0) return null;

                    return (
                      <div key={`auto-${month}`} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100">
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <BookOpen size={12} />
                            {month}
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-50">
                          {autoEvents.map(event => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              key={event.id} 
                              className="p-4 hover:bg-slate-50 transition-all group cursor-pointer flex items-center gap-4"
                              onClick={() => handleEdit(event)}
                            >
                              <div className="w-10 h-10 flex flex-col items-center justify-center bg-slate-100 border border-slate-200 p-0.5 rounded-xl group-hover:bg-white group-hover:border-blue-200 transition-all">
                                <span className="text-[13px] font-black text-slate-700 leading-none">
                                  {new Date(event.start_date + 'T00:00:00').getDate()}
                                </span>
                                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">
                                  {new Date(event.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-[11px] font-black text-slate-800 truncate uppercase tracking-tight">
                                  {event.title.replace(/^Dia de Aula - /, '')}
                                </h4>
                                <div className="flex items-center gap-2">
                                  <span className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">Aula Presencial</span>
                                  <div className="w-1 h-1 bg-slate-300 rounded-full" />
                                  <span className="text-[8px] font-bold text-slate-400 uppercase truncate">
                                    {classes.find(c => c.id === event.class_id)?.name}
                                  </span>
                                </div>
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
            <div className="bg-white p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center">
                <CalendarIcon size={24} />
              </div>
              <div>
                <p className="text-base font-bold text-slate-600">Nenhum evento encontrado</p>
                <p className="text-xs text-slate-400">Tente ajustar seus filtros ou pesquisar por outro termo.</p>
              </div>
            </div>
          )}
        </div>
      </div>


      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="px-8 py-8 border-b border-slate-100 relative">
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm border",
                    getTypeStyle(formData.type)
                  )}>
                    <CalendarPlus size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                      {selectedEvent ? 'Editar Registro' : 'Novo Registro'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestão de Calendário</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-8">
                {!(isAdmin || isDirector) && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                    <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] font-bold text-amber-800 leading-relaxed text-left">Somente leitura. Apenas administradores podem fazer alterações.</p>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Tipo de Evento */}
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Natureza do Registro</label>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'holiday_nac', label: 'Nacional', icon: <Globe size={14} />, color: 'rose', desc: 'Feriado Federal' },
                          { id: 'holiday_est', label: 'Estadual', icon: <Flag size={14} />, color: 'indigo', desc: 'Data Estadual' },
                          { id: 'holiday_mun', label: 'Municipal', icon: <MapPin size={14} />, color: 'amber', desc: 'Padroeiro/Local' },
                          { id: 'exam', label: 'Avaliação', icon: <GraduationCap size={14} />, color: 'orange', desc: 'Provas/Testes' },
                          { id: 'class_day', label: 'Aula Extra', icon: <BookOpen size={14} />, color: 'blue', desc: 'Dia Letivo' },
                          { id: 'event', label: 'Evento', icon: <CalendarDays size={14} />, color: 'emerald', desc: 'Geral/Festivo' }
                        ].map(type => (
                          <button
                            key={type.id}
                            type="button"
                            disabled={!(isAdmin || isDirector)}
                            onClick={() => setFormData({
                              ...formData, 
                              type: type.id as any,
                              title: type.label
                            })}
                            className={cn(
                              "relative flex flex-col p-3 rounded-2xl border-2 transition-all text-left group",
                              formData.type === type.id 
                                ? `bg-${type.color}-50 border-${type.color}-600 ring-4 ring-${type.color}-50` 
                                : "bg-white border-slate-100 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 hover:border-slate-200"
                            )}
                          >
                            <div className={cn(
                              "w-8 h-8 rounded-xl flex items-center justify-center mb-2 transition-transform group-hover:scale-110",
                              formData.type === type.id ? `bg-${type.color}-600 text-white` : "bg-slate-100 text-slate-400"
                            )}>
                              {type.icon}
                            </div>
                            <p className={cn(
                              "text-[10px] font-black uppercase tracking-tight",
                              formData.type === type.id ? `text-${type.color}-700` : "text-slate-500"
                            )}>{type.label}</p>
                            <p className="text-[8px] font-medium text-slate-400 leading-none mt-0.5">{type.desc}</p>
                            
                            {formData.type === type.id && (
                              <div className={cn(`absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded-full bg-${type.color}-600 shadow-sm shadow-${type.color}-200`)}>
                                <Check size={8} className="text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Datas */}
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Período</label>
                    <div className="grid grid-cols-2 gap-4">
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
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all outline-none"
                        />
                        <span className="absolute -top-2 left-4 px-1.5 bg-white text-[8px] font-bold text-slate-400 uppercase border border-slate-100 rounded">Início</span>
                      </div>
                      <div className="relative">
                        <input 
                          readOnly={!(isAdmin || isDirector)}
                          type="text"
                          placeholder="DD/MM/AAAA"
                          value={formData.end_date}
                          onChange={e => setFormData({...formData, end_date: maskDate(e.target.value)})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all outline-none"
                        />
                        <span className="absolute -top-2 left-4 px-1.5 bg-white text-[8px] font-bold text-slate-400 uppercase border border-slate-100 rounded">Término</span>
                      </div>
                    </div>
                  </div>

                  {/* Título */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Identificação</label>
                    <input 
                      required
                      readOnly={!(isAdmin || isDirector)}
                      type="text"
                      placeholder="Título do evento ou atividade..."
                      value={formData.title}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all outline-none"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 pt-4">
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
                        "px-6 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border",
                        confirmDeleteId === selectedEvent.id 
                          ? "bg-red-600 text-white border-red-700 shadow-lg shadow-red-100" 
                          : "bg-white text-red-500 border-red-100 hover:bg-red-50"
                      )}
                    >
                      {confirmDeleteId === selectedEvent.id ? 'Confirmar?' : <Trash2 size={18} />}
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    Fechar
                  </button>
                  {(isAdmin || isDirector) && (
                    <button 
                      type="submit"
                      className="flex-[2] py-4 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all"
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
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.99, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.99, opacity: 0 }}
              className="bg-white max-w-xl w-full h-[85vh] md:h-[80vh] rounded-lg shadow-2xl overflow-hidden border border-slate-200 flex flex-col"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 relative bg-white">
                <button 
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="absolute top-4 right-5 p-2 hover:bg-slate-50 rounded transition-all text-slate-400"
                >
                  <X size={18} />
                </button>
                
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-slate-50 text-slate-600 rounded flex items-center justify-center border border-slate-100">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">Novo Cronograma</h3>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  {[
                    { s: 1, label: 'Turmas' },
                    { s: 2, label: 'Datas' },
                    { s: 3, label: 'Aula' }
                  ].map((item, idx) => (
                    <React.Fragment key={item.s}>
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                          activeStep === item.s ? "bg-blue-600 text-white shadow-sm" : 
                          activeStep > item.s ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                        )}>
                          {activeStep > item.s ? <Check size={12} /> : item.s}
                        </div>
                        <span className={cn(
                          "text-[9px] font-bold uppercase tracking-wider",
                          activeStep === item.s ? "text-blue-600" : "text-slate-400"
                        )}>
                          {item.label}
                        </span>
                      </div>
                      {idx < 2 && (
                        <div className="flex-1 h-[1px] mx-4 bg-slate-100">
                          <div className={cn("h-full bg-blue-600 transition-all", activeStep > item.s ? "w-full" : "w-0")} />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto px-8 py-8 bg-slate-50/30">
                {activeStep === 1 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-slate-900">Selecione as Turmas</h4>
                      <p className="text-[11px] text-slate-500">O cronograma será gerado para as turmas selecionadas.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                    {classes.map((c) => {
                      const isSelected = settingsForm.target_class_ids.includes(c.id);
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
                            "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                            isSelected 
                              ? "bg-blue-50 border-blue-200 text-blue-700" 
                              : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-all",
                            isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200"
                          )}>
                            {isSelected && <Check size={10} />}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">{c.name}</span>
                            <span className="text-[9px] font-medium text-slate-400 block truncate">{c.code}</span>
                          </div>
                        </button>
                      );
                    })}
                    </div>

                    <div className="flex justify-center">
                      <button 
                        onClick={() => {
                          const allIds = classes.map(c => c.id);
                          const isAllSelected = settingsForm.target_class_ids.length === classes.length;
                          setSettingsForm({
                            ...settingsForm,
                            target_class_ids: isAllSelected ? [] : allIds
                          });
                        }}
                        className="text-[9px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest px-4 py-2"
                      >
                        {settingsForm.target_class_ids.length === classes.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                      </button>
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-slate-900">Períodos Letivos</h4>
                      <p className="text-[11px] text-slate-500">Intervalos para geração das aulas.</p>
                    </div>

                    <div className="space-y-4">
                       {[
                         { term: 1, label: '1º Semestre' },
                         { term: 2, label: '2º Semestre' }
                       ].map((t) => (
                        <div key={t.term} className="bg-white p-5 rounded-xl border border-slate-100 space-y-4">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.label}</span>
                           <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                 <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Início</label>
                                 <input 
                                    type="text" 
                                    placeholder="DD/MM/AAAA"
                                    value={t.term === 1 ? settingsForm.term1_start : settingsForm.term2_start}
                                    onChange={e => setSettingsForm({
                                      ...settingsForm, 
                                      [t.term === 1 ? 'term1_start' : 'term2_start']: maskDate(e.target.value)
                                    })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 px-3 text-[11px] font-bold text-slate-600 focus:bg-white focus:border-blue-300 outline-none"
                                 />
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Término</label>
                                 <input 
                                    type="text" 
                                    placeholder="DD/MM/AAAA"
                                    value={t.term === 1 ? settingsForm.term1_end : settingsForm.term2_end}
                                    onChange={e => setSettingsForm({
                                      ...settingsForm, 
                                      [t.term === 1 ? 'term1_end' : 'term2_end']: maskDate(e.target.value)
                                    })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 px-3 text-[11px] font-bold text-slate-600 focus:bg-white focus:border-blue-300 outline-none"
                                 />
                              </div>
                           </div>
                        </div>
                       ))}
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-slate-900">Configuração de Aula</h4>
                      <p className="text-[11px] text-slate-500">Defina o título padrão para cada dia de aula selecionado.</p>
                    </div>

                    <div className="space-y-8">
                      {/* Seletor Horizontal de Dias */}
                      <div className="flex justify-between items-center bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day, i) => {
                          const isSelected = settingsForm.class_weekdays.includes(i);
                          const isActive = editingDayIndex === i;
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                setEditingDayIndex(i);
                                // Se o dia for clicado e não estiver selecionado no cronograma geral, 
                                // podemos decidir se o ativamos automaticamente ou apenas deixamos o usuário ver as configs.
                                // Vamos manter a seleção explícita para evitar erros.
                              }}
                              className={cn(
                                "flex-1 py-3 rounded-xl flex flex-col items-center gap-1 transition-all relative",
                                isActive ? "bg-slate-900 text-white shadow-lg scale-105 z-10" : 
                                isSelected ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : "bg-transparent text-slate-300 hover:bg-slate-50"
                              )}
                            >
                              <span className="text-[10px] font-black uppercase tracking-tight">{day}</span>
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isSelected ? (isActive ? "bg-blue-400" : "bg-blue-600") : "bg-transparent"
                              )} />
                            </button>
                          );
                        })}
                      </div>

                      {/* Painel de Edição do Dia Ativo */}
                      <motion.div 
                        key={editingDayIndex}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black text-xs">
                              {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][editingDayIndex]}
                            </div>
                            <div>
                              <h5 className="text-[11px] font-black text-slate-900 uppercase">Configuração Diária</h5>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                {settingsForm.class_weekdays.includes(editingDayIndex) ? 'Dia Letivo Ativo' : 'Dia Não Letivo'}
                              </p>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              const current = settingsForm.class_weekdays;
                              let next;
                              if (settingsForm.class_weekdays.includes(editingDayIndex)) {
                                next = current.filter(d => d !== editingDayIndex);
                              } else {
                                next = [...current, editingDayIndex];
                              }
                              setSettingsForm({ ...settingsForm, class_weekdays: next });
                            }}
                            className={cn(
                              "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                              settingsForm.class_weekdays.includes(editingDayIndex)
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100"
                            )}
                          >
                            {settingsForm.class_weekdays.includes(editingDayIndex) ? 'Remover do Ciclo' : 'Incluir no Ciclo'}
                          </button>
                        </div>

                        {settingsForm.class_weekdays.includes(editingDayIndex) && (
                          <div className="space-y-2 pt-2 border-t border-slate-50">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Título do Evento p/ este Dia</label>
                            <input 
                              type="text"
                              autoFocus
                              placeholder="Ex: Dia de Aula, Aula Teórica, etc..."
                              value={settingsForm.weekday_titles[editingDayIndex] || ''}
                              onChange={(e) => setSettingsForm({
                                ...settingsForm,
                                weekday_titles: { ...settingsForm.weekday_titles, [editingDayIndex]: e.target.value }
                              })}
                              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all"
                            />
                            <p className="text-[9px] font-medium text-slate-400 italic px-1">
                              * Este título será usado para todas as ocorrências deste dia no semestre.
                            </p>
                          </div>
                        )}
                        
                        {!settingsForm.class_weekdays.includes(editingDayIndex) && (
                          <div className="py-8 text-center flex flex-col items-center gap-3 opacity-40">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                              <Calendar size={24} />
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 tracking-tight uppercase">Dia livre no cronograma</p>
                          </div>
                        )}
                      </motion.div>
                    </div>
                  </div>
                )}
              </div>

              {/* Botões */}
              <div className="px-6 py-4 bg-white border-t border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  {activeStep > 1 ? (
                    <button 
                      onClick={() => setActiveStep(prev => prev - 1)}
                      className="px-4 py-2 text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase transition-all"
                    >
                      Voltar
                    </button>
                  ) : (
                    <div />
                  )}
                  
                  {activeStep < 3 ? (
                    <button 
                      onClick={() => {
                        if (activeStep === 1 && settingsForm.target_class_ids.length === 0) {
                          setNotification({ type: 'err', message: 'Selecione pelo menos uma turma.' });
                          return;
                        }
                        setActiveStep(prev => prev + 1);
                      }}
                      className="px-6 py-2.5 bg-slate-900 text-white rounded text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-all flex items-center gap-2"
                    >
                      Continuar
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button 
                      onClick={async () => {
                        const t1Start = parseDateToDB(settingsForm.term1_start);
                        const t1End = parseDateToDB(settingsForm.term1_end);
                        const t2Start = parseDateToDB(settingsForm.term2_start);
                        const t2End = parseDateToDB(settingsForm.term2_end);

                        if (!t1Start || !t1End || !t2Start || !t2End) {
                          setNotification({ type: 'err', message: 'Preencha as datas.' });
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
                          await generateClassDays(updatedSettings);

                          setShowSettings(false);
                          setActiveStep(1);
                          setNotification({ type: 'success', message: 'Cronograma gerado!' });
                        } catch (error) {
                          console.error("Error saving:", error);
                          setNotification({ type: 'err', message: 'Erro ao processar.' });
                        } finally {
                          setIsSyncing(false);
                        }
                      }}
                      disabled={isSyncing}
                      className="px-6 py-2.5 bg-slate-900 text-white rounded text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Gerar Cronograma
                    </button>
                  )}
                </div>

                {activeStep === 1 && (isAdmin || isDirector) && (
                  <div className="flex gap-2 mt-3">
                    {(isAdmin || isDirector) && (
                      <button 
                        onClick={clearClassDays}
                        disabled={isSyncing}
                        className="flex-1 py-2 text-red-500 hover:bg-red-50 rounded border border-transparent hover:border-red-100 text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        Excluir Aulas
                      </button>
                    )}
                    <button 
                      onClick={async () => {
                        setIsSyncing(true);
                        setSyncMessage('Sincronizando feriados...');
                        setSyncProgress(30);
                        await syncHolidays();
                        setSyncProgress(80);
                        await fetchData();
                        setSyncProgress(100);
                        setTimeout(() => {
                          setIsSyncing(false);
                          setSyncProgress(0);
                        }, 500);
                      }}
                      disabled={isSyncing}
                      className="flex-1 py-2 text-slate-400 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RefreshCw size={12} />
                      Sincronizar Feriados
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showConfirmModal && confirmModalConfig && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8 text-center space-y-6">
                <div className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner",
                  confirmModalConfig.type === 'danger' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                )}>
                  {confirmModalConfig.type === 'danger' ? <Trash2 size={32} /> : <Info size={32} />}
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{confirmModalConfig.title}</h3>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed">
                    {confirmModalConfig.message}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => setShowConfirmModal(false)}
                    className="py-4 bg-slate-50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => confirmModalConfig.action()}
                    className={cn(
                      "py-4 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95",
                      confirmModalConfig.type === 'danger' ? "bg-red-600 hover:bg-red-700 shadow-red-100" : "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                    )}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Opções de Impressão */}
      <AnimatePresence>
        {showPrintOptions && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl border border-slate-100"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <Printer size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter leading-none">Centro de Impressão</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Selecione o formato de relatório desejado</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowPrintOptions(false);
                    setPrintType(null);
                  }}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-all"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {[
                  { id: 'class_schedule', title: 'Relatório de Aulas', icon: FileDown, desc: 'Lista mensal filtrável por turma e dia.' },
                  { id: 'annual_poster', title: 'Pôster Anual', icon: Target, desc: 'Grade compacta de 12 meses em página única.' },
                  { id: 'monthly_grid', title: 'Grade Mensal', icon: LayoutGrid, desc: 'Visualização clássica do mês selecionado.' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setPrintType(option.id as any)}
                    className={cn(
                      "p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-3 group",
                      printType === option.id 
                        ? "bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-100 scale-105" 
                        : "bg-slate-50 border-slate-100 hover:border-blue-300 text-slate-600"
                    )}
                  >
                    <option.icon size={24} className={printType === option.id ? "text-white" : "text-blue-500"} />
                    <div>
                      <h3 className="text-[11px] font-black uppercase tracking-widest leading-tight">{option.title}</h3>
                      <p className={cn("text-[8.5px] mt-2 font-medium leading-relaxed", printType === option.id ? "text-blue-100" : "text-slate-400")}>
                        {option.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {(printType === 'class_schedule' || printType === 'monthly_grid') && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 mb-8"
                >
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Filter size={14} /> Filtros de Relatório
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Turma Específica</label>
                      <select 
                        value={printFilters.class_id}
                        onChange={(e) => setPrintFilters(prev => ({ ...prev, class_id: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">Todas as Turmas Ativas</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Período de Exibição</label>
                      <select 
                        value={printFilters.month}
                        onChange={(e) => setPrintFilters(prev => ({ ...prev, month: e.target.value === 'all' ? 'all' : parseInt(e.target.value) }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">Todo o Ano Letivo</option>
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i} value={i}>
                            {new Date(2024, i, 1).toLocaleDateString('pt-BR', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Dia da Semana</label>
                      <select 
                        value={printFilters.weekday}
                        onChange={(e) => setPrintFilters(prev => ({ ...prev, weekday: e.target.value === 'all' ? 'all' : parseInt(e.target.value) }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">Todos os Dias de Aula</option>
                        <option value="1">Segunda-feira</option>
                        <option value="2">Terça-feira</option>
                        <option value="3">Quarta-feira</option>
                        <option value="4">Quinta-feira</option>
                        <option value="5">Sexta-feira</option>
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setShowPrintOptions(false);
                    setPrintType(null);
                  }}
                  className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  disabled={!printType}
                  onClick={() => window.print()}
                  className="flex-3 py-4 px-6 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                >
                  Gerar Impressão Agora
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      </div>

      {/* Relatórios para Impressão (Apenas via @media print) */}
      <div className="hidden print:block absolute inset-0 bg-white z-[9999] p-0 m-0 overflow-visible">
        <style>
          {`
            @media print {
              @page {
                size: A4 portrait;
                margin: 1.2cm;
              }
              html, body {
                height: auto !important;
                overflow: visible !important;
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .no-print {
                display: none !important;
              }
              .print-container {
                display: block !important;
                visibility: visible !important;
                position: relative !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                transform-origin: top center;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              /* Garante que backgrounds e textos coloridos apareçam */
              .print-container [class*="bg-"],
              .print-container [class*="text-"],
              .print-container [class*="border-"] {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .print-container * {
                visibility: visible !important;
              }
              .page-break { page-break-after: always; }
              .avoid-break { page-break-inside: avoid; }
              
              /* Repetição de cabeçalho em todas as páginas */
              table { 
                width: 100% !important; 
                border-collapse: collapse !important;
                background: white !important;
              }
              thead { 
                display: table-header-group !important; 
              }
              .printable-header {
                display: flex !important;
                width: 100% !important;
              }
              tbody {
                display: table-row-group !important;
              }

              /* Forçar ajuste em uma página se for grade mensal única */
              .monthly-grid-print {
                max-height: 100%;
              }
            }
          `}
        </style>
        
        <div className="print-container font-sans text-slate-800">
          <table className="w-full">
            <thead>
              <tr>
                <td>
                  {/* Header do Relatório - Mais Compacto e Profissional */}
                  <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-6 printable-header">
                    <div className="flex items-center gap-4">
                      {institution?.logo_url ? (
                        <img src={institution.logo_url} className="h-12 w-auto object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <School className="text-slate-200" size={28} />
                      )}
                      <div className="space-y-0.5">
                        <h1 className="text-xl font-bold uppercase tracking-tight text-slate-900">
                          {institution?.name || 'Sistema de Gestão Escolar'}
                        </h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                          {institution?.city || ''} {institution?.document ? `• CNPJ: ${institution.document}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col justify-center">
                      <h2 className="text-[13px] font-black text-slate-800 uppercase tracking-widest">
                        {printType === 'class_schedule' ? 'Cronograma Acadêmico' : 
                         printType === 'annual_poster' ? 'Calendário Anual' : 'Grade de Eventos'}
                      </h2>
                      <div className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                        Ano Letivo: {currentDate.getFullYear()} • {new Date().toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="page-content">

          {/* Relatório 1: Cronograma de Aulas */}
          {printType === 'class_schedule' && (
            <div className="space-y-8">
              {Object.entries(printGroupedEvents).map(([month, monthEvents]) => {
                const autoEvents = monthEvents.filter(e => {
                  const isAcademic = ['class_day', 'start_term', 'end_term', 'exam', 'event', 'holiday'].includes(e.type);
                  const matchesClass = printFilters.class_id === 'all' || e.class_id === printFilters.class_id;
                  const matchesWeekday = printFilters.weekday === 'all' || new Date(e.start_date + 'T00:00:00').getDay() === printFilters.weekday;
                  return isAcademic && matchesClass && matchesWeekday;
                });

                if (autoEvents.length === 0) return null;
                
                // Calculation of unique lessons (Only class_day and exam)
                const groupedCount = (() => {
                  const uniqueSet = new Set();
                  autoEvents.forEach(e => {
                    if (e.type === 'class_day' || e.type === 'exam') {
                      let baseTitle = e.title;
                      classes.forEach(c => baseTitle = baseTitle.replace(` - ${c.name}`, '').trim());
                      baseTitle = e.title.replace(/^Dia de Aula - /, '');
                      uniqueSet.add(`${e.start_date}|${baseTitle}`);
                    }
                  });
                  return uniqueSet.size;
                })();
                
                const showByDate = printFilters.class_id === 'all';
                
                if (showByDate) {
                  const dateGroups: Record<string, CalendarEvent[]> = {};
                  autoEvents.forEach(e => {
                    if (!dateGroups[e.start_date]) dateGroups[e.start_date] = [];
                    dateGroups[e.start_date].push(e);
                  });

                  return (
                    <div key={`month-${month}`} className="page-break pb-4">
                      <div className="flex items-center justify-between border-b border-slate-300 pb-0.5 mb-3">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">{month}</h3>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">{groupedCount} {groupedCount === 1 ? 'Aula' : 'Aulas'}</span>
                      </div>
                      
                      <div className="divide-y divide-slate-100">
                        {Object.entries(dateGroups).sort().map(([dateStr, events]) => {
                          const dateObj = new Date(dateStr + 'T00:00:00');
                          return (
                            <div key={dateStr} className="avoid-break grid grid-cols-[50px,1fr] gap-4 py-2 items-start">
                              <div className="flex flex-col items-center justify-center border-r border-slate-100 pr-2">
                                <span className="text-base font-bold text-slate-900 leading-none">{dateObj.getDate()}</span>
                                <span className="text-[8px] font-bold text-slate-400 uppercase">{dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                              </div>
                              <div className="space-y-1.5">
                                {(() => {
                                  const infoGroups: Record<string, { event: CalendarEvent, classNames: string[] }> = {};
                                  events.forEach(e => {
                                    let baseTitle = e.title;
                                    classes.forEach(c => baseTitle = baseTitle.replace(` - ${c.name}`, '').trim());
                                    baseTitle = e.title.replace(/^Dia de Aula - /, '');
                                    const groupKey = `${baseTitle}|${e.type}`;
                                    const className = classes.find(c => c.id === e.class_id)?.name || 'Geral';
                                    if (!infoGroups[groupKey]) infoGroups[groupKey] = { event: e, classNames: [] };
                                    if (!infoGroups[groupKey].classNames.includes(className)) infoGroups[groupKey].classNames.push(className);
                                  });

                                  const sortClassNames = (names: string[]) => {
                                    return [...names].sort((a, b) => {
                                      const extract = (s: string) => {
                                        const match = s.match(/\d{4}/);
                                        const yr = match ? parseInt(match[0]) : 0;
                                        const name = s.replace(/\d{4}/, '').trim().toLowerCase();
                                        return { yr, name };
                                      };
                                      const infoA = extract(a);
                                      const infoB = extract(b);
                                      if (infoA.name !== infoB.name) return infoA.name.localeCompare(infoB.name);
                                      return infoB.yr - infoA.yr;
                                    });
                                  };

                                  return Object.values(infoGroups).map(({ event, classNames }) => {
                                    const isImportant = ['start_term', 'end_term', 'exam'].includes(event.type);
                                    const sortedClassNames = sortClassNames(classNames);
                                    const isHoliday = event.type === 'holiday' || event.title.toLowerCase().includes('férias') || event.title.toLowerCase().includes('feriado');
                                    
                                    const cleanTitle = (t: string) => t
                                      .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
                                      .replace(/\[SUBJECTS:\[[\s\S]*?\]\]/g, '')
                                      .replace(/\s*[\]\}]\]\s*$/g, '')
                                      .replace(/^Dia de Aula - /, '')
                                      .trim();
                                    
                                    let displayTitle = cleanTitle(event.title);

                                    return (
                                      <div key={event.id} className={cn("flex items-center justify-between gap-2 p-1 rounded", isHoliday && "bg-slate-50 border border-slate-200")}>
                                        <div className="flex-1 min-w-0">
                                          <p className={cn("text-[10px] font-bold leading-tight", isImportant ? "text-amber-700" : isHoliday ? "text-slate-500 italic" : "text-slate-800")}>
                                            {displayTitle}
                                          </p>
                                          <p className="text-[8px] font-medium text-slate-500 uppercase tracking-tight leading-normal">
                                            {sortedClassNames.join(', ')} {event.description && !event.description.includes('automático') && ` • ${event.description.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').trim()}`}
                                          </p>
                                        </div>
                                        <div className={cn(
                                          "text-[7px] font-bold px-1.5 py-0 rounded border uppercase shrink-0",
                                          event.type === 'class_day' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                          event.type === 'exam' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                          event.type === 'start_term' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                          isHoliday ? "bg-slate-200 text-slate-600 border-slate-300" :
                                          "bg-slate-50 text-slate-500 border-slate-200"
                                        )}>
                                          {event.type === 'class_day' ? 'Aula Regular' : 
                                           event.type === 'exam' ? 'Prova' : 
                                           event.type === 'start_term' ? 'Início' : 
                                           isHoliday ? 'Recesso' : 'Ativ.'}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Calculation for Single Class View
                const specificCount = autoEvents.filter(e => e.type === 'class_day' || e.type === 'exam').length;

                return (
                  <div key={`print-month-${month}`} className="page-break pb-4">
                    <div className="flex items-center justify-between border-b border-slate-300 pb-0.5 mb-4">
                      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">{month}</h2>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{specificCount} {specificCount === 1 ? 'Aula' : 'Aulas'}</span>
                    </div>
                    
                    <div className="divide-y divide-slate-100">
                      {autoEvents.map(event => {
                        const date = new Date(event.start_date + 'T00:00:00');
                        const isImportant = ['start_term', 'end_term', 'exam'].includes(event.type);
                        const isHoliday = event.type === 'holiday' || event.title.toLowerCase().includes('férias') || event.title.toLowerCase().includes('feriado');
                        
                        return (
                          <div key={event.id} className={cn("avoid-break grid grid-cols-[50px,1fr] gap-4 py-2 items-start", isHoliday && "bg-slate-50 px-2 rounded")}>
                            <div className="flex flex-col items-center justify-center border-r border-slate-100 pr-2">
                              <span className="text-base font-bold text-slate-900 leading-none">{date.getDate()}</span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase">{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <p className={cn("text-[10px] font-bold whitespace-normal break-words leading-tight", isImportant ? "text-amber-800" : isHoliday ? "text-slate-600 italic" : "text-slate-700")}>
                                  {event.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').trim()}
                                </p>
                                <p className="text-[8px] font-medium text-slate-400 uppercase">
                                  {event.type === 'class_day' ? 'Aula Regular' : 
                                   event.type === 'exam' ? 'Avaliação' : 
                                   isHoliday ? 'Recesso Escolar' : 'Atividade Especial'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Relatório 2: Pôster Anual */}
          {printType === 'annual_poster' && (
            <div className="flex flex-col h-full max-h-[85vh]">
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 mb-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthIndex => (
                  <div key={`poster-${monthIndex}`} className="avoid-break p-2 border-2 border-slate-100 rounded-lg bg-white shadow-sm">
                    <h4 className="text-[9px] font-black text-center uppercase tracking-[0.15em] mb-1.5 border-b border-slate-50 pb-0.5 text-slate-900">
                      {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                    </h4>
                    <div className="grid grid-cols-7 gap-0.5">
                      {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => (
                        <div key={`header-${monthIndex}-${d}`} className="text-center text-[6px] font-black text-slate-300">{d}</div>
                      ))}
                      {Array.from({ length: firstDayOfMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => (
                        <div key={`empty-${monthIndex}-${i}`} className="aspect-square" />
                      ))}
                      {Array.from({ length: daysInMonth(currentDate.getFullYear(), monthIndex) }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${currentDate.getFullYear()}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                        const dayEvents = printEvents.filter(e => e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date));
                        
                        const title = dayEvents.map(e => e.title.toLowerCase()).join(' ');
                        const isNational = dayEvents.some(e => e.type === 'holiday') && title.includes('nacional');
                        const isState = dayEvents.some(e => e.type === 'holiday') && title.includes('estadual');
                        const isMunicipal = dayEvents.some(e => e.type === 'holiday') && (title.includes('municipal') || title.includes('padroeir'));
                        const isHolidayGeneral = dayEvents.some(e => e.type === 'holiday' || title.includes('recesso') || title.includes('feriado'));
                        
                        const isExam = dayEvents.some(e => e.type === 'exam');
                        const periodType = getPeriodType(dateStr, academicSettings);
                        const isVacation = periodType === 'vacation' || periodType === 'recess' || dayEvents.some(e => e.title.toLowerCase().includes('férias') || e.title.toLowerCase().includes('recesso'));
                        const isStart = dayEvents.some(e => e.type === 'start_term');
                        const isEnd = dayEvents.some(e => e.type === 'end_term');
                        const isClass = dayEvents.some(e => e.type === 'class_day');

                        let bgColor = "bg-transparent";
                        let textColor = "text-slate-400";
                        let borderColor = "border-transparent";
                        let stripeStyle = "";

                        if (isNational) { bgColor = "bg-red-600"; textColor = "text-white"; borderColor = "border-red-700"; stripeStyle = "bg-stripes-red"; }
                        else if (isState) { bgColor = "bg-purple-600"; textColor = "text-white"; borderColor = "border-purple-700"; stripeStyle = "bg-stripes-red"; }
                        else if (isMunicipal) { bgColor = "bg-orange-600"; textColor = "text-white"; borderColor = "border-orange-700"; stripeStyle = "bg-stripes-red"; }
                        else if (isHolidayGeneral) { bgColor = "bg-red-500"; textColor = "text-white"; borderColor = "border-red-600"; stripeStyle = "bg-stripes-red"; }
                        else if (isVacation) { bgColor = "bg-slate-50"; textColor = "text-slate-600"; borderColor = "border-slate-100"; stripeStyle = "bg-stripes-slate"; }
                        else if (isExam) { bgColor = "bg-amber-400"; textColor = "text-white"; borderColor = "border-amber-500"; }
                        else if (isStart) { bgColor = "bg-blue-600"; textColor = "text-white"; borderColor = "border-blue-700"; }
                        else if (isEnd) { bgColor = "bg-slate-900"; textColor = "text-white"; borderColor = "border-slate-950"; }
                        else if (isClass) { bgColor = "bg-blue-400"; textColor = "text-white"; borderColor = "border-blue-500"; }
                        else if (dayEvents.length > 0) { bgColor = "bg-slate-100"; textColor = "text-slate-700"; borderColor = "border-slate-200"; }

                        return (
                          <div 
                            key={`${monthIndex}-${day}`}
                            className={cn(
                              "aspect-square flex items-center justify-center rounded-sm text-[7.5px] font-black border transition-all overflow-hidden",
                              bgColor, textColor, borderColor, stripeStyle
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
              
              {/* Legenda Estilo Screenshot Detalhada - Mais Compacta */}
              <div className="mt-1 border-t-2 border-slate-900 pt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 pb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-600 shadow-sm border border-red-700" />
                  <span className="text-[7.5px] font-black text-slate-800 uppercase tracking-widest">Feriado Nacional</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-purple-600 shadow-sm border border-purple-700" />
                  <span className="text-[7.5px] font-black text-slate-800 uppercase tracking-widest">Feriado Estadual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-orange-600 shadow-sm border border-orange-700" />
                  <span className="text-[7.5px] font-black text-slate-800 uppercase tracking-widest">Feriado Municipal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-400 shadow-sm border border-blue-500" />
                  <span className="text-[7.5px] font-black text-slate-800 uppercase tracking-widest">Dia de Aula</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm border border-amber-500" />
                  <span className="text-[7.5px] font-black text-slate-800 uppercase tracking-widest">Avaliação</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-600 shadow-sm border border-blue-700" />
                  <span className="text-[7.5px] font-black text-slate-800 uppercase tracking-widest">Início</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-slate-900 shadow-sm border border-slate-950" />
                  <span className="text-[7.5px] font-black text-slate-800 uppercase tracking-widest">Final</span>
                </div>
              </div>
            </div>
          )}

          {/* Relatório 3: Grade Mensal */}
          {printType === 'monthly_grid' && (
            <div className="space-y-4 print:space-y-2">
              {(printFilters.month === 'all' 
                ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] 
                : [printFilters.month]
              ).map(monthIndex => {
                const year = currentDate.getFullYear();
                const firstDay = firstDayOfMonth(year, monthIndex);
                const days = daysInMonth(year, monthIndex);
                const monthName = new Date(year, monthIndex).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

                return (
                  <div key={`grid-month-${monthIndex}`} className="page-break space-y-8 print:space-y-6">
                    <h2 className="text-2xl font-black text-center uppercase tracking-[0.3em] mb-6 text-slate-800 print:text-xl">
                      {monthName}
                    </h2>
                    
                    {/* Legenda de Marcações Compacta Superior */}
                    <div className="mb-4 flex flex-wrap justify-center gap-x-8 gap-y-2 pb-2 border-b border-slate-100 no-print-break">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500 border border-red-600" />
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Feriado / Recesso</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-amber-400 border border-amber-500" />
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Avaliação / Prova</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-400 border border-blue-500" />
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Dia de Aula Letivo</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 shadow-sm rounded-lg overflow-hidden">
                      {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(day => (
                        <div key={day} className="bg-slate-50 py-4 text-center text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">{day}</div>
                      ))}
                      {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`grid-empty-${monthIndex}-${i}`} className="bg-white min-h-[120px] print:min-h-[110px]" />
                      ))}
                      {Array.from({ length: days }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                        const rawDayEvents = printEvents.filter(e => {
                          const matchesDate = e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date);
                          const matchesClass = printFilters.class_id === 'all' || e.class_id === printFilters.class_id;
                          return matchesDate && matchesClass;
                        });

                        // Deduplicate events for the grid view
                        const dayEvents = rawDayEvents.reduce((acc, curr) => {
                          const norm = (t: string) => t
                            .replace(/^Dia de Aula - /, '')
                            .replace(/^Aula - /, '')
                            .replace(/^Aula Normal - /, '')
                            .split(' - ')[0] // Remove class suffix
                            .trim();
                          
                          const normalizedTitle = norm(curr.title);

                          if (curr.type === 'exam') {
                            acc.push(curr);
                          } else if (!acc.some(item => norm(item.title) === normalizedTitle && item.type === curr.type)) {
                            acc.push(curr);
                          }
                          return acc;
                        }, [] as CalendarEvent[]);
                        
                        const periodType = getPeriodType(dateStr, academicSettings);
                        const isVacation = periodType === 'vacation' || periodType === 'recess' || dayEvents.some(e => e.title.toLowerCase().includes('férias') || e.title.toLowerCase().includes('recesso'));
                        const isHoliday = dayEvents.some(e => e.type.includes('holiday') || e.title.toLowerCase().includes('feriado') || e.title.toLowerCase().includes('recesso'));
                        
                          return (
                          <div 
                            key={`grid-day-${monthIndex}-${day}`} 
                            className={cn(
                              "bg-white min-h-[125px] print:min-h-[115px] p-2 border-r border-b border-slate-100 overflow-hidden group hover:bg-slate-50/50 transition-colors",
                              isVacation && "bg-stripes-slate",
                              isHoliday && "bg-stripes-red"
                            )}
                          >
                            <span className="text-[14px] font-black text-slate-900">{day}</span>
                            <div className="mt-1 space-y-0.5">
                              {dayEvents.map(e => {
                                const isHoliday = e.type.includes('holiday') || e.title.toLowerCase().includes('férias') || e.title.toLowerCase().includes('feriado') || e.title.toLowerCase().includes('recesso');
                                const isExam = e.type === 'exam';
                                
                                return (
                                  <div 
                                    key={e.id} 
                                    className={cn(
                                      "text-[8px] font-bold p-0.5 rounded border leading-[1.1] whitespace-normal break-words shadow-sm",
                                      isHoliday ? "bg-red-500 text-white border-red-600" : 
                                      isExam ? "bg-orange-500 text-white border-orange-600" :
                                      "bg-blue-400 text-white border-blue-500"
                                    )}
                                  >
                                    {e.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').replace(/^Aula - /, '').replace(/^Aula Normal - /, '').split(' - ')[0].trim()}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
