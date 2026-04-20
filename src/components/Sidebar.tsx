import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard as DashboardIcon, 
  Upload as ImportIcon, 
  Users as StudentsIcon,
  UserSquare2 as TeachersIcon,
  School as ClassesIcon,
  BookOpen as SubjectsIcon,
  BarChart3 as ReportsIcon, 
  Settings as SettingsIcon, 
  HelpCircle as SupportIcon,
  CreditCard as PixIcon,
  Activity as StatusIcon,
  CheckCircle2 as OnlineIcon,
  AlertCircle as OfflineIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const navItems = [
  { icon: DashboardIcon, label: 'Dashboard', path: '/' },
  { icon: ImportIcon, label: 'Importação', path: '/import' },
  { icon: StudentsIcon, label: 'Alunos', path: '/students' },
  { icon: TeachersIcon, label: 'Professores', path: '/teachers' },
  { icon: ClassesIcon, label: 'Turmas', path: '/classes' },
  { icon: SubjectsIcon, label: 'Disciplinas', path: '/subjects' },
  { icon: ReportsIcon, label: 'Relatórios', path: '/reports' },
  { icon: PixIcon, label: 'Contribuições', path: '/contributions' },
  { icon: SettingsIcon, label: 'Configurações', path: '/settings' },
];

export function Sidebar() {
  const location = useLocation();
  const [logoUrl, setLogoUrl] = useState('');
  const [instName, setInstName] = useState('ESCMIN');
  const [imageError, setImageError] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkConnection = async () => {
    try {
      // Small query to verify connection
      const { error } = await supabase.from('institution_settings').select('id').limit(1);
      if (error) throw error;
      setDbStatus('online');
    } catch (e) {
      console.error('DB Status Check Error:', e);
      setDbStatus('offline');
    }
  };

  const fetchInst = async () => {
    try {
      const { data } = await supabase
        .from('institution_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        const inst = data[0];
        if (inst.name) setInstName(inst.name);
        if (inst.logo_url) {
          setLogoUrl(inst.logo_url);
          setImageError(false);
        } else {
          setLogoUrl('');
        }
      }
    } catch (e) {
      console.error('Error fetching sidebar info:', e);
    }
  };

  useEffect(() => {
    fetchInst();
    checkConnection();

    // Regular status check
    const interval = setInterval(checkConnection, 30000);

    // Listen for updates from Settings page
    const handleUpdate = () => fetchInst();
    window.addEventListener('institution-updated', handleUpdate);
    return () => {
      window.removeEventListener('institution-updated', handleUpdate);
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#00174b] text-white z-40 shadow-xl flex flex-col border-r border-white/5 print:hidden">
      <div className="p-3 mb-1 bg-white/5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center overflow-hidden border border-white/20 shadow-2xl">
            {logoUrl && !imageError ? (
              <img 
                src={logoUrl} 
                alt="Logo"
                className="w-full h-full object-contain p-1"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <ClassesIcon size={18} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            <h1 className="text-sm font-black tracking-tight leading-tight text-white break-words">
              {instName}
            </h1>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></div>
              <p className="text-[8px] font-black text-blue-400/80 uppercase tracking-widest">Painel Gestor</p>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2 rounded-xl transition-all duration-200 active:scale-95",
                isActive 
                  ? "bg-[#497cff] text-white shadow-lg shadow-blue-500/20" 
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              )}
            >
              <item.icon size={16} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-2 mt-auto space-y-1 border-t border-white/5 bg-[#00174b]">
        <Link 
          to="/pix-conference"
          className="w-full py-2 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center justify-center gap-2 active:scale-95 uppercase tracking-wider"
        >
          <PixIcon size={16} />
          Conferência de Pix
        </Link>
        <Link to="/support" className="flex items-center gap-3 text-slate-400 hover:text-white px-3.5 py-1.5 transition-colors text-xs font-bold uppercase tracking-widest text-center">
          <SupportIcon size={16} />
          <span>Suporte</span>
        </Link>

        {/* Database Connection Indicator */}
        <div className="mx-3 mt-1 px-3 py-2 bg-black/20 rounded-xl border border-white/5 flex items-center justify-between group">
          <div className="flex items-center gap-2">
            {dbStatus === 'online' ? (
              <div className="relative">
                <OnlineIcon size={14} className="text-emerald-400" />
                <span className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-25"></span>
              </div>
            ) : dbStatus === 'offline' ? (
              <OfflineIcon size={14} className="text-red-400" />
            ) : (
              <StatusIcon size={14} className="text-slate-500 animate-pulse" />
            )}
            <span className={cn(
              "text-[9px] font-black uppercase tracking-wider",
              dbStatus === 'online' ? "text-emerald-400/80" : dbStatus === 'offline' ? "text-red-400/80" : "text-slate-500"
            )}>
              {dbStatus === 'online' ? 'Sistema Online' : dbStatus === 'offline' ? 'Banco Offline' : 'Verificando...'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className={cn(
              "w-1 h-1 rounded-full",
              dbStatus === 'online' ? "bg-emerald-400" : dbStatus === 'offline' ? "bg-red-400" : "bg-slate-500"
            )}></div>
          </div>
        </div>
      </div>
    </aside>
  );
}
