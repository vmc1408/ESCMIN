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
  CreditCard as PixIcon,
  Activity as StatusIcon,
  CheckCircle2 as OnlineIcon,
  AlertCircle as OfflineIcon,
  LogOut as LogoutIcon,
  User as UserIcon,
  UserSquare2 as UserManagementIcon,
  Calendar as CalendarIcon,
  ClipboardCheck as AttendanceIcon,
  FileSpreadsheet as GradesIcon,
  FileCheck as CertificateIcon,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Wallet,
  Church,
  XCircle,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { getInstitutionSettings } from '../lib/database';
import { motion, AnimatePresence } from 'motion/react';

import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { icon: DashboardIcon, label: 'Dashboard', path: '/' },
  {
    label: 'Gestão Escolar',
    icon: ClassesIcon,
    children: [
      { icon: Church, label: 'Diocese', path: '/parishes' },
      {
        label: 'Acadêmico',
        icon: GraduationCap,
        children: [
          { icon: StudentsIcon, label: 'Alunos', path: '/students' },
          { icon: TeachersIcon, label: 'Professores', path: '/teachers' },
          { icon: ClassesIcon, label: 'Turmas', path: '/classes' },
          { icon: SubjectsIcon, label: 'Disciplinas', path: '/subjects' },
          { icon: CalendarIcon, label: 'Calendário', path: '/calendar' },
          { icon: AttendanceIcon, label: 'Presença', path: '/attendance' },
          { 
            label: 'Notas',
            icon: GradesIcon,
            children: [
              { icon: FileText, label: 'Cadastrar Avaliação', path: '/assessments' },
              { icon: GradesIcon, label: 'Apontamento de Notas', path: '/grades' },
            ]
          },
          { icon: CertificateIcon, label: 'Documentos', path: '/documents' },
        ]
      },
      {
        label: 'Financeiro',
        icon: Wallet,
        children: [
          { icon: PixIcon, label: 'Contribuições', path: '/contributions' },
          { icon: PixIcon, label: 'Conferência Pix', path: '/pix-conference' },
        ]
      },
      { icon: ReportsIcon, label: 'Relatórios', path: '/reports' },
    ]
  },
  { icon: UserManagementIcon, label: 'Usuários', path: '/users' },
  { 
    label: 'Configurações', 
    icon: SettingsIcon,
    children: [
      { icon: SettingsIcon, label: 'Geral', path: '/settings' },
      { icon: ImportIcon, label: 'Importação', path: '/import' },
    ]
  },
];

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { financialService } from '../services/financialService';

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const { profile, logout, canAccess, isAdmin } = useAuth();

  const [logoUrl, setLogoUrl] = useState('');
  const [instName, setInstName] = useState('ESCMIN');
  const [imageError, setImageError] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Filter items based on access without modifying original objects
  const filterByAccess = (items: any[]): any[] => {
    return items
      .filter(item => {
        if (item.requiredRole && item.requiredRole === 'admin' && !isAdmin) return false;
        if (item.path && !canAccess(item.path)) return false;
        return true;
      })
      .map(item => {
        if (item.children) {
          return { ...item, children: filterByAccess(item.children) };
        }
        return { ...item };
      })
      .filter(item => {
        // If it was a group (had children), only keep it if children remain
        if (items.find(original => original.label === item.label)?.children && (!item.children || item.children.length === 0)) {
          return false;
        }
        return true;
      });
  };

  const filteredNavItems = filterByAccess(navItems);

  const checkConnection = async () => {
    try {
      // Prioritize Supabase for status check if configured
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('institution_settings').select('id').limit(1);
        
        if (!error) {
          setDbStatus('online');
          return;
        }
      }

      setDbStatus('online');
    } catch (e: any) {
      console.error('DB Status Check Error:', e);
      setDbStatus('offline');
    }
  };

  const fetchInst = async () => {
    try {
      const instData = await getInstitutionSettings();
      if (instData) {
        if (instData.name) setInstName(instData.name);
        if (instData.logo_url) {
          setLogoUrl(instData.logo_url);
          setImageError(false);
        } else {
          setLogoUrl('');
        }
      }
    } catch (e: any) {
      console.error('Error fetching sidebar info:', e);
    }
  };

  useEffect(() => {
    fetchInst();
    checkConnection();

    // Regular status check - increased interval to preserve quota
    const interval = setInterval(() => {
      console.log('Performing background connection check...');
      checkConnection();
    }, 300000); // 5 minutes instead of 30 seconds

    // Listen for updates from Settings page
    const handleUpdate = () => fetchInst();
    window.addEventListener('institution-updated', handleUpdate);
    return () => {
      window.removeEventListener('institution-updated', handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const [openGroups, setOpenGroups] = useState<string[]>(['Gestão Escolar', 'Acadêmico', 'Financeiro']);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => 
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const isPathActive = (path: string) => location.pathname === path;
  
  const isGroupActive = (item: any): boolean => {
    if (item.path && isPathActive(item.path)) return true;
    if (item.children) {
      return item.children.some((child: any) => isGroupActive(child));
    }
    return false;
  };

  const renderNavItems = (items: any[], depth = 0) => {
    return items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const isOpen = openGroups.includes(item.label);
      const isActive = item.path ? isPathActive(item.path) : isGroupActive(item);

      if (hasChildren) {
        return (
          <div key={item.label} className="space-y-0.5">
            <button
              onClick={() => toggleGroup(item.label)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg transition-all duration-200",
                isActive && !isOpen ? "bg-white/5 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-3">
                {item.icon && <item.icon size={16} className={cn(isActive ? "text-indigo-400" : "text-slate-500")} />}
                <span className={cn(
                  "text-sm font-semibold uppercase tracking-wider",
                  depth > 0 ? "text-[10px]" : "text-[11px]",
                  isActive ? "text-white" : "text-slate-400"
                )}>
                  {item.label}
                </span>
              </div>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    "space-y-0.5 mt-0.5",
                    depth === 0 ? "ml-4 border-l border-white/10 pl-2" : "ml-3 border-l border-white/5 pl-2"
                  )}>
                    {renderNavItems(item.children, depth + 1)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      }

      return (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            "flex items-center gap-3 px-3.5 py-2 rounded-lg transition-all duration-200 active:scale-95",
            isActive 
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" 
              : "text-slate-300 hover:text-white hover:bg-white/10"
          )}
        >
          {item.icon && <item.icon size={16} />}
          <span className="text-sm font-medium">{item.label}</span>
        </Link>
      );
    });
  };

  return (
    <aside className="h-full w-64 bg-[#00174b] text-white flex flex-col border-r border-white/5 print:hidden overflow-hidden shrink-0 shadow-xl">
      <div className="p-4 mb-1 bg-white/5 border-b border-white/5 relative">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden border border-white/10">
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
                <ClassesIcon size={20} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight leading-tight text-white break-words">
              {instName}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Gestão Administrativa</p>
            </div>
          </div>

          {/* Botão de Fechar Mobile */}
          {onClose && (
            <button 
              onClick={onClose}
              className="lg:hidden p-1 text-white/40 hover:text-white transition-colors"
            >
              <XCircle size={20} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-2 overflow-y-auto custom-scrollbar">
        {renderNavItems(filteredNavItems)}
      </nav>

      <div className="p-2 mt-auto space-y-1 border-t border-white/5 bg-[#00174b]">

        {/* Database Connection Indicator */}
        <div className="mx-3 mt-1 px-3 py-2 bg-black/20 rounded-lg border border-white/5 flex items-center justify-between group">
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
              "text-[9px] font-semibold uppercase tracking-wider",
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
