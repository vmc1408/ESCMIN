import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  X, 
  Check, 
  Building2, 
  RefreshCw, 
  Info, 
  AlertCircle,
  Copy,
  CalendarDays,
  Sparkles
} from 'lucide-react';
import { saveData, fetchAll, fetchById, deleteQuery } from '../lib/database';
import { isItemInUnit } from '../lib/unitService';
import { sanitizeAcademicSettings } from '../lib/academicUtils';

interface UnitScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  unitName: string;
  currentSettings: any;
  matrizSettings: any;
  isCustomSchedule: boolean;
  onSaved: (newSettings: any) => void;
  classes?: any[];
  userAuth?: any;
}

const WEEKDAYS = [
  { num: 1, label: 'Seg', full: 'Segunda-feira' },
  { num: 2, label: 'Ter', full: 'Terça-feira' },
  { num: 3, label: 'Qua', full: 'Quarta-feira' },
  { num: 4, label: 'Qui', full: 'Quinta-feira' },
  { num: 5, label: 'Sex', full: 'Sexta-feira' },
  { num: 6, label: 'Sáb', full: 'Sábado' }
];

export const UnitScheduleModal: React.FC<UnitScheduleModalProps> = ({
  isOpen,
  onClose,
  unitId,
  unitName,
  currentSettings,
  matrizSettings,
  isCustomSchedule,
  onSaved,
  classes = [],
  userAuth
}) => {
  const [scheduleMode, setScheduleMode] = useState<'matriz' | 'custom'>(
    isCustomSchedule ? 'custom' : 'matriz'
  );

  const [term1Start, setTerm1Start] = useState('');
  const [term1End, setTerm1End] = useState('');
  const [term2Start, setTerm2Start] = useState('');
  const [term2End, setTerm2End] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [autoGenerateClasses, setAutoGenerateClasses] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Inicializa o formulário com as configurações vigentes
  useEffect(() => {
    if (!isOpen) {
      setFeedback(null);
      return;
    }

    setScheduleMode(isCustomSchedule ? 'custom' : 'matriz');

    const source = isCustomSchedule && currentSettings ? currentSettings : matrizSettings;
    if (source) {
      setTerm1Start(source.term1_start || '');
      setTerm1End(source.term1_end || '');
      setTerm2Start(source.term2_start || '');
      setTerm2End(source.term2_end || '');
      if (Array.isArray(source.class_weekdays)) {
        setSelectedWeekdays(source.class_weekdays.map(Number));
      } else {
        setSelectedWeekdays([]);
      }
    } else {
      setTerm1Start('');
      setTerm1End('');
      setTerm2Start('');
      setTerm2End('');
      setSelectedWeekdays([]);
    }
  }, [isOpen, isCustomSchedule, currentSettings, matrizSettings]);

  const toggleWeekday = (dayNum: number) => {
    setSelectedWeekdays(prev => 
      prev.includes(dayNum) ? prev.filter(d => d !== dayNum) : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  const copyFromMatriz = () => {
    if (!matrizSettings) return;
    setTerm1Start(matrizSettings.term1_start || '');
    setTerm1End(matrizSettings.term1_end || '');
    setTerm2Start(matrizSettings.term2_start || '');
    setTerm2End(matrizSettings.term2_end || '');
    if (Array.isArray(matrizSettings.class_weekdays)) {
      setSelectedWeekdays(matrizSettings.class_weekdays.map(Number));
    }
    setFeedback({
      type: 'success',
      message: 'Datas e parâmetros copiados da Matriz. Ajuste os dias específicos conforme necessário.'
    });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleSave = async () => {
    if (!unitId || unitId === 'matriz' || unitId === 'all') {
      onClose();
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const targetSettingsId = `academic_settings_${unitId}`;

      if (scheduleMode === 'matriz') {
        // Exclui configuração customizada para que a filial volte a herdar a Matriz
        try {
          await deleteQuery('academic_settings', [{ field: 'id', operator: '==', value: targetSettingsId }]);
          localStorage.removeItem(`academic_settings_${targetSettingsId}`);
          localStorage.removeItem(`academic_settings_${unitId}`);
        } catch (e) {
          console.warn("Erro ao limpar custom settings:", e);
        }

        window.dispatchEvent(new Event('academic-settings-updated'));
        window.dispatchEvent(new Event('units-updated'));
        onSaved(matrizSettings);
        setFeedback({ type: 'success', message: 'Unidade configurada para seguir o cronograma padrão da Matriz.' });
        setTimeout(() => {
          onClose();
        }, 1200);
        return;
      }

      // Validações no modo personalizado
      const validWeekdays = selectedWeekdays.filter(d => d >= 1 && d <= 6);
      if (validWeekdays.length === 0) {
        setFeedback({ type: 'error', message: 'Selecione pelo menos um dia da semana para as aulas deste polo.' });
        setIsSaving(false);
        return;
      }

      const updatedSettings: any = sanitizeAcademicSettings({
        id: targetSettingsId,
        unit_id: unitId,
        term1_start: term1Start,
        term1_end: term1End,
        term2_start: term2Start,
        term2_end: term2End,
        class_weekdays: validWeekdays,
        weekday_titles: currentSettings?.weekday_titles || matrizSettings?.weekday_titles || {},
        target_class_ids: currentSettings?.target_class_ids || [],
        weekday_classes: currentSettings?.weekday_classes || {},
        weekday_terms: currentSettings?.weekday_terms || {},
        updated_at: new Date().toISOString()
      });

      // 1. Salva no banco de dados e no cache local
      await saveData('academic_settings', targetSettingsId, updatedSettings);
      try {
        localStorage.setItem(`academic_settings_${targetSettingsId}`, JSON.stringify(updatedSettings));
        localStorage.setItem(`academic_settings_${unitId}`, JSON.stringify(updatedSettings));
      } catch (e) {}

      // 2. Se habilitado recálculo de aulas para turmas do polo
      if (autoGenerateClasses && userAuth?.uid) {
        try {
          // Busca turmas ativas desta unidade
          const unitClasses = (classes || []).filter(c => isItemInUnit(c.unit_id || c.polo, unitId));

          // Limpa eventos automáticos antigos da unidade
          const preEvents = await fetchAll('calendar_events');
          const oldUnitEvents = (preEvents || []).filter((e: any) => {
            const desc = (e.description || '').toLowerCase();
            const title = (e.title || '').toLowerCase();
            const isAuto = e.type === 'class_day' || 
              e.type === 'start_term' || 
              e.type === 'end_term' || 
              desc.includes('cronograma automático') || 
              title.includes('dia de aula');
            if (!isAuto) return false;
            return isItemInUnit(e.unit_id, unitId);
          }).map((e: any) => e.id).filter(Boolean);

          if (oldUnitEvents.length > 0) {
            await deleteQuery('calendar_events', [{ field: 'id', operator: 'in', value: oldUnitEvents }]);
          }

          // Cria novos eventos para cada dia de aula selecionado
          const ranges = [
            { start: new Date(term1Start + 'T00:00:00'), end: new Date(term1End + 'T00:00:00') },
            { start: new Date(term2Start + 'T00:00:00'), end: new Date(term2End + 'T00:00:00') }
          ];

          const newEvents: any[] = [];
          for (const weekdayNum of selectedWeekdays) {
            for (const range of ranges) {
              if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) continue;
              const curr = new Date(range.start);
              while (curr <= range.end) {
                if (curr.getDay() === weekdayNum) {
                  const y = curr.getFullYear();
                  const m = String(curr.getMonth() + 1).padStart(2, '0');
                  const d = String(curr.getDate()).padStart(2, '0');
                  const dateStr = `${y}-${m}-${d}`;

                  const dayName = WEEKDAYS.find(w => w.num === weekdayNum)?.full || 'Dia de Aula';
                  newEvents.push({
                    title: `Aula - ${dayName} (${unitName})`,
                    start_date: dateStr,
                    end_date: dateStr,
                    type: 'class_day',
                    description: 'Cronograma automático do polo',
                    unit_id: unitId,
                    user_id: userAuth.uid,
                    created_at: new Date().toISOString()
                  });
                }
                curr.setDate(curr.getDate() + 1);
              }
            }
          }

          // Salva em lotes se houver eventos
          for (const ev of newEvents) {
            await saveData('calendar_events', undefined, ev);
          }
        } catch (genErr) {
          console.warn("Aviso ao regenerar eventos do calendário do polo:", genErr);
        }
      }

      window.dispatchEvent(new Event('academic-settings-updated'));
      window.dispatchEvent(new Event('units-updated'));
      onSaved(updatedSettings);

      setFeedback({ type: 'success', message: 'Cronograma próprio da unidade salvo com sucesso!' });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error("Erro ao salvar cronograma da unidade:", err);
      setFeedback({ type: 'error', message: 'Erro ao salvar: ' + (err.message || 'Falha de comunicação.') });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl max-w-2xl w-full overflow-hidden my-auto text-slate-800"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <Building2 size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">
                    Cronograma e Ciclo da Unidade
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 uppercase tracking-wider">
                    {unitName}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure os ciclos de aulas e atividades pedagógicas específicos desta filial/polo.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-8 h-8 rounded-lg hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
            {/* Feedback Alert */}
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 border ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {feedback.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                <span>{feedback.message}</span>
              </motion.div>
            )}

            {/* Regime de Cronograma */}
            <div className="space-y-2.5">
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block">
                Regime do Cronograma Letivo
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleMode('matriz')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    scheduleMode === 'matriz'
                      ? 'bg-blue-50/70 border-blue-500 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-slate-900">Padrão da Matriz</span>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      scheduleMode === 'matriz' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                    }`}>
                      {scheduleMode === 'matriz' && <Check size={10} strokeWidth={3} />}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    A filial adota rigorosamente as mesmas datas e semestres estabelecidos pela Sede / Matriz.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleMode('custom')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    scheduleMode === 'custom'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-600" />
                      Cronograma Próprio do Polo
                    </span>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      scheduleMode === 'custom' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                    }`}>
                      {scheduleMode === 'custom' && <Check size={10} strokeWidth={3} />}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Permite definir dias de aula específicos (ex: Sábado) e datas semestrais independentes para esta unidade.
                  </p>
                </button>
              </div>
            </div>

            {/* Parâmetros do Modo Customizado */}
            {scheduleMode === 'custom' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-6 pt-2 border-t border-slate-200/80"
              >
                {/* Ação Rápida: Copiar da Matriz */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Info size={15} className="text-blue-600" />
                    <span>Deseja preencher as datas baseadas na Matriz para começar?</span>
                  </div>
                  <button
                    type="button"
                    onClick={copyFromMatriz}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>Copiar da Matriz</span>
                  </button>
                </div>

                {/* Dias de Aula da Semana */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Dias de Aula no Polo
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {selectedWeekdays.length === 0 ? 'Nenhum dia selecionado' : `${selectedWeekdays.length} dia(s) ativo(s)`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Selecione os dias da semana em que esta filial realiza aulas:
                  </p>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 pt-1">
                    {WEEKDAYS.map(day => {
                      const isSelected = selectedWeekdays.includes(day.num);
                      return (
                        <button
                          key={day.num}
                          type="button"
                          onClick={() => toggleWeekday(day.num)}
                          className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span className="text-[11px] uppercase tracking-wider">{day.label}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-blue-300' : 'bg-slate-300'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Períodos Semestrais */}
                <div className="space-y-4">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block">
                    Vigência dos Semestres Letivos da Unidade
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1º Semestre */}
                    <div className="p-4 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-blue-900 font-bold text-xs uppercase tracking-wide">
                        <Calendar size={14} />
                        <span>1º Semestre Letivo</span>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Início do 1º Semestre
                          </label>
                          <input
                            type="date"
                            value={term1Start}
                            onChange={(e) => setTerm1Start(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Término do 1º Semestre
                          </label>
                          <input
                            type="date"
                            value={term1End}
                            onChange={(e) => setTerm1End(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 2º Semestre */}
                    <div className="p-4 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wide">
                        <Calendar size={14} />
                        <span>2º Semestre Letivo</span>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Início do 2º Semestre
                          </label>
                          <input
                            type="date"
                            value={term2Start}
                            onChange={(e) => setTerm2Start(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Término do Ano Letivo
                          </label>
                          <input
                            type="date"
                            value={term2End}
                            onChange={(e) => setTerm2End(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Opção de Geração Automática das Aulas */}
                <div className="p-3.5 bg-indigo-50/50 border border-indigo-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-start gap-2.5">
                    <CalendarDays size={18} className="text-indigo-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Atualizar Calendário Escolar da Unidade
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Gera as datas de aulas recorrentes no calendário exclusivo desta unidade com base nos dias e semestres acima.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={autoGenerateClasses}
                      onChange={(e) => setAutoGenerateClasses(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Salvando Cronograma...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>Salvar Cronograma</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
