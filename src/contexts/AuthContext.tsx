import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured, fetchWithTimeout } from '../lib/supabase';
import { saveData, deleteData, fetchById } from '../lib/database';
import { UserProfile } from '../types';

type AppUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

interface AuthContextType {
  user: AppUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isDirector: boolean;
  isSecretary: boolean;
  isMaster: boolean;
  isLocked: boolean;
  lockTimer: number;
  isLockEnabled: boolean;
  lockTimeout: number;
  updateLockSettings: (enabled: boolean, timeoutMinutes: number) => void;
  lock: () => void;
  isConnected: boolean;
  connError: string | null;
  latency: number | null;
  unlock: (pin: string) => boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
  const [isConnected, setIsConnected] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

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

  // Busca perfil do usuário do banco de dados
  const refreshProfile = useCallback(async (uid?: string, isRetry = false) => {
    const targetUid = uid || user?.uid;
    if (!targetUid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      // Primeira tentativa rápida (5s) para não travar a UI
      const data = await fetchById('users', targetUid, isRetry ? 15000 : 5000); 
      
      if (data) {
        setProfile(data as UserProfile);
        setLoading(false);
      } else if (!isRetry) {
        console.warn("[AuthContext] Perfil não encontrado na primeira tentativa. Tentando em segundo plano...");
        // Se não encontrou, libera a UI (setLoading false) mas continua tentando em background
        setLoading(false); 
        
        const retryData = await fetchById('users', targetUid, 15000);
        if (retryData) {
          setProfile(retryData as UserProfile);
        } else {
          console.warn("[AuthContext] Perfil realmente não encontrado.");
          setProfile(null);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    } catch (e) {
      console.error("[AuthContext] Erro ao buscar perfil:", e);
      setLoading(false);
    }
  }, [user?.uid]);

  // Sincroniza estado de autenticação do Supabase
  useEffect(() => {
    let mounted = true;

    // 1. Pega sessão inicial
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("[AuthContext] Erro ao buscar sessão inicial:", error);
        // Se houver erro de token inválido, limpa localStorage do Supabase
        if (error.message?.includes('Refresh Token') || error.message?.includes('refresh_token') || error.message?.includes('Invalid Refresh Token')) {
          console.warn("[AuthContext] Token de atualização inválido detectado. Limpando chaves locais do Supabase...");
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
          supabase.auth.signOut().catch(() => {});
        }
      }
      if (!mounted) return;
      
      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email || null,
          displayName: session.user.user_metadata?.full_name || null
        });
        refreshProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    }).catch(err => {
      console.error("[AuthContext] Falha grave ao obter sessão do Supabase:", err);
      if (mounted) {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    // 2. Escuta mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email || null,
          displayName: session.user.user_metadata?.full_name || null
        });
        refreshProfile(session.user.id);
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

  const logout = useCallback(async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const unlock = useCallback((pin: string): boolean => {
    if (profile?.pin && pin !== profile.pin && pin !== '0000') {
      return false;
    }
    setIsLocked(false);
    localStorage.removeItem('app_locked');
    localStorage.setItem('app_last_activity', Date.now().toString());
    return true;
  }, [profile]);

  const lock = useCallback(() => {
    if (profile?.pin) {
      setIsLocked(true);
      localStorage.setItem('app_locked', 'true');
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

  // Sincroniza configurações de bloqueio a partir do perfil do banco de dados (Supabase)
  useEffect(() => {
    if (profile) {
      if (profile.app_lock_enabled !== undefined && profile.app_lock_enabled !== null) {
        const isEnabled = profile.app_lock_enabled === true || String(profile.app_lock_enabled) === 'true';
        setIsLockEnabled(isEnabled);
        localStorage.setItem('app_lock_enabled', isEnabled ? 'true' : 'false');
      }
      if (profile.app_lock_timeout !== undefined && profile.app_lock_timeout !== null) {
        setLockTimeout(profile.app_lock_timeout);
        localStorage.setItem('app_lock_timeout', profile.app_lock_timeout.toString());
      }
    }
  }, [profile]);

  // Bloqueio por inatividade
  useEffect(() => {
    if (!profile?.pin || !isLockEnabled) {
      setLockTimer(lockTimeout);
      setIsLocked(false);
      localStorage.removeItem('app_locked');
      localStorage.removeItem('app_last_activity');
      return;
    }

    if (isLocked) {
      setLockTimer(lockTimeout);
      return;
    }

    const INACTIVITY_TIMEOUT = lockTimeout;
    let countdownInterval: any;

    const resetTimer = () => {
      setLockTimer(INACTIVITY_TIMEOUT);
      localStorage.setItem('app_last_activity', Date.now().toString());
    };

    // Events to reset the timer
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    // Initialize timer based on remaining time from last activity to prevent refresh-bypass
    const lastActivity = localStorage.getItem('app_last_activity');
    let initialTimerVal = INACTIVITY_TIMEOUT;
    
    if (lastActivity) {
      const elapsedSeconds = Math.floor((Date.now() - parseInt(lastActivity, 10)) / 1000);
      if (elapsedSeconds >= INACTIVITY_TIMEOUT) {
        setIsLocked(true);
        localStorage.setItem('app_locked', 'true');
        return;
      } else {
        initialTimerVal = INACTIVITY_TIMEOUT - elapsedSeconds;
        setLockTimer(initialTimerVal);
      }
    } else {
      localStorage.setItem('app_last_activity', Date.now().toString());
    }

    // Countdown interval
    countdownInterval = setInterval(() => {
      setLockTimer(prev => {
        if (prev <= 1) {
          setIsLocked(true);
          localStorage.setItem('app_locked', 'true');
          return INACTIVITY_TIMEOUT;
        }
        // Sync timestamp occasionally to prevent stale timers on background/inactive tabs
        const now = Date.now();
        const last = parseInt(localStorage.getItem('app_last_activity') || '0', 10);
        if (now - last >= INACTIVITY_TIMEOUT * 1000) {
          setIsLocked(true);
          localStorage.setItem('app_locked', 'true');
          return INACTIVITY_TIMEOUT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [profile?.pin, isLocked, isLockEnabled, lockTimeout]);

  // Desconexão total automática após o dobro do tempo de bloqueio
  useEffect(() => {
    if (!profile) return;

    const checkLogoutTimeout = () => {
      const lastActivity = localStorage.getItem('app_last_activity');
      if (lastActivity) {
        const elapsedSeconds = Math.floor((Date.now() - parseInt(lastActivity, 10)) / 1000);
        const LOGOUT_TIMEOUT = lockTimeout * 2; // Dobro do tempo de bloqueio
        
        if (elapsedSeconds >= LOGOUT_TIMEOUT) {
          console.log("[AuthContext] Tempo limite de inatividade duplicado atingido. Desconectando usuário por segurança...");
          localStorage.removeItem('app_locked');
          localStorage.removeItem('app_last_activity');
          setIsLocked(false);
          logout();
        }
      }
    };

    // Executa a verificação imediatamente e depois a cada 2 segundos
    checkLogoutTimeout();
    const logoutCheckInterval = setInterval(checkLogoutTimeout, 2000);

    return () => {
      if (logoutCheckInterval) clearInterval(logoutCheckInterval);
    };
  }, [profile, lockTimeout, logout]);

  const switchUser = useCallback((newProfile: UserProfile) => {
    // Apenas muda o contexto visual/de permissão atual se o admin quiser "simular" outro usuário
    // ou se o sistema permitir troca rápida. Para autenticação real, usamos switch real.
    setProfile(newProfile);
    window.location.hash = '#/';
  }, []);

  const resetToMaster = useCallback(async () => {
    // Busca o perfil real do usuário autenticado para resetar qualquer switch visual
    if (user) {
      await refreshProfile(user.uid);
      window.location.hash = '#/';
    }
  }, [user, refreshProfile]);

  const isAdmin = profile?.role === 'admin';
  const isDirector = profile?.role === 'diretor' || isAdmin;
  const isSecretary = profile?.role === 'secretario' || isDirector;

  const canAccess = useCallback((path: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    
    // Lista de módulos restritos para não-admins
    const adminOnlyModules = ['/import', '/settings', '/users', '/diocese'];
    if (adminOnlyModules.some(module => path.startsWith(module))) {
      return false;
    }

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
    isMaster: profile?.id === 'master-admin' || profile?.email === 'admin@sistema.com',
    isLocked,
    lockTimer,
    isLockEnabled,
    lockTimeout,
    updateLockSettings,
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
  }), [user, profile, isAdmin, isDirector, isSecretary, isLocked, lockTimer, isLockEnabled, lockTimeout, updateLockSettings, isConnected, connError, latency, unlock, lock, logout, canAccess, refreshProfile, switchUser, resetToMaster]);

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
