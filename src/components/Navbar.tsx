import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, User, LogOut, Database, AlertTriangle, Lock, Unlock, Clock, X, Save, Sliders, ShieldCheck } from 'lucide-react';
import { getInstitutionSettings } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export function Navbar() {
  const { profile, logout, lockTimer, lock, isLocked, isLockEnabled, lockTimeout, updateLockSettings } = useAuth();
  const [institution, setInstitution] = useState<any>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [modalLockEnabled, setModalLockEnabled] = useState(isLockEnabled);
  const [modalMinutes, setModalMinutes] = useState(Math.max(1, Math.floor(lockTimeout / 60)));
  const [isSavingTimer, setIsSavingTimer] = useState(false);

  useEffect(() => {
    setModalLockEnabled(isLockEnabled);
    setModalMinutes(Math.max(1, Math.floor(lockTimeout / 60)));
  }, [isLockEnabled, lockTimeout]);

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
      <header className="h-16 bg-white border-b border-slate-200 z-50 relative print:hidden shrink-0">
        <div className="h-full max-w-[1440px] w-full mx-auto px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 md:gap-4">
          {/* Lado Esquerdo: Logo e Instituição (Clique volta para a tela inicial sem animação) */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <div className="lg:hidden w-8" />
            
            <Link 
              to="/" 
              className="flex items-center gap-3 select-none cursor-pointer group"
              title="Voltar para a tela inicial"
            >
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-transparent transition-transform duration-200 group-hover:scale-105">
                {institution?.logo_url ? (
                  <img 
                    src={institution.logo_url} 
                    alt={institution?.name || "Logo"}
                    className="w-full h-full object-contain filter drop-shadow-xs"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-blue-600">
                    <Database size={26} />
                  </div>
                )}
              </div>
              
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm md:text-base font-bold text-slate-900 truncate tracking-tight leading-tight">
                    {institution?.name || 'Gestão Escolar'}
                  </h2>
                </div>
                {institution?.city && (
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest truncate leading-tight mt-0.5">
                    {institution.city}
                  </p>
                )}
              </div>
            </Link>
          </div>

          {/* Lado Direito: Ações, Bloqueio e Perfil */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">

            {!isLocked && (
              <div className="flex items-center gap-1.5">
                {/* Indicador / Ajuste Rápido de Timer */}
                <button
                  type="button"
                  onClick={() => {
                    setModalLockEnabled(isLockEnabled);
                    setModalMinutes(Math.max(1, Math.floor(lockTimeout / 60)));
                    setShowTimerModal(true);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all cursor-pointer shadow-2xs active:scale-95",
                    isLockEnabled && lockTimer <= 60
                      ? "bg-red-50 border-red-300 text-red-600 animate-pulse font-bold"
                      : isLockEnabled
                      ? "bg-slate-100/90 hover:bg-amber-50 border-slate-200/80 hover:border-amber-300 text-slate-700 hover:text-amber-700"
                      : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
                  )}
                  title="Ajustar timer de bloqueio automático por inatividade"
                >
                  <Clock size={13} className={cn(isLockEnabled && lockTimer <= 60 ? "text-red-500" : isLockEnabled ? "text-amber-600" : "text-slate-400")} />
                  {isLockEnabled ? (
                    <span className="font-mono text-[10.5px] font-bold">
                      {lockTimer <= 60 ? `${lockTimer}s` : `${Math.ceil(lockTimer / 60)}m`}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-bold tracking-wider">Off</span>
                  )}
                </button>

                {/* Botão de Bloqueio Imediato */}
                <button
                  onClick={lock}
                  className="group relative flex items-center justify-center p-2 bg-slate-100/90 hover:bg-amber-50 text-slate-500 hover:text-amber-700 border border-slate-200/80 hover:border-amber-300 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shadow-2xs"
                  title="Bloquear sistema agora"
                >
                  {/* Cadeado aberto quando o sistema está desbloqueado */}
                  <Unlock size={16} className="transition-all duration-200 group-hover:hidden text-emerald-600" />
                  {/* Cadeado fecha ao passar o mouse por cima para bloquear o sistema */}
                  <Lock size={16} className="hidden transition-all duration-200 group-hover:block text-amber-600 animate-in zoom-in-75" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 md:gap-4 text-slate-400 border-l border-slate-200 pl-2.5 md:pl-4">
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
        </div>
      </header>

      {/* Modal de Configuração Rápida do Bloqueio por Inatividade */}
      {showTimerModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Cabeçalho */}
            <div className="px-6 py-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Bloqueio por Inatividade
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Ajuste de Timer Automático
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTimerModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-6 space-y-5">
              {/* Toggle Bloqueio Automático */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Bloqueio Automático
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {modalLockEnabled ? 'Bloquear tela após período inativo' : 'Bloqueio automático desativado'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalLockEnabled}
                    onChange={(e) => setModalLockEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>

              {/* Seletor de Minutos */}
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">
                  Tempo Limite de Inatividade
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 5, 10, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      disabled={!modalLockEnabled}
                      onClick={() => setModalMinutes(mins)}
                      className={cn(
                        "py-2 px-1 text-center rounded-lg text-xs font-semibold transition-all border",
                        !modalLockEnabled
                          ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
                          : modalMinutes === mins
                          ? "bg-amber-500 border-amber-600 text-white font-bold shadow-xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                      )}
                    >
                      {mins === 1 ? '1 min' : `${mins} min`}
                    </button>
                  ))}
                </div>

                {/* Input personalizado */}
                <div className="pt-2 flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Personalizado:</span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      disabled={!modalLockEnabled}
                      value={modalMinutes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) setModalMinutes(val);
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 disabled:opacity-40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                      placeholder="Ex: 8"
                    />
                  </div>
                  <span className="text-xs text-slate-500 font-medium">minutos</span>
                </div>
              </div>

              {/* Resumo do Comportamento */}
              <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-xl text-[11px] text-amber-900 leading-relaxed font-medium space-y-1">
                {modalLockEnabled ? (
                  <>
                    <p>• O sistema solicitará o PIN após <strong>{modalMinutes} minuto(s)</strong> de inatividade.</p>
                    <p>• Nos últimos 60 segundos, um alerta sonoro e visual será exibido para você continuar conectado.</p>
                  </>
                ) : (
                  <p className="text-slate-600">• O bloqueio automático está desativado. Você pode bloquear a tela manualmente pelo cadeado no topo.</p>
                )}
              </div>

              {/* Link para Configurações Avançadas */}
              <div className="pt-1 flex items-center justify-between text-xs">
                <Link
                  to="/settings?tab=security"
                  onClick={() => setShowTimerModal(false)}
                  className="text-amber-700 hover:text-amber-800 font-semibold hover:underline flex items-center gap-1 text-[11px]"
                >
                  <ShieldCheck size={13} />
                  <span>Configurar PIN de Acesso e Sessão</span>
                </Link>
              </div>
            </div>

            {/* Rodapé com Botões */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowTimerModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingTimer}
                onClick={async () => {
                  try {
                    setIsSavingTimer(true);
                    await updateLockSettings(modalLockEnabled, modalMinutes);
                    setShowTimerModal(false);
                  } catch (e) {
                    console.error('Erro ao atualizar timer de bloqueio:', e);
                  } finally {
                    setIsSavingTimer(false);
                  }
                }}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Save size={14} />
                <span>{isSavingTimer ? 'Salvando...' : 'Salvar Ajustes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
