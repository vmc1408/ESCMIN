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
    subjects: 'Disciplinas'
  };

  const isDone = !status.isProcessing && status.progress === 100;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-6 right-6 z-[9999] w-96 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        <div className={cn(
          "p-4 flex items-center justify-between border-b border-slate-50",
          isDone ? "bg-green-50" : "bg-blue-50"
        )}>
          <div className="flex items-center gap-3">
            {status.isProcessing ? (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            ) : isDone ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <span className="font-bold text-[#131b2e] text-sm">
              {status.isProcessing ? `Importando ${typeLabels[status.type!]}` : isDone ? 'Importação Concluída' : 'Erro na Importação'}
            </span>
          </div>
          <button 
            onClick={resetImport}
            className="p-1 hover:bg-slate-200/50 rounded-full transition-colors text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Progresso</span>
            <span>{status.progress}%</span>
          </div>

          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${status.progress}%` }}
              className={cn(
                "h-full transition-all duration-300",
                isDone ? "bg-green-500" : "bg-blue-600"
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-2xl">
              <p className="text-xl font-black text-[#131b2e]">{status.total}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Total</p>
            </div>
            <div className={cn("p-3 rounded-2xl", isDone ? "bg-green-50" : "bg-blue-50")}>
              <p className={cn("text-xl font-black", isDone ? "text-green-600" : "text-blue-600")}>
                {status.imported}
              </p>
              <p className={cn("text-[10px] font-bold uppercase", isDone ? "text-green-400" : "text-blue-400")}>
                Sincronizados
              </p>
            </div>
          </div>

          {status.error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-600 text-[11px] font-medium">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p>{status.error}</p>
            </div>
          )}

          {isDone && (
            <button 
              onClick={() => {
                navigate(`/${status.type}`);
                resetImport();
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm text-xs uppercase tracking-wider"
            >
              <ExternalLink size={16} />
              Ver {typeLabels[status.type!]}
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
