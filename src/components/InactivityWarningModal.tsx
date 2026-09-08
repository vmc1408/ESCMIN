import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Clock, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const InactivityWarningModal: React.FC = () => {
  const { 
    showInactivityWarning, 
    inactivityRemaining, 
    extendSession, 
    logout, 
    isLocked, 
    user 
  } = useAuth();

  if (!showInactivityWarning || isLocked || !user) {
    return null;
  }

  const minutes = Math.floor(inactivityRemaining / 60);
  const seconds = inactivityRemaining % 60;
  const formattedTime = minutes > 0 
    ? `${minutes}:${seconds.toString().padStart(2, '0')}` 
    : `${seconds}s`;

  return (
    <AnimatePresence>
      <div 
        id="inactivity-warning-backdrop"
        className="fixed inset-0 z-[9998] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          id="inactivity-warning-modal"
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden"
        >
          {/* Top colored accent bar */}
          <div className="h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 animate-pulse" />

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
                <ShieldAlert className="w-6 h-6 animate-bounce" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-block">
                  Segurança da Sessão
                </span>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Sessão Expirando por Inatividade
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Para proteger os dados acadêmicos e administrativos contra acessos indevidos, seu acesso será desconectado automaticamente.
                </p>
              </div>
            </div>

            {/* Countdown Badge */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center">
                  <Clock size={18} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-amber-900">Tempo Restante</div>
                  <div className="text-[10px] text-amber-700 font-medium">Ação necessária para manter-se conectado</div>
                </div>
              </div>

              <div className="text-2xl font-black font-mono text-amber-700 px-3 py-1 bg-white rounded-lg border border-amber-200 shadow-sm">
                {formattedTime}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
              <button
                id="btn-inactivity-logout-now"
                type="button"
                onClick={() => logout('manual')}
                className="w-full sm:w-1/3 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut size={14} />
                Sair Agora
              </button>

              <button
                id="btn-inactivity-continue"
                type="button"
                onClick={extendSession}
                className="w-full sm:w-2/3 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/25 transition-all flex items-center justify-center gap-2"
                autoFocus
              >
                <CheckCircle2 size={16} />
                Continuar Conectado
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
