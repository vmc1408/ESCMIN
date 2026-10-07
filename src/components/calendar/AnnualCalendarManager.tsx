import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarDays,
  Calendar,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Save,
  Eye,
  Layers,
  ShieldCheck,
  Sparkles,
  Filter,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Building2,
  History,
  RotateCcw,
  Info,
  CalendarCheck,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import {
  CalendarGenerationParameters,
  CalendarDayRecord,
  CalendarVersion,
  AcademicPeriod,
  RecessInterval,
  HolidayEntry,
  DayClassification
} from '../../types/annualCalendar';
import {
  loadConsolidatedHolidays,
  BRAZILIAN_STATES
} from '../../services/holidayService';
import {
  generateAnnualCalendarDays,
  calculateCalendarSummary,
  validateCalendarParameters,
  applyManualOverrideToDate,
  removeManualOverrideFromDate,
  regenerateMonthDays,
  regeneratePeriodDays,
  getCalendarVersions,
  saveCalendarVersion,
  saveCalendarDraft,
  getCalendarDraft,
  isLeapYear,
  getDaysInMonth,
  MONTH_NAMES_BR,
  WEEKDAY_NAMES_BR,
  WEEKDAY_SHORT_BR
} from '../../services/annualCalendarEngine';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useUnits } from '../../contexts/UnitContext';
import { getInstitutionSettings } from '../../lib/database';

interface AnnualCalendarManagerProps {
  onClose?: () => void;
  onCalendarPublished?: () => void;
  initialYear?: number;
}

export function AnnualCalendarManager({
  onClose,
  onCalendarPublished,
  initialYear
}: AnnualCalendarManagerProps) {
  const { user: userAuth, profile } = useAuth();
  const { selectedUnitId, getUnitName, activeUnits } = useUnits();
  const [institution, setInstitution] = useState<any>(null);

  useEffect(() => {
    getInstitutionSettings().then(inst => {
      if (inst) setInstitution(inst);
    }).catch(() => {});
  }, []);

  // 1. Estado do Ano e Localidade
  const [targetYear, setTargetYear] = useState<number>(() => {
    return initialYear || new Date().getFullYear();
  });
  const [targetUnitId, setTargetUnitId] = useState<string>(() => {
    return selectedUnitId && selectedUnitId !== 'all' ? selectedUnitId : 'matriz';
  });
  const [stateUf, setStateUf] = useState<string>('SP');
  const [cityName, setCityName] = useState<string>('Guarulhos');

  // 2. Parâmetros Gerais (Sem pré-seleção de datas nem de dias da semana, sem meta)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [classWeekdays, setClassWeekdays] = useState<number[]>([]); // Não pré-selecionado
  const [preserveOverrides, setPreserveOverrides] = useState<boolean>(true);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);

  // 3. Períodos Letivos (Sem datas pré-selecionadas)
  const [periods, setPeriods] = useState<AcademicPeriod[]>(() => [
    {
      id: 'sem1',
      name: '1º Semestre',
      start_date: '',
      end_date: '',
      is_active: true,
      color: '#2563eb'
    },
    {
      id: 'sem2',
      name: '2º Semestre',
      start_date: '',
      end_date: '',
      is_active: true,
      color: '#059669'
    }
  ]);

  // 4. Recessos e Férias (Sem datas pré-selecionadas)
  const [recesses, setRecesses] = useState<RecessInterval[]>(() => []);

  // 5. Feriados
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [isFetchingHolidays, setIsFetchingHolidays] = useState<boolean>(false);
  const [holidayWarning, setHolidayWarning] = useState<string | null>(null);

  // 6. Dias Calculados e Prévia
  const [calendarDays, setCalendarDays] = useState<Record<string, CalendarDayRecord> | null>(null);
  const [previewMode, setPreviewMode] = useState<'months' | 'single_month' | 'table'>('months');
  const [singleMonthIdx, setSingleMonthIdx] = useState<number>(1); // 0 = Jan, 1 = Fev (início das aulas)
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<number | 'all'>('all');

  // 7. Modais de Ajuste Manual e Confirmação
  const [overrideModalDate, setOverrideModalDate] = useState<string | null>(null);
  const [overrideClassification, setOverrideClassification] = useState<DayClassification>('custom_class');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideIsClassDay, setOverrideIsClassDay] = useState<boolean>(true);

  // 7.1. Modal de Edição/Adição Completa de Feriado
  const [editingHoliday, setEditingHoliday] = useState<HolidayEntry | null>(null);
  const [isNewHoliday, setIsNewHoliday] = useState<boolean>(false);

  // 7.2. Modal de Regeneração Seletiva de Mês ou Período
  const [selectiveRegenModal, setSelectiveRegenModal] = useState<{
    type: 'month' | 'period';
    id: string | number;
    name: string;
  } | null>(null);
  const [selectiveRegenPreserve, setSelectiveRegenPreserve] = useState<boolean>(true);

  // 8. Versões e Auditoria
  const [versions, setVersions] = useState<CalendarVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showVersionsHistory, setShowVersionsHistory] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [showConfirmPublish, setShowConfirmPublish] = useState<boolean>(false);

  // 9. Sub-abas do formulário
  const [activeConfigTab, setActiveConfigTab] = useState<'general' | 'periods' | 'recesses' | 'holidays'>('general');

  // Atualiza datas padrão quando o ano letivo muda (sem pré-seleção de datas)
  const handleYearChange = (newYear: number) => {
    setTargetYear(newYear);
    setStartDate('');
    setEndDate('');
    setPeriods([
      {
        id: `sem1_${newYear}`,
        name: '1º Semestre',
        start_date: '',
        end_date: '',
        is_active: true,
        color: '#2563eb'
      },
      {
        id: `sem2_${newYear}`,
        name: '2º Semestre',
        start_date: '',
        end_date: '',
        is_active: true,
        color: '#059669'
      }
    ]);
    setRecesses([]);
    setCalendarDays(null);
  };

  // Carrega feriados automáticos ao iniciar ou mudar ano/estado/cidade
  const loadHolidays = useCallback(async (year: number, uf: string, city: string) => {
    setIsFetchingHolidays(true);
    setHolidayWarning(null);
    try {
      const res = await loadConsolidatedHolidays(year, uf, city);
      setHolidays(res.holidays);
      if (res.warning) {
        setHolidayWarning(res.warning);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar feriados:', err);
      setHolidayWarning('Não foi possível carregar feriados da API externa. Por favor, confira a lista.');
    } finally {
      setIsFetchingHolidays(false);
    }
  }, []);

  useEffect(() => {
    loadHolidays(targetYear, stateUf, cityName);
  }, [targetYear, stateUf, cityName, loadHolidays]);

  // Carrega versões salvas ou rascunho anterior do ano
  const loadVersions = useCallback(async () => {
    // 1. Tenta recuperar rascunho salvo anteriormente
    const draft = getCalendarDraft(targetYear, targetUnitId);
    if (draft && draft.params) {
      if (draft.params.start_date) setStartDate(draft.params.start_date);
      if (draft.params.end_date) setEndDate(draft.params.end_date);
      if (Array.isArray(draft.params.weekdays)) setClassWeekdays(draft.params.weekdays);
      if (draft.params.periods && draft.params.periods.length > 0) setPeriods(draft.params.periods);
      if (draft.params.recesses) setRecesses(draft.params.recesses);
      if (draft.params.holidays && draft.params.holidays.length > 0) setHolidays(draft.params.holidays);
      if (draft.days && Object.keys(draft.days).length > 0) setCalendarDays(draft.days);
      if (draft.saved_at) {
        setLastDraftSavedAt(new Date(draft.saved_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      }
    }

    // 2. Busca histórico de versões oficiais / homologadas
    const list = await getCalendarVersions(targetYear, targetUnitId);
    setVersions(list);
    if (list.length > 0 && !selectedVersionId) {
      const activeVer = list.find(v => v.status === 'published') || list.find(v => v.status === 'approved') || list[0];
      setSelectedVersionId(activeVer.id);
      setCalendarDays(activeVer.days);
      if (activeVer.start_date) setStartDate(activeVer.start_date);
      if (activeVer.end_date) setEndDate(activeVer.end_date);
      if (Array.isArray(activeVer.weekdays)) setClassWeekdays(activeVer.weekdays);
      if (activeVer.periods) setPeriods(activeVer.periods);
      if (activeVer.recesses) setRecesses(activeVer.recesses);
      if (activeVer.holidays) setHolidays(activeVer.holidays);
    }
  }, [targetYear, targetUnitId, selectedVersionId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  // Parâmetros prontos para a geração (sem metas mínimas)
  const currentParams: CalendarGenerationParameters = useMemo(() => ({
    year: targetYear,
    state: stateUf,
    city: cityName,
    start_date: startDate,
    end_date: endDate,
    weekdays: classWeekdays,
    periods,
    recesses,
    holidays,
    unit_id: targetUnitId,
    preserve_manual_overrides: preserveOverrides
  }), [
    targetYear, stateUf, cityName, startDate, endDate, classWeekdays,
    periods, recesses, holidays, targetUnitId, preserveOverrides
  ]);

  // Validação dos parâmetros
  const validation = useMemo(() => {
    return validateCalendarParameters(currentParams);
  }, [currentParams]);

  // Sumário calculado com base nos dias ativos (sem meta de dias letivos)
  const summary = useMemo(() => {
    if (!calendarDays) return null;
    return calculateCalendarSummary(targetYear, calendarDays, undefined, periods);
  }, [targetYear, calendarDays, periods]);

  // Geração Automática do Calendário
  const handleGenerate = () => {
    if (!validation.isValid) {
      alert(`Por favor, corrija os seguintes pontos antes de gerar:\n\n• ${validation.errors.join('\n• ')}`);
      return;
    }

    const generated = generateAnnualCalendarDays(currentParams, calendarDays || undefined);
    setCalendarDays(generated);
    setSaveSuccessMsg('Calendário anual gerado com sucesso! Revise a pré-visualização abaixo antes de salvar.');
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  // Toggle de dia da semana
  const toggleWeekday = (dayNum: number) => {
    setClassWeekdays(prev => {
      if (prev.includes(dayNum)) {
        return prev.filter(d => d !== dayNum);
      }
      return [...prev, dayNum].sort((a, b) => a - b);
    });
  };

  // Adicionar / Remover Período
  const handleAddPeriod = () => {
    const nextNum = periods.length + 1;
    const newPeriod: AcademicPeriod = {
      id: `period_${Date.now()}`,
      name: `${nextNum}º Período`,
      start_date: startDate,
      end_date: endDate,
      is_active: true
    };
    setPeriods([...periods, newPeriod]);
  };

  const handleRemovePeriod = (id: string) => {
    setPeriods(periods.filter(p => p.id !== id));
  };

  const handleUpdatePeriod = (id: string, updates: Partial<AcademicPeriod>) => {
    setPeriods(periods.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Predefinições rápidas de períodos
  const applyPresetPeriods = (type: 'semesters' | 'bimesters' | 'trimesters') => {
    const y = targetYear;
    if (type === 'semesters') {
      setPeriods([
        { id: `sem1_${y}`, name: '1º Semestre', start_date: `${y}-02-02`, end_date: `${y}-06-30`, is_active: true, color: '#2563eb' },
        { id: `sem2_${y}`, name: '2º Semestre', start_date: `${y}-08-03`, end_date: `${y}-12-11`, is_active: true, color: '#059669' }
      ]);
    } else if (type === 'bimesters') {
      setPeriods([
        { id: `bim1_${y}`, name: '1º Bimestre', start_date: `${y}-02-02`, end_date: `${y}-04-17`, is_active: true, color: '#2563eb' },
        { id: `bim2_${y}`, name: '2º Bimestre', start_date: `${y}-04-20`, end_date: `${y}-06-30`, is_active: true, color: '#0284c7' },
        { id: `bim3_${y}`, name: '3º Bimestre', start_date: `${y}-08-03`, end_date: `${y}-09-30`, is_active: true, color: '#059669' },
        { id: `bim4_${y}`, name: '4º Bimestre', start_date: `${y}-10-01`, end_date: `${y}-12-11`, is_active: true, color: '#d97706' }
      ]);
    } else if (type === 'trimesters') {
      setPeriods([
        { id: `tri1_${y}`, name: '1º Trimestre', start_date: `${y}-02-02`, end_date: `${y}-05-15`, is_active: true, color: '#2563eb' },
        { id: `tri2_${y}`, name: '2º Trimestre', start_date: `${y}-05-18`, end_date: `${y}-08-31`, is_active: true, color: '#0284c7' },
        { id: `tri3_${y}`, name: '3º Trimestre', start_date: `${y}-09-01`, end_date: `${y}-12-11`, is_active: true, color: '#059669' }
      ]);
    }
  };

  // Adicionar / Remover Recesso
  const handleAddRecess = () => {
    const newRecess: RecessInterval = {
      id: `recess_${Date.now()}`,
      name: 'Novo Recesso',
      start_date: `${targetYear}-07-01`,
      end_date: `${targetYear}-07-15`,
      type: 'recesso'
    };
    setRecesses([...recesses, newRecess]);
  };

  const handleRemoveRecess = (id: string) => {
    setRecesses(recesses.filter(r => r.id !== id));
  };

  const handleUpdateRecess = (id: string, updates: Partial<RecessInterval>) => {
    setRecesses(recesses.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  // Toggle ou Adicionar Feriado
  const toggleHolidayClass = (id: string) => {
    setHolidays(holidays.map(h => h.id === id ? { ...h, has_class: !h.has_class } : h));
  };

  const handleStartAddHoliday = () => {
    setEditingHoliday({
      id: `hol_custom_${Date.now()}`,
      name: '',
      date: `${targetYear}-05-02`,
      type: 'institucional',
      state: stateUf,
      city: cityName,
      is_movable: false,
      origin: 'Cadastro Manual',
      has_class: false,
      notes: '',
      query_date: new Date().toISOString()
    });
    setIsNewHoliday(true);
  };

  const handleStartEditHoliday = (h: HolidayEntry) => {
    setEditingHoliday({ ...h });
    setIsNewHoliday(false);
  };

  const handleSaveHoliday = () => {
    if (!editingHoliday) return;
    if (!editingHoliday.name.trim()) {
      alert('Informe o nome do feriado.');
      return;
    }
    if (!editingHoliday.date) {
      alert('Informe a data do feriado.');
      return;
    }

    if (isNewHoliday) {
      setHolidays(prev => [...prev, editingHoliday]);
    } else {
      setHolidays(prev => prev.map(h => h.id === editingHoliday.id ? editingHoliday : h));
    }
    setEditingHoliday(null);
  };

  const handleRemoveHoliday = (id: string) => {
    setHolidays(holidays.filter(h => h.id !== id));
  };

  // Execução de Regeneração Seletiva de Mês ou Período
  const handleExecuteSelectiveRegen = () => {
    if (!selectiveRegenModal || !calendarDays) return;

    if (selectiveRegenModal.type === 'month') {
      const monthNum = typeof selectiveRegenModal.id === 'number' ? selectiveRegenModal.id : parseInt(String(selectiveRegenModal.id), 10);
      const updated = regenerateMonthDays(currentParams, calendarDays, monthNum, selectiveRegenPreserve);
      setCalendarDays(updated);
      setSaveSuccessMsg(`Mês de ${selectiveRegenModal.name} regenerado com sucesso!`);
    } else if (selectiveRegenModal.type === 'period') {
      const periodId = String(selectiveRegenModal.id);
      const updated = regeneratePeriodDays(currentParams, calendarDays, periodId, selectiveRegenPreserve);
      setCalendarDays(updated);
      setSaveSuccessMsg(`Período "${selectiveRegenModal.name}" regenerado com sucesso!`);
    }

    setSelectiveRegenModal(null);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Abrir Modal de Ajuste Manual de Data
  const handleOpenOverrideModal = (dateStr: string) => {
    if (!calendarDays || !calendarDays[dateStr]) return;
    const current = calendarDays[dateStr];
    setOverrideModalDate(dateStr);
    setOverrideClassification(current.classification);
    setOverrideIsClassDay(current.is_class_day);
    setOverrideReason(current.override_reason || '');
  };

  // Salvar Ajuste Manual de Data
  const handleSaveOverride = () => {
    if (!overrideModalDate || !calendarDays) return;
    if (!overrideReason.trim()) {
      alert('Por favor, informe a justificativa ou motivo deste ajuste para auditoria.');
      return;
    }

    const updated = applyManualOverrideToDate(
      calendarDays,
      overrideModalDate,
      overrideClassification,
      overrideIsClassDay,
      overrideReason.trim(),
      profile?.name || userAuth?.email || 'Administrador'
    );

    setCalendarDays(updated);
    setOverrideModalDate(null);
  };

  // Reverter Ajuste Manual para a regra padrão
  const handleRevertOverride = (dateStr: string) => {
    if (!calendarDays) return;
    const updated = removeManualOverrideFromDate(calendarDays, dateStr, currentParams);
    setCalendarDays(updated);
    setOverrideModalDate(null);
  };

  // Salvar Rascunho (pode ser acionado a qualquer momento, antes ou depois de gerar)
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const res = await saveCalendarDraft(
        currentParams,
        calendarDays,
        profile?.name || userAuth?.email || 'Administrador'
      );

      // Se os dias já foram calculados, salva também como versão de rascunho
      if (calendarDays) {
        const savedVer = await saveCalendarVersion(
          currentParams,
          calendarDays,
          'draft',
          profile?.name || userAuth?.email || 'Administrador'
        );
        setVersions(prev => [savedVer, ...prev.filter(v => v.id !== savedVer.id)]);
        setSelectedVersionId(savedVer.id);
      }

      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastDraftSavedAt(timeStr);
      setSaveSuccessMsg(`Rascunho salvo com sucesso às ${timeStr}! Os parâmetros e dados configurados foram gravados.`);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err);
      setSaveSuccessMsg('Rascunho gravado no navegador.');
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // Impressão Oficial do Calendário conforme visualizado em tela
  const handlePrintCalendar = () => {
    try {
      window.print();
    } catch (err) {
      console.error('Erro ao acionar impressão:', err);
    }
  };

  // Salvar / Versionar Calendário
  const handleSaveVersion = async (status: 'draft' | 'approved' | 'published') => {
    if (!calendarDays) {
      // Se não gerou ainda, salva como rascunho de parâmetros
      await handleSaveDraft();
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveCalendarVersion(
        currentParams,
        calendarDays,
        status,
        profile?.name || userAuth?.email || 'Administrador'
      );
      setVersions(prev => [saved, ...prev.filter(v => v.id !== saved.id)]);
      setSelectedVersionId(saved.id);
      setSaveSuccessMsg(`Versão ${saved.version} salva com sucesso como ${status === 'published' ? 'PUBLICADA' : status.toUpperCase()}!`);
      setShowConfirmPublish(false);
      setTimeout(() => setSaveSuccessMsg(null), 5000);

      if (status === 'published' && onCalendarPublished) {
        onCalendarPublished();
      }
    } catch (err: any) {
      console.error('Erro ao salvar versão do calendário:', err);
      alert('Erro ao salvar calendário. Verifique a conexão e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // Carregar versão selecionada
  const handleSelectVersion = (ver: CalendarVersion) => {
    setSelectedVersionId(ver.id);
    setCalendarDays(ver.days);
    setTargetYear(ver.year);
    setStateUf(ver.state);
    setCityName(ver.city);
    setStartDate(ver.start_date || '');
    setEndDate(ver.end_date || '');
    setClassWeekdays(ver.weekdays || []);
    setPeriods(ver.periods || []);
    setRecesses(ver.recesses || []);
    setHolidays(ver.holidays || []);
    setShowVersionsHistory(false);
  };

  // Legenda de cores
  const getBadgeStyleForClassification = (c: DayClassification, isManual?: boolean) => {
    if (isManual) {
      return 'bg-purple-100 text-purple-900 border-purple-300 font-extrabold ring-1 ring-purple-400';
    }
    switch (c) {
      case 'class_day':
      case 'custom_class':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
      case 'holiday_nac':
        return 'bg-red-100 text-red-900 border-red-300 font-bold';
      case 'holiday_est':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
      case 'holiday_mun':
        return 'bg-violet-100 text-violet-900 border-violet-300 font-bold';
      case 'holiday_inst':
        return 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold';
      case 'recess':
        return 'bg-yellow-100 text-yellow-900 border-yellow-300 font-bold';
      case 'vacation':
        return 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold';
      case 'suspension':
      case 'custom_off':
        return 'bg-rose-100 text-rose-900 border-rose-300 font-bold';
      case 'weekend_off':
        return 'bg-slate-100 text-slate-400 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-400 border-slate-200';
    }
  };

  return (
    <div className="w-full">
      {/* 1. Interface Interativa em Tela */}
      <div className="space-y-5 text-slate-900 print:hidden">
        {/* 1. TOPO: Identificação e Seletor de Ano Letivo & Unidade */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 bg-[#00174b] text-white rounded-xl flex items-center justify-center shadow-xs shrink-0">
            <CalendarDays size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 truncate">
                Calendário Anual de Aulas
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 uppercase tracking-wide">
                Geração Automática
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Defina os períodos, feriados e dias de aula para gerar e homologar o calendário do ano letivo.
            </p>
          </div>
        </div>

        {/* Controles de Ano e Polo */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Seletor de Polo */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
            <Building2 size={14} className="text-slate-400" />
            <span>Unidade:</span>
            <select
              value={targetUnitId}
              onChange={(e) => setTargetUnitId(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="matriz">Matriz (Padrão Geral)</option>
              {activeUnits.filter(u => u.id !== 'matriz').map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Seletor do Ano Letivo */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl">
            <button
              type="button"
              onClick={() => handleYearChange(targetYear - 1)}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
              title="Ano anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1 px-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Ano:</span>
              <input
                type="number"
                min="2020"
                max="2100"
                value={targetYear}
                onChange={(e) => handleYearChange(parseInt(e.target.value, 10) || targetYear)}
                className="w-16 text-center font-black text-sm text-slate-900 bg-white border border-slate-200 rounded-lg py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => handleYearChange(targetYear + 1)}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
              title="Próximo ano (Permite anos futuros)"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Botão Salvar Rascunho */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            title="Salvar alterações atuais como rascunho"
          >
            <Save size={14} className="text-blue-600" />
            <span>Salvar Rascunho</span>
            {lastDraftSavedAt && (
              <span className="text-[10px] text-slate-400 font-mono">({lastDraftSavedAt})</span>
            )}
          </button>

          {/* Botão de Histórico de Versões */}
          <button
            type="button"
            onClick={() => setShowVersionsHistory(!showVersionsHistory)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
          >
            <History size={14} className="text-slate-500" />
            <span>Versões ({versions.length})</span>
          </button>
        </div>
      </div>

      {/* Alerta de Sucesso ou Aviso de Fallback da API */}
      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-semibold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {holidayWarning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span>{holidayWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setHolidayWarning(null)}
            className="text-amber-700 hover:text-amber-900 text-xs font-bold"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Drawer / Painel de Histórico de Versões */}
      {showVersionsHistory && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <History size={14} className="text-slate-500" />
              <span>Histórico de Versões e Auditoria do Ano {targetYear}</span>
            </h4>
            <button
              type="button"
              onClick={() => setShowVersionsHistory(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>

          {versions.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              Nenhuma versão salva anteriormente para {targetYear}.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {versions.map(v => (
                <div
                  key={v.id}
                  className={cn(
                    "p-3 rounded-xl border bg-white flex flex-col justify-between transition-all",
                    v.id === selectedVersionId ? "border-blue-500 ring-2 ring-blue-500/10 shadow-xs" : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">
                        {v.title || `Versão ${v.version}`}
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                        v.status === 'published' ? "bg-emerald-100 text-emerald-800" :
                        v.status === 'approved' ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                      )}>
                        {v.status === 'published' ? 'Publicado' : v.status === 'approved' ? 'Aprovado' : 'Rascunho'}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                      <p>Dias Letivos: <strong className="text-slate-800 font-mono">{v.total_class_days}</strong></p>
                      <p>Criado em: {new Date(v.created_at).toLocaleString('pt-BR')}</p>
                      <p>Responsável: {v.created_by || 'Admin'}</p>
                      {v.manual_overrides_count > 0 && (
                        <p className="text-purple-700 font-semibold">{v.manual_overrides_count} ajustes manuais</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectVersion(v)}
                    className="mt-3 w-full py-1 text-xs font-bold text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                  >
                    Carregar Esta Versão
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. CONFIGURAÇÃO DOS PARÂMETROS (Abas de Configuração) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {/* Barra de Abas do Formulário */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 overflow-x-auto text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveConfigTab('general')}
            className={cn(
              "px-4 py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap",
              activeConfigTab === 'general' ? "border-[#00174b] text-[#00174b] bg-white" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <MapPin size={14} />
            <span>1. Localidade e Datas Gerais</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConfigTab('periods')}
            className={cn(
              "px-4 py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap",
              activeConfigTab === 'periods' ? "border-[#00174b] text-[#00174b] bg-white" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Layers size={14} />
            <span>2. Períodos Letivos ({periods.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConfigTab('recesses')}
            className={cn(
              "px-4 py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap",
              activeConfigTab === 'recesses' ? "border-[#00174b] text-[#00174b] bg-white" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Clock size={14} />
            <span>3. Recessos e Férias ({recesses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConfigTab('holidays')}
            className={cn(
              "px-4 py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap",
              activeConfigTab === 'holidays' ? "border-[#00174b] text-[#00174b] bg-white" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <CalendarCheck size={14} />
            <span>4. Feriados e Suspensões ({holidays.length})</span>
            {isFetchingHolidays && <RefreshCw size={12} className="animate-spin text-blue-600" />}
          </button>
        </div>

        {/* Conteúdo da Aba 1: Localidade e Datas Gerais */}
        {activeConfigTab === 'general' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              {/* Estado */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Estado (UF)
                </label>
                <select
                  value={stateUf}
                  onChange={(e) => setStateUf(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {BRAZILIAN_STATES.map(s => (
                    <option key={s.uf} value={s.uf}>{s.uf} - {s.name}</option>
                  ))}
                </select>
              </div>

              {/* Município */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Município
                </label>
                <input
                  type="text"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  placeholder="Nome do município..."
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Início do Ano Letivo */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Início do Ano Letivo
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Término do Ano Letivo */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Término do Ano Letivo
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Dias da Semana de Aula */}
            <div className="pt-2 border-t border-slate-100">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Dias da Semana em que Há Aulas
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { day: 0, label: 'Domingo', short: 'Dom' },
                    { day: 1, label: 'Segunda-feira', short: 'Seg' },
                    { day: 2, label: 'Terça-feira', short: 'Ter' },
                    { day: 3, label: 'Quarta-feira', short: 'Qua' },
                    { day: 4, label: 'Quinta-feira', short: 'Qui' },
                    { day: 5, label: 'Sexta-feira', short: 'Sex' },
                    { day: 6, label: 'Sábado', short: 'Sáb' },
                  ].map(w => {
                    const isSelected = classWeekdays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => toggleWeekday(w.day)}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
                          isSelected
                            ? "bg-[#00174b] text-white border-[#00174b] shadow-2xs"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {isSelected && <Check size={12} />}
                        <span>{w.short} ({w.label})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo da Aba 2: Períodos Letivos */}
        {activeConfigTab === 'periods' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Períodos Letivos do Ano</h4>
                <p className="text-[11px] text-slate-500">
                  Cadastre os semestres, bimestres ou períodos letivos personalizados. As aulas serão calculadas exclusivamente dentro destes períodos.
                </p>
              </div>

              {/* Atalhos rápidos */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-semibold">Preencher:</span>
                <button
                  type="button"
                  onClick={() => applyPresetPeriods('semesters')}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  2 Semestres
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetPeriods('bimesters')}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  4 Bimestres
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetPeriods('trimesters')}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  3 Trimestres
                </button>
              </div>
            </div>

            {/* Lista de Períodos */}
            <div className="space-y-2.5">
              {periods.map((p, idx) => (
                <div
                  key={p.id}
                  className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                >
                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Nome do Período #{idx + 1}
                    </label>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => handleUpdatePeriod(p.id, { name: e.target.value })}
                      className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Data Início
                    </label>
                    <input
                      type="date"
                      value={p.start_date}
                      onChange={(e) => handleUpdatePeriod(p.id, { start_date: e.target.value })}
                      className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Data Término
                    </label>
                    <input
                      type="date"
                      value={p.end_date}
                      onChange={(e) => handleUpdatePeriod(p.id, { end_date: e.target.value })}
                      className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-4 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => handleUpdatePeriod(p.id, { is_active: !p.is_active })}
                      className={cn(
                        "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer",
                        p.is_active ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-slate-200 text-slate-600 border-slate-300"
                      )}
                    >
                      {p.is_active ? 'Ativo' : 'Inativo'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemovePeriod(p.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir período"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="sm:col-span-12 mt-1">
                    <input
                      type="text"
                      placeholder="Observação opcional do período (ex: Avaliações bimestrais, conselho de classe)..."
                      value={p.notes || ''}
                      onChange={(e) => handleUpdatePeriod(p.id, { notes: e.target.value })}
                      className="w-full h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddPeriod}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>Adicionar Período</span>
            </button>
          </div>
        )}

        {/* Conteúdo da Aba 3: Recessos e Férias */}
        {activeConfigTab === 'recesses' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Recessos, Férias e Suspensões de Aula</h4>
                <p className="text-[11px] text-slate-500">
                  Datas compreendidas nestes intervalos serão automaticamente desconsideradas como dias letivos.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddRecess}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00174b] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                <Plus size={13} />
                <span>Adicionar Intervalo</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {recesses.map((r) => (
                <div
                  key={r.id}
                  className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                >
                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Descrição do Intervalo
                    </label>
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => handleUpdateRecess(r.id, { name: e.target.value })}
                      className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Data Início
                    </label>
                    <input
                      type="date"
                      value={r.start_date}
                      onChange={(e) => handleUpdateRecess(r.id, { start_date: e.target.value })}
                      className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Data Término
                    </label>
                    <input
                      type="date"
                      value={r.end_date}
                      onChange={(e) => handleUpdateRecess(r.id, { end_date: e.target.value })}
                      className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between gap-2 pt-4 sm:pt-0">
                    <select
                      value={r.type}
                      onChange={(e) => handleUpdateRecess(r.id, { type: e.target.value as any })}
                      className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="recesso">Recesso</option>
                      <option value="ferias">Férias</option>
                      <option value="suspensao">Suspensão</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleRemoveRecess(r.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir recesso"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="sm:col-span-12 mt-1">
                    <input
                      type="text"
                      placeholder="Observação opcional do recesso ou férias..."
                      value={r.notes || ''}
                      onChange={(e) => handleUpdateRecess(r.id, { notes: e.target.value })}
                      className="w-full h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conteúdo da Aba 4: Feriados e Suspensões */}
        {activeConfigTab === 'holidays' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>Feriados Nacionais, Estaduais e Municipais</span>
                  <span className="text-[10px] font-semibold text-slate-400">({holidays.length} cadastrados)</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Consolidação automática dos feriados oficiais de {targetYear} ({stateUf} / {cityName}). Você pode editar, excluir ou marcar se haverá aula excepcional.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadHolidays(targetYear, stateUf, cityName)}
                  disabled={isFetchingHolidays}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  <RefreshCw size={12} className={cn(isFetchingHolidays && "animate-spin text-blue-600")} />
                  <span>Atualizar da API</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartAddHoliday}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00174b] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Adicionar Feriado / Data Sem Aula</span>
                </button>
              </div>
            </div>

            {/* Tabela de Feriados */}
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
              {holidays.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum feriado carregado. Clique em &quot;Atualizar da API&quot; para consultar.
                </div>
              ) : (
                holidays.map(h => (
                  <div key={h.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900 font-bold truncate">{h.name}</strong>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider",
                          h.type === 'nacional' ? "bg-red-100 text-red-800" :
                          h.type === 'estadual' ? "bg-amber-100 text-amber-800" :
                          h.type === 'municipal' ? "bg-purple-100 text-purple-800" : "bg-indigo-100 text-indigo-800"
                        )}>
                          {h.type}
                        </span>
                        {h.is_movable && (
                          <span className="text-[9px] font-semibold text-slate-400 italic">
                            (Móvel)
                          </span>
                        )}
                        {h.notes && (
                          <span className="text-[9px] text-slate-500 italic max-w-xs truncate" title={h.notes}>
                            • {h.notes}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        Data: <strong>{h.date.split('-').reverse().join('/')}</strong> • Origem: {h.origin}
                        {h.city ? ` (${h.city})` : h.state ? ` (${h.state})` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleHolidayClass(h.id)}
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer",
                          h.has_class ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-600 border-slate-200"
                        )}
                        title={h.has_class ? "Marcado como dia letivo excepcional" : "Sem aula (Padrão de feriado)"}
                      >
                        {h.has_class ? 'Terá Aula' : 'Sem Aula'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEditHoliday(h)}
                        className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                        title="Editar feriado"
                      >
                        <Edit3 size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(h.id)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Remover feriado"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. BARRA DE EXECUÇÃO: Ação "Gerar Calendário Anual" */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <span>Processar Regras e Gerar Calendário de {targetYear}</span>
          </h4>
          <p className="text-xs text-slate-300 mt-0.5">
            O motor cruzará os períodos ativos, feriados, recessos e os dias da semana para gerar todos os dias letivos.
          </p>

          <label className="inline-flex items-center gap-2 mt-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={preserveOverrides}
              onChange={(e) => setPreserveOverrides(e.target.checked)}
              className="rounded text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>Preservar ajustes manuais anteriores durante a regeneração</span>
          </label>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 border border-white/15"
            title="Salvar os parâmetros e dados atuais como rascunho"
          >
            <Save size={15} />
            <span>Salvar Rascunho</span>
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!validation.isValid}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center gap-2 active:scale-95 shrink-0"
          >
            <Sparkles size={15} />
            <span>Gerar Calendário Anual</span>
          </button>
        </div>
      </div>

      {/* 4. PRÉ-VISUALIZAÇÃO INTERATIVA & DIAGNÓSTICO (Aparece após a geração) */}
      {calendarDays && summary && (
        <div className="space-y-4">
          {/* Card de Resumo e Métricas (KPIs) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-blue-900" />
                  <span>Resumo do Calendário Gerado — Ano {targetYear}</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Resultado prévio calculado para análise e homologação da administração.
                </p>
              </div>

              {/* Botões de Ação para Salvar/Publicar/Imprimir */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save size={14} className="text-blue-600" />
                  <span>Salvar Rascunho</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintCalendar}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                  title="Imprimir calendário conforme visualizado em tela"
                >
                  <Printer size={14} className="text-slate-600" />
                  <span>Imprimir Calendário</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveVersion('approved')}
                  disabled={isSaving}
                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  Aprovar Calendário
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmPublish(true)}
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#00174b] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Publicar Oficialmente</span>
                </button>
              </div>
            </div>

            {/* Cards de Métricas em Grid (Sem Metas) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total de Dias Letivos */}
              <div className="p-3.5 rounded-xl border bg-emerald-50/70 border-emerald-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Dias Letivos Gerados
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-emerald-700">
                    {summary.total_class_days}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    dias de aula
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-slate-500 mt-1">
                  Total apurado nos períodos letivos
                </p>
              </div>

              {/* Feriados */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Feriados no Calendário
                </span>
                <span className="text-2xl font-black text-slate-900 font-mono mt-2">
                  {summary.total_holidays}
                </span>
                <p className="text-[10px] text-slate-500 mt-1">
                  Nacionais, Estaduais e Locais
                </p>
              </div>

              {/* Recessos e Férias */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Dias de Recesso / Férias
                </span>
                <span className="text-2xl font-black text-slate-900 font-mono mt-2">
                  {summary.total_recess_days}
                </span>
                <p className="text-[10px] text-slate-500 mt-1">
                  Fora da contagem letiva
                </p>
              </div>

              {/* Ajustes Manuais */}
              <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-xl flex flex-col justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900">
                  Ajustes Manuais
                </span>
                <span className="text-2xl font-black text-purple-900 font-mono mt-2">
                  {summary.total_manual_overrides}
                </span>
                <p className="text-[10px] text-purple-700 mt-1">
                  Alterações com auditoria
                </p>
              </div>
            </div>

            {/* Resumo por Período */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs font-semibold">
              <span className="text-slate-500 uppercase tracking-wider text-[11px]">Por Período:</span>
              {summary.by_period.map(p => (
                <div key={p.period_id} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                  <span className="text-slate-700">{p.period_name}:</span>
                  <strong className="text-slate-900 font-mono">{p.class_days} dias letivos</strong>
                  <button
                    type="button"
                    onClick={() => setSelectiveRegenModal({ type: 'period', id: p.period_id, name: p.period_name })}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-700 transition-colors cursor-pointer"
                    title="Regenerar somente as datas deste período"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Seletor de Modo de Visualização da Prévia: Grade de 12 Meses vs Mensal vs Tabela */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Visualização:
                </span>
                <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('months')}
                    className={cn(
                      "px-3 py-1 rounded-lg transition-all cursor-pointer",
                      previewMode === 'months' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Grade Anual (12 Meses)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('single_month')}
                    className={cn(
                      "px-3 py-1 rounded-lg transition-all cursor-pointer",
                      previewMode === 'single_month' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Visão Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('table')}
                    className={cn(
                      "px-3 py-1 rounded-lg transition-all cursor-pointer",
                      previewMode === 'table' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Tabela Detalhada
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePrintCalendar}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ml-1"
                  title="Imprimir calendário conforme visualizado em tela"
                >
                  <Printer size={13} className="text-slate-600" />
                  <span>Imprimir Esta Visão</span>
                </button>
              </div>

              {/* Legenda Visual */}
              <div className="flex items-center gap-3 text-[10px] font-bold flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>Dia Letivo</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500"></span>Feriado Nac.</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500"></span>Feriado Est.</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-500"></span>Feriado Mun.</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-400"></span>Recesso</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-cyan-400"></span>Férias</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-700"></span>Ajuste Manual</span>
              </div>
            </div>

            {/* MODO 1: Grade de 12 Meses */}
            {previewMode === 'months' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {MONTH_NAMES_BR.map((monthName, mIdx) => {
                  const daysInMonth = getDaysInMonth(targetYear, mIdx);
                  const firstDateStr = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-01`;
                  const firstDayOfWeek = new Date(firstDateStr + 'T12:00:00Z').getUTCDay();
                  const mSummary = summary.by_month[mIdx];

                  return (
                    <div
                      key={monthName}
                      className="border border-slate-200 rounded-xl p-3 bg-white shadow-2xs space-y-2 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <strong className="text-xs font-bold text-slate-900">{monthName}</strong>
                        <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          {mSummary.class_days} letivos
                        </span>
                      </div>

                      {/* Cabeçalho dos dias da semana */}
                      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-slate-400">
                        {WEEKDAY_SHORT_BR.map(w => (
                          <span key={w}>{w[0]}</span>
                        ))}
                      </div>

                      {/* Grade dos dias do mês */}
                      <div className="grid grid-cols-7 gap-1 text-center">
                        {/* Espaços em branco antes do primeiro dia */}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                          <div key={`blank_${i}`} className="h-6" />
                        ))}

                        {/* Dias do mês */}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const dayNum = i + 1;
                          const dateKey = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                          const dayRecord = calendarDays[dateKey];
                          if (!dayRecord) return null;

                          const isManual = dayRecord.is_manual_override;
                          const badgeCls = getBadgeStyleForClassification(dayRecord.classification, isManual);

                          return (
                            <button
                              key={dateKey}
                              type="button"
                              onClick={() => handleOpenOverrideModal(dateKey)}
                              className={cn(
                                "h-6 rounded text-[10px] flex items-center justify-center transition-all cursor-pointer relative group",
                                badgeCls,
                                isManual && "ring-1 ring-purple-600"
                              )}
                              title={`${dateKey}: ${dayRecord.event_name || dayRecord.classification}${isManual ? ` (Ajuste: ${dayRecord.override_reason})` : ''} - Clique para alterar`}
                            >
                              <span>{dayNum}</span>
                              {isManual && (
                                <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-purple-800" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-[9px] text-slate-400 text-center pt-1 border-t border-slate-100">
                        Clique em qualquer data para ajustar
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MODO 2: Visão Mensal (Mês a Mês Expandido) */}
            {previewMode === 'single_month' && (() => {
              const mIdx = singleMonthIdx;
              const monthName = MONTH_NAMES_BR[mIdx];
              const daysInMonth = getDaysInMonth(targetYear, mIdx);
              const firstDateStr = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-01`;
              const firstDayOfWeek = new Date(firstDateStr + 'T12:00:00Z').getUTCDay();
              const mSummary = summary.by_month[mIdx];

              return (
                <div className="space-y-4">
                  {/* Navegação e Métricas do Mês */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSingleMonthIdx((prev) => (prev === 0 ? 11 : prev - 1))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
                        title="Mês anterior"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <select
                        value={singleMonthIdx}
                        onChange={(e) => setSingleMonthIdx(parseInt(e.target.value, 10))}
                        className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                      >
                        {MONTH_NAMES_BR.map((m, idx) => (
                          <option key={m} value={idx}>{m} de {targetYear}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => setSingleMonthIdx((prev) => (prev === 11 ? 0 : prev + 1))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
                        title="Próximo mês"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold">
                        {mSummary.class_days} Dias Letivos
                      </span>
                      <span className="px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 rounded-lg text-xs font-bold">
                        {mSummary.holidays} Feriados
                      </span>
                      <span className="px-2.5 py-1 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg text-xs font-bold">
                        {mSummary.recess_days} Recessos/Férias
                      </span>

                      <button
                        type="button"
                        onClick={() => setSelectiveRegenModal({ type: 'month', id: mIdx + 1, name: monthName })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                        title="Regenerar somente este mês"
                      >
                        <RotateCcw size={13} className="text-blue-600" />
                        <span>Regenerar Este Mês</span>
                      </button>
                    </div>
                  </div>

                  {/* Grade Grande do Mês */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                    {/* Cabeçalho com dias da semana */}
                    <div className="grid grid-cols-7 bg-slate-100/80 border-b border-slate-200 text-center py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(d => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>

                    {/* Células dos dias */}
                    <div className="grid grid-cols-7 gap-px bg-slate-200">
                      {/* Espaços em branco */}
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div key={`blank_m_${i}`} className="bg-slate-50/50 min-h-[95px] p-2" />
                      ))}

                      {/* Dias do mês */}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const dateKey = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const dayRecord = calendarDays[dateKey];
                        if (!dayRecord) return null;

                        const isManual = dayRecord.is_manual_override;
                        const badgeCls = getBadgeStyleForClassification(dayRecord.classification, isManual);

                        return (
                          <div
                            key={dateKey}
                            className={cn(
                              "bg-white min-h-[95px] p-2 flex flex-col justify-between transition-colors hover:bg-blue-50/20 group relative",
                              dayRecord.is_class_day ? "bg-emerald-50/15" : "",
                              isManual && "ring-1 ring-inset ring-purple-400 bg-purple-50/10"
                            )}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-black text-slate-900 font-mono">
                                  {dayNum}
                                </span>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase tracking-wide",
                                  badgeCls
                                )}>
                                  {dayRecord.classification === 'class_day' ? 'Aula' :
                                   dayRecord.classification === 'custom_class' ? 'Aula (Aj.)' :
                                   dayRecord.classification === 'holiday_nac' ? 'Feriado Nac' :
                                   dayRecord.classification === 'holiday_est' ? 'Feriado Est' :
                                   dayRecord.classification === 'holiday_mun' ? 'Feriado Mun' :
                                   dayRecord.classification === 'recess' ? 'Recesso' :
                                   dayRecord.classification === 'vacation' ? 'Férias' :
                                   dayRecord.classification === 'suspension' ? 'Suspensão' :
                                   dayRecord.classification === 'weekend_off' ? 'Fim de Sem.' : 'Sem Aula'}
                                </span>
                              </div>

                              <p className="text-[10px] font-semibold text-slate-700 mt-1 line-clamp-2 leading-tight">
                                {dayRecord.event_name || (dayRecord.is_class_day ? 'Dia Letivo' : 'Sem Aula')}
                              </p>

                              {isManual && (
                                <p className="text-[9px] text-purple-700 font-bold mt-0.5 truncate" title={dayRecord.override_reason}>
                                  ★ {dayRecord.override_reason}
                                </p>
                              )}
                            </div>

                            <div className="pt-1 border-t border-slate-100 flex items-center justify-between mt-1">
                              <span className="text-[9px] font-semibold text-slate-400">
                                {dayRecord.is_class_day ? 'Letivo' : 'Não-letivo'}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleOpenOverrideModal(dateKey)}
                                className="text-[9.5px] font-bold text-blue-700 hover:text-blue-900 transition-colors cursor-pointer"
                              >
                                Ajustar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MODO 3: Tabela Detalhada com Filtros */}
            {previewMode === 'table' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Filtrar por mês:</span>
                  <select
                    value={selectedMonthFilter}
                    onChange={(e) => setSelectedMonthFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                    className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                  >
                    <option value="all">Todos os Meses</option>
                    {MONTH_NAMES_BR.map((m, idx) => (
                      <option key={m} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Data</th>
                        <th className="py-2.5 px-3">Dia da Semana</th>
                        <th className="py-2.5 px-3 text-center">Classificação</th>
                        <th className="py-2.5 px-3 text-center">Letivo?</th>
                        <th className="py-2.5 px-3">Evento / Motivo</th>
                        <th className="py-2.5 px-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.values(calendarDays)
                        .filter(d => {
                          if (selectedMonthFilter === 'all') return true;
                          const mNum = parseInt(d.date.split('-')[1], 10);
                          return mNum === selectedMonthFilter;
                        })
                        .map(d => (
                          <tr key={d.date} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              {d.date.split('-').reverse().join('/')}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {WEEKDAY_SHORT_BR[d.day_of_week]}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold",
                                getBadgeStyleForClassification(d.classification, d.is_manual_override)
                              )}>
                                {d.classification}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {d.is_class_day ? (
                                <span className="text-emerald-700 font-bold">Sim</span>
                              ) : (
                                <span className="text-slate-400">Não</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-700 truncate max-w-xs">
                              {d.event_name}
                              {d.is_manual_override && (
                                <span className="block text-[10px] text-purple-700 italic">
                                  Ajuste manual: {d.override_reason}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenOverrideModal(d.date)}
                                className="text-blue-700 hover:text-blue-900 font-bold hover:underline"
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE AJUSTE MANUAL DE DATA */}
      {overrideModalDate && calendarDays && calendarDays[overrideModalDate] && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Ajuste Manual: {overrideModalDate.split('-').reverse().join('/')}
                </h4>
                <p className="text-xs text-slate-500">
                  {WEEKDAY_NAMES_BR[calendarDays[overrideModalDate].day_of_week]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideModalDate(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Definição da Data
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOverrideIsClassDay(true);
                      setOverrideClassification('custom_class');
                    }}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5",
                      overrideIsClassDay
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    <Check size={14} />
                    <span>Dia Letivo (Com Aula)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOverrideIsClassDay(false);
                      setOverrideClassification('custom_off');
                    }}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5",
                      !overrideIsClassDay
                        ? "bg-red-600 text-white border-red-600 shadow-2xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    <X size={14} />
                    <span>Sem Aula</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Classificação da Data
                </label>
                <select
                  value={overrideClassification}
                  onChange={(e) => setOverrideClassification(e.target.value as DayClassification)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="custom_class">Aula Excepcional / Sábado Letivo</option>
                  <option value="class_day">Dia Letivo Regular</option>
                  <option value="custom_off">Suspensão / Sem Aula</option>
                  <option value="holiday_inst">Feriado Institucional / Comemoração</option>
                  <option value="recess">Recesso Extraordinário</option>
                  <option value="suspension">Suspensão Oficial de Aulas</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Motivo / Justificativa do Ajuste (Obrigatório)
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Ex: Sábado letivo para reposição de carga horária do feriado X..."
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {calendarDays[overrideModalDate].is_manual_override ? (
                <button
                  type="button"
                  onClick={() => handleRevertOverride(overrideModalDate)}
                  className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1"
                >
                  <RotateCcw size={13} />
                  <span>Restaurar Regra Original</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOverrideModalDate(null)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveOverride}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO DE CONFIRMAÇÃO DE PUBLICAÇÃO OFICIAL */}
      {showConfirmPublish && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-900 rounded-xl flex items-center justify-center mx-auto border border-blue-100">
              <CheckCircle2 size={24} />
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">
                Publicar Calendário Oficial de {targetYear}?
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Ao publicar oficialmente, todos os {summary?.total_class_days} dias letivos serão sincronizados com os módulos de Frequência, Grade Acadêmica e Calendário Mensal.
              </p>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium space-y-1">
              <p>• A versão anterior não será excluída e permanecerá arquivada para consulta.</p>
              <p>• Esta ação criará uma nova versão oficial aprovada para o ano {targetYear}.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmPublish(false)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveVersion('published')}
                disabled={isSaving}
                className="px-4 py-2 bg-[#00174b] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Confirmar e Publicar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ADIÇÃO OU EDIÇÃO COMPLETA DE FERIADO */}
      {editingHoliday && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {isNewHoliday ? 'Adicionar Feriado ou Data Sem Aula' : 'Editar Feriado'}
                </h4>
                <p className="text-xs text-slate-500">
                  Definição completa de data, jurisdição e indicação de aula excepcional.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingHoliday(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Nome do Feriado / Evento *
                </label>
                <input
                  type="text"
                  value={editingHoliday.name}
                  onChange={(e) => setEditingHoliday({ ...editingHoliday, name: e.target.value })}
                  placeholder="Ex: Aniversário da Cidade, Dia do Padroeiro, Consciência Negra..."
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Data (YYYY-MM-DD) *
                  </label>
                  <input
                    type="date"
                    value={editingHoliday.date}
                    onChange={(e) => setEditingHoliday({ ...editingHoliday, date: e.target.value })}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Tipo de Feriado *
                  </label>
                  <select
                    value={editingHoliday.type}
                    onChange={(e) => setEditingHoliday({ ...editingHoliday, type: e.target.value as any })}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
                  >
                    <option value="nacional">Nacional</option>
                    <option value="estadual">Estadual</option>
                    <option value="municipal">Municipal</option>
                    <option value="institucional">Institucional</option>
                  </select>
                </div>
              </div>

              {(editingHoliday.type === 'estadual' || editingHoliday.type === 'municipal') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Estado (UF)
                    </label>
                    <select
                      value={editingHoliday.state || stateUf}
                      onChange={(e) => setEditingHoliday({ ...editingHoliday, state: e.target.value })}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
                    >
                      {BRAZILIAN_STATES.map(s => (
                        <option key={s.uf} value={s.uf}>{s.uf} - {s.name}</option>
                      ))}
                    </select>
                  </div>

                  {editingHoliday.type === 'municipal' && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Município
                      </label>
                      <input
                        type="text"
                        value={editingHoliday.city || ''}
                        onChange={(e) => setEditingHoliday({ ...editingHoliday, city: e.target.value })}
                        placeholder="Nome da cidade..."
                        className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 items-center pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Origem da Informação
                  </label>
                  <input
                    type="text"
                    value={editingHoliday.origin || ''}
                    onChange={(e) => setEditingHoliday({ ...editingHoliday, origin: e.target.value })}
                    placeholder="Ex: Cadastro Manual, Decreto Municipal..."
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Haverá Aula Nesta Data?
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingHoliday({ ...editingHoliday, has_class: !editingHoliday.has_class })}
                    className={cn(
                      "w-full h-10 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                      editingHoliday.has_class
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-red-50 text-red-700 border-red-200"
                    )}
                  >
                    {editingHoliday.has_class ? (
                      <>
                        <Check size={14} />
                        <span>Sim, Terá Aula</span>
                      </>
                    ) : (
                      <>
                        <X size={14} />
                        <span>Não, Sem Aula</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="holiday_is_movable"
                  checked={editingHoliday.is_movable || false}
                  onChange={(e) => setEditingHoliday({ ...editingHoliday, is_movable: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="holiday_is_movable" className="text-xs text-slate-700 font-semibold cursor-pointer">
                  Data móvel (ex: Carnaval, Páscoa, Corpus Christi)
                </label>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Observações (Opcional)
                </label>
                <textarea
                  value={editingHoliday.notes || ''}
                  onChange={(e) => setEditingHoliday({ ...editingHoliday, notes: e.target.value })}
                  placeholder="Informações adicionais, legislação ou decreto municipal..."
                  rows={2}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingHoliday(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveHoliday}
                className="px-4 py-2 bg-[#00174b] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Save size={14} />
                <span>Salvar Feriado</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE REGENERAÇÃO SELETIVA (MÊS OU PERÍODO) */}
      {selectiveRegenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-900 rounded-xl flex items-center justify-center shrink-0">
                <RotateCcw size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Regenerar {selectiveRegenModal.type === 'month' ? 'Mês' : 'Período'}: {selectiveRegenModal.name}
                </h4>
                <p className="text-xs text-slate-500">
                  Recalculará as datas correspondentes com base nos parâmetros atuais.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <label className="flex items-start gap-2 text-slate-800 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectiveRegenPreserve}
                  onChange={(e) => setSelectiveRegenPreserve(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0 mt-0.5 cursor-pointer"
                />
                <span>
                  Preservar ajustes manuais autorizados neste intervalo
                  <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                    (Se desmarcado, quaisquer sábados letivos ou suspensões manuais serão substituídos pelas regras originais)
                  </span>
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectiveRegenModal(null)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteSelectiveRegen}
                className="px-4 py-2 bg-[#00174b] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles size={14} />
                <span>Confirmar Regeneração</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* 2. ÁREA EXCLUSIVA DE IMPRESSÃO (Conforme visualizado em tela) */}
      {calendarDays && summary && (
        <div id="annual-calendar-printable" className="hidden print:block w-full bg-white text-slate-900 p-0 m-0">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm 10mm 10mm 10mm;
              }
              body {
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              #annual-calendar-printable {
                display: block !important;
                width: 100% !important;
                visibility: visible !important;
              }
              .print-break-inside-avoid {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
            }
          `}</style>

          {/* Cabeçalho do Documento Impresso */}
          <div className="border-b-2 border-slate-900 pb-3 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {institution?.logo_url ? (
                  <img src={institution.logo_url} alt="Logo" className="h-12 w-auto object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center font-bold text-lg">
                    {institution?.name?.charAt(0) || 'E'}
                  </div>
                )}
                <div>
                  <h1 className="text-base font-black uppercase tracking-tight text-slate-950">
                    {institution?.name || 'Sistema de Gestão Escolar'}
                  </h1>
                  <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                    {institution?.city_uf || `${cityName} - ${stateUf}`} {institution?.cnpj ? `• CNPJ: ${institution.cnpj}` : ''}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-900 bg-slate-100 border border-slate-300 px-2 py-0.5">
                  Ano Letivo {targetYear}
                </span>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                  Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div>
                <strong className="text-slate-900">CALENDÁRIO ESCOLAR OFICIAL</strong>
                <span className="text-slate-600 ml-2">• Polo/Unidade: <strong>{getUnitName(targetUnitId)}</strong></span>
                <span className="text-slate-600 ml-2">• Local: <strong>{cityName} - {stateUf}</strong></span>
              </div>
              <div className="text-slate-700 font-semibold">
                Visualização: <strong className="uppercase">{previewMode === 'months' ? 'Grade Anual (12 Meses)' : previewMode === 'single_month' ? `Visão Mensal (${MONTH_NAMES_BR[singleMonthIdx]})` : 'Tabela Detalhada'}</strong>
              </div>
            </div>
          </div>

          {/* Barra de Totais / Métricas do Calendário (Sem Metas) */}
          <div className="grid grid-cols-4 gap-2 mb-3 bg-slate-50 border border-slate-300 p-2 text-center text-xs">
            <div className="border-r border-slate-200 pr-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 block">Total Dias Letivos</span>
              <strong className="text-base font-black text-emerald-800 font-mono">{summary.total_class_days}</strong>
            </div>
            <div className="border-r border-slate-200 pr-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 block">Feriados</span>
              <strong className="text-base font-black text-slate-900 font-mono">{summary.total_holidays}</strong>
            </div>
            <div className="border-r border-slate-200 pr-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 block">Recessos / Férias</span>
              <strong className="text-base font-black text-slate-900 font-mono">{summary.total_recess_days}</strong>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 block">Ajustes Manuais</span>
              <strong className="text-base font-black text-purple-900 font-mono">{summary.total_manual_overrides}</strong>
            </div>
          </div>

          {/* Períodos Letivos */}
          <div className="mb-3 p-2 bg-white border border-slate-300 text-[10px]">
            <strong className="text-slate-800 uppercase block mb-1">Períodos Letivos:</strong>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {summary.by_period.map(p => (
                <div key={p.period_id} className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900">{p.period_name}:</span>
                  <span className="font-mono text-slate-700">
                    {p.start_date ? p.start_date.split('-').reverse().join('/') : '-'} a {p.end_date ? p.end_date.split('-').reverse().join('/') : '-'}
                  </span>
                  <span className="font-bold text-emerald-800 font-mono bg-emerald-50 px-1 border border-emerald-200">
                    ({p.class_days} letivos)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Legenda Visual Completa */}
          <div className="mb-3 flex items-center justify-between p-2 bg-slate-50 border border-slate-300 text-[9px] font-bold">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-100 border border-emerald-400"></span>Dia Letivo</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-100 border border-red-400"></span>Feriado Nacional</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-100 border border-amber-400"></span>Feriado Estadual</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-purple-100 border border-purple-400"></span>Feriado Municipal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-yellow-100 border border-yellow-400"></span>Recesso</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-cyan-100 border border-cyan-400"></span>Férias</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-purple-200 border-2 border-purple-600"></span>Ajuste Manual</span>
          </div>

          {/* CONTEÚDO CONFORME VISUALIZAÇÃO EM TELA */}
          
          {/* MODO 1 IMPRESSÃO: GRADE ANUAL (12 MESES) */}
          {previewMode === 'months' && (
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {MONTH_NAMES_BR.map((monthName, mIdx) => {
                const daysInMonth = getDaysInMonth(targetYear, mIdx);
                const firstDateStr = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-01`;
                const firstDayOfWeek = new Date(firstDateStr + 'T12:00:00Z').getUTCDay();
                const mSummary = summary.by_month[mIdx];

                return (
                  <div key={monthName} className="border border-slate-300 p-1.5 bg-white print-break-inside-avoid text-[9px]">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1">
                      <strong className="font-black text-[10px] text-slate-900 uppercase">{monthName}</strong>
                      <span className="font-mono font-bold text-emerald-900 bg-emerald-50 px-1 border border-emerald-300">
                        {mSummary.class_days} letivos
                      </span>
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 text-center font-bold text-slate-500 mb-0.5 text-[8px]">
                      {WEEKDAY_SHORT_BR.map(w => (
                        <span key={w}>{w[0]}</span>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 text-center">
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div key={`print_blank_${i}`} className="h-5" />
                      ))}

                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const dateKey = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const dayRecord = calendarDays[dateKey];
                        if (!dayRecord) return null;

                        const isManual = dayRecord.is_manual_override;
                        const badgeCls = getBadgeStyleForClassification(dayRecord.classification, isManual);

                        return (
                          <div
                            key={`print_${dateKey}`}
                            className={cn(
                              "h-5 flex items-center justify-center font-bold border text-[8.5px]",
                              badgeCls
                            )}
                          >
                            <span>{dayNum}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MODO 2 IMPRESSÃO: VISÃO MENSAL AMPLA */}
          {previewMode === 'single_month' && (() => {
            const mIdx = singleMonthIdx;
            const monthName = MONTH_NAMES_BR[mIdx];
            const daysInMonth = getDaysInMonth(targetYear, mIdx);
            const firstDateStr = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-01`;
            const firstDayOfWeek = new Date(firstDateStr + 'T12:00:00Z').getUTCDay();
            const mSummary = summary.by_month[mIdx];

            return (
              <div className="mb-4 space-y-2 print-break-inside-avoid">
                <div className="flex items-center justify-between bg-slate-100 p-2 border border-slate-300 text-xs">
                  <h3 className="font-black text-sm uppercase text-slate-900">{monthName} de {targetYear}</h3>
                  <div className="flex items-center gap-3 font-semibold">
                    <span>{mSummary.class_days} Dias Letivos</span>
                    <span>•</span>
                    <span>{mSummary.holidays} Feriados</span>
                    <span>•</span>
                    <span>{mSummary.recess_days} Recessos/Férias</span>
                  </div>
                </div>

                <div className="border border-slate-300">
                  <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-300 text-center py-1.5 text-[10px] font-bold uppercase">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-px bg-slate-300">
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                      <div key={`print_m_blank_${i}`} className="bg-slate-50 min-h-[70px] p-1.5" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const dateKey = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const dayRecord = calendarDays[dateKey];
                      if (!dayRecord) return null;

                      const isManual = dayRecord.is_manual_override;
                      const badgeCls = getBadgeStyleForClassification(dayRecord.classification, isManual);

                      return (
                        <div key={`print_m_${dateKey}`} className={cn("bg-white min-h-[70px] p-1.5 flex flex-col justify-between text-[10px]", dayRecord.is_class_day && "bg-emerald-50/20")}>
                          <div className="flex items-center justify-between">
                            <span className="font-black text-xs font-mono">{dayNum}</span>
                            <span className={cn("px-1 py-0.2 rounded text-[7.5px] font-bold border", badgeCls)}>
                              {dayRecord.is_class_day ? 'Aula' : 'Sem Aula'}
                            </span>
                          </div>
                          <p className="text-[8.5px] font-medium text-slate-800 line-clamp-2 mt-1">
                            {dayRecord.event_name || (dayRecord.is_class_day ? 'Dia Letivo' : '')}
                          </p>
                          {isManual && (
                            <p className="text-[7.5px] text-purple-800 font-bold">★ {dayRecord.override_reason}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* MODO 3 IMPRESSÃO: TABELA DETALHADA */}
          {previewMode === 'table' && (
            <div className="mb-4">
              <table className="w-full text-left text-[9px] border-collapse border border-slate-300">
                <thead className="bg-slate-100 text-[9px] font-bold text-slate-900 uppercase">
                  <tr className="border-b border-slate-300">
                    <th className="p-1.5 border-r border-slate-300">Data</th>
                    <th className="p-1.5 border-r border-slate-300">Semana</th>
                    <th className="p-1.5 border-r border-slate-300 text-center">Classificação</th>
                    <th className="p-1.5 border-r border-slate-300 text-center">Letivo?</th>
                    <th className="p-1.5">Evento / Ajuste Manual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {Object.values(calendarDays)
                    .filter(d => {
                      if (selectedMonthFilter === 'all') return true;
                      const mNum = parseInt(d.date.split('-')[1], 10);
                      return mNum === selectedMonthFilter;
                    })
                    .map(d => (
                      <tr key={`print_t_${d.date}`} className="print-break-inside-avoid">
                        <td className="p-1 font-mono font-bold border-r border-slate-200">
                          {d.date.split('-').reverse().join('/')}
                        </td>
                        <td className="p-1 border-r border-slate-200">
                          {WEEKDAY_SHORT_BR[d.day_of_week]}
                        </td>
                        <td className="p-1 text-center border-r border-slate-200">
                          <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold border", getBadgeStyleForClassification(d.classification, d.is_manual_override))}>
                            {d.classification}
                          </span>
                        </td>
                        <td className="p-1 text-center font-bold font-mono border-r border-slate-200">
                          {d.is_class_day ? <span className="text-emerald-700">SIM</span> : <span className="text-slate-400">NÃO</span>}
                        </td>
                        <td className="p-1 text-slate-800">
                          {d.event_name || (d.is_class_day ? 'Dia Letivo Regular' : '')}
                          {d.is_manual_override && (
                            <span className="text-purple-800 font-bold ml-1">• Ajuste: {d.override_reason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rodapé e Assinaturas */}
          <div className="pt-4 border-t-2 border-slate-900 grid grid-cols-2 gap-8 text-center text-xs print-break-inside-avoid">
            <div>
              <div className="border-t border-slate-400 mt-8 pt-1">
                <p className="font-bold text-slate-900">Coordenação Pedagógica</p>
                <p className="text-[9px] text-slate-500">Visto e Homologação</p>
              </div>
            </div>
            <div>
              <div className="border-t border-slate-400 mt-8 pt-1">
                <p className="font-bold text-slate-900">Direção Escolar</p>
                <p className="text-[9px] text-slate-500">Aprovação e Publicação</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
