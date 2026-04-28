import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, AlertCircle, Shield } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: string;
}

export function ProtectedRoute({ children, requiredModule }: ProtectedRouteProps) {
  const { user, profile, loading, canAccess } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
          <p className="text-slate-500 font-medium">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredModule && !canAccess(requiredModule)) {
    return <Navigate to="/" replace />;
  }

  // Handle case where user is logged in but profile hasn't loaded or doesn't exist
  if (!profile) {
    // If loading is finished and we still have no profile, the user might be orphaned or deleted
    if (!loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#00174b] p-4 text-center">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl space-y-6">
            <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto">
              <Shield className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-black text-[#131b2e]">Cadastro não encontrado</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              Olá! Identificamos que você ainda não possui um perfil ativo no sistema. 
              Por favor, realize seu <strong>Primeiro Acesso</strong> ou entre em contato com o administrador.
            </p>
            <div className="pt-4">
              <button 
                onClick={() => window.location.href = '/login'}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Voltar ao Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center space-y-4">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
            <p className="text-slate-500 font-medium">Carregando perfil...</p>
          </div>
        </div>
      );
  }

  if (profile.status === 'inactive' || profile.status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#00174b] p-4 text-center">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl space-y-6">
          <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-10 h-10 text-amber-600" />
          </div>
          <h2 className="text-2xl font-black text-[#131b2e]">Acesso em Análise</h2>
          <p className="text-slate-500 font-medium leading-relaxed">
            Seu perfil está atualmente <strong>{profile.status === 'inactive' ? 'inativo' : 'em análise'}</strong>. 
            Em breve você terá acesso total às funcionalidades. Por favor, aguarde a liberação pelo administrador.
          </p>
          <div className="pt-4">
            <button 
              onClick={() => window.location.href = '/login'}
              className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
            >
              Fazer Login com outra conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
