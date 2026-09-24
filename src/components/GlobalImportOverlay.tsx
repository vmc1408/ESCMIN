import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, X, ExternalLink } from 'lucide-react';
import { useImport } from '../contexts/ImportContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export function GlobalImportOverlay() {
  const { status, resetImport } = useImport();
  const navigate = useNavigate();

  if (!status.type && !status.isProcessing) return null;

  const typeLabels: Record<string, string> = {
    students: 'Alunos',
    teachers: 'Professores',
    classes: 'Turmas',
    subjects: 'Disciplinas',
    parishes: 'Paróquias',
    foraries: 'Foranias',
    clergy_leity: 'Clero e Leigos',
    courses: 'Cursos'
  };

  const isDone = !status.isProcessing && status.progress === 100;
  const currentTypeName = (status.type && typeLabels[status.type]) || 'Registros';

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        style={{ zIndex: 99999 }}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[99999] w-[calc(100vw-2rem)] sm:w-96 max-w-full bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden isolate pointer-events-auto"
      >
        <div className={cn(
          "p-4 flex items-center justify-between border-b transition-colors",
          isDone ? "bg-emerald-50/90 border-emerald-100" : status.error ? "bg-red-50/90 border-red-100" : "bg-blue-50/90 border-blue-100"
        )}>
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className={cn(
              "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-2xs",
              isDone ? "bg-emerald-100 text-emerald-700" : status.error ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
            )}>
              {status.isProcessing ? (
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              ) : isDone ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 text-sm truncate">
                {status.isProcessing ? `Importando ${currentTypeName}` : isDone ? 'Importação Concluída' : 'Erro na Importação'}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {status.isProcessing ? 'Sincronizando com a base de dados' : isDone ? 'Todos os registros foram salvos' : 'Ação interrompida'}
              </span>
            </div>
          </div>
          <button 
            onClick={resetImport}
            type="button"
            title="Fechar notificação"
            className="shrink-0 p-1.5 hover:bg-slate-200/70 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Progresso</span>
            <span className="font-mono text-slate-800 font-extrabold">{status.progress}%</span>
          </div>

          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isDone ? "bg-emerald-500" : status.error ? "bg-red-500" : "bg-blue-600"
              )}
            />
          </div>

          {status.isProcessing && status.currentStepText && (
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
              <span className="truncate text-[11px] font-medium">
                {status.currentStepText}
              </span>
            </div>
          )}

          {status.isProcessing && status.currentItemName && (
            <div className="text-[11px] text-slate-500 truncate px-1">
              Processando: <span className="font-semibold text-slate-700">{status.currentItemName}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <p className="text-xl font-black text-slate-800">{status.total}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Registros</p>
            </div>
            <div className={cn(
              "p-3 rounded-2xl border", 
              isDone ? "bg-emerald-50/80 border-emerald-100" : "bg-blue-50/80 border-blue-100"
            )}>
              <p className={cn("text-xl font-black", isDone ? "text-emerald-700" : "text-blue-700")}>
                {status.imported}
              </p>
              <p className={cn("text-[10px] font-bold uppercase tracking-wider", isDone ? "text-emerald-600" : "text-blue-600")}>
                Sincronizados
              </p>
            </div>
          </div>

          {status.error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-600 text-[11px] font-medium">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
              <p className="break-words leading-relaxed">{status.error}</p>
            </div>
          )}

          {isDone && (
            <button 
              type="button"
              onClick={() => {
                if (status.type) {
                  navigate(`/${status.type}`);
                }
                resetImport();
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer"
            >
              <ExternalLink size={16} />
              Ver {currentTypeName}
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
