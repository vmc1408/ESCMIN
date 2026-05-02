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
  isLocked: boolean;
  unlock: (pin: string) => boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canAccess: (path: string) => boolean;
  userAuth: AppUser | null; // Legacy support
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  // Check locking state on profile load
  useEffect(() => {
    if (profile?.pin) {
      const sessionUnlocked = sessionStorage.getItem(`unlocked-${profile.id}`);
      if (!sessionUnlocked) {
        setIsLocked(true);
      }
    } else {
      setIsLocked(false);
    }
  }, [profile]);

  const unlock = useCallback((pin: string): boolean => {
    if (profile && profile.pin === pin) {
      setIsLocked(false);
      sessionStorage.setItem(`unlocked-${profile.id}`, 'true');
      return true;
    }
    return false;
  }, [profile]);

  const fetchProfile = useCallback(async (appUser: AppUser) => {
    const { uid, email } = appUser;
    if (!uid) return;

    // 1. CARGA RÁPIDA: Tenta do localStorage IMEDIATAMENTE
    const cacheKey = `auth-profile-cache-${uid}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setProfile(parsed);
      } catch (e) {
        console.warn("[AuthContext] Erro ao ler cache de perfil:", e);
      }
    }

    try {
      // 2. BUSCA EM SEGUNDO PLANO
      let profileData = await fetchById('users', uid);
      
      // Fallback to email if not found by ID (for manually migrated/created users)
      if (!profileData && email) {
        const emailLower = email.toLowerCase().trim();
        const { data: byEmail, error: emailErr } = await supabase
          .from('users')
          .select('*')
          .ilike('email', emailLower)
          .maybeSingle();
        
        if (byEmail) {
          console.log(`[AuthContext] Perfil encontrado por e-mail (${emailLower}), sincronizando ID...`);
          profileData = byEmail;
          
          if (byEmail.id !== uid) {
            try {
              const updatedProfile = { 
                ...byEmail, 
                id: uid, 
                updated_at: new Date().toISOString(),
                is_pre_registered: false 
              };
              const oldId = byEmail.id;
              await supabase.from('users').delete().eq('id', oldId);
              await saveData('users', uid, updatedProfile);
            } catch (syncErr: any) {
              console.error("[AuthContext] Erro ao sincronizar ID:", syncErr.message);
            }
          }
        }
      }
      
      if (profileData) {
        const updated = profileData as UserProfile;
        setProfile(updated);
        localStorage.setItem(cacheKey, JSON.stringify(updated));
      } else if (email) {
        // Lógica de pré-registro
        const emailLower = email.toLowerCase().trim();
        const { data: preRegistration } = await supabase
          .from('email_registry')
          .select('*')
          .ilike('email', emailLower)
          .maybeSingle();
        
        if (preRegistration) {
          const newProfile: UserProfile = {
            id: uid,
            email: email,
            name: preRegistration.name || email.split('@')[0],
            role: preRegistration.role || 'secretario',
            status: 'active',
            updated_at: new Date().toISOString()
          } as any;
          
          await saveData('users', uid, newProfile);
          await deleteData('email_registry', emailLower);
          setProfile(newProfile);
          localStorage.setItem(cacheKey, JSON.stringify(newProfile));
        }
      }
    } catch (error) {
      console.warn("[AuthContext] Erro ao atualizar perfil em 2º plano:", error);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Initialize session
    const initSession = async () => {
      // 1. CARGA RÁPIDA DE CACHE
      const cachedUserJson = localStorage.getItem('auth-user-cache');
      if (cachedUserJson) {
        try {
          const u = JSON.parse(cachedUserJson);
          setUser(u);
          fetchProfile(u);
          setLoading(false); // Libera rápido se tem cache
        } catch (e) {}
      }

      try {
        if (!isSupabaseConfigured) {
          setLoading(false);
          return;
        }

        // Tenta obter sessão com timeout curto para não travar o boot
        const result = await fetchWithTimeout(supabase.auth.getSession(), 8000);
        
        const session = result?.data?.session;
        if (session?.user) {
          const mappedUser: AppUser = {
            uid: session.user.id,
            email: session.user.email || null,
            displayName: session.user.user_metadata?.full_name,
            photoURL: session.user.user_metadata?.avatar_url
          };
          setUser(mappedUser);
          localStorage.setItem('auth-user-cache', JSON.stringify(mappedUser));
          await fetchProfile(mappedUser);
        } else {
          localStorage.removeItem('auth-user-cache');
        }
      } catch (err: any) {
        console.warn("[AuthContext] Sessão remota indisponível:", err.message);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session?.user) {
          const mappedUser: AppUser = {
            uid: session.user.id,
            email: session.user.email || null,
            displayName: session.user.user_metadata?.full_name,
            photoURL: session.user.user_metadata?.avatar_url
          };
          setUser(mappedUser);
          await fetchProfile(mappedUser);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user);
    }
  }, [user, fetchProfile]);

  const logout = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
  }, []);

  const isAdmin = !profile || profile?.role === 'admin';
  const isDirector = profile?.role === 'diretor';
  const isSecretary = profile?.role === 'secretario';

  const canAccess = useCallback((path: string): boolean => {
    // LOGIN TEMPORARILY DISABLED BY USER REQUEST - ALL ACCESS GRANTED
    return true;
  }, []);

  const contextValue = React.useMemo(() => ({
    user: user || { uid: 'bypass-uid', email: 'bypass@example.com', displayName: 'Administrador (Bypass)' }, 
    userAuth: user || { uid: 'bypass-uid', email: 'bypass@example.com', displayName: 'Administrador (Bypass)' },
    profile: profile || ({
      id: 'bypass-uid',
      name: 'Administrador (Bypass)',
      role: 'admin',
      status: 'active',
      email: 'bypass@example.com'
    } as any), 
    loading: loading, 
    isAdmin: !profile || profile?.role === 'admin', 
    isDirector: profile?.role === 'diretor', 
    isSecretary: profile?.role === 'secretario', 
    isLocked,
    unlock,
    logout,
    canAccess,
    refreshProfile
  }), [user, profile, loading, isLocked, unlock, logout, canAccess, refreshProfile]);

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
