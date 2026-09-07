import React from 'react';
import { AlertTriangle, ShieldAlert, Building2, Plus, ArrowRight } from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';

export interface UnitConflictBannerProps {
  moduleName: string;
  entityNameSingular?: string;
  entityNamePlural?: string;
  totalRecordsAllUnits: number;
  recordsInActiveUnit: number;
  selectedItemUnit?: string;
  selectedItemName?: string;
  className?: string;
  onAddNewInActiveUnit?: () => void;
}

export const UnitConflictBanner: React.FC<UnitConflictBannerProps> = ({
  moduleName,
  entityNameSingular = 'registro',
  entityNamePlural = 'registros',
  totalRecordsAllUnits,
  recordsInActiveUnit,
  selectedItemUnit,
  selectedItemName,
  className = '',
  onAddNewInActiveUnit
}) => {
  const { selectedUnitId, selectedUnit, units, getUnitName, isItemInActiveUnit, setSelectedUnitId, isRestricted } = useUnits();

  // If viewing all units or no unit selected, no conflict exists
  if (!selectedUnitId || selectedUnitId === 'all' || selectedUnitId.toLowerCase() === 'todas') {
    return null;
  }

  const activeUnitName = selectedUnit?.name || getUnitName(selectedUnitId) || 'Polo Selecionado';

  // 1. Conflito de Item Selecionado (ex: o usuário abriu um aluno, turma ou professor que pertence a OUTRA unidade)
  const isSelectedItemConflicting = Boolean(
    selectedItemUnit && 
    selectedItemUnit.trim() !== '' && 
    !isItemInActiveUnit(selectedItemUnit)
  );

  if (isSelectedItemConflicting) {
    const itemUnitName = getUnitName(selectedItemUnit);
    return (
      <div className={`bg-rose-50/95 border-2 border-rose-400 p-4 sm:p-5 rounded-xl shadow-sm text-rose-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}>
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest bg-rose-200 text-rose-900 px-2 py-0.5 rounded">
                Conflito Crítico de Polo
              </span>
              <span className="text-[11px] font-black text-rose-900 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                Polo Ativo: {activeUnitName}
              </span>
              <span className="text-[11px] font-bold text-rose-800 bg-white/80 px-2 py-0.5 rounded border border-rose-200">
                Polo do Item: {itemUnitName}
              </span>
            </div>
            <h4 className="text-sm font-bold text-rose-950 leading-snug">
              O item {selectedItemName ? `"${selectedItemName}"` : `selecionado`} pertence ao polo "{itemUnitName}", divergindo da unidade ativa.
            </h4>
            <p className="text-xs text-rose-800 font-medium leading-relaxed pt-0.5">
              Por regra de isolamento institucional, as informações e alterações devem ser realizadas no polo de origem do registro para evitar contaminação de dados.
            </p>
          </div>
        </div>

        {!isRestricted && selectedItemUnit && (
          <button
            type="button"
            onClick={() => setSelectedUnitId(selectedItemUnit)}
            className="shrink-0 self-end sm:self-center px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>Alternar para {itemUnitName}</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    );
  }

  // 2. Conflito de Unidade Vazia: Há registros no sistema em outros polos, mas ZERO neste polo ativo
  const hasHiddenOtherUnitRecords = totalRecordsAllUnits > 0 && recordsInActiveUnit === 0;

  if (hasHiddenOtherUnitRecords) {
    return (
      <div className={`bg-amber-50/95 border-2 border-amber-300 p-4 sm:p-5 rounded-xl shadow-xs text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}>
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
            <Building2 size={20} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                Regra de Polo / Unidade
              </span>
              <span className="text-[11px] font-black text-amber-950 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                Polo Selecionado: {activeUnitName}
              </span>
              <span className="text-[9px] font-bold text-amber-800 bg-white/70 px-2 py-0.5 rounded border border-amber-200">
                Módulo: {moduleName}
              </span>
            </div>
            <h4 className="text-sm font-bold text-amber-950 leading-snug">
              Nenhum(a) {entityNameSingular} vinculado(a) à unidade "{activeUnitName}".
            </h4>
            <p className="text-xs text-amber-800 font-medium leading-relaxed pt-0.5">
              Existem {totalRecordsAllUnits} {entityNamePlural} cadastrado(s) em outros polos da instituição. Conforme a regra de isolamento de unidade, eles foram ocultados para garantir que apenas os dados deste polo sejam exibidos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-amber-200/80 text-amber-950 border border-amber-300 flex items-center gap-1.5">
            <ShieldAlert size={13} />
            Isolamento de Polo Ativo
          </span>
          {onAddNewInActiveUnit && (
            <button
              type="button"
              onClick={onAddNewInActiveUnit}
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>Novo em {activeUnitName}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. Quando há registros neste polo e outros ocultados: exibição sutil/elegante confirmando o isolamento
  if (totalRecordsAllUnits > recordsInActiveUnit && recordsInActiveUnit > 0) {
    const hiddenCount = totalRecordsAllUnits - recordsInActiveUnit;
    return (
      <div className={`bg-slate-50 border border-slate-200/90 px-3.5 py-2 rounded-lg flex items-center justify-between gap-3 text-slate-700 text-xs font-medium ${className}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="font-bold text-slate-900">Polo Ativo: {activeUnitName}</span>
          <span className="text-slate-500">•</span>
          <span>Exibindo <strong>{recordsInActiveUnit}</strong> {recordsInActiveUnit === 1 ? entityNameSingular : entityNamePlural} deste polo</span>
          <span className="text-slate-400">({hiddenCount} de outros polos ocultado{hiddenCount === 1 ? '' : 's'})</span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0 hidden sm:inline-block">
          Isolado por Polo
        </span>
      </div>
    );
  }

  return null;
};
