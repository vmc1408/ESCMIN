import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, CheckSquare, Square, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchAll } from '../lib/database';

interface HabilitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTargetYear?: string;
  onUpdated?: () => void;
  classes?: any[];
  students?: any[];
}

export function HabilitationModal({
  isOpen,
  onClose,
  initialTargetYear = '2027',
  onUpdated,
  classes: propClasses,
  students: propStudents
}: HabilitationModalProps) {
  const [targetYear, setTargetYear] = useState<string>(initialTargetYear);
  const [internalClasses, setInternalClasses] = useState<any[]>([]);
  const [internalStudents, setInternalStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Persistent record of classes explicitly habilitated / promoted for future academic years (e.g. 2027)
  const [habilitatedMap, setHabilitatedMap] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('academic_habilitated_classes_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error('Error reading habilitation map:', e);
    }
    return {};
  });

  useEffect(() => {
    if (initialTargetYear) {
      setTargetYear(initialTargetYear);
    }
  }, [initialTargetYear]);

  // Load classes and students if not passed as props
  useEffect(() => {
    if (!isOpen) return;

    if (!propClasses || !propStudents) {
      setLoading(true);
      Promise.all([
        propClasses ? Promise.resolve(propClasses) : fetchAll('classes'),
        propStudents ? Promise.resolve(propStudents) : fetchAll('students')
      ]).then(([cls, stds]) => {
        if (!propClasses) setInternalClasses(cls || []);
        if (!propStudents) setInternalStudents(stds || []);
      }).catch(err => {
        console.error('Error loading data for habilitation modal:', err);
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [isOpen, propClasses, propStudents]);

  const activeClasses = propClasses || internalClasses;
  const activeStudents = propStudents || internalStudents;

  // Helper to extract start year for a class
  const getClassStartYear = useCallback((c: any): number => {
    if (!c || c.unallocated) return 2026;

    const extractYear = (val: any): number | null => {
      if (!val) return null;
      const str = String(val).trim();
      if (/^\d{4}$/.test(str)) {
        const num = Number(str);
        if (num >= 1990 && num <= 2100) return num;
      }
      const ddmmyyyy = str.match(/\b\d{1,2}\/\d{1,2}\/(\d{4})\b/);
      if (ddmmyyyy && ddmmyyyy[1]) {
        const num = Number(ddmmyyyy[1]);
        if (num >= 1990 && num <= 2100) return num;
      }
      const yyyymmdd = str.match(/\b(\d{4})-\d{1,2}-\d{1,2}\b/);
      if (yyyymmdd && yyyymmdd[1]) {
        const num = Number(yyyymmdd[1]);
        if (num >= 1990 && num <= 2100) return num;
      }
      const genericYear = str.match(/\b(19\d{2}|20\d{2})\b/);
      if (genericYear && genericYear[1]) {
        const num = Number(genericYear[1]);
        if (num >= 1990 && num <= 2100) return num;
      }
      return null;
    };

    const fromYearField = extractYear(c.year);
    if (fromYearField) return fromYearField;

    const fromName = extractYear(c.name);
    if (fromName) return fromName;

    const fromCode = extractYear(c.code);
    if (fromCode) return fromCode;

    const fromStartDate = extractYear(c.start_date);
    if (fromStartDate) return fromStartDate;

    const fromCreated = extractYear(c.created_at);
    if (fromCreated) return fromCreated;

    return 2026;
  }, []);

  const toggleClassHabilitation = useCallback((year: string, classId: string) => {
    setHabilitatedMap(prev => {
      const currentList = prev[year] || [];
      const nextList = currentList.includes(classId)
        ? currentList.filter(id => id !== classId)
        : [...currentList, classId];
      const nextMap = { ...prev, [year]: nextList };
      try {
        localStorage.setItem('academic_habilitated_classes_v1', JSON.stringify(nextMap));
      } catch (e) {
        console.error(e);
      }
      return nextMap;
    });
  }, []);

  const setAllCohortsHabilitation = useCallback((year: string, classIds: string[], enable: boolean) => {
    setHabilitatedMap(prev => {
      const currentList = prev[year] || [];
      let nextList: string[];
      if (enable) {
        nextList = Array.from(new Set([...currentList, ...classIds]));
      } else {
        nextList = currentList.filter(id => !classIds.includes(id));
      }
      const nextMap = { ...prev, [year]: nextList };
      try {
        localStorage.setItem('academic_habilitated_classes_v1', JSON.stringify(nextMap));
      } catch (e) {
        console.error(e);
      }
      return nextMap;
    });
  }, []);

  const eligibleCohorts = useMemo(() => {
    const targetYrNum = parseInt(targetYear, 10);
    if (isNaN(targetYrNum)) return [];

    const isClassActive = (c: any) => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo';

    return activeClasses
      .filter(c => {
        if (c.unallocated) return false;
        const startYr = getClassStartYear(c);
        return startYr <= 2026 && isClassActive(c);
      })
      .map(c => {
        const startYr = getClassStartYear(c);
        const yearDiff = targetYrNum - startYr;
        const projectedLevel =
          yearDiff <= 0 ? '1º Ano' :
          yearDiff === 1 ? '2º Ano' :
          yearDiff === 2 ? '3º Ano' :
          yearDiff === 3 ? '4º Ano' :
          'Curso Extra';

        const isHabilitated =
          (habilitatedMap[targetYear] || []).includes(c.id) ||
          Boolean(
            (c.observations && (c.observations.includes(`habilitada_${targetYrNum}`) || c.observations.includes(`enabled_for_${targetYrNum}`))) ||
            (Array.isArray(c.enabled_years) && c.enabled_years.includes(String(targetYrNum)))
          );

        const count = activeStudents.filter(s =>
          (s.status === 'Ativo' || !s.status) &&
          (s.class_id === c.id || (s as any).current_class_id === c.id)
        ).length;

        return {
          ...c,
          startYr,
          projectedLevel,
          isHabilitated,
          activeStudentsCount: count
        };
      })
      .sort((a, b) => b.startYr - a.startYr);
  }, [activeClasses, activeStudents, targetYear, habilitatedMap, getClassStartYear]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-[999]">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Habilitação de Turmas para o Ano Letivo {targetYear}
              </h3>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                Ciclo Vigente: 2026 • Gestão de Continuidade e Progressão de Coortes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4 bg-white">
          {/* Painel Explicativo */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-lg flex items-start gap-3">
            <Info size={18} className="text-blue-700 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900 leading-relaxed">
              No momento vigente (<strong>2026</strong>), as turmas ativas de anos anteriores (<strong>2026, 2025, 2024 e 2023</strong>) 
              permanecem alocadas no ciclo de 2026. Para que constem em <strong>{targetYear}</strong>, você deve habilitá-las abaixo.
            </p>
          </div>

          {/* Seletor de Ano Alvo & Ações em Massa */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Ano Alvo:</span>
              <select
                value={targetYear}
                onChange={(e) => setTargetYear(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded px-2.5 py-1 outline-none cursor-pointer hover:bg-slate-200/70 transition-all"
              >
                <option value="2027">2027 (Próximo Ciclo)</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
                <option value="2030">2030</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allIds = eligibleCohorts.map(c => c.id);
                  setAllCohortsHabilitation(targetYear, allIds, true);
                }}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-xs font-bold transition-all cursor-pointer"
              >
                <CheckSquare size={13} />
                <span>Habilitar Todas</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const allIds = eligibleCohorts.map(c => c.id);
                  setAllCohortsHabilitation(targetYear, allIds, false);
                }}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded text-xs font-bold transition-all cursor-pointer"
              >
                <Square size={13} />
                <span>Desabilitar Todas</span>
              </button>
            </div>
          </div>

          {/* Lista de Coortes Ativas Elegíveis */}
          <div className="space-y-2.5">
            {loading ? (
              <div className="text-center py-8 text-slate-400 text-xs font-medium animate-pulse">
                Carregando turmas e dados acadêmicos...
              </div>
            ) : eligibleCohorts.length > 0 ? (
              eligibleCohorts.map((c, cIdx) => (
                <div
                  key={`hab-c-${c.id || c.code || cIdx}-${cIdx}`}
                  className={cn(
                    "p-3.5 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                    c.isHabilitated
                      ? "bg-emerald-50/40 border-emerald-200"
                      : "bg-slate-50/60 border-slate-200 opacity-80 hover:opacity-100"
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                      c.isHabilitated ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
                    )}>
                      {c.code || c.name.substring(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-slate-900 leading-tight">{c.name}</h4>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                          c.isHabilitated 
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-200" 
                            : "bg-slate-200 text-slate-600"
                        )}>
                          {c.isHabilitated ? `Habilitada em ${targetYear}` : `Não Habilitada em ${targetYear}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10.5px] text-slate-500 mt-1 flex-wrap font-medium">
                        <span>Ingresso: <strong>{c.startYr}</strong></span>
                        <span>•</span>
                        <span className="text-indigo-700 font-bold">Progressão: {c.projectedLevel} em {targetYear}</span>
                        <span>•</span>
                        <span>{c.activeStudentsCount} Alunos Ativos</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => toggleClassHabilitation(targetYear, c.id)}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs",
                        c.isHabilitated
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
                      )}
                    >
                      {c.isHabilitated ? (
                        <>
                          <CheckCircle2 size={15} />
                          <span>Habilitada</span>
                        </>
                      ) : (
                        <>
                          <Square size={15} className="text-slate-400" />
                          <span>Habilitar para {targetYear}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs font-medium">
                Nenhuma turma ativa encontrada para habilitação.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            {eligibleCohorts.filter(c => c.isHabilitated).length} de {eligibleCohorts.length} turmas habilitadas para {targetYear}
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onUpdated) {
                onUpdated();
              }
            }}
            className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs"
          >
            Concluir & Atualizar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
