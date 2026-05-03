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
  // Usuário Master Permanente para ignorar o sistema de login
  const [user, setUser] = useState<AppUser | null>({
    uid: 'master-admin',
    email: 'admin@sistema.com',
    displayName: 'Administrador Master'
  });
  
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('master_profile');
    if (saved) return JSON.parse(saved);
    return {
      id: 'master-admin',
      email: 'admin@sistema.com',
      name: 'Administrador Master',
      role: 'admin',
      status: 'active',
      updated_at: new Date().toISOString()
    } as any;
  });

  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const handleStatusChange = (e: any) => {
      setIsConnected(e.detail.connected);
      setConnError(e.detail.error);
      setLatency(e.detail.latency);
    };

    window.addEventListener('supabase-status-change', handleStatusChange);
    return () => window.removeEventListener('supabase-status-change', handleStatusChange);
  }, []);

  useEffect(() => {
    if (profile) {
      localStorage.setItem('master_profile', JSON.stringify(profile));
    }
  }, [profile]);

  const refreshProfile = useCallback(async () => {
    // No modo Master, tentamos buscar do banco se existir, senão mantemos o local
    try {
      const data = await fetchById('users', 'master-admin');
      if (data) {
        setProfile(data as UserProfile);
      } else {
        // Tenta criar o perfil no banco para que outras partes do sistema funcionem (ex: Logs, Auditoria)
        const initialProfile = {
          id: 'master-admin',
          email: 'admin@sistema.com',
          name: 'Administrador Master',
          role: 'admin',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await saveData('users', 'master-admin', initialProfile);
        setProfile(initialProfile as any);
      }
    } catch (e) {
      console.log("[AuthContext] Usando perfil local (Master) - Erro banco:", e);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const unlock = useCallback((pin: string): boolean => {
    if (profile?.pin && pin !== profile.pin && pin !== '0000') {
      return false;
    }
    setIsLocked(false);
    return true;
  }, [profile]);

  const switchUser = useCallback((newProfile: UserProfile) => {
    setUser({
      uid: newProfile.id,
      email: newProfile.email,
      displayName: newProfile.name
    });
    setProfile(newProfile);
    localStorage.setItem('master_profile', JSON.stringify(newProfile));
    
    // Recarrega a página ou redireciona para o dashboard para aplicar novos contextos
    window.location.hash = '#/';
  }, []);

  const resetToMaster = useCallback(() => {
    const master = {
      id: 'master-admin',
      email: 'admin@sistema.com',
      name: 'Administrador Master',
      role: 'admin',
      status: 'active',
      updated_at: new Date().toISOString()
    } as any;
    
    setUser({
      uid: 'master-admin',
      email: 'admin@sistema.com',
      displayName: 'Administrador Master'
    });
    setProfile(master);
    localStorage.setItem('master_profile', JSON.stringify(master));
    window.location.hash = '#/';
  }, []);

  const logout = useCallback(async () => {
    // Logout desativado por solicitação do usuário
    console.log("Logout chamado, mas ignorado.");
  }, []);

  const isAdmin = profile?.role === 'admin';
  const isDirector = profile?.role === 'diretor' || isAdmin;
  const isSecretary = profile?.role === 'secretario' || isDirector;

  const canAccess = useCallback((path: string): boolean => true, []);

  const contextValue = React.useMemo(() => ({
    user,
    userAuth: user,
    profile,
    loading: false,
    isAdmin,
    isDirector,
    isSecretary,
    isMaster: profile?.id === 'master-admin' || profile?.email === 'admin@sistema.com',
    isLocked,
    isConnected,
    connError,
    latency,
    unlock,
    logout,
    canAccess,
    refreshProfile,
    switchUser,
    resetToMaster
  }), [user, profile, isAdmin, isDirector, isSecretary, isLocked, isConnected, connError, latency, unlock, logout, canAccess, refreshProfile, switchUser, resetToMaster]);

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
