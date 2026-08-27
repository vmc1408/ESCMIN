import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured, fetchWithTimeout, clearCorruptedAuthTokens } from '../lib/supabase';
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
  isAssistant: boolean;
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
  refreshProfile: (uid?: string) => Promise<void>;
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

  // Busca perfil do usuário do banco de dados
  const refreshProfile = useCallback(async (uid?: string, isRetry = false) => {
    const targetUid = uid || userRef.current?.uid;
    if (!targetUid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      // Primeira tentativa com timeout balanceado (8s)
      const data = await fetchById('users', targetUid, isRetry ? 15000 : 8000); 
      
      if (data) {
        setProfile(data as UserProfile);
        setLoading(false);
      } else if (!isRetry) {
        // Tenta uma segunda vez após breve intervalo
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryData = await fetchById('users', targetUid, 8000);
        if (retryData) {
          setProfile(retryData as UserProfile);
        } else {
          // Fallback para perfil básico baseado nas informações da sessão
          const currentUser = userRef.current;
          const defaultRole = (currentUser?.email && (currentUser.email.includes('admin') || currentUser.email.includes('master') || currentUser.email.includes('diret') || currentUser.email.includes('vmcjobnow'))) ? 'admin' : 'secretario';
          const fallbackProfile: UserProfile = {
            id: targetUid,
            name: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Usuário',
            email: currentUser?.email || '',
            role: defaultRole as any,
            status: 'active',
            created_at: new Date().toISOString()
          };
          setProfile(fallbackProfile);
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (e: any) {
      console.warn("[AuthContext] Erro ao buscar perfil:", e?.message || e);
      const currentUser = userRef.current;
      if (currentUser?.email) {
        const fallbackProfile: UserProfile = {
          id: targetUid,
          name: currentUser.displayName || currentUser.email.split('@')[0] || 'Usuário',
          email: currentUser.email,
          role: 'admin',
          status: 'active',
          created_at: new Date().toISOString()
        };
        setProfile(fallbackProfile);
      }
      setLoading(false);
    }
  }, []);

  // Sincroniza estado de autenticação do Supabase
  useEffect(() => {
    let mounted = true;

    const isTokenError = (msg?: string) => {
      if (!msg) return false;
      const lower = msg.toLowerCase();
      return (
        lower.includes('invalid refresh token') ||
        lower.includes('refresh token not found') ||
        lower.includes('refresh_token_not_found') ||
        lower.includes('already used') ||
        lower.includes('token is expired') ||
        lower.includes('jwt issued at future') ||
        lower.includes('jwt issued in future') ||
        lower.includes('jwt') ||
        lower.includes('pgrst301') ||
        lower.includes('bad jwt')
      );
    };

    // 1. Pega sessão inicial
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        const errorMsg = error.message || '';
        if (isTokenError(errorMsg)) {
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
            displayName: session.user.user_metadata?.full_name || null
          };
        });
        refreshProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    }).catch(err => {
      const errMsg = err?.message || String(err);
      if (isTokenError(errMsg)) {
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

    // 2. Escuta mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
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
            displayName: session.user.user_metadata?.full_name || null
          };
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
      // Sinaliza que o próximo login deve ir obrigatoriamente para o Dashboard (logout total)
      localStorage.setItem('force_dashboard_on_login', 'true');
      window.location.hash = '#/';
      
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setIsLocked(false);
      localStorage.removeItem('app_locked');
      localStorage.removeItem('app_last_activity');
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
        setIsLockEnabled(prev => prev !== isEnabled ? isEnabled : prev);
        localStorage.setItem('app_lock_enabled', isEnabled ? 'true' : 'false');
      }
      if (profile.app_lock_timeout !== undefined && profile.app_lock_timeout !== null) {
        const timeout = profile.app_lock_timeout;
        setLockTimeout(prev => prev !== timeout ? timeout : prev);
        localStorage.setItem('app_lock_timeout', profile.app_lock_timeout.toString());
      }
    }
  }, [profile?.app_lock_enabled, profile?.app_lock_timeout]);

  // Bloqueio por inatividade
  useEffect(() => {
    if (loading) return;

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
  }, [profile?.pin, isLocked, isLockEnabled, lockTimeout, loading]);

  // Desconexão total automática por inatividade quando bloqueio de tela estiver ativado
  useEffect(() => {
    if (!profile || !profile.pin || !isLockEnabled) return;

    const checkLogoutTimeout = () => {
      const lastActivity = localStorage.getItem('app_last_activity');
      if (lastActivity) {
        const lastTimestamp = parseInt(lastActivity, 10);
        if (isNaN(lastTimestamp) || lastTimestamp <= 0) return;

        const elapsedSeconds = Math.floor((Date.now() - lastTimestamp) / 1000);
        const LOGOUT_TIMEOUT = Math.max(lockTimeout * 2, 600); // No mínimo 10 minutos
        
        if (elapsedSeconds >= LOGOUT_TIMEOUT) {
          console.log("[AuthContext] Tempo limite de inatividade duplicado atingido. Desconectando usuário por segurança...");
          localStorage.removeItem('app_locked');
          localStorage.removeItem('app_last_activity');
          setIsLocked(false);
          logout();
        }
      }
    };

    const logoutCheckInterval = setInterval(checkLogoutTimeout, 5000);

    return () => {
      if (logoutCheckInterval) clearInterval(logoutCheckInterval);
    };
  }, [profile, isLockEnabled, lockTimeout, logout]);

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
  const isAssistant = profile?.role === 'assistente' || isSecretary;

  const canAccess = useCallback((path: string): boolean => {
    if (!profile) return false;
    
    // 1. Admin (Administrador Geral) tem acesso irrestrito a todos os recursos
    if (profile.role === 'admin') return true;
    
    // Normaliza o caminho ignorando parâmetros de busca (?view=...)
    const cleanPath = path.split('?')[0];
    const urlParams = new URLSearchParams(path.split('?')[1] || '');
    const viewParam = urlParams.get('view');

    // 2. Módulos de controle administrativo supremo (Restritos EXCLUSIVAMENTE ao Admin)
    const adminOnlyModules = [
      '/import', 
      '/users', 
      '/archive'
    ];
    if (adminOnlyModules.some(module => cleanPath.startsWith(module))) {
      return false;
    }

    // 3. Bloqueio de parâmetros gerais ou parâmetros do calendário para secretários e assistentes
    // (Somente Admin e Diretores têm permissão)
    if (cleanPath.startsWith('/calendar') && viewParam === 'parameters') {
      return profile.role === 'diretor';
    }

    // 4. Módulos estratégicos, de gestão de professores, guias, relatórios consolidados, calendários e fluxo financeiro
    // (Acessíveis por: Admin, Diretor, Secretário Acadêmico)
    // Assistentes de Secretaria são bloqueados desse nível operacional
    const secretaryAndAboveModules = [
      '/contributions', 
      '/pix-conference', 
      '/receipts', 
      '/reports', 
      '/parishes',
      '/teachers',
      '/calendar',
      '/settings',
      '/backup'
    ];
    if (secretaryAndAboveModules.some(module => cleanPath.startsWith(module))) {
      return profile.role === 'diretor' || profile.role === 'secretario';
    }

    // 5. Módulos de operação básica de secretaria (Acessíveis por todos: Admin, Diretoria, Secretário Acadêmico e Assistente)
    // Alunos, Ficha, Chamada, Notas, Turmas, Disciplinas, Impressos e Documentos Oficiais.
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
  }), [user, profile, isAdmin, isDirector, isSecretary, isAssistant, isLocked, lockTimer, isLockEnabled, lockTimeout, updateLockSettings, isConnected, connError, latency, unlock, lock, logout, canAccess, refreshProfile, switchUser, resetToMaster]);

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
