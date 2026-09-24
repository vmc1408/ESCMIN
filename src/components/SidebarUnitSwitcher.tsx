import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronDown, Check, GraduationCap, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUnits } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { getUnitColorTheme } from '../lib/unitColors';
import { cn } from '../lib/utils';

export function SidebarUnitSwitcher() {
  const { profile } = useAuth();
  const { 
    activeUnits, 
    hasMultipleUnits, 
    selectedUnitId, 
    setSelectedUnitId, 
    selectedUnit, 
    isRestricted, 
    canSwitchUnit, 
    isTeacherUser, 
    getUnitName 
  } = useUnits();

  const [isOpen, setIsOpen] = useState(false);

  // If there are no units configured and no multiple units, do not render
  if (!hasMultipleUnits && !isRestricted && activeUnits.length === 0) {
    return null;
  }

  const currentUnitTheme = getUnitColorTheme(selectedUnit || selectedUnitId);
  const currentUnitDisplayName = selectedUnitId === 'all' 
    ? 'Todas as Unidades' 
    : (getUnitName(selectedUnitId) || selectedUnit?.name || 'Sede / Matriz');

  return (
    <div className="px-3 pt-2.5 pb-2 border-b border-slate-800/80 shrink-0 select-none">
      {!canSwitchUnit ? (
        // Read-only indicator for Restricted Users or Teachers
        isTeacherUser ? (
          <div 
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-200 shadow-2xs"
            title="Perfil Docente: Acesso direto às turmas sob sua regência pedagógica."
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <GraduationCap size={15} />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-bold text-white text-xs truncate">
                {profile?.name || 'Docente'}
              </span>
              <span className="text-[8.5px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block animate-pulse"></span>
                Área Docente
              </span>
            </div>
          </div>
        ) : (
          <div 
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-200 shadow-2xs"
            title={`Unidade vinculada: ${currentUnitDisplayName}`}
          >
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Building2 size={15} />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-bold text-white text-xs truncate">
                {currentUnitDisplayName}
              </span>
              <span className="text-[8.5px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
                Unidade Atribuída
              </span>
            </div>
          </div>
        )
      ) : (
        // Interactive Switcher Button with smooth Accordion
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer group shadow-2xs",
              isOpen 
                ? "bg-slate-800 border-blue-500/50 text-white ring-1 ring-blue-500/20" 
                : "bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600 text-slate-200"
            )}
            title="Alternar unidade operacional ativa"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
                selectedUnitId === 'all' 
                  ? "bg-slate-700/70 border-slate-600/80 text-slate-300 group-hover:text-white" 
                  : "bg-blue-950/60 border-blue-500/40 text-blue-400"
              )}>
                <Building2 size={14} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-slate-100 text-xs truncate group-hover:text-white transition-colors">
                  {currentUnitDisplayName}
                </span>
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mt-0.5">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full inline-block",
                    selectedUnitId === 'all' ? "bg-slate-400" : currentUnitTheme.dotIndicator || "bg-blue-400"
                  )} />
                  {selectedUnitId === 'all' ? 'Filtro Consolidado' : 'Unidade Ativa'}
                </span>
              </div>
            </div>

            <ChevronDown 
              size={14} 
              className={cn(
                "text-slate-400 group-hover:text-slate-200 transition-transform duration-200 shrink-0",
                isOpen && "rotate-180 text-blue-400"
              )} 
            />
          </button>

          {/* Smooth expanding unit list */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 my-1">
                  <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span>Alternar Escopo</span>
                    <span className="text-[8px] text-blue-400 font-semibold bg-blue-950/80 px-1.5 py-0.2 rounded border border-blue-800/60">
                      Multiunidade
                    </span>
                  </div>

                  {/* Todas as Unidades */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUnitId('all');
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-left border",
                      selectedUnitId === 'all'
                        ? "bg-blue-600 text-white border-blue-500 shadow-2xs font-bold"
                        : "text-slate-300 hover:bg-slate-800/90 hover:text-white border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1.5">
                      <span className={cn(
                        "w-2 h-2 rounded-full inline-block shrink-0",
                        selectedUnitId === 'all' ? "bg-white" : "bg-slate-500"
                      )} />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-[11px] font-bold">Todas as Unidades</span>
                        <span className={cn(
                          "text-[9px] font-normal leading-tight",
                          selectedUnitId === 'all' ? "text-blue-100" : "text-slate-400"
                        )}>
                          Consolidado (Todas)
                        </span>
                      </div>
                    </div>
                    {selectedUnitId === 'all' && <Check size={14} className="text-white shrink-0" />}
                  </button>

                  <div className="h-px bg-slate-800 my-1" />

                  {/* Lista de Unidades Ativas */}
                  <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                    {activeUnits.map(u => {
                      const isMain = u.is_main || u.id === 'matriz';
                      const isSelected = selectedUnitId === u.id;
                      const uTheme = getUnitColorTheme(u);

                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedUnitId(u.id);
                            setIsOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-left border",
                            isSelected
                              ? "bg-blue-600 text-white border-blue-500 shadow-2xs font-bold"
                              : "text-slate-300 hover:bg-slate-800/90 hover:text-white border-transparent"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-1.5">
                            <span className={cn(
                              "w-2 h-2 rounded-full inline-block shrink-0",
                              isSelected ? "bg-white" : uTheme.dotIndicator
                            )} />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate text-[11px] font-bold">{u.name}</span>
                              {u.code && (
                                <span className={cn(
                                  "text-[9px] font-mono leading-tight",
                                  isSelected ? "text-blue-100" : "text-slate-400"
                                )}>
                                  Cód: {u.code}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn(
                              "text-[8.5px] font-bold px-1.5 py-0.2 rounded border",
                              isSelected
                                ? "bg-blue-700 border-blue-400 text-white"
                                : isMain
                                ? "bg-blue-950/80 border-blue-800/80 text-blue-300"
                                : "bg-slate-800 border-slate-700 text-slate-400"
                            )}>
                              {isMain ? 'Matriz' : 'Filial'}
                            </span>
                            {isSelected && <Check size={14} className="text-white shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Gerenciar Unidades */}
                  <div className="pt-1 border-t border-slate-800">
                    <Link
                      to="/settings?tab=units"
                      onClick={() => setIsOpen(false)}
                      className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold text-slate-400 hover:text-blue-300 hover:bg-slate-800/60 rounded-lg transition-colors"
                    >
                      <Building2 size={11} />
                      <span>Gerenciar Unidades</span>
                      <ExternalLink size={10} className="opacity-70" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
