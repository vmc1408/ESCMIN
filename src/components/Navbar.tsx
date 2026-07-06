import React, { useEffect, useState, useRef } from 'react';
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

  const hasPlayedAlarm = useRef(false);

  useEffect(() => {
    if (isLockEnabled && lockTimer <= 60 && !isLocked && profile?.pin) {
      if (!hasPlayedAlarm.current) {
        hasPlayedAlarm.current = true;
        // Play an elegant, noticeable single double-beep warning sound
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            
            // First beep
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime); // Note A5
            gain1.gain.setValueAtTime(0.12, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.2);
            
            // Second higher-pitch beep shortly after
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1200, ctx.currentTime + 0.15);
            gain2.gain.setValueAtTime(0, ctx.currentTime);
            gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
            
            osc2.start(ctx.currentTime + 0.15);
            osc2.stop(ctx.currentTime + 0.45);
          }
        } catch (error) {
          console.warn('Audio warning failed to play:', error);
        }
      }
    } else {
      // Reset ref so the sound can trigger again on the next inactivity warning phase
      hasPlayedAlarm.current = false;
    }
  }, [lockTimer, isLockEnabled, isLocked, profile?.pin]);

  const userName = profile?.name || 'Usuário';
  const userRole = profile?.role === 'admin' ? 'Administrador' : 
                   profile?.role === 'diretor' ? 'Diretor' : 'Secretário';
  const avatarUrl = profile?.avatar_url || '';

  return (
    <>
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
              {isLockEnabled && lockTimer <= 60 && (
                <div 
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg animate-pulse cursor-pointer hover:bg-red-100 transition-colors" 
                  onClick={lock}
                  title="Sua sessão expirará por inatividade. Clique para bloquear."
                >
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                  <span className="text-[10px] font-black tabular-nums uppercase tracking-widest whitespace-nowrap">
                    Bloqueando em {lockTimer}s
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

      {/* Elegant Warning Alert Overlay when lockTimer <= 60 */}
      {profile?.pin && !isLocked && isLockEnabled && lockTimer <= 60 && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-red-500/30 text-white rounded-2xl max-w-md w-full shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative p-5 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full">
                <AlertTriangle size={48} className="animate-bounce" />
              </div>
            </div>

            <h3 className="text-xl font-black uppercase tracking-wider text-white">
              Inatividade Detectada
            </h3>
            
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">
              Por motivos de segurança, sua sessão será bloqueada em:
            </p>
            
            <div className="mt-4 px-6 py-3 bg-red-950/40 border border-red-900/50 rounded-xl">
              <span className="text-3xl font-black text-red-500 tabular-nums animate-pulse">
                {lockTimer} <span className="text-lg">segundos</span>
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-6 leading-normal">
              Mexa o mouse, pressione qualquer tecla ou clique no botão abaixo para continuar ativo no sistema.
            </p>

            <button
              onClick={() => {
                // Clicking resets the timer via the active events listener in AuthContext
              }}
              className="mt-6 w-full py-3.5 bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-red-600/30 uppercase tracking-widest"
            >
              Continuar Conectado
            </button>
          </div>
        </div>
      )}
    </>
  );
}
