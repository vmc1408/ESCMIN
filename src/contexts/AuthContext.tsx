import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
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

  const fetchProfile = async (firebaseUser: User) => {
    try {
      const { uid, email } = firebaseUser;
      const profileDoc = await getDoc(doc(db, 'users', uid));
      
      if (profileDoc.exists()) {
        setProfile(profileDoc.data() as UserProfile);
      } else if (email) {
        // UID document doesn't exist, check if there's a pre-registered document named as the email
        const emailDocRef = doc(db, 'users', email.toLowerCase().trim());
        const emailDoc = await getDoc(emailDocRef);
        
        if (emailDoc.exists()) {
          const preRegData = emailDoc.data();
          // Found a pre-registered user! Migrate it to the UID document
          const newProfile: UserProfile = {
            ...preRegData,
            id: uid,
            email: email, // ensure correct casing
            is_pre_registered: false,
            updated_at: new Date().toISOString()
          } as any;
          
          await setDoc(doc(db, 'users', uid), newProfile);
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
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        await fetchProfile(firebaseUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isAdmin = profile?.role === 'admin';
  const isDirector = profile?.role === 'diretor';
  const isSecretary = profile?.role === 'secretario';

  const canAccess = (path: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    
    // Normalize path
    const p = path.startsWith('/') ? path : `/${path}`;

    if (profile.role === 'diretor') {
      return p !== '/import';
    }

    if (profile.role === 'secretario') {
      const allowed = [
        '/', '/students', '/teachers', '/classes', '/subjects', 
        '/parishes', '/reports', '/contributions', '/users'
      ];
      return allowed.includes(p);
    }

    return false;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAdmin, 
      isDirector, 
      isSecretary, 
      logout,
      canAccess,
      refreshProfile
    }}>
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
