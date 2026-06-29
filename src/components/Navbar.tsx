import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Bell, Wallet, User, LogOut, Database, WifiOff, CheckCircle2, AlertTriangle, ShieldCheck, Clock, Lock } from 'lucide-react';
import { getInstitutionSettings } from '../lib/database';
import { financialService } from '../services/financialService';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured, isDbConnected, testConnection } from '../lib/supabase';
import { cn } from '../lib/utils';

export function Navbar() {
  const { profile, logout, lockTimer, lock, isLocked, isLockEnabled } = useAuth();
  const location = useLocation();
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
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 z-30 print:hidden shrink-0">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="lg:hidden w-8" />
        
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-200 shadow-sm transition-all hover:shadow-md">
            {institution?.logo_url ? (
              <img 
                src={institution.logo_url} 
                alt="Logo"
                className="w-full h-full object-contain p-1"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300">
                <Database size={20} />
              </div>
            )}
          </div>
          
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm md:text-base font-bold text-slate-900 truncate tracking-tight leading-tight">
                {institution?.name || 'Gestão Escolar'}
              </h2>
              
              <button 
                onClick={handleRetry}
                disabled={isRetrying || dbStatus === 'connected'}
                className={cn(
                  "hidden xs:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all uppercase tracking-widest",
                  dbStatus === 'connected' ? "bg-emerald-50 text-emerald-700 border border-emerald-100 cursor-default" :
                  dbStatus === 'error' ? "bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 animate-pulse cursor-pointer shadow-sm" :
                  dbStatus === 'checking' ? "bg-amber-50 text-amber-700 border border-amber-100 animate-pulse cursor-wait" :
                  "bg-slate-50 text-slate-500 border border-slate-200"
                )}
                title={dbStatus === 'error' ? 'Clique para tentar reconectar' : ''}
              >
                {dbStatus === 'connected' && <CheckCircle2 size={10} />}
                {dbStatus === 'error' && <WifiOff size={10} />}
                {dbStatus === 'checking' && <Database size={10} />}
                {dbStatus === 'disconnected' && <AlertTriangle size={10} />}
                <span>
                  {dbStatus === 'connected' ? (
                    <>Online {latency ? `(${latency}ms)` : ''}</>
                  ) :
                   dbStatus === 'error' ? (isRetrying ? '...' : 'Reconc.') :
                   dbStatus === 'checking' ? '...' : 'Off'}
                </span>
              </button>
            </div>
            {institution?.city && (
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest truncate leading-tight mt-0.5">
                {institution.city}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-5">
        {profile?.pin && !isLocked && (
          <div className="hidden md:flex items-center gap-1">
            {isLockEnabled && (
              <div 
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg group hover:border-blue-200 transition-colors cursor-pointer" 
                onClick={lock}
                title="Bloquear Sistema"
              >
                <div className="relative">
                  <Clock size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <div 
                    className="absolute inset-0 border-2 border-blue-500 rounded-full border-t-transparent animate-spin opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ clipPath: 'polygon(50% 50%, -50% -50%, 150% -50%)' }}
                  />
                </div>
                <span className="text-[10px] font-bold tabular-nums text-slate-500 group-hover:text-blue-600 transition-colors uppercase tracking-widest whitespace-nowrap">
                  {Math.floor(lockTimer / 60)}:{(lockTimer % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
            <button
              onClick={lock}
              className="p-1.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg hover:bg-amber-100 transition-all active:scale-90"
              title="Bloquear Agora"
            >
              <Lock size={14} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 md:gap-4 text-slate-400 border-l border-slate-200 pl-3 md:pl-5">
          <div className="relative cursor-pointer hover:text-blue-600 transition-colors hidden xs:block">
            <Bell size={18} />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 ml-1 md:ml-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-900 leading-none truncate max-w-[120px]">{userName}</p>
              <p className="text-[10px] font-medium text-slate-500 mt-1 truncate">{userRole}</p>
            </div>
            <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden border border-slate-200 shadow-sm shrink-0">
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
              className="ml-2 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-90"
              title="Sair do Sistema"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
