import React, { useEffect, useState } from 'react';
import { Search, Bell, Wallet, User, LogOut } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, limit, getDocs, orderBy } from 'firebase/firestore';
import { financialService } from '../services/financialService';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export function Navbar() {
  const { profile, logout } = useAuth();
  const [institutionName, setInstitutionName] = useState('Gestão Escolar');
  const [avatarError, setAvatarError] = useState(false);

  const fetchInstitution = async () => {
    try {
      // Fetch Institution (Prio: Supabase)
      const instSupabase = await financialService.getInstitutionSettings();
      if (instSupabase) {
        setInstitutionName(instSupabase.name);
      } else {
        const instRef = collection(db, 'institution_settings');
        const instSnap = await getDocs(query(instRef, orderBy('created_at', 'desc'), limit(1)));
        if (!instSnap.empty) setInstitutionName(instSnap.docs[0].data().name);
      }
    } catch (e) {
      console.error('Error fetching institution info:', e);
    }
  };

  useEffect(() => {
    fetchInstitution();

    // Listen for updates from Settings page
    window.addEventListener('institution-updated', fetchInstitution);
    return () => {
      window.removeEventListener('institution-updated', fetchInstitution);
    };
  }, []);

  const userName = profile?.name || 'Usuário';
  const userRole = profile?.role === 'admin' ? 'Administrador' : 
                   profile?.role === 'diretor' ? 'Diretor' : 'Secretário';
  const avatarUrl = profile?.avatar_url || '';

  return (
    <header className="h-16 bg-white/70 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-4 md:px-6 z-30 print:hidden shrink-0">
      <div className="flex items-center gap-4 md:gap-8 flex-1 min-w-0">
        <div className="lg:hidden w-10" /> {/* Espaçador para o botão de menu que está no Layout */}
        <h2 className="text-sm md:text-lg font-black text-[#131b2e] tracking-tight truncate">{institutionName}</h2>
      </div>

      <div className="flex items-center gap-2 md:gap-5">
        <div className="flex items-center gap-2 md:gap-4 text-slate-500 border-l border-slate-200 pl-3 md:pl-5">
          <div className="relative cursor-pointer hover:text-[#497cff] transition-colors hidden xs:block">
            <Bell size={20} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </div>
          <Wallet size={20} className="cursor-pointer hover:text-[#497cff] transition-colors hidden xs:block" />
          
          <div className="flex items-center gap-2 md:gap-3 ml-1 md:ml-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-black text-[#131b2e] leading-none truncate max-w-[100px]">{userName}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 truncate">{userRole}</p>
            </div>
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shadow-sm shrink-0">
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
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95 ml-1"
              title="Sair do sistema"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
