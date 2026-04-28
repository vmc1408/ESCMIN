import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  onAuthStateChanged as onAuthFirebase,
  User as FirebaseUser,
  signOut as signOutFirebase
} from 'firebase/auth';
import { auth as authFirebase, saveData, deleteData, fetchById } from '../lib/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, UserRole } from '../types';
import { User as SupabaseUser } from '@supabase/supabase-js';

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

  const fetchProfile = useCallback(async (appUser: AppUser) => {
    try {
      const { uid, email } = appUser;
      const profileData = await fetchById('users', uid);
      
      if (profileData) {
        setProfile(profileData as UserProfile);
      } else if (email) {
        const emailId = email.toLowerCase().trim();
        const preRegistration = await fetchById('users', emailId);
        
        if (preRegistration) {
          const newProfile: UserProfile = {
            ...preRegistration,
            id: uid,
            email: email,
            is_pre_registered: false,
            updated_at: new Date().toISOString()
          } as any;
          
          await saveData('users', uid, newProfile);
          await deleteData('users', emailId);
          setProfile(newProfile);
        } else {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    // 1. Firebase Auth listener (Legacy/Migration)
    const unsubscribeFirebase = onAuthFirebase(authFirebase, async (fbUser) => {
      if (fbUser) {
        const mappedUser: AppUser = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL
        };
        setUser(mappedUser);
        await fetchProfile(mappedUser);
        setLoading(false);
      } else {
        // If no Firebase user, check Supabase
        if (isSupabaseConfigured) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const mappedUser: AppUser = {
              uid: session.user.id,
              email: session.user.email || null,
              displayName: session.user.user_metadata?.full_name,
              photoURL: session.user.user_metadata?.avatar_url
            };
            setUser(mappedUser);
            await fetchProfile(mappedUser);
          } else {
            setUser(null);
            setProfile(null);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      }
    });

    // 2. Supabase Auth listener (New)
    let authSubscription: any;
    if (isSupabaseConfigured) {
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
      authSubscription = subscription;
    }

    return () => {
      unsubscribeFirebase();
      if (authSubscription) authSubscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user);
    }
  }, [user, fetchProfile]);

  const logout = useCallback(async () => {
    await signOutFirebase(authFirebase);
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
  }, []);

  const isAdmin = profile?.role === 'admin';
  const isDirector = profile?.role === 'diretor';
  const isSecretary = profile?.role === 'secretario';

  const canAccess = useCallback((path: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    const p = path.startsWith('/') ? path : `/${path}`;
    if (profile.role === 'diretor') return p !== '/import' && p !== '/settings' && p !== '/users';
    if (profile.role === 'secretario') {
      const allowed = [
        '/', 
        '/students', 
        '/teachers', 
        '/classes', 
        '/subjects', 
        '/calendar', 
        '/attendance', 
        '/grades', 
        '/documents',
        '/parishes',
        '/pix-conference', 
        '/contributions', 
        '/reports'
      ];
      return allowed.includes(p);
    }
    return false;
  }, [profile]);

  const contextValue = React.useMemo(() => ({
    user, 
    userAuth: user,
    profile, 
    loading, 
    isAdmin, 
    isDirector, 
    isSecretary, 
    logout,
    canAccess,
    refreshProfile
  }), [user, profile, loading, isAdmin, isDirector, isSecretary, logout, canAccess, refreshProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {!loading && children}
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
