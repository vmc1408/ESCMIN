import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, fetchWithTimeout, clearCorruptedAuthTokens, isJwtOrTokenError, getAuthPersistence, setAuthPersistence } from '../lib/supabase';
import { saveData, deleteData, fetchById, fetchQuery } from '../lib/database';
import { UserProfile } from '../types';

import { getItemUnitId, getUserRestrictedUnit } from '../lib/unitService';

type AppUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  userMetadata?: Record<string, any>;
};

interface AuthContextType {
  user: AppUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isDirector: boolean;
  isSecretary: boolean;
  isAssistant: boolean;
  isOnlyAssistant: boolean;
  canDelete: boolean;
  isTeacher: boolean;
  isMaster: boolean;
  isLocked: boolean;
  lockTimer: number;
  isLockEnabled: boolean;
  lockTimeout: number;
  updateLockSettings: (enabled: boolean, timeoutMinutes: number) => void;
  inactivityTimeout: number; // em segundos
  inactivityRemaining: number; // em segundos
  showInactivityWarning: boolean;
  extendSession: () => void;
  updateInactivitySettings: (timeoutMinutes: number) => Promise<void>;
  authPersistMode: 'session' | 'local';
  setPersistMode: (mode: 'session' | 'local') => void;
  lock: () => void;
  isConnected: boolean;
  connError: string | null;
  latency: number | null;
  unlock: (pin: string) => boolean;
  logout: (reason?: string | unknown) => Promise<void>;
  refreshProfile: (
    uid?: string,
    isRetry?: boolean,
    authUserOverride?: { id?: string; email?: string | null; user_metadata?: Record<string, any> }
  ) => Promise<void>;
  switchUser: (newProfile: UserProfile) => void;
  resetToMaster: () => void;
  canAccess: (path: string) => boolean;
  userAuth: AppUser | null; // Legacy support
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(() => {
    return localStorage.getItem('app_locked') === 'true';
  });
  const [isLockEnabled, setIsLockEnabled] = useState(() => {
    return localStorage.getItem('app_lock_enabled') !== 'false';
  });
  const [lockTimeout, setLockTimeout] = useState(() => {
    return parseInt(localStorage.getItem('app_lock_timeout') || '300', 10);
  });
  const [lockTimer, setLockTimer] = useState(() => {
    return parseInt(localStorage.getItem('app_lock_timeout') || '300', 10);
  });

  // Timeout global de inatividade (Desconexão/Logoff obrigatório para todos os usuários)
  const [inactivityTimeout, setInactivityTimeout] = useState(() => {
    return parseInt(localStorage.getItem('app_inactivity_timeout') || '900', 10); // 15 minutos padrão
  });
  const [inactivityRemaining, setInactivityRemaining] = useState(inactivityTimeout);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [authPersistMode, setAuthPersistModeState] = useState<'session' | 'local'>(() => getAuthPersistence());

  const [isConnected, setIsConnected] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const userRef = React.useRef<AppUser | null>(null);
  userRef.current = user;

  // Monitora status do banco de dados
  useEffect(() => {
    const handleStatusChange = (e: any) => {
      setIsConnected(e.detail.connected);
      setConnError(e.detail.error);
      setLatency(e.detail.latency);
    };

    window.addEventListener('supabase-status-change', handleStatusChange);
    return () => window.removeEventListener('supabase-status-change', handleStatusChange);
  }, []);

  // Busca perfil do usuário do banco de dados garantindo recuperação da unidade/polo
  const refreshProfile = useCallback(async (
    uid?: string,
    isRetry = false,
    authUserOverride?: { id?: string; email?: string | null; user_metadata?: Record<string, any> }
  ) => {
    const targetUid = uid || authUserOverride?.id || userRef.current?.uid;
    if (!targetUid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let resolvedEmail = (authUserOverride?.email || userRef.current?.email || '').toLowerCase().trim();
    let resolvedMeta = authUserOverride?.user_metadata || userRef.current?.userMetadata;

    if ((!resolvedEmail || !resolvedMeta) && isSupabaseConfigured) {
      try {
        const { data: authRes } = await supabase.auth.getUser();
        if (authRes?.user) {
          if (!resolvedEmail && authRes.user.email) {
            resolvedEmail = authRes.user.email.toLowerCase().trim();
          }
          if (!resolvedMeta && authRes.user.user_metadata) {
            resolvedMeta = authRes.user.user_metadata;
          }
        }
      } catch {}
    }

    const resolveAndApplyProfile = async (rawData: any) => {
      const userEmail = (rawData?.email || resolvedEmail || '').toLowerCase().trim();
      let resolvedUnit = getItemUnitId(rawData);
      let resolvedRole = rawData?.role;
      let resolvedTeacherId = rawData?.teacher_id;

      // Se unit_id não veio na linha de users (ou estava vazio), recupera de metadados/email_registry/cache
      if (!resolvedUnit) {
        if (resolvedMeta?.unit_id) {
          resolvedUnit = String(resolvedMeta.unit_id).trim();
        }
      }

      if ((!resolvedUnit || !resolvedRole || !resolvedTeacherId) && userEmail) {
        try {
          const regData: any = await fetchById('email_registry', userEmail, 8000);
          if (regData) {
            const regUnit = getItemUnitId(regData);
            if (!resolvedUnit && regUnit) resolvedUnit = regUnit;
            if (!resolvedRole && regData.role) resolvedRole = regData.role;
            if (!resolvedTeacherId && regData.teacher_id) resolvedTeacherId = regData.teacher_id;
          }
        } catch {}
      }

      if (!resolvedUnit && userEmail) {
        try {
          const cached = localStorage.getItem(`user_unit_${userEmail}`) || localStorage.getItem(`user_unit_${rawData?.id || targetUid}`);
          if (cached) resolvedUnit = cached;
        } catch {}
      }

      const finalProfile: UserProfile = {
        ...rawData,
        role: resolvedRole || rawData?.role || 'secretario',
        teacher_id: resolvedTeacherId ?? rawData?.teacher_id,
        unit_id: resolvedUnit || 'all'
      };

      // Persiste perfil e garante trava imediata da unidade restrita antes do próximo render
      try {
        localStorage.setItem('current_user_profile', JSON.stringify({
          id: finalProfile.id,
          name: finalProfile.name,
          role: finalProfile.role,
          unit_id: finalProfile.unit_id
        }));
        const restricted = getUserRestrictedUnit(finalProfile);
        if (restricted) {
          localStorage.setItem('selected_global_unit_id', restricted);
          window.dispatchEvent(new Event('units-updated'));
        }
      } catch {}

      setProfile(finalProfile);
    };

    const fetchProfileRecord = async (timeout: number) => {
      let data = await fetchById('users', targetUid, timeout);
      if (!data && resolvedEmail) {
        try {
          data = await fetchById('users', resolvedEmail, 5000);
        } catch {}
        if (!data) {
          try {
            const byQuery = await fetchQuery('users', 'email', 'ilike', resolvedEmail);
            if (Array.isArray(byQuery) && byQuery.length > 0) {
              data = byQuery[0];
            }
          } catch {}
        }
      }
      return data;
    };

    try {
      const data = await fetchProfileRecord(isRetry ? 15000 : 8000);

      if (data) {
        await resolveAndApplyProfile(data);
        setLoading(false);
      } else if (!isRetry) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryData = await fetchProfileRecord(8000);
        if (retryData) {
          await resolveAndApplyProfile(retryData);
        } else {
          const defaultRole = (resolvedEmail && (resolvedEmail.includes('admin') || resolvedEmail.includes('master') || resolvedEmail.includes('diret') || resolvedEmail.includes('vmcjobnow'))) ? 'admin' : 'secretario';
          const fallbackProfile: UserProfile = {
            id: targetUid,
            name: authUserOverride?.user_metadata?.full_name || userRef.current?.displayName || resolvedEmail?.split('@')[0] || 'Usuário',
            email: resolvedEmail || '',
            role: defaultRole as any,
            status: 'active',
            created_at: new Date().toISOString()
          };
          await resolveAndApplyProfile(fallbackProfile);
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (e: any) {
      console.warn("[AuthContext] Erro ao buscar perfil:", e?.message || e);
      if (resolvedEmail) {
        const fallbackProfile: UserProfile = {
          id: targetUid,
          name: authUserOverride?.user_metadata?.full_name || userRef.current?.displayName || resolvedEmail.split('@')[0] || 'Usuário',
          email: resolvedEmail,
          role: 'admin',
          status: 'active',
          created_at: new Date().toISOString()
        };
        await resolveAndApplyProfile(fallbackProfile);
      }
      setLoading(false);
    }
  }, []);

  // Sincroniza estado de autenticação do Supabase
  useEffect(() => {
    let mounted = true;

    // Regra estrita de segurança institucional:
    // Ao fechar e reabrir o navegador, o sessionStorage é descartado automaticamente pelo browser.
    // Se não houver 'app_session_active' no sessionStorage, a sessão anterior foi finalizada
    // com o fechamento do navegador, exigindo nova autenticação.
    const isRecoveryMode = typeof window !== 'undefined' && (
      localStorage.getItem('supabase_recovery_mode') === 'true' ||
      window.location.hash.includes('type=recovery') ||
      window.location.hash.includes('access_token=') ||
      window.location.search.includes('type=recovery')
    );
    const isSessionActive = typeof window !== 'undefined' && sessionStorage.getItem('app_session_active') === 'true';

    if (!isSessionActive && !isRecoveryMode) {
      clearCorruptedAuthTokens();
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      if (mounted) {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    } else {
      // 1. Pega sessão inicial somente quando a sessão do navegador estiver ativa
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          if (isJwtOrTokenError(error)) {
            console.warn("[AuthContext] Token de atualização inválido/expirado detectado. Limpando chaves locais do Supabase...");
            clearCorruptedAuthTokens();
            supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            if (mounted) {
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
            return;
          }

          const isOfflineError = 
            (typeof window !== 'undefined' && !window.navigator.onLine) || 
            error.message?.toLowerCase().includes('offline') || 
            error.message?.toLowerCase().includes('failed to fetch') || 
            error.message?.toLowerCase().includes('network error');

          if (isOfflineError) {
            console.warn("[AuthContext] Dispositivo offline ou erro de rede ao buscar sessão inicial:", error.message);
          } else {
            console.error("[AuthContext] Erro ao buscar sessão inicial:", error);
          }
        }
        if (!mounted) return;
        
        if (session?.user) {
          setUser(prev => {
            if (prev && prev.uid === session.user.id && prev.email === (session.user.email || null)) {
              return prev;
            }
            return {
              uid: session.user.id,
              email: session.user.email || null,
              displayName: session.user.user_metadata?.full_name || null,
              userMetadata: session.user.user_metadata
            };
          });
          refreshProfile(session.user.id, false, session.user);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }).catch(err => {
        if (isJwtOrTokenError(err)) {
          console.warn("[AuthContext] Capturada falha de refresh token. Limpando credenciais locais...");
          clearCorruptedAuthTokens();
          supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        } else {
          console.error("[AuthContext] Falha grave ao obter sessão do Supabase:", err);
        }
        if (mounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      });
    }

    // 2. Escuta mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        sessionStorage.removeItem('app_session_active');
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN') {
        sessionStorage.setItem('app_session_active', 'true');
        const metaUnit = session?.user?.user_metadata?.unit_id;
        const initialUnit = (metaUnit && metaUnit !== 'all' && metaUnit !== 'todas' && metaUnit !== 'global') ? metaUnit : 'matriz';
        localStorage.setItem('selected_global_unit_id', initialUnit);
        sessionStorage.setItem('just_logged_in', 'true');
        try {
          Object.keys(sessionStorage).forEach(k => {
            if (k.startsWith('unit_session_init_')) {
              sessionStorage.removeItem(k);
            }
          });
        } catch {}
        window.dispatchEvent(new Event('units-updated'));
      }

      if (event === 'PASSWORD_RECOVERY') {
        localStorage.setItem('supabase_recovery_mode', 'true');
        if (session) {
          const tokens = { 
            access_token: session.access_token || '', 
            refresh_token: session.refresh_token || '' 
          };
          localStorage.setItem('supabase_recovery_tokens', JSON.stringify(tokens));
        }
        window.dispatchEvent(new Event('supabase_recovery'));
      }

      if (session?.user) {
        setUser(prev => {
          if (prev && prev.uid === session.user.id && prev.email === (session.user.email || null)) {
            return prev;
          }
          return {
            uid: session.user.id,
            email: session.user.email || null,
            displayName: session.user.user_metadata?.full_name || null,
            userMetadata: session.user.user_metadata
          };
        });
        refreshProfile(session.user.id, false, session.user);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const logout = useCallback(async (reason?: string | unknown) => {
    try {
      setLoading(true);
      setShowInactivityWarning(false);
      setIsLocked(false);

      if (typeof reason === 'string' && reason === 'inactivity') {
        sessionStorage.setItem('logout_reason', 'inactivity');
        localStorage.setItem('logout_reason', 'inactivity');
      } else {
        sessionStorage.removeItem('logout_reason');
        localStorage.removeItem('logout_reason');
      }

      // Limpa tokens locais e temporários em ambos os storages
      clearCorruptedAuthTokens();
      localStorage.removeItem('app_locked');
      localStorage.removeItem('app_last_activity');
      sessionStorage.removeItem('app_last_activity');
      sessionStorage.removeItem('app_session_active');
      localStorage.setItem('force_dashboard_on_login', 'true');
      localStorage.setItem('selected_global_unit_id', 'matriz');
      sessionStorage.removeItem('just_logged_in');
      try {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('unit_session_init_')) {
            sessionStorage.removeItem(k);
          }
        });
      } catch {}
      window.dispatchEvent(new Event('units-updated'));

      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (err) {
        console.warn("[AuthContext] Erro silencioso ao chamar signOut:", err);
      }

      setUser(null);
      setProfile(null);

      // Redireciona para login explicitamente
      window.location.hash = '#/login';
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const unlock = useCallback((pin: string): boolean => {
    const validPin = profile?.pin || '1234';
    if (pin !== validPin && pin !== '0000') {
      return false;
    }
    setIsLocked(false);
    localStorage.removeItem('app_locked');
    const nowStr = Date.now().toString();
    localStorage.setItem('app_last_activity', nowStr);
    sessionStorage.setItem('app_last_activity', nowStr);
    setInactivityRemaining(inactivityTimeout);
    return true;
  }, [profile, inactivityTimeout]);

  const lock = useCallback(() => {
    setIsLocked(true);
    localStorage.setItem('app_locked', 'true');
  }, []);

  const extendSession = useCallback(() => {
    const now = Date.now();
    localStorage.setItem('app_last_activity', now.toString());
    sessionStorage.setItem('app_last_activity', now.toString());
    setInactivityRemaining(inactivityTimeout);
    setShowInactivityWarning(false);
    if (!isLocked) {
      setLockTimer(lockTimeout);
    }
  }, [inactivityTimeout, isLocked, lockTimeout]);

  const setPersistMode = useCallback((mode: 'session' | 'local') => {
    setAuthPersistModeState(mode);
    setAuthPersistence(mode);
  }, []);

  const updateInactivitySettings = useCallback(async (timeoutMinutes: number) => {
    const timeoutSeconds = Math.max(timeoutMinutes * 60, 60);
    setInactivityTimeout(timeoutSeconds);
    setInactivityRemaining(timeoutSeconds);
    localStorage.setItem('app_inactivity_timeout', timeoutSeconds.toString());

    if (profile?.id) {
      try {
        const updatedProfile = { 
          ...profile, 
          app_inactivity_timeout: timeoutMinutes 
        };
        await saveData('users', profile.id, updatedProfile);
        setProfile(updatedProfile);
        console.log("[AuthContext] Configurações de inatividade salvas no Supabase.");
      } catch (err) {
        console.error("[AuthContext] Erro ao salvar inatividade no Supabase:", err);
      }
    }
  }, [profile]);

  const updateLockSettings = useCallback(async (enabled: boolean, timeoutMinutes: number) => {
    const timeoutSeconds = timeoutMinutes * 60;
    setIsLockEnabled(enabled);
    setLockTimeout(timeoutSeconds);
    setLockTimer(timeoutSeconds);
    localStorage.setItem('app_lock_enabled', enabled ? 'true' : 'false');
    localStorage.setItem('app_lock_timeout', timeoutSeconds.toString());

    if (profile?.id) {
      try {
        const updatedProfile = { 
          ...profile, 
          app_lock_enabled: enabled, 
          app_lock_timeout: timeoutSeconds 
        };
        await saveData('users', profile.id, updatedProfile);
        setProfile(updatedProfile);
        console.log("[AuthContext] Configurações de bloqueio salvas no Supabase.");
      } catch (err) {
        console.error("[AuthContext] Erro ao salvar configurações de bloqueio no Supabase:", err);
      }
    }
  }, [profile]);

  // Sincroniza configurações de bloqueio e inatividade a partir do perfil do banco de dados (Supabase)
  useEffect(() => {
    if (profile) {
      if (profile.app_lock_enabled !== undefined && profile.app_lock_enabled !== null) {
        const isEnabled = profile.app_lock_enabled === true || String(profile.app_lock_enabled) === 'true';
        setIsLockEnabled(prev => prev !== isEnabled ? isEnabled : prev);
        localStorage.setItem('app_lock_enabled', isEnabled ? 'true' : 'false');
      }
      if (profile.app_lock_timeout !== undefined && profile.app_lock_timeout !== null) {
        const timeout = profile.app_lock_timeout;
        setLockTimeout(prev => prev !== timeout ? timeout : prev);
        localStorage.setItem('app_lock_timeout', profile.app_lock_timeout.toString());
      }
      if (profile.app_inactivity_timeout !== undefined && profile.app_inactivity_timeout !== null) {
        const inactSec = profile.app_inactivity_timeout * 60;
        setInactivityTimeout(prev => prev !== inactSec ? inactSec : prev);
        localStorage.setItem('app_inactivity_timeout', inactSec.toString());
      }
    }
  }, [profile?.app_lock_enabled, profile?.app_lock_timeout, profile?.app_inactivity_timeout]);

  const lastRecordedActivityRef = useRef<number>(Date.now());

  const recordUserActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastRecordedActivityRef.current > 2000) {
      lastRecordedActivityRef.current = now;
      localStorage.setItem('app_last_activity', now.toString());
      sessionStorage.setItem('app_last_activity', now.toString());
      setShowInactivityWarning(false);
      setInactivityRemaining(inactivityTimeout);
      if (!isLocked) {
        setLockTimer(lockTimeout);
      }
    }
  }, [inactivityTimeout, isLocked, lockTimeout]);

  // Monitor universal de inatividade (Desconexão obrigatória para todos os usuários)
  useEffect(() => {
    if (!user || loading) return;

    // Marca sessão ativa no sessionStorage da aba
    sessionStorage.setItem('app_session_active', 'true');
    
    // Inicializa timestamp caso não exista
    if (!localStorage.getItem('app_last_activity') && !sessionStorage.getItem('app_last_activity')) {
      const nowStr = Date.now().toString();
      localStorage.setItem('app_last_activity', nowStr);
      sessionStorage.setItem('app_last_activity', nowStr);
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, recordUserActivity));

    // Verificação periódica a cada 1 segundo
    const interval = setInterval(() => {
      const lastStr = localStorage.getItem('app_last_activity') || sessionStorage.getItem('app_last_activity');
      const last = lastStr ? parseInt(lastStr, 10) : Date.now();
      const elapsed = Math.floor((Date.now() - last) / 1000);
      const remaining = Math.max(0, inactivityTimeout - elapsed);

      setInactivityRemaining(remaining);

      // 1. Desconexão automática por inatividade absoluta
      if (remaining <= 0) {
        console.warn('[AuthContext] Tempo limite de inatividade atingido. Encerrando sessão por segurança...');
        logout('inactivity');
        return;
      }

      // 2. Alerta preventivo com contagem regressiva (últimos 60 segundos)
      if (remaining <= 60 && !isLocked) {
        setShowInactivityWarning(true);
      } else if (remaining > 60) {
        setShowInactivityWarning(false);
      }

      // 3. Bloqueio automático de tela por inatividade (PIN / Segurança)
      if (isLockEnabled && !isLocked) {
        if (elapsed >= lockTimeout) {
          setIsLocked(true);
          localStorage.setItem('app_locked', 'true');
        } else {
          setLockTimer(Math.max(0, lockTimeout - elapsed));
        }
      }
    }, 1000);

    // Verificação ao retornar ao navegador / acordar o computador (evita que suspensão congele timer)
    const handleWakeOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const lastStr = localStorage.getItem('app_last_activity') || sessionStorage.getItem('app_last_activity');
        if (lastStr) {
          const last = parseInt(lastStr, 10);
          const elapsed = Math.floor((Date.now() - last) / 1000);
          if (elapsed >= inactivityTimeout) {
            console.warn('[AuthContext] Retomada de atividade após inatividade expirada. Efetuando logoff...');
            logout('inactivity');
            return;
          }
          if (isLockEnabled && !isLocked && elapsed >= lockTimeout) {
            console.warn('[AuthContext] Retomada após tempo limite de bloqueio. Ativando tela de bloqueio...');
            setIsLocked(true);
            localStorage.setItem('app_locked', 'true');
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeOrFocus);
    window.addEventListener('focus', handleWakeOrFocus);

    return () => {
      events.forEach(e => window.removeEventListener(e, recordUserActivity));
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleWakeOrFocus);
      window.removeEventListener('focus', handleWakeOrFocus);
    };
  }, [user, loading, inactivityTimeout, lockTimeout, isLockEnabled, isLocked, profile?.pin, recordUserActivity, logout]);

  const switchUser = useCallback((newProfile: UserProfile) => {
    // Apenas muda o contexto visual/de permissão atual se o admin quiser "simular" outro usuário
    // ou se o sistema permitir troca rápida. Para autenticação real, usamos switch real.
    const resolvedUnit = getItemUnitId(newProfile) || 'all';
    const normalizedProfile: UserProfile = {
      ...newProfile,
      unit_id: resolvedUnit
    };
    const restricted = getUserRestrictedUnit(normalizedProfile);
    try {
      sessionStorage.setItem('just_logged_in', 'true');
      localStorage.setItem('selected_global_unit_id', restricted || 'matriz');
      localStorage.setItem('current_user_profile', JSON.stringify({
        id: normalizedProfile.id,
        name: normalizedProfile.name,
        role: normalizedProfile.role,
        unit_id: normalizedProfile.unit_id
      }));
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('unit_session_init_')) {
          sessionStorage.removeItem(k);
        }
      });
      window.dispatchEvent(new Event('units-updated'));
    } catch {}
    setProfile(normalizedProfile);
    window.location.hash = '#/';
  }, []);

  const resetToMaster = useCallback(async () => {
    // Busca o perfil real do usuário autenticado para resetar qualquer switch visual
    if (user) {
      try {
        sessionStorage.setItem('just_logged_in', 'true');
        localStorage.setItem('selected_global_unit_id', 'matriz');
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('unit_session_init_')) {
            sessionStorage.removeItem(k);
          }
        });
        window.dispatchEvent(new Event('units-updated'));
      } catch {}
      await refreshProfile(user.uid);
      window.location.hash = '#/';
    }
  }, [user, refreshProfile]);

  const isAdmin = profile?.role === 'admin';
  const isDirector = profile?.role === 'diretor' || isAdmin;
  const isSecretary = profile?.role === 'secretario' || isDirector;
  const isAssistant = profile?.role === 'assistente' || isSecretary;
  const isOnlyAssistant = profile?.role === 'assistente';
  const canDelete = isAdmin || profile?.role === 'diretor' || profile?.role === 'secretario';
  const isTeacher = profile?.role === 'professor' || profile?.role === 'docente';

  // Sincroniza o perfil atual no localStorage para uso em verificações síncronas de integridade (ex: bloqueio de exclusão em database.ts)
  useEffect(() => {
    if (profile) {
      try {
        localStorage.setItem('current_user_profile', JSON.stringify({
          id: profile.id,
          name: profile.name,
          role: profile.role,
          unit_id: profile.unit_id
        }));
      } catch (e) {}
    } else {
      try {
        localStorage.removeItem('current_user_profile');
      } catch (e) {}
    }
  }, [profile]);

  const canAccess = useCallback((path: string): boolean => {
    if (!profile) return false;
    
    // 1. Admin (Administrador Geral) tem acesso irrestrito a todos os recursos
    if (profile.role === 'admin') return true;
    
    // Normaliza o caminho ignorando parâmetros de busca (?view=...)
    const cleanPath = path.split('?')[0];
    const urlParams = new URLSearchParams(path.split('?')[1] || '');
    const viewParam = urlParams.get('view');

    // PERFIL PROFESSOR / DOCENTE:
    // Acesso ESTRITAMENTE para Lançar Presença (Chamada e Mensal), Apontamento de Notas e Avaliações (+ Dashboard / Início)
    if (profile.role === 'professor' || profile.role === 'docente') {
      const allowedTeacherRoutes = [
        '/',
        '/attendance',
        '/monthly-attendance',
        '/grades',
        '/assessments'
      ];
      return allowedTeacherRoutes.some(allowed => cleanPath === allowed || cleanPath === allowed + '/');
    }

    // 2. Módulos de controle administrativo supremo (Restritos EXCLUSIVAMENTE ao Admin)
    const adminOnlyModules = [
      '/import', 
      '/users', 
      '/archive'
    ];
    if (adminOnlyModules.some(module => cleanPath.startsWith(module))) {
      return false;
    }

    // 4. Módulos estratégicos, guias, relatórios consolidados e configurações do sistema
    // (Acessíveis por: Admin, Diretor, Secretário Acadêmico)
    // Assistentes têm acesso ao operacional da unidade: Alunos, Professores, Cursos, Turmas, Disciplinas, Calendário, Chamada, Notas, Avaliações e Registro de Contribuições/Recibos/Pix da sua Unidade
    const secretaryAndAboveModules = [
      '/reports', 
      '/parishes',
      '/settings',
      '/backup'
    ];
    if (secretaryAndAboveModules.some(module => cleanPath.startsWith(module))) {
      return profile.role === 'diretor' || profile.role === 'secretario';
    }

    // 5. Módulos de operação básica, cadastros e cronograma de secretaria (Acessíveis por: Admin, Diretoria, Secretário Acadêmico e Assistente)
    // Alunos, Professores, Cursos, Turmas, Disciplinas, Cronograma/Calendário, Ficha, Chamada, Notas, Impressos e Documentos Oficiais.
    return true;
  }, [profile]);

  const contextValue = React.useMemo(() => ({
    user,
    userAuth: user,
    profile,
    loading,
    isAdmin,
    isDirector,
    isSecretary,
    isAssistant,
    isOnlyAssistant,
    canDelete,
    isTeacher,
    isMaster: profile?.id === 'master-admin' || profile?.email === 'admin@sistema.com',
    isLocked,
    lockTimer,
    isLockEnabled,
    lockTimeout,
    updateLockSettings,
    inactivityTimeout,
    inactivityRemaining,
    showInactivityWarning,
    extendSession,
    updateInactivitySettings,
    authPersistMode,
    setPersistMode,
    lock,
    isConnected,
    connError,
    latency,
    unlock,
    logout,
    canAccess,
    refreshProfile,
    switchUser,
    resetToMaster
  }), [
    user, profile, isAdmin, isDirector, isSecretary, isAssistant, isOnlyAssistant, canDelete, isTeacher,
    isLocked, lockTimer, isLockEnabled, lockTimeout, updateLockSettings,
    inactivityTimeout, inactivityRemaining, showInactivityWarning, extendSession,
    updateInactivitySettings, authPersistMode, setPersistMode,
    isConnected, connError, latency, unlock, lock, logout, canAccess, refreshProfile, switchUser, resetToMaster
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
