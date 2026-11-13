import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, User, LogOut, Database, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { getInstitutionSettings } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_LOGO } from '../lib/default-logo';
import { cn } from '../lib/utils';

export function Navbar() {
  const { profile, logout, lockTimer, lock, isLocked, isLockEnabled } = useAuth();
  const [institution, setInstitution] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('cached_institution_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.name) return parsed;
      }
    } catch {}
    return {
      name: 'Escola Diocesana de Ministério',
      city: 'Diocese de Guarulhos',
      logo_url: DEFAULT_LOGO
    };
  });
  const [avatarError, setAvatarError] = useState(false);

  const fetchInstitution = async () => {
    try {
      const inst = await getInstitutionSettings();
      if (inst && inst.name) {
        setInstitution(inst);
        try {
          localStorage.setItem('cached_institution_settings', JSON.stringify(inst));
        } catch {}
      }
    } catch (e) {
      console.error('Error fetching institution info:', e);
    }
  };

  useEffect(() => {
    fetchInstitution();

    window.addEventListener('institution-updated', fetchInstitution);
    
    return () => {
      window.removeEventListener('institution-updated', fetchInstitution);
    };
  }, []);

  const hasPlayedAlarm = useRef(false);

  useEffect(() => {
    if (isLockEnabled && lockTimer <= 60 && !isLocked) {
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
  }, [lockTimer, isLockEnabled, isLocked]);

  const userName = profile?.name || 'Usuário';
  const userRole = profile?.role === 'admin' ? 'Administrador' : 
                   profile?.role === 'diretor' ? 'Diretor' : 
                   profile?.role === 'secretario' ? 'Secretário Acadêmico' : 
                   profile?.role === 'assistente' ? 'Assistente de Secretaria' : 
                   (profile?.role === 'professor' || profile?.role === 'docente') ? 'Professor / Docente' : 'Usuário';
  const avatarUrl = profile?.avatar_url || '';

  return (
    <>
      <header className="h-14 bg-white border-b border-slate-200 z-50 relative print:hidden shrink-0">
        <div className="h-full max-w-[1560px] w-full mx-auto px-3 sm:px-4 md:px-5 flex items-center justify-between gap-2 md:gap-4">
          {/* Lado Esquerdo: Logo e Instituição (Clique volta para a tela inicial sem animação) */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink-0">
            <div className="lg:hidden w-8" />
            
            <Link 
              to="/" 
              className="flex items-center gap-2.5 sm:gap-3 select-none cursor-pointer group"
              title="Voltar para a tela inicial"
            >
              <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-transparent transition-transform duration-200 group-hover:scale-105">
                <img 
                  src={institution?.logo_url || DEFAULT_LOGO} 
                  alt={institution?.name || "Logo"}
                  className="w-full h-full object-contain filter drop-shadow-xs"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_LOGO;
                  }}
                />
              </div>
              
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm md:text-base font-bold text-slate-900 truncate tracking-tight leading-tight">
                    {institution?.name || 'Escola Diocesana de Ministério'}
                  </h2>
                </div>
                {(institution?.city || 'Diocese de Guarulhos') && (
                  <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest truncate leading-tight mt-0.5">
                    {institution?.city || 'Diocese de Guarulhos'}
                  </p>
                )}
              </div>
            </Link>
          </div>

          {/* Lado Direito: Ações, Bloqueio e Perfil */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">

            {!isLocked && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={lock}
                  className="group relative flex items-center justify-center p-2 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-300 hover:border-amber-400 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shadow-2xs"
                  title="Bloquear sistema agora"
                >
                  {/* Cadeado aberto quando o sistema está desbloqueado */}
                  <Unlock size={16} className="transition-all duration-200 group-hover:hidden text-teal-600" />
                  {/* Cadeado fecha ao passar o mouse por cima para bloquear o sistema */}
                  <Lock size={16} className="hidden transition-all duration-200 group-hover:block text-amber-600 animate-in zoom-in-75" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 md:gap-4 text-slate-500 border-l border-slate-300 pl-2.5 md:pl-4">
            <div className="relative cursor-pointer hover:text-teal-600 transition-colors hidden xs:block">
              <Bell size={18} />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3 ml-1 md:ml-2">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-slate-900 leading-none truncate max-w-[120px]">{userName}</p>
                <p className="text-[10px] font-semibold text-slate-600 mt-1 truncate">{userRole}</p>
              </div>
              <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden border border-slate-300 shadow-sm shrink-0">
                {avatarUrl && !avatarError ? (
                  <img 
                    src={avatarUrl} 
                    alt="User"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500">
                    <User size={18} />
                  </div>
                )}
              </div>
              <button 
                onClick={logout}
                className="ml-2 p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-all active:scale-90"
                title="Sair do Sistema"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
        </div>
      </header>

      {/* Elegant Warning Alert Overlay when lockTimer <= 60 */}
      {!isLocked && isLockEnabled && lockTimer <= 60 && (
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
              className="mt-6 w-full py-3.5 bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-red-600/30 uppercase tracking-widest cursor-pointer"
            >
              Continuar Conectado
            </button>
          </div>
        </div>
      )}
    </>
  );
}
