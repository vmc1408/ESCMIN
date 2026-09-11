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
