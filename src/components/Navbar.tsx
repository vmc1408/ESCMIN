import React, { useEffect, useState } from 'react';
import { Search, Bell, Wallet, User, LogOut, Database, WifiOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getInstitutionSettings } from '../lib/database';
import { financialService } from '../services/financialService';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured, isDbConnected, testConnection } from '../lib/supabase';
import { cn } from '../lib/utils';

export function Navbar() {
  const { profile, logout } = useAuth();
  const [institution, setInstitution] = useState<any>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'disconnected' | 'checking'>(
    isSupabaseConfigured ? (isDbConnected ? 'connected' : 'checking') : 'disconnected'
  );
  const [latency, setLatency] = useState<number | null>(null);

  const fetchInstitution = async () => {
    try {
      const inst = await getInstitutionSettings();
      if (inst) {
        setInstitution(inst);
      }
    } catch (e) {
      console.error('Error fetching institution info:', e);
    }
  };

  const handleRetry = async () => {
    if (isRetrying || !isSupabaseConfigured) return;
    setIsRetrying(true);
    setDbStatus('checking');
    await testConnection();
    setIsRetrying(false);
  };

  useEffect(() => {
    fetchInstitution();

    const handleStatusChange = (e: any) => {
      setDbStatus(e.detail.connected ? 'connected' : 'error');
      setLatency(e.detail.latency);
    };

    window.addEventListener('institution-updated', fetchInstitution);
    window.addEventListener('supabase-status-change', handleStatusChange);
    
    return () => {
      window.removeEventListener('institution-updated', fetchInstitution);
      window.removeEventListener('supabase-status-change', handleStatusChange);
    };
  }, []);

  const userName = profile?.name || 'Usuário';
  const userRole = profile?.role === 'admin' ? 'Administrador' : 
                   profile?.role === 'diretor' ? 'Diretor' : 'Secretário';
  const avatarUrl = profile?.avatar_url || '';

  return (
    <header className="h-20 bg-white/70 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-4 md:px-6 z-30 print:hidden shrink-0">
      <div className="flex items-center gap-6 flex-1 min-w-0">
        <div className="lg:hidden w-10" /> 
        
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h2 className="text-sm md:text-base font-black text-[#131b2e] uppercase tracking-tight truncate">
              {institution?.name || 'Gestão Escolar'}
            </h2>
            
            <button 
              onClick={handleRetry}
              disabled={isRetrying || dbStatus === 'connected'}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight transition-all",
                dbStatus === 'connected' ? "bg-emerald-50 text-emerald-600 border border-emerald-100 cursor-default" :
                dbStatus === 'error' ? "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 animate-pulse cursor-pointer" :
                dbStatus === 'checking' ? "bg-amber-50 text-amber-600 border border-amber-100 animate-pulse cursor-wait" :
                "bg-slate-50 text-slate-400 border border-slate-100"
              )}
              title={dbStatus === 'error' ? 'Clique para tentar reconectar' : ''}
            >
              {dbStatus === 'connected' && <CheckCircle2 size={10} />}
              {dbStatus === 'error' && <WifiOff size={10} />}
              {dbStatus === 'checking' && <Database size={10} />}
              {dbStatus === 'disconnected' && <AlertTriangle size={10} />}
              <span className="hidden xs:inline">
                {dbStatus === 'connected' ? (
                  <>Online {latency ? `(${latency}ms)` : ''}</>
                ) :
                 dbStatus === 'error' ? (isRetrying ? 'Tentando...' : 'Erro - Tentar Reconc.') :
                 dbStatus === 'checking' ? 'Conectando...' : 'Não Configurado'}
              </span>
            </button>
          </div>

          {(institution?.address || institution?.email) && (
            <div className="hidden lg:flex flex-col gap-0.5 mt-1">
              {institution?.address && (
                <div className="flex items-center gap-1.5 text-[9.5px] font-medium text-slate-500 uppercase tracking-wide">
                  <span>{institution.address}</span>
                </div>
              )}
              {institution?.email && (
                <div className="flex items-center gap-1.5 text-[9.5px] font-medium text-slate-500 uppercase tracking-wide">
                  <span>{institution.email}</span>
                  {institution?.phone && <span className="text-slate-300 mx-1">|</span>}
                  {institution?.phone && <span>{institution.phone}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-5">
        <div className="flex items-center gap-2 md:gap-4 text-slate-500 border-l border-slate-200 pl-3 md:pl-5">
          <div className="relative cursor-pointer hover:text-[#497cff] transition-colors hidden xs:block">
            <Bell size={20} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </div>
          <Wallet size={20} className="cursor-pointer hover:text-[#497cff] transition-colors hidden xs:block" />
          
          <div className="flex items-center gap-2 md:gap-3 ml-1 md:ml-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-black text-[#131b2e] leading-none truncate max-w-[100px]">{userName}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 truncate">{userRole}</p>
            </div>
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shadow-sm shrink-0">
              {avatarUrl && !avatarError ? (
                <img 
                  src={avatarUrl} 
                  alt="User"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300">
                  <User size={18} />
                </div>
              )}
            </div>
            <button 
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95 ml-1"
              title="Sair do sistema"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
