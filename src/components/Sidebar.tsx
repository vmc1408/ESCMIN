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
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Database,
  GraduationCap,
  Wallet,
  Church,
  XCircle,
  FileText,
  Lock,
  Printer,
  Tag,
  Archive as ArchiveIcon
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
      {
        label: 'Cadastros',
        icon: GraduationCap,
        children: [
          { icon: StudentsIcon, label: 'Alunos', path: '/students' },
          { icon: TeachersIcon, label: 'Professores', path: '/teachers' },
          { icon: ClassesIcon, label: 'Turmas', path: '/classes' },
          { icon: SubjectsIcon, label: 'Disciplinas', path: '/subjects' },
        ]
      },
      { 
        label: 'Avaliações',
        icon: GradesIcon,
        children: [
          { icon: FileText, label: 'Cadastrar Avaliação', path: '/assessments' },
          { icon: GradesIcon, label: 'Apontamento de Notas', path: '/grades' },
          { icon: FileText, label: 'Boletim de Notas', path: '/bulletin' },
          { icon: UserIcon, label: 'Ficha do Aluno', path: '/student-ficha' },
          { icon: CertificateIcon, label: 'Certificados e Diplomas', path: '/documents' },
        ]
      },
      {
        label: 'Frequência',
        icon: CalendarCheck,
        children: [
          { icon: AttendanceIcon, label: 'Chamada', path: '/attendance' },
          { icon: CalendarCheck, label: 'Lista de Chamada', path: '/monthly-attendance' },
        ]
      },
      {
        label: 'Cronograma',
        icon: CalendarIcon,
        children: [
          { icon: CalendarIcon, label: 'Calendário', path: '/calendar?view=month' },
          { icon: FileText, label: 'Grade Acadêmica', path: '/calendar?view=management' },
          { icon: SettingsIcon, label: 'Parâmetros', path: '/calendar?view=parameters' },
        ]
      },
      {
        label: 'Financeiro',
        icon: Wallet,
        children: [
          { icon: PixIcon, label: 'Contribuições', path: '/contributions' },
          { icon: PixIcon, label: 'Conferência Pix', path: '/pix-conference' },
          { icon: FileText, label: 'Recibos', path: '/receipts' },
        ]
      },
      {
        label: 'Impressos',
        icon: Printer,
        children: [
          { icon: FileText, label: 'Declaração de Matrícula', path: '/impressos?type=declaracao' },
          { icon: UserIcon, label: 'Ficha de Inscrição', path: '/impressos?type=ficha' },
          { icon: FileText, label: 'Carta de Apresentação', path: '/impressos?type=carta' },
          { icon: PixIcon, label: 'Carteirinhas do Aluno', path: '/impressos?type=carteirinhas' },
          { icon: Tag, label: 'Etiquetas de Endereço', path: '/impressos?type=etiquetas' },
          { icon: FileText, label: 'Diário de Presença', path: '/impressos?type=diario' },
          { icon: CertificateIcon, label: 'Certidão de Quitação', path: '/impressos?type=quitacao' },
        ]
      },
    ]
  },
  { icon: Church, label: 'Guia Diocese', path: '/parishes' },
  { icon: UserManagementIcon, label: 'Usuários', path: '/users' },
  { 
    label: 'Configurações', 
    icon: SettingsIcon,
    children: [
      { icon: Database, label: 'Backup', path: '/backup' },
      { icon: SettingsIcon, label: 'Geral', path: '/settings' },
      { icon: ImportIcon, label: 'Importação', path: '/import' },
      { icon: ArchiveIcon, label: 'Arquivo Morto', path: '/archive' },
    ]
  },
];

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { financialService } from '../services/financialService';

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const { profile, logout, canAccess, isAdmin, lock } = useAuth();

  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Filter items based on access without modifying original objects
  const filterByAccess = (items: any[]): any[] => {
    return items
      .filter(item => {
        if (item.requiredRole && item.requiredRole === 'admin' && !isAdmin) return false;
        if (item.path && !canAccess(item.path.split('?')[0])) return false;
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

  useEffect(() => {
    checkConnection();

    // Regular status check - increased interval to preserve quota
    const interval = setInterval(() => {
      console.log('Performing background connection check...');
      checkConnection();
    }, 300000); // 5 minutes instead of 30 seconds

    return () => {
      clearInterval(interval);
    };
  }, []);

  const [openGroups, setOpenGroups] = useState<string[]>(['Gestão Escolar', 'Cadastros', 'Avaliações', 'Frequência', 'Financeiro', 'Cronograma']);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => 
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const isPathActive = (path: string) => {
    if (path.includes('?')) {
      const [pathname, search] = path.split('?');
      if (location.pathname === pathname) {
        const currentSearch = location.search.replace('?', '');
        if (search === 'view=month' && !currentSearch) {
          return true; // monthly calendar is active if no query parameter
        }
        if (search === 'type=declaracao' && !currentSearch) {
          return true; // default impressos page is active if no query parameter
        }
        return currentSearch === search;
      }
      return false;
    }
    
    // For exact match with /settings when there are tab query params
    if (path === '/settings' && location.pathname === '/settings') {
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      return !tab || tab === 'institution';
    }

    return location.pathname === path;
  };

  // Synchronize and auto-collapse non-active submenus when a route is selected
  useEffect(() => {
    const activeAncestors: string[] = [];

    const findAncestors = (items: any[], currentPathAncestors: string[] = []): boolean => {
      for (const item of items) {
        if (item.path && isPathActive(item.path)) {
          activeAncestors.push(...currentPathAncestors);
          return true;
        }
        if (item.children) {
          if (findAncestors(item.children, [...currentPathAncestors, item.label])) {
            return true;
          }
        }
      }
      return false;
    };

    findAncestors(filteredNavItems);
    setOpenGroups(activeAncestors);
  }, [location.pathname, location.search]);
  
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
                "w-full flex items-center justify-between gap-3 px-3.5 py-1.5 rounded-md transition-all duration-200",
                isActive && !isOpen ? "bg-white/5 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-3">
                {item.icon && <item.icon size={15} className={cn(isActive ? "text-blue-400" : "text-slate-500")} />}
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  isActive ? "text-white" : "text-slate-400"
                )}>
                  {item.label}
                </span>
              </div>
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            
            <AnimatePresence mode="wait">
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    "space-y-0.5 mt-0.5",
                    depth === 0 ? "ml-4 border-l border-white/5 pl-2" : "ml-3 border-l border-white/5 pl-2"
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
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3.5 py-2 rounded-md transition-all duration-200",
            isActive 
              ? "bg-blue-600 text-white shadow-sm shadow-blue-900/15" 
              : "text-slate-300 hover:text-white hover:bg-white/5"
          )}
        >
          {item.icon && <item.icon size={15} />}
          <span className="text-[13px] font-medium">{item.label}</span>
        </Link>
      );
    });
  };

  return (
    <aside className="h-full w-60 bg-slate-900 text-white flex flex-col border-r border-slate-800 print:hidden overflow-hidden shrink-0">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.05em] text-blue-400">SISTEMA ACADEMICO ESCMIN</h2>
          <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Gestão Acadêmica</span>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="lg:hidden p-1 text-white/40 hover:text-white transition-colors"
          >
            <XCircle size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {renderNavItems(filteredNavItems)}
      </nav>

      <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col items-center">
        {/* Database Connection Indicator */}
        <div className="w-full px-3 py-2 bg-slate-900/50 border border-slate-800/80 flex items-center justify-start gap-2">
          {dbStatus === 'online' ? (
            <div className="w-2 h-2 bg-emerald-500 shrink-0"></div>
          ) : dbStatus === 'offline' ? (
            <div className="w-2 h-2 bg-red-500 shrink-0"></div>
          ) : (
            <div className="w-2 h-2 bg-yellow-500 shrink-0 animate-pulse"></div>
          )}
          <span className={cn(
            "text-[9px] font-black uppercase tracking-widest leading-none",
            dbStatus === 'online' ? "text-emerald-500" : dbStatus === 'offline' ? "text-red-500" : "text-yellow-500"
          )}>
            {dbStatus === 'online' ? 'ONLINE' : dbStatus === 'offline' ? 'OFFLINE' : 'CONECTANDO'}
          </span>
        </div>

        {/* Copyright Text */}
        <div className="text-[8px] text-slate-500 font-bold text-center mt-3 leading-normal w-full uppercase tracking-wider">
          <p>© Escmin Gestão Acadêmica</p>
          <p className="text-[7.5px] text-slate-500/80 mt-0.5">Desenvolvido por Mauricio Santos</p>
        </div>
      </div>
    </aside>
  );
}
