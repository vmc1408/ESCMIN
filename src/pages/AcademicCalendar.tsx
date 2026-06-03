import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  AlertCircle,
  Map,
  ArrowUpAZ,
  ArrowDownZA,
  ListFilter,
  CalendarPlus,
  GraduationCap,
  Bookmark,
  Settings2,
  Calendar,
  Globe,
  Target,
  CheckCircle2,
  ArrowRight,
  Printer,
  FileDown,
  LayoutGrid,
  Divide,
  Ban
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, saveBatch, deleteData, fetchQuery, handleDbError, fetchById, deleteQuery, getInstitutionSettings } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendarHelpers } from '../hooks/useCalendar';
import { getTypeStyle, getTypeText, getTypeColor } from '../lib/calendar-utils';
import { CalendarEvent, AcademicSettings, Class, Subject, InstitutionSettings } from '../types';
import { HolidayListReport } from '../components/calendar/HolidayListReport';

export function AcademicCalendar() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const { getEaster, getHolidaysForYear, getPeriodType } = useCalendarHelpers();
  
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [institution, setInstitution] = useState<InstitutionSettings | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [weekdayFilter, setWeekdayFilter] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editScope, setEditScope] = useState<'all' | 'specific'>('specific');

  const getWeekdayName = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const dateObj = new Date(year, month, day);
        const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return weekdays[dateObj.getDay()];
      }
    } catch (e) {
      console.error(e);
    }
    return '';
  };

  const getWeekdayIndex = (dateStr: string) => {
    if (!dateStr) return -1;
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day).getDay();
      }
    } catch (e) {
      console.error(e);
    }
    return -1;
  };

  const getFilteredClassesForDate = (dateStr: string, currentClassId?: string) => {
    if (!dateStr) return classes;
    const weekdayIndex = getWeekdayIndex(dateStr);
    if (weekdayIndex === -1) return classes;

    const dayMap: Record<string, number> = {
      'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6,
      'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6,
      'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado-feira': 6,
      'segunda-feira': 1, 'terça-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5,
      'Sabado': 6, 'sabado': 6
    };

    const filtered = classes.filter(c => {
      if (currentClassId && c.id === currentClassId) return true;

      let rawDays: any = c.days_of_week;
      if (typeof rawDays === 'string') {
        try {
          rawDays = JSON.parse(rawDays);
        } catch (e) {
          rawDays = rawDays.split(',').map((s: string) => s.trim());
        }
      }

      let targetWeekdays: number[] = [];
      if (Array.isArray(rawDays) && rawDays.length > 0) {
        targetWeekdays = rawDays
          .map((d: string) => {
            if (dayMap[d] !== undefined) return dayMap[d];
            const normalized = d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
            return dayMap[normalized];
          })
          .filter((d: number | undefined) => d !== undefined);
      } else if (c.name) {
        const lowerName = c.name.toLowerCase();
        if (lowerName.includes('domingo')) targetWeekdays.push(0);
        if (lowerName.includes('segunda') || lowerName.includes('2ª')) targetWeekdays.push(1);
        if (lowerName.includes('terça') || lowerName.includes('terca') || lowerName.includes('3ª')) targetWeekdays.push(2);
        if (lowerName.includes('quarta') || lowerName.includes('4ª')) targetWeekdays.push(3);
        if (lowerName.includes('quinta') || lowerName.includes('5ª')) targetWeekdays.push(4);
        if (lowerName.includes('sexta') || lowerName.includes('6ª')) targetWeekdays.push(5);
        if (lowerName.includes('sábado') || lowerName.includes('sabado')) targetWeekdays.push(6);
      }

      if (targetWeekdays.length === 0) return true; // Keep as fallback
      return targetWeekdays.includes(weekdayIndex);
    });

    return filtered;
  };

  const getLiturgicalColorObj = (dateStr: string) => {
    if (!dateStr) return { color: '#10b981', label: 'Tempo Comum' };
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return { color: '#10b981', label: 'Tempo Comum' };
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const day = parseInt(parts[2], 10);
      
      const targetDate = new Date(year, month, day);
      targetDate.setHours(0, 0, 0, 0);
      const targetTime = targetDate.getTime();

      // Algoritmo Computus para cálculo do Domingo de Páscoa (Meeus/Jones/Butcher)
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
      const monthE = Math.floor((h + l - 7 * m + 114) / 31);
      const dayE = ((h + l - 7 * m + 114) % 31) + 1;
      
      const easterDate = new Date(year, monthE - 1, dayE);
      easterDate.setHours(0, 0, 0, 0);
      const easterTime = easterDate.getTime();

      const ONE_DAY = 24 * 60 * 60 * 1000;

      // Datas móveis liturgicamente referenciadas
      const ashWednesdayTime = easterTime - 46 * ONE_DAY;
      const holyThursdayTime = easterTime - 3 * ONE_DAY;
      const goodFridayTime = easterTime - 2 * ONE_DAY;
      const HolySaturdayTime = easterTime - 1 * ONE_DAY;
      const pentecostTime = easterTime + 49 * ONE_DAY;
      const corpusChristiTime = easterTime + 60 * ONE_DAY;

      // Advento e Natal do ano corrente
      const christmas = new Date(year, 11, 25);
      christmas.setHours(0, 0, 0, 0);
      const christmasTime = christmas.getTime();

      const christmasDay = christmas.getDay();
      const daysToSubtract = (christmasDay === 0 ? 7 : christmasDay) + 21;
      const adventStartDate = new Date(year, 11, 25 - daysToSubtract);
      adventStartDate.setHours(0, 0, 0, 0);
      const adventStartTime = adventStartDate.getTime();

      // Fim do tempo do Natal (geralmente Epifania / Batismo do Senhor, simplificado para 13 de Janeiro)
      const endOfChristmasDate = new Date(year, 0, 13);
      endOfChristmasDate.setHours(0, 0, 0, 0);
      const endOfChristmasTime = endOfChristmasDate.getTime();

      // Fim do tempo de Natal do ano anterior, caso estejamos em Janeiro
      const endOfPrevChristmasTime = new Date(year, 0, 13).getTime();

      // 1. Quaresma (Quarta-feira de Cinzas até Quarta-feira Santa, roxo/violeta)
      if (targetTime >= ashWednesdayTime && targetTime < holyThursdayTime) {
        return { color: '#8b5cf6', label: 'Quaresma (Roxo)' };
      }

      // 2. Sexta-feira Santa (Vermelho)
      if (targetTime === goodFridayTime) {
        return { color: '#ef4444', label: 'Sexta-feira Santa (Vermelho)' };
      }

      // 3. Tríduo Pascal (Quinta-feira Santa e Sábado de Aleluia, Branco)
      if (targetTime === holyThursdayTime || targetTime === HolySaturdayTime) {
        return { color: '#f59e0b', label: 'Tríduo Pascal (Branco)' };
      }

      // 4. Tempo Pascal (Páscoa até o Sábado antes de Pentecostes, Branco)
      if (targetTime >= easterTime && targetTime < pentecostTime) {
        return { color: '#f59e0b', label: 'Tempo Pascal (Branco)' };
      }

      // 5. Pentecostes (Vermelho)
      if (targetTime === pentecostTime) {
        return { color: '#ef4444', label: 'Pentecostes (Vermelho)' };
      }

      // 6. Corpus Christi (Branco)
      if (targetTime === corpusChristiTime) {
        return { color: '#f59e0b', label: 'Corpus Christi (Branco)' };
      }

      // 7. Advento (Início do Advento até 24 de Dezembro, Roxo)
      if (targetTime >= adventStartTime && targetTime < christmasTime) {
        return { color: '#8b5cf6', label: 'Advento (Roxo)' };
      }

      // 8. Natal (25 de Dezembro até o Batismo do Senhor em Janeiro do ano seguinte, Branco)
      if (targetTime >= christmasTime || (targetTime <= endOfPrevChristmasTime)) {
        return { color: '#f59e0b', label: 'Tempo do Natal (Branco)' };
      }

      // 9. Tempo Comum (Verde)
      return { color: '#10b981', label: 'Tempo Comum (Verde)' };
    } catch (e) {
      console.error(e);
    }
    return { color: '#10b981', label: 'Tempo Comum' };
  };

  const renderCalendarLegend = () => (
    <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-4 bg-slate-400 rounded-full" />
        <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Legenda do Calendário e Referências</h5>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: Status de Aula */}
        <div className="space-y-3 bg-slate-50/40 p-4 border border-slate-100 rounded-none">
          <h6 className="text-[9px] font-extrabold text-slate-700 uppercase tracking-widest pb-1 border-b border-slate-150">
            Estrutura & Status de Aula
          </h6>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 flex items-center justify-center bg-sky-50 border border-sky-100 text-sky-800 font-bold text-[9px] shadow-sm shrink-0">
                Q
              </div>
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Turmas de Quarta-feira</span>
                <span className="text-slate-400 text-[9px] font-medium">Fundo azul claro</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 flex items-center justify-center bg-amber-50 border border-amber-100 text-amber-800 font-bold text-[9px] shadow-sm shrink-0">
                Q
              </div>
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Turmas de Quinta-feira</span>
                <span className="text-slate-400 text-[9px] font-medium">Fundo laranja/âmbar claro</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 text-slate-700 font-bold text-[9px] relative shadow-sm overflow-hidden shrink-0">
                X
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 select-none">
                  <svg className="w-full h-full stroke-rose-500/55" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line x1="15" y1="15" x2="85" y2="85" strokeWidth="6" strokeLinecap="round" />
                    <line x1="85" y1="15" x2="15" y2="85" strokeWidth="6" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Aula Cancelada / Suspensa</span>
                <span className="text-slate-400 text-[9px] font-medium">Marcada com "X" (mantém os dados)</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 flex items-center justify-center bg-slate-50 border border-slate-100 text-slate-600 font-bold text-[10px] shadow-sm shrink-0">
                A
              </div>
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Aula Abonada / Dispensa / Recesso</span>
                <span className="text-slate-400 text-[9px] font-medium">Fundo cinza e texto cinza dão destaque neutro</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 bg-red-50 text-red-600 border border-red-100 bg-stripes-red flex items-center justify-center text-[10px] font-extrabold shadow-sm shrink-0">
                F
              </div>
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Feriados Principais / Nacionais</span>
                <span className="text-slate-400 text-[9px] font-medium">Listrado vermelho com destaque claro</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center text-[10px] font-extrabold shadow-sm shrink-0">
                P
              </div>
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Período de Avaliação / Exames</span>
                <span className="text-slate-400 text-[9px] font-medium">Identificado por alertas laranja-pêssego</span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna 2: Anos Litúrgicos Católicos */}
        <div className="space-y-3 bg-slate-50/40 p-4 border border-slate-100 rounded-none">
          <h6 className="text-[9px] font-extrabold text-slate-700 uppercase tracking-widest pb-1 border-b border-slate-150">
            Contornos do Ano Litúrgico (Passar Mouse ou Visualizar Dia)
          </h6>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-none border-[2px] border-[#10b981] bg-white shrink-0 shadow-sm" />
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Tempo Comum (Verde)</span>
                <span className="text-slate-400 text-[9px] font-medium">Esperança, maturidade e caminhada da Igreja</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-none border-[2px] border-[#8b5cf6] bg-white shrink-0 shadow-sm" />
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Quaresma / Advento (Roxo)</span>
                <span className="text-slate-400 text-[9px] font-medium">Preparação espiritual, conversão e expectativa</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-none border-[2px] border-[#f59e0b] bg-white shrink-0 shadow-sm" />
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Natal / Páscoa / Corpus Christi (Branco)</span>
                <span className="text-slate-400 text-[9px] font-medium">Glória divina, comemoração e Ressurreição</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-none border-[2px] border-[#ef4444] bg-white shrink-0 shadow-sm" />
              <div className="text-[10px]">
                <span className="font-bold text-slate-700 block">Sexta-feira da Paixão / Pentecostes (Vermelho)</span>
                <span className="text-slate-400 text-[9px] font-medium">Martírio, fogo do Espírito Santo e amor extremo</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'year' | 'list' | 'month' | 'management'>('month');
  const [activeTab, setActiveTab] = useState<'calendar' | 'record'>('calendar');
  const [inspectingClassId, setInspectingClassId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editingDayIndex, setEditingDayIndex] = useState<number>(1);
  const [selectedWeekdayDetail, setSelectedWeekdayDetail] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    id?: string;
    title: string;
    message: string;
    action: () => Promise<void>;
    type: 'danger' | 'info';
  } | null>(null);
  const [selectedDaysToDelete, setSelectedDaysToDelete] = useState<number[]>([1, 2, 3, 4, 5]);
  const [isClassDeletionMode, setIsClassDeletionMode] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printType, setPrintType] = useState<'class_schedule' | 'holiday_list' | 'annual_poster' | 'monthly_grid' | null>(null);
  const [printFilters, setPrintFilters] = useState({
    class_id: 'all',
    weekday: 'all' as number | 'all',
    month: 'all' as number | 'all'
  });
  
  const [academicSettings, setAcademicSettings] = useState<AcademicSettings>({
    term1_start: '',
    term1_end: '',
    term2_start: '',
    term2_end: '',
    class_weekdays: [3], 
    weekday_titles: { 3: 'Aula, Classe(s) Turma(s) de Quarta-feira' },
    target_class_ids: []
  });

  const dayColors = [
    'text-slate-600',   // Dom
    'text-slate-800',     // Seg
    'text-slate-800',  // Ter
    'text-emerald-600', // Qua
    'text-yellow-500',  // Qui
    'text-rose-600',     // Sex
    'text-violet-600'  // Sáb
  ];

  const dayBgColors = [
    'bg-slate-50',
    'bg-slate-50',
    'bg-slate-50',
    'bg-emerald-50',
    'bg-yellow-50',
    'bg-rose-50',
    'bg-violet-50'
  ];

  const dayActiveColors = [
    'bg-slate-600 text-white border-slate-600 shadow-slate-100',
    'bg-slate-800 text-white border-blue-600 shadow-none',
    'bg-slate-800 text-white border-indigo-600 shadow-none',
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

  const [settingsForm, setSettingsForm] = useState<AcademicSettings>({
    term1_start: '',
    term1_end: '',
    term2_start: '',
    term2_end: '',
    class_weekdays: [3],
    weekday_titles: { 3: 'Aula, Classe(s) Turma(s) de Quarta-feira' },
    target_class_ids: []
  });

  const [activeStep, setActiveStep] = useState(1);

  // Memoize settings loading to prevent loops
  const [lastLoadedKey, setLastLoadedKey] = useState('');

  const getWeekdayDataForDoc = (i: number, parsedDoc: AcademicSettings, currentEventsList?: CalendarEvent[]) => {
    const activeEvents = currentEventsList || events || [];
    const isRegisteredInWeekdays = (parsedDoc.class_weekdays || []).includes(i) || 
      (parsedDoc.class_weekdays || []).includes(String(i) as any);
      
    const classesFromSettings = (parsedDoc.weekday_classes || {})[i] || 
      (parsedDoc.weekday_classes || {})[String(i)] || [];
      
    const classesFromEvents = activeEvents
      .filter(e => {
        if (!e.start_date) return false;
        const d = new Date(e.start_date + 'T00:00:00');
        const isAuto = e.type === 'class_day' || (e.description && e.description.includes('Cronograma automático'));
        return isAuto && d.getDay() === i && e.class_id;
      })
      .map(e => e.class_id!);

    const dayMap: Record<string, number> = {
      'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6,
      'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6,
      'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado-feira': 6,
      'segunda-feira': 1, 'terça-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5,
      'Sabado': 6, 'sabado': 6
    };

    const classesFromClassMetadata = (classes || [])
      .filter(c => {
        let rawDays: any = c.days_of_week;
        if (typeof rawDays === 'string') {
          try {
            rawDays = JSON.parse(rawDays);
          } catch (e) {
            rawDays = rawDays.split(',').map((s: string) => s.trim());
          }
        }

        let targetWeekdays: number[] = [];
        if (Array.isArray(rawDays) && rawDays.length > 0) {
          targetWeekdays = rawDays
            .map((d: string) => {
              if (dayMap[d] !== undefined) return dayMap[d];
              const normalized = d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
              return dayMap[normalized];
            })
            .filter((d: number | undefined) => d !== undefined);
        } else if (c.name) {
          const lowerName = c.name.toLowerCase();
          if (lowerName.includes('domingo')) targetWeekdays.push(0);
          if (lowerName.includes('segunda') || lowerName.includes('2ª')) targetWeekdays.push(1);
          if (lowerName.includes('terça') || lowerName.includes('terca') || lowerName.includes('3ª')) targetWeekdays.push(2);
          if (lowerName.includes('quarta') || lowerName.includes('4ª')) targetWeekdays.push(3);
          if (lowerName.includes('quinta') || lowerName.includes('5ª')) targetWeekdays.push(4);
          if (lowerName.includes('sexta') || lowerName.includes('6ª')) targetWeekdays.push(5);
          if (lowerName.includes('sábado') || lowerName.includes('sabado') || lowerName.includes('sáb') || lowerName.includes('sab')) targetWeekdays.push(6);
        }
        return targetWeekdays.includes(i);
      })
      .map(c => c.id);
      
    let uniqueClassIds = [];
    if (isRegisteredInWeekdays) {
      uniqueClassIds = classesFromSettings;
    } else {
      uniqueClassIds = [...new Set([...classesFromEvents, ...classesFromClassMetadata])];
    }
    
    // Fallback to top-level target_class_ids if day matches
    if (uniqueClassIds.length === 0 && isRegisteredInWeekdays && parsedDoc.target_class_ids && parsedDoc.target_class_ids.length > 0) {
      uniqueClassIds = parsedDoc.target_class_ids;
    }
    
    const hasAnySavedInfo = isRegisteredInWeekdays;
    
    let title = '';
    if (hasAnySavedInfo) {
      title = (parsedDoc.weekday_titles || {})[i] || (parsedDoc.weekday_titles || {})[String(i)] || '';
    }

    if (title && title.includes('undefined')) {
      const weekdayName = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][Number(i)];
      title = title.replace('undefined', weekdayName || '');
    }
    
    if (!title) {
      const titleFromEvent = activeEvents.find(e => {
        if (!e.start_date) return false;
        const d = new Date(e.start_date + 'T00:00:00');
        const isAuto = e.type === 'class_day' || (e.description && e.description.includes('Cronograma automático'));
        return isAuto && d.getDay() === i && e.title;
      })?.title;
      
      if (titleFromEvent) {
        title = titleFromEvent.split(' - ')[0];
      } else {
        const weekdayName = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][Number(i)];
        title = `Aula, Classe(s) Turma(s) de ${weekdayName}`;
      }
    }
    
    return {
      hasAnySavedInfo,
      classIds: uniqueClassIds,
      title
    };
  };

  const getWeekdayData = (i: number) => {
    return getWeekdayDataForDoc(i, academicSettings);
  };

  const loadSettings = async (targetId: string = 'current') => {
    try {
      const data = await fetchById('academic_settings', targetId);
      const freshEvents = await fetchAll('calendar_events', '*', 'start_date');
      if (freshEvents) {
        setEvents(freshEvents);
      }
      
      if (data) {
        const parsed = {
          ...data,
          term1_start: data.term1_start,
          term1_end: data.term1_end,
          term2_start: data.term2_start,
          term2_end: data.term2_end,
          class_weekdays: Array.isArray(data.class_weekdays) ? data.class_weekdays.map(Number) : [Number(data.class_weekdays || 3)],
          weekday_titles: data.weekday_titles || {},
          target_class_ids: Array.isArray(data.target_class_ids) ? data.target_class_ids : [],
          weekday_classes: data.weekday_classes || {}
        };
        
        if (targetId === 'current') {
          // Auto-select first registered day or fallback to Wednesday (3)
          const activeDay = parsed.class_weekdays.length > 0 ? parsed.class_weekdays[0] : 3;
          const weekdayData = getWeekdayDataForDoc(activeDay, parsed, freshEvents || events);

          // Resolve period dates defaults if missing
          let term1_start = parsed.term1_start || '';
          let term1_end = parsed.term1_end || '';
          let term2_start = parsed.term2_start || '';
          let term2_end = parsed.term2_end || '';

          const resolvedParsed = {
            ...parsed,
            term1_start,
            term1_end,
            term2_start,
            term2_end,
          };

          setAcademicSettings(resolvedParsed);

          setSettingsForm({
            ...resolvedParsed,
            class_weekdays: [activeDay],
            weekday_titles: {
              ...(resolvedParsed.weekday_titles || {}),
              [activeDay]: weekdayData.title
            },
            target_class_ids: weekdayData.classIds
          });
          setEditingDayIndex(activeDay);
          setSelectedWeekdayDetail(activeDay);
        } else {
          setSettingsForm(parsed);
        }
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  useEffect(() => {
    if (showSettings) {
      loadSettings('current');
    }
  }, [showSettings]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    type: 'class_day' as CalendarEvent['type'],
    class_id: '',
    subject_id: ''
  });

  const isFormChanged = useMemo(() => {
    if (!selectedEvent) {
      return formData.title.trim() !== '' && formData.start_date !== '';
    }

    const cleanEventTitle = selectedEvent.title
      .replace(/^Dia de Aula - /, '')
      .replace(/\s*\(\d+\s*turmas\)$/i, '')
      .split(' - ')[0]
      .trim();
      
    const originalDescription = selectedEvent.description || '';
    const originalStartDate = selectedEvent.start_date || '';
    const originalEndDate = selectedEvent.end_date || selectedEvent.start_date || '';
    const originalType = selectedEvent.type || 'class_day';
    const originalClassId = selectedEvent.class_id || '';
    const originalSubjectId = selectedEvent.subject_id || '';

    const currentDescription = formData.description || '';
    const currentEndDate = formData.end_date || formData.start_date || '';
    const currentClassId = formData.class_id || '';
    const currentSubjectId = formData.subject_id || '';

    const originalScope = (selectedEvent.class_id || selectedEvent.type === 'excused_class') ? 'specific' : 'all';

    return (
      formData.title.trim() !== cleanEventTitle ||
      currentDescription !== originalDescription ||
      formData.start_date !== originalStartDate ||
      currentEndDate !== originalEndDate ||
      formData.type !== originalType ||
      currentClassId !== originalClassId ||
      currentSubjectId !== originalSubjectId ||
      editScope !== originalScope
    );
  }, [formData, selectedEvent, editScope]);

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
          const match = s.match(/\d+/);
          const yrStr = match ? match[0] : '0';
          let yr = parseInt(yrStr);
          if (yrStr.length === 2) yr += 2000;
          const name = s.replace(/\d+/, '').trim().toLowerCase();
          return { yr, name };
        };
        const infoA = extract(a.name || '');
        const infoB = extract(b.name || '');
        // Sort primarily by Year Descending
        if (infoA.yr !== infoB.yr) return infoB.yr - infoA.yr;
        // Then by Name
        return infoA.name.localeCompare(infoB.name);
      });

      setEvents(eventsData || []);
      setClasses(sortedClasses);
      setSubjects(subjectsData || []);
      
      if (settingsData) {
        setAcademicSettings({
          ...settingsData,
          term1_start: settingsData.term1_start || '',
          term1_end: settingsData.term1_end || '',
          term2_start: settingsData.term2_start || '',
          term2_end: settingsData.term2_end || '',
          target_class_ids: settingsData.target_class_ids || (settingsData.target_class_id ? [settingsData.target_class_id] : []),
          weekday_titles: settingsData.weekday_titles || { 3: 'Dia de Aula' },
          weekday_classes: settingsData.weekday_classes || {},
          class_weekdays: (Array.isArray(settingsData.class_weekdays) 
            ? settingsData.class_weekdays 
            : (settingsData.class_weekday !== undefined ? [settingsData.class_weekday] : (settingsData.class_weekdays ? [settingsData.class_weekdays] : [3]))
          ).map((d: any) => Number(d))
        });
      }
      
      return {
        events: eventsData || [],
        classes: sortedClasses,
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


  const clearClassDays = async (days?: number[]) => {
    if (!isAdmin && !isDirector) return;
    
    if (!days) {
      setIsClassDeletionMode(true);
      setConfirmModalConfig({
        id: 'clear_classes',
        title: "Excluir Cronograma",
        message: "Selecione os dias da semana que deseja remover do calendário. Aulas canceladas e abonadas nestes dias também serão excluídas.",
        type: 'danger',
        action: async () => { } // Surtout géré dans le JSX du modal
      });
      setShowConfirmModal(true);
      return;
    }

    setShowConfirmModal(false);
    setIsClassDeletionMode(false);
    setIsSyncing(true);
    setSyncProgress(5);
    setSyncMessage('Iniciando limpeza seletiva...');

    try {
      setSyncProgress(15);
      setSyncMessage('Analisando registros (Passo 1/2)...');
      
      const freshData = await fetchData();
      const allCurrentEvents = freshData?.events || [];
      
      const toDelete = allCurrentEvents.filter(e => {
        const desc = (e.description || '').toLowerCase();
        const title = (e.title || '').toLowerCase();
        const type = e.type;
        
        const isTargetType = ['class_day', 'cancelled_class', 'excused_class', 'start_term', 'end_term'].includes(type) || 
                            title.includes('dia de aula') || 
                            desc.includes('cronograma automático');

        if (!isTargetType) return false;

        const isManualHoliday = type.includes('holiday') && !desc.includes('cronograma automático');
        if (isManualHoliday) return false;

        const eventDate = new Date(e.start_date + 'T12:00:00');
        const weekday = eventDate.getDay();
        
        return days.includes(weekday);
      });

      if (toDelete.length > 0) {
        setSyncProgress(40);
        setSyncMessage(`Excluindo ${toDelete.length} registros...`);
        
        const batchSize = 100;
        for (let i = 0; i < toDelete.length; i += batchSize) {
          const chunk = toDelete.slice(i, i + batchSize);
          const ids = chunk.map(item => item.id);
          await deleteQuery('calendar_events', [{ field: 'id', operator: 'in', value: ids }]);
          setSyncProgress(40 + Math.floor((i / toDelete.length) * 50));
        }
      }

      setSyncProgress(95);
      setSyncMessage('Atualizando calendário...');
      await fetchData();
      
      setSyncProgress(100);
      setNotification({ type: 'success', message: 'Cronograma removido com sucesso para os dias selecionados.' });
    } catch (error) {
      console.error("Erro na limpeza:", error);
      setNotification({ type: 'err', message: 'Houve um problema na exclusão. Tente novamente.' });
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
        setSyncMessage('');
      }, 1000);
    }
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

      setSyncProgress(25);
      setSyncMessage('Limpando registros anteriores...');
      // --- SURGICAL CLEAR: Clear prior automatically generated events ---
      const filters = [
        { field: 'description', operator: 'ilike', value: '%Cronograma automático%' }
      ];
      await deleteQuery('calendar_events', filters);

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
      const activeWeekdays = Array.isArray(settings.class_weekdays) ? settings.class_weekdays : [];

      // Fetch holiday dates once to reuse
      const holidayDates = new Set();
      const NON_BLOCKING_TITLES = ['servidor público', 'santo antônio', 'dia do professor', 'consciência negra'];
      
      currentEvents.filter(e => {
        const isH = e.type?.includes('holiday');
        if (!isH) return false;
        const titleLower = e.title?.toLowerCase() || '';
        return !NON_BLOCKING_TITLES.some(nb => titleLower.includes(nb));
      }).forEach(h => {
        holidayDates.add(h.start_date);
        if (h.end_date && h.end_date !== h.start_date) {
          let curr = new Date(h.start_date + 'T00:00:00');
          const end = new Date(h.end_date + 'T00:00:00');
          while (curr <= end) {
            holidayDates.add(curr.toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
          }
        }
      });

      // Generation loop per registered weekday
      for (let wIdx = 0; wIdx < activeWeekdays.length; wIdx++) {
        const weekdayNum = Number(activeWeekdays[wIdx]);
        // Retrieve class links for this weekday or default to unified
        const linkedClassIds = settings.weekday_classes?.[weekdayNum] || settings.weekday_classes?.[String(weekdayNum)] || [];
        const finalTargetIds = linkedClassIds.length > 0 ? linkedClassIds : [null];

        for (let i = 0; i < finalTargetIds.length; i++) {
          const tid = finalTargetIds[i];
          const targetClass = tid ? classes.find(c => c.id === tid) : null;
          const classLabel = targetClass ? ` - ${targetClass.name}` : '';
          const eventSignature = `Cronograma automático`; // Class name REMOVED after 'Cronograma automático' as requested!
          
          setSyncMessage(`Calculando aulas: ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][weekdayNum]} - ${targetClass?.name || 'Geral'}`);
          setSyncProgress(45 + Math.floor(((wIdx * finalTargetIds.length + i) / (activeWeekdays.length * finalTargetIds.length)) * 30));

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

          // Specific holiday/excused dates for THIS class
          const classExcusedDates = new Set(
            currentEvents
              .filter(e => e.type === 'excused_class' && e.class_id === tid)
              .map(e => e.start_date)
          );

          for (const range of ranges) {
            if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) continue;
            let currentDateObj = new Date(range.start);

            while (currentDateObj <= range.end) {
              const weekday = currentDateObj.getDay();
              
              if (weekday === weekdayNum) {
                // Timezone-safe year, month, and day strings from local date parts
                const yr = currentDateObj.getFullYear();
                const mo = String(currentDateObj.getMonth() + 1).padStart(2, '0');
                const dy = String(currentDateObj.getDate()).padStart(2, '0');
                const dateStr = `${yr}-${mo}-${dy}`;

                const defaultName = `Aula, Classe(s) Turma(s) de ${['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][weekday]}`;
                const dayTitle = (settings.weekday_titles?.[weekday] || settings.weekday_titles?.[String(weekday)] || defaultName) + classLabel;

                if (!holidayDates.has(dateStr) && !classExcusedDates.has(dateStr)) {
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


  const executeSave = async () => {
    if (!userAuth) return;
    setIsSyncing(true);

    try {
      const dbStartDate = parseDateToDB(formData.start_date);
      if (!dbStartDate) {
        setNotification({ type: 'err', message: 'Data de início é obrigatória' });
        setIsSyncing(false);
        return;
      }

      const data = {
        title: formData.title,
        description: formData.description,
        start_date: dbStartDate,
        end_date: parseDateToDB(formData.end_date) || null,
        type: formData.type,
        class_id: formData.class_id || null,
        subject_id: formData.subject_id || null,
        user_id: userAuth.uid,
        updated_at: new Date().toISOString()
      };

      const isAcademic = ['class_day', 'excused_class', 'cancelled_class', 'exam', 'start_term', 'end_term'].includes(formData.type);
      const activeEditScope = formData.type === 'excused_class' ? 'specific' : editScope;
      
      if (selectedEvent && isAcademic) {
        if (activeEditScope === 'all') {
          // Update ALL events on that day of academic types
          const relatedEvents = events.filter(ev => 
            ev.start_date === selectedEvent.start_date && 
            ['class_day', 'excused_class', 'cancelled_class', 'exam', 'start_term', 'end_term'].includes(ev.type)
          );

          if (relatedEvents.length > 1) {
            // Atualização de todas as turmas do dia em lote
            const updates = relatedEvents.map(re => saveData('calendar_events', re.id, {
              ...re,
              title: data.title + (re.title.includes(' - ') ? ' - ' + re.title.split(' - ')[1] : ''),
              type: data.type,
              description: data.description,
              start_date: data.start_date,
              end_date: data.end_date,
              updated_at: data.updated_at
            }));
            await Promise.all(updates);
          } else {
            // Apenas um evento, salve como Geral (class_id: null)
            await saveData('calendar_events', selectedEvent.id, {
              ...data,
              class_id: null
            });
          }
        } else {
          // Salva apenas esse evento específico (Classe / Turma)
          if (formData.type === 'excused_class' && !formData.class_id) {
            setNotification({ type: 'err', message: 'Por favor, selecione uma turma de aula para abonar.' });
            setIsSyncing(false);
            return;
          }
          await saveData('calendar_events', selectedEvent.id, {
            ...data,
            class_id: formData.class_id || null
          });
        }
      } else {
        // Criando novo ou não acadêmico
        if (!selectedEvent && activeEditScope === 'all' && isAcademic) {
          // Criando um novo evento com classe_id null (Período Total)
          await saveData('calendar_events', null, {
            ...data,
            class_id: null
          });
        } else {
          if (formData.type === 'excused_class' && !formData.class_id) {
            setNotification({ type: 'err', message: 'Por favor, selecione uma turma de aula para abonar.' });
            setIsSyncing(false);
            return;
          }
          await saveData('calendar_events', selectedEvent?.id || null, {
            ...data,
            class_id: formData.class_id || null
          });
        }
      }
      
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

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;
    if (!(isAdmin || isDirector)) return;

    const isEditingMode = !!selectedEvent;
    const scopeLabel = editScope === 'all' ? 'Período Total (Todas as turmas do dia)' : `Classe/Turma Específica (${classes.find(c => c.id === formData.class_id)?.name || 'Geral'})`;

    setConfirmModalConfig({
      type: 'info',
      title: isEditingMode ? 'Confirmar Alteração' : 'Criar Novo Registro',
      message: `Deseja realmente ${isEditingMode ? 'salvar as alterações no' : 'criar este'} registro "${formData.title}" para o dia ${formData.start_date} (${getWeekdayName(formData.start_date)})?\n\nEscopo de aplicação: ${scopeLabel}\n\nVocê tem certeza que deseja prosseguir com esta ação?`,
      action: async () => {
        await executeSave();
        setShowConfirmModal(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    handlePreSubmit(e);
  };

  const handleEdit = (event: CalendarEvent & { _count?: number }) => {
    setSelectedEvent(event);
    setEditScope((event.class_id || event.type === 'excused_class') ? 'specific' : 'all');
    // Remove os contadores "(x turmas)" do título ao editar
    const cleanTitle = event.title
      .replace(/^Dia de Aula - /, '')
      .replace(/\s*\(\d+\s*turmas\)$/i, '')
      .split(' - ')[0]
      .trim();

    setFormData({
      title: cleanTitle,
      description: event.description,
      start_date: event.start_date,
      end_date: event.end_date || event.start_date,
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

    if (!bypassConfirm) {
      setConfirmModalConfig({
        type: 'danger',
        title: 'Excluir Lançamento',
        message: `Deseja realmente excluir permanentemente o registro "${eventToDelete.title}" para o dia ${eventToDelete.start_date} (${getWeekdayName(eventToDelete.start_date)})?\n\nEsta ação removerá o registro para todas as turmas vinculadas e não poderá ser desfeita.`,
        action: async () => {
          // Close the confirmation and edit modals instantly so the UI responds immediately!
          setShowConfirmModal(false);
          setIsEditing(false);
          await handleDelete(id, true);
        }
      });
      setShowConfirmModal(true);
      return;
    }

    try {
      // Optimistic UI Update: instantly remove matching events from local state so they disappear in 0ms!
      const targetStartDate = eventToDelete.start_date;
      const targetType = eventToDelete.type;
      const targetTitle = eventToDelete.title;

      setEvents(prev => prev.filter(e => {
        const isSameDayAndType = e.start_date === targetStartDate && e.type === targetType;
        if (targetType === 'event' || targetType === 'exam') {
          return !(isSameDayAndType && e.title === targetTitle);
        }
        return !isSameDayAndType;
      }));

      // Realiza a remoção cirúrgica de todos os eventos agrupados no mesmo dia e tipo
      // Se for feriado ou dia de aula, remove todos do mesmo dia
      // Se for evento customizado, remove pelo título também para garantir
      const filters: any[] = [
        { field: 'start_date', operator: 'eq', value: eventToDelete.start_date },
        { field: 'type', operator: 'eq', value: eventToDelete.type }
      ];

      if (eventToDelete.type === 'event' || eventToDelete.type === 'exam') {
        filters.push({ field: 'title', operator: 'eq', value: eventToDelete.title });
      }

      await deleteQuery('calendar_events', filters);
      
      setNotification({ type: 'success', message: 'Registros removidos com sucesso!' });
      setConfirmDeleteId(null);
      // Quietly fetch fresh data from the server in the background to sync up
      fetchData();
    } catch (error: any) {
      console.error('Erro ao excluir:', error);
      setNotification({ 
        type: 'err', 
        message: 'Erro ao excluir instâncias: Verifique sua conexão ou permissões.' 
      });
      // Restore events in case of database failure by refetching
      fetchData();
    }
  };

  const isSyncingInPage = isSyncing; // Avoid naming conflict if any

  const todayStr = React.useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-CA');
  }, []);

  const totalHolidays = useMemo(() => {
    const currentYear = currentDate.getFullYear().toString();
    return events.filter(e => e.type?.includes('holiday') && e.start_date.startsWith(currentYear)).length;
  }, [events, currentDate]);

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
      // Agrupa visualmente eventos do mesmo tipo no mesmo dia que tenham o MESMO título base
      const baseTitle = current.title.split(' - ')[0].trim();
      const isAcademic = current.type === 'class_day' || current.type === 'excused_class' || 
                        current.type === 'cancelled_class' || current.type === 'exam' ||
                        current.type === 'start_term' || current.type === 'end_term';
      
      const existingIndex = acc.findIndex(item => 
        item.start_date === current.start_date && 
        item.type === current.type &&
        (isAcademic 
          ? (item.title.split(' - ')[0].trim() === baseTitle)
          : item.title === current.title)
      );

      if (existingIndex === -1) {
        acc.push({ ...current, _count: 1, _unique_classes: new Set([String(current.class_id)]) });
      } else {
        acc[existingIndex]._count = (acc[existingIndex]._count || 1) + 1;
        if (current.class_id) acc[existingIndex]._unique_classes?.add(String(current.class_id));
      }
      return acc;
    }, [] as (CalendarEvent & { _count?: number; _unique_classes?: Set<string> })[]).map(event => {
      // For all academic events, simplify to "baseTitle" to keep a single clean marking
      const isAcademic = ['class_day', 'excused_class', 'cancelled_class', 'exam', 'start_term', 'end_term'].includes(event.type);
      
      if (isAcademic) {
        const baseTitle = event.title.split(' - ')[0].trim();
        return {
          ...event,
          title: baseTitle
        };
      }
      return event;
    });
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
      const isAcademic = ['class_day', 'start_term', 'end_term', 'exam'].includes(e.type);
      if (matchesWeekday && isAcademic && e.class_id) {
        classIds.add(e.class_id);
      }
    });
    const filtered = classes.filter(c => classIds.has(c.id));
    return [...filtered].sort((a, b) => {
      const extract = (s: string) => {
        const match = s.match(/\d+/);
        const yrStr = match ? match[0] : '0';
        let yr = parseInt(yrStr);
        if (yrStr.length === 2) yr += 2000;
        const name = s.replace(/\d+/, '').trim().toLowerCase();
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
          <div className="flex bg-slate-100 p-1.5 rounded-none border border-slate-200/50 shadow-inner w-fit">
            <button 
              onClick={() => setViewMode('month')}
              className={cn(
                "px-4 py-2 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'month' ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Mês
            </button>
            <button 
              onClick={() => setViewMode('year')}
              className={cn(
                "px-4 py-2 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'year' ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Ano
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "px-4 py-2 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'list' ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Lista
            </button>
            <button 
              onClick={() => {
                setViewMode('management');
                setActiveTab('record');
              }}
              className={cn(
                "px-4 py-2 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'management' ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Registro
            </button>
          </div>

          {/* Navegação de Data Contextual - Aumentado */}
          <div className="flex items-center bg-white border border-slate-200 rounded-none p-1 shadow-sm w-fit self-start">
            <button 
              onClick={viewMode === 'month' ? prevMonth : prevYear}
              className="p-2 hover:bg-slate-50 rounded-none transition-all text-slate-400 hover:text-slate-800 active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            
            <div className="px-5 min-w-[120px] text-center border-x border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-[0.1em]">
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
              className="p-2 hover:bg-slate-50 rounded-none transition-all text-slate-400 hover:text-slate-800 active:scale-90"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Lado Direito: Contagem Quarta/Quinta Staked - Aumentado e Estilizado */}
        <div className="flex-1 flex flex-col md:flex-row items-center justify-end gap-8 min-w-0">
          <div className="flex flex-col gap-3 shrink-0 border-l border-slate-100 pl-8 min-w-[220px]">
            <div className="flex items-center justify-end gap-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quarta</span>
              <div className="flex items-baseline gap-1.5 bg-slate-50 px-3 py-1.5 rounded-none border border-slate-200">
                {(() => {
                  const count = getEventCount('class_day', 3);
                  const days = typeof count === 'object' ? count.days : 0;
                  return <span className="text-xl font-bold text-slate-800 leading-none">{days}</span>;
                })()}
                <span className="text-[9px] font-bold text-blue-400 uppercase">Aulas</span>
              </div>
              {(() => {
                const progress = getClassProgress(3);
                return (
                  <div className="flex flex-col items-end min-w-[50px]">
                    <span className="text-[10px] font-bold text-orange-600 leading-none">-{progress.remaining}</span>
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Restam</span>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-end gap-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quinta</span>
              <div className="flex items-baseline gap-1.5 bg-slate-50 px-3 py-1.5 rounded-none border border-slate-200">
                {(() => {
                  const count = getEventCount('class_day', 4);
                  const days = typeof count === 'object' ? count.days : 0;
                  return <span className="text-xl font-bold text-slate-800 leading-none">{days}</span>;
                })()}
                <span className="text-[9px] font-bold text-indigo-400 uppercase">Aulas</span>
              </div>
              {(() => {
                const progress = getClassProgress(4);
                return (
                  <div className="flex flex-col items-end min-w-[50px]">
                    <span className="text-[10px] font-bold text-orange-600 leading-none">-{progress.remaining}</span>
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
                className="w-10 h-10 flex items-center justify-center bg-slate-800 text-white hover:bg-slate-900 transition-all rounded-none shadow-lg shadow-none active:scale-95"
                title="Novo Registro"
              >
                <Plus size={18} />
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white transition-all rounded-none border border-slate-100 shadow-sm active:scale-95"
                title="Ajuste do Calendário Anual"
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
            <Calendar className="text-slate-800" size={20} />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cronograma Acadêmico</h1>
          </div>
          <p className="text-slate-500 text-xs font-medium">Gestão de ciclos letivos e atividades escolares.</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowPrintOptions(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all active:scale-95 border border-slate-200"
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
              className="bg-white rounded-none p-8 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6 relative">
                <RefreshCw size={24} className="text-slate-800 animate-spin" />
                <div className="absolute inset-0 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-2">Processando...</h3>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-6 h-4">
                {syncMessage || 'Sincronizando dados...'}
              </p>

              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <motion.div 
                  className="h-full bg-slate-800"
                  initial={{ width: 0 }}
                  animate={{ width: `${isNaN(Number(syncProgress)) ? 0 : syncProgress}%` }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                />
              </div>
              <div className="flex justify-between w-full">
                <span className="text-[10px] font-bold text-slate-800">{syncProgress}%</span>
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
                "px-8 py-4 rounded-none text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 shadow-2xl",
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
          ) : viewMode === 'management' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {inspectingClassId ? (
                // --- MODO INSPEÇÃO DE TURMA ---
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setInspectingClassId(null)}
                        className="w-10 h-10 flex items-center justify-center bg-white text-slate-400 hover:bg-slate-900 hover:text-white transition-all rounded-none border border-slate-200"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                          {classes.find(c => c.id === inspectingClassId)?.name}
                        </h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Cronograma de Aulas Detalhado</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => {
                          setSettingsForm(prev => ({
                            ...prev,
                            target_class_ids: [inspectingClassId]
                          }));
                          setShowSettings(true);
                        }}
                        className="px-4 py-2 bg-slate-900 text-white rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
                      >
                        <Settings size={14} />
                        Ajustar Regras
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Lista Cronológica */}
                    <div className="bg-white rounded-none border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">#</th>
                            <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
                            <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Semana</th>
                            <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Título do Registro</th>
                            <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            const currentCls = classes.find(c => c.id === inspectingClassId);
                            const dayMap: Record<string, number> = {
                              'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6,
                              'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6,
                              'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado-feira': 6,
                              'segunda-feira': 1, 'terça-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5,
                            };
                            
                            let targetWeekdays: number[] = [];
                            if (currentCls) {
                              let rawDays: any = currentCls.days_of_week;
                              if (typeof rawDays === 'string') {
                                try { rawDays = JSON.parse(rawDays); } catch (e) { rawDays = rawDays.split(',').map((s: string) => s.trim()); }
                              }
                              if (Array.isArray(rawDays) && rawDays.length > 0) {
                                targetWeekdays = rawDays
                                  .map(d => dayMap[d] !== undefined ? dayMap[d] : dayMap[d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()])
                                  .filter(d => d !== undefined);
                              } else if (currentCls.name) {
                                const lowerName = currentCls.name.toLowerCase();
                                if (lowerName.includes('quarta') || lowerName.includes('4ª')) targetWeekdays.push(3);
                                if (lowerName.includes('quinta') || lowerName.includes('5ª')) targetWeekdays.push(4);
                                if (lowerName.includes('terça') || lowerName.includes('3ª')) targetWeekdays.push(2);
                                if (lowerName.includes('segunda') || lowerName.includes('2ª')) targetWeekdays.push(1);
                                if (lowerName.includes('sexta') || lowerName.includes('6ª')) targetWeekdays.push(5);
                              }
                            }

                            return events
                              .filter(e => {
                                const isForThisClass = String(e.class_id) === String(inspectingClassId);
                                if (!isForThisClass) return false;
                                
                                const isAcademic = e.type === 'class_day' || e.type === 'excused_class' || e.type === 'cancelled_class';
                                if (!isAcademic) return true;

                                if (targetWeekdays.length > 0) {
                                  const d = new Date(e.start_date + 'T12:00:00').getDay();
                                  return targetWeekdays.includes(d);
                                }
                                return true;
                              })
                              .sort((a, b) => a.start_date.localeCompare(b.start_date))
                              .map((ev, idx) => {
                                const date = new Date(ev.start_date + 'T00:00:00');
                                const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });

                                return (
                                  <tr key={ev.id} className={cn(
                                    "hover:bg-slate-50/50 transition-colors group",
                                    ev.type === 'excused_class' && "opacity-60 grayscale-[0.5]"
                                  )}>
                                    <td className="px-8 py-4 text-xs font-bold text-slate-400">
                                      {String(idx + 1).padStart(2, '0')}
                                    </td>
                                    <td className="px-8 py-4">
                                      <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-900">{formatDateForDisplay(ev.start_date)}</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{weekday}</span>
                                      </div>
                                    </td>
                                    <td className="px-8 py-4">
                                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                        W{getWeekId(ev.start_date).split('W')[1]}
                                      </span>
                                    </td>
                                    <td className="px-8 py-4">
                                      <span className="text-sm font-bold text-slate-600">{ev.title}</span>
                                    </td>
                                    <td className="px-8 py-4">
                                      <span className={cn(
                                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                        ev.type === 'class_day' ? "bg-slate-50 text-blue-700 border-slate-200" : 
                                        ev.type === 'cancelled_class' ? "bg-rose-50 text-rose-700 border-rose-100" :
                                        "bg-slate-100 text-slate-500 border-slate-200"
                                      )}>
                                        {ev.type === 'class_day' ? 'Letivo' : ev.type === 'cancelled_class' ? 'Cancelado' : 'Abonado'}
                                      </span>
                                    </td>
                                    <td className="px-8 py-4 text-right">
                                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                          onClick={async () => {
                                            let nextType: CalendarEvent['type'] = 'class_day';
                                            let nextTitle = 'Dia de Aula';
                                            
                                            if (ev.type === 'class_day') {
                                              nextType = 'excused_class';
                                              nextTitle = 'Aula Abonada';
                                            } else if (ev.type === 'excused_class') {
                                              nextType = 'cancelled_class';
                                              nextTitle = 'Aula Cancelada';
                                            }

                                            // Identifica se este evento faz parte de um grupo compartilhado no mesmo dia
                                            const baseTitle = ev.title.split(' - ')[0].trim();
                                            const relatedEvents = events.filter(rv => 
                                              rv.start_date === ev.start_date && 
                                              ['class_day', 'excused_class', 'cancelled_class'].includes(rv.type) &&
                                              rv.title.split(' - ')[0].trim() === baseTitle
                                            );

                                            if (relatedEvents.length > 1) {
                                              const updates = relatedEvents.map(re => {
                                                const suffix = re.title.includes(' - ') ? ' - ' + re.title.split(' - ')[1] : '';
                                                return saveData('calendar_events', re.id, { 
                                                  ...re, 
                                                  type: nextType, 
                                                  title: nextTitle + suffix 
                                                });
                                              });
                                              await Promise.all(updates);
                                            } else {
                                              await saveData('calendar_events', ev.id, { ...ev, type: nextType, title: nextTitle });
                                            }
                                            
                                            fetchData();
                                          }}
                                          className={cn(
                                            "p-2 rounded-none transition-all",
                                            ev.type === 'class_day' ? "bg-slate-100 text-slate-400 hover:bg-slate-900 hover:text-white" : 
                                            ev.type === 'cancelled_class' ? "bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white" :
                                            "bg-blue-100 text-slate-800 hover:bg-slate-800 hover:text-white"
                                          )}
                                          title={ev.type === 'class_day' ? 'Abonar Aula' : ev.type === 'excused_class' ? 'Cancelar Aula' : 'Retornar para Letivo'}
                                        >
                                          <CheckCircle2 size={16} />
                                        </button>
                                        <button 
                                          onClick={() => handleDelete(ev.id)}
                                          className="p-2 bg-rose-50 text-rose-400 hover:bg-rose-600 hover:text-white rounded-none transition-all"
                                          title="Remover Data"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                // --- MODO LISTA DE TURMAS ---
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  <div className="xl:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Registro de Calendários por Turma</h2>
                        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Resumo anual e ajuste individual de datas</p>
                      </div>
                    </div>

                    <div className="bg-white rounded-none border border-slate-200 shadow-sm overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Turma</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Início/Fim</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Dias Letivos</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Concluídas</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {classes.map(cls => {
                            // Identify class weekdays for strict filtering
                            const dayMap: Record<string, number> = {
                              'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6,
                              'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6,
                              'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado-feira': 6,
                              'segunda-feira': 1, 'terça-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5,
                            };
                            
                            let rawDays: any = cls.days_of_week;
                            if (typeof rawDays === 'string') {
                              try { rawDays = JSON.parse(rawDays); } catch (e) { rawDays = rawDays.split(',').map((s: string) => s.trim()); }
                            }
                            
                            let targetWeekdays: number[] = [];
                            if (Array.isArray(rawDays) && rawDays.length > 0) {
                              targetWeekdays = rawDays
                                .map(d => dayMap[d] !== undefined ? dayMap[d] : dayMap[d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()])
                                .filter(d => d !== undefined);
                            } else if (cls.name) {
                              const lowerName = cls.name.toLowerCase();
                              if (lowerName.includes('quarta') || lowerName.includes('4ª')) targetWeekdays.push(3);
                              if (lowerName.includes('quinta') || lowerName.includes('5ª')) targetWeekdays.push(4);
                              if (lowerName.includes('terça') || lowerName.includes('3ª')) targetWeekdays.push(2);
                              if (lowerName.includes('segunda') || lowerName.includes('2ª')) targetWeekdays.push(1);
                              if (lowerName.includes('sexta') || lowerName.includes('6ª')) targetWeekdays.push(5);
                            }

                            // Strict filter: only count events that match the class and its intended weekdays (for class_day type)
                            const classEvents = events.filter(e => {
                              const isForThisClass = String(e.class_id) === String(cls.id);
                              if (!isForThisClass) return false;
                              
                              const isAcademic = e.type === 'class_day' || e.type === 'excused_class';
                              if (!isAcademic) return true; // Keep other types
                              
                              if (targetWeekdays.length > 0) {
                                const d = new Date(e.start_date + 'T12:00:00').getDay();
                                return targetWeekdays.includes(d);
                              }
                              return true;
                            });

                            const letivos = classEvents.filter(e => e.type === 'class_day').length;
                            const sortedEvents = [...classEvents].sort((a,b) => a.start_date.localeCompare(b.start_date));
                            const completed = classEvents.filter(e => e.type === 'class_day' && new Date(e.start_date + 'T00:00:00') < new Date()).length;
                            const excused = classEvents.filter(e => e.type === 'excused_class').length;
                            
                            return (
                              <tr key={cls.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-900">{cls.name}</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{cls.code}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-bold text-slate-600">
                                      {sortedEvents.length > 0 ? formatDateForDisplay(sortedEvents[0].start_date) : '-'}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">até</span>
                                    <span className="text-[10px] font-bold text-slate-600">
                                      {sortedEvents.length > 0 ? formatDateForDisplay(sortedEvents[sortedEvents.length - 1].start_date) : '-'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={cn(
                                      "px-3 py-1 rounded-full text-[11px] font-bold border",
                                      letivos > 0 ? "bg-slate-50 text-blue-700 border-slate-200" : "bg-slate-50 text-slate-400 border-slate-100"
                                    )}>
                                      {letivos} DIAS
                                    </span>
                                    {excused > 0 && (
                                      <span className="text-[9px] font-bold text-slate-400 uppercase italic">
                                        ({excused} abonados)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-xs font-bold text-slate-700">{completed} / {letivos}</span>
                                    <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-emerald-500" 
                                        style={{ width: `${letivos ? (completed / letivos) * 100 : 0}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => setInspectingClassId(cls.id)}
                                      className="px-4 py-2 bg-white text-slate-600 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95 border border-slate-200"
                                    >
                                      Ver Lista
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setSettingsForm({
                                          ...academicSettings,
                                          target_class_ids: [cls.id]
                                        });
                                        setLastLoadedKey('custom'); // Prevents override from useEffect
                                        setShowSettings(true);
                                      }}
                                      className="p-2 bg-slate-100 text-slate-400 rounded-none hover:bg-slate-900 hover:text-white transition-all border border-slate-200"
                                      title="Configurações"
                                    >
                                      <Settings2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">Estatísticas de {currentDate.getFullYear()}</h2>
                      <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Resumo geral da instituição</p>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {(() => {
                        const currentYearStr = currentDate.getFullYear().toString();
                        const yearEvents = events.filter(e => e.start_date && e.start_date.startsWith(currentYearStr));
                        
                        const holidayDates = new Set(
                          yearEvents
                            .filter(e => e.type?.includes('holiday'))
                            .map(e => e.start_date)
                        );
                        
                        const academicEvents = yearEvents.filter(e => 
                          e.type === 'class_day' || 
                          e.type === 'excused_class' ||
                          e.type === 'exam' ||
                          (e.type === 'event' && e.title?.toLowerCase().includes('aula'))
                        );

                        const uniqueDatesCount = new Set(academicEvents.map(e => e.start_date)).size;
                        const totalInstances = academicEvents.length;

                        return (
                          <div className="bg-white p-6 rounded-none border border-slate-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-slate-50 rounded-none flex items-center justify-center text-slate-800">
                                <Bookmark size={24} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Feriados Únicos</p>
                                <p className="text-2xl font-bold text-slate-900">{holidayDates.size}</p>
                              </div>
                            </div>
                            <div className="h-px bg-slate-100 w-full" />
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-50 rounded-none flex items-center justify-center text-emerald-600">
                                  <Calendar size={24} />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dias Letivos</p>
                                  <p className="text-lg font-bold text-slate-900">{uniqueDatesCount}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-50 rounded-none flex items-center justify-center text-slate-800">
                                  <GraduationCap size={24} />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Aulas</p>
                                  <p className="text-lg font-bold text-slate-900">{totalInstances}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="bg-slate-900 p-8 rounded-[40px] text-white relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-all duration-700" />
                        <Settings className="mb-6 opacity-40" size={32} />
                        <h3 className="text-xl font-bold leading-tight mb-4 pr-12">Deseja reiniciar o calendário?</h3>
                        <p className="text-slate-400 text-xs font-medium leading-relaxed mb-6">
                          Você pode excluir todos os registros de aula e gerar novamente com novos parâmetros.
                        </p>
                        <button 
                          onClick={() => {
                            // Inicializa com as configurações atuais mas limpa as turmas para escolha manual
                            setSettingsForm({
                              ...academicSettings,
                              target_class_ids: []
                            });
                            setLastLoadedKey('custom'); // Prevents override from useEffect
                            setShowSettings(true);
                          }}
                          className="w-full py-4 bg-white text-slate-900 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all shadow-xl shadow-black/20"
                        >
                          Abrir Ferramenta de Geração
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'month' ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white p-8 rounded-none shadow-sm overflow-visible border border-slate-100">
              <div className="pb-8 border-b border-slate-50 mb-8">
                {renderIntegratedToolbar()}
              </div>

              {/* Calendário Mensal Estilizado */}
                <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-none overflow-visible shadow-inner">
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
                    const dayEvents = filteredEvents.filter(e => e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date))
                      .sort((a, b) => {
                        const typeOrder: Record<string, number> = { 
                          'class_day': 1, 
                          'start_term': 2, 
                          'end_term': 3, 
                          'exam': 4, 
                          'holiday': 5, 
                          'holiday_nac': 6, 
                          'holiday_est': 7, 
                          'holiday_mun': 8, 
                          'event': 9, 
                          'excused_class': 10 
                        };
                        const orderA = typeOrder[a.type] || 99;
                        const orderB = typeOrder[b.type] || 99;
                        return orderA - orderB;
                      });

                    const rawDayEvents = events.filter(e => 
                      e.start_date === dateStr || (e.end_date && dateStr >= e.start_date && dateStr <= e.end_date)
                    );
                    const isToday = todayStr === dateStr;
                    const periodType = getPeriodType(dateStr, academicSettings);
                    const isCancelled = dayEvents.some(e => e.type === 'cancelled_class');
                    const isExcused = dayEvents.some(e => e.type === 'excused_class');
                    const isVacation = periodType === 'vacation' || periodType === 'recess' || dayEvents.some(e => e.title.toLowerCase().includes('férias') || e.title.toLowerCase().includes('recesso'));
                    const isHolidayCell = dayEvents.some(e => {
                      const isH = e.type?.includes('holiday');
                      if (!isH) return false;
                      const titleLower = e.title?.toLowerCase() || '';
                      return !['servidor público', 'santo antônio', 'dia do professor'].some(nb => titleLower.includes(nb));
                    });

                    const hasClassDay = dayEvents.some(e => e.type === 'class_day' || e.type === 'excused_class');
                    const wDay = getWeekdayIndex(dateStr);
                    const classDayBg = hasClassDay
                      ? (wDay === 3 ? "bg-sky-50/60" : wDay === 4 ? "bg-amber-50/60" : "")
                      : "";

                    return (
                      <motion.div 
                        key={`month-day-${day}`}
                        whileHover={{ scale: 1.01, zIndex: 50 }}
                        whileTap={{ scale: 0.98, backgroundColor: 'rgba(245, 158, 11, 0.05)' }}
                        onClick={() => {
                          if (isAdmin || isDirector) {
                            setFormData({
                              title: 'Dia de Aula',
                              description: '',
                              start_date: dateStr,
                              end_date: dateStr,
                              type: 'class_day',
                              class_id: '',
                              subject_id: ''
                            });
                            setSelectedEvent(null);
                            setIsEditing(true);
                          }
                        }}
                        className={cn(
                          "aspect-[4/3] md:aspect-auto md:min-h-[140px] p-2 flex flex-col gap-1 transition-all group/cell overflow-visible cursor-pointer relative border-r border-b border-slate-100",
                          !isToday && !isVacation && !isHolidayCell && !classDayBg ? "bg-white" : "",
                          classDayBg,
                          isToday && "bg-slate-50/20",
                          isVacation && "bg-stripes-slate",
                          isHolidayCell && "bg-stripes-red"
                        )}
                      >
                        {/* Contorno da cor litúrgica católica do dia ao passar o mouse */}
                        <div 
                          className="absolute inset-0 pointer-events-none opacity-0 group-hover/cell:opacity-100 transition-opacity duration-300 z-10 -m-[1px]"
                          style={{
                            borderColor: getLiturgicalColorObj(dateStr).color,
                            borderWidth: '2px',
                            borderStyle: 'solid'
                          }}
                          title={getLiturgicalColorObj(dateStr).label}
                        />

                        {/* Indicador visual de Aula Cancelada (um "X" translúcido sobre a célula) */}
                        {isCancelled && (
                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 select-none">
                            <svg className="w-full h-full stroke-rose-500/40" viewBox="0 0 100 100" preserveAspectRatio="none">
                              <line x1="5" y1="5" x2="95" y2="95" strokeWidth="3" strokeLinecap="round" />
                              <line x1="95" y1="5" x2="5" y2="95" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                          </div>
                        )}

                        <div className="flex justify-between items-start">
                          <div className="relative group/date">
                            <span className={cn(
                              "w-7 h-7 flex items-center justify-center rounded-none text-xs font-bold transition-all",
                              isToday ? "bg-slate-800 text-white shadow-lg shadow-none" : "text-slate-500 group-hover/cell:text-slate-800"
                            )}>
                              {day}
                            </span>

                            {/* Tooltip do Dia (Resumo) - Agora vinculado apenas ao número do dia */}
                            {dayEvents.length > 0 && (
                              <div className="absolute left-0 bottom-full mb-2 w-max min-w-[160px] max-w-[240px] z-[250] pointer-events-none hidden group-hover/date:block animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="bg-white border border-slate-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] rounded-none p-4 text-[10px] font-bold text-slate-700 whitespace-normal leading-tight ring-4 ring-black/5">
                                  <div className="text-slate-400 text-[8px] uppercase tracking-[0.2em] mb-3 pb-2 border-b border-slate-50 flex justify-between items-center">
                                    <span>Resumo do Dia {day}</span>
                                    <Calendar size={10} />
                                  </div>
                                  <div className="space-y-3">
                                    {dayEvents.map(de => {
                                      const cls = classes.find(c => c.id === de.class_id);
                                      const isH = de.type.includes('holiday');
                                      return (
                                        <div key={`summary-${de.id}`} className="space-y-1.5">
                                          <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full shrink-0", isH ? "bg-red-500" : "bg-slate-500")} />
                                            <span className={cn("uppercase", isH ? "text-red-600" : "text-slate-800")}>
                                              {de.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').split(' - ')[0]}
                                            </span>
                                          </div>
                                          {cls && (
                                            <div className="flex items-center gap-2 pl-4 text-slate-500 font-medium text-[9px]">
                                              <School size={10} className="text-slate-300" />
                                              <span>Turma: {cls.name}</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="absolute -bottom-1.5 left-3 w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45" />
                              </div>
                            )}
                          </div>
                          {(isAdmin || isDirector) && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                let updatedClassId = formData.class_id;
                                if (formData.class_id) {
                                  const dayFiltered = getFilteredClassesForDate(dateStr);
                                  const isValid = dayFiltered.some(c => c.id === formData.class_id);
                                  if (!isValid) {
                                    updatedClassId = '';
                                  }
                                }
                                setFormData({
                                  ...formData,
                                  start_date: dateStr,
                                  end_date: dateStr,
                                  class_id: updatedClassId
                                });
                                setIsEditing(true);
                              }}
                              className="opacity-0 group-hover/cell:opacity-100 p-1 text-slate-800 hover:bg-blue-100 rounded-none transition-all"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </div>

                        {/* Resumo de Eventos */}
                        <div className="flex flex-col gap-1 mt-1 overflow-visible flex-1 pb-1">
                          {dayEvents
                            .filter(e => e.type !== 'event')
                            .map(event => (
                            <div 
                              key={event.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(event);
                              }}
                                className={cn(
                                  "relative group px-1.5 py-0.5 rounded-none text-[8px] font-bold whitespace-normal break-words leading-[1.1] cursor-pointer transition-all hover:brightness-95 active:scale-95 border hover:z-50",
                                  getTypeStyle(event.type, event.start_date, event.title)
                                )}
                            >
                              {event.type === 'excused_class' || event.type === 'cancelled_class' ? (
                                <div className="flex flex-col py-0.5">
                                  <span className={cn(
                                    "block",
                                    event.type === 'cancelled_class' ? "line-through text-rose-400" : "text-slate-600"
                                  )}>
                                    {event.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').replace(/^Aula - /, '').replace(/^Aula Normal - /, '').split(' - ')[0].trim()}
                                  </span>
                                  <span className="text-[6px] font-bold opacity-100 tracking-wider text-slate-500 mt-0.5 no-underline block leading-none">
                                    {event.type === 'excused_class' ? 'ABONADA' : 'CANCELADA'}
                                  </span>
                                </div>
                              ) : (
                                <span className="block">
                                  {event.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').replace(/^Aula - /, '').replace(/^Aula Normal - /, '').split(' - ')[0].trim()}
                                </span>
                              )}

                              {/* Tooltip Detalhado no Calendar Grid */}
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-max min-w-[140px] max-w-[220px] z-[200] pointer-events-none hidden group-hover:block animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <div className="bg-white border border-slate-200 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] rounded-none p-3.5 text-[10px] font-bold text-slate-700 whitespace-normal leading-tight ring-4 ring-black/5">
                                  <div className="text-slate-800 mb-2.5 border-b border-blue-50 pb-2 flex items-center gap-2">
                                    <div className={cn(
                                      "w-2 h-2 rounded-full shrink-0 shadow-sm", 
                                      event.type?.includes('holiday') ? "bg-red-500" : event.type === 'exam' ? "bg-orange-500" : "bg-slate-500"
                                    )} />
                                    <span className="truncate max-w-[170px] uppercase tracking-wide">
                                      {event.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').replace(/^Aula - /, '').replace(/^Aula Normal - /, '').split(' - ')[0].trim()}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5 text-slate-600">
                                    {(() => {
                                      const norm = (t: string) => t
                                        .replace(/^Dia de Aula - /, '')
                                        .replace(/^Aula - /, '')
                                        .replace(/^Aula Normal - /, '')
                                        .split(' - ')[0]
                                        .trim();
                                      
                                      const normalizedTitle = norm(event.title);
                                      const relatedEvents = rawDayEvents.filter(re => norm(re.title) === normalizedTitle && re.type === event.type);
                                      
                                      const uniqueClassIds = Array.from(new Set(relatedEvents.map(re => re.class_id).filter(Boolean)));
                                      const relatedClasses = uniqueClassIds.map(id => classes.find(c => c.id === id)).filter(Boolean);
                                      const sbj = subjects.find(s => s.id === event.subject_id);
                                      
                                      return (
                                        <>
                                          {relatedClasses.length > 0 && (
                                            <div className="flex flex-col gap-0.5 text-[9px] text-slate-500 leading-normal">
                                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px] flex items-center gap-1">
                                                <School size={8} /> {relatedClasses.length > 1 ? 'Turmas' : 'Turma'}
                                              </span>
                                              <span className="text-slate-800 font-bold">
                                                {relatedClasses.map(c => c!.name).join(', ')}
                                              </span>
                                            </div>
                                          )}
                                          {sbj && (
                                            <div className="flex items-center gap-2 border-t border-slate-50 pt-1.5">
                                              <BookOpen size={10} className="text-slate-400" />
                                              <span className="truncate">{sbj.name}</span>
                                            </div>
                                          )}
                                          {event.description && (
                                            <div className="text-slate-400 font-medium text-[9px] mt-1.5 border-t border-slate-50 pt-1.5 leading-snug italic">
                                              {event.description}
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                                {/* Seta do Tooltip */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-r border-b border-slate-200 rotate-45" />
                              </div>
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

                {renderCalendarLegend()}
              </div>
            </div>
          ) : viewMode === 'year' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="bg-white p-6 rounded-none border border-slate-100 shadow-sm overflow-hidden">
                {renderIntegratedToolbar()}
              </div>

              <div className="bg-white p-8 rounded-none border border-slate-100 shadow-sm">
                <div className="space-y-12">
                      {/* Primeiro Semestre */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-slate-800 rounded-full" />
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Fluxo do Primeiro Semestre</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {[0, 1, 2, 3, 4, 5].map(monthIndex => (
                        <div key={monthIndex} className="p-6 bg-slate-50/50 rounded-none border border-slate-100 hover:bg-white hover:shadow-xl transition-all duration-300">
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
                              const hasClassDay = dayEvents.some(e => e.type === 'class_day');
                              const isCancelled = dayEvents.some(e => e.type === 'cancelled_class');
                              const wDay = getWeekdayIndex(dateStr);

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex items-center justify-center rounded-none text-[10px] font-bold transition-all relative border w-full overflow-visible group cursor-pointer hover:z-50",
                                    holiday 
                                      ? "bg-red-50 text-red-600 border-red-100 shadow-sm bg-stripes-red"
                                      : isVacation
                                        ? "bg-slate-50 text-slate-600 border-slate-100 shadow-sm bg-stripes-slate"
                                        : hasClassDay
                                          ? (wDay === 3 ? "bg-sky-50 text-sky-800 border-sky-100 shadow-sm" : wDay === 4 ? "bg-amber-50 text-amber-800 border-amber-100 shadow-sm" : "bg-slate-50 text-slate-800 border-slate-200 shadow-sm")
                                          : dayEvents.length > 0 
                                            ? "bg-slate-50 text-slate-800 border-slate-200 shadow-sm"
                                            : isToday ? "bg-slate-800 text-white border-blue-700 shadow-md scale-110 z-10" : "bg-transparent text-slate-400 border-transparent hover:bg-white hover:border-slate-200"
                                  )}
                                  style={isToday ? {} : {
                                    borderColor: getLiturgicalColorObj(dateStr).color,
                                    borderWidth: '1.5px',
                                    borderStyle: 'solid'
                                  }}
                                  title={getLiturgicalColorObj(dateStr).label}
                                >
                                  {day}

                                  {isCancelled && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 select-none">
                                      <svg className="w-full h-full stroke-rose-500/50" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <line x1="15" y1="15" x2="85" y2="85" strokeWidth="6" strokeLinecap="round" />
                                        <line x1="85" y1="15" x2="15" y2="85" strokeWidth="6" strokeLinecap="round" />
                                      </svg>
                                    </div>
                                  )}

                                  {/* Tooltip no Year View */}
                                  {dayEvents.length > 0 && (
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-max min-w-[125px] max-w-[185px] z-[200] pointer-events-none hidden group-hover:block animate-in fade-in slide-in-from-bottom-2 duration-200">
                                      <div className="bg-white border border-slate-200 shadow-2xl rounded-none p-3 text-[9px] font-bold text-slate-700 whitespace-normal leading-tight ring-4 ring-black/5">
                                        <div className="space-y-2.5">
                                          {dayEvents.slice(0, 3).map(de => (
                                            <div key={de.id} className="border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                                              <div className="text-slate-800 flex items-center gap-2 mb-1">
                                                <div className={cn("w-1.5 h-1.5 rounded-full shadow-sm", de.type.includes('holiday') ? "bg-red-500" : "bg-slate-500")} />
                                                <span className="truncate uppercase tracking-tight">{de.title.split(' - ')[0]}</span>
                                              </div>
                                              <div className="flex items-center gap-1.5 text-[8px] text-slate-400 font-medium">
                                                <School size={8} />
                                                {classes.find(c => c.id === de.class_id)?.name || 'Geral'}
                                              </div>
                                            </div>
                                          ))}
                                          {dayEvents.length > 3 && (
                                            <div className="text-[7px] text-slate-300 text-center uppercase tracking-widest pt-1 border-t border-slate-50">
                                              + {dayEvents.length - 3} outros
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-r border-b border-slate-200 rotate-45" />
                                    </div>
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
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-emerald-600 rounded-full" />
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Fluxo do Segundo Semestre</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                       {[6, 7, 8, 9, 10, 11].map(monthIndex => (
                        <div key={monthIndex} className="p-6 bg-slate-50/50 rounded-none border border-slate-100 hover:bg-white hover:shadow-xl transition-all duration-300">
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
                              const hasClassDay = dayEvents.some(e => e.type === 'class_day');
                              const isCancelled = dayEvents.some(e => e.type === 'cancelled_class');
                              const wDay = getWeekdayIndex(dateStr);

                              return (
                                <div 
                                  key={`${monthIndex}-${day}`}
                                  onClick={() => dayEvents.length > 0 && handleEdit(dayEvents[0])}
                                  className={cn(
                                    "aspect-square flex items-center justify-center rounded-none text-[10px] font-bold transition-all relative border w-full overflow-visible group cursor-pointer hover:z-50",
                                    holiday 
                                      ? "bg-red-50 text-red-600 border-red-100 shadow-sm bg-stripes-red"
                                      : isVacation
                                        ? "bg-slate-50 text-slate-600 border-slate-100 shadow-sm bg-stripes-slate"
                                        : hasClassDay
                                          ? (wDay === 3 ? "bg-sky-50 text-sky-800 border-sky-100 shadow-sm" : wDay === 4 ? "bg-amber-50 text-amber-800 border-amber-100 shadow-sm" : "bg-slate-50 text-slate-800 border-slate-200 shadow-sm")
                                          : dayEvents.length > 0 
                                            ? "bg-slate-50 text-slate-800 border-slate-200 shadow-sm"
                                            : isToday ? "bg-slate-800 text-white border-blue-700 shadow-md scale-110 z-10" : "bg-transparent text-slate-400 border-transparent hover:bg-white hover:border-slate-200"
                                  )}
                                  style={isToday ? {} : {
                                    borderColor: getLiturgicalColorObj(dateStr).color,
                                    borderWidth: '1.5px',
                                    borderStyle: 'solid'
                                  }}
                                  title={getLiturgicalColorObj(dateStr).label}
                                >
                                  {day}

                                  {isCancelled && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 select-none">
                                      <svg className="w-full h-full stroke-rose-500/50" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <line x1="15" y1="15" x2="85" y2="85" strokeWidth="6" strokeLinecap="round" />
                                        <line x1="85" y1="15" x2="15" y2="85" strokeWidth="6" strokeLinecap="round" />
                                      </svg>
                                    </div>
                                  )}

                                  {/* Tooltip no Year View (Semestre 2) */}
                                  {dayEvents.length > 0 && (
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-max min-w-[125px] max-w-[185px] z-[200] pointer-events-none hidden group-hover:block animate-in fade-in slide-in-from-bottom-2 duration-200">
                                      <div className="bg-white border border-slate-200 shadow-2xl rounded-none p-3 text-[9px] font-bold text-slate-700 whitespace-normal leading-tight ring-4 ring-black/5">
                                        <div className="space-y-2.5">
                                          {dayEvents.slice(0, 3).map(de => (
                                            <div key={de.id} className="border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                                              <div className="text-slate-800 flex items-center gap-2 mb-1">
                                                <div className={cn("w-1.5 h-1.5 rounded-full shadow-sm", de.type.includes('holiday') ? "bg-red-500" : "bg-slate-500")} />
                                                <span className="truncate uppercase tracking-tight">{de.title.split(' - ')[0]}</span>
                                              </div>
                                              <div className="flex items-center gap-1.5 text-[8px] text-slate-400 font-medium">
                                                <School size={8} />
                                                {classes.find(c => c.id === de.class_id)?.name || 'Geral'}
                                              </div>
                                            </div>
                                          ))}
                                          {dayEvents.length > 3 && (
                                            <div className="text-[7px] text-slate-300 text-center uppercase tracking-widest pt-1 border-t border-slate-50">
                                              + {dayEvents.length - 3} outros
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-r border-b border-slate-200 rotate-45" />
                                    </div>
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

                {renderCalendarLegend()}
              </div>
            </div>
          ) : viewMode === 'list' && Object.keys(groupedEvents).length > 0 ? (
            <div className="space-y-12 animate-in fade-in duration-500">
              <div className="bg-white p-6 rounded-none border border-slate-100 shadow-sm overflow-hidden">
                {renderIntegratedToolbar()}
              </div>

              <div className="bg-white p-6 rounded-none border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 text-slate-800 rounded-none border border-slate-200/50">
                    <ListFilter size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-none">Ordenação da Lista</h3>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex bg-slate-50 p-1 rounded-none border border-slate-100">
                    <button 
                      onClick={() => setSortBy('date')}
                      className={cn(
                        "px-4 py-2 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
                        sortBy === 'date' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Data
                    </button>
                    <button 
                      onClick={() => setSortBy('title')}
                      className={cn(
                        "px-4 py-2 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
                        sortBy === 'title' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Título
                    </button>
                  </div>

                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => setSortOrder('asc')}
                      className={cn(
                        "p-2.5 rounded-none transition-all border",
                        sortOrder === 'asc' ? "bg-slate-800 border-blue-700 text-white shadow-lg shadow-none scale-105" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                      )}
                      title="Ordem Crescente"
                    >
                      <ArrowUpAZ size={16} />
                    </button>
                    <button 
                      onClick={() => setSortOrder('desc')}
                      className={cn(
                        "p-2.5 rounded-none transition-all border",
                        sortOrder === 'desc' ? "bg-slate-800 border-blue-700 text-white shadow-lg shadow-none scale-105" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
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
                    <h2 className="text-[10px] font-bold text-slate-800 uppercase tracking-[0.3em] bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200">Eventos de Referência</h2>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  
                  {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => {
                    const manualEvents = monthEvents.filter(e => e.type !== 'class_day' && e.type !== 'event' && !e.description?.includes('Cronograma automático'));
                    if (manualEvents.length === 0) return null;

                    return (
                      <div key={`manual-${month}`} className="bg-white rounded-none border border-slate-100 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100">
                          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <CalendarIcon size={12} className="text-slate-700" />
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
                              className="px-6 py-4 hover:bg-slate-50/30 transition-all group cursor-pointer flex items-center justify-between gap-6"
                              onClick={() => handleEdit(event)}
                            >
                              <div className="flex items-center gap-6 flex-1 min-w-0">
                                {/* Data Compacta */}
                                <div className="flex flex-col items-center justify-center min-w-[50px] py-1 bg-slate-50 rounded-none border border-slate-100 group-hover:bg-white group-hover:border-slate-200 transition-colors">
                                  <span className="text-[14px] font-bold text-slate-800 leading-none">
                                    {new Date(event.start_date + 'T00:00:00').getDate()}
                                  </span>
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                    {new Date(event.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                  </span>
                                </div>

                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-3">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-none text-[8px] font-bold uppercase tracking-widest border shrink-0",
                                      getTypeStyle(event.type, event.start_date, event.title)
                                    )}>
                                      {getTypeText(event.type, event.description)}
                                    </span>
                                    <h4 className="text-sm font-bold text-slate-800 truncate">
                                      {event.title.replace(/^Dia de Aula - /, '')}
                                    </h4>
                                  </div>
                                  
                                  <div className="flex items-center gap-4">
                                    {event.end_date && event.end_date !== event.start_date && (
                                      <span className="text-[9px] font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
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
                                    className="p-2 text-slate-400 hover:text-slate-800 hover:bg-white rounded-none transition-all border border-transparent hover:border-slate-200 shadow-sm hover:shadow-md"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(event.id, confirmDeleteId === event.id);
                                    }}
                                    className={cn(
                                      "p-2 rounded-none transition-all border border-transparent",
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
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200">Cronograma de Aulas</h2>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  
                  {(Object.entries(groupedEvents) as [string, CalendarEvent[]][]).map(([month, monthEvents]) => {
                    const autoEvents = monthEvents.filter(e => e.type === 'class_day' || e.description?.includes('Cronograma automático'));
                    if (autoEvents.length === 0) return null;

                    return (
                      <div key={`auto-${month}`} className="bg-white rounded-none border border-slate-100 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <BookOpen size={12} />
                            {month}
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-50">
                          {autoEvents.map(eventItem => {
                            const event = eventItem as any;
                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                key={event.id} 
                                className="p-4 hover:bg-slate-50 transition-all group cursor-pointer flex items-center gap-4"
                                onClick={() => handleEdit(event)}
                              >
                              <div className="w-10 h-10 flex flex-col items-center justify-center bg-slate-100 border border-slate-200 p-0.5 rounded-none group-hover:bg-white group-hover:border-slate-200 transition-all">
                                <span className="text-[13px] font-bold text-slate-700 leading-none">
                                  {new Date(event.start_date + 'T00:00:00').getDate()}
                                </span>
                                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">
                                  {new Date(event.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-[11px] font-bold text-slate-800 truncate uppercase tracking-tight">
                                  {event.title.replace(/^Dia de Aula - /, '')}
                                </h4>
                                <div className="flex items-center gap-2">
                                  <span className="text-[8px] font-bold text-slate-700 uppercase tracking-widest">Aula Normal</span>
                                  <div className="w-1 h-1 bg-slate-100 rounded-full" />
                                  <span className="text-[8px] font-bold text-slate-400 uppercase truncate">
                                    {event._count && event._count > 1 ? 'Múltiplas Turmas' : (classes.find(c => c.id === event.class_id)?.name || 'Geral')}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white p-8 rounded-none border-2 border-dashed border-slate-200 text-center flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-none flex items-center justify-center">
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
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white max-w-lg w-full rounded-none shadow-2xl overflow-hidden border border-slate-200 max-h-[96vh] flex flex-col"
            >
              <div className="px-6 py-5 border-b border-slate-100 relative shrink-0">
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="absolute top-5 right-6 p-1.5 hover:bg-slate-50 rounded-none transition-all text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-none flex items-center justify-center shadow-sm border",
                    getTypeStyle(formData.type)
                  )}>
                    <CalendarPlus size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
                      {selectedEvent ? 'Editar Registro' : 'Novo Registro'}
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 whitespace-nowrap">Gestão de Calendário</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
                {!(isAdmin || isDirector) && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-none flex items-start gap-2">
                    <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-[10px] font-bold text-amber-800 leading-tight text-left">Somente leitura. Apenas administradores podem fazer alterações.</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Tipo de Registro</label>
                    <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'holiday_nac', label: 'Nacional', icon: <Globe size={13} />, color: 'rose', desc: 'Feriado Federal' },
                      { id: 'holiday_mun', label: 'Municipal', icon: <MapPin size={13} />, color: 'amber', desc: 'Padroeiro/Local' },
                      { id: 'exam', label: 'Avaliação', icon: <GraduationCap size={13} />, color: 'orange', desc: 'Provas/Testes' },
                      { id: 'class_day', label: 'Aula Normal', icon: <BookOpen size={13} />, color: 'blue', desc: 'Dia Letivo' },
                      { id: 'excused_class', label: 'Aula Abonada', icon: <Divide size={13} />, color: 'slate', desc: 'Dispensa/Abono' },
                      { id: 'cancelled_class', label: 'Aula Cancelada', icon: <Ban size={13} />, color: 'red', desc: 'Aula Nula' }
                    ].map(type => (
                          <button
                            key={type.id}
                            type="button"
                            disabled={!(isAdmin || isDirector)}
                            onClick={() => {
                              if (formData.type === type.id) {
                                setFormData({ ...formData, type: 'class_day', title: 'Aula Normal' });
                              } else {
                                const isExcused = type.id === 'excused_class';
                                const isCancelled = type.id === 'cancelled_class';
                                let defaultClassId = formData.class_id;

                                if (isCancelled || isExcused) {
                                  defaultClassId = '';
                                }
                                setFormData({
                                  ...formData, 
                                  type: type.id as any,
                                  title: type.label,
                                  class_id: defaultClassId
                                });
                                if (isCancelled) {
                                  setEditScope('all');
                                } else if (isExcused) {
                                  setEditScope('specific');
                                }
                              }
                            }}
                            className={cn(
                              "relative flex flex-col p-2.5 rounded-none border-2 transition-all text-left group",
                              formData.type === type.id 
                                ? `bg-${type.color === 'red' ? 'rose' : type.color}-50 border-${type.color === 'red' ? 'rose' : type.color}-600 ring-2 ring-${type.color === 'red' ? 'rose' : type.color}-50` 
                                : "bg-white border-slate-100 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 hover:border-slate-200"
                            )}
                          >
                            <div className={cn(
                              "w-7 h-7 rounded-none flex items-center justify-center mb-1.5 transition-transform group-hover:scale-110",
                              formData.type === type.id ? `bg-${type.color === 'red' ? 'rose' : type.color}-600 text-white` : "bg-slate-100 text-slate-400"
                            )}>
                              {type.icon}
                            </div>
                            <p className={cn(
                              "text-[11px] font-bold uppercase tracking-tight leading-tight",
                              formData.type === type.id ? `text-${type.color === 'red' ? 'rose' : type.color}-700` : "text-slate-500"
                            )}>{type.label}</p>
                            <p className="text-[8.5px] font-medium text-slate-400 leading-none mt-0.5">{type.desc}</p>
                            
                            {formData.type === type.id && (
                              <div className={cn(`absolute top-1.5 right-1.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-${type.color === 'red' ? 'rose' : type.color}-600 shadow-sm shadow-${type.color === 'red' ? 'rose' : type.color}-200`)}>
                                <Check size={7} className="text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Datas */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 block mb-1">Período</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <input 
                          required
                          readOnly={!(isAdmin || isDirector)}
                          type="date"
                          value={formData.start_date}
                          onChange={e => {
                            const newDate = e.target.value;
                            let updatedClassId = formData.class_id;
                            if (formData.class_id) {
                              const dayFiltered = getFilteredClassesForDate(newDate);
                              const isValid = dayFiltered.some(c => c.id === formData.class_id);
                              if (!isValid) {
                                updatedClassId = '';
                              }
                            }
                            setFormData({
                              ...formData, 
                              start_date: newDate, 
                              end_date: formData.end_date || newDate,
                              class_id: updatedClassId
                            });
                          }}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-slate-100 focus:bg-white focus:border-slate-400 transition-all outline-none"
                        />
                        <span className="absolute -top-2 left-3 px-1 bg-white text-[7px] font-bold text-slate-400 uppercase border border-slate-100 rounded">Início</span>
                      </div>
                      <div className="relative">
                        <input 
                          readOnly={!(isAdmin || isDirector)}
                          type="date"
                          value={formData.end_date}
                          onChange={e => setFormData({...formData, end_date: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-slate-100 focus:bg-white focus:border-slate-400 transition-all outline-none"
                        />
                        <span className="absolute -top-2 left-3 px-1 bg-white text-[7px] font-bold text-slate-400 uppercase border border-slate-100 rounded">Término</span>
                      </div>
                    </div>
                  </div>

                  {/* Título e Escopo de Aplicação */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Identificação</label>
                      <input 
                        required
                        readOnly={!(isAdmin || isDirector)}
                        type="text"
                        placeholder="Título do evento..."
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-none text-xs font-bold text-slate-700 focus:ring-4 focus:ring-slate-100 focus:bg-white focus:border-slate-400 transition-all outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 block mb-1">Escopo do Registro</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={!(isAdmin || isDirector) || formData.type === 'excused_class'}
                            onClick={() => {
                              setEditScope('all');
                              setFormData(prev => ({ ...prev, class_id: '' }));
                            }}
                            className={cn(
                              "py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider border rounded-none transition-all flex items-center justify-center gap-1.5",
                              editScope === 'all'
                                ? "bg-slate-900 border-slate-900 text-white shadow-md"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100",
                              formData.type === 'excused_class' && "opacity-50 cursor-not-allowed bg-slate-50 border-slate-100 text-slate-300"
                            )}
                          >
                            Período Total
                          </button>
                          <button
                            type="button"
                            disabled={!(isAdmin || isDirector)}
                            onClick={() => {
                              setEditScope('specific');
                              setFormData(prev => ({ ...prev, class_id: '' }));
                            }}
                            className={cn(
                              "py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider border rounded-none transition-all flex items-center justify-center gap-1.5",
                              editScope === 'specific'
                                ? "bg-slate-900 border-slate-900 text-white shadow-md"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
                            )}
                          >
                            Classe / Turma
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                          {editScope === 'all' ? 'Dia de Aula Afetado' : 'Vincular Turma'}
                        </label>
                        {editScope === 'all' ? (
                          <div className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-none text-xs font-bold text-slate-400 cursor-not-allowed uppercase">
                            Todas as Turmas ({getWeekdayName(formData.start_date) || 'Dia Selecionado'})
                          </div>
                        ) : (
                          <select
                            required={editScope === 'specific'}
                            disabled={!(isAdmin || isDirector)}
                            value={formData.class_id}
                            onChange={e => setFormData({...formData, class_id: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-none text-xs font-bold text-slate-700 appearance-none focus:ring-4 focus:ring-slate-100 focus:bg-white focus:border-slate-400 transition-all outline-none"
                          >
                            <option value="">Selecione a Turma...</option>
                            {getFilteredClassesForDate(formData.start_date, formData.class_id).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex gap-2 pt-2 border-t border-slate-50 shrink-0">
                  {selectedEvent && (isAdmin || isDirector) && (
                    <button 
                      type="button"
                      onClick={() => handleDelete(selectedEvent.id)}
                      className="p-3 rounded-none transition-all border bg-white text-red-500 border-red-100 hover:bg-red-50 hover:border-red-200 shadow-sm"
                      title="Excluir Lançamento"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-500 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                  >
                    Fechar
                  </button>

                  {(isAdmin || isDirector) && (
                    <button 
                      type="submit"
                      disabled={isSyncing || !isFormChanged}
                      className={cn(
                        "flex-[2] py-3 px-4 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                        (isSyncing || !isFormChanged)
                          ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                          : "bg-slate-800 text-white hover:bg-slate-900 shadow-xl"
                      )}
                    >
                      {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {selectedEvent ? 'Confirmar' : 'Criar'}
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
              className="bg-white lg:max-w-4xl max-w-2xl w-full h-auto max-h-[96vh] md:max-h-[90vh] lg:max-h-[85vh] rounded-none shadow-2xl overflow-hidden border border-slate-200 flex flex-col"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 relative bg-white shrink-0">
                <button 
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="absolute top-4 right-5 p-2 hover:bg-slate-50 rounded transition-all text-slate-400"
                >
                  <X size={18} />
                </button>
                
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-50 text-slate-600 rounded flex items-center justify-center border border-slate-100">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">Parâmetros do Calendário Escolar</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest -mt-1">Ajuste de Aulas Recorrentes Semanais e Semestres</p>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto px-6 py-4 bg-slate-50/30">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  
                  {/* Left Column (5 cols): Weekday selection and Term Date Parameters */}
                  <div className="lg:col-span-5 space-y-4">
                    {/* 1. SELEÇÃO DO DIA DA SEMANA */}
                    <div className="space-y-2">
                      <div className="space-y-0.5">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-0.5 block">Dias de Aula no Calendário</h4>
                        <p className="text-[11px] text-slate-500 pl-0.5">Selecione o dia da semana para configurar.</p>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day, i) => {
                          const isSelected = settingsForm.class_weekdays.includes(i);
                          const isAlreadyRegistered = (academicSettings.class_weekdays || [])
                            .some(x => Number(x) === i);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                const data = getWeekdayData(i);
                                setSettingsForm({
                                  ...settingsForm,
                                  class_weekdays: [i],
                                  weekday_titles: {
                                    ...(settingsForm.weekday_titles || {}),
                                    [i]: data.title || (settingsForm.weekday_titles || {})[i] || ''
                                  },
                                  target_class_ids: data.classIds
                                });
                                setEditingDayIndex(i);
                                setSelectedWeekdayDetail(i);
                              }}
                              className={cn(
                                "py-2 px-1.5 rounded-none border flex flex-col items-center gap-1 transition-all relative",
                                isSelected 
                                  ? "bg-slate-900 text-white border-slate-900 shadow-md z-10" 
                                  : isAlreadyRegistered
                                    ? "bg-indigo-50/50 text-indigo-750 border-indigo-200 hover:border-indigo-300"
                                    : "bg-white text-slate-500 border-slate-100 hover:border-slate-200"
                              )}
                            >
                              <span className="text-[9px] font-bold uppercase tracking-wider">{day}</span>
                              <div className={cn(
                                "w-1 h-1 rounded-full",
                                isSelected ? "bg-blue-400" : isAlreadyRegistered ? "bg-indigo-600 animate-pulse" : "bg-slate-200"
                              )} />
                              {isAlreadyRegistered && (
                                <span className="absolute top-0.5 right-0.5 text-[6px] text-indigo-600 font-bold uppercase tracking-tighter">
                                  REGR
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3. PERÍODOS LETIVOS GERAIS DO ANO */}
                    <div className="border border-slate-200 bg-white p-3.5 space-y-3">
                      <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Períodos Letivos Gerais</h4>
                        <p className="text-[10px] text-slate-500 leading-none">Principais marcos das aulas anuais.</p>
                      </div>

                      <div className="space-y-3">
                        {[
                          { term: 1, label: '1º Semestre' },
                          { term: 2, label: '2º Semestre' }
                        ].map((t) => (
                          <div key={t.term} className="space-y-1.5 pb-2 last:pb-0 border-b border-slate-100 last:border-b-0">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">{t.label}</span>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="text-[7px] font-bold text-slate-400 uppercase block">Início</label>
                                <input 
                                  type="date" 
                                  value={t.term === 1 ? (settingsForm.term1_start || '') : (settingsForm.term2_start || '')}
                                  onChange={e => setSettingsForm({
                                    ...settingsForm, 
                                    [t.term === 1 ? 'term1_start' : 'term2_start']: e.target.value
                                  })}
                                  className="w-full bg-slate-50 border border-slate-100 rounded-none py-1.5 px-2 text-xs font-bold text-slate-600 focus:bg-white focus:border-slate-300 outline-none transition-all"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <label className="text-[7px] font-bold text-slate-400 uppercase block">Término</label>
                                <input 
                                  type="date" 
                                  value={t.term === 1 ? (settingsForm.term1_end || '') : (settingsForm.term2_end || '')}
                                  onChange={e => setSettingsForm({
                                    ...settingsForm, 
                                    [t.term === 1 ? 'term1_end' : 'term2_end']: e.target.value
                                  })}
                                  className="w-full bg-slate-50 border border-slate-100 rounded-none py-1.5 px-2 text-xs font-bold text-slate-600 focus:bg-white focus:border-slate-300 outline-none transition-all"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column (7 cols): Weekday Title parameter & Class matching selection */}
                  <div className="lg:col-span-7 space-y-3">
                    {settingsForm.class_weekdays.length > 0 && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        {/* Status de Registro Existente com Ação Rápida de Excluir */}
                        {academicSettings.class_weekdays.includes(settingsForm.class_weekdays[0]) && (
                          <div className="bg-emerald-50 border border-emerald-100/80 p-2.5 rounded-none flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 block" />
                              <span className="font-bold text-slate-800 text-[10px] uppercase block">Dia Ativado no Calendário</span>
                            </div>
                            
                            <button
                              type="button"
                              onClick={async () => {
                                const activeDay = settingsForm.class_weekdays[0];
                                setIsSyncing(true);
                                try {
                                  const updatedWeekdays = academicSettings.class_weekdays.filter(x => x !== activeDay);
                                  const updatedTitles = { ...academicSettings.weekday_titles };
                                  delete updatedTitles[activeDay];
                                  delete updatedTitles[String(activeDay)];

                                  const updatedClasses = { ...academicSettings.weekday_classes };
                                  delete updatedClasses[activeDay];
                                  delete updatedClasses[String(activeDay)];

                                  const updatedSettings = {
                                    ...academicSettings,
                                    class_weekdays: updatedWeekdays,
                                    weekday_titles: updatedTitles,
                                    weekday_classes: updatedClasses
                                  };
                                  await saveData('academic_settings', 'current', updatedSettings);
                                  setAcademicSettings(updatedSettings);
                                  
                                  // Switch view or set remaining
                                  const firstRemainingDay = updatedWeekdays.length > 0 ? updatedWeekdays[0] : 3;
                                  const weekdayName = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][firstRemainingDay];
                                  const defaultTitle = `Aula, Classe(s) Turma(s) de ${weekdayName}`;
                                  
                                  const rTitle = (updatedSettings.weekday_titles || {})[firstRemainingDay] || (updatedSettings.weekday_titles || {})[String(firstRemainingDay)] || defaultTitle;
                                  const rClasses = (updatedSettings.weekday_classes || {})[firstRemainingDay] || (updatedSettings.weekday_classes || {})[String(firstRemainingDay)] || [];

                                  setSettingsForm({
                                    ...updatedSettings,
                                    class_weekdays: [firstRemainingDay],
                                    weekday_titles: {
                                      ...(updatedSettings.weekday_titles || {}),
                                      [firstRemainingDay]: rTitle
                                    },
                                    target_class_ids: rClasses
                                  });
                                  setEditingDayIndex(firstRemainingDay);

                                  await clearClassDays([activeDay]);
                                  setNotification({ type: 'success', message: 'Exclusão concluída e novas aulas removidas do calendário!' });
                                } catch (err) {
                                  console.error("Error deleting day:", err);
                                  setNotification({ type: 'err', message: 'Falha durante a exclusão.' });
                                } finally {
                                  setIsSyncing(false);
                                }
                              }}
                              disabled={isSyncing}
                              className="bg-red-650 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-none text-[8px] uppercase tracking-wider transition-all shrink-0 flex items-center gap-1 disabled:opacity-50"
                            >
                              <Trash2 size={10} />
                              Excluir Registro
                            </button>
                          </div>
                        )}

                        {/* CONFIGURAÇÕES DO EVENTO DESTE DIA */}
                        <div className="bg-white p-4 border border-slate-200/85 space-y-3">
                          {/* Campo Título */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                Título da Aula para {['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][settingsForm.class_weekdays[0]]}
                              </label>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                {(((settingsForm.weekday_titles || {})[settingsForm.class_weekdays[0]] !== undefined 
                                  ? (settingsForm.weekday_titles || {})[settingsForm.class_weekdays[0]] 
                                  : (settingsForm.weekday_titles || {})[String(settingsForm.class_weekdays[0])]) || '').length}/45
                              </span>
                            </div>
                            <input 
                              type="text"
                              maxLength={45}
                              placeholder={`Ex: Aula, Classe(s) Turma(s) de ${['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][settingsForm.class_weekdays[0]]}...`}
                              value={(settingsForm.weekday_titles || {})[settingsForm.class_weekdays[0]] !== undefined 
                                ? (settingsForm.weekday_titles || {})[settingsForm.class_weekdays[0]] 
                                : ((settingsForm.weekday_titles || {})[String(settingsForm.class_weekdays[0])] || '')}
                              onChange={(e) => setSettingsForm({
                                ...settingsForm,
                                weekday_titles: { 
                                  ...(settingsForm.weekday_titles || {}), 
                                  [settingsForm.class_weekdays[0]]: e.target.value 
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-none py-1.5 px-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-slate-100 focus:bg-white focus:border-slate-300 transition-all font-sans"
                            />
                          </div>

                          {/* Lista de Turmas Integrada no mesmo bloco */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                                Turmas Vinculadas a este dia
                              </label>
                              <div className="flex gap-2">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setSettingsForm({ ...settingsForm, target_class_ids: classes.map(c => c.id) });
                                  }}
                                  className="text-[9px] font-bold text-slate-800 uppercase tracking-wider hover:underline"
                                >
                                  Toda Turma
                                </button>
                                <span className="text-slate-200">|</span>
                                <button 
                                  type="button"
                                  onClick={() => setSettingsForm({ ...settingsForm, target_class_ids: [] })}
                                  className="text-[9px] font-bold text-slate-400 uppercase tracking-wider hover:underline"
                                >
                                  Limpar
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-1 border border-slate-100 p-2 bg-slate-50/50">
                              {classes.length === 0 ? (
                                <div className="w-full py-2 text-center">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhuma turma ativa encontrada</p>
                                </div>
                              ) : (
                                classes.map((c) => {
                                  const isSelected = settingsForm.target_class_ids.includes(c.id);
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
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
                                        "inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold border transition-all rounded-full",
                                        isSelected 
                                          ? "bg-slate-900 border-slate-900 text-white shadow-sm" 
                                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                                      )}
                                    >
                                      <div className={cn(
                                        "w-1 h-1 rounded-full transition-all",
                                        isSelected ? "bg-emerald-400" : "bg-slate-300"
                                      )} />
                                      <span>{c.name}</span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="px-6 py-3.5 bg-white border-t border-slate-100 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-1.5 text-slate-450 hover:text-slate-650 text-[10px] font-bold uppercase tracking-wider"
                  >
                    Fechar Ajustes
                  </button>
                  
                  <button 
                    onClick={async () => {
                      const t1Start = parseDateToDB(settingsForm.term1_start) || '';
                      const t1End = parseDateToDB(settingsForm.term1_end) || '';
                      const t2Start = parseDateToDB(settingsForm.term2_start) || '';
                      const t2End = parseDateToDB(settingsForm.term2_end) || '';

                      if (settingsForm.class_weekdays.length === 0) {
                        setNotification({ type: 'err', message: 'Selecione um dia da semana para configurar.' });
                        return;
                      }

                      if (settingsForm.target_class_ids.length === 0) {
                        setNotification({ type: 'err', message: 'Selecione pelo menos uma turma para as aulas deste dia.' });
                        return;
                      }

                      setIsSyncing(true);
                      try {
                        const currentWeekdays = Array.isArray(academicSettings.class_weekdays)
                          ? academicSettings.class_weekdays
                          : [];
                        const activeDay = settingsForm.class_weekdays[0];
                        
                        const nextWeekdays = currentWeekdays.includes(activeDay)
                          ? currentWeekdays
                          : [...currentWeekdays, activeDay];

                        const nextTitles = {
                          ...(academicSettings.weekday_titles || {}),
                          [activeDay]: (settingsForm.weekday_titles || {})[activeDay] || `Aula, Classe(s) Turma(s) de ${['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][activeDay]}`
                        };

                        const nextWeekdayClasses = {
                          ...(academicSettings.weekday_classes || {}),
                          [activeDay]: settingsForm.target_class_ids || []
                        };

                        const updatedSettings: AcademicSettings = {
                          id: 'current',
                          term1_start: t1Start,
                          term1_end: t1End,
                          term2_start: t2Start,
                          term2_end: t2End,
                          class_weekdays: nextWeekdays.map(Number),
                          weekday_titles: nextTitles,
                          target_class_ids: settingsForm.target_class_ids,
                          weekday_classes: nextWeekdayClasses
                        };
                        
                        // Salva globalmente e para cada turma selecionada para garantir persistência
                        await saveData('academic_settings', 'current', updatedSettings);
                        for (const cid of settingsForm.target_class_ids) {
                          await saveData('academic_settings', cid, updatedSettings);
                        }

                        setAcademicSettings(updatedSettings);
                        await generateClassDays(updatedSettings);

                        setShowSettings(false);
                        setNotification({ type: 'success', message: 'Registro anual e todas as aulas semanais sincronizados com sucesso!' });
                      } catch (error) {
                        console.error("Error saving:", error);
                        setNotification({ type: 'err', message: 'Falha ao salvar os parâmetros do calendário.' });
                      } finally {
                        setIsSyncing(false);
                      }
                    }}
                    disabled={isSyncing}
                    className="px-5 py-2.5 bg-slate-900 text-white rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 disabled:opacity-50 shadow-md shadow-slate-100"
                  >
                    {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Salvar e Atualizar Calendário
                  </button>
                </div>

                {(isAdmin || isDirector) && (
                  <div className="flex gap-2 pt-1.5 border-t border-slate-100/60 mt-1">
                    <button 
                      onClick={() => clearClassDays()}
                      disabled={isSyncing}
                      className="flex-1 py-1.5 text-red-500 hover:bg-red-50 rounded border border-transparent hover:border-red-150 text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                      Excluir Aulas Gerais
                    </button>
                    <button 
                      onClick={async () => {
                        setIsSyncing(true);
                        setSyncMessage('Sincronizando feriados com API nacional...');
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
                      className="flex-1 py-1.5 text-slate-400 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100/85 text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw size={11} />
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
              className="bg-white max-w-sm w-full rounded-none shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8 text-center space-y-6">
                <div className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner",
                  confirmModalConfig.type === 'danger' ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-800"
                )}>
                  {confirmModalConfig.type === 'danger' ? <Trash2 size={32} /> : <Info size={32} />}
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">{confirmModalConfig.title}</h3>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed">
                      {confirmModalConfig.message}
                    </p>
                  </div>

                  {confirmModalConfig.id === 'clear_classes' && (
                    <div className="flex flex-wrap justify-center gap-2 py-2">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => {
                        const isSelected = selectedDaysToDelete.includes(i);
                        return (
                          <button
                            key={`${day}-${i}`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedDaysToDelete(selectedDaysToDelete.filter(d => d !== i));
                              } else {
                                setSelectedDaysToDelete([...selectedDaysToDelete, i]);
                              }
                            }}
                            className={cn(
                              "px-3 py-2 rounded-none flex items-center justify-center text-[9px] font-bold uppercase transition-all shadow-sm border",
                              isSelected 
                                ? "bg-red-600 border-red-600 text-white shadow-red-100" 
                                : "bg-white border-slate-100 text-slate-400"
                            )}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => {
                      setShowConfirmModal(false);
                      setIsClassDeletionMode(false);
                    }}
                    className="py-4 bg-slate-50 text-slate-400 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      if (confirmModalConfig.id === 'clear_classes') {
                        if (selectedDaysToDelete.length === 0) {
                          setNotification({ type: 'err', message: 'Selecione ao menos um dia para excluir.' });
                          return;
                        }
                        clearClassDays(selectedDaysToDelete);
                      } else {
                        confirmModalConfig.action();
                      }
                    }}
                    className={cn(
                      "py-4 text-white rounded-none text-[10px] font-bold uppercase tracking-widest shadow-lg transition-all active:scale-95",
                      confirmModalConfig.type === 'danger' ? "bg-red-600 hover:bg-red-700 shadow-red-100" : "bg-slate-800 hover:bg-slate-900 shadow-none"
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
              className="bg-white rounded-none p-8 max-w-2xl w-full shadow-2xl border border-slate-100"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-slate-50 text-slate-800 rounded-none">
                    <Printer size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tighter leading-none">Centro de Impressão</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Selecione o formato de relatório desejado</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowPrintOptions(false);
                    setPrintType(null);
                  }}
                  className="p-2 hover:bg-slate-50 rounded-none transition-all"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {[
                  { id: 'class_schedule', title: 'Relatório de Aulas', icon: FileDown, desc: 'Lista mensal filtrável por turma e dia.' },
                  { id: 'holiday_list', title: 'Lista de Feriados', icon: Bookmark, desc: 'Listagem completa dos feriados nacionais e locais.' },
                  { id: 'annual_poster', title: 'Pôster Anual', icon: Target, desc: 'Grade compacta de 12 meses em página única.' },
                  { id: 'monthly_grid', title: 'Grade Mensal', icon: LayoutGrid, desc: 'Visualização clássica do mês selecionado.' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setPrintType(option.id as any)}
                    className={cn(
                      "p-6 rounded-none border-2 transition-all text-left flex flex-col gap-3 group",
                      printType === option.id 
                        ? "bg-slate-800 border-blue-600 text-white shadow-xl shadow-none scale-105" 
                        : "bg-slate-50 border-slate-100 hover:border-slate-300 text-slate-600"
                    )}
                  >
                    <option.icon size={24} className={printType === option.id ? "text-white" : "text-slate-700"} />
                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-widest leading-tight">{option.title}</h3>
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
                  className="space-y-4 p-6 bg-slate-50 rounded-none border border-slate-100 mb-8"
                >
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Filter size={14} /> Filtros de Relatório
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Turma Específica</label>
                      <select 
                        value={printFilters.class_id}
                        onChange={(e) => setPrintFilters(prev => ({ ...prev, class_id: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-none px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100"
                      >
                        <option value="all">Todas as Turmas Ativas</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Período de Exibição</label>
                      <select 
                        value={printFilters.month}
                        onChange={(e) => setPrintFilters(prev => ({ ...prev, month: e.target.value === 'all' ? 'all' : parseInt(e.target.value) }))}
                        className="w-full bg-white border border-slate-200 rounded-none px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100"
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
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Dia da Semana</label>
                      <select 
                        value={printFilters.weekday}
                        onChange={(e) => setPrintFilters(prev => ({ ...prev, weekday: e.target.value === 'all' ? 'all' : parseInt(e.target.value) }))}
                        className="w-full bg-white border border-slate-200 rounded-none px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100"
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
                  className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  disabled={!printType}
                  onClick={() => {
                    try {
                      window.print();
                    } catch (err) {
                      console.error("Print failed:", err);
                      setNotification({
                        type: 'err',
                        message: 'A impressão direta é bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba (botão no canto superior direito) para imprimir com sucesso.'
                      });
                    }
                  }}
                  className="flex-3 py-4 px-6 bg-slate-800 text-white rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-900 shadow-xl shadow-none transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
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
                          {institution?.city_uf || ''} {institution?.cnpj ? `• CNPJ: ${institution.cnpj}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col justify-center">
                      <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-widest">
                        {printType === 'class_schedule' ? 'Cronograma Acadêmico' : 
                         printType === 'holiday_list' ? 'Listagem de Feriados' :
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
                  const isAcademic = ['class_day', 'start_term', 'end_term', 'exam', 'holiday', 'excused_class', 'cancelled_class'].includes(e.type);
                  const isGlobal = !e.class_id;
                  const matchesClass = printFilters.class_id === 'all' || e.class_id === printFilters.class_id || isGlobal;
                  const matchesWeekday = printFilters.weekday === 'all' || new Date(e.start_date + 'T00:00:00').getDay() === printFilters.weekday;
                  return isAcademic && matchesClass && matchesWeekday;
                });

                if (autoEvents.length === 0) return null;
                
                // Calculation of unique lessons (Only class_day, exam and excused_class)
                const groupedCount = (() => {
                  const uniqueSet = new Set();
                  autoEvents.forEach(e => {
                    if (['class_day', 'exam', 'excused_class'].includes(e.type)) {
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
                            <div key={`print-row-${month}-${dateStr}`} className="avoid-break grid grid-cols-[50px,1fr] gap-4 py-2 items-start">
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
                                    const isHoliday = event.type === 'holiday' || event.type?.includes('holiday') || event.title.toLowerCase().includes('férias') || event.title.toLowerCase().includes('feriado');
                                    const isCancelled = event.type === 'cancelled_class';
                                    
                                    const cleanTitle = (t: string) => t
                                      .replace(/\[METADATA:\{[\s\S]*?\}\]/g, '')
                                      .replace(/\[SUBJECTS:\[[\s\S]*?\]\]/g, '')
                                      .replace(/\s*[\]\}]\]\s*$/g, '')
                                      .replace(/^Dia de Aula - /, '')
                                      .trim();
                                    
                                    let displayTitle = cleanTitle(event.title);

                                    return (
                                      <div key={event.id} className={cn("flex items-center justify-between gap-2 p-1 rounded", (isHoliday || isCancelled) && "bg-slate-50 border border-slate-200")}>
                                        <div className="flex-1 min-w-0">
                                          <p className={cn(
                                            "text-[10px] font-bold leading-tight", 
                                            isImportant ? "text-amber-700" : 
                                            isHoliday ? "text-slate-500 italic" : 
                                            isCancelled ? "text-rose-400 line-through" :
                                            "text-slate-800"
                                          )}>
                                            {displayTitle}
                                          </p>
                                          <p className="text-[8px] font-medium text-slate-500 uppercase tracking-tight leading-normal">
                                            {sortedClassNames.join(', ')} {event.description && !event.description.includes('automático') && ` • ${event.description.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').trim()}`}
                                          </p>
                                        </div>
                                        <div className={cn(
                                          "text-[7px] font-bold px-1.5 py-0 rounded border uppercase shrink-0",
                                          event.type === 'class_day' ? "bg-slate-50 text-slate-800 border-slate-200" :
                                          event.type === 'exam' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                          event.type === 'start_term' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                          event.type === 'excused_class' ? "bg-slate-100 text-slate-500 border-slate-200" :
                                          event.type === 'cancelled_class' ? "bg-rose-50 text-rose-400 border-rose-100" :
                                          isHoliday ? "bg-slate-200 text-slate-600 border-slate-300" :
                                          "bg-slate-50 text-slate-500 border-slate-200"
                                        )}>
                                          {event.type === 'class_day' ? 'Aula Regular' : 
                                           event.type === 'exam' ? 'Prova' : 
                                           event.type === 'start_term' ? 'Início' : 
                                           event.type === 'excused_class' ? 'Abonada' :
                                           event.type === 'cancelled_class' ? 'Cancelada' :
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
                const yearLessons = events
                  .filter(e => 
                    e.start_date.startsWith(currentDate.getFullYear().toString()) &&
                    e.class_id === printFilters.class_id && 
                    ['class_day', 'exam', 'excused_class'].includes(e.type) &&
                    !events.some(h => (h.type?.includes('holiday') || h.type === 'cancelled_class') && h.start_date === e.start_date)
                  )
                  .sort((a, b) => a.start_date.localeCompare(b.start_date));

                const specificCount = autoEvents.filter(e => ['class_day', 'exam', 'excused_class'].includes(e.type)).length;

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
                        
                        const lessonIdx = yearLessons.findIndex(l => l.id === event.id);
                        const lessonNumber = lessonIdx !== -1 ? lessonIdx + 1 : null;

                        return (
                          <div key={event.id} className={cn("avoid-break grid grid-cols-[50px,1fr] gap-4 py-2 items-start", isHoliday && "bg-slate-50 px-2 rounded")}>
                            <div className="flex flex-col items-center justify-center border-r border-slate-100 pr-2">
                              <span className="text-base font-bold text-slate-900 leading-none">{date.getDate()}</span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase">{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  {lessonNumber && (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[7px] font-bold uppercase shrink-0">Aula {lessonNumber}</span>
                                  )}
                                  <p className={cn("text-[10px] font-bold whitespace-normal break-words leading-tight", isImportant ? "text-amber-800" : isHoliday ? "text-slate-600 italic" : "text-slate-700")}>
                                    {event.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').trim()}
                                  </p>
                                </div>
                                <p className="text-[8px] font-medium text-slate-400 uppercase">
                                  {event.type === 'class_day' ? 'Aula Regular' : 
                                   event.type === 'exam' ? 'Avaliação' : 
                                   event.type === 'excused_class' ? 'Aula Abonada' :
                                   event.type === 'cancelled_class' ? 'Aula Cancelada' :
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

          {/* Relatório: Listagem de Feriados */}
          {printType === 'holiday_list' && (
            <HolidayListReport 
              holidays={(() => {
                const currentYear = currentDate.getFullYear().toString();
                let holidays = events.filter(e => {
                  const isHoliday = e.type?.includes('holiday');
                  const inYear = e.start_date.startsWith(currentYear);
                  // Excluir explicitamente Santo Antônio e Dia do Servidor conforme solicitado
                  const titleLower = e.title?.toLowerCase() || '';
                  const isExcl = titleLower.includes('santo antônio') || titleLower.includes('servidor público');
                  return isHoliday && inYear && !isExcl;
                });
                
                const hasSP = holidays.some(h => h.start_date.endsWith('-01-25'));
                if (!hasSP) {
                  holidays.push({
                    id: 'manual-sp-h',
                    title: "Aniv. de São Paulo",
                    start_date: `${currentYear}-01-25`,
                    type: 'holiday_est'
                  } as CalendarEvent);
                }
                return holidays.sort((a, b) => a.start_date.localeCompare(b.start_date));
              })()}
              currentYear={currentDate.getFullYear().toString()}
              institution={institution}
              currentDate={currentDate}
            />
          )}

          {/* Relatório 2: Pôster Anual */}
          {printType === 'annual_poster' && (
            <div className="flex flex-col h-full max-h-[85vh]">
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 mb-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthIndex => (
                  <div key={`poster-${monthIndex}`} className="avoid-break p-2 border-2 border-slate-100 rounded-none bg-white shadow-sm">
                    <h4 className="text-[9px] font-bold text-center uppercase tracking-[0.15em] mb-1.5 border-b border-slate-50 pb-0.5 text-slate-900">
                      {new Date(currentDate.getFullYear(), monthIndex).toLocaleDateString('pt-BR', { month: 'long' })}
                    </h4>
                    <div className="grid grid-cols-7 gap-0.5">
                      {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                        <div key={`header-${monthIndex}-${d}-${i}`} className="text-center text-[6px] font-bold text-slate-300">{d}</div>
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
                        const isCancelled = dayEvents.some(e => e.type === 'cancelled_class');
                        const wDay = getWeekdayIndex(dateStr);

                        let bgColor = "bg-transparent";
                        let textColor = "text-slate-400";
                        let borderColor = "border-transparent";
                        let stripeStyle = "";

                        if (isNational) { bgColor = "bg-red-600"; textColor = "text-white"; borderColor = "border-red-700"; stripeStyle = "bg-stripes-red"; }
                        else if (isState) { bgColor = "bg-purple-600"; textColor = "text-white"; borderColor = "border-purple-700"; stripeStyle = "bg-stripes-red"; }
                        else if (isMunicipal) { bgColor = "bg-orange-600"; textColor = "text-white"; borderColor = "border-orange-700"; stripeStyle = "bg-stripes-red"; }
                        else if (isHolidayGeneral) { bgColor = "bg-red-500"; textColor = "text-white"; borderColor = "border-red-600"; stripeStyle = "bg-stripes-red"; }
                        else if (isClass) {
                          if (wDay === 3) {
                            bgColor = "bg-sky-50"; textColor = "text-sky-800"; borderColor = "border-sky-200";
                          } else if (wDay === 4) {
                            bgColor = "bg-amber-50"; textColor = "text-amber-800"; borderColor = "border-amber-200";
                          } else {
                            bgColor = "bg-blue-400"; textColor = "text-white"; borderColor = "border-slate-400";
                          }
                        }
                        else if (isVacation) { bgColor = "bg-slate-50"; textColor = "text-slate-600"; borderColor = "border-slate-100"; stripeStyle = "bg-stripes-slate"; }
                        else if (isExam) { bgColor = "bg-amber-400"; textColor = "text-white"; borderColor = "border-amber-500"; }
                        else if (isStart) { bgColor = "bg-slate-800"; textColor = "text-white"; borderColor = "border-blue-700"; }
                        else if (isEnd) { bgColor = "bg-slate-900"; textColor = "text-white"; borderColor = "border-slate-950"; }
                        else if (dayEvents.length > 0) { bgColor = "bg-slate-100"; textColor = "text-slate-700"; borderColor = "border-slate-200"; }

                        return (
                          <div 
                            key={`${monthIndex}-${day}`}
                            className={cn(
                              "aspect-square flex items-center justify-center rounded-sm text-[7.5px] font-bold border transition-all overflow-hidden relative",
                              bgColor, textColor, borderColor, stripeStyle,
                              isStart && "ring-1 ring-inset ring-slate-800 border-slate-800 border-[1.2px] font-extrabold shadow-sm",
                              isEnd && "ring-1 ring-inset ring-slate-900 border-slate-900 border-[1.2px] font-extrabold shadow-sm"
                            )}
                          >
                            {day}
                            {isCancelled && (
                              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 select-none">
                                <svg className="w-full h-full stroke-rose-500/60" viewBox="0 0 100 100" preserveAspectRatio="none">
                                  <line x1="15" y1="15" x2="85" y2="85" strokeWidth="12" strokeLinecap="round" />
                                  <line x1="85" y1="15" x2="15" y2="85" strokeWidth="12" strokeLinecap="round" />
                                </svg>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              
                  {/* Legenda Estilo Screenshot Detalhada - No Rodapé */}
                  <div className="mt-4 border-t border-slate-200 pt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-none bg-red-50 border border-red-100 bg-stripes-red shadow-sm" />
                      <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">Feriado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-none bg-sky-50 border border-sky-100 shadow-sm" />
                      <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">Quarta-feira (Azul)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-none bg-amber-50 border border-amber-100 shadow-sm" />
                      <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">Quinta-feira (Laranja)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-none bg-amber-400 border border-amber-500 shadow-sm" />
                      <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">Avaliação</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-none border-[1.2px] border-slate-800 ring-1 ring-inset ring-slate-800 bg-white shadow-sm" />
                      <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">Início/Final de Semestre</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-none bg-white border border-slate-200 relative shadow-sm overflow-hidden flex items-center justify-center text-[7px]">
                        X
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-full h-full stroke-rose-500" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <line x1="15" y1="15" x2="85" y2="85" strokeWidth="15" strokeLinecap="round" />
                            <line x1="85" y1="15" x2="15" y2="85" strokeWidth="15" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>
                      <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">Cancelada</span>
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
                    <h2 className="text-2xl font-bold text-center uppercase tracking-[0.3em] mb-6 text-slate-800 print:text-xl">
                      {monthName}
                    </h2>
                    
                    <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 shadow-sm rounded-none overflow-hidden">
                      {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(day => (
                        <div key={day} className="bg-slate-50 py-4 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200">{day}</div>
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
                        const isHolidayGrid = dayEvents.some(e => {
                          const isH = e.type?.includes('holiday');
                          if (!isH) return false;
                          const titleLower = e.title?.toLowerCase() || '';
                          // Exclude facultative holidays from stripes if they are not blocking
                          return !['servidor público', 'santo antônio', 'dia do professor'].some(nb => titleLower.includes(nb));
                        });
                        
                        const hasClassDay = dayEvents.some(e => e.type === 'class_day');
                        const isCancelled = dayEvents.some(e => e.type === 'cancelled_class');
                        const wDay = getWeekdayIndex(dateStr);
                        const classDayBg = hasClassDay
                          ? (wDay === 3 ? "bg-sky-50/65" : wDay === 4 ? "bg-amber-50/65" : "")
                          : "";

                        return (
                          <div 
                            key={`grid-day-${monthIndex}-${day}`} 
                            className={cn(
                              "min-h-[125px] print:min-h-[115px] p-2 border-r border-b border-slate-100 overflow-visible relative group/day hover:bg-slate-50/50 hover:z-50 transition-all",
                              !isVacation && !isHolidayGrid && !classDayBg ? "bg-white" : "",
                              classDayBg,
                              isVacation && "bg-stripes-slate",
                              isHolidayGrid && "bg-stripes-red"
                            )}
                          >
                            <span className="text-[14px] font-bold text-slate-900">{day}</span>
                            
                            {isCancelled && (
                              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 select-none">
                                <svg className="w-full h-full stroke-rose-500/30" viewBox="0 0 100 100" preserveAspectRatio="none">
                                  <line x1="15" y1="15" x2="85" y2="85" strokeWidth="6" strokeLinecap="round" />
                                  <line x1="85" y1="15" x2="15" y2="85" strokeWidth="6" strokeLinecap="round" />
                                </svg>
                              </div>
                            )}

                            <div className="mt-1 space-y-0.5">
                      {dayEvents.map(e => {
                        const titleLower = e.title?.toLowerCase() || '';
                        const isFacultative = ['servidor público', 'santo antônio', 'dia do professor', 'consciência negra'].some(nb => titleLower.includes(nb));
                        const isHoliday = !isFacultative && (e.type?.includes('holiday') || e.title?.toLowerCase().includes('férias') || e.title?.toLowerCase().includes('feriado') || e.title?.toLowerCase().includes('recesso'));
                        const isExam = e.type === 'exam';
                        const cls = classes.find(c => c.id === e.class_id);
                        const sbj = subjects.find(s => s.id === e.subject_id);
                        
                        return (
                          <div 
                            key={e.id} 
                            className={cn(
                              "relative group text-[8px] font-bold p-0.5 rounded border leading-[1.1] whitespace-normal break-words shadow-sm transition-all hover:scale-[1.02] hover:shadow-md hover:z-50 cursor-help",
                              isHoliday ? "bg-red-500 text-white border-red-600" : 
                              isExam ? "bg-orange-500 text-white border-orange-600" :
                              isFacultative ? "bg-slate-500 text-white border-indigo-600" :
                              e.type === 'cancelled_class' ? "bg-rose-50 text-rose-500 border-rose-300 line-through" :
                              e.type === 'excused_class' ? "bg-slate-100 text-slate-500 border-slate-300" :
                              wDay === 3 ? "bg-sky-600 text-white border-sky-700" :
                              wDay === 4 ? "bg-amber-600 text-white border-amber-700" :
                              "bg-blue-400 text-white border-slate-400"
                            )}
                          >
                            {(e.title || '').replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').replace(/^Aula - /, '').replace(/^Aula Normal - /, '').split(' - ')[0].trim()}

                            {/* Tooltip Detalhado */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max max-w-[200px] z-[100] pointer-events-none hidden group-hover:block animate-in fade-in zoom-in duration-200">
                              <div className="bg-white border border-slate-200 shadow-xl rounded-none p-3 text-[10px] font-bold text-slate-700 whitespace-normal leading-tight ring-4 ring-black/5">
                                <div className="text-slate-800 mb-2 border-b border-blue-50 pb-1.5 flex items-center gap-2">
                                  <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isHoliday ? "bg-red-500" : isExam ? "bg-orange-500" : "bg-slate-500")} />
                                  <span className="truncate max-w-[160px]">
                                    {e.title.replace(/\[METADATA:\{[\s\S]*?\}\]/g, '').replace(/\s*[\]\}]\]\s*$/g, '').replace(/^Dia de Aula - /, '').replace(/^Aula - /, '').replace(/^Aula Normal - /, '').split(' - ')[0].trim()}
                                  </span>
                                </div>
                                <div className="space-y-1.5 text-slate-600">
                                  {(() => {
                                    const norm = (t: string) => t
                                      .replace(/^Dia de Aula - /, '')
                                      .replace(/^Aula - /, '')
                                      .replace(/^Aula Normal - /, '')
                                      .split(' - ')[0]
                                      .trim();
                                    
                                    const normalizedTitle = norm(e.title);
                                    const relatedEvents = rawDayEvents.filter(re => norm(re.title) === normalizedTitle && re.type === e.type);
                                    
                                    const uniqueClassIds = Array.from(new Set(relatedEvents.map(re => re.class_id).filter(Boolean)));
                                    const relatedClasses = uniqueClassIds.map(id => classes.find(c => c.id === id)).filter(Boolean);
                                    
                                    return (
                                      <>
                                        {relatedClasses.length > 0 && (
                                          <div className="flex flex-col gap-0.5 text-[9px] text-slate-500 leading-normal">
                                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px] flex items-center gap-1">
                                              <School size={8} /> {relatedClasses.length > 1 ? 'Turmas' : 'Turma'}
                                            </span>
                                            <span className="text-slate-800 font-bold">
                                              {relatedClasses.map(c => c!.name).join(', ')}
                                            </span>
                                          </div>
                                        )}
                                        {sbj && (
                                          <div className="flex items-center gap-2 border-t border-slate-50 pt-1.5">
                                            <BookOpen size={10} className="text-slate-400" />
                                            <span className="truncate">{sbj.name}</span>
                                          </div>
                                        )}
                                        {e.description && (
                                          <div className="text-slate-400 font-medium text-[9px] mt-1.5 border-t border-slate-50 pt-1.5 leading-snug italic">
                                            {e.description}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                              {/* Seta do Tooltip */}
                              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-r border-b border-slate-200 rotate-45" />
                            </div>
                          </div>
                        );
                      })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                     {/* Legenda de Marcações Compacta - Agora no Rodapé de Cada Mês */}
                     <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-2 pb-2 border-t border-slate-200 pt-3 no-print-break">
                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 rounded bg-red-500 border border-red-600 shadow-sm" />
                         <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">Feriado / Recesso</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 rounded bg-amber-400 border border-amber-500 shadow-sm" />
                         <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">Avaliação</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 rounded bg-sky-600 border border-sky-700 shadow-sm" />
                         <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">Quarta-feira (Azul)</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 rounded bg-amber-600 border border-amber-700 shadow-sm" />
                         <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">Quinta-feira (Laranja)</span>
                       </div>

                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 rounded bg-rose-50 border border-rose-300 relative overflow-hidden flex items-center justify-center text-[8px] font-extrabold text-rose-500 shadow-sm">
                           X
                         </div>
                         <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">Cancelada</span>
                       </div>
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
