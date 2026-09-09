import React from 'react';
import { GraduationCap, AlertTriangle, Check, ShieldAlert } from 'lucide-react';
import { TeacherScope } from '../lib/teacherScope';

interface TeacherScopeBannerProps {
  scope: TeacherScope;
  availableClassesCount: number;
  className?: string;
}

export const TeacherScopeBanner: React.FC<TeacherScopeBannerProps> = ({
  scope,
  availableClassesCount,
  className = ''
}) => {
  if (!scope.isTeacherRole) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Alerta de Conflito de Unidade / Polo */}
      {scope.hasUnitConflict && (
        <div className="bg-amber-50/90 border-2 border-amber-300 p-4 sm:p-5 rounded-none sm:rounded-xl shadow-xs text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <AlertTriangle size={20} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                  Regra de Polo / Unidade
                </span>
                {scope.activeUnitName && (
                  <span className="text-[11px] font-black text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-200">
                    Polo Selecionado: {scope.activeUnitName}
                  </span>
                )}
                <span className="text-[9px] font-bold text-amber-800">
                  {scope.teacherName}
                </span>
              </div>
              <h4 className="text-sm font-bold text-amber-950 leading-snug">
                {scope.conflictMessage}
              </h4>
              {scope.otherUnitClasses && scope.otherUnitClasses.length > 0 && (
                <p className="text-xs text-amber-800 font-medium leading-relaxed pt-0.5">
                  As turmas atribuídas à docente ({scope.otherUnitClasses.map(o => `${o.name} [${o.unitName}]`).join(', ')}) pertencem a outra unidade e foram ocultadas para manter a integridade acadêmica deste polo.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-amber-200/80 text-amber-950 border border-amber-300 flex items-center gap-1.5">
              <ShieldAlert size={13} />
              Isolamento por Unidade
            </span>
          </div>
        </div>
      )}

      {/* Banner Padrão de Modo Docente (quando não há conflito total) */}
      {(!scope.hasUnitConflict || scope.hasAccess) && (
        <div className="bg-indigo-50/80 border border-indigo-100 p-4 rounded-none sm:rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <GraduationCap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[8px] font-black uppercase tracking-widest bg-indigo-200/80 text-indigo-800 px-2 py-0.5 rounded">
                  Modo Docente
                </span>
                {scope.teacher ? (
                  <span className="text-[11px] font-black text-indigo-950">
                    {scope.teacher.name}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-800">
                    Docente não vinculado
                  </span>
                )}
                {scope.activeUnitName && (
                  <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded">
                    Polo: {scope.activeUnitName}
                  </span>
                )}
              </div>
              <p className="text-[9px] font-medium text-indigo-700 mt-0.5">
                {scope.hasAccess 
                  ? (scope.isMultiUnitTeacher 
                      ? `Exibindo as ${availableClassesCount} turma(s) e ${scope.allowedSubjectIds.size} disciplina(s) sob sua regência docente nos polos: ${(scope.unitsTaught || []).join(', ')}.`
                      : `Exibindo as ${availableClassesCount} turma(s) e ${scope.allowedSubjectIds.size} disciplina(s) atribuídas à sua escala de aulas nesta unidade.`)
                  : scope.emptyReason}
              </p>
            </div>
          </div>
          {scope.hasAccess && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded border border-emerald-200 flex items-center gap-1">
                <Check size={11} />
                Acesso Restrito & Seguro
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
