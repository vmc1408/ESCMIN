import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, AlertCircle, Shield } from 'lucide-react';
import { motion } from 'motion/react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: string;
}

export function ProtectedRoute({ children, requiredModule }: ProtectedRouteProps) {
  const { user, profile, loading, canAccess, refreshProfile } = useAuth();
  const location = useLocation();
  const [showRetry, setShowRetry] = React.useState(false);

  React.useEffect(() => {
    let timer: any;
    if (loading) {
      timer = setTimeout(() => setShowRetry(true), 8000);
    } else {
      setShowRetry(false);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-6 font-sans">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }} 
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-200"
        >
          <Shield className="text-white" size={40} />
        </motion.div>
        
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-indigo-600" size={24} />
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] animate-pulse">
              {showRetry ? 'Conexão lenta detectada' : 'Verificando Credenciais'}
            </p>
          </div>

          {showRetry && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <p className="text-[11px] text-slate-500 font-medium leading-tight">
                A resposta do servidor está demorando mais que o esperado.
              </p>
              <button 
                onClick={() => refreshProfile()}
                className="px-6 py-2 bg-white border border-slate-200 text-indigo-600 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
              >
                Tentar Sincronizar Agora
              </button>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl text-center border border-slate-100">
           <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
             <AlertCircle size={40} />
           </div>
           <h2 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight">Perfil Bloqueado</h2>
           <p className="text-slate-500 font-medium text-sm leading-relaxed mb-10">
             Sua conta ({user.email}) existe, mas não possui um perfil ativo ou permissões no sistema. Entre em contato com o administrador.
           </p>
           <Navigate to="/login" replace />
        </div>
      </div>
    );
  }

  if (requiredModule && !canAccess(requiredModule)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
