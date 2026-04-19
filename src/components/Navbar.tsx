import React, { useEffect, useState } from 'react';
import { Search, Bell, Wallet, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Navbar() {
  const [institutionName, setInstitutionName] = useState('Gestão Escolar');
  const [userName, setUserName] = useState('Admin Institucional');
  const [userRole, setUserRole] = useState('Escola');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarError, setAvatarError] = useState(false);

  const fetchInfo = async () => {
    try {
      // Fetch Institution
      const { data: instData } = await supabase
        .from('institution_settings')
        .select('name')
        .limit(1);
      if (instData && instData.length > 0) setInstitutionName(instData[0].name);

      // Fetch Current User (Mocking for now as we don't have full auth flow yet)
      const { data: userData } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .limit(1)
        .single();
      
      if (userData) {
        setUserName(userData.full_name);
        setUserRole(userData.role === 'admin' ? 'Administrador' : 
                   userData.role === 'manager' ? 'Gestor' : 
                   userData.role === 'teacher' ? 'Professor' : 'Secretaria');
        setAvatarUrl(userData.avatar_url || '');
        setAvatarError(false);
      }
    } catch (e) {
      console.error('Error fetching navbar info:', e);
    }
  };

  useEffect(() => {
    fetchInfo();

    // Listen for updates from Settings page
    const handleUpdate = () => fetchInfo();
    window.addEventListener('institution-updated', handleUpdate);
    window.addEventListener('profile-updated', handleUpdate);
    
    return () => {
      window.removeEventListener('institution-updated', handleUpdate);
      window.removeEventListener('profile-updated', handleUpdate);
    };
  }, []);

  return (
    <header className="fixed top-0 right-0 left-60 h-16 bg-white/70 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-6 z-30 print:hidden">
      <div className="flex items-center gap-8 flex-1">
        <h2 className="text-lg font-black text-[#131b2e] tracking-tight">{institutionName}</h2>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-4 text-slate-500 border-l border-slate-200 pl-5">
          <div className="relative cursor-pointer hover:text-[#497cff] transition-colors">
            <Bell size={20} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </div>
          <Wallet size={20} className="cursor-pointer hover:text-[#497cff] transition-colors" />
          
          <div className="flex items-center gap-3 ml-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-black text-[#131b2e] leading-none">{userName}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">{userRole}</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shadow-sm">
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
          </div>
        </div>
      </div>
    </header>
  );
}
