import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronDown, Check, GraduationCap, ExternalLink } from 'lucide-react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Se por ventura a unidade ativa estiver como 'all' (legado), migra imediatamente para a Matriz ou primeira unidade válida
  useEffect(() => {
    if (selectedUnitId === 'all' && activeUnits.length > 0) {
      const mainUnit = activeUnits.find(u => u.is_main || u.id === 'matriz') || activeUnits[0];
      if (mainUnit) {
        setSelectedUnitId(mainUnit.id);
      }
    }
  }, [selectedUnitId, activeUnits, setSelectedUnitId]);

  // Fechar ao clicar fora (sem desfocar o restante da tela)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Fechar com a tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Se não há unidades cadastradas, não exibe
  if (!hasMultipleUnits && !isRestricted && activeUnits.length === 0) {
    return null;
  }

  const currentUnitTheme = getUnitColorTheme(selectedUnit || selectedUnitId);
  const currentUnitDisplayName = getUnitName(selectedUnitId) || selectedUnit?.name || 'Sede / Matriz';

  return (
    <div className="px-3 pt-2 pb-2 border-b border-slate-800/80 shrink-0 select-none relative" ref={dropdownRef}>
      {!canSwitchUnit ? (
        // Modo estático para Docentes ou Usuários com Unidade Fixa
        isTeacherUser ? (
          <div 
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-200 shadow-2xs"
            title="Perfil Docente: Acesso direto às turmas sob sua regência pedagógica."
          >
            <div className="w-6 h-6 rounded-md bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <GraduationCap size={13} />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-bold text-white text-xs truncate">
                {profile?.name || 'Docente'}
              </span>
              <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block animate-pulse"></span>
                Área Docente
              </span>
            </div>
          </div>
        ) : (
          <div 
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-200 shadow-2xs"
            title={`Unidade vinculada: ${currentUnitDisplayName}`}
          >
            <div className="w-6 h-6 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Building2 size={13} />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-bold text-white text-xs truncate">
                {currentUnitDisplayName}
              </span>
              <span className="text-[8px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
                Unidade Atribuída
              </span>
            </div>
          </div>
        )
      ) : (
        // Seletor com Menu Flutuante Suave (não empurra nem desfoca a sidebar)
        <>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer group shadow-2xs",
              isOpen 
                ? "bg-slate-800 border-blue-500/60 text-white" 
                : "bg-slate-800/50 hover:bg-slate-800/90 border-slate-700/60 hover:border-slate-600 text-slate-200"
            )}
            title="Clique para alternar a unidade operacional"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                "w-2 h-2 rounded-full inline-block shrink-0 shadow-2xs",
                currentUnitTheme.dotIndicator || "bg-blue-400"
              )} />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-slate-100 text-xs truncate group-hover:text-white transition-colors">
                  {currentUnitDisplayName}
                </span>
                <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">
                  Unidade Ativa
                </span>
              </div>
            </div>

            <ChevronDown 
              size={13} 
              className={cn(
                "text-slate-400 group-hover:text-slate-200 transition-transform duration-150 shrink-0",
                isOpen && "rotate-180 text-blue-400"
              )} 
            />
          </button>

          {/* Menu Flutuante Suspenso (Overlay Suave - não empurra o layout) */}
          {isOpen && (
            <div 
              className="absolute left-2 right-2 top-full mt-1.5 bg-slate-900 border border-slate-700/90 shadow-2xl rounded-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2 py-1 text-[8.5px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between border-b border-slate-800 pb-1 mb-1">
                <span>Unidades Operacionais</span>
                <span className="text-[8px] text-blue-400 font-semibold bg-blue-950/80 px-1.5 py-0.2 rounded border border-blue-800/60">
                  {activeUnits.length} {activeUnits.length === 1 ? 'Polo' : 'Polos'}
                </span>
              </div>

              {/* Lista apenas com as Unidades Reais (sem opção "Todas as unidades") */}
              <div className="space-y-0.5 max-h-52 overflow-y-auto custom-scrollbar">
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
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-left border",
                        isSelected
                          ? "bg-blue-600 text-white border-blue-500 shadow-2xs font-bold"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1.5">
                        <span className={cn(
                          "w-2 h-2 rounded-full inline-block shrink-0 ring-1",
                          isSelected ? "bg-white ring-blue-300" : `${uTheme.dotIndicator} ring-slate-700`
                        )} />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate text-[11px] font-bold">{u.name}</span>
                          {u.code && (
                            <span className={cn(
                              "text-[8.5px] font-mono leading-tight",
                              isSelected ? "text-blue-100" : "text-slate-400"
                            )}>
                              {u.code}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className={cn(
                          "text-[8px] font-bold px-1.5 py-0.2 rounded border",
                          isSelected
                            ? "bg-blue-700 border-blue-400 text-white"
                            : isMain
                            ? "bg-blue-950/80 border-blue-800/80 text-blue-300"
                            : "bg-slate-800 border-slate-700 text-slate-400"
                        )}>
                          {isMain ? 'Matriz' : 'Filial'}
                        </span>
                        {isSelected && <Check size={13} className="text-white shrink-0 ml-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Atalho para Gerenciamento */}
              <div className="pt-1 mt-1 border-t border-slate-800">
                <Link
                  to="/settings?tab=units"
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center justify-center gap-1 py-1 text-[10px] font-bold text-slate-400 hover:text-blue-300 hover:bg-slate-800/60 rounded-md transition-colors"
                >
                  <Building2 size={11} />
                  <span>Gerenciar Unidades</span>
                  <ExternalLink size={9} className="opacity-70" />
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
