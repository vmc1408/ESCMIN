import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import { auth, saveData, deleteData, fetchById } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isDirector: boolean;
  isSecretary: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (firebaseUser: User) => {
    try {
      const { uid, email } = firebaseUser;
      const profileData = await fetchById('users', uid);
      
      if (profileData) {
        setProfile(profileData as UserProfile);
      } else if (email) {
        // UID document doesn't exist, check if there's a pre-registered document named as the email
        const emailId = email.toLowerCase().trim();
        const preRegistration = await fetchById('users', emailId);
        
        if (preRegistration) {
          const preRegData = preRegistration;
          const emailId = email.toLowerCase().trim();
          
          console.log(`Migrating pre-registration for ${emailId} to UID ${uid}`);
          
          // Found a pre-registered user! Migrate it to the UID document
          const newProfile: UserProfile = {
            ...preRegData,
            id: uid,
            uid: uid, // Explicitly set both
            email: email, // ensure correct casing from Auth
            is_pre_registered: false,
            updated_at: new Date().toISOString()
          } as any;
          
          try {
            await saveData('users', uid, newProfile);
            console.log(`New profile saved for UID ${uid}`);
            
            // Try to cleanup pre-registration doc
            // We do this AFTER saving the new one to avoid losing data if delete fails
            try {
              await deleteData('users', emailId);
              console.log(`Old pre-registration doc ${emailId} deleted`);
            } catch (deleteError) {
              console.warn("Could not delete pre-registration record, but profile is migrated:", deleteError);
            }
            
            setProfile(newProfile);
          } catch (saveError) {
            console.error("Failed to save migrated profile:", saveError);
            // If save failed, we might still have the pre-registration doc
            // We should still allow the user to see their "pre-reg" profile if possible?
            // No, better to keep profile null so they don't see inconsistent state
            setProfile(null);
          }
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser?.uid === user?.uid && profile) {
          // Already have exactly this user and profile, skip fetching again
          return;
        }

        setUser(firebaseUser);
        
        if (firebaseUser) {
          await fetchProfile(firebaseUser);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Auth state change error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user, profile, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user);
    }
  }, [user, fetchProfile]);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const isAdmin = profile?.role === 'admin';
  const isDirector = profile?.role === 'diretor';
  const isSecretary = profile?.role === 'secretario';

  const canAccess = useCallback((path: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    
    // Normalize path
    const p = path.startsWith('/') ? path : `/${path}`;

    if (profile.role === 'diretor') {
      // Diretor accesses everything EXCEPT Settings and Import
      return p !== '/import' && p !== '/settings';
    }

    if (profile.role === 'secretario') {
      // Secretario accesses Academic, PIX, Contributions, Reports, Users
      const allowed = [
        '/', 
        '/students', '/teachers', '/classes', '/subjects', // Academic
        '/pix-conference', '/contributions', // Finance
        '/reports', 
        '/users'
      ];
      return allowed.includes(p);
    }

    return false;
  }, [profile]);

  const contextValue = React.useMemo(() => ({
    user, 
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
